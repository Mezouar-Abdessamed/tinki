import { useEffect, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { BadgeCheck, Camera, ImagePlus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { CoverBanner } from "@/components/CoverBanner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { hasProfileEdits } from "@/lib/profile-edit-state";
import { supabase } from "@/lib/app-supabase";
import {
  AVATAR_ACCEPT,
  extensionForType,
  isAllowedAvatarType,
  reencodeAvatar,
} from "@/lib/avatar-image";
import { getCoverUrl, isUsernameAvailable, type Profile } from "@/lib/profiles";
import { useLanguage } from "@/lib/i18n";
import { firstError, usernameSchema } from "@/lib/socials";


const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const BIO_MAX = 50;

/** Names stay text-only: emoji, pictographs and zero-width joiners are removed. */
function stripEmoji(value: string) {
  return value
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/[\uFE0F\u200D]/g, "");
}

const COVER_CLEANUP_RETRIES = 2;
const COVER_CLEANUP_RETRY_DELAY_MS = 600;

/**
 * After a new cover becomes active, remove every other object in the user's
 * covers folder (orphans from earlier failed cleanups included). Only touches
 * paths inside `${userId}/`; failures never affect the saved profile.
 */
async function cleanupCoverFolder(userId: string, keepPath: string | null): Promise<boolean> {
  for (let attempt = 0; attempt <= COVER_CLEANUP_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, COVER_CLEANUP_RETRY_DELAY_MS * attempt));
    }
    const { data: objects, error: listError } = await supabase.storage.from("covers").list(userId);
    if (listError) continue;
    const stale = (objects ?? [])
      .map((object) => `${userId}/${object.name}`)
      .filter((path) => path !== keepPath);
    if (stale.length === 0) return true;
    const { error: removeError } = await supabase.storage.from("covers").remove(stale);
    if (!removeError) return true;
  }
  return false;
}

/**
 * After an avatar change is saved, remove every object in the user's own
 * avatars folder except the active one (null keeps nothing). Retries with
 * backoff; only ever touches paths inside `${userId}/`.
 */
async function cleanupAvatarFolder(userId: string, keepPath: string | null): Promise<boolean> {
  for (let attempt = 0; attempt <= COVER_CLEANUP_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, COVER_CLEANUP_RETRY_DELAY_MS * attempt));
    }
    const { data: objects, error: listError } = await supabase.storage.from("avatars").list(userId);
    if (listError) continue;
    const stale = (objects ?? [])
      .filter((object) => object.id !== null) // skip nested "folders"
      .map((object) => `${userId}/${object.name}`)
      .filter((path) => path !== keepPath && path.startsWith(`${userId}/`));
    if (stale.length === 0) return true;
    const { error: removeError } = await supabase.storage.from("avatars").remove(stale);
    if (!removeError) return true;
  }
  return false;
}

export function EditInformationsForm({
  profile,
  avatarUrl,
  onSaved,
  onDirtyChange,
}: {
  profile: Profile;
  avatarUrl: string | null;
  onSaved: () => void | Promise<unknown>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { t } = useLanguage();
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [savedCoverUrl, setSavedCoverUrl] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [coverX, setCoverX] = useState(profile.cover_photo_x ?? 50);
  const [coverY, setCoverY] = useState(profile.cover_photo_y ?? 50);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const busy = saving || refreshing;
  const shownAvatar = previewUrl ?? (removeAvatar ? null : avatarUrl);
  const shownCover = removeCover ? null : coverPreview ?? savedCoverUrl;
  const hasCover = !removeCover && Boolean(coverFile || profile.cover_photo_path);
  const dirty = hasProfileEdits(
    { username: profile.username, displayName: profile.display_name ?? "", bio: profile.bio ?? "", avatarPath: profile.avatar_path, coverPath: profile.cover_photo_path ?? null, coverX: profile.cover_photo_x ?? 50, coverY: profile.cover_photo_y ?? 50 },
    { username, displayName, bio, avatarPath: removeAvatar ? null : profile.avatar_path, coverPath: removeCover ? null : profile.cover_photo_path ?? null, coverX, coverY },
    Boolean(pickedFile), Boolean(coverFile),
  );
  const blocker = useBlocker({ shouldBlockFn: () => dirty && !busy, enableBeforeUnload: dirty && !busy, withResolver: true });

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!pickedFile) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(pickedFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pickedFile]);

  useEffect(() => {
    let active = true;
    if (!profile.cover_photo_path) { setSavedCoverUrl(null); return; }
    void getCoverUrl(profile.cover_photo_path).then((url) => { if (active) setSavedCoverUrl(url); }).catch(() => { if (active) setSavedCoverUrl(null); });
    return () => { active = false; };
  }, [profile.cover_photo_path]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function pickFile(file: File | undefined) {
    if (!file) return;
    if (!isAllowedAvatarType(file.type)) { setAvatarError("Choose a JPG, PNG or WebP image"); return; }
    if (file.size > MAX_AVATAR_BYTES) { setAvatarError("That picture is larger than 3 MB"); return; }
    setAvatarError(null);
    setPickedFile(file);
    setRemoveAvatar(false);
  }

  function pickCover(file: File | undefined) {
    if (!file) return;
    if (!isAllowedAvatarType(file.type)) { setCoverError("Choose a JPG, PNG or WebP image"); return; }
    if (file.size > MAX_COVER_BYTES) { setCoverError("Cover photo must be 5 MB or less"); return; }
    setCoverError(null);
    setCoverFile(file);
    setRemoveCover(false);
    setCoverX(50);
    setCoverY(50);
  }

  function cancel() {
    setUsername(profile.username);
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setPickedFile(null);
    setRemoveAvatar(false);
    setCoverFile(null);
    setRemoveCover(false);
    setCoverX(profile.cover_photo_x ?? 50);
    setCoverY(profile.cover_photo_y ?? 50);
    setError(null);
    setAvatarError(null);
    setCoverError(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!dirty || busy) return;
    setError(null);
    const parsed = usernameSchema.safeParse(username);
    if (!parsed.success) { setError(firstError(parsed.error)); return; }
    if (displayName.trim().length > 60) { setError("Full name must be 60 characters or fewer"); return; }
    if (bio.trim().length > BIO_MAX) { setError(t(`Bio must be ${BIO_MAX} characters or fewer`)); return; }
    setSaving(true);
    let uploadedAvatar: string | null = null;
    let uploadedCover: string | null = null;
    let committed = false;
    try {
      if (parsed.data !== profile.username && !(await isUsernameAvailable(parsed.data))) {
        setError("That username is already taken");
        return;
      }
      if (pickedFile) {
        const { blob, contentType } = await reencodeAvatar(pickedFile);
        const path = `${profile.id}/${crypto.randomUUID()}.${extensionForType(contentType)}`;
        const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: false, contentType });
        if (error) throw error;
        uploadedAvatar = path;
      }
      if (coverFile) {
        const { blob, contentType } = await reencodeAvatar(coverFile, 1600);
        if (blob.size > MAX_COVER_BYTES) throw new Error("Cover photo must be 5 MB or less");
        const path = `${profile.id}/${crypto.randomUUID()}.${extensionForType(contentType)}`;
        const { error } = await supabase.storage.from("covers").upload(path, blob, { upsert: false, contentType });
        if (error) throw error;
        uploadedCover = path;
      }
      const avatarPath = uploadedAvatar ?? (removeAvatar ? null : profile.avatar_path);
      const coverPath = uploadedCover ?? (removeCover ? null : profile.cover_photo_path ?? null);
      const { error: updateError } = await supabase.from("profiles").update({
        username: parsed.data,
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_path: avatarPath,
        cover_photo_path: coverPath,
        cover_photo_x: coverPath ? coverX : 50,
        cover_photo_y: coverPath ? coverY : 50,
      }).eq("id", profile.id);
      if (updateError) throw updateError;
      committed = true;
      setRefreshing(true);
      if (pickedFile || removeAvatar) {
        if (!(await cleanupAvatarFolder(profile.id, avatarPath))) toast.error(t("Picture saved, but the previous file could not be cleaned up"));
      }
      if (uploadedCover || removeCover) {
        if (!(await cleanupCoverFolder(profile.id, coverPath))) toast.error(t("Cover saved, but the previous file could not be cleaned up"));
      }
      await onSaved();
      setUsername(parsed.data);
      setDisplayName(displayName.trim());
      setBio(bio.trim());
      setPickedFile(null);
      setRemoveAvatar(false);
      setCoverFile(null);
      setRemoveCover(false);
      if (!coverPath) { setCoverX(50); setCoverY(50); }
      toast.success(t("Your changes have been saved"));
    } catch (saveError) {
      // Roll back only unreferenced new uploads; never remove a committed photo.
      if (!committed) {
        if (uploadedAvatar) await supabase.storage.from("avatars").remove([uploadedAvatar]);
        if (uploadedCover) await supabase.storage.from("covers").remove([uploadedCover]);
      }
      const message = saveError instanceof Error ? saveError.message : "Couldn't save your changes";
      setError(message);
      toast.error(t(message));
    } finally { setSaving(false); setRefreshing(false); }
  }

  return (
    <>
      <form onSubmit={save} className="space-y-6" noValidate>
        <section aria-labelledby="edit-information-title">
          <h2 id="edit-information-title" className="font-display text-lg font-semibold tracking-normal">Edit My Information</h2>
          <fieldset disabled={busy} className="mt-5 min-w-0 space-y-6">
            <div className="mx-auto max-w-xl">
              <div className="relative rounded-t-lg">
                <CoverBanner url={shownCover} x={coverX} y={coverY} className="rounded-t-lg" onPositionChange={hasCover ? (x, y) => { setCoverX(x); setCoverY(y); } : undefined} />
                <div className="absolute end-3 top-3 flex gap-2">
                  <Button type="button" variant="secondary" size="icon" className="size-9" title={t(hasCover ? "Change Cover Photo" : "Upload Cover Photo")} aria-label={t(hasCover ? "Change Cover Photo" : "Upload Cover Photo")} onClick={() => coverInput.current?.click()}><ImagePlus className="size-4" /></Button>
                  {hasCover && <Button type="button" variant="secondary" size="icon" className="size-9" title={t("Remove Cover Photo")} aria-label={t("Remove Cover Photo")} onClick={() => { setCoverFile(null); setRemoveCover(true); setCoverX(50); setCoverY(50); }}><Trash2 className="size-4" /></Button>}
                </div>
                {username === "abdessamed" && <BadgeCheck aria-label={t("Verified account")} className="absolute right-3 top-full z-10 mt-3 size-7 text-verified verified-spin" />}
              </div>
              <div className="relative -mt-10 flex flex-col items-center sm:-mt-14">
                <div className="relative">
                  <div data-profile-avatar className="size-28 overflow-hidden rounded-full border border-border bg-muted shadow-[var(--shadow-glow)]">
                    {shownAvatar ? <img src={shownAvatar} alt="Your profile picture" className="size-full object-cover" /> : <div className="flex size-full items-center justify-center font-display text-2xl text-muted-foreground">{(displayName || username || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("")}</div>}
                  </div>
                  <Button type="button" variant="secondary" size="icon" className="absolute bottom-0 end-0 size-8 rounded-full border border-border" title={t(shownAvatar ? "Change picture" : "Add picture")} aria-label={t(shownAvatar ? "Change picture" : "Add picture")} onClick={() => fileInput.current?.click()}><Camera className="size-4" /></Button>
                </div>
                <p className="mt-5 max-w-full break-words text-center font-display text-xl font-semibold tracking-normal">{displayName || username}</p>
                <p className="mt-1 max-w-full break-all text-center text-sm text-primary">@{username}</p>
                {bio && <p className="mt-3 max-w-sm break-words text-center text-sm text-muted-foreground">{bio}</p>}
                {shownAvatar && <Button type="button" variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => { setPickedFile(null); setRemoveAvatar(true); }}><Trash2 className="me-2 size-3.5" />Remove picture</Button>}
              </div>
              <input ref={fileInput} type="file" accept={AVATAR_ACCEPT} aria-label="Profile picture file" className="hidden" onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ""; }} />
              <input ref={coverInput} type="file" accept={AVATAR_ACCEPT} aria-label="Cover photo file" className="hidden" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
              <p className="mt-4 text-center text-xs text-muted-foreground">JPG, PNG or WebP · picture up to 3 MB · cover up to 5 MB</p>
              {avatarError && <p role="alert" className="mt-3 text-sm text-destructive">{t(avatarError)}</p>}
              {coverError && <p role="alert" className="mt-3 text-sm text-destructive">{t(coverError)}</p>}
              {hasCover && <div className="mt-5 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
                <div className="space-y-3"><div className="flex justify-between gap-2 text-sm"><Label htmlFor="cover-x">Horizontal position</Label><span className="tabular-nums text-muted-foreground">{Math.round(coverX)}%</span></div><Slider id="cover-x" aria-label={t("Horizontal position")} min={0} max={100} step={1} value={[coverX]} onValueChange={([value]) => { if (value !== undefined) setCoverX(value); }} /></div>
                <div className="space-y-3"><div className="flex justify-between gap-2 text-sm"><Label htmlFor="cover-y">Vertical position</Label><span className="tabular-nums text-muted-foreground">{Math.round(coverY)}%</span></div><Slider id="cover-y" aria-label={t("Vertical position")} min={0} max={100} step={1} value={[coverY]} onValueChange={([value]) => { if (value !== undefined) setCoverY(value); }} /></div>
              </div>}
            </div>
            <div className="grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="username">Username</Label><Input id="username" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="yourname" autoComplete="username" /><p className="break-all text-xs text-muted-foreground">Your page lives at /{username || "…"}</p></div>
              <div className="space-y-2"><Label htmlFor="display-name">Full name</Label><Input id="display-name" value={displayName} onChange={(e) => setDisplayName(stripEmoji(e.target.value))} placeholder="Your name" maxLength={60} autoComplete="name" /><p className="text-xs text-muted-foreground">Emojis aren't allowed in your name</p></div>
              <div className="space-y-2 sm:col-span-2"><Label htmlFor="bio">Bio</Label><Textarea id="bio" rows={3} maxLength={BIO_MAX} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Say something about yourself" /><p className="text-end text-xs tabular-nums text-muted-foreground">{bio.length}/{BIO_MAX}</p></div>
            </div>
          </fieldset>
        </section>
        <div className="sticky bottom-0 z-20 flex flex-col gap-3 border-t border-border bg-background/95 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="min-w-0 text-sm"><p className={dirty ? "text-primary" : "text-muted-foreground"}>{dirty ? "Unsaved changes" : "Up to date"}</p>{error && <p role="alert" className="mt-1 text-destructive">{t(error)}</p>}</div>
          <div className="flex min-w-0 gap-2"><Button type="button" variant="ghost" disabled={!dirty || busy} onClick={cancel} className="h-auto min-h-9 min-w-0 flex-1 whitespace-normal py-2 sm:flex-none"><X className="me-2 size-4 shrink-0" />Cancel</Button><Button type="submit" disabled={!dirty || busy} className="h-auto min-h-9 min-w-0 flex-1 whitespace-normal py-2 sm:flex-none"><Save className="me-2 size-4 shrink-0" />{busy ? "Saving…" : "Save Changes"}</Button></div>
        </div>
      </form>
      <AlertDialog open={blocker.status === "blocked"} onOpenChange={(open) => { if (!open) blocker.reset?.(); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel><AlertDialogAction onClick={() => blocker.proceed?.()}>Discard changes</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </>
  );
}
