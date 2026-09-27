drop extension if exists pg_net;
create extension pg_net schema extensions;
comment on table public.lead_reminders is 'Nur für die Edge Function (service_role). Bewusst ohne RLS-Policies = kein Zugriff für App-Nutzer.';
