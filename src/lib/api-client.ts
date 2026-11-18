export type AuthUser = {
  id: string;
  email: string;
  user_metadata: { username?: string };
  identities: Array<{ provider: string }>;
};

export type AuthSession = {
  user: AuthUser;
  expires_at?: number;
};

type AuthListener = (session: AuthSession | null) => void;
const listeners = new Set<AuthListener>();

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
  const method = (init.method ?? "GET").toUpperCase();
  if (
    ((init.body && typeof init.body === "string") ||
      method === "POST" ||
      method === "PATCH" ||
      method === "PUT" ||
      method === "DELETE") &&
    !headers.has("Content-Type")
  ) {
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
    try {
      const data = await apiFetch<{ session: AuthSession | null }>("/api/auth/session");
      return data.session;
    } catch {
      return null;
    }
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
    return apiFetch<{ pending: { email: string; username: string } }>(
      "/api/auth/register-pending",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  },

  async confirmEmailSignup(idToken: string, username?: string): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/confirm-email", {
      method: "POST",
      body: JSON.stringify({ idToken, ...(username ? { username } : {}) }),
    });
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signInWithPassword(input: { email: string; password: string }): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signInWithGoogle(idToken: string): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken }),
    });
    notifyAuthListeners(data.session);
    return data.session;
  },

  async signOut(): Promise<void> {
    try {
      await apiFetch("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } finally {
      notifyAuthListeners(null);
    }
  },

  async updatePassword(input: { password: string; currentPassword?: string }): Promise<void> {
    try {
      const data = await apiFetch<{ session?: AuthSession }>("/api/auth/update-password", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (data.session) {
        notifyAuthListeners(data.session);
      }
      return;
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "local_store_disabled")) {
        throw err;
      }
    }

    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } =
      await import("firebase/auth");
    const { auth: fbAuth } = await import("@/lib/firestore-repository");
    const fbUser = fbAuth.currentUser;
    if (!fbUser) {
      throw new Error("Please log in again before updating your password");
    }
    if (input.currentPassword && fbUser.email) {
      const cred = EmailAuthProvider.credential(fbUser.email, input.currentPassword);
      await reauthenticateWithCredential(fbUser, cred);
    }
    await updatePassword(fbUser, input.password);
  },

  async requestPasswordReset(
    email: string,
    options?: { clientDispatched?: boolean },
  ): Promise<{ ok: boolean }> {
    try {
      return await apiFetch<{ ok: boolean }>("/api/auth/forgot-password", {
        method: "POST",
        ...(options?.clientDispatched ? { headers: { "x-reset-email-dispatched": "client" } } : {}),
        body: JSON.stringify({ email }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === "local_store_disabled") {
        return { ok: true };
      }
      throw err;
    }
  },

  async confirmPasswordReset(input: { token: string; password: string }): Promise<AuthSession> {
    const data = await apiFetch<{ session: AuthSession }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
    notifyAuthListeners(data.session);
    return data.session;
  },

  async deleteAccount(input: {
    username: string;
    password?: string;
    idToken?: string;
  }): Promise<void> {
    await apiFetch("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify(input),
    });
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
      return path;
    }

    const headers = new Headers();
    headers.set("Content-Type", contentType || body.type || "application/octet-stream");

    const response = await fetch(
      `/api/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(path)}`,
      {
        method: "POST",
        headers,
        body,
        credentials: "include",
      },
    );
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Upload failed");
    }
    try {
      const data = (await response.json()) as { path?: string };
      if (typeof data.path === "string" && data.path) {
        return data.path;
      }
    } catch {
      /* fall back to original path */
    }
    return path;
  },

  async list(
    bucket: "avatars" | "covers" | "backgrounds",
  ): Promise<Array<{ id: string; name: string }>> {
    const { auth: fbAuth, listMediaFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      return await listMediaFirestore(bucket);
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
      await removeMediaFirestore(bucket, paths);
      return;
    }
    await apiFetch(`/api/storage/${encodeURIComponent(bucket)}/remove`, {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
  },
};
