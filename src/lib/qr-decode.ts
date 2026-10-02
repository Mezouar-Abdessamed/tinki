import jsQR from "jsqr";

import { renderQrPng, type QrAvatar } from "@/lib/qr-render";
import type { QrSettings } from "@/lib/qr-settings";

/**
 * Scans the QR image the app actually renders (colours, shapes, profile
 * picture and centre logo included) and checks it still decodes back to the
 * profile link. This is the authoritative readability test — the rule-based
 * checks in `qr-validation` explain *why* something fails.
 */
export type QrDecodeResult = "match" | "mismatch" | "undecodable" | "unavailable";

// A phone camera never sees perfectly crisp pixels: optics soften the image and
// bridge the gaps between stylised dots. Scanning a lightly blurred copy is a
// fairer test of real-world scannability than a pixel-perfect one, so we try a
// few sizes and softness levels before calling a design unreadable.
const DECODE_PASSES: Array<{ size: number; blur: number }> = [
  { size: 600, blur: 0 },
  { size: 600, blur: 1 },
  { size: 600, blur: 2 },
  { size: 1000, blur: 2 },
  { size: 1000, blur: 3.5 },
];

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR decode render failed"));
    image.src = src;
  });
  return image;
}

function scan(image: HTMLImageElement, size: number, blur: number, background: string) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, size, size);
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(image, 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size);
  return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" });
}

export async function decodeRenderedQr(
  value: string,
  settings: QrSettings,
  avatar?: QrAvatar,
): Promise<QrDecodeResult> {
  if (typeof document === "undefined") return "unavailable";
  try {
    let sawWrongPayload = false;
    const rendered = new Map<number, HTMLImageElement>();
    for (const pass of DECODE_PASSES) {
      let image = rendered.get(pass.size);
      if (!image) {
        image = await loadImage(await renderQrPng(value, settings, pass.size, avatar));
        rendered.set(pass.size, image);
      }
      const decoded = scan(image, pass.size, pass.blur, settings.backgroundColor);
      if (!decoded) continue;
      if (decoded.data === value) return "match";
      sawWrongPayload = true;
    }
    return sawWrongPayload ? "mismatch" : "undecodable";
  } catch {
    return "unavailable";
  }
}
