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

type AuthListener = (session: AuthSession | null) => void;
const listeners = new Set<AuthListener>();

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
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
  const token = getStoredToken();
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
    try {
      const data = await apiFetch<{ session: AuthSession | null }>("/api/auth/session");
      if (!data.session) setStoredToken(null);
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
    const headers = new Headers();
    const token = getStoredToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
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
    const data = (await response.json()) as { path?: string; error?: string };
    if (!response.ok || !data.path) {
      throw new Error(data.error ?? "Upload failed");
    }
    return data.path;
  },

  async list(
    bucket: "avatars" | "covers" | "backgrounds",
  ): Promise<Array<{ id: string; name: string }>> {
    const data = await apiFetch<{ files: Array<{ id: string; name: string }> }>(
      `/api/storage/${encodeURIComponent(bucket)}/list`,
    );
    return data.files;
  },

  async remove(bucket: "avatars" | "covers" | "backgrounds", paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    await apiFetch(`/api/storage/${encodeURIComponent(bucket)}/remove`, {
      method: "POST",
      body: JSON.stringify({ paths }),
    });
  },
};
