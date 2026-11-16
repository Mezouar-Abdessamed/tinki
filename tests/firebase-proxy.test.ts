import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
    assert.equal(
      toFirebaseProxyUrl("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=k1"),
      "/api/firebase-proxy/identitytoolkit/v1/accounts:signInWithIdp?key=k1",
    );
    assert.equal(
      toFirebaseProxyUrl("https://securetoken.googleapis.com/v1/token?key=k1"),
      "/api/firebase-proxy/securetoken/v1/token?key=k1",
    );
    assert.equal(toFirebaseProxyUrl("http://identitytoolkit.googleapis.com/v1/projects?key=k1"), null);
    assert.equal(toFirebaseProxyUrl("https://evil.example/v1/projects?key=k1"), null);
    assert.equal(toFirebaseProxyUrl("not a url"), null);
  });

  it("validates proxy targets strictly against service, path allowlist, and API key", () => {
    const ok = resolveFirebaseProxyTarget(
      "/api/firebase-proxy/identitytoolkit/v1/projects",
      "?key=expected-key",
      "expected-key",
    );
    assert.equal(ok.service, "identitytoolkit");
    assert.equal(ok.upstreamUrl, "https://identitytoolkit.googleapis.com/v1/projects?key=expected-key");

    const okToken = resolveFirebaseProxyTarget(
      "/api/firebase-proxy/securetoken/v1/token",
      "?key=expected-key",
      "expected-key",
    );
    assert.equal(okToken.upstreamUrl, "https://securetoken.googleapis.com/v1/token?key=expected-key");

    assert.throws(
      () =>
        resolveFirebaseProxyTarget(
          "/api/firebase-proxy/identitytoolkit/v1/projects",
          "?key=wrong-key",
          "expected-key",
        ),
      /Invalid Firebase API key/,
    );
    assert.throws(
      () =>
        resolveFirebaseProxyTarget(
          "/api/firebase-proxy/identitytoolkit/v1/../v2/admin",
          "?key=expected-key",
          "expected-key",
        ),
      /Unsupported Firebase Auth endpoint/,
    );
    assert.throws(
      () =>
        resolveFirebaseProxyTarget(
          "/api/firebase-proxy/storage/v1/projects",
          "?key=expected-key",
          "expected-key",
        ),
      /Not found/,
    );
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

    assert.equal(res.status, 200);
    assert.equal(
      seenUrl,
      "https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=expected-key",
    );
    assert.equal(seenHeaders?.get("x-firebase-locale"), "en");
    assert.equal(seenHeaders?.get("cookie"), null);
    assert.equal(seenHeaders?.get("authorization"), null);
    assert.equal(seenBody, '{"requestUri":"https://example.com"}');
    assert.deepEqual(await res.json(), { idToken: "mock-id-token" });

    const badMethod = await handleFirebaseProxyRequest(
      new Request(
        "http://localhost:3000/api/firebase-proxy/identitytoolkit/v1/projects?key=expected-key",
        { method: "DELETE" },
      ),
      { expectedApiKey: "expected-key" },
    );
    assert.equal(badMethod.status, 405);

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
    assert.equal(failedUpstream.status, 502);
  });

  it("maps Firebase network, cancellation, and configuration errors cleanly", () => {
    const netErr = mapFirebaseAuthError({
      code: "auth/network-request-failed",
      message: "Firebase: Error (auth/network-request-failed).",
    });
    assert.equal(netErr.isNetworkError, true);
    assert.equal(netErr.isCancelled, false);
    assert.ok(!netErr.message.includes("Firebase:"));

    const cancelled = mapFirebaseAuthError({ code: "auth/popup-closed-by-user" });
    assert.equal(cancelled.isCancelled, true);

    const genericFirebase = mapFirebaseAuthError(new Error("Firebase: Error (auth/unknown)."));
    assert.equal(genericFirebase.message, "Authentication didn't work. Please try again");

    const expiredCode = mapFirebaseAuthError({ code: "auth/expired-action-code" });
    assert.ok(expiredCode.message.toLowerCase().includes("expired"));

    assert.equal(
      buildEmailVerificationContinueUrl(
        "https://ais-dev.example.run.app",
        "dzwolf240@gmail.com",
        "myhandle",
      ),
      "https://ais-dev.example.run.app/verify-email?email=dzwolf240%40gmail.com&username=myhandle",
    );
  });
});
