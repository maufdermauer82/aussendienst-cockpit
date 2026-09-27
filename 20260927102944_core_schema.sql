-- =========================================================
-- Außendienst-Cockpit: Kernschema
-- =========================================================
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ---------- Tabellen ----------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default '',
  role text not null default 'staff' check (role in ('admin','staff')),
  employee_id text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
create unique index profiles_employee_unique on public.profiles(employee_id) where employee_id is not null;

create table public.docs (
  col text not null check (col ~ '^[A-Za-z0-9_.~:@+-]{1,150}(/[A-Za-z0-9_.~:@+-]{1,150})*$'),
  id text not null check (id ~ '^[A-Za-z0-9_.~:@+-]{1,150}$'),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (col, id)
);
create index docs_col_updated on public.docs(col, updated_at desc);

create table public.app_config (
  key text primary key,
  value jsonb not null
);
insert into public.app_config(key, value) values
  ('staff_write', '["streets","leads","contracts","reports"]'::jsonb),
  ('reminder_minutes', '10'::jsonb);

create table public.lead_reminders (
  lead_id text not null,
  call_at text not null,
  sent_at timestamptz not null default now(),
  recipient text not null default '',
  status text not null default '',
  primary key (lead_id, call_at)
);

create table private.settings (
  key text primary key,
  value text not null
);
insert into private.settings(key, value) values ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

-- ---------- Hilfsfunktionen für Zugriffsregeln ----------
create or replace function private.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active);
$$;
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.user_id = auth.uid() and p.active and p.role = 'admin');
$$;
create or replace function private.my_emp() returns text
language sql stable security definer set search_path = '' as $$
  select p.employee_id from public.profiles p where p.user_id = auth.uid() and p.active;
$$;
create or replace function private.staff_can_write(p_col text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.app_config c, jsonb_array_elements_text(c.value) v
    where c.key = 'staff_write' and v = split_part(p_col, '/', 1)
  );
$$;

create or replace function private.can_read_doc(p_col text, p_id text, p_data jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare emp text;
begin
  if not private.is_active() then return false; end if;
  if private.is_admin() then return true; end if;
  emp := private.my_emp();
  if p_col = 'data' or p_col like 'data/%' then
    return p_col = 'data/hr/employee-private' and emp is not null and p_id = emp;
  end if;
  if p_col = 'contracts' then
    return emp is not null and (p_data->>'advisorId' = emp or p_data->>'createdBy' = emp);
  end if;
  return true;
end $$;

create or replace function private.can_write_doc(p_col text, p_id text, p_data jsonb) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare emp text;
begin
  if not private.is_active() then return false; end if;
  if private.is_admin() then return true; end if;
  emp := private.my_emp();
  if emp is null then return false; end if;
  if p_col = 'data' or p_col like 'data/%' then
    return p_col = 'data/hr/employee-private' and p_id = emp;
  end if;
  if p_col = 'employees' then return p_id = emp; end if;
  if not private.staff_can_write(p_col) then return false; end if;
  if p_col = 'contracts' then return p_data->>'createdBy' = emp or p_data->>'advisorId' = emp; end if;
  if p_col = 'reports' then return p_data->>'employeeId' = emp; end if;
  return true;
end $$;

grant execute on all functions in schema private to authenticated, service_role;

create or replace function private.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((
        select jsonb_object_agg(k,
          case
            when jsonb_typeof(a->k) = 'object' and jsonb_typeof(b->k) = 'object' then private.jsonb_deep_merge(a->k, b->k)
            when b ? k then b->k
            else a->k
          end)
        from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) s
      ), '{}'::jsonb)
    else b end;
$$;
grant execute on function private.jsonb_deep_merge(jsonb, jsonb) to authenticated, service_role;

-- ---------- Trigger: Stempel, Vertragseigentum, eigene Stammdaten ----------
create or replace function private.docs_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare emp text;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if auth.uid() is not null and not private.is_admin() then
    emp := private.my_emp();
    if new.col = 'contracts' then
      new.data := jsonb_set(new.data, '{createdBy}',
        to_jsonb(coalesce(case when tg_op = 'UPDATE' then old.data->>'createdBy' end, emp)));
      if coalesce(new.data->>'advisorId','') <> coalesce(emp,'') and coalesce(new.data->>'createdBy','') <> coalesce(emp,'') then
        new.data := jsonb_set(new.data, '{createdBy}', to_jsonb(emp));
      end if;
    elsif new.col = 'employees' and tg_op = 'UPDATE' then
      new.data := jsonb_set(new.data, '{active}', coalesce(old.data->'active', 'true'::jsonb));
    end if;
  end if;
  return new;
end $$;
create trigger docs_before_write before insert or update on public.docs
  for each row execute function private.docs_before_write();

-- ---------- RLS: docs ----------
alter table public.docs enable row level security;
create policy docs_select on public.docs for select to authenticated
  using (private.can_read_doc(col, id, data));
create policy docs_insert on public.docs for insert to authenticated
  with check (private.can_write_doc(col, id, data));
create policy docs_update on public.docs for update to authenticated
  using (private.can_read_doc(col, id, data) and private.can_write_doc(col, id, data))
  with check (private.can_write_doc(col, id, data));
create policy docs_delete on public.docs for delete to authenticated
  using (private.can_read_doc(col, id, data) and private.can_write_doc(col, id, data));
revoke all on public.docs from anon;

-- ---------- RLS: profiles ----------
alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.profiles from anon;

create or replace function private.profiles_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.user_id = auth.uid() and old.role = 'admin' and (new.role <> 'admin' or not new.active) then
    raise exception 'Du kannst dir selbst nicht die Admin-Rechte entziehen.' using errcode = '42501';
  end if;
  new.email := old.email;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function private.profiles_guard();

-- Neues Auth-Konto -> Profil. Das allererste Konto wird automatisch aktiver Admin.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare first boolean;
begin
  select not exists (select 1 from public.profiles) into first;
  insert into public.profiles (user_id, email, name, role, active)
  values (new.id, lower(new.email), coalesce(nullif(new.raw_user_meta_data->>'name',''), new.email),
          case when first then 'admin' else 'staff' end, first)
  on conflict (user_id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------- RLS: app_config, lead_reminders ----------
alter table public.app_config enable row level security;
create policy app_config_select on public.app_config for select to authenticated using ((select private.is_active()));
create policy app_config_update on public.app_config for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
revoke all on public.app_config from anon;

alter table public.lead_reminders enable row level security;
revoke all on public.lead_reminders from anon, authenticated;

-- ---------- RPCs für die App ----------
create or replace function public.needs_setup() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles);
$$;
grant execute on function public.needs_setup() to anon, authenticated;

create or replace function public.get_my_profile() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.profiles; r jsonb;
begin
  select * into p from public.profiles where user_id = auth.uid();
  if not found then return null; end if;
  if p.active then update public.profiles set last_login = now() where user_id = p.user_id; end if;
  select jsonb_build_object(
    'id', p.user_id, 'email', p.email, 'name', p.name, 'role', p.role, 'employeeId', p.employee_id, 'active', p.active,
    'staffWrite', coalesce((select value from public.app_config where key = 'staff_write'), '[]'::jsonb),
    'reminderMinutes', coalesce((select (value #>> '{}')::int from public.app_config where key = 'reminder_minutes'), 10),
    'version', '2.0.0') into r;
  return r;
end $$;
revoke execute on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

-- Tiefes Zusammenführen (z. B. eine Hausnummer in einer Straße), atomar und unter RLS
create or replace function public.doc_merge(p_col text, p_id text, p_patch jsonb, p_create boolean default false) returns void
language plpgsql security invoker set search_path = '' as $$
declare cur jsonb;
begin
  select d.data into cur from public.docs d where d.col = p_col and d.id = p_id for update;
  if not found then
    if not p_create then raise exception 'Datensatz existiert nicht mehr.' using errcode = 'P0002'; end if;
    insert into public.docs (col, id, data) values (p_col, p_id, private.jsonb_deep_merge('{}'::jsonb, p_patch))
    on conflict (col, id) do update set data = private.jsonb_deep_merge(public.docs.data, excluded.data);
  else
    update public.docs set data = private.jsonb_deep_merge(cur, p_patch) where col = p_col and id = p_id;
  end if;
end $$;
revoke execute on function public.doc_merge(text, text, jsonb, boolean) from public, anon;
grant execute on function public.doc_merge(text, text, jsonb, boolean) to authenticated;

-- ---------- Erinnerungen (nur für die Edge Function / service_role) ----------
create or replace function private.try_berlin_ts(s text) returns timestamptz
language plpgsql immutable set search_path = '' as $$
begin
  if s is null or s !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then return null; end if;
  return (substring(s from 1 for 16)::timestamp) at time zone 'Europe/Berlin';
exception when others then return null;
end $$;

create or replace function public.due_lead_reminders() returns table (lead_id text, call_at text, call_ts timestamptz, recipient text, lead jsonb, employee jsonb)
language sql stable security definer set search_path = '' as $$
  with m as (select coalesce((select (value #>> '{}')::int from public.app_config where key = 'reminder_minutes'), 10) as mins)
  select l.id, l.data->>'callAt', private.try_berlin_ts(l.data->>'callAt'),
         coalesce(nullif(trim(l.data->>'reminderEmail'), ''), e.data->>'email', ''), l.data, e.data
  from public.docs l
  left join public.docs e on e.col = 'employees' and e.id = l.data->>'assignedTo'
  cross join m
  where l.col = 'leads'
    and coalesce(l.data->>'status', '') <> 'done'
    and private.try_berlin_ts(l.data->>'callAt') between now() - interval '6 hours' and now() + make_interval(mins => m.mins)
    and not exists (select 1 from public.lead_reminders r where r.lead_id = l.id and r.call_at = l.data->>'callAt');
$$;
create or replace function public.mark_lead_reminder(p_lead_id text, p_call_at text, p_recipient text, p_status text) returns void
language sql security definer set search_path = '' as $$
  insert into public.lead_reminders (lead_id, call_at, recipient, status) values (p_lead_id, p_call_at, p_recipient, p_status)
  on conflict do nothing;
  delete from public.lead_reminders where sent_at < now() - interval '180 days';
$$;
create or replace function public.check_cron_secret(p_secret text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.settings where key = 'cron_secret' and value = p_secret);
$$;
revoke execute on function public.due_lead_reminders() from public, anon, authenticated;
revoke execute on function public.mark_lead_reminder(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.check_cron_secret(text) from public, anon, authenticated;
grant execute on function public.due_lead_reminders() to service_role;
grant execute on function public.mark_lead_reminder(text, text, text, text) to service_role;
grant execute on function public.check_cron_secret(text) to service_role;

-- ---------- Realtime ----------
alter publication supabase_realtime add table public.docs;
