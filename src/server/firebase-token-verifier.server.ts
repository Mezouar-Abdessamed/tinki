import crypto from "node:crypto";

import firebaseConfig from "../../firebase-applet-config.json";
import { StoreError } from "./local-fallback-store.server";

const GOOGLE_JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export const REAUTH_MAX_AGE_SECONDS = 5 * 60;

export type GoogleTokenClaims = {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  authTime?: number;
  signInProvider?: string;
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
  if (typeof firebaseConfig.apiKey === "string" && firebaseConfig.apiKey.trim()) {
    return firebaseConfig.apiKey.trim();
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
  if (typeof firebaseConfig.projectId === "string" && firebaseConfig.projectId.trim()) {
    cachedProjectId = firebaseConfig.projectId.trim();
    return cachedProjectId;
  }
  throw new StoreError(
    "Authentication service is not configured on the server",
    500,
    "firebase_not_configured",
  );
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
    throw new StoreError(
      "Unable to verify Google credentials right now",
      502,
      "google_jwk_unavailable",
    );
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
    throw new StoreError(
      "Verification token does not match this application",
      401,
      "invalid_audience",
    );
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
    throw new StoreError(
      "Your email address must be verified before continuing",
      403,
      "unverified_email",
    );
  }

  const name =
    typeof payload["name"] === "string" && payload["name"].trim()
      ? payload["name"].trim()
      : undefined;
  const picture =
    typeof payload["picture"] === "string" && payload["picture"].trim()
      ? payload["picture"].trim()
      : undefined;

  const firebaseClaims =
    typeof payload["firebase"] === "object" && payload["firebase"] !== null
      ? (payload["firebase"] as Record<string, unknown>)
      : undefined;
  const signInProvider =
    firebaseClaims && typeof firebaseClaims["sign_in_provider"] === "string"
      ? firebaseClaims["sign_in_provider"].trim()
      : undefined;
  const parsedAuthTime =
    typeof payload["auth_time"] === "number" &&
    Number.isFinite(payload["auth_time"]) &&
    payload["auth_time"] > 0
      ? payload["auth_time"]
      : undefined;

  return {
    uid: sub,
    email,
    ...(name ? { name } : {}),
    ...(picture ? { picture } : {}),
    ...(parsedAuthTime !== undefined ? { authTime: parsedAuthTime } : {}),
    ...(signInProvider ? { signInProvider } : {}),
  };
}

export function assertRecentGoogleAuth(
  claims: { authTime?: number },
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = REAUTH_MAX_AGE_SECONDS,
): void {
  if (
    typeof claims.authTime !== "number" ||
    !Number.isFinite(claims.authTime) ||
    nowSeconds - claims.authTime > maxAgeSeconds
  ) {
    throw new StoreError(
      "Please sign in with Google again before deleting your account",
      401,
      "reauth_required",
    );
  }
}

export async function deleteFirebaseAuthUserServer(
  idToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const apiKey = readFirebaseApiKey();
  if (!apiKey || !idToken) return false;

  try {
    const response = await fetchImpl(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
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

export async function sendFirebasePasswordResetEmailServer(
  email: string,
  continueUrl?: string,
): Promise<void> {
  const apiKey = readFirebaseApiKey();
  const cleanEmail = email.trim().toLowerCase();
  if (!apiKey || !cleanEmail) return;

  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`;
  const send = async (withContinueUrl: boolean) => {
    const payload =
      withContinueUrl && continueUrl
        ? {
            requestType: "PASSWORD_RESET",
            email: cleanEmail,
            continueUrl,
            canHandleCodeInApp: true,
          }
        : { requestType: "PASSWORD_RESET", email: cleanEmail };
    return fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  };

  try {
    const first = await send(true);
    if (!first.ok && continueUrl) {
      const body = (await first.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      const errMsg = body?.error?.message ?? "";
      if (
        errMsg.includes("UNAUTHORIZED_DOMAIN") ||
        errMsg.includes("INVALID_CONTINUE_URI") ||
        errMsg.includes("MISSING_CONTINUE_URI")
      ) {
        await send(false);
      }
    }
  } catch {
    /* never reveal user existence or delivery errors to callers */
  }
}
