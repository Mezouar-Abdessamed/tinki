import { describe, expect, it } from "vitest";
import { EMAIL_SIGNUP_ENABLED, registrationEntryPath } from "../src/lib/signup-availability";

describe("temporary email signup pause", () => {
  it("keeps the email signup form disabled until it is repaired", () => {
    expect(EMAIL_SIGNUP_ENABLED).toBe(false);
  });

  it("takes account-creation entry points to login during the pause", () => {
    expect(registrationEntryPath()).toBe("/login");
  });
});