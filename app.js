"use strict";
/* AIT SMART FEE KEEPER
   All records live in Supabase. This file holds no secrets: every request is checked
   by the database against the signed-in person's role (see supabase/schema.sql). */

const CLASSES = ["Creche","Nursery 1","Nursery 2","KG 1","KG 2","Basic 1","Basic 2","Basic 3","Basic 4","Basic 5","Basic 6","JHS 1","JHS 2","JHS 3"];
const IDLE_MIN = 30;          // sign out after this many minutes without use
const POLL_MS = 60000;        // refresh every minute as a backup to live updates
const EXPORT_KEY = "ait_fee_keeper_last_export";
const IDLE_FLAG = "ait_idle_signout";
const ROLE_LABEL = { admin: "ADMIN", bursar: "BURSAR", viewer: "VIEW ONLY" };

const $ = id => document.getElementById(id);
const cfg = window.AIT_CONFIG || {};

let sb = null, me = null, session = null;
let S = new Map(), P = [], FEES = {}, USERS = [], LOGS = [];
let PAY = new Map(), PAID = new Map();
let isAdmin = false, canWrite = false, busy = false, loaded = false, running = false, routing = false;
let rMode = "sum", qStatus = "", editId = null, channel = null, renderT = null, reloadT = null;
let pollT = null, idleT = null, waitT = null, lastAct = Date.now(), deferredInstall = null;

/* ---------- small helpers ---------- */
const money = n => "GH₵" + (Number(n) || 0).toLocaleString("en-GH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean).sort().join(" ");
const round2 = n => Math.round(n * 100) / 100;
function tidy(s) {
  s = s.trim().replace(/\s+/g, " ");
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = s.toLowerCase();
  return s.replace(/(^|[\s\-'’])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const fmtDate = d => { if (!d) return ""; const [y, m, dd] = d.split("-"); return new Date(y, m - 1, dd).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };
const fmtStamp = t => { const d = new Date(t); return isNaN(d) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); };
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 3200); }
function lev(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
function errText(e) {
  const m = (e && e.message) || "", c = e && e.code;
  if (c === "23505" || /students_name_key_uq|duplicate key/i.test(m)) return "A pupil with that name already exists.";
  if (c === "42501" || /row-level security|permission denied/i.test(m)) return "Your role does not allow that.";
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "No internet connection. Try again when you are online.";
  if (/JWT|expired/i.test(m)) return "Your sign-in expired. Sign in again.";
  return m || "Something went wrong. Try again.";
}
const need = r => { if (r.error) throw r.error; return r.data; };
async function upd(table, vals, match) {
  const d = need(await sb.from(table).update(vals).match(match).select());
  if (!d || !d.length) throw { message: "Your role does not allow that, or the record no longer exists." };
  return d[0];
}
async function fetchAll(table, cols, order, ascending = true) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const d = need(await sb.from(table).select(cols).order(order, { ascending }).range(from, from + 999));
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}
function ask(title, body, ok, danger, wantReason) {
  return new Promise(res => {
    $("cTitle").textContent = title; $("cBody").textContent = body;
    $("cReasonWrap").hidden = !wantReason; $("cReason").value = "";
    const b = $("cOk"); b.textContent = ok || "Confirm"; b.className = "btn" + (danger ? " danger" : "");
    $("confirmModal").hidden = false;
    const done = v => { $("confirmModal").hidden = true; b.onclick = null; $("cNo").onclick = null; res(v); };
    b.onclick = () => { const r = $("cReason").value.trim(); if (wantReason && !r) return toast("Enter a reason"); done({ reason: r }); };
    $("cNo").onclick = () => done(null);
  });
}
async function run(fn) {
  if (busy) return false;
  busy = true; document.body.setAttribute("data-busy", "");
  try { await fn(); return true; }
  catch (e) { toast(errText(e)); return false; }
  finally { busy = false; document.body.removeAttribute("data-busy"); }
}
function show(name) { ["Setup", "Auth", "Wait", "App"].forEach(n => { $("screen" + n).hidden = n !== name; }); }

/* ---------- derived data ---------- */
const feeOf = s => s.custom_fee != null ? Number(s.custom_fee) : (FEES[s.cls] || 0);
const paidBy = id => PAID.get(id) || 0;
const owingOf = s => Math.max(0, feeOf(s) - paidBy(s.id));
const activeStudents = () => [...S.values()].filter(s => !s.archived);
const liveRows = () => P.filter(p => !p.voided && S.has(p.student_id) && !S.get(p.student_id).archived);
const findByName = n => [...S.values()].find(s => norm(s.name) === norm(n));
function statusOf(s) { const f = feeOf(s), p = paidBy(s.id); if (!f) return "nofee"; if (p >= f) return "cleared"; return p > 0 ? "part" : "none"; }
const statusText = { nofee: "No fee set", cleared: "Cleared", part: "Part paid", none: "Not paid" };
function recompute() {
  PAY = new Map(); PAID = new Map();
  P.slice().sort((a, b) => b.paid_on.localeCompare(a.paid_on) || String(b.created_at).localeCompare(String(a.created_at))).forEach(p => {
    if (!PAY.has(p.student_id)) PAY.set(p.student_id, []);
    PAY.get(p.student_id).push(p);
    if (!p.voided) PAID.set(p.student_id, (PAID.get(p.student_id) || 0) + p.amount);
  });
}
function similar(name) {
  const k = norm(name); if (k.length < 4) return [];
  const kt = k.split(" "), out = [];
  for (const s of S.values()) {
    const sk = norm(s.name), st = sk.split(" ");
    if (sk === k) continue;
    const close = lev(k, sk) <= Math.min(2, Math.floor(sk.length / 4));
    const subset = (kt.length >= 2 && kt.every(t => st.includes(t))) || (st.length >= 2 && st.every(t => kt.includes(t)));
    if (close || subset) out.push(s);
  }
  return out.slice(0, 3);
}

/* ---------- loading and live updates ---------- */
async function loadAll() {
  const jobs = [
    fetchAll("students", "id,name,cls,custom_fee,archived,archive_reason", "id"),
    fetchAll("payments", "id,student_id,amount,paid_on,note,created_at,voided,void_reason", "id"),
    sb.from("class_fees").select("cls,fee")
  ];
  if (isAdmin) {
    jobs.push(sb.from("profiles").select("id,email,full_name,role,active,created_at").order("created_at"));
    jobs.push(sb.from("audit_log").select("at,user_name,action,details").order("id", { ascending: false }).limit(200));
  }
  const [st, pa, cf, us, lg] = await Promise.all(jobs);
  S = new Map(st.map(s => [s.id, { ...s, custom_fee: s.custom_fee == null ? null : Number(s.custom_fee) }]));
  P = pa.map(p => ({ ...p, amount: Number(p.amount) }));
  FEES = Object.fromEntries(need(cf).map(r => [r.cls, Number(r.fee)]));
  if (isAdmin) { USERS = need(us); LOGS = need(lg); }
  loaded = true;
  scheduleRender();
}
function softReload() { clearTimeout(reloadT); reloadT = setTimeout(() => { if (running) loadAll().catch(() => {}); }, 600); }
function subscribe() {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel("ait-live");
  ["students", "payments", "class_fees", "profiles"].forEach(t => channel.on("postgres_changes", { event: "*", schema: "public", table: t }, softReload));
  channel.subscribe();
}

/* ---------- rendering ---------- */
function scheduleRender() { clearTimeout(renderT); renderT = setTimeout(() => { recompute(); renderAll(); }, 0); }
function renderAll() { renderStats(); renderNames(); renderList(); renderReport(); renderFees(); renderMore(); }
function renderStats() {
  const act = activeStudents();
  $("sCol").textContent = money(liveRows().reduce((a, p) => a + p.amount, 0));
  $("sOwe").textContent = money(act.reduce((a, s) => a + owingOf(s), 0));
  $("sStu").textContent = act.length;
}
function renderNames() {
  $("nameList").innerHTML = activeStudents().sort((a, b) => a.name.localeCompare(b.name)).map(s => `<option value="${esc(s.name)}">${esc(s.cls)}</option>`).join("");
}
function fillSelects() {
  const opts = CLASSES.map(c => `<option>${c}</option>`).join("");
  $("fClass").innerHTML = `<option value="">Select class</option>` + opts;
  $("eClass").innerHTML = opts;
  $("qClass").innerHTML = `<option value="">All classes</option>` + opts;
  $("rClass").innerHTML = `<option value="">All classes</option>` + opts;
}

/* ---------- record a payment ---------- */
$("fName").addEventListener("input", () => {
  const n = $("fName").value, w = $("dupNote"), s = n.trim() && findByName(n);
  w.classList.remove("bad", "show");
  if (!n.trim()) return;
  if (s && s.archived) { w.textContent = `${s.name} is archived. Ask an admin to restore them from the More tab.`; w.classList.add("show", "bad"); return; }
  if (s) {
    $("fClass").value = s.cls;
    const f = feeOf(s);
    w.innerHTML = `<b>${esc(s.name)}</b> is already recorded in ${esc(s.cls)}. Paid so far ${money(paidBy(s.id))}${f ? `, still owing <b>${money(owingOf(s))}</b>` : ""}. This payment will be added to them.`;
    w.classList.add("show"); return;
  }
  const sim = similar(n);
  if (sim.length) {
    w.innerHTML = `Did you mean ${sim.map(x => `<button type="button" class="btn sm alt" data-use="${esc(x.name)}">${esc(x.name)} (${esc(x.cls)})</button>`).join(" ")}<div style="margin-top:6px">Otherwise this will be added as a new pupil.</div>`;
    w.classList.add("show");
  }
});
$("dupNote").addEventListener("click", e => {
  const b = e.target.closest("[data-use]"); if (!b) return;
  $("fName").value = b.dataset.use; $("fName").dispatchEvent(new Event("input"));
});
function resetForm() { $("fName").value = ""; $("fAmt").value = ""; $("fNote").value = ""; $("fClass").value = ""; $("dupNote").classList.remove("show", "bad"); }
async function commit(withPayment) {
  if (!canWrite) return toast("Your role is view only");
  const raw = $("fName").value, cls = $("fClass").value, amt = parseFloat($("fAmt").value), date = $("fDate").value || today(), note = $("fNote").value.trim();
  if (norm(raw) === "") return toast("Enter the pupil's name");
  if (!cls) return toast("Select the class");
  if (withPayment && !(amt > 0)) return toast("Enter a valid amount");
  if (withPayment && amt > 1000000) return toast("That amount looks too large. Check it");
  if (date > today()) return toast("The date cannot be in the future");
  let s = findByName(raw);
  if (s && s.archived) return toast(`${s.name} is archived. Ask an admin to restore them`);
  if (s && s.cls !== cls) {
    if (!await ask(`Move ${s.name} to ${cls}?`, `${s.name} is recorded in ${s.cls}. Confirm to move them to ${cls}.`, "Move pupil")) return;
  }
  if (!s) {
    const sim = similar(raw);
    if (sim.length && !await ask("Is this a new pupil?", `Similar names already exist: ${sim.map(x => x.name).join(", ")}. Add "${tidy(raw)}" as a different pupil?`, "Yes, new pupil")) return;
  }
  if (withPayment && s && P.some(p => !p.voided && p.student_id === s.id && p.amount === round2(amt) && p.paid_on === date)) {
    if (!await ask("Possible duplicate", `${s.name} already has a payment of ${money(amt)} dated ${fmtDate(date)}. Record it again?`, "Record again")) return;
  }
  await run(async () => {
    let created = false, moved = false;
    if (!s) {
      try {
        s = need(await sb.from("students").insert({ name: tidy(raw), cls }).select("id,name,cls,custom_fee,archived,archive_reason").single());
        created = true;
      } catch (e) {
        if (e && e.code === "23505") { await loadAll(); s = findByName(raw); if (!s) throw e; } else throw e;
      }
    }
    if (!created && s.cls !== cls) { await upd("students", { cls }, { id: s.id }); moved = true; }
    if (withPayment) {
      const a = round2(amt);
      try { need(await sb.from("payments").insert({ student_id: s.id, amount: a, paid_on: date, note: note || null }).select("id")); }
      catch (e) { await loadAll().catch(() => {}); throw { message: `${created ? s.name + " was added, but the" : "The"} payment was not saved. ${errText(e)}` }; }
      const o = Math.max(0, feeOf(s) - paidBy(s.id) - a);
      toast(`Saved ${money(a)} for ${s.name}` + (feeOf(s) ? (o > 0 ? `. Owing ${money(o)}` : ". Fees cleared") : ""));
    } else toast(created ? `${s.name} added` : moved ? `Class updated to ${cls}` : `${s.name} is already recorded`);
    resetForm(); $("fName").focus();
    await loadAll();
  });
}
$("saveBtn").onclick = () => commit(true);
$("addOnlyBtn").onclick = () => commit(false);

/* ---------- pupils ---------- */
function renderList() {
  const wrap = $("listWrap");
  if (!loaded) { wrap.innerHTML = '<div class="empty">Loading records…</div>'; return; }
  const q = $("qSearch").value.trim().toLowerCase(), cf = $("qClass").value;
  const open = new Set([...wrap.querySelectorAll(".stu.open")].map(e => e.dataset.id));
  const all = activeStudents(); let html = "";
  CLASSES.forEach(c => {
    if (cf && cf !== c) return;
    const list = all.filter(s => {
      if (s.cls !== c) return false;
      if (q && !s.name.toLowerCase().includes(q)) return false;
      if (qStatus === "owing" && !(owingOf(s) > 0)) return false;
      if (qStatus === "cleared" && statusOf(s) !== "cleared") return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) return;
    const owe = list.reduce((a, s) => a + owingOf(s), 0);
    html += `<div class="group"><div class="ghead">${c}<span class="num">${list.length} pupil${list.length > 1 ? "s" : ""} · owing ${money(owe)}</span></div><div class="gbody">`;
    list.forEach(s => {
      const ps = PAY.get(s.id) || [], liveN = ps.filter(x => !x.voided).length;
      const f = feeOf(s), p = paidBy(s.id), st = statusOf(s), o = owingOf(s), pct = f ? Math.min(100, Math.round(p / f * 100)) : 0;
      const right = st === "cleared" ? `<span class="pill ok">Cleared</span>` : st === "nofee" ? `<span class="pill nofee">No fee set</span>` : `<div class="bal"><b class="num">${money(o)}</b><small>owing</small></div>`;
      html += `<div class="stu ${open.has(s.id) ? "open" : ""}" data-id="${esc(s.id)}">
        <button class="stuTop" data-toggle="1"><div class="who"><div class="nm">${esc(s.name)}</div>
          <div class="sub num">Paid ${money(p)}${f ? ` of ${money(f)}` : ""}${s.custom_fee != null ? " · custom fee" : ""} · ${liveN} payment${liveN !== 1 ? "s" : ""}</div>
          ${f ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ""}</div>${right}</button>
        <div class="pays">${ps.map(x => `<div class="pay ${x.voided ? "void" : ""}"><div><b class="num">${money(x.amount)}</b> <span class="sub">${fmtDate(x.paid_on)}${x.note ? " · " + esc(x.note) : ""}${x.voided ? ` · voided: ${esc(x.void_reason || "")}` : ""}</span></div>${isAdmin && !x.voided ? `<button class="x" data-void="${esc(x.id)}">Void</button>` : ""}</div>`).join("") || '<div class="sub" style="padding:8px 0">No payments yet</div>'}
          <div class="actions">${canWrite ? `<button class="btn sm" data-addpay="${esc(s.id)}">Add payment</button><button class="btn sm alt" data-edit="${esc(s.id)}">Edit</button>` : ""}${isAdmin ? `<button class="btn sm danger" data-arch="${esc(s.id)}">Archive</button>` : ""}</div></div>
      </div>`;
    });
    html += `</div></div>`;
  });
  wrap.innerHTML = html || `<div class="empty">${all.length ? "No pupils match these filters." : isAdmin ? "No pupils yet.<br>Set the class fees in the Fees tab, then record the first payment." : canWrite ? "No pupils yet.<br>Record a payment to add the first pupil." : "No pupils have been recorded yet."}</div>`;
}
$("qSearch").oninput = renderList; $("qClass").onchange = renderList;
$("qStatus").onclick = e => {
  const b = e.target.closest(".chip"); if (!b) return; qStatus = b.dataset.v;
  $("qStatus").querySelectorAll(".chip").forEach(x => x.setAttribute("aria-pressed", x === b)); renderList();
};
$("listWrap").addEventListener("click", async e => {
  const t = e.target.closest("[data-toggle],[data-void],[data-edit],[data-arch],[data-addpay]"); if (!t) return;
  if (t.dataset.toggle) { t.closest(".stu").classList.toggle("open"); return; }
  if (t.dataset.addpay) { const s = S.get(t.dataset.addpay); showTab("add"); $("fName").value = s.name; $("fName").dispatchEvent(new Event("input")); $("fAmt").focus(); return; }
  if (t.dataset.void) {
    const p = P.find(x => x.id === t.dataset.void), s = S.get(p.student_id);
    const r = await ask("Void this payment?", `${money(p.amount)} from ${s ? s.name : "this pupil"} will stop counting. It stays visible with your reason.`, "Void payment", true, true);
    if (r) await run(async () => { await upd("payments", { voided: true, void_reason: r.reason }, { id: p.id }); toast("Payment voided"); await loadAll(); });
    return;
  }
  if (t.dataset.arch) {
    const s = S.get(t.dataset.arch);
    const r = await ask(`Archive ${s.name}?`, "They disappear from lists, totals and reports. Their payments are kept and they can be restored from the More tab.", "Archive", true, true);
    if (r) await run(async () => { await upd("students", { archived: true, archive_reason: r.reason }, { id: s.id }); toast("Pupil archived"); await loadAll(); });
    return;
  }
  if (t.dataset.edit) {
    const s = S.get(t.dataset.edit); editId = s.id;
    $("eName").value = s.name; $("eClass").value = s.cls; $("eFeeWrap").hidden = !isAdmin; $("eFee").value = s.custom_fee != null ? s.custom_fee : "";
    $("editModal").hidden = false;
  }
});
$("eCancel").onclick = () => { $("editModal").hidden = true; };
$("eSave").onclick = async () => {
  const n = $("eName").value; if (norm(n) === "") return toast("Name is required");
  const s = S.get(editId), vals = {}, newName = tidy(n), newCls = $("eClass").value;
  if (newName !== s.name) vals.name = newName;
  if (newCls !== s.cls) vals.cls = newCls;
  if (isAdmin) {
    const fv = $("eFee").value.trim(), nv = fv === "" ? null : Math.max(0, parseFloat(fv) || 0);
    if (nv !== s.custom_fee) vals.custom_fee = nv;
  }
  if (!Object.keys(vals).length) { $("editModal").hidden = true; return; }
  await run(async () => { await upd("students", vals, { id: s.id }); $("editModal").hidden = true; toast("Pupil updated"); await loadAll(); });
};

/* ---------- reports ---------- */
function sumRows() {
  const cf = $("rClass").value, st = $("rStatus").value;
  return activeStudents().filter(s => (!cf || s.cls === cf) && (st !== "owing" || owingOf(s) > 0) && (st !== "cleared" || statusOf(s) === "cleared"))
    .sort((a, b) => CLASSES.indexOf(a.cls) - CLASSES.indexOf(b.cls) || a.name.localeCompare(b.name));
}
function logRows() {
  const cf = $("rClass").value, from = $("rFrom").value, to = $("rTo").value;
  return liveRows().map(p => ({ p, s: S.get(p.student_id) })).filter(x => (!cf || x.s.cls === cf) && (!from || x.p.paid_on >= from) && (!to || x.p.paid_on <= to))
    .sort((a, b) => CLASSES.indexOf(a.s.cls) - CLASSES.indexOf(b.s.cls) || a.s.name.localeCompare(b.s.name) || a.p.paid_on.localeCompare(b.p.paid_on));
}
function renderReport() {
  const cf = $("rClass").value, body = $("rBody");
  $("rSumFilter").hidden = rMode !== "sum"; $("rDates").hidden = rMode !== "log";
  if (!loaded) { body.innerHTML = '<div class="empty">Loading records…</div>'; return; }
  if (rMode === "sum") {
    const rows = sumRows();
    $("rSub").textContent = `Fees summary · ${cf || "All classes"} · ${fmtDate(today())}`;
    if (!rows.length) { body.innerHTML = '<div class="empty">No pupils match these filters.</div>'; return; }
    let h = `<table><tr><th>Name</th><th class="r">Fee</th><th class="r">Paid</th><th class="r">Owing</th></tr>`, cur = "", f = 0, p = 0, o = 0, GF = 0, GP = 0, GO = 0;
    const flush = () => { if (cur) h += `<tr class="tot"><td>${cur} total</td><td class="r num">${money(f)}</td><td class="r num">${money(p)}</td><td class="r num">${money(o)}</td></tr>`; };
    rows.forEach(s => {
      if (s.cls !== cur) { flush(); cur = s.cls; f = p = o = 0; h += `<tr class="cls"><td colspan="4">${cur}</td></tr>`; }
      const fe = feeOf(s), pa = paidBy(s.id), ow = owingOf(s);
      h += `<tr><td>${esc(s.name)}<div class="sub">${statusText[statusOf(s)]}</div></td><td class="r num">${fe ? money(fe) : "–"}</td><td class="r num">${money(pa)}</td><td class="r num ${ow > 0 ? "owe" : ""}">${fe ? money(ow) : "–"}</td></tr>`;
      f += fe; p += pa; o += ow; GF += fe; GP += pa; GO += ow;
    });
    flush();
    h += `<tr class="grand"><td>Grand total (${rows.length})</td><td class="r num">${money(GF)}</td><td class="r num">${money(GP)}</td><td class="r num">${money(GO)}</td></tr></table>`;
    body.innerHTML = h;
  } else {
    const rows = logRows(), from = $("rFrom").value, to = $("rTo").value;
    $("rSub").textContent = `Payment log · ${cf || "All classes"} · ${from || to ? `${from ? fmtDate(from) : "start"} to ${to ? fmtDate(to) : "today"}` : "All dates"}`;
    if (!rows.length) { body.innerHTML = '<div class="empty">No payments match these filters.</div>'; return; }
    let h = `<table><tr><th>Name</th><th>Date</th><th class="r">Amount</th></tr>`, cur = "", sub = 0, grand = 0;
    const flush = () => { if (cur) h += `<tr class="tot"><td colspan="2">${cur} total</td><td class="r num">${money(sub)}</td></tr>`; };
    rows.forEach(({ p, s }) => {
      if (s.cls !== cur) { flush(); cur = s.cls; sub = 0; h += `<tr class="cls"><td colspan="3">${cur}</td></tr>`; }
      h += `<tr><td>${esc(s.name)}${p.note ? `<div class="sub">${esc(p.note)}</div>` : ""}</td><td>${fmtDate(p.paid_on)}</td><td class="r num">${money(p.amount)}</td></tr>`;
      sub += p.amount; grand += p.amount;
    });
    flush();
    h += `<tr class="grand"><td colspan="2">Grand total (${rows.length} payments)</td><td class="r num">${money(grand)}</td></tr></table>`;
    body.innerHTML = h;
  }
}
$("rMode").onclick = e => {
  const b = e.target.closest("button"); if (!b) return; rMode = b.dataset.v;
  $("rMode").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); renderReport();
};
["rClass", "rStatus", "rFrom", "rTo"].forEach(i => { $(i).onchange = renderReport; });

function cell(v) { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }
function download(name, content, type, isExport) {
  const a = document.createElement("a"), url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("Download started");
  if (isExport) { try { localStorage.setItem(EXPORT_KEY, today()); } catch (_) {} renderMore(); }
}
$("csvBtn").onclick = () => {
  if (rMode === "sum") {
    const rows = sumRows(); if (!rows.length) return toast("Nothing to download");
    let csv = "﻿Name,Class,Fee (GHS),Paid (GHS),Owing (GHS),Status\n" + rows.map(s => [cell(s.name), cell(s.cls), feeOf(s), paidBy(s.id), owingOf(s), cell(statusText[statusOf(s)])].join(",")).join("\n");
    csv += `\n,,${round2(rows.reduce((a, s) => a + feeOf(s), 0))},${round2(rows.reduce((a, s) => a + paidBy(s.id), 0))},${round2(rows.reduce((a, s) => a + owingOf(s), 0))},TOTAL`;
    download(`AIT-Fees-Summary-${today()}.csv`, csv, "text/csv;charset=utf-8");
  } else {
    const rows = logRows(); if (!rows.length) return toast("Nothing to download");
    let csv = "﻿Name,Class,Date,Amount (GHS),Note\n" + rows.map(({ p, s }) => [cell(s.name), cell(s.cls), p.paid_on, p.amount, cell(p.note || "")].join(",")).join("\n");
    csv += `\n,,TOTAL,${round2(rows.reduce((a, r) => a + r.p.amount, 0))},`;
    download(`AIT-Payment-Log-${today()}.csv`, csv, "text/csv;charset=utf-8");
  }
};
$("printBtn").onclick = () => {
  $("printMeta").textContent = `${$("rSub").textContent} · Prepared by ${me.full_name || me.email}`;
  window.print();
};

/* ---------- class fees ---------- */
function renderFees() {
  const el = $("feeList"); if (el.contains(document.activeElement)) return;
  el.innerHTML = CLASSES.map((c, i) => `<div class="feeRow"><label for="fee-${i}">${c}</label><input id="fee-${i}" class="num" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" value="${FEES[c] || ""}" ${isAdmin ? "" : "disabled"}></div>`).join("");
  $("feeSave").hidden = !isAdmin;
  $("feeLead").textContent = isAdmin
    ? "Set what each class pays for the term. Owing is the class fee minus what the pupil has paid. A single pupil can have their own fee from the Pupils tab."
    : "These are the class fees set by an admin. Owing is the class fee minus what the pupil has paid.";
}
$("feeSave").onclick = () => run(async () => {
  const f = {}; CLASSES.forEach((c, i) => { const v = parseFloat($("fee-" + i).value); f[c] = v > 0 ? round2(v) : 0; });
  const changed = CLASSES.filter(c => (f[c] || 0) !== (FEES[c] || 0));
  if (!changed.length) return toast("No changes to save");
  for (const c of changed) {
    if (c in FEES) await upd("class_fees", { fee: f[c] }, { cls: c });
    else need(await sb.from("class_fees").insert({ cls: c, fee: f[c] }));
  }
  toast("Class fees saved"); await loadAll();
});

/* ---------- more: account, people, exports, log ---------- */
async function renderMore() {
  if (!me) return;
  $("meName").textContent = me.full_name || me.email || "Signed in";
  $("meMail").textContent = `${me.email || ""} · ${ROLE_LABEL[me.role] || ""}`.replace(/^ · /, "");
  let last = ""; try { last = localStorage.getItem(EXPORT_KEY) || ""; } catch (_) {}
  $("lastExport").textContent = last ? `Last download on this device: ${fmtDate(last)}` : "No download yet on this device.";
  $("usersCard").hidden = !isAdmin; $("actCard").hidden = !isAdmin; $("archCard").hidden = !isAdmin;
  if (!isAdmin) return;
  renderUsers();
  const arch = [...S.values()].filter(s => s.archived);
  $("archList").innerHTML = arch.length
    ? arch.map(s => `<div class="urow"><div class="uinfo"><b>${esc(s.name)}</b><span class="sub">${esc(s.cls)}${s.archive_reason ? " · " + esc(s.archive_reason) : ""}</span></div><button class="btn sm alt" data-restore="${esc(s.id)}">Restore</button></div>`).join("")
    : '<div class="sub">No archived pupils.</div>';
  $("actList").innerHTML = LOGS.length
    ? LOGS.map(i => `<div class="logi">${esc(i.details)}<span class="sub">${fmtStamp(i.at)} · ${esc(i.user_name || "System")}</span></div>`).join("")
    : '<div class="sub">Nothing recorded yet.</div>';
}
function renderUsers() {
  const sel = v => `<select data-role aria-label="Role">${[["admin", "Admin"], ["bursar", "Bursar"], ["viewer", "View only"]].map(([k, l]) => `<option value="${k}" ${k === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const row = (u, pending) => `<div class="urow" data-uid="${esc(u.id)}"><div class="uinfo"><b>${esc(u.full_name || u.email || "Unnamed")}</b><span class="sub">${esc(u.email || "")}${u.id === me.id ? " · you" : ""}</span></div>${u.id === me.id ? "" : sel(pending ? "viewer" : u.role)}${pending ? `<button class="btn sm" data-approve>Approve</button>` : (u.id === me.id ? "" : `<button class="btn sm alt" data-disable>Disable</button>`)}</div>`;
  const pend = USERS.filter(u => !u.active), act = USERS.filter(u => u.active);
  $("usersList").innerHTML = (pend.length ? `<div class="subhead">Waiting for approval</div>${pend.map(u => row(u, true)).join("")}` : "") +
    `<div class="subhead">Has access</div>${act.map(u => row(u, false)).join("") || '<div class="sub">Nobody yet.</div>'}`;
}
$("usersList").addEventListener("click", async e => {
  const b = e.target.closest("[data-approve],[data-disable]"); if (!b) return;
  const rowEl = b.closest(".urow"), u = USERS.find(x => x.id === rowEl.dataset.uid), name = u.full_name || u.email;
  if (b.dataset.approve !== undefined) {
    const role = rowEl.querySelector("select").value;
    if (await ask(`Approve ${name}?`, `They will be able to open the records as ${ROLE_LABEL[role].toLowerCase()}.`, "Approve"))
      await run(async () => { await upd("profiles", { role, active: true }, { id: u.id }); toast(`${name} approved`); await loadAll(); });
  } else if (await ask(`Disable ${name}?`, "They are signed out of the records and cannot open them again until you approve them.", "Disable", true))
    await run(async () => { await upd("profiles", { active: false }, { id: u.id }); toast(`${name} disabled`); await loadAll(); });
});
$("usersList").addEventListener("change", async e => {
  const s = e.target.closest("select[data-role]"); if (!s) return;
  const rowEl = s.closest(".urow"), u = USERS.find(x => x.id === rowEl.dataset.uid); if (!u.active) return;
  const name = u.full_name || u.email;
  if (await ask(`Change role for ${name}?`, `They will become ${ROLE_LABEL[s.value].toLowerCase()}.`, "Change role"))
    await run(async () => { await upd("profiles", { role: s.value }, { id: u.id }); toast("Role changed"); await loadAll(); });
  else renderUsers();
});
$("archList").addEventListener("click", async e => {
  const b = e.target.closest("[data-restore]"); if (!b) return; const s = S.get(b.dataset.restore);
  await run(async () => { await upd("students", { archived: false }, { id: s.id }); toast(`${s.name} restored`); await loadAll(); });
});
$("expPay").onclick = () => {
  const rows = P.filter(p => S.has(p.student_id)).map(p => ({ p, s: S.get(p.student_id) })).sort((a, b) => a.p.paid_on.localeCompare(b.p.paid_on));
  if (!rows.length) return toast("Nothing to download");
  const csv = "﻿Date,Name,Class,Amount (GHS),Note,Status,Void reason\n" + rows.map(({ p, s }) => [p.paid_on, cell(s.name), cell(s.cls), p.amount, cell(p.note || ""), p.voided ? "Voided" : "Valid", cell(p.void_reason || "")].join(",")).join("\n");
  download(`AIT-All-Payments-${today()}.csv`, csv, "text/csv;charset=utf-8", true);
};
$("expAll").onclick = () => {
  const data = { exported: new Date().toISOString(), classFees: FEES, students: [...S.values()], payments: P };
  download(`AIT-Fee-Keeper-Backup-${today()}.json`, JSON.stringify(data, null, 2), "application/json", true);
};
$("logCsv").onclick = () => run(async () => {
  const items = await fetchAll("audit_log", "at,user_name,action,details", "id");
  if (!items.length) return toast("Nothing to download");
  const csv = "﻿Time,Person,Action,Details\n" + items.map(i => [i.at, cell(i.user_name || "System"), i.action, cell(i.details)].join(",")).join("\n");
  download(`AIT-Activity-Log-${today()}.csv`, csv, "text/csv;charset=utf-8");
});
$("passBtn").onclick = () => run(async () => {
  const p = $("newPass").value; if (p.length < 8) return toast("Use at least 8 characters");
  const r = await sb.auth.updateUser({ password: p }); if (r.error) throw r.error;
  $("newPass").value = ""; toast("Password updated");
});
$("outBtn").onclick = () => signOut(false);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredInstall = e; $("installBtn").hidden = false; });
$("installBtn").onclick = async () => { if (!deferredInstall) return; deferredInstall.prompt(); await deferredInstall.userChoice.catch(() => {}); deferredInstall = null; $("installBtn").hidden = true; };

/* ---------- tabs ---------- */
function showTab(name) {
  if (name === "add" && !canWrite) name = "list";
  document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x.dataset.tab === name));
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("on", t.id === "tab-" + name));
  document.querySelector("main").scrollTop = 0;
}
document.querySelectorAll("nav button").forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

/* ---------- sign in, sign out, approval ---------- */
function setAuthMsg(t, kind) { const m = $("authMsg"); if (!t) { m.hidden = true; return; } m.textContent = t; m.className = "msg" + (kind ? " " + kind : ""); m.hidden = false; }
function authErr(e) {
  const m = (e && e.message) || "";
  if (/invalid login/i.test(m)) return "Wrong email or password.";
  if (/not confirmed/i.test(m)) return "Confirm your email first. Check your inbox for the link.";
  if (/rate limit|too many|seconds/i.test(m)) return "Too many attempts. Wait a few minutes and try again.";
  if (/already registered|already exists/i.test(m)) return "That email already has an account. Sign in instead.";
  if (/password.*(short|least|weak)/i.test(m)) return "Choose a longer password (at least 8 characters).";
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "No internet connection.";
  if (/signups? not allowed|disabled/i.test(m)) return "New requests are switched off. Ask the admin to add you.";
  return m || "Something went wrong. Try again.";
}
function bindAuth() {
  $("authSeg").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    $("authSeg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    $("loginForm").hidden = b.dataset.v !== "in"; $("signupForm").hidden = b.dataset.v !== "up"; setAuthMsg("");
  };
  $("loginForm").onsubmit = async e => {
    e.preventDefault(); setAuthMsg(""); $("liBtn").disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: $("liEmail").value.trim(), password: $("liPass").value });
    $("liBtn").disabled = false;
    if (error) setAuthMsg(authErr(error), "bad");
  };
  $("signupForm").onsubmit = async e => {
    e.preventDefault(); setAuthMsg(""); $("suBtn").disabled = true;
    const { data, error } = await sb.auth.signUp({ email: $("suEmail").value.trim(), password: $("suPass").value, options: { data: { full_name: tidy($("suName").value) } } });
    $("suBtn").disabled = false;
    if (error) return setAuthMsg(authErr(error), "bad");
    if (!data.session) setAuthMsg("Almost done. Open the email we sent to confirm your address, then sign in. An admin will approve you after that.", "good");
  };
  $("forgotBtn").onclick = async () => {
    const email = $("liEmail").value.trim();
    if (!email) return setAuthMsg("Type your email above first.", "bad");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    setAuthMsg(error ? authErr(error) : "If that email has an account, a reset link is on its way.", error ? "bad" : "good");
  };
  $("waitCheck").onclick = () => recheck();
  $("waitOut").onclick = () => signOut(false);
  $("rcSave").onclick = async () => {
    const p = $("rcPass").value; if (p.length < 8) return toast("Use at least 8 characters");
    const { error } = await sb.auth.updateUser({ password: p });
    if (error) return toast(authErr(error));
    $("rcPass").value = ""; $("recoverModal").hidden = true; toast("Password updated");
  };
}
async function signOut(auto) {
  try { if (auto) sessionStorage.setItem(IDLE_FLAG, "1"); } catch (_) {}
  try { await sb.auth.signOut(); } catch (_) {}
  location.reload();   // clears every record from this device's memory
}
async function recheck() { const r = await sb.auth.getSession(); await route(r.data.session); }
function showWait(noProfile) {
  show("Wait");
  $("waitText").textContent = noProfile
    ? "Your login exists but has no profile yet. Tell the admin."
    : (me && me.full_name ? `${me.full_name}, your` : "Your") + " request has been received. An admin needs to approve it before you can open the records.";
  clearInterval(waitT); waitT = setInterval(() => { if (!running) recheck(); }, 20000);
}
async function route(sess) {
  session = sess;
  if (!sess) { stopApp(); show("Auth"); try { if (sessionStorage.getItem(IDLE_FLAG)) { sessionStorage.removeItem(IDLE_FLAG); setAuthMsg(`You were signed out after ${IDLE_MIN} minutes without use.`); } } catch (_) {} return; }
  if (running && me && me.id === sess.user.id) return;
  if (routing) return;
  routing = true;
  try {
    const r = await sb.from("profiles").select("id,email,full_name,role,active").eq("id", sess.user.id).maybeSingle();
    if (r.error) throw r.error;
    me = r.data;
    if (!me) return showWait(true);
    if (!me.active) return showWait(false);
    await startApp();
  } catch (e) { show("Auth"); setAuthMsg(errText(e), "bad"); }
  finally { routing = false; }
}
async function startApp() {
  running = true; clearInterval(waitT);
  isAdmin = me.role === "admin"; canWrite = isAdmin || me.role === "bursar";
  $("who").textContent = me.full_name || me.email || "Signed in";
  $("rolePill").textContent = ROLE_LABEL[me.role] || "";
  $("navAdd").hidden = !canWrite;
  document.querySelectorAll("#tab-add .btn, #tab-add input, #tab-add select").forEach(x => { x.disabled = !canWrite; });
  fillSelects(); $("fDate").value = today(); $("fDate").max = today();
  show("App"); showTab(canWrite ? "add" : "list");
  try { await loadAll(); } catch (e) { toast(errText(e)); }
  subscribe(); startTimers();
}
function stopApp() {
  running = false; loaded = false; me = null;
  if (channel && sb) { sb.removeChannel(channel); channel = null; }
  clearInterval(pollT); clearInterval(idleT); clearInterval(waitT);
}
function startTimers() {
  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(ev => addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true, capture: true }));
  clearInterval(idleT); idleT = setInterval(() => { if (Date.now() - lastAct > IDLE_MIN * 60000) signOut(true); }, 30000);
  clearInterval(pollT); pollT = setInterval(() => { if (!document.hidden) softReload(); }, POLL_MS);
}
document.addEventListener("visibilitychange", () => {
  if (!running || document.hidden) return;
  if (Date.now() - lastAct > IDLE_MIN * 60000) return signOut(true);
  softReload();
});

/* ---------- start ---------- */
function boot() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) { show("Setup"); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  bindAuth();
  sb.auth.onAuthStateChange((evt, sess) => {
    setTimeout(() => {   // never await Supabase calls inside this callback itself
      if (evt === "PASSWORD_RECOVERY") { $("recoverModal").hidden = false; return; }
      if (evt === "SIGNED_OUT") { route(null); return; }
      if (evt === "INITIAL_SESSION" || evt === "SIGNED_IN") route(sess);
    }, 0);
  });
}
boot();
