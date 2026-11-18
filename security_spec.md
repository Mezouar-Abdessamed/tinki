# Firestore Security Specification (`security_spec.md`)

## 1. Data Invariants

1. **Zero Public PII**: `accounts/{userId}` holds user email and authentication provider metadata. Neither unauthenticated visitors nor other signed-in users can read (`get` or `list`) or write another user's `accounts/{userId}` document.
2. **Owner-Matched Identity**: Every write to `accounts/{userId}`, `profiles/{profileId}`, `usernames/{username}`, `custom_links/{linkId}`, `social_link_settings/{settingId}`, `media_objects/{mediaId}`, and `media_objects/{mediaId}/chunks/{chunkId}` requires an authenticated user with `request.auth.token.email_verified == true` and strict ownership verification (`request.auth.uid == owner`).
3. **Atomic Username Uniqueness**: Creating or renaming a profile in `profiles/{profileId}` requires an atomic batched write with `usernames/{username}` verified via `existsAfter` / `getAfter` so two users can never steal or overwrite an existing handle.
4. **Verified Badge Protection**: The `verified` boolean on `profiles/{profileId}` cannot be forged (`incoming().verified == (incoming().username == 'abdessamed')`).
5. **Immutable Creator & Timestamps**: `id`, `profile_id` / `owner_id`, and `created_at` are strictly immutable after document creation. `created_at` and `updated_at` must match `request.time`.
6. **Parent Existence & Master Gate**: `custom_links` and `social_link_settings` require an existing parent `profiles/{request.auth.uid}`. `media_objects/{mediaId}/chunks/{chunkId}` uses `get(/databases/$(database)/documents/media_objects/$(mediaId)).data.owner_id == request.auth.uid`.
7. **Self-Analytics Rejection & Private Analytics Reads**: Owners cannot log `profile_events` for their own `profile_id`, and analytics reads (`get`, `list`) are restricted exclusively to the profile owner (`resource.data.profile_id == request.auth.uid`).
8. **Strict Action-Based Updates & Size Limits**: Every update uses `affectedKeys().hasOnly(...)` combined with `isValid[Entity](incoming())`, enforcing regex, type, enum, numeric range, and `.size()` caps on every field and document ID.

## 2. The "Dirty Dozen" Adversarial Payloads

| #   | Target Collection                           | Attack Vector                                                                                    | Expected Result     |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------- |
| 1   | `/accounts/{otherUid}`                      | Unauthenticated or non-owner `get` / `list` to steal PII emails                                  | `PERMISSION_DENIED` |
| 2   | `/profiles/{uid}` (create/update)           | Ghost shadow field (`{ ..., "isAdmin": true }`)                                                  | `PERMISSION_DENIED` |
| 3   | `/profiles/{uid}` (create/update)           | Forging verification badge (`{ ..., "username": "attacker", "verified": true }`)                 | `PERMISSION_DENIED` |
| 4   | `/profiles/{uid}` (create)                  | Creating profile with spoofed owner (`{ "id": "victimUid", ... }`) or spoofed `created_at`       | `PERMISSION_DENIED` |
| 5   | `/profiles/{uid}` (update)                  | Unverified email token (`email_verified: false`) attempting update                               | `PERMISSION_DENIED` |
| 6   | `/profiles/{uid}` (update)                  | Value poisoning (overlong `bio` of 51+ chars or invalid hex color `"red"` or invalid font enum)  | `PERMISSION_DENIED` |
| 7   | `/usernames/{username}` (create)            | Claiming a username pointing `owner_id` to someone else OR creating without atomic profile write | `PERMISSION_DENIED` |
| 8   | `/usernames/{username}` (list)              | Blanket list query attempting to enumerate all handles                                           | `PERMISSION_DENIED` |
| 9   | `/custom_links/{linkId}` (create/update)    | Orphan write pointing `profile_id` to victim's profile or mutating `profile_id`                  | `PERMISSION_DENIED` |
| 10  | `/profile_events/{eventId}` (create)        | Profile owner attempting to inflate own `profile_view` or target non-existent `profile_id`       | `PERMISSION_DENIED` |
| 11  | `/profile_events/{eventId}` (list/get)      | Non-owner signed-in user trying to read another user's visitor analytics / country stats         | `PERMISSION_DENIED` |
| 12  | `/media_objects/{mediaId}/chunks/{chunkId}` | Non-owner creating or deleting binary chunks under another user's `media_objects/{mediaId}`      | `PERMISSION_DENIED` |
