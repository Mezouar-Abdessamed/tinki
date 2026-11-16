import firebaseConfig from "../../firebase-applet-config.json";
import type { AppTableRow } from "@/lib/app-database";
import type { Profile } from "@/lib/profiles";

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
): Promise<Record<string, unknown> | null> {
  try {
    const cleanPath = docPath.replace(/^\/+/, "");
    const url = `${firestoreBaseUrl()}/${cleanPath}?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const headers: Record<string, string> = {};
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as FirestoreDocument;
    if (!body.fields) return null;
    return decodeFields(body.fields);
  } catch {
    return null;
  }
}

async function runFirestoreStructuredQueryRest(
  collectionId: string,
  fieldPath: string,
  value: string,
  bearerToken?: string,
): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
  try {
    const base = firestoreBaseUrl();
    const url = `${base}:runQuery?key=${encodeURIComponent(firebaseConfig.apiKey)}`;
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;
    const res = await fetch(url, {
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
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<{ document?: FirestoreDocument }>;
    const out: Array<{ id: string; data: Record<string, unknown> }> = [];
    for (const row of rows) {
      if (!row.document?.fields || !row.document.name) continue;
      const docId = row.document.name.split("/").pop() ?? "";
      out.push({ id: docId, data: decodeFields(row.document.fields) });
    }
    return out;
  } catch {
    return [];
  }
}

export async function getUsernameClaimRest(username: string): Promise<{ owner_id: string } | null> {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,20}$/.test(clean)) return null;
  const data = await fetchFirestoreDocRest(`usernames/${encodeURIComponent(clean)}`);
  if (!data || typeof data["owner_id"] !== "string") return null;
  return { owner_id: data["owner_id"] };
}

export async function getProfileByIdRest(profileId: string): Promise<(Profile & { verified: boolean }) | null> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(profileId)) return null;
  const data = await fetchFirestoreDocRest(`profiles/${encodeURIComponent(profileId)}`);
  if (!data || typeof data["username"] !== "string") return null;
  return data as unknown as Profile & { verified: boolean };
}

export async function getProfileByUsernameRest(
  username: string,
): Promise<(Profile & { verified: boolean }) | null> {
  const claim = await getUsernameClaimRest(username);
  if (claim?.owner_id) {
    return getProfileByIdRest(claim.owner_id);
  }
  const clean = username.trim().toLowerCase();
  const matches = await runFirestoreStructuredQueryRest("profiles", "username", clean);
  if (matches[0]) return matches[0].data as unknown as Profile & { verified: boolean };
  return null;
}

export async function listCustomLinksRest(
  profileId: string,
  enabledOnly = false,
): Promise<AppTableRow<"custom_links">[]> {
  const rows = await runFirestoreStructuredQueryRest("custom_links", "profile_id", profileId);
  return rows
    .map((r) => r.data as unknown as AppTableRow<"custom_links">)
    .filter((l) => !enabledOnly || Boolean(l.enabled))
    .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
}

export async function listSocialLinkSettingsRest(
  profileId: string,
): Promise<AppTableRow<"social_link_settings">[]> {
  const rows = await runFirestoreStructuredQueryRest("social_link_settings", "profile_id", profileId);
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
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const mediaId = mediaDocIdFromPath(bucket, objectPath);
  if (!mediaId) return null;

  const meta = await fetchFirestoreDocRest(`media_objects/${encodeURIComponent(mediaId)}`);
  if (!meta) return null;

  const chunkCount = Number(meta["chunk_count"] ?? 0);
  const contentType =
    typeof meta["content_type"] === "string" && meta["content_type"]
      ? meta["content_type"]
      : "application/octet-stream";
  if (!Number.isInteger(chunkCount) || chunkCount <= 0 || chunkCount > 20) return null;

  const chunkDocs = await Promise.all(
    Array.from({ length: chunkCount }, (_, i) =>
      fetchFirestoreDocRest(`media_objects/${encodeURIComponent(mediaId)}/chunks/${i}`),
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
