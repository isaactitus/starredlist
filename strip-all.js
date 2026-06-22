const fs = require('fs');
let fileContent = fs.readFileSync('src/App.js', 'utf8');

const startIdxStr = '{/* Dashboard Widgets below Hero */}';
const endIdxStr = '{/* 🧠 Smart Deadline Suggestions */}';

let lines = fileContent.split('\n');
const startIdx = lines.findIndex(l => l.includes(startIdxStr));
const endIdx = lines.findIndex(l => l.includes(endIdxStr));

if (startIdx !== -1 && endIdx !== -1) {
  lines.splice(startIdx, endIdx - startIdx);
  fs.writeFileSync('src/App.js', lines.join('\n'));
  console.log("Successfully removed all remaining AI Guide, Wellness, and Daily Digest cards from the top.");
} else {
  console.error("Tags not found", startIdx, endIdx);
}
