const fs = require('fs');
let text = fs.readFileSync('src/App.js', 'utf8');

// 1. Remove WALLPAPERS array
text = text.replace(/const WALLPAPERS = \[\s*\{ id: "auto".*?\];\n?/s, '');

// 2. Remove state declarations for wallpaper, greetScene, greetAccent
text = text.replace(/const \[wallpaper,\s*setWallpaper\].*?\n/g, '');
text = text.replace(/const \[greetScene,\s*setGreetScene\].*?\n/g, '');
text = text.replace(/const \[greetAccent,\s*setGreetAccent\].*?\n/g, '');

// 3. Remove isForest, isGalaxy derived states
text = text.replace(/const isForest = .*?;\n/g, '');
text = text.replace(/const isGalaxy = .*?;\n/g, '');

// 4. Remove localStorage useEffects for these
text = text.replace(/useEffect\(\(\) => \{ try \{ localStorage\.setItem\("tf_wallpaper", wallpaper\); \} catch \{ \} \}, \[wallpaper\]\);\n/g, '');
text = text.replace(/useEffect\(\(\) => \{ try \{ localStorage\.setItem\("tf_greetScene", greetScene\); \} catch \{ \} \}, \[greetScene\]\);\n/g, '');
text = text.replace(/useEffect\(\(\) => \{ try \{ localStorage\.setItem\("tf_greetAccent", greetAccent\); \} catch \{ \} \}, \[greetAccent\]\);\n/g, '');

// 5. Remove from export/import configurations
text = text.replace(/wallpaper, greetScene, greetAccent,/g, '');
text = text.replace(/if \(d\.wallpaper\) setWallpaper\(d\.wallpaper\);\n/g, '');
text = text.replace(/if \(d\.greetScene\) setGreetScene\(d\.greetScene\);\n/g, '');
text = text.replace(/if \(d\.greetAccent\) setGreetAccent\(d\.greetAccent\);\n/g, '');

// 6. Remove the Settings UI blocks
const settingsRegex = /<div style=\{\{ fontSize: 12, fontWeight: 700, color: "var\(--t3\)", letterSpacing: \.5, textTransform: "uppercase", marginBottom: 10 \}\}>🖼 Wallpaper<\/div>[\s\S]*?<div style=\{\{ fontSize: 12, fontWeight: 700, color: "var\(--t3\)", letterSpacing: \.5, textTransform: "uppercase", marginBottom: 10 \}\}>🎨 Presets<\/div>/s;
text = text.replace(settingsRegex, '<div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>🎨 Presets</div>');

// 7. Remove the physical background rendering layer at the bottom of App.js
const renderLayerRegex = /\{\/\* Wallpaper layer — behind everything \*\/\}.*?z-index: 0" \}\} \/>\n\s*\}/s;
text = text.replace(renderLayerRegex, '');

fs.writeFileSync('src/App.js', text);
console.log('Successfully purged all wallpaper and greeting card junk from App.js for a professional look.');
