 /* payroll.js — Payroll & HR section. Loaded by index.html (like fees.js).
   Draws itself inside <section id="payroll-section">. Needs payroll_setup.sql run once in Supabase. */
(function () {
"use strict";
const root = document.getElementById("payroll-section");
if (!root) return;
const g = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => Number(n || 0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
let leaves = [], runLines = [], bands = [];
let sb = null, role = null, cfg = {}, staff = [], runs = [], curRun = null, idle;

root.innerHTML = `
<style>
#payroll-section .pr-h{display:none!important}
#payroll-section .pr-box{max-width:380px;padding:1.5rem}
#payroll-section .pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.8rem;margin-bottom:.9rem}
#payroll-section label{display:block;font-size:.8rem;opacity:.7;margin-bottom:3px}
#payroll-section input,#payroll-section select{width:100%;padding:8px;border:1px solid rgba(128,128,128,.35);border-radius:6px;background:transparent;color:inherit;font:inherit}
#payroll-section .pr-tabs{display:flex;gap:4px;border-bottom:1px solid rgba(128,128,128,.25);margin-bottom:1rem;overflow-x:auto}
#payroll-section .pr-tabs button{background:none;border:0;border-bottom:3px solid transparent;padding:10px 14px;cursor:pointer;color:inherit;opacity:.65;font-weight:600;white-space:nowrap}
#payroll-section .pr-tabs button.on{opacity:1;border-color:#0f5c5c}
#payroll-section .pr-n{text-align:right}
#payroll-section .pr-tw{overflow-x:auto;padding:1rem}
#payroll-section .pr-pad{padding:1.2rem;margin-bottom:1.2rem}
#payroll-section .pr-tag{padding:2px 9px;border-radius:99px;font-size:.75rem;font-weight:600;background:rgba(128,128,128,.2)}
#payroll-section .pr-tag.approved{background:#dbeafe;color:#1e40af}
#payroll-section .pr-tag.paid{background:#d1fae5;color:#17703f}
#payroll-section .pr-tag.draft{background:#fef3c7;color:#92400e}
#payroll-section .pr-warn{background:#fef3c7;color:#7c4a03;padding:10px 14px;border-radius:6px;margin-bottom:1rem}
#payroll-section .pr-err{color:#b42318;font-size:.85rem;min-height:1.2em;margin-top:.6rem}
#payroll-section .pr-bar{display:flex;gap:.6rem;align-items:end;flex-wrap:wrap;margin-bottom:1rem}
#payroll-section .pr-bar>div{min-width:160px}
#payroll-section tfoot td{font-weight:700;border-top:2px solid rgba(128,128,128,.35)}
</style>
<div class="section-header"><h1>Payroll &amp; HR</h1>
  <div style="display:flex;gap:.7rem;align-items:center"><span id="pr-who" class="subtitle"></span>
  <button id="pr-out" class="btn btn-secondary pr-h">Sign out</button></div></div>

<div id="pr-login" class="card pr-box">
  <h2 style="margin:0 0 .3rem;font-size:1.1rem">Payroll sign-in</h2>
  <p class="subtitle" style="margin:0 0 1rem">Authorised staff only. This is a separate login for payroll.</p>
  <div style="margin-bottom:.8rem"><label for="pr-em">Email</label><input id="pr-em" type="email" autocomplete="username"></div>
  <div style="margin-bottom:1rem"><label for="pr-pw">Password</label><input id="pr-pw" type="password" autocomplete="current-password"></div>
  <button id="pr-go" class="btn btn-primary" style="width:100%">Sign in</button>
  <div id="pr-lerr" class="pr-err" role="alert"></div>
</div>

<div id="pr-denied" class="card pr-box pr-h">
  <h2 style="margin:0 0 .3rem;font-size:1.1rem">Access denied</h2>
  <p class="subtitle">Your account has no Payroll &amp; HR role. Ask the headmaster to grant access.</p>
  <p id="pr-dmsg" class="subtitle" style="font-size:.85rem"></p>
  <button id="pr-dout" class="btn btn-secondary">Sign out</button>
</div>

<div id="pr-app" class="pr-h">
  <div id="pr-cfgwarn" class="pr-warn pr-h">Tax rates are not set up yet, so PAYE would calculate as zero. Add the PAYE bands in the <b>payroll_settings</b> table before running payroll.</div>
  <div class="pr-tabs">
    <button data-t="dash" class="on">Dashboard</button><button data-t="staff">Staff</button><button data-t="pay">Payroll run</button><button data-t="leave">Leave</button><button data-t="set" id="pr-settab" class="pr-h">Settings</button>
  </div>

  <div id="pr-t-dash"><div class="stats-grid" id="pr-cards"></div>
    <div class="card"><div class="pr-tw" id="pr-trend"></div></div></div>

  <div id="pr-t-staff" class="pr-h">
    <div class="card pr-pad" id="pr-addp"><h3 style="margin:0 0 .8rem;font-size:1rem">Add staff member</h3>
      <div class="pr-grid">
        <div><label>Link to a teacher already in the system</label><select id="pr-tsel"><option value="">Not a teacher (type details)</option></select></div>
        <div><label>Full name</label><input id="pr-name"></div>
        <div><label>National ID</label><input id="pr-nid"></div>
        <div><label>Position</label><input id="pr-pos"></div>
        <div><label>Department</label><select id="pr-dep"><option>Teaching</option><option>Administration</option><option>Grounds &amp; maintenance</option><option>Boarding</option></select></div>
        <div><label>Date joined</label><input id="pr-join" type="date"></div>
        <div><label>Contract ends</label><input id="pr-cend" type="date"></div>
        <div><label>Basic salary</label><input id="pr-basic" type="number" min="0" step="0.01"></div>
        <div><label>Allowances</label><input id="pr-allow" type="number" min="0" step="0.01" value="0"></div>
        <div><label>Other deductions</label><input id="pr-oth" type="number" min="0" step="0.01" value="0"></div>
      </div>
      <button id="pr-add" class="btn btn-primary">Save staff member</button></div>
    <div class="card pr-pad" style="padding-bottom:.4rem"><input id="pr-sq" placeholder="Search staff by name, position or department"></div>
    <div class="card"><div class="pr-tw" id="pr-stafftbl"></div></div>
  </div>

  <div id="pr-t-pay" class="pr-h"><div class="card pr-pad">
    <div class="pr-bar">
      <div><label>Month</label><input id="pr-pm" type="month"></div>
      <button id="pr-calc" class="btn btn-primary">Calculate payroll</button>
      <button id="pr-appr" class="btn btn-secondary">Approve</button>
      <button id="pr-paid" class="btn btn-secondary">Mark as paid</button>
      <span id="pr-runtag"></span></div>
    <div class="pr-tw" id="pr-runtbl" style="padding:0"><p class="subtitle">Pick a month to view or calculate its payroll.</p></div>
  </div></div>

  <div id="pr-t-leave" class="pr-h">
    <div class="card pr-pad" id="pr-leaveform"><h3 style="margin:0 0 .8rem;font-size:1rem">Record a leave request</h3>
      <div class="pr-grid">
        <div><label>Staff member</label><select id="pr-lstaff"></select></div>
        <div><label>Leave type</label><select id="pr-ltype"><option>Annual</option><option>Sick</option><option>Maternity</option><option>Unpaid</option><option>Other</option></select></div>
        <div><label>From</label><input id="pr-lfrom" type="date"></div>
        <div><label>To</label><input id="pr-lto" type="date"></div>
        <div><label>Note</label><input id="pr-lnote"></div>
      </div><button id="pr-ladd" class="btn btn-primary">Submit request</button></div>
    <div class="card"><div class="pr-tw" id="pr-leavetbl"></div></div>
  </div>

  <div id="pr-t-set" class="pr-h"><div class="card pr-pad">
    <h3 style="margin:0 0 .3rem;font-size:1rem">Tax and contribution rates</h3>
    <p class="subtitle" style="margin:0 0 1rem">Get the current figures from ZIMRA, NSSA or the school accountant. Changes apply to payroll runs calculated from now on. Runs already calculated keep their figures. Use the same currency as the salaries.</p>
    <div class="pr-grid">
      <div><label>NSSA employee %</label><input id="pr-s-nssa_employee_pct" type="number" step="0.01"></div>
      <div><label>NSSA employer %</label><input id="pr-s-nssa_employer_pct" type="number" step="0.01"></div>
      <div><label>NSSA monthly cap (0 = none)</label><input id="pr-s-nssa_monthly_cap" type="number" step="0.01"></div>
      <div><label>AIDS levy % (of PAYE)</label><input id="pr-s-aids_levy_pct" type="number" step="0.01"></div>
      <div><label>ZIMDEF employer %</label><input id="pr-s-zimdef_employer_pct" type="number" step="0.01"></div>
    </div>
    <h3 style="margin:1rem 0 .3rem;font-size:1rem">PAYE tax bands (monthly)</h3>
    <p class="subtitle" style="margin:0 0 .8rem">PAYE is income tax taken from each salary and paid to ZIMRA. Pay is taxed in slices: each slice has its own rate, and the slices are listed in order from the lowest.</p>
    <div id="pr-bands"></div>
    <div style="display:flex;gap:.6rem;margin-top:.8rem"><button id="pr-addband" class="btn btn-secondary">Add band</button><button id="pr-saveset" class="btn btn-primary">Save rates</button></div>
  </div></div>
</div>`;

const flag = (id, on) => g(id).classList.toggle("pr-h", !on);
const view = v => ["login","denied","app"].forEach(x => flag("pr-" + x, x === v));
const toast = m => (typeof showToast === "function" ? showToast(m) : alert(m));

// ---- find the existing Supabase connection and use a separate payroll session ----
function findClient() {
  const names = ["supabaseClient","sb","db","_supabase","supabaseDb","sbClient","client","supabaseInstance","supabase"];
  for (const n of names) {
    try { const v = new Function("return typeof " + n + "!=='undefined'?" + n + ":null")();
      if (v && typeof v.from === "function" && v.auth) return v; } catch (e) {}
  }
  for (const k of Object.keys(window)) {
    try { const v = window[k]; if (v && typeof v.from === "function" && v.auth && typeof v.auth.getSession === "function") return v; } catch (e) {}
  }
  return null;
}
function connect() {
  if (sb) return sb;
  const base = findClient();
  if (!base || !base.supabaseUrl || !base.supabaseKey) throw new Error("Could not find your Supabase connection in school.js. Send me the lines in school.js that contain createClient.");
  // separate storage key so signing in here never changes the rest of the system's login
  sb = window.supabase.createClient(base.supabaseUrl, base.supabaseKey, {auth: {storageKey: "payroll-auth", persistSession: true, autoRefreshToken: true}});
  return sb;
}

// ---- sign in + role gate ----
async function start() {
  const {data: {session}} = await sb.auth.getSession();
  if (!session) return view("login");
  const {data, error} = await sb.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
  if (!data) {
    g("pr-dmsg").textContent = "Signed in as " + session.user.email + ". " + (error ? "Database message: " + error.message : "No role is saved for this account yet.");
    return view("denied");
  }
  role = data.role;
  g("pr-who").textContent = session.user.email + " · " + role;
  flag("pr-out", true); flag("pr-addp", ["head","hr"].includes(role));
  flag("pr-settab", role === "head"); flag("pr-leaveform", ["head","hr"].includes(role));
  g("pr-calc").disabled = !["head","accountant"].includes(role);
  view("app"); resetIdle(); await loadAll();
}
g("pr-go").onclick = async () => {
  g("pr-lerr").textContent = "";
  try { connect(); } catch (e) { return g("pr-lerr").textContent = e.message; }
  const {error} = await sb.auth.signInWithPassword({email: g("pr-em").value.trim(), password: g("pr-pw").value});
  if (error) return g("pr-lerr").textContent = "Sign-in failed. Check your email and password.";
  g("pr-pw").value = ""; start();
};
async function signOut() {
  clearTimeout(idle); role = null; staff = []; runs = []; curRun = null;
  if (sb) await sb.auth.signOut();
  g("pr-who").textContent = ""; flag("pr-out", false); view("login");
}
g("pr-out").onclick = signOut;
g("pr-dout").onclick = signOut;
function resetIdle() { clearTimeout(idle); idle = setTimeout(signOut, 15 * 60 * 1000); } // 15 min idle sign-out
["click","keydown","mousemove"].forEach(e => document.addEventListener(e, () => role && resetIdle()));

// ---- data ----
async function loadAll() {
  const [s, r, c, lv] = await Promise.all([
    sb.from("staff").select("*").order("full_name"),
    sb.from("payroll_runs").select("*").order("month", {ascending: false}),
    sb.from("payroll_settings").select("*"),
    sb.from("leave_requests").select("*").order("start_date", {ascending: false})]);
  if (s.error || r.error || c.error) return toast("Could not load payroll data. Check your connection and permissions.");
  staff = s.data; runs = r.data; cfg = {};
  if (lv.error) toast("Leave data is not set up yet. Run payroll_update_1.sql in Supabase."); leaves = lv.data || [];
  c.data.forEach(x => cfg[x.key] = x.value);
  flag("pr-cfgwarn", !(Array.isArray(cfg.paye_bands) && cfg.paye_bands.length));
  fillSettings(); fillLeaveStaff(); fillTeacherSelect(); renderStaff(); renderLeave(); await renderDash();
}
async function renderDash() {
  const act = staff.filter(s => s.status !== "left");
  const soon = act.filter(s => s.contract_end && (new Date(s.contract_end) - Date.now()) / 864e5 <= 60).length;
  const teach = act.filter(s => s.department === "Teaching").length;
  const {data: lines} = await sb.from("payroll_lines").select("run_id,gross,net,employer_nssa,employer_zimdef");
  const by = {};
  (lines || []).forEach(l => { const o = by[l.run_id] ??= {gross: 0, net: 0, cost: 0};
    o.gross += +l.gross; o.net += +l.net; o.cost += +l.gross + +l.employer_nssa + +l.employer_zimdef; });
  const last = runs[0], L = last && by[last.id] || {gross: 0, net: 0};
  const cards = [["Active staff", act.length], ["Teaching / non-teaching", teach + " / " + (act.length - teach)],
    ["On leave", act.filter(s => s.status === "on_leave").length], ["Latest gross payroll", money(L.gross)],
    ["Latest deductions", money(L.gross - L.net)], ["Latest net pay", money(L.net)],
    ["Latest run status", last ? `<span class="pr-tag ${last.status}">${last.status}</span>` : "None yet"],
    ["Contracts ending in 60 days", soon], ["Leave awaiting approval", leaves.filter(x => x.status === "pending").length]];
  g("pr-cards").innerHTML = cards.map(c => `<div class="stat-card"><div class="stat-info"><h3 class="stat-title">${c[0]}</h3><p class="stat-value">${c[1]}</p></div></div>`).join("");
  const rows = runs.slice(0, 12).map(r => `<tr><td>${esc(r.month.slice(0,7))}</td><td><span class="pr-tag ${r.status}">${r.status}</span></td><td class="pr-n">${money(by[r.id]?.gross)}</td><td class="pr-n">${money(by[r.id]?.cost)}</td></tr>`).join("");
  g("pr-trend").innerHTML = rows ? `<table class="table"><thead><tr><th>Month</th><th>Status</th><th class="pr-n">Gross</th><th class="pr-n">True cost (with employer contributions)</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="subtitle">No payroll runs yet. Add staff, then calculate your first month.</p>`;
}

// ---- staff ----
function renderStaff() {
  const q = (g("pr-sq").value || "").toLowerCase(), canEdit = ["head","hr"].includes(role);
  const list = staff.filter(x => (x.full_name + " " + (x.position || "") + " " + x.department).toLowerCase().includes(q));
  g("pr-stafftbl").innerHTML = list.length ? `<table class="table"><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Joined</th><th>Contract ends</th><th class="pr-n">Basic</th><th class="pr-n">Allowances</th><th>Status</th></tr></thead><tbody>${
    list.map(x => {
      const d = x.contract_end ? (new Date(x.contract_end) - Date.now()) / 864e5 : null;
      const alert = d !== null && d <= 60 ? ` <span class="pr-tag draft">${d < 0 ? "expired" : "ends soon"}</span>` : "";
      const st = canEdit ? `<select data-sid="${x.id}">${["active","on_leave","left"].map(o => `<option ${o === x.status ? "selected" : ""}>${o}</option>`).join("")}</select>` : `<span class="pr-tag">${esc(x.status)}</span>`;
      return `<tr><td>${esc(x.full_name)}${x.teacher_id ? ' <span class="pr-tag">teacher</span>' : ""}</td><td>${esc(x.position)}</td><td>${esc(x.department)}</td><td>${esc(x.date_joined)}</td><td>${esc(x.contract_end)}${alert}</td><td class="pr-n">${money(x.basic_salary)}</td><td class="pr-n">${money(x.allowances)}</td><td>${st}</td></tr>`;
    }).join("")
  }</tbody></table>` : `<p class="subtitle">${staff.length ? "No staff match your search." : "No staff yet. Use the form above to add the first member."}</p>`;
}
g("pr-sq").oninput = renderStaff;
g("pr-stafftbl").onchange = async e => {
  const id = e.target.dataset.sid; if (!id) return;
  const {error} = await sb.from("staff").update({status: e.target.value}).eq("id", id);
  if (error) toast("Could not update. You may not have permission."); else toast("Status updated");
  loadAll();
};
g("pr-add").onclick = async () => {
  const name = g("pr-name").value.trim();
  if (!name || !(g("pr-basic").value > 0)) return toast("Enter a name and a basic salary.");
  const {error} = await sb.from("staff").insert({full_name: name, national_id: g("pr-nid").value.trim() || null,
    position: g("pr-pos").value.trim(), department: g("pr-dep").value, date_joined: g("pr-join").value || null, contract_end: g("pr-cend").value || null,
    teacher_id: g("pr-tsel").value || null, basic_salary: +g("pr-basic").value, allowances: +g("pr-allow").value || 0, other_deductions: +g("pr-oth").value || 0});
  if (error) return toast("Could not save. You may not have permission.");
  ["pr-name","pr-nid","pr-pos","pr-join","pr-cend","pr-basic"].forEach(i => g(i).value = "");
  g("pr-tsel").value = ""; g("pr-name").readOnly = false;
  toast("Staff member saved"); loadAll();
};

// ---- payroll run ----
const paye = gross => (cfg.paye_bands || []).reduce((t, b) => t + Math.max(0, Math.min(gross, b.to ?? Infinity) - b.from) * b.rate / 100, 0);
function calcLine(s) {
  const r = n => Math.round(n * 100) / 100, gross = +s.basic_salary + +s.allowances;
  const base = +cfg.nssa_monthly_cap > 0 ? Math.min(gross, +cfg.nssa_monthly_cap) : gross;
  const p = paye(gross), aids = p * (+cfg.aids_levy_pct) / 100, nssa = base * (+cfg.nssa_employee_pct) / 100, oth = +s.other_deductions;
  return {staff_id: s.id, basic: r(s.basic_salary), allowances: r(s.allowances), gross: r(gross), paye: r(p), aids_levy: r(aids),
    nssa: r(nssa), other_deductions: r(oth), net: r(gross - p - aids - nssa - oth),
    employer_nssa: r(base * (+cfg.nssa_employer_pct) / 100), employer_zimdef: r(gross * (+cfg.zimdef_employer_pct) / 100)};
}
const COLS = ["basic","allowances","gross","paye","aids_levy","nssa","other_deductions","net"];
async function showRun() {
  const m = g("pr-pm").value; if (!m) return;
  curRun = runs.find(r => r.month.startsWith(m)) || null;
  g("pr-runtag").innerHTML = curRun ? `<span class="pr-tag ${curRun.status}">${curRun.status}</span>` : "";
  g("pr-appr").disabled = !(curRun && curRun.status === "draft" && role === "head");
  g("pr-paid").disabled = !(curRun && curRun.status === "approved" && ["head","accountant"].includes(role));
  if (!curRun) return g("pr-runtbl").innerHTML = `<p class="subtitle">No payroll for this month yet. Select “Calculate payroll” to create a draft.</p>`;
  const {data: L} = await sb.from("payroll_lines").select("*").eq("run_id", curRun.id);
  runLines = L;
  const nm = id => esc(staff.find(s => s.id === id)?.full_name || "Unknown");
  const sum = k => L.reduce((t, l) => t + +l[k], 0);
  g("pr-runtbl").innerHTML = `<table class="table"><thead><tr><th>Employee</th><th class="pr-n">Basic</th><th class="pr-n">Allowances</th><th class="pr-n">Gross</th><th class="pr-n">PAYE</th><th class="pr-n">AIDS levy</th><th class="pr-n">NSSA</th><th class="pr-n">Other</th><th class="pr-n">Net pay</th><th></th></tr></thead><tbody>${
    L.map(l => `<tr><td>${nm(l.staff_id)}</td>${COLS.map(k => `<td class="pr-n">${money(l[k])}</td>`).join("")}<td><button class="btn btn-secondary" data-slip="${l.id}" style="padding:3px 10px">Payslip</button></td></tr>`).join("")
  }</tbody><tfoot><tr><td>Total</td>${COLS.map(k => `<td class="pr-n">${money(sum(k))}</td>`).join("")}<td></td></tr></tfoot></table>`;
}
g("pr-pm").onchange = showRun;
g("pr-calc").onclick = async () => {
  const m = g("pr-pm").value; if (!m) return toast("Pick a month first.");
  if (curRun) return toast("Payroll for this month already exists. Corrections are made as adjustments, not recalculations.");
  if (!(cfg.paye_bands || []).length && !confirm("PAYE bands are empty, so PAYE will be zero. Continue anyway?")) return;
  const act = staff.filter(s => s.status === "active");
  if (!act.length) return toast("There are no active staff to pay.");
  const {data: run, error} = await sb.from("payroll_runs").insert({month: m + "-01"}).select().single();
  if (error) return toast("Could not create the run. You may not have permission.");
  const {error: e2} = await sb.from("payroll_lines").insert(act.map(s => ({run_id: run.id, ...calcLine(s)})));
  if (e2) return toast("Run created but lines failed to save. Contact support before continuing.");
  toast("Draft payroll calculated"); await loadAll(); showRun();
};
async function setStatus(st) {
  if (!confirm(`Mark this payroll as ${st}? This can’t be undone.`)) return;
  const patch = {status: st}; if (st === "approved") patch.approved_by = (await sb.auth.getUser()).data.user.id;
  const {error} = await sb.from("payroll_runs").update(patch).eq("id", curRun.id);
  if (error) return toast("Could not update. You may not have permission.");
  toast("Payroll " + st); await loadAll(); showRun();
}
g("pr-appr").onclick = () => setStatus("approved");
g("pr-paid").onclick = () => setStatus("paid");

// ---- payslip (opens a printable page) ----
g("pr-runtbl").onclick = e => { const id = e.target.dataset.slip; if (id) slip(runLines.find(l => l.id === id)); };
function slip(l) {
  const x = staff.find(v => v.id === l.staff_id) || {}, w = window.open("", "_blank");
  if (!w) return toast("Allow pop-ups to print payslips.");
  const row = (a, b) => `<tr><td>${a}</td><td style="text-align:right">${money(b)}</td></tr>`;
  w.document.write(`<!doctype html><title>Payslip</title><style>body{font:14px system-ui,sans-serif;max-width:560px;margin:30px auto;color:#16202a}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 4px;border-bottom:1px solid #ddd}.t td{font-weight:700;border-top:2px solid #333}small{color:#666}</style>
<h1>Shallom High School</h1><small>Payslip for ${esc(curRun.month.slice(0, 7))}${curRun.status === "draft" ? " (DRAFT, not yet approved)" : ""}</small>
<p><b>${esc(x.full_name)}</b><br>${esc(x.position || "")} · ${esc(x.department || "")}${x.national_id ? "<br>ID: " + esc(x.national_id) : ""}</p>
<table><tr><td colspan="2"><b>Earnings</b></td></tr>${row("Basic salary", l.basic)}${row("Allowances", l.allowances)}<tr class="t"><td>Gross pay</td><td style="text-align:right">${money(l.gross)}</td></tr></table>
<table><tr><td colspan="2"><b>Deductions</b></td></tr>${row("PAYE", l.paye)}${row("AIDS levy", l.aids_levy)}${row("NSSA", l.nssa)}${row("Other deductions", l.other_deductions)}<tr class="t"><td>Net pay</td><td style="text-align:right">${money(l.net)}</td></tr></table>
<small>Currency: ${esc(x.currency || "USD")}</small><script>onload=()=>print()<\/script>`);
  w.document.close();
}

// ---- leave ----
function fillLeaveStaff() {
  g("pr-lstaff").innerHTML = staff.filter(x => x.status !== "left").map(x => `<option value="${x.id}">${esc(x.full_name)}</option>`).join("");
}
function renderLeave() {
  const nm = id => esc(staff.find(x => x.id === id)?.full_name || "Unknown"), head = role === "head";
  g("pr-leavetbl").innerHTML = leaves.length ? `<table class="table"><thead><tr><th>Staff</th><th>Type</th><th>From</th><th>To</th><th class="pr-n">Days</th><th>Status</th><th></th></tr></thead><tbody>${
    leaves.map(x => `<tr><td>${nm(x.staff_id)}</td><td>${esc(x.leave_type)}</td><td>${esc(x.start_date)}</td><td>${esc(x.end_date)}</td><td class="pr-n">${x.days}</td><td><span class="pr-tag ${x.status === "approved" ? "paid" : x.status === "pending" ? "draft" : ""}">${x.status}</span></td><td>${head && x.status === "pending" ? `<button class="btn btn-secondary" style="padding:3px 10px" data-lv="approved" data-id="${x.id}">Approve</button> <button class="btn btn-secondary" style="padding:3px 10px" data-lv="rejected" data-id="${x.id}">Reject</button>` : ""}</td></tr>`).join("")
  }</tbody></table>` : `<p class="subtitle">No leave requests yet.</p>`;
}
g("pr-ladd").onclick = async () => {
  const a = g("pr-lfrom").value, b = g("pr-lto").value;
  if (!g("pr-lstaff").value || !a || !b || b < a) return toast("Pick a staff member and valid dates.");
  const {error} = await sb.from("leave_requests").insert({staff_id: g("pr-lstaff").value, leave_type: g("pr-ltype").value,
    start_date: a, end_date: b, days: Math.round((new Date(b) - new Date(a)) / 864e5) + 1, note: g("pr-lnote").value.trim() || null});
  if (error) return toast("Could not save. Run payroll_update_1.sql in Supabase, or check permissions.");
  ["pr-lfrom","pr-lto","pr-lnote"].forEach(i => g(i).value = ""); toast("Leave request saved"); loadAll();
};
g("pr-leavetbl").onclick = async e => {
  const st = e.target.dataset.lv; if (!st) return;
  const {error} = await sb.from("leave_requests").update({status: st}).eq("id", e.target.dataset.id);
  if (error) return toast("Only the head can decide leave requests.");
  toast("Leave " + st); loadAll();
};

// ---- settings (head only) ----
const SKEYS = ["nssa_employee_pct","nssa_employer_pct","nssa_monthly_cap","aids_levy_pct","zimdef_employer_pct"];
function fillSettings() {
  SKEYS.forEach(k => g("pr-s-" + k).value = cfg[k] ?? "");
  bands = (cfg.paye_bands || []).map(b => ({...b})); drawBands();
}
function drawBands() {
  g("pr-bands").innerHTML = bands.length ? `<table class="table"><thead><tr><th>From</th><th>Up to (blank = no limit)</th><th>Tax rate %</th><th></th></tr></thead><tbody>${
    bands.map((b, i) => `<tr>${["from","to","rate"].map(k => `<td><input type="number" step="0.01" data-i="${i}" data-k="${k}" value="${b[k] ?? ""}"></td>`).join("")}<td><button class="btn btn-secondary" data-del="${i}">Remove</button></td></tr>`).join("")
  }</tbody></table>` : `<p class="subtitle">No bands yet. Select “Add band” to start.</p>`;
}
g("pr-bands").oninput = e => { const {i, k} = e.target.dataset; if (i !== undefined) bands[i][k] = e.target.value === "" ? null : +e.target.value; };
g("pr-bands").onclick = e => { const i = e.target.dataset.del; if (i !== undefined) { bands.splice(+i, 1); drawBands(); } };
g("pr-addband").onclick = () => { bands.push({from: bands.length ? (bands[bands.length - 1].to ?? 0) : 0, to: null, rate: 0}); drawBands(); };
g("pr-saveset").onclick = async () => {
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (b.from == null || b.rate == null || b.rate < 0 || b.rate > 100 || (b.to != null && b.to <= b.from)) return toast("Check band " + (i + 1) + ": From, rate and Up to must make sense.");
    if (i && b.from !== bands[i - 1].to) return toast("Band " + (i + 1) + " must start where band " + i + " ends.");
    if (i < bands.length - 1 && b.to == null) return toast("Only the last band can have no upper limit.");
  }
  const rows = SKEYS.map(k => [k, +g("pr-s-" + k).value]).concat([["paye_bands", bands]]);
  const res = await Promise.all(rows.map(([key, value]) => sb.from("payroll_settings").update({value}).eq("key", key)));
  if (res.some(r => r.error)) return toast("Could not save. Only the head can change rates.");
  toast("Rates saved"); loadAll();
};

// ---- link staff to teachers already in the school system ----
let teacherList = [];
async function getTeachers() {
  try { const t = new Function("return typeof teachers!=='undefined'?teachers:null")(); if (Array.isArray(t) && t.length) return t; } catch (e) {}
  try { const base = findClient(); if (base) { const r = await base.from("teachers").select("*"); if (r.data) return r.data; } } catch (e) {}
  return [];
}
async function fillTeacherSelect() {
  const all = await getTeachers(), linked = new Set(staff.map(x => String(x.teacher_id)));
  teacherList = all.filter(t => t && t.name && String(t.status || "").toLowerCase() !== "inactive" && !linked.has(String(t.id)));
  g("pr-tsel").innerHTML = `<option value="">Not a teacher (type details)</option>` +
    teacherList.map(t => `<option value="${esc(t.id)}">${esc(t.name)}${t.department ? " (" + esc(t.department) + ")" : ""}</option>`).join("");
}
g("pr-tsel").onchange = () => {
  const t = teacherList.find(v => String(v.id) === g("pr-tsel").value);
  g("pr-name").readOnly = !!t;
  if (!t) return;
  g("pr-name").value = t.name; g("pr-pos").value = "Teacher" + (t.department ? " – " + t.department : ""); g("pr-dep").value = "Teaching";
};

// ---- tabs ----
root.querySelectorAll(".pr-tabs button").forEach(b => b.onclick = () => {
  root.querySelectorAll(".pr-tabs button").forEach(x => x.classList.toggle("on", x === b));
  ["dash","staff","pay","leave","set"].forEach(t => flag("pr-t-" + t, t === b.dataset.t));
});

// restore an earlier payroll session after a page refresh (quietly does nothing if none)
setTimeout(() => { try { connect(); start(); } catch (e) {} }, 1500);
})();
