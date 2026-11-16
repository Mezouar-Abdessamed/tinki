import type { AuthUser } from "@/lib/api";

/**
 * Returns true only when an authenticated social account (e.g. Google)
 * has not yet added an email/password identity.
 */
export function requiresInitialPasswordSetup(
  user: Pick<AuthUser, "identities"> | null | undefined,
): boolean {
  const identities = user?.identities ?? [];
  const hasSocialIdentity = identities.some((identity) => identity.provider !== "email");
  const hasEmailIdentity = identities.some((identity) => identity.provider === "email");
  return hasSocialIdentity && !hasEmailIdentity;
}
