"use strict";
const { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } = React;
const html = htm.bind(React.createElement);

// ---------------- constants ----------------
const STATUS = {
  success:  { label: "Abschluss",         short: "Abschluss", color: "var(--ok)", icon: "check" },
  not_home: { label: "Nicht angetroffen", short: "Nicht da",  color: "var(--nh)", icon: "home" },
  rejected: { label: "Ablehnung",         short: "Ablehnung", color: "var(--no)", icon: "x" },
};
const TYPES = {
  LEH:   { label: "LEH",   color: "var(--leh)" },
  MESSE: { label: "Messe", color: "var(--messe)" },
  EVENT: { label: "Event", color: "var(--event)" },
};
const CHAINS = ["REWE", "EDEKA", "Marktkauf", "Kaufland", "HIT", "Sonstige"];
const LEAD_REASONS = ["Angebot", "Datenvervollständigung"];
const C = {
  actionTypes: ["Außendienst", "Promotion (Märkte & Events)", "Euregio Messe"],
  orderTypes: ["Strom", "Gas"],
  tariffs: ["STROM Aktionsheld", "STROM Alltagsheld", "STROM Heimatheld", "GAS Aktionsheld", "GAS Alltagsheld", "GAS Heimatheld", "Wärmepumpe"],
  customerTypes: ["Privatkunde Akquise oder Re-Akquise (C7)", "Privatkunde Kundenbindung (C12)", "Privatkunde Kündigungsabwehr (12)"],
  bonuses: ["Kein Bonus", "Bonus 100€", "Wärmepumpe 50€"],
  salutations: ["Frau", "Herr", "Firma", "Keine"],
  payment: ["Lastschrift", "Überweisung", "Lastschrift (Bankverbindung liegt vor)"],
};
const PAL = ["#1d6fa3", "#8a4fb3", "#b0375e", "#1b8a86", "#6b7d1c", "#c2601a", "#4b5bb8", "#7a5a3a"];
const WD = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WD_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// ---------------- helpers ----------------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoDay(new Date());
const parseDay = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return isoDay(d); };
const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5) + 1;
const fmtDay = (s) => s ? parseDay(s).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
const fmtDayShort = (s) => s ? parseDay(s).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "";
const fmtCall = (s) => {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";
};
function fmtTS(ts) {
  const d = new Date(ts), now = new Date();
  const t = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return "Heute, " + t;
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) + ", " + t;
}
const eur = (n) => (n === null || n === undefined || n === "" || isNaN(Number(n))) ? "–" : Number(n).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fullName = (e) => e ? (`${e.firstName || ""} ${e.lastName || ""}`.trim() || "Ohne Namen") : "Unbekannt";
const initials = (n) => (n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const hashColor = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0; return PAL[Math.abs(h) % PAL.length]; };
const maskIban = (s) => { const t = String(s || "").replace(/\s/g, ""); return t.length > 6 ? t.slice(0, 2) + "•• •••• " + t.slice(-4) : t; };
const lc = (s) => String(s || "").toLocaleLowerCase("de");
function slug(s) {
  const out = lc(s).trim()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/str\.(\s|$)/g, "strasse$1")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (out || "x").slice(0, 150);
}
function compareHN(a, b) {
  const p = (h) => { const m = String(h).trim().match(/^(\d+)\s*(.*)$/); return m ? [parseInt(m[1], 10), lc(m[2])] : [1e9, lc(h)]; };
  const [na, sa] = p(a), [nb, sb] = p(b);
  return na !== nb ? na - nb : sa.localeCompare(sb, "de");
}
const toCSV = (rows) => "\uFEFF" + rows.map((r) => r.map((f) => `"${String(f ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
function parseCSV(text) {
  text = String(text).replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (c !== "\r") f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
function netHours(r) {
  const m = (t) => { if (!t) return null; const [h, mi] = t.split(":").map(Number); return h * 60 + mi; };
  const s = m(r.workStart), e = m(r.workEnd), ps = m(r.breakStart), pe = m(r.breakEnd);
  if (s === null || e === null) return null;
  let mins = e - s; if (ps !== null && pe !== null && pe > ps) mins -= (pe - ps);
  return mins > 0 ? mins / 60 : null;
}
const hoursLabel = (h) => h === null ? "–" : `${Math.floor(h)}:${pad(Math.round((h % 1) * 60))} h`;
function missing(f, keys) {
  return keys.filter((k) => { const v = f[k]; return v === null || v === undefined || (Array.isArray(v) ? v.length === 0 : String(v).trim() === ""); });
}
function errMsg(e) {
  const c = e && e.code;
  if (e && e.message && typeof e.message === "string" && !["server_error", "forbidden", "network"].includes(e.code)) return e.message;
  return ({
    forbidden: "Keine Berechtigung für diese Aktion.",
    network: "Keine Verbindung zum Server. Netz prüfen und erneut versuchen.",
    unauthenticated: "Sitzung abgelaufen. Bitte neu anmelden.",
    not_found: "Der Datensatz existiert nicht mehr.",
    too_large: "Datensatz ist zu groß.",
        invalid_argument: "Keine Schreibrechte für diesen Bereich oder ungültige Daten.",
    resource_exhausted: "Zu viele Änderungen auf einmal. Kurz warten und erneut speichern.",
    revoked: "Zugriff wurde entzogen. Seite neu laden.",
    not_granted: "Speichern ist in dieser Ansicht nicht erlaubt.",
  })[c] || "Speichern fehlgeschlagen. Verbindung prüfen und erneut versuchen.";
}
function uploadErr(e, name) {
  const c = e && e.code;
  const why = ({ too_large: "zu groß (max. 20 MB)", unsupported_type: "Dateityp nicht unterstützt (JPG, PNG, GIF, WEBP, PDF)", forbidden: "keine Berechtigung", network: "keine Verbindung zum Server", unauthenticated: "Sitzung abgelaufen" })[c] || "Upload fehlgeschlagen";
  return `${name}: ${why}`;
}
function mimeOf(f) {
  const ok = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
  if (ok.includes(f.type)) return f.type;
  const ext = (f.name.split(".").pop() || "").toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", pdf: "application/pdf" })[ext] || f.type || "application/octet-stream";
}
const clean = (d) => { const o = JSON.parse(JSON.stringify(d || {})); delete o.id; return o; };

// ---------------- Supabase ----------------
const CFG = window.ADC_CONFIG || {};
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const BUCKET = "files";
const splitPath = (p) => { const parts = p.split("/"); const id = parts.pop(); return [parts.join("/"), id]; };
function toErr(error) {
  if (!error) return null;
  const msg = String(error.message || "");
  if (error.code === "42501" || /row-level security|permission denied/i.test(msg)) return { code: "forbidden", message: "" };
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return { code: "network", message: "" };
  if (error.code === "P0002") return { code: "not_found", message: msg };
  if (/JWT|not authenticated|Auth session missing/i.test(msg)) return { code: "unauthenticated", message: "" };
  return { code: error.code || "server_error", message: "" };
}
async function fetchAll(query) {
  const out = []; const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await query().range(from, from + page - 1);
    if (error) throw toErr(error);
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}
function sbStore() {
  const cols = new Map();
  function load(col) {
    const L = cols.get(col);
    if (!L) return;
    const seq = ++L.seq;
    fetchAll(() => sb.from("docs").select("id,data").eq("col", col).order("id"))
      .then((rows) => { if (seq !== L.seq || !cols.has(col)) return; L.last = rows.map((r) => ({ id: r.id, ...r.data })); L.cbs.forEach((cb) => cb(L.last)); })
      .catch(() => { if (seq !== L.seq) return; if (L.last === undefined) { L.last = []; L.cbs.forEach((cb) => cb(L.last)); } });
  }
  function schedule(col, ms = 250) { const L = cols.get(col); if (!L) return; clearTimeout(L.deb); L.deb = setTimeout(() => load(col), ms); }
  function subscribe(col, cb) {
    let L = cols.get(col);
    if (!L) {
      L = { cbs: new Set([cb]), seq: 0, last: undefined, deb: null, timer: null, channel: null };
      cols.set(col, L);
      L.channel = sb.channel("docs:" + col + ":" + uid())
        .on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: "col=eq." + col }, () => schedule(col))
        .subscribe();
      L.timer = setInterval(() => { if (!document.hidden) load(col); }, 60000);
      load(col);
    } else { L.cbs.add(cb); if (L.last !== undefined) setTimeout(() => cb(L.last), 0); }
    return () => {
      L.cbs.delete(cb);
      if (!L.cbs.size) { clearTimeout(L.deb); clearInterval(L.timer); L.seq++; if (L.channel) sb.removeChannel(L.channel); cols.delete(col); }
    };
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) cols.forEach((_, c) => schedule(c, 50)); });
  const after = (p) => schedule(splitPath(p)[0], 50);
  return {
    kind: "supabase",
    sub: (col, cb) => subscribe(col, cb),
    subDoc(p, cb) { const [col, id] = splitPath(p); return subscribe(col, (rows) => cb(rows.find((r) => r.id === id) || null)); },
    async get(p) { const [col, id] = splitPath(p); const { data, error } = await sb.from("docs").select("id,data").eq("col", col).eq("id", id).maybeSingle(); if (error) throw toErr(error); return data ? { id: data.id, ...data.data } : null; },
    async set(p, d) { const [col, id] = splitPath(p); const { error } = await sb.from("docs").upsert({ col, id, data: clean(d) }); if (error) throw toErr(error); after(p); },
    async update(p, d, opts = {}) { const [col, id] = splitPath(p); const { error } = await sb.rpc("doc_merge", { p_col: col, p_id: id, p_patch: JSON.parse(JSON.stringify(d)), p_create: !!opts.create }); if (error) throw toErr(error); after(p); },
    async del(p) { const [col, id] = splitPath(p); const { data, error } = await sb.from("docs").delete().eq("col", col).eq("id", id).select("id"); if (error) throw toErr(error); if (!data || !data.length) throw { code: "forbidden", message: "" }; after(p); },
  };
}
const sbAssets = {
  async upload(file, opts = {}) {
    const ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
    const path = `${opts.scope || "app"}/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: opts.type || file.type, upsert: false });
    if (error) {
      const m = String(error.message || "");
      if (/size|too large|exceeded/i.test(m)) throw { code: "too_large" };
      if (/mime|type/i.test(m)) throw { code: "unsupported_type" };
      throw toErr(error) || { code: "upload_failed" };
    }
    return { id: path, contentType: opts.type || file.type, sizeBytes: file.size };
  },
};
const urlCache = new Map();
async function signedUrl(path) {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error || !data) return "";
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300 * 1000 });
  return data.signedUrl;
}
function BlobImg({ id, className, style, alt = "" }) {
  const [src, setSrc] = useState(() => { const c = urlCache.get(id); return c && c.exp > Date.now() ? c.url : ""; });
  useEffect(() => { let alive = true; if (id) signedUrl(id).then((u) => { if (alive) setSrc(u); }); return () => { alive = false; }; }, [id]);
  return src ? html`<img className=${className} style=${style} src=${src} alt=${alt} />` : html`<span className=${className} style=${{ ...style, display: "inline-block", background: "var(--soft)" }}></span>`;
}

function useCol(store, col, enabled = true) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    if (!store || !enabled) return undefined;
    return store.sub(col, setRows, () => setRows((r) => r || []));
  }, [store, col, enabled]);
  return rows;
}
function useDoc(store, path, enabled = true) {
  const [doc, setDoc] = useState(undefined);
  useEffect(() => {
    if (!store || !enabled || !path) return undefined;
    return store.subDoc(path, setDoc, () => setDoc(null));
  }, [store, path, enabled]);
  return doc;
}
function useNow(ms) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

async function saveFile(rt, filename, data, mime) {
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch (e) { return false; }
}
async function openAsset(rt, file, toast) {
  try {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(file.id);
    if (error || !blob) throw new Error("download");
    const ok = await saveFile(rt, file.name || ("datei-" + file.id), blob, file.type);
    if (!ok) toast("Download abgebrochen.");
  } catch (e) { toast("Datei konnte nicht geladen werden.", "err"); }
}

// ---------------- icons ----------------
const P = {
  check: "M20 6 9 17l-5-5", x: "M18 6 6 18M6 6l12 12",
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
  lead: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M19 8v6", "M16 11h6"],
  pencil: "M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z", plus: "M12 5v14M5 12h14",
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  download: ["M12 3v12", "M7 10l5 5 5-5", "M5 21h14"], upload: ["M12 21V9", "M7 14l5-5 5 5", "M5 3h14"],
  pin: ["M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13z", "M12 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  file: ["M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z", "M14 3v5h5"],
  cal: ["M4 5h16v16H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z",
  mail: ["M3 5h18v14H3z", "M3 6l9 7 9-7"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  bell: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.9 1.9 0 0 0 3.4 0"],
  chart: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  building: ["M4 21V3h11v18", "M15 9h5v12", "M8 7h3M8 11h3M8 15h3", "M2 21h20"],
  store: ["M3 9l1.5-5h15L21 9", "M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z", "M5 12v9h14v-9"],
  briefcase: ["M3 7h18v13H3z", "M8 7V4h8v3", "M3 13h18"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  left: "M15 18l-6-6 6-6", right: "M9 18l6-6-6-6", back: "M19 12H5M12 19l-7-7 7-7",
  camera: ["M4 7h3l2-3h6l2 3h3v13H4z", "M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"],
};
function Icon({ n, s = 18, c = "", w = 2 }) {
  const d = [].concat(P[n] || []);
  return html`<svg width=${s} height=${s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth=${w} strokeLinecap="round" strokeLinejoin="round" className=${c} aria-hidden="true">${d.map((x, i) => html`<path key=${i} d=${x} />`)}</svg>`;
}

// ---------------- context & UI primitives ----------------
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

function useForm(init) {
  const [f, setF] = useState(init);
  const b = (k) => ({ value: f[k] ?? "", onChange: (e) => { const v = e.target.value; setF((s) => ({ ...s, [k]: v })); } });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  return [f, b, set, setF];
}

function Field({ label, req, hint, span, div, bad, children }) {
  const Tag = div ? "div" : "label";
  return html`<${Tag} className=${"fld" + (span ? " span2" : "")}><span className="lbl">${label}${req ? html`<b className="req"> *</b>` : null}</span>${children}${bad ? html`<span className="hint" style=${{ color: "var(--no)" }}>Pflichtfeld</span>` : hint ? html`<span className="hint">${hint}</span>` : null}<//>`;
}
function Sel({ opts, placeholder = "Bitte auswählen", ...p }) {
  return html`<select className="inp" ...${p}>
    ${placeholder !== null ? html`<option value="">${placeholder}</option>` : null}
    ${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return html`<option key=${String(v)} value=${v}>${l}</option>`; })}
  </select>`;
}
function Seg({ opts, value, onChange }) {
  return html`<div className="seg" role="radiogroup">
    ${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; const on = value === v;
      return html`<button type="button" key=${String(v)} role="radio" aria-checked=${on} className=${on ? "on" : ""} onClick=${() => onChange(v)}>${l}</button>`; })}
  </div>`;
}
function Sheet({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return html`<div className="overlay" onClick=${onClose}>
    <div className=${"sheet" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label=${typeof title === "string" ? title : "Dialog"} onClick=${(e) => e.stopPropagation()}>
      <div className="sheet-head"><h2 className="cond text-xl font-bold leading-tight min-w-0">${title}</h2>
        <button type="button" className="iconbtn" onClick=${onClose} aria-label="Schließen"><${Icon} n="x" /></button></div>
      <div className="sheet-body">${children}</div>
      ${footer ? React.createElement("div", { className: "sheet-foot" }, ...[].concat(footer)) : null}
    </div></div>`;
}
function DelBtn({ onConfirm, label = "Löschen" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return undefined; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return html`<button type="button" className=${"btn " + (armed ? "btn-dangerfill" : "btn-ghost-danger")} onClick=${() => armed ? onConfirm() : setArmed(true)}>
    <${Icon} n="trash" s=${16} />${armed ? "Wirklich löschen?" : label}</button>`;
}
function Avatar({ emp, size = 28 }) {
  const st = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (!emp) return html`<span className="av" style=${{ ...st, background: "var(--muted)" }}>?</span>`;
  if (emp.photoId) return html`<${BlobImg} className="av" id=${emp.photoId} style=${{ ...st, objectFit: "cover" }} />`;
  return html`<span className="av" style=${{ ...st, background: hashColor(emp.id) }}>${initials(fullName(emp))}</span>`;
}
function Empty({ icon = "file", title, children }) {
  return html`<div className="card p-6 text-center">
    <div className="muted flex justify-center mb-2"><${Icon} n=${icon} s=${28} w=${1.6} /></div>
    <p className="font-semibold">${title}</p>
    ${children ? html`<div className="muted text-sm mt-1">${children}</div>` : null}
  </div>`;
}
function PageHead({ title, sub, action, onBack }) {
  return html`<div className="flex items-end justify-between gap-3">
    <div className="min-w-0 flex items-center gap-1">
      ${onBack ? html`<button type="button" className="iconbtn -ml-2" onClick=${onBack} aria-label="Zurück"><${Icon} n="back" /></button>` : null}
      <div className="min-w-0"><h1 className="cond text-2xl font-bold leading-tight">${title}</h1>${sub ? html`<p className="muted text-sm">${sub}</p>` : null}</div>
    </div>${action || null}</div>`;
}
function SearchBox({ value, onChange, placeholder }) {
  return html`<div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 muted"><${Icon} n="search" s=${16} /></span>
    <input className="inp" style=${{ paddingLeft: "2.2rem" }} value=${value} onChange=${(e) => onChange(e.target.value)} placeholder=${placeholder} aria-label=${placeholder} /></div>`;
}

function Files({ label, req, bad, value, onChange, accept = "image/*,application/pdf", multiple = true, capture, hint, scope = "app", readOnly = false }) {
  const { rt, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const list = value || [];
  async function pick(e) {
    const fl = Array.from(e.target.files || []); e.target.value = "";
    if (!fl.length) return;
    setBusy(true);
    const out = multiple ? [...list] : [];
    for (const f of fl) {
      try { const r = await rt.assets.upload(f, { type: mimeOf(f), scope }); out.push({ id: r.id, name: f.name, type: r.contentType, size: r.sizeBytes }); }
      catch (err) { toast(uploadErr(err, f.name), "err"); }
    }
    setBusy(false);
    onChange(out);
  }
  return html`<${Field} label=${label} req=${req} bad=${bad} span div hint=${hint}>
    <div className="flex flex-wrap gap-2 items-center">
      ${list.map((f, i) => html`<div key=${f.id + i} className="flex items-center gap-2 card px-2 py-1.5" style=${{ maxWidth: "100%" }}>
        ${String(f.type || "").startsWith("image/") ? html`<${BlobImg} className="thumb" style=${{ width: 40, height: 40 }} id=${f.id} />` : html`<span className="muted"><${Icon} n="file" s=${22} /></span>`}
        <button type="button" className="text-sm font-medium underline truncate" style=${{ maxWidth: "11rem", background: "none", border: 0, color: "inherit", cursor: "pointer" }} onClick=${() => openAsset(rt, f, toast)}>${f.name}</button>
        ${readOnly ? null : html`<button type="button" className="iconbtn" style=${{ width: 30, height: 30 }} aria-label=${"Entfernen: " + f.name} onClick=${() => onChange(list.filter((_, j) => j !== i))}><${Icon} n="x" s=${15} /></button>`}
      </div>`)}
      ${readOnly ? (list.length ? null : html`<span className="text-sm muted">Keine Dateien</span>`) : html`<button type="button" className="btn btn-sm" disabled=${busy} onClick=${() => inputRef.current && inputRef.current.click()}>
        <${Icon} n=${capture ? "camera" : "upload"} s=${15} />${busy ? "Lädt hoch…" : list.length && multiple ? "Weitere Datei" : "Datei wählen"}</button>`}
      <input ref=${inputRef} type="file" hidden accept=${accept} multiple=${multiple} capture=${capture || undefined} onChange=${pick} />
    </div><//>`;
}

function MePrompt() {
  const { employees, chooseMe, setTab, rt } = useApp();
  if (!rt.canEdit) return html`<div className="card p-4"><p className="font-bold">Zugang noch nicht zugeordnet</p>
    <p className="muted text-sm mt-1">Dein Zugang ist noch keinem Mitarbeiter zugeordnet. Bitte einen Admin, das unter Mehr › Zugänge zu erledigen.</p></div>`;
  if (!employees.length) return html`<div className="card p-4">
    <p className="font-bold">Noch kein Team angelegt</p>
    <p className="muted text-sm mt-1 mb-3">Lege zuerst die Mitarbeiter an und verknüpfe sie unter Mehr › Zugänge mit ihrem Login.</p>
    <button className="btn btn-primary" onClick=${() => setTab("more", "team")}><${Icon} n="users" s=${16} />Team anlegen</button></div>`;
  return html`<div className="card p-4">
    <p className="font-bold">Wer bist du?</p>
    <p className="muted text-sm mt-1 mb-3">Dein Admin-Zugang ist mit keinem Mitarbeiter verknüpft. Wähle, für wen du Einträge erfasst.</p>
    <div className="grid grid-cols-2 gap-2">${employees.map((e) => html`<button key=${e.id} className="btn justify-start" onClick=${() => chooseMe(e.id)}>
      <${Avatar} emp=${e} size=${24} /><span className="truncate">${fullName(e)}</span></button>`)}</div></div>`;
}
