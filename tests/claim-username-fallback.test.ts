import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuth,
  mockStore,
  mockBatch,
  mockDeleteDoc,
  mockGetDoc,
  mockGetDocFromServer,
  mockSetDoc,
  mockUpdateDoc,
  mockWriteBatch,
} = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  let activeOps: Array<{
    type: "set" | "update" | "delete";
    path: string;
    data?: Record<string, unknown>;
  }> = [];

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
          const prev = store.get(op.path) ?? {};
          store.set(op.path, { ...prev, ...(op.data ?? {}) });
        } else {
          store.delete(op.path);
        }
      }
      activeOps = [];
    }),
  };

  const makeSnapshot = (path: string) => {
    const data = store.get(path);
    return {
      exists: () => data !== undefined,
      id: path.split("/").pop() ?? "",
      data: () => data,
    };
  };

  return {
    mockStore: store,
    mockBatch: batchObj,
    mockDeleteDoc: vi.fn(async (ref: { path: string }) => {
      store.delete(ref.path);
    }),
    mockGetDoc: vi.fn(async (ref: { path: string }) => makeSnapshot(ref.path)),
    mockGetDocFromServer: vi.fn(async (ref: { path: string }) => makeSnapshot(ref.path)),
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
        uid: "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
        email: "dzwolf240@gmail.com",
        emailVerified: true,
        displayName: "Wolf Creator",
        isAnonymous: false,
        tenantId: null,
        providerData: [{ providerId: "google.com", email: "dzwolf240@gmail.com" }],
        reload: vi.fn(async () => undefined),
        getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: true } })),
        getIdToken: vi.fn(async () => "fake-id-token"),
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
  deleteDoc: mockDeleteDoc,
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  getDoc: mockGetDoc,
  getDocFromServer: mockGetDocFromServer,
  getDocs: vi.fn(async () => ({ docs: [] })),
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  orderBy: vi.fn(),
  query: vi.fn((ref) => ref),
  serverTimestamp: vi.fn(() => new Date().toISOString()),
  setDoc: mockSetDoc,
  updateDoc: mockUpdateDoc,
  where: vi.fn(),
  writeBatch: mockWriteBatch,
}));

import {
  checkUsernameAvailableFirestore,
  createProfileFirestore,
  syncFirebaseAccountDoc,
  updateMyProfileFirestore,
} from "../src/lib/firestore-repository";

function makePermissionDeniedError(msg = "Missing or insufficient permissions.") {
  const err = new Error(msg) as Error & { code?: string };
  err.code = "permission-denied";
  return err;
}

describe("createProfileFirestore & updateMyProfileFirestore two-step fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.clear();
  });

  it("falls back to two-step setDoc(usernames) -> setDoc(profiles) when batch.commit hits permission-denied", async () => {
    mockBatch.commit.mockRejectedValueOnce(makePermissionDeniedError());

    const created = await createProfileFirestore("wolf_creator");

    expect(created.username).toBe("wolf_creator");
    expect(created.id).toBe("NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2");
    expect(mockSetDoc).toHaveBeenCalledTimes(3); // usernames, profiles, accounts
    expect(mockStore.get("usernames/wolf_creator")?.["owner_id"]).toBe(
      "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
    );
    expect(mockStore.get("profiles/NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2")?.["username"]).toBe(
      "wolf_creator",
    );
  });

  it("rolls back newly created usernames/{username} claim when profiles/{uid} setDoc fails in fallback", async () => {
    mockBatch.commit.mockRejectedValueOnce(makePermissionDeniedError());
    mockSetDoc.mockImplementation(async (ref: { path: string }, data: Record<string, unknown>) => {
      if (ref.path.startsWith("profiles/")) {
        throw makePermissionDeniedError("Profile rule rejected.");
      }
      mockStore.set(ref.path, { ...data });
    });

    await expect(createProfileFirestore("wolf_creator")).rejects.toThrow(
      /"path":"profiles\/NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2"/,
    );

    expect(mockDeleteDoc).toHaveBeenCalledWith({ path: "usernames/wolf_creator" });
    expect(mockStore.has("usernames/wolf_creator")).toBe(false);
  });

  it("reports usernames/{username} instead of profiles/{uid} if username claim setDoc fails", async () => {
    mockBatch.commit.mockRejectedValueOnce(makePermissionDeniedError());
    mockSetDoc.mockImplementation(async (ref: { path: string }) => {
      if (ref.path === "usernames/wolf_creator") {
        throw makePermissionDeniedError("Username claim rejected.");
      }
    });

    await expect(createProfileFirestore("wolf_creator")).rejects.toThrow(
      /"path":"usernames\/wolf_creator"/,
    );
  });

  it("throws username taken (23505) if a concurrent owner claims the username before fallback setDoc", async () => {
    mockBatch.commit.mockRejectedValueOnce(makePermissionDeniedError());
    mockSetDoc.mockImplementationOnce(async (ref: { path: string }) => {
      mockStore.set(ref.path, {
        username: "wolf_creator",
        owner_id: "OtherUserUid999",
        created_at: new Date().toISOString(),
      });
      throw makePermissionDeniedError();
    });

    await expect(createProfileFirestore("wolf_creator")).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("recovers interrupted two-step claims when usernames/{username} belongs to current user and profile does not exist", async () => {
    mockStore.set("usernames/wolf_creator", {
      username: "wolf_creator",
      owner_id: "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
      created_at: new Date().toISOString(),
    });

    expect(await checkUsernameAvailableFirestore("wolf_creator")).toBe(true);

    // Once the profile exists, another user cannot see it as available, and another owner's claim stays unavailable
    mockStore.set("usernames/taken_by_other", {
      username: "taken_by_other",
      owner_id: "SomeoneElse123",
      created_at: new Date().toISOString(),
    });
    expect(await checkUsernameAvailableFirestore("taken_by_other")).toBe(false);
  });

  it("falls back to two-step claim -> updateDoc -> delete old claim on username rename when batch fails", async () => {
    mockStore.set("usernames/old_name", {
      username: "old_name",
      owner_id: "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
      created_at: new Date().toISOString(),
    });
    mockStore.set("profiles/NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2", {
      id: "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
      username: "old_name",
      verified: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockBatch.commit.mockRejectedValueOnce(makePermissionDeniedError());
    mockSetDoc.mockImplementation(async (ref: { path: string }, data: Record<string, unknown>) => {
      mockStore.set(ref.path, { ...data });
    });

    const updated = await updateMyProfileFirestore({ username: "new_name" });

    expect(updated.username).toBe("new_name");
    expect(mockStore.has("usernames/new_name")).toBe(true);
    expect(mockStore.has("usernames/old_name")).toBe(false);
  });

  it("syncFirebaseAccountDoc converts empty string username on existing account to null", async () => {
    mockStore.set("accounts/NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2", {
      id: "NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2",
      email: "dzwolf240@gmail.com",
      name: "Wolf Creator",
      username: "",
      providers: ["google"],
      media_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await syncFirebaseAccountDoc(mockAuth.currentUser as never);

    expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    expect(mockStore.get("accounts/NHw4Oy1T9RP18aMaBrVZEPJ9Ebk2")?.["username"]).toBeNull();
  });
});
