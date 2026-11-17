-- giving_can_manage() is the reconcile button's permission check for signed-in
-- dashboard users. Supabase's default privileges granted anon EXECUTE on it
-- directly (revoke from public does not cover that), so revoke it explicitly.
revoke execute on function public.giving_can_manage() from anon;
