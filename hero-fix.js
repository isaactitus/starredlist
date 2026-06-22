const fs = require('fs');

let fileContent = fs.readFileSync('src/App.js', 'utf8');
let lines = fileContent.split('\n');

const startIdx = lines.findIndex(l => l.includes('{/* ✨ Modern Dashboard Hero */}'));
const endIdx = lines.findIndex(l => l.includes('{/* ☀️ Smart Daily Digest */}'));

if (startIdx !== -1 && endIdx !== -1) {
  const newHeroJSX = `        {/* ✨ Immersive Aurora Hero */}
        <div style={{
          position: "relative", padding: "40px 48px", borderRadius: 32, marginBottom: 24,
          overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 320,
          boxShadow: "var(--shadow-lg)", border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff", background: "linear-gradient(135deg, #181b2a, #0b0d17)",
          animation: "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)"
        }}>
          {/* Aurora Blobs */}
          <div style={{ position: "absolute", top: "-50%", left: "-20%", width: "70%", height: "150%", background: \`radial-gradient(circle, \${accent.v}88 0%, transparent 60%)\`, filter: "blur(60px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "-50%", right: "-20%", width: "80%", height: "150%", background: "radial-gradient(circle, rgba(74,222,128,0.4) 0%, transparent 60%)", filter: "blur(70px)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: 0, right: "10%", width: "50%", height: "100%", background: "radial-gradient(circle, rgba(255,107,171,0.5) 0%, transparent 60%)", filter: "blur(55px)", pointerEvents: "none" }} />
          
          <div style={{ position: "absolute", inset: 0, background: "rgba(10,12,24,0.4)", backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)", zIndex: 1 }} />
          
          {/* Content */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 30, flex: 1 }}>
            <div style={{ flex: "1 1 min-content", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.8)", borderBottom: "2px solid rgba(255,255,255,0.2)", display: "inline-block", paddingBottom: 6, marginBottom: 20, textTransform: "uppercase", letterSpacing: 1.5 }}>{fmtDateFull(new Date())}</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 58, lineHeight: 1, textShadow: "0 4px 16px rgba(0,0,0,0.4)", marginBottom: 16 }}>{greeting}, {curProfile2.name}</div>
              <div style={{ fontSize: 17, color: "rgba(255,255,255,0.85)", fontWeight: 500, maxWidth: 380, lineHeight: 1.5 }}>{liveHour < 12 ? "Embrace the morning light and your goals." : liveHour < 18 ? "The day is yours to conquer. Keep going." : "Wind down and reflect on your wins."}</div>
              
              <div style={{ display: "flex", gap: 16, marginTop: 36 }}>
                <div style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", borderRadius: 20, padding: "14px 22px", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{profileTasks.filter(t => !t.done).length}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Pending</div>
                </div>
                <div style={{ background: "rgba(74, 222, 128, 0.15)", backdropFilter: "blur(12px)", borderRadius: 20, padding: "14px 22px", border: "1px solid rgba(74, 222, 128, 0.3)", boxShadow: "0 8px 24px rgba(0,0,0,0.15)" }}>
                  <div style={{ fontSize: 26, color: "#a7f3d0", fontWeight: 800 }}>{getLevel(xp).level}</div>
                  <div style={{ fontSize: 11, color: "rgba(74,222,128,0.7)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Level</div>
                </div>
              </div>
            </div>

            {/* AnimePet Flash inside Hero */}
            <div style={{ flex: "0 1 auto", display: "flex", justifyContent: "center", alignItems: "center", paddingRight: 20 }}>
              <div onClick={() => setShowPetRoom(true)} style={{ cursor: 'pointer', zIndex: 10, transform: "scale(1.25)", transformOrigin: "center right", transition: "transform 0.3s ease" }} title="Visit Flash's Room">
                <AnimePet streak={gamStats ? gamStats.streak : 0} overdue={typeof overdueCount !== 'undefined' ? overdueCount : 0} xp={typeof xp !== 'undefined' ? xp : 0} activeItems={typeof activeItems !== 'undefined' ? activeItems : []} />
              </div>
            </div>
          </div>
        </div>

        {/* Dashboard Widgets below Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 24, animation: "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s backwards" }}>
          
          {/* AI Focus Insights Card */}
          <div style={{ 
            background: "var(--s1)", backdropFilter: "blur(20px)", borderRadius: 28, padding: 24, border: "1px solid var(--glass-border)",
            display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", boxShadow: "var(--shadow-lg)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
               <div className="logo-icon" style={{ width: 34, height: 34, borderRadius: 10, fontSize: 16, boxShadow: "none" }}>✦</div>
               <span style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>AI Focus Guide</span>
            </div>
            
            {aiInsight ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <div style={{ fontSize: 17, fontWeight: 500, color: "var(--t1)", lineHeight: 1.4, fontFamily: "'Outfit', sans-serif" }}>"{aiInsight.text}"</div>
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => setTab("bot")} style={{ background: \`linear-gradient(135deg, \${accent.v}, \${accent.v}cc)\`, color: "#fff", padding: "10px 20px", borderRadius: 14, fontSize: 13, fontWeight: 700, boxShadow: \`0 4px 15px \${accent.v}66\` }}>Chat with LIBI</button>
                  <span style={{ fontSize: 12, color: "var(--t3)", fontWeight: 600 }}>Real-time update</span>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "var(--t3)", margin: "auto" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 13 }}>Add tasks to unlock AI focus tips.</div>
              </div>
            )}
          </div>

          {/* Wellness & Progress Snapshot */}
          <div style={{ 
            background: "var(--s1)", backdropFilter: "blur(20px)", borderRadius: 28, padding: 24, border: "1px solid var(--glass-border)",
            boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", justifyContent: "space-between"
          }}>
             <div>
               <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>Wellness Snapshot</span>
                  <div style={{ width: 32, height: 32, borderRadius: "10px", background: "rgba(96, 165, 250, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💧</div>
               </div>
               <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 8, background: "var(--s4)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: \`\${Math.min(100, (wellness.waterTotal / 2000) * 100)}%\`, background: "linear-gradient(90deg, #60a5fa, #3b82f6)", borderRadius: 10, transition: "width 1s ease", boxShadow: "0 0 10px rgba(96,165,250,0.5)" }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t2)", width: 50 }}>{wellness.waterTotal}ml</span>
               </div>
             </div>

             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", fontWeight: 800, letterSpacing: 0.5, marginBottom: 6 }}>Daily Mood</div>
                  <div style={{ fontSize: 28 }}>{wellness.moodLogs[0]?.mood === 0 ? "😔" : wellness.moodLogs[0]?.mood === 1 ? "😐" : wellness.moodLogs[0]?.mood === 2 ? "🙂" : wellness.moodLogs[0]?.mood === 3 ? "😊" : wellness.moodLogs[0]?.mood === 4 ? "🤩" : "😶"}</div>
                </div>
                <button onClick={() => setTab("wellness")} style={{ background: "transparent", padding: "12px 20px", borderRadius: 16, fontSize: 12, fontWeight: 700, border: "2px solid var(--b2)", color: "var(--t2)", transition: "all 0.2s" }} >Wellness Hub ›</button>
             </div>
          </div>
        </div>
`;
  lines.splice(startIdx, endIdx - startIdx, newHeroJSX);
  fs.writeFileSync('src/App.js', lines.join('\n'));
  console.log("Successfully rebuilt TasksPage Hero.");
} else {
  console.error("Tags not found", startIdx, endIdx);
}

// Next, let's fix makeCSS to guarantee dark/light mode contrasts are perfect.
// The user noted the background and text contrast was awful.
// I'll define explicitly beautiful color tokens.
let content2 = fs.readFileSync('src/App.js', 'utf8');
const makeCSSStart = content2.indexOf('function makeCSS');
const rootStart = content2.indexOf(':root{', makeCSSStart);
const rootEnd = content2.indexOf('}', rootStart);

if (rootStart !== -1 && rootEnd !== -1) {
  // Replace the :root block to guarantee smooth and readable variables in both modes!
  const newRoot = `:root{
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
  --acc:\${accent.v};
  --acc2:\${accent2 ? accent2.v : accent.v};
  --accd:\${accent.v}20;
  --glow:\${accent.v}50;
  --red:#FF6B6B;--yellow:#FFD93D;--green:#4ADE80;
  --safe-b:env(safe-area-inset-bottom,0px);
  --shadow-sm: 0 4px 12px rgba(0,0,0,\${dark ? 0.3 : 0.04});
  --shadow-md: 0 12px 32px rgba(0,0,0,\${dark ? 0.4 : 0.08});
  --shadow-lg: 0 32px 80px rgba(0,0,0,\${dark ? 0.6 : 0.12});`;
  
  content2 = content2.substring(0, rootStart) + newRoot + content2.substring(rootEnd);
  fs.writeFileSync('src/App.js', content2);
  console.log("Successfully rebuilt CSS color variables.");
}
