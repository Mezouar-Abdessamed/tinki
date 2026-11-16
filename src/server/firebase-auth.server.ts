import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { StoreError } from "./store.server";

const GOOGLE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export type GoogleTokenClaims = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
};

type JwkEntry = crypto.JsonWebKey & {
  kid?: string;
  alg?: string;
  use?: string;
};

type CachedJwks = {
  keys: Map<string, JwkEntry>;
  expiresAtMs: number;
};

let cachedProjectId: string | null = null;
let cachedJwks: CachedJwks | null = null;

function readFirebaseApiKey(): string | null {
  const envKey = process.env["FIREBASE_API_KEY"];
  if (envKey && envKey.trim()) return envKey.trim();
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { apiKey?: unknown };
    if (typeof parsed.apiKey === "string" && parsed.apiKey.trim()) {
      return parsed.apiKey.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readFirebaseProjectId(): string {
  if (cachedProjectId) return cachedProjectId;
  const envId = process.env["FIREBASE_PROJECT_ID"];
  if (envId) {
    cachedProjectId = envId;
    return envId;
  }
  const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as { projectId?: unknown };
    if (typeof parsed.projectId === "string" && parsed.projectId.trim()) {
      cachedProjectId = parsed.projectId.trim();
      return cachedProjectId;
    }
  } catch {
    /* handled below */
  }
  throw new StoreError("Authentication service is not configured on the server", 500, "firebase_not_configured");
}

function base64UrlToBuffer(segment: string): Buffer {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + "=".repeat(padLen), "base64");
}

function parseMaxAgeSeconds(cacheControl: string | null): number {
  if (!cacheControl) return 3600;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match || !match[1]) return 3600;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 60 ? parsed : 3600;
}

async function fetchGoogleJwks(forceRefresh = false): Promise<Map<string, JwkEntry>> {
  const now = Date.now();
  if (!forceRefresh && cachedJwks && cachedJwks.expiresAtMs > now) {
    return cachedJwks.keys;
  }

  const response = await fetch(GOOGLE_JWK_URL);
  if (!response.ok) {
    throw new StoreError("Unable to verify Google credentials right now", 502, "google_jwk_unavailable");
  }

  const body = (await response.json()) as { keys?: JwkEntry[] };
  const map = new Map<string, JwkEntry>();
  for (const entry of body.keys ?? []) {
    if (typeof entry.kid === "string" && entry.kid) {
      map.set(entry.kid, entry);
    }
  }
  if (map.size === 0) {
    throw new StoreError("Google verification keys are unavailable", 502, "google_jwk_empty");
  }

  const maxAgeSeconds = parseMaxAgeSeconds(response.headers.get("cache-control"));
  cachedJwks = {
    keys: map,
    expiresAtMs: now + maxAgeSeconds * 1000,
  };
  return map;
}

export type VerifyFirebaseIdTokenOptions = {
  projectId?: string;
  nowSeconds?: number;
  getJwks?: (forceRefresh?: boolean) => Promise<Map<string, JwkEntry>>;
};

export async function verifyFirebaseIdToken(
  idToken: string,
  options: VerifyFirebaseIdTokenOptions = {},
): Promise<GoogleTokenClaims> {
  if (!idToken || typeof idToken !== "string") {
    throw new StoreError("Missing Google sign-in token", 400, "missing_token");
  }

  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new StoreError("Malformed Google sign-in token", 401, "invalid_token");
  }

  const [headerSeg, payloadSeg, signatureSeg] = parts;

  let header: { alg?: unknown; kid?: unknown };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlToBuffer(headerSeg).toString("utf8")) as {
      alg?: unknown;
      kid?: unknown;
    };
    payload = JSON.parse(base64UrlToBuffer(payloadSeg).toString("utf8")) as Record<string, unknown>;
  } catch {
    throw new StoreError("Malformed Google sign-in token", 401, "invalid_token");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new StoreError("Unsupported Google token header", 401, "invalid_token");
  }

  const getJwks = options.getJwks ?? fetchGoogleJwks;
  let keys = await getJwks(false);
  let jwk = keys.get(header.kid);
  if (!jwk) {
    keys = await getJwks(true);
    jwk = keys.get(header.kid);
  }
  if (!jwk) {
    throw new StoreError("Unrecognized Google signing key", 401, "invalid_token");
  }

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    signatureValid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${headerSeg}.${payloadSeg}`),
      publicKey,
      base64UrlToBuffer(signatureSeg),
    );
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    throw new StoreError("Invalid Google token signature", 401, "invalid_token");
  }

  const projectId = options.projectId ?? readFirebaseProjectId();
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const expectedIssuer = `https://securetoken.google.com/${projectId}`;

  const exp = typeof payload["exp"] === "number" ? payload["exp"] : 0;
  const iat = typeof payload["iat"] === "number" ? payload["iat"] : Number.POSITIVE_INFINITY;
  const authTime =
    typeof payload["auth_time"] === "number" ? payload["auth_time"] : Number.POSITIVE_INFINITY;

  if (exp <= nowSeconds) {
    throw new StoreError("Verification session expired. Please try again", 401, "token_expired");
  }
  if (iat > nowSeconds + 300 || authTime > nowSeconds + 300) {
    throw new StoreError("Verification token timestamp is invalid", 401, "invalid_token");
  }
  if (payload["aud"] !== projectId || payload["iss"] !== expectedIssuer) {
    throw new StoreError("Verification token does not match this application", 401, "invalid_audience");
  }

  const sub = typeof payload["sub"] === "string" ? payload["sub"].trim() : "";
  if (!sub || sub.length > 128) {
    throw new StoreError("Verification token subject is missing", 401, "invalid_token");
  }

  const email = typeof payload["email"] === "string" ? payload["email"].trim().toLowerCase() : "";
  if (!email || !email.includes("@")) {
    throw new StoreError("Account did not share an email address", 400, "missing_email");
  }
  if (payload["email_verified"] !== true) {
    throw new StoreError("Your email address must be verified before continuing", 403, "unverified_email");
  }

  const name = typeof payload["name"] === "string" && payload["name"].trim() ? payload["name"].trim() : undefined;
  const picture =
    typeof payload["picture"] === "string" && payload["picture"].trim()
      ? payload["picture"].trim()
      : undefined;

  return {
    uid: sub,
    email,
    ...(name ? { name } : {}),
    ...(picture ? { picture } : {}),
  };
}

export async function signInFirebaseEmailPasswordServer(
  email: string,
  password: string,
): Promise<{ idToken: string } | null> {
  const apiKey = readFirebaseApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { idToken?: unknown };
    return typeof data.idToken === "string" && data.idToken ? { idToken: data.idToken } : null;
  } catch {
    return null;
  }
}
