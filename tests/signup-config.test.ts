import { describe, expect, it } from "vitest";
import { EMAIL_SIGNUP_ENABLED, registrationEntryPath } from "../src/lib/signup-config";

describe("email signup availability", () => {
  it("keeps direct email signup gated off while hidden", () => {
    expect(EMAIL_SIGNUP_ENABLED).toBe(false);
  });

  it("routes account-creation entry points to /login", () => {
    expect(registrationEntryPath()).toBe("/login");
  });
});
