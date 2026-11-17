export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { username?: string };
  identities: Array<{ provider: string }>;
};

export type AuthSession = {
  access_token: string;
  token_type: "bearer";
  user: AuthUser;
};

const TOKEN_KEY = "tinki_access_token";
const IDB_NAME = "tinki_auth_db";
const IDB_STORE = "kv";

type AuthListener = (session: AuthSession | null) => void;
const listeners = new Set<AuthListener>();

let memoryToken: string | null = null;

function openAuthIdb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readTokenFromIdb(): Promise<string | null> {
  const idb = await openAuthIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(TOKEN_KEY);
      req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeTokenToIdb(token: string | null): Promise<void> {
  const idb = await openAuthIdb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      if (token) store.put(token, TOKEN_KEY);
      else store.delete(TOKEN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  if (memoryToken) return memoryToken;
  try {
    const lsToken = window.localStorage.getItem(TOKEN_KEY);
    if (lsToken) {
      memoryToken = lsToken;
      return lsToken;
    }
  } catch {
    /* storage unavailable */
  }
  return null;
}

export async function hydrateStoredToken(): Promise<string | null> {
  const existing = getStoredToken();
  if (existing) return existing;
  const fromIdb = await readTokenFromIdb();
  if (fromIdb) {
    memoryToken = fromIdb;
    try {
      window.localStorage.setItem(TOKEN_KEY, fromIdb);
    } catch {
      /* ignore */
    }
    return fromIdb;
  }
  return null;
}

export function setStoredToken(token: string | null) {
  memoryToken = token;
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
  void writeTokenToIdb(token);
}

export function notifyAuthListeners(session: AuthSession | null) {
  for (const listener of listeners) {
    listener(session);
  }
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export class ApiError extends Error {
  status: number;
  code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getStoredToken() ?? (await hydrateStoredToken());
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
  }

  if (!response.ok) {
    const message =
      typeof parsed["error"] === "string" ? parsed["error"] : `Request failed (${response.status})`;
    const code = typeof parsed["code"] === "string" ? parsed["code"] : undefined;
    throw new ApiError(message, response.status, code);
  }

  return parsed as T;
}

export const authApi = {
  async getSession(): Promise<AuthSession | null> {
    if (typeof window === "undefined") return null;
    await hydrateStoredToken();
    try {
      const data = await apiFetch<{ session: AuthSession | null }>("/api/auth/session");
      if (data.session?.access_token) {
        setStoredToken(data.session.access_token);
      }
      return data.session;
    } catch {
      return null;
    }
  },

  async signUp(input: { email: string; password: string; username: string }): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setStoredToken(data.session.access_token);
    notifyAuthListeners(data.session);
    return data.session;
  },

  async checkSignupAvailable(input: { email: string; username: string }): Promise<void> {
    await apiFetch<{ ok: boolean }>("/api/auth/check-signup", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async registerPendingSignup(input: {
    email: string;
    password: string;
    username: string;
  }): Promise<{ pending: { email: string; username: string } }> {
    return apiFetch<{ pending: { email: string; username: string } }>("/api/auth/register-pending", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async confirmEmailSignup(idToken: string, username?: string): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/confirm-email", {
      method: "POST",
      body: JSON.stringify({ idToken, ...(username ? { username } : {}) }),
    });
    setStoredToken(data.session.access_token);
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signInWithPassword(input: { email: string; password: string }): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setStoredToken(data.session.access_token);
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signInWithGoogle(idToken: string): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    setStoredToken(data.session.access_token);
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signOut(): Promise<void> {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } finally {
      setStoredToken(null);
      notifyAuthListeners(null);
    }
  },

  async updatePassword(input: { password: string; currentPassword?: string }): Promise<void> {
    const data = await apiFetch<{ session?: AuthSession }>("/api/auth/update-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (data.session) {
      setStoredToken(data.session.access_token);
      notifyAuthListeners(data.session);
    }
  },

  async requestPasswordReset(email: string): Promise<{ ok: boolean; resetToken?: string }> {
    return apiFetch<{ ok: boolean; resetToken?: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async confirmPasswordReset(input: { token: string; password: string }): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setStoredToken(data.session.access_token);
    notifyAuthListeners(data.session);
    return data.session;
  },

  async deleteAccount(input: { username: string; password?: string }): Promise<void> {
    const { auth: fbAuth, deleteAccountFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      await deleteAccountFirestore().catch(() => undefined);
    }
    await apiFetch("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify(input),
    });
    setStoredToken(null);
    notifyAuthListeners(null);
  },
};

export const storageApi = {
  mediaUrl(bucket: "avatars" | "covers" | "backgrounds", path: string): string {
    return `/media/${bucket}/${path}`;
  },

  async upload(
    bucket: "avatars" | "covers" | "backgrounds",
    path: string,
    body: Blob,
    contentType: string,
  ): Promise<string> {
    const { auth: fbAuth, uploadMediaFirestore } = await import("@/lib/firestore-repository");
    const ownerId = path.split("/")[0];

    if (fbAuth.currentUser && fbAuth.currentUser.uid === ownerId) {
      await uploadMediaFirestore(bucket, path, body, contentType);
    }

    const headers = new Headers();
    const token = getStoredToken() ?? (await hydrateStoredToken());
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Content-Type", contentType || body.type || "application/octet-stream");

    try {
      const response = await fetch(
        `/api/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(path)}`,
        {
          method: "POST",
          headers,
          body,
          credentials: "include",
        },
      );
      if (!response.ok && !(fbAuth.currentUser && fbAuth.currentUser.uid === ownerId)) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Upload failed");
      }
    } catch (err) {
      if (!(fbAuth.currentUser && fbAuth.currentUser.uid === ownerId)) {
        throw err instanceof Error ? err : new Error("Upload failed");
      }
    }

    return path;
  },

  async list(
    bucket: "avatars" | "covers" | "backgrounds",
  ): Promise<Array<{ id: string; name: string }>> {
    const { auth: fbAuth, listMediaFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      try {
        return await listMediaFirestore(bucket);
      } catch {
        /* fallback to server list */
      }
    }
    const data = await apiFetch<{ files: Array<{ id: string; name: string }> }>(
      `/api/storage/${encodeURIComponent(bucket)}/list`,
    );
    return data.files;
  },

  async remove(bucket: "avatars" | "covers" | "backgrounds", paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const { auth: fbAuth, removeMediaFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      await removeMediaFirestore(bucket, paths).catch(() => undefined);
    }
    await apiFetch(`/api/storage/${encodeURIComponent(bucket)}/remove`, {
      method: "POST",
      body: JSON.stringify({ paths }),
    }).catch(() => undefined);
  },
};
