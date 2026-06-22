-- Mark auto-brief-eligible projects as 'pending' on insert so the dashboard can
-- show a "generating" state (and then a clickable link) instead of a stale
-- "Generate brief doc" button. The AFTER INSERT enqueue now fires for the rows
-- this BEFORE trigger marks 'pending'.

create or replace function app_private.mark_brief_doc_pending()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $fn$
begin
  -- Bulk imports opt out:  set local lsp.skip_brief_automation = 'on';
  if coalesce(current_setting('lsp.skip_brief_automation', true), '') = 'on' then
    return new;
  end if;
  -- Only auto-generate when no brief link was supplied and nothing is set yet.
  if new.details_url is not null and btrim(new.details_url) <> '' then
    return new;
  end if;
  if new.brief_doc_status is null then
    new.brief_doc_status := 'pending';
  end if;
  return new;
end;
$fn$;

revoke all on function app_private.mark_brief_doc_pending() from public;
revoke all on function app_private.mark_brief_doc_pending() from anon;
revoke all on function app_private.mark_brief_doc_pending() from authenticated;

drop trigger if exists mark_brief_doc_pending_on_insert on public.projects;
create trigger mark_brief_doc_pending_on_insert
before insert on public.projects
for each row execute function app_private.mark_brief_doc_pending();

-- Enqueue the doc job only for rows the BEFORE trigger marked 'pending'.
create or replace function app_private.enqueue_brief_doc()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $fn$
declare
  v_url text;
  v_secret text;
begin
  if new.brief_doc_status is distinct from 'pending' then
    return new;
  end if;

  select value into v_url from app_private.settings where key = 'brief_doc_function_url';
  select value into v_secret from app_private.settings where key = 'brief_doc_secret';

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
$fn$;
