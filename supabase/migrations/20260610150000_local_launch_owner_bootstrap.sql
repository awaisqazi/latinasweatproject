-- Bootstrap the launch owner for empty local database replays.
--
-- The superuser migration must fail loudly on a populated environment if
-- awais.a.qazi@gmail.com is missing. For a fresh local reset, though, there
-- are no profiles yet, so seed only that empty-database case.

do $$
declare
  launch_owner_id uuid := '00000000-0000-4000-8000-000000000001';
  launch_owner_email text := 'awais.a.qazi@gmail.com';
begin
  if exists (select 1 from public.profiles) then
    return;
  end if;

  insert into auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change,
    email_change_token_current,
    email_change_confirm_status,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    is_sso_user,
    is_anonymous
  )
  values (
    launch_owner_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    launch_owner_email,
    crypt('password', gen_salt('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    0,
    '',
    jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', 'admin'),
    jsonb_build_object('full_name', 'Awais Qazi'),
    false,
    now(),
    now(),
    false,
    false
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    launch_owner_email,
    launch_owner_id,
    jsonb_build_object(
      'sub',
      launch_owner_id::text,
      'email',
      launch_owner_email,
      'email_verified',
      true,
      'phone_verified',
      false
    ),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider_id, provider) do nothing;

  insert into public.profiles (id, full_name, email, role)
  values (launch_owner_id, 'Awais Qazi', launch_owner_email, 'admin')
  on conflict (id) do update
    set full_name = excluded.full_name,
        email = excluded.email,
        role = excluded.role,
        updated_at = now();
end $$;
