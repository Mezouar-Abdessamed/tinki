import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { QrCode } from "@/components/QrCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { profileUrl } from "@/lib/profiles";
import { renderQrSvg } from "@/lib/qr-render";
import {
  DEFAULT_QR_SETTINGS,
  QR_EYE_SHAPES,
  QR_MODULE_SHAPES,
  qrSettingsFromProfile,
  saveQrSettings,
  type QrEyeShape,
  type QrModuleShape,
  type QrSettings,
} from "@/lib/qr-settings";
import { useMyProfile } from "@/hooks/use-my-profile";
import { useQrReadability, type QrReadability } from "@/hooks/use-qr-readability";
import { UnsafeQrSettingsError } from "@/lib/qr-validation";

export const Route = createFileRoute("/dashboard/customize-qr-code")({
  head: () => ({
    meta: [
      { title: "Customize QR Code — Tinki" },
      { name: "description", content: "Customize the QR code for your Tinki profile" },
      { property: "og:title", content: "Customize QR Code — Tinki" },
      {
        property: "og:description",
        content: "Customize the QR code for your Tinki profile",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomizeQrCodePage,
});

/** One-tap looks; all keep strong contrast so they pass the scan check. */
const QR_PRESETS: Array<{ label: string; patch: Partial<QrSettings> }> = [
  { label: "Classic", patch: { foregroundColor: "#0d1117", backgroundColor: "#ffffff", moduleShape: "square", eyeShape: "square" } },
  { label: "Soft", patch: { foregroundColor: "#0f766e", backgroundColor: "#ffffff", moduleShape: "rounded", eyeShape: "rounded" } },
  { label: "Dots", patch: { foregroundColor: "#1e293b", backgroundColor: "#ffffff", moduleShape: "dots", eyeShape: "circle" } },
  { label: "Elegant", patch: { foregroundColor: "#3b0764", backgroundColor: "#fdf4ff", moduleShape: "classy", eyeShape: "leaf" } },
  { label: "Night", patch: { foregroundColor: "#f8fafc", backgroundColor: "#0d1117", moduleShape: "rounded", eyeShape: "rounded" } },
];

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const pickerValue = /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          id={id}
          type="color"
          value={pickerValue}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-14 cursor-pointer p-1"
        />
        <Input
          value={value.toUpperCase()}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-32 font-mono uppercase"
          maxLength={7}
        />
      </div>
    </div>
  );
}

/** Tiny QR rendered with one shape option, used as the button thumbnail. */
function ShapeThumb({ settings }: { settings: QrSettings }) {
  const svg = useMemo(() => renderQrSvg("tinki", settings, 56), [settings]);
  return (
    <div
      className="h-14 w-14 overflow-hidden rounded-md"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function ShapePicker<T extends string>({
  label,
  options,
  value,
  onChange,
  preview,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  preview: (option: T) => QrSettings;
}) {
  return (
    <div className="space-y-3">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-2 rounded-lg border p-2 transition ${
                active
                  ? "border-primary ring-2 ring-primary/40"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <ShapeThumb settings={preview(option.value)} />
              <span className="text-xs text-muted-foreground">{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Scan-safety verdict for the current configuration. */
function ReadabilityStatus({ readability }: { readability: QrReadability }) {
  if (readability.decode === "checking") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking if this QR code can be scanned…
      </p>
    );
  }
  if (readability.unsafe) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" />
        May not scan reliably
      </p>
    );
  }
  if (readability.allIssues.length > 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-amber-500">
        <AlertTriangle className="h-4 w-4" />
        Scannable, with things to watch
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-emerald-500">
      <CheckCircle2 className="h-4 w-4" />
      Readable — scanned and verified
    </p>
  );
}

function ReadabilityIssues({
  readability,
  onFix,
}: {
  readability: QrReadability;
  onFix: () => void;
}) {
  if (readability.allIssues.length === 0) return null;
  const blocked = readability.unsafe;
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        blocked ? "border-destructive/60 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"
      }`}
      role={blocked ? "alert" : "status"}
    >
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className={`h-4 w-4 ${blocked ? "text-destructive" : "text-amber-500"}`} />
        {blocked
          ? "This style can’t be saved yet — the code may not scan"
          : "This style scans, but could be better"}
      </p>
      <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
        {readability.allIssues.map((issue) => (
          <li key={issue.id}>{issue.message}</li>
        ))}
      </ul>
      {blocked && (
        <Button size="sm" variant="secondary" onClick={onFix}>
          <ShieldCheck className="me-2 h-4 w-4" />
          Fix it for me
        </Button>
      )}
    </div>
  );
}

function CustomizeQrCodePage() {
  const { profile, avatarUrl, refetch } = useMyProfile();
  const [settings, setSettings] = useState<QrSettings>(DEFAULT_QR_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) setSettings(qrSettingsFromProfile(profile));
  }, [profile]);

  const url = profile ? profileUrl(profile.username) : "";
  const avatar = useMemo(
    () =>
      profile ? { url: avatarUrl, fallback: profile.display_name || profile.username } : undefined,
    [profile, avatarUrl],
  );
  const readability = useQrReadability(url || "https://example.com/u", settings, avatar, 220);

  if (!profile) return null;

  function update(patch: Partial<QrSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  async function save() {
    if (!profile) return;
    if (readability.unsafe) {
      toast.error(readability.allIssues[0]?.message ?? "This QR code may not scan reliably");
      return;
    }
    setSaving(true);
    try {
      await saveQrSettings(profile.id, settings, {
        hasAvatar: Boolean(avatar),
        renderWidth: 220,
        profileUrl: url,
      });
      await refetch();
      toast.success("QR code style saved");
    } catch (error) {
      toast.error(
        error instanceof UnsafeQrSettingsError
          ? error.message
          : "Could not save your QR code style",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">Customize QR Code</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Change how your QR code looks. It always points to your page — only the style changes
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      {/* Preview stays in view on wide screens while editing. */}
      <section className="panel flex flex-col items-center gap-4 p-6 lg:sticky lg:top-6 lg:order-2">
        <h2 className="font-display text-lg font-semibold">Live preview</h2>
        <QrCode
          value={url}
          username={profile.username}
          size={220}
          settings={settings}
          {...(avatar ? { avatar } : {})}
        />
        <ReadabilityStatus readability={readability} />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(
              () => toast.success("Link copied"),
              () => toast.error("Could not copy the link"),
            );
          }}
        >
          <Copy className="me-2 h-4 w-4" />
          Copy page link
        </Button>
      </section>

      <section className="panel space-y-6 p-6 lg:order-1">
        <div className="space-y-3">
          <Label>Quick styles</Label>
          <div className="flex flex-wrap gap-3">
            {QR_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => update(preset.patch)}
                className="flex flex-col items-center gap-2 rounded-lg border border-border p-2 transition hover:border-primary/50"
              >
                <ShapeThumb settings={{ ...settings, ...preset.patch, margin: 0 }} />
                <span className="text-xs text-muted-foreground">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColorField
            id="qr-foreground"
            label="QR color"
            value={settings.foregroundColor}
            onChange={(value) => update({ foregroundColor: value })}
          />
          <ColorField
            id="qr-background"
            label="Background color"
            value={settings.backgroundColor}
            onChange={(value) => update({ backgroundColor: value })}
          />
        </div>

        <ShapePicker<QrModuleShape>
          label="Dot shape"
          options={QR_MODULE_SHAPES}
          value={settings.moduleShape}
          onChange={(value) => update({ moduleShape: value })}
          preview={(option) => ({ ...settings, moduleShape: option, margin: 0 })}
        />

        <ShapePicker<QrEyeShape>
          label="Corner shape"
          options={QR_EYE_SHAPES}
          value={settings.eyeShape}
          onChange={(value) => update({ eyeShape: value })}
          preview={(option) => ({ ...settings, eyeShape: option, margin: 0 })}
        />

        <ReadabilityIssues
          readability={readability}
          onFix={() => setSettings(readability.safeSettings)}
        />

        <div className="flex flex-wrap gap-3 pt-2">
          <Button
            onClick={() => void save()}
            disabled={saving || readability.unsafe || readability.decode === "checking"}
          >
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            Save QR style
          </Button>
          <Button
            variant="outline"
            onClick={() => setSettings(DEFAULT_QR_SETTINGS)}
            disabled={saving}
          >
            Reset to default
          </Button>
        </div>
      </section>
      </div>
    </div>
  );
}
