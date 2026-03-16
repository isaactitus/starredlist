  import { useState, useRef, useEffect, useCallback } from "react";

// ── Firebase via compat CDN scripts ──
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDF3hzM_MgycIhNo0-MSn8wXQUabfy74l4",
  authDomain: "taskflow-8a037.firebaseapp.com",
  projectId: "taskflow-8a037",
  storageBucket: "taskflow-8a037.firebasestorage.app",
  messagingSenderId: "684546629646",
  appId: "1:684546629646:web:cb3470ffb14f3bb45d5c5f"
};
function loadScript(src) {
  return new Promise((res,rej)=>{
    if(document.querySelector(`script[src="${src}"]`)){res();return;}
    const s=document.createElement("script");
    s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}
let _db=null, _auth=null;
async function getFirebase(){
  if(_db && _auth) return { db:_db, auth:_auth };
  try{
    await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js");
    await loadScript("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js");
    const fb=window.firebase;
    if(!fb) throw new Error("Firebase not on window");
    if(!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
    _db=fb.firestore();
    _auth=fb.auth();
    return { db:_db, auth:_auth };
  }catch(e){ console.error("Firebase error:",e); return null; }
}
async function getDB(){
  const fb = await getFirebase();
  return fb ? fb.db : null;
}

// ═══════════════════════════════════════════════════
//  TASKFLOW ULTIMATE  — All Features, No API Needed
// ═══════════════════════════════════════════════════

// ── Helpers ──────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2,10);
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
const fmtDateFull = d => d ? new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "";
const isOverdue = (due,done) => !done && due && new Date(due) < new Date();
const getDaysInMonth = (y,m) => new Date(y,m+1,0).getDate();
const getFirstDay = (y,m) => new Date(y,m,1).getDay();

// ── Translations ──────────────────────────────────
const LANGS = {
  en: { name:"English", flag:"🇬🇧", t:{
    appName:"Taskflow", tasks:"Tasks", add:"Add Task", done:"Done", active:"Active",
    overdue:"Overdue", total:"Total", today:"Today", starred:"Starred", assistant:"Assistant",
    stats:"Statistics", calendar:"Calendar", settings:"Settings", profiles:"Profiles",
    newTask:"New Task", editTask:"Edit Task", save:"Save", cancel:"Cancel",
    title:"Title", notes:"Notes", priority:"Priority", category:"Category", dueDate:"Due Date",
    tags:"Tags", subtasks:"Subtasks", photo:"Photo", recurring:"Recurring", reminder:"Reminder",
    high:"High", medium:"Medium", low:"Low", noTasks:"No tasks here!", addFirst:"Tap + to add your first task",
    completionRate:"Completion Rate", thisWeek:"This Week", byCategory:"By Category", byPriority:"By Priority",
    export:"Export", share:"Share", lock:"App Lock", theme:"Theme", language:"Language", sound:"Sound",
    notifications:"Notifications", profile:"Profile", switchProfile:"Switch Profile", newProfile:"New Profile",
    pinLock:"PIN Lock", enterPin:"Enter PIN", setPin:"Set PIN", wrongPin:"Wrong PIN, try again",
    unlock:"Unlock", confirmPin:"Confirm PIN", pinsNoMatch:"PINs don't match",
    daily:"Daily", weekly:"Weekly", monthly:"Monthly", never:"Never",
    accentColor:"Accent Color", darkMode:"Dark Mode", completed:"Completed",
  }},
  ar: { name:"العربية", flag:"🇸🇦", t:{
    appName:"تاسك فلو", tasks:"المهام", add:"إضافة مهمة", done:"منجز", active:"نشط",
    overdue:"متأخر", total:"المجموع", today:"اليوم", starred:"المميزة", assistant:"المساعد",
    stats:"الإحصائيات", calendar:"التقويم", settings:"الإعدادات", profiles:"الملفات",
    newTask:"مهمة جديدة", editTask:"تعديل المهمة", save:"حفظ", cancel:"إلغاء",
    title:"العنوان", notes:"ملاحظات", priority:"الأولوية", category:"الفئة", dueDate:"تاريخ الاستحقاق",
    tags:"الوسوم", subtasks:"المهام الفرعية", photo:"صورة", recurring:"متكرر", reminder:"تذكير",
    high:"عالي", medium:"متوسط", low:"منخفض", noTasks:"لا توجد مهام!", addFirst:"اضغط + لإضافة مهمة",
    completionRate:"معدل الإنجاز", thisWeek:"هذا الأسبوع", byCategory:"حسب الفئة", byPriority:"حسب الأولوية",
    export:"تصدير", share:"مشاركة", lock:"قفل التطبيق", theme:"المظهر", language:"اللغة", sound:"الصوت",
    notifications:"الإشعارات", profile:"الملف", switchProfile:"تبديل الملف", newProfile:"ملف جديد",
    pinLock:"قفل PIN", enterPin:"أدخل PIN", setPin:"تعيين PIN", wrongPin:"PIN خاطئ",
    unlock:"فتح", confirmPin:"تأكيد PIN", pinsNoMatch:"PINs لا تتطابق",
    daily:"يومي", weekly:"أسبوعي", monthly:"شهري", never:"أبداً",
    accentColor:"لون التمييز", darkMode:"الوضع الداكن", completed:"مكتمل",
  }},
  hi: { name:"हिन्दी", flag:"🇮🇳", t:{
    appName:"टास्कफ्लो", tasks:"कार्य", add:"कार्य जोड़ें", done:"पूर्ण", active:"सक्रिय",
    overdue:"विलंबित", total:"कुल", today:"आज", starred:"तारांकित", assistant:"सहायक",
    stats:"आँकड़े", calendar:"कैलेंडर", settings:"सेटिंग", profiles:"प्रोफाइल",
    newTask:"नया कार्य", editTask:"कार्य संपादित करें", save:"सहेजें", cancel:"रद्द करें",
    title:"शीर्षक", notes:"नोट्स", priority:"प्राथमिकता", category:"श्रेणी", dueDate:"नियत तिथि",
    tags:"टैग", subtasks:"उप-कार्य", photo:"फ़ोटो", recurring:"आवर्ती", reminder:"अनुस्मारक",
    high:"उच्च", medium:"मध्यम", low:"निम्न", noTasks:"यहाँ कोई कार्य नहीं!", addFirst:"+ दबाएं",
    completionRate:"पूर्णता दर", thisWeek:"इस सप्ताह", byCategory:"श्रेणी अनुसार", byPriority:"प्राथमिकता अनुसार",
    export:"निर्यात", share:"साझा करें", lock:"ऐप लॉक", theme:"थीम", language:"भाषा", sound:"ध्वनि",
    notifications:"सूचनाएं", profile:"प्रोफ़ाइल", switchProfile:"प्रोफ़ाइल बदलें", newProfile:"नया प्रोफ़ाइल",
    pinLock:"PIN लॉक", enterPin:"PIN दर्ज करें", setPin:"PIN सेट करें", wrongPin:"गलत PIN",
    unlock:"अनलॉक", confirmPin:"PIN पुष्टि करें", pinsNoMatch:"PIN मेल नहीं खाते",
    daily:"दैनिक", weekly:"साप्ताहिक", monthly:"मासिक", never:"कभी नहीं",
    accentColor:"एक्सेंट रंग", darkMode:"डार्क मोड", completed:"पूर्ण",
  }},
  fr: { name:"Français", flag:"🇫🇷", t:{
    appName:"Taskflow", tasks:"Tâches", add:"Ajouter", done:"Terminé", active:"Actif",
    overdue:"En retard", total:"Total", today:"Aujourd'hui", starred:"Favoris", assistant:"Assistant",
    stats:"Statistiques", calendar:"Calendrier", settings:"Paramètres", profiles:"Profils",
    newTask:"Nouvelle tâche", editTask:"Modifier", save:"Sauvegarder", cancel:"Annuler",
    title:"Titre", notes:"Notes", priority:"Priorité", category:"Catégorie", dueDate:"Échéance",
    tags:"Tags", subtasks:"Sous-tâches", photo:"Photo", recurring:"Récurrent", reminder:"Rappel",
    high:"Haute", medium:"Moyenne", low:"Basse", noTasks:"Aucune tâche!", addFirst:"Appuyez sur + pour ajouter",
    completionRate:"Taux de complétion", thisWeek:"Cette semaine", byCategory:"Par catégorie", byPriority:"Par priorité",
    export:"Exporter", share:"Partager", lock:"Verrouillage", theme:"Thème", language:"Langue", sound:"Son",
    notifications:"Notifications", profile:"Profil", switchProfile:"Changer profil", newProfile:"Nouveau profil",
    pinLock:"Verrou PIN", enterPin:"Entrer PIN", setPin:"Définir PIN", wrongPin:"PIN incorrect",
    unlock:"Déverrouiller", confirmPin:"Confirmer PIN", pinsNoMatch:"PINs différents",
    daily:"Quotidien", weekly:"Hebdo", monthly:"Mensuel", never:"Jamais",
    accentColor:"Couleur accent", darkMode:"Mode sombre", completed:"Complété",
  }},
  es: { name:"Español", flag:"🇪🇸", t:{
    appName:"Taskflow", tasks:"Tareas", add:"Agregar", done:"Hecho", active:"Activo",
    overdue:"Atrasado", total:"Total", today:"Hoy", starred:"Favoritos", assistant:"Asistente",
    stats:"Estadísticas", calendar:"Calendario", settings:"Ajustes", profiles:"Perfiles",
    newTask:"Nueva tarea", editTask:"Editar tarea", save:"Guardar", cancel:"Cancelar",
    title:"Título", notes:"Notas", priority:"Prioridad", category:"Categoría", dueDate:"Fecha límite",
    tags:"Etiquetas", subtasks:"Subtareas", photo:"Foto", recurring:"Recurrente", reminder:"Recordatorio",
    high:"Alta", medium:"Media", low:"Baja", noTasks:"¡Sin tareas!", addFirst:"Toca + para agregar",
    completionRate:"Tasa de completado", thisWeek:"Esta semana", byCategory:"Por categoría", byPriority:"Por prioridad",
    export:"Exportar", share:"Compartir", lock:"Bloqueo", theme:"Tema", language:"Idioma", sound:"Sonido",
    notifications:"Notificaciones", profile:"Perfil", switchProfile:"Cambiar perfil", newProfile:"Nuevo perfil",
    pinLock:"Bloqueo PIN", enterPin:"Ingresar PIN", setPin:"Establecer PIN", wrongPin:"PIN incorrecto",
    unlock:"Desbloquear", confirmPin:"Confirmar PIN", pinsNoMatch:"PINs no coinciden",
    daily:"Diario", weekly:"Semanal", monthly:"Mensual", never:"Nunca",
    accentColor:"Color de acento", darkMode:"Modo oscuro", completed:"Completado",
  }},
};

// ── Accent Colors ─────────────────────────────────
const ACCENTS = [
  {name:"Violet",  v:"#7c6dfa", g:"#b06dfa"},
  {name:"Teal",    v:"#00d4aa", g:"#0097ff"},
  {name:"Rose",    v:"#ff6b9d", g:"#ff4757"},
  {name:"Amber",   v:"#ffb347", g:"#ffd93d"},
  {name:"Sky",     v:"#38bdf8", g:"#818cf8"},
  {name:"Emerald", v:"#10b981", g:"#06d6a0"},
  {name:"Coral",   v:"#ff6b6b", g:"#ff8e53"},
  {name:"Indigo",  v:"#6366f1", g:"#8b5cf6"},
];

// ── Sound effects (Web Audio API) ─────────────────
const playSound = (type) => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    if (type==="complete") { o.frequency.setValueAtTime(523,ctx.currentTime); o.frequency.setValueAtTime(659,ctx.currentTime+0.1); o.frequency.setValueAtTime(784,ctx.currentTime+0.2); g.gain.setValueAtTime(0.3,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.5); o.start(); o.stop(ctx.currentTime+0.5); }
    else if (type==="add") { o.frequency.setValueAtTime(440,ctx.currentTime); o.frequency.setValueAtTime(554,ctx.currentTime+0.15); g.gain.setValueAtTime(0.2,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.4); o.start(); o.stop(ctx.currentTime+0.4); }
    else if (type==="delete") { o.frequency.setValueAtTime(300,ctx.currentTime); o.frequency.setValueAtTime(200,ctx.currentTime+0.1); g.gain.setValueAtTime(0.15,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3); o.start(); o.stop(ctx.currentTime+0.3); }
    else if (type==="tap") { o.frequency.setValueAtTime(800,ctx.currentTime); g.gain.setValueAtTime(0.1,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.1); o.start(); o.stop(ctx.currentTime+0.1); }
  } catch(e){}
};

// ── Ambient Music Engine (Web Audio API — no files needed) ────
const MUSIC_TRACKS = [
  {id:"lofi",    label:"Lo-Fi Chill",   icon:"🎵"},
  {id:"focus",   label:"Deep Focus",    icon:"🧠"},
  {id:"nature",  label:"Nature Sounds", icon:"🌿"},
  {id:"ambient", label:"Space Ambient", icon:"🌌"},
];
let _musicCtx = null, _musicNodes = [], _musicTrack = "lofi";
function startMusic(trackId) {
  stopMusic();
  try {
    _musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    _musicTrack = trackId;
    const ctx = _musicCtx;
    const master = ctx.createGain(); master.gain.value = 0.18; master.connect(ctx.destination);
    const reverb = ctx.createConvolver();
    // Simple impulse reverb
    const len = ctx.sampleRate * 2.5; const imp = ctx.createBuffer(2,len,ctx.sampleRate);
    for(let c=0;c<2;c++){const d=imp.getChannelData(c);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2.5);}
    reverb.buffer = imp; reverb.connect(master);
    const wet = ctx.createGain(); wet.gain.value = 0.4; wet.connect(reverb);
    const dry = ctx.createGain(); dry.gain.value = 0.6; dry.connect(master);

    if(trackId==="lofi"){
      // Lo-fi: gentle chord pads + soft bass drone
      const chords = [[261,329,392],[220,277,330],[174,220,262],[196,247,294]];
      let ci=0;
      const playChord = () => {
        if(!_musicCtx) return;
        const chord = chords[ci%chords.length]; ci++;
        chord.forEach((freq,i)=>{
          const o=ctx.createOscillator(); const g=ctx.createGain();
          o.type="triangle"; o.frequency.value=freq*(1+i*0.002);
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.12,ctx.currentTime+0.5);
          g.gain.linearRampToValueAtTime(0.09,ctx.currentTime+2.5); g.gain.linearRampToValueAtTime(0,ctx.currentTime+4);
          o.connect(g); g.connect(wet); g.connect(dry); o.start(); o.stop(ctx.currentTime+4.2);
          _musicNodes.push(o);
        });
        if(_musicCtx) setTimeout(playChord, 3800);
      };
      playChord();
      // Soft hi-hat rhythm
      const hihat = () => {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*0.05,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
        const src=ctx.createBufferSource(); const g=ctx.createGain();
        src.buffer=buf; g.gain.value=0.04; src.connect(g); g.connect(master); src.start();
        _musicNodes.push(src);
        if(_musicCtx) setTimeout(hihat, 480+Math.random()*120);
      };
      setTimeout(hihat, 1000);
    } else if(trackId==="focus"){
      // Deep focus: binaural-style steady drone
      const freqs=[110,165,220,330];
      freqs.forEach(f=>{
        const o=ctx.createOscillator(); const g=ctx.createGain();
        o.type="sine"; o.frequency.value=f; g.gain.value=0.06;
        const lfo=ctx.createOscillator(); const lfoG=ctx.createGain();
        lfo.frequency.value=0.05+Math.random()*0.1; lfoG.gain.value=0.02;
        lfo.connect(lfoG); lfoG.connect(g.gain); lfo.start();
        o.connect(g); g.connect(wet); g.connect(dry); o.start();
        _musicNodes.push(o,lfo);
      });
    } else if(trackId==="nature"){
      // Nature: wind noise + gentle bird-like tones
      const makeWind = () => {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*1.5,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
        const src=ctx.createBufferSource(); const filt=ctx.createBiquadFilter(); const g=ctx.createGain();
        src.buffer=buf; filt.type="bandpass"; filt.frequency.value=400+Math.random()*300; filt.Q.value=0.5;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.08,ctx.currentTime+0.4);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+1.5);
        src.connect(filt); filt.connect(g); g.connect(master); src.start();
        _musicNodes.push(src);
        if(_musicCtx) setTimeout(makeWind, 800+Math.random()*1200);
      };
      makeWind();
      // Bird chirps
      const chirp = () => {
        if(!_musicCtx) return;
        const o=ctx.createOscillator(); const g=ctx.createGain();
        const baseF=800+Math.random()*600;
        o.type="sine"; o.frequency.setValueAtTime(baseF,ctx.currentTime); o.frequency.linearRampToValueAtTime(baseF*1.3,ctx.currentTime+0.08); o.frequency.linearRampToValueAtTime(baseF,ctx.currentTime+0.15);
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.06,ctx.currentTime+0.03); g.gain.linearRampToValueAtTime(0,ctx.currentTime+0.2);
        o.connect(g); g.connect(dry); o.start(); o.stop(ctx.currentTime+0.22);
        _musicNodes.push(o);
        if(_musicCtx) setTimeout(chirp, 1500+Math.random()*3000);
      };
      setTimeout(chirp, 500);
    } else {
      // Space ambient: slow evolving pads
      const notes=[55,82,110,138,165];
      notes.forEach((f,i)=>{
        const o=ctx.createOscillator(); const g=ctx.createGain();
        o.type=i%2===0?"sine":"triangle"; o.frequency.value=f;
        const lfo=ctx.createOscillator(); const lg=ctx.createGain();
        lfo.frequency.value=0.02+i*0.01; lg.gain.value=f*0.015;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start();
        g.gain.value=0.05+Math.random()*0.04;
        o.connect(g); g.connect(wet); g.connect(dry); o.start();
        _musicNodes.push(o,lfo);
      });
    }
  } catch(e){ console.log("Music error:",e); }
}
function stopMusic(){
  try{ _musicNodes.forEach(n=>{try{n.stop();}catch{}}); }catch{}
  _musicNodes=[];
  try{ if(_musicCtx){_musicCtx.close();_musicCtx=null;} }catch{}
}


const DEFAULT_CATEGORIES = [
  {id:"work",    name:"Work",     icon:"💼", color:"#7c6dfa"},
  {id:"personal",name:"Personal", icon:"🏠", color:"#6bcb77"},
  {id:"health",  name:"Health",   icon:"💪", color:"#ff6b6b"},
  {id:"learning",name:"Learning", icon:"📚", color:"#ffd93d"},
  {id:"finance", name:"Finance",  icon:"💰", color:"#00d4aa"},
];
const EMOJI_LIST = ["💼","👤","💪","📚","💰","🎨","🛒","✈️","📌","🏠","🎯","⚡","🔥","🌟","🎵","🍕","🏋️","🌿","💡","🚀","❤️","🎮","📷","🏆","🌈","🧘","⚽","🎸"];
const COLOR_LIST = ["#7c8ff5","#f589a3","#6bcb77","#ffd93d","#00d4aa","#d47cff","#ff9f43","#48dbfb","#ff6b6b","#7c6dfa","#10b981","#f59e0b"];
const PRIORITIES = {high:{label:"High",color:"#ff6b6b",bg:"rgba(255,107,107,0.13)",icon:"🔴"},medium:{label:"Medium",color:"#ffd93d",bg:"rgba(255,217,61,0.13)",icon:"🟡"},low:{label:"Low",color:"#6bcb77",bg:"rgba(107,203,119,0.13)",icon:"🟢"}};
const INIT_TASKS = [];
const DEFAULT_PROFILES = [
  {id:"default", name:"My Profile", icon:"👤", color:"#7c6dfa"},
];

// ── CSS Factory ───────────────────────────────────
const makeCSS = (dark, accent, accent2, rtl) => `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --bg:${dark?"#07090f":"#f0f2f8"};
  --s1:${dark?"#0d1017":"#ffffff"};
  --s2:${dark?"#131720":"#f5f7ff"};
  --s3:${dark?"#1a2030":"#eaecf6"};
  --s4:${dark?"#212840":"#dde0ef"};
  --b1:${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)"};
  --b2:${dark?"rgba(255,255,255,0.11)":"rgba(0,0,0,0.13)"};
  --t1:${dark?"#e8eaf8":"#1a1d2e"};
  --t2:${dark?"#7880a0":"#5a6080"};
  --t3:${dark?"#3e4560":"#9099b8"};
  --acc:${accent};
  --acc2:${accent2};
  --accd:${accent}28;
  --glow:${accent}40;
  --red:#ff6b6b;--yellow:#ffd93d;--green:#6bcb77;
  --safe-b:env(safe-area-inset-bottom,0px);
}
html,body{height:100%;background:var(--bg);color:var(--t1);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;direction:${rtl?"rtl":"ltr"};}
button{cursor:pointer;border:none;background:none;font-family:inherit;color:inherit;}
input,textarea,select{font-family:inherit;color:inherit;background:none;border:none;outline:none;}
textarea{resize:none;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:transparent;}::-webkit-scrollbar-thumb{background:var(--s4);border-radius:4px;}
.shell{display:flex;height:100vh;overflow:hidden;}
/* SIDEBAR */
.sidebar{width:224px;flex-shrink:0;background:${dark?"rgba(13,16,23,0.82)":"rgba(255,255,255,0.82)"};backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-right:1px solid var(--b1);display:flex;flex-direction:column;padding:22px 0 16px;overflow-y:auto;transition:background .3s;position:relative;z-index:1;}
.logo{display:flex;align-items:center;gap:10px;padding:0 16px 22px;}
.logo-icon{width:36px;height:36px;background:linear-gradient(135deg,${accent},${accent2});border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 6px 20px var(--glow);flex-shrink:0;}
.logo-text{font-family:'Instrument Serif',serif;font-size:19px;}
.profile-bar{margin:0 10px 16px;background:var(--s2);border:1px solid var(--b1);border-radius:11px;padding:10px 12px;display:flex;align-items:center;gap:9px;cursor:pointer;transition:all .15s;}
.profile-bar:hover{border-color:var(--acc);}
.profile-avatar{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;}
.profile-name{font-size:13px;font-weight:600;flex:1;}
.profile-arrow{font-size:11px;color:var(--t3);}
.nav-group{padding:0 10px 4px;}
.nav-lbl{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--t3);padding:0 8px 7px;}
.nav-item{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;font-size:13px;color:var(--t2);cursor:pointer;transition:all .15s;margin-bottom:1px;}
.nav-item:hover{background:var(--s2);color:var(--t1);}
.nav-item.on{background:var(--accd);color:var(--acc2);font-weight:600;}
.nav-icon{font-size:15px;width:20px;text-align:center;flex-shrink:0;}
.nav-badge{margin-left:auto;font-size:10px;background:var(--s3);padding:2px 7px;border-radius:20px;color:var(--t3);}
.nav-item.on .nav-badge{background:${accent}30;color:var(--acc2);}
.nav-div{height:1px;background:var(--b1);margin:8px 16px;}
/* MAIN */
.main{flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0;background:${dark?"rgba(7,9,15,0.78)":"rgba(240,242,248,0.78)"};position:relative;z-index:1;}
.topbar{display:flex;align-items:center;gap:10px;padding:13px 18px;background:${dark?"rgba(13,16,23,0.75)":"rgba(255,255,255,0.75)"};backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-bottom:1px solid var(--b1);flex-shrink:0;position:relative;z-index:2;}
.menu-btn{width:36px;height:36px;border-radius:9px;background:var(--s2);display:none;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.topbar-title{font-family:'Instrument Serif',serif;font-size:18px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.search-wrap{display:flex;align-items:center;gap:7px;background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:0 12px;height:36px;transition:border-color .2s;flex:1;max-width:220px;}
.search-wrap:focus-within{border-color:var(--acc);}
.search-wrap input{flex:1;font-size:13px;min-width:0;}
.search-wrap input::placeholder{color:var(--t3);}
.tb-btn{width:36px;height:36px;border-radius:9px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:16px;transition:all .15s;flex-shrink:0;}
.tb-btn:hover{border-color:var(--acc);color:var(--acc);}
.add-btn{height:36px;padding:0 14px;background:var(--acc);border-radius:10px;font-size:13px;font-weight:600;color:#fff;display:flex;align-items:center;gap:5px;box-shadow:0 4px 14px var(--glow);transition:all .2s;flex-shrink:0;}
.add-btn:hover{background:var(--acc2);transform:translateY(-1px);}
/* CONTENT */
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 18px 90px;-webkit-overflow-scrolling:touch;min-height:0;background:transparent;}
/* STATS CARDS */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
.stat{background:var(--s1);border:1px solid var(--b1);border-radius:13px;padding:13px 14px 11px;transition:background .3s;}
.stat-val{font-family:'Instrument Serif',serif;font-size:28px;line-height:1;margin-bottom:3px;}
.stat-lbl{font-size:11px;color:var(--t3);font-weight:600;}
.stat-bar{height:3px;background:var(--s3);border-radius:2px;margin-top:9px;overflow:hidden;}
.stat-bar-f{height:100%;border-radius:2px;transition:width .8s ease;}
/* PROG CARD */
.prog-card{background:var(--s1);border:1px solid var(--b1);border-radius:13px;padding:14px 18px;display:flex;align-items:center;gap:14px;margin-bottom:16px;flex-wrap:wrap;}
.ring-svg{transform:rotate(-90deg);}
.ring-bg{fill:none;stroke:var(--s3);stroke-width:5;}
.ring-fg{fill:none;stroke:var(--acc);stroke-width:5;stroke-linecap:round;transition:stroke-dashoffset .9s ease;}
.prog-info{flex:1;min-width:130px;}
.prog-pct{font-family:'Instrument Serif',serif;font-size:24px;}
.prog-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.prio-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px;}
.pchip{font-size:10px;padding:3px 8px;border-radius:20px;font-weight:600;cursor:pointer;}
/* FILTER */
.filter-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}
.fchip{font-size:11.5px;padding:5px 11px;border-radius:20px;border:1px solid var(--b1);color:var(--t2);cursor:pointer;transition:all .15s;background:var(--s1);}
.fchip:hover{border-color:var(--acc);color:var(--acc);}
.fchip.on{background:var(--accd);border-color:var(--acc);color:var(--acc2);font-weight:600;}
/* TASK CARDS */
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.sec-title{font-size:12px;font-weight:700;color:var(--t2);display:flex;align-items:center;gap:7px;}
.view-row{display:flex;gap:5px;align-items:center;}
.vt-btn{width:28px;height:28px;border-radius:7px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--t3);transition:all .15s;}
.vt-btn.on{background:var(--accd);border-color:var(--acc);color:var(--acc);}
.sort-btn{font-size:11px;color:var(--t3);padding:4px 9px;background:var(--s2);border:1px solid var(--b1);border-radius:7px;}
.task-list{display:flex;flex-direction:column;gap:7px;}
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:9px;}
.task{background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:12px 13px;display:flex;align-items:flex-start;gap:10px;cursor:pointer;transition:all .2s;position:relative;overflow:hidden;}
.task::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px;opacity:0;transition:opacity .2s;}
.task:hover{border-color:var(--b2);transform:translateX(2px);}
.task:hover::before{opacity:1;}
.task.ph::before{background:var(--red);}.task.pm::before{background:var(--yellow);}.task.pl::before{background:var(--green);}
.task.done-t{opacity:.42;}.task.done-t .t-title{text-decoration:line-through;color:var(--t3);}
.task.ov-t{border-color:rgba(255,107,107,.22);}
.task-grid .task{flex-direction:column;gap:9px;}.task-grid .t-act{opacity:1;}
.chk{width:21px;height:21px;border:2px solid var(--s4);border-radius:6px;flex-shrink:0;margin-top:2px;display:flex;align-items:center;justify-content:center;transition:all .2s;background:var(--s2);}
.chk.on{background:var(--acc);border-color:var(--acc);}
.t-body{flex:1;min-width:0;}
.t-top{display:flex;align-items:flex-start;gap:7px;margin-bottom:4px;}
.t-title{font-size:13.5px;font-weight:600;line-height:1.4;flex:1;}
.t-star{font-size:13px;opacity:.35;flex-shrink:0;transition:opacity .2s;}
.t-star.lit{opacity:1;}
.t-note{font-size:11.5px;color:var(--t3);line-height:1.5;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.t-photo{width:100%;height:75px;object-fit:cover;border-radius:8px;margin-bottom:6px;border:1px solid var(--b1);}
.t-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;}
.tchip{font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;}
.t-date{font-size:10px;color:var(--t3);}
.t-date.ov{color:var(--red);}
.sub-prog{margin-top:5px;}
.sub-bar{height:3px;background:var(--s3);border-radius:2px;overflow:hidden;margin-bottom:2px;}
.sub-bar-f{height:100%;background:var(--acc);border-radius:2px;transition:width .4s;}
.sub-lbl{font-size:10px;color:var(--t3);}
.t-recur{font-size:10px;color:var(--t3);display:flex;align-items:center;gap:3px;}
.t-act{display:flex;gap:3px;margin-left:3px;flex-shrink:0;opacity:0;transition:opacity .2s;}
.task:hover .t-act{opacity:1;}
.ic-btn{width:27px;height:27px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .15s;color:var(--t3);}
.ic-btn:hover{background:var(--s3);color:var(--t1);}
.ic-btn.del:hover{background:rgba(255,107,107,.15);color:var(--red);}
.empty{text-align:center;padding:55px 20px;color:var(--t3);}
.empty-icon{font-size:44px;margin-bottom:12px;}
.empty-t{font-size:14px;color:var(--t2);margin-bottom:5px;font-weight:600;}
/* CHAT */
.chat-panel{width:290px;flex-shrink:0;background:${dark?"rgba(13,16,23,0.82)":"rgba(255,255,255,0.82)"};backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-left:1px solid var(--b1);display:flex;flex-direction:column;position:relative;z-index:1;}
.chat-head{padding:15px 15px 11px;border-bottom:1px solid var(--b1);}
.chat-head-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:2px;}
.chat-title{font-family:'Instrument Serif',serif;font-size:16px;display:flex;align-items:center;gap:7px;}
.offline-pill{font-size:9.5px;padding:2px 7px;border-radius:20px;font-weight:700;background:rgba(107,203,119,.15);color:var(--green);}
.chat-sub{font-size:11px;color:var(--t3);}
.chat-msgs{flex:1;overflow-y:auto;padding:11px 13px;display:flex;flex-direction:column;gap:8px;}
.msg{max-width:95%;}
.msg.u{align-self:flex-end;}.msg.a{align-self:flex-start;}
.bubble{padding:8px 11px;border-radius:11px;font-size:12px;line-height:1.6;white-space:pre-wrap;}
.msg.u .bubble{background:var(--acc);color:#fff;border-radius:11px 11px 3px 11px;font-weight:500;}
.msg.a .bubble{background:var(--s2);border:1px solid var(--b1);color:var(--t1);border-radius:11px 11px 11px 3px;}
.typing-b{display:flex;gap:4px;padding:2px 0;}
.tdot{width:5px;height:5px;background:var(--t3);border-radius:50%;animation:bop 1s infinite;}
.tdot:nth-child(2){animation-delay:.15s;}.tdot:nth-child(3){animation-delay:.3s;}
@keyframes bop{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
.chat-quick{padding:0 11px 7px;display:flex;flex-wrap:wrap;gap:4px;}
.qbtn{font-size:10.5px;padding:4px 8px;background:var(--s2);border:1px solid var(--b1);border-radius:20px;color:var(--t2);transition:all .15s;cursor:pointer;}
.qbtn:hover{border-color:var(--acc);color:var(--acc);}
.chat-inp{padding:8px 11px 22px;border-top:1px solid var(--b1);display:flex;gap:6px;align-items:flex-end;}
.chat-ta{flex:1;background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:7px 10px;font-size:12px;color:var(--t1);max-height:80px;line-height:1.45;transition:border-color .2s;}
.chat-ta:focus{border-color:var(--acc);}
.chat-ta::placeholder{color:var(--t3);}
.send-btn{width:32px;height:32px;background:var(--acc);border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.send-btn:hover{background:var(--acc2);}
.send-btn:disabled{opacity:.3;cursor:not-allowed;}
/* BOTTOM NAV */
.bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:${dark?"rgba(13,16,23,0.85)":"rgba(255,255,255,0.85)"};backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-top:1px solid var(--b1);z-index:50;padding:5px 0 calc(5px + var(--safe-b));}
.bot-inner{display:flex;align-items:center;justify-content:space-around;}
.bot-item{display:flex;flex-direction:column;align-items:center;gap:2px;font-size:9.5px;font-weight:600;color:var(--t3);cursor:pointer;padding:3px 8px;position:relative;}
.bot-item.on{color:var(--acc);}
.bot-icon{font-size:19px;transition:transform .2s;}
.bot-item.on .bot-icon{transform:translateY(-2px);}
.bot-num{position:absolute;top:0;right:2px;min-width:14px;height:14px;background:var(--red);border-radius:20px;font-size:8.5px;font-weight:800;color:#fff;display:flex;align-items:center;justify-content:center;padding:0 3px;}
.fab-wrap{display:flex;flex-direction:column;align-items:center;margin-top:-16px;}
.fab{width:50px;height:50px;background:linear-gradient(135deg,${accent},${accent2});border-radius:15px;box-shadow:0 6px 22px var(--glow);display:flex;align-items:center;justify-content:center;font-size:24px;color:#fff;font-weight:700;transition:all .2s;border:none;cursor:pointer;}
.fab:active{transform:scale(.95);}
.fab-lbl{font-size:9px;font-weight:600;color:var(--t3);margin-top:2px;}
/* MODAL */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.78);backdrop-filter:blur(7px);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:fo .2s;}
@keyframes fo{from{opacity:0}to{opacity:1}}
.modal{background:var(--s1);border:1px solid var(--b2);border-radius:22px 22px 0 0;width:100%;max-width:560px;max-height:94vh;overflow-y:auto;animation:su .25s ease;padding-bottom:calc(14px + var(--safe-b));transition:background .3s;}
.modal.center{align-self:center;border-radius:18px;max-width:400px;}
@keyframes su{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
.drag{width:36px;height:4px;background:var(--s4);border-radius:4px;margin:11px auto 3px;}
.m-head{padding:8px 20px 0;display:flex;align-items:center;justify-content:space-between;}
.m-title{font-family:'Instrument Serif',serif;font-size:19px;}
.m-body{padding:15px 20px 13px;display:flex;flex-direction:column;gap:13px;}
.f-lbl{font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.6px;text-transform:uppercase;margin-bottom:5px;}
.f-in{background:var(--s2);border:1px solid var(--b1);border-radius:11px;padding:9px 13px;font-size:13.5px;width:100%;color:var(--t1);transition:border-color .2s;}
.f-in:focus{border-color:var(--acc);}
.f-in::placeholder{color:var(--t3);}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
.m-foot{padding:0 20px;display:flex;gap:9px;}
.btn-c{flex:1;height:43px;background:var(--s2);border:1px solid var(--b1);border-radius:12px;font-size:13px;color:var(--t2);}
.btn-s{flex:2;height:43px;background:var(--acc);border-radius:12px;font-size:13px;font-weight:700;color:#fff;box-shadow:0 4px 14px var(--glow);}
.btn-s:disabled{opacity:.35;cursor:not-allowed;}
/* PHOTO */
.photo-up{background:var(--s2);border:2px dashed var(--b2);border-radius:12px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;}
.photo-up:hover{border-color:var(--acc);}
.photo-prev{width:100%;max-height:150px;object-fit:cover;border-radius:10px;}
/* SUBTASKS */
.sub-list{display:flex;flex-direction:column;gap:5px;margin-top:5px;}
.sub-row{display:flex;align-items:center;gap:7px;background:var(--s2);border-radius:8px;padding:6px 9px;}
.sub-chk{width:16px;height:16px;border:2px solid var(--s4);border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;}
.sub-chk.on{background:var(--acc);border-color:var(--acc);}
.sub-txt{flex:1;font-size:12px;}
.sub-txt.ds{text-decoration:line-through;color:var(--t3);}
/* TAGS */
.tags-wrap{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px;}
.tag-item{display:flex;align-items:center;gap:4px;font-size:10.5px;padding:3px 8px;border-radius:20px;background:var(--accd);color:var(--acc2);border:1px solid ${accent}30;}
/* SETTINGS PAGE */
.settings-page{padding:20px 18px 90px;}
.settings-section{background:var(--s1);border:1px solid var(--b1);border-radius:14px;overflow:hidden;margin-bottom:14px;}
.settings-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--b1);transition:background .15s;cursor:pointer;}
.settings-row:last-child{border-bottom:none;}
.settings-row:hover{background:var(--s2);}
.settings-icon{font-size:20px;width:36px;height:36px;border-radius:9px;background:var(--s2);display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.settings-label{flex:1;}
.settings-title{font-size:13.5px;font-weight:600;}
.settings-sub{font-size:11.5px;color:var(--t3);margin-top:2px;}
.settings-value{font-size:12.5px;color:var(--t2);}
.toggle{width:44px;height:24px;background:var(--s3);border-radius:12px;position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;}
.toggle.on{background:var(--acc);}
.toggle-knob{width:20px;height:20px;background:#fff;border-radius:50%;position:absolute;top:2px;left:2px;transition:left .2s;box-shadow:0 1px 4px rgba(0,0,0,.2);}
.toggle.on .toggle-knob{left:22px;}
/* STATS PAGE */
.stats-page{padding:20px 18px 90px;}
.chart-card{background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:18px;margin-bottom:14px;}
.chart-title{font-size:13px;font-weight:700;color:var(--t2);margin-bottom:14px;letter-spacing:.3px;}
.bar-chart{display:flex;align-items:flex-end;gap:8px;height:100px;}
.bar-col{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;}
.bar{width:100%;border-radius:6px 6px 0 0;transition:height .6s ease;min-height:4px;}
.bar-lbl{font-size:10px;color:var(--t3);text-align:center;}
.bar-val{font-size:10px;font-weight:700;color:var(--t2);}
.pie-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
.pie-legend{display:flex;flex-direction:column;gap:8px;flex:1;}
.pie-item{display:flex;align-items:center;gap:8px;font-size:12px;}
.pie-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;}
.pie-label{flex:1;color:var(--t2);}
.pie-count{font-weight:700;}
.streak-row{display:flex;gap:6px;flex-wrap:wrap;}
.streak-day{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10.5px;font-weight:700;}
/* CALENDAR PAGE */
.cal-page{padding:16px 18px 90px;}
.cal-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
.cal-month{font-family:'Instrument Serif',serif;font-size:20px;}
.cal-nav{width:34px;height:34px;border-radius:9px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:16px;}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:16px;}
.cal-day-name{text-align:center;font-size:11px;font-weight:700;color:var(--t3);padding:4px 0;}
.cal-cell{min-height:44px;border-radius:9px;padding:5px;cursor:pointer;transition:all .15s;position:relative;border:1px solid transparent;}
.cal-cell:hover{background:var(--s2);}
.cal-cell.today{border-color:var(--acc);background:var(--accd);}
.cal-cell.has-tasks{background:var(--s2);}
.cal-cell.selected{background:var(--acc);color:#fff;}
.cal-num{font-size:13px;font-weight:600;text-align:center;}
.cal-dots{display:flex;gap:2px;justify-content:center;margin-top:3px;flex-wrap:wrap;}
.cal-dot{width:5px;height:5px;border-radius:50%;}
.cal-task-list{background:var(--s1);border:1px solid var(--b1);border-radius:13px;padding:14px;}
.cal-task-title{font-size:13px;font-weight:700;color:var(--t2);margin-bottom:10px;}
/* PIN LOCK */
.pin-screen{position:fixed;inset:0;background:var(--bg);z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;}
.pin-icon{font-size:48px;}
.pin-title{font-family:'Instrument Serif',serif;font-size:24px;}
.pin-dots{display:flex;gap:14px;}
.pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid var(--b2);transition:all .2s;}
.pin-dot.filled{background:var(--acc);border-color:var(--acc);}
.pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
.pin-key{width:72px;height:72px;border-radius:18px;background:var(--s1);border:1px solid var(--b1);font-size:24px;font-weight:600;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .15s;user-select:none;}
.pin-key:hover{background:var(--s2);border-color:var(--acc);}
.pin-key:active{transform:scale(.93);}
.pin-error{color:var(--red);font-size:13px;font-weight:600;}
/* PROFILES */
.prof-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;}
.prof-card{background:var(--s2);border:2px solid var(--b1);border-radius:14px;padding:16px;text-align:center;cursor:pointer;transition:all .2s;}
.prof-card:hover,.prof-card.on{border-color:var(--acc);background:var(--accd);}
.prof-avatar{font-size:28px;margin-bottom:8px;}
.prof-name{font-size:13.5px;font-weight:700;}
.prof-count{font-size:11px;color:var(--t3);margin-top:3px;}
/* EXPORT */
.export-area{background:var(--s2);border:1px solid var(--b1);border-radius:11px;padding:14px;font-size:12px;font-family:monospace;color:var(--t2);white-space:pre-wrap;max-height:200px;overflow-y:auto;margin-bottom:12px;}
/* ACCENT PICKER */
.accent-grid{display:flex;gap:9px;flex-wrap:wrap;}
.accent-swatch{width:36px;height:36px;border-radius:50%;cursor:pointer;border:3px solid transparent;transition:all .2s;}
.accent-swatch.on{border-color:var(--t1);transform:scale(1.15);}
/* NOTIFICATION BADGE */
.notif-badge{position:fixed;top:16px;right:16px;background:var(--s1);border:1px solid var(--b1);border-radius:13px;padding:12px 16px;box-shadow:0 8px 30px rgba(0,0,0,.3);z-index:400;animation:slideIn .3s ease;max-width:280px;}
@keyframes slideIn{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
.notif-title{font-size:13px;font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:7px;}
.notif-body{font-size:12px;color:var(--t2);}
/* DOT */
.dot{width:6px;height:6px;border-radius:50%;background:var(--green);animation:blink 2s infinite;flex-shrink:0;}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
/* ── POMODORO ── */
.pomo-page{padding:20px 18px 90px;display:flex;flex-direction:column;align-items:center;gap:18px;}
.pomo-card{background:var(--s1);border:1px solid var(--b1);border-radius:20px;padding:28px 24px;width:100%;max-width:420px;display:flex;flex-direction:column;align-items:center;gap:16px;}
.pomo-ring{position:relative;display:flex;align-items:center;justify-content:center;}
.pomo-time{position:absolute;text-align:center;}
.pomo-mins{font-family:'Instrument Serif',serif;font-size:52px;line-height:1;letter-spacing:-2px;}
.pomo-secs{font-size:14px;color:var(--t3);margin-top:2px;}
.pomo-label{font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);}
.pomo-controls{display:flex;gap:10px;align-items:center;}
.pomo-btn{width:56px;height:56px;border-radius:16px;font-size:22px;display:flex;align-items:center;justify-content:center;transition:all .2s;}
.pomo-btn.main{background:linear-gradient(135deg,${accent},${accent2});color:#fff;box-shadow:0 6px 20px var(--glow);width:64px;height:64px;border-radius:18px;font-size:26px;}
.pomo-btn.sec{background:var(--s2);border:1px solid var(--b1);color:var(--t2);}
.pomo-btn:hover{transform:scale(1.06);}
.pomo-modes{display:flex;gap:8px;background:var(--s2);border-radius:12px;padding:4px;}
.pomo-mode{font-size:12px;font-weight:600;padding:6px 14px;border-radius:9px;cursor:pointer;color:var(--t2);transition:all .2s;}
.pomo-mode.on{background:var(--s1);color:var(--acc);box-shadow:0 2px 8px rgba(0,0,0,.1);}
.pomo-sessions{display:flex;gap:6px;}
.pomo-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--b2);transition:all .2s;}
.pomo-dot.done{background:var(--acc);border-color:var(--acc);}
.pomo-task-pick{width:100%;max-width:420px;}
.pomo-task-title{font-size:12px;font-weight:700;color:var(--t3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;}
.pomo-task-item{display:flex;align-items:center;gap:10px;padding:10px 13px;background:var(--s1);border:1px solid var(--b1);border-radius:11px;cursor:pointer;transition:all .15s;margin-bottom:6px;}
.pomo-task-item:hover,.pomo-task-item.on{border-color:var(--acc);background:var(--accd);}
.pomo-task-name{flex:1;font-size:13px;font-weight:600;}
.pomo-stats-row{display:flex;gap:8px;width:100%;max-width:420px;}
.pomo-stat{flex:1;background:var(--s1);border:1px solid var(--b1);border-radius:12px;padding:14px 10px;text-align:center;}
.pomo-stat-val{font-family:'Instrument Serif',serif;font-size:26px;color:var(--acc);}
.pomo-stat-lbl{font-size:10.5px;color:var(--t3);margin-top:2px;}
/* ── COLLAB / SHARE ── */
.collab-page{padding:20px 18px 90px;}
.collab-section{background:var(--s1);border:1px solid var(--b1);border-radius:14px;overflow:hidden;margin-bottom:14px;}
.collab-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--b1);}
.collab-row:last-child{border-bottom:none;}
.collab-avatar{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;}
.collab-name{font-size:13.5px;font-weight:600;}
.collab-sub{font-size:11.5px;color:var(--t3);margin-top:1px;}
.share-link-box{background:var(--s2);border:1px solid var(--b1);border-radius:10px;padding:11px 13px;font-size:12px;color:var(--t2);font-family:monospace;word-break:break-all;display:flex;align-items:center;gap:8px;cursor:pointer;transition:border-color .2s;}
.share-link-box:hover{border-color:var(--acc);}
.shared-task{background:var(--s1);border:1px solid var(--b1);border-radius:11px;padding:12px 14px;margin-bottom:7px;display:flex;align-items:center;gap:10px;}
.shared-badge{font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;background:rgba(107,203,119,.15);color:var(--green);flex-shrink:0;}
/* ── WIDGET ── */
.widget-page{padding:20px 18px 90px;}
.widget-preview-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px;}
.widget-card{background:var(--s1);border:1px solid var(--b1);border-radius:16px;padding:16px;cursor:pointer;transition:all .2s;position:relative;}
.widget-card:hover{border-color:var(--acc);transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,.15);}
.widget-card.selected{border-color:var(--acc);background:var(--accd);}
.widget-badge{position:absolute;top:10px;right:10px;font-size:9.5px;padding:2px 7px;border-radius:20px;font-weight:700;}
.widget-preview{border-radius:14px;overflow:hidden;margin-bottom:12px;border:1px solid var(--b1);}
.mini-widget{background:linear-gradient(135deg,${accent}22,${accent2}11);border-radius:13px;padding:14px;}
.mini-widget-title{font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px;}
.mini-widget-num{font-family:'Instrument Serif',serif;font-size:36px;color:var(--acc);line-height:1;}
.mini-widget-sub{font-size:11px;color:var(--t3);margin-top:3px;}
.mini-widget-bar{height:4px;background:rgba(255,255,255,.1);border-radius:2px;margin-top:10px;overflow:hidden;}
.mini-widget-bar-f{height:100%;border-radius:2px;background:linear-gradient(90deg,${accent},${accent2});}
.mini-task-widget{background:linear-gradient(135deg,${accent}22,${accent2}11);border-radius:13px;padding:14px;}
.mini-task-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);}
.mini-task-row:last-child{border-bottom:none;}
.mini-task-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.mini-task-text{font-size:11px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.install-card{background:var(--s1);border:1px solid var(--b1);border-radius:14px;padding:18px;margin-bottom:14px;}
.install-step{display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--b1);}
.install-step:last-child{border-bottom:none;}
.install-num{width:28px;height:28px;border-radius:8px;background:var(--accd);color:var(--acc);font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.install-text{font-size:13px;line-height:1.55;color:var(--t2);flex:1;}
.install-text strong{color:var(--t1);}
/* RESPONSIVE */
@media(max-width:920px){
  .sidebar,.chat-panel{display:none!important;}
  .menu-btn{display:flex!important;}
  .bot-nav{display:block!important;}
  .add-btn{display:none!important;}
  .search-wrap{max-width:none!important;}
  .content{padding:14px 14px 95px!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;}
  .t-act{opacity:1!important;}
  .task-grid{grid-template-columns:repeat(2,1fr)!important;}
}
@media(min-width:921px){
  .bot-nav{display:none!important;}
  .menu-btn{display:none!important;}
}
@media(max-width:440px){
  .row2{grid-template-columns:1fr!important;}
  .task-grid{grid-template-columns:1fr!important;}
  .stats-row{grid-template-columns:repeat(2,1fr)!important;}
  .prof-grid{grid-template-columns:1fr!important;}
  .pin-key{width:64px;height:64px;font-size:20px;}
}
`;

// ── Smart Bot ─────────────────────────────────────
function smartBot(input, tasks, cats, t) {
  const msg = input.toLowerCase().trim();
  const active = tasks.filter(x=>!x.done), done = tasks.filter(x=>x.done);
  const overdue = tasks.filter(x=>!x.done&&x.due&&new Date(x.due)<new Date());
  const high = active.filter(x=>x.priority==="high");
  const med = active.filter(x=>x.priority==="medium");
  const low = active.filter(x=>x.priority==="low");
  const dueToday = active.filter(x=>x.due===todayStr());
  const starred = active.filter(x=>x.starred);
  const pct = tasks.length ? Math.round((done.length/tasks.length)*100) : 0;

  // ── Greetings ──
  if (/^(hi|hey|hello|hii|helo|sup|yo|salaam|namaste|vanakkam|howdy|greetings|good morning|good evening|good afternoon)/.test(msg))
    return `Hey there! 👋 I'm Taskly Bot — your personal offline assistant!\n\n📊 Right now you have:\n• ${active.length} active tasks\n• ${done.length} completed\n• ${overdue.length} overdue\n• ${starred.length} starred\n\nAsk me anything! Try:\n💬 "Plan my day"\n💬 "How am I doing?"\n💬 "Give me a tip"\n💬 "What is Pomodoro?"\n💬 "How do I stay motivated?"`;

  // ── Progress & Status ──
  if (/(progress|how am i|status|doing|score|report)/.test(msg))
    return `${pct>=80?"🔥 You're crushing it!":pct>=60?"💪 Solid progress!":pct>=40?"📈 Getting there!":pct>=20?"🚀 Just getting started!":"✨ Let's get going!"}\n\n📊 Your stats:\n✅ ${pct}% completion rate\n✔️ ${done.length} tasks done\n⏳ ${active.length} still active\n${overdue.length>0?`⚠️ ${overdue.length} overdue — tackle these first!\n`:"🟢 No overdue tasks!\n"}🔴 ${high.length} high priority\n🟡 ${med.length} medium priority\n🟢 ${low.length} low priority\n\n${pct>=80?"Keep this up — you're building great habits!":"Every task you complete is a win. One step at a time!"}`;

  // ── What to do first / Priority ──
  if (/(first|priorit|urgent|focus|start|which task|what to do|important)/.test(msg)) {
    if(overdue.length>0) return `⚠️ Overdue tasks need your attention first!\n\nTop overdue:\n${overdue.slice(0,3).map((x,i)=>`${i+1}. "${x.title}"\n   Was due: ${x.due}`).join("\n")}\n\n💡 Clear overdue tasks before anything new. It frees mental load!`;
    if(high.length>0) return `🔴 Start with your HIGH priority tasks:\n\n${high.slice(0,4).map((x,i)=>`${i+1}. "${x.title}"${x.due?` — due ${x.due}`:""}`).join("\n")}\n\n💡 Pro tip: Do the hardest task first thing in the morning while your energy is highest.`;
    if(dueToday.length>0) return `📅 Focus on tasks due TODAY:\n\n${dueToday.map((x,i)=>`${i+1}. "${x.title}"`).join("\n")}\n\n⏰ You have ${dueToday.length} task${dueToday.length>1?"s":""} due today. Start now!`;
    if(starred.length>0) return `⭐ You've starred these — they must matter to you:\n\n${starred.slice(0,4).map((x,i)=>`${i+1}. "${x.title}"`).join("\n")}\n\n💡 Starred tasks = your personal priorities. Tackle them first!`;
    return active.length>0?`✅ No urgent tasks! You're in control.\n\nActive tasks:\n${active.slice(0,4).map((x,i)=>`${i+1}. [${x.priority.toUpperCase()}] "${x.title}"`).join("\n")}\n\n💡 Pick the one that creates the most value today.`:`🎉 All caught up! No active tasks. Time to add some new goals!`;
  }

  // ── Overdue ──
  if (/(overdue|late|missed|behind|past due)/.test(msg))
    return overdue.length===0?`✅ Amazing — no overdue tasks!\n\nYou're on top of your deadlines. Keep setting due dates to maintain this discipline!`:`⚠️ You have ${overdue.length} overdue task${overdue.length>1?"s":""}:\n\n${overdue.map((x,i)=>`${i+1}. "${x.title}"\n   Due was: ${x.due}`).join("\n")}\n\n💡 Strategy:\n• Do the oldest overdue task first\n• If it's too big, break it into subtasks\n• Reschedule if truly impossible\n• Don't ignore them — they pile up!`;

  // ── Today ──
  if (/(today|due today|today's task)/.test(msg))
    return dueToday.length===0?`📅 Nothing specifically due today!\n\nBut you have ${active.length} active tasks. Why not pick one and make today count? 💪`:`📅 Today's tasks (${dueToday.length}):\n\n${dueToday.map((x,i)=>`${i+1}. [${x.priority.toUpperCase()}] "${x.title}"`).join("\n")}\n\n⏰ Tip: Tackle high priority ones before 12pm when focus is sharpest.`;

  // ── Day plan ──
  if (/(plan my day|plan|my day|schedule|what should i|today plan|daily plan)/.test(msg)) {
    const parts=[];
    if(overdue.length>0) parts.push(`🚨 FIRST: Clear ${overdue.length} overdue task${overdue.length>1?"s":""} — "${overdue[0].title}"${overdue.length>1?" + more":""}`);
    if(dueToday.length>0) parts.push(`📅 TODAY: ${dueToday.slice(0,3).map(x=>'"'+x.title+'"').join(", ")}`);
    if(high.length>0) parts.push(`🔴 HIGH PRIORITY: "${high[0].title}"${high.length>1?` (+${high.length-1} more)`:""}`);
    if(med.length>0 && parts.length<4) parts.push(`🟡 MEDIUM: "${med[0].title}"${med.length>1?` (+${med.length-1} more)`:""}`);
    if(starred.length>0 && parts.length<4) parts.push(`⭐ STARRED: "${starred[0].title}"`);
    return parts.length?`📅 Your Day Plan:\n\n${parts.join("\n\n")}\n\n💡 Block time for each task. Single-task — no multitasking!\n🍅 Use Focus Timer for deep work sessions.`:`🎉 You have a clean slate today!\n\n${active.length>0?`Pick from your ${active.length} active tasks and make progress.`:"Add some tasks and start building momentum!"}`;
  }

  // ── Productivity tips ──
  if (/(tip|advice|productiv|hack|trick|better|improve|efficient)/.test(msg)) {
    const tips=[
      "🍅 Pomodoro Technique: Work 25 min, break 5 min, repeat 4x, then take a long break. Science-backed!",
      "🐸 Eat the Frog: Do your most dreaded task FIRST every morning. Everything else feels easy after.",
      "📵 Single-tasking wins: Turn off all notifications. Multitasking reduces productivity by 40%.",
      "✍️ Night planning: Spend 5 minutes each evening writing tomorrow's top 3 tasks. Wake up ready.",
      "🎯 2-minute rule: If a task takes less than 2 minutes, do it RIGHT NOW. Don't add it to your list.",
      "🧠 Brain dump: When overwhelmed, write down EVERY task on your mind. Then prioritize. Relief!",
      "📦 Batch similar tasks: Group emails, calls, errands together. Context-switching kills focus.",
      "⚡ Energy management: Match task difficulty to your energy level. Hard tasks when energized, easy ones when tired.",
      "🏆 Celebrate wins: After completing a hard task, take a 5-min reward break. Reinforces the habit.",
      "📊 Weekly review: Every Sunday, review what you did and plan the next week. 30 min = game changer.",
      "🚫 Learn to say no: Every 'yes' is a 'no' to something else. Protect your time fiercely.",
      "🌊 Flow state: Create a distraction-free environment. Put on focus music, close unnecessary tabs.",
    ];
    return tips[Math.floor(Math.random()*tips.length)]+"\n\n💬 Ask 'tip' again for another one!";
  }

  // ── Motivation ──
  if (/(motivat|inspire|boost|cheer|encourage|push me|lazy|procrastinat|stuck|can't start|cant start)/.test(msg)) {
    const quotes=[
      `💪 You've already completed ${done.length} tasks. That's real proof you CAN do hard things!\n\n🚀 The secret? Just start. Not perfectly — just start. 2 minutes of action beats 2 hours of thinking.`,
      `🔥 ${done.length>0?`${done.length} tasks done already — you're not lazy, you're human!`:"Every journey starts with step one."}\n\nProcrastination lies: it says "later will be easier." It won't. Start NOW, even imperfectly.`,
      `🌟 You have ${active.length} tasks waiting. Pick the smallest one and win a quick victory. Momentum builds!\n\n💡 "You don't have to be great to start, but you have to start to be great."`,
      `🧠 Your brain resists starting because it fears the task will be hard. But 80% of the time it's easier once you begin.\n\n⏱ Set a timer for just 10 minutes. That's all. Just 10 minutes on one task. Go!`,
    ];
    return quotes[Math.floor(Math.random()*quotes.length)];
  }

  // ── Stress / overwhelm ──
  if (/(stress|overwhelm|too much|too many|anxiety|panic|worried|anxious|burned out|burnout)/.test(msg))
    return `🌿 Take a breath. You've got this.\n\nWhen overwhelmed, here's what to do:\n\n1️⃣ PAUSE — Close your eyes, breathe slowly 5 times\n2️⃣ WRITE — List everything in your head. Get it out.\n3️⃣ PICK ONE — Just the single most important task\n4️⃣ START SMALL — Work just 10 minutes on it\n5️⃣ BUILD — Momentum will follow\n\n✅ You have ${active.length} tasks. You don't have to do them all today.\n\n💬 Use the Focus Timer (🧘) for calm, structured work sessions.`;

  // ── Pomodoro / Focus ──
  if (/(pomodoro|focus timer|focus mode|focus session|tomato timer|25 min)/.test(msg))
    return `🍅 Pomodoro Technique — Here's how it works:\n\n⏱ 25 min → Work on ONE task, no distractions\n☕ 5 min → Short break (stretch, water, breathe)\n🔁 Repeat 4 rounds\n🏖 30 min → Long break\n\n✅ Benefits:\n• Prevents mental fatigue\n• Makes big tasks feel manageable\n• Builds deep focus habits\n• Creates urgency (beats procrastination)\n\n💡 Open the Focus Timer (🧘) in the sidebar to use it right now!`;

  // ── Goals ──
  if (/(goal|goals|achieve|target|dream|aspire|ambition)/.test(msg))
    return `🏆 Goals are the engine behind great tasks!\n\nHow to set powerful goals in Taskflow:\n\n1️⃣ Go to Goals (🏆) in the sidebar\n2️⃣ Create a goal with a clear title & deadline\n3️⃣ Break it into milestones (smaller wins)\n4️⃣ Add tasks that connect to each milestone\n\n💡 SMART Goals rule:\n• Specific — "Run 5km" not "get fit"\n• Measurable — track numbers\n• Achievable — realistic but challenging\n• Relevant — matters to YOUR life\n• Time-bound — set a deadline\n\n💬 Try the 🤖 AI Breakdown button to auto-generate tasks for any goal!`;

  // ── Habits ──
  if (/(habit|routine|daily|streak|consistent|discipline)/.test(msg))
    return `🔁 Habits are the foundation of consistency!\n\nHabit tips:\n\n🎯 Start tiny: "Meditate 2 minutes" beats "meditate 1 hour"\n⚓ Habit stacking: Attach new habits to existing ones (e.g. "After I brush teeth, I read for 10 min")\n📅 Track streaks: Don't break the chain! Each day you do it, the habit gets stronger.\n🧠 The 21/66 rule: Takes 21 days to feel automatic, 66 days to truly stick.\n\n💡 Open Habits (🔁) in the sidebar to track your daily habits with streaks!`;

  // ── Time management ──
  if (/(time|manage time|time management|schedule|deadline|due date|calendar)/.test(msg))
    return `⏰ Time Management Masterclass:\n\n📋 Time Blocking: Assign tasks to specific time slots in your day\n🐸 Eat the Frog: Hardest task first when willpower is peak\n📵 Deep Work: 90-min focused sessions with zero interruptions\n🔄 Time Boxing: Give each task a fixed time limit\n📅 Weekly Planning: Every Sunday, map out the whole week\n\n💡 Taskflow tips:\n• Set due dates on every task\n• Use the Daily Planner (⏰) to schedule your day\n• Use Calendar (📆) to see the week at a glance\n• Use Focus Timer (🧘) for deep work`;

  // ── Sleep / health ──
  if (/(sleep|tired|rest|health|energy|eat|exercise|water|hydrat)/.test(msg))
    return `💤 Your productivity is powered by your health!\n\nFoundation habits:\n\n😴 Sleep 7-8 hours: Your brain consolidates memory and recharges during sleep. Non-negotiable.\n💧 Drink water: Even mild dehydration (2%) cuts concentration by 20%.\n🏃 Move daily: 20 min of walking boosts focus and mood for 2-3 hours.\n🥗 Eat well: High sugar = energy crash. Protein + complex carbs = sustained focus.\n☀️ Morning sunlight: 10 minutes outside resets your circadian rhythm.\n\n💡 Add these as Habits in the 🔁 Habits tracker!`;

  // ── Learning / studying ──
  if (/(learn|study|read|book|course|skill|knowledge|practice)/.test(msg))
    return `📚 Learning & Study Tips:\n\n🧠 Active recall: After reading, close the book and write what you remember. 50% better retention!\n🔁 Spaced repetition: Review notes at 1 day, 1 week, 1 month intervals.\n✍️ Feynman technique: Explain the concept as if to a child. Gaps = what you don't yet understand.\n📵 Remove distractions: Phone in another room = 26% improvement in focus.\n⏱ Pomodoro for studying: 25 min focused, 5 min break.\n🎯 One topic at a time: Finish before moving on.\n\n💡 Create learning tasks and add them to your Goals (🏆)!`;

  // ── List tasks ──
  if (/(list|show|all task|pending|what do i have|my tasks)/.test(msg))
    return active.length===0?`🎉 No active tasks! You're all clear.\n\nTap the + button to add new tasks and keep growing!`:`📋 Your active tasks (${active.length} total):\n\n${active.slice(0,8).map((x,i)=>`${i+1}. [${x.priority[0].toUpperCase()}] "${x.title}"${x.due?` — due ${x.due}`:""}`).join("\n")}${active.length>8?`\n\n...and ${active.length-8} more. See Tasks page!`:""}`;

  // ── Done / completed ──
  if (/(done|complet|finished|achiev)/.test(msg))
    return done.length===0?`⏳ No completed tasks yet — but that's about to change!\n\nMark your first task complete and feel the satisfaction 🎉`:`✅ You've completed ${done.length} tasks — incredible!\n\n${done.slice(0,5).map((x,i)=>`${i+1}. ✔️ "${x.title}"`).join("\n")}${done.length>5?`\n\n...and ${done.length-5} more wins!`:""}\n\n🏆 ${pct}% completion rate. ${pct>=80?"Outstanding! 🔥":pct>=50?"Keep pushing! 💪":"You're building momentum!"}`;

  // ── Stats / analytics ──
  if (/(stat|chart|analytic|number|count|how many)/.test(msg))
    return `📊 Your Quick Stats:\n\n📋 Total tasks: ${tasks.length}\n✅ Completed: ${done.length} (${pct}%)\n⏳ Active: ${active.length}\n⚠️ Overdue: ${overdue.length}\n⭐ Starred: ${starred.length}\n🔴 High priority: ${high.length}\n🟡 Medium priority: ${med.length}\n🟢 Low priority: ${low.length}\n\n📈 Visit Statistics (📊) in the sidebar for charts, bar graphs, streaks and more!`;

  // ── Settings / theme / wallpaper ──
  if (/(setting|theme|color|dark|light|wallpaper|customize|appearance)/.test(msg))
    return `⚙️ Customization Options:\n\n🌙 Dark/Light mode: Tap the sun/moon icon in the topbar\n🎨 Accent color: Settings → 8 beautiful color themes\n🖼 Wallpaper: Settings → 9 wallpapers (Sunset, Ocean, Forest, Aurora & more)\n🌍 Language: Settings → English, Arabic, Hindi, French, Spanish\n🔔 Notifications: Toggle reminders on/off\n🔒 PIN Lock: Secure your app with a 4-digit PIN\n\n💡 Wallpapers use glassmorphism — UI panels become beautifully transparent!`;

  // ── Bot features ──
  if (/(what can you do|help|feature|command|ask you|capabilities|ability)/.test(msg))
    return `🤖 I'm Taskly Bot! Here's what I can help with:\n\n📋 Tasks: "List my tasks", "What's overdue?", "What to do first?"\n📅 Planning: "Plan my day", "What's due today?"\n📊 Stats: "My progress", "How am I doing?"\n💪 Motivation: "Motivate me", "I'm stuck"\n🧠 Tips: "Give me a tip", "Productivity advice"\n📚 Guides: "What is Pomodoro?", "How to build habits?"\n😓 Wellness: "I'm overwhelmed", "Stress help"\n⏰ Time: "Time management tips"\n😴 Health: "Sleep tips", "Energy tips"\n\nAsk me anything — I work fully OFFLINE! 🔌`;

  // ── AI Breakdown ──
  if (/(ai|breakdown|break down|split|divide|subtask|ai help|smart task)/.test(msg))
    return `🤖 AI Task Breakdown:\n\nTap the 🤖 button in the top bar!\n\nHow it works:\n1. Type your goal (e.g. "Launch my app", "Learn guitar")\n2. AI instantly breaks it into 5-8 specific tasks\n3. Select the ones you want\n4. Add them all to your task list in one tap!\n\n✅ Works for ANY goal:\n• Fitness & health goals\n• Business & startup ideas\n• Learning new skills\n• Creative projects\n• Study plans\n\n💡 Even without internet, the offline AI generates smart task breakdowns!`;

  // ── Notes ──
  if (/(note|notes|write|jot|scratch|idea|reminder)/.test(msg))
    return `📝 Quick Notes feature:\n\nGo to Notes (📝) in the sidebar to:\n• Write quick ideas, reminders, anything\n• Organize with color coding (8 colors)\n• Pin important notes to the top\n• Edit or delete anytime\n\n💡 Notes are saved locally — they never disappear. Great for:\n• Ideas that pop up mid-task\n• Meeting notes\n• Grocery lists\n• Anything your brain wants to off-load!`;

  // ── Collaboration / Board ──
  if (/(collab|team|share|board|kanban|project|together|firebase|room)/.test(msg))
    return `👫 Collaboration Features:\n\n🗂 Project Board: Kanban-style board (Backlog → In Progress → Done)\n• Drag cards between columns\n• Add descriptions, priorities, assignees\n• Create custom columns\n\n🔥 Live Board Sync: Share a room code with teammates for real-time sync via Firebase!\n\n👫 Collaborate Page: Share tasks with others, see their progress\n\n💡 Perfect for remote teams or family task sharing!`;

  // ── Mood ──
  if (/(mood|feel|feeling|emotion|energy|vibe|how are you|wellness)/.test(msg))
    return `😊 Mood Tracker:\n\nVisit the Mood (😊) page to:\n• Log your daily mood (5 levels from Exhausted to Amazing)\n• Track energy patterns over time\n• See your 7-day mood chart\n• Build a mood logging streak\n\n💡 Why it matters:\n• Spot patterns (low mood on Mondays? Fridays are energized?)\n• Adjust workload based on energy\n• Celebrate positive days\n• Stay aware of burnout signals\n\nHow are YOU feeling right now? 😊`;

  // ── Default fallback — much richer ──
  const fallbacks=[
    `🤔 I didn't quite get that, but I'm here to help!\n\nTry asking:\n💬 "Plan my day"\n💬 "What's overdue?"\n💬 "Give me a productivity tip"\n💬 "What is Pomodoro?"\n💬 "I'm feeling overwhelmed"\n💬 "What can you do?"`,
    `🤖 Hmm, not sure about that one! But here's a random tip:\n\n${["🐸 Do your hardest task first thing in the morning.","🍅 Try 25-min Pomodoro sessions for deep focus.","✍️ Write tomorrow's top 3 tasks tonight before bed.","🎯 One task at a time — multitasking is a myth!","📵 Put your phone in another room while working."][Math.floor(Math.random()*5)]}\n\n💬 Type "help" to see everything I can do!`,
    `💬 I work best with questions like:\n• "What should I do first?"\n• "How am I doing?"\n• "Give me a tip"\n• "Plan my day"\n• "I'm stuck / overwhelmed"\n\nI'm fully offline and always ready! 🔌`,
  ];
  return fallbacks[Math.floor(Math.random()*fallbacks.length)];
}

// ═══════════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════════
const WALLPAPERS = [
  {id:"none",    label:"None",       gradient:"none",                                                          preview:"var(--bg)"},
  {id:"sunset",  label:"Sunset",     gradient:"linear-gradient(160deg,#1a0533 0%,#6b1a3a 40%,#ff6b35 100%)",  preview:"linear-gradient(160deg,#1a0533,#6b1a3a,#ff6b35)"},
  {id:"ocean",   label:"Ocean",      gradient:"linear-gradient(160deg,#0a0a2e 0%,#0d3b6e 50%,#00b4d8 100%)",  preview:"linear-gradient(160deg,#0a0a2e,#0d3b6e,#00b4d8)"},
  {id:"forest",  label:"Forest",     gradient:"linear-gradient(160deg,#0a1628 0%,#1a3a2a 50%,#2d7a4f 100%)",  preview:"linear-gradient(160deg,#0a1628,#1a3a2a,#2d7a4f)"},
  {id:"aurora",  label:"Aurora",     gradient:"linear-gradient(160deg,#050a14 0%,#0d2137 40%,#00c9a7 70%,#7c6dfa 100%)", preview:"linear-gradient(160deg,#050a14,#0d2137,#00c9a7,#7c6dfa)"},
  {id:"desert",  label:"Desert",     gradient:"linear-gradient(160deg,#1a0a00 0%,#8b3a00 50%,#ffd93d 100%)",  preview:"linear-gradient(160deg,#1a0a00,#8b3a00,#ffd93d)"},
  {id:"galaxy",  label:"Galaxy",     gradient:"linear-gradient(160deg,#000010 0%,#1a0040 40%,#4a0080 70%,#9b59b6 100%)", preview:"linear-gradient(160deg,#000010,#1a0040,#4a0080,#9b59b6)"},
  {id:"cherry",  label:"Cherry",     gradient:"linear-gradient(160deg,#1a0010 0%,#6b0028 50%,#ff6b9d 100%)",  preview:"linear-gradient(160deg,#1a0010,#6b0028,#ff6b9d)"},
  {id:"arctic",  label:"Arctic",     gradient:"linear-gradient(160deg,#0a1628 0%,#1a3a5c 50%,#a8d8ea 100%)",  preview:"linear-gradient(160deg,#0a1628,#1a3a5c,#a8d8ea)"},
];

export default function App() {
  // ── Settings ──
  const [dark, setDark] = useState(()=>{try{const s=localStorage.getItem("tf_dark");return s!==null?JSON.parse(s):true;}catch{return true;}});
  const [accentIdx, setAccentIdx] = useState(()=>{try{const s=localStorage.getItem("tf_accent");return s?JSON.parse(s):0;}catch{return 0;}});
  const [langKey, setLangKey] = useState(()=>{try{const s=localStorage.getItem("tf_lang");return s||"en";}catch{return "en";}});
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(false);
  const [musicTrack, setMusicTrack] = useState("lofi");
  const musicRef = useRef(null);

  useEffect(()=>{
    if(musicOn){ startMusic(musicTrack); }
    else { stopMusic(); }
    return ()=>stopMusic();
  },[musicOn, musicTrack]);
  const [notifsOn, setNotifsOn] = useState(true);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [locked, setLocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinMode, setPinMode] = useState(null); // "set"|"confirm"|"unlock"
  const [pinTemp, setPinTemp] = useState("");

  // ── Data ──
  const [tasks, setTasks] = useState(()=>{try{const s=localStorage.getItem("tf_tasks");return s?JSON.parse(s):INIT_TASKS;}catch{return INIT_TASKS;}});
  const [categories, setCategories] = useState(()=>{try{const s=localStorage.getItem("tf_cats");return s?JSON.parse(s):DEFAULT_CATEGORIES;}catch{return DEFAULT_CATEGORIES;}});
  const [profiles, setProfiles] = useState(()=>{try{const s=localStorage.getItem("tf_profiles");return s?JSON.parse(s):DEFAULT_PROFILES;}catch{return DEFAULT_PROFILES;}});
  const [activeProfile, setActiveProfile] = useState("p1");

  // ── Navigation ──
  const [tab, setTab] = useState("tasks");
  const [viewMode, setViewMode] = useState("list");
  const [sort, setSort] = useState("created");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showStarred, setShowStarred] = useState(false);

  // ── Modals ──
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTaskObj, setEditTaskObj] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);

  // ── Calendar ──
  const now = new Date(); const [calYear, setCalYear] = useState(now.getFullYear()); const [calMonth, setCalMonth] = useState(now.getMonth()); const [selDate, setSelDate] = useState(todayStr());

  // ── Notification ──
  const [notif, setNotif] = useState(null);

  // ── Task form ──
  const blankForm = {title:"",notes:"",priority:"medium",categoryId:"work",due:"",photo:null,tags:[],subtasks:[],starred:false,recurring:"never",reminder:false,reminderTime:"09:00",reminderDate:"",profileId:activeProfile};
  const [form, setForm] = useState(blankForm);
  const [tagInput, setTagInput] = useState(""); const [subInput, setSubInput] = useState("");

  // ── Cat form ──
  const [catForm, setCatForm] = useState({name:"",icon:"🎯",color:"#7c6dfa"});

  // ── Profile form ──
  const [profForm, setProfForm] = useState({name:"",icon:"👤",color:"#7c6dfa"});

  const fileRef = useRef(null);
  const t = LANGS[langKey]?.t || LANGS.en.t;
  const accent = ACCENTS[accentIdx];

  // ── Notification helper ──
  const showNotif = useCallback((title, body) => {
    if (!notifsOn) return;
    setNotif({title,body});
    setTimeout(()=>setNotif(null), 3500);
  },[notifsOn]);

  // ── Check due tasks on load ──
  useEffect(()=>{
    if (notifsOn) {
      const due = tasks.filter(t=>!t.done&&t.reminder&&t.due===todayStr());
      if (due.length > 0) setTimeout(()=>showNotif("📅 Tasks Due Today", `${due[0].title}${due.length>1?` +${due.length-1} more`:""}`)  ,1500);
    }
  },[]);

  const play = (s) => { if(soundOn) playSound(s); };

  // ── Task CRUD ──
  const profileTasks = tasks.filter(t=>t.profileId===activeProfile);

  const openAdd = () => { setForm({...blankForm,profileId:activeProfile}); setTagInput(""); setSubInput(""); setEditTaskObj(null); setShowTaskModal(true); play("tap"); };
  const openEdit = (task,e) => { if(e)e.stopPropagation(); setForm({title:task.title,notes:task.notes,priority:task.priority,categoryId:task.categoryId,due:task.due,photo:task.photo,tags:[...task.tags],subtasks:task.subtasks.map(s=>({...s})),starred:task.starred,recurring:task.recurring||"never",reminder:task.reminder||false,profileId:task.profileId}); setTagInput(""); setSubInput(""); setEditTaskObj(task); setShowTaskModal(true); play("tap"); };
  const saveTask = () => {
    if(!form.title.trim()) return;
    if(editTaskObj) { setTasks(ts=>ts.map(t=>t.id===editTaskObj.id?{...t,...form}:t)); showNotif("✅ Task Updated",form.title); }
    else { setTasks(ts=>[{id:uid(),...form,done:false,createdAt:Date.now()},...ts]); showNotif("➕ Task Added",form.title); play("add"); }
    setShowTaskModal(false);
  };
  const toggle = (id,e) => { if(e)e.stopPropagation(); const task=tasks.find(t=>t.id===id); if(!task)return; const nd=!task.done; if(nd){play("complete");showNotif("🎉 Task Completed!",task.title);} setTasks(ts=>ts.map(t=>t.id===id?{...t,done:nd}:t)); };
  const del = (id,e) => { if(e)e.stopPropagation(); play("delete"); setTasks(ts=>ts.filter(t=>t.id!==id)); };
  const star = (id,e) => { if(e)e.stopPropagation(); play("tap"); setTasks(ts=>ts.map(t=>t.id===id?{...t,starred:!t.starred}:t)); };
  const toggleSub = (tid,sid) => setTasks(ts=>ts.map(t=>t.id===tid?{...t,subtasks:t.subtasks.map(s=>s.id===sid?{...s,done:!s.done}:s)}:t));

  const handlePhoto = (e) => { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=(ev)=>setForm(fm=>({...fm,photo:ev.target.result})); r.readAsDataURL(f); };
  const addTag = () => { const v=tagInput.trim().replace(/^#/,""); if(!v||form.tags.includes(v))return; setForm(f=>({...f,tags:[...f.tags,v]})); setTagInput(""); };
  const addSub = () => { const v=subInput.trim(); if(!v)return; setForm(f=>({...f,subtasks:[...f.subtasks,{id:uid(),text:v,done:false}]})); setSubInput(""); };

  // ── Categories ──
  const getCat = (id) => categories.find(c=>c.id===id)||categories[categories.length-1];
  const saveCat = () => { if(!catForm.name.trim())return; setCategories(cs=>[...cs,{id:uid(),...catForm}]); setCatForm({name:"",icon:"🎯",color:"#7c6dfa"}); setShowCatModal(false); play("add"); };

  // ── Profiles ──
  const saveProfile = () => { if(!profForm.name.trim())return; const nid=uid(); setProfiles(ps=>[...ps,{id:nid,...profForm}]); setActiveProfile(nid); setProfForm({name:"",icon:"👤",color:"#7c6dfa"}); setShowProfileModal(false); play("add"); };

  // ── PIN ──
  const handlePinKey = (k) => {
    if(pinMode==="unlock") {
      const np=pinInput+k; setPinInput(np); setPinError("");
      if(np.length===4){if(np===pin){setLocked(false);setPinInput("");}else{setPinError(t.wrongPin);setTimeout(()=>setPinInput(""),600);}}
    } else if(pinMode==="set") {
      const np=pinInput+k; setPinInput(np);
      if(np.length===4){setPinTemp(np);setPinInput("");setPinMode("confirm");}
    } else if(pinMode==="confirm") {
      const np=pinInput+k; setPinInput(np); setPinError("");
      if(np.length===4){if(np===pinTemp){setPin(np);setPinEnabled(true);setLocked(false);setShowPinModal(false);setPinInput("");setPinMode(null);showNotif("🔒 PIN Set","Your app is now protected");}else{setPinError(t.pinsNoMatch);setTimeout(()=>setPinInput(""),600);}}
    }
  };
  const handlePinDel = () => setPinInput(p=>p.slice(0,-1));

  // ── Export ──
  const exportData = () => JSON.stringify({tasks:profileTasks,categories,profiles,exportDate:new Date().toISOString()},null,2);
  const shareData = () => { if(navigator.share){navigator.share({title:"Taskflow Export",text:exportData()});}else{navigator.clipboard?.writeText(exportData()); showNotif("📋 Copied!","Task data copied to clipboard");} };

  // ── Computed ──
  const total=profileTasks.length, doneCount=profileTasks.filter(t=>t.done).length;
  const activeCount=total-doneCount, overdueCount=profileTasks.filter(t=>isOverdue(t.due,t.done)).length;
  const pct=total?Math.round((doneCount/total)*100):0;
  const C=2*Math.PI*22, dash=C-(pct/100)*C;

  const viewTasks = profileTasks.filter(t=>{
    if(showStarred&&!t.starred)return false;
    if(showDone!==t.done)return false;
    if(filterCat!=="all"&&t.categoryId!==filterCat)return false;
    if(search&&!t.title.toLowerCase().includes(search.toLowerCase())&&!t.tags.some(tg=>tg.includes(search.toLowerCase())))return false;
    return true;
  }).sort((a,b)=>{
    if(sort==="priority"){const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];}
    if(sort==="due"){if(!a.due)return 1;if(!b.due)return -1;return new Date(a.due)-new Date(b.due);}
    if(sort==="alpha")return a.title.localeCompare(b.title);
    return b.createdAt-a.createdAt;
  });

  const curProfile = profiles.find(p=>p.id===activeProfile)||profiles[0];

  // ── Task Card ──
  const TaskCard = ({task}) => {
    const cat=getCat(task.categoryId);
    const ds=task.subtasks.filter(s=>s.done).length;
    const sp=task.subtasks.length?(ds/task.subtasks.length)*100:0;
    return (
      <div className={`task p${task.priority[0]} ${task.done?"done-t":""} ${isOverdue(task.due,task.done)?"ov-t":""}`} onClick={()=>{setDetailTaskId(task.id);setShowDetail(true);}}>
        <div className={`chk ${task.done?"on":""}`} onClick={e=>toggle(task.id,e)}>{task.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}</div>
        <div className="t-body">
          <div className="t-top">
            <div className="t-title">{task.title}</div>
            <span className={`t-star ${task.starred?"lit":""}`} onClick={e=>star(task.id,e)}>⭐</span>
          </div>
          {task.photo&&<img src={task.photo} className="t-photo" alt=""/>}
          {task.notes&&<div className="t-note">{task.notes}</div>}
          <div className="t-meta">
            <span className="tchip" style={{color:PRIORITIES[task.priority].color,background:PRIORITIES[task.priority].bg,border:`1px solid ${PRIORITIES[task.priority].color}28`}}>{PRIORITIES[task.priority].icon}</span>
            <span className="tchip" style={{background:cat.color+"22",color:cat.color,border:`1px solid ${cat.color}33`}}>{cat.icon} {cat.name}</span>
            {task.tags.slice(0,2).map(tg=><span key={tg} className="tchip" style={{background:"var(--s2)",color:"var(--t2)",border:"1px solid var(--b1)"}}>#{tg}</span>)}
            {task.due&&<span className={`t-date ${isOverdue(task.due,task.done)?"ov":""}`}>{isOverdue(task.due,task.done)?"⚠ ":"◷ "}{fmtDate(task.due)}</span>}
            {task.recurring&&task.recurring!=="never"&&<span className="t-recur">🔄 {task.recurring}</span>}
            {task.reminder&&<span className="t-recur">🔔</span>}
          </div>
          {task.subtasks.length>0&&<div className="sub-prog"><div className="sub-bar"><div className="sub-bar-f" style={{width:`${sp}%`}}/></div><div className="sub-lbl">{ds}/{task.subtasks.length} subtasks</div></div>}
        </div>
        <div className="t-act" onClick={e=>e.stopPropagation()}>
          <button className="ic-btn" onClick={e=>openEdit(task,e)}>✎</button>
          <button className="ic-btn del" onClick={e=>del(task.id,e)}>✕</button>
        </div>
      </div>
    );
  };

  // ── Pages ──
  const TasksPage = () => (
    <div className="content">
      <div className="stats-row">
        {[{lbl:t.total,val:total,fill:accent.v,p:100},{lbl:t.done,val:doneCount,fill:"#6bcb77",p:pct},{lbl:t.active,val:activeCount,fill:"#ffd93d",p:total?(activeCount/total)*100:0},{lbl:t.overdue,val:overdueCount,fill:"#ff6b6b",p:total?(overdueCount/total)*100:0}].map(s=>(
          <div className="stat" key={s.lbl}>
            <div className="stat-val" style={{color:s.fill}}>{s.val}</div>
            <div className="stat-lbl">{s.lbl}</div>
            <div className="stat-bar"><div className="stat-bar-f" style={{width:`${s.p}%`,background:s.fill}}/></div>
          </div>
        ))}
      </div>
      <div className="prog-card">
        <svg width="54" height="54" className="ring-svg" viewBox="0 0 54 54"><circle className="ring-bg" cx="27" cy="27" r="22"/><circle className="ring-fg" cx="27" cy="27" r="22" strokeDasharray={C} strokeDashoffset={dash}/></svg>
        <div className="prog-info">
          <div className="prog-pct">{pct}% {t.completed}</div>
          <div className="prog-sub">{doneCount} of {total} tasks</div>
          <div className="prio-chips">{Object.entries(PRIORITIES).map(([k,v])=><span key={k} className="pchip" style={{color:v.color,background:v.bg,border:`1px solid ${v.color}28`}}>{profileTasks.filter(x=>x.priority===k&&!x.done).length} {v.icon}</span>)}</div>
        </div>
      </div>
      <div className="filter-bar">
        <span className={`fchip ${!showDone&&!showStarred?"on":""}`} onClick={()=>{setShowDone(false);setShowStarred(false);}}>○ {t.active}</span>
        <span className={`fchip ${showDone?"on":""}`} onClick={()=>{setShowDone(true);setShowStarred(false);}}>✓ {t.done}</span>
        <span className={`fchip ${showStarred?"on":""}`} onClick={()=>{setShowStarred(true);setShowDone(false);}}>⭐ {t.starred}</span>
        {categories.map(c=><span key={c.id} className={`fchip ${filterCat===c.id?"on":""}`} onClick={()=>setFilterCat(fc=>fc===c.id?"all":c.id)}>{c.icon} {c.name}</span>)}
      </div>
      <div className="sec-head">
        <div className="sec-title">{showStarred?"⭐":showDone?"✓":"○"} {t.tasks} ({viewTasks.length})</div>
        <div className="view-row">
          <div style={{display:"flex",gap:3}}><button className={`vt-btn ${viewMode==="list"?"on":""}`} onClick={()=>setViewMode("list")}>☰</button><button className={`vt-btn ${viewMode==="grid"?"on":""}`} onClick={()=>setViewMode("grid")}>⊞</button></div>
          <button className="sort-btn" onClick={()=>setSort(s=>({created:"priority",priority:"due",due:"alpha",alpha:"created"}[s]))}>↕ {sort==="created"?"Recent":sort==="priority"?"Priority":sort==="due"?"Due":"A–Z"}</button>
        </div>
      </div>
      {viewTasks.length===0
        ?<div className="empty"><div className="empty-icon">{showDone?"🎉":"✦"}</div><div className="empty-t">{t.noTasks}</div><div className="empty-t" style={{fontSize:12,color:"var(--t3)"}}>{t.addFirst}</div></div>
        :<div className={viewMode==="grid"?"task-grid":"task-list"}>{viewTasks.map(task=><TaskCard key={task.id} task={task}/>)}</div>
      }
    </div>
  );

  const StatsPage = () => {
    const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });
    const weekData = weekDays.map(d=>({ day:new Date(d).toLocaleDateString("en-US",{weekday:"short"}), done:profileTasks.filter(x=>x.done&&x.due===d).length, added:profileTasks.filter(x=>x.createdAt&&new Date(x.createdAt).toISOString().split("T")[0]===d).length }));
    const maxBar = Math.max(...weekData.map(d=>d.done+d.added),1);
    const byCategory = categories.map(c=>({...c,count:profileTasks.filter(x=>!x.done&&x.categoryId===c.id).length})).filter(c=>c.count>0);
    const totalCat = byCategory.reduce((a,b)=>a+b.count,0)||1;
    const streakDays = Array.from({length:14},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-13+i); const ds=d.toISOString().split("T")[0]; return { date:ds, day:d.toLocaleDateString("en-US",{weekday:"short"}), hasDone:profileTasks.some(x=>x.done&&x.due===ds), isToday:ds===todayStr() }; });
    return (
      <div className="stats-page">
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:16}}>{t.stats}</div>
        {/* Summary */}
        <div className="chart-card">
          <div className="chart-title">📊 Overall Summary</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
            {[{lbl:"Total",val:total,color:accent.v},{lbl:"Completed",val:doneCount,color:"#6bcb77"},{lbl:"Completion %",val:pct+"%",color:accent.v}].map(s=>(
              <div key={s.lbl} style={{background:"var(--s2)",borderRadius:10,padding:"12px 10px",textAlign:"center"}}>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:s.color}}>{s.val}</div>
                <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>{s.lbl}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Weekly bar */}
        <div className="chart-card">
          <div className="chart-title">📅 {t.thisWeek} — Tasks Done</div>
          <div className="bar-chart">
            {weekData.map((d,i)=>(
              <div key={i} className="bar-col">
                <div className="bar-val">{d.done||""}</div>
                <div className="bar" style={{height:`${(d.done/maxBar)*80+4}px`,background:`linear-gradient(180deg,${accent.v},${accent.g})`}}/>
                <div className="bar-lbl">{d.day}</div>
              </div>
            ))}
          </div>
        </div>
        {/* By Category */}
        <div className="chart-card">
          <div className="chart-title">📁 {t.byCategory}</div>
          <div className="pie-row">
            <div className="pie-legend">
              {byCategory.map(c=>(
                <div key={c.id} className="pie-item">
                  <div className="pie-dot" style={{background:c.color}}/>
                  <span className="pie-label">{c.icon} {c.name}</span>
                  <span className="pie-count" style={{color:c.color}}>{c.count}</span>
                  <span style={{fontSize:10,color:"var(--t3)",marginLeft:4}}>{Math.round((c.count/totalCat)*100)}%</span>
                </div>
              ))}
              {byCategory.length===0&&<div style={{fontSize:12,color:"var(--t3)"}}>No active tasks by category</div>}
            </div>
          </div>
        </div>
        {/* By Priority */}
        <div className="chart-card">
          <div className="chart-title">🎯 {t.byPriority}</div>
          <div style={{display:"flex",gap:10}}>
            {Object.entries(PRIORITIES).map(([k,v])=>{ const cnt=profileTasks.filter(x=>x.priority===k&&!x.done).length; return (
              <div key={k} style={{flex:1,background:v.bg,borderRadius:11,padding:"12px 10px",textAlign:"center",border:`1px solid ${v.color}28`}}>
                <div style={{fontSize:22,fontFamily:"'Instrument Serif',serif",color:v.color}}>{cnt}</div>
                <div style={{fontSize:11,color:v.color,marginTop:2,fontWeight:600}}>{v.label}</div>
              </div>
            ); })}
          </div>
        </div>
        {/* Streak */}
        <div className="chart-card">
          <div className="chart-title">🔥 14-Day Activity</div>
          <div className="streak-row">
            {streakDays.map((d,i)=>(
              <div key={i} className="streak-day" style={{background:d.hasDone?accent.v:d.isToday?"var(--accd)":"var(--s2)",color:d.hasDone?"#fff":d.isToday?accent.v:"var(--t3)",border:d.isToday?`2px solid ${accent.v}`:"2px solid transparent"}}>
                {d.day[0]}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--t3)",marginTop:10}}>Filled = tasks completed that day</div>
        </div>
      </div>
    );
  };

  const CalendarPage = () => {
    const days = getDaysInMonth(calYear,calMonth);
    const firstDay = getFirstDay(calYear,calMonth);
    const cells = Array.from({length:firstDay+(days)},(_,i)=>i<firstDay?null:i-firstDay+1);
    const pad = (7-cells.length%7)%7;
    const allCells = [...cells,...Array(pad).fill(null)];
    const selTasks = profileTasks.filter(t=>t.due===selDate);
    return (
      <div className="cal-page">
        <div className="cal-header">
          <button className="cal-nav" onClick={()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}}>‹</button>
          <div className="cal-month">{new Date(calYear,calMonth).toLocaleDateString("en-US",{month:"long",year:"numeric"})}</div>
          <button className="cal-nav" onClick={()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}}>›</button>
        </div>
        <div className="cal-grid">
          {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} className="cal-day-name">{d}</div>)}
          {allCells.map((day,i)=>{
            if(!day) return <div key={i}/>;
            const ds=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const dayTasks=profileTasks.filter(t=>t.due===ds);
            return (
              <div key={i} className={`cal-cell ${ds===todayStr()?"today":""} ${ds===selDate?"selected":""} ${dayTasks.length>0&&ds!==selDate?"has-tasks":""}`} onClick={()=>setSelDate(ds)}>
                <div className="cal-num">{day}</div>
                {dayTasks.length>0&&ds!==selDate&&<div className="cal-dots">{dayTasks.slice(0,3).map((_,j)=><div key={j} className="cal-dot" style={{background:j===0?"var(--red)":j===1?accent.v:"var(--green)"}}/>)}</div>}
              </div>
            );
          })}
        </div>
        <div className="cal-task-list">
          <div className="cal-task-title">📅 {fmtDateFull(selDate)} — {selTasks.length} task{selTasks.length!==1?"s":""}</div>
          {selTasks.length===0?<div style={{fontSize:12.5,color:"var(--t3)"}}>No tasks on this day</div>:
          <div className="task-list">{selTasks.map(task=><TaskCard key={task.id} task={task}/>)}</div>}
        </div>
      </div>
    );
  };

  const SettingsPage = () => (
    <div className="settings-page">
      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:16}}>{t.settings}</div>
      {/* Appearance */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Appearance</div>
      <div className="settings-section">
        <div className="settings-row" onClick={()=>setDark(d=>!d)}>
          <div className="settings-icon">🌙</div>
          <div className="settings-label"><div className="settings-title">{t.darkMode}</div><div className="settings-sub">Switch between dark & light</div></div>
          <div className={`toggle ${dark?"on":""}`} onClick={e=>{e.stopPropagation();setDark(d=>!d);}}><div className="toggle-knob"/></div>
        </div>
        <div className="settings-row">
          <div className="settings-icon">🎨</div>
          <div className="settings-label"><div className="settings-title">{t.accentColor}</div><div className="settings-sub">Pick your theme color</div></div>
        </div>
        <div style={{padding:"0 16px 14px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>🖼 Wallpaper</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
            {WALLPAPERS.map(w=>(
              <div key={w.id} onClick={()=>setWallpaper(w.id)} style={{cursor:"pointer",borderRadius:10,border:`2px solid ${wallpaper===w.id?"var(--acc)":"transparent"}`,transition:"all .2s",overflow:"hidden"}}>
                <div style={{height:40,background:w.preview,borderRadius:7}}/>
                <div style={{fontSize:9,textAlign:"center",color:wallpaper===w.id?"var(--acc)":"var(--t3)",fontWeight:700,padding:"3px 2px"}}>{w.label}</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>🎨 Accent Color</div>
          <div className="accent-grid">{ACCENTS.map((a,i)=><div key={i} className={`accent-swatch ${accentIdx===i?"on":""}`} style={{background:`linear-gradient(135deg,${a.v},${a.g})`}} onClick={()=>{setAccentIdx(i);play("tap");}}/> )}</div>
        </div>
      </div>
      {/* Language */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Language</div>
      <div className="settings-section">
        {Object.entries(LANGS).map(([k,l])=>(
          <div key={k} className="settings-row" onClick={()=>{setLangKey(k);play("tap");}}>
            <div className="settings-icon">{l.flag}</div>
            <div className="settings-label"><div className="settings-title">{l.name}</div></div>
            {langKey===k&&<span style={{color:accent.v,fontWeight:700}}>✓</span>}
          </div>
        ))}
      </div>
      {/* Notifications & Sound */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Notifications</div>
      <div className="settings-section">
        <div className="settings-row">
          <div className="settings-icon">🔔</div>
          <div className="settings-label"><div className="settings-title">{t.notifications}</div><div className="settings-sub">Get reminded about due tasks</div></div>
          <div className={`toggle ${notifsOn?"on":""}`} onClick={()=>setNotifsOn(n=>!n)}><div className="toggle-knob"/></div>
        </div>
        <div className="settings-row">
          <div className="settings-icon">🎵</div>
          <div className="settings-label"><div className="settings-title">{t.sound}</div><div className="settings-sub">Sound effects on actions</div></div>
          <div className={`toggle ${soundOn?"on":""}`} onClick={()=>setSoundOn(s=>!s)}><div className="toggle-knob"/></div>
        </div>
      </div>
      {/* Background Music */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>🎶 Background Music</div>
      <div className="settings-section">
        <div className="settings-row">
          <div className="settings-icon">🎶</div>
          <div className="settings-label">
            <div className="settings-title">Background Music</div>
            <div className="settings-sub">{musicOn?"Now playing: "+MUSIC_TRACKS.find(m=>m.id===musicTrack)?.label:"Ambient music while you work"}</div>
          </div>
          <div className={`toggle ${musicOn?"on":""}`} onClick={()=>{setMusicOn(m=>!m);play("tap");}}><div className="toggle-knob"/></div>
        </div>
        {musicOn&&(
          <div style={{padding:"0 16px 14px"}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>Choose Track</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {MUSIC_TRACKS.map(m=>(
                <div key={m.id} onClick={()=>{setMusicTrack(m.id);play("tap");}}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"11px 13px",borderRadius:12,cursor:"pointer",background:musicTrack===m.id?"var(--accd)":"var(--s2)",border:`1.5px solid ${musicTrack===m.id?"var(--acc)":"var(--b1)"}`,transition:"all .2s"}}>
                  <span style={{fontSize:20}}>{m.icon}</span>
                  <div>
                    <div style={{fontSize:12.5,fontWeight:700,color:musicTrack===m.id?"var(--acc)":"var(--t1)"}}>{m.label}</div>
                    {musicTrack===m.id&&<div style={{fontSize:10,color:"var(--acc)",marginTop:1}}>▶ Playing</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:10,textAlign:"center"}}>🔊 Generated offline using Web Audio — no internet needed</div>
          </div>
        )}
      </div>
      {/* Security */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Security</div>
      <div className="settings-section">
        <div className="settings-row" onClick={()=>{if(pinEnabled){setPinEnabled(false);setPin("");showNotif("🔓 PIN Removed","App lock disabled");}else{setPinInput("");setPinMode("set");setShowPinModal(true);}}}>
          <div className="settings-icon">🔒</div>
          <div className="settings-label"><div className="settings-title">{t.pinLock}</div><div className="settings-sub">{pinEnabled?"Tap to remove PIN":"Protect app with a 4-digit PIN"}</div></div>
          <div className={`toggle ${pinEnabled?"on":""}`}><div className="toggle-knob"/></div>
        </div>
      </div>
      {/* Data */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Data</div>
      <div className="settings-section">
        <div className="settings-row" onClick={()=>{setShowExport(true);play("tap");}}>
          <div className="settings-icon">📤</div>
          <div className="settings-label"><div className="settings-title">{t.export}</div><div className="settings-sub">Export all tasks as JSON</div></div>
          <span style={{color:"var(--t3)",fontSize:14}}>›</span>
        </div>
        <div className="settings-row" onClick={shareData}>
          <div className="settings-icon">🔗</div>
          <div className="settings-label"><div className="settings-title">{t.share}</div><div className="settings-sub">Share tasks with others</div></div>
          <span style={{color:"var(--t3)",fontSize:14}}>›</span>
        </div>
      </div>
    </div>
  );

  const ProfilesPage = () => (
    <div style={{padding:"20px 18px 90px"}}>
      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:16}}>{t.profiles}</div>
      <div className="prof-grid">
        {profiles.map(p=>(
          <div key={p.id} style={{position:"relative"}}>
            <div className={`prof-card ${activeProfile===p.id?"on":""}`} onClick={()=>{setActiveProfile(p.id);play("tap");setTab("tasks");}}>
              <div className="prof-avatar">{p.icon}</div>
              <div className="prof-name">{p.name}</div>
              <div className="prof-count">{tasks.filter(x=>x.profileId===p.id&&!x.done).length} active tasks</div>
              {activeProfile===p.id&&<div style={{fontSize:11,color:accent.v,marginTop:5,fontWeight:700}}>✓ Active</div>}
            </div>
            {activeProfile!==p.id&&profiles.length>1&&(
              <button style={{position:"absolute",top:6,right:6,width:22,height:22,borderRadius:6,background:"rgba(255,107,107,.15)",color:"var(--red)",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid rgba(255,107,107,.3)",zIndex:2}}
                onClick={e=>{e.stopPropagation();setProfiles(ps=>ps.filter(x=>x.id!==p.id));setTasks(ts=>ts.filter(x=>x.profileId!==p.id));play("delete");showNotif("Deleted",p.name+" removed");}}>✕</button>
            )}
          </div>
        ))}
        <div className="prof-card" style={{border:"2px dashed var(--b2)",background:"transparent"}} onClick={()=>{setProfForm({name:"",icon:"👤",color:"#7c6dfa"});setShowProfileModal(true);}}>
          <div style={{fontSize:28,marginBottom:8}}>＋</div>
          <div style={{fontSize:13,color:"var(--t2)",fontWeight:600}}>{t.newProfile}</div>
        </div>
      </div>
    </div>
  );

  // ── Pomodoro State ──
  const POMO_MODES = {focus:{label:"Focus",mins:25,color:"#ff6b6b"},short:{label:"Short Break",mins:5,color:"#6bcb77"},long:{label:"Long Break",mins:15,color:"#48dbfb"}};
  const [pomoMode, setPomoMode] = useState("focus");
  const [pomoSecs, setPomoSecs] = useState(25*60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSession, setPomoSession] = useState(0); // 0-3 completed sessions
  const [pomoTaskId, setPomoTaskId] = useState(null);
  const [pomoTotal, setPomoTotal] = useState(0); // total sessions ever
  const [pomoMinsToday, setPomoMinsToday] = useState(0);
  const pomoRef = useRef(null);

  useEffect(()=>{
    if(pomoRunning){
      pomoRef.current = setInterval(()=>{
        setPomoSecs(s=>{
          if(s<=1){
            clearInterval(pomoRef.current);
            setPomoRunning(false);
            play("complete");
            const m = POMO_MODES[pomoMode];
            showNotif(`⏱ ${m.label} Done!`, pomoMode==="focus"?"Time for a break!":"Back to focus!");
            if(pomoMode==="focus"){
              setPomoTotal(t=>t+1);
              setPomoMinsToday(t=>t+25);
              setPomoSession(s=>s>=3?0:s+1);
            }
            return POMO_MODES[pomoMode].mins*60;
          }
          return s-1;
        });
      },1000);
    } else { clearInterval(pomoRef.current); }
    return ()=>clearInterval(pomoRef.current);
  },[pomoRunning,pomoMode]);

  const switchPomoMode = (m) => { setPomoMode(m); setPomoSecs(POMO_MODES[m].mins*60); setPomoRunning(false); };
  const resetPomo = () => { setPomoSecs(POMO_MODES[pomoMode].mins*60); setPomoRunning(false); };

  const PomoPage = () => {
    const mins = Math.floor(pomoSecs/60), secs = pomoSecs%60;
    const total_s = POMO_MODES[pomoMode].mins*60;
    const progress = 1 - (pomoSecs/total_s);
    const R=70, C2=2*Math.PI*R;
    const modeColor = POMO_MODES[pomoMode].color;
    const activeTasks = profileTasks.filter(t=>!t.done).slice(0,6);
    const pomoTask = tasks.find(t=>t.id===pomoTaskId);
    return (
      <div className="pomo-page">
        {/* Mode selector */}
        <div className="pomo-modes">
          {Object.entries(POMO_MODES).map(([k,v])=>(
            <div key={k} className={`pomo-mode ${pomoMode===k?"on":""}`} onClick={()=>switchPomoMode(k)}>{v.label}</div>
          ))}
        </div>
        {/* Timer ring */}
        <div className="pomo-card">
          <div className="pomo-ring">
            <svg width="180" height="180" style={{transform:"rotate(-90deg)"}}>
              <circle cx="90" cy="90" r={R} fill="none" stroke="var(--s3)" strokeWidth="8"/>
              <circle cx="90" cy="90" r={R} fill="none" stroke={modeColor} strokeWidth="8" strokeLinecap="round"
                strokeDasharray={C2} strokeDashoffset={C2*(1-progress)} style={{transition:"stroke-dashoffset .5s ease",filter:`drop-shadow(0 0 8px ${modeColor}88)`}}/>
            </svg>
            <div className="pomo-time">
              <div className="pomo-mins" style={{color:modeColor}}>{String(mins).padStart(2,"0")}:{String(secs).padStart(2,"0")}</div>
              <div className="pomo-label" style={{color:modeColor}}>{POMO_MODES[pomoMode].label}</div>
            </div>
          </div>
          {/* Sessions dots */}
          <div className="pomo-sessions">
            {[0,1,2,3].map(i=><div key={i} className={`pomo-dot ${i<pomoSession?"done":""}`} style={i<pomoSession?{background:modeColor,borderColor:modeColor}:{}}/>)}
          </div>
          {pomoTask&&<div style={{fontSize:12.5,color:"var(--t2)",background:"var(--s2)",borderRadius:9,padding:"7px 12px",width:"100%",textAlign:"center"}}>🎯 {pomoTask.title}</div>}
          {/* Controls */}
          <div className="pomo-controls">
            <button className="pomo-btn sec" onClick={resetPomo} title="Reset">↺</button>
            <button className="pomo-btn main" onClick={()=>setPomoRunning(r=>!r)} style={{background:`linear-gradient(135deg,${modeColor},${modeColor}bb)`,boxShadow:`0 6px 20px ${modeColor}55`}}>
              {pomoRunning?"⏸":"▶"}
            </button>
            <button className="pomo-btn sec" onClick={()=>switchPomoMode({focus:"short",short:"long",long:"focus"}[pomoMode])} title="Skip">⏭</button>
          </div>
        </div>
        {/* Stats */}
        <div className="pomo-stats-row">
          {[{lbl:"Sessions Today",val:pomoTotal},{lbl:"Focus Mins",val:pomoMinsToday},{lbl:"Current Streak",val:pomoSession+"/4"}].map(s=>(
            <div key={s.lbl} className="pomo-stat"><div className="pomo-stat-val">{s.val}</div><div className="pomo-stat-lbl">{s.lbl}</div></div>
          ))}
        </div>
        {/* Task picker */}
        <div className="pomo-task-pick">
          <div className="pomo-task-title">🎯 Focus on a task</div>
          {activeTasks.length===0&&<div style={{fontSize:12.5,color:"var(--t3)",padding:"10px 0"}}>No active tasks — add one first!</div>}
          {activeTasks.map(task=>(
            <div key={task.id} className={`pomo-task-item ${pomoTaskId===task.id?"on":""}`} onClick={()=>setPomoTaskId(id=>id===task.id?null:task.id)}>
              <span style={{fontSize:14}}>{PRIORITIES[task.priority].icon}</span>
              <span className="pomo-task-name">{task.title}</span>
              {pomoTaskId===task.id&&<span style={{color:accent.v,fontWeight:700,fontSize:13}}>✓</span>}
            </div>
          ))}
        </div>
        {/* Tips */}
        <div style={{width:"100%",maxWidth:420,background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"14px 16px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8}}>💡 Pomodoro Tips</div>
          {["Work in 25-min focused bursts — no distractions!","After 4 sessions take a 15-30 min long break.","One task per session. Keep phone face-down!","Use short breaks to stretch, not scroll social media."].map((tip,i)=>(
            <div key={i} style={{fontSize:12.5,color:"var(--t2)",padding:"5px 0",borderBottom:i<3?"1px solid var(--b1)":"none",lineHeight:1.5}}>• {tip}</div>
          ))}
        </div>
      </div>
    );
  };

  // ── REAL Firebase Collaboration State ──
  const [myRoomCode] = useState("TF-"+(Math.random().toString(36).slice(2,8).toUpperCase()));
  const [joinCode, setJoinCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState(null); // room we're currently in
  const [sharedTasks, setSharedTasks] = useState([]);
  const [newSharedTitle, setNewSharedTitle] = useState("");
  const [editingSharedId, setEditingSharedId] = useState(null);
  const [editingSharedText, setEditingSharedText] = useState("");
  const [myName, setMyName] = useState("Me");
  const [collabStatus, setCollabStatus] = useState("idle"); // idle | connecting | connected | error
  const collabUnsub = useRef(null);

  // ── Auth State ──
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInited, setAuthInited] = useState(false);

  const initAuth = useCallback(async () => {
    if (authInited) return;
    setAuthInited(true);
    try {
      const fb = await getFirebase();
      if (!fb) return;
      fb.auth.onAuthStateChanged(user => {
        setAuthUser(user ? { uid:user.uid, email:user.email, name:user.displayName||user.email.split("@")[0] } : null);
      });
    } catch(e) { console.error(e); }
  }, [authInited]);

  useEffect(() => { if (tab === "collab") initAuth(); }, [tab]);

  const signIn = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable in preview — will work in published app!");
      await fb.auth.signInWithEmailAndPassword(authEmail, authPassword);
      showNotif("✅ Signed in!", authEmail); play("complete");
    } catch(e) {
      setAuthError(e.code==="auth/user-not-found"?"No account found":e.code==="auth/wrong-password"?"Wrong password":e.code==="auth/invalid-email"?"Invalid email format":e.message);
    } finally { setAuthLoading(false); }
  };

  const signUp = async () => {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable in preview — will work in published app!");
      const cred = await fb.auth.createUserWithEmailAndPassword(authEmail, authPassword);
      await cred.user.updateProfile({ displayName: myName||authEmail.split("@")[0] });
      showNotif("🎉 Account created!", authEmail); play("complete");
    } catch(e) {
      setAuthError(e.code==="auth/email-already-in-use"?"Email already in use":e.code==="auth/weak-password"?"Min 6 characters required":e.message);
    } finally { setAuthLoading(false); }
  };

  const signOut = async () => {
    try {
      const fb = await getFirebase();
      if (fb) await fb.auth.signOut();
      setAuthUser(null); leaveRoom();
      showNotif("👋 Signed out","See you next time!");
    } catch(e) {}
  };

  // Listen to a room's tasks in real time
  const joinRoom = async (code) => {
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;
    setCollabStatus("connecting");
    if (collabUnsub.current) collabUnsub.current();
    try {
      const db = await getDB();
      if (!db) throw new Error("Firebase unavailable");
      await db.collection("rooms").doc(roomCode).set({ code:roomCode, createdAt: Date.now() },{ merge:true });
      collabUnsub.current = db.collection("rooms").doc(roomCode).collection("tasks")
        .onSnapshot((snap) => {
          const live = snap.docs.map(d=>({id:d.id,...d.data()}));
          setSharedTasks(live.sort((a,b)=>b.createdAt-a.createdAt));
          setCollabStatus("connected");
        }, (err) => {
          setCollabStatus("error");
          showNotif("❌ Connection Error", err.message);
        });
      setActiveRoomCode(roomCode);
      showNotif("✅ Connected!", "You joined room: "+roomCode);
    } catch(err) {
      setCollabStatus("error");
      showNotif("❌ Error", err.message);
    }
  };

  const leaveRoom = () => {
    if (collabUnsub.current) collabUnsub.current();
    setActiveRoomCode(null);
    setSharedTasks([]);
    setCollabStatus("idle");
    showNotif("👋 Left room","Disconnected from shared list");
  };

  const addSharedTask = async () => {
    if (!newSharedTitle.trim() || !activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").add({
        title: newSharedTitle.trim(), addedBy: myName||"Anonymous",
        done: false, priority: "medium", createdAt: Date.now(),
      });
      setNewSharedTitle(""); play("add");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  const toggleSharedTask = async (task) => {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({...task,done:!task.done});
      play(task.done?"tap":"complete");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  const deleteSharedTask = async (taskId) => {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(taskId).delete();
      play("delete");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  const editSharedTask = async (task, newTitle) => {
    if (!activeRoomCode || !newTitle.trim()) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({...task,title:newTitle.trim()});
      setEditingSharedId(null); play("tap");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  const shareMyTasks = async () => {
    if (!activeRoomCode) return;
    const toShare = profileTasks.filter(t=>!t.done).slice(0,5);
    try {
      const db = await getDB(); if (!db) return;
      for (const task of toShare) {
        await db.collection("rooms").doc(activeRoomCode).collection("tasks").add({
          title: task.title, addedBy: myName||"Me",
          done: false, priority: task.priority, createdAt: Date.now(),
        });
      }
      showNotif("📤 Shared!",`${toShare.length} tasks shared to room`);
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  // Cleanup on unmount
  useEffect(()=>()=>{ if(collabUnsub.current) collabUnsub.current(); },[]);

  const statusColors = {idle:"var(--t3)",connecting:"#ffd93d",connected:"#6bcb77",error:"#ff6b6b"};
  const statusLabels = {idle:"Not connected",connecting:"Connecting…",connected:"🟢 Live — syncing in real time",error:"❌ Connection failed"};

  const CollabPage = () => {
    const emailRef = useRef(null);
    const passRef = useRef(null);
    const nameRef = useRef(null);
    const joinRef = useRef(null);
    const newTaskRef = useRef(null);

    const handleSignIn = () => {
      setAuthEmail(emailRef.current?.value||"");
      setAuthPassword(passRef.current?.value||"");
      setTimeout(()=>signIn(),50);
    };
    const handleSignUp = () => {
      setMyName(nameRef.current?.value||"Me");
      setAuthEmail(emailRef.current?.value||"");
      setAuthPassword(passRef.current?.value||"");
      setTimeout(()=>signUp(),50);
    };
    const handleJoin = () => {
      const code = joinRef.current?.value||"";
      setJoinCode(code);
      setTimeout(()=>joinRoom(code),50);
    };
    const handleAddTask = () => {
      const title = newTaskRef.current?.value||"";
      if(!title.trim()) return;
      setNewSharedTitle(title);
      setTimeout(()=>{addSharedTask();if(newTaskRef.current)newTaskRef.current.value="";},50);
    };

    // ── Sign-in wall ──
    if (!authUser) return (
      <div style={{padding:"24px 18px 90px",display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
        <div style={{width:"100%",maxWidth:400}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:48,marginBottom:10}}>👫</div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,marginBottom:6}}>Collaborate</div>
            <div style={{fontSize:13,color:"var(--t3)",lineHeight:1.6}}>Sign in to sync tasks with your team in real time</div>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:16,background:"var(--s2)",borderRadius:12,padding:4}}>
            {["signin","signup"].map(m=>(
              <button key={m} onClick={()=>setAuthMode(m)} style={{flex:1,padding:"9px 0",borderRadius:9,fontSize:13,fontWeight:700,border:"none",cursor:"pointer",background:authMode===m?"var(--acc)":"transparent",color:authMode===m?"#fff":"var(--t3)",transition:"all .2s"}}>
                {m==="signin"?"Sign In":"Sign Up"}
              </button>
            ))}
          </div>
          {authMode==="signup"&&(
            <div style={{marginBottom:12}}>
              <div className="f-lbl">Your Name</div>
              <input ref={nameRef} className="f-in" placeholder="e.g. Isaac" defaultValue={myName} autoComplete="off" autoCorrect="off" spellCheck="false"/>
            </div>
          )}
          <div style={{marginBottom:12}}>
            <div className="f-lbl">Email</div>
            <input ref={emailRef} className="f-in" type="email" placeholder="your@email.com" defaultValue={authEmail} autoComplete="off" autoCorrect="off" spellCheck="false" autoCapitalize="none"/>
          </div>
          <div style={{marginBottom:16}}>
            <div className="f-lbl">Password</div>
            <input ref={passRef} className="f-in" type="password" placeholder="Min 6 characters" defaultValue={authPassword} autoComplete="off"/>
          </div>
          {authError&&<div style={{color:"var(--red)",fontSize:12.5,marginBottom:12,textAlign:"center",padding:"8px 12px",background:"rgba(255,107,107,.1)",borderRadius:9}}>{authError}</div>}
          <button onClick={authMode==="signin"?handleSignIn:handleSignUp} style={{width:"100%",height:46,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:13,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",opacity:authLoading?0.6:1,transition:"all .2s"}}>
            {authLoading?"Please wait…":authMode==="signin"?"Sign In →":"Create Account →"}
          </button>
        </div>
      </div>
    );

    return (
      <div style={{padding:"18px 18px 90px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>👫 Team</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Hi {authUser.name} · <span style={{color:statusColors[collabStatus]}}>{statusLabels[collabStatus]}</span></div>
          </div>
          <button onClick={signOut} style={{fontSize:12,padding:"6px 12px",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,color:"var(--t2)",cursor:"pointer"}}>Sign Out</button>
        </div>

        {/* Room connect */}
        {!activeRoomCode?(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"16px",marginBottom:16}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>🔗 Join a Room</div>
            <div style={{fontSize:12,color:"var(--t3)",marginBottom:8}}>Your room code: <span style={{color:accent.v,fontWeight:700}}>{myRoomCode}</span></div>
            <div style={{display:"flex",gap:8}}>
              <input ref={joinRef} className="f-in" placeholder="Enter room code e.g. TF-ABC123" defaultValue={joinCode} autoComplete="off" autoCapitalize="characters" style={{flex:1}}/>
              <button onClick={handleJoin} style={{height:42,padding:"0 16px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",whiteSpace:"nowrap"}}>Join</button>
            </div>
          </div>
        ):(
          <div style={{background:"linear-gradient(135deg,#6bcb7722,#6bcb7711)",border:"1px solid #6bcb7744",borderRadius:16,padding:"14px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:"#6bcb77",flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:"#6bcb77"}}>Connected to {activeRoomCode}</div>
              <div style={{fontSize:11.5,color:"var(--t3)",marginTop:2}}>{sharedTasks.length} shared tasks</div>
            </div>
            <button onClick={leaveRoom} style={{fontSize:12,padding:"5px 10px",background:"rgba(255,107,107,.15)",color:"var(--red)",border:"1px solid rgba(255,107,107,.3)",borderRadius:8,cursor:"pointer"}}>Leave</button>
          </div>
        )}

        {/* Shared tasks */}
        {activeRoomCode&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:12}}>📋 Shared Tasks ({sharedTasks.length})</div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <input ref={newTaskRef} className="f-in" placeholder="Add a shared task…" defaultValue="" autoComplete="off" style={{flex:1}} onKeyDown={e=>{if(e.key==="Enter")handleAddTask();}}/>
              <button onClick={handleAddTask} style={{height:42,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>+ Add</button>
            </div>
            {sharedTasks.length===0&&<div style={{fontSize:12.5,color:"var(--t3)",textAlign:"center",padding:"12px 0"}}>No shared tasks yet — add one above!</div>}
            {sharedTasks.map(task=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--b1)"}}>
                <div className={`chk ${task.done?"on":""}`} style={{flexShrink:0}} onClick={()=>toggleSharedTask(task)}>{task.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,textDecoration:task.done?"line-through":"none",color:task.done?"var(--t3)":"var(--t1)"}}>{task.title}</div>
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>by {task.addedBy}</div>
                </div>
                <button onClick={()=>deleteSharedTask(task.id)} style={{fontSize:13,color:"var(--t3)",padding:"3px 7px",background:"var(--s3)",borderRadius:7,border:"none",cursor:"pointer"}}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };


  // ── Widget Page ──
  const [selectedWidget, setSelectedWidget] = useState("progress");
  const WIDGET_TYPES = [
    {id:"progress",name:"Progress Widget",size:"2×1",desc:"Shows completion ring & active task count"},
    {id:"tasks",name:"Task List Widget",size:"2×2",desc:"Your top 4 urgent tasks at a glance"},
    {id:"focus",name:"Focus Widget",size:"1×1",desc:"Quick Pomodoro timer shortcut"},
    {id:"streak",name:"Streak Widget",size:"2×1",desc:"Your productivity streak & stats"},
  ];

  const WidgetPage = () => {
    const urgentTasks = profileTasks.filter(t=>!t.done).sort((a,b)=>{const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];}).slice(0,4);
    return (
      <div className="widget-page">
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:4}}>📊 Widgets</div>
        <div style={{fontSize:13,color:"var(--t3)",marginBottom:18}}>Add Taskflow to your home screen</div>

        {/* Widget previews */}
        <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10,paddingLeft:2}}>Choose a Widget Style</div>
        <div className="widget-preview-grid">
          {WIDGET_TYPES.map(w=>(
            <div key={w.id} className={`widget-card ${selectedWidget===w.id?"selected":""}`} onClick={()=>{setSelectedWidget(w.id);play("tap");}}>
              {selectedWidget===w.id&&<span className="widget-badge" style={{background:`${accent.v}22`,color:accent.v}}>✓ Selected</span>}
              {/* Mini preview */}
              <div className="widget-preview">
                {w.id==="progress"&&(
                  <div className="mini-widget">
                    <div className="mini-widget-title">Taskflow</div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div><div className="mini-widget-num">{pct}<span style={{fontSize:16}}>%</span></div><div className="mini-widget-sub">{activeCount} active</div></div>
                      <svg width="44" height="44" style={{transform:"rotate(-90deg)",flexShrink:0}}><circle cx="22" cy="22" r="17" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="4"/><circle cx="22" cy="22" r="17" fill="none" stroke={accent.v} strokeWidth="4" strokeLinecap="round" strokeDasharray={2*Math.PI*17} strokeDashoffset={2*Math.PI*17*(1-pct/100)}/></svg>
                    </div>
                    <div className="mini-widget-bar"><div className="mini-widget-bar-f" style={{width:`${pct}%`}}/></div>
                  </div>
                )}
                {w.id==="tasks"&&(
                  <div className="mini-task-widget">
                    <div className="mini-widget-title">Today's Tasks</div>
                    {urgentTasks.length===0?<div style={{fontSize:11,color:"var(--t3)"}}>All done! 🎉</div>:urgentTasks.map((task,i)=>(
                      <div key={i} className="mini-task-row">
                        <div className="mini-task-dot" style={{background:PRIORITIES[task.priority].color}}/>
                        <span className="mini-task-text">{task.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {w.id==="focus"&&(
                  <div style={{background:`linear-gradient(135deg,${accent.v}33,${accent.g}22)`,borderRadius:13,padding:14,textAlign:"center"}}>
                    <div style={{fontSize:26,marginBottom:4}}>⏱</div>
                    <div style={{fontSize:13,fontWeight:700,color:accent.v}}>Focus</div>
                    <div style={{fontSize:10,color:"var(--t3)",marginTop:3}}>25 min</div>
                  </div>
                )}
                {w.id==="streak"&&(
                  <div className="mini-widget">
                    <div className="mini-widget-title">🔥 Streak</div>
                    <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                      {Array.from({length:7},(_,i)=><div key={i} style={{width:24,height:24,borderRadius:6,background:i<4?accent.v:"var(--s3)",opacity:i<4?1:.4}}/>)}
                    </div>
                    <div style={{fontSize:11,color:"var(--t3)",marginTop:6}}>{pomoTotal} sessions · {doneCount} done</div>
                  </div>
                )}
              </div>
              <div style={{fontSize:12.5,fontWeight:700}}>{w.name}</div>
              <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>{w.size} · {w.desc}</div>
            </div>
          ))}
        </div>

        {/* Install instructions */}
        <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:10,paddingLeft:2}}>How to Add to Home Screen</div>
        <div className="install-card">
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t2)",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:18}}>🤖</span> Android (Samsung / Google)
          </div>
          {[
            {n:1,t:"Long-press on your home screen until it wiggles"},
            {n:2,t:"Tap Widgets at the bottom of the screen"},
            {n:3,t:'Search for "Taskflow" in the widget search bar'},
            {n:4,t:"Tap and hold the widget, then drag it to your home screen"},
            {n:5,t:"Tap the widget to configure which tasks to show"},
          ].map(s=>(
            <div key={s.n} className="install-step">
              <div className="install-num">{s.n}</div>
              <div className="install-text">{s.t}</div>
            </div>
          ))}
        </div>
        <div className="install-card">
          <div style={{fontSize:12.5,fontWeight:700,color:"var(--t2)",marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:18}}>🍎</span> iOS (iPhone / iPad)
          </div>
          {[
            {n:1,t:"Long-press on any empty area of your home screen"},
            {n:2,t:"Tap the ＋ button in the top-left corner"},
            {n:3,t:'Search for "Taskflow"'},
            {n:4,t:"Select your widget size: Small, Medium, or Large"},
            {n:5,t:"Tap Add Widget and position it on your screen"},
          ].map(s=>(
            <div key={s.n} className="install-step">
              <div className="install-num">{s.n}</div>
              <div className="install-text">{s.t}</div>
            </div>
          ))}
        </div>
        <div style={{background:`${accent.v}15`,border:`1px solid ${accent.v}33`,borderRadius:12,padding:"12px 14px",fontSize:12.5,color:"var(--t2)",lineHeight:1.6}}>
          <strong style={{color:accent.v}}>💡 Note:</strong> Widgets become available automatically once you publish Taskflow to the app store and install it on your device. The previews above show exactly how each widget will look on your home screen.
        </div>
      </div>
    );
  };


  // ══════════════════════════════════════════
  //  GOALS & MILESTONES
  // ══════════════════════════════════════════
  const [goals, setGoals] = useState(()=>{try{const s=localStorage.getItem("tf_goals");return s?JSON.parse(s):[];}catch{return [];}});
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({title:"",icon:"🎯",color:"#7c6dfa",deadline:"",milestones:[]});
  const [goalMilestoneInput, setGoalMilestoneInput] = useState("");
  const GOAL_ICONS = ["🎯","🚀","💪","📚","💰","🏠","🎨","✈️","🏆","❤️","🌟","🎵","🏋️","💡","🌿","⚡"];
  const GOAL_COLORS = ["#7c6dfa","#6bcb77","#ffd93d","#ff6b6b","#00d4aa","#f589a3","#ff9f43","#48dbfb","#d47cff"];

  const toggleMilestone = (goalId, mId) => setGoals(gs=>gs.map(g=>g.id===goalId?{...g,milestones:g.milestones.map(m=>m.id===mId?{...m,done:!m.done}:m)}:g));
  const saveGoal = () => {
    if(!goalForm.title.trim()) return;
    const doSave = () => {
      if(editGoal) setGoals(gs=>gs.map(g=>g.id===editGoal.id?{...g,...goalForm}:g));
      else setGoals(gs=>[{id:uid(),...goalForm},  ...gs]);
      setShowGoalModal(false); setEditGoal(null); play("add");
      showNotif("🏆 Goal saved!", goalForm.title);
    };
    if(editGoal) doSave(); else doSave();
  };
  const deleteGoal = (id) => { setGoals(gs=>gs.filter(g=>g.id!==id)); play("delete"); };

  const GoalsPage = () => (
    <div style={{padding:"18px 18px 90px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>🏆 Goals</div>
          <div style={{fontSize:12.5,color:"var(--t3)",marginTop:2}}>{goals.length} goals · {goals.reduce((a,g)=>a+g.milestones.filter(m=>m.done).length,0)} milestones done</div>
        </div>
        <button style={{height:38,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",boxShadow:"0 4px 14px var(--glow)"}} onClick={()=>{setGoalForm({title:"",icon:"🎯",color:"#7c6dfa",deadline:"",milestones:[]});setGoalMilestoneInput("");setEditGoal(null);setShowGoalModal(true);}}>+ New Goal</button>
      </div>

      {goals.length===0&&<div className="empty"><div className="empty-icon">🏆</div><div className="empty-t">No goals yet!</div><div style={{fontSize:12.5,color:"var(--t3)"}}>Tap + to set your first goal</div></div>}

      {goals.map(goal=>{
        const done = goal.milestones.filter(m=>m.done).length;
        const total = goal.milestones.length;
        const pct = total ? Math.round((done/total)*100) : 0;
        const daysLeft = goal.deadline ? Math.ceil((new Date(goal.deadline)-new Date())/(1000*60*60*24)) : null;
        return (
          <div key={goal.id} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"16px",marginBottom:12,overflow:"hidden",position:"relative"}}>
            {/* Color accent strip */}
            <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:goal.color,borderRadius:"16px 16px 0 0"}}/>
            <div style={{display:"flex",alignItems:"flex-start",gap:11,marginBottom:12}}>
              <div style={{width:42,height:42,borderRadius:12,background:goal.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>{goal.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,marginBottom:3}}>{goal.title}</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {daysLeft!==null&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:daysLeft<30?"rgba(255,107,107,.15)":"var(--s2)",color:daysLeft<30?"var(--red)":"var(--t3)",border:`1px solid ${daysLeft<30?"rgba(255,107,107,.3)":"var(--b1)"}`}}>{daysLeft>0?`${daysLeft} days left`:"Deadline passed!"}</span>}
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:goal.color+"22",color:goal.color,border:`1px solid ${goal.color}33`,fontWeight:700}}>{pct}% done</span>
                </div>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button className="ic-btn" onClick={()=>{setGoalForm({title:goal.title,icon:goal.icon,color:goal.color,deadline:goal.deadline,milestones:goal.milestones.map(m=>({...m}))});setGoalMilestoneInput("");setEditGoal(goal);setShowGoalModal(true);}}>✎</button>
                <button className="ic-btn del" onClick={()=>deleteGoal(goal.id)}>✕</button>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden",marginBottom:12}}>
              <div style={{height:"100%",width:`${pct}%`,background:goal.color,borderRadius:3,transition:"width .6s ease"}}/>
            </div>
            {/* Milestones */}
            {goal.milestones.length>0&&(
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {goal.milestones.map(m=>(
                  <div key={m.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 10px",background:"var(--s2)",borderRadius:9,cursor:"pointer",transition:"all .15s"}} onClick={()=>{toggleMilestone(goal.id,m.id);play(m.done?"tap":"complete");}}>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${m.done?goal.color:"var(--s4)"}`,background:m.done?goal.color:"var(--s2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .2s"}}>
                      {m.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}
                    </div>
                    <span style={{fontSize:13,flex:1,textDecoration:m.done?"line-through":"none",color:m.done?"var(--t3)":"var(--t1)"}}>{m.text}</span>
                  </div>
                ))}
              </div>
            )}
            {goal.milestones.length===0&&<div style={{fontSize:12.5,color:"var(--t3)",textAlign:"center",padding:"8px 0"}}>No milestones yet — tap ✎ to add some</div>}
          </div>
        );
      })}

    </div>
  );

  // ══════════════════════════════════════════
  //  HABIT TRACKER
  // ══════════════════════════════════════════
  const DAYS_LABELS = ["S","M","T","W","T","F","S"];
  const getLast14Days = () => Array.from({length:14},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-13+i); return d.toISOString().split("T")[0]; });
  const getLast7Days = () => Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });

  const [habits, setHabits] = useState(()=>{try{const s=localStorage.getItem("tf_habits");return s?JSON.parse(s):[];}catch{return [];}});
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [habitForm, setHabitForm] = useState({name:"",icon:"⭐",color:"#7c6dfa",freq:"daily"});
  const FREQ_OPTS = [{id:"daily",label:"Every Day"},{id:"weekdays",label:"Weekdays"},{id:"weekly",label:"Weekly"},{id:"3x",label:"3× Week"}];
  const HABIT_ICONS = ["🏃","📚","💧","🧘","📵","💪","🥗","😴","✍️","🎵","🙏","🌿","☀️","🚶","🍎","⭐","🔥","💊","🧹","📝"];

  const toggleHabit = (habitId, date) => {
    setHabits(hs=>hs.map(h=>h.id===habitId?{...h,completions:{...h.completions,[date]:!h.completions[date]}}:h));
    play("tap");
  };
  const getStreak = (habit) => {
    let streak=0; const d=new Date();
    while(true){ const ds=d.toISOString().split("T")[0]; if(!habit.completions[ds]) break; streak++; d.setDate(d.getDate()-1); }
    return streak;
  };
  const getBestStreak = (habit) => {
    const dates = Object.keys(habit.completions).filter(k=>habit.completions[k]).sort();
    if(!dates.length) return 0;
    let best=1,cur=1;
    for(let i=1;i<dates.length;i++){
      const diff=(new Date(dates[i])-new Date(dates[i-1]))/(1000*60*60*24);
      if(diff===1){cur++;best=Math.max(best,cur);}else{cur=1;}
    }
    return best;
  };
  const saveHabit = () => {
    if(!habitForm.name.trim()) return;
    setHabits(hs=>[{id:uid(),...habitForm,completions:{}}, ...hs]);
    setShowHabitModal(false); play("add");
    showNotif("🔁 Habit added!", habitForm.name);
  };
  const deleteHabit = (id) => { setHabits(hs=>hs.filter(h=>h.id!==id)); play("delete"); };

  const HabitsPage = () => {
    const last14 = getLast14Days();
    const last7 = getLast7Days();
    const totalDoneToday = habits.filter(h=>h.completions[todayStr()]).length;
    const allDoneToday = habits.length>0 && totalDoneToday===habits.length;
    return (
      <div style={{padding:"18px 18px 90px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>🔁 Habits</div>
            <div style={{fontSize:12.5,color:"var(--t3)",marginTop:2}}>{habits.length} habits tracked</div>
          </div>
          <button style={{height:38,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",boxShadow:"0 4px 14px var(--glow)"}} onClick={()=>{setHabitForm({name:"",icon:"⭐",color:"#7c6dfa",freq:"daily"});setShowHabitModal(true);}}>+ New Habit</button>
        </div>

        {/* Today summary card */}
        <div style={{background:allDoneToday?`linear-gradient(135deg,${accent.v}22,${accent.g}11)`:"var(--s1)",border:`1px solid ${allDoneToday?accent.v+"44":"var(--b1)"}`,borderRadius:14,padding:"14px 16px",marginBottom:16,marginTop:10,display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:36}}>{allDoneToday?"🔥":"📅"}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{allDoneToday?"Perfect day! All done! 🎉":"Today's Progress"}</div>
            <div style={{fontSize:12.5,color:"var(--t3)"}}>{totalDoneToday} of {habits.length} habits completed today</div>
            <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden",marginTop:8}}>
              <div style={{height:"100%",width:`${habits.length?(totalDoneToday/habits.length)*100:0}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,transition:"width .5s ease"}}/>
            </div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:accent.v}}>{habits.length?Math.round((totalDoneToday/habits.length)*100):0}%</div>
            <div style={{fontSize:10,color:"var(--t3)"}}>done</div>
          </div>
        </div>

        {habits.length===0&&<div className="empty"><div className="empty-icon">🔁</div><div className="empty-t">No habits yet!</div><div style={{fontSize:12.5,color:"var(--t3)"}}>Tap + to track your first habit</div></div>}

        {/* Habit cards */}
        {habits.map(habit=>{
          const streak = getStreak(habit);
          const best = getBestStreak(habit);
          const doneToday = !!habit.completions[todayStr()];
          return (
            <div key={habit.id} style={{background:"var(--s1)",border:`1px solid ${doneToday?habit.color+"44":"var(--b1)"}`,borderRadius:15,padding:"14px 15px",marginBottom:10,transition:"all .2s"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <div style={{width:40,height:40,borderRadius:11,background:habit.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{habit.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700}}>{habit.name}</div>
                  <div style={{display:"flex",gap:8,marginTop:3,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:streak>0?"#ffd93d":"var(--t3)",fontWeight:streak>0?700:400}}>🔥 {streak} day streak</span>
                    <span style={{fontSize:11,color:"var(--t3)"}}>Best: {best}</span>
                    <span style={{fontSize:10,padding:"1px 7px",borderRadius:20,background:habit.color+"22",color:habit.color,fontWeight:600}}>{FREQ_OPTS.find(f=>f.id===habit.freq)?.label||"Daily"}</span>
                  </div>
                </div>
                {/* Today toggle */}
                <button style={{width:42,height:42,borderRadius:12,background:doneToday?habit.color:"var(--s2)",border:`2px solid ${doneToday?habit.color:"var(--s4)"}`,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .2s",flexShrink:0,boxShadow:doneToday?`0 4px 12px ${habit.color}44`:""}} onClick={()=>toggleHabit(habit.id,todayStr())}>
                  {doneToday?"✓":"○"}
                </button>
                <button className="ic-btn del" style={{flexShrink:0}} onClick={()=>deleteHabit(habit.id)}>✕</button>
              </div>
              {/* 14-day grid */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(14,1fr)",gap:3}}>
                {last14.map((date,i)=>{
                  const done=!!habit.completions[date];
                  const isToday=date===todayStr();
                  return (
                    <div key={i} style={{height:22,borderRadius:5,background:done?habit.color:isToday?"var(--accd)":"var(--s3)",border:isToday?`1.5px solid ${accent.v}`:"1.5px solid transparent",cursor:"pointer",transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>toggleHabit(habit.id,date)} title={date}>
                      {done&&<span style={{fontSize:8,color:"#fff",fontWeight:800}}>✓</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                {last14.filter((_,i)=>i%2===0).map((date,i)=><span key={i} style={{fontSize:9,color:"var(--t3)"}}>{new Date(date).toLocaleDateString("en-US",{weekday:"short"})[0]}</span>)}
              </div>
            </div>
          );
        })}

      </div>
    );
  };

  // ══════════════════════════════════════════
  //  SMART DAILY PLANNER
  // ══════════════════════════════════════════
  const TIME_BLOCKS = [
    {id:"morning",label:"Morning",icon:"🌅",time:"6:00 – 12:00",color:"#ffd93d"},
    {id:"afternoon",label:"Afternoon",icon:"☀️",time:"12:00 – 17:00",color:"#ff9f43"},
    {id:"evening",label:"Evening",icon:"🌆",time:"17:00 – 21:00",color:"#7c6dfa"},
    {id:"night",label:"Night",icon:"🌙",time:"21:00 – 24:00",color:"#48dbfb"},
  ];
  const [plannerDate, setPlannerDate] = useState(todayStr());
  const [plannedTasks, setPlannedTasks] = useState({}); // {taskId: blockId}
  const [plannerDone, setPlannerDone] = useState({}); // {taskId: bool}
  const [showPlannerPicker, setShowPlannerPicker] = useState(null); // blockId we're adding to

  // Auto-schedule: assigns tasks to blocks by priority & due date
  const autoSchedule = () => {
    const unscheduled = profileTasks.filter(t=>!t.done);
    const byPriority = [...unscheduled].sort((a,b)=>{const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];});
    const slots = {morning:[],afternoon:[],evening:[],night:[]};
    const caps = {morning:3,afternoon:3,evening:2,night:1};
    const newPlan = {};
    byPriority.forEach(task=>{
      // Due today → morning, high priority → morning/afternoon, rest fill in
      if(task.due===plannerDate || task.priority==="high"){
        if(slots.morning.length<caps.morning){slots.morning.push(task.id);newPlan[task.id]="morning";}
        else if(slots.afternoon.length<caps.afternoon){slots.afternoon.push(task.id);newPlan[task.id]="afternoon";}
      } else if(task.priority==="medium"){
        if(slots.afternoon.length<caps.afternoon){slots.afternoon.push(task.id);newPlan[task.id]="afternoon";}
        else if(slots.evening.length<caps.evening){slots.evening.push(task.id);newPlan[task.id]="evening";}
      } else {
        if(slots.evening.length<caps.evening){slots.evening.push(task.id);newPlan[task.id]="evening";}
        else if(slots.night.length<caps.night){slots.night.push(task.id);newPlan[task.id]="night";}
      }
    });
    setPlannedTasks(newPlan);
    setPlannerDone({});
    play("add");
    showNotif("📅 Plan ready!",`${Object.keys(newPlan).length} tasks scheduled`);
  };

  const assignToBlock = (taskId, blockId) => {
    setPlannedTasks(p=>({...p,[taskId]:blockId}));
    setShowPlannerPicker(null); play("tap");
  };
  const removeFromPlan = (taskId) => setPlannedTasks(p=>{const n={...p};delete n[taskId];return n;});
  const togglePlannerDone = (taskId) => { setPlannerDone(d=>({...d,[taskId]:!d[taskId]})); play(plannerDone[taskId]?"tap":"complete"); };

  const PlannerPage = () => {
    const scheduledIds = Object.keys(plannedTasks);
    const unscheduled = profileTasks.filter(t=>!t.done && !plannedTasks[t.id]);
    const totalPlanned = scheduledIds.length;
    const totalDone = Object.values(plannerDone).filter(Boolean).length;
    const planPct = totalPlanned ? Math.round((totalDone/totalPlanned)*100) : 0;
    const now = new Date();
    const curHour = now.getHours();
    const currentBlock = curHour<12?"morning":curHour<17?"afternoon":curHour<21?"evening":"night";

    return (
      <div style={{padding:"18px 18px 90px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>⏰ Daily Planner</div>
            <div style={{fontSize:12.5,color:"var(--t3)",marginTop:2}}>
              {new Date(plannerDate).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
            </div>
          </div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <input type="date" value={plannerDate} onChange={e=>setPlannerDate(e.target.value)} style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"6px 10px",fontSize:12,color:"var(--t1)"}}/>
          </div>
        </div>

        {/* Auto-schedule button */}
        <button style={{width:"100%",height:46,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:13,fontSize:14,fontWeight:700,color:"#fff",boxShadow:`0 6px 20px ${accent.v}40`,marginBottom:16,marginTop:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}} onClick={autoSchedule}>
          ✨ Auto-Schedule My Day
        </button>

        {/* Progress summary */}
        {totalPlanned>0&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"14px 16px",marginBottom:16}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:13.5,fontWeight:700}}>Today's Progress</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:accent.v}}>{planPct}%</div>
            </div>
            <div style={{height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${planPct}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,transition:"width .5s"}}/>
            </div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:6}}>{totalDone} of {totalPlanned} tasks done</div>
          </div>
        )}

        {/* Time blocks */}
        {TIME_BLOCKS.map(block=>{
          const blockTasks = scheduledIds.filter(id=>plannedTasks[id]===block.id).map(id=>profileTasks.find(t=>t.id===id)||tasks.find(t=>t.id===id)).filter(Boolean);
          const isCurrent = block.id===currentBlock && plannerDate===todayStr();
          return (
            <div key={block.id} style={{marginBottom:12,background:"var(--s1)",border:`1.5px solid ${isCurrent?block.color+"66":"var(--b1)"}`,borderRadius:16,overflow:"hidden",boxShadow:isCurrent?`0 4px 16px ${block.color}22`:"none"}}>
              {/* Block header */}
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderBottom:blockTasks.length>0?"1px solid var(--b1)":"none",background:isCurrent?block.color+"11":"transparent"}}>
                <div style={{width:36,height:36,borderRadius:10,background:block.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{block.icon}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:7}}>
                    {block.label}
                    {isCurrent&&<span style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:block.color+"33",color:block.color,fontWeight:700}}>● Now</span>}
                  </div>
                  <div style={{fontSize:11.5,color:"var(--t3)",marginTop:1}}>{block.time} · {blockTasks.length} task{blockTasks.length!==1?"s":""}</div>
                </div>
                <button style={{height:30,padding:"0 11px",background:block.color+"22",color:block.color,borderRadius:9,fontSize:12,fontWeight:700,border:`1px solid ${block.color}44`}} onClick={()=>setShowPlannerPicker(showPlannerPicker===block.id?null:block.id)}>+ Add</button>
              </div>
              {/* Tasks in block */}
              {blockTasks.map(task=>{
                if(!task) return null;
                const done = plannerDone[task.id];
                return (
                  <div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:"1px solid var(--b1)",background:done?"var(--s2)":"transparent",transition:"background .2s"}}>
                    <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${done?block.color:"var(--s4)"}`,background:done?block.color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,cursor:"pointer",transition:"all .2s"}} onClick={()=>togglePlannerDone(task.id)}>
                      {done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}
                    </div>
                    <span style={{fontSize:13,fontWeight:600,flex:1,textDecoration:done?"line-through":"none",color:done?"var(--t3)":"var(--t1)"}}>{task.title}</span>
                    <span style={{fontSize:11,padding:"2px 7px",borderRadius:20,background:PRIORITIES[task.priority]?.bg,color:PRIORITIES[task.priority]?.color,fontWeight:600}}>{task.priority}</span>
                    <button style={{width:22,height:22,borderRadius:6,background:"rgba(255,107,107,.1)",color:"var(--red)",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>removeFromPlan(task.id)}>✕</button>
                  </div>
                );
              })}
              {/* Task picker dropdown */}
              {showPlannerPicker===block.id&&(
                <div style={{padding:"10px 14px",background:"var(--s2)",borderTop:"1px solid var(--b1)"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",marginBottom:7,letterSpacing:.5,textTransform:"uppercase"}}>Pick a task to add:</div>
                  {unscheduled.length===0&&<div style={{fontSize:12.5,color:"var(--t3)"}}>All tasks are scheduled! ✓</div>}
                  {unscheduled.slice(0,6).map(task=>(
                    <div key={task.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"var(--s1)",borderRadius:9,cursor:"pointer",marginBottom:5,border:"1px solid var(--b1)",transition:"all .15s"}} onClick={()=>assignToBlock(task.id,block.id)}>
                      <span style={{fontSize:13}}>{PRIORITIES[task.priority]?.icon}</span>
                      <span style={{fontSize:13,flex:1,fontWeight:500}}>{task.title}</span>
                      <span style={{fontSize:11,color:"var(--t3)"}}>{task.due?fmtDate(task.due):""}</span>
                    </div>
                  ))}
                  {unscheduled.length>6&&<div style={{fontSize:12,color:"var(--t3)",textAlign:"center",marginTop:4}}>+{unscheduled.length-6} more tasks…</div>}
                </div>
              )}
            </div>
          );
        })}

        {/* Unscheduled tasks */}
        {unscheduled.length>0&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"14px",marginTop:4}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>📋 Unscheduled ({unscheduled.length})</div>
            {unscheduled.map(task=>(
              <div key={task.id} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",background:"var(--s2)",borderRadius:9,marginBottom:6}}>
                <span style={{fontSize:13}}>{PRIORITIES[task.priority]?.icon}</span>
                <span style={{fontSize:13,flex:1,fontWeight:500}}>{task.title}</span>
                <div style={{display:"flex",gap:5}}>
                  {TIME_BLOCKS.map(b=>(
                    <button key={b.id} style={{width:26,height:26,borderRadius:7,background:b.color+"22",color:b.color,fontSize:11,fontWeight:700,border:`1px solid ${b.color}44`,cursor:"pointer"}} title={`Add to ${b.label}`} onClick={()=>assignToBlock(task.id,b.id)}>{b.icon}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPlanned===0&&unscheduled.length===0&&(
          <div className="empty"><div className="empty-icon">⏰</div><div className="empty-t">No tasks to plan!</div><div style={{fontSize:12.5,color:"var(--t3)"}}>Add some tasks first, then come back to plan your day</div></div>
        )}
      </div>
    );
  };


  //  PROJECT BOARD — Kanban / Roadmap (Firebase Realtime)
  // ══════════════════════════════════════════════════════
  const DEFAULT_COLUMNS = [
    {id:"backlog",  title:"💡 Backlog",   color:"#7c8ff5"},
    {id:"todo",     title:"📋 To Do",     color:"#ffd93d"},
    {id:"progress", title:"⚡ In Progress",color:"#ff9f43"},
    {id:"review",   title:"🔍 Review",    color:"#d47cff"},
    {id:"done",     title:"✅ Done",      color:"#6bcb77"},
  ];
  const CARD_COLORS = ["#7c6dfa","#6bcb77","#ffd93d","#ff6b6b","#ff9f43","#48dbfb","#d47cff","#f589a3","#00d4aa","#7c8ff5"];
  const CARD_LABELS = ["Feature","Bug","Design","Research","Urgent","Backend","Frontend","Marketing","Planning","Review"];

  const [boardColumns, setBoardColumns]   = useState(DEFAULT_COLUMNS);
  const [boardCards,   setBoardCards]     = useState([]);
  
  const [boardSyncing,    setBoardSyncing]    = useState(false);
  const [boardRoomCode,   setBoardRoomCode]   = useState("");
  const [boardConnected,  setBoardConnected]  = useState(false);
  const [boardUnsub,      setBoardUnsub]      = useState({col:null,card:null});
  const [dragCard,        setDragCard]        = useState(null);   // id being dragged
  const [dragOver,        setDragOver]        = useState(null);   // colId hovered
  const [showCardModal,   setShowCardModal]   = useState(false);
  const [showColModal,    setShowColModal]    = useState(false);
  const [editCard,        setEditCard]        = useState(null);
  const [cardForm,        setCardForm]        = useState({title:"",desc:"",color:"#7c6dfa",label:"Feature",priority:"medium",assignee:"👤"});
  const [cardFormCol,     setCardFormCol]     = useState("backlog");
  const [colForm,         setColForm]         = useState({title:"",color:"#7c6dfa"});
  const [expandedCard,    setExpandedCard]    = useState(null);
  const [boardTab,        setBoardTab]        = useState("board");
  const [shareInput,      setShareInput]      = useState("");
  const [showMoreMenu,    setShowMoreMenu]    = useState(false);
  const [notes,           setNotes]           = useState(()=>{try{const s=localStorage.getItem("tf_notes");return s?JSON.parse(s):[];}catch{return [];}});
  const [showNoteModal,   setShowNoteModal]   = useState(false);
  const [editNote,        setEditNote]        = useState(null);
  const [noteForm,        setNoteForm]        = useState({title:"",body:"",color:"#7c6dfa",pinned:false});
  const [wallpaper,       setWallpaper]       = useState(()=>{try{return localStorage.getItem("tf_wallpaper")||"none";}catch{return "none";}});

  const [showAiModal,     setShowAiModal]     = useState(false);
  const [aiInput,         setAiInput]         = useState("");
  const [aiLoading,       setAiLoading]       = useState(false);
  const [aiTasks,         setAiTasks]         = useState([]);
  const [aiSelected,      setAiSelected]      = useState([]);
  const [moods,           setMoods]           = useState(()=>{try{const s=localStorage.getItem("tf_moods");return s?JSON.parse(s):[];}catch{return [];}});
  const [showMoodModal,   setShowMoodModal]   = useState(false);
  const [todayMood,       setTodayMood]       = useState(null);

  // ── Board Firebase sync ──
  const connectBoard = async (code) => {
    if (!code.trim()) return;
    setBoardSyncing(true);
    try {
      const db = await getDB(); if (!db) throw new Error("Firebase unavailable in preview");
      const room = code.trim().toUpperCase();
      // Sync columns
      const colRef = db.collection("boards").doc(room).collection("columns");
      const cardRef = db.collection("boards").doc(room).collection("cards");
      // Push local data if room is new
      const snap = await colRef.get();
      if (snap.empty) {
        for (const col of boardColumns) await colRef.doc(col.id).set(col);
        for (const card of boardCards)  await cardRef.doc(card.id).set(card);
      }
      // Subscribe
      const unsubCol  = colRef.onSnapshot(s  => setBoardColumns(s.docs.map(d=>({...d.data(),id:d.id}))));
      const unsubCard = cardRef.onSnapshot(s => setBoardCards(s.docs.map(d=>({...d.data(),id:d.id}))));
      setBoardUnsub({col:unsubCol,card:unsubCard});
      setBoardConnected(true); setBoardRoomCode(room); setBoardSyncing(false);
      showNotif("🔥 Board synced!","Room: "+room);
    } catch(e) { setBoardSyncing(false); showNotif("❌ Board error", e.message); }
  };
  const disconnectBoard = () => {
    boardUnsub.col?.(); boardUnsub.card?.();
    setBoardConnected(false); setBoardRoomCode(""); setBoardSyncing(false);
    showNotif("👋 Disconnected","Board is now local only");
  };

  const pushCard = async (card) => {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(card.id).set(card); } catch(e) {}
  };
  const pushCol = async (col) => {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(col.id).set(col); } catch(e) {}
  };
  const deleteCardRemote = async (id) => {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(id).delete(); } catch(e) {}
  };
  const deleteColRemote = async (id) => {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(id).delete(); } catch(e) {}
  };

  // ── Card CRUD ──
  const saveCard = async () => {
    if (!cardForm.title.trim()) return;
    const card = editCard
      ? {...editCard, ...cardForm}
      : {id:uid(), colId:cardFormCol, ...cardForm, createdAt:Date.now()};
    if (editCard) setBoardCards(cs=>cs.map(c=>c.id===card.id?card:c));
    else setBoardCards(cs=>[...cs, card]);
    await pushCard(card);
    setShowCardModal(false); setEditCard(null); play("add");
    showNotif(editCard?"✎ Card updated":"✨ Card added", card.title);
  };
  const deleteCard = async (id) => {
    setBoardCards(cs=>cs.filter(c=>c.id!==id));
    await deleteCardRemote(id);
    setExpandedCard(null); play("delete");
  };
  const moveCard = async (cardId, toColId) => {
    const card = boardCards.find(c=>c.id===cardId);
    if (!card || card.colId===toColId) return;
    const updated = {...card, colId:toColId};
    setBoardCards(cs=>cs.map(c=>c.id===cardId?updated:c));
    await pushCard(updated); play("tap");
  };

  // ── Column CRUD ──
  const addColumn = async () => {
    if (!colForm.title.trim()) return;
    const col = {id:uid(), title:colForm.title.trim(), color:colForm.color};
    setBoardColumns(cs=>[...cs, col]);
    await pushCol(col);
    setShowColModal(false); setColForm({title:"",color:"#7c6dfa"}); play("add");
  };
  const deleteColumn = async (colId) => {
    setBoardColumns(cs=>cs.filter(c=>c.id!==colId));
    const toDelete = boardCards.filter(c=>c.colId===colId);
    setBoardCards(cs=>cs.filter(c=>c.colId!==colId));
    for (const c of toDelete) await deleteCardRemote(c.id);
    await deleteColRemote(colId); play("delete");
  };

  // ── Drag & Drop ──
  const onDragStart = (e, cardId) => { setDragCard(cardId); e.dataTransfer.effectAllowed="move"; };
  const onDragOver  = (e, colId)  => { e.preventDefault(); setDragOver(colId); };
  const onDrop      = (e, colId)  => { e.preventDefault(); if(dragCard) moveCard(dragCard,colId); setDragCard(null); setDragOver(null); };
  const onDragEnd   = ()          => { setDragCard(null); setDragOver(null); };

  const PRIORITY_STYLES = {high:{bg:"rgba(255,107,107,.15)",color:"#ff6b6b"},medium:{bg:"rgba(255,159,67,.15)",color:"#ff9f43"},low:{bg:"rgba(107,203,119,.15)",color:"#6bcb77"}};

  const BoardPage = () => {
    const myBoardCode = "BRD-"+(myRoomCode||"").slice(3);

    return (
      <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>

        {/* Board topbar */}
        <div style={{padding:"12px 16px 0",flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,lineHeight:1.1}}>🗂 Project Board</div>
              <div style={{fontSize:11.5,color:"var(--t3)",marginTop:2,display:"flex",alignItems:"center",gap:6}}>
                {boardConnected
                  ? <><span style={{color:"#6bcb77",fontWeight:700}}>🔥 Live</span> · Room {boardRoomCode} · {boardCards.length} cards</>
                  : <span>Local only · {boardCards.length} cards</span>}
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{height:32,padding:"0 11px",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,fontSize:12,color:"var(--t2)",fontWeight:600}} onClick={()=>setBoardTab(t=>t==="share"?"board":"share")}>
                {boardConnected?"🔥 Synced":"🔗 Share"}
              </button>
              <button style={{height:32,padding:"0 11px",background:accent.v,borderRadius:9,fontSize:12,color:"#fff",fontWeight:700,boxShadow:`0 3px 10px ${accent.v}40`}}
                onClick={()=>{setEditCard(null);setCardForm({title:"",desc:"",color:"#7c6dfa",label:"Feature",priority:"medium",assignee:"👤"});setCardFormCol(boardColumns[0]?.id||"backlog");setShowCardModal(true);}}>
                + Card
              </button>
              <button style={{height:32,padding:"0 10px",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,fontSize:13,color:"var(--t2)"}}
                onClick={()=>setShowColModal(true)} title="Add column">⊕</button>
            </div>
          </div>

          {/* Share panel */}
          {boardTab==="share"&&(
            <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:13,padding:"13px 14px",marginBottom:10}}>
              {!boardConnected ? (<>
                <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>🔗 Share this board in real time</div>
                <div style={{fontSize:12.5,color:"var(--t2)",marginBottom:10,lineHeight:1.6}}>Enter a room code to sync this board with teammates. Anyone with the same code sees all changes instantly via Firebase.</div>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input style={{flex:1,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"9px 12px",fontSize:13,color:"var(--t1)",letterSpacing:1.5,textTransform:"uppercase"}}
                    placeholder="Enter or create room code…" value={shareInput} onChange={e=>setShareInput(e.target.value.toUpperCase())}/>
                  <button style={{height:40,padding:"0 14px",background:accent.v,borderRadius:9,fontSize:13,fontWeight:700,color:"#fff"}} onClick={()=>connectBoard(shareInput||myBoardCode)}>
                    {boardSyncing?"⏳":"Connect"}
                  </button>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{fontSize:11.5,color:"var(--t3)"}}>Your code:</div>
                  <div style={{flex:1,background:"var(--s2)",borderRadius:8,padding:"6px 11px",fontSize:13,fontWeight:800,color:accent.v,letterSpacing:2,cursor:"pointer"}} onClick={()=>{navigator.clipboard?.writeText(myBoardCode);showNotif("📋 Copied!",myBoardCode);}}>
                    {myBoardCode}
                  </div>
                  <button style={{height:32,padding:"0 11px",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:8,fontSize:12,color:"var(--t2)"}} onClick={()=>{navigator.share?.({title:"Join my board",text:`Join my Taskflow board! Code: ${myBoardCode}`})||showNotif("🔗 Share","Code: "+myBoardCode);}}>Share</button>
                </div>
              </>) : (
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#6bcb77"}}>🔥 Live syncing — Room {boardRoomCode}</div>
                    <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>All changes sync instantly for everyone with this code</div>
                  </div>
                  <button style={{height:32,padding:"0 11px",background:"rgba(255,107,107,.12)",color:"var(--red)",borderRadius:8,fontSize:12,fontWeight:600,border:"1px solid rgba(255,107,107,.25)"}} onClick={disconnectBoard}>Disconnect</button>
                </div>
              )}
            </div>
          )}

          {/* Column header strip */}
          <div style={{display:"flex",gap:0,overflowX:"auto",paddingBottom:4,scrollbarWidth:"none"}}>
            {boardColumns.map(col=>{
              const count = boardCards.filter(c=>c.colId===col.id).length;
              return (
                <div key={col.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:20,marginRight:6,background:col.color+"18",flexShrink:0}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:col.color}}/>
                  <span style={{fontSize:12,fontWeight:700,color:col.color,whiteSpace:"nowrap"}}>{col.title}</span>
                  <span style={{fontSize:11,background:col.color+"33",color:col.color,borderRadius:20,padding:"0 6px",fontWeight:700}}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Kanban board scroll area */}
        <div style={{flex:1,overflowX:"auto",overflowY:"hidden",padding:"10px 12px 20px",display:"flex",gap:12,alignItems:"flex-start",minHeight:0}}>
          {boardColumns.map(col=>{
            const colCards = boardCards.filter(c=>c.colId===col.id).sort((a,b)=>b.createdAt-a.createdAt);
            const isOver = dragOver===col.id;
            return (
              <div key={col.id}
                style={{width:260,minWidth:260,background:isOver?col.color+"14":"var(--s1)",border:`1.5px solid ${isOver?col.color:"var(--b1)"}`,borderRadius:16,display:"flex",flexDirection:"column",maxHeight:"calc(100vh - 220px)",transition:"all .2s",flexShrink:0}}
                onDragOver={e=>onDragOver(e,col.id)} onDrop={e=>onDrop(e,col.id)}>

                {/* Column header */}
                <div style={{padding:"12px 13px 8px",borderBottom:"1px solid var(--b1)",flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:10,height:10,borderRadius:3,background:col.color,flexShrink:0}}/>
                    <span style={{fontSize:13.5,fontWeight:700,flex:1}}>{col.title}</span>
                    <span style={{fontSize:11,background:col.color+"22",color:col.color,borderRadius:20,padding:"1px 8px",fontWeight:700}}>{colCards.length}</span>
                    <button style={{width:24,height:24,borderRadius:7,background:"var(--s2)",fontSize:12,color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center"}}
                      onClick={()=>{setCardFormCol(col.id);setEditCard(null);setCardForm({title:"",desc:"",color:col.color,label:"Feature",priority:"medium",assignee:"👤"});setShowCardModal(true);}}>+</button>
                    {boardColumns.length>1&&<button style={{width:24,height:24,borderRadius:7,background:"transparent",fontSize:11,color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>{deleteColumn(col.id);}}>✕</button>}
                  </div>
                </div>

                {/* Cards */}
                <div style={{flex:1,overflowY:"auto",padding:"8px 9px",display:"flex",flexDirection:"column",gap:7}}>
                  {colCards.length===0&&(
                    <div style={{textAlign:"center",padding:"24px 10px",color:"var(--t3)",fontSize:12,border:"1.5px dashed var(--b2)",borderRadius:11}}>
                      Drop cards here
                    </div>
                  )}
                  {colCards.map(card=>{
                    const isExpanded = expandedCard===card.id;
                    return (
                      <div key={card.id}
                        draggable onDragStart={e=>onDragStart(e,card.id)} onDragEnd={onDragEnd}
                        style={{background:"var(--s2)",borderRadius:12,padding:"11px 12px",border:`1px solid var(--b1)`,cursor:"grab",transition:"all .2s",opacity:dragCard===card.id?0.4:1,borderLeft:`3px solid ${card.color}`,boxShadow:dragCard===card.id?"0 8px 24px rgba(0,0,0,.2)":"none"}}>

                        {/* Card top row */}
                        <div style={{display:"flex",alignItems:"flex-start",gap:6,marginBottom:7}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13,fontWeight:700,lineHeight:1.35,marginBottom:4}}>{card.title}</div>
                            {card.label&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:card.color+"22",color:card.color,fontWeight:700}}>{card.label}</span>}
                          </div>
                          <div style={{display:"flex",gap:4,flexShrink:0}}>
                            <button style={{width:24,height:24,borderRadius:6,background:"var(--s3)",fontSize:11,color:"var(--t3)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>{setEditCard(card);setCardForm({title:card.title,desc:card.desc||"",color:card.color,label:card.label,priority:card.priority,assignee:card.assignee||"👤"});setCardFormCol(card.colId);setShowCardModal(true);}}>✎</button>
                            <button style={{width:24,height:24,borderRadius:6,background:"rgba(255,107,107,.1)",fontSize:11,color:"var(--red)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>deleteCard(card.id)}>✕</button>
                          </div>
                        </div>

                        {/* Description preview */}
                        {card.desc&&<div style={{fontSize:11.5,color:"var(--t3)",lineHeight:1.5,marginBottom:7,display:isExpanded?"block":"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{card.desc}</div>}

                        {/* Card footer */}
                        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:4}}>
                          <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,fontWeight:600,...PRIORITY_STYLES[card.priority]}}>{card.priority}</span>
                          {col.id!=="done"&&<button style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"rgba(107,203,119,.15)",color:"#6bcb77",border:"1px solid rgba(107,203,119,.3)",fontWeight:700,cursor:"pointer"}} onClick={e=>{e.stopPropagation();moveCard(card.id,"done");}}>✓</button>}
                          {col.id==="done"&&<button style={{fontSize:10,padding:"2px 8px",borderRadius:20,background:"rgba(255,159,67,.15)",color:"#ff9f43",border:"1px solid rgba(255,159,67,.3)",fontWeight:700,cursor:"pointer"}} onClick={e=>{e.stopPropagation();moveCard(card.id,"todo");}}>↩</button>}
                          <span style={{fontSize:16,marginLeft:"auto"}}>{card.assignee}</span>
                          {card.desc&&<button style={{fontSize:10,color:"var(--t3)",padding:"1px 5px",background:"var(--s3)",borderRadius:5}} onClick={()=>setExpandedCard(isExpanded?null:card.id)}>{isExpanded?"▲":"▼"}</button>}
                        </div>

                        {/* Move to column */}
                        {isExpanded&&(
                          <div style={{marginTop:9,paddingTop:9,borderTop:"1px solid var(--b1)"}}>
                            <div style={{fontSize:10,color:"var(--t3)",marginBottom:5,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Move to:</div>
                            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                              {boardColumns.filter(c=>c.id!==col.id).map(c=>(
                                <button key={c.id} style={{fontSize:10,padding:"3px 8px",borderRadius:20,background:c.color+"22",color:c.color,border:`1px solid ${c.color}44`,fontWeight:600,cursor:"pointer"}} onClick={()=>{moveCard(card.id,c.id);setExpandedCard(null);}}>
                                  → {c.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add column shortcut */}
          <div style={{width:200,minWidth:200,flexShrink:0,background:"var(--s1)",border:"1.5px dashed var(--b2)",borderRadius:16,padding:"20px 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:8,cursor:"pointer",color:"var(--t3)",transition:"all .2s",height:120}} onClick={()=>setShowColModal(true)}>
            <div style={{fontSize:24}}>⊕</div>
            <div style={{fontSize:12.5,fontWeight:600}}>Add Column</div>
          </div>
        </div>

      </div>
    );
  };

  // ── ChatBot ──
  const QUICK = ["Plan my day","What to do first?","Motivate me","Give a tip","I'm overwhelmed","What is Pomodoro?","How am I doing?","Stats overview"];
  const [chatMsgs, setChatMsgs] = useState([{from:"bot",text:`👋 Hi! I'm Taskly Bot — your offline assistant!\n\nI know all your tasks and work with no internet. Ask me anything! 🚀`}]);
  const [chatInput, setChatInput] = useState(""); const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef(null);
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[chatMsgs,chatTyping]);
  const sendChat = (ov=null) => {
    const text=ov||chatInput.trim(); if(!text)return;
    setChatInput(""); setChatMsgs(m=>[...m,{from:"user",text}]); setChatTyping(true); play("tap");
    setTimeout(()=>{ setChatMsgs(m=>[...m,{from:"bot",text:smartBot(text,profileTasks,categories,t)}]); setChatTyping(false); },350+Math.random()*350);
  };
  // ── Notification & Alarm System ──
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const checkAlarms = () => {
      const now = new Date();
      const todayStr = now.toISOString().slice(0,10);
      const timeStr = now.getHours().toString().padStart(2,"0")+":"+now.getMinutes().toString().padStart(2,"0");
      tasks.forEach(task => {
        if (!task.reminder || task.done) return;
        const remDate = task.reminderDate || task.due || todayStr;
        const remTime = task.reminderTime || "09:00";
        if (remDate === todayStr && remTime === timeStr) {
          play("add");
          showNotif("⏰ Reminder!", task.title);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏰ Taskflow Reminder", {body: task.title, icon:"/favicon.ico"});
          }
        }
      });
    };
    const interval = setInterval(checkAlarms, 30000);
    return () => clearInterval(interval);
  }, [tasks]);


  // ── Mood Tracker ──
  const MOOD_OPTIONS = [
    {emoji:"😴",label:"Exhausted",energy:1,color:"#8b9dc3"},
    {emoji:"😟",label:"Stressed",energy:2,color:"#ff6b6b"},
    {emoji:"😐",label:"Meh",energy:3,color:"#ffd93d"},
    {emoji:"😊",label:"Good",energy:4,color:"#6bcb77"},
    {emoji:"🚀",label:"Amazing",energy:5,color:"#7c6dfa"},
  ];

  useEffect(()=>{
    const today = new Date().toISOString().slice(0,10);
    const entry = moods.find(m=>m.date===today);
    setTodayMood(entry||null);
  },[moods]);

  const saveMood = (moodIdx) => {
    const today = new Date().toISOString().slice(0,10);
    const entry = {id:uid(),date:today,mood:moodIdx,energy:MOOD_OPTIONS[moodIdx].energy,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})};
    setMoods(ms=>[...ms.filter(m=>m.date!==today),entry]);
    setTodayMood(entry);
    setShowMoodModal(false);
    showNotif("😊 Mood logged!",MOOD_OPTIONS[moodIdx].label);
    play("add");
  };

  const MoodPage = () => {
    const last7 = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-6+i);
      const ds=d.toISOString().slice(0,10);
      return {ds, day:d.toLocaleDateString("en",{weekday:"short"}), entry:moods.find(m=>m.date===ds)};
    });
    const avgMood = moods.length?(moods.reduce((a,m)=>a+m.energy,0)/moods.length).toFixed(1):"—";
    const streak = (()=>{let s=0,d=new Date();for(let i=0;i<30;i++){const ds=d.toISOString().slice(0,10);if(!moods.find(m=>m.date===ds))break;s++;d.setDate(d.getDate()-1);}return s;})();
    const today=new Date().toISOString().slice(0,10);

    return (
      <div style={{padding:"18px 18px 100px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>😊 Mood Tracker</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Track your daily energy & wellbeing</div>
          </div>
          <button onClick={()=>setShowMoodModal(true)} style={{height:38,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>
            {moods.some(m=>m.date===today)?"Update":"+ Log"}
          </button>
        </div>

        {todayMood?(
          <div style={{background:`linear-gradient(135deg,${MOOD_OPTIONS[todayMood.mood].color}22,${MOOD_OPTIONS[todayMood.mood].color}11)`,border:`1px solid ${MOOD_OPTIONS[todayMood.mood].color}44`,borderRadius:18,padding:"20px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:6}}>{MOOD_OPTIONS[todayMood.mood].emoji}</div>
            <div style={{fontSize:18,fontWeight:700,color:MOOD_OPTIONS[todayMood.mood].color}}>{MOOD_OPTIONS[todayMood.mood].label}</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:4}}>Logged at {todayMood.time}</div>
          </div>
        ):(
          <div onClick={()=>setShowMoodModal(true)} style={{background:"var(--s2)",border:"2px dashed var(--b2)",borderRadius:18,padding:"24px",marginBottom:20,textAlign:"center",cursor:"pointer"}}>
            <div style={{fontSize:36,marginBottom:8}}>🌅</div>
            <div style={{fontSize:14,fontWeight:600,color:"var(--t2)"}}>How are you feeling today?</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:4}}>Tap to log your mood</div>
          </div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20}}>
          {[{icon:"📊",label:"Avg Mood",val:avgMood},{icon:"🔥",label:"Streak",val:streak},{icon:"📝",label:"Total",val:moods.length}].map(s=>(
            <div key={s.label} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 10px",textAlign:"center"}}>
              <div style={{fontSize:20}}>{s.icon}</div>
              <div style={{fontSize:18,fontWeight:800,color:"var(--t1)",marginTop:4}}>{s.val}</div>
              <div style={{fontSize:10.5,color:"var(--t3)",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"16px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>📅 Last 7 Days</div>
          <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",height:90,gap:4}}>
            {last7.map(({ds,day,entry})=>(
              <div key={ds} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                <div style={{fontSize:entry?16:10,opacity:entry?1:.3}}>{entry?MOOD_OPTIONS[entry.mood].emoji:"·"}</div>
                <div style={{width:"100%",background:"var(--s3)",borderRadius:6,height:60,display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
                  <div style={{width:"100%",height:entry?`${(entry.energy/5)*100}%`:"0%",background:entry?MOOD_OPTIONS[entry.mood].color:"transparent",borderRadius:6,transition:"height .4s",minHeight:entry?4:0}}/>
                </div>
                <div style={{fontSize:10,color:"var(--t3)",fontWeight:600}}>{day}</div>
              </div>
            ))}
          </div>
        </div>

        {moods.length>0&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 16px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>📋 Recent</div>
            {[...moods].reverse().slice(0,5).map(m=>(
              <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:"1px solid var(--b1)"}}>
                <span style={{fontSize:24}}>{MOOD_OPTIONS[m.mood].emoji}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:MOOD_OPTIONS[m.mood].color}}>{MOOD_OPTIONS[m.mood].label}</div>
                </div>
                <div style={{fontSize:11,color:"var(--t3)"}}>{m.date} {m.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };


  const ChatPanelContent = () => (<>
    <div className="chat-head"><div className="chat-head-row"><div className="chat-title"><div className="dot"/>Taskly Bot</div><span className="offline-pill">● Offline</span></div><div className="chat-sub">Built-in · Free forever · No internet</div></div>
    <div className="chat-msgs">{chatMsgs.map((m,i)=><div key={i} className={`msg ${m.from==="user"?"u":"a"}`}><div className="bubble">{m.text}</div></div>)}{chatTyping&&<div className="msg a"><div className="bubble"><div className="typing-b"><div className="tdot"/><div className="tdot"/><div className="tdot"/></div></div></div>}<div ref={chatEndRef}/></div>
    <div className="chat-quick">{QUICK.map(q=><button key={q} className="qbtn" onClick={()=>sendChat(q)}>{q}</button>)}</div>
    <div className="chat-inp"><textarea className="chat-ta" rows={1} placeholder="Ask me anything…" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}/><button className="send-btn" disabled={!chatInput.trim()||chatTyping} onClick={()=>sendChat()}><span style={{color:"#fff",fontSize:13,fontWeight:700}}>↑</span></button></div>
  </>);

  const detailTask = tasks.find(x=>x.id===detailTaskId);

  // ══════════════════════════════════════════
  //  QUICK NOTES & SCRATCH PAD
  // ══════════════════════════════════════════
  const NOTE_COLORS = ["#7c6dfa","#ff6b6b","#6bcb77","#ffd93d","#ff9f43","#48dbfb","#f589a3","#d47cff"];

  const saveNote = () => {
    if(!noteForm.title.trim()&&!noteForm.body.trim()) return;
    if(editNote) {
      setNotes(ns=>ns.map(n=>n.id===editNote.id?{...n,...noteForm}:n));
      showNotif("✏️ Note updated!", noteForm.title||"Untitled");
    } else {
      setNotes(ns=>[{id:uid(),createdAt:Date.now(),...noteForm}, ...ns]);
      showNotif("📝 Note saved!", noteForm.title||"Untitled");
      play("add");
    }
    setShowNoteModal(false);
    setEditNote(null);
    setNoteForm({title:"",body:"",color:"#7c6dfa",pinned:false});
  };

  const deleteNote = (id) => {
    setNotes(ns=>ns.filter(n=>n.id!==id));
    play("delete");
    showNotif("🗑 Note deleted","");
  };

  const togglePinNote = (id) => {
    setNotes(ns=>ns.map(n=>n.id===id?{...n,pinned:!n.pinned}:n));
    play("tap");
  };

  const NotesPage = () => {
    const pinned = notes.filter(n=>n.pinned).sort((a,b)=>b.createdAt-a.createdAt);
    const unpinned = notes.filter(n=>!n.pinned).sort((a,b)=>b.createdAt-a.createdAt);
    const allNotes = [...pinned,...unpinned];

    return (
      <div style={{padding:"18px 18px 100px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>📝 Notes</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{notes.length} notes · {pinned.length} pinned</div>
          </div>
          <button onClick={()=>{setNoteForm({title:"",body:"",color:"#7c6dfa",pinned:false});setEditNote(null);setShowNoteModal(true);}} style={{height:38,padding:"0 16px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>
            + New
          </button>
        </div>

        {notes.length===0&&(
          <div style={{textAlign:"center",padding:"60px 20px",color:"var(--t3)"}}>
            <div style={{fontSize:52,marginBottom:12}}>📝</div>
            <div style={{fontSize:16,fontWeight:600,color:"var(--t2)",marginBottom:8}}>No notes yet</div>
            <div style={{fontSize:13,lineHeight:1.6}}>Tap + New to jot down ideas, reminders or anything on your mind</div>
          </div>
        )}

        {pinned.length>0&&(
          <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>📌 Pinned</div>
        )}

        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}}>
          {allNotes.map((note,idx)=>(
            <div key={note.id}>
              {!note.pinned&&idx===pinned.length&&pinned.length>0&&(
                <div style={{gridColumn:"1/-1",fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:1,textTransform:"uppercase",marginBottom:10,marginTop:6}}>Others</div>
              )}
              <div style={{background:`${note.color}18`,border:`1px solid ${note.color}33`,borderRadius:16,padding:"14px 14px 10px",cursor:"pointer",position:"relative",minHeight:100,transition:"transform .15s"}}
                onClick={()=>{setNoteForm({title:note.title,body:note.body,color:note.color,pinned:note.pinned});setEditNote(note);setShowNoteModal(true);}}>
                <div style={{position:"absolute",top:8,right:8,display:"flex",gap:4}}>
                  <button style={{fontSize:13,background:"none",border:"none",cursor:"pointer",opacity:note.pinned?1:.4,padding:"2px"}} onClick={e=>{e.stopPropagation();togglePinNote(note.id);}}>📌</button>
                  <button style={{fontSize:12,background:"none",border:"none",cursor:"pointer",opacity:.5,padding:"2px",color:"var(--red)"}} onClick={e=>{e.stopPropagation();deleteNote(note.id);}}>✕</button>
                </div>
                {note.title&&<div style={{fontSize:13.5,fontWeight:700,color:note.color,marginBottom:6,paddingRight:40,lineHeight:1.3}}>{note.title}</div>}
                {note.body&&<div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:4,WebkitBoxOrient:"vertical"}}>{note.body}</div>}
                <div style={{fontSize:10,color:"var(--t3)",marginTop:8}}>{new Date(note.createdAt).toLocaleDateString("en",{month:"short",day:"numeric"})}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };


  // ── AI Smart Task Breakdown ──
  const aiBreakdown = async () => {
    if (!aiInput.trim()) return;
    setAiLoading(true);
    setAiTasks([]);
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Break down this goal into 5-8 specific actionable tasks. Goal: "${aiInput}". 
Reply ONLY with a JSON array like: ["Task 1", "Task 2", "Task 3"]. No other text.`
          }]
        })
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || "[]";
      const clean = text.replace(/\`\`\`json|\`\`\`/g,"").trim();
      const tasks = JSON.parse(clean);
      setAiTasks(tasks);
      setAiSelected(tasks.map((_,i)=>i));
    } catch(e) {
      // ── Offline Smart Breakdown Engine ──
      const goal = aiInput.toLowerCase();
      let tasks = [];

      // FITNESS & HEALTH
      if(/(fitness|workout|gym|exercise|weight loss|lose weight|get fit|muscle|run|running|marathon|yoga|strength)/.test(goal)){
        if(/(run|marathon|5k|10k)/.test(goal)) tasks=["Download a beginner running plan (Couch to 5K)","Buy proper running shoes from a sports store","Start Week 1: Walk 30 min 3× this week","Track each run — distance, time, how you felt","Increase running time by 10% each week","Join a local running group or online community","Enter a fun run or 5K race to stay motivated","Rest and stretch after every run session"];
        else if(/(yoga|meditat|flexibility|stretch)/.test(goal)) tasks=["Find a beginner yoga YouTube channel (Yoga with Adriene)","Set a fixed daily yoga time (morning is best)","Start with 15 min sessions 5× per week","Learn 5 foundational poses this week","Track your flexibility progress with photos","Upgrade to 30-min sessions after 2 weeks","Try a different yoga style: Vinyasa, Yin, or Hatha","Set a 30-day yoga challenge goal"];
        else tasks=["Schedule 3 workout days per week in your calendar","Choose your workout type: gym, home, running or sport","Buy or borrow basic equipment (resistance bands, dumbbells)","Find a beginner program online (search YouTube)","Start with 30 min sessions — do not skip warm-up","Track workouts: exercises, sets, reps, weight used","Increase intensity by 5-10% every two weeks","Plan high-protein meals to support your training","Find a workout buddy for accountability","Set a 90-day body transformation goal with milestones"];
      }

      // LEARNING A SKILL
      else if(/(learn|study|skill|guitar|piano|music|instrument|language|spanish|french|coding|programming|drawing|art|photography|chess|cooking|baking|writing|speak|public speak)/.test(goal)){
        if(/(guitar|piano|drums|instrument|music)/.test(goal)) tasks=["Buy or borrow the instrument you're learning","Find a beginner course (YouTube, Yousician, or local teacher)","Practice 20 minutes every single day — consistency beats duration","Learn 3 basic chords or scales this first week","Record yourself weekly to hear your improvement","Join an online community (Reddit r/learnguitar, etc.)","Set a goal: play one full song within 30 days","Perform for a friend or family member — accountability!"];
        else if(/(language|spanish|french|hindi|arabic|german|japanese|korean)/.test(goal)) tasks=["Download Duolingo or Babbel — do 10 min daily","Learn the 100 most common words first","Find a free beginner course on YouTube","Practice speaking out loud — don't just read","Find a language exchange partner (Tandem app)","Watch shows with subtitles in that language","Set a milestone: hold a 2-min conversation in 60 days","Label items around your home in the new language"];
        else if(/(cod|program|developer|software|python|javascript|web dev|app dev)/.test(goal)) tasks=["Choose ONE language to start (Python or JavaScript recommended)","Complete a free beginner course (freeCodeCamp, CS50, or The Odin Project)","Code for 1 hour every day — no exceptions","Build project #1: a simple calculator or to-do list","Learn Git and push your code to GitHub","Join coding communities: Reddit, Discord, Stack Overflow","Build project #2: something you'd actually use","Start applying to junior positions or freelance gigs after 6 months"];
        else tasks=["Research the 3 best resources for learning this skill","Create a daily 20-30 min practice schedule","Complete your first beginner lesson or tutorial today","Set a weekly learning milestone to track progress","Find an online community around this skill","Practice deliberately — focused reps beat casual browsing","Record or document your progress weekly","Set a public challenge: 30 days of consistent practice","Find a mentor or accountability partner","Apply what you learn: do a real project within 30 days"];
      }

      // BUSINESS & STARTUP
      else if(/(business|startup|company|launch|entrepreneur|product|sell|store|ecommerce|freelance|brand|shop|service|agency)/.test(goal)){
        if(/(freelance|consulting|service|agency)/.test(goal)) tasks=["Define your specific service and target client","Create a simple portfolio (even 2-3 sample projects)","Set your pricing: hourly or project-based","Build a basic profile on Upwork, Fiverr, or LinkedIn","Reach out to 10 potential clients this week","Deliver your first project for free or discount to get a review","Ask for a testimonial after every completed job","Raise prices after landing your first 5 clients","Track income and expenses from day one","Set a monthly revenue goal for the next 3 months"];
        else tasks=["Validate the idea: talk to 10 potential customers this week","Define your target customer in one clear sentence","Research 3 main competitors — what are they missing?","Create a lean business model (product, price, channel, customer)","Build an MVP (Minimum Viable Product) — simplest version possible","Get your first 3-5 paying customers before building more","Set up basic legal/financial structure (register, bank account)","Create a simple website or landing page","Launch on social media with behind-the-scenes content","Set 3-month revenue and customer milestones"];
      }

      // APP / SOFTWARE DEVELOPMENT
      else if(/(app|mobile app|website|web app|saas|software|develop|build app|create app)/.test(goal)){
        tasks=["Define core features (write them down — max 5 for v1)","Sketch wireframes on paper or using Figma (free)","Choose your tech stack: React Native, Flutter, or web","Set up your development environment and repo (GitHub)","Build the most critical feature first (not the prettiest)","Create a simple database schema or data structure","Build and test on a real device as early as possible","Get 3-5 beta testers and collect honest feedback","Fix critical bugs before adding new features","Prepare store listing: screenshots, description, icon","Submit to Google Play Store or Samsung Galaxy Store"];
      }

      // WEIGHT LOSS / DIET / NUTRITION
      else if(/(diet|nutrition|eat healthy|meal prep|weight|calor|intermittent fast|keto|vegan)/.test(goal)){
        tasks=["Calculate your daily calorie target (use TDEE calculator)","Remove the top 3 junk foods from your home today","Plan this week's meals on Sunday evening","Meal prep lunches and dinners for 3 days in advance","Drink 2-3 liters of water per day — track it","Eat protein with every meal to stay full longer","Replace sugary drinks with water or black coffee","Walk at least 8,000 steps every day","Track everything you eat for 1 week (MyFitnessPal)","Weigh yourself once a week, same time, same conditions","Don't aim for perfection — aim for 80/20 consistency"];
      }

      // FINANCE & SAVING
      else if(/(money|finance|save|saving|invest|budget|debt|loan|salary|income|wealth|financial|rich|bank)/.test(goal)){
        tasks=["Track every rupee/dollar you spend for 30 days","Create a monthly budget: needs, wants, savings (50/30/20 rule)","Cancel subscriptions you haven't used in 3 months","Build an emergency fund: 3-6 months of expenses","Set up automatic savings transfer on payday","Pay off highest-interest debt first (avalanche method)","Open an investment account (index funds are beginner-friendly)","Read one personal finance book this month","Set a 12-month savings target with monthly milestones","Increase income: freelance, side hustle, or upskill"];
      }

      // READING / BOOKS
      else if(/(read|book|reading habit|library|novel|non-fiction|kindle)/.test(goal)){
        tasks=["Choose your first 3 books and add them to a reading list","Set a daily reading time: 20 minutes before bed works great","Always have your current book accessible (physical or Kindle app)","Take brief notes or highlights on key ideas","Set a monthly goal: 1-2 books per month to start","Join Goodreads to track books and find recommendations","Apply one idea from every non-fiction book you read","Share book summaries with friends — teaching reinforces learning","Try audiobooks during commutes or exercise","Set a yearly reading goal: 12 books = 1 per month"];
      }

      // TRAVEL
      else if(/(travel|trip|vacation|holiday|visit|tour|adventure|backpack|abroad)/.test(goal)){
        tasks=["Choose destination and set travel dates","Research visa requirements and apply early if needed","Set a travel budget and start saving monthly","Book flights at least 6-8 weeks in advance for best prices","Book accommodation (compare Booking.com and Airbnb)","Research top 10 things to do at destination","Plan a rough day-by-day itinerary (leave room for spontaneity)","Pack light — list essentials and halve it","Notify bank of travel dates to avoid card blocks","Download offline maps and translation apps","Get travel insurance before you leave"];
      }

      // MENTAL HEALTH / MINDFULNESS
      else if(/(mental health|mindful|meditat|anxiety|stress relief|self care|self-care|peace|calm|therapist|wellbeing)/.test(goal)){
        tasks=["Start a 5-minute daily meditation (Headspace or YouTube)","Journal 3 things you're grateful for every morning","Set digital boundaries: no phone 1 hour before bed","Get outside for a 20-min walk every day","Identify your top 3 stress triggers this week","Say no to one non-essential commitment this week","Connect with one friend or family member each week","Practice deep breathing: 4-count in, hold, 4-count out","Reduce caffeine if you experience anxiety","Consider talking to a counselor or therapist"];
      }

      // WRITING / CONTENT CREATION
      else if(/(write|writing|blog|content|youtube|video|podcast|creator|author|book|novel|story)/.test(goal)){
        tasks=["Define your niche and target audience clearly","Create a content calendar for the next 30 days","Publish your first piece — don't wait for perfect","Write or create for 30 minutes every single day","Study 3 successful creators in your niche","Build an email list from day one (Mailchimp is free)","Repurpose content across multiple platforms","Engage with comments and build community","Analyze what performs best after 30 days","Collaborate with another creator in your space","Set a milestone: 100 subscribers or readers in 90 days"];
      }

      // CAREER / JOB
      else if(/(career|job|promotion|interview|resume|cv|linkedin|network|salary raise|switch job|new job)/.test(goal)){
        tasks=["Update your resume — keep it to 1 page, results-focused","Rewrite your LinkedIn headline and summary with keywords","List 20 target companies you'd love to work at","Reach out to 5 people in your target field this week","Apply to 3-5 quality jobs per week (not hundreds)","Prepare answers to 10 common interview questions","Research each company before every interview","Follow up after every interview with a thank-you email","Build a skill that makes you more valuable in 90 days","Negotiate every offer — even 5% more compounds over time"];
      }

      // GENERAL GOAL (catch-all — still very detailed)
      else {
        const goalTitle = aiInput.trim();
        tasks=[
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
      setAiSelected(tasks.map((_,i)=>i));
    }
    setAiLoading(false);
  };

  const addAiTasksToApp = () => {
    const selected = aiTasks.filter((_,i)=>aiSelected.includes(i));
    selected.forEach(title => {
      setTasks(ts=>[{
        id:uid(), title, notes:"", priority:"medium",
        categoryId:"work", due:"", photo:null, tags:[], subtasks:[],
        starred:false, recurring:"never", reminder:false,
        reminderTime:"09:00", reminderDate:"", profileId:activeProfile,
        done:false, createdAt:Date.now()
      }, ...ts]);
    });
    showNotif("🤖 "+selected.length+" tasks added!", "AI breakdown complete");
    play("add");
    setShowAiModal(false);
    setAiInput("");
    setAiTasks([]);
    setAiSelected([]);
    setTab("tasks");
  };


  // ── Persist to localStorage ──
  useEffect(()=>{try{localStorage.setItem("tf_tasks",JSON.stringify(tasks));}catch{}}, [tasks]);
  useEffect(()=>{try{localStorage.setItem("tf_cats",JSON.stringify(categories));}catch{}}, [categories]);
  useEffect(()=>{try{localStorage.setItem("tf_profiles",JSON.stringify(profiles));}catch{}}, [profiles]);
  useEffect(()=>{try{localStorage.setItem("tf_dark",JSON.stringify(dark));}catch{}}, [dark]);
  useEffect(()=>{try{localStorage.setItem("tf_accent",JSON.stringify(accentIdx));}catch{}}, [accentIdx]);
  useEffect(()=>{try{localStorage.setItem("tf_lang",langKey);}catch{}}, [langKey]);
  useEffect(()=>{try{localStorage.setItem("tf_goals",JSON.stringify(goals));}catch{}}, [goals]);
  useEffect(()=>{try{localStorage.setItem("tf_habits",JSON.stringify(habits));}catch{}}, [habits]);
  useEffect(()=>{try{localStorage.setItem("tf_moods",JSON.stringify(moods));}catch{}}, [moods]);
  useEffect(()=>{try{localStorage.setItem("tf_wallpaper",wallpaper);}catch{}}, [wallpaper]);
  useEffect(()=>{try{localStorage.setItem("tf_notes",JSON.stringify(notes));}catch{}}, [notes]);
  return (
    <>
      <style>{makeCSS(dark,accent.v,accent.g,langKey==="ar")}</style>

      {/* ── PIN screen (rendered here so all hooks/functions are always called above) ── */}
      {locked && pinEnabled && (
        <div className="pin-screen">
          <div className="pin-icon">🔒</div>
          <div className="pin-title">{t.enterPin}</div>
          <div className="pin-dots">{[0,1,2,3].map(i=><div key={i} className={`pin-dot ${i<pinInput.length?"filled":""}`}/>)}</div>
          {pinError&&<div className="pin-error">{pinError}</div>}
          <div className="pin-pad">
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
              <div key={i} className="pin-key" style={k===""?{opacity:0,pointerEvents:"none"}:{}} onClick={()=>k==="⌫"?handlePinDel():k!==""&&handlePinKey(String(k))}>{k}</div>
            ))}
          </div>
        </div>
      )}

      {/* Rest of app — hidden while locked */}
      {!(locked && pinEnabled) && (<>

      {/* Notification Toast */}
      {notif&&(
        <div className="notif-badge">
          <div className="notif-title">🔔 {notif.title}</div>
          <div className="notif-body">{notif.body}</div>
        </div>
      )}

      <div className="shell" style={{position:"relative"}}>
        {/* Wallpaper layer — behind everything */}
        {wallpaper!=="none"&&(
          <div style={{position:"fixed",inset:0,zIndex:0,backgroundImage:WALLPAPERS.find(w=>w.id===wallpaper)?.gradient,backgroundSize:"cover",backgroundAttachment:"fixed",pointerEvents:"none"}}/>
        )}
        {/* Sidebar */}
        <div className="sidebar">
          <div className="logo"><div className="logo-icon">✦</div><span className="logo-text">{t.appName}</span></div>
          <div className="profile-bar" onClick={()=>{setTab("profiles");play("tap");}}>
            <div className="profile-avatar" style={{background:curProfile.color+"22"}}>{curProfile.icon}</div>
            <span className="profile-name">{curProfile.name}</span>
            <span className="profile-arrow">⇄</span>
          </div>
          <div className="nav-group">
            <div className="nav-lbl">Navigation</div>
            {[
              {id:"tasks",icon:"○",label:t.tasks,cnt:activeCount},
              {id:"starred",icon:"⭐",label:t.starred,cnt:profileTasks.filter(x=>x.starred&&!x.done).length},
              {id:"today",icon:"📅",label:t.today,cnt:profileTasks.filter(x=>x.due===todayStr()&&!x.done).length},
              {id:"overdue",icon:"⚠️",label:t.overdue,cnt:overdueCount},
              {id:"done",icon:"◎",label:t.done,cnt:doneCount},
              {id:"calendar",icon:"📆",label:t.calendar,cnt:null},
              {id:"stats",icon:"📊",label:t.stats,cnt:null},
              {id:"focus",icon:"🧘",label:"Focus",cnt:null},
              {id:"goals",icon:"🏆",label:"Goals",cnt:null},
              {id:"habits",icon:"🔁",label:"Habits",cnt:null},
              {id:"planner",icon:"⏰",label:"Planner",cnt:null},
              {id:"notes",icon:"📝",label:"Notes",cnt:notes.length||null},
              {id:"mood",icon:"😊",label:"Mood",cnt:null},
              {id:"board",icon:"🗂",label:"Board",cnt:null},
              {id:"collab",icon:"👫",label:"Collaborate",cnt:sharedTasks.filter(s=>!s.done).length||null},
              {id:"widgets",icon:"📱",label:"Widgets",cnt:null},
              {id:"bot",icon:"🤖",label:t.assistant,cnt:null},
              {id:"settings",icon:"⚙️",label:t.settings,cnt:null},
              {id:"profiles",icon:"👥",label:t.profiles,cnt:null},
            ].map(v=>(
              <div key={v.id} className={`nav-item ${tab===v.id?"on":""}`} onClick={()=>{setTab(v.id);play("tap");if(v.id==="done"){setShowDone(true);setShowStarred(false);}else if(v.id==="starred"){setShowStarred(true);setShowDone(false);}else if(!["bot","stats","calendar","settings","profiles","focus","collab","widgets","goals","habits","planner","board"].includes(v.id)){setShowDone(false);setShowStarred(false);}}}>
                <span className="nav-icon">{v.icon}</span>{v.label}
                {v.cnt!==null&&<span className="nav-badge">{v.cnt}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="main">
          <div className="topbar">
            <button className="menu-btn" onClick={()=>setTab(t=>t==="bot"?"tasks":"bot")}>☰</button>
            <span className="topbar-title">
              {tab==="bot"?`🤖 ${t.assistant}`:tab==="stats"?`📊 ${t.stats}`:tab==="calendar"?`📆 ${t.calendar}`:tab==="settings"?`⚙️ ${t.settings}`:tab==="profiles"?`👥 ${t.profiles}`:tab==="focus"?"🧘 Focus Timer":tab==="goals"?"🏆 Goals":tab==="habits"?"🔁 Habits":tab==="planner"?"⏰ Daily Planner":tab==="board"?"🗂 Project Board":tab==="board"?"🗂 Project Board":tab==="collab"?"👫 Collaborate":tab==="widgets"?"📱 Widgets":tab==="starred"?`⭐ ${t.starred}`:tab==="overdue"?`⚠️ ${t.overdue}`:tab==="today"?`📅 ${t.today}`:tab==="done"?`✓ ${t.done}`:t.tasks}
            </span>
            {!["bot","stats","calendar","settings","profiles","focus","collab","widgets","goals","habits","planner","board"].includes(tab)&&<div className="search-wrap"><span style={{color:"var(--t3)",fontSize:13}}>⌕</span><input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<span style={{cursor:"pointer",color:"var(--t3)",fontSize:12}} onClick={()=>setSearch("")}>✕</span>}</div>}
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button className="tb-btn" onClick={()=>{setShowAiModal(true);}} title="AI Breakdown" style={{background:"linear-gradient(135deg,var(--acc),#a855f7)",color:"#fff",borderRadius:10,fontSize:13,fontWeight:700,padding:"5px 10px"}}>🤖</button>
              <button className="tb-btn" onClick={()=>{setDark(d=>!d);play("tap");}} title="Toggle theme">{dark?"☀️":"🌙"}</button>
              <button className="tb-btn" onClick={()=>{setMusicOn(m=>!m);play("tap");}} title={musicOn?"Stop music":"Play music"} style={{background:musicOn?"var(--accd)":"var(--s2)",borderColor:musicOn?"var(--acc)":"var(--b1)",color:musicOn?"var(--acc)":"var(--t2)"}}>{musicOn?"🎶":"🎵"}</button>
              {pinEnabled&&<button className="tb-btn" onClick={()=>{setLocked(true);setPinMode("unlock");setPinInput("");setPinError("");}} title="Lock app">🔒</button>}
              {tab==="focus"&&<button className="tb-btn" style={{background:pomoRunning?`${accent.v}22`:"var(--s2)",color:pomoRunning?accent.v:"var(--t2)",borderColor:pomoRunning?accent.v:"var(--b1)"}} onClick={()=>setPomoRunning(r=>!r)}>{pomoRunning?"⏸":"▶"}</button>}
              {!["bot","stats","calendar","settings","profiles","focus","collab","widgets","goals","habits","planner","board"].includes(tab)&&<button className="add-btn" onClick={openAdd}>+ {t.add}</button>}
            </div>
          </div>
          {tab==="tasks"||tab==="starred"||tab==="today"||tab==="overdue"||tab==="done"?<div className="content" style={{overflowY:"auto"}}><TasksPage/></div>:
           tab==="stats"?<div className="content" style={{overflowY:"auto",height:"100%"}}><StatsPage/></div>:
           tab==="calendar"?<div className="content" style={{overflowY:"auto",height:"100%"}}><CalendarPage/></div>:
           tab==="settings"?<div className="content" style={{overflowY:"auto",height:"100%"}}><SettingsPage/></div>:
           tab==="profiles"?<div className="content" style={{overflowY:"auto",height:"100%"}}><ProfilesPage/></div>:
           tab==="focus"?<div className="content" style={{overflowY:"auto"}}><PomoPage/></div>:
           tab==="collab"?<div className="content" style={{overflowY:"auto"}}><CollabPage/></div>:
           tab==="widgets"?<div className="content" style={{overflowY:"auto"}}><WidgetPage/></div>:
           tab==="goals"?<div className="content" style={{overflowY:"auto"}}><GoalsPage/></div>:
           tab==="habits"?<div className="content" style={{overflowY:"auto"}}><HabitsPage/></div>:
           tab==="planner"?<div className="content" style={{overflowY:"auto"}}><PlannerPage/></div>:
           tab==="mood"?<div className="content" style={{overflowY:"auto"}}><MoodPage/></div>:
           tab==="notes"?<div className="content" style={{overflowY:"auto"}}><NotesPage/></div>:
           tab==="board"?<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><BoardPage/></div>:
           <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><ChatPanelContent/></div>}
        </div>

        {/* Desktop Chat Panel */}
        <div className="chat-panel"><ChatPanelContent/></div>

        {/* Mobile Bottom Nav */}
        <nav className="bot-nav">
          <div className="bot-inner">
            <div className={`bot-item ${tab==="tasks"?"on":""}`} onClick={()=>{setTab("tasks");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon">○</span><span>{t.tasks}</span>
              {activeCount>0&&<span className="bot-num">{activeCount>99?"99+":activeCount}</span>}
            </div>
            <div className={`bot-item ${tab==="calendar"?"on":""}`} onClick={()=>{setTab("calendar");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon">📆</span><span>Calendar</span>
            </div>
            <div className="fab-wrap"><button className="fab" onClick={openAdd}>+</button><span className="fab-lbl">{t.add}</span></div>
            <div className={`bot-item ${tab==="goals"?"on":""}`} onClick={()=>{setTab("goals");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon">🏆</span><span>Goals</span>
            </div>
            <div className={`bot-item ${showMoreMenu?"on":""}`} onClick={()=>setShowMoreMenu(m=>!m)}>
              <span className="bot-icon">⋯</span><span>More</span>
            </div>
          </div>
        </nav>

        {/* More Menu */}
        {showMoreMenu&&<div style={{position:"fixed",inset:0,zIndex:199,background:"rgba(0,0,0,.4)"}} onClick={()=>setShowMoreMenu(false)}/>}
        {showMoreMenu&&(
          <div style={{position:"fixed",bottom:64,left:0,right:0,background:"var(--s1)",borderTop:"1px solid var(--b1)",borderRadius:"20px 20px 0 0",padding:"16px",zIndex:200,boxShadow:"0 -8px 30px rgba(0,0,0,.25)"}}>
            <div style={{width:36,height:4,borderRadius:2,background:"var(--b2)",margin:"0 auto 16px"}}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
              {[
                {id:"notes",icon:"📝",label:"Notes"},
                {id:"board",icon:"🗂",label:"Board"},
                {id:"focus",icon:"🧘",label:"Focus"},
                {id:"mood",icon:"😊",label:"Mood"},
                {id:"habits",icon:"🔁",label:"Habits"},
                {id:"planner",icon:"⏰",label:"Planner"},
                {id:"stats",icon:"📊",label:"Stats"},
                {id:"collab",icon:"👫",label:"Team"},
                {id:"settings",icon:"⚙️",label:"Settings"},
                {id:"profiles",icon:"👥",label:"Profiles"},
                {id:"widgets",icon:"📱",label:"Widgets"},
                {id:"bot",icon:"🤖",label:"Assistant"},
              ].map(v=>(
                <div key={v.id} onClick={()=>{setTab(v.id);play("tap");setShowMoreMenu(false);}} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:5,padding:"12px 4px",borderRadius:12,cursor:"pointer",background:tab===v.id?"var(--accd)":"var(--s2)",border:`1px solid ${tab===v.id?"var(--acc)":"transparent"}`}}>
                  <span style={{fontSize:24}}>{v.icon}</span>
                  <span style={{fontSize:10.5,color:tab===v.id?"var(--acc)":"var(--t2)",fontWeight:600}}>{v.label}</span>
                </div>
              ))}
            </div>
            <div style={{height:8}}/>
          </div>
        )}
      </div>

      {/* ══ GOAL MODAL ══ */}
      {showGoalModal&&(
        <div className="overlay" onClick={()=>setShowGoalModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">{editGoal?"Edit Goal":"New Goal"}</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowGoalModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Goal Title</div><input className="f-in" autoFocus placeholder="What do you want to achieve?" value={goalForm.title} onChange={e=>setGoalForm(f=>({...f,title:e.target.value}))}/></div>
              <div className="row2">
                <div><div className="f-lbl">Deadline</div><input className="f-in" type="date" value={goalForm.deadline} onChange={e=>setGoalForm(f=>({...f,deadline:e.target.value}))}/></div>
                <div><div className="f-lbl">Color</div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>{GOAL_COLORS.map(c=><div key={c} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${goalForm.color===c?"var(--t1)":"transparent"}`,transform:goalForm.color===c?"scale(1.2)":"scale(1)",transition:"all .15s"}} onClick={()=>setGoalForm(f=>({...f,color:c}))}/>)}</div></div>
              </div>
              <div><div className="f-lbl">Icon</div><div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:5,marginTop:4}}>{GOAL_ICONS.map(ic=><button key={ic} style={{width:34,height:34,borderRadius:8,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",background:goalForm.icon===ic?"var(--accd)":"var(--s2)",border:`2px solid ${goalForm.icon===ic?"var(--acc)":"transparent"}`,cursor:"pointer"}} onClick={()=>setGoalForm(f=>({...f,icon:ic}))}>{ic}</button>)}</div></div>
              <div>
                <div className="f-lbl">Milestones / Steps</div>
                <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:7}}>
                  {goalForm.milestones.map((m,i)=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,background:"var(--s2)",borderRadius:8,padding:"7px 10px"}}>
                      <span style={{fontSize:13,flex:1}}>{m.text}</span>
                      <span style={{cursor:"pointer",fontSize:12,color:"var(--t3)"}} onClick={()=>setGoalForm(f=>({...f,milestones:f.milestones.filter((_,j)=>j!==i)}))}>✕</span>
                    </div>
                  ))}
                </div>
                <div style={{display:"flex",gap:7}}>
                  <input style={{flex:1,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"7px 11px",fontSize:12.5,color:"var(--t1)"}} placeholder="Add a milestone step…" value={goalMilestoneInput} onChange={e=>setGoalMilestoneInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&goalMilestoneInput.trim()){setGoalForm(f=>({...f,milestones:[...f.milestones,{id:uid(),text:goalMilestoneInput.trim(),done:false}]}));setGoalMilestoneInput("");}}}/>
                  <button style={{height:33,padding:"0 12px",background:"var(--acc)",borderRadius:9,fontSize:12,color:"#fff",fontWeight:600}} onClick={()=>{if(!goalMilestoneInput.trim())return;setGoalForm(f=>({...f,milestones:[...f.milestones,{id:uid(),text:goalMilestoneInput.trim(),done:false}]}));setGoalMilestoneInput("");}}>+ Add</button>
                </div>
              </div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowGoalModal(false)}>Cancel</button><button className="btn-s" disabled={!goalForm.title.trim()} onClick={saveGoal}>{editGoal?"Save Changes":"Create Goal"}</button></div>
          </div>
        </div>
      )}

      {/* ══ HABIT MODAL ══ */}
      {showHabitModal&&(
        <div className="overlay" onClick={()=>setShowHabitModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">New Habit</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowHabitModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Habit Name</div><input className="f-in" autoFocus placeholder="e.g. Morning run, Read 30 mins…" value={habitForm.name} onChange={e=>setHabitForm(f=>({...f,name:e.target.value}))}/></div>
              <div><div className="f-lbl">Icon</div><div style={{display:"grid",gridTemplateColumns:"repeat(10,1fr)",gap:5,marginTop:4}}>{HABIT_ICONS.map(ic=><button key={ic} style={{width:32,height:32,borderRadius:8,fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",background:habitForm.icon===ic?"var(--accd)":"var(--s2)",border:`2px solid ${habitForm.icon===ic?"var(--acc)":"transparent"}`,cursor:"pointer"}} onClick={()=>setHabitForm(f=>({...f,icon:ic}))}>{ic}</button>)}</div></div>
              <div><div className="f-lbl">Color</div><div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>{GOAL_COLORS.map(c=><div key={c} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${habitForm.color===c?"var(--t1)":"transparent"}`,transform:habitForm.color===c?"scale(1.2)":"scale(1)",transition:"all .15s"}} onClick={()=>setHabitForm(f=>({...f,color:c}))}/>)}</div></div>
              <div><div className="f-lbl">Frequency</div><div style={{display:"flex",gap:6,marginTop:4}}>{FREQ_OPTS.map(f=><button key={f.id} style={{flex:1,height:34,borderRadius:9,fontSize:12,fontWeight:600,background:habitForm.freq===f.id?"var(--accd)":"var(--s2)",color:habitForm.freq===f.id?"var(--acc)":"var(--t2)",border:`1.5px solid ${habitForm.freq===f.id?"var(--acc)":"var(--b1)"}`,cursor:"pointer",transition:"all .15s"}} onClick={()=>setHabitForm(frm=>({...frm,freq:f.id}))}>{f.label}</button>)}</div></div>
              <div style={{background:"var(--s2)",borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:habitForm.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19}}>{habitForm.icon}</div>
                <span style={{fontSize:14,fontWeight:700,color:habitForm.color}}>{habitForm.name||"Preview"}</span>
                <span style={{marginLeft:"auto",fontSize:11,color:"var(--t3)"}}>Daily habit</span>
              </div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowHabitModal(false)}>Cancel</button><button className="btn-s" disabled={!habitForm.name.trim()} onClick={saveHabit}>Add Habit</button></div>
          </div>
        </div>
      )}

      {/* ══ BOARD CARD MODAL ══ */}
      {showCardModal&&(
        <div className="overlay" onClick={()=>setShowCardModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">{editCard?"Edit Card":"New Card"}</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowCardModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Title</div><input className="f-in" autoFocus placeholder="What needs to be done?" value={cardForm.title} onChange={e=>setCardForm(f=>({...f,title:e.target.value}))}/></div>
              <div><div className="f-lbl">Description</div><textarea className="f-in" placeholder="Add details, links, notes…" rows={3} style={{resize:"vertical"}} value={cardForm.desc} onChange={e=>setCardForm(f=>({...f,desc:e.target.value}))}/></div>
              <div className="row2">
                <div><div className="f-lbl">Column</div>
                  <select className="f-in" value={cardFormCol} onChange={e=>setCardFormCol(e.target.value)} style={{cursor:"pointer"}}>
                    {boardColumns.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </div>
                <div><div className="f-lbl">Priority</div>
                  <select className="f-in" value={cardForm.priority} onChange={e=>setCardForm(f=>({...f,priority:e.target.value}))} style={{cursor:"pointer"}}>
                    <option value="high">🔴 High</option><option value="medium">🟡 Medium</option><option value="low">🟢 Low</option>
                  </select>
                </div>
              </div>
              <div><div className="f-lbl">Label</div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>{CARD_LABELS.map(l=><button key={l} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:cardForm.label===l?"var(--accd)":"var(--s2)",color:cardForm.label===l?"var(--acc)":"var(--t2)",border:`1px solid ${cardForm.label===l?"var(--acc)":"var(--b1)"}`,fontWeight:600,cursor:"pointer",transition:"all .15s"}} onClick={()=>setCardForm(f=>({...f,label:l}))}>{l}</button>)}</div></div>
              <div><div className="f-lbl">Card Color</div><div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>{CARD_COLORS.map(c=><div key={c} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${cardForm.color===c?"var(--t1)":"transparent"}`,transform:cardForm.color===c?"scale(1.2)":"scale(1)",transition:"all .15s"}} onClick={()=>setCardForm(f=>({...f,color:c}))}/>)}</div></div>
              <div><div className="f-lbl">Assignee</div><div style={{display:"flex",gap:7,marginTop:4}}>{["👤","👩","👨","🧑","👩‍💻","👨‍💻","🧑‍🎨","👩‍🎨"].map(em=><button key={em} style={{width:36,height:36,borderRadius:10,fontSize:18,background:cardForm.assignee===em?"var(--accd)":"var(--s2)",border:`2px solid ${cardForm.assignee===em?"var(--acc)":"transparent"}`,cursor:"pointer"}} onClick={()=>setCardForm(f=>({...f,assignee:em}))}>{em}</button>)}</div></div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowCardModal(false)}>Cancel</button><button className="btn-s" disabled={!cardForm.title.trim()} onClick={saveCard}>{editCard?"Save Changes":"Add Card"}</button></div>
          </div>
        </div>
      )}

      {/* ══ BOARD COLUMN MODAL ══ */}
      {showColModal&&(
        <div className="overlay" onClick={()=>setShowColModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">New Column</div><button className="ic-btn" onClick={()=>setShowColModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Column Name</div><input className="f-in" autoFocus placeholder="e.g. Testing, Blocked, Shipped…" value={colForm.title} onChange={e=>setColForm(f=>({...f,title:e.target.value}))}/></div>
              <div><div className="f-lbl">Color</div><div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>{CARD_COLORS.map(c=><div key={c} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${colForm.color===c?"var(--t1)":"transparent"}`,transform:colForm.color===c?"scale(1.2)":"scale(1)",transition:"all .15s"}} onClick={()=>setColForm(f=>({...f,color:c}))}/>)}</div></div>
              <div style={{background:"var(--s2)",borderRadius:11,padding:"10px 13px",display:"flex",alignItems:"center",gap:10,marginTop:4}}>
                <div style={{width:10,height:10,borderRadius:3,background:colForm.color}}/>
                <span style={{fontSize:13.5,fontWeight:700,color:colForm.color}}>{colForm.title||"Preview"}</span>
                <span style={{marginLeft:"auto",fontSize:11,background:colForm.color+"22",color:colForm.color,borderRadius:20,padding:"1px 8px",fontWeight:700}}>0</span>
              </div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowColModal(false)}>Cancel</button><button className="btn-s" disabled={!colForm.title.trim()} onClick={addColumn}>Add Column</button></div>
          </div>
        </div>
      )}

      {/* ══ TASK MODAL ══ */}
      {showTaskModal&&(
        <div className="overlay" onClick={()=>setShowTaskModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">{editTaskObj?t.editTask:t.newTask}</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowTaskModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">{t.title} *</div><input className="f-in" placeholder="What needs to be done?" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
              <div><div className="f-lbl">{t.notes}</div><textarea className="f-in" style={{height:65,lineHeight:1.5}} placeholder="Details…" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
              <div className="row2">
                <div><div className="f-lbl">{t.priority}</div><select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}><option value="high">🔴 {t.high}</option><option value="medium">🟡 {t.medium}</option><option value="low">🟢 {t.low}</option></select></div>
                <div><div className="f-lbl">{t.category}</div><select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.categoryId} onChange={e=>setForm(f=>({...f,categoryId:e.target.value}))}>{categories.map(c=><option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
              </div>
              <div className="row2">
                <div><div className="f-lbl">{t.dueDate}</div><input className="f-in" type="date" value={form.due} onChange={e=>setForm(f=>({...f,due:e.target.value}))}/></div>
                <div><div className="f-lbl">{t.recurring}</div><select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.recurring} onChange={e=>setForm(f=>({...f,recurring:e.target.value}))}><option value="never">⏹ {t.never}</option><option value="daily">📅 {t.daily}</option><option value="weekly">📆 {t.weekly}</option><option value="monthly">🗓 {t.monthly}</option></select></div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <div style={{flex:1}}>
                  <div className="f-lbl">{t.reminder}</div>
                  <div style={{background:"var(--s2)",borderRadius:11,padding:"10px 13px",border:"1px solid var(--b1)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:form.reminder?10:0}}>
                      <span style={{flex:1,fontSize:13}}>🔔 Remind me</span>
                      <div className={`toggle ${form.reminder?"on":""}`} onClick={()=>setForm(f=>({...f,reminder:!f.reminder}))}><div className="toggle-knob"/></div>
                    </div>
                    {form.reminder&&(
                      <div style={{display:"flex",gap:8}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>📅 Date</div>
                          <input type="date" style={{width:"100%",background:"var(--s3)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 9px",fontSize:12,color:"var(--t1)"}} value={form.reminderDate||form.due||""} onChange={e=>setForm(f=>({...f,reminderDate:e.target.value}))}/>
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>⏰ Time</div>
                          <input type="time" style={{width:"100%",background:"var(--s3)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 9px",fontSize:12,color:"var(--t1)"}} value={form.reminderTime||"09:00"} onChange={e=>setForm(f=>({...f,reminderTime:e.target.value}))}/>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{flex:1}}>
                  <div className="f-lbl">⭐ Star</div>
                  <button style={{width:"100%",height:42,background:form.starred?"rgba(255,217,61,.15)":"var(--s2)",border:`1px solid ${form.starred?"#ffd93d55":"var(--b1)"}`,borderRadius:11,fontSize:13,color:form.starred?"#ffd93d":"var(--t2)",transition:"all .2s"}} onClick={()=>setForm(f=>({...f,starred:!f.starred}))}>{form.starred?"⭐ Starred":"☆ Star task"}</button>
                </div>
              </div>
              {/* Photo */}
              <div>
                <div className="f-lbl">📸 {t.photo}</div>
                {form.photo?<div><img src={form.photo} className="photo-prev" alt=""/><div style={{fontSize:11.5,color:"var(--red)",marginTop:5,cursor:"pointer",textAlign:"center"}} onClick={()=>setForm(f=>({...f,photo:null}))}>✕ Remove photo</div></div>:<div className="photo-up" onClick={()=>fileRef.current?.click()}><div style={{fontSize:26,marginBottom:5}}>📷</div><div style={{fontSize:12.5,color:"var(--t2)",fontWeight:600}}>Tap to add photo</div></div>}
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
              </div>
              {/* Tags */}
              <div>
                <div className="f-lbl">🏷️ {t.tags}</div>
                {form.tags.length>0&&<div className="tags-wrap">{form.tags.map(tg=><span key={tg} className="tag-item">#{tg}<span style={{cursor:"pointer",marginLeft:2}} onClick={()=>setForm(f=>({...f,tags:f.tags.filter(x=>x!==tg)}))}>✕</span></span>)}</div>}
                <div style={{display:"flex",gap:7,marginTop:7}}>
                  <input style={{flex:1,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"7px 11px",fontSize:12.5,color:"var(--t1)"}} placeholder="Add tag…" value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addTag();}}}/>
                  <button style={{height:33,padding:"0 12px",background:"var(--s3)",borderRadius:9,fontSize:12,color:"var(--t1)"}} onClick={addTag}>+ Add</button>
                </div>
              </div>
              {/* Subtasks */}
              <div>
                <div className="f-lbl">✅ {t.subtasks}</div>
                {form.subtasks.length>0&&<div className="sub-list">{form.subtasks.map(s=><div key={s.id} className="sub-row"><div className={`sub-chk ${s.done?"on":""}`} onClick={()=>setForm(f=>({...f,subtasks:f.subtasks.map(x=>x.id===s.id?{...x,done:!x.done}:x)}))}>{s.done&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>✓</span>}</div><span className={`sub-txt ${s.done?"ds":""}`}>{s.text}</span><span style={{cursor:"pointer",fontSize:12,color:"var(--t3)",padding:"2px 4px"}} onClick={()=>setForm(f=>({...f,subtasks:f.subtasks.filter(x=>x.id!==s.id)}))}>✕</span></div>)}</div>}
                <div style={{display:"flex",gap:7,marginTop:7}}>
                  <input style={{flex:1,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"7px 11px",fontSize:12.5,color:"var(--t1)"}} placeholder="Add a step…" value={subInput} onChange={e=>setSubInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addSub();}}}/>
                  <button style={{height:33,padding:"0 12px",background:accent.v,borderRadius:9,fontSize:12,color:"#fff",fontWeight:600}} onClick={addSub}>+ Add</button>
                </div>
              </div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowTaskModal(false)}>{t.cancel}</button><button className="btn-s" disabled={!form.title.trim()} onClick={saveTask}>{editTaskObj?t.save:t.add}</button></div>
          </div>
        </div>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {showDetail&&detailTask&&(()=>{
        const cat=getCat(detailTask.categoryId);
        const ds=detailTask.subtasks.filter(s=>s.done).length;
        return (
          <div className="overlay" onClick={()=>setShowDetail(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="drag"/>
              <div className="m-head">
                <div style={{display:"flex",gap:6,alignItems:"center",flex:1,flexWrap:"wrap"}}>
                  <span style={{fontSize:12,padding:"3px 9px",borderRadius:20,background:PRIORITIES[detailTask.priority].bg,color:PRIORITIES[detailTask.priority].color,fontWeight:600}}>{PRIORITIES[detailTask.priority].icon} {PRIORITIES[detailTask.priority].label}</span>
                  <span style={{fontSize:12,padding:"3px 9px",borderRadius:20,background:cat.color+"22",color:cat.color,fontWeight:600}}>{cat.icon} {cat.name}</span>
                  {detailTask.recurring&&detailTask.recurring!=="never"&&<span style={{fontSize:12,padding:"3px 9px",borderRadius:20,background:"var(--s2)",color:"var(--t2)",border:"1px solid var(--b1)"}}>🔄 {detailTask.recurring}</span>}
                </div>
                <button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowDetail(false)}>✕</button>
              </div>
              <div className="m-body">
                {detailTask.photo&&<img src={detailTask.photo} style={{width:"100%",maxHeight:180,objectFit:"cover",borderRadius:12,border:"1px solid var(--b1)"}} alt=""/>}
                <div style={{display:"flex",alignItems:"flex-start",gap:9}}>
                  <div className={`chk ${detailTask.done?"on":""}`} style={{flexShrink:0,marginTop:4}} onClick={()=>toggle(detailTask.id)}>{detailTask.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}</div>
                  <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,flex:1,lineHeight:1.3}}>{detailTask.title}</div>
                  <span style={{fontSize:18,cursor:"pointer",opacity:detailTask.starred?1:.35}} onClick={()=>star(detailTask.id)}>⭐</span>
                </div>
                {detailTask.notes&&<div style={{fontSize:13.5,color:"var(--t2)",lineHeight:1.65}}>{detailTask.notes}</div>}
                {detailTask.due&&<div style={{display:"flex",alignItems:"center",gap:8,fontSize:13}}><span style={{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",width:64}}>Due</span><span style={{color:isOverdue(detailTask.due,detailTask.done)?"var(--red)":"var(--t1)"}}>{isOverdue(detailTask.due,detailTask.done)?"⚠️ OVERDUE — ":""}{fmtDateFull(detailTask.due)}</span></div>}
                {detailTask.tags.length>0&&<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",width:64}}>Tags</span><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>{detailTask.tags.map(tg=><span key={tg} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"var(--accd)",color:accent.v,border:`1px solid ${accent.v}30`}}>#{tg}</span>)}</div></div>}
                {detailTask.subtasks.length>0&&(
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8}}>Subtasks ({ds}/{detailTask.subtasks.length})</div>
                    <div style={{height:3,background:"var(--s3)",borderRadius:2,overflow:"hidden",marginBottom:10}}><div style={{height:"100%",background:accent.v,borderRadius:2,width:`${detailTask.subtasks.length?(ds/detailTask.subtasks.length)*100:0}%`,transition:"width .4s"}}/></div>
                    {detailTask.subtasks.map(s=>(
                      <div key={s.id} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 0",borderBottom:"1px solid var(--b1)",cursor:"pointer"}} onClick={()=>toggleSub(detailTask.id,s.id)}>
                        <div className={`sub-chk ${s.done?"on":""}`}>{s.done&&<span style={{color:"#fff",fontSize:9,fontWeight:800}}>✓</span>}</div>
                        <span style={{fontSize:13,flex:1,textDecoration:s.done?"line-through":"none",color:s.done?"var(--t3)":"var(--t1)"}}>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="m-foot">
                <button className="btn-c" style={{color:"var(--red)",borderColor:"rgba(255,107,107,.3)",flex:"1"}} onClick={()=>{del(detailTask.id);setShowDetail(false);}}>🗑 Delete</button>
                <button className="btn-s" onClick={()=>{setShowDetail(false);openEdit(detailTask,null);}}>✎ Edit</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ══ EXPORT MODAL ══ */}
      {showExport&&(
        <div className="overlay" onClick={()=>setShowExport(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">📤 Export Tasks</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowExport(false)}>✕</button></div>
            <div className="m-body">
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.6}}>Your tasks exported as JSON. Copy or share this data to back it up.</div>
              <div className="export-area">{exportData()}</div>
              <button style={{width:"100%",height:44,background:accent.v,borderRadius:12,fontSize:14,fontWeight:700,color:"#fff",boxShadow:`0 4px 14px ${accent.v}40`}} onClick={shareData}>🔗 Copy & Share</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ CATEGORY MODAL ══ */}
      {showCatModal&&(
        <div className="overlay" onClick={()=>setShowCatModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">New Category</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowCatModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Name</div><input className="f-in" placeholder="Category name…" value={catForm.name} onChange={e=>setCatForm(f=>({...f,name:e.target.value}))}/></div>
              <div><div className="f-lbl">Icon</div><div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:6,marginTop:4}}>{EMOJI_LIST.map(em=><button key={em} style={{width:36,height:36,borderRadius:8,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",background:catForm.icon===em?"var(--accd)":"var(--s2)",border:`2px solid ${catForm.icon===em?accent.v:"transparent"}`,cursor:"pointer",transition:"all .15s"}} onClick={()=>setCatForm(f=>({...f,icon:em}))}>{em}</button>)}</div></div>
              <div><div className="f-lbl">Color</div><div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>{COLOR_LIST.map(c=><div key={c} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${catForm.color===c?"var(--t1)":"transparent"}`,transform:catForm.color===c?"scale(1.15)":"scale(1)",transition:"all .2s"}} onClick={()=>setCatForm(f=>({...f,color:c}))}/>)}</div></div>
              <div style={{background:"var(--s2)",borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:9,background:catForm.color+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17}}>{catForm.icon}</div><span style={{fontSize:14,fontWeight:700,color:catForm.color}}>{catForm.name||"Preview"}</span></div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowCatModal(false)}>Cancel</button><button className="btn-s" disabled={!catForm.name.trim()} onClick={saveCat}>Create</button></div>
          </div>
        </div>
      )}

      {/* ══ PROFILE MODAL ══ */}
      {showProfileModal&&(
        <div className="overlay" onClick={()=>setShowProfileModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">{t.newProfile}</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowProfileModal(false)}>✕</button></div>
            <div className="m-body">
              <div><div className="f-lbl">Profile Name</div><input className="f-in" placeholder="e.g. Work, Family…" value={profForm.name} onChange={e=>setProfForm(f=>({...f,name:e.target.value}))}/></div>
              <div><div className="f-lbl">Icon</div><div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:6,marginTop:4}}>{EMOJI_LIST.slice(0,16).map(em=><button key={em} style={{width:36,height:36,borderRadius:8,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",background:profForm.icon===em?"var(--accd)":"var(--s2)",border:`2px solid ${profForm.icon===em?accent.v:"transparent"}`,cursor:"pointer"}} onClick={()=>setProfForm(f=>({...f,icon:em}))}>{em}</button>)}</div></div>
              <div style={{background:"var(--s2)",borderRadius:11,padding:"12px 14px",display:"flex",alignItems:"center",gap:10}}><div style={{width:34,height:34,borderRadius:9,background:accent.v+"33",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>{profForm.icon}</div><span style={{fontSize:14,fontWeight:700}}>{profForm.name||"Preview"}</span></div>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowProfileModal(false)}>Cancel</button><button className="btn-s" disabled={!profForm.name.trim()} onClick={saveProfile}>Create Profile</button></div>
          </div>
        </div>
      )}


      {/* Mood Modal */}
      {showMoodModal&&(
        <div className="overlay" onClick={()=>setShowMoodModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">How are you feeling?</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowMoodModal(false)}>✕</button></div>
            <div className="m-body">
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
                {MOOD_OPTIONS.map((m,i)=>(
                  <div key={i} onClick={()=>saveMood(i)} style={{textAlign:"center",padding:"12px 4px",borderRadius:12,cursor:"pointer",background:"var(--s2)",border:"1px solid var(--b1)",transition:"all .15s"}}>
                    <div style={{fontSize:28}}>{m.emoji}</div>
                    <div style={{fontSize:10,color:"var(--t3)",fontWeight:600,marginTop:4}}>{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ AD / PREMIUM MODAL ══ */}

      {/* ══ NOTE MODAL ══ */}
      {showNoteModal&&(
        <div className="overlay" onClick={()=>setShowNoteModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="drag"/>
            <div className="m-head">
              <div className="m-title">{editNote?"Edit Note":"New Note"}</div>
              <button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowNoteModal(false)}>✕</button>
            </div>
            <div className="m-body">
              <div><div className="f-lbl">Title</div><input className="f-in" placeholder="Note title…" value={noteForm.title} onChange={e=>setNoteForm(f=>({...f,title:e.target.value}))}/></div>
              <div><div className="f-lbl">Content</div><textarea className="f-in" style={{height:140,lineHeight:1.6}} placeholder="Write anything…" value={noteForm.body} onChange={e=>setNoteForm(f=>({...f,body:e.target.value}))}/></div>
              <div>
                <div className="f-lbl">Color</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:4}}>
                  {NOTE_COLORS.map(c=>(
                    <div key={c} onClick={()=>setNoteForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${noteForm.color===c?"var(--t1)":"transparent"}`,transform:noteForm.color===c?"scale(1.2)":"scale(1)",transition:"all .15s"}}/>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,background:"var(--s2)",borderRadius:11,padding:"10px 13px",border:"1px solid var(--b1)"}}>
                <span style={{flex:1,fontSize:13}}>📌 Pin this note</span>
                <div className={`toggle ${noteForm.pinned?"on":""}`} onClick={()=>setNoteForm(f=>({...f,pinned:!f.pinned}))}><div className="toggle-knob"/></div>
              </div>
            </div>
            <div className="m-foot">
              {editNote&&<button className="btn-c" style={{color:"var(--red)",borderColor:"rgba(255,107,107,.3)"}} onClick={()=>{deleteNote(editNote.id);setShowNoteModal(false);}}>🗑 Delete</button>}
              <button className="btn-c" onClick={()=>setShowNoteModal(false)}>Cancel</button>
              <button className="btn-s" onClick={saveNote}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ AI TASK BREAKDOWN MODAL ══ */}
      {showAiModal&&(
        <div className="overlay" onClick={()=>{if(!aiLoading)setShowAiModal(false);}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
            <div className="drag"/>
            <div className="m-head">
              <div className="m-title">🤖 AI Task Breakdown</div>
              <button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowAiModal(false)}>✕</button>
            </div>
            <div className="m-body">
              <div style={{fontSize:13,color:"var(--t2)",marginBottom:12,lineHeight:1.6}}>
                Tell me your goal and I'll break it into actionable tasks automatically!
              </div>
              <div style={{display:"flex",gap:8,marginBottom:16}}>
                <input className="f-in" placeholder="e.g. Launch my app, Learn guitar, Get fit..." value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&aiBreakdown()} style={{flex:1}} autoFocus/>
                <button onClick={aiBreakdown} disabled={aiLoading||!aiInput.trim()} style={{height:42,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",opacity:aiLoading||!aiInput.trim()?0.6:1,whiteSpace:"nowrap"}}>
                  {aiLoading?"...":"✨ Go"}
                </button>
              </div>

              {aiLoading&&(
                <div style={{textAlign:"center",padding:"20px 0"}}>
                  <div style={{fontSize:32,marginBottom:8}}>🤖</div>
                  <div style={{fontSize:13,color:"var(--t2)"}}>AI is thinking...</div>
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:4}}>Breaking down your goal into tasks</div>
                </div>
              )}

              {aiTasks.length>0&&!aiLoading&&(
                <>
                  <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>
                    ✅ Select tasks to add ({aiSelected.length}/{aiTasks.length})
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:16}}>
                    {aiTasks.map((task,i)=>(
                      <div key={i} onClick={()=>setAiSelected(sel=>sel.includes(i)?sel.filter(x=>x!==i):[...sel,i])}
                        style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:11,cursor:"pointer",background:aiSelected.includes(i)?"var(--accd)":"var(--s2)",border:`1px solid ${aiSelected.includes(i)?"var(--acc)":"transparent"}`,transition:"all .15s"}}>
                        <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${aiSelected.includes(i)?"var(--acc)":"var(--b2)"}`,background:aiSelected.includes(i)?"var(--acc)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all .15s"}}>
                          {aiSelected.includes(i)&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}
                        </div>
                        <span style={{fontSize:13,color:"var(--t1)",flex:1}}>{task}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={()=>setAiSelected(aiTasks.map((_,i)=>i))} style={{flex:1,height:36,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:10,fontSize:12,color:"var(--t2)",cursor:"pointer"}}>Select All</button>
                    <button onClick={addAiTasksToApp} disabled={aiSelected.length===0} style={{flex:2,height:36,background:"var(--acc)",borderRadius:10,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",opacity:aiSelected.length===0?0.5:1}}>
                      + Add {aiSelected.length} Tasks
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PIN MODAL ══ */}
      {showPinModal&&(
        <div className="overlay" onClick={()=>{setShowPinModal(false);setPinInput("");setPinMode(null);}}>
          <div className="modal center" onClick={e=>e.stopPropagation()} style={{padding:"30px 20px",display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
            <div style={{fontSize:40}}>🔒</div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20}}>{pinMode==="confirm"?t.confirmPin:t.setPin}</div>
            <div style={{display:"flex",gap:14}}>{[0,1,2,3].map(i=><div key={i} style={{width:16,height:16,borderRadius:"50%",border:`2px solid ${i<pinInput.length?accent.v:"var(--b2)"}`,background:i<pinInput.length?accent.v:"transparent",transition:"all .2s"}}/>)}</div>
            {pinError&&<div style={{color:"var(--red)",fontSize:13,fontWeight:600}}>{pinError}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
                <div key={i} className="pin-key" style={k===""?{opacity:0,pointerEvents:"none"}:{}} onClick={()=>k==="⌫"?handlePinDel():k!==""&&handlePinKey(String(k))}>{k}</div>
              ))}
            </div>
          </div>
        </div>
      )}
      </>)}
    </>
  );
}