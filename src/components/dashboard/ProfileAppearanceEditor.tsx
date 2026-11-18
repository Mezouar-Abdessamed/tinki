import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  Circle,
  Film,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Sparkles,
  Square,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { ProfilePreview } from "@/components/dashboard/ProfilePreview";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { storageApi } from "@/lib/api-client";
import {
  FONT_FAMILIES,
  FONT_STYLES,
  FONT_WEIGHTS,
  getBackgroundUrl,
  isBackgroundStoragePath,
  PAGE_BACKGROUND_PRESETS,
  textTypographyStyle,
  updateMyProfile,
  DEFAULT_NAME_COLOR,
  DEFAULT_BIO_COLOR,
  type CardBackgroundType,
  type FontFamilyKey,
  type FontStyleKey,
  type PageImageMode,
  type PageMediaType,
  type Profile,
} from "@/lib/profiles";

const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

type ProfileTheme = {
  label: string;
  page: [string, string];
  pageAngle: number;
  card: [string, string];
  icon: string;
  iconBg: string;
  name: string;
  bio: string;
};

const PROFILE_THEMES: ProfileTheme[] = [
  { label: "Minimal", page: ["#F4F4F5", "#E4E4E7"], pageAngle: 180, card: ["#FFFFFF", "#FFFFFF"], icon: "#18181B", iconBg: "#F4F4F5", name: "#09090B", bio: "#52525B" },
  { label: "Midnight", page: ["#0B1020", "#1E293B"], pageAngle: 160, card: ["#111827", "#1F2937"], icon: "#E8EDF4", iconBg: "#252A38", name: "#F8FAFC", bio: "#CBD5E1" },
  { label: "Ocean", page: ["#0EA5E9", "#0F766E"], pageAngle: 135, card: ["#ECFEFF", "#CFFAFE"], icon: "#0F766E", iconBg: "#FFFFFF", name: "#083344", bio: "#155E75" },
  { label: "Sunset", page: ["#F97316", "#DB2777"], pageAngle: 135, card: ["#FFF7ED", "#FFE4E6"], icon: "#9A3412", iconBg: "#FFFFFF", name: "#431407", bio: "#9F1239" },
  { label: "Forest", page: ["#14532D", "#365314"], pageAngle: 150, card: ["#F0FDF4", "#ECFCCB"], icon: "#166534", iconBg: "#FFFFFF", name: "#052E16", bio: "#3F6212" },
  { label: "Neon", page: ["#09090B", "#3B0764"], pageAngle: 135, card: ["#18181B", "#27272A"], icon: "#A3E635", iconBg: "#09090B", name: "#A3E635", bio: "#E4E4E7" },
];

function luminance(hex: string): number {
  const v = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}

function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// Returns the object path inside the "backgrounds" bucket when the value is a clean
// "<user id>/<file>" storage path in the given user's own folder.
function ownBackgroundPath(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  if (isBackgroundStoragePath(url)) return url.split("/")[0] === userId ? url : null;
  return null;
}

function removeBackgroundFiles(paths: string[]) {
  if (paths.length === 0) return;
  void storageApi.remove("backgrounds", paths).catch(() => undefined);
}

const IMAGE_MODES: Array<{ value: PageImageMode; label: string }> = [
  { value: "cover", label: "Full photo (fixed)" },
  { value: "repeat", label: "Repeated pattern" },
];

function TypographyFields({
  title,
  idPrefix,
  family,
  weight,
  style,
  color,
  onFamily,
  onWeight,
  onStyle,
  onColor,
}: {
  title: string;
  idPrefix: string;
  family: FontFamilyKey;
  weight: number;
  style: FontStyleKey;
  color: string;
  onFamily: (value: FontFamilyKey) => void;
  onWeight: (value: number) => void;
  onStyle: (value: FontStyleKey) => void;
  onColor: (value: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-family`}>Font family</Label>
        <Select value={family} onValueChange={(value) => onFamily(value as FontFamilyKey)}>
          <SelectTrigger id={`${idPrefix}-family`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((item) => (
              <SelectItem key={item.value} value={item.value} style={{ fontFamily: item.stack }}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-weight`}>Font weight</Label>
          <Select value={String(weight)} onValueChange={(value) => onWeight(Number(value))}>
            <SelectTrigger id={`${idPrefix}-weight`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map((item) => (
                <SelectItem key={item.value} value={String(item.value)}>
                  {item.label} ({item.value})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-style`}>Font style</Label>
          <Select value={style} onValueChange={(value) => onStyle(value as FontStyleKey)}>
            <SelectTrigger id={`${idPrefix}-style`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_STYLES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <ColorField id={`${idPrefix}-color`} label="Text color" value={color} onChange={onColor} />
      <p className="rounded-xl border border-border bg-secondary/40 px-4 py-3 text-lg" style={textTypographyStyle({ family, weight, style, color })}>
        The quick brown fox
      </p>
    </div>
  );
}

const MODES: Array<{ value: CardBackgroundType; label: string; icon: typeof Square }> = [
  { value: "solid", label: "Single color", icon: Square },
  { value: "linear", label: "Linear gradient", icon: ArrowDownRight },
  { value: "radial", label: "Radial gradient", icon: Circle },
];

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
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
          onChange={(event) => /^#[0-9a-f]{0,6}$/i.test(event.target.value) && onChange(event.target.value)}
          maxLength={7}
          aria-label={`${label} hex value`}
          className="font-mono uppercase"
        />
      </div>
    </div>
  );
}

export function ProfileAppearanceEditor({ profile, avatarUrl, onSaved }: { profile: Profile; avatarUrl: string | null; onSaved: () => void }) {
  const [backgroundOnly, setBackgroundOnly] = useState(false);
  const initialType = profile.card_background_type === "default" ? "solid" : profile.card_background_type;
  const [type, setType] = useState<CardBackgroundType>(initialType);
  const [firstColor, setFirstColor] = useState(profile.card_background_color);
  const [secondColor, setSecondColor] = useState(profile.card_gradient_color);
  const [angle, setAngle] = useState(profile.card_gradient_angle);
  const [socialIconColor, setSocialIconColor] = useState(profile.social_icon_color ?? "#E8EDF4");
  const [socialIconBgColor, setSocialIconBgColor] = useState(profile.social_icon_bg_color ?? "#252A38");
  const [pageType, setPageType] = useState<CardBackgroundType>(profile.page_background_type === "default" ? "solid" : profile.page_background_type);
  const [pageFirstColor, setPageFirstColor] = useState(profile.page_background_color);
  const [pageSecondColor, setPageSecondColor] = useState(profile.page_gradient_color);
  const [pageAngle, setPageAngle] = useState(profile.page_gradient_angle);
  const [imageEnabled, setImageEnabled] = useState<boolean>(profile.page_background_use_image ?? false);
  const [imageUrl, setImageUrl] = useState<string>(profile.page_background_image_url ?? PAGE_BACKGROUND_PRESETS[0]!.url);
  const [imageMode, setImageMode] = useState<PageImageMode>((profile.page_background_image_mode as PageImageMode) ?? "cover");
  const [mediaType, setMediaType] = useState<PageMediaType>((profile.page_background_media_type as PageMediaType) ?? "image");
  const [videoUrl, setVideoUrl] = useState<string>(profile.page_background_video_url ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  // Uploads currently stored on the saved profile, and new uploads not yet saved.
  const savedPathsRef = useRef<string[]>(
    [ownBackgroundPath(profile.page_background_image_url, profile.id), ownBackgroundPath(profile.page_background_video_url, profile.id)].filter(Boolean) as string[],
  );
  const stagedPathsRef = useRef<Set<string>>(new Set());

  // Editor-only display links for storage paths (object URLs for fresh uploads, short-lived
  // signed URLs for saved ones). These are never written to the profile.
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const objectUrlsRef = useRef<string[]>([]);
  function setLocalPreview(path: string, file: File) {
    const objectUrl = URL.createObjectURL(file);
    objectUrlsRef.current.push(objectUrl);
    setPreviewUrls((current) => ({ ...current, [path]: objectUrl }));
  }
  useEffect(() => () => objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    for (const value of [imageUrl.trim(), videoUrl.trim()]) {
      if (!value || !isBackgroundStoragePath(value) || previewUrls[value]) continue;
      void getBackgroundUrl(value).then((resolved) => {
        if (resolved) setPreviewUrls((current) => (current[value] ? current : { ...current, [value]: resolved }));
      });
    }
  }, [imageUrl, videoUrl, previewUrls]);
  const displayUrl = (value: string): string | null => {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return isBackgroundStoragePath(trimmed) ? previewUrls[trimmed] ?? null : trimmed;
  };

  // Unsaved uploads are discarded when the editor closes or the tab is left.
  useEffect(() => {
    const discardStaged = () => {
      removeBackgroundFiles([...stagedPathsRef.current]);
      stagedPathsRef.current = new Set();
    };
    window.addEventListener("pagehide", discardStaged);
    return () => {
      window.removeEventListener("pagehide", discardStaged);
      discardStaged();
    };
  }, []);

  async function uploadBackgroundVideo(file: File) {
    const extByVideoMime: Record<string, string> = {
      "video/mp4": "mp4",
      "video/webm": "webm",
    };
    const extension = extByVideoMime[file.type];
    if (!extension) {
      toast.error("Please choose an MP4 or WebM video file from your device");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error("That video is larger than 5 MB. Please choose a smaller one");
      return;
    }
    setUploadingVideo(true);
    try {
      const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
      const savedPath = await storageApi.upload("backgrounds", path, file, file.type);
      stagedPathsRef.current.add(savedPath);
      setLocalPreview(savedPath, file);
      setVideoUrl(savedPath);
      setMediaType("video");
      setImageEnabled(true);
      toast.success("Video uploaded. Press Save to publish it");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload that video");
    } finally {
      setUploadingVideo(false);
    }
  }


  async function uploadBackground(file: File) {
    const extByImageMime: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    const extension = extByImageMime[file.type];
    if (!extension) {
      toast.error("Please choose a JPEG, PNG, WebP, or GIF image file");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("That photo is larger than 4 MB");
      return;
    }
    setUploading(true);
    try {
      const path = `${profile.id}/${crypto.randomUUID()}.${extension}`;
      const savedPath = await storageApi.upload("backgrounds", path, file, file.type);
      stagedPathsRef.current.add(savedPath);
      setLocalPreview(savedPath, file);
      setImageUrl(savedPath);
      setImageEnabled(true);
      toast.success("Photo uploaded. Press Save to publish it");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  }
  const [nameFontFamily, setNameFontFamily] = useState<FontFamilyKey>(profile.name_font_family ?? "display");
  const [nameFontWeight, setNameFontWeight] = useState<number>(profile.name_font_weight ?? 600);
  const [nameFontStyle, setNameFontStyle] = useState<FontStyleKey>(profile.name_font_style ?? "normal");
  const [bioFontFamily, setBioFontFamily] = useState<FontFamilyKey>(profile.bio_font_family ?? "sans");
  const [bioFontWeight, setBioFontWeight] = useState<number>(profile.bio_font_weight ?? 400);
  const [bioFontStyle, setBioFontStyle] = useState<FontStyleKey>(profile.bio_font_style ?? "normal");
  const [nameColor, setNameColor] = useState<string>(profile.name_color ?? DEFAULT_NAME_COLOR);
  const [bioColor, setBioColor] = useState<string>(profile.bio_color ?? DEFAULT_BIO_COLOR);

  const typography = { name_font_family: nameFontFamily, name_font_weight: nameFontWeight, name_font_style: nameFontStyle, bio_font_family: bioFontFamily, bio_font_weight: bioFontWeight, bio_font_style: bioFontStyle, name_color: nameColor, bio_color: bioColor };


  const previewProfile = useMemo(() => ({ ...profile, name_color: nameColor, bio_color: bioColor, card_background_type: type, card_background_color: firstColor, card_gradient_color: secondColor, card_gradient_angle: angle, social_icon_color: socialIconColor, social_icon_bg_color: socialIconBgColor, page_background_type: pageType, page_background_color: pageFirstColor, page_gradient_color: pageSecondColor, page_gradient_angle: pageAngle, page_background_use_image: imageEnabled, page_background_image_url: displayUrl(imageUrl), page_background_image_mode: imageMode, page_background_media_type: mediaType, page_background_video_url: displayUrl(videoUrl), name_font_family: nameFontFamily, name_font_weight: nameFontWeight, name_font_style: nameFontStyle, bio_font_family: bioFontFamily, bio_font_weight: bioFontWeight, bio_font_style: bioFontStyle }), [profile, type, firstColor, secondColor, angle, socialIconColor, socialIconBgColor, pageType, pageFirstColor, pageSecondColor, pageAngle, imageEnabled, imageUrl, imageMode, mediaType, videoUrl, nameFontFamily, nameFontWeight, nameFontStyle, bioFontFamily, bioFontWeight, bioFontStyle, nameColor, bioColor, previewUrls]);
  const canSave = /^#[0-9a-f]{6}$/i.test(firstColor) && (type === "solid" || /^#[0-9a-f]{6}$/i.test(secondColor)) && /^#[0-9a-f]{6}$/i.test(socialIconColor) && /^#[0-9a-f]{6}$/i.test(socialIconBgColor) && /^#[0-9a-f]{6}$/i.test(pageFirstColor) && (pageType === "solid" || /^#[0-9a-f]{6}$/i.test(pageSecondColor)) && /^#[0-9a-f]{6}$/i.test(nameColor) && /^#[0-9a-f]{6}$/i.test(bioColor);
  const typographyDirty = nameFontFamily !== (profile.name_font_family ?? "display") || nameFontWeight !== (profile.name_font_weight ?? 600) || nameFontStyle !== (profile.name_font_style ?? "normal") || bioFontFamily !== (profile.bio_font_family ?? "sans") || bioFontWeight !== (profile.bio_font_weight ?? 400) || bioFontStyle !== (profile.bio_font_style ?? "normal") || nameColor !== (profile.name_color ?? DEFAULT_NAME_COLOR) || bioColor !== (profile.bio_color ?? DEFAULT_BIO_COLOR);
  const dirty = type !== initialType || firstColor !== profile.card_background_color || secondColor !== profile.card_gradient_color || angle !== profile.card_gradient_angle || socialIconColor !== (profile.social_icon_color ?? "#E8EDF4") || socialIconBgColor !== (profile.social_icon_bg_color ?? "#252A38") || pageType !== profile.page_background_type || pageFirstColor !== profile.page_background_color || pageSecondColor !== profile.page_gradient_color || pageAngle !== profile.page_gradient_angle || imageEnabled !== (profile.page_background_use_image ?? false) || imageUrl !== (profile.page_background_image_url ?? PAGE_BACKGROUND_PRESETS[0]!.url) || imageMode !== ((profile.page_background_image_mode as PageImageMode) ?? "cover") || mediaType !== ((profile.page_background_media_type as PageMediaType) ?? "image") || videoUrl !== (profile.page_background_video_url ?? "") || typographyDirty;

  function applyTheme(theme: ProfileTheme) {
    setPageType("linear");
    setPageFirstColor(theme.page[0]);
    setPageSecondColor(theme.page[1]);
    setPageAngle(theme.pageAngle);
    setImageEnabled(false);
    setType(theme.card[0] === theme.card[1] ? "solid" : "linear");
    setFirstColor(theme.card[0]);
    setSecondColor(theme.card[1]);
    setAngle(135);
    setSocialIconColor(theme.icon);
    setSocialIconBgColor(theme.iconBg);
    setNameColor(theme.name);
    setBioColor(theme.bio);
  }

  const lowContrast =
    canSave && (contrastRatio(nameColor, firstColor) < 3 || contrastRatio(bioColor, firstColor) < 3);

  function fixContrast() {
    const dark = luminance(firstColor) > 0.4;
    setNameColor(dark ? "#0D1117" : "#F8FAFC");
    setBioColor(dark ? "#334155" : "#CBD5E1");
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    // An uploaded file is only kept when it is the active background; otherwise its link is cleared so the file can be removed.
    const nextImage = imageUrl.trim() === "" ? null : imageUrl.trim();
    const nextVideo = videoUrl.trim() === "" ? null : videoUrl.trim();
    const imageUpload = ownBackgroundPath(nextImage, profile.id);
    const videoUpload = ownBackgroundPath(nextVideo, profile.id);
    const savedImage = imageUpload && !(imageEnabled && mediaType === "image") ? null : nextImage;
    const savedVideo = videoUpload && !(imageEnabled && mediaType === "video") ? null : nextVideo;
    try {
      await updateMyProfile({
        card_background_type: type,
        card_background_color: firstColor,
        card_gradient_color: secondColor,
        card_gradient_angle: angle,
        social_icon_color: socialIconColor,
        social_icon_bg_color: socialIconBgColor,
        page_background_type: pageType,
        page_background_color: pageFirstColor,
        page_gradient_color: pageSecondColor,
        page_gradient_angle: pageAngle,
        page_background_use_image: imageEnabled,
        page_background_image_url: savedImage,
        page_background_image_mode: imageMode,
        page_background_media_type: mediaType,
        page_background_video_url: savedVideo,
        ...typography,
      });
    } catch (error) {
      setSaving(false);
      toast.error(error instanceof Error ? error.message : "Couldn't save profile style");
      return;
    }
    setSaving(false);
    // Only after the profile update succeeded: remove previously saved and staged uploads that are no longer referenced.
    const kept = new Set([ownBackgroundPath(savedImage, profile.id), ownBackgroundPath(savedVideo, profile.id)].filter(Boolean) as string[]);
    const candidates = new Set([...savedPathsRef.current, ...stagedPathsRef.current]);
    removeBackgroundFiles([...candidates].filter((path) => !kept.has(path)));
    savedPathsRef.current = [...kept];
    stagedPathsRef.current = new Set();
    if (savedImage !== nextImage) setImageUrl(savedImage ?? PAGE_BACKGROUND_PRESETS[0]!.url);
    if (savedVideo !== nextVideo) setVideoUrl(savedVideo ?? "");
    toast.success("Profile style saved");
    onSaved();
  }

  return (
    <div className="space-y-8">
      {/* Live preview — top of the page */}
      <section aria-label="Page preview" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Live preview</h2>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {dirty ? "Unsaved changes" : "Up to date"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1" role="group" aria-label="Page preview">
            <Button type="button" size="sm" variant={backgroundOnly ? "ghost" : "secondary"} aria-pressed={!backgroundOnly} onClick={() => setBackgroundOnly(false)} className="h-auto min-h-9 whitespace-normal">
              <Square className="shrink-0" />
              Public page
            </Button>
            <Button type="button" size="sm" variant={backgroundOnly ? "secondary" : "ghost"} aria-pressed={backgroundOnly} onClick={() => setBackgroundOnly(true)} className="h-auto min-h-9 whitespace-normal">
              <ImageIcon className="shrink-0" />
              Background
            </Button>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Expand preview" title="Expand preview">
                <Maximize2 />
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby={undefined} className="flex max-h-[94dvh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden rounded-lg p-0">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 pe-12">
                <DialogTitle>Page preview</DialogTitle>
                <Button type="button" size="sm" variant={backgroundOnly ? "secondary" : "ghost"} aria-label="Background preview" aria-pressed={backgroundOnly} onClick={() => setBackgroundOnly(!backgroundOnly)} className="h-auto min-h-9 whitespace-normal">
                  <ImageIcon className="shrink-0" />
                  Background
                </Button>
              </div>
              <div className="min-h-0 overflow-y-auto">
                <ProfilePreview profile={previewProfile} avatarUrl={avatarUrl} fullPage backgroundOnly={backgroundOnly} className="min-h-[78dvh]" />
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <ProfilePreview profile={previewProfile} avatarUrl={avatarUrl} fullPage backgroundOnly={backgroundOnly} />
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold">Ready-made themes</h2>
        <p className="mt-1 text-sm text-muted-foreground">One tap sets background, card, icons and text colors</p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PROFILE_THEMES.map((theme) => (
            <button
              key={theme.label}
              type="button"
              onClick={() => applyTheme(theme)}
              className="group flex flex-col gap-2 rounded-xl border border-border p-2 text-start transition hover:border-primary/60"
            >
              <span
                className="flex h-16 items-center justify-center rounded-lg"
                style={{ background: `linear-gradient(${theme.pageAngle}deg, ${theme.page[0]}, ${theme.page[1]})` }}
              >
                <span className="h-9 w-14 rounded-md" style={{ background: theme.card[0], color: theme.name }}>
                  <span className="block px-1.5 pt-1 text-[10px] font-semibold">Aa</span>
                </span>
              </span>
              <span className="text-xs font-medium">{theme.label}</span>
            </button>
          ))}
        </div>
        {lowContrast && (
          <div role="status" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="flex-1">Your name or bio may be hard to read on this card color</span>
            <Button size="sm" variant="secondary" onClick={fixContrast}>Fix it for me</Button>
          </div>
        )}
      </section>

      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold">Public page background</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose the background behind your profile card</p>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Public page background style">
          {MODES.map((mode) => {
            const active = pageType === mode.value;
            const Icon = mode.icon;
            return (
              <Button key={mode.value} type="button" variant={active ? "default" : "outline"} onClick={() => setPageType(mode.value)} aria-pressed={active} className="justify-start whitespace-normal">
                <Icon className="h-4 w-4 shrink-0" />
                {mode.label}
                {active ? <Check className="ms-auto h-4 w-4 shrink-0" /> : null}
              </Button>
            );
          })}
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <ColorField id="page-color-one" label={pageType === "solid" ? "Page color" : "First color"} value={pageFirstColor} onChange={setPageFirstColor} />
          {pageType !== "solid" ? <ColorField id="page-color-two" label="Second color" value={pageSecondColor} onChange={setPageSecondColor} /> : null}
        </div>

        {pageType === "linear" ? (
          <div className="mt-7 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="page-gradient-angle">Gradient direction</Label>
              <span className="text-sm text-muted-foreground">{pageAngle}°</span>
            </div>
            <Slider id="page-gradient-angle" min={0} max={360} step={1} value={[pageAngle]} onValueChange={(value) => setPageAngle(value[0] ?? 135)} aria-label="Public page gradient direction" />
          </div>
        ) : null}

        <div className="mt-8 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-base font-semibold">Background photo or video</h3>
              <p className="mt-1 text-sm text-muted-foreground">Use a photo or a short video instead of the color behind your card</p>
            </div>
            <Button type="button" variant={imageEnabled ? "default" : "outline"} size="sm" onClick={() => setImageEnabled(!imageEnabled)} aria-pressed={imageEnabled}>
              <ImageIcon className="h-4 w-4" />
              {imageEnabled ? "Background on" : "Background off"}
            </Button>
          </div>

          {imageEnabled ? (
            <div className="mt-6 space-y-6">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Background media type">
                <Button type="button" variant={mediaType === "image" ? "default" : "outline"} onClick={() => setMediaType("image")} aria-pressed={mediaType === "image"}>
                  <ImageIcon className="h-4 w-4" />
                  Photo
                </Button>
                <Button type="button" variant={mediaType === "video" ? "default" : "outline"} onClick={() => setMediaType("video")} aria-pressed={mediaType === "video"}>
                  <Film className="h-4 w-4" />
                  Video
                </Button>
              </div>

              {mediaType === "video" ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label>Upload a video from your device</Label>
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime,video/*"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) void uploadBackgroundVideo(file);
                        }}
                      />
                      <Button type="button" variant="outline" disabled={uploadingVideo} onClick={() => videoInputRef.current?.click()} className="shrink-0">
                        {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploadingVideo ? "Uploading…" : videoUrl ? "Replace video" : "Choose a video"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">MP4, WebM or MOV up to 5 MB. It plays muted and loops. Videos can only be uploaded from your device</p>
                  </div>

                  {videoUrl ? (
                    <div className="space-y-3">
                      <div className="overflow-hidden rounded-xl border border-border">
                        <video src={displayUrl(videoUrl) ?? undefined} className="h-40 w-full bg-muted object-cover" autoPlay loop muted playsInline />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setVideoUrl("")}>
                        Remove video
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : (
              <div className="space-y-6">
              <div className="grid grid-cols-3 gap-3">
                {PAGE_BACKGROUND_PRESETS.map((preset) => {
                  const active = imageUrl === preset.url;
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => setImageUrl(preset.url)}
                      aria-pressed={active}
                      aria-label={preset.label}
                      className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-colors ${active ? "border-primary" : "border-border hover:border-primary/50"}`}
                    >
                      <img src={preset.url} alt={preset.label} className="h-full w-full object-cover" />
                      {active ? (
                        <span className="absolute end-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Or upload from your device</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void uploadBackground(file);
                    }}
                  />
                  <Button type="button" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()} className="shrink-0">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "Uploading…" : "Choose a photo"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">JPG, PNG, GIF or WebP up to 4 MB</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="page-image-url">Or paste a photo link</Label>
                <Input id="page-image-url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://…" />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Background photo layout">
                {IMAGE_MODES.map((mode) => {
                  const active = imageMode === mode.value;
                  return (
                    <Button key={mode.value} type="button" variant={active ? "default" : "outline"} onClick={() => setImageMode(mode.value)} aria-pressed={active} className="justify-start whitespace-normal">
                      {mode.label}
                      {active ? <Check className="ms-auto h-4 w-4 shrink-0" /> : null}
                    </Button>
                  );
                })}
              </div>
              </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      {/* Controls */}
      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold">Card background</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick a style, then tune the colors</p>

        <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Background style">
          {MODES.map((mode) => {
            const active = type === mode.value;
            const Icon = mode.icon;
            return (
              <Button
                key={mode.value}
                type="button"
                variant={active ? "default" : "outline"}
                onClick={() => setType(mode.value)}
                aria-pressed={active}
                className="justify-start whitespace-normal"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {mode.label}
                {active ? <Check className="ms-auto h-4 w-4 shrink-0" /> : null}
              </Button>
            );
          })}
        </div>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <ColorField id="card-color-one" label={type === "solid" ? "Card color" : "First color"} value={firstColor} onChange={setFirstColor} />
          {type !== "solid" ? <ColorField id="card-color-two" label="Second color" value={secondColor} onChange={setSecondColor} /> : null}
        </div>

        {type === "linear" ? (
          <div className="mt-7 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="gradient-angle">Gradient direction</Label>
              <span className="text-sm text-muted-foreground">{angle}°</span>
            </div>
            <Slider id="gradient-angle" min={0} max={360} step={1} value={[angle]} onValueChange={(value) => setAngle(value[0] ?? 135)} aria-label="Gradient direction" />
          </div>
        ) : null}

      </section>

      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold">Link icons</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose the icon and circle colors for social and custom links</p>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <ColorField id="social-icon-color" label="Icon color" value={socialIconColor} onChange={setSocialIconColor} />
          <ColorField id="social-icon-background-color" label="Circle color" value={socialIconBgColor} onChange={setSocialIconBgColor} />
        </div>
      </section>

      <section className="panel p-6 sm:p-8">
        <h2 className="font-display text-lg font-semibold">Name & bio typography</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick the font family, weight, style and color for your full name and your bio</p>

        <div className="mt-7 grid gap-8 lg:grid-cols-2">
          <TypographyFields
            title="Full name"
            idPrefix="name-font"
            family={nameFontFamily}
            weight={nameFontWeight}
            style={nameFontStyle}
            color={nameColor}
            onFamily={setNameFontFamily}
            onWeight={setNameFontWeight}
            onStyle={setNameFontStyle}
            onColor={setNameColor}
          />
          <TypographyFields
            title="Bio"
            idPrefix="bio-font"
            family={bioFontFamily}
            weight={bioFontWeight}
            style={bioFontStyle}
            color={bioColor}
            onFamily={setBioFontFamily}
            onWeight={setBioFontWeight}
            onStyle={setBioFontStyle}
            onColor={setBioColor}
          />
        </div>
      </section>

      <div className="flex flex-col gap-3 border-t border-border py-4 sm:flex-row sm:items-center">
        <Button type="button" onClick={save} disabled={saving || !canSave} className="sm:w-44">
          {saving ? <Loader2 className="animate-spin" /> : <Check />}
          {saving ? "Saving…" : "Save colors"}
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {canSave ? "Changes are visible in the preview before saving" : "Enter a complete hex color like #1A2B3C to enable saving"}
        </p>
      </div>

    </div>
  );
}
