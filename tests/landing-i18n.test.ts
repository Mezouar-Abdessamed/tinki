import { describe, expect, it } from "vitest";

import { AR } from "../src/lib/i18n-ar";
import { DE } from "../src/lib/i18n-de";
import { ES } from "../src/lib/i18n-es";
import { FR } from "../src/lib/i18n-fr";
import {
  LANDING_DOT_SHAPES,
  LANDING_EYE_SHAPES,
  LANDING_QR_PRESETS,
  LANDING_THEME_PRESETS,
  LANDING_TRANSLATION_KEYS,
} from "../src/lib/landing-content";

describe("Landing page translations", () => {
  const uniqueKeys = [...new Set(LANDING_TRANSLATION_KEYS)];

  it.each([
    ["French (FR)", FR],
    ["Spanish (ES)", ES],
    ["German (DE)", DE],
    ["Arabic (AR)", AR],
  ])("has non-empty translations for every landing key in %s", (_label, dict) => {
    const missing = uniqueKeys.filter((key) => {
      const value = dict[key];
      return typeof value !== "string" || value.trim().length === 0;
    });
    expect(missing).toEqual([]);
  });

  it("provides valid theme and QR studio presets for interactive previews", () => {
    expect(LANDING_THEME_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(LANDING_QR_PRESETS).toHaveLength(5);
    expect(LANDING_DOT_SHAPES).toHaveLength(5);
    expect(LANDING_EYE_SHAPES).toHaveLength(4);
  });
});
