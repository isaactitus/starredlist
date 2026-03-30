import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Voice AI
state_str = 'const [pinTemp, setPinTemp] = useState("");'
state_loc = content.find(state_str)
if state_loc == -1:
    print("state loc not found")
    sys.exit(1)

state_loc += len(state_str)

voice_logic = '''
  // == Voice AI ==
  const [isListening, setIsListening] = useState(false);
  function startVoiceAI() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showNotif('🎙️ Voice AI not supported', 'Please use Chrome or Safari.');
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onstart = () => { setIsListening(true); play('tap'); haptic('light'); };
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript.toLowerCase();
      let d = todayStr();
      if (txt.includes('tomorrow')) { const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); d = tmrw.toISOString().slice(0, 10); }
      const cleaned = txt.replace(/(remind me to|to|tomorrow|today|at \\\d+ (am|pm))/gi, '').trim();
      if (!cleaned) return;
      const tId = uid2();
      const nt = { id: tId, title: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), notes: 'Created via Voice AI 🎙️', priority: 'medium', categoryId: 'work', due: d, photo: null, tags: [], subtasks: [], starred: false, recurring: 'never', reminder: false, profileId: activeProfile, done: false, createdAt: Date.now() };
      setTasks(ts => [nt, ...ts]);
      showNotif('✨ Voice task added!', nt.title);
      play('success'); haptic('heavy');
    };
    rec.onerror = () => { setIsListening(false); showNotif('🤔 Didn\\'t catch that', 'Try speaking again.'); };
    rec.onend = () => setIsListening(false);
    rec.start();
  }
'''
content = content[:state_loc] + voice_logic + content[state_loc:]

# 2. Add button at end of TasksPage
tp_end_loc = content.find('function StatsPage()')
div_idx = content.rfind('</div>', 0, tp_end_loc)
btn_str = '''
        {/* Floating Voice AI Button */}
        <button onClick={startVoiceAI} className={isListening ? 'pulse' : ''} style={{ position: 'fixed', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, background: isListening ? '#ff6b6b' : 'var(--v-bg, #7c6dfa)', color: '#fff', border: 'none', boxShadow: isListening ? '0 0 0 10px rgba(255,107,107,0.3)' : '0 8px 24px rgba(124,109,250,0.4)', fontSize: 24, cursor: 'pointer', zIndex: 50, transition: 'all .25s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isListening ? '🎙️' : '🎤'}
        </button>
'''
content = content[:div_idx] + btn_str + '\\n' + content[div_idx:]

# 3. TimelinePage
timeline_page = '''
  function TimelinePage() {
    const hours = Array.from({length: 24}, (_, i) => i);
    const today = todayStr();
    const todaysTasks = profileTasks.filter(t => t.due === today && t.reminder);
    
    return (
      <div className="content">
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
            <span>⏳</span> Timeline
          </div>
          <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 20 }}>Visually construct your day</div>
          
          <div style={{ position: "relative", marginLeft: 40, marginTop: 10, paddingBottom: 60 }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--b1)", borderRadius: 2 }} />
            {hours.map(h => {
              const hourStr = h < 10 ? '0' + h + ':00' : h + ':00';
              const tasksInHour = todaysTasks.filter(t => {
                if (!t.reminderTime) return false;
                const th = parseInt(t.reminderTime.split(":")[0]);
                return th === h;
              });
              
              const isNow = h === new Date().getHours();
              
              return (
                <div key={h} style={{ position: "relative", minHeight: 60, paddingBottom: 10 }}>
                  <div style={{ position: "absolute", left: -45, top: -10, fontSize: 11, fontWeight: 700, color: isNow ? "var(--acc)" : "var(--t3)", width: 35, textAlign: "right" }}>
                    {h === 0 ? "12 AM" : h < 12 ? h + " AM" : h === 12 ? "12 PM" : (h - 12) + " PM"}
                  </div>
                  
                  <div style={{ position: "absolute", left: -5, top: -2, width: 12, height: 12, borderRadius: 6, background: isNow ? "var(--acc)" : "var(--b1)", boxShadow: isNow ? "0 0 0 4px var(--accd)" : "none", zIndex: 2 }} />
                  
                  {tasksInHour.length === 0 ? (
                    <div style={{ marginLeft: 20, height: "100%", padding: "4px 0" }}>
                      <div style={{ borderTop: "1px dashed var(--b1)", width: "100%", opacity: 0.5, marginTop: 8 }} />
                    </div>
                  ) : (
                    <div style={{ marginLeft: 20, display: "flex", flexDirection: "column", gap: 6, marginTop: -4 }}>
                      {tasksInHour.map(t => (
                        <div key={t.id} style={{ background: t.done ? "var(--s1)" : "var(--s2)", borderLeft: `3px solid ${PRIORITIES[t.priority]?.color || "var(--acc)"}`, padding: "8px 12px", borderRadius: 8, boxShadow: "0 2px 4px rgba(0,0,0,0.05)", opacity: t.done ? 0.6 : 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: t.done ? "var(--t3)" : "var(--t1)", textDecoration: t.done ? "line-through" : "none" }}>{t.title}</span>
                          <span style={{ fontSize: 11, background: "var(--b1)", padding: "2px 6px", borderRadius: 4, color: "var(--t2)", fontWeight: 700 }}>{t.reminderTime}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
'''
loc = content.find('function BoardPage()')
content = content[:loc] + timeline_page + '\\n  ' + content[loc:]

tab_loc = content.find('tab === "board" ? <div key="board"')
map_str = 'tab === "timeline" ? <div key="timeline" className="content page-fade" style={{ overflowY: "auto", display: "flex", flexDirection: "column", flex: 1 }}>{TimelinePage()}</div> :\\n      '
content = content[:tab_loc] + map_str + content[tab_loc:]

menu_loc = content.find('onClick={() => { setTab("board");')
if menu_loc != -1:
    menu_parent = content.rfind('<div className="bot-item"', 0, menu_loc)
    if menu_parent == -1: menu_parent = content.rfind('<div className="menu-btn"', 0, menu_loc)
    menu_insert = '''<div className="menu-btn" onClick={() => { setTab("timeline"); play("tap"); setShowMoreMenu(false); }}><div className="m-ic" style={{background: "#ff9f43" + "22", color: "#ff9f43"}}>⏳</div>Timeline</div>\\n                  '''
    content = content[:menu_parent] + menu_insert + content[menu_parent:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
