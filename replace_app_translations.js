const fs = require('fs');
let code = fs.readFileSync('c:/Users/isaac/taskflow/taskflow/src/App.js', 'utf8');

// Replace settings and navigation labels mapped to the t.xxx translations
const replacements = [
  // Nav items (around line ~8800)
  { from: `label: "Goals"`, to: `label: t.goals` },
  { from: `label: "Habits"`, to: `label: t.habits` },
  { from: `label: "Planner"`, to: `label: t.planner` },
  { from: `label: "Notes"`, to: `label: t.notes` },
  { from: `label: "Collaborate"`, to: `label: t.collab` },
  { from: `label: "LIBI AI"`, to: `label: t.bot` },
  { from: `label: "Board"`, to: `label: t.board || "Board"` }, // board is safe fallback
  
  // Settings items (around line ~4000)
  { from: `Appearance, account &amp; preferences`, to: `Appearance, account &amp; preferences` }, // HTML encoded in source! wait, we will use {t.appearanceHelp}
  { from: `Appearance, account & preferences`, to: `{t.appearanceHelp}` },
  { from: `<span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>{t.settings}</span>\n          </div>\n          <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>Appearance, account &amp; preferences</div>`, to: `<span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>{t.settings}</span>\n          </div>\n          <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>{t.appearanceHelp}</div>` },
  
  { from: `<SectionLabel>Account</SectionLabel>`, to: `<SectionLabel>{t.account || "Account"}</SectionLabel>` },
  { from: `>Sign in with Google<`, to: `>{t.signInWith || "Sign in with Google"}<` },
  { from: `>Signed in with Google<`, to: `>{t.signedInWith || "Signed in with Google"}<` },
  { from: `>Sync tasks across devices<`, to: `>{t.syncTasks || "Sync tasks across devices"}<` },
  { from: `>Sign out<`, to: `>{t.signOut || "Sign out"}<` },
  { from: `>Sign out\n              </PillBtn>`, to: `>{t.signOut || "Sign out"}\n              </PillBtn>`},
  
  { from: `<SectionLabel>Appearance</SectionLabel>`, to: `<SectionLabel>{t.theme || "Appearance"}</SectionLabel>` },
  { from: `>{dark ? "Dark Mode" : "Light Mode"}<`, to: `>{dark ? t.darkMode : t.lightMode}<` },
  { from: `>Tap to switch theme<`, to: `>{t.tapSwitchTheme || "Tap to switch theme"}<` },
  { from: `>Accent Colour<`, to: `>{t.accentColor || "Accent Color"}<` },
  
  { from: `<SectionLabel>Language</SectionLabel>`, to: `<SectionLabel>{t.language || "Language"}</SectionLabel>` },

  { from: `<SectionLabel>Notifications &amp; Sound</SectionLabel>`, to: `<SectionLabel>{t.notifSound || "Notifications & Sound"}</SectionLabel>` },
  { from: `>Get reminded about due tasks<`, to: `>{t.getReminded || "Get reminded about due tasks"}<` },
  { from: `>Sound effects on actions<`, to: `>{t.soundEffects || "Sound effects on actions"}<` },

  { from: `<SectionLabel>Integrations</SectionLabel>`, to: `<SectionLabel>{t.integrations || "Integrations"}</SectionLabel>` },
  { from: `>Export to PDF<`, to: `>{t.exportPdf || "Export to PDF"}<` },
  { from: `>Weekly report of tasks &amp; progress<`, to: `>{t.weeklyReport || "Weekly report"}<` },
  { from: `>Install App<`, to: `>{t.installApp || "Install App"}<` },
  { from: `>Add StaredList to your home screen<`, to: `>{t.addAppHome || "Add to Home Screen"}<` },

  { from: `<SectionLabel>Security</SectionLabel>`, to: `<SectionLabel>{t.security || "Security"}</SectionLabel>` },
  { from: `>Change PIN<`, to: `>{t.changePin || "Change PIN"}<` },
  { from: `>Set PIN Lock<`, to: `>{t.setPinLock || "Set PIN Lock"}<` },
  { from: `>App is PIN protected 🔒<`, to: `>{t.pinActive || "App is PIN protected 🔒"}<` },
  { from: `>Protect your app with a 4-digit PIN<`, to: `>{t.protectApp || "Protect your app with a 4-digit PIN"}<` },
  { from: `>Active<`, to: `>{t.activeStatus || "Active"}<` },

  { from: `>Privacy Policy<`, to: `>{t.privacyPolicy || "Privacy Policy"}<` },
  { from: `>Terms of Service<`, to: `>{t.termsOfService || "Terms of Service"}<` },
];

let modified = code;
replacements.forEach(rep => {
  // Try to replace all instances
  modified = modified.split(rep.from).join(rep.to);
});

// Write to file
fs.writeFileSync('c:/Users/isaac/taskflow/taskflow/src/App.js', modified);
console.log('App.js navigation and settings strings successfully translated!');
