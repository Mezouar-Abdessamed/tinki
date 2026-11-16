import { describe, expect, it } from "vitest";

import { LANG_STORAGE_KEY, SUPPORTED_LANGUAGES } from "../src/lib/i18n";
import { QR_CENTER_LOGO_URL, renderQrSvg } from "../src/lib/qr-render";
import { DEFAULT_QR_SETTINGS } from "../src/lib/qr-settings";
import {
  getQrCenterBadgeMetrics,
  isCenterLogoClearedModule,
  validateQrSettings,
} from "../src/lib/qr-validation";

describe("QR center logo rendering", () => {
  it("embeds the uploaded Tinki SVG logo inside a circular medallion with matching foreground color and border", () => {
    expect(QR_CENTER_LOGO_URL).toBe("/assets/aistudio/tinki_ca348073.svg");
    const svg = renderQrSvg(
      "https://tinki.app/sara.designs",
      {
        ...DEFAULT_QR_SETTINGS,
        foregroundColor: "#0f766e",
        backgroundColor: "#ffffff",
      },
      220,
      { fallback: "Sara" },
    );
    expect(svg).toContain('href="/assets/aistudio/tinki_ca348073.svg"');
    expect(svg).toContain('flood-color="#0f766e"');
    expect(svg).toContain('filter="url(#qr-logo-tint-0f766e)"');
    expect(svg).toContain('stroke="#0f766e" stroke-opacity="0.18"');
  });

  it("uses the light foreground color and dark background medallion without an opaque white box", () => {
    const svg = renderQrSvg(
      "https://tinki.app/sara.designs",
      {
        ...DEFAULT_QR_SETTINGS,
        foregroundColor: "#f8fafc",
        backgroundColor: "#0d1117",
      },
      220,
    );
    expect(svg).toContain('href="/assets/aistudio/tinki_ca348073.svg"');
    expect(svg).toContain('flood-color="#f8fafc"');
    expect(svg).toContain('stroke="#f8fafc" stroke-opacity="0.18"');
    expect(svg).not.toContain('fill="#ffffff"');
  });

  it("uses larger logo proportions inside a symmetric circular perimeter within coverage limits", () => {
    const standard = getQrCenterBadgeMetrics(29);
    const compact = getQrCenterBadgeMetrics(21);
    expect(standard.logoSize).toBeGreaterThanOrEqual(4.7);
    expect(compact.logoSize).toBeGreaterThanOrEqual(3.3);
    expect(standard.logoSize).toBeLessThan(standard.badgeRadius * 2);

    const count = 29;
    let cleared = 0;
    for (let r = 0; r < count; r += 1) {
      for (let c = 0; c < count; c += 1) {
        if (isCenterLogoClearedModule(r, c, count)) cleared += 1;
      }
    }
    expect(cleared).toBe(37);
    const center = (count - 1) / 2;
    expect(isCenterLogoClearedModule(center - 3, center - 3, count)).toBe(false);
    expect(isCenterLogoClearedModule(center + 3, center + 3, count)).toBe(false);
    expect(isCenterLogoClearedModule(center, center, count)).toBe(true);

    const validation = validateQrSettings("https://tinki.app/sara.designs", DEFAULT_QR_SETTINGS);
    expect(validation.issues.some((i) => i.id.startsWith("logo-coverage"))).toBe(false);
  });

  it("exposes all five supported languages through a shared canonical list and storage key", () => {
    expect(LANG_STORAGE_KEY).toBe("linkme-lang");
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(["en", "fr", "es", "de", "ar"]);
  });
});
