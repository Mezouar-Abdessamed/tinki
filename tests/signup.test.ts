import type { Session } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { signUpDirectly } from "../src/lib/signup";

const values = {
  username: "newpage",
  email: "signup-test@example.com",
  password: "test-password-only",
  origin: "https://tinki.lovable.app",
};
const session = { user: { id: "new-user" } } as Session;

describe("direct signup", () => {
  it("returns the authenticated session immediately without a code step", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { session }, error: null });
    expect(await signUpDirectly({ signUp }, values)).toBe(session);
    expect(signUp).toHaveBeenCalledExactlyOnceWith({
      email: values.email,
      password: values.password,
      options: { emailRedirectTo: values.origin, data: { username: "newpage" } },
    });
  });

  it("never treats a signup without a session as authenticated", async () => {
    const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
    await expect(signUpDirectly({ signUp }, values)).rejects.toThrow();
  });

  it("does not continue when account creation fails", async () => {
    const error = new Error("Account already exists");
    const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error });
    await expect(signUpDirectly({ signUp }, values)).rejects.toBe(error);
  });
});