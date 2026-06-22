const fs = require('fs');
let fileContent = fs.readFileSync('src/App.js', 'utf8');

// We will find the start of the Aurora Hero and the start of the next section, and remove it.
const startIdxStr = '{/* ✨ Immersive Aurora Hero */}';
const endIdxStr = '{/* Dashboard Widgets below Hero */}';

let lines = fileContent.split('\n');
const startIdx = lines.findIndex(l => l.includes(startIdxStr));
const endIdx = lines.findIndex(l => l.includes(endIdxStr));

if (startIdx !== -1 && endIdx !== -1) {
  // Remove everything from the start to right before the next widgets.
  lines.splice(startIdx, endIdx - startIdx);
  fs.writeFileSync('src/App.js', lines.join('\n'));
  console.log("Successfully removed the massive Aurora Hero, Greeting Cards, and Flash.");
} else {
  console.error("Could not find start/end markers.");
}
