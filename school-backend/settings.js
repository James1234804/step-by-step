 /* settings.js — Settings section. Loaded by index.html (like fees.js / payroll.js).
   Draws itself inside <section id="settings-section">. Needs settings_setup.sql run once in Supabase.
   Other modules can read values with:  SchoolSettings.get("school_name", "My School") */
(function () {
"use strict";
const root = document.getElementById("settings-section");
if (!root) return;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const NUM = ["rate","due_days","overdue_days","logout_min","backup_days","established","lesson_min","class_cap","late_penalty_pct","receipt_start","payday","annual_leave_days","sick_leave_days","contract_alert_days"];
const DEFAULTS = {school_name:"Shallom High School", motto:"", school_type:"Day school", levels:["O-Level"], established:"", reg_no:"", head_name:"", deputy_name:"", bursar_name:"", address:"", phone:"", email:"", website:"",
  terms:[{n:"Term 1",start:"",end:""},{n:"Term 2",start:"",end:""},{n:"Term 3",start:"",end:""}],
  forms:["Form 1","Form 2","Form 3","Form 4","Form 5","Form 6"], exam_types:["Midterm","Final"], subjects:"",
  session_mode:"Single session", school_days:["Mon","Tue","Wed","Thu","Fri"], start_time:"07:30", end_time:"16:00", lesson_min:40, late_after:"07:45", class_cap:"",
  currency:"USD", rate:"", methods:["Cash","EcoCash","Bank transfer"], due_days:14, overdue_days:30, late_penalty_pct:"", partial_ok:true,
  form_fees:{1:"",2:"",3:"",4:"",5:"",6:""},
  receipt_prefix:"RCT-", receipt_start:1, paper:"A4", receipt_footer:"Thank you for your payment.", bank_name:"", bank_account:"", signatory:"",
  payday:"", annual_leave_days:"", sick_leave_days:"", contract_alert_days:60,
  n_overdue:true, n_contracts:true, n_leave:true, n_backup:true,
  msg_fee:"Dear {parent}, {student} has an outstanding fee balance of {balance}. Please settle by {date}. {school}",
  msg_receipt:"Receipt {receipt}: we received {amount} for {student}. Thank you. {school}",
  logout_min:0, backup_days:0, last_backup:"", date_format:"DD/MM/YYYY", time_format:"24-hour", saved_at:""};
let S = JSON.parse(JSON.stringify(DEFAULTS)), snap = JSON.stringify(S), base = null, ready = false, setupErr = "", tab = "profile", idle;

// ---- small public API for other modules ----
window.SchoolSettings = {get: (k, d) => (S[k] === "" || S[k] == null ? d : S[k]), all: () => JSON.parse(JSON.stringify(S))};

const SECTIONS = [
  {id:"profile", t:"School profile", d:"These details appear on receipts, payslips and reports.", f:[
    ["school_name","School name","text"],["motto","Motto","text"],["school_type","School type","select",["Day school","Boarding school","Day and boarding"]],
    ["levels","Levels offered","checks",["O-Level","A-Level"]],["established","Year established","number"],["reg_no","Registration number","text"],
    ["head_name","Headmaster’s name","text"],["deputy_name","Deputy head’s name","text"],["bursar_name","Bursar’s name","text"],
    ["address","Address","text"],["phone","Phone","text"],["email","Email","email"],["website","Website","text"]]},
  {id:"academic", t:"Academic calendar", d:"Term dates and what the school teaches. The academic year advances automatically each January.", custom:"terms", f:[
    ["forms","Forms offered","checks",["Form 1","Form 2","Form 3","Form 4","Form 5","Form 6"]],
    ["exam_types","Exam types used","checks",["Class test","Midterm","Final","Mock"]],
    ["subjects","Subjects taught","area",null,"One subject per line."]]},
  {id:"day", t:"School day & attendance", d:"How the school day runs.", f:[
    ["session_mode","Sessions","select",["Single session","Morning and afternoon sessions"]],
    ["school_days","School days","checks",["Mon","Tue","Wed","Thu","Fri","Sat"]],
    ["start_time","School starts","time"],["end_time","School ends","time"],["lesson_min","Lesson length (minutes)","number"],
    ["late_after","Mark a student late after","time"],["class_cap","Maximum students per class","number"]]},
  {id:"finance", t:"Fees & finance", d:"Currency, payment rules and fees for each form.", custom:"feeform", f:[
    ["currency","Main currency","select",["USD","ZiG"]],["rate","Exchange rate (1 USD = ? ZiG)","number",null,"Leave blank if you only use one currency."],
    ["methods","Payment methods accepted","checks",["Cash","EcoCash","Bank transfer","Swipe / POS","Other"]],
    ["due_days","Fees due within (days of term opening)","number"],["overdue_days","Flag as overdue after (days)","number"],
    ["late_penalty_pct","Late payment penalty (%)","number",null,"Leave blank for none."],
    ["partial_ok","Allow part-payments","toggle"]]},
  {id:"receipts", t:"Receipts & documents", d:"What parents see on a receipt.", f:[
    ["receipt_prefix","Receipt number prefix","text",null,"Example: RCT- gives RCT-0001."],["receipt_start","Next receipt number","number"],
    ["paper","Paper size","select",["A4","A5","Thermal 80mm"]],["receipt_footer","Receipt footer message","text"],
    ["bank_name","Bank name","text"],["bank_account","Bank account number","text"],["signatory","Receipts signed by","text"]]},
  {id:"payroll", t:"Payroll & HR", d:"Defaults used by the Payroll & HR section.", f:[
    ["payday","Pay day (day of the month)","number"],["annual_leave_days","Annual leave days per year","number",null,"Use the figure in your contracts."],
    ["sick_leave_days","Sick leave days per year","number"],["contract_alert_days","Warn before a contract ends (days)","number",null,"Used on the Payroll staff list right away."]]},
  {id:"notify", t:"Notifications", d:"What the bell should alert you about, and message wording.", f:[
    ["n_overdue","Overdue fees","toggle"],["n_contracts","Contracts ending soon","toggle"],["n_leave","Leave requests waiting","toggle"],["n_backup","Backup reminders","toggle"],
    ["msg_fee","Fee reminder message","area",null,"Words in curly brackets are filled in automatically when messages are sent."],
    ["msg_receipt","Payment confirmation message","area"]]},
  {id:"roles", t:"Roles & access", d:"Who can open what, today.", custom:"roles"},
  {id:"security", t:"Security", d:"Protect the system on shared computers.", f:[
    ["logout_min","Automatic logout after inactivity","select",[[0,"Off"],[15,"15 minutes"],[30,"30 minutes"],[60,"1 hour"]],"Logs out using the normal Logout button. Payroll has its own 15-minute sign-out."]]},
  {id:"data", t:"Data & backup", d:"Keep an independent copy of your records.", custom:"data", f:[
    ["backup_days","Remind me to back up","select",[[0,"Never"],[7,"Every week"],[14,"Every 2 weeks"],[30,"Every month"]]]]},
  {id:"appearance", t:"Preferences", d:"How dates and times are shown.", f:[["date_format","Date format","select",["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD"]],["time_format","Time format","select",["24-hour","12-hour"]]]},
  {id:"about", t:"About", d:"System information.", custom:"about"}
];

root.innerHTML = `<style>
#settings-section .st-wrap{display:grid;grid-template-columns:220px 1fr;gap:1.2rem;align-items:start}
#settings-section .st-nav{padding:.5rem;position:sticky;top:1rem}
#settings-section .st-nav button{display:block;width:100%;text-align:left;padding:10px 14px;border:0;background:none;border-radius:8px;cursor:pointer;color:inherit;font:inherit;opacity:.75}
#settings-section .st-nav button.on{background:rgba(234,88,12,.13);color:#c2410c;opacity:1;font-weight:600}
#settings-section .st-pane{padding:1.5rem}
#settings-section .st-pane h2{margin:0 0 .25rem;font-size:1.15rem}
#settings-section .st-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.1rem;margin-top:1.2rem}
#settings-section .st-f label{display:block;font-size:.82rem;font-weight:600;margin-bottom:5px}
#settings-section .st-f input:not([type=checkbox]),#settings-section .st-f select,#settings-section .st-f textarea,#settings-section .st-trow input{width:100%;padding:9px 10px;border:1px solid rgba(128,128,128,.35);border-radius:8px;background:transparent;color:inherit;font:inherit}
#settings-section .st-f small{display:block;opacity:.65;margin-top:4px;font-size:.78rem}
#settings-section .st-ck{display:inline-flex;gap:6px;align-items:center;margin:0 14px 8px 0;font-weight:400!important}
#settings-section .st-trow{display:grid;grid-template-columns:90px 1fr 1fr;gap:1rem;align-items:end;margin-top:1rem}
#settings-section .st-trow label{display:block;font-size:.8rem;opacity:.7;margin-bottom:4px}
#settings-section .st-bar{position:sticky;bottom:0;display:flex;gap:.8rem;align-items:center;justify-content:space-between;padding:.8rem 1.2rem;margin-top:1rem;border-radius:10px;background:var(--card-bg,#fff);border:1px solid rgba(128,128,128,.3);box-shadow:0 -4px 14px rgba(0,0,0,.08)}
#settings-section .st-note{padding:10px 14px;border-radius:8px;margin-bottom:1rem;background:#fef3c7;color:#7c4a03}
#settings-section .st-row{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
#settings-section dl{display:grid;grid-template-columns:160px 1fr;gap:.6rem 1rem;margin:1.2rem 0 0}
#settings-section dt{opacity:.65}#settings-section dd{margin:0}
@media(max-width:820px){#settings-section .st-wrap{grid-template-columns:1fr}#settings-section .st-nav{position:static;display:flex;overflow-x:auto}#settings-section .st-nav button{white-space:nowrap;width:auto}#settings-section .st-trow{grid-template-columns:1fr}}
</style>
<div class="section-header"><h1>Settings</h1></div>
<div id="st-top"></div>
<div class="st-wrap"><div class="card st-nav" id="st-nav"></div><div><div class="card st-pane" id="st-pane"></div>
<div class="st-bar" id="st-bar"><span id="st-msg" class="subtitle"></span><span><button class="btn btn-secondary" id="st-discard">Discard</button> <button class="btn btn-primary" id="st-save">Save changes</button></span></div></div></div>`;
const $ = id => document.getElementById(id);

// ---- connection + permission ----
function findClient() {
  const names = ["supabaseClient","sb","db","_supabase","supabaseDb","sbClient","client","supabaseInstance","supabase"];
  for (const n of names) { try { const v = new Function("return typeof " + n + "!=='undefined'?" + n + ":null")(); if (v && typeof v.from === "function" && v.auth) return v; } catch (e) {} }
  for (const k of Object.keys(window)) { try { const v = window[k]; if (v && typeof v.from === "function" && v.auth && typeof v.auth.getSession === "function") return v; } catch (e) {} }
  return null;
}
function role() {
  for (const n of ["currentUser","loggedInUser","currentSession","user"]) {
    try { const u = new Function("return typeof " + n + "!=='undefined'?" + n + ":null")(); if (u && u.role) return String(u.role).toLowerCase(); } catch (e) {}
  }
  return "";
}
const canEdit = () => !["guest","teacher"].includes(role());
const toast = m => (typeof showToast === "function" ? showToast(m) : alert(m));

// ---- rendering ----
function field(f) {
  const [k, label, type, opts, hint] = f, v = S[k]; let inp;
  if (type === "select") inp = `<select data-k="${k}">${opts.map(o => { const [val, t] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`; }).join("")}</select>`;
  else if (type === "area") inp = `<textarea data-k="${k}" rows="5">${esc(v)}</textarea>`;
  else if (type === "toggle") inp = `<label class="st-ck"><input type="checkbox" data-k="${k}" data-bool="1" ${v ? "checked" : ""}> Enabled</label>`;
  else if (type === "checks") inp = opts.map(o => `<label class="st-ck"><input type="checkbox" data-k="${k}" data-v="${esc(o)}" ${(v || []).includes(o) ? "checked" : ""}> ${esc(o)}</label>`).join("");
  else inp = `<input data-k="${k}" type="${type}" value="${esc(v)}">`;
  return `<div class="st-f"><label>${esc(label)}</label>${inp}${hint ? `<small>${esc(hint)}</small>` : ""}</div>`;
}
function render() {
  $("st-nav").innerHTML = SECTIONS.map(s => `<button data-tab="${s.id}" class="${s.id === tab ? "on" : ""}">${s.t}</button>`).join("");
  const s = SECTIONS.find(x => x.id === tab);
  let h = `<h2>${s.t}</h2><div class="subtitle">${s.d}</div>`;
  if (s.custom === "terms") h += S.terms.map((t, i) => `<div class="st-trow"><b>${esc(t.n)}</b><div><label>Opens</label><input type="date" data-t="${i}" data-f="start" value="${esc(t.start)}"></div><div><label>Closes</label><input type="date" data-t="${i}" data-f="end" value="${esc(t.end)}"></div></div>`).join("");
  if (s.f) h += `<div class="st-g">${s.f.map(field).join("")}</div>`;
  if (s.custom === "data") {
    const due = backupDue();
    h += (due ? `<div class="st-note" style="margin-top:1rem">Your last backup was ${S.last_backup ? esc(S.last_backup) : "never recorded"}. Please download a fresh copy.</div>` : "") +
      `<div class="st-row"><button class="btn btn-primary" id="st-bk">Download backup</button><button class="btn btn-secondary" id="st-rs">Restore from backup</button></div>
       <p class="subtitle" style="margin-top:.8rem">Last backup from this page: ${esc(S.last_backup || "none yet")}. Store the file somewhere safe, away from this computer.</p>`;
  }
  if (s.custom === "feeform") h += `<h3 style="margin:1.6rem 0 0;font-size:1rem">Fees per form (per term)</h3><div class="st-g">${["1","2","3","4","5","6"].map(n => `<div class="st-f"><label>Form ${n}</label><input type="number" data-ff="${n}" value="${esc(S.form_fees[n])}"></div>`).join("")}</div><p class="subtitle" style="margin-top:.8rem">Saved here for the Fees page to use. Until it is connected, the Fees page keeps using its single total per student.</p>`;
  if (s.custom === "roles") h += `<div style="overflow-x:auto"><table class="table" style="margin-top:1.2rem"><thead><tr><th>Section</th><th>Who can open it</th><th>How it is protected</th></tr></thead><tbody>
    <tr><td>Students, Teachers, Exams, Classes, Timetable, Fees</td><td>Everyone who logs in</td><td>System login</td></tr>
    <tr><td>Payroll &amp; HR</td><td>Headmaster, HR and Accountant roles only</td><td>Separate sign-in, enforced by the database</td></tr>
    <tr><td>Settings</td><td>Headmaster and administrator can edit; teachers and guests view only</td><td>System login</td></tr></tbody></table></div>
    <p class="subtitle" style="margin-top:.8rem">Finer control for the other sections will come with proper accounts for each user.</p>`;
  if (s.custom === "about") h += `<dl><dt>System</dt><dd>${esc(S.school_name)} Management System</dd><dt>Version</dt><dd>1.0</dd><dt>Settings last saved</dt><dd>${esc(S.saved_at ? new Date(S.saved_at).toLocaleString() : "not yet")}</dd><dt>Stored in</dt><dd>Your online database, so every computer sees the same settings.</dd></dl>`;
  $("st-pane").innerHTML = h;
  if (!canEdit()) root.querySelectorAll("#st-pane input,#st-pane select").forEach(x => x.disabled = true);
  bar();
}
function bar() {
  const dirty = JSON.stringify(S) !== snap, ok = ready && canEdit();
  $("st-msg").textContent = !canEdit() ? "View only. Only the headmaster or administrator can change settings." : dirty ? "You have unsaved changes." : "All changes saved.";
  $("st-save").disabled = !dirty || !ok; $("st-discard").disabled = !dirty;
  $("st-top").innerHTML = (setupErr ? `<div class="st-note">${esc(setupErr)}</div>` : "") + (backupDue() && tab !== "data" ? `<div class="st-note">Backup reminder: please download a fresh backup (Data &amp; backup).</div>` : "");
}
function backupDue() { const d = +S.backup_days; return d > 0 && (!S.last_backup || (Date.now() - new Date(S.last_backup)) / 864e5 > d); }

// ---- editing ----
function onEdit(e) {
  const t = e.target;
  if (t.dataset.t !== undefined) S.terms[+t.dataset.t][t.dataset.f] = t.value;
  else if (t.dataset.ff) S.form_fees[t.dataset.ff] = t.value === "" ? "" : +t.value;
  else if (t.dataset.k) {
    const k = t.dataset.k;
    if (t.dataset.bool) S[k] = t.checked;
    else if (t.type === "checkbox") S[k] = [...root.querySelectorAll(`input[data-k="${k}"]:checked`)].map(x => x.dataset.v);
    else S[k] = NUM.includes(k) ? (t.value === "" ? "" : +t.value) : t.value;
  } else return;
  bar();
}
root.addEventListener("input", onEdit); root.addEventListener("change", onEdit);
root.addEventListener("click", e => {
  if (e.target.dataset.tab) { tab = e.target.dataset.tab; render(); }
  if (e.target.id === "st-bk") { if (typeof window.exportAllData === "function") { window.exportAllData(); S.last_backup = new Date().toISOString().slice(0, 10); save(); } else toast("The backup function was not found on this page."); }
  if (e.target.id === "st-rs") { if (typeof window.triggerImportBackup === "function") window.triggerImportBackup(); else toast("The restore function was not found on this page."); }
});
$("st-discard").onclick = () => { S = JSON.parse(snap); render(); };

function validate() {
  if (!String(S.school_name).trim()) return "Enter the school name.";
  if (S.email && !/^\S+@\S+\.\S+$/.test(S.email)) return "The email address does not look right.";
  for (let i = 0; i < S.terms.length; i++) {
    const t = S.terms[i], p = S.terms[i - 1];
    if (t.start && t.end && t.end < t.start) return t.n + " closes before it opens.";
    if (p && p.end && t.start && t.start <= p.end) return t.n + " must open after " + p.n + " closes.";
  }
  return "";
}
async function save() {
  const bad = validate(); if (bad) return toast(bad);
  if (!base) return toast("Could not find the database connection.");
  S.saved_at = new Date().toISOString();
  const {error} = await base.from("school_settings").upsert({key: "main", value: S, updated_at: S.saved_at});
  if (error) return toast("Could not save. Run settings_setup.sql in Supabase first.");
  snap = JSON.stringify(S); apply(); render(); toast("Settings saved");
}
$("st-save").onclick = save;

// ---- effects that work straight away ----
function apply() {
  if (S.school_name) document.title = S.school_name + " - Management System";
  arm(); document.dispatchEvent(new CustomEvent("school-settings", {detail: S}));
}
function arm() { clearTimeout(idle); if (+S.logout_min > 0) idle = setTimeout(() => { const b = document.getElementById("btnLogout"); if (b) b.click(); }, S.logout_min * 60000); }
["click","keydown","mousemove","touchstart"].forEach(e => document.addEventListener(e, arm, {passive: true}));

// ---- load ----
async function init(n) {
  base = findClient();
  if (!base) { if (n < 6) return setTimeout(() => init(n + 1), 800); setupErr = "Could not find your database connection in school.js."; return render(); }
  const r = await base.from("school_settings").select("value").eq("key", "main").maybeSingle();
  if (r.error) setupErr = "Settings are not set up yet. Run settings_setup.sql in the Supabase SQL Editor, then refresh.";
  else { ready = true; if (r.data) S = Object.assign(JSON.parse(JSON.stringify(DEFAULTS)), r.data.value); snap = JSON.stringify(S); }
  if (r.error) ready = false;
  apply(); render();
}
render(); setTimeout(() => init(0), 800);
})();
