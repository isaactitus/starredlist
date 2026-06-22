"""
Script to completely remove the Conference/Collab feature from App.js
"""
import re

with open("src/App.js", "r", encoding="utf-8") as f:
    content = f.read()

lines = content.split("\n")
total = len(lines)
print(f"Original lines: {total}")

# ── 1. Remove the big collab state block (lines 4403–4448, 0-indexed: 4402–4447)
#    Marker: "// == REAL Firebase Collaboration State =="  ...  until "// == Auth State =="
content = re.sub(
    r'  // == REAL Firebase Collaboration State ==.*?(?=  // == Auth State ==)',
    '',
    content,
    flags=re.DOTALL
)

# ── 2. Inside the cloud-restore useEffect, remove only the two setConvos lines
content = re.sub(
    r'\s*// Load account-scoped Conference convos \(not localStorage!\)\s*\n\s*if \(d\.myConvos\) setConvos\(d\.myConvos\); else setConvos\(\[\]\);',
    '',
    content
)
# Also remove the bare "else setConvos([]);" on the else branch
content = re.sub(
    r'\s*else \{\s*\n\s*setConvos\(\[\]\); // new account.*?\n\s*\}',
    ' else {}',
    content
)

# ── 3. Remove the "if (tab === collab) initAuth()" useEffect line
content = re.sub(
    r'\s*useEffect\(\(\) => \{ if \(tab === "collab"\) initAuth\(\); \}, \[tab\]\);',
    '',
    content
)

# ── 4. Clean up signOut: remove collab-specific lines inside it
content = content.replace(
    '      setAuthUser(null); leaveRoom();\n      setConvos([]); // clear Conference data on sign-out — account-scoped\n      setActiveConvoId(null); setCollabView("list");',
    '      setAuthUser(null);'
)

# ── 5. Remove entire block from "// Persist room history" through end of CollabPage (before GOALS)
#    Markers: "// Listen to a room's tasks" ... "// ==========================================\n  //  GOALS"
content = re.sub(
    r'  // Listen to a room.*?(?=  // ==========================================\s*\n  //  GOALS)',
    '',
    content,
    flags=re.DOTALL
)

# Also remove the CollabPage extra state block that comes just before CollabPage()
content = re.sub(
    r'  // CollabPage UI state lifted.*?(?=  // ==========================================\s*\n  //  GOALS)',
    '',
    content,
    flags=re.DOTALL
)

# ── 6. CSS: remove collab-related CSS blocks
# Remove .chat-panel and related
content = re.sub(
    r'/\* == CHAT == \*/\s*\n\.chat-panel\{.*?(?=\n/\* ==|\n\.cal-event)',
    '',
    content,
    flags=re.DOTALL
)
# Remove .collab-page and .collab-* CSS
content = re.sub(
    r'/\* == COLLAB == \*/\s*\n\.collab-page\{.*?(?=\n/\* ==|\n\.cal-event|\n\.pomo)',
    '',
    content,
    flags=re.DOTALL
)
# Remove mobile overrides for chat
content = content.replace(
    '.sidebar,.chat-panel{display:none!important;}',
    '.sidebar{display:none!important;}'
)
content = re.sub(
    r'/\* Chat panel on mobile.*?\n\.chat-inp\{padding-bottom:calc\(12px.*?\n',
    '',
    content,
    flags=re.DOTALL
)
content = re.sub(r'\.chat-msgs\{padding-bottom.*?\n', '', content)
content = re.sub(r'\.chat-ta\{font-size:16px.*?\n', '', content)

# ── 7. Nav: remove collab from sidebar nav array
#    Remove the { id: "collab", icon: ..., label: t.collab, cnt: null }, item
content = re.sub(
    r"\s*\{ id: \"collab\",.*?cnt: null \},",
    '',
    content,
    flags=re.DOTALL
)

# ── 8. Nav: remove collab from bottom nav array
#    Remove the { id: "collab", icon: ..., label: "Team" }, item
content = re.sub(
    r'\s*\{ id: "collab", icon: <svg.*?label: "Team" \},',
    '',
    content,
    flags=re.DOTALL
)

# ── 9. Page render: remove tab === "collab" ternary line
content = re.sub(
    r'\s*tab === "collab" \? <div key="collab".*?CollabPage\(\)\}</div\> :',
    '',
    content
)

# ── 10. tabMap: remove "collaborate" and "team" entries
content = content.replace(
    ' collaborate: "collab", team: "collab",',
    ''
)
content = content.replace(
    'collaborate: "collab", team: "collab",',
    ''
)

# ── 11. Header title: remove tab === "collab" case
content = content.replace(
    ' tab === "collab" ? "Collaborate" :',
    ''
)

# ── 12. Conditions: remove "collab" from arrays of excluded tabs
content = content.replace(
    '![\"bot\", \"stats\", \"calendar\", \"settings\", \"collab\", \"goals\", \"habits\", \"planner\"].includes(tab)',
    '!["bot", "stats", "calendar", "settings", "goals", "habits", "planner"].includes(tab)'
)
content = content.replace(
    '![\"bot\", \"stats\", \"calendar\", \"settings\", \"collab\", \"goals\", \"habits\", \"planner\", \"leaderboard\", \"notes\"].includes(tab)',
    '!["bot", "stats", "calendar", "settings", "goals", "habits", "planner", "leaderboard", "notes"].includes(tab)'
)
# Also handle without leaderboard
content = content.replace(
    '!["bot", "stats", "calendar", "settings", "collab", "goals", "habits", "planner"].includes(tab)',
    '!["bot", "stats", "calendar", "settings", "goals", "habits", "planner"].includes(tab)'
)
content = content.replace(
    '!["bot", "stats", "calendar", "settings", "collab", "goals", "habits", "planner", "leaderboard", "notes"].includes(tab)',
    '!["bot", "stats", "calendar", "settings", "goals", "habits", "planner", "leaderboard", "notes"].includes(tab)'
)

# ── 13. Bottom nav hide condition: remove collab-specific hide condition
content = re.sub(
    r'\|\| \(tab === "collab" && collabView === "chat" && convos\.find\(c => c\.id === activeConvoId\)\?\.type === "group"\)',
    '',
    content
)

# ── 14. LIBI AI: remove "Team" reference in the big features list
content = content.replace(
    '✦ **Team** - real-time Firebase collaboration\\n',
    ''
)

# Write result
with open("src/App.js", "w", encoding="utf-8") as f:
    f.write(content)

new_lines = content.split("\n")
print(f"New lines: {len(new_lines)}")
print(f"Lines removed: {total - len(new_lines)}")
print("Done! Collab feature removed.")
