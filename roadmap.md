# Roadmap

- [x] Reorganize My Information & Security into Profile and Account & Security tabs with shared password settings and existing email recovery access
- [x] Put cover editing behind a centered avatar inside Edit My Information, with staged photo previews, repositioning and shared Save/Cancel controls
- [x] Verify information editing and security views on desktop and mobile (real save/readback, preview cancellation, unsaved warning, password visibility, recovery navigation; email delivery and actual password replacement not exercised)

- [x] Remove unnecessary final dots from site-authored titles and text across all languages, preserving meaningful punctuation (public pages and five languages verified).

- [x] Restore sign-in and sign-up on the published site (live build was missing its public account-service settings; needs a republish).
- [x] Rename visible site branding, metadata, language copy, sharing labels, and QR/browser icons to Tinki.

- [x] Match the cover photo and editing preview to Facebook's 851:315 cover proportions.
- [x] Enable email sign-in and preserve profile view counts when country analytics is unavailable.

- [x] Show existing profile and cover photos from private storage on public and owner pages; verified both images load for signed-in owners and anonymous visitors.

- [x] Restore the uploaded LinkMe app without secrets or project metadata.
- [x] Add the “Costumize QR Code” account page.
- [x] Add the page to desktop and mobile sidebar navigation.
- [x] Verify the build, route registration, and app response.

- [x] Add the existing profile picture to every user QR render and download.
- [x] Verify avatar QR previews, popup behavior, scan-safe sizing, and PNG output.
- [x] Store the supplied LinkMe logo with the project and embed it in every QR render.
- [x] Verify the combined profile picture and center logo remain scannable on-screen and in PNG downloads.
- [x] Match the landing page phone and computer examples to the complete public profile view.
- [x] Verify the updated examples structurally at phone and desktop widths; live capture is blocked by preview authentication.
- [x] Add Spanish across the shared language system and Settings selector.
- [x] Make the homepage language selector compact and responsive while preserving synchronization.
- [x] Add a Views by Country pie chart for the top five countries and an Other percentage.
- [x] Restore country analytics and server-side repeat-view protection (country column, insert guard trigger, and byCountry analytics applied; verified a visit records with country and the dashboard reads totals).
- [x] Round the background plate behind the QR center logo (rounded square in the code's background colour, logo clipped to it; verified the rounded plate renders and the code still decodes).
- [ ] Validate cover upload, replacement, removal, and positioning end to end (blocked: requires a disposable test profile or permission to alter the existing user's cover photo).
- [x] Move analytics insert hardening into supabase/migrations/ (verified compatible, no duplicates; applying it to the live database still blocked: migration tool unavailable and connected database lacks the project's tables).
- [x] Add `getBackgroundUrl` to src/lib/profiles.ts so stored background values resolve to a displayable link (object paths get a short-lived signed URL, existing URLs pass through).
- [ ] Save background object paths instead of signed URLs (Step 2; blocked: waiting for approval to change how backgrounds are saved).
- [ ] Migrate existing stored signed URLs to object paths (Step 3; blocked: no migration approved yet).
