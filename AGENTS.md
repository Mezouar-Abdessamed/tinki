<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Database schema

- `supabase/migrations` is the **authoritative** source of truth for the
  database schema. Apply all schema changes through Lovable Cloud's
  migration tool.
- `drizzle/` is **legacy and unused** — never run `drizzle-kit migrate` or
  apply files from `drizzle/migrations`. They are stale (e.g. the
  `profile_events` definition there predates the 16-platform CHECK and
  `custom_link_click` support) and will diverge from the live schema.
- Use the app-local typed alias of the generated browser client until Cloud migrations are restored, because generated types currently describe an empty schema; the alias does not change credentials or authorization.

## Landing previews

- Keep the QR center asset in the shared QR renderer via a Lovable Assets pointer so previews, readability checks, and downloads use the same image.

- Render landing-page phone and desktop examples through `DemoPublicProfile` so both stay aligned with the public profile experience.

## Localization

- Keep supported language dictionaries in `src/lib/i18n-*.ts` and route every language control through the shared `LanguageProvider` so selections stay synchronized.

## Profile covers

- Render uploaded covers inside `ProfileCard` with the shared `CoverBanner` treatment, keeping the existing avatar element unchanged; this maintains parity between public and dashboard previews.
- Store only cover paths and focal percentages on profiles, with per-user files in the dedicated private covers bucket; this preserves access control and avoids persisted URLs.
- Resolve avatar and cover paths through short-lived signed links from their private buckets; public profile visitors need working photos without making buckets public.

## Page backgrounds

- Resolve every stored background value through `getBackgroundUrl` in `src/lib/profiles.ts` so object paths and legacy signed URLs both display; only values matching the `<user id>/<file>` shape are re-signed, with a short TTL rather than a long-lived one.
