-- ============================================================
-- Project Brief Doc automation
-- Server-side port of the legacy Google Apps Script that created a
-- "Project Brief" Google Doc per tracker row. On project insert,
-- asynchronously calls the `project-brief-doc` edge function (via
-- pg_net), which copies the Drive template and writes the link back
-- onto projects.details_url.
--
-- Dormant until app_private.settings.brief_doc_function_url is set, so
-- this migration is safe to apply before the edge function is live.
-- ============================================================

create extension if not exists pg_net;

-- Track automation state so we can observe failures and avoid re-firing.
alter table public.projects
  add column if not exists brief_doc_status text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_brief_doc_status_check'
  ) then
    alter table public.projects
      add constraint projects_brief_doc_status_check
      check (brief_doc_status is null or brief_doc_status in ('pending', 'created', 'error', 'skipped'));
  end if;
end $$;

-- Trigger -> function plumbing. The Google credentials live in the edge
-- function's secrets; only the callback URL + shared secret live here.
insert into app_private.settings (key, value)
select 'brief_doc_secret', gen_random_uuid()::text
where not exists (select 1 from app_private.settings where key = 'brief_doc_secret');

insert into app_private.settings (key, value)
select 'brief_doc_function_url', ''
where not exists (select 1 from app_private.settings where key = 'brief_doc_function_url');

create or replace function app_private.enqueue_brief_doc()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  -- Allow bulk imports (e.g. tracker refresh) to opt out:
  --   set local lsp.skip_brief_automation = 'on';
  if coalesce(current_setting('lsp.skip_brief_automation', true), '') = 'on' then
    return new;
  end if;

  -- Mirror the legacy "only if Column D is empty" idempotency guard.
  if new.details_url is not null and btrim(new.details_url) <> '' then
    return new;
  end if;

  -- Already processed (defensive; this is an insert-only trigger).
  if new.brief_doc_status is not null then
    return new;
  end if;

  select value into v_url from app_private.settings where key = 'brief_doc_function_url';
  select value into v_secret from app_private.settings where key = 'brief_doc_secret';

  -- Stay dormant until the callback URL is configured.
  if v_url is null or btrim(v_url) = '' then
    return new;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-brief-doc-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('project_id', new.id)
  );

  return new;
end;
$$;

revoke all on function app_private.enqueue_brief_doc() from public;
revoke all on function app_private.enqueue_brief_doc() from anon;
revoke all on function app_private.enqueue_brief_doc() from authenticated;

drop trigger if exists enqueue_brief_doc_on_insert on public.projects;
create trigger enqueue_brief_doc_on_insert
after insert on public.projects
for each row execute function app_private.enqueue_brief_doc();
