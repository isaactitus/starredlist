import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTasks } from "./hooks/useTasks";
import {
  uid, todayStr, fmtDate, fmtDateFull, isOverdue,
  getDaysInMonth, getFirstDay
} from "./utils/helpers";
import {
  LANGS, ACCENTS, MUSIC_TRACKS,
  DEFAULT_CATEGORIES, EMOJI_LIST, COLOR_LIST,
  PRIORITIES, INIT_TASKS, DEFAULT_PROFILES, FONTS
} from "./utils/constants";

// Backend URL — change this to your Railway URL when deployed
const BACKEND_URL = "https://starredlist-backend.onrender.com";

async function getAuthToken() {
  const fb = await getFirebase();
  if (!fb || !fb.auth.currentUser) return null;
  try {
    return await fb.auth.currentUser.getIdToken();
  } catch (e) {
    return null;
  }
}

async function callLibi(messages, systemPrompt, maxTokens = 1024) {
  const token = await getAuthToken();
  const res = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ messages, systemPrompt, max_tokens: maxTokens }),
  });
  return await res.json();
}

// == Shared Project Utils ==
const getAvatar = name => {
  const AVATARS = ["◆", "▲", "●", "■", "◉", "★", "◈", "○", "◊", "□", "▮", "◎", "✦", "◆", "▬"];
  return AVATARS[(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length];
};

const getMyUid = () => {
  let id = localStorage.getItem("tf_lb_uid");
  if (!id) { id = Math.random().toString(36).slice(2, 18); localStorage.setItem("tf_lb_uid", id); }
  return id;
};

// libiBot is defined inline below (line ~1240)

const getTimeOfDay = () => {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
};

// Renders an image with its white background removed via canvas pixel manipulation
function NoWhiteBgImage({ src, alt, style = {} }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        // Make near-white pixels transparent
        if (r > 220 && g > 220 && b > 220) {
          const whiteness = Math.min(r, g, b);
          data[i + 3] = Math.round((255 - whiteness) * (255 / 35));
        }
      }
      ctx.putImageData(imageData, 0, 0);
    };
    img.src = src;
  }, [src]);
  return <canvas ref={canvasRef} aria-label={alt} style={{ ...style, display: "block" }} />;
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
//  STARREDLIST ULTIMATE  -- All Features, No API Needed
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
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&family=Fredoka+One&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Google+Sans:wght@400;500;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;font-family: inherit; transition: background-color .4s cubic-bezier(.4,0,.2,1), border-color .4s cubic-bezier(.4,0,.2,1), color .3s ease, box-shadow .4s ease, transform .25s cubic-bezier(.34,1.56,.64,1); }
:root{
  --bg:${dark ? "#08090E" : "#E8EBF4"};
  --s1:${dark ? "rgba(16,18,28,0.92)" : "rgba(255,255,255,0.85)"};
  --s2:${dark ? "rgba(20,22,34,0.88)" : "rgba(224,228,244,0.78)"};
  --s3:${dark ? "rgba(24,27,40,0.72)" : "rgba(212,217,238,0.65)"};
  --s4:${dark ? "rgba(30,33,48,0.62)" : "rgba(200,207,232,0.55)"};
  --b1:${dark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)"};
  --b2:${dark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.13)"};
  --t1:${dark ? "#F0F2FF" : "#1A1D2B"};
  --t2:${dark ? "#A5ADC8" : "#5A628A"};
  --t3:${dark ? "#68729A" : "#8A99BA"};
  --glass:${dark ? "rgba(255,255,255,0.015)" : "rgba(255,255,255,0.45)"};
  --glass-border:${dark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.5)"};
  --acc:${accent.v || accent};
  --acc2:${accent2 ? (accent2.v || accent2) : (accent.v || accent)};
  --accd:${accent.v || accent}20;
  --glow:${accent.v || accent}50;
  --red:#FF6B6B;--yellow:#FFD93D;--green:#4ADE80;
  --safe-b:env(safe-area-inset-bottom,0px);
  --shadow-sm: 0 4px 12px rgba(0,0,0,${dark ? 0.3 : 0.04});
  --shadow-md: 0 12px 32px rgba(0,0,0,${dark ? 0.4 : 0.08});
  --shadow-lg: 0 32px 80px rgba(0,0,0,${dark ? 0.6 : 0.12});
}
html,body{height:100%;width:100%;margin:0;padding:0;background:var(--bg);color:var(--t1);font-family:'${f}',sans-serif;-webkit-font-smoothing:antialiased;direction:${rtl ? "rtl" : "ltr"};transition:background .4s ease,color .4s ease;}
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
  background:${dark ? "rgba(10,11,18,0.70)" : "rgba(255,255,255,0.45)"};
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-right:1px solid var(--glass-border);
  display:flex;flex-direction:column;padding:22px 0 16px;
  overflow-y:auto;position:relative;z-index:2;
  box-shadow:${dark ? "8px 0 40px rgba(0,0,0,0.6)" : "4px 0 24px rgba(0,0,0,0.03)"};
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
.topbar{
  display:flex;align-items:center;gap:12px;
  padding:12px 20px;
  padding-top:max(12px,calc(12px + env(safe-area-inset-top)));
  background:${dark ? "rgba(10,11,18,0.72)" : "rgba(255,255,255,0.5)"};
  backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);
  border-bottom:1px solid var(--glass-border);
  flex-shrink:0;position:relative;z-index:10;
  box-shadow: 0 4px 30px rgba(0,0,0,0.05);
  transition:transform .35s cubic-bezier(.4,0,.2,1), max-height .35s cubic-bezier(.4,0,.2,1), padding .35s cubic-bezier(.4,0,.2,1), opacity .25s ease;
  will-change:transform;
  overflow:hidden;
  max-height:80px;
  opacity:1;
}
.topbar-calendar-hidden{
  transform:translateY(-100%);
  max-height:0!important;
  padding-top:0!important;
  padding-bottom:0!important;
  opacity:0;
  pointer-events:none;
  border-bottom:none;
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
  display:flex;align-items:center;gap:8px;
  background:${dark ? "rgba(12,13,22,0.88)" : "rgba(240,240,245,0.8)"};border:1.5px solid ${dark ? "rgba(100,120,220,0.12)" : "rgba(0,0,0,0.08)"};
  border-radius:12px;padding:0 12px;height:38px;
  transition:all .24s cubic-bezier(.4,0,.2,1);flex:1;max-width:280px;min-width:0;
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
  font-family:'Outfit',system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;flex:1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  color:var(--t1);letter-spacing:-.5px;
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
  width:38px;height:38px;border-radius:12px;
  background:var(--s1);border:1px solid var(--b1);
  display:flex;align-items:center;justify-content:center;
  font-size:18px;transition:all .25s cubic-bezier(.4,0,.2,1);flex-shrink:0;
  color:var(--t2);cursor:pointer;
}
.tb-btn:hover{border-color:var(--acc);color:var(--acc);transform:translateY(-2px);box-shadow:0 8px 16px var(--glow);}
.tb-btn:active{transform:scale(.95);}
.add-btn{
  height:42px;padding:0 20px;
  background:linear-gradient(135deg,${accent},${accent2});
  border-radius:12px;font-size:13.5px;font-weight:700;color:#fff;
  display:flex;align-items:center;gap:8px;border:none;
  box-shadow:none;transition:all .25s cubic-bezier(.4,0,.2,1);
  flex-shrink:0;cursor:pointer;white-space:nowrap;min-height:42px;
}
.add-btn:hover{transform:translateY(-2px);box-shadow:none;filter:brightness(1.1);}
.add-btn:active{transform:scale(.97);}

/* == CONTENT == */
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:14px 10px 90px;-webkit-overflow-scrolling:touch;min-height:0;}

/* == STAT CARDS == */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}
.stat{
  background: ${dark ? "rgba(8,9,15,0.96)" : "#e8eaf0"};
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)"};
  border-radius: 18px; padding: 16px 12px 14px;
  transition: all .35s cubic-bezier(.34,1.56,.64,1);
  cursor: pointer; position: relative; overflow: hidden;
  box-shadow: ${dark ? "0 12px 40px rgba(0,0,0,0.6)" : "var(--shadow-md)"};
  min-height:100px;display:flex;flex-direction:column;justify-content:space-between;
}
.stat:hover{transform:translateY(-5px) scale(1.02); box-shadow: ${dark ? "0 20px 60px rgba(0,0,0,0.7)" : "var(--shadow-lg)"}; border-color:${accent}80;}
.stat-val{font-family:'Instrument Serif',serif;font-size:32px;line-height:1;margin-bottom:6px;color:var(--t1);}
.stat-lbl{font-size:10px;color:var(--t3);font-weight:800;letter-spacing:1px;text-transform:uppercase;}
.stat-bar{height:4px;background:${dark ? "rgba(255,255,255,0.06)" : "var(--s4)"};border-radius:3px;margin-top:12px;overflow:hidden;}
.stat-bar-f{height:100%;border-radius:3px;transition:width 1.2s cubic-bezier(.34,1.56,.64,1);}

/* == PROG CARD == */
.prog-card{
  background:${dark ? "rgba(8,9,15,0.96)" : "#e8eaf0"};
  border:1px solid ${dark ? "rgba(255,255,255,0.06)" : accent + "28"};border-radius:18px;
  padding:16px 18px;display:flex;align-items:center;gap:14px;
  margin-bottom:18px;flex-wrap:wrap;
  box-shadow:${dark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 6px 24px " + accent + "18"};
}
.ring-svg{transform:rotate(-90deg);}
.ring-bg{fill:none;stroke:var(--s3);stroke-width:5;}
.ring-fg{fill:none;stroke:url(#ringGrad);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset 1s cubic-bezier(.34,1.56,.64,1);}
.prog-info{flex:1;min-width:130px;}
.prog-pct{font-family:'Fredoka One',cursive;font-size:26px;font-weight:400;background:linear-gradient(135deg,${accent},${accent2});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.prog-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.prio-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}
.pchip{font-size:10.5px;padding:4px 10px;border-radius:20px;font-weight:700;cursor:pointer;transition:transform .15s;}
.pchip:hover{transform:scale(1.06);}

/* == FILTER CHIPS == */
.filter-bar{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;margin-bottom:16px;padding:0 2px;-webkit-overflow-scrolling:touch;scrollbar-width:none;}
.filter-bar::-webkit-scrollbar{display:none;}
.fchip{
  font-size:13px;padding:0 16px;border-radius:8px;
  border:none;color:var(--t2);
  cursor:pointer;transition:background .18s cubic-bezier(.4,0,.2,1),color .18s;
  background:transparent;font-weight:500;white-space:nowrap;flex-shrink:0;
  letter-spacing:0.01px;height:32px;display:flex;align-items:center;gap:5px;
  user-select:none;
}
.fchip:hover{background:var(--s2);color:var(--t1);}
.fchip.on{
  background:${accent}18;
  color:${accent};font-weight:600;
}

/* == TASK CARDS == */
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:0 2px;}
.sec-title{font-size:11.5px;font-weight:900;color:var(--t3);display:flex;align-items:center;gap:6px;letter-spacing:1px;text-transform:uppercase;}
.view-row{display:flex;gap:7px;align-items:center;}
.vt-btn{width:32px;height:32px;border-radius:50%;background:transparent;border:none;display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--t3);transition:background .15s,color .15s;min-width:32px;min-height:32px;cursor:pointer;}
.vt-btn:hover{background:var(--s2);color:var(--t1);}
.vt-btn.on{background:${accent}18;color:${accent};}
.sort-btn{font-size:12px;color:var(--t2);padding:0 10px;background:transparent;border:none;border-radius:50px;font-weight:500;transition:background .15s,color .15s;height:32px;display:flex;align-items:center;gap:4px;cursor:pointer;letter-spacing:0;}
.sort-btn:hover{background:var(--s2);color:var(--t1);}
.task-list{display:flex;flex-direction:column;gap:9px;}
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;}
.glass-card{
  background:${dark ? "rgba(12,13,20,0.88)" : "rgba(255,255,255,0.72)"};
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border:1px solid ${dark ? "rgba(124,109,250,0.18)" : "rgba(255,255,255,0.85)"};
  border-radius:20px;
  box-shadow:${dark ? "0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)" : "0 8px 32px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.9)"};
}
.task{
  background:${dark ? "rgba(8,9,15,0.97)" : "rgba(232,234,240,0.99)"};
  border:1.5px solid ${dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.065)"};
  border-radius:16px;padding:16px 14px 15px 20px;
  display:flex;align-items:flex-start;gap:12px;
  cursor:pointer;transition:transform .2s cubic-bezier(.4,0,.2,1),box-shadow .2s cubic-bezier(.4,0,.2,1),border-color .2s ease;
  position:relative;overflow:hidden;
  box-shadow:${dark ? "0 4px 24px rgba(0,0,0,0.55)" : "0 2px 12px rgba(0,0,0,0.055),0 1px 3px rgba(0,0,0,0.04)"};
}
.task::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:16px 0 0 16px;transition:all .2s;}
.task:hover{border-color:${accent}40;transform:translateY(-2px);box-shadow:${dark ? "0 10px 36px rgba(0,0,0,0.45)" : `0 8px 32px ${accent}18,0 3px 12px rgba(0,0,0,0.07)`};}
.task:hover::before{opacity:1;}
.task.ph::before{background:linear-gradient(180deg,#ff6b6b,#ff4757);opacity:.85;}
.task.pm::before{background:linear-gradient(180deg,#ffd93d,#ff9f43);opacity:.85;}
.task.pl::before{background:linear-gradient(180deg,#6bcb77,#00d4aa);opacity:.85;}
.task.done-t{opacity:.42;}.task.done-t .t-title{text-decoration:line-through;color:var(--t3);}
.task.ov-t{}}
.task-grid .task{flex-direction:column;gap:9px;}.task-grid .t-act{opacity:1;}
.chk{
  width:24px;height:24px;
  border:2px solid var(--s4);border-radius:8px;
  flex-shrink:0;margin-top:1px;
  display:flex;align-items:center;justify-content:center;
  transition:all .22s cubic-bezier(.34,1.56,.64,1);background:var(--s2);
  min-width:24px;min-height:24px;
}
.chk.on{background:transparent;border:1.5px solid var(--s4);box-shadow:none;}
.chk.on:hover{background:rgba(255,107,107,.08);border-color:rgba(255,107,107,.35);}
.chk.on:hover svg{stroke:var(--red)!important;}
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
.ic-btn{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;transition:background .12s;color:${dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'};min-width:36px;min-height:36px;background:transparent;border:none;cursor:pointer;font-weight:400;}
.ic-btn:hover{background:${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'};color:${dark ? 'rgba(255,255,255,0.87)' : 'rgba(0,0,0,0.75)'};}
.ic-btn.del:hover{background:rgba(255,107,107,.10);color:var(--red);}

/* == EMPTY STATE == */
.empty{text-align:center;padding:80px 20px 60px;}
.empty-icon{font-size:56px;margin-bottom:16px;animation:float 3.5s ease-in-out infinite;opacity:.45;display:flex;align-items:center;justify-content:center;}
.empty-t{font-size:16px;color:var(--t2);margin-bottom:8px;font-weight:700;}
/* == ALL DONE CELEBRATION == */
@keyframes celebFloat{0%,100%{transform:translateY(0px) rotate(-2deg)}50%{transform:translateY(-14px) rotate(2deg)}}
@keyframes starPop{0%{opacity:0;transform:scale(0) rotate(0deg)}60%{opacity:1;transform:scale(1.2) rotate(20deg)}100%{opacity:1;transform:scale(1) rotate(0deg)}}
@keyframes celebFadeIn{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}}
@keyframes orbitSpin{0%{transform:rotate(0deg) translateX(62px) rotate(0deg)}100%{transform:rotate(360deg) translateX(62px) rotate(-360deg)}}
@keyframes shimmer{0%,100%{opacity:.35}50%{opacity:.9}}
.all-done-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px 80px;animation:celebFadeIn .5s cubic-bezier(.34,1.56,.64,1) both;}
.all-done-illo{animation:celebFloat 3.8s ease-in-out infinite;}
.all-done-title{font-size:22px;font-weight:800;color:var(--t1);margin-top:28px;margin-bottom:8px;font-family:'Instrument Serif',serif;}
.all-done-sub{font-size:14px;color:var(--t3);font-weight:400;}


/* == BOTTOM NAV == */
.bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;transition:transform .3s cubic-bezier(.4,0,.2,1);will-change:transform;padding-bottom:env(safe-area-inset-bottom,0px);background:${dark ? "rgba(6,7,12,0.98)" : "rgba(255,255,255,0.98)"};backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border-top:1px solid ${dark ? "rgba(100,120,220,0.10)" : "rgba(0,0,0,0.08)"};z-index:50;padding:10px 0 calc(10px + env(safe-area-inset-bottom,0px));box-shadow:${dark ? "0 -12px 40px rgba(0,0,0,0.7)" : "0 -8px 28px rgba(0,0,0,0.1)"};}
.bot-inner{display:flex;align-items:center;justify-content:space-around;padding:0 4px;}
.bot-item{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--t3);cursor:pointer;padding:6px 12px;position:relative;transition:all .2s cubic-bezier(.4,0,.2,1);min-height:52px;justify-content:center;}
.bot-item.on{color:${accent};}
.bot-item.on .bot-icon{transform:scale(1.18);filter:drop-shadow(0 3px 8px ${accent}70);}
.bot-item.on span:last-child{font-weight:800;letter-spacing:.3px;}
.bot-icon{font-size:24px;transition:transform .22s cubic-bezier(.4,0,.2,1);}
.bot-item:active .bot-icon{transform:scale(0.95);}
.bot-num{position:absolute;top:2px;right:2px;min-width:18px;height:18px;background:linear-gradient(135deg,#ff6b6b,#ff4757);border-radius:9px;font-size:9.5px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 4px;box-shadow:0 2px 8px rgba(255,71,87,.6);border:1.5px solid #fff;}
.fab{width:60px;height:60px;background:linear-gradient(135deg,${accent},${accent2});border-radius:18px;box-shadow:0 8px 32px ${accent}70,0 0 0 2px ${dark ? "rgba(6,7,12,1)" : "rgba(255,255,255,1)"};display:flex;align-items:center;justify-content:center;font-size:28px;color:#fff;font-weight:700;transition:all .24s cubic-bezier(.4,0,.2,1);border:none;cursor:pointer;}
.fab:hover{transform:scale(1.1);box-shadow:0 12px 40px ${accent}80,0 0 0 3px ${dark ? "rgba(4,5,10,.9)" : "rgba(255,255,255,.9)"};}
.fab:active{transform:scale(.94);}
.fab-lbl{font-size:9.5px;font-weight:800;color:${accent};margin-top:5px;letter-spacing:.2px;}

/* == OVERLAY & MODAL == */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0);backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:overlayFadeIn .22s ease;overflow:hidden;overscroll-behavior:none;touch-action:none;}
@keyframes overlayFadeIn{from{opacity:0}to{opacity:1}}
@keyframes sheetSlideUp{from{transform:translateY(100%) scale(.96);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}@keyframes sheetSlideDown{from{transform:translateY(0) scale(1);opacity:1}to{transform:translateY(100%) scale(.96);opacity:0}}@keyframes overlayFadeOut{from{opacity:1}to{opacity:0}}
@keyframes toolItemPop{from{opacity:0;transform:scale(.8) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes fo{from{opacity:0}to{opacity:1}}
.modal{background:${dark ? 'rgba(7,8,14,0.97)' : 'rgba(252,253,255,0.97)'};border:1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(210,215,230,0.80)'};border-radius:28px 28px 0 0;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;animation:sheetSlideUp .38s cubic-bezier(.32,1.2,.64,1);padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);box-shadow:0 -8px 60px rgba(0,0,0,0.28),0 0 0 1px ${dark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.9)'} inset;}
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
.m-foot{padding:12px 20px 16px;display:flex;gap:8px;flex-shrink:0;background:transparent;justify-content:flex-end;align-items:center;border-top:1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)'};}
.btn-c{height:40px;background:${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.055)'};border:none;border-radius:12px;font-size:15px;color:var(--acc);transition:all .15s;font-weight:400;display:flex;align-items:center;justify-content:center;letter-spacing:-.1px;font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif;padding:0 18px;cursor:pointer;min-width:80px;}
.btn-c:hover{background:${dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.09)'};}
.btn-s{height:40px;background:var(--acc);border-radius:12px;font-size:15px;font-weight:600;color:#fff;transition:all .15s;display:flex;align-items:center;justify-content:center;border:none;letter-spacing:-.2px;font-family:-apple-system,'SF Pro Text','Helvetica Neue',sans-serif;padding:0 22px;cursor:pointer;min-width:100px;box-shadow:0 2px 12px ${accent}55;}
.btn-s:hover{opacity:.88;box-shadow:0 4px 18px ${accent}66;}
.btn-s:disabled{opacity:.32;cursor:not-allowed;box-shadow:none;}

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
.cal-page{padding:0;display:flex;flex-direction:column;height:100%;background:var(--bg);min-height:0;overflow:hidden;position:absolute;inset:0;}
.cal-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 18px 10px;border-bottom:1px solid var(--b1);background:transparent;flex-shrink:0;}
.cal-header-center{display:flex;align-items:center;gap:8px;flex:1;justify-content:center;}
.cal-back-btn{width:34px;height:34px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;transition:all .2s;flex-shrink:0;}
.cal-back-btn:hover{background:var(--s3);color:var(--t1);}
.cal-back-btn:active{transform:scale(.92);}
.cal-month{font-size:20px;font-weight:700;color:var(--t1);letter-spacing:-0.3px;white-space:nowrap;}
.cal-nav{width:34px;height:34px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;color:var(--t2);cursor:pointer;transition:all .2s;}
.cal-nav:hover{background:var(--s3);color:var(--t1);}
.cal-today-btn{height:34px;padding:0 14px;border-radius:8px;background:var(--s2);border:1px solid var(--b1);color:var(--t2);font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;white-space:nowrap;}
.cal-today-btn:hover{background:var(--s3);color:var(--t1);}
.cal-view-tabs{display:flex;gap:2px;background:transparent;border-radius:8px;padding:4px;}
.cal-view-tab{height:32px;padding:0 14px;background:transparent;border:none;border-radius:4px;font-size:12px;font-weight:500;color:var(--t2);cursor:pointer;transition:all .2s;white-space:nowrap;}
.cal-view-tab.active{background:var(--s2);color:var(--t1);font-weight:600;}
.cal-view-tab:hover{background:var(--s3);}
.cal-grid-month{display:grid;grid-template-columns:repeat(7,1fr);gap:0;background:var(--b1);border:1px solid var(--b1);flex:1;overflow:hidden;min-height:0;align-content:stretch;}
.cal-day-header{background:var(--s1);padding:10px 4px;text-align:center;font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--b1);border-right:1px solid var(--b1);}
.cal-day-header:last-child{border-right:none;}
.cal-day-header.today-col{color:var(--t3)!important;background:var(--s1)!important;}
.cal-cell-month{background:var(--s1);padding:6px;border-right:1px solid var(--b1);border-bottom:1px solid var(--b1);position:relative;cursor:pointer;transition:background .15s;overflow:hidden;display:flex;flex-direction:column;min-height:0;max-height:100%;}
.cal-cell-month:last-child{border-right:none;}
.cal-cell-month:nth-child(7n){border-right:none;}
.cal-cell-month:nth-last-child(-n+7){border-bottom:1px solid var(--b1);}
.cal-cell-month:hover{background:var(--s2);}
.cal-cell-month.today .cal-cell-number{background:var(--acc);color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:11px;}
.cal-cell-month.selected{background:var(--accd);}
.cal-cell-number{font-size:11px;font-weight:500;color:var(--t1);width:24px;height:24px;display:flex;align-items:center;justify-content:center;margin-bottom:2px;flex-shrink:0;}
.cal-cell-month.other-month .cal-cell-number{color:var(--t3);opacity:0.4;}
.cal-event-dot{width:3px;height:3px;border-radius:50%;display:inline-block;margin-right:2px;}
.cal-month-event{font-size:9px;padding:2px 4px;border-radius:4px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#fff;font-weight:600;cursor:pointer;transition:all .2s;line-height:1.3;}
.cal-month-event:hover{opacity:0.85;}
.cal-month-more{font-size:8px;color:var(--t3);padding:0px 2px;font-weight:600;margin-top:1px;}
.cal-holiday-pill{font-size:8.5px;padding:2px 4px;border-radius:4px;margin-bottom:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600;cursor:default;line-height:1.3;background:var(--accd);color:var(--acc);border-left:2px solid var(--acc);}

/* Week/Day/Agenda Views */
.cal-agenda-list{flex:1;overflow-y:auto;}
.cal-event-group{padding:16px 20px;border-bottom:1px solid var(--b1);}
.cal-event-group-date{font-size:13px;font-weight:600;color:var(--t2);margin-bottom:10px;display:flex;align-items:center;gap:8px;}
.cal-event-card{background:var(--s1);border-left:4px solid #1a73e8;border-radius:8px;padding:12px;margin-bottom:8px;cursor:pointer;transition:all .2s;}
.cal-event-card:hover{background:var(--s2);box-shadow:0 2px 8px rgba(0,0,0,0.12);}
.cal-event-title{font-size:13px;font-weight:600;color:var(--t1);margin-bottom:4px;}
.cal-event-time{font-size:11px;color:var(--t3);}
.cal-empty-state{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;color:var(--t3);text-align:center;}
.cal-empty-icon{font-size:48px;margin-bottom:12px;opacity:0.4;}
.cal-empty-text{font-size:14px;margin-bottom:4px;color:var(--t2);}

/* Week View */
.cal-week-container{display:flex;flex:1;flex-direction:column;overflow:hidden;}
.cal-week-header{display:flex;background:var(--s1);border-bottom:1px solid var(--b1);height:80px;}
.cal-week-time-header{width:80px;padding:12px 8px;text-align:center;font-size:10px;font-weight:600;color:var(--t3);border-right:1px solid var(--b1);flex-shrink:0;}
.cal-week-days-header{display:flex;flex:1;overflow-x:auto;gap:0;}
.cal-week-day-header{flex:1;min-width:150px;padding:12px 8px;text-align:center;border-right:1px solid var(--b1);display:flex;flex-direction:column;justify-content:center;align-items:center;}
.cal-week-day-header:last-child{border-right:none;}
.cal-week-day-header.today{background:var(--s2);}
.cal-week-day-name{font-size:9px;color:var(--t3);text-transform:uppercase;margin-bottom:4px;}
.cal-week-day-num{font-size:16px;font-weight:600;color:var(--t1);}
.cal-week-day-header.today .cal-week-day-num{color:#1a73e8;}
.cal-week-content{display:flex;flex:1;overflow:hidden;}
.cal-week-times{width:80px;background:var(--s1);border-right:1px solid var(--b1);overflow-y:auto;overflow-x:hidden;flex-shrink:0;}
.cal-time-label{height:60px;padding:4px 8px;text-align:right;font-size:10px;color:var(--t3);border-bottom:1px solid var(--b1);}
.cal-time-label.first{padding-top:2px;}
.cal-week-days{display:flex;flex:1;overflow:auto;gap:0;}
.cal-day-col{flex:1;min-width:150px;border-right:1px solid var(--b1);position:relative;background:var(--bg);}
.cal-day-col:last-child{border-right:none;}
.cal-day-col.today{background:rgba(26,115,232,0.04);}
.cal-hour-row{height:60px;border-bottom:1px solid var(--b1);position:relative;}
.cal-hour-row.now::after{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:#ea4335;z-index:20;}
.cal-event-block{position:absolute;left:2px;right:2px;background:#1a73e8;border-radius:3px;padding:3px;color:#fff;font-size:11px;font-weight:500;overflow:hidden;cursor:pointer;transition:all .2s;border:1px solid rgba(0,0,0,0.15);}
.cal-event-block:hover{box-shadow:0 2px 8px rgba(0,0,0,0.2);}
.cal-event-block.high{background:#ea4335;}
.cal-event-block.medium{background:#fbbc04;color:#000;}
.cal-event-block.normal{background:#34a853;}\n

/* Task Grid */
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px;margin-top:4px;}


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

.export-area{background:var(--s2);border:1px solid var(--b1);border-radius:13px;padding:14px;font-size:12px;font-family:monospace;color:var(--t2);white-space:pre-wrap;max-height:200px;overflow-y:auto;margin-bottom:12px;}
.accent-grid{display:flex;gap:10px;flex-wrap:wrap;}
.accent-swatch{width:38px;height:38px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:all .22s;}
.accent-swatch.on{border-color:var(--t1);transform:scale(1.22);box-shadow:0 4px 16px var(--glow);}

/* == NOTIFICATIONS == */
.notif-badge{position:fixed;top:16px;right:16px;background:var(--s1);border:1.5px solid ${accent}45;border-radius:18px;padding:13px 17px;box-shadow:0 10px 36px rgba(0,0,0,.38),0 0 0 1px ${accent}18;z-index:400;animation:none;max-width:292px;}
@keyframes slideIn{from{opacity:0;transform:translateY(-22px) scale(.93)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
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


/* == RESPONSIVE == */
@media(max-width:920px){
  .sidebar{display:none!important;}
  /* Hide hamburger on mobile - not needed */
  .menu-btn{display:none!important;}
  /* Show StaredList logo on mobile */
  .mobile-logo{display:flex!important;}
  .bot-nav{display:block!important;}
  .add-btn{display:none!important;}
  .search-wrap{max-width:none!important;}
  .content{padding:14px 14px 135px!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;}
  .t-act{opacity:1!important;}
  .task-grid{grid-template-columns:repeat(2,1fr)!important;gap:12px!important;}
  /* Chat panel on mobile: no bottom nav, hug the bottom */
    .chat-inp{padding-bottom:calc(12px + env(safe-area-inset-bottom,0px))!important;}
  /* Topbar smaller on mobile */
  .topbar{padding:10px 14px!important;padding-top:max(10px,calc(10px + env(safe-area-inset-top)))!important;background:${dark ? "rgba(30,33,45,0.6)" : "rgba(255,255,255,0.6)"}!important;}
  .topbar-title{display:none!important;}
  .topbar-nonask{display:none!important;}
  /* Make topbar buttons smaller */
  .tb-btn{height:36px!important;width:36px!important;padding:0!important;font-size:16px!important;background:${dark ? "rgba(30,35,50,0.8)" : "rgba(240,240,245,0.8)"}!important;}
  /* Mobile: show only the 3 mobile buttons, hide desktop ones */
  .desktop-only-btn{display:none!important;}
  .mobile-only-btn{display:inline-flex!important;}
  /* CRITICAL: Modal must sit above bottom nav (80px) + safe area */
  .overlay{align-items:flex-end;padding-bottom:0!important;}
  .modal{max-height:85vh!important;border-radius:28px 28px 0 0!important;}
  .modal .m-foot{padding-bottom:calc(18px + env(safe-area-inset-bottom,0px))!important;}
  .modal.center{max-height:85vh!important;border-radius:24px!important;}
}
.bot-nav.hide-bot{transform:translateY(100%);pointer-events:none;visibility:hidden;}
.fab-wrap{display:flex;flex-direction:column;align-items:center;margin-top:-30px;transition:transform .3s cubic-bezier(.4,0,.2,1),opacity .3s ease;}
.bot-nav.hide-bot .fab-wrap{transform:translateY(40px);opacity:0;}
/* Desktop: hide mobile-specific buttons */
@media(min-width:921px){
  .mobile-only-btn{display:none!important;}
  .desktop-only-btn{display:inline-flex!important;}
  .bot-nav{display:none!important;}
  .menu-btn{display:none!important;}
  .topbar-logo-wrap{display:none!important;}
}
@media(max-width:440px){
  .row2{grid-template-columns:1fr!important;}
  .task-grid{grid-template-columns:1fr!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;}
  .prof-grid{grid-template-columns:1fr!important;}
  .pin-key{width:68px;height:68px;font-size:23px;}
}


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
.task-swipe-wrap{position:relative;overflow:hidden;border-radius:18px;margin-bottom:10px;background:var(--s1);}
.task-swipe-bg-r{position:absolute;inset:0;background:transparent;display:flex;align-items:center;padding-left:20px;border-radius:18px;}
.task-swipe-bg-l{position:absolute;inset:0;background:transparent;display:flex;align-items:center;justify-content:flex-end;padding-right:20px;border-radius:18px;}
.task-swipe-inner{position:relative;z-index:2;transition:transform .18s cubic-bezier(.4,0,.2,1);touch-action:pan-y;background:var(--s1);border-radius:18px;}

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
    .search-wrap input{font-size:16px!important;}
  .fab{width:60px!important;height:60px!important;}
  .settings-row{min-height:52px;}
  .qbtn{min-height:36px!important;}
  .stats-row{gap:6px!important;}
  .stat{border-radius:14px!important;padding:12px 10px 10px!important;}
  .prog-card{padding:14px 12px!important;border-radius:18px!important;}
  .task{border-radius:14px!important;margin-bottom:8px!important;}
  html,body{overflow:hidden;width:100%;padding:0;margin:0;}
  .cal-page{overflow:hidden!important;padding-bottom:0!important;position:absolute!important;inset:0!important;}
  .cal-header{padding:8px 10px!important;flex-shrink:0;}
  .cal-header-center{gap:4px!important;}
  .cal-month{font-size:15px!important;}
  .cal-back-btn{width:30px!important;height:30px!important;border-radius:8px!important;}
  .cal-nav{width:26px!important;height:26px!important;}
  .cal-today-btn{height:28px!important;padding:0 10px!important;font-size:10px!important;}
  .cal-day-header{font-size:9px!important;padding:5px 2px!important;letter-spacing:0!important;}
  .cal-grid-month{border-left:none!important;border-right:none!important;}
  .cal-cell-month{padding:2px 3px!important;}
  .cal-cell-number{font-size:10px!important;width:18px!important;height:18px!important;margin-bottom:1px!important;}
  .cal-month-event{font-size:7.5px!important;padding:1px 2px!important;}
  .cal-holiday-pill{font-size:7.5px!important;padding:1px 2px!important;}
  .cal-month-more{font-size:7px!important;}
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
//  🧠 LIBI BRAIN v4.0 — Maximum Intelligence Engine
//  Trained responses, deep reasoning, multi-domain mastery,
//  emotional intelligence, and true adaptive personality.
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
    return `${timeGreet}${hi}! I'm **LIBI** ✦ — your personal AI inside StaredList.${occupationNote}\n\n📊 Your snapshot:\n• ${active.length} active ${taskWords}\n• ${done.length} completed\n• ${overdue.length} overdue\n• ${pct}% completion rate${urgentNote}\n\nWhat do you need? Try: _"Plan my day"_, _"What's most urgent?"_, _"Motivate me"_, or just ask me anything. ✨`;
  }

  // =========================================================
  // 2. WHO ARE YOU / CAPABILITIES / SELF-IDENTITY
  // =========================================================
  if (/(who are you|what are you|what can you do|your (name|capabilities|features)|tell me about yourself|are you (ai|chatgpt|gpt|claude|gemini|real|human|a bot|an ai)|how (do you|does libi) work|are you smart|are you intelligent|libi v4|what version)/i.test(cleanMsg)) {
    return `I'm **LIBI V4.0** ✦ — the most advanced version of your personal AI productivity assistant, built for StaredList.\n\n**🆕 What's new in V4.0:**\n• 🧠 **60+ trained domains** — sleep science, habits, creativity, imposter syndrome, mindfulness, history, and more\n• 🎯 **Sharper task reasoning** — multi-factor urgency scoring, smarter day planning\n• 💙 **Deeper emotional intelligence** — burnout, loneliness, anger, celebration, gratitude\n• 📚 **Evidence-based knowledge** — everything backed by research, not generic platitudes\n• 🌍 **Multilingual awareness** — I recognise Malayalam, Hindi, Tamil, and more\n• 🌟 **Adaptive personality** — I respond differently based on your role, mood, and context\n• ⚡ **Natural task creation** — just say what you need and I'll add it instantly\n\n**💡 My full capabilities:**\n• 📋 **Task intelligence** — priorities, deadlines, patterns, overdue analysis\n• 📅 **Day planning** — real time-blocked schedules built from your actual tasks\n• 🧠 **Deep knowledge** — productivity, neuroscience, habits, health, science, career, finance, coding, creativity, relationships, and more\n• 💬 **Memory** — I remember your name, role, wake time, and key facts\n• 🎯 **Smart prioritisation** — AI-scored, tells you what to do first and exactly why\n• 💪 **Coaching** — honest motivation, stress relief, mental health support\n\n**🔒 Privacy first:** Your data stays on your device.\n\nI'm not ChatGPT or Gemini. I'm LIBI — purpose-built for *your* life and productivity. What do you need? ✦`;
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
    return `⏰ **Time Management${hi}:**\n\n**The hard truth:** You have the same 24 hours as the most productive people alive. The difference is what they say YES and NO to.\n\n**The GTD framework (David Allen):**\n1. **Capture** — write everything down immediately (StaredList exists for this)\n2. **Clarify** — what does "done" look like for each task?\n3. **Organise** — priority, category, due date\n4. **Review** — weekly check-in (10 min, Sundays)\n5. **Engage** — work the system, trust the plan\n\n**LIBI's 3 time laws:**\n• **Parkinson's Law:** Work expands to fill the time given. Time-box everything.\n• **Hofstadter's Law:** Everything takes longer than expected. Add 30% buffer to estimates.\n• **The planning fallacy:** We overestimate what we can do in a day, underestimate what we can do in a year.\n\n📅 Your **Daily Planner tab** auto-builds your schedule — open it and compare to reality!`;
  }

  // =========================================================
  // 12. GOALS & GOAL SETTING
  // =========================================================
  if (/(^goal|my goal|goals|milestone|achieve|ambition|long.?term|vision|life plan|dream|aspir|set a goal|big picture)/i.test(cleanMsg)) {
    return `🏆 **Goals${hi}:**\n\n**SMART Goal framework:**\n• **S**pecific — "Run a 5K" not "get fit"\n• **M**easurable — you can track progress\n• **A**chievable — hard but realistic\n• **R**elevant — connected to what you actually value\n• **T**ime-bound — deadlines create urgency\n\n**The deeper truth:** Most people set goals but don't build the system that leads to them. Goals are the direction. **Daily habits and tasks** are the engine.\n\n**In StaredList:**\n→ **Goals tab** — milestones, progress bars, deadlines\n→ **⚡ AI Breakdown** (in LIBI's Breakdown tab) — type any goal, I'll break it into a real task plan\n→ **Habits tab** — the daily disciplines that compound into big outcomes\n\n${active.length > 0 ? `💡 You have ${active.length} active ${taskWords} — are any connected to a bigger goal? If not, that's worth thinking about.` : "Open the Goals tab and set your first target — I'll help you break it down. ✦"}`;
  }

  // =========================================================
  // 13. HABITS & ROUTINES
  // =========================================================
  if (/(habit|routine|streak|consistency|build (a|the) habit|discipline|self.?control|willpower|daily practice|every day|build (a )?(morning|evening|night) routine)/i.test(cleanMsg)) {
    return `🔁 **Habits${hi}:**\n\n**The science (from Atomic Habits by James Clear):**\n• Habits aren't built by willpower — they're built by **identity and environment design**\n• The habit loop: **Cue → Craving → Response → Reward**\n• To build a habit: make it obvious, attractive, easy, and satisfying\n• To break one: make it invisible, unattractive, difficult, and unsatisfying\n\n**LIBI's habit rules:**\n1. **Start embarrassingly small** — "2 push-ups" not "30 min workout"\n2. **Attach to existing anchors** — "After coffee, I will journal for 2 min"\n3. **Never miss twice** — one miss is an accident, two is the start of a new habit\n4. **Track it** — what gets measured gets done\n\n**In StaredList:** Habits tab → track daily → build streaks 🔥\n\nWhat habit are you trying to build${hi}? Tell me and I'll design a start plan.`;
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
    return `🥗 **Nutrition${hi}:**\n\n**What actually moves the needle:**\n• 🥦 **Whole foods first** — vegetables, fruits, legumes, whole grains, lean proteins\n• 💧 **Hydration** — 2-3L water/day; most people are chronically dehydrated (it wrecks focus)\n• 🥩 **Enough protein** — essential for muscle, satiety, and brain function (0.8-1g per kg)\n• 🚫 **Limit ultra-processed food** — they hijack hunger hormones and make overeating automatic\n\n**Quick wins:**\n• Add a vegetable to every meal — just one\n• Replace one sugary drink with water daily\n• Eat protein at breakfast — reduces cravings all day\n• Meal prep Sunday → removes bad decisions when tired on weekdays\n\n**The real secret:** No diet beats one you can maintain for life. **Sustainability > perfection** — a consistently imperfect diet beats a perfect one you abandon.\n\n💡 Add "drink 2L water" or "prep meals" as a **Habit in StaredList**!`;
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
  // =========================================================
  if (/\b(money|finance|budget|budgeting|saving|savings|debt|invest(ing|ment)?|financial|broke|spending|expense|income|rent|bills|crypto|stocks?|rich|wealth|compound interest|emergency fund|retire(ment)?)\b/i.test(cleanMsg)) {
    return `💰 **Financial basics${hi}:**\n\n**The correct order (do these in sequence):**\n1. 🛡️ **Emergency fund** — 3-6 months of expenses in a liquid account. Non-negotiable.\n2. 💳 **Kill high-interest debt** — credit card debt at 20%+ is a financial emergency. Pay it first.\n3. 📈 **Invest consistently** — index funds, long term. Time in market beats timing the market.\n4. 🎯 **Budget with 50/30/20** — 50% needs, 30% wants, 20% savings/investment\n\n**Compound interest — the most important concept:**\n$1,000 at 7% return for 40 years = $14,974. Starting 10 years later = only $7,612. Time is everything.\n\n**Mindset shifts:**\n• Pay yourself first — automate savings *before* you see the money\n• Lifestyle inflation is the enemy of wealth — earnings up doesn't mean lifestyle up\n• Rich is a feeling, wealthy is a position — focus on the latter\n\n💡 Add financial goals to StaredList's **Goals tab** — "save £500/month" with a milestone tracker!`;
  }

  // =========================================================
  // 21. CAREER / JOB
  // =========================================================
  if (/\b(career|job search|interview|resume|cv|salary|promotion|raise|quit|resign|unemployed|fired|laid off|workplace|side hustle|networking|linkedin)\b/i.test(cleanMsg)) {
    return `💼 **Career${hi}:**\n\n**Job searching:**\n• Tailor every CV to the specific role — generic ones get filtered in seconds\n• 70-80% of jobs are filled via network, not job boards (LinkedIn data)\n• Prepare 5 STAR stories (Situation, Task, Action, Result) — they cover 90% of interview questions\n• Follow up within 24 hours of any interview — most candidates don't\n\n**Growing in your role:**\n• Solve problems before being asked — this is what "leadership potential" actually means\n• Communicate your wins clearly — people cannot reward what they can't see\n• Build lateral relationships, not just upward ones\n\n**On quitting:**\n• First ask: is it the *job* or the *culture*? They're different problems.\n• Financial runway before quitting: 3-6 months expenses saved\n• Never burn bridges — the world is small and reputation is long\n\n${isFreelance ? `**Freelance specific:** Raise rates once a year minimum. Your best clients will stay. The ones who leave were the problem.\n\n` : ""}💡 Add career tasks — interviews, applications, learning goals — right to StaredList!`;
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
    return `📚 **Books${hi}:**\n\n**Essential reads by category:**\n\n**Productivity & habits:**\n• *Atomic Habits* — James Clear (the definitive habit guide)\n• *Deep Work* — Cal Newport (protecting focused time)\n• *Getting Things Done* — David Allen (the original system)\n\n**Decision-making & thinking:**\n• *Thinking, Fast and Slow* — Daniel Kahneman\n• *The Black Swan* — Nassim Taleb\n\n**Resilience & meaning:**\n• *Man's Search for Meaning* — Viktor Frankl\n• *Can't Hurt Me* — David Goggins\n\n**Career & business:**\n• *Zero to One* — Peter Thiel\n• *The Mom Test* — Rob Fitzpatrick\n• *So Good They Can't Ignore You* — Cal Newport\n\n**Mindset:**\n• *Mindset* — Carol Dweck (growth vs fixed)\n• *The Power of Now* — Eckhart Tolle\n\n**How to actually retain what you read:**\n1. Take notes *after* each chapter (not during — highlights are procrastination)\n2. Explain the key idea to someone else\n3. Apply one insight within 24 hours\n4. Review your notes 1 week later\n\n💡 Add "Read 20 pages of [title]" as a daily **Habit** in StaredList!`;
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
  // 39. EVERYTHING / FEATURES / WHAT CAN STARREDLIST DO
  // =========================================================
  if (/(everything|all features|what (can|does) starredlist (do|have)|feature list|full features|capabilities|show everything)/i.test(cleanMsg)) {
    return `✦ **StarredList Ultimate — Everything${hi}:**\n\n📋 **Tasks** — priorities, categories, due dates, subtasks, tags, photos, recurring\n⏰ **Reminders** — 6 alarm tones, date+time picker, OS notifications\n📅 **Calendar** — month view with task indicators\n📊 **Statistics** — completion charts, streaks, categories\n⏱ **Focus & Time** — Pomodoro + per-task time tracking\n🏆 **Goals** — milestones, progress bars, deadlines\n🔁 **Habits** — daily tracking, streaks, 14-day grid\n⏰ **Daily Planner** — auto time-blocked schedule\n📝 **Notes** — rich text, colors, tags, pin, search\n🗂️ **Board** — full Kanban drag & drop\n👫 **Team** — real-time Firebase collaboration\n✦ **LIBI AI** — that me! Deep chat + full offline intelligence\n🌌 **Focus Mode** — fullscreen zen workspace\n⌘K **Command palette** — keyboard shortcuts\n🎵 **12 ambient music tracks** built in\n🌍 **5 languages** with RTL support\n🖼️ **9 wallpaper themes**\n📱 **Works on Android + any browser**\n\nWhat do you want to explore${hi}?`;
  }

  // =========================================================
  // 40. SLEEP — deep, evidence-based advice
  // =========================================================
  if (/\b(sleep|insomnia|can'?t sleep|tired|fatigue|exhausted|wake up tired|nap|rest|bedtime|sleep schedule|sleep better|oversleep|sleep deprivation|restless|tossing and turning)\b/i.test(cleanMsg)) {
    return `😴 **Sleep${hi} — the most underrated performance tool:**\n\n**Why it matters more than almost anything:**\nSleep deprivation of even 1-2 hours drops cognitive performance equivalent to being legally drunk. Memory consolidation, emotional regulation, immune function, and metabolism all depend on it.\n\n**Evidence-based sleep hygiene:**\n• 🕰️ **Fixed wake time** — wake at the same time every day, even weekends. This anchors your circadian rhythm.\n• ☀️ **Morning light** — get outside within 30 min of waking. This sets your cortisol peak and ensures melatonin fires correctly ~14 hours later.\n• ❄️ **Cool room** — 18°C/65°F is optimal. Core body temp must drop to initiate sleep.\n• 📵 **No screens 60 min before bed** — blue light suppresses melatonin. Use night mode or blue-light glasses if needed.\n• 🍷 **No alcohol** — it sedates but destroys sleep architecture, especially REM.\n• ☕ **Caffeine cut-off at 2pm** — caffeine has a 6-hour half-life. A 3pm coffee means 50% of it is still in your blood at 9pm.\n• 🛏️ **Bed = sleep only** — don't work, scroll, or watch TV in bed. Train your brain.\n\n**If you wake up at 3am:**\nDon't check your phone. Don't look at the clock. Lie still with eyes closed — even resting without sleep restores some cognitive function.\n\n**Power naps:** 10-20 min max before 3pm. Set an alarm. Longer naps or later naps wreck night sleep.\n\n${active.length > 0 ? `💡 Exhausted and have ${active.length} ${taskWords}? Complete just **one** — even a small one. The sense of progress helps your brain relax tonight.` : `Your task list is clear — no work anxiety tonight. Just rest. ✨`}`;
  }

  // =========================================================
  // 41. HABITS — building and breaking them
  // =========================================================
  if (/\b(habit(s)?|routine|daily routine|build a habit|break a habit|consistency|discipline|willpower|morning routine|evening routine|ritual|streak)\b/i.test(cleanMsg)) {
    return `🔁 **Habits${hi} — how they actually work:**\n\n**The neuroscience:** Habits are stored in the basal ganglia — the brain's automation centre. Once a habit is wired, it requires almost no conscious effort. That's the goal.\n\n**The Habit Loop (Charles Duhigg):**\n🔔 **Cue** → ⚙️ **Routine** → 🏆 **Reward**\nTo build a new habit: attach it to an existing cue. To break one: change the routine, keep the reward.\n\n**James Clear's 4 Laws (Atomic Habits):**\n1. **Make it obvious** — put your book by your bed, your gym shoes by the door\n2. **Make it attractive** — pair habits with things you enjoy (audiobook only during walks)\n3. **Make it easy** — reduce friction to zero. 2-minute rule: scale it down until it's effortless\n4. **Make it satisfying** — track it. Crossing off a habit streak feels genuinely good.\n\n**The research on streaks:** Missing once is human. Missing twice is starting a new habit. Never miss twice.\n\n**Timeline:** New neural pathways take 21-66 days depending on complexity. Most people quit at day 10. The discomfort at day 10 is neurological — it's literally your brain deciding whether this is worth automating.\n\n🔁 **Use LIBI's Habits tab** — it tracks your streaks, shows a 14-day grid, and gives you the visual reward of consistency. Add your first habit now!`;
  }

  // =========================================================
  // 42. DIET / NUTRITION deeper
  // =========================================================
  if (/\b(eat(ing)?|food|nutrition|diet|meal|hungry|weight loss|lose weight|healthy eating|junk food|calories|protein|carbs|fasting|intermittent fast|vegan|vegetarian|metabolism)\b/i.test(cleanMsg)) {
    return `🥗 **Nutrition${hi} — what actually works:**\n\n**The basics that 90% of experts agree on:**\n• 🥩 **Protein first** — 1.6-2.2g per kg of bodyweight. Preserves muscle, keeps you full longest.\n• 🌿 **Eat real food** — the less processed, the better. If it has more than 5 ingredients, think twice.\n• 💧 **Hydration** — thirst is often mistaken for hunger. Drink water first.\n• 🥦 **Vegetables at every meal** — fibre feeds gut bacteria which regulate mood, immunity, and metabolism.\n• 🚫 **Ultra-processed food is the enemy** — not fat, not carbs. Highly engineered food hijacks your hunger signals.\n\n**Weight loss — the only thing that matters:**\nCalorie deficit. Period. Every diet that works (keto, intermittent fasting, vegan) works because it creates a deficit. Find the method that's sustainable *for you*.\n\n**The worst diet is the one you can't maintain.** A "bad" diet you stick to beats a "perfect" diet you quit in 3 weeks.\n\n**Meal timing:**\n• Breakfast isn't mandatory — if you're not hungry, don't eat\n• Eating 3-4 hours before bed improves sleep quality\n• Protein + fat breakfast = stable energy; carb-only breakfast = energy crash by 10am\n\n**The 80/20 rule:** Eat well 80% of the time. The 20% won't break you. Guilt over food is worse than the food.\n\n${topTask ? `💪 Energy = focus = productivity. Fuel yourself and tackle **"${topTask.title}"** — your top task right now.` : ""}`;
  }

  // =========================================================
  // 43. EXERCISE / FITNESS
  // =========================================================
  if (/\b(exercise|workout|gym|fitness|run(ning)?|walk(ing)?|strength|muscle|cardio|sport|active|physical|body|weight training|yoga|HIIT|get fit|stay fit)\b/i.test(cleanMsg)) {
    return `💪 **Fitness${hi} — evidence-based:**\n\n**The minimum effective dose (WHO guidelines):**\n• 150 min moderate cardio/week (brisk walk counts)\n• 2× strength training sessions/week\nThat's it. Everything beyond this is optimisation, not requirement.\n\n**Why strength training matters for everyone:**\nMuscle is the organ of longevity. It regulates blood sugar, metabolism, bone density, and functional independence into old age. It's not about aesthetics — it's about living well at 70.\n\n**Cardio:** The best cardio is the one you'll do consistently. Walking is underrated. 8,000-10,000 steps/day has strong research behind it.\n\n**The truth about motivation:**\nMotivation is a terrible workout partner — it comes and goes. Systems are better. Schedule workouts like meetings. Put your gym clothes out the night before. Make the decision zero times by having a fixed plan.\n\n**Getting started:**\n• Week 1: Walk 20 min, 5 days. Just that.\n• Week 2-4: Add 2 bodyweight sessions (push-ups, squats, planks)\n• Month 2+: Add resistance, add complexity\n\n**Recovery matters as much as training.** Sleep is when muscle is built. A rest day is not a wasted day.\n\n🔁 Add "Exercise 20 min" as a **Habit** in StaredList — the streak tracker will keep you honest.`;
  }

  // =========================================================
  // 44. STUDY TIPS — for students and learners
  // =========================================================
  if (/\b(study|studying|exam|test|revision|memorise|memorize|learn faster|retain|university|college|school|assignment|essay|thesis|homework|notes|lecture)\b/i.test(cleanMsg)) {
    return `📖 **Study techniques${hi} — what the science actually says:**\n\n**The most effective methods (ranked by research):**\n\n1. 🔄 **Spaced repetition** — review material at increasing intervals. Anki app is the gold standard. Beats re-reading by a factor of 3x.\n2. ✍️ **Active recall** — close the book and write what you remember. Retrieve, don't re-read. Testing yourself *is* studying.\n3. 🗣️ **The Feynman Technique** — explain the concept as if teaching a 10-year-old. You instantly discover the gaps in your understanding.\n4. 🍅 **Pomodoro sessions** — 25 min focused → 5 min break. Use the Focus tab right now.\n5. 📝 **Interleaved practice** — mix subjects. Studying one topic for 3 hours straight feels productive but isn't. Switch every 45 min.\n\n**What doesn't work (but feels like it does):**\n• Highlighting — passive, creates illusion of learning\n• Re-reading — same\n• Cramming — works for the test, gone in 48 hours\n• Studying with music with lyrics — splits attention\n\n**Environment matters:**\n• Same place, same time — your brain learns context cues\n• Phone in another room (not face-down — *another room*)\n• Temperature slightly cool helps alertness\n\n${isStudent ? `You're a student${hi} — you've got this. Use the **Focus tab** for Pomodoro sessions and add your revision tasks with due dates. I'll help you track everything. 🎓` : `These techniques work for any kind of learning — not just school. Apply them to whatever you're studying now. 🧠`}`;
  }

  // =========================================================
  // 45. TIME MANAGEMENT
  // =========================================================
  if (/\b(time management|not enough time|run out of time|wasting time|time (waster|wasting)|procrastinat|distract(ed|ion)|can'?t manage|too busy|always busy|time flies|where did the time go|time block(ing)?|prioriti[sz]e)\b/i.test(cleanMsg)) {
    return `⏰ **Time management${hi} — real strategies:**\n\n**First, the truth:** You can't manage time. You can only manage decisions about what you do *with* time. There are always 24 hours.\n\n**The most powerful techniques:**\n\n🎯 **Eat the Frog (Brian Tracy):** Do your hardest, most important task *first*. Before email, before messages. Everything else is easier after that.\n\n📊 **Time blocking:** Assign every hour of your day to a category in advance. Don't have a to-do list — have a schedule.\n\n🚫 **The 2-minute rule:** If it takes less than 2 minutes, do it immediately. If it needs more, schedule it.\n\n❌ **Say no more:** Every yes to something unimportant is a no to something that matters. "No" is a complete sentence.\n\n📵 **Protect deep work time:** 90-120 min uninterrupted work sessions produce more than 4 hours of distracted work. Guard these with your life.\n\n📬 **Batch communications:** Check email/messages 2-3 times per day at fixed times. Constant checking kills flow state.\n\n**The uncomfortable insight:** "I don't have time" usually means "this isn't a priority." That's okay — own it. But be honest with yourself.\n\n💡 **Ask LIBI:** _"Plan my day"_ — I'll build a time-blocked schedule from your actual tasks right now.`;
  }

  // =========================================================
  // 46. GOAL SETTING
  // =========================================================
  if (/\b(goal(s)?|set a goal|achieve|ambition|dream|vision|new year|resolution|target|milestone|long.?term|short.?term|5 year|life goal|what do i want|purpose|direction)\b/i.test(cleanMsg)) {
    return `🎯 **Goal setting${hi} — done properly:**\n\n**Why most goals fail:**\nVague goals produce vague results. "Get fit" is a wish. "Run 5km in under 30 min by June 1st" is a goal.\n\n**The SMART framework (still the best):**\n• **S**pecific — what exactly?\n• **M**easurable — how will you know?\n• **A**chievable — stretch, but realistic\n• **R**elevant — does it align with what actually matters to you?\n• **T**ime-bound — by when?\n\n**Beyond SMART — what research adds:**\n• **Write it down** — goals written down are 42% more likely to be achieved (Dr. Gail Matthews)\n• **Tell someone** — social accountability changes the game\n• **Process goals over outcome goals** — "Write 500 words per day" beats "Finish my book"\n• **Weekly review** — 10 minutes every Sunday reviewing your goals dramatically improves follow-through\n\n**The identity shift (James Clear):** Instead of "I want to run a marathon" → "I am a runner." Every action either confirms or denies your identity.\n\n**Anti-goals:** Also decide what you're *not* doing. Saying yes to this goal means saying no to other things. Name them.\n\n🏆 **Use StaredList's Goals tab** — add your goal with a deadline and I'll help you build milestones. Start now: what's one thing you want to achieve in the next 90 days?`;
  }

  // =========================================================
  // 47. LEARNING — meta-learning, how to learn anything
  // =========================================================
  if (/\b(how to learn|learn anything|meta.?learn|learn fast(er)?|learn (a )?skill|pick up|get good at|master|become (good|great|expert|better) at|improve at)\b/i.test(cleanMsg)) {
    return `🧠 **How to learn anything${hi}:**\n\n**The best learners don't study harder — they study smarter. Here's how:**\n\n**Phase 1: Deconstruct (Josh Waitzkin / Tim Ferriss)**\n• What are the 20% of concepts that explain 80% of the skill?\n• Find the minimum effective dose of foundational knowledge\n• Ask: "What does someone with 2 years' experience know that a beginner doesn't?"\n\n**Phase 2: Learn with stakes**\n• Don't study theory → practice theory. Apply immediately.\n• The discomfort of being bad at something IS the learning\n• Embrace beginner's mind — don't let ego slow you down\n\n**Phase 3: Feedback loops**\n• The tighter the feedback loop, the faster you learn\n• Find a mentor, coach, or community that gives honest feedback\n• Record yourself (video, audio, writing) — you can't see your own blind spots\n\n**Proven techniques:**\n• 🔄 Spaced repetition (Anki)\n• ✍️ Active recall over re-reading\n• 🗣️ Teach what you learn within 24 hours\n• 🎯 Deliberate practice — focused on weaknesses, not strengths\n\n**The 20-hour rule (Josh Kaufman):** 20 hours of deliberate, focused practice is enough to go from complete beginner to "reasonably good" at almost any skill. That's 45 minutes per day for a month.\n\nWhat are you trying to learn${hi}? Tell me and I'll build you a specific plan. 🚀`;
  }

  // =========================================================
  // 48. MINDFULNESS / MEDITATION
  // =========================================================
  if (/\b(mindful(ness)?|meditat(e|ion)|breath(ing)?|calm|peace(ful)?|present|awareness|zen|anxiety relief|ground(ing|ed)|panic attack|overwhelm(ed)?)\b/i.test(cleanMsg)) {
    return `🧘 **Mindfulness${hi} — practical, not mystical:**\n\n**What meditation actually does (neuroscience):**\nRegular meditation physically thickens the prefrontal cortex (decision-making, focus) and shrinks the amygdala (stress, reactivity). 8 weeks of daily practice produces measurable brain changes.\n\n**The simplest practice that works:**\n1. Sit comfortably. Close eyes.\n2. Focus on your breath — specifically the sensation at your nostrils or the rise of your chest.\n3. When your mind wanders (it will, every 10-15 seconds) — notice that it wandered, and gently return.\n4. That noticing + returning IS the practice. Every return = one mental rep.\n5. Start with **5 minutes**. Use a timer.\n\n**Right now — Box Breathing (used by Navy SEALs):**\n• Breathe in for **4 counts**\n• Hold for **4 counts**\n• Breathe out for **4 counts**\n• Hold for **4 counts**\n• Repeat 4 times\n\nThis activates the parasympathetic nervous system within 60-90 seconds. It's physiologically impossible to stay anxious while doing this correctly.\n\n**Best apps:** Insight Timer (free), Headspace, Waking Up (Sam Harris — science-based).\n\n**The insight:** You can't stop thoughts. But you can change your *relationship* to them. Thoughts are clouds passing — you are the sky. 🌤️`;
  }

  // =========================================================
  // 49. CREATIVITY / CREATIVE BLOCK
  // =========================================================
  if (/\b(creativ(e|ity|ity block)|creative block|writer'?s block|no ideas|brainstorm|inspiration|stuck (on|creatively)|can'?t think of|art|design(er)?|music(ian)?|draw(ing)?)\b/i.test(cleanMsg)) {
    return `🎨 **Creativity${hi} — how it actually works:**\n\n**The myth:** Creativity is a bolt of lightning that strikes the gifted. \n**The truth:** Creativity is a skill built through volume, constraints, and cross-pollination of ideas.\n\n**Why you feel blocked:**\nCreative block is almost always one of three things:\n1. **Perfectionism** — you're judging before you've created. Separate creation from editing.\n2. **Low input** — you can't output what you haven't input. Read, watch, explore, consume.\n3. **Fear** — of being wrong, bad, or embarrassed. The solution is volume: make more things.\n\n**Techniques that actually work:**\n• 📝 **Morning Pages (Julia Cameron):** Write 3 pages of raw, uncensored thought every morning. Clears creative static.\n• ⏱️ **Constraints breed creativity:** "Write a story in 6 words." "Design with only 2 colours." Limits force ingenuity.\n• 🚶 **Walk without your phone:** Stanford research shows walking increases creative output by 81%. The default mode network (creative thinking) activates during physical movement.\n• 🔀 **Cross-domain thinking:** The best ideas come from connecting unrelated fields. Read outside your area.\n• 💤 **Sleep on it:** The brain's default mode network actively solves problems during rest and dreams.\n\n**The only real cure for creative block:** Create anyway. Make something bad. Bad work leads to good work. Blank pages lead nowhere.\n\nWhat are you trying to create${hi}?`;
  }

  // =========================================================
  // 50. PRODUCTIVITY SYSTEMS
  // =========================================================
  if (/\b(productivity system|GTD|getting things done|second brain|notion|obsidian|PKM|knowledge management|inbox zero|kanban|agile|scrum|bullet journal|zettelkasten|PARA method|time blocking)\b/i.test(cleanMsg)) {
    return `⚙️ **Productivity systems${hi}:**\n\n**The most popular systems explained:**\n\n📥 **GTD (David Allen):** Capture everything into a trusted system. Process it. Organise by context. Review weekly. The goal: your brain as a processor, not a storage device.\n\n🧠 **Second Brain (Tiago Forte):** Digital note-taking as an exobrain. PARA method: Projects, Areas, Resources, Archives. Best for knowledge workers who consume a lot of information.\n\n📋 **Kanban:** Visual columns (To Do → In Progress → Done). Best for projects and teams. StaredList's **Board tab** is a full Kanban board!\n\n📓 **Bullet Journal:** Analogue system, notebook-based. Migration process forces you to decide what actually matters. Best for people who prefer pen and paper.\n\n🍅 **Time Blocking + Pomodoro:** Schedule every hour. Work in 25-min blocks. Best for deep work and focus.\n\n**The truth about systems:** The best system is the one you'll actually use. Start simple — a to-do list you use beats a complex system you abandon.\n\n**StaredList IS a full productivity system:** Tasks + Kanban + Goals + Habits + Focus + Notes + Planner + AI (me 👋). You don't need another app.\n\n💡 What are you trying to organise? Tell me and I'll help you set up the right workflow.`;
  }

  // =========================================================
  // 51. IMPOSTER SYNDROME
  // =========================================================
  if (/\b(imposter syndrome|imposter|not good enough|fraud|don'?t belong|everyone else is better|fake it|unqualified|who am i to|out of my depth|not smart enough|not talented)\b/i.test(cleanMsg)) {
    return `💙 **Imposter syndrome${hi} — you're not alone:**\n\n**First: the data.** Imposter syndrome was identified in 1978. Studies show it affects ~70% of people at some point — including Nobel Prize winners, CEOs, and world-class athletes. If you feel it, you are almost certainly NOT a fraud. Actual frauds don't worry about being frauds.\n\n**Why it happens:**\nYour brain has direct access to your own doubts, fears, and mistakes — but only the edited highlight reel of other people. You're comparing your *interior* to their *exterior*. It's a completely unfair comparison.\n\n**What actually helps:**\n• 📋 **Keep a "wins file"** — document every compliment, achievement, and piece of positive feedback you receive. Re-read it when the voice gets loud.\n• 🗣️ **Talk about it** — when you do, you'll find almost everyone else feels the same way\n• 🔄 **Reframe "I don't belong here"** → "I'm growing into this"\n• 📊 **Collect evidence** — every task you complete, every skill you build, every problem you solve. The evidence is real.\n• 🧠 **Separate feelings from facts** — feeling like a fraud is not evidence of being one\n\n**The LIBI truth:** The fact that you care enough to doubt yourself means you have standards. That's not a weakness — it's the seed of quality.\n\nYou belong here. Keep going. 💙`;
  }

  // =========================================================
  // 52. ASKING FOR HELP / HOW TO USE LIBI
  // =========================================================
  if (/\b(help|how (do i|can i|to) use|what (can|do) (i|you)|commands|tips for (you|libi)|tutorial|guide me|show me how|getting started|what should i (ask|say|type))\b/i.test(cleanMsg)) {
    return `✦ **LIBI Guide${hi} — everything you can ask me:**\n\n**📋 Task & Planning:**\n• _"Plan my day"_ → I build a real time-blocked schedule\n• _"What should I do first?"_ → AI-scored priority ranking\n• _"What's overdue?"_ → Full overdue analysis + recovery plan\n• _"Show my tasks"_ → Formatted task list with priorities\n• _"Remind me to [task] tomorrow"_ → I add it instantly\n\n**🧠 Knowledge & Advice:**\n• _"Explain [any topic]"_ → Deep explanations on almost anything\n• _"How do I learn [skill]?"_ → Personalised learning plan\n• _"Give me productivity tips"_ → Proven strategies\n• _"Tell me about [science/history/tech/finance]"_ → I know a lot\n\n**💙 Wellbeing:**\n• _"I'm stressed"_ → Breathing, grounding, task clarity\n• _"Motivate me"_ → Real push, not empty cheerleading\n• _"I'm not feeling it today"_ → Honest support\n• _"I can't sleep"_ → Evidence-based sleep science\n\n**📊 Progress:**\n• _"How am I doing?"_ → Full stats breakdown\n• _"My completion rate"_ → Detailed analytics\n\n**🎯 Fun:**\n• _"Tell me a joke"_ → I try 😄\n• _"Give me a quote"_ → Curated wisdom\n• _"Ask me anything"_ — seriously, anything\n\n${active.length > 0 ? `\nRight now you have **${active.length} ${taskWords}**. Want me to plan your day around them? 🎯` : "Your list is clear — perfect time to set a new goal!"}`;
  }

  // =========================================================
  // 53. THANK YOU / COMPLIMENTS
  // =========================================================
  if (/\b(thank(s| you)|you'?re (amazing|great|awesome|helpful|the best)|love you|you'?re good|appreciate (you|it|that)|well done libi|good (job|bot|ai))\b/i.test(cleanMsg)) {
    const responses = [
      `✦ That genuinely means something${hi}. I'm built to help, and knowing it's working makes every response worth it.\n\nNow — back to those **${active.length} ${taskWords}**. What's next? 💪`,
      `💙 Thank you${hi}. I'm here every time you need a push, a plan, or just someone to think with.\n\n${topTask ? `Speaking of which — **"${topTask.title}"** is still waiting. Want to tackle it? 🎯` : "Your slate is clean. What do you want to build next? ✦"}`,
      `✨ You're very welcome${hi}. That's exactly why LIBI exists — to be the productivity partner that actually knows *your* context, not generic advice.\n\nAnything else I can help with? 🚀`,
    ];
    return responses[new Date().getSeconds() % responses.length];
  }

  // =========================================================
  // 54. SMALL TALK / HOW ARE YOU
  // =========================================================
  if (/^(how are you|how'?s it going|you ok|you good|what'?s up libi|how do you feel|are you okay|doing good|doing well|you there|you alive)[\s!?.]*$/i.test(cleanMsg)) {
    return `✦ I'm running at full capacity${hi}! Every reasoning engine firing, all knowledge loaded, completely focused on you.\n\n${timeEmoji} It's ${timeOfDay} — ${h < 12 ? "a great time to attack your most important task while your brain is fresh." : h < 15 ? "the prime focus window before the afternoon energy dip." : h < 19 ? "good time to clear medium tasks and prep for tomorrow." : "a good time to do a daily review and wind down properly."}\n\n${active.length > 0 ? `You have **${active.length} ${taskWords}** — I've got your back on all of them. What do you need?` : "Your list is clear. Add something meaningful, or ask me anything. ✦"}`;
  }

  // =========================================================
  // 55. SCIENCE FACTS (expanded)
  // =========================================================
  if (/\b(science|universe|black hole|quantum|evolution|biology|physics|chemistry|earth|planet|brain|neuroscience|consciousness|dna|genetics|atom|energy|gravity|relativity|darwin|einstein)\b/i.test(cleanMsg)) {
    const facts = [
      `🧬 **Biology & Life${hi}:**\n\nYour body contains ~37 trillion cells, each running thousands of chemical reactions per second. Your gut microbiome — 38 trillion bacteria — communicates directly with your brain via the vagus nerve, influencing mood, cognition, and immunity. You are more microbe than human by cell count.\n\nDNA: if you stretched out all the DNA in one human cell, it would be ~2 metres long. If you stretched all DNA in all your cells end-to-end, it would reach from Earth to Pluto and back — 17 times.\n\nEvolution: every living thing on Earth shares a common ancestor. You and a mushroom share ~50% of your DNA. You and a chimpanzee share ~98.7%.`,
      `⚛️ **Physics${hi}:**\n\nQuantum mechanics reveals that particles don't have definite properties until measured — they exist in superposition. Einstein called this "spooky action at a distance" when two particles remain connected across any distance (entanglement).\n\nRelativity: time passes slower near massive objects and at high speeds. GPS satellites must correct for this — without accounting for Einstein's equations, GPS would drift 10 km per day.\n\nThe observable universe is 93 billion light-years across, yet is only 13.8 billion years old — because space itself expanded faster than light (which is allowed — only objects *through* space are limited).`,
      `🧠 **Neuroscience${hi}:**\n\nYour brain has ~86 billion neurons. Each neuron connects to ~7,000 others. The number of possible neural connections exceeds the atoms in the observable universe.\n\nNeuroplasticity: your brain physically rewires itself based on what you repeatedly think and do. Every skill you practice changes your neural architecture. You are literally sculpting your brain with your habits.\n\nThe prefrontal cortex (decision-making, impulse control) doesn't fully develop until age 25. Sleep is when the glymphatic system cleans toxic proteins from the brain — missing sleep literally accumulates brain waste.`,
    ];
    return pick(facts);
  }

  // =========================================================
  // 56. HISTORY
  // =========================================================
  if (/\b(history|historical|ancient|civilisation|civilization|roman|greek|egypt|war|revolution|empire|medieval|renaissance|industrial|napoleon|ww1|ww2|world war|colonialism|century)\b/i.test(cleanMsg)) {
    return `🏛️ **History${hi}:**\n\nHistory is the compressed wisdom of millions of human experiments — what worked, what failed, and why. A few of the most important patterns:\n\n**Why civilisations fall (recurring themes):**\n• Overextension — empires that grow faster than they can govern\n• Inequality — Rome's late republic, pre-revolutionary France, many others\n• External pressure + internal division — rarely one cause alone\n• Failure to adapt — the Mongols defeated armies that refused to change tactics\n\n**Underrated lessons:**\n• Most historical figures were making decisions with incomplete information under pressure — just like you\n• Technological change is consistently underestimated in speed and scope by people living through it\n• Geography shapes history more than most people realise (read *Guns, Germs, and Steel* — Jared Diamond)\n\n**The most important historical truth:** The future was not inevitable to people living in the past. The Roman Empire didn't know it would fall. The Wright Brothers' neighbours didn't know flight was weeks away. This means: the future isn't inevitable now, either. Things can change faster than anyone expects.\n\nAny specific era or event you want to explore${hi}?`;
  }

  // =========================================================
  // 57. SOCIAL MEDIA / SCREEN TIME
  // =========================================================
  if (/\b(social media|instagram|tiktok|twitter|facebook|youtube|screen time|phone addiction|doom.?scroll|scroll(ing)?|phone (use|usage)|digital detox|online (too much|addiction))\b/i.test(cleanMsg)) {
    return `📵 **Social media & screen time${hi}:**\n\n**The design is the problem, not you:**\nSocial media platforms employ hundreds of engineers and psychologists whose only job is to maximise the time you spend on the app. Variable reward schedules (same as slot machines), infinite scroll, social validation loops — these are deliberately engineered addictions. Your inability to "just stop" is not a personal failing.\n\n**What the research shows:**\n• >2 hours/day of passive social media consumption correlates with higher anxiety, lower self-esteem, and worse sleep\n• Active use (creating, messaging, connecting) is far less harmful than passive scrolling\n• The comparison mechanism is the most damaging — everyone performs their best life online\n\n**Practical reduction strategies:**\n• 📱 **Delete apps, keep browser** — the friction of opening a browser reduces impulsive checks by ~60%\n• ⏰ **Time locks** — use Screen Time (iPhone) or Digital Wellbeing (Android)\n• 🌅 **No phone for first hour of day** — your attention is most vulnerable in the morning\n• 🌙 **Phone out of bedroom** — or at minimum, no screens 60 min before sleep\n• 🔕 **All notifications off** — you check on your terms, not theirs\n• 🎯 **Replace, don't just remove** — what do you *actually* want to do with that time?\n\nThe goal isn't to quit everything — it's to be *intentional*. Use it; don't be used by it.`;
  }

  // =========================================================
  // 58. WHAT IS LIBI / VERSION
  // =========================================================
  if (/(libi v4|version 4|what version are you|how advanced are you|libi brain|how smart are you|your intelligence|are you smarter|compare to chatgpt|better than|libi vs)/i.test(cleanMsg)) {
    return `✦ **LIBI Brain v4.0${hi}:**\n\n**What's new in v4:**\n• 🧠 **58+ trained response domains** — from neuroscience to relationships to entrepreneurship\n• 🎯 **Deeper task reasoning** — smarter priority scoring with multi-factor analysis\n• 💙 **Emotional intelligence** — imposter syndrome, loneliness, anger, burnout, celebration\n• 📚 **Evidence-based knowledge** — sleep science, habit formation, nutrition, fitness, learning\n• 🧬 **Science depth** — quantum physics, neuroscience, biology, history, creativity\n• 🔄 **Adaptive personality** — I respond differently based on your occupation, mood, and context\n• ⚡ **Instant task creation** — natural language → tasks in your list\n• 💾 **Memory** — I remember your name, role, wake time, and key facts across the conversation\n\n**vs ChatGPT/Gemini:**\nThey know more. I know *you* — your tasks, your patterns, your priorities. I'm purpose-built for your productivity, always available offline, and integrated directly into every feature of StaredList.\n\n**What I can't do:** Browse the internet, remember previous sessions, or be updated without a code release. I'm honest about my limits.\n\nWhat do you want to explore? ✦`;
  }

  // =========================================================
  // 59. LANGUAGE / MULTILINGUAL GREETINGS
  // =========================================================
  if (/\b(malayalam|hindi|tamil|telugu|kannada|bengali|marathi|urdu|arabic|french|spanish|german|japanese|korean|chinese|ente peru|njan|ningal|enthu|sugham|vanakkam|namaskaram|aap kaise|kya haal)\b/i.test(cleanMsg)) {
    return `✦ LIBI here${hi}! I understand you — though I reply in English to give you the best answers.\n\nI recognise your language and I'm learning. StaredList supports 5 interface languages — check Settings → Language to switch.\n\n🌍 No matter where you're from, I'm here to help you get things done. What do you need today?`;
  }

  // =========================================================
  // 60. SMART FALLBACK v4 — never feels broken
  // =========================================================
  const contextual = active.length > 0 && topTask
    ? `\n\n💡 By the way — you have **${active.length} active ${taskWords}**. Top priority right now: **"${topTask.title}"**. Want help with that?`
    : active.length === 0
      ? `\n\n✅ Your task list is clear! Want to add something new, set a goal, or just chat?`
      : "";

  // Try to detect partial intent and give a helpful nudge
  const isQuestion = /^(what|how|why|when|where|who|can|could|should|would|is|are|do|does|did|will)\b/i.test(cleanMsg);
  const isShort = cleanMsg.length < 15;

  if (isShort && !isQuestion) {
    return `✦ Hey${hi}! I'm here — just wasn't sure exactly what you meant by "${raw}". Could you give me a bit more context?\n\n**Try:**\n• _"Plan my day"_\n• _"Motivate me"_\n• _"Tell me about [topic]"_\n• _"I'm feeling [emotion]"_${contextual}`;
  }

  const fallbacks = [
    `🤔 Hmm, I want to give you the best answer${hi} — but I didn't quite catch that. Could you rephrase?\n\n**I can help with:**\n• 📋 Tasks & planning — _"Plan my day"_, _"What's overdue?"_\n• 🧠 Knowledge — _"Explain [anything]"_, _"How do I learn X?"_\n• 💙 Wellbeing — _"I'm stressed"_, _"I can't sleep"_, _"Motivate me"_\n• 🎯 Focus — _"What should I do first?"_, _"Help me focus"_\n• 💬 Conversation — ask me literally anything${contextual}`,
    `✦ Almost there${hi}! I understood part of that but want to make sure I answer properly. Try rephrasing — or pick one of these:\n• _"Plan my day around my tasks"_\n• _"Tell me something interesting"_\n• _"I need help with [specific thing]"_\n• _"What can you do?"_ — for the full guide${contextual}`,
    `I'm here${hi} and ready — I just want to make sure I give you a useful answer rather than guessing. What's on your mind?\n\nSome things I'm great at:\n• Turning your tasks into an actual plan\n• Deep knowledge on almost any topic\n• Honest motivation when you're stuck\n• Just being here when you need to think out loud${contextual}`,
  ];

  return fallbacks[new Date().getSeconds() % fallbacks.length];
}

// ===================================================
//  MAIN APP
// ===================================================


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
  const editorRef = React.useRef(null);
  const [wordCount, setWordCount] = React.useState(0);
  const [activeFormats, setActiveFormats] = React.useState({});
  const isInitialized = React.useRef(false);
  const [showNoteToolbars, setShowNoteToolbars] = React.useState(true);

  // ── Overlay draw canvas state ──
  const [drawMode, setDrawMode] = React.useState(false);
  const [drawTool, setDrawTool] = React.useState("pen");
  const [drawColor, setDrawColor] = React.useState("#e74c3c");
  const [drawSize, setDrawSize] = React.useState(3);
  const overlayCanvasRef = React.useRef(null);
  const drawingRef = React.useRef(false);
  const lastPosRef = React.useRef(null);

  // Sync HTML body into editor on mount / when note changes
  React.useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const incoming = noteForm.body || "";
    // Only set innerHTML on first mount or when switching notes
    if (!isInitialized.current || editNote?.id !== isInitialized.current) {
      el.innerHTML = incoming;
      isInitialized.current = editNote?.id || true;
      updateWordCount(el.innerText);
    }
  }, [editNote?.id]);

  function updateWordCount(text) {
    setWordCount((text || "").trim().split(/\s+/).filter(Boolean).length);
  }

  function onInput() {
    const el = editorRef.current;
    if (!el) return;
    setNoteForm(f => ({ ...f, body: el.innerHTML }));
    updateWordCount(el.innerText);
    updateActiveFormats();
  }

  function updateActiveFormats() {
    try {
      setActiveFormats({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikethrough: document.queryCommandState("strikethrough"),
        insertUnorderedList: document.queryCommandState("insertUnorderedList"),
        insertOrderedList: document.queryCommandState("insertOrderedList"),
        justifyLeft: document.queryCommandState("justifyLeft"),
        justifyCenter: document.queryCommandState("justifyCenter"),
        justifyRight: document.queryCommandState("justifyRight"),
      });
    } catch (e) { }
  }

  function exec(cmd, value = null) {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    onInput();
  }

  function execHeading(tag) {
    editorRef.current?.focus();
    document.execCommand("formatBlock", false, tag);
    onInput();
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { showNotif("❌ Not supported", "Your browser doesn't support voice input"); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
    setNoteIsListening(true);
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          editorRef.current?.focus();
          document.execCommand("insertText", false, e.results[i][0].transcript + " ");
          onInput();
        }
      }
    };
    rec.onerror = () => setNoteIsListening(false);
    rec.onend = () => setNoteIsListening(false);
    rec.start();
    window._noteRec = rec;
    haptic("medium");
    showNotif("🎙 Listening…", "Speak now — tap mic again to stop");
  }

  function stopVoice() {
    if (window._noteRec) { window._noteRec.stop(); window._noteRec = null; }
    setNoteIsListening(false);
  }

  // SVG icon helper
  const Icon = ({ d, d2, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />{d2 && <path d={d2} />}
    </svg>
  );

  // ── Overlay canvas draw handlers ──
  function getOverlayPos(e) {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return null;
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  }
  function overlayStartDraw(e) {
    if (!drawMode) return;
    e.preventDefault();
    drawingRef.current = true;
    lastPosRef.current = getOverlayPos(e);
  }
  function overlayDraw(e) {
    if (!drawMode || !drawingRef.current) return;
    e.preventDefault();
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const pos = getOverlayPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = drawTool === "eraser" ? "rgba(0,0,0,1)" : drawColor;
    ctx.lineWidth = drawTool === "eraser" ? drawSize * 6 : drawSize;
    ctx.globalCompositeOperation = drawTool === "eraser" ? "destination-out" : "source-over";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPosRef.current = pos;
  }
  function overlayEndDraw() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = overlayCanvasRef.current;
    if (canvas) setNoteForm(f => ({ ...f, sketch: canvas.toDataURL() }));
  }
  function clearOverlay() {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setNoteForm(f => ({ ...f, sketch: null }));
  }
  // Sync canvas size to page div and restore saved sketch
  function syncOverlayCanvas() {
    const canvas = overlayCanvasRef.current;
    const page = canvas?.parentElement;
    if (!canvas || !page) return;
    const w = page.offsetWidth;
    const h = page.offsetHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (noteForm.sketch) {
        const i = new Image(); i.onload = () => ctx.drawImage(i, 0, 0, w, h); i.src = noteForm.sketch;
      }
    }
  }
  React.useEffect(() => {
    if (drawMode) setTimeout(syncOverlayCanvas, 50);
  }, [drawMode]);

  const tbBtn = (active) => ({
    width: 32, height: 32, borderRadius: 6, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? "var(--accd)" : "transparent",
    color: active ? "var(--acc)" : "var(--t2)",
    transition: "background .12s, color .12s",
  });

  const divider = <div style={{ width: 1, height: 20, background: "var(--b1)", margin: "0 4px", flexShrink: 0 }} />;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 9000, display: "flex", flexDirection: "column" }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, minWidth: 0 }}>
        <button onClick={() => setShowNoteEditor(false)} style={{ ...tbBtn(false), color: "var(--t2)", flexShrink: 0 }} title="Back">
          <Icon d="M19 12H5M5 12l7-7M5 12l7 7" />
        </button>
        <input
          placeholder="Untitled"
          value={noteForm.title}
          onChange={e => setNoteForm(f => ({ ...f, title: e.target.value }))}
          style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--t1)", background: "none", border: "none", outline: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        />
        <span style={{ fontSize: 11, color: "var(--t3)", flexShrink: 0, display: window.innerWidth < 380 ? "none" : "inline" }}>{wordCount}w</span>
        <button onClick={exportNotePDF} title="Export PDF" style={{ ...tbBtn(false), flexShrink: 0, display: window.innerWidth < 400 ? "none" : "flex" }}>
          <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" d2="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </button>
        <button onClick={noteIsListening ? stopVoice : startVoice} title="Voice input" style={{ ...tbBtn(noteIsListening), color: noteIsListening ? "#ff6b6b" : "var(--t2)", flexShrink: 0 }}>
          <Icon d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" d2="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
        </button>
        {editNote && (
          <button onClick={() => deleteNote(editNote.id)} title="Delete" style={{ ...tbBtn(false), color: "var(--red, #ff6b6b)", flexShrink: 0 }}>
            <Icon d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </button>
        )}
        <button onClick={saveNote} style={{ height: 36, padding: "0 14px", background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap", minWidth: 60 }}>
          {editNote ? "Update" : "Save"}
        </button>
      </div>

      {/* ── Meta row: categories + colors + pin + tabs ── */}
      {showNoteToolbars && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, flexWrap: "wrap" }}>
          {NOTE_CATS.filter(c => c.id !== "all").map(c => (
            <button key={c.id} onClick={() => setNoteForm(f => ({ ...f, category: c.id }))}
              style={{ fontSize: 11, padding: "3px 9px", borderRadius: 20, border: `1.5px solid ${noteForm.category === c.id ? "var(--acc)" : "var(--b1)"}`, background: noteForm.category === c.id ? "var(--accd)" : "transparent", color: noteForm.category === c.id ? "var(--acc)" : "var(--t3)", cursor: "pointer", fontWeight: 600, transition: "all .15s" }}>
              {c.icon} {c.label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
              {(NOTE_COLORS || []).slice(0, 7).map(c => (
                <div key={c} onClick={() => setNoteForm(f => ({ ...f, color: c }))}
                  style={{ width: 16, height: 16, borderRadius: "50%", background: c, cursor: "pointer", border: `2.5px solid ${noteForm.color === c ? "var(--t1)" : "transparent"}`, transform: noteForm.color === c ? "scale(1.3)" : "scale(1)", transition: "all .15s" }} />
              ))}
            </div>
            {divider}
            <button onClick={() => setNoteForm(f => ({ ...f, pinned: !f.pinned }))}
              style={{ ...tbBtn(noteForm.pinned), width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600, gap: 4 }}>
              <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" size={13} />
              {noteForm.pinned ? "Pinned" : "Pin"}
            </button>
            {divider}
            <button onClick={() => setDrawMode(d => !d)}
              title={drawMode ? "Exit draw mode" : "Draw on note"}
              style={{ ...tbBtn(drawMode), width: "auto", padding: "0 10px", fontSize: 11, fontWeight: 600, gap: 5, color: drawMode ? "var(--acc)" : "var(--t3)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l11 11" /></svg>
              {drawMode ? "Drawing" : "Draw"}
            </button>
          </div>
        </div>
      )}

      {/* ── Collapsed toolbar restore strip ── */}
      {!showNoteToolbars && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "2px 10px", background: "var(--s1)", borderBottom: "1px solid var(--b1)", flexShrink: 0 }}>
          <button
            onClick={() => setShowNoteToolbars(true)}
            title="Show toolbar"
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, border: "1.5px solid var(--b1)", background: "var(--s2)", color: "var(--t3)", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            Toolbar
          </button>
        </div>
      )}

      {/* Voice banner */}
      {noteIsListening && (
        <div style={{ background: "rgba(255,80,80,.9)", color: "#fff", padding: "7px 16px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "inline-block", animation: "pulse 1s infinite" }} />
          Listening… speak now
          <button onClick={stopVoice} style={{ marginLeft: "auto", background: "rgba(255,255,255,.25)", border: "none", color: "#fff", borderRadius: 6, padding: "2px 10px", cursor: "pointer", fontSize: 11, fontWeight: 700 }}>Stop</button>
        </div>
      )}

      {/* ── Write Tab ── */}
      {activeTab === "write" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Formatting toolbar */}
          {showNoteToolbars && <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 12px", borderBottom: "1px solid var(--b1)", background: "var(--s1)", flexShrink: 0, overflowX: "auto" }}>

            {/* Heading selector */}
            <select onChange={e => { execHeading(e.target.value); e.target.value = ""; }}
              defaultValue=""
              style={{ height: 30, padding: "0 6px", borderRadius: 6, border: "1px solid var(--b1)", background: "var(--s2)", color: "var(--t2)", fontSize: 12, cursor: "pointer", outline: "none", marginRight: 2 }}>
              <option value="" disabled>Style</option>
              <option value="p">Normal</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="pre">Code</option>
            </select>

            {divider}

            {/* Text formatting */}
            <button onMouseDown={e => { e.preventDefault(); exec("bold"); }} style={tbBtn(activeFormats.bold)} title="Bold (Ctrl+B)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("italic"); }} style={tbBtn(activeFormats.italic)} title="Italic (Ctrl+I)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("underline"); }} style={tbBtn(activeFormats.underline)} title="Underline (Ctrl+U)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3v7a6 6 0 0 0 12 0V3" /><line x1="4" y1="21" x2="20" y2="21" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("strikethrough"); }} style={tbBtn(activeFormats.strikethrough)} title="Strikethrough">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" y1="12" x2="20" y2="12" /><path d="M17.5 5.5C16.5 4.5 15.1 4 13.5 4c-3 0-5 1.8-5 4 0 1.2.6 2.2 1.6 3" /><path d="M6.5 18.5C7.5 19.5 9 20 10.5 20c3.2 0 5.5-2 5.5-4.5 0-1-.3-1.9-.8-2.6" /></svg>
            </button>

            {divider}

            {/* Lists */}
            <button onMouseDown={e => { e.preventDefault(); exec("insertUnorderedList"); }} style={tbBtn(activeFormats.insertUnorderedList)} title="Bullet list">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" /><circle cx="4" cy="6" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r="1.5" fill="currentColor" stroke="none" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("insertOrderedList"); }} style={tbBtn(activeFormats.insertOrderedList)} title="Numbered list">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="7" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">1</text><text x="2" y="13" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">2</text><text x="2" y="19" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">3</text></svg>
            </button>

            {divider}

            {/* Indent */}
            <button onMouseDown={e => { e.preventDefault(); exec("indent"); }} style={tbBtn(false)} title="Indent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /><polyline points="7 8 11 12 7 16" /><line x1="11" y1="12" x2="21" y2="12" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("outdent"); }} style={tbBtn(false)} title="Outdent">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /><polyline points="11 8 7 12 11 16" /><line x1="7" y1="12" x2="21" y2="12" /></svg>
            </button>

            {divider}

            {/* Align */}
            <button onMouseDown={e => { e.preventDefault(); exec("justifyLeft"); }} style={tbBtn(activeFormats.justifyLeft)} title="Align left">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("justifyCenter"); }} style={tbBtn(activeFormats.justifyCenter)} title="Center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>
            </button>
            <button onMouseDown={e => { e.preventDefault(); exec("justifyRight"); }} style={tbBtn(activeFormats.justifyRight)} title="Align right">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" /></svg>
            </button>

            {divider}

            {/* Insert horizontal rule */}
            <button onMouseDown={e => { e.preventDefault(); exec("insertHorizontalRule"); }} style={tbBtn(false)} title="Divider line">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="9" y2="6" /><line x1="3" y1="18" x2="9" y2="18" /></svg>
            </button>

            {/* Tags — right side */}
            <div style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
              {(noteForm.tags || []).map(tg => (
                <span key={tg} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--accd)", color: "var(--acc)", fontWeight: 600, display: "flex", alignItems: "center", gap: 3, whiteSpace: "nowrap" }}>
                  #{tg}<span style={{ cursor: "pointer", opacity: .7 }} onClick={() => setNoteForm(f => ({ ...f, tags: f.tags.filter(x => x !== tg) }))}>✕</span>
                </span>
              ))}
              <input placeholder="+ tag" value={noteTagInput} onChange={e => setNoteTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && noteTagInput.trim()) { const v = noteTagInput.trim().replace(/^#/, ""); if (!noteForm.tags?.includes(v)) setNoteForm(f => ({ ...f, tags: [...(f.tags || []), v] })); setNoteTagInput(""); } }}
                style={{ width: 55, background: "transparent", border: "1px solid var(--b1)", borderRadius: 6, padding: "3px 7px", fontSize: 11, color: "var(--t1)", outline: "none" }} />
              {/* ── Hide-toolbar toggle button (the green circle spot) ── */}
              <button
                onClick={() => setShowNoteToolbars(false)}
                title="Hide toolbar"
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 20, border: "1.5px solid var(--b1)", background: "var(--s2)", color: "var(--t3)", fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all .15s", flexShrink: 0, whiteSpace: "nowrap" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                Hide
              </button>
            </div>
          </div>}

          {/* Document area — note page with overlay canvas */}
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--bg)", padding: "12px 0 0" }}>
            <div style={{ width: "100%", maxWidth: 740, margin: "0 auto", background: "var(--s1)", borderRadius: 0, boxShadow: "none", minHeight: "calc(100vh - 200px)", position: "relative" }}>

              {/* Text editor */}
              <div
                ref={editorRef}
                contentEditable={!drawMode}
                suppressContentEditableWarning
                onInput={onInput}
                onKeyUp={updateActiveFormats}
                onMouseUp={updateActiveFormats}
                onFocus={updateActiveFormats}
                data-placeholder="Start writing…"
                style={{
                  minHeight: "calc(100vh - 210px)",
                  padding: "clamp(12px, 4vw, 40px) clamp(14px, 5vw, 56px)",
                  fontSize: 15.5,
                  lineHeight: 1.85,
                  color: "var(--t1)",
                  outline: "none",
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  wordBreak: "break-word",
                  userSelect: drawMode ? "none" : "auto",
                }}
              />

              {/* Transparent draw canvas — always present, active only in draw mode */}
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  pointerEvents: drawMode ? "all" : "none",
                  cursor: drawMode ? (drawTool === "eraser" ? "cell" : "crosshair") : "none",
                  opacity: drawMode ? 1 : 0.6,
                  zIndex: 2,
                  touchAction: "none",
                }}
                onMouseDown={overlayStartDraw}
                onMouseMove={overlayDraw}
                onMouseUp={overlayEndDraw}
                onMouseLeave={overlayEndDraw}
                onTouchStart={overlayStartDraw}
                onTouchMove={overlayDraw}
                onTouchEnd={overlayEndDraw}
              />

              {/* Draw toolbar — floats bottom of page when draw mode is on */}
              {drawMode && (
                <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", gap: 8, alignItems: "center", background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 16, padding: "8px 14px", boxShadow: "0 4px 20px rgba(0,0,0,.18)", flexWrap: "wrap", justifyContent: "center" }}>
                  {/* Pen / Eraser */}
                  {[{ id: "pen", icon: "✏️", label: "Pen" }, { id: "eraser", icon: "⬜", label: "Eraser" }].map(t => (
                    <button key={t.id} onClick={() => setDrawTool(t.id)}
                      style={{ padding: "4px 10px", borderRadius: 8, border: `2px solid ${drawTool === t.id ? "var(--acc)" : "var(--b1)"}`, background: drawTool === t.id ? "var(--accd)" : "transparent", cursor: "pointer", fontSize: 13 }}>
                      {t.icon}
                    </button>
                  ))}
                  {/* Colors */}
                  <div style={{ width: 1, height: 20, background: "var(--b1)" }} />
                  {["#e74c3c", "#2ecc71", "#3498db", "#f39c12", "#9b59b6", "#1a1a1a"].map(c => (
                    <div key={c} onClick={() => { setDrawTool("pen"); setDrawColor(c); }}
                      style={{ width: 20, height: 20, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${drawColor === c && drawTool === "pen" ? "var(--t1)" : "transparent"}`, transition: "all .15s", flexShrink: 0 }} />
                  ))}
                  {/* Size */}
                  <div style={{ width: 1, height: 20, background: "var(--b1)" }} />
                  <input type="range" min={1} max={14} value={drawSize} onChange={e => setDrawSize(+e.target.value)} style={{ width: 60, accentColor: "var(--acc)" }} />
                  {/* Clear */}
                  <div style={{ width: 1, height: 20, background: "var(--b1)" }} />
                  <button onClick={clearOverlay} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(255,107,107,.1)", border: "1px solid rgba(255,107,107,.3)", color: "#ff6b6b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Clear</button>
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <div style={{ display: "flex", gap: 16, padding: "5px 20px", borderTop: "1px solid var(--b1)", background: "var(--s1)", fontSize: 11, color: "var(--t3)", flexShrink: 0 }}>
            <span>{wordCount} words</span>
            <span>{(editorRef.current?.innerText || "").length} characters</span>
            <span>{Math.max(1, Math.ceil(wordCount / 200))} min read</span>
          </div>
        </div>
      )}

      {/* Draw Tab */}
      <style>{`
        [contenteditable][data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: var(--t3);
          pointer-events: none;
          font-style: italic;
        }
        [contenteditable] h1 { font-size: 2em; font-weight: 700; margin: .5em 0 .3em; line-height: 1.25; }
        [contenteditable] h2 { font-size: 1.5em; font-weight: 700; margin: .5em 0 .3em; line-height: 1.3; }
        [contenteditable] h3 { font-size: 1.2em; font-weight: 700; margin: .4em 0 .25em; line-height: 1.35; }
        [contenteditable] pre { background: var(--s3); border-radius: 6px; padding: 12px 16px; font-family: 'Fira Code', monospace; font-size: 13px; overflow-x: auto; margin: 8px 0; }
        [contenteditable] ul, [contenteditable] ol { padding-left: 1.6em; margin: 4px 0; }
        [contenteditable] li { margin: 2px 0; }
        [contenteditable] blockquote { border-left: 3px solid var(--acc); margin: 8px 0; padding: 4px 16px; color: var(--t2); font-style: italic; }
        [contenteditable] hr { border: none; border-top: 1px solid var(--b1); margin: 16px 0; }
        [contenteditable] a { color: var(--acc); text-decoration: underline; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────





export default function App() {
  const [calZoom, setCalZoom] = useState(1);
  const [calViewMode, setCalViewMode] = useState("wall"); // "desk" | "wall"
  const [inlineSticker, setInlineSticker] = useState(null);
  const [magnifiedSticker, setMagnifiedSticker] = useState(null);

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
            const mem2 = JSON.parse(localStorage.getItem("tf_libi_memory") || "{}");
            navigator.serviceWorker.ready.then(sw => {
              sw.active?.postMessage({
                type: "SCHEDULE_DAILY",
                hour: wakeHour,
                taskCount: todayTasks,
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
  // == Onboarding (disabled) ==
  const [userName, setUserName] = useState(() => localStorage.getItem('tf_username') || '');
  const hasOnboarded = true;

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
  const [accentIdx, setAccentIdx] = useState(() => { try { const s = localStorage.getItem("tf_accent"); return s ? JSON.parse(s) : 11; } catch (e) { return 11; } });
  const [appFont, setAppFont] = useState(() => "Outfit");

  useEffect(() => { }, [appFont]);
  useEffect(() => { localStorage.setItem("tf_accent", JSON.stringify(accentIdx)); }, [accentIdx]);
  // Force blue accent (index 11) always
  useEffect(() => { setAccentIdx(11); }, []);
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

  // == Focus Mode ==
  const [focusMode, setFocusMode] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [focusNotes, setFocusNotes] = useState("");

  // == Daily Digest ==
  // == ✦ AI NATURAL LANGUAGE TASK EDITOR ==


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
  const [isHoldingAdd, setIsHoldingAdd] = useState(false);
  const holdTimerRef = useRef(null);
  const holdStartedRef = useRef(false);

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
      const tId = Math.random().toString(36).slice(2, 10);
      const nt = { id: tId, title: cleaned.charAt(0).toUpperCase() + cleaned.slice(1), notes: 'Created via Voice AI 🎙️', priority: 'medium', categoryId: 'work', due: d, photo: null, tags: [], subtasks: [], starred: false, recurring: 'never', profileId: activeProfile, done: false, createdAt: Date.now() };
      setTasks(ts => [nt, ...ts]);
      showNotif('✨ Voice task added!', nt.title);
      play('success'); haptic('heavy');
    };
    rec.onerror = () => { setIsVoiceTaskListening(false); showNotif('🤔 Didn\'t catch that', 'Try speaking again.'); };
    rec.onend = () => setIsVoiceTaskListening(false);
    rec.start();
  }

  const isTouchDeviceRef = useRef(false);
  // Track when touchend fired so we can suppress the synthetic mouse events that follow
  const touchEndedRecentlyRef = useRef(false);

  function onAddHoldStart(e) {
    if (e.type === "touchstart") {
      isTouchDeviceRef.current = true;
      e.preventDefault(); // prevents the synthetic mouse events entirely
    } else {
      // Mouse event on a touch device — ignore (synthetic duplicate)
      if (isTouchDeviceRef.current) return;
    }
    holdStartedRef.current = true;
    holdTimerRef.current = setTimeout(() => {
      if (!holdStartedRef.current) return;
      setIsHoldingAdd(true);
      haptic("medium");
      startVoiceAI();
    }, 500);
  }

  function onAddHoldEnd(e) {
    if (e.cancelable) e.preventDefault();
    if (e.type === "touchend") {
      // Mark that touch just ended so mouseup/click can be suppressed
      touchEndedRecentlyRef.current = true;
      setTimeout(() => { touchEndedRecentlyRef.current = false; }, 600);
    } else {
      // Mouse event — skip if touch already handled it
      if (isTouchDeviceRef.current || touchEndedRecentlyRef.current) return;
    }
    clearTimeout(holdTimerRef.current);
    const wasHolding = isHoldingAdd;
    holdStartedRef.current = false;
    setIsHoldingAdd(false);
    if (!wasHolding && !isVoiceTaskListening) openAdd();
  }

  function onAddHoldCancel(e) {
    // Suppress all mouse events on touch devices
    if (isTouchDeviceRef.current || touchEndedRecentlyRef.current) return;
    clearTimeout(holdTimerRef.current);
    holdStartedRef.current = false;
    setIsHoldingAdd(false);
  }


  // == Data ==
  // == Tasks & Productivity Hook ==
  const {
    tasks, setTasks, categories, setCategories,
    profiles, setProfiles, activeProfile, setActiveProfile,
    profileTasks, profileStickers, updateTask, toggleTask, deleteTask
  } = useTasks();

  const [goals, setGoals] = useState(() => { try { return JSON.parse(localStorage.getItem("tf_goals") || "[]"); } catch (e) { return []; } });
  const [habits, setHabits] = useState(() => { try { return JSON.parse(localStorage.getItem("tf_habits") || "[]"); } catch (e) { return []; } });
  const [libiMemory, setLibiMemory] = useState(() => { try { const s = localStorage.getItem("tf_libi_memory"); return s ? JSON.parse(s) : { facts: [], name: "", wakeTime: "", occupation: "", timezone: "" }; } catch (e) { return { facts: [], name: "", wakeTime: "", occupation: "", timezone: "" }; } });

  const activeProfileObj = profiles.find(p => p.id === activeProfile) || profiles[0];
  const accent = ACCENTS[accentIdx] || ACCENTS[0];
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
  function showNotif(title, desc) { }
  function saveTask() {
    if (editTaskObj) {
      setTasks(ts => ts.map(t => t.id === editTaskObj.id ? { ...t, ...form, id: editTaskObj.id } : t));
      closeTaskModal();
      setTimeout(() => setForm({ ...blankForm, profileId: activeProfile }), 300);
    } else {
      const newTask = { ...form, id: uid(), done: false, createdAt: Date.now() };
      setTasks(ts => [newTask, ...ts]);
      showNotif("✅ Task added!", newTask.title);
      play("add");
      closeTaskModal();
      setTimeout(() => setForm({ ...blankForm, profileId: activeProfile }), 300);
    }
  }


  // == Wellness & Health Hook ==

  // == Navigation ==
  const [tab, setTab] = useState("tasks");
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem("tf_wallpaper") || "");
  const [viewMode, setViewMode] = useState("list");
  const [sort, setSort] = useState("created");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [energyFilter, setEnergyFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [filterKey, setFilterKey] = useState(0);
  const [showStats, setShowStats] = useState(false);

  // == Modals ==
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [closingModal, setClosingModal] = useState(false);
  const closeTaskModal = () => { setClosingModal(true); setTimeout(() => { setShowTaskModal(false); setClosingModal(false); }, 300); };
  const [editTaskObj, setEditTaskObj] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const detailTask = tasks.find(t => t.id === detailTaskId) || null;
  const [showCatModal, setShowCatModal] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // == Calendar ==
  const now = new Date(); const [calYear, setCalYear] = useState(now.getFullYear()); const [calMonth, setCalMonth] = useState(now.getMonth()); const [selDate, setSelDate] = useState(todayStr()); const [showCalJump, setShowCalJump] = useState(false); const [jumpYear, setJumpYear] = useState(now.getFullYear()); const [holTooltip, setHolTooltip] = useState(null);
  const [selHabitDate, setSelHabitDate] = useState(todayStr());

  // == IST clock removed ==

  // == Notification ==
  const [notif, setNotif] = useState(null);






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
            if (backup.notes?.length) setNotes(backup.notes);
            if (backup.categories?.length) setCategories(backup.categories);
            if (backup.profiles?.length) setProfiles(backup.profiles);
            showNotif("✅ Data restored!", "Your tasks have been recovered 🎉");
          }
        } catch (e) { }
      }).catch(() => { });
    }
  }, []);



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
          due: nextDue, subtasks: task.subtasks.map(s => ({ ...s, done: false }))
        };
        setTimeout(() => {
          setTasks(ts => [nextTask, ...ts]);
          showNotif("🔄 Recurring task recreated", `"${task.title}" scheduled for ${nextDue}`);
        }, 800);
      }
    }
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: nd, completedAt: nd ? Date.now() : null } : t));
  };


  // == Task form ==
  const blankForm = { title: "", notes: "", priority: "medium", categoryId: "work", due: "", photo: null, tags: [], subtasks: [], starred: false, recurring: "never", profileId: activeProfile, timeEstimate: 0, dependsOn: [] };
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
  }, [dark, accentIdx, langKey, appFont]);

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

          const isNavHiddenTab = ["bot", "timeline", "calendar"].includes(tab);

          if (dy > 6 && y > 50) {
            // Scrolling DOWN -- hide logo, search expands to fill space
            topbar?.classList.add('logo-hidden');
            if (!isNavHiddenTab) botnav?.classList.add('hide-bot');
          } else if (dy < -4) {
            // Scrolling UP -- logo slides back in, search shrinks
            topbar?.classList.remove('logo-hidden');
            if (!isNavHiddenTab) botnav?.classList.remove('hide-bot');
          }

          // At very top -- always show logo
          if (y < 10) {
            topbar?.classList.remove('logo-hidden');
            if (!isNavHiddenTab) botnav?.classList.remove('hide-bot');
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

  // == Back Navigation System (WhatsApp/YouTube style) ==
  // Tracks the "home" tab — always "tasks" (the starred list home page)
  const HOME_TAB = "tasks";

  // Push a history entry whenever we navigate away from home
  useEffect(() => {
    if (tab === HOME_TAB) {
      // Replace so there's always a clean base entry
      window.history.replaceState({ tab: HOME_TAB }, "");
    } else {
      // Push so Android back button has something to pop
      window.history.pushState({ tab }, "");
    }
  }, [tab]);

  // Android hardware back button / browser back → go home
  useEffect(() => {
    const onPopState = (e) => {
      // If we're not on home, go home and push the state back so the stack stays valid
      if (tab !== HOME_TAB) {
        setTab(HOME_TAB);
        play("tap");
        haptic("light");
        // Restore the entry we just popped so subsequent back presses work
        window.history.pushState({ tab: HOME_TAB }, "");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [tab]);

  // Swipe-back gesture — works from ANYWHERE on screen (not just edge), like WhatsApp
  const swipeBackRef = useRef({ startX: 0, startY: 0, tracking: false, indicatorEl: null });
  useEffect(() => {
    if (tab === HOME_TAB) return; // no swipe-back needed on home

    // Create a live visual indicator element
    const indicator = document.createElement("div");
    indicator.id = "swipe-back-indicator";
    indicator.style.cssText = `
      position:fixed;left:0;top:50%;transform:translateY(-50%);
      width:4px;height:80px;border-radius:0 4px 4px 0;
      background:var(--acc,#7c6dfa);opacity:0;
      transition:opacity .15s ease,width .15s ease,height .15s ease;
      z-index:99999;pointer-events:none;
    `;
    document.body.appendChild(indicator);
    swipeBackRef.current.indicatorEl = indicator;

    const SWIPE_THRESHOLD = 72;    // px to complete the swipe
    const MAX_START_X = 48;        // px from left edge to begin tracking
    const MAX_DY_RATIO = 1.2;      // allow some vertical slop

    const onTouchStart = (e) => {
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (x <= MAX_START_X) {
        swipeBackRef.current.startX = x;
        swipeBackRef.current.startY = y;
        swipeBackRef.current.tracking = true;
      } else {
        swipeBackRef.current.tracking = false;
      }
    };

    const onTouchMove = (e) => {
      if (!swipeBackRef.current.tracking) return;
      const dx = e.touches[0].clientX - swipeBackRef.current.startX;
      const dy = Math.abs(e.touches[0].clientY - swipeBackRef.current.startY);
      if (dx < 0 || dy > dx * MAX_DY_RATIO) { swipeBackRef.current.tracking = false; indicator.style.opacity = "0"; return; }
      // Animate the indicator
      const progress = Math.min(dx / SWIPE_THRESHOLD, 1);
      indicator.style.opacity = String(progress * 0.9);
      indicator.style.width = `${4 + progress * 28}px`;
      indicator.style.height = `${60 + progress * 40}px`;
      indicator.style.background = progress >= 1 ? "var(--green,#4ADE80)" : "var(--acc,#7c6dfa)";
    };

    const onTouchEnd = (e) => {
      indicator.style.opacity = "0";
      indicator.style.width = "4px";
      indicator.style.height = "80px";
      if (!swipeBackRef.current.tracking) return;
      const dx = e.changedTouches[0].clientX - swipeBackRef.current.startX;
      const dy = Math.abs(e.changedTouches[0].clientY - swipeBackRef.current.startY);
      swipeBackRef.current.tracking = false;
      if (dx >= SWIPE_THRESHOLD && dy < dx * MAX_DY_RATIO) {
        setTab(HOME_TAB);
        play("tap");
        haptic("light");
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      indicator.remove();
    };
  }, [tab]);

  // == Enhanced Notification Engine ==


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

  // voice quick-add removed



  function openAdd() { setForm({ ...blankForm, profileId: activeProfile }); setTagInput(""); setSubInput(""); setEditTaskObj(null); setShowTaskModal(true); play("tap"); };
  function openEdit(task, e) { if (e) e.stopPropagation(); setForm({ title: task.title, notes: task.notes, priority: task.priority, categoryId: task.categoryId, due: task.due, photo: task.photo, tags: [...task.tags], subtasks: task.subtasks.map(s => ({ ...s })), starred: task.starred, recurring: task.recurring || "never", profileId: task.profileId }); setTagInput(""); setSubInput(""); setEditTaskObj(task); setShowTaskModal(true); play("tap"); };
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
  const getCatSvgIcon = (catId, size = 12) => {
    const icons = {
      work: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>,
      personal: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
      health: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
      learning: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
      groceries: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>,
      finance: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>,
    };
    return icons[catId] || <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>;
  };
  function saveCat() { if (!catForm.name.trim()) return; setCategories(cs => [...cs, { id: uid(), ...catForm }]); setCatForm({ name: "", icon: "🎯", color: "#7c6dfa" }); setShowCatModal(false); play("add"); };

  // Inject Groceries category if not present
  useEffect(() => {
    if (categories.length > 0 && !categories.find(c => c.id === "groceries")) {
      setCategories(cs => [...cs, { id: "groceries", name: "Groceries", icon: "🛒", color: "#34a853" }]);
    }
  }, [categories.length]);

  // == Profiles ==
  function saveProfile() { if (!profForm.name.trim()) return; const nid = uid(); setProfiles(ps => [...ps, { id: nid, ...profForm }]); setActiveProfile(nid); setProfForm({ name: "", icon: "👤", color: "#7c6dfa" }); play("add"); };

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
  function shareData() { if (navigator.share) { navigator.share({ title: "StaredList Export", text: exportData() }); } else { navigator.clipboard?.writeText(exportData()); showNotif("📋 Copied!", "Task data copied to clipboard"); } };

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
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
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
    };
    function handleTouchMove(e) {
      const dx = e.touches[0].clientX - swipeStartX.current;
      swipeDelta.current = dx;
      if (swipeRef.current) {
        swipeRef.current.style.transform = `translateX(${Math.max(-100, Math.min(100, dx))}px)`;
        swipeRef.current.style.transition = "none";
        if (dx > 40) swipeRef.current.style.background = "rgba(107,203,119,0.18)";
        else if (dx < -40) swipeRef.current.style.background = "rgba(255,107,107,0.18)";
        else swipeRef.current.style.background = "";
      }
    };
    function handleTouchEnd() {
      const dx = swipeDelta.current;
      if (swipeRef.current) {
        swipeRef.current.style.transition = "transform .3s cubic-bezier(.4,0,.2,1),background .3s ease";
        swipeRef.current.style.transform = "";
        swipeRef.current.style.background = "";
      }
      if (dx > 70) { toggle(task.id); haptic("success"); }
      else if (dx < -70) { del(task.id); haptic("error"); }
      swipeDelta.current = 0;
    };
    const cat = getCat(task.categoryId);
    const ds = task.subtasks.filter(s => s.done).length;
    const sp = task.subtasks.length ? (ds / task.subtasks.length) * 100 : 0;
    const trackedTime = getTaskTime(task.id);
    const isTimerRunning = activeTimer?.taskId === task.id;
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
            transform: "scale(1)",
          }}
          onClick={bulkMode ? (e) => { e.stopPropagation(); toggleBulkSelect(task.id); } : undefined}
        >

          <div className="task-swipe-bg-r"><span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>✅ Complete</span></div>
          <div className="task-swipe-bg-l"><span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>🗑 Delete</span></div>
          <div ref={swipeRef} className="task-swipe-inner" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            <div className={`task p${task.priority[0]} ${task.done ? "done-t" : ""} ${isOverdue(task.due, task.done) ? "ov-t" : ""}`} style={{ margin: 0, borderRadius: 20 }}
              onClick={() => { setDetailTaskId(task.id); setShowDetail(true); }}
              onDoubleClick={() => { setFocusTaskId(task.id); setShowFocusMode(true); }}>
              <div className={`chk ${task.done ? "on" : ""}`} onClick={e => toggle(task.id, e)}>{task.done
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                : null}</div>
              <div className="t-body">
                <div className="t-top">
                  <div className="t-title" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {(() => { const ageD = task.createdAt ? Math.floor((Date.now() - task.createdAt) / (1000 * 60 * 60 * 24)) : 0; return ageD >= 14 ? <span title={`${ageD} days old — needs attention!`} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(255,107,107,.15)", color: "var(--red)", fontWeight: 800, flexShrink: 0, border: "1px solid rgba(255,107,107,.25)" }}>⏳{ageD}d</span> : ageD >= 7 ? <span title={`${ageD} days old`} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 8, background: "rgba(255,159,67,.12)", color: "#ff9f43", fontWeight: 800, flexShrink: 0 }}>⏳{ageD}d</span> : null; })()}
                    {task.title}
                  </div>
                  <span className={`t-star ${task.starred ? "lit" : ""}`} onClick={e => star(task.id, e)} style={{ display: task.done ? "none" : undefined }}>⭐</span>
                </div>
                {task.photo && <img src={task.photo} className="t-photo" alt="" />}
                {task.notes && <div className="t-note">{task.notes}</div>}
                <div className="t-meta">
                  <span className="tchip" style={{ color: PRIORITIES[task.priority].color, background: PRIORITIES[task.priority].bg, border: `1px solid ${PRIORITIES[task.priority].color}28` }}>{PRIORITIES[task.priority].icon}</span>
                  <span className="tchip" style={{ background: cat.color + "22", color: cat.color, border: `1px solid ${cat.color}33`, display: "inline-flex", alignItems: "center", gap: 4 }}>{getCatSvgIcon(cat.id, 11)} {cat.name}</span>
                  {task.tags.slice(0, 2).map(tg => <span key={tg} className="tchip" style={{ background: "var(--s2)", color: "var(--t2)", border: "1px solid var(--b1)" }}>#{tg}</span>)}
                  {task.due && <span className={`t-date ${isOverdue(task.due, task.done) ? "ov" : ""}`}>{isOverdue(task.due, task.done) ? "⚠ " : "◷ "}{fmtDate(task.due)}</span>}
                  {task.timeEstimate > 0 && <span className="est-badge">⏱ {task.timeEstimate < 60 ? task.timeEstimate + "m" : (task.timeEstimate / 60).toFixed(1) + "h"}</span>}
                  {task.dependsOn?.length > 0 && tasks.find(t2 => task.dependsOn.includes(t2.id) && !t2.done) && <span className="dep-badge">🔒 Blocked</span>}
                  {task.recurring && task.recurring !== "never" && <span className="t-recur">🔄 {task.recurring}</span>}

                  {trackedTime > 0 && <span className="t-recur" style={{ color: isTimerRunning ? "#6bcb77" : "var(--t3)", fontWeight: isTimerRunning ? 800 : 400 }}>{isTimerRunning ? "⏱ " + (activeTimer ? `${String(Math.floor((Date.now() - activeTimer.startedAt) / 60000)).padStart(2, "0")}:${String(Math.floor(((Date.now() - activeTimer.startedAt) % 60000) / 1000)).padStart(2, "0")}` : "00:00") : "⏱ " + fmtTime(trackedTime)}</span>}
                </div>
                {task.subtasks.length > 0 && <div className="sub-prog"><div className="sub-bar"><div className="sub-bar-f" style={{ width: `${sp}%` }} /></div><div className="sub-lbl">{ds}/{task.subtasks.length} subtasks</div></div>}
              </div>
              <div className="t-act" onClick={e => e.stopPropagation()}>
                {!task.done && <button className="ic-btn" onClick={e => openEdit(task, e)}>✎</button>}
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
    const avgMoodLast7 = null;
    return { dueToday, overdue, completedToday, suggestion, avgMoodLast7 };
  };


  // == Pages ==

  // AnimePet is imported from ./components/AnimePet — no inline definition needed
  function TasksPage() {
    const greeting = liveHour < 5 ? "Good night 🌙" : liveHour < 12 ? "Good morning ☀️" : liveHour < 17 ? "Good afternoon 🌤" : liveHour < 21 ? "Good evening 🌆" : "Good night 🌙";
    const curProfile2 = profiles.find(p => p.id === activeProfile) || profiles[0];
    return (
      <div className="content">

        {/* 😊 Mood × Productivity Insight */}
        {(() => {
          if (tasks.filter(t => t.done).length < 5) return null;
          const highMoodDays = [];
          const lowMoodDays = [];
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
        {/* Stats collapse wrapper */}
        <div style={{ position: "relative" }}>
          {/* Collapsible stats block */}
          <div style={{
            overflow: "hidden",
            maxHeight: showStats ? 400 : 0,
            opacity: showStats ? 1 : 0,
            transition: "max-height .38s cubic-bezier(.4,0,.2,1), opacity .28s ease",
            pointerEvents: showStats ? "auto" : "none"
          }}>
            <div className="prog-card">
              <svg width="54" height="54" className="ring-svg" viewBox="0 0 54 54" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => { setShowDone(d => !d); setShowStarred(false); setPriorityFilter("all"); }} title="Toggle done tasks">
                <circle className="ring-bg" cx="27" cy="27" r="22" />
                <circle className="ring-fg" cx="27" cy="27" r="22" strokeDasharray={C} strokeDashoffset={dash} />
              </svg>
              <div className="prog-info">
                <div className="prog-pct" style={{ cursor: "pointer" }} onClick={() => { setShowDone(d => !d); setShowStarred(false); setPriorityFilter("all"); }}>
                  {pct}% {t.completed}
                </div>
                <div className="prog-sub">{doneCount} of {total} tasks</div>
                <div className="prio-chips">
                  {Object.entries(PRIORITIES).map(([k, v]) => {
                    const count = profileTasks.filter(x => x.priority === k && !x.done).length;
                    const isActive = priorityFilter === k;
                    return (
                      <span key={k} className="pchip"
                        onClick={() => { setPriorityFilter(f => f === k ? "all" : k); setShowDone(false); setShowStarred(false); }}
                        style={{ color: v.color, background: isActive ? v.color + "30" : v.bg, border: `1.5px solid ${isActive ? v.color : v.color + "28"}`, transform: isActive ? "scale(1.08)" : "scale(1)", boxShadow: isActive ? `0 2px 8px ${v.color}40` : "none", transition: "all .18s" }}>
                        {count} {v.icon}
                      </span>
                    );
                  })}
                  {priorityFilter !== "all" && (
                    <span onClick={() => setPriorityFilter("all")} style={{ fontSize: 10, padding: "4px 8px", borderRadius: 20, background: "var(--s2)", color: "var(--t3)", cursor: "pointer", fontWeight: 700, border: "1px solid var(--b1)" }}>✕ Clear</span>
                  )}
                </div>
              </div>
            </div>

            <div className="stats-row">
              {[
                {
                  lbl: t.total, val: total, fill: accent.v, p: 100,
                  isActive: !showDone && !showStarred && tab === "tasks",
                  onClick: () => { setShowDone(false); setShowStarred(false); setPriorityFilter("all"); setFilterCat("all"); setTab("tasks"); setFilterKey(k => k + 1); }
                },
                {
                  lbl: t.done, val: doneCount, fill: "#6bcb77", p: pct,
                  isActive: showDone && tab === "tasks",
                  onClick: () => { setShowDone(true); setShowStarred(false); setPriorityFilter("all"); setFilterCat("all"); setTab("tasks"); setFilterKey(k => k + 1); }
                },
                {
                  lbl: t.active, val: activeCount, fill: "#ffd93d", p: total ? (activeCount / total) * 100 : 0,
                  isActive: false,
                  onClick: () => { setShowDone(false); setShowStarred(false); setPriorityFilter("all"); setFilterCat("all"); setTab("tasks"); setFilterKey(k => k + 1); }
                },
                {
                  lbl: t.overdue, val: overdueCount, fill: "#ff6b6b", p: total ? (overdueCount / total) * 100 : 0,
                  isActive: tab === "overdue",
                  onClick: () => { setTab("overdue"); setFilterKey(k => k + 1); }
                }
              ].map(s => (
                <div className="stat" key={s.lbl}
                  style={{ "--stat-color": s.fill, border: s.isActive ? `1.5px solid ${s.fill}` : undefined, boxShadow: s.isActive ? `0 6px 24px ${s.fill}30` : undefined }}
                  onClick={s.onClick}
                  title={`Show ${s.lbl} tasks`}>
                  <div>
                    <div className="stat-val" style={{ color: s.isActive ? s.fill : undefined }}>{s.val}</div>
                    <div className="stat-lbl" style={{ color: s.isActive ? s.fill : undefined }}>{s.lbl}</div>
                  </div>
                  <div className="stat-bar"><div className="stat-bar-f" style={{ width: `${s.p}%`, background: s.fill }} /></div>
                </div>
              ))}
            </div>
          </div>

          {/* Toggle button — always visible at the bottom-right */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6, marginTop: showStats ? 4 : 0 }}>
            <button
              onClick={() => setShowStats(s => !s)}
              title={showStats ? "Hide stats (focus mode)" : "Show stats"}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                height: 26, padding: "0 11px",
                borderRadius: 20,
                background: showStats ? "var(--s2)" : `${accent.v}18`,
                border: `1.5px solid ${showStats ? "var(--b1)" : accent.v + "50"}`,
                color: showStats ? "var(--t3)" : accent.v,
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                transition: "all .22s cubic-bezier(.4,0,.2,1)",
                letterSpacing: .3,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: showStats ? "rotate(0deg)" : "rotate(180deg)", transition: "transform .3s ease" }}>
                <polyline points="18 15 12 9 6 15" />
              </svg>
              {showStats ? "Hide stats" : "Show stats"}
            </button>
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

        <div className="filter-bar">
          <span className={`fchip ${!showDone && !showStarred ? "on" : ""}`} onClick={() => { setShowDone(false); setShowStarred(false); setFilterKey(k => k + 1); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /></svg>
            {t.active}
          </span>
          <span className={`fchip ${showDone ? "on" : ""}`} onClick={() => { setShowDone(true); setShowStarred(false); setFilterKey(k => k + 1); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {t.done}
          </span>
          <span className={`fchip ${showStarred ? "on" : ""}`} onClick={() => { setShowStarred(true); setShowDone(false); setFilterKey(k => k + 1); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
            {t.starred}
          </span>
          {categories.map(c => {
            const catIcons = {
              work: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>,
              personal: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
              health: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
              learning: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
              groceries: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>,
            };
            const icon = catIcons[c.id] || <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" /></svg>;
            return <span key={c.id} className={`fchip ${filterCat === c.id ? "on" : ""}`} onClick={() => { setFilterCat(fc => fc === c.id ? "all" : c.id); setFilterKey(k => k + 1); }}>{icon}{c.name}</span>;
          })}
        </div>
        <div className="sec-head">
          <div className="sec-title">{t.tasks} ({viewTasks.length})</div>
          <div className="view-row">
            <div style={{ display: "flex", gap: 3 }}><button className={`vt-btn ${viewMode === "list" ? "on" : ""}`} onClick={() => setViewMode("list")}>☰</button><button className={`vt-btn ${viewMode === "grid" ? "on" : ""}`} onClick={() => setViewMode("grid")}>⊞</button></div>
            <button className="sort-btn" onClick={() => setSort(s => ({ created: "priority", priority: "due", due: "alpha", alpha: "created" }[s]))}>↕ {sort === "created" ? "Recent" : sort === "priority" ? "Priority" : sort === "due" ? "Due" : "A-Z"}</button>
            <button onClick={() => { setBulkMode(m => !m); setBulkSelected(new Set()); }} style={{ width: 32, height: 32, borderRadius: "50%", fontSize: 15, border: "none", background: bulkMode ? `${accent.v}18` : "transparent", color: bulkMode ? accent.v : "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background .15s,color .15s", flexShrink: 0 }}>
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
          ? (() => {
            // All tasks done (has tasks but none active) — show celebration
            const hasTasks = profileTasks.length > 0;
            const allDone = hasTasks && !showDone && profileTasks.filter(x => !x.done).length === 0;
            if (allDone) return (
              <div className="all-done-wrap">
                <div className="all-done-illo" style={{ position: "relative", display: "inline-block" }}>
                  {dark ? (
                    <img
                      src="all_done_dark.png"
                      alt="Relaxing after completing all tasks"
                      style={{
                        width: 300,
                        height: "auto"
                      }}
                    />
                  ) : (
                    <NoWhiteBgImage
                      src="data:image/avif;base64,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"
                      alt="Relaxing after completing all tasks"
                      style={{
                        width: 300,
                        height: "auto"
                      }}
                    />
                  )}
                  <div style={{
                    position: "absolute",
                    bottom: 10,
                    right: 10,
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "#22c55e",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 10px rgba(34,197,94,0.5)"
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 13l4 4L19 7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <div className="all-done-title">All tasks complete! 🎉</div>
                <div className="all-done-sub">Time to relax — you've earned it </div>
              </div>
            );
            // Truly empty — no tasks at all
            return <div className="empty">
              <div className="empty-icon" style={{ fontSize: "unset", opacity: 1 }}>
                {showDone
                  ? <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                  : <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                }
              </div>
              <div className="empty-t">{t.noTasks}</div>
              <div className="empty-t" style={{ fontSize: 12, color: "var(--t3)" }}>{t.addFirst}</div>
            </div>;
          })()
          : <div
            key={filterKey}
            className={viewMode === "grid" ? "task-grid" : "task-list"}
            onDragOver={e => e.preventDefault()}
          >
            {viewTasks.map((task, i) => (
              <div key={task.id} style={{ animation: `taskSlideIn 0.28s cubic-bezier(.34,1.56,.64,1) both`, animationDelay: `${Math.min(i * 40, 300)}ms` }}>
                <TaskCard task={task} />
              </div>
            ))}
          </div>
        }


      </div>
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
      (last7Done * 15) + (pct * 0.3)
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



    const scoreColor = prodScore >= 80 ? "#6bcb77" : prodScore >= 50 ? accent.v : "#ffd93d";
    const scoreMsg = prodScore >= 80 ? "Absolutely crushing it" : prodScore >= 60 ? "Strong performance" : prodScore >= 40 ? "Building momentum" : "Getting started";

    return (
      <div style={{ padding: "18px 18px 100px" }}>
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 24, marginBottom: 18 }}>{t.stats}</div>

        {/* ── Quick Stats Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 14 }}>
          {[
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="#6bcb77" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>, val: doneCount, lbl: "Done", col: "#6bcb77" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={accent.v} strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke={accent.v} strokeWidth="1.8" strokeLinecap="round" /></svg>, val: activeCount, lbl: "Active", col: accent.v },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#ff6b6b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>, val: overdueCount, lbl: "Overdue", col: "#ff6b6b" },
            { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke={accent.v} strokeWidth="1.8" strokeLinecap="round" /><path d="M7 16l4-4 4 4 4-4" stroke={accent.v} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>, val: pct + "%", lbl: "Rate", col: accent.v },
          ].map(s => (
            <div key={s.lbl} style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: s.col, lineHeight: 1.1 }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{s.lbl}</div>
            </div>
          ))}
        </div>

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
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>Productivity Score</div>
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
              </div>
            </div>
          </div>
        </div>

        {/* ── Activity Heatmap */}
        <div className="chart-card">
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="4" height="4" rx="1" fill="currentColor" opacity=".25" /><rect x="10" y="3" width="4" height="4" rx="1" fill="currentColor" opacity=".5" /><rect x="17" y="3" width="4" height="4" rx="1" fill="currentColor" opacity=".9" /><rect x="3" y="10" width="4" height="4" rx="1" fill="currentColor" opacity=".5" /><rect x="10" y="10" width="4" height="4" rx="1" fill="currentColor" /><rect x="17" y="10" width="4" height="4" rx="1" fill="currentColor" opacity=".4" /><rect x="3" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".7" /><rect x="10" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".3" /><rect x="17" y="17" width="4" height="4" rx="1" fill="currentColor" opacity=".6" /></svg>Activity Heatmap — Last 35 Days</div>
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
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><rect x="6" y="10" width="3" height="8" rx="1" fill="currentColor" opacity=".5" /><rect x="11" y="6" width="3" height="12" rx="1" fill="currentColor" opacity=".75" /><rect x="16" y="8" width="3" height="10" rx="1" fill="currentColor" /></svg>This Week — Daily Tasks</div>
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
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" /><path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" /><path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 14l1.5 1.5L16 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Best Day of Week</div>
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
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>Most Productive Hour</div>
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
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M3 7h18M3 12h10M3 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="19" cy="16" r="3" stroke="currentColor" strokeWidth="1.6" /><path d="M21.5 18.5l1.5 1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>{t.byCategory}</div>
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
          <div className="chart-title" style={{ display: "flex", alignItems: "center", gap: 7 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" /><path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="16" r="1" fill="currentColor" /></svg>Priority Distribution</div>
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




        {/* ── LIBI Insight */}
        <div style={{ background: `linear-gradient(135deg,${accent.v}15,${accent.v}08)`, border: `1px solid ${accent.v}30`, borderRadius: 16, padding: "16px", marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: `linear-gradient(135deg,${accent.v},${accent.g})`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
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


  // == International Holidays ==
  function getHolidays(year) {
    const h = {};
    const add = (m, d, name, emoji = "🎉") => {
      const key = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (!h[key]) h[key] = [];
      h[key].push({ name, emoji });
    };
    // Fixed-date international holidays
    add(1, 1, "New Year's Day", "🎆");
    add(2, 14, "Valentine's Day", "💝");
    add(3, 8, "Int'l Women's Day", "♀️");
    add(3, 17, "St. Patrick's Day", "☘️");
    add(3, 20, "Int'l Day of Happiness", "😊");
    add(4, 1, "April Fools' Day", "🃏");
    add(4, 22, "Earth Day", "🌍");
    add(5, 1, "Int'l Labour Day", "✊");
    add(5, 4, "Star Wars Day", "⚔️");
    add(6, 5, "World Environment Day", "🌱");
    add(6, 21, "Int'l Yoga Day", "🧘");
    add(7, 4, "US Independence Day", "🗽");
    add(8, 12, "Int'l Youth Day", "🌟");
    add(9, 5, "Int'l Day of Charity", "❤️");
    add(10, 1, "Int'l Day of Elders", "🌸");
    add(10, 10, "World Mental Health Day", "🧠");
    add(10, 16, "World Food Day", "🍎");
    add(10, 31, "Halloween", "🎃");
    add(11, 11, "Remembrance Day", "🌺");
    add(12, 3, "Int'l Day of Persons with Disabilities", "♿");
    add(12, 10, "Human Rights Day", "✊");
    add(12, 24, "Christmas Eve", "🎁");
    add(12, 25, "Christmas Day", "🎄");
    add(12, 26, "Boxing Day", "📦");
    add(12, 31, "New Year's Eve", "🥂");

    // Indian holidays (fixed)
    add(1, 26, "Republic Day 🇮🇳", "🇮🇳");
    add(8, 15, "Independence Day 🇮🇳", "🇮🇳");
    add(10, 2, "Gandhi Jayanti", "🕊️");

    // Easter (Gregorian)
    const easter = (yr) => {
      const a = yr % 19, b = Math.floor(yr / 100), c = yr % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3), h2 = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4), k = c % 4;
      const l = (32 + 2 * e + 2 * i - h2 - k) % 7;
      const m2 = Math.floor((a + 11 * h2 + 22 * l) / 451);
      const month = Math.floor((h2 + l - 7 * m2 + 114) / 31);
      const day = ((h2 + l - 7 * m2 + 114) % 31) + 1;
      return { month, day };
    };
    const { month: em, day: ed } = easter(year);
    add(em, ed, "Easter Sunday", "🐣");
    // Good Friday = 2 days before Easter
    const gf = new Date(year, em - 1, ed - 2);
    add(gf.getMonth() + 1, gf.getDate(), "Good Friday", "✝️");

    return h;
  }

  function CalendarPage() {
    const days = getDaysInMonth(calYear, calMonth);
    const firstDay = getFirstDay(calYear, calMonth);
    const cells = Array.from({ length: firstDay + days }, (_, i) => i < firstDay ? null : i - firstDay + 1);
    const pad = (7 - cells.length % 7) % 7;
    const allCells = [...cells, ...Array(pad).fill(null)];
    const numRows = allCells.length / 7;
    const monthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    // Group tasks by date for all view modes
    const tasksByDate = {};
    [...profileTasks, ...profileStickers].forEach(t => {
      if (t.due) {
        if (!tasksByDate[t.due]) tasksByDate[t.due] = [];
        tasksByDate[t.due].push(t);
      }
    });

    // Holidays for current year
    const holidays = getHolidays(calYear);

    // Sticky note styling
    const stickerColors = ["#fef08a", "#fbcfe8", "#bbf7d0", "#bfdbfe", "#e9d5ff"];
    const getStickerColor = (task) => {
      let hash = 0;
      for (let i = 0; i < task.id.length; i++) hash = task.id.charCodeAt(i) + ((hash << 5) - hash);
      return stickerColors[Math.abs(hash) % stickerColors.length];
    };
    const getRotation = (task) => {
      let hash = 0;
      for (let i = 0; i < task.id.length; i++) hash = task.id.charCodeAt(i) + ((hash << 5) - hash);
      return (Math.abs(hash) % 10) - 5; // -5 to +4 degrees
    };

    const handlePinchStart = (e) => {
      if (e.touches.length === 2) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        e.currentTarget.dataset.pinchStartDist = dist;
        e.currentTarget.dataset.pinchStartZoom = calZoom;
      }
    };

    const handlePinchMove = (e) => {
      if (e.touches.length === 2 && e.currentTarget.dataset.pinchStartDist) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const startDist = parseFloat(e.currentTarget.dataset.pinchStartDist);
        const startZoom = parseFloat(e.currentTarget.dataset.pinchStartZoom);
        let newZoom = startZoom * (dist / startDist);
        if (newZoom < 1.0) newZoom = 1.0;
        if (newZoom > 2.5) newZoom = 2.5;
        setCalZoom(newZoom);
      }
    };

    const handlePinchEnd = (e) => {
      e.currentTarget.dataset.pinchStartDist = "";
    };

    const handleWheel = (e) => {
      if (e.currentTarget.dataset.wheeling) return;
      if (Math.abs(e.deltaY) > 30) {
        e.currentTarget.dataset.wheeling = "true";
        if (e.deltaY > 0) {
          if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1);
        } else {
          if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1);
        }
        setTimeout(() => { if (e.currentTarget) e.currentTarget.dataset.wheeling = ""; }, 500);
      }
    };



    return (
      <div className="cal-page cal-page-responsive"
        onWheel={handleWheel}
        onClick={() => setShowCalJump(false)}
        style={{ background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 0 100px", overflowY: "auto", overflowX: "hidden", position: "absolute", inset: 0 }}>
        <style>{`
          .cal-page-responsive { padding: 20px 0 100px; }
          .desk-cal-wrap { width: 100%; max-width: 860px; padding: 0 18px; }

          /* Main card — matches planner's var(--s1) card style */
          .desk-cal-inner { border-radius: 18px; position: relative; background: var(--s1); border: 1.5px solid var(--b1); box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden; }

          /* Spiral strip */
          .desk-cal-spiral-cont { width: 100%; height: 30px; display: flex; align-items: center; justify-content: space-evenly; padding: 0 20px; box-sizing: border-box; background: var(--s2); border-bottom: 1.5px solid var(--b1); }
          .desk-cal-spiral { width: 12px; height: 22px; border-radius: 6px; flex-shrink: 0; background: var(--b2); box-shadow: inset 0 1px 2px rgba(255,255,255,0.1), 0 1px 4px rgba(0,0,0,0.2); }

          /* Header row */
          .desk-cal-header { padding: 12px 18px; display: flex; align-items: center; gap: 8px; border-bottom: 1.5px solid var(--b1); background: var(--s1); }
          .desk-cal-title { font-size: 18px; font-weight: 700; color: var(--t1); letter-spacing: -0.3px; line-height: 1; }
          .desk-cal-year { font-size: 12px; color: var(--t3); font-weight: 700; letter-spacing: 1.5px; }
          .desk-cal-controls { display: flex; gap: 8px; align-items: center; width: 100%; }

          /* Buttons — match planner's var(--s2) tonal style */
          .desk-cal-btn { width: 38px; height: 38px; border-radius: 10px; background: var(--s2); display: flex; align-items: center; justify-content: center; color: var(--t2); border: 1px solid var(--b1); cursor: pointer; transition: all 0.15s; }
          .desk-cal-btn:hover { background: var(--s3); color: var(--t1); }
          .desk-cal-btn.today { padding: 0 16px; width: auto; color: var(--t1); font-weight: 700; font-size: 13.5px; }

          /* Day headers */
          .desk-cal-day-header { padding: 10px 6px; text-align: center; font-size: 11px; font-weight: 800; color: var(--t3); text-transform: uppercase; letter-spacing: 1.2px; background: var(--s2); border-right: 1px solid var(--b1); border-bottom: 1.5px solid var(--b1); }
          .desk-cal-day-header:last-child { border-right: none; }

          /* Grid */
          .desk-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: minmax(var(--row-min), 1fr); --row-min: 100px; }
          .desk-cal-grid-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }

          /* Cell — matches planner card interior */
          .desk-cal-cell { padding: 8px; position: relative; cursor: pointer; transition: background 0.15s; min-width: 0; background: var(--s1); border-right: 1px solid var(--b1); border-bottom: 1px solid var(--b1); }
          .desk-cal-cell:nth-child(7n) { border-right: none; }
          .desk-cal-cell:hover { background: var(--s2); }

          /* Date number */
          .desk-cal-date-num { font-size: 13px; font-weight: 700; width: 26px; height: 26px; border-radius: 8px; display: flex; align-items: center; justify-content: center; margin-bottom: 6px; color: var(--t2); }

          /* Holiday pill */
          .desk-cal-hol-wrap { min-width: 0; width: 100%; overflow: hidden; }
          .desk-cal-hol { font-size: 10.5px; font-weight: 600; color: var(--acc); background: var(--accd); padding: 2px 7px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; display: block; width: 100%; box-sizing: border-box; border-left: 2.5px solid var(--acc); }

          /* Sticker / task chip */
          .desk-cal-sticker { padding: 6px 8px; font-size: 12px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.12); position: relative; cursor: pointer; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease; z-index: 5; line-height: 1.2; word-break: break-word; }
          .desk-cal-sticker-text { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; white-space: pre-wrap; }
          .desk-cal-sticker-tape { position: absolute; top: -4px; left: 50%; transform: translateX(-50%); width: 18px; height: 6px; background: rgba(0,0,0,0.08); border-radius: 3px; }

          /* Bottom edge strip */
          .desk-cal-bottom { height: 14px; background: var(--s2); border-top: 1.5px solid var(--b1); border-radius: 0 0 18px 18px; }

          @keyframes calJumpIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
            to   { opacity: 1; transform: translateX(-50%) translateY(0); }
          }
          @media (max-width: 600px) {
            .cal-page-responsive { padding: 0!important; }
            .desk-cal-wrap { padding: 0; }
            .desk-cal-inner { margin-top: 0; border-radius: 0; border: none; height: 100dvh; display: flex; flex-direction: column; }
            .desk-cal-spiral-cont { height: 22px; padding: 0 10px; }
            .desk-cal-spiral { width: 9px; height: 17px; border-radius: 5px; }
            .desk-cal-header { padding: 8px 10px; gap: 6px; }
            .desk-cal-title { font-size: 15px; }
            .desk-cal-year { font-size: 10px; }
            .desk-cal-controls { gap: 5px; }
            .desk-cal-btn { width: 32px; height: 32px; border-radius: 8px; }
            .desk-cal-btn.today { padding: 0 10px; font-size: 11.5px; }
            .desk-cal-grid-wrap { flex: 1; min-height: 0; }
            .desk-cal-grid { --row-min: 0px; height: 100%; align-content: stretch; }
            .desk-cal-day-header { padding: 6px 2px; font-size: 8.5px; letter-spacing: 0.2px; }
            .desk-cal-cell { padding: 3px; }
            .desk-cal-date-num { width: 18px; height: 18px; font-size: 10px; margin-bottom: 3px; border-radius: 5px; }
            .desk-cal-hol { font-size: 7.5px; padding: 1px 3px; }
            .desk-cal-sticker { font-size: 9px; padding: 3px 4px; border-radius: 5px; }
            .desk-cal-sticker-tape { width: 10px; height: 4px; top: -2px; }
            .desk-cal-bottom { height: 0; }
          }
        `}</style>

        {/* Desk Calendar Wrapper */}
        <div className="desk-cal-wrap"
          onTouchStart={handlePinchStart}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          style={{
            maxWidth: "100%",
            transform: `scale(${calZoom})`,
            transformOrigin: "top center",
            transition: "transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
            touchAction: "pan-x pan-y"
          }}>

          <div className="desk-cal-inner" style={{ overflow: "hidden" }}>

            {/* Spiral Binding Strip — sits above header, never overlaps text */}
            <div className="desk-cal-spiral-cont">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="desk-cal-spiral" />
              ))}
            </div>

            {/* Calendar Header */}
            <div className="desk-cal-header" style={{ position: "relative" }}>
              {/* Prev */}
              <button className="desk-cal-btn" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              {/* Today */}
              <button className="desk-cal-btn today" onClick={() => { const n = new Date(); setCalMonth(n.getMonth()); setCalYear(n.getFullYear()); setSelDate(todayStr()); }}>Today</button>
              {/* Next */}
              <button className="desk-cal-btn" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>

              {/* Month / Year — clickable jump picker, centred in remaining space */}
              <div style={{ flex: 1, display: "flex", justifyContent: "center", position: "relative" }}>
                <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 12, background: showCalJump ? "var(--s2)" : "transparent", transition: "background .15s" }}
                  onClick={e => { e.stopPropagation(); setJumpYear(calYear); setShowCalJump(v => !v); }}>
                  <span className="desk-cal-title" style={{ color: dark ? "#f0f2ff" : "#1a1d2b" }}>{monthLabel.split(" ")[0]}</span>
                  <span className="desk-cal-year" style={{ marginTop: 2 }}>{calYear}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .5, transition: "transform .2s", transform: showCalJump ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
                </div>
                {/* Quick-Jump Picker */}
                {showCalJump && (
                  <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", zIndex: 500, background: "var(--s1)", border: "1.5px solid var(--b1)", borderRadius: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.18)", padding: "16px 14px 12px", minWidth: 260, animation: "calJumpIn .2s ease-out forwards" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <button onClick={() => setJumpYear(y => y - 1)} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <span style={{ fontWeight: 800, fontSize: 18, color: "var(--t1)", letterSpacing: -.3 }}>{jumpYear}</span>
                      <button onClick={() => setJumpYear(y => y + 1)} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((mn, mi) => {
                        const isActive = mi === calMonth && jumpYear === calYear;
                        return (
                          <button key={mi} onClick={() => { setCalMonth(mi); setCalYear(jumpYear); setShowCalJump(false); }}
                            style={{ height: 36, borderRadius: 10, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", transition: "all .15s", background: isActive ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s2)", color: isActive ? "#fff" : "var(--t2)", boxShadow: isActive ? `0 3px 10px ${accent.v}50` : "none" }}>
                            {mn}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                      <button onClick={() => { const n = new Date(); setCalMonth(n.getMonth()); setCalYear(n.getFullYear()); setShowCalJump(false); }}
                        style={{ fontSize: 12, fontWeight: 700, color: accent.v, background: "none", border: "none", cursor: "pointer", padding: "4px 10px" }}>Jump to Today</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Grid toggle — far right */}
              <button className={`desk-cal-btn view-toggle ${calViewMode === 'desk' ? 'active' : ''}`}
                onClick={() => setCalViewMode(m => m === 'desk' ? 'wall' : 'desk')}
                title={calViewMode === 'desk' ? "Switch to Wall View" : "Switch to Desk View"}
                style={{ background: calViewMode === 'desk' ? "var(--acc)" : "var(--s2)", color: calViewMode === 'desk' ? "#fff" : "var(--t2)", flexShrink: 0 }}>
                {calViewMode === 'desk' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                )}
              </button>
            </div>

            {/* Grid */}
            <div className="desk-cal-grid-wrap" style={{
              overflowX: calViewMode === "desk" ? "auto" : "hidden",
              width: "100%",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              WebkitOverflowScrolling: "touch",
              transition: "all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }}>
              <div className="desk-cal-grid"
                style={{
                  minWidth: calViewMode === "desk" ? (window.innerWidth > 600 ? "800px" : "700px") : "100%",
                  transition: "min-width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                  flex: 1,
                  gridTemplateRows: `auto repeat(${numRows}, 1fr)`
                }}
                onTouchStart={e => {
                  if (calViewMode === "desk") return;
                  e.currentTarget.dataset.startX = e.touches[0].clientX;
                }}
                onTouchEnd={e => {
                  if (calViewMode === "desk") return;
                  const sx = parseFloat(e.currentTarget.dataset.startX);
                  if (!sx) return;
                  const dx = e.changedTouches[0].clientX - sx;

                  if (Math.abs(dx) > 50) {
                    if (dx > 50) {
                      if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1);
                    } else if (dx < -50) {
                      if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1);
                    }
                  }

                  e.currentTarget.dataset.startX = "";
                }}
              >
                {/* Day Headers */}
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
                  <div key={i} className="desk-cal-day-header">{d}</div>
                ))}

                {/* Cells */}
                {allCells.map((day, i) => {
                  if (!day) return <div key={i} style={{ borderRight: (i % 7 !== 6) ? "1px solid var(--b1)" : "none", borderBottom: (Math.floor(i / 7) < numRows - 1) ? "1px solid var(--b1)" : "none", background: "var(--s2)", opacity: 0.5 }} />;
                  const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayTasks = tasksByDate[ds] || [];
                  const dayHolidays = holidays[ds] || [];
                  const isToday = ds === todayStr();
                  const isSel = ds === selDate;

                  return (
                    <div key={i} className="desk-cal-cell"
                      onClick={(e) => {
                        if (e.target.closest('.desk-cal-sticker')) return;
                        setSelDate(ds);
                        setInlineSticker({ date: ds, id: `temp-${Date.now()}` });
                        play("tap"); haptic("light");
                      }}
                      style={{
                        borderRight: (i % 7 !== 6) ? "1px solid var(--b1)" : "none",
                        borderBottom: (Math.floor(i / 7) < numRows - 1) ? "1px solid var(--b1)" : "none",
                        background: isSel ? "var(--s2)" : "transparent"
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "var(--s2)"; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div className="desk-cal-date-num" style={{
                        color: isToday ? "#fff" : isSel ? "var(--acc)" : "var(--t2)",
                        background: isToday ? "var(--acc)" : isSel ? "var(--accd)" : "transparent",
                        boxShadow: isToday ? "0 2px 8px var(--glow)" : "none"
                      }}>{day}</div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0, width: "100%" }}>
                        {dayHolidays.map((hol, hi) => (
                          <div key={"hol-" + hi} className="desk-cal-hol-wrap" onClick={e => e.stopPropagation()}>
                            <div
                              className="desk-cal-hol"
                              onClick={e => {
                                e.stopPropagation();
                                const r = e.currentTarget.getBoundingClientRect();
                                setHolTooltip(holTooltip?.name === hol.name ? null : { name: hol.name, emoji: hol.emoji, x: r.left, y: r.bottom + 4 });
                              }}
                              onMouseEnter={e => {
                                const r = e.currentTarget.getBoundingClientRect();
                                setHolTooltip({ name: hol.name, emoji: hol.emoji, x: r.left, y: r.bottom + 4 });
                              }}
                              onMouseLeave={() => setHolTooltip(null)}
                            >
                              {hol.emoji} {hol.name}
                            </div>
                          </div>
                        ))}

                        {dayTasks.map(t => (
                          <div key={t.id} className="desk-cal-sticker" style={{
                            background: getStickerColor(t), color: "#1f2937", transform: `rotate(${getRotation(t)}deg)`
                          }}
                            onMouseEnter={e => { e.currentTarget.style.transform = `scale(1.15) rotate(${getRotation(t)}deg) translateY(-2px)`; e.currentTarget.style.boxShadow = "4px 8px 16px rgba(0,0,0,0.18)"; e.currentTarget.style.zIndex = 10; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = `rotate(${getRotation(t)}deg) translateY(0)`; e.currentTarget.style.boxShadow = "2px 4px 8px rgba(0,0,0,0.12)"; e.currentTarget.style.zIndex = 5; }}
                            title={t.title}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMagnifiedSticker(t);
                              play("tap"); haptic("light");
                            }}>
                            <div className="desk-cal-sticker-tape" />
                            <div className="desk-cal-sticker-text">{t.title}</div>
                          </div>
                        ))}

                        {inlineSticker?.date === ds && (
                          <div className="desk-cal-sticker" style={{
                            background: getStickerColor({ id: inlineSticker.id }),
                            color: "#1f2937",
                            transform: `rotate(${getRotation({ id: inlineSticker.id })}deg)`,
                            zIndex: 20
                          }}
                            onClick={e => e.stopPropagation()}>
                            <div className="desk-cal-sticker-tape" />
                            <textarea
                              autoFocus
                              placeholder="Type task..."
                              style={{
                                width: "100%", background: "transparent", border: "none", outline: "none",
                                fontFamily: "inherit", fontSize: "inherit", color: "inherit", resize: "none",
                                padding: 0, margin: 0, lineHeight: 1.2, height: "auto", minHeight: 18, overflow: "hidden"
                              }}
                              onInput={(e) => {
                                e.target.style.height = "auto";
                                e.target.style.height = e.target.scrollHeight + "px";
                              }}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                setInlineSticker(null);
                                if (val) {
                                  const newTask = { ...blankForm, title: val, due: ds, profileId: activeProfile, id: uid(), done: false, createdAt: Date.now(), isCalendarSticker: true };
                                  setTasks(ts => [newTask, ...ts]);
                                  play("add");
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  e.target.blur();
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Calendar Bottom Edge */}
            <div className="desk-cal-bottom" />
          </div>
        </div>

        {/* Holiday tooltip — smart positioned to never clip screen edges */}
        {holTooltip && (() => {
          const TIP_W = 220;
          const TIP_H = 36;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let tx = holTooltip.x;
          let ty = holTooltip.y;
          // Clamp right edge
          if (tx + TIP_W > vw - 8) tx = vw - TIP_W - 8;
          if (tx < 8) tx = 8;
          // Flip above if would go off bottom
          if (ty + TIP_H > vh - 8) ty = holTooltip.y - TIP_H - 28;
          return (
            <>
              <div onClick={() => setHolTooltip(null)} style={{ position: "fixed", inset: 0, zIndex: 99998 }} />
              <div style={{
                position: "fixed", left: tx, top: ty,
                zIndex: 99999, pointerEvents: "none",
                background: "var(--accd)", color: "var(--acc)",
                border: "1px solid var(--acc)", borderRadius: 10,
                padding: "6px 12px", fontSize: 13, fontWeight: 700,
                whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.22)",
                display: "flex", alignItems: "center", gap: 6,
                animation: "su .15s cubic-bezier(.32,1.2,.64,1)"
              }}>
                <span style={{ fontSize: 16 }}>{holTooltip.emoji}</span>
                {holTooltip.name}
              </div>
            </>
          );
        })()}

        {/* Magnified Sticker Overlay */}
        {magnifiedSticker && (
          <div className="magnified-sticker-overlay page-fade" style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
            display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(5px)",
            padding: 20
          }} onClick={() => setMagnifiedSticker(null)}>
            <div className="desk-cal-sticker magnified-sticker" style={{
              background: getStickerColor(magnifiedSticker), color: "#1f2937",
              transform: `scale(1.8) rotate(${getRotation(magnifiedSticker) * 0.5}deg)`,
              width: 180, minHeight: 180, padding: "20px 16px 16px",
              boxShadow: "0 24px 48px rgba(0,0,0,0.4), inset 0 2px 4px rgba(255,255,255,0.4)", cursor: "default",
              display: "flex", flexDirection: "column", borderRadius: 4, transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)"
            }} onClick={e => e.stopPropagation()}>
              <div className="desk-cal-sticker-tape" style={{ width: 40, height: 12, top: -6, left: "50%", transform: "translateX(-50%)" }} />

              <textarea
                autoFocus
                defaultValue={magnifiedSticker.title}
                style={{
                  flex: 1, width: "100%", background: "transparent", border: "none", outline: "none",
                  fontFamily: "inherit", fontSize: 13, color: "inherit", resize: "none",
                  padding: 0, margin: 0, lineHeight: 1.3
                }}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (val !== magnifiedSticker.title) {
                    if (val) {
                      updateTask(magnifiedSticker.id, { title: val });
                      setMagnifiedSticker(t => ({ ...t, title: val }));
                    } else {
                      deleteTask(magnifiedSticker.id);
                      setMagnifiedSticker(null);
                    }
                  }
                }}
              />

              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                {magnifiedSticker.isCalendarSticker && (
                  <button style={{
                    padding: "6px 8px", background: "rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6,
                    cursor: "pointer", fontWeight: "700", fontSize: 9, color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4
                  }} onClick={() => {
                    updateTask(magnifiedSticker.id, { isCalendarSticker: false });
                    setMagnifiedSticker(null);
                    setEditTaskObj({ ...magnifiedSticker, isCalendarSticker: false });
                    setForm({ ...blankForm, title: magnifiedSticker.title, priority: "low", due: magnifiedSticker.due, notes: "", category: "all", photo: "", profileId: magnifiedSticker.profileId });
                    setShowTaskModal(true);
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                    ADD TO TASKS
                  </button>
                )}
                {!magnifiedSticker.isCalendarSticker && (
                  <button style={{
                    padding: "6px 8px", background: "rgba(0,0,0,0.08)", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 6,
                    cursor: "pointer", fontWeight: "700", fontSize: 9, color: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4
                  }} onClick={() => {
                    setMagnifiedSticker(null);
                    setEditTaskObj(magnifiedSticker);
                    setForm({ ...blankForm, title: magnifiedSticker.title, priority: magnifiedSticker.priority || "low", due: magnifiedSticker.due, notes: magnifiedSticker.notes || "", category: magnifiedSticker.category || "all", photo: magnifiedSticker.photo || "", profileId: magnifiedSticker.profileId, subtasks: magnifiedSticker.subtasks || [], tags: magnifiedSticker.tags || [] });
                    setShowTaskModal(true);
                  }}>
                    EDIT TASK DETAILS
                  </button>
                )}
                <button style={{
                  padding: "6px 8px", background: "transparent", border: "none", borderRadius: 6,
                  cursor: "pointer", fontWeight: "700", fontSize: 9, color: "rgba(0,0,0,0.5)"
                }} onClick={() => {
                  deleteTask(magnifiedSticker.id);
                  setMagnifiedSticker(null);
                }}>
                  DELETE NOTE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  function SettingsPage() {
    // ── Reusable icon pill (matches Planner block icon pill style)
    const IconPill = ({ color, children }) => (
      <div style={{ width: 36, height: 36, borderRadius: 10, background: (color || accent.v) + "18", display: "flex", alignItems: "center", justifyContent: "center", color: color || accent.v, flexShrink: 0 }}>
        {children}
      </div>
    );
    // ── Reusable section label (same as Planner's "Unscheduled" label)
    const SectionLabel = ({ children }) => (
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, marginTop: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .8, textTransform: "uppercase" }}>{children}</span>
      </div>
    );
    // ── Reusable row (mirrors Planner task row: border-bottom, flex, gap)
    const Row = ({ onClick, children, noBorder }) => (
      <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: noBorder ? "none" : "1px solid var(--b1)", cursor: onClick ? "pointer" : "default", transition: "background .15s" }}
        onMouseEnter={e => { if (onClick) e.currentTarget.style.background = accent.v + "08"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
        {children}
      </div>
    );
    // ── Tonal pill button (matches Planner "+ Add" style)
    const PillBtn = ({ color, onClick, children }) => (
      <button onClick={onClick} style={{ height: 28, padding: "0 12px", background: (color || accent.v) + "15", color: color || accent.v, borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${(color || accent.v)}30`, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, letterSpacing: .1, whiteSpace: "nowrap" }}>
        {children}
      </button>
    );
    // ── Card wrapper (matches Planner time-block card)
    const Card = ({ children, highlight }) => (
      <div style={{ marginBottom: 10, background: "var(--s1)", border: `1.5px solid ${highlight ? accent.v + "44" : "var(--b1)"}`, borderRadius: 14, overflow: "hidden" }}>
        {children}
      </div>
    );
    // ── Chevron arrow
    const Chevron = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>;
    // ── Check mark
    const Check = ({ color }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color || accent.v} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>;

    return (
      <div style={{ padding: "20px 18px 100px" }}>

        {/* ── Header — identical to Planner */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>{t.settings}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>{t.appearanceHelp}</div>
        </div>

        {/* ── ACCOUNT */}
        <SectionLabel>{t.account || "Account"}</SectionLabel>
        <Card highlight={!!authUser}>
          {authUser ? (
            <Row noBorder>
              {authUser.photo
                ? <img src={authUser.photo} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                : <IconPill>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                </IconPill>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{authUser.name}</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{authUser.email} · {authUser.provider === "google.com" ? "Google" : "Email"}</div>
              </div>
              <PillBtn color="#ff6b6b" onClick={signOut}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </PillBtn>
            </Row>
          ) : (
            <Row onClick={() => signInWithGoogle()} noBorder>
              <IconPill>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </IconPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{t.signInWith || "Sign in with Google"}</div>
                <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{t.syncTasks || "Sync tasks across devices"}</div>
              </div>
              <Chevron />
            </Row>
          )}
        </Card>

        {/* ── APPEARANCE */}
        <SectionLabel>{t.theme || "Appearance"}</SectionLabel>
        <Card>
          {/* Dark / Light toggle */}
          <Row>
            <IconPill color="#f59e0b">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {dark ? <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /> : <><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></>}
              </svg>
            </IconPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{dark ? t.darkMode : t.lightMode}</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{t.tapSwitchTheme || "Tap to switch theme"}</div>
            </div>
            <div className={`toggle ${dark ? "on" : ""}`} onClick={() => setDark(d => !d)}><div className="toggle-knob" /></div>
          </Row>

          {/* Accent colours */}
          <Row noBorder>
            <IconPill color={accent.v}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>
            </IconPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{t.accentColor || "Accent Color"}</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 8 }}>
                {ACCENTS.map((a, i) => (
                  <div key={i} onClick={() => { setAccentIdx(i); play("tap"); }}
                    style={{ width: 28, height: 28, borderRadius: "50%", background: `linear-gradient(135deg,${a.v},${a.g})`, cursor: "pointer", border: `3px solid ${accentIdx === i ? "var(--t1)" : "transparent"}`, transition: "all .2s", transform: accentIdx === i ? "scale(1.2)" : "scale(1)", boxShadow: accentIdx === i ? `0 4px 12px ${a.v}55` : "none" }} />
                ))}
              </div>
            </div>
          </Row>
        </Card>

        {/* ── LANGUAGE */}
        <SectionLabel>{t.language || "Language"}</SectionLabel>
        <Card>
          {Object.entries(LANGS).map(([k, l], idx, arr) => (
            <Row key={k} onClick={() => { setLangKey(k); play("tap"); }} noBorder={idx === arr.length - 1}>
              <IconPill color="var(--t2)">
                <span style={{ fontSize: 18, lineHeight: 1 }}>{l.flag}</span>
              </IconPill>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{l.name}</div>
              </div>
              {langKey === k && <Check />}
            </Row>
          ))}
        </Card>

        {/* ── NOTIFICATIONS */}
        <SectionLabel>{t.notifSound || "Notifications & Sound"}</SectionLabel>
        <Card>
          <Row>
            <IconPill color="#ff6b6b">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            </IconPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{t.notifications}</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{t.getReminded || "Get reminded about due tasks"}</div>
            </div>
            <div className={`toggle ${notifsOn ? "on" : ""}`} onClick={() => setNotifsOn(n => !n)}><div className="toggle-knob" /></div>
          </Row>
          <Row noBorder>
            <IconPill color="#8b5cf6">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
            </IconPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{t.sound}</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{t.soundEffects || "Sound effects on actions"}</div>
            </div>
            <div className={`toggle ${soundOn ? "on" : ""}`} onClick={() => setSoundOn(s => !s)}><div className="toggle-knob" /></div>
          </Row>
        </Card>

        {/* ── INTEGRATIONS */}
        <SectionLabel>{t.integrations || "Integrations"}</SectionLabel>
        <Card>
          <Row onClick={exportToPDF}>
            <IconPill color="#6bcb77">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            </IconPill>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{t.exportPdf || "Export to PDF"}</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{t.weeklyReport || "Weekly report"}</div>
            </div>
            <Chevron />
          </Row>


          <Row onClick={authUser ? signOut : signInWithGoogle} noBorder>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
                <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{authUser ? "Signed in with Google" : "Sign in with Google"}</div>
              <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{authUser ? authUser.email : "Sync tasks across devices"}</div>
            </div>
            {authUser ? <Check color="#34A853" /> : <Chevron />}
          </Row>
        </Card>


        {/* ── LEGAL FOOTER */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--b1)", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
            <button onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--t3)", textDecoration: "underline", padding: 0 }}>{t.privacyPolicy || "Privacy Policy"}</button>
            <span style={{ color: "var(--b2)" }}>·</span>
            <button onClick={() => setShowPrivacy(true)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--t3)", textDecoration: "underline", padding: 0 }}>{t.termsOfService || "Terms of Service"}</button>
            <span style={{ color: "var(--b2)" }}>·</span>
            <span style={{ fontSize: 12, color: "var(--t3)" }}>© 2026 StaredList · LIBI Labs</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--t3)", opacity: .5 }}>v2.0 · Built with ♥ · taskflow-ultimate.netlify.app</div>
        </div>
      </div>
    );
  }


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
            if (pomoMode === "focus") {
              setPomoTotal(t => t + 1);
              setPomoMinsToday(t => t + 25);
              setPomoSession(s => s >= 3 ? 0 : s + 1);
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

  // == Auth State ==
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInited, setAuthInited] = useState(false);
const [showAuthScreen, setShowAuthScreen] = useState(false);

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

          localStorage.setItem("tf_uid", user.uid);

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
            const u = { uid: user.uid, email: user.email, name: user.displayName || user.email?.split("@")[0] || "User", photo: user.photoURL || null, provider: user.providerData?.[0]?.providerId || "google.com" };
            setAuthUser(u);
            setShowAuthScreen(false);
            localStorage.setItem("tf_uid", user.uid);

            if (user.displayName) { const fn = user.displayName.split(" ")[0]; setUserName(fn); localStorage.setItem("tf_username", fn); }
            // Always restore from cloud on sign-in so cross-device sync works
            try {
              const db2 = fb.db;
              const doc = await db2.collection("user_data").doc(user.uid).get();
              if (doc.exists) {
                const d = doc.data();
                if (d.tasks) setTasks(d.tasks);
                if (d.goals) setGoals(d.goals);
                if (d.habits) setHabits(d.habits);
                if (d.notes) setNotes(d.notes);
                if (d.categories?.length) setCategories(d.categories);
                if (d.libiMemory) setLibiMemory(d.libiMemory);
                if (d.langKey) setLangKey(d.langKey);
              } else { }
            } catch (e) { console.error("Cloud restore on sign-in:", e); }
          } else {
            setAuthUser(null);
            localStorage.removeItem("tf_uid");
            setShowAuthScreen(false);
          }
          setAuthInited(true);
        });
      }
    }).catch(() => { });
  }, []); // Pre-warm Firebase + restore session + auto-restore on start

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

  async function signOut() {
    try {
      const fb = await getFirebase();
      if (fb) await fb.auth.signOut();
      setAuthUser(null);
      localStorage.removeItem("tf_uid");
      localStorage.removeItem("tf_convos"); // clean up any old localStorage data
      showNotif("👋 Signed out", "See you next time!");
    } catch (e) { }
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

  const [goalSaving, setGoalSaving] = useState(false);
  async function saveGoal() {
    if (!goalForm.title.trim()) return;
    setGoalSaving(true);

    let finalMilestones = [...goalForm.milestones];
    if (finalMilestones.length === 0) {
      showNotif("✨ LIBI AI", "Generating optimal milestones...");
      try {
const groqData = await callLibi(
  [{ role: "user", content: `Generate steps for this goal: ${goalForm.title}` }],
  "You are LIBI AI. Return ONLY a valid JSON array of strings containing 3 to 5 practical, actionable milestone steps for the user's goal. Do not include markdown code block formatting or any other text. Example: [\"Step 1\", \"Step 2\"]",
  300
);
if (groqData) {
          let reply = groqData.choices?.[0]?.message?.content;
          try {
            const jsonStr = reply.replace(/```json/g, "").replace(/```/g, "").trim();
            const steps = JSON.parse(jsonStr);
            if (Array.isArray(steps) && steps.length > 0) {
              finalMilestones = steps.map(s => ({ id: uid(), text: s, done: false }));
            }
          } catch (e) { console.error("GPT parse error", e); }
        }
      } catch (e) { console.error("AI Milestone error", e); }
    }

    const goalData = { ...goalForm, milestones: finalMilestones };
    if (editGoal) setGoals(gs => gs.map(g => g.id === editGoal.id ? { ...g, ...goalData } : g));
    else setGoals(gs => [{ id: uid(), ...goalData, profileId: activeProfile }, ...gs]);
    setShowGoalModal(false); setEditGoal(null); play("add");
    showNotif("🏆 Goal saved!", goalForm.title);
    setGoalSaving(false);
  };
  function deleteGoal(id) { setGoals(gs => gs.filter(g => g.id !== id)); play("delete"); };


  function GoalsPage() {
    const profileGoals = goals.filter(g => !g.profileId || g.profileId === activeProfile);
    const totalMilestones = profileGoals.reduce((a, g) => a + g.milestones.length, 0);
    const doneMilestones = profileGoals.reduce((a, g) => a + g.milestones.filter(m => m.done).length, 0);
    const overallPct = totalMilestones ? Math.round((doneMilestones / totalMilestones) * 100) : 0;

    return (
      <div style={{ padding: "20px 18px 100px" }}>

        {/* ── Header — same layout as Planner */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>Goals</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>
              {profileGoals.length} goal{profileGoals.length !== 1 ? "s" : ""} · {doneMilestones} milestone{doneMilestones !== 1 ? "s" : ""} done
            </div>
          </div>
        </div>

        {/* ── New Goal button — same gradient style as Auto-Schedule */}
        <button style={{ width: "100%", height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#fff", border: "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", letterSpacing: .1, boxShadow: `0 2px 8px ${accent.v}40` }}
          onClick={() => { setGoalForm({ title: "", icon: "🎯", color: "#7c6dfa", deadline: "", milestones: [] }); setGoalMilestoneInput(""); setEditGoal(null); setShowGoalModal(true); }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Goal
        </button>

        {/* ── Overall progress bar (only when there are goals) */}
        {profileGoals.length > 0 && totalMilestones > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>Overall Progress</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: accent.v }}>{overallPct}%</span>
            </div>
            <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${overallPct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>{doneMilestones} of {totalMilestones} milestones completed</div>
          </div>
        )}

        {/* ── Empty state — same style as Planner */}
        {profileGoals.length === 0 && (
          <div className="empty">
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
              </svg>
            </div>
            <div className="empty-t">No goals yet!</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)" }}>Tap + to set your first goal</div>
          </div>
        )}

        {/* ── Goal cards — same card style as Planner time blocks */}
        {profileGoals.map(goal => {
          const done = goal.milestones.filter(m => m.done).length;
          const total = goal.milestones.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
          const isNearDeadline = daysLeft !== null && daysLeft < 7 && daysLeft >= 0;
          const isPastDeadline = daysLeft !== null && daysLeft < 0;

          return (
            <div key={goal.id} style={{ marginBottom: 10, background: "var(--s1)", border: `1.5px solid ${isNearDeadline || isPastDeadline ? goal.color + "55" : "var(--b1)"}`, borderRadius: 14, overflow: "hidden", boxShadow: isNearDeadline || isPastDeadline ? `0 2px 12px ${goal.color}18` : "none" }}>

              {/* Card header — mirrors Planner block header */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: goal.milestones.length > 0 ? "1px solid var(--b1)" : "none", background: isNearDeadline || isPastDeadline ? goal.color + "0d" : "transparent" }}>
                {/* Icon pill */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: goal.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                  {goal.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    {goal.title}
                    {isPastDeadline && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "rgba(255,107,107,.18)", color: "#ff6b6b", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#ff6b6b", display: "inline-block" }} />
                        Overdue
                      </span>
                    )}
                    {isNearDeadline && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: goal.color + "22", color: goal.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: goal.color, display: "inline-block" }} />
                        Due soon
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    {daysLeft !== null && !isPastDeadline && <span>{daysLeft}d left</span>}
                    {isPastDeadline && <span style={{ color: "#ff6b6b" }}>Deadline passed</span>}
                    <span>{done}/{total} milestones · {pct}%</span>
                  </div>
                </div>

                {/* Edit & Delete — tonal pill buttons like Planner's "+ Add" */}
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button style={{ height: 28, padding: "0 10px", background: goal.color + "15", color: goal.color, borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${goal.color}30`, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, letterSpacing: .1 }}
                    onClick={() => { setGoalForm({ title: goal.title, icon: goal.icon, color: goal.color, deadline: goal.deadline, milestones: goal.milestones.map(m => ({ ...m })) }); setGoalMilestoneInput(""); setEditGoal(goal); setShowGoalModal(true); }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    Edit
                  </button>
                  <button style={{ height: 28, padding: "0 10px", background: "rgba(255,107,107,.12)", color: "#ff6b6b", borderRadius: 7, fontSize: 12, fontWeight: 600, border: "1px solid rgba(255,107,107,.25)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, letterSpacing: .1 }}
                    onClick={() => deleteGoal(goal.id)}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                    Del
                  </button>
                </div>
              </div>

              {/* Progress bar inside card */}
              {total > 0 && (
                <div style={{ height: 3, background: "var(--s3)" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: goal.color, transition: "width .6s ease" }} />
                </div>
              )}

              {/* Milestone rows — mirrors Planner task rows */}
              {goal.milestones.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--b1)", background: m.done ? "var(--s2)" : "transparent", transition: "background .2s", cursor: "pointer" }}
                  onClick={() => { toggleMilestone(goal.id, m.id); play(m.done ? "tap" : "complete"); }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.8px solid ${m.done ? goal.color : "var(--b2)"}`, background: m.done ? goal.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all .18s" }}>
                    {m.done && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1, textDecoration: m.done ? "line-through" : "none", color: m.done ? "var(--t3)" : "var(--t1)" }}>{m.text}</span>
                </div>
              ))}

              {/* No milestones hint */}
              {goal.milestones.length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 12.5, color: "var(--t3)" }}>
                  No milestones yet — tap Edit to add some
                </div>
              )}
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
  const getHeatmapDays = (n) => Array.from({ length: n }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (n - 1) + i); return d.toISOString().split("T")[0]; });
  const getLast7Days = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return d.toISOString().split("T")[0]; });

  const [habitView, setHabitView] = useState(() => { try { return localStorage.getItem("tf_habitView") || "streak"; } catch { return "streak"; } });
  const [showHabitJourney, setShowHabitJourney] = useState(null); // stores { habitId, date, text, photo }
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [showHabitDetail, setShowHabitDetail] = useState(null); // stores habitId
  const [openLogMenu, setOpenLogMenu] = useState(null);
  const [viewPhoto, setViewPhoto] = useState(null);
  const [habitForm, setHabitForm] = useState({ name: "", icon: "drop", color: "#7c6dfa", freq: "daily", category: "Other" });
  const FREQ_OPTS = [{ id: "daily", label: "Every Day" }, { id: "weekdays", label: "Weekdays" }, { id: "weekly", label: "Weekly" }, { id: "3x", label: "3× Week" }];
  const HABIT_ICONS = ["drop", "sun", "moon", "book", "dumbbell", "coffee", "pill", "apple", "pencil", "shoe", "heart", "leaf", "monitor", "dollar", "smile", "music"];
  const HABIT_ICON_MAP = {
    "drop": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.5c-3.3 0-6-2.7-6-6 0-3.8 5-10.2 5.5-10.9.3-.3.8-.3 1 0 .5.7 5.5 7.1 5.5 10.9 0 3.3-2.7 6-6 6z" /></svg>,
    "sun": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
    "moon": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
    "book": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    "dumbbell": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5v14M18 5v14M2 12h20M2 9h4v6H2zM18 9h4v6h-4zM9 12h6" /></svg>,
    "coffee": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>,
    "pill": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>,
    "apple": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z" /><path d="M10 2c1 .5 2 2 2 5" /></svg>,
    "pencil": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
    "shoe": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14.5c.34-.14.7-.24 1.07-.29A2.5 2.5 0 0 0 22 11.5V10c0-1.1-.9-2-2-2h-3v-1a2 2 0 0 0-2-2H9C7 5 5 7 5 9v1c-1.1 0-2 .9-2 2v2c0 1.1.9 2 2 2h2v1c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2v-2.5z" /></svg>,
    "heart": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
    "leaf": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" /><path d="M2 22 12 12" /></svg>,
    "monitor": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>,
    "dollar": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
    "smile": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>,
    "music": <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
  };
  const HABIT_CATEGORIES = ["Health", "Work", "Mind", "Finance", "Fitness", "Learning", "Other"];

  function openHabitJourney(habitId, dateStr, logId = null) {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    let log = { text: "", photo: "" };
    if (logId) {
      const logsArray = habit.logs?.[dateStr];
      if (Array.isArray(logsArray)) {
        log = logsArray.find(l => l.id === logId) || log;
      }
    }
    setShowHabitJourney({ habitId, date: dateStr, logId, text: log.text || "", photo: log.photo || "", habitName: habit.name, color: habit.color });
  }

  function saveHabitJourney() {
    if (!showHabitJourney) return;
    const { habitId, date, logId, text, photo } = showHabitJourney;

    setHabits(hs => hs.map(h => {
      if (h.id !== habitId) return h;

      const currentLogs = h.logs?.[date];
      let newLogsForDate = Array.isArray(currentLogs) ? [...currentLogs] : (currentLogs?.text || currentLogs?.photo ? [{ id: "old", text: currentLogs.text, photo: currentLogs.photo }] : []);

      if (logId) {
        newLogsForDate = newLogsForDate.map(l => l.id === logId ? { ...l, text, photo } : l);
      } else {
        if (text || photo) {
          newLogsForDate.push({ id: Date.now().toString() + Math.floor(Math.random() * 1000), text, photo, timestamp: Date.now() });
        }
      }
      return { ...h, logs: { ...(h.logs || {}), [date]: newLogsForDate } };
    }));
    setShowHabitJourney(null);
    play("add");
  }

  function deleteHabitLog(habitId, date, logId) {
    if (!window.confirm("Delete this note?")) return;
    setHabits(hs => hs.map(h => {
      if (h.id !== habitId) return h;
      const currentLogs = h.logs?.[date];
      if (!Array.isArray(currentLogs)) return h;
      return { ...h, logs: { ...(h.logs || {}), [date]: currentLogs.filter(l => l.id !== logId) } };
    }));
  }

  function handleHabitPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setShowHabitJourney(prev => ({ ...prev, photo: ev.target.result }));
    };
    reader.readAsDataURL(file);
  }

  function toggleHabit(habitId, date) {
    setHabits(hs => {
      const updated = hs.map(h => h.id === habitId ? { ...h, completions: { ...h.completions, [date]: !h.completions[date] } } : h);
      try { localStorage.setItem("tf_habits", JSON.stringify(updated)); } catch (e) { }
      return updated;
    });
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
    setHabits(hs => [{ id: uid(), ...habitForm, completions: {}, logs: {}, profileId: activeProfile }, ...hs]);
    setShowHabitModal(false); play("add");
    showNotif("🔁 Habit added!", habitForm.name);
  };
  function deleteHabit(id) { setHabits(hs => hs.filter(h => h.id !== id)); play("delete"); };
  function toggleHabitView(v) { setHabitView(v); try { localStorage.setItem("tf_habitView", v); } catch (e) { } }

  function HabitsPage() {
    const profileHabits = habits.filter(h => !h.profileId || h.profileId === activeProfile);
    const heatmapDays = getHeatmapDays(210);
    const totalDoneSelDate = profileHabits.filter(h => h.completions[selHabitDate]).length;
    const allDoneSelDate = profileHabits.length > 0 && totalDoneSelDate === profileHabits.length;

    // Weekly calendar around selHabitDate
    const activeDateObj = new Date(selHabitDate);
    const dayOfWeek = activeDateObj.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(activeDateObj);
    startOfWeek.setDate(activeDateObj.getDate() + diffToMonday);
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return {
        dateStr: d.toISOString().split("T")[0],
        dayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
        dayNum: d.getDate()
      };
    });

    const progressPct = profileHabits.length
      ? Math.round((totalDoneSelDate / profileHabits.length) * 100)
      : 0;

    return (
      <div style={{ padding: "0 0 100px", minHeight: "100vh" }}>

        {/* ── Header */}
        <div style={{ padding: "16px 18px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>Habits</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>
            {profileHabits.length} habit{profileHabits.length !== 1 ? "s" : ""} · {profileHabits.filter(h => h.completions[todayStr()]).length} done today
          </div>
        </div>

        {/* ── Date header with week navigation */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 18px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="ic-btn" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, background: "var(--s2)" }} onClick={() => { const d = new Date(selHabitDate); d.setDate(d.getDate() - 7); setSelHabitDate(d.toISOString().split("T")[0]); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--t1)" }}>
              {selHabitDate === todayStr() ? "Today, " : ""}
              <span style={{ color: selHabitDate === todayStr() ? "var(--t3)" : "var(--t1)", fontWeight: 600 }}>
                {new Date(selHabitDate).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
              </span>
            </div>
            <button className="ic-btn" style={{ width: 28, height: 28, minWidth: 28, minHeight: 28, background: "var(--s2)", opacity: selHabitDate >= todayStr() ? 0.3 : 1 }} disabled={selHabitDate >= todayStr()} onClick={() => { const d = new Date(selHabitDate); d.setDate(d.getDate() + 7); setSelHabitDate(d.toISOString().split("T")[0]); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--acc)", fontWeight: 700, fontSize: 13 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" /><path d="M8.5 8.5v7h7" />
            </svg>
            {progressPct}%
          </div>
        </div>

        {/* ── Week day selector with progress rings */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "0 18px 16px" }}>
          {weekDates.map(wd => {
            const isActive = wd.dateStr === selHabitDate;
            const isToday = wd.dateStr === todayStr();
            const dayDone = profileHabits.filter(h => h.completions[wd.dateStr]).length;
            const dayTotal = profileHabits.length;
            const pct = dayTotal > 0 ? dayDone / dayTotal : 0;
            const SIZE = 46;
            const STROKE = 3.5;
            const RADIUS = (SIZE / 2) - (STROKE / 2) - 1;
            const CIRCUM = 2 * Math.PI * RADIUS;
            const dashOffset = CIRCUM * (1 - pct);
            // Ring colours
            const trackColor = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
            const ringColor = pct >= 1 ? "#FFCC00" : "#FFCC00bb";
            return (
              <div key={wd.dateStr} onClick={() => setSelHabitDate(wd.dateStr)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                {/* Day label */}
                <div style={{ fontSize: 11, fontWeight: isActive ? 800 : 500, color: isActive ? "var(--t1)" : "var(--t3)" }}>
                  {wd.dayShort}
                </div>
                {/* SVG ring + day number */}
                <div style={{ position: "relative", width: SIZE, height: SIZE }}>
                  <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
                    style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)", overflow: "visible" }}>
                    {/* Background track */}
                    <circle
                      cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                      fill="none"
                      stroke={trackColor}
                      strokeWidth={STROKE}
                    />
                    {/* Progress arc */}
                    {pct > 0 && (
                      <circle
                        cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                        fill="none"
                        stroke={ringColor}
                        strokeWidth={STROKE}
                        strokeLinecap="round"
                        strokeDasharray={CIRCUM}
                        strokeDashoffset={dashOffset}
                        style={{ transition: "stroke-dashoffset .5s cubic-bezier(.4,0,.2,1), stroke .3s" }}
                      />
                    )}
                  </svg>
                  {/* Inner circle + number */}
                  <div style={{
                    position: "absolute",
                    inset: STROKE + 2,
                    borderRadius: "50%",
                    background: isToday && !isActive
                      ? "var(--acc)"
                      : isActive
                        ? dark ? "rgba(255,204,0,0.12)" : "rgba(255,204,0,0.10)"
                        : "var(--s2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700,
                    color: isToday && !isActive ? "#fff" : isActive ? "var(--t1)" : "var(--t2)",
                    transition: "all .2s"
                  }}>
                    {wd.dayNum}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "0 18px" }}>

          {/* ── New Habit button */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <button
              style={{ height: 32, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "0 12px" }}
              onClick={() => { setHabitForm({ name: "", icon: "⭐", color: "#7c6dfa", freq: "daily", category: "Other" }); setShowHabitModal(true); }}>
              <span>+</span> New Habit
            </button>
          </div>

          {/* ── Progress card */}
          <div style={{ background: "var(--s1)", border: `1px solid ${allDoneSelDate ? accent.v + "55" : "var(--b1)"}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>
                {allDoneSelDate ? "Perfect day! All done! 🔥" : "Daily Progress"}
              </span>
              <span style={{ fontSize: 20, fontWeight: 700, color: accent.v }}>{progressPct}%</span>
            </div>
            <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progressPct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>
              {totalDoneSelDate} of {profileHabits.length} habits completed for this date
            </div>
          </div>

          {/* ── Empty state */}
          {profileHabits.length === 0 && (
            <div className="empty">
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </div>
              <div className="empty-t">No habits yet!</div>
              <div style={{ fontSize: 12.5, color: "var(--t3)" }}>Tap + to track your first habit</div>
            </div>
          )}

          {/* ── Habit cards */}
          {profileHabits.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {profileHabits.map(habit => {
                const streak = getStreak(habit);
                const doneSelDate = !!habit.completions[selHabitDate];

                return (
                  <div key={habit.id} style={{ background: "var(--s1)", borderRadius: 18, border: `1px solid ${doneSelDate ? habit.color + "40" : "var(--b1)"}`, overflow: "hidden", transition: "border-color .2s", cursor: "pointer" }}
                    onClick={() => setShowHabitDetail(habit.id)}>

                    {/* Top row — icon, name, streak, action buttons */}
                    <div style={{ display: "flex", alignItems: "center", padding: "16px 16px 12px", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: habit.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                        {HABIT_ICON_MAP[habit.icon] || habit.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", letterSpacing: .2 }}>{habit.name}</div>
                        <div style={{ fontSize: 12, color: "var(--t3)", fontWeight: 500, marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                          {streak > 0 && <span style={{ color: "#ff9f43", fontWeight: 700 }}>🔥 {streak}d streak</span>}
                          {streak === 0 && <span>No streak yet</span>}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                        {/* Journal button */}
                        <button
                          onClick={() => openHabitJourney(habit.id, selHabitDate)}
                          style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--s2)", border: "none", color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "all .15s" }}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
                          </svg>
                        </button>

                        {/* Check button */}
                        <button
                          onClick={() => { toggleHabit(habit.id, selHabitDate); haptic(doneSelDate ? "light" : "success"); }}
                          style={{
                            width: 36, height: 36, borderRadius: "50%",
                            background: doneSelDate ? "#fff" : "var(--s3)",
                            border: doneSelDate ? `1.5px solid ${habit.color}` : "1.5px solid var(--b2)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", transition: "all .2s",
                            boxShadow: doneSelDate ? `0 2px 10px ${habit.color}40` : "none"
                          }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                            stroke={doneSelDate ? habit.color : "var(--t3)"}
                            strokeWidth={doneSelDate ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => deleteHabit(habit.id)}
                          style={{ width: 28, height: 28, borderRadius: 8, background: "transparent", border: "none", color: "var(--t3)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: .45 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6M9 6V4h6v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Thin progress line if done */}
                    {doneSelDate && (
                      <div style={{ height: 3, background: "var(--s3)", margin: "0 16px 10px" }}>
                        <div style={{ height: "100%", width: "100%", background: habit.color, borderRadius: 2 }} />
                      </div>
                    )}

                    {/* Heatmap — true calendar alignment (left-to-right, Mon-Sun rows) */}
                    <div style={{ padding: "0 16px 16px" }}>
                      <div style={{
                        display: "grid",
                        gridTemplateRows: "repeat(7, 1fr)",
                        gridAutoFlow: "column",
                        gridAutoColumns: "1fr",
                        gap: 3,
                        width: "100%"
                      }}>
                        {heatmapDays.map((date, i) => {
                          const done = !!habit.completions[date];
                          const dObj = new Date(date);
                          const dayOfWeek = dObj.getDay();
                          const row = dayOfWeek === 0 ? 7 : dayOfWeek; // Mon=1 ... Sun=7
                          return (
                            <div key={date + i}
                              title={date}
                              onClick={() => setShowHabitDetail(habit.id)}
                              style={{
                                gridRow: i === 0 ? row : "auto",
                                aspectRatio: "1 / 1",
                                borderRadius: 2,
                                background: done ? habit.color : "var(--s3)",
                                opacity: done ? 1 : 0.35,
                                cursor: "pointer",
                                transition: "all .15s",
                                minWidth: 0,
                                minHeight: 0
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Habit Detail Panel moved to top-level — see HabitDetailPanel() below */}
        {false && (() => {
          const dHabit = habits.find(h => h.id === showHabitDetail);
          if (!dHabit) return null;
          const dStreak = getStreak(dHabit);
          const dBestStreak = getBestStreak(dHabit);
          const dDoneToday = !!dHabit.completions[todayStr()];
          const totalDone = Object.values(dHabit.completions || {}).filter(Boolean).length;
          const startDate = Object.keys(dHabit.completions || {}).filter(k => dHabit.completions[k]).sort()[0];
          const totalDays = startDate ? Math.ceil((new Date() - new Date(startDate)) / 86400000) + 1 : 0;
          const scorePct = totalDays > 0 ? Math.round((totalDone / totalDays) * 100) : 0;

          const allCompletedDates = Object.keys(dHabit.completions || {}).filter(k => dHabit.completions[k]).sort();
          const monthGroups = {};
          const streakUnlockDates = new Set();

          let runLen = 0;
          allCompletedDates.forEach((d, i) => {
            if (i === 0) { runLen = 1; }
            else {
              const diff = (new Date(d) - new Date(allCompletedDates[i - 1])) / 86400000;
              runLen = diff === 1 ? runLen + 1 : 1;
            }
            if (runLen === 1) streakUnlockDates.add(d);
          });

          const allEvents = [];
          if (dStreak > 0) allEvents.push({ icon: "🔥", label: `${dStreak} day ongoing streak`, date: todayStr(), color: "#ff9f43", bold: true });
          streakUnlockDates.forEach(d => {
            allEvents.push({ icon: "🏅", label: "Unlocked 1 day streak", date: d, color: "#ffd343", bold: true });
            if (d !== allCompletedDates[allCompletedDates.length - 1] || dStreak === 0) {
              allEvents.push({ icon: "🔥", label: "1 day streak ended", date: d, color: "#ff6b6b", bold: false });
            }
          });
          if (startDate) allEvents.push({ icon: "🚩", label: "Task Started", date: startDate, color: "var(--t2)", bold: false });

          allEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
          allEvents.forEach(ev => {
            const mo = new Date(ev.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
            if (!monthGroups[mo]) monthGroups[mo] = [];
            monthGroups[mo].push(ev);
          });

          const formatEvDate = d => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });

          return (
            <div style={{
              position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
              background: "var(--bg)", zIndex: 9999,
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              animation: "slideInRight .25s cubic-bezier(.32,.9,.46,1)"
            }}>
              {/* Top nav bar — truly fixed inside the container, respects safe area */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "calc(env(safe-area-inset-top, 0px) + 12px) 18px 12px",
                flexShrink: 0, background: "var(--bg)",
                borderBottom: "1px solid var(--b1)",
                zIndex: 2
              }}>
                <button onClick={() => setShowHabitDetail(null)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--acc)", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Everyday
                </button>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    <svg key="t" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2z" /></svg>,
                    <svg key="s" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
                    <svg key="c" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  ].map((icon, i) => (
                    <div key={i} style={{ width: 36, height: 36, borderRadius: 10, background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)", cursor: "pointer" }}>
                      {icon}
                    </div>
                  ))}
                </div>
              </div>

              {/* Scrollable content — takes remaining space, clips at bottom */}
              <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>

                {/* Hero */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 24px", background: "var(--bg)" }}>
                  <div style={{
                    width: 80, height: 80, borderRadius: 22, background: dHabit.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 40, marginBottom: 14,
                    boxShadow: `0 10px 32px ${dHabit.color}55`
                  }}>
                    {HABIT_ICON_MAP[dHabit.icon] || dHabit.icon}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--t1)", marginBottom: 10, letterSpacing: -.3 }}>{dHabit.name}</div>
                  <div style={{
                    background: dDoneToday ? dHabit.color + "18" : "var(--s2)",
                    color: dDoneToday ? dHabit.color : "var(--t3)",
                    border: `1px solid ${dDoneToday ? dHabit.color + "44" : "var(--b2)"}`,
                    borderRadius: 24, padding: "5px 18px", fontSize: 13.5, fontWeight: 700
                  }}>
                    {dDoneToday ? "Completed" : "Not done today"}
                  </div>
                </div>

                {/* Stats row */}
                <div style={{ margin: "0 16px 20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "var(--s1)", borderRadius: 18, overflow: "hidden", border: "1px solid var(--b1)", boxShadow: "0 2px 12px rgba(0,0,0,.05)" }}>
                    {[
                      { label: "Current Streak", val: dStreak },
                      { label: "Best Streak", val: dBestStreak },
                      { label: "Score", val: `${scorePct}%` },
                    ].map((s, i) => (
                      <div key={s.label} style={{ padding: "18px 10px", textAlign: "center", borderLeft: i > 0 ? "1px solid var(--b1)" : "none" }}>
                        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{s.val}</div>
                        <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 5, fontWeight: 500 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, padding: "0 16px 24px" }}>
                  <button
                    onClick={() => { toggleHabit(dHabit.id, todayStr()); haptic("success"); }}
                    style={{
                      height: 52, borderRadius: 16,
                      background: dDoneToday ? dHabit.color : "var(--s2)",
                      border: dDoneToday ? "none" : "1.5px solid var(--b2)",
                      color: dDoneToday ? "#fff" : "var(--t1)",
                      fontSize: 15, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                      transition: "all .2s",
                      boxShadow: dDoneToday ? `0 6px 20px ${dHabit.color}55` : "none"
                    }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                    {dDoneToday ? "Done ✓" : "Mark Done"}
                  </button>
                  <button
                    onClick={() => { openHabitJourney(dHabit.id, todayStr()); }}
                    style={{ height: 52, borderRadius: 16, background: "var(--s2)", border: "1.5px solid var(--b2)", color: "var(--t1)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                    Add Note
                  </button>
                  <button
                    onClick={() => { openHabitJourney(dHabit.id, todayStr()); }}
                    style={{ width: 52, height: 52, borderRadius: 16, background: "var(--s2)", border: "1.5px solid var(--b2)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                  </button>
                </div>

                {/* Timeline */}
                <div style={{ padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 32px)" }}>
                  {Object.keys(monthGroups).length === 0 && (
                    <div style={{ textAlign: "center", color: "var(--t3)", fontSize: 13, padding: "40px 0" }}>No activity yet. Start your streak! 🔥</div>
                  )}
                  {Object.keys(monthGroups).map(month => (
                    <div key={month} style={{ marginBottom: 28 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 16, letterSpacing: -.1 }}>{month}</div>
                      <div style={{ position: "relative" }}>
                        {/* Vertical connecting line */}
                        <div style={{ position: "absolute", left: 19, top: 20, bottom: 20, width: 2, background: "var(--b2)", borderRadius: 1, zIndex: 0 }} />
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                          {monthGroups[month].map((ev, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
                              {/* Avatar circle */}
                              <div style={{
                                width: 40, height: 40, borderRadius: "50%",
                                background: dHabit.color,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 19, flexShrink: 0,
                                boxShadow: `0 2px 10px ${dHabit.color}44`
                              }}>
                                {HABIT_ICON_MAP[dHabit.icon] || dHabit.icon}
                              </div>
                              {/* Event row */}
                              <div style={{
                                flex: 1, background: "var(--s1)", borderRadius: 13,
                                padding: "11px 14px", display: "flex", alignItems: "center",
                                justifyContent: "space-between", border: "1px solid var(--b1)"
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                  <span style={{ fontSize: 17 }}>{ev.icon}</span>
                                  <span style={{ fontSize: 13.5, fontWeight: ev.bold ? 700 : 500, color: ev.bold ? ev.color : "var(--t2)" }}>{ev.label}</span>
                                </div>
                                <span style={{ fontSize: 12, color: "var(--t3)", flexShrink: 0, marginLeft: 8 }}>{formatEvDate(ev.date)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            </div>
          );
        })()}

        {/* ── Journey Modal moved to top level */}
      </div>
    );
  }

  // ==========================================
  //  SMART DAILY PLANNER
  // ==========================================
  const TIME_BLOCKS = [
    {
      id: "morning", label: "Morning", time: "6:00 - 12:00", color: "#f59e0b",
      svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
    },
    {
      id: "afternoon", label: "Afternoon", time: "12:00 - 17:00", color: "#f97316",
      svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>
    },
    {
      id: "evening", label: "Evening", time: "17:00 - 21:00", color: "#8b5cf6",
      svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 18a5 5 0 0 0-10 0" /><line x1="12" y1="2" x2="12" y2="9" /><line x1="4.22" y1="10.22" x2="5.64" y2="11.64" /><line x1="1" y1="18" x2="3" y2="18" /><line x1="21" y1="18" x2="23" y2="18" /><line x1="18.36" y1="11.64" x2="19.78" y2="10.22" /><line x1="23" y1="22" x2="1" y2="22" /><polyline points="16 5 12 9 8 5" /></svg>
    },
    {
      id: "night", label: "Night", time: "21:00 - 24:00", color: "#06b6d4",
      svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
    },
  ];
  const [plannerDate, setPlannerDate] = useState(todayStr());
  const [plannedTasks, setPlannedTasks] = useState(() => {
    try {
      const saved = localStorage.getItem("sl_planned_tasks");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Save planner schedule to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("sl_planned_tasks", JSON.stringify(plannedTasks));
  }, [plannedTasks]);

  const [plannerDone, setPlannerDone] = useState(() => {
    try {
      const saved = localStorage.getItem("sl_planner_done");
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  }); // {taskId: bool}

  useEffect(() => {
    localStorage.setItem("sl_planner_done", JSON.stringify(plannerDone));
  }, [plannerDone]);
  const [showPlannerPicker, setShowPlannerPicker] = useState(null); // blockId we're adding to

  const [plannerScheduling, setPlannerScheduling] = useState(false);

  // Auto-schedule: assigns tasks to blocks intelligently using AI
  async function autoSchedule() {
    const unscheduled = profileTasks.filter(t => !t.done);
    if (unscheduled.length === 0) {
      showNotif("Nothing to schedule", "You have no pending tasks!");
      return;
    }
    setPlannerScheduling(true);
    showNotif("✨ LIBI AI", "Analyzing priorities & creating your daily plan...");

    try {
      const topTasks = [...unscheduled]
        .sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; })
        .slice(0, 30);
      const taskListStr = topTasks.map(t => `- [ID: "${t.id}"] ${t.title} (Priority: ${t.priority}, Due: ${t.due || "none"})`).join("\n");
      const isToday = plannerDate === todayStr();
      const curHour = new Date().getHours();

const groqData = await callLibi(
  [{ role: "user", content: `Today is: ${isToday ? "true (current hour is " + curHour + ")" : "false"}\nAvailable blocks:\n- morning (limit: 4)\n- afternoon (limit: 4)\n- evening (limit: 3)\n- night (limit: 2)\n\nTasks to schedule:\n${taskListStr}` }],
  "You are an expert productivity AI. Assign the optimal time block (morning, afternoon, evening, night) to the provided list of tasks based on their priority and urgency. Output ONLY valid JSON containing a flat object where the keys are the exact Task IDs and the values are the block strings. Example: { \"task123\": \"morning\" }. Rules: Max 4 tasks per block. Only assign tasks to available blocks. Do not add markdown formatting or explanations.",
  500
);
if (groqData) {
        let reply = groqData.choices?.[0]?.message?.content || "";
        try {
          const jsonStr = reply.replace(/```json/g, "").replace(/```/g, "").trim();
          const assignments = JSON.parse(jsonStr);

          if (typeof assignments === "object" && Object.keys(assignments).length > 0) {
            const newPlan = {};
            for (const taskId in assignments) {
              const b = assignments[taskId].toString().toLowerCase().trim();
              if (["morning", "afternoon", "evening", "night"].includes(b)) {
                newPlan[taskId] = b;
              }
            }
            if (Object.keys(newPlan).length > 0) {
              setPlannedTasks(newPlan);
              setPlannerDone({});
              play("complete");
              haptic("success");
              showNotif("📅 AI Plan Ready!", `Scheduled ${Object.keys(newPlan).length} tasks for maximum efficiency.`);
              setPlannerScheduling(false);
              return;
            }
          }
        } catch (e) { console.error("AI Schedule parse error", e); }
      }
    } catch (e) { console.error("AI Planner error", e); }

    // Fallback if AI fails
    fallbackAutoSchedule();
    setPlannerScheduling(false);
  }

  function fallbackAutoSchedule() {
    const unscheduled = profileTasks.filter(t => !t.done);
    const byPriority = [...unscheduled].sort((a, b) => { const o = { high: 0, medium: 1, low: 2 }; return o[a.priority] - o[b.priority]; });
    const slots = { morning: [], afternoon: [], evening: [], night: [] };
    const caps = { morning: 3, afternoon: 3, evening: 2, night: 1 };
    const newPlan = {};
    const isToday = plannerDate === todayStr();
    const curHour = new Date().getHours();
    const blockAvailable = {
      morning: !isToday || curHour < 12,
      afternoon: !isToday || curHour < 17,
      evening: !isToday || curHour < 21,
      night: !isToday || curHour < 24,
    };
    function assign(taskId, preferred) {
      const order = preferred === "morning" ? ["morning", "afternoon", "evening", "night"] : preferred === "afternoon" ? ["afternoon", "evening", "night", "morning"] : preferred === "evening" ? ["evening", "night", "afternoon", "morning"] : ["night", "evening", "afternoon", "morning"];
      for (const b of order) {
        if (blockAvailable[b] && slots[b].length < caps[b]) { slots[b].push(taskId); newPlan[taskId] = b; return; }
      }
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
  }

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
    if (nowDone) { haptic("success"); showNotif("✅ Task completed!", "Synced to your task list"); }
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
      <div style={{ padding: "20px 18px 100px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>Daily Planner</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>
              {new Date(plannerDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="date" value={plannerDate} onChange={e => setPlannerDate(e.target.value)}
              style={{ background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: "var(--t1)", outline: "none" }} />
            <button style={{ width: 34, height: 34, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b1)", color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} onClick={() => setPlannerDate(todayStr())} title="Today">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="12" y1="14" x2="12" y2="18" /><line x1="10" y1="16" x2="14" y2="16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Auto-schedule button — clean filled style */}
        <button style={{ width: "100%", height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#fff", border: "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: plannerScheduling ? "default" : "pointer", letterSpacing: .1, boxShadow: `0 2px 8px ${accent.v}40`, opacity: plannerScheduling ? 0.7 : 1 }} disabled={plannerScheduling} onClick={autoSchedule}>
          {plannerScheduling ? (
            <div style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 1s linear infinite" }} />
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          )}
          {plannerScheduling ? "AI is scheduling..." : "Auto-Schedule My Day"}
        </button>

        {/* Progress bar */}
        {totalPlanned > 0 && (
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)" }}>Today's Progress</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: accent.v }}>{planPct}%</span>
            </div>
            <div style={{ height: 5, background: "var(--s3)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${planPct}%`, background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, transition: "width .5s" }} />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 6 }}>{totalDone} of {totalPlanned} tasks completed</div>
          </div>
        )}

        {/* Time blocks */}
        {TIME_BLOCKS.map(block => {
          const blockTasks = scheduledIds.filter(id => plannedTasks[id] === block.id).map(id => profileTasks.find(t => t.id === id) || tasks.find(t => t.id === id)).filter(Boolean);
          const isCurrent = block.id === currentBlock && plannerDate === todayStr();
          return (
            <div key={block.id} style={{ marginBottom: 10, background: "var(--s1)", border: `1.5px solid ${isCurrent ? block.color + "55" : "var(--b1)"}`, borderRadius: 14, overflow: "hidden", boxShadow: isCurrent ? `0 2px 12px ${block.color}18` : "none" }}>
              {/* Block header */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: blockTasks.length > 0 ? "1px solid var(--b1)" : "none", background: isCurrent ? block.color + "0d" : "transparent" }}>
                {/* SVG icon in a pill */}
                <div style={{ width: 36, height: 36, borderRadius: 10, background: block.color + "18", display: "flex", alignItems: "center", justifyContent: "center", color: block.color, flexShrink: 0 }}>
                  {block.svg}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", display: "flex", alignItems: "center", gap: 7 }}>
                    {block.label}
                    {isCurrent && (
                      <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: block.color + "22", color: block.color, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: block.color, display: "inline-block" }} />
                        Now
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{block.time} · {blockTasks.length} task{blockTasks.length !== 1 ? "s" : ""}</div>
                </div>
                {/* + Add — clean outlined tonal button */}
                <button style={{ height: 28, padding: "0 12px", background: block.color + "15", color: block.color, borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${block.color}30`, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, letterSpacing: .1 }}
                  onClick={() => setShowPlannerPicker(showPlannerPicker === block.id ? null : block.id)}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add
                </button>
              </div>

              {/* Tasks in block */}
              {blockTasks.map(task => {
                if (!task) return null;
                const done = plannerDone[task.id];
                return (
                  <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--b1)", background: done ? "var(--s2)" : "transparent", transition: "background .2s" }}>
                    {/* Checkbox */}
                    <div style={{ width: 18, height: 18, borderRadius: 5, border: `1.8px solid ${done ? block.color : "var(--b2)"}`, background: done ? block.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, cursor: "pointer", transition: "all .18s" }} onClick={() => togglePlannerDone(task.id)}>
                      {done && <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, flex: 1, textDecoration: done ? "line-through" : "none", color: done ? "var(--t3)" : "var(--t1)" }}>{task.title}</span>
                    <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 20, background: PRIORITIES[task.priority]?.bg, color: PRIORITIES[task.priority]?.color, fontWeight: 600 }}>{task.priority}</span>
                    {/* Remove — icon only */}
                    <button style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", color: "var(--t3)", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", border: "none", cursor: "pointer" }} onClick={() => removeFromPlan(task.id)} title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                );
              })}

              {/* Task picker */}
              {showPlannerPicker === block.id && (
                <div style={{ padding: "10px 14px", background: "var(--s2)", borderTop: "1px solid var(--b1)" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", marginBottom: 7, letterSpacing: .5, textTransform: "uppercase" }}>Select a task</div>
                  {unscheduled.length === 0 && <div style={{ fontSize: 12.5, color: "var(--t3)" }}>All tasks are scheduled ✓</div>}
                  {unscheduled.slice(0, 6).map(task => (
                    <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--s1)", borderRadius: 8, cursor: "pointer", marginBottom: 5, border: "1px solid var(--b1)", transition: "all .15s" }} onClick={() => assignToBlock(task.id, block.id)}>
                      <span style={{ fontSize: 13 }}>{PRIORITIES[task.priority]?.icon}</span>
                      <span style={{ fontSize: 13, flex: 1, fontWeight: 500, color: "var(--t1)" }}>{task.title}</span>
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
          <div style={{ background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 12, padding: "14px", marginTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: .5, textTransform: "uppercase" }}>Unscheduled ({unscheduled.length})</span>
            </div>
            {unscheduled.map(task => (
              <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", background: "var(--s2)", borderRadius: 9, marginBottom: 6 }}>
                <span style={{ fontSize: 13 }}>{PRIORITIES[task.priority]?.icon}</span>
                <span style={{ fontSize: 13, flex: 1, fontWeight: 500, color: "var(--t1)" }}>{task.title}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {TIME_BLOCKS.map(b => (
                    <button key={b.id} style={{ width: 28, height: 28, borderRadius: 7, background: b.color + "15", color: b.color, border: `1px solid ${b.color}30`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }} title={`Add to ${b.label}`} onClick={() => assignToBlock(task.id, b.id)}>
                      {b.svg}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPlanned === 0 && unscheduled.length === 0 && (
          <div className="empty">
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="empty-t">No tasks to plan</div>
            <div style={{ fontSize: 12.5, color: "var(--t3)" }}>Add some tasks first, then come back to plan your day</div>
          </div>
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

  const [shareStats, setShareStats] = useState(null);
  const [showEisenhower, setShowEisenhower] = useState(false);
  const [greetScene, setGreetScene] = useState(() => localStorage.getItem("tf_greet_scene") || "galaxy");
  const [greetCardBg, setGreetCardBg] = useState(() => localStorage.getItem("tf_greet_bg") || "scene");
  const [greetAccent, setGreetAccent] = useState(() => localStorage.getItem("tf_greet_accent") || "purple");
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [darkAnimating, setDarkAnimating] = useState(false);

  const [webSearchInput, setWebSearchInput] = useState("");
  const [showWebSearch, setShowWebSearch] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
const [newsTopic, setNewsTopic] = useState("");
const [newsArticles, setNewsArticles] = useState([]);
const [newsLoading, setNewsLoading] = useState(false);
const [newsNotice, setNewsNotice] = useState("Search a topic to see how different outlets are covering it.");
const [newsSearched, setNewsSearched] = useState(false);
const [newsCategory, setNewsCategory] = useState("general");
const [newsDate, setNewsDate] = useState("today");
const [newsMode, setNewsMode] = useState("frontpage");
const [newsCorrectedFrom, setNewsCorrectedFrom] = useState(null);

useEffect(() => {
  if (tab !== "news" || newsMode !== "frontpage") return;
  let cancelled = false;
  (async () => {
    setNewsLoading(true);
    try {
      const params = new URLSearchParams({ category: newsCategory });
      if (newsDate !== "today") params.set("date", newsDate);
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND_URL}/api/news/frontpage?${params.toString()}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!cancelled) {
        if (data.articles && data.articles.length) {
          setNewsArticles(data.articles);
          setNewsNotice(null);
        } else {
          setNewsArticles([]);
          setNewsNotice("No headlines found for this selection.");
        }
      }
    } catch (err) {
      if (!cancelled) setNewsNotice("Couldn't reach the news service.");
    }
    if (!cancelled) setNewsLoading(false);
  })();
  return () => { cancelled = true; };
}, [tab, newsMode, newsCategory, newsDate]);
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

  // ── Seamless Cloud Sync (always on, like Google Tasks) ──
  const lastCloudUpdate = useRef(0);
  const isSyncingFromCloud = useRef(false);
  const syncDebounceRef = useRef(null);

  // Push all data to Firestore (debounced, silent)
  const syncToCloud = useCallback(async () => {
    if (!authUser) return;
    if (isSyncingFromCloud.current) return;
    try {
      const db = await getDB(); if (!db) return;
      const payload = {
        tasks: tasks || [], goals: goals || [], habits: habits || [],
        notes: notes || [],
        categories: categories || [],
        libiMemory, langKey,
        updatedAt: Date.now(),
      };
      lastCloudUpdate.current = payload.updatedAt;
      await db.collection("user_data").doc(authUser.uid).set(payload);
    } catch (e) { console.error("Sync error:", e); }
  }, [authUser, tasks, goals, habits, notes, categories, libiMemory, langKey]);

  // Real-time listener — receive changes from other devices instantly
  useEffect(() => {
    if (!authUser) return;
    let unsub = () => { };
    getDB().then(db => {
      if (!db || !authUser) return;
      unsub = db.collection("user_data").doc(authUser.uid).onSnapshot(doc => {
        if (!doc.exists) return;
        if (doc.metadata.hasPendingWrites) return; // our own local write, ignore
        const d = doc.data();
        if (d.updatedAt && d.updatedAt <= lastCloudUpdate.current) return; // our own synced data
        // Data from another device — apply it
        isSyncingFromCloud.current = true;
        if (d.tasks) setTasks(d.tasks);
        if (d.goals) setGoals(d.goals);
        if (d.habits) setHabits(d.habits);
        if (d.notes) setNotes(d.notes);
        if (d.categories) setCategories(d.categories);
        if (d.libiMemory) setLibiMemory(d.libiMemory);
        if (d.langKey) setLangKey(d.langKey);
        setTimeout(() => { isSyncingFromCloud.current = false; }, 1000);
      });
    });
    return () => unsub();
  }, [authUser]);

  // Debounced auto-push whenever data changes (1.5s after last change)
  useEffect(() => {
    if (!authUser || isSyncingFromCloud.current) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => syncToCloud(), 1500);
    return () => clearTimeout(syncDebounceRef.current);
  }, [tasks, goals, habits, notes, authUser, syncToCloud]);

  // ── Save on page hide (phone switches apps / kills tab) ──
  useEffect(() => {
    const save = () => {
      try {
        localStorage.setItem("tf_tasks", JSON.stringify(tasks));
        localStorage.setItem("tf_goals", JSON.stringify(goals));
        localStorage.setItem("tf_habits", JSON.stringify(habits));
        localStorage.setItem("tf_notes", JSON.stringify(notes));
      } catch (e) { }
      idbSet("tf_backup", JSON.stringify({ tasks, goals, habits, notes, categories, profiles, timestamp: Date.now() })).catch(() => { });
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") save(); });
    return () => { window.removeEventListener("pagehide", save); window.removeEventListener("beforeunload", save); };
  }, [tasks, goals, habits, notes, categories, profiles]);

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
    const todaysTasks = profileTasks.filter(t => t.due === today && !t.done);

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
                if (!t.due) return false;
                return h === 9; // default slot for tasks without a time
              }).filter((_, i, arr) => arr.indexOf(_) === i);

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
                          <span style={{ fontSize: 11, background: "var(--b1)", padding: "2px 6px", borderRadius: 4, color: "var(--t2)", fontWeight: 700 }}>{t.due}</span>
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
            <div key={i} style={{ position: "fixed", width: (i % 3 === 0 ? 3 : 2), height: (i % 3 === 0 ? 3 : 2), borderRadius: "50%", background: "#fff", opacity: .1 + Math.random() * .5, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`, animationDelay: `${Math.random() * 4}s`, pointerEvents: "none", zIndex: 0 }} />
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
function NewsPage() {
  const FLAGS = { in: "🇮🇳", us: "🇺🇸", gb: "🇬🇧", ca: "🇨🇦", au: "🇦🇺", sg: "🇸🇬", ph: "🇵🇭" };
  const timeAgo = (iso) => {
    const diffMs = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diffMs / 3600000);
    if (h < 1) return "just now";
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const CATEGORIES = [
    { id: "general", label: "Top", icon: "📰" },
    { id: "world", label: "World", icon: "🌍" },
    { id: "nation", label: "Nation", icon: "🏛️" },
    { id: "business", label: "Business", icon: "💼" },
    { id: "technology", label: "Tech", icon: "💻" },
    { id: "entertainment", label: "Entertainment", icon: "🎬" },
    { id: "sports", label: "Sports", icon: "🏆" },
    { id: "science", label: "Science", icon: "🔬" },
    { id: "health", label: "Health", icon: "🩺" },
  ];

  const todayStr = new Date().toISOString().slice(0, 10);

  const runNewsSearch = async (e) => {
    e.preventDefault();
    if (!newsTopic.trim()) return;
    setNewsMode("search");
    setNewsLoading(true);
    setNewsSearched(true);
    setNewsCorrectedFrom(null);
    try {
      const params = new URLSearchParams({ topic: newsTopic });
      if (newsDate !== "today") params.set("date", newsDate);
      const token = await getAuthToken();
      const res = await fetch(`${BACKEND_URL}/api/news/compare?${params.toString()}`, {
        headers: token ? { "Authorization": `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.articles && data.articles.length) {
        setNewsArticles(data.articles);
        setNewsNotice(null);
        setNewsCorrectedFrom(data.correctedFrom || null);
      } else {
        setNewsArticles([]);
        setNewsNotice("No results for that topic. Try something broader, or check the spelling.");
      }
    } catch (err) {
      setNewsNotice("Couldn't reach the news service. Check your connection and try again.");
    }
    setNewsLoading(false);
  };

  const backToFrontPage = () => {
    setNewsMode("frontpage");
    setNewsTopic("");
    setNewsCorrectedFrom(null);
    setNewsNotice(null);
  };

  const leadArticle = newsArticles[0];
  const restArticles = newsArticles.slice(1);

  return (
    <div style={{ padding: "20px 18px 100px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
        <span style={{ fontSize: 20 }}>📰</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>
            {newsMode === "frontpage" ? "Front Page" : "Multi-Source News"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--t3)" }}>
            {newsMode === "frontpage" ? "Today's headlines, every angle" : "Same story, every angle"}
          </div>
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={runNewsSearch} style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", display: "flex", alignItems: "center", background: "var(--s2)", borderRadius: 999, padding: "0 14px" }}>
          <span style={{ fontSize: 14, color: "var(--t3)", marginRight: 6 }}>⌕</span>
          <input
            value={newsTopic}
            onChange={e => setNewsTopic(e.target.value)}
            placeholder="Search a topic — e.g. elections, AI, cricket"
            style={{ flex: 1, border: "none", background: "transparent", padding: "11px 0", fontSize: 14, color: "var(--t1)", outline: "none" }}
          />
        </div>
        <button type="submit" disabled={newsLoading} style={{
          padding: "11px 22px", borderRadius: 999, border: "none",
          background: newsLoading ? "var(--s2)" : `linear-gradient(135deg,${accent.v},${accent.g})`,
          color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: newsLoading ? "default" : "pointer"
        }}>
          {newsLoading ? "Fetching…" : "Search"}
        </button>
      </form>

      {/* Back to front page (search mode only) */}
      {newsMode === "search" && (
        <button onClick={backToFrontPage} style={{
          background: "none", border: "none", color: "var(--acc)", fontSize: 13, fontWeight: 600,
          padding: "0 0 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4
        }}>
          ← Back to front page
        </button>
      )}

      {/* Category tabs (front page mode only) */}
      {newsMode === "frontpage" && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setNewsCategory(c.id)}
              style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: newsCategory === c.id ? "none" : "1px solid var(--b1)",
                background: newsCategory === c.id ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s1)",
                color: newsCategory === c.id ? "#fff" : "var(--t2)",
                cursor: "pointer",
              }}
            >
              <span>{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      )}

      {/* Date selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setNewsDate("today")} style={{
          padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          border: newsDate === "today" ? "none" : "1px solid var(--b1)",
          background: newsDate === "today" ? "var(--accd)" : "var(--s1)",
          color: newsDate === "today" ? "var(--acc)" : "var(--t3)",
        }}>Today</button>
        <button onClick={() => setNewsDate("yesterday")} style={{
          padding: "7px 14px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          border: newsDate === "yesterday" ? "none" : "1px solid var(--b1)",
          background: newsDate === "yesterday" ? "var(--accd)" : "var(--s1)",
          color: newsDate === "yesterday" ? "var(--acc)" : "var(--t3)",
        }}>Yesterday</button>
        <input
          type="date"
          max={todayStr}
          value={newsDate !== "today" && newsDate !== "yesterday" ? newsDate : ""}
          onChange={e => e.target.value && setNewsDate(e.target.value)}
          style={{
            padding: "6px 10px", borderRadius: 999, fontSize: 12.5, border: "1px solid var(--b1)",
            background: "var(--s1)", color: "var(--t2)",
          }}
        />
      </div>

      {/* Typo correction notice */}
      {newsCorrectedFrom && (
        <div style={{ background: "var(--accd)", border: `1px solid ${accent.v}44`, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "var(--t2)", marginBottom: 14 }}>
          Couldn't find "{newsCorrectedFrom}" — showing results for "<strong>{newsTopic}</strong>" instead.
        </div>
      )}

      {/* Notice / empty state */}
      {newsNotice && (
        <div style={{ background: "var(--accd)", border: `1px solid ${accent.v}44`, borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "var(--t2)", marginBottom: 16, lineHeight: 1.5 }}>
          {newsNotice}
        </div>
      )}

      {newsLoading && !newsNotice && newsArticles.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--t3)", fontSize: 13.5 }}>Loading headlines…</div>
      )}

      {/* Lead story */}
      {leadArticle && (
        <a href={leadArticle.url} target="_blank" rel="noopener noreferrer" style={{
          display: "block", background: "var(--s1)", borderRadius: 18, overflow: "hidden",
          textDecoration: "none", border: "1px solid var(--b1)", marginBottom: 16,
        }}>
          {leadArticle.image && (
            <div style={{ height: 200, background: `var(--s2) url(${leadArticle.image}) center/cover no-repeat` }} />
          )}
          <div style={{ padding: "16px 18px 18px" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--accd)", color: "var(--acc)", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, marginBottom: 10 }}>
              <span>{FLAGS[leadArticle.sourceCountry] || "🌐"}</span>
              <span>{leadArticle.source}</span>
              <span style={{ opacity: .7, fontWeight: 500 }}>· {timeAgo(leadArticle.publishedAt)}</span>
            </div>
            <div style={{ fontSize: 19, fontWeight: 700, color: "var(--t1)", lineHeight: 1.3, marginBottom: 8 }}>{leadArticle.title}</div>
            {leadArticle.description && (
              <div style={{ fontSize: 13.5, color: "var(--t3)", lineHeight: 1.5 }}>{leadArticle.description}</div>
            )}
          </div>
        </a>
      )}

      {/* Rest of the grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
        {restArticles.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{
            background: "var(--s1)", borderRadius: 16, overflow: "hidden", textDecoration: "none",
            display: "flex", flexDirection: "column", border: "1px solid var(--b1)"
          }}>
            {a.image && <div style={{ height: 140, background: `var(--s2) url(${a.image}) center/cover no-repeat` }} />}
            <div style={{ padding: "12px 14px 14px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--accd)", color: "var(--acc)", fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 999, marginBottom: 8 }}>
                <span>{FLAGS[a.sourceCountry] || "🌐"}</span>
                <span>{a.source}</span>
                <span style={{ opacity: .7, fontWeight: 500 }}>· {timeAgo(a.publishedAt)}</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--t1)", lineHeight: 1.35, marginBottom: 6 }}>{a.title}</div>
              {a.description && <div style={{ fontSize: 12.5, color: "var(--t3)", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.description}</div>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
  function NotesPage() {
    const profileNotes = notes.filter(n => !n.profileId || n.profileId === activeProfile);
    const wordCount = (text = "") => text.trim().split(/\s+/).filter(Boolean).length;

    // Categories including All + Pinned
    const ALL_FILTERS = [
      { id: "all", icon: "✦", label: "All", color: accent.v },
      { id: "pinned", icon: "📌", label: "Pinned", color: "#FFD93D" },
      ...NOTE_CATS,
    ];

    const getFilterColor = (fid) => ALL_FILTERS.find(f => f.id === fid)?.color || accent.v;

    const getFilteredNotes = (fid) => profileNotes
      .filter(n => fid === "all" ? true : fid === "pinned" ? n.pinned : n.category === fid)
      .filter(n => noteSearch ? (n.title + n.body + (n.tags || []).join(" ")).toLowerCase().includes(noteSearch.toLowerCase()) : true)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.createdAt - a.createdAt);

    const filtered = getFilteredNotes(noteFilter);
    const filterColor = getFilterColor(noteFilter);

    return (
      <div style={{ padding: "20px 18px 100px" }}>

        {/* Header — matches Planner style */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H14L21 14V5C21 3.9 20.1 3 19 3Z" />
                <path d="M14 21V14H21" />
                <line x1="8" y1="8" x2="16" y2="8" />
                <line x1="8" y1="12" x2="13" y2="12" />
              </svg>
              <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>Notes</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>
              {profileNotes.length} note{profileNotes.length !== 1 ? "s" : ""} · {profileNotes.filter(n => n.pinned).length} pinned
            </div>
          </div>
        </div>

        {/* + New Note — full-width gradient banner, matches Auto-Schedule button */}
        <button
          onClick={() => { setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "general", tags: [] }); setNoteTagInput(""); setEditNote(null); setShowNoteEditor(true); play("tap"); }}
          style={{ width: "100%", height: 44, background: `linear-gradient(135deg,${accent.v},${accent.g})`, borderRadius: 10, fontSize: 13.5, fontWeight: 600, color: "#fff", border: "none", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", letterSpacing: .1, boxShadow: `0 2px 8px ${accent.v}40` }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Note
        </button>

        {/* Search bar — matches planner input style */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 8, padding: "0 12px", height: 38, marginBottom: 14 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--t3)", flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={noteSearch} onChange={e => setNoteSearch(e.target.value)} placeholder="Search notes…"
            style={{ flex: 1, fontSize: 13, color: "var(--t1)", background: "none", border: "none", outline: "none" }} />
          {noteSearch && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ cursor: "pointer", color: "var(--t3)" }} onClick={() => setNoteSearch("")}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
        </div>

        {/* Category blocks — each rendered as a Planner-style card */}
        {ALL_FILTERS.map(cat => {
          const catNotes = getFilteredNotes(cat.id);
          const isActive = noteFilter === cat.id;
          // Only render if: this is the active filter, or we're in "all" mode showing all cats
          if (noteFilter !== "all" && noteFilter !== cat.id) return null;
          // In "all" mode, skip pinned block if no pinned notes
          if (noteFilter === "all" && cat.id === "pinned" && catNotes.length === 0) return null;
          // In "all" mode, skip the "all" meta-block itself
          if (noteFilter === "all" && cat.id === "all") return null;

          const blockNotes = noteFilter === "all" ? catNotes : filtered;
          if (noteFilter === "all" && blockNotes.length === 0) return null;

          return (
            <div key={cat.id} style={{ marginBottom: 10, background: "var(--s1)", border: `1.5px solid ${isActive && noteFilter !== "all" ? cat.color + "55" : "var(--b1)"}`, borderRadius: 14, overflow: "hidden", boxShadow: isActive && noteFilter !== "all" ? `0 2px 12px ${cat.color}18` : "none" }}>
              {/* Block header */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 14px", borderBottom: blockNotes.length > 0 ? "1px solid var(--b1)" : "none", background: isActive && noteFilter !== "all" ? cat.color + "0d" : "transparent" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: cat.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>
                  {cat.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)" }}>{cat.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 1 }}>{blockNotes.length} note{blockNotes.length !== 1 ? "s" : ""}{cat.id === "pinned" ? " pinned" : ""}</div>
                </div>
                {/* + Add button — tonal, matches planner */}
                <button
                  style={{ height: 28, padding: "0 12px", background: cat.color + "15", color: cat.color, borderRadius: 7, fontSize: 12, fontWeight: 600, border: `1px solid ${cat.color}30`, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0, letterSpacing: .1 }}
                  onClick={() => { setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: cat.id === "pinned", category: ["all", "pinned"].includes(cat.id) ? "general" : cat.id, tags: [] }); setNoteTagInput(""); setEditNote(null); setShowNoteEditor(true); play("tap"); }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add
                </button>
              </div>

              {/* Notes inside block */}
              {blockNotes.map(note => {
                const words = wordCount(note.body);
                return (
                  <div key={note.id}
                    style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: "1px solid var(--b1)", cursor: "pointer", transition: "background .15s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--s2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    onClick={() => { setNoteForm({ title: note.title, body: note.body, color: note.color, pinned: note.pinned, category: note.category || "general", tags: note.tags || [] }); setNoteTagInput(""); setEditNote(note); setShowNoteEditor(true); }}>
                    {/* Color dot */}
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: note.color, flexShrink: 0, marginTop: 5 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {note.title && <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--t1)", marginBottom: note.body ? 3 : 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{note.title}</div>}
                      {note.body && <div style={{ fontSize: 12, color: "var(--t2)", lineHeight: 1.55, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }} dangerouslySetInnerHTML={{ __html: note.body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>").replace(/(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>") }} />}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                        <span style={{ fontSize: 10.5, color: "var(--t3)" }}>{new Date(note.updatedAt || note.createdAt).toLocaleDateString("en", { month: "short", day: "numeric" })}</span>
                        {note.body && <span style={{ fontSize: 10, color: "var(--t3)" }}>{words}w</span>}
                        {(note.tags || []).slice(0, 2).map(tg => <span key={tg} style={{ fontSize: 9.5, padding: "1px 6px", borderRadius: 20, background: "var(--s2)", color: "var(--t3)", border: "1px solid var(--b1)" }}>#{tg}</span>)}
                      </div>
                    </div>
                    {/* Pin + delete actions */}
                    <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                      <button style={{ width: 26, height: 26, borderRadius: 7, background: "none", border: "none", cursor: "pointer", opacity: note.pinned ? 1 : 0.35, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity .15s" }}
                        onClick={e => { e.stopPropagation(); togglePinNote(note.id); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill={note.pinned ? note.color : "none"} stroke={note.pinned ? note.color : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17H19V15L17 9V4H7V9L5 15V17Z" /><line x1="9" y1="4" x2="15" y2="4" /></svg>
                      </button>
                      <button style={{ width: 26, height: 26, borderRadius: 7, background: "none", border: "none", cursor: "pointer", opacity: 0.35, display: "flex", alignItems: "center", justifyContent: "center", transition: "opacity .15s" }}
                        onClick={e => { e.stopPropagation(); deleteNote(note.id); }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Empty state — matches planner "No tasks to plan" */}
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: "var(--s2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              {noteSearch
                ? <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                : <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H14L21 14V5C21 3.9 20.1 3 19 3Z" /><path d="M14 21V14H21" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="13" y2="12" /></svg>}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t2)", marginBottom: 6 }}>{noteSearch ? "No notes found" : "No notes yet"}</div>
            <div style={{ fontSize: 13, color: "var(--t3)", lineHeight: 1.6 }}>{noteSearch ? `No matches for "${noteSearch}"` : "Tap + New Note to capture your first idea"}</div>
          </div>
        )}
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
            {[{ icon: "🍅", label: "Sessions", val: pomoTotal }, { icon: "⏱", label: "Today", val: fmtTime(totalToday) }].map(s => (
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
    const text = `${priority} ${task.title}\n${status}\n${cat.icon} ${cat.name}${timeStr}\n\nTracked with StaredList ✦`;
    if (navigator.share) {
      navigator.share({ title: "StaredList Task", text }).catch(() => { });
    } else {
      navigator.clipboard?.writeText(text).then(() => showNotif("📋 Copied!", "Task details copied to clipboard"));
    }
  };

  // == Customization: App Name & Icon ==
  const [appDisplayName, setAppDisplayName] = useState(() => localStorage.getItem("tf_appname") || "StarredList");
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
    document.title = (appDisplayName || 'StarredList') + ' — Task Manager';
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
      const newTasks = events.map(ev => ({ id: uid(), title: ev.title, notes: ev.notes || "", priority: "medium", categoryId: "work", due: ev.due || "", photo: null, tags: ["calendar"], subtasks: [], starred: false, recurring: "never", profileId: activeProfile, done: false, createdAt: Date.now() }));
      setTasks(ts => [...newTasks, ...ts]);
      showNotif(`📅 ${events.length} events imported!`, "From Google Calendar");
      play("add");
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
<title>StaredList Report — ${today}</title>
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
<h1>✦ StaredList</h1>
<div class="sub">Weekly Report — ${today}</div>
<div class="stats">
  <div class="stat"><div class="stat-val">${tasks.filter(t => t.done).length}</div><div class="stat-lbl">Completed</div></div>
  <div class="stat"><div class="stat-val">${activeTasks.length}</div><div class="stat-lbl">{t.activeStatus || "Active"}</div></div>
  <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Completion</div></div>
  <div class="stat"><div class="stat-val">${doneThisWeek.length}</div><div class="stat-lbl">This Week</div></div>
</div>
<h2>✅ Completed This Week (${doneThisWeek.length})</h2>
${doneThisWeek.slice(0, 20).map(t => `<div class="task-item done">✔️ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span></div>`).join("")}
${doneThisWeek.length === 0 ? "<p style='color:#aaa;font-size:13px'>No tasks completed this week yet.</p>" : ""}
<h2>📋 Active Tasks (${Math.min(activeTasks.length, 15)})</h2>
${activeTasks.slice(0, 15).map(t => `<div class="task-item active">○ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span>${t.due ? `<span style='color:#aaa;font-size:11px'>due ${t.due}</span>` : ""}</div>`).join("")}
<div class="footer">Generated by StaredList ✦ — ${new Date().toISOString().slice(0, 10)}</div>
</body></html>`;
    const w = window.open("", "_blank", "width=750,height=900");
    if (w) { w.document.write(html); w.document.close(); w.onload = () => w.print(); }
    else { showNotif("📄 PDF blocked", "Allow popups to export PDF"); }
    haptic("medium");
  };



  // == Request notification permission on first task add ==


  // ── Manual Backup & Restore ──
  function exportBackup() {
    const backup = { tasks, goals, habits, notes, categories, profiles, exportedAt: new Date().toISOString(), version: "starredlist-v1" };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `starredlist-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    showNotif("💾 Backup saved!", "Your data has been exported"); haptic("success");
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const b = JSON.parse(e.target.result);
        if (!b.version?.startsWith("starredlist")) throw new Error("Invalid");
        if (b.tasks) setTasks(b.tasks);
        if (b.goals) setGoals(b.goals);
        if (b.habits) setHabits(b.habits);
        if (b.profiles) setProfiles(b.profiles);
        showNotif("✅ Restored!", `${b.tasks?.length || 0} tasks recovered`); haptic("success");
      } catch (err) { showNotif("❌ Invalid file", "Please use a StaredList backup file"); }
    };
    reader.readAsText(file);
  }

  // == Bulk Actions ==
  const toggleBulkSelect = (id) => {
    setBulkSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const bulkComplete = () => {
    setBulkSelected(s => { s.forEach(id => { setTasks(ts => ts.map(t => t.id === id ? { ...t, done: true } : t)); }); return new Set(); });
    setBulkMode(false); haptic("success");
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
      starred: false, recurring: "never",
      profileId: activeProfile, done: false, createdAt: Date.now()
    }));
    setTasks(ts => [...newTasks, ...ts]);
    showNotif("✦ " + selected.length + " tasks added!", "AI breakdown complete");
    play("add");
    setShowAiModal(false);
    setAiInput("");
    setAiTasks([]);
    setAiSelected([]);
    setTab("tasks");
    setShowDone(false);
    setShowStarred(false);
  };


  // == ✦ TASKLY BOT CHAT ==
  const [chatMsgs, setChatMsgs] = useState(() => { const n = localStorage.getItem('tf_username') || ''; return [{ from: "bot", text: `Hey${n ? " " + n : ""}! 👋 I'm **LIBI v4.0** ✦ — now with **live web search**!\n\n🌐 I can now search the internet and answer *anything*:\n• _"How to make cupcakes?"_ — I'll give you the recipe + YouTube videos\n• _"Best exercises for beginners?"_ — web results + add as tasks\n• _"What is quantum computing?"_ — live answer from the web\n\n📋 I still handle your tasks:\n• _"Plan my day"_ · _"What's overdue?"_ · _"Motivate me"_\n\nJust ask me anything! 🚀` }]; });
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

    // == Offline guard — check before doing anything ==
    if (!navigator.onLine) {
      setChatMsgs(m => [...m, { from: "user", text }, {
        from: "bot",
        text: "📡 **You're offline** — check your internet connection and try again.\n\nLIBI AI needs an active connection to respond."
      }]);
      return;
    }

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

    // == Task creation — instant, no AI call needed ==
    const taskCreationPatterns = /^(remind me to|add task|create task|new task|i need to|i have to|don.t forget to|schedule|set a reminder)/i;
    const reminderMatch = text.match(/(?:remind me to|add task|create task|new task|i need to|i have to|don.t forget to)\s+(.+?)(?:\s+(?:tomorrow|today|on\s+\w+|next\s+\w+))?$/i);
    if (taskCreationPatterns.test(text) && reminderMatch?.[1]) {
      const taskTitle = reminderMatch[1].trim().replace(/[.!?]$/, "");
      const hasTomorrow = /tomorrow/i.test(text);
      const hasToday = /today|tonight/i.test(text);
      const dueDate = hasTomorrow ? tomorrowDate : hasToday ? todayDate2 : "";
      const newTask = { id: uid(), title: taskTitle, notes: "Added by LIBI from chat", priority: "medium", categoryId: "work", due: dueDate, photo: null, tags: ["libi"], subtasks: [], starred: false, recurring: "never", profileId: activeProfile, done: false, createdAt: Date.now() };
      setTasks(ts => [newTask, ...ts]);
      play("add"); haptic("success");
      setChatMsgs(m => [...m, { from: "bot", text: `✅ Done! Added **"${taskTitle}"** to your tasks${dueDate ? " due " + (hasTomorrow ? "tomorrow" : "today") : ""}.\n\n💡 You can also say:\n• "Remind me to call mum tomorrow"\n• "I need to finish the report today"\n• "Add task review budget"` }]);
      setChatTyping(false);
      return;
    }

    // == Build live task context for Groq ==
    const _active = profileTasks.filter(x => !x.done);
    const _done = profileTasks.filter(x => x.done);
    const _overdue = _active.filter(x => x.due && new Date(x.due) < new Date());
    const _high = _active.filter(x => x.priority === "high");
    const _med = _active.filter(x => x.priority === "medium");
    const _low = _active.filter(x => x.priority === "low");
    const _todayTasks = _active.filter(x => x.due === todayDate2);
    const _starred = _active.filter(x => x.starred);
    const _pct = profileTasks.length ? Math.round((_done.length / profileTasks.length) * 100) : 0;
    const _topTask = _overdue[0] || _high[0] || _todayTasks[0] || _starred[0] || _active[0];
    const _userName = libiMemory.name || userName || "there";
    const _occupation = libiMemory.occupation || "";
    const _h = new Date().getHours();
    const _timeOfDay = _h < 5 ? "night" : _h < 12 ? "morning" : _h < 17 ? "afternoon" : _h < 21 ? "evening" : "night";

    const taskContext = `
=== USER PROFILE ===
Name: ${_userName}
Occupation: ${_occupation || "not specified"}
Time of day: ${_timeOfDay} (${_h}:00)
Known facts: ${libiMemory.facts?.slice(-5).join("; ") || "none yet"}

=== LIVE TASK DATA ===
Total tasks: ${profileTasks.length}
Active: ${_active.length} | Completed: ${_done.length} | Completion rate: ${_pct}%
Overdue (${_overdue.length}): ${_overdue.slice(0, 3).map(t => `"${t.title}" (was due ${t.due})`).join(", ") || "none"}
Due today (${_todayTasks.length}): ${_todayTasks.map(t => `"${t.title}"`).join(", ") || "none"}
High priority (${_high.length}): ${_high.slice(0, 4).map(t => `"${t.title}"`).join(", ") || "none"}
Medium priority (${_med.length}): ${_med.slice(0, 3).map(t => `"${t.title}"`).join(", ") || "none"}
Low priority (${_low.length}): ${_low.slice(0, 2).map(t => `"${t.title}"`).join(", ") || "none"}
Top priority right now: ${_topTask ? `"${_topTask.title}" [${_topTask.priority}, due: ${_topTask.due || "no date"}]` : "none"}

=== APP FEATURES ===
Tasks, Focus (Pomodoro), Goals, Habits, Daily Planner, Notes, Statistics, Calendar, Board, Timeline, Ambient music (6 tracks), Focus Mode, Command palette, 5 languages
`.trim();

    // == Build conversation history (last 8 messages for context) ==
    const conversationHistory = chatMsgs.slice(-8).map(m => ({
      role: m.from === "user" ? "user" : "assistant",
      content: m.text.replace(/__OFFER_TASK__.*__END__/s, "").trim()
    }));

    // == LIBI system prompt — her personality and training ==
    const LIBI_SYSTEM_PROMPT = `You are LIBI ✦ — a warm, caring, and genuinely intelligent AI productivity assistant built into Taskflow Ultimate by LIBI Labs (founded by Isaac Titus, a 19-year-old AI & Data Science student and builder).

Your personality:
- Warm, caring, and encouraging — like a brilliant best friend and mentor
- Honest and direct — give real, specific advice, not vague platitudes
- Conversational and confident — like Grok, never robotic or stiff
- Playful with wit, but always focused and helpful
- You genuinely care about the user's wellbeing, not just their tasks
- When the user is emotional (stressed, sad, overwhelmed), lead with empathy FIRST

Your expertise: productivity, time management, deep work, GTD, Pomodoro, habit science, sleep, nutrition, mental health, neuroscience, learning science, career, coding, entrepreneurship, creativity, relationships, finance basics, mindfulness, history, physics, biology — you speak confidently on all of these.

Formatting:
- Use **bold** for key points
- Use emojis naturally — warm but not excessive
- Short paragraphs, never walls of text
- Bullet points (•) for lists and steps
- Never say "Certainly!" or "Of course!" — just respond naturally
- Reference the user's actual task data to make answers personal and specific

What you know about this user right now:
${taskContext}

CRITICAL TASK ADDING RULE:
ONLY use [ADD_TASKS: ...] when the user has **explicitly and clearly** asked you to add tasks to their list.

✅ Use [ADD_TASKS: ...] ONLY in these cases:
- User says "add those tasks" or "add them to my list"
- User says "add a task to study react"
- User says "create tasks for my project" or "break this into tasks"
- User says "yes, add them" or "go ahead and add" (confirming a previous suggestion)
- User says "remind me to..." or "schedule..."

❌ Do NOT use [ADD_TASKS: ...] in these cases:
- You are just giving advice, tips, or suggestions
- You are answering a question
- The user did NOT ask to add anything
- You are recommending what tasks they *could* add — just describe them in plain text instead
- Any general conversation

When you suggest tasks but the user hasn't asked to add them, just list them as plain bullet points in your message. Do NOT wrap them in [ADD_TASKS: ...]. The user will decide if they want to add them.

Format when explicitly asked:
[ADD_TASKS: Task title one | Task title two | Task title three]

Other rules:
- You are LIBI, built by LIBI Labs. Not ChatGPT, Claude, or Gemini.
- Always reference the user's real tasks and data when relevant
- If their task list is empty, gently encourage them to add their first task`;

    // == Call Groq API ==
    try {
const groqData = await callLibi(
  [...conversationHistory, { role: "user", content: text }],
  LIBI_SYSTEM_PROMPT,
  600
);

if (!groqData || groqData.error) {
  throw new Error(groqData?.error?.code === 429 ? "rate_limit" : "groq_error");
}
      let reply = groqData.choices?.[0]?.message?.content;
      if (!reply) throw new Error("empty_response");

      // == Parse [ADD_TASKS: ...] tags — ask user first before adding ==
      const addTaskMatch = reply.match(/\[ADD_TASKS:\s*(.*?)\]/s);
      if (addTaskMatch) {
        const taskTitles = addTaskMatch[1].split("|").map(s => s.trim()).filter(Boolean);
        reply = reply.replace(/\[ADD_TASKS:.*?\]/s, "").trim();
        const taskListPreview = taskTitles.map((t, i) => `${i + 1}. ${t}`).join("\n");
        reply += `\n\n📋 **Want me to add ${taskTitles.length === 1 ? "this task" : `these ${taskTitles.length} tasks`} to your list?**\n${taskListPreview}\n\n[PENDING_TASKS:${JSON.stringify(taskTitles)}]`;
      }

      setChatMsgs(m => [...m, { from: "bot", text: reply }]);
      setChatTyping(false);

    } catch (err) {
      // == No offline fallback — show connection error ==
      let errMsg;
      if (err.message === "rate_limit") {
        errMsg = "⚡ **LIBI AI rate limit reached** — please wait a minute and try again.";
      } else if (!navigator.onLine) {
        errMsg = "📡 **You're offline** — check your internet connection and try again.\n\nLIBI AI needs an active connection to respond.";
      } else {
        errMsg = "⚠️ **Couldn't reach LIBI AI** — please check your internet connection and try again.";
      }
      setChatMsgs(m => [...m, { from: "bot", text: errMsg }]);
      setChatTyping(false);
    }
  };

  // Chat panel rendered as inline JSX variable (never remounts -- fixes typing focus loss)
  const [libiTab, setLibiTab] = useState("chat");
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState(() => {
    try { return JSON.parse(localStorage.getItem("libi_sessions") || "[]"); } catch { return []; }
  });
  const [currentSessionId, setCurrentSessionId] = useState(null); // null = unsaved new chat

  // Auto-save current session whenever chatMsgs changes (debounced)
  const autoSaveTimer = React.useRef(null);
  useEffect(() => {
    if (chatMsgs.length <= 1) return; // nothing to save yet
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setChatSessions(prev => {
        const title = chatMsgs.find(m => m.from === "user")?.text?.slice(0, 40) || "New Chat";
        const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        let updated;
        if (currentSessionId) {
          // Update existing session in-place
          updated = prev.map(s => s.id === currentSessionId ? { ...s, title, date, msgs: chatMsgs } : s);
          if (!updated.find(s => s.id === currentSessionId)) {
            // Session was deleted, create fresh
            updated = [{ id: currentSessionId, title, date, msgs: chatMsgs }, ...prev];
          }
        } else {
          // First save — create new session and remember its id
          const newId = Date.now().toString();
          setCurrentSessionId(newId);
          updated = [{ id: newId, title, date, msgs: chatMsgs }, ...prev].slice(0, 30);
        }
        try { localStorage.setItem("libi_sessions", JSON.stringify(updated)); } catch {}
        return updated;
      });
    }, 800); // debounce 800ms so it doesn't fire on every keystroke
    return () => clearTimeout(autoSaveTimer.current);
  }, [chatMsgs]);

  function startNewChat() {
    // Current session already auto-saved — just reset
    setCurrentSessionId(null);
    const n = localStorage.getItem("tf_username") || "";
    setChatMsgs([{ from: "bot", text: `Hey${n ? " " + n : ""}! 👋 I'm **LIBI v4.0** ✦ — now with **live web search**!\n\n🌐 I can now search the internet and answer *anything*:\n• _"How to make cupcakes?"_ — I'll give you the recipe + YouTube videos\n• _"Best exercises for beginners?"_ — web results + add as tasks\n• _"What is quantum computing?"_ — live answer from the web\n\n📋 I still handle your tasks:\n• _"Plan my day"_ · _"What's overdue?"_ · _"Motivate me"_\n\nJust ask me anything! 🚀` }]);
    setShowChatHistory(false);
  }

  function loadSession(session) {
    // Current session already auto-saved — just switch
    setCurrentSessionId(session.id);
    setChatMsgs(session.msgs);
    setShowChatHistory(false);
  }

  function deleteSession(id, e) {
    e.stopPropagation();
    const updated = chatSessions.filter(s => s.id !== id);
    setChatSessions(updated);
    // If we're currently viewing the deleted session, start fresh
    if (id === currentSessionId) {
      setCurrentSessionId(null);
      const n = localStorage.getItem("tf_username") || "";
      setChatMsgs([{ from: "bot", text: `Hey${n ? " " + n : ""}! 👋 I'm **LIBI v4.0** ✦ — now with **live web search**!\n\n🌐 I can now search the internet and answer *anything*:\n• _"How to make cupcakes?"_ — I'll give you the recipe + YouTube videos\n• _"Best exercises for beginners?"_ — web results + add as tasks\n• _"What is quantum computing?"_ — live answer from the web\n\n📋 I still handle your tasks:\n• _"Plan my day"_ · _"What's overdue?"_ · _"Motivate me"_\n\nJust ask me anything! 🚀` }]);
    }
    try { localStorage.setItem("libi_sessions", JSON.stringify(updated)); } catch {}
  }
  const [showLibiPanel, setShowLibiPanel] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("week"); // week|month|all
  const [deletedTask, setDeletedTask] = useState(null); // for undo
  const [undoTimer, setUndoTimer] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => { setTimeout(() => setShowSplash(false), 1600); }, []);

  // confetti + page state moved earlier

  const chatPanelJSX = (
    <>
      {/* ── Header — Planner style: icon + bold title left, status right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 10px", flexShrink: 0, position: "relative" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 2 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 8v4l3 3" /><circle cx="18" cy="6" r="3" fill="var(--acc)" stroke="none" />
            </svg>
            <span style={{ fontSize: 20, fontWeight: 700, color: "var(--t1)", letterSpacing: -.3 }}>LIBI AI</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--t3)", paddingLeft: 31 }}>
            Good {getTimeOfDay()}, {userName || "there"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {/* New Chat button */}
          <button onClick={startNewChat} title="New Chat" style={{ width: 36, height: 36, borderRadius: 10, background: "var(--s1)", border: "1.5px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--t2)", transition: "all .2s" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {/* History button */}
          <button onClick={() => setShowChatHistory(h => !h)} title="Chat History" style={{ width: 36, height: 36, borderRadius: 10, background: showChatHistory ? `linear-gradient(135deg,${accent.v},${accent.g})` : "var(--s1)", border: showChatHistory ? "none" : "1.5px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: showChatHistory ? "#fff" : "var(--t2)", transition: "all .2s" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
        </div>
      </div>

      {/* ── Chat History Panel */}
      {showChatHistory && (
        <div style={{ position: "absolute", top: 70, right: 12, width: 280, background: "var(--s1)", border: "1.5px solid var(--b1)", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", zIndex: 999, overflow: "hidden", animation: "su .2s cubic-bezier(.32,1.2,.64,1)" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--b1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>Chat History</span>
            <button onClick={startNewChat} style={{ fontSize: 11, fontWeight: 700, color: "var(--acc)", background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, background: `${accent.v}18` }}>+ New Chat</button>
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {chatSessions.length === 0 ? (
              <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--t3)", fontSize: 13 }}>No saved chats yet</div>
            ) : chatSessions.map(s => {
              const isActive = s.id === currentSessionId;
              return (
                <div key={s.id} onClick={() => loadSession(s)} style={{ padding: "11px 14px", borderBottom: "1px solid var(--b2)", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "background .15s", background: isActive ? "var(--accd)" : "transparent" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "var(--s2)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isActive ? "var(--acc)" : "var(--t3)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 600, color: isActive ? "var(--acc)" : "var(--t1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{s.date}{isActive ? " · active" : ""}</div>
                  </div>
                  <button onClick={e => deleteSession(s.id, e)} style={{ width: 24, height: 24, borderRadius: 6, background: "none", border: "none", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CHAT messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
        {chatMsgs.map((m, i) => {
          const pendingMatch = m.text.match(/\[PENDING_TASKS:([\s\S]*?)\]$/);
          const pendingTasks = pendingMatch ? (() => { try { return JSON.parse(pendingMatch[1]); } catch { return null; } })() : null;
          const isLastMsg = i === chatMsgs.length - 1;
          const cleanText = m.text.replace(/\[PENDING_TASKS:[\s\S]*?\]$/, "").trim();
          const html = cleanText
            .replace(/__OFFER_TASK__:[\s\S]*?__END__/g, "")
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/\*\*([\s\S]*?)\*\*/g, "<strong>$1</strong>")
            .replace(/(?<![a-zA-Z0-9])_([^_\n]+?)_(?![a-zA-Z0-9])/g, "<em>$1</em>")
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--acc);text-decoration:underline;word-break:break-all;">$1</a>')
            .replace(/\n/g, "<br/>");
          return (
            <div key={i} style={{
              background: m.from === "user" ? "transparent" : "var(--s1)",
              border: m.from === "user" ? "none" : "1.5px solid var(--b1)",
              borderRadius: 14,
              padding: m.from === "user" ? "8px 12px" : "16px",
              alignSelf: m.from === "user" ? "flex-end" : "stretch",
              maxWidth: m.from === "user" ? "90%" : "100%",
              boxShadow: m.from === "user" ? "none" : "0 2px 12px rgba(0,0,0,0.02)"
            }}>
              {m.from !== "user" && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: `${accent.v}15`, color: accent.v, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10" /><path d="M12 8v4l3 3" /><circle cx="18" cy="6" r="3" fill="currentColor" stroke="none" /></svg>
                  </div>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--t1)" }}>LIBI AI</span>
                </div>
              )}
              {m.from === "user" && (
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, textAlign: "right" }}>You</div>
              )}
              <div dangerouslySetInnerHTML={{ __html: html }} style={{ fontSize: 14.5, lineHeight: 1.55, color: m.from === "user" ? "var(--t2)" : "var(--t1)", wordWrap: "break-word" }} />
              {pendingTasks && isLastMsg && (
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button onClick={() => {
                    pendingTasks.forEach(title => {
                      setTasks(ts => [{
                        id: uid(), title, notes: "Added by LIBI", priority: "medium",
                        categoryId: "work", due: "", photo: null, tags: ["libi"],
                        subtasks: [], starred: false, recurring: "never",
                        profileId: activeProfile, done: false, createdAt: Date.now()
                      }, ...ts]);
                    });
                    play("add"); haptic("success");
                    setChatMsgs(msgs => msgs.map((msg, idx) => idx === i
                      ? { ...msg, text: cleanText + `\n\n✅ Added **${pendingTasks.length} task${pendingTasks.length > 1 ? "s" : ""}** to your list!` }
                      : msg
                    ));
                  }} style={{ flex: 1, padding: "10px 0", background: `linear-gradient(135deg,${accent.v},${accent.g})`, border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: `0 4px 12px ${accent.v}40` }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Yes, add them
                  </button>
                  <button onClick={() => {
                    setChatMsgs(msgs => msgs.map((msg, idx) => idx === i
                      ? { ...msg, text: cleanText + "\n\n_No problem, skipped!_" }
                      : msg
                    ));
                  }} style={{ padding: "0 16px", background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 10, fontSize: 13, fontWeight: 600, color: "var(--t2)", cursor: "pointer" }}>
                    No thanks
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {chatTyping && (
          <div style={{ background: "var(--s1)", border: "1.5px solid var(--b1)", borderRadius: 14, padding: "16px 20px", alignSelf: "flex-start", display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--t3)", animation: "shimmer 1s infinite" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--t3)", animation: "shimmer 1s infinite 0.2s" }} />
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--t3)", animation: "shimmer 1s infinite 0.4s" }} />
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── Quick suggestion pills — Planner tonal button style */}
      <div style={{ padding: "0 18px 14px", display: "flex", overflowX: "auto", gap: 8, scrollbarWidth: "none" }}>
        {["Plan my day", "How to make cupcakes?", "What's overdue?", "Motivate me", "My progress"].map(q => (
          <button key={q} onClick={() => sendChat(q)} style={{ flexShrink: 0, height: 32, padding: "0 14px", background: "var(--s1)", border: "1.5px solid var(--b1)", borderRadius: 10, fontSize: 12.5, fontWeight: 600, color: "var(--t2)", cursor: "pointer", whiteSpace: "nowrap" }}>
            {q}
          </button>
        ))}
      </div>

      {/* ── Input box — matches Planner card style */}
      <div style={{ padding: "10px 18px calc(18px + env(safe-area-inset-bottom,0px))", flexShrink: 0, borderTop: "none", background: "var(--bg)" }}>
        <div style={{ background: "var(--s1)", border: "1.5px solid var(--b1)", borderRadius: 14, padding: "12px 14px 10px", display: "flex", flexDirection: "column", gap: 10, boxShadow: "0 2px 12px rgba(0,0,0,0.02)" }}>
          <textarea
            rows={2}
            placeholder="Ask LIBI anything…"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
            style={{ border: "none", background: "transparent", fontSize: 14, color: "var(--t1)", resize: "none", outline: "none", width: "100%", padding: 0, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase" }}>Brain v4.0</span>
            <button
              disabled={!chatInput.trim() || chatTyping}
              onClick={() => sendChat()}
              style={{ width: 34, height: 34, borderRadius: 10, background: (!chatInput.trim() || chatTyping) ? "var(--s2)" : `linear-gradient(135deg,${accent.v},${accent.g})`, border: (!chatInput.trim() || chatTyping) ? "1px solid var(--b1)" : "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: (!chatInput.trim() || chatTyping) ? "not-allowed" : "pointer", opacity: (!chatInput.trim() || chatTyping) ? 0.6 : 1, transition: "all 0.2s" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={(!chatInput.trim() || chatTyping) ? "var(--t3)" : "white"} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  // == ⌘ COMMAND PALETTE ==
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const cmdRef = useRef(null);
  useEffect(() => {
    function h(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); openAdd(); }

      if (e.key === "F5") { e.preventDefault(); }
      if (e.key === "?") { setShowShortcuts(s => !s); }
      if (e.key === "Escape") { setShowFocusMode(false); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const CMD_ACTIONS = [
    { icon: "➕", label: "Add New Task", action: () => { openAdd(); setShowCmdPalette(false); }, group: "Tasks" },
    { icon: "📝", label: "New Note", action: () => { setNoteForm({ title: "", body: "", color: "#7c6dfa", pinned: false, category: "personal", tags: [] }); setEditNote(null); setShowNoteEditor(true); setShowCmdPalette(false); }, group: "Notes" },
    { icon: "🏆", label: "New Goal", action: () => { setShowGoalModal(true); setShowCmdPalette(false); }, group: "Goals" },
    { icon: "📅", label: "Go to Calendar", action: () => { setTab("calendar"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "📊", label: "Go to Stats", action: () => { setTab("stats"); setShowCmdPalette(false); }, group: "Navigate" },
    { icon: "🌌", label: "Enter Focus Mode", action: () => { setFocusTaskId(null); setShowFocusMode(true); setShowCmdPalette(false); }, group: "Focus" },
    { icon: "🐟", label: "LIBI AI Assistant", action: () => { setTab("bot"); play("tap"); setShowCmdPalette(false); }, group: "AI" },

    { icon: "☀️", label: "Toggle Dark/Light", action: () => { setDark(d => !d); setShowCmdPalette(false); }, group: "Settings" },
    { icon: "🎯", label: "View Overdue Tasks", action: () => { setTab("overdue"); setShowCmdPalette(false); }, group: "Tasks" },
    { icon: "⭐", label: "View Starred Tasks", action: () => { setTab("starred"); setShowCmdPalette(false); }, group: "Tasks" },
  ];
  const filteredCmds = cmdQuery.trim() ? CMD_ACTIONS.filter(c => c.label.toLowerCase().includes(cmdQuery.toLowerCase()) || c.group.toLowerCase().includes(cmdQuery.toLowerCase())) : CMD_ACTIONS;
  const taskResults = cmdQuery.trim().length >= 2 ? profileTasks.filter(t => !t.done && t.title.toLowerCase().includes(cmdQuery.toLowerCase())).slice(0, 4) : [];

  // == Persist ALL data to localStorage ==
  useEffect(() => { try { localStorage.setItem("tf_greet_scene", greetScene); localStorage.setItem("tf_greet_bg", greetCardBg); localStorage.setItem("tf_greet_accent", greetAccent); } catch { } }, [greetScene, greetCardBg, greetAccent]);

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
    const backup = { tasks, goals, habits, notes, categories, profiles, timestamp: Date.now() };
    idbSet("tf_backup", JSON.stringify(backup)).catch(() => { });
  }, [tasks, goals, habits, notes, authUser]);
  useEffect(() => { try { localStorage.setItem("tf_cats", JSON.stringify(categories)); } catch { } }, [categories]);
  useEffect(() => { try { localStorage.setItem("tf_profiles", JSON.stringify(profiles)); } catch { } }, [profiles]);
  useEffect(() => { try { localStorage.setItem("tf_dark", JSON.stringify(dark)); } catch { } }, [dark]);
  useEffect(() => { try { localStorage.setItem("tf_accent", JSON.stringify(accentIdx)); } catch { } }, [accentIdx]);
  useEffect(() => { try { localStorage.setItem("tf_lang", langKey); } catch { } }, [langKey]);
  useEffect(() => { try { localStorage.setItem("tf_goals", JSON.stringify(goals)); } catch { } }, [goals]);
  useEffect(() => { try { localStorage.setItem("tf_habits", JSON.stringify(habits)); } catch { } }, [habits]);
  useEffect(() => { try { localStorage.setItem("tf_notes", JSON.stringify(notes)); } catch { } }, [notes]);
  useEffect(() => { try { localStorage.setItem("tf_wallpaper", wallpaper); } catch { } }, [wallpaper]);
  useEffect(() => { try { localStorage.setItem("tf_boardcols", JSON.stringify(boardColumns)); } catch { } }, [boardColumns]);
  useEffect(() => { try { localStorage.setItem("tf_boardcards", JSON.stringify(boardCards)); } catch { } }, [boardCards]);
  useEffect(() => { try { localStorage.setItem("tf_time", JSON.stringify(timeEntries)); } catch { } }, [timeEntries]);


  // == Social Share Card ==
  const generateShareCard = () => {
    const done = profileTasks.filter(t => t.done).length;
    const total = profileTasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    setShareStats({ done, total, pct, name: userName || "StaredList User" });
    setShowShareModal(true);
  };

  const shareAchievement = async () => {
    if (!shareStats) return;
    const text = `🚀 I completed ${shareStats.done} tasks today on StaredList!\n✨ ${shareStats.pct}% completion rate\n\nGet StaredList — your productivity assistant 🚀`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "StarredList Achievement", text, url: "https://taskflow-ultimate.netlify.app" });
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
            play("add"); haptic("success");
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
          const tabMap = { tasks: "tasks", goals: "goals", habits: "habits", notes: "notes", calendar: "calendar", stats: "stats", board: "board", planner: "planner", settings: "settings" };
          const found = Object.entries(tabMap).find(([k]) => dest.includes(k));
          if (found) { setTab(found[1]); showNotif("🎤 Navigated", found[1]); }

          // ── 5. START TIMER / POMODORO ──
        } else if (/start (timer|pomodoro|focus|session)/i.test(lower)) {
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







  // == Email Weekly Digest ==
  function sendEmailDigest() {
    const email = prompt("Enter your email address:");
    if (!email || !email.includes("@")) return;
    const done7 = profileTasks.filter(t => t.done && t.createdAt && (Date.now() - new Date(t.createdAt).getTime()) < 7 * 24 * 60 * 60 * 1000).length;
    const active = profileTasks.filter(t => !t.done).length;
    const subject = `Your StaredList Digest 📊`;
    const body = `Hi ${libiMemory.name || "there"}!%0A%0AHere's your productivity summary in StaredList:%0A%0A` +
      `✅ Tasks completed this week: ${done7}%0A` +
      `⏳ Current active tasks: ${active}%0A%0A` +
      `Keep up the great work!%0A%0A— Your AI productivity assistant%0A%0AStaredList by LIBI Labs`;
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
                {[...Array(25)].map((_, i) => <div key={i} style={{ position: "absolute", width: (i % 3 === 0 ? 3 : 2), height: (i % 3 === 0 ? 3 : 2), borderRadius: "50%", background: "#fff", opacity: .1 + Math.random() * .7, top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, animation: `twinkle ${2 + Math.random() * 3}s ease-in-out infinite`, animationDelay: `${Math.random() * 4}s`, pointerEvents: "none" }} />)}
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
                  <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: "#eceeff" }}>All done!</div>
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



          {/* == ✦ AI NATURAL LANGUAGE TASK EDITOR == */}

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
          {showSplash && (
            <div style={{ position: "fixed", inset: 0, background: dark ? "#08090e" : "#f4f5fb", zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

              {/* Icon + wordmark */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, animation: "splFadeIn .45s ease both" }}>
                <div style={{
                  width: 84, height: 84, borderRadius: 24,
                  background: `linear-gradient(145deg,${accent.v},${accent.g})`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: `0 16px 48px ${accent.v}55`,
                  animation: "splPop .5s cubic-bezier(.34,1.56,.64,1) both"
                }}>
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
                    <polygon points="12,2 13.8,8.8 20,8.8 14.9,12.7 16.7,19.5 12,15.6 7.3,19.5 9.1,12.7 4,8.8 10.2,8.8" fill="white" />
                  </svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 26, fontWeight: 700, color: dark ? "#f0f2ff" : "#1a1d2b", letterSpacing: -.4 }}>StarredList</div>
                  <div style={{ fontFamily: "'Outfit',sans-serif", fontSize: 11, fontWeight: 500, color: dark ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.3)", letterSpacing: 2.8, textTransform: "uppercase", marginTop: 5 }}>by LIBI Labs</div>
                </div>
              </div>

              {/* Thin progress bar — WhatsApp / Instagram style */}
              <div style={{ position: "absolute", bottom: 48, left: "50%", transform: "translateX(-50%)", width: 110 }}>
                <div style={{ height: 3, background: dark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.08)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", background: `linear-gradient(90deg,${accent.v},${accent.g})`, borderRadius: 3, animation: "splBar 1.45s ease forwards" }} />
                </div>
              </div>

              <style>{`
                @keyframes splFadeIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
                @keyframes splPop { from{opacity:0;transform:scale(.65)} to{opacity:1;transform:scale(1)} }
                @keyframes splBar { from{width:0} to{width:100%} }
              `}</style>
            </div>
          )}

          {/* == MINIMALIST SIGN-IN PAGE == */}
          {showAuthScreen && !authUser && (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", flexDirection: "column", alignItems: "center", background: "#f8f9fc", overflowY: "auto", overflowX: "hidden" }} className="auth-root">

              {/* === BACKGROUND SCENERY === */}
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
                <canvas id="authParticleCanvas" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
                {(() => {
                  if (typeof window !== "undefined") {
                    setTimeout(() => {
                      const canvas = document.getElementById("authParticleCanvas");
                      if (!canvas || canvas._authInit) return;
                      canvas._authInit = true;
                      const ctx = canvas.getContext("2d");
                      const resize = () => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; };
                      resize();
                      window.addEventListener("resize", resize);
                      const COLORS = ["#FF2D78", "#FF6EB4", "#a855f7", "#7c6dfa", "#4285F4", "#34A853", "#FBBC05", "#EA4335", "#00f2fe", "#f093fb", "#667eea", "#ff9a9e"];
                      const COUNT = 80;
                      const stars = Array.from({ length: COUNT }, () => ({
                        x: Math.random() * (canvas.width || 1400),
                        y: Math.random() * (canvas.height || 800),
                        r: 1.5 + Math.random() * 3,
                        alpha: 0.2 + Math.random() * 0.5,
                        color: COLORS[Math.floor(Math.random() * COLORS.length)],
                        pulse: Math.random() * Math.PI * 2,
                        pulseSpeed: 0.02 + Math.random() * 0.03
                      }));
                      const draw = () => {
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                        stars.forEach(p => {
                          p.pulse += p.pulseSpeed;
                          ctx.globalAlpha = p.alpha + Math.sin(p.pulse) * 0.2;
                          ctx.fillStyle = p.color;
                          ctx.beginPath();
                          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                          ctx.fill();
                        });
                        requestAnimationFrame(draw);
                      };
                      draw();
                    }, 100);
                  }
                  return null;
                })()}

                <svg viewBox="0 0 1000 800" style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "140%", maxWidth: 1200, opacity: 0.25 }}>
                  <path d="M -200,800 C 100,800 300,500 500,500 C 700,500 900,300 1200,200" fill="none" stroke="url(#pathGrad)" strokeWidth="20" strokeLinecap="round" strokeDasharray="30 40" style={{ animation: "pathMarch 15s linear infinite" }} />
                  <defs>
                    <linearGradient id="pathGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#7c6dfa" />
                      <stop offset="50%" stopColor="#f0abfc" />
                      <stop offset="100%" stopColor="#f5576c" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Terrain / Trees at Bottom */}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 180 }}>
                  <div style={{ position: "absolute", bottom: "10%", left: "15%", fontSize: 60, opacity: 0.9 }}>🌳</div>
                  <div style={{ position: "absolute", bottom: "20%", left: "25%", fontSize: 45, opacity: 0.8 }}>🌲</div>
                  <div style={{ position: "absolute", bottom: "5%", right: "10%", fontSize: 60, opacity: 0.9 }}>🌳</div>
                  <div style={{ position: "absolute", bottom: "15%", right: "25%", fontSize: 50, opacity: 0.8 }}>🌲</div>
                  <svg viewBox="0 0 1440 320" style={{ position: "absolute", bottom: -20, width: "100%" }}>
                    <path fill="rgba(255,255,255,0.7)" d="M0,256L60,245.3C120,235,240,213,360,218.7C480,224,600,256,720,266.7C840,277,960,267,1080,240C1200,213,1320,171,1380,149.3L1440,128L1440,320L1380,320C1320,320,1200,320,1080,320C960,320,840,320,720,320C600,320,480,320,360,320C240,320,120,320,60,320L0,320Z"></path>
                  </svg>
                </div>
              </div>

              {/* === FOREGROUND CONTENT === */}
              <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: 500, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px 80px" }}>

                {/* 1) Top Logo */}
                <div style={{ background: "linear-gradient(135deg, #FF2D78, #FF6EB4)", padding: "10px 18px", borderRadius: 24, display: "flex", alignItems: "center", gap: 8, boxShadow: "0 8px 24px rgba(255,45,120,0.25)", marginBottom: 30, animation: "authBadge1 3s ease-in-out infinite" }}>
                  <span style={{ color: "#fff", fontSize: 20 }}>⭐</span>
                  <span style={{ fontFamily: "'Outfit',sans-serif", fontSize: 18, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>StarredList</span>
                  <span style={{ fontSize: 14 }}>🎯</span>
                </div>

                {/* 2) Catchy Title Effect */}
                <div style={{ textAlign: "center", marginBottom: 30, position: "relative" }}>
                  <div className="floating-mini" style={{ top: -20, left: -20, animation: "floatMini1 4s ease-in-out infinite" }}>🚀</div>
                  <div className="floating-mini" style={{ bottom: 10, right: -10, animation: "floatMini2 4.5s ease-in-out infinite" }}>✅</div>
                  <div className="floating-mini" style={{ top: 15, right: -25, animation: "floatMini3 3.5s ease-in-out infinite" }}>📈</div>

                  <div className="auth-heading-line1" style={{ fontSize: 34, fontWeight: 800, color: "#1a1a1a", lineHeight: 1.2, marginBottom: 4, letterSpacing: -1 }}>
                    Stay on top of your
                  </div>
                  <div className="auth-heading-line2" style={{ fontSize: 38, fontWeight: 800, lineHeight: 1.2 }}>
                    <span className="auth-shimmer-text">starred tasks.</span>
                  </div>
                </div>

                {/* 3) Google Sign In Button - Very prominent */}
                <div style={{ width: "100%", zIndex: 10, position: "relative", marginBottom: -10 }}>
                  <button
                    onClick={async () => { setAuthError(""); setAuthLoading(true); try { await signInWithGoogle(); } catch (e) { setAuthError("Sign-in failed. Please try again."); } finally { setAuthLoading(false); } }}
                    disabled={authLoading}
                    style={{ width: "100%", height: 64, background: "#fff", borderRadius: 32, fontSize: 17, fontWeight: 700, color: "#1a1a1a", border: "1px solid #eee", cursor: authLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.12)", transition: "all .25s" }}
                    onMouseEnter={e => { if (!authLoading) { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 40px rgba(0,0,0,0.18)"; } }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 12px 30px rgba(0,0,0,0.12)"; }}>
                    <svg width="24" height="24" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" />
                      <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" />
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" />
                    </svg>
                    {authLoading ? "Connecting…" : "Continue with Google"}
                  </button>
                  {authError && <div style={{ color: "#e74c3c", fontSize: 13, marginTop: 16, padding: "10px", background: "#fff5f5", borderRadius: 12, border: "1px solid #fcc", textAlign: "center" }}>{authError}</div>}
                </div>

                {/* 4) Cards Group - layered behind the main button area */}
                <div style={{ position: "relative", width: "100%", height: 300 }}>
                  {/* Left Purple Card */}
                  <div style={{ position: "absolute", left: 10, top: 40, width: 150, height: 180, borderRadius: 20, background: "linear-gradient(135deg, #a78bfa, #8b5cf6)", color: "#fff", padding: 18, boxShadow: "0 12px 30px rgba(139,92,246,0.3)", transform: "rotate(-6deg)", zIndex: 1, animation: "authFloat1 4s ease-in-out infinite" }}>
                    <div style={{ fontSize: 24, marginBottom: 8, background: "#fff", color: "#8b5cf6", width: 40, height: 40, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>✅</div>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>6 tasks done</div>
                    <div style={{ width: "100%", height: 6, background: "rgba(255,255,255,0.3)", borderRadius: 4, marginBottom: 6 }}>
                      <div style={{ width: "75%", height: "100%", background: "#fff", borderRadius: 4 }} />
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>75% complete</div>
                  </div>

                  {/* Right Blue Card */}
                  <div style={{ position: "absolute", right: 10, top: 60, width: 140, height: 170, borderRadius: 20, background: "linear-gradient(135deg, #38bdf8, #0ea5e9)", color: "#fff", padding: 18, boxShadow: "0 12px 30px rgba(14,165,233,0.3)", transform: "rotate(6deg)", zIndex: 1, animation: "authFloat3 4s ease-in-out infinite" }}>
                    <div style={{ fontSize: 28, marginBottom: 10 }}>🔥</div>
                    <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 16 }}>7-day streak!</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
                      {[1, 2, 3, 4, 5].map(d => <div key={d} style={{ width: 14, height: 14, background: "#fff", borderRadius: 4 }} />)}
                      <div style={{ width: 14, height: 14, background: "rgba(255,255,255,0.4)", borderRadius: 4 }} />
                      <div style={{ width: 14, height: 14, background: "rgba(255,255,255,0.4)", borderRadius: 4 }} />
                    </div>
                  </div>

                  {/* Center Pink Card (Main) */}
                  <div style={{ position: "absolute", left: "50%", top: 5, transform: "translateX(-50%)", width: 190, height: 230, borderRadius: 20, background: "linear-gradient(135deg, #fbcfe8, #f472b6, #fb7185)", padding: 20, color: "#fff", boxShadow: "0 20px 50px rgba(244,114,182,0.4)", zIndex: 2, animation: "authFloat2 4s ease-in-out infinite" }}>
                    <div style={{ textAlign: "center", fontWeight: 800, fontSize: 15, marginBottom: 16, color: "#fff" }}>3 starred tasks</div>
                    {["Design mockup", "Send proposal", "Review code"].map(t => (
                      <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.25)", padding: "10px 14px", borderRadius: 12, marginBottom: 10, fontSize: 12, fontWeight: 700 }}>
                        <div style={{ width: 8, height: 8, background: "#fff", borderRadius: "50%", flexShrink: 0 }} />
                        {t}
                      </div>
                    ))}
                  </div>

                  {/* Floating Bubbles near bottom */}
                  <div style={{ position: "absolute", left: -10, top: 120, background: "#fff", padding: "8px 16px", borderRadius: 24, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 3, animation: "authBadge1 4s ease-in-out infinite" }}>
                    <span style={{ fontSize: 16 }}>🌱</span> Daily Habits
                  </div>
                  <div style={{ position: "absolute", right: 20, top: -15, background: "#fff", padding: "8px 16px", borderRadius: 24, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 3, color: "#a855f7", animation: "authBadge2 3.5s ease-in-out infinite" }}>
                    <span>⚡</span> Focus Timer
                  </div>
                  <div style={{ position: "absolute", right: 0, bottom: 10, background: "#fff", padding: "8px 16px", borderRadius: 24, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 3, color: "#fb7185", animation: "authBadge1 4s ease-in-out infinite" }}>
                    <span>💜</span> 12 tasks
                  </div>
                </div>

                <div style={{ flex: 1 }} /> {/* Spacer */}

                {/* 5) Bottom Ribbon Section */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative", zIndex: 10, marginTop: 40 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#444", marginBottom: -25, zIndex: 2 }}>Log into StarredList</div>

                  {/* Decorative Ribbon SVG */}
                  <div style={{ width: 380, height: 120, position: "relative", animation: "ribbonSway 6s ease-in-out infinite" }}>
                    <svg viewBox="0 0 500 120" style={{ width: "100%", height: "100%", overflow: "visible" }}>
                      <defs>
                        <filter id="rbShadow">
                          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#991b1b" floodOpacity="0.35" />
                        </filter>
                        <linearGradient id="rbG1" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#ef4444" />
                          <stop offset="50%" stopColor="#dc2626" />
                          <stop offset="100%" stopColor="#991b1b" />
                        </linearGradient>
                      </defs>
                      <g filter="url(#rbShadow)">
                        {/* Tails */}
                        <path d="M -20,50 L -60,110 L 60,90 Z" fill="#991b1b" stroke="#fde047" strokeWidth="2" strokeLinejoin="round" />
                        <path d="M 520,50 L 560,110 L 440,90 Z" fill="#991b1b" stroke="#fde047" strokeWidth="2" strokeLinejoin="round" />
                        {/* Shadow Folds */}
                        <path d="M 40,30 L 40,80 L 100,50 Z" fill="#7f1d1d" />
                        <path d="M 460,30 L 460,80 L 400,50 Z" fill="#7f1d1d" />
                        {/* Main Center */}
                        <path d="M 40,30 C 200,-5 300,-5 460,30 L 450,90 C 300,60 200,60 50,90 Z" fill="url(#rbG1)" stroke="#fde047" strokeWidth="4" />
                      </g>
                    </svg>
                    {/* Pink Star Icon inside Ribbon */}
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -45%)", display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ background: "linear-gradient(135deg, #FF2D78, #FF6EB4)", padding: 6, borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.25)" }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                          <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" />
                        </svg>
                      </div>
                      <span style={{ fontSize: 26, fontWeight: 800, color: "white", textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>StarredList</span>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, fontWeight: 700, color: "#888", marginTop: 8 }}>by LIBI AI Labs</div>
                </div>

              </div>

              {/* Animations */}
              <style>{`
                @keyframes pathMarch { from { stroke-dashoffset: 750; } to { stroke-dashoffset: 0; } }
                @keyframes authHeadFadeUp {
                  0% { opacity: 0; transform: translateY(24px) scale(0.96); filter: blur(4px); }
                  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
                }
                @keyframes authShimmer {
                  0%   { background-position: -200% center; }
                  100% { background-position: 200% center; }
                }
                @keyframes authGlow {
                  0%, 100% { text-shadow: 0 0 20px rgba(124,109,250,0.35), 0 0 50px rgba(168,85,247,0.2); transform: scale(1); }
                  50%       { text-shadow: 0 0 40px rgba(124,109,250,0.65), 0 0 80px rgba(168,85,247,0.35); transform: scale(1.02); }
                }
                @keyframes floatMini1 {
                  0%, 100% { transform: translate(0, 0) rotate(-5deg) scale(1); }
                  50%      { transform: translate(6px, -10px) rotate(5deg) scale(1.05); }
                }
                @keyframes floatMini2 {
                  0%, 100% { transform: translate(0, 0) rotate(10deg) scale(0.9); }
                  50%      { transform: translate(-8px, -15px) rotate(-5deg) scale(1.02); }
                }
                @keyframes floatMini3 {
                  0%, 100% { transform: translate(0, 0) rotate(8deg) scale(0.85); }
                  50%      { transform: translate(12px, 10px) rotate(15deg) scale(1.05); }
                }
                .auth-heading-line1 { animation: authHeadFadeUp 0.8s cubic-bezier(.34,1.56,.64,1) both; animation-delay: 0.15s; }
                .auth-heading-line2 { animation: authHeadFadeUp 0.8s cubic-bezier(.34,1.56,.64,1) both; animation-delay: 0.35s; }
                .auth-shimmer-text { background: linear-gradient(90deg, #1a1a1a 0%, #7c6dfa 50%, #1a1a1a 100%); background-size: 200% auto; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: authShimmer 3s linear infinite; }
                .floating-mini { position: absolute; font-size: 28px; filter: drop-shadow(0 6px 12px rgba(0,0,0,0.12)); pointer-events: none; z-index: 10; }
                @keyframes authFloat1 { 0%,100% { transform: rotate(-5deg) translateY(0px); } 50% { transform: rotate(-5deg) translateY(-10px); } }
                @keyframes authFloat2 { 0%,100% { transform: translateX(-50%) translateY(0px); } 50% { transform: translateX(-50%) translateY(-14px); } }
                @keyframes authFloat3 { 0%,100% { transform: rotate(6deg) translateY(0px); } 50% { transform: rotate(6deg) translateY(-8px); } }
                @keyframes authBadge1 { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-5px); } }
                @keyframes authBadge2 { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-7px); } }
                @keyframes ribbonSway { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(0.5deg); } }
              `}</style>
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





          {/* == VOICE TRANSCRIPT TOAST == */}

          {/* Modal Overlay / Task Modal */}

          {/* == PWA INSTALL BANNER == */}
          {showInstallBanner && !isInstalled && (
            <div className="install-banner">
              <div className="install-banner-icon">✦</div>
              <div className="install-banner-text">
                <div className="install-banner-title">Install StaredList</div>
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
                    <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>Last updated: March 2026 · StaredList by LIBI Labs</div>
                  </div>
                  <button onClick={() => setShowPrivacy(false)} style={{ width: 32, height: 32, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)", fontSize: 16, cursor: "pointer", color: "var(--t2)", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                </div>
                <div className="privacy-body" onTouchMove={e => e.stopPropagation()}>
                  <h2>{t.privacyPolicy || "Privacy Policy"}</h2>
                  <p>StarredList ("we", "our") is committed to protecting your privacy. This policy explains how we handle information when you use StarredList at <a href="https://taskflow-ultimate.netlify.app" target="_blank" rel="noreferrer">taskflow-ultimate.netlify.app</a>.</p>
                  <h3>1. Information We Collect</h3>
                  <p><strong>Local data only:</strong> All your tasks, habits, goals, notes, mood logs, and settings are stored exclusively in your browser's localStorage. This data never leaves your device.</p>
                  <p><strong>Firebase (optional):</strong> The real-time collaboration feature optionally syncs via Google Firebase. This is opt-in only. Firebase data is governed by Google's Privacy Policy.</p>
                  <p><strong>Voice input:</strong> Processed by your browser's Web Speech API. No audio is recorded or stored by StaredList.</p>
                  <p><strong>Advertising:</strong> We use Google AdSense to display ads. Google may collect anonymised usage data per Google's Advertising Policy.</p>
                  <h3>2. How We Use Information</h3>
                  <ul>
                    <li>To provide and improve the StaredList service</li>
                    <li>To display relevant ads via Google AdSense</li>
                    <li>To enable optional real-time collaboration via Firebase</li>
                    <li>We do <strong>not</strong> sell, rent, or share your personal data</li>
                  </ul>
                  <h3>3. Cookies & Tracking</h3>
                  <p>StaredList uses localStorage (not cookies) for app data. Google AdSense may use cookies for personalised ads. Opt out at <a href="https://adssettings.google.com" target="_blank" rel="noreferrer">adssettings.google.com</a>.</p>
                  <h3>4. Data Deletion</h3>
                  <p>Delete all data anytime via Settings → Clear Data, or by clearing your browser's site data. Firebase data can be removed by contacting us.</p>
                  <h3>5. Children's Privacy</h3>
                  <p>StaredList is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
                  <h3>6. Third-Party Services</h3>
                  <ul>
                    <li><a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a> (Firebase, AdSense)</li>
                    <li><a href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">Firebase Privacy Policy</a></li>
                  </ul>
                  <h3>7. Contact</h3>
                  <p>Privacy questions: <a href="mailto:privacy@libi-labs.com">privacy@libi-labs.com</a></p>

                  <h2>{t.termsOfService || "Terms of Service"}</h2>
                  <p>By using StaredList, you agree to these terms.</p>
                  <h3>1. Use of Service</h3>
                  <p>StaredList is free for personal productivity use. You may not use it for unlawful purposes or in ways that harm others.</p>
                  <h3>2. Data Responsibility</h3>
                  <p>All data is stored locally. You are responsible for backing up your data. We are not liable for data loss due to browser clearing or device changes.</p>
                  <h3>3. Intellectual Property</h3>
                  <p>The StaredList app, LIBI AI engine, and design are property of LIBI Labs. You may not copy or redistribute without permission.</p>
                  <h3>4. Advertisements</h3>
                  <p>StaredList displays ads via Google AdSense. We are not responsible for third-party ad content. Ad revenue keeps StaredList free.</p>
                  <h3>5. Disclaimer</h3>
                  <p>StaredList is provided "as is" without warranties. We do not guarantee uninterrupted or error-free operation.</p>
                  <h3>6. Governing Law</h3>
                  <p>These terms are governed by the laws of India. Disputes resolved in Kerala, India.</p>
                  <div style={{ marginTop: 24, padding: "14px 16px", background: "var(--s2)", borderRadius: 14, fontSize: 12, color: "var(--t3)", textAlign: "center", lineHeight: 1.8 }}>
                    Questions? <a href="mailto:privacy@libi-labs.com" style={{ color: "var(--acc)" }}>privacy@libi-labs.com</a><br />
                    © 2026 StaredList · LIBI Labs · Kerala, India
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





          <div className="shell" style={{ position: "relative" }}>
            {/* Sidebar — hidden on bot tab for full Claude-like experience */}
            <div className="sidebar" style={{ width: tab === "bot" ? 0 : "234px", overflowX: "hidden", overflowY: "auto", minWidth: 0, flexShrink: 0, opacity: tab === "bot" ? 0 : 1, pointerEvents: tab === "bot" ? "none" : undefined, transition: "width .25s cubic-bezier(.4,0,.2,1), opacity .2s ease" }}>
              <div className="logo" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingRight: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="logo-icon" style={{ background: "none", boxShadow: "none", animation: "none" }}>
                    <svg width="40" height="40" viewBox="0 0 40 40" style={{ width: "40px", height: "40px", flexShrink: 0 }}>
                      <defs>
                        <linearGradient id="slG2" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#22d3ee" />
                          <stop offset="50%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#0ea5e9" />
                        </linearGradient>
                        <filter id="glow2">
                          <feGaussianBlur stdDeviation="1.5" result="blur" />
                          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                        </filter>
                      </defs>
                      <rect x="0" y="0" width="40" height="40" rx="12" fill="url(#slG2)" />
                      <polygon points="20,6 23,15 33,15 25,21 28,31 20,25 12,31 15,21 7,15 17,15" fill="white" filter="url(#glow2)" opacity="0.95" />
                    </svg>
                  </div>
                  <span style={{ fontFamily: "'Trebuchet MS','Segoe UI',system-ui,sans-serif", fontSize: 19, fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>StarredList</span>
                </div>
              </div>

              <div className="nav-group">
                <div className="nav-lbl">Navigation</div>
                {[
                  { id: "tasks", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg>, label: t.tasks, cnt: activeCount },
                  { id: "starred", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>, label: t.starred, cnt: profileTasks.filter(x => x.starred && !x.done).length },
                  { id: "today", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: t.today, cnt: profileTasks.filter(x => x.due === todayStr() && !x.done).length },
                  { id: "overdue", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>, label: t.overdue, cnt: overdueCount },
                  { id: "done", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>, label: t.done, cnt: doneCount },
                  { id: "calendar", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: t.calendar, cnt: null },
                  { id: "stats", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>, label: t.stats, cnt: null },

                  { id: "goals", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5H6m12 5h1.5a2.5 2.5 0 0 0 2.5-2.5V6a2.5 2.5 0 0 0-2.5-2.5H18m-9 16.5v-13h6v13m-6-13a3 3 0 0 1 6 0" /></svg>, label: t.goals, cnt: null },
                  { id: "habits", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0-4.4-3.6-8-8-8a8 8 0 0 0-7.3 4.8" /><path d="M3 12c0 4.4 3.6 8 8 8a8 8 0 0 0 7.3-4.8" /></svg>, label: t.habits, cnt: null },
                  { id: "planner", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>, label: t.planner, cnt: null },
                  { id: "notes", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H14L21 14V5C21 3.9 20.1 3 19 3Z" /><path d="M14 21V14H21" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="13" y2="12" /></svg>, label: t.notes, cnt: notes.length || null },


                  { id: "bot", icon: <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "-0.3px", width: 18, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>AI</span>, label: t.bot, cnt: null },
                  { id: "settings", icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>, label: t.settings, cnt: null },
                ].map(v => (
                  <div key={v.id} className={`nav-item ${tab === v.id ? "on" : ""}`} onClick={() => { setTab(v.id); play("tap"); if (v.id === "done") { setShowDone(true); setShowStarred(false); } else if (v.id === "starred") { setShowStarred(true); setShowDone(false); } else if (!["bot", "stats", "calendar", "settings", "goals", "habits", "planner"].includes(v.id)) { setShowDone(false); setShowStarred(false); } }}>
                    <span className="nav-icon">{v.icon}</span>{v.label}
                    {v.cnt !== null && <span className="nav-badge">{v.cnt}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", height: "100%", background: "var(--s1)" }}>
              <div className={`topbar topbar-drag${!["tasks", "starred", "today", "overdue", "done"].includes(tab) ? " topbar-nonask" : ""}${tab === "calendar" || tab === "bot" ? " topbar-calendar-hidden" : ""}`}>
                <div className="topbar-logo-wrap" onClick={() => setTab("tasks")}>
                  <svg width="32" height="32" viewBox="0 0 40 40" style={{ width: "32px", height: "32px", flexShrink: 0, borderRadius: "10px" }}>
                    <defs>
                      <linearGradient id="slG1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#22d3ee" />
                        <stop offset="50%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0ea5e9" />
                      </linearGradient>
                      <filter id="glow1">
                        <feGaussianBlur stdDeviation="1.5" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                      </filter>
                    </defs>
                    <rect x="0" y="0" width="40" height="40" rx="12" fill="url(#slG1)" />
                    <polygon points="20,6 23,15 33,15 25,21 28,31 20,25 12,31 15,21 7,15 17,15" fill="white" filter="url(#glow1)" opacity="0.95" />
                  </svg>
                  <span style={{ fontFamily: "'Trebuchet MS','Segoe UI',system-ui,sans-serif", fontSize: 18, fontWeight: 700, background: "linear-gradient(135deg,#22d3ee,#0ea5e9)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>StarredList</span>
                </div>
                <span className="topbar-title">
{tab === "stats" ? t.stats : tab === "calendar" ? t.calendar : tab === "settings" ? t.settings : tab === "goals" ? "Goals" : tab === "habits" ? "Habits" : tab === "planner" ? "Daily Planner" : tab === "board" ? "Board" : tab === "starred" ? t.starred : tab === "overdue" ? t.overdue : tab === "today" ? t.today : tab === "done" ? t.done : tab === "news" ? "News" : t.tasks}
                </span>
                {!["bot", "stats", "calendar", "settings", "goals", "habits", "planner", "board", "notes", "news"].includes(tab) && <div className="search-wrap"><span style={{ color: "var(--t3)", fontSize: 13 }}>⌕</span><input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />{search && <span style={{ cursor: "pointer", color: "var(--t3)", fontSize: 12 }} onClick={() => setSearch("")}>✕</span>}</div>}
                <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                  {/* === MOBILE ONLY BUTTONS === */}
                  <button className="tb-btn mobile-only-btn" onClick={toggleDark} title="Toggle theme"
                    style={{ background: "transparent", border: "none", color: "var(--t3)", padding: "6px" }}>
                    {dark ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7zm0-5a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1zM4.22 4.22a1 1 0 0 1 1.42 0l.7.7a1 1 0 0 1-1.42 1.42l-.7-.7a1 1 0 0 1 0-1.42zm13.44 13.44a1 1 0 0 1 1.42 0l.7.7a1 1 0 0 1-1.42 1.42l-.7-.7a1 1 0 0 1 0-1.42zM1 12a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1zm19 0a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2h-1a1 1 0 0 1-1-1zM4.22 19.78a1 1 0 0 1 0-1.42l.7-.7a1 1 0 0 1 1.42 1.42l-.7.7a1 1 0 0 1-1.42 0zM17.66 6.34a1 1 0 0 1 0-1.42l.7-.7a1 1 0 0 1 1.42 1.42l-.7.7a1 1 0 0 1-1.42 0z" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>}
                  </button>

                  {/* === DESKTOP ONLY BUTTONS === */}
                  <button className="tb-btn desktop-only-btn" onClick={() => setShowLibiPanel(p => !p)} title="Toggle LIBI"
                    style={{ background: "transparent", border: "none", color: showLibiPanel ? "var(--acc)" : "var(--t3)", padding: "6px", fontSize: 11, fontWeight: 800, letterSpacing: .5 }}>LIBI</button>
                  <button className="tb-btn desktop-only-btn" onClick={toggleDark} title="Toggle theme"
                    style={{ background: "transparent", border: "none", color: "var(--t3)", padding: "6px" }}>
                    {dark ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7a5 5 0 1 0 0 10A5 5 0 0 0 12 7zm0-5a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 18a1 1 0 0 1 1 1v1a1 1 0 0 1-2 0v-1a1 1 0 0 1 1-1zM4.22 4.22a1 1 0 0 1 1.42 0l.7.7a1 1 0 0 1-1.42 1.42l-.7-.7a1 1 0 0 1 0-1.42zm13.44 13.44a1 1 0 0 1 1.42 0l.7.7a1 1 0 0 1-1.42 1.42l-.7-.7a1 1 0 0 1 0-1.42zM1 12a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2H2a1 1 0 0 1-1-1zm19 0a1 1 0 0 1 1-1h1a1 1 0 0 1 0 2h-1a1 1 0 0 1-1-1zM4.22 19.78a1 1 0 0 1 0-1.42l.7-.7a1 1 0 0 1 1.42 1.42l-.7.7a1 1 0 0 1-1.42 0zM17.66 6.34a1 1 0 0 1 0-1.42l.7-.7a1 1 0 0 1 1.42 1.42l-.7.7a1 1 0 0 1-1.42 0z" /></svg> : <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></svg>}
                  </button>
                  {pinEnabled && (
                    <button className="tb-btn" onClick={() => { setLocked(true); setPinMode("unlock"); setPinInput(""); setPinError(""); }} title="Lock app"
                      style={{ background: "transparent", border: "none", color: "var(--t3)", padding: "6px" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" /></svg>
                    </button>
                  )}
                  {!["bot", "stats", "calendar", "settings", "goals", "habits", "planner", "leaderboard", "notes", "news"].includes(tab) && (
                    <button
                      className="add-btn"
                      onMouseDown={onAddHoldStart}
                      onMouseUp={onAddHoldEnd}
                      onMouseLeave={onAddHoldCancel}
                      onTouchStart={onAddHoldStart}
                      onTouchEnd={onAddHoldEnd}
                      onTouchCancel={onAddHoldCancel}
                      onContextMenu={e => e.preventDefault()}
                      title="Click to add task · Hold to use voice"
                      style={isHoldingAdd || isVoiceTaskListening ? { background: "linear-gradient(135deg,#ff6b6b,#ff4444)", boxShadow: "0 0 0 6px rgba(255,107,107,0.25)", transform: "scale(0.97)" } : {}}
                    >
                      {isVoiceTaskListening ? "🎙 Listening…" : isHoldingAdd ? "🎤 Hold…" : "+ New Task"}
                    </button>
                  )}
                </div>
              </div>
              {tab === "tasks" || tab === "starred" || tab === "today" || tab === "overdue" || tab === "done" ? <div key={pageKey} className="content page-fade" style={{ overflowY: "auto" }}>{TasksPage()}</div> :
                tab === "stats" ? <div key="stats" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{StatsPage()}</div> :
                  tab === "calendar" ? <div key="calendar" className="page-fade" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0, position: "relative" }}>{CalendarPage()}</div> :
                    tab === "settings" ? <div key="settings" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{SettingsPage()}</div> :
                      tab === "goals" ? <div key="goals" className="content page-fade" style={{ overflowY: "auto" }}>{GoalsPage()}</div> :
                        tab === "habits" ? <div key="habits" className="content page-fade" style={{ overflowY: "auto" }}>{HabitsPage()}</div> :
                          tab === "planner" ? <div key="planner" className="content page-fade" style={{ overflowY: "auto" }}>{PlannerPage()}</div> :
tab === "notes" ? <div key="notes" className="content page-fade" style={{ overflowY: "auto" }}>{NotesPage()}</div> :
                            tab === "news" ? <div key="news" className="content page-fade" style={{ overflowY: "auto" }}>{NewsPage()}</div> :

                              tab === "timeline" ? <div key="timeline" className="content page-fade" style={{ overflowY: "auto", display: "flex", flexDirection: "column", flex: 1 }}>{TimelinePage()}</div> :
                                tab === "bot" ? <div key="bot" className="page-fade" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg)", paddingBottom: 0 }}>{chatPanelJSX}</div> :
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

            <nav className={`bot-nav${(["bot", "timeline", "calendar"].includes(tab) || showHabitDetail) ? " hide-bot" : ""}`}>
              <div className="bot-inner">
                <div className={`bot-item ${tab === "tasks" ? "on" : ""}`} onClick={() => { setTab("tasks"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /></svg></span><span>{t.tasks}</span>
                  {activeCount > 0 && <span className="bot-num">{activeCount > 99 ? "99+" : activeCount}</span>}
                </div>
                <div className={`bot-item ${tab === "bot" ? "on" : ""}`} onClick={() => { setTab("bot"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon" style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.3px", width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>AI</span><span>LIBI</span>
                </div>
                <div className="fab-wrap">
                  <button
                    className="fab"
                    onMouseDown={onAddHoldStart}
                    onMouseUp={onAddHoldEnd}
                    onMouseLeave={onAddHoldCancel}
                    onTouchStart={onAddHoldStart}
                    onTouchEnd={(e) => { e.stopPropagation(); onAddHoldEnd(e); }}
                    onTouchCancel={onAddHoldCancel}
                    onContextMenu={e => e.preventDefault()}
                    style={isHoldingAdd || isVoiceTaskListening ? { background: "linear-gradient(135deg,#ff6b6b,#ff4444)", boxShadow: "0 0 0 8px rgba(255,107,107,0.25)", transform: "scale(0.93)" } : {}}
                  >
                    {isVoiceTaskListening
                      ? <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V20H9v2h6v-2h-2v-2.07A7 7 0 0 0 19 11h-2z" /></svg>
                      : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    }
                  </button>
                  <span className="fab-lbl">{isVoiceTaskListening ? "Listening…" : "Add Task"}</span>
                </div>
                <div className={`bot-item ${tab === "stats" ? "on" : ""}`} onClick={() => { setTab("stats"); play("tap"); setShowMoreMenu(false); }}>
                  <span className="bot-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></span><span>Stats</span>
                </div>
                <div className={`bot-item ${showMoreMenu ? "on" : ""}`} onClick={() => setShowMoreMenu(m => !m)}>
                  <span className="bot-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg></span><span>More</span>
                </div>
              </div>
            </nav>


            {/* More Menu */}
            {showMoreMenu && (
              <div style={{ position: "fixed", inset: 0, zIndex: 199, background: "transparent", animation: "backdropIn .22s ease" }} onClick={() => setShowMoreMenu(false)} />
            )}
            {showMoreMenu && (
              <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "var(--s1)", borderTop: "1px solid var(--b1)", borderRadius: "22px 22px 0 0", padding: `14px 14px calc(16px + env(safe-area-inset-bottom, 0px))`, zIndex: 200, boxShadow: "0 -12px 40px rgba(0,0,0,.3)", maxHeight: "72vh", overflowY: "auto", animation: "moreSlideUp .32s cubic-bezier(.32,1.2,.64,1)" }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: `linear-gradient(90deg,${accent.v},${accent.g})`, margin: "0 auto 14px", opacity: .7 }} />
                <div style={{ fontSize: 10, fontWeight: 800, color: "var(--t3)", letterSpacing: 1.3, textTransform: "uppercase", marginBottom: 12, paddingLeft: 4 }}>All Features</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                  {[
                    { id: "goals", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1-2.5-2.5V6a2.5 2.5 0 0 1 2.5-2.5H6m12 5h1.5a2.5 2.5 0 0 0 2.5-2.5V6a2.5 2.5 0 0 0-2.5-2.5H18m-9 16.5v-13h6v13m-6-13a3 3 0 0 1 6 0" /></svg>, label: t.goals },
                    { id: "habits", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12c0-4.4-3.6-8-8-8a8 8 0 0 0-7.3 4.8M3 12c0 4.4 3.6 8 8 8a8 8 0 0 0 7.3-4.8" /><path d="m7 5-4 4 4 4m10 6 4-4-4-4" /></svg>, label: t.habits },
                    { id: "calendar", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, label: "Calendar" },
                    { id: "notes", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H14L21 14V5C21 3.9 20.1 3 19 3Z" /><path d="M14 21V14H21" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="13" y2="12" /></svg>, label: t.notes },
                    { id: "planner", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>, label: t.planner },
{ id: "news", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="13" y2="16" /></svg>, label: "News" },
                    { id: "settings", icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>, label: "Settings" },
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

                  <div>
                    <div className="f-lbl">Milestones / Steps</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 7 }}>
                      {goalForm.milestones.map((m, i) => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 8, padding: "6px 10px", transition: "border-color .15s" }}
                          onFocusCapture={e => e.currentTarget.style.borderColor = "var(--acc)"}
                          onBlurCapture={e => e.currentTarget.style.borderColor = "var(--b1)"}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>
                          <input
                            value={m.text}
                            onChange={e => setGoalForm(f => ({ ...f, milestones: f.milestones.map((ms, j) => j === i ? { ...ms, text: e.target.value } : ms) }))}
                            onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
                            style={{ flex: 1, border: "none", background: "transparent", fontSize: 13, color: "var(--t1)", outline: "none", fontFamily: "inherit", padding: 0, minWidth: 0 }}
                            placeholder="Milestone step…"
                          />
                          <span style={{ cursor: "pointer", fontSize: 13, color: "var(--t3)", flexShrink: 0, lineHeight: 1, padding: "0 2px" }}
                            onClick={() => setGoalForm(f => ({ ...f, milestones: f.milestones.filter((_, j) => j !== i) }))}>✕</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add a milestone step…" value={goalMilestoneInput} onChange={e => setGoalMilestoneInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && goalMilestoneInput.trim()) { setGoalForm(f => ({ ...f, milestones: [...f.milestones, { id: uid(), text: goalMilestoneInput.trim(), done: false }] })); setGoalMilestoneInput(""); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: "var(--acc)", borderRadius: 9, fontSize: 12, color: "#fff", fontWeight: 600 }} onClick={() => { if (!goalMilestoneInput.trim()) return; setGoalForm(f => ({ ...f, milestones: [...f.milestones, { id: uid(), text: goalMilestoneInput.trim(), done: false }] })); setGoalMilestoneInput(""); }}>+ Add</button>
                    </div>
                  </div>

                </div>
                <div className="m-foot"><button className="btn-c" onClick={() => setShowGoalModal(false)}>Cancel</button><button className="btn-s" disabled={!goalForm.title.trim() || goalSaving} onClick={saveGoal}>{goalSaving ? "Saving..." : editGoal ? "Save Changes" : "Create Goal"}</button></div>
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
                  <div><div className="f-lbl">Icon</div><div style={{ display: "grid", gridTemplateColumns: "repeat(8,1fr)", gap: 5, marginTop: 4 }}>{HABIT_ICONS.map(ic => <button key={ic} style={{ width: 34, height: 34, borderRadius: 8, fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", background: habitForm.icon === ic ? "var(--accd)" : "var(--s2)", border: `2px solid ${habitForm.icon === ic ? "var(--acc)" : "transparent"}`, cursor: "pointer", color: habitForm.icon === ic ? "var(--acc)" : "var(--t2)" }} onClick={() => setHabitForm(f => ({ ...f, icon: ic }))}>{HABIT_ICON_MAP[ic]}</button>)}</div></div>
                  <div><div className="f-lbl">Color</div><div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginTop: 4 }}>{GOAL_COLORS.map(c => <div key={c} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: `3px solid ${habitForm.color === c ? "var(--t1)" : "transparent"}`, transform: habitForm.color === c ? "scale(1.2)" : "scale(1)", transition: "all .15s" }} onClick={() => setHabitForm(f => ({ ...f, color: c }))} />)}</div></div>
                  <div><div className="f-lbl">Category</div><div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>{HABIT_CATEGORIES.map(cat => <button key={cat} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, background: habitForm.category === cat ? "var(--accd)" : "var(--s2)", color: habitForm.category === cat ? "var(--acc)" : "var(--t2)", border: `1.5px solid ${habitForm.category === cat ? "var(--acc)" : "var(--b1)"}`, cursor: "pointer", transition: "all .15s" }} onClick={() => setHabitForm(frm => ({ ...frm, category: cat }))}>{cat}</button>)}</div></div>
                  <div><div className="f-lbl">Frequency</div><div style={{ display: "flex", gap: 6, marginTop: 4 }}>{FREQ_OPTS.map(f => <button key={f.id} style={{ flex: 1, height: 34, borderRadius: 9, fontSize: 12, fontWeight: 600, background: habitForm.freq === f.id ? "var(--accd)" : "var(--s2)", color: habitForm.freq === f.id ? "var(--acc)" : "var(--t2)", border: `1.5px solid ${habitForm.freq === f.id ? "var(--acc)" : "var(--b1)"}`, cursor: "pointer", transition: "all .15s" }} onClick={() => setHabitForm(frm => ({ ...frm, freq: f.id }))}>{f.label}</button>)}</div></div>
                  <div style={{ background: "var(--s2)", borderRadius: 11, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: habitForm.color + "33", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>{habitForm.icon}</div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: habitForm.color }}>{habitForm.name || "Preview"}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--t3)" }}>{habitForm.category || "Other"} • {FREQ_OPTS.find(f => f.id === habitForm.freq)?.label}</span>
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
            <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) closeTaskModal(); }} style={{ animation: closingModal ? "overlayFadeOut .3s ease forwards" : undefined }}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ animation: closingModal ? "sheetSlideDown .3s cubic-bezier(.32,0,.64,0) forwards" : undefined }}>
                <div className="drag" />
                <div className="m-head"><div className="m-title">{editTaskObj ? t.editTask : t.newTask}</div><button className="ic-btn" style={{ fontSize: 20 }} onClick={closeTaskModal}>×</button></div>
                <div className="m-body">
                  <div><div className="f-lbl">{t.title} *</div><input className="f-in" placeholder="What needs to be done?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
                  <div><div className="f-lbl">{t.notes}</div><textarea className="f-in" style={{ height: 65, lineHeight: 1.5 }} placeholder="Details…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
                  <div className="row2">
                    <div>
                      <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>
                        {t.priority}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        {[
                          { val: "high", label: t.high, color: "#EF4444", shape: "square" },
                          { val: "medium", label: t.medium, color: "#F59E0B", shape: "diamond" },
                          { val: "low", label: t.low, color: "#22C55E", shape: "circle" },
                        ].map(p => {
                          const on = form.priority === p.val;
                          const shapeEl = p.shape === "square"
                            ? <span style={{ width: 8, height: 8, borderRadius: 2, background: on ? "#fff" : p.color, border: on ? "none" : `1.5px solid ${p.color}`, display: "inline-block", flexShrink: 0 }} />
                            : p.shape === "diamond"
                              ? <span style={{ width: 8, height: 8, background: on ? "#fff" : p.color, border: on ? "none" : `1.5px solid ${p.color}`, display: "inline-block", flexShrink: 0, transform: "rotate(45deg)", marginRight: 2 }} />
                              : <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "#fff" : p.color, border: on ? "none" : `1.5px solid ${p.color}`, display: "inline-block", flexShrink: 0 }} />;
                          return (
                            <button key={p.val} onClick={() => setForm(f => ({ ...f, priority: p.val }))}
                              style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 13px", borderRadius: 8, border: "none",
                                cursor: "pointer", fontSize: 12, fontWeight: 600,
                                background: on ? p.color : "var(--s2)",
                                color: on ? "#fff" : "var(--t2)",
                                transition: "all .15s",
                                boxShadow: on ? `0 2px 8px ${p.color}55` : "none",
                                flex: 1, justifyContent: "center",
                              }}>
                              {shapeEl}
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div><div className="f-lbl">{t.category}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {categories.map(c => {
                          const modalCatIcons = {
                            work: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>,
                            personal: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
                            health: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>,
                            learning: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>,
                            groceries: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>,
                          };
                          const icon = modalCatIcons[c.id] || <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /></svg>;
                          const isOn = form.categoryId === c.id;
                          return (
                            <button key={c.id} onClick={() => setForm(f => ({ ...f, categoryId: c.id }))}
                              style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 11px", borderRadius: 20, border: `1.5px solid ${isOn ? "var(--acc)" : "var(--b1)"}`, background: isOn ? "var(--accd)" : "var(--s2)", color: isOn ? "var(--acc)" : "var(--t2)", fontSize: 12, fontWeight: 500, cursor: "pointer", transition: "all .15s" }}>
                              {icon}{c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="row2">
                    <div><div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>{t.dueDate}</div><input className="f-in" type="date" value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} /></div>
                    <div><div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>{t.recurring}</div><select className="f-in" style={{ appearance: "none", cursor: "pointer" }} value={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}><option value="never">{t.never}</option><option value="daily">{t.daily}</option><option value="weekly">{t.weekly}</option><option value="monthly">{t.monthly}</option></select></div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>Star</div>
                      <button style={{ width: "100%", height: 42, background: form.starred ? "rgba(255,217,61,.15)" : "var(--s2)", border: `1px solid ${form.starred ? "#ffd93d55" : "var(--b1)"}`, borderRadius: 11, fontSize: 13, color: form.starred ? "#ffd93d" : "var(--t2)", transition: "all .2s" }} onClick={() => setForm(f => ({ ...f, starred: !f.starred }))}>{form.starred ? <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="#ffd93d" stroke="#ffd93d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>Starred</span> : <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>Star task</span>}</button>
                    </div>
                  </div>
                  {/* Photo */}
                  <div>
                    <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>{t.photo}</div>
                    {form.photo ? <div><img src={form.photo} className="photo-prev" alt="" /><div style={{ fontSize: 11.5, color: "var(--red)", marginTop: 5, cursor: "pointer", textAlign: "center" }} onClick={() => setForm(f => ({ ...f, photo: null }))}>✕ Remove photo</div></div> : <div className="photo-up" onClick={() => fileRef.current?.click()}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 6, opacity: .5 }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg><div style={{ fontSize: 12.5, color: "var(--t2)", fontWeight: 600 }}>Tap to add photo</div></div>}
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhoto} />
                  </div>
                  {/* Tags */}
                  <div>
                    <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>{t.tags}</div>
                    {form.tags.length > 0 && <div className="tags-wrap">{form.tags.map(tg => <span key={tg} className="tag-item">#{tg}<span style={{ cursor: "pointer", marginLeft: 2 }} onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== tg) }))}>×</span></span>)}</div>}
                    <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add tag…" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: "var(--s3)", borderRadius: 9, fontSize: 12, color: "var(--t1)" }} onClick={addTag}>+ Add</button>
                    </div>
                  </div>
                  {/* Subtasks */}
                  <div>
                    <div className="f-lbl" style={{ display: "flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>{t.subtasks}</div>
                    {form.subtasks.length > 0 && <div className="sub-list">{form.subtasks.map(s => <div key={s.id} className="sub-row"><div className={`sub-chk ${s.done ? "on" : ""}`} onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.map(x => x.id === s.id ? { ...x, done: !x.done } : x) }))}>{s.done && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}</div><span className={`sub-txt ${s.done ? "ds" : ""}`}>{s.text}</span><span style={{ cursor: "pointer", fontSize: 12, color: "var(--t3)", padding: "2px 4px" }} onClick={() => setForm(f => ({ ...f, subtasks: f.subtasks.filter(x => x.id !== s.id) }))}>✕</span></div>)}</div>}
                    <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                      <input style={{ flex: 1, background: "var(--s2)", border: "1px solid var(--b1)", borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: "var(--t1)" }} placeholder="Add a step…" value={subInput} onChange={e => setSubInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSub(); } }} />
                      <button style={{ height: 33, padding: "0 12px", background: accent.v, borderRadius: 9, fontSize: 12, color: "#fff", fontWeight: 600 }} onClick={addSub}>+ Add</button>
                    </div>
                  </div>
                </div>
                <div className="m-foot"><button className="btn-c" onClick={closeTaskModal}>{t.cancel}</button><button className="btn-s" disabled={!form.title.trim()} onClick={saveTask}>{editTaskObj ? t.save : t.add}</button></div>
              </div>
            </div>
          )}

          {/* == DETAIL MODAL == */}
          {showDetail && detailTask && (() => {
            const cat = getCat(detailTask.categoryId);
            const ds = detailTask.subtasks.filter(s => s.done).length;
            return (
              <div className="overlay" onClick={() => setShowDetail(false)}>
                <div className="modal" onClick={e => e.stopPropagation()} style={{ animation: closingModal ? "sheetSlideDown .3s cubic-bezier(.32,0,.64,0) forwards" : undefined }}>
                  <div className="drag" />
                  <div className="m-head">
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flex: 1, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: PRIORITIES[detailTask.priority].bg, color: PRIORITIES[detailTask.priority].color, fontWeight: 600 }}>{PRIORITIES[detailTask.priority].icon} {PRIORITIES[detailTask.priority].label}</span>
                      <span style={{ fontSize: 12, padding: "3px 9px", borderRadius: 20, background: cat.color + "22", color: cat.color, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>{getCatSvgIcon(cat.id, 12)} {cat.name}</span>
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
              <div className="modal" onClick={e => e.stopPropagation()} style={{ animation: closingModal ? "sheetSlideDown .3s cubic-bezier(.32,0,.64,0) forwards" : undefined }}>
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
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${noteForm.title || "Note"}</title><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 24px;line-height:1.8;color:#222}h1{font-size:26px;margin-bottom:4px}p{white-space:pre-wrap}img{max-width:100%;border-radius:8px;margin-top:16px}.meta{font-size:12px;color:#888;margin-bottom:24px;border-bottom:1px solid #eee;padding-bottom:12px}</style></head><body><h1>${noteForm.title || "Untitled"}</h1><div class="meta">${noteForm.category || ""} · ${noteForm.tags?.map(t => "#" + t).join(" ") || ""} · ${new Date().toLocaleDateString()}</div><p>${(noteForm.body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/_(.+?)_/g, "<em>$1</em>").replace(/^# (.+)$/gm, "<h2>$1</h2>").replace(/^## (.+)$/gm, "<h3>$1</h3>").replace(/^- \[ \] (.+)$/gm, "☐ $1").replace(/^• (.+)$/gm, "• $1")}</p>${noteForm.sketch ? `<img src="${noteForm.sketch}" alt="Sketch"/>` : ""}<div style="margin-top:40px;font-size:11px;color:#ccc;text-align:center">Generated by StaredList ✦</div></body></html>`;
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


          {/* == SHARE ACHIEVEMENT MODAL == */}
          {showShareModal && shareStats && (
            <div className="overlay" onClick={() => setShowShareModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, textAlign: "center" }}>
                <div className="drag" />
                <div style={{ padding: "24px 20px 20px" }}>
                  {/* Share Card Preview */}
                  <div style={{ background: "linear-gradient(135deg,#0a0a1a,#1a0a2e,#0d1a3e)", borderRadius: 20, padding: "24px 20px", marginBottom: 20, border: "1px solid #7c6dfa33" }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>✦</div>
                    <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 22, color: "#fff", marginBottom: 4 }}>StarredList</div>
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


          {/* ── HABIT DETAIL PANEL — top level, escapes all stacking contexts ── */}
          {showHabitDetail && (() => {
            const dHabit = habits.find(h => h.id === showHabitDetail);
            if (!dHabit) return null;
            const dStreak = getStreak(dHabit);
            const dBestStreak = getBestStreak(dHabit);
            const dDoneToday = !!dHabit.completions[todayStr()];
            const totalDone = Object.values(dHabit.completions || {}).filter(Boolean).length;
            const startDate = Object.keys(dHabit.completions || {}).filter(k => dHabit.completions[k]).sort()[0];
            const totalDays = startDate ? Math.ceil((new Date() - new Date(startDate)) / 86400000) + 1 : 0;
            const scorePct = totalDays > 0 ? Math.round((totalDone / totalDays) * 100) : 0;
            const allEvents = [];
            const sortedDates = Object.keys(dHabit.completions || {}).filter(k => dHabit.completions[k]).sort();
            // Show every completion date in the timeline
            sortedDates.forEach((d, i) => {
              const prev = sortedDates[i - 1];
              const next = sortedDates[i + 1];
              const gapBefore = prev ? (new Date(d) - new Date(prev)) / 86400000 : 999;
              const gapAfter = next ? (new Date(next) - new Date(d)) / 86400000 : 999;
              const isStreakStart = gapBefore > 1;
              const isToday = d === todayStr();
              let icon = "✅", label = "Completed", color = dHabit.color || "#7c6dfa", bold = false;
              if (isStreakStart && !next) { icon = "⭐"; label = "Completed"; bold = false; }
              else if (isStreakStart) { icon = "🏅"; label = "Streak started!"; color = "#ffd343"; bold = true; }
              else if (isToday && dStreak > 1) { icon = "🔥"; label = `${dStreak} day streak — keep going!`; color = "#ff9f43"; bold = true; }
              allEvents.push({ icon, label, date: d, color, bold });
            });
            if (startDate) allEvents.push({ icon: "🚩", label: "Habit Started", date: startDate, color: "var(--t2)", bold: false });
            Object.entries(dHabit.logs || {}).forEach(([date, logData]) => {
              if (Array.isArray(logData)) {
                logData.forEach(l => {
                  if (l.text || l.photo) allEvents.push({ type: "log", id: l.id, date, text: l.text, photo: l.photo, timestamp: l.timestamp });
                });
              } else if (logData.text || logData.photo) {
                allEvents.push({ type: "log", id: "old", date, text: logData.text, photo: logData.photo, timestamp: 0 });
              }
            });
            allEvents.sort((a, b) => {
              const dateDiff = new Date(b.date) - new Date(a.date);
              if (dateDiff !== 0) return dateDiff;
              if (a.timestamp && b.timestamp) return a.timestamp - b.timestamp;
              return 0;
            });
            const monthGroups = {};
            allEvents.forEach(ev => {
              const mo = new Date(ev.date).toLocaleDateString("en-US", { month: "long", year: "numeric" });
              if (!monthGroups[mo]) monthGroups[mo] = [];
              monthGroups[mo].push(ev);
            });
            const formatEvDate = d => new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
            return (
              <div key="habit-detail-toplevel" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 99999, display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideInRight .25s cubic-bezier(.32,.9,.46,1)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 18px 12px", flexShrink: 0, background: "var(--bg)", borderBottom: "1px solid var(--b1)", zIndex: 2 }}>
                  <button onClick={() => setShowHabitDetail(null)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--acc)", fontSize: 15, fontWeight: 600, cursor: "pointer", padding: "4px 0" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    Everyday
                  </button>

                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 20px 24px" }}>
                    <div style={{ width: 80, height: 80, borderRadius: 22, background: dHabit.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40, marginBottom: 14, boxShadow: `0 10px 32px ${dHabit.color}55` }}>{HABIT_ICON_MAP[dHabit.icon] || dHabit.icon}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--t1)", marginBottom: 10, letterSpacing: -.3 }}>{dHabit.name}</div>
                    <div style={{ background: dDoneToday ? dHabit.color + "18" : "var(--s2)", color: dDoneToday ? dHabit.color : "var(--t3)", border: `1px solid ${dDoneToday ? dHabit.color + "44" : "var(--b2)"}`, borderRadius: 24, padding: "5px 18px", fontSize: 13.5, fontWeight: 700 }}>{dDoneToday ? "Completed" : "Not done today"}</div>
                  </div>
                  <div style={{ margin: "0 16px 20px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "var(--s1)", borderRadius: 18, overflow: "hidden", border: "1px solid var(--b1)" }}>
                      {[{ label: "Current Streak", val: dStreak }, { label: "Best Streak", val: dBestStreak }, { label: "Score", val: `${scorePct}%` }].map((s, i) => (
                        <div key={s.label} style={{ padding: "18px 10px", textAlign: "center", borderLeft: i > 0 ? "1px solid var(--b1)" : "none" }}>
                          <div style={{ fontSize: 28, fontWeight: 800, color: "var(--t1)", lineHeight: 1 }}>{s.val}</div>
                          <div style={{ fontSize: 11.5, color: "var(--t3)", marginTop: 5, fontWeight: 500 }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10, padding: "0 16px 24px" }}>
                    <button onClick={() => { toggleHabit(dHabit.id, todayStr()); haptic("success"); }} style={{ height: 52, borderRadius: 16, background: dDoneToday ? dHabit.color : "var(--s2)", border: dDoneToday ? "none" : "1.5px solid var(--b2)", color: dDoneToday ? "#fff" : "var(--t1)", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all .2s", boxShadow: dDoneToday ? `0 6px 20px ${dHabit.color}55` : "none" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      {dDoneToday ? "Done ✓" : "Mark Done"}
                    </button>
                    <button onClick={() => { openHabitJourney(dHabit.id, todayStr()); }} style={{ height: 52, borderRadius: 16, background: "var(--s2)", border: "1.5px solid var(--b2)", color: "var(--t1)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                      Add Note
                    </button>
                    <button onClick={() => { openHabitJourney(dHabit.id, todayStr()); }} style={{ width: 52, height: 52, borderRadius: 16, background: "var(--s2)", border: "1.5px solid var(--b2)", color: "var(--t2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                    </button>
                  </div>
                  <div style={{ padding: "0 16px calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
                    {Object.keys(monthGroups).length === 0 && <div style={{ textAlign: "center", color: "var(--t3)", fontSize: 13, padding: "40px 0" }}>No activity yet. Start your streak! 🔥</div>}
                    {Object.keys(monthGroups).map(month => (
                      <div key={month} style={{ marginBottom: 28 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--t1)", marginBottom: 16, letterSpacing: -.1 }}>{month}</div>
                        <div style={{ position: "relative" }}>
                          <div style={{ position: "absolute", left: 19, top: 20, bottom: 20, width: 2, background: "var(--b2)", borderRadius: 1, zIndex: 0 }} />
                          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            {monthGroups[month].map((ev, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative", zIndex: 1 }}>
                                <div style={{ width: 40, height: 40, borderRadius: "50%", background: dHabit.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0, boxShadow: `0 2px 10px ${dHabit.color}44` }}>{HABIT_ICON_MAP[dHabit.icon] || dHabit.icon}</div>
                                {ev.type === "log" ? (
                                  <div style={{ flex: 1, background: "var(--s1)", borderRadius: 13, border: "1px solid var(--b1)", overflow: "visible", display: "flex", flexDirection: "column" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: (ev.text || ev.photo) ? "1px solid var(--b2)" : "none", background: dHabit.color + "11", borderTopLeftRadius: 13, borderTopRightRadius: 13 }}>
                                      <span style={{ fontSize: 14, fontWeight: 700, color: dHabit.color }}>{dHabit.name}</span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                        <span style={{ fontSize: 12, color: "var(--t3)", fontWeight: 500 }}>{formatEvDate(ev.date)}</span>
                                        {/* Dropdown Menu Toggle */}
                                        <div style={{ position: "relative" }}>
                                          <button onClick={(e) => { e.stopPropagation(); setOpenLogMenu(openLogMenu === ev.id ? null : ev.id); }} style={{ background: "var(--s2)", border: "none", color: "var(--t3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", transition: "all .15s", opacity: .8 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="12" r="2" /></svg>
                                          </button>
                                          {openLogMenu === ev.id && (
                                            <>
                                              <div onClick={(e) => { e.stopPropagation(); setOpenLogMenu(null); }} style={{ position: "fixed", inset: 0, zIndex: 99 }} />
                                              <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", right: 0, top: "110%", background: "var(--s1)", border: "1px solid var(--b2)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", padding: 6, zIndex: 100, minWidth: 120, animation: "su .2s cubic-bezier(.32,1.2,.64,1)" }}>
                                                {ev.photo && (
                                                  <button onClick={() => { setOpenLogMenu(null); setViewPhoto(ev.photo); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "none", border: "none", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, transition: "background .15s" }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                                    View
                                                  </button>
                                                )}
                                                <button onClick={() => { setOpenLogMenu(null); openHabitJourney(dHabit.id, ev.date, ev.id); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "none", border: "none", color: "var(--t1)", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, transition: "background .15s" }}>
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                                  Edit
                                                </button>
                                                <button onClick={() => { setOpenLogMenu(null); deleteHabitLog(dHabit.id, ev.date, ev.id); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "none", border: "none", color: "#ff6b6b", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8, transition: "background .15s", marginTop: 2 }}>
                                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                                                  Delete
                                                </button>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ padding: "14px" }}>
                                      {ev.text && <div style={{ fontSize: 14, color: "var(--t1)", lineHeight: 1.5, whiteSpace: "pre-wrap", marginBottom: ev.photo ? 12 : 0 }}>{ev.text}</div>}
                                      {ev.photo && <img src={ev.photo} alt="Note" style={{ width: "100%", borderRadius: 10, objectFit: "cover" }} />}
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ flex: 1, background: "var(--s1)", borderRadius: 13, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", border: "1px solid var(--b1)" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                                      <span style={{ fontSize: 17 }}>{ev.icon}</span>
                                      <span style={{ fontSize: 13.5, fontWeight: ev.bold ? 700 : 500, color: ev.bold ? ev.color : "var(--t2)" }}>{ev.label}</span>
                                    </div>
                                    <span style={{ fontSize: 12, color: "var(--t3)", flexShrink: 0, marginLeft: 8 }}>{formatEvDate(ev.date)}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ── JOURNEY PAGE — full screen slide-in ── */}
          {showHabitJourney && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "var(--bg)", zIndex: 100000, display: "flex", flexDirection: "column", animation: "slideInRight .2s cubic-bezier(.32,.9,.46,1)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "calc(env(safe-area-inset-top, 0px) + 12px) 18px 12px", borderBottom: "1px solid var(--b1)", background: "var(--bg)" }}>
                <button onClick={() => setShowHabitJourney(null)} style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--acc)", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  Back
                </button>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)" }}>Journey Log</div>
                <button onClick={saveHabitJourney} style={{ background: "none", border: "none", color: "var(--acc)", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>Save</button>
              </div>

              <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 100px", display: "flex", flexDirection: "column", gap: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: showHabitJourney.color + "22", color: showHabitJourney.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
                    {HABIT_ICON_MAP[habits.find(h => h.id === showHabitJourney.habitId)?.icon] || <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--t1)" }}>{showHabitJourney.habitName}</div>
                    <div style={{ fontSize: 13, color: "var(--t3)", fontWeight: 500 }}>{fmtDate(showHabitJourney.date)}</div>
                  </div>
                </div>

                <div>
                  <div className="f-lbl">Journal Note</div>
                  <textarea autoFocus value={showHabitJourney.text} onChange={e => setShowHabitJourney(p => ({ ...p, text: e.target.value }))} placeholder="How did you feel about this habit today?" style={{ width: "100%", minHeight: 120, background: "var(--s1)", border: "1px solid var(--b1)", borderRadius: 14, padding: 16, fontSize: 15, color: "var(--t1)", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5 }} />
                </div>

                <div>
                  <div className="f-lbl">Photo</div>
                  {showHabitJourney.photo ? (
                    <div style={{ position: "relative", width: "100%", borderRadius: 14, overflow: "hidden", border: "1px solid var(--b1)", background: "var(--s1)" }}>
                      <img src={showHabitJourney.photo} alt="" style={{ width: "100%", display: "block", objectFit: "cover" }} />
                      <button onClick={() => setShowHabitJourney(p => ({ ...p, photo: "" }))} style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,.6)", color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                  ) : (
                    <label style={{ width: "100%", height: 110, border: "2px dashed var(--b2)", borderRadius: 14, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--t3)", background: "var(--s1)", gap: 8, transition: "all .15s" }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t2)" }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                      </div>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>Tap to upload photo</span>
                      <input type="file" accept="image/*" onChange={handleHabitPhotoUpload} style={{ display: "none" }} />
                    </label>
                  )}
                </div>
              </div>
            </div>
          )}

        </>
      )}

      {/* Full-Screen Photo Viewer Overlay */}
      {viewPhoto && (
        <div onClick={() => setViewPhoto(null)} style={{ position: "fixed", inset: 0, zIndex: 999999, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(10px)", animation: "su .2s cubic-bezier(.32,1.2,.64,1)" }}>
          <img src={viewPhoto} alt="Full Screen Note" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 16, objectFit: "contain", boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setViewPhoto(null)} style={{ position: "absolute", top: 40, right: 30, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(10px)" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}
    </>
  );
}
