/* Purse Zero (shared edition): connects the app to Firebase and to the AI function.
   - Google sign-in, then a profile managed by the admin (approve, block, plan, AI limit, PIN reset)
   - Every person starts fresh and sets their own PIN; their money data is private to them
   The app itself is unchanged; it asks window.claude.use("db") / use("sample"). */
(function () {
  const cfg = window.PZ_CONFIG || {};
  const configured = cfg.firebase && cfg.firebase.apiKey && !/^PASTE/.test(cfg.firebase.apiKey);
  const ADMINS = (cfg.adminEmails || []).map(e => String(e).toLowerCase());
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  // remember an invite code from a shared link (?invite=CODE)
  try { const inv = new URLSearchParams(location.search).get("invite"); if (inv) localStorage.setItem("pz-invite", inv.trim()); } catch (e) {}

  /* ---------- gate (sign-in, welcome, waiting, blocked) ---------- */
  const style = document.createElement("style");
  style.textContent = `
    #pzGate{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow:auto;
      background:radial-gradient(90% 70% at 100% 0%,rgba(47,91,255,.5),transparent 60%),linear-gradient(160deg,#0E1330,#1B2457);color:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif}
    #pzGate[hidden]{display:none!important}
    .pzg{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;width:min(360px,100%)}
    .pzg img{border-radius:24px;box-shadow:0 14px 36px rgba(0,0,0,.35)}
    .pzg h2{margin:0;font-family:Syne,system-ui,sans-serif;font-size:1.6rem;font-weight:800}
    .pzg p{margin:0;color:rgba(255,255,255,.8);line-height:1.5}
    .pzg .b{all:unset;cursor:pointer;box-sizing:border-box;background:#fff;color:#0E1330;font-weight:800;padding:14px 22px;border-radius:14px;text-align:center}
    .pzg .b.ghost{background:rgba(255,255,255,.14);color:#fff}
    .pzg .b:focus-visible{outline:2px solid #E2B54B;outline-offset:3px}
    .pzg form{display:flex;flex-direction:column;gap:12px;width:100%;text-align:left}
    .pzg label{display:flex;flex-direction:column;gap:6px;font-size:.82rem;font-weight:700;color:rgba(255,255,255,.85)}
    .pzg input{font:inherit;font-size:16px;color:#0E1330;background:#fff;border:0;border-radius:12px;padding:12px 14px}
    .pzg .row2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .pzg .err{font-size:.84rem;color:#FFB0BB;min-height:1em}
    .pzg .small{font-size:.8rem;color:rgba(255,255,255,.65)}
    #pzNotice{margin:0;background:#FFF2D8;color:#7A4A00;border-radius:14px;padding:10px 14px;font-size:.86rem;display:flex;gap:10px;align-items:flex-start}
    #pzNotice button{all:unset;cursor:pointer;font-weight:800;margin-left:auto}`;
  document.head.appendChild(style);
  const gate = document.createElement("div");
  gate.id = "pzGate";
  document.addEventListener("DOMContentLoaded", () => { document.body.appendChild(gate); if (!gate.innerHTML) screen("loading"); });
  const logo = `<img src="/icons/icon-192.png" alt="" width="80" height="80">`;
  function screen(kind, extra = {}) {
    gate.hidden = false;
    const support = cfg.supportContact && !/^PASTE/.test(cfg.supportContact) ? `<p class="small">Questions: <b>${esc(cfg.supportContact)}</b></p>` : "";
    const views = {
      loading: `${logo}<h2>Purse Zero</h2><p>Opening…</p>`,
      setup: `${logo}<h2>Purse Zero</h2><p>Setup isn't finished: paste the Firebase config into config.js and deploy again.</p>`,
      signin: `${logo}<h2>Purse Zero</h2><p>Your private money app for EMIs, loans, payments and a plan to become debt‑free.</p>
        <button type="button" class="b" id="pzSignIn">Sign in with Google</button><p class="err" id="pzErr"></p>
        <p class="small">Only you can see your money data.</p>`,
      welcome: `${logo}<h2>Welcome${extra.name ? ", " + esc(extra.name.split(" ")[0]) : ""}!</h2>
        <p>You start with a fresh, empty app. Set a PIN so nobody else using your phone can open it.</p>
        <form id="pzWelcome" autocomplete="off">
          <label>Your name<input id="pzName" value="${esc(extra.name || "")}" maxlength="40"></label>
          <div class="row2"><label>New PIN (4–6 digits)<input id="pzPin1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
          <label>Repeat PIN<input id="pzPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label></div>
          <p class="err" id="pzErr"></p>
          <button type="button" class="b" id="pzStart">Start my app</button>
          <button type="button" class="b ghost" id="pzSkipPin">Skip PIN for now</button>
        </form>`,
      newpin: `${logo}<h2>Set a new PIN</h2><p>Your PIN was reset by the Purse Zero team. Choose a new one.</p>
        <form id="pzNewPin" autocomplete="off">
          <div class="row2"><label>New PIN<input id="pzPin1" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label>
          <label>Repeat PIN<input id="pzPin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password"></label></div>
          <p class="err" id="pzErr"></p>
          <button type="button" class="b" id="pzSavePin">Save PIN</button>
          <button type="button" class="b ghost" id="pzSkipPin">Continue without PIN</button>
        </form>`,
      pending: `${logo}<h2>Almost there</h2><p>Your request to use Purse Zero is waiting for approval. Open the app again once it's approved.</p>${support}
        <button type="button" class="b ghost" id="pzRetry">Check again</button><button type="button" class="b ghost" id="pzOut">Sign out</button>`,
      blocked: `${logo}<h2>Access paused</h2><p>Your Purse Zero access has been paused. Your data is safe and private.</p>${support}
        <button type="button" class="b ghost" id="pzOut">Sign out</button>`,
      error: `${logo}<h2>Couldn't open</h2><p>${esc(extra.msg || "Check your internet connection and try again.")}</p>
        <button type="button" class="b" id="pzRetry">Try again</button><button type="button" class="b ghost" id="pzOut">Sign out</button>`
    };
    gate.innerHTML = `<div class="pzg">${views[kind]}</div>`;
  }
  const setErr = m => { const el = document.getElementById("pzErr"); if (el) el.textContent = m || ""; };

  if (!configured) {
    document.addEventListener("DOMContentLoaded", () => screen("setup"));
    window.claude = { use: async () => null };
    return;
  }

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  const isAdminEmail = u => !!u && ADMINS.includes(String(u.email || "").toLowerCase());
  let resolveUser; const userReady = new Promise(r => (resolveUser = r));
  let PROFILE = null, SETTINGS = {};

  async function hashPin(p) {   // same as the app's lock screen
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("purse-zero:" + p));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
  }
  const dataRef = () => fs.doc(`users/${auth.currentUser.uid}/purse/main`);
  const profileRef = () => fs.doc(`profiles/${auth.currentUser.uid}`);
  function blankData(extra) {
    return Object.assign({ v: 5, example: false, income: 0, salaryDay: 1, living: 0, saveMonthly: 0, extra: 0, settle: {}, settleFund: 0, items: [],
      paid: {}, amounts: {}, notes: {}, oneoff: {}, expenses: [], payments: [], goals: [], savelog: [], pinHash: "", pinLen: 0 }, extra || {});
  }

  auth.getRedirectResult().catch(e => setErr(e.message));
  auth.onAuthStateChanged(u => { if (u) start(u).catch(err => screen("error", { msg: err.message })); else screen("signin"); });

  async function start(u) {
    screen("loading");
    // a different person on this phone: never show the previous person's data
    try {
      const last = localStorage.getItem("pz-uid");
      if (last && last !== u.uid) { localStorage.removeItem("purse-zero"); localStorage.setItem("pz-uid", u.uid); location.reload(); return; }
      localStorage.setItem("pz-uid", u.uid);
    } catch (e) {}

    try { const s = await fs.doc("settings/app").get(); SETTINGS = s.exists ? s.data() : {}; } catch (e) { SETTINGS = {}; }

    // profile: created on first sign-in; status decided by the sign-up mode
    let p = await profileRef().get();
    if (!p.exists) {
      let invite = ""; try { invite = localStorage.getItem("pz-invite") || ""; } catch (e) {}
      const mode = SETTINGS.signups || "approval";
      const status = isAdminEmail(u) || mode === "open" || (mode === "invite" && invite && invite === SETTINGS.inviteCode) ? "active" : "pending";
      const doc = { email: u.email, name: u.displayName || "", createdAt: today(), lastSeen: today(), status, plan: "free" };
      if (invite) doc.invite = invite;
      await profileRef().set(doc);
      p = await profileRef().get();
    }
    PROFILE = p.data();
    if (PROFILE.status === "blocked" && !isAdminEmail(u)) return screen("blocked");
    if (PROFILE.status !== "active" && !isAdminEmail(u)) return screen("pending");

    // first time: fresh empty app + own PIN
    const d = await dataRef().get();
    if (!d.exists) return welcome(u);

    // PIN reset requested by the admin
    if (PROFILE.pinReset) return newPin(u);

    if (PROFILE.lastSeen !== today()) profileRef().update({ lastSeen: today() }).catch(() => {});
    gate.hidden = true;
    showNotice();
    addSettings(u);
    resolveUser(u);
  }

  function welcome(u) {
    screen("welcome", { name: u.displayName || "" });
    const go = async withPin => {
      try {
        let pinHash = "", pinLen = 0;
        if (withPin) {
          const a = document.getElementById("pzPin1").value, b = document.getElementById("pzPin2").value;
          if (!/^\d{4,6}$/.test(a)) return setErr("PIN must be 4 to 6 digits.");
          if (a !== b) return setErr("The two PINs don't match.");
          pinHash = await hashPin(a); pinLen = a.length;
        }
        const name = document.getElementById("pzName").value.trim();
        const data = blankData({ pinHash, pinLen });
        await dataRef().set(data);
        if (name && name !== PROFILE.name) await profileRef().update({ name, lastSeen: today() });
        try { localStorage.setItem("purse-zero", JSON.stringify(data)); sessionStorage.setItem("pz-unlocked", "1"); } catch (e) {}
        location.reload();
      } catch (err) { setErr(err.message); }
    };
    document.getElementById("pzStart").onclick = () => go(true);
    document.getElementById("pzSkipPin").onclick = () => go(false);
  }

  function newPin(u) {
    screen("newpin");
    const finish = async withPin => {
      try {
        const upd = { pinHash: "", pinLen: 0 };
        if (withPin) {
          const a = document.getElementById("pzPin1").value, b = document.getElementById("pzPin2").value;
          if (!/^\d{4,6}$/.test(a)) return setErr("PIN must be 4 to 6 digits.");
          if (a !== b) return setErr("The two PINs don't match.");
          upd.pinHash = await hashPin(a); upd.pinLen = a.length;
        }
        await dataRef().update(upd);
        await profileRef().update({ pinReset: false });
        try { localStorage.removeItem("purse-zero"); sessionStorage.setItem("pz-unlocked", "1"); } catch (e) {}
        location.reload();
      } catch (err) { setErr(err.message); }
    };
    document.getElementById("pzSavePin").onclick = () => finish(true);
    document.getElementById("pzSkipPin").onclick = () => finish(false);
  }

  function showNotice() {
    const n = (SETTINGS.notice || "").trim(); if (!n) return;
    let seen = ""; try { seen = localStorage.getItem("pz-notice") || ""; } catch (e) {}
    if (seen === n) return;
    const el = document.createElement("div"); el.id = "pzNotice"; el.setAttribute("role", "status");
    el.innerHTML = `<span aria-hidden="true">📣</span><span>${esc(n)}</span><button type="button" aria-label="Dismiss">×</button>`;
    el.querySelector("button").onclick = () => { el.remove(); try { localStorage.setItem("pz-notice", n); } catch (e) {} };
    const top = document.querySelector(".app .top"); if (top) top.after(el);
  }

  /* gate buttons */
  document.addEventListener("click", async e => {
    const id = e.target.id;
    if (id === "pzSignIn") {
      const p = new firebase.auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(p); }
      catch (err) {
        if (/popup|operation-not-supported|web-storage/i.test(err.code || "")) { try { await auth.signInWithRedirect(p); } catch (e2) { setErr(e2.message); } }
        else setErr(err.message);
      }
    }
    if (id === "pzOut") { try { localStorage.removeItem("purse-zero"); localStorage.removeItem("pz-uid"); } catch (e2) {} await auth.signOut(); location.reload(); }
    if (id === "pzRetry") location.reload();
  });

  /* ---------- storage for the app ---------- */
  const dbApi = {
    doc(path) {
      const ref = () => fs.doc(`users/${auth.currentUser.uid}/${path}`);
      return {
        get: async () => { const s = await ref().get(); return { exists: true, data: () => (s.exists ? s.data() : blankData()) }; },
        set: async data => ref().set(data)
      };
    }
  };

  /* ---------- AI: online through the Netlify function, free smart coach otherwise ---------- */
  const fallback = e => e && (e.code === "off" || e.code === "network" || e.code === "limit");
  let limitNoted = false;
  async function online(input, opts = {}) {
    const user = await userReady;
    const token = await user.getIdToken();
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    let res;
    try {
      res = await fetch("/api/coach", { method: "POST", signal: opts.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ messages }) });
    } catch (e) { throw e && e.name === "AbortError" ? { code: "aborted" } : { code: "network", message: "No internet connection" }; }
    if (res.status === 402) throw { code: "limit", message: await res.text() };
    if (res.status === 429) throw { code: "rate_limited", message: "Busy, try again in a minute" };
    if (res.status === 503) throw { code: "off", message: "AI chat is switched off" };
    if (!res.ok) throw { code: "error", message: await res.text() };
    const { text } = await res.json();
    return text;
  }
  function noteLimit(e) {
    if (e && e.code === "limit" && !limitNoted) {
      limitNoted = true;
      const t = document.getElementById("toastMsg"), box = document.getElementById("toast");
      if (t && box) { t.textContent = "Monthly AI limit reached. Using the free smart coach."; box.hidden = false; setTimeout(() => (box.hidden = true), 4000); }
    }
  }
  async function sample(input, opts = {}) {
    let text;
    try { text = await online(input, opts); }
    catch (e) {
      if (!fallback(e) || !window.PZ_SMART_COACH) throw e;
      noteLimit(e);
      text = window.PZ_SMART_COACH.askFromPrompt(typeof input === "string" ? input : (input[input.length - 1] || {}).content || "");
    }
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false };
  }
  sample.json = async (input, opts = {}) => {
    let text;
    try { text = await online(typeof input === "string" ? input + "\n\nReturn only the JSON, with no code fences or extra words." : input, opts); }
    catch (e) { if (fallback(e) && window.PZ_SMART_COACH) { noteLimit(e); return window.PZ_SMART_COACH.reviewFromPrompt(input); } throw e; }
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    try { return JSON.parse(m ? m[0] : text); } catch (e) { throw { code: "invalid_json", message: "AI reply wasn't readable", text }; }
  };

  window.claude = { use: async name => (name === "db" ? (await userReady, dbApi) : name === "sample" ? sample : null) };

  /* ---------- settings: account, invite, backup, delete ---------- */
  function addSettings(user) {
    const host = document.querySelector('[data-opart="set"]');
    if (!host || document.getElementById("pzAcct")) return;
    const admin = isAdminEmail(user);
    const plan = admin ? "Admin" : PROFILE && PROFILE.plan === "pro" ? "Pro" : "Free";
    const card = document.createElement("div");
    card.className = "card"; card.id = "pzAcct";
    card.innerHTML = `
      <div class="head"><h3>Your account</h3><span class="pill ${plan === "Free" ? "plain" : "gold"}">${plan}</span></div>
      <p class="small muted">Signed in as <b></b>. Your money data is private: only this account can open it.</p>
      ${admin ? `<a class="btn sm dark" href="/admin.html" style="text-decoration:none;text-align:center">Open admin panel</a>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm ghost" type="button" id="pzShare">Invite a friend</button>
        <button class="btn sm ghost" type="button" id="pzExport">Download backup</button>
        <label class="btn sm ghost" style="cursor:pointer">Restore backup<input type="file" id="pzImport" accept="application/json,.json" hidden></label>
        <button class="btn sm ghost" type="button" id="pzOut2">Sign out</button>
      </div>
      <p class="tiny muted" id="pzMsg"></p>
      <details><summary class="small" style="cursor:pointer;color:var(--bad);font-weight:700">Delete my account</summary>
        <p class="small muted" style="margin:8px 0">This permanently deletes all your Purse Zero data and your account. Download a backup first if you may need it.</p>
        <button class="btn sm danger" type="button" id="pzDelete">Delete everything</button></details>`;
    card.querySelector("b").textContent = user.email || "";
    host.prepend(card);
    const msg = t => (card.querySelector("#pzMsg").textContent = t);
    card.querySelector("#pzOut2").onclick = async () => { try { localStorage.removeItem("purse-zero"); localStorage.removeItem("pz-uid"); } catch (e) {} await auth.signOut(); location.reload(); };
    card.querySelector("#pzShare").onclick = async () => {
      const code = SETTINGS.signups === "invite" && SETTINGS.inviteCode ? `?invite=${encodeURIComponent(SETTINGS.inviteCode)}` : "";
      const link = location.origin + "/" + code;
      const text = `I use Purse Zero to track EMIs, loans and payments. Try it: ${link}`;
      if (navigator.share) { try { await navigator.share({ title: "Purse Zero", text }); } catch (e) {} return; }
      try { await navigator.clipboard.writeText(text); msg("Invite link copied. Paste it in WhatsApp."); } catch (e) { msg(link); }
    };
    card.querySelector("#pzExport").onclick = async () => {
      const s = await dataRef().get();
      const blob = new Blob([JSON.stringify(s.exists ? s.data() : {}, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = `purse-zero-backup-${today()}.json`; document.body.appendChild(a); a.click(); a.remove();
    };
    card.querySelector("#pzImport").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const raw = JSON.parse(await f.text());
        const data = raw && raw.data && raw.data.items ? raw.data : raw;
        if (!data || !Array.isArray(data.items)) throw new Error("This file isn't a Purse Zero backup.");
        const cur = await dataRef().get();      // keep the PIN this person set on this account
        const keep = cur.exists ? { pinHash: cur.data().pinHash || "", pinLen: cur.data().pinLen || 0 } : {};
        const merged = Object.assign(JSON.parse(JSON.stringify(data)), keep);
        await dataRef().set(merged);
        try { localStorage.setItem("purse-zero", JSON.stringify(merged)); sessionStorage.setItem("pz-unlocked", "1"); } catch (e2) {}
        msg("Restored. Reloading…"); setTimeout(() => location.reload(), 600);
      } catch (err) { msg("Couldn't restore: " + err.message); }
    };
    const del = card.querySelector("#pzDelete");
    del.onclick = async () => {
      if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Tap again to confirm"; return; }
      try {
        await dataRef().delete();
        await profileRef().delete();
        try { localStorage.clear(); } catch (e) {}
        try { await auth.currentUser.delete(); }
        catch (e) { if (e.code === "auth/requires-recent-login") { await auth.currentUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider()); await auth.currentUser.delete(); } else throw e; }
        location.reload();
      } catch (err) { msg("Couldn't delete: " + err.message); }
    };
  }

  if (navigator.serviceWorker) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
})();
