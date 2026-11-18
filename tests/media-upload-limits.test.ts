import { beforeEach, describe, expect, it, vi } from "vitest";

interface FakeBatchOp {
  type: "set" | "update" | "delete";
  path: string;
  data?: Record<string, unknown>;
}

const {
  mockAuth,
  mockStore,
  mockCommittedBatches,
  mockBatch,
  mockGetDoc,
  mockSetDoc,
  mockUpdateDoc,
  mockWriteBatch,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const committedBatches: FakeBatchOp[][] = [];
  let activeOps: FakeBatchOp[] = [];

  const batchObj = {
    set: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      activeOps.push({ type: "set", path: ref.path, data });
    }),
    update: vi.fn((ref: { path: string }, data: Record<string, unknown>) => {
      activeOps.push({ type: "update", path: ref.path, data });
    }),
    delete: vi.fn((ref: { path: string }) => {
      activeOps.push({ type: "delete", path: ref.path });
    }),
    commit: vi.fn(async () => {
      for (const op of activeOps) {
        if (op.type === "set") {
          store.set(op.path, { ...(op.data ?? {}) });
        } else if (op.type === "update") {
          const prev = store.get(op.path);
          if (!prev) {
            throw new Error(`Missing document on batch.update: ${op.path}`);
          }
          store.set(op.path, { ...prev, ...(op.data ?? {}) });
        } else {
          store.delete(op.path);
        }
      }
      committedBatches.push([...activeOps]);
      activeOps = [];
    }),
  };

  return {
    mockStore: store,
    mockCommittedBatches: committedBatches,
    mockBatch: batchObj,
    mockGetDoc: vi.fn(async (ref: { path: string }) => {
      const data = store.get(ref.path);
      return {
        exists: () => data !== undefined,
        id: ref.path.split("/").pop() ?? "",
        data: () => data,
      };
    }),
    mockSetDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      store.set(ref.path, { ...data });
    }),
    mockUpdateDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
      const prev = store.get(ref.path) ?? {};
      store.set(ref.path, { ...prev, ...data });
    }),
    mockWriteBatch: vi.fn(() => {
      activeOps = [];
      return batchObj;
    }),
    mockAuth: {
      currentUser: {
        uid: "owner-uid-1",
        email: "owner@example.com",
        emailVerified: true,
        displayName: "Owner",
        isAnonymous: false,
        tenantId: null,
        providerData: [{ providerId: "google.com" }],
      },
    },
  };
});

vi.mock("firebase/app", () => ({
  getApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  getAuth: vi.fn(() => mockAuth),
  setPersistence: vi.fn(async () => undefined),
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: vi.fn((_db, name: string) => ({ name })),
  deleteDoc: vi.fn(async () => undefined),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: mockGetDoc,
  getDocFromServer: vi.fn(async () => ({ exists: () => false, data: () => undefined })),
  getDocs: vi.fn(async () => ({ docs: [] })),
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  orderBy: vi.fn(),
  query: vi.fn((ref) => ref),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  where: vi.fn(),
  writeBatch: mockWriteBatch,
}));

import {
  ALLOWED_MEDIA_CONTENT_TYPES,
  MAX_MEDIA_OBJECTS_PER_OWNER,
  buildMediaDocId,
  normalizeMediaContentType,
  removeMediaFirestore,
  syncFirebaseAccountDoc,
  uploadMediaFirestore,
} from "../src/lib/firestore-repository";

function makeBlob(content: string, type = ""): Blob {
  return new Blob([content], { type });
}

describe("media_objects MIME type & per-owner quota limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
    mockCommittedBatches.length = 0;
    mockStore.set("accounts/owner-uid-1", {
      id: "owner-uid-1",
      email: "owner@example.com",
      providers: ["google"],
      media_count: 0,
      created_at: "SERVER_TS",
      updated_at: "SERVER_TS",
    });
  });

  it("normalizeMediaContentType accepts the 6 allowed types and rejects dangerous/unknown types", () => {
    expect(MAX_MEDIA_OBJECTS_PER_OWNER).toBe(20);
    expect([...ALLOWED_MEDIA_CONTENT_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/webm",
    ]);

    for (const mime of ALLOWED_MEDIA_CONTENT_TYPES) {
      expect(normalizeMediaContentType(mime)).toBe(mime);
      expect(normalizeMediaContentType(`  ${mime.toUpperCase()} ; charset=utf-8 `)).toBe(mime);
    }

    for (const badMime of [
      "image/svg+xml",
      "text/html",
      "application/javascript",
      "application/octet-stream",
      "video/quicktime",
      "application/pdf",
      "",
      "   ",
    ]) {
      expect(() => normalizeMediaContentType(badMime)).toThrow(/Unsupported file type/i);
    }
  });

  it("uploadMediaFirestore rejects disallowed MIME types before touching Firestore", async () => {
    for (const badMime of [
      "image/svg+xml",
      "text/html",
      "application/javascript",
      "application/octet-stream",
      "video/quicktime",
      "",
    ]) {
      await expect(
        uploadMediaFirestore(
          "avatars",
          "owner-uid-1/bad-file.bin",
          makeBlob("hello", badMime),
          badMime,
        ),
      ).rejects.toThrow(/Unsupported file type/i);
    }

    expect(mockGetDoc).not.toHaveBeenCalled();
    expect(mockBatch.commit).not.toHaveBeenCalled();
  });

  it("uploadMediaFirestore allows all 6 MIME types and atomically updates media_count in the same batch", async () => {
    for (let i = 0; i < ALLOWED_MEDIA_CONTENT_TYPES.length; i += 1) {
      const mime = ALLOWED_MEDIA_CONTENT_TYPES[i]!;
      const objectPath = `owner-uid-1/file-${i}.dat`;
      await uploadMediaFirestore(
        mime.startsWith("video/") ? "backgrounds" : "avatars",
        objectPath,
        makeBlob(`payload-${i}`),
        ` ${mime.toUpperCase()} `,
      );

      const batchOps = mockCommittedBatches[i]!;
      const mediaId = buildMediaDocId(
        mime.startsWith("video/") ? "backgrounds" : "avatars",
        objectPath,
      );
      const mediaOp = batchOps.find(
        (op) => op.type === "set" && op.path === `media_objects/${mediaId}`,
      );
      const accountOp = batchOps.find(
        (op) => op.type === "update" && op.path === "accounts/owner-uid-1",
      );

      expect(mediaOp?.data?.["content_type"]).toBe(mime);
      expect(accountOp?.data).toEqual({
        media_count: i + 1,
        updated_at: "SERVER_TS",
      });
    }

    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(6);
  });

  it("uploadMediaFirestore enforces max 20 media objects per owner and removeMediaFirestore frees quota slots", async () => {
    mockStore.set("accounts/owner-uid-1", {
      id: "owner-uid-1",
      email: "owner@example.com",
      providers: ["google"],
      media_count: 19,
      created_at: "SERVER_TS",
      updated_at: "SERVER_TS",
    });

    // 20th upload succeeds
    await uploadMediaFirestore(
      "covers",
      "owner-uid-1/cover-20.jpg",
      makeBlob("jpeg-bytes", "image/jpeg"),
      "image/jpeg",
    );
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(20);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);

    // 21st upload is rejected client-side BEFORE batch write
    await expect(
      uploadMediaFirestore(
        "covers",
        "owner-uid-1/cover-21.jpg",
        makeBlob("jpeg-bytes", "image/jpeg"),
        "image/jpeg",
      ),
    ).rejects.toThrow(/20/);
    expect(mockBatch.commit).toHaveBeenCalledTimes(1);

    // Removing the 20th upload decrements media_count in the same batch so a new upload succeeds
    await removeMediaFirestore("covers", ["owner-uid-1/cover-20.jpg"]);
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(19);
    expect(mockBatch.commit).toHaveBeenCalledTimes(2);

    const deleteBatchOps = mockCommittedBatches[1]!;
    expect(
      deleteBatchOps.some(
        (op) =>
          op.type === "delete" && op.path === "media_objects/covers__owner-uid-1__cover-20_jpg",
      ),
    ).toBe(true);
    expect(
      deleteBatchOps.some(
        (op) =>
          op.type === "update" &&
          op.path === "accounts/owner-uid-1" &&
          op.data?.["media_count"] === 19,
      ),
    ).toBe(true);

    // Uploading another file succeeds back up to 20
    await uploadMediaFirestore(
      "backgrounds",
      "owner-uid-1/bg-20.webm",
      makeBlob("webm-bytes", "video/webm"),
      "video/webm",
    );
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(20);
  });

  it("initializes media_count to 0 in syncFirebaseAccountDoc and bootstraps missing account doc on upload", async () => {
    mockStore.clear();

    await syncFirebaseAccountDoc(mockAuth.currentUser as never, "creator");
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(0);

    // Simulate missing account doc entirely before an upload
    mockStore.clear();
    await uploadMediaFirestore(
      "avatars",
      "owner-uid-1/first.png",
      makeBlob("png-bytes", "image/png"),
      "image/png",
    );
    expect(mockSetDoc).toHaveBeenCalledTimes(2);
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(1);
  });

  it("removeMediaFirestore skips decrement when legacy account has media_count === 0", async () => {
    const legacyPath = "owner-uid-1/legacy.png";
    const legacyId = buildMediaDocId("avatars", legacyPath);
    mockStore.set(`media_objects/${legacyId}`, {
      id: legacyId,
      owner_id: "owner-uid-1",
      bucket: "avatars",
      object_path: legacyPath,
      name: "legacy.png",
      content_type: "image/png",
      byte_length: 4,
      chunk_count: 1,
    });
    mockStore.set(`media_objects/${legacyId}/chunks/0`, { index: 0, data: "AQID" });

    await removeMediaFirestore("avatars", [legacyPath]);

    expect(mockStore.has(`media_objects/${legacyId}`)).toBe(false);
    expect(mockStore.get("accounts/owner-uid-1")?.["media_count"]).toBe(0);
    const deleteOps = mockCommittedBatches[0]!;
    expect(deleteOps.some((op) => op.path === "accounts/owner-uid-1")).toBe(false);
  });
});
