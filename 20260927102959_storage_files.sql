insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 20971520, array['image/jpeg','image/png','image/gif','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Ordner im Bucket "files":
--   app/        allgemeine Dateien (Briefings, Reportfotos) – alle aktiven Nutzer
--   employees/  Mitarbeiterfotos – alle aktiven Nutzer
--   contracts/  Vertragsunterlagen – Admins und der hochladende Mitarbeiter
--   hr/         Lohnabrechnungen – nur Admins
create or replace function private.can_read_file(p_name text, p_owner text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare folder text := split_part(p_name, '/', 1);
begin
  if not private.is_active() then return false; end if;
  if private.is_admin() then return true; end if;
  if folder in ('app', 'employees') then return true; end if;
  if folder = 'contracts' then return p_owner = auth.uid()::text; end if;
  return false;
end $$;
create or replace function private.can_upload_file(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare folder text := split_part(p_name, '/', 1);
begin
  if not private.is_active() then return false; end if;
  if folder = 'hr' then return private.is_admin(); end if;
  return folder in ('app', 'employees', 'contracts');
end $$;
grant execute on function private.can_read_file(text, text) to authenticated;
grant execute on function private.can_upload_file(text) to authenticated;

create policy files_select on storage.objects for select to authenticated
  using (bucket_id = 'files' and private.can_read_file(name, owner_id));
create policy files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and private.can_upload_file(name));
create policy files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (private.is_admin() or owner_id = auth.uid()::text));
