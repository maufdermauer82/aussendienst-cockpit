"use strict";

// ================= D2D Straßen-Tracker =================
function D2DView() {
  const { streets } = useApp();
  const [mode, setMode] = useState("capture");
  const entries = useMemo(() => {
    const out = [];
    streets.forEach((s) => Object.entries(s.entries || {}).forEach(([hk, e]) => {
      if (e && STATUS[e.status]) out.push({ ...e, hk, streetId: s.id, street: s.name });
    }));
    return out;
  }, [streets]);
  return html`<div className="stack">
    <${PageHead} title="Straßen-Tracker" sub="Haustür-Akquise nach Straße und Hausnummer" />
    <${Seg} opts=${[["capture", "Erfassen"], ["overview", "Übersicht"]]} value=${mode} onChange=${setMode} />
    ${mode === "capture" ? html`<${Capture} entries=${entries} />` : html`<${D2DOverview} entries=${entries} />`}
  </div>`;
}

function Capture({ entries }) {
  const { me, saveHouse, open } = useApp();
  const [street, setStreet] = useState("");
  const [hn, setHn] = useState("");
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const hnRef = useRef(null);
  const streetNames = useMemo(() => Array.from(new Set(entries.map((e) => e.street))).sort((a, b) => a.localeCompare(b, "de")), [entries]);
  const existing = useMemo(() => {
    if (!street.trim() || !hn.trim()) return null;
    const sid = slug(street), hk = slug(hn);
    return entries.find((e) => e.streetId === sid && e.hk === hk) || null;
  }, [entries, street, hn]);
  const canSave = !!me && street.trim() && hn.trim();
  async function handle(status) {
    if (!canSave) return;
    const ok = await saveHouse(street.trim(), hn.trim(), status, note.trim());
    if (ok) { setHn(""); setNote(""); setShowNote(false); requestAnimationFrame(() => hnRef.current && hnRef.current.focus()); }
  }
  const recent = useMemo(() => me ? entries.filter((e) => e.employeeId === me.id).sort((a, b) => b.timestamp - a.timestamp).slice(0, 6) : [], [entries, me]);
  return html`<div className="stack">
    ${!me ? html`<${MePrompt} />` : null}
    <div className="card p-4 stack-sm">
      <${Field} label="Straße"><input className="inp" list="street-options" value=${street} onChange=${(e) => setStreet(e.target.value)} placeholder="z. B. Musterstraße" autoCapitalize="words" /><//>
      <datalist id="street-options">${streetNames.map((s) => html`<option key=${s} value=${s} />`)}</datalist>
      <${Field} label="Hausnummer"><input ref=${hnRef} className="inp" value=${hn} onChange=${(e) => setHn(e.target.value)} placeholder="z. B. 12a" /><//>
      ${existing ? html`<p className="text-sm" style=${{ color: STATUS[existing.status].color }}>
        Bereits erfasst: <b>${STATUS[existing.status].label}</b> · ${existing.employeeName || "?"}, ${fmtTS(existing.timestamp)}</p>` : null}
      ${showNote ? html`<${Field} label="Notiz (optional)"><input className="inp" value=${note} onChange=${(e) => setNote(e.target.value)} placeholder="z. B. Termin nächste Woche" /><//>`
        : html`<button type="button" className="btn btn-sm" style=${{ border: 0, paddingLeft: 0, color: "var(--muted)" }} onClick=${() => setShowNote(true)}><${Icon} n="pencil" s=${13} />Notiz hinzufügen</button>`}
    </div>
    <div>
      <p className="lbl px-1">Ergebnis auswählen</p>
      <div className="grid grid-cols-3 gap-2">
        ${Object.entries(STATUS).map(([k, v]) => html`<button key=${k} className="statbtn" style=${{ background: v.color }} disabled=${!canSave} onClick=${() => handle(k)}>
          <${Icon} n=${v.icon} s=${22} w=${2.5} />${v.short}</button>`)}
      </div>
      <button className="btn w-full mt-2" disabled=${!canSave} onClick=${() => open("lead", { initial: { street: street.trim(), houseNumber: hn.trim() } })}>
        <${Icon} n="lead" s=${17} />Kunde als Lead anlegen</button>
    </div>
    ${recent.length ? html`<div>
      <p className="lbl px-1">Deine letzten Einträge</p>
      <div className="stack-sm">${recent.map((e) => html`<button key=${e.streetId + e.hk} className="listbtn flex justify-between items-center" onClick=${() => open("entry", { streetId: e.streetId, hk: e.hk })}>
        <span className="font-medium">${e.street} ${e.houseNumber}</span>
        <span className="text-sm font-semibold" style=${{ color: STATUS[e.status].color }}>${STATUS[e.status].short}</span></button>`)}</div>
    </div>` : null}
  </div>`;
}

function D2DOverview({ entries }) {
  const { employees, empById, open, rt, toast } = useApp();
  const [empF, setEmpF] = useState("all");
  const [stF, setStF] = useState("all");
  const [q, setQ] = useState("");
  const filtered = entries.filter((e) => (empF === "all" || e.employeeId === empF) && (stF === "all" || e.status === stF) && (!q.trim() || lc(e.street).includes(lc(q.trim()))));
  const byStreet = {};
  filtered.forEach((e) => { (byStreet[e.streetId] = byStreet[e.streetId] || { name: e.street, list: [] }).list.push(e); });
  const streetIds = Object.keys(byStreet).sort((a, b) => byStreet[a].name.localeCompare(byStreet[b].name, "de"));
  const cnt = (arr, s) => arr.filter((e) => e.status === s).length;
  const perEmp = employees.map((emp) => { const own = entries.filter((e) => e.employeeId === emp.id); return { emp, total: own.length, s: cnt(own, "success"), n: cnt(own, "not_home"), r: cnt(own, "rejected") }; });
  async function exportIt() {
    const rows = [["Straße", "Hausnummer", "Status", "Mitarbeiter", "Datum", "Notiz"]];
    [...entries].sort((a, b) => a.street.localeCompare(b.street, "de") || compareHN(a.houseNumber, b.houseNumber))
      .forEach((e) => rows.push([e.street, e.houseNumber, STATUS[e.status].label, empById[e.employeeId] ? fullName(empById[e.employeeId]) : e.employeeName, fmtTS(e.timestamp), e.note || ""]));
    const ok = await saveFile(rt, `strassen-tracker-${todayISO()}.csv`, toCSV(rows), "text/csv");
    if (ok) toast("Export gespeichert");
  }
  return html`<div className="stack">
    <div className="grid grid-cols-4 gap-2">
      ${[["Gesamt", filtered.length, "var(--ink)"], ["Abschluss", cnt(filtered, "success"), "var(--ok)"], ["Nicht da", cnt(filtered, "not_home"), "var(--nh)"], ["Ablehnung", cnt(filtered, "rejected"), "var(--no)"]].map(([l, v, c]) => html`<div key=${l} className="card p-3">
        <div className="cond text-2xl font-bold" style=${{ color: c }}>${v}</div><div className="text-xs muted">${l}</div></div>`)}
    </div>
    <div className="card p-3 stack-sm">
      <${SearchBox} value=${q} onChange=${setQ} placeholder="Straße suchen" />
      <div className="flex gap-2 flex-wrap">
        <select className="inp" style=${{ width: "auto", minHeight: 38, fontSize: 14 }} value=${empF} onChange=${(e) => setEmpF(e.target.value)} aria-label="Mitarbeiter filtern">
          <option value="all">Alle Mitarbeiter</option>${employees.map((e) => html`<option key=${e.id} value=${e.id}>${fullName(e)}</option>`)}</select>
        <select className="inp" style=${{ width: "auto", minHeight: 38, fontSize: 14 }} value=${stF} onChange=${(e) => setStF(e.target.value)} aria-label="Ergebnis filtern">
          <option value="all">Alle Ergebnisse</option>${Object.entries(STATUS).map(([k, v]) => html`<option key=${k} value=${k}>${v.label}</option>`)}</select>
        <button className="btn btn-sm" onClick=${exportIt}><${Icon} n="download" s=${14} />CSV</button>
      </div>
    </div>
    ${streetIds.length === 0 ? html`<${Empty} icon="pin" title=${entries.length ? "Keine Einträge für diese Filter" : "Noch keine Einträge"}>${entries.length ? "Filter zurücksetzen, um alle Straßen zu sehen." : "Erfasse die erste Hausnummer unter „Erfassen“."}<//>`
      : streetIds.map((sid) => { const { name, list } = byStreet[sid]; const sorted = [...list].sort((a, b) => compareHN(a.houseNumber, b.houseNumber));
        return html`<div key=${sid} className="card p-4">
          <div className="flex items-center justify-between gap-2 mb-3"><span className="plate"><span>${name}</span></span><span className="text-xs muted shrink-0">${sorted.length} Hausnr.</span></div>
          <div className="flex flex-wrap gap-2 mb-3">${sorted.map((e) => { const emp = empById[e.employeeId];
            return html`<button key=${e.hk} className="hn" style=${{ background: STATUS[e.status].color }} onClick=${() => open("entry", { streetId: sid, hk: e.hk })} aria-label=${`${name} ${e.houseNumber}: ${STATUS[e.status].label}`}>
              ${e.houseNumber}<span className="who" style=${{ background: emp ? hashColor(emp.id) : "var(--muted)" }}>${initials(emp ? fullName(emp) : e.employeeName)}</span></button>`; })}</div>
          <div className="flex flex-wrap gap-x-3 text-xs font-semibold">
            <span style=${{ color: "var(--ok)" }}>${cnt(list, "success")} Abschluss</span><span style=${{ color: "var(--nh)" }}>${cnt(list, "not_home")} nicht da</span><span style=${{ color: "var(--no)" }}>${cnt(list, "rejected")} Ablehnung</span></div>
        </div>`; })}
    <div className="card p-4">
      <p className="font-bold mb-2">Team-Übersicht</p>
      <div className="scrollx"><table className="tbl"><thead><tr><th>Mitarbeiter</th><th style=${{ textAlign: "right" }}>Abschl.</th><th style=${{ textAlign: "right" }}>Nicht da</th><th style=${{ textAlign: "right" }}>Abl.</th><th style=${{ textAlign: "right" }}>Summe</th></tr></thead>
      <tbody>${perEmp.map((p) => html`<tr key=${p.emp.id}><td><span className="row"><${Avatar} emp=${p.emp} size=${22} />${fullName(p.emp)}</span></td>
        <td style=${{ textAlign: "right", color: "var(--ok)", fontWeight: 700 }}>${p.s}</td><td style=${{ textAlign: "right", color: "var(--nh)", fontWeight: 700 }}>${p.n}</td>
        <td style=${{ textAlign: "right", color: "var(--no)", fontWeight: 700 }}>${p.r}</td><td style=${{ textAlign: "right" }} className="muted">${p.total}</td></tr>`)}</tbody></table></div>
    </div>
  </div>`;
}

function EntrySheet({ streetId, hk, onClose }) {
  const { streets, empById, saveHouse, deleteHouse, open, me } = useApp();
  const s = streets.find((x) => x.id === streetId);
  const e = s && s.entries && s.entries[hk];
  if (!s || !e) return html`<${Sheet} title="Eintrag" onClose=${onClose}><p className="muted">Dieser Eintrag wurde gelöscht.</p><//>`;
  const st = STATUS[e.status] || STATUS.not_home;
  const emp = empById[e.employeeId];
  return html`<${Sheet} title=${`${s.name} ${e.houseNumber}`} onClose=${onClose}
    footer=${html`<${DelBtn} onConfirm=${async () => { if (await deleteHouse(streetId, hk)) onClose(); }} /><span className="flex-1"></span>
      <button className="btn" onClick=${() => { onClose(); open("lead", { initial: { street: s.name, houseNumber: e.houseNumber } }); }}><${Icon} n="lead" s=${16} />Lead anlegen</button>`}>
    <div className="stack">
      <div className="row"><span className="pill pill-solid" style=${{ background: st.color }}><${Icon} n=${st.icon} s=${13} w=${2.5} />${st.label}</span>
        <span className="muted text-sm">${fmtTS(e.timestamp)}</span></div>
      <p className="text-sm row"><${Avatar} emp=${emp} size=${22} />Bearbeitet von <b>${emp ? fullName(emp) : e.employeeName}</b></p>
      ${e.note ? html`<div className="note">${e.note}</div>` : null}
      <div><p className="lbl">Status ändern${!me ? " (erst Namen wählen)" : ""}</p>
        <div className="grid grid-cols-3 gap-2">${Object.entries(STATUS).map(([k, v]) => html`<button key=${k} className="btn btn-sm" disabled=${!me || k === e.status}
          style=${k === e.status ? { background: v.color, color: "#fff", borderColor: "transparent", opacity: 1 } : {}} onClick=${() => saveHouse(s.name, e.houseNumber, k, e.note || "")}>${v.short}</button>`)}</div></div>
      ${e.history && e.history.length ? html`<details><summary className="lbl" style=${{ cursor: "pointer" }}>Verlauf (${e.history.length})</summary>
        <ul className="mt-2 stack-sm text-sm">${[...e.history].reverse().map((h, i) => html`<li key=${i} className="flex justify-between gap-2">
          <span>${(STATUS[h.status] || {}).label || h.status} · ${empById[h.employeeId] ? fullName(empById[h.employeeId]) : h.employeeName}</span><span className="muted shrink-0">${fmtTS(h.timestamp)}</span></li>`)}</ul></details>` : null}
    </div><//>`;
}

// ================= Leads =================
function icsFor(lead, emp) {
  const start = new Date(lead.callAt), end = new Date(start.getTime() + 15 * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
  const who = `${lead.firstName} ${lead.lastName}`.trim();
  const desc = [`Grund: ${lead.reason}`, `Tel.: ${lead.phone}`, lead.email ? `E-Mail: ${lead.email}` : "", lead.street ? `Adresse: ${lead.street} ${lead.houseNumber || ""}, ${lead.zip || ""} ${lead.city || ""}` : "", lead.note ? `Notiz: ${lead.note}` : ""].filter(Boolean).join("\n");
  const mail = lead.reminderEmail || (emp && emp.email) || "";
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Aussendienst-Cockpit//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:lead-${lead.id}@aussendienst-cockpit`, `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${esc("Rückruf: " + who + " (" + lead.reason + ")")}`, `DESCRIPTION:${esc(desc)}`,
    ...(mail ? [`ATTENDEE;CN=${esc(emp ? fullName(emp) : mail)}:mailto:${mail}`] : []),
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT10M", `DESCRIPTION:${esc("Rückruf " + who)}`, "END:VALARM",
    ...(mail ? ["BEGIN:VALARM", "ACTION:EMAIL", "TRIGGER:-PT10M", `SUMMARY:${esc("Erinnerung: Rückruf " + who)}`, `DESCRIPTION:${esc(desc)}`, `ATTENDEE:mailto:${mail}`, "END:VALARM"] : []),
    "END:VEVENT", "END:VCALENDAR"];
  return L.join("\r\n");
}
function gcalUrl(lead) {
  const start = new Date(lead.callAt), end = new Date(start.getTime() + 15 * 60000);
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const p = new URLSearchParams({ action: "TEMPLATE", text: `Rückruf: ${lead.firstName} ${lead.lastName} (${lead.reason})`, dates: `${f(start)}/${f(end)}`,
    details: `Tel.: ${lead.phone}\n${lead.email ? "E-Mail: " + lead.email + "\n" : ""}${lead.note || ""}` });
  return "https://calendar.google.com/calendar/render?" + p.toString();
}
const leadDue = (l, now) => l.status !== "done" && l.callAt && new Date(l.callAt) <= now;

function LeadsView() {
  const { leads, me, open, empById, rt, toast } = useApp();
  const now = useNow(30000);
  const [f, setF] = useState("due");
  const [mine, setMine] = useState(true);
  const [q, setQ] = useState("");
  const base = leads.filter((l) => (!mine || !me || l.assignedTo === me.id) && (!q.trim() || lc(`${l.firstName} ${l.lastName} ${l.phone} ${l.street}`).includes(lc(q.trim()))));
  const counts = { due: base.filter((l) => leadDue(l, now)).length, open: base.filter((l) => l.status !== "done").length, done: base.filter((l) => l.status === "done").length, all: base.length };
  const list = base.filter((l) => f === "all" || (f === "due" ? leadDue(l, now) : f === "open" ? l.status !== "done" : l.status === "done"))
    .sort((a, b) => f === "done" ? (b.doneAt || 0) - (a.doneAt || 0) : String(a.callAt).localeCompare(String(b.callAt)));
  async function exportIt() {
    const rows = [["Vorname", "Nachname", "Telefon", "E-Mail", "Termingrund", "Anrufzeitpunkt", "Straße", "Hausnr.", "PLZ", "Ort", "Zuständig", "Status", "Notiz"]];
    leads.forEach((l) => rows.push([l.firstName, l.lastName, l.phone, l.email, l.reason, fmtCall(l.callAt), l.street, l.houseNumber, l.zip, l.city, fullName(empById[l.assignedTo]), l.status === "done" ? "Erledigt" : "Offen", l.note]));
    if (await saveFile(rt, `leads-${todayISO()}.csv`, toCSV(rows), "text/csv")) toast("Export gespeichert");
  }
  return html`<div className="stack">
    <${PageHead} title="Leads" sub="Rückrufe mit Termingrund und Erinnerung" action=${html`<button className="btn btn-primary" onClick=${() => open("lead", {})}><${Icon} n="plus" s=${16} />Lead</button>`} />
    <${Seg} opts=${[["due", `Fällig (${counts.due})`], ["open", `Offen (${counts.open})`], ["done", `Erledigt (${counts.done})`], ["all", "Alle"]]} value=${f} onChange=${setF} />
    <div className="flex gap-2 items-center flex-wrap">
      <div className="flex-1" style=${{ minWidth: 200 }}><${SearchBox} value=${q} onChange=${setQ} placeholder="Name, Telefon, Straße" /></div>
      ${me ? html`<button className=${"fchip" + (mine ? " on" : "")} onClick=${() => setMine(!mine)}>Nur meine</button>` : null}
      <button className="btn btn-sm" onClick=${exportIt}><${Icon} n="download" s=${14} />CSV</button>
    </div>
    ${list.length === 0 ? html`<${Empty} icon="bell" title=${f === "due" ? "Keine fälligen Rückrufe" : "Keine Leads"}>${f === "due" ? "Sobald ein Anrufzeitpunkt erreicht ist, erscheint der Lead hier." : "Lege einen Lead an, z. B. direkt aus dem Straßen-Tracker."}<//>`
      : html`<div className="stack-sm">${list.map((l) => { const due = leadDue(l, now);
        return html`<div key=${l.id} className="card p-3.5">
          <div className="flex items-start justify-between gap-2">
            <button className="text-left min-w-0" style=${{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0 }} onClick=${() => open("lead", { id: l.id })}>
              <p className="font-bold truncate">${l.firstName} ${l.lastName}</p>
              <p className="text-sm row" style=${{ color: due ? "var(--no)" : "var(--muted)", gap: ".3rem" }}><${Icon} n="clock" s=${14} />${fmtCall(l.callAt)}${due ? " · fällig" : ""}</p></button>
            <span className="pill">${l.reason}</span></div>
          <div className="flex flex-wrap gap-2 mt-2.5">
            ${l.phone ? html`<a className="btn btn-sm" href=${"tel:" + l.phone.replace(/[^\d+]/g, "")}><${Icon} n="phone" s=${14} />${l.phone}</a>` : null}
            ${l.email ? html`<a className="btn btn-sm" href=${"mailto:" + l.email}><${Icon} n="mail" s=${14} />E-Mail</a>` : null}
            ${l.status !== "done" ? html`<${LeadDoneBtn} lead=${l} />` : html`<span className="pill" style=${{ color: "var(--ok)" }}><${Icon} n="check" s=${12} />Erledigt</span>`}
          </div>
          <p className="text-xs muted mt-2">${fullName(empById[l.assignedTo])}${l.street ? ` · ${l.street} ${l.houseNumber || ""}` : ""}</p>
        </div>`; })}</div>`}
    <p className="text-xs muted px-1">Erinnerung: ${rt.user.reminderMinutes} Minuten vor dem Anrufzeitpunkt geht automatisch eine E-Mail an den Zuständigen.</p>
  </div>`;
}
function LeadDoneBtn({ lead }) {
  const { rt, run } = useApp();
  return html`<button className="btn btn-sm" onClick=${() => run(() => rt.store.update("leads/" + lead.id, { status: "done", doneAt: Date.now() }), "Als erledigt markiert")}><${Icon} n="check" s=${14} />Erledigt</button>`;
}

function LeadSheet({ id, initial, onClose }) {
  const { leads, me, employees, empById, rt, run, toast } = useApp();
  const existing = id ? leads.find((l) => l.id === id) : null;
  const def = () => { const d = new Date(Date.now() + 864e5); d.setHours(10, 0, 0, 0); return `${isoDay(d)}T10:00`; };
  const [f, b, set] = useForm(() => existing ? { ...existing } : { firstName: "", lastName: "", phone: "", email: "", reason: "", callAt: def(), street: "", houseNumber: "", zip: "", city: "", note: "", assignedTo: me ? me.id : "", reminderEmail: me ? me.email || "" : "", status: "open", ...(initial || {}) });
  const [tried, setTried] = useState(false);
  const REQ = ["firstName", "lastName", "phone", "reason", "callAt", "assignedTo"];
  const miss = missing(f, REQ);
  const bad = (k) => tried && miss.includes(k);
  async function save() {
    setTried(true);
    if (miss.length) { toast("Bitte alle Pflichtfelder ausfüllen.", "err"); return; }
    const lid = existing ? existing.id : uid();
    const data = { ...f, updatedAt: Date.now(), createdAt: existing ? existing.createdAt || Date.now() : Date.now(), createdBy: existing ? existing.createdBy || "" : (me ? me.id : "") };
    if (await run(() => rt.store.set("leads/" + lid, data), existing ? "Lead gespeichert" : "Lead angelegt")) onClose();
  }
  const emp = empById[f.assignedTo];
  const calReady = f.callAt && f.firstName;
  return html`<${Sheet} title=${existing ? "Lead bearbeiten" : "Neuer Lead"} onClose=${onClose}
    footer=${html`${existing ? html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("leads/" + existing.id), "Lead gelöscht")) onClose(); }} />` : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>${existing ? "Speichern" : "Lead anlegen"}</button>`}>
    <div className="grid2">
      <h3 className="sec span2">Kunde</h3>
      <${Field} label="Vorname" req bad=${bad("firstName")}><input className=${"inp" + (bad("firstName") ? " bad" : "")} ...${b("firstName")} autoComplete="off" /><//>
      <${Field} label="Nachname" req bad=${bad("lastName")}><input className=${"inp" + (bad("lastName") ? " bad" : "")} ...${b("lastName")} autoComplete="off" /><//>
      <${Field} label="Telefon" req bad=${bad("phone")}><input className=${"inp" + (bad("phone") ? " bad" : "")} type="tel" inputMode="tel" ...${b("phone")} /><//>
      <${Field} label="E-Mail"><input className="inp" type="email" inputMode="email" ...${b("email")} /><//>
      <${Field} label="Straße"><input className="inp" ...${b("street")} /><//>
      <${Field} label="Hausnummer"><input className="inp" ...${b("houseNumber")} /><//>
      <${Field} label="PLZ"><input className="inp" inputMode="numeric" ...${b("zip")} /><//>
      <${Field} label="Ort"><input className="inp" ...${b("city")} /><//>
      <h3 className="sec span2">Termin</h3>
      <${Field} label="Termingrund" req div span bad=${bad("reason")}><${Seg} opts=${LEAD_REASONS} value=${f.reason} onChange=${(v) => set("reason", v)} /><//>
      <${Field} label="Anrufzeitpunkt" req bad=${bad("callAt")}><input className="inp" type="datetime-local" ...${b("callAt")} /><//>
      <${Field} label="Zuständig" req bad=${bad("assignedTo")}><${Sel} opts=${employees.map((e) => [e.id, fullName(e)])} value=${f.assignedTo} onChange=${(e) => { const v = e.target.value; set("assignedTo", v); if (empById[v] && empById[v].email) set("reminderEmail", empById[v].email); }} /><//>
      <${Field} label="Erinnerung an E-Mail" span hint=${`An diese Adresse geht ${rt.user.reminderMinutes} Minuten vor dem Termin automatisch eine Erinnerung.`}><input className="inp" type="email" ...${b("reminderEmail")} placeholder=${emp && emp.email ? emp.email : "name@firma.de"} /><//>
      <${Field} label="Notiz" span><textarea className="inp" ...${b("note")} /><//>
      ${existing ? html`<${Field} label="Status" div span><${Seg} opts=${[["open", "Offen"], ["done", "Erledigt"]]} value=${f.status} onChange=${(v) => { set("status", v); if (v === "done") set("doneAt", Date.now()); }} /><//>` : null}
      <div className="span2 card p-3" style=${{ background: "var(--soft)" }}>
        <p className="font-semibold text-sm mb-2 row"><${Icon} n="bell" s=${15} />Zusätzlich im eigenen Kalender eintragen</p>
        <div className="flex flex-wrap gap-2">
          <a className="btn btn-sm" href=${calReady ? gcalUrl(f) : undefined} target="_blank" rel="noopener noreferrer" aria-disabled=${!calReady} style=${calReady ? {} : { opacity: 0.35, pointerEvents: "none" }}><${Icon} n="cal" s=${14} />In Google Kalender</a>
          <button className="btn btn-sm" disabled=${!calReady} onClick=${async () => { if (await saveFile(rt, `rueckruf-${slug(f.lastName || "lead")}.ics`, icsFor({ ...f, id: existing ? existing.id : uid() }, emp), "text/calendar")) toast("Kalenderdatei gespeichert"); }}><${Icon} n="download" s=${14} />.ics für Outlook/Apple</button>
        </div>
        
      </div>
    </div><//>`;
}

// ================= Verträge =================
const CONTRACT_REQ = ["advisorId", "actionType", "orderType", "tariff", "customerType", "bonus", "orderDate", "salutation", "firstName", "lastName", "street", "zip", "city", "phone", "previousSupplier", "previousCustomerNo", "paymentMethod", "regionPlus", "phoneConsent", "emailConsent", "orderFiles"];
function ContractsView() {
  const { contracts, empById, open, rt, toast, partnerById } = useApp();
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const list = contracts.filter((c) => (typeF === "all" || c.orderType === typeF) && (!q.trim() || lc(`${c.firstName} ${c.lastName} ${c.companyName} ${c.city} ${c.tariff}`).includes(lc(q.trim()))))
    .sort((a, b) => String(b.orderDate).localeCompare(String(a.orderDate)) || (b.createdAt || 0) - (a.createdAt || 0));
  async function exportIt() {
    const cols = [["orderDate", "Auftragsdatum"], ["advisor", "Kundenberater"], ["partner", "Projektpartner"], ["actionType", "Aktionsart"], ["orderType", "Auftragsart"], ["tariff", "Tarif"], ["customerType", "Kundenart"], ["bonus", "Kundenbonus"], ["salutation", "Anrede"], ["firstName", "Vorname"], ["lastName", "Nachname"], ["companyName", "Firmenname & Branche"], ["street", "Straße & Hausnummer"], ["zip", "PLZ"], ["city", "Ort"], ["phone", "Telefon"], ["email", "E-Mail"], ["meterNo", "Zählernummer"], ["meterReading", "Zählerstand / Datum"], ["previousSupplier", "Bisheriger Versorger"], ["previousCustomerNo", "Kundennummer bisheriger Versorger"], ["malo", "MaLo"], ["consumptionKwh", "Vorjahresverbrauch kWh"], ["paymentMethod", "Zahlungsart"], ["accountHolder", "Kontoinhaber"], ["iban", "IBAN"], ["bank", "Kreditinstitut"], ["deliveryStreet", "Lieferanschrift Straße"], ["deliveryZip", "Lieferanschrift PLZ"], ["deliveryCity", "Lieferanschrift Ort"], ["regionPlus", "Option REGION PLUS"], ["phoneConsent", "Telefon-Einwilligung"], ["emailConsent", "E-Mail-Einwilligung"], ["customerNotes", "Anmerkungen"], ["files", "Anzahl Dateien"]];
    const rows = [cols.map((c) => c[1])];
    list.forEach((c) => rows.push(cols.map(([k]) => k === "advisor" ? fullName(empById[c.advisorId]) : k === "partner" ? (partnerById[c.partnerId] || {}).name || "" : k === "files" ? (c.orderFiles || []).length + (c.invoiceFiles || []).length : k === "orderDate" ? fmtDayShort(c.orderDate) + "." + String(c.orderDate || "").slice(0, 4) : c[k])));
    if (await saveFile(rt, `vertraege-${todayISO()}.csv`, toCSV(rows), "text/csv")) toast("Export gespeichert");
  }
  return html`<div className="stack">
    <${PageHead} title="Verträge" sub="Auftragserfassung Strom und Gas" action=${html`<button className="btn btn-primary" onClick=${() => open("contract", {})}><${Icon} n="plus" s=${16} />Vertrag</button>`} />
    <div className="flex gap-2 items-center flex-wrap">
      <div className="flex-1" style=${{ minWidth: 200 }}><${SearchBox} value=${q} onChange=${setQ} placeholder="Kunde, Ort, Tarif" /></div>
      ${["all", "Strom", "Gas"].map((t) => html`<button key=${t} className=${"fchip" + (typeF === t ? " on" : "")} onClick=${() => setTypeF(t)}>${t === "all" ? "Alle" : t}</button>`)}
      <button className="btn btn-sm" onClick=${exportIt}><${Icon} n="download" s=${14} />CSV</button>
    </div>
    <p className="text-sm muted">${list.length} Verträge · ${list.filter((c) => c.orderType === "Strom").length} Strom · ${list.filter((c) => c.orderType === "Gas").length} Gas</p>
    ${list.length === 0 ? html`<${Empty} icon="file" title="Noch keine Verträge">Erfasse den ersten Auftrag mit „Vertrag“.<//>`
      : html`<div className="stack-sm">${list.map((c) => html`<button key=${c.id} className="listbtn" onClick=${() => open("contract", { id: c.id })}>
        <div className="flex justify-between gap-2"><span className="font-bold truncate">${c.salutation === "Firma" ? c.companyName || c.lastName : `${c.firstName} ${c.lastName}`}</span>
          <span className="pill pill-solid shrink-0" style=${{ background: c.orderType === "Gas" ? "var(--event)" : "var(--leh)" }}>${c.orderType || "?"}</span></div>
        <p className="text-sm muted">${c.tariff || "–"} · ${fmtDay(c.orderDate)} · ${fullName(empById[c.advisorId])}</p>
        <p className="text-xs muted">${c.zip} ${c.city}${(c.orderFiles || []).length ? ` · ${(c.orderFiles || []).length + (c.invoiceFiles || []).length} Datei(en)` : " · Auftrags-PDF fehlt"}</p>
      </button>`)}</div>`}
  </div>`;
}

function ContractSheet({ id, initial, onClose }) {
  const { contracts, me, employees, partners, deployments, venueById, rt, run, toast } = useApp();
  const existing = id ? contracts.find((c) => c.id === id) : null;
  const [f, b, set] = useForm(() => existing ? { ...existing } : { advisorId: me ? me.id : "", orderDate: todayISO(), regionPlus: "", phoneConsent: "", emailConsent: "", orderFiles: [], invoiceFiles: [], ...(initial || {}) });
  const [tried, setTried] = useState(false);
  const [showIban, setShowIban] = useState(!existing);
  const miss = missing(f, CONTRACT_REQ);
  const bad = (k) => tried && miss.includes(k);
  const cls = (k) => "inp" + (bad(k) ? " bad" : "");
  const I = (k, label, req, extra = {}) => html`<${Field} label=${label} req=${req} bad=${bad(k)} span=${extra.span}><input className=${cls(k)} ...${b(k)} ...${extra.attrs || {}} /><//>`;
  const S = (k, label, opts, req) => html`<${Field} label=${label} req=${req} bad=${bad(k)}><${Sel} className=${cls(k)} opts=${opts} ...${b(k)} /><//>`;
  const YN = (k, label) => html`<${Field} label=${label} req div bad=${bad(k)}><${Seg} opts=${[["JA", "Ja"], ["NEIN", "Nein"]]} value=${f[k]} onChange=${(v) => set(k, v)} /><//>`;
  async function save() {
    setTried(true);
    if (miss.length) { toast(`Bitte Pflichtfelder ausfüllen (${miss.length} offen).`, "err"); return; }
    const cid = existing ? existing.id : uid();
    const data = { ...f, createdAt: existing ? existing.createdAt || Date.now() : Date.now(), updatedAt: Date.now(), createdBy: existing ? existing.createdBy || "" : (me ? me.id : "") };
    if (await run(() => rt.store.set("contracts/" + cid, data), existing ? "Vertrag gespeichert" : "Vertrag erfasst")) onClose();
  }
  const depOpts = deployments.slice().sort((a, b2) => String(b2.startDate).localeCompare(String(a.startDate))).slice(0, 80)
    .map((d) => [d.id, `${fmtDayShort(d.startDate)} ${(venueById[d.venueId] || {}).name || d.title || "Einsatz"}`]);
  return html`<${Sheet} wide title=${existing ? "Vertrag bearbeiten" : "Neuer Vertrag"} onClose=${onClose}
    footer=${html`${existing ? html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("contracts/" + existing.id), "Vertrag gelöscht")) onClose(); }} />` : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>${existing ? "Speichern" : "Vertrag erfassen"}</button>`}>
    <div className="grid2">
      <h3 className="sec span2">Auftrag</h3>
      ${S("advisorId", "Kundenberater", employees.map((e) => [e.id, fullName(e)]), true)}
      ${I("orderDate", "Auftragsdatum", true, { attrs: { type: "date" } })}
      ${S("partnerId", "Projektpartner", partners.map((p) => [p.id, p.name]))}
      ${S("deploymentId", "Einsatz (optional)", depOpts)}
      ${S("actionType", "Aktionsart", C.actionTypes, true)}
      ${S("orderType", "Auftragsart", C.orderTypes, true)}
      ${S("tariff", "Tarif", C.tariffs.filter((t) => !f.orderType || t === "Wärmepumpe" || t.startsWith(f.orderType.toUpperCase())), true)}
      ${S("customerType", "Kundenart", C.customerTypes, true)}
      ${S("bonus", "Kundenbonus", C.bonuses, true)}
      <h3 className="sec span2">Kunde</h3>
      ${S("salutation", "Anrede", C.salutations, true)}
      ${I("companyName", "Firmenname & Branche")}
      ${I("firstName", "Vorname", true)}
      ${I("lastName", "Nachname", true)}
      ${I("street", "Straße & Hausnummer", true, { span: true })}
      ${I("zip", "PLZ", true, { attrs: { inputMode: "numeric" } })}
      ${I("city", "Ort", true)}
      ${I("phone", "Telefonnummer", true, { attrs: { type: "tel", inputMode: "tel" } })}
      ${I("email", "E-Mail", false, { attrs: { type: "email", inputMode: "email" } })}
      <h3 className="sec span2">Zähler & bisheriger Versorger</h3>
      ${I("meterNo", "Zählernummer")}
      ${I("meterReading", "Zählerstand / Datum")}
      ${I("previousSupplier", "Bisheriger Versorger", true)}
      ${I("previousCustomerNo", "Kundennummer bisheriger Versorger", true)}
      ${I("malo", "MaLo bisheriger Versorger")}
      ${I("consumptionKwh", "Vorjahresverbrauch in kWh", false, { attrs: { inputMode: "numeric" } })}
      <h3 className="sec span2">Zahlung</h3>
      ${S("paymentMethod", "Zahlungsart", C.payment, true)}
      ${I("accountHolder", "Kontoinhaber")}
      ${showIban ? I("iban", "IBAN", false, { attrs: { autoComplete: "off", spellCheck: false } })
        : html`<${Field} label="IBAN" div><div className="row"><span className="inp" style=${{ display: "flex", alignItems: "center" }}>${maskIban(f.iban) || "–"}</span><button type="button" className="btn btn-sm" onClick=${() => setShowIban(true)}>Anzeigen</button></div><//>`}
      ${I("bank", "Kreditinstitut")}
      <h3 className="sec span2">Abweichende Lieferanschrift</h3>
      ${I("deliveryStreet", "Straße & Hausnummer", false, { span: true })}
      ${I("deliveryZip", "PLZ", false, { attrs: { inputMode: "numeric" } })}
      ${I("deliveryCity", "Ort")}
      <h3 className="sec span2">Optionen & Einwilligungen</h3>
      ${YN("regionPlus", "Option REGION PLUS")}
      ${YN("phoneConsent", "Telefon-Einwilligung")}
      ${YN("emailConsent", "E-Mail-Einwilligung")}
      <${Field} label="Anmerkungen des Kunden" span><textarea className="inp" ...${b("customerNotes")} /><//>
      <h3 className="sec span2">Unterlagen</h3>
      <${Files} scope="contracts" label="Auftrag (PDF oder Foto)" req bad=${bad("orderFiles")} value=${f.orderFiles} onChange=${(v) => set("orderFiles", v)} />
      <${Files} scope="contracts" label="Rechnung aktueller Strom-/Gaslieferant" value=${f.invoiceFiles} onChange=${(v) => set("invoiceFiles", v)} />
    </div><//>`;
}
