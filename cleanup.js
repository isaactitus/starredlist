const fs = require('fs');
let lines = fs.readFileSync('src/App.js', 'utf8').split('\n');

const startIndex = lines.findIndex(l => l.includes('{/* ── ☀️ AFTERNOON: City skyline, clouds, blue sky */}'));
const endIndex = lines.findIndex(l => l.includes('{/* ☀️ Smart Daily Digest */}'));

if (startIndex !== -1 && endIndex !== -1) {
  lines.splice(startIndex, endIndex - startIndex);
  
  const animePetCode = `                {/* White Anime Cat Widget */}
                <div onClick={() => setShowPetRoom(true)} style={{ cursor: 'pointer', position: 'absolute', top: 20, right: 20, zIndex: 10 }} title="Visit Neko's Room">
                  <AnimePet streak={gamStats ? gamStats.streak : 0} overdue={typeof overdueCount !== 'undefined' ? overdueCount : 0} xp={typeof xp !== 'undefined' ? xp : 0} activeItems={typeof activeItems !== 'undefined' ? activeItems : []} />
                </div>`;
                
  const greetingIndex = lines.findIndex(l => l.includes('{greeting}, {curProfile2.name}'));
  if (greetingIndex !== -1) {
    if (!lines[greetingIndex - 1].includes('AnimePet')) {
      lines.splice(greetingIndex, 0, animePetCode);
    }
  }
  
  fs.writeFileSync('src/App.js', lines.join('\n'));
  console.log('Successfully repaired App.js by removing ' + (endIndex - startIndex) + ' lines of orphaned SVG logic!');
} else {
  console.log('Could not find markers: ' + startIndex + ', ' + endIndex);
}
