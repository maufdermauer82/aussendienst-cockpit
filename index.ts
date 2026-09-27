// Erinnerungs-Mails für Rückrufe. Wird alle 5 Minuten per pg_cron aufgerufen.
// Eigene Authentifizierung über den Header x-cron-secret (Wert liegt in private.settings).
// Versand: RESEND_API_KEY (empfohlen) oder SMTP über Port 465 (SMTP_HOST, SMTP_USER, SMTP_PASS).
// Absender: MAIL_FROM, z. B. "Außendienst-Cockpit <noreply@mauerwerk-group.de>". Optional APP_URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import nodemailer from "npm:nodemailer@6.9.15";

const env = (k: string) => (Deno.env.get(k) || "").trim();
const text = (body: string, status = 200) => new Response(body + "\n", { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

async function send(to: string, subject: string, body: string) {
  const from = env("MAIL_FROM");
  if (!from) throw new Error("MAIL_FROM fehlt");
  if (env("RESEND_API_KEY")) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
    return;
  }
  if (!env("SMTP_HOST")) throw new Error("Kein Mailversand konfiguriert (RESEND_API_KEY oder SMTP_HOST)");
  const port = Number(env("SMTP_PORT") || "465");
  const t = nodemailer.createTransport({
    host: env("SMTP_HOST"), port, secure: port === 465,
    auth: env("SMTP_USER") ? { user: env("SMTP_USER"), pass: env("SMTP_PASS") } : undefined,
  });
  await t.sendMail({ from, to, subject, text: body, headers: { "Auto-Submitted": "auto-generated" } });
}

Deno.serve(async (req) => {
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  const secret = req.headers.get("x-cron-secret") || "";
  const { data: ok } = await sb.rpc("check_cron_secret", { p_secret: secret });
  if (!ok) return text("forbidden", 403);

  const { data: due, error } = await sb.rpc("due_lead_reminders");
  if (error) return text("Fehler: " + error.message, 500);

  let sent = 0, skipped = 0, failed = 0;
  const appUrl = env("APP_URL") || "https://app.mauerwerk-group.de";
  for (const r of due || []) {
    const l = r.lead || {}, e = r.employee || {};
    const to = String(r.recipient || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      await sb.rpc("mark_lead_reminder", { p_lead_id: r.lead_id, p_call_at: r.call_at, p_recipient: "", p_status: "keine Adresse" });
      skipped++; continue;
    }
    const d = new Date(r.call_ts);
    const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
    const day = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
    const name = `${l.firstName || ""} ${l.lastName || ""}`.trim();
    const addr = [`${l.street || ""} ${l.houseNumber || ""}`.trim(), `${l.zip || ""} ${l.city || ""}`.trim()].filter(Boolean).join(", ");
    const lines = [
      `Hallo ${e.firstName || ""},`.replace(" ,", ","), "",
      `Erinnerung: Rückruf um ${time} Uhr (${day}).`, "",
      `Kunde:       ${name}`,
      `Telefon:     ${l.phone || ""}`,
      `E-Mail:      ${l.email || ""}`,
      `Termingrund: ${l.reason || ""}`,
      ...(addr ? [`Adresse:     ${addr}`] : []),
      ...(l.note ? ["", `Notiz: ${l.note}`] : []),
      "", `Zur App: ${appUrl}`,
    ];
    try {
      await send(to, `Rückruf ${name} um ${time} Uhr`, lines.join("\n"));
      await sb.rpc("mark_lead_reminder", { p_lead_id: r.lead_id, p_call_at: r.call_at, p_recipient: to, p_status: "gesendet" });
      sent++;
    } catch (err) {
      console.error("[lead-reminders]", to, String(err));
      failed++;
    }
  }
  return text(`gesendet: ${sent}, ohne Adresse: ${skipped}, Fehler: ${failed}`);
});
