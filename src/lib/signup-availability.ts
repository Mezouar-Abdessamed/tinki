// Temporary presentation switch; does not change hosted auth or Google login.
export const EMAIL_SIGNUP_ENABLED = false;

export function registrationEntryPath(): "/register" | "/login" {
  return EMAIL_SIGNUP_ENABLED ? "/register" : "/login";
}