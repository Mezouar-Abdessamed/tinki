import { Download } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { renderQrPng, renderQrSvg, type QrAvatar } from "@/lib/qr-render";
import { DEFAULT_QR_SETTINGS, type QrSettings } from "@/lib/qr-settings";

type QrCodeProps = {
  value: string;
  username: string;
  size?: number;
  showDownload?: boolean;
  /** Customization chosen on "Customize QR Code"; falls back to the app defaults. */
  settings?: QrSettings;
  /** Existing profile image and name; also drives the initials fallback. */
  avatar?: QrAvatar;
};

export function QrCode({
  value,
  username,
  size = 180,
  showDownload = true,
  settings = DEFAULT_QR_SETTINGS,
  avatar,
}: QrCodeProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const { foregroundColor, backgroundColor, margin, errorCorrection, moduleShape, eyeShape } =
    settings;

  useEffect(() => {
    try {
      setSvg(renderQrSvg(value, settings, size, avatar));
    } catch {
      setSvg(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, size, foregroundColor, backgroundColor, margin, errorCorrection, moduleShape, eyeShape, avatar]);

  function triggerDownload(href: string, filename: string) {
    const link = document.createElement("a");
    link.href = href;
    link.download = filename;
    link.click();
  }

  /** High-resolution PNG, suitable for printing or sharing. */
  async function download() {
    setDownloading(true);
    try {
      const png = await renderQrPng(
        value,
        { ...settings, margin: settings.margin + 1 },
        1024,
        avatar,
      );
      triggerDownload(png, `${username}-qr.png`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-xl bg-primary-foreground p-3"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        {svg ? (
          <div
            className="block"
            style={{ width: size }}
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div style={{ width: size, height: size }} className="animate-pulse rounded-md bg-muted" />
        )}
      </div>
      {showDownload && (
        <Button variant="outline" size="sm" onClick={download} disabled={downloading}>
          <Download className="me-2 h-4 w-4" />
          {downloading ? "Preparing…" : "Download QR Code"}
        </Button>
      )}
    </div>
  );
}
