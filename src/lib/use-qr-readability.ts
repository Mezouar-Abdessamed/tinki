import { useEffect, useMemo, useRef, useState } from "react";

import { decodeRenderedQr, type QrDecodeResult } from "@/lib/qr-decode";
import type { QrAvatar } from "@/lib/qr-render";
import type { QrSettings } from "@/lib/qr-settings";
import { validateQrSettings, type QrIssue, type QrValidation } from "@/lib/qr-validation";

export type QrReadability = QrValidation & {
  /** Result of actually scanning the rendered image. */
  decode: QrDecodeResult | "checking";
  /** Every issue, including one for a failed scan of the rendered image. */
  allIssues: QrIssue[];
  /** True when nothing is wrong and the rendered image scanned back correctly. */
  readable: boolean;
  /** True when the configuration must not be saved. */
  unsafe: boolean;
};

const DECODE_FAILURE: QrIssue = {
  id: "decode",
  severity: "error",
  message:
    "We tried to scan this QR code and could not read it back. Adjust the colours, shapes or margin until the check passes",
};

/**
 * Validates a QR configuration both by rule and by scanning the image the app
 * renders, so the preview can say whether the code is reliably scannable.
 */
export function useQrReadability(
  value: string,
  settings: QrSettings,
  avatar?: QrAvatar,
  renderWidth = 220,
): QrReadability {
  const validation = useMemo(
    () =>
      validateQrSettings(value, settings, {
        hasAvatar: Boolean(avatar),
        hasCenterLogo: true,
        renderWidth,
      }),
    [value, settings, avatar, renderWidth],
  );

  const [decode, setDecode] = useState<QrDecodeResult | "checking">("checking");
  const requestId = useRef(0);
  const avatarUrl = avatar?.url ?? null;
  const avatarFallback = avatar?.fallback ?? "";

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    setDecode("checking");
    const timer = setTimeout(() => {
      void decodeRenderedQr(
        value,
        settings,
        avatarUrl || avatarFallback ? { url: avatarUrl, fallback: avatarFallback } : undefined,
      ).then((result) => {
        if (requestId.current === id) setDecode(result);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value,
    avatarUrl,
    avatarFallback,
    settings.foregroundColor,
    settings.backgroundColor,
    settings.margin,
    settings.errorCorrection,
    settings.moduleShape,
    settings.eyeShape,
  ]);

  const decodeFailed = decode === "undecodable" || decode === "mismatch";
  const allIssues = decodeFailed ? [DECODE_FAILURE, ...validation.issues] : validation.issues;

  return {
    ...validation,
    decode,
    allIssues,
    readable: allIssues.length === 0 && decode === "match",
    unsafe: validation.blocking || decodeFailed,
  };
}
