# Purse Zero: put it on Netlify + Firebase

About 20 minutes. You need a Google account, a GitHub account and a Netlify account.

## 1. Create the Firebase project (5 min)
1. Go to https://console.firebase.google.com → **Create a project** → name it `purse-zero` → you can turn Google Analytics off → **Create**.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable** → choose your support email → **Save**.
3. **Build → Firestore Database → Create database** → location **asia-south1 (Mumbai)** → **Start in production mode** → **Create**.
4. In Firestore open the **Rules** tab, replace everything with the contents of `firestore.rules` from this folder → **Publish**.
5. **Project settings (gear) → General → Your apps → Web (</>)** → nickname `purse-zero-web` → **Register app** (don't tick Hosting). Copy the `firebaseConfig` values shown.

## 2. Put your Firebase config in the app (1 min)
Open `config.js` and replace each `PASTE_…` value with the values you just copied. Save.

## 3. Get an Anthropic API key for the AI coach (2 min)
https://console.anthropic.com → **API Keys → Create key** → copy it (starts with `sk-ant-`). Add a little credit under **Billing**; normal use costs a few rupees a month. Never put this key in any file.

## 4. Push to GitHub (3 min)
Create a **private** repo called `purse-zero`, then from this folder:
```
git init
git add .
git commit -m "Purse Zero"
git branch -M main
git remote add origin https://github.com/<your-username>/purse-zero.git
git push -u origin main
```

## 5. Deploy on Netlify (4 min)
1. https://app.netlify.com → **Add new site → Import an existing project → GitHub** → pick `purse-zero`.
2. Leave build command empty and publish directory as `.` (netlify.toml already sets this) → **Deploy**.
3. **Site configuration → Environment variables → Add a variable**, add these, then **Deploys → Trigger deploy → Deploy site**:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your `sk-ant-…` key |
| `FIREBASE_API_KEY` | the `apiKey` from config.js |
| `ALLOWED_EMAILS` | your Gmail address (only this account can use the AI) |

4. Optional: **Site configuration → Change site name** → e.g. `purse-zero-muthu` gives `purse-zero-muthu.netlify.app`. Or add your own domain under **Domain management**.

## 6. Allow your Netlify address in Firebase (1 min)
Firebase → **Authentication → Settings → Authorized domains → Add domain** → `purse-zero-muthu.netlify.app` (and your own domain if you added one).

## 7. Install on your phone (2 min)
1. Open your Netlify address in **Chrome** on the phone → **Sign in with Google**.
2. Chrome menu **⋮ → Install app**. The Purse Zero icon appears on your home screen and opens full screen, with no browser or Claude bar.
3. In the app: profile button (top right) → **Settings → Restore from backup** → choose `purse-zero-backup.json`. All your loans, payments and paid marks come across.

## Updating later
Edit the files, `git commit` and `git push`. Netlify redeploys in under a minute, and the installed app picks it up the next time it opens.

## If something doesn't work
- **Sign-in popup closes or errors**: check step 6 (authorized domain), then reload.
- **"Setup isn't finished"** on the sign-in screen: `config.js` still has `PASTE_` values.
- **AI coach says "not allowed"**: `ALLOWED_EMAILS` must match the Google account you signed in with. Redeploy after changing environment variables.
- **AI coach says "AI request failed"**: check the API key and that your Anthropic account has credit.

## What's in this folder
- `index.html`: the app
- `config.js`: your Firebase settings (safe to commit; Firebase web config isn't secret)
- `firebase-shim.js`: sign-in, private storage, backup/restore, AI connection
- `netlify/functions/coach.mjs`: the AI coach. Your Anthropic key stays on Netlify, never on the phone
- `firestore.rules`: only you can read or write your data
- `manifest.webmanifest`, `sw.js`, `icons/`: make it installable with its own icon and able to open offline
