import QRCode from "qrcode";

import type { QrSettings } from "@/lib/qr-settings";

/**
 * Readability rules for a customized QR code.
 *
 * These checks mirror the exact geometry used by `renderQrSvg`, so what we
 * judge is the configuration that actually gets drawn — colors, dot shape,
 * corner shape, profile picture overlap, center logo size and coverage,
 * quiet zone and output resolution.
 *
 * The goal is to stop configurations that genuinely break scanning, not to
 * block normal designs, so only clearly unsafe values are marked "error".
 */

export type QrIssueSeverity = "error" | "warning";

export type QrIssue = {
  id: string;
  severity: QrIssueSeverity;
  message: string;
};

export type QrValidation = {
  /** No errors and no warnings. */
  ok: boolean;
  /** At least one error — saving must be prevented. */
  blocking: boolean;
  issues: QrIssue[];
  contrast: number;
  /** A corrected copy of the settings that passes every error-level rule. */
  safeSettings: QrSettings;
};

export type QrValidationContext = {
  /** Profile picture drawn above the code. */
  hasAvatar?: boolean;
  /** Center logo drawn in the middle of the code. */
  hasCenterLogo?: boolean;
  /** Pixel width the code is rendered at. */
  renderWidth?: number;
};

const SAFE_FOREGROUND = "#0d1117";
const SAFE_BACKGROUND = "#ffffff";
const MIN_CONTRAST = 3;
const COMFORTABLE_CONTRAST = 4.5;
const MIN_MARGIN = 1;
const COMFORTABLE_MARGIN = 2;
const MIN_PIXELS_PER_MODULE = 2;
const COMFORTABLE_PIXELS_PER_MODULE = 3;
const MAX_LOGO_COVERAGE = 0.12;
const COMFORTABLE_LOGO_COVERAGE = 0.08;

const HIGH_RISK_MODULE_SHAPES = new Set(["dots", "diamond"]);
const HIGH_RISK_EYE_SHAPES = new Set(["circle", "leaf"]);

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1]!, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(channelLuminance) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export type QrCenterBadgeMetrics = {
  clearRadius: number;
  badgeRadius: number;
  strokeWidth: number;
  logoSize: number;
};

export function getQrCenterBadgeMetrics(count: number): QrCenterBadgeMetrics {
  if (count <= 21) {
    return {
      clearRadius: 2.05,
      badgeRadius: 1.94,
      strokeWidth: 0.14,
      logoSize: 3.35,
    };
  }
  return {
    clearRadius: 2.85,
    badgeRadius: 2.7,
    strokeWidth: 0.16,
    logoSize: 4.75,
  };
}

export function isCenterLogoClearedModule(row: number, col: number, count: number): boolean {
  const centerIndex = (count - 1) / 2;
  const dx = Math.abs(col - centerIndex);
  const dy = Math.abs(row - centerIndex);
  const closestDist = Math.hypot(Math.max(0, dx - 0.5), Math.max(0, dy - 0.5));
  return closestDist < getQrCenterBadgeMetrics(count).clearRadius;
}

export function getQrCenterClearSpan(count: number): number {
  return count <= 21 ? 5 : 7;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const light = Math.max(a, b);
  const dark = Math.min(a, b);
  return (light + 0.05) / (dark + 0.05);
}

function moduleCount(value: string, settings: QrSettings, strongCorrection: boolean): number {
  try {
    return QRCode.create(value, {
      errorCorrectionLevel: strongCorrection ? "H" : settings.errorCorrection,
    }).modules.size;
  } catch {
    return 25;
  }
}

/**
 * Validates the configuration that will actually be drawn.
 * Pair this with `decodeRenderedQr` for a real scan of the rendered image.
 */
export function validateQrSettings(
  value: string,
  settings: QrSettings,
  context: QrValidationContext = {},
): QrValidation {
  const { hasAvatar = false, hasCenterLogo = true, renderWidth = 220 } = context;
  const issues: QrIssue[] = [];

  const contrast = contrastRatio(settings.foregroundColor, settings.backgroundColor);
  const foregroundIsLighter =
    relativeLuminance(settings.foregroundColor) > relativeLuminance(settings.backgroundColor);

  // --- Colors -------------------------------------------------------------
  if (contrast < MIN_CONTRAST) {
    issues.push({
      id: "contrast",
      severity: "error",
      message:
        "These colors do not provide enough contrast for reliable scanning. Use a dark code colour on a light background",
    });
  } else if (contrast < COMFORTABLE_CONTRAST) {
    issues.push({
      id: "contrast-low",
      severity: "warning",
      message:
        "The contrast between your two colours is on the low side. A darker code on a lighter background scans faster",
    });
  }

  if (foregroundIsLighter && contrast >= MIN_CONTRAST) {
    issues.push({
      id: "inverted",
      severity: "warning",
      message:
        "A light code on a dark background is not read by every phone camera. Consider swapping the two colours",
    });
  }

  // --- Quiet zone ---------------------------------------------------------
  if (settings.margin < MIN_MARGIN) {
    issues.push({
      id: "quiet-zone",
      severity: "error",
      message:
        "There is no empty space around the code. Scanners need a clear border, so the margin must be at least 1",
    });
  } else if (settings.margin < COMFORTABLE_MARGIN) {
    issues.push({
      id: "quiet-zone-small",
      severity: "warning",
      message:
        "The empty border around the code is quite small, which can slow scanning on busy backgrounds",
    });
  }

  // --- Geometry of logo, picture and resolution ---------------------------
  const strongCorrection = hasAvatar || hasCenterLogo;
  const count = moduleCount(value, settings, strongCorrection);
  const total = count + settings.margin * 2;

  if (hasCenterLogo) {
    let clearedCount = 0;
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (isCenterLogoClearedModule(row, col, count)) clearedCount += 1;
      }
    }
    const coverage = clearedCount / (count * count);
    if (coverage > MAX_LOGO_COVERAGE) {
      issues.push({
        id: "logo-coverage",
        severity: "error",
        message:
          "The centre logo is too large and may prevent the QR code from being scanned. Reduce its size or remove it",
      });
    } else if (coverage > COMFORTABLE_LOGO_COVERAGE) {
      issues.push({
        id: "logo-coverage-high",
        severity: "warning",
        message:
          "The centre logo covers a fair share of the code. Keep it small for the best results",
      });
    }
  }

  if (hasAvatar) {
    const avatarRadius = Math.min(7.6, count * 0.24) / 2;
    // The picture sits on the top edge, so it eats into the quiet zone first.
    const overlapIntoCode = avatarRadius + 0.48 - settings.margin;
    if (overlapIntoCode > 0.5) {
      issues.push({
        id: "avatar-overlap",
        severity: "error",
        message:
          "The profile picture covers too much of the code. Increase the margin so it sits clear of the pattern",
      });
    } else if (overlapIntoCode > 0.3) {
      issues.push({
        id: "avatar-overlap-small",
        severity: "warning",
        message:
          "The profile picture slightly overlaps the top of the code. A larger margin keeps it perfectly clear",
      });
    }
  }

  const pixelsPerModule = renderWidth / total;
  if (pixelsPerModule < MIN_PIXELS_PER_MODULE) {
    issues.push({
      id: "resolution",
      severity: "error",
      message:
        "The code is rendered too small for its amount of data, so the dots blur together. Show it at a larger size",
    });
  } else if (pixelsPerModule < COMFORTABLE_PIXELS_PER_MODULE) {
    issues.push({
      id: "resolution-low",
      severity: "warning",
      message: "The code is quite small on screen, which can make scanning from a distance harder",
    });
  }

  // --- Shapes -------------------------------------------------------------
  const riskyModules = HIGH_RISK_MODULE_SHAPES.has(settings.moduleShape);
  const riskyEyes = HIGH_RISK_EYE_SHAPES.has(settings.eyeShape);
  if (riskyModules && riskyEyes && contrast < COMFORTABLE_CONTRAST) {
    issues.push({
      id: "shapes",
      severity: "error",
      message:
        "This dot and corner shape combination loses too much detail at this contrast. Pick a squarer shape or stronger colours",
    });
  } else if (riskyModules && riskyEyes) {
    issues.push({
      id: "shapes-soft",
      severity: "warning",
      message:
        "Rounded dots together with rounded corners make the pattern softer. Test it with your phone before printing",
    });
  } else if (riskyEyes) {
    issues.push({
      id: "eyes-soft",
      severity: "warning",
      message: "Non-square corner markers can be slower to recognise on older phones",
    });
  }

  const blocking = issues.some((issue) => issue.severity === "error");

  return {
    ok: issues.length === 0,
    blocking,
    issues,
    contrast,
    safeSettings: buildSafeSettings(settings),
  };
}

/** A corrected version of the settings that clears every error-level rule. */
export function buildSafeSettings(settings: QrSettings): QrSettings {
  const safe: QrSettings = { ...settings };
  safe.margin = Math.max(COMFORTABLE_MARGIN, settings.margin);
  if (contrastRatio(safe.foregroundColor, safe.backgroundColor) < COMFORTABLE_CONTRAST) {
    safe.foregroundColor = SAFE_FOREGROUND;
    safe.backgroundColor = SAFE_BACKGROUND;
  } else if (relativeLuminance(safe.foregroundColor) > relativeLuminance(safe.backgroundColor)) {
    const foreground = safe.foregroundColor;
    safe.foregroundColor = safe.backgroundColor;
    safe.backgroundColor = foreground;
  }
  if (HIGH_RISK_MODULE_SHAPES.has(safe.moduleShape) && HIGH_RISK_EYE_SHAPES.has(safe.eyeShape)) {
    safe.eyeShape = "square";
  }
  return safe;
}

export class UnsafeQrSettingsError extends Error {
  issues: QrIssue[];

  constructor(issues: QrIssue[]) {
    super(issues.find((issue) => issue.severity === "error")?.message ?? "Unsafe QR settings");
    this.name = "UnsafeQrSettingsError";
    this.issues = issues;
  }
}
