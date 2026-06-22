const fs = require('fs');
let text = fs.readFileSync('src/App.js', 'utf8');

// 1. Remove Daily Challenge
const dailyStart = text.indexOf('{/* == DAILY CHALLENGE == */}');
const dailyEndPattern = '{/* AI Top Suggestion Banner */}';
const dailyEnd = text.indexOf(dailyEndPattern);
if (dailyStart !== -1 && dailyEnd !== -1) {
    text = text.substring(0, dailyStart) + text.substring(dailyEnd);
    console.log('Removed Daily Challenge block.');
} else {
    console.log('Could not find Daily Challenge block');
}

// 2. Reorder .prog-card above .stats-row
const statsStart = text.indexOf('<div className="stats-row">');
const progStart = text.indexOf('<div className="prog-card">');
const progEndPattern = '{/* Anti-Burnout / Forgiveness Protocol */}';
const progEnd = text.indexOf(progEndPattern);

if (statsStart !== -1 && progStart !== -1 && progEnd !== -1 && statsStart < progStart) {
    const statsContent = text.substring(statsStart, progStart);
    const progContent = text.substring(progStart, progEnd);
    text = text.substring(0, statsStart) + progContent + statsContent + text.substring(progEnd);
    console.log('Reordered prog-card and stats-row.');
} else {
    console.log('Could not reorder prog-card and stats-row.', { statsStart, progStart, progEnd });
}

// 3. Delete Leaderboards and Ranks

// Remove XP Level Bar in Sidebar
const xpSidebarStart = text.indexOf('{/* XP Level Bar in Sidebar */}');
const profileBarStr = '<div className="profile-bar"';
const xpSidebarEnd = text.indexOf(profileBarStr);
if (xpSidebarStart !== -1 && xpSidebarEnd !== -1) {
    text = text.substring(0, xpSidebarStart) + text.substring(xpSidebarEnd);
    console.log('Removed XP Level Bar from sidebar.');
}

// Remove Leaderboard Navigation item
const leaderboardNavStr = '{ id: "leaderboard", icon: "🏆", label: t.leaderboard || "Leaderboard", cnt: null },';
text = text.replace(leaderboardNavStr, '');

// Remove Topbar Rank Badge (which looks like this: <span style={{ fontSize: 13 }}>{(() => { const rs = computeRankScore(... )
// It ends somewhere before "Add Task" button (className="add-btn").
const computeRankStart = text.indexOf('<span style={{ fontSize: 13 }}>{(() => { const rs = computeRankScore(xp');
const computeRankEndStr = '</span>';
if (computeRankStart !== -1) {
    // Find the next </span> after computeRankStart
    const nextSpanClose = text.indexOf(computeRankEndStr, computeRankStart);
    if (nextSpanClose !== -1) {
        text = text.substring(0, computeRankStart) + text.substring(nextSpanClose + computeRankEndStr.length);
        console.log('Removed topbar rank badge.');
    }
}

// Write back the file
fs.writeFileSync('src/App.js', text);
console.log('Done.');
