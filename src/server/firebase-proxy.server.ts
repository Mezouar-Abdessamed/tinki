import firebaseConfig from "../../firebase-applet-config.json";
import { StoreError } from "./local-fallback-store.server";

const ALLOWED_UPSTREAM_HOSTS = {
  identitytoolkit: "https://identitytoolkit.googleapis.com",
  securetoken: "https://securetoken.googleapis.com",
} as const;

type ProxyService = keyof typeof ALLOWED_UPSTREAM_HOSTS;

const ALLOWED_PATHS_BY_SERVICE: Record<ProxyService, ReadonlySet<string>> = {
  identitytoolkit: new Set([
    "/v1/projects",
    "/v1/accounts:signUp",
    "/v1/accounts:signInWithPassword",
    "/v1/accounts:signInWithIdp",
    "/v1/accounts:createAuthUri",
    "/v1/accounts:lookup",
    "/v1/accounts:update",
    "/v1/accounts:resetPassword",
    "/v1/accounts:sendOobCode",
  ]),
  securetoken: new Set(["/v1/token"]),
};
const MAX_PROXY_BODY_BYTES = 64 * 1024;
const PROXY_TIMEOUT_MS = 15_000;

const FORWARDED_REQUEST_HEADERS = [
  "content-type",
  "accept",
  "x-firebase-locale",
  "x-client-version",
  "x-firebase-gmpid",
  "x-goog-api-client",
] as const;

export function resolveFirebaseProxyTarget(
  pathname: string,
  search: string,
  expectedApiKey: string = firebaseConfig.apiKey,
): { service: ProxyService; upstreamUrl: string } {
  const match = pathname.match(/^\/api\/firebase-proxy\/(identitytoolkit|securetoken)(\/.*)$/);
  if (!match) {
    throw new StoreError("Not found", 404);
  }

  const service = match[1] as ProxyService;
  const rawSubpath = match[2] ?? "";

  let decodedSubpath: string;
  try {
    decodedSubpath = decodeURIComponent(rawSubpath);
  } catch {
    throw new StoreError("Invalid proxy path", 400);
  }

  const allowedPaths = ALLOWED_PATHS_BY_SERVICE[service];
  if (
    decodedSubpath.includes("..") ||
    decodedSubpath.includes("//") ||
    decodedSubpath.includes("\\") ||
    rawSubpath !== decodedSubpath ||
    !allowedPaths.has(decodedSubpath)
  ) {
    throw new StoreError("Unsupported Firebase Auth endpoint", 403);
  }

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const providedKey = params.get("key");
  if (!expectedApiKey || providedKey !== expectedApiKey) {
    throw new StoreError("Invalid Firebase API key", 403);
  }

  const baseHost = ALLOWED_UPSTREAM_HOSTS[service];
  const upstreamUrl = `${baseHost}${decodedSubpath}?${params.toString()}`;
  return { service, upstreamUrl };
}

export async function handleFirebaseProxyRequest(
  request: Request,
  options?: {
    expectedApiKey?: string;
    fetchImpl?: typeof fetch;
  },
): Promise<Response> {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const url = new URL(request.url);
  const { upstreamUrl } = resolveFirebaseProxyTarget(
    url.pathname,
    url.search,
    options?.expectedApiKey ?? firebaseConfig.apiKey,
  );

  const forwardHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) forwardHeaders.set(name, value);
  }
  if (!forwardHeaders.has("accept")) {
    forwardHeaders.set("accept", "application/json");
  }

  let bodyBuffer: ArrayBuffer | undefined;
  if (method === "POST") {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > MAX_PROXY_BODY_BYTES) {
      throw new StoreError("Proxy payload too large", 413);
    }
    bodyBuffer = raw;
    if (!forwardHeaders.has("content-type")) {
      forwardHeaders.set("content-type", "application/json");
    }
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetchImpl(upstreamUrl, {
      method,
      headers: forwardHeaders,
      ...(bodyBuffer !== undefined ? { body: bodyBuffer } : {}),
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("[firebase-proxy] upstream fetch failed:", error);
    return new Response(
      JSON.stringify({
        error: {
          code: 502,
          message: "UPSTREAM_UNREACHABLE",
        },
      }),
      {
        status: 502,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }

  const responseBytes = await upstreamResponse.arrayBuffer();
  const responseContentType =
    upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8";

  return new Response(responseBytes, {
    status: upstreamResponse.status,
    headers: {
      "content-type": responseContentType,
      "cache-control": "no-store",
    },
  });
}
