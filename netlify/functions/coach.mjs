// AI coach for Purse Zero. Runs on Netlify; your Anthropic key never reaches the phone.
// Netlify → Site configuration → Environment variables:
//   ANTHROPIC_API_KEY  your key from console.anthropic.com
//   FIREBASE_API_KEY   the apiKey from config.js (used to check the sign-in)
//   ALLOWED_EMAILS     your Google email (comma-separate to allow more people)
//   ANTHROPIC_MODEL    optional, defaults to claude-sonnet-5-5

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // 1. Only signed-in, allowed users may use your AI credits
  const idToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!idToken) return new Response("Sign in first", { status: 401 });
  const look = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }) }
  );
  if (!look.ok) return new Response("Your sign-in expired. Close and reopen the app.", { status: 401 });
  const { users } = await look.json();
  const email = (users?.[0]?.email || "").toLowerCase();
  const allowed = (process.env.ALLOWED_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  if (!email || (allowed.length && !allowed.includes(email))) return new Response("This account isn't allowed to use the AI coach.", { status: 403 });

  // 2. Ask Claude
  let body;
  try { body = await req.json(); } catch { return new Response("Bad request", { status: 400 }); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length || JSON.stringify(messages).length > 60000) return new Response("Bad request", { status: 400 });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1500,
      messages
    })
  });
  if (r.status === 429) return new Response("Busy", { status: 429 });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return new Response(j?.error?.message || "AI request failed", { status: 502 });
  const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  return Response.json({ text });
};

export const config = { path: "/api/coach" };
