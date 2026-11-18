import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_FILES_PER_BUCKET,
  TinkiStore,
} from "../src/server/local-fallback-store.server";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
  Buffer.from("VP8 "),
]);
const GIF_BYTES = Buffer.from("GIF89a\x01\x00\x01\x00\x80\x00\x00", "latin1");
const MP4_BYTES = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypisom"),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from("isomiso2mp41"),
]);
const WEBM_BYTES = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84]),
  Buffer.from("webm"),
]);
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const HTML_BYTES = Buffer.from("<!doctype html><html><body><script>alert(1)</script></body></html>");

describe("Media upload & serving security (/api/storage & /media/*)", () => {
  const tempDirs: string[] = [];
  const prevDataDir = process.env["TINKI_DATA_DIR"];
  const prevLocalStore = process.env["ENABLE_LOCAL_STORE"];
  let apiDir: string;
  let handleApiOrMediaRequest: typeof import("../src/server/api-router.server").handleApiOrMediaRequest;
  let resetApiRateLimits: typeof import("../src/server/api-router.server").resetApiRateLimits;
  let token: string;
  let userId: string;

  beforeAll(async () => {
    apiDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-media-api-"));
    tempDirs.push(apiDir);
    process.env["TINKI_DATA_DIR"] = apiDir;
    process.env["ENABLE_LOCAL_STORE"] = "true";
    vi.resetModules();
    ({ handleApiOrMediaRequest, resetApiRateLimits } = await import(
      "../src/server/api-router.server"
    ));
    const { getStore } = await import("../src/server/local-fallback-store.server");

    const pendingRes = await handleApiOrMediaRequest(
      new Request("http://localhost:3000/api/auth/register-pending", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "mediauser@example.com",
          password: "Password123!",
          username: "mediauser",
        }),
      }),
    );
    expect(pendingRes?.status).toBe(201);
    const session = getStore().completeVerifiedEmailSignup({ email: "mediauser@example.com" });
    token = session.access_token;
    userId = session.user.id;
  });

  beforeEach(() => {
    resetApiRateLimits();
  });

  afterAll(() => {
    if (prevDataDir === undefined) delete process.env["TINKI_DATA_DIR"];
    else process.env["TINKI_DATA_DIR"] = prevDataDir;
    if (prevLocalStore === undefined) delete process.env["ENABLE_LOCAL_STORE"];
    else process.env["ENABLE_LOCAL_STORE"] = prevLocalStore;

    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  async function upload(
    bucket: string,
    objectPath: string,
    bytes: Buffer,
    contentType: string,
  ): Promise<Response> {
    const res = await handleApiOrMediaRequest(
      new Request(
        `http://localhost:3000/api/storage/${encodeURIComponent(bucket)}/upload?path=${encodeURIComponent(objectPath)}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": contentType,
          },
          body: new Uint8Array(bytes),
        },
      ),
    );
    return res!;
  }

  it("rejects SVG and HTML uploads even with allowed bucket paths or spoofed image content-types", async () => {
    // Declared SVG / HTML
    for (const bucket of ["avatars", "covers", "backgrounds"]) {
      const svgDirect = await upload(bucket, `${userId}/evil.svg`, SVG_BYTES, "image/svg+xml");
      expect(svgDirect.status).toBe(415);

      const htmlDirect = await upload(bucket, `${userId}/evil.html`, HTML_BYTES, "text/html");
      expect(htmlDirect.status).toBe(415);

      // Spoofed Content-Type: image/png with SVG or HTML body
      const svgSpoof = await upload(bucket, `${userId}/spoof.png`, SVG_BYTES, "image/png");
      expect(svgSpoof.status).toBe(415);

      const htmlSpoof = await upload(bucket, `${userId}/spoof2.png`, HTML_BYTES, "image/png");
      expect(htmlSpoof.status).toBe(415);

      // Spoofed Content-Type: text/html with valid PNG body
      const pngAsHtml = await upload(bucket, `${userId}/real.html`, PNG_BYTES, "text/html");
      expect(pngAsHtml.status).toBe(415);

      // Spoofed Content-Type: image/svg+xml with valid PNG body
      const pngAsSvg = await upload(bucket, `${userId}/real.svg`, PNG_BYTES, "image/svg+xml");
      expect(pngAsSvg.status).toBe(415);
    }
  });

  it("rejects mismatched magic bytes (e.g. JPEG labeled image/png) and videos in avatars/covers", async () => {
    const jpegAsPng = await upload("avatars", `${userId}/fake.png`, JPEG_BYTES, "image/png");
    expect(jpegAsPng.status).toBe(415);

    const pngAsJpeg = await upload("covers", `${userId}/fake.jpg`, PNG_BYTES, "image/jpeg");
    expect(pngAsJpeg.status).toBe(415);

    const mp4InAvatar = await upload("avatars", `${userId}/vid.mp4`, MP4_BYTES, "video/mp4");
    expect(mp4InAvatar.status).toBe(415);

    const webmInCover = await upload("covers", `${userId}/vid.webm`, WEBM_BYTES, "video/webm");
    expect(webmInCover.status).toBe(415);
  });

  it("forces the filename extension to match the detected type and rejects .meta.json filenames", async () => {
    const metaUpload = await upload("avatars", `${userId}/avatar.png.meta.json`, PNG_BYTES, "image/png");
    expect(metaUpload.status).toBe(400);

    const dotMetaUpload = await upload("avatars", `${userId}/.meta.json`, PNG_BYTES, "image/png");
    expect(dotMetaUpload.status).toBe(400);

    // Valid PNG uploaded with .html extension and extra Content-Type params is normalized to .png and clean image/png
    const forcedRes = await upload(
      "avatars",
      `${userId}/renamed.html`,
      PNG_BYTES,
      "image/png; charset=utf-8; evil=param",
    );
    expect(forcedRes.status).toBe(201);
    const body = (await forcedRes.json()) as { path: string };
    expect(body.path).toBe(`${userId}/renamed.png`);

    // .jpeg extension normalized to .jpg
    const jpegRes = await upload("covers", `${userId}/cover.jpeg`, JPEG_BYTES, "image/jpeg");
    expect(jpegRes.status).toBe(201);
    expect(await jpegRes.json()).toEqual({ path: `${userId}/cover.jpg` });

    // Direct GET of .meta.json must never be served
    const metaRead = await handleApiOrMediaRequest(
      new Request(`http://localhost:3000/media/avatars/${userId}/renamed.png.meta.json`),
    );
    expect(metaRead?.status).toBe(404);
  });

  it("serves images and videos with nosniff, sandbox CSP, and image-only Content-Disposition: inline", async () => {
    const samples: Array<{
      bucket: string;
      name: string;
      bytes: Buffer;
      mime: string;
      expectInline: boolean;
    }> = [
      { bucket: "avatars", name: "a.png", bytes: PNG_BYTES, mime: "image/png", expectInline: true },
      { bucket: "avatars", name: "b.jpg", bytes: JPEG_BYTES, mime: "image/jpeg", expectInline: true },
      { bucket: "covers", name: "c.webp", bytes: WEBP_BYTES, mime: "image/webp", expectInline: true },
      { bucket: "covers", name: "d.gif", bytes: GIF_BYTES, mime: "image/gif", expectInline: true },
      { bucket: "backgrounds", name: "v.mp4", bytes: MP4_BYTES, mime: "video/mp4", expectInline: false },
      { bucket: "backgrounds", name: "w.webm", bytes: WEBM_BYTES, mime: "video/webm", expectInline: false },
    ];

    for (const s of samples) {
      const up = await upload(s.bucket, `${userId}/${s.name}`, s.bytes, s.mime);
      expect(up.status).toBe(201);

      const getRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000/media/${s.bucket}/${userId}/${s.name}`),
      );
      expect(getRes?.status).toBe(200);
      expect(getRes?.headers.get("content-type")).toBe(s.mime);
      expect(getRes?.headers.get("x-content-type-options")).toBe("nosniff");
      expect(getRes?.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
      if (s.expectInline) {
        expect(getRes?.headers.get("content-disposition")).toBe("inline");
      } else {
        expect(getRes?.headers.get("content-disposition")).not.toBe("inline");
      }
    }

    // Tampered .meta.json on disk is refused
    const metaDiskPath = path.join(apiDir, "media", "avatars", userId, "a.png.meta.json");
    fs.writeFileSync(metaDiskPath, JSON.stringify({ contentType: "text/html" }), "utf8");
    const tamperedGet = await handleApiOrMediaRequest(
      new Request(`http://localhost:3000/media/avatars/${userId}/a.png`),
    );
    expect(tamperedGet?.status).toBe(404);
  });

  it("returns 400 on malformed URL encoding and rejects decoded '/', '\\\\', or '.meta.json' filenames", async () => {
    const fetchSpy = vi.fn<typeof fetch>();

    // Malformed percent-encoding in filename / userId / bucket -> 400
    for (const badPath of [
      `/media/avatars/${userId}/%E0%A4%A`,
      `/media/avatars/${userId}/avatar%ZZ.png`,
      `/media/avatars/%FF/avatar.png`,
      `/media/%E0%A4%A/${userId}/avatar.png`,
    ]) {
      const badRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000${badPath}`),
        { useLocalStore: false, firestoreFetch: fetchSpy },
      );
      expect(badRes?.status).toBe(400);
      expect((await badRes?.json()) as { error: string }).toMatchObject({
        error: "Invalid media path encoding",
      });
    }

    // Decoded filenames containing "/", "\\", or ending in ".meta.json" must be rejected
    for (const rejectedPath of [
      `/media/avatars/${userId}/sub%2Favatar.png`,
      `/media/avatars/${userId}/sub%5Cavatar.png`,
      `/media/avatars/${userId}/..%2Fa.png`,
      `/media/avatars/${userId}/a.png.meta.json`,
      `/media/avatars/${userId}/a.png%2Emeta%2Ejson`,
      `/media/avatars/${userId}/a.png.META.JSON`,
    ]) {
      const rejectedRes = await handleApiOrMediaRequest(
        new Request(`http://localhost:3000${rejectedPath}`),
        { useLocalStore: false, firestoreFetch: fetchSpy },
      );
      expect(rejectedRes?.status).toBe(404);
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("TinkiStore per-user and per-bucket storage quotas", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) {
      const dir = dirs.pop();
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enforces max 20 files per bucket and 50 MB total storage per user", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tinki-quota-"));
    dirs.push(dir);
    const store = new TinkiStore(dir);
    const session = await store.signUp({
      email: "quota@example.com",
      password: "Password123!",
      username: "quotauser",
    });
    const uid = session.user.id;

    // Upload 20 files to avatars (allowed), 21st rejected, overwrite existing path still succeeds
    for (let i = 0; i < MAX_FILES_PER_BUCKET; i++) {
      store.saveMediaFile(uid, "avatars", `${uid}/file-${i}.png`, PNG_BYTES, "image/png");
    }
    expect(() =>
      store.saveMediaFile(uid, "avatars", `${uid}/file-20.png`, PNG_BYTES, "image/png"),
    ).toThrow(/20 files per bucket/i);
    expect(
      store.saveMediaFile(uid, "avatars", `${uid}/file-0.png`, PNG_BYTES, "image/png"),
    ).toBe(`${uid}/file-0.png`);

    // Clear avatars before checking 50 MB cumulative quota
    for (let i = 0; i < MAX_FILES_PER_BUCKET; i++) {
      store.removeMediaFiles(uid, "avatars", [`${uid}/file-${i}.png`]);
    }

    // 10 uploads of 5 MB = 50 MB total across backgrounds & covers
    const fiveMbPng = Buffer.alloc(5 * 1024 * 1024, 0);
    PNG_BYTES.copy(fiveMbPng, 0);

    for (let i = 0; i < 10; i++) {
      const bucket = i < 5 ? "backgrounds" : "covers";
      store.saveMediaFile(uid, bucket, `${uid}/big-${i}.png`, fiveMbPng, "image/png");
    }

    // Adding even a tiny PNG exceeds 50 MB
    expect(() =>
      store.saveMediaFile(uid, "avatars", `${uid}/over-quota.png`, PNG_BYTES, "image/png"),
    ).toThrow(/50 MB/i);
  });
});
