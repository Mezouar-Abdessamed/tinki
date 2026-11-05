import QRCode from "qrcode";
import qrCenterAsset from "@/assets/tinki-qr-center.png.asset.json";

import type { QrEyeShape, QrModuleShape, QrSettings } from "@/lib/qr-settings";

const QR_CENTER_LOGO_URL = qrCenterAsset.url;

export type QrAvatar = {
  url?: string | null | undefined;
  fallback: string;
};

/**
 * Renders a QR code to SVG with custom module / eye shapes.
 *
 * The encoded payload is untouched — we only change how each dark module is
 * painted. Finder patterns are drawn separately so they keep their exact
 * position and proportions, which is what scanners actually look for.
 */

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}"/>`;
}

function modulePath(shape: QrModuleShape, x: number, y: number): string {
  switch (shape) {
    case "dots":
      return `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.46"/>`;
    case "rounded":
      return roundedRect(x + 0.04, y + 0.04, 0.92, 0.92, 0.32);
    case "classy":
      // Rounded on two opposite corners, sharp on the other two.
      return `<path d="M${x + 0.04} ${y + 0.42}a0.38 0.38 0 0 1 0.38 -0.38h0.54v0.54a0.38 0.38 0 0 1 -0.38 0.38h-0.54z"/>`;
    case "diamond":
      return `<path d="M${x + 0.5} ${y + 0.03}L${x + 0.97} ${y + 0.5}L${x + 0.5} ${y + 0.97}L${x + 0.03} ${y + 0.5}z"/>`;
    case "square":
    default:
      return `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
}

function eyeShapePath(shape: QrEyeShape, x: number, y: number, size: number): string {
  const r = size / 2;
  switch (shape) {
    case "circle":
      return `<circle cx="${x + r}" cy="${y + r}" r="${r}"/>`;
    case "rounded":
      return roundedRect(x, y, size, size, size * 0.28);
    case "leaf":
      return `<path d="M${x} ${y + size * 0.45}a${size * 0.45} ${size * 0.45} 0 0 1 ${size * 0.45} -${size * 0.45}h${size * 0.55}v${size * 0.55}a${size * 0.45} ${size * 0.45} 0 0 1 -${size * 0.45} ${size * 0.45}h-${size * 0.55}z"/>`;
    case "square":
    default:
      return `<rect x="${x}" y="${y}" width="${size}" height="${size}"/>`;
  }
}

function isFinderModule(row: number, col: number, count: number): boolean {
  return (
    (row < 7 && col < 7) ||
    (row < 7 && col >= count - 7) ||
    (row >= count - 7 && col < 7)
  );
}

function escapeXml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return entities[character] ?? character;
  });
}

function avatarInitials(value: string): string {
  const initials = value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

export function renderQrSvg(
  value: string,
  settings: QrSettings,
  width: number,
  avatar?: QrAvatar,
  centerLogoUrl: string | null = QR_CENTER_LOGO_URL,
): string {
  // The avatar and center logo mask a small number of modules, so branded QRs
  // always use the strongest correction level. Finder patterns stay clear.
  const qr = QRCode.create(value, {
    errorCorrectionLevel: centerLogoUrl || avatar ? "H" : settings.errorCorrection,
  });
  const count = qr.modules.size;
  const data = qr.modules.data;
  const margin = settings.margin;
  const total = count + margin * 2;
  const avatarSize = avatar ? Math.min(7.6, count * 0.24) : 0;
  const avatarRadius = avatarSize / 2;
  const avatarCenterX = total / 2;
  const topExtension = avatarRadius;
  const logoSize = Math.min(6.6, count * 0.22);
  const logoQuietSize = logoSize + 1.25;
  // Rounded plate: a clearly rounded square rather than a sharp-edged patch.
  const logoRadius = logoQuietSize * 0.3;
  const logoX = (total - logoSize) / 2;
  const logoY = (total - logoSize) / 2;
  // Geometry-derived id: two codes with the same plate geometry share an
  // identical definition, so a repeated id on one page is harmless.
  const logoClipId = `qr-logo-clip-${total}-${Math.round(logoRadius * 100)}`;

  const modules: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!data[row * count + col]) continue;
      if (isFinderModule(row, col, count)) continue;
      modules.push(modulePath(settings.moduleShape, col + margin, row + margin));
    }
  }

  const eyes: string[] = [];
  const origins: Array<[number, number]> = [
    [margin, margin],
    [margin + count - 7, margin],
    [margin, margin + count - 7],
  ];
  for (const [ox, oy] of origins) {
    eyes.push(
      `<g fill="${settings.foregroundColor}">${eyeShapePath(settings.eyeShape, ox, oy, 7)}</g>`,
      `<g fill="${settings.backgroundColor}">${eyeShapePath(settings.eyeShape, ox + 1, oy + 1, 5)}</g>`,
      `<g fill="${settings.foregroundColor}">${eyeShapePath(settings.eyeShape, ox + 2, oy + 2, 3)}</g>`,
    );
  }

  const avatarMarkup = avatar
    ? [
        `<defs><clipPath id="qr-avatar-clip"><circle cx="${avatarCenterX}" cy="0" r="${avatarRadius - 0.38}"/></clipPath></defs>`,
        `<circle cx="${avatarCenterX}" cy="0" r="${avatarRadius + 0.48}" fill="${settings.backgroundColor}"/>`,
        `<circle cx="${avatarCenterX}" cy="0" r="${avatarRadius}" fill="${settings.foregroundColor}" fill-opacity="0.12"/>`,
        avatar.url
          ? `<image href="${escapeXml(avatar.url)}" x="${avatarCenterX - avatarRadius}" y="${-avatarRadius}" width="${avatarSize}" height="${avatarSize}" preserveAspectRatio="xMidYMid slice" clip-path="url(#qr-avatar-clip)"/>`
          : `<text x="${avatarCenterX}" y="0" fill="${settings.foregroundColor}" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui,sans-serif" font-size="${avatarSize * 0.34}" font-weight="700">${escapeXml(avatarInitials(avatar.fallback))}</text>`,
      ].join("")
    : "";

  const centerLogoMarkup = centerLogoUrl
    ? [
        `<rect x="${(total - logoQuietSize) / 2}" y="${(total - logoQuietSize) / 2}" width="${logoQuietSize}" height="${logoQuietSize}" rx="0.6" fill="${settings.backgroundColor}"/>`,
        `<image href="${escapeXml(centerLogoUrl)}" x="${logoX}" y="${logoY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`,
      ].join("")
    : "";

  const outputHeight = width * ((total + topExtension) / total);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${outputHeight}" viewBox="0 ${-topExtension} ${total} ${total + topExtension}" shape-rendering="geometricPrecision">`,
    `<rect width="${total}" height="${total}" fill="${settings.backgroundColor}"/>`,
    `<g fill="${settings.foregroundColor}">${modules.join("")}</g>`,
    eyes.join(""),
    centerLogoMarkup,
    avatarMarkup,
    `</svg>`,
  ].join("");
}

async function imageUrlToDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Avatar fetch failed [${response.status}]`);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Avatar read failed"));
    reader.onerror = () => reject(new Error("Avatar read failed"));
    reader.readAsDataURL(blob);
  });
}

/** Rasterises the SVG to a PNG data URL for downloads. */
export async function renderQrPng(
  value: string,
  settings: QrSettings,
  width: number,
  avatar?: QrAvatar,
): Promise<string> {
  let embeddedAvatar = avatar;
  if (avatar?.url) {
    try {
      embeddedAvatar = { ...avatar, url: await imageUrlToDataUrl(avatar.url) };
    } catch {
      embeddedAvatar = { fallback: avatar.fallback };
    }
  }
  let embeddedLogo: string | null = null;
  try {
    embeddedLogo = await imageUrlToDataUrl(QR_CENTER_LOGO_URL);
  } catch {
    // Keep downloads functional if the bundled logo cannot be loaded.
  }
  const svg = renderQrSvg(value, settings, width, embeddedAvatar, embeddedLogo);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.width = width;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR render failed"));
    image.src = url;
  });
  const outputHeight = Math.ceil(image.naturalHeight || width);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("QR render failed");
  ctx.fillStyle = settings.backgroundColor;
  ctx.fillRect(0, 0, width, outputHeight);
  ctx.drawImage(image, 0, 0, width, outputHeight);
  return canvas.toDataURL("image/png");
}
