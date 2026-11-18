import { describe, expect, it } from "vitest";

import {
  buildEmailVerificationContinueUrl,
  mapFirebaseAuthError,
  toFirebaseProxyUrl,
} from "../src/lib/firebase-auth-helpers";
import {
  handleFirebaseProxyRequest,
  resolveFirebaseProxyTarget,
} from "../src/server/firebase-proxy.server";

describe("Firebase Auth proxy & client error helpers", () => {
  it("maps only HTTPS Firebase Auth origins to same-origin proxy paths", () => {
    expect(
      toFirebaseProxyUrl("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=k1"),
    ).toBe("/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithIdp?key=k1");
    expect(toFirebaseProxyUrl("https://securetoken.googleapis.com/v1/token?key=k1")).toBe(
      "/api/firebase-proxy/securetoken/v1/token?key=k1",
    );
    expect(toFirebaseProxyUrl("http://identitytoolkit.googleapis.com/v1/projects?key=k1")).toBeNull();
    expect(toFirebaseProxyUrl("https://evil.example/v1/projects?key=k1")).toBeNull();
    expect(toFirebaseProxyUrl("not a url")).toBeNull();
  });

  it("validates proxy targets strictly against service, path allowlist, and API key", () => {
    const ok = resolveFirebaseProxyTarget(
      "/api/firebase-proxy/identitytoolkit/v1/projects",
      "?key=expected-key",
      "expected-key",
    );
    expect(ok.service).toBe("identitytoolkit");
    expect(ok.upstreamUrl).toBe("https://identitytoolkit.googleapis.com/v1/projects?key=expected-key");

    const okToken = resolveFirebaseProxyTarget(
      "/api/firebase-proxy/securetoken/v1/token",
      "?key=expected-key",
      "expected-key",
    );
    expect(okToken.upstreamUrl).toBe("https://securetoken.googleapis.com/v1/token?key=expected-key");

    expect(() =>
      resolveFirebaseProxyTarget(
        "/api/firebase-proxy/identitytoolkit/v1/projects",
        "?key=wrong-key",
        "expected-key",
      ),
    ).toThrow(/Invalid Firebase API key/);

    expect(() =>
      resolveFirebaseProxyTarget(
        "/api/firebase-proxy/identitytoolkit/v1/../v2/admin",
        "?key=expected-key",
        "expected-key",
      ),
    ).toThrow(/Unsupported Firebase Auth endpoint/);

    expect(() =>
      resolveFirebaseProxyTarget(
        "/api/firebase-proxy/storage/v1/projects",
        "?key=expected-key",
        "expected-key",
      ),
    ).toThrow(/Not found/);

    // Strictly allowlisted client endpoints succeed
    for (const allowedPath of [
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signUp",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithPassword",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithIdp",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:createAuthUri",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:lookup",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:update",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:resetPassword",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:sendOobCode",
    ]) {
      const target = resolveFirebaseProxyTarget(allowedPath, "?key=expected-key", "expected-key");
      expect(target.service).toBe("identitytoolkit");
    }

    // Disallowed/unused endpoints and URL-encoded tricks fail with 403
    for (const disallowedPath of [
      "/api/firebase-proxy/identitytoolkit/v1/accounts:delete",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithCustomToken",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithPhoneNumber",
      "/api/firebase-proxy/identitytoolkit/v1/accounts:sendVerificationCode",
      "/api/firebase-proxy/securetoken/v1/projects",
      "/api/firebase-proxy/identitytoolkit/v1/accounts%3AsignInWithPassword",
    ]) {
      expect(() =>
        resolveFirebaseProxyTarget(disallowedPath, "?key=expected-key", "expected-key"),
      ).toThrow(/Unsupported Firebase Auth endpoint/);
    }
  });

  it("forwards allowlisted headers/body and handles upstream errors cleanly", async () => {
    let seenUrl = "";
    let seenHeaders: Headers | undefined;
    let seenBody = "";

    const req = new Request(
      "http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithIdp?key=expected-key",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-firebase-locale": "en",
          cookie: "tinki_session=secret",
          authorization: "Bearer secret",
        },
        body: JSON.stringify({ requestUri: "https://example.com" }),
      },
    );

    const res = await handleFirebaseProxyRequest(req, {
      expectedApiKey: "expected-key",
      fetchImpl: async (input, init) => {
        seenUrl = String(input);
        seenHeaders = new Headers(init?.headers);
        seenBody = init?.body ? Buffer.from(init.body as ArrayBuffer).toString("utf8") : "";
        return new Response(JSON.stringify({ idToken: "mock-id-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    expect(res.status).toBe(200);
    expect(seenUrl).toBe(
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=expected-key",
    );
    expect(seenHeaders?.get("x-firebase-locale")).toBe("en");
    expect(seenHeaders?.get("cookie")).toBeNull();
    expect(seenHeaders?.get("authorization")).toBeNull();
    expect(seenBody).toBe('{"requestUri":"https://example.com"}');
    expect(await res.json()).toEqual({ idToken: "mock-id-token" });

    const badMethod = await handleFirebaseProxyRequest(
      new Request(
        "http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=expected-key",
        { method: "DELETE" },
      ),
      { expectedApiKey: "expected-key" },
    );
    expect(badMethod.status).toBe(405);

    const failedUpstream = await handleFirebaseProxyRequest(
      new Request(
        "http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=expected-key",
      ),
      {
        expectedApiKey: "expected-key",
        fetchImpl: async () => {
          throw new TypeError("fetch failed");
        },
      },
    );
    expect(failedUpstream.status).toBe(502);
  });

  it("maps Firebase network, cancellation, and configuration errors cleanly", () => {
    const netErr = mapFirebaseAuthError({
      code: "auth/network-request-failed",
      message: "Firebase: Error (auth/network-request-failed).",
    });
    expect(netErr.isNetworkError).toBe(true);
    expect(netErr.isCancelled).toBe(false);
    expect(netErr.message.includes("Firebase:")).toBe(false);

    const cancelled = mapFirebaseAuthError({ code: "auth/popup-closed-by-user" });
    expect(cancelled.isCancelled).toBe(true);

    const genericFirebase = mapFirebaseAuthError(new Error("Firebase: Error (auth/unknown)."));
    expect(genericFirebase.message).toBe("Authentication didn't work. Please try again");

    const expiredCode = mapFirebaseAuthError({ code: "auth/expired-action-code" });
    expect(expiredCode.message.toLowerCase()).toContain("expired");

    expect(
      buildEmailVerificationContinueUrl(
        "https://ais-dev.example.run.app",
        "dzwolf240@gmail.com",
        "myhandle",
      ),
    ).toBe("https://ais-dev.example.run.app/verify-email?email=dzwolf240%40gmail.com&username=myhandle");
  });
});
