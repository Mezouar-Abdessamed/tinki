import { QrCode } from "@/components/QrCode";
import type { QrAvatar } from "@/lib/qr-render";
import type { QrSettings } from "@/lib/qr-settings";

export function QrCodeCard({
  url,
  username,
  settings,
  avatar,
}: {
  url: string;
  username: string;
  settings?: QrSettings;
  avatar: QrAvatar;
}) {
  return (
    <section className="panel p-6">
      <h2 className="font-display text-lg font-semibold">My QR Code</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Always points to your current link. Print it, post it, or show it on your phone.
      </p>
      <div className="mt-5 flex justify-center">
        {/* Regenerated from the live profile URL, so a username change updates it. */}
        <QrCode
          value={url}
          username={username}
          size={190}
          avatar={avatar}
          {...(settings ? { settings } : {})}
        />
      </div>
    </section>
  );
}
