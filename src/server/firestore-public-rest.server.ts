import firebaseConfig from "../../firebase-applet-config.json";
import type { AppTableRow } from "@/lib/database-types";
import type { Profile } from "@/lib/profiles";
import { StoreError } from "./local-fallback-store.server";

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { arrayValue: { values?: FirestoreValue[] } }
  | { mapValue: { fields?: Record<string, FirestoreValue> } };

type FirestoreDocument = {
  name?: string;
  fields?: Record<string, FirestoreValue>;
};

function firestoreBaseUrl(): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(firebaseConfig.projectId)}/databases/${encodeURIComponent(firebaseConfig.firestoreDatabaseId)}/documents`;
}

function decodeValue(val: FirestoreValue | undefined): unknown {
  if (!val) return null;
  if ("nullValue" in val) return null;
  if ("stringValue" in val) return val.stringValue;
  if ("booleanValue" in val) return val.booleanValue;
  if ("integerValue" in val) return Number.parseInt(val.integerValue, 10);
  if ("doubleValue" in val) return val.doubleValue;
  if ("timestampValue" in val) return val.timestampValue;
  if ("arrayValue" in val) return (val.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in val) return decodeFields(val.mapValue.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

async function fetchFirestoreDocRest(
  docPath: string,
  bearerToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown> | null> {
  let res: Response;
  try {
    const cleanPath = docPath.replace(/^\/+/, "");
    const url = `${firestoreBaseUrl()}/${cleanPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const headers: Record<string, string> = {};
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    res = await fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.error("[FirestoreREST] Network error fetching document:", docPath, err);
    throw new StoreError("Unable to reach Firestore", 502, "firestore_unavailable");
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[FirestoreREST] Error fetching document:", docPath, res.status);
    throw new StoreError("Firestore request failed", 502, "firestore_unavailable");
  }
  const body = (await res.json()) as FirestoreDocument;
  if (!body.fields) return null;
  return decodeFields(body.fields);
}

async function runFirestoreStructuredQueryRest(
  collectionId: string,
  fieldPath: string,
  value: string,
  bearerToken?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  let res: Response;
  try {
    const base = firestoreBaseUrl();
    const url = `${base}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: "EQUAL",
              value: { stringValue: value },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.error("[FirestoreREST] Network error querying collection:", collectionId, err);
    throw new StoreError("Unable to reach Firestore", 502, "firestore_unavailable");
  }

  if (!res.ok) {
    console.error("[FirestoreREST] Error querying collection:", collectionId, res.status);
    throw new StoreError("Firestore query failed", 502, "firestore_unavailable");
  }
  const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
  const out: Array<{ id: string; data: Record<string, unknown> }> = [];
  for (const row of rows) {
    if (!row.document?.fields || !row.document.name) continue;
    const docId = row.document.name.split("/").pop() ?? "";
    out.push({ id: docId, data: decodeFields(row.document.fields) });
  }
  return out;
}

export async function getUsernameClaimRest(
  username: string,
  fetchImpl?: typeof fetch,
): Promise<{ owner_id: string } | null> {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,20}$/.test(clean)) return null;
  const data = await fetchFirestoreDocRest(
    `usernames/${encodeURIComponent(clean)}`,
    undefined,
    fetchImpl,
  );
  if (!data || typeof data["owner_id"] !== "string") return null;
  return { owner_id: data["owner_id"] };
}

export async function getProfileByIdRest(
  profileId: string,
  fetchImpl?: typeof fetch,
): Promise<(Profile & { verified: boolean }) | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) return null;
  const data = await fetchFirestoreDocRest(
    `profiles/${encodeURIComponent(profileId)}`,
    undefined,
    fetchImpl,
  );
  if (!data || typeof data["username"] !== "string") return null;
  return data as unknown as Profile & { verified: boolean };
}

export async function getProfileByUsernameRest(
  username: string,
  fetchImpl?: typeof fetch,
): Promise<(Profile & { verified: boolean }) | null> {
  const claim = await getUsernameClaimRest(username, fetchImpl);
  if (claim?.owner_id) {
    return getProfileByIdRest(claim.owner_id, fetchImpl);
  }
  const clean = username.trim().toLowerCase();
  const matches = await runFirestoreStructuredQueryRest(
    "profiles",
    "username",
    clean,
    undefined,
    fetchImpl,
  );
  if (matches[0]) return matches[0].data as unknown as Profile & { verified: boolean };
  return null;
}

export async function listCustomLinksRest(
  profileId: string,
  enabledOnly = false,
  fetchImpl?: typeof fetch,
): Promise<AppTableRow<"custom_links">[]> {
  const rows = await runFirestoreStructuredQueryRest(
    "custom_links",
    "profile_id",
    profileId,
    undefined,
    fetchImpl,
  );
  return rows
    .map((r) => r.data as unknown as AppTableRow<"custom_links">)
    .filter((l) => !enabledOnly || Boolean(l.enabled))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

export async function listSocialLinkSettingsRest(
  profileId: string,
  fetchImpl?: typeof fetch,
): Promise<AppTableRow<"social_link_settings">[]> {
  const rows = await runFirestoreStructuredQueryRest(
    "social_link_settings",
    "profile_id",
    profileId,
    undefined,
    fetchImpl,
  );
  return rows
    .map((r) => r.data as unknown as AppTableRow<"social_link_settings">)
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

export function mediaDocIdFromPath(bucket: string, objectPath: string): string | null {
  const parts = objectPath.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const safeFile = parts[1].replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${bucket}__${parts[0]}__${safeFile}`;
}

export async function readMediaFromFirestoreRest(
  bucket: string,
  objectPath: string,
  fetchImpl?: typeof fetch,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const mediaId = mediaDocIdFromPath(bucket, objectPath);
  if (!mediaId) return null;

  const meta = await fetchFirestoreDocRest(
    `media_objects/${encodeURIComponent(mediaId)}`,
    undefined,
    fetchImpl,
  );
  if (!meta) return null;

  const chunkCount = Number(meta["chunk_count"] ?? 0);
  const contentType =
    typeof meta["content_type"] === "string" && meta["content_type"]
      ? meta["content_type"]
      : "application/octet-stream";
  if (!Number.isInteger(chunkCount) || chunkCount <= 0 || chunkCount > 20) return null;

  const chunkDocs = await Promise.all(
    Array.from({ length: chunkCount }, (_, i) =>
      fetchFirestoreDocRest(
        `media_objects/${encodeURIComponent(mediaId)}/chunks/${i}`,
        undefined,
        fetchImpl,
      ),
    ),
  );

  const buffers: Buffer[] = [];
  for (let i = 0; i < chunkDocs.length; i++) {
    const chunk = chunkDocs[i];
    if (!chunk || typeof chunk["data"] !== "string") return null;
    buffers.push(Buffer.from(chunk["data"], "base64"));
  }

  return {
    bytes: Buffer.concat(buffers),
    contentType,
  };
}

export async function fetchCustomLinkByIdRest(
  linkId: string,
  fetchImpl?: typeof fetch,
): Promise<AppTableRow<"custom_links"> | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(linkId)) return null;
  const data = await fetchFirestoreDocRest(
    `custom_links/${encodeURIComponent(linkId)}`,
    undefined,
    fetchImpl,
  );
  if (!data || typeof data["profile_id"] !== "string") return null;
  return data as unknown as AppTableRow<"custom_links">;
}

export async function createProfileEventRest(
  input: {
    eventId: string;
    profile_id: string;
    event_type: "profile_view" | "social_click" | "custom_link_click";
    platform: string | null;
    custom_link_id: string | null;
    visitor_id: string | null;
    country: string | null;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ created: boolean }> {
  const stringOrNull = (val: string | null): FirestoreValue =>
    val !== null ? { stringValue: val } : { nullValue: null };

  const docName = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents/profile_events/${input.eventId}`;
  const url = `${firestoreBaseUrl()}:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docName,
              fields: {
                id: { stringValue: input.eventId },
                profile_id: { stringValue: input.profile_id },
                event_type: { stringValue: input.event_type },
                platform: stringOrNull(input.platform),
                custom_link_id: stringOrNull(input.custom_link_id),
                visitor_id: stringOrNull(input.visitor_id),
                country: stringOrNull(input.country),
              },
            },
            updateTransforms: [
              {
                fieldPath: "created_at",
                setToServerValue: "REQUEST_TIME",
              },
            ],
            currentDocument: {
              exists: false,
            },
          },
        ],
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (err) {
    console.error("[FirestoreREST] Network error creating profile event:", err);
    throw new StoreError("Unable to reach Firestore", 502, "firestore_unavailable");
  }

  if (res.status === 409) {
    return { created: false };
  }
  if (!res.ok) {
    console.error("[FirestoreREST] Error creating profile event:", res.status);
    throw new StoreError("Firestore event write failed", 502, "firestore_unavailable");
  }
  return { created: true };
}

async function commitFirestoreDeletesRest(
  relativeDocPaths: string[],
  bearerToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (relativeDocPaths.length === 0) return;

  const documentsRoot = `projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId}/documents`;
  const url = `${firestoreBaseUrl()}:commit?key=${encodeURIComponent(firebaseConfig.apiKey)}`;

  for (let i = 0; i < relativeDocPaths.length; i += 400) {
    const chunk = relativeDocPaths.slice(i, i + 400);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          writes: chunk.map((relPath) => ({
            delete: `${documentsRoot}/${relPath.replace(/^\/+/, "")}`,
          })),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      console.error("[FirestoreREST] Network error deleting user documents:", err);
      throw new StoreError("Unable to reach Firestore", 502, "firestore_unavailable");
    }

    if (res.status === 401 || res.status === 403) {
      throw new StoreError(
        "Authentication expired or lacked permission to delete account data",
        res.status,
        "permission_denied",
      );
    }
    if (!res.ok) {
      console.error("[FirestoreREST] Error deleting user documents:", res.status);
      throw new StoreError("Firestore delete failed", 502, "firestore_unavailable");
    }
  }
}

export async function deleteUserDataFromFirestoreRest(
  uid: string,
  bearerToken: string,
  options: {
    expectedUsername?: string;
    fetchImpl?: typeof fetch | undefined;
  } = {},
): Promise<{ deletedPaths: string[] }> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid) || !bearerToken) {
    throw new StoreError("Unauthorized", 401, "unauthorized");
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  const [profileDoc, accountDoc] = await Promise.all([
    fetchFirestoreDocRest(`profiles/${encodeURIComponent(uid)}`, bearerToken, fetchImpl),
    fetchFirestoreDocRest(`accounts/${encodeURIComponent(uid)}`, bearerToken, fetchImpl),
  ]);

  const profileUsername =
    typeof profileDoc?.["username"] === "string" && profileDoc["username"]
      ? profileDoc["username"]
      : null;
  const accountUsername =
    typeof accountDoc?.["username"] === "string" && accountDoc["username"]
      ? accountDoc["username"]
      : null;
  const canonicalUsername = profileUsername ?? accountUsername;

  if (
    options.expectedUsername !== undefined &&
    canonicalUsername &&
    canonicalUsername.toLowerCase() !== options.expectedUsername.trim().toLowerCase()
  ) {
    throw new StoreError("The username you typed does not match this account", 400);
  }

  const deletedPaths: string[] = [];

  // Delete media chunks in the same commit batch (or before) their parent media_object doc
  // so security rules checking exists(/media_objects/{id}) pass during batch evaluation.
  const mediaDocs = await runFirestoreStructuredQueryRest(
    "media_objects",
    "owner_id",
    uid,
    bearerToken,
    fetchImpl,
  );
  for (const mediaDoc of mediaDocs) {
    const chunkCount = Math.min(20, Math.max(0, Number(mediaDoc.data["chunk_count"] ?? 0)));
    const batchPaths: string[] = [];
    for (let i = 0; i < chunkCount; i++) {
      batchPaths.push(`media_objects/${mediaDoc.id}/chunks/${i}`);
    }
    batchPaths.push(`media_objects/${mediaDoc.id}`);
    await commitFirestoreDeletesRest(batchPaths, bearerToken, fetchImpl);
    deletedPaths.push(...batchPaths);
  }

  const [eventDocs, linkDocs, settingDocs] = await Promise.all([
    runFirestoreStructuredQueryRest("profile_events", "profile_id", uid, bearerToken, fetchImpl),
    runFirestoreStructuredQueryRest("custom_links", "profile_id", uid, bearerToken, fetchImpl),
    runFirestoreStructuredQueryRest(
      "social_link_settings",
      "profile_id",
      uid,
      bearerToken,
      fetchImpl,
    ),
  ]);

  const remainingPaths: string[] = [
    ...eventDocs.map((d) => `profile_events/${d.id}`),
    ...linkDocs.map((d) => `custom_links/${d.id}`),
    ...settingDocs.map((d) => `social_link_settings/${d.id}`),
  ];

  const claimedUsernames = new Set<string>();
  if (profileUsername) claimedUsernames.add(profileUsername.toLowerCase());
  if (accountUsername) claimedUsernames.add(accountUsername.toLowerCase());
  for (const uname of claimedUsernames) {
    remainingPaths.push(`usernames/${uname}`);
  }

  remainingPaths.push(`profiles/${uid}`);
  remainingPaths.push(`accounts/${uid}`);

  await commitFirestoreDeletesRest(remainingPaths, bearerToken, fetchImpl);
  deletedPaths.push(...remainingPaths);

  return { deletedPaths };
}
