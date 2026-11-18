import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleApiOrMediaRequest, resetApiRateLimits } from "../src/server/api-router.server";
import {
  REAUTH_MAX_AGE_MS,
  TinkiStore,
  resetSharedStoreForTests,
} from "../src/server/local-fallback-store.server";

type InMemoryFirestoreDoc = Record<string, unknown>;

function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(name: string, data: InMemoryFirestoreDoc): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    fields[k] = toFirestoreValue(v);
  }
  return { name, fields };
}

function createInMemoryFirestoreFetch(seedDocs: Map<string, InMemoryFirestoreDoc>) {
  const docPrefix = "/documents/";

  const fetchImpl: typeof fetch = async (input, init) => {
    const urlStr = String(input);
    const parsedUrl = new URL(urlStr);
    const pathPart = parsedUrl.pathname;
    const docsIdx = pathPart.indexOf(docPrefix);
    const afterDocs = docsIdx >= 0 ? pathPart.slice(docsIdx + docPrefix.length) : "";

    if (urlStr.includes(":runQuery") && init?.method === "POST") {
      const reqBody = JSON.parse(String(init.body)) as {
        structuredQuery?: {
          from?: Array<{ collectionId?: string }>;
          where?: {
            fieldFilter?: {
              field?: { fieldPath?: string };
              value?: { stringValue?: string };
            };
          };
        };
      };
      const collectionId = reqBody.structuredQuery?.from?.[0]?.collectionId ?? "";
      const fieldPath = reqBody.structuredQuery?.where?.fieldFilter?.field?.fieldPath ?? "";
      const targetVal = reqBody.structuredQuery?.where?.fieldFilter?.value?.stringValue ?? "";

      const results: Array<{ document: Record<string, unknown> }> = [];
      for (const [relPath, data] of seedDocs.entries()) {
        const segs = relPath.split("/");
        if (segs.length === 2 && segs[0] === collectionId && data[fieldPath] === targetVal) {
          results.push({
            document: toFirestoreDocument(
              `projects/p/databases/(default)/documents/${relPath}`,
              data,
            ),
          });
        }
      }
      return new Response(
        JSON.stringify(results.length > 0 ? results : [{ readTime: "2026-06-01T00:00:00Z" }]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (urlStr.includes(":commit") && init?.method === "POST") {
      const reqBody = JSON.parse(String(init.body)) as {
        writes?: Array<{ delete?: string }>;
      };
      for (const write of reqBody.writes ?? []) {
        if (typeof write.delete === "string") {
          const delIdx = write.delete.indexOf(docPrefix);
          const relPath =
            delIdx >= 0 ? write.delete.slice(delIdx + docPrefix.length) : write.delete;
          // Enforce the same security invariant as firestore.rules for media chunks:
          // parent media_objects/{id} must still exist when evaluating chunk deletion in this batch
          if (/^media_objects\/[^/]+\/chunks\//.test(relPath)) {
            const parentPath = relPath.split("/").slice(0, 2).join("/");
            if (!seedDocs.has(parentPath)) {
              return new Response(
                JSON.stringify({ error: { code: 403, message: "Missing parent" } }),
                {
                  status: 403,
                  headers: { "content-type": "application/json" },
                },
              );
            }
          }
          seedDocs.delete(relPath);
        }
      }
      return new Response(JSON.stringify({ commitTime: "2026-06-01T00:00:01Z" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if ((!init?.method || init.method === "GET") && afterDocs) {
      const relPath = decodeURIComponent(afterDocs);
      const docData = seedDocs.get(relPath);
      if (!docData) {
        return new Response(JSON.stringify({ error: { code: 404, message: "Not found" } }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify(
          toFirestoreDocument(`projects/p/databases/(default)/documents/${relPath}`, docData),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ error: { code: 400, message: "Unsupported mock op" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };

  return fetchImpl;
}

describe("Complete account deletion & Google-only recent re-authentication", () => {
  const prevEnableLocal = process.env["ENABLE_LOCAL_STORE"];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevSecret = process.env["AUTH_SECRET"];
  const dirs: string[] = [];

  function makeDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetApiRateLimits();
    resetSharedStoreForTests();

    if (prevEnableLocal === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevEnableLocal;
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevSecret === undefined) delete process.env["AUTH_SECRET"];
    else process.env["AUTH_SECRET"] = prevSecret;

    while (dirs.length > 0) {
      const d = dirs.pop();
      if (d) fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it("deletes all Firestore docs (accounts, usernames, profiles, custom_links, social_link_settings, profile_events, media_objects + chunks) and enforces recent Google re-auth", async () => {
    delete process.env["ENABLE_LOCAL_STORE"];
    const nowSeconds = 1_780_000_000;
    const nowMs = () => nowSeconds * 1000;

    const uid = "google-user-123";
    const otherUid = "other-user-456";

    const docs = new Map<string, InMemoryFirestoreDoc>([
      [`accounts/${uid}`, { id: uid, email: "g@example.com", username: "gcreator" }],
      [`accounts/${otherUid}`, { id: otherUid, email: "other@example.com", username: "other" }],
      [`usernames/gcreator`, { username: "gcreator", owner_id: uid }],
      [`usernames/other`, { username: "other", owner_id: otherUid }],
      [`profiles/${uid}`, { id: uid, username: "gcreator", display_name: "G Creator" }],
      [`profiles/${otherUid}`, { id: otherUid, username: "other", display_name: "Other" }],
      [
        `custom_links/link-1`,
        { id: "link-1", profile_id: uid, name: "Site", url: "https://a.example" },
      ],
      [`custom_links/link-other`, { id: "link-other", profile_id: otherUid, name: "Keep" }],
      [`social_link_settings/set-1`, { id: "set-1", profile_id: uid, platform: "github" }],
      [`social_link_settings/set-other`, { id: "set-other", profile_id: otherUid, platform: "x" }],
      [`profile_events/ev-1`, { id: "ev-1", profile_id: uid, event_type: "profile_view" }],
      [
        `profile_events/ev-other`,
        { id: "ev-other", profile_id: otherUid, event_type: "profile_view" },
      ],
      [
        `media_objects/avatars__${uid}__pic_png`,
        { id: `avatars__${uid}__pic_png`, owner_id: uid, bucket: "avatars", chunk_count: 2 },
      ],
      [`media_objects/avatars__${uid}__pic_png/chunks/0`, { index: 0, data: "AQID" }],
      [`media_objects/avatars__${uid}__pic_png/chunks/1`, { index: 1, data: "BAUG" }],
      [
        `media_objects/avatars__${otherUid}__pic_png`,
        {
          id: `avatars__${otherUid}__pic_png`,
          owner_id: otherUid,
          bucket: "avatars",
          chunk_count: 1,
        },
      ],
      [`media_objects/avatars__${otherUid}__pic_png/chunks/0`, { index: 0, data: "BwgJ" }],
    ]);

    const firestoreFetch = createInMemoryFirestoreFetch(docs);
    const deletedAuthTokens: string[] = [];

    // 1. Missing idToken is rejected
    const missingTokenRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "gcreator" }),
      }),
      { firestoreFetch, nowMs },
    ))!;
    expect(missingTokenRes.status).toBe(401);
    expect(docs.has(`accounts/${uid}`)).toBe(true);

    // 2. Stale Google-only re-auth (10 minutes ago) is rejected BEFORE deleting anything
    const staleRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "gcreator", idToken: "stale-google-token" }),
      }),
      {
        firestoreFetch,
        nowMs,
        verifyFirebaseToken: async () => ({
          uid,
          email: "g@example.com",
          authTime: nowSeconds - 600,
          signInProvider: "google.com",
        }),
        deleteFirebaseAuthUser: async (tok) => {
          deletedAuthTokens.push(tok);
          return true;
        },
      },
    ))!;
    expect(staleRes.status).toBe(401);
    expect((await staleRes.json()) as { code?: string }).toMatchObject({ code: "reauth_required" });
    expect(docs.has(`accounts/${uid}`)).toBe(true);
    expect(docs.has(`media_objects/avatars__${uid}__pic_png/chunks/0`)).toBe(true);
    expect(deletedAuthTokens).toHaveLength(0);

    // 3. Mismatched username confirmation with fresh Google re-auth is rejected cleanly
    const wrongUsernameRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "wrongname", idToken: "fresh-google-token" }),
      }),
      {
        firestoreFetch,
        nowMs,
        verifyFirebaseToken: async () => ({
          uid,
          email: "g@example.com",
          authTime: nowSeconds - 30,
          signInProvider: "google.com",
        }),
      },
    ))!;
    expect(wrongUsernameRes.status).toBe(400);
    expect(docs.has(`profiles/${uid}`)).toBe(true);

    // 4. Fresh Google re-auth + matching username deletes EVERY user document and media chunk
    const deleteRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "gcreator", idToken: "fresh-google-token" }),
      }),
      {
        firestoreFetch,
        nowMs,
        verifyFirebaseToken: async () => ({
          uid,
          email: "g@example.com",
          authTime: nowSeconds - 15,
          signInProvider: "google.com",
        }),
        deleteFirebaseAuthUser: async (tok) => {
          deletedAuthTokens.push(tok);
          return true;
        },
      },
    ))!;

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(deletedAuthTokens).toEqual(["fresh-google-token"]);

    // Verify ZERO data remains for deleted user in Firestore
    const remainingKeys = [...docs.keys()];
    for (const key of remainingKeys) {
      assert.equal(key.includes(uid), false, `Expected ${key} to be deleted`);
      assert.equal(key, key.replace("gcreator", "___"), `Expected username claim deleted: ${key}`);
      const val = docs.get(key);
      assert.notEqual(val?.["profile_id"], uid);
      assert.notEqual(val?.["owner_id"], uid);
    }

    // Other user's data remains completely untouched
    expect(docs.has(`accounts/${otherUid}`)).toBe(true);
    expect(docs.has(`usernames/other`)).toBe(true);
    expect(docs.has(`profiles/${otherUid}`)).toBe(true);
    expect(docs.has(`custom_links/link-other`)).toBe(true);
    expect(docs.has(`social_link_settings/set-other`)).toBe(true);
    expect(docs.has(`profile_events/ev-other`)).toBe(true);
    expect(docs.has(`media_objects/avatars__${otherUid}__pic_png/chunks/0`)).toBe(true);
  });

  it("local store requires recent re-auth for Google-only accounts (ignoring sliding cookie renewal) and leaves zero files/records on delete", async () => {
    const dir = makeDir("tinki-local-complete-del-");
    process.env["TINKI_DATA_DIR"] = dir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["AUTH_SECRET"] = "test-secret-complete-deletion-32ch!";

    let currentNow = Date.UTC(2026, 5, 1, 12, 0, 0);
    vi.spyOn(Date, "now").mockImplementation(() => currentNow);
    resetSharedStoreForTests();
    const { getStore } = await import("../src/server/local-fallback-store.server");
    const activeStore = getStore();

    const googleUid = "google-uid-999";
    const otherSession = await activeStore.signUp({
      email: "keepme@example.com",
      password: "Password123!",
      username: "keepme",
    });

    // Sign in Google-only user
    const loginRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken: "initial-google-id-token" }),
      }),
      {
        useLocalStore: true,
        nowMs: () => currentNow,
        verifyFirebaseToken: async () => ({
          uid: googleUid,
          email: "googleonly@example.com",
          authTime: Math.floor(currentNow / 1000),
          signInProvider: "google.com",
        }),
      },
    ))!;
    expect(loginRes.status).toBe(200);
    const initialCookie = (loginRes.headers.get("set-cookie") ?? "").split(";")[0]!;

    // Populate profile, links, social settings, events, reset token, and media in all 3 buckets
    activeStore.createProfile(googleUid, "gonly");
    activeStore.createCustomLink(googleUid, { name: "Portfolio", url: "https://example.org" });
    activeStore.saveSocialLinkSettings(googleUid, [
      { profile_id: googleUid, platform: "github", enabled: true, position: 0 },
    ]);
    activeStore.recordEvent(null, {
      profile_id: googleUid,
      event_type: "profile_view",
      visitor_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    activeStore.createPasswordReset("googleonly@example.com");

    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    activeStore.saveMediaFile(googleUid, "avatars", `${googleUid}/a.png`, png, "image/png");
    activeStore.saveMediaFile(googleUid, "covers", `${googleUid}/c.png`, png, "image/png");
    activeStore.saveMediaFile(googleUid, "backgrounds", `${googleUid}/b.png`, png, "image/png");

    // Advance 10 minutes past REAUTH_MAX_AGE_MS and perform a sliding session refresh
    currentNow += REAUTH_MAX_AGE_MS + 5 * 60 * 1000;
    const slidRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: { cookie: initialCookie },
      }),
      { useLocalStore: true, nowMs: () => currentNow },
    ))!;
    expect(slidRes.status).toBe(200);
    const slidCookie = (slidRes.headers.get("set-cookie") ?? "").split(";")[0]!;

    // Deleting without fresh Google re-auth must fail with 401 reauth_required even with fresh sliding cookie
    const rejectedDelete = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: slidCookie },
        body: JSON.stringify({ username: "gonly" }),
      }),
      { useLocalStore: true, nowMs: () => currentNow },
    ))!;
    expect(rejectedDelete.status).toBe(401);
    expect((await rejectedDelete.json()) as { code?: string }).toMatchObject({
      code: "reauth_required",
    });
    expect(activeStore.getProfileById(googleUid)).not.toBeNull();

    // Re-authenticate with fresh Google token and delete account
    const reauthRes = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/reauth-google", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: slidCookie },
        body: JSON.stringify({ idToken: "fresh-reauth-token" }),
      }),
      {
        useLocalStore: true,
        nowMs: () => currentNow,
        verifyFirebaseToken: async () => ({
          uid: googleUid,
          email: "googleonly@example.com",
          authTime: Math.floor(currentNow / 1000),
          signInProvider: "google.com",
        }),
      },
    ))!;
    expect(reauthRes.status).toBe(200);

    const deleteOk = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/account", {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: slidCookie },
        body: JSON.stringify({ username: "gonly" }),
      }),
      { useLocalStore: true, nowMs: () => currentNow },
    ))!;
    expect(deleteOk.status).toBe(200);
    expect(deleteOk.headers.get("set-cookie")).toContain("Max-Age=0");

    await activeStore.flush();
    resetSharedStoreForTests();

    // Verify db.json has zero data remaining for deleted user
    const rawDb = JSON.parse(fs.readFileSync(path.join(dir, "db.json"), "utf8")) as {
      users: Array<{ id: string }>;
      profiles: Array<{ id: string }>;
      customLinks: Array<{ profile_id: string }>;
      socialLinkSettings: Array<{ profile_id: string }>;
      profileEvents: Array<{ profile_id: string }>;
      resetTokens: Array<{ userId: string }>;
      pendingSignups: Array<{ id: string; email: string }>;
      releasedUsernames: Array<{ previousOwnerId: string }>;
      deletedUserIds: string[];
    };
    expect(rawDb.users.some((u) => u.id === googleUid)).toBe(false);
    expect(rawDb.profiles.some((p) => p.id === googleUid)).toBe(false);
    expect(rawDb.customLinks.some((l) => l.profile_id === googleUid)).toBe(false);
    expect(rawDb.socialLinkSettings.some((s) => s.profile_id === googleUid)).toBe(false);
    expect(rawDb.profileEvents.some((e) => e.profile_id === googleUid)).toBe(false);
    expect(rawDb.resetTokens.some((r) => r.userId === googleUid)).toBe(false);
    expect(
      rawDb.pendingSignups.some((p) => p.id === googleUid || p.email === "googleonly@example.com"),
    ).toBe(false);
    expect(rawDb.releasedUsernames.some((r) => r.previousOwnerId === googleUid)).toBe(false);
    expect(rawDb.deletedUserIds).toContain(googleUid);

    // Unrelated user remains
    expect(rawDb.users.some((u) => u.id === otherSession.user.id)).toBe(true);

    // Media directories across all buckets for googleUid must not exist
    for (const bucket of ["avatars", "covers", "backgrounds"]) {
      expect(fs.existsSync(path.join(dir, "media", bucket, googleUid))).toBe(false);
    }

    // Sessions revoked across reload
    const afterRestartSession = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/session", {
        method: "GET",
        headers: { cookie: slidCookie },
      }),
      { useLocalStore: true, nowMs: () => currentNow },
    ))!;
    expect(await afterRestartSession.json()).toEqual({ session: null });

    const protectedAfterDelete = (await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/profiles/me", {
        method: "GET",
        headers: { cookie: initialCookie },
      }),
      { useLocalStore: true, nowMs: () => currentNow },
    ))!;
    expect(protectedAfterDelete.status).toBe(401);
  });

  it("deleteMyAccount prompts Google popup re-authentication when authTime is stale and aborts deletion if re-auth fails", async () => {
    vi.resetModules();

    const authState = {
      uid: "fb-google-uid",
      email: "gclient@example.com",
      authTime: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      deleted: false,
    };

    const reauthPopupSpy = vi.fn(async () => {
      throw new Error("Google sign-in popup was cancelled");
    });
    const deleteFirestoreSpy = vi.fn(async () => {});
    const deleteUserSpy = vi.fn(async () => {
      authState.deleted = true;
    });
    const signOutSpy = vi.fn(async () => {});
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    vi.stubGlobal("fetch", fetchMock);

    vi.doMock("@/lib/firestore-repository", () => ({
      auth: {
        currentUser: {
          uid: authState.uid,
          email: authState.email,
          providerData: [{ providerId: "google.com" }],
          getIdTokenResult: async () => ({ authTime: authState.authTime }),
          getIdToken: async () => "mock-fresh-fb-token",
          delete: deleteUserSpy,
        },
      },
      fetchProfileByIdFirestore: async () => ({
        id: authState.uid,
        username: "gclient",
      }),
      deleteAccountFirestore: deleteFirestoreSpy,
    }));

    vi.doMock("@/lib/firebase-auth", () => ({
      clearPendingVerificationState: vi.fn(),
      reauthenticateWithGooglePopup: reauthPopupSpy,
      signOutFirebaseGoogle: signOutSpy,
    }));

    const { deleteMyAccount } = await import("../src/lib/account-actions");

    // 1. Stale authTime + cancelled Google popup -> aborts before touching Firestore or server
    await assert.rejects(
      () => deleteMyAccount({ data: { username: "gclient" } }),
      /popup was cancelled/i,
    );
    expect(reauthPopupSpy).toHaveBeenCalledTimes(1);
    expect(deleteFirestoreSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteUserSpy).not.toHaveBeenCalled();

    // 2. Popup succeeds -> updates authTime -> deletes Firestore, notifies server, deletes Auth user, signs out
    reauthPopupSpy.mockImplementationOnce(async () => {
      authState.authTime = new Date().toISOString();
    });

    const result = await deleteMyAccount({ data: { username: "gclient" } });
    expect(result).toEqual({ success: true });
    expect(reauthPopupSpy).toHaveBeenCalledTimes(2);
    expect(deleteFirestoreSpy).toHaveBeenCalledTimes(1);
    expect(deleteUserSpy).toHaveBeenCalledTimes(1);
    expect(signOutSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, fetchInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(fetchInit.method).toBe("DELETE");
    expect(JSON.parse(String(fetchInit.body))).toEqual({
      username: "gclient",
      idToken: "mock-fresh-fb-token",
    });

    vi.doUnmock("@/lib/firestore-repository");
    vi.doUnmock("@/lib/firebase-auth");
  });
});
