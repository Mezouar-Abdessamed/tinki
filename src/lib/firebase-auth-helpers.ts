const FIREBASE_AUTH_HOSTS = new Map<string, "identitytoolkit" | "securetoken">([
  ["https://identitytoolkit.googleapis.com", "identitytoolkit"],
  ["https://securetoken.googleapis.com", "securetoken"],
]);

export function toFirebaseProxyUrl(inputUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return null;
  }

  const service = FIREBASE_AUTH_HOSTS.get(parsed.origin);
  if (!service) return null;

  return `/api/firebase-proxy/${service}${parsed.pathname}${parsed.search}`;
}

export function buildEmailVerificationContinueUrl(
  origin: string,
  email: string,
  username?: string,
): string {
  const url = new URL("/verify-email", origin);
  url.searchParams.set("email", email);
  if (username) {
    url.searchParams.set("username", username);
  }
  return url.toString();
}

export type MappedFirebaseAuthError = {
  message: string;
  isCancelled: boolean;
  isNetworkError: boolean;
};

export function mapFirebaseAuthError(error: unknown): MappedFirebaseAuthError {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (code === "auth/popup-blocked") {
    return {
      message: "Pop-up was blocked by your browser. Allow pop-ups and try again",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return {
      message: "Google sign-in was cancelled",
      isCancelled: true,
      isNetworkError: false,
    };
  }
  if (code === "auth/unauthorized-domain") {
    return {
      message:
        "This domain is not authorized for Google sign-in. Open the app from its AI Studio URL or authorize this domain in Firebase Authentication",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/operation-not-allowed") {
    return {
      message:
        "Email/Password sign-up is not enabled yet in Firebase Authentication. Enable the Email/Password provider in Firebase Console, or use Sign in with Google below.",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/email-already-in-use") {
    return {
      message: "That email already has an account. Try logging in instead",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/invalid-email") {
    return {
      message: "Please enter a valid email address",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/weak-password") {
    return {
      message: "Password should be at least 8 characters",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/expired-action-code" || code === "auth/invalid-action-code") {
    return {
      message: "That confirmation link has expired or was already used. Request a new email below",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/network-request-failed") {
    return {
      message:
        "Could not reach authentication service. Check your connection or disable any script or tracker blocker for Google and Firebase, then try again",
      isCancelled: false,
      isNetworkError: true,
    };
  }
  if (code === "auth/web-storage-unsupported") {
    return {
      message:
        "Your browser is blocking third-party storage needed for sign-in. Enable cookies or open the app in a regular tab",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/too-many-requests") {
    return {
      message: "Too many attempts. Please wait a minute and try again",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/user-disabled") {
    return {
      message: "This account has been disabled",
      isCancelled: false,
      isNetworkError: false,
    };
  }
  if (code === "auth/account-exists-with-different-credential") {
    return {
      message: "An account already exists with this email using another sign-in method",
      isCancelled: false,
      isNetworkError: false,
    };
  }

  return {
    message:
      error instanceof Error && !error.message.startsWith("Firebase:")
        ? error.message
        : "Authentication didn't work. Please try again",
    isCancelled: false,
    isNetworkError: false,
  };
}
