import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppDatabase } from "@/lib/app-database";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Buckets that hold files owned by a single user, stored under a `<userId>/` prefix. */
const OWNED_BUCKETS = ["avatars", "covers"] as const;

/** Storage removes at most a limited batch per call; keep chunks small and predictable. */
const REMOVE_CHUNK = 100;
const LIST_PAGE = 100;

type AdminClient = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/** Every object physically stored under this user's own folder, page by page. */
async function listOwnedObjects(
  admin: AdminClient,
  bucket: string,
  userId: string,
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await admin.storage
      .from(bucket)
      .list(userId, { limit: LIST_PAGE, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      // Only real files (folder placeholders have no id).
      if (entry.id) paths.push(`${userId}/${entry.name}`);
    }
    if (!data || data.length < LIST_PAGE) return paths;
  }
}

/**
 * Permanently deletes the signed-in user's account.
 *
 * Storage files owned by the user are removed BEFORE the auth user is deleted,
 * and only paths inside that user's own `<userId>/` folder are ever touched, so
 * another account's files can never be affected. Already-missing files are not
 * an error, which makes the whole flow safe to retry: a second run simply finds
 * nothing left to remove. If files genuinely cannot be removed we log it
 * server-side and stop, rather than reporting a success that left orphans.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ username: z.string().min(1) }).parse(data))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const supabase = context.supabase as unknown as SupabaseClient<AppDatabase>;

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("username, avatar_path, cover_photo_path")
      .eq("id", userId)
      .maybeSingle();

    if (error) throw new Error("Could not verify the account.");
    if (profile && profile.username !== data.username.toLowerCase()) {
      throw new Error("The username you typed does not match this account.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    for (const bucket of OWNED_BUCKETS) {
      let paths: string[];
      try {
        paths = await listOwnedObjects(supabaseAdmin, bucket, userId);
      } catch (listError) {
        console.error("[deleteMyAccount] could not list storage files", {
          userId,
          bucket,
          listError,
        });
        throw new Error("Could not delete the account. Please try again.");
      }

      // Include the recorded file only if it belongs to this user's folder.
      const recorded = bucket === "avatars" ? profile?.avatar_path : profile?.cover_photo_path;
      if (recorded && recorded.startsWith(`${userId}/`) && !paths.includes(recorded)) {
        paths.push(recorded);
      }

      for (let index = 0; index < paths.length; index += REMOVE_CHUNK) {
        const chunk = paths.slice(index, index + REMOVE_CHUNK);
        const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(chunk);
        if (removeError) {
          console.error("[deleteMyAccount] storage cleanup failed", {
            userId,
            bucket,
            count: chunk.length,
            removeError,
          });
          throw new Error("Could not delete the account. Please try again.");
        }
      }

      // Confirm the folder really is empty before the account disappears.
      let remaining: string[];
      try {
        remaining = await listOwnedObjects(supabaseAdmin, bucket, userId);
      } catch (verifyError) {
        console.error("[deleteMyAccount] could not verify storage cleanup", {
          userId,
          bucket,
          verifyError,
        });
        throw new Error("Could not delete the account. Please try again.");
      }
      if (remaining.length > 0) {
        console.error("[deleteMyAccount] storage files still present after cleanup", {
          userId,
          bucket,
          remaining: remaining.length,
        });
        throw new Error("Could not delete the account. Please try again.");
      }
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      // A retry after a partial failure finds the user already gone: that is success.
      const alreadyGone =
        (deleteError as { status?: number }).status === 404 ||
        /not\s*found/i.test(deleteError.message ?? "");
      if (!alreadyGone) {
        console.error("[deleteMyAccount] auth user deletion failed", { userId, deleteError });
        throw new Error("Could not delete the account. Please try again.");
      }
    }

    return { success: true };
  });
