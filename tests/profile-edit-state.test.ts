import { describe, expect, it } from "vitest";
import { hasProfileEdits, type ProfileEditValues } from "../src/lib/profile-edit-state";

const saved: ProfileEditValues = {
  username: "owner",
  displayName: "Owner",
  bio: "Hello",
  avatarPath: "owner/avatar.png",
  coverPath: "owner/cover.png",
  coverX: 50,
  coverY: 50,
};

describe("staged information edits", () => {
  it("keeps unchanged information clean", () => {
    expect(hasProfileEdits(saved, { ...saved }, false, false)).toBe(false);
  });
  it("includes new cover and avatar selections in the shared save", () => {
    expect(hasProfileEdits(saved, { ...saved }, true, false)).toBe(true);
    expect(hasProfileEdits(saved, { ...saved }, false, true)).toBe(true);
  });
  it("includes removals and repositioning in the shared save", () => {
    expect(hasProfileEdits(saved, { ...saved, avatarPath: null }, false, false)).toBe(true);
    expect(hasProfileEdits(saved, { ...saved, coverPath: null }, false, false)).toBe(true);
    expect(hasProfileEdits(saved, { ...saved, coverY: 60 }, false, false)).toBe(true);
  });
  it("becomes clean when cancel restores all saved values", () => {
    expect(hasProfileEdits(saved, { ...saved, bio: "Draft" }, false, false)).toBe(true);
    expect(hasProfileEdits(saved, { ...saved }, false, false)).toBe(false);
  });
});
