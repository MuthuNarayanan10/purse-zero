/* Purse Zero standalone: connects the app to Firebase (sign-in + private storage)
   and to the Netlify AI function. The app itself is unchanged; it asks
   window.claude.use("db") / use("sample") and gets these implementations. */
(function () {
  const cfg = window.PZ_CONFIG || {};
  const configured = cfg.firebase && cfg.firebase.apiKey && !/^PASTE/.test(cfg.firebase.apiKey);

  /* ---------- sign-in gate ---------- */
  const gate = document.createElement("div");
  gate.id = "pzGate";
  gate.innerHTML = `
    <div class="pzg-card">
      <img src="/icons/icon-192.png" alt="" width="84" height="84">
      <h2>Purse Zero</h2>
      <p id="pzgMsg">Your private money app. Sign in to open your data.</p>
      <button type="button" id="pzgBtn">Sign in with Google</button>
      <p class="pzg-small" id="pzgErr"></p>
    </div>`;
  const style = document.createElement("style");
  style.textContent = `
    #pzGate{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:24px 16px;
      background:radial-gradient(90% 70% at 100% 0%,rgba(47,91,255,.5),transparent 60%),linear-gradient(160deg,#0E1330,#1B2457);color:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif}
    #pzGate[hidden]{display:none!important}
    .pzg-card{display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center;max-width:340px}
    .pzg-card img{border-radius:24px;box-shadow:0 14px 36px rgba(0,0,0,.35)}
    .pzg-card h2{margin:0;font-family:Syne,system-ui,sans-serif;font-size:1.7rem;font-weight:800}
    .pzg-card p{margin:0;color:rgba(255,255,255,.78);line-height:1.5}
    #pzgBtn{all:unset;cursor:pointer;background:#fff;color:#0E1330;font-weight:800;padding:14px 22px;border-radius:14px}
    #pzgBtn:focus-visible{outline:2px solid #E2B54B;outline-offset:3px}
    .pzg-small{font-size:.82rem;color:#FFB0BB!important;min-height:1em}`;
  document.head.appendChild(style);
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(gate));

  if (!configured) {
    document.addEventListener("DOMContentLoaded", () => {
      document.getElementById("pzgMsg").textContent = "Setup isn't finished: paste your Firebase config into config.js and deploy again.";
      document.getElementById("pzgBtn").hidden = true;
    });
    window.claude = { use: async () => null };
    return;
  }

  firebase.initializeApp(cfg.firebase);
  const auth = firebase.auth();
  const fs = firebase.firestore();
  let resolveUser;
  const userReady = new Promise(r => (resolveUser = r));

  auth.getRedirectResult().catch(e => showErr(e));
  auth.onAuthStateChanged(u => {
    if (u) { gate.hidden = true; resolveUser(u); addSettings(u); }
    else { gate.hidden = false; }
  });
  function showErr(e) { const el = document.getElementById("pzgErr"); if (el) el.textContent = (e && e.message) || String(e); }
  document.addEventListener("click", async e => {
    if (e.target.id !== "pzgBtn") return;
    const p = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(p); }
    catch (err) {
      if (/popup|operation-not-supported|web-storage/i.test(err.code || "")) { try { await auth.signInWithRedirect(p); } catch (e2) { showErr(e2); } }
      else showErr(err);
    }
  });

  /* ---------- storage: users/{uid}/purse/main ---------- */
  const dbApi = {
    doc(path) {
      const ref = () => fs.doc(`users/${auth.currentUser.uid}/${path}`);
      return {
        get: async () => { const s = await ref().get(); return { exists: s.exists, data: () => s.data() }; },
        set: async data => ref().set(data)
      };
    }
  };

  /* ---------- AI coach through the Netlify function ---------- */
  async function sample(input, opts = {}) {
    const user = await userReady;
    const token = await user.getIdToken();
    const messages = typeof input === "string" ? [{ role: "user", content: input }] : input;
    let res;
    try {
      res = await fetch("/api/coach", {
        method: "POST", signal: opts.signal,
        headers: { "content-type": "application/json", authorization: "Bearer " + token },
        body: JSON.stringify({ messages, json: !!opts._json })
      });
    } catch (e) { throw e && e.name === "AbortError" ? { code: "aborted" } : { code: "network", message: "No internet connection" }; }
    if (res.status === 429) throw { code: "rate_limited", message: "Busy, try again in a minute" };
    if (!res.ok) throw { code: "error", message: await res.text() };
    const { text } = await res.json();
    if (opts.onText) opts.onText({ text, delta: text });
    return { text, truncated: false };
  }
  sample.json = async (input, opts = {}) => {
    const { text } = await sample(typeof input === "string" ? input + "\n\nReturn only the JSON, with no code fences or extra words." : input, { ...opts, _json: true });
    const m = text.match(/[\[{][\s\S]*[\]}]/);
    try { return JSON.parse(m ? m[0] : text); } catch (e) { throw { code: "invalid_json", message: "AI reply wasn't readable", text }; }
  };

  window.claude = {
    use: async name => {
      if (name === "db") { await userReady; return dbApi; }
      if (name === "sample") return sample;
      return null;
    }
  };

  /* ---------- settings: backup, restore, sign out ---------- */
  function addSettings(user) {
    const host = document.querySelector('[data-opart="set"]');
    if (!host || document.getElementById("pzAcct")) return;
    const card = document.createElement("div");
    card.className = "card"; card.id = "pzAcct";
    card.innerHTML = `
      <div class="head"><h3>Account &amp; backup</h3><button class="btn sm ghost" type="button" id="pzOut">Sign out</button></div>
      <p class="small muted">Signed in as <b></b>. Only this Google account can open your data.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn sm dark" type="button" id="pzExport">Download backup</button>
        <label class="btn sm ghost" style="cursor:pointer">Restore from backup<input type="file" id="pzImport" accept="application/json,.json" hidden></label>
      </div>
      <p class="tiny muted" id="pzMsg">Restoring replaces everything in the app with the backup file.</p>`;
    card.querySelector("b").textContent = user.email || "";
    host.prepend(card);
    const ref = () => fs.doc(`users/${auth.currentUser.uid}/purse/main`);
    card.querySelector("#pzOut").onclick = async () => { try { localStorage.removeItem("purse-zero"); } catch (e) {} await auth.signOut(); location.reload(); };
    card.querySelector("#pzExport").onclick = async () => {
      const s = await ref().get();
      const data = s.exists ? s.data() : JSON.parse(localStorage.getItem("purse-zero") || "{}");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `purse-zero-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
    };
    card.querySelector("#pzImport").onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const msg = card.querySelector("#pzMsg");
      try {
        const raw = JSON.parse(await f.text());
        const data = raw && raw.data && raw.data.items ? raw.data : raw;   // accepts a plain backup or an exported record
        if (!data || !Array.isArray(data.items)) throw new Error("This file isn't a Purse Zero backup.");
        await ref().set(JSON.parse(JSON.stringify(data)));
        try { localStorage.setItem("purse-zero", JSON.stringify(data)); } catch (e2) {}
        msg.textContent = "Restored. Reloading…"; setTimeout(() => location.reload(), 600);
      } catch (err) { msg.textContent = "Couldn't restore: " + err.message; }
    };
  }

  /* ---------- installable + works offline ---------- */
  if (navigator.serviceWorker) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
})();
