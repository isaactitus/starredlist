import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Sidebar } from "./components/Sidebar";
import AnimePet from "./components/AnimePet";
import { PetRoomModal } from "./components/PetRoomModal";
import { WellnessHub } from "./components/WellnessHub";
import { useTasks } from "./hooks/useTasks";
import { useWellness } from "./hooks/useWellness";
import { 
  uid, todayStr, fmtDate, fmtDateFull, isOverdue, 
  getDaysInMonth, getFirstDay, getLevel 
} from "./utils/helpers";
import { 
  LANGS, ACCENTS, ALARM_TONES, MUSIC_TRACKS, 
  DEFAULT_CATEGORIES, EMOJI_LIST, COLOR_LIST, 
  PRIORITIES, INIT_TASKS, DEFAULT_PROFILES, FONTS 
} from "./utils/constants";

// == Shared Project Utils ==
const getAvatar = name => {
  const AVATARS = ["⭐", "🦁", "🐯", "🦊", "🐺", "🦅", "🦋", "🐬", "🦎", "🐸", "🦉", "🌟", "🔥", "💎", "🚀"];
  return AVATARS[(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];
};

const getMyUid = () => {
  let id = localStorage.getItem("tf_lb_uid");
  if (!id) { id = Math.random().toString(36).slice(2, 18); localStorage.setItem("tf_lb_uid", id); }
  return id;
};

// libiBot is defined inline below (line ~1240)
// Stub: getAISuggestions derived from libiBot
function getAISuggestions(tasks, categories) {
  const active = tasks.filter(t => !t.done);
  const suggestions = [];
  const overdue = active.filter(t => t.due && new Date(t.due) < new Date());
  if (overdue.length > 0) suggestions.push({ id: 'overdue', type: 'warning', text: `You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}. Consider rescheduling or completing them.`, icon: '⚠️' });
  const highPri = active.filter(t => t.priority === 'high');
  if (highPri.length > 3) suggestions.push({ id: 'high_load', type: 'tip', text: `${highPri.length} high-priority tasks. Try breaking some into subtasks.`, icon: '🎯' });
  if (active.length > 10) suggestions.push({ id: 'many_tasks', type: 'tip', text: 'Lots of open tasks! Consider batching or deferring low-priority ones.', icon: '📋' });
  if (active.length === 0 && tasks.length > 0) suggestions.push({ id: 'all_done', type: 'celebrate', text: 'Amazing! All tasks completed. Time to plan something new!', icon: '🎉' });
  return suggestions;
}

// == Firebase via compat CDN scripts ==
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDF3hzM_MgycIhNo0-MSn8wXQUabfy74l4",
  authDomain: "taskflow-8a037.firebaseapp.com",
  projectId: "taskflow-8a037",
  storageBucket: "taskflow-8a037.firebasestorage.app",
  messagingSenderId: "684546629646",
  appId: "1:684546629646:web:cb3470ffb14f3bb45d5c5f"
};
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

// ── IndexedDB backup (survives browser storage clearing) ──
const IDB_NAME = "taskflow_backup";
const IDB_STORE = "data";
function openIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbSet(key, value) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
  } catch (e) { }
}
async function idbGet(key) {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    return new Promise((res, rej) => {
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  } catch (e) { return null; }
}
async function idbGetAll() {
  try {
    const db = await openIDB();
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    return new Promise((res, rej) => {
      const result = {};
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) { result[cursor.key] = cursor.value; cursor.continue(); }
        else res(result);
      };
      req.onerror = () => rej(req.error);
    });
  } catch (e) { return {}; }
}

let _db = null, _auth = null;
async function getFirebase() {
  if (_db && _auth) return { db: _db, auth: _auth };
  // Try loading from CDN with timeout
  const loadWithTimeout = (src, ms = 8000) => new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("Script load timeout")), ms);
    loadScript(src).then(() => { clearTimeout(timer); res(); }).catch(e => { clearTimeout(timer); rej(e); });
  });
  try {
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js");
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js");
    const fb = window.firebase;
    if (!fb) throw new Error("Firebase not on window after load");
    if (!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
    _db = fb.firestore();
    _auth = fb.auth();
    _auth.setPersistence(fb.auth.Auth.Persistence.LOCAL).catch(() => { });
    return { db: _db, auth: _auth };
  } catch (e) {
    console.error("Firebase error:", e);
    // Reset so next call retries
    _db = null; _auth = null;
    return null;
  }
}
async function getDB() {
  const fb = await getFirebase();
  return fb ? fb.db : null;
}

// ===================================================
//  TASKFLOW ULTIMATE  -- All Features, No API Needed
// ===================================================


// == Sound effects (Web Audio API) =================
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if (type === "complete") { o.frequency.setValueAtTime(523, ctx.currentTime); o.frequency.setValueAtTime(659, ctx.currentTime + 0.1); o.frequency.setValueAtTime(784, ctx.currentTime + 0.2); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.start(); o.stop(ctx.currentTime + 0.5); }
    else if (type === "add") { o.frequency.setValueAtTime(440, ctx.currentTime); o.frequency.setValueAtTime(554, ctx.currentTime + 0.15); g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); o.start(); o.stop(ctx.currentTime + 0.4); }
    else if (type === "delete") { o.frequency.setValueAtTime(300, ctx.currentTime); o.frequency.setValueAtTime(200, ctx.currentTime + 0.1); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o.start(); o.stop(ctx.currentTime + 0.3); }
    else if (type === "tap") { o.frequency.setValueAtTime(800, ctx.currentTime); g.gain.setValueAtTime(0.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); o.start(); o.stop(ctx.currentTime + 0.1); }
  } catch (e) { }
};



let _alarmCtx = null;
const stopAlarmSound = () => {
  try { if (_alarmCtx) { _alarmCtx.close(); _alarmCtx = null; } } catch (e) { }
};

function playAlarmTone(toneId = "classic") {
  stopAlarmSound();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    _alarmCtx = ctx;
    const master = ctx.createGain(); master.gain.value = 0.95; master.connect(ctx.destination);

    if (toneId === "classic") {
      // Classic two-tone bell -- 8 alternating bursts
      [0, .35, .7, 1.05, 1.4, 1.75, 2.1, 2.45].forEach((t, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = i % 2 === 0 ? 880 : 660;
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0.55, ctx.currentTime + t + 0.02);
        g.gain.setValueAtTime(0.55, ctx.currentTime + t + 0.28);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.32);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.35);
      });
      // Bell overtone
      const b = ctx.createOscillator(), bg = ctx.createGain();
      b.type = "sine"; b.frequency.value = 1320;
      bg.gain.setValueAtTime(0.2, ctx.currentTime); bg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.8);
      b.connect(bg); bg.connect(master); b.start(); b.stop(ctx.currentTime + 2.8);

    } else if (toneId === "digital") {
      // Fast repeating digital beep
      for (let i = 0; i < 12; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "square"; o.frequency.value = 1400;
        const t = i * 0.22;
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.01);
        g.gain.setValueAtTime(0.4, ctx.currentTime + t + 0.12);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.15);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
      }

    } else if (toneId === "gentle") {
      // Soft chime -- ascending notes
      const notes = [523, 659, 784, 1047, 1319];
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        const t = i * 0.38;
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.7);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.75);
      });
      // Repeat
      notes.forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = freq;
        const t = 2.1 + i * 0.38;
        g.gain.setValueAtTime(0, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.7);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.75);
      });

    } else if (toneId === "urgent") {
      // Rapid high-pitched urgent siren
      for (let i = 0; i < 16; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sawtooth"; o.frequency.value = i % 2 === 0 ? 1200 : 900;
        const t = i * 0.18;
        g.gain.setValueAtTime(0.5, ctx.currentTime + t);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + t + 0.16);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
      }

    } else if (toneId === "melody") {
      // Morning melody -- C major arpeggio
      const melody = [523, 659, 784, 659, 523, 784, 1047, 784, 659, 523, 659, 784];
      const dur = [0.28, 0.28, 0.28, 0.28, 0.18, 0.28, 0.38, 0.28, 0.28, 0.28, 0.28, 0.55];
      let ts = 0;
      melody.forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        g.gain.setValueAtTime(0, ctx.currentTime + ts);
        g.gain.linearRampToValueAtTime(0.45, ctx.currentTime + ts + 0.03);
        g.gain.setValueAtTime(0.42, ctx.currentTime + ts + dur[i] - 0.04);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + ts + dur[i]);
        o.connect(g); g.connect(master);
        o.start(ctx.currentTime + ts); o.stop(ctx.currentTime + ts + dur[i] + 0.02);
        ts += dur[i];
      });

    } else if (toneId === "pulse") {
      // Deep pulse thumps
      for (let i = 0; i < 8; i++) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(200, ctx.currentTime + i * 0.38);
        o.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + i * 0.38 + 0.25);
        g.gain.setValueAtTime(0.8, ctx.currentTime + i * 0.38);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.38 + 0.3);
        o.connect(g); g.connect(master); o.start(ctx.currentTime + i * 0.38); o.stop(ctx.currentTime + i * 0.38 + 0.32);
      }
    }
    // Repeat alarm every 4s until manually dismissed
    function repeatAlarm() {
      if (!_alarmCtx) return; // dismissed
      // Alarm auto-repeats by being called again from playAlarmTone
    }
    setTimeout(() => { if (_alarmCtx) playAlarmTone(toneId); }, 4200);
  } catch (e) { }
};

// == Ambient Music Engine (Web Audio API -- no files needed) ====


let _currentAudioNode = null;
function startMusic(trackId) {
  stopMusic();
  const track = MUSIC_TRACKS.find(t => t.id === trackId);
  if (!track) return;
  _currentAudioNode = new Audio(track.url);
  _currentAudioNode.loop = true;
  _currentAudioNode.volume = 0.4;
  _currentAudioNode.play().catch(e => console.log("Audio play blocked", e));
}

function stopMusic() {
  if (_currentAudioNode) {
    _currentAudioNode.pause();
    _currentAudioNode = null;
  }
}



// == CSS Factory ===================================
function makeCSS(dark, accent, accent2, rtl, font) {
  const f = font || "Outfit";
  return (`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;font-family: inherit; transition: background-color .4s cubic-bezier(.4,0,.2,1), border-color .4s cubic-bezier(.4,0,.2,1), color .3s ease, box-shadow .4s ease, transform .25s cubic-bezier(.34,1.56,.64,1); }
:root{
  --bg:${dark ? "#020308" : "#f5f7ff"};
  --s1:${dark ? "rgba(10,12,24,0.7)" : "rgba(255,255,255,0.75)"};
  --s2:${dark ? "rgba(18,22,42,0.6)" : "rgba(244,246,255,0.65)"};
  --s3:${dark ? "rgba(30,36,60,0.5)" : "rgba(230,234,250,0.55)"};
  --s4:${dark ? "rgba(42,50,84,0.4)" : "rgba(215,220,245,0.45)"};
  --b1:${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)"};
  --b2:${dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"};
  --t1:${dark ? "#f8f9ff" : "#1a1d35"};
  --t2:${dark ? "#a5adc8" : "#5a628a"};
  --t3:${dark ? "#586290" : "#8ca0c8"};
  --glass:${dark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.4)"};
  --glass-border:${dark ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.6)"};
  --acc:${accent};
  --acc2:${accent2};
  --accd:${accent}18;
  --glow:${accent}44;
  --red:#ff6b6b;--yellow:#ffd93d;--green:#4ade80;
  --safe-b:env(safe-area-inset-bottom,0px);
  --shadow-sm: 0 2px 8px rgba(0,0,0,0.05);
  --shadow-md: 0 8px 32px rgba(0,0,0,0.1);
  --shadow-lg: 0 24px 64px rgba(0,0,0,0.15);
}
html,body{height:100%;width:100%;margin:0;padding:0;background:var(--bg);color:var(--t1);font-family:'${f}',sans-serif;-webkit-font-smoothing:antialiased;direction:${rtl ? "rtl" : "ltr"};transition:background .4s ease,color .4s ease;};
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit;}
input,textarea,select{font-family:inherit;color:inherit;background:none;border:none;outline:none;}
textarea{resize:none;}
::-webkit-scrollbar{width:3px;}
::-webkit-scrollbar-track{background:transparent;}
::-webkit-scrollbar-thumb{background:linear-gradient(180deg,${accent},${accent2});border-radius:3px;}
.shell{
  display:flex;height:100vh;height:100dvh;overflow:hidden;
  padding-bottom:env(safe-area-inset-bottom,0px);
}

/* == SIDEBAR == */
.sidebar{
  width:234px;flex-shrink:0;transition:width .4s cubic-bezier(.4,0,.2,1),opacity .25s ease;
  background:${dark ? "rgba(6,8,18,0.4)" : "rgba(255,255,255,0.45)"};
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-right:1px solid var(--glass-border);
  display:flex;flex-direction:column;padding:22px 0 16px;
  overflow-y:auto;position:relative;z-index:2;
  box-shadow:${dark ? "8px 0 40px rgba(0,0,0,0.4)" : "4px 0 24px rgba(0,0,0,0.03)"};
}
.logo{display:flex;align-items:center;gap:10px;padding:0 16px 20px;}
.logo-icon{
  width:40px;height:40px;
  background:linear-gradient(135deg,${accent},${accent2});
  border-radius:13px;display:flex;align-items:center;justify-content:center;
  font-size:20px;flex-shrink:0;
  box-shadow:0 0 24px ${accent}70,0 6px 16px ${accent}45;
  animation:galaxyPulse 3s ease-in-out infinite;
}
.logo-text{
  font-family:'Instrument Serif',serif;font-size:21px;
  background:linear-gradient(135deg,${accent},${accent2},#fff);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
  font-weight:400;
}
.profile-bar{
  margin:0 10px 14px;
  background:linear-gradient(135deg,${accent}18,${accent2}0a);
  border:1px solid ${accent}35;
  border-radius:15px;padding:11px 13px;
  display:flex;align-items:center;gap:9px;cursor:pointer;transition:all .22s;
}
.profile-bar:hover{border-color:${accent}65;box-shadow:0 6px 20px ${accent}28;transform:translateY(-1px);}
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
.nav-item:hover{background:${accent}14;color:var(--t1);transform:translateX(2px);}
.nav-item.on{
  background:linear-gradient(135deg,${accent}30,${accent2}18);
  color:${accent};font-weight:700;
  box-shadow:inset 0 0 0 1px ${accent}40,0 2px 12px ${accent}20;
}
.nav-icon{font-size:16px;width:22px;text-align:center;flex-shrink:0;}
.nav-badge{
  margin-left:auto;font-size:10px;
  background:linear-gradient(135deg,${accent},${accent2});
  color:#fff;padding:2px 8px;border-radius:20px;font-weight:800;
  box-shadow:0 2px 8px ${accent}50;
}
.nav-div{height:1px;background:linear-gradient(90deg,transparent,var(--b1),transparent);margin:8px 16px;}

/* == MAIN == */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:transparent;position:relative;z-index:1;}
.topbar{
  display:flex;align-items:center;gap:12px;
  padding:12px 20px;
  padding-top:max(12px,calc(12px + env(safe-area-inset-top)));
  background:${dark ? "rgba(6,8,18,0.4)" : "rgba(255,255,255,0.5)"};
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-bottom:1px solid var(--glass-border);
  flex-shrink:0;position:relative;z-index:10;
  box-shadow: 0 4px 30px rgba(0,0,0,0.05);
  transition:none;
  will-change:transform;
  overflow:hidden;
}
/* Logo area — collapses on scroll down */
.topbar-logo-wrap{
  display:flex;align-items:center;gap:7px;
  flex-shrink:0;cursor:pointer;
  max-width:140px;
  overflow:hidden;
  transition:max-width .32s cubic-bezier(.4,0,.2,1),
             opacity .28s ease,
             margin .32s cubic-bezier(.4,0,.2,1);
  opacity:1;
}
.topbar.logo-hidden .topbar-logo-wrap{
  max-width:0;
  opacity:0;
  margin-right:0;
  pointer-events:none;
}
/* Search bar — expands to fill space when logo gone */
.search-wrap{
  display:flex;align-items:center;gap:7px;
  background:var(--s2);border:1px solid var(--b1);
  border-radius:13px;padding:0 13px;height:36px;
  transition:flex .32s cubic-bezier(.4,0,.2,1),
             max-width .32s cubic-bezier(.4,0,.2,1),
             box-shadow .2s ease;
  flex:1;max-width:240px;min-width:0;
}
.topbar.logo-hidden .search-wrap{
  flex:1;
  max-width:100%;
}
.search-wrap:focus-within{border-color:${accent}80;box-shadow:0 0 0 3px ${accent}18;}
.search-wrap input{flex:1;font-size:13px;min-width:0;font-weight:500;background:transparent;border:none;outline:none;color:var(--t1);}
.search-wrap input::placeholder{color:var(--t3);}
@keyframes slideDownBar{
  from{transform:translateY(-100%);opacity:0;}
  to{transform:translateY(0);opacity:1;}
}
.menu-btn{width:36px;height:36px;border-radius:10px;background:var(--s2);display:none;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;border:1px solid var(--b1);}
.topbar-title{
  font-family:'Instrument Serif',serif;font-size:19px;flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  background:linear-gradient(135deg,var(--t1) 40%,${accent});
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.search-wrap{
  display:flex;align-items:center;gap:7px;
  background:var(--s2);border:1px solid var(--b1);
  border-radius:13px;padding:0 13px;height:36px;
  transition:all .22s;flex:1;max-width:220px;
}
.search-wrap:focus-within{border-color:${accent}80;box-shadow:0 0 0 3px ${accent}18;}
.search-wrap input{flex:1;font-size:13px;min-width:0;font-weight:500;}
.search-wrap input::placeholder{color:var(--t3);}
.tb-btn{
  width:36px;height:36px;border-radius:10px;
  background:var(--s2);border:1px solid var(--b1);
  display:flex;align-items:center;justify-content:center;
  font-size:16px;transition:all .2s;flex-shrink:0;
}
.tb-btn:hover{border-color:${accent}65;color:${accent};transform:translateY(-1px);box-shadow:0 4px 14px ${accent}30;}
.add-btn{
  height:36px;padding:0 16px;
  background:linear-gradient(135deg,${accent},${accent2});
  border-radius:12px;font-size:13px;font-weight:700;color:#fff;
  display:flex;align-items:center;gap:5px;
  box-shadow:0 4px 18px ${accent}55;transition:all .22s;flex-shrink:0;
}
.add-btn:hover{transform:translateY(-2px);box-shadow:0 8px 28px ${accent}65;}
.add-btn:active{transform:scale(.97);}

/* == CONTENT == */
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:14px 10px 90px;-webkit-overflow-scrolling:touch;min-height:0;}

/* == STAT CARDS == */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
.stat{
  background: var(--s1);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: 22px; padding: 16px 15px 14px;
  transition: all .35s cubic-bezier(.34,1.56,.64,1);
  cursor: pointer; position: relative; overflow: hidden;
  box-shadow: var(--shadow-md);
}
.stat:hover{transform:translateY(-5px) scale(1.02); box-shadow: var(--shadow-lg); border-color:${accent}80;}
.stat-val{font-family:'Instrument Serif',serif;font-size:32px;line-height:1;margin-bottom:6px;color:var(--t1);}
.stat-lbl{font-size:10px;color:var(--t3);font-weight:800;letter-spacing:1px;text-transform:uppercase;}
.stat-bar{height:4px;background:var(--s4);border-radius:3px;margin-top:12px;overflow:hidden;}
.stat-bar-f{height:100%;border-radius:3px;transition:width 1.2s cubic-bezier(.34,1.56,.64,1);}

/* == PROG CARD == */
.prog-card{
  background:var(--s1);
  border:1px solid ${accent}28;border-radius:22px;
  padding:16px 20px;display:flex;align-items:center;gap:14px;
  margin-bottom:16px;flex-wrap:wrap;
  box-shadow:0 6px 24px ${accent}18;
}
.ring-svg{transform:rotate(-90deg);}
.ring-bg{fill:none;stroke:var(--s3);stroke-width:5;}
.ring-fg{fill:none;stroke:url(#ringGrad);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset 1s cubic-bezier(.34,1.56,.64,1);}
.prog-info{flex:1;min-width:130px;}
.prog-pct{font-family:'Instrument Serif',serif;font-size:26px;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.prog-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.prio-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}
.pchip{font-size:10.5px;padding:4px 10px;border-radius:20px;font-weight:700;cursor:pointer;transition:transform .15s;}
.pchip:hover{transform:scale(1.06);}

/* == FILTER CHIPS == */
.filter-bar{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.filter-bar::-webkit-scrollbar{display:none;}
.fchip{
  font-size:12px;padding:7px 15px;border-radius:24px;
  border:1.5px solid var(--b1);color:var(--t2);
  cursor:pointer;transition:all .22s cubic-bezier(.4,0,.2,1);
  background:var(--s1);font-weight:600;white-space:nowrap;flex-shrink:0;
  letter-spacing:0.1px;
}
.fchip:hover{border-color:${accent}55;color:${accent};background:${accent}0d;transform:translateY(-1px);}
.fchip.on{
  background:linear-gradient(135deg,${accent},${accent2});
  border-color:transparent;color:#fff;font-weight:700;
  box-shadow:0 4px 18px ${accent}45;transform:translateY(-1px);
}

/* == TASK CARDS == */
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding:0 2px;}
.sec-title{font-size:11px;font-weight:800;color:var(--t3);display:flex;align-items:center;gap:6px;letter-spacing:.8px;text-transform:uppercase;}
.view-row{display:flex;gap:5px;align-items:center;}
.vt-btn{width:30px;height:30px;border-radius:9px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--t3);transition:all .18s;}
.vt-btn.on{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;color:#fff;box-shadow:0 3px 12px ${accent}45;}
.sort-btn{font-size:11px;color:var(--t2);padding:5px 12px;background:var(--s2);border:1.5px solid var(--b1);border-radius:20px;font-weight:700;transition:all .18s;letter-spacing:.2px;}
.sort-btn:hover{border-color:${accent}55;color:${accent};background:${accent}0d;}
.task-list{display:flex;flex-direction:column;gap:9px;}
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;}
.glass-card{
  background:${dark ? "rgba(12,15,26,0.75)" : "rgba(255,255,255,0.72)"};
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border:1px solid ${dark ? "rgba(124,109,250,0.18)" : "rgba(255,255,255,0.85)"};
  border-radius:20px;
  box-shadow:${dark ? "0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)" : "0 8px 32px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.9)"};
}
@keyframes taskIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
.task{
  background:${dark ? "rgba(12,15,26,0.92)" : "rgba(255,255,255,0.98)"};
  border:1.5px solid ${dark ? "rgba(100,120,220,0.10)" : "rgba(0,0,0,0.055)"};
  border-radius:20px;padding:14px 14px 13px 20px;
  display:flex;align-items:flex-start;gap:11px;
  cursor:pointer;transition:transform .2s cubic-bezier(.4,0,.2,1),box-shadow .2s cubic-bezier(.4,0,.2,1),border-color .2s ease;
  position:relative;overflow:hidden;
  animation:taskIn .3s cubic-bezier(.34,1.25,.64,1) both;
  box-shadow:${dark ? "0 2px 12px rgba(0,0,0,0.3)" : "0 2px 10px rgba(0,0,0,0.045),0 1px 2px rgba(0,0,0,0.03)"};
}
.task::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:20px 0 0 20px;transition:all .2s;}
.task:hover{border-color:${accent}40;transform:translateY(-2px);box-shadow:${dark ? "0 10px 36px rgba(0,0,0,0.45)" : `0 8px 32px ${accent}18,0 3px 12px rgba(0,0,0,0.07)`};}
.task:hover::before{opacity:1;}
.task.ph::before{background:linear-gradient(180deg,#ff6b6b,#ff4757);opacity:.85;}
.task.pm::before{background:linear-gradient(180deg,#ffd93d,#ff9f43);opacity:.85;}
.task.pl::before{background:linear-gradient(180deg,#6bcb77,#00d4aa);opacity:.85;}
.task.done-t{opacity:.42;}.task.done-t .t-title{text-decoration:line-through;color:var(--t3);}
.task.ov-t{border-color:rgba(255,107,107,.30);box-shadow:0 0 0 1px rgba(255,107,107,.10);}
.task-grid .task{flex-direction:column;gap:9px;}.task-grid .t-act{opacity:1;}
.chk{
  width:23px;height:23px;
  border:2px solid var(--s4);border-radius:8px;
  flex-shrink:0;margin-top:1px;
  display:flex;align-items:center;justify-content:center;
  transition:all .22s cubic-bezier(.34,1.56,.64,1);background:var(--s2);
}
.chk.on{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;box-shadow:0 3px 14px ${accent}55;}
.t-body{flex:1;min-width:0;}
.t-top{display:flex;align-items:flex-start;gap:7px;margin-bottom:5px;}
.t-title{font-size:14px;font-weight:600;line-height:1.4;flex:1;letter-spacing:-0.1px;}
.t-star{font-size:14px;opacity:.25;flex-shrink:0;transition:all .22s;}
.t-star.lit{opacity:1;filter:drop-shadow(0 0 6px #ffd93d);}
.t-note{font-size:12px;color:var(--t3);line-height:1.55;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.t-photo{width:100%;height:80px;object-fit:cover;border-radius:12px;margin-bottom:8px;border:1px solid var(--b1);}
.t-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;}
.tchip{font-size:10.5px;padding:3px 9px;border-radius:20px;font-weight:700;letter-spacing:.1px;}
.t-date{font-size:10.5px;color:var(--t3);font-weight:600;}
.t-date.ov{color:var(--red);}
.sub-prog{margin-top:6px;}
.sub-bar{height:3px;background:var(--s3);border-radius:2px;overflow:hidden;margin-bottom:3px;}
.sub-bar-f{height:100%;background:linear-gradient(90deg,${accent},${accent2});border-radius:2px;transition:width .5s cubic-bezier(.34,1.56,.64,1);}
.sub-lbl{font-size:10px;color:var(--t3);font-weight:600;}
.t-recur{font-size:10px;color:var(--t3);display:flex;align-items:center;gap:3px;font-weight:600;}
.t-act{display:flex;gap:3px;margin-left:2px;flex-shrink:0;opacity:0;transition:opacity .18s;}
.task:hover .t-act{opacity:1;}
.ic-btn{width:29px;height:29px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .16s;color:var(--t3);}
.ic-btn:hover{background:var(--s3);color:var(--t1);transform:scale(1.1);}
.ic-btn.del:hover{background:rgba(255,107,107,.18);color:var(--red);transform:scale(1.1);}

/* == EMPTY STATE == */
.empty{text-align:center;padding:65px 20px;}
.empty-icon{font-size:52px;margin-bottom:14px;animation:float 3.5s ease-in-out infinite;}
.empty-t{font-size:16px;color:var(--t2);margin-bottom:7px;font-weight:700;}

/* == DRAG & DROP == */
@keyframes dropIndicator{from{opacity:0;transform:scaleX(.5)}to{opacity:1;transform:scaleX(1)}}
.drag-handle{
  position:absolute;left:6px;top:50%;transform:translateY(-50%);
  width:18px;height:30px;
  display:flex;align-items:center;justify-content:center;
  color:var(--t3);font-size:14px;cursor:grab;
  opacity:0;transition:opacity .18s;
  user-select:none;-webkit-user-select:none;
  letter-spacing:-2px;
}
.task:hover .drag-handle{opacity:1;}
.drag-handle:active{cursor:grabbing;}
.task-dragging{
  opacity:0.4!important;
  box-shadow:none!important;
  border-style:dashed!important;
}
.task-swipe-wrap[draggable="true"]{cursor:grab;}
.task-swipe-wrap[draggable="true"]:active{cursor:grabbing;}

/* == CHAT == */
.chat-panel{
  width:296px;flex-shrink:0;
  transition:none!important;
  background:${dark ? "rgba(6,8,18,0.90)" : "rgba(255,255,255,0.90)"};
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border-left:1px solid ${dark ? "rgba(100,120,220,0.13)" : "rgba(0,0,0,0.05)"};
  display:flex;flex-direction:column;position:relative;z-index:1;
  box-shadow:${dark ? "-4px 0 30px rgba(0,0,0,0.4)" : "none"};
}
.chat-head{padding:16px 15px 12px;border-bottom:1px solid var(--b1);}
.chat-head-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;}
.chat-title{
  font-family:'Instrument Serif',serif;font-size:18px;
  display:flex;align-items:center;gap:7px;
  background:linear-gradient(135deg,${accent},${accent2});
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.offline-pill{font-size:10px;padding:2px 9px;border-radius:20px;font-weight:700;background:rgba(107,203,119,.14);color:var(--green);border:1px solid rgba(107,203,119,.3);}
.chat-sub{font-size:11px;color:var(--t3);}
.chat-msgs{flex:1;overflow-y:auto;padding:12px 13px;display:flex;flex-direction:column;gap:9px;min-height:0;}
.msg{max-width:96%;}
.msg.u{align-self:flex-end;}.msg.a{align-self:flex-start;}
.bubble{padding:10px 14px;border-radius:18px;font-size:13px;line-height:1.7;white-space:pre-wrap;max-width:88%;}
.bubble.bot{border-radius:4px 18px 18px 18px;}
.bubble.user{border-radius:18px 4px 18px 18px;}
.msg.u .bubble{background:linear-gradient(135deg,${accent},${accent2});color:#fff;border-radius:14px 14px 3px 14px;box-shadow:0 3px 14px ${accent}45;}
.msg.a .bubble{background:var(--s2);border:1px solid var(--b1);color:var(--t1);border-radius:14px 14px 14px 3px;}
.typing-b{display:flex;gap:5px;padding:3px 2px;}
.tdot{width:7px;height:7px;background:${accent};border-radius:50%;animation:bop 1.1s infinite;}
.tdot:nth-child(2){animation-delay:.16s;}.tdot:nth-child(3){animation-delay:.32s;}
@keyframes bop{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-7px)}}
.chat-quick{padding:0 11px 8px;display:flex;flex-wrap:wrap;gap:5px;}
.qbtn{font-size:10.5px;padding:5px 11px;background:${accent}14;border:1.5px solid ${accent}30;border-radius:20px;color:${accent};transition:all .15s;cursor:pointer;font-weight:600;}
.qbtn:hover{background:${accent}28;border-color:${accent}60;transform:scale(1.04);}
.chat-inp{padding:8px 11px calc(20px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--b1);display:flex;gap:7px;align-items:flex-end;flex-shrink:0;}
.chat-ta{flex:1;background:var(--s2);border:1.5px solid var(--b1);border-radius:13px;padding:8px 12px;font-size:12.5px;color:var(--t1);max-height:80px;line-height:1.5;transition:all .2s;}
.chat-ta:focus{border-color:${accent}70;box-shadow:0 0 0 3px ${accent}14;}
.chat-ta::placeholder{color:var(--t3);}
.send-btn{width:35px;height:35px;background:linear-gradient(135deg,${accent},${accent2});border-radius:12px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s;box-shadow:0 3px 12px ${accent}45;}
.send-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px ${accent}58;}
.send-btn:disabled{opacity:.32;cursor:not-allowed;transform:none;}

/* == BOTTOM NAV == */
.bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;transition:transform .3s cubic-bezier(.4,0,.2,1);will-change:transform;padding-bottom:env(safe-area-inset-bottom,0px);background:${dark ? "rgba(6,8,18,0.94)" : "rgba(255,255,255,0.94)"};backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-top:1px solid ${dark ? "rgba(100,120,220,0.12)" : "rgba(0,0,0,0.06)"};z-index:50;padding:6px 0 calc(6px + var(--safe-b));box-shadow:${dark ? "0 -8px 30px rgba(0,0,0,0.5)" : "0 -4px 20px rgba(0,0,0,0.06)"};}
.bot-inner{display:flex;align-items:center;justify-content:space-around;}
.bot-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9.5px;font-weight:700;color:var(--t3);cursor:pointer;padding:4px 10px;position:relative;transition:all .18s;}
.bot-item.on{color:${accent};}
.bot-item.on .bot-icon{transform:scale(1.15);filter:drop-shadow(0 2px 6px ${accent}60);}
.bot-item.on span:last-child{font-weight:800;}
.bot-icon{font-size:21px;transition:transform .2s;}
.bot-item.on .bot-icon{transform:translateY(-3px);filter:drop-shadow(0 0 6px ${accent}80);}
.bot-num{position:absolute;top:0;right:3px;min-width:14px;height:14px;background:linear-gradient(135deg,var(--red),#ff4757);border-radius:20px;font-size:8.5px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 3px;box-shadow:0 2px 6px rgba(255,71,87,.5);}
.fab-wrap{display:flex;flex-direction:column;align-items:center;margin-top:-20px;}
.fab{width:54px;height:54px;background:linear-gradient(135deg,${accent},${accent2});border-radius:17px;box-shadow:0 6px 26px ${accent}65,0 0 0 2px ${accent}35;display:flex;align-items:center;justify-content:center;font-size:26px;color:#fff;font-weight:700;transition:all .22s;border:none;cursor:pointer;animation:galaxyPulse 3s ease-in-out infinite;}
.fab:hover{transform:scale(1.08);box-shadow:0 10px 36px ${accent}75,0 0 0 3px ${accent}35;}
.fab:active{transform:scale(.93);}
.fab-lbl{font-size:9px;font-weight:800;color:${accent};margin-top:3px;}

/* == OVERLAY & MODAL == */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(16px);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:overlayFadeIn .22s ease;}
@keyframes overlayFadeIn{from{opacity:0;backdrop-filter:blur(0px)}to{opacity:1;backdrop-filter:blur(16px)}}
@keyframes sheetSlideUp{from{transform:translateY(100%) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
@keyframes toolItemPop{from{opacity:0;transform:scale(.8) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes fo{from{opacity:0}to{opacity:1}}
.modal{background:${dark ? 'rgba(8,10,20,0.97)' : 'rgba(255,255,255,0.98)'};border:1px solid ${dark ? 'rgba(100,120,220,0.16)' : 'rgba(0,0,0,0.07)'};border-radius:28px 28px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;animation:sheetSlideUp .38s cubic-bezier(.32,1.2,.64,1);padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);}
.modal.center{align-self:center;border-radius:24px;max-width:420px;max-height:90vh;padding-bottom:0;}
@keyframes su{from{opacity:0;transform:translateY(40px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes moreSlideUp{from{opacity:0;transform:translateY(100%)}to{opacity:1;transform:translateY(0)}}
@keyframes moreItemIn{from{opacity:0;transform:scale(.8) translateY(6px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes backdropIn{from{opacity:0}to{opacity:1}}
.drag{width:44px;height:4px;background:linear-gradient(90deg,${accent},${accent2});border-radius:4px;margin:13px auto 4px;opacity:.7;flex-shrink:0;}
.m-head{padding:8px 20px 0;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.m-title{font-family:'Instrument Serif',serif;font-size:21px;background:linear-gradient(135deg,var(--t1) 50%,${accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.m-body{padding:16px 20px 14px;display:flex;flex-direction:column;gap:14px;overflow-y:auto;flex:1;-webkit-overflow-scrolling:touch;}
.f-lbl{font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.9px;text-transform:uppercase;margin-bottom:5px;}
.f-in{background:var(--s2);border:1.5px solid var(--b1);border-radius:13px;padding:10px 14px;font-size:13.5px;width:100%;color:var(--t1);transition:border-color .25s ease,box-shadow .3s ease,background .2s ease;box-sizing:border-box;font-family:inherit;-webkit-appearance:none;appearance:none;}
.f-in:focus{border-color:${accent}70;box-shadow:0 0 0 3px ${accent}14,0 4px 12px ${accent}10;outline:none;background:${dark ? 'rgba(20,22,40,.7)' : 'rgba(255,255,255,.9)'};}
.f-in:hover:not(:focus){border-color:${accent}35;}
.f-in::placeholder{color:var(--t3);opacity:.7;}
.f-in[type="number"]{-moz-appearance:textfield;}
.f-in[type="number"]::-webkit-outer-spin-button,.f-in[type="number"]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0;}
.f-in[type="date"]{color-scheme:${dark ? 'dark' : 'light'};}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.m-foot{padding:14px 20px 16px;display:flex;gap:9px;flex-shrink:0;background:${dark ? 'rgba(8,10,20,0.97)' : 'rgba(255,255,255,0.98)'};}
.btn-c{flex:1;height:50px;background:var(--s2);border:1.5px solid var(--b1);border-radius:14px;font-size:13px;color:var(--t2);transition:all .15s;font-weight:600;}
.btn-c:hover{border-color:${accent}55;color:${accent};}
.btn-s{flex:2;height:50px;background:linear-gradient(135deg,${accent},${accent2});border-radius:14px;font-size:13px;font-weight:800;color:#fff;box-shadow:0 5px 18px ${accent}55;transition:all .22s;}
.btn-s:hover{transform:translateY(-1px);box-shadow:0 8px 28px ${accent}65;}
.btn-s:disabled{opacity:.32;cursor:not-allowed;transform:none;}

/* == SUBTASKS / TAGS / PHOTO == */
.photo-up{background:var(--s2);border:2px dashed ${accent}40;border-radius:14px;padding:20px;text-align:center;cursor:pointer;transition:all .2s;}
.photo-up:hover{border-color:${accent};background:${accent}0a;}
.photo-prev{width:100%;max-height:150px;object-fit:cover;border-radius:12px;}
.sub-list{display:flex;flex-direction:column;gap:5px;margin-top:5px;}
.sub-row{display:flex;align-items:center;gap:7px;background:var(--s2);border-radius:10px;padding:7px 10px;border:1px solid var(--b1);}
.sub-chk{width:17px;height:17px;border:2px solid var(--s4);border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .22s;}
.sub-chk.on{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;box-shadow:0 2px 8px ${accent}45;}
.sub-txt{flex:1;font-size:12.5px;}
.sub-txt.ds{text-decoration:line-through;color:var(--t3);}
.tags-wrap{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
.tag-item{display:flex;align-items:center;gap:4px;font-size:11px;padding:4px 10px;border-radius:20px;background:${accent}18;color:${accent};border:1px solid ${accent}38;font-weight:700;}

/* == SETTINGS == */
.settings-page{padding:20px 18px 90px;}
.settings-section{background:var(--s1);border:1px solid var(--b1);border-radius:22px;overflow:hidden;margin-bottom:16px;box-shadow:0 4px 20px rgba(0,0,0,.06);}
.settings-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--b1);transition:all .15s;cursor:pointer;}
.settings-row:last-child{border-bottom:none;}
.settings-row:hover{background:${accent}0a;}
.settings-icon{font-size:20px;width:38px;height:38px;border-radius:12px;background:${accent}14;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.settings-label{flex:1;}
.settings-title{font-size:13.5px;font-weight:700;}
.settings-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.settings-value{font-size:12.5px;color:var(--t2);}
.toggle{width:48px;height:27px;background:var(--s3);border-radius:14px;position:relative;cursor:pointer;transition:all .26s;flex-shrink:0;}
.toggle.on{background:linear-gradient(135deg,${accent},${accent2});box-shadow:0 2px 12px ${accent}45;}
.toggle-knob{width:23px;height:23px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:left .26s cubic-bezier(.34,1.56,.64,1);box-shadow:0 2px 8px rgba(0,0,0,.28);}
.toggle.on .toggle-knob{left:23px;}

/* == STATS == */
.stats-page{padding:20px 18px 90px;}
/* ── Design Refresh 2.0 ── */
.chart-card{background:var(--s1);border:1px solid var(--b1);border-radius:22px;padding:20px;margin-bottom:14px;box-shadow:0 4px 18px rgba(0,0,0,.06);}
.chart-title{font-size:13px;font-weight:800;color:var(--t2);margin-bottom:14px;letter-spacing:.4px;text-transform:uppercase;}
.bar-chart{display:flex;align-items:flex-end;gap:8px;height:100px;}
.bar-col{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;}
.bar{width:100%;border-radius:8px 8px 0 0;transition:height .7s cubic-bezier(.34,1.56,.64,1);min-height:4px;}
.bar-lbl{font-size:10px;color:var(--t3);text-align:center;}
.bar-val{font-size:10px;font-weight:800;color:var(--t2);}
.pie-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
.pie-legend{display:flex;flex-direction:column;gap:9px;flex:1;}
.pie-item{display:flex;align-items:center;gap:9px;font-size:12px;}
.pie-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.pie-label{flex:1;color:var(--t2);}
.pie-count{font-weight:800;}
.streak-row{display:flex;gap:6px;flex-wrap:wrap;}
.streak-day{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;transition:all .2s;}

/* == CALENDAR == */
.cal-page{padding:16px 18px 90px;}
.cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.cal-month{font-family:'Instrument Serif',serif;font-size:22px;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.cal-nav{width:36px;height:36px;border-radius:11px;background:var(--s2);border:1.5px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .15s;}
.cal-nav:hover{border-color:${accent}60;color:${accent};box-shadow:0 3px 12px ${accent}25;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px;}
.cal-day-name{text-align:center;font-size:11px;font-weight:800;color:var(--t3);padding:5px 0;letter-spacing:.5px;}
.cal-cell{min-height:44px;border-radius:12px;padding:5px;cursor:pointer;transition:all .18s;position:relative;border:1.5px solid transparent;}
.cal-cell:hover{background:${accent}12;border-color:${accent}25;}
.cal-cell.today{border-color:${accent}65;background:${accent}16;box-shadow:0 0 0 1px ${accent}30;}
.cal-cell.has-tasks{background:var(--s2);}
.cal-cell.selected{background:linear-gradient(135deg,${accent},${accent2});box-shadow:0 4px 18px ${accent}45;border-color:transparent;}
.cal-cell.selected .cal-num{color:#fff;}
.cal-num{font-size:13px;font-weight:600;text-align:center;}
.cal-dots{display:flex;gap:2px;justify-content:center;margin-top:3px;flex-wrap:wrap;}
.cal-dot{width:5px;height:5px;border-radius:50%;}
.cal-task-list{background:var(--s1);border:1px solid var(--b1);border-radius:18px;padding:14px;}
.cal-task-title{font-size:13px;font-weight:800;color:var(--t2);margin-bottom:10px;}

/* == PIN LOCK == */
.pin-screen{position:fixed;inset:0;background:${dark ? "#04060e" : "#eef0fa"};z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;}
.pin-icon{font-size:54px;animation:float 3s ease-in-out infinite;filter:drop-shadow(0 0 16px ${accent}60);}
.pin-title{font-family:'Instrument Serif',serif;font-size:28px;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.pin-dots{display:flex;gap:18px;}
.pin-dot{width:18px;height:18px;border-radius:50%;border:2px solid var(--b2);transition:all .24s;}
.pin-dot.filled{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;box-shadow:0 0 14px ${accent}65;}
.pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}
.pin-key{width:76px;height:76px;border-radius:22px;background:var(--s1);border:1.5px solid var(--b1);font-size:25px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;user-select:none;backdrop-filter:blur(10px);}
.pin-key:hover{border-color:${accent}65;color:${accent};transform:scale(1.07);box-shadow:0 6px 20px ${accent}35;}
.pin-key:active{transform:scale(.92);}
.pin-error{color:var(--red);font-size:13px;font-weight:800;}

/* == PROFILES == */
.prof-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:14px;}
.prof-card{background:var(--s2);border:2px solid var(--b1);border-radius:20px;padding:18px;text-align:center;cursor:pointer;transition:all .22s;}
.prof-card:hover,.prof-card.on{border-color:${accent}60;background:${accent}12;box-shadow:0 6px 24px ${accent}28;}
.prof-avatar{font-size:32px;margin-bottom:9px;}
.prof-name{font-size:14px;font-weight:800;}
.prof-count{font-size:11px;color:var(--t3);margin-top:3px;}
.export-area{background:var(--s2);border:1px solid var(--b1);border-radius:13px;padding:14px;font-size:12px;font-family:monospace;color:var(--t2);white-space:pre-wrap;max-height:200px;overflow-y:auto;margin-bottom:12px;}
.accent-grid{display:flex;gap:10px;flex-wrap:wrap;}
.accent-swatch{width:38px;height:38px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:all .22s;}
.accent-swatch.on{border-color:var(--t1);transform:scale(1.22);box-shadow:0 4px 16px var(--glow);}

/* == NOTIFICATIONS == */
.notif-badge{position:fixed;top:16px;right:16px;background:var(--s1);border:1.5px solid ${accent}45;border-radius:18px;padding:13px 17px;box-shadow:0 10px 36px rgba(0,0,0,.38),0 0 0 1px ${accent}18;z-index:400;animation:none;max-width:292px;}
@keyframes slideIn{from{opacity:0;transform:translateY(-22px) scale(.93)}to{opacity:1;transform:translateY(0) scale(1)}}
.notif-title{font-size:13px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:7px;color:${accent};}
.notif-body{font-size:12px;color:var(--t2);}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);animation:blink 2s infinite;flex-shrink:0;box-shadow:0 0 7px var(--green);}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.25}}

/* == POMODORO == */
.pomo-page{padding:20px 18px 90px;display:flex;flex-direction:column;align-items:center;gap:18px;}
.pomo-card{background:var(--s1);border:1.5px solid ${accent}28;border-radius:26px;padding:28px 24px;width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;gap:16px;box-shadow:0 10px 36px ${accent}20;}
.pomo-ring{position:relative;display:flex;align-items:center;justify-content:center;}
.pomo-time{position:absolute;text-align:center;}
.pomo-mins{font-family:'Instrument Serif',serif;font-size:56px;line-height:1;letter-spacing:-2px;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.pomo-secs{font-size:14px;color:var(--t3);margin-top:2px;}
.pomo-label{font-size:13px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;color:var(--t3);}
.pomo-controls{display:flex;gap:10px;align-items:center;}
.pomo-btn{width:56px;height:56px;border-radius:17px;font-size:22px;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.pomo-btn.main{background:linear-gradient(135deg,${accent},${accent2});color:#fff;box-shadow:0 8px 26px ${accent}60;width:68px;height:68px;border-radius:21px;font-size:28px;}
.pomo-btn.main:hover{transform:scale(1.07);box-shadow:0 12px 34px ${accent}70;}
.pomo-btn.sec{background:var(--s2);border:1.5px solid var(--b1);color:var(--t2);}
.pomo-btn:hover{transform:scale(1.05);}
.pomo-modes{display:flex;gap:8px;background:var(--s2);border-radius:15px;padding:4px;}
.pomo-mode{font-size:12px;font-weight:700;padding:7px 16px;border-radius:12px;cursor:pointer;color:var(--t2);transition:all .2s;}
.pomo-mode.on{background:linear-gradient(135deg,${accent}28,${accent2}14);color:${accent};box-shadow:inset 0 0 0 1px ${accent}38;}
.pomo-sessions{display:flex;gap:7px;}
.pomo-dot{width:12px;height:12px;border-radius:50%;border:2px solid var(--b2);transition:all .22s;}
.pomo-dot.done{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;box-shadow:0 0 10px ${accent}55;}
.pomo-task-pick{width:100%;max-width:420px;}
.pomo-task-title{font-size:12px;font-weight:800;color:var(--t3);letter-spacing:.8px;text-transform:uppercase;margin-bottom:8px;}
.pomo-task-item{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--s1);border:1.5px solid var(--b1);border-radius:14px;cursor:pointer;transition:all .15s;margin-bottom:6px;}
.pomo-task-item:hover,.pomo-task-item.on{border-color:${accent}55;background:${accent}0e;}
.pomo-task-name{flex:1;font-size:13px;font-weight:600;}
.pomo-stats-row{display:flex;gap:8px;width:100%;max-width:420px;}
.pomo-stat{flex:1;background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:14px 10px;text-align:center;}
.pomo-stat-val{font-family:'Instrument Serif',serif;font-size:28px;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.pomo-stat-lbl{font-size:10.5px;color:var(--t3);margin-top:2px;}

/* == COLLAB == */
.collab-page{padding:20px 18px 90px;}
.collab-section{background:var(--s1);border:1px solid var(--b1);border-radius:22px;overflow:hidden;margin-bottom:14px;box-shadow:0 4px 18px rgba(0,0,0,.06);}
.collab-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--b1);}
.collab-row:last-child{border-bottom:none;}
.collab-avatar{width:40px;height:40px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;background:${accent}16;}
.collab-name{font-size:13.5px;font-weight:700;}
.collab-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.share-link-box{background:var(--s2);border:1.5px solid var(--b1);border-radius:13px;padding:12px 14px;font-size:12px;color:var(--t2);font-family:monospace;word-break:break-all;display:flex;align-items:center;gap:8px;cursor:pointer;transition:all .2s;}
.share-link-box:hover{border-color:${accent}60;background:${accent}08;}
.shared-task{background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:12px 14px;margin-bottom:7px;display:flex;align-items:center;gap:10px;}
.shared-badge{font-size:10px;padding:3px 9px;border-radius:20px;font-weight:800;background:rgba(107,203,119,.15);color:var(--green);border:1px solid rgba(107,203,119,.28);}

/* == RESPONSIVE == */
@media(max-width:920px){
  .sidebar,.chat-panel{display:none!important;}
  /* Hide hamburger on mobile - not needed */
  .menu-btn{display:none!important;}
  /* Show Taskflow logo on mobile */
  .mobile-logo{display:flex!important;}
  .bot-nav{display:block!important;}
  .add-btn{display:none!important;}
  .search-wrap{max-width:none!important;}
  .content{padding:14px 14px 105px!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;}
  .t-act{opacity:1!important;}
  .task-grid{grid-template-columns:repeat(2,1fr)!important;}
  /* Chat panel on mobile: account for bottom nav */
  .chat-msgs{padding-bottom:100px!important;}
  .chat-inp{padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))!important;}
  /* Topbar smaller on mobile */
  .topbar{padding:8px 12px!important;padding-top:max(8px,calc(8px + env(safe-area-inset-top)))!important;}
  .topbar-title{display:none!important;}
  /* Make topbar buttons smaller */
  .tb-btn{height:32px!important;padding:0 8px!important;font-size:11px!important;}
  /* Mobile: show only the 3 mobile buttons, hide desktop ones */
  .desktop-only-btn{display:none!important;}
  .mobile-only-btn{display:inline-flex!important;}
  /* CRITICAL: Modal must sit above bottom nav (64px) + safe area */
  .overlay{align-items:flex-end;padding-bottom:64px!important;}
  .modal{max-height:calc(88vh - 64px - env(safe-area-inset-bottom,0px))!important;border-radius:28px 28px 0 0!important;}
  .modal .m-foot{padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))!important;}
  .modal.center{max-height:85vh!important;border-radius:24px!important;}
}
.bot-nav.hide-bot{transform:translateY(100%);}

/* Desktop: hide mobile-specific buttons */
@media(min-width:921px){
  .mobile-only-btn{display:none!important;}
  .desktop-only-btn{display:inline-flex!important;}
  .bot-nav{display:none!important;}
  .menu-btn{display:none!important;}
}
@media(max-width:440px){
  .row2{grid-template-columns:1fr!important;}
  .task-grid{grid-template-columns:1fr!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;}
  .prof-grid{grid-template-columns:1fr!important;}
  .pin-key{width:68px;height:68px;font-size:23px;}
}

/* == GAMIFICATION == */
.xp-float{position:fixed;top:76px;right:16px;background:linear-gradient(135deg,${accent},${accent2});color:#fff;font-weight:800;font-size:15px;padding:9px 18px;border-radius:22px;box-shadow:0 6px 26px ${accent}65;z-index:9999;animation:xpPop .4s cubic-bezier(.34,1.56,.64,1),xpFade 1.6s ease .5s forwards;pointer-events:none;}
@keyframes xpPop{0%{transform:scale(.4) translateY(12px);opacity:0}60%{transform:scale(1.18) translateY(0);opacity:1}100%{transform:scale(1);opacity:1}}
@keyframes xpFade{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-34px)}}
.badge-popup{position:fixed;bottom:110px;left:50%;transform:translateX(-50%);background:${dark ? "rgba(8,10,20,0.97)" : "rgba(255,255,255,0.98)"};border:2px solid ${accent}65;border-radius:22px;padding:16px 22px;box-shadow:0 12px 44px rgba(0,0,0,.45),0 0 32px ${accent}32;z-index:9999;animation:badgePop .5s cubic-bezier(.34,1.56,.64,1);display:flex;align-items:center;gap:14px;min-width:290px;}
@keyframes badgePop{0%{transform:translateX(-50%) translateY(50px) scale(.8);opacity:0}100%{transform:translateX(-50%) translateY(0) scale(1);opacity:1}}
.level-bar-wrap{height:5px;background:var(--s3);border-radius:3px;overflow:hidden;}
.level-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,${accent},${accent2});transition:width .7s cubic-bezier(.34,1.56,.64,1);box-shadow:0 0 7px ${accent}65;}
.suggest-card{background:var(--s1);border:1.5px solid var(--b1);border-radius:18px;padding:14px 16px;margin-bottom:10px;display:flex;gap:12px;align-items:flex-start;transition:all .22s;}
.suggest-card:hover{border-color:${accent}55;transform:translateX(3px);box-shadow:0 5px 20px ${accent}18;}
.qa-parsed{background:var(--s2);border:1px solid var(--b1);border-radius:14px;padding:12px 14px;margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;}
.qa-chip{font-size:11px;padding:4px 11px;border-radius:20px;font-weight:800;background:${accent}18;color:${accent};border:1px solid ${accent}35;}

/* == NOTES == */
.note-actions{opacity:0;transition:opacity .2s;}
div:hover>.note-actions{opacity:1!important;}

/* == ANIMATIONS == */
@keyframes twinkle{0%,100%{opacity:.1;transform:scale(1)}50%{opacity:.95;transform:scale(1.6)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes starRiseUp{0%{transform:translateY(180px) scale(0.2);opacity:0;filter:blur(20px)}40%{opacity:1;filter:blur(0)}70%{transform:translateY(-18px) scale(1.08)}85%{transform:translateY(6px) scale(0.97)}100%{transform:translateY(0) scale(1);opacity:1}}
@keyframes starBurst{0%{box-shadow:0 0 0px transparent,0 0 0px transparent}60%{box-shadow:0 0 0px transparent}70%{box-shadow:0 0 80px #fff8,0 0 160px #fff5,0 0 260px #fff2,0 0 400px ${accent}60,0 0 600px ${accent}30}85%{box-shadow:0 0 50px ${accent}90,0 0 100px ${accent}60,0 0 200px ${accent}35,0 0 350px ${accent}20}100%{box-shadow:0 0 60px ${accent}80,0 0 120px ${accent}40,0 0 200px ${accent}20,inset 0 0 30px rgba(255,255,255,0.3)}}
@keyframes raysReveal{0%,55%{opacity:0;transform:scaleX(0)}80%{opacity:.9;transform:scaleX(1.2)}100%{opacity:.7;transform:scaleX(1)}}
@keyframes titleRise{0%,40%{opacity:0;transform:translateY(24px)}70%{opacity:1;transform:translateY(-4px)}100%{opacity:1;transform:translateY(0)}}
@keyframes cardFadeUp{0%,65%{opacity:0;transform:translateY(30px)}90%{opacity:1;transform:translateY(-3px)}100%{opacity:1;transform:translateY(0)}}
@keyframes ringSpinIn{0%{opacity:0;transform:scale(0.3) rotate(-180deg)}50%{opacity:.4}100%{opacity:.6;transform:scale(1) rotate(0deg)}}
@keyframes starGlowPulse{0%,100%{box-shadow:0 0 60px ${accent}80,0 0 120px ${accent}40,0 0 200px ${accent}20,inset 0 0 30px rgba(255,255,255,0.3)}50%{box-shadow:0 0 80px ${accent}cc,0 0 160px ${accent}70,0 0 280px ${accent}40,0 0 500px ${accent}15,inset 0 0 40px rgba(255,255,255,0.5)}}
@keyframes taskSlideIn{
  from{opacity:0;transform:translateY(12px) scale(0.97);}
  to{opacity:1;transform:translateY(0) scale(1);}
}
@keyframes taskFadeOut{
  from{opacity:1;transform:translateX(0) scale(1);}
  to{opacity:0;transform:translateX(60px) scale(0.95);}
}
@keyframes taskComplete{
  0%{transform:scale(1);}
  40%{transform:scale(1.04);}
  100%{transform:scale(1);}
}
@keyframes slideInRight{
  from{opacity:0;transform:translateX(-20px);}
  to{opacity:1;transform:translateX(0);}
}
@keyframes bounceIn{
  0%{transform:scale(0.5);opacity:0;}
  60%{transform:scale(1.1);}
  100%{transform:scale(1);opacity:1;}
}
@keyframes shimmerSweep{
  0%{background-position:-200% 0;}
  100%{background-position:200% 0;}
}
.widget-bar{
  position:fixed;bottom:0;left:0;right:0;
  background:var(--s1);border-top:1px solid var(--b1);
  padding:8px 16px;z-index:50;
  display:none;
}
@media(display-mode:standalone){.widget-bar{display:block;}}

/* ── Theme transition overlay ── */
.theme-flash{
  position:fixed;inset:0;z-index:9998;pointer-events:none;
  background:var(--bg);opacity:0;
  transition:opacity .3s ease;
}
.theme-flash.active{opacity:1;}

/* ── Voice recording pulse ── */
@keyframes voicePulse{
  0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(255,107,107,.4);}
  50%{transform:scale(1.08);box-shadow:0 0 0 12px rgba(255,107,107,0);}
}
.voice-btn-active{animation:voicePulse .8s ease-in-out infinite!important;}

/* ── Eisenhower Matrix ── */
.matrix-quad{
  border-radius:16px;padding:12px;
  border:1.5px solid var(--b1);
  min-height:140px;overflow-y:auto;
  transition:border-color .2s,background .2s;
}
.matrix-quad:hover{border-color:var(--acc);}
.matrix-task{
  font-size:11.5px;padding:5px 8px;border-radius:8px;
  background:var(--s2);margin-bottom:5px;cursor:grab;
  border:1px solid transparent;transition:all .15s;
  display:flex;align-items:center;gap:6px;
}
.matrix-task:hover{border-color:var(--acc);transform:translateY(-1px);}

/* ── Streak milestone popup ── */
@keyframes milestoneIn{
  0%{transform:scale(.5) translateY(40px);opacity:0;}
  60%{transform:scale(1.1) translateY(-5px);}
  100%{transform:scale(1) translateY(0);opacity:1;}
}
.milestone-popup{
  position:fixed;bottom:90px;left:50%;transform:translateX(-50%);
  background:linear-gradient(135deg,#ffd93d,#ff9f43);
  border-radius:20px;padding:16px 24px;z-index:8000;
  text-align:center;box-shadow:0 12px 40px rgba(255,217,61,.4);
  animation:milestoneIn .5s cubic-bezier(.34,1.56,.64,1) both;
  pointer-events:none;
}

/* ── Task dependency badge ── */
.dep-badge{
  font-size:9px;padding:2px 6px;border-radius:20px;
  background:rgba(255,107,107,.15);color:#ff6b6b;
  border:1px solid rgba(255,107,107,.3);font-weight:700;
}

/* ── Time estimate badge ── */
.est-badge{
  font-size:9px;padding:2px 6px;border-radius:20px;
  background:rgba(72,219,251,.12);color:#48dbfb;
  border:1px solid rgba(72,219,251,.25);font-weight:700;
}

/* ── LIBI avatar glow ── */
/* ── PWA Install Banner ── */
.install-banner{
  position:fixed;bottom:72px;left:12px;right:12px;z-index:4000;
  background:linear-gradient(135deg,rgba(10,8,24,0.97),rgba(18,14,38,0.97));
  border:1.5px solid var(--acc);border-radius:20px;
  padding:16px 18px;
  display:flex;align-items:center;gap:14px;
  box-shadow:0 12px 48px rgba(124,109,250,0.35),0 0 0 1px rgba(124,109,250,0.1);
  backdrop-filter:blur(20px);
  animation:slideUpBanner .4s cubic-bezier(.34,1.56,.64,1) both;
  max-width:480px;margin:0 auto;
}
@media(min-width:600px){
  .install-banner{bottom:20px;left:50%;right:auto;transform:translateX(-50%);width:420px;}
}
@keyframes slideUpBanner{
  from{opacity:0;transform:translateY(24px);}
  to{opacity:1;transform:translateY(0);}
}
.install-banner-icon{
  width:48px;height:48px;border-radius:14px;flex-shrink:0;
  background:linear-gradient(135deg,var(--acc),var(--acc2));
  display:flex;align-items:center;justify-content:center;
  font-size:24px;
  box-shadow:0 4px 14px rgba(124,109,250,0.4);
}
.install-banner-text{flex:1;}
.install-banner-title{font-size:14px;font-weight:800;color:var(--t1);margin-bottom:2px;}
.install-banner-sub{font-size:11.5px;color:var(--t3);}
.install-banner-btn{
  height:38px;padding:0 16px;border-radius:11px;
  background:linear-gradient(135deg,var(--acc),var(--acc2));
  color:#fff;border:none;cursor:pointer;font-size:12px;font-weight:700;
  flex-shrink:0;white-space:nowrap;
  box-shadow:0 4px 12px rgba(124,109,250,0.4);
  font-family:inherit;
}
.install-banner-close{
  width:26px;height:26px;border-radius:8px;background:var(--s3);border:none;
  color:var(--t3);cursor:pointer;font-size:14px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-family:inherit;
}
@keyframes libiPulse{
  0%,100%{box-shadow:0 0 0 0 rgba(124,109,250,.5);}
  50%{box-shadow:0 0 0 8px rgba(124,109,250,0);}
}
@keyframes sunriseShift{
  0%{opacity:0;transform:translateY(10px);}
  100%{opacity:1;transform:translateY(0);}
}
@keyframes timeGlow{
  0%,100%{opacity:.6;}
  50%{opacity:1;}
}
@keyframes galaxyPulse{0%,100%{box-shadow:0 0 18px ${accent}45,0 5px 14px ${accent}32}50%{box-shadow:0 0 32px ${accent}75,0 0 55px ${accent}28}}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(255,107,107,.45)}50%{box-shadow:0 0 0 9px rgba(255,107,107,0)}}
@keyframes soundbar0{0%,100%{height:3px}50%{height:10px}}
@keyframes soundbar1{0%,100%{height:5px}50%{height:14px}}
@keyframes soundbar2{0%,100%{height:4px}50%{height:8px}}
@keyframes soundbar3{0%,100%{height:7px}50%{height:16px}}
@keyframes soundbar4{0%,100%{height:4px}50%{height:11px}}

/* Forest greeting card extras */
@keyframes sway{0%,100%{transform:rotate(-2deg) scaleY(1)}50%{transform:rotate(2deg) scaleY(1.02)}}
@keyframes leafFloat{0%{transform:translateY(0) rotate(0deg);opacity:.8}100%{transform:translateY(-120px) rotate(360deg);opacity:0}}
.forest-tree{position:absolute;bottom:0;opacity:.12;animation:sway 4s ease-in-out infinite;}

@keyframes slideUp{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}
.task-swipe-wrap{position:relative;overflow:hidden;border-radius:18px;margin-bottom:10px;}
.task-swipe-bg-r{position:absolute;inset:0;background:linear-gradient(90deg,#6bcb77,#22c55e);display:flex;align-items:center;padding-left:20px;border-radius:18px;}
.task-swipe-bg-l{position:absolute;inset:0;background:linear-gradient(90deg,#ff6b6b,#ff4757);display:flex;align-items:center;justify-content:flex-end;padding-right:20px;border-radius:18px;}
.task-swipe-inner{position:relative;transition:transform .18s cubic-bezier(.4,0,.2,1);touch-action:pan-y;background:var(--s1);border-radius:18px;}

@keyframes confettiFall{0%{transform:translateY(0) rotate(0deg);opacity:1}100%{transform:translateY(110vh) rotate(720deg);opacity:0}}

.skeleton{background:linear-gradient(90deg,var(--s2) 25%,var(--s3) 50%,var(--s2) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;border-radius:10px;}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.page-fade{animation:pageFadeIn .32s cubic-bezier(.25,.46,.45,.94) both;}
@keyframes pageFadeIn{from{opacity:0;transform:translateY(14px) scale(.995)}to{opacity:1;transform:translateY(0) scale(1)}}

/* == Stagger animation for list items == */
@keyframes staggerIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}

/* == Smooth hover lift for cards == */
@keyframes subtlePulse{0%,100%{transform:scale(1)}50%{transform:scale(1.005)}}

/* == Enhanced glow effect == */
@keyframes glowPulse{0%,100%{box-shadow:0 0 8px ${accent}20}50%{box-shadow:0 0 20px ${accent}40}}

/* == Microsoft Store / PWA Desktop Optimizations == */
@media (display-mode: window-controls-overlay) {
  .topbar { padding-top: calc(env(titlebar-area-height, 32px) + 8px) !important; }
  .shell { padding-top: env(titlebar-area-height, 0px); }
  body { -webkit-app-region: no-drag; }
  .topbar-drag { -webkit-app-region: drag; app-region: drag; }
}
/* Smooth scrolling everywhere */
* { scroll-behavior: smooth; }
/* Better focus rings for keyboard nav (accessibility) */
button:focus-visible, input:focus-visible, textarea:focus-visible {
  outline: 2px solid var(--acc); outline-offset: 2px;
}
/* Windows-style scrollbar */
::-webkit-scrollbar { width: 7px; height: 7px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 4px; transition: background .2s; }
::-webkit-scrollbar-thumb:hover { background: var(--acc); }
/* Prevent text selection on UI elements */
.nav-item, .tb-btn, .bot-item, .fab, .btn-s, .btn-c, .add-btn { user-select: none; -webkit-user-select: none; }
/* Windows snap layout hint */
.shell { min-width: 0; }
/* == Global interactive transitions == */
button, [role="button"], .nav-item, .bot-item, .settings-row, .cal-cell, .cal-nav { cursor: pointer; transition: transform .15s ease, box-shadow .2s ease, opacity .15s ease, background .2s ease; }
button:active, [role="button"]:active { transform: scale(.96); }
/* Smooth transitions on all interactive cards */
.task, .chart-card, .settings-section { transition: transform .2s ease, box-shadow .25s ease, border-color .2s ease; }
.task:hover, .chart-card:hover { transform: translateY(-1px); box-shadow: 0 6px 24px rgba(0,0,0,.12); }
/* Enhanced sidebar nav item transitions */
.nav-item { transition: all .18s ease; position: relative; overflow: hidden; }
.nav-item::after { content: ''; position: absolute; inset: 0; background: ${accent}; opacity: 0; border-radius: inherit; transition: opacity .2s ease; pointer-events: none; }
.nav-item:hover::after { opacity: .04; }
.nav-item.on::after { opacity: .08; }
/* Bottom nav smooth transitions */
.bot-item { transition: all .2s cubic-bezier(.4,0,.2,1); }
.bot-item.on .bot-icon { transform: scale(1.1); }
.bot-icon { transition: transform .25s cubic-bezier(.34,1.56,.64,1); }

/* == MOBILE OPTIMIZATIONS == */
@media(max-width:768px){
  .bot-item{min-height:52px;}
  .task{box-shadow:0 2px 10px rgba(0,0,0,.2);}
  .content{padding:10px 4px 90px!important;}
  .chat-ta{font-size:16px!important;}
  .search-wrap input{font-size:16px!important;}
  .fab{width:60px!important;height:60px!important;}
  .settings-row{min-height:52px;}
  .qbtn{min-height:36px!important;}
  .stats-row{gap:6px!important;}
  .stat{border-radius:14px!important;padding:12px 10px 10px!important;}
  .prog-card{padding:14px 12px!important;border-radius:18px!important;}
  .task{border-radius:14px!important;margin-bottom:8px!important;}
  html,body{overflow:hidden;width:100%;padding:0;margin:0;}
}
/* == LIBI TYPING DOTS == */
@keyframes typingBounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-6px);opacity:1;}}
.typing-dot{width:7px;height:7px;border-radius:50%;background:${accent};animation:typingBounce 1.2s ease-in-out infinite;display:inline-block;margin:0 2px;}
.typing-dot:nth-child(2){animation-delay:.2s;}
.typing-dot:nth-child(3){animation-delay:.4s;}

/* == PRIVACY MODAL == */
.privacy-modal-overlay{
  position:fixed;inset:0;z-index:9990;
  background:rgba(0,0,0,0.75);
  backdrop-filter:blur(8px);
  display:flex;align-items:flex-end;justify-content:center;
  animation:fadeIn .2s ease;
}
@media(min-width:600px){
  .privacy-modal-overlay{ align-items:center; }
}
.privacy-modal{
  background:var(--s1);
  border:1px solid var(--b1);
  border-radius:24px 24px 0 0;
  width:100%;max-width:680px;
  max-height:90vh;
  display:flex;flex-direction:column;
  overflow:hidden;
  box-shadow:0 -8px 40px rgba(0,0,0,0.4);
}
@media(min-width:600px){
  .privacy-modal{ border-radius:24px; max-height:85vh; }
}
.privacy-body{
  flex:1;overflow-y:auto;
  padding:20px 24px 40px;
  color:var(--t1) !important;
  overscroll-behavior:contain;
  -webkit-overflow-scrolling:touch;
}
.privacy-body h2{
  font-size:18px;font-weight:800;
  color:var(--t1) !important;
  margin:16px 0 8px;
}
.privacy-body h3{
  font-size:14px;font-weight:700;
  color:var(--t1) !important;
  margin:14px 0 6px;
}
.privacy-body p{
  font-size:13.5px;line-height:1.8;
  color:var(--t2) !important;
  margin-bottom:10px;
}
.privacy-body ul,.privacy-body ol{
  padding-left:20px;
  color:var(--t2) !important;
  font-size:13.5px;line-height:2;
}
.privacy-body li{ margin-bottom:4px; }
.privacy-body a{
  color:var(--acc);
  text-decoration:underline;
}
.privacy-body strong{
  color:var(--t1) !important;
  font-weight:700;
}

`);
}


// == Smart Bot =====================================

// =====================================================================
//  🧠 LIBI BRAIN v3.0 — Full Reasoning Engine (No API Required)
//  Built-in intelligence with deep context, multi-domain knowledge,
//  adaptive personality, and true conversation understanding.
// =====================================================================
function libiBot(input, tasks, cats, t, userName = "friend", memory = {}) {
  const raw = input.trim();
  const msg = raw.toLowerCase();
  const name = memory.name || (userName && userName !== "friend" && userName !== "" ? userName : null);
  const hi = name ? `, ${name}` : "";
  const occupation = memory.occupation || "";
  const wakeTime = memory.wakeTime || "";
  const memFacts = memory.facts || [];

  // == Role-based personalisation ==
  const isStudent = occupation.toLowerCase().includes("student") || memFacts.some(f => /student/i.test(f));
  const isDev = occupation.toLowerCase().includes("develop") || memFacts.some(f => /develop|code|program/i.test(f));
  const isDesigner = occupation.toLowerCase().includes("design") || memFacts.some(f => /design/i.test(f));
  const isManager = occupation.toLowerCase().includes("manager") || memFacts.some(f => /manag|lead|boss/i.test(f));
  const isFreelance = occupation.toLowerCase().includes("freelanc") || memFacts.some(f => /freelanc/i.test(f));
  const taskWord = isStudent ? "assignment" : "task";
  const taskWords = isStudent ? "assignments" : "tasks";

  // == Live task intelligence ==
  const active = tasks.filter(x => !x.done);
  const done = tasks.filter(x => x.done);
  const overdue = active.filter(x => x.due && new Date(x.due) < new Date());
  const high = active.filter(x => x.priority === "high");
  const med = active.filter(x => x.priority === "medium");
  const low = active.filter(x => x.priority === "low");
  const today = active.filter(x => x.due === todayStr());
  const starred = active.filter(x => x.starred);
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const topTask = overdue[0] || high[0] || today[0] || starred[0] || active[0];
  const recentDone = done.filter(x => x.createdAt && (Date.now() - x.createdAt) < 7 * 24 * 60 * 60 * 1000);
  const totalTasks = tasks.length;
  const hasGoodStreak = recentDone.length >= 3;
  const isNew = totalTasks < 3;

  // == Smart context extraction from [CONTEXT: ...] tag ==
  const ctxMatch = raw.match(/\[CONTEXT:\s*(.*?)\]/s);
  const ctxHint = ctxMatch ? ctxMatch[1].toLowerCase() : "";
  const cleanMsg = msg.replace(/\[CONTEXT:.*?\]/s, "").trim();

  // == Time-of-day awareness ==
  const h = new Date().getHours();
  const timeOfDay = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  const timeEmoji = h < 5 ? "🌙" : h < 12 ? "🌅" : h < 17 ? "☀️" : h < 21 ? "🌆" : "🌙";

  // == Utility: pick from array based on time/date for variety ==
  const pick = (arr) => arr[new Date().getMinutes() % arr.length];

  // =========================================================
  // 1. GREETINGS — time-aware, personalised, task-aware
  // =========================================================
  if (/^(hi+|hey+|hello+|hii+|helo|howdy|sup|yo+|salaam|namaste|vanakkam|greetings|what'?s up|waddup|hola|bonjour|good (morning|evening|afternoon|day|night)|morning|evening|afternoon)/i.test(raw)) {
    const timeGreet = h < 5 ? "🌙 Up late?" : h < 12 ? "🌅 Good morning" : h < 17 ? "☀️ Good afternoon" : h < 21 ? "🌆 Good evening" : "🌙 Good night";
    const urgentNote = overdue.length
      ? `\n\n⚠️ Quick heads-up — you have **${overdue.length} overdue ${overdue.length > 1 ? "tasks" : "task"}**. Want me to help you tackle them?`
      : pct >= 80 && done.length > 0
        ? `\n\n🔥 You're crushing it — **${pct}% completion rate**. Keep that momentum!`
        : done.length > 0 ? `\n\n✅ **${done.length} task${done.length > 1 ? "s" : ""} done** so far. Solid work.` : "";
    const occupationNote = occupation ? ` As a ${occupation}, I know your time matters.` : "";
    return `${timeGreet}${hi}! I'm **LIBI** ✦ — your personal AI inside Taskflow.${occupationNote}\n\n📊 Your snapshot:\n• ${active.length} active ${taskWords}\n• ${done.length} completed\n• ${overdue.length} overdue\n• ${pct}% completion rate${urgentNote}\n\nWhat do you need? Try: _"Plan my day"_, _"What's most urgent?"_, _"Motivate me"_, or just ask me anything. ✨`;
  }

  // =========================================================
  // 2. WHO ARE YOU / CAPABILITIES / SELF-IDENTITY
  // =========================================================
  if (/(who are you|what are you|what can you do|your (name|capabilities|features)|tell me about yourself|are you (ai|chatgpt|gpt|claude|gemini|real|human|a bot|an ai)|how (do you|does libi) work|are you smart|are you intelligent|libi v4|what version)/i.test(cleanMsg)) {
    return `I'm **LIBI V4** ✦ — the most advanced version of your personal AI productivity assistant, built for Taskflow.\n\n**🆕 What's new in V4:**\n• 🧠 **Deeper reasoning** — I understand context better, give smarter plans\n• ☁️ **Cloud sync awareness** — I know your data syncs across devices\n• 📵 **Social media coaching** — I can help you reduce screen time\n• 👫 **Team intelligence** — I understand your collaboration rooms\n• 🌟 **Richer personality** — warmer, more nuanced, less robotic\n• ⚡ **Faster task parsing** — I understand natural language even better\n\n**💡 My full capabilities:**\n• 📋 **Task intelligence** — I know your priorities, deadlines, patterns\n• 📅 **Day planning** — I build real time-blocked schedules from your tasks\n• 🧠 **Deep knowledge** — productivity, focus, habits, health, science, career, finance, coding, and more\n• 💬 **True conversation** — I remember what you tell me\n• ⚡ **Task creation** — just say "remind me to..." and I'll add it\n• 🎯 **Smart prioritisation** — I tell you what to do first, and why\n• 💪 **Coaching** — motivation, stress relief, mental health support\n\n**🔒 Privacy first:** Your data stays on your device (or your Google account if you sync).\n\nI'm not ChatGPT or Gemini. I'm LIBI — purpose-built for your productivity. What do you need? ✦`;
  }

  // =========================================================
  // 3. WHAT SHOULD I DO FIRST — AI-ranked priority reasoning
  // =========================================================
  if (/(what (should|do) i (do|start|work on|tackle|focus on|begin|attack|prioriti)|^(first|start|begin)|most important|urgent|which task|where do i start|top task|highest priority|what'?s next|what now|what's first|most urgent|critical task)/i.test(cleanMsg)) {
    if (active.length === 0) return `🎉 Clear slate${hi}! No active ${taskWords} right now. Take a breath — then add something meaningful with the + button, or open the Goals tab and plan your next big move.`;

    // Score all tasks
    const scored = active.map(tk => {
      let score = 0;
      if (tk.priority === "high") score += 40;
      if (tk.priority === "medium") score += 20;
      if (tk.due) {
        const days = Math.ceil((new Date(tk.due) - new Date()) / 86400000);
        if (days < 0) score += 55;
        else if (days === 0) score += 35;
        else if (days <= 2) score += 25;
        else if (days <= 7) score += 12;
      }
      if (tk.starred) score += 10;
      if (tk.subtasks?.some(s => s.done)) score += 8; // already started
      return { ...tk, score };
    }).sort((a, b) => b.score - a.score);

    const top = scored[0];
    const reason = top.due && new Date(top.due) < new Date()
      ? `it's **overdue** (was due ${top.due})`
      : top.priority === "high"
        ? `it's your **highest priority**`
        : top.starred
          ? `you **starred** it — trust your past self`
          : `it has the **highest urgency score** of all your tasks`;

    const others = scored.slice(1, 3).map((tk, i) => `${i + 2}. "${tk.title}"${tk.due ? ` (due ${tk.due})` : ""}`).join("\n");

    return `🎯 **Start with this${hi}:**\n\n**"${top.title}"** — because ${reason}.\n\n${others ? `**Then:**\n${others}\n\n` : ""}💡 Don't think about finishing it. Commit to **25 focused minutes** — open the Focus tab and start a Pomodoro. Momentum is everything.\n\nWant me to break "${top.title}" into smaller steps?`;
  }

  // =========================================================
  // 4. PLAN MY DAY — intelligent, personalised time-blocking
  // =========================================================
  if (/(plan (my |the )?day|daily plan|schedule (my |the )?day|(what'?s|what is) (my |the )?plan|organise|organize|time.?block|structure my day|what should i do today|today.?s schedule)/i.test(cleanMsg)) {
    if (active.length === 0) return `✨ Your ${taskWord} list is clear${hi}! Today is yours. Rest, plan something new, explore the Goals tab, or start a habit you've been putting off.`;

    const startHour = wakeTime ? parseInt(wakeTime) || 8 : 8;
    const blocks = [];

    if (overdue.length) blocks.push(`🚨 **${startHour}:00 – ${startHour}:30** | Overdue rescue:\n${overdue.slice(0, 2).map(x => `  • ${x.title} (was due ${x.due})`).join("\n")}`);
    if (high.length) blocks.push(`🔴 **${overdue.length ? startHour + 1 : startHour}:00 – ${overdue.length ? startHour + 3 : startHour + 2}:00** | Deep work (high priority):\n${high.slice(0, 3).map(x => `  • ${x.title}${x.due ? ` → due ${x.due}` : ""}`).join("\n")}`);
    if (today.length) blocks.push(`📅 **11:00 – 12:00** | Due today:\n${today.slice(0, 2).map(x => `  • ${x.title}`).join("\n")}`);
    blocks.push(`🍽️ **12:00 – 13:00** | Lunch + real break (step away from the screen)`);
    if (med.length) blocks.push(`🟡 **14:00 – 16:00** | Medium priority (${timeOfDay === "afternoon" ? "you're in the afternoon energy dip — use Pomodoro blocks" : "steady focus"}):\n${med.slice(0, 3).map(x => `  • ${x.title}`).join("\n")}`);
    if (low.length) blocks.push(`🟢 **16:00 – 17:00** | Admin / low priority:\n${low.slice(0, 2).map(x => `  • ${x.title}`).join("\n")}`);
    blocks.push(`📝 **17:00 – 17:10** | Daily review — tick off done tasks, reschedule anything undone`);

    const occupationTip = isStudent
      ? "\n💡 **Student tip:** Study in 25-min Pomodoros with 5-min breaks — scientifically proven to improve retention."
      : isDev
        ? "\n💡 **Dev tip:** Put deep coding sessions in the morning — that's when your brain handles complex logic best."
        : isManager
          ? "\n💡 **Manager tip:** Guard 2+ hours of uninterrupted time in the morning for strategic thinking."
          : "";

    return `📋 **Your Day Plan${hi}:**\n\n${blocks.join("\n\n")}${occupationTip}\n\n⏱ Use the **Focus tab** → Pomodoro timer to stay locked in. The Daily Planner tab also shows this visually!`;
  }

  // =========================================================
  // 5. PROGRESS / STATUS / HOW AM I DOING
  // =========================================================
  if (/(how am i (doing|going|performing)|my (progress|stats|score|performance|status|numbers)|report|check.?in|am i on track|how.?s it going|show me my stats|my overview|dashboard)/i.test(cleanMsg)) {
    const verdict = pct >= 90 ? "🏆 **Exceptional.** You're in the top tier of productivity." :
      pct >= 75 ? "🔥 **You're absolutely crushing it!**" :
        pct >= 60 ? "💪 **Solid progress.** You're clearly building momentum." :
          pct >= 40 ? "📈 **Getting there.** The hard part is showing up — and you are." :
            pct >= 20 ? "🚀 **Early days.** Every big journey starts exactly here." :
              "✨ **Time to get rolling!** One completed task changes everything.";

    const catBreakdown = cats?.length > 0
      ? "\n\n📂 **By category:**\n" + cats.map(c => {
        const catTasks = tasks.filter(tk => tk.categoryId === c.id);
        const catDone = catTasks.filter(tk => tk.done).length;
        return catTasks.length > 0 ? `  ${c.icon} ${c.name}: ${catDone}/${catTasks.length} done` : null;
      }).filter(Boolean).join("\n")
      : "";

    const insight = overdue.length > 0
      ? `\n\n⚠️ **Attention needed:** ${overdue.length} overdue ${taskWords}. Clear these first — they silently drain mental energy even when you're not working on them.`
      : hasGoodStreak
        ? `\n\n🔥 **Streak alert:** You've completed ${recentDone.length} ${taskWords} this week. That's real momentum — protect it!`
        : "";

    return `${verdict}\n\n📊 **Your stats${hi}:**\n• ✅ ${pct}% completion rate\n• ✔️ ${done.length} ${taskWords} completed\n• ⏳ ${active.length} still active\n• ⚠️ ${overdue.length} overdue\n• 🔴 ${high.length} high priority\n• 🟡 ${med.length} medium\n• 🟢 ${low.length} low${catBreakdown}${insight}`;
  }

  // =========================================================
  // 6. MOTIVATION / LAZINESS / PROCRASTINATION
  // =========================================================
  if (/(motivat|inspire|encourage|pump (me )?up|i (can'?t|don'?t want to|feel like|have no) (do|work|start|focus|motivat)|push me|hype me|i'?m (lazy|stuck|procrastinat|not feeling it)|give me (energy|a push)|pep talk|can.t get started|keep putting it off)/i.test(cleanMsg)) {
    const quotes = [
      `"The secret of getting ahead is getting started." — Mark Twain`,
      `"Motivation follows action — not the other way around."`,
      `"You don't have to be great to start, but you have to start to be great." — Zig Ziglar`,
      `"Done is better than perfect."`,
      `"Discipline is choosing what you want most over what you want right now."`,
      `"Small steps every day. That's how mountains are moved."`,
      `"The best time to start was yesterday. The next best time is now."`,
      `"Action is the antidote to despair." — Joan Baez`,
      `"It always seems impossible until it's done." — Nelson Mandela`,
      `"You are not lazy. You are overwhelmed. There's a difference."`,
    ];
    const q = pick(quotes);
    const taskPush = topTask
      ? `\n\n🎯 **One task. Right now:** "${topTask.title}"\n\nDon't think about finishing it. Just commit to **5 minutes**. That's it. Open it, start typing, start doing. The resistance disappears the moment you begin.`
      : "";
    const procrastinationFact = `\n\n🧠 **Science says:** The anticipation of a task is almost always worse than the task itself. The brain generates resistance as a protection mechanism — it's not a signal to stop, it's a signal that this task *matters*.\n\nYou've already completed **${done.length} ${taskWords}**. You clearly have what it takes.`;
    return `⚡ **Let's go${hi}!**\n\n${q}${taskPush}${procrastinationFact}`;
  }

  // =========================================================
  // 7. STRESS / OVERWHELM / BURNOUT
  // =========================================================
  if (/(stress|overwhelm|anxious|anxiety|too much|can'?t cope|burned? out|exhausted|drowning|falling behind|behind on|panic|losing it|can'?t handle|mental load|so much to do|buried in)/i.test(cleanMsg)) {
    const taskLoad = active.length > 10
      ? `\n\n📋 You have ${active.length} active ${taskWords} — that IS a lot. Let me help: **"Plan my day"** will break it into manageable blocks.`
      : overdue.length > 0
        ? `\n\n⚠️ You have ${overdue.length} overdue ${taskWords} — but they'll still be there after you reset. Your brain needs oxygen first.`
        : "";
    return `💙 I hear you${hi}. What you're feeling is real — and it makes sense.\n\n**Right now, do this:**\n1. 🛑 **Stop** — seriously, just pause for 10 seconds\n2. 😮‍💨 **Breathe** — 4 counts in, hold 4, out for 6 (×3)\n3. 📝 **Brain dump** — open Notes and write *everything* on your mind. Get it out of your head.\n4. 🎯 **Pick ONE tiny thing** — not the scariest, the smallest\n5. 🚶 **After finishing that one thing** — take a 5-minute walk${taskLoad}\n\n💡 **The LIBI truth:** Overwhelm happens when you try to hold 20 things in your head at once. The moment you write them all down, your brain relaxes. The list doesn't get shorter — but your fear of it does.\n\nWhat's the ONE thing weighing on you most right now?`;
  }

  // =========================================================
  // 8. MENTAL HEALTH / NOT OKAY / STRUGGLING
  // =========================================================
  if (/(mental health|not okay|not ok|struggling|feeling (bad|low|down|awful|terrible|hopeless|empty)|hard (time|day|week)|depress|sad|lonely|don'?t know what to do|feel(ing)? (lost|broken|numb))/i.test(cleanMsg)) {
    return `💙 Hey${hi}. Thank you for saying that. Really.\n\n**First — you don't have to be productive right now.** Your worth isn't your output.\n\n**Things that genuinely help (backed by research):**\n• 🚶 **Move your body** — even a 5-minute walk changes brain chemistry (dopamine + serotonin)\n• 🗣️ **Talk to someone** — a friend, family, or a professional. Human connection is irreplaceable.\n• 💧 **Drink water and eat something warm** — dehydration and low blood sugar amplify negative emotions\n• 😴 **Rest if your body is asking for it** — sleep is the brain's reset button\n• 📵 **Put the phone down for an hour** — comparison and doomscrolling make everything worse\n• ☀️ **Get some natural light** — even 10 minutes outside regulates mood\n\n**If this has been going on for 2+ weeks,** please talk to a doctor or mental health professional. That's not weakness — it's the most courageous, intelligent thing you can do.\n\nI'm an AI with real limits. But I'm here, and I'm listening. Your tasks will wait. 💙\n\nWhat's going on?`;
  }

  // =========================================================
  // 9. POMODORO / FOCUS / DEEP WORK
  // =========================================================
  if (/(pomodoro|focus timer|25 (min|minutes)|focus (mode|session|block)|deep work|time block|flow state|can'?t focus|hard to focus|distract|attention|concentrate|hyperfocus|get in the zone)/i.test(cleanMsg)) {
    const devTip = isDev ? "\n\n💻 **Dev-specific:** Close all browser tabs except your docs. Use a second monitor only for the task at hand. Rubber duck debugging stays in session." : "";
    const studentTip = isStudent ? "\n\n📚 **Study tip:** Active recall (closing notes and testing yourself) is 3× more effective than re-reading. Use Pomodoro breaks to try to recall what you just studied." : "";
    return `🍅 **The Pomodoro Technique${hi}:**\n\n**The system:**\n1. ✅ Pick **ONE task** — only one\n2. ⏱ Work for **exactly 25 minutes** — phone face-down, notifications off, one tab open\n3. ☕ **5-minute break** — stand up, breathe, move, look away from screen\n4. Repeat ×4, then take a **20-30 min break**\n\n**Why it works:**\n• Creates artificial urgency (Parkinson's Law killer)\n• Makes scary tasks feel time-limited and conquerable\n• Scheduled rest prevents cognitive fatigue\n• Builds momentum through completion loops\n\n**Open:** Focus tab → pick a task → ▶ Start${topTask ? `\n\n🎯 Your best next task: **"${topTask.title}"** — start a session on this?` : ""}${devTip}${studentTip}`;
  }

  // =========================================================
  // 10. PRODUCTIVITY TIPS — rotating, role-aware
  // =========================================================
  if (/(tip|advice|trick|hack|suggest|recommend|how (to be|to stay|to get|to become) (more )?(product|focus|efficien|effective|organized|disciplin)|best (practice|way)|improve my|level up|be more productive|productivity (advice|system)|work smarter)/i.test(cleanMsg)) {
    const roleTips = isDev ? [
      `💻 **For developers:** Use the **2-window rule** — code on one monitor, docs on the other. Switching tabs is a focus killer.`,
      `💻 **Git as a todo list:** Commit messages are mini task completions — "feat: add login form" is a satisfying done. Use feature branches per task.`,
      `💻 **Rubber duck first:** Before asking for help, explain the problem out loud to an imaginary duck. 80% of bugs solve themselves in this process.`,
    ] : isStudent ? [
      `📚 **Spaced repetition:** Review new material after 1 day, 3 days, 1 week, 1 month. This alone can 3× your retention vs re-reading.`,
      `📚 **Active recall > passive reading:** After reading a section, close the book and write everything you remember. Struggle is the learning.`,
      `📚 **Study environment:** Your brain associates the place you study with studying itself. Always study in the same spot — the cue primes focus.`,
    ] : isManager ? [
      `💼 **Manager tip:** Start every day with a "5-3-1" — 5 tasks for the week, 3 for today, 1 most important thing. Delegate everything outside the 1.`,
      `💼 **Energy management:** As a manager, your job is to remove blockers for your team, not to be busy. Protect 2 uninterrupted hours daily for strategic thinking.`,
    ] : [];

    const generalTips = [
      `🧠 **Eat the frog:** Do your hardest, most important task FIRST — before email, before social media. Willpower is highest in the morning.`,
      `📵 **Phone-free mornings:** Don't check your phone for the first 30 minutes of the day. Your brain defaults to its own agenda instead of others'.`,
      `✍️ **The 2-minute rule (David Allen):** If a task takes less than 2 minutes — do it NOW, don't list it. Adding it costs more than doing it.`,
      `🎯 **MIT method:** Every morning, pick your 3 Most Important Tasks. Complete those before anything else. Everything else is a bonus.`,
      `🔕 **Batch distractions:** Check messages twice a day — 10am and 4pm. Every notification switch costs 23 minutes of refocus time (UC Irvine research).`,
      `🛏️ **Tomorrow starts tonight:** 5 minutes before bed, plan tomorrow's top 3 tasks. You'll wake up with direction instead of decision fatigue.`,
      `💧 **Energy > time:** You don't manage time — you manage energy. Sleep, movement, and nutrition are productivity tools, not luxuries.`,
      `🚫 **Strategic no:** Every "yes" to something minor is a "no" to something that matters. Protect your attention fiercely.`,
      `🌊 **Protect flow state:** When you're in deep focus, NOTHING else matters. Block the calendar. Close Slack. Let calls go to voicemail. Flow is 5× more productive.`,
      `📊 **Weekly review:** Every Sunday, 10 minutes reviewing what you finished and planning next week. This one habit compounds massively over months.`,
    ];

    const allTips = [...roleTips, ...generalTips];
    const tip = allTips[new Date().getDate() % allTips.length];
    return `💡 **Productivity insight${hi}:**\n\n${tip}\n\nYou have ${active.length} active ${taskWords} right now — want me to plan your day around them?`;
  }

  // =========================================================
  // 11. TIME MANAGEMENT
  // =========================================================
  if (/(time management|manage (my )?time|wasting time|not enough time|always busy|no time|time (flies|passing)|deadline|can'?t fit everything|too many tasks|overwhelm(ed)? by tasks)/i.test(cleanMsg)) {
    return `⏰ **Time Management${hi}:**\n\n**The hard truth:** You have the same 24 hours as the most productive people alive. The difference is what they say YES and NO to.\n\n**The GTD framework (David Allen):**\n1. **Capture** — write everything down immediately (Taskflow exists for this)\n2. **Clarify** — what does "done" look like for each task?\n3. **Organise** — priority, category, due date\n4. **Review** — weekly check-in (10 min, Sundays)\n5. **Engage** — work the system, trust the plan\n\n**LIBI's 3 time laws:**\n• **Parkinson's Law:** Work expands to fill the time given. Time-box everything.\n• **Hofstadter's Law:** Everything takes longer than expected. Add 30% buffer to estimates.\n• **The planning fallacy:** We overestimate what we can do in a day, underestimate what we can do in a year.\n\n📅 Your **Daily Planner tab** auto-builds your schedule — open it and compare to reality!`;
  }

  // =========================================================
  // 12. GOALS & GOAL SETTING
  // =========================================================
  if (/(^goal|my goal|goals|milestone|achieve|ambition|long.?term|vision|life plan|dream|aspir|set a goal|big picture)/i.test(cleanMsg)) {
    return `🏆 **Goals${hi}:**\n\n**SMART Goal framework:**\n• **S**pecific — "Run a 5K" not "get fit"\n• **M**easurable — you can track progress\n• **A**chievable — hard but realistic\n• **R**elevant — connected to what you actually value\n• **T**ime-bound — deadlines create urgency\n\n**The deeper truth:** Most people set goals but don't build the system that leads to them. Goals are the direction. **Daily habits and tasks** are the engine.\n\n**In Taskflow:**\n→ **Goals tab** — milestones, progress bars, deadlines\n→ **⚡ AI Breakdown** (in LIBI's Breakdown tab) — type any goal, I'll break it into a real task plan\n→ **Habits tab** — the daily disciplines that compound into big outcomes\n\n${active.length > 0 ? `💡 You have ${active.length} active ${taskWords} — are any connected to a bigger goal? If not, that's worth thinking about.` : "Open the Goals tab and set your first target — I'll help you break it down. ✦"}`;
  }

  // =========================================================
  // 13. HABITS & ROUTINES
  // =========================================================
  if (/(habit|routine|streak|consistency|build (a|the) habit|discipline|self.?control|willpower|daily practice|every day|build (a )?(morning|evening|night) routine)/i.test(cleanMsg)) {
    return `🔁 **Habits${hi}:**\n\n**The science (from Atomic Habits by James Clear):**\n• Habits aren't built by willpower — they're built by **identity and environment design**\n• The habit loop: **Cue → Craving → Response → Reward**\n• To build a habit: make it obvious, attractive, easy, and satisfying\n• To break one: make it invisible, unattractive, difficult, and unsatisfying\n\n**LIBI's habit rules:**\n1. **Start embarrassingly small** — "2 push-ups" not "30 min workout"\n2. **Attach to existing anchors** — "After coffee, I will journal for 2 min"\n3. **Never miss twice** — one miss is an accident, two is the start of a new habit\n4. **Track it** — what gets measured gets done\n\n**In Taskflow:** Habits tab → track daily → build streaks 🔥\n\nWhat habit are you trying to build${hi}? Tell me and I'll design a start plan.`;
  }

  // =========================================================
  // 14. SLEEP
  // =========================================================
  if (/\b(sleep|insomnia|can'?t sleep|sleep (better|hygiene|schedule|quality)|waking up (tired|early|late)|oversleep|bedtime|sleep deprive|night routine)\b/i.test(cleanMsg)) {
    return `😴 **Sleep${hi} — your single most powerful productivity tool:**\n\n**What sleep deprivation actually does:**\n• Impairs decision-making to levels comparable to being intoxicated\n• Kills willpower and emotional regulation\n• Reduces creativity and problem-solving by ~40%\n• Makes everything slower, harder, and worse\n\n**LIBI's sleep protocol:**\n1. 🕐 **Same bedtime every night** — including weekends (circadian rhythm is literal)\n2. 📵 **No screens 45-60 min before bed** — blue light suppresses melatonin\n3. 🌡️ **Cool room** — 16-19°C / 62-66°F is the scientifically optimal range\n4. ☕ **No caffeine after 1-2pm** — it has a 5-6 hour half-life\n5. 📝 **Brain dump before bed** — write tomorrow's tasks so your mind stops rehearsing\n6. 🌑 **Full darkness** — even tiny light sources disrupt deep sleep\n\n💡 **If you can't fall asleep:** Get up after 20 min of lying awake. Do something boring in dim light. Return only when sleepy. This rebuilds the bed-sleep association.`;
  }

  // =========================================================
  // 15. EXERCISE / FITNESS
  // =========================================================
  if (/\b(exercise|workout|gym|fitness|running|weight loss|lose weight|build muscle|strength|cardio|training|get fit|get in shape|lifting|yoga|sport|steps|sedentary|sit too much)\b/i.test(cleanMsg)) {
    return `💪 **Fitness${hi}:**\n\n**The fundamentals (that actually work):**\n• **Consistency > intensity** — 3×30 min/week beats one 3-hour session. Always.\n• **Find movement you enjoy** — the best workout is the one you'll actually do tomorrow\n• **Start embarrassingly small** — 10 minutes counts. It really does.\n\n**For fat loss:**\n• Calorie deficit is the mechanism — no way around it\n• Protein is your ally (0.8-1g per kg) — keeps you full and preserves muscle\n• Resistance training is the long-term metabolism booster\n• Sleep deprivation raises cortisol and drives fat storage\n\n**For muscle building:**\n• Progressive overload — add weight or reps each week\n• Protein 1.6-2g/kg + slight calorie surplus\n• Recovery matters as much as training — muscle is built during rest\n\n**For energy and mood:**\n• Even a 10-minute walk increases dopamine and serotonin for hours\n• Morning movement sets the hormonal tone for the whole day\n\n💡 Add your workout routine to **Habits tab** — streaks make it stick! 🔥`;
  }

  // =========================================================
  // 16. NUTRITION
  // =========================================================
  if (/\b(nutrition|healthy eating|meal|protein|carbs?|vegetables?|vitamins?|supplements?|drink water|hydrat|hungry|fasting|intermittent fasting|vegan|vegetarian|gut health|diet)\b/i.test(cleanMsg)) {
    return `🥗 **Nutrition${hi}:**\n\n**What actually moves the needle:**\n• 🥦 **Whole foods first** — vegetables, fruits, legumes, whole grains, lean proteins\n• 💧 **Hydration** — 2-3L water/day; most people are chronically dehydrated (it wrecks focus)\n• 🥩 **Enough protein** — essential for muscle, satiety, and brain function (0.8-1g per kg)\n• 🚫 **Limit ultra-processed food** — they hijack hunger hormones and make overeating automatic\n\n**Quick wins:**\n• Add a vegetable to every meal — just one\n• Replace one sugary drink with water daily\n• Eat protein at breakfast — reduces cravings all day\n• Meal prep Sunday → removes bad decisions when tired on weekdays\n\n**The real secret:** No diet beats one you can maintain for life. **Sustainability > perfection** — a consistently imperfect diet beats a perfect one you abandon.\n\n💡 Add "drink 2L water" or "prep meals" as a **Habit in Taskflow**!`;
  }

  // =========================================================
  // 17. MEDITATION / MINDFULNESS / CALM
  // =========================================================
  if (/\b(meditat(e|ion)|mindfulness|breathing|breathe|calm (down|my mind)|relax(ation)?|mental peace|be present|zen|inner peace|clear my mind|ground(ing|ed)|anxiety relief)\b/i.test(cleanMsg)) {
    return `🧘 **Mindfulness${hi}:**\n\n**The science:** Meditation literally rewires the brain — strengthens the prefrontal cortex (decision-making, focus) and shrinks the amygdala (fear, reactivity). Measurable changes in **8 weeks** with just 5-10 minutes daily.\n\n**Start right now (5-minute version):**\n1. Sit anywhere comfortable\n2. Close your eyes or soften your gaze\n3. Focus only on your breath — the physical sensation of air entering and leaving\n4. When your mind wanders (it will — that's normal, not failure) — gently return to the breath\n5. That's literally it. The returning *is* the practice.\n\n**Types:**\n• **Breath awareness** — simplest, best starting point\n• **Body scan** — move attention slowly from feet to head, noticing sensations\n• **Box breathing** — 4 in, hold 4, out 4, hold 4. Instant nervous system reset.\n• **Loving-kindness** — mentally extend warmth to yourself then others\n\n**Apps:** Headspace, Calm, Insight Timer (free)\n\n💡 Add a 5-min meditation to your **Habits tab** — one of the highest-ROI daily habits that exists.`;
  }

  // =========================================================
  // 18. SCIENCE — expanded knowledge
  // =========================================================
  if (/\b(science|physics|chemistry|biology|evolution|gravity|quantum|space|universe|galaxy|black hole|planet|solar system|atom|molecule|dna|climate|global warming|big bang|relativity)\b/i.test(cleanMsg)) {
    const scienceFacts = [
      `🔬 **Science fact${hi}:**\n\nYou asked about science — here's something beautiful:\n\n**DNA:** Your body contains about 37 trillion cells, each with roughly 2 meters of DNA tightly coiled inside. If uncoiled, all your DNA would stretch from the Earth to the Sun and back — **about 600 times**.\n\n**Quantum mechanics:** At the subatomic level, particles exist in multiple states simultaneously until observed. This "superposition" isn't a limitation of measurement — it's how reality actually works at that scale.\n\n**Black holes:** Time literally slows down near a black hole (gravitational time dilation, confirmed by GPS satellites which need correction for this effect). The event horizon is the point of no return — not a physical surface, but a boundary in spacetime.\n\nWhat area of science interests you most?`,
      `🌌 **Space${hi}:**\n\n**Scale that's hard to comprehend:**\n• Light takes 8 minutes to reach us from the Sun\n• The nearest star (Proxima Centauri) is 4.24 light-years away — at the speed of Voyager 1, it'd take 73,000 years to reach\n• The Milky Way contains 200-400 billion stars\n• The observable universe contains ~2 trillion galaxies\n\n**The cosmic perspective:** Every atom in your body heavier than hydrogen was forged in the heart of a star that exploded before our Sun existed. You are, literally, made of stardust.\n\nAsk me about any specific topic — black holes, the Big Bang, quantum mechanics, evolution, climate...`,
    ];
    return pick(scienceFacts);
  }

  // =========================================================
  // 19. CODING / PROGRAMMING — deep technical knowledge
  // =========================================================
  if (/\b(cod(e|ing)|program(ming)?|developer|software|javascript|python|react|html|css|learn (to code|programming)|github|debug(ging)?|algorithm|data structure|typescript|api|framework)\b/i.test(cleanMsg)) {
    const devGreeting = isDev ? `Fellow dev${hi}!` : `Coding advice${hi}:`;
    return `💻 **${devGreeting}**\n\n**How to actually learn to code:**\n1. **Pick ONE language** — stop jumping. Python or JavaScript to start. Go deep before going wide.\n2. **Build real things** — tutorials teach syntax. Projects teach problem-solving.\n3. **Read others' code** — GitHub is a goldmine. Study how people you respect solve problems.\n4. **Break things deliberately** — understanding error messages is 50% of the skill.\n5. **Google is not cheating** — senior engineers Google constantly. Problem-solving ability is the skill.\n\n**Web dev roadmap:**\nHTML → CSS → JavaScript → React → Node.js/Express → Databases (SQL/MongoDB)\n\n**Best free resources:**\n• freeCodeCamp.org (structured, free certificates)\n• The Odin Project (most rigorous free curriculum)\n• CS50 (Harvard, free on edX — the gold standard)\n• MDN Web Docs (your bible for web APIs)\n• roadmap.sh (visual roadmaps for any stack)\n\n**The truth:** Every senior developer was a complete beginner who kept building. The only difference is persistence.\n\n💡 Add "code for 30 minutes" as a **Habit** — daily practice is the only way.`;
  }

  // =========================================================
  // 20. FINANCE / MONEY
  // =========================================================
  if (/\b(money|finance|budget|budgeting|saving|savings|debt|invest(ing|ment)?|financial|broke|spending|expense|income|rent|bills|crypto|stocks?|rich|wealth|compound interest|emergency fund|retire(ment)?)\b/i.test(cleanMsg)) {
    return `💰 **Financial basics${hi}:**\n\n**The correct order (do these in sequence):**\n1. 🛡️ **Emergency fund** — 3-6 months of expenses in a liquid account. Non-negotiable.\n2. 💳 **Kill high-interest debt** — credit card debt at 20%+ is a financial emergency. Pay it first.\n3. 📈 **Invest consistently** — index funds, long term. Time in market beats timing the market.\n4. 🎯 **Budget with 50/30/20** — 50% needs, 30% wants, 20% savings/investment\n\n**Compound interest — the most important concept:**\n$1,000 at 7% return for 40 years = $14,974. Starting 10 years later = only $7,612. Time is everything.\n\n**Mindset shifts:**\n• Pay yourself first — automate savings *before* you see the money\n• Lifestyle inflation is the enemy of wealth — earnings up doesn't mean lifestyle up\n• Rich is a feeling, wealthy is a position — focus on the latter\n\n💡 Add financial goals to Taskflow's **Goals tab** — "save £500/month" with a milestone tracker!`;
  }

  // =========================================================
  // 21. CAREER / JOB
  // =========================================================
  if (/\b(career|job search|interview|resume|cv|salary|promotion|raise|quit|resign|unemployed|fired|laid off|workplace|side hustle|networking|linkedin)\b/i.test(cleanMsg)) {
    return `💼 **Career${hi}:**\n\n**Job searching:**\n• Tailor every CV to the specific role — generic ones get filtered in seconds\n• 70-80% of jobs are filled via network, not job boards (LinkedIn data)\n• Prepare 5 STAR stories (Situation, Task, Action, Result) — they cover 90% of interview questions\n• Follow up within 24 hours of any interview — most candidates don't\n\n**Growing in your role:**\n• Solve problems before being asked — this is what "leadership potential" actually means\n• Communicate your wins clearly — people cannot reward what they can't see\n• Build lateral relationships, not just upward ones\n\n**On quitting:**\n• First ask: is it the *job* or the *culture*? They're different problems.\n• Financial runway before quitting: 3-6 months expenses saved\n• Never burn bridges — the world is small and reputation is long\n\n${isFreelance ? `**Freelance specific:** Raise rates once a year minimum. Your best clients will stay. The ones who leave were the problem.\n\n` : ""}💡 Add career tasks — interviews, applications, learning goals — right to Taskflow!`;
  }

  // =========================================================
  // 22. RELATIONSHIPS
  // =========================================================
  if (/\b(relationship|breakup|break up|broke up|girlfriend|boyfriend|partner|spouse|husband|wife|dating|crush|heartbreak|divorce|marriage|romantic|toxic|communication issues)\b/i.test(cleanMsg)) {
    return `💙 **Relationships${hi}:**\n\n**What research consistently shows matters:**\n• 🗣️ **Communication quality over quantity** — say what you mean, clearly and kindly\n• 👂 **Listen to understand**, not just to reply — most conflict is a failure to feel heard\n• 🚧 **Boundaries aren't walls** — they're the explicit rules of respect\n• 💛 **Micro-appreciations** — small expressions of gratitude daily compound into deep connection\n• 🤝 **Repair > perfection** — every couple fights; how you repair is what defines the relationship\n• 📊 **Gottman's magic ratio:** 5 positive interactions to every 1 negative — couples who maintain this rarely split\n\n**For breakups/heartbreak:**\n• Feel it fully — suppression extends the grief, not shortens it\n• No-contact if you need space to actually heal (not as manipulation)\n• Grief is real, valid, and it does end\n• The goal isn't to stop feeling — it's to gradually feel it less intensely\n\nWant to talk through a specific situation? I'm listening. 💙`;
  }

  // =========================================================
  // 23. READING / BOOKS
  // =========================================================
  if (/\b(read(ing)?|books?|what (should i|to) read|book recommend|novel|non.?fiction|learn from books|kindle|audiobook|literature)\b/i.test(cleanMsg)) {
    return `📚 **Books${hi}:**\n\n**Essential reads by category:**\n\n**Productivity & habits:**\n• *Atomic Habits* — James Clear (the definitive habit guide)\n• *Deep Work* — Cal Newport (protecting focused time)\n• *Getting Things Done* — David Allen (the original system)\n\n**Decision-making & thinking:**\n• *Thinking, Fast and Slow* — Daniel Kahneman\n• *The Black Swan* — Nassim Taleb\n\n**Resilience & meaning:**\n• *Man's Search for Meaning* — Viktor Frankl\n• *Can't Hurt Me* — David Goggins\n\n**Career & business:**\n• *Zero to One* — Peter Thiel\n• *The Mom Test* — Rob Fitzpatrick\n• *So Good They Can't Ignore You* — Cal Newport\n\n**Mindset:**\n• *Mindset* — Carol Dweck (growth vs fixed)\n• *The Power of Now* — Eckhart Tolle\n\n**How to actually retain what you read:**\n1. Take notes *after* each chapter (not during — highlights are procrastination)\n2. Explain the key idea to someone else\n3. Apply one insight within 24 hours\n4. Review your notes 1 week later\n\n💡 Add "Read 20 pages of [title]" as a daily **Habit** in Taskflow!`;
  }

  // =========================================================
  // 24. TELL ME A JOKE / HUMOUR
  // =========================================================
  if (/(joke|funny|make me (laugh|smile|chuckle)|humou?r|something funny|lighten (up|the mood)|cheer me up|haha|lol)/i.test(cleanMsg)) {
    const jokes = [
      `Why do programmers prefer dark mode?\n\nBecause light attracts bugs. 🐛`,
      `I asked my productivity app if it could help me stop procrastinating.\n\nIt said "Sure, I'll get back to you later." 😄`,
      `Why did the task manager go to therapy?\n\nToo many unresolved issues. 📋`,
      `A completed task is like a pizza delivery — the best part is when it finally arrives. 🍕`,
      `My brain at 2am: "Remember that thing you forgot to do in 2019?"\nMy brain at 9am: *completely blank* 🧠`,
      `"I'll start Monday" has killed more dreams than failure ever has. 😅 (Just start today. Tuesday works too.)\n\n— LIBI, your productivity-obsessed AI`,
    ];
    return pick(jokes) + `\n\nFeeling better${hi}? Now — back to those ${active.length} ${taskWords}. 😄`;
  }

  // =========================================================
  // 25. QUOTES
  // =========================================================
  if (/(quote|inspire me|give me a quote|wise words|say something wise|daily quote|something meaningful|words of wisdom)/i.test(cleanMsg)) {
    const quotes = [
      `"We are what we repeatedly do. Excellence, then, is not an act, but a habit." — Aristotle`,
      `"The only way to do great work is to love what you do." — Steve Jobs`,
      `"It does not matter how slowly you go as long as you do not stop." — Confucius`,
      `"Success is not final, failure is not fatal: it is the courage to continue that counts." — Winston Churchill`,
      `"The secret of getting ahead is getting started." — Mark Twain`,
      `"Discipline is the bridge between goals and accomplishment." — Jim Rohn`,
      `"You don't rise to the level of your goals. You fall to the level of your systems." — James Clear`,
      `"The man who moves a mountain begins by carrying away small stones." — Confucius`,
      `"Motivation gets you started. Habit keeps you going." — Jim Ryun`,
      `"Hard choices, easy life. Easy choices, hard life." — Jerzy Gregorek`,
      `"You can't go back and change the beginning, but you can start where you are and change the ending." — C.S. Lewis`,
      `"Knowing is not enough; we must apply. Willing is not enough; we must do." — Goethe`,
    ];
    return `✨ ${pick(quotes)}\n\n${active.length > 0 ? `You have **${active.length} ${taskWords}** waiting. Let this be your push. 💪` : "Your list is clear — enjoy the moment, then set your next intention. ✦"}`;
  }

  // =========================================================
  // 26. DATE / TIME AWARENESS
  // =========================================================
  if (/what (time|day|date)|current (time|date|day)|today'?s date|what year|what month/i.test(cleanMsg)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const todayTaskCount = tasks.filter(t => !t.done && t.due === todayStr()).length;
    return `${timeEmoji} **${timeStr}**\n📅 **${dateStr}**\n\n${todayTaskCount > 0 ? `You have **${todayTaskCount} ${todayTaskCount > 1 ? taskWords : taskWord}** due today — let's tackle them! 💪` : active.length > 0 ? `No ${taskWords} due today, but you have **${active.length} active** ones. Want me to plan your day?` : `List is clear. Beautiful. ✨`}`;
  }

  // =========================================================
  // 27. BIRTHDAY / CELEBRATION
  // =========================================================
  if (/birthday|happy birthday|anniversary|congrat|celebrat|special day/i.test(cleanMsg)) {
    return `🎉 Happy Birthday${hi}! 🎂🥳\n\nI hope today is genuinely amazing. You deserve to celebrate.\n\nTake a real break from tasks today — the list will still be here tomorrow, I promise.\n\n💡 **LIBI's birthday truth:** The best gift you can give yourself is a moment to acknowledge how far you've come. Most people skip this. Don't.\n\nEnjoy every second. 🎁✨`;
  }

  // =========================================================
  // 28. OVERDUE ANALYSIS
  // =========================================================
  if (/(overdue|behind|late|missed (deadline|due date)|what.s late|past due)/i.test(cleanMsg)) {
    if (overdue.length === 0) return `✅ Great news${hi}! You have **no overdue ${taskWords}**. You're on top of everything — keep it up! 🔥`;
    const overdueList = overdue.slice(0, 5).map((tk, i) =>
      `${i + 1}. **"${tk.title}"** — was due ${tk.due} (${Math.abs(Math.ceil((new Date(tk.due) - new Date()) / 86400000))} days late)`
    ).join("\n");
    const action = overdue.length > 3
      ? `\n\n**Recovery strategy:**\n1. Go through each one: can you complete it today, reschedule it, or delete it?\n2. Don't try to do all of them at once — pick one, finish it, then the next\n3. Any task you can't reschedule or complete → be honest: delete it and move on\n\nWant me to plan a recovery schedule around these?`
      : `\n\n💪 This is manageable. Pick the smallest one and complete it first — breaking the overdue streak feels great.`;
    return `⚠️ **${overdue.length} overdue ${overdue.length > 1 ? taskWords : taskWord}${hi}:**\n\n${overdueList}${action}`;
  }

  // =========================================================
  // 29. TASK SUMMARY / WHAT DO I HAVE
  // =========================================================
  if (/(what (tasks?|${taskWords}) (do i have|are there)|show (me )?my tasks|list (my )?tasks|my task list|how many tasks|task overview)/i.test(cleanMsg)) {
    if (active.length === 0) return `✅ No active ${taskWords}${hi}! Your list is clean. Add something new with the + button, or ask me to help you set a goal.`;
    const taskList = active.slice(0, 8).map((tk, i) =>
      `${i + 1}. ${tk.priority === "high" ? "🔴" : tk.priority === "medium" ? "🟡" : "🟢"} **"${tk.title}"**${tk.due ? ` — due ${tk.due}` : ""}${tk.starred ? " ⭐" : ""}`
    ).join("\n");
    const more = active.length > 8 ? `\n_...and ${active.length - 8} more_` : "";
    return `📋 **Your ${taskWords}${hi} (${active.length} active):**\n\n${taskList}${more}\n\n🎯 Want me to tell you what to tackle first, or plan your whole day around these?`;
  }

  // =========================================================
  // 30. SELF-CARE / TAKING A BREAK
  // =========================================================
  if (/(self.?care|take a break|i need (a break|rest|time off)|burned? ?out|rest day|rest time|need to (recharge|recover)|take time for (myself|me))/i.test(cleanMsg)) {
    return `💙 **Yes — take the break${hi}.**\n\nThis is not laziness. This is strategy.\n\n**The science:** Cognitive rest is when the brain consolidates learning, processes emotions, and restores executive function. Rest *is* productivity — deferred.\n\n**Right now:**\n• 📵 Put the phone down and step outside for 15 minutes\n• 🫖 Make a warm drink and sit somewhere without a screen\n• 🎵 Listen to something you love — not a podcast, just music\n• 💬 Call someone you haven't spoken to in a while\n\n**Your tasks will still be here in an hour.** You'll approach them better after a real break than if you push through exhausted.\n\nYou have ${active.length} ${taskWords}. They can wait. You cannot. 💙`;
  }

  // =========================================================
  // 31. ENTREPRENEURSHIP / BUSINESS / STARTUPS
  // =========================================================
  if (/\b(entrepreneur(ship)?|startup|business (idea|plan)|side hustle|build (a|my) (company|startup|product|business)|launch|mvp|founder|venture|pitch|funding|investors?)\b/i.test(cleanMsg)) {
    return `🚀 **Entrepreneurship${hi}:**\n\n**Before you build anything:**\n1. **Talk to 20 potential customers first** — not friends or family. Real potential buyers.\n2. **Identify the actual pain** — "nice to have" businesses fail; "painkiller" businesses survive\n3. **Test the willingness to pay** — can you get someone to commit (even $1) before the product exists?\n\n**Building:**\n• **MVP first** — smallest version that tests your core assumption\n• **Launch embarrassingly early** — waiting for "ready" is how competitors get ahead\n• **Charge from day 1** — revenue is oxygen; everything else is decor\n\n**Common mistakes:**\n• Building in secret for too long\n• Not talking to customers enough (this can't be overstated)\n• Spending on branding before revenue\n• Hiring too fast with funding\n\n**Essential reads:**\n• *The Lean Startup* — Eric Ries\n• *Zero to One* — Peter Thiel\n• *The Mom Test* — Rob Fitzpatrick (on talking to customers)\n\n💡 Use LIBI's **⚡ Breakdown tab** — type your business idea and I'll turn it into a real task plan!`;
  }

  // =========================================================
  // 32. AI / TECHNOLOGY
  // =========================================================
  if (/\b(artificial intelligence|ai\b|machine learning|deep learning|llm|large language model|chatgpt|openai|neural network|technology|tech trends)\b/i.test(cleanMsg)) {
    return `🤖 **AI & Technology${hi}:**\n\n**What AI actually is:**\nSoftware trained on vast data to recognise patterns and generate outputs — text, images, code, decisions.\n\n**Key types:**\n• **Machine Learning** — finds patterns in data without explicit rules\n• **Deep Learning** — multi-layered neural networks, powers vision and language\n• **LLMs** (Large Language Models) — trained on massive text datasets to generate human-like language\n• **Generative AI** — creates content: text, images, audio, video, code\n\n**Will AI take jobs?**\nSome, yes — especially repetitive, pattern-based tasks. New jobs will also emerge. The safest strategy: **learn to work *with* AI**, not compete against it.\n\n**How to stay relevant:**\n• Learn AI tools in your specific field\n• Develop uniquely human skills: judgment, creativity, empathy, leadership\n• Stay curious — the landscape changes fast\n\nI'm LIBI — a real AI built right into your productivity app. I'm a small example of what focused, domain-specific AI can do. 🧠`;
  }

  // =========================================================
  // 33. WEATHER — honest capability awareness
  // =========================================================
  if (/\b(weather|forecast|temperature|rain|sunny|cold|hot|snow|wind|humidity|climate today)\b/i.test(cleanMsg)) {
    return `🌤️ Weather${hi}:\n\nI don't have access to live weather data — I can't check your local forecast directly.\n\n**To check:**\n• Ask your phone's voice assistant (Siri, Google, Alexa)\n• weather.com, Google "weather", or your phone's built-in app\n\n**Weather fun facts while you're here:**\n• Lightning strikes Earth ~100 times per second\n• A bolt of lightning is 5× hotter than the surface of the Sun\n• The wettest place: Mawsynram, India (11,871mm rain/year)\n• The driest: parts of the Atacama Desert (<1mm/year)\n\nNeed anything else? ✨`;
  }

  // =========================================================
  // 34. ANGRY / FRUSTRATED
  // =========================================================
  if (/\b(angry|anger|furious|frustrated|frustration|annoyed|irritated|rage|pissed|fed up|hate this|so angry|losing my (mind|temper)|can'?t take it)\b/i.test(cleanMsg)) {
    return `😤 That's valid${hi}. Anger usually signals something important — a boundary crossed, an expectation unmet, or just pure overload.\n\n**Right now:**\n1. 😮‍💨 **3 slow breaths** before doing ANYTHING (anger bypasses the prefrontal cortex — you literally can't think clearly while in it)\n2. 🚶 **Walk away for 5 minutes** — physically remove yourself from the trigger\n3. ✍️ **Write it out** — Notes tab → dump exactly what's making you angry. Getting it external reduces the internal pressure.\n4. 💬 **Ask yourself:** "What do I actually need right now?"\n\n**Critical:** Don't send important messages, make big decisions, or have key conversations while angry. Give it 20-30 minutes. The clarity that follows is worth the wait.\n\nWant to talk about what happened?`;
  }

  // =========================================================
  // 35. LONELY / ISOLATED
  // =========================================================
  if (/\b(lonely|alone|isolated|no friends|miss someone|homesick|nobody cares|feel(ing)? alone|disconnected)\b/i.test(cleanMsg)) {
    return `💙 Feeling lonely is one of the hardest feelings${hi}. I'm glad you said something.\n\n**Small steps to connection (pick one today):**\n• 📱 Text one person you haven't spoken to in a while — literally just "hey, thinking of you"\n• 🎮 Join an online community around something you love — Discord, Reddit, forums\n• 🚶 Go somewhere people are — coffee shop, library, park. Passive presence helps.\n• 🤝 Volunteer somewhere — direct, guaranteed human connection\n• 📖 Join a class or group around any interest — this is how the most lasting friendships form\n\n**Longer term:** Loneliness is a signal, not a verdict. It means you value connection — that's a strength. The solution is almost always some form of showing up consistently somewhere.\n\nI'm here and I'm listening. What's going on?`;
  }

  // =========================================================
  // 36. BORED
  // =========================================================
  if (/\b(bored|nothing to do|free time|so bored|nothing going on|killing time)\b/i.test(cleanMsg)) {
    if (active.length > 0) return `Bored${hi}? Really? 😄\n\nYou have **${active.length} ${taskWords}** just sitting there:\n\n${active.slice(0, 3).map((tk, i) => `${i + 1}. "${tk.title}"`).join("\n")}\n\nSpend **just 10 minutes** on one — you'll feel dramatically better.\n\nOr if you want something fun:\n• 🎵 Play ambient music (⋯ More → Music)\n• 🏆 Check your achievement badges\n• 📝 Write your thoughts in Notes\n• 🧠 Ask me literally anything — I'm here`;
    return `No tasks and free time — that's actually rare. Protect it! 🌟\n\n**Productive things to do when genuinely free:**\n• 🏆 Set a new goal (Goals tab)\n• 🔁 Start a habit you've been putting off (Habits tab)\n• 📅 Plan next week (Daily Planner)\n• 📝 Write in Notes — ideas, dreams, reflections\n• 🎵 Try the focus music while you think\n• 💡 Learn something new — ask me about any topic!\n• 🤙 Call someone you care about`;
  }

  // =========================================================
  // 37. CELEBRATE / I DID IT / ACHIEVEMENT
  // =========================================================
  if (/(i did it|i (just |finally )?(finished|completed|done with|got|passed|achieved|launched|shipped)|i won|we won|just (graduated|got hired|got promoted)|big win|celebrate|i'm proud)/i.test(cleanMsg)) {
    return `🎉 **YES${hi}!**\n\n**Stop and actually feel this moment.** Most people rush straight to the next thing — don't.\n\nWhat you just did took effort. It took showing up when it was hard. That matters.\n\n🔥 **LIBI truth:** Wins build identity. Every time you complete something meaningful, you're not just finishing a task — you're reinforcing who you are. Someone who finishes things. Someone who follows through.\n\n${topTask ? `💪 You still have **"${topTask.title}"** next — but first, take 5 minutes and genuinely celebrate this win.\n\n` : ""}Ride this energy. What's next? I'm ready to help you plan it. 🚀`;
  }

  // =========================================================
  // 38. WHO MADE LIBI / LIBI LABS
  // =========================================================
  if (/\b(who (made|built|created|designed|developed) (you|libi)|libi labs|your (creator|developer|maker)|who (is behind|runs) libi|libi history|who.?s behind)\b/i.test(cleanMsg)) {
    return `✦ **About LIBI${hi}:**\n\nI'm LIBI — built by **LIBI Labs**, a team obsessed with making productivity personal, offline-first, and genuinely helpful.\n\n**Why I exist:**\nMost productivity apps are just lists. LIBI is different — I know YOUR tasks, YOUR patterns, YOUR goals. I give advice based on what's actually happening in your life, not generic platitudes.\n\n**What makes LIBI different:**\n• 🧠 I understand your tasks, not just keywords\n• 💬 I remember things you tell me (name, role, habits)\n• ⚡ I create tasks from natural conversation\n• 📊 I reason about your actual data in real time\n• 🔒 Your data never leaves your device\n\n**My values:** Privacy. Helpfulness. Honesty. No ads. No tracking. No nonsense.\n\nAsk me anything. I'm here. ✦`;
  }

  // =========================================================
  // 39. EVERYTHING / FEATURES / WHAT CAN TASKFLOW DO
  // =========================================================
  if (/(everything|all features|what (can|does) taskflow (do|have)|feature list|full features|capabilities|show everything)/i.test(cleanMsg)) {
    return `✦ **Taskflow Ultimate — Everything${hi}:**\n\n📋 **Tasks** — priorities, categories, due dates, subtasks, tags, photos, recurring\n⏰ **Reminders** — 6 alarm tones, date+time picker, OS notifications\n📅 **Calendar** — month view with task indicators\n📊 **Statistics** — completion charts, streaks, categories\n⏱ **Focus & Time** — Pomodoro + per-task time tracking\n🏆 **Goals** — milestones, progress bars, deadlines\n🔁 **Habits** — daily tracking, streaks, 14-day grid\n⏰ **Daily Planner** — auto time-blocked schedule\n📝 **Notes** — rich text, colors, tags, pin, search\n😊 **Mood** — daily energy log, 7-day chart\n🗂️ **Board** — full Kanban drag & drop\n👫 **Team** — real-time Firebase collaboration\n✦ **LIBI AI** — that's me! Deep chat + full offline intelligence\n🌌 **Focus Mode** — fullscreen zen workspace\n🏅 **Gamification** — XP, 10 levels, 20+ badges\n⌘K **Command palette** — keyboard shortcuts\n🎵 **12 ambient music tracks** built in\n🌍 **5 languages** with RTL support\n🖼️ **9 wallpaper themes**\n📱 **Works on Android + any browser**\n\nWhat do you want to explore${hi}?`;
  }

  // =========================================================
  // 40. SMART FALLBACK — context-aware, never feels broken
  // =========================================================
  const contextual = active.length > 0 && topTask
    ? `\n\n💡 By the way — you have **${active.length} active ${taskWords}**. Your top priority right now: **"${topTask.title}"**. Want me to help with that?`
    : active.length === 0
      ? `\n\n✅ Your task list is clear! Want to add something new or set a goal?`
      : "";

  const fallbacks = [
    `🤔 Hmm, I'm not sure I fully caught that${hi}. Could you rephrase or give me a bit more context?\n\nI can help with:\n• **Tasks** — "Plan my day", "What's overdue?"\n• **Knowledge** — "How does Pomodoro work?", "Explain compound interest"\n• **Wellbeing** — "I'm stressed", "How to sleep better", "Motivate me"\n• **Life advice** — career, relationships, health, finance, coding\n• **Fun** — "Tell me a joke", "Give me a quote"${contextual}`,
    `✦ I want to make sure I give you the best answer${hi}! I didn't quite catch that — can you try asking in a different way?\n\nOr try one of these:\n• _"Plan my day"_ — I'll build a real schedule\n• _"What's most urgent?"_ — I'll analyse your tasks\n• _"Motivate me"_ — I'll give you a real push\n• _"Tell me about [topic]"_ — I have deep knowledge on most subjects${contextual}`,
    `I'm not sure I understood that correctly${hi}. I'm here and ready — try asking me:\n• About your tasks and productivity\n• For advice on focus, habits, health, or career\n• To plan your day or tell you what to do first\n• For a joke, a quote, or just a chat${contextual}`,
  ];

  return fallbacks[new Date().getSeconds() % fallbacks.length];
}

// ===================================================
//  MAIN APP
// ===================================================
const WALLPAPERS = [
  { id: "auto", label: "Auto 🕐", gradient: "auto", preview: "linear-gradient(135deg,#000008,#1a0040,#7c6dfa)" },
  { id: "none", label: "None", gradient: "none", preview: "var(--bg)" },
  { id: "galaxy", label: "Galaxy ✨", gradient: "linear-gradient(160deg,#000008 0%,#0a0020 25%,#1a0040 50%,#2d0060 70%,#7c6dfa 100%)", preview: "linear-gradient(160deg,#000008,#1a0040,#7c6dfa)" },
  { id: "nebula", label: "Nebula 🌌", gradient: "linear-gradient(135deg,#000015 0%,#0d0030 30%,#200060 55%,#4a0080 75%,#9b59b6 90%,#ff6b9d 100%)", preview: "linear-gradient(135deg,#000015,#200060,#9b59b6,#ff6b9d)" },
  { id: "aurora", label: "Aurora", gradient: "linear-gradient(160deg,#050a14 0%,#0d2137 40%,#00c9a7 70%,#7c6dfa 100%)", preview: "linear-gradient(160deg,#050a14,#0d2137,#00c9a7,#7c6dfa)" },
  { id: "sunset", label: "Sunset", gradient: "linear-gradient(160deg,#1a0533 0%,#6b1a3a 40%,#ff6b35 100%)", preview: "linear-gradient(160deg,#1a0533,#6b1a3a,#ff6b35)" },
  { id: "ocean", label: "Ocean", gradient: "linear-gradient(160deg,#0a0a2e 0%,#0d3b6e 50%,#00b4d8 100%)", preview: "linear-gradient(160deg,#0a0a2e,#0d3b6e,#00b4d8)" },
  { id: "forest", label: "Forest", gradient: "linear-gradient(160deg,#0a1628 0%,#1a3a2a 50%,#2d7a4f 100%)", preview: "linear-gradient(160deg,#0a1628,#1a3a2a,#2d7a4f)" },
  { id: "desert", label: "Desert", gradient: "linear-gradient(160deg,#1a0a00 0%,#8b3a00 50%,#ffd93d 100%)", preview: "linear-gradient(160deg,#1a0a00,#8b3a00,#ffd93d)" },
  { id: "cherry", label: "Cherry", gradient: "linear-gradient(160deg,#1a0010 0%,#6b0028 50%,#ff6b9d 100%)", preview: "linear-gradient(160deg,#1a0010,#6b0028,#ff6b9d)" },
  { id: "arctic", label: "Arctic", gradient: "linear-gradient(160deg,#0a1628 0%,#1a3a5c 50%,#a8d8ea 100%)", preview: "linear-gradient(160deg,#0a1628,#1a3a5c,#a8d8ea)" },
];

// ===================================================
//  🧠 OFFLINE AI BRAIN -- No API needed
//  Smart suggestions, priority scoring, behavior learning
// ===================================================

// == AI Priority Scorer ==============================
// Scores each task 0-100 based on deadline urgency, priority, overdue status, completion patterns
function aiScoreTask(task, allTasks) {
  let score = 0;
  const now = new Date();
  // Priority weight
  if (task.priority === "high") score += 40;
  if (task.priority === "medium") score += 20;
  if (task.priority === "low") score += 5;
  // Deadline urgency
  if (task.due) {
    const daysLeft = Math.ceil((new Date(task.due) - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) score += 50; // overdue — critical
    else if (daysLeft === 0) score += 35;
    else if (daysLeft <= 2) score += 25;
    else if (daysLeft <= 7) score += 15;
    else if (daysLeft <= 14) score += 8;
  }
  // Starred bonus
  if (task.starred) score += 10;
  // Recurring tasks get a small bump
  if (task.recurring && task.recurring !== "never") score += 5;
  // Subtask progress bonus (partially done = in-progress, worth prioritising)
  if (task.subtasks?.length > 0) {
    const doneSubs = task.subtasks.filter(s => s.done).length;
    if (doneSubs > 0 && doneSubs < task.subtasks.length) score += 8;
  }
  return Math.min(score, 100);
}




// ===================================================
//  🏆 GAMIFICATION ENGINE
// ===================================================
const BADGES = [
  { id: "first_task", icon: "🌱", name: "First Step", desc: "Complete your first task", xp: 50, check: (stats) => stats.totalDone >= 1 },
  { id: "ten_tasks", icon: "⚡", name: "Getting Things Done", desc: "Complete 10 tasks", xp: 100, check: (stats) => stats.totalDone >= 10 },
  { id: "fifty_tasks", icon: "🔥", name: "Productivity Pro", desc: "Complete 50 tasks", xp: 300, check: (stats) => stats.totalDone >= 50 },
  { id: "hundred_tasks", icon: "🚀", name: "Centurion", desc: "Complete 100 tasks — incredible!", xp: 600, check: (stats) => stats.totalDone >= 100 },
  { id: "streak_3", icon: "📅", name: "3-Day Streak", desc: "Complete tasks 3 days in a row", xp: 75, check: (stats) => stats.streak >= 3 },
  { id: "streak_7", icon: "🗓", name: "Week Warrior", desc: "7-day productivity streak", xp: 200, check: (stats) => stats.streak >= 7 },
  { id: "streak_30", icon: "🏆", name: "Monthly Master", desc: "30-day productivity streak", xp: 500, check: (stats) => stats.streak >= 30 },
  { id: "high_five", icon: "🎯", name: "High Five", desc: "Complete 5 high-priority tasks", xp: 150, check: (stats) => stats.highDone >= 5 },
  { id: "early_bird", icon: "🌅", name: "Early Bird", desc: "Complete a task before 9am", xp: 100, check: (stats) => stats.earlyBird },
  { id: "night_owl", icon: "🦉", name: "Night Owl", desc: "Complete a task after 10pm", xp: 100, check: (stats) => stats.nightOwl },
  { id: "goal_getter", icon: "🏅", name: "Goal Getter", desc: "Complete your first goal", xp: 200, check: (stats) => stats.goalsCompleted >= 1 },
  { id: "habit_hero", icon: "🔁", name: "Habit Hero", desc: "Log 7 habit completions", xp: 150, check: (stats) => stats.habitCompletions >= 7 },
  { id: "note_taker", icon: "📝", name: "Note Taker", desc: "Create 5 notes", xp: 75, check: (stats) => stats.notesCreated >= 5 },
  { id: "deep_thinker", icon: "🧠", name: "Deep Thinker", desc: "Create a note with 100+ words", xp: 80, check: (stats) => stats.longNoteCreated },
  { id: "team_player", icon: "👫", name: "Team Player", desc: "Share a task with someone", xp: 100, check: (stats) => stats.sharedTasks >= 1 },
  { id: "overdue_slayer", icon: "⚔️", name: "Overdue Slayer", desc: "Clear 5 overdue tasks", xp: 200, check: (stats) => stats.overdueCleared >= 5 },
  { id: "perfectionist", icon: "💎", name: "Perfectionist", desc: "Complete all subtasks in a task", xp: 100, check: (stats) => stats.perfectTasks >= 1 },
  { id: "planner", icon: "📆", name: "Master Planner", desc: "Use Daily Planner 3 times", xp: 75, check: (stats) => stats.plannerUses >= 3 },
  { id: "zen_master", icon: "🧘", name: "Zen Master", desc: "Complete 10 focus sessions", xp: 200, check: (stats) => stats.focusSessions >= 10 },
  { id: "comeback_kid", icon: "💪", name: "Comeback Kid", desc: "Complete a task after 5+ days idle", xp: 150, check: (stats) => stats.comebackDays >= 5 },
];




// =====================================================================
//  📵 SOCIAL MEDIA TRACKER & BLOCKER PAGE
// =====================================================================
// ─── Standalone Note Components (outside main App to avoid remount bug) ───────

function NoteCanvas({ value, onChange }) {
  const canvasRef = React.useRef(null);
  const drawing = React.useRef(false);
  const lastPos = React.useRef(null);
  const [tool, setTool] = React.useState("pen");
  const [penColor, setPenColor] = React.useState("#1a1a1a");
  const [size, setSize] = React.useState(3);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  function getPos(e, canvas) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  }
  function startDraw(e) { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e, canvasRef.current); }
  function draw(e) {
    e.preventDefault();
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : penColor;
    ctx.lineWidth = tool === "eraser" ? size * 6 : size;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
  }
  function endDraw() { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current.toDataURL()); }
  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "8px 12px", background: "var(--s2)", borderRadius: 12, border: "1px solid var(--b1)" }}>
        {[{ id: "pen", icon: "✏️" }, { id: "eraser", icon: "⬜" }].map(t => (
          <button key={t.id} onClick={() => setTool(t.id)} style={{ padding: "5px 10px", borderRadius: 8, border: `2px solid ${tool === t.id ? "var(--acc)" : "var(--b1)"}`, background: tool === t.id ? "var(--accd)" : "var(--s3)", cursor: "pointer", fontSize: 13 }}>{t.icon}</button>
        ))}
        <div style={{ display: "flex", gap: 5 }}>
          {["#1a1a1a", "#7c6dfa", "#ff6b6b", "#6bcb77", "#ff9f43", "#48dbfb"].map(c => (
            <div key={c} onClick={() => { setTool("pen"); setPenColor(c); }} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${penColor === c && tool === "pen" ? "var(--t1)" : "transparent"}`, transition: "all .15s" }} />
          ))}
        </div>
        <input type="range" min={1} max={12} value={size} onChange={e => setSize(+e.target.value)} style={{ width: 70, accentColor: "var(--acc)" }} />
        <span style={{ fontSize: 11, color: "var(--t3)" }}>Size {size}</span>
        <button onClick={clearCanvas} style={{ marginLeft: "auto", padding: "4px 10px", borderRadius: 8, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.3)", color: "#ff6b6b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>🗑 Clear</button>
      </div>
      <canvas ref={canvasRef} width={800} height={400}
        style={{ width: "100%", height: 300, borderRadius: 12, border: "1px solid var(--b1)", background: "#fff", touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
      />
      <div style={{ fontSize: 10, color: "var(--t3)", textAlign: "center" }}>Draw with finger or mouse · Sketch saves with your note</div>
    </div>
  );
}

function NoteEditorModal({
  noteForm, setNoteForm, editNote, setEditNote,
  noteTagInput, setNoteTagInput, noteIsListening, setNoteIsListening,
  accent, NOTE_CATS, NOTE_COLORS,
  saveNote, deleteNote, exportNotePDF, setShowNoteEditor,
  showNotif, haptic, play
}) {
  const [activeTab, setActiveTab] = React.useState("write");
  const textareaRef = React.useRef(null);

  function insertFormat(wrap) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = noteForm.body.slice(start, end);
    const newText = noteForm.body.slice(0, start) + wrap[0] + sel + wrap[1] + noteForm.body.slice(end);
    setNoteForm(f => ({ ...f, body: newText }));
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + wrap[0].length, end + wrap[0].length); }, 0);
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showNotif("❌ Not supported", "Your browser doesn't support voice input"); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    let finalText = noteForm.body;
    setNoteIsListening(true);
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript + " ";
        else interim = e.results[i][0].transcript;
      }
      setNoteForm(f => ({ ...f, body: finalText + interim }));
    };
    rec.onerror = () => setNoteIsListening(false);
    rec.onend = () => { setNoteIsListening(false); setNoteForm(f => ({ ...f, body: finalText })); };
    rec.start();
    window._noteRec = rec;
    haptic("medium");
    showNotif("🎙 Listening…", "Speak now — tap mic again to stop");
  }

  function stopVoice() {
    if (window._noteRec) { window._noteRec.stop(); window._noteRec = null; }
    setNoteIsListening(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 9000, display: "flex", flexDirection: "column" }}>
      {/* Top Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0 }}>
        <button onClick={() => setShowNoteEditor(false)} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t2)", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
        <input placeholder="Note title…" value={noteForm.title} onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))} style={{ flex: 1, fontSize: 18, fontWeight: 700, color: "var(--t1)", background: "none", border: "none", outline: "none", fontFamily: "'Instrument Serif',serif" }} />
        <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>{noteForm.body?.trim().split(/\s+/).filter(Boolean).length || 0}w</span>
        <button onClick={exportNotePDF} title="Export PDF" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>📄</button>
        <button onClick={noteIsListening ? stopVoice : startVoice} title="Voice to text" style={{ width: 36, height: 36, borderRadius: 10, background: noteIsListening ? "rgba(255,107,107,.15)" : "var(--s2)", border: `1px solid ${noteIsListening ? "rgba(255,107,107,.5)" : "var(--b1)"}`, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>🎙</button>
        <button onClick={saveNote} style={{ height: 36, padding: "0 16px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>{editNote ? "Update" : "Save"}</button>
        {editNote && <button onClick={() => deleteNote(editNote.id)} style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.3)", cursor: "pointer", fontSize: 14, color: "#ff6b6b", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>}
      </div>

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, flexWrap: "wrap" }}>
        {NOTE_CATS.filter(c => c.id !== "all").map(c => (
          <button key={c.id} onClick={() => setNoteForm(f => ({ ...f, category: c.id }))} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 20, border: `1.5px solid ${noteForm.category === c.id ? "var(--acc)" : "var(--b1)"}`, background: noteForm.category === c.id ? "var(--accd)" : "var(--s2)", color: noteForm.category === c.id ? "var(--acc)" : "var(--t3)", cursor: "pointer", fontWeight: 600 }}>{c.icon} {c.label}</button>
        ))}
        <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}>
          {(NOTE_COLORS || []).slice(0, 7).map(c => (
            <div key={c} onClick={() => setNoteForm(f => ({ ...f, color: c }))} style={{ width: 18, height: 18, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${noteForm.color === c ? "var(--t1)" : "transparent"}`, transform: noteForm.color === c ? "scale(1.25)" : "scale(1)", transition: "all .15s" }} />
          ))}
        </div>
        <button onClick={() => setNoteForm(f => ({ ...f, pinned: !f.pinned }))} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, border: `1.5px solid ${noteForm.pinned ? "var(--acc)" : "var(--b1)"}`, background: noteForm.pinned ? "var(--accd)" : "var(--s2)", color: noteForm.pinned ? "var(--acc)" : "var(--t3)", cursor: "pointer", fontWeight: 600 }}>📌 {noteForm.pinned ? "Pinned" : "Pin"}</button>
        <div style={{ display: "flex", gap: 2, background: "var(--s3)", borderRadius: 10, padding: 3 }}>
          {[{ id: "write", label: "✏️ Write" }, { id: "draw", label: "🎨 Draw" }].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: activeTab === t.id ? "var(--acc)" : "transparent", color: activeTab === t.id ? "#fff" : "var(--t3)", cursor: "pointer", fontSize: 11, fontWeight: 700, transition: "all .15s" }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Voice banner */}
      {noteIsListening && (
        <div style={{ background: "rgba(255,107,107,.95)", color: "#fff", padding: "8px 16px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span>🔴</span> Listening… speak now ·
          <button onClick={stopVoice} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Stop</button>
        </div>
      )}

      {/* Write Tab */}
      {activeTab === "write" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Formatting toolbar */}
          <div style={{ display: "flex", gap: 4, padding: "8px 16px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexWrap: "wrap", flexShrink: 0 }}>
            {[
              { label: "B", title: "Bold", wrap: ["**", "**"], style: { fontWeight: 900 } },
              { label: "I", title: "Italic", wrap: ["_", "_"], style: { fontStyle: "italic" } },
              { label: "H1", title: "Heading", wrap: ["# ", ""], style: { fontWeight: 800, fontSize: 10 } },
              { label: "H2", title: "Subheading", wrap: ["## ", ""], style: { fontWeight: 800, fontSize: 10 } },
              { label: "•", title: "Bullet", wrap: ["• ", ""] },
              { label: "1.", title: "Numbered", wrap: ["1. ", ""] },
              { label: "☐", title: "Checklist", wrap: ["- [ ] ", ""] },
              { label: '"', title: "Quote", wrap: ["> ", ""] },
              { label: "—", title: "Divider", wrap: ["\n---\n", ""] },
            ].map(btn => (
              <button key={btn.label} title={btn.title} onClick={() => insertFormat(btn.wrap)} style={{ padding: "4px 9px", borderRadius: 6, background: "var(--s2)", border: "1px solid var(--b1)", fontSize: 12, fontWeight: 700, color: "var(--t2)", cursor: "pointer", minWidth: 30, ...(btn.style || {}) }}>{btn.label}</button>
            ))}
            {/* Tags inline */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
              {(noteForm.tags || []).map(tg => (
                <span key={tg} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  #{tg}<span style={{ cursor: "pointer" }} onClick={() => setNoteForm(f => ({ ...f, tags: f.tags.filter(x => x !== tg) }))}>✕</span>
                </span>
              ))}
              <input placeholder="+ tag" value={noteTagInput} onChange={e => setNoteTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && noteTagInput.trim()) { const v = noteTagInput.trim().replace(/^#/, ""); if (!noteForm.tags?.includes(v)) setNoteForm(f => ({ ...f, tags: [...(f.tags || []), v] })); setNoteTagInput(""); } }}
                style={{ width: 60, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 8, padding: "3px 8px", fontSize: 11, color: "var(--t1)", outline: "none" }} />
            </div>
          </div>
          {/* Word-like writing area */}
          <div style={{ flex: 1, overflow: "auto", background: "var(--bg)", display: "flex", justifyContent: "center", padding: "24px 16px" }}>
            <div style={{ width: "100%", maxWidth: 720, background: "var(--s1)", borderRadius: 4, boxShadow: "0 1px 8px rgba(0,0,0,.12)", display: "flex", flexDirection: "column", minHeight: "100%" }}>
              <textarea ref={textareaRef} value={noteForm.body} onChange={e => setNoteForm(f => ({ ...f, body: e.target.value }))}
                placeholder={"Start writing…\n\nTips:\n**bold**  _italic_  # Heading\n• bullet point\n- [ ] checklist item\n> quote"}
                style={{ flex: 1, width: "100%", minHeight: 500, padding: "40px 48px", fontSize: 16, lineHeight: 1.9, fontFamily: "inherit", color: "var(--t1)", background: "transparent", border: "none", outline: "none", resize: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
          {/* Status bar */}
          <div style={{ display: "flex", gap: 16, padding: "6px 20px", borderTop: "1px solid var(--b1)", background: "var(--s1)", fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>
            <span>{noteForm.body?.trim().split(/\s+/).filter(Boolean).length || 0} words</span>
            <span>{noteForm.body?.length || 0} characters</span>
            <span>{Math.ceil((noteForm.body?.trim().split(/\s+/).filter(Boolean).length || 0) / 200)} min read</span>
          </div>
        </div>
      )}

      {/* Draw Tab */}
      {activeTab === "draw" && (
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <NoteCanvas value={noteForm.sketch} onChange={v => setNoteForm(f => ({ ...f, sketch: v }))} />
          {noteForm.sketch && <div style={{ marginTop: 12, textAlign: "center", fontSize: 12, color: "var(--t3)" }}>✅ Sketch saved — appears on note card and in PDF export</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

// =====================================================================
//  💤 SLEEP TRACKER PAGE
// =====================================================================
function SleepPage({ sleepLogs, setSleepLogs, sleepGoalHrs, setSleepGoalHrs, showSleepForm, setShowSleepForm, sleepForm, setSleepForm, accent, awardXP, showNotif, haptic, play, saveSleep }) {
  const uid2 = () => Math.random().toString(36).slice(2, 10);
  const calcDuration = (bed, wake) => {
    const [bh, bm] = bed.split(":").map(Number);
    const [wh, wm] = wake.split(":").map(Number);
    let mins = (wh * 60 + wm) - (bh * 60 + bm);
    if (mins < 0) mins += 1440;
    return mins / 60;
  };
  const qualityLabel = q => ["", "😴 Poor", "😐 Fair", "🙂 OK", "😊 Good", "🌟 Great"][q] || "";
  const qualityColor = q => ["", "#ff6b6b", "#ffd93d", "#ff9f43", "#6bcb77", "#7c6dfa"][q] || "#7c6dfa";
  const last7 = [...sleepLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).reverse();
  const avgHrs = last7.length ? (last7.reduce((s, l) => s + l.duration, 0) / last7.length).toFixed(1) : 0;
  const avgQuality = last7.length ? (last7.reduce((s, l) => s + l.quality, 0) / last7.length).toFixed(1) : 0;
  const todayLog = sleepLogs.find(l => l.date === new Date().toISOString().slice(0, 10));

  

  const maxHrs = Math.max(10, ...last7.map(l => l.duration));

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: "var(--t1)" }}>💤 Sleep Tracker</div>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>Track rest. Perform better.</div>
        </div>
        <button onClick={() => setShowSleepForm(true)} style={{ height: 38, padding: "0 16px", background: `linear-gradient(135deg,#4a1080,#7c6dfa)`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 4px 16px #7c6dfa44` }}>+ Log Sleep</button>
      </div>

      {/* Stats Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
        {[
          { icon: "⏱", label: "Avg Duration", val: avgHrs + "h", sub: `Goal: ${sleepGoalHrs}h`, color: "#7c6dfa" },
          { icon: "⭐", label: "Avg Quality", val: avgQuality + "/5", sub: last7.length + " nights", color: "#ffd93d" },
          { icon: "🎯", label: "Goal Hit", val: last7.filter(l => l.duration >= sleepGoalHrs).length + "/" + last7.length, sub: "last 7 days", color: "#6bcb77" },
        ].map(s => (
          <div key={s.label} style={{ background: "var(--s2)", borderRadius: 14, padding: "12px 10px", textAlign: "center", border: `1px solid var(--b1)` }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Bar Chart */}
      {last7.length > 0 && (
        <div style={{ background: "var(--s2)", borderRadius: 16, padding: "16px", border: "1px solid var(--b1)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 12, letterSpacing: .5, textTransform: "uppercase" }}>📊 Last 7 Nights</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
            {last7.map((l, i) => {
              const pct = (l.duration / maxHrs) * 100;
              const hit = l.duration >= sleepGoalHrs;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 9, color: hit ? "#6bcb77" : "#ff6b6b", fontWeight: 700 }}>{l.duration.toFixed(1)}</div>
                  <div style={{ width: "100%", height: 60, background: "var(--s3)", borderRadius: 6, overflow: "hidden", position: "relative" }}>
                    <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${pct}%`, background: hit ? `linear-gradient(180deg,#6bcb77,#00d4aa)` : `linear-gradient(180deg,#ff9f43,#ff6b6b)`, borderRadius: 6, transition: "height .4s" }} />
                    <div style={{ position: "absolute", bottom: `${(sleepGoalHrs / maxHrs) * 100}%`, width: "100%", height: 1, background: "rgba(255,255,255,.2)" }} />
                  </div>
                  <div style={{ fontSize: 8, color: "var(--t3)" }}>{l.date.slice(5)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 8, textAlign: "center" }}>Green = met goal · Orange = below goal · Line = {sleepGoalHrs}h target</div>
        </div>
      )}

      {/* Sleep Goal Setting */}
      <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px", border: "1px solid var(--b1)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>🎯 Sleep Goal</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <input type="range" min={5} max={12} step={0.5} value={sleepGoalHrs} onChange={e => setSleepGoalHrs(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "#7c6dfa" }} />
          <div style={{ fontSize: 18, fontWeight: 900, color: "#7c6dfa", minWidth: 40, textAlign: "right" }}>{sleepGoalHrs}h</div>
        </div>
        <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6 }}>
          {sleepGoalHrs >= 8 ? "✅ Recommended (8–9h for adults)" : sleepGoalHrs >= 7 ? "⚠️ Minimum recommended" : "❌ Sleep debt risk"}
        </div>
      </div>

      {/* Log List */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: .5 }}>📋 Recent Logs</div>
        {sleepLogs.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--t3)", fontSize: 13 }}>No sleep logs yet. Tap + Log Sleep to start.</div>}
        {[...sleepLogs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14).map(l => (
          <div key={l.id} style={{ background: "var(--s2)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 24 }}>{l.duration >= sleepGoalHrs ? "😴" : "😩"}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{l.duration.toFixed(1)}h</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: qualityColor(l.quality) + "22", color: qualityColor(l.quality), fontWeight: 700 }}>{qualityLabel(l.quality)}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{l.date} · 🛏 {l.bedtime} → ⏰ {l.waketime}</div>
              {l.notes && <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 3, fontStyle: "italic" }}>"{l.notes}"</div>}
            </div>
            <button onClick={() => setSleepLogs(ls => ls.filter(x => x.id !== l.id))} style={{ width: 28, height: 28, borderRadius: 8, background: "var(--s3)", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>
        ))}
      </div>

      {/* Log Form Modal */}
      {showSleepForm && (
        <div className="overlay" onClick={() => setShowSleepForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="drag" />
            <div className="m-head"><div className="m-title">💤 Log Sleep</div><button className="ic-btn" onClick={() => setShowSleepForm(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Date</div><input className="f-in" type="date" value={sleepForm.date} onChange={e => setSleepForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div className="f-lbl">🛏 Bed time</div><input className="f-in" type="time" value={sleepForm.bedtime} onChange={e => setSleepForm(f => ({ ...f, bedtime: e.target.value }))} /></div>
                <div><div className="f-lbl">⏰ Wake time</div><input className="f-in" type="time" value={sleepForm.waketime} onChange={e => setSleepForm(f => ({ ...f, waketime: e.target.value }))} /></div>
              </div>
              <div style={{ background: "var(--s2)", borderRadius: 12, padding: "12px", border: "1px solid var(--b1)" }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#7c6dfa", textAlign: "center", marginBottom: 4 }}>
                  {calcDuration(sleepForm.bedtime, sleepForm.waketime).toFixed(1)}h
                </div>
                <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center" }}>Duration · {calcDuration(sleepForm.bedtime, sleepForm.waketime) >= sleepGoalHrs ? "✅ Goal met!" : "⚠️ Below goal"}</div>
              </div>
              <div>
                <div className="f-lbl">Quality ({sleepForm.quality}/5) · {qualityLabel(sleepForm.quality)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  {[1, 2, 3, 4, 5].map(q => (
                    <button key={q} onClick={() => setSleepForm(f => ({ ...f, quality: q }))} style={{ flex: 1, height: 40, borderRadius: 10, border: `2px solid ${sleepForm.quality === q ? qualityColor(q) : "var(--b1)"}`, background: sleepForm.quality === q ? qualityColor(q) + "22" : "var(--s3)", cursor: "pointer", fontSize: 18 }}>
                      {["😴", "😐", "🙂", "😊", "🌟"][q - 1]}
                    </button>
                  ))}
                </div>
              </div>
              <div><div className="f-lbl">Notes (optional)</div><input className="f-in" placeholder="Woke up 2x, vivid dreams…" value={sleepForm.notes} onChange={e => setSleepForm(f => ({ ...f, notes: e.target.value }))} /></div>
            </div>
            <div className="m-foot">
              <button className="btn-c" onClick={() => setShowSleepForm(false)}>Cancel</button>
              <button className="btn-s" onClick={saveSleep}>Save Sleep Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//  🔥 CALORIE TRACKER PAGE
// =====================================================================
// ── Food Database (~200 common foods with nutritional info) ──
const FOOD_DB = [
  // Fruits
  { name: "Apple", cal: 95, p: 0.5, c: 25, f: 0.3, serving: "1 medium", cat: "fruit" },
  { name: "Banana", cal: 105, p: 1.3, c: 27, f: 0.4, serving: "1 medium", cat: "fruit" },
  { name: "Orange", cal: 62, p: 1.2, c: 15, f: 0.2, serving: "1 medium", cat: "fruit" },
  { name: "Strawberries", cal: 49, p: 1, c: 12, f: 0.5, serving: "1 cup", cat: "fruit" },
  { name: "Blueberries", cal: 84, p: 1.1, c: 21, f: 0.5, serving: "1 cup", cat: "fruit" },
  { name: "Grapes", cal: 104, p: 1.1, c: 27, f: 0.2, serving: "1 cup", cat: "fruit" },
  { name: "Watermelon", cal: 86, p: 1.7, c: 22, f: 0.4, serving: "2 cups diced", cat: "fruit" },
  { name: "Mango", cal: 99, p: 1.4, c: 25, f: 0.6, serving: "1 cup", cat: "fruit" },
  { name: "Pineapple", cal: 82, p: 0.9, c: 22, f: 0.2, serving: "1 cup", cat: "fruit" },
  { name: "Peach", cal: 59, p: 1.4, c: 14, f: 0.4, serving: "1 medium", cat: "fruit" },
  { name: "Pear", cal: 101, p: 0.7, c: 27, f: 0.2, serving: "1 medium", cat: "fruit" },
  { name: "Kiwi", cal: 42, p: 0.8, c: 10, f: 0.4, serving: "1 medium", cat: "fruit" },
  { name: "Avocado", cal: 240, p: 3, c: 13, f: 22, serving: "1 whole", cat: "fruit" },
  { name: "Papaya", cal: 62, p: 0.7, c: 16, f: 0.2, serving: "1 cup", cat: "fruit" },
  { name: "Pomegranate", cal: 83, p: 1.7, c: 19, f: 1.2, serving: "1/2 cup seeds", cat: "fruit" },
  { name: "Guava", cal: 37, p: 1.4, c: 8, f: 0.5, serving: "1 fruit", cat: "fruit" },
  { name: "Lychee", cal: 63, p: 0.8, c: 16, f: 0.4, serving: "1 cup", cat: "fruit" },
  { name: "Coconut (fresh)", cal: 159, p: 1.5, c: 7, f: 15, serving: "1/2 cup", cat: "fruit" },
  // Vegetables
  { name: "Broccoli", cal: 55, p: 3.7, c: 11, f: 0.6, serving: "1 cup", cat: "vegetable" },
  { name: "Spinach (cooked)", cal: 41, p: 5.3, c: 7, f: 0.5, serving: "1 cup", cat: "vegetable" },
  { name: "Carrot", cal: 25, p: 0.6, c: 6, f: 0.1, serving: "1 medium", cat: "vegetable" },
  { name: "Tomato", cal: 22, p: 1.1, c: 4.8, f: 0.2, serving: "1 medium", cat: "vegetable" },
  { name: "Cucumber", cal: 16, p: 0.7, c: 3.1, f: 0.2, serving: "1 cup sliced", cat: "vegetable" },
  { name: "Bell Pepper", cal: 31, p: 1, c: 6, f: 0.3, serving: "1 medium", cat: "vegetable" },
  { name: "Sweet Potato", cal: 103, p: 2.3, c: 24, f: 0.1, serving: "1 medium", cat: "vegetable" },
  { name: "Potato (baked)", cal: 161, p: 4.3, c: 37, f: 0.2, serving: "1 medium", cat: "vegetable" },
  { name: "Corn", cal: 96, p: 3.4, c: 21, f: 1.5, serving: "1 ear", cat: "vegetable" },
  { name: "Green Beans", cal: 31, p: 1.8, c: 7, f: 0.1, serving: "1 cup", cat: "vegetable" },
  { name: "Cauliflower", cal: 27, p: 2.1, c: 5.3, f: 0.3, serving: "1 cup", cat: "vegetable" },
  { name: "Mushrooms", cal: 15, p: 2.2, c: 2.3, f: 0.2, serving: "1 cup", cat: "vegetable" },
  { name: "Onion", cal: 44, p: 1.2, c: 10, f: 0.1, serving: "1 medium", cat: "vegetable" },
  { name: "Cabbage", cal: 22, p: 1.1, c: 5.2, f: 0.1, serving: "1 cup", cat: "vegetable" },
  { name: "Peas", cal: 62, p: 4.1, c: 11, f: 0.3, serving: "1/2 cup", cat: "vegetable" },
  { name: "Lettuce (iceberg)", cal: 10, p: 0.6, c: 2.2, f: 0.1, serving: "1 cup", cat: "vegetable" },
  // Proteins
  { name: "Chicken Breast (grilled)", cal: 165, p: 31, c: 0, f: 3.6, serving: "100g", cat: "protein" },
  { name: "Chicken Thigh", cal: 209, p: 26, c: 0, f: 11, serving: "100g", cat: "protein" },
  { name: "Chicken Wings", cal: 203, p: 30, c: 0, f: 8, serving: "100g", cat: "protein" },
  { name: "Turkey Breast", cal: 135, p: 30, c: 0, f: 1, serving: "100g", cat: "protein" },
  { name: "Salmon", cal: 208, p: 20, c: 0, f: 13, serving: "100g", cat: "protein" },
  { name: "Tuna (canned)", cal: 116, p: 26, c: 0, f: 0.8, serving: "100g", cat: "protein" },
  { name: "Shrimp", cal: 85, p: 20, c: 0.2, f: 0.5, serving: "100g", cat: "protein" },
  { name: "Tilapia", cal: 96, p: 20, c: 0, f: 1.7, serving: "100g", cat: "protein" },
  { name: "Beef Steak (sirloin)", cal: 271, p: 26, c: 0, f: 18, serving: "100g", cat: "protein" },
  { name: "Ground Beef (lean)", cal: 250, p: 26, c: 0, f: 15, serving: "100g", cat: "protein" },
  { name: "Lamb Chop", cal: 282, p: 26, c: 0, f: 19, serving: "100g", cat: "protein" },
  { name: "Pork Chop", cal: 231, p: 27, c: 0, f: 13, serving: "100g", cat: "protein" },
  { name: "Bacon (2 slices)", cal: 86, p: 6, c: 0.2, f: 7, serving: "2 slices", cat: "protein" },
  { name: "Egg (boiled)", cal: 78, p: 6.3, c: 0.6, f: 5.3, serving: "1 large", cat: "protein" },
  { name: "Egg (fried)", cal: 92, p: 6.3, c: 0.4, f: 7, serving: "1 large", cat: "protein" },
  { name: "Egg (scrambled)", cal: 91, p: 6.1, c: 1, f: 6.7, serving: "1 large", cat: "protein" },
  { name: "Paneer", cal: 265, p: 18, c: 1.2, f: 21, serving: "100g", cat: "protein" },
  { name: "Tofu", cal: 76, p: 8, c: 1.9, f: 4.8, serving: "100g", cat: "protein" },
  { name: "Cottage Cheese", cal: 98, p: 11, c: 3.4, f: 4.3, serving: "1/2 cup", cat: "protein" },
  { name: "Whey Protein Scoop", cal: 120, p: 24, c: 3, f: 1.5, serving: "1 scoop", cat: "protein" },
  // Grains & Carbs
  { name: "White Rice (cooked)", cal: 206, p: 4.3, c: 45, f: 0.4, serving: "1 cup", cat: "grain" },
  { name: "Brown Rice (cooked)", cal: 216, p: 5, c: 45, f: 1.8, serving: "1 cup", cat: "grain" },
  { name: "Pasta (cooked)", cal: 220, p: 8.1, c: 43, f: 1.3, serving: "1 cup", cat: "grain" },
  { name: "Bread (white, 1 slice)", cal: 79, p: 2.7, c: 15, f: 1, serving: "1 slice", cat: "grain" },
  { name: "Bread (whole wheat)", cal: 81, p: 3.6, c: 14, f: 1.1, serving: "1 slice", cat: "grain" },
  { name: "Oatmeal", cal: 154, p: 5.4, c: 27, f: 2.6, serving: "1 cup cooked", cat: "grain" },
  { name: "Quinoa (cooked)", cal: 222, p: 8.1, c: 39, f: 3.6, serving: "1 cup", cat: "grain" },
  { name: "Tortilla (flour)", cal: 159, p: 4.3, c: 27, f: 3.5, serving: "1 large", cat: "grain" },
  { name: "Naan Bread", cal: 262, p: 8.7, c: 45, f: 5.1, serving: "1 piece", cat: "grain" },
  { name: "Roti / Chapati", cal: 104, p: 3.1, c: 18, f: 3.7, serving: "1 piece", cat: "grain" },
  { name: "Bagel", cal: 270, p: 10, c: 53, f: 1.6, serving: "1 medium", cat: "grain" },
  { name: "Croissant", cal: 231, p: 4.7, c: 26, f: 12, serving: "1 medium", cat: "grain" },
  { name: "Cornflakes", cal: 101, p: 1.9, c: 24, f: 0.2, serving: "1 cup", cat: "grain" },
  { name: "Granola", cal: 299, p: 7.4, c: 32, f: 15, serving: "1/2 cup", cat: "grain" },
  { name: "Popcorn", cal: 93, p: 3, c: 19, f: 1.1, serving: "3 cups popped", cat: "grain" },
  // Dairy
  { name: "Milk (whole)", cal: 149, p: 8, c: 12, f: 7.9, serving: "1 cup", cat: "dairy" },
  { name: "Milk (2%)", cal: 122, p: 8.1, c: 11.7, f: 4.8, serving: "1 cup", cat: "dairy" },
  { name: "Milk (skim)", cal: 83, p: 8.3, c: 12.2, f: 0.2, serving: "1 cup", cat: "dairy" },
  { name: "Greek Yogurt", cal: 100, p: 17, c: 6, f: 0.7, serving: "170g", cat: "dairy" },
  { name: "Regular Yogurt", cal: 149, p: 8.5, c: 11.4, f: 8, serving: "1 cup", cat: "dairy" },
  { name: "Cheddar Cheese", cal: 113, p: 7, c: 0.4, f: 9.3, serving: "1 slice (28g)", cat: "dairy" },
  { name: "Mozzarella Cheese", cal: 85, p: 6.3, c: 0.7, f: 6.3, serving: "1 slice (28g)", cat: "dairy" },
  { name: "Butter", cal: 102, p: 0.1, c: 0, f: 11.5, serving: "1 tbsp", cat: "dairy" },
  { name: "Cream Cheese", cal: 99, p: 1.7, c: 1.6, f: 9.8, serving: "2 tbsp", cat: "dairy" },
  { name: "Ice Cream (vanilla)", cal: 137, p: 2.3, c: 16, f: 7.3, serving: "1/2 cup", cat: "dairy" },
  { name: "Lassi (sweet)", cal: 170, p: 5, c: 28, f: 4, serving: "1 glass", cat: "dairy" },
  // Legumes & Nuts
  { name: "Almonds", cal: 164, p: 6, c: 6.1, f: 14, serving: "28g", cat: "nuts" },
  { name: "Peanuts", cal: 161, p: 7.3, c: 4.6, f: 14, serving: "28g", cat: "nuts" },
  { name: "Cashews", cal: 157, p: 5.2, c: 8.6, f: 12, serving: "28g", cat: "nuts" },
  { name: "Walnuts", cal: 185, p: 4.3, c: 3.9, f: 18, serving: "28g", cat: "nuts" },
  { name: "Peanut Butter", cal: 188, p: 8, c: 6, f: 16, serving: "2 tbsp", cat: "nuts" },
  { name: "Lentils (dal, cooked)", cal: 230, p: 18, c: 40, f: 0.8, serving: "1 cup", cat: "legume" },
  { name: "Chickpeas (cooked)", cal: 269, p: 15, c: 45, f: 4.2, serving: "1 cup", cat: "legume" },
  { name: "Black Beans", cal: 227, p: 15, c: 41, f: 0.9, serving: "1 cup", cat: "legume" },
  { name: "Kidney Beans", cal: 225, p: 15, c: 40, f: 0.9, serving: "1 cup", cat: "legume" },
  { name: "Hummus", cal: 166, p: 8, c: 14, f: 9.6, serving: "1/3 cup", cat: "legume" },
  // Indian Foods
  { name: "Biryani (chicken)", cal: 292, p: 15, c: 40, f: 8, serving: "1 cup", cat: "indian" },
  { name: "Biryani (veg)", cal: 220, p: 6, c: 38, f: 5, serving: "1 cup", cat: "indian" },
  { name: "Butter Chicken", cal: 240, p: 17, c: 8, f: 15, serving: "1 cup", cat: "indian" },
  { name: "Dal Tadka", cal: 150, p: 9, c: 22, f: 3, serving: "1 cup", cat: "indian" },
  { name: "Palak Paneer", cal: 220, p: 12, c: 10, f: 16, serving: "1 cup", cat: "indian" },
  { name: "Chole", cal: 200, p: 10, c: 30, f: 5, serving: "1 cup", cat: "indian" },
  { name: "Samosa", cal: 262, p: 4, c: 32, f: 14, serving: "1 piece", cat: "indian" },
  { name: "Dosa (plain)", cal: 120, p: 3, c: 20, f: 3, serving: "1 piece", cat: "indian" },
  { name: "Masala Dosa", cal: 206, p: 5, c: 30, f: 8, serving: "1 piece", cat: "indian" },
  { name: "Idli", cal: 39, p: 2, c: 8, f: 0.2, serving: "1 piece", cat: "indian" },
  { name: "Vada", cal: 97, p: 3.5, c: 10, f: 5, serving: "1 piece", cat: "indian" },
  { name: "Puri", cal: 101, p: 2, c: 12, f: 5.2, serving: "1 piece", cat: "indian" },
  { name: "Paratha (plain)", cal: 150, p: 3, c: 22, f: 6, serving: "1 piece", cat: "indian" },
  { name: "Aloo Paratha", cal: 210, p: 5, c: 30, f: 8, serving: "1 piece", cat: "indian" },
  { name: "Upma", cal: 170, p: 4, c: 25, f: 6, serving: "1 cup", cat: "indian" },
  { name: "Poha", cal: 180, p: 4, c: 30, f: 5, serving: "1 cup", cat: "indian" },
  { name: "Pav Bhaji", cal: 290, p: 8, c: 36, f: 13, serving: "1 serving", cat: "indian" },
  { name: "Rajma (Kidney Bean Curry)", cal: 180, p: 10, c: 28, f: 3, serving: "1 cup", cat: "indian" },
  { name: "Gulab Jamun", cal: 150, p: 2, c: 22, f: 6, serving: "1 piece", cat: "indian" },
  { name: "Jalebi", cal: 150, p: 1, c: 30, f: 4, serving: "2 pieces", cat: "indian" },
  { name: "Raita", cal: 45, p: 2, c: 4, f: 2, serving: "1/2 cup", cat: "indian" },
  // Fast Food & Common Meals
  { name: "Pizza (1 slice, cheese)", cal: 272, p: 12, c: 34, f: 10, serving: "1 slice", cat: "fast" },
  { name: "Pizza (1 slice, pepperoni)", cal: 313, p: 13, c: 35, f: 13, serving: "1 slice", cat: "fast" },
  { name: "Cheeseburger", cal: 303, p: 15, c: 33, f: 13, serving: "1 burger", cat: "fast" },
  { name: "Chicken Burger", cal: 280, p: 20, c: 30, f: 10, serving: "1 burger", cat: "fast" },
  { name: "French Fries", cal: 312, p: 3.4, c: 41, f: 15, serving: "medium", cat: "fast" },
  { name: "Hot Dog", cal: 290, p: 10, c: 24, f: 17, serving: "1 with bun", cat: "fast" },
  { name: "Chicken Nuggets (6)", cal: 280, p: 14, c: 18, f: 17, serving: "6 pieces", cat: "fast" },
  { name: "Taco (beef)", cal: 210, p: 11, c: 21, f: 10, serving: "1 taco", cat: "fast" },
  { name: "Burrito", cal: 431, p: 18, c: 52, f: 18, serving: "1 burrito", cat: "fast" },
  { name: "Fried Rice", cal: 238, p: 6, c: 34, f: 8, serving: "1 cup", cat: "fast" },
  { name: "Noodles (fried)", cal: 270, p: 8, c: 38, f: 10, serving: "1 cup", cat: "fast" },
  { name: "Sushi Roll (6 pcs)", cal: 255, p: 9, c: 38, f: 7, serving: "6 pieces", cat: "fast" },
  { name: "Sandwich (ham & cheese)", cal: 352, p: 20, c: 33, f: 15, serving: "1 sandwich", cat: "fast" },
  { name: "Wrap (chicken)", cal: 310, p: 22, c: 30, f: 12, serving: "1 wrap", cat: "fast" },
  { name: "Caesar Salad", cal: 198, p: 13, c: 8, f: 13, serving: "1 bowl", cat: "fast" },
  // Beverages
  { name: "Coffee (black)", cal: 2, p: 0.3, c: 0, f: 0, serving: "1 cup", cat: "drink" },
  { name: "Coffee (latte)", cal: 135, p: 7, c: 14, f: 5, serving: "12 oz", cat: "drink" },
  { name: "Cappuccino", cal: 120, p: 6, c: 10, f: 6, serving: "12 oz", cat: "drink" },
  { name: "Tea (no sugar)", cal: 2, p: 0, c: 0.5, f: 0, serving: "1 cup", cat: "drink" },
  { name: "Chai Tea (with milk)", cal: 120, p: 4, c: 18, f: 3, serving: "1 cup", cat: "drink" },
  { name: "Orange Juice", cal: 112, p: 1.7, c: 26, f: 0.5, serving: "1 cup", cat: "drink" },
  { name: "Apple Juice", cal: 114, p: 0.3, c: 28, f: 0.3, serving: "1 cup", cat: "drink" },
  { name: "Smoothie (fruit)", cal: 180, p: 4, c: 38, f: 1, serving: "1 cup", cat: "drink" },
  { name: "Protein Shake", cal: 220, p: 30, c: 12, f: 5, serving: "1 shake", cat: "drink" },
  { name: "Coca-Cola", cal: 140, p: 0, c: 39, f: 0, serving: "12 oz can", cat: "drink" },
  { name: "Coconut Water", cal: 46, p: 1.7, c: 9, f: 0.5, serving: "1 cup", cat: "drink" },
  { name: "Mango Lassi", cal: 200, p: 6, c: 32, f: 5, serving: "1 glass", cat: "drink" },
  { name: "Lemonade", cal: 99, p: 0.2, c: 26, f: 0.1, serving: "1 cup", cat: "drink" },
  { name: "Beer", cal: 153, p: 1.6, c: 13, f: 0, serving: "12 oz", cat: "drink" },
  { name: "Red Wine", cal: 125, p: 0.1, c: 3.8, f: 0, serving: "5 oz", cat: "drink" },
  // Snacks & Sweets
  { name: "Chocolate (dark, 28g)", cal: 155, p: 2.2, c: 13, f: 11, serving: "28g", cat: "snack" },
  { name: "Chocolate (milk, 28g)", cal: 153, p: 2.1, c: 17, f: 8.7, serving: "28g", cat: "snack" },
  { name: "Chips (potato)", cal: 152, p: 2, c: 15, f: 10, serving: "28g", cat: "snack" },
  { name: "Cookies (chocolate chip)", cal: 78, p: 0.9, c: 9.3, f: 4.5, serving: "1 cookie", cat: "snack" },
  { name: "Brownie", cal: 227, p: 2.7, c: 36, f: 9.1, serving: "1 piece", cat: "snack" },
  { name: "Donut (glazed)", cal: 269, p: 3.6, c: 31, f: 15, serving: "1 donut", cat: "snack" },
  { name: "Cake (slice)", cal: 239, p: 2.4, c: 35, f: 10, serving: "1 slice", cat: "snack" },
  { name: "Protein Bar", cal: 210, p: 20, c: 22, f: 7, serving: "1 bar", cat: "snack" },
  { name: "Granola Bar", cal: 190, p: 3, c: 29, f: 7, serving: "1 bar", cat: "snack" },
  { name: "Trail Mix", cal: 173, p: 5, c: 16, f: 11, serving: "28g", cat: "snack" },
  { name: "Dates (Medjool)", cal: 66, p: 0.4, c: 18, f: 0, serving: "1 date", cat: "snack" },
  { name: "Honey (1 tbsp)", cal: 64, p: 0.1, c: 17, f: 0, serving: "1 tbsp", cat: "snack" },
  // Oils & Condiments
  { name: "Olive Oil", cal: 119, p: 0, c: 0, f: 14, serving: "1 tbsp", cat: "oil" },
  { name: "Coconut Oil", cal: 121, p: 0, c: 0, f: 14, serving: "1 tbsp", cat: "oil" },
  { name: "Ghee", cal: 112, p: 0, c: 0, f: 12.7, serving: "1 tbsp", cat: "oil" },
  { name: "Ketchup", cal: 20, p: 0.2, c: 5, f: 0, serving: "1 tbsp", cat: "oil" },
  { name: "Mayonnaise", cal: 94, p: 0.1, c: 0.1, f: 10, serving: "1 tbsp", cat: "oil" },
  { name: "Soy Sauce", cal: 8, p: 1.3, c: 1, f: 0, serving: "1 tbsp", cat: "oil" },
  // Middle Eastern
  { name: "Shawarma (Chicken)", cal: 390, p: 25, c: 35, f: 15, serving: "1 wrap", cat: "fast" },
  { name: "Falafel", cal: 333, p: 13, c: 32, f: 18, serving: "100g", cat: "legume" },
  { name: "Pita Bread", cal: 165, p: 5.5, c: 35, f: 1.2, serving: "1 pita", cat: "grain" },
  { name: "Baba Ghanoush", cal: 120, p: 2, c: 8, f: 10, serving: "1/4 cup", cat: "vegetable" },
  { name: "Tabbouleh", cal: 110, p: 3, c: 15, f: 5, serving: "1/2 cup", cat: "vegetable" },
  { name: "Baklava", cal: 334, p: 4.5, c: 40, f: 19, serving: "1 piece", cat: "snack" },
  // Indian Additions
  { name: "Paneer Tikka", cal: 260, p: 16, c: 8, f: 18, serving: "150g", cat: "indian" },
  { name: "Tandoori Chicken", cal: 260, p: 30, c: 0, f: 13, serving: "1 leg", cat: "indian" },
  { name: "Naan (Butter)", cal: 300, p: 8, c: 45, f: 10, serving: "1 naan", cat: "indian" },
  { name: "Pani Puri", cal: 250, p: 5, c: 40, f: 8, serving: "6 pieces", cat: "indian" },
  { name: "Mutton Korma", cal: 400, p: 25, c: 15, f: 28, serving: "1 cup", cat: "indian" },
  // Int. Fast Food & Meals
  { name: "Nachos (with cheese)", cal: 346, p: 9, c: 36, f: 19, serving: "1 serving", cat: "fast" },
  { name: "Mac and Cheese", cal: 400, p: 15, c: 45, f: 18, serving: "1 cup", cat: "fast" },
  { name: "Pancakes (syrup)", cal: 350, p: 6, c: 60, f: 10, serving: "2 pieces", cat: "fast" },
  { name: "Waffle", cal: 220, p: 5, c: 25, f: 11, serving: "1 waffle", cat: "fast" },
  { name: "Fried Chicken", cal: 390, p: 21, c: 15, f: 27, serving: "1 piece", cat: "fast" },
  // Special Beverages
  { name: "Matcha Latte", cal: 140, p: 6, c: 15, f: 5, serving: "12 oz", cat: "drink" },
  { name: "Energy Drink", cal: 110, p: 0, c: 27, f: 0, serving: "8 oz", cat: "drink" },
  { name: "Water", cal: 0, p: 0, c: 0, f: 0, serving: "1 cup", cat: "drink" },
  { name: "Margarita", cal: 170, p: 0, c: 20, f: 0, serving: "4 oz", cat: "drink" }
];

function CaloriePage({ calorieLogs, setCalorieLogs, calorieGoal, setCalorieGoal, showCalForm, setShowCalForm, calForm, setCalForm, accent, awardXP, showNotif, haptic, play, saveCalorie }) {
  const uid2 = () => Math.random().toString(36).slice(2, 10);
  const todayStr2 = () => new Date().toISOString().slice(0, 10);
  const [viewDate, setViewDate] = useState(todayStr2());
  const [calGoalEdit, setCalGoalEdit] = useState(false);
  const [foodSearch, setFoodSearch] = useState("");
  const [showFoodSearch, setShowFoodSearch] = useState(false);
  const foodSearchResults = useMemo(() => {
    if (!foodSearch.trim()) return [];
    const q = foodSearch.toLowerCase();
    return FOOD_DB.filter(f => f.name.toLowerCase().includes(q)).slice(0, 12);
  }, [foodSearch]);

  const dayLogs = calorieLogs.filter(l => l.date === viewDate);
  const totalCals = dayLogs.reduce((s, l) => s + parseInt(l.calories || 0), 0);
  const totalProtein = dayLogs.reduce((s, l) => s + parseFloat(l.protein || 0), 0);
  const totalCarbs = dayLogs.reduce((s, l) => s + parseFloat(l.carbs || 0), 0);
  const totalFat = dayLogs.reduce((s, l) => s + parseFloat(l.fat || 0), 0);
  const pct = Math.min(100, Math.round((totalCals / calorieGoal) * 100));
  const remaining = calorieGoal - totalCals;

  const mealGroups = ["breakfast", "lunch", "dinner", "snack"].map(m => ({
    meal: m,
    icon: { breakfast: "☀️", lunch: "🌤", dinner: "🌙", snack: "🍎" }[m],
    items: dayLogs.filter(l => l.meal === m),
    total: dayLogs.filter(l => l.meal === m).reduce((s, l) => s + parseInt(l.calories || 0), 0)
  }));

  

  const QUICK_FOODS = [
    { name: "Banana", cal: 89, p: 1, c: 23, f: 0, meal: "snack" },
    { name: "Chicken breast", cal: 165, p: 31, c: 0, f: 4, meal: "lunch" },
    { name: "White rice (1 cup)", cal: 206, p: 4, c: 45, f: 0, meal: "lunch" },
    { name: "Egg (1 large)", cal: 78, p: 6, c: 1, f: 5, meal: "breakfast" },
    { name: "Oatmeal (1 cup)", cal: 154, p: 5, c: 27, f: 3, meal: "breakfast" },
    { name: "Almonds (28g)", cal: 164, p: 6, c: 6, f: 14, meal: "snack" },
    { name: "Salmon (100g)", cal: 208, p: 20, c: 0, f: 13, meal: "dinner" },
    { name: "Avocado (½)", cal: 120, p: 1, c: 6, f: 11, meal: "lunch" },
  ];

  const barColor = pct >= 110 ? "#ff6b6b" : pct >= 90 ? "#ff9f43" : pct >= 70 ? "#ffd93d" : "#6bcb77";

  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: "var(--t1)" }}>🔥 Calorie Tracker</div>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>Fuel your productivity.</div>
        </div>
        <button onClick={() => setShowCalForm(true)} style={{ height: 38, padding: "0 16px", background: `linear-gradient(135deg,#c0392b,#ff6b6b)`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 16px #ff6b6b44" }}>+ Add Food</button>
      </div>

      {/* Date Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() - 1); setViewDate(d.toISOString().slice(0, 10)); }} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t2)", cursor: "pointer", fontSize: 16 }}>‹</button>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{viewDate === todayStr2() ? "Today" : viewDate}</div>
        <button onClick={() => { const d = new Date(viewDate); d.setDate(d.getDate() + 1); if (d.toISOString().slice(0, 10) <= todayStr2()) setViewDate(d.toISOString().slice(0, 10)); }} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t2)", cursor: "pointer", fontSize: 16 }}>›</button>
      </div>

      {/* Calorie Ring Summary */}
      <div style={{ background: "var(--s2)", borderRadius: 18, padding: "18px", border: "1px solid var(--b1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Progress arc */}
          <div style={{ position: "relative", width: 90, height: 90, flexShrink: 0 }}>
            <svg width="90" height="90" viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="38" fill="none" stroke="var(--s3)" strokeWidth="8" />
              <circle cx="45" cy="45" r="38" fill="none" stroke={barColor} strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 38}`}
                strokeDashoffset={`${2 * Math.PI * 38 * (1 - pct / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 45 45)"
                style={{ transition: "stroke-dashoffset .6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: "var(--t1)" }}>{totalCals}</div>
              <div style={{ fontSize: 8, color: "var(--t3)" }}>kcal</div>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>
              {remaining > 0 ? `${remaining} kcal remaining` : `${Math.abs(remaining)} kcal over goal`}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[{ label: "Goal", val: calorieGoal + "kcal", color: "var(--t3)" }, { label: "Eaten", val: totalCals + "kcal", color: "#ff9f43" }, { label: "Left", val: Math.max(0, remaining) + "kcal", color: "#6bcb77" }].map(s => (
                <div key={s.label} style={{ fontSize: 11, color: s.color, fontWeight: 700 }}>{s.label}: {s.val}</div>
              ))}
            </div>
            <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, marginTop: 10, overflow: "hidden" }}>
              <div style={{ height: "100%", width: pct + "%", background: `linear-gradient(90deg,#6bcb77,${barColor})`, borderRadius: 3, transition: "width .4s", maxWidth: "100%" }} />
            </div>
          </div>
        </div>
        {/* Macros */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 14 }}>
          {[{ label: "Protein", val: totalProtein.toFixed(0) + "g", color: "#7c6dfa", goal: 150 }, { label: "Carbs", val: totalCarbs.toFixed(0) + "g", color: "#ffd93d", goal: 250 }, { label: "Fat", val: totalFat.toFixed(0) + "g", color: "#ff9f43", goal: 65 }].map(m => (
            <div key={m.label} style={{ textAlign: "center", background: "var(--s3)", borderRadius: 10, padding: "8px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: m.color }}>{m.val}</div>
              <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 2 }}>{m.label}</div>
              <div style={{ height: 3, background: "var(--s2)", borderRadius: 2, marginTop: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (parseFloat(m.val) / m.goal) * 100)}%`, background: m.color, borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Meal Groups */}
      {mealGroups.map(group => (
        <div key={group.meal} style={{ background: "var(--s2)", borderRadius: 14, border: "1px solid var(--b1)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: group.items.length ? "1px solid var(--b1)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>{group.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", textTransform: "capitalize" }}>{group.meal}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ff9f43" }}>{group.total} kcal</span>
              <button onClick={() => { setCalForm(f => ({ ...f, meal: group.meal })); setShowCalForm(true); }} style={{ width: 26, height: 26, borderRadius: 8, background: "var(--acc)", border: "none", color: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          </div>
          {group.items.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid var(--b1)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>{item.name}</div>
                {(item.protein || item.carbs || item.fat) && <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>P:{item.protein}g C:{item.carbs}g F:{item.fat}g</div>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ff9f43", marginRight: 10 }}>{item.calories} kcal</span>
              <button onClick={() => setCalorieLogs(ls => ls.filter(l => l.id !== item.id))} style={{ width: 24, height: 24, borderRadius: 7, background: "var(--s3)", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 11 }}>✕</button>
            </div>
          ))}
        </div>
      ))}

      {/* Quick Add Foods */}
      <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px", border: "1px solid var(--b1)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>⚡ Quick Add</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {QUICK_FOODS.map(f => (
            <button key={f.name} onClick={() => {
              const entry = { id: uid2(), date: viewDate, name: f.name, calories: f.cal, protein: f.p, carbs: f.c, fat: f.f, meal: f.meal, notes: "" };
              setCalorieLogs(ls => [entry, ...ls]);
              showNotif("🔥 Quick add!", `${f.name} · ${f.cal} kcal`);
              haptic("light");
            }} style={{ padding: "8px 10px", background: "var(--s3)", borderRadius: 10, border: "1px solid var(--b1)", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)" }}>{f.name}</span>
              <span style={{ fontSize: 10, color: "#ff9f43", fontWeight: 600 }}>{f.cal} kcal</span>
            </button>
          ))}
        </div>
      </div>

      {/* Goal Setting */}
      <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px", border: "1px solid var(--b1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: calGoalEdit ? 10 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: .5 }}>🎯 Daily Calorie Goal: {calorieGoal} kcal</div>
          <button onClick={() => setCalGoalEdit(e => !e)} style={{ fontSize: 11, color: "var(--acc)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>{calGoalEdit ? "Done" : "Edit"}</button>
        </div>
        {calGoalEdit && <input type="range" min={1200} max={4000} step={50} value={calorieGoal} onChange={e => setCalorieGoal(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#ff6b6b" }} />}
      </div>

      {/* Add Food Modal */}
      {showCalForm && (
        <div className="overlay" onClick={() => setShowCalForm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="drag" />
            <div className="m-head"><div className="m-title">🔥 Add Food</div><button className="ic-btn" onClick={() => setShowCalForm(false)}>✕</button></div>
            <div className="m-body">
              {/* ── Food Search Section ── */}
              <div style={{ position: "relative", marginBottom: 4 }}>
                <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 6 }}>🔍 Search Food Database <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 400 }}>({FOOD_DB.length} foods)</span></div>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <input autoFocus className="f-in" placeholder="Type to search... e.g. chicken, rice, banana, biryani" value={foodSearch}
                    onChange={e => { setFoodSearch(e.target.value); setShowFoodSearch(true); }}
                    onFocus={() => setShowFoodSearch(true)}
                    style={{ flex: 1 }} />
                  {foodSearch && <button onClick={() => { setFoodSearch(""); setShowFoodSearch(false); }}
                    style={{ width: 28, height: 28, borderRadius: 8, background: "var(--s3)", border: "1px solid var(--b1)", color: "var(--t3)", cursor: "pointer", fontSize: 12, flexShrink: 0 }}>✕</button>}
                </div>
                {/* Search results dropdown */}
                {showFoodSearch && foodSearch.trim() && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: "100%", zIndex: 20, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,.3)", maxHeight: 260, overflowY: "auto", marginTop: 4 }}>
                    {foodSearchResults.length > 0 ? foodSearchResults.map((food, i) => (
                      <div key={food.name + i}
                        onClick={() => {
                          setCalForm(f => ({ ...f, name: food.name, calories: String(food.cal), protein: String(food.p), carbs: String(food.c), fat: String(food.f) }));
                          setFoodSearch(""); setShowFoodSearch(false);
                          haptic("light");
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--b1)", cursor: "pointer", transition: "background .12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: ({ fruit: "#6bcb7722", vegetable: "#10b98122", protein: "#ff6b6b22", grain: "#ffd93d22", dairy: "#48dbfb22", nuts: "#ff9f4322", legume: "#d47cff22", indian: "#ff9f4322", fast: "#ff6b6b22", drink: "#38bdf822", snack: "#f59e0b22", oil: "#ffd93d22" })[food.cat] || "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          {{ fruit: "🍎", vegetable: "🥬", protein: "🍗", grain: "🌾", dairy: "🥛", nuts: "🥜", legume: "🫘", indian: "🍛", fast: "🍔", drink: "☕", snack: "🍫", oil: "🫒" }[food.cat] || "🍽"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{food.name}</div>
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>{food.serving} · P:{food.p}g C:{food.c}g F:{food.f}g</div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: "#ff9f43" }}>{food.cal}</div>
                          <div style={{ fontSize: 9, color: "var(--t3)" }}>kcal</div>
                        </div>
                      </div>
                    )) : (
                      <div style={{ padding: "16px", textAlign: "center", color: "var(--t3)", fontSize: 12 }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>🔍</div>
                        No matches for "{foodSearch}"<br />
                        <span style={{ fontSize: 11 }}>Type the food manually below</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 4px" }}>
                <div style={{ flex: 1, height: 1, background: "var(--b1)" }} />
                <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, letterSpacing: 1 }}>OR ENTER MANUALLY</span>
                <div style={{ flex: 1, height: 1, background: "var(--b1)" }} />
              </div>

              <div><div className="f-lbl">Date</div><input className="f-in" type="date" value={calForm.date} onChange={e => setCalForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><div className="f-lbl">Food Name</div><input className="f-in" placeholder="e.g. Chicken breast, Rice, Banana…" value={calForm.name} onChange={e => setCalForm(f => ({ ...f, name: e.target.value }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div className="f-lbl">🔥 Calories (kcal)</div><input className="f-in" type="number" placeholder="e.g. 300" value={calForm.calories} onChange={e => setCalForm(f => ({ ...f, calories: e.target.value }))} /></div>
                <div><div className="f-lbl">💪 Protein (g)</div><input className="f-in" type="number" placeholder="0" value={calForm.protein} onChange={e => setCalForm(f => ({ ...f, protein: e.target.value }))} /></div>
                <div><div className="f-lbl">🍞 Carbs (g)</div><input className="f-in" type="number" placeholder="0" value={calForm.carbs} onChange={e => setCalForm(f => ({ ...f, carbs: e.target.value }))} /></div>
                <div><div className="f-lbl">🧈 Fat (g)</div><input className="f-in" type="number" placeholder="0" value={calForm.fat} onChange={e => setCalForm(f => ({ ...f, fat: e.target.value }))} /></div>
              </div>
              <div>
                <div className="f-lbl">Meal</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 6 }}>
                  {[{ v: "breakfast", icon: "☀️" }, { v: "lunch", icon: "🌤" }, { v: "dinner", icon: "🌙" }, { v: "snack", icon: "🍎" }].map(m => (
                    <button key={m.v} onClick={() => setCalForm(f => ({ ...f, meal: m.v }))} style={{ padding: "8px 4px", borderRadius: 10, border: `2px solid ${calForm.meal === m.v ? "var(--acc)" : "var(--b1)"}`, background: calForm.meal === m.v ? "var(--accd)" : "var(--s3)", cursor: "pointer", fontSize: 11, fontWeight: 700, color: calForm.meal === m.v ? "var(--acc)" : "var(--t3)" }}>
                      {m.icon}<br /><span style={{ fontSize: 9 }}>{m.v}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="m-foot">
              <button className="btn-c" onClick={() => setShowCalForm(false)}>Cancel</button>
              <button className="btn-s" disabled={!calForm.name.trim() || !calForm.calories} onClick={saveCalorie}>Add Food</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//  🏆 LEADERBOARD PAGE — Clash of Clans Style
// =====================================================================
function LeaderboardPage({ profiles, tasks, goals, habits, xp, gamStats, earnedBadges, computeRankScore, getRank, RANK_TIERS, accent, getLevel, activeProfile, sleepLogs, calorieLogs, myUid }) {
  const [lbFilter, setLbFilter] = useState("score");
  const [players, setPlayers] = useState([]);
  const [lbStatus, setLbStatus] = useState("idle"); // idle | loading | live | error | offline
  const [myDisplayName, setMyDisplayName] = useState(() => localStorage.getItem("tf_player_name") || "");
  const [nameInput, setNameInput] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const [viewPlayer, setViewPlayer] = useState(null); // The public profile card
  const unsubRef = useRef(null);

  // My actual stats
  const myProfileName = profiles.find(p => p.id === activeProfile)?.name || "You";
  const myTasks = tasks.filter(t => t.profileId === activeProfile);
  const myDone = myTasks.filter(t => t.done).length;
  const mySmartGoals = goals.filter(g => g.profileId === activeProfile && g.isSmart && g.milestones.length > 0 && g.milestones.every(m => m.done)).length;
  const myScore = computeRankScore(xp, gamStats.streak || 0, myDone, mySmartGoals, earnedBadges);
  const myRank = getRank(myScore);
  const myLevel = getLevel(xp);


  // Push my score to Firebase and subscribe to live leaderboard
  useEffect(() => {
    if (!myDisplayName) return; // don't push until user has set a name
    let cancelled = false;
    setLbStatus("loading");
    (async () => {
      try {
        const fb = await (typeof getFirebase !== "undefined" ? getFirebase() : null);
        if (!fb || cancelled) { setLbStatus("offline"); return; }
        const db = fb.db;
        // Push / upsert my entry
        await db.collection("leaderboard").doc(myUid).set({
          uid: myUid,
          name: myDisplayName,
          score: myScore,
          xp,
          streak: gamStats.streak || 0,
          done: myDone,
          rankName: myRank.name,
          rankColor: myRank.color,
          rankIcon: myRank.icon,
          badge: myRank.badge,
          updatedAt: Date.now(),
        });
        if (cancelled) return;
        // Subscribe live
        unsubRef.current = db.collection("leaderboard")
          .orderBy("score", "desc")
          .limit(50)
          .onSnapshot(snap => {
            if (cancelled) return;
            setPlayers(snap.docs.map(d => ({ ...d.data(), id: d.id, isMe: d.id === myUid })));
            setLbStatus("live");
          }, () => { if (!cancelled) setLbStatus("error"); });
      } catch (e) { if (!cancelled) setLbStatus("offline"); }
    })();
    return () => { cancelled = true; if (unsubRef.current) try { unsubRef.current(); } catch (e) { } };
  }, [myDisplayName, myScore, myUid]);

  // Sort by selected filter
  const sorted = [...players].sort((a, b) => {
    if (lbFilter === "xp") return (b.xp || 0) - (a.xp || 0);
    if (lbFilter === "streak") return (b.streak || 0) - (a.streak || 0);
    if (lbFilter === "tasks") return (b.done || 0) - (a.done || 0);
    return (b.score || 0) - (a.score || 0);
  });
  const myPosition = sorted.findIndex(p => p.isMe) + 1;
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  const trophyIcon = pos => pos === 1 ? "🥇" : pos === 2 ? "🥈" : "🥉";


  // Name setup modal
  if (!myDisplayName) return (
    <div style={{ padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
      <div style={{ fontSize: 56 }}>🏆</div>
      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: "var(--t1)" }}>Join the Leaderboard</div>
      <div style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.7, maxWidth: 300 }}>Enter a display name to compete with real Taskflow users worldwide. Your score is based on tasks completed, streaks, and XP.</div>
      <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Your display name…"
        style={{ width: "100%", maxWidth: 320, background: "var(--s2)", border: `1.5px solid ${accent.v}`, borderRadius: 14, padding: "13px 16px", fontSize: 15, color: "var(--t1)", outline: "none", textAlign: "center" }}
        onKeyDown={e => { if (e.key === "Enter" && nameInput.trim()) { localStorage.setItem("tf_player_name", nameInput.trim()); setMyDisplayName(nameInput.trim()); } }}
      />
      <button disabled={!nameInput.trim()} onClick={() => { const n = nameInput.trim(); if (n) { localStorage.setItem("tf_player_name", n); setMyDisplayName(n); } }}
        style={{ width: "100%", maxWidth: 320, height: 50, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 16, fontSize: 15, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", opacity: nameInput.trim() ? 1 : 0.5, boxShadow: `0 6px 20px ${accent.v}40` }}>
        🚀 Join Now
      </button>
      <div style={{ fontSize: 11, color: "var(--t3)" }}>No account needed · No personal data stored</div>
    </div>
  );

  return (
    <div style={{ padding: "0 0 80px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ background: `linear-gradient(160deg,#0a0015 0%,#1a0040 50%,${accent.v} 100%)`, padding: "22px 16px 18px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 20% 50%,#7c6dfa22 0%,transparent 50%),radial-gradient(circle at 80% 20%,#ff6b6b22 0%,transparent 40%)" }} />
        <div style={{ position: "relative", textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 28, marginBottom: 3 }}>🏆</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: "#fff" }}>Global Leaderboard</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2 }}>
            {lbStatus === "live" ? `🟢 Live · ${players.length} real players` : lbStatus === "loading" ? "⏳ Connecting…" : lbStatus === "offline" ? "📴 Offline — showing cached data" : "Compete · Climb · Conquer"}
          </div>
        </div>
        {/* My rank card */}
        <div style={{ background: "rgba(255,255,255,.08)", backdropFilter: "blur(10px)", borderRadius: 14, padding: "12px 16px", border: "1px solid rgba(255,255,255,.15)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 28 }}>{myRank.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: .5 }}>Your Rank</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: myRank.color }}>{myRank.name}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)" }}>{myPosition > 0 ? `#${myPosition} globally · ` : ""}  {myScore.toLocaleString()} pts</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#ffd700" }}>{myScore.toLocaleString()}</div>
            <button onClick={() => { setNameInput(myDisplayName); setShowNameModal(true); }} style={{ fontSize: 10, color: "rgba(255,255,255,.5)", background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>✎ {myDisplayName}</button>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "10px 16px", background: "var(--s1)", borderBottom: "1px solid var(--b1)", overflowX: "auto" }}>
        {[{ v: "score", label: "🏆 Score" }, { v: "xp", label: "⚡ XP" }, { v: "streak", label: "🔥 Streak" }, { v: "tasks", label: "✅ Tasks" }].map(f => (
          <button key={f.v} onClick={() => setLbFilter(f.v)} style={{ flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1.5px solid ${lbFilter === f.v ? accent.v : "var(--b1)"}`, background: lbFilter === f.v ? "var(--accd)" : "var(--s2)", color: lbFilter === f.v ? "var(--acc)" : "var(--t3)", cursor: "pointer", transition: "all .2s" }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {lbStatus === "loading" && <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
        <div style={{ fontSize: 32, marginBottom: 10, animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</div>
        <div style={{ fontSize: 13 }}>Connecting to live leaderboard…</div>
      </div>}

      {/* Empty */}
      {(lbStatus === "live" || lbStatus === "offline") && sorted.length === 0 && <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>👋</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t2)", marginBottom: 6 }}>You're the first here!</div>
        <div style={{ fontSize: 12 }}>Complete tasks to earn score and be #1</div>
      </div>}

      {/* Podium — Top 3 */}
      {sorted.length >= 1 && (
        <div style={{ padding: "18px 16px 10px", background: "var(--s1)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", textTransform: "uppercase", letterSpacing: .5, marginBottom: 14, textAlign: "center" }}>👑 Top Champions</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8, height: 150 }}>
            {[top3[1], top3[0], top3[2]].map((p, vi) => {
              if (!p) return <div key={vi} style={{ flex: 1 }} />;
              const pos = sorted.indexOf(p) + 1;
              const heights = [115, 145, 95]; const sizes = [38, 50, 34];
              const podColors = ["#a8b2bd", "#ffd700", "#cd7f32"];
              return (
                <div key={p.id || vi} onClick={() => setViewPlayer(p)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flex: 1, maxWidth: 110, cursor: "pointer" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: p.isMe ? accent.v : "var(--t2)", textAlign: "center", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "?"}</div>
                  <div style={{ fontSize: sizes[vi], filter: `drop-shadow(0 0 10px ${p.rankColor || podColors[vi]})` }}>{getAvatar(p.name)}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: p.rankColor || podColors[vi], background: (p.rankColor || podColors[vi]) + "22", padding: "1px 7px", borderRadius: 20 }}>{p.rankName || "—"}</div>
                  <div style={{ width: "100%", height: heights[vi], background: `linear-gradient(180deg,${p.rankColor || podColors[vi]}44,${p.rankColor || podColors[vi]}22)`, border: `2px solid ${p.rankColor || podColors[vi]}66`, borderRadius: "10px 10px 0 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: 8, position: "relative", boxShadow: `0 -4px 16px ${p.rankColor || podColors[vi]}33` }}>
                    <div style={{ fontSize: 20 }}>{trophyIcon(pos)}</div>
                    <div style={{ fontSize: 11, fontWeight: 900, color: "var(--t1)", marginTop: 3 }}>#{pos}</div>
                    <div style={{ fontSize: 10, color: "var(--t3)" }}>{(lbFilter === "score" ? (p.score || 0) : lbFilter === "xp" ? (p.xp || 0) : lbFilter === "streak" ? (p.streak || 0) : (p.done || 0)).toLocaleString()}</div>
                    {p.isMe && <div style={{ position: "absolute", top: -8, right: -8, fontSize: 13, background: accent.v, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>⭐</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rest of rankings */}
      <div style={{ padding: "8px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
        {rest.map((p, i) => {
          const pos = i + 4;
          const val = lbFilter === "score" ? (p.score || 0) : lbFilter === "xp" ? (p.xp || 0) : lbFilter === "streak" ? (p.streak || 0) : (p.done || 0);
          return (
            <div key={p.id || i} onClick={() => setViewPlayer(p)} style={{ display: "flex", alignItems: "center", gap: 12, background: p.isMe ? `${accent.v}14` : "var(--s2)", borderRadius: 14, padding: "11px 13px", border: `1.5px solid ${p.isMe ? accent.v : "var(--b1)"}`, boxShadow: p.isMe ? `0 0 14px ${accent.v}22` : "none", cursor: "pointer" }}>
              <div style={{ width: 26, textAlign: "center", fontSize: 13, fontWeight: 900, color: p.isMe ? accent.v : "var(--t3)", flexShrink: 0 }}>#{pos}</div>
              <div style={{ fontSize: 24, flexShrink: 0 }}>{getAvatar(p.name)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: p.isMe ? accent.v : "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name || "?"}</span>
                  {p.isMe && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 20, background: accent.v + "22", color: accent.v, fontWeight: 800, flexShrink: 0 }}>YOU</span>}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
                   <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "var(--s3)", color: accent.v, fontWeight: 900 }}>LV {Math.max(1, Math.floor((p.xp || 0) / 100) + 1)}</span>
                   <span style={{ fontSize: 10, color: p.rankColor || "var(--t3)", fontWeight: 700 }}>{p.rankIcon || ""} {p.rankName || "—"}</span>
                   <span style={{ fontSize: 9, color: "var(--t3)" }}>🔥 {p.streak || 0}d</span>
                   <span style={{ fontSize: 9, color: "var(--t3)" }}>✅ {p.done || 0}</span>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: p.rankColor || "var(--t1)" }}>{val.toLocaleString()}</div>
                <div style={{ fontSize: 9, color: "var(--t3)" }}>{lbFilter === "score" ? "pts" : lbFilter === "xp" ? "xp" : lbFilter === "streak" ? "days" : "tasks"}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How to climb */}
      <div style={{ margin: "8px 16px 0", background: "var(--s2)", borderRadius: 14, padding: "14px", border: "1px solid var(--b1)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>📈 How to Climb</div>
        {[{ icon: "⚡", text: "Complete tasks for +10–30 XP each" }, { icon: "🔥", text: "Build streaks — exponential score bonus!" }, { icon: "🎯", text: "Finish SMART goals for +150 pts" }, { icon: "🏅", text: "Unlock badges for +30 pts each" }].map(tip => (
          <div key={tip.text} style={{ display: "flex", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--b1)" }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>{tip.icon}</span>
            <span style={{ fontSize: 12, color: "var(--t2)" }}>{tip.text}</span>
          </div>
        ))}
      </div>

      {/* Rank tiers */}
      <div style={{ margin: "10px 16px 16px", background: "var(--s2)", borderRadius: 14, padding: "14px", border: "1px solid var(--b1)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: .5 }}>🔱 Rank Tiers</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
          {RANK_TIERS.map(r => (
            <div key={r.id} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 10, background: "var(--s3)", border: `1px solid ${r.color}33` }}>
              <div style={{ fontSize: 18 }}>{r.icon}</div>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: r.color, marginTop: 2 }}>{r.name}</div>
              <div style={{ fontSize: 8, color: "var(--t3)" }}>{r.minScore.toLocaleString()}+</div>
            </div>
          ))}
        </div>
      </div>

      {/* Change name modal */}
      {showNameModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }} onClick={() => setShowNameModal(false)}>
          <div style={{ background: "var(--s1)", borderRadius: 20, padding: "28px 22px", width: "100%", maxWidth: 340 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, marginBottom: 14, textAlign: "center" }}>Change Display Name</div>
            <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="New display name…" autoFocus
              style={{ width: "100%", background: "var(--s2)", border: `1.5px solid ${accent.v}`, borderRadius: 12, padding: "12px 14px", fontSize: 14, color: "var(--t1)", outline: "none", boxSizing: "border-box" }}
              onKeyDown={e => { if (e.key === "Enter" && nameInput.trim()) { localStorage.setItem("tf_player_name", nameInput.trim()); setMyDisplayName(nameInput.trim()); setShowNameModal(false); } }}
            />
            <button onClick={() => { const n = nameInput.trim(); if (n) { localStorage.setItem("tf_player_name", n); setMyDisplayName(n); setShowNameModal(false); } }} style={{ width: "100%", height: 46, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 13, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", marginTop: 14 }}>Save</button>
          </div>
        </div>
      )}

      {/* Public Profile View Modal */}
      {viewPlayer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 9000, display: "flex", alignItems: "center", justifyItems: "center", padding: 24, backdropFilter: "blur(6px)" }} onClick={() => setViewPlayer(null)}>
          <div style={{ background: "var(--s1)", borderRadius: 24, width: "100%", maxWidth: 320, position: "relative", overflow: "visible", margin: "auto", border: "1px solid var(--b1)" }} onClick={e => e.stopPropagation()}>
            <div style={{ position: "absolute", top: -45, left: "50%", transform: "translateX(-50%)", fontSize: 70, filter: `drop-shadow(0 8px 24px ${viewPlayer.rankColor || "#fff"}60)` }}>{getAvatar(viewPlayer.name)}</div>
            <button style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", background: "var(--s3)", border: "none", fontSize: 14, color: "var(--t2)", display: "flex", alignItems: "center", justifyItems: "center" }} onClick={() => setViewPlayer(null)}>✕</button>
            <div style={{ paddingTop: 40, paddingBottom: 24, paddingLeft: 20, paddingRight: 20, textAlign: "center" }}>
              <div style={{ display: "inline-block", background: (viewPlayer.rankColor || accent.v) + "22", color: viewPlayer.rankColor || accent.v, padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{viewPlayer.rankIcon} {viewPlayer.rankName || "Rank"}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: "var(--t1)", marginBottom: 2 }}>{viewPlayer.name}</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>{viewPlayer.badge ? `🛡 ${viewPlayer.badge}` : "Taskflow Standard User"}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 24 }}>
                <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px 10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 20 }}>🏆</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "var(--t1)", marginTop: 6 }}>{(viewPlayer.score || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>Total Score</div>
                </div>
                <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px 10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 20 }}>🔥</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ff6b6b", marginTop: 6 }}>{viewPlayer.streak || 0}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>Day Streak</div>
                </div>
                <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px 10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 20 }}>✅</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#6bcb77", marginTop: 6 }}>{(viewPlayer.done || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>Tasks Done</div>
                </div>
                <div style={{ background: "var(--s2)", borderRadius: 14, padding: "14px 10px", border: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 20 }}>⚡</div>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "#ffd93d", marginTop: 6 }}>{(viewPlayer.xp || 0).toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>Total XP</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// == SCORE-BASED RANK SYSTEM ==
// Rank is computed from a composite score: XP + streaks + completions + habits + SMART goals
const RANK_TIERS = [
  { id: "iron", name: "Iron", icon: "⚙️", minScore: 0, color: "#8a8a8a", glow: "#8a8a8a66", desc: "Just getting started", badge: "Newcomer" },
  { id: "bronze", name: "Bronze", icon: "🥉", minScore: 200, color: "#cd7f32", glow: "#cd7f3266", desc: "Building momentum", badge: "Task Starter" },
  { id: "silver", name: "Silver", icon: "🥈", minScore: 600, color: "#a8b2bd", glow: "#a8b2bd66", desc: "Consistently showing up", badge: "Consistent" },
  { id: "gold", name: "Gold", icon: "🥇", minScore: 1400, color: "#ffd700", glow: "#ffd70066", desc: "Productivity is a habit", badge: "Habit Forged" },
  { id: "platinum", name: "Platinum", icon: "💠", minScore: 3000, color: "#00d4aa", glow: "#00d4aa66", desc: "Elite focus & discipline", badge: "Focus Elite" },
  { id: "diamond", name: "Diamond", icon: "💎", minScore: 6000, color: "#48dbfb", glow: "#48dbfb66", desc: "Mastery of time & tasks", badge: "Time Master" },
  { id: "master", name: "Master", icon: "🏆", minScore: 11000, color: "#ff9f43", glow: "#ff9f4366", desc: "Legendary productivity", badge: "Legend" },
  { id: "grandmaster", name: "Grandmaster", icon: "🌟", minScore: 20000, color: "#a855f7", glow: "#a855f766", desc: "Beyond human limits 👁", badge: "Grandmaster" },
  { id: "challenger", name: "Challenger", icon: "🔱", minScore: 35000, color: "#ff6b6b", glow: "#ff6b6b66", desc: "The apex. Unchallengeable.", badge: "Apex" },
];

function computeRankScore(xp, streakDays, totalDone, smartGoalsDone, badges) {
  let score = xp;
  score += streakDays * streakDays * 0.8;  // exponential streak bonus
  score += totalDone * 4;
  score += (smartGoalsDone || 0) * 150;
  score += (badges || []).length * 30;
  return Math.round(score);
}

function getRank(score) {
  let rank = RANK_TIERS[0];
  for (const r of RANK_TIERS) { if (score >= r.minScore) rank = r; }
  const nextRank = RANK_TIERS.find(r => r.minScore > score);
  const progress = nextRank
    ? Math.round(((score - rank.minScore) / (nextRank.minScore - rank.minScore)) * 100)
    : 100;
  return { ...rank, nextRank, progress, score };
}

export default function App() {

  // == Register Service Worker for Push Notifications & PWA ==
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(reg => {
        // Schedule daily briefing when permission granted
        function scheduleDailyBriefing() {
          try {
            const mem = JSON.parse(localStorage.getItem("tf_libi_memory") || "{}");
            const wakeStr = mem.wakeTime || "8:00 AM";
            const h = wakeStr.match(/(\d+)/)?.[1] || 8;
            const isPM = wakeStr.includes("PM") && !wakeStr.includes("12");
            const wakeHour = (parseInt(h) + (isPM ? 12 : 0)) % 24;
            const todayTasks = JSON.parse(localStorage.getItem("tf_tasks") || "[]").filter(t => !t.done).length;
            const stats = JSON.parse(localStorage.getItem("tf_gamstats") || "{}");
            const mem2 = JSON.parse(localStorage.getItem("tf_libi_memory") || "{}");
            navigator.serviceWorker.ready.then(sw => {
              sw.active?.postMessage({
                type: "SCHEDULE_DAILY",
                hour: wakeHour,
                taskCount: todayTasks,
                streakDays: stats.streak || 0,
                userName: mem2.name || ""
              });
            });
          } catch (e) { }
        }
        if (Notification.permission === "granted") scheduleDailyBriefing();
        // Save scheduler for when permission is granted later
        window._scheduleDailyBriefing = scheduleDailyBriefing;
      }).catch(() => { });
    }
    // Request notification permission after 5 seconds
    if ("Notification" in window && Notification.permission === "default") {
      setTimeout(async () => {
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      }, 5000);
    }
  }, []);

  // == Settings ==
  // == Onboarding ==
  const [userName, setUserName] = useState(() => localStorage.getItem('tf_username') || '');
  const [hasOnboarded, setHasOnboarded] = useState(() => !!localStorage.getItem("tf_onboarded"));
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardName, setOnboardName] = useState("");
  const [onboardUse, setOnboardUse] = useState("");
  const [onboardWake, setOnboardWake] = useState("7:00 AM");
  const [onboardTask, setOnboardTask] = useState("");

  const [dark, setDark] = useState(() => {
    try {
      const s = localStorage.getItem("tf_dark");
      if (s !== null) return JSON.parse(s);
      // First time: follow system preference
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    } catch (e) { return true; }
  });
  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    function handler(e) {
      // Only auto-follow if user hasn't set a preference
      const saved = localStorage.getItem("tf_dark");
      if (saved === null) setDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const [accentIdx, setAccentIdx] = useState(() => { try { const s = localStorage.getItem("tf_accent"); return s ? JSON.parse(s) : 0; } catch (e) { return 0; } });
  const [customTheme, setCustomTheme] = useState(() => { try { const s = localStorage.getItem("tf_ctheme"); return s ? JSON.parse(s) : null; } catch (e) { return null; } });
  const [appFont, setAppFont] = useState(() => localStorage.getItem("tf_font") || "Plus Jakarta Sans");
  const [coins, setCoins] = useState(() => { try { const s = localStorage.getItem("tf_coins"); return s ? JSON.parse(s) : 0; } catch (e) { return 0; } });
  const [petItems, setPetItems] = useState(() => { try { const s = localStorage.getItem("tf_pet_items"); return s ? JSON.parse(s) : []; } catch (e) { return []; } });
  const [activeItems, setActiveItems] = useState(() => { try { const s = localStorage.getItem("tf_active_items"); return s ? JSON.parse(s) : { hat: null, glass: null }; } catch (e) { return { hat: null, glass: null }; } });
  const [showPetRoom, setShowPetRoom] = useState(false);

  useEffect(() => { localStorage.setItem("tf_coins", JSON.stringify(coins)); }, [coins]);
  useEffect(() => { localStorage.setItem("tf_pet_items", JSON.stringify(petItems)); }, [petItems]);
  useEffect(() => { localStorage.setItem("tf_active_items", JSON.stringify(activeItems)); }, [activeItems]);
  useEffect(() => { if (customTheme) localStorage.setItem("tf_ctheme", JSON.stringify(customTheme)); else localStorage.removeItem("tf_ctheme"); }, [customTheme]);
  useEffect(() => { localStorage.setItem("tf_font", appFont); }, [appFont]);
  useEffect(() => { localStorage.setItem("tf_accent", JSON.stringify(accentIdx)); }, [accentIdx]);
  const [langKey, setLangKey] = useState(() => { try { const s = localStorage.getItem("tf_lang"); return s || "en"; } catch (e) { return "en"; } });
  const [soundOn, setSoundOn] = useState(true);
  
  const myUid = useMemo(() => getMyUid(), []);

  // == Command Palette ==
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteRef = useRef(null);

  // == Time Tracking ==
  const [timeEntries, setTimeEntries] = useState(() => { try { return JSON.parse(localStorage.getItem("tf_time") || "[]"); } catch (e) { return []; } });
  const [activeTimer, setActiveTimer] = useState(null); // {taskId, startedAt}
  const [timerTick, setTimerTick] = useState(0);
  useEffect(() => {
    if (!activeTimer) return;
    const iv = setInterval(() => setTimerTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, [activeTimer]);
  function startTimer(taskId) {
    if (activeTimer) stopTimer();
    setActiveTimer({ taskId, startedAt: Date.now() });
    showNotif("⏱ Timer started!", "Tracking time on task");
  };
  function stopTimer() {
    if (!activeTimer) return;
    const duration = Math.floor((Date.now() - activeTimer.startedAt) / 1000);
    if (duration > 5) {
      setTimeEntries(e => [...e, { id: uid(), taskId: activeTimer.taskId, duration, date: todayStr(), startedAt: activeTimer.startedAt }]);
      showNotif("⏱ Time logged!", `${Math.floor(duration / 60)}m ${duration % 60}s recorded`);
    }
    setActiveTimer(null);
    setTimerTick(0);
  };
  const getTaskTime = (taskId) => timeEntries.filter(e => e.taskId === taskId).reduce((a, e) => a + e.duration, 0);
  const fmtTime = (s) => s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;

  // == Task Templates ==
  const DEFAULT_TEMPLATES = [
    { id: "weekly_review", icon: "📋", name: "Weekly Review", tasks: ["Review goals progress", "Clear email inbox", "Update task list", "Plan next week's priorities", "Reflect on wins & lessons"] },
    { id: "project_kick", icon: "🚀", name: "Project Kickoff", tasks: ["Define project scope", "Set milestones & deadlines", "Assign team roles", "Create initial task breakdown", "Schedule kickoff meeting"] },
    { id: "travel_prep", icon: "✈️", name: "Travel Prep", tasks: ["Book flights & hotels", "Pack luggage checklist", "Sort travel documents", "Notify bank of travel", "Download offline maps"] },
    { id: "deep_work", icon: "🧠", name: "Deep Work Session", tasks: ["Clear desk & distractions", "Set 90-min focus timer", "Work on top priority task", "No phone or social media", "Review progress after session"] },
  ];
  const [templates, setTemplates] = useState(() => { try { return JSON.parse(localStorage.getItem("tf_templates") || JSON.stringify(DEFAULT_TEMPLATES)); } catch (e) { return DEFAULT_TEMPLATES; } });
  const [showTemplates, setShowTemplates] = useState(false);
  function applyTemplate(tpl) {
    const newTasks = tpl.tasks.map(title => ({ id: uid(), title, notes: "", priority: "medium", categoryId: "work", due: "", photo: null, tags: [], subtasks: [], starred: false, recurring: "never", reminder: false, reminderTime: "09:00", reminderDate: "", alarmTone: "classic", profileId: activeProfile, done: false, createdAt: Date.now() }));
    setTasks(ts => [...newTasks, ...ts]);
    showNotif(`🚀 ${tpl.name}`, `${tpl.tasks.length} tasks added!`);
    play("add"); awardXP(15, "Template applied");
    setShowTemplates(false); setTab("tasks"); setShowDone(false); setShowStarred(false);
  };

  // == Focus Mode ==
  const [focusMode, setFocusMode] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [focusNotes, setFocusNotes] = useState("");

  // == Task Templates ==
  const TASK_TEMPLATES = [
    { id: "weekly_review", icon: "📋", name: "Weekly Review", desc: "End-of-week reflection and planning", color: "#7c6dfa", tasks: ["Review what I accomplished this week", "Clear inbox to zero", "Update project statuses", "Plan top 3 priorities for next week", "Review and adjust goals", "Schedule important meetings"] },
    { id: "project_kick", icon: "🚀", name: "Project Kickoff", desc: "Everything you need to start strong", color: "#ff9f43", tasks: ["Define project goals and success metrics", "Identify key stakeholders", "Create project timeline", "Set up project folder/workspace", "Schedule kickoff meeting", "Define communication channels", "Identify risks and mitigation plan"] },
    { id: "morning_routine", icon: "🌅", name: "Morning Routine", desc: "Start your day right", color: "#ffd93d", tasks: ["Drink a full glass of water", "5-minute meditation or breathing", "Review today's top 3 tasks", "Exercise for 20 minutes", "Healthy breakfast", "Quick journal entry"] },
    { id: "travel_prep", icon: "✈️", name: "Travel Prep", desc: "Never forget anything again", color: "#48dbfb", tasks: ["Book flights and accommodation", "Pack clothes and essentials", "Download offline maps", "Notify bank of travel", "Charge all devices", "Print/save booking confirmations", "Set up out-of-office replies"] },
    { id: "deep_work", icon: "🧠", name: "Deep Work Session", desc: "Eliminate distractions and focus", color: "#6bcb77", tasks: ["Clear your desk completely", "Put phone on Do Not Disturb", "Close all browser tabs except task", "Set a 90-minute focus timer", "Prepare water and snacks", "Write down today's single focus goal", "Review session notes afterward"] },
    { id: "health_week", icon: "💪", name: "Health Week", desc: "A week of wellness habits", color: "#ff6b9d", tasks: ["Exercise Monday Wednesday Friday", "Meal prep on Sunday", "Sleep by 10:30pm every night", "Drink 8 glasses of water daily", "No social media after 9pm", "30-minute walk every lunch", "Log mood and energy daily"] },
  ];
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  // First launch detection
  useEffect(() => {
    const launched = localStorage.getItem("tf_launched");
    if (!launched) {
      localStorage.setItem("tf_launched", "1");
      setTimeout(() => setShowTemplateModal(true), 1200);
    }
  }, []);

  // == Daily Digest ==
  // == ✦ AI NATURAL LANGUAGE TASK EDITOR ==
  const [showAiNL, setShowAiNL] = useState(false);
  const [aiNLInput, setAiNLInput] = useState("");
  const [aiNLResult, setAiNLResult] = useState(null);
  const [aiNLLoading, setAiNLLoading] = useState(false);

  // Offline natural language parser -- no API needed
  function parseNaturalLanguageCommand(text) {
    const lower = text.toLowerCase().trim();
    const today = todayStr();
    const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
    const nextWeek = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })();

    // Detect action type
    let action = null; let affected = []; let preview = "";

    // "move X tasks to tomorrow/today/next week"
    if (/(move|reschedule|push|shift)/.test(lower)) {
      const dateTo = /tomorrow/.test(lower) ? tomorrow : /next week/.test(lower) ? nextWeek : /today/.test(lower) ? today : null;
      if (dateTo) {
        const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
        const priorityMatch = lower.match(/\b(high|medium|low)\b/);
        const searchTerms = lower.replace(/(move|reschedule|push|shift|tomorrow|today|next week|all|my|tasks?|to)/g, '').trim().split(/\s+/).filter(w => w.length > 2);
        affected = profileTasks.filter(t => {
          if (t.done) return false;
          if (catMatch && t.categoryId !== catMatch[1]) return false;
          if (priorityMatch && t.priority !== priorityMatch[1]) return false;
          if (/all/.test(lower)) return true;
          return searchTerms.some(term => t.title.toLowerCase().includes(term));
        }).slice(0, 20);
        if (affected.length > 0) {
          action = { type: 'reschedule', dateTo };
          preview = `Move ${affected.length} task${affected.length > 1 ? 's' : ''} to ${dateTo === tomorrow ? 'tomorrow' : dateTo === today ? 'today' : 'next week'}`;
        }
      }
    }

    // "complete/done/finish all X tasks"
    else if (/(complete|done|finish|mark.*done|check off)/.test(lower)) {
      const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
      const priorityMatch = lower.match(/\b(high|medium|low)\b/);
      affected = profileTasks.filter(t => {
        if (t.done) return false;
        if (catMatch && t.categoryId !== catMatch[1]) return false;
        if (priorityMatch && t.priority !== priorityMatch[1]) return false;
        if (/all/.test(lower)) return true;
        const words = lower.replace(/(complete|done|finish|mark|all|my|tasks?)/g, '').trim().split(/\s+/).filter(w => w.length > 2);
        return words.some(w => t.title.toLowerCase().includes(w));
      }).slice(0, 20);
      if (affected.length > 0) { action = { type: 'complete' }; preview = `Complete ${affected.length} task${affected.length > 1 ? 's' : ''}`; }
    }

    // "star/favourite all X tasks"
    else if (/(star|favourite|favorite|prioritize)/.test(lower)) {
      affected = profileTasks.filter(t => !t.done && !t.starred);
      if (/high|urgent/.test(lower)) affected = affected.filter(t => t.priority === 'high');
      affected = affected.slice(0, 10);
      if (affected.length > 0) { action = { type: 'star' }; preview = `Star ${affected.length} task${affected.length > 1 ? 's' : ''}`; }
    }

    // "set X tasks to high/medium/low priority"
    else if (/(set|change|make).*priority|priority.*(set|change|make)/.test(lower)) {
      const priority = /high/.test(lower) ? 'high' : /low/.test(lower) ? 'low' : 'medium';
      const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
      affected = profileTasks.filter(t => !t.done && (catMatch ? t.categoryId === catMatch[1] : true) && t.priority !== priority).slice(0, 20);
      if (affected.length > 0) { action = { type: 'priority', priority }; preview = `Set ${affected.length} task${affected.length > 1 ? 's' : ''} to ${priority} priority`; }
    }

    // "delete/remove completed tasks"
    else if (/(delete|remove|clear).*done|clear.*completed/.test(lower)) {
      affected = profileTasks.filter(t => t.done);
      if (affected.length > 0) { action = { type: 'delete' }; preview = `Delete ${affected.length} completed task${affected.length > 1 ? 's' : ''}`; }
    }

    // If action found but no tasks matched, give helpful message
    if (action && affected.length === 0) return { error: `No matching tasks found! Make sure you have tasks that fit that description. Try being more specific or say "all" to target everything.` };
    if (!action) {
      // Try fuzzy: any word match against task titles
      const words = lower.split(/\s+/).filter(w => w.length > 3);
      const fuzzy = profileTasks.filter(t => !t.done && words.some(w => t.title.toLowerCase().includes(w)));
      if (fuzzy.length > 0 && /tomorrow|today|next week|monday|friday/.test(lower)) {
        const dateTo = /tomorrow/.test(lower) ? tomorrow : /next week/.test(lower) ? nextWeek : today;
        return { action: { type: 'reschedule', dateTo }, affected: fuzzy, preview: `Move ${fuzzy.length} matching task${fuzzy.length > 1 ? 's' : ''} to ${/tomorrow/.test(lower) ? 'tomorrow' : /next week/.test(lower) ? 'next week' : 'today'}` };
      }
      return { error: `Hmm, I didn't catch that. Try:\n• "Move my work tasks to tomorrow"\n• "Complete all high priority tasks"\n• "Set learning tasks to high priority"\n• "Delete completed tasks"\n• "Star all overdue tasks"` };
    }
    return { action, affected, preview };
  };

  function executeNLCommand() {
    if (!aiNLResult || !aiNLResult.action) return;
    const { action, affected } = aiNLResult;
    if (action.type === 'reschedule') setTasks(ts => ts.map(t => affected.find(a => a.id === t.id) ? { ...t, due: action.dateTo } : t));
    else if (action.type === 'complete') { affected.forEach(t => { if (!t.done) { play("complete"); awardXP(t.priority === 'high' ? 30 : t.priority === 'medium' ? 20 : 10, "Bulk complete"); } }); setTasks(ts => ts.map(t => affected.find(a => a.id === t.id) ? { ...t, done: true } : t)); }
    else if (action.type === 'star') setTasks(ts => ts.map(t => affected.find(a => a.id === t.id) ? { ...t, starred: true } : t));
    else if (action.type === 'priority') setTasks(ts => ts.map(t => affected.find(a => a.id === t.id) ? { ...t, priority: action.priority } : t));
    else if (action.type === 'delete') setTasks(ts => ts.filter(t => !affected.find(a => a.id === t.id)));
    showNotif("✦ Done!", aiNLResult.preview);
    play("add"); awardXP(10, "AI command executed");
    setAiNLInput(""); setAiNLResult(null); setShowAiNL(false);
    setTab("tasks"); setShowDone(false); setShowStarred(false);
  };

  // == 🧠 SMART DEADLINE SUGGESTIONS (offline AI) ==
  function getDeadlineSuggestions() {
    const suggestions = [];
    // Analyse which categories typically get completed late
    const completedWithDue = tasks.filter(t => t.done && t.due && t.createdAt);
    const catLateness = {};
    completedWithDue.forEach(t => {
      if (!catLateness[t.categoryId]) catLateness[t.categoryId] = { late: 0, total: 0 };
      catLateness[t.categoryId].total++;
      if (new Date(t.createdAt) > new Date(t.due)) catLateness[t.categoryId].late++;
    });
    Object.entries(catLateness).forEach(([catId, data]) => {
      if (data.total >= 3 && data.late / data.total >= 0.5) {
        const cat = categories.find(c => c.id === catId);
        if (!cat) return;
        const lateRate = Math.round((data.late / data.total) * 100);
        // Find active tasks in this category with due dates too soon
        const activeCatTasks = profileTasks.filter(t => !t.done && t.categoryId === catId && t.due);
        activeCatTasks.forEach(task => {
          const daysLeft = Math.ceil((new Date(task.due) - new Date()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 3 && daysLeft >= 0) {
            suggestions.push({
              taskId: task.id, taskTitle: task.title, catName: cat.name, catIcon: cat.icon,
              lateRate, daysLeft,
              suggestion: `You complete ${cat.icon} ${cat.name} tasks late ${lateRate}% of the time. Consider adding 2-3 extra days.`,
              newDue: (() => { const d = new Date(task.due); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 10); })()
            });
          }
        });
      }
    });
    return suggestions.slice(0, 3);
  };

  const [showThemeCreator, setShowThemeCreator] = useState(false);
  const [customHue, setCustomHue] = useState(260);
  function hueToHex(h) {
    const f = (n, k = (n + h / 30) % 12) => 0.5 - 0.5 * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    const r = Math.round(f(0) * 255), g = Math.round(f(8) * 255), b = Math.round(f(4) * 255);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // == Universal Search ==
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // == Daily Digest ==
  const [showDigest, setShowDigest] = useState(false);


  // == Gamification State ==


  // == AI Suggestions State ==
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

  const [musicOn, setMusicOn] = useState(false);
  const [musicTrack, setMusicTrack] = useState("lofi");
  const musicRef = useRef(null);

  useEffect(() => {
    if (musicOn) { startMusic(musicTrack); }
    else { stopMusic(); }
    return () => stopMusic();
  }, [musicOn, musicTrack]);
  const [notifsOn, setNotifsOn] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [locked, setLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMode, setPinMode] = useState(null); // "set"|"confirm"|"unlock"
  const [pinTemp, setPinTemp] = useState("");
  // == Voice AI ==
  const [isVoiceTaskListening, setIsVoiceTaskListening] = useState(false);
  function startVoiceAI() {
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      showNotif("Security Alert", "Voice AI requires HTTPS when accessing from network IP.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return showNotif('🎙️ Voice AI not supported', 'Please use Chrome or Safari.');
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onstart = () => { setIsVoiceTaskListening(true); play('tap'); haptic('light'); };
    rec.onresult = (e) => {
      const txt = e.results[0][0].transcript.toLowerCase();
      let d = todayStr();
      if (txt.includes('tomorrow')) { const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1); d = tmrw.toISOString().slice(0, 10); }
      const cleaned = txt.replace(/(remind me to|to|tomorrow|today|at \\d+ (am|pm))/gi, '').trim();
      if (!cleaned) return;
      const tId = Math.random().toString(36).slice(2,10);
      const nt = { id: tId, title: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), notes: 'Created via Voice AI 🎙️', priority: 'medium', categoryId: 'work', due: d, photo: null, tags: [], subtasks: [], starred: false, recurring: 'never', reminder: false, profileId: activeProfile, done: false, createdAt: Date.now() };
      setTasks(ts => [nt, ...ts]);
      showNotif('✨ Voice task added!', nt.title);
      play('success'); haptic('heavy');
    };
    rec.onerror = () => { setIsVoiceTaskListening(false); showNotif('🤔 Didn\'t catch that', 'Try speaking again.'); };
    rec.onend = () => setIsVoiceTaskListening(false);
    rec.start();
  }


  // == Data ==
  // == Tasks & Productivity Hook ==
  const {
      tasks, setTasks, categories, setCategories,
      profiles, setProfiles, activeProfile, setActiveProfile,
      profileTasks, updateTask, toggleTask, deleteTask
  } = useTasks();

  const [goals, setGoals] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_goals")||"[]");}catch(e){return [];}});
  const [habits, setHabits] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_habits")||"[]");}catch(e){return [];}});
  const [xp, setXp] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_xp")||"0");}catch(e){return 0;}});
  const [gamStats, setGamStats] = useState({totalDone:0, highDone:0, streak:0, goalsCompleted:0, habitCompletions:0, notesCreated:0, longNoteCreated:false, sharedTasks:0, overdueCleared:0, perfectTasks:0, plannerUses:0, focusSessions:0, comebackDays:0});
  const [earnedBadges, setEarnedBadges] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_badges")||"[]");}catch(e){return [];}});
  const [libiMemory, setLibiMemory] = useState(()=>{try{const s=localStorage.getItem("tf_libi_memory");return s?JSON.parse(s):{facts:[],name:"",wakeTime:"",occupation:"",timezone:""};}catch(e){return {facts:[],name:"",wakeTime:"",occupation:"",timezone:""};}});
  const [xpAnim, setXpAnim] = useState(null);
  const [newBadgeAnim, setNewBadgeAnim] = useState(null);
  const [calForm, setCalForm] = useState(null);
  const [showGamificationModal, setShowGamificationModal] = useState(false);

  const activeProfileObj = profiles.find(p => p.id === activeProfile) || profiles[0];
  const accent = customTheme || ACCENTS[accentIdx] || ACCENTS[0];
  const myLevel = typeof getLevel === "function" ? getLevel(xp) : { next: null, progress: 100, name: "Beginner", icon: "🌱" };
  const level = myLevel;
  const recentBadges = [...earnedBadges].reverse().slice(0, 3);
  const unreadCount = 0;

  function play(type = "tap") {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      if (type === "complete") { o.frequency.setValueAtTime(523, ctx.currentTime); o.frequency.setValueAtTime(659, ctx.currentTime + 0.1); o.frequency.setValueAtTime(784, ctx.currentTime + 0.2); g.gain.setValueAtTime(0.3, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5); o.start(); o.stop(ctx.currentTime + 0.5); }
      else if (type === "add") { o.frequency.setValueAtTime(440, ctx.currentTime); o.frequency.setValueAtTime(554, ctx.currentTime + 0.15); g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4); o.start(); o.stop(ctx.currentTime + 0.4); }
      else if (type === "delete") { o.frequency.setValueAtTime(300, ctx.currentTime); o.frequency.setValueAtTime(200, ctx.currentTime + 0.1); g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3); o.start(); o.stop(ctx.currentTime + 0.3); }
      else if (type === "tap") { o.frequency.setValueAtTime(800, ctx.currentTime); g.gain.setValueAtTime(0.1, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1); o.start(); o.stop(ctx.currentTime + 0.1); }
    } catch (e) { }
  }
  function haptic(type = "light") {
    try {
      if (!navigator.vibrate) return;
      if (type === "light") navigator.vibrate(12);
      else if (type === "medium") navigator.vibrate(35);
      else if (type === "heavy") navigator.vibrate([60, 30, 60]);
      else if (type === "success") navigator.vibrate([20, 10, 20, 10, 50]);
      else if (type === "error") navigator.vibrate([80, 40, 80]);
    } catch (e) { }
  }
  function showNotif(title, desc) {}
  function awardXP(amount, reason) { 
      setXp(p=>p+amount); 
      // Taskflow Coins: 1 coin per 10 XP
      const coinsEarned = Math.floor(amount / 10);
      if (coinsEarned > 0) setCoins(c => c + coinsEarned);

      setXpAnim({ amount, reason, id: Math.random() }); 
      setTimeout(() => setXpAnim(null), 2500); 
  }
  function saveTask(taskData) { updateTask(taskData.id, taskData); }


  // == Wellness & Health Hook ==
  const wellness = useWellness(activeProfile);
  const { 
      moods, setMoods, sleepLogs, setSleepLogs, calorieLogs, setCalorieLogs,
      waterLogs, setWaterLogs, saveMood, saveSleep, saveCalorie, addWater,
      getTodayWater, sleepGoalHrs, setSleepGoalHrs, calorieGoal, setCalorieGoal
  } = wellness;
  const [sleepForm, setSleepForm] = useState({ duration: 8, quality: 3, notes: "" });
  const [showSleepForm, setShowSleepForm] = useState(false);

  // == Navigation ==
  const [tab, setTab] = useState("tasks");
  const [viewMode, setViewMode] = useState("list");
  const [sort, setSort] = useState("created");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [energyFilter, setEnergyFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showStarred, setShowStarred] = useState(false);

  // == Drag & Drop ==
  const [dragId, setDragId] = useState(null);       // id of card being dragged
  const [dragOverId, setDragOverId] = useState(null); // id of card being hovered over
  const [taskOrder, setTaskOrder] = useState([]);    // manual order overrides (array of ids)
  const dragNode = useRef(null);

  // Apply manual order on top of sorted viewTasks
  function applyManualOrder(tasksArr, order) {
    if (!order || order.length === 0) return tasksArr;
    const orderMap = new Map(order.map((id, i) => [id, i]));
    const inOrder = tasksArr.filter(t => orderMap.has(t.id));
    const notInOrder = tasksArr.filter(t => !orderMap.has(t.id));
    inOrder.sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999));
    return [...inOrder, ...notInOrder];
  }

  function handleDragStart(e, taskId) {
    setDragId(taskId);
    dragNode.current = e.currentTarget;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", taskId);
    // slight delay so the ghost image renders before opacity change
    setTimeout(() => { if (dragNode.current) dragNode.current.style.opacity = "0.4"; }, 0);
    haptic("light");
  }

  function handleDragEnter(e, taskId) {
    e.preventDefault();
    if (taskId !== dragId) setDragOverId(taskId);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e, targetId) {
    e.preventDefault();
    if (!dragId || dragId === targetId) { cleanupDrag(); return; }
    // Reorder: move dragId to position of targetId
    setTaskOrder(prev => {
      // Build current ordered list from viewTasks
      const current = applyManualOrder(
        tasks.filter(t => t.profileId === activeProfile),
        prev
      ).map(t => t.id);
      const fromIdx = current.indexOf(dragId);
      const toIdx = current.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const reordered = [...current];
      reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, dragId);
      return reordered;
    });
    haptic("success");
    cleanupDrag();
  }

  function handleDragEnd() { cleanupDrag(); }

  function cleanupDrag() {
    if (dragNode.current) dragNode.current.style.opacity = "";
    dragNode.current = null;
    setDragId(null);
    setDragOverId(null);
  }

  // Touch-based drag (mobile)
  const touchDragRef = useRef({ active: false, startId: null, startY: 0, clone: null });

  function handleTouchDragStart(e, taskId) {
    // Only start drag if holding for 350ms (to not conflict with swipe)
    const touch = e.touches[0];
    touchDragRef.current = { active: false, startId: taskId, startY: touch.clientY, startX: touch.clientX, clone: null, timer: null };
    touchDragRef.current.timer = setTimeout(() => {
      touchDragRef.current.active = true;
      haptic("medium");
      // Create ghost clone
      const el = e.currentTarget.closest(".task-swipe-wrap") || e.currentTarget;
      const rect = el.getBoundingClientRect();
      const clone = el.cloneNode(true);
      clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;opacity:0.85;z-index:9999;pointer-events:none;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.4);transform:scale(1.03);transition:none;`;
      document.body.appendChild(clone);
      touchDragRef.current.clone = clone;
      touchDragRef.current.el = el;
      touchDragRef.current.offsetY = touch.clientY - rect.top;
      el.style.opacity = "0.35";
      setDragId(taskId);
    }, 350);
  }

  function handleTouchDragMove(e) {
    if (!touchDragRef.current.active) {
      // Cancel timer if moved too much before 350ms
      const dx = Math.abs(e.touches[0].clientX - touchDragRef.current.startX);
      const dy = Math.abs(e.touches[0].clientY - touchDragRef.current.startY);
      if (dx > 8 || dy > 8) { clearTimeout(touchDragRef.current.timer); return; }
      return;
    }
    e.preventDefault();
    const touch = e.touches[0];
    if (touchDragRef.current.clone) {
      touchDragRef.current.clone.style.top = `${touch.clientY - touchDragRef.current.offsetY}px`;
    }
    // Find element under finger (excluding clone)
    const els = document.elementsFromPoint(touch.clientX, touch.clientY);
    const wrap = els.find(el => el.classList.contains("task-swipe-wrap") && el !== touchDragRef.current.el);
    if (wrap) {
      const id = wrap.dataset.taskid;
      if (id && id !== dragId) setDragOverId(id);
    }
  }

  function handleTouchDragEnd(e) {
    clearTimeout(touchDragRef.current.timer);
    if (!touchDragRef.current.active) return;
    const targetId = dragId !== touchDragRef.current.startId ? dragOverId : null;
    if (targetId && targetId !== touchDragRef.current.startId) {
      // Perform reorder
      const dropTargetId = dragOverId;
      setTaskOrder(prev => {
        const current = applyManualOrder(
          tasks.filter(t => t.profileId === activeProfile),
          prev
        ).map(t => t.id);
        const fromIdx = current.indexOf(touchDragRef.current.startId);
        const toIdx = current.indexOf(dropTargetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const reordered = [...current];
        reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, touchDragRef.current.startId);
        return reordered;
      });
      haptic("success");
    }
    // Cleanup
    if (touchDragRef.current.clone) { touchDragRef.current.clone.remove(); touchDragRef.current.clone = null; }
    if (touchDragRef.current.el) { touchDragRef.current.el.style.opacity = ""; }
    touchDragRef.current = { active: false, startId: null, startY: 0, clone: null };
    setDragId(null);
    setDragOverId(null);
  }

  // == Modals ==
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTaskObj, setEditTaskObj] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const detailTask = tasks.find(t => t.id === detailTaskId) || null;
  const [showCatModal, setShowCatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // == Calendar ==
  const now = new Date(); const [calYear, setCalYear] = useState(now.getFullYear()); const [calMonth, setCalMonth] = useState(now.getMonth()); const [selDate, setSelDate] = useState(todayStr());

  // == IST clock removed ==

  // == Notification ==
  const [notif, setNotif] = useState(null);

  // == Streak Protection -- Duolingo style ==
  const [streakShield, setStreakShield] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tf_streak_shield") || "0"); } catch { return 0; }
  });
  const [showStreakModal, setShowStreakModal] = useState(false);

  useEffect(() => {
    function checkStreak() {
      const streak = gamStats.streak || 0;
      if (streak < 1) return;
      const today = new Date();
      const h = today.getHours();
      const todayKey = today.toISOString().slice(0, 10);
      const doneToday = tasks.filter(t => t.done && t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === todayKey).length;

      // Morning motivation (8-9am)
      if (h >= 8 && h < 9) {
        const key = "streak_morning_" + todayKey;
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          const tasksToday = tasks.filter(t => !t.done && t.profileId === activeProfile).length;
          showNotif(`🔥 ${streak} day streak!`, `Good morning! You have ${tasksToday} tasks today. Keep the streak alive!`);
        }
      }
      // Evening warning (7-9pm)
      if (h >= 19 && h < 21) {
        const key = "streak_eve_" + todayKey;
        if (doneToday === 0 && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          showNotif(`⚠️ Streak in danger!`, `Your ${streak}-day streak ends at midnight! Complete 1 task now 🔥`);
          haptic("heavy");
          setShowStreakModal(true);
        }
      }
      // Late night (10pm) final warning
      if (h >= 22 && h < 23) {
        const key = "streak_late_" + todayKey;
        if (doneToday === 0 && !sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          showNotif(`🚨 Last chance!`, `2 hours left to save your ${streak}-day streak!`);
          haptic("heavy");
        }
      }
    }
    const iv = setInterval(checkStreak, 30 * 60 * 1000); // every 30 min
    checkStreak();
    return () => clearInterval(iv);
  }, [tasks, gamStats.streak, activeProfile]);


  // == Streak Protection: warn before streak breaks ==
  useEffect(() => {
    const checkStreak = () => {
      const streak = gamStats?.streak || 0;
      if (streak < 2) return;
      const now = new Date();
      const h = now.getHours();
      if (h >= 18 && h < 21) {
        const todayKey = todayStr();
        const warned = sessionStorage.getItem("streak_warned_" + todayKey);
        const doneToday = tasks.filter(t => t.done && t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === todayKey).length;
        if (doneToday === 0 && !warned) {
          sessionStorage.setItem("streak_warned_" + todayKey, "1");
          showNotif(`🔥 Streak at risk!`, `Complete a task before midnight to keep your ${streak}-day streak alive!`);
          haptic("heavy");
        }
      }
    };
    const iv = setInterval(checkStreak, 3600000);
    checkStreak();
    return () => clearInterval(iv);
  }, [tasks, gamStats]);


  // ── Restore from IndexedDB if localStorage was cleared ──
  useEffect(() => {
    const hasLocalData = localStorage.getItem("tf_tasks");
    if (!hasLocalData) {
      idbGet("tf_backup").then(raw => {
        if (!raw) return;
        try {
          const backup = JSON.parse(raw);
          if (backup.tasks?.length) {
            setTasks(backup.tasks);
            if (backup.goals?.length) setGoals(backup.goals);
            if (backup.habits?.length) setHabits(backup.habits);
            if (backup.moods?.length) setMoods(backup.moods);
            if (backup.notes?.length) setNotes(backup.notes);
            if (backup.finances?.length) setFinances(backup.finances);
            if (backup.categories?.length) setCategories(backup.categories);
            if (backup.profiles?.length) setProfiles(backup.profiles);
            showNotif("✅ Data restored!", "Your tasks have been recovered 🎉");
          }
        } catch (e) { }
      }).catch(() => { });
    }
  }, []);



  // == Alarm / Reminder System ==
  const [alarmTask, setAlarmTask] = useState(null);
  const [alarmSnoozed, setAlarmSnoozed] = useState(false);
  const firedAlarmsRef = useRef(new Set());

  // Check for alarms every minute
  useEffect(() => {
    function check() {
      const now = new Date();
      const todayDate = now.toISOString().slice(0, 10);
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const timeNow = `${hh}:${mm}`;
      tasks.forEach(task => {
        if (!task.reminder || task.done) return;
        const remDate = task.reminderDate || task.due || todayDate;
        const remTime = task.reminderTime || "09:00";
        const key = `${task.id}-${remDate}-${remTime}`;
        if (remDate === todayDate && remTime === timeNow && !firedAlarmsRef.current.has(key)) {
          firedAlarmsRef.current.add(key);
          setAlarmTask(task);
          setAlarmSnoozed(false);
          try { playAlarmTone(task.alarmTone || "classic"); } catch (e) { }
          // Send browser/OS notification (works when tab is in background)
          try {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("⏰ Taskflow Reminder", {
                body: task.title + (task.notes ? "\n" + task.notes : ""),
                icon: "/favicon.ico",
                badge: "/favicon.ico",
                tag: "taskflow-" + task.id,
                renotify: true,
                requireInteraction: true,
              });
            }
          } catch (e) { }
        }
      });
    };
    check();
    const iv = setInterval(check, 10000);
    return () => clearInterval(iv);
  }, [tasks]);

  function handleDismiss() { stopAlarmSound(); setAlarmTask(null); setAlarmSnoozed(false); try { haptic('medium'); } catch (e) { } };
  function handleSnooze() {
    stopAlarmSound();
    const snoozeTask = alarmTask;
    setAlarmTask(null);
    setTimeout(() => { setAlarmTask(snoozeTask); setAlarmSnoozed(true); try { playAlarmTone(snoozeTask.alarmTone || "classic"); } catch (e) { } }, 5 * 60 * 1000);
  };
  function toggle(id, e) {
    haptic(tasks.find(t => t.id === id)?.done ? 'light' : 'success');
    if (e) e.stopPropagation();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const nd = !task.done;
    if (nd) {
      play("complete");
      showNotif("🎉 Task Completed!", task.title);
      if (task.priority === "high") setTimeout(fireConfetti, 100);
      const xpGain = task.priority === "high" ? 30 : task.priority === "medium" ? 20 : 10;
      awardXP(xpGain, "Task completed");
      // == Auto-recreate recurring tasks ==
      if (task.recurring && task.recurring !== "never") {
        const getNext = (due, freq) => {
          const d = new Date(due || new Date());
          if (freq === "daily") d.setDate(d.getDate() + 1);
          else if (freq === "weekly") d.setDate(d.getDate() + 7);
          else if (freq === "monthly") d.setMonth(d.getMonth() + 1);
          else if (freq === "3x") d.setDate(d.getDate() + 2);
          return d.toISOString().slice(0, 10);
        };
        const nextDue = getNext(task.due, task.recurring);
        const nextTask = {
          ...task, id: uid(), done: false, createdAt: Date.now(),
          due: nextDue, reminder: false, subtasks: task.subtasks.map(s => ({ ...s, done: false }))
        };
        setTimeout(() => {
          setTasks(ts => [nextTask, ...ts]);
          showNotif("🔄 Recurring task recreated", `"${task.title}" scheduled for ${nextDue}`);
        }, 800);
      }
    }
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: nd, completedAt: nd ? Date.now() : null } : t));
  };

  function handleMarkDone() { if (alarmTask) { try { toggle(alarmTask.id); } catch (e) { } } stopAlarmSound(); setAlarmTask(null); setAlarmSnoozed(false); };


  // == Task form ==
  const blankForm = { title: "", notes: "", priority: "medium", categoryId: "work", due: "", photo: null, tags: [], subtasks: [], starred: false, recurring: "never", reminder: false, reminderTime: "09:00", reminderDate: "", alarmTone: "classic", profileId: activeProfile, timeEstimate: 0, dependsOn: [] };
  const [form, setForm] = useState(blankForm);
  const [tagInput, setTagInput] = useState(""); const [subInput, setSubInput] = useState("");

  // == Cat form ==
  const [catForm, setCatForm] = useState({ name: "", icon: "🎯", color: "#7c6dfa" });
  const [editCatId, setEditCatId] = useState(null);

  // == Profile form ==
  const [profForm, setProfForm] = useState({ name: "", icon: "👤", color: "#7c6dfa" });
  const [editProfileId, setEditProfileId] = useState(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(null); // profile id

  const fileRef = useRef(null);
  const t = LANGS[langKey]?.t || LANGS.en.t;

  // == CSS injection (after all theme states are ready) ==
  useEffect(() => {
    let el = document.getElementById("tf-css");
    if (!el) { el = document.createElement("style"); el.id = "tf-css"; document.head.appendChild(el); }
    el.textContent = makeCSS(dark, accent.v, accent.g, langKey === "ar", appFont);
  }, [dark, customTheme, accentIdx, langKey, appFont]);

  // == Smart scroll: logo hides, search expands -- topbar always visible ==
  useEffect(() => {
    let lastY = 0;
    let ticking = false;

    function onScroll(e) {
      const el = e.target;
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = el.scrollTop;
          const dy = y - lastY;
          const topbar = document.querySelector('.topbar');
          const botnav = document.querySelector('.bot-nav');

          if (dy > 6 && y > 50) {
            // Scrolling DOWN -- hide logo, search expands to fill space
            topbar?.classList.add('logo-hidden');
            botnav?.classList.add('hide-bot');
          } else if (dy < -4) {
            // Scrolling UP -- logo slides back in, search shrinks
            topbar?.classList.remove('logo-hidden');
            botnav?.classList.remove('hide-bot');
          }

          // At very top -- always show logo
          if (y < 10) {
            topbar?.classList.remove('logo-hidden');
            botnav?.classList.remove('hide-bot');
          }

          lastY = y;
          ticking = false;
        });
        ticking = true;
      }
    }

    // Attach to all scrollable content areas
    const contents = document.querySelectorAll('.content');
    contents.forEach(c => c.addEventListener('scroll', onScroll, { passive: true }));
    return () => contents.forEach(c => c.removeEventListener('scroll', onScroll));
  }, [tab]);

  // == Enhanced Notification Engine ==
  const [snoozedTasks, setSnoozedTasks] = useState(() => { try { return JSON.parse(localStorage.getItem('tf_snoozed')) || {}; } catch { return {}; } });

  

  function handleSnooze(task, minutes) {
    const next = new Date(Date.now() + minutes * 60000);
    const updated = { ...snoozedTasks, [task.id]: next.toISOString() };
    setSnoozedTasks(updated);
    localStorage.setItem('tf_snoozed', JSON.stringify(updated));
    setNotif(null);
    showNotif("💤 Snoozed", `Reminding you in ${minutes >= 60 ? (minutes / 60) + 'h' : minutes + 'm'}`);
  }

  // == Smart Reminders Loop ==
  useEffect(() => {
    if (!notifsOn) return;

    // Check immediately on load for overdue or today tasks
    const today = todayStr();
    const dueToday = tasks.filter(t => !t.done && t.reminder && t.due === today);
    if (dueToday.length > 0) {
      setTimeout(() => showNotif("📅 Tasks Due Today", `${dueToday[0].title}${dueToday.length > 1 ? ` +${dueToday.length - 1} more` : ""}`), 1500);
    }

    const interval = setInterval(() => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();

      // Morning Briefing at exactly 8:00 AM
      if (h === 8 && m === 0 && now.getSeconds() < 15) {
        const tDue = tasks.filter(t => !t.done && t.due === today);
        if (tDue.length > 0) {
          showNotif("🌅 Morning Briefing", `You have ${tDue.length} tasks ready for today.`);
          if (Notification.permission === "granted") new Notification("🌅 Taskflow Briefing", { body: `You have ${tDue.length} tasks ready for today.` });
        }
      }

      // Sunday Weekly Stats Notification at 10:00 AM
      if (h === 10 && m === 0 && now.getSeconds() < 15 && now.getDay() === 0) {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const tDone = tasks.filter(t => t.done && t.createdAt && new Date(t.createdAt) > weekAgo);
        if (tDone.length > 0) {
          showNotif("📊 Weekly Review Ready", `You completed ${tDone.length} tasks this week! Tap to see your stats.`, [{ label: "View Stats", onClick: () => { setNotif(null); setTab("stats"); } }]);
          if (Notification.permission === "granted") new Notification("📊 Taskflow Weekly Review", { body: `You completed ${tDone.length} tasks this week.` });
        }
      }

      // Check snoozed tasks
      tasks.forEach(t => {
        if (t.done) return;
        if (snoozedTasks[t.id]) {
          const snoozeUntil = new Date(snoozedTasks[t.id]);
          if (now >= snoozeUntil) {
            showNotif(`⏰ Reminder`, t.title, [
              { label: "Snooze 15m", onClick: () => handleSnooze(t, 15) },
              { label: "Snooze 1h", onClick: () => handleSnooze(t, 60) },
              { label: "Snooze 1d", onClick: () => handleSnooze(t, 24 * 60) }
            ]);
            if (Notification.permission === "granted") { new Notification(`⏰ Task Reminder`, { body: t.title }); play("complete"); }

            const nextSnoozed = { ...snoozedTasks };
            delete nextSnoozed[t.id];
            setSnoozedTasks(nextSnoozed);
            localStorage.setItem('tf_snoozed', JSON.stringify(nextSnoozed));
          }
        }
      });
    }, 15000); // Check every 15s to not miss the minute window
    return () => clearInterval(interval);
  }, [tasks, snoozedTasks, notifsOn]);

  // == Recurring task reset (runs on load & daily) ==
  useEffect(() => {
    const today = todayStr();
    const lastReset = (() => { try { return localStorage.getItem("tf_last_reset") || ""; } catch { return ""; } })();
    if (lastReset === today) return; // already reset today
    setTasks(ts => ts.map(task => {
      if (!task.done || !task.recurring || task.recurring === "never") return task;
      const due = task.due ? new Date(task.due) : null;
      const now = new Date(today);
      let shouldReset = false;
      if (task.recurring === "daily") {
        shouldReset = true;
      } else if (task.recurring === "weekly") {
        if (due) {
          const diff = Math.floor((now - due) / (1000 * 60 * 60 * 24));
          shouldReset = diff >= 7;
        }
      } else if (task.recurring === "monthly") {
        if (due) {
          shouldReset = now.getFullYear() > due.getFullYear() ||
            (now.getFullYear() === due.getFullYear() && now.getMonth() > due.getMonth());
        }
      }
      if (!shouldReset) return task;
      // Calculate next due date
      let nextDue = task.due;
      if (task.due) {
        const d = new Date(task.due);
        if (task.recurring === "daily") d.setDate(d.getDate() + 1);
        else if (task.recurring === "weekly") d.setDate(d.getDate() + 7);
        else if (task.recurring === "monthly") d.setMonth(d.getMonth() + 1);
        nextDue = d.toISOString().split("T")[0];
      } else {
        nextDue = today;
      }
      return { ...task, done: false, due: nextDue };
    }));
    try { localStorage.setItem("tf_last_reset", today); } catch { }
  }, []);

  const [confettiBurst, setConfettiBurst] = useState(false);

  function fireConfetti() {
    setConfettiBurst(true);
    haptic('success');
    setTimeout(() => setConfettiBurst(false), 2000);
    // Premium CDN Confetti
    if (window.confetti) {
      window.confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#7c6dfa', '#6bcb77', '#ff6b6b', '#ffd93d'] });
    }
  };
  const [pageKey, setPageKey] = useState(0);
  function switchTab(t) { setTab(t); setPageKey(k => k + 1); };

  ;

  // == XP & Badge Engine ==
  

  function checkBadges(stats) {
    BADGES.forEach(badge => {
      if (!earnedBadges.includes(badge.id) && badge.check(stats)) {
        setEarnedBadges(prev => {
          const next = [...prev, badge.id];
          try { localStorage.setItem("tf_badges", JSON.stringify(next)); } catch { }
          return next;
        });
        setNewBadgeAnim(badge);
        awardXP(badge.xp, `Badge: ${badge.name}`);
        setTimeout(() => setNewBadgeAnim(null), 4000);
      }
    });
  }

  // == Compute gamification stats from tasks/habits/goals ==
  useEffect(() => {
    const done = tasks.filter(t => t.done);
    const now = new Date();
    const hour = now.getHours();
    // streak calculation
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 60; i++) {
      const ds = d.toISOString().split("T")[0];
      const hadDone = done.some(t => (t.createdAt || 0) > 0 && new Date(t.createdAt).toISOString().split("T")[0] === ds);
      if (hadDone) { streak++; d.setDate(d.getDate() - 1); } else break;
    }
    const stats = {
      totalDone: done.length,
      streak,
      highDone: done.filter(t => t.priority === "high").length,
      earlyBird: done.some(t => { const h = new Date(t.createdAt || 0).getHours(); return h < 9; }),
      nightOwl: done.some(t => { const h = new Date(t.createdAt || 0).getHours(); return h >= 22; }),
      goalsCompleted: 0,
      habitCompletions: 0,
      notesCreated: notes.length,
      longNoteCreated: notes.some(n => (n.body || "").trim().split(/\s+/).filter(Boolean).length >= 100),
      sharedTasks: 0,
      overdueCleared: done.filter(t => t.due && new Date(t.due) < new Date(t.createdAt || 0)).length,
      perfectTasks: done.filter(t => t.subtasks?.length > 0 && t.subtasks.every(s => s.done)).length,
      plannerUses: 0,
      focusSessions: 0,
      comebackDays: 0,
    };
    setGamStats(stats);
    checkBadges(stats);
  }, [tasks]);

  // == Refresh AI suggestions when tasks change ==
  useEffect(() => {
    const s = getAISuggestions(tasks, categories);
    setAiSuggestions(s.filter(sg => !dismissedSuggestions.includes(sg.id)));
  }, [tasks, categories]);

  // voice quick-add removed



  function openAdd() { setForm({ ...blankForm, profileId: activeProfile }); setTagInput(""); setSubInput(""); setEditTaskObj(null); setShowTaskModal(true); play("tap"); };
  function openEdit(task, e) { if (e) e.stopPropagation(); setForm({ title: task.title, notes: task.notes, priority: task.priority, categoryId: task.categoryId, due: task.due, photo: task.photo, tags: [...task.tags], subtasks: task.subtasks.map(s => ({ ...s })), starred: task.starred, recurring: task.recurring || "never", reminder: task.reminder || false, reminderTime: task.reminderTime || "09:00", reminderDate: task.reminderDate || "", alarmTone: task.alarmTone || "classic", profileId: task.profileId }); setTagInput(""); setSubInput(""); setEditTaskObj(task); setShowTaskModal(true); play("tap"); };
  ;
  function del(id, e) {
    if (e) e.stopPropagation();
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setTasks(ts => ts.filter(t => t.id !== id));
    setDeletedTask(task); setShowUndo(true);
    play("delete"); haptic("error");
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => { setShowUndo(false); setDeletedTask(null); }, 4000);
    setUndoTimer(timer);
  }
  function undoDelete() {
    if (!deletedTask) return;
    setTasks(ts => [deletedTask, ...ts]);
    setShowUndo(false); setDeletedTask(null);
    if (undoTimer) clearTimeout(undoTimer);
    play("add"); haptic("success");
    showNotif("↩️ Restored!", deletedTask.title);
  }
  function star(id, e) { if (e) e.stopPropagation(); play("tap"); setTasks(ts => ts.map(t => t.id === id ? { ...t, starred: !t.starred } : t)); };
  const toggleSub = (tid, sid) => setTasks(ts => ts.map(t => t.id === tid ? { ...t, subtasks: t.subtasks.map(s => s.id === sid ? { ...s, done: !s.done } : s) } : t));

  function handlePhoto(e) { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => setForm(fm => ({ ...fm, photo: ev.target.result })); r.readAsDataURL(f); };
  function addTag() { const v = tagInput.trim().replace(/^#/, ""); if (!v || form.tags.includes(v)) return; setForm(f => ({ ...f, tags: [...f.tags, v] })); setTagInput(""); };
  function addSub() { const v = subInput.trim(); if (!v) return; setForm(f => ({ ...f, subtasks: [...f.subtasks, { id: uid(), text: v, done: false }] })); setSubInput(""); };

  // == Categories ==
  const getCat = (id) => categories.find(c => c.id === id) || categories[categories.length - 1];
  function saveCat() { if (!catForm.name.trim()) return; setCategories(cs => [...cs, { id: uid(), ...catForm }]); setCatForm({ name: "", icon: "🎯", color: "#7c6dfa" }); setShowCatModal(false); play("add"); };

  // == Profiles ==
  function saveProfile() { if (!profForm.name.trim()) return; const nid = uid(); setProfiles(ps => [...ps, { id: nid, ...profForm }]); setActiveProfile(nid); setProfForm({ name: "", icon: "👤", color: "#7c6dfa" }); setShowProfileModal(false); play("add"); };

  // == PIN ==
  function handlePinKey(k) {
    if (pinMode === "unlock") {
      const np = pinInput + k; setPinInput(np); setPinError("");
      if (np.length === 4) { if (np === pin) { setLocked(false); setPinInput(""); } else { setPinError(t.wrongPin); setTimeout(() => setPinInput(""), 600); } }
    } else if (pinMode === "set") {
      const np = pinInput + k; setPinInput(np);
      if (np.length === 4) { setPinTemp(np); setPinInput(""); setPinMode("confirm"); }
    } else if (pinMode === "confirm") {
      const np = pinInput + k; setPinInput(np); setPinError("");
      if (np.length === 4) { if (np === pinTemp) { setPin(np); setPinEnabled(true); setLocked(false); setShowPinModal(false); setPinInput(""); setPinMode(null); showNotif("🔒 PIN Set", "Your app is now protected"); } else { setPinError(t.pinsNoMatch); setTimeout(() => setPinInput(""), 600); } }
    }
  };
  const handlePinDel = () => setPinInput(p => p.slice(0, -1));

  // == Export ==
  const exportData = () => JSON.stringify({ tasks: profileTasks, categories, profiles, exportDate: new Date().toISOString() }, null, 2);
  function shareData() { if (navigator.share) { navigator.share({ title: "Taskflow Export", text: exportData() }); } else { navigator.clipboard?.writeText(exportData()); showNotif("📋 Copied!", "Task data copied to clipboard"); } };

  // == Computed ==
  const total = profileTasks.length, doneCount = profileTasks.filter(t => t.done).length;
  const activeCount = total - doneCount, overdueCount = profileTasks.filter(t => isOverdue(t.due, t.done)).length;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const C = 2 * Math.PI * 22, dash = C - (pct / 100) * C;

  const viewTasks = profileTasks.filter(t => {
    if (showStarred && !t.starred) return false;
    if (showDone !== t.done) return false;
    if (filterCat !== "all" && t.categoryId !== filterCat) return false;
    if (energyFilter === "med" && t.priority === "high") return false;
    if (energyFilter === "low" && (t.priority === "high" || t.priority === "medium")) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.tags.some(tg => tg.includes(search.toLowerCase()))) return false;
    return true;
  }).sort((a, b) => {
    if (sort === "priority") { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; }
    if (sort === "due") { if (!a.due) return 1; if (!b.due) return -1; return new Date(a.due) - new Date(b.due); }
    if (sort === "alpha") return a.title.localeCompare(b.title);
    return b.createdAt - a.createdAt;
  });

  const curProfile = profiles.find(p => p.id === activeProfile) || profiles[0];

  // == Task Card ==
  function TaskCard({ task }) {
    const swipeRef = useRef(null);
    const swipeStartX = useRef(0);
    const swipeDelta = useRef(0);
    function handleTouchStart(e) {
      swipeStartX.current = e.touches[0].clientX;
      swipeRef._startY = e.touches[0].clientY;
    };
    function handleTouchMove(e) {
      const dx = e.touches[0].clientX - swipeStartX.current;
      swipeDelta.current = dx;
      if (swipeRef.current) {
        const dy = (swipeRef._startY || 0) - e.touches[0].clientY;
        swipeRef._endY = e.touches[0].clientY;
        if (dy > 20 && Math.abs(dx) < 40) {
          swipeRef.current.style.transform = `translateY(${Math.min(-dy, 0)}px)`;
          swipeRef.current.style.background = "rgba(72,219,251,0.15)";
        } else {
          swipeRef.current.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`;
          swipeRef.current.style.transition = "none";
          if (dx > 40) swipeRef.current.style.background = "rgba(107,203,119,0.18)";
          else if (dx < -40) swipeRef.current.style.background = "rgba(255,107,107,0.18)";
          else swipeRef.current.style.background = "";
        }
      }
    };
    function handleTouchEnd() {
      const dx = swipeDelta.current;
      if (swipeRef.current) {
        swipeRef.current.style.transition = "transform .3s cubic-bezier(.4,0,.2,1),background .3s ease";
        swipeRef.current.style.transform = "";
        swipeRef.current.style.background = "";
      }
      const dy = (swipeRef._startY || 0) - (swipeRef._endY || 0);
      if (dy > 60 && Math.abs(dx) < 40) {
        // Swipe UP = reschedule to tomorrow
        const tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
        const newDue = tmr.toISOString().slice(0, 10);
        setTasks(ts => ts.map(t => t.id === task.id ? { ...t, due: newDue } : t));
        showNotif("📅 Rescheduled", "Moved to tomorrow");
        haptic("medium");
      } else if (dx > 70) { toggle(task.id); haptic("success"); }
      else if (dx < -70) { del(task.id); haptic("error"); }
      swipeDelta.current = 0;
    };
    const cat = getCat(task.categoryId);
    const ds = task.subtasks.filter(s => s.done).length;
    const sp = task.subtasks.length ? (ds / task.subtasks.length) * 100 : 0;
    const trackedTime = getTaskTime(task.id);
    const isTimerRunning = activeTimer?.taskId === task.id;
    const isDragging = dragId === task.id;
    const isDragOver = dragOverId === task.id;
    return (
      <>
        {bulkMode && (
          <div onClick={(e) => { e.stopPropagation(); toggleBulkSelect(task.id); }} style={{ position: "absolute", top: 8, right: 8, zIndex: 10, width: 22, height: 22, borderRadius: 7, border: `2px solid ${bulkSelected.has(task.id) ? accent.v : "var(--b2)"}`, background: bulkSelected.has(task.id) ? accent.v : "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .15s" }}>
            {bulkSelected.has(task.id) && <span style={{ color: "#fff", fontSize: 11, fontWeight: 800 }}>✓</span>}
          </div>
        )}
        <div
          className="task-swipe-wrap"
          data-taskid={task.id}
          style={{
            position: "relative",
            transition: "transform .2s cubic-bezier(.4,0,.2,1)",
            transform: isDragOver && !isDragging ? "scale(1.02)" : "scale(1)",
          }}
          onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(task.id); } : undefined}
          draggable={!bulkMode && viewMode === "list"}
          onDragStart={e => handleDragStart(e, task.id)}
          onDragEnter={e => handleDragEnter(e, task.id)}
          onDragOver={handleDragOver}
          onDrop={e => handleDrop(e, task.id)}
          onDragEnd={handleDragEnd}
          onTouchStart={e => handleTouchDragStart(e, task.id)}
          onTouchMove={handleTouchDragMove}
          onTouchEnd={handleTouchDragEnd}
        >
          {/* Drop indicator line */}
          {isDragOver && !isDragging && (
            <div style={{
              position: "absolute", top: -4, left: 12, right: 12, height: 3,
              background: `linear-gradient(90deg,${accent.v},${accent.g})`,
              borderRadius: 3, zIndex: 10,
              boxShadow: `0 0 10px ${accent.v}80`,
              animation: "dropIndicator .3s ease",
            }} />
          )}
          <div className="task-swipe-bg-r"><span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>✅ Complete</span></div>
          <div className="task-swipe-bg-l"><span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>🗑 Delete</span></div>
          <div ref={swipeRef} className="task-swipe-inner" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <div className={`task p${task.priority[0]} ${task.done ? "done-t" : ""} ${isOverdue(task.due, task.done) ? "ov-t" : ""} ${isDragging ? "task-dragging" : ""}`} style={{ margin: 0, borderRadius: 20 }}
              onClick={() => { setDetailTaskId(task.id); setShowDetail(true); }}
              onDoubleClick={() => { setFocusTaskId(task.id); setShowFocusMode(true); }}>
              {/* Drag handle — shown on hover, list mode only */}
              {viewMode === "list" && !bulkMode && (
                <div className="drag-handle" title="Drag to reorder">
                  <span>⠿</span>
                </div>
              )}
              <div className={`chk ${task.done ? "on" : ""}`} onClick={e => toggle(task.id, e)}>{task.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}</div>
              <div className="t-body">
                <div className="t-top">
                  <div className="t-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {(() => { const ageD = task.createdAt ? Math.floor((Date.now() - task.createdAt) / (1000 * 60 * 60 * 24)) : 0; return ageD >= 14 ? <span title={`${ageD} days old — needs attention!`} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(255,107,107,.15)", color: "var(--red)", fontWeight: 800, flexShrink: 0, border: "1px solid rgba(255,107,107,.25)" }}>⏳{ageD}d</span> : ageD >= 7 ? <span title={`${ageD} days old`} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(255,159,67,.12)", color: "#ff9f43", fontWeight: 800, flexShrink: 0 }}>⏳{ageD}d</span> : null; })()}
                    {task.title}
                  </div>
                  <span className={`t-star ${task.starred ? "lit" : ""}`} onClick={e => star(task.id, e)}>⭐</span>
                </div>
                {task.photo && <img src={task.photo} className="t-photo" alt="" />}
                {task.notes && <div className="t-note">{task.notes}</div>}
                <div className="t-meta">
                  <span className="tchip" style={{ color: PRIORITIES[task.priority].color, background: PRIORITIES[task.priority].bg, border: `1px solid ${PRIORITIES[task.priority].color}28` }}>{PRIORITIES[task.priority].icon}</span>
                  <span className="tchip" style={{ background: cat.color + "22", color: cat.color, border: `1px solid ${cat.color}33` }}>{cat.icon} {cat.name}</span>
                  {task.tags.slice(0, 2).map(tg => <span key={tg} className="tchip" style={{ background: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }}>#{tg}</span>)}
                  {task.due && <span className={`t-date ${isOverdue(task.due, task.done) ? "ov" : ""}`}>{isOverdue(task.due, task.done) ? "⚠ " : "◷ "}{fmtDate(task.due)}</span>}
                  {task.timeEstimate > 0 && <span className="est-badge">⏱ {task.timeEstimate < 60 ? task.timeEstimate + "m" : (task.timeEstimate / 60).toFixed(1) + "h"}</span>}
                  {task.dependsOn?.length > 0 && tasks.find(t2 => task.dependsOn.includes(t2.id) && !t2.done) && <span className="dep-badge">🔒 Blocked</span>}
                  {task.recurring && task.recurring !== "never" && <span className="t-recur">🔄 {task.recurring}</span>}
                  {task.reminder && <span className="t-recur">🔔</span>}
                  {trackedTime > 0 && <span className="t-recur" style={{ color: isTimerRunning ? "#6bcb77" : "var(--t3)", fontWeight: isTimerRunning ? 800 : 400 }}>{isTimerRunning ? "⏱ " + (activeTimer ? `${String(Math.floor((Date.now() - activeTimer.startedAt) / 60000)).padStart(2, "0")}:${String(Math.floor(((Date.now() - activeTimer.startedAt) % 60000) / 1000)).padStart(2, "0")}` : "00:00") : "⏱ " + fmtTime(trackedTime)}</span>}
                </div>
                {task.subtasks.length > 0 && <div className="sub-prog"><div className="sub-bar"><div className="sub-bar-f" style={{ width: `${sp}%` }} /></div><div className="sub-lbl">{ds}/{task.subtasks.length} subtasks</div></div>}
              </div>
              <div className="t-act" onClick={e => e.stopPropagation()}>
                <button className="ic-btn" title={isTimerRunning ? "Stop timer" : "Start timer"} onClick={e => { e.stopPropagation(); isTimerRunning ? stopTimer() : startTimer(task.id); }} style={{ color: isTimerRunning ? "#6bcb77" : "var(--t3)", background: isTimerRunning ? "rgba(107,203,119,.15)" : "transparent" }}>{isTimerRunning ? "⏹" : "▶"}</button>
                <button className="ic-btn" title="Focus Mode" onClick={e => { e.stopPropagation(); setFocusTaskId(task.id); setShowFocusMode(true); }}>🌌</button>
                <button className="ic-btn" onClick={e => openEdit(task, e)}>✎</button>
                <button className="ic-btn del" onClick={e => del(task.id, e)}>✕</button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  // == Live clock for greeting (updates every minute) ==
  const [liveHour, setLiveHour] = useState(new Date().getHours());
  const [liveMin, setLiveMin] = useState(new Date().getMinutes());
  useEffect(() => {
    const iv = setInterval(() => { const n = new Date(); setLiveHour(n.getHours()); setLiveMin(n.getMinutes()); }, 60000);
    return () => clearInterval(iv);
  }, []);

  function getDailyDigest() {

    const today = todayStr();
    const dueToday = profileTasks.filter(t => !t.done && t.due === today);
    const overdue = profileTasks.filter(t => !t.done && t.due && new Date(t.due) < new Date());
    const completedToday = profileTasks.filter(t => t.done && t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === today);
    const hour = liveHour;
    const suggestion = hour >= 5 && hour < 9 ? "🌅 Morning is golden — tackle your hardest task first!" : hour >= 9 && hour < 12 ? "⚡ Peak focus hours — perfect for deep creative work." : hour >= 12 && hour < 14 ? "🍽 Post-lunch: great for meetings and reviews." : hour >= 14 && hour < 17 ? "☕ Afternoon slump? Pomodoro sessions keep you sharp." : hour >= 17 && hour < 20 ? "🌆 Evening — review tomorrow's top priorities." : "🌙 Late night — wrap up and plan tomorrow.";
    const avgMoodLast7 = moods.slice(-7).length ? (moods.slice(-7).reduce((a, m) => a + m.energy, 0) / moods.slice(-7).length).toFixed(1) : null;
    return { dueToday, overdue, completedToday, suggestion, avgMoodLast7, streak: gamStats.streak };
  };


  // == Pages ==

  // AnimePet is imported from ./components/AnimePet — no inline definition needed
  function TasksPage() {
    const greeting = liveHour < 5 ? "Good night 🌙" : liveHour < 12 ? "Good morning ☀️" : liveHour < 17 ? "Good afternoon 🌤" : liveHour < 21 ? "Good evening 🌆" : "Good night 🌙";
    const curProfile2 = profiles.find(p => p.id === activeProfile) || profiles[0];
    const aiInsight = aiSuggestions.find(s => s.type === 'tip') || aiSuggestions[0];
    
    return (
      <div className="content">
        {/* ✨ Modern Dashboard Hero */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20, marginBottom: 24, animation: "slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)" }}>
          
          {/* Main Greeting Card */}
          <div style={{ 
            background: "var(--s1)", backdropFilter: "blur(20px)", borderRadius: 28, padding: 24, border: "1px solid var(--glass-border)",
            display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden", minHeight: 210, boxShadow: "var(--shadow-lg)"
          }}>
             <div style={{ zIndex: 1 }}>
               <div style={{ fontSize: 13, fontWeight: 800, color: "var(--acc)", borderBottom: "1.5px solid var(--accd)", display: "inline-block", paddingBottom: 2, marginBottom: 16 }}>{fmtDateFull(new Date())}</div>
               <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, color: "var(--t1)", lineHeight: 1 }}>{greeting}, {curProfile2.name}</div>
               <div style={{ fontSize: 14, color: "var(--t2)", marginTop: 10, fontWeight: 500 }}>{liveHour < 12 ? "Embrace the morning light and your goals." : liveHour < 18 ? "The day is yours to conquer. Keep going." : "Wind down and reflect on your wins."}</div>
             </div>
             
             <div style={{ display: "flex", gap: 12, marginTop: 24, zIndex: 1 }}>
                <div style={{ background: "var(--accd)", borderRadius: 18, padding: "12px 18px", border: "1px solid var(--acc)33" }}>
                  <div style={{ fontSize: 20, color: "var(--acc)", fontWeight: 800 }}>{profileTasks.filter(t => !t.done).length}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Pending</div>
                </div>
                <div style={{ background: "rgba(74, 222, 128, 0.12)", borderRadius: 18, padding: "12px 18px", border: "1px solid rgba(74, 222, 128, 0.25)" }}>
                  <div style={{ fontSize: 20, color: "var(--green)", fontWeight: 800 }}>{getLevel(xp).level}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>Level</div>
                </div>
             </div>

             {/* Background Element */}
             <div style={{ position: "absolute", bottom: -40, right: -40, width: 220, height: 220, background: `radial-gradient(circle, ${accent}18 0%, transparent 70%)`, pointerEvents: "none" }} />
          </div>

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
                  <button onClick={() => setTab("bot")} style={{ background: `linear-gradient(135deg, ${accent}, ${accent2})`, color: "#fff", padding: "10px 20px", borderRadius: 14, fontSize: 12, fontWeight: 700, boxShadow: `0 4px 15px ${accent}44` }}>Chat with LIBI</button>
                  <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>Real-time update</span>
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
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(96, 165, 250, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>💧</div>
               </div>
               <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1, height: 8, background: "var(--s4)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${Math.min(100, (wellness.waterTotal / 2000) * 100)}%`, background: "linear-gradient(90deg, #60a5fa, #3b82f6)", borderRadius: 10, transition: "width 1s ease" }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)", width: 50 }}>{wellness.waterTotal}ml</span>
               </div>
             </div>

             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "var(--t3)", textTransform: "uppercase", fontWeight: 800, letterSpacing: 0.5, marginBottom: 4 }}>Daily Mood</div>
                  <div style={{ fontSize: 26 }}>{wellness.moodLogs[0]?.mood === 0 ? "😔" : wellness.moodLogs[0]?.mood === 1 ? "😐" : wellness.moodLogs[0]?.mood === 2 ? "🙂" : wellness.moodLogs[0]?.mood === 3 ? "😊" : wellness.moodLogs[0]?.mood === 4 ? "🤩" : "😶"}</div>
                </div>
                <button onClick={() => setTab("wellness")} style={{ background: "var(--s2)", padding: "12px 18px", borderRadius: 16, fontSize: 12, fontWeight: 700, border: "1px solid var(--b1)", color: "var(--t1)" }}>Wellness Hub ›</button>
             </div>
          </div>
        </div>

                {/* ── ☀️ AFTERNOON: City skyline, clouds, blue sky */}
                {isAfternoon && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#040d24" /><stop offset="25%" stopColor="#0d2f72" /><stop offset="60%" stopColor="#1a78cc" /><stop offset="85%" stopColor="#42aed8" /><stop offset="100%" stopColor="#7ecce8" />
                      </linearGradient>
                      <radialGradient id="sunA" cx="78%" cy="20%" r="18%">
                        <stop offset="0%" stopColor="#fff8c0" stopOpacity="1" /><stop offset="50%" stopColor="#ffe060" stopOpacity="0.5" /><stop offset="100%" stopColor="#ffcc40" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyA)" />
                    <circle cx="315" cy="38" r="16" fill="url(#sunA)" opacity="0.95" />
                    <circle cx="315" cy="38" r="11" fill="#ffffc0" />
                    {/* Cloud 1 */}
                    <g opacity="0.8"><ellipse cx="75" cy="35" rx="32" ry="13" fill="white" /><ellipse cx="58" cy="40" rx="20" ry="11" fill="white" /><ellipse cx="96" cy="40" rx="22" ry="11" fill="white" /><animateTransform attributeName="transform" type="translate" values="0,0;10,0;0,0" dur="12s" repeatCount="indefinite" /></g>
                    {/* Cloud 2 */}
                    <g opacity="0.55"><ellipse cx="230" cy="22" rx="28" ry="11" fill="white" /><ellipse cx="215" cy="26" rx="18" ry="9" fill="white" /><ellipse cx="248" cy="26" rx="20" ry="9" fill="white" /><animateTransform attributeName="transform" type="translate" values="0,0;-8,0;0,0" dur="16s" repeatCount="indefinite" /></g>
                    {/* Cloud 3 small */}
                    <g opacity="0.4"><ellipse cx="355" cy="55" rx="18" ry="7" fill="white" /><ellipse cx="345" cy="58" rx="12" ry="6" fill="white" /><animateTransform attributeName="transform" type="translate" values="0,0;6,0;0,0" dur="10s" repeatCount="indefinite" /></g>
                    {/* Water/ground */}
                    <rect x="0" y="175" width="400" height="25" fill="#0a1428" opacity="0.95" />
                    <rect x="0" y="172" width="400" height="5" fill="#1a3a6a" opacity="0.7" />
                    {/* Water shimmer */}
                    <rect x="50" y="180" width="60" height="2" rx="1" fill="rgba(255,255,255,0.15)"><animate attributeName="opacity" values="0.15;0.35;0.15" dur="3s" repeatCount="indefinite" /></rect>
                    <rect x="200" y="184" width="40" height="1.5" rx="1" fill="rgba(255,255,255,0.1)"><animate attributeName="opacity" values="0.1;0.25;0.1" dur="4s" repeatCount="indefinite" /></rect>
                    {/* Buildings */}
                    <rect x="0" y="128" width="36" height="72" fill="#06101e" opacity="0.9" />
                    <rect x="30" y="112" width="26" height="88" fill="#09182e" opacity="0.9" />
                    <rect x="52" y="122" width="22" height="78" fill="#06101e" opacity="0.88" />
                    <rect x="70" y="98" width="30" height="102" fill="#09182e" opacity="0.9" />
                    <rect x="95" y="115" width="24" height="85" fill="#06101e" opacity="0.88" />
                    <rect x="185" y="100" width="30" height="100" fill="#06101e" opacity="0.9" />
                    <rect x="210" y="88" width="24" height="112" fill="#09182e" opacity="0.9" />
                    <rect x="230" y="108" width="20" height="92" fill="#06101e" opacity="0.88" />
                    <rect x="305" y="95" width="34" height="105" fill="#09182e" opacity="0.9" />
                    <rect x="335" y="112" width="26" height="88" fill="#06101e" opacity="0.88" />
                    <rect x="357" y="90" width="30" height="110" fill="#09182e" opacity="0.9" />
                    <rect x="383" y="108" width="17" height="92" fill="#06101e" opacity="0.88" />
                    {/* Antennas */}
                    <rect x="221" y="78" width="2" height="10" fill="#1a3a80" opacity="0.8" />
                    <rect x="369" y="80" width="2" height="10" fill="#1a3a80" opacity="0.8" />
                    <circle cx="222" cy="78" r="1.5" fill="#ff6b6b" opacity="0.7"><animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.5s" repeatCount="indefinite" /></circle>
                    <circle cx="370" cy="80" r="1.5" fill="#ff6b6b" opacity="0.5"><animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" /></circle>
                    {/* Windows */}
                    {[[35, 102, 3, 3], [35, 112, 3, 3], [35, 122, 3, 3], [72, 102, 3, 3], [72, 112, 3, 3], [85, 102, 3, 3], [212, 92, 3, 3], [212, 102, 3, 3], [212, 112, 3, 3], [217, 92, 3, 3], [217, 102, 3, 3], [308, 100, 3, 3], [308, 110, 3, 3], [308, 120, 3, 3], [315, 100, 3, 3], [360, 95, 3, 3], [360, 105, 3, 3], [360, 115, 3, 3], [337, 117, 3, 3]].map(([x, y, w, h], i) => (
                      <rect key={i} x={x} y={y} width={w} height={h} rx="0.5" fill="#ffd080" opacity={0.3 + Math.random() * 0.4} />
                    ))}
                    {/* Lily pads */}
                    <ellipse cx="160" cy="183" rx="14" ry="5" fill="#1a5c2a" opacity="0.55" />
                    <circle cx="160" cy="181" r="5" fill="#ff9ec0" opacity="0.65" />
                    <ellipse cx="280" cy="187" rx="10" ry="4" fill="#1a5c2a" opacity="0.4" />
                    <circle cx="280" cy="185" r="3.5" fill="#ffcce0" opacity="0.55" />
                    {/* Bird */}
                    <path d="M155,28 Q158,25 162,28 M165,31 Q168,28 172,31" stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none"><animateTransform attributeName="transform" type="translate" values="0,0;30,-6;60,2" dur="9s" repeatCount="indefinite" /></path>
                  </svg>
                )}

                {/* ── 🌆 EVENING: Sunset mountains, house, silhouettes */}
                {isEvening && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyE" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#01000a" /><stop offset="18%" stopColor="#12002c" /><stop offset="45%" stopColor="#7a1830" /><stop offset="70%" stopColor="#e83818" /><stop offset="85%" stopColor="#ff7820" /><stop offset="100%" stopColor="#ffc050" />
                      </linearGradient>
                      <radialGradient id="sunE" cx="50%" cy="95%" r="55%">
                        <stop offset="0%" stopColor="#ffeeaa" stopOpacity="0.85" /><stop offset="45%" stopColor="#ff7020" stopOpacity="0.4" /><stop offset="100%" stopColor="#cc2808" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyE)" />
                    <ellipse cx="200" cy="200" rx="160" ry="90" fill="url(#sunE)" />
                    {/* Setting sun */}
                    <circle cx="200" cy="186" r="22" fill="#ffcc60" opacity="0.92" />
                    <circle cx="200" cy="186" r="17" fill="#fff0a0" opacity="0.95" />
                    {/* Stars appearing */}
                    {[35, 85, 155, 235, 305, 365, 55, 275, 185, 125, 320, 95].map((x, i) => (
                      <circle key={i} cx={x} cy={8 + i * 8} r="1" fill="white">
                        <animate attributeName="opacity" values={`0;${i * 0.07};${i * 0.05};0`} dur={`${2 + i * 0.3}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    {/* Mountains back */}
                    <polygon points="0,200 0,125 60,55 120,100 185,42 250,88 315,52 380,82 400,70 400,200" fill="#15032c" opacity="0.88" />
                    {/* Mountains front */}
                    <polygon points="0,200 0,150 45,110 90,140 155,102 215,128 270,105 330,122 385,108 400,112 400,200" fill="#1e0438" opacity="0.92" />
                    {/* Ground */}
                    <rect x="0" y="183" width="400" height="17" fill="#10021c" opacity="0.98" />
                    {/* House */}
                    <rect x="152" y="148" width="62" height="38" fill="#0d0820" opacity="0.98" />
                    <polygon points="140,150 228,150 202,122 178,122" fill="#180d30" opacity="0.98" />
                    {/* Chimney */}
                    <rect x="198" y="112" width="8" height="14" fill="#0d0820" />
                    <ellipse cx="202" cy="111" rx="6" ry="3" fill="rgba(180,180,200,0.15)">
                      <animate attributeName="cy" values="111;105;111" dur="3s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.15;0;0.15" dur="3s" repeatCount="indefinite" />
                    </ellipse>
                    {/* Windows lit */}
                    <rect x="160" y="154" rx="1" width="11" height="11" fill="#ffcc60" opacity="0.9"><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" /></rect>
                    <rect x="178" y="154" rx="1" width="11" height="11" fill="#ffcc60" opacity="0.85"><animate attributeName="opacity" values="0.85;1;0.85" dur="4s" repeatCount="indefinite" /></rect>
                    <rect x="196" y="154" rx="1" width="11" height="11" fill="#ffa040" opacity="0.8"><animate attributeName="opacity" values="0.7;0.95;0.7" dur="3.5s" repeatCount="indefinite" /></rect>
                    {/* Door */}
                    <rect x="177" y="165" width="13" height="21" rx="1.5" fill="#060410" />
                    {/* House glow */}
                    <ellipse cx="183" cy="170" rx="25" ry="14" fill="#ffcc40" opacity="0.07" />
                    {/* Trees */}
                    {[[108, 0], [120, 5], [258, 0], [272, 5], [290, 3]].map(([x, off], i) => (
                      <g key={i}>
                        <polygon points={`${x + 6},183 ${x + 6},${145 - off} ${x},${162 - off} ${x + 12},${162 - off}`} fill="#080d04" opacity="0.88" />
                      </g>
                    ))}
                    {/* Bird silhouettes */}
                    <path d="M75,65 Q78,62 82,65 M85,68 Q88,65 92,68" stroke="#ff7020" strokeWidth="1.2" fill="none" opacity="0.6" />
                    <path d="M310,50 Q313,47 317,50" stroke="#ff7020" strokeWidth="1" fill="none" opacity="0.5" />
                  </svg>
                )}

                {/* ── 🌙 NIGHT: Galaxy, moon, shooting stars */}
                {isNight && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyN" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#000008" /><stop offset="40%" stopColor="#040018" /><stop offset="70%" stopColor="#0c0030" /><stop offset="100%" stopColor="#1a0042" />
                      </linearGradient>
                      <radialGradient id="moonGN" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#e8e4ff" stopOpacity="1" /><stop offset="60%" stopColor="#c0b8ff" stopOpacity="0.3" /><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="milkyWay" cx="30%" cy="60%" r="50%">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.22" /><stop offset="50%" stopColor="#7c6dfa" stopOpacity="0.1" /><stop offset="100%" stopColor="#000" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyN)" />
                    {/* Milky way */}
                    <ellipse cx="140" cy="95" rx="200" ry="40" fill="url(#milkyWay)" transform="rotate(-20,200,95)" />
                    {/* Stars - many */}
                    {[[20, 15, 1.8], [48, 8, 1.2], [78, 22, 1.5], [108, 10, 1], [138, 18, 1.8], [168, 6, 1.2], [198, 15, 2], [228, 9, 1.3], [258, 22, 1.6], [288, 7, 1.2], [318, 16, 1.8], [348, 11, 1.4], [378, 19, 1.2], [25, 38, 0.9], [68, 44, 1.3], [118, 35, 1.1], [158, 45, 1.5], [208, 42, 1], [248, 34, 1.2], [298, 46, 1.4], [338, 38, 1.1], [378, 44, 1.3], [15, 58, 0.8], [58, 64, 1.2], [108, 55, 0.9], [158, 62, 1.4], [198, 54, 1.1], [248, 64, 1.3], [288, 58, 1], [338, 62, 1.2], [378, 54, 1.1], [42, 78, 0.8], [98, 74, 0.9], [188, 76, 1.1], [235, 82, 1], [285, 74, 0.9], [335, 78, 1.2], [55, 92, 0.8], [145, 92, 1], [195, 98, 0.9], [245, 92, 0.8], [295, 96, 1], [355, 92, 0.9], [12, 110, 0.7], [62, 108, 0.8], [112, 112, 0.7], [162, 106, 0.9], [212, 112, 0.8], [262, 108, 0.7], [312, 112, 0.9], [362, 106, 0.8]].map(([x, y, r], i) => (
                      <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={0.3 + ((i * 7) % 10) * 0.06}>
                        <animate attributeName="opacity" values={`${0.3 + ((i * 7) % 10) * 0.06};${0.7 + ((i * 3) % 4) * 0.08};${0.3 + ((i * 7) % 10) * 0.06}`} dur={`${2 + ((i * 3) % 7) * 0.5}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    {/* Shooting star 1 */}
                    <line x1="300" y1="20" x2="348" y2="38" stroke="white" strokeWidth="1" opacity="0">
                      <animate attributeName="opacity" values="0;0;0.9;0;0;0;0;0;0;0" dur="12s" repeatCount="indefinite" />
                      <animateTransform attributeName="transform" type="translate" values="0,0;0,0;-50,15;-100,30;-100,30;-100,30;-100,30;0,0;0,0;0,0" dur="12s" repeatCount="indefinite" />
                    </line>
                    {/* Shooting star 2 */}
                    <line x1="80" y1="15" x2="116" y2="28" stroke="white" strokeWidth="0.8" opacity="0">
                      <animate attributeName="opacity" values="0;0;0;0;0.8;0;0;0;0;0" dur="15s" repeatCount="indefinite" />
                      <animateTransform attributeName="transform" type="translate" values="0,0;0,0;0,0;0,0;50,-8;100,-16;100,-16;0,0;0,0;0,0" dur="15s" repeatCount="indefinite" />
                    </line>
                    {/* Moon */}
                    <circle cx="308" cy="40" r="28" fill="url(#moonGN)" />
                    <circle cx="308" cy="40" r="20" fill="#d4ccff" opacity="0.96" />
                    <circle cx="308" cy="40" r="18" fill="#e8e4ff" />
                    {/* Moon craters */}
                    <circle cx="302" cy="34" r="3" fill="#c8c0f0" opacity="0.5" />
                    <circle cx="314" cy="44" r="2.2" fill="#c8c0f0" opacity="0.4" />
                    <circle cx="305" cy="46" r="1.8" fill="#c8c0f0" opacity="0.3" />
                    <circle cx="318" cy="35" r="1.5" fill="#c8c0f0" opacity="0.25" />
                    {/* Moon shadow / crescent */}
                    <circle cx="316" cy="38" r="17" fill="#0c0030" opacity="0.22" />
                    {/* Mountains */}
                    <polygon points="0,200 0,140 55,80 110,120 170,65 230,105 290,70 345,100 400,78 400,200" fill="#02000c" opacity="0.95" />
                    {/* Ground */}
                    <rect x="0" y="184" width="400" height="16" fill="#010008" opacity="0.99" />
                    {/* Trees */}
                    {[[8, 0], [32, 5], [370, 0], [390, 5]].map(([x, off], i) => (
                      <g key={i}><polygon points={`${x + 6},184 ${x + 6},${150 - off} ${x},${166 - off} ${x + 12},${166 - off}`} fill="#010008" opacity="0.92" /></g>
                    ))}
                    {/* Nebula wisps */}
                    <ellipse cx="80" cy="80" rx="55" ry="18" fill="#7c6dfa" opacity="0.055" transform="rotate(18,80,80)" />
                    <ellipse cx="250" cy="55" rx="42" ry="14" fill="#a855f7" opacity="0.045" transform="rotate(-12,250,55)" />
                  </svg>
                )}

                {/* ── 🌌 GALAXY: Deep space with nebula */}
                {isGalaxy && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="galSky" x1="0" y1="0" x2="0.5" y2="1">
                        <stop offset="0%" stopColor="#000008" /><stop offset="50%" stopColor="#08001e" /><stop offset="100%" stopColor="#1e0050" />
                      </linearGradient>
                      <radialGradient id="neb1" cx="30%" cy="40%" r="45%">
                        <stop offset="0%" stopColor="#7c6dfa" stopOpacity="0.35" /><stop offset="60%" stopColor="#a855f7" stopOpacity="0.12" /><stop offset="100%" stopColor="#000" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="neb2" cx="75%" cy="30%" r="40%">
                        <stop offset="0%" stopColor="#f472b6" stopOpacity="0.2" /><stop offset="50%" stopColor="#a855f7" stopOpacity="0.08" /><stop offset="100%" stopColor="#000" stopOpacity="0" />
                      </radialGradient>
                      <radialGradient id="neb3" cx="55%" cy="75%" r="35%">
                        <stop offset="0%" stopColor="#48dbfb" stopOpacity="0.15" /><stop offset="100%" stopColor="#000" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#galSky)" />
                    <ellipse cx="200" cy="100" rx="220" ry="60" fill="url(#neb1)" />
                    <ellipse cx="300" cy="60" rx="160" ry="50" fill="url(#neb2)" />
                    <ellipse cx="220" cy="150" rx="140" ry="45" fill="url(#neb3)" />
                    {/* Dense star field */}
                    {Array.from({ length: 80 }, (_, i) => {
                      const x = ((i * 97 + 23) % 400), y = ((i * 53 + 17) % 180);
                      const r = 0.5 + (i % 5) * 0.35;
                      const colors = ["white", "#c4b5fd", "#bfdbfe", "#fbcfe8", "#a5f3fc"];
                      return <circle key={i} cx={x} cy={y} r={r} fill={colors[i % 5]} opacity={0.2 + ((i * 7) % 8) * 0.09}><animate attributeName="opacity" values={`${0.2 + ((i * 7) % 8) * 0.09};${0.7 + ((i * 3) % 4) * 0.1};${0.2 + ((i * 7) % 8) * 0.09}`} dur={`${1.5 + ((i * 4) % 9) * 0.4}s`} repeatCount="indefinite" /></circle>;
                    })}
                    {/* Galaxy spiral arm hints */}
                    <ellipse cx="160" cy="90" rx="80" ry="18" fill="rgba(180,150,255,0.08)" transform="rotate(35,160,90)" />
                    <ellipse cx="240" cy="110" rx="70" ry="15" fill="rgba(150,180,255,0.06)" transform="rotate(-25,240,110)" />
                    {/* Bright star / planet */}
                    <circle cx="320" cy="45" r="4" fill="white" opacity="0.9"><animate attributeName="r" values="3.5;5;3.5" dur="3s" repeatCount="indefinite" /></circle>
                    <circle cx="320" cy="45" r="8" fill="white" opacity="0.12"><animate attributeName="r" values="7;12;7" dur="3s" repeatCount="indefinite" /></circle>
                    {/* Shooting star */}
                    <line x1="80" y1="30" x2="120" y2="44" stroke="white" strokeWidth="1.2" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0;0;0" dur="10s" repeatCount="indefinite" /><animateTransform attributeName="transform" type="translate" values="0,0;0,0;60,-10;120,-20;120,-20;0,0;0,0" dur="10s" repeatCount="indefinite" /></line>
                    {/* Distant galaxy blob */}
                    <ellipse cx="75" cy="120" rx="20" ry="8" fill="rgba(200,180,255,0.1)" transform="rotate(20,75,120)" />
                    {/* Mountains */}
                    <polygon points="0,200 0,148 60,90 120,128 180,70 240,110 300,78 360,108 400,88 400,200" fill="#04000f" opacity="0.96" />
                    <rect x="0" y="185" width="400" height="15" fill="#02000a" opacity="0.99" />
                  </svg>
                )}

                {/* ── 🌿 FOREST: Lush trees, sun rays, lily */}
                {isForestScene && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyFo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#02080a" /><stop offset="30%" stopColor="#062a1a" /><stop offset="65%" stopColor="#0d5228" /><stop offset="100%" stopColor="#145a30" />
                      </linearGradient>
                      <radialGradient id="sunFo" cx="70%" cy="20%" r="30%">
                        <stop offset="0%" stopColor="#fff8c0" stopOpacity="0.9" /><stop offset="40%" stopColor="#a8e880" stopOpacity="0.3" /><stop offset="100%" stopColor="#0d5228" stopOpacity="0" />
                      </radialGradient>
                      <filter id="foBlur"><feGaussianBlur stdDeviation="3" /></filter>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyFo)" />
                    <ellipse cx="280" cy="40" rx="100" ry="80" fill="url(#sunFo)" />
                    {/* Sun */}
                    <circle cx="285" cy="30" r="12" fill="#fff8a0" opacity="0.88" />
                    <circle cx="285" cy="30" r="9" fill="#ffffc0" />
                    {/* Sun rays through trees */}
                    {[200, 220, 240, 260, 280, 300, 320].map((x, i) => (
                      <line key={i} x1={285} y1={30} x2={x} y2={200} stroke="rgba(200,255,150,0.06)" strokeWidth={3 + i % 3} />
                    ))}
                    {/* Background forest */}
                    <polygon points="0,200 0,90 25,50 50,80 75,40 100,70 125,35 150,65 175,30 200,60 225,25 250,55 275,20 300,50 325,30 350,60 375,40 400,70 400,200" fill="#062010" opacity="0.75" />
                    {/* Mid forest */}
                    <polygon points="0,200 0,120 20,90 40,115 65,80 90,110 115,70 140,100 165,65 190,100 215,70 240,105 265,60 290,95 315,75 340,100 365,80 390,105 400,95 400,200" fill="#0a2d14" opacity="0.85" />
                    {/* Ground/water */}
                    <rect x="0" y="175" width="400" height="25" fill="#062010" opacity="0.95" />
                    {/* Water */}
                    <ellipse cx="200" cy="185" rx="120" ry="12" fill="#0a3828" opacity="0.6" />
                    {/* Water shimmer */}
                    <line x1="130" y1="183" x2="170" y2="183" stroke="rgba(150,255,200,0.2)" strokeWidth="1.5"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" /></line>
                    <line x1="200" y1="186" x2="230" y2="186" stroke="rgba(150,255,200,0.15)" strokeWidth="1"><animate attributeName="opacity" values="0.15;0.4;0.15" dur="4s" repeatCount="indefinite" /></line>
                    {/* Large trees foreground */}
                    {[[10, 200], [30, 210], [380, 195], [355, 205]].map(([x, h], i) => (
                      <g key={i}>
                        <rect x={x + 4} y={200 - h / 3} width="6" height={h / 3} fill="#061004" />
                        <polygon points={`${x},${200 - h / 3} ${x + 7},${200 - h} ${x + 14},${200 - h / 3}`} fill="#0d2808" />
                        <polygon points={`${x - 3},${200 - h / 3 + 20} ${x + 7},${200 - h + 20} ${x + 17},${200 - h / 3 + 20}`} fill="#143010" />
                      </g>
                    ))}
                    {/* Lily pads */}
                    <ellipse cx="175" cy="183" rx="14" ry="5" fill="#1a6228" opacity="0.7" />
                    <circle cx="175" cy="181" r="5" fill="#ff9ec0" opacity="0.75" />
                    <ellipse cx="220" cy="187" rx="11" ry="4" fill="#1a6228" opacity="0.55" />
                    <circle cx="220" cy="185" r="4" fill="#fff" opacity="0.6" />
                    <ellipse cx="250" cy="184" rx="9" ry="3.5" fill="#1a6228" opacity="0.5" />
                    <circle cx="250" cy="182" r="3.5" fill="#ffccf0" opacity="0.6" />
                    {/* Fireflies */}
                    {[[80, 130], [150, 110], [260, 125], [340, 118]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="2" fill="#ccff80" opacity="0">
                        <animate attributeName="opacity" values={`0;0;0.8;0;0;0;0`} dur={`${3 + i}s`} begin={`${i * 1.2}s`} repeatCount="indefinite" />
                        <animate attributeName="cx" values={`${x};${x + 4};${x - 2};${x}`} dur={`${4 + i}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    {/* Bird */}
                    <path d="M100,48 Q104,44 109,48" stroke="rgba(200,255,180,0.5)" strokeWidth="1.2" fill="none"><animateTransform attributeName="transform" type="translate" values="0,0;80,-10;160,5" dur="10s" repeatCount="indefinite" /></path>
                  </svg>
                )}


                {/* ── 🌊 OCEAN: Deep sea with bioluminescence */}
                {isOcean && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyOc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#000d1a" /><stop offset="35%" stopColor="#001a33" /><stop offset="65%" stopColor="#003366" /><stop offset="100%" stopColor="#0055aa" />
                      </linearGradient>
                      <radialGradient id="moonOc" cx="70%" cy="18%" r="12%">
                        <stop offset="0%" stopColor="#e8f0ff" stopOpacity="1" /><stop offset="100%" stopColor="#6080ff" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyOc)" />
                    {/* Stars */}
                    {[[30, 15], [80, 8], [150, 20], [220, 6], [290, 18], [360, 10], [50, 40], [180, 35], [310, 42], [130, 12], [250, 25], [380, 32]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={0.8 + i % 3 * 0.4} fill="white" opacity={0.3 + i % 5 * 0.1}><animate attributeName="opacity" values={`${0.3 + i % 5 * 0.1};0.9;${0.3 + i % 5 * 0.1}`} dur={`${2 + i % 5}s`} repeatCount="indefinite" /></circle>
                    ))}
                    <circle cx="280" cy="35" r="14" fill="url(#moonOc)" opacity="0.9" />
                    <circle cx="280" cy="35" r="10" fill="#d0e0ff" opacity="0.95" />
                    {/* Moon reflection on water */}
                    <ellipse cx="280" cy="165" rx="8" ry="20" fill="rgba(200,220,255,0.08)" transform="scale(1,-1) translate(0,-330)" />
                    {/* Ocean waves */}
                    {[130, 145, 158, 170, 182].map((y, i) => (
                      <path key={i} d={`M0,${y} Q50,${y - 8 + i * 2} 100,${y} Q150,${y + 8 - i * 2} 200,${y} Q250,${y - 8 + i * 2} 300,${y} Q350,${y + 8 - i * 2} 400,${y} L400,200 L0,200 Z`}
                        fill={`rgba(0,${60 + i * 20},${120 + i * 25},${0.3 + i * 0.12})`}>
                        <animateTransform attributeName="transform" type="translate" values={`${i % 2 === 0 ? '-20' : 20},0;${i % 2 === 0 ? 20 : -20},0;${i % 2 === 0 ? '-20' : 20},0`} dur={`${4 + i}s`} repeatCount="indefinite" />
                      </path>
                    ))}
                    {/* Bioluminescence dots */}
                    {[[60, 155], [120, 162], [200, 158], [270, 165], [340, 160], [90, 170], [180, 175], [300, 172]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={1.5 + i % 3} fill="#40a0ff" opacity="0">
                        <animate attributeName="opacity" values="0;0.6;0;0.4;0" dur={`${3 + i}s`} begin={`${i * 0.8}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    {/* Distant ship silhouette */}
                    <rect x="60" y="128" width="20" height="4" fill="#001020" opacity="0.7" />
                    <rect x="67" y="120" width="3" height="8" fill="#001020" opacity="0.7" />
                  </svg>
                )}

                {/* ── 🌸 SAKURA: Cherry blossom night garden */}
                {isSakura && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skySk" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d0010" /><stop offset="30%" stopColor="#2d0035" /><stop offset="60%" stopColor="#6b1060" /><stop offset="85%" stopColor="#b04080" /><stop offset="100%" stopColor="#e080a0" />
                      </linearGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skySk)" />
                    {/* Full moon */}
                    <circle cx="300" cy="40" r="22" fill="rgba(255,240,255,0.15)" />
                    <circle cx="300" cy="40" r="16" fill="#ffe8f8" opacity="0.92" />
                    <circle cx="300" cy="40" r="14" fill="#fff0fa" />
                    {/* Stars */}
                    {[[20, 15], [70, 22], [140, 10], [200, 18], [250, 8], [360, 25], [50, 35], [160, 40], [330, 15]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="1" fill="#ffd0e8" opacity={0.4 + i % 4 * 0.1}><animate attributeName="opacity" values={`${0.3 + i % 4 * 0.1};0.8;${0.3 + i % 4 * 0.1}`} dur={`${2 + i % 6}s`} repeatCount="indefinite" /></circle>
                    ))}
                    {/* Sakura tree trunk */}
                    <rect x="45" y="100" width="10" height="100" rx="3" fill="#1a0820" />
                    <rect x="355" y="120" width="8" height="80" rx="3" fill="#1a0820" />
                    {/* Sakura branches */}
                    <path d="M50,140 Q20,100 10,60" stroke="#1a0820" strokeWidth="4" fill="none" />
                    <path d="M50,130 Q80,90 100,50" stroke="#1a0820" strokeWidth="3.5" fill="none" />
                    <path d="M50,120 Q30,80 50,40" stroke="#1a0820" strokeWidth="3" fill="none" />
                    <path d="M359,150 Q390,110 395,70" stroke="#1a0820" strokeWidth="3.5" fill="none" />
                    <path d="M359,140 Q330,100 310,55" stroke="#1a0820" strokeWidth="3" fill="none" />
                    {/* Petals on branches */}
                    {[[10, 62], [20, 75], [35, 55], [55, 42], [80, 52], [100, 52], [310, 57], [330, 62], [365, 68], [385, 72], [350, 90], [300, 70]].map(([x, y], i) => (
                      <g key={i}>
                        <circle cx={x} cy={y} r={6 + i % 3 * 2} fill={i % 3 === 0 ? "#ff90c0" : i % 3 === 1 ? "#ffb0d0" : "#ffd0e8"} opacity="0.85" />
                        <circle cx={x + 2} cy={y - 2} r={4 + i % 3} fill={i % 3 === 0 ? "#ffb0d5" : i % 3 === 1 ? "#ffc8e0" : "#ffe0f0"} opacity="0.7" />
                      </g>
                    ))}
                    {/* Falling petals */}
                    {[[80, 80], [160, 60], [230, 90], [310, 75], [170, 110], [250, 130], [120, 140]].map(([x, y], i) => (
                      <ellipse key={i} cx={x} cy={y} rx="4" ry="3" fill={i % 2 === 0 ? "#ff90c0" : "#ffc0d8"} opacity="0.6" transform={`rotate(${i * 30})`}>
                        <animateTransform attributeName="transform" type="translate" values={`0,0;${(i % 2 === 0 ? -1 : 1) * 15},${30 + i * 8};${(i % 2 === 0 ? -1 : 1) * 8},${60 + i * 15}`} dur={`${4 + i * 0.8}s`} repeatCount="indefinite" />
                      </ellipse>
                    ))}
                    {/* Ground / path */}
                    <ellipse cx="200" cy="195" rx="200" ry="25" fill="#180020" opacity="0.8" />
                    {/* Stone lantern */}
                    <rect x="185" y="165" width="30" height="20" rx="2" fill="#1a0820" />
                    <rect x="180" y="178" width="40" height="5" fill="#1a0820" />
                    <rect x="190" y="150" width="20" height="18" rx="1" fill="#1a0820" />
                    <rect x="193" y="153" width="14" height="12" fill="#ffcc44" opacity="0.7">
                      <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite" />
                    </rect>
                  </svg>
                )}

                {/* ── 🌠 NORTHERN LIGHTS: Aurora borealis */}
                {isNorthern && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyAu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#000005" /><stop offset="50%" stopColor="#000318" /><stop offset="100%" stopColor="#001033" />
                      </linearGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyAu)" />
                    {/* Aurora curtains */}
                    {[
                      { x: 0, c1: "#00ff80", c2: "#00cc40", d: "5s", dx: "15" },
                      { x: 60, c1: "#40ffaa", c2: "#00aa60", d: "7s", dx: "-10" },
                      { x: 150, c1: "#80ffcc", c2: "#20cc80", d: "6s", dx: "20" },
                      { x: 240, c1: "#00ddff", c2: "#0099cc", d: "8s", dx: "-15" },
                      { x: 320, c1: "#60eeff", c2: "#00aadd", d: "5.5s", dx: "10" },
                    ].map((a, i) => (
                      <g key={i}>
                        <path d={`M${a.x},0 Q${a.x + 30},80 ${a.x + 20},160 L${a.x + 60},160 Q${a.x + 50},80 ${a.x + 80},0`} fill={a.c1} opacity="0.12">
                          <animateTransform attributeName="transform" type="translate" values={`0,0;${a.dx},20;0,0`} dur={a.d} repeatCount="indefinite" />
                        </path>
                        <path d={`M${a.x + 10},0 Q${a.x + 40},60 ${a.x + 30},140 L${a.x + 50},140 Q${a.x + 60},60 ${a.x + 70},0`} fill={a.c2} opacity="0.15">
                          <animateTransform attributeName="transform" type="translate" values={`0,0;${-parseInt(a.dx)},15;0,0`} dur={a.d} repeatCount="indefinite" />
                        </path>
                      </g>
                    ))}
                    {/* Purple aurora hint */}
                    <path d="M100,0 Q200,100 300,0" fill="#8040ff" opacity="0.06" />
                    {/* Stars */}
                    {[[15, 12], [55, 8], [100, 20], [165, 6], [220, 15], [275, 9], [330, 18], [385, 5], [40, 30], [130, 28], [250, 32], [370, 25], [80, 45], [200, 42], [320, 48]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={0.7 + i % 3 * 0.4} fill="white" opacity={0.5 + i % 4 * 0.1}><animate attributeName="opacity" values={`${0.4 + i % 4 * 0.1};1;${0.4 + i % 4 * 0.1}`} dur={`${1.5 + i % 6 * 0.4}s`} repeatCount="indefinite" /></circle>
                    ))}
                    {/* Ground / snow */}
                    <polygon points="0,200 0,165 40,145 80,160 120,140 160,158 200,138 240,155 280,142 320,158 360,145 400,162 400,200" fill="#000e22" opacity="0.95" />
                    {/* Snow sparkles */}
                    {[[30, 170], [90, 162], [170, 155], [250, 162], [330, 158], [380, 168]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r="1.5" fill="white" opacity="0.4"><animate attributeName="opacity" values="0.2;0.7;0.2" dur={`${2 + i}s`} repeatCount="indefinite" /></circle>
                    ))}
                    {/* Pine trees silhouettes */}
                    {[[-5, 0], [15, 8], [350, 0], [375, 10]].map(([x, off], i) => (
                      <polygon key={i} points={`${x + 8},165 ${x + 8},${130 - off} ${x},${150 - off} ${x + 16},${150 - off}`} fill="#000813" opacity="0.9" />
                    ))}
                  </svg>
                )}

                {/* ── 🌋 VOLCANO: Eruption at night */}
                {isVolcano && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyVo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#020000" /><stop offset="25%" stopColor="#1a0000" /><stop offset="55%" stopColor="#4a0800" /><stop offset="80%" stopColor="#c02000" /><stop offset="100%" stopColor="#ff4000" />
                      </linearGradient>
                      <radialGradient id="eruption" cx="50%" cy="40%" r="35%">
                        <stop offset="0%" stopColor="#ff8800" stopOpacity="0.8" /><stop offset="50%" stopColor="#ff4400" stopOpacity="0.3" /><stop offset="100%" stopColor="#cc0000" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyVo)" />
                    {/* Glow from eruption */}
                    <ellipse cx="200" cy="80" rx="120" ry="80" fill="url(#eruption)" />
                    {/* Sparks / lava particles */}
                    {[[185, 75], [200, 60], [215, 70], [195, 85], [205, 65], [190, 90], [210, 80], [198, 55]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={2 + i % 3} fill={i % 3 === 0 ? "#ff8800" : i % 3 === 1 ? "#ffcc00" : "#ff4400"} opacity="0">
                        <animate attributeName="opacity" values="0;0.9;0;0.7;0" dur={`${0.5 + i * 0.3}s`} repeatCount="indefinite" />
                        <animateTransform attributeName="transform" type="translate" values={`0,0;${(i % 2 === 0 ? -1 : 1) * 20},-${30 + i * 5};${(i % 2 === 0 ? -1 : 1) * 10},${10 + i * 3}`} dur={`${0.8 + i * 0.2}s`} repeatCount="indefinite" />
                      </circle>
                    ))}
                    {/* Smoke cloud */}
                    <ellipse cx="195" cy="45" rx="40" ry="25" fill="rgba(80,20,0,0.4)"><animate attributeName="ry" values="20;30;20" dur="3s" repeatCount="indefinite" /></ellipse>
                    <ellipse cx="210" cy="30" rx="30" ry="20" fill="rgba(60,15,0,0.3)" />
                    {/* Mountain silhouette */}
                    <polygon points="0,200 0,180 80,180 160,60 200,55 240,60 320,180 400,180 400,200" fill="#0a0000" opacity="0.97" />
                    {/* Lava flow */}
                    <path d="M185,90 Q180,120 175,150 Q170,170 165,185 L185,185 Q190,160 195,130 Q200,110 200,90 Z" fill="#ff5500" opacity="0.7" />
                    <path d="M200,90 Q205,115 210,140 Q215,165 220,185 L200,185 Q198,160 197,130 Q196,110 200,90 Z" fill="#ff3300" opacity="0.6" />
                    {/* Lava glow on ground */}
                    <ellipse cx="185" cy="185" rx="20" ry="8" fill="#ff4400" opacity="0.3" />
                    {/* Distant mountains */}
                    <polygon points="0,200 0,150 60,110 100,140 0,150" fill="#0a0000" opacity="0.8" />
                    <polygon points="400,200 400,145 340,105 300,135 400,145" fill="#0a0000" opacity="0.8" />
                  </svg>
                )}

                {/* ── 🌄 DAWN: Mountain sunrise reflection */}
                {isDawn && (
                  <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="skyDw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#000208" /><stop offset="20%" stopColor="#020418" /><stop offset="45%" stopColor="#08103a" /><stop offset="65%" stopColor="#301860" /><stop offset="82%" stopColor="#804090" /><stop offset="100%" stopColor="#e09040" />
                      </linearGradient>
                      <radialGradient id="sunDw" cx="50%" cy="80%" r="40%">
                        <stop offset="0%" stopColor="#ffeeaa" stopOpacity="0.7" /><stop offset="50%" stopColor="#ff9020" stopOpacity="0.25" /><stop offset="100%" stopColor="#8020a0" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <rect width="400" height="200" fill="url(#skyDw)" />
                    <ellipse cx="200" cy="200" rx="150" ry="80" fill="url(#sunDw)" />
                    {/* Pre-dawn stars */}
                    {[[25, 15], [75, 8], [140, 20], [210, 6], [280, 14], [350, 9], [55, 32], [170, 28], [320, 35], [100, 10], [240, 22]].map(([x, y], i) => (
                      <circle key={i} cx={x} cy={y} r={0.8 + i % 3 * 0.3} fill={i % 3 === 0 ? "white" : "#d0b0ff"} opacity={0.3 + i % 5 * 0.08}><animate attributeName="opacity" values={`${0.2 + i % 5 * 0.08};0.7;${0.2 + i % 5 * 0.08}`} dur={`${2 + i % 7 * 0.4}s`} repeatCount="indefinite" /></circle>
                    ))}
                    {/* Planet / Venus */}
                    <circle cx="320" cy="45" r="3" fill="#fff8cc" opacity="0.9"><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite" /></circle>
                    {/* Mountains - snow capped */}
                    <polygon points="0,200 0,130 60,70 120,115 180,50 240,95 300,60 360,100 400,80 400,200" fill="#0c0828" opacity="0.92" />
                    {/* Snow caps */}
                    <polygon points="175,52 180,50 185,52 183,60 177,60" fill="rgba(220,200,255,0.4)" />
                    <polygon points="55,72 60,70 65,72 63,82 57,82" fill="rgba(220,200,255,0.35)" />
                    <polygon points="295,62 300,60 305,62 303,72 297,72" fill="rgba(220,200,255,0.3)" />
                    {/* Lake reflection */}
                    <rect x="0" y="162" width="400" height="38" fill="#04030e" opacity="0.92" />
                    {/* Reflection shimmer */}
                    {[[100, 170], [200, 175], [300, 168], [150, 180], [250, 178]].map(([x, y], i) => (
                      <line key={i} x1={x - 15} y1={y} x2={x + 15} y2={y} stroke="rgba(200,150,255,0.15)" strokeWidth="1"><animate attributeName="opacity" values="0.1;0.4;0.1" dur={`${2 + i}s`} repeatCount="indefinite" /></line>
                    ))}
                    {/* Mist over lake */}
                    <rect x="0" y="158" width="400" height="10" fill="rgba(200,150,255,0.04)" filter="url(#foBlur)" />
                    {/* Foreground ground */}
                    <rect x="0" y="185" width="400" height="15" fill="#04020c" opacity="0.98" />
                    {/* Reed silhouettes */}
                    {[[30, 185], [50, 183], [360, 185], [380, 183]].map(([x, y], i) => (
                      <rect key={i} x={x} y={y - 20} width="2" height="20" fill="#04020c" opacity="0.9" />
                    ))}
                  </svg>
                )}

              </div>
            );
          })()}

          {/* ── Gradient overlay for text readability */}
          <div style={{
            position: "absolute", inset: 0, zIndex: 1,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.4) 100%)"
          }} />

          {/* ── Card Content */}
          <div style={{ position: "relative", zIndex: 2, padding: "20px 22px" }}>
            {/* Top row: profile + time */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 54, height: 54, borderRadius: 17,
                background: `linear-gradient(135deg,${accent.v},${accent.g})`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, flexShrink: 0,
                boxShadow: `0 6px 24px ${accent.v}60`,
                border: `2px solid ${accent.v}90`
              }}>{(profiles.find(p => p.id === activeProfile) || profiles[0]).icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: `${accent.v}dd`, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  {(() => { const s = greetScene === "auto" ? liveHour >= 5 && liveHour < 12 ? "morning" : liveHour >= 12 && liveHour < 18 ? "afternoon" : liveHour >= 18 && liveHour < 21 ? "evening" : "night" : greetScene; return s === "morning" ? "🌅 Good Morning" : s === "afternoon" ? "☀️ Good Afternoon" : s === "evening" ? "🌆 Good Evening" : s === "galaxy" ? "🌌 Hello, Explorer" : s === "forest" ? "🌿 Hello, Nature Lover" : "🌙 Good Night"; })()}
                </div>
                {/* White Anime Cat Widget */}
                 <div onClick={() => setShowPetRoom(true)} style={{ cursor: 'pointer' }} title="Visit Neko's Room">
                   <AnimePet streak={gamStats.streak} overdue={overdueCount} xp={xp} activeItems={activeItems} />
                 </div>

                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 21, color: "#e8eaf8", lineHeight: 1.1, marginTop: 2 }}>
                  {(profiles.find(p => p.id === activeProfile) || profiles[0]).name}
                </div>
                <div style={{ fontSize: 11, color: "rgba(200,200,220,0.6)", marginTop: 3 }}>
                  {liveHour < 5 ? "Rest up — big things tomorrow ✨" : liveHour < 12 ? "Let's make today count! 🚀" : liveHour < 17 ? "Keep the momentum going 💪" : liveHour < 21 ? "Evening grind — finishing strong 🔥" : "Wrap up your day well 🌙"}
                </div>
              </div>
              {/* Live clock */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, color: accent.v, lineHeight: 1, letterSpacing: 1.5 }}>
                  {String(liveHour).padStart(2, "0")}:{String(liveMin).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 9.5, color: "rgba(180,180,210,0.6)", marginTop: 3, letterSpacing: .5 }}>
                  {new Date().toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })}
                </div>
              </div>
            </div>

            {/* Progress row */}
            <div style={{ background: "rgba(255,255,255,.09)", borderRadius: 14, padding: "11px 15px", display: "flex", alignItems: "center", gap: 14, backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(180,180,210,0.7)", fontWeight: 600 }}>Today's Progress</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: accent.v }}>{pct}%</span>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .8s cubic-bezier(.34,1.56,.64,1)" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, flexShrink: 0 }}>
                {[{ icon: "✅", val: doneCount, lbl: "done" }, { icon: "⏳", val: activeCount, lbl: "left" }, { icon: "⚠️", val: overdueCount, lbl: "late", warn: overdueCount > 0 }].map(s => (
                  <div key={s.lbl} style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: s.warn ? "#ff6b6b" : accent.v }}>{s.val}</div>
                    <div style={{ fontSize: 9, color: "rgba(160,160,200,0.6)" }}>{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Smart status */}
            {activeCount > 0 && (
              <div style={{ marginTop: 9, fontSize: 11.5, color: "rgba(220,220,240,0.85)", background: "rgba(255,255,255,.07)", borderRadius: 9, padding: "7px 12px", display: "flex", alignItems: "center", gap: 7, backdropFilter: "blur(8px)" }}>
                <span>{overdueCount > 0 ? "⚠️" : profileTasks.filter(x => x.due === todayStr() && !x.done).length > 0 ? "📅" : "✨"}</span>
                <span style={{ color: "rgba(200,200,230,0.8)" }}>{overdueCount > 0 ? `${overdueCount} overdue — tackle these first!` : profileTasks.filter(x => x.due === todayStr() && !x.done).length > 0 ? `${profileTasks.filter(x => x.due === todayStr() && !x.done).length} due today — stay on track!` : `${activeCount} task${activeCount > 1 ? "s" : ""} in progress — keep going!`}</span>
              </div>
            )}
            {activeCount === 0 && doneCount > 0 && (
              <div style={{ marginTop: 9, fontSize: 12, color: "#6bcb77", background: "rgba(107,203,119,.12)", borderRadius: 9, padding: "7px 12px", textAlign: "center", border: "1px solid rgba(107,203,119,.2)" }}>🎉 All tasks complete! Absolutely incredible work today!</div>
            )}
          </div>
        </div>


        {/* ☀️ Smart Daily Digest */}
        {(() => {
          const d = getDailyDigest();
          return (
            <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "13px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>☀️ Daily Digest</div>
              <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6, marginBottom: 10 }}>{d.suggestion}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {d.dueToday.length > 0 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(255,217,61,.15)", color: "#ffd93d", fontWeight: 700, border: "1px solid rgba(255,217,61,.3)" }}>📅 {d.dueToday.length} due today</span>}
                {d.overdue.length > 0 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(255,107,107,.15)", color: "var(--red)", fontWeight: 700, border: "1px solid rgba(255,107,107,.3)" }}>⚠️ {d.overdue.length} overdue</span>}
                {d.completedToday.length > 0 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(107,203,119,.15)", color: "#6bcb77", fontWeight: 700, border: "1px solid rgba(107,203,119,.3)" }}>✅ {d.completedToday.length} done today</span>}
                {d.streak > 1 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: `${accent.v}18`, color: accent.v, fontWeight: 700, border: `1px solid ${accent.v}30` }}>🔥 {d.streak} day streak</span>}
                {d.avgMoodLast7 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "rgba(200,180,255,.15)", color: "#c4b5fd", fontWeight: 700, border: "1px solid rgba(200,180,255,.3)" }}>😊 Mood {d.avgMoodLast7}/5</span>}
              </div>
            </div>
          );
        })()}

        {/* 🧠 Smart Deadline Suggestions */}
        {(() => {
          const dlSuggestions = getDeadlineSuggestions();
          if (dlSuggestions.length === 0) return null;
          return (
            <div style={{ background: `${accent.v}10`, border: `1px solid ${accent.v}28`, borderRadius: 16, padding: "13px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: accent.v, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>🧠 Smart Deadline Insights</div>
              {dlSuggestions.map((s, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: i < dlSuggestions.length - 1 ? 10 : 0, paddingBottom: i < dlSuggestions.length - 1 ? 10 : 0, borderBottom: i < dlSuggestions.length - 1 ? "1px solid var(--b1)" : "none" }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{s.catIcon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, color: "var(--t1)", fontWeight: 600, marginBottom: 2 }}>{s.taskTitle}</div>
                    <div style={{ fontSize: 11.5, color: "var(--t2)", lineHeight: 1.5 }}>{s.suggestion}</div>
                  </div>
                  <button onClick={() => { setTasks(ts => ts.map(t => t.id === s.taskId ? { ...t, due: s.newDue } : t)); showNotif("📅 Deadline extended!", s.taskTitle); }} style={{ flexShrink: 0, height: 30, padding: "0 11px", background: `${accent.v}20`, border: `1px solid ${accent.v}40`, borderRadius: 9, color: accent.v, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+3 days</button>
                </div>
              ))}
            </div>
          );
        })()}

        {/* 😊 Mood × Productivity Insight */}
        {(() => {
          if (moods.length < 5 || tasks.filter(t => t.done).length < 5) return null;
          const highMoodDays = moods.filter(m => m.energy >= 4).map(m => m.date);
          const lowMoodDays = moods.filter(m => m.energy <= 2).map(m => m.date);
          if (highMoodDays.length < 2 || lowMoodDays.length < 2) return null;
          const tasksOnHigh = tasks.filter(t => t.done && highMoodDays.includes(t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : "")).length;
          const tasksOnLow = tasks.filter(t => t.done && lowMoodDays.includes(t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : "")).length;
          const highAvg = (tasksOnHigh / highMoodDays.length).toFixed(1);
          const lowAvg = (tasksOnLow / lowMoodDays.length).toFixed(1);
          const pctDiff = lowAvg > 0 ? Math.round(((highAvg - lowAvg) / lowAvg) * 100) : 0;
          if (pctDiff < 10) return null;
          return (
            <div style={{ background: "rgba(200,180,255,.08)", border: "1px solid rgba(200,180,255,.2)", borderRadius: 16, padding: "13px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#c4b5fd", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>😊 Mood × Productivity</div>
              <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                <div style={{ flex: 1, background: "rgba(107,203,119,.1)", borderRadius: 11, padding: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 2 }}>😊🤩</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: "#6bcb77" }}>{highAvg}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>tasks/day</div>
                  <div style={{ fontSize: 9, color: "#6bcb77", fontWeight: 700 }}>GOOD MOOD</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", fontSize: 18, color: "var(--t3)" }}>→</div>
                <div style={{ flex: 1, background: "rgba(255,107,107,.1)", borderRadius: 11, padding: "10px", textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 2 }}>😩😔</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: "#ff6b6b" }}>{lowAvg}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 1 }}>tasks/day</div>
                  <div style={{ fontSize: 9, color: "#ff6b6b", fontWeight: 700 }}>LOW MOOD</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.6 }}>
                You complete <strong style={{ color: "#6bcb77" }}>{pctDiff}% more tasks</strong> on good mood days.
                {pctDiff >= 50 ? " That's a huge difference — prioritise self-care on low days." : " Small habits like exercise and sleep can close this gap."}
              </div>
            </div>
          );
        })()}



        {/* Today's Progress Bar */}
        {(() => {
          const todayTasks = profileTasks.filter(t => t.due === todayStr() || t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === todayStr());
          const todayDone = todayTasks.filter(t => t.done).length;
          const todayTotal = todayTasks.length;
          const pct2 = todayTotal > 0 ? Math.round((todayDone / todayTotal) * 100) : 0;
          if (todayTotal === 0) return null;
          return (
            <div style={{ padding: "0 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 11.5 }}>
                <span style={{ color: "var(--t2)", fontWeight: 600 }}>Today's progress</span>
                <span style={{ color: accent.v, fontWeight: 800 }}>{todayDone}/{todayTotal} tasks · {pct2}%</span>
              </div>
              <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct2}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .6s cubic-bezier(.4,0,.2,1)", boxShadow: pct2 > 0 ? `0 0 8px ${accent.v}60` : "none" }} />
              </div>
            </div>
          );
        })()}
        {/* == DAILY CHALLENGE == */}
        {dailyChallenge && !challengeDone && (
          <div style={{ background: `linear-gradient(135deg,${accent.v}15,${accent.g}08)`, border: `1.5px solid ${accent.v}35`, borderRadius: 16, padding: "13px 15px", marginBottom: 12, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, boxShadow: `0 4px 14px ${accent.v}50` }}>🎯</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: accent.v, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Today's Challenge</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", lineHeight: 1.4 }}>{dailyChallenge.text}</div>
            </div>
            <button onClick={() => { setChallengeDone(true); awardXP(50, "Daily challenge"); showNotif("🎯 Challenge complete!", "50 XP earned!"); fireConfetti(); haptic("success"); }} style={{ flexShrink: 0, height: 32, padding: "0 12px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", borderRadius: 10, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Done! ✓</button>
          </div>
        )}
        {challengeDone && (
          <div style={{ background: "rgba(107,203,119,.12)", border: "1px solid rgba(107,203,119,.3)", borderRadius: 14, padding: "10px 14px", marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#6bcb77", flex: 1 }}>Daily challenge complete! +50 XP</span>
            <span style={{ fontSize: 18 }}>🏆</span>
          </div>
        )}

        {/* AI Top Suggestion Banner */}
        {aiSuggestions.length > 0 && aiSuggestions[0] && (
          <div onClick={() => setShowSuggestionsPanel(true)} style={{ display: "flex", alignItems: "center", gap: 12, background: `${aiSuggestions[0].color}18`, border: `1px solid ${aiSuggestions[0].color}33`, borderRadius: 14, padding: "11px 14px", marginBottom: 14, cursor: "pointer", transition: "all .2s" }}>
            <span style={{ fontSize: 22 }}>{aiSuggestions[0].icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: aiSuggestions[0].color }}>{aiSuggestions[0].title}</div>
              <div style={{ fontSize: 11.5, color: "var(--t2)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aiSuggestions[0].body}</div>
            </div>
            {aiSuggestions.length > 1 && <span style={{ fontSize: 11, background: aiSuggestions[0].color + "22", color: aiSuggestions[0].color, fontWeight: 700, padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>+{aiSuggestions.length - 1}</span>}
            <span style={{ color: "var(--t3)", fontSize: 14 }}>›</span>
          </div>
        )}
        <div className="stats-row">
          {[{ lbl: t.total, val: total, fill: accent.v, p: 100 }, { lbl: t.done, val: doneCount, fill: "#6bcb77", p: pct }, { lbl: t.active, val: activeCount, fill: "#ffd93d", p: total ? (activeCount / total) * 100 : 0 }, { lbl: t.overdue, val: overdueCount, fill: "#ff6b6b", p: total ? (overdueCount / total) * 100 : 0 }].map(s => (
            <div className="stat" key={s.lbl} style={{ "--stat-color": s.fill }}>
              <div className="stat-val">{s.val}</div>
              <div className="stat-lbl">{s.lbl}</div>
              <div className="stat-bar"><div className="stat-bar-f" style={{ width: `${s.p}%`, background: s.fill }} /></div>
            </div>
          ))}
        </div>
        <div className="prog-card">
          <svg width="54" height="54" className="ring-svg" viewBox="0 0 54 54"><circle className="ring-bg" cx="27" cy="27" r="22" /><circle className="ring-fg" cx="27" cy="27" r="22" strokeDasharray={C} strokeDashoffset={dash} /></svg>
          <div className="prog-info">
            <div className="prog-pct">{pct}% {t.completed}</div>
            <div className="prog-sub">{doneCount} of {total} tasks</div>
            <div className="prio-chips">{Object.entries(PRIORITIES).map(([k, v]) => <span key={k} className="pchip" style={{ color: v.color, background: v.bg, border: `1px solid ${v.color}28` }}>{profileTasks.filter(x => x.priority === k && !x.done).length} {v.icon}</span>)}</div>
          </div>
        </div>

        {/* Anti-Burnout / Forgiveness Protocol */}
        {tab === "overdue" && overdueCount >= 3 && (
          <div style={{ background: "rgba(255,107,107,0.1)", border: "1px dashed rgba(255,107,107,0.4)", borderRadius: 16, padding: "16px 20px", marginBottom: 16, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", right: -20, top: -20, fontSize: 80, opacity: 0.05, transform: "rotate(15deg) scale(1.2)" }}>🤗</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--red)", marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
              <span>🤗</span> Overwhelmed? It's okay.
            </div>
            <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.5, marginBottom: 14, maxWidth: "90%" }}>
              You have {overdueCount} overdue tasks. Staring at them silently drains your energy. Want to swipe them clean to today and start fresh? No guilt.
            </div>
            <button onClick={() => {
              const today = todayStr();
              setTasks(ts => ts.map(tk => (tk.profileId === activeProfile && !tk.done && tk.due && new Date(tk.due) < new Date(today)) ? { ...tk, due: today } : tk));
              showNotif("✨ Slate clean", `All ${overdueCount} overdue tasks moved to today.`);
              play("success");
              setTimeout(() => setTab("today"), 600);
            }} style={{ background: "var(--red)", color: "#fff", border: "none", borderRadius: 10, padding: "8px 18px", fontSize: 12.5, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(255,107,107,0.3)", display: "flex", alignItems: "center", gap: 6, transition: "all .2s" }}>
              <span>✨</span> Reschedule All to Today
            </button>
          </div>
        )}

        {/* Energy Filter */}
        <div style={{ background: "var(--b2)", borderRadius: 12, padding: "6px 8px", display: "flex", gap: 6, marginBottom: 16, boxShadow: "inset 0 2px 5px rgba(0,0,0,0.03)" }}>
          <button style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: energyFilter === "all" ? "var(--v-bg, #7c6dfa)" : "transparent", color: energyFilter === "all" ? "#fff" : "var(--t3)", boxShadow: energyFilter === "all" ? "0 4px 12px rgba(124,109,250,0.3)" : "none", transition: "all .2s" }} onClick={() => setEnergyFilter("all")}>🔋 High Energy</button>
          <button style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: energyFilter === "med" ? "var(--v-bg, #7c6dfa)" : "transparent", color: energyFilter === "med" ? "#fff" : "var(--t3)", boxShadow: energyFilter === "med" ? "0 4px 12px rgba(124,109,250,0.3)" : "none", transition: "all .2s" }} onClick={() => setEnergyFilter("med")}>〽️ Medium</button>
          <button style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", background: energyFilter === "low" ? "var(--v-bg, #7c6dfa)" : "transparent", color: energyFilter === "low" ? "#fff" : "var(--t3)", boxShadow: energyFilter === "low" ? "0 4px 12px rgba(124,109,250,0.3)" : "none", transition: "all .2s" }} onClick={() => setEnergyFilter("low")}>🪫 Low Energy</button>
        </div>

        <div className="filter-bar">
          <span className={`fchip ${!showDone && !showStarred ? "on" : ""}`} onClick={() => { setShowDone(false); setShowStarred(false); }}>○ {t.active}</span>
          <span className={`fchip ${showDone ? "on" : ""}`} onClick={() => { setShowDone(true); setShowStarred(false); }}>✓ {t.done}</span>
          <span className={`fchip ${showStarred ? "on" : ""}`} onClick={() => { setShowStarred(true); setShowDone(false); }}>⭐ {t.starred}</span>
          {categories.map(c => <span key={c.id} className={`fchip ${filterCat === c.id ? "on" : ""}`} onClick={() => setFilterCat(fc => fc === c.id ? "all" : c.id)}>{c.icon} {c.name}</span>)}
        </div>
        <div className="sec-head">
          <div className="sec-title">{showStarred ? "⭐" : showDone ? "✓" : "○"} {t.tasks} ({viewTasks.length})</div>
          <div className="view-row">
            {taskOrder.length > 0 && viewMode === "list" && (
              <button onClick={() => { setTaskOrder([]); showNotif("↺ Order reset", "Back to sort order"); haptic("light"); }} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 700, border: `1.5px solid ${accent.v}55`, background: `${accent.v}15`, color: accent.v, cursor: "pointer", marginRight: 2, transition: "all .15s" }} title="Reset to default sort">↺ Reset</button>
            )}
            <div style={{ display: "flex", gap: 3 }}><button className={`vt-btn ${viewMode === "list" ? "on" : ""}`} onClick={() => setViewMode("list")}>☰</button><button className={`vt-btn ${viewMode === "grid" ? "on" : ""}`} onClick={() => setViewMode("grid")}>⊞</button></div>
            <button className="sort-btn" onClick={() => setSort(s => ({ created: "priority", priority: "due", due: "alpha", alpha: "created" }[s]))}>↕ {sort === "created" ? "Recent" : sort === "priority" ? "Priority" : sort === "due" ? "Due" : "A-Z"}</button>
            <button onClick={() => { setBulkMode(m => !m); setBulkSelected(new Set()); }} style={{ padding: "5px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1.5px solid ${bulkMode ? accent.v : "var(--b1)"}`, background: bulkMode ? "var(--accd)" : "var(--s2)", color: bulkMode ? accent.v : "var(--t2)", cursor: "pointer", marginLeft: 4, transition: "all .15s" }}>
              {bulkMode ? "✕" : "☑"}
            </button>
          </div>
        </div>
        {bulkMode && bulkSelected.size > 0 && (
          <div style={{ display: "flex", gap: 6, padding: "0 16px 10px" }}>
            <button onClick={bulkComplete} style={{ flex: 1, height: 34, borderRadius: 10, background: "rgba(107,203,119,.15)", border: "1px solid rgba(107,203,119,.4)", color: "#6bcb77", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>✅ Done ({bulkSelected.size})</button>
            <button onClick={bulkStar} style={{ flex: 1, height: 34, borderRadius: 10, background: "rgba(255,211,67,.1)", border: "1px solid rgba(255,211,67,.4)", color: "#ffd93d", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⭐ Star</button>
            <button onClick={bulkDelete} style={{ flex: 1, height: 34, borderRadius: 10, background: "rgba(255,107,107,.12)", border: "1px solid rgba(255,107,107,.35)", color: "var(--red)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>🗑 Delete</button>
          </div>
        )}
        {viewTasks.length === 0
          ? <div className="empty"><div className="empty-icon">{showDone ? "🎉" : "✦"}</div><div className="empty-t">{t.noTasks}</div><div className="empty-t" style={{ fontSize: 12, color: "var(--t3)" }}>{t.addFirst}</div></div>
          : <div
              className={viewMode === "grid" ? "task-grid" : "task-list"}
              onDragOver={e => e.preventDefault()}
            >
              {(viewMode === "list" && taskOrder.length > 0
                ? applyManualOrder(viewTasks, taskOrder)
                : viewTasks
              ).map(task => <TaskCard key={task.id} task={task} />)}
            </div>
        }

        {/* Floating Voice AI Button */}
        <button onClick={startVoiceAI} className={isVoiceTaskListening ? 'pulse' : ''} style={{ position: 'fixed', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28, background: isVoiceTaskListening ? '#ff6b6b' : 'var(--v-bg, #7c6dfa)', color: '#fff', border: 'none', boxShadow: isVoiceTaskListening ? '0 0 0 10px rgba(255,107,107,0.3)' : '0 8px 24px rgba(124,109,250,0.4)', fontSize: 24, cursor: 'pointer', zIndex: 50, transition: 'all .25s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isVoiceTaskListening ? '🎙️' : '🎤'}
        </button>
        \n</div>
    );
  };

  function StatsPage() {
    const now = new Date();
    const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toISOString().split("T")[0]; });
    const weekData = weekDays.map(d => ({
      day: new Date(d).toLocaleDateString("en-US", { weekday: "short" }),
      date: d,
      done: profileTasks.filter(x => x.done && (x.due === d || (x.createdAt && new Date(x.createdAt).toISOString().split('T')[0] === d))).length,
      added: profileTasks.filter(x => x.createdAt && new Date(x.createdAt).toISOString().split('T')[0] === d).length
    }));
    const maxBar = Math.max(...weekData.map(d => d.done + d.added), 1);
    const byCategory = categories.map(c => ({ ...c, count: profileTasks.filter(x => !x.done && x.categoryId === c.id).length })).filter(c => c.count > 0);
    const totalCat = byCategory.reduce((a, b) => a + b.count, 0) || 1;

    // == 30-day heatmap (GitHub style) ==
    const heatDays = Array.from({ length: 35 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 34 + i);
      const ds = d.toISOString().split("T")[0];
      const cnt = profileTasks.filter(x => x.done && x.createdAt && new Date(x.createdAt).toISOString().split('T')[0] === ds).length;
      return { ds, cnt, isToday: ds === todayStr(), dow: d.getDay() };
    });
    const maxHeat = Math.max(...heatDays.map(d => d.cnt), 1);

    // == Productivity score ==
    const last7Done = weekData.reduce((a, d) => a + d.done, 0);
    const prev7Done = (() => {
      const prevDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d.toISOString().split("T")[0]; });
      return profileTasks.filter(x => x.done && x.createdAt && prevDays.includes(new Date(x.createdAt).toISOString().split('T')[0])).length;
    })();
    const prodScore = Math.min(100, Math.round(
      (last7Done * 15) + (pct * 0.3) + (gamStats.streak * 2)
    ));
    const weekTrend = prev7Done === 0 ? 100 : Math.round(((last7Done - prev7Done) / prev7Done) * 100);

    // == Best day of week ==
    const byDow = [0, 1, 2, 3, 4, 5, 6].map(dow => {
      const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dow];
      const cnt = profileTasks.filter(x => x.done && x.createdAt && new Date(x.createdAt).getDay() === dow).length;
      return { dow, dayName, cnt };
    });
    const bestDow = byDow.reduce((a, b) => b.cnt > a.cnt ? b : a, byDow[0]);
    const maxDow = Math.max(...byDow.map(d => d.cnt), 1);

    // == Most productive hour ==
    const byHour = Array.from({ length: 24 }, (_, h) => {
      const cnt = profileTasks.filter(x => x.done && x.createdAt && new Date(x.createdAt).getHours() === h).length;
      return { h, cnt, label: h === 0 ? "12am" : h < 12 ? h + "am" : h === 12 ? "12pm" : (h - 12) + "pm" };
    });
    const peakHour = byHour.reduce((a, b) => b.cnt > a.cnt ? b : a, byHour[0]);
    const maxHour = Math.max(...byHour.map(h => h.cnt), 1);
    const peakHours = byHour.filter(h => h.h >= 6 && h.h <= 22); // show 6am-10pm

    // == Completion streak ==
    const streakDays = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 20 + i);
      const ds = d.toISOString().split("T")[0];
      return { ds, hasDone: profileTasks.some(x => x.done && x.createdAt && new Date(x.createdAt).toISOString().split('T')[0] === ds), isToday: ds === todayStr(), day: d.toLocaleDateString("en-US", { weekday: "short" }) };
    });

    // == Mood + Habit Correlation ==
    const habitsArr = habits.filter(h => !h.profileId || h.profileId === activeProfile);
    const moodCorrelation = MOOD_OPTIONS.map((opt, idx) => {
      const daysWithThisMood = moods.filter(m => (!m.profileId || m.profileId === activeProfile) && m.mood === idx);
      if (daysWithThisMood.length === 0) return { ...opt, avgCount: 0, sampleScale: 0 };
      let totalHabitsDone = 0;
      daysWithThisMood.forEach(md => {
        habitsArr.forEach(h => {
          if (h.completions[md.date]) totalHabitsDone++;
        });
      });
      return { ...opt, avgCount: parseFloat((totalHabitsDone / daysWithThisMood.length).toFixed(1)), sampleScale: daysWithThisMood.length };
    }).filter(opt => opt.sampleScale > 0);
    const maxMoodAvg = moodCorrelation.length > 0 ? Math.max(...moodCorrelation.map(m => m.avgCount)) : 1;

    const scoreColor = prodScore >= 80 ? "#6bcb77" : prodScore >= 50 ? accent.v : "#ffd93d";
    const scoreMsg = prodScore >= 80 ? "Absolutely crushing it 🔥" : prodScore >= 60 ? "Strong performance 💪" : prodScore >= 40 ? "Building momentum ⚡" : "Getting started 🌱";

    return (
      <div style={{ padding: "18px 18px 100px" }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 18 }}>{t.stats}</div>

        {/* ── Productivity Score */}
        <div style={{ background: `linear-gradient(135deg,${scoreColor}15,${scoreColor}08)`, border: `1px solid ${scoreColor}35`, borderRadius: 22, padding: "22px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: `${scoreColor}10` }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8" />
                <circle cx="44" cy="44" r="36" fill="none" stroke={scoreColor} strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={226} strokeDashoffset={226 * (1 - prodScore / 100)}
                  transform="rotate(-90 44 44)" style={{ transition: "stroke-dashoffset 1s ease" }} />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: scoreColor, lineHeight: 1 }}>{prodScore}</div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700 }}>SCORE</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>Productivity Score</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: "var(--t1)", marginBottom: 6 }}>{scoreMsg}</div>
              <div style={{ display: "flex", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: accent.v }}>{last7Done}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>tasks this week</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: weekTrend >= 0 ? "#6bcb77" : "#ff6b6b" }}>{weekTrend >= 0 ? "+" : ""}{weekTrend}%</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>vs last week</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#ffd93d" }}>🔥{gamStats.streak || 0}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)" }}>day streak</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { icon: "✅", val: doneCount, lbl: "Done", col: "#6bcb77" },
            { icon: "⏳", val: activeCount, lbl: "Active", col: accent.v },
            { icon: "⚠️", val: overdueCount, lbl: "Overdue", col: "#ff6b6b" },
            { icon: "📊", val: pct + "%", lbl: "Rate", col: accent.v },
          ].map(s => (
            <div key={s.lbl} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 14 }}>{s.icon}</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: s.col, lineHeight: 1.1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Activity Heatmap */}
        <div className="chart-card">
          <div className="chart-title">🔥 Activity Heatmap — Last 35 Days</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 8 }}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} style={{ fontSize: 9, color: "var(--t3)", textAlign: "center", fontWeight: 700 }}>{d}</div>
            ))}
            {heatDays.map((d, i) => {
              const intensity = d.cnt === 0 ? 0 : Math.max(0.15, d.cnt / maxHeat);
              return (
                <div key={i} title={`${d.ds}: ${d.cnt} tasks`} style={{
                  aspectRatio: "1", borderRadius: 5, cursor: "default", transition: "transform .1s",
                  background: d.cnt === 0 ? (d.isToday ? `${accent.v}25` : "var(--s2)") : `${accent.v}`,
                  opacity: d.cnt === 0 ? 1 : 0.2 + intensity * 0.8,
                  border: d.isToday ? `2px solid ${accent.v}` : "2px solid transparent",
                  boxShadow: d.cnt > 0 ? `0 2px 6px ${accent.v}40` : "none",
                }} />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 10, color: "var(--t3)" }}>
            <span>Less</span>
            {[0.15, 0.4, 0.65, 0.9].map((o, i) => (
              <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: accent.v, opacity: o }} />
            ))}
            <span>More</span>
          </div>
        </div>

        {/* ── Weekly Bar Chart */}
        <div className="chart-card">
          <div className="chart-title">📅 This Week — Daily Tasks</div>
          <div className="bar-chart">
            {weekData.map((d, i) => (
              <div key={i} className="bar-col">
                <div className="bar-val">{d.done || ""}</div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                  <div className="bar" style={{ height: `${(d.done / maxBar) * 80 + 4}px`, background: `linear-gradient(180deg,${accent.v},${accent.g})`, width: "100%", borderRadius: "4px 4px 0 0" }} />
                </div>
                <div className="bar-lbl" style={{ color: d.date === todayStr() ? accent.v : "var(--t3)", fontWeight: d.date === todayStr() ? 800 : 400 }}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Best Day of Week */}
        <div className="chart-card">
          <div className="chart-title">📆 Best Day of Week</div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 70, marginBottom: 8 }}>
            {byDow.map(d => (
              <div key={d.dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                <div style={{ fontSize: 9, color: d.dow === bestDow.dow ? accent.v : "var(--t3)", fontWeight: 800 }}>{d.cnt || ""}</div>
                <div style={{ width: "100%", borderRadius: "4px 4px 0 0", background: d.dow === bestDow.dow ? `linear-gradient(180deg,${accent.v},${accent.g})` : "var(--s3)", height: `${Math.max((d.cnt / maxDow) * 50, 4)}px`, transition: "height .5s ease" }} />
                <div style={{ fontSize: 9, color: d.dow === bestDow.dow ? accent.v : "var(--t3)", fontWeight: d.dow === bestDow.dow ? 800 : 400 }}>{d.dayName}</div>
              </div>
            ))}
          </div>
          {bestDow.cnt > 0 && <div style={{ fontSize: 12, color: "var(--t2)", textAlign: "center" }}>You're most productive on <strong style={{ color: accent.v }}>{bestDow.dayName}days</strong> 🏆</div>}
        </div>

        {/* ── Peak Hour Chart */}
        <div className="chart-card">
          <div className="chart-title">⏰ Most Productive Hour</div>
          <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 60, marginBottom: 8, overflowX: "auto" }}>
            {peakHours.map(h => (
              <div key={h.h} style={{ flex: 1, minWidth: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: h.h === peakHour.h ? `linear-gradient(180deg,${accent.v},${accent.g})` : h.cnt > 0 ? "var(--s4)" : "var(--s2)", height: `${Math.max((h.cnt / maxHour) * 48, 3)}px`, transition: "height .5s ease" }} />
                <div style={{ fontSize: 7, color: h.h === peakHour.h ? accent.v : "var(--t3)", fontWeight: h.h === peakHour.h ? 800 : 400, whiteSpace: "nowrap" }}>{h.h % 3 === 0 ? h.label : ""}</div>
              </div>
            ))}
          </div>
          {peakHour.cnt > 0 && <div style={{ fontSize: 12, color: "var(--t2)", textAlign: "center" }}>Peak productivity at <strong style={{ color: accent.v }}>{peakHour.label}</strong> — that's your golden hour! ⚡</div>}
        </div>

        {/* ── Category Breakdown */}
        <div className="chart-card">
          <div className="chart-title">📁 {t.byCategory}</div>
          {byCategory.length === 0 && <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: "16px 0" }}>Add tasks with categories to see breakdown</div>}
          {byCategory.map(c => (
            <div key={c.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: "var(--t1)" }}>{c.icon} {c.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.count} · {Math.round((c.count / totalCat) * 100)}%</span>
              </div>
              <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c.count / totalCat) * 100}%`, background: c.color, borderRadius: 3, transition: "width .6s ease" }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Priority Distribution */}
        <div className="chart-card">
          <div className="chart-title">🎯 Priority Distribution</div>
          <div style={{ display: "flex", gap: 10 }}>
            {Object.entries(PRIORITIES).map(([k, v]) => {
              const cnt = profileTasks.filter(x => x.priority === k && !x.done).length; return (
                <div key={k} style={{ flex: 1, background: v.bg, borderRadius: 13, padding: "14px 10px", textAlign: "center", border: `1px solid ${v.color}28` }}>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: v.color }}>{cnt}</div>
                  <div style={{ fontSize: 11, color: v.color, marginTop: 2, fontWeight: 700 }}>{v.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Mood + Habit Correlation */}
        {moodCorrelation.length > 0 && (
          <div className="chart-card">
            <div className="chart-title">✨ Mood vs. Habits</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>Average habits completed based on your mood.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {moodCorrelation.sort((a, b) => b.energy - a.energy).map(m => (
                <div key={m.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 80, fontSize: 13, fontWeight: 700, color: "var(--t1)", display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 18 }}>{m.emoji}</span> {m.label}
                  </div>
                  <div style={{ flex: 1, position: "relative", height: 28, background: "var(--s3)", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(m.avgCount / Math.max(maxMoodAvg, 1)) * 100}%`, background: `linear-gradient(90deg, ${m.color}66, ${m.color})`, borderRadius: 14, transition: "width .6s ease" }} />
                    <div style={{ position: "absolute", left: 10, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,.3)" }}>
                      {m.avgCount} habits
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 21-day Streak Calendar */}
        <div className="chart-card">
          <div className="chart-title">🔥 21-Day Streak Calendar</div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {streakDays.map((d, i) => (
              <div key={i} title={d.ds} style={{
                width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700, cursor: "default", transition: "transform .1s",
                background: d.hasDone ? `linear-gradient(135deg,${accent.v},${accent.g})` : (d.isToday ? "var(--accd)" : "var(--s2)"),
                color: d.hasDone ? "#fff" : (d.isToday ? accent.v : "var(--t3)"),
                border: d.isToday ? `2px solid ${accent.v}` : "2px solid transparent",
                boxShadow: d.hasDone ? `0 3px 8px ${accent.v}50` : "none",
              }}>
                {d.hasDone ? "✓" : d.isToday ? "•" : d.day[0]}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>✓ = tasks completed · Current streak: <strong style={{ color: accent.v }}>🔥 {gamStats.streak || 0} days</strong></div>
        </div>

        {/* ── LIBI Insight */}
        <div style={{ background: `linear-gradient(135deg,${accent.v}15,${accent.v}08)`, border: `1px solid ${accent.v}30`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>✦</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: accent.v, marginBottom: 4 }}>LIBI's Analysis</div>
              <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.65 }}>
                {prodScore >= 80 ? `You're in the top tier this week with ${last7Done} tasks done! ${bestDow.cnt > 0 ? `Your strongest day is ${bestDow.dayName}.` : ""} ${peakHour.cnt > 0 ? `Peak focus at ${peakHour.label}.` : ""} Keep this momentum! 🏆` :
                  prodScore >= 50 ? `Good week — ${last7Done} tasks done. ${weekTrend >= 0 ? `Up ${weekTrend}% from last week!` : `Down ${Math.abs(weekTrend)}% vs last week — you got this.`} ${bestDow.cnt > 0 ? `${bestDow.dayName}s are your best day.` : ""}` :
                    `${last7Done > 0 ? `You completed ${last7Done} tasks this week — good start!` : "No tasks completed yet this week."} ${overdueCount > 0 ? `Clear ${overdueCount} overdue task${overdueCount > 1 ? "s" : ""} to boost your score.` : ""} Every task counts! 💪`}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };


  function CalendarPage() {
    const days = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDay(calYear, calMonth);
    const cells = Array.from({ length: firstDay + (days) }, (_, i) => i < firstDay ? null : i - firstDay + 1);
    const pad = (7 - cells.length % 7) % 7;
    const allCells = [...cells, ...Array(pad).fill(null)];
    const selTasks = profileTasks.filter(t => t.due === selDate);
    return (
      <div className="cal-page">
        <div className="cal-header">
          <button className="cal-nav" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}>‹</button>
          <div className="cal-month">{new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
          <button className="cal-nav" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}>›</button>
        </div>
        <div className="cal-grid">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="cal-day-name">{d}</div>)}
          {allCells.map((day, i) => {
            if (!day) return <div key={i} />;
            const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayTasks = profileTasks.filter(t => t.due === ds);
            return (
              <div key={i} className={`cal-cell ${ds === todayStr() ? "today" : ""} ${ds === selDate ? "selected" : ""} ${dayTasks.length > 0 && ds !== selDate ? "has-tasks" : ""}`} onClick={() => setSelDate(ds)}>
                <div className="cal-num">{day}</div>
                {dayTasks.length > 0 && ds !== selDate && <div className="cal-dots">{dayTasks.slice(0, 3).map((_, j) => <div key={j} className="cal-dot" style={{ background: j === 0 ? "var(--red)" : j === 1 ? accent.v : "var(--green)" }} />)}</div>}
              </div>
            );
          })}
        </div>
        <div className="cal-task-list">
          <div className="cal-task-title">📅 {fmtDateFull(selDate)} — {selTasks.length} task{selTasks.length !== 1 ? "s" : ""}</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={() => { setForm({ ...blankForm, due: selDate, profileId: activeProfile }); setTagInput(""); setSubInput(""); setEditTaskObj(null); setShowTaskModal(true); play("tap"); haptic("light"); }} style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 11, fontSize: 12.5, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 4px 14px ${accent.v}40` }}>
              ＋ Add task on this day
            </button>
            {selTasks.length > 0 && <span style={{ fontSize: 11, color: "var(--t3)", alignSelf: "center" }}>{selTasks.length} task{selTasks.length !== 1 ? "s" : ""}</span>}
          </div>
          {selTasks.length === 0
            ? <div style={{ textAlign: "center", padding: "20px 0", color: "var(--t3)" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>📭</div>
              <div style={{ fontSize: 12.5 }}>No tasks — tap the button above to add one!</div>
            </div>
            : <div className="task-list">{selTasks.map(task => <TaskCard key={task.id} task={task} />)}</div>
          }
        </div>
      </div>
    );
  };

  function SettingsPage() {
    return (
      <div className="settings-page">
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, marginBottom: 16 }}>{t.settings}</div>
        {/* Account section */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Account</div>
        <div className="settings-section" style={{ marginBottom: 16 }}>
          {authUser ? (
            <div className="settings-row">
              {authUser.photo ? <img src={authUser.photo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} /> : <div className="settings-icon">👤</div>}
              <div className="settings-label">
                <div className="settings-title">{authUser.name}</div>
                <div className="settings-sub">{authUser.email} · {authUser.provider === "google.com" ? "Google account" : "Email account"}</div>
              </div>
              <button onClick={signOut} style={{ padding: "6px 12px", borderRadius: 9, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.25)", color: "var(--red)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Sign Out</button>
            </div>
          ) : (
            <div className="settings-row" onClick={() => setShowAuthScreen(true)} style={{ cursor: "pointer" }}>
              <div className="settings-icon">🔓</div>
              <div className="settings-label">
                <div className="settings-title">Sign in with Google</div>
                <div className="settings-sub">Sync tasks across devices</div>
              </div>
              <span style={{ fontSize: 12, color: accent.v, fontWeight: 700 }}>Sign In ›</span>
            </div>
          )}
        </div>
        {/* Cloud Sync */}
        {authUser && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Cloud Sync</div>
            <div className="settings-section" style={{ marginBottom: 16 }}>
              {/* Sync status */}
              <div className="settings-row">
                <div className="settings-icon">☁️</div>
                <div className="settings-label">
                  <div className="settings-title">Sync Status</div>
                  <div className="settings-sub">{syncStatus === "syncing" ? "Syncing data..." : syncStatus === "synced" ? "All data synced ✔" : syncStatus === "error" ? "Sync failed — try again" : lastSynced ? "Last synced: " + lastSynced : "Not yet synced"}</div>
                </div>
                <span style={{ fontSize: 16 }}>{syncStatus === "syncing" ? "⏳" : syncStatus === "synced" ? "✅" : syncStatus === "error" ? "❌" : "☁️"}</span>
              </div>
              {/* Manual Sync Button */}
              <div className="settings-row" onClick={syncToGoogle} style={{ cursor: "pointer" }}>
                <div className="settings-icon">🔄</div>
                <div className="settings-label">
                  <div className="settings-title">Sync Now</div>
                  <div className="settings-sub">Push all data to cloud manually</div>
                </div>
                <span style={{ fontSize: 12, color: accent.v, fontWeight: 700 }}>{syncStatus === "syncing" ? "Syncing…" : "Sync ›"}</span>
              </div>
              {/* Restore from Cloud */}
              <div className="settings-row" onClick={restoreFromGoogle} style={{ cursor: "pointer" }}>
                <div className="settings-icon">📥</div>
                <div className="settings-label">
                  <div className="settings-title">Restore from Cloud</div>
                  <div className="settings-sub">Pull data from cloud to this device</div>
                </div>
                <span style={{ fontSize: 12, color: "var(--t3)" }}>Restore ›</span>
              </div>
              {/* Auto Sync Toggle */}
              <div className="settings-row">
                <div className="settings-icon">⚡</div>
                <div className="settings-label">
                  <div className="settings-title">Auto-Sync</div>
                  <div className="settings-sub">{autoSync ? "Syncs automatically when data changes" : "Sync manually with the button above"}</div>
                </div>
                <div className={`toggle ${autoSync ? "on" : ""}`} onClick={() => { const n = !autoSync; setAutoSync(n); localStorage.setItem("tf_auto_sync", n ? "1" : "0"); showNotif(n ? "✅ Auto-sync ON" : "📴 Auto-sync OFF", n ? "Data will sync when changes are made" : "Use Sync Now to sync manually"); }}><div className="toggle-knob" /></div>
              </div>
            </div>
          </>
        )}
        {/* Appearance */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Appearance</div>
        <div className="settings-section">
          <div className="settings-row" onClick={() => setDark(d => !d)}>
            <div className="settings-icon">🌙</div>
            <div className="settings-label"><div className="settings-title">{t.darkMode}</div><div className="settings-sub">Switch between dark & light</div></div>
            <div className={`toggle theme-toggle ${dark ? "on" : ""}`} onClick={e => { e.stopPropagation(); setDark(d => !d); }}><div className="toggle-knob" /></div>
          </div>
          <div className="settings-row">
            <div className="settings-icon">🎨</div>
            <div className="settings-label"><div className="settings-title">{t.accentColor}</div><div className="settings-sub">Pick your theme color</div></div>
          </div>
          <div style={{ padding: "0 16px 14px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>🖼 Wallpaper</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
              {WALLPAPERS.map(w => (
                <div key={w.id} onClick={() => setWallpaper(w.id)} style={{ cursor: "pointer", borderRadius: 10, border: `2px solid ${wallpaper === w.id ? "var(--acc)" : "transparent"}`, transition: "all .2s", overflow: "hidden" }}>
                  <div style={{ height: 40, background: w.preview, borderRadius: 7 }} />
                  <div style={{ fontSize: 9, textAlign: "center", color: wallpaper === w.id ? "var(--acc)" : "var(--t3)", fontWeight: 700, padding: "3px 2px" }}>{w.label}</div>
                </div>
              ))}
            </div>
            {/* ── Greeting Card Settings */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10, marginTop: 16 }}>🌅 Greeting Card Scene</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { id: "auto", label: "Auto 🕐", preview: "linear-gradient(135deg,#000008,#7c6dfa,#ffd580)" },
                { id: "morning", label: "Morning 🌅", preview: "linear-gradient(135deg,#0a0510,#3d1f6e,#ffd580)" },
                { id: "afternoon", label: "Afternoon ☀️", preview: "linear-gradient(135deg,#030a1a,#1565c0,#f4d060)" },
                { id: "evening", label: "Evening 🌆", preview: "linear-gradient(135deg,#050210,#6b1a3a,#ff8030)" },
                { id: "night", label: "Night 🌙", preview: "linear-gradient(135deg,#000008,#0a0020,#7c6dfa)" },
                { id: "galaxy", label: "Galaxy 🌌", preview: "linear-gradient(135deg,#000008,#1e0050,#a855f7,#f472b6)" },
                { id: "forest", label: "Forest 🌿", preview: "linear-gradient(135deg,#020a04,#0d5228,#4ade80)" },
                { id: "ocean", label: "Ocean 🌊", preview: "linear-gradient(135deg,#000d1a,#003366,#1a8ccc)" },
                { id: "sakura", label: "Sakura 🌸", preview: "linear-gradient(135deg,#0d0010,#6b1060,#ffc8d8)" },
                { id: "northern", label: "Aurora 🌠", preview: "linear-gradient(135deg,#000005,#001033,#40ff80)" },
                { id: "volcano", label: "Volcano 🌋", preview: "linear-gradient(135deg,#020000,#4a0800,#ff6600)" },
                { id: "dawn", label: "Dawn 🌄", preview: "linear-gradient(135deg,#000208,#08103a,#e09040)" },
              ].map(s => (
                <div key={s.id} onClick={() => { setGreetScene(s.id); play("tap"); }} style={{ cursor: "pointer", borderRadius: 10, border: `2px solid ${greetScene === s.id ? "var(--acc)" : "var(--b1)"}`, overflow: "hidden", transition: "all .15s", transform: greetScene === s.id ? "scale(1.04)" : "scale(1)" }}>
                  <div style={{ height: 36, background: s.preview, borderRadius: 7 }} />
                  <div style={{ fontSize: 8.5, textAlign: "center", color: greetScene === s.id ? "var(--acc)" : "var(--t3)", fontWeight: 600, padding: "3px 2px" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>✨ Card Glow Color</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {[
                { id: "default", color: "linear-gradient(135deg,#7c6dfa,#a855f7)", label: "Auto" },
                { id: "purple", color: "#a855f7", label: "Purple" },
                { id: "gold", color: "#f59e0b", label: "Gold" },
                { id: "blue", color: "#3b82f6", label: "Blue" },
                { id: "green", color: "#6bcb77", label: "Green" },
                { id: "red", color: "#ff6b6b", label: "Red" },
                { id: "pink", color: "#f472b6", label: "Pink" },
                { id: "white", color: "rgba(255,255,255,.6)", label: "White" },
              ].map(c => (
                <div key={c.id} onClick={() => { setGreetAccent(c.id); play("tap"); }} title={c.label} style={{
                  width: 28, height: 28, borderRadius: "50%", background: c.color, cursor: "pointer",
                  border: `3px solid ${greetAccent === c.id ? "var(--t1)" : "transparent"}`,
                  transform: greetAccent === c.id ? "scale(1.2)" : "scale(1)",
                  transition: "all .15s",
                  boxShadow: greetAccent === c.id ? `0 4px 12px ${c.color}80` : ""
                }} />
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>🎨 Presets</div>
            <div className="accent-grid" style={{ marginBottom: 16 }}>{ACCENTS.map((a, i) => <div key={i} className={`accent-swatch ${!customTheme && accentIdx === i ? "on" : ""}`} style={{ background: `linear-gradient(135deg,${a.v},${a.g})` }} onClick={() => { setCustomTheme(null); setAccentIdx(i); play("tap"); }} />)}</div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>🛠 Custom Theme</div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>Primary Color</div>
                <input type="color" value={customTheme?.v || accent.v} onChange={e => { setCustomTheme(t => ({ v: e.target.value, g: t?.g || accent.g })); }} style={{ width: "100%", height: 36, padding: 0, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>Gradient End</div>
                <input type="color" value={customTheme?.g || accent.g} onChange={e => { setCustomTheme(t => ({ v: t?.v || accent.v, g: e.target.value })); }} style={{ width: "100%", height: 36, padding: 0, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginTop: 20, marginBottom: 10 }}>📝 Typography (App Font)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              {FONTS.map(f => (
                <div key={f.id} onClick={() => { setAppFont(f.id); play("tap"); }} style={{ padding: "10px", borderRadius: 10, border: `1.5px solid ${appFont === f.id ? accent.v : "var(--b1)"}`, background: appFont === f.id ? `${accent.v}15` : "var(--s2)", color: appFont === f.id ? accent.v : "var(--t1)", fontFamily: f.id, fontSize: 13, cursor: "pointer", transition: "all .2s", textAlign: "center", fontWeight: appFont === f.id ? 700 : 500 }}>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Language */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Language</div>
        <div className="settings-section">
          {Object.entries(LANGS).map(([k, l]) => (
            <div key={k} className="settings-row" onClick={() => { setLangKey(k); play("tap"); }}>
              <div className="settings-icon">{l.flag}</div>
              <div className="settings-label"><div className="settings-title">{l.name}</div></div>
              {langKey === k && <span style={{ color: accent.v, fontWeight: 700 }}>✓</span>}
            </div>
          ))}
        </div>
        {/* Notifications & Sound */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Notifications</div>
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-icon">🔔</div>
            <div className="settings-label"><div className="settings-title">{t.notifications}</div><div className="settings-sub">Get reminded about due tasks</div></div>
            <div className={`toggle ${notifsOn ? "on" : ""}`} onClick={() => setNotifsOn(n => !n)}><div className="toggle-knob" /></div>
          </div>
          <div className="settings-row">
            <div className="settings-icon">🎵</div>
            <div className="settings-label"><div className="settings-title">{t.sound}</div><div className="settings-sub">Sound effects on actions</div></div>
            <div className={`toggle ${soundOn ? "on" : ""}`} onClick={() => setSoundOn(s => !s)}><div className="toggle-knob" /></div>
          </div>
        </div>
        {/* Background Music */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>🎶 Background Music</div>
        <div className="settings-section">
          <div className="settings-row">
            <div className="settings-icon">🎶</div>
            <div className="settings-label">
              <div className="settings-title">Background Music</div>
              <div className="settings-sub">{musicOn ? "Now playing: " + MUSIC_TRACKS.find(m => m.id === musicTrack)?.label : "Ambient music while you work"}</div>
            </div>
            <div className={`toggle ${musicOn ? "on" : ""}`} onClick={() => { setMusicOn(m => !m); play("tap"); }}><div className="toggle-knob" /></div>
          </div>
          {musicOn && (
            <div style={{ padding: "0 16px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>Choose Track</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                {MUSIC_TRACKS.map(m => (
                  <div key={m.id} onClick={() => { setMusicTrack(m.id); play("tap"); }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, cursor: "pointer", background: musicTrack === m.id ? "var(--accd)" : "var(--s2)", border: `1.5px solid ${musicTrack === m.id ? "var(--acc)" : "var(--b1)"}`, transition: "all .2s" }}>
                    <span style={{ fontSize: 20 }}>{m.icon}</span>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: musicTrack === m.id ? "var(--acc)" : "var(--t1)" }}>{m.label}</div>
                      {musicTrack === m.id && <div style={{ fontSize: 10, color: "var(--acc)", marginTop: 1 }}>▶ Playing</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 10, textAlign: "center" }}>🔊 Generated offline using Web Audio — no internet needed</div>
            </div>
          )}
        </div>
        {/* Security */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Security</div>
        <div className="settings-section">
          <div className="settings-row" onClick={() => { if (pinEnabled) { setPinEnabled(false); setPin(""); showNotif("🔓 PIN Removed", "App lock disabled"); } else { setPinInput(""); setPinMode("set"); setShowPinModal(true); } }}>
            <div className="settings-icon">🔒</div>
            <div className="settings-label"><div className="settings-title">{t.pinLock}</div><div className="settings-sub">{pinEnabled ? "Tap to remove PIN" : "Protect app with a 4-digit PIN"}</div></div>
            <div className={`toggle ${pinEnabled ? "on" : ""}`}><div className="toggle-knob" /></div>
          </div>
        </div>

        {/* Integrations */}
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: 8, paddingLeft: 4 }}>Integrations</div>
        <div className="settings-section" style={{ marginBottom: 16 }}>
          <div className="settings-row" onClick={exportBackup} style={{ cursor: "pointer" }}>
            <div className="settings-icon">💾</div>
            <div className="settings-label">
              <div className="settings-title">Export Backup</div>
              <div className="settings-sub">Save all your data as a .json file</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>›</span>
          </div>
          <div className="settings-row" style={{ cursor: "pointer" }} onClick={() => document.getElementById("tf-backup-input").click()}>
            <div className="settings-icon">📂</div>
            <div className="settings-label">
              <div className="settings-title">Import Backup</div>
              <div className="settings-sub">Restore from a saved backup file</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>›</span>
          </div>
          <input id="tf-backup-input" type="file" accept=".json" style={{ display: "none" }} onChange={e => { if (e.target.files[0]) importBackup(e.target.files[0]); }} />
          <div className="settings-row" onClick={exportToPDF} style={{ cursor: "pointer" }}>
            <div className="settings-icon">📄</div>
            <div className="settings-label">
              <div className="settings-title">Export to PDF</div>
              <div className="settings-sub">Weekly report of your tasks &amp; progress</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>›</span>
          </div>
          <div className="settings-row" onClick={() => sendEmailDigest()} style={{ cursor: "pointer" }}>
            <div className="settings-icon">📧</div>
            <div className="settings-label">
              <div className="settings-title">Email Weekly Digest</div>
              <div className="settings-sub">Send your week summary to your email</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>›</span>
          </div>
          <div className="settings-row" onClick={() => setShowICSModal(true)} style={{ cursor: "pointer" }}>
            <div className="settings-icon">📅</div>
            <div className="settings-label">
              <div className="settings-title">Import Google Calendar</div>
              <div className="settings-sub">Import .ics file — events become tasks</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>›</span>
          </div>


          <div className="settings-row" onClick={() => { if (isInstalled) { showNotif("✅ Already installed!", "Taskflow is running as an installed app"); } else if (pwaPrompt) { installPWA(); } else { showNotif("📲 How to install on mobile", "Tap your browser menu → 'Add to Home Screen'"); showNotif("💻 How to install on PC", "Look for the ⊕ icon in Chrome's address bar, or go to Menu → Install Taskflow"); } }} style={{ cursor: "pointer" }}>
            <div className="settings-icon">📲</div>
            <div className="settings-label"><div className="settings-title">Install App</div><div className="settings-sub">Add Taskflow to your home screen</div></div>
            <span style={{ fontSize: 12, color: accent.v, fontWeight: 700 }}>Install ›</span>
          </div>
          {/* Google Sign In from settings */}
          <div className="settings-row" onClick={authUser ? signOut : signInWithGoogle} style={{ cursor: "pointer" }}>
            <div className="settings-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" style={{ verticalAlign: "middle" }}>
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
              </svg>
            </div>
            <div className="settings-label">
              <div className="settings-title">{authUser ? "Signed in as Google" : "Sign in with Google"}</div>
              <div className="settings-sub">{authUser ? authUser.email : "Sync tasks across devices via collaboration"}</div>
            </div>
            <span style={{ fontSize: 12, color: authUser ? "#6bcb77" : "var(--t3)", fontWeight: 700 }}>{authUser ? "✓ Connected" : "Connect ›"}</span>
          </div>
        </div>

        {/* ── Legal footer ── */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--b1)", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--t3)", textDecoration: "underline", padding: 0 }}>Privacy Policy</button>
            <span style={{ color: "var(--b1)" }}>·</span>
            <button onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--t3)", textDecoration: "underline", padding: 0 }}>Terms of Service</button>
            <span style={{ color: "var(--b1)" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>© 2026 Taskflow · LIBI Labs</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--t3)", opacity: .6 }}>v2.0 · Built with ♥ · taskflow-ultimate.netlify.app</div>
        </div>

      </div>
    );
  }


  function ProfilesPage() {
    return (
      <div style={{ padding: "20px 18px 90px" }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, marginBottom: 16 }}>{t.profiles}</div>
        {/* Google account card */}
        {authUser && (
          <div style={{ background: `linear-gradient(135deg,${accent.v}12,${accent.g}06)`, border: `1.5px solid ${accent.v}30`, borderRadius: 18, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
            {authUser.photo
              ? <img src={authUser.photo} alt="" style={{ width: 44, height: 44, borderRadius: 14, objectFit: "cover", border: `2px solid ${accent.v}50`, flexShrink: 0 }} />
              : <div style={{ width: 44, height: 44, borderRadius: 14, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
            }
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{authUser.name}</div>
              <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{authUser.email}</div>
              <div style={{ fontSize: 10, color: accent.v, fontWeight: 700, marginTop: 2 }}>✅ Signed in with {authUser.provider === "google.com" ? "Google" : "Email"}</div>
            </div>
            <button onClick={signOut} style={{ padding: "7px 12px", borderRadius: 10, background: "rgba(255,107,107,.12)", border: "1px solid rgba(255,107,107,.3)", color: "var(--red)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Sign Out</button>
          </div>
        )}
        {!authUser && !guestMode && (
          <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28 }}>🔓</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 2 }}>Not signed in</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>Sign in with Google to sync across devices</div>
            </div>
            <button onClick={() => setShowAuthScreen(true)} style={{ padding: "7px 12px", borderRadius: 10, background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0, boxShadow: `0 3px 12px ${accent.v}50` }}>Sign In</button>
          </div>
        )}
        {guestMode && (
          <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 28 }}>👤</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 2 }}>Guest mode</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>Data saved locally only. Sign in to sync.</div>
            </div>
            <button onClick={() => setShowAuthScreen(true)} style={{ padding: "7px 12px", borderRadius: 10, background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Sign In</button>
          </div>
        )}
        <div className="prof-grid">
          {profiles.map(p => (
            <div key={p.id} style={{ position: "relative" }}>
              <div className={`prof-card ${activeProfile === p.id ? "on" : ""}`} onClick={() => { if (editProfileId !== p.id) { try { localStorage.setItem("tf_xp_" + activeProfile, JSON.stringify(xp)); localStorage.setItem("tf_badges_" + activeProfile, JSON.stringify(earnedBadges)); localStorage.setItem("tf_moods_" + activeProfile, JSON.stringify(moods)); } catch { } try { const nx = localStorage.getItem("tf_xp_" + p.id); const nb = localStorage.getItem("tf_badges_" + p.id); const nm = localStorage.getItem("tf_moods_" + p.id); setXp(nx ? JSON.parse(nx) : 0); setEarnedBadges(nb ? JSON.parse(nb) : []); setMoods(nm ? JSON.parse(nm) : []); setTodayMood(null); } catch { } setActiveProfile(p.id); play("tap"); setTab("tasks"); } }}>
                <div className="prof-avatar" onClick={e => { e.stopPropagation(); setShowAvatarPicker(v => v === p.id ? null : p.id); }} style={{ cursor: "pointer", position: "relative" }} title="Tap to change photo">
                  {p.icon}
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: accent.v, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 800 }}>✎</div>
                </div>
                {showAvatarPicker === p.id && (
                  <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", zIndex: 100, background: "var(--s1)", border: `1px solid ${accent.v}40`, borderRadius: 16, padding: 10, boxShadow: `0 8px 32px rgba(0,0,0,.4)`, width: 200, display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                    <div style={{ width: "100%", fontSize: 9, fontWeight: 800, color: "var(--t3)", textAlign: "center", marginBottom: 4, letterSpacing: 1 }}>PICK AN AVATAR</div>
                    {["👤", "🧑", "👩", "👨", "🧒", "👧", "👦", "🧔", "👩‍💻", "👨‍💻", "🧑‍🎨", "👩‍🎤", "🦊", "🐱", "🐶", "🦁", "🐼", "🦋", "🌟", "🚀", "🎯", "💎", "🔥", "⚡", "🌈", "🎭", "🏆", "👑"].map(em => (
                      <div key={em} onClick={() => { setProfiles(ps => ps.map(x => x.id === p.id ? { ...x, icon: em } : x)); setShowAvatarPicker(null); play("tap"); showNotif("✅ Avatar updated!", ""); }} style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", background: p.icon === em ? "var(--accd)" : "var(--s2)", border: p.icon === em ? `1.5px solid ${accent.v}` : "1px solid transparent", transition: "all .1s" }}>
                        {em}
                      </div>
                    ))}
                    <button onClick={() => setShowAvatarPicker(null)} style={{ width: "100%", marginTop: 4, height: 26, borderRadius: 8, background: "var(--s3)", border: "none", color: "var(--t3)", fontSize: 11, cursor: "pointer" }}>Close</button>
                  </div>
                )}
                {editProfileId === p.id
                  ? <div style={{ display: "flex", gap: 6, alignItems: "center", width: "100%", marginTop: 4 }} onClick={e => e.stopPropagation()}>
                    <input autoFocus value={editProfileName} onChange={e => setEditProfileName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { setProfiles(ps => ps.map(x => x.id === p.id ? { ...x, name: editProfileName.trim() || x.name } : x)); setEditProfileId(null); showNotif("✅ Name updated!", ""); play("add"); } if (e.key === "Escape") setEditProfileId(null); }}
                      style={{ flex: 1, fontSize: 13, fontWeight: 700, background: "var(--s3)", border: "1.5px solid var(--acc)", borderRadius: 8, padding: "4px 8px", color: "var(--t1)", outline: "none", minWidth: 0 }} />
                    <button onClick={() => { setProfiles(ps => ps.map(x => x.id === p.id ? { ...x, name: editProfileName.trim() || x.name } : x)); setEditProfileId(null); showNotif("✅ Name updated!", ""); play("add"); }} style={{ fontSize: 16, background: "none", border: "none", cursor: "pointer", color: "#6bcb77" }}>✓</button>
                    <button onClick={() => setEditProfileId(null)} style={{ fontSize: 14, background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>✕</button>
                  </div>
                  : <div className="prof-name" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {p.name}
                    <span onClick={e => { e.stopPropagation(); setEditProfileId(p.id); setEditProfileName(p.name); }} style={{ fontSize: 10, opacity: .5, cursor: "pointer", flexShrink: 0 }} title="Edit name">✎</span>
                  </div>
                }
                <div className="prof-count">{tasks.filter(x => x.profileId === p.id && !x.done).length} active tasks</div>
                {activeProfile === p.id && <div style={{ fontSize: 11, color: accent.v, marginTop: 5, fontWeight: 700 }}>✓ Active</div>}
              </div>
              {activeProfile !== p.id && profiles.length > 1 && (
                <button style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 6, background: "rgba(255,107,107,.15)", color: "var(--red)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,107,107,.3)", zIndex: 2 }}
                  onClick={e => { e.stopPropagation(); setProfiles(ps => ps.filter(x => x.id !== p.id)); setTasks(ts => ts.filter(x => x.profileId !== p.id)); play("delete"); showNotif("Deleted", p.name + " removed"); }}>✕</button>
              )}
            </div>
          ))}
          <div className="prof-card" style={{ border: "2px dashed var(--b2)", background: "transparent" }} onClick={() => { setProfForm({ name: "", icon: "👤", color: "#7c6dfa" }); setShowProfileModal(true); }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>＋</div>
            <div style={{ fontSize: 13, color: "var(--t2)", fontWeight: 600 }}>{t.newProfile}</div>
          </div>
        </div>
      </div>
    );
  };

  // == Pomodoro State ==
  const POMO_MODES = { focus: { label: "Focus", mins: 25, color: "#ff6b6b" }, short: { label: "Short Break", mins: 5, color: "#6bcb77" }, long: { label: "Long Break", mins: 15, color: "#48dbfb" } };
  const [pomoMode, setPomoMode] = useState("focus");
  const [pomoSecs, setPomoSecs] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSession, setPomoSession] = useState(0); // 0-3 completed sessions
  const [pomoTaskId, setPomoTaskId] = useState(null);
  const [pomoTotal, setPomoTotal] = useState(0); // total sessions ever
  const [pomoMinsToday, setPomoMinsToday] = useState(0);
  const pomoRef = useRef(null);

  useEffect(() => {
    if (pomoRunning) {
      pomoRef.current = setInterval(() => {
        setPomoSecs(s => {
          if (s <= 1) {
            clearInterval(pomoRef.current);
            setPomoRunning(false);
            play("complete");
            haptic("success");
            fireConfetti();
            const m = POMO_MODES[pomoMode];
            showNotif(`🍅 ${m.label} Done!`, pomoMode === "focus" ? "Great focus! Take a break 🎉" : "Break over — back to work!");
            // Play alarm tone
            try { playAlarmTone("gentle"); } catch (e) { }
            if (pomoMode === "focus") {
              setPomoTotal(t => t + 1);
              setPomoMinsToday(t => t + 25);
              setPomoSession(s => s >= 3 ? 0 : s + 1);
              awardXP(25, "Focus session");
              const msgs = ["Great focus! Keep it up! 🔥", "Building deep work habits! 💪", "One step closer to your goals! 🏆", "Flow state achieved! ⚡", "Consistency is your superpower! 🌟"];
              setTimeout(() => showNotif("💬 LIBI", msgs[Math.floor(Math.random() * msgs.length)]), 2000);
            }
            return POMO_MODES[pomoMode].mins * 60;
          }
          return s - 1;
        });
      }, 1000);
    } else { clearInterval(pomoRef.current); }
    return () => clearInterval(pomoRef.current);
  }, [pomoRunning, pomoMode]);

  function switchPomoMode(m) { setPomoMode(m); setPomoSecs(POMO_MODES[m].mins * 60); setPomoRunning(false); };

  function resetPomo() { setPomoSecs(POMO_MODES[pomoMode].mins * 60); setPomoRunning(false); };


  function PomoPage() {
    const mins = Math.floor(pomoSecs / 60), secs = pomoSecs % 60;
    const total_s = POMO_MODES[pomoMode].mins * 60;
    const progress = 1 - (pomoSecs / total_s);
    const R = 70, C2 = 2 * Math.PI * R;
    const modeColor = POMO_MODES[pomoMode].color;
    const activeTasks = profileTasks.filter(t => !t.done).slice(0, 6);
    const pomoTask = tasks.find(t => t.id === pomoTaskId);
    return (
      <div className="pomo-page">
        {/* Mode selector */}
        <div className="pomo-modes">
          {Object.entries(POMO_MODES).map(([k, v]) => (
            <div key={k} className={`pomo-mode ${pomoMode === k ? "on" : ""}`} onClick={() => switchPomoMode(k)}>{v.label}</div>
          ))}
        </div>
        {/* Timer ring */}
        <div className="pomo-card">
          <div className="pomo-ring">
            <svg width="180" height="180" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="90" cy="90" r={R} fill="none" stroke="var(--s3)" strokeWidth="8" />
              <circle cx="90" cy="90" r={R} fill="none" stroke={modeColor} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={C2} strokeDashoffset={C2 * (1 - progress)} style={{ transition: "stroke-dashoffset .5s ease", filter: `drop-shadow(0 0 8px ${modeColor}88)` }} />
            </svg>
            <div className="pomo-time">
              <div className="pomo-mins" style={{ color: modeColor }}>{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
              <div className="pomo-label" style={{ color: modeColor }}>{POMO_MODES[pomoMode].label}</div>
            </div>
          </div>
          {/* Sessions dots */}
          <div className="pomo-sessions">
            {[0, 1, 2, 3].map(i => <div key={i} className={`pomo-dot ${i < pomoSession ? "done" : ""}`} style={i < pomoSession ? { background: modeColor, borderColor: modeColor } : {}} />)}
          </div>
          {pomoTask && <div style={{ fontSize: 12.5, color: "var(--t2)", background: "var(--s2)", borderRadius: 9, padding: "7px 12px", width: "100%", textAlign: "center" }}>🎯 {pomoTask.title}</div>}
          {/* Controls */}
          <div className="pomo-controls">
            <button className="pomo-btn sec" onClick={resetPomo} title="Reset">↺</button>
            <button className="pomo-btn main" onClick={() => setPomoRunning(r => !r)} style={{ background: `linear-gradient(135deg,${modeColor},${modeColor}bb)`, boxShadow: `0 6px 20px ${modeColor}55` }}>
              {pomoRunning ? "⏸" : "▶"}
            </button>
            <button className="pomo-btn sec" onClick={() => switchPomoMode({ focus: "short", short: "long", long: "focus" }[pomoMode])} title="Skip">⏭</button>
          </div>
        </div>
        {/* Stats */}
        <div className="pomo-stats-row">
          {[{ lbl: "Sessions Today", val: pomoTotal }, { lbl: "Focus Mins", val: pomoMinsToday }, { lbl: "Current Streak", val: pomoSession + "/4" }].map(s => (
            <div key={s.lbl} className="pomo-stat"><div className="pomo-stat-val">{s.val}</div><div className="pomo-stat-lbl">{s.lbl}</div></div>
          ))}
        </div>
        {/* Task picker */}
        <div className="pomo-task-pick">
          <div className="pomo-task-title">🎯 Focus on a task</div>
          {activeTasks.length === 0 && <div style={{ fontSize: 12.5, color: "var(--t3)", padding: "10px 0" }}>No active tasks — add one first!</div>}
          {activeTasks.map(task => (
            <div key={task.id} className={`pomo-task-item ${pomoTaskId === task.id ? "on" : ""}`} onClick={() => setPomoTaskId(id => id === task.id ? null : task.id)}>
              <span style={{ fontSize: 14 }}>{PRIORITIES[task.priority].icon}</span>
              <span className="pomo-task-name">{task.title}</span>
              {pomoTaskId === task.id && <span style={{ color: accent.v, fontWeight: 700, fontSize: 13 }}>✓</span>}
            </div>
          ))}
        </div>
        {/* Tips */}
        <div style={{ width: "100%", maxWidth: 420, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>💡 Pomodoro Tips</div>
          {["Work in 25-min focused bursts — no distractions!", "After 4 sessions take a 15-30 min long break.", "One task per session. Keep phone face-down!", "Use short breaks to stretch, not scroll social media."].map((tip, i) => (
            <div key={i} style={{ fontSize: 12.5, color: "var(--t2)", padding: "5px 0", borderBottom: i < 3 ? "1px solid var(--b1)" : "none", lineHeight: 1.5 }}>• {tip}</div>
          ))}
        </div>
      </div>
    );
  };

  // == REAL Firebase Collaboration State ==
  const [myRoomCode] = useState("TF-" + (Math.random().toString(36).slice(2, 8).toUpperCase()));
  const [joinCode, setJoinCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState(null); // room we're currently in
  const [sharedTasks, setSharedTasks] = useState([]);
  const [newSharedTitle, setNewSharedTitle] = useState("");
  const [editingSharedId, setEditingSharedId] = useState(null);
  const [editingSharedText, setEditingSharedText] = useState("");
  const [myName, setMyName] = useState("Me");
  const [collabStatus, setCollabStatus] = useState("idle"); // idle | connecting | connected | error
  const collabUnsub = useRef(null);

  // == Auth State ==
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInited, setAuthInited] = useState(false);
  const [showAuthScreen, setShowAuthScreen] = useState(() => !localStorage.getItem("tf_guest") && !localStorage.getItem("tf_uid"));
  const [guestMode, setGuestMode] = useState(() => !!localStorage.getItem("tf_guest"));

  async function initAuth() {
    if (authInited) return;
    setAuthInited(true);
    try {
      const fb = await getFirebase();
      if (!fb) return;
      fb.auth.onAuthStateChanged(user => {
        if (user) {
          const u = {
            uid: user.uid,
            email: user.email,
            name: user.displayName || user.email.split("@")[0],
            photo: user.photoURL || null,
            provider: user.providerData?.[0]?.providerId || "password",
          };
          setAuthUser(u);
          setShowAuthScreen(false);
          setGuestMode(false);
          localStorage.setItem("tf_uid", user.uid);
          localStorage.removeItem("tf_guest");
          // Sync name to userName + LIBI
          if (user.displayName) {
            const firstName = user.displayName.split(" ")[0];
            setUserName(firstName);
            localStorage.setItem("tf_username", firstName);
          }
        } else {
          setAuthUser(null);
          localStorage.removeItem("tf_uid");
        }
      });
    } catch (e) { console.error(e); }
  }

  useEffect(() => {
    // Pre-load Firebase scripts in background immediately
    getFirebase().then(fb => {
      if (fb) {
        fb.auth.onAuthStateChanged(async user => {
          if (user) {
            const u = { uid: user.uid, email: user.email, name: user.displayName || user.email.split("@")[0], photo: user.photoURL || null, provider: user.providerData?.[0]?.providerId || "password" };
            setAuthUser(u);
            setShowAuthScreen(false);
            setGuestMode(false);
            localStorage.setItem("tf_uid", user.uid);
            localStorage.removeItem("tf_guest");
            if (user.displayName) { const fn = user.displayName.split(" ")[0]; setUserName(fn); localStorage.setItem("tf_username", fn); }
            // Auto-restore from cloud on first sign-in on this device
            try {
              const localTasks = localStorage.getItem("tf_tasks");
              const isFirstDevice = !localTasks || JSON.parse(localTasks).length <= 3; // default init tasks
              if (isFirstDevice) {
                const db2 = fb.db;
                const doc = await db2.collection("user_data").doc(user.uid).get();
                if (doc.exists) {
                  const d = doc.data();
                  if (d.tasks?.length) setTasks(d.tasks);
                  if (d.goals?.length) setGoals(d.goals);
                  if (d.habits?.length) setHabits(d.habits);
                  if (d.notes?.length) setNotes(d.notes);
                  if (d.moods?.length) setMoods(d.moods);
                  if (d.finances?.length) setFinances(d.finances);
                  if (d.sleepLogs?.length) setSleepLogs(d.sleepLogs);
                  if (d.calorieLogs?.length) setCalorieLogs(d.calorieLogs);
                  if (d.debts?.length) setDebts(d.debts);
                  if (d.xp != null) setXp(d.xp);
                  if (d.earnedBadges?.length) setEarnedBadges(d.earnedBadges);
                  if (d.categories?.length) setCategories(d.categories);
                  if (d.libiMemory) setLibiMemory(d.libiMemory);
                  if (d.profiles?.length) setProfiles(d.profiles);
                  if (d.accentIdx != null) setAccentIdx(d.accentIdx);
                  showNotif("☁️ Data restored!", "Your cloud data has been loaded");
                }
              }
            } catch (e) { console.error("Auto-restore:", e); }
          } else {
            setAuthUser(null);
            localStorage.removeItem("tf_uid");
          }
          setAuthInited(true);
        });
      }
    }).catch(() => { });
  }, []); // Pre-warm Firebase + restore session + auto-restore on start
  useEffect(() => { if (tab === "collab") initAuth(); }, [tab]);

  async function signIn() {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable — check your connection!");
      await fb.auth.signInWithEmailAndPassword(authEmail, authPassword);
      showNotif("✅ Signed in!", authEmail); play("complete");
    } catch (e) {
      setAuthError(e.code === "auth/user-not-found" ? "No account found" : e.code === "auth/wrong-password" ? "Wrong password" : e.code === "auth/invalid-email" ? "Invalid email format" : e.message);
    } finally { setAuthLoading(false); }
  };

  async function signInWithGoogle() {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable — check your connection!");
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");
      const result = await fb.auth.signInWithPopup(provider);
      const user = result.user;
      showNotif("🎉 Welcome!", user.displayName || user.email);
      play("complete"); haptic("success");
      // Save name to LIBI memory
      if (user.displayName) {
        setLibiMemory(m => ({
          ...m, name: user.displayName.split(" ")[0],
          facts: [...new Set([...m.facts, `My name is ${user.displayName.split(" ")[0]}`])]
        }));
      }
    } catch (e) {
      if (e.code === "auth/popup-closed-by-user") setAuthError("Sign-in cancelled — please try again");
      else if (e.code === "auth/popup-blocked") setAuthError("Popup blocked! Please allow popups for this site in your browser settings, then try again.");
      else if (e.message?.includes("unavailable") || e.message?.includes("Firebase")) setAuthError("Could not connect to Google. Check your internet connection and try again.");
      else setAuthError(e.message || "Sign-in failed. Please try again.");
    } finally { setAuthLoading(false); }
  };

  async function signUp() {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable in preview — will work in published app!");
      const cred = await fb.auth.createUserWithEmailAndPassword(authEmail, authPassword);
      await cred.user.updateProfile({ displayName: myName || authEmail.split("@")[0] });
      showNotif("🎉 Account created!", authEmail); play("complete");
    } catch (e) {
      setAuthError(e.code === "auth/email-already-in-use" ? "Email already in use" : e.code === "auth/weak-password" ? "Min 6 characters required" : e.message);
    } finally { setAuthLoading(false); }
  };

  async function signOut() {
    try {
      const fb = await getFirebase();
      if (fb) await fb.auth.signOut();
      setAuthUser(null); leaveRoom();
      localStorage.removeItem("tf_uid");
      showNotif("👋 Signed out", "See you next time!");
    } catch (e) { }
  };
  function continueAsGuest() {
    localStorage.setItem("tf_guest", "1");
    localStorage.removeItem("tf_uid");
    setGuestMode(true);
    setShowAuthScreen(false);
    setAuthUser(null);
    haptic("light");
  }

  // Listen to a room's tasks in real time
  async function joinRoom(code) {
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;
    setCollabStatus("connecting");
    if (collabUnsub.current) collabUnsub.current();
    try {
      const db = await getDB();
      if (!db) throw new Error("Firebase unavailable");
      
      // Update presence
      const myId = authUser?.uid || myUid;
      await db.collection("rooms").doc(roomCode).collection("presence").doc(myId).set({
        uid: myId,
        name: authUser?.name || myName || "Explorer",
        icon: getAvatar(authUser?.name || myName || "Explorer"),
        lastActive: Date.now(),
        status: "working"
      });

      // Sub to Tasks
      collabUnsub.current = db.collection("rooms").doc(roomCode).collection("tasks")
        .onSnapshot((snap) => {
          const live = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSharedTasks(live.sort((a, b) => b.createdAt - a.createdAt));
          setCollabStatus("connected");
        }, (err) => {
          setCollabStatus("error");
          showNotif("❌ Connection Error", err.message);
        });
      
      setActiveRoomCode(roomCode);
      showNotif("✅ Connected!", "You joined room: " + roomCode);
    } catch (err) {
      setCollabStatus("error");
      showNotif("❌ Error", err.message);
    }
  };

  async function leaveRoom() {
    if (activeRoomCode) {
      try {
        const db = await getDB();
        const myId = authUser?.uid || myUid;
        await db.collection("rooms").doc(activeRoomCode).collection("presence").doc(myId).delete();
      } catch (e) {}
    }
    if (collabUnsub.current) collabUnsub.current();
    setActiveRoomCode(null);
    setSharedTasks([]);
    setCollabStatus("idle");
    showNotif("👋 Left room", "Disconnected from shared list");
  };

  async function addSharedTask(titleOverride) {
    const title = (titleOverride || newSharedTitle).trim();
    if (!title || !activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").add({
        title, addedBy: myName || "Anonymous",
        done: false, priority: "medium", createdAt: Date.now(),
      });
      setNewSharedTitle(""); play("add");
    } catch (err) { showNotif("❌ Error", err.message); }
  };

  async function toggleSharedTask(task) {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({ ...task, done: !task.done });
      play(task.done ? "tap" : "complete");
    } catch (err) { showNotif("❌ Error", err.message); }
  };

  async function deleteSharedTask(taskId) {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(taskId).delete();
      play("delete");
    } catch (err) { showNotif("❌ Error", err.message); }
  };

  async function editSharedTask(task, newTitle) {
    if (!activeRoomCode || !newTitle.trim()) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({ ...task, title: newTitle.trim() });
      setEditingSharedId(null); play("tap");
    } catch (err) { showNotif("❌ Error", err.message); }
  };

  async function shareMyTasks() {
    if (!activeRoomCode) return;
    const toShare = profileTasks.filter(t => !t.done).slice(0, 5);
    try {
      const db = await getDB(); if (!db) return;
      for (const task of toShare) {
        await db.collection("rooms").doc(activeRoomCode).collection("tasks").add({
          title: task.title, addedBy: myName || "Me",
          done: false, priority: task.priority, createdAt: Date.now(),
        });
      }
      showNotif("📤 Shared!", `${toShare.length} tasks shared to room`);
    } catch (err) { showNotif("❌ Error", err.message); }
  };

  // Cleanup on unmount
  useEffect(() => () => { if (collabUnsub.current) collabUnsub.current(); }, []);
  useEffect(() => () => {
    if (boardUnsubRef.current.col) try { boardUnsubRef.current.col(); } catch (e) { }
    if (boardUnsubRef.current.card) try { boardUnsubRef.current.card(); } catch (e) { }
  }, []);

  const statusColors = { idle: "var(--t3)", connecting: "#ffd93d", connected: "#6bcb77", error: "#ff6b6b" };
  const statusLabels = { idle: "Not connected", connecting: "Connecting…", connected: "🟢 Live — syncing in real time", error: "❌ Connection failed" };

  // ── Team Chat State ──
  const [localEmail, setLocalEmail] = useState(authEmail || "");
  const [localPass, setLocalPass] = useState("");
  const [localName, setLocalName] = useState(myName || "");
  const [showPass, setShowPass] = useState(false);
  const [roomInput, setRoomInput] = useState(joinCode || "");
  const [newTaskInput, setNewTaskInput] = useState("");
  const [chatMsg, setChatMsg] = useState("");
  const [assignModal, setAssignModal] = useState(null); // task id
  const [commentModal, setCommentModal] = useState(null);

  function CollabPage() {

    // Email validation helpers
    const emailOk = localEmail.includes("@") && localEmail.includes(".");
    const passOk = localPass.length >= 6;
    const emailHint = localEmail.length > 3 && !emailOk ? "❌ Not a valid email" : emailOk ? "✅ Email looks good" : "";
    const passHint = localPass.length > 0 && !passOk ? `❌ ${6 - localPass.length} more char${6 - localPass.length === 1 ? "" : "s"} needed` : passOk ? "✅ Password ok" : "";
    // Room code format helper
    const fmtRoom = v => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const roomHint = roomInput.length > 0 && roomInput.length < 4 ? "⚠️ Codes are usually 4+ characters" : roomInput.length >= 4 ? "✅ Room code ready" : "";

    function doSignIn() {
      if (!emailOk) { showNotif("❌ Check your email", "Looks like it's not formatted right"); return; }
      setAuthEmail(localEmail); setAuthPassword(localPass);
      setTimeout(() => signIn(), 50);
    }
    function doSignUp() {
      if (!emailOk || !passOk) return;
      setMyName(localName); setAuthEmail(localEmail); setAuthPassword(localPass);
      setTimeout(() => signUp(), 50);
    }
    function doJoin() {
      const code = roomInput.trim().toUpperCase();
      if (code.length < 2) { setRoomInputError("⚠️ Enter a valid room code"); return; }
      setRoomInputError("");
      setJoinCode(code);
      setTimeout(() => {
        joinRoom(code);
        subscribeTeamChat(code);
      }, 50);
    }
    function doLeave() {
      leaveRoom();
      if (teamChatUnsub) try { teamChatUnsub(); } catch (e) { }
      setTeamChatMsgs([]);
    }
    function doAddTask() {
      if (!newTaskInput.trim()) return;
      addSharedTask(newTaskInput.trim());
      setNewTaskInput("");
    }
    function doSendChat() {
      if (!chatMsg.trim()) return;
      sendTeamChat(chatMsg);
      setChatMsg("");
    }

    // ── Login Screen ──
    if (!authUser) return (
      <div style={{ padding: "0 0 90px", minHeight: "100%", background: "var(--bg)" }}>
        {/* Hero */}
        <div style={{ background: "linear-gradient(160deg,#04060f 0%,#0d0028 50%,#1a0040 100%)", padding: "32px 20px 28px", textAlign: "center", position: "relative", overflow: "hidden" }}>
          {/* Star field */}
          {[...Array(20)].map((_, i) => (
            <div key={i} style={{
              position: "absolute", borderRadius: "50%",
              width: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2, height: i % 4 === 0 ? 4 : i % 3 === 0 ? 3 : 2,
              background: "#fff", opacity: 0.2 + Math.random() * 0.6,
              top: `${Math.random() * 90}%`, left: `${Math.random() * 100}%`,
              animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 4}s`, pointerEvents: "none"
            }} />
          ))}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: 52, marginBottom: 8, filter: `drop-shadow(0 0 24px ${accent.v})` }}>👫</div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#fff", marginBottom: 6 }}>Team Collaboration</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.6 }}>Sign in to sync with your team in real time</div>
          </div>
        </div>

        <div style={{ padding: "24px 18px", maxWidth: 420, margin: "0 auto" }}>
          {/* Mode tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "var(--s2)", borderRadius: 14, padding: 4 }}>
            {["signin", "signup"].map(m => (
              <button key={m} onClick={() => setAuthMode(m)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, fontSize: 13.5, fontWeight: 700, border: "none", cursor: "pointer", background: authMode === m ? `linear-gradient(135deg,${accent.v},${accent.g})` : "transparent", color: authMode === m ? "#fff" : "var(--t3)", transition: "all .22s", boxShadow: authMode === m ? `0 4px 14px ${accent.v}50` : "none" }}>
                {m === "signin" ? "Sign In 🔑" : "Create Account ✨"}
              </button>
            ))}
          </div>

          {/* Google Sign-in — most prominent */}
          <button onClick={signInWithGoogle} disabled={authLoading}
            style={{
              width: "100%", height: 50, background: "#fff", borderRadius: 14, fontSize: 15, fontWeight: 600,
              color: "#1a1a1a", border: "2px solid #e8e8e8", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 16,
              opacity: authLoading ? 0.6 : 1, transition: "all .2s",
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)"
            }}>
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
            </svg>
            {authLoading ? "Connecting…" : "Continue with Google"}
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, height: 1, background: "var(--b1)" }} />
            <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 600 }}>or use email</span>
            <div style={{ flex: 1, height: 1, background: "var(--b1)" }} />
          </div>

          {/* Email form */}
          {authMode === "signup" && (
            <div style={{ marginBottom: 12 }}>
              <div className="f-lbl">Display Name</div>
              <input className="f-in" placeholder="Your name" value={localName} onChange={e => setLocalName(e.target.value)} autoComplete="name" />
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div className="f-lbl" style={{ margin: 0 }}>Email</div>
              {emailHint && <span style={{ fontSize: 11, color: emailOk ? "#6bcb77" : "var(--red)" }}>{emailHint}</span>}
            </div>
            <input className="f-in" type="email" placeholder="your@email.com" value={localEmail}
              onChange={e => setLocalEmail(e.target.value.trim())}
              style={{ border: `1.5px solid ${localEmail.length > 3 ? (emailOk ? "#6bcb77" : "#ff6b6b") : "var(--b1)"}` }}
              autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck="false" />
          </div>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <div className="f-lbl" style={{ margin: 0 }}>Password</div>
              {passHint && <span style={{ fontSize: 11, color: passOk ? "#6bcb77" : "var(--red)" }}>{passHint}</span>}
            </div>
            <div style={{ position: "relative" }}>
              <input className="f-in" type={showPass ? "text" : "password"} placeholder="Min 6 characters" value={localPass}
                onChange={e => setLocalPass(e.target.value)}
                style={{ border: `1.5px solid ${localPass.length > 0 ? (passOk ? "#6bcb77" : "#ff6b6b") : "var(--b1)"}`, paddingRight: 42 }}
                onKeyDown={e => { if (e.key === "Enter") authMode === "signin" ? doSignIn() : doSignUp(); }} />
              <button onClick={() => setShowPass(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "var(--t3)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          {authError && <div style={{ color: "var(--red)", fontSize: 12.5, margin: "8px 0", padding: "9px 12px", background: "rgba(255,107,107,.12)", borderRadius: 10, border: "1px solid rgba(255,107,107,.25)" }}>{authError}</div>}
          <button onClick={authMode === "signin" ? doSignIn : doSignUp} disabled={authLoading || !emailOk || !passOk}
            style={{ width: "100%", height: 48, background: emailOk && passOk ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s3)", borderRadius: 13, fontSize: 14, fontWeight: 700, color: emailOk && passOk ? "#fff" : "var(--t3)", border: "none", cursor: emailOk && passOk ? "pointer" : "not-allowed", marginTop: 14, transition: "all .2s", boxShadow: emailOk && passOk ? `0 6px 20px ${accent.v}50` : "none" }}>
            {authLoading ? "Please wait…" : authMode === "signin" ? "Sign In →" : "Create Account →"}
          </button>
          <button onClick={() => { localStorage.setItem("tf_guest", "1"); setGuestMode(true); setShowAuthScreen(false); }} style={{ width: "100%", marginTop: 10, padding: "10px", fontSize: 13, color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>
            Continue as Guest (no sync)
          </button>
        </div>
      </div>
    );

    // ── Connected view ──
    const collabTabs = [{ id: "tasks", icon: "📋", label: "Tasks" }, { id: "chat", icon: "💬", label: "Chat" }, { id: "sync", icon: "☁️", label: "Sync" }];
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", paddingBottom: 90 }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg,${accent.v}18,${accent.g}0a)`, borderBottom: "1px solid var(--b1)", padding: "14px 16px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {authUser.photo ? <img src={authUser.photo} style={{ width: 34, height: 34, borderRadius: 10, objectFit: "cover" }} alt="" />
                : <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>👤</div>}
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{authUser.name}</div>
                <div style={{ fontSize: 11, color: statusColors[collabStatus] }}>{statusLabels[collabStatus]}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={syncToGoogle} title="Sync to Google"
                style={{ height: 32, padding: "0 12px", background: `${accent.v}18`, border: `1px solid ${accent.v}40`, borderRadius: 9, fontSize: 12, fontWeight: 700, color: accent.v, cursor: "pointer" }}>
                {syncStatus === "syncing" ? "⏳" : "☁️"} {syncStatus === "synced" ? "Synced!" : syncStatus === "syncing" ? "Syncing…" : "Sync"}
              </button>
              <button onClick={signOut} style={{ height: 32, padding: "0 10px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, fontSize: 12, color: "var(--t3)", cursor: "pointer" }}>Sign Out</button>
            </div>
          </div>
          {/* Room connection */}
          {!activeRoomCode ? (
            <div style={{ background: "var(--s1)", borderRadius: 12, padding: "12px 14px", border: "1px solid var(--b1)" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)", marginBottom: 8 }}>🔗 Join or Create a Room</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginBottom: 8 }}>Your shareable code: <span style={{ color: accent.v, fontWeight: 800, letterSpacing: 1 }}>{myRoomCode}</span> — share this with teammates</div>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <input className="f-in" placeholder="Enter room code (e.g. TF-ALPHA)" value={roomInput}
                    onChange={e => { const v = fmtRoom(e.target.value); setRoomInput(v); setRoomInputError(""); }}
                    onKeyDown={e => e.key === "Enter" && doJoin()}
                    style={{ marginBottom: roomInputError || roomHint ? 4 : 0, border: `1.5px solid ${roomInputError ? "#ff6b6b" : roomInput.length >= 4 ? `${accent.v}80` : "var(--b1)"}` }}
                    autoComplete="off" autoCapitalize="characters" spellCheck="false" />
                  {(roomInputError || roomHint) && <div style={{ fontSize: 11, color: roomInputError ? "#ff6b6b" : roomInput.length >= 4 ? "#6bcb77" : "#ffd93d" }}>{roomInputError || roomHint}</div>}
                </div>
                <button onClick={doJoin} style={{ height: 42, padding: "0 16px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, boxShadow: `0 4px 14px ${accent.v}45` }}>Join →</button>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--t3)" }}>💡 Tip: Share your code above with teammates, or enter theirs to join</div>
            </div>
          ) : (
            <div style={{ background: "linear-gradient(135deg,#6bcb7718,#6bcb7708)", border: "1px solid #6bcb7744", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#6bcb77", boxShadow: "0 0 8px #6bcb77", animation: "blink 2s infinite", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#6bcb77" }}>Room: {activeRoomCode}</div>
                <div style={{ fontSize: 11, color: "var(--t3)" }}>{sharedTasks.length} tasks · {teamChatMsgs.length} messages</div>
              </div>
              <button onClick={doLeave} style={{ fontSize: 11, padding: "5px 10px", background: "rgba(255,107,107,.15)", color: "#ff6b6b", border: "1px solid rgba(255,107,107,.3)", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>Leave</button>
            </div>
          )}
        </div>

        {/* Members Status (Presence) */}
        {activeRoomCode && (
           <div style={{ padding: "0 16px 12px", borderBottom: "1px solid var(--b1)", display: "flex", gap: 10, overflowX: "auto", background: "var(--s1)" }}>
              {/* Note: In a real app, this would be an onSnapshot listener on the 'presence' collection */}
              <div style={{ flexShrink: 0, padding: "8px 12px", background: "var(--s2)", borderRadius: 12, border: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 8 }}>
                 <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6bcb77" }} />
                 <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t2)" }}>You (Working)</div>
              </div>
              <div style={{ flexShrink: 0, padding: "8px 12px", background: "var(--s2)", borderRadius: 12, border: "1px solid var(--b1)", display: "flex", alignItems: "center", gap: 8, opacity: 0.7 }}>
                 <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--t3)" }} />
                 <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)" }}>Teammates (Offline)</div>
              </div>
           </div>
        )}

        {/* Tabs */}
        {activeRoomCode && (
          <div style={{ display: "flex", gap: 4, padding: "10px 14px 0", flexShrink: 0, borderBottom: "1px solid var(--b1)" }}>
            {collabTabs.map(ct => (
              <button key={ct.id} onClick={() => setActiveCollabTab(ct.id)}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 10, fontSize: 12.5, fontWeight: 700, border: "none", cursor: "pointer",
                  background: activeCollabTab === ct.id ? `linear-gradient(135deg,${accent.v}28,${accent.g}14)` : "transparent",
                  color: activeCollabTab === ct.id ? accent.v : "var(--t3)",
                  borderBottom: activeCollabTab === ct.id ? `2px solid ${accent.v}` : "2px solid transparent",
                  transition: "all .18s"
                }}>
                {ct.icon} {ct.label}
              </button>
            ))}
          </div>
        )}

        {/* Tasks Tab */}
        {(!activeRoomCode || (activeRoomCode && activeCollabTab === "tasks")) && activeRoomCode && (
          <div style={{ padding: "14px 16px", flex: 1 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <input className="f-in" placeholder="Add a shared task…" value={newTaskInput}
                onChange={e => setNewTaskInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doAddTask()}
                style={{ flex: 1 }} />
              <button onClick={doAddTask} style={{ height: 42, padding: "0 14px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>+ Add</button>
              <button onClick={shareMyTasks} title="Share my top tasks" style={{ height: 42, padding: "0 12px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 11, fontSize: 13, cursor: "pointer" }} title="Share my tasks">📤</button>
            </div>
            {sharedTasks.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--t3)" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13 }}>No shared tasks yet</div>
              <div style={{ fontSize: 11, marginTop: 4 }}>Add one above or share your own tasks</div>
            </div>}
            {sharedTasks.map(task => (
              <div key={task.id} style={{ background: "var(--s1)", border: `1px solid ${task.assignedTo === authUser?.name || task.assignedTo === myName ? `${accent.v}45` : "var(--b1)"}`, borderRadius: 14, padding: "11px 13px", marginBottom: 8, transition: "all .18s" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                  <div className={`chk ${task.done ? "on" : ""}`} style={{ flexShrink: 0, marginTop: 2 }} onClick={() => toggleSharedTask(task)}>
                    {task.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: task.done ? "line-through" : "none", color: task.done ? "var(--t3)" : "var(--t1)", marginBottom: 4 }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                      <span style={{ fontSize: 10.5, color: "var(--t3)" }}>by {task.addedBy}</span>
                      {task.assignedTo && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: (task.assignedTo === authUser?.name || task.assignedTo === myName) ? `${accent.v}22` : "var(--s3)", color: (task.assignedTo === authUser?.name || task.assignedTo === myName) ? accent.v : "var(--t3)", fontWeight: 700, border: (task.assignedTo === authUser?.name || task.assignedTo === myName) ? `1px solid ${accent.v}44` : "none" }}>→ {task.assignedTo} {(task.assignedTo === authUser?.name || task.assignedTo === myName) ? "(you)" : ""}</span>}
                      {task.priority && <span style={{ fontSize: 10, color: task.priority === "high" ? "#ff6b6b" : task.priority === "medium" ? "#ffd93d" : "#6bcb77", fontWeight: 800 }}>{task.priority === "high" ? "🔴" : task.priority === "medium" ? "🟡" : "🟢"}</span>}
                    </div>
                    {task.comment && <div style={{ fontSize: 11, marginTop: 5, padding: "5px 9px", background: "var(--s2)", borderRadius: 7, color: "var(--t2)", fontStyle: "italic" }}>💬 {task.comment}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => setAssignModal(task)} style={{ fontSize: 12, padding: "4px 8px", background: "var(--s2)", border: "none", borderRadius: 7, cursor: "pointer" }} title="Assign">👤</button>
                    <button onClick={() => setCommentModal(task)} style={{ fontSize: 12, padding: "4px 8px", background: "var(--s2)", border: "none", borderRadius: 7, cursor: "pointer" }} title="Comment">💬</button>
                    <button onClick={() => deleteSharedTask(task.id)} style={{ fontSize: 12, padding: "4px 8px", background: "rgba(255,107,107,.12)", border: "none", borderRadius: 7, cursor: "pointer", color: "#ff6b6b" }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Chat Tab */}
        {activeRoomCode && activeCollabTab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "0 0 0 0", minHeight: 0 }}>
            <div ref={chatScrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {teamChatMsgs.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--t3)" }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>💬</div>
                <div style={{ fontSize: 13 }}>No messages yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Start the conversation!</div>
              </div>}
              {teamChatMsgs.map(msg => {
                const isMe = msg.sender === (authUser?.name || myName);
                return (
                  <div key={msg.id} style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 9, background: isMe ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: isMe ? "#fff" : "var(--t2)", flexShrink: 0 }}>
                      {msg.sender?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div style={{ maxWidth: "75%" }}>
                      {!isMe && <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 2, paddingLeft: 2 }}>{msg.sender}</div>}
                      <div style={{ background: isMe ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s1)", color: isMe ? "#fff" : "var(--t1)", padding: "9px 13px", borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: 13, lineHeight: 1.5, border: isMe ? "none" : "1px solid var(--b1)", boxShadow: isMe ? `0 3px 12px ${accent.v}40` : "0 2px 8px rgba(0,0,0,.06)" }}>
                        {msg.text}
                      </div>
                      <div style={{ fontSize: 9, color: "var(--t3)", marginTop: 2, textAlign: isMe ? "right" : "left", paddingLeft: isMe ? 0 : 2, paddingRight: isMe ? 2 : 0 }}>
                        {msg.ts ? new Date(msg.ts).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: "1px solid var(--b1)", padding: "10px 14px", display: "flex", gap: 8, flexShrink: 0 }}>
              <input className="f-in" placeholder="Type a message…" value={chatMsg}
                onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSendChat(); } }}
                style={{ flex: 1, marginBottom: 0 }} />
              <button onClick={doSendChat} disabled={!chatMsg.trim()} style={{ height: 42, padding: "0 16px", background: chatMsg.trim() ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s3)", borderRadius: 11, fontSize: 14, fontWeight: 700, color: chatMsg.trim() ? "#fff" : "var(--t3)", border: "none", cursor: chatMsg.trim() ? "pointer" : "not-allowed", transition: "all .2s" }}>↑</button>
            </div>
          </div>
        )}

        {/* Sync Tab */}
        {activeRoomCode && activeCollabTab === "sync" && (
          <div style={{ padding: "18px 16px" }}>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, marginBottom: 4 }}>☁️ Google Sync</div>
            <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 18, lineHeight: 1.6 }}>Your tasks, XP, goals and settings sync to your Google account so they're available on any device.</div>
            <div style={{ background: `linear-gradient(135deg,${accent.v}15,${accent.g}08)`, border: `1px solid ${accent.v}35`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                {authUser.photo ? <img src={authUser.photo} style={{ width: 40, height: 40, borderRadius: 12, objectFit: "cover" }} alt="" /> : <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</div>}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{authUser.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)" }}>{authUser.email}</div>
                </div>
              </div>
              {lastSynced && <div style={{ fontSize: 11, color: "#6bcb77", marginBottom: 10 }}>✅ Last synced: {lastSynced}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <button onClick={syncToGoogle} style={{ height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 4px 14px ${accent.v}45` }}>
                  {syncStatus === "syncing" ? "⏳ Syncing…" : "☁️ Save to Cloud"}
                </button>
                <button onClick={restoreFromGoogle} style={{ height: 44, background: "var(--s2)", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "var(--t1)", border: "1px solid var(--b1)", cursor: "pointer" }}>
                  📥 Restore Data
                </button>
              </div>
            </div>
            <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "14px", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Auto-Sync</div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>Sync automatically when tasks change</div>
                </div>
                <div className={`toggle ${autoSync ? "on" : ""}`} onClick={() => { const n = !autoSync; setAutoSync(n); localStorage.setItem("tf_auto_sync", n ? "1" : "0"); showNotif(n ? "✅ Auto-sync ON" : "📴 Auto-sync OFF", ""); }}>
                  <div className="toggle-knob" />
                </div>
              </div>
            </div>
            <div style={{ background: "var(--s2)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t2)", marginBottom: 6 }}>📊 What gets synced</div>
              {["Tasks & subtasks", "Goals & milestones", "Habits & streaks", "Notes", "Moods", "Finances & debts", "Sleep & calorie logs", "XP & badges", "Categories", "LIBI memory", "App preferences"].map(item => (
                <div key={item} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", fontSize: 12, color: "var(--t3)" }}>
                  <span style={{ color: "#6bcb77", fontSize: 11 }}>✓</span>{item}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Assign Modal */}
        {assignModal && (
          <div className="overlay" onClick={() => setAssignModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
              <div className="drag" /><div className="m-head"><div className="m-title">👤 Assign Task</div><button className="ic-btn" onClick={() => setAssignModal(null)}>✕</button></div>
              <div className="m-body">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--t2)" }}>{assignModal.title}</div>
                {["Me", ...teamChatMsgs.filter(m => m.sender !== authUser?.name && m.sender !== myName).reduce((acc, m) => { if (!acc.includes(m.sender)) acc.push(m.sender); return acc; }, [])].map(name => (
                  <button key={name} onClick={() => { toggleSharedTask({ ...assignModal, assignedTo: name === "Me" ? (authUser?.name || myName) : name }); setAssignModal(null); }} style={{ width: "100%", textAlign: "left", padding: "10px 14px", background: "var(--s2)", border: `1px solid ${assignModal.assignedTo === name ? accent.v : "var(--b1)"}`, borderRadius: 10, fontSize: 13, cursor: "pointer", marginBottom: 6, color: "var(--t1)", fontWeight: assignModal.assignedTo === name ? 700 : 400 }}>
                    {name === "Me" ? `${authUser?.name || myName} (me)` : name} {assignModal.assignedTo === name ? "✓" : ""}
                  </button>
                ))}
                <button onClick={() => { toggleSharedTask({ ...assignModal, assignedTo: null }); setAssignModal(null); }} style={{ width: "100%", padding: "8px", background: "none", border: "none", fontSize: 12, color: "var(--t3)", cursor: "pointer", marginTop: 4 }}>Clear assignment</button>
              </div>
            </div>
          </div>
        )}
        {/* Comment Modal */}
        {commentModal && (
          <div className="overlay" onClick={() => setCommentModal(null)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
              <div className="drag" /><div className="m-head"><div className="m-title">💬 Add Comment</div><button className="ic-btn" onClick={() => setCommentModal(null)}>✕</button></div>
              <div className="m-body">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: "var(--t2)" }}>{commentModal.title}</div>
                <input className="f-in" placeholder="Add a comment…" defaultValue={commentModal.comment || ""} id="commentInp" autoFocus />
              </div>
              <div className="m-foot">
                <button className="btn-c" onClick={() => setCommentModal(null)}>Cancel</button>
                <button className="btn-s" onClick={() => { const v = document.getElementById("commentInp")?.value || ""; toggleSharedTask({ ...commentModal, comment: v.trim() || null }); setCommentModal(null); }}>Save</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };


  // ==========================================
  //  GOALS & MILESTONES
  // ==========================================
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({
    title: "", icon: "🎯", color: "#7c6dfa", deadline: "", milestones: [],
    smart_specific: "", smart_measurable: "", smart_achievable: "", smart_relevant: "", smart_timebound: "",
    isSmart: false
  });
  const [showSmartHelper, setShowSmartHelper] = useState(false);
  const [goalMilestoneInput, setGoalMilestoneInput] = useState("");
  const GOAL_ICONS = ["🎯", "🚀", "💪", "📚", "💰", "🏠", "🎨", "✈️", "🏆", "❤️", "🌟", "🎵", "🏋️", "💡", "🌿", "⚡"];
  const GOAL_COLORS = ["#7c6dfa", "#6bcb77", "#ffd93d", "#ff6b6b", "#00d4aa", "#f589a3", "#ff9f43", "#48dbfb", "#d47cff"];

  const toggleMilestone = (goalId, mId) => setGoals(gs => gs.map(g => g.id === goalId ? { ...g, milestones: g.milestones.map(m => m.id === mId ? { ...m, done: !m.done } : m) } : g));

  function getSmartScore(goal) {
    let score = 0;
    if (goal.smart_specific?.trim()) score++;
    if (goal.smart_measurable?.trim()) score++;
    if (goal.smart_achievable?.trim()) score++;
    if (goal.smart_relevant?.trim()) score++;
    if (goal.smart_timebound?.trim() || goal.deadline) score++;
    return score;
  }
  function saveGoal() {
    if (!goalForm.title.trim()) return;
    const smartScore = getSmartScore(goalForm);
    const isSmart = smartScore >= 3;
    function doSave() {
      const goalData = { ...goalForm, isSmart };
      if (editGoal) setGoals(gs => gs.map(g => g.id === editGoal.id ? { ...g, ...goalData } : g));
      else setGoals(gs => [{ id: uid(), ...goalData, profileId: activeProfile }, ...gs]);
      setShowGoalModal(false); setEditGoal(null); play("add");
      showNotif("🏆 Goal saved!", goalForm.title);
    };
    if (editGoal) doSave(); else doSave();
  };
  function deleteGoal(id) { setGoals(gs => gs.filter(g => g.id !== id)); play("delete"); };


  function GoalsPage() {
    const profileGoals = goals.filter(g => !g.profileId || g.profileId === activeProfile);
    return (
      <div style={{ padding: "18px 18px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22 }}>🏆 Goals</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 2 }}>{profileGoals.length} goals · {profileGoals.reduce((a, g) => a + g.milestones.filter(m => m.done).length, 0)} milestones done</div>
          </div>
          <button style={{ height: 38, padding: "0 14px", background: "var(--acc)", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: "0 4px 14px var(--glow)" }} onClick={() => { setGoalForm({ title: "", icon: "🎯", color: "#7c6dfa", deadline: "", milestones: [] }); setGoalMilestoneInput(""); setEditGoal(null); setShowGoalModal(true); }}>+ New Goal</button>
        </div>

        {profileGoals.length === 0 && <div className="empty"><div className="empty-icon">🏆</div><div className="empty-t">No goals yet!</div><div style={{ fontSize: 12.5, color: "var(--t3)" }}>Tap + to set your first goal</div></div>}

        {profileGoals.map(goal => {
          const done = goal.milestones.filter(m => m.done).length;
          const total = goal.milestones.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
          return (
            <div key={goal.id} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "16px", marginBottom: 12, overflow: "hidden", position: "relative" }}>
              {/* Color accent strip */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: goal.color, borderRadius: "16px 16px 0 0" }} />
              <div style={{ display: "flex", alignItems: "flex-start", gap: 11, marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: goal.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{goal.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{goal.title}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {daysLeft !== null && <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: daysLeft < 30 ? "rgba(255,107,107,.15)" : "var(--s2)", color: daysLeft < 30 ? "var(--red)" : "var(--t3)", border: `1px solid ${daysLeft < 30 ? "rgba(255,107,107,.3)" : "var(--b1)"}` }}>{daysLeft > 0 ? `${daysLeft} days left` : "Deadline passed!"}</span>}
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: goal.color + "22", color: goal.color, border: `1px solid ${goal.color}33`, fontWeight: 700 }}>{pct}% done</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button className="ic-btn" onClick={() => { setGoalForm({ title: goal.title, icon: goal.icon, color: goal.color, deadline: goal.deadline, milestones: goal.milestones.map(m => ({ ...m })) }); setGoalMilestoneInput(""); setEditGoal(goal); setShowGoalModal(true); }}>✎</button>
                  <button className="ic-btn del" onClick={() => deleteGoal(goal.id)}>✕</button>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: goal.color, borderRadius: 3, transition: "width .6s ease" }} />
              </div>
              {/* Milestones */}
              {goal.milestones.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {goal.milestones.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 10px", background: "var(--s2)", borderRadius: 9, cursor: "pointer", transition: "all .15s" }} onClick={() => { toggleMilestone(goal.id, m.id); play(m.done ? "tap" : "complete"); }}>
                      <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${m.done ? goal.color : "var(--s4)"}`, background: m.done ? goal.color : "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .2s" }}>
                        {m.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 13, flex: 1, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--t3)" : "var(--t1)" }}>{m.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {goal.milestones.length === 0 && <div style={{ fontSize: 12.5, color: "var(--t3)", textAlign: "center", padding: "8px 0" }}>No milestones yet — tap ✎ to add some</div>}
            </div>
          );
        })}

      </div>
    );
  };

  // ==========================================
  //  HABIT TRACKER
  // ==========================================
  const DAYS_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
  const getLast14Days = () => Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return d.toISOString().split("T")[0]; });
  const getLast7Days = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toISOString().split("T")[0]; });

  const [showHabitModal, setShowHabitModal] = useState(false);
  const [habitForm, setHabitForm] = useState({ name: "", icon: "⭐", color: "#7c6dfa", freq: "daily" });
  const FREQ_OPTS = [{ id: "daily", label: "Every Day" }, { id: "weekdays", label: "Weekdays" }, { id: "weekly", label: "Weekly" }, { id: "3x", label: "3× Week" }];
  const HABIT_ICONS = ["🏃", "📚", "💧", "🧘", "📵", "💪", "🥗", "😴", "✍️", "🎵", "🙏", "🌿", "☀️", "🚶", "🍎", "⭐", "🔥", "💊", "🧹", "📝"];

  function toggleHabit(habitId, date) {

    setHabits(hs => hs.map(h => h.id === habitId ? { ...h, completions: { ...h.completions, [date]: !h.completions[date] } } : h));
    play("tap");
  };
  function getStreak(habit) {

    let streak = 0; const d = new Date();
    while (true) { const ds = d.toISOString().split("T")[0]; if (!habit.completions[ds]) break; streak++; d.setDate(d.getDate() - 1); }
    return streak;
  };
  function getBestStreak(habit) {

    const dates = Object.keys(habit.completions).filter(k => habit.completions[k]).sort();
    if (!dates.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = (new Date(dates[i]) - new Date(dates[i - 1])) / (1000 * 60 * 60 * 24);
      if (diff === 1) { cur++; best = Math.max(best, cur); } else { cur = 1; }
    }
    return best;
  };
  function saveHabit() {

    if (!habitForm.name.trim()) return;
    setHabits(hs => [{ id: uid(), ...habitForm, completions: {}, profileId: activeProfile }, ...hs]);
    setShowHabitModal(false); play("add");
    showNotif("🔁 Habit added!", habitForm.name);
  };
  function deleteHabit(id) { setHabits(hs => hs.filter(h => h.id !== id)); play("delete"); };


  function HabitsPage() {
    const profileHabits = habits.filter(h => !h.profileId || h.profileId === activeProfile);
    const last14 = getLast14Days();
    const last7 = getLast7Days();
    const totalDoneToday = profileHabits.filter(h => h.completions[todayStr()]).length;
    const allDoneToday = profileHabits.length > 0 && totalDoneToday === profileHabits.length;
    return (
      <div style={{ padding: "18px 18px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22 }}>🔁 Habits</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 2 }}>{profileHabits.length} habits tracked</div>
          </div>
          <button style={{ height: 38, padding: "0 14px", background: "var(--acc)", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: "0 4px 14px var(--glow)" }} onClick={() => { setHabitForm({ name: "", icon: "⭐", color: "#7c6dfa", freq: "daily" }); setShowHabitModal(true); }}>+ New Habit</button>
        </div>

        {/* Today summary card */}
        <div style={{ background: allDoneToday ? `linear-gradient(135deg,${accent.v}22,${accent.g}11)` : "var(--s1)", border: `1px solid ${allDoneToday ? accent.v + "44" : "var(--b1)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 16, marginTop: 10, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontSize: 36 }}>{allDoneToday ? "🔥" : "📅"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{allDoneToday ? "Perfect day! All done! 🎉" : "Today's Progress"}</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)" }}>{totalDoneToday} of {profileHabits.length} habits completed today</div>
            <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
              <div style={{ height: "100%", width: `${profileHabits.length ? (totalDoneToday / profileHabits.length) * 100 : 0}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .5s ease" }} />
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: accent.v }}>{profileHabits.length ? Math.round((totalDoneToday / profileHabits.length) * 100) : 0}%</div>
            <div style={{ fontSize: 10, color: "var(--t3)" }}>done</div>
          </div>
        </div>

        {profileHabits.length === 0 && <div className="empty"><div className="empty-icon">🔁</div><div className="empty-t">No habits yet!</div><div style={{ fontSize: 12.5, color: "var(--t3)" }}>Tap + to track your first habit</div></div>}

        {/* Habit cards */}
        {profileHabits.map(habit => {
          const streak = getStreak(habit);
          const best = getBestStreak(habit);
          const doneToday = !!habit.completions[todayStr()];
          return (
            <div key={habit.id} style={{ background: "var(--s1)", border: `1px solid ${doneToday ? habit.color + "44" : "var(--b1)"}`, borderRadius: 15, padding: "14px 15px", marginBottom: 10, transition: "all .2s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 40, height: 40, borderRadius: 11, background: habit.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{habit.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{habit.name}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 3, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: streak > 0 ? "#ffd93d" : "var(--t3)", fontWeight: streak > 0 ? 700 : 400 }}>🔥 {streak} day streak</span>
                    <span style={{ fontSize: 11, color: "var(--t3)" }}>Best: {best}</span>
                    <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 20, background: habit.color + "22", color: habit.color, fontWeight: 600 }}>{FREQ_OPTS.find(f => f.id === habit.freq)?.label || "Daily"}</span>
                  </div>
                </div>
                {/* Today toggle */}
                <button style={{ width: 42, height: 42, borderRadius: 12, background: doneToday ? habit.color : "var(--s2)", border: `2px solid ${doneToday ? habit.color : "var(--s4)"}`, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .2s", flexShrink: 0, boxShadow: doneToday ? `0 4px 12px ${habit.color}44` : "" }} onClick={() => toggleHabit(habit.id, todayStr())}>
                  {doneToday ? "✓" : "○"}
                </button>
                <button className="ic-btn del" style={{ flexShrink: 0 }} onClick={() => deleteHabit(habit.id)}>✕</button>
              </div>
              {/* 14-day grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(14,1fr)", gap: 3 }}>
                {last14.map((date, i) => {
                  const done = !!habit.completions[date];
                  const isToday = date === todayStr();
                  return (
                    <div key={i} style={{ height: 22, borderRadius: 5, background: done ? habit.color : isToday ? "var(--accd)" : "var(--s3)", border: isToday ? `1.5px solid ${accent.v}` : "1.5px solid transparent", cursor: "pointer", transition: "all .15s", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => toggleHabit(habit.id, date)} title={date}>
                      {done && <span style={{ fontSize: 8, color: "#fff", fontWeight: 800 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                {last14.filter((_, i) => i % 2 === 0).map((date, i) => <span key={i} style={{ fontSize: 9, color: "var(--t3)" }}>{new Date(date).toLocaleDateString("en-US", { weekday: "short" })[0]}</span>)}
              </div>
            </div>
          );
        })}

      </div>
    );
  };

  // ==========================================
  //  SMART DAILY PLANNER
  // ==========================================
  const TIME_BLOCKS = [
    { id: "morning", label: "Morning", icon: "🌅", time: "6:00 - 12:00", color: "#ffd93d" },
    { id: "afternoon", label: "Afternoon", icon: "☀️", time: "12:00 - 17:00", color: "#ff9f43" },
    { id: "evening", label: "Evening", icon: "🌆", time: "17:00 - 21:00", color: "#7c6dfa" },
    { id: "night", label: "Night", icon: "🌙", time: "21:00 - 24:00", color: "#48dbfb" },
  ];
  const [plannerDate, setPlannerDate] = useState(todayStr());
  const [plannedTasks, setPlannedTasks] = useState({}); // {taskId: blockId}
  const [plannerDone, setPlannerDone] = useState({}); // {taskId: bool}
  const [showPlannerPicker, setShowPlannerPicker] = useState(null); // blockId we're adding to

  // Auto-schedule: assigns tasks to blocks by priority & due date, skipping past blocks
  function autoSchedule() {

    const unscheduled = profileTasks.filter(t => !t.done);
    const byPriority = [...unscheduled].sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; });
    const slots = { morning: [], afternoon: [], evening: [], night: [] };
    const caps = { morning: 3, afternoon: 3, evening: 2, night: 1 };
    const newPlan = {};
    const isToday = plannerDate === todayStr();
    const curHour = new Date().getHours();
    // Determine which blocks are still available (not in the past)
    const blockAvailable = {
      morning: !isToday || curHour < 12,
      afternoon: !isToday || curHour < 17,
      evening: !isToday || curHour < 21,
      night: !isToday || curHour < 24,
    };
    // Helper to assign to first available block
    function assign(taskId, preferred) {
      const order = preferred === "morning"
        ? ["morning", "afternoon", "evening", "night"]
        : preferred === "afternoon"
          ? ["afternoon", "evening", "night", "morning"]
          : preferred === "evening"
            ? ["evening", "night", "afternoon", "morning"]
            : ["night", "evening", "afternoon", "morning"];
      for (const b of order) {
        if (blockAvailable[b] && slots[b].length < caps[b]) {
          slots[b].push(taskId); newPlan[taskId] = b; return;
        }
      }
      // All full -- just put in first available
      for (const b of ["morning", "afternoon", "evening", "night"]) {
        if (slots[b].length < caps[b]) { slots[b].push(taskId); newPlan[taskId] = b; return; }
      }
    };
    byPriority.forEach(task => {
      if (task.due === plannerDate || task.priority === "high") assign(task.id, "morning");
      else if (task.priority === "medium") assign(task.id, "afternoon");
      else assign(task.id, "evening");
    });
    setPlannedTasks(newPlan);
    setPlannerDone({});
    play("add");
    showNotif("📅 Plan ready!", `${Object.keys(newPlan).length} tasks scheduled`);
  };

  function assignToBlock(taskId, blockId) {

    setPlannedTasks(p => ({ ...p, [taskId]: blockId }));
    setShowPlannerPicker(null); play("tap");
  };
  const removeFromPlan = (taskId) => setPlannedTasks(p => { const n = { ...p }; delete n[taskId]; return n; });
  function togglePlannerDone(taskId) {

    const nowDone = !plannerDone[taskId];
    setPlannerDone(d => ({ ...d, [taskId]: nowDone }));
    // Sync to main task list
    setTasks(ts => ts.map(t => t.id === taskId ? { ...t, done: nowDone } : t));
    play(nowDone ? "complete" : "tap");
    if (nowDone) { awardXP(20, "Planner task done"); haptic("success"); showNotif("✅ Task completed!", "Synced to your task list"); }
  };


  // == FINANCE PAGE ==
  const FINANCE_CATS = [
    { id: "food", icon: "🍔", label: "Food", color: "#ff6b6b" },
    { id: "transport", icon: "🚗", label: "Transport", color: "#ffd93d" },
    { id: "shopping", icon: "🛍", label: "Shopping", color: "#a855f7" },
    { id: "bills", icon: "📱", label: "Bills", color: "#48dbfb" },
    { id: "health", icon: "💊", label: "Health", color: "#6bcb77" },
    { id: "entertain", icon: "🎬", label: "Fun", color: "#ff9f43" },
    { id: "education", icon: "📚", label: "Education", color: "#7c6dfa" },
    { id: "savings", icon: "🏦", label: "Savings", color: "#00d4aa" },
    { id: "salary", icon: "💼", label: "Income", color: "#6bcb77" },
    { id: "debt", icon: "💳", label: "Debt/Loan", color: "#ff6b6b" },
    { id: "other", icon: "💸", label: "Other", color: "#9090a0" },
  ];

  function FinancePage() {
    const now = new Date();
    const cur = currency;
    const fmt = (n) => `${cur}${Math.abs(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const periodFilter = (f) => {
      const d = new Date(f.date || f.createdAt || Date.now());
      if (financePeriod === "week") { const w = new Date(); w.setDate(w.getDate() - 7); return d >= w; }
      if (financePeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (financePeriod === "year") return d.getFullYear() === now.getFullYear();
      return true;
    };
    const profileFinances = finances.filter(f => !f.profileId || f.profileId === activeProfile);
    const filtered = profileFinances.filter(periodFilter);
    const totalIncome = filtered.filter(f => f.type === "income").reduce((a, f) => a + Number(f.amount), 0);
    const totalExpense = filtered.filter(f => f.type === "expense").reduce((a, f) => a + Number(f.amount), 0);
    const balance = totalIncome - totalExpense;
    const byCategory = FINANCE_CATS.map(c => ({
      ...c,
      total: filtered.filter(f => f.category === c.id && f.type === "expense").reduce((a, f) => a + Number(f.amount), 0)
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
    const savingsRate = totalIncome > 0 ? Math.round((balance / totalIncome) * 100) : 0;
    const maxCat = Math.max(...byCategory.map(c => c.total), 1);

    // == 7-day spending trend ==
    const trend7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const ds = d.toISOString().slice(0, 10);
      const dayTotal = profileFinances.filter(f => f.type === "expense" && f.date === ds).reduce((a, f) => a + Number(f.amount), 0);
      return { date: ds, day: d.toLocaleDateString("en", { weekday: "short" }), total: dayTotal };
    });
    const trendMax = Math.max(...trend7.map(d => d.total), 1);

    // == Monthly comparison ==
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    const thisMonthExp = profileFinances.filter(f => f.type === "expense" && new Date(f.date).getMonth() === thisMonth && new Date(f.date).getFullYear() === thisYear).reduce((a, f) => a + Number(f.amount), 0);
    const lastMonthExp = profileFinances.filter(f => f.type === "expense" && new Date(f.date).getMonth() === lastMonth && new Date(f.date).getFullYear() === lastYear).reduce((a, f) => a + Number(f.amount), 0);
    const monthDelta = lastMonthExp > 0 ? Math.round(((thisMonthExp - lastMonthExp) / lastMonthExp) * 100) : 0;

    // == Pie chart data ==
    const pieTotal = byCategory.reduce((a, c) => a + c.total, 0) || 1;
    let pieOffset = 0;
    const pieSlices = byCategory.map(c => {
      const pct = c.total / pieTotal;
      const slice = { ...c, pct, offset: pieOffset };
      pieOffset += pct;
      return slice;
    });

    return (
      <div style={{ padding: "18px 18px 100px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24 }}>💰 Finance</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>Track income & expenses</div>
          </div>
          <button onClick={() => { setFinanceForm({ type: "expense", amount: "", category: "food", note: "", date: new Date().toISOString().slice(0, 10) }); setShowFinanceModal(true); }} style={{ height: 40, padding: "0 18px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 4px 14px ${accent.v}40` }}>+ Add</button>
        </div>

        {/* Main Tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--s2)", borderRadius: 12, padding: 4 }}>
          {[["overview", "📊 Overview"], ["transactions", "📋 Transactions"], ["debt", "💳 Debt Tracker"]].map(([k, l]) => (
            <div key={k} onClick={() => setFinanceTab(k)} style={{ flex: 1, textAlign: "center", padding: "9px 4px", borderRadius: 9, fontSize: 11.5, fontWeight: 700, cursor: "pointer", background: financeTab === k ? `linear-gradient(135deg,${accent.v},${accent.g})` : "transparent", color: financeTab === k ? "#fff" : "var(--t3)", transition: "all .2s" }}>{l}</div>
          ))}
        </div>

        {/* Period Picker - only on overview */}
        {financeTab === "overview" && <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "var(--s2)", borderRadius: 12, padding: 4 }}>
          {[["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "All"]].map(([k, l]) => (
            <div key={k} onClick={() => setFinancePeriod(k)} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: "pointer", background: financePeriod === k ? `linear-gradient(135deg,${accent.v},${accent.g})` : "transparent", color: financePeriod === k ? "#fff" : "var(--t3)", transition: "all .2s" }}>{l}</div>
          ))}
        </div>}

        {/* Balance Card */}
        <div style={{ background: `linear-gradient(135deg,${balance >= 0 ? "#0a2a1a" : "#2a0a0a"},${balance >= 0 ? "#0d3520" : "#3a0d0d"})`, border: `1px solid ${balance >= 0 ? "rgba(107,203,119,.3)" : "rgba(255,107,107,.3)"}`, borderRadius: 20, padding: "20px 22px", marginBottom: 14, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -20, right: -20, width: 120, height: 120, borderRadius: "50%", background: balance >= 0 ? "rgba(107,203,119,.08)" : "rgba(255,107,107,.08)" }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{financePeriod === "week" ? "This Week" : financePeriod === "month" ? "This Month" : financePeriod === "year" ? "This Year" : "All Time"} Balance</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 36, color: balance >= 0 ? "#6bcb77" : "#ff6b6b", letterSpacing: -1, marginBottom: 14 }}>
            {balance >= 0 ? "+" : "-"}{fmt(balance)}
          </div>
          <div style={{ display: "flex", gap: 24 }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(107,203,119,.7)", fontWeight: 700, marginBottom: 2 }}>↑ INCOME</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#6bcb77" }}>{fmt(totalIncome)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,107,107,.7)", fontWeight: 700, marginBottom: 2 }}>↓ EXPENSES</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#ff6b6b" }}>{fmt(totalExpense)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: `${accent.v}cc`, fontWeight: 700, marginBottom: 2 }}>💰 SAVED</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: accent.v }}>{savingsRate}%</div>
            </div>
          </div>
        </div>

        {/* LIBI Finance Insight */}
        <div style={{ background: `linear-gradient(135deg,${accent.v}15,${accent.v}08)`, border: `1px solid ${accent.v}30`, borderRadius: 16, padding: "13px 16px", marginBottom: 14, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>✦</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: accent.v, marginBottom: 3 }}>LIBI says</div>
            <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6 }}>
              {totalExpense === 0 ? "No expenses recorded yet — tap + to add your first transaction! 💸" :
                savingsRate >= 30 ? `Amazing! You're saving ${savingsRate}% of income. That's better than 80% of people! 🏆` :
                  savingsRate >= 10 ? `You're saving ${savingsRate}% — decent! Aim for 20%+ for financial freedom 🎯` :
                    balance < 0 ? `You spent ${Math.abs(balance).toFixed(2)} more than you earned. Time to cut back on ${byCategory[0]?.label || "expenses"} 📊` :
                      `Your biggest expense is ${byCategory[0]?.icon || ""} ${byCategory[0]?.label || "unknown"} at ${byCategory[0]?.total.toFixed(2)}. Track more to see insights! 💡`}
            </div>
          </div>
        </div>

        {/* == Currency Selector == */}
        <div style={{ display: "flex", gap: 5, marginBottom: 14 }}>
          {["₹", "$", "€", "£", "¥"].map(c => (
            <button key={c} onClick={() => setCurrency(c)} style={{ width: 36, height: 36, borderRadius: 10, background: currency === c ? `${accent.v}22` : "var(--s2)", border: `1.5px solid ${currency === c ? accent.v : "var(--b1)"}`, color: currency === c ? accent.v : "var(--t2)", fontSize: 16, fontWeight: 800, cursor: "pointer", transition: "all .2s" }}>{c}</button>
          ))}
        </div>

        {/* == PIE CHART + BREAKDOWN == */}
        {financeTab === "overview" && byCategory.length > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>📊 Spending Breakdown</div>
            <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
              {/* SVG Pie Chart */}
              <div style={{ position: "relative", width: 140, height: 140, flexShrink: 0, margin: "0 auto" }}>
                <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                  {pieSlices.map((s, i) => (
                    <circle key={s.id} cx="70" cy="70" r="55" fill="none" stroke={s.color} strokeWidth="28"
                      strokeDasharray={`${2 * Math.PI * 55 * s.pct} ${2 * Math.PI * 55 * (1 - s.pct)}`}
                      strokeDashoffset={`${-2 * Math.PI * 55 * s.offset}`}
                      style={{ transition: "all .6s ease", filter: "drop-shadow(0 1px 3px rgba(0,0,0,.2))" }} />
                  ))}
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: "var(--t1)" }}>{fmt(totalExpense)}</div>
                  <div style={{ fontSize: 9, color: "var(--t3)" }}>Total Spent</div>
                </div>
              </div>
              {/* Legend */}
              <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 6 }}>
                {byCategory.slice(0, 6).map(c => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "var(--t2)", flex: 1 }}>{c.icon} {c.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>{fmt(c.total)}</span>
                    <span style={{ fontSize: 10, color: "var(--t3)" }}>{Math.round(c.pct * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* == 7-DAY TREND LINE == */}
        {financeTab === "overview" && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>📈 7-Day Spending Trend</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 100 }}>
              {trend7.map((d, i) => {
                const h = trendMax > 0 ? Math.max(4, (d.total / trendMax) * 85) : 4;
                return (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    {d.total > 0 && <div style={{ fontSize: 8, fontWeight: 700, color: "var(--t3)" }}>{fmt(d.total)}</div>}
                    <div style={{ width: "100%", height: h, background: i === 6 ? `linear-gradient(180deg,${accent.v},${accent.g})` : "var(--acc)", borderRadius: 6, opacity: i === 6 ? 1 : 0.5 + (i * 0.07), transition: "height .5s cubic-bezier(.34,1.56,.64,1)", boxShadow: i === 6 ? `0 2px 10px ${accent.v}40` : "none" }} />
                    <div style={{ fontSize: 9, fontWeight: i === 6 ? 800 : 600, color: i === 6 ? accent.v : "var(--t3)" }}>{d.day}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* == MONTHLY COMPARISON == */}
        {financeTab === "overview" && (thisMonthExp > 0 || lastMonthExp > 0) && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>📅 Monthly Comparison</div>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
              {/* Last month bar */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t2)", marginBottom: 6 }}>{fmt(lastMonthExp)}</div>
                <div style={{ height: Math.max(8, (lastMonthExp / Math.max(thisMonthExp, lastMonthExp, 1)) * 80), background: "var(--s3)", borderRadius: 8, transition: "height .5s ease" }} />
                <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4, fontWeight: 600 }}>Last Month</div>
              </div>
              {/* This month bar */}
              <div style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: accent.v, marginBottom: 6 }}>{fmt(thisMonthExp)}</div>
                <div style={{ height: Math.max(8, (thisMonthExp / Math.max(thisMonthExp, lastMonthExp, 1)) * 80), background: `linear-gradient(180deg,${accent.v},${accent.g})`, borderRadius: 8, transition: "height .5s ease", boxShadow: `0 3px 12px ${accent.v}30` }} />
                <div style={{ fontSize: 10, color: accent.v, marginTop: 4, fontWeight: 700 }}>This Month</div>
              </div>
              {/* Delta */}
              <div style={{ width: 70, textAlign: "center", paddingBottom: 14 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: monthDelta > 0 ? "#ff6b6b" : "#6bcb77" }}>{monthDelta > 0 ? "+" : ""}{monthDelta}%</div>
                <div style={{ fontSize: 9, color: "var(--t3)" }}>{monthDelta > 0 ? "More" : "Less"} spent</div>
              </div>
            </div>
          </div>
        )}

        {/* Spending by Category (bar breakdown) */}
        {byCategory.length > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>Category Details</div>
            {byCategory.map(c => (
              <div key={c.id} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 13, color: "var(--t1)", display: "flex", alignItems: "center", gap: 6 }}><span>{c.icon}</span>{c.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>{fmt(c.total)}</span>
                </div>
                <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(c.total / maxCat) * 100}%`, background: c.color, borderRadius: 3, transition: "width .6s ease" }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TRANSACTIONS TAB */}
        {financeTab === "transactions" && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>All Transactions ({profileFinances.length})</div>
            {/* Search/filter */}
            <input placeholder="🔍 Search transactions…" style={{ width: "100%", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "var(--t1)", outline: "none", marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }}
              onChange={e => {
                const q = e.target.value.toLowerCase();
                e.target._q = q;
                e.target.parentNode.querySelectorAll('.tx-row').forEach(r => {
                  r.style.display = q && !r.dataset.search?.includes(q) ? 'none' : '';
                });
              }} />
            {profileFinances.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--t3)", fontSize: 13 }}>No transactions yet — tap + to add one!</div>}
            {[...profileFinances].reverse().map(f => {
              const cat = FINANCE_CATS.find(c => c.id === f.category) || FINANCE_CATS[11];
              return (
                <div key={f.id} className="tx-row" data-search={`${f.note || ""} ${cat.label} ${f.date}`.toLowerCase()} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--b1)" }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.note || cat.label}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{f.date} · {cat.label}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: f.type === "income" ? "#6bcb77" : "#ff6b6b" }}>{f.type === "income" ? "+" : "-"}{fmt(f.amount).replace(cur, "")}</div>
                  </div>
                  <button onClick={() => setFinances(fs => fs.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14, padding: "4px", opacity: .5, flexShrink: 0 }}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DEBT TRACKER TAB */}
        {financeTab === "debt" && (
          <div>
            {/* Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.2)", borderRadius: 16, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#ff6b6b", marginBottom: 4 }}>YOU OWE</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#ff6b6b" }}>
                  {fmt(debts.filter(d => d.type === "owe" && !d.paid).reduce((a, d) => a + Number(d.amount), 0))}
                </div>
              </div>
              <div style={{ background: "rgba(107,203,119,.1)", border: "1px solid rgba(107,203,119,.2)", borderRadius: 16, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#6bcb77", marginBottom: 4 }}>OWED TO YOU</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#6bcb77" }}>
                  {fmt(debts.filter(d => d.type === "lent" && !d.paid).reduce((a, d) => a + Number(d.amount), 0))}
                </div>
              </div>
            </div>
            <button onClick={() => { setDebtForm({ name: "", amount: "", type: "owe", dueDate: "", note: "" }); setShowDebtModal(true); }}
              style={{ width: "100%", height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 13, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", marginBottom: 14 }}>
              + Add Debt / Loan
            </button>
            {debts.length === 0 && <div style={{ textAlign: "center", padding: "32px 0", color: "var(--t3)", fontSize: 13 }}>No debts recorded 🎉</div>}
            {debts.map(d => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 8, borderRadius: 14, background: d.paid ? "var(--s1)" : d.type === "owe" ? "rgba(255,107,107,.08)" : "rgba(107,203,119,.08)", border: `1px solid ${d.paid ? "var(--b1)" : d.type === "owe" ? "rgba(255,107,107,.2)" : "rgba(107,203,119,.2)"}`, opacity: d.paid ? 0.6 : 1 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: d.type === "owe" ? "rgba(255,107,107,.2)" : "rgba(107,203,119,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {d.type === "owe" ? "💳" : "💰"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>{d.type === "owe" ? "You owe" : "They owe you"}{d.dueDate ? ` · Due ${d.dueDate}` : ""}</div>
                  {d.note && <div style={{ fontSize: 11, color: "var(--t3)", fontStyle: "italic" }}>{d.note}</div>}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: d.type === "owe" ? "#ff6b6b" : "#6bcb77" }}>{d.type === "owe" ? "-" : "+"}{Number(d.amount).toFixed(2)}</div>
                  <button onClick={() => setDebts(ds => ds.map(x => x.id === d.id ? { ...x, paid: !x.paid } : x))} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: d.paid ? "var(--s2)" : `${accent.v}22`, border: `1px solid ${d.paid ? "var(--b1)" : accent.v}`, color: d.paid ? "var(--t3)" : accent.v, cursor: "pointer", marginTop: 4, fontFamily: "inherit" }}>
                    {d.paid ? "↩ Unpaid" : "✓ Mark Paid"}
                  </button>
                </div>
                <button onClick={() => setDebts(ds => ds.filter(x => x.id !== d.id))} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14, padding: "4px", flexShrink: 0 }}>✕</button>
              </div>
            ))}

            {/* Debt Modal */}
            {showDebtModal && (
              <div className="overlay" onClick={() => setShowDebtModal(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="drag" />
                  <div className="m-head">
                    <div className="m-title">💳 Add Debt / Loan</div>
                    <button className="ic-btn" onClick={() => setShowDebtModal(false)}>✕</button>
                  </div>
                  <div style={{ padding: "0 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "flex", gap: 8, background: "var(--s2)", borderRadius: 12, padding: 4 }}>
                      {[["owe", "💳 I Owe"], ["lent", "💰 They Owe Me"]].map(([k, l]) => (
                        <div key={k} onClick={() => setDebtForm(f => ({ ...f, type: k }))} style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", background: debtForm.type === k ? `linear-gradient(135deg,${accent.v},${accent.g})` : "transparent", color: debtForm.type === k ? "#fff" : "var(--t3)", transition: "all .2s" }}>{l}</div>
                      ))}
                    </div>
                    <div><div className="f-lbl">Person / Organization</div><input className="f-in" placeholder="e.g. John, Bank loan, Credit card" value={debtForm.name} onChange={e => setDebtForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><div className="f-lbl">Amount</div><input className="f-in" type="number" inputMode="decimal" placeholder="0.00" value={debtForm.amount} onChange={e => setDebtForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: 20, fontWeight: 800, textAlign: "center", letterSpacing: 1 }} /></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div><div className="f-lbl">Due Date</div><input className="f-in" type="date" value={debtForm.dueDate} onChange={e => setDebtForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                      <div><div className="f-lbl">Note</div><input className="f-in" placeholder="Optional" value={debtForm.note} onChange={e => setDebtForm(f => ({ ...f, note: e.target.value }))} /></div>
                    </div>
                    <button onClick={() => {
                      if (!debtForm.name.trim() || !debtForm.amount) return;
                      setDebts(ds => [...ds, { id: uid(), profileId: activeProfile, paid: false, createdAt: Date.now(), ...debtForm, amount: Math.abs(Number(debtForm.amount)) }]);
                      setShowDebtModal(false); play("add"); haptic("success");
                      showNotif(debtForm.type === "owe" ? "💳 Debt added" : "💰 Loan recorded", `${debtForm.name} · ${debtForm.amount}`);
                    }} style={{ height: 48, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 14, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Transactions (overview tab only) */}
        {financeTab === "overview" && <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px 18px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>Recent Transactions</div>
          {filtered.length === 0 && <div style={{ textAlign: "center", padding: "24px 0", color: "var(--t3)", fontSize: 13 }}>No transactions yet — tap + to add one!</div>}
          {[...filtered].reverse().slice(0, 10).map(f => {
            const cat = FINANCE_CATS.find(c => c.id === f.category) || FINANCE_CATS[11];
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--b1)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: cat.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{cat.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.note || cat.label}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{f.date} · {cat.label}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: f.type === "income" ? "#6bcb77" : "#ff6b6b" }}>{f.type === "income" ? "+" : "-"}{Number(f.amount).toFixed(2)}</div>
                </div>
                <button onClick={() => setFinances(fs => fs.filter(x => x.id !== f.id))} style={{ background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 14, padding: "4px", opacity: .5, flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
          {profileFinances.length > 10 && <div style={{ textAlign: "center", padding: "10px 0", fontSize: 12, color: accent.v, cursor: "pointer" }} onClick={() => setFinanceTab("transactions")}>View all {profileFinances.length} transactions →</div>}
        </div>}

        {/* Finance Modal */}
        {showFinanceModal && (
          <div className="overlay" onClick={() => setShowFinanceModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="drag" />
              <div className="m-head">
                <div className="m-title">💰 {financeForm.type === "income" ? "Add Income" : "Add Expense"}</div>
                <button className="ic-btn" onClick={() => setShowFinanceModal(false)}>✕</button>
              </div>
              <div style={{ padding: "0 18px 28px", display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Type */}
                <div style={{ display: "flex", gap: 8, background: "var(--s2)", borderRadius: 12, padding: 4 }}>
                  {[["expense", "↓ Expense", "#ff6b6b"], ["income", "↑ Income", "#6bcb77"]].map(([k, l, c]) => (
                    <div key={k} onClick={() => setFinanceForm(f => ({ ...f, type: k }))} style={{ flex: 1, textAlign: "center", padding: "9px 0", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", background: financeForm.type === k ? c : "transparent", color: financeForm.type === k ? "#fff" : "var(--t3)", transition: "all .2s" }}>{l}</div>
                  ))}
                </div>
                {/* Amount */}
                <div>
                  <div className="f-lbl">Amount</div>
                  <input className="f-in" type="number" inputMode="decimal" placeholder="0.00" value={financeForm.amount} onChange={e => setFinanceForm(f => ({ ...f, amount: e.target.value }))} style={{ fontSize: 22, fontWeight: 800, textAlign: "center", letterSpacing: 1 }} />
                </div>
                {/* Category */}
                <div>
                  <div className="f-lbl">Category</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
                    {FINANCE_CATS.map(c => (
                      <div key={c.id} onClick={() => setFinanceForm(f => ({ ...f, category: c.id }))} style={{ padding: "8px 4px", borderRadius: 11, border: `2px solid ${financeForm.category === c.id ? c.color : "var(--b1)"}`, background: financeForm.category === c.id ? c.color + "20" : "var(--s2)", cursor: "pointer", textAlign: "center", transition: "all .15s" }}>
                        <div style={{ fontSize: 20 }}>{c.icon}</div>
                        <div style={{ fontSize: 8, color: financeForm.category === c.id ? c.color : "var(--t3)", fontWeight: 600, marginTop: 2 }}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Note & Date */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div className="f-lbl">Note (optional)</div>
                    <input className="f-in" placeholder="What was this for?" value={financeForm.note} onChange={e => setFinanceForm(f => ({ ...f, note: e.target.value }))} />
                  </div>
                  <div>
                    <div className="f-lbl">Date</div>
                    <input className="f-in" type="date" value={financeForm.date} onChange={e => setFinanceForm(f => ({ ...f, date: e.target.value }))} />
                  </div>
                </div>
                <button onClick={() => {
                  if (!financeForm.amount || isNaN(Number(financeForm.amount))) return;
                  setFinances(fs => [...fs, { id: uid(), profileId: activeProfile, createdAt: Date.now(), ...financeForm, amount: Math.abs(Number(financeForm.amount)) }]);
                  setShowFinanceModal(false);
                  play("add"); awardXP(5, "Finance logged"); haptic("success");
                  showNotif(financeForm.type === "income" ? "💰 Income added!" : "💸 Expense logged!", `${financeForm.amount} · ${FINANCE_CATS.find(c => c.id === financeForm.category)?.label}`);
                }} style={{ height: 48, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 14, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 6px 20px ${accent.v}40` }}>
                  Save Transaction
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };


  function PlannerPage() {
    const scheduledIds = Object.keys(plannedTasks);
    const unscheduled = profileTasks.filter(t => !t.done && !plannedTasks[t.id]);
    const totalPlanned = scheduledIds.length;
    const totalDone = Object.values(plannerDone).filter(Boolean).length;
    const planPct = totalPlanned ? Math.round((totalDone / totalPlanned) * 100) : 0;
    const now = new Date();
    const curHour = now.getHours();
    const currentBlock = curHour < 12 ? "morning" : curHour < 17 ? "afternoon" : curHour < 21 ? "evening" : "night";

    return (
      <div style={{ padding: "18px 18px 90px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22 }}>⏰ Daily Planner</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", marginTop: 2 }}>
              {new Date(plannerDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
            <input type="date" value={plannerDate} onChange={e => setPlannerDate(e.target.value)} style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "6px 10px", fontSize: 12, color: "var(--t1)" }} />
          </div>
        </div>

        {/* Auto-schedule button */}
        <button style={{ width: "100%", height: 46, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 13, fontSize: 14, fontWeight: 700, color: "#fff", boxShadow: `0 6px 20px ${accent.v}40`, marginBottom: 16, marginTop: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={autoSchedule}>
          ✨ Auto-Schedule My Day
        </button>

        {/* Progress summary */}
        {totalPlanned > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>Today's Progress</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: accent.v }}>{planPct}%</div>
            </div>
            <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${planPct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 6 }}>{totalDone} of {totalPlanned} tasks done</div>
          </div>
        )}

        {/* Time blocks */}
        {TIME_BLOCKS.map(block => {
          const blockTasks = scheduledIds.filter(id => plannedTasks[id] === block.id).map(id => profileTasks.find(t => t.id === id) || tasks.find(t => t.id === id)).filter(Boolean);
          const isCurrent = block.id === currentBlock && plannerDate === todayStr();
          return (
            <div key={block.id} style={{ marginBottom: 12, background: "var(--s1)", border: `1.5px solid ${isCurrent ? block.color + "66" : "var(--b1)"}`, borderRadius: 16, overflow: "hidden", boxShadow: isCurrent ? `0 4px 16px ${block.color}22` : "none" }}>
              {/* Block header */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: blockTasks.length > 0 ? "1px solid var(--b1)" : "none", background: isCurrent ? block.color + "11" : "transparent" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: block.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{block.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 7 }}>
                    {block.label}
                    {isCurrent && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: block.color + "33", color: block.color, fontWeight: 700 }}>● Now</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{block.time} · {blockTasks.length} task{blockTasks.length !== 1 ? "s" : ""}</div>
                </div>
                <button style={{ height: 30, padding: "0 11px", background: block.color + "22", color: block.color, borderRadius: 9, fontSize: 12, fontWeight: 700, border: `1px solid ${block.color}44` }} onClick={() => setShowPlannerPicker(showPlannerPicker === block.id ? null : block.id)}>+ Add</button>
              </div>
              {/* Tasks in block */}
              {blockTasks.map(task => {
                if (!task) return null;
                const done = plannerDone[task.id];
                return (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--b1)", background: done ? "var(--s2)" : "transparent", transition: "background .2s" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${done ? block.color : "var(--s4)"}`, background: done ? block.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all .2s" }} onClick={() => togglePlannerDone(task.id)}>
                      {done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textDecoration: done ? "line-through" : "none", color: done ? "var(--t3)" : "var(--t1)" }}>{task.title}</span>
                    <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 20, background: PRIORITIES[task.priority]?.bg, color: PRIORITIES[task.priority]?.color, fontWeight: 600 }}>{task.priority}</span>
                    <button style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(255,107,107,.1)", color: "var(--red)", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => removeFromPlan(task.id)}>✕</button>
                  </div>
                );
              })}
              {/* Task picker dropdown */}
              {showPlannerPicker === block.id && (
                <div style={{ padding: "10px 14px", background: "var(--s2)", borderTop: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 7, letterSpacing: .5, textTransform: "uppercase" }}>Pick a task to add:</div>
                  {unscheduled.length === 0 && <div style={{ fontSize: 12.5, color: "var(--t3)" }}>All tasks are scheduled! ✓</div>}
                  {unscheduled.slice(0, 6).map(task => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--s1)", borderRadius: 9, cursor: "pointer", marginBottom: 5, border: "1px solid var(--b1)", transition: "all .15s" }} onClick={() => assignToBlock(task.id, block.id)}>
                      <span style={{ fontSize: 13 }}>{PRIORITIES[task.priority]?.icon}</span>
                      <span style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{task.title}</span>
                      <span style={{ fontSize: 11, color: "var(--t3)" }}>{task.due ? fmtDate(task.due) : ""}</span>
                    </div>
                  ))}
                  {unscheduled.length > 6 && <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", marginTop: 4 }}>+{unscheduled.length - 6} more tasks…</div>}
                </div>
              )}
            </div>
          );
        })}

        {/* Unscheduled tasks */}
        {unscheduled.length > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "14px", marginTop: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>📋 Unscheduled ({unscheduled.length})</div>
            {unscheduled.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: "var(--s2)", borderRadius: 9, marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>{PRIORITIES[task.priority]?.icon}</span>
                <span style={{ fontSize: 13, flex: 1, fontWeight: 500 }}>{task.title}</span>
                <div style={{ display: "flex", gap: 5 }}>
                  {TIME_BLOCKS.map(b => (
                    <button key={b.id} style={{ width: 26, height: 26, borderRadius: 7, background: b.color + "22", color: b.color, fontSize: 11, fontWeight: 700, border: `1px solid ${b.color}44`, cursor: "pointer" }} title={`Add to ${b.label}`} onClick={() => assignToBlock(task.id, b.id)}>{b.icon}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPlanned === 0 && unscheduled.length === 0 && (
          <div className="empty"><div className="empty-icon">⏰</div><div className="empty-t">No tasks to plan!</div><div style={{ fontSize: 12.5, color: "var(--t3)" }}>Add some tasks first, then come back to plan your day</div></div>
        )}
      </div>
    );
  };


  //  PROJECT BOARD -- Kanban / Roadmap (Firebase Realtime)
  // ======================================================
  const DEFAULT_COLUMNS = [
    { id: "backlog", title: "💡 Backlog", color: "#7c8ff5" },
    { id: "todo", title: "📋 To Do", color: "#ffd93d" },
    { id: "progress", title: "⚡ In Progress", color: "#ff9f43" },
    { id: "review", title: "🔍 Review", color: "#d47cff" },
    { id: "done", title: "✅ Done", color: "#6bcb77" },
  ];
  const CARD_COLORS = ["#7c6dfa", "#6bcb77", "#ffd93d", "#ff6b6b", "#ff9f43", "#48dbfb", "#d47cff", "#f589a3", "#00d4aa", "#7c8ff5"];
  const CARD_LABELS = ["Feature", "Bug", "Design", "Research", "Urgent", "Backend", "Frontend", "Marketing", "Planning", "Review"];

  const [boardColumns, setBoardColumns] = useState(() => { try { const s = localStorage.getItem("tf_boardcols"); return s ? JSON.parse(s) : DEFAULT_COLUMNS; } catch { return DEFAULT_COLUMNS; } });
  const [boardCards, setBoardCards] = useState(() => { try { const s = localStorage.getItem("tf_boardcards"); return s ? JSON.parse(s) : []; } catch { return []; } });

  // == Finance Tracker ==
  const [finances, setFinances] = useState(() => { try { const s = localStorage.getItem("tf_finances"); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [financeForm, setFinanceForm] = useState({ type: "expense", amount: "", category: "food", note: "", date: new Date().toISOString().slice(0, 10) });
  const [showFinanceModal, setShowFinanceModal] = useState(false);
  const [financePeriod, setFinancePeriod] = useState("month");
  const [financeTab, setFinanceTab] = useState("overview");
  const [debts, setDebts] = useState(() => { try { const s = localStorage.getItem("tf_debts"); return s ? JSON.parse(s) : []; } catch { return []; } });
  const [currency, setCurrency] = useState(() => localStorage.getItem("tf_currency") || "₹");
  useEffect(() => { try { localStorage.setItem("tf_currency", currency); } catch { } }, [currency]);

  // == Sleep Tracker State (canonical names match SleepPage props) ==
  const [sleepTab, setSleepTab] = useState("log");
  // aliases kept for any legacy refs
  const sleepEntries = sleepLogs; const setSleepEntries = setSleepLogs;
  const showSleepModal = showSleepForm; const setShowSleepModal = setShowSleepForm;

  // == Calorie Tracker State (canonical names match CaloriePage props) ==
  const [showCalForm, setShowCalForm] = useState(false);
  // aliases kept for any legacy refs
  const calorieEntries = calorieLogs; const setCalorieEntries = setCalorieLogs;
  const showCalorieModal = showCalForm; const setShowCalorieModal = setShowCalForm;
  const calorieForm = calForm; const setCalorieForm = setCalForm;

  // == Leaderboard State ==
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardTab, setLeaderboardTab] = useState("global");
  const [playerName, setPlayerName] = useState(() => localStorage.getItem("tf_player_name") || "");
  const [debtForm, setDebtForm] = useState({ name: "", amount: "", type: "owe", dueDate: "", note: "" });
  const [showDebtModal, setShowDebtModal] = useState(false);
  useEffect(() => { try { localStorage.setItem("tf_finances", JSON.stringify(finances)); } catch { } }, [finances]);
  useEffect(() => { try { localStorage.setItem("tf_debts", JSON.stringify(debts)); } catch { } }, [debts]);
  useEffect(() => { try { localStorage.setItem("tf_sleep", JSON.stringify(sleepLogs)); } catch { } }, [sleepLogs]);
  useEffect(() => { try { localStorage.setItem("tf_calories", JSON.stringify(calorieLogs)); } catch { } }, [calorieLogs]);
  useEffect(() => { try { localStorage.setItem("tf_calorie_goal", JSON.stringify(calorieGoal)); } catch { } }, [calorieGoal]);
  useEffect(() => { try { localStorage.setItem("tf_sleep_goal", String(sleepGoalHrs)); } catch { } }, [sleepGoalHrs]);
  const [boardSyncing, setBoardSyncing] = useState(false);
  const [boardRoomCode, setBoardRoomCode] = useState("");
  const [boardConnected, setBoardConnected] = useState(false);
  const boardUnsubRef = useRef({ col: null, card: null });
  const [boardUnsub, setBoardUnsub] = useState({ col: null, card: null });
  const [dragCard, setDragCard] = useState(null);   // id being dragged
  const [dragOver, setDragOver] = useState(null);   // colId hovered
  const [showCardModal, setShowCardModal] = useState(false);
  const [showColModal, setShowColModal] = useState(false);
  const [editCard, setEditCard] = useState(null);
  const [cardForm, setCardForm] = useState({ title: "", desc: "", color: "#7c6dfa", label: "Feature", priority: "medium", assignee: "👤" });
  const [cardFormCol, setCardFormCol] = useState("backlog");
  const [colForm, setColForm] = useState({ title: "", color: "#7c6dfa" });
  const [expandedCard, setExpandedCard] = useState(null);
  const [boardTab, setBoardTab] = useState("board");
  const [shareInput, setShareInput] = useState("");
  const [notifPermission, setNotifPermission] = useState(() => { try { return Notification?.permission || "default"; } catch { return "default"; } });
  const [showShareModal, setShowShareModal] = useState(false);
  const [appIconEmoji, setAppIconEmoji] = useState(() => localStorage.getItem("tf_icon") || "✦");
  const [appIconColor, setAppIconColor] = useState(() => localStorage.getItem("tf_iconcolor") || "");
  const [showIconDesigner, setShowIconDesigner] = useState(false);
  const [shareStats, setShareStats] = useState(null);
  const [showEisenhower, setShowEisenhower] = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [greetScene, setGreetScene] = useState(() => localStorage.getItem("tf_greet_scene") || "galaxy");
  const [greetCardBg, setGreetCardBg] = useState(() => localStorage.getItem("tf_greet_bg") || "scene");
  const [greetAccent, setGreetAccent] = useState(() => localStorage.getItem("tf_greet_accent") || "purple");
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [darkAnimating, setDarkAnimating] = useState(false);
  const [streakMilestone, setStreakMilestone] = useState(null);
  const [webSearchInput, setWebSearchInput] = useState("");
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [notes, setNotes] = useState(() => { try { const s = localStorage.getItem("tf_notes"); return s ? JSON.parse(s) : []; } catch (e) { return []; } });
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showNoteEditor, setShowNoteEditor] = useState(false);
  const [noteIsListening, setNoteIsListening] = useState(false);
  const [editNote, setEditNote] = useState(null);
  const [noteForm, setNoteForm] = useState({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "general", tags: [] });
  const [noteTagInput, setNoteTagInput] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [noteView, setNoteView] = useState("grid"); // "grid" | "list"
  const [noteFilter, setNoteFilter] = useState("all"); // "all"|"pinned"|category
  const [wallpaper, setWallpaper] = useState(() => { try { return localStorage.getItem("tf_wallpaper") || "galaxy"; } catch (e) { return "galaxy"; } });
  const isForest = wallpaper === "forest" || accent.v === "#4ade80";
  const isGalaxy = wallpaper === "galaxy" || wallpaper === "nebula" || wallpaper === "none" || accent.v === "#c084fc";

  const [showAiModal, setShowAiModal] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTasks, setAiTasks] = useState([]);
  const [aiSelected, setAiSelected] = useState([]);

  // ── Team Chat & Google Sync State (placed after all dependencies) ──
  const [teamChatMsgs, setTeamChatMsgs] = useState([]);
  const [teamChatInput, setTeamChatInput] = useState("");
  const [teamChatUnsub, setTeamChatUnsub] = useState(null);
  const [activeCollabTab, setActiveCollabTab] = useState("tasks"); // tasks | chat | members
  const [roomInputVal, setRoomInputVal] = useState("");
  const [roomInputError, setRoomInputError] = useState("");
  const [chatScrollRef] = useState(() => ({ current: null }));

  // ── Google Sync State ──
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error
  const [lastSynced, setLastSynced] = useState(() => { try { return localStorage.getItem("tf_last_synced") || null; } catch { return null; } });
  const [autoSync, setAutoSync] = useState(() => { try { return localStorage.getItem("tf_auto_sync") === "1"; } catch { return false; } });

  const lastCloudUpdate = useRef(0);
  const isSyncingFromCloud = useRef(false);

  // Google Cloud Sync — push ALL data to Firestore
  async function syncToGoogle() {
    if (!authUser) return;
    if (isSyncingFromCloud.current) return; // Prevent echoing back arriving cloud data
    setSyncStatus("syncing");
    try {
      const db = await getDB(); if (!db) throw new Error("Firebase unavailable — check your connection");
      const payload = {
        tasks: tasks || [], goals: goals || [], habits: habits || [], notes: notes || [],
        moods: moods || [], finances: finances || [], sleepLogs: sleepLogs || [],
        calorieLogs: calorieLogs || [], debts: debts || [],
        xp, earnedBadges: earnedBadges || [], categories: categories || [],
        libiMemory, profiles: profiles || [], activeProfile,
        accentIdx, langKey, dark, wallpaper,
        updatedAt: Date.now(),
      };
      // Save last push time so listener can ignore its own updates
      lastCloudUpdate.current = payload.updatedAt;
      await db.collection("user_data").doc(authUser.uid).set(payload);
      const ts = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
      setLastSynced(ts); localStorage.setItem("tf_last_synced", ts);
      setSyncStatus("synced");
      showNotif("☁️ Synced!", "All data saved to cloud");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e) {
      setSyncStatus("error");
      showNotif("❌ Sync failed", e.message);
      setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }

  // Google Cloud Sync — pull ALL data from Firestore
  async function restoreFromGoogle() {
    if (!authUser) return;
    setSyncStatus("syncing");
    try {
      const db = await getDB(); if (!db) throw new Error("Firebase unavailable — check your connection");
      const doc = await db.collection("user_data").doc(authUser.uid).get();
      if (!doc.exists) { showNotif("📭 No cloud data", "Nothing saved yet — tap Sync Now first!"); setSyncStatus("idle"); return; }
      const d = doc.data();
      if (d.tasks?.length) setTasks(d.tasks);
      if (d.goals?.length) setGoals(d.goals);
      if (d.habits?.length) setHabits(d.habits);
      if (d.notes?.length) setNotes(d.notes);
      if (d.moods?.length) setMoods(d.moods);
      if (d.finances?.length) setFinances(d.finances);
      if (d.sleepLogs?.length) setSleepLogs(d.sleepLogs);
      if (d.calorieLogs?.length) setCalorieLogs(d.calorieLogs);
      if (d.debts?.length) setDebts(d.debts);
      if (d.xp != null) setXp(d.xp);
      if (d.earnedBadges?.length) setEarnedBadges(d.earnedBadges);
      if (d.categories?.length) setCategories(d.categories);
      if (d.libiMemory) setLibiMemory(d.libiMemory);
      if (d.profiles?.length) setProfiles(d.profiles);
      if (d.activeProfile) setActiveProfile(d.activeProfile);
      if (d.accentIdx != null) setAccentIdx(d.accentIdx);
      if (d.langKey) setLangKey(d.langKey);
      if (d.dark != null) setDark(d.dark);
      if (d.wallpaper) setWallpaper(d.wallpaper);
      showNotif("☁️ Restored!", "All data loaded from cloud");
      setSyncStatus("synced");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch (e) {
      setSyncStatus("error");
      showNotif("❌ Restore failed", e.message);
      setTimeout(() => setSyncStatus("idle"), 4000);
    }
  }

  // Real-time listener for multi-device sync
  useEffect(() => {
    if (!authUser || !autoSync) return;
    let unsub = () => { };
    getDB().then(db => {
      if (!db || !authUser) return;
      unsub = db.collection("user_data").doc(authUser.uid).onSnapshot(doc => {
        if (!doc.exists) return;
        if (doc.metadata.hasPendingWrites) return; // ignore our own local writes

        const d = doc.data();
        // If update is same or older than what we just synced, ignore it
        if (d.updatedAt && d.updatedAt <= lastCloudUpdate.current) return;

        // Fresh data from another device
        isSyncingFromCloud.current = true;

        if (d.tasks) setTasks(d.tasks);
        if (d.goals) setGoals(d.goals);
        if (d.habits) setHabits(d.habits);
        if (d.notes) setNotes(d.notes);
        if (d.moods) setMoods(d.moods);
        if (d.finances) setFinances(d.finances);
        if (d.sleepLogs) setSleepLogs(d.sleepLogs);
        if (d.calorieLogs) setCalorieLogs(d.calorieLogs);
        if (d.debts) setDebts(d.debts);
        if (d.xp != null) setXp(d.xp);
        if (d.earnedBadges) setEarnedBadges(d.earnedBadges);
        if (d.categories) setCategories(d.categories);
        if (d.libiMemory) setLibiMemory(d.libiMemory);
        if (d.profiles) setProfiles(d.profiles);
        if (d.activeProfile) setActiveProfile(d.activeProfile);
        if (d.accentIdx != null) setAccentIdx(d.accentIdx);
        if (d.langKey) setLangKey(d.langKey);
        if (d.dark != null) setDark(d.dark);
        if (d.wallpaper) setWallpaper(d.wallpaper);

        const ts = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
        setLastSynced(ts); localStorage.setItem("tf_last_synced", ts);

        // Allow local changes to sync again after states settle
        setTimeout(() => { isSyncingFromCloud.current = false; }, 1000);
      });
    });
    return () => unsub();
  }, [authUser, autoSync]);

  // Auto-sync when data changes (fast 2s debounce for instant multi-device feel)
  useEffect(() => {
    if (!autoSync || !authUser) return;
    if (isSyncingFromCloud.current) return;
    const t = setTimeout(() => syncToGoogle(), 2000);
    return () => clearTimeout(t);
  }, [tasks, goals, habits, notes, moods, finances, xp, autoSync, authUser, syncToGoogle]);

  // ── Team Chat Functions ──
  async function subscribeTeamChat(roomCode) {
    if (teamChatUnsub) try { teamChatUnsub(); } catch (e) { }
    try {
      const db = await getDB(); if (!db) return;
      const unsub = db.collection("rooms").doc(roomCode).collection("chat")
        .orderBy("ts", "asc").limit(100)
        .onSnapshot(snap => {
          setTeamChatMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          setTimeout(() => { if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight; }, 100);
        });
      setTeamChatUnsub(() => unsub);
    } catch (e) { }
  }
  async function sendTeamChat(msg) {
    if (!msg.trim() || !activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("chat").add({
        text: msg.trim(), sender: authUser?.name || myName || "Anonymous",
        avatar: authUser?.photo || null, ts: Date.now(),
      });
    } catch (e) { showNotif("❌ Chat error", e.message); }
  }

  // Enhanced joinRoom with chat subscription
  const _origJoinRoom = joinRoom;



  // ── Save on page hide (phone switches apps / kills tab) ──
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem("tf_tasks", JSON.stringify(tasks));
        localStorage.setItem("tf_goals", JSON.stringify(goals));
        localStorage.setItem("tf_habits", JSON.stringify(habits));
        localStorage.setItem("tf_notes", JSON.stringify(notes));
        localStorage.setItem("tf_moods", JSON.stringify(moods));
        localStorage.setItem("tf_sleep", JSON.stringify(sleepLogs));
        localStorage.setItem("tf_calories", JSON.stringify(calorieLogs));
        localStorage.setItem("tf_finances", JSON.stringify(finances));
      } catch (e) { }
      idbSet("tf_backup", JSON.stringify({ tasks, goals, habits, moods, notes, finances, categories, profiles, timestamp: Date.now() })).catch(() => { });
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
    return () => { window.removeEventListener("pagehide", save); window.removeEventListener("beforeunload", save); };
  }, [tasks, goals, habits, moods, notes, finances, categories, profiles]);

  const [showMoodModal, setShowMoodModal] = useState(false);
  const [todayMood, setTodayMood] = useState(null);

  // == Board Firebase sync ==
  async function connectBoard(code) {
    if (!code.trim()) return;
    setBoardSyncing(true);
    // Always clean up existing subscriptions first
    if (boardUnsubRef.current.col) { try { boardUnsubRef.current.col(); } catch (e) { } boardUnsubRef.current.col = null; }
    if (boardUnsubRef.current.card) { try { boardUnsubRef.current.card(); } catch (e) { } boardUnsubRef.current.card = null; }
    try {
      const db = await getDB(); if (!db) throw new Error("Firebase unavailable in preview");
      const room = code.trim().toUpperCase();
      const colRef = db.collection("boards").doc(room).collection("columns");
      const cardRef = db.collection("boards").doc(room).collection("cards");
      // Push local data only if room is brand new (no columns)
      const snap = await colRef.get();
      if (snap.empty) {
        for (const col of boardColumns) await colRef.doc(col.id).set(col);
        for (const card of boardCards) await cardRef.doc(card.id).set(card);
      }
      // Subscribe with live listeners -- always fresh
      const unsubCol = colRef.onSnapshot(s => { setBoardColumns(s.docs.map(d => ({ ...d.data(), id: d.id }))); setBoardSyncing(false); setBoardConnected(true); });
      const unsubCard = cardRef.onSnapshot(s => { setBoardCards(s.docs.map(d => ({ ...d.data(), id: d.id }))); });
      boardUnsubRef.current = { col: unsubCol, card: unsubCard };
      setBoardUnsub({ col: unsubCol, card: unsubCard });
      setBoardRoomCode(room);
      showNotif("🔥 Board synced!", "Room: " + room);
    } catch (e) { setBoardSyncing(false); setBoardConnected(false); showNotif("❌ Board error", e.message); }
  };
  function disconnectBoard() {

    if (boardUnsubRef.current.col) { try { boardUnsubRef.current.col(); } catch (e) { } boardUnsubRef.current.col = null; }
    if (boardUnsubRef.current.card) { try { boardUnsubRef.current.card(); } catch (e) { } boardUnsubRef.current.card = null; }
    setBoardConnected(false); setBoardRoomCode(""); setBoardSyncing(false);
    showNotif("👋 Disconnected", "Board is now local only");
  };

  async function pushCard(card) {
    if (!boardConnected) return;
    try { const db = await getDB(); if (db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(card.id).set(card); } catch (e) { }
  };
  async function pushCol(col) {
    if (!boardConnected) return;
    try { const db = await getDB(); if (db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(col.id).set(col); } catch (e) { }
  };
  async function deleteCardRemote(id) {
    if (!boardConnected) return;
    try { const db = await getDB(); if (db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(id).delete(); } catch (e) { }
  };
  async function deleteColRemote(id) {
    if (!boardConnected) return;
    try { const db = await getDB(); if (db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(id).delete(); } catch (e) { }
  };

  // == Card CRUD ==
  async function saveCard() {
    if (!cardForm.title.trim()) return;
    const card = editCard
      ? { ...editCard, ...cardForm }
      : { id: uid(), colId: cardFormCol, ...cardForm, createdAt: Date.now() };
    if (editCard) setBoardCards(cs => cs.map(c => c.id === card.id ? card : c));
    else setBoardCards(cs => [...cs, card]);
    await pushCard(card);
    setShowCardModal(false); setEditCard(null); play("add");
    showNotif(editCard ? "✎ Card updated" : "✨ Card added", card.title);
  };
  async function deleteCard(id) {
    setBoardCards(cs => cs.filter(c => c.id !== id));
    await deleteCardRemote(id);
    setExpandedCard(null); play("delete");
  };
  async function moveCard(cardId, toColId) {
    const card = boardCards.find(c => c.id === cardId);
    if (!card || card.colId === toColId) return;
    const updated = { ...card, colId: toColId };
    setBoardCards(cs => cs.map(c => c.id === cardId ? updated : c));
    await pushCard(updated); play("tap");
  };

  // == Column CRUD ==
  async function addColumn() {
    if (!colForm.title.trim()) return;
    const col = { id: uid(), title: colForm.title.trim(), color: colForm.color };
    setBoardColumns(cs => [...cs, col]);
    await pushCol(col);
    setShowColModal(false); setColForm({ title: "", color: "#7c6dfa" }); play("add");
  };
  async function deleteColumn(colId) {
    setBoardColumns(cs => cs.filter(c => c.id !== colId));
    const toDelete = boardCards.filter(c => c.colId === colId);
    setBoardCards(cs => cs.filter(c => c.colId !== colId));
    for (const c of toDelete) await deleteCardRemote(c.id);
    await deleteColRemote(colId); play("delete");
  };

  // == Drag & Drop ==
  function onDragStart(e, cardId) { setDragCard(cardId); e.dataTransfer.effectAllowed = "move"; };

  function onDragOver(e, colId) { e.preventDefault(); setDragOver(colId); };
  function onDrop(e, colId) { e.preventDefault(); if (dragCard) moveCard(dragCard, colId); setDragCard(null); setDragOver(null); };
  function onDragEnd() { setDragCard(null); setDragOver(null); };

  const PRIORITY_STYLES = { high: { bg: "rgba(255,107,107,.15)", color: "#ff6b6b" }, medium: { bg: "rgba(255,159,67,.15)", color: "#ff9f43" }, low: { bg: "rgba(107,203,119,.15)", color: "#6bcb77" } };


  function TimelinePage() {
    const hours = Array.from({ length: 24 }, (_, i) => i);
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

  function BoardPage() {
    return (
      <div className="content" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "72vh" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: "0 24px", position: "relative" }}>
          {/* Twinkling stars */}
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{ position: "fixed", width: isForest ? (i % 4 === 0 ? 8 : 5) : (i % 3 === 0 ? 3 : 2), height: isForest ? (i % 4 === 0 ? 8 : 5) : (i % 3 === 0 ? 3 : 2), borderRadius: isForest ? "3px 50%" : "50%", background: isForest ? (i % 3 === 0 ? "#4ade8088" : i % 3 === 1 ? "#22c55e60" : "#86efac50") : "#fff", opacity: .1 + Math.random() * .5, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`, animationDelay: `${Math.random() * 4}s`, pointerEvents: "none", zIndex: 0 }} />
          ))}
          {/* Lock icon */}
          <div style={{ width: 90, height: 90, borderRadius: 28, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 42, margin: "0 auto 20px", boxShadow: `0 0 40px ${accent.v}55,0 8px 32px ${accent.v}35`, animation: "galaxyPulse 3s ease-in-out infinite", position: "relative", zIndex: 1 }}>
            🔒
          </div>
          {/* Coming Soon badge */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 30, padding: "6px 18px", marginBottom: 18, boxShadow: `0 4px 16px ${accent.v}45` }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: 1.2 }}>🚀 COMING SOON</span>
          </div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 32, background: `linear-gradient(135deg,var(--t1),${accent.v})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: 12 }}>Project Board</div>
          <div style={{ fontSize: 14, color: "var(--t2)", lineHeight: 1.8, marginBottom: 24 }}>
            A full Kanban board with drag-and-drop, real-time collaboration, card labels, sprint tracking and team assignments — landing in the next update.
          </div>
          {/* Feature pills */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 24 }}>
            {["🗂 Kanban Columns", "🔀 Drag & Drop", "👥 Real-time Collab", "🏷 Card Labels", "📎 Attachments", "⚡ Automations"].map(f => (
              <span key={f} style={{ fontSize: 11.5, padding: "5px 12px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", fontWeight: 700, border: "1px solid var(--acc)" }}>{f}</span>
            ))}
          </div>
          {/* Progress bar */}
          <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 14, padding: "14px 18px", textAlign: "left", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)" }}>Build Progress</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: accent.v }}>68%</span>
            </div>
            <div style={{ height: 6, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: "68%", background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, boxShadow: `0 0 10px ${accent.v}60` }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 8 }}>🔧 Building drag-and-drop engine...</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--t3)" }}>🚀 Expected in the next major update</div>
        </div>
      </div>
    );
  };


  //  QUICK NOTES & SCRATCH PAD
  // ==========================================
  const NOTE_COLORS = ["#7c6dfa", "#ff6b6b", "#6bcb77", "#ffd93d", "#ff9f43", "#48dbfb", "#f589a3", "#d47cff", "#10b981", "#06b6d4"];
  const NOTE_CATS = [{ id: "general", icon: "📝", label: "General" }, { id: "ideas", icon: "💡", label: "Ideas" }, { id: "work", icon: "💼", label: "Work" }, { id: "personal", icon: "🏠", label: "Personal" }, { id: "todo", icon: "✅", label: "To-Do" }, { id: "journal", icon: "📖", label: "Journal" }];

  function saveNote() {

    if (!noteForm.title.trim() && !noteForm.body.trim()) return;
    const noteData = { ...noteForm, tags: noteForm.tags || [], updatedAt: Date.now(), profileId: activeProfile };
    if (editNote) {
      setNotes(ns => ns.map(n => n.id === editNote.id ? { ...n, ...noteData } : n));
      showNotif("✏️ Note updated!", noteForm.title || "Untitled");
    } else {
      setNotes(ns => [{ id: uid(), createdAt: Date.now(), ...noteData }, ...ns]);
      showNotif("📝 Note saved!", noteForm.title || "Untitled");
      play("add");
    }
    setShowNoteEditor(false);
    setEditNote(null);
    setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "general", tags: [] });
    setNoteTagInput("");
  };

  function deleteNote(id) {

    setNotes(ns => ns.filter(n => n.id !== id));
    play("delete");
    showNotif("🗑 Note deleted", "");
  };

  function togglePinNote(id) {

    setNotes(ns => ns.map(n => n.id === id ? { ...n, pinned: !n.pinned } : n));
    play("tap");
  };
  function duplicateNote(note) {

    setNotes(ns => [{ ...note, id: uid(), createdAt: Date.now(), updatedAt: Date.now(), title: note.title + " (copy)", pinned: false }, ...ns]);
    showNotif("📋 Duplicated!", note.title || "Note");
    play("add");
  };

  function NotesPage() {
    const profileNotes = notes.filter(n => !n.profileId || n.profileId === activeProfile);
    const filtered = profileNotes
      .filter(n => noteFilter === "all" ? true : noteFilter === "pinned" ? n.pinned : n.category === noteFilter)
      .filter(n => noteSearch ? (n.title + n.body + (n.tags || []).join(" ")).toLowerCase().includes(noteSearch.toLowerCase()) : true)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);
    const wordCount = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;
    const charCount = (text = "") => text.length;
    return (
      <div style={{ padding: "18px 18px 100px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24 }}>📝 Notes</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{profileNotes.length} notes · {profileNotes.filter(n => n.pinned).length} pinned</div>
          </div>
          <button onClick={() => { setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "general", tags: [] }); setNoteTagInput(""); setEditNote(null); setShowNoteEditor(true); play("tap"); }}
            style={{ height: 40, padding: "0 18px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 4px 14px ${accent.v}40`, flexShrink: 0 }}>
            + New Note
          </button>
        </div>

        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "0 14px", height: 40, marginBottom: 12, transition: "border-color .2s" }}>
          <span style={{ color: "var(--t3)", fontSize: 14 }}>⌕</span>
          <input value={noteSearch} onChange={e => setNoteSearch(e.target.value)} placeholder="Search notes…"
            style={{ flex: 1, fontSize: 13, color: "var(--t1)", background: "none", border: "none", outline: "none" }} />
          {noteSearch && <span style={{ cursor: "pointer", color: "var(--t3)", fontSize: 12 }} onClick={() => setNoteSearch("")}>✕</span>}
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {[{ id: "all", icon: "🗂", label: "All" }, { id: "pinned", icon: "📌", label: "Pinned" }, ...NOTE_CATS].map(c => (
            <span key={c.id} onClick={() => setNoteFilter(c.id)}
              style={{ fontSize: 11.5, padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${noteFilter === c.id ? accent.v : "var(--b1)"}`, background: noteFilter === c.id ? "var(--accd)" : "var(--s1)", color: noteFilter === c.id ? "var(--acc)" : "var(--t2)", cursor: "pointer", fontWeight: noteFilter === c.id ? 700 : 500, transition: "all .15s" }}>
              {c.icon} {c.label}
              {c.id !== "all" && c.id !== "pinned" && <span style={{ marginLeft: 4, fontSize: 10, opacity: .7 }}>{profileNotes.filter(n => n.category === c.id).length}</span>}
            </span>
          ))}
          <span onClick={() => setNoteView(v => v === "grid" ? "list" : "grid")}
            style={{ marginLeft: "auto", fontSize: 11.5, padding: "5px 12px", borderRadius: 20, border: "1px solid var(--b1)", background: "var(--s1)", color: "var(--t2)", cursor: "pointer" }}>
            {noteView === "grid" ? "☰ List" : "⊞ Grid"}
          </span>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>{noteSearch ? "🔍" : "📝"}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>{noteSearch ? "No notes found" : "No notes yet"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>{noteSearch ? `No matches for "${noteSearch}"` : "Tap + New Note to capture your first idea"}</div>
          </div>
        )}

        {/* Notes Grid / List */}
        <div style={noteView === "grid" ? { display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 } : { display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(note => {
            const cat = NOTE_CATS.find(c => c.id === note.category) || NOTE_CATS[0];
            const words = wordCount(note.body);
            const isLong = words > 50;
            return (
              <div key={note.id}
                onClick={() => { setNoteForm({ title: note.title, body: note.body, color: note.color, pinned: note.pinned, category: note.category || "general", tags: note.tags || [] }); setNoteTagInput(""); setEditNote(note); setShowNoteEditor(true); }}
                style={{ background: `${note.color}14`, border: `1.5px solid ${note.color}33`, borderRadius: 16, padding: noteView === "grid" ? "14px" : "14px 16px", cursor: "pointer", position: "relative", transition: "all .2s", display: noteView === "list" ? "flex" : "block", gap: noteView === "list" ? 14 : 0, alignItems: noteView === "list" ? "flex-start" : "stretch" }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px) scale(1.01)"}
                onMouseLeave={e => e.currentTarget.style.transform = "none"}>
                {/* Color accent dot */}
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: note.color, position: "absolute", top: 10, left: 10 }} />
                <div style={{ flex: 1, paddingLeft: noteView === "list" ? 14 : 0 }}>
                  {/* Top row: category + pin + delete */}
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: note.title ? 6 : 0 }}>
                    <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: note.color + "25", color: note.color, fontWeight: 600 }}>{cat.icon} {cat.label}</span>
                    {note.pinned && <span style={{ fontSize: 10, color: note.color }}>📌</span>}
                    {isLong && <span style={{ fontSize: 9, color: "var(--t3)", marginLeft: "auto" }}>📄 {words}w</span>}
                    <div style={{ marginLeft: isLong ? "" : "auto", display: "flex", gap: 2 }}>
                      <button style={{ width: 22, height: 22, borderRadius: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: .5, display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={e => { e.stopPropagation(); togglePinNote(note.id); }}>📌</button>
                      <button style={{ width: 22, height: 22, borderRadius: 6, background: "none", border: "none", cursor: "pointer", fontSize: 11, opacity: .5, color: "var(--red)", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onClick={e => { e.stopPropagation(); deleteNote(note.id); }}>✕</button>
                    </div>
                  </div>
                  {note.title && <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", marginBottom: 5, lineHeight: 1.3 }}>{note.title}</div>}
                  {note.body && <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.6, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: noteView === "list" ? 2 : 4, WebkitBoxOrient: "vertical" }} dangerouslySetInnerHTML={{ __html: note.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>").replace(/(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>") }} />}
                  {/* Tags */}
                  {(note.tags || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
                      {note.tags.slice(0, 3).map(tg => <span key={tg} style={{ fontSize: 9.5, padding: "2px 6px", borderRadius: 20, background: "var(--s2)", color: "var(--t3)", border: "1px solid var(--b1)" }}>#{tg}</span>)}
                    </div>
                  )}
                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                    <span style={{ fontSize: 10, color: "var(--t3)" }}>{new Date(note.updatedAt || note.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                    {note.body && <span style={{ fontSize: 9, color: "var(--t3)" }}>{words}w · {charCount(note.body)}c</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };


  // ==================================================
  //  😊 MOOD TRACKER PAGE
  // ==================================================
  const MOOD_OPTIONS = [
    { label: "Exhausted", emoji: "😩", energy: 1, color: "#ff6b6b" },
    { label: "Tired", emoji: "😔", energy: 2, color: "#ff9f43" },
    { label: "Okay", emoji: "😐", energy: 3, color: "#ffd93d" },
    { label: "Good", emoji: "😊", energy: 4, color: "#6bcb77" },
    { label: "Amazing", emoji: "🤩", energy: 5, color: "#7c6dfa" },
  ];

  ;

  function MoodPage() {
    const profileMoods = moods.filter(m => !m.profileId || m.profileId === activeProfile);
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 6 + i);
      const ds = d.toISOString().slice(0, 10);
      return { ds, day: d.toLocaleDateString("en", { weekday: "short" }), entry: profileMoods.find(m => m.date === ds) };
    });
    const avgMood = profileMoods.length ? (profileMoods.reduce((a, m) => a + m.energy, 0) / profileMoods.length).toFixed(1) : "—";
    const streak = (() => { let s = 0, d = new Date(); for (let i = 0; i < 30; i++) { const ds = d.toISOString().slice(0, 10); if (!moods.find(m => m.date === ds)) break; s++; d.setDate(d.getDate() - 1); } return s; })();
    const today = new Date().toISOString().slice(0, 10);
    return (
      <div style={{ padding: "18px 18px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24 }}>😊 Mood Tracker</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{moods.length} entries · {streak}d streak · avg {avgMood}/5</div>
          </div>
          <button style={{ height: 38, padding: "0 14px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", boxShadow: `0 4px 14px ${accent.v}40` }} onClick={() => setShowMoodModal(true)}>+ Log</button>
        </div>

        {/* Today's mood */}
        <div style={{ background: todayMood ? `${MOOD_OPTIONS[todayMood.mood].color}18` : "var(--s1)", border: `1.5px solid ${todayMood ? MOOD_OPTIONS[todayMood.mood].color + "40" : "var(--b1)"}`, borderRadius: 20, padding: "18px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t3)", marginBottom: 8, letterSpacing: .5 }}>TODAY</div>
          {todayMood ? (<>
            <div style={{ fontSize: 52, marginBottom: 6 }}>{MOOD_OPTIONS[todayMood.mood].emoji}</div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: MOOD_OPTIONS[todayMood.mood].color }}>{MOOD_OPTIONS[todayMood.mood].label}</div>
            <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>Logged at {todayMood.time}</div>
          </>) : (
            <div style={{ padding: "10px 0" }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🌫️</div>
              <div style={{ fontSize: 14, color: "var(--t2)", marginBottom: 12 }}>How are you feeling today?</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {MOOD_OPTIONS.map((m, i) => (
                  <div key={i} onClick={() => saveMood(i)} style={{ fontSize: 28, cursor: "pointer", padding: 6, borderRadius: 12, transition: "all .15s", background: "var(--s2)" }}
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"}
                    onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>{m.emoji}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 7-day chart */}
        <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>7-Day Mood</div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 70 }}>
            {last7.map((d, i) => {
              const e = d.entry ? d.entry.energy : 0;
              const col = d.entry ? MOOD_OPTIONS[d.entry.mood].color : "var(--s3)";
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  {d.entry && <div style={{ fontSize: 14 }}>{MOOD_OPTIONS[d.entry.mood].emoji}</div>}
                  <div style={{ width: "100%", height: `${e * 12 + 4}px`, background: e > 0 ? `linear-gradient(180deg,${col},${col}88)` : col, borderRadius: "5px 5px 0 0", minHeight: 4, transition: "height .6s ease", boxShadow: e > 0 ? `0 0 8px ${col}50` : "" }} />
                  <div style={{ fontSize: 9.5, color: d.ds === today ? "var(--acc)" : "var(--t3)", fontWeight: d.ds === today ? 800 : 400 }}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mood-Task Insight */}
        {moods.length >= 3 && (() => {
          const highMoodDays = moods.filter(m => m.energy >= 4).map(m => m.date);
          const lowMoodDays = moods.filter(m => m.energy <= 2).map(m => m.date);
          const tasksOnHigh = tasks.filter(t => t.done && highMoodDays.includes((t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : ""))).length;
          const tasksOnLow = tasks.filter(t => t.done && lowMoodDays.includes((t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : ""))).length;
          const highAvg = highMoodDays.length ? (tasksOnHigh / highMoodDays.length).toFixed(1) : 0;
          const lowAvg = lowMoodDays.length ? (tasksOnLow / lowMoodDays.length).toFixed(1) : 0;
          return (
            <div style={{ background: `${accent.v}12`, border: `1px solid ${accent.v}28`, borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: accent.v, marginBottom: 10 }}>🧠 Mood × Productivity Insight</div>
              <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7 }}>
                On <strong style={{ color: "#6bcb77" }}>good mood days (😊🤩)</strong> you complete <strong style={{ color: "#6bcb77" }}>{highAvg} tasks</strong> on average.<br />
                On <strong style={{ color: "#ff6b6b" }}>low mood days (😩😔)</strong> you complete <strong style={{ color: "#ff6b6b" }}>{lowAvg} tasks</strong> on average.
                {Number(highAvg) > Number(lowAvg) && <div style={{ marginTop: 8, fontSize: 12, color: "var(--t3)" }}>💡 You're {Math.round(((Number(highAvg) - Number(lowAvg)) / Math.max(Number(lowAvg), 0.1)) * 100)}% more productive on good mood days. Prioritise self-care!</div>}
              </div>
            </div>
          );
        })()}

        {/* History */}
        {moods.slice(-10).reverse().map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 13, marginBottom: 7 }}>
            <span style={{ fontSize: 24 }}>{MOOD_OPTIONS[m.mood].emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: MOOD_OPTIONS[m.mood].color }}>{MOOD_OPTIONS[m.mood].label}</div>
              <div style={{ fontSize: 11, color: "var(--t3)" }}>{m.date} · {m.time}</div>
            </div>
            <div style={{ display: "flex", gap: 2 }}>
              {Array.from({ length: 5 }, (_, i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: i < m.energy ? MOOD_OPTIONS[m.mood].color : "var(--s3)" }} />)}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // ==================================================
  //  ⏱ TIME TRACKING PAGE
  // ==================================================
  function TimeTrackPage() {
    const totalToday = timeEntries.filter(e => e.date === todayStr()).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
    const totalAll = timeEntries.reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
    const byTask = profileTasks.map(task => {
      const secs = timeEntries.filter(e => e.taskId === task.id).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
      return { ...task, secs };
    }).filter(t => t.secs > 0).sort((a, b) => b.secs - a.secs);

    // Weekly chart data
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 6 + i);
      const ds = d.toISOString().slice(0, 10);
      const secs = timeEntries.filter(e => e.date === ds).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
      return { day: d.toLocaleDateString("en", { weekday: "short" }), ds, secs, mins: Math.round(secs / 60) };
    });
    const maxMins = Math.max(...last7.map(d => d.mins), 1);

    return (
      <div style={{ padding: "18px 18px 90px" }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 4 }}>⏱ Time Tracking</div>
        <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 18 }}>See where your time really goes</div>

        {/* Active timer banner */}
        {activeTimer && (() => {
          const task = tasks.find(t => t.id === activeTimer.taskId);
          return (
            <div style={{ background: `linear-gradient(135deg,${accent.v}22,${accent.g}10)`, border: `1.5px solid ${accent.v}50`, borderRadius: 18, padding: "14px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12, boxShadow: `0 4px 20px ${accent.v}25` }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#6bcb77", boxShadow: "0 0 10px #6bcb77", animation: "blink 1s infinite", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: accent.v, letterSpacing: .5 }}>TIMER RUNNING</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", marginTop: 1 }}>{task?.title || "Unknown task"}</div>
              </div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: accent.v, minWidth: 64, textAlign: "center" }}>{(activeTimer ? `${String(Math.floor((Date.now() - activeTimer.startedAt) / 60000)).padStart(2, "0")}:${String(Math.floor(((Date.now() - activeTimer.startedAt) % 60000) / 1000)).padStart(2, "0")}` : "00:00")}</div>
              <button onClick={stopTimer} style={{ height: 36, padding: "0 14px", background: "rgba(255,107,107,.18)", border: "1px solid rgba(255,107,107,.4)", borderRadius: 10, color: "var(--red)", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>⏹ Stop</button>
            </div>
          );
        })()}

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { icon: "🕐", label: "Today", val: fmtTime(totalToday) },
            { icon: "📊", label: "Total", val: fmtTime(totalAll) },
            { icon: "📋", label: "Sessions", val: timeEntries.length },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 12px", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, color: accent.v }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Weekly bar chart */}
        <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 20, padding: "18px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>This Week</div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 80 }}>
            {last7.map((d, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                {d.mins > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: accent.v }}>{d.mins}m</div>}
                <div style={{ width: "100%", height: `${(d.mins / maxMins) * 64 + 4}px`, background: d.ds === todayStr() ? `linear-gradient(180deg,${accent.v},${accent.g})` : `${accent.v}40`, borderRadius: "6px 6px 0 0", minHeight: 4, transition: "height .7s cubic-bezier(.34,1.56,.64,1)", boxShadow: d.ds === todayStr() ? `0 0 12px ${accent.v}50` : "" }} />
                <div style={{ fontSize: 9.5, color: d.ds === todayStr() ? "var(--acc)" : "var(--t3)", fontWeight: d.ds === todayStr() ? 800 : 400 }}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Time by task */}
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, marginBottom: 12 }}>Time by Task</div>
        {byTask.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--t3)" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>⏱</div>
            <div style={{ fontSize: 14, color: "var(--t2)", marginBottom: 6 }}>No time tracked yet</div>
            <div style={{ fontSize: 12 }}>Hit ▶ on any task to start tracking</div>
          </div>
        )}
        {byTask.map(task => {
          const pct = Math.round((task.secs / totalAll) * 100) || 0;
          const cat = categories.find(c => c.id === task.categoryId) || categories[0];
          return (
            <div key={task.id} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 14 }}>{cat.icon}</span>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "var(--t1)" }}>{task.title}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 17, color: accent.v }}>{fmtTime(task.secs)}</div>
                <button onClick={() => activeTimer?.taskId === task.id ? stopTimer() : startTimer(task.id)} style={{ width: 30, height: 30, borderRadius: 9, background: activeTimer?.taskId === task.id ? "rgba(255,107,107,.18)" : "var(--accd)", border: `1px solid ${activeTimer?.taskId === task.id ? "var(--red)" : "var(--acc)"}`, color: activeTimer?.taskId === task.id ? "var(--red)" : "var(--acc)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {activeTimer?.taskId === task.id ? "⏹" : "▶"}
                </button>
              </div>
              <div style={{ height: 4, background: "var(--s3)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 2, transition: "width .6s ease" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 4 }}>{pct}% of total time</div>
            </div>
          );
        })}

        {/* Clear data */}
        {timeEntries.length > 0 && (
          <button onClick={() => { setTimeEntries([]); }} style={{ width: "100%", height: 40, marginTop: 8, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.3)", borderRadius: 12, color: "var(--red)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🗑 Clear All Time Data</button>
        )}
      </div>
    );
  };

  const [ftView, setFtView] = useState("focus"); // "focus"|"tracker"|"ambient"
  const [ambientMode, setAmbientMode] = useState("none");
  const [timerTick2, setTimerTick2] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTimerTick2(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  // == ⏱🧘 MERGED FOCUS & TIME PAGE ==
  function FocusTimePage() {
    const totalToday = timeEntries.filter(e => e.date === todayStr()).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
    const totalAll = timeEntries.reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
    const activeTasks = tasks.filter(t => t.profileId === activeProfile && !t.done);
    const byTask = tasks.filter(t => t.profileId === activeProfile).map(task => {
      const secs = timeEntries.filter(e => e.taskId === task.id).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
      return { ...task, secs };
    }).filter(t => t.secs > 0).sort((a, b) => b.secs - a.secs);
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - 6 + i);
      const ds = d.toISOString().slice(0, 10);
      const secs = timeEntries.filter(e => e.date === ds).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
      return { day: d.toLocaleDateString("en", { weekday: "short" }), ds, secs, mins: Math.round(secs / 60) };
    });
    const maxMins = Math.max(...last7.map(d => d.mins), 1);
    const mins = Math.floor(pomoSecs / 60), secs2 = pomoSecs % 60;
    const total_s = POMO_MODES[pomoMode].mins * 60;
    const progress = 1 - (pomoSecs / total_s);
    const R = 72, C2 = 2 * Math.PI * R;
    const pomoTask = pomoTaskId ? tasks.find(t => t.id === pomoTaskId) : null;

    const AMBIENT = [
      { id: "none", icon: "🔇", label: "None" },
      { id: "lofi", icon: "☕", label: "Lo-Fi" },
      { id: "rain", icon: "🌧", label: "Rain" },
      { id: "nature", icon: "🌿", label: "Forest" },
      { id: "cosmic", icon: "🌌", label: "Cosmic" },
    ];

    return (
      <div style={{ padding: "0 0 90px", minHeight: "100%" }}>
        {/* Header */}
        <div style={{ padding: "18px 18px 12px", background: "var(--s1)", borderBottom: "1px solid var(--b1)", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 10 }}>⚡ Focus & Time</div>
          <div style={{ display: "flex", gap: 3, background: "var(--s2)", borderRadius: 12, padding: 3 }}>
            {[["focus", "🍅", "Focus"], ["tracker", "⏱", "Tracker"], ["ambient", "🎵", "Ambient"]].map(([id, icon, lbl]) => (
              <button key={id} onClick={() => setFtView(id)} style={{ flex: 1, height: 32, borderRadius: 9, fontSize: 11.5, fontWeight: 700, border: "none", cursor: "pointer", transition: "all .2s", background: ftView === id ? `linear-gradient(135deg,${accent.v},${accent.g})` : "transparent", color: ftView === id ? "#fff" : "var(--t3)" }}>
                {icon} {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* ── 🍅 FOCUS VIEW */}
        {ftView === "focus" && <div style={{ padding: "16px 18px" }}>
          {/* Mode pills */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {Object.entries(POMO_MODES).map(([k, m]) => (
              <button key={k} onClick={() => switchPomoMode(k)} style={{ flex: 1, height: 32, borderRadius: 10, fontSize: 11, fontWeight: 700, border: `1.5px solid ${pomoMode === k ? m.color : "var(--b1)"}`, background: pomoMode === k ? m.color + "20" : "var(--s2)", color: pomoMode === k ? m.color : "var(--t2)", cursor: "pointer", transition: "all .2s" }}>
                {k === "focus" ? "🍅" : k === "short" ? "☕" : "🛋"} {m.label}
              </button>
            ))}
          </div>

          {/* Big ring timer */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, position: "relative" }}>
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {/* Outer glow ring */}
              <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: `radial-gradient(circle,${POMO_MODES[pomoMode].color}15 0%,transparent 70%)`, animation: pomoRunning ? "galaxyPulse 2s ease-in-out infinite" : "none" }} />
              <svg width="170" height="170" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="85" cy="85" r={R} fill="none" stroke="var(--s3)" strokeWidth="9" />
                <circle cx="85" cy="85" r={R} fill="none" stroke={POMO_MODES[pomoMode].color} strokeWidth="9"
                  strokeDasharray={C2} strokeDashoffset={C2 * (1 - progress)} strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)", willChange: "stroke-dashoffset", filter: `drop-shadow(0 0 10px ${POMO_MODES[pomoMode].color}90)` }} />
              </svg>
              <div style={{ position: "absolute", textAlign: "center" }}>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 40, color: "var(--t1)", letterSpacing: 1, lineHeight: 1 }}>{String(mins).padStart(2, "0")}:{String(secs2).padStart(2, "0")}</div>
                <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginTop: 4 }}>{POMO_MODES[pomoMode].label}</div>
                <div style={{ fontSize: 10, color: pomoRunning ? "#6bcb77" : "var(--t3)", marginTop: 2 }}>{pomoRunning ? "● Running" : "○ Paused"}</div>
              </div>
            </div>
          </div>

          {/* Session dots */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginBottom: 16 }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: i === pomoSession && pomoRunning ? 14 : 10, height: i === pomoSession && pomoRunning ? 14 : 10, borderRadius: "50%", background: i < pomoSession ? POMO_MODES.focus.color : i === pomoSession && pomoRunning ? POMO_MODES.focus.color + "80" : "var(--s3)", transition: "all .3s", boxShadow: i === pomoSession && pomoRunning ? `0 0 8px ${POMO_MODES.focus.color}` : "none" }} />
            ))}
            <span style={{ fontSize: 10, color: "var(--t3)", marginLeft: 4 }}>Round {pomoSession + 1} of 4</span>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <button onClick={resetPomo} style={{ width: 48, height: 52, borderRadius: 14, background: "var(--s2)", border: "1px solid var(--b1)", fontSize: 20, cursor: "pointer" }}>↺</button>
            <button onClick={() => { setPomoRunning(r => !r); haptic("medium"); }} style={{ flex: 1, height: 52, background: pomoRunning ? `rgba(255,107,107,.18)` : `linear-gradient(135deg,${POMO_MODES[pomoMode].color},${POMO_MODES[pomoMode].color}cc)`, border: pomoRunning ? `1.5px solid var(--red)` : "none", borderRadius: 14, fontSize: 16, fontWeight: 800, color: pomoRunning ? "var(--red)" : "#fff", cursor: "pointer", boxShadow: pomoRunning ? "none" : `0 6px 24px ${POMO_MODES[pomoMode].color}50`, transition: "all .2s" }}>
              {pomoRunning ? "⏸  Pause" : "▶  Start Focus"}
            </button>
            <button onClick={() => { setPomoRunning(false); resetPomo(); haptic("light"); setShowFocusMode(true); setFocusTaskId(pomoTaskId); }} style={{ width: 48, height: 52, borderRadius: 14, background: `${accent.v}18`, border: `1px solid ${accent.v}40`, fontSize: 18, cursor: "pointer", color: accent.v }} title="Enter fullscreen Focus Mode">🌌</button>
          </div>

          {/* Ambient sound quick-pick */}
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>🎵 Focus Sounds</div>
            <div style={{ display: "flex", gap: 6 }}>
              {AMBIENT.map(a => (
                <button key={a.id} onClick={() => {
                  if (a.id === "none") { stopMusic(); setMusicOn(false); }
                  else { startMusic(a.id); setMusicOn(true); }
                  setAmbientMode(a.id); haptic("light");
                }} style={{ flex: 1, height: 38, borderRadius: 10, fontSize: 10, fontWeight: 700, border: `1.5px solid ${ambientMode === a.id ? accent.v : "var(--b1)"}`, background: ambientMode === a.id ? "var(--accd)" : "var(--s2)", color: ambientMode === a.id ? "var(--acc)" : "var(--t2)", cursor: "pointer", transition: "all .15s" }}>
                  <div style={{ fontSize: 14, marginBottom: 1 }}>{a.icon}</div>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task picker */}
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>🎯 Focusing On</div>
            {pomoTask
              ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)" }}>{pomoTask.title}</div>
                  <div style={{ fontSize: 11, color: accent.v, marginTop: 1 }}>⏱ {fmtTime(getTaskTime(pomoTask.id))} tracked</div>
                </div>
                <button onClick={() => { toggle(pomoTask.id); setPomoTaskId(null); haptic("success"); }} style={{ fontSize: 11, height: 30, padding: "0 10px", background: "rgba(107,203,119,.15)", border: "1px solid rgba(107,203,119,.4)", borderRadius: 9, color: "#6bcb77", fontWeight: 700, cursor: "pointer" }}>✅ Done</button>
                <button onClick={() => setPomoTaskId(null)} style={{ fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--t3)" }}>✕</button>
              </div>
              : <div>
                <div style={{ fontSize: 11.5, color: "var(--t2)", marginBottom: 8 }}>No task selected — pick one to focus on:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 160, overflowY: "auto" }}>
                  {activeTasks.slice(0, 6).map(task => (
                    <div key={task.id} onClick={() => { setPomoTaskId(task.id); haptic("light"); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, cursor: "pointer", background: "var(--s2)", border: "1px solid var(--b1)", transition: "all .15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = accent.v} onMouseLeave={e => e.currentTarget.style.borderColor = "var(--b1)"}>
                      <span style={{ fontSize: 12 }}>{PRIORITIES[task.priority]?.icon}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</span>
                      {getTaskTime(task.id) > 0 && <span style={{ fontSize: 10, color: accent.v }}>⏱{fmtTime(getTaskTime(task.id))}</span>}
                    </div>
                  ))}
                  {activeTasks.length === 0 && <div style={{ fontSize: 12, color: "var(--t3)", textAlign: "center", padding: "10px 0" }}>🎉 All done! No active tasks.</div>}
                </div>
              </div>
            }
          </div>

          {/* Today's stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[{ icon: "🍅", label: "Sessions", val: pomoTotal }, { icon: "⏱", label: "Today", val: fmtTime(totalToday) }, { icon: "🔥", label: "Streak", val: (gamStats.streak || 0) + "d" }].map(s => (
              <div key={s.label} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, color: accent.v }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>}

        {/* ── ⏱ TRACKER VIEW */}
        {ftView === "tracker" && <div style={{ padding: "16px 18px" }}>
          {activeTimer && <div style={{ background: `linear-gradient(135deg,${accent.v}20,${accent.g}10)`, border: `1.5px solid ${accent.v}60`, borderRadius: 18, padding: "14px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#6bcb77", boxShadow: "0 0 12px #6bcb77", animation: "blink 1s infinite", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: accent.v, letterSpacing: .5 }}>TRACKING NOW</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tasks.find(t => t.id === activeTimer.taskId)?.title || "Unknown"}</div>
            </div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: accent.v, minWidth: 56, textAlign: "right" }}>{String(Math.floor((Date.now() - activeTimer.startedAt) / 60000)).padStart(2, "0")}:{String(Math.floor(((Date.now() - activeTimer.startedAt) % 60000) / 1000)).padStart(2, "0")}</div>
            <button onClick={() => { stopTimer(); haptic("medium"); }} style={{ height: 32, padding: "0 10px", background: "rgba(255,107,107,.18)", border: "1px solid rgba(255,107,107,.4)", borderRadius: 9, color: "var(--red)", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>⏹</button>
          </div>}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
            {[{ icon: "🕐", label: "Today", val: fmtTime(totalToday) }, { icon: "📊", label: "All Time", val: fmtTime(totalAll) }, { icon: "📋", label: "Sessions", val: timeEntries.length }].map(s => (
              <div key={s.label} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "11px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 18, marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 17, color: accent.v }}>{s.val}</div>
                <div style={{ fontSize: 9, color: "var(--t3)", fontWeight: 700 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>7-Day Chart</div>
            <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 64 }}>
              {last7.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  {d.mins > 0 && <div style={{ fontSize: 8, fontWeight: 700, color: accent.v }}>{d.mins}m</div>}
                  <div style={{ width: "100%", height: `${(d.mins / maxMins) * 52 + 3}px`, background: d.ds === todayStr() ? `linear-gradient(180deg,${accent.v},${accent.g})` : `${accent.v}35`, borderRadius: "4px 4px 0 0", minHeight: 3, transition: "height .6s ease" }} />
                  <div style={{ fontSize: 8.5, color: d.ds === todayStr() ? "var(--acc)" : "var(--t3)", fontWeight: d.ds === todayStr() ? 800 : 400 }}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", marginBottom: 10 }}>All Tasks</div>
          {activeTasks.map(task => {
            const taskSecs = timeEntries.filter(e => e.taskId === task.id).reduce((a, e) => a + (e.duration || e.seconds || 0), 0);
            const isRunning = activeTimer?.taskId === task.id;
            const cat = categories.find(c => c.id === task.categoryId) || { icon: "📋" };
            return (
              <div key={task.id} style={{ background: "var(--s1)", border: `1.5px solid ${isRunning ? accent.v : "var(--b1)"}`, borderRadius: 12, padding: "10px 12px", marginBottom: 7, display: "flex", alignItems: "center", gap: 9, transition: "border-color .2s" }}>
                <span style={{ fontSize: 14 }}>{cat.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                  <div style={{ fontSize: 10, color: isRunning ? accent.v : "var(--t3)", fontWeight: isRunning ? 700 : 400, marginTop: 1 }}>{isRunning ? "⏱ Tracking…" : taskSecs > 0 ? `⏱ ${fmtTime(taskSecs)}` : "No time yet"}</div>
                </div>
                <button onClick={() => { isRunning ? stopTimer() : startTimer(task.id); haptic("medium"); }} style={{ height: 30, padding: "0 10px", borderRadius: 9, background: isRunning ? "rgba(255,107,107,.18)" : "var(--accd)", border: `1px solid ${isRunning ? "var(--red)" : "var(--acc)"}`, color: isRunning ? "var(--red)" : "var(--acc)", fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                  {isRunning ? "⏹" : "▶"}
                </button>
              </div>
            );
          })}
          {activeTasks.length === 0 && <div style={{ textAlign: "center", padding: "28px 0", color: "var(--t3)" }}><div style={{ fontSize: 32 }}>✅</div><div style={{ fontSize: 12.5, marginTop: 8 }}>No active tasks!</div></div>}

          {byTask.length > 0 && <>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)", margin: "16px 0 10px" }}>Top by Time</div>
            {byTask.slice(0, 4).map(task => {
              const pct = Math.round((task.secs / totalAll) * 100) || 0;
              const cat = categories.find(c => c.id === task.categoryId) || { icon: "📋" };
              return (
                <div key={task.id} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 11, padding: "9px 12px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <span>{cat.icon}</span><span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: "var(--t1)" }}>{task.title}</span>
                    <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 14, color: accent.v }}>{fmtTime(task.secs)}</span>
                  </div>
                  <div style={{ height: 3, background: "var(--s3)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </>}
          {timeEntries.length > 0 && <button onClick={() => { setTimeEntries([]); }} style={{ width: "100%", height: 36, marginTop: 10, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.3)", borderRadius: 10, color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>🗑 Clear Time Data</button>}
        </div>}

        {/* ── 🎵 AMBIENT VIEW */}
        {ftView === "ambient" && <div style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6, marginBottom: 20 }}>Pick a sound to play while you work. Helps with focus and reduces distractions.</div>
          {[
            { id: "lofi", icon: "☕", label: "Lo-Fi Chill", desc: "Warm chord loops, hi-hats, vinyl crackle", color: "#7c6dfa" },
            { id: "jazzy", icon: "🎷", label: "Jazzy Lo-Fi", desc: "Jazz chords, walking bass, brush snare", color: "#ff9f43" },
            { id: "focus", icon: "🧠", label: "Deep Focus", desc: "Binaural drones, LFO modulation, minimal", color: "#48dbfb" },
            { id: "rain", icon: "🌧", label: "Rainy Day", desc: "Rain noise, thunder rumbles, soft piano drops", color: "#6bcb77" },
            { id: "nature", icon: "🌿", label: "Forest", desc: "Birds, wind gusts, water stream", color: "#00d4aa" },
            { id: "cosmic", icon: "🌌", label: "Cosmic Drift", desc: "Space pads, shimmer sparkles, sub bass", color: "#a855f7" },
          ].map(track => (
            <div key={track.id} onClick={() => {
              if (musicOn && musicTrack === track.id) { stopMusic(); setMusicOn(false); setAmbientMode("none"); }
              else { startMusic(track.id); setMusicOn(true); setAmbientMode(track.id); haptic("light"); }
            }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 16, marginBottom: 10, cursor: "pointer", background: ambientMode === track.id ? `${track.color}14` : "var(--s1)", border: `1.5px solid ${ambientMode === track.id ? track.color + "60" : "var(--b1)"}`, transition: "all .2s" }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, background: `${track.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0, boxShadow: ambientMode === track.id ? `0 0 16px ${track.color}50` : "none" }}>
                {track.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)" }}>{track.label}</div>
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1, lineHeight: 1.4 }}>{track.desc}</div>
              </div>
              {ambientMode === track.id && musicOn
                ? <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 18 }}>
                  {[4, 7, 5, 8, 6].map((h, i) => <div key={i} style={{ width: 3, height: `${h + Math.sin(Date.now() / 400 + i) * 3}px`, background: track.color, borderRadius: 2, animation: `soundbar${i} .6s ease-in-out infinite`, animationDelay: `${i * 0.12}s`, minHeight: 3 }} />)}
                </div>
                : <span style={{ fontSize: 11, color: "var(--t3)" }}>▶</span>
              }
            </div>
          ))}
          <div style={{ marginTop: 8, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 14px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>💡 Focus Tips</div>
            {["Put your phone face-down or in another room", "Use the Pomodoro tab for 25-min deep work sessions", "Pair ambient sound with the fullscreen 🌌 Focus Mode", "Track your time to see your most productive hours"].map((tip, i) => (
              <div key={i} style={{ fontSize: 12, color: "var(--t2)", padding: "5px 0", borderBottom: i < 3 ? "1px solid var(--b1)" : "none", display: "flex", gap: 8 }}>
                <span style={{ color: accent.v, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>{tip}
              </div>
            ))}
          </div>
        </div>}
      </div>
    );
  };






  // == Task Sharing ==
  function shareTask(task) {

    haptic("medium");
    const cat = categories.find(c => c.id === task.categoryId) || { icon: "📋", name: "Task" };
    const status = task.done ? "✅ Completed" : task.due ? `📅 Due ${fmtDate(task.due)}` : "🔄 In progress";
    const priority = PRIORITIES[task.priority]?.icon || "";
    const timeLogged = getTaskTime(task.id);
    const timeStr = timeLogged > 0 ? `\n⏱ ${fmtTime(timeLogged)} logged` : "";
    const text = `${priority} ${task.title}\n${status}\n${cat.icon} ${cat.name}${timeStr}\n\nTracked with Taskflow ✦`;
    if (navigator.share) {
      navigator.share({ title: "Taskflow Task", text }).catch(() => { });
    } else {
      navigator.clipboard?.writeText(text).then(() => showNotif("📋 Copied!", "Task details copied to clipboard"));
    }
  };

  // == Customization: App Name & Icon ==
  const [appDisplayName, setAppDisplayName] = useState(() => localStorage.getItem("tf_appname") || "Taskflow");
  const [appAccentMsg, setAppAccentMsg] = useState(() => localStorage.getItem("tf_accentmsg") || "");
  useEffect(() => { try { localStorage.setItem("tf_appname", appDisplayName); } catch (e) { } }, [appDisplayName]);




  // == Microsoft Store / PWA Meta ==
  useEffect(() => {
    // Theme color syncs with accent
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', accent.v);
    else {
      const m = document.createElement('meta');
      m.name = 'theme-color'; m.content = accent.v;
      document.head.appendChild(m);
    }
    // App title
    document.title = (appDisplayName || 'Taskflow') + ' — Task Manager';
  }, [accent.v, appDisplayName]);

  // == Service Worker registration ==
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => { });
    }
  }, []);

  // == PWA Install Prompt ==
  const [pwaPrompt, setPwaPrompt] = useState(null);

  function installPWA() {
    if (pwaPrompt) { pwaPrompt.prompt(); pwaPrompt.userChoice.then(() => { setPwaPrompt(null); setIsInstalled(true); setShowInstallBanner(false); localStorage.setItem('tf_install_dismissed', '1'); }); }
    else { setShowInstallBanner(false); localStorage.setItem('tf_install_dismissed', '1'); }
  };
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(() => {
    return window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
  });
  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true); return;
    }
    function handler(e) {
      e.preventDefault(); setPwaPrompt(e);
      // Show install banner after 20 seconds on first visit
      if (!localStorage.getItem('tf_install_dismissed')) {
        setTimeout(() => setShowInstallBanner(true), 20000);
      }
    }
    window.addEventListener('beforeinstallprompt', handler);
    // Also show banner after 45s even without the prompt (iOS safari)
    if (!localStorage.getItem('tf_install_dismissed') && !isInstalled) {
      setTimeout(() => setShowInstallBanner(true), 45000);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);


  // == ICS Calendar Import ==
  const [showICSModal, setShowICSModal] = useState(false);
  function parseICS(text) {

    const events = []; let cur = null;
    text.split("\n").forEach(line => {
      line = line.trim();
      if (line === "BEGIN:VEVENT") cur = {};
      else if (line === "END:VEVENT" && cur) {
        if (cur.title) { events.push(cur); } cur = null;
      } else if (cur) {
        if (line.startsWith("SUMMARY:")) cur.title = line.slice(8).replace(/\\n/g, " ").trim();
        else if (line.startsWith("DTSTART")) {
          const d = line.split(":")[1]?.replace(/T.*/, "") || "";
          if (d.length >= 8) cur.due = d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
        }
        else if (line.startsWith("DESCRIPTION:")) cur.notes = line.slice(12).replace(/\\n/g, "\n").trim();
      }
    });
    return events;
  };
  function importICS(e) {

    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const events = parseICS(ev.target.result);
      if (!events.length) { showNotif("❌ No events found", "Check your .ics file"); return; }
      const newTasks = events.map(ev => ({ id: uid(), title: ev.title, notes: ev.notes || "", priority: "medium", categoryId: "work", due: ev.due || "", photo: null, tags: ["calendar"], subtasks: [], starred: false, recurring: "never", reminder: false, reminderTime: "09:00", reminderDate: "", alarmTone: "classic", profileId: activeProfile, done: false, createdAt: Date.now() }));
      setTasks(ts => [...newTasks, ...ts]);
      showNotif(`📅 ${events.length} events imported!`, "From Google Calendar");
      play("add"); awardXP(events.length * 5, "Calendar import");
      setShowICSModal(false);
    };
    reader.readAsText(file);
  };

  // == Export to PDF (print dialog) ==
  function exportToPDF() {

    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const doneThisWeek = tasks.filter(t => {
      if (!t.done || !t.createdAt) return false;
      const d = new Date(t.createdAt);
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return d > weekAgo;
    });
    const activeTasks = profileTasks.filter(t => !t.done);
    const pct = tasks.length ? Math.round((tasks.filter(t => t.done).length / tasks.length) * 100) : 0;
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>Taskflow Report — ${today}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:40px;color:#1a1a2e;}
  h1{font-size:28px;font-weight:300;color:#7c6dfa;margin-bottom:4px;}
  .sub{color:#888;font-size:14px;margin-bottom:32px;}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;}
  .stat{background:#f8f7ff;border-radius:12px;padding:16px;text-align:center;}
  .stat-val{font-size:28px;font-weight:700;color:#7c6dfa;}
  .stat-lbl{font-size:11px;color:#888;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;}
  h2{font-size:16px;font-weight:700;color:#333;margin:24px 0 12px;border-bottom:2px solid #f0eeff;padding-bottom:8px;}
  .task-item{padding:10px 14px;border-radius:8px;margin-bottom:6px;font-size:13px;display:flex;align-items:center;gap:10px;}
  .done{background:#f0fdf4;color:#166534;}.active{background:#fafafa;color:#374151;}
  .pri{font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;}
  .high{background:#fee2e2;color:#dc2626;}.medium{background:#fef3c7;color:#d97706;}.low{background:#dcfce7;color:#16a34a;}
  .footer{margin-top:40px;text-align:center;color:#aaa;font-size:12px;}
  @media print{body{padding:20px;}}
</style></head><body>
<h1>✦ Taskflow</h1>
<div class="sub">Weekly Report — ${today}</div>
<div class="stats">
  <div class="stat"><div class="stat-val">${tasks.filter(t => t.done).length}</div><div class="stat-lbl">Completed</div></div>
  <div class="stat"><div class="stat-val">${activeTasks.length}</div><div class="stat-lbl">Active</div></div>
  <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Completion</div></div>
  <div class="stat"><div class="stat-val">${doneThisWeek.length}</div><div class="stat-lbl">This Week</div></div>
</div>
<h2>✅ Completed This Week (${doneThisWeek.length})</h2>
${doneThisWeek.slice(0, 20).map(t => `<div class="task-item done">✔️ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span></div>`).join("")}
${doneThisWeek.length === 0 ? "<p style='color:#aaa;font-size:13px'>No tasks completed this week yet.</p>" : ""}
<h2>📋 Active Tasks (${Math.min(activeTasks.length, 15)})</h2>
${activeTasks.slice(0, 15).map(t => `<div class="task-item active">○ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span>${t.due ? `<span style='color:#aaa;font-size:11px'>due ${t.due}</span>` : ""}</div>`).join("")}
<div class="footer">Generated by Taskflow ✦ — ${new Date().toISOString().slice(0, 10)}</div>
</body></html>`;
    const w = window.open("", "_blank", "width=750,height=900");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    else { showNotif("📄 PDF blocked", "Allow popups to export PDF"); }
    awardXP(20, "Exported report"); haptic("medium");
  };



  // == Request notification permission on first task add ==


  // ── Manual Backup & Restore ──
  function exportBackup() {
    const backup = { tasks, goals, habits, moods, notes, finances, categories, profiles, xp, earnedBadges, exportedAt: new Date().toISOString(), version: "taskflow-v1" };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `taskflow-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    showNotif("💾 Backup saved!", "Your data has been exported"); haptic("success");
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const b = JSON.parse(e.target.result);
        if (!b.version?.startsWith("taskflow")) throw new Error("Invalid");
        if (b.tasks) setTasks(b.tasks);
        if (b.goals) setGoals(b.goals);
        if (b.habits) setHabits(b.habits);
        if (b.moods) setMoods(b.moods);
        if (b.notes) setNotes(b.notes);
        if (b.finances) setFinances(b.finances);
        if (b.categories) setCategories(b.categories);
        if (b.profiles) setProfiles(b.profiles);
        if (b.xp) setXp(b.xp);
        if (b.earnedBadges) setEarnedBadges(b.earnedBadges);
        showNotif("✅ Restored!", `${b.tasks?.length || 0} tasks recovered`); haptic("success");
      } catch (err) { showNotif("❌ Invalid file", "Please use a Taskflow backup file"); }
    };
    reader.readAsText(file);
  }

  // == Bulk Actions ==
  const toggleBulkSelect = (id) => {
    setBulkSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const bulkComplete = () => {
    setBulkSelected(s => { s.forEach(id => { setTasks(ts => ts.map(t => t.id === id ? { ...t, done: true } : t)); }); return new Set(); });
    setBulkMode(false); awardXP(bulkSelected.size * 15, "Bulk complete"); haptic("success");
    showNotif(`✅ ${bulkSelected.size} tasks completed!`, "");
  };
  const bulkDelete = () => {
    if (!window.confirm(`Delete ${bulkSelected.size} tasks?`)) return;
    setTasks(ts => ts.filter(t => !bulkSelected.has(t.id)));
    setBulkSelected(new Set()); setBulkMode(false); haptic("error");
    showNotif(`🗑 ${bulkSelected.size} tasks deleted`, "");
  };
  const bulkStar = () => {
    setBulkSelected(s => { s.forEach(id => setTasks(ts => ts.map(t => t.id === id ? { ...t, starred: true } : t))); return new Set(); });
    setBulkMode(false); showNotif(`⭐ ${bulkSelected.size} tasks starred`, "");
  };

  // == AI Smart Task Breakdown — Pure offline engine, zero API calls ==
  async function aiBreakdown() {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiTasks([]);
    // Small delay so the loading spinner shows (feels intentional, not instant)
    await new Promise(r => setTimeout(r, 400));
    {
      // == Offline Smart Breakdown Engine ==
      const goal = aiInput.toLowerCase();
      let tasks = [];

      // FITNESS & HEALTH
      if (/(fitness|workout|gym|exercise|weight loss|lose weight|get fit|muscle|run|running|marathon|yoga|strength)/.test(goal)) {
        if (/(run|marathon|5k|10k)/.test(goal)) tasks = ["Download a beginner running plan (Couch to 5K)", "Buy proper running shoes from a sports store", "Start Week 1: Walk 30 min 3× this week", "Track each run — distance, time, how you felt", "Increase running time by 10% each week", "Join a local running group or online community", "Enter a fun run or 5K race to stay motivated", "Rest and stretch after every run session"];
        else if (/(yoga|meditat|flexibility|stretch)/.test(goal)) tasks = ["Find a beginner yoga YouTube channel (Yoga with Adriene)", "Set a fixed daily yoga time (morning is best)", "Start with 15 min sessions 5× per week", "Learn 5 foundational poses this week", "Track your flexibility progress with photos", "Upgrade to 30-min sessions after 2 weeks", "Try a different yoga style: Vinyasa, Yin, or Hatha", "Set a 30-day yoga challenge goal"];
        else tasks = ["Schedule 3 workout days per week in your calendar", "Choose your workout type: gym, home, running or sport", "Buy or borrow basic equipment (resistance bands, dumbbells)", "Find a beginner program online (search YouTube)", "Start with 30 min sessions — do not skip warm-up", "Track workouts: exercises, sets, reps, weight used", "Increase intensity by 5-10% every two weeks", "Plan high-protein meals to support your training", "Find a workout buddy for accountability", "Set a 90-day body transformation goal with milestones"];
      }

      // LEARNING A SKILL
      else if (/(learn|study|skill|guitar|piano|music|instrument|language|spanish|french|coding|programming|drawing|art|photography|chess|cooking|baking|writing|speak|public speak)/.test(goal)) {
        if (/(guitar|piano|drums|instrument|music)/.test(goal)) tasks = ["Buy or borrow the instrument you're learning", "Find a beginner course (YouTube, Yousician, or local teacher)", "Practice 20 minutes every single day — consistency beats duration", "Learn 3 basic chords or scales this first week", "Record yourself weekly to hear your improvement", "Join an online community (Reddit r/learnguitar, etc.)", "Set a goal: play one full song within 30 days", "Perform for a friend or family member — accountability!"];
        else if (/(language|spanish|french|hindi|arabic|german|japanese|korean)/.test(goal)) tasks = ["Download Duolingo or Babbel — do 10 min daily", "Learn the 100 most common words first", "Find a free beginner course on YouTube", "Practice speaking out loud — don't just read", "Find a language exchange partner (Tandem app)", "Watch shows with subtitles in that language", "Set a milestone: hold a 2-min conversation in 60 days", "Label items around your home in the new language"];
        else if (/(cod|program|developer|software|python|javascript|web dev|app dev)/.test(goal)) tasks = ["Choose ONE language to start (Python or JavaScript recommended)", "Complete a free beginner course (freeCodeCamp, CS50, or The Odin Project)", "Code for 1 hour every day — no exceptions", "Build project #1: a simple calculator or to-do list", "Learn Git and push your code to GitHub", "Join coding communities: Reddit, Discord, Stack Overflow", "Build project #2: something you'd actually use", "Start applying to junior positions or freelance gigs after 6 months"];
        else tasks = ["Research the 3 best resources for learning this skill", "Create a daily 20-30 min practice schedule", "Complete your first beginner lesson or tutorial today", "Set a weekly learning milestone to track progress", "Find an online community around this skill", "Practice deliberately — focused reps beat casual browsing", "Record or document your progress weekly", "Set a public challenge: 30 days of consistent practice", "Find a mentor or accountability partner", "Apply what you learn: do a real project within 30 days"];
      }

      // BUSINESS & STARTUP
      else if (/(business|startup|company|launch|entrepreneur|product|sell|store|ecommerce|freelance|brand|shop|service|agency)/.test(goal)) {
        if (/(freelance|consulting|service|agency)/.test(goal)) tasks = ["Define your specific service and target client", "Create a simple portfolio (even 2-3 sample projects)", "Set your pricing: hourly or project-based", "Build a basic profile on Upwork, Fiverr, or LinkedIn", "Reach out to 10 potential clients this week", "Deliver your first project for free or discount to get a review", "Ask for a testimonial after every completed job", "Raise prices after landing your first 5 clients", "Track income and expenses from day one", "Set a monthly revenue goal for the next 3 months"];
        else tasks = ["Validate the idea: talk to 10 potential customers this week", "Define your target customer in one clear sentence", "Research 3 main competitors — what are they missing?", "Create a lean business model (product, price, channel, customer)", "Build an MVP (Minimum Viable Product) — simplest version possible", "Get your first 3-5 paying customers before building more", "Set up basic legal/financial structure (register, bank account)", "Create a simple website or landing page", "Launch on social media with behind-the-scenes content", "Set 3-month revenue and customer milestones"];
      }

      // APP / SOFTWARE DEVELOPMENT
      else if (/(app|mobile app|website|web app|saas|software|develop|build app|create app)/.test(goal)) {
        tasks = ["Define core features (write them down — max 5 for v1)", "Sketch wireframes on paper or using Figma (free)", "Choose your tech stack: React Native, Flutter, or web", "Set up your development environment and repo (GitHub)", "Build the most critical feature first (not the prettiest)", "Create a simple database schema or data structure", "Build and test on a real device as early as possible", "Get 3-5 beta testers and collect honest feedback", "Fix critical bugs before adding new features", "Prepare store listing: screenshots, description, icon", "Submit to Google Play Store or Samsung Galaxy Store"];
      }

      // WEIGHT LOSS / DIET / NUTRITION
      else if (/(diet|nutrition|eat healthy|meal prep|weight|calor|intermittent fast|keto|vegan)/.test(goal)) {
        tasks = ["Calculate your daily calorie target (use TDEE calculator)", "Remove the top 3 junk foods from your home today", "Plan this week's meals on Sunday evening", "Meal prep lunches and dinners for 3 days in advance", "Drink 2-3 liters of water per day — track it", "Eat protein with every meal to stay full longer", "Replace sugary drinks with water or black coffee", "Walk at least 8,000 steps every day", "Track everything you eat for 1 week (MyFitnessPal)", "Weigh yourself once a week, same time, same conditions", "Don't aim for perfection — aim for 80/20 consistency"];
      }

      // FINANCE & SAVING
      else if (/(money|finance|save|saving|invest|budget|debt|loan|salary|income|wealth|financial|rich|bank)/.test(goal)) {
        tasks = ["Track every rupee/dollar you spend for 30 days", "Create a monthly budget: needs, wants, savings (50/30/20 rule)", "Cancel subscriptions you haven't used in 3 months", "Build an emergency fund: 3-6 months of expenses", "Set up automatic savings transfer on payday", "Pay off highest-interest debt first (avalanche method)", "Open an investment account (index funds are beginner-friendly)", "Read one personal finance book this month", "Set a 12-month savings target with monthly milestones", "Increase income: freelance, side hustle, or upskill"];
      }

      // READING / BOOKS
      else if (/(read|book|reading habit|library|novel|non-fiction|kindle)/.test(goal)) {
        tasks = ["Choose your first 3 books and add them to a reading list", "Set a daily reading time: 20 minutes before bed works great", "Always have your current book accessible (physical or Kindle app)", "Take brief notes or highlights on key ideas", "Set a monthly goal: 1-2 books per month to start", "Join Goodreads to track books and find recommendations", "Apply one idea from every non-fiction book you read", "Share book summaries with friends — teaching reinforces learning", "Try audiobooks during commutes or exercise", "Set a yearly reading goal: 12 books = 1 per month"];
      }

      // TRAVEL
      else if (/(travel|trip|vacation|holiday|visit|tour|adventure|backpack|abroad)/.test(goal)) {
        tasks = ["Choose destination and set travel dates", "Research visa requirements and apply early if needed", "Set a travel budget and start saving monthly", "Book flights at least 6-8 weeks in advance for best prices", "Book accommodation (compare Booking.com and Airbnb)", "Research top 10 things to do at destination", "Plan a rough day-by-day itinerary (leave room for spontaneity)", "Pack light — list essentials and halve it", "Notify bank of travel dates to avoid card blocks", "Download offline maps and translation apps", "Get travel insurance before you leave"];
      }

      // MENTAL HEALTH / MINDFULNESS
      else if (/(mental health|mindful|meditat|anxiety|stress relief|self care|self-care|peace|calm|therapist|wellbeing)/.test(goal)) {
        tasks = ["Start a 5-minute daily meditation (Headspace or YouTube)", "Journal 3 things you're grateful for every morning", "Set digital boundaries: no phone 1 hour before bed", "Get outside for a 20-min walk every day", "Identify your top 3 stress triggers this week", "Say no to one non-essential commitment this week", "Connect with one friend or family member each week", "Practice deep breathing: 4-count in, hold, 4-count out", "Reduce caffeine if you experience anxiety", "Consider talking to a counselor or therapist"];
      }

      // WRITING / CONTENT CREATION
      else if (/(write|writing|blog|content|youtube|video|podcast|creator|author|book|novel|story)/.test(goal)) {
        tasks = ["Define your niche and target audience clearly", "Create a content calendar for the next 30 days", "Publish your first piece — don't wait for perfect", "Write or create for 30 minutes every single day", "Study 3 successful creators in your niche", "Build an email list from day one (Mailchimp is free)", "Repurpose content across multiple platforms", "Engage with comments and build community", "Analyze what performs best after 30 days", "Collaborate with another creator in your space", "Set a milestone: 100 subscribers or readers in 90 days"];
      }

      // CAREER / JOB
      else if (/(career|job|promotion|interview|resume|cv|linkedin|network|salary raise|switch job|new job)/.test(goal)) {
        tasks = ["Update your resume — keep it to 1 page, results-focused", "Rewrite your LinkedIn headline and summary with keywords", "List 20 target companies you'd love to work at", "Reach out to 5 people in your target field this week", "Apply to 3-5 quality jobs per week (not hundreds)", "Prepare answers to 10 common interview questions", "Research each company before every interview", "Follow up after every interview with a thank-you email", "Build a skill that makes you more valuable in 90 days", "Negotiate every offer — even 5% more compounds over time"];
      }

      // GENERAL GOAL (catch-all -- still very detailed)
      else {
        const goalTitle = aiInput.trim();
        tasks = [
          `Research and understand exactly what "${goalTitle}" requires`,
          "Define your specific success criteria — how will you know you've achieved it?",
          "Set a realistic deadline with 3 milestone dates",
          "Identify the #1 obstacle that could stop you — plan around it",
          "Break into weekly actions: what will you do each week?",
          "Schedule dedicated time in your calendar for this goal",
          "Find one person who has achieved this — study their path",
          "Remove distractions and environment blockers this week",
          "Track your progress weekly — what's working, what's not",
          "Find an accountability partner or share your goal publicly",
          "Celebrate each milestone — reward yourself for wins",
        ];
      }

      setAiTasks(tasks);
      setAiSelected(tasks.map((_, i) => i));
    }
    setAiLoading(false);
  }

  function addAiTasksToApp() {

    const selected = aiTasks.filter((_, i) => aiSelected.includes(i));
    const newTasks = selected.map(title => ({
      id: uid(), title, notes: "", priority: "medium",
      categoryId: "work", due: "", photo: null, tags: [], subtasks: [],
      starred: false, recurring: "never", reminder: false,
      reminderTime: "09:00", reminderDate: "", alarmTone: "classic",
      profileId: activeProfile, done: false, createdAt: Date.now()
    }));
    setTasks(ts => [...newTasks, ...ts]);
    showNotif("✦ " + selected.length + " tasks added!", "AI breakdown complete");
    play("add");
    awardXP(selected.length * 5, "AI tasks added");
    setShowAiModal(false);
    setAiInput("");
    setAiTasks([]);
    setAiSelected([]);
    setTab("tasks");
    setShowDone(false);
    setShowStarred(false);
  };


  // == ✦ TASKLY BOT CHAT ==
  const [chatMsgs, setChatMsgs] = useState(() => { const n = localStorage.getItem('tf_username') || ''; return [{ from: "bot", text: `Hey${n ? " " + n : ""}! 👋 I'm LIBI — your built-in AI.\n\nI know your tasks, I work offline, and I'm always here.\n\n💬 Try:\n• "Plan my day"\n• "Motivate me"\n• "Tell me a joke 😄"\n• "I'm feeling overwhelmed"\n\nWhat's on your mind?` }]; });
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef(null);
  const QUICK = [
    "Plan my day 📅",
    "Motivate me 💪",
    "I'm overwhelmed 😓",
    "Give me a tip 💡",
    "Tell me a joke 😄",
    "My progress 📊",
    "What to do first? 🎯",
    "Quote me something ✨",
  ];

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMsgs]);

  async function sendChat(override = null) {

    const text = override || chatInput.trim();
    if (!text) return;
    setChatInput("");
    const newMsgs = [...chatMsgs, { from: "user", text }];
    setChatMsgs(newMsgs);
    setChatTyping(true);
    play("tap");

    const tomorrowDate = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
    const todayDate2 = todayStr();

    // == LIBI Memory: learn from every message ==
    const extractMemory = (txt) => {
      const occMatch = txt.match(/i'?m? a? ?(student|developer|designer|teacher|doctor|engineer|freelancer|manager|nurse|lawyer|architect|writer|artist|chef|accountant|scientist)/i);
      if (occMatch) setLibiMemory(m => ({ ...m, occupation: occMatch[1], facts: [...new Set([...m.facts, txt.trim()])].slice(-20) }));
      const wakeMatch = txt.match(/i wake up at ([\w:]+(?:\s?[ap]m)?)/i);
      if (wakeMatch) setLibiMemory(m => ({ ...m, wakeTime: wakeMatch[1], facts: [...new Set([...m.facts, txt.trim()])].slice(-20) }));
      const nameMatch = txt.match(/my name is (\w+)/i);
      if (nameMatch) setLibiMemory(m => ({ ...m, name: nameMatch[1], facts: [...new Set([...m.facts, txt.trim()])].slice(-20) }));
      if (/i (love|hate|prefer|like|dislike|enjoy|work|study|live|am|feel)/i.test(txt) && txt.length < 120)
        setLibiMemory(m => ({ ...m, facts: [...new Set([...m.facts, txt.trim()])].slice(-20) }));
    };
    extractMemory(text);

    // == Task creation from natural language — always handled instantly ==
    const taskCreationPatterns = /^(remind me to|add task|create task|new task|i need to|i have to|don.t forget to|schedule|set a reminder)/i;
    const reminderMatch = text.match(/(?:remind me to|add task|create task|new task|i need to|i have to|don.t forget to)\s+(.+?)(?:\s+(?:tomorrow|today|on\s+\w+|next\s+\w+))?$/i);
    if (taskCreationPatterns.test(text) && reminderMatch?.[1]) {
      const taskTitle = reminderMatch[1].trim().replace(/[.!?]$/, "");
      const hasTomorrow = /tomorrow/i.test(text);
      const hasToday = /today|tonight/i.test(text);
      const dueDate = hasTomorrow ? tomorrowDate : hasToday ? todayDate2 : "";
      const newTask = { id: uid(), title: taskTitle, notes: "Added by LIBI from chat", priority: "medium", categoryId: "work", due: dueDate, photo: null, tags: ["libi"], subtasks: [], starred: false, recurring: "never", reminder: false, reminderTime: "09:00", reminderDate: "", alarmTone: "classic", profileId: activeProfile, done: false, createdAt: Date.now() };
      setTasks(ts => [newTask, ...ts]);
      play("add"); awardXP(10, "LIBI task create"); haptic("success");
      setChatMsgs(m => [...m, { from: "bot", text: `✅ Done! Added **"${taskTitle}"** to your tasks${dueDate ? " due " + (hasTomorrow ? "tomorrow" : "today") : ""}.\n\n💡 You can also say:\n• "Remind me to call mum tomorrow"\n• "I need to finish the report today"\n• "Add task review budget"` }]);
      setChatTyping(false);
      return;
    }

    // == LIBI BRAIN v3.0 — Pure offline intelligence, no API, no internet needed ==
    setTimeout(() => {
      const lowerText = text.toLowerCase();
      const prevBotMsg = newMsgs.filter(m => m.from === "bot").slice(-1)[0]?.text || "";

      // Context-chain: carry prior response into follow-up questions
      let enrichedInput = text;
      if (/^(more|tell me more|elaborate|explain( that)?|why|how exactly|what do you mean|go on|continue|keep going|and\??)[\s!.?]*$/i.test(lowerText) && prevBotMsg.length > 50) {
        enrichedInput = text + " [CONTEXT: " + prevBotMsg.slice(0, 180) + "]";
      }
      // Affirmative → default to day planning
      if (/^(yes|sure|ok|okay|let.?s( do it)?|sounds good|go ahead|do it|yep|yeah|absolutely|please|let.?s go)[\s!.]*$/i.test(lowerText) && prevBotMsg.includes("?")) {
        enrichedInput = "plan my day and help me get started";
      }
      // Negative → graceful exit
      if (/^(no|nope|not now|skip|later|maybe|nah|not really)[\s!.]*$/i.test(lowerText) && prevBotMsg.includes("?")) {
        setChatMsgs(m => [...m, { from: "bot", text: "No problem! 😊 What else can I help with? I'm here for tasks, advice, motivation, or anything else on your mind." }]);
        setChatTyping(false);
        return;
      }

      const reply = libiBot(enrichedInput, profileTasks, categories, t, userName || "friend", libiMemory);
      setChatMsgs(m => [...m, { from: "bot", text: reply }]);
      setChatTyping(false);
    }, 300 + Math.random() * 120);
  };

  // Chat panel rendered as inline JSX variable (never remounts -- fixes typing focus loss)
  const [libiTab, setLibiTab] = useState("chat");
  const [showLibiPanel, setShowLibiPanel] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("week"); // week|month|all
  const [deletedTask, setDeletedTask] = useState(null); // for undo
  const [undoTimer, setUndoTimer] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem("tf_onboarded"));

  useEffect(() => { const done = localStorage.getItem('tf_onboarded'); if (!done) { setTimeout(() => { setShowSplash(false); setOnboardStep(1); }, 2200); } else { setTimeout(() => setShowSplash(false), 1500); } }, []);
  const [dailyChallenge, setDailyChallenge] = useState(() => { try { return JSON.parse(localStorage.getItem('tf_challenge') || 'null'); } catch (e) { return null; } });
  const [challengeDone, setChallengeDone] = useState(false);
  useEffect(() => {
    const today = todayStr();
    if (!dailyChallenge || dailyChallenge.date !== today) {
      const cs = [{ text: 'Complete 3 tasks before noon', target: 3, type: 'count', date: today }, { text: 'Finish all high-priority tasks', target: 0, type: 'high', date: today }, { text: 'Log your mood today', target: 1, type: 'mood', date: today }, { text: 'Add 2 new tasks', target: 2, type: 'add', date: today }, { text: 'Complete 1 overdue task', target: 1, type: 'overdue', date: today }, { text: 'Write a note about your day', target: 1, type: 'note', date: today }, { text: 'Start a Pomodoro session', target: 1, type: 'pomo', date: today }, { text: 'Star your top task', target: 1, type: 'star', date: today }];
      const c = cs[new Date().getDay() % cs.length];
      setDailyChallenge(c); try { localStorage.setItem('tf_challenge', JSON.stringify(c)); } catch (e) { }
    }
  }, []);
  // confetti + page state moved earlier
  const [showSidebar, setShowSidebar] = useState(true); // "chat" | "breakdown" | "editor"

  const chatPanelJSX = (
    <>
      {/* LIBI Header */}
      <div style={{ padding: "14px 15px 0", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, animation: "libiPulse 3s ease-in-out infinite", overflow: "hidden", boxShadow: "0 4px 16px #7c6dfa60" }}>
              <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="libiBg2" x1="0" y1="0" x2="42" y2="42">
                    <stop offset="0%" stopColor="#7c6dfa" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                  <radialGradient id="libiSheen2" cx="30%" cy="20%" r="65%">
                    <stop offset="0%" stopColor="white" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="42" height="42" rx="13" fill="url(#libiBg2)" />
                <rect width="42" height="42" rx="13" fill="url(#libiSheen2)" />
                {/* Brain outline — left lobe */}
                <path d="M14 22 C14 17 17 13 21 13 C25 13 28 17 28 22 C28 26 25 29 21 29 C17 29 14 26 14 22 Z" stroke="white" strokeWidth="1.8" fill="none" strokeLinejoin="round" />
                {/* Brain split line */}
                <line x1="21" y1="13" x2="21" y2="29" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                {/* Left lobe bump */}
                <path d="M14 20 C11.5 20 11.5 24 14 24" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                {/* Right lobe bump */}
                <path d="M28 20 C30.5 20 30.5 24 28 24" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                {/* Spark / star dot — top */}
                <circle cx="21" cy="10" r="1.8" fill="white" opacity="0.9" />
                {/* Bottom stem */}
                <line x1="21" y1="29" x2="21" y2="32" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="18" y1="32" x2="24" y2="32" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </div>
            <div>

              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 16, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", fontWeight: 400 }}>LIBI</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: -1 }}>Your AI • Always offline ✦</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 20, background: "rgba(107,203,119,.14)", color: "#6bcb77", border: "1px solid rgba(107,203,119,.3)", fontWeight: 700 }}>● READY</span><button onClick={() => setShowLibiPanel(false)} style={{ width: 22, height: 22, borderRadius: 7, background: "var(--s3)", border: "none", color: "var(--t3)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} title="Close LIBI">✕</button></div>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, background: "var(--s2)", borderRadius: 10, padding: 3, marginBottom: 0 }}>
          {[["chat", "💬", "Chat"], ["breakdown", "⚡", "Breakdown"], ["editor", "🔒", "NL Edit"]].map(([id, icon, label]) => (
            <button key={id} onClick={() => setLibiTab(id)} style={{ flex: 1, height: 28, borderRadius: 8, fontSize: 10.5, fontWeight: 700, border: "none", cursor: "pointer", transition: "all .15s", background: libiTab === id ? "linear-gradient(135deg,#7c6dfa,#a855f7)" : "transparent", color: libiTab === id ? "#fff" : "var(--t3)" }}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: CHAT */}
      {libiTab === "chat" && <>
        <div className="chat-msgs">
          {chatMsgs.map((m, i) => {
            const html = m.text
              .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
              .replace(/(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>")
              .replace(/\n/g, "<br/>");
            return (
              <div key={i} className={`msg ${m.from === "user" ? "u" : "a"}`}>
                <div className="bubble" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            );
          })}
          {chatTyping && <div className="msg a"><div className="bubble"><div className="typing-b"><div className="tdot" /><div className="tdot" /><div className="tdot" /></div></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-quick">
          {["Plan my day", "What's overdue?", "Motivate me", "Give me a tip", "My progress"].map(q => (
            <button key={q} className="qbtn" onClick={() => sendChat(q)}>{q}</button>
          ))}
        </div>
        <div className="chat-inp">
          <textarea className="chat-ta" rows={1} placeholder="Ask LIBI anything…" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
          <button className="send-btn" disabled={!chatInput.trim() || chatTyping} onClick={() => sendChat()}><span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>↑</span></button>
        </div>
      </>}

      {/* ── TAB: AI BREAKDOWN */}
      {libiTab === "breakdown" && <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px", gap: 10, overflowY: "auto" }}>
        <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>Type any goal — LIBI breaks it into actionable tasks instantly.</div>
        <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder='e.g. "Launch my app", "Get fit in 30 days", "Learn guitar"' style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 12, padding: "10px 13px", fontSize: 13, color: "var(--t1)", resize: "none", height: 80, outline: "none", transition: "border-color .2s" }} onFocus={e => e.target.style.borderColor = "#7c6dfa"} onBlur={e => e.target.style.borderColor = "var(--b1)"} />
        <button onClick={aiBreakdown} disabled={!aiInput.trim() || aiLoading} style={{ height: 42, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 14px #7c6dfa40", opacity: aiLoading || !aiInput.trim() ? 0.5 : 1 }}>
          {aiLoading ? "⏳ Breaking down…" : "⚡ Break it down"}
        </button>
        {aiTasks.length > 0 && !aiLoading && <>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .5 }}>SELECT TASKS TO ADD ({aiSelected.length}/{aiTasks.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, overflowY: "auto" }}>
            {aiTasks.map((task, i) => (
              <div key={i} onClick={() => setAiSelected(s => s.includes(i) ? s.filter(x => x !== i) : [...s, i])} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", borderRadius: 11, cursor: "pointer", background: aiSelected.includes(i) ? "var(--accd)" : "var(--s2)", border: `1px solid ${aiSelected.includes(i) ? "var(--acc)" : "transparent"}`, transition: "all .15s" }}>
                <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${aiSelected.includes(i) ? "var(--acc)" : "var(--b2)"}`, background: aiSelected.includes(i) ? "var(--acc)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: "#fff", fontWeight: 800 }}>{aiSelected.includes(i) && "✓"}</div>
                <span style={{ fontSize: 12.5, fontWeight: 500 }}>{task}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button onClick={() => setAiSelected(aiTasks.map((_, i) => i))} style={{ flex: 1, height: 36, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 10, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>All</button>
            <button onClick={addAiTasksToApp} disabled={!aiSelected.length} style={{ flex: 2, height: 36, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", border: "none", borderRadius: 10, fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: aiSelected.length ? 1 : 0.4 }}>➕ Add {aiSelected.length} task{aiSelected.length !== 1 ? "s" : ""}</button>
          </div>
        </>}
      </div>}

      {/* ── TAB: NL EDITOR — COMING SOON */}
      {libiTab === "editor" && <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "12px", gap: 10, overflowY: "auto", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <div style={{ textAlign: "center", padding: "20px 16px" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, marginBottom: 8, color: "var(--t1)" }}>Coming Soon</div>
          <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.7, marginBottom: 16 }}>Natural Language Task Editing — type commands like "move my work tasks to tomorrow" and LIBI will do it automatically.</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center" }}>
            {["🔀 Bulk reschedule", "✅ Complete by category", "🏷 Change priority", "🗑 Clear done tasks"].map(f => (
              <span key={f} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", border: "1px solid var(--acc)", fontWeight: 600 }}>{f}</span>
            ))}
          </div>
          <div style={{ marginTop: 16, fontSize: 11, color: "var(--t3)" }}>🚀 Coming in next update</div>
        </div>
      </div>}
      {false && <div style={{ display: "none" }}>
      </div>}
    </>
  );

  // == ⌘ COMMAND PALETTE ==
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const cmdRef = useRef(null);
  useEffect(() => {
    function h(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowCmdPalette(p => !p); setCmdQuery(""); }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); openAdd(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); setShowSidebar(s => !s); }
      if (e.key === "F5") { e.preventDefault(); }
      if (e.key === "?" && !e.ctrlKey) { setShowShortcuts(s => !s); } // prevent reload on Windows
      if (e.key === "Escape") { setShowCmdPalette(false); setShowFocusMode(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  useEffect(() => { if (showCmdPalette) setTimeout(() => cmdRef.current?.focus(), 50); }, [showCmdPalette]);
  const CMD_ACTIONS = [
    { icon: "➕", label: "Add New Task", action: () => { openAdd(); setShowCmdPalette(false); }, group: "Tasks" },
    { icon: "📝", label: "New Note", action: () => { setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "personal", tags: [] }); setEditNote(null); setShowNoteEditor(true); setShowCmdPalette(false); }, group: "Notes" },
    { icon: "🏆", label: "New Goal", action: () => { setShowGoalModal(true); setShowCmdPalette(false); }, group: "Goals" },
    { icon: "📅", label: "Go to Calendar", action: () => { setTab("calendar"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "📊", label: "Go to Stats", action: () => { setTab("stats"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "⏱", label: "Time Tracking", action: () => { setTab("time"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "🧘", label: "Focus Timer", action: () => { setTab("focus"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "🌌", label: "Enter Focus Mode", action: () => { setFocusTaskId(null); setShowFocusMode(true); setShowCmdPalette(false); }, group: "Focus" },
    { icon: "✦", label: "LIBI AI Assistant", action: () => { setTab("bot"); play("tap"); setShowCmdPalette(false); }, group: "AI" },
    { icon: "📋", label: "Task Templates", action: () => { setShowTemplateModal(true); setShowCmdPalette(false); }, group: "Tasks" },
    { icon: "😊", label: "Log Today's Mood", action: () => { setShowMoodModal(true); setShowCmdPalette(false); }, group: "Wellness" },
    { icon: "☀️", label: "Toggle Dark/Light", action: () => { setDark(d => !d); setShowCmdPalette(false); }, group: "Settings" },
    { icon: "🏅", label: "View Gamification", action: () => { setShowGamificationModal(true); setShowCmdPalette(false); }, group: "Rewards" },
    { icon: "🎯", label: "View Overdue Tasks", action: () => { setTab("overdue"); setShowCmdPalette(false); }, group: "Tasks" },
    { icon: "⭐", label: "View Starred Tasks", action: () => { setTab("starred"); setShowCmdPalette(false); }, group: "Tasks" },
  ];
  const filteredCmds = cmdQuery.trim() ? CMD_ACTIONS.filter(c => c.label.toLowerCase().includes(cmdQuery.toLowerCase()) || c.group.toLowerCase().includes(cmdQuery.toLowerCase())) : CMD_ACTIONS;
  const taskResults = cmdQuery.trim().length >= 2 ? profileTasks.filter(t => !t.done && t.title.toLowerCase().includes(cmdQuery.toLowerCase())).slice(0, 4) : [];

  // == Persist ALL data to localStorage ==
  useEffect(() => { try { localStorage.setItem("tf_greet_scene", greetScene); localStorage.setItem("tf_greet_bg", greetCardBg); localStorage.setItem("tf_greet_accent", greetAccent); } catch { } }, [greetScene, greetCardBg, greetAccent]);
  useEffect(() => { try { localStorage.setItem("tf_icon", appIconEmoji); localStorage.setItem("tf_iconcolor", appIconColor); } catch { } }, [appIconEmoji, appIconColor]);
  useEffect(() => {
    // Save to localStorage
    try { localStorage.setItem("tf_tasks", JSON.stringify(tasks)); } catch (e) {
      // localStorage full or cleared — try to free space
      try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith("tf_"));
        if (keys.length > 5) localStorage.removeItem(keys[0]); // remove oldest
        localStorage.setItem("tf_tasks", JSON.stringify(tasks));
      } catch { }
    }
    // Save to IndexedDB as backup (not cleared by browser)
    const backup = { tasks, goals, habits, moods, notes, finances, categories, profiles, timestamp: Date.now() };
    idbSet("tf_backup", JSON.stringify(backup)).catch(() => { });
    // Cloud sync is handled by syncToGoogle() and auto-sync effect — no duplicate here
  }, [tasks, goals, habits, moods, notes, finances, authUser]);
  useEffect(() => { try { localStorage.setItem("tf_cats", JSON.stringify(categories)); } catch { } }, [categories]);
  useEffect(() => { try { localStorage.setItem("tf_profiles", JSON.stringify(profiles)); } catch { } }, [profiles]);
  useEffect(() => { try { localStorage.setItem("tf_dark", JSON.stringify(dark)); } catch { } }, [dark]);
  useEffect(() => { try { localStorage.setItem("tf_accent", JSON.stringify(accentIdx)); } catch { } }, [accentIdx]);
  useEffect(() => { try { localStorage.setItem("tf_lang", langKey); } catch { } }, [langKey]);
  useEffect(() => { try { localStorage.setItem("tf_goals", JSON.stringify(goals)); } catch { } }, [goals]);
  useEffect(() => { try { localStorage.setItem("tf_habits", JSON.stringify(habits)); } catch { } }, [habits]);
  useEffect(() => { try { localStorage.setItem("tf_notes", JSON.stringify(notes)); } catch { } }, [notes]);
  useEffect(() => { try { localStorage.setItem("tf_moods", JSON.stringify(moods)); } catch { } }, [moods]);
  useEffect(() => { try { localStorage.setItem("tf_wallpaper", wallpaper); } catch { } }, [wallpaper]);
  useEffect(() => { try { localStorage.setItem("tf_boardcols", JSON.stringify(boardColumns)); } catch { } }, [boardColumns]);
  useEffect(() => { try { localStorage.setItem("tf_boardcards", JSON.stringify(boardCards)); } catch { } }, [boardCards]);
  useEffect(() => { try { localStorage.setItem("tf_time", JSON.stringify(timeEntries)); } catch { } }, [timeEntries]);


  // == Social Share Card ==
  const generateShareCard = () => {
    const done = profileTasks.filter(t => t.done).length;
    const total = profileTasks.length;
    const streak = gamStats?.streak || 0;
    const pct = total ? Math.round((done / total) * 100) : 0;
    setShareStats({ done, total, streak, pct, name: userName || "Taskflow User" });
    setShowShareModal(true);
  };

  const shareAchievement = async () => {
    if (!shareStats) return;
    const text = `🔥 I completed ${shareStats.done} tasks today on Taskflow!\n⚡ ${shareStats.streak} day streak | ${shareStats.pct}% completion rate\n\nGet Taskflow — the ultimate productivity app by LIBI Labs 🚀`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Taskflow Achievement", text, url: "https://taskflow-ultimate.netlify.app" });
      } else {
        await navigator.clipboard.writeText(text);
        showNotif("📋 Copied!", "Share text copied to clipboard");
      }
    } catch (e) { }
    setShowShareModal(false);
  };


  // == Request Notification Permission ==
  const requestNotifPermission = async () => {
    if (!("Notification" in window)) { showNotif("❌ Not supported", "Your browser doesn't support notifications"); return; }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if (result === "granted") showNotif("🔔 Notifications enabled!", "You'll get reminders even when the app is in background");
    else showNotif("❌ Blocked", "Enable notifications in your browser settings");
  };


  // == Weekly Review ==
  const WeeklyReviewPage = () => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
    const weekDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const dayTasks = tasks.filter(t => t.profileId === activeProfile && new Date(t.createdAt).toISOString().slice(0, 10) === ds);
      const doneTasks = dayTasks.filter(t => t.done);
      return { date: ds, day: d.toLocaleDateString("en", { weekday: "short" }), total: dayTasks.length, done: doneTasks.length, isToday: ds === todayStr() };
    });
    const weekDone = weekDays.reduce((a, d) => a + d.done, 0);
    const weekTotal = weekDays.reduce((a, d) => a + d.total, 0);
    const bestDay = weekDays.reduce((a, b) => b.done > a.done ? b : a, weekDays[0]);
    const pct = weekTotal ? Math.round((weekDone / weekTotal) * 100) : 0;
    const mood7 = moods.filter(m => weekDays.some(d => d.date === m.date));
    const avgEnergy = mood7.length ? (mood7.reduce((a, m) => a + m.energy, 0) / mood7.length).toFixed(1) : "—";

    return (
      <div style={{ padding: "18px 18px 100px" }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, marginBottom: 4 }}>📅 Weekly Review</div>
        <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 20 }}>{weekStart.toLocaleDateString("en", { month: "long", day: "numeric" })} — {now.toLocaleDateString("en", { month: "long", day: "numeric" })}</div>

        {/* Hero stat */}
        <div style={{ background: `linear-gradient(135deg,var(--acc)22,var(--acc2)11)`, border: "1px solid var(--acc)44", borderRadius: 22, padding: "24px 20px", marginBottom: 16, textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -30, right: -30, fontSize: 100, opacity: .06 }}>📅</div>
          <div style={{ fontSize: 56, fontWeight: 900, color: "var(--acc)", lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 13, color: "var(--t2)", marginTop: 4 }}>completion rate this week</div>
          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 6 }}>{weekDone} of {weekTotal} tasks done</div>
        </div>

        {/* Day bars */}
        <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 14 }}>Daily Breakdown</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
            {weekDays.map(d => {
              const h = d.total ? Math.max(8, (d.done / d.total) * 100) : 6;
              return (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600 }}>{d.done || ""}</div>
                  <div style={{ width: "100%", background: "var(--s3)", borderRadius: 8, height: 80, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                    <div style={{ width: "100%", height: `${h}%`, background: d.isToday ? "var(--acc)" : "var(--acc)88", borderRadius: 8, transition: "height .6s cubic-bezier(.34,1.56,.64,1)", minHeight: d.done ? 4 : 0 }} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: d.isToday ? 800 : 600, color: d.isToday ? "var(--acc)" : "var(--t3)" }}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { icon: "🏆", label: "Best Day", val: bestDay.done > 0 ? bestDay.day : "—" },
            { icon: "😊", label: "Avg Mood", val: avgEnergy },
            { icon: "🔥", label: "Streak", val: `${gamStats?.streak || 0}d` },
          ].map(s => (
            <div key={s.label} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "14px 10px", textAlign: "center" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{s.val}</div>
              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Motivational message */}
        <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "18px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>{pct >= 80 ? "🌟" : pct >= 50 ? "💪" : "🌱"}</div>
          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, marginBottom: 8 }}>
            {pct >= 80 ? "Outstanding week!" : pct >= 50 ? "Solid progress!" : "Keep pushing!"}
          </div>
          <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>
            {pct >= 80 ? "You crushed it this week. Your consistency is building something great." :
              pct >= 50 ? "More than half your tasks done — that's real progress. Keep the momentum!" :
                "Every step forward counts. Tomorrow is a fresh start. You've got this!"}
          </div>
          <button onClick={generateShareCard} style={{ marginTop: 16, height: 42, padding: "0 20px", background: "var(--acc)", borderRadius: 12, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>
            🚀 Share My Week
          </button>
        </div>
      </div>
    );
  };


  // == Voice Input (Web Speech API) ==
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showNotif("❌ Not supported", "Voice input needs Chrome or Edge"); return; }
    const rec = new SR();
    rec.lang = langKey === "ar" ? "ar-SA" : langKey === "hi" ? "hi-IN" : langKey === "fr" ? "fr-FR" : langKey === "es" ? "es-ES" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    setIsListening(true);
    setVoiceTranscript("");
    haptic("medium");
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setVoiceTranscript(t);
      if (e.results[e.results.length - 1].isFinal) {
        setIsListening(false);
        const lower = t.toLowerCase().trim();

        // ── 1. ADD TASK ──
        if (/^(add task|remind me to|new task|i need to|create task|add|note to self)\s+/i.test(lower)) {
          const title = t.replace(/^(add task|remind me to|new task|i need to|create task|add|note to self)\s+/i, "").trim();
          if (title) {
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
            const hasTmr = /tomorrow/i.test(lower);
            const hasToday = /today|tonight/i.test(lower);
            const priority = /urgent|high priority|important/i.test(lower) ? "high" : /low priority/i.test(lower) ? "low" : "medium";
            const cleanTitle = title.replace(/\s*(today|tonight|tomorrow|high priority|low priority|urgent)\s*/gi, "").replace(/[.!?]$/, "").trim();
            const newT = {
              ...blankForm, title: cleanTitle,
              due: hasTmr ? tomorrow.toISOString().slice(0, 10) : hasToday ? todayStr() : "",
              priority, profileId: activeProfile, createdAt: Date.now(), done: false, id: uid()
            };
            setTasks(ts => [newT, ...ts]);
            showNotif("🎤 Task added!", cleanTitle);
            play("add"); haptic("success"); awardXP(5, "Voice task");
          }

          // ── 2. COMPLETE TASK BY NAME ──
        } else if (/^(complete|done|finish|mark done|check off|tick off|completed)\s+/i.test(lower)) {
          const query = lower.replace(/^(complete|done|finish|mark done|check off|tick off|completed)\s+/i, "").trim();
          const match = profileTasks.filter(t => !t.done).find(t =>
            t.title.toLowerCase().includes(query) ||
            query.split(" ").filter(w => w.length > 3).some(w => t.title.toLowerCase().includes(w))
          );
          if (match) {
            toggle(match.id);
            showNotif("🎤 Task completed!", match.title);
            haptic("success");
          } else {
            showNotif("🎤 Task not found", `Couldn't find: "${query}"`);
            haptic("error");
          }

          // ── 3. COMPLETE ALL TODAY'S TASKS ──
        } else if (/complete all|finish all|done all|mark all done/i.test(lower)) {
          const todayTasks = profileTasks.filter(t => !t.done && t.due === todayStr());
          if (todayTasks.length > 0) {
            todayTasks.forEach(t => toggle(t.id));
            showNotif(`🎤 ${todayTasks.length} tasks completed!`, "All today's tasks done");
            fireConfetti(); haptic("success");
          } else {
            showNotif("🎤 No tasks due today", "Nothing to complete!");
          }

          // ── 4. NAVIGATE ──
        } else if (/^(open|go to|show|navigate to|switch to)\s+/i.test(lower)) {
          const dest = lower.replace(/^(open|go to|show|navigate to|switch to)\s+/i, "").trim();
          const tabMap = { tasks: "tasks", goals: "goals", habits: "habits", notes: "notes", calendar: "calendar", stats: "stats", board: "board", mood: "mood", focus: "focus", planner: "planner", finance: "finance", collaborate: "collab", team: "collab", settings: "settings" };
          const found = Object.entries(tabMap).find(([k]) => dest.includes(k));
          if (found) { setTab(found[1]); showNotif("🎤 Navigated", found[1]); }

          // ── 5. START TIMER / POMODORO ──
        } else if (/start (timer|pomodoro|focus|session)/i.test(lower)) {
          setTab("time");
          setPomoRunning(true);
          showNotif("🎤 Pomodoro started!", "25 min focus session running 🍅");
          haptic("medium");

          // ── 6. STOP TIMER ──
        } else if (/stop (timer|pomodoro|focus)/i.test(lower)) {
          setPomoRunning(false);
          stopTimer();
          showNotif("🎤 Timer stopped", "");

          // ── 7. SHOW OVERDUE ──
        } else if (/overdue|what.s late|what.s overdue/i.test(lower)) {
          setTab("overdue");
          showNotif("🎤 Showing overdue tasks", "");

          // ── 8. HOW MANY TASKS ──
        } else if (/how many tasks|task count|task list count/i.test(lower)) {
          const active2 = profileTasks.filter(t => !t.done).length;
          showNotif(`🎤 You have ${active2} active tasks`, `${profileTasks.filter(t => t.done).length} already completed`);

          // ── 9. SEND TO LIBI ──
        } else {
          if (tab !== "bot") setTab("bot");
          sendChat(t);
        }
      }
    };
    rec.onerror = () => { setIsListening(false); showNotif("❌ Voice error", "Try again"); };
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  // == Dark/Light animated toggle ==
  const toggleDark = () => {
    setDarkAnimating(true);
    setTimeout(() => { setDark(d => !d); setDarkAnimating(false); }, 300);
    play("tap"); haptic("light");
  };

  // == Streak milestone detector ==
  useEffect(() => {
    const streak = gamStats?.streak || 0;
    if ([7, 14, 30, 60, 100, 365].includes(streak)) {
      setStreakMilestone(streak);
      fireConfetti();
      setTimeout(() => setStreakMilestone(null), 4000);
    }
  }, [gamStats?.streak, fireConfetti]);


  // == Complete Onboarding ==
  function completeOnboarding() {
    // Save name to profiles
    if (onboardName.trim()) {
      setProfiles(ps => ps.map((p, i) => i === 0 ? { ...p, name: onboardName.trim() } : p));
      setLibiMemory(m => ({
        ...m, name: onboardName.trim(), wakeTime: onboardWake,
        occupation: onboardUse === "study" ? "student" : onboardUse === "work" ? "professional" : "individual",
        facts: [`My name is ${onboardName.trim()}`, `I wake up at ${onboardWake}`, `I use Taskflow for ${onboardUse}`]
      }));
    }
    // Add first task if entered
    if (onboardTask.trim()) {
      const t2 = {
        id: uid(), title: onboardTask.trim(), notes: "", priority: "high", categoryId: "work",
        due: todayStr(), done: false, tags: [], subtasks: [], starred: false, recurring: "never",
        reminder: false, profileId: activeProfile, createdAt: Date.now(), timeEstimate: 0, dependsOn: []
      };
      setTasks(ts => [t2, ...ts]);
      awardXP(20, "First task added");
    }
    // Request notifications
    if ("Notification" in window) Notification.requestPermission();
    // Mark onboarded
    localStorage.setItem("tf_onboarded", "1");
    setHasOnboarded(true);
    play("complete"); fireConfetti();
    showNotif(`🎉 Welcome to Taskflow, ${onboardName.trim() || "friend"}!`, "LIBI is ready to help you crush it today 🚀");
  };


  // == Email Weekly Digest ==
  function sendEmailDigest() {
    const email = prompt("Enter your email address:");
    if (!email || !email.includes("@")) return;
    const done7 = profileTasks.filter(t => t.done && t.createdAt && (Date.now() - new Date(t.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length;
    const active = profileTasks.filter(t => !t.done).length;
    const streak = gamStats.streak || 0;
    const subject = `Your Taskflow Weekly Digest 📊`;
    const body = `Hi ${libiMemory.name || "there"}!%0A%0AHere's your week in Taskflow:%0A%0A` +
      `✅ Tasks completed: ${done7}%0A` +
      `⏳ Active tasks: ${active}%0A` +
      `🔥 Current streak: ${streak} days%0A` +
      `📊 Completion rate: ${pct}%25%0A%0A` +
      `Keep up the amazing work!%0A%0A— LIBI, your AI productivity assistant%0A%0ATaskflow by LIBI Labs%0Ahttps://cute-scone-3c8acb.netlify.app`;
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    showNotif("📧 Email digest ready!", "Check your email app to send it");
  };


  return (
    <>

      {/* PIN SCREEN */}
      {locked && pinEnabled && (
        <div className="pin-screen">
          <div className="pin-icon">🔒</div>
          <div className="pin-title">{t.enterPin}</div>
          <div className="pin-dots">{[0, 1, 2, 3].map(i => <div key={i} className={`pin-dot ${i < pinInput.length ? "filled" : ""}`} />)}</div>
          {pinError && <div className="pin-error">{pinError}</div>}
          <div className="pin-pad">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k, i) => (
              <div key={i} className="pin-key" style={k === "" ? { opacity: 0, pointerEvents: "none" } : {}} onClick={() => k === "⌫" ? handlePinDel() : k !== "" && handlePinKey(String(k))}>{k}</div>
            ))}
          </div>
        </div>
      )}

      {!(locked && pinEnabled) && (
        <>
          {/* CMD PALETTE */}
          {showCmdPalette && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.82)", backdropFilter: "blur(18px)", zIndex: 600, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "8vh" }} onClick={() => setShowCmdPalette(false)}>
              <div style={{ background: dark ? "rgba(8,10,20,0.98)" : "rgba(255,255,255,0.98)", border: `1px solid ${accent.v}40`, borderRadius: 22, width: "90%", maxWidth: 540, boxShadow: `0 24px 60px rgba(0,0,0,.7)`, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderBottom: "1px solid var(--b1)" }}>
                  <span style={{ fontSize: 20, color: accent.v }}>⌘</span>
                  <input ref={cmdRef} value={cmdQuery} onChange={e => setCmdQuery(e.target.value)} placeholder="Search commands, tasks…" style={{ flex: 1, fontSize: 15, fontWeight: 500, color: "var(--t1)", background: "none", border: "none", outline: "none" }} />
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 7, background: "var(--s3)", color: "var(--t3)", fontWeight: 700 }}>ESC</span>
                </div>
                <div style={{ maxHeight: 360, overflowY: "auto", padding: "6px 0" }}>
                  {taskResults.length > 0 && <>
                    <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: 1.2, textTransform: "uppercase", padding: "8px 18px 4px" }}>Tasks</div>
                    {taskResults.map(task => (
                      <div key={task.id} onClick={() => { setDetailTaskId(task.id); setShowCmdPalette(false); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = `${accent.v}12`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontSize: 16 }}>{PRIORITIES[task.priority]?.icon}</span>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{task.title}</div>{task.due && <div style={{ fontSize: 11, color: "var(--t3)" }}>Due {fmtDate(task.due)}</div>}</div>
                        <span style={{ fontSize: 11, color: "var(--t3)" }}>open</span>
                      </div>
                    ))}
                    <div style={{ height: 1, background: "var(--b1)", margin: "4px 0" }} />
                  </>}
                  {Object.entries(filteredCmds.reduce((g, c) => ({ ...g, [c.group]: [...(g[c.group] || []), c] }), {})).map(([group, cmds]) => (
                    <div key={group}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: 1.2, textTransform: "uppercase", padding: "8px 18px 4px" }}>{group}</div>
                      {cmds.map((cmd, i) => (
                        <div key={i} onClick={cmd.action} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = `${accent.v}12`} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <span style={{ fontSize: 18, width: 28, textAlign: "center" }}>{cmd.icon}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, flex: 1, color: "var(--t1)" }}>{cmd.label}</span>
                          <span style={{ fontSize: 10, color: accent.v, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: `${accent.v}18` }}>{cmd.group}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {filteredCmds.length === 0 && taskResults.length === 0 && <div style={{ textAlign: "center", padding: "28px", color: "var(--t3)" }}>No results for "{cmdQuery}"</div>}
                </div>
                <div style={{ padding: "10px 18px", borderTop: "1px solid var(--b1)", display: "flex", gap: 16, fontSize: 11, color: "var(--t3)" }}>
                  <span>↵ select</span><span>ESC close</span>
                  <span style={{ marginLeft: "auto", color: accent.v, fontWeight: 700 }}>⌘K to open</span>
                </div>
              </div>
            </div>
          )}

          {/* FOCUS MODE */}
          {showFocusMode && (() => {
            const focusTask = focusTaskId ? tasks.find(t => t.id === focusTaskId) : profileTasks.filter(t => !t.done)[0];
            const digest = getDailyDigest();
            return (
              <div style={{ position: "fixed", inset: 0, background: "linear-gradient(160deg,#000008,#0a0020,#1a0040,#0d0030)", zIndex: 500, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
                {[...Array(25)].map((_, i) => <div key={i} style={{ position: "absolute", width: isForest ? (i % 4 === 0 ? 8 : 5) : (i % 3 === 0 ? 3 : 2), height: isForest ? (i % 4 === 0 ? 8 : 5) : (i % 3 === 0 ? 3 : 2), borderRadius: isForest ? "3px 50%" : "50%", background: isForest ? (i % 3 === 0 ? "#4ade8088" : i % 3 === 1 ? "#22c55e60" : "#86efac50") : "#fff", opacity: .1 + Math.random() * .7, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`, animationDelay: `${Math.random() * 4}s`, pointerEvents: "none" }} />)}
                <button onClick={() => setShowFocusMode(false)} style={{ position: "absolute", top: 20, right: 20, width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)", color: "rgba(255,255,255,.7)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                <div style={{ position: "absolute", top: 20, left: 24, fontFamily: "'Instrument Serif',serif", fontSize: 22, color: accent.v }}>{String(liveHour).padStart(2, "0")}:{String(liveMin).padStart(2, "0")}</div>
                {focusTask ? (
                  <div style={{ textAlign: "center", maxWidth: 480, padding: "0 24px", zIndex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: accent.v, letterSpacing: 1.8, textTransform: "uppercase", marginBottom: 12 }}>🌌 FOCUS MODE</div>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 30, color: "#eceeff", lineHeight: 1.3, marginBottom: 14 }}>{focusTask.title}</div>
                    {focusTask.notes && <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", lineHeight: 1.7, marginBottom: 16 }}>{focusTask.notes}</div>}
                    <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
                      <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 16, padding: "12px 20px", border: "1px solid rgba(255,255,255,.1)" }}>
                        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: accent.v }}>{activeTimer?.taskId === focusTask.id ? (activeTimer ? `${String(Math.floor((Date.now() - activeTimer.startedAt) / 60000)).padStart(2, "0")}:${String(Math.floor(((Date.now() - activeTimer.startedAt) % 60000) / 1000)).padStart(2, "0")}` : "00:00") : "00:00"}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 2 }}>session</div>
                      </div>
                      <div style={{ background: "rgba(255,255,255,.06)", borderRadius: 16, padding: "12px 20px", border: "1px solid rgba(255,255,255,.1)" }}>
                        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#6bcb77" }}>{fmtTime(getTaskTime(focusTask.id)).split(" ")[0] || "0m"}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 2 }}>total</div>
                      </div>
                    </div>
                    <textarea value={focusNotes} onChange={e => setFocusNotes(e.target.value)} placeholder="Notes while you work…" style={{ width: "100%", maxWidth: 400, height: 72, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 13, padding: "11px 14px", color: "#eceeff", fontSize: 13, resize: "none", marginBottom: 18 }} />
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                      <button onClick={() => activeTimer?.taskId === focusTask.id ? stopTimer() : startTimer(focusTask.id)} style={{ height: 42, padding: "0 20px", background: activeTimer?.taskId === focusTask.id ? "rgba(255,107,107,.22)" : "rgba(124,109,250,.22)", border: `1.5px solid ${activeTimer?.taskId === focusTask.id ? "#ff6b6b" : accent.v}`, borderRadius: 12, color: activeTimer?.taskId === focusTask.id ? "#ff6b6b" : accent.v, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        {activeTimer?.taskId === focusTask.id ? "⏹ Stop" : "▶ Start"}
                      </button>
                      <button onClick={() => { toggle(focusTask.id); setShowFocusMode(false); }} style={{ height: 42, padding: "0 20px", background: "rgba(107,203,119,.18)", border: "1.5px solid #6bcb77", borderRadius: 12, color: "#6bcb77", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>✅ Done</button>
                      <button onClick={() => { const n = profileTasks.filter(t => !t.done && t.id !== focusTask.id)[0]; if (n) setFocusTaskId(n.id); }} style={{ height: 42, padding: "0 16px", background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.15)", borderRadius: 12, color: "rgba(255,255,255,.5)", fontSize: 13, cursor: "pointer" }}>⏭ Next</button>
                    </div>
                  </div>
                ) : <div style={{ textAlign: "center", color: "rgba(255,255,255,.5)" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: isForest ? "#14532d" : "#eceeff" }}>All done!</div>
                </div>}
                <div style={{ position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 14, background: "rgba(255,255,255,.05)", borderRadius: 16, padding: "10px 18px", border: "1px solid rgba(255,255,255,.08)" }}>
                  {[{ icon: "⏳", val: digest.dueToday.length, label: "due" }, { icon: "🔥", val: `${digest.streak}d`, label: "streak" }, { icon: "✅", val: digest.completedToday.length, label: "done" }].map(s => (
                    <div key={s.label} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 14 }}>{s.icon}</div>
                      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 17, color: accent.v }}>{s.val}</div>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* TEMPLATES MODAL */}
          {showTemplateModal && (
            <div className="overlay" onClick={() => setShowTemplateModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">📋 Task Templates</div><button className="ic-btn" onClick={() => setShowTemplateModal(false)}>✕</button></div>
                <div className="m-body">
                  <div style={{ fontSize: 12.5, color: "var(--t2)", marginBottom: 2 }}>Instantly add a curated set of tasks for common workflows.</div>
                  {TASK_TEMPLATES.map(tmpl => (
                    <div key={tmpl.id} style={{ background: `${tmpl.color}10`, border: `1.5px solid ${tmpl.color}28`, borderRadius: 16, padding: "14px", cursor: "pointer", transition: "all .2s", marginBottom: 8 }} onClick={() => applyTemplate(tmpl)} onMouseEnter={e => e.currentTarget.style.borderColor = `${tmpl.color}65`} onMouseLeave={e => e.currentTarget.style.borderColor = `${tmpl.color}28`}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: `${tmpl.color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tmpl.icon}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)" }}>{tmpl.name}</div>
                          <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{tmpl.desc}</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: tmpl.color, background: `${tmpl.color}18`, padding: "3px 10px", borderRadius: 20, flexShrink: 0 }}>{tmpl.tasks.length} tasks</div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {tmpl.tasks.slice(0, 3).map((task, i) => <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: `${tmpl.color}16`, color: tmpl.color }}>{task.slice(0, 28)}{task.length > 28 ? "..." : ""}</span>)}
                        {tmpl.tasks.length > 3 && <span style={{ fontSize: 10, color: "var(--t3)" }}>+{tmpl.tasks.length - 3} more</span>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowTemplateModal(false)}>Close</button></div>
              </div>
            </div>
          )}

          {/* == ✦ AI NATURAL LANGUAGE TASK EDITOR == */}
          {showAiNL && (
            <div className="overlay" onClick={() => { setShowAiNL(false); setAiNLResult(null); setAiNLInput(""); }}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                <div className="drag" />
                <div className="m-head">
                  <div className="m-title">✦ AI Task Editor</div>
                  <button className="ic-btn" onClick={() => { setShowAiNL(false); setAiNLResult(null); setAiNLInput(""); }}>✕</button>
                </div>
                <div className="m-body">
                  <div style={{ fontSize: 12.5, color: "var(--t2)", lineHeight: 1.6, marginBottom: 4 }}>
                    Type a command in plain English — the AI will figure out what to do.
                  </div>
                  {/* Examples */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                    {["Move my work tasks to tomorrow", "Complete all high priority tasks", "Set learning tasks to high priority", "Delete all completed tasks", "Star all overdue tasks"].map(ex => (
                      <button key={ex} onClick={() => { setAiNLInput(ex); setAiNLResult(parseNaturalLanguageCommand(ex)); }} style={{ fontSize: 10.5, padding: "4px 10px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", border: "1px solid var(--acc)", cursor: "pointer", fontWeight: 600 }}>{ex}</button>
                    ))}
                  </div>
                  {/* Input */}
                  <div>
                    <div className="f-lbl">Your command</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="f-in" autoFocus placeholder='e.g. "Move my work tasks to tomorrow"' value={aiNLInput} onChange={e => { setAiNLInput(e.target.value); if (e.target.value.trim().length > 5) setAiNLResult(parseNaturalLanguageCommand(e.target.value)); else setAiNLResult(null); }} onKeyDown={e => e.key === "Enter" && aiNLResult && !aiNLResult.error && executeNLCommand()} style={{ flex: 1 }} />
                    </div>
                  </div>
                  {/* Result preview */}
                  {aiNLResult && (
                    aiNLResult.error ? (
                      <div style={{ background: "rgba(255,107,107,.12)", border: "1px solid rgba(255,107,107,.3)", borderRadius: 13, padding: "12px 14px", fontSize: 13, color: "var(--red)" }}>{aiNLResult.error}</div>
                    ) : (
                      <div style={{ background: `${accent.v}12`, border: `1.5px solid ${accent.v}30`, borderRadius: 14, padding: "14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: accent.v, marginBottom: 10 }}>✅ {aiNLResult.preview}</div>
                        <div style={{ fontSize: 11.5, color: "var(--t3)", marginBottom: 10 }}>Affected tasks ({aiNLResult.affected.length}):</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                          {aiNLResult.affected.slice(0, 8).map(t => (
                            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--s2)", borderRadius: 10 }}>
                              <span style={{ fontSize: 13 }}>{PRIORITIES[t.priority]?.icon}</span>
                              <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, color: "var(--t1)" }}>{t.title}</span>
                              {t.due && <span style={{ fontSize: 10.5, color: "var(--t3)" }}>{fmtDate(t.due)}</span>}
                            </div>
                          ))}
                          {aiNLResult.affected.length > 8 && <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center" }}>+{aiNLResult.affected.length - 8} more</div>}
                        </div>
                      </div>
                    )
                  )}
                </div>
                <div className="m-foot">
                  <button className="btn-c" onClick={() => { setShowAiNL(false); setAiNLResult(null); setAiNLInput(""); }}>Cancel</button>
                  <button className="btn-s" disabled={!aiNLResult || !!aiNLResult.error} onClick={executeNLCommand}>✦ Execute</button>
                </div>
              </div>
            </div>
          )}


          {/* == ICS IMPORT MODAL == */}
          {showICSModal && (
            <div className="overlay" onClick={() => setShowICSModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">📅 Import Calendar</div><button className="ic-btn" onClick={() => setShowICSModal(false)}>✕</button></div>
                <div className="m-body">
                  <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.7, marginBottom: 14 }}>Export your Google Calendar as a <strong>.ics file</strong> — each event becomes a task with the correct due date.</div>
                  <div style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 12, padding: "12px 14px", marginBottom: 14, fontSize: 12, color: "var(--t2)", lineHeight: 1.9 }}>
                    <div style={{ fontWeight: 700, color: "var(--t1)", marginBottom: 6 }}>How to export:</div>
                    <div>1. Open <strong>calendar.google.com</strong></div>
                    <div>2. Settings ⚙️ → <strong>Import &amp; Export</strong></div>
                    <div>3. Click <strong>Export</strong> → extract the zip</div>
                    <div>4. Upload the <strong>.ics file</strong> below ↓</div>
                  </div>
                  <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px", background: `${accent.v}10`, border: `2px dashed ${accent.v}40`, borderRadius: 14, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.borderColor = accent.v} onMouseLeave={e => e.currentTarget.style.borderColor = `${accent.v}40`}>
                    <div style={{ fontSize: 36 }}>📂</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: accent.v }}>Choose .ics file</div>
                    <div style={{ fontSize: 11, color: "var(--t3)" }}>Google · Apple · Outlook</div>
                    <input type="file" accept=".ics" style={{ display: "none" }} onChange={importICS} />
                  </label>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowICSModal(false)}>Cancel</button></div>
              </div>
            </div>
          )}

          {/* == SPLASH SCREEN == */}
          {showSplash && onboardStep === 0 && (
            <div style={{ position: "fixed", inset: 0, background: "linear-gradient(135deg,#0a0a1a 0%,#1a0a2e 50%,#0d1a3e 100%)", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 0 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 80, marginBottom: 8, filter: "drop-shadow(0 0 30px #7c6dfa)", animation: "splash-pulse 2s ease-in-out infinite" }}>✦</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 42, color: "#fff", letterSpacing: -1, marginBottom: 4 }}>Taskflow</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", letterSpacing: 3, textTransform: "uppercase", marginBottom: 48 }}>by LIBI Labs</div>
                <div style={{ width: 48, height: 48, border: "3px solid transparent", borderTopColor: "#7c6dfa", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
              </div>
              <style>{`
            @keyframes splash-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.08);opacity:.8} }
            @keyframes spin { to{transform:rotate(360deg)} }
          `}</style>
            </div>
          )}

          {/* == GOOGLE SIGN-IN SPLASH == */}
          {showAuthScreen && !authUser && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, overflow: "hidden", background: "linear-gradient(160deg,#020008 0%,#08001a 35%,#100030 65%,#1a0048 100%)" }}>

              {/* ── Inline keyframes for star entrance ── */}
              <style>{`
            @keyframes starRiseUp{
              0%  { transform:translateY(220px) scale(0.15); opacity:0; filter:blur(24px); }
              35% { opacity:1; filter:blur(2px); }
              65% { transform:translateY(-22px) scale(1.12); filter:blur(0); }
              80% { transform:translateY(8px) scale(0.96); }
              100%{ transform:translateY(0) scale(1); opacity:1; }
            }
            @keyframes starBurstFlash{
              0%,58%{ box-shadow: 0 0 40px ${accent.v}40, 0 0 80px ${accent.v}20; }
              68%   { box-shadow: 0 0 120px #fffc, 0 0 240px #fff8, 0 0 400px #fff3,
                                  0 0 500px ${accent.v}90, 0 0 800px ${accent.v}50; }
              80%   { box-shadow: 0 0 80px ${accent.v}cc, 0 0 160px ${accent.v}70,
                                  0 0 300px ${accent.v}40, 0 0 500px ${accent.v}20; }
              100%  { box-shadow: 0 0 60px ${accent.v}80, 0 0 120px ${accent.v}44,
                                  0 0 200px ${accent.v}22, inset 0 0 30px rgba(255,255,255,0.3); }
            }
            @keyframes starGlowPulse{
              0%,100%{ box-shadow: 0 0 60px ${accent.v}80, 0 0 120px ${accent.v}44,
                                   0 0 200px ${accent.v}22, inset 0 0 30px rgba(255,255,255,0.3); }
              50%    { box-shadow: 0 0 90px ${accent.v}cc, 0 0 180px ${accent.v}70,
                                   0 0 320px ${accent.v}40, 0 0 500px ${accent.v}18,
                                   inset 0 0 44px rgba(255,255,255,0.55); }
            }
            @keyframes ringSpinIn{
              0%  { opacity:0; transform:scale(0.2) rotate(-200deg); }
              60% { opacity:0.3; }
              100%{ opacity:0.6; transform:scale(1) rotate(0deg); }
            }
            @keyframes raysReveal{
              0%,58% { opacity:0; transform:scaleX(0); }
              75%    { opacity:1; transform:scaleX(1.25); }
              100%   { opacity:0.7; transform:scaleX(1); }
            }
            @keyframes titleRise{
              0%,50% { opacity:0; transform:translateY(28px); }
              78%    { opacity:1; transform:translateY(-4px); }
              100%   { opacity:1; transform:translateY(0); }
            }
            @keyframes subtitleRise{
              0%,58% { opacity:0; transform:translateY(20px); }
              82%    { opacity:1; transform:translateY(-2px); }
              100%   { opacity:1; transform:translateY(0); }
            }
            @keyframes cardFadeUp{
              0%,68% { opacity:0; transform:translateY(36px); }
              88%    { opacity:1; transform:translateY(-4px); }
              100%   { opacity:1; transform:translateY(0); }
            }
            @keyframes nebulaReveal{
              0%,40%  { opacity:0; }
              100%    { opacity:1; }
            }
            @keyframes screenShake{
              0%,100%{ transform:translate(0,0); }
              20%    { transform:translate(-3px,2px); }
              40%    { transform:translate(3px,-2px); }
              60%    { transform:translate(-2px,3px); }
              80%    { transform:translate(2px,-1px); }
            }
          `}</style>

              {/* ── Deep star field ── */}
              {[...Array(65)].map((_, i) => {
                const size = i < 8 ? 3 : i < 22 ? 2 : 1;
                const op = i < 8 ? 0.95 : i < 22 ? 0.6 : 0.25 + Math.random() * 0.2;
                return <div key={i} style={{ position: "absolute", width: size, height: size, borderRadius: "50%", background: "#fff", opacity: op, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `twinkle ${1.5 + Math.random() * 4}s ease-in-out infinite`, animationDelay: `${Math.random() * 5}s`, pointerEvents: "none" }} />;
              })}

              {/* ── Nebula glow clouds — revealed after burst ── */}
              <div style={{ position: "absolute", width: 600, height: 600, borderRadius: "50%", background: `radial-gradient(circle,${accent.v}18 0%,transparent 65%)`, top: "5%", left: "50%", transform: "translateX(-50%)", pointerEvents: "none", animation: "nebulaReveal 2.4s ease-out both" }} />
              <div style={{ position: "absolute", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,#ff6b9d12 0%,transparent 70%)", bottom: "18%", right: "8%", pointerEvents: "none", animation: "nebulaReveal 2.8s ease-out both" }} />
              <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: `radial-gradient(circle,${accent.g}12 0%,transparent 70%)`, top: "28%", left: "4%", pointerEvents: "none", animation: "nebulaReveal 3s ease-out both" }} />

              {/* ── THE RISING STAR ── */}
              <div style={{
                position: "relative", marginBottom: 8, zIndex: 1,
                animation: "starRiseUp 1.6s cubic-bezier(0.22,1,0.36,1) both",
              }}>
                {/* Conic spin ring — appears after burst */}
                <div style={{
                  position: "absolute", inset: -44, borderRadius: "50%",
                  background: `conic-gradient(${accent.v}00,${accent.v}50,${accent.g}45,${accent.v}00,${accent.v}00)`,
                  animation: "ringSpinIn 1s 1.35s ease-out both, spin 9s 2.4s linear infinite",
                  pointerEvents: "none",
                }} />
                {/* Inner pulse rings */}
                <div style={{ position: "absolute", inset: -22, borderRadius: "50%", border: `1.5px solid ${accent.v}35`, animation: "galaxyPulse 3s 2.5s ease-in-out infinite", pointerEvents: "none", opacity: 0, animationFillMode: "forwards" }} />
                <div style={{ position: "absolute", inset: -11, borderRadius: "50%", border: `1px solid ${accent.v}22`, animation: "galaxyPulse 3s 2.8s ease-in-out infinite", pointerEvents: "none", opacity: 0, animationFillMode: "forwards" }} />

                {/* THE STAR CIRCLE — burst flash then pulse */}
                <div style={{
                  width: 118, height: 118, borderRadius: "50%",
                  background: `radial-gradient(circle at 33% 33%, #fffc 0%, ${accent.v} 38%, ${accent.g} 68%, #1a0040 100%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: 2,
                  animation: "starBurstFlash 1.6s cubic-bezier(0.22,1,0.36,1) both, starGlowPulse 2.8s 2.6s ease-in-out infinite",
                }}>
                  {/* White flash overlay — fades out after burst */}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "radial-gradient(circle,#ffff 0%,#fff0 60%)",
                    animation: "starBurstFlash 1.6s cubic-bezier(0.22,1,0.36,1) both",
                    opacity: 0,
                    animationName: "none",
                    // separate fade
                  }} />
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: "rgba(255,255,255,0.9)",
                    animation: "fadeOut 0.5s 1.1s ease-out both",
                  }} />
                  <style>{`@keyframes fadeOut{0%{opacity:.55}100%{opacity:0}}`}</style>

                  {/* Star SVG */}
                  <svg width="64" height="64" viewBox="0 0 60 60" style={{ position: "relative", zIndex: 3, filter: "drop-shadow(0 0 14px rgba(255,255,255,1)) drop-shadow(0 0 6px rgba(255,255,255,0.8))" }}>
                    <polygon points="30,3 36.7,22.3 57,22.3 40.7,34.7 47.4,54 30,41.6 12.6,54 19.3,34.7 3,22.3 23.3,22.3" fill="white" fillOpacity="0.97" />
                  </svg>
                </div>

                {/* Sparkle rays — shoot out on burst */}
                {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                  <div key={angle} style={{
                    position: "absolute", top: "50%", left: "50%",
                    width: i % 2 === 0 ? 100 : 65, height: i % 2 === 0 ? 2 : 1.5,
                    background: `linear-gradient(90deg,${accent.v}80,transparent)`,
                    transformOrigin: "left center",
                    transform: `rotate(${angle}deg) translateY(-50%)`,
                    pointerEvents: "none",
                    animation: `raysReveal 1.6s cubic-bezier(0.22,1,0.36,1) both`,
                    animationDelay: `${0}s`,
                  }} />
                ))}

                {/* Extra sparkle dots that pop out at burst */}
                {[...Array(12)].map((_, i) => {
                  const angle2 = (i / 12) * 360;
                  const dist = 70 + Math.random() * 40;
                  const x = Math.cos(angle2 * Math.PI / 180) * dist;
                  const y = Math.sin(angle2 * Math.PI / 180) * dist;
                  return <div key={i} style={{
                    position: "absolute",
                    width: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
                    height: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
                    borderRadius: "50%",
                    background: "#fff",
                    top: "50%", left: "50%",
                    transform: `translate(${x}px,${y}px) translate(-50%,-50%)`,
                    opacity: 0,
                    animation: `sparkDot 0.6s ${0.95 + i * 0.03}s ease-out both`,
                    pointerEvents: "none",
                  }} />;
                })}
                <style>{`
              @keyframes sparkDot{
                0%  { opacity:0; transform:translate(-50%,-50%) scale(0); }
                40% { opacity:1; }
                100%{ opacity:0; transform:translate(${100}px,${50}px) translate(-50%,-50%) scale(0.3); }
              }
            `}</style>
              </div>

              {/* Title — rises in after star lands */}
              <div style={{ position: "relative", zIndex: 1, textAlign: "center", marginBottom: 28, animation: "titleRise 1.8s cubic-bezier(0.22,1,0.36,1) both" }}>
                <div style={{
                  fontFamily: "'Instrument Serif',serif", fontSize: 44, lineHeight: 1.05, marginBottom: 8,
                  background: `linear-gradient(135deg,#fff 0%,${accent.v} 45%,${accent.g} 100%)`,
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  filter: `drop-shadow(0 0 22px ${accent.v}70)`,
                }}>
                  Taskflow
                </div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,.45)", letterSpacing: 2.5, textTransform: "uppercase", fontWeight: 700, animation: "subtitleRise 2s cubic-bezier(0.22,1,0.36,1) both" }}>
                  Your AI-Powered Life OS
                </div>
              </div>

              {/* Sign in card — slides up last */}
              <div style={{ width: "100%", maxWidth: 340, position: "relative", zIndex: 1, animation: "cardFadeUp 2.2s cubic-bezier(0.22,1,0.36,1) both" }}>
                <div style={{ background: "rgba(255,255,255,.05)", backdropFilter: "blur(20px)", borderRadius: 24, padding: "24px 20px", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 24px 60px rgba(0,0,0,.6)" }}>

                  {/* Google — primary CTA */}
                  <button onClick={async () => {
                    setAuthError(""); setAuthLoading(true);
                    try {
                      const fb = await getFirebase();
                      if (!fb) { setAuthError("Could not reach Google. Check your internet."); setAuthLoading(false); return; }
                      await signInWithGoogle();
                    } catch (e) { setAuthError("Sign-in failed. Try again."); }
                    finally { setAuthLoading(false); }
                  }} disabled={authLoading}
                    style={{ width: "100%", height: 52, background: "#fff", borderRadius: 14, fontSize: 15, fontWeight: 700, color: "#1a1a1a", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14, boxShadow: "0 4px 24px rgba(0,0,0,.3)", transition: "transform .15s,box-shadow .15s", opacity: authLoading ? .6 : 1 }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.02)"; e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 4px 24px rgba(0,0,0,.3)"; }}>
                    <svg width="20" height="20" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
                    </svg>
                    {authLoading ? "Connecting…" : "Continue with Google"}
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.12)" }} />
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,.35)", fontWeight: 600, letterSpacing: 1 }}>OR</span>
                    <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,.12)" }} />
                  </div>

                  {/* Email option */}
                  {authMode === "email" ? (
                    <div>
                      <input value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="Email address" type="email"
                        style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1.5px solid rgba(255,255,255,.15)", borderRadius: 11, padding: "12px 14px", fontSize: 14, color: "#fff", outline: "none", marginBottom: 10, boxSizing: "border-box" }}
                        autoComplete="email" autoCapitalize="none" spellCheck="false" />
                      <div style={{ position: "relative", marginBottom: 12 }}>
                        <input value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Password (min 6 chars)" type={authPassword && authPassword.length > 0 ? "text" : "password"}
                          style={{ width: "100%", background: "rgba(255,255,255,.08)", border: "1.5px solid rgba(255,255,255,.15)", borderRadius: 11, padding: "12px 14px", fontSize: 14, color: "#fff", outline: "none", boxSizing: "border-box" }}
                          onKeyDown={e => { if (e.key === "Enter") { getFirebase().then(fb => { if (!fb) return; setAuthLoading(true); fb.auth.signInWithEmailAndPassword(authEmail, authPassword).then(() => showNotif("✅ Signed in!", authEmail)).catch(e => setAuthError(e.code === "auth/wrong-password" ? "Wrong password" : e.code === "auth/user-not-found" ? "No account" : e.message)).finally(() => setAuthLoading(false)); }); } }} />
                      </div>
                      {authError && <div style={{ color: "#ff8080", fontSize: 12, marginBottom: 10, padding: "8px 10px", background: "rgba(255,80,80,.12)", borderRadius: 8 }}>{authError}</div>}
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <button onClick={async () => { setAuthLoading(true); try { const fb = await getFirebase(); if (!fb) throw new Error("No connection"); await fb.auth.signInWithEmailAndPassword(authEmail, authPassword); showNotif("✅ Signed in!", authEmail); } catch (e) { setAuthError(e.code === "auth/wrong-password" ? "Wrong password — try again" : e.code === "auth/user-not-found" ? "No account with that email" : e.code === "auth/invalid-email" ? "Email not valid" : e.message); } finally { setAuthLoading(false); } }}
                          style={{ flex: 1, height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 11, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", opacity: authLoading ? .5 : 1 }}>Sign In</button>
                        <button onClick={async () => { setAuthLoading(true); try { const fb = await getFirebase(); if (!fb) throw new Error("No connection"); await fb.auth.createUserWithEmailAndPassword(authEmail, authPassword); showNotif("🎉 Welcome!", authEmail); } catch (e) { setAuthError(e.code === "auth/email-already-in-use" ? "Email already has an account" : e.code === "auth/weak-password" ? "Min 6 characters needed" : e.message); } finally { setAuthLoading(false); } }}
                          style={{ flex: 1, height: 44, background: "rgba(255,255,255,.1)", borderRadius: 11, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.8)", border: "1px solid rgba(255,255,255,.2)", cursor: "pointer" }}>Sign Up</button>
                      </div>
                      <button onClick={() => setAuthMode("splash")} style={{ width: "100%", height: 36, background: "none", border: "none", color: "rgba(255,255,255,.3)", fontSize: 12, cursor: "pointer" }}>← Back</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button onClick={() => setAuthMode("email")}
                        style={{ width: "100%", height: 48, background: "rgba(255,255,255,.08)", borderRadius: 13, fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,.7)", border: "1px solid rgba(255,255,255,.15)", cursor: "pointer", transition: "all .2s" }}>
                        ✉️ Use Email & Password
                      </button>
                      <button onClick={continueAsGuest}
                        style={{ width: "100%", height: 48, background: "transparent", borderRadius: 13, fontSize: 14, fontWeight: 500, color: "rgba(255,255,255,.35)", border: "1px solid rgba(255,255,255,.08)", cursor: "pointer" }}>
                        Continue as Guest
                      </button>
                    </div>
                  )}
                </div>

                {authError && authMode !== "email" && <div style={{ color: "#ff8080", fontSize: 12, marginTop: 10, textAlign: "center" }}>{authError}</div>}

                <div style={{ marginTop: 20, fontSize: 11, color: "rgba(255,255,255,.22)", textAlign: "center", lineHeight: 1.8 }}>
                  By continuing you agree to our Privacy Policy & Terms
                </div>
              </div>
            </div>
          )}

          {/* == ONBOARDING FLOW == */}
          {onboardStep > 0 && onboardStep <= 4 && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", backdropFilter: "blur(20px)", zIndex: 9000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
              {/* Progress dots */}
              <div style={{ display: "flex", gap: 8, marginBottom: 32 }}>
                {[1, 2, 3, 4].map(i => <div key={i} style={{ width: i === onboardStep ? 24 : 8, height: 8, borderRadius: 4, background: i <= onboardStep ? "var(--acc)" : "rgba(255,255,255,.2)", transition: "all .3s" }} />)}
              </div>

              {onboardStep === 1 && (
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontSize: 72, marginBottom: 16, filter: "drop-shadow(0 0 20px #7c6dfa)" }}>✦</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 34, color: "#fff", marginBottom: 12, lineHeight: 1.2 }}>Welcome to<br />Taskflow</div>
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,.65)", lineHeight: 1.7, marginBottom: 32 }}>The most personal task manager you've ever used. Built for focus, designed for you.</div>
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,.5)", marginBottom: 8 }}>What should I call you?</div>
                    <input autoFocus value={onboardName} onChange={e => setOnboardName(e.target.value)} onKeyDown={e => e.key === "Enter" && onboardName.trim() && setOnboardStep(2)} placeholder="Your name…" style={{ width: "100%", padding: "14px 18px", borderRadius: 14, background: "rgba(255,255,255,.1)", border: "1.5px solid rgba(255,255,255,.2)", color: "#fff", fontSize: 16, outline: "none", textAlign: "center" }} />
                  </div>
                  <button disabled={!onboardName.trim()} onClick={() => { setUserName(onboardName.trim()); localStorage.setItem("tf_username", onboardName.trim()); setOnboardStep(2); }} style={{ width: "100%", height: 52, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 14, fontSize: 15, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", opacity: onboardName.trim() ? 1 : .4, boxShadow: "0 8px 28px #7c6dfa60" }}>
                    Let's go →
                  </button>
                </div>
              )}

              {onboardStep === 2 && (
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>📋</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: "#fff", marginBottom: 12 }}>Smart Tasks</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.8, marginBottom: 32 }}>Add tasks with priorities, due dates, subtasks, reminders and categories. Swipe right to complete, left to delete on mobile. Double-tap for fullscreen Focus Mode.</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
                    {["🔴 High priority tasks — tackled first", "📅 Due dates with smart reminders", "🔄 Recurring tasks that auto-regenerate", "⭐ Star your most important ones"].map((f, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.08)", borderRadius: 12, padding: "11px 14px", textAlign: "left" }}>
                        <span style={{ fontSize: 13, color: "rgba(255,255,255,.8)" }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setOnboardStep(3)} style={{ width: "100%", height: 50, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 14, fontSize: 15, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 8px 28px #7c6dfa60" }}>Next →</button>
                </div>
              )}

              {onboardStep === 3 && (
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>✦</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: "#fff", marginBottom: 12 }}>Meet LIBI</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.8, marginBottom: 32 }}>Your personal AI, built right in. Ask me anything — plan your day, get motivated, break down goals. I work 100% offline, always.</div>
                  <div style={{ background: "rgba(124,109,250,.15)", border: "1px solid #7c6dfa40", borderRadius: 16, padding: "16px", marginBottom: 32, textAlign: "left" }}>
                    <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, marginBottom: 10 }}>Try asking LIBI:</div>
                    {["Plan my day", "Remind me to call mum tomorrow", "I'm feeling overwhelmed", "Give me a productivity tip"].map((q, i) => (
                      <div key={i} style={{ fontSize: 13, color: "rgba(255,255,255,.7)", padding: "5px 0", borderBottom: i < 3 ? "1px solid rgba(255,255,255,.06)" : "none" }}>{q}</div>
                    ))}
                  </div>
                  <button onClick={() => setOnboardStep(4)} style={{ width: "100%", height: 50, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 14, fontSize: 15, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 8px 28px #7c6dfa60" }}>Next →</button>
                </div>
              )}

              {onboardStep === 4 && (
                <div style={{ textAlign: "center", maxWidth: 360 }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: "#fff", marginBottom: 12 }}>You're all set!</div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,.65)", lineHeight: 1.8, marginBottom: 28 }}>Taskflow has Focus timers, Habit tracking, a Mood journal, Daily Planner, AI task breakdown, and much more. Explore at your own pace.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 32 }}>
                    {[["⏱", "Focus & Time"], ["🔁", "Habits"], ["😊", "Mood Journal"], ["📊", "Statistics"]].map(([ic, lb]) => (
                      <div key={lb} style={{ background: "rgba(255,255,255,.07)", borderRadius: 12, padding: "14px 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 24 }}>{ic}</span>
                        <span style={{ fontSize: 11.5, color: "rgba(255,255,255,.6)", fontWeight: 600 }}>{lb}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => { setOnboardStep(0); localStorage.setItem("tf_onboarded", "1"); if (!localStorage.getItem("tf_launched")) setShowTemplateModal(true); }} style={{ width: "100%", height: 52, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 14, fontSize: 16, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 8px 28px #7c6dfa60" }}>
                    Start using Taskflow ✦
                  </button>
                </div>
              )}
            </div>
          )}
          {/* == CONFETTI BURST == */}
          {confettiBurst && (
            <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 8000, overflow: "hidden" }}>
              {[...Array(32)].map((_, i) => {
                const colors = ["#7c6dfa", "#ffd93d", "#6bcb77", "#ff6b9d", "#48dbfb", "#ff9f43", "#a855f7", "#ff6b6b"];
                const color = colors[i % colors.length];
                const x = 10 + Math.random() * 80;
                const delay = Math.random() * 0.4;
                const size = 6 + Math.random() * 8;
                const rot = Math.random() * 360;
                return <div key={i} style={{ position: "absolute", left: `${x}%`, top: "-10px", width: size, height: size * 0.6, background: color, borderRadius: 2, transform: `rotate(${rot}deg)`, animation: `confettiFall ${1.2 + Math.random() * 0.8}s ease-in ${delay}s forwards`, opacity: .9 }} />;
              })}
            </div>
          )}


          {/* == ONBOARDING == */}
          {!hasOnboarded && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#04060e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>

              {/* Progress dots */}
              <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
                {[0, 1, 2, 3].map(i => (
                  <div key={i} style={{ width: i === onboardStep ? 24 : 8, height: 8, borderRadius: 4, background: i <= onboardStep ? accent.v : "var(--s3)", transition: "all .3s" }} />
                ))}
              </div>

              {/* Step 0: Welcome + Name */}
              {onboardStep === 0 && (
                <div style={{ width: "100%", maxWidth: 360, textAlign: "center", animation: "milestoneIn .5s ease both" }}>
                  <div style={{ fontSize: 64, marginBottom: 16 }}>✦</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 32, color: "#eceeff", marginBottom: 8, letterSpacing: -1 }}>Welcome to Taskflow</div>
                  <div style={{ fontSize: 15, color: "var(--t3)", marginBottom: 32, lineHeight: 1.6 }}>Built by LIBI Labs. Your AI-powered productivity companion.</div>
                  <div style={{ textAlign: "left", marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 8, letterSpacing: .5 }}>WHAT'S YOUR NAME?</div>
                    <input value={onboardName} onChange={e => setOnboardName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && onboardName.trim() && setOnboardStep(1)}
                      placeholder="e.g. Alex, Sarah, Marcus…" autoFocus
                      style={{ width: "100%", background: "var(--s2)", border: `1.5px solid ${accent.v}60`, borderRadius: 14, padding: "14px 16px", fontSize: 16, color: "#eceeff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <button onClick={() => onboardName.trim() && setOnboardStep(1)} disabled={!onboardName.trim()}
                    style={{ width: "100%", height: 52, background: onboardName.trim() ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s3)", borderRadius: 16, fontSize: 16, fontWeight: 700, color: "#fff", border: "none", cursor: onboardName.trim() ? "pointer" : "not-allowed", transition: "all .2s", marginBottom: 12 }}>
                    Continue →
                  </button>
                </div>
              )}

              {/* Step 1: Use case */}
              {onboardStep === 1 && (
                <div style={{ width: "100%", maxWidth: 360, textAlign: "center", animation: "milestoneIn .5s ease both" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>👋</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#eceeff", marginBottom: 6 }}>Hi {onboardName}!</div>
                  <div style={{ fontSize: 14, color: "var(--t3)", marginBottom: 28 }}>What will you mostly use Taskflow for?</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
                    {[
                      { id: "work", icon: "💼", title: "Work & Career", sub: "Projects, meetings, deadlines" },
                      { id: "study", icon: "📚", title: "Studying", sub: "Assignments, exams, research" },
                      { id: "personal", icon: "🌱", title: "Personal Growth", sub: "Habits, goals, self-improvement" },
                      { id: "all", icon: "⚡", title: "Everything", sub: "Work, study and personal life" },
                    ].map(opt => (
                      <div key={opt.id} onClick={() => setOnboardUse(opt.id)}
                        style={{ padding: "14px 16px", borderRadius: 16, border: `2px solid ${onboardUse === opt.id ? accent.v : "var(--b1)"}`, background: onboardUse === opt.id ? `${accent.v}15` : "var(--s1)", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, textAlign: "left", transition: "all .15s" }}>
                        <div style={{ fontSize: 28, flexShrink: 0 }}>{opt.icon}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#eceeff" }}>{opt.title}</div>
                          <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 1 }}>{opt.sub}</div>
                        </div>
                        {onboardUse === opt.id && <div style={{ marginLeft: "auto", color: accent.v, fontSize: 18, flexShrink: 0 }}>✓</div>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setOnboardStep(0)} style={{ flex: 1, height: 48, background: "var(--s2)", borderRadius: 14, fontSize: 14, color: "var(--t3)", border: "1px solid var(--b1)", cursor: "pointer" }}>← Back</button>
                    <button onClick={() => onboardUse && setOnboardStep(2)} disabled={!onboardUse}
                      style={{ flex: 2, height: 48, background: onboardUse ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s3)", borderRadius: 14, fontSize: 15, fontWeight: 700, color: "#fff", border: "none", cursor: onboardUse ? "pointer" : "not-allowed", transition: "all .2s" }}>
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Wake time + notifications */}
              {onboardStep === 2 && (
                <div style={{ width: "100%", maxWidth: 360, textAlign: "center", animation: "milestoneIn .5s ease both" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>⏰</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#eceeff", marginBottom: 6 }}>Set your morning</div>
                  <div style={{ fontSize: 14, color: "var(--t3)", marginBottom: 28, lineHeight: 1.6 }}>LIBI will send you a daily briefing at your wake-up time. Never miss a task again.</div>
                  <div style={{ textAlign: "left", marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 10, letterSpacing: .5 }}>WHAT TIME DO YOU WAKE UP?</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {["5:00 AM", "6:00 AM", "7:00 AM", "7:30 AM", "8:00 AM", "8:30 AM", "9:00 AM", "10:00 AM"].map(t => (
                        <div key={t} onClick={() => setOnboardWake(t)}
                          style={{ padding: "10px 16px", borderRadius: 11, border: `2px solid ${onboardWake === t ? accent.v : "var(--b1)"}`, background: onboardWake === t ? `${accent.v}20` : "var(--s2)", cursor: "pointer", fontSize: 13, fontWeight: 600, color: onboardWake === t ? accent.v : "var(--t2)", transition: "all .15s" }}>
                          {t}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ background: `${accent.v}12`, border: `1px solid ${accent.v}25`, borderRadius: 14, padding: "12px 16px", textAlign: "left", marginBottom: 20 }}>
                    <div style={{ fontSize: 12, color: accent.v, fontWeight: 700, marginBottom: 3 }}>🔔 Daily briefing</div>
                    <div style={{ fontSize: 12, color: "var(--t3)", lineHeight: 1.5 }}>At {onboardWake} LIBI will remind you of today's tasks, your streak and any overdue items.</div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setOnboardStep(1)} style={{ flex: 1, height: 48, background: "var(--s2)", borderRadius: 14, fontSize: 14, color: "var(--t3)", border: "1px solid var(--b1)", cursor: "pointer" }}>← Back</button>
                    <button onClick={() => setOnboardStep(3)} style={{ flex: 2, height: 48, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 14, fontSize: 15, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer" }}>
                      Continue →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: First task */}
              {onboardStep === 3 && (
                <div style={{ width: "100%", maxWidth: 360, textAlign: "center", animation: "milestoneIn .5s ease both" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: "#eceeff", marginBottom: 6 }}>Add your first task</div>
                  <div style={{ fontSize: 14, color: "var(--t3)", marginBottom: 24, lineHeight: 1.6 }}>What's the one thing you need to do today?</div>
                  <div style={{ textAlign: "left", marginBottom: 20 }}>
                    <input value={onboardTask} onChange={e => setOnboardTask(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && completeOnboarding()}
                      placeholder="e.g. Finish the report, Call mum, Study for exam…"
                      autoFocus
                      style={{ width: "100%", background: "var(--s2)", border: `1.5px solid ${accent.v}60`, borderRadius: 14, padding: "14px 16px", fontSize: 15, color: "#eceeff", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <button onClick={completeOnboarding}
                    style={{ width: "100%", height: 52, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 16, fontSize: 16, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", marginBottom: 10, boxShadow: `0 8px 28px ${accent.v}50` }}>
                    {onboardTask.trim() ? "Let's go! 🚀" : "Skip and enter app →"}
                  </button>
                  <button onClick={() => setOnboardStep(2)} style={{ width: "100%", height: 40, background: "none", border: "none", color: "var(--t3)", cursor: "pointer", fontSize: 13 }}>← Back</button>
                </div>
              )}
            </div>
          )}

          {/* == MOBILE TOOLS PANEL == */}
          {showMobileTools && (
            <div className="overlay" onClick={() => setShowMobileTools(false)} style={{ zIndex: 5500 }}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="drag" />
                <div style={{ padding: "16px 16px 28px" }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 16, textAlign: "center" }}>Quick Tools</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                    {[
                      { icon: "⊞", label: "Matrix", action: () => { setShowEisenhower(true); setShowMobileTools(false); } },
                      { icon: "⌘", label: "Commands", action: () => { setShowCmdPalette(true); setCmdQuery(""); setShowMobileTools(false); } },
                      { icon: "⛶", label: "Focus Mode", action: () => { setFocusTaskId(null); setShowFocusMode(true); setShowMobileTools(false); } },
                      { icon: "📋", label: "Templates", action: () => { setShowTemplateModal(true); setShowMobileTools(false); } },
                      { icon: "🎵", label: musicOn ? "Stop Music" : "Music", action: () => { setMusicOn(m => !m); play("tap"); setShowMobileTools(false); } },
                      { icon: "💡", label: "AI Tips", action: () => { setShowSuggestionsPanel(p => !p); setShowMobileTools(false); } },
                      { icon: "✦", label: "LIBI Panel", action: () => { setShowLibiPanel(p => !p); setShowMobileTools(false); } },
                      { icon: dark ? "☀️" : "🌙", label: dark ? "Light Mode" : "Dark Mode", action: () => { toggleDark(); setShowMobileTools(false); } },
                      { icon: "🏆", label: "My Level", action: () => { setShowGamificationModal(true); setShowMobileTools(false); } },
                    ].map((tool, i) => (
                      <div key={i} onClick={tool.action} style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                        padding: "14px 8px", borderRadius: 16,
                        background: "var(--s1)", border: "1px solid var(--b1)",
                        cursor: "pointer",
                        animation: `toolItemPop .3s cubic-bezier(.34,1.56,.64,1) ${i * 40}ms both`,
                        transition: "transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s ease, border-color .18s ease",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px) scale(1.04)"; e.currentTarget.style.boxShadow = `0 8px 20px ${accent.v}30`; e.currentTarget.style.borderColor = `${accent.v}60`; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; e.currentTarget.style.borderColor = ""; }}
                        onTouchStart={e => { e.currentTarget.style.transform = "scale(.94)"; e.currentTarget.style.opacity = ".85"; }}
                        onTouchEnd={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.opacity = ""; tool.action(); }}>
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{tool.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--t2)", textAlign: "center" }}>{tool.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* == STREAK PROTECTION MODAL == */}
          {showStreakModal && (
            <div className="overlay" onClick={() => setShowStreakModal(false)} style={{ zIndex: 5000 }}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340 }}>
                <div className="drag" />
                <div style={{ padding: "28px 24px", textAlign: "center" }}>
                  <div style={{ fontSize: 64, marginBottom: 8, animation: "milestoneIn .5s ease both" }}>🔥</div>
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, marginBottom: 8, color: "var(--t1)" }}>Streak at Risk!</div>
                  <div style={{ fontSize: 15, color: "var(--t2)", marginBottom: 6, lineHeight: 1.6 }}>
                    Your <strong style={{ color: "#ff9f43" }}>{gamStats.streak}-day streak</strong> ends at midnight!
                  </div>
                  <div style={{ fontSize: 13, color: "var(--t3)", marginBottom: 24 }}>Complete just ONE task to keep it alive 💪</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => { setShowStreakModal(false); setTab("tasks"); }} style={{ flex: 1, height: 46, background: `linear-gradient(135deg,#ff9f43,#ff6b35)`, borderRadius: 13, fontSize: 14, fontWeight: 800, color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 6px 20px rgba(255,159,67,.4)" }}>
                      ✅ Do a Task Now
                    </button>
                    <button onClick={() => setShowStreakModal(false)} style={{ height: 46, padding: "0 16px", background: "var(--s2)", borderRadius: 13, fontSize: 13, color: "var(--t3)", border: "1px solid var(--b1)", cursor: "pointer" }}>
                      Later
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* == PWA INSTALL BANNER == */}
          {showInstallBanner && !isInstalled && (
            <div className="install-banner">
              <div className="install-banner-icon">✦</div>
              <div className="install-banner-text">
                <div className="install-banner-title">Install Taskflow</div>
                <div className="install-banner-sub">
                  {/android|iphone|ipad|mobile/i.test(navigator.userAgent)
                    ? "Add to Home Screen — works offline, feels like a real app 📱"
                    : "Install on your PC — works offline, no browser needed 💻"}
                </div>
              </div>
              <button className="install-banner-btn" onClick={() => {
                installPWA();
                if (!pwaPrompt) {
                  showNotif("📲 How to install", "Tap the share button → 'Add to Home Screen' (iOS) or the ⊕ icon in Chrome's address bar (Android/PC)");
                  setShowInstallBanner(false);
                  localStorage.setItem('tf_install_dismissed', '1');
                }
              }}>
                {/android|iphone|ipad|mobile/i.test(navigator.userAgent) ? "📱 Install" : "💻 Install"}
              </button>
              <button className="install-banner-close" onClick={() => {
                setShowInstallBanner(false);
                localStorage.setItem('tf_install_dismissed', '1');
              }}>✕</button>
            </div>
          )}

          {/* == PRIVACY POLICY + TERMS MODAL == */}
          {showPrivacy && (
            <div className="privacy-modal-overlay"
              onClick={() => setShowPrivacy(false)}
              onTouchMove={e => e.stopPropagation()}
              style={{ touchAction: "none" }}>
              <div className="privacy-modal"
                onClick={e => e.stopPropagation()}
                onTouchMove={e => e.stopPropagation()}
                style={{ touchAction: "pan-y" }}>
                <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--b1)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: "var(--t1)" }}>Privacy Policy & Terms</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>Last updated: March 2026 · Taskflow by LIBI Labs</div>
                  </div>
                  <button onClick={() => setShowPrivacy(false)} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", fontSize: 16, cursor: "pointer", color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <div className="privacy-body" onTouchMove={e => e.stopPropagation()}>
                  <h2>Privacy Policy</h2>
                  <p>Taskflow ("we", "our") is committed to protecting your privacy. This policy explains how we handle information when you use Taskflow at <a href="https://taskflow-ultimate.netlify.app" target="_blank" rel="noreferrer">taskflow-ultimate.netlify.app</a>.</p>
                  <h3>1. Information We Collect</h3>
                  <p><strong>Local data only:</strong> All your tasks, habits, goals, notes, mood logs, and settings are stored exclusively in your browser's localStorage. This data never leaves your device.</p>
                  <p><strong>Firebase (optional):</strong> The real-time collaboration feature optionally syncs via Google Firebase. This is opt-in only. Firebase data is governed by Google's Privacy Policy.</p>
                  <p><strong>Voice input:</strong> Processed by your browser's Web Speech API. No audio is recorded or stored by Taskflow.</p>
                  <p><strong>Advertising:</strong> We use Google AdSense to display ads. Google may collect anonymised usage data per Google's Advertising Policy.</p>
                  <h3>2. How We Use Information</h3>
                  <ul>
                    <li>To provide and improve the Taskflow service</li>
                    <li>To display relevant ads via Google AdSense</li>
                    <li>To enable optional real-time collaboration via Firebase</li>
                    <li>We do <strong>not</strong> sell, rent, or share your personal data</li>
                  </ul>
                  <h3>3. Cookies & Tracking</h3>
                  <p>Taskflow uses localStorage (not cookies) for app data. Google AdSense may use cookies for personalised ads. Opt out at <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>.</p>
                  <h3>4. Data Deletion</h3>
                  <p>Delete all data anytime via Settings → Clear Data, or by clearing your browser's site data. Firebase data can be removed by contacting us.</p>
                  <h3>5. Children's Privacy</h3>
                  <p>Taskflow is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
                  <h3>6. Third-Party Services</h3>
                  <ul>
                    <li><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> (Firebase, AdSense)</li>
                    <li><a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">Firebase Privacy Policy</a></li>
                  </ul>
                  <h3>7. Contact</h3>
                  <p>Privacy questions: <a href="mailto:privacy@libi-labs.com">privacy@libi-labs.com</a></p>

                  <h2>Terms of Service</h2>
                  <p>By using Taskflow, you agree to these terms.</p>
                  <h3>1. Use of Service</h3>
                  <p>Taskflow is free for personal productivity use. You may not use it for unlawful purposes or in ways that harm others.</p>
                  <h3>2. Data Responsibility</h3>
                  <p>All data is stored locally. You are responsible for backing up your data. We are not liable for data loss due to browser clearing or device changes.</p>
                  <h3>3. Intellectual Property</h3>
                  <p>The Taskflow app, LIBI AI engine, and design are property of LIBI Labs. You may not copy or redistribute without permission.</p>
                  <h3>4. Advertisements</h3>
                  <p>Taskflow displays ads via Google AdSense. We are not responsible for third-party ad content. Ad revenue keeps Taskflow free.</p>
                  <h3>5. Disclaimer</h3>
                  <p>Taskflow is provided "as is" without warranties. We do not guarantee uninterrupted or error-free operation.</p>
                  <h3>6. Governing Law</h3>
                  <p>These terms are governed by the laws of India. Disputes resolved in Kerala, India.</p>
                  <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--s2)", borderRadius: 14, fontSize: 12, color: "var(--t3)", textAlign: "center", lineHeight: 1.8 }}>
                    Questions? <a href="mailto:privacy@libi-labs.com" style={{ color: "var(--acc)" }}>privacy@libi-labs.com</a><br />
                    © 2026 Taskflow · LIBI Labs · Kerala, India
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* == UNDO TOAST == */}
          {showUndo && deletedTask && (
            <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", zIndex: 9000, background: dark ? "rgba(20,22,40,0.97)" : "rgba(255,255,255,0.97)", border: "1px solid var(--b1)", borderRadius: 16, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px rgba(0,0,0,.35)", backdropFilter: "blur(16px)", minWidth: 280, maxWidth: "90vw", animation: "slideUp .2s ease" }}>
              <div style={{ fontSize: 18 }}>🗑</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{deletedTask.title}</div>
                <div style={{ fontSize: 11, color: "var(--t3)" }}>Deleted</div>
              </div>
              <button onClick={undoDelete} style={{ padding: "8px 14px", borderRadius: 10, background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>↩ Undo</button>
            </div>
          )}

          {xpAnim && (
            <div className="xp-float">+{xpAnim.amount} XP ⚡</div>
          )}

          {/* ── New Badge Popup */}
          {newBadgeAnim && (
            <div className="badge-popup">
              <div style={{ fontSize: 36 }}>{newBadgeAnim.icon}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--acc)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>🏆 Badge Unlocked!</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--t1)" }}>{newBadgeAnim.name}</div>
                <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 2 }}>{newBadgeAnim.desc}</div>
                <div style={{ fontSize: 11, color: "var(--acc)", fontWeight: 700, marginTop: 3 }}>+{newBadgeAnim.xp} XP earned!</div>
              </div>
            </div>
          )}

          {/* ── AI Suggestions Panel */}
          {showSuggestionsPanel && (
            <div style={{ position: "fixed", top: 64, right: 12, width: 320, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 18, padding: "16px", boxShadow: "0 12px 40px rgba(0,0,0,.3)", zIndex: 500, animation: "slideIn .2s ease", maxHeight: "80vh", overflowY: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 17 }}>💡 AI Suggestions</div>
                <button style={{ fontSize: 14, color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }} onClick={() => setShowSuggestionsPanel(false)}>✕</button>
              </div>
              {aiSuggestions.length === 0 ? <div style={{ fontSize: 13, color: "var(--t3)", textAlign: "center", padding: "20px 0" }}>All caught up! No suggestions right now.</div> :
                aiSuggestions.map(s => (
                  <div key={s.id} className="suggest-card">
                    <div style={{ width: 38, height: 38, borderRadius: 11, background: s.color + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0 }}>{s.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: s.color, marginBottom: 3 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.5 }}>{s.body}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {s.action && <button onClick={() => { setShowSuggestionsPanel(false); if (s.action === "add_task") { setForm({ ...blankForm, categoryId: s.categoryId || "personal", profileId: activeProfile }); setShowTaskModal(true); } else if (s.action === "view_tasks") { setTab("tasks"); } }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", fontWeight: 700, border: "none", cursor: "pointer" }}>Take Action</button>}
                        <button onClick={() => { setDismissedSuggestions(d => [...d, s.id]); setAiSuggestions(a => a.filter(x => x.id !== s.id)); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "var(--s3)", color: "var(--t3)", fontWeight: 600, border: "none", cursor: "pointer" }}>Dismiss</button>
                      </div>
                    </div>
                  </div>
                ))}
              <div style={{ fontSize: 10, color: "var(--t3)", textAlign: "center", marginTop: 8 }}>🧠 Powered by offline AI — no internet needed</div>
            </div>
          )}



          {/* ── Gamification Modal */}
          {showGamificationModal && (() => {
            const lvl = getLevel(xp);
            const nextLvl = lvl.next;
            const smartDoneCount = goals.filter(g => g.profileId === activeProfile && g.isSmart && g.milestones.length > 0 && g.milestones.every(m => m.done)).length;
            const rankScore = computeRankScore(xp, gamStats.streak || 0, gamStats.totalDone, smartDoneCount, earnedBadges);
            const rank = getRank(rankScore);
            return (
              <div className="overlay" onClick={() => setShowGamificationModal(false)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                  <div className="drag" />
                  <div className="m-head">
                    <div className="m-title">🏆 Rank & Progress</div>
                    <button className="ic-btn" onClick={() => setShowGamificationModal(false)}>✕</button>
                  </div>
                  <div className="m-body">

                    {/* ── RANK CARD ── */}
                    <div style={{ background: `linear-gradient(135deg,${rank.color}22,${rank.color}08)`, border: `1.5px solid ${rank.color}50`, borderRadius: 20, padding: "20px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: -20, right: -20, fontSize: 90, opacity: .06 }}>{rank.icon}</div>
                      <div style={{ fontSize: 54, marginBottom: 4, filter: `drop-shadow(0 0 16px ${rank.color})` }}>{rank.icon}</div>
                      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 28, color: rank.color, marginBottom: 2 }}>{rank.name}</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>{rank.desc}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: rank.color, padding: "3px 12px", borderRadius: 20, background: rank.color + "18", display: "inline-block", border: `1px solid ${rank.color}35`, marginBottom: 12 }}>{rank.badge}</div>
                      <div style={{ fontSize: 12, color: "var(--t3)", marginBottom: 8 }}>Score: <strong style={{ color: rank.color }}>{rankScore.toLocaleString()}</strong></div>
                      {rank.nextRank && <>
                        <div style={{ height: 8, background: "var(--s3)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                          <div style={{ height: "100%", width: `${rank.progress}%`, background: `linear-gradient(90deg,${rank.color},${rank.nextRank.color})`, borderRadius: 4, transition: "width .8s cubic-bezier(.34,1.56,.64,1)", boxShadow: `0 0 8px ${rank.color}60` }} />
                        </div>
                        <div style={{ fontSize: 10, color: "var(--t3)" }}>
                          {(rank.nextRank.minScore - rankScore).toLocaleString()} pts to {rank.nextRank.icon} <strong>{rank.nextRank.name}</strong>
                        </div>
                      </>}
                      {!rank.nextRank && <div style={{ fontSize: 12, color: rank.color, fontWeight: 700 }}>🔱 Maximum Rank Achieved!</div>}
                    </div>

                    {/* ── ALL RANKS GRID ── */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>🔱 All Ranks</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                        {RANK_TIERS.map(r => {
                          const isCurrentRank = r.id === rank.id;
                          const isUnlocked = rankScore >= r.minScore;
                          return (
                            <div key={r.id} style={{ textAlign: "center", padding: "10px 6px", borderRadius: 12, background: isCurrentRank ? r.color + "22" : "var(--s2)", border: `1.5px solid ${isCurrentRank ? r.color : isUnlocked ? r.color + "44" : "var(--b1)"}`, opacity: isUnlocked ? 1 : 0.4, transition: "all .2s" }}>
                              <div style={{ fontSize: 20, filter: isUnlocked ? "none" : "grayscale(1)", marginBottom: 3 }}>{r.icon}</div>
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: isCurrentRank ? r.color : "var(--t2)", lineHeight: 1.2 }}>{r.name}</div>
                              <div style={{ fontSize: 8, color: "var(--t3)", marginTop: 2 }}>{r.minScore.toLocaleString()}pts</div>
                              {isCurrentRank && <div style={{ fontSize: 7, fontWeight: 800, color: r.color, marginTop: 2 }}>← YOU</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── XP Level card ── */}
                    <div style={{ background: `linear-gradient(135deg,${accent.v}18,${accent.g}0a)`, border: `1px solid ${accent.v}30`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ fontSize: 36 }}>{lvl.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: accent.v }}>{lvl.name} · Level {lvl.level}</div>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>{xp} XP total</div>
                        {nextLvl && <>
                          <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
                            <div style={{ height: "100%", width: `${lvl.progress}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3 }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--t3)" }}>{nextLvl.minXP - xp} XP to {nextLvl.icon} {nextLvl.name}</div>
                        </>}
                      </div>
                    </div>

                    {/* ── Rank Score Breakdown ── */}
                    <div style={{ background: "var(--s2)", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 10 }}>📊 RANK SCORE BREAKDOWN</div>
                      {[
                        { label: "XP earned", val: xp, icon: "⚡", color: accent.v },
                        { label: "Streak bonus", val: Math.round((gamStats.streak || 0) * (gamStats.streak || 0) * 0.8), icon: "🔥", color: "#ff9f43" },
                        { label: "Tasks completed", val: (gamStats.totalDone || 0) * 4, icon: "✅", color: "#6bcb77" },
                        { label: "SMART goals", val: (smartDoneCount || 0) * 150, icon: "🎯", color: "#48dbfb" },
                        { label: "Badges", val: (earnedBadges.length || 0) * 30, icon: "🏅", color: "#a855f7" },
                      ].map(s => (
                        <div key={s.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid var(--b1)" }}>
                          <span style={{ fontSize: 12, color: "var(--t2)", display: "flex", alignItems: "center", gap: 6 }}><span>{s.icon}</span>{s.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: s.color }}>+{s.val.toLocaleString()}</span>
                        </div>
                      ))}
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0 0", marginTop: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)" }}>Total Score</span>
                        <span style={{ fontSize: 14, fontWeight: 900, color: rank.color }}>{rankScore.toLocaleString()}</span>
                      </div>
                    </div>
                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                      {[{ icon: "✅", label: "Tasks Done", val: gamStats.totalDone }, { icon: "🔥", label: "Streak", val: `${gamStats.streak}d` }, { icon: "🏅", label: "Badges", val: `${earnedBadges.length}/${BADGES.length}` }].map(s => (
                        <div key={s.label} style={{ background: "var(--s2)", borderRadius: 12, padding: "12px 10px", textAlign: "center", border: "1px solid var(--b1)" }}>
                          <div style={{ fontSize: 22 }}>{s.icon}</div>
                          <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: "var(--acc)", marginTop: 2 }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Badges grid */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>🏅 Badges ({earnedBadges.length}/{BADGES.length})</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                        {BADGES.map(b => {
                          const earned = earnedBadges.includes(b.id);
                          return (
                            <div key={b.id} title={b.name + ": " + b.desc} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 12, background: earned ? "var(--accd)" : "var(--s2)", border: `1.5px solid ${earned ? "var(--acc)" : "var(--b1)"}`, opacity: earned ? 1 : 0.45, transition: "all .2s", cursor: "default" }}>
                              <div style={{ fontSize: 22, filter: earned ? "none" : "grayscale(1)" }}>{b.icon}</div>
                              <div style={{ fontSize: 9, fontWeight: 700, color: earned ? "var(--acc)" : "var(--t3)", marginTop: 4, lineHeight: 1.2 }}>{b.name}</div>
                              {earned && <div style={{ fontSize: 8, color: "var(--acc)", marginTop: 1 }}>+{b.xp}xp</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {/* How to earn XP */}
                    <div style={{ background: "var(--s2)", borderRadius: 12, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 8 }}>⚡ HOW TO EARN XP</div>
                      {[["✅ Complete low priority task", "10 XP"], ["✅ Complete medium priority task", "20 XP"], ["✅ Complete high priority task", "30 XP"], ["🏅 Unlock a badge", "50-500 XP"]].map(([a, b]) => (
                        <div key={a} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--b1)" }}>
                          <span style={{ fontSize: 12, color: "var(--t2)" }}>{a}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--acc)" }}>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="m-foot"><button className="btn-s" onClick={() => setShowGamificationModal(false)}>Awesome! 🎉</button></div>
                </div>
              </div>
            );
          })()}

          {/* Sidebar toggle — always visible */}
          {!showSidebar && (
            <button onClick={() => { setShowSidebar(true); haptic("light"); }} title="Show sidebar" style={{ position: "fixed", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 200, width: 24, height: 72, background: `linear-gradient(180deg,${accent.v},${accent.g})`, border: "none", borderRadius: "0 14px 14px 0", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: "#fff", boxShadow: `4px 0 24px ${accent.v}60`, transition: "width .15s" }} onMouseEnter={e => e.currentTarget.style.width = "30px"} onMouseLeave={e => e.currentTarget.style.width = "24px"}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>›</span>
              <span style={{ fontSize: 7, letterSpacing: .5, writingMode: "vertical-rl", transform: "rotate(180deg)", opacity: .8 }}>MENU</span>
            </button>
          )}
          <div className="shell" style={{ position: "relative" }}>
            {/* Wallpaper layer — behind everything */}
            {(() => {
              const h = liveHour;
              const autoGrad = h >= 5 && h < 12
                ? "linear-gradient(160deg,#0a0510 0%,#1a0f3e 20%,#3d1f6e 45%,#e8724a 70%,#f4a55a 85%,#ffd580 100%)"  // 🌅 morning
                : h >= 12 && h < 18
                  ? "linear-gradient(160deg,#030a1a 0%,#0a1f4a 30%,#1565c0 65%,#e8a83a 85%,#f4d060 100%)"              // ☀️ afternoon
                  : h >= 18 && h < 21
                    ? "linear-gradient(160deg,#050210 0%,#1a0535 25%,#6b1a3a 55%,#ff6b35 80%,#ffa560 100%)"              // 🌆 evening
                    : "linear-gradient(160deg,#000008 0%,#0a0020 25%,#1a0040 50%,#2d0060 70%,#7c6dfa 100%)";             // 🌙 night
              const grad = wallpaper === "auto" ? autoGrad : (wallpaper !== "none" ? WALLPAPERS.find(w => w.id === wallpaper)?.gradient : null);
              return grad ? <div style={{ position: "fixed", inset: 0, zIndex: 0, background: grad, backgroundSize: "cover", backgroundAttachment: "fixed", pointerEvents: "none", transition: "background 2s ease" }} /> : null;
            })()}
            {/* Sidebar */}
            <div className="sidebar" style={{ width: showSidebar ? "234px" : "0px", overflowX: "hidden", overflowY: showSidebar ? "auto" : "hidden", minWidth: 0, flexShrink: 0, transition: "width .25s ease" }}>
              <div className="logo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="logo-icon" onClick={() => setShowIconDesigner(true)} style={{ cursor: "pointer" }} title="Customize icon">{appIconEmoji}</div>
                  <span className="logo-text">{appDisplayName || t.appName}</span>
                </div>
                <button onClick={() => { setShowSidebar(false); haptic("light"); }} title="Collapse sidebar" style={{ width: 28, height: 28, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>‹</button>
              </div>
              {/* XP Level Bar in Sidebar */}
              <div onClick={() => setShowGamificationModal(true)} style={{ margin: "0 12px 14px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 11, padding: "10px 12px", cursor: "pointer", transition: "all .15s" }}>
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
                  : <div className="profile-avatar" style={{ background: curProfile.color + "22" }}>{curProfile.icon}</div>
                }
                <span className="profile-name">{authUser?.name || curProfile.name}</span>
                <span className="profile-arrow">⇄</span>
              </div>
              <div className="nav-group">
                <div className="nav-lbl">Navigation</div>
                {[
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
                  { id: "wellness", icon: "🌿", label: "Wellness", cnt: null },
                  { id: "leaderboard", icon: "🏆", label: t.leaderboard || "Leaderboard", cnt: null },
                  { id: "bot", icon: "✦", label: "LIBI AI", cnt: null },
                  { id: "settings", icon: "⚙️", label: t.settings, cnt: null },
                  { id: "profiles", icon: "👥", label: t.profiles, cnt: null },
                ].map(v => (
                  <div key={v.id} className={`nav-item ${tab === v.id ? "on" : ""}`} onClick={() => { setTab(v.id); play("tap"); if (v.id === "done") { setShowDone(true); setShowStarred(false); } else if (v.id === "starred") { setShowStarred(true); setShowDone(false); } else if (!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "time"].includes(v.id)) { setShowDone(false); setShowStarred(false); } }}>
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

              {/* == Desktop Ad — sidebar bottom == */}
              <div style={{ padding: "12px 10px 8px", marginTop: "auto", flexShrink: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--t3)", opacity: .55, marginBottom: 4, paddingLeft: 2 }}>Advertisement</div>
                <div style={{ borderRadius: 12, overflow: "hidden", background: "var(--s2)", border: "1px solid var(--b1)", minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <ins
                    className="adsbygoogle"
                    style={{ display: "block", width: "214px", height: "100px" }}
                    data-ad-client="ca-pub-3574283815002402"
                    data-ad-slot="3542721070"
                    data-ad-format="rectangle"
                  />
                </div>
              </div>

            </div>

            {/* Main */}
            <div className="main">
              <div className="topbar topbar-drag">
                {/* Logo wrap — this whole block slides out on scroll down */}
                <div className="topbar-logo-wrap" onClick={() => setTab("tasks")}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff", boxShadow: `0 3px 10px ${accent.v}50`, flexShrink: 0 }}>✦</div>
                  <span style={{ fontFamily: "'Instrument Serif',serif", fontSize: 18, fontWeight: 700, color: "var(--t1)", whiteSpace: "nowrap" }}>{appDisplayName || "Taskflow"}</span>
                </div>
                {/* Hamburger - desktop only */}
                <button className="menu-btn" onClick={() => { setShowSidebar(s => !s); haptic("light"); }} title={showSidebar ? "Hide sidebar" : "Show sidebar"} style={{ opacity: showSidebar ? 1 : .5 }}>☰</button>
                <span className="topbar-title">
                  {tab === "stats" ? `📊 ${t.stats}` : tab === "calendar" ? `📆 ${t.calendar}` : tab === "settings" ? `⚙️ ${t.settings}` : tab === "profiles" ? `👥 ${t.profiles}` : tab === "time" ? "⏱ Focus & Time" : tab === "goals" ? "🏆 Goals" : tab === "habits" ? "🔁 Habits" : tab === "planner" ? "⏰ Daily Planner" : tab === "board" ? "🗂 Board" : tab === "sleep" ? "💤 Sleep Tracker" : tab === "calories" ? "🔥 Calorie Tracker" : tab === "wellness" ? "🌿 Wellness" : tab === "leaderboard" ? "🏆 Leaderboard" : tab === "collab" ? "👫 Collaborate" : tab === "social" ? "📵 Social Media" : tab === "starred" ? `⭐ ${t.starred}` : tab === "overdue" ? `⚠️ ${t.overdue}` : tab === "today" ? `📅 ${t.today}` : tab === "done" ? `✓ ${t.done}` : t.tasks}
                </span>
                {!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly"].includes(tab) && <div className="search-wrap"><span style={{ color: "var(--t3)", fontSize: 13 }}>⌕</span><input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />{search && <span style={{ cursor: "pointer", color: "var(--t3)", fontSize: 12 }} onClick={() => setSearch("")}>✕</span>}</div>}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {/* ── Mobile: show only Voice + Dark + Tools ── */}
                  <button className="tb-btn mobile-only-btn" onClick={startVoice}
                    style={{ background: isListening ? "rgba(255,107,107,.2)" : "var(--s2)", borderColor: isListening ? "#ff6b6b" : "var(--b1)", color: isListening ? "#ff6b6b" : "var(--t2)" }}>
                    {isListening ? "🔴" : "🎤"}
                  </button>
                  <button className="tb-btn mobile-only-btn" onClick={toggleDark}>{dark ? "☀️" : "🌙"}</button>
                  <button className="tb-btn mobile-only-btn" onClick={() => setShowMobileTools(true)} style={{ fontWeight: 800, fontSize: 13 }}>⋯</button>
                  {/* ── Desktop: full button row ── */}
                  <button className="tb-btn desktop-only-btn" onClick={() => setShowEisenhower(true)} title="Eisenhower Matrix" style={{ fontSize: 12 }}>⊞</button>
                  <button className="tb-btn desktop-only-btn" onClick={() => { setShowCmdPalette(true); setCmdQuery(""); }} title="Command Palette (Ctrl+K)" style={{ fontWeight: 800, fontSize: 11, color: "var(--acc)", borderColor: "var(--acc)", background: "var(--accd)" }}>⌘K</button>
                  <button className="tb-btn desktop-only-btn" onClick={() => setShowLibiPanel(p => !p)} title="Toggle LIBI" style={{ fontWeight: 800, fontSize: 11, color: showLibiPanel ? "var(--acc)" : "var(--t2)", borderColor: showLibiPanel ? "var(--acc)" : "var(--b1)", background: showLibiPanel ? "var(--accd)" : "var(--s2)", display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 13 }}>✦</span>LIBI
                  </button>
                  <button className="tb-btn" onClick={() => { setFocusTaskId(null); setShowFocusMode(true); }} title="Focus Mode 🌌">🌌</button>
                  <button className="tb-btn desktop-only-btn" onClick={() => setShowTemplateModal(true)} title="Task Templates">📋</button>
                  <button className="tb-btn desktop-only-btn" onClick={toggleDark} title="Toggle theme">{dark ? "☀️" : "🌙"}</button>
                  <button className={`tb-btn desktop-only-btn${isListening ? " voice-btn-active" : ""}`}
                    onClick={startVoice}
                    title="Voice input 🎤"
                    style={{ background: isListening ? "rgba(255,107,107,.2)" : "var(--s2)", borderColor: isListening ? "#ff6b6b" : "var(--b1)", color: isListening ? "#ff6b6b" : "var(--t2)", transition: "all .2s" }}>
                    {isListening ? "🔴" : "🎤"}
                  </button>
                  <button className="tb-btn desktop-only-btn" onClick={() => { setMusicOn(m => !m); play("tap"); }} title={musicOn ? "Stop music" : "Play music"} style={{ background: musicOn ? "var(--accd)" : "var(--s2)", borderColor: musicOn ? "var(--acc)" : "var(--b1)", color: musicOn ? "var(--acc)" : "var(--t2)" }}>{musicOn ? (
                    <span style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 14 }}>
                      {[3, 5, 4, 6, 3, 5].map((h, i) => (
                        <div key={i} style={{ width: 2.5, height: musicOn ? h + 2 : 2, background: "var(--acc)", borderRadius: 2, animation: musicOn ? `soundbar${i} ${0.5 + i * 0.08}s ease-in-out infinite alternate` : "none", minHeight: 2 }} />
                      ))}
                    </span>
                  ) : "🎵"}</button>
                  {/* AI Suggestions Bell */}
                  {aiSuggestions.length > 0 && (
                    <button className="tb-btn" onClick={() => setShowSuggestionsPanel(p => !p)} title="AI Suggestions" style={{ position: "relative", background: "var(--accd)", borderColor: "var(--acc)", color: "var(--acc)" }}>
                      💡
                      <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: "50%", background: "var(--red)", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{aiSuggestions.length}</span>
                    </button>
                  )}
                  {/* XP Level chip */}
                  <div onClick={() => setShowGamificationModal(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--accd)", border: "1px solid var(--acc)", borderRadius: 20, padding: "3px 10px", cursor: "pointer", flexShrink: 0 }}>
                    <span style={{ fontSize: 13 }}>{(() => { const rs = computeRankScore(xp, gamStats.streak || 0, gamStats.totalDone, goals.filter(g => g.profileId === activeProfile && g.isSmart && g.milestones.length > 0 && g.milestones.every(m => m.done)).length, earnedBadges); const rk = getRank(rs); return <><span style={{ fontSize: 13 }}>{rk.icon}</span><span style={{ fontSize: 11, fontWeight: 800, color: rk.color }}>{rk.name}</span></>; })()}</span>
                  </div>
                  {pinEnabled && <button className="tb-btn" onClick={() => { setLocked(true); setPinMode("unlock"); setPinInput(""); setPinError(""); }} title="Lock app">🔒</button>}
                  {tab === "time" && <button className="tb-btn" style={{ background: pomoRunning ? `${accent.v}22` : "var(--s2)", color: pomoRunning ? accent.v : "var(--t2)", borderColor: pomoRunning ? accent.v : "var(--b1)" }} onClick={() => setPomoRunning(r => !r)}>{pomoRunning ? "⏸" : "▶"}</button>}
                  {!["bot", "stats", "calendar", "settings", "profiles", "focus", "collab", "goals", "habits", "planner", "board", "leaderboard", "sleep", "calories", "finance", "weekly"].includes(tab) && <button className="add-btn" onClick={openAdd}>+ {t.add}</button>}
                </div>
              </div>
              {tab === "tasks" || tab === "starred" || tab === "today" || tab === "overdue" || tab === "done" ? <div key={pageKey} className="content page-fade" style={{ overflowY: "auto" }}>{TasksPage()}
                <button className="tb-btn" onClick={generateShareCard} title="Share" style={{ fontSize: 14 }}>🚀</button>
                {notifPermission !== "granted" && <button className="tb-btn" onClick={requestNotifPermission} title="Enable notifications" style={{ fontSize: 13, color: "#ffd93d" }}>🔔</button>}</div> :
                tab === "stats" ? <div key="stats" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{StatsPage()}</div> :
                  tab === "calendar" ? <div key="calendar" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{CalendarPage()}</div> :
                    tab === "settings" ? <div key="settings" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{SettingsPage()}</div> :
                      tab === "profiles" ? <div key="profiles" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{ProfilesPage()}</div> :
                        tab === "focus" ? <div key="focus" className="content page-fade" style={{ overflowY: "auto" }}>{PomoPage()}</div> :
                          tab === "collab" ? <div key="collab" className="content page-fade" style={{ overflowY: "auto" }}>{CollabPage()}</div> :
                            tab === "time" ? <div key="time" className="content page-fade" style={{ overflowY: "auto" }}>{FocusTimePage()}</div> :
                              tab === "goals" ? <div key="goals" className="content page-fade" style={{ overflowY: "auto" }}>{GoalsPage()}</div> :
                                tab === "habits" ? <div key="habits" className="content page-fade" style={{ overflowY: "auto" }}>{HabitsPage()}</div> :
                                  tab === "planner" ? <div key="planner" className="content page-fade" style={{ overflowY: "auto" }}>{PlannerPage()}</div> :
                                    tab === "mood" ? <div key="mood" className="content page-fade" style={{ overflowY: "auto" }}>{MoodPage()}</div> :
                                      tab === "notes" ? <div key="notes" className="content page-fade" style={{ overflowY: "auto" }}>{NotesPage()}</div> :
                                        tab === "sleep" ? <div key="sleep" className="content page-fade" style={{ overflowY: "auto" }}><SleepPage sleepLogs={sleepLogs} setSleepLogs={setSleepLogs} sleepGoalHrs={sleepGoalHrs} setSleepGoalHrs={setSleepGoalHrs} showSleepForm={showSleepForm} setShowSleepForm={setShowSleepForm} sleepForm={sleepForm} setSleepForm={setSleepForm} accent={accent} awardXP={awardXP} showNotif={showNotif} haptic={haptic} play={play} saveSleep={saveSleep} /></div> :
                                          tab === "calories" ? <div key="calories" className="content page-fade" style={{ overflowY: "auto" }}><CaloriePage calorieLogs={calorieLogs} setCalorieLogs={setCalorieLogs} calorieGoal={calorieGoal} setCalorieGoal={setCalorieGoal} showCalForm={showCalForm} setShowCalForm={setShowCalForm} calForm={calForm} setCalForm={setCalForm} accent={accent} awardXP={awardXP} showNotif={showNotif} haptic={haptic} play={play} saveCalorie={saveCalorie} /></div> :
                                            tab === "wellness" ? <div key="wellness" className="content page-fade" style={{ overflowY: "auto" }}><WellnessHub wellness={wellness} accent={accent} activeProfile={activeProfile} /></div> :
                                             tab === "leaderboard" ? <div key="leaderboard" className="content page-fade" style={{ overflowY: "auto" }}><LeaderboardPage profiles={profiles} tasks={tasks} goals={goals} habits={habits} xp={xp} gamStats={gamStats} earnedBadges={earnedBadges} computeRankScore={computeRankScore} getRank={getRank} RANK_TIERS={RANK_TIERS} accent={accent} getLevel={getLevel} activeProfile={activeProfile} sleepLogs={sleepLogs} calorieLogs={calorieLogs} myUid={myUid} /></div> :
                                              tab === "finance" ? <div key="finance" className="content page-fade" style={{ overflowY: "auto" }}>{FinancePage()}</div> :
                                                tab === "weekly" ? <div key="weekly" className="content page-fade" style={{ overflowY: "auto" }}>{WeeklyReviewPage()}</div> :
                                                  tab === "timeline" ? <div key="timeline" className="content page-fade" style={{ overflowY: "auto", display: "flex", flexDirection: "column", flex: 1 }}>{TimelinePage()}</div> :
                                                    tab === "board" ? <div key="board" className="page-fade" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>{BoardPage()}</div> :
                                                      tab === "bot" ? <div key="bot" className="page-fade" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--s0)", paddingBottom: "calc(64px + env(safe-area-inset-bottom,0px))" }}>{chatPanelJSX}</div> :
                                                        <div key="default" className="content page-fade" style={{ overflowY: "auto" }}>{TasksPage()}</div>}
            </div>


            {/* ── Right LIBI Panel */}
            <div style={{ width: showLibiPanel ? 300 : 0, flexShrink: 0, overflow: "hidden", transition: "width .28s cubic-bezier(.4,0,.2,1)", borderLeft: showLibiPanel ? "1px solid var(--b1)" : "none", background: "var(--s0)", display: "flex", flexDirection: "column", position: "relative" }}>
              {showLibiPanel && chatPanelJSX}
            </div>

            {/* Mobile Bottom Nav */}
            {/* == GOOGLE AD BANNER — above bottom nav on mobile == */}
            <div className="ad-banner-wrap" style={{ display: "none" }} id="taskflow-ad-wrap">
              <span className="ad-label">Advertisement</span>
              <div className="ad-inner">
                <ins
                  className="adsbygoogle"
                  style={{ display: "block", width: "100%", height: "50px" }}
                  data-ad-client="ca-pub-3574283815002402"
                  data-ad-slot="3199106143"
                  data-ad-format="horizontal"
                  data-full-width-responsive="true"
                />
              </div>
            </div>

            <nav className="bot-nav">
              <div className="bot-inner">
                <div className={`bot-item ${tab === "tasks" ? "on" : ""}`} onClick={() => { setTab("tasks"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon">○</span><span>{t.tasks}</span>
                  {activeCount > 0 && <span className="bot-num">{activeCount > 99 ? "99+" : activeCount}</span>}
                </div>
                <div className={`bot-item ${tab === "bot" ? "on" : ""}`} onClick={() => { setTab("bot"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon" style={{ fontSize: 18 }}>✦</span><span>LIBI</span>
                </div>
                <div className="fab-wrap"><button className="fab" onClick={openAdd}>+</button><span className="fab-lbl">Add Task</span></div>
                <div className={`bot-item ${tab === "stats" ? "on" : ""}`} onClick={() => { setTab("stats"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon">📊</span><span>Stats</span>
                </div>
                <div className={`bot-item ${showMoreMenu ? "on" : ""}`} onClick={() => setShowMoreMenu(m => !m)}>
                  <span className="bot-icon">⋯</span><span>More</span>
                </div>
              </div>
            </nav>


            {/* More Menu */}
            {showMoreMenu && (
              <div style={{ position: "fixed", inset: 0, zIndex: 199, background: "rgba(0,0,0,.5)", backdropFilter: "blur(6px)", animation: "backdropIn .22s ease" }} onClick={() => setShowMoreMenu(false)} />
            )}
            {showMoreMenu && (
              <div style={{ position: "fixed", bottom: 64, left: 0, right: 0, background: "var(--s1)", borderTop: "1px solid var(--b1)", borderRadius: "22px 22px 0 0", padding: "14px 14px calc(16px + env(safe-area-inset-bottom,0px))", zIndex: 200, boxShadow: "0 -12px 40px rgba(0,0,0,.3)", maxHeight: "72vh", overflowY: "auto", animation: "moreSlideUp .32s cubic-bezier(.32,1.2,.64,1)" }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: `linear-gradient(90deg,${accent.v},${accent.g})`, margin: "0 auto 14px", opacity: .7 }} />
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>All Features</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                  {[
                    { id: "goals", icon: "🏆", label: "Goals" },
                    { id: "habits", icon: "🔁", label: "Habits" },
                    { id: "calendar", icon: "📆", label: "Calendar" },
                    { id: "notes", icon: "📝", label: "Notes" },
                    { id: "mood", icon: "😊", label: "Mood" },
                    { id: "finance", icon: "💰", label: "Finance" },
                    { id: "focus", icon: "🧘", label: "Focus" },
                    { id: "board", icon: "🗂", label: "Board" },
                    { id: "planner", icon: "⏰", label: "Planner" },
                    { id: "weekly", icon: "📅", label: "Week" },
                    { id: "collab", icon: "👫", label: "Team" },
                    { id: "sleep", icon: "💤", label: "Sleep" },
                    { id: "calories", icon: "🔥", label: "Calories" },
                    { id: "leaderboard", icon: "🥇", label: "Leaderboard" },
                    { id: "profiles", icon: "👥", label: "Profiles" },
                    { id: "settings", icon: "⚙️", label: "Settings" },
                  ].map((v, i) => (
                    <div key={v.id}
                      onClick={() => { setTab(v.id); play("tap"); setShowMoreMenu(false); }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "13px 4px", borderRadius: 14, cursor: "pointer",
                        background: tab === v.id ? `linear-gradient(135deg,${accent.v}22,${accent.g}0e)` : "var(--s2)",
                        border: `1.5px solid ${tab === v.id ? accent.v : "transparent"}`,
                        boxShadow: tab === v.id ? `0 3px 12px ${accent.v}28` : "none",
                        animation: `moreItemIn .28s cubic-bezier(.34,1.56,.64,1) ${i * 22}ms both`,
                        transition: "transform .15s ease"
                      }}
                      onTouchStart={e => { e.currentTarget.style.transform = "scale(.91)"; }}
                      onTouchEnd={e => { e.currentTarget.style.transform = ""; setTab(v.id); play("tap"); setShowMoreMenu(false); }}>
                      <span style={{ fontSize: 26 }}>{v.icon}</span>
                      <span style={{ fontSize: 10, color: tab === v.id ? "var(--acc)" : "var(--t2)", fontWeight: 700, textAlign: "center", lineHeight: 1.2 }}>{v.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ height: 4 }} />
              </div>
            )}
          </div>

          {/* == GOAL MODAL — SMART Enhanced == */}
          {showGoalModal && (
            <div className="overlay" onClick={() => setShowGoalModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
                <div className="drag" />
                <div className="m-head">
                  <div className="m-title">{editGoal ? "Edit Goal" : "New Goal"}</div>
                  <button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowGoalModal(false)}>✕</button>
                </div>
                <div className="m-body">
                  <div><div className="f-lbl">Goal Title</div><input className="f-in" autoFocus placeholder="What do you want to achieve?" value={goalForm.title} onChange={e => setGoalForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div className="row2">
                    <div><div className="f-lbl">Deadline</div><input className="f-in" type="date" value={goalForm.deadline} onChange={e => setGoalForm(f => ({ ...f, deadline: e.target.value }))} /></div>
                    <div><div className="f-lbl">Color</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{GOAL_COLORS.map(c => <div key={c} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${goalForm.color === c ? "var(--t1)" : "transparent"}`, transform: goalForm.color === c ? "scale(1.2)" : "scale(1)", transition: "all .15s" }} onClick={() => setGoalForm(f => ({ ...f, color: c }))} />)}</div></div>
                  </div>
                  <div><div className="f-lbl">Icon</div><div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 5, marginTop: 4 }}>{GOAL_ICONS.map(ic => <button key={ic} style={{ width: 34, height: 34, borderRadius: 8, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", background: goalForm.icon === ic ? "var(--accd)" : "var(--s2)", border: `2px solid ${goalForm.icon === ic ? "var(--acc)" : "transparent"}`, cursor: "pointer" }} onClick={() => setGoalForm(f => ({ ...f, icon: ic }))}>{ic}</button>)}</div></div>

                  {/* ── SMART CRITERIA SECTION ── */}
                  <div style={{ background: "linear-gradient(135deg,#7c6dfa12,#48dbfb06)", border: "1px solid #7c6dfa28", borderRadius: 14, padding: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 15 }}>🎯</span>
                      <span style={{ fontSize: 13, fontWeight: 800, color: "var(--t1)" }}>SMART Criteria</span>
                      <span style={{ fontSize: 10, color: "var(--t3)", flex: 1 }}>— makes goals 3× more likely to be achieved</span>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[["S", "#7c6dfa", goalForm.smart_specific], ["M", "#ff9f43", goalForm.smart_measurable], ["A", "#6bcb77", goalForm.smart_achievable], ["R", "#ff6b9d", goalForm.smart_relevant], ["T", "#48dbfb", goalForm.smart_timebound || goalForm.deadline]].map(([l, c, v]) => (
                          <div key={l} style={{ width: 18, height: 18, borderRadius: 5, background: v ? c + "22" : "var(--s3)", border: `1.5px solid ${v ? c : "var(--b1)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 900, color: v ? c : "var(--t3)" }}>{l}</div>
                        ))}
                      </div>
                    </div>
                    {[
                      { key: "smart_specific", letter: "S", label: "Specific", color: "#7c6dfa", placeholder: "What exactly will you do? Be precise — who, what, where, when.", example: 'e.g. "Run a 5K race in my city"' },
                      { key: "smart_measurable", letter: "M", label: "Measurable", color: "#ff9f43", placeholder: "How will you track & measure progress?", example: 'e.g. "Track weekly km in Taskflow"' },
                      { key: "smart_achievable", letter: "A", label: "Achievable", color: "#6bcb77", placeholder: "Is this realistic? What makes it doable?", example: 'e.g. "I already walk 3km daily — running is next step"' },
                      { key: "smart_relevant", letter: "R", label: "Relevant", color: "#ff6b9d", placeholder: "Why does this matter to your life right now?", example: 'e.g. "Improve health, reduce stress, gain confidence"' },
                      { key: "smart_timebound", letter: "T", label: "Time-Bound", color: "#48dbfb", placeholder: "What's your target date or timeframe?", example: 'e.g. "Within 90 days, by June 30"' },
                    ].map(field => (
                      <div key={field.key} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                          <div style={{ width: 22, height: 22, borderRadius: 6, background: field.color + "22", border: `1.5px solid ${field.color}55`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900, color: field.color, flexShrink: 0 }}>{field.letter}</div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--t1)" }}>{field.label}</span>
                          {goalForm[field.key]?.trim() && <span style={{ fontSize: 9, color: field.color, marginLeft: "auto", fontWeight: 700 }}>✓ filled</span>}
                        </div>
                        <input className="f-in" placeholder={field.placeholder} value={goalForm[field.key] || ""} onChange={e => setGoalForm(f => ({ ...f, [field.key]: e.target.value }))}
                          style={{ fontSize: 12.5, borderColor: goalForm[field.key]?.trim() ? field.color + "60" : "var(--b1)" }} />
                        <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 3, paddingLeft: 4 }}>{field.example}</div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="f-lbl">Milestones / Steps</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 7 }}>
                      {goalForm.milestones.map((m, i) => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--s2)", borderRadius: 8, padding: "7px 10px" }}>
                          <span style={{ fontSize: 13, flex: 1 }}>{m.text}</span>
                          <span style={{ cursor: "pointer", fontSize: 12, color: "var(--t3)" }} onClick={() => setGoalForm(f => ({ ...f, milestones: f.milestones.filter((_, j) => j !== i) }))}>✕</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add a milestone step…" value={goalMilestoneInput} onChange={e => setGoalMilestoneInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && goalMilestoneInput.trim()) { setGoalForm(f => ({ ...f, milestones: [...f.milestones, { id: uid(), text: goalMilestoneInput.trim(), done: false }] })); setGoalMilestoneInput(""); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: "var(--acc)", borderRadius: 9, fontSize: 12, color: "#fff", fontWeight: 600 }} onClick={() => { if (!goalMilestoneInput.trim()) return; setGoalForm(f => ({ ...f, milestones: [...f.milestones, { id: uid(), text: goalMilestoneInput.trim(), done: false }] })); setGoalMilestoneInput(""); }}>+ Add</button>
                    </div>
                  </div>

                  {/* SMART score preview */}
                  {(() => { const s = getSmartScore(goalForm); return s > 0 && (<div style={{ background: s >= 3 ? "rgba(107,203,119,.1)" : "rgba(255,159,67,.1)", border: `1px solid ${s >= 3 ? "rgba(107,203,119,.3)" : "rgba(255,159,67,.3)"}`, borderRadius: 11, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 20 }}>{s >= 5 ? "🏆" : s >= 3 ? "🎯" : "⚡"}</span><div><div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--t1)" }}>{s >= 5 ? "Perfect SMART goal!" : s >= 3 ? "This is a SMART goal ✓" : "Fill more criteria to make it SMART"}</div><div style={{ fontSize: 11, color: "var(--t3)", marginTop: 1 }}>{s}/5 criteria · {s >= 3 ? "Earns +50 XP bonus" : "Need 3+ for SMART badge"}</div></div></div>); })()}
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowGoalModal(false)}>Cancel</button><button className="btn-s" disabled={!goalForm.title.trim()} onClick={saveGoal}>{editGoal ? "Save Changes" : "Create Goal"}</button></div>
              </div>
            </div>
          )}

          {/* == HABIT MODAL == */}
          {showHabitModal && (
            <div className="overlay" onClick={() => setShowHabitModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">New Habit</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowHabitModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">Habit Name</div><input className="f-in" autoFocus placeholder="e.g. Morning run, Read 30 mins…" value={habitForm.name} onChange={e => setHabitForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><div className="f-lbl">Icon</div><div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 5, marginTop: 4 }}>{HABIT_ICONS.map(ic => <button key={ic} style={{ width: 32, height: 32, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", background: habitForm.icon === ic ? "var(--accd)" : "var(--s2)", border: `2px solid ${habitForm.icon === ic ? "var(--acc)" : "transparent"}`, cursor: "pointer" }} onClick={() => setHabitForm(f => ({ ...f, icon: ic }))}>{ic}</button>)}</div></div>
                  <div><div className="f-lbl">Color</div><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>{GOAL_COLORS.map(c => <div key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${habitForm.color === c ? "var(--t1)" : "transparent"}`, transform: habitForm.color === c ? "scale(1.2)" : "scale(1)", transition: "all .15s" }} onClick={() => setHabitForm(f => ({ ...f, color: c }))} />)}</div></div>
                  <div><div className="f-lbl">Frequency</div><div style={{ display: "flex", gap: 6, marginTop: 4 }}>{FREQ_OPTS.map(f => <button key={f.id} style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 12, fontWeight: 600, background: habitForm.freq === f.id ? "var(--accd)" : "var(--s2)", color: habitForm.freq === f.id ? "var(--acc)" : "var(--t2)", border: `1.5px solid ${habitForm.freq === f.id ? "var(--acc)" : "var(--b1)"}`, cursor: "pointer", transition: "all .15s" }} onClick={() => setHabitForm(frm => ({ ...frm, freq: f.id }))}>{f.label}</button>)}</div></div>
                  <div style={{ background: "var(--s2)", borderRadius: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: habitForm.color + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{habitForm.icon}</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: habitForm.color }}>{habitForm.name || "Preview"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>Daily habit</span>
                  </div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowHabitModal(false)}>Cancel</button><button className="btn-s" disabled={!habitForm.name.trim()} onClick={saveHabit}>Add Habit</button></div>
              </div>
            </div>
          )}

          {/* == BOARD CARD MODAL == */}
          {showCardModal && (
            <div className="overlay" onClick={() => setShowCardModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">{editCard ? "Edit Card" : "New Card"}</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowCardModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">Title</div><input className="f-in" autoFocus placeholder="What needs to be done?" value={cardForm.title} onChange={e => setCardForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><div className="f-lbl">Description</div><textarea className="f-in" placeholder="Add details, links, notes…" rows={3} style={{ resize: "vertical" }} value={cardForm.desc} onChange={e => setCardForm(f => ({ ...f, desc: e.target.value }))} /></div>
                  <div className="row2">
                    <div><div className="f-lbl">Column</div>
                      <select className="f-in" value={cardFormCol} onChange={e => setCardFormCol(e.target.value)} style={{ cursor: "pointer" }}>
                        {boardColumns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                    </div>
                    <div><div className="f-lbl">Priority</div>
                      <select className="f-in" value={cardForm.priority} onChange={e => setCardForm(f => ({ ...f, priority: e.target.value }))} style={{ cursor: "pointer" }}>
                        <option value="high">🔴 High</option><option value="medium">🟡 Medium</option><option value="low">🟢 Low</option>
                      </select>
                    </div>
                  </div>
                  <div><div className="f-lbl">Label</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{CARD_LABELS.map(l => <button key={l} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: cardForm.label === l ? "var(--accd)" : "var(--s2)", color: cardForm.label === l ? "var(--acc)" : "var(--t2)", border: `1px solid ${cardForm.label === l ? "var(--acc)" : "var(--b1)"}`, fontWeight: 600, cursor: "pointer", transition: "all .15s" }} onClick={() => setCardForm(f => ({ ...f, label: l }))}>{l}</button>)}</div></div>
                  <div><div className="f-lbl">Card Color</div><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>{CARD_COLORS.map(c => <div key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${cardForm.color === c ? "var(--t1)" : "transparent"}`, transform: cardForm.color === c ? "scale(1.2)" : "scale(1)", transition: "all .15s" }} onClick={() => setCardForm(f => ({ ...f, color: c }))} />)}</div></div>
                  <div><div className="f-lbl">Assignee</div><div style={{ display: "flex", gap: 7, marginTop: 4 }}>{["👤", "👩", "👨", "🧑", "👩‍💻", "👨‍💻", "🧑‍🎨", "👩‍🎨"].map(em => <button key={em} style={{ width: 36, height: 36, borderRadius: 10, fontSize: 18, background: cardForm.assignee === em ? "var(--accd)" : "var(--s2)", border: `2px solid ${cardForm.assignee === em ? "var(--acc)" : "transparent"}`, cursor: "pointer" }} onClick={() => setCardForm(f => ({ ...f, assignee: em }))}>{em}</button>)}</div></div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowCardModal(false)}>Cancel</button><button className="btn-s" disabled={!cardForm.title.trim()} onClick={saveCard}>{editCard ? "Save Changes" : "Add Card"}</button></div>
              </div>
            </div>
          )}

          {/* == BOARD COLUMN MODAL == */}
          {showColModal && (
            <div className="overlay" onClick={() => setShowColModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">New Column</div><button className="ic-btn" onClick={() => setShowColModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">Column Name</div><input className="f-in" autoFocus placeholder="e.g. Testing, Blocked, Shipped…" value={colForm.title} onChange={e => setColForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><div className="f-lbl">Color</div><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>{CARD_COLORS.map(c => <div key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${colForm.color === c ? "var(--t1)" : "transparent"}`, transform: colForm.color === c ? "scale(1.2)" : "scale(1)", transition: "all .15s" }} onClick={() => setColForm(f => ({ ...f, color: c }))} />)}</div></div>
                  <div style={{ background: "var(--s2)", borderRadius: 11, padding: "10px 13px", display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: colForm.color }} />
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: colForm.color }}>{colForm.title || "Preview"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, background: colForm.color + "22", color: colForm.color, borderRadius: 20, padding: "1px 8px", fontWeight: 700 }}>0</span>
                  </div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowColModal(false)}>Cancel</button><button className="btn-s" disabled={!colForm.title.trim()} onClick={addColumn}>Add Column</button></div>
              </div>
            </div>
          )}

          {/* == TASK MODAL == */}
          {showTaskModal && (
            <div className="overlay" onClick={() => setShowTaskModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">{editTaskObj ? t.editTask : t.newTask}</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowTaskModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">{t.title} *</div><input className="f-in" placeholder="What needs to be done?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><div className="f-lbl">{t.notes}</div><textarea className="f-in" style={{ height: 65, lineHeight: 1.5 }} placeholder="Details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                  <div className="row2">
                    <div><div className="f-lbl">{t.priority}</div><select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}><option value="high">🔴 {t.high}</option><option value="medium">🟡 {t.medium}</option><option value="low">🟢 {t.low}</option></select></div>
                    <div><div className="f-lbl">{t.category}</div><select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>{categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
                  </div>
                  <div className="row2">
                    <div><div className="f-lbl">{t.dueDate}</div><input className="f-in" type="date" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} /></div>
                    <div><div className="f-lbl">{t.recurring}</div><select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}><option value="never">⏹ {t.never}</option><option value="daily">📅 {t.daily}</option><option value="weekly">📆 {t.weekly}</option><option value="monthly">🗓 {t.monthly}</option></select>
                      <div className="row2">
                        <div>
                          <div className="f-lbl">⏱ Time Estimate</div>
                          <select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.timeEstimate || 0} onChange={e => setForm(f => ({ ...f, timeEstimate: Number(e.target.value) }))}>
                            <option value={0}>Not set</option>
                            <option value={5}>5 min</option>
                            <option value={15}>15 min</option>
                            <option value={25}>25 min (1 Pomodoro)</option>
                            <option value={30}>30 min</option>
                            <option value={60}>1 hour</option>
                            <option value={90}>1.5 hours</option>
                            <option value={120}>2 hours</option>
                            <option value={240}>4 hours</option>
                          </select>
                        </div>
                        <div>
                          <div className="f-lbl">🔒 Depends On</div>
                          <select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.dependsOn?.[0] || ""} onChange={e => setForm(f => ({ ...f, dependsOn: e.target.value ? [e.target.value] : [] }))}>
                            <option value="">No dependency</option>
                            {profileTasks.filter(t => t.id !== editTaskObj?.id && !t.done).map(t => (
                              <option key={t.id} value={t.id}>{t.title.slice(0, 30)}{t.title.length > 30 ? "…" : ""}</option>
                            ))}
                          </select>
                        </div>
                      </div></div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="f-lbl">{t.reminder}</div>
                      <div style={{ background: "var(--s2)", borderRadius: 11, padding: "10px 13px", border: "1px solid var(--b1)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: form.reminder ? 10 : 0 }}>
                          <span style={{ flex: 1, fontSize: 13 }}>🔔 Remind me</span>
                          <div className={`toggle ${form.reminder ? "on" : ""}`} onClick={() => setForm(f => ({ ...f, reminder: !f.reminder }))}><div className="toggle-knob" /></div>
                        </div>
                        {form.reminder && (
                          <>
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>📅 Date</div>
                                <input type="date" style={{ width: "100%", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: 8, padding: "6px 9px", fontSize: 12, color: "var(--t1)" }} value={form.reminderDate || form.due || ""} onChange={e => setForm(f => ({ ...f, reminderDate: e.target.value }))} />
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>⏰ Time</div>
                                <input type="time" style={{ width: "100%", background: "var(--s3)", border: "1px solid var(--b1)", borderRadius: 8, padding: "6px 9px", fontSize: 12, color: "var(--t1)" }} value={form.reminderTime || "09:00"} onChange={e => setForm(f => ({ ...f, reminderTime: e.target.value }))} />
                              </div>
                            </div>
                            {/* Alarm Tone Picker */}
                            <div>
                              <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 7, fontWeight: 700, letterSpacing: .4, textTransform: "uppercase" }}>🎵 Alarm Tone</div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                                {ALARM_TONES.map(tone => (
                                  <div key={tone.id}
                                    onClick={() => { setForm(f => ({ ...f, alarmTone: tone.id })); playAlarmTone(tone.id); }}
                                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "9px 6px", borderRadius: 10, cursor: "pointer", background: form.alarmTone === tone.id ? "var(--accd)" : "var(--s3)", border: `1.5px solid ${form.alarmTone === tone.id ? "var(--acc)" : "transparent"}`, transition: "all .15s" }}>
                                    <span style={{ fontSize: 18 }}>{tone.icon}</span>
                                    <span style={{ fontSize: 9.5, fontWeight: 700, color: form.alarmTone === tone.id ? "var(--acc)" : "var(--t3)", textAlign: "center", lineHeight: 1.2 }}>{tone.label}</span>
                                    {form.alarmTone === tone.id && <span style={{ fontSize: 8, color: "var(--acc)", fontWeight: 800 }}>▶ ACTIVE</span>}
                                  </div>
                                ))}
                              </div>
                              <div style={{ fontSize: 10.5, color: "var(--t3)", marginTop: 6, textAlign: "center" }}>Tap a tone to preview it 🔊</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="f-lbl">⭐ Star</div>
                      <button style={{ width: "100%", height: 42, background: form.starred ? "rgba(255,217,61,.15)" : "var(--s2)", border: `1px solid ${form.starred ? "#ffd93d55" : "var(--b1)"}`, borderRadius: 11, fontSize: 13, color: form.starred ? "#ffd93d" : "var(--t2)", transition: "all .2s" }} onClick={() => setForm(f => ({ ...f, starred: !f.starred }))}>{form.starred ? "⭐ Starred" : "☆ Star task"}</button>
                    </div>
                  </div>
                  {/* Photo */}
                  <div>
                    <div className="f-lbl">📸 {t.photo}</div>
                    {form.photo ? <div><img src={form.photo} className="photo-prev" alt="" /><div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 5, cursor: "pointer", textAlign: "center" }} onClick={() => setForm(f => ({ ...f, photo: null }))}>✕ Remove photo</div></div> : <div className="photo-up" onClick={() => fileRef.current?.click()}><div style={{ fontSize: 26, marginBottom: 5 }}>📷</div><div style={{ fontSize: 12.5, color: "var(--t2)", fontWeight: 600 }}>Tap to add photo</div></div>}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
                  </div>
                  {/* Tags */}
                  <div>
                    <div className="f-lbl">🏷️ {t.tags}</div>
                    {form.tags.length > 0 && <div className="tags-wrap">{form.tags.map(tg => <span key={tg} className="tag-item">#{tg}<span style={{ cursor: "pointer", marginLeft: 2 }} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== tg) }))}>✕</span></span>)}</div>}
                    <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add tag…" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: "var(--s3)", borderRadius: 9, fontSize: 12, color: "var(--t1)" }} onClick={addTag}>+ Add</button>
                    </div>
                  </div>
                  {/* Subtasks */}
                  <div>
                    <div className="f-lbl">✅ {t.subtasks}</div>
                    {form.subtasks.length > 0 && <div className="sub-list">{form.subtasks.map(s => <div key={s.id} className="sub-row"><div className={`sub-chk ${s.done ? "on" : ""}`} onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x) }))}>{s.done && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}</div><span className={`sub-txt ${s.done ? "ds" : ""}`}>{s.text}</span><span style={{ cursor: "pointer", fontSize: 12, color: "var(--t3)", padding: "2px 4px" }} onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.filter(x => x.id !== s.id) }))}>✕</span></div>)}</div>}
                    <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add a step…" value={subInput} onChange={e => setSubInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: accent.v, borderRadius: 9, fontSize: 12, color: "#fff", fontWeight: 600 }} onClick={addSub}>+ Add</button>
                    </div>
                  </div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowTaskModal(false)}>{t.cancel}</button><button className="btn-s" disabled={!form.title.trim()} onClick={saveTask}>{editTaskObj ? t.save : t.add}</button></div>
              </div>
            </div>
          )}

          {/* == DETAIL MODAL == */}
          {showDetail && detailTask && (() => {
            const cat = getCat(detailTask.categoryId);
            const ds = detailTask.subtasks.filter(s => s.done).length;
            return (
              <div className="overlay" onClick={() => setShowDetail(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                  <div className="drag" />
                  <div className="m-head">
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: PRIORITIES[detailTask.priority].bg, color: PRIORITIES[detailTask.priority].color, fontWeight: 600 }}>{PRIORITIES[detailTask.priority].icon} {PRIORITIES[detailTask.priority].label}</span>
                      <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: cat.color + "22", color: cat.color, fontWeight: 600 }}>{cat.icon} {cat.name}</span>
                      {detailTask.recurring && detailTask.recurring !== "never" && <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }}>🔄 {detailTask.recurring}</span>}
                    </div>
                    <button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowDetail(false)}>✕</button>
                  </div>
                  <div className="m-body">
                    {detailTask.photo && <img src={detailTask.photo} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, border: "1px solid var(--b1)" }} alt="" />}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                      <div className={`chk ${detailTask.done ? "on" : ""}`} style={{ flexShrink: 0, marginTop: 4 }} onClick={() => toggle(detailTask.id)}>{detailTask.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}</div>
                      <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20, flex: 1, lineHeight: 1.3 }}>{detailTask.title}</div>
                      <span style={{ fontSize: 18, cursor: "pointer", opacity: detailTask.starred ? 1 : .35 }} onClick={() => star(detailTask.id)}>⭐</span>
                    </div>
                    {detailTask.notes && <div style={{ fontSize: 13.5, color: "var(--t2)", lineHeight: 1.65 }}>{detailTask.notes}</div>}
                    {detailTask.due && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", width: 64 }}>Due</span><span style={{ color: isOverdue(detailTask.due, detailTask.done) ? "var(--red)" : "var(--t1)" }}>{isOverdue(detailTask.due, detailTask.done) ? "⚠️ OVERDUE — " : ""}{fmtDateFull(detailTask.due)}</span></div>}
                    {detailTask.tags.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", width: 64 }}>Tags</span><div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>{detailTask.tags.map(tg => <span key={tg} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "var(--accd)", color: accent.v, border: `1px solid ${accent.v}30` }}>#{tg}</span>)}</div></div>}
                    {detailTask.subtasks.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 8 }}>Subtasks ({ds}/{detailTask.subtasks.length})</div>
                        <div style={{ height: 3, background: "var(--s3)", borderRadius: 2, overflow: "hidden", marginBottom: 10 }}><div style={{ height: "100%", background: accent.v, borderRadius: 2, width: `${detailTask.subtasks.length ? (ds / detailTask.subtasks.length) * 100 : 0}%`, transition: "width .4s" }} /></div>
                        {detailTask.subtasks.map(s => (
                          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 0", borderBottom: "1px solid var(--b1)", cursor: "pointer" }} onClick={() => toggleSub(detailTask.id, s.id)}>
                            <div className={`sub-chk ${s.done ? "on" : ""}`}>{s.done && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}</div>
                            <span style={{ fontSize: 13, flex: 1, textDecoration: s.done ? "line-through" : "none", color: s.done ? "var(--t3)" : "var(--t1)" }}>{s.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="m-foot">
                    <button className="btn-c" style={{ color: "var(--red)", borderColor: "rgba(255,107,107,.3)", flex: "1" }} onClick={() => { del(detailTask.id); setShowDetail(false); }}>🗑 Delete</button>
                    <button className="btn-s" onClick={() => { setShowDetail(false); openEdit(detailTask, null); }}>✎ Edit</button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* == EXPORT MODAL == */}
          {showExport && (
            <div className="overlay" onClick={() => setShowExport(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">📤 Export Tasks</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowExport(false)}>✕</button></div>
                <div className="m-body">
                  <div style={{ fontSize: 13, color: "var(--t2)", lineHeight: 1.6 }}>Your tasks exported as JSON. Copy or share this data to back it up.</div>
                  <div className="export-area">{exportData()}</div>
                  <button style={{ width: "100%", height: 44, background: accent.v, borderRadius: 12, fontSize: 14, fontWeight: 700, color: "#fff", boxShadow: `0 4px 14px ${accent.v}40` }} onClick={shareData}>🔗 Copy & Share</button>
                </div>
              </div>
            </div>
          )}

          {/* == CATEGORY MODAL == */}
          {showCatModal && (
            <div className="overlay" onClick={() => setShowCatModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">{editCatId ? "Edit Category" : "New Category"}</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowCatModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">Name</div><input className="f-in" placeholder="Category name…" value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><div className="f-lbl">Icon</div><div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginTop: 4 }}>{EMOJI_LIST.map(em => <button key={em} style={{ width: 36, height: 36, borderRadius: 8, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", background: catForm.icon === em ? "var(--accd)" : "var(--s2)", border: `2px solid ${catForm.icon === em ? accent.v : "transparent"}`, cursor: "pointer", transition: "all .15s" }} onClick={() => setCatForm(f => ({ ...f, icon: em }))}>{em}</button>)}</div></div>
                  <div><div className="f-lbl">Color</div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>{COLOR_LIST.map(c => <div key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${catForm.color === c ? "var(--t1)" : "transparent"}`, transform: catForm.color === c ? "scale(1.15)" : "scale(1)", transition: "all .2s" }} onClick={() => setCatForm(f => ({ ...f, color: c }))} />)}</div></div>
                  <div style={{ background: "var(--s2)", borderRadius: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 9, background: catForm.color + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}>{catForm.icon}</div><span style={{ fontSize: 14, fontWeight: 700, color: catForm.color }}>{catForm.name || "Preview"}</span></div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowCatModal(false)}>Cancel</button><button className="btn-s" disabled={!catForm.name.trim()} onClick={saveCat}>Create</button></div>
              </div>
            </div>
          )}

          {/* == PROFILE MODAL == */}
          {showProfileModal && (
            <div className="overlay" onClick={() => setShowProfileModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">{t.newProfile}</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowProfileModal(false)}>✕</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">Profile Name</div><input className="f-in" placeholder="e.g. Work, Family…" value={profForm.name} onChange={e => setProfForm(f => ({ ...f, name: e.target.value }))} /></div>
                  <div><div className="f-lbl">Icon</div><div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginTop: 4 }}>{EMOJI_LIST.slice(0, 16).map(em => <button key={em} style={{ width: 36, height: 36, borderRadius: 8, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", background: profForm.icon === em ? "var(--accd)" : "var(--s2)", border: `2px solid ${profForm.icon === em ? accent.v : "transparent"}`, cursor: "pointer" }} onClick={() => setProfForm(f => ({ ...f, icon: em }))}>{em}</button>)}</div></div>
                  <div style={{ background: "var(--s2)", borderRadius: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 34, height: 34, borderRadius: 9, background: accent.v + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{profForm.icon}</div><span style={{ fontSize: 14, fontWeight: 700 }}>{profForm.name || "Preview"}</span></div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowProfileModal(false)}>Cancel</button><button className="btn-s" disabled={!profForm.name.trim()} onClick={saveProfile}>Create Profile</button></div>
              </div>
            </div>
          )}


          {/* Mood Modal */}
          {showMoodModal && (
            <div className="overlay" onClick={() => setShowMoodModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">How are you feeling?</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowMoodModal(false)}>✕</button></div>
                <div className="m-body">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                    {MOOD_OPTIONS.map((m, i) => (
                      <div key={i} onClick={() => saveMood(i)} style={{ textAlign: "center", padding: "12px 4px", borderRadius: 12, cursor: "pointer", background: "var(--s2)", border: "1px solid var(--b1)", transition: "all .15s" }}>
                        <div style={{ fontSize: 28 }}>{m.emoji}</div>
                        <div style={{ fontSize: 10, color: "var(--t3)", fontWeight: 600, marginTop: 4 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* == AD / PREMIUM MODAL == */}

          {/* == NOTE MODAL — Advanced == */}
          {showNoteEditor && (
            <NoteEditorModal
              noteForm={noteForm} setNoteForm={setNoteForm}
              editNote={editNote} setEditNote={setEditNote}
              noteTagInput={noteTagInput} setNoteTagInput={setNoteTagInput}
              noteIsListening={noteIsListening} setNoteIsListening={setNoteIsListening}
              accent={accent} NOTE_CATS={NOTE_CATS} NOTE_COLORS={NOTE_COLORS}
              saveNote={saveNote} deleteNote={deleteNote}
              exportNotePDF={() => {
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${noteForm.title || "Note"}</title><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.8;color:#222}h1{font-size:26px;margin-bottom:4px}p{white-space:pre-wrap}img{max-width:100%;border-radius:8px;margin-top:16px}.meta{font-size:12px;color:#888;margin-bottom:24px;border-bottom:1px solid #eee;padding-bottom:12px}</style></head><body><h1>${noteForm.title || "Untitled"}</h1><div class="meta">${noteForm.category || ""} · ${noteForm.tags?.map(t => "#" + t).join(" ") || ""} · ${new Date().toLocaleDateString()}</div><p>${(noteForm.body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>").replace(/^# (.+)$/gm, "<h2>$1</h2>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^- \[ \] (.+)$/gm, "☐ $1").replace(/^• (.+)$/gm, "• $1")}</p>${noteForm.sketch ? `<img src="${noteForm.sketch}" alt="Sketch"/>` : ""}<div style="margin-top:40px;font-size:11px;color:#ccc;text-align:center">Generated by Taskflow ✦</div></body></html>`;
                const w = window.open("", "_blank", "width=750,height=900");
                if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
                else { showNotif("📄 PDF blocked", "Allow popups to export PDF"); }
              }}
              setShowNoteEditor={setShowNoteEditor}
              showNotif={showNotif} haptic={haptic} play={play}
            />
          )}

          {/* == AI TASK BREAKDOWN MODAL == */}
          {showAiModal && (
            <div className="overlay" onClick={() => { if (!aiLoading) setShowAiModal(false); }}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
                <div className="drag" />
                <div className="m-head">
                  <div className="m-title">✦ AI Task Breakdown</div>
                  <button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowAiModal(false)}>✕</button>
                </div>
                <div className="m-body">
                  <div style={{ fontSize: 13, color: "var(--t2)", marginBottom: 12, lineHeight: 1.6 }}>
                    Tell me your goal and I'll break it into actionable tasks automatically!
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    <input className="f-in" placeholder="e.g. Launch my app, Learn guitar, Get fit..." value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && aiBreakdown()} style={{ flex: 1 }} autoFocus />
                    <button onClick={aiBreakdown} disabled={aiLoading || !aiInput.trim()} style={{ height: 42, padding: "0 14px", background: "var(--acc)", borderRadius: 11, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", opacity: aiLoading || !aiInput.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>
                      {aiLoading ? "..." : "✨ Go"}
                    </button>
                  </div>

                  {aiLoading && (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>✦</div>
                      <div style={{ fontSize: 13, color: "var(--t2)" }}>AI is thinking...</div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>Breaking down your goal into tasks</div>
                    </div>
                  )}

                  {aiTasks.length > 0 && !aiLoading && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>
                        ✅ Select tasks to add ({aiSelected.length}/{aiTasks.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                        {aiTasks.map((task, i) => (
                          <div key={i} onClick={() => setAiSelected(sel => sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i])}
                            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 11, cursor: "pointer", background: aiSelected.includes(i) ? "var(--accd)" : "var(--s2)", border: `1px solid ${aiSelected.includes(i) ? "var(--acc)" : "transparent"}`, transition: "all .15s" }}>
                            <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${aiSelected.includes(i) ? "var(--acc)" : "var(--b2)"}`, background: aiSelected.includes(i) ? "var(--acc)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .15s" }}>
                              {aiSelected.includes(i) && <span style={{ color: "#fff", fontSize: 10, fontWeight: 800 }}>✓</span>}
                            </div>
                            <span style={{ fontSize: 13, color: "var(--t1)", flex: 1 }}>{task}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setAiSelected(aiTasks.map((_, i) => i))} style={{ flex: 1, height: 36, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 10, fontSize: 12, color: "var(--t2)", cursor: "pointer" }}>Select All</button>
                        <button onClick={addAiTasksToApp} disabled={aiSelected.length === 0} style={{ flex: 2, height: 36, background: "var(--acc)", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", opacity: aiSelected.length === 0 ? 0.5 : 1 }}>
                          + Add {aiSelected.length} Tasks
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* == ALARM MODAL == */}
          {alarmTask && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.88)", backdropFilter: "blur(10px)", zIndex: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
              <div style={{ background: "var(--s1)", border: `2px solid ${accent.v}44`, borderRadius: 26, padding: "32px 24px 26px", maxWidth: 370, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 0, boxShadow: `0 32px 80px rgba(0,0,0,.6),0 0 0 1px ${accent.v}22` }}>

                {/* Pulsing icon */}
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 18, animation: "alarm-pulse 1.2s ease-in-out infinite", boxShadow: `0 0 0 0 ${accent.v}60` }}>⏰</div>

                {/* Status label */}
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: alarmSnoozed ? "#ffd93d" : accent.v, marginBottom: 6 }}>
                  {alarmSnoozed ? "💤 SNOOZE ENDED" : "⏰ ALARM"}
                </div>

                {/* Task title */}
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, textAlign: "center", lineHeight: 1.3, marginBottom: 8, padding: "0 8px" }}>{alarmTask.title}</div>

                {/* Notes */}
                {alarmTask.notes && <div style={{ fontSize: 12.5, color: "var(--t2)", textAlign: "center", lineHeight: 1.6, background: "var(--s2)", borderRadius: 11, padding: "9px 14px", width: "100%", marginBottom: 12 }}>{alarmTask.notes}</div>}

                {/* Meta info */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
                  <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 20, background: `${accent.v}18`, color: accent.v, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                    {ALARM_TONES.find(t => t.id === (alarmTask.alarmTone || "classic"))?.icon} {ALARM_TONES.find(t => t.id === (alarmTask.alarmTone || "classic"))?.label}
                  </span>
                  <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 20, background: "var(--s2)", color: "var(--t2)", fontWeight: 600 }}>⏰ {alarmTask.reminderTime || "09:00"}</span>
                  {alarmTask.due && <span style={{ fontSize: 11.5, padding: "3px 10px", borderRadius: 20, background: "var(--s2)", color: "var(--t2)", fontWeight: 600 }}>📅 {fmtDate(alarmTask.due)}</span>}
                </div>

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: 10, width: "100%", marginBottom: 10 }}>
                  <button onClick={handleDismiss} style={{ flex: 1, height: 48, background: "var(--s2)", border: "1.5px solid var(--b2)", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all .15s" }}>
                    🔕 Dismiss
                  </button>
                  <button onClick={handleSnooze} style={{ flex: 1, height: 48, background: "rgba(255,217,61,.15)", border: "1.5px solid rgba(255,217,61,.4)", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "#ffd93d", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all .15s" }}>
                    💤 Snooze 5m
                  </button>
                </div>
                <button onClick={handleMarkDone} style={{ width: "100%", height: 50, background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", borderRadius: 14, fontSize: 14, fontWeight: 800, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: `0 8px 24px ${accent.v}50`, letterSpacing: .3 }}>
                  ✅ Mark as Done
                </button>

                {/* Snooze hint */}
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 12, textAlign: "center", lineHeight: 1.5 }}>
                  {alarmSnoozed ? "This was a snoozed reminder — it will stop after you dismiss or mark done." : "Snooze will ring again in 5 minutes."}
                </div>
              </div>
              <style>{`
            @keyframes alarm-pulse {
              0%   { box-shadow: 0 0 0 0 ${accent.v}70, 0 0 0 0 ${accent.v}40; }
              50%  { box-shadow: 0 0 0 14px ${accent.v}00, 0 0 0 28px ${accent.v}00; }
              100% { box-shadow: 0 0 0 0 ${accent.v}00, 0 0 0 0 ${accent.v}00; }
            }
          `}</style>
            </div>
          )}


          {/* == SHARE ACHIEVEMENT MODAL == */}
          {showShareModal && shareStats && (
            <div className="overlay" onClick={() => setShowShareModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, textAlign: "center" }}>
                <div className="drag" />
                <div style={{ padding: "24px 20px 20px" }}>
                  {/* Share Card Preview */}
                  <div style={{ background: "linear-gradient(135deg,#0a0a1a,#1a0a2e,#0d1a3e)", borderRadius: 20, padding: "24px 20px", marginBottom: 20, border: "1px solid #7c6dfa33" }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>✦</div>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: "#fff", marginBottom: 4 }}>Taskflow</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>by LIBI Labs</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 16 }}>
                      {[
                        { val: shareStats.done, lbl: "Tasks Done", icon: "✅" },
                        { val: `${shareStats.streak}d`, lbl: "Streak", icon: "🔥" },
                        { val: `${shareStats.pct}%`, lbl: "Completion", icon: "📊" },
                      ].map(s => (
                        <div key={s.lbl} style={{ background: "rgba(255,255,255,.07)", borderRadius: 12, padding: "10px 6px" }}>
                          <div style={{ fontSize: 18 }}>{s.icon}</div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginTop: 4 }}>{s.val}</div>
                          <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", marginTop: 2 }}>{s.lbl}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>{shareStats.name} · {new Date().toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</div>
                  </div>
                  <button onClick={shareAchievement} style={{ width: "100%", height: 48, background: "linear-gradient(135deg,#7c6dfa,#a855f7)", borderRadius: 14, fontSize: 14, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", marginBottom: 10, boxShadow: "0 6px 20px rgba(124,109,250,.4)" }}>
                    🚀 Share Achievement
                  </button>
                  <button onClick={() => setShowShareModal(false)} style={{ fontSize: 12, color: "var(--t3)", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* == APP ICON DESIGNER == */}
          {showIconDesigner && (
            <div className="overlay" onClick={() => setShowIconDesigner(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">🎨 App Icon</div><button className="ic-btn" style={{ fontSize: 15 }} onClick={() => setShowIconDesigner(false)}>✕</button></div>
                <div className="m-body">
                  {/* Preview */}
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                    <div style={{ width: 80, height: 80, borderRadius: 22, background: appIconColor || `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, boxShadow: `0 12px 32px ${accent.v}55` }}>
                      {appIconEmoji}
                    </div>
                  </div>
                  {/* Emoji picker */}
                  <div className="f-lbl">Choose Icon</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 6, marginBottom: 16 }}>
                    {["✦", "⚡", "🎯", "🚀", "💎", "🔥", "⭐", "🌟", "💪", "🧠", "🎨", "🏆", "🌈", "💫", "🎵", "🌙", "☀️", "⚽", "🎮", "📱", "💻", "🤖", "🦋", "🌺"].map(em => (
                      <button key={em} onClick={() => setAppIconEmoji(em)} style={{ width: 36, height: 36, borderRadius: 10, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", background: appIconEmoji === em ? "var(--accd)" : "var(--s2)", border: `2px solid ${appIconEmoji === em ? "var(--acc)" : "transparent"}`, cursor: "pointer", transition: "all .15s" }}>
                        {em}
                      </button>
                    ))}
                  </div>
                  {/* Color picker */}
                  <div className="f-lbl">Background Color</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                    {["", `linear-gradient(135deg,${accent.v},${accent.g})`, "linear-gradient(135deg,#ff6b6b,#ffd93d)", "linear-gradient(135deg,#6bcb77,#00d4aa)", "linear-gradient(135deg,#a855f7,#7c6dfa)", "linear-gradient(135deg,#ff9f43,#ff6b6b)", "linear-gradient(135deg,#48dbfb,#3b82f6)", "#1a1a2e"].map((c, i) => (
                      <div key={i} onClick={() => setAppIconColor(c)} style={{ width: 32, height: 32, borderRadius: 10, background: c || `linear-gradient(135deg,${accent.v},${accent.g})`, cursor: "pointer", border: `3px solid ${appIconColor === c ? "var(--t1)" : "transparent"}`, transform: appIconColor === c ? "scale(1.15)" : "scale(1)", transition: "all .15s" }} />
                    ))}
                  </div>
                </div>
                <div className="m-foot">
                  <button className="btn-c" onClick={() => setShowIconDesigner(false)}>Cancel</button>
                  <button className="btn-s" onClick={() => { setShowIconDesigner(false); showNotif("🎨 Icon updated!", "Your app icon has been customized"); haptic("success"); }}>Save</button>
                </div>
              </div>
            </div>
          )}

          {/* == EISENHOWER MATRIX == */}
          {showEisenhower && (
            <div className="overlay" onClick={() => setShowEisenhower(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
                <div className="drag" />
                <div className="m-head">
                  <div className="m-title">⊞ Eisenhower Matrix</div>
                  <div style={{ fontSize: 11, color: "var(--t3)" }}>Urgent+Important = Do · Important = Schedule · Urgent = Delegate · Neither = Delete</div>
                  <button className="ic-btn" onClick={() => setShowEisenhower(false)}>✕</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "0 16px 16px", flex: 1, overflowY: "auto" }}>
                  {[
                    { label: "🔴 DO NOW", sub: "Urgent + Important", filter: t => t.priority === "high" && t.due && (new Date(t.due) - new Date()) < 3 * 24 * 60 * 60 * 1000, bg: "rgba(255,107,107,.08)", border: "rgba(255,107,107,.3)" },
                    { label: "📅 SCHEDULE", sub: "Important, Not Urgent", filter: t => t.priority === "high" && (!t.due || (new Date(t.due) - new Date()) >= 3 * 24 * 60 * 60 * 1000), bg: "rgba(124,109,250,.08)", border: "rgba(124,109,250,.3)" },
                    { label: "📤 DELEGATE", sub: "Urgent, Not Important", filter: t => t.priority === "medium" && t.due && (new Date(t.due) - new Date()) < 2 * 24 * 60 * 60 * 1000, bg: "rgba(255,217,61,.08)", border: "rgba(255,217,61,.3)" },
                    { label: "🗑 ELIMINATE", sub: "Not Urgent, Not Important", filter: t => t.priority === "low" && (!t.due || (new Date(t.due) - new Date()) >= 7 * 24 * 60 * 60 * 1000), bg: "rgba(120,120,120,.06)", border: "rgba(120,120,120,.2)" },
                  ].map(q => {
                    const qTasks = profileTasks.filter(t => !t.done && q.filter(t));
                    return (
                      <div key={q.label} className="matrix-quad" style={{ background: q.bg, borderColor: q.border }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--t1)", marginBottom: 2 }}>{q.label}</div>
                        <div style={{ fontSize: 10, color: "var(--t3)", marginBottom: 10 }}>{q.sub} · {qTasks.length} tasks</div>
                        {qTasks.length === 0 && <div style={{ fontSize: 11, color: "var(--t3)", textAlign: "center", padding: "20px 0", opacity: .5 }}>None here</div>}
                        {qTasks.map(t => (
                          <div key={t.id} className="matrix-task" onClick={() => { setShowEisenhower(false); setDetailTaskId(t.id); }}>
                            <span style={{ fontSize: 11 }}>{t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "🟢"}</span>
                            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                            {t.due && <span style={{ fontSize: 9, color: "var(--t3)", flexShrink: 0 }}>{t.due}</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* == STREAK MILESTONE == */}
          {streakMilestone && (
            <div className="milestone-popup">
              <div style={{ fontSize: 36, marginBottom: 4 }}>🔥</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#1a0a00" }}>
                {streakMilestone} Day Streak!
              </div>
              <div style={{ fontSize: 12, color: "rgba(0,0,0,.6)", marginTop: 4 }}>
                {streakMilestone === 7 ? "One week strong! 💪" : streakMilestone === 14 ? "Two weeks! You're building real habits 🧠" : streakMilestone === 30 ? "A WHOLE MONTH! Legend 👑" : streakMilestone === 60 ? "60 days. Absolutely elite. 🏆" : "You're unstoppable! 🚀"}
              </div>
            </div>
          )}

          {/* == VOICE TRANSCRIPT TOAST == */}
          {isListening && (
            <div style={{ position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)", background: "rgba(255,107,107,.95)", color: "white", borderRadius: 16, padding: "10px 20px", fontSize: 13, fontWeight: 700, zIndex: 8000, backdropFilter: "blur(10px)", boxShadow: "0 8px 32px rgba(255,107,107,.4)", display: "flex", alignItems: "center", gap: 8, maxWidth: 320, textAlign: "center" }}>
              <span style={{ fontSize: 16 }}>🔴</span>
              <span>{voiceTranscript || "Listening… speak now"}</span>
            </div>
          )}

          {/* == PIN MODAL == */}
          {showPinModal && (
            <div className="overlay" onClick={() => { setShowPinModal(false); setPinInput(""); setPinMode(null); }}>
              <div className="modal center" onClick={e => e.stopPropagation()} style={{ padding: "30px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                <div style={{ fontSize: 40 }}>🔒</div>
                <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 20 }}>{pinMode === "confirm" ? t.confirmPin : t.setPin}</div>
                <div style={{ display: "flex", gap: 14 }}>{[0, 1, 2, 3].map(i => <div key={i} style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${i < pinInput.length ? accent.v : "var(--b2)"}`, background: i < pinInput.length ? accent.v : "transparent", transition: "all .2s" }} />)}</div>
                {pinError && <div style={{ color: "var(--red)", fontSize: 13, fontWeight: 600 }}>{pinError}</div>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k, i) => (
                    <div key={i} className="pin-key" style={k === "" ? { opacity: 0, pointerEvents: "none" } : {}} onClick={() => k === "⌫" ? handlePinDel() : k !== "" && handlePinKey(String(k))}>{k}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* == SMART NOTIFICATIONS == */}
          {notif && (
            <div className="notif-badge" style={{ animation: "slideIn .3s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}>
              <div className="notif-title">{notif.title}</div>
              <div className="notif-body">{notif.body}</div>
              {notif.actions && (
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  {notif.actions.map(act => (
                    <button key={act.label} onClick={act.onClick} style={{ flex: 1, padding: "6px 8px", background: "var(--bg)", border: `1px solid ${accent.v}40`, borderRadius: 8, fontSize: 11, fontWeight: 700, color: "var(--t1)", cursor: "pointer" }}>
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* == PET ROOM MODAL == */}
          {showPetRoom && <PetRoomModal coins={coins} setCoins={setCoins} petItems={petItems} setPetItems={setPetItems} activeItems={activeItems} setActiveItems={setActiveItems} onClose={() => setShowPetRoom(false)} accent={accent} />}
        </>
      )}
    </>
  );
}
