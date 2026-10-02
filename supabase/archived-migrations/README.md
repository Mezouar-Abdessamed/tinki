# Archived migrations (not replayed)

These files were duplicate schema snapshots / duplicate changes. They are kept
for history only and are NOT part of the fresh-database chain in
`supabase/migrations/`. Every statement in them is already present in
`20260923030000_baseline_schema.sql` or in a kept incremental migration:

- 20261001162742_77b250a3-... : byte-identical copy of the baseline (only a trailing newline differs).
- 20261001162758_05506a85-... : repeats `show_qr_button` (kept in 20260924032143).
- 20261001180330_d285aafc-... : baseline + background storage policies (kept in 20260923042359)
  + `qr_margin DEFAULT 4` (kept in 20260923042646) + `show_qr_button` (kept in 20260924032143).

Do not move them back. The live database ledger was not inspected or changed.
