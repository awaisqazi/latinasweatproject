-- Import runs record their inserted/skipped counts after the rows land, but
-- fundraising_imports shipped without an update policy, so the counts write
-- matched zero rows and import history showed "+0 new / 0 skipped" forever.
-- Allow module members to update the two count columns.
--
-- Also trim table privileges down to what the UI actually uses: Supabase's
-- default grants gave authenticated full access (update, truncate, etc.),
-- while the module's RLS was written assuming the narrower explicit grants.

create policy "Fundraising module can update import counts"
on public.fundraising_imports for update to authenticated
using ((select app_private.has_module('fundraising')))
with check ((select app_private.has_module('fundraising')));

revoke all on table public.fundraising_imports from authenticated;
grant select, insert on table public.fundraising_imports to authenticated;
grant update (inserted_rows, skipped_rows) on table public.fundraising_imports to authenticated;

revoke all on table public.fundraising_donations from authenticated;
grant select, insert, delete on table public.fundraising_donations to authenticated;

revoke all on table public.fundraising_prospects from authenticated;
grant select, insert, update, delete on table public.fundraising_prospects to authenticated;

revoke all on table public.fundraising_interactions from authenticated;
grant select, insert, delete on table public.fundraising_interactions to authenticated;

notify pgrst, 'reload schema';
