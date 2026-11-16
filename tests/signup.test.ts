import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../src/lib/api";
import { signUpDirectly } from "../src/lib/signup";

const values = {
  username: "newpage",
  email: "signup-test@example.com",
  password: "test-password-only",
  origin: "https://tinki.app",
};

const session: AuthSession = {
  access_token: "token-123",
  token_type: "bearer",
  user: {
    id: "new-user",
    email: values.email,
    user_metadata: { username: values.username },
    identities: [{ provider: "email" }],
  },
};

describe("direct signup", () => {
  it("returns the authenticated session immediately without a code step", async () => {
    const signUp = vi.fn().mockResolvedValue(session);
    expect(await signUpDirectly(values, signUp)).toBe(session);
    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      email: values.email,
      password: values.password,
      username: "newpage",
    });
  });

  it("never treats a signup without an access token as authenticated", async () => {
    const signUp = vi.fn().mockResolvedValue({ ...session, access_token: "" });
    await expect(signUpDirectly(values, signUp)).rejects.toThrow();
  });

  it("does not continue when account creation fails", async () => {
    const error = new Error("Account already exists");
    const signUp = vi.fn().mockRejectedValue(error);
    await expect(signUpDirectly(values, signUp)).rejects.toBe(error);
  });
});
