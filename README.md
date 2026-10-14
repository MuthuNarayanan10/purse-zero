# Purse Zero: shared edition (Netlify + Firebase)

Share one link. Each person signs in with Google, starts with a **fresh empty app**, and sets **their own PIN**.
You manage everyone from **/admin.html**: approve or block people, give Pro, set AI limits, reset forgotten PINs, post notices.
**Nobody, including you as admin, can see another person's loans, payments or amounts.** The security rules enforce this.

---

## Cost: ₹0
- **Firebase Spark (free) plan.** Never click Upgrade or add billing. Free every day: 50,000 reads and 20,000 writes, plenty for hundreds of people. If a limit is hit, it pauses until the next day or month; you're never charged.
- **Netlify free plan.** 300 credits a month, no overage charges. Each deploy uses 15 credits, so batch your changes.
- **AI.** Everyone gets the free built-in smart coach. Optional free AI chat with Groq (no card). Each person's monthly AI questions are capped by you.

---

## Setup (about 30 minutes)

### 1. Firebase project
1. https://console.firebase.google.com → **Create a project** (`purse-zero`), Analytics off.
2. **Authentication → Get started → Sign-in method → Google → Enable**.
3. **Firestore Database → Create database** → **asia-south1 (Mumbai)** → **Production mode**.
4. **Project settings ⚙ → General → Your apps → Web (</>)** → register `purse-zero-web` → keep the config values open.

### 2. Security rules (with your email)
Open `firestore.rules`, replace `PASTE_YOUR_GMAIL@gmail.com` with **your Google email**, then paste the whole file into **Firestore → Rules** → **Publish**.

### 3. App config
Open `public/config.js`:
- replace each `PASTE_…` firebase value with the values from step 1.4,
- put your Google email in `adminEmails` and `supportContact`.

### 4. Server key for AI limits (2 min)
Firebase → **Project settings → Service accounts → Generate new private key** → a JSON file downloads.
Keep it secret: never put it in GitHub. You'll copy three values from it in step 6.

### 5. Optional free AI chat
https://console.groq.com → **API Keys → Create** → copy the `gsk_…` key. (Skip to use only the built-in coach.)

### 6. GitHub + Netlify
1. Push this folder to a **private** GitHub repo (`git init`, `git add .`, `git commit -m "Purse Zero"`, `git push`).
2. Netlify → **Add new site → Import from GitHub** → pick the repo. Leave build settings as they are; `netlify.toml` publishes the `public` folder and installs the function's library.
3. **Site configuration → Environment variables**, add:

| Key | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `project_id` from the key file |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the key file |
| `FIREBASE_PRIVATE_KEY` | `private_key` from the key file (whole value, including the BEGIN/END lines) |
| `ADMIN_EMAILS` | your Google email |
| `GROQ_API_KEY` | optional, from step 5 |

4. **Deploys → Trigger deploy**. Optionally rename the site (e.g. `purse-zero-app.netlify.app`) or add your own domain.

### 7. Allow your address
Firebase → **Authentication → Settings → Authorized domains → Add domain** → your Netlify address (and custom domain).

### 8. First sign-in = you
1. Open your site on your phone → **Sign in with Google** → set your PIN → **⋮ → Install app**.
2. Optional: **Settings → Restore backup** → `purse-zero-backup.json` to bring your existing data.
3. Open **Settings → Open admin panel** (or `/admin.html`).

---

## Sharing it with others
In the admin panel, **Who can join**:
- **Anyone can request, I approve** (default): people sign in and wait; you tap **Approve**.
- **Instant with invite code**: tap **New code → Save → Copy invite link**. People who open that link get in straight away; anyone else waits for approval.
- **Open to anyone**: everyone gets in immediately.

Send the link on WhatsApp. People can also tap **Settings → Invite a friend** in the app.

## What you can do as admin
- **Approve / Block / Unblock**: blocked people see "Access paused" and can't open their data (it stays saved and private).
- **Make Pro / Make Free**: Pro gets more AI questions.
- **AI limits**: defaults per plan (Free 10, Pro 100 a month), or a custom number per person. Counted on the server, so nobody can bypass them. When someone runs out, the app switches to the free smart coach.
- **Reset PIN**: next time they open the app they're asked to set a new PIN. Their data is untouched.
- **Notice**: a message shown once at the top of everyone's app.
- See sign-ups, last seen and AI questions used. You never see anyone's money data.

## What each person controls
Their own PIN, backup download/restore, sign out, and **Delete my account** (permanently deletes their data and account, as Play Store rules require).

---

## Check the security rules (2 minutes, recommended)
Firestore → **Rules → Rules Playground**. Turn on **Authenticated** and run:
1. Location `users/SOMEONE_ELSE/purse/main`, type **get**, provider google.com, your email → must be **Denied** (admins can't read others' data).
2. Location `profiles/abc`, type **create**, auth UID `abc`, email `test@x.com`, document `{"email":"test@x.com","name":"T","createdAt":"x","lastSeen":"x","status":"active","plan":"free"}` → must be **Denied** while sign-ups need approval (people can't approve themselves).
3. Same but `"status":"pending"` → **Allowed**.
4. Location `profiles/abc`, type **update** by UID `abc`, change `plan` to `pro` → **Denied**.

## Troubleshooting
- **"Can't read profiles" in admin**: the email in `firestore.rules` doesn't match the one you signed in with. Fix it and publish the rules again.
- **AI chat always uses the smart coach**: check `GROQ_API_KEY`, the three `FIREBASE_*` variables, then redeploy.
- **Sign-in popup fails**: check step 7.
- **Someone forgot their PIN**: Admin → **Reset PIN**.

## Files
- `public/index.html`: the app · `public/admin.html`: admin panel
- `public/config.js`: Firebase settings + admin email
- `public/firebase-shim.js`: sign-in, onboarding, PIN reset, notices, backup, account deletion
- `public/smart-coach.js`: free built-in coach (runs on the phone)
- `netlify/functions/coach.mjs`: AI chat with sign-in checks and per-person monthly limits
- `firestore.rules`: who can read and write what
- `package.json`: the server library the AI function uses
