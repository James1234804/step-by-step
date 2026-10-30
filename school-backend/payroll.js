/* payroll.js — Payroll & HR section. Loaded by index.html (like fees.js).
   Draws itself inside <section id="payroll-section">. Needs payroll_setup.sql run once in Supabase. */
(function () {
"use strict";
const root = document.getElementById("payroll-section");
if (!root) return;
const g = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = n => Number(n || 0).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
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
</div>

<div id="pr-app" class="pr-h">
  <div id="pr-cfgwarn" class="pr-warn pr-h">Tax rates are not set up yet, so PAYE would calculate as zero. Add the PAYE bands in the <b>payroll_settings</b> table before running payroll.</div>
  <div class="pr-tabs">
    <button data-t="dash" class="on">Dashboard</button><button data-t="staff">Staff</button><button data-t="pay">Payroll run</button>
  </div>

  <div id="pr-t-dash"><div class="stats-grid" id="pr-cards"></div>
    <div class="card"><div class="pr-tw" id="pr-trend"></div></div></div>

  <div id="pr-t-staff" class="pr-h">
    <div class="card pr-pad" id="pr-addp"><h3 style="margin:0 0 .8rem;font-size:1rem">Add staff member</h3>
      <div class="pr-grid">
        <div><label>Full name</label><input id="pr-name"></div>
        <div><label>National ID</label><input id="pr-nid"></div>
        <div><label>Position</label><input id="pr-pos"></div>
        <div><label>Department</label><select id="pr-dep"><option>Teaching</option><option>Administration</option><option>Grounds &amp; maintenance</option><option>Boarding</option></select></div>
        <div><label>Date joined</label><input id="pr-join" type="date"></div>
        <div><label>Basic salary</label><input id="pr-basic" type="number" min="0" step="0.01"></div>
        <div><label>Allowances</label><input id="pr-allow" type="number" min="0" step="0.01" value="0"></div>
        <div><label>Other deductions</label><input id="pr-oth" type="number" min="0" step="0.01" value="0"></div>
      </div>
      <button id="pr-add" class="btn btn-primary">Save staff member</button></div>
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
  const {data} = await sb.from("user_roles").select("role").eq("user_id", session.user.id).maybeSingle();
  if (!data) return view("denied");
  role = data.role;
  g("pr-who").textContent = session.user.email + " · " + role;
  flag("pr-out", true); flag("pr-addp", ["head","hr"].includes(role));
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
function resetIdle() { clearTimeout(idle); idle = setTimeout(signOut, 15 * 60 * 1000); } // 15 min idle sign-out
["click","keydown","mousemove"].forEach(e => document.addEventListener(e, () => role && resetIdle()));

// ---- data ----
async function loadAll() {
  const [s, r, c] = await Promise.all([
    sb.from("staff").select("*").order("full_name"),
    sb.from("payroll_runs").select("*").order("month", {ascending: false}),
    sb.from("payroll_settings").select("*")]);
  if (s.error || r.error || c.error) return toast("Could not load payroll data. Check your connection and permissions.");
  staff = s.data; runs = r.data; cfg = {};
  c.data.forEach(x => cfg[x.key] = x.value);
  flag("pr-cfgwarn", !(Array.isArray(cfg.paye_bands) && cfg.paye_bands.length));
  renderStaff(); await renderDash();
}
async function renderDash() {
  const act = staff.filter(s => s.status !== "left");
  const teach = act.filter(s => s.department === "Teaching").length;
  const {data: lines} = await sb.from("payroll_lines").select("run_id,gross,net,employer_nssa,employer_zimdef");
  const by = {};
  (lines || []).forEach(l => { const o = by[l.run_id] ??= {gross: 0, net: 0, cost: 0};
    o.gross += +l.gross; o.net += +l.net; o.cost += +l.gross + +l.employer_nssa + +l.employer_zimdef; });
  const last = runs[0], L = last && by[last.id] || {gross: 0, net: 0};
  const cards = [["Active staff", act.length], ["Teaching / non-teaching", teach + " / " + (act.length - teach)],
    ["On leave", act.filter(s => s.status === "on_leave").length], ["Latest gross payroll", money(L.gross)],
    ["Latest deductions", money(L.gross - L.net)], ["Latest net pay", money(L.net)],
    ["Latest run status", last ? `<span class="pr-tag ${last.status}">${last.status}</span>` : "None yet"]];
  g("pr-cards").innerHTML = cards.map(c => `<div class="stat-card"><div class="stat-info"><h3 class="stat-title">${c[0]}</h3><p class="stat-value">${c[1]}</p></div></div>`).join("");
  const rows = runs.slice(0, 12).map(r => `<tr><td>${esc(r.month.slice(0,7))}</td><td><span class="pr-tag ${r.status}">${r.status}</span></td><td class="pr-n">${money(by[r.id]?.gross)}</td><td class="pr-n">${money(by[r.id]?.cost)}</td></tr>`).join("");
  g("pr-trend").innerHTML = rows ? `<table class="table"><thead><tr><th>Month</th><th>Status</th><th class="pr-n">Gross</th><th class="pr-n">True cost (with employer contributions)</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="subtitle">No payroll runs yet. Add staff, then calculate your first month.</p>`;
}

// ---- staff ----
function renderStaff() {
  g("pr-stafftbl").innerHTML = staff.length ? `<table class="table"><thead><tr><th>Name</th><th>Position</th><th>Department</th><th>Joined</th><th class="pr-n">Basic</th><th class="pr-n">Allowances</th><th>Status</th></tr></thead><tbody>${
    staff.map(s => `<tr><td>${esc(s.full_name)}</td><td>${esc(s.position)}</td><td>${esc(s.department)}</td><td>${esc(s.date_joined)}</td><td class="pr-n">${money(s.basic_salary)}</td><td class="pr-n">${money(s.allowances)}</td><td><span class="pr-tag">${esc(s.status)}</span></td></tr>`).join("")
  }</tbody></table>` : `<p class="subtitle">No staff yet. Use the form above to add the first member.</p>`;
}
g("pr-add").onclick = async () => {
  const name = g("pr-name").value.trim();
  if (!name || !(g("pr-basic").value > 0)) return toast("Enter a name and a basic salary.");
  const {error} = await sb.from("staff").insert({full_name: name, national_id: g("pr-nid").value.trim() || null,
    position: g("pr-pos").value.trim(), department: g("pr-dep").value, date_joined: g("pr-join").value || null,
    basic_salary: +g("pr-basic").value, allowances: +g("pr-allow").value || 0, other_deductions: +g("pr-oth").value || 0});
  if (error) return toast("Could not save. You may not have permission.");
  ["pr-name","pr-nid","pr-pos","pr-join","pr-basic"].forEach(i => g(i).value = "");
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
  const nm = id => esc(staff.find(s => s.id === id)?.full_name || "Unknown");
  const sum = k => L.reduce((t, l) => t + +l[k], 0);
  g("pr-runtbl").innerHTML = `<table class="table"><thead><tr><th>Employee</th><th class="pr-n">Basic</th><th class="pr-n">Allowances</th><th class="pr-n">Gross</th><th class="pr-n">PAYE</th><th class="pr-n">AIDS levy</th><th class="pr-n">NSSA</th><th class="pr-n">Other</th><th class="pr-n">Net pay</th></tr></thead><tbody>${
    L.map(l => `<tr><td>${nm(l.staff_id)}</td>${COLS.map(k => `<td class="pr-n">${money(l[k])}</td>`).join("")}</tr>`).join("")
  }</tbody><tfoot><tr><td>Total</td>${COLS.map(k => `<td class="pr-n">${money(sum(k))}</td>`).join("")}</tr></tfoot></table>`;
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

// ---- tabs ----
root.querySelectorAll(".pr-tabs button").forEach(b => b.onclick = () => {
  root.querySelectorAll(".pr-tabs button").forEach(x => x.classList.toggle("on", x === b));
  ["dash","staff","pay"].forEach(t => flag("pr-t-" + t, t === b.dataset.t));
});

// restore an earlier payroll session after a page refresh (quietly does nothing if none)
setTimeout(() => { try { connect(); start(); } catch (e) {} }, 1500);
})();
