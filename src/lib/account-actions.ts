import { ApiError, authApi, notifyAuthListeners } from "@/lib/api-client";
import {
  clearPendingVerificationState,
  reauthenticateWithGooglePopup,
  signOutFirebaseGoogle,
} from "@/lib/firebase-auth";
import { mapFirebaseAuthError } from "@/lib/firebase-auth-helpers";

export const ACCOUNT_DELETION_REAUTH_MAX_AGE_MS = 5 * 60 * 1000;

export type DeleteMyAccountInput = {
  data: {
    username: string;
    password?: string;
    googleIdToken?: string;
  };
};

async function verifyRecentGoogleAuth(
  fbUser: {
    getIdTokenResult: (forceRefresh?: boolean) => Promise<{ authTime: string }>;
    getIdToken: (forceRefresh?: boolean) => Promise<string>;
  },
  reauth: () => Promise<void>,
): Promise<void> {
  const tokenResult = await fbUser.getIdTokenResult();
  const initialAuthMs = tokenResult?.authTime ? Date.parse(tokenResult.authTime) : Number.NaN;
  const isFresh =
    Number.isFinite(initialAuthMs) &&
    Date.now() - initialAuthMs <= ACCOUNT_DELETION_REAUTH_MAX_AGE_MS;

  if (isFresh) {
    return;
  }

  await reauth();
  await fbUser.getIdToken(true);
  const refreshedResult = await fbUser.getIdTokenResult();
  const refreshedAuthMs = refreshedResult?.authTime
    ? Date.parse(refreshedResult.authTime)
    : Number.NaN;
  if (
    !Number.isFinite(refreshedAuthMs) ||
    Date.now() - refreshedAuthMs > ACCOUNT_DELETION_REAUTH_MAX_AGE_MS
  ) {
    throw new Error("Please sign in with Google again before deleting your account");
  }
}

export async function deleteMyAccount(input: DeleteMyAccountInput): Promise<{ success: boolean }> {
  const cleanUsername = input.data.username.trim().toLowerCase();
  if (!cleanUsername) {
    throw new Error("Please type your username to confirm account deletion");
  }

  const {
    auth: fbAuth,
    deleteAccountFirestore,
    fetchProfileByIdFirestore,
  } = await import("@/lib/firestore-repository");

  const fbUser = fbAuth.currentUser;

  if (fbUser) {
    const profile = await fetchProfileByIdFirestore(fbUser.uid).catch(() => null);
    if (profile && profile.username.toLowerCase() !== cleanUsername) {
      throw new Error("The username you typed does not match this account");
    }

    const hasPasswordProvider = fbUser.providerData.some((p) => p.providerId === "password");
    if (hasPasswordProvider) {
      if (!input.data.password) {
        throw new Error("Your current password is incorrect");
      }
      if (fbUser.email) {
        const { EmailAuthProvider, reauthenticateWithCredential } = await import("firebase/auth");
        const cred = EmailAuthProvider.credential(fbUser.email, input.data.password);
        try {
          await reauthenticateWithCredential(fbUser, cred);
        } catch (err) {
          throw new Error(mapFirebaseAuthError(err).message);
        }
      }
    } else {
      await verifyRecentGoogleAuth(fbUser, () => reauthenticateWithGooglePopup(fbUser));
    }

    const freshIdToken = input.data.googleIdToken ?? (await fbUser.getIdToken(true));

    // Delete all Firestore documents (accounts, usernames, profiles, custom_links,
    // social_link_settings, profile_events) and Storage/media chunks while still authenticated.
    await deleteAccountFirestore();

    // Notify server to revoke session cookies, clean up local store/media if active,
    // and double-check Firestore cleanup via REST.
    try {
      await authApi.deleteAccount({
        username: cleanUsername,
        ...(input.data.password ? { password: input.data.password } : {}),
        ...(freshIdToken ? { idToken: freshIdToken } : {}),
      });
    } catch (err) {
      if (!(err instanceof ApiError && err.code === "local_store_disabled")) {
        throw err;
      }
    }

    // Delete the Firebase Auth user to permanently revoke Firebase ID/refresh tokens.
    try {
      await fbUser.delete();
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (code !== "auth/user-not-found") {
        throw new Error(mapFirebaseAuthError(err).message);
      }
    }

    await signOutFirebaseGoogle();
    clearPendingVerificationState();
    notifyAuthListeners(null);
    return { success: true };
  }

  await authApi.deleteAccount({
    username: cleanUsername,
    ...(input.data.password ? { password: input.data.password } : {}),
    ...(input.data.googleIdToken ? { idToken: input.data.googleIdToken } : {}),
  });
  clearPendingVerificationState();
  notifyAuthListeners(null);
  return { success: true };
}
