// Purse Zero AI chat. Runs on Netlify; API keys never reach anyone's phone.
//
// Netlify → Site configuration → Environment variables
//   Required for sign-in checks and per-user limits (Firebase → Project settings → Service accounts → Generate new private key):
//     FIREBASE_PROJECT_ID     "project_id" from the key file
//     FIREBASE_CLIENT_EMAIL   "client_email" from the key file
//     FIREBASE_PRIVATE_KEY    "private_key" from the key file (paste it whole, including BEGIN/END lines)
//   AI provider (set one; with none, everyone gets the free built-in smart coach):
//     GROQ_API_KEY            free key from console.groq.com
//     ANTHROPIC_API_KEY       paid key from console.anthropic.com (used when GROQ_API_KEY isn't set)
//   Optional:
//     GROQ_MODEL / ANTHROPIC_MODEL, ADMIN_EMAILS (comma-separated, unlimited AI)
//
// Monthly AI questions per person = profile.aiLimit if the admin set one,
// otherwise settings.proAiLimit (Pro) or settings.freeAiLimit (Free). Defaults: Pro 100, Free 10.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

function admin() {
  if (!getApps().length) {
    initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
    }) });
  }
  return { auth: getAuth(), db: getFirestore() };
}
const text = (t, status) => new Response(t, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export default async (req) => {
  if (req.method !== "POST") return text("Method not allowed", 405);
  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) return text("off", 503);
  if (!process.env.FIREBASE_PRIVATE_KEY) return text("Server setup isn't finished (Firebase service account).", 500);

  // 1. Who is asking? Verify the Google sign-in properly.
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!idToken) return text("Sign in first", 401);
  const { auth, db } = admin();
  let user;
  try { user = await auth.verifyIdToken(idToken); } catch { return text("Your sign-in expired. Close and reopen the app.", 401); }
  const email = String(user.email || "").toLowerCase();
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  const isAdmin = user.email_verified && admins.includes(email);

  // 2. Is this person allowed, and within this month's limit? (counted on the server; users can't change it)
  const month = new Date().toISOString().slice(0, 7);
  const profileRef = db.doc(`profiles/${user.uid}`);
  const settings = (await db.doc("settings/app").get()).data() || {};
  try {
    await db.runTransaction(async tx => {
      const snap = await tx.get(profileRef);
      const p = snap.data() || {};
      if (!isAdmin && p.status !== "active") throw Object.assign(new Error("Your account isn't active."), { code: 403 });
      const limit = isAdmin ? 1000 : Number.isFinite(p.aiLimit) ? p.aiLimit : p.plan === "pro" ? (settings.proAiLimit ?? 100) : (settings.freeAiLimit ?? 10);
      const used = (p.aiUsed && p.aiUsed[month]) || 0;
      if (used >= limit) throw Object.assign(new Error(`You've used your ${limit} AI questions for this month.`), { code: 402 });
      tx.set(profileRef, { aiUsed: { [month]: FieldValue.increment(1) }, aiLast: new Date().toISOString() }, { merge: true });
    });
  } catch (e) { return text(e.message, e.code === 402 ? 402 : e.code === 403 ? 403 : 500); }

  // 3. Ask the AI
  let body;
  try { body = await req.json(); } catch { return text("Bad request", 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length || JSON.stringify(messages).length > 60000) return text("Bad request", 400);

  if (process.env.GROQ_API_KEY) {
    const g = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile", messages, max_tokens: 1500, temperature: 0.3 })
    });
    if (g.status === 429) return text("Busy", 429);
    const gj = await g.json().catch(() => ({}));
    if (!g.ok) return text(gj?.error?.message || "AI request failed", 502);
    return Response.json({ text: gj?.choices?.[0]?.message?.content || "" });
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5", max_tokens: 1500, messages })
  });
  if (r.status === 429) return text("Busy", 429);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return text(j?.error?.message || "AI request failed", 502);
  return Response.json({ text: (j.content || []).filter(b => b.type === "text").map(b => b.text).join("") });
};

export const config = { path: "/api/coach" };
