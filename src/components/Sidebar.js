import React from 'react';
import { getLevel } from '../utils/helpers';

export const Sidebar = ({ 
  showSidebar, 
  setShowSidebar, 
  appIconEmoji, 
  setShowIconDesigner, 
  appDisplayName, 
  t, 
  xp, 
  gamStats, 
  earnedBadges, 
  BADGES,
  authUser,
  curProfile,
  setTab,
  play,
  tab,
  activeCount,
  profileTasks,
  todayStr,
  overdueCount,
  doneCount,
  notes,
  setFocusTaskId,
  setShowFocusMode,
  setShowTemplateModal,
  accent,
  haptic,
  setShowDone,
  setShowStarred
}) => {
  if (!showSidebar) return null;

  const navItems = [
    { id: "tasks", icon: "○", label: t.tasks, cnt: activeCount },
    { id: "starred", icon: "⭐", label: t.starred, cnt: profileTasks.filter(x => x.starred && !x.done).length },
    { id: "today", icon: "📅", label: t.today, cnt: profileTasks.filter(x => x.due === todayStr() && !x.done).length },
    { id: "overdue", icon: "⚠️", label: t.overdue, cnt: overdueCount },
    { id: "done", icon: "◎", label: t.done, cnt: doneCount },
    { id: "calendar", icon: "📆", label: t.calendar, cnt: null },
    { id: "stats", icon: "📊", label: t.stats, cnt: null },
    { id: "goals", icon: "🏆", label: "Goals", cnt: null },
    { id: "habits", icon: "🔁", label: "Habits", cnt: null },
    { id: "planner", icon: "⏰", label: "Planner", cnt: null },
    { id: "notes", icon: "📝", label: "Notes", cnt: notes.length || null },
    { id: "mood", icon: "😊", label: "Mood", cnt: null },
    { id: "time", icon: "⏱", label: "Focus & Time", cnt: null },
    { id: "board", icon: "🗂", label: "Board", cnt: null },
    { id: "collab", icon: "👫", label: "Collaborate", cnt: null },
    { id: "finance", icon: "💰", label: "Finance", cnt: null },
    { id: "sleep", icon: "💤", label: "Sleep", cnt: null },
    { id: "calories", icon: "🔥", label: "Calories", cnt: null },
    { id: "leaderboard", icon: "🏆", label: "Leaderboard", cnt: null },
    { id: "bot", icon: "✦", label: "LIBI AI", cnt: null },
    { id: "settings", icon: "⚙️", label: t.settings, cnt: null },
    { id: "profiles", icon: "👥", label: t.profiles, cnt: null },
  ];

  return (
    <div className="sidebar" style={{ width: showSidebar ? "234px" : "0px", overflowX: "hidden", overflowY: "auto", minWidth: 0, flexShrink: 0, transition: "width .25s ease" }}>
      <div className="logo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="logo-icon" onClick={() => setShowIconDesigner(true)} style={{ cursor: "pointer" }} title="Customize icon">{appIconEmoji}</div>
          <span className="logo-text">{appDisplayName || t.appName}</span>
        </div>
        <button onClick={() => { setShowSidebar(false); haptic("light"); }} title="Collapse sidebar" style={{ width: 28, height: 28, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>‹</button>
      </div>

      {/* XP Level Bar */}
      <div style={{ margin: "0 12px 14px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 11, padding: "10px 12px", cursor: "pointer", transition: "all .15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 16 }}>{getLevel(xp).icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", flex: 1 }}>{getLevel(xp).name}</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: "var(--acc)" }}>{xp} XP</span>
        </div>
        <div className="level-bar-wrap">
          <div className="level-bar-fill" style={{ width: `${getLevel(xp).progress}%` }} />
        </div>
      </div>

      <div className="profile-bar" onClick={() => { setTab("profiles"); play("tap"); }}>
        {authUser?.photo
          ? <img src={authUser.photo} alt="" style={{ width: 33, height: 33, borderRadius: 10, objectFit: "cover", border: `2px solid ${accent.v}60`, flexShrink: 0 }} />
          : <div className="profile-avatar" style={{ background: (curProfile?.color || '#7c6dfa') + "22" }}>{curProfile?.icon || '👤'}</div>
        }
        <span className="profile-name">{authUser?.name || curProfile?.name}</span>
        <span className="profile-arrow">⇄</span>
      </div>

      <div className="nav-group">
        <div className="nav-lbl">Navigation</div>
        {navItems.map(v => (
          <div key={v.id} 
            className={`nav-item ${tab === v.id ? "on" : ""}`} 
            onClick={() => { 
                setTab(v.id); 
                play("tap"); 
                if (v.id === "done") { setShowDone(true); setShowStarred(false); } 
                else if (v.id === "starred") { setShowStarred(true); setShowDone(false); } 
                else if (!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "time"].includes(v.id)) { 
                    setShowDone(false); 
                    setShowStarred(false); 
                } 
            }}>
            <span className="nav-icon">{v.icon}</span>{v.label}
            {v.cnt !== null && <span className="nav-badge">{v.cnt}</span>}
          </div>
        ))}
        {/* Quick Actions */}
        <div style={{ padding: "8px 12px 0", display: "flex", gap: 7 }}>
          <button onClick={() => { setFocusTaskId(null); setShowFocusMode(true); play("tap"); }} style={{ flex: 1, height: 34, background: "linear-gradient(135deg,#1a0040,#4a0080)", border: "1px solid var(--acc)", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "var(--acc)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>🌌 Focus</button>
          <button onClick={() => { setShowTemplateModal(true); play("tap"); }} style={{ flex: 1, height: 34, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>📋 Template</button>
        </div>
      </div>

      {/* Desktop Ad */}
      <div style={{ padding: "12px 10px 8px", marginTop: "auto", flexShrink: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t3)", opacity: .55, marginBottom: 4, paddingLeft: 2 }}>Advertisement</div>
        <div style={{ borderRadius: 12, overflow: "hidden", background: "var(--s2)", border: "1px solid var(--b1)", minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
           {/* Ad placeholder */}
           <div style={{ color: 'var(--t3)', fontSize: 10 }}>Sponsored Content</div>
        </div>
      </div>
    </div>
  );
};
