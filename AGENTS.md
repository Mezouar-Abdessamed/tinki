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
- Customize Profile uses the full-page variant of the shared `ProfilePreview` with the non-compact `ProfileCard`; preview controls only change the view, not draft values or saved appearance, so the background and public card remain inspectable without publishing.

## QR rendering

- Draw outer QR rounding in the shared SVG renderer and preserve alpha when rasterizing PNGs; this keeps previews and downloads aligned without clipping QR modules or the overlapping avatar.

## Localization

- Keep supported language dictionaries in `src/lib/i18n-*.ts` and route every language control through the shared `LanguageProvider` so selections stay synchronized.

## Signup

- Gate the registration page and signup entry points through the shared presentation-only signup availability switch; retain the form for restoration and leave hosted authentication and Google login unchanged.
- Require a returned authenticated session before signup navigates to the dashboard; let the shared `useMyProfile` path create the stored username's profile so registration and dashboard requests cannot race to insert it twice.
- Keep `/verify-email` as a public redirect to login for old bookmarks rather than an active signup-code form; hosted email auto-confirm settings determine whether account creation returns a session.

## Profile covers

- Render uploaded covers inside `ProfileCard` with the shared `CoverBanner` treatment, keeping the existing avatar element unchanged; this maintains parity between public and dashboard previews.
- Store only cover paths and focal percentages on profiles, with per-user files in the dedicated private covers bucket; this preserves access control and avoids persisted URLs.
- Resolve avatar and cover paths through short-lived signed links from their private buckets; public profile visitors need working photos without making buckets public.
- Stage profile details, avatar and cover edits together and commit their references in one profile update before deleting old files; this keeps Save and Cancel consistent and protects active photos on failures.
- Keep account password controls in the information page's security tab, using the existing email recovery route for users without a current password; never infer password existence from the Google identity.
- Accept an optional validated `tab` search parameter on the information page for direct security shortcuts, preserving profile editing as the default and the existing unsaved-change guards.

## Page backgrounds

- Resolve every stored background value through `getBackgroundUrl` in `src/lib/profiles.ts` so object paths and legacy signed URLs both display; only values matching the `<user id>/<file>` shape are re-signed, with a short TTL rather than a long-lived one.
