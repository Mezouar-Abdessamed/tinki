import { afterEach, describe, expect, it, vi } from "vitest";

import { handleApiOrMediaRequest, resetApiRateLimits } from "../src/server/api-router.server";
import { resetSharedStoreForTests } from "../src/server/local-fallback-store.server";
import { mapFirebaseAuthError } from "../src/lib/firebase-auth-helpers";

describe("Default Firebase/Firestore mode auth routes & client flows (!ENABLE_LOCAL_STORE)", () => {
  const prevEnableLocal = process.env["ENABLE_LOCAL_STORE"];
  const prevNodeEnv = process.env["NODE_ENV"];

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetApiRateLimits();
    resetSharedStoreForTests();

    if (prevEnableLocal === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevEnableLocal;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
  });

  it("handles POST /api/auth/forgot-password with 200 { ok: true } and rate limiting without local store", async () => {
    delete process.env["ENABLE_LOCAL_STORE"];
    const limiterClock = 1_890_000_000_000;
    const sent: Array<{ email: string; continueUrl?: string }> = [];

    for (let i = 0; i < 5; i++) {
      const res = (await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/auth/forgot-password", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "198.51.100.55",
          },
          body: JSON.stringify({ email: i === 0 ? "  User@Example.COM " : "other@example.com" }),
        }),
        {
          nowMs: () => limiterClock,
          sendPasswordResetEmail: async (email, continueUrl) => {
            sent.push({ email, ...(continueUrl ? { continueUrl } : {}) });
          },
        },
      ))!;
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }

    expect(sent[0]).toEqual({
      email: "user@example.com",
      continueUrl: "http://localhost:3000/reset-password",
    });

    // 6th request in the same hour hits IP rate limit (429)
    const blocked = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "198.51.100.55",
        },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
      { nowMs: () => limiterClock },
    ))!;
    expect(blocked.status).toBe(429);
  });

  it("handles POST /api/auth/google cleanly in !localStoreEnabled mode and exposes x-local-store only when enabled", async () => {
    delete process.env["ENABLE_LOCAL_STORE"];

    const fbSessionRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", { method: "GET" }),
    ))!;
    expect(fbSessionRes.status).toBe(200);
    expect(fbSessionRes.headers.get("x-local-store")).toBeNull();
    expect(await fbSessionRes.json()).toEqual({ session: null });

    const googleRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "valid-firebase-token" }),
      }),
      {
        verifyFirebaseToken: async () => ({
          uid: "uid-google-1",
          email: "Creator@Example.com",
          signInProvider: "google.com",
        }),
      },
    ))!;
    expect(googleRes.status).toBe(200);
    expect(await googleRes.json()).toMatchObject({
      session: {
        user: {
          id: "uid-google-1",
          email: "creator@example.com",
          identities: [{ provider: "google" }],
        },
      },
      user: {
        id: "uid-google-1",
        email: "creator@example.com",
        identities: [{ provider: "google" }],
      },
    });
  });

  it("authApi.updatePassword prioritizes Firebase currentUser without 503, maps wrong current password, and refreshes email identity", async () => {
    vi.resetModules();

    const providers = [{ providerId: "google.com" }];
    const mockUser = {
      uid: "uid-fb-pw",
      email: "user@example.com",
      providerData: providers,
      getIdToken: async () => "id-token-pw",
      reload: vi.fn(async () => {
        if (!providers.some((p) => p.providerId === "password")) {
          providers.push({ providerId: "password" });
        }
      }),
    };

    const reauthSpy = vi.fn(async () => {});
    const updatePwSpy = vi.fn(async () => {});
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/auth/session") {
        return new Response(JSON.stringify({ session: null }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "/api/auth/google") {
        return new Response(
          JSON.stringify({
            session: {
              user: {
                id: mockUser.uid,
                email: mockUser.email,
                user_metadata: {},
                identities: [{ provider: "google" }],
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("firebase/auth", async (importOriginal) => {
      const actual = await importOriginal<typeof import("firebase/auth")>();
      return {
        ...actual,
        EmailAuthProvider: {
          credential: vi.fn((email: string, pw: string) => ({ email, pw })),
        },
        reauthenticateWithCredential: reauthSpy,
        updatePassword: updatePwSpy,
      };
    });

    vi.doMock("@/lib/firestore-repository", () => ({
      auth: { currentUser: mockUser },
      checkUsernameAvailableFirestore: vi.fn(),
      createCustomLinkFirestore: vi.fn(),
      createProfileFirestore: vi.fn(),
      fetchProfileByIdFirestore: vi.fn(async () => ({ id: mockUser.uid, username: "creator" })),
      getFirebaseClientAuth: () => ({ currentUser: mockUser }),
      saveSocialLinkSettingsFirestore: vi.fn(),
      syncFirebaseAccountDoc: vi.fn(async () => {}),
      uploadMediaFirestore: vi.fn(),
    }));

    const { authApi, subscribeAuth } = await import("../src/lib/api-client");
    const observedSessions: Array<unknown> = [];
    const unsub = subscribeAuth((s) => observedSessions.push(s));

    // Initial password link on a Google account: skips /api/auth/update-password, reloads & updates identities
    await authApi.updatePassword({ password: "NewPassword123!" });
    expect(updatePwSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/auth/update-password", expect.anything());

    const lastSession = observedSessions[observedSessions.length - 1] as {
      user: { identities: Array<{ provider: string }> };
    };
    expect(lastSession.user.identities.map((i) => i.provider)).toEqual(["google", "email"]);

    // Wrong current password triggers "Your current password is incorrect"
    reauthSpy.mockRejectedValueOnce({ code: "auth/invalid-credential" });
    await expect(
      authApi.updatePassword({ password: "AnotherPass123!", currentPassword: "WrongPassword" }),
    ).rejects.toThrow("Your current password is incorrect");

    unsub();
    vi.doUnmock("firebase/auth");
    vi.doUnmock("@/lib/firestore-repository");
  });

  it("maps credential and recent-login Firebase auth codes without leaking raw SDK strings", () => {
    expect(mapFirebaseAuthError({ code: "auth/invalid-credential" }).message).toBe(
      "Those details don't match an account",
    );
    expect(mapFirebaseAuthError({ code: "auth/requires-recent-login" }).message).toContain(
      "log in again",
    );
    expect(mapFirebaseAuthError({ code: "auth/user-mismatch" }).message).toContain(
      "does not match",
    );
  });
});
