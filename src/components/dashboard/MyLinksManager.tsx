import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQuery } from "@tanstack/react-query";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { SocialIcon } from "@/components/SocialIcon";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AppTableUpdate } from "@/lib/database-types";
import {
  CUSTOM_LINK_ICONS,
  CUSTOM_LINK_TYPES,
  CustomLinkIcon,
  createCustomLink,
  deleteCustomLink,
  displayCustomDestination,
  fetchCustomLinks,
  normalizeCustomDestination,
  reorderCustomLinks,
  updateCustomLink,
  validateCustomDestination,
  type CustomLink,
  type CustomLinkType,
} from "@/lib/custom-links";
import { updateMyProfile, type Profile } from "@/lib/profiles";
import {
  fetchSocialLinkSettings,
  saveSocialLinkSettings,
  type SocialLinkSetting,
} from "@/lib/social-link-settings";
import {
  normalizeSocialUrl,
  SOCIAL_PLATFORMS,
  validateSocialUrl,
  type SocialKey,
  type SocialPlatform,
} from "@/lib/profile-validation";

type CustomDraft = { name: string; destination: string; icon: string; linkType: CustomLinkType };
const EMPTY_CUSTOM: CustomDraft = { name: "", destination: "", icon: "globe", linkType: "link" };

type DeleteTarget =
  { kind: "social"; platform: SocialPlatform } | { kind: "custom"; link: CustomLink };

function SortableRow({ id, children }: { id: string; children: (handle: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-20 opacity-70" : undefined}
    >
      {children(
        <button
          type="button"
          className="flex h-10 w-7 shrink-0 cursor-grab items-center justify-center text-muted-foreground transition-colors hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-5 w-5" />
        </button>,
      )}
    </div>
  );
}

function LinkRow({
  handle,
  icon,
  title,
  detail,
  enabled,
  onToggle,
  onEdit,
  onDelete,
}: {
  handle: ReactNode;
  icon: ReactNode;
  title: string;
  detail: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="grid min-h-16 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border bg-secondary/65 px-2 py-2.5 sm:gap-3 sm:px-3">
      {handle}
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-background/55 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail || "Not connected"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`${enabled ? "Disable" : "Enable"} ${title}`}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onEdit}
          title="Edit"
          aria-label={`Edit ${title}`}
        >
          <Pencil />
        </Button>
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title="Delete"
            aria-label={`Delete ${title}`}
          >
            <Trash2 className="text-destructive" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function MyLinksManager({
  profile,
  onProfileSaved,
}: {
  profile: Profile;
  onProfileSaved: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [socialSettings, setSocialSettings] = useState<SocialLinkSetting[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomLink[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<"social" | "custom">("social");
  const [socialEditing, setSocialEditing] = useState<SocialPlatform | null>(null);
  const [socialValue, setSocialValue] = useState("");
  const [customEditing, setCustomEditing] = useState<CustomLink | null>(null);
  const [customDraft, setCustomDraft] = useState<CustomDraft>(EMPTY_CUSTOM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["social-link-settings", profile.id],
    queryFn: () => fetchSocialLinkSettings(profile.id),
  });
  const customQuery = useQuery({
    queryKey: ["custom-links", profile.id],
    queryFn: () => fetchCustomLinks(profile.id),
  });

  useEffect(() => {
    if (settingsQuery.data) setSocialSettings(settingsQuery.data);
  }, [settingsQuery.data]);
  useEffect(() => {
    if (customQuery.data) setCustomLinks(customQuery.data);
  }, [customQuery.data]);

  const platforms = useMemo(
    () =>
      SOCIAL_PLATFORMS.filter((platform) => {
        const value = profile[platform.field];
        return typeof value === "string" && value.trim().length > 0;
      }).sort((a, b) => {
        const aPosition =
          socialSettings.find((setting) => setting.platform === a.key)?.position ??
          SOCIAL_PLATFORMS.indexOf(a);
        const bPosition =
          socialSettings.find((setting) => setting.platform === b.key)?.position ??
          SOCIAL_PLATFORMS.indexOf(b);
        return aPosition - bPosition;
      }),
    [profile, socialSettings],
  );

  async function persistSocialSettings(next: SocialLinkSetting[]) {
    setSocialSettings(next);
    try {
      await saveSocialLinkSettings(next);
      await settingsQuery.refetch();
    } catch {
      toast.error("Couldn't update your social links");
      setSocialSettings(settingsQuery.data ?? []);
    }
  }

  function endSocialDrag(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = platforms.findIndex((item) => item.key === active.id);
    const newIndex = platforms.findIndex((item) => item.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reorderedPlatforms = arrayMove(platforms, oldIndex, newIndex);
    const visiblePositions = platforms
      .map(
        (platform) => socialSettings.find((setting) => setting.platform === platform.key)?.position,
      )
      .filter((position): position is number => typeof position === "number")
      .sort((a, b) => a - b);
    const positionByPlatform = new Map(
      reorderedPlatforms.map((platform, index) => [platform.key, visiblePositions[index] ?? index]),
    );
    const next = socialSettings
      .map((setting) => ({
        ...setting,
        position: positionByPlatform.get(setting.platform) ?? setting.position,
      }))
      .sort((a, b) => a.position - b.position);
    void persistSocialSettings(next);
  }

  async function endCustomDrag(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customLinks.findIndex((item) => item.id === active.id);
    const newIndex = customLinks.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(customLinks, oldIndex, newIndex);
    setCustomLinks(next);
    try {
      await reorderCustomLinks(
        profile.id,
        next.map((link) => link.id),
      );
      await customQuery.refetch();
    } catch {
      setCustomLinks(customQuery.data ?? []);
      toast.error("Couldn't reorder your custom links");
    }
  }

  function openSocial(platform: SocialPlatform) {
    setPickerOpen(false);
    setSocialEditing(platform);
    setSocialValue(profile[platform.field] ?? "");
    setError(null);
  }

  async function saveSocial(event: React.FormEvent) {
    event.preventDefault();
    if (!socialEditing) return;
    const message = validateSocialUrl(socialEditing, socialValue);
    if (message) return setError(message);
    setSaving(true);
    const normalized = normalizeSocialUrl(socialValue);
    const profileUpdate: AppTableUpdate<"profiles"> = {};
    profileUpdate[socialEditing.field] = normalized || null;
    try {
      await updateMyProfile(profileUpdate);
      if (normalized) {
        const next = socialSettings.map((setting) =>
          setting.platform === socialEditing.key ? { ...setting, enabled: true } : setting,
        );
        await saveSocialLinkSettings(next);
        setSocialSettings(next);
      }
      setSocialEditing(null);
      onProfileSaved();
      toast.success(`${socialEditing.label} updated`);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Couldn't update social link");
    } finally {
      setSaving(false);
    }
  }

  function removeSocial(platform: SocialPlatform) {
    setDeleteTarget({ kind: "social", platform });
  }

  function openCustom(link?: CustomLink) {
    setPickerOpen(false);
    setCustomEditing(link ?? null);
    setCustomDraft(
      link
        ? {
            name: link.name,
            destination: displayCustomDestination(link.url),
            icon: link.icon,
            linkType: (link.link_type as CustomLinkType) || "link",
          }
        : EMPTY_CUSTOM,
    );
    setError(null);
  }

  async function saveCustom(event: React.FormEvent) {
    event.preventDefault();
    const name = customDraft.name.trim();
    if (!name) return setError("Enter a link name");
    if (name.length > 80) return setError("Keep the link name under 80 characters");
    const destinationError = validateCustomDestination(
      customDraft.destination,
      customDraft.linkType,
    );
    if (destinationError) return setError(destinationError);
    setSaving(true);
    const payload = {
      name,
      url: normalizeCustomDestination(customDraft.destination, customDraft.linkType),
      icon: customDraft.icon,
      link_type: customDraft.linkType,
    };
    try {
      if (customEditing) {
        await updateCustomLink(customEditing.id, payload);
      } else {
        await createCustomLink(payload);
      }
      setCustomEditing(null);
      setCustomDraft(EMPTY_CUSTOM);
      await customQuery.refetch();
      toast.success(customEditing ? "Custom link updated" : "Custom link added");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Couldn't save custom link");
    } finally {
      setSaving(false);
    }
  }

  async function toggleCustom(link: CustomLink, enabled: boolean) {
    setCustomLinks((items) =>
      items.map((item) => (item.id === link.id ? { ...item, enabled } : item)),
    );
    try {
      await updateCustomLink(link.id, { enabled });
    } catch {
      toast.error("Couldn't update that link");
    }
    await customQuery.refetch();
  }

  function removeCustom(link: CustomLink) {
    setDeleteTarget({ kind: "custom", link });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setDeleting(true);
    if (target.kind === "social") {
      const profileUpdate: AppTableUpdate<"profiles"> = {};
      profileUpdate[target.platform.field] = null;
      try {
        await updateMyProfile(profileUpdate);
        onProfileSaved();
        toast.success(`${target.platform.label} link deleted`);
      } catch {
        toast.error("Couldn't delete that link");
      } finally {
        setDeleting(false);
      }
      return;
    }
    try {
      await deleteCustomLink(target.link.id);
      await customQuery.refetch();
      toast.success("Custom link deleted");
    } catch {
      toast.error("Couldn't delete that link");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <header className="min-w-0">
          <h1 className="font-display text-3xl font-semibold">My Links</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage, order, and control every link shown on your public profile
          </p>
        </header>
        <Button type="button" onClick={() => setPickerOpen(true)}>
          <Plus /> Add Link
        </Button>
      </div>

      <section aria-labelledby="social-links-heading">
        <div className="mb-4">
          <h2 id="social-links-heading" className="font-display text-lg font-semibold">
            Social & platform links
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag to set the order of your profile icons
          </p>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={endSocialDrag}>
          <SortableContext
            items={platforms.map((item) => item.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-2.5">
              {platforms.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                  No social links yet. Use Add Link to add one
                </div>
              ) : null}
              {platforms.map((platform) => {
                const setting = socialSettings.find((item) => item.platform === platform.key);
                const value = profile[platform.field] ?? "";
                const enabled = Boolean(value) && (setting?.enabled ?? true);
                return (
                  <SortableRow key={platform.key} id={platform.key}>
                    {(handle) => (
                      <LinkRow
                        handle={handle}
                        icon={<SocialIcon platform={platform.key} className="h-5 w-5" />}
                        title={platform.label}
                        detail={value}
                        enabled={enabled}
                        onToggle={(checked) =>
                          value
                            ? void persistSocialSettings(
                                socialSettings.map((item) =>
                                  item.platform === platform.key
                                    ? { ...item, enabled: checked }
                                    : item,
                                ),
                              )
                            : openSocial(platform)
                        }
                        onEdit={() => openSocial(platform)}
                        {...(value ? { onDelete: () => void removeSocial(platform) } : {})}
                      />
                    )}
                  </SortableRow>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section aria-labelledby="custom-links-heading">
        <div className="mb-4">
          <h2 id="custom-links-heading" className="font-display text-lg font-semibold">
            Custom Links
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Websites, phone contacts, email addresses, and more
          </p>
        </div>
        {customQuery.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!customQuery.isLoading && customLinks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
            No custom links yet
          </div>
        ) : null}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(event) => void endCustomDrag(event)}
        >
          <SortableContext
            items={customLinks.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-2.5">
              {customLinks.map((link) => (
                <SortableRow key={link.id} id={link.id}>
                  {(handle) => (
                    <LinkRow
                      handle={handle}
                      icon={<CustomLinkIcon icon={link.icon} className="h-5 w-5" />}
                      title={link.name}
                      detail={displayCustomDestination(link.url)}
                      enabled={link.enabled}
                      onToggle={(checked) => void toggleCustom(link, checked)}
                      onEdit={() => openCustom(link)}
                      onDelete={() => void removeCustom(link)}
                    />
                  )}
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <div className="rounded-lg border border-border bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
        Changes go live on your public profile immediately
      </div>

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add a new link</DialogTitle>
            <DialogDescription>Choose what you want to add to your profile</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-secondary p-1">
            <Button
              type="button"
              variant={pickerMode === "social" ? "default" : "ghost"}
              onClick={() => setPickerMode("social")}
            >
              Social / Platform
            </Button>
            <Button
              type="button"
              variant={pickerMode === "custom" ? "default" : "ghost"}
              onClick={() => setPickerMode("custom")}
            >
              Custom Link
            </Button>
          </div>
          {pickerMode === "social" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SOCIAL_PLATFORMS.map((platform) => (
                <Button
                  key={platform.key}
                  type="button"
                  variant="outline"
                  className="h-12 justify-start"
                  onClick={() => openSocial(platform)}
                >
                  <SocialIcon platform={platform.key} className="h-5 w-5 text-primary" />{" "}
                  {platform.label}
                </Button>
              ))}
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm font-medium">Custom link type</p>
              <div className="grid grid-cols-3 gap-2">
                {CUSTOM_LINK_TYPES.map((type) => (
                  <Button
                    key={type.key}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      openCustom();
                      setCustomDraft({
                        ...EMPTY_CUSTOM,
                        linkType: type.key,
                        icon: type.key === "link" ? "globe" : type.key,
                      });
                    }}
                  >
                    <type.icon /> {type.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(socialEditing)}
        onOpenChange={(open) => !open && setSocialEditing(null)}
      >
        <DialogContent>
          <form onSubmit={saveSocial} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>
                {socialEditing ? `Edit ${socialEditing.label}` : "Edit social link"}
              </DialogTitle>
              <DialogDescription>Paste the full profile URL visitors should open</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="social-url">Profile URL</Label>
              <Input
                id="social-url"
                value={socialValue}
                onChange={(event) => setSocialValue(event.target.value)}
                placeholder={socialEditing?.placeholder}
                autoFocus
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSocialEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(customEditing) || customDraft !== EMPTY_CUSTOM}
        onOpenChange={(open) => {
          if (!open) {
            setCustomEditing(null);
            setCustomDraft(EMPTY_CUSTOM);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <form onSubmit={saveCustom} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>{customEditing ? "Edit custom link" : "Add custom link"}</DialogTitle>
              <DialogDescription>
                Choose the destination, label, and icon visitors will see
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {CUSTOM_LINK_TYPES.map((type) => (
                  <Button
                    key={type.key}
                    type="button"
                    variant={customDraft.linkType === type.key ? "default" : "outline"}
                    onClick={() =>
                      setCustomDraft((value) => ({
                        ...value,
                        linkType: type.key,
                        icon:
                          value.icon === "globe" || value.icon === "phone" || value.icon === "email"
                            ? type.key === "link"
                              ? "globe"
                              : type.key
                            : value.icon,
                      }))
                    }
                  >
                    <type.icon /> {type.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-name">Name</Label>
              <Input
                id="custom-name"
                value={customDraft.name}
                maxLength={80}
                onChange={(event) =>
                  setCustomDraft((value) => ({ ...value, name: event.target.value }))
                }
                placeholder={
                  customDraft.linkType === "phone"
                    ? "Contact Me"
                    : customDraft.linkType === "email"
                      ? "Email Me"
                      : "My Portfolio"
                }
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="custom-destination">
                {customDraft.linkType === "phone"
                  ? "Phone number"
                  : customDraft.linkType === "email"
                    ? "Email address"
                    : "URL"}
              </Label>
              <Input
                id="custom-destination"
                type={
                  customDraft.linkType === "email"
                    ? "email"
                    : customDraft.linkType === "phone"
                      ? "tel"
                      : "url"
                }
                value={customDraft.destination}
                maxLength={2048}
                onChange={(event) =>
                  setCustomDraft((value) => ({ ...value, destination: event.target.value }))
                }
                placeholder={
                  customDraft.linkType === "phone"
                    ? "+213555123456"
                    : customDraft.linkType === "email"
                      ? "example@email.com"
                      : "https://example.com"
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Icon</Label>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
                {CUSTOM_LINK_ICONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setCustomDraft((value) => ({ ...value, icon: item.key }))}
                    aria-label={item.label}
                    title={item.label}
                    className={`grid aspect-square place-items-center rounded-md border transition-colors ${customDraft.icon === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground hover:text-foreground"}`}
                  >
                    <item.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCustomEditing(null);
                  setCustomDraft(EMPTY_CUSTOM);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : customEditing ? "Save Changes" : "Add Link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.kind === "custom"
                ? `Delete “${deleteTarget.link.name}”?`
                : deleteTarget
                  ? `Delete your ${deleteTarget.platform.label} link?`
                  : "Delete link?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the link from your public profile. You can add it back later, but the
              old link settings won't be restored
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
