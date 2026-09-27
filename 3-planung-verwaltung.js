"use strict";

// ================= Einsatzplanung =================
const depCovers = (d, day) => d.startDate && d.startDate <= day && day <= (d.endDate || d.startDate);
function depLabel(d, venueById) { const v = venueById[d.venueId]; return d.title || (v ? `${v.chain && v.chain !== "Sonstige" ? v.chain + " " : ""}${v.city || v.name}` : "Einsatz"); }

function PlanningView() {
  const { deployments, venueById, me, open, canWrite } = useApp();
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [typeF, setTypeF] = useState("all");
  const [mine, setMine] = useState(false);
  const deps = deployments.filter((d) => (typeF === "all" || d.type === typeF) && (!mine || !me || (d.employeeIds || []).includes(me.id)));
  const first = new Date(cur.y, cur.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const dim = new Date(cur.y, cur.m + 1, 0).getDate();
  const weeks = Math.ceil((offset + dim) / 7);
  const gridStart = addDays(isoDay(first), -offset);
  const today = todayISO();
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const move = (n) => setCur(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const upcoming = deps.filter((d) => (d.endDate || d.startDate) >= today).sort((a, b) => String(a.startDate).localeCompare(String(b.startDate))).slice(0, 12);
  return html`<div className="stack">
    <${PageHead} title="Einsatzplanung" sub="Promotions nach Venue, Zeitraum und Team" action=${canWrite("deployments") ? html`<button className="btn btn-primary" onClick=${() => open("depForm", {})}><${Icon} n="plus" s=${16} />Einsatz</button>` : null} />
    <div className="flex gap-2 flex-wrap items-center">
      ${[["all", "Alle"], ...Object.entries(TYPES).map(([k, v]) => [k, v.label])].map(([k, l]) => html`<button key=${k} className=${"fchip" + (typeF === k ? " on" : "")} onClick=${() => setTypeF(k)}>
        ${k !== "all" ? html`<span style=${{ display: "inline-block", width: 9, height: 9, borderRadius: 3, background: TYPES[k].color, marginRight: 6 }}></span>` : null}${l}</button>`)}
      ${me ? html`<button className=${"fchip" + (mine ? " on" : "")} onClick=${() => setMine(!mine)}>Nur meine</button>` : null}
    </div>
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-2 py-2">
        <button className="iconbtn" onClick=${() => move(-1)} aria-label="Vorheriger Monat"><${Icon} n="left" /></button>
        <button className="cond text-lg font-bold" style=${{ background: "none", border: 0, color: "inherit", cursor: "pointer" }} onClick=${() => { const d = new Date(); setCur({ y: d.getFullYear(), m: d.getMonth() }); }}>${MONTHS[cur.m]} ${cur.y}</button>
        <button className="iconbtn" onClick=${() => move(1)} aria-label="Nächster Monat"><${Icon} n="right" /></button>
      </div>
      <div className="cal">
        ${WD_SHORT.map((w) => html`<div key=${w} className="wd">${w}</div>`)}
        ${cells.map((day) => { const list = deps.filter((d) => depCovers(d, day)); const inMonth = parseDay(day).getMonth() === cur.m;
          return html`<div key=${day} className=${(inMonth ? "" : "out ") + (day === today ? "today" : "")} onClick=${() => open("day", { day })} role="button" tabIndex="0"
            onKeyDown=${(e) => { if (e.key === "Enter") open("day", { day }); }} aria-label=${`${fmtDay(day)}, ${list.length} Einsätze`}>
            <span className="dn">${parseDay(day).getDate()}</span>
            ${list.slice(0, 3).map((d) => html`<button key=${d.id} className="cchip" style=${{ background: (TYPES[d.type] || TYPES.LEH).color }} onClick=${(e) => { e.stopPropagation(); open("deployment", { id: d.id }); }}>${depLabel(d, venueById)}</button>`)}
            ${list.length > 3 ? html`<span className="text-xs muted font-semibold">+${list.length - 3}</span>` : null}
          </div>`; })}
      </div>
    </div>
    <div>
      <p className="lbl px-1">Kommende Einsätze</p>
      ${upcoming.length === 0 ? html`<${Empty} icon="cal" title="Keine kommenden Einsätze">Tippe auf einen Tag im Kalender oder auf „Einsatz“, um eine Promotion zu planen.<//>`
        : html`<div className="stack-sm">${upcoming.map((d) => html`<${DepRow} key=${d.id} d=${d} />`)}</div>`}
    </div>
  </div>`;
}
function DepRow({ d }) {
  const { venueById, empById, partnerById, open } = useApp();
  const v = venueById[d.venueId];
  return html`<button className="listbtn" onClick=${() => open("deployment", { id: d.id })} style=${{ borderLeft: `5px solid ${(TYPES[d.type] || TYPES.LEH).color}` }}>
    <div className="flex justify-between gap-2"><span className="font-bold truncate">${depLabel(d, venueById)}</span><span className="pill shrink-0">${(TYPES[d.type] || {}).label || d.type}</span></div>
    <p className="text-sm muted">${fmtDayShort(d.startDate)}${d.endDate && d.endDate !== d.startDate ? ` – ${fmtDayShort(d.endDate)}` : ""} · ${(partnerById[d.partnerId] || {}).name || "ohne Partner"}${v ? ` · ${v.zip || ""} ${v.city || ""}` : ""}</p>
    <div className="flex gap-1 mt-1.5">${(d.employeeIds || []).map((id) => html`<${Avatar} key=${id} emp=${empById[id]} size=${22} />`)}</div>
  </button>`;
}
function DaySheet({ day, onClose }) {
  const { deployments, open, canWrite } = useApp();
  const list = deployments.filter((d) => depCovers(d, day));
  return html`<${Sheet} title=${fmtDay(day)} onClose=${onClose} footer=${!canWrite("deployments") ? null : html`<button className="btn btn-primary" onClick=${() => { onClose(); open("depForm", { initial: { startDate: day, endDate: day } }); }}><${Icon} n="plus" s=${16} />Einsatz an diesem Tag</button>`}>
    ${list.length === 0 ? html`<p className="muted">Keine Einsätze an diesem Tag.</p>` : html`<div className="stack-sm">${list.map((d) => html`<${DepRow} key=${d.id} d=${d} />`)}</div>`}
  <//>`;
}

function DeploymentSheet({ id, onClose }) {
  const { deployments, venueById, partnerById, empById, reports, me, open, rt, run, canWrite } = useApp();
  const d = deployments.find((x) => x.id === id);
  const w = canWrite("deployments");
  if (!d) return html`<${Sheet} title="Einsatz" onClose=${onClose}><p className="muted">Dieser Einsatz wurde gelöscht.</p><//>`;
  const v = venueById[d.venueId], p = partnerById[d.partnerId];
  const days = daysBetween(d.startDate, d.endDate || d.startDate);
  const dayList = Array.from({ length: Math.min(Math.max(days, 1), 62) }, (_, i) => addDays(d.startDate, i));
  const reps = reports.filter((r) => r.deploymentId === d.id);
  const today = todayISO();
  const sum = (k) => reps.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const mainContact = p && (p.contacts || [])[0];
  return html`<${Sheet} wide title=${depLabel(d, venueById)} onClose=${onClose}
    footer=${!w ? null : html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("deployments/" + d.id), "Einsatz gelöscht")) onClose(); }} /><span className="flex-1"></span>
      <button className="btn" onClick=${() => { onClose(); open("depForm", { id: d.id }); }}><${Icon} n="pencil" s=${15} />Bearbeiten</button>`}>
    <div className="stack">
      <div className="flex flex-wrap gap-2 items-center">
        <span className="pill pill-solid" style=${{ background: (TYPES[d.type] || TYPES.LEH).color }}>${(TYPES[d.type] || {}).label || d.type}</span>
        <span className="font-semibold">${fmtDay(d.startDate)}${d.endDate && d.endDate !== d.startDate ? ` – ${fmtDay(d.endDate)}` : ""}</span>
        <span className="muted text-sm">${days} Tag${days === 1 ? "" : "e"}${v && v.rentPerDay ? ` · Standmiete gesamt ${eur(days * Number(v.rentPerDay))}` : ""}</span>
      </div>
      <div className="grid2">
        <div className="card p-3"><p className="lbl">Venue</p>
          ${v ? html`<p className="font-bold">${v.chain && v.chain !== "Sonstige" ? v.chain + " · " : ""}${v.name}</p><p className="text-sm">${v.street}, ${v.zip} ${v.city}</p>
            <dl className="kv mt-2"><dt>Kontakt</dt><dd>${v.contact || "–"}</dd><dt>Telefon</dt><dd>${v.phone ? html`<a href=${"tel:" + v.phone.replace(/[^\d+]/g, "")}>${v.phone}</a>` : "–"}</dd>
            <dt>E-Mail</dt><dd>${v.email ? html`<a href=${"mailto:" + v.email}>${v.email}</a>` : "–"}</dd><dt>Promotion</dt><dd>${v.promotion === true ? "Ja" : v.promotion === false ? "Nein" : "offen"}</dd><dt>Miete/Tag</dt><dd>${eur(v.rentPerDay)}</dd></dl>`
            : html`<p className="muted text-sm">Keine Venue zugeordnet</p>`}</div>
        <div className="card p-3"><p className="lbl">Projektpartner</p>
          ${p ? html`<p className="font-bold">${p.name}</p>${mainContact ? html`<p className="text-sm">${mainContact.name}${mainContact.role ? `, ${mainContact.role}` : ""}</p><p className="text-sm muted">${mainContact.phone || ""} ${mainContact.email || ""}</p>` : null}` : html`<p className="muted text-sm">Kein Partner zugeordnet</p>`}
          <p className="lbl mt-3">Team</p>
          <div className="stack-sm">${(d.employeeIds || []).length ? (d.employeeIds || []).map((eid) => html`<p key=${eid} className="row text-sm"><${Avatar} emp=${empById[eid]} size=${24} />${fullName(empById[eid])}</p>`) : html`<p className="muted text-sm">Noch niemand eingeplant</p>`}</div>
        </div>
      </div>
      <div><p className="lbl">Briefing</p>${d.briefing ? html`<div className="note">${d.briefing}</div>` : html`<p className="muted text-sm">Kein Briefing hinterlegt.</p>`}
        ${(d.briefingFiles || []).length ? html`<div className="mt-2"><${Files} label="Briefing-Unterlagen" readOnly=${!w} value=${d.briefingFiles} onChange=${(val) => run(() => rt.store.update("deployments/" + d.id, { briefingFiles: val }))} /></div>` : null}</div>
      <div>
        <p className="lbl">Reporting je Tag und Mitarbeiter</p>
        ${reps.length ? html`<p className="text-sm mb-2">Neukunden Strom <b>${sum("newPower")}</b> · Gas <b>${sum("newGas")}</b> · Bestand Strom <b>${sum("existingPower")}</b> · Gas <b>${sum("existingGas")}</b> · Leads <b>${sum("leads")}</b></p>` : null}
        <div className="scrollx card"><table className="tbl"><thead><tr><th>Tag</th>${(d.employeeIds || []).map((eid) => html`<th key=${eid}>${fullName(empById[eid])}</th>`)}</tr></thead>
          <tbody>${dayList.map((day) => html`<tr key=${day}><td>${fmtDayShort(day)} ${WD[parseDay(day).getDay()].slice(0, 2)}</td>
            ${(d.employeeIds || []).map((eid) => { const r = reps.find((x) => x.date === day && x.employeeId === eid);
              if (r) return html`<td key=${eid}><button className="btn btn-sm" style=${{ color: "var(--ok)" }} onClick=${() => open("report", { id: r.id })}><${Icon} n="check" s=${13} />${Number(r.newPower || 0) + Number(r.newGas || 0)} NK</button></td>`;
              const mineCell = me && me.id === eid && day <= today;
              return html`<td key=${eid}>${mineCell ? html`<button className="btn btn-sm btn-primary" onClick=${() => open("report", { initial: { deploymentId: d.id, date: day, employeeId: eid } })}>Report erfassen</button>`
                : html`<span className="text-xs" style=${{ color: day < today ? "var(--warn)" : "var(--muted)" }}>${day < today ? "fehlt" : day === today ? "heute" : "–"}</span>`}</td>`; })}
          </tr>`)}</tbody></table></div>
        ${days > 62 ? html`<p className="text-xs muted mt-1">Anzeige auf die ersten 62 Tage begrenzt.</p>` : null}
      </div>
    </div><//>`;
}

function DepFormSheet({ id, initial, onClose }) {
  const { deployments, venues, venueById, partners, employees, rt, run, toast } = useApp();
  const existing = id ? deployments.find((x) => x.id === id) : null;
  const [f, b, set] = useForm(() => existing ? { ...existing } : { title: "", venueId: "", type: "LEH", startDate: todayISO(), endDate: todayISO(), partnerId: "", employeeIds: [], briefing: "", briefingFiles: [], ...(initial || {}) });
  const [vq, setVq] = useState("");
  const [tried, setTried] = useState(false);
  const miss = missing(f, ["venueId", "type", "startDate", "endDate"]);
  const rangeBad = f.startDate && f.endDate && f.endDate < f.startDate;
  const vOpts = venues.filter((v) => !vq.trim() || lc(`${v.chain} ${v.name} ${v.zip} ${v.city} ${v.street}`).includes(lc(vq.trim())))
    .sort((a, b2) => String(a.zip).localeCompare(String(b2.zip))).slice(0, 300);
  if (f.venueId && !vOpts.find((v) => v.id === f.venueId) && venueById[f.venueId]) vOpts.unshift(venueById[f.venueId]);
  const toggleEmp = (eid) => set("employeeIds", (f.employeeIds || []).includes(eid) ? f.employeeIds.filter((x) => x !== eid) : [...(f.employeeIds || []), eid]);
  const clash = useMemo(() => {
    const out = [];
    (f.employeeIds || []).forEach((eid) => deployments.forEach((d) => {
      if (existing && d.id === existing.id) return;
      if ((d.employeeIds || []).includes(eid) && d.startDate <= f.endDate && f.startDate <= (d.endDate || d.startDate)) out.push([eid, d]);
    }));
    return out;
  }, [f.employeeIds, f.startDate, f.endDate, deployments]);
  const { empById } = useApp();
  async function save() {
    setTried(true);
    if (miss.length || rangeBad) { toast(rangeBad ? "Enddatum liegt vor dem Startdatum." : "Bitte Venue, Art und Zeitraum angeben.", "err"); return; }
    const did = existing ? existing.id : uid();
    if (await run(() => rt.store.set("deployments/" + did, { ...f, updatedAt: Date.now(), createdAt: existing ? existing.createdAt || Date.now() : Date.now() }), existing ? "Einsatz gespeichert" : "Einsatz geplant")) onClose();
  }
  return html`<${Sheet} wide title=${existing ? "Einsatz bearbeiten" : "Einsatz planen"} onClose=${onClose}
    footer=${html`<button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>${existing ? "Speichern" : "Einsatz planen"}</button>`}>
    <div className="grid2">
      <${Field} label="Art der Promotion" req div span><${Seg} opts=${Object.entries(TYPES).map(([k, v]) => [k, v.label])} value=${f.type} onChange=${(v) => set("type", v)} /><//>
      <${Field} label="Venue suchen" span><input className="inp" value=${vq} onChange=${(e) => setVq(e.target.value)} placeholder="Kette, Ort oder PLZ" /><//>
      <${Field} label="Venue" req span bad=${tried && !f.venueId} hint=${venues.length ? `${venues.length} Venues in der Liste` : "Noch keine Venues – zuerst unter Mehr › Venues anlegen oder importieren."}>
        <${Sel} className=${"inp" + (tried && !f.venueId ? " bad" : "")} opts=${vOpts.map((v) => [v.id, `${v.zip || ""} ${v.city || ""} · ${v.chain || ""} ${v.name || ""}`.trim()])} ...${b("venueId")} /><//>
      <${Field} label="Titel (optional)" span hint="Sonst wird der Venue-Name angezeigt."><input className="inp" ...${b("title")} placeholder="z. B. Herbstaktion Wärmepumpe" /><//>
      <${Field} label="Von" req><input className="inp" type="date" ...${b("startDate")} onChange=${(e) => { const v = e.target.value; set("startDate", v); if (!f.endDate || f.endDate < v) set("endDate", v); }} /><//>
      <${Field} label="Bis" req bad=${rangeBad}><input className=${"inp" + (rangeBad ? " bad" : "")} type="date" min=${f.startDate} ...${b("endDate")} /><//>
      <${Field} label="Projektpartner" span><${Sel} opts=${partners.map((p) => [p.id, p.name])} ...${b("partnerId")} /><//>
      <${Field} label="Mitarbeiter" div span>
        ${employees.length ? html`<div className="flex flex-wrap gap-2">${employees.filter((e) => e.active !== false).map((e) => { const on = (f.employeeIds || []).includes(e.id);
          return html`<button type="button" key=${e.id} className=${"fchip row" + (on ? " on" : "")} style=${{ gap: ".4rem" }} onClick=${() => toggleEmp(e.id)} aria-pressed=${on}><${Avatar} emp=${e} size=${20} />${fullName(e)}</button>`; })}</div>`
          : html`<p className="muted text-sm">Noch keine Mitarbeiter angelegt.</p>`}
        ${clash.length ? html`<p className="text-sm mt-2" style=${{ color: "var(--warn)" }}>Überschneidung: ${clash.map(([eid, d]) => `${fullName(empById[eid])} (${fmtDayShort(d.startDate)}–${fmtDayShort(d.endDate || d.startDate)} ${depLabel(d, venueById)})`).join("; ")}</p>` : null}
      <//>
      <${Field} label="Briefing für Mitarbeiter" span><textarea className="inp" style=${{ minHeight: 140 }} ...${b("briefing")} placeholder="Ablauf, Treffpunkt, Ansprechpartner vor Ort, Aktion, Dresscode, Material" /><//>
      <${Files} label="Briefing-Unterlagen" value=${f.briefingFiles} onChange=${(v) => set("briefingFiles", v)} />
    </div><//>`;
}

// ================= Reporting =================
const REPORT_REQ = ["deploymentId", "date", "employeeId", "workStart", "workEnd", "breakStart", "breakEnd", "existingPower", "existingGas", "newPower", "newGas", "leads", "resonance"];
function ReportsView({ onBack }) {
  const { reports, deployments, venueById, empById, employees, open, rt, toast, canWrite } = useApp();
  const [empF, setEmpF] = useState("all");
  const [depF, setDepF] = useState("all");
  const depById = useMemo(() => Object.fromEntries(deployments.map((d) => [d.id, d])), [deployments]);
  const list = reports.filter((r) => (empF === "all" || r.employeeId === empF) && (depF === "all" || r.deploymentId === depF)).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const sum = (k) => list.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const area = (r) => { const d = depById[r.deploymentId]; const v = d && venueById[d.venueId]; return v ? `${v.chain && v.chain !== "Sonstige" ? v.chain + " " : ""}${v.city}` : (d ? depLabel(d, venueById) : "–"); };
  async function exportIt() {
    const rows = [["Einsatztag", "Wochentag", "Einsatzgebiet", "Vorname", "Nachname", "Arbeitsbeginn", "Arbeitsende", "Pausenbeginn", "Pausenende", "Netto-Stunden", "Bestandskunden Strom", "Bestandskunden Gas", "Neukunden Strom", "Neukunden Gas", "Leads", "Resonanz", "Positive Anmerkungen", "Negative Anmerkungen", "Fragen/Anmerkungen", "Fotos"]];
    list.forEach((r) => { const e = empById[r.employeeId] || {}; const h = netHours(r);
      rows.push([fmtDay(r.date), WD[parseDay(r.date).getDay()], area(r), e.firstName, e.lastName, r.workStart, r.workEnd, r.breakStart, r.breakEnd, h === null ? "" : h.toFixed(2).replace(".", ","), r.existingPower, r.existingGas, r.newPower, r.newGas, r.leads, r.resonance, r.positive, r.negative, r.questions, (r.photos || []).length]); });
    if (await saveFile(rt, `reporting-${todayISO()}.csv`, toCSV(rows), "text/csv")) toast("Export gespeichert");
  }
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Reporting" sub="Tagesberichte der Einsätze" action=${!canWrite("reports") ? null : html`<button className="btn btn-primary" onClick=${() => open("report", {})}><${Icon} n="plus" s=${16} />Report</button>`} />
    <div className="flex gap-2 flex-wrap">
      <select className="inp" style=${{ width: "auto", minHeight: 38, fontSize: 14 }} value=${empF} onChange=${(e) => setEmpF(e.target.value)} aria-label="Mitarbeiter"><option value="all">Alle Mitarbeiter</option>${employees.map((e) => html`<option key=${e.id} value=${e.id}>${fullName(e)}</option>`)}</select>
      <select className="inp" style=${{ width: "auto", maxWidth: "100%", minHeight: 38, fontSize: 14 }} value=${depF} onChange=${(e) => setDepF(e.target.value)} aria-label="Einsatz"><option value="all">Alle Einsätze</option>${deployments.map((d) => html`<option key=${d.id} value=${d.id}>${fmtDayShort(d.startDate)} ${depLabel(d, venueById)}</option>`)}</select>
      <button className="btn btn-sm" onClick=${exportIt}><${Icon} n="download" s=${14} />CSV</button>
    </div>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      ${[["NK Strom", sum("newPower")], ["NK Gas", sum("newGas")], ["BK Strom", sum("existingPower")], ["BK Gas", sum("existingGas")], ["Leads", sum("leads")]].map(([l, v]) => html`<div key=${l} className="card p-3"><div className="cond text-2xl font-bold">${v}</div><div className="text-xs muted">${l}</div></div>`)}
    </div>
    ${list.length === 0 ? html`<${Empty} icon="chart" title="Noch keine Reports">Reports erfasst du am schnellsten über den jeweiligen Einsatz in der Planung.<//>`
      : html`<div className="stack-sm">${list.map((r) => html`<button key=${r.id} className="listbtn" onClick=${() => open("report", { id: r.id })}>
        <div className="flex justify-between gap-2"><span className="font-bold truncate">${area(r)}</span><span className="text-sm muted shrink-0">${fmtDay(r.date)}</span></div>
        <p className="text-sm row" style=${{ gap: ".4rem" }}><${Avatar} emp=${empById[r.employeeId]} size=${20} />${fullName(empById[r.employeeId])} · ${hoursLabel(netHours(r))} · NK ${Number(r.newPower || 0) + Number(r.newGas || 0)} · Leads ${r.leads || 0}
          <span className="pill" style=${{ color: r.resonance === "Gut" ? "var(--ok)" : r.resonance === "Schlecht" ? "var(--no)" : "var(--warn)" }}>${r.resonance}</span></p></button>`)}</div>`}
  </div>`;
}

function ReportSheet({ id, initial, onClose }) {
  const { reports, deployments, venueById, employees, me, rt, run, toast } = useApp();
  const existing = id ? reports.find((r) => r.id === id) : null;
  const [f, b, set] = useForm(() => existing ? { ...existing } : { deploymentId: "", date: todayISO(), employeeId: me ? me.id : "", workStart: "", workEnd: "", breakStart: "", breakEnd: "", existingPower: "0", existingGas: "0", newPower: "0", newGas: "0", leads: "0", resonance: "", positive: "", negative: "", questions: "", photos: [], ...(initial || {}) });
  const [tried, setTried] = useState(false);
  const miss = missing(f, REPORT_REQ);
  const bad = (k) => tried && miss.includes(k);
  const dep = deployments.find((d) => d.id === f.deploymentId);
  const v = dep && venueById[dep.venueId];
  const dayOutside = dep && f.date && !depCovers(dep, f.date);
  const dupe = !existing && reports.find((r) => r.deploymentId === f.deploymentId && r.date === f.date && r.employeeId === f.employeeId);
  const h = netHours(f);
  const depOpts = deployments.filter((d) => !f.employeeId || (d.employeeIds || []).includes(f.employeeId) || d.id === f.deploymentId)
    .sort((a, b2) => String(b2.startDate).localeCompare(String(a.startDate))).map((d) => [d.id, `${fmtDayShort(d.startDate)}–${fmtDayShort(d.endDate || d.startDate)} ${depLabel(d, venueById)}`]);
  const T = (k, label) => html`<${Field} label=${label} req bad=${bad(k)}><input className=${"inp" + (bad(k) ? " bad" : "")} type="time" ...${b(k)} /><//>`;
  const N = (k, label) => html`<${Field} label=${label} req bad=${bad(k)}><input className="inp" type="number" min="0" inputMode="numeric" ...${b(k)} /><//>`;
  async function save() {
    setTried(true);
    if (miss.length) { toast(`Bitte Pflichtfelder ausfüllen (${miss.length} offen).`, "err"); return; }
    if (dupe) { toast("Für diesen Tag gibt es schon einen Report. Bitte diesen bearbeiten.", "err"); return; }
    const rid = existing ? existing.id : uid();
    const data = { ...f, weekday: WD[parseDay(f.date).getDay()], area: v ? `${v.chain || ""} ${v.city || ""}`.trim() : "", netHours: h, updatedAt: Date.now(), createdAt: existing ? existing.createdAt || Date.now() : Date.now() };
    ["existingPower", "existingGas", "newPower", "newGas", "leads"].forEach((k) => { data[k] = Math.max(0, parseInt(data[k], 10) || 0); });
    if (await run(() => rt.store.set("reports/" + rid, data), existing ? "Report gespeichert" : "Report gesendet")) onClose();
  }
  return html`<${Sheet} wide title=${existing ? "Report bearbeiten" : "Tagesreport"} onClose=${onClose}
    footer=${html`${existing ? html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("reports/" + existing.id), "Report gelöscht")) onClose(); }} />` : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>${existing ? "Speichern" : "Report senden"}</button>`}>
    <div className="grid2">
      <h3 className="sec span2">Einsatz</h3>
      <${Field} label="Mitarbeiter" req bad=${bad("employeeId")}><${Sel} disabled=${!rt.canEdit} opts=${employees.map((e) => [e.id, fullName(e)])} ...${b("employeeId")} /><//>
      <${Field} label="Einsatztag" req bad=${bad("date")} hint=${f.date ? WD[parseDay(f.date).getDay()] : ""}><input className="inp" type="date" ...${b("date")} /><//>
      <${Field} label="Einsatz / Einsatzgebiet" req span bad=${bad("deploymentId")} hint=${v ? `${v.name}, ${v.street}, ${v.zip} ${v.city}` : depOpts.length ? "" : "Für diesen Mitarbeiter ist noch kein Einsatz geplant."}>
        <${Sel} className=${"inp" + (bad("deploymentId") ? " bad" : "")} opts=${depOpts} ...${b("deploymentId")} /><//>
      ${dayOutside ? html`<p className="span2 text-sm" style=${{ color: "var(--warn)" }}>Der Einsatztag liegt außerhalb des geplanten Zeitraums.</p>` : null}
      ${dupe ? html`<p className="span2 text-sm" style=${{ color: "var(--no)" }}>Für diesen Mitarbeiter und Tag existiert bereits ein Report.</p>` : null}
      <h3 className="sec span2">Arbeitszeit ${h !== null ? html`<span className="muted font-normal text-sm">· netto ${hoursLabel(h)}</span>` : null}</h3>
      ${T("workStart", "Arbeitsbeginn")}${T("workEnd", "Arbeitsende")}${T("breakStart", "Pausenbeginn")}${T("breakEnd", "Pausenende")}
      <h3 className="sec span2">Ergebnisse</h3>
      ${N("existingPower", "Bestandskunden Strom")}${N("existingGas", "Bestandskunden Gas")}${N("newPower", "Neukunden Strom")}${N("newGas", "Neukunden Gas")}${N("leads", "Anzahl Leads")}
      <${Field} label="Resonanz auf die Aktion" req div bad=${bad("resonance")}><${Seg} opts=${["Gut", "Mittel", "Schlecht"]} value=${f.resonance} onChange=${(val) => set("resonance", val)} /><//>
      <h3 className="sec span2">Anmerkungen</h3>
      <${Field} label="Positive Anmerkungen der Kunden" span><textarea className="inp" ...${b("positive")} /><//>
      <${Field} label="Negative Anmerkungen der Kunden" span><textarea className="inp" ...${b("negative")} /><//>
      <${Field} label="Deine Fragen / Anmerkungen" span><textarea className="inp" ...${b("questions")} /><//>
      <${Files} label="Aktionsfotos" accept="image/*" value=${f.photos} onChange=${(val) => set("photos", val)} />
    </div><//>`;
}

// ================= Venues =================
const VENUE_HEAD = { kette: "chain", name: "name", markt: "name", strasse: "street", adresse: "street", plz: "zip", ort: "city", stadt: "city", telefon: "phone", tel: "phone", email: "email", ansprechpartner: "contact", kontakt: "contact", promotion: "promotion", standmiete: "rentPerDay", miete: "rentPerDay", notiz: "notes", notizen: "notes" };
function mapHead(h) {
  const k = lc(h).replace(/ß/g, "ss").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z]/g, "");
  if (VENUE_HEAD[k]) return VENUE_HEAD[k];
  if (k.startsWith("standmiete") || k.startsWith("miete")) return "rentPerDay";
  if (k.startsWith("promotion")) return "promotion";
  if (k.startsWith("strasse")) return "street";
  if (k.startsWith("email") || k === "mail") return "email";
  if (k.startsWith("telefon")) return "phone";
  return null;
}
const parseBool = (s) => { const t = lc(s).trim(); if (["ja", "j", "yes", "y", "1", "true", "x"].includes(t)) return true; if (["nein", "n", "no", "0", "false"].includes(t)) return false; return null; };
const parseNum = (s) => { const t = String(s || "").replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."); const n = parseFloat(t); return isNaN(n) ? "" : n; };
const venueId = (v) => slug(`${v.chain}-${v.zip}-${v.street || v.name}`).slice(0, 120);

function VenuesView({ onBack }) {
  const { venues, open, rt, toast, canWrite } = useApp();
  const w = canWrite("venues");
  const [chainF, setChainF] = useState("all");
  const [plzF, setPlzF] = useState("all");
  const [promoF, setPromoF] = useState("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(100);
  const [imp, setImp] = useState(null);
  const fileRef = useRef(null);
  const list = venues.filter((v) => (chainF === "all" || v.chain === chainF) && (plzF === "all" || String(v.zip || "").startsWith(plzF))
    && (promoF === "all" || (promoF === "yes" ? v.promotion === true : promoF === "no" ? v.promotion === false : v.promotion !== true && v.promotion !== false))
    && (!q.trim() || lc(`${v.name} ${v.city} ${v.zip} ${v.street} ${v.contact}`).includes(lc(q.trim())))).sort((a, b) => String(a.zip).localeCompare(String(b.zip)) || String(a.chain).localeCompare(String(b.chain)));
  async function pickCSV(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    const rows = parseCSV(await file.text());
    if (rows.length < 2) { toast("Die Datei enthält keine Datenzeilen.", "err"); return; }
    const heads = rows[0].map(mapHead);
    if (!heads.includes("zip") || !heads.includes("chain")) { toast("Spalten „Kette“ und „PLZ“ fehlen. Bitte die Vorlage verwenden.", "err"); return; }
    const items = rows.slice(1).map((r) => { const o = { chain: "", name: "", street: "", zip: "", city: "", phone: "", email: "", contact: "", promotion: null, rentPerDay: "", notes: "" };
      heads.forEach((h, i) => { if (!h) return; const val = String(r[i] || "").trim(); o[h] = h === "promotion" ? parseBool(val) : h === "rentPerDay" ? parseNum(val) : val; });
      const ch = CHAINS.find((c) => lc(o.chain).includes(lc(c))); o.chain = ch || (o.chain ? "Sonstige" : "Sonstige"); if (!o.name) o.name = `${o.chain} ${o.city}`.trim();
      return o; }).filter((o) => o.zip || o.street);
    setImp({ items, done: 0, running: false, file: file.name });
  }
  async function runImport() {
    setImp((s) => ({ ...s, running: true }));
    let done = 0, failed = 0;
    for (const v of imp.items) {
      const path = "venues/" + venueId(v);
      let ok = false;
      for (let a = 0; a < 3 && !ok; a++) {
        try { await rt.store.set(path, { ...v, updatedAt: Date.now() }); ok = true; }
        catch (err) { if (err && err.code === "quota_exceeded") { toast(errMsg(err), "err"); setImp(null); return; } await new Promise((r) => setTimeout(r, 1200 * (a + 1))); }
      }
      if (!ok) failed++;
      done++; if (done % 5 === 0 || done === imp.items.length) setImp((s) => s && ({ ...s, done }));
      await new Promise((r) => setTimeout(r, 40));
    }
    toast(`${done - failed} Venues importiert${failed ? `, ${failed} fehlgeschlagen` : ""}`);
    setImp(null);
  }
  async function template() {
    const rows = [["Kette", "Name", "Straße", "PLZ", "Ort", "Telefon", "E-Mail", "Ansprechpartner", "Promotion möglich", "Standmiete je Tag", "Notiz"], ["REWE", "REWE Markt Musterstadt", "Musterstraße 1", "50667", "Köln", "0221 123456", "markt@example.de", "Frau Beispiel", "ja", "80", ""]];
    if (await saveFile(rt, "venues-vorlage.csv", toCSV(rows), "text/csv")) toast("Vorlage gespeichert");
  }
  async function exportIt() {
    const rows = [["Kette", "Name", "Straße", "PLZ", "Ort", "Telefon", "E-Mail", "Ansprechpartner", "Promotion möglich", "Standmiete je Tag", "Notiz"]];
    list.forEach((v) => rows.push([v.chain, v.name, v.street, v.zip, v.city, v.phone, v.email, v.contact, v.promotion === true ? "ja" : v.promotion === false ? "nein" : "", v.rentPerDay === "" || v.rentPerDay == null ? "" : String(v.rentPerDay).replace(".", ","), v.notes]));
    if (await saveFile(rt, `venues-${todayISO()}.csv`, toCSV(rows), "text/csv")) toast("Export gespeichert");
  }
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Venues" sub="Märkte und Standorte für Promotions" action=${w ? html`<button className="btn btn-primary" onClick=${() => open("venue", {})}><${Icon} n="plus" s=${16} />Venue</button>` : null} />
    <div className="flex flex-wrap gap-2">
      ${w ? html`<button className="btn btn-sm" onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="upload" s=${14} />CSV importieren</button>` : null}
      <button className="btn btn-sm" onClick=${template}><${Icon} n="download" s=${14} />Vorlage</button>
      <button className="btn btn-sm" onClick=${exportIt}><${Icon} n="download" s=${14} />Export</button>
      <input ref=${fileRef} type="file" accept=".csv,text/csv" hidden onChange=${pickCSV} />
    </div>
    ${imp ? html`<div className="card p-3" style=${{ borderColor: "var(--accent)" }}>
      <p className="font-semibold">${imp.file}: ${imp.items.length} Venues erkannt</p>
      ${venues.length + imp.items.length > 3500 ? html`<p className="text-sm" style=${{ color: "var(--warn)" }}>Achtung: Die Datenbank fasst insgesamt 5.000 Datensätze (inkl. Verträge, Reports, Leads).</p>` : null}
      <p className="text-sm muted">Bestehende Einträge mit gleicher Kette, PLZ und Straße werden aktualisiert.</p>
      ${imp.running ? html`<p className="text-sm mt-2">Importiere… ${imp.done} / ${imp.items.length}</p>`
        : html`<div className="flex gap-2 mt-2"><button className="btn btn-primary btn-sm" onClick=${runImport}>Import starten</button><button className="btn btn-sm" onClick=${() => setImp(null)}>Abbrechen</button></div>`}
    </div>` : null}
    <${SearchBox} value=${q} onChange=${(v) => { setQ(v); setLimit(100); }} placeholder="Name, Ort, PLZ, Ansprechpartner" />
    <div className="flex gap-2 flex-wrap">${["all", ...CHAINS].map((c) => html`<button key=${c} className=${"fchip" + (chainF === c ? " on" : "")} onClick=${() => setChainF(c)}>${c === "all" ? "Alle Ketten" : c}</button>`)}</div>
    <div className="flex gap-2 flex-wrap">
      ${[["all", "Alle PLZ"], ["4", "PLZ 4…"], ["5", "PLZ 5…"]].map(([k, l]) => html`<button key=${k} className=${"fchip" + (plzF === k ? " on" : "")} onClick=${() => setPlzF(k)}>${l}</button>`)}
      <span className="w-2"></span>
      ${[["all", "Promotion: alle"], ["yes", "möglich"], ["no", "nicht möglich"], ["open", "ungeklärt"]].map(([k, l]) => html`<button key=${k} className=${"fchip" + (promoF === k ? " on" : "")} onClick=${() => setPromoF(k)}>${l}</button>`)}
    </div>
    <p className="text-sm muted">${list.length} von ${venues.length} Venues</p>
    ${venues.length === 0 ? html`<${Empty} icon="store" title="Noch keine Venues">Importiere eine CSV-Liste (Vorlage herunterladen) oder lege Märkte einzeln an.<//>`
      : html`<div className="stack-sm">${list.slice(0, limit).map((v) => html`<button key=${v.id} className="listbtn" onClick=${() => open("venue", { id: v.id })}>
        <div className="flex justify-between gap-2"><span className="font-bold truncate">${v.chain} · ${v.name}</span>
          <span className="pill shrink-0" style=${{ color: v.promotion === true ? "var(--ok)" : v.promotion === false ? "var(--no)" : "var(--muted)" }}>${v.promotion === true ? "Promo ja" : v.promotion === false ? "Promo nein" : "ungeklärt"}</span></div>
        <p className="text-sm muted">${v.street}, ${v.zip} ${v.city}${v.rentPerDay !== "" && v.rentPerDay != null ? ` · ${eur(v.rentPerDay)}/Tag` : ""}</p>
        ${v.contact || v.phone ? html`<p className="text-xs muted">${[v.contact, v.phone, v.email].filter(Boolean).join(" · ")}</p>` : null}
      </button>`)}
      ${list.length > limit ? html`<button className="btn w-full" onClick=${() => setLimit(limit + 200)}>Weitere ${Math.min(200, list.length - limit)} anzeigen</button>` : null}</div>`}
  </div>`;
}
function VenueSheet({ id, onClose }) {
  const { venues, deployments, rt, run, toast, canWrite } = useApp();
  const w = canWrite("venues");
  const existing = id ? venues.find((v) => v.id === id) : null;
  const [f, b, set] = useForm(() => existing ? { ...existing } : { chain: "", name: "", street: "", zip: "", city: "", phone: "", email: "", contact: "", promotion: null, rentPerDay: "", notes: "" });
  const [tried, setTried] = useState(false);
  const miss = missing(f, ["chain", "name", "street", "zip", "city"]);
  const bad = (k) => tried && miss.includes(k);
  const used = existing ? deployments.filter((d) => d.venueId === existing.id).length : 0;
  async function save() {
    setTried(true);
    if (miss.length) { toast("Bitte Kette, Name und Adresse angeben.", "err"); return; }
    const vid = existing ? existing.id : venueId(f);
    if (!existing && venues.find((v) => v.id === vid)) { toast("Diese Venue existiert bereits (gleiche Kette, PLZ, Straße).", "err"); return; }
    if (await run(() => rt.store.set("venues/" + vid, { ...f, rentPerDay: f.rentPerDay === "" ? "" : parseNum(f.rentPerDay), updatedAt: Date.now() }), "Venue gespeichert")) onClose();
  }
  const I = (k, label, req, attrs = {}, span) => html`<${Field} label=${label} req=${req} bad=${bad(k)} span=${span}><input className=${"inp" + (bad(k) ? " bad" : "")} ...${b(k)} ...${attrs} /><//>`;
  return html`<${Sheet} title=${existing ? "Venue bearbeiten" : "Neue Venue"} onClose=${onClose}
    footer=${!w ? null : html`${existing ? (used ? html`<span className="text-xs muted">In ${used} Einsatz/Einsätzen verwendet</span>` : html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("venues/" + existing.id), "Venue gelöscht")) onClose(); }} />`) : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>Speichern</button>`}>
    <div className="grid2">
      <${Field} label="Kette" req bad=${bad("chain")}><${Sel} className=${"inp" + (bad("chain") ? " bad" : "")} opts=${CHAINS} ...${b("chain")} /><//>
      ${I("name", "Name / Markt", true)}
      ${I("street", "Straße & Hausnummer", true, {}, true)}
      ${I("zip", "PLZ", true, { inputMode: "numeric" })}${I("city", "Ort", true)}
      <h3 className="sec span2">Kontakt</h3>
      ${I("contact", "Ansprechpartner")}${I("phone", "Telefon", false, { type: "tel" })}${I("email", "E-Mail", false, { type: "email" }, true)}
      <h3 className="sec span2">Promotion</h3>
      <${Field} label="Promotion möglich" div><${Seg} opts=${[[true, "Ja"], [false, "Nein"], [null, "Ungeklärt"]]} value=${f.promotion === undefined ? null : f.promotion} onChange=${(v) => set("promotion", v)} /><//>
      ${I("rentPerDay", "Standmiete je Tag (€)", false, { inputMode: "decimal" })}
      <${Field} label="Notiz" span><textarea className="inp" ...${b("notes")} placeholder="z. B. Standplatz im Eingangsbereich, Anmeldung 4 Wochen vorher" /><//>
    </div><//>`;
}

// ================= Projektpartner =================
function PartnersView({ onBack }) {
  const { partners, deployments, contracts, open, canWrite } = useApp();
  const [q, setQ] = useState("");
  const list = partners.filter((p) => !q.trim() || lc(`${p.name} ${p.city} ${(p.contacts || []).map((c) => c.name).join(" ")}`).includes(lc(q.trim()))).sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Projektpartner" sub="Auftraggeber mit Stammdaten und Ansprechpartnern" action=${!canWrite("partners") ? null : html`<button className="btn btn-primary" onClick=${() => open("partner", {})}><${Icon} n="plus" s=${16} />Partner</button>`} />
    <${SearchBox} value=${q} onChange=${setQ} placeholder="Firma, Ort, Ansprechpartner" />
    ${list.length === 0 ? html`<${Empty} icon="briefcase" title="Noch keine Projektpartner">Lege z. B. RheinEnergie AG oder EWV mit Ansprechpartnern an.<//>`
      : html`<div className="stack-sm">${list.map((p) => html`<button key=${p.id} className="listbtn" onClick=${() => open("partner", { id: p.id })}>
        <p className="font-bold">${p.name}</p><p className="text-sm muted">${[p.street, [p.zip, p.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Keine Adresse"}</p>
        <p className="text-xs muted">${(p.contacts || []).length} Ansprechpartner · ${deployments.filter((d) => d.partnerId === p.id).length} Einsätze · ${contracts.filter((c) => c.partnerId === p.id).length} Verträge</p></button>`)}</div>`}
  </div>`;
}
function PartnerSheet({ id, onClose }) {
  const { partners, rt, run, toast, canWrite } = useApp();
  const w = canWrite("partners");
  const existing = id ? partners.find((p) => p.id === id) : null;
  const [f, b, set] = useForm(() => existing ? { ...existing, contacts: [...(existing.contacts || [])] } : { name: "", legalForm: "", street: "", zip: "", city: "", phone: "", email: "", website: "", vatId: "", registerNo: "", ourCustomerNo: "", contractInfo: "", notes: "", contacts: [] });
  const [tried, setTried] = useState(false);
  const setContact = (i, k, v) => set("contacts", f.contacts.map((c, j) => j === i ? { ...c, [k]: v } : c));
  async function save() {
    setTried(true);
    if (!String(f.name || "").trim()) { toast("Bitte den Firmennamen angeben.", "err"); return; }
    const pid = existing ? existing.id : uid();
    if (await run(() => rt.store.set("partners/" + pid, { ...f, contacts: (f.contacts || []).filter((c) => (c.name || "").trim()), updatedAt: Date.now() }), "Partner gespeichert")) onClose();
  }
  const I = (k, label, attrs = {}, span) => html`<${Field} label=${label} span=${span}><input className="inp" ...${b(k)} ...${attrs} /><//>`;
  return html`<${Sheet} wide title=${existing ? existing.name : "Neuer Projektpartner"} onClose=${onClose}
    footer=${!w ? null : html`${existing ? html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("partners/" + existing.id), "Partner gelöscht")) onClose(); }} />` : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>Speichern</button>`}>
    <div className="grid2">
      <h3 className="sec span2">Stammdaten</h3>
      <${Field} label="Firma" req bad=${tried && !String(f.name || "").trim()}><input className="inp" ...${b("name")} placeholder="z. B. RheinEnergie AG" /><//>
      ${I("legalForm", "Rechtsform / Branche")}
      ${I("street", "Straße & Hausnummer", {}, true)}${I("zip", "PLZ", { inputMode: "numeric" })}${I("city", "Ort")}
      ${I("phone", "Telefon (Zentrale)", { type: "tel" })}${I("email", "E-Mail (allgemein)", { type: "email" })}
      ${I("website", "Website")}${I("vatId", "USt-IdNr.")}${I("registerNo", "Handelsregister")}${I("ourCustomerNo", "Unsere Lieferanten-/Kundennummer")}
      <${Field} label="Vertrag / Konditionen" span><textarea className="inp" ...${b("contractInfo")} placeholder="Laufzeit, Provisionen, Abrechnungsweg" /><//>
      <${Field} label="Notiz" span><textarea className="inp" ...${b("notes")} /><//>
      <h3 className="sec span2">Ansprechpartner</h3>
      ${(f.contacts || []).map((c, i) => html`<div key=${i} className="span2 card p-3"><div className="grid2">
        <${Field} label="Name"><input className="inp" value=${c.name || ""} onChange=${(e) => setContact(i, "name", e.target.value)} /><//>
        <${Field} label="Funktion"><input className="inp" value=${c.role || ""} onChange=${(e) => setContact(i, "role", e.target.value)} placeholder="z. B. Vertriebsleitung" /><//>
        <${Field} label="Telefon"><input className="inp" type="tel" value=${c.phone || ""} onChange=${(e) => setContact(i, "phone", e.target.value)} /><//>
        <${Field} label="E-Mail"><input className="inp" type="email" value=${c.email || ""} onChange=${(e) => setContact(i, "email", e.target.value)} /><//>
        <div className="span2 flex justify-end"><button type="button" className="btn btn-sm btn-ghost-danger" onClick=${() => set("contacts", f.contacts.filter((_, j) => j !== i))}><${Icon} n="trash" s=${14} />Entfernen</button></div>
      </div></div>`)}
      <div className="span2"><button type="button" className="btn btn-sm" onClick=${() => set("contacts", [...(f.contacts || []), { name: "", role: "", phone: "", email: "" }])}><${Icon} n="plus" s=${14} />Ansprechpartner hinzufügen</button></div>
    </div><//>`;
}

// ================= Team =================
function TeamView({ onBack }) {
  const { employees, open, me, rt } = useApp();
  const [showInactive, setShowInactive] = useState(false);
  const list = employees.filter((e) => showInactive || e.active !== false).sort((a, b) => fullName(a).localeCompare(fullName(b), "de"));
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Mitarbeiter" sub="Stamm- und Kontaktdaten, Foto, Lohnabrechnungen" action=${!rt.canEdit ? null : html`<button className="btn btn-primary" onClick=${() => open("employee", {})}><${Icon} n="plus" s=${16} />Mitarbeiter</button>`} />
    ${employees.some((e) => e.active === false) ? html`<button className=${"fchip" + (showInactive ? " on" : "")} onClick=${() => setShowInactive(!showInactive)}>Ausgeschiedene anzeigen</button>` : null}
    ${list.length === 0 ? html`<${Empty} icon="users" title="Noch keine Mitarbeiter">Lege das Team an. Danach wählt jeder oben rechts seinen Namen.<//>`
      : html`<div className="stack-sm">${list.map((e) => html`<button key=${e.id} className="listbtn row" onClick=${() => open("employee", { id: e.id })}>
        <${Avatar} emp=${e} size=${44} /><span className="min-w-0 flex-1"><span className="font-bold block truncate">${fullName(e)}${me && me.id === e.id ? html` <span className="pill">du</span>` : null}${e.active === false ? html` <span className="pill">ausgeschieden</span>` : null}</span>
        <span className="text-sm muted block truncate">${[e.role, e.phone, e.email].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}</span></span></button>`)}</div>`}
  </div>`;
}
const PRIVATE_EMP_FIELDS = ["birthDate", "exitDate", "employmentType", "street", "zip", "city", "emergencyContact", "notes"];
function EmployeeSheet({ id, onClose }) {
  const { employees, rt, run, toast, me } = useApp();
  const existing = id ? employees.find((e) => e.id === id) : null;
  const w = rt.canEdit || (existing && me && existing.id === me.id);
  const [f, b, set, setF] = useForm(() => existing ? { ...existing } : { firstName: "", lastName: "", role: "Promoter", phone: "", email: "", street: "", zip: "", city: "", birthDate: "", entryDate: todayISO(), exitDate: "", employmentType: "", emergencyContact: "", notes: "", photoId: "", active: true });
  const canPriv = !!(rt.canEdit || (existing && me && existing.id === me.id));
  const privDoc = useDoc(rt.store, existing ? "data/hr/employee-private/" + existing.id : null, !!(existing && canPriv));
  useEffect(() => { if (privDoc) setF((s) => { const o = { ...s }; PRIVATE_EMP_FIELDS.forEach((k) => { if (privDoc[k] !== undefined) o[k] = privDoc[k]; }); return o; }); }, [privDoc]);
  const [tried, setTried] = useState(false);
  const miss = missing(f, ["firstName", "lastName"]);
  const photo = f.photoId ? [{ id: f.photoId, name: "Foto", type: "image/jpeg" }] : [];
  async function save() {
    setTried(true);
    if (miss.length) { toast("Bitte Vor- und Nachnamen angeben.", "err"); return; }
    const eid = existing ? existing.id : uid();
    const pub = { ...f, updatedAt: Date.now() }, priv = {};
    PRIVATE_EMP_FIELDS.forEach((k) => { priv[k] = f[k] ?? ""; delete pub[k]; });
    const ok = await run(async () => {
      await rt.store.set("employees/" + eid, pub);
      if (canPriv) await rt.store.set("data/hr/employee-private/" + eid, priv);
    }, "Mitarbeiter gespeichert");
    if (ok) onClose();
  }
  const I = (k, label, attrs = {}, req) => html`<${Field} label=${label} req=${req} bad=${tried && req && miss.includes(k)}><input className="inp" ...${b(k)} ...${attrs} /><//>`;
  return html`<${Sheet} wide title=${existing ? fullName(existing) : "Neuer Mitarbeiter"} onClose=${onClose}
    footer=${!w ? null : html`${existing && rt.canEdit ? html`<${DelBtn} onConfirm=${async () => { if (await run(() => rt.store.del("employees/" + existing.id), "Mitarbeiter gelöscht")) onClose(); }} />` : null}
      <span className="flex-1"></span><button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" onClick=${save}>Speichern</button>`}>
    <div className="grid2">
      <div className="span2 row" style=${{ gap: "1rem" }}><${Avatar} emp=${{ ...f, id: existing ? existing.id : "new" }} size=${72} />
        <div className="flex-1"><${Files} scope="employees" label="Foto" accept="image/*" readOnly=${!w} multiple=${false} value=${photo} onChange=${(v) => set("photoId", v[0] ? v[0].id : "")} /></div></div>
      <h3 className="sec span2">Stammdaten</h3>
      ${I("firstName", "Vorname", {}, true)}${I("lastName", "Nachname", {}, true)}
      ${I("role", "Funktion")}${I("entryDate", "Eintritt", { type: "date" })}
      ${canPriv ? html`<${Field} label="Beschäftigungsart"><${Sel} opts=${["Minijob", "Werkstudent", "Teilzeit", "Vollzeit", "Freelancer"]} ...${b("employmentType")} /><//>
      ${I("birthDate", "Geburtsdatum", { type: "date" })}${I("exitDate", "Austritt", { type: "date" })}` : null}
      ${rt.canEdit ? html`<${Field} label="Status" div><${Seg} opts=${[[true, "Aktiv"], [false, "Ausgeschieden"]]} value=${f.active !== false} onChange=${(v) => set("active", v)} /><//>` : null}
      <h3 className="sec span2">Kontakt</h3>
      ${I("phone", "Telefon", { type: "tel" })}${I("email", "E-Mail", { type: "email" })}
      ${canPriv ? html`<${Field} label="Straße & Hausnummer" span><input className="inp" ...${b("street")} /><//>
      ${I("zip", "PLZ", { inputMode: "numeric" })}${I("city", "Ort")}
      <${Field} label="Notfallkontakt" span><input className="inp" ...${b("emergencyContact")} placeholder="Name, Telefon" /><//>
      <${Field} label="Notiz" span><textarea className="inp" ...${b("notes")} /><//>
      <p className="span2 text-xs muted">Adresse, Geburtsdatum, Notfallkontakt und Notiz sehen nur Admins und der Mitarbeiter selbst.</p>` : null}
      ${existing ? html`<${Payroll} empId=${existing.id} />` : html`<p className="span2 text-sm muted">Lohnabrechnungen kannst du nach dem ersten Speichern hochladen.</p>`}
    </div><//>`;
}
function Payroll({ empId }) {
  const { rt, run, toast } = useApp();
  const allowed = rt.canEdit;
  const doc = useDoc(rt.store, "data/hr/payslips/" + empId, allowed);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  if (!allowed) return null;
  const items = (doc && doc.items) || [];
  async function add(files) {
    const added = files.filter((x) => !items.find((i) => i.id === x.id)).map((x) => ({ ...x, month, uploadedAt: Date.now() }));
    if (!added.length) return;
    await run(() => rt.store.set("data/hr/payslips/" + empId, { items: [...items, ...added] }), "Lohnabrechnung gespeichert");
  }
  async function remove(i) { await run(() => rt.store.set("data/hr/payslips/" + empId, { items: items.filter((_, j) => j !== i) }), "Entfernt"); }
  return html`<div className="span2">
    <h3 className="sec">Lohnabrechnungen <span className="muted font-normal text-sm">· nur für Admins sichtbar</span></h3>
    ${doc === undefined ? html`<p className="muted text-sm">Lädt…</p>` : items.length === 0 ? html`<p className="muted text-sm mb-2">Noch keine Abrechnungen hochgeladen.</p>`
      : html`<div className="stack-sm mb-3">${[...items].map((x, i) => [x, i]).sort((a, c) => String(c[0].month).localeCompare(String(a[0].month))).map(([x, i]) => html`<div key=${x.id} className="card p-2.5 row">
        <span className="font-semibold" style=${{ minWidth: "5.5rem" }}>${x.month ? MONTHS[Number(x.month.slice(5, 7)) - 1].slice(0, 3) + " " + x.month.slice(0, 4) : "–"}</span>
        <button type="button" className="flex-1 text-left text-sm underline truncate" style=${{ background: "none", border: 0, color: "inherit", cursor: "pointer" }} onClick=${() => openAsset(rt, x, toast)}>${x.name}</button>
        <button type="button" className="iconbtn" aria-label="Entfernen" onClick=${() => remove(i)}><${Icon} n="trash" s=${15} /></button></div>`)}</div>`}
    <div className="grid2"><${Field} label="Abrechnungsmonat"><input className="inp" type="month" value=${month} onChange=${(e) => setMonth(e.target.value)} /><//>
      <${Files} label="Lohnabrechnung (PDF)" scope="hr" accept="application/pdf,image/*" value=${[]} onChange=${add} /></div>
  </div>`;
}

// ================= Mehr =================
function MoreView({ sub, setSub }) {
  const { rt, venues, partners, employees, reports } = useApp();
  if (sub === "reports") return html`<${ReportsView} onBack=${() => setSub(null)} />`;
  if (sub === "venues") return html`<${VenuesView} onBack=${() => setSub(null)} />`;
  if (sub === "partners") return html`<${PartnersView} onBack=${() => setSub(null)} />`;
  if (sub === "team") return html`<${TeamView} onBack=${() => setSub(null)} />`;
  if (sub === "users" && rt.canEdit) return html`<${UsersView} onBack=${() => setSub(null)} />`;
  if (sub === "backup" && rt.canEdit) return html`<${BackupView} onBack=${() => setSub(null)} />`;
  const tiles = [["reports", "Reporting", "chart", `${reports.length} Tagesberichte`], ["venues", "Venues", "store", `${venues.length} Märkte`], ["partners", "Projektpartner", "briefcase", `${partners.length} Partner`], ["team", "Mitarbeiter", "users", `${employees.length} im Team`],
    ...(rt.canEdit ? [["users", "Zugänge", "lead", "Logins und Rollen"], ["backup", "Datensicherung", "download", "Export und Import"]] : [])];
  return html`<div className="stack">
    <${PageHead} title="Mehr" />
    <div className="grid grid-cols-2 gap-3">${tiles.map(([k, l, ic, s]) => html`<button key=${k} className="listbtn p-4" onClick=${() => setSub(k)}>
      <span className="muted"><${Icon} n=${ic} s=${24} /></span><p className="cond text-lg font-bold mt-2">${l}</p><p className="text-sm muted">${s}</p></button>`)}</div>

  </div>`;
}

// ================= App =================
function SheetHost({ sheet, close }) {
  if (!sheet) return null;
  const p = { ...sheet.props, onClose: close, key: sheet.key };
  switch (sheet.type) {
    case "entry": return html`<${EntrySheet} ...${p} />`;
    case "lead": return html`<${LeadSheet} ...${p} />`;
    case "contract": return html`<${ContractSheet} ...${p} />`;
    case "day": return html`<${DaySheet} ...${p} />`;
    case "deployment": return html`<${DeploymentSheet} ...${p} />`;
    case "depForm": return html`<${DepFormSheet} ...${p} />`;
    case "report": return html`<${ReportSheet} ...${p} />`;
    case "venue": return html`<${VenueSheet} ...${p} />`;
    case "partner": return html`<${PartnerSheet} ...${p} />`;
    case "employee": return html`<${EmployeeSheet} ...${p} />`;
    default: return null;
  }
}

function Main({ rt }) {
  const S = rt.store;
  const cols = { streets: useCol(S, "streets"), leads: useCol(S, "leads"), employees: useCol(S, "employees"), contracts: useCol(S, "contracts"), venues: useCol(S, "venues"), partners: useCol(S, "partners"), deployments: useCol(S, "deployments"), reports: useCol(S, "reports") };
  const loading = Object.values(cols).some((c) => c === null);
  const data = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v || []]));
  const linked = rt.user.employeeId || "";
  const [pickedId, setPickedId] = useState(() => { try { return localStorage.getItem("aussendienst_me_" + rt.user.id) || ""; } catch (e) { return ""; } });
  const meId = linked || pickedId;
  const me = data.employees.find((e) => e.id === meId) || null;
  const chooseMe = useCallback((id) => { setPickedId(id); try { localStorage.setItem("aussendienst_me_" + rt.user.id, id); } catch (e) {} }, [rt.user.id]);
  const [tab, setTabRaw] = useState("d2d");
  const [moreSub, setMoreSub] = useState(null);
  const setTab = useCallback((t, sub) => { setTabRaw(t); if (t === "more") setMoreSub(sub || null); window.scrollTo(0, 0); }, []);
  const [toastMsg, setToastMsg] = useState(null);
  const tRef = useRef(null);
  const toast = useCallback((m, kind) => { setToastMsg({ m, kind }); clearTimeout(tRef.current); tRef.current = setTimeout(() => setToastMsg(null), kind === "err" ? 4500 : 2600); }, []);
  const run = useCallback(async (fn, ok) => { try { await fn(); if (ok) toast(ok); return true; } catch (e) { console.error(e); toast(errMsg(e), "err"); return false; } }, [toast]);
  const [sheet, setSheet] = useState(null);
  const open = useCallback((type, props = {}) => setSheet({ type, props, key: uid() }), []);
  const close = useCallback(() => setSheet(null), []);
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  const empById = useMemo(() => by(data.employees), [cols.employees]);
  const venueById = useMemo(() => by(data.venues), [cols.venues]);
  const partnerById = useMemo(() => by(data.partners), [cols.partners]);
  const streetById = useMemo(() => by(data.streets), [cols.streets]);
  const canWrite = useCallback((col) => rt.canEdit || (rt.user.staffWrite || []).includes(col), [rt]);

  const saveHouse = useCallback(async (street, hn, status, note) => {
    if (!me) { toast("Dein Zugang ist keinem Mitarbeiter zugeordnet.", "err"); return false; }
    const sid = slug(street), hk = slug(hn);
    const prev = streetById[sid] && streetById[sid].entries && streetById[sid].entries[hk];
    const history = prev ? [...(prev.history || []).slice(-19), { status: prev.status, employeeId: prev.employeeId || "", employeeName: prev.employeeName || "", timestamp: prev.timestamp, note: prev.note || "" }] : [];
    const entry = { houseNumber: hn, status, employeeId: me.id, employeeName: fullName(me), timestamp: Date.now(), note: note || "", history };
    const patch = { entries: { [hk]: entry } };
    if (!streetById[sid]) patch.name = street;
    const ok = await run(() => S.update("streets/" + sid, patch, { create: true }));
    if (ok) toast(`${STATUS[status].label} gespeichert: ${street} ${hn}`);
    return ok;
  }, [me, streetById, S, run, toast]);
  const deleteHouse = useCallback((sid, hk) => run(() => S.update("streets/" + sid, { entries: { [hk]: null } }), "Eintrag gelöscht"), [S, run]);

  const now = useNow(30000);
  const dueMine = data.leads.filter((l) => leadDue(l, now) && (!me || l.assignedTo === me.id));
  const notified = useRef(new Set());
  useEffect(() => {
    if (loading) return;
    const fresh = dueMine.filter((l) => !notified.current.has(l.id));
    fresh.forEach((l) => notified.current.add(l.id));
    const recent = fresh.filter((l) => now - new Date(l.callAt) < 15 * 60000);
    if (recent.length) toast(`Rückruf fällig: ${recent[0].firstName} ${recent[0].lastName}${recent.length > 1 ? ` (+${recent.length - 1})` : ""}`, "bell");
  }, [dueMine.map((l) => l.id).join(","), loading]);

  const ctx = { rt, ...data, me, chooseMe, setTab, toast, run, open, empById, venueById, partnerById, saveHouse, deleteHouse, canWrite };
  const TABS = [["d2d", "Straße", "pin"], ["leads", "Leads", "lead"], ["contracts", "Verträge", "file"], ["plan", "Planung", "cal"], ["more", "Mehr", "more"]];
  return html`<${Ctx.Provider} value=${ctx}>
    <header className="topbar"><div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="cond font-bold text-lg leading-tight truncate">Außendienst-Cockpit</p>
        <p className="text-xs truncate" style=${{ color: "var(--header-muted)" }}>${me ? fullName(me) : rt.user.name}${rt.canEdit ? " · Admin" : ""}</p></div>
      <div className="flex items-center gap-2 shrink-0">
        ${!linked && rt.canEdit && data.employees.length ? html`<div className="relative">
          <select value=${pickedId} onChange=${(e) => chooseMe(e.target.value)} aria-label="Einträge erfassen für">
            <option value="">Erfassen für …</option>${data.employees.filter((e) => e.active !== false || e.id === pickedId).map((e) => html`<option key=${e.id} value=${e.id}>${fullName(e)}</option>`)}</select>
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style=${{ fontSize: 10 }}>▼</span></div>` : null}
        <button className="iconbtn" style=${{ background: "#2a3642", borderRadius: 999, width: 38, height: 38 }} onClick=${() => open("account")} aria-label="Konto und Abmelden">
          ${me ? html`<${Avatar} emp=${me} size=${30} />` : html`<span className="text-sm font-bold">${initials(rt.user.name)}</span>`}</button>
      </div>
    </div></header>
    <main className="max-w-3xl mx-auto px-4 pt-4" style=${{ paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>
      ${loading ? html`<div className="boot" style=${{ minHeight: "50vh" }}><div className="spinner"></div></div>`
        : tab === "d2d" ? html`<${D2DView} />` : tab === "leads" ? html`<${LeadsView} />` : tab === "contracts" ? html`<${ContractsView} />`
        : tab === "plan" ? html`<${PlanningView} />` : html`<${MoreView} sub=${moreSub} setSub=${setMoreSub} />`}
    </main>
    <nav className="tabbar" aria-label="Bereiche"><div className="max-w-3xl mx-auto grid grid-cols-5">
      ${TABS.map(([k, l, ic]) => html`<button key=${k} className=${"tab" + (tab === k ? " on" : "")} onClick=${() => setTab(k)} aria-current=${tab === k ? "page" : undefined}>
        <${Icon} n=${ic} s=${21} w=${tab === k ? 2.4 : 1.9} />${l}${k === "leads" && dueMine.length ? html`<span className="badge">${dueMine.length}</span>` : null}</button>`)}
    </div></nav>
    ${toastMsg ? html`<div className=${"toast " + (toastMsg.kind || "")} role="status">${toastMsg.m}</div>` : null}
    ${sheet && sheet.type === "account" ? html`<${AccountSheet} key=${sheet.key} onClose=${close} />` : html`<${SheetHost} sheet=${sheet} close=${close} />`}
  <//>`;
}

// ================= Konto, Zugänge, Datensicherung =================
function AccountSheet({ onClose }) {
  const { rt, toast, me } = useApp();
  const [f, b, , setF] = useForm({ old: "", new1: "", new2: "" });
  const [busy, setBusy] = useState(false);
  async function change() {
    if (f.new1.length < 10) { toast("Das neue Passwort braucht mindestens 10 Zeichen.", "err"); return; }
    if (f.new1 !== f.new2) { toast("Die neuen Passwörter stimmen nicht überein.", "err"); return; }
    setBusy(true);
    try {
      const { error: e1 } = await sb.auth.signInWithPassword({ email: rt.user.email, password: f.old });
      if (e1) throw { code: "bad", message: "Das aktuelle Passwort stimmt nicht." };
      const { error: e2 } = await sb.auth.updateUser({ password: f.new1 });
      if (e2) throw { code: "bad", message: /weak|short|least/i.test(e2.message) ? "Das Passwort ist zu schwach." : "Passwort konnte nicht geändert werden." };
      toast("Passwort geändert"); setF({ old: "", new1: "", new2: "" });
    } catch (e) { toast(errMsg(e), "err"); }
    setBusy(false);
  }
  return html`<${Sheet} title="Dein Konto" onClose=${onClose} footer=${html`<button className="btn" onClick=${rt.logout}><${Icon} n="back" s=${15} />Abmelden</button>`}>
    <div className="stack">
      <div className="row"><${Avatar} emp=${me} size=${44} /><div><p className="font-bold">${rt.user.name}</p><p className="text-sm muted">${rt.user.email} · ${rt.canEdit ? "Admin" : "Mitarbeiter"}</p></div></div>
      <div className="grid2">
        <h3 className="sec span2">Passwort ändern</h3>
        <${Field} label="Aktuelles Passwort" span><input className="inp" type="password" autoComplete="current-password" ...${b("old")} /><//>
        <${Field} label="Neues Passwort" hint="Mindestens 10 Zeichen"><input className="inp" type="password" autoComplete="new-password" ...${b("new1")} /><//>
        <${Field} label="Neues Passwort wiederholen"><input className="inp" type="password" autoComplete="new-password" ...${b("new2")} /><//>
        <div className="span2"><button className="btn btn-primary" disabled=${busy || !f.old || !f.new1} onClick=${change}>Passwort ändern</button></div>
      </div>
      <p className="text-xs muted">Version ${rt.user.version}</p>
    </div><//>`;
}

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(14); crypto.getRandomValues(a);
  return Array.from(a, (x) => chars[x % chars.length]).join("");
}

function UsersView({ onBack }) {
  const { employees, empById, toast, rt } = useApp();
  const [users, setUsers] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.from("profiles").select("*").order("name");
    if (error) { toast(errMsg(toErr(error)), "err"); setUsers([]); return; }
    setUsers(data.map((p) => ({ id: p.user_id, email: p.email, name: p.name, role: p.role, employeeId: p.employee_id, active: p.active, lastLogin: p.last_login ? Date.parse(p.last_login) : null })));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Zugänge" sub="Logins, Rollen und Verknüpfung mit Mitarbeitern" action=${html`<button className="btn btn-primary" onClick=${() => setEdit({})}><${Icon} n="plus" s=${16} />Zugang</button>`} />
    <p className="text-sm muted">Admins sehen und bearbeiten alles, inklusive Lohnabrechnungen. Mitarbeiter erfassen Straßen, Leads, eigene Verträge und eigene Reports.</p>
    ${users === null ? html`<div className="boot" style=${{ minHeight: "20vh" }}><div className="spinner"></div></div>`
      : html`<div className="stack-sm">${users.map((u) => html`<button key=${u.id} className="listbtn row" onClick=${() => setEdit(u)} style=${{ opacity: u.active ? 1 : 0.55 }}>
        <${Avatar} emp=${empById[u.employeeId]} size=${36} /><span className="flex-1 min-w-0"><span className="font-bold block truncate">${u.name}${u.id === rt.user.id ? " (du)" : ""}</span>
        <span className="text-sm muted block truncate">${u.email} · ${u.role === "admin" ? "Admin" : "Mitarbeiter"}${u.employeeId ? ` · ${fullName(empById[u.employeeId])}` : " · nicht verknüpft"}${u.active ? "" : " · gesperrt"}</span></span></button>`)}</div>`}
    ${edit ? html`<${UserSheet} user=${edit} users=${users || []} employees=${employees} onClose=${() => setEdit(null)} onSaved=${() => { setEdit(null); load(); }} />` : null}
  </div>`;
}
function UserSheet({ user, users, employees, onClose, onSaved }) {
  const { toast, rt } = useApp();
  const isNew = !user.id;
  const [f, b, set] = useForm(() => ({ name: user.name || "", email: user.email || "", role: user.role || "staff", employeeId: user.employeeId || "", active: user.active !== false, password: isNew ? genPassword() : "" }));
  const [busy, setBusy] = useState(false);
  const taken = new Set(users.filter((u) => u.id !== user.id && u.employeeId).map((u) => u.employeeId));
  async function save() {
    setBusy(true);
    try {
      const { data, error } = await sb.functions.invoke("admin-users", { body: { action: isNew ? "create" : "update", id: user.id, ...f } });
      if (error) { let m = ""; try { const j = await error.context.json(); m = j.message; } catch (x) {} throw { code: "bad", message: m || "Speichern fehlgeschlagen." }; }
      if (data && data.error) throw { code: "bad", message: data.message };
      toast(isNew ? "Zugang angelegt" : "Zugang gespeichert");
      onSaved();
    } catch (e) { toast(errMsg(e), "err"); }
    setBusy(false);
  }
  const pickEmp = (id) => { set("employeeId", id); const e = employees.find((x) => x.id === id); if (e) { if (!f.name) set("name", fullName(e)); if (!f.email && e.email) set("email", e.email); } };
  return html`<${Sheet} title=${isNew ? "Neuer Zugang" : user.name} onClose=${onClose}
    footer=${html`<button className="btn" onClick=${onClose}>Abbrechen</button><button className="btn btn-primary" disabled=${busy} onClick=${save}>${isNew ? "Zugang anlegen" : "Speichern"}</button>`}>
    <div className="grid2">
      <${Field} label="Mitarbeiter" span hint="Einträge dieses Logins werden dem Mitarbeiter zugeordnet."><${Sel} placeholder="Nicht verknüpft" opts=${employees.filter((e) => !taken.has(e.id)).map((e) => [e.id, fullName(e)])} value=${f.employeeId} onChange=${(e) => pickEmp(e.target.value)} /><//>
      <${Field} label="Name" req><input className="inp" ...${b("name")} /><//>
      <${Field} label="E-Mail (Login)" req><input className="inp" type="email" disabled=${!isNew} ...${b("email")} /><//>
      <${Field} label="Rolle" div><${Seg} opts=${[["staff", "Mitarbeiter"], ["admin", "Admin"]]} value=${f.role} onChange=${(v) => set("role", v)} /><//>
      ${!isNew ? html`<${Field} label="Status" div><${Seg} opts=${[[true, "Aktiv"], [false, "Gesperrt"]]} value=${f.active} onChange=${(v) => set("active", v)} /><//>` : null}
      <${Field} label=${isNew ? "Start-Passwort" : "Neues Passwort (optional)"} span hint=${isNew ? "Notieren und persönlich übergeben. Der Mitarbeiter kann es danach unter „Dein Konto“ ändern." : "Leer lassen, um das Passwort nicht zu ändern."}>
        <div className="row"><input className="inp" ...${b("password")} autoComplete="off" spellCheck=${false} /><button type="button" className="btn btn-sm" onClick=${() => set("password", genPassword())}>Neu</button></div><//>
      ${user.lastLogin ? html`<p className="span2 text-xs muted">Letzte Anmeldung: ${fmtTS(user.lastLogin)}</p>` : null}
    </div><//>`;
}

function BackupView({ onBack }) {
  const { rt, toast } = useApp();
  const [busy, setBusy] = useState("");
  const fileRef = useRef(null);
  async function doExport() {
    setBusy("export");
    try {
      const rows = await fetchAll(() => sb.from("docs").select("col,id,data").order("col").order("id"));
      const j = { app: "aussendienst-cockpit", version: rt.user.version, exportedAt: new Date().toISOString(), docs: rows };
      await saveFile(rt, `aussendienst-sicherung-${todayISO()}.json`, JSON.stringify(j), "application/json"); toast(`${rows.length} Datensätze exportiert`);
    }
    catch (e) { toast(errMsg(e), "err"); }
    setBusy("");
  }
  async function doImport(e) {
    const file = e.target.files && e.target.files[0]; e.target.value = "";
    if (!file) return;
    let j;
    try { j = JSON.parse(await file.text()); } catch (err) { toast("Die Datei ist kein gültiges JSON.", "err"); return; }
    const docs = Array.isArray(j.docs) ? j.docs.filter((d) => d && d.col && d.id && d.data) : [];
    if (!docs.length) { toast("Keine Datensätze in der Datei gefunden.", "err"); return; }
    setBusy("import");
    let n = 0;
    try {
      for (let i = 0; i < docs.length; i += 500) {
        const chunk = docs.slice(i, i + 500).map((d) => ({ col: d.col, id: d.id, data: d.data }));
        const { error } = await sb.from("docs").upsert(chunk);
        if (error) throw toErr(error);
        n += chunk.length;
      }
      toast(`${n} Datensätze importiert. Seite lädt neu …`);
      setTimeout(() => location.reload(), 1500);
    } catch (err) { toast(errMsg(err), "err"); }
    setBusy("");
  }
  return html`<div className="stack">
    <${PageHead} onBack=${onBack} title="Datensicherung" sub="Alle Datensätze als JSON sichern oder übernehmen" />
    <div className="card p-4 stack-sm"><p className="font-bold">Export</p><p className="text-sm muted">Enthält alle Datensätze inklusive Verträge und Lohnabrechnungs-Verweise. Hochgeladene Dateien (Fotos, PDFs) liegen im Supabase-Speicher und sind nicht Teil dieser Datei.</p>
      <div><button className="btn btn-primary" disabled=${!!busy} onClick=${doExport}><${Icon} n="download" s=${16} />${busy === "export" ? "Exportiert …" : "Sicherung herunterladen"}</button></div></div>
    <div className="card p-4 stack-sm"><p className="font-bold">Import</p><p className="text-sm muted">Übernimmt eine Sicherung. Vorhandene Datensätze mit gleicher ID werden überschrieben, alle anderen bleiben erhalten.</p>
      <div><button className="btn" disabled=${!!busy} onClick=${() => fileRef.current && fileRef.current.click()}><${Icon} n="upload" s=${16} />${busy === "import" ? "Importiert …" : "Sicherung einspielen"}</button></div>
      <input ref=${fileRef} type="file" accept="application/json,.json" hidden onChange=${doImport} /></div>
  </div>`;
}

function Login({ onDone }) {
  const [f, b] = useForm({ email: "", password: "", name: "" });
  const [mode, setMode] = useState("login");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { sb.rpc("needs_setup").then(({ data }) => { if (data === true) setMode("setup"); }); }, []);
  async function submit(e) {
    e.preventDefault(); setErr(""); setInfo(""); setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
        if (error) throw { message: /confirm/i.test(error.message) ? "Bitte zuerst die Bestätigungs-Mail öffnen." : /fetch/i.test(error.message) ? "Keine Verbindung zum Server." : "E-Mail oder Passwort falsch." };
        onDone();
      } else if (mode === "setup") {
        if (f.password.length < 10) throw { message: "Das Passwort braucht mindestens 10 Zeichen." };
        const { data, error } = await sb.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: { name: f.name.trim() }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw { message: error.message };
        if (data.session) onDone(); else { setInfo("Konto angelegt. Bitte die Bestätigungs-Mail öffnen und danach hier anmelden."); setMode("login"); }
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(f.email.trim(), { redirectTo: location.origin + location.pathname });
        if (error) throw { message: "Zurücksetzen gerade nicht möglich. Bitte später erneut versuchen oder einen Admin fragen." };
        setInfo("Falls die Adresse bekannt ist, kommt gleich eine E-Mail mit einem Link."); setMode("login");
      }
    } catch (x) { setErr(x.message || "Anmeldung fehlgeschlagen."); }
    setBusy(false);
  }
  const title = mode === "setup" ? "Ersten Admin anlegen" : mode === "reset" ? "Passwort zurücksetzen" : "Mit deinem Firmen-Login anmelden.";
  return html`<div className="boot" style=${{ padding: "1.5rem" }}>
    <form className="card p-6 w-full" style=${{ maxWidth: 380 }} onSubmit=${submit}>
      <div className="flex items-center gap-2 mb-1"><span className="plate"><span>Außendienst-Cockpit</span></span></div>
      <p className="muted text-sm mb-5">${title}</p>
      <div className="stack-sm">
        ${mode === "setup" ? html`<${Field} label="Name"><input className="inp" required ...${b("name")} /><//>` : null}
        <${Field} label="E-Mail"><input className="inp" type="email" autoComplete="username" inputMode="email" required ...${b("email")} /><//>
        ${mode !== "reset" ? html`<${Field} label="Passwort" hint=${mode === "setup" ? "Mindestens 10 Zeichen" : ""}><input className="inp" type="password" autoComplete=${mode === "setup" ? "new-password" : "current-password"} required ...${b("password")} /><//>` : null}
      </div>
      ${err ? html`<p className="text-sm mt-3" style=${{ color: "var(--no)" }} role="alert">${err}</p>` : null}
      ${info ? html`<p className="text-sm mt-3" role="status">${info}</p>` : null}
      <button className="btn btn-primary w-full mt-5" type="submit" disabled=${busy}>${busy ? "Bitte warten …" : mode === "setup" ? "Admin anlegen" : mode === "reset" ? "Link senden" : "Anmelden"}</button>
      ${mode === "login" ? html`<button type="button" className="btn btn-sm w-full mt-2" style=${{ border: 0 }} onClick=${() => setMode("reset")}>Passwort vergessen?</button>` : null}
      ${mode === "reset" ? html`<button type="button" className="btn btn-sm w-full mt-2" style=${{ border: 0 }} onClick=${() => setMode("login")}>Zurück zur Anmeldung</button>` : null}
    </form></div>`;
}

function NewPassword({ onDone }) {
  const [f, b] = useForm({ p1: "", p2: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault(); setErr("");
    if (f.p1.length < 10) { setErr("Mindestens 10 Zeichen."); return; }
    if (f.p1 !== f.p2) { setErr("Die Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: f.p1 });
    setBusy(false);
    if (error) setErr("Passwort konnte nicht gesetzt werden. Link ggf. abgelaufen."); else onDone();
  }
  return html`<div className="boot" style=${{ padding: "1.5rem" }}>
    <form className="card p-6 w-full" style=${{ maxWidth: 380 }} onSubmit=${submit}>
      <p className="font-bold mb-4">Neues Passwort festlegen</p>
      <div className="stack-sm">
        <${Field} label="Neues Passwort" hint="Mindestens 10 Zeichen"><input className="inp" type="password" autoComplete="new-password" required ...${b("p1")} /><//>
        <${Field} label="Wiederholen"><input className="inp" type="password" autoComplete="new-password" required ...${b("p2")} /><//>
      </div>
      ${err ? html`<p className="text-sm mt-3" style=${{ color: "var(--no)" }} role="alert">${err}</p>` : null}
      <button className="btn btn-primary w-full mt-5" type="submit" disabled=${busy}>Passwort speichern</button>
    </form></div>`;
}

function App() {
  const [s, setS] = useState({ state: "loading" });
  const loadProfile = useCallback(async () => {
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { setS({ state: "out" }); return; }
    const { data, error } = await sb.rpc("get_my_profile");
    if (error) { setS({ state: "error", err: { message: /fetch/i.test(error.message) ? "Keine Verbindung zum Server." : error.message } }); return; }
    if (!data || !data.active) { setS({ state: "inactive", email: sess.session.user.email }); return; }
    setS({ state: "in", user: data });
  }, []);
  useEffect(() => {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) { setS({ state: "error", err: { code: "not_configured" } }); return undefined; }
    loadProfile();
    const { data: sub } = sb.auth.onAuthStateChange((ev) => {
      if (ev === "PASSWORD_RECOVERY") setS({ state: "recovery" });
      else if (ev === "SIGNED_OUT") setS({ state: "out" });
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);
  const userId = s.user ? s.user.id : null;
  const store = useMemo(() => (userId ? sbStore() : null), [userId]);
  const logout = useCallback(async () => { try { await sb.auth.signOut(); } catch (e) {} setS({ state: "out" }); }, []);
  if (s.state === "loading") return html`<div className="boot"><div className="spinner"></div><p className="muted">App wird geladen…</p></div>`;
  if (s.state === "out") return html`<${Login} onDone=${loadProfile} />`;
  if (s.state === "recovery") return html`<${NewPassword} onDone=${loadProfile} />`;
  if (s.state === "inactive") return html`<div className="boot" style=${{ padding: "1.5rem", textAlign: "center" }}>
    <p className="font-bold">Zugang noch nicht freigeschaltet</p>
    <p className="muted text-sm" style=${{ maxWidth: 420 }}>Das Konto ${s.email} ist angelegt, aber noch nicht freigegeben. Ein Admin muss es unter Mehr › Zugänge aktivieren.</p>
    <button className="btn" onClick=${logout}>Abmelden</button></div>`;
  if (s.state === "error") return html`<div className="boot" style=${{ padding: "1.5rem", textAlign: "center" }}>
    <p className="font-bold">${s.err.code === "not_configured" ? "App noch nicht konfiguriert" : "Server nicht erreichbar"}</p>
    <p className="muted text-sm" style=${{ maxWidth: 420 }}>${s.err.code === "not_configured" ? "In assets/config.js fehlen Supabase-URL und Schlüssel." : s.err.message || "Bitte Verbindung prüfen."}</p>
    <button className="btn" onClick=${loadProfile}>Erneut versuchen</button></div>`;
  const rt = { store, mode: "supabase", assets: sbAssets, downloads: null, canEdit: s.user.role === "admin", user: s.user, logout };
  return html`<${Main} key=${s.user.id} rt=${rt} />`;
}
ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
