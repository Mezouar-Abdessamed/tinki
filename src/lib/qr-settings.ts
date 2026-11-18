import type { QRCodeToDataURLOptions, QRCodeToStringOptions } from "qrcode";

import { updateMyProfile } from "@/lib/profiles";
import {
  UnsafeQrSettingsError,
  validateQrSettings,
  type QrValidationContext,
} from "@/lib/qr-validation";

/**
 * Single source of truth for how a profile's QR code looks.
 * Every place that renders or downloads a QR code reads from here, so a change
 * made on "Customize QR Code" shows up everywhere at once.
 */
export type QrErrorCorrection = "L" | "M" | "Q" | "H";

/** Shape of each small dot in the QR grid. */
export type QrModuleShape = "square" | "rounded" | "dots" | "classy" | "diamond";

/** Shape of the three big corner (finder) squares. */
export type QrEyeShape = "square" | "rounded" | "circle" | "leaf";

export const QR_MODULE_SHAPES: Array<{ value: QrModuleShape; label: string }> = [
  { value: "square", label: "Classic" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
  { value: "diamond", label: "Diamond" },
];

export const QR_EYE_SHAPES: Array<{ value: QrEyeShape; label: string }> = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
  { value: "leaf", label: "Leaf" },
];

export type QrSettings = {
  foregroundColor: string;
  backgroundColor: string;
  margin: number;
  errorCorrection: QrErrorCorrection;
  moduleShape: QrModuleShape;
  eyeShape: QrEyeShape;
};

/**
 * Default look. The margin is wide enough that the profile picture and the
 * centre logo never eat into the pattern, so the default style always passes
 * the readability check and can be saved as-is.
 */
export const DEFAULT_QR_SETTINGS: QrSettings = {
  foregroundColor: "#0d1117",
  backgroundColor: "#ffffff",
  margin: 4,
  errorCorrection: "M",
  moduleShape: "square",
  eyeShape: "square",
};

/** The columns on `profiles` that hold the QR settings. */
export type QrSettingsRow = {
  qr_foreground_color?: string | null;
  qr_background_color?: string | null;
  qr_margin?: number | null;
  qr_error_correction?: string | null;
  qr_module_shape?: string | null;
  qr_eye_shape?: string | null;
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function color(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}

/** Turns a (possibly partial or invalid) database row into usable settings. */
export function qrSettingsFromProfile(row: QrSettingsRow | null | undefined): QrSettings {
  if (!row) return DEFAULT_QR_SETTINGS;
  const margin =
    typeof row.qr_margin === "number" && Number.isFinite(row.qr_margin)
      ? Math.min(8, Math.max(0, Math.round(row.qr_margin)))
      : DEFAULT_QR_SETTINGS.margin;
  const level = row.qr_error_correction;
  return {
    foregroundColor: color(row.qr_foreground_color, DEFAULT_QR_SETTINGS.foregroundColor),
    backgroundColor: color(row.qr_background_color, DEFAULT_QR_SETTINGS.backgroundColor),
    margin,
    errorCorrection:
      level === "L" || level === "M" || level === "Q" || level === "H"
        ? level
        : DEFAULT_QR_SETTINGS.errorCorrection,
    moduleShape: QR_MODULE_SHAPES.some((shape) => shape.value === row.qr_module_shape)
      ? (row.qr_module_shape as QrModuleShape)
      : DEFAULT_QR_SETTINGS.moduleShape,
    eyeShape: QR_EYE_SHAPES.some((shape) => shape.value === row.qr_eye_shape)
      ? (row.qr_eye_shape as QrEyeShape)
      : DEFAULT_QR_SETTINGS.eyeShape,
  };
}

export function qrSettingsToProfile(settings: QrSettings): {
  qr_foreground_color: string;
  qr_background_color: string;
  qr_margin: number;
  qr_error_correction: string;
  qr_module_shape: string;
  qr_eye_shape: string;
} {
  return {
    qr_foreground_color: settings.foregroundColor,
    qr_background_color: settings.backgroundColor,
    qr_margin: settings.margin,
    qr_error_correction: settings.errorCorrection,
    qr_module_shape: settings.moduleShape,
    qr_eye_shape: settings.eyeShape,
  };
}

/** Options handed to the `qrcode` library, shared by the on-screen and download renders. */
export function qrRenderOptions(
  settings: QrSettings,
  overrides: { width?: number; margin?: number } = {},
): QRCodeToStringOptions & QRCodeToDataURLOptions {
  return {
    margin: overrides.margin ?? settings.margin,
    ...(overrides.width ? { width: overrides.width } : {}),
    errorCorrectionLevel: settings.errorCorrection,
    color: { dark: settings.foregroundColor, light: settings.backgroundColor },
  } as QRCodeToStringOptions & QRCodeToDataURLOptions;
}

/**
 * Saves the settings for the signed-in user's profile.
 * A configuration that fails the readability rules is never written.
 */
export async function saveQrSettings(
  profileId: string,
  settings: QrSettings,
  context: QrValidationContext & { profileUrl?: string } = {},
): Promise<void> {
  const { profileUrl, ...validationContext } = context;
  const validation = validateQrSettings(profileUrl ?? "https://example.com/u", settings, {
    hasCenterLogo: true,
    ...validationContext,
  });
  if (validation.blocking) throw new UnsafeQrSettingsError(validation.issues);

  await updateMyProfile(qrSettingsToProfile(settings));
}
