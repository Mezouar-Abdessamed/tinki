import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { trackCustomLinkClick, trackProfileView, trackSocialClick } from "../src/lib/analytics";
import {
  HourlyViewDeduplicator,
  SlidingWindowRateLimiter,
  extractCountryFromHeaders,
  handleApiOrMediaRequest,
  resetApiRateLimits,
} from "../src/server/api-router.server";
import { getStore, resetSharedStoreForTests } from "../src/server/local-fallback-store.server";

describe("POST /api/events and analytics.ts hardening", () => {
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevEnableLocal = process.env["ENABLE_LOCAL_STORE"];
  const prevNodeEnv = process.env["NODE_ENV"];
  let tmpDir: string;
  let aliceId: string;
  let bobId: string;
  let aliceLinkId: string;
  let bobLinkId: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-events-hardening-"));
    process.env["TINKI_DATA_DIR"] = tmpDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["NODE_ENV"] = "test";
    resetSharedStoreForTests();

    const store = getStore();
    const alice = await store.signUp({
      email: "alice-events@example.com",
      password: "Password123!",
      username: "aliceev",
    });
    const bob = await store.signUp({
      email: "bob-events@example.com",
      password: "Password123!",
      username: "bobev",
    });
    aliceId = alice.user.id;
    bobId = bob.user.id;
    aliceLinkId = store.createCustomLink(aliceId, {
      name: "Alice Site",
      url: "https://alice.example.com",
    }).id;
    bobLinkId = store.createCustomLink(bobId, {
      name: "Bob Site",
      url: "https://bob.example.com",
    }).id;
    await store.flush();
  });

  beforeEach(() => {
    process.env["ENABLE_LOCAL_STORE"] = "true";
    process.env["NODE_ENV"] = "test";
    resetApiRateLimits();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  afterAll(() => {
    resetSharedStoreForTests();
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevEnableLocal === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevEnableLocal;
    if (prevNodeEnv === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = prevNodeEnv;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("validates event body strictly with zod (event_type, SOCIAL_PLATFORMS, ISO-3166 alpha-2 country, UUID visitor_id)", async () => {
    const validUuid = "11111111-1111-4111-8111-111111111111";

    const invalidPayloads: Array<Record<string, unknown>> = [
      // Bad event_type
      { profile_id: aliceId, event_type: "arbitrary_event", visitor_id: validUuid },
      // Unlisted social platform
      { profile_id: aliceId, event_type: "social_click", platform: "myspace", visitor_id: validUuid },
      // social_click missing platform
      { profile_id: aliceId, event_type: "social_click", visitor_id: validUuid },
      // platform attached to profile_view
      { profile_id: aliceId, event_type: "profile_view", platform: "github", visitor_id: validUuid },
      // Non-ISO-3166 alpha-2 country codes
      { profile_id: aliceId, event_type: "profile_view", visitor_id: validUuid, country: "USA" },
      { profile_id: aliceId, event_type: "profile_view", visitor_id: validUuid, country: "us" },
      { profile_id: aliceId, event_type: "profile_view", visitor_id: validUuid, country: "U1" },
      // Non-UUID visitor_id
      { profile_id: aliceId, event_type: "profile_view", visitor_id: "not-a-uuid" },
      // custom_link_click missing custom_link_id
      { profile_id: aliceId, event_type: "custom_link_click", visitor_id: validUuid },
      // Unknown extra field rejected by strict()
      { profile_id: aliceId, event_type: "profile_view", visitor_id: validUuid, spoof: true },
    ];

    for (const payload of invalidPayloads) {
      const res = await handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
        { rateLimiter: new SlidingWindowRateLimiter() },
      );
      expect(res?.status).toBe(400);
    }
  });

  it("rejects custom_link_id that does not belong to the target profile in both local and Firestore modes", async () => {
    const visitorId = "22222222-2222-4222-8222-222222222222";

    // Local store mode: Bob's link ID sent under Alice's profile_id -> 400
    const crossProfileLocal = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: aliceId,
          event_type: "custom_link_click",
          custom_link_id: bobLinkId,
          visitor_id: visitorId,
        }),
      }),
    );
    expect(crossProfileLocal?.status).toBe(400);
    expect((await crossProfileLocal?.json()) as { code: string }).toMatchObject({
      code: "invalid_custom_link",
    });

    // Local store mode: Alice's own link ID -> 201
    const validLocal = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: aliceId,
          event_type: "custom_link_click",
          custom_link_id: aliceLinkId,
          visitor_id: visitorId,
        }),
      }),
    );
    expect(validLocal?.status).toBe(201);

    // Firestore single-source-of-truth mode: Bob's link doc returned -> 400 without :commit
    const commitCalls: string[] = [];
    const firestoreFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes(`/documents/profiles/${aliceId}`)) {
        return new Response(
          JSON.stringify({ fields: { id: { stringValue: aliceId }, username: { stringValue: "aliceev" } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes(`/documents/custom_links/${bobLinkId}`)) {
        return new Response(
          JSON.stringify({
            fields: {
              id: { stringValue: bobLinkId },
              profile_id: { stringValue: bobId },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes(":commit")) {
        commitCalls.push(url);
        return new Response(JSON.stringify({ writeResults: [{}] }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const crossProfileFirestore = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: aliceId,
          event_type: "custom_link_click",
          custom_link_id: bobLinkId,
          visitor_id: visitorId,
        }),
      }),
      { useLocalStore: false, firestoreFetch },
    );
    expect(crossProfileFirestore?.status).toBe(400);
    expect(commitCalls).toHaveLength(0);
  });

  it("derives country exclusively from server geo headers and ignores client-supplied country", async () => {
    expect(extractCountryFromHeaders(new Headers({ "cf-ipcountry": "fr" }))).toBe("FR");
    expect(extractCountryFromHeaders(new Headers({ "x-vercel-ip-country": "de" }))).toBe("DE");
    expect(
      extractCountryFromHeaders(
        new Headers({ "cf-ipcountry": "XX", "x-vercel-ip-country": "jp" }),
      ),
    ).toBe("JP");
    expect(extractCountryFromHeaders(new Headers({ "cf-ipcountry": "T1" }))).toBeNull();

    // Local store mode: client tries to spoof country: "DZ", server sees x-vercel-ip-country: "CA"
    const v1 = "33333333-3333-4333-8333-333333333333";
    const localRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vercel-ip-country": "ca",
        },
        body: JSON.stringify({
          profile_id: bobId,
          event_type: "profile_view",
          visitor_id: v1,
          country: "DZ",
        }),
      }),
    );
    expect(localRes?.status).toBe(201);
    const bobAnalytics = getStore().getAnalytics(bobId, bobId);
    expect(bobAnalytics.byCountry).toEqual({ CA: 1 });

    // Firestore mode: client tries to spoof country: "DZ" with no geo header -> null stored
    let capturedFields: Record<string, unknown> | undefined;
    const firestoreFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes(`/documents/profiles/${bobId}`)) {
        return new Response(
          JSON.stringify({ fields: { id: { stringValue: bobId }, username: { stringValue: "bobev" } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes(":commit")) {
        const payload = JSON.parse(String(init?.body ?? "{}")) as {
          writes?: Array<{ update?: { fields?: Record<string, unknown> } }>;
        };
        capturedFields = payload.writes?.[0]?.update?.fields;
        return new Response(JSON.stringify({ writeResults: [{}] }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const fsRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile_id: bobId,
          event_type: "profile_view",
          visitor_id: "44444444-4444-4444-8444-444444444444",
          country: "DZ",
        }),
      }),
      {
        useLocalStore: false,
        firestoreFetch,
        viewDeduplicator: new HourlyViewDeduplicator(),
      },
    );
    expect(fsRes?.status).toBe(201);
    expect(capturedFields?.["country"]).toEqual({ nullValue: null });
  });

  it("removes cloudflare.com/cdn-cgi/trace from analytics.ts and posts events without client country", async () => {
    const analyticsSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/analytics.ts"),
      "utf8",
    );
    expect(analyticsSrc).not.toContain("cloudflare.com");
    expect(analyticsSrc).not.toContain("cdn-cgi/trace");

    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storage.set(k, v);
        },
        removeItem: (k: string) => {
          storage.delete(k);
        },
      },
    });

    const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
    vi.stubGlobal("fetch", async (input: unknown, init?: { body?: unknown }) => {
      const url = String(input);
      fetchCalls.push({
        url,
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    });

    await trackProfileView(aliceId, false);
    trackSocialClick(aliceId, "github", false);
    trackCustomLinkClick(aliceId, aliceLinkId, false);

    expect(fetchCalls).toHaveLength(3);
    for (const call of fetchCalls) {
      expect(call.url).toBe("/api/events");
      expect(call.body["country"]).toBeUndefined();
      expect(String(call.body["visitor_id"])).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });

  it("deduplicates profile_view events per visitor per profile per hour on the server", async () => {
    const visitorA = "55555555-5555-4555-8555-555555555555";
    const visitorB = "66666666-6666-4666-8666-666666666666";
    let clockMs = 1_800_000_000_000;

    // 1. Local store mode deduplication
    const sendView = (profileId: string, visitorId: string) =>
      handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/events", {
          method: "POST",
          headers: { "content-type": "application/json", "cf-ipcountry": "US" },
          body: JSON.stringify({
            profile_id: profileId,
            event_type: "profile_view",
            visitor_id: visitorId,
          }),
        }),
        { nowMs: () => clockMs, rateLimiter: new SlidingWindowRateLimiter() },
      );

    // Clear prior views by creating a fresh user profile
    const store = getStore();
    const freshUser = await store.signUp({
      email: "dedup-owner@example.com",
      password: "Password123!",
      username: "dedupowner",
    });

    const first = (await sendView(freshUser.user.id, visitorA))!;
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({ ok: true, deduplicated: false });

    // Within same hour (+45 min): deduplicated -> 200 and does not add another row
    clockMs += 45 * 60_000;
    const second = (await sendView(freshUser.user.id, visitorA))!;
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ ok: true, deduplicated: true });

    // Different visitor in same hour -> 201
    const otherVisitor = (await sendView(freshUser.user.id, visitorB))!;
    expect(otherVisitor.status).toBe(201);

    // Same visitor on different profile in same hour -> 201
    const otherProfile = (await sendView(aliceId, visitorA))!;
    expect(otherProfile.status).toBe(201);

    // After 1 hour (+15m + 1ms from second = 60m + 1ms from first) -> 201
    clockMs += 15 * 60_000 + 1;
    const afterHour = (await sendView(freshUser.user.id, visitorA))!;
    expect(afterHour.status).toBe(201);
    expect(await afterHour.json()).toEqual({ ok: true, deduplicated: false });

    // 2. Firestore mode hourly deduplication
    let commitCount = 0;
    const fsViewDedup = new HourlyViewDeduplicator();
    let fsClockMs = 1_850_000_000_000;
    const firestoreFetch: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes(`/documents/profiles/${aliceId}`)) {
        return new Response(
          JSON.stringify({ fields: { id: { stringValue: aliceId }, username: { stringValue: "aliceev" } } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes(":commit")) {
        commitCount += 1;
        return new Response(JSON.stringify({ writeResults: [{}] }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    };

    const sendFsView = () =>
      handleApiOrMediaRequest(
        new Request("http://localhost:3000/api/events", {
          method: "POST",
          headers: { "content-type": "application/json", "cf-ipcountry": "GB" },
          body: JSON.stringify({
            profile_id: aliceId,
            event_type: "profile_view",
            visitor_id: visitorA,
          }),
        }),
        {
          useLocalStore: false,
          firestoreFetch,
          viewDeduplicator: fsViewDedup,
          nowMs: () => fsClockMs,
        },
      );

    expect((await sendFsView())?.status).toBe(201);
    expect(commitCount).toBe(1);

    fsClockMs += 30 * 60_000;
    const fsRepeat = (await sendFsView())!;
    expect(fsRepeat.status).toBe(200);
    expect(await fsRepeat.json()).toEqual({ ok: true, deduplicated: true });
    expect(commitCount).toBe(1);

    fsClockMs += 30 * 60_000 + 1;
    expect((await sendFsView())?.status).toBe(201);
    expect(commitCount).toBe(2);
  });
});
