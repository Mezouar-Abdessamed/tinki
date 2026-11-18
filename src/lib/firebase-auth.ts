import { FetchProvider, _castAuth } from "@firebase/auth/internal";
import { getApp, getApps } from "firebase/app";
import {
  GoogleAuthProvider,
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  getRedirectResult,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  verifyPasswordResetCode,
  type Auth,
  type User,
} from "firebase/auth";

import {
  ApiError,
  apiFetch,
  authApi,
  notifyAuthListeners,
  type AuthSession,
} from "@/lib/api-client";
import type { CustomLink, CustomLinkType } from "@/lib/custom-links";
import {
  checkUsernameAvailableFirestore,
  createCustomLinkFirestore,
  createProfileFirestore,
  fetchProfileByIdFirestore,
  getFirebaseClientAuth,
  saveSocialLinkSettingsFirestore,
  syncFirebaseAccountDoc,
  uploadMediaFirestore,
} from "@/lib/firestore-repository";
import {
  mapFirebaseAuthError,
  buildEmailVerificationContinueUrl,
  toFirebaseProxyUrl,
} from "@/lib/firebase-auth-helpers";
import type { Profile } from "@/lib/profiles";
import type { SocialLinkSetting } from "@/lib/social-link-settings";

const DIRECT_FETCH_TIMEOUT_MS = 6_000;
const PENDING_VERIFICATION_STORAGE_KEY = "tinki_pending_verification";
let fetchProviderConfigured = false;
let warmUpPromise: Promise<void> | null = null;
const migrationInFlight = new Map<string, Promise<void>>();

function createResilientFirebaseFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const proxyUrl = toFirebaseProxyUrl(rawUrl);

    if (!proxyUrl || typeof window === "undefined") {
      return fetch(input, init);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DIRECT_FETCH_TIMEOUT_MS);
    const upstreamSignal = init?.signal;
    const onUpstreamAbort = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) {
        controller.abort();
      } else {
        upstreamSignal.addEventListener("abort", onUpstreamAbort, { once: true });
      }
    }

    try {
      const response = await window.fetch(input, {
        ...init,
        signal: controller.signal,
      });
      if (response.status < 500) {
        return response;
      }
    } catch {
      /* direct Google Auth API call failed or timed out — fall back to same-origin proxy */
    } finally {
      window.clearTimeout(timeoutId);
      if (upstreamSignal) {
        upstreamSignal.removeEventListener("abort", onUpstreamAbort);
      }
    }

    const proxyInit: RequestInit = {
      credentials: "same-origin",
      ...(init?.method ? { method: init.method } : {}),
      ...(init?.headers ? { headers: init.headers } : {}),
      ...(init?.body !== undefined ? { body: init.body } : {}),
      ...(init?.signal ? { signal: init.signal } : {}),
    };
    return window.fetch(proxyUrl, proxyInit);
  };
}

function ensureFetchProviderConfigured() {
  if (fetchProviderConfigured || typeof window === "undefined") return;
  fetchProviderConfigured = true;
  FetchProvider.initialize(createResilientFirebaseFetch(), window.Headers, window.Response);
}

export function getFirebaseAuth(): Auth {
  ensureFetchProviderConfigured();
  return getFirebaseClientAuth();
}

function createGoogleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

async function migrateMediaAssetToFirestore(
  bucket: "avatars" | "covers" | "backgrounds",
  rawPath: string | null | undefined,
  targetUid: string,
): Promise<string | null> {
  if (!rawPath) return null;
  if (rawPath.startsWith("/") || /^(https?:|blob:|data:)/i.test(rawPath)) {
    return rawPath;
  }
  const parts = rawPath.split("/");
  if (parts.length !== 2 || !parts[1]) return rawPath;
  const targetPath = `${targetUid}/${parts[1]}`;
  try {
    const res = await fetch(`/media/${bucket}/${rawPath}`, { credentials: "include" });
    if (!res.ok) return targetPath;
    const blob = await res.blob();
    if (blob.size > 0) {
      await uploadMediaFirestore(bucket, targetPath, blob, blob.type || "application/octet-stream");
    }
    return targetPath;
  } catch {
    return rawPath;
  }
}

async function migrateLegacyServerProfileIfMissing(
  fbUser: User,
  serverUserId: string,
): Promise<void> {
  const existingFs = await fetchProfileByIdFirestore(fbUser.uid).catch(() => null);
  if (existingFs) {
    await syncFirebaseAccountDoc(fbUser, existingFs.username).catch(() => undefined);
    return;
  }

  await syncFirebaseAccountDoc(fbUser, null).catch(() => undefined);

  try {
    const { profile: legacyProfile } = await apiFetch<{ profile: Profile | null }>(
      "/api/profiles/me",
    );
    if (!legacyProfile || !legacyProfile.username) return;

    const migratedAvatar = await migrateMediaAssetToFirestore(
      "avatars",
      legacyProfile.avatar_path,
      fbUser.uid,
    );
    const migratedCover = await migrateMediaAssetToFirestore(
      "covers",
      legacyProfile.cover_photo_path,
      fbUser.uid,
    );
    const migratedBgImage = await migrateMediaAssetToFirestore(
      "backgrounds",
      legacyProfile.page_background_image_url,
      fbUser.uid,
    );
    const migratedBgVideo = await migrateMediaAssetToFirestore(
      "backgrounds",
      legacyProfile.page_background_video_url,
      fbUser.uid,
    );

    const created = await createProfileFirestore(legacyProfile.username, {
      ...legacyProfile,
      id: fbUser.uid,
      avatar_path: migratedAvatar,
      cover_photo_path: migratedCover,
      page_background_image_url: migratedBgImage,
      page_background_video_url: migratedBgVideo,
    });

    const sourceId = legacyProfile.id || serverUserId;
    const [{ links }, { settings }] = await Promise.all([
      apiFetch<{ links: CustomLink[] }>(
        `/api/profiles/${encodeURIComponent(sourceId)}/custom-links`,
      ).catch(() => ({ links: [] as CustomLink[] })),
      apiFetch<{ settings: SocialLinkSetting[] }>(
        `/api/profiles/${encodeURIComponent(sourceId)}/social-settings`,
      ).catch(() => ({ settings: [] as SocialLinkSetting[] })),
    ]);

    for (const link of links) {
      await createCustomLinkFirestore({
        name: link.name,
        url: link.url,
        icon: link.icon,
        link_type: (link.link_type as CustomLinkType) || "link",
        position: link.position,
        enabled: link.enabled,
      }).catch(() => undefined);
    }

    if (settings.length > 0) {
      await saveSocialLinkSettingsFirestore(
        settings.map((s) => ({
          ...s,
          profile_id: created.id,
        })),
      ).catch(() => undefined);
    }
  } catch {
    /* legacy migration is best-effort */
  }
}

export async function syncSessionFromFirebaseUser(fbUser: User): Promise<AuthSession> {
  const idToken = await fbUser.getIdToken();
  let session: AuthSession;

  try {
    session = await authApi.signInWithGoogle(idToken);
  } catch {
    const fallbackProviders = [
      ...new Set(
        fbUser.providerData
          .map((p) =>
            p.providerId === "password"
              ? "email"
              : p.providerId === "google.com"
                ? "google"
                : p.providerId,
          )
          .filter(Boolean),
      ),
    ];
    session = {
      user: {
        id: fbUser.uid,
        email: (fbUser.email ?? "").trim().toLowerCase(),
        user_metadata: {},
        identities: (fallbackProviders.length > 0 ? fallbackProviders : ["google"]).map(
          (provider) => ({ provider }),
        ),
      },
    };
    notifyAuthListeners(session);
  }

  const inflight =
    migrationInFlight.get(fbUser.uid) ??
    migrateLegacyServerProfileIfMissing(fbUser, session.user.id).finally(() => {
      migrationInFlight.delete(fbUser.uid);
    });
  migrationInFlight.set(fbUser.uid, inflight);
  await inflight;

  // Ensure auth user id stays aligned with Firebase UID for Firestore rules consistency
  if (session.user.id !== fbUser.uid) {
    session = {
      ...session,
      user: {
        ...session.user,
        id: fbUser.uid,
      },
    };
    notifyAuthListeners(session);
  }

  return session;
}

export function storePendingVerificationState(email: string, username: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      PENDING_VERIFICATION_STORAGE_KEY,
      JSON.stringify({ email, username }),
    );
  } catch {
    /* ignore storage errors */
  }
}

export function readPendingVerificationState(): { email?: string; username?: string } {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(PENDING_VERIFICATION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { email?: unknown; username?: unknown };
    return {
      ...(typeof parsed.email === "string" && parsed.email ? { email: parsed.email } : {}),
      ...(typeof parsed.username === "string" && parsed.username
        ? { username: parsed.username }
        : {}),
    };
  } catch {
    return {};
  }
}

export function clearPendingVerificationState() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_VERIFICATION_STORAGE_KEY);
  } catch {
    /* ignore storage errors */
  }
}

async function sendVerificationEmailWithFallback(
  user: User,
  email: string,
  username?: string,
): Promise<void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (origin) {
    try {
      await sendEmailVerification(user, {
        url: buildEmailVerificationContinueUrl(origin, email, username),
        handleCodeInApp: false,
      });
      return;
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") {
        throw error;
      }
    }
  }
  await sendEmailVerification(user);
}

export function warmUpFirebaseAuth(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (warmUpPromise) return warmUpPromise;

  warmUpPromise = (async () => {
    try {
      const auth = getFirebaseAuth();
      const internal = _castAuth(auth) as unknown as {
        _popupRedirectResolver?: {
          _initialize?: (targetAuth: unknown) => Promise<unknown>;
        } | null;
      };
      await internal._popupRedirectResolver?._initialize?.(auth);
    } catch {
      warmUpPromise = null;
    }
  })();

  return warmUpPromise;
}

export async function completeGoogleRedirectIfPending(): Promise<AuthSession | null> {
  if (typeof window === "undefined") return null;
  try {
    const auth = getFirebaseAuth();
    const result = await getRedirectResult(auth);
    if (!result) return null;
    return await syncSessionFromFirebaseUser(result.user);
  } catch (error) {
    const mapped = mapFirebaseAuthError(error);
    if (mapped.isCancelled) return null;
    throw new Error(mapped.message);
  }
}

function isTopLevelWindow(): boolean {
  try {
    return typeof window !== "undefined" && window.self === window.top;
  } catch {
    return false;
  }
}

export async function signInWithGooglePopup(): Promise<AuthSession> {
  const auth = getFirebaseAuth();
  const provider = createGoogleProvider();

  try {
    const result = await signInWithPopup(auth, provider);
    return await syncSessionFromFirebaseUser(result.user);
  } catch (firstError: unknown) {
    const firstMapped = mapFirebaseAuthError(firstError);
    if (firstMapped.isNetworkError) {
      warmUpPromise = null;
      try {
        const retryResult = await signInWithPopup(auth, provider);
        return await syncSessionFromFirebaseUser(retryResult.user);
      } catch (retryError: unknown) {
        const retryMapped = mapFirebaseAuthError(retryError);
        if (retryMapped.isNetworkError && isTopLevelWindow()) {
          await signInWithRedirect(auth, provider);
          return new Promise<AuthSession>(() => {});
        }
        throw new Error(retryMapped.message);
      }
    }

    throw new Error(firstMapped.message);
  }
}

export async function reauthenticateWithGooglePopup(user: User): Promise<void> {
  ensureFetchProviderConfigured();
  const provider = createGoogleProvider();

  try {
    await reauthenticateWithPopup(user, provider);
  } catch (firstError: unknown) {
    const firstMapped = mapFirebaseAuthError(firstError);
    if (firstMapped.isNetworkError) {
      warmUpPromise = null;
      try {
        await reauthenticateWithPopup(user, provider);
        return;
      } catch (retryError: unknown) {
        throw new Error(mapFirebaseAuthError(retryError).message);
      }
    }
    throw new Error(firstMapped.message);
  }
}

export type SignupVerificationResult =
  | { status: "pending"; email: string; username: string }
  | { status: "verified"; session: AuthSession };

export async function signInWithEmailPasswordFirebase(
  email: string,
  password: string,
): Promise<AuthSession> {
  const auth = getFirebaseAuth();
  const cleanEmail = email.trim().toLowerCase();

  try {
    const credential = await signInWithEmailAndPassword(auth, cleanEmail, password);
    const firebaseUser = credential.user;
    await firebaseUser.reload();
    if (!firebaseUser.emailVerified) {
      await signOut(auth).catch(() => undefined);
      throw new ApiError(
        "Please confirm your email address first. Check your inbox for the confirmation link",
        403,
        "email_not_verified",
      );
    }
    return await syncSessionFromFirebaseUser(firebaseUser);
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    try {
      return await authApi.signInWithPassword({ email: cleanEmail, password });
    } catch (apiErr) {
      if (apiErr instanceof ApiError && apiErr.code === "email_not_verified") {
        throw apiErr;
      }
      throw new Error("Those details don't match an account");
    }
  }
}

export async function sendSignupVerificationEmail(input: {
  email: string;
  password: string;
  username: string;
}): Promise<SignupVerificationResult> {
  const auth = getFirebaseAuth();
  const cleanEmail = input.email.trim().toLowerCase();
  const cleanUsername = input.username.trim().toLowerCase();

  const usernameFree = await checkUsernameAvailableFirestore(cleanUsername);
  if (!usernameFree) {
    throw new Error("That username is already taken");
  }

  try {
    await authApi.checkSignupAvailable({
      email: cleanEmail,
      username: cleanUsername,
    });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === "local_store_disabled")) {
      throw err;
    }
  }

  let firebaseUser: User;
  try {
    const created = await createUserWithEmailAndPassword(auth, cleanEmail, input.password);
    firebaseUser = created.user;
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (code === "auth/email-already-in-use") {
      try {
        const existing = await signInWithEmailAndPassword(auth, cleanEmail, input.password);
        firebaseUser = existing.user;
        await firebaseUser.reload();
        if (firebaseUser.emailVerified) {
          const idToken = await firebaseUser.getIdToken(true);
          let session: AuthSession;
          try {
            session = await authApi.confirmEmailSignup(idToken, cleanUsername);
          } catch (confirmErr) {
            if (confirmErr instanceof ApiError && confirmErr.code === "local_store_disabled") {
              session = await syncSessionFromFirebaseUser(firebaseUser);
            } else {
              throw confirmErr;
            }
          }
          await syncFirebaseAccountDoc(firebaseUser, cleanUsername).catch(() => undefined);
          clearPendingVerificationState();
          return { status: "verified", session };
        }
      } catch {
        throw new Error("That email already has an account. Try logging in instead");
      }
    } else {
      throw new Error(mapFirebaseAuthError(error).message);
    }
  }

  try {
    await sendVerificationEmailWithFallback(firebaseUser, cleanEmail, cleanUsername);
  } catch (error: unknown) {
    throw new Error(mapFirebaseAuthError(error).message);
  }

  try {
    await authApi.registerPendingSignup({
      email: cleanEmail,
      password: input.password,
      username: cleanUsername,
    });
  } catch (err) {
    if (!(err instanceof ApiError && err.code === "local_store_disabled")) {
      throw err;
    }
  }

  storePendingVerificationState(cleanEmail, cleanUsername);
  return { status: "pending", email: cleanEmail, username: cleanUsername };
}

export async function resendSignupVerificationEmail(username?: string): Promise<string> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || !user.email) {
    throw new Error("Your signup session expired. Please submit the sign-up form again");
  }
  try {
    await sendVerificationEmailWithFallback(user, user.email, username);
    return user.email;
  } catch (error: unknown) {
    throw new Error(mapFirebaseAuthError(error).message);
  }
}

export type EmailVerificationCheckResult =
  | { status: "confirmed"; session: AuthSession }
  | { status: "pending"; email?: string }
  | { status: "verified_needs_login" }
  | { status: "no_user" };

export async function checkAndCompleteEmailVerification(options?: {
  oobCode?: string;
  username?: string;
}): Promise<EmailVerificationCheckResult> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();

  let appliedCode = false;
  if (options?.oobCode) {
    try {
      await applyActionCode(auth, options.oobCode);
      appliedCode = true;
    } catch (error: unknown) {
      throw new Error(mapFirebaseAuthError(error).message);
    }
  }

  const user = auth.currentUser;
  if (!user) {
    return appliedCode ? { status: "verified_needs_login" } : { status: "no_user" };
  }

  try {
    await user.reload();
  } catch (error: unknown) {
    throw new Error(mapFirebaseAuthError(error).message);
  }

  if (!user.emailVerified) {
    return {
      status: "pending",
      ...(user.email ? { email: user.email } : {}),
    };
  }

  const stored = readPendingVerificationState();
  const idToken = await user.getIdToken(true);
  const chosenUsername = options?.username ?? stored.username;
  let session: AuthSession;
  try {
    session = await authApi.confirmEmailSignup(idToken, chosenUsername);
  } catch (err) {
    if (err instanceof ApiError && err.code === "local_store_disabled") {
      session = await syncSessionFromFirebaseUser(user);
    } else {
      throw err;
    }
  }
  await syncFirebaseAccountDoc(user, chosenUsername).catch(() => undefined);
  clearPendingVerificationState();
  return { status: "confirmed", session };
}

export async function sendFirebasePasswordResetEmail(email: string): Promise<boolean> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return false;
  const auth = getFirebaseAuth();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  try {
    if (origin) {
      try {
        await sendPasswordResetEmail(auth, cleanEmail, {
          url: `${origin}/reset-password`,
          handleCodeInApp: true,
        });
        return true;
      } catch (error: unknown) {
        const code =
          typeof error === "object" && error !== null && "code" in error
            ? String((error as { code: unknown }).code)
            : "";
        if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") {
          throw error;
        }
      }
    }
    await sendPasswordResetEmail(auth, cleanEmail);
    return true;
  } catch {
    /* never reveal whether an account exists for the supplied email */
    return false;
  }
}

export async function verifyFirebasePasswordResetCode(oobCode: string): Promise<string> {
  const auth = getFirebaseAuth();
  try {
    return await verifyPasswordResetCode(auth, oobCode);
  } catch (error: unknown) {
    throw new Error(mapFirebaseAuthError(error).message);
  }
}

export async function confirmFirebasePasswordReset(
  oobCode: string,
  newPassword: string,
): Promise<string | null> {
  const auth = getFirebaseAuth();
  let email: string | null = null;
  try {
    email = await verifyPasswordResetCode(auth, oobCode);
    await confirmPasswordReset(auth, oobCode, newPassword);
    return email;
  } catch (error: unknown) {
    throw new Error(mapFirebaseAuthError(error).message);
  }
}

export async function signOutFirebaseGoogle(): Promise<void> {
  try {
    if (getApps().length === 0) return;
    await signOut(getAuth(getApp()));
  } catch {
    /* ignore sign-out cleanup errors */
  }
}
