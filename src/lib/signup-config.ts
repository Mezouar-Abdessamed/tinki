export const EMAIL_SIGNUP_ENABLED = false;

export function registrationEntryPath(): "/register" | "/login" {
  return EMAIL_SIGNUP_ENABLED ? "/register" : "/login";
}
