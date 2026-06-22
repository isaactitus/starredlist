#!/usr/bin/env python3
import re

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove tab cases from topbar title switch
content = re.sub(
    r': tab === "board" \? "🗂 Board" : tab === "sleep" \? "💤 Sleep Tracker" : tab === "calories" \? "🔥 Calorie Tracker" : tab === "wellness" \? "🌿 Wellness" :',
    ':',
    content
)

# 2. Remove from the search filter check (list of tabs that don't show add button and search)
content = re.sub(
    r'"board", "leaderboard", "sleep", "calories", "finance"',
    '"leaderboard", "finance"',
    content
)
content = re.sub(
    r'["board", "leaderboard", "sleep", "calories", "finance",', 
    '"leaderboard", "finance",',
    content
)

# 3. Remove tab rendering cases for sleep, calories, wellness, and board
# This is the big one - the ternary chain
sleep_render = r':\n\s+tab === "sleep" \?[\s\S]*?\n\s+: tab === "calories" \?[\s\S]*?\n\s+: tab === "wellness" \?[\s\S]*?\n\s+:'
content = re.sub(sleep_render, ':', content)

# Remove board rendering
board_render = r':\n\s+tab === "board" \?[\s\S]*?\n\s+:'
content = re.sub(board_render, ':', content)

# 4. Remove sleep/calories/wellness/board from tab lists in filters
content = re.sub(
    r'!\["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly"\]',
    '!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "leaderboard", "finance", "weekly"]',
    content
)

# Remove from another instance of the filter
content = re.sub(
    r'!\["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly"\]',
    '!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "leaderboard", "finance", "weekly"]',
    content
)

# 5. Remove LIBI sleep and calories responses
# Remove 14. SLEEP section
sleep_response = r'  // 14\. SLEEP\n  if \(/\\b\(sleep\|insomnia[\s\S]*?\}\n\n  // 15\. NUTRITION & ENERGY'
content = re.sub(sleep_response, '  // 15. NUTRITION & ENERGY', content)

# 6. Remove sleep goal references from LIBI memory initialization
content = re.sub(
    r', "sleepGoal"',
    '',
    content
)

# 7. Remove from LeaderboardPage props that reference sleep/calorie logs
content = re.sub(
    r' sleepLogs=\{sleepLogs\} calorieLogs=\{calorieLogs\}',
    '',
    content
)

# 8. Remove LIBI responses about wellness
wellness_response = r'  if \(/\\b\(wellness|mental health[\s\S]*?`\n\n  // \d\.'
content = re.sub(wellness_response, '  // ', content, count=1)

# 9. Remove board references from AI suggestions and documentation
content = re.sub(
    r'boards|Board|board features',
    '',
    content
)

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully removed all tab rendering cases and navigation references for sleep, calories, wellness, and board")
