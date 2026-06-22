const fs = require('fs');
let text = fs.readFileSync('src/App.js', 'utf8');

const startIdx = text.indexOf('function makeCSS');
const endIdx = text.indexOf('// == Ambient Music Engine', startIdx);
// Wait, is Ambient Music Engine before or after?
// Let's use the line index approach.
const lines = text.split('\n');
const sIdx = lines.findIndex(l => l.includes('function makeCSS'));
const eIdx = lines.findIndex((l, i) => i > sIdx && l.startsWith('}'));

if (sIdx !== -1 && eIdx !== -1) {
  const newCSS = `function makeCSS(dark, accent, accent2, rtl, font) {
  const f = font || "Outfit";
  return (\`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;font-family: inherit; transition: background-color .4s cubic-bezier(.4,0,.2,1), border-color .4s cubic-bezier(.4,0,.2,1), color .3s ease, box-shadow .4s ease, transform .25s cubic-bezier(.34,1.56,.64,1); }
:root{
  --bg:\${dark ? "#090A0F" : "#F4F6FB"};
  --s1:\${dark ? "rgba(22,24,35,0.75)" : "rgba(255,255,255,0.85)"};
  --s2:\${dark ? "rgba(30,32,45,0.65)" : "rgba(240,242,250,0.7)"};
  --s3:\${dark ? "rgba(40,43,60,0.5)" : "rgba(230,233,248,0.55)"};
  --s4:\${dark ? "rgba(50,54,75,0.4)" : "rgba(220,225,245,0.45)"};
  --b1:\${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"};
  --b2:\${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.1)"};
  --t1:\${dark ? "#F8F9FF" : "#1A1D2B"};
  --t2:\${dark ? "#A5ADC8" : "#5A628A"};
  --t3:\${dark ? "#68729A" : "#8A99BA"};
  --glass:\${dark ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.45)"};
  --glass-border:\${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.5)"};
  --acc:\${accent.v || accent};
  --acc2:\${accent2 ? (accent2.v || accent2) : (accent.v || accent)};
  --accd:\${accent.v || accent}20;
  --glow:\${accent.v || accent}50;
  --red:#FF6B6B;--yellow:#FFD93D;--green:#4ADE80;
  --safe-b:env(safe-area-inset-bottom,0px);
  --shadow-sm: 0 4px 12px rgba(0,0,0,\${dark ? 0.3 : 0.04});
  --shadow-md: 0 12px 32px rgba(0,0,0,\${dark ? 0.4 : 0.08});
  --shadow-lg: 0 32px 80px rgba(0,0,0,\${dark ? 0.6 : 0.12});
}
html,body{height:100%;width:100%;margin:0;padding:0;background:var(--bg);color:var(--t1);font-family:'\${f}',sans-serif;-webkit-font-smoothing:antialiased;direction:\${rtl ? "rtl" : "ltr"};transition:background .4s ease,color .4s ease;}
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit;}
input,textarea,select{font-family:inherit;color:inherit;background:none;border:none;outline:none;}
textarea{resize:none;}
::-webkit-scrollbar{width:3px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,var(--acc),var(--acc2));border-radius:3px;}
.shell{
  display:flex;height:100vh;height:100dvh;overflow:hidden;
  padding-bottom:env(safe-area-inset-bottom,0px);
}
/* == SIDEBAR == */
.sidebar{
  width:234px;flex-shrink:0;transition:width .4s cubic-bezier(.4,0,.2,1),opacity .25s ease;
  background:\${dark ? "rgba(6,8,18,0.4)" : "rgba(255,255,255,0.45)"};
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-right:1px solid var(--glass-border);
  display:flex;flex-direction:column;padding:22px 0 16px;
  overflow-y:auto;position:relative;z-index:2;
  box-shadow:\${dark ? "8px 0 40px rgba(0,0,0,0.4)" : "4px 0 24px rgba(0,0,0,0.03)"};
}
.logo{display:flex;align-items:center;gap:10px;padding:0 16px 20px;}
.logo-icon{
  width:40px;height:40px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));
  border-radius:13px;display:flex;align-items:center;justify-content:center;
  font-size:20px;flex-shrink:0;
  box-shadow:0 0 24px var(--glow),0 6px 16px var(--accd);
  animation:galaxyPulse 3s ease-in-out infinite;
}
.logo-text{
  font-family:'Instrument Serif',serif;font-size:21px;
  background:linear-gradient(135deg,var(--acc),var(--acc2),#fff);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  font-weight:400;
}
.profile-bar{
  margin:0 10px 14px;
  background:linear-gradient(135deg,var(--accd),transparent);
  border:1px solid var(--accd);
  border-radius:15px;padding:11px 13px;
  display:flex;align-items:center;gap:9px;cursor:pointer;transition:all .22s;
}
.profile-bar:hover{border-color:var(--acc);box-shadow:0 6px 20px var(--accd);transform:translateY(-1px);}
.profile-avatar{width:33px;height:33px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;}
.profile-name{font-size:13px;font-weight:700;flex:1;}
.profile-arrow{font-size:11px;color:var(--t3);}
.nav-group{padding:0 10px 4px;}
.nav-lbl{font-size:9.5px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:var(--t3);padding:0 8px 8px;}
.nav-item{
  display:flex;align-items:center;gap:10px;
  padding:9px 11px;border-radius:12px;
  font-size:13px;color:var(--t2);cursor:pointer;
  transition:all .18s;margin-bottom:2px;position:relative;overflow:hidden;
}
.nav-item:hover{background:var(--accd);color:var(--t1);transform:translateX(2px);}
.nav-item.on{
  background:linear-gradient(135deg,var(--accd),transparent);
  color:var(--acc);font-weight:700;
  box-shadow:inset 0 0 0 1px var(--accd),0 2px 12px var(--accd);
}
.nav-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0;}
.nav-badge{
  margin-left:auto;font-size:10px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));
  color:#fff;padding:2px 8px;border-radius:20px;font-weight:800;
  box-shadow:0 2px 8px var(--glow);
}
.nav-div{height:1px;background:linear-gradient(90deg,transparent,var(--b1),transparent);margin:8px 16px;}
/* == MAIN == */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:transparent;position:relative;z-index:1;}
\`  );
}`;
  
  // Actually, searching for the exact end of makeCSS is tricky because it has multiple strings inside.
  // We can just find `.main{flex:1` and replace up to there, since it's the exact chunk that's broken.
  const brokenStart = text.indexOf('function makeCSS');
  const brokenEndStr = '.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:transparent;position:relative;z-index:1;}';
  const brokenEnd = text.indexOf(brokenEndStr) + brokenEndStr.length;
  
  if(brokenStart !== -1 && brokenEnd !== -1) {
     text = text.substring(0, brokenStart) + newCSS + text.substring(brokenEnd);
     fs.writeFileSync('src/App.js', text);
     console.log('Successfully repaired CSS parser by completely rewriting the variables.');
  } else {
     console.log('Failed to find replace boundaries for CSS fix.');
  }
}
