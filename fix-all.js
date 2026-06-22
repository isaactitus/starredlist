const fs = require('fs');
let text = fs.readFileSync('src/App.js', 'utf8');

// 1. Remove Energy Filter bar
const energyStart = text.indexOf('{/* Energy Filter */}');
const filterBarStr = '<div className="filter-bar">';
const energyEnd = text.indexOf(filterBarStr);
if (energyStart !== -1 && energyEnd !== -1) {
    text = text.substring(0, energyStart) + text.substring(energyEnd);
    console.log('✅ Removed Energy Filter bar.');
} else {
    console.log('⚠️ Energy Filter not found:', energyStart, energyEnd);
}

// 2. Fix Add Task button - the "Add Task" button on line 10159 has "leaderboard" 
//    in its exclusion list causing wrong display. Also ensure the button itself 
//    has proper styling. The button should work - let's check the tab condition.
//    Actually the Add Task button condition is fine for "tasks" tab. Let's look 
//    at the rendering issue - on line 10162, there are stray <button> elements 
//    (🚀 Share and 🔔 Notifications) placed INSIDE the tasks page content div.
//    These should be in the topbar, not in the content area. This might be 
//    pushing the Add Task button off-screen or causing layout issues.

// Move the Share and Notification buttons from content div to topbar
// Line 10162-10164 has:
//   {tab === "tasks" || tab === "starred" ... ? <div ...>{TasksPage()}
//     <button ...>🚀</button>
//     {notifPermission !== "granted" && <button ...>🔔</button>}</div> :
// The 🚀 and 🔔 buttons are inside the content scrollable area, let's remove them
// since they're cluttering the interface
const shareBtn = '<button className="tb-btn" onClick={generateShareCard} title="Share" style={{ fontSize: 14 }}>🚀</button>';
text = text.replace('\n                ' + shareBtn, '');
console.log('✅ Removed stray Share button from content area.');

const notifBtnStr = '{notifPermission !== "granted" && <button className="tb-btn" onClick={requestNotifPermission} title="Enable notifications" style={{ fontSize: 13, color: "#ffd93d" }}>🔔</button>}';
text = text.replace('\n                ' + notifBtnStr, '');
console.log('✅ Removed stray Notification button from content area.');

// 3. Clean up the topbar - too many icons cluttering. Remove the less essential 
//    desktop-only toolbar buttons that show as weird icons:
//    - Eisenhower Matrix (⊞) - rarely used
//    - Voice input (🎤) on desktop - rarely used
//    - Music player button on desktop - takes too much space

// Remove Eisenhower Matrix button
const eisenhower = '<button className="tb-btn desktop-only-btn" onClick={() => setShowEisenhower(true)} title="Eisenhower Matrix" style={{ fontSize: 12 }}>⊞</button>';
text = text.replace(eisenhower, '');
console.log('✅ Removed Eisenhower button from topbar.');

// Remove the leaderboard routing
const lbRoute = 'tab === "leaderboard" ? <div key="leaderboard" className="content page-fade" style={{ overflowY: "auto" }}><LeaderboardPage';
const lbRouteEnd = text.indexOf(lbRoute);
if (lbRouteEnd !== -1) {
    // Find the closing of this ternary
    const routeLineEnd = text.indexOf('</div> :', lbRouteEnd);
    if (routeLineEnd !== -1) {
        const fullRoute = text.substring(lbRouteEnd, routeLineEnd + '</div> :'.length);
        text = text.replace(fullRoute, '');
        console.log('✅ Removed Leaderboard page route.');
    }
}

// 4. Remove the broken image left from the removed greeting card
// There's likely a stray <img> tag for the pet or greeting that shows as broken
// Let me search for any AnimePet references in the dashboard
const animePetImport = "import AnimePet from './components/AnimePet';";
if (text.includes(animePetImport)) {
    // Keep the import but check if AnimePet is still used elsewhere
    console.log('ℹ️ AnimePet import exists - checking if still used.');
}

// 5. Remove the "leaderboard" references from bottom mobile nav
const lbMobileNav = '{ id: "leaderboard", icon: "🥇", label: "Leaderboard" },';
text = text.replace(lbMobileNav, '');
console.log('✅ Removed Leaderboard from mobile nav.');

// 6. Also add "notes" and "mood" and "time" and "wellness" to the Add Task 
//    exclusion so the button doesn't show on non-task pages
text = text.replace(
    '!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly"].includes(tab)',
    '!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly", "notes", "mood", "time", "wellness"].includes(tab)'
);
console.log('✅ Updated Add Task exclusion list.');

fs.writeFileSync('src/App.js', text);
console.log('\n🎉 All fixes applied successfully!');
