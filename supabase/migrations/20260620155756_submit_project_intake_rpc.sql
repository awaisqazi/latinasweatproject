-- Private shared secret the Google Apps Script must present. Stored in
-- app_private (not reachable via the API), readable only by SECURITY DEFINER.
insert into app_private.settings (key, value)
select 'intake_secret', gen_random_uuid()::text
where not exists (select 1 from app_private.settings where key = 'intake_secret');

-- Ingest endpoint for Google Form submissions. Creates an unreviewed
-- google_form project that lands in the admin Intake Queue for review.
create or replace function public.submit_project_intake(
  p_secret text,
  p_title text,
  p_respondent_email text default null,
  p_contact_name text default null,
  p_urgency integer default null,
  p_payload jsonb default '{}'::jsonb,
  p_submitted_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $$
declare
  v_secret text;
  v_id uuid;
begin
  select value into v_secret from app_private.settings where key = 'intake_secret';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'Invalid intake secret.' using errcode = '42501';
  end if;

  if coalesce(btrim(p_title), '') = '' then
    raise exception 'Intake submission requires a title.';
  end if;

  insert into public.projects (
    title, status, source, intake_reviewed, intake_submitted_at,
    intake_respondent_email, intake_contact_name, intake_urgency, intake_payload
  ) values (
    btrim(p_title), 'Ready for Production', 'google_form', false,
    coalesce(p_submitted_at, now()),
    nullif(btrim(coalesce(p_respondent_email, '')), ''),
    nullif(btrim(coalesce(p_contact_name, '')), ''),
    case when p_urgency between 1 and 5 then p_urgency else null end,
    coalesce(p_payload, '{}'::jsonb)
  ) returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.submit_project_intake(text, text, text, text, integer, jsonb, timestamptz) from public;
grant execute on function public.submit_project_intake(text, text, text, text, integer, jsonb, timestamptz) to anon, authenticated;
