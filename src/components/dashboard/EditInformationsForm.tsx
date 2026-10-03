import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CoverBanner } from "@/components/CoverBanner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * Deleting the previous cover can fail on a transient storage/network error.
 * Retry a couple of times with a short backoff; the caller decides what to do
 * when every attempt fails (never blocks the save for long).
 */
async function removeCoverWithRetry(path: string): Promise<boolean> {
  for (let attempt = 0; attempt <= COVER_CLEANUP_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, COVER_CLEANUP_RETRY_DELAY_MS * attempt));
    }
    const { error } = await supabase.storage.from("covers").remove([path]);
    if (!error) return true;
  }
  return false;
}

/**
 * After a new cover becomes active, remove every other object in the user's
 * covers folder (orphans from earlier failed cleanups included). Only touches
 * paths inside `${userId}/`; failures never affect the saved profile.
 */
async function cleanupCoverFolder(userId: string, keepPath: string): Promise<boolean> {
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
}: {
  profile: Profile;
  avatarUrl: string | null;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const fileInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");


  // Avatar is staged locally and only written after the profile save succeeds.
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [savedCoverUrl, setSavedCoverUrl] = useState<string | null>(null);
  const [coverX, setCoverX] = useState(profile.cover_photo_x ?? 50);
  const [coverY, setCoverY] = useState(profile.cover_photo_y ?? 50);
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pickedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(pickedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pickedFile]);

  useEffect(() => {
    let active = true;
    if (!profile.cover_photo_path) { setSavedCoverUrl(null); return; }
    void getCoverUrl(profile.cover_photo_path).then((url) => { if (active) setSavedCoverUrl(url); });
    return () => { active = false; };
  }, [profile.cover_photo_path]);

  useEffect(() => {
    if (!coverFile) { setCoverPreview(null); return; }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  function pickCover(file: File | undefined) {
    if (!file) return;
    if (!isAllowedAvatarType(file.type)) { setCoverError("Choose a JPG, PNG or WebP image"); toast.error("Choose a JPG, PNG or WebP image"); return; }
    if (file.size > MAX_COVER_BYTES) { setCoverError("Cover photo must be 5 MB or less"); toast.error("Cover photo must be 5 MB or less"); return; }
    setCoverError(null);
    setCoverFile(file);
  }

  async function saveCover() {
    if (!coverFile && !profile.cover_photo_path) return;
    setCoverSaving(true);
    setCoverError(null);
    let uploadedPath: string | null = null;
    try {
      if (coverFile) {
        const { blob, contentType } = await reencodeAvatar(coverFile, 1600);
        if (blob.size > MAX_COVER_BYTES) throw new Error("Processed cover exceeds 5 MB. Try a smaller image.");
        const path = `${profile.id}/${crypto.randomUUID()}.${extensionForType(contentType)}`;
        const { error } = await supabase.storage.from("covers").upload(path, blob, { upsert: false, contentType });
        if (error) throw error;
        uploadedPath = path;
      }
      const { error } = await supabase.from("profiles").update({
        cover_photo_path: uploadedPath ?? profile.cover_photo_path,
        cover_photo_x: coverX,
        cover_photo_y: coverY,
      }).eq("id", profile.id);
      if (error) throw error;
      if (uploadedPath) {
        const cleaned = await cleanupCoverFolder(profile.id, uploadedPath);
        if (!cleaned) toast.error("Cover saved, but the previous file could not be cleaned up");
      }
      if (uploadedPath) {
        try { setSavedCoverUrl(await getCoverUrl(uploadedPath)); }
        catch { setSavedCoverUrl(null); }
      }
      setCoverFile(null);
      toast.success("Cover photo saved");
      onSaved();
    } catch (err) {
      if (uploadedPath) await supabase.storage.from("covers").remove([uploadedPath]);
      const message = err instanceof Error ? err.message : "Could not save cover photo";
      setCoverError(message);
      toast.error(message);
    } finally { setCoverSaving(false); }
  }

  async function removeCoverPhoto() {
    if (!profile.cover_photo_path) { setCoverFile(null); return; }
    setCoverSaving(true);
    setCoverError(null);
    try {
      const { error: updateError } = await supabase.from("profiles").update({ cover_photo_path: null, cover_photo_x: 50, cover_photo_y: 50 }).eq("id", profile.id);
      if (updateError) throw updateError;
      const cleaned = await removeCoverWithRetry(profile.cover_photo_path);
      if (!cleaned) {
        // Storage deletion failed after retries: restore the reference so the
        // database never points at a deleted cover, then report the failure.
        const { error: restoreError } = await supabase.from("profiles").update({ cover_photo_path: profile.cover_photo_path, cover_photo_x: profile.cover_photo_x, cover_photo_y: profile.cover_photo_y }).eq("id", profile.id);
        if (restoreError) throw new Error("Cover removal failed and its reference could not be restored. Please refresh your profile.");
        throw new Error("Cover removal failed. Please try again.");
      }
      setCoverFile(null);
      setSavedCoverUrl(null);
      setCoverX(50);
      setCoverY(50);
      toast.success("Cover photo removed");
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not remove cover photo";
      setCoverError(message);
      toast.error(message);
    } finally { setCoverSaving(false); }
  }

  const shownAvatar = previewUrl ?? (removeAvatar ? null : avatarUrl);
  const hasAvatar = Boolean(shownAvatar);

  function pickFile(file: File | undefined) {
    if (!file) return;
    // Raster images only — SVG can carry scripts and the bucket is publicly readable.
    if (!isAllowedAvatarType(file.type)) {
      toast.error("Choose a JPG, PNG or WebP image");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error("That picture is larger than 3 MB");
      return;
    }
    setRemoveAvatar(false);
    setPickedFile(file);
  }


  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedUsername = usernameSchema.safeParse(username);
    if (!parsedUsername.success) {
      setError(firstError(parsedUsername.error));
      return;
    }
    const nextUsername = parsedUsername.data;

    if (displayName.trim().length > 60) {
      setError("Full name must be 60 characters or fewer");
      return;
    }
    if (bio.trim().length > BIO_MAX) {
       setError(t(`Bio must be ${BIO_MAX} characters or fewer`));
      return;
    }




    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      // The current username stays valid; anything else must be free.
      if (nextUsername !== profile.username && !(await isUsernameAvailable(nextUsername))) {
        setError("That username is already taken");
        return;
      }

      // 1. Upload the new picture first — the old one keeps working until we succeed.
      if (pickedFile) {
        // Re-encode through a canvas so only clean raster bytes are stored.
        const { blob, contentType } = await reencodeAvatar(pickedFile);
        const path = `${profile.id}/${crypto.randomUUID()}.${extensionForType(contentType)}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, blob, { upsert: false, contentType });
        if (uploadError) throw uploadError;
        uploadedPath = path;
      }


      const nextAvatarPath = uploadedPath ?? (removeAvatar ? null : profile.avatar_path);

      // 2. Save the profile.
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          username: nextUsername,
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          avatar_path: nextAvatarPath,
        })
        .eq("id", profile.id);
      if (updateError) throw updateError;

      // 3. Only now is it safe to delete the previous picture. Failures never
      // undo the save; the folder sweep also clears orphans left by earlier
      // failed cleanups, so a later avatar save self-heals.
      if (pickedFile || removeAvatar) {
        const cleaned = await cleanupAvatarFolder(profile.id, nextAvatarPath);
        if (!cleaned) toast.error("Picture saved, but the previous file could not be cleaned up");
      }

      setPickedFile(null);
      setRemoveAvatar(false);
      toast.success("Your changes have been saved.");
      onSaved();
    } catch (saveError) {
      // Clean up an orphaned upload so storage doesn't collect dead files.
      if (uploadedPath) await supabase.storage.from("avatars").remove([uploadedPath]);
      const message =
        saveError instanceof Error ? saveError.message : "Couldn't save your changes";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-8" noValidate>
      <section className="panel p-6">
        <h2 className="font-display text-lg font-semibold">Edit My Informations</h2>

        <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
            {shownAvatar ? (
              <img src={shownAvatar} alt="Your profile picture" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-xl text-muted-foreground">
                {(displayName || username || "?").trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(event) => pickFile(event.target.files?.[0])}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              {hasAvatar ? "Change picture" : "Add picture"}
            </Button>
            {hasAvatar ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPickedFile(null);
                  setRemoveAvatar(true);
                }}
              >
                Remove picture
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-7 grid gap-5 sm:max-w-lg">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(event) => setUsername(event.target.value.toLowerCase())}
              placeholder="yourname"
            />
            <p className="text-xs text-muted-foreground">Your page lives at /{username || "…"}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="display-name">Full name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(stripEmoji(event.target.value))}
              placeholder="Your name"
              maxLength={60}
            />
            <p className="text-xs text-muted-foreground">Emojis aren't allowed in your name.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio</Label>
            <Textarea
              id="bio"
              rows={3}
              maxLength={BIO_MAX}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="Say something about yourself"
            />
            <p className="text-xs text-muted-foreground">
              {bio.length}/{BIO_MAX} — clear the field to remove your bio.
            </p>
          </div>
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="font-display text-lg font-semibold">Cover Photo</h2>
        <div className="mt-5 max-w-xl overflow-hidden rounded-lg border border-border">
          {coverPreview || savedCoverUrl || profile.cover_photo_path ? (
            <CoverBanner url={coverPreview ?? savedCoverUrl} x={coverX} y={coverY} className="w-full" />
          ) : <div className="flex aspect-[851/315] items-center justify-center bg-secondary text-sm text-muted-foreground">No cover photo</div>}
        </div>
        {(coverPreview || savedCoverUrl || profile.cover_photo_path) && <div className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2">
          <div><Label htmlFor="cover-x">Horizontal position</Label><input id="cover-x" type="range" min="0" max="100" value={coverX} onChange={(e) => setCoverX(Number(e.target.value))} className="mt-2 w-full accent-primary" /></div>
          <div><Label htmlFor="cover-y">Vertical position</Label><input id="cover-y" type="range" min="0" max="100" value={coverY} onChange={(e) => setCoverY(Number(e.target.value))} className="mt-2 w-full accent-primary" /></div>
        </div>}
        <input ref={coverInput} type="file" accept={AVATAR_ACCEPT} className="hidden" onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={coverSaving} onClick={() => coverInput.current?.click()}>{profile.cover_photo_path || coverFile ? "Change Cover Photo" : "Upload Cover Photo"}</Button>
          {(coverFile || profile.cover_photo_path) && <Button type="button" disabled={coverSaving} onClick={() => void saveCover()}>{coverSaving ? "Saving cover…" : "Save Cover Photo"}</Button>}
          {coverFile && profile.cover_photo_path && <Button type="button" variant="ghost" disabled={coverSaving} onClick={() => setCoverFile(null)}>Discard selection</Button>}
          {(coverFile || profile.cover_photo_path) && <Button type="button" variant="ghost" disabled={coverSaving} onClick={() => void removeCoverPhoto()}>Remove Cover Photo</Button>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">JPG, PNG or WebP · up to 5 MB</p>
        {coverError && <p role="alert" className="mt-3 text-sm text-destructive">{coverError}</p>}
      </section>


      <div className="panel flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Changes go live on your public page immediately.
            </p>
          )}
        </div>
        <Button type="submit" disabled={saving} className="sm:w-auto">
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
