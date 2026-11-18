import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Code2,
  FileText,
  Gamepad2,
  Globe2,
  GraduationCap,
  Heart,
  Link as LinkIcon,
  Mail,
  MapPin,
  Music2,
  Phone,
  ShoppingCart,
  Star,
  Store,
  Video,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

import { apiFetch } from "@/lib/api-client";
import type { AppTableRow } from "@/lib/database-types";

export type CustomLink = AppTableRow<"custom_links">;
export type CustomLinkType = "link" | "phone" | "email";

export const CUSTOM_LINK_TYPES = [
  { key: "link", label: "Link", icon: LinkIcon },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "email", label: "Email", icon: Mail },
] as const;

export const CUSTOM_LINK_ICONS = [
  { key: "globe", label: "Website", icon: Globe2 },
  { key: "portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { key: "email", label: "Email", icon: Mail },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "store", label: "Store", icon: Store },
  { key: "shopping", label: "Shopping", icon: ShoppingCart },
  { key: "music", label: "Music", icon: Music2 },
  { key: "video", label: "Video", icon: Video },
  { key: "camera", label: "Camera", icon: Camera },
  { key: "code", label: "Code", icon: Code2 },
  { key: "document", label: "Document", icon: FileText },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "location", label: "Location", icon: MapPin },
  { key: "calendar", label: "Calendar", icon: CalendarDays },
  { key: "link", label: "Link", icon: LinkIcon },
  { key: "heart", label: "Favorite", icon: Heart },
  { key: "game", label: "Gaming", icon: Gamepad2 },
  { key: "book", label: "Book", icon: BookOpen },
  { key: "star", label: "Star", icon: Star },
] as const;

const iconMap = new Map<string, LucideIcon>(CUSTOM_LINK_ICONS.map((item) => [item.key, item.icon]));

export function CustomLinkIcon({ icon, className, style }: { icon: string; className?: string; style?: CSSProperties | undefined }) {
  const Icon = iconMap.get(icon) ?? Globe2;
  return <Icon className={className} style={style} aria-hidden="true" />;
}

export function normalizeCustomDestination(raw: string, type: CustomLinkType) {
  const value = raw.trim();
  if (type === "phone") return `tel:${value.replace(/^tel:/i, "").replace(/[\s()-]/g, "")}`;
  if (type === "email") return `mailto:${value.replace(/^mailto:/i, "").toLowerCase()}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://${value.replace(/^\/+/, "")}`;
}

export function validateCustomDestination(raw: string, type: CustomLinkType) {
  const clean = raw.trim().replace(/^(tel:|mailto:)/i, "");
  if (!clean) return type === "link" ? "Enter a URL" : type === "phone" ? "Enter a phone number" : "Enter an email address";
  if (type === "phone" && !/^\+?[0-9\s()-]{7,20}$/.test(clean)) return "Enter a valid phone number";
  if (type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) return "Enter a valid email address";
  const value = normalizeCustomDestination(raw, type);
  try {
    const parsed = new URL(value);
    if (type === "link" && !["https:", "http:"].includes(parsed.protocol)) return "Enter a valid website URL";
    return null;
  } catch {
    return "Enter a valid destination";
  }
}

export function displayCustomDestination(url: string) {
  return url.replace(/^(mailto:|tel:)/i, "");
}

/** Backwards-compatible helpers for the existing custom-link editor. */
export function normalizeCustomUrl(raw: string) {
  return normalizeCustomDestination(raw, "link");
}

export function validateCustomUrl(raw: string) {
  return validateCustomDestination(raw, "link");
}

export async function fetchCustomLinks(profileId: string, enabledOnly = false) {
  if (typeof window !== "undefined" && profileId) {
    const { fetchCustomLinksFirestore } = await import("@/lib/firestore-repository");
    return await fetchCustomLinksFirestore(profileId, enabledOnly);
  }
  const { links } = await apiFetch<{ links: CustomLink[] }>(
    `/api/profiles/${encodeURIComponent(profileId)}/custom-links${enabledOnly ? "?enabledOnly=true" : ""}`,
  );
  return links ?? [];
}

export async function createCustomLink(input: {
  name: string;
  url: string;
  icon: string;
  link_type: CustomLinkType;
}) {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, createCustomLinkFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      return createCustomLinkFirestore(input);
    }
  }
  const { link } = await apiFetch<{ link: CustomLink }>("/api/custom-links", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return link;
}

export async function updateCustomLink(
  id: string,
  patch: Partial<Pick<CustomLink, "name" | "url" | "icon" | "link_type" | "enabled">>,
) {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, updateCustomLinkFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      return updateCustomLinkFirestore(id, patch);
    }
  }
  const { link } = await apiFetch<{ link: CustomLink }>(
    `/api/custom-links/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
  return link;
}

export async function deleteCustomLink(id: string) {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, deleteCustomLinkFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      await deleteCustomLinkFirestore(id);
      return;
    }
  }
  await apiFetch(`/api/custom-links/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function reorderCustomLinks(targetProfileId: string, orderedIds: string[]) {
  if (typeof window !== "undefined") {
    const { auth: fbAuth, reorderCustomLinksFirestore } = await import("@/lib/firestore-repository");
    if (fbAuth.currentUser) {
      await reorderCustomLinksFirestore(targetProfileId, orderedIds);
      return;
    }
  }
  await apiFetch("/api/custom-links/reorder", {
    method: "POST",
    body: JSON.stringify({ target_profile_id: targetProfileId, ordered_ids: orderedIds }),
  });
}