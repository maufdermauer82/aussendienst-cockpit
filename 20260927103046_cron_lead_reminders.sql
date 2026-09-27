-- Hinweis: Projekt-URL anpassen, falls das Schema in ein anderes Supabase-Projekt eingespielt wird.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.invoke_lead_reminders() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://mjrqviuybuhqlrgylyxm.supabase.co/functions/v1/lead-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select value from private.settings where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;
revoke execute on function private.invoke_lead_reminders() from public, authenticated, anon;

select cron.schedule('lead-reminders', '*/5 * * * *', $$select private.invoke_lead_reminders();$$);
