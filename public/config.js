// Paste your Firebase web config here (Firebase → Project settings → General → Your apps → Web app).
// These values are not secret; security comes from Google sign-in + the Firestore rules.
window.PZ_CONFIG = {
  firebase: {
    apiKey: "AIzaSyBfZQYd1OvdxqAF6CDAbkGgmmibVw1pZMk",
    authDomain: "purse-zero.firebaseapp.com",
    projectId: "purse-zero",
    storageBucket: "purse-zero.firebasestorage.app",
    messagingSenderId: "20331444440",
    appId: "1:20331444440:web:01ca3d0a4d20ad50c13fad"
  },
  // Who runs the app. Must match the email in firestore.rules. These accounts see the admin panel.
  adminEmails: ["amrmuthu10@gmail.com"],
  // Shown to people waiting for approval or blocked.
  supportContact: "amrmuthu10@gmail.com"
};
