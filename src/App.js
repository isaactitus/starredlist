import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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
  // Try loading from CDN with timeout
  const loadWithTimeout = (src, ms=8000) => new Promise((res,rej)=>{
    const timer = setTimeout(()=>rej(new Error("Script load timeout")), ms);
    loadScript(src).then(()=>{clearTimeout(timer);res();}).catch(e=>{clearTimeout(timer);rej(e);});
  });
  try{
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js");
    await loadWithTimeout("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js");
    const fb=window.firebase;
    if(!fb) throw new Error("Firebase not on window after load");
    if(!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
    _db=fb.firestore();
    _auth=fb.auth();
    _auth.setPersistence(fb.auth.Auth.Persistence.LOCAL).catch(()=>{});
    return { db:_db, auth:_auth };
  }catch(e){
    console.error("Firebase error:",e);
    // Reset so next call retries
    _db=null; _auth=null;
    return null;
  }
}
async function getDB(){
  const fb = await getFirebase();
  return fb ? fb.db : null;
}

// ===================================================
//  TASKFLOW ULTIMATE  -- All Features, No API Needed
// ===================================================

// == Helpers ======================================
const uid = () => Math.random().toString(36).slice(2,10);
const todayStr = () => new Date().toISOString().split("T")[0];
const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "";
const fmtDateFull = d => d ? new Date(d).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "";
const isOverdue = (due,done) => !done && due && new Date(due) < new Date();
const getDaysInMonth = (y,m) => new Date(y,m+1,0).getDate();
const getFirstDay = (y,m) => new Date(y,m,1).getDay();

// == Translations ==================================
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

// == Accent Colors =================================
const ACCENTS = [
  {name:"Violet",  v:"#7c6dfa", g:"#b06dfa"},
  {name:"Teal",    v:"#00d4aa", g:"#0097ff"},
  {name:"Rose",    v:"#ff6b9d", g:"#ff4757"},
  {name:"Amber",   v:"#ffb347", g:"#ffd93d"},
  {name:"Sky",     v:"#38bdf8", g:"#818cf8"},
  {name:"Emerald", v:"#10b981", g:"#06d6a0"},
  {name:"Coral",   v:"#ff6b6b", g:"#ff8e53"},
  {name:"Indigo",  v:"#6366f1", g:"#8b5cf6"},
  {name:"Galaxy ✨",v:"#c084fc", g:"#7c6dfa"},
  {name:"Forest 🌿",v:"#4ade80", g:"#22c55e"},
  {name:"Sunset 🌅",v:"#fb923c", g:"#f59e0b"},
  {name:"Ocean 🌊", v:"#22d3ee", g:"#3b82f6"},
];

// == Sound effects (Web Audio API) =================
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

// == Alarm Ringtones (Web Audio API) ==========================
const ALARM_TONES = [
  { id:"classic",  label:"Classic Bell",   icon:"🔔" },
  { id:"digital",  label:"Digital Beep",   icon:"📟" },
  { id:"gentle",   label:"Gentle Chime",   icon:"🎵" },
  { id:"urgent",   label:"Urgent Alert",   icon:"🚨" },
  { id:"melody",   label:"Morning Melody", icon:"🌅" },
  { id:"pulse",    label:"Pulse Buzz",     icon:"💥" },
];

let _alarmCtx = null;
const stopAlarmSound = () => {
  try { if(_alarmCtx){ _alarmCtx.close(); _alarmCtx=null; } } catch(e){}
};

function playAlarmTone(toneId="classic") {
  stopAlarmSound();
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    _alarmCtx = ctx;
    const master = ctx.createGain(); master.gain.value=0.95; master.connect(ctx.destination);

    if(toneId==="classic"){
      // Classic two-tone bell -- 8 alternating bursts
      [0,.35,.7,1.05,1.4,1.75,2.1,2.45].forEach((t,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="square"; o.frequency.value=i%2===0?880:660;
        g.gain.setValueAtTime(0,ctx.currentTime+t);
        g.gain.linearRampToValueAtTime(0.55,ctx.currentTime+t+0.02);
        g.gain.setValueAtTime(0.55,ctx.currentTime+t+0.28);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+t+0.32);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.35);
      });
      // Bell overtone
      const b=ctx.createOscillator(),bg=ctx.createGain();
      b.type="sine"; b.frequency.value=1320;
      bg.gain.setValueAtTime(0.2,ctx.currentTime); bg.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+2.8);
      b.connect(bg); bg.connect(master); b.start(); b.stop(ctx.currentTime+2.8);

    } else if(toneId==="digital"){
      // Fast repeating digital beep
      for(let i=0;i<12;i++){
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="square"; o.frequency.value=1400;
        const t=i*0.22;
        g.gain.setValueAtTime(0,ctx.currentTime+t);
        g.gain.linearRampToValueAtTime(0.4,ctx.currentTime+t+0.01);
        g.gain.setValueAtTime(0.4,ctx.currentTime+t+0.12);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+t+0.15);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.18);
      }

    } else if(toneId==="gentle"){
      // Soft chime -- ascending notes
      const notes=[523,659,784,1047,1319];
      notes.forEach((freq,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.value=freq;
        const t=i*0.38;
        g.gain.setValueAtTime(0,ctx.currentTime+t);
        g.gain.linearRampToValueAtTime(0.4,ctx.currentTime+t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.7);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.75);
      });
      // Repeat
      notes.forEach((freq,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.value=freq;
        const t=2.1+i*0.38;
        g.gain.setValueAtTime(0,ctx.currentTime+t);
        g.gain.linearRampToValueAtTime(0.35,ctx.currentTime+t+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.7);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.75);
      });

    } else if(toneId==="urgent"){
      // Rapid high-pitched urgent siren
      for(let i=0;i<16;i++){
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sawtooth"; o.frequency.value=i%2===0?1200:900;
        const t=i*0.18;
        g.gain.setValueAtTime(0.5,ctx.currentTime+t);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+t+0.16);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.18);
      }

    } else if(toneId==="melody"){
      // Morning melody -- C major arpeggio
      const melody=[523,659,784,659,523,784,1047,784,659,523,659,784];
      const dur=[0.28,0.28,0.28,0.28,0.18,0.28,0.38,0.28,0.28,0.28,0.28,0.55];
      let ts=0;
      melody.forEach((freq,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="triangle"; o.frequency.value=freq;
        g.gain.setValueAtTime(0,ctx.currentTime+ts);
        g.gain.linearRampToValueAtTime(0.45,ctx.currentTime+ts+0.03);
        g.gain.setValueAtTime(0.42,ctx.currentTime+ts+dur[i]-0.04);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+ts+dur[i]);
        o.connect(g); g.connect(master);
        o.start(ctx.currentTime+ts); o.stop(ctx.currentTime+ts+dur[i]+0.02);
        ts+=dur[i];
      });

    } else if(toneId==="pulse"){
      // Deep pulse thumps
      for(let i=0;i<8;i++){
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.setValueAtTime(200,ctx.currentTime+i*0.38);
        o.frequency.exponentialRampToValueAtTime(60,ctx.currentTime+i*0.38+0.25);
        g.gain.setValueAtTime(0.8,ctx.currentTime+i*0.38);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.38+0.3);
        o.connect(g); g.connect(master); o.start(ctx.currentTime+i*0.38); o.stop(ctx.currentTime+i*0.38+0.32);
      }
    }
    // Repeat alarm every 4s until manually dismissed
    function repeatAlarm() {
      if(!_alarmCtx) return; // dismissed
      // Alarm auto-repeats by being called again from playAlarmTone
    }
    setTimeout(()=>{ if(_alarmCtx) playAlarmTone(toneId); }, 4200);
  } catch(e){}
};

// == Ambient Music Engine (Web Audio API -- no files needed) ====
const MUSIC_TRACKS = [
  {id:"lofi",     label:"Lo-Fi Chill",    icon:"☕"},
  {id:"jazzy",    label:"Jazzy Lo-Fi",    icon:"🎷"},
  {id:"focus",    label:"Deep Focus",     icon:"🧠"},
  {id:"rain",     label:"Rainy Day",      icon:"🌧"},
  {id:"nature",   label:"Forest Sounds",  icon:"🌿"},
  {id:"cosmic",   label:"Cosmic Drift",   icon:"🌌"},
];
let _musicCtx = null, _musicNodes = [], _musicTrack = "lofi";

function makeReverb(ctx, duration=2.5, decay=2) {
  const len = ctx.sampleRate * duration;
  const imp = ctx.createBuffer(2, len, ctx.sampleRate);
  for(let c=0;c<2;c++){
    const d = imp.getChannelData(c);
    for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1-i/len, decay);
  }
  const r = ctx.createConvolver(); r.buffer = imp; return r;
}

function makeOsc(ctx, type, freq, gainVal, dest, startTime=0, endTime=null) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = gainVal;
  o.connect(g); g.connect(dest);
  o.start(ctx.currentTime + startTime);
  if(endTime) o.stop(ctx.currentTime + endTime);
  _musicNodes.push(o);
  return {osc:o, gain:g};
}

function startMusic(trackId) {
  stopMusic();
  try {
    _musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    _musicTrack = trackId;
    const ctx = _musicCtx;
    const master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    const reverb = makeReverb(ctx, 3.5, 2.8); reverb.connect(master);
    const wet = ctx.createGain(); wet.gain.value = 0.45; wet.connect(reverb);
    const dry = ctx.createGain(); dry.gain.value = 0.55; dry.connect(master);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value=-18; comp.ratio.value=4; comp.connect(master);

    if(trackId === "lofi") {
      // Rich lo-fi: 4-chord loop with bass, chords, hi-hats, vinyl crackle
      const progression = [[261,329,392,523],[220,277,330,440],[196,247,294,392],[174,220,262,349]];
      let ci = 0;
      function playChord() {

        if(!_musicCtx) return;
        const chord = progression[ci % progression.length]; ci++;
        chord.forEach((freq,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type = i===0?"triangle":"sine";
          o.frequency.value = freq * (1 + (i%2===0?0.001:-0.001)); // slight detune
          g.gain.setValueAtTime(0,ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.06+i*0.01,ctx.currentTime+0.08);
          g.gain.setValueAtTime(0.06+i*0.01,ctx.currentTime+1.6);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+3.8);
          o.connect(g); g.connect(wet); g.connect(dry); o.start(); o.stop(ctx.currentTime+4);
          _musicNodes.push(o);
        });
        // Bass note
        const bass=ctx.createOscillator(),bg=ctx.createGain();
        bass.type="triangle"; bass.frequency.value=chord[0]/2;
        bg.gain.setValueAtTime(0,ctx.currentTime); bg.gain.linearRampToValueAtTime(0.12,ctx.currentTime+0.1);
        bg.gain.linearRampToValueAtTime(0.09,ctx.currentTime+3); bg.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+4);
        bass.connect(bg); bg.connect(dry); bass.start(); bass.stop(ctx.currentTime+4.1); _musicNodes.push(bass);
        if(_musicCtx) setTimeout(playChord, 3800);
      };
      playChord();
      // Hi-hats with groove
      function hihat() {

        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*0.04,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,4);
        const src=ctx.createBufferSource(),g=ctx.createGain();
        const hf=ctx.createBiquadFilter(); hf.type="highpass"; hf.frequency.value=8000;
        src.buffer=buf; g.gain.value=0.025+Math.random()*0.015;
        src.connect(hf); hf.connect(g); g.connect(master); src.start();
        _musicNodes.push(src);
        if(_musicCtx) setTimeout(hihat, 240+Math.random()*80);
      };
      setTimeout(hihat, 500);
      // Vinyl crackle
      function crackle() {

        if(!_musicCtx) return;
        if(Math.random()>0.7){
          const buf=ctx.createBuffer(1,ctx.sampleRate*0.01,ctx.sampleRate);
          const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*0.3;
          const src=ctx.createBufferSource(),g=ctx.createGain();
          src.buffer=buf; g.gain.value=0.008;
          src.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        }
        if(_musicCtx) setTimeout(crackle, 80+Math.random()*200);
      };
      setTimeout(crackle, 1000);

    } else if(trackId === "jazzy") {
      // Jazzy lo-fi: swing chords + walking bass + brushed snare feel
      const jazzChords=[[293,370,440,554],[261,330,392,494],[246,311,370,466],[220,277,330,415]];
      let ji=0;
      function playJazz() {

        if(!_musicCtx) return;
        const ch=jazzChords[ji%jazzChords.length]; ji++;
        ch.forEach((f,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type=i<2?"triangle":"sine"; o.frequency.value=f*(1+(i*0.002-0.001));
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.05,ctx.currentTime+0.05);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+2.8);
          o.connect(g); g.connect(wet); g.connect(dry); o.start(); o.stop(ctx.currentTime+3); _musicNodes.push(o);
        });
        // Walking bass -- 4 notes
        const bassNotes=[ch[0]/2, ch[0]/2*1.125, ch[0]/2*1.25, ch[0]/2*1.5];
        bassNotes.forEach((f,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="triangle"; o.frequency.value=f;
          const t=i*0.55;
          g.gain.setValueAtTime(0,ctx.currentTime+t); g.gain.linearRampToValueAtTime(0.13,ctx.currentTime+t+0.04);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.5);
          o.connect(g); g.connect(dry); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.55); _musicNodes.push(o);
        });
        if(_musicCtx) setTimeout(playJazz, 2200);
      };
      playJazz();
      // Brush snare (noise burst every 2 beats)
      function snare() {

        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*0.12,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
        const src=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();
        src.buffer=buf; f.type="bandpass"; f.frequency.value=200; f.Q.value=0.5;
        g.gain.value=0.04; src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(snare, 550+Math.random()*100);
      };
      setTimeout(snare, 800);

    } else if(trackId === "focus") {
      // Deep focus: binaural-inspired layered drones with slow LFO
      const layers=[{f:110,gain:0.05,lfoF:0.03},{f:165,gain:0.04,lfoF:0.07},{f:220,gain:0.035,lfoF:0.05},{f:330,gain:0.025,lfoF:0.04},{f:440,gain:0.02,lfoF:0.06}];
      layers.forEach(({f,gain,lfoF})=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        const lfo=ctx.createOscillator(),lg=ctx.createGain();
        o.type="sine"; o.frequency.value=f; g.gain.value=gain;
        lfo.frequency.value=lfoF; lg.gain.value=gain*0.3;
        lfo.connect(lg); lg.connect(g.gain); lfo.start(); o.connect(g); g.connect(wet); g.connect(dry); o.start();
        _musicNodes.push(o,lfo);
      });
      // Slow evolving pad sweep
      function sweep() {

        if(!_musicCtx) return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; const baseF=55+Math.random()*110;
        o.frequency.setValueAtTime(baseF,ctx.currentTime);
        o.frequency.linearRampToValueAtTime(baseF*2,ctx.currentTime+8);
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.03,ctx.currentTime+2);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+8);
        o.connect(g); g.connect(wet); o.start(); o.stop(ctx.currentTime+8.1); _musicNodes.push(o);
        if(_musicCtx) setTimeout(sweep, 6000+Math.random()*4000);
      };
      sweep();
      // Subtle pulse
      function pulse() {

        if(!_musicCtx) return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.value=220;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.015,ctx.currentTime+0.1);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.5);
        o.connect(g); g.connect(wet); o.start(); o.stop(ctx.currentTime+1.6); _musicNodes.push(o);
        if(_musicCtx) setTimeout(pulse, 3000+Math.random()*2000);
      };
      setTimeout(pulse,1500);

    } else if(trackId === "rain") {
      // Rainy day: white noise rain + gentle piano-ish melody + rumble
      // Rain noise layer
      function makeRain() {

        if(!_musicCtx) return;
        const buf=ctx.createBuffer(2,ctx.sampleRate*2,ctx.sampleRate);
        for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
        const src=ctx.createBufferSource(),filt=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; src.loop=true;
        filt.type="bandpass"; filt.frequency.value=600+Math.random()*200; filt.Q.value=0.3;
        g.gain.value=0.055;
        src.connect(filt); filt.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
      };
      makeRain();
      // Thunder rumble occasionally
      function rumble() {

        if(!_musicCtx) return;
        if(Math.random()>0.6){
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="sine"; o.frequency.setValueAtTime(60,ctx.currentTime); o.frequency.exponentialRampToValueAtTime(30,ctx.currentTime+1.5);
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.04,ctx.currentTime+0.3);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+2);
          o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+2.1); _musicNodes.push(o);
        }
        if(_musicCtx) setTimeout(rumble, 8000+Math.random()*12000);
      };
      setTimeout(rumble,5000);
      // Soft piano-like drops
      const pianoNotes=[261,293,329,349,392,440,493];
      function dropNote() {

        if(!_musicCtx) return;
        const f=pianoNotes[Math.floor(Math.random()*pianoNotes.length)];
        [1,2,4].forEach(mult=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="triangle"; o.frequency.value=f*mult;
          const vol=0.04/(mult*mult);
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(vol,ctx.currentTime+0.01);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+1.8);
          o.connect(g); g.connect(wet); o.start(); o.stop(ctx.currentTime+1.9); _musicNodes.push(o);
        });
        if(_musicCtx) setTimeout(dropNote, 1200+Math.random()*2000);
      };
      setTimeout(dropNote,800);

    } else if(trackId === "nature") {
      // Forest: birds, wind gusts, distant water
      function wind() {

        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; f.type="bandpass"; f.frequency.value=300+Math.random()*400; f.Q.value=0.4;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.05,ctx.currentTime+0.5);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+2);
        src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(wind, 600+Math.random()*1400);
      };
      wind();
      // Bird calls
      function bird() {

        if(!_musicCtx) return;
        const baseF=700+Math.random()*900;
        for(let i=0;i<2+Math.floor(Math.random()*3);i++){
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="sine";
          const t=i*0.12;
          o.frequency.setValueAtTime(baseF,ctx.currentTime+t);
          o.frequency.linearRampToValueAtTime(baseF*(1.1+Math.random()*0.3),ctx.currentTime+t+0.07);
          o.frequency.linearRampToValueAtTime(baseF,ctx.currentTime+t+0.14);
          g.gain.setValueAtTime(0,ctx.currentTime+t); g.gain.linearRampToValueAtTime(0.04,ctx.currentTime+t+0.02);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+0.18);
          o.connect(g); g.connect(dry); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+0.2); _musicNodes.push(o);
        }
        if(_musicCtx) setTimeout(bird, 1200+Math.random()*3500);
      };
      setTimeout(bird,300);
      // Water stream (filtered noise)
      function stream() {

        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*3,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; f.type="bandpass"; f.frequency.value=800; f.Q.value=0.8; g.gain.value=0.018;
        src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(stream, 2800+Math.random()*2000);
      };
      stream();

    } else if(trackId === "cosmic") {
      // Cosmic drift: slow evolving space pads + sub bass + shimmer
      const cosmicFreqs=[55,82.5,110,138,165,220];
      cosmicFreqs.forEach((f,i)=>{
        const o=ctx.createOscillator(),g=ctx.createGain();
        const lfo=ctx.createOscillator(),lg=ctx.createGain();
        o.type=i%2===0?"sine":"triangle"; o.frequency.value=f*(1+(i%3===0?0.002:-0.001));
        const lfoF=0.01+i*0.008; lfo.frequency.value=lfoF; lg.gain.value=f*0.012;
        lfo.connect(lg); lg.connect(o.frequency); lfo.start();
        g.gain.value=0.03+Math.random()*0.025;
        o.connect(g); g.connect(wet); g.connect(dry); o.start(); _musicNodes.push(o,lfo);
      });
      // Shimmer -- high frequency sparkle
      function shimmer() {

        if(!_musicCtx) return;
        const f=2000+Math.random()*4000;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.value=f;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.008,ctx.currentTime+0.05);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.8);
        o.connect(g); g.connect(wet); o.start(); o.stop(ctx.currentTime+0.85); _musicNodes.push(o);
        if(_musicCtx) setTimeout(shimmer, 400+Math.random()*1200);
      };
      setTimeout(shimmer,200);
      // Sub drone pulse
      function subPulse() {

        if(!_musicCtx) return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.value=27.5;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.08,ctx.currentTime+1.5);
        g.gain.linearRampToValueAtTime(0.06,ctx.currentTime+4); g.gain.linearRampToValueAtTime(0,ctx.currentTime+7);
        o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+7.1); _musicNodes.push(o);
        if(_musicCtx) setTimeout(subPulse, 6000+Math.random()*4000);
      };
      subPulse();


    } else if(trackId === "epic") {
      // Epic strings: rising arpeggios with drama
      const epicChords=[[196,247,294,392],[220,277,330,440],[261,330,392,523],[293,370,440,587]];
      let ei=0;
      function playEpic() {
        if(!_musicCtx) return;
        const ch=epicChords[ei%epicChords.length]; ei++;
        ch.forEach((f,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="sawtooth"; o.frequency.value=f;
          const t=i*0.18;
          g.gain.setValueAtTime(0,ctx.currentTime+t);
          g.gain.linearRampToValueAtTime(0.07,ctx.currentTime+t+0.1);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+t+2.5);
          o.connect(g); g.connect(wet); g.connect(dry); o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+2.6); _musicNodes.push(o);
        });
        // Low bass
        const b=ctx.createOscillator(),bg=ctx.createGain();
        b.type="triangle"; b.frequency.value=ch[0]/2;
        bg.gain.setValueAtTime(0,ctx.currentTime); bg.gain.linearRampToValueAtTime(0.15,ctx.currentTime+0.1);
        bg.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+3.5);
        b.connect(bg); bg.connect(dry); b.start(); b.stop(ctx.currentTime+3.6); _musicNodes.push(b);
        if(_musicCtx) setTimeout(playEpic, 2800);
      };
      playEpic();

    } else if(trackId === "cafe") {
      // Coffee shop: gentle chatter-like noise + warm chords
      function makeCafe() {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(2,ctx.sampleRate*3,ctx.sampleRate);
        for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*0.4;}
        const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; f.type="bandpass"; f.frequency.value=800; f.Q.value=0.5; g.gain.value=0.015;
        src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(makeCafe, 2800);
      };
      makeCafe();
      const cafeChords=[[261,329,392],[246,311,370],[220,277,330],[196,247,294]];
      let cai=0;
      function playCafe() {
        if(!_musicCtx) return;
        const ch=cafeChords[cai%cafeChords.length]; cai++;
        ch.forEach((f,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="triangle"; o.frequency.value=f*(1+(i%2===0?0.002:-0.002));
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.05,ctx.currentTime+0.1);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+4);
          o.connect(g); g.connect(wet); g.connect(dry); o.start(); o.stop(ctx.currentTime+4.2); _musicNodes.push(o);
        });
        if(_musicCtx) setTimeout(playCafe, 3800);
      };
      playCafe();

    } else if(trackId === "ocean") {
      // Ocean waves: filtered noise sweeps
      function wave() {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(2,ctx.sampleRate*4,ctx.sampleRate);
        for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;}
        const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain(),lfo=ctx.createOscillator(),lg=ctx.createGain();
        src.buffer=buf; f.type="lowpass"; f.frequency.value=500;
        lfo.frequency.value=0.12; lg.gain.value=300;
        lfo.connect(lg); lg.connect(f.frequency); lfo.start();
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.065,ctx.currentTime+1.5);
        g.gain.linearRampToValueAtTime(0,ctx.currentTime+3.8);
        src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src,lfo);
        if(_musicCtx) setTimeout(wave, 3500+Math.random()*1500);
      };
      wave();
      // Seagulls occasionally
      function gull() {
        if(!_musicCtx) return;
        if(Math.random()>0.6){
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="sine"; o.frequency.setValueAtTime(800,ctx.currentTime);
          o.frequency.linearRampToValueAtTime(1200,ctx.currentTime+0.3);
          o.frequency.linearRampToValueAtTime(700,ctx.currentTime+0.6);
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.03,ctx.currentTime+0.1);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.7);
          o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+0.8); _musicNodes.push(o);
        }
        if(_musicCtx) setTimeout(gull, 5000+Math.random()*8000);
      };
      setTimeout(gull,3000);

    } else if(trackId === "zen") {
      // Zen garden: singing bowl + sparse notes + silence
      function bowl() {
        if(!_musicCtx) return;
        const freqs=[196,220,261,294,330];
        const f=freqs[Math.floor(Math.random()*freqs.length)];
        [1,2,3].forEach((mult,i)=>{
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type="sine"; o.frequency.value=f*mult;
          g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.08/(i+1),ctx.currentTime+0.05);
          g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+5+i);
          o.connect(g); g.connect(wet); o.start(); o.stop(ctx.currentTime+6+i); _musicNodes.push(o);
        });
        if(_musicCtx) setTimeout(bowl, 4000+Math.random()*5000);
      };
      bowl();
      // Gentle wind
      function wind() {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
        const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; f.type="bandpass"; f.frequency.value=200; g.gain.value=0.018;
        src.connect(f); f.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(wind, 2000+Math.random()*3000);
      };
      wind();

    } else if(trackId === "piano") {
      // Solo piano: gentle melodic phrases
      const scale=[261,293,329,349,392,440,493,523,587,659,698,784];
      function phrase() {
        if(!_musicCtx) return;
        const len=4+Math.floor(Math.random()*4);
        let ts=0;
        for(let i=0;i<len;i++){
          const f=scale[Math.floor(Math.random()*scale.length)];
          const dur=0.3+Math.random()*0.5;
          [1,2].forEach((mult,hi)=>{
            const o=ctx.createOscillator(),g=ctx.createGain();
            o.type=hi===0?"triangle":"sine"; o.frequency.value=f*mult;
            g.gain.setValueAtTime(0,ctx.currentTime+ts); g.gain.linearRampToValueAtTime(hi===0?0.08:0.03,ctx.currentTime+ts+0.02);
            g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+ts+dur+0.5);
            o.connect(g); g.connect(wet); g.connect(dry); o.start(ctx.currentTime+ts); o.stop(ctx.currentTime+ts+dur+0.6); _musicNodes.push(o);
          });
          ts+=dur*0.9;
        }
        if(_musicCtx) setTimeout(phrase, ts*1000+1500+Math.random()*2000);
      };
      phrase();

    } else if(trackId === "beats") {
      // Study beats: 4/4 kick+snare+hihat groove + simple bass
      function kick() {
        if(!_musicCtx) return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="sine"; o.frequency.setValueAtTime(150,ctx.currentTime); o.frequency.exponentialRampToValueAtTime(40,ctx.currentTime+0.15);
        g.gain.setValueAtTime(0.55,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.2);
        o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime+0.22); _musicNodes.push(o);
        if(_musicCtx) setTimeout(kick, 500);
      };
      kick();
      function snareBeat() {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*0.15,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
        const src=ctx.createBufferSource(),g=ctx.createGain();
        src.buffer=buf; g.gain.value=0.2; src.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(snareBeat, 1000);
      };
      setTimeout(snareBeat,250);
      function hatBeat() {
        if(!_musicCtx) return;
        const buf=ctx.createBuffer(1,ctx.sampleRate*0.03,ctx.sampleRate);
        const d=buf.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,3);
        const src=ctx.createBufferSource(),hf=ctx.createBiquadFilter(),g=ctx.createGain();
        src.buffer=buf; hf.type="highpass"; hf.frequency.value=9000; g.gain.value=0.1;
        src.connect(hf); hf.connect(g); g.connect(master); src.start(); _musicNodes.push(src);
        if(_musicCtx) setTimeout(hatBeat, 250);
      };
      setTimeout(hatBeat,125);
      // Bass groove
      const bassLine=[65,65,73,65,55,65,73,82];
      let bi=0;
      function bassGroove() {
        if(!_musicCtx) return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.type="triangle"; o.frequency.value=bassLine[bi%bassLine.length]; bi++;
        g.gain.setValueAtTime(0,ctx.currentTime); g.gain.linearRampToValueAtTime(0.18,ctx.currentTime+0.02);
        g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.45);
        o.connect(g); g.connect(dry); o.start(); o.stop(ctx.currentTime+0.5); _musicNodes.push(o);
        if(_musicCtx) setTimeout(bassGroove, 250);
      };
      setTimeout(bassGroove,0);
    }
  } catch(e){ console.log("Music error:",e); }
}
function stopMusic(){
  try{ _musicNodes.forEach(n=>{try{n.stop();}catch(e){}}); }catch(e){}
  _musicNodes=[];
  try{ if(_musicCtx){_musicCtx.close();_musicCtx=null;} }catch(e){}
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

// == CSS Factory ===================================
function makeCSS(dark, accent, accent2, rtl) { return (`
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
*{transition:background-color .35s ease,border-color .35s ease,color .3s ease,box-shadow .35s ease;}
:root{
  --bg:${dark?"#04060e":"#eef0fa"};
  --s1:${dark?"rgba(12,15,26,0.95)":"rgba(255,255,255,0.97)"};
  --s2:${dark?"rgba(18,22,38,0.88)":"rgba(244,246,255,0.92)"};
  --s3:${dark?"rgba(26,31,52,0.80)":"#e4e7f5"};
  --s4:${dark?"rgba(36,43,70,0.90)":"#d5d9ef"};
  --b1:${dark?"rgba(100,120,220,0.11)":"rgba(0,0,0,0.06)"};
  --b2:${dark?"rgba(100,120,220,0.20)":"rgba(0,0,0,0.12)"};
  --t1:${dark?"#eceeff":"#181b2e"};
  --t2:${dark?"#8590be":"#525a84"};
  --t3:${dark?"#404870":"#8892bb"};
  --acc:${accent};
  --acc2:${accent2};
  --accd:${accent}20;
  --glow:${accent}55;
  --red:#ff6b6b;--yellow:#ffd93d;--green:#6bcb77;
  --safe-b:env(safe-area-inset-bottom,0px);
}
html,body{height:100%;background:var(--bg);color:var(--t1);font-family:'Plus Jakarta Sans',sans-serif;-webkit-font-smoothing:antialiased;direction:${rtl?"rtl":"ltr"};};transition:background .4s ease,color .4s ease;
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
  width:234px;flex-shrink:0;transition:width .25s ease,opacity .25s ease;
  background:${dark?"rgba(6,8,18,0.90)":"rgba(255,255,255,0.90)"};
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border-right:1px solid ${dark?"rgba(100,120,220,0.13)":"rgba(0,0,0,0.05)"};
  display:flex;flex-direction:column;padding:20px 0 16px;
  overflow-y:auto;position:relative;z-index:1;
  box-shadow:${dark?"4px 0 30px rgba(0,0,0,0.5)":"2px 0 20px rgba(0,0,0,0.04)"};
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
  display:flex;align-items:center;gap:10px;
  padding:11px 18px;
  padding-top:max(11px,calc(11px + env(safe-area-inset-top)));
  background:${dark?"rgba(6,8,18,0.88)":"rgba(255,255,255,0.88)"};
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border-bottom:1px solid ${dark?"rgba(100,120,220,0.10)":"rgba(0,0,0,0.05)"};
  flex-shrink:0;position:relative;z-index:2;
  box-shadow:${dark?"0 4px 24px rgba(0,0,0,0.4)":"0 2px 12px rgba(0,0,0,0.05)"};
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
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 18px 90px;-webkit-overflow-scrolling:touch;min-height:0;}

/* == STAT CARDS == */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;}
.stat{
  background:var(--s1);border:1px solid var(--b1);
  border-radius:18px;padding:14px 14px 12px;
  transition:all .25s;cursor:pointer;position:relative;overflow:hidden;
  backdrop-filter:blur(8px);
}
.stat::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,${accent}0a,${accent2}04);opacity:0;transition:opacity .2s;pointer-events:none;}
.stat:hover{transform:translateY(-3px);box-shadow:0 10px 32px ${accent}28,0 0 0 1px ${accent}35;border-color:${accent}45;}
.stat:hover::after{opacity:1;}
.stat-val{font-family:'Instrument Serif',serif;font-size:30px;line-height:1;margin-bottom:3px;background:linear-gradient(135deg,var(--t1),${accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.stat-lbl{font-size:10.5px;color:var(--t3);font-weight:700;letter-spacing:.4px;}
.stat-bar{height:3px;background:var(--s3);border-radius:2px;margin-top:10px;overflow:hidden;}
.stat-bar-f{height:100%;border-radius:2px;transition:width 1s cubic-bezier(.34,1.56,.64,1);}

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
.filter-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;}
.fchip{
  font-size:12px;padding:6px 14px;border-radius:24px;
  border:1.5px solid var(--b1);color:var(--t2);
  cursor:pointer;transition:all .2s;
  background:var(--s1);font-weight:500;
}
.fchip:hover{border-color:${accent}60;color:${accent};background:${accent}0e;}
.fchip.on{
  background:linear-gradient(135deg,${accent}28,${accent2}14);
  border-color:${accent}60;color:${accent};font-weight:700;
  box-shadow:0 2px 14px ${accent}28;
}

/* == TASK CARDS == */
.sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;}
.sec-title{font-size:12px;font-weight:800;color:var(--t2);display:flex;align-items:center;gap:7px;letter-spacing:.4px;text-transform:uppercase;}
.view-row{display:flex;gap:5px;align-items:center;}
.vt-btn{width:30px;height:30px;border-radius:9px;background:var(--s2);border:1px solid var(--b1);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--t3);transition:all .15s;}
.vt-btn.on{background:linear-gradient(135deg,${accent}28,${accent2}14);border-color:${accent}50;color:${accent};}
.sort-btn{font-size:11px;color:var(--t2);padding:5px 12px;background:var(--s2);border:1.5px solid var(--b1);border-radius:9px;font-weight:600;transition:all .15s;}
.sort-btn:hover{border-color:${accent}55;color:${accent};}
.task-list{display:flex;flex-direction:column;gap:8px;}
.task-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;}
.glass-card{
  background:${dark?"rgba(12,15,26,0.75)":"rgba(255,255,255,0.72)"};
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  border:1px solid ${dark?"rgba(124,109,250,0.18)":"rgba(255,255,255,0.85)"};
  border-radius:20px;
  box-shadow:${dark?"0 8px 32px rgba(0,0,0,0.4),inset 0 1px 0 rgba(255,255,255,0.06)":"0 8px 32px rgba(0,0,0,0.08),inset 0 1px 0 rgba(255,255,255,0.9)"};
}
.task{
  background:var(--s1);
  border:1.5px solid ${dark?"rgba(100,120,220,0.09)":"rgba(0,0,0,0.06)"};
  border-radius:18px;padding:13px 14px 13px 18px;
  display:flex;align-items:flex-start;gap:10px;
  cursor:pointer;transition:all .18s cubic-bezier(.4,0,.2,1);
  position:relative;overflow:hidden;
  backdrop-filter:blur(10px);
  animation:taskSlideIn .32s cubic-bezier(.34,1.56,.64,1) both;
  will-change:transform,opacity;
}
.task::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:3.5px;border-radius:0 3px 3px 0;background:${accent}40;transition:all .18s;}
.task:hover{border-color:${accent}50;box-shadow:0 6px 28px rgba(0,0,0,.12);transform:translateY(-2px);}
.task:hover::before{background:${accent};box-shadow:0 0 8px ${accent}60;}
.task.done-t{opacity:.5;}
.task.ov-t .task::before,.task.ov-t::before{background:#ff6b6b!important;}
.task::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3.5px;border-radius:3px 0 0 3px;opacity:0;transition:opacity .2s;}
.task:hover{border-color:${accent}45;transform:translateY(-2px);box-shadow:0 8px 28px ${accent}22,0 2px 10px rgba(0,0,0,0.14);}
.task:hover::before{opacity:1;}
.task.ph::before{background:linear-gradient(180deg,#ff6b6b,#ff4757);}
.task.pm::before{background:linear-gradient(180deg,#ffd93d,#ff9f43);}
.task.pl::before{background:linear-gradient(180deg,#6bcb77,#00d4aa);}
.task.done-t{opacity:.4;}.task.done-t .t-title{text-decoration:line-through;color:var(--t3);}
.task.ov-t{border-color:rgba(255,107,107,.32);box-shadow:0 0 0 1px rgba(255,107,107,.12);}
.task-grid .task{flex-direction:column;gap:9px;}.task-grid .t-act{opacity:1;}
.chk{
  width:22px;height:22px;
  border:2px solid var(--s4);border-radius:7px;
  flex-shrink:0;margin-top:2px;
  display:flex;align-items:center;justify-content:center;
  transition:all .22s;background:var(--s2);
}
.chk.on{background:linear-gradient(135deg,${accent},${accent2});border-color:transparent;box-shadow:0 2px 12px ${accent}55;}
.t-body{flex:1;min-width:0;}
.t-top{display:flex;align-items:flex-start;gap:7px;margin-bottom:5px;}
.t-title{font-size:13.5px;font-weight:600;line-height:1.4;flex:1;}
.t-star{font-size:14px;opacity:.28;flex-shrink:0;transition:all .2s;}
.t-star.lit{opacity:1;filter:drop-shadow(0 0 5px #ffd93d);}
.t-note{font-size:11.5px;color:var(--t3);line-height:1.55;margin-bottom:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.t-photo{width:100%;height:78px;object-fit:cover;border-radius:11px;margin-bottom:7px;border:1px solid var(--b1);}
.t-meta{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px;}
.tchip{font-size:10.5px;padding:3px 9px;border-radius:20px;font-weight:700;}
.t-date{font-size:10px;color:var(--t3);}
.t-date.ov{color:var(--red);}
.sub-prog{margin-top:5px;}
.sub-bar{height:3px;background:var(--s3);border-radius:2px;overflow:hidden;margin-bottom:2px;}
.sub-bar-f{height:100%;background:linear-gradient(90deg,${accent},${accent2});border-radius:2px;transition:width .5s cubic-bezier(.34,1.56,.64,1);}
.sub-lbl{font-size:10px;color:var(--t3);}
.t-recur{font-size:10px;color:var(--t3);display:flex;align-items:center;gap:3px;}
.t-act{display:flex;gap:3px;margin-left:3px;flex-shrink:0;opacity:0;transition:opacity .2s;}
.task:hover .t-act{opacity:1;}
.ic-btn{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;transition:all .15s;color:var(--t3);}
.ic-btn:hover{background:var(--s3);color:var(--t1);}
.ic-btn.del:hover{background:rgba(255,107,107,.18);color:var(--red);}

/* == EMPTY STATE == */
.empty{text-align:center;padding:65px 20px;}
.empty-icon{font-size:52px;margin-bottom:14px;animation:float 3.5s ease-in-out infinite;}
.empty-t{font-size:16px;color:var(--t2);margin-bottom:7px;font-weight:700;}

/* == CHAT == */
.chat-panel{
  width:296px;flex-shrink:0;
  transition:none!important;
  background:${dark?"rgba(6,8,18,0.90)":"rgba(255,255,255,0.90)"};
  backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);
  border-left:1px solid ${dark?"rgba(100,120,220,0.13)":"rgba(0,0,0,0.05)"};
  display:flex;flex-direction:column;position:relative;z-index:1;
  box-shadow:${dark?"-4px 0 30px rgba(0,0,0,0.4)":"none"};
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
.bot-nav{display:none;position:fixed;bottom:0;left:0;right:0;transition:transform .3s cubic-bezier(.4,0,.2,1);will-change:transform;padding-bottom:env(safe-area-inset-bottom,0px);background:${dark?"rgba(6,8,18,0.94)":"rgba(255,255,255,0.94)"};backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border-top:1px solid ${dark?"rgba(100,120,220,0.12)":"rgba(0,0,0,0.06)"};z-index:50;padding:6px 0 calc(6px + var(--safe-b));box-shadow:${dark?"0 -8px 30px rgba(0,0,0,0.5)":"0 -4px 20px rgba(0,0,0,0.06)"};}
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
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.82);backdrop-filter:blur(16px);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:fo .2s;}
@keyframes fo{from{opacity:0}to{opacity:1}}
.modal{background:${dark?"rgba(8,10,20,0.97)":"rgba(255,255,255,0.98)"};border:1px solid ${dark?"rgba(100,120,220,0.16)":"rgba(0,0,0,0.07)"};border-radius:28px 28px 0 0;width:100%;max-width:560px;max-height:94vh;overflow-y:auto;animation:su .32s cubic-bezier(.34,1.56,.64,1);padding-bottom:calc(14px + var(--safe-b));}
.modal.center{align-self:center;border-radius:24px;max-width:420px;}
@keyframes su{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}
.drag{width:44px;height:4px;background:linear-gradient(90deg,${accent},${accent2});border-radius:4px;margin:13px auto 4px;opacity:.7;}
.m-head{padding:8px 20px 0;display:flex;align-items:center;justify-content:space-between;}
.m-title{font-family:'Instrument Serif',serif;font-size:21px;background:linear-gradient(135deg,var(--t1) 50%,${accent});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.m-body{padding:16px 20px 14px;display:flex;flex-direction:column;gap:14px;}
.f-lbl{font-size:10px;font-weight:800;color:var(--t3);letter-spacing:.9px;text-transform:uppercase;margin-bottom:5px;}
.f-in{background:var(--s2);border:1.5px solid var(--b1);border-radius:13px;padding:10px 14px;font-size:13.5px;width:100%;color:var(--t1);transition:all .2s;}
.f-in:focus{border-color:${accent}70;box-shadow:0 0 0 3px ${accent}14;outline:none;}
.f-in::placeholder{color:var(--t3);}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.m-foot{padding:0 20px;display:flex;gap:9px;}
.btn-c{flex:1;height:46px;background:var(--s2);border:1.5px solid var(--b1);border-radius:14px;font-size:13px;color:var(--t2);transition:all .15s;font-weight:600;}
.btn-c:hover{border-color:${accent}55;color:${accent};}
.btn-s{flex:2;height:46px;background:linear-gradient(135deg,${accent},${accent2});border-radius:14px;font-size:13px;font-weight:800;color:#fff;box-shadow:0 5px 18px ${accent}55;transition:all .22s;}
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
.pin-screen{position:fixed;inset:0;background:${dark?"#04060e":"#eef0fa"};z-index:500;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;}
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
.badge-popup{position:fixed;bottom:110px;left:50%;transform:translateX(-50%);background:${dark?"rgba(8,10,20,0.97)":"rgba(255,255,255,0.98)"};border:2px solid ${accent}65;border-radius:22px;padding:16px 22px;box-shadow:0 12px 44px rgba(0,0,0,.45),0 0 32px ${accent}32;z-index:9999;animation:badgePop .5s cubic-bezier(.34,1.56,.64,1);display:flex;align-items:center;gap:14px;min-width:290px;}
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
.page-fade{animation:pageFadeIn .22s ease-out;}
@keyframes pageFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

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
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--b2); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--acc); }
/* Prevent text selection on UI elements */
.nav-item, .tb-btn, .bot-item, .fab, .btn-s, .btn-c, .add-btn { user-select: none; -webkit-user-select: none; }
/* Windows snap layout hint */
.shell { min-width: 380px; }

/* == MOBILE OPTIMIZATIONS == */
@media(max-width:768px){
  .bot-item{min-height:52px;}
  .task{box-shadow:0 2px 10px rgba(0,0,0,.2);}
  .content{padding-bottom:80px!important;}
  .chat-ta{font-size:16px!important;}
  .search-wrap input{font-size:16px!important;}
  .fab{width:60px!important;height:60px!important;}
  .settings-row{min-height:52px;}
  .qbtn{min-height:36px!important;}
}
/* == LIBI TYPING DOTS == */
@keyframes typingBounce{0%,60%,100%{transform:translateY(0);opacity:.4;}30%{transform:translateY(-6px);opacity:1;}}
.typing-dot{width:7px;height:7px;border-radius:50%;background:${accent};animation:typingBounce 1.2s ease-in-out infinite;display:inline-block;margin:0 2px;}
.typing-dot:nth-child(2){animation-delay:.2s;}
.typing-dot:nth-child(3){animation-delay:.4s;}

`);
}


// == Smart Bot =====================================
function libiBot(input, tasks, cats, t, userName="friend", memory={}) {
  const raw = input.trim();
  const msg = raw.toLowerCase();
  const name = memory.name || (userName && userName !== "friend" && userName !== "" ? userName : null);
  const hi = name ? `, ${name}` : "";
  const occupation = memory.occupation||"";
  const wakeTime = memory.wakeTime||"";
  const memFacts = memory.facts||[];
  const isStudent = occupation.toLowerCase().includes("student") || memFacts.some(f=>f.toLowerCase().includes("student"));
  const taskWord = isStudent ? "assignment" : "task";
  const taskWords = isStudent ? "assignments" : "tasks";

  // == Detect and extract memory facts from input ==
  const newFact = (()=>{
    if(/i'?m? a? ?(student|developer|designer|teacher|doctor|engineer|freelancer|manager|nurse|lawyer)/i.test(raw)) return raw;
    if(/i wake up at/i.test(raw)) return raw;
    if(/i (work|study|live) (at|in|from)/i.test(raw)) return raw;
    if(/my name is/i.test(raw)) return raw;
    if(/i (love|hate|prefer|like|dislike)/i.test(raw)) return raw;
    return null;
  })();

  // == Live task context ==
  const active  = tasks.filter(x=>!x.done);
  const done    = tasks.filter(x=>x.done);
  const overdue = active.filter(x=>x.due && new Date(x.due)<new Date());
  const high    = active.filter(x=>x.priority==="high");
  const med     = active.filter(x=>x.priority==="medium");
  const low     = active.filter(x=>x.priority==="low");
  const today   = active.filter(x=>x.due===todayStr());
  const starred = active.filter(x=>x.starred);
  const pct     = tasks.length ? Math.round((done.length/tasks.length)*100) : 0;
  const topTask = overdue[0]||high[0]||today[0]||starred[0]||active[0];

  // =========================================================
  // 1. GREETINGS
  // =========================================================
  if (/^(hi+|hey+|hello+|hii+|helo|howdy|sup|yo+|salaam|namaste|vanakkam|greetings|what'?s up|waddup|hola|bonjour|good (morning|evening|afternoon|day|night))/i.test(raw)) {
    const h = new Date().getHours();
    const timeHi = h<5?"🌙 Up late?":h<12?"🌅 Good morning":h<17?"☀️ Good afternoon":h<21?"🌆 Good evening":"🌙 Good night";
    const urgentNote = overdue.length ? `\n⚠️ Heads up — you have ${overdue.length} overdue task${overdue.length>1?"s":""}!` : done.length>0&&pct>=80 ? `\n🔥 You're crushing it — ${pct}% done today!` : "";
    return `${timeHi}${hi}! I'm LIBI — your built-in AI assistant.\n\nI live inside Taskflow and know everything about your tasks, goals and work style. I work fully offline — your data never leaves your device.${urgentNote}\n\n📊 Right now:\n• ${active.length} active tasks\n• ${done.length} completed\n• ${overdue.length} overdue\n• ${pct}% completion rate\n\nWhat can I help you with? Try: "plan my day", "what should I do first?", or "motivate me"`;
  }

  // =========================================================
  // 2. WHO ARE YOU / WHAT CAN YOU DO
  // =========================================================
  if (/(who are you|what are you|what can you do|your (name|capabilities|features)|tell me about yourself|are you (ai|chatgpt|gpt|claude|gemini|real|human)|how (do you|does libi) work)/i.test(msg)) {
    return `I'm LIBI 🤖 — a custom AI built by LIBI Labs, living inside Taskflow.\n\nI'm NOT ChatGPT or any other generic AI. I'm built specifically for productivity and I know YOUR tasks, habits and goals.\n\n💡 What I can do:\n• Plan your entire day intelligently\n• Tell you what to work on first (and why)\n• Break big goals into step-by-step tasks\n• Give personalised productivity advice based on your actual data\n• Add tasks directly from chat ("remind me to...")\n• Motivate you when you're stuck\n• Answer questions on focus, habits, time management, mental health\n• Search the web for live answers when you're online 🌐\n\n🔒 I work 100% offline — no account, no cloud, no tracking.\n\nAsk me anything!`;
  }

  // =========================================================
  // 3. WHAT SHOULD I DO FIRST / PRIORITY
  // =========================================================
  if (/(what (should|do) i (do|start|work on|tackle|focus on)|^(first|start)|most important|urgent|which task|where do i start|top task|highest priority|what'?s next)/i.test(msg)) {
    if (overdue.length > 0) {
      return `⚠️ **${overdue.length} overdue task${overdue.length>1?"s":""}${hi} — deal with these first:**\n\n${overdue.slice(0,3).map((t,i)=>`${i+1}. "${t.title}" — was due ${t.due}`).join("\n")}\n\n💡 Overdue tasks drain mental energy even when you're not working on them. Clear them first — complete, reschedule, or delete each one.\n\nWant me to help you plan a recovery strategy?`;
    }
    if (high.length > 0) {
      return `🔴 **Start with high priority${hi}:**\n\n${high.slice(0,4).map((t,i)=>`${i+1}. "${t.title}"${t.due?` (due ${t.due})`:""}`).join("\n")}\n\n💡 Don't just pick the easiest one — pick the one where completing it would make the biggest difference today. That's your first task.\n\nWant me to break any of these into smaller steps?`;
    }
    if (today.length > 0) {
      return `📅 **Due today${hi}:**\n\n${today.map((t,i)=>`${i+1}. "${t.title}"`).join("\n")}\n\n⏰ Block 25 min right now and attack the first one. The Pomodoro timer in the Focus tab will help.`;
    }
    if (starred.length > 0) {
      return `⭐ **You starred these — trust your past self${hi}:**\n\n${starred.slice(0,3).map((t,i)=>`${i+1}. "${t.title}"`).join("\n")}\n\n💡 You starred these because they matter. Start there.`;
    }
    if (active.length === 0) return `🎉 No active tasks${hi}! Your list is clear. Enjoy it or add something new with the + button.`;
    return `🎯 **Best starting point${hi}:**\n\n"${active[0].title}"\n\n💡 Commit to 25 minutes on this — just 25. Open the Focus tab and start a Pomodoro. Momentum builds from the first step.`;
  }

  // =========================================================
  // 4. PLAN MY DAY
  // =========================================================
  if (/(plan (my |the )?day|daily plan|schedule (my |the )?day|(what'?s|what is) (my |the )?plan|organise|organize|time.?block|structure my day)/i.test(msg)) {
    if (active.length === 0) return `✨ Your task list is clear${hi}! Today is yours — plan something new, rest, or explore the app.`;
    const blocks = [];
    if (overdue.length) blocks.push(`🚨 08:00-08:30 | **Overdue rescue:**\n${overdue.slice(0,2).map(x=>`  • ${x.title}`).join("\n")}`);
    if (high.length) blocks.push(`🔴 ${overdue.length?"09":"08"}:00-11:00 | **High priority deep work:**\n${high.slice(0,3).map(x=>`  • ${x.title}`).join("\n")}`);
    if (today.length) blocks.push(`📅 11:00-12:00 | **Due today:**\n${today.slice(0,2).map(x=>`  • ${x.title}`).join("\n")}`);
    if (med.length) blocks.push(`🟡 14:00-16:00 | **Medium priority:**\n${med.slice(0,3).map(x=>`  • ${x.title}`).join("\n")}`);
    if (low.length) blocks.push(`🟢 16:00-17:00 | **Low priority / admin:**\n${low.slice(0,2).map(x=>`  • ${x.title}`).join("\n")}`);
    return `📋 **Day Plan${hi}:**\n\n${blocks.join("\n\n")}\n\n⏱ Use the Pomodoro timer — 25 min focus, 5 min break. Open the Focus tab to start!\n\n💡 Check the Daily Planner tab for a more detailed time-blocked view.`;
  }

  // =========================================================
  // 5. PROGRESS / STATUS
  // =========================================================
  if (/(how am i (doing|going)|my (progress|stats|score|performance|status)|report|check.?in|am i on track|how.?s it going)/i.test(msg)) {
    const verdict = pct>=80?"🔥 You're absolutely crushing it!":pct>=60?"💪 Solid progress, keep going!":pct>=40?"📈 Getting there — momentum is building!":pct>=20?"🚀 Just getting started — every step counts!":"✨ Time to get the ball rolling!";
    return `${verdict}\n\n📊 **Your stats${hi}:**\n• ✅ ${pct}% completion rate\n• ✔️ ${done.length} tasks completed\n• ⏳ ${active.length} still active\n• ⚠️ ${overdue.length} overdue\n• 🔴 ${high.length} high priority\n• 🟡 ${med.length} medium priority\n• 🟢 ${low.length} low priority\n\n${pct>=80?"You're in elite territory. Keep this streak going!":pct>=50?"Past the halfway mark — the hardest part is already done.":"Remember: every single task you complete is a win. What can you finish in the next 30 minutes?"}`;
  }

  // =========================================================
  // 6. MOTIVATION / I'M LAZY / STUCK
  // =========================================================
  if (/(motivat|inspire|encourage|pump (me )?up|i (can'?t|don'?t want to|feel like|have no) (do|work|start|focus|motivat)|push me|hype me|i'?m (lazy|stuck|procrastinat)|give me (energy|a push)|not feeling it)/i.test(msg)) {
    const quotes = [
      `"The secret of getting ahead is getting started." — Mark Twain`,
      `"Motivation follows action — not the other way around."`,
      `"You don't have to be great to start, but you have to start to be great." — Zig Ziglar`,
      `"Done is better than perfect."`,
      `"Discipline is choosing what you want most over what you want right now."`,
      `"Small steps every day. That's how mountains are moved."`,
      `"The best time to start was yesterday. The next best time is now."`,
      `"Action is the antidote to despair." — Joan Baez`,
    ];
    const q = quotes[new Date().getMinutes() % quotes.length];
    return `⚡ **Let's go${hi}!**\n\n${q}\n\n${topTask?`🎯 One task. Right now: "${topTask.title}"\n\nDon't think about finishing it. Just open it and do 5 minutes. That's all.\n\n`:""}💡 The biggest lie about motivation: you need to FEEL ready before you start. You don't. Start first. Feeling follows.`;
  }

  // =========================================================
  // 7. STRESS / OVERWHELM / BURNOUT / ANXIETY
  // =========================================================
  if (/(stress|overwhelm|anxious|anxiety|too much|can'?t cope|burned? out|exhausted|drowning|falling behind|behind on|panic|losing it|can'?t handle|mental load)/i.test(msg)) {
    return `💙 I hear you${hi}. What you're feeling is real — and it makes sense.\n\n**Right now, do this:**\n1. 🛑 Stop. Take 3 slow breaths (4 in, hold 4, out 6).\n2. 📝 Brain dump — go to Notes and write EVERYTHING on your mind. Get it out.\n3. 🎯 Pick ONE small task. Not the biggest. The smallest. Do only that.\n4. 🚶 After — take 10 minutes away from screens.\n\n${overdue.length>0?`⚠️ You have ${overdue.length} overdue tasks — but they'll still be there after you reset. Your brain needs oxygen first.\n\n`:""}💡 Overwhelm usually comes from trying to hold everything in your head at once. The moment you write it all down, it becomes manageable.\n\nI'm here. What's the one thing weighing on you most?`;
  }

  // =========================================================
  // 8. MENTAL HEALTH / NOT OKAY
  // =========================================================
  if (/(mental health|not okay|not ok|struggling|feeling (bad|low|down|awful|terrible|hopeless)|hard (time|day|week)|depress|sad|lonely|don'?t know what to do)/i.test(msg)) {
    return `💙 Hey${hi}. Thank you for saying that.\n\nFirst — **you don't have to be productive right now.** Your worth isn't your output.\n\n**Things that genuinely help:**\n• 🚶 Move — even a 5-minute walk changes your brain chemistry\n• 🗣️ Talk to someone — a friend, family, or a professional\n• 💧 Drink water, eat something\n• 😴 Rest if your body is asking for it\n• 📵 Put the phone down for an hour\n\n**If you're in crisis** — please reach out to a trusted person or a mental health line near you. You deserve real human support.\n\nI'm an AI and I have limits. But I'm glad you're here, and I'm listening. 💙\n\nYour tasks will wait. Take care of yourself first.`;
  }

  // =========================================================
  // 9. POMODORO / FOCUS / TIMER / DEEP WORK
  // =========================================================
  if (/(pomodoro|focus timer|25 (min|minutes)|focus (mode|session|block)|deep work|time block|flow state|can'?t focus|hard to focus|distract|attention)/i.test(msg)) {
    return `🍅 **The Pomodoro Technique${hi}:**\n\n**The system:**\n1. ✅ Pick ONE task — only one\n2. ⏱ Work for exactly 25 minutes — phone face-down, notifications off\n3. ☕ 5-minute break — stand up, breathe, move\n4. Repeat × 4, then take a 20-30 min break\n\n**Why it works:**\n• Forces you to commit to a single thing\n• Makes big scary tasks feel small and time-limited\n• Scheduled rest prevents burnout\n• Builds momentum through completion\n\n**To start:** Open the **Focus tab** → pick a task → hit ▶\n\n💡 **LIBI's focus tips:**\n• Work somewhere boring — novelty is distraction\n• Close every tab except Taskflow\n• Wear headphones even if you're not listening to anything\n• Tell people around you "I'm in a session for 25 min"\n\n${topTask?`Your top task right now: "${topTask.title}" — ready to start a session?`:""}`;
  }

  // =========================================================
  // 10. PRODUCTIVITY TIPS
  // =========================================================
  if (/(tip|advice|trick|hack|suggest|recommend|how (to be|to stay|to get|to become) (more )?(product|focus|efficien|effective|organized|disciplin)|best (practice|way)|improve my|level up|be more productive)/i.test(msg)) {
    const tips = [
      `🧠 **Eat the frog:** Do your hardest, most important task FIRST — before email, before social media, before anything. Your willpower is highest in the morning.`,
      `📵 **Phone-free mornings:** Don't check your phone for the first 30 minutes of your day. You'll be shocked how differently your brain works.`,
      `✍️ **2-minute rule (David Allen):** If a task takes less than 2 minutes — do it NOW. Don't add it to your list. Adding it costs more time than doing it.`,
      `🎯 **MIT method:** Every morning, pick your 3 Most Important Tasks. Complete those before anything else. Everything else is bonus.`,
      `🔕 **Batch your distractions:** Check email and messages twice a day — 10am and 4pm. Not 50 times a day. Every notification switch costs 23 minutes of refocus time.`,
      `🛏️ **Tomorrow starts tonight:** Spend 5 minutes before bed planning tomorrow's top 3 tasks. You'll wake up with direction instead of starting from scratch.`,
      `💧 **Energy over time:** You don't manage time — you manage energy. Great sleep, movement and nutrition are productivity tools, not luxuries.`,
      `🚫 **Strategic no:** Every "yes" to something unimportant is a "no" to something that matters. Say no more — your best work depends on it.`,
      `🌊 **Protect flow state:** When you're in flow, NOTHING else matters. Block the time. Close Slack. Let calls go to voicemail. Flow is 5× more productive than normal work.`,
      `📊 **Weekly review:** Every Sunday, spend 10 minutes reviewing what you completed and planning next week. This one habit compounds massively.`,
    ];
    const tip = tips[new Date().getDate() % tips.length];
    return `💡 **Productivity tip${hi}:**\n\n${tip}\n\nWant another? Just ask "give me another tip"!`;
  }

  // =========================================================
  // 11. TIME MANAGEMENT
  // =========================================================
  if (/(time management|manage (my )?time|wasting time|not enough time|always busy|no time|time (flies|passing)|deadline|can'?t fit everything)/i.test(msg)) {
    return `⏰ **Time Management${hi}:**\n\n**The hard truth:** You have the exact same 24 hours as the most productive people alive. The difference is what they say YES and NO to.\n\n**The GTD framework:**\n1. **Capture** — Write everything down immediately (that's why Taskflow exists)\n2. **Clarify** — What does "done" actually look like for each task?\n3. **Organise** — Priority, category, due date\n4. **Review** — Weekly review every Sunday (5-10 min)\n5. **Engage** — Work the system. Trust the plan.\n\n**LIBI's top 3 time hacks:**\n• Block "focus time" BEFORE others fill your calendar\n• Time-box everything — give tasks a fixed end time or they expand forever (Parkinson's Law)\n• Plan the night before — decision fatigue is real\n\n💡 Your **Daily Planner tab** auto-schedules your tasks into time blocks — open it!`;
  }

  // =========================================================
  // 12. GOALS
  // =========================================================
  if (/(^goal|my goal|goals|milestone|achieve|ambition|long.?term|vision|life plan|dream|aspir)/i.test(msg)) {
    return `🏆 **Goals${hi}:**\n\n**SMART Goal framework:**\n• **S**pecific — "Run a 5K" not "get fit"\n• **M**easurable — you can track it\n• **A**chievable — hard but realistic\n• **R**elevant — connected to what you actually value\n• **T**ime-bound — deadline creates urgency\n\n**In Taskflow:**\n→ **Goals tab** — create goals with milestones, progress bars, deadlines\n→ **⚡ AI Breakdown** — type any goal and I'll break it into a full task list\n\n💡 **LIBI's insight:** The goal is just the direction. The daily HABITS and TASKS are what actually get you there. Set the goal, then ask me to break it down into your first 7 actions.\n\n${active.length>0?`You have ${active.length} active tasks — are any connected to a bigger goal?`:"Open the Goals tab and set your first target!"}`;
  }

  // =========================================================
  // 13. HABITS
  // =========================================================
  if (/(habit|routine|streak|consistency|build (a|the) habit|discipline|self.?control|willpower|daily practice|every day)/i.test(msg)) {
    return `🔁 **Habits${hi} — the science of change:**\n\n**The Habit Loop:** Cue → Routine → Reward\n\n**How to build habits that actually stick:**\n1. **Make it obvious** — attach it to an existing habit ("After I brush teeth, I meditate")\n2. **Make it attractive** — pair it with something enjoyable\n3. **Make it easy** — start at 2 minutes. Seriously.\n4. **Make it satisfying** — immediate reward, even just ticking a box\n\n**The #1 mistake:** Starting too big. Do 1 pushup, not 50. Read 1 page, not 1 chapter. The habit is more important than the output at first.\n\n**The golden rule:** Never miss twice. One miss is an accident. Two misses is the start of a new (bad) habit.\n\n**In Taskflow:**\n→ Habits tab — daily tracking with streaks and 14-day history grid\n\n💡 Average time to form a habit: 66 days (not 21 — that's a myth). Be patient.`;
  }

  // =========================================================
  // 14. SLEEP
  // =========================================================
  if (/(sleep|tired|exhausted|insomnia|can'?t sleep|wake up|morning routine|night routine|rest|fatigue|no energy)/i.test(msg)) {
    return `😴 **Sleep${hi} — your most underrated productivity tool:**\n\n**What bad sleep actually does:**\n• Impairs decision-making to drunk-driving levels\n• Destroys willpower and emotional regulation\n• Kills creativity and problem-solving\n• Makes everything harder, slower, worse\n\n**LIBI's sleep protocol:**\n1. 🕐 **Same sleep time** every night — including weekends\n2. 📵 **No screens** 45-60 min before bed\n3. 🌡️ **Cool room** — 18°C/65°F is optimal\n4. ☕ **No caffeine after 2pm** (it has a 6-hour half-life)\n5. 📝 **Brain dump before bed** — write tomorrow's tasks so your mind stops rehearsing them\n6. 🌫️ **Wind-down ritual** — same 3 things every night signals your brain it's time to sleep\n\n💡 If you're lying in bed awake for 20+ min: get up, do something boring in dim light, return only when sleepy. This rebuilds the bed-sleep association.`;
  }

  // =========================================================
  // 15. LEARNING / STUDYING
  // =========================================================
  if (/(study|learn|revision|exam|test|memoris|memoriz|flashcard|note.?taking|reading|course|skill|how to learn|retention)/i.test(msg)) {
    return `📚 **Learning${hi} — how to actually retain what you study:**\n\n**Ranked by scientific evidence:**\n1. 🧪 **Practice testing** — quiz yourself constantly (not re-reading)\n2. 💤 **Spaced repetition** — review at growing intervals: 1 day, 3 days, 1 week, 2 weeks\n3. 🗣️ **The Feynman technique** — explain it out loud like you're teaching a child\n4. ✏️ **Elaborative interrogation** — ask "why does this work?" constantly\n5. 🔀 **Interleaving** — mix topics in one session instead of blocking\n\n**What DOESN'T work (despite feeling effective):**\n• Highlighting and re-reading (gives false familiarity)\n• Cramming (you'll forget 90% within 24 hours)\n• Passive video watching (watching ≠ learning)\n\n**Study session structure:**\n• 25 min focused study (Pomodoro)\n• Write 3 key points from memory — close the book\n• Review and check\n\n💡 The goal isn't to finish the material — it's to remember it a week from now. Test yourself constantly.`;
  }

  // =========================================================
  // 16. LIST / SHOW TASKS
  // =========================================================
  if (/(show|list|what are|display|all).*(task|todo|to-do)|how many tasks|(task|todo).*(show|list|all|count)/i.test(msg)) {
    if (active.length === 0) return `✅ No active tasks${hi}! You're all caught up. Tap + to add something new.`;
    const fmt = (arr) => arr.map(x=>`  • ${x.title}${x.due?` (due ${x.due})`:""}`).join("\n");
    return `📋 **Your ${active.length} active tasks${hi}:**\n\n${high.length?`🔴 High (${high.length}):\n${fmt(high)}\n\n`:""}${med.length?`🟡 Medium (${med.length}):\n${fmt(med)}\n\n`:""}${low.length?`🟢 Low (${low.length}):\n${fmt(low)}`:""}${overdue.length?`\n\n⚠️ Overdue (${overdue.length}):\n${fmt(overdue)}`:""}`;
  }

  // =========================================================
  // 17. ADD TASK FROM CHAT
  // =========================================================
  if (/^(remind me to|add (task|todo|a task)|create task|new task|i need to|i have to|don'?t forget to|note to self|schedule|can you add)/i.test(msg)) {
    const match = raw.match(/(?:remind me to|add (?:task|todo|a task)|create task|new task|i need to|i have to|don'?t forget to|note to self|schedule|can you add)\s+(.+?)(?:\s+(?:tomorrow|today|tonight|next\s+\w+))?\.?$/i);
    if (match?.[1]) {
      const title = match[1].trim().replace(/[.!?]$/,"");
      const hasTmr = /tomorrow/i.test(raw);
      const hasToday = /today|tonight/i.test(raw);
      const tmr = (()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);})();
      const due = hasTmr ? tmr : hasToday ? todayStr() : "";
      return `✅ **Task added:** "${title}"${due?` — due ${hasTmr?"tomorrow":"today"}`:""}\n\nIt's now at the top of your task list! Want me to set a priority or reminder for it?`;
    }
  }

  // =========================================================
  // 18. BREAK DOWN A GOAL
  // =========================================================
  if (/(break (down|it down)|action plan|step by step|how (do i|to) (start|achieve|accomplish)|road.?map|where do i start|break.?down)/i.test(msg)) {
    return `⚡ **Goal Breakdown${hi}:**\n\nTell me your goal and I'll turn it into actionable tasks!\n\n**Try:**\n• "Break down: Launch my app"\n• "Break down: Learn guitar in 3 months"\n• "Break down: Get fit in 30 days"\n• "Break down: Start a business"\n\nOr tap **⚡ Break goal** in the quick chips above — it uses full AI to generate a complete task list automatically!\n\n💡 The secret to any goal: make the first step so small that refusing to do it would feel embarrassing.`;
  }

  // =========================================================
  // 19. NOTES
  // =========================================================
  if (/(^note|notes|write (down|it)|jot|journal|idea|capture|remember this|where do i write)/i.test(msg)) {
    return `📝 **Notes${hi}:**\n\nTaskflow has a full notes app built in!\n\n**Features:**\n• Rich text with **bold**, _italic_, bullet points, checklists\n• 8 color themes per note\n• Pin important notes to the top\n• Tags and categories (Personal, Work, Ideas, Recipes…)\n• Full-text search across all notes\n• Word and character count\n\n**How to open:** ⋯ More menu → 📝 Notes\n\n💡 **Best practice:** Notes = reference and ideas. Tasks = things with actions. Keep them separate — your mind will be much clearer.`;
  }

  // =========================================================
  // 20. BOARD / KANBAN
  // =========================================================
  if (/(board|kanban|column|backlog|sprint|project (board|management)|trello|jira|cards)/i.test(msg)) {
    return `🗂️ **Kanban Board${hi}:**\n\nTaskflow has a full Kanban board — like Trello, built in for free!\n\n**Columns:** 💡 Backlog → 📋 To Do → ⚡ In Progress → 🔍 Review → ✅ Done\n\n**Features:**\n• Drag & drop cards between columns\n• Custom columns with your own colors and names\n• Card labels, priorities, assignees, descriptions\n• Real-time sync with your team via Firebase\n• Quick done/undo buttons on each card\n\n**Open it:** ⋯ More → 🗂 Board\n\n💡 Kanban rule: never have more than 3 cards "In Progress" at once. Focus beats multitasking every time.`;
  }

  // =========================================================
  // 21. TEAM / COLLABORATION
  // =========================================================
  if (/(team|collab|share|together|group|partner|roommate|family|work with|join room|room code|sync with)/i.test(msg)) {
    return `👫 **Team Collaboration${hi}:**\n\nTaskflow has real-time Firebase collaboration built in!\n\n**How to set up:**\n1. Open the **Team tab** (👫 in ⋯ More)\n2. Sign in with your email\n3. Share your 6-digit room code (e.g. TF-ABC123)\n4. Your teammate enters the same code\n5. Tasks and board sync instantly in real time 🔥\n\n**Use it for:**\n• Couples managing household tasks\n• Study partners on shared projects\n• Small teams without paying for Asana/Trello\n• Family task sharing\n\n💡 The board also has separate collaboration codes (BRD-XXXXXX).`;
  }

  // =========================================================
  // 22. MOOD
  // =========================================================
  if (/(mood|energy level|how (do i|am i) feel|emotional|vibe|check.?in|daily mood|mood tracker)/i.test(msg)) {
    return `😊 **Mood Tracker${hi}:**\n\nYour mood and energy directly affect what kind of work you should be doing.\n\n**In Taskflow:** ⋯ More → 😊 Mood\n• Log daily energy: 😴 Dead → 🚀 Amazing\n• 7-day mood chart\n• Notes for each day\n\n**How to use it strategically:**\n• High energy days → deep work, hard problems, important decisions\n• Low energy days → admin, easy tasks, reviews, planning\n• Track for 2 weeks → you'll see clear patterns\n\n💡 Most people have peak energy at the same time every day (usually 9am-12pm for morning people). Once you know yours, protect that window ferociously.`;
  }

  // =========================================================
  // 23. STATISTICS
  // =========================================================
  if (/(statistics|stats page|analytics|chart|graph|weekly (review|summary)|my week|how did i do this week)/i.test(msg)) {
    return `📊 **Statistics${hi}:**\n\nTaskflow tracks all your productivity data automatically!\n\n**Stats tab shows:**\n• Daily/weekly completion rate charts\n• Task completion by category\n• Streak tracking\n• Best performing days\n• Total tasks done vs active\n\n**Weekly Review:**\nOpen ⋯ More → 📅 Week for your full weekly breakdown with bar chart, mood average, best day and a motivational summary.\n\n💡 Check your stats every Sunday for 5 minutes. Seeing your progress is one of the strongest motivators to keep going.`;
  }

  // =========================================================
  // 24. SETTINGS / CUSTOMIZATION
  // =========================================================
  if (/(setting|theme|dark|light mode|color|accent|language|wallpaper|icon|appearance|customize|personaliz|change the)/i.test(msg)) {
    return `⚙️ **Customize Taskflow${hi}:**\n\n**Settings tab (⚙️):**\n• 🌙 Dark / ☀️ Light mode\n• 🎨 8 accent colors\n• 🌍 5 languages: English, Arabic (RTL), Hindi, French, Spanish\n• 🔒 PIN lock\n• 📤 Export tasks as JSON\n• 🔔 Notification settings\n• 📛 Custom app name\n\n**Visual customization:**\n• 🖼️ 9 wallpapers — Galaxy, Nebula, Aurora, Sunset, Ocean, Forest, Desert, Cherry, Arctic\n• 🎨 Custom app icon — tap the ✦ logo in the sidebar!\n\n**Pro tip:** Galaxy wallpaper + dark mode + purple accent = 🤯`;
  }

  // =========================================================
  // 25. FEATURES / WHAT DOES THE APP DO
  // =========================================================
  if (/(feature|what (does|can) (this|the) app|what'?s in|overview|tour|all features|everything (in|the app)|help)/i.test(msg)) {
    return `✦ **Taskflow Ultimate — Everything${hi}:**\n\n📋 Tasks — priorities, categories, due dates, subtasks, tags, photos, recurring\n⏰ Reminders — 6 alarm tones, date+time picker, OS notifications\n📅 Calendar — month view with task indicators\n📊 Statistics — completion charts, streaks, categories\n⏱ Focus & Time — Pomodoro + per-task time tracking\n🏆 Goals — milestones, progress bars, deadlines\n🔁 Habits — daily tracking, streaks, 14-day grid\n⏰ Daily Planner — auto time-blocked schedule\n📝 Notes — rich text, colors, tags, pin, search\n😊 Mood — daily energy log, 7-day chart\n🗂️ Board — full Kanban drag & drop\n👫 Team — real-time Firebase collaboration\n🤖 LIBI AI — that's me! Chat + web search\n🌌 Focus Mode — fullscreen zen workspace\n🏅 Gamification — XP, 10 levels, 20+ badges\n⌘K Command palette — keyboard shortcuts\n🎵 12 ambient music tracks built in\n🌍 5 languages with RTL support\n🖼️ 9 wallpaper themes\n📱 Works on Android + any browser\n\nWhat do you want to explore?`;
  }

  // =========================================================
  // 26. GOOD MORNING / GOOD NIGHT
  // =========================================================
  if (/^good (morning|night|evening|afternoon)/i.test(msg)) {
    const isNight = /night/i.test(msg);
    if (isNight) {
      const doneToday = done.filter(x=>new Date(x.createdAt||0).toDateString()===new Date().toDateString());
      return `🌙 Good night${hi}!\n\n${doneToday.length>0?`You completed ${doneToday.length} task${doneToday.length>1?"s":""} today — that's real progress. 🎉\n\n`:""}**Before you sleep:**\n• ✅ Review what you finished today\n• 📝 Write tomorrow's top 3 tasks\n• 📵 Put the phone down in 10 minutes\n\nRest well. Tomorrow's list will be waiting. 💙`;
    }
    const h = new Date().getHours();
    return `${h<12?"🌅":"🌆"} Good ${h<12?"morning":"evening"}${hi}!\n\n${overdue.length?`⚠️ ${overdue.length} overdue task${overdue.length>1?"s":""} need attention.\n\n`:""}**How to start strong:**\n1. Pick your 3 most important tasks for today\n2. Start with the hardest one first (Eat the frog)\n3. Block your first 2 hours for deep work\n\n${topTask?`🎯 Your top task: "${topTask.title}"\n\nReady to start a focus session on it?`:"You have no urgent tasks — great time to plan proactively!"}`;
  }

  // =========================================================
  // 27. THANK YOU / COMPLIMENT
  // =========================================================
  if (/^(thanks?|thank you|thx|ty|appreciate|cheers|great|perfect|awesome|amazing|you'?re (the best|amazing|great|helpful)|love (you|this|it)|nice one|brilliant|fantastic)/i.test(msg)) {
    return `😊 You're welcome${hi}! That's exactly what I'm here for.\n\nAnything else on your mind? I'm always here — even offline. 🤖`;
  }

  // =========================================================
  // 28. YES / FOLLOW UP
  // =========================================================
  if (/^(yes|yeah|sure|ok|okay|yep|yup|let'?s (do it|go)|sounds good|go ahead|please|definitely|of course)/i.test(msg)) {
    if (topTask) return `✅ Let's do it${hi}! Start with: "${topTask.title}"\n\nOpen the Focus tab → pick this task → hit ▶ for 25 minutes. You've got this! 🚀`;
    return `✅ Let's go${hi}! Add a task with the + button and we'll build some momentum together.`;
  }

  // =========================================================
  // 29. MATH
  // =========================================================
  const mathExpr = msg
    .replace(/what is|calculate|compute|solve|whats|what'?s|=\?|equals?/gi,'')
    .replace(/[xX×]/g,'*').replace(/÷/g,'/').replace(/\^/g,'**')
    .trim();
  if (/^[\d\s\+\-\*\/\(\)\.\^%\*]+$/.test(mathExpr) && /\d/.test(mathExpr) && mathExpr.length > 0) {
    try {
      const r = Function('"use strict";return (' + mathExpr + ')')();
      if (typeof r === 'number' && isFinite(r)) {
        const display = mathExpr.replace(/\*\*/g,'^(power)').replace(/\*/g,'×');
        return `🔢 **${display.trim()} = ${Number(r.toFixed(8))}**`;
      }
    } catch(e) {}
  }

  // =========================================================
  // 30. OFFLINE KNOWLEDGE BASE
  // =========================================================
  const kb = [
    [/(pomodoro technique|what is pomodoro)/i, `🍅 **Pomodoro Technique** (Francesco Cirillo, 1980s)\n\nWork 25 minutes → 5 min break → repeat × 4 → 15-30 min break. Named after his tomato kitchen timer.\n\n**Why it works:** Forces commitment to one task, makes big tasks feel small, schedules recovery.\n\nOpen the Focus tab in Taskflow to use it!`],
    [/(getting things done|gtd)/i, `📋 **Getting Things Done (GTD)** — David Allen\n\n5 steps: **Capture → Clarify → Organise → Review → Engage**\n\nCore idea: get EVERYTHING out of your head into a trusted system. Your brain is for having ideas, not storing them.`],
    [/(eisenhower (matrix|box|principle))/i, `📊 **Eisenhower Matrix**\n\n4 quadrants:\n• Urgent + Important → ✅ DO\n• Not urgent + Important → 📅 SCHEDULE\n• Urgent + Not important → 📤 DELEGATE\n• Not urgent + Not important → 🗑 DELETE\n\n💡 Most people live in "Urgent". The goal is to spend more time in "Important but not urgent" — that's where growth happens.`],
    [/(deep work|cal newport)/i, `🧠 **Deep Work** (Cal Newport)\n\nFocused, distraction-free work on cognitively demanding tasks. 2-4 hours of deep work can outperform 8 hours of shallow work.\n\n**How:** Same time, same place. All notifications off. 90-min blocks. Treat it like a non-negotiable meeting with yourself.`],
    [/(parkinson'?s law)/i, `⏰ **Parkinson's Law:** "Work expands to fill the time available for its completion."\n\n**Use it:** Give yourself LESS time than you think you need. A task you'd take a week for could be done in 2 hours with a tight deadline.`],
    [/(80.?20|pareto (principle|rule))/i, `📊 **Pareto Principle (80/20 Rule)**\n\n80% of your results come from 20% of your actions.\n\nLook at your task list: which 20% of tasks, if completed, would produce 80% of the value? Do those first. Delete or delegate the rest.`],
    [/(flow state|being in the zone)/i, `🌊 **Flow State** (Mihaly Csikszentmihalyi)\n\nPeak performance state — fully absorbed, time disappears, output is extraordinary.\n\n**Triggers:**\n• Clear goal for the session\n• Challenge slightly above your current skill level\n• Immediate feedback\n• Zero interruptions for 20+ minutes (warm-up period)`],
    [/(procrastinat)/i, `😬 **Procrastination${hi}:**\n\nNot laziness — it's emotional avoidance. We avoid tasks because they trigger anxiety, boredom, self-doubt, or resentment.\n\n**The fix isn't willpower — reduce the emotional cost:**\n1. Shrink the task to 2 minutes only\n2. Remove friction — have everything ready\n3. Forgive yourself — guilt makes procrastination WORSE\n4. Just start — action kills anxiety\n\n💡 The moment you start, the avoidance feeling drops by ~70%.`],
    [/(atomic habits|james clear)/i, `📖 **Atomic Habits** — James Clear\n\nTiny 1% improvements compound into massive results.\n\n**The 4 laws:**\n1. Make it obvious (cue)\n2. Make it attractive (craving)\n3. Make it easy (response)\n4. Make it satisfying (reward)\n\n**Identity-based:** "I want to run" vs "I am a runner". Act like the person you want to become.`],
    [/(growth mindset|carol dweck)/i, `🧠 **Growth Mindset** — Carol Dweck\n\nFixed mindset: "I'm either good at this or I'm not."\nGrowth mindset: "I can develop any skill with effort and time."\n\n**The shift:** Instead of "I can't do this", say "I can't do this YET."\n\nResearch shows this single belief change improves performance, resilience, and learning speed.`],
  ];

  for (const [pattern, answer] of kb) {
    if (pattern.test(msg)) return answer;
  }

  // =========================================================
  // 31. CATCH-ALL -- smart and contextual
  // =========================================================
  const contextual = active.length > 0
    ? `\n\n💡 By the way — you have ${active.length} active task${active.length>1?"s":""}${overdue.length>0?` and ${overdue.length} overdue`:""} waiting for you.`
    : "";


  // == How are you ==
  if (/how are you|how('s| is) it going|you okay|you good/i.test(msg))
    return `I'm doing great, thanks for asking${userName&&userName!=="friend"?" "+userName:""}! 😊\n\nI'm always here and always ready to help. Right now you have ${active.length} active tasks.\n\nWhat can I do for you today?`;

  // == Jokes ==
  if (/joke|funny|make me laugh|cheer me up|tell me something funny/i.test(msg)) {
    const jokes = [
      "Why do programmers prefer dark mode?\n\nBecause light attracts bugs! 🐛😂",
      "I told myself I'd finish my tasks by noon...\n\nThat was yesterday. 😅",
      "Why did the task manager break up with the calendar?\n\nToo many missed dates! 📅💔",
      "My to-do list has 47 items.\nI've completed 1.\nProgress: technically yes. 🎯😂",
      "I'll start being productive tomorrow.\n\n— Me, every day since 2019. 😂",
    ];
    return jokes[Math.floor(Math.random()*jokes.length)] + "\n\n😄 Want another? Just say 'joke' again!";
  }

  // == Motivational quotes ==
  if (/^quote|inspire me|inspiration|wise words|wisdom/i.test(msg)) {
    const quotes = [
      `"The secret of getting ahead is getting started." — Mark Twain\n\n💡 You have ${active.length} tasks waiting. Start with the smallest one.`,
      `"It does not matter how slowly you go, as long as you do not stop." — Confucius`,
      `"Done is better than perfect." — Sheryl Sandberg\n\n💡 Stop overthinking. Start. Adjust later.`,
      `"The key is not to prioritize what's on your schedule, but to schedule your priorities." — Stephen Covey`,
      `"You don't have to be great to start, but you have to start to be great." — Zig Ziglar`,
    ];
    return quotes[Math.floor(Math.random()*quotes.length)];
  }

  // == What time is it ==
  if (/what time|what day|current date|today's date/i.test(msg)) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    const dateStr = now.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    return `🕐 It's ${timeStr}\n📅 ${dateStr}\n\n${tasks.filter(t=>!t.done&&t.due===todayStr()).length>0?`You have ${tasks.filter(t=>!t.done&&t.due===todayStr()).length} task${tasks.filter(t=>!t.done&&t.due===todayStr()).length>1?"s":""} due today — let's tackle them! 💪`:"No tasks due today — but you have "+active.length+" active ones!"}`;
  }

  // == Birthday ==
  if (/birthday|happy birthday|anniversary|special day/i.test(msg))
    return `🎉 Happy Birthday${userName&&userName!=="friend"?", "+userName:""}!\n\nI hope today is absolutely amazing! 🎂\n\nEven on special days, ticking off one small task feels great — but mostly, enjoy yourself today. You deserve it! 🎁`;

  // == Low energy ==
  if (/tired|sleepy|no energy|low energy|can'?t focus|distracted/i.test(msg))
    return `Feeling drained${userName&&userName!=="friend"?", "+userName:""}? Totally normal. Here's your 5-minute recharge:\n\n💧 Drink a glass of water RIGHT NOW\n🚶 Stand up and walk for 2 minutes\n😮‍💨 Take 5 deep slow breaths\n☀️ Look at something far away for 20 seconds\n\nAfter that — pick just ONE small task. Just one. 💪\n\nYou have ${active.length} tasks. Which feels easiest right now?`;

  // == Bored ==
  if (/bored|nothing to do|free time/i.test(msg)) {
    if(active.length > 0) return `Bored? Really? 😄\n\nYou have ${active.length} tasks just sitting there:\n\n${active.slice(0,3).map((t,i)=>`${i+1}. "${t.title}"`).join("\n")}\n\nSpend just 10 minutes on one of them. You'll feel way better!`;
    return `No tasks and free time — enjoy it! 🌟\n\nOr use this time to:\n• Set some new goals (🏆 Goals)\n• Build a new habit (🔁 Habits)\n• Plan next week (📅 Planner)\n• Add something you've been putting off`;
  }

  const fallbacks = [
    `🤔 I didn't quite get that${hi}, but I'm here to help!\n\nTry asking:\n• "Plan my day"\n• "What should I do first?"\n• "Give me a tip"\n• "I'm overwhelmed"\n• "What is the Pomodoro technique?"\n• "Break down: [your goal]"\n\n🌐 For live web answers, make sure you're connected to WiFi!${contextual}`,
    `🤖 Hmm, new territory! I'm still learning${hi}.\n\nTry rephrasing, or ask something like:\n• "Motivate me"\n• "How am I doing?"\n• "Study tips"\n• "Add task: review finances"\n\n🌐 Online? Ask me anything factual and I'll search the web!${contextual}`,
    `💬 I work best with questions like:\n• "What's my progress?"\n• "Plan my day"\n• "I'm stressed"\n• "Tips for focus"\n• "What is deep work?"\n• "Good morning"\n\n📡 Connect to WiFi for live web search on any topic!${contextual}`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ===================================================
//  MAIN APP
// ===================================================
const WALLPAPERS = [
  {id:"auto",    label:"Auto 🕐",   gradient:"auto",                                                                              preview:"linear-gradient(135deg,#000008,#1a0040,#7c6dfa)"},
  {id:"none",     label:"None",        gradient:"none",                                                                          preview:"var(--bg)"},
  {id:"galaxy",   label:"Galaxy ✨",   gradient:"linear-gradient(160deg,#000008 0%,#0a0020 25%,#1a0040 50%,#2d0060 70%,#7c6dfa 100%)", preview:"linear-gradient(160deg,#000008,#1a0040,#7c6dfa)"},
  {id:"nebula",   label:"Nebula 🌌",   gradient:"linear-gradient(135deg,#000015 0%,#0d0030 30%,#200060 55%,#4a0080 75%,#9b59b6 90%,#ff6b9d 100%)", preview:"linear-gradient(135deg,#000015,#200060,#9b59b6,#ff6b9d)"},
  {id:"aurora",   label:"Aurora",      gradient:"linear-gradient(160deg,#050a14 0%,#0d2137 40%,#00c9a7 70%,#7c6dfa 100%)",     preview:"linear-gradient(160deg,#050a14,#0d2137,#00c9a7,#7c6dfa)"},
  {id:"sunset",   label:"Sunset",      gradient:"linear-gradient(160deg,#1a0533 0%,#6b1a3a 40%,#ff6b35 100%)",                  preview:"linear-gradient(160deg,#1a0533,#6b1a3a,#ff6b35)"},
  {id:"ocean",    label:"Ocean",       gradient:"linear-gradient(160deg,#0a0a2e 0%,#0d3b6e 50%,#00b4d8 100%)",                  preview:"linear-gradient(160deg,#0a0a2e,#0d3b6e,#00b4d8)"},
  {id:"forest",   label:"Forest",      gradient:"linear-gradient(160deg,#0a1628 0%,#1a3a2a 50%,#2d7a4f 100%)",                  preview:"linear-gradient(160deg,#0a1628,#1a3a2a,#2d7a4f)"},
  {id:"desert",   label:"Desert",      gradient:"linear-gradient(160deg,#1a0a00 0%,#8b3a00 50%,#ffd93d 100%)",                  preview:"linear-gradient(160deg,#1a0a00,#8b3a00,#ffd93d)"},
  {id:"cherry",   label:"Cherry",      gradient:"linear-gradient(160deg,#1a0010 0%,#6b0028 50%,#ff6b9d 100%)",                  preview:"linear-gradient(160deg,#1a0010,#6b0028,#ff6b9d)"},
  {id:"arctic",   label:"Arctic",      gradient:"linear-gradient(160deg,#0a1628 0%,#1a3a5c 50%,#a8d8ea 100%)",                  preview:"linear-gradient(160deg,#0a1628,#1a3a5c,#a8d8ea)"},
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
  if (task.priority === "high")   score += 40;
  if (task.priority === "medium") score += 20;
  if (task.priority === "low")    score += 5;
  // Deadline urgency
  if (task.due) {
    const daysLeft = Math.ceil((new Date(task.due) - now) / (1000*60*60*24));
    if (daysLeft < 0)  score += 50; // overdue — critical
    else if (daysLeft === 0) score += 35;
    else if (daysLeft <= 2)  score += 25;
    else if (daysLeft <= 7)  score += 15;
    else if (daysLeft <= 14) score += 8;
  }
  // Starred bonus
  if (task.starred) score += 10;
  // Recurring tasks get a small bump
  if (task.recurring && task.recurring !== "never") score += 5;
  // Subtask progress bonus (partially done = in-progress, worth prioritising)
  if (task.subtasks?.length > 0) {
    const doneSubs = task.subtasks.filter(s=>s.done).length;
    if (doneSubs > 0 && doneSubs < task.subtasks.length) score += 8;
  }
  return Math.min(score, 100);
}

// == AI Smart Suggestions Engine =====================
// Analyzes task history + patterns and returns suggestions
function getAISuggestions(tasks, categories) {
  const suggestions = [];
  const now = new Date();
  const todayStr2 = now.toISOString().split("T")[0];
  const todayDay = now.getDay();
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const completedTasks = tasks.filter(t=>t.done);
  const activeTasks = tasks.filter(t=>!t.done);

  // 1. Overdue tasks
  const overdue = activeTasks.filter(t=>t.due&&new Date(t.due)<now);
  if(overdue.length>0) {
    const oldest = [...overdue].sort((a,b)=>new Date(a.due)-new Date(b.due))[0];
    suggestions.push({id:"overdue_"+oldest.id,type:"urgent",icon:"⚠️",
      title:"Overdue task needs attention!",
      body:`"${oldest.title}" was due ${oldest.due}. Tackle it now or reschedule.`,
      action:"view_tasks",color:"#ff6b6b"});
  }

  // 2. Pattern: tasks user does on same day of week
  const dayPatterns = {};
  completedTasks.forEach(t=>{
    if(!t.createdAt) return;
    const d = new Date(t.createdAt).getDay();
    if(!dayPatterns[d]) dayPatterns[d]=[];
    dayPatterns[d].push(t);
  });
  if(dayPatterns[todayDay]?.length>=2) {
    const cat = categories.find(c=>c.id===dayPatterns[todayDay][0]?.categoryId);
    if(cat) suggestions.push({id:"pattern_day",type:"pattern",icon:"🔄",
      title:`${dayNames[todayDay]} pattern detected!`,
      body:`You often complete ${cat.icon} ${cat.name} tasks today. Want to add one?`,
      action:"add_task",categoryId:cat.id,color:cat.color});
  }

  // 3. Task not touched in 3+ days
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate()-3);
  const stale = activeTasks.filter(t=>t.createdAt&&new Date(t.createdAt)<threeDaysAgo&&!t.done);
  if(stale.length>0) {
    suggestions.push({id:"stale_"+stale[0].id,type:"nudge",icon:"😴",
      title:`You haven't touched "${stale[0].title}" in 3+ days`,
      body:"It's been sitting there. 5 minutes on it right now?",
      action:"view_tasks",color:"#ffd93d"});
  }

  // 4. Inactive for 3 days
  const recentDone = completedTasks.filter(t=>(now-new Date(t.createdAt||0))<3*24*60*60*1000);
  if(recentDone.length===0 && activeTasks.length>0) {
    suggestions.push({id:"nudge_inactive",type:"motivation",icon:"🚀",
      title:"No completions in 3 days!",
      body:"Pick one small task and get a win. Momentum starts with one.",
      action:"view_tasks",color:"#7c6dfa"});
  }

  // 5. No due dates
  const noDue = activeTasks.filter(t=>!t.due);
  if(noDue.length>=3) {
    suggestions.push({id:"no_due",type:"tip",icon:"📅",
      title:`${noDue.length} tasks have no deadline`,
      body:"Tasks with due dates are 3× more likely to get done. Add dates!",
      action:"view_tasks",color:"#ffd93d"});
  }

  // 6. High priority with no deadline
  const highNoDue = activeTasks.filter(t=>t.priority==="high"&&!t.due);
  if(highNoDue.length>0) {
    suggestions.push({id:"high_no_due",type:"tip",icon:"🔴",
      title:`${highNoDue.length} high-priority task${highNoDue.length>1?"s have":" has"} no deadline`,
      body:`"${highNoDue[0].title}" is high priority — add a due date!`,
      action:"view_tasks",color:"#ff6b6b"});
  }

  // 7. Great streak recognition
  const last7 = Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().slice(0,10);});
  const activeDays = last7.filter(day=>completedTasks.some(t=>t.createdAt&&new Date(t.createdAt).toISOString().slice(0,10)===day));
  if(activeDays.length>=5) {
    suggestions.push({id:"great_streak",type:"reward",icon:"🔥",
      title:`${activeDays.length}-day productivity streak!`,
      body:"You've been absolutely on fire this week. Keep it going!",
      action:null,color:"#ff9f43"});
  }

  // 8. Time estimate insight -- tasks with estimates take less time
  const withEst = activeTasks.filter(t=>t.timeEstimate>0);
  if(activeTasks.length>3 && withEst.length<activeTasks.length/2) {
    suggestions.push({id:"add_estimates",type:"tip",icon:"⏱",
      title:"Add time estimates to plan better",
      body:"Tap any task → set time estimate. LIBI will plan your day more accurately.",
      action:"view_tasks",color:"#48dbfb"});
  }

  // 9. Dependency blocker
  const blocked = activeTasks.filter(t=>t.dependsOn?.length>0 && t.dependsOn.some(d=>!tasks.find(t2=>t2.id===d)?.done));
  if(blocked.length>0) {
    suggestions.push({id:"blocked_tasks",type:"warning",icon:"🔒",
      title:`${blocked.length} task${blocked.length>1?"s are":" is"} blocked`,
      body:`"${blocked[0].title}" is waiting on another task to be completed first.`,
      action:"view_tasks",color:"#a855f7"});
  }

  return suggestions.slice(0,4);
}


// ===================================================
//  🏆 GAMIFICATION ENGINE
// ===================================================
const BADGES = [
  {id:"first_task",    icon:"🌱", name:"First Step",       desc:"Complete your first task",              xp:50,   check:(stats)=>stats.totalDone>=1},
  {id:"ten_tasks",     icon:"⚡", name:"Getting Things Done",desc:"Complete 10 tasks",                  xp:100,  check:(stats)=>stats.totalDone>=10},
  {id:"fifty_tasks",   icon:"🔥", name:"Productivity Pro", desc:"Complete 50 tasks",                    xp:300,  check:(stats)=>stats.totalDone>=50},
  {id:"hundred_tasks", icon:"🚀", name:"Centurion",        desc:"Complete 100 tasks — incredible!",     xp:600,  check:(stats)=>stats.totalDone>=100},
  {id:"streak_3",      icon:"📅", name:"3-Day Streak",     desc:"Complete tasks 3 days in a row",       xp:75,   check:(stats)=>stats.streak>=3},
  {id:"streak_7",      icon:"🗓", name:"Week Warrior",     desc:"7-day productivity streak",            xp:200,  check:(stats)=>stats.streak>=7},
  {id:"streak_30",     icon:"🏆", name:"Monthly Master",   desc:"30-day productivity streak",           xp:500,  check:(stats)=>stats.streak>=30},
  {id:"high_five",     icon:"🎯", name:"High Five",        desc:"Complete 5 high-priority tasks",       xp:150,  check:(stats)=>stats.highDone>=5},
  {id:"early_bird",    icon:"🌅", name:"Early Bird",       desc:"Complete a task before 9am",           xp:100,  check:(stats)=>stats.earlyBird},
  {id:"night_owl",     icon:"🦉", name:"Night Owl",        desc:"Complete a task after 10pm",           xp:100,  check:(stats)=>stats.nightOwl},
  {id:"goal_getter",   icon:"🏅", name:"Goal Getter",      desc:"Complete your first goal",             xp:200,  check:(stats)=>stats.goalsCompleted>=1},
  {id:"habit_hero",    icon:"🔁", name:"Habit Hero",       desc:"Log 7 habit completions",              xp:150,  check:(stats)=>stats.habitCompletions>=7},
  {id:"note_taker",    icon:"📝", name:"Note Taker",       desc:"Create 5 notes",                       xp:75,   check:(stats)=>stats.notesCreated>=5},
  {id:"deep_thinker",  icon:"🧠", name:"Deep Thinker",     desc:"Create a note with 100+ words",        xp:80,   check:(stats)=>stats.longNoteCreated},
  {id:"team_player",   icon:"👫", name:"Team Player",      desc:"Share a task with someone",            xp:100,  check:(stats)=>stats.sharedTasks>=1},
  {id:"overdue_slayer",icon:"⚔️", name:"Overdue Slayer",   desc:"Clear 5 overdue tasks",                xp:200,  check:(stats)=>stats.overdueCleared>=5},
  {id:"perfectionist", icon:"💎", name:"Perfectionist",    desc:"Complete all subtasks in a task",      xp:100,  check:(stats)=>stats.perfectTasks>=1},
  {id:"planner",       icon:"📆", name:"Master Planner",   desc:"Use Daily Planner 3 times",            xp:75,   check:(stats)=>stats.plannerUses>=3},
  {id:"zen_master",    icon:"🧘", name:"Zen Master",       desc:"Complete 10 focus sessions",           xp:200,  check:(stats)=>stats.focusSessions>=10},
  {id:"comeback_kid",  icon:"💪", name:"Comeback Kid",     desc:"Complete a task after 5+ days idle",   xp:150,  check:(stats)=>stats.comebackDays>=5},
];

const XP_LEVELS = [
  {level:1,  name:"Beginner",     minXP:0,    icon:"🌱"},
  {level:2,  name:"Learner",      minXP:100,  icon:"📚"},
  {level:3,  name:"Doer",         minXP:250,  icon:"⚡"},
  {level:4,  name:"Achiever",     minXP:500,  icon:"🎯"},
  {level:5,  name:"Go-Getter",    minXP:800,  icon:"🔥"},
  {level:6,  name:"Pro",          minXP:1200, icon:"💼"},
  {level:7,  name:"Expert",       minXP:1800, icon:"🏆"},
  {level:8,  name:"Master",       minXP:2500, icon:"💎"},
  {level:9,  name:"Legend",       minXP:3500, icon:"🌟"},
  {level:10, name:"Taskflow King", minXP:5000, icon:"👑"},
];

function getLevel(xp) {
  let current = XP_LEVELS[0];
  for (const lvl of XP_LEVELS) { if (xp >= lvl.minXP) current = lvl; }
  const next = XP_LEVELS.find(l=>l.minXP>xp);
  const progress = next ? Math.round(((xp-current.minXP)/(next.minXP-current.minXP))*100) : 100;
  return {...current, next, progress, xp};
}

export default function App() {

  // == Register Service Worker for Push Notifications & PWA ==
  useEffect(()=>{
    if("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(reg=>{
        // Schedule daily briefing when permission granted
        function scheduleDailyBriefing() {
          try {
            const mem = JSON.parse(localStorage.getItem("tf_libi_memory")||"{}");
            const wakeStr = mem.wakeTime||"8:00 AM";
            const h = wakeStr.match(/(\d+)/)?.[1]||8;
            const isPM = wakeStr.includes("PM") && !wakeStr.includes("12");
            const wakeHour = (parseInt(h) + (isPM?12:0)) % 24;
            const todayTasks = JSON.parse(localStorage.getItem("tf_tasks")||"[]").filter(t=>!t.done).length;
            const stats = JSON.parse(localStorage.getItem("tf_gamstats")||"{}");
            const mem2 = JSON.parse(localStorage.getItem("tf_libi_memory")||"{}");
            navigator.serviceWorker.ready.then(sw=>{
              sw.active?.postMessage({
                type:"SCHEDULE_DAILY",
                hour:wakeHour,
                taskCount:todayTasks,
                streakDays:stats.streak||0,
                userName:mem2.name||""
              });
            });
          } catch(e){}
        }
        if(Notification.permission==="granted") scheduleDailyBriefing();
        // Save scheduler for when permission is granted later
        window._scheduleDailyBriefing = scheduleDailyBriefing;
      }).catch(()=>{});
    }
    // Request notification permission after 5 seconds
    if("Notification" in window && Notification.permission === "default") {
      setTimeout(async ()=>{
        const perm = await Notification.requestPermission();
        setNotifPermission(perm);
      }, 5000);
    }
  }, []);

  // == Settings ==
  // == Onboarding ==
  const [userName, setUserName] = useState(()=>localStorage.getItem('tf_username')||'');
  const [hasOnboarded, setHasOnboarded] = useState(()=>!!localStorage.getItem("tf_onboarded"));
  const [onboardStep, setOnboardStep] = useState(0);
  const [onboardName, setOnboardName] = useState("");
  const [onboardUse,  setOnboardUse]  = useState("");
  const [onboardWake, setOnboardWake] = useState("7:00 AM");
  const [onboardTask, setOnboardTask] = useState("");

  const [dark, setDark] = useState(()=>{
    try{
      const s=localStorage.getItem("tf_dark");
      if(s!==null) return JSON.parse(s);
      // First time: follow system preference
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
    }catch(e){return true;}
  });
  // Listen for system theme changes
  useEffect(()=>{
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if(!mq) return;
    function handler(e) {
      // Only auto-follow if user hasn't set a preference
      const saved = localStorage.getItem("tf_dark");
      if(saved === null) setDark(e.matches);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  },[]);
  const [accentIdx, setAccentIdx] = useState(()=>{try{const s=localStorage.getItem("tf_accent");return s?JSON.parse(s):0;}catch(e){return 0;}});
  const [langKey, setLangKey] = useState(()=>{try{const s=localStorage.getItem("tf_lang");return s||"en";}catch(e){return "en";}});
  const [soundOn, setSoundOn] = useState(true);

  // == Command Palette ==
  const [showPalette, setShowPalette] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteRef = useRef(null);

  // == Time Tracking ==
  const [timeEntries, setTimeEntries] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_time")||"[]");}catch(e){return [];}});
  const [activeTimer, setActiveTimer] = useState(null); // {taskId, startedAt}
  const [timerTick, setTimerTick] = useState(0);
  useEffect(()=>{
    if(!activeTimer) return;
    const iv = setInterval(()=>setTimerTick(t=>t+1),1000);
    return ()=>clearInterval(iv);
  },[activeTimer]);
  function startTimer(taskId) {
    if(activeTimer) stopTimer();
    setActiveTimer({taskId, startedAt:Date.now()});
    showNotif("⏱ Timer started!","Tracking time on task");
  };
  function stopTimer() {
    if(!activeTimer) return;
    const duration = Math.floor((Date.now()-activeTimer.startedAt)/1000);
    if(duration > 5){
      setTimeEntries(e=>[...e,{id:uid(),taskId:activeTimer.taskId,duration,date:todayStr(),startedAt:activeTimer.startedAt}]);
      showNotif("⏱ Time logged!",`${Math.floor(duration/60)}m ${duration%60}s recorded`);
    }
    setActiveTimer(null);
    setTimerTick(0);
  };
  const getTaskTime = (taskId)=>timeEntries.filter(e=>e.taskId===taskId).reduce((a,e)=>a+e.duration,0);
  const fmtTime = (s)=>s<60?`${s}s`:s<3600?`${Math.floor(s/60)}m ${s%60}s`:`${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`;

  // == Task Templates ==
  const DEFAULT_TEMPLATES = [
    {id:"weekly_review", icon:"📋", name:"Weekly Review", tasks:["Review goals progress","Clear email inbox","Update task list","Plan next week's priorities","Reflect on wins & lessons"]},
    {id:"project_kick",  icon:"🚀", name:"Project Kickoff", tasks:["Define project scope","Set milestones & deadlines","Assign team roles","Create initial task breakdown","Schedule kickoff meeting"]},
    {id:"travel_prep",   icon:"✈️", name:"Travel Prep",     tasks:["Book flights & hotels","Pack luggage checklist","Sort travel documents","Notify bank of travel","Download offline maps"]},
    {id:"deep_work",     icon:"🧠", name:"Deep Work Session", tasks:["Clear desk & distractions","Set 90-min focus timer","Work on top priority task","No phone or social media","Review progress after session"]},
  ];
  const [templates, setTemplates] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_templates")||JSON.stringify(DEFAULT_TEMPLATES));}catch(e){return DEFAULT_TEMPLATES;}});
  const [showTemplates, setShowTemplates] = useState(false);
  function applyTemplate(tpl) {
    const newTasks = tpl.tasks.map(title=>({id:uid(),title,notes:"",priority:"medium",categoryId:"work",due:"",photo:null,tags:[],subtasks:[],starred:false,recurring:"never",reminder:false,reminderTime:"09:00",reminderDate:"",alarmTone:"classic",profileId:activeProfile,done:false,createdAt:Date.now()}));
    setTasks(ts=>[...newTasks,...ts]);
    showNotif(`🚀 ${tpl.name}`,`${tpl.tasks.length} tasks added!`);
    play("add"); awardXP(15,"Template applied");
    setShowTemplates(false); setTab("tasks"); setShowDone(false); setShowStarred(false);
  };

  // == Focus Mode ==
  const [focusMode, setFocusMode] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState(null);
  const [focusNotes, setFocusNotes] = useState("");

  // == Task Templates ==
  const TASK_TEMPLATES = [
    {id:"weekly_review",icon:"📋",name:"Weekly Review",desc:"End-of-week reflection and planning",color:"#7c6dfa",tasks:["Review what I accomplished this week","Clear inbox to zero","Update project statuses","Plan top 3 priorities for next week","Review and adjust goals","Schedule important meetings"]},
    {id:"project_kick",icon:"🚀",name:"Project Kickoff",desc:"Everything you need to start strong",color:"#ff9f43",tasks:["Define project goals and success metrics","Identify key stakeholders","Create project timeline","Set up project folder/workspace","Schedule kickoff meeting","Define communication channels","Identify risks and mitigation plan"]},
    {id:"morning_routine",icon:"🌅",name:"Morning Routine",desc:"Start your day right",color:"#ffd93d",tasks:["Drink a full glass of water","5-minute meditation or breathing","Review today's top 3 tasks","Exercise for 20 minutes","Healthy breakfast","Quick journal entry"]},
    {id:"travel_prep",icon:"✈️",name:"Travel Prep",desc:"Never forget anything again",color:"#48dbfb",tasks:["Book flights and accommodation","Pack clothes and essentials","Download offline maps","Notify bank of travel","Charge all devices","Print/save booking confirmations","Set up out-of-office replies"]},
    {id:"deep_work",icon:"🧠",name:"Deep Work Session",desc:"Eliminate distractions and focus",color:"#6bcb77",tasks:["Clear your desk completely","Put phone on Do Not Disturb","Close all browser tabs except task","Set a 90-minute focus timer","Prepare water and snacks","Write down today's single focus goal","Review session notes afterward"]},
    {id:"health_week",icon:"💪",name:"Health Week",desc:"A week of wellness habits",color:"#ff6b9d",tasks:["Exercise Monday Wednesday Friday","Meal prep on Sunday","Sleep by 10:30pm every night","Drink 8 glasses of water daily","No social media after 9pm","30-minute walk every lunch","Log mood and energy daily"]},
  ];
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  // First launch detection
  useEffect(()=>{
    const launched = localStorage.getItem("tf_launched");
    if(!launched){
      localStorage.setItem("tf_launched","1");
      setTimeout(()=>setShowTemplateModal(true), 1200);
    }
  },[]);

  // == Daily Digest ==
  // == 🤖 AI NATURAL LANGUAGE TASK EDITOR ==
  const [showAiNL, setShowAiNL] = useState(false);
  const [aiNLInput, setAiNLInput] = useState("");
  const [aiNLResult, setAiNLResult] = useState(null);
  const [aiNLLoading, setAiNLLoading] = useState(false);

  // Offline natural language parser -- no API needed
  function parseNaturalLanguageCommand(text) {
    const lower = text.toLowerCase().trim();
    const today = todayStr();
    const tomorrow = (()=>{ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })();
    const nextWeek = (()=>{ const d=new Date(); d.setDate(d.getDate()+7); return d.toISOString().slice(0,10); })();

    // Detect action type
    let action = null; let affected = []; let preview = "";

    // "move X tasks to tomorrow/today/next week"
    if (/(move|reschedule|push|shift)/.test(lower)) {
      const dateTo = /tomorrow/.test(lower)?tomorrow:/next week/.test(lower)?nextWeek:/today/.test(lower)?today:null;
      if (dateTo) {
        const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
        const priorityMatch = lower.match(/\b(high|medium|low)\b/);
        const searchTerms = lower.replace(/(move|reschedule|push|shift|tomorrow|today|next week|all|my|tasks?|to)/g,'').trim().split(/\s+/).filter(w=>w.length>2);
        affected = profileTasks.filter(t=>{
          if(t.done) return false;
          if(catMatch && t.categoryId!==catMatch[1]) return false;
          if(priorityMatch && t.priority!==priorityMatch[1]) return false;
          if(/all/.test(lower)) return true;
          return searchTerms.some(term=>t.title.toLowerCase().includes(term));
        }).slice(0,20);
        if(affected.length>0){
          action = {type:'reschedule', dateTo};
          preview = `Move ${affected.length} task${affected.length>1?'s':''} to ${dateTo===tomorrow?'tomorrow':dateTo===today?'today':'next week'}`;
        }
      }
    }

    // "complete/done/finish all X tasks"
    else if (/(complete|done|finish|mark.*done|check off)/.test(lower)) {
      const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
      const priorityMatch = lower.match(/\b(high|medium|low)\b/);
      affected = profileTasks.filter(t=>{
        if(t.done) return false;
        if(catMatch && t.categoryId!==catMatch[1]) return false;
        if(priorityMatch && t.priority!==priorityMatch[1]) return false;
        if(/all/.test(lower)) return true;
        const words = lower.replace(/(complete|done|finish|mark|all|my|tasks?)/g,'').trim().split(/\s+/).filter(w=>w.length>2);
        return words.some(w=>t.title.toLowerCase().includes(w));
      }).slice(0,20);
      if(affected.length>0){ action={type:'complete'}; preview=`Complete ${affected.length} task${affected.length>1?'s':''}`; }
    }

    // "star/favourite all X tasks"
    else if (/(star|favourite|favorite|prioritize)/.test(lower)) {
      affected = profileTasks.filter(t=>!t.done&&!t.starred);
      if(/high|urgent/.test(lower)) affected = affected.filter(t=>t.priority==='high');
      affected = affected.slice(0,10);
      if(affected.length>0){ action={type:'star'}; preview=`Star ${affected.length} task${affected.length>1?'s':''}`; }
    }

    // "set X tasks to high/medium/low priority"
    else if (/(set|change|make).*priority|priority.*(set|change|make)/.test(lower)) {
      const priority = /high/.test(lower)?'high':/low/.test(lower)?'low':'medium';
      const catMatch = lower.match(/\b(work|personal|health|learning|finance)\b/);
      affected = profileTasks.filter(t=>!t.done&&(catMatch?t.categoryId===catMatch[1]:true)&&t.priority!==priority).slice(0,20);
      if(affected.length>0){ action={type:'priority',priority}; preview=`Set ${affected.length} task${affected.length>1?'s':''} to ${priority} priority`; }
    }

    // "delete/remove completed tasks"
    else if (/(delete|remove|clear).*done|clear.*completed/.test(lower)) {
      affected = profileTasks.filter(t=>t.done);
      if(affected.length>0){ action={type:'delete'}; preview=`Delete ${affected.length} completed task${affected.length>1?'s':''}`; }
    }

    // If action found but no tasks matched, give helpful message
    if(action && affected.length===0) return {error:`No matching tasks found! Make sure you have tasks that fit that description. Try being more specific or say "all" to target everything.`};
    if(!action) {
      // Try fuzzy: any word match against task titles
      const words = lower.split(/\s+/).filter(w=>w.length>3);
      const fuzzy = profileTasks.filter(t=>!t.done && words.some(w=>t.title.toLowerCase().includes(w)));
      if(fuzzy.length>0 && /tomorrow|today|next week|monday|friday/.test(lower)){
        const dateTo = /tomorrow/.test(lower)?tomorrow:/next week/.test(lower)?nextWeek:today;
        return {action:{type:'reschedule',dateTo}, affected:fuzzy, preview:`Move ${fuzzy.length} matching task${fuzzy.length>1?'s':''} to ${/tomorrow/.test(lower)?'tomorrow':/next week/.test(lower)?'next week':'today'}`};
      }
      return {error:`Hmm, I didn't catch that. Try:\n• "Move my work tasks to tomorrow"\n• "Complete all high priority tasks"\n• "Set learning tasks to high priority"\n• "Delete completed tasks"\n• "Star all overdue tasks"`};
    }
    return {action, affected, preview};
  };

  function executeNLCommand() {
    if(!aiNLResult||!aiNLResult.action) return;
    const {action, affected} = aiNLResult;
    if(action.type==='reschedule') setTasks(ts=>ts.map(t=>affected.find(a=>a.id===t.id)?{...t,due:action.dateTo}:t));
    else if(action.type==='complete') { affected.forEach(t=>{ if(!t.done){ play("complete"); awardXP(t.priority==='high'?30:t.priority==='medium'?20:10,"Bulk complete"); } }); setTasks(ts=>ts.map(t=>affected.find(a=>a.id===t.id)?{...t,done:true}:t)); }
    else if(action.type==='star') setTasks(ts=>ts.map(t=>affected.find(a=>a.id===t.id)?{...t,starred:true}:t));
    else if(action.type==='priority') setTasks(ts=>ts.map(t=>affected.find(a=>a.id===t.id)?{...t,priority:action.priority}:t));
    else if(action.type==='delete') setTasks(ts=>ts.filter(t=>!affected.find(a=>a.id===t.id)));
    showNotif("🤖 Done!",aiNLResult.preview);
    play("add"); awardXP(10,"AI command executed");
    setAiNLInput(""); setAiNLResult(null); setShowAiNL(false);
    setTab("tasks"); setShowDone(false); setShowStarred(false);
  };

  // == 🧠 SMART DEADLINE SUGGESTIONS (offline AI) ==
  function getDeadlineSuggestions() {
    const suggestions = [];
    // Analyse which categories typically get completed late
    const completedWithDue = tasks.filter(t=>t.done&&t.due&&t.createdAt);
    const catLateness = {};
    completedWithDue.forEach(t=>{
      if(!catLateness[t.categoryId]) catLateness[t.categoryId]={late:0,total:0};
      catLateness[t.categoryId].total++;
      if(new Date(t.createdAt)>new Date(t.due)) catLateness[t.categoryId].late++;
    });
    Object.entries(catLateness).forEach(([catId,data])=>{
      if(data.total>=3 && data.late/data.total>=0.5){
        const cat = categories.find(c=>c.id===catId);
        if(!cat) return;
        const lateRate = Math.round((data.late/data.total)*100);
        // Find active tasks in this category with due dates too soon
        const activeCatTasks = profileTasks.filter(t=>!t.done&&t.categoryId===catId&&t.due);
        activeCatTasks.forEach(task=>{
          const daysLeft = Math.ceil((new Date(task.due)-new Date())/(1000*60*60*24));
          if(daysLeft<=3&&daysLeft>=0){
            suggestions.push({
              taskId:task.id, taskTitle:task.title, catName:cat.name, catIcon:cat.icon,
              lateRate, daysLeft,
              suggestion:`You complete ${cat.icon} ${cat.name} tasks late ${lateRate}% of the time. Consider adding 2-3 extra days.`,
              newDue:(()=>{ const d=new Date(task.due); d.setDate(d.getDate()+3); return d.toISOString().slice(0,10); })()
            });
          }
        });
      }
    });
    return suggestions.slice(0,3);
  };

  const [showThemeCreator, setShowThemeCreator] = useState(false);
  const [customHue, setCustomHue] = useState(260);
  function hueToHex(h) {
    const f=(n,k=(n+h/30)%12)=>0.5-0.5*Math.max(Math.min(k-3,9-k,1),-1);
    const r=Math.round(f(0)*255),g=Math.round(f(8)*255),b=Math.round(f(4)*255);
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  };

  // == Universal Search ==
  const [globalSearch, setGlobalSearch] = useState("");
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);

  // == Daily Digest ==
  const [showDigest, setShowDigest] = useState(false);


  // == Gamification State ==
  const [xp, setXp] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_xp")||"0");}catch(e){return 0;}});
  const [earnedBadges, setEarnedBadges] = useState(()=>{try{return JSON.parse(localStorage.getItem("tf_badges")||"[]");}catch(e){return [];}});
  const [xpAnim, setXpAnim] = useState(null); // {amount, id}
  const [newBadgeAnim, setNewBadgeAnim] = useState(null);
  const [showGamificationModal, setShowGamificationModal] = useState(false);
  const [gamStats, setGamStats] = useState({totalDone:0,streak:0,highDone:0,earlyBird:false,nightOwl:false,goalsCompleted:0,habitCompletions:0,notesCreated:0,longNoteCreated:false,sharedTasks:0,overdueCleared:0,perfectTasks:0,plannerUses:0,focusSessions:0,comebackDays:0});
  const [libiMemory, setLibiMemory] = useState(()=>{
    try{const s=localStorage.getItem("tf_libi_memory");return s?JSON.parse(s):{facts:[],name:"",wakeTime:"",occupation:"",timezone:""};}
    catch(e){return {facts:[],name:"",wakeTime:"",occupation:"",timezone:""};}
  });
  useEffect(()=>{try{localStorage.setItem("tf_libi_memory",JSON.stringify(libiMemory));}catch{}}, [libiMemory]);


  // == AI Suggestions State ==
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [showSuggestionsPanel, setShowSuggestionsPanel] = useState(false);
  const [dismissedSuggestions, setDismissedSuggestions] = useState([]);

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

  // == Data ==
  const [tasks, setTasks] = useState(()=>{try{const s=localStorage.getItem("tf_tasks");return s?JSON.parse(s):INIT_TASKS;}catch(e){return INIT_TASKS;}});
  const [categories, setCategories] = useState(()=>{try{const s=localStorage.getItem("tf_cats");return s?JSON.parse(s):DEFAULT_CATEGORIES;}catch(e){return DEFAULT_CATEGORIES;}});
  const [profiles, setProfiles] = useState(()=>{try{const s=localStorage.getItem("tf_profiles");return s?JSON.parse(s):DEFAULT_PROFILES;}catch(e){return DEFAULT_PROFILES;}});
  const [activeProfile, setActiveProfile] = useState(()=>{try{const s=localStorage.getItem("tf_profiles");const ps=s?JSON.parse(s):DEFAULT_PROFILES;return ps[0]?.id||"default";}catch(e){return "default";}});

  // == Navigation ==
  const [tab, setTab] = useState("tasks");
  const [viewMode, setViewMode] = useState("list");
  const [sort, setSort] = useState("created");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showStarred, setShowStarred] = useState(false);

  // == Modals ==
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editTaskObj, setEditTaskObj] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState(null);
  const detailTask = tasks.find(t=>t.id===detailTaskId)||null;
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
  const [streakShield, setStreakShield] = useState(()=>{
    try{return JSON.parse(localStorage.getItem("tf_streak_shield")||"0");}catch{return 0;}
  });
  const [showStreakModal, setShowStreakModal] = useState(false);

  useEffect(()=>{
    function checkStreak() {
      const streak = gamStats.streak||0;
      if(streak < 1) return;
      const today = new Date();
      const h = today.getHours();
      const todayKey = today.toISOString().slice(0,10);
      const doneToday = tasks.filter(t=>t.done&&t.createdAt&&new Date(t.createdAt).toISOString().slice(0,10)===todayKey).length;

      // Morning motivation (8-9am)
      if(h>=8&&h<9){
        const key = "streak_morning_"+todayKey;
        if(!sessionStorage.getItem(key)){
          sessionStorage.setItem(key,"1");
          const tasksToday = tasks.filter(t=>!t.done&&t.profileId===activeProfile).length;
          showNotif(`🔥 ${streak} day streak!`,`Good morning! You have ${tasksToday} tasks today. Keep the streak alive!`);
        }
      }
      // Evening warning (7-9pm)
      if(h>=19&&h<21){
        const key = "streak_eve_"+todayKey;
        if(doneToday===0&&!sessionStorage.getItem(key)){
          sessionStorage.setItem(key,"1");
          showNotif(`⚠️ Streak in danger!`,`Your ${streak}-day streak ends at midnight! Complete 1 task now 🔥`);
          haptic("heavy");
          setShowStreakModal(true);
        }
      }
      // Late night (10pm) final warning
      if(h>=22&&h<23){
        const key = "streak_late_"+todayKey;
        if(doneToday===0&&!sessionStorage.getItem(key)){
          sessionStorage.setItem(key,"1");
          showNotif(`🚨 Last chance!`,`2 hours left to save your ${streak}-day streak!`);
          haptic("heavy");
        }
      }
    }
    const iv = setInterval(checkStreak, 30*60*1000); // every 30 min
    checkStreak();
    return ()=>clearInterval(iv);
  },[tasks, gamStats.streak, activeProfile]);


  // == Streak Protection: warn before streak breaks ==
  useEffect(()=>{
    const checkStreak = () => {
      const streak = gamStats?.streak || 0;
      if(streak < 2) return;
      const now = new Date();
      const h = now.getHours();
      if(h >= 18 && h < 21){
        const todayKey = todayStr();
        const warned = sessionStorage.getItem("streak_warned_"+todayKey);
        const doneToday = tasks.filter(t=>t.done && t.createdAt && new Date(t.createdAt).toISOString().slice(0,10)===todayKey).length;
        if(doneToday===0 && !warned){
          sessionStorage.setItem("streak_warned_"+todayKey,"1");
          showNotif(`🔥 Streak at risk!`,`Complete a task before midnight to keep your ${streak}-day streak alive!`);
          haptic("heavy");
        }
      }
    };
    const iv = setInterval(checkStreak, 3600000);
    checkStreak();
    return ()=>clearInterval(iv);
  },[tasks, gamStats]);

  // == Alarm / Reminder System ==
  const [alarmTask, setAlarmTask] = useState(null);
  const [alarmSnoozed, setAlarmSnoozed] = useState(false);
  const firedAlarmsRef = useRef(new Set());

  // Check for alarms every minute
  useEffect(()=>{
    function check() {
      const now = new Date();
      const todayDate = now.toISOString().slice(0,10);
      const hh = String(now.getHours()).padStart(2,"0");
      const mm = String(now.getMinutes()).padStart(2,"0");
      const timeNow = `${hh}:${mm}`;
      tasks.forEach(task=>{
        if(!task.reminder || task.done) return;
        const remDate = task.reminderDate || task.due || todayDate;
        const remTime = task.reminderTime || "09:00";
        const key = `${task.id}-${remDate}-${remTime}`;
        if(remDate===todayDate && remTime===timeNow && !firedAlarmsRef.current.has(key)){
          firedAlarmsRef.current.add(key);
          setAlarmTask(task);
          setAlarmSnoozed(false);
          try { playAlarmTone(task.alarmTone||"classic"); } catch(e){}
          // Send browser/OS notification (works when tab is in background)
          try {
            if("Notification" in window && Notification.permission==="granted") {
              new Notification("⏰ Taskflow Reminder", {
                body: task.title + (task.notes ? "\n"+task.notes : ""),
                icon: "/favicon.ico",
                badge: "/favicon.ico",
                tag: "taskflow-"+task.id,
                renotify: true,
                requireInteraction: true,
              });
            }
          } catch(e){}
        }
      });
    };
    check();
    const iv = setInterval(check, 10000);
    return ()=>clearInterval(iv);
  },[tasks]);

  function haptic(type="light") {
    try{
      if(!navigator.vibrate) return;
      if(type==="light")        navigator.vibrate(12);
      else if(type==="medium")  navigator.vibrate(35);
      else if(type==="heavy")   navigator.vibrate([60,30,60]);
      else if(type==="success") navigator.vibrate([20,10,20,10,50]);
      else if(type==="error")   navigator.vibrate([80,40,80]);
    }catch(e){}
  }
  function handleDismiss() { stopAlarmSound(); setAlarmTask(null); setAlarmSnoozed(false); try{haptic('medium');}catch(e){} };
  function handleSnooze() {
    stopAlarmSound();
    const snoozeTask = alarmTask;
    setAlarmTask(null);
    setTimeout(()=>{ setAlarmTask(snoozeTask); setAlarmSnoozed(true); try{playAlarmTone(snoozeTask.alarmTone||"classic");}catch(e){} }, 5*60*1000);
  };
  function toggle(id,e) {
    haptic(tasks.find(t=>t.id===id)?.done?'light':'success');
    if(e)e.stopPropagation();
    const task=tasks.find(t=>t.id===id);
    if(!task)return;
    const nd=!task.done;
    if(nd){
      play("complete");
      showNotif("🎉 Task Completed!",task.title);
      if(task.priority==="high") setTimeout(fireConfetti,100);
      const xpGain = task.priority==="high"?30:task.priority==="medium"?20:10;
      awardXP(xpGain, "Task completed");
      // == Auto-recreate recurring tasks ==
      if(task.recurring && task.recurring!=="never"){
        const getNext = (due, freq) => {
          const d = new Date(due||new Date());
          if(freq==="daily")   d.setDate(d.getDate()+1);
          else if(freq==="weekly")  d.setDate(d.getDate()+7);
          else if(freq==="monthly") d.setMonth(d.getMonth()+1);
          else if(freq==="3x")  d.setDate(d.getDate()+2);
          return d.toISOString().slice(0,10);
        };
        const nextDue = getNext(task.due, task.recurring);
        const nextTask = {...task, id:uid(), done:false, createdAt:Date.now(),
          due:nextDue, reminder:false, subtasks:task.subtasks.map(s=>({...s,done:false}))};
        setTimeout(()=>{
          setTasks(ts=>[nextTask,...ts]);
          showNotif("🔄 Recurring task recreated", `"${task.title}" scheduled for ${nextDue}`);
        }, 800);
      }
    }
    setTasks(ts=>ts.map(t=>t.id===id?{...t,done:nd,completedAt:nd?Date.now():null}:t));
  };

  function handleMarkDone() { if(alarmTask){ try{toggle(alarmTask.id);}catch(e){} } stopAlarmSound(); setAlarmTask(null); setAlarmSnoozed(false); };


  // == Task form ==
  const blankForm = {title:"",notes:"",priority:"medium",categoryId:"work",due:"",photo:null,tags:[],subtasks:[],starred:false,recurring:"never",reminder:false,reminderTime:"09:00",reminderDate:"",alarmTone:"classic",profileId:activeProfile,timeEstimate:0,dependsOn:[]};
  const [form, setForm] = useState(blankForm);
  const [tagInput, setTagInput] = useState(""); const [subInput, setSubInput] = useState("");

  // == Cat form ==
  const [catForm, setCatForm] = useState({name:"",icon:"🎯",color:"#7c6dfa"});
  const [editCatId, setEditCatId] = useState(null);

  // == Profile form ==
  const [profForm, setProfForm] = useState({name:"",icon:"👤",color:"#7c6dfa"});
  const [editProfileId, setEditProfileId] = useState(null);
  const [editProfileName, setEditProfileName] = useState("");
  const [showAvatarPicker, setShowAvatarPicker] = useState(null); // profile id

  const fileRef = useRef(null);
  const t = LANGS[langKey]?.t || LANGS.en.t;
  const accent = ACCENTS[accentIdx];
  // == CSS injection (after all theme states are ready) ==
  useEffect(()=>{
    let el = document.getElementById("tf-css");
    if(!el){el=document.createElement("style");el.id="tf-css";document.head.appendChild(el);}
    el.textContent = makeCSS(dark, accent.v, accent.g, langKey==="ar");
  },[dark, accentIdx, langKey]);

  // == Smart scroll: logo hides, search expands -- topbar always visible ==
  useEffect(()=>{
    let lastY = 0;
    let ticking = false;

    function onScroll(e) {
      const el = e.target;
      if(!ticking) {
        requestAnimationFrame(()=>{
          const y = el.scrollTop;
          const dy = y - lastY;
          const topbar = document.querySelector('.topbar');
          const botnav = document.querySelector('.bot-nav');

          if(dy > 6 && y > 50) {
            // Scrolling DOWN -- hide logo, search expands to fill space
            topbar?.classList.add('logo-hidden');
            botnav?.classList.add('hide-bot');
          } else if(dy < -4) {
            // Scrolling UP -- logo slides back in, search shrinks
            topbar?.classList.remove('logo-hidden');
            botnav?.classList.remove('hide-bot');
          }

          // At very top -- always show logo
          if(y < 10) {
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
    contents.forEach(c => c.addEventListener('scroll', onScroll, {passive:true}));
    return () => contents.forEach(c => c.removeEventListener('scroll', onScroll));
  }, [tab]);

  // == Notification helper ==
  function showNotif(title, body) {
    if (!notifsOn) return;
    setNotif({title,body});
    setTimeout(()=>setNotif(null), 3500);
  }

  // == Check due tasks on load ==
  useEffect(()=>{
    if (notifsOn) {
      const due = tasks.filter(t=>!t.done&&t.reminder&&t.due===todayStr());
      if (due.length > 0) setTimeout(()=>showNotif("📅 Tasks Due Today", `${due[0].title}${due.length>1?` +${due.length-1} more`:""}`)  ,1500);
    }
  },[]);

  // == Recurring task reset (runs on load & daily) ==
  useEffect(()=>{
    const today = todayStr();
    const lastReset = (() => { try { return localStorage.getItem("tf_last_reset")||""; } catch { return ""; } })();
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
          const diff = Math.floor((now - due) / (1000*60*60*24));
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
        if (task.recurring === "daily")   d.setDate(d.getDate() + 1);
        else if (task.recurring === "weekly")  d.setDate(d.getDate() + 7);
        else if (task.recurring === "monthly") d.setMonth(d.getMonth() + 1);
        nextDue = d.toISOString().split("T")[0];
      } else {
        nextDue = today;
      }
      return { ...task, done: false, due: nextDue };
    }));
    try { localStorage.setItem("tf_last_reset", today); } catch {}
  }, []);

  const [confettiBurst, setConfettiBurst] = useState(false);

  function fireConfetti() { setConfettiBurst(true); haptic('success'); setTimeout(()=>setConfettiBurst(false),2200); };
  const [pageKey, setPageKey] = useState(0);
  function switchTab(t) { setTab(t); setPageKey(k=>k+1); };

  function play(s) { if(soundOn) playSound(s); };

  // == XP & Badge Engine ==
  function awardXP(amount, reason) {
    setXp(prev => {
      const next = prev + amount;
      try { localStorage.setItem("tf_xp", JSON.stringify(next)); } catch {}
      return next;
    });
    setXpAnim({amount, reason, id: Date.now()});
    setTimeout(() => setXpAnim(null), 2000);
  }

  function checkBadges(stats) {
    BADGES.forEach(badge => {
      if (!earnedBadges.includes(badge.id) && badge.check(stats)) {
        setEarnedBadges(prev => {
          const next = [...prev, badge.id];
          try { localStorage.setItem("tf_badges", JSON.stringify(next)); } catch {}
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
      const hadDone = done.some(t => (t.createdAt||0) > 0 && new Date(t.createdAt).toISOString().split("T")[0] === ds);
      if (hadDone) { streak++; d.setDate(d.getDate()-1); } else break;
    }
    const stats = {
      totalDone: done.length,
      streak,
      highDone: done.filter(t=>t.priority==="high").length,
      earlyBird: done.some(t=>{ const h=new Date(t.createdAt||0).getHours(); return h<9; }),
      nightOwl: done.some(t=>{ const h=new Date(t.createdAt||0).getHours(); return h>=22; }),
      goalsCompleted: 0,
      habitCompletions: 0,
      notesCreated: notes.length,
      longNoteCreated: notes.some(n=>(n.body||"").trim().split(/\s+/).filter(Boolean).length>=100),
      sharedTasks: 0,
      overdueCleared: done.filter(t=>t.due && new Date(t.due)<new Date(t.createdAt||0)).length,
      perfectTasks: done.filter(t=>t.subtasks?.length>0 && t.subtasks.every(s=>s.done)).length,
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


  const profileTasks = useMemo(()=>tasks.filter(t=>t.profileId===activeProfile),[tasks,activeProfile]);

  function openAdd() { setForm({...blankForm,profileId:activeProfile}); setTagInput(""); setSubInput(""); setEditTaskObj(null); setShowTaskModal(true); play("tap"); };
  function openEdit(task,e) { if(e)e.stopPropagation(); setForm({title:task.title,notes:task.notes,priority:task.priority,categoryId:task.categoryId,due:task.due,photo:task.photo,tags:[...task.tags],subtasks:task.subtasks.map(s=>({...s})),starred:task.starred,recurring:task.recurring||"never",reminder:task.reminder||false,reminderTime:task.reminderTime||"09:00",reminderDate:task.reminderDate||"",alarmTone:task.alarmTone||"classic",profileId:task.profileId}); setTagInput(""); setSubInput(""); setEditTaskObj(task); setShowTaskModal(true); play("tap"); };
  function saveTask() {
    if(!form.title.trim()) return;
    if(editTaskObj) { setTasks(ts=>ts.map(t=>t.id===editTaskObj.id?{...t,...form}:t)); showNotif("✅ Task Updated",form.title); }
    else { setTasks(ts=>[{id:uid(),...form,done:false,createdAt:Date.now()},...ts]); showNotif("➕ Task Added",form.title); play("add"); }
    setShowTaskModal(false);
  };
  function del(id,e) {
    if(e) e.stopPropagation();
    const task = tasks.find(t=>t.id===id);
    if(!task) return;
    setTasks(ts=>ts.filter(t=>t.id!==id));
    setDeletedTask(task); setShowUndo(true);
    play("delete"); haptic("error");
    if(undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(()=>{ setShowUndo(false); setDeletedTask(null); }, 4000);
    setUndoTimer(timer);
  }
  function undoDelete() {
    if(!deletedTask) return;
    setTasks(ts=>[deletedTask,...ts]);
    setShowUndo(false); setDeletedTask(null);
    if(undoTimer) clearTimeout(undoTimer);
    play("add"); haptic("success");
    showNotif("↩️ Restored!",deletedTask.title);
  }
  function star(id,e) { if(e)e.stopPropagation(); play("tap"); setTasks(ts=>ts.map(t=>t.id===id?{...t,starred:!t.starred}:t)); };
  const toggleSub = (tid,sid) => setTasks(ts=>ts.map(t=>t.id===tid?{...t,subtasks:t.subtasks.map(s=>s.id===sid?{...s,done:!s.done}:s)}:t));

  function handlePhoto(e) { const f=e.target.files?.[0]; if(!f)return; const r=new FileReader(); r.onload=(ev)=>setForm(fm=>({...fm,photo:ev.target.result})); r.readAsDataURL(f); };
  function addTag() { const v=tagInput.trim().replace(/^#/,""); if(!v||form.tags.includes(v))return; setForm(f=>({...f,tags:[...f.tags,v]})); setTagInput(""); };
  function addSub() { const v=subInput.trim(); if(!v)return; setForm(f=>({...f,subtasks:[...f.subtasks,{id:uid(),text:v,done:false}]})); setSubInput(""); };

  // == Categories ==
  const getCat = (id) => categories.find(c=>c.id===id)||categories[categories.length-1];
  function saveCat() { if(!catForm.name.trim())return; setCategories(cs=>[...cs,{id:uid(),...catForm}]); setCatForm({name:"",icon:"🎯",color:"#7c6dfa"}); setShowCatModal(false); play("add"); };

  // == Profiles ==
  function saveProfile() { if(!profForm.name.trim())return; const nid=uid(); setProfiles(ps=>[...ps,{id:nid,...profForm}]); setActiveProfile(nid); setProfForm({name:"",icon:"👤",color:"#7c6dfa"}); setShowProfileModal(false); play("add"); };

  // == PIN ==
  function handlePinKey(k) {
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

  // == Export ==
  const exportData = () => JSON.stringify({tasks:profileTasks,categories,profiles,exportDate:new Date().toISOString()},null,2);
  function shareData() { if(navigator.share){navigator.share({title:"Taskflow Export",text:exportData()});}else{navigator.clipboard?.writeText(exportData()); showNotif("📋 Copied!","Task data copied to clipboard");} };

  // == Computed ==
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

  // == Task Card ==
  function TaskCard({task}) {
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
      if(swipeRef.current) {
        const dy = (swipeRef._startY||0) - e.touches[0].clientY;
        swipeRef._endY = e.touches[0].clientY;
        if(dy > 20 && Math.abs(dx) < 40) {
          swipeRef.current.style.transform = `translateY(${Math.min(-dy,0)}px)`;
          swipeRef.current.style.background = "rgba(72,219,251,0.15)";
        } else {
          swipeRef.current.style.transform = `translateX(${Math.max(-100,Math.min(100,dx))}px)`;
          swipeRef.current.style.transition = "none";
          if(dx > 40) swipeRef.current.style.background = "rgba(107,203,119,0.18)";
          else if(dx < -40) swipeRef.current.style.background = "rgba(255,107,107,0.18)";
          else swipeRef.current.style.background = "";
        }
      }
    };
    function handleTouchEnd() {
      const dx = swipeDelta.current;
      if(swipeRef.current) {
        swipeRef.current.style.transition = "transform .3s cubic-bezier(.4,0,.2,1),background .3s ease";
        swipeRef.current.style.transform = "";
        swipeRef.current.style.background = "";
      }
      const dy = (swipeRef._startY||0) - (swipeRef._endY||0);
      if(dy > 60 && Math.abs(dx) < 40) {
        // Swipe UP = reschedule to tomorrow
        const tmr = new Date(); tmr.setDate(tmr.getDate()+1);
        const newDue = tmr.toISOString().slice(0,10);
        setTasks(ts=>ts.map(t=>t.id===task.id?{...t,due:newDue}:t));
        showNotif("📅 Rescheduled","Moved to tomorrow");
        haptic("medium");
      } else if(dx > 70){ toggle(task.id); haptic("success"); }
      else if(dx < -70){ del(task.id); haptic("error"); }
      swipeDelta.current = 0;
    };
    const cat=getCat(task.categoryId);
    const ds=task.subtasks.filter(s=>s.done).length;
    const sp=task.subtasks.length?(ds/task.subtasks.length)*100:0;
    const trackedTime = getTaskTime(task.id);
    const isTimerRunning = activeTimer?.taskId===task.id;
    return (
      <>
      {bulkMode&&(
        <div onClick={(e)=>{e.stopPropagation();toggleBulkSelect(task.id);}} style={{position:"absolute",top:8,right:8,zIndex:10,width:22,height:22,borderRadius:7,border:`2px solid ${bulkSelected.has(task.id)?accent.v:"var(--b2)"}`,background:bulkSelected.has(task.id)?accent.v:"var(--s2)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",transition:"all .15s"}}>
          {bulkSelected.has(task.id)&&<span style={{color:"#fff",fontSize:11,fontWeight:800}}>✓</span>}
        </div>
      )}
      <div className="task-swipe-wrap" style={{position:"relative"}} onClick={bulkMode?(e)=>{e.stopPropagation();toggleBulkSelect(task.id);}:undefined}>
        <div className="task-swipe-bg-r"><span style={{color:"#fff",fontWeight:800,fontSize:13}}>✅ Complete</span></div>
        <div className="task-swipe-bg-l"><span style={{color:"#fff",fontWeight:800,fontSize:13}}>🗑 Delete</span></div>
        <div ref={swipeRef} className="task-swipe-inner" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
        <div className={`task p${task.priority[0]} ${task.done?"done-t":""} ${isOverdue(task.due,task.done)?"ov-t":""}`} style={{margin:0,borderRadius:18}}
        onClick={()=>{setDetailTaskId(task.id);setShowDetail(true);}}
        onDoubleClick={()=>{setFocusTaskId(task.id);setShowFocusMode(true);}}>
        <div className={`chk ${task.done?"on":""}`} onClick={e=>toggle(task.id,e)}>{task.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}</div>
        <div className="t-body">
          <div className="t-top">
            <div className="t-title" style={{display:"flex",alignItems:"center",gap:5}}>
                {(()=>{const ageD=task.createdAt?Math.floor((Date.now()-task.createdAt)/(1000*60*60*24)):0;return ageD>=14?<span title={`${ageD} days old — needs attention!`} style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:"rgba(255,107,107,.15)",color:"var(--red)",fontWeight:800,flexShrink:0,border:"1px solid rgba(255,107,107,.25)"}}>⏳{ageD}d</span>:ageD>=7?<span title={`${ageD} days old`} style={{fontSize:9,padding:"1px 5px",borderRadius:8,background:"rgba(255,159,67,.12)",color:"#ff9f43",fontWeight:800,flexShrink:0}}>⏳{ageD}d</span>:null;})()}
                {task.title}
              </div>
            <span className={`t-star ${task.starred?"lit":""}`} onClick={e=>star(task.id,e)}>⭐</span>
          </div>
          {task.photo&&<img src={task.photo} className="t-photo" alt=""/>}
          {task.notes&&<div className="t-note">{task.notes}</div>}
          <div className="t-meta">
            <span className="tchip" style={{color:PRIORITIES[task.priority].color,background:PRIORITIES[task.priority].bg,border:`1px solid ${PRIORITIES[task.priority].color}28`}}>{PRIORITIES[task.priority].icon}</span>
            <span className="tchip" style={{background:cat.color+"22",color:cat.color,border:`1px solid ${cat.color}33`}}>{cat.icon} {cat.name}</span>
            {task.tags.slice(0,2).map(tg=><span key={tg} className="tchip" style={{background:"var(--s2)",color:"var(--t2)",border:"1px solid var(--b1)"}}>#{tg}</span>)}
            {task.due&&<span className={`t-date ${isOverdue(task.due,task.done)?"ov":""}`}>{isOverdue(task.due,task.done)?"⚠ ":"◷ "}{fmtDate(task.due)}</span>}
            {task.timeEstimate>0&&<span className="est-badge">⏱ {task.timeEstimate<60?task.timeEstimate+"m":(task.timeEstimate/60).toFixed(1)+"h"}</span>}
            {task.dependsOn?.length>0&&tasks.find(t2=>task.dependsOn.includes(t2.id)&&!t2.done)&&<span className="dep-badge">🔒 Blocked</span>}
            {task.recurring&&task.recurring!=="never"&&<span className="t-recur">🔄 {task.recurring}</span>}
            {task.reminder&&<span className="t-recur">🔔</span>}
            {trackedTime>0&&<span className="t-recur" style={{color:isTimerRunning?"#6bcb77":"var(--t3)",fontWeight:isTimerRunning?800:400}}>{isTimerRunning?"⏱ "+(activeTimer?`${String(Math.floor((Date.now()-activeTimer.startedAt)/60000)).padStart(2,"0")}:${String(Math.floor(((Date.now()-activeTimer.startedAt)%60000)/1000)).padStart(2,"0")}`:"00:00"):"⏱ "+fmtTime(trackedTime)}</span>}
          </div>
          {task.subtasks.length>0&&<div className="sub-prog"><div className="sub-bar"><div className="sub-bar-f" style={{width:`${sp}%`}}/></div><div className="sub-lbl">{ds}/{task.subtasks.length} subtasks</div></div>}
        </div>
        <div className="t-act" onClick={e=>e.stopPropagation()}>
          <button className="ic-btn" title={isTimerRunning?"Stop timer":"Start timer"} onClick={e=>{e.stopPropagation();isTimerRunning?stopTimer():startTimer(task.id);}} style={{color:isTimerRunning?"#6bcb77":"var(--t3)",background:isTimerRunning?"rgba(107,203,119,.15)":"transparent"}}>{isTimerRunning?"⏹":"▶"}</button>
          <button className="ic-btn" title="Focus Mode" onClick={e=>{e.stopPropagation();setFocusTaskId(task.id);setShowFocusMode(true);}}>🌌</button>
          <button className="ic-btn" onClick={e=>openEdit(task,e)}>✎</button>
          <button className="ic-btn del" onClick={e=>del(task.id,e)}>✕</button>
        </div>
      </div>
        </div>
      </div>
      </>
    );
  };

  // == Live clock for greeting (updates every minute) ==
  const [liveHour, setLiveHour] = useState(new Date().getHours());
  const [liveMin,  setLiveMin]  = useState(new Date().getMinutes());
  useEffect(()=>{
    const iv = setInterval(()=>{ const n=new Date(); setLiveHour(n.getHours()); setLiveMin(n.getMinutes()); }, 60000);
    return ()=>clearInterval(iv);
  },[]);

  function getDailyDigest() {

    const today = todayStr();
    const dueToday = profileTasks.filter(t=>!t.done&&t.due===today);
    const overdue  = profileTasks.filter(t=>!t.done&&t.due&&new Date(t.due)<new Date());
    const completedToday = profileTasks.filter(t=>t.done&&t.createdAt&&new Date(t.createdAt).toISOString().slice(0,10)===today);
    const hour = liveHour;
    const suggestion = hour>=5&&hour<9?"🌅 Morning is golden — tackle your hardest task first!":hour>=9&&hour<12?"⚡ Peak focus hours — perfect for deep creative work.":hour>=12&&hour<14?"🍽 Post-lunch: great for meetings and reviews.":hour>=14&&hour<17?"☕ Afternoon slump? Pomodoro sessions keep you sharp.":hour>=17&&hour<20?"🌆 Evening — review tomorrow's top priorities.":"🌙 Late night — wrap up and plan tomorrow.";
    const avgMoodLast7 = moods.slice(-7).length?(moods.slice(-7).reduce((a,m)=>a+m.energy,0)/moods.slice(-7).length).toFixed(1):null;
    return {dueToday, overdue, completedToday, suggestion, avgMoodLast7, streak:gamStats.streak};
  };


  // == Pages ==
  function TasksPage() {
    const greeting = liveHour<5?"Good night 🌙":liveHour<12?"Good morning ☀️":liveHour<17?"Good afternoon 🌤":liveHour<21?"Good evening 🌆":"Good night 🌙";
    const greetEmoji = liveHour<5?"🌙":liveHour<12?"🌅":liveHour<17?"☀️":liveHour<21?"🌆":"🌙";
    const greetSub = liveHour<5?"Rest up — big things tomorrow":liveHour<12?"Let's make today count!":liveHour<17?"Keep the momentum going!":liveHour<21?"Evening grind time 💪":"Wrap up your day well";
    const curProfile2 = profiles.find(p=>p.id===activeProfile)||profiles[0];
    return (
    <div className="content">
      {/* ✨ Immersive Time-of-Day Greeting Card */}
      <div style={{
        position:"relative",overflow:"hidden",borderRadius:26,marginBottom:16,
        minHeight:240,
        border:(()=>{
          const borders={default:liveHour>=5&&liveHour<12?"rgba(255,200,80,0.4)":liveHour>=12&&liveHour<18?"rgba(80,160,255,0.35)":liveHour>=18&&liveHour<21?"rgba(255,120,60,0.4)":"rgba(124,109,250,0.45)",purple:"rgba(168,85,247,0.5)",gold:"rgba(255,193,7,0.5)",blue:"rgba(59,130,246,0.5)",green:"rgba(107,203,119,0.5)",red:"rgba(255,107,107,0.5)",pink:"rgba(244,114,182,0.5)",white:"rgba(255,255,255,0.25)"};
          return `1px solid ${borders[greetAccent]||borders.default}`;
        })(),
        boxShadow:(()=>{
          const g={default:`0 12px 48px ${accent.v}35`,purple:"0 12px 48px rgba(168,85,247,0.35)",gold:"0 12px 48px rgba(255,193,7,0.3)",blue:"0 12px 48px rgba(59,130,246,0.3)",green:"0 12px 48px rgba(107,203,119,0.3)",red:"0 12px 48px rgba(255,107,107,0.3)",pink:"0 12px 48px rgba(244,114,182,0.3)",white:"0 12px 48px rgba(255,255,255,0.15)"};
          return g[greetAccent]||g.default;
        })(),
      }}>
        {/* ── SVG Scene Background */}
        {(()=>{
          const h = liveHour;
          const autoScene = h>=5&&h<12?"morning":h>=12&&h<18?"afternoon":h>=18&&h<21?"evening":"night";
          const scene = greetScene==="auto" ? autoScene : greetScene;
          const isMorning   = scene==="morning";
          const isAfternoon = scene==="afternoon";
          const isEvening   = scene==="evening";
          const isNight     = scene==="night";
          const isGalaxy    = scene==="galaxy";
          const isForestScene = scene==="forest";
          const isOcean     = scene==="ocean";
          const isSakura    = scene==="sakura";
          const isNorthern  = scene==="northern";
          const isVolcano   = scene==="volcano";
          const isDawn      = scene==="dawn";

          return (
            <div style={{position:"absolute",inset:0,zIndex:0}}>

              {/* ── 🌅 MORNING: Sunrise mountains, birds, mist */}
              {isMorning&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#02000c"/><stop offset="30%" stopColor="#1a0840"/><stop offset="60%" stopColor="#c04825"/><stop offset="82%" stopColor="#f4820a"/><stop offset="100%" stopColor="#ffd060"/>
                    </linearGradient>
                    <radialGradient id="sunGlowM" cx="50%" cy="100%" r="55%">
                      <stop offset="0%" stopColor="#fff8b0" stopOpacity="0.9"/><stop offset="35%" stopColor="#ffcc40" stopOpacity="0.5"/><stop offset="100%" stopColor="#ff6010" stopOpacity="0"/>
                    </radialGradient>
                    <filter id="blurF"><feGaussianBlur stdDeviation="2"/></filter>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyM)"/>
                  <ellipse cx="200" cy="200" rx="140" ry="80" fill="url(#sunGlowM)"/>
                  {/* Sun */}
                  <circle cx="200" cy="182" r="26" fill="#fff5a0" opacity="0.95"><animate attributeName="cy" values="188;182;185" dur="5s" repeatCount="indefinite"/></circle>
                  <circle cx="200" cy="182" r="20" fill="#ffffc0"><animate attributeName="cy" values="188;182;185" dur="5s" repeatCount="indefinite"/></circle>
                  {/* Sun rays */}
                  {[0,22,45,68,90,112,135,158,180,202,225,248,270,292,315,338].map((a,i)=>(
                    <line key={i} x1={200+Math.cos(a*Math.PI/180)*28} y1={182+Math.sin(a*Math.PI/180)*28} x2={200+Math.cos(a*Math.PI/180)*40} y2={182+Math.sin(a*Math.PI/180)*40} stroke="#ffee80" strokeWidth="1.5" opacity="0.6"/>
                  ))}
                  {/* Mountains back */}
                  <polygon points="0,200 0,130 50,70 90,110 140,55 190,95 240,50 290,90 340,60 400,80 400,200" fill="#100520" opacity="0.75"/>
                  {/* Mountains mid */}
                  <polygon points="0,200 0,155 40,110 80,140 130,100 180,135 230,95 280,125 330,105 380,120 400,110 400,200" fill="#1a0835" opacity="0.85"/>
                  {/* Ground */}
                  <rect x="0" y="183" width="400" height="17" fill="#0d0320" opacity="0.92"/>
                  {/* Trees */}
                  {[[-15,4],[ 5,5],[28,3],[340,4],[362,5],[388,4]].map(([x,s],i)=>(
                    <g key={i}>
                      <polygon points={`${x+6*s},183 ${x+6*s},${148-i%3*6} ${x},${165-i%3*4} ${x+12*s},${165-i%3*4}`} fill="#060a04" opacity="0.88"/>
                    </g>
                  ))}
                  {/* Mist layers */}
                  <rect x="0" y="175" width="400" height="12" fill="rgba(255,220,160,0.06)" filter="url(#blurF)"/>
                  <rect x="0" y="170" width="400" height="8"  fill="rgba(255,200,120,0.04)" filter="url(#blurF)"/>
                  {/* Stars fading */}
                  {[30,70,120,180,240,300,360,90,200,160].map((x,i)=>(
                    <circle key={i} cx={x} cy={8+i*9} r="1" fill="white" opacity={0.5-i*0.04}>
                      <animate attributeName="opacity" values={`${0.5-i*0.04};0.05;0`} dur={`${2.5+i*0.2}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Birds */}
                  <g opacity="0.7"><path d="M80,55 Q84,51 89,55" stroke="#ffcc80" strokeWidth="1.5" fill="none" strokeLinecap="round"><animateTransform attributeName="transform" type="translate" values="0,0;60,-12;120,4" dur="8s" repeatCount="indefinite"/></path></g>
                  <g opacity="0.5"><path d="M60,65 Q63,62 67,65" stroke="#ffcc80" strokeWidth="1.2" fill="none" strokeLinecap="round"><animateTransform attributeName="transform" type="translate" values="0,0;50,-8;100,5" dur="10s" repeatCount="indefinite"/></path></g>
                  <g opacity="0.6"><path d="M100,48 Q104,45 108,48 M112,51 Q115,48 118,51" stroke="#ffcc80" strokeWidth="1.2" fill="none" strokeLinecap="round"><animateTransform attributeName="transform" type="translate" values="0,0;70,-15;140,2" dur="9s" repeatCount="indefinite"/></path></g>
                </svg>
              )}

              {/* ── ☀️ AFTERNOON: City skyline, clouds, blue sky */}
              {isAfternoon&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#040d24"/><stop offset="25%" stopColor="#0d2f72"/><stop offset="60%" stopColor="#1a78cc"/><stop offset="85%" stopColor="#42aed8"/><stop offset="100%" stopColor="#7ecce8"/>
                    </linearGradient>
                    <radialGradient id="sunA" cx="78%" cy="20%" r="18%">
                      <stop offset="0%" stopColor="#fff8c0" stopOpacity="1"/><stop offset="50%" stopColor="#ffe060" stopOpacity="0.5"/><stop offset="100%" stopColor="#ffcc40" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyA)"/>
                  <circle cx="315" cy="38" r="16" fill="url(#sunA)" opacity="0.95"/>
                  <circle cx="315" cy="38" r="11" fill="#ffffc0"/>
                  {/* Cloud 1 */}
                  <g opacity="0.8"><ellipse cx="75" cy="35" rx="32" ry="13" fill="white"/><ellipse cx="58" cy="40" rx="20" ry="11" fill="white"/><ellipse cx="96" cy="40" rx="22" ry="11" fill="white"/><animateTransform attributeName="transform" type="translate" values="0,0;10,0;0,0" dur="12s" repeatCount="indefinite"/></g>
                  {/* Cloud 2 */}
                  <g opacity="0.55"><ellipse cx="230" cy="22" rx="28" ry="11" fill="white"/><ellipse cx="215" cy="26" rx="18" ry="9" fill="white"/><ellipse cx="248" cy="26" rx="20" ry="9" fill="white"/><animateTransform attributeName="transform" type="translate" values="0,0;-8,0;0,0" dur="16s" repeatCount="indefinite"/></g>
                  {/* Cloud 3 small */}
                  <g opacity="0.4"><ellipse cx="355" cy="55" rx="18" ry="7" fill="white"/><ellipse cx="345" cy="58" rx="12" ry="6" fill="white"/><animateTransform attributeName="transform" type="translate" values="0,0;6,0;0,0" dur="10s" repeatCount="indefinite"/></g>
                  {/* Water/ground */}
                  <rect x="0" y="175" width="400" height="25" fill="#0a1428" opacity="0.95"/>
                  <rect x="0" y="172" width="400" height="5" fill="#1a3a6a" opacity="0.7"/>
                  {/* Water shimmer */}
                  <rect x="50" y="180" width="60" height="2" rx="1" fill="rgba(255,255,255,0.15)"><animate attributeName="opacity" values="0.15;0.35;0.15" dur="3s" repeatCount="indefinite"/></rect>
                  <rect x="200" y="184" width="40" height="1.5" rx="1" fill="rgba(255,255,255,0.1)"><animate attributeName="opacity" values="0.1;0.25;0.1" dur="4s" repeatCount="indefinite"/></rect>
                  {/* Buildings */}
                  <rect x="0"   y="128" width="36"  height="72" fill="#06101e" opacity="0.9"/>
                  <rect x="30"  y="112" width="26"  height="88" fill="#09182e" opacity="0.9"/>
                  <rect x="52"  y="122" width="22"  height="78" fill="#06101e" opacity="0.88"/>
                  <rect x="70"  y="98"  width="30"  height="102" fill="#09182e" opacity="0.9"/>
                  <rect x="95"  y="115" width="24"  height="85" fill="#06101e" opacity="0.88"/>
                  <rect x="185" y="100" width="30"  height="100" fill="#06101e" opacity="0.9"/>
                  <rect x="210" y="88"  width="24"  height="112" fill="#09182e" opacity="0.9"/>
                  <rect x="230" y="108" width="20"  height="92" fill="#06101e" opacity="0.88"/>
                  <rect x="305" y="95"  width="34"  height="105" fill="#09182e" opacity="0.9"/>
                  <rect x="335" y="112" width="26"  height="88" fill="#06101e" opacity="0.88"/>
                  <rect x="357" y="90"  width="30"  height="110" fill="#09182e" opacity="0.9"/>
                  <rect x="383" y="108" width="17"  height="92" fill="#06101e" opacity="0.88"/>
                  {/* Antennas */}
                  <rect x="221" y="78" width="2" height="10" fill="#1a3a80" opacity="0.8"/>
                  <rect x="369" y="80" width="2" height="10" fill="#1a3a80" opacity="0.8"/>
                  <circle cx="222" cy="78" r="1.5" fill="#ff6b6b" opacity="0.7"><animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.5s" repeatCount="indefinite"/></circle>
                  <circle cx="370" cy="80" r="1.5" fill="#ff6b6b" opacity="0.5"><animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite"/></circle>
                  {/* Windows */}
                  {[[35,102,3,3],[35,112,3,3],[35,122,3,3],[72,102,3,3],[72,112,3,3],[85,102,3,3],[212,92,3,3],[212,102,3,3],[212,112,3,3],[217,92,3,3],[217,102,3,3],[308,100,3,3],[308,110,3,3],[308,120,3,3],[315,100,3,3],[360,95,3,3],[360,105,3,3],[360,115,3,3],[337,117,3,3]].map(([x,y,w,h],i)=>(
                    <rect key={i} x={x} y={y} width={w} height={h} rx="0.5" fill="#ffd080" opacity={0.3+Math.random()*0.4}/>
                  ))}
                  {/* Lily pads */}
                  <ellipse cx="160" cy="183" rx="14" ry="5" fill="#1a5c2a" opacity="0.55"/>
                  <circle cx="160" cy="181" r="5" fill="#ff9ec0" opacity="0.65"/>
                  <ellipse cx="280" cy="187" rx="10" ry="4" fill="#1a5c2a" opacity="0.4"/>
                  <circle cx="280" cy="185" r="3.5" fill="#ffcce0" opacity="0.55"/>
                  {/* Bird */}
                  <path d="M155,28 Q158,25 162,28 M165,31 Q168,28 172,31" stroke="rgba(255,255,255,0.5)" strokeWidth="1" fill="none"><animateTransform attributeName="transform" type="translate" values="0,0;30,-6;60,2" dur="9s" repeatCount="indefinite"/></path>
                </svg>
              )}

              {/* ── 🌆 EVENING: Sunset mountains, house, silhouettes */}
              {isEvening&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyE" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#01000a"/><stop offset="18%" stopColor="#12002c"/><stop offset="45%" stopColor="#7a1830"/><stop offset="70%" stopColor="#e83818"/><stop offset="85%" stopColor="#ff7820"/><stop offset="100%" stopColor="#ffc050"/>
                    </linearGradient>
                    <radialGradient id="sunE" cx="50%" cy="95%" r="55%">
                      <stop offset="0%" stopColor="#ffeeaa" stopOpacity="0.85"/><stop offset="45%" stopColor="#ff7020" stopOpacity="0.4"/><stop offset="100%" stopColor="#cc2808" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyE)"/>
                  <ellipse cx="200" cy="200" rx="160" ry="90" fill="url(#sunE)"/>
                  {/* Setting sun */}
                  <circle cx="200" cy="186" r="22" fill="#ffcc60" opacity="0.92"/>
                  <circle cx="200" cy="186" r="17" fill="#fff0a0" opacity="0.95"/>
                  {/* Stars appearing */}
                  {[35,85,155,235,305,365,55,275,185,125,320,95].map((x,i)=>(
                    <circle key={i} cx={x} cy={8+i*8} r="1" fill="white">
                      <animate attributeName="opacity" values={`0;${i*0.07};${i*0.05};0`} dur={`${2+i*0.3}s`} begin={`${i*0.4}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Mountains back */}
                  <polygon points="0,200 0,125 60,55 120,100 185,42 250,88 315,52 380,82 400,70 400,200" fill="#15032c" opacity="0.88"/>
                  {/* Mountains front */}
                  <polygon points="0,200 0,150 45,110 90,140 155,102 215,128 270,105 330,122 385,108 400,112 400,200" fill="#1e0438" opacity="0.92"/>
                  {/* Ground */}
                  <rect x="0" y="183" width="400" height="17" fill="#10021c" opacity="0.98"/>
                  {/* House */}
                  <rect x="152" y="148" width="62" height="38" fill="#0d0820" opacity="0.98"/>
                  <polygon points="140,150 228,150 202,122 178,122" fill="#180d30" opacity="0.98"/>
                  {/* Chimney */}
                  <rect x="198" y="112" width="8" height="14" fill="#0d0820"/>
                  <ellipse cx="202" cy="111" rx="6" ry="3" fill="rgba(180,180,200,0.15)">
                    <animate attributeName="cy" values="111;105;111" dur="3s" repeatCount="indefinite"/>
                    <animate attributeName="opacity" values="0.15;0;0.15" dur="3s" repeatCount="indefinite"/>
                  </ellipse>
                  {/* Windows lit */}
                  <rect x="160" y="154" rx="1" width="11" height="11" fill="#ffcc60" opacity="0.9"><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite"/></rect>
                  <rect x="178" y="154" rx="1" width="11" height="11" fill="#ffcc60" opacity="0.85"><animate attributeName="opacity" values="0.85;1;0.85" dur="4s" repeatCount="indefinite"/></rect>
                  <rect x="196" y="154" rx="1" width="11" height="11" fill="#ffa040" opacity="0.8"><animate attributeName="opacity" values="0.7;0.95;0.7" dur="3.5s" repeatCount="indefinite"/></rect>
                  {/* Door */}
                  <rect x="177" y="165" width="13" height="21" rx="1.5" fill="#060410"/>
                  {/* House glow */}
                  <ellipse cx="183" cy="170" rx="25" ry="14" fill="#ffcc40" opacity="0.07"/>
                  {/* Trees */}
                  {[[108,0],[120,5],[258,0],[272,5],[290,3]].map(([x,off],i)=>(
                    <g key={i}>
                      <polygon points={`${x+6},183 ${x+6},${145-off} ${x},${162-off} ${x+12},${162-off}`} fill="#080d04" opacity="0.88"/>
                    </g>
                  ))}
                  {/* Bird silhouettes */}
                  <path d="M75,65 Q78,62 82,65 M85,68 Q88,65 92,68" stroke="#ff7020" strokeWidth="1.2" fill="none" opacity="0.6"/>
                  <path d="M310,50 Q313,47 317,50" stroke="#ff7020" strokeWidth="1" fill="none" opacity="0.5"/>
                </svg>
              )}

              {/* ── 🌙 NIGHT: Galaxy, moon, shooting stars */}
              {isNight&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyN" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#000008"/><stop offset="40%" stopColor="#040018"/><stop offset="70%" stopColor="#0c0030"/><stop offset="100%" stopColor="#1a0042"/>
                    </linearGradient>
                    <radialGradient id="moonGN" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#e8e4ff" stopOpacity="1"/><stop offset="60%" stopColor="#c0b8ff" stopOpacity="0.3"/><stop offset="100%" stopColor="#7c6dfa" stopOpacity="0"/>
                    </radialGradient>
                    <radialGradient id="milkyWay" cx="30%" cy="60%" r="50%">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity="0.22"/><stop offset="50%" stopColor="#7c6dfa" stopOpacity="0.1"/><stop offset="100%" stopColor="#000" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyN)"/>
                  {/* Milky way */}
                  <ellipse cx="140" cy="95" rx="200" ry="40" fill="url(#milkyWay)" transform="rotate(-20,200,95)"/>
                  {/* Stars - many */}
                  {[[20,15,1.8],[48,8,1.2],[78,22,1.5],[108,10,1],[138,18,1.8],[168,6,1.2],[198,15,2],[228,9,1.3],[258,22,1.6],[288,7,1.2],[318,16,1.8],[348,11,1.4],[378,19,1.2],[25,38,0.9],[68,44,1.3],[118,35,1.1],[158,45,1.5],[208,42,1],[248,34,1.2],[298,46,1.4],[338,38,1.1],[378,44,1.3],[15,58,0.8],[58,64,1.2],[108,55,0.9],[158,62,1.4],[198,54,1.1],[248,64,1.3],[288,58,1],[338,62,1.2],[378,54,1.1],[42,78,0.8],[98,74,0.9],[188,76,1.1],[235,82,1],[285,74,0.9],[335,78,1.2],[55,92,0.8],[145,92,1],[195,98,0.9],[245,92,0.8],[295,96,1],[355,92,0.9],[12,110,0.7],[62,108,0.8],[112,112,0.7],[162,106,0.9],[212,112,0.8],[262,108,0.7],[312,112,0.9],[362,106,0.8]].map(([x,y,r],i)=>(
                    <circle key={i} cx={x} cy={y} r={r} fill="white" opacity={0.3+((i*7)%10)*0.06}>
                      <animate attributeName="opacity" values={`${0.3+((i*7)%10)*0.06};${0.7+((i*3)%4)*0.08};${0.3+((i*7)%10)*0.06}`} dur={`${2+((i*3)%7)*0.5}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Shooting star 1 */}
                  <line x1="300" y1="20" x2="348" y2="38" stroke="white" strokeWidth="1" opacity="0">
                    <animate attributeName="opacity" values="0;0;0.9;0;0;0;0;0;0;0" dur="12s" repeatCount="indefinite"/>
                    <animateTransform attributeName="transform" type="translate" values="0,0;0,0;-50,15;-100,30;-100,30;-100,30;-100,30;0,0;0,0;0,0" dur="12s" repeatCount="indefinite"/>
                  </line>
                  {/* Shooting star 2 */}
                  <line x1="80" y1="15" x2="116" y2="28" stroke="white" strokeWidth="0.8" opacity="0">
                    <animate attributeName="opacity" values="0;0;0;0;0.8;0;0;0;0;0" dur="15s" repeatCount="indefinite"/>
                    <animateTransform attributeName="transform" type="translate" values="0,0;0,0;0,0;0,0;50,-8;100,-16;100,-16;0,0;0,0;0,0" dur="15s" repeatCount="indefinite"/>
                  </line>
                  {/* Moon */}
                  <circle cx="308" cy="40" r="28" fill="url(#moonGN)"/>
                  <circle cx="308" cy="40" r="20" fill="#d4ccff" opacity="0.96"/>
                  <circle cx="308" cy="40" r="18" fill="#e8e4ff"/>
                  {/* Moon craters */}
                  <circle cx="302" cy="34" r="3" fill="#c8c0f0" opacity="0.5"/>
                  <circle cx="314" cy="44" r="2.2" fill="#c8c0f0" opacity="0.4"/>
                  <circle cx="305" cy="46" r="1.8" fill="#c8c0f0" opacity="0.3"/>
                  <circle cx="318" cy="35" r="1.5" fill="#c8c0f0" opacity="0.25"/>
                  {/* Moon shadow / crescent */}
                  <circle cx="316" cy="38" r="17" fill="#0c0030" opacity="0.22"/>
                  {/* Mountains */}
                  <polygon points="0,200 0,140 55,80 110,120 170,65 230,105 290,70 345,100 400,78 400,200" fill="#02000c" opacity="0.95"/>
                  {/* Ground */}
                  <rect x="0" y="184" width="400" height="16" fill="#010008" opacity="0.99"/>
                  {/* Trees */}
                  {[[8,0],[32,5],[370,0],[390,5]].map(([x,off],i)=>(
                    <g key={i}><polygon points={`${x+6},184 ${x+6},${150-off} ${x},${166-off} ${x+12},${166-off}`} fill="#010008" opacity="0.92"/></g>
                  ))}
                  {/* Nebula wisps */}
                  <ellipse cx="80" cy="80" rx="55" ry="18" fill="#7c6dfa" opacity="0.055" transform="rotate(18,80,80)"/>
                  <ellipse cx="250" cy="55" rx="42" ry="14" fill="#a855f7" opacity="0.045" transform="rotate(-12,250,55)"/>
                </svg>
              )}

              {/* ── 🌌 GALAXY: Deep space with nebula */}
              {isGalaxy&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="galSky" x1="0" y1="0" x2="0.5" y2="1">
                      <stop offset="0%" stopColor="#000008"/><stop offset="50%" stopColor="#08001e"/><stop offset="100%" stopColor="#1e0050"/>
                    </linearGradient>
                    <radialGradient id="neb1" cx="30%" cy="40%" r="45%">
                      <stop offset="0%" stopColor="#7c6dfa" stopOpacity="0.35"/><stop offset="60%" stopColor="#a855f7" stopOpacity="0.12"/><stop offset="100%" stopColor="#000" stopOpacity="0"/>
                    </radialGradient>
                    <radialGradient id="neb2" cx="75%" cy="30%" r="40%">
                      <stop offset="0%" stopColor="#f472b6" stopOpacity="0.2"/><stop offset="50%" stopColor="#a855f7" stopOpacity="0.08"/><stop offset="100%" stopColor="#000" stopOpacity="0"/>
                    </radialGradient>
                    <radialGradient id="neb3" cx="55%" cy="75%" r="35%">
                      <stop offset="0%" stopColor="#48dbfb" stopOpacity="0.15"/><stop offset="100%" stopColor="#000" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#galSky)"/>
                  <ellipse cx="200" cy="100" rx="220" ry="60" fill="url(#neb1)"/>
                  <ellipse cx="300" cy="60" rx="160" ry="50" fill="url(#neb2)"/>
                  <ellipse cx="220" cy="150" rx="140" ry="45" fill="url(#neb3)"/>
                  {/* Dense star field */}
                  {Array.from({length:80},(_,i)=>{
                    const x=((i*97+23)%400), y=((i*53+17)%180);
                    const r=0.5+(i%5)*0.35;
                    const colors=["white","#c4b5fd","#bfdbfe","#fbcfe8","#a5f3fc"];
                    return <circle key={i} cx={x} cy={y} r={r} fill={colors[i%5]} opacity={0.2+((i*7)%8)*0.09}><animate attributeName="opacity" values={`${0.2+((i*7)%8)*0.09};${0.7+((i*3)%4)*0.1};${0.2+((i*7)%8)*0.09}`} dur={`${1.5+((i*4)%9)*0.4}s`} repeatCount="indefinite"/></circle>;
                  })}
                  {/* Galaxy spiral arm hints */}
                  <ellipse cx="160" cy="90" rx="80" ry="18" fill="rgba(180,150,255,0.08)" transform="rotate(35,160,90)"/>
                  <ellipse cx="240" cy="110" rx="70" ry="15" fill="rgba(150,180,255,0.06)" transform="rotate(-25,240,110)"/>
                  {/* Bright star / planet */}
                  <circle cx="320" cy="45" r="4" fill="white" opacity="0.9"><animate attributeName="r" values="3.5;5;3.5" dur="3s" repeatCount="indefinite"/></circle>
                  <circle cx="320" cy="45" r="8" fill="white" opacity="0.12"><animate attributeName="r" values="7;12;7" dur="3s" repeatCount="indefinite"/></circle>
                  {/* Shooting star */}
                  <line x1="80" y1="30" x2="120" y2="44" stroke="white" strokeWidth="1.2" opacity="0"><animate attributeName="opacity" values="0;0;1;0;0;0;0" dur="10s" repeatCount="indefinite"/><animateTransform attributeName="transform" type="translate" values="0,0;0,0;60,-10;120,-20;120,-20;0,0;0,0" dur="10s" repeatCount="indefinite"/></line>
                  {/* Distant galaxy blob */}
                  <ellipse cx="75" cy="120" rx="20" ry="8" fill="rgba(200,180,255,0.1)" transform="rotate(20,75,120)"/>
                  {/* Mountains */}
                  <polygon points="0,200 0,148 60,90 120,128 180,70 240,110 300,78 360,108 400,88 400,200" fill="#04000f" opacity="0.96"/>
                  <rect x="0" y="185" width="400" height="15" fill="#02000a" opacity="0.99"/>
                </svg>
              )}

              {/* ── 🌿 FOREST: Lush trees, sun rays, lily */}
              {isForestScene&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyFo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#02080a"/><stop offset="30%" stopColor="#062a1a"/><stop offset="65%" stopColor="#0d5228"/><stop offset="100%" stopColor="#145a30"/>
                    </linearGradient>
                    <radialGradient id="sunFo" cx="70%" cy="20%" r="30%">
                      <stop offset="0%" stopColor="#fff8c0" stopOpacity="0.9"/><stop offset="40%" stopColor="#a8e880" stopOpacity="0.3"/><stop offset="100%" stopColor="#0d5228" stopOpacity="0"/>
                    </radialGradient>
                    <filter id="foBlur"><feGaussianBlur stdDeviation="3"/></filter>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyFo)"/>
                  <ellipse cx="280" cy="40" rx="100" ry="80" fill="url(#sunFo)"/>
                  {/* Sun */}
                  <circle cx="285" cy="30" r="12" fill="#fff8a0" opacity="0.88"/>
                  <circle cx="285" cy="30" r="9" fill="#ffffc0"/>
                  {/* Sun rays through trees */}
                  {[200,220,240,260,280,300,320].map((x,i)=>(
                    <line key={i} x1={285} y1={30} x2={x} y2={200} stroke="rgba(200,255,150,0.06)" strokeWidth={3+i%3}/>
                  ))}
                  {/* Background forest */}
                  <polygon points="0,200 0,90 25,50 50,80 75,40 100,70 125,35 150,65 175,30 200,60 225,25 250,55 275,20 300,50 325,30 350,60 375,40 400,70 400,200" fill="#062010" opacity="0.75"/>
                  {/* Mid forest */}
                  <polygon points="0,200 0,120 20,90 40,115 65,80 90,110 115,70 140,100 165,65 190,100 215,70 240,105 265,60 290,95 315,75 340,100 365,80 390,105 400,95 400,200" fill="#0a2d14" opacity="0.85"/>
                  {/* Ground/water */}
                  <rect x="0" y="175" width="400" height="25" fill="#062010" opacity="0.95"/>
                  {/* Water */}
                  <ellipse cx="200" cy="185" rx="120" ry="12" fill="#0a3828" opacity="0.6"/>
                  {/* Water shimmer */}
                  <line x1="130" y1="183" x2="170" y2="183" stroke="rgba(150,255,200,0.2)" strokeWidth="1.5"><animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite"/></line>
                  <line x1="200" y1="186" x2="230" y2="186" stroke="rgba(150,255,200,0.15)" strokeWidth="1"><animate attributeName="opacity" values="0.15;0.4;0.15" dur="4s" repeatCount="indefinite"/></line>
                  {/* Large trees foreground */}
                  {[[10,200],[30,210],[380,195],[355,205]].map(([x,h],i)=>(
                    <g key={i}>
                      <rect x={x+4} y={200-h/3} width="6" height={h/3} fill="#061004"/>
                      <polygon points={`${x},${200-h/3} ${x+7},${200-h} ${x+14},${200-h/3}`} fill="#0d2808"/>
                      <polygon points={`${x-3},${200-h/3+20} ${x+7},${200-h+20} ${x+17},${200-h/3+20}`} fill="#143010"/>
                    </g>
                  ))}
                  {/* Lily pads */}
                  <ellipse cx="175" cy="183" rx="14" ry="5" fill="#1a6228" opacity="0.7"/>
                  <circle cx="175" cy="181" r="5" fill="#ff9ec0" opacity="0.75"/>
                  <ellipse cx="220" cy="187" rx="11" ry="4" fill="#1a6228" opacity="0.55"/>
                  <circle cx="220" cy="185" r="4" fill="#fff" opacity="0.6"/>
                  <ellipse cx="250" cy="184" rx="9" ry="3.5" fill="#1a6228" opacity="0.5"/>
                  <circle cx="250" cy="182" r="3.5" fill="#ffccf0" opacity="0.6"/>
                  {/* Fireflies */}
                  {[[80,130],[150,110],[260,125],[340,118]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r="2" fill="#ccff80" opacity="0">
                      <animate attributeName="opacity" values={`0;0;0.8;0;0;0;0`} dur={`${3+i}s`} begin={`${i*1.2}s`} repeatCount="indefinite"/>
                      <animate attributeName="cx" values={`${x};${x+4};${x-2};${x}`} dur={`${4+i}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Bird */}
                  <path d="M100,48 Q104,44 109,48" stroke="rgba(200,255,180,0.5)" strokeWidth="1.2" fill="none"><animateTransform attributeName="transform" type="translate" values="0,0;80,-10;160,5" dur="10s" repeatCount="indefinite"/></path>
                </svg>
              )}


              {/* ── 🌊 OCEAN: Deep sea with bioluminescence */}
              {isOcean&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyOc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#000d1a"/><stop offset="35%" stopColor="#001a33"/><stop offset="65%" stopColor="#003366"/><stop offset="100%" stopColor="#0055aa"/>
                    </linearGradient>
                    <radialGradient id="moonOc" cx="70%" cy="18%" r="12%">
                      <stop offset="0%" stopColor="#e8f0ff" stopOpacity="1"/><stop offset="100%" stopColor="#6080ff" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyOc)"/>
                  {/* Stars */}
                  {[[30,15],[80,8],[150,20],[220,6],[290,18],[360,10],[50,40],[180,35],[310,42],[130,12],[250,25],[380,32]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={0.8+i%3*0.4} fill="white" opacity={0.3+i%5*0.1}><animate attributeName="opacity" values={`${0.3+i%5*0.1};0.9;${0.3+i%5*0.1}`} dur={`${2+i%5}s`} repeatCount="indefinite"/></circle>
                  ))}
                  <circle cx="280" cy="35" r="14" fill="url(#moonOc)" opacity="0.9"/>
                  <circle cx="280" cy="35" r="10" fill="#d0e0ff" opacity="0.95"/>
                  {/* Moon reflection on water */}
                  <ellipse cx="280" cy="165" rx="8" ry="20" fill="rgba(200,220,255,0.08)" transform="scale(1,-1) translate(0,-330)"/>
                  {/* Ocean waves */}
                  {[130,145,158,170,182].map((y,i)=>(
                    <path key={i} d={`M0,${y} Q50,${y-8+i*2} 100,${y} Q150,${y+8-i*2} 200,${y} Q250,${y-8+i*2} 300,${y} Q350,${y+8-i*2} 400,${y} L400,200 L0,200 Z`}
                      fill={`rgba(0,${60+i*20},${120+i*25},${0.3+i*0.12})`}>
                      <animateTransform attributeName="transform" type="translate" values={`${i%2===0?'-20':20},0;${i%2===0?20:-20},0;${i%2===0?'-20':20},0`} dur={`${4+i}s`} repeatCount="indefinite"/>
                    </path>
                  ))}
                  {/* Bioluminescence dots */}
                  {[[60,155],[120,162],[200,158],[270,165],[340,160],[90,170],[180,175],[300,172]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={1.5+i%3} fill="#40a0ff" opacity="0">
                      <animate attributeName="opacity" values="0;0.6;0;0.4;0" dur={`${3+i}s`} begin={`${i*0.8}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Distant ship silhouette */}
                  <rect x="60" y="128" width="20" height="4" fill="#001020" opacity="0.7"/>
                  <rect x="67" y="120" width="3" height="8" fill="#001020" opacity="0.7"/>
                </svg>
              )}

              {/* ── 🌸 SAKURA: Cherry blossom night garden */}
              {isSakura&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skySk" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d0010"/><stop offset="30%" stopColor="#2d0035"/><stop offset="60%" stopColor="#6b1060"/><stop offset="85%" stopColor="#b04080"/><stop offset="100%" stopColor="#e080a0"/>
                    </linearGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skySk)"/>
                  {/* Full moon */}
                  <circle cx="300" cy="40" r="22" fill="rgba(255,240,255,0.15)"/>
                  <circle cx="300" cy="40" r="16" fill="#ffe8f8" opacity="0.92"/>
                  <circle cx="300" cy="40" r="14" fill="#fff0fa"/>
                  {/* Stars */}
                  {[[20,15],[70,22],[140,10],[200,18],[250,8],[360,25],[50,35],[160,40],[330,15]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r="1" fill="#ffd0e8" opacity={0.4+i%4*0.1}><animate attributeName="opacity" values={`${0.3+i%4*0.1};0.8;${0.3+i%4*0.1}`} dur={`${2+i%6}s`} repeatCount="indefinite"/></circle>
                  ))}
                  {/* Sakura tree trunk */}
                  <rect x="45" y="100" width="10" height="100" rx="3" fill="#1a0820"/>
                  <rect x="355" y="120" width="8" height="80" rx="3" fill="#1a0820"/>
                  {/* Sakura branches */}
                  <path d="M50,140 Q20,100 10,60" stroke="#1a0820" strokeWidth="4" fill="none"/>
                  <path d="M50,130 Q80,90 100,50" stroke="#1a0820" strokeWidth="3.5" fill="none"/>
                  <path d="M50,120 Q30,80 50,40" stroke="#1a0820" strokeWidth="3" fill="none"/>
                  <path d="M359,150 Q390,110 395,70" stroke="#1a0820" strokeWidth="3.5" fill="none"/>
                  <path d="M359,140 Q330,100 310,55" stroke="#1a0820" strokeWidth="3" fill="none"/>
                  {/* Petals on branches */}
                  {[[10,62],[20,75],[35,55],[55,42],[80,52],[100,52],[310,57],[330,62],[365,68],[385,72],[350,90],[300,70]].map(([x,y],i)=>(
                    <g key={i}>
                      <circle cx={x} cy={y} r={6+i%3*2} fill={i%3===0?"#ff90c0":i%3===1?"#ffb0d0":"#ffd0e8"} opacity="0.85"/>
                      <circle cx={x+2} cy={y-2} r={4+i%3} fill={i%3===0?"#ffb0d5":i%3===1?"#ffc8e0":"#ffe0f0"} opacity="0.7"/>
                    </g>
                  ))}
                  {/* Falling petals */}
                  {[[80,80],[160,60],[230,90],[310,75],[170,110],[250,130],[120,140]].map(([x,y],i)=>(
                    <ellipse key={i} cx={x} cy={y} rx="4" ry="3" fill={i%2===0?"#ff90c0":"#ffc0d8"} opacity="0.6" transform={`rotate(${i*30})`}>
                      <animateTransform attributeName="transform" type="translate" values={`0,0;${(i%2===0?-1:1)*15},${30+i*8};${(i%2===0?-1:1)*8},${60+i*15}`} dur={`${4+i*0.8}s`} repeatCount="indefinite"/>
                    </ellipse>
                  ))}
                  {/* Ground / path */}
                  <ellipse cx="200" cy="195" rx="200" ry="25" fill="#180020" opacity="0.8"/>
                  {/* Stone lantern */}
                  <rect x="185" y="165" width="30" height="20" rx="2" fill="#1a0820"/>
                  <rect x="180" y="178" width="40" height="5" fill="#1a0820"/>
                  <rect x="190" y="150" width="20" height="18" rx="1" fill="#1a0820"/>
                  <rect x="193" y="153" width="14" height="12" fill="#ffcc44" opacity="0.7">
                    <animate attributeName="opacity" values="0.5;0.8;0.5" dur="2s" repeatCount="indefinite"/>
                  </rect>
                </svg>
              )}

              {/* ── 🌠 NORTHERN LIGHTS: Aurora borealis */}
              {isNorthern&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyAu" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#000005"/><stop offset="50%" stopColor="#000318"/><stop offset="100%" stopColor="#001033"/>
                    </linearGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyAu)"/>
                  {/* Aurora curtains */}
                  {[
                    {x:0,c1:"#00ff80",c2:"#00cc40",d:"5s",dx:"15"},
                    {x:60,c1:"#40ffaa",c2:"#00aa60",d:"7s",dx:"-10"},
                    {x:150,c1:"#80ffcc",c2:"#20cc80",d:"6s",dx:"20"},
                    {x:240,c1:"#00ddff",c2:"#0099cc",d:"8s",dx:"-15"},
                    {x:320,c1:"#60eeff",c2:"#00aadd",d:"5.5s",dx:"10"},
                  ].map((a,i)=>(
                    <g key={i}>
                      <path d={`M${a.x},0 Q${a.x+30},80 ${a.x+20},160 L${a.x+60},160 Q${a.x+50},80 ${a.x+80},0`} fill={a.c1} opacity="0.12">
                        <animateTransform attributeName="transform" type="translate" values={`0,0;${a.dx},20;0,0`} dur={a.d} repeatCount="indefinite"/>
                      </path>
                      <path d={`M${a.x+10},0 Q${a.x+40},60 ${a.x+30},140 L${a.x+50},140 Q${a.x+60},60 ${a.x+70},0`} fill={a.c2} opacity="0.15">
                        <animateTransform attributeName="transform" type="translate" values={`0,0;${-parseInt(a.dx)},15;0,0`} dur={a.d} repeatCount="indefinite"/>
                      </path>
                    </g>
                  ))}
                  {/* Purple aurora hint */}
                  <path d="M100,0 Q200,100 300,0" fill="#8040ff" opacity="0.06"/>
                  {/* Stars */}
                  {[[15,12],[55,8],[100,20],[165,6],[220,15],[275,9],[330,18],[385,5],[40,30],[130,28],[250,32],[370,25],[80,45],[200,42],[320,48]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={0.7+i%3*0.4} fill="white" opacity={0.5+i%4*0.1}><animate attributeName="opacity" values={`${0.4+i%4*0.1};1;${0.4+i%4*0.1}`} dur={`${1.5+i%6*0.4}s`} repeatCount="indefinite"/></circle>
                  ))}
                  {/* Ground / snow */}
                  <polygon points="0,200 0,165 40,145 80,160 120,140 160,158 200,138 240,155 280,142 320,158 360,145 400,162 400,200" fill="#000e22" opacity="0.95"/>
                  {/* Snow sparkles */}
                  {[[30,170],[90,162],[170,155],[250,162],[330,158],[380,168]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r="1.5" fill="white" opacity="0.4"><animate attributeName="opacity" values="0.2;0.7;0.2" dur={`${2+i}s`} repeatCount="indefinite"/></circle>
                  ))}
                  {/* Pine trees silhouettes */}
                  {[[-5,0],[15,8],[350,0],[375,10]].map(([x,off],i)=>(
                    <polygon key={i} points={`${x+8},165 ${x+8},${130-off} ${x},${150-off} ${x+16},${150-off}`} fill="#000813" opacity="0.9"/>
                  ))}
                </svg>
              )}

              {/* ── 🌋 VOLCANO: Eruption at night */}
              {isVolcano&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyVo" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#020000"/><stop offset="25%" stopColor="#1a0000"/><stop offset="55%" stopColor="#4a0800"/><stop offset="80%" stopColor="#c02000"/><stop offset="100%" stopColor="#ff4000"/>
                    </linearGradient>
                    <radialGradient id="eruption" cx="50%" cy="40%" r="35%">
                      <stop offset="0%" stopColor="#ff8800" stopOpacity="0.8"/><stop offset="50%" stopColor="#ff4400" stopOpacity="0.3"/><stop offset="100%" stopColor="#cc0000" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyVo)"/>
                  {/* Glow from eruption */}
                  <ellipse cx="200" cy="80" rx="120" ry="80" fill="url(#eruption)"/>
                  {/* Sparks / lava particles */}
                  {[[185,75],[200,60],[215,70],[195,85],[205,65],[190,90],[210,80],[198,55]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={2+i%3} fill={i%3===0?"#ff8800":i%3===1?"#ffcc00":"#ff4400"} opacity="0">
                      <animate attributeName="opacity" values="0;0.9;0;0.7;0" dur={`${0.5+i*0.3}s`} repeatCount="indefinite"/>
                      <animateTransform attributeName="transform" type="translate" values={`0,0;${(i%2===0?-1:1)*20},-${30+i*5};${(i%2===0?-1:1)*10},${10+i*3}`} dur={`${0.8+i*0.2}s`} repeatCount="indefinite"/>
                    </circle>
                  ))}
                  {/* Smoke cloud */}
                  <ellipse cx="195" cy="45" rx="40" ry="25" fill="rgba(80,20,0,0.4)"><animate attributeName="ry" values="20;30;20" dur="3s" repeatCount="indefinite"/></ellipse>
                  <ellipse cx="210" cy="30" rx="30" ry="20" fill="rgba(60,15,0,0.3)"/>
                  {/* Mountain silhouette */}
                  <polygon points="0,200 0,180 80,180 160,60 200,55 240,60 320,180 400,180 400,200" fill="#0a0000" opacity="0.97"/>
                  {/* Lava flow */}
                  <path d="M185,90 Q180,120 175,150 Q170,170 165,185 L185,185 Q190,160 195,130 Q200,110 200,90 Z" fill="#ff5500" opacity="0.7"/>
                  <path d="M200,90 Q205,115 210,140 Q215,165 220,185 L200,185 Q198,160 197,130 Q196,110 200,90 Z" fill="#ff3300" opacity="0.6"/>
                  {/* Lava glow on ground */}
                  <ellipse cx="185" cy="185" rx="20" ry="8" fill="#ff4400" opacity="0.3"/>
                  {/* Distant mountains */}
                  <polygon points="0,200 0,150 60,110 100,140 0,150" fill="#0a0000" opacity="0.8"/>
                  <polygon points="400,200 400,145 340,105 300,135 400,145" fill="#0a0000" opacity="0.8"/>
                </svg>
              )}

              {/* ── 🌄 DAWN: Mountain sunrise reflection */}
              {isDawn&&(
                <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="skyDw" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#000208"/><stop offset="20%" stopColor="#020418"/><stop offset="45%" stopColor="#08103a"/><stop offset="65%" stopColor="#301860"/><stop offset="82%" stopColor="#804090"/><stop offset="100%" stopColor="#e09040"/>
                    </linearGradient>
                    <radialGradient id="sunDw" cx="50%" cy="80%" r="40%">
                      <stop offset="0%" stopColor="#ffeeaa" stopOpacity="0.7"/><stop offset="50%" stopColor="#ff9020" stopOpacity="0.25"/><stop offset="100%" stopColor="#8020a0" stopOpacity="0"/>
                    </radialGradient>
                  </defs>
                  <rect width="400" height="200" fill="url(#skyDw)"/>
                  <ellipse cx="200" cy="200" rx="150" ry="80" fill="url(#sunDw)"/>
                  {/* Pre-dawn stars */}
                  {[[25,15],[75,8],[140,20],[210,6],[280,14],[350,9],[55,32],[170,28],[320,35],[100,10],[240,22]].map(([x,y],i)=>(
                    <circle key={i} cx={x} cy={y} r={0.8+i%3*0.3} fill={i%3===0?"white":"#d0b0ff"} opacity={0.3+i%5*0.08}><animate attributeName="opacity" values={`${0.2+i%5*0.08};0.7;${0.2+i%5*0.08}`} dur={`${2+i%7*0.4}s`} repeatCount="indefinite"/></circle>
                  ))}
                  {/* Planet / Venus */}
                  <circle cx="320" cy="45" r="3" fill="#fff8cc" opacity="0.9"><animate attributeName="opacity" values="0.8;1;0.8" dur="3s" repeatCount="indefinite"/></circle>
                  {/* Mountains - snow capped */}
                  <polygon points="0,200 0,130 60,70 120,115 180,50 240,95 300,60 360,100 400,80 400,200" fill="#0c0828" opacity="0.92"/>
                  {/* Snow caps */}
                  <polygon points="175,52 180,50 185,52 183,60 177,60" fill="rgba(220,200,255,0.4)"/>
                  <polygon points="55,72 60,70 65,72 63,82 57,82" fill="rgba(220,200,255,0.35)"/>
                  <polygon points="295,62 300,60 305,62 303,72 297,72" fill="rgba(220,200,255,0.3)"/>
                  {/* Lake reflection */}
                  <rect x="0" y="162" width="400" height="38" fill="#04030e" opacity="0.92"/>
                  {/* Reflection shimmer */}
                  {[[100,170],[200,175],[300,168],[150,180],[250,178]].map(([x,y],i)=>(
                    <line key={i} x1={x-15} y1={y} x2={x+15} y2={y} stroke="rgba(200,150,255,0.15)" strokeWidth="1"><animate attributeName="opacity" values="0.1;0.4;0.1" dur={`${2+i}s`} repeatCount="indefinite"/></line>
                  ))}
                  {/* Mist over lake */}
                  <rect x="0" y="158" width="400" height="10" fill="rgba(200,150,255,0.04)" filter="url(#foBlur)"/>
                  {/* Foreground ground */}
                  <rect x="0" y="185" width="400" height="15" fill="#04020c" opacity="0.98"/>
                  {/* Reed silhouettes */}
                  {[[30,185],[50,183],[360,185],[380,183]].map(([x,y],i)=>(
                    <rect key={i} x={x} y={y-20} width="2" height="20" fill="#04020c" opacity="0.9"/>
                  ))}
                </svg>
              )}

            </div>
          );
        })()}

        {/* ── Gradient overlay for text readability */}
        <div style={{position:"absolute",inset:0,zIndex:1,
          background:"linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.4) 100%)"
        }}/>

        {/* ── Card Content */}
        <div style={{position:"relative",zIndex:2,padding:"20px 22px"}}>
          {/* Top row: profile + time */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
            <div style={{
              width:54,height:54,borderRadius:17,
              background:`linear-gradient(135deg,${accent.v},${accent.g})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:28,flexShrink:0,
              boxShadow:`0 6px 24px ${accent.v}60`,
              border:`2px solid ${accent.v}90`
            }}>{(profiles.find(p=>p.id===activeProfile)||profiles[0]).icon}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:`${accent.v}dd`,letterSpacing:1.2,textTransform:"uppercase"}}>
                {(()=>{const s=greetScene==="auto"?liveHour>=5&&liveHour<12?"morning":liveHour>=12&&liveHour<18?"afternoon":liveHour>=18&&liveHour<21?"evening":"night":greetScene;return s==="morning"?"🌅 Good Morning":s==="afternoon"?"☀️ Good Afternoon":s==="evening"?"🌆 Good Evening":s==="galaxy"?"🌌 Hello, Explorer":s==="forest"?"🌿 Hello, Nature Lover":"🌙 Good Night";})()}
              </div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:21,color:"#e8eaf8",lineHeight:1.1,marginTop:2}}>
                {(profiles.find(p=>p.id===activeProfile)||profiles[0]).name}
              </div>
              <div style={{fontSize:11,color:"rgba(200,200,220,0.6)",marginTop:3}}>
                {liveHour<5?"Rest up — big things tomorrow ✨":liveHour<12?"Let's make today count! 🚀":liveHour<17?"Keep the momentum going 💪":liveHour<21?"Evening grind — finishing strong 🔥":"Wrap up your day well 🌙"}
              </div>
            </div>
            {/* Live clock */}
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,color:accent.v,lineHeight:1,letterSpacing:1.5}}>
                {String(liveHour).padStart(2,"0")}:{String(liveMin).padStart(2,"0")}
              </div>
              <div style={{fontSize:9.5,color:"rgba(180,180,210,0.6)",marginTop:3,letterSpacing:.5}}>
                {new Date().toLocaleDateString("en",{weekday:"short",month:"short",day:"numeric"})}
              </div>
            </div>
          </div>

          {/* Progress row */}
          <div style={{background:"rgba(255,255,255,.09)",borderRadius:14,padding:"11px 15px",display:"flex",alignItems:"center",gap:14,backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontSize:11,color:"rgba(180,180,210,0.7)",fontWeight:600}}>Today's Progress</span>
                <span style={{fontSize:11,fontWeight:800,color:accent.v}}>{pct}%</span>
              </div>
              <div style={{height:5,background:"rgba(255,255,255,.1)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,transition:"width .8s cubic-bezier(.34,1.56,.64,1)"}}/>
              </div>
            </div>
            <div style={{display:"flex",gap:14,flexShrink:0}}>
              {[{icon:"✅",val:doneCount,lbl:"done"},{icon:"⏳",val:activeCount,lbl:"left"},{icon:"⚠️",val:overdueCount,lbl:"late",warn:overdueCount>0}].map(s=>(
                <div key={s.lbl} style={{textAlign:"center"}}>
                  <div style={{fontSize:13,fontWeight:800,color:s.warn?"#ff6b6b":accent.v}}>{s.val}</div>
                  <div style={{fontSize:9,color:"rgba(160,160,200,0.6)"}}>{s.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Smart status */}
          {activeCount>0&&(
            <div style={{marginTop:9,fontSize:11.5,color:"rgba(220,220,240,0.85)",background:"rgba(255,255,255,.07)",borderRadius:9,padding:"7px 12px",display:"flex",alignItems:"center",gap:7,backdropFilter:"blur(8px)"}}>
              <span>{overdueCount>0?"⚠️":profileTasks.filter(x=>x.due===todayStr()&&!x.done).length>0?"📅":"✨"}</span>
              <span style={{color:"rgba(200,200,230,0.8)"}}>{overdueCount>0?`${overdueCount} overdue — tackle these first!`:profileTasks.filter(x=>x.due===todayStr()&&!x.done).length>0?`${profileTasks.filter(x=>x.due===todayStr()&&!x.done).length} due today — stay on track!`:`${activeCount} task${activeCount>1?"s":""} in progress — keep going!`}</span>
            </div>
          )}
          {activeCount===0&&doneCount>0&&(
            <div style={{marginTop:9,fontSize:12,color:"#6bcb77",background:"rgba(107,203,119,.12)",borderRadius:9,padding:"7px 12px",textAlign:"center",border:"1px solid rgba(107,203,119,.2)"}}>🎉 All tasks complete! Absolutely incredible work today!</div>
          )}
        </div>
      </div>


      {/* ☀️ Smart Daily Digest */}
      {(()=>{
        const d=getDailyDigest();
        return (
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"13px 16px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:1.2,textTransform:"uppercase",marginBottom:10}}>☀️ Daily Digest</div>
            <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.6,marginBottom:10}}>{d.suggestion}</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {d.dueToday.length>0&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(255,217,61,.15)",color:"#ffd93d",fontWeight:700,border:"1px solid rgba(255,217,61,.3)"}}>📅 {d.dueToday.length} due today</span>}
              {d.overdue.length>0&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(255,107,107,.15)",color:"var(--red)",fontWeight:700,border:"1px solid rgba(255,107,107,.3)"}}>⚠️ {d.overdue.length} overdue</span>}
              {d.completedToday.length>0&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(107,203,119,.15)",color:"#6bcb77",fontWeight:700,border:"1px solid rgba(107,203,119,.3)"}}>✅ {d.completedToday.length} done today</span>}
              {d.streak>1&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:`${accent.v}18`,color:accent.v,fontWeight:700,border:`1px solid ${accent.v}30`}}>🔥 {d.streak} day streak</span>}
              {d.avgMoodLast7&&<span style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"rgba(200,180,255,.15)",color:"#c4b5fd",fontWeight:700,border:"1px solid rgba(200,180,255,.3)"}}>😊 Mood {d.avgMoodLast7}/5</span>}
            </div>
          </div>
        );
      })()}

      {/* 🧠 Smart Deadline Suggestions */}
      {(()=>{
        const dlSuggestions = getDeadlineSuggestions();
        if(dlSuggestions.length===0) return null;
        return (
          <div style={{background:`${accent.v}10`,border:`1px solid ${accent.v}28`,borderRadius:16,padding:"13px 16px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:accent.v,letterSpacing:1.2,textTransform:"uppercase",marginBottom:10}}>🧠 Smart Deadline Insights</div>
            {dlSuggestions.map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:i<dlSuggestions.length-1?10:0,paddingBottom:i<dlSuggestions.length-1?10:0,borderBottom:i<dlSuggestions.length-1?"1px solid var(--b1)":"none"}}>
                <span style={{fontSize:18,flexShrink:0}}>{s.catIcon}</span>
                <div style={{flex:1}}>
                  <div style={{fontSize:12.5,color:"var(--t1)",fontWeight:600,marginBottom:2}}>{s.taskTitle}</div>
                  <div style={{fontSize:11.5,color:"var(--t2)",lineHeight:1.5}}>{s.suggestion}</div>
                </div>
                <button onClick={()=>{setTasks(ts=>ts.map(t=>t.id===s.taskId?{...t,due:s.newDue}:t));showNotif("📅 Deadline extended!",s.taskTitle);}} style={{flexShrink:0,height:30,padding:"0 11px",background:`${accent.v}20`,border:`1px solid ${accent.v}40`,borderRadius:9,color:accent.v,fontSize:11,fontWeight:700,cursor:"pointer"}}>+3 days</button>
              </div>
            ))}
          </div>
        );
      })()}

      {/* 😊 Mood × Productivity Insight */}
      {(()=>{
        if(moods.length<5||tasks.filter(t=>t.done).length<5) return null;
        const highMoodDays = moods.filter(m=>m.energy>=4).map(m=>m.date);
        const lowMoodDays  = moods.filter(m=>m.energy<=2).map(m=>m.date);
        if(highMoodDays.length<2||lowMoodDays.length<2) return null;
        const tasksOnHigh = tasks.filter(t=>t.done&&highMoodDays.includes(t.createdAt?new Date(t.createdAt).toISOString().slice(0,10):"")).length;
        const tasksOnLow  = tasks.filter(t=>t.done&&lowMoodDays.includes(t.createdAt?new Date(t.createdAt).toISOString().slice(0,10):"")).length;
        const highAvg = (tasksOnHigh/highMoodDays.length).toFixed(1);
        const lowAvg  = (tasksOnLow/lowMoodDays.length).toFixed(1);
        const pctDiff = lowAvg>0?Math.round(((highAvg-lowAvg)/lowAvg)*100):0;
        if(pctDiff<10) return null;
        return (
          <div style={{background:"rgba(200,180,255,.08)",border:"1px solid rgba(200,180,255,.2)",borderRadius:16,padding:"13px 16px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"#c4b5fd",letterSpacing:1.2,textTransform:"uppercase",marginBottom:8}}>😊 Mood × Productivity</div>
            <div style={{display:"flex",gap:12,marginBottom:8}}>
              <div style={{flex:1,background:"rgba(107,203,119,.1)",borderRadius:11,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:2}}>😊🤩</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:"#6bcb77"}}>{highAvg}</div>
                <div style={{fontSize:10,color:"var(--t3)",marginTop:1}}>tasks/day</div>
                <div style={{fontSize:9,color:"#6bcb77",fontWeight:700}}>GOOD MOOD</div>
              </div>
              <div style={{display:"flex",alignItems:"center",fontSize:18,color:"var(--t3)"}}>→</div>
              <div style={{flex:1,background:"rgba(255,107,107,.1)",borderRadius:11,padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:22,marginBottom:2}}>😩😔</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:"#ff6b6b"}}>{lowAvg}</div>
                <div style={{fontSize:10,color:"var(--t3)",marginTop:1}}>tasks/day</div>
                <div style={{fontSize:9,color:"#ff6b6b",fontWeight:700}}>LOW MOOD</div>
              </div>
            </div>
            <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6}}>
              You complete <strong style={{color:"#6bcb77"}}>{pctDiff}% more tasks</strong> on good mood days. 
              {pctDiff>=50?" That's a huge difference — prioritise self-care on low days.":" Small habits like exercise and sleep can close this gap."}
            </div>
          </div>
        );
      })()}



      {/* Today's Progress Bar */}
      {(()=>{
        const todayTasks = profileTasks.filter(t=>t.due===todayStr()||t.createdAt&&new Date(t.createdAt).toISOString().slice(0,10)===todayStr());
        const todayDone = todayTasks.filter(t=>t.done).length;
        const todayTotal = todayTasks.length;
        const pct2 = todayTotal>0?Math.round((todayDone/todayTotal)*100):0;
        if(todayTotal===0) return null;
        return(
          <div style={{padding:"0 16px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:11.5}}>
              <span style={{color:"var(--t2)",fontWeight:600}}>Today's progress</span>
              <span style={{color:accent.v,fontWeight:800}}>{todayDone}/{todayTotal} tasks · {pct2}%</span>
            </div>
            <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct2}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,transition:"width .6s cubic-bezier(.4,0,.2,1)",boxShadow:pct2>0?`0 0 8px ${accent.v}60`:"none"}}/>
            </div>
          </div>
        );
      })()}
      {/* == DAILY CHALLENGE == */}
      {dailyChallenge&&!challengeDone&&(
        <div style={{background:`linear-gradient(135deg,${accent.v}15,${accent.g}08)`,border:`1.5px solid ${accent.v}35`,borderRadius:16,padding:"13px 15px",marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:38,height:38,borderRadius:12,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0,boxShadow:`0 4px 14px ${accent.v}50`}}>🎯</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:10,fontWeight:800,color:accent.v,letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>Today's Challenge</div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",lineHeight:1.4}}>{dailyChallenge.text}</div>
          </div>
          <button onClick={()=>{setChallengeDone(true);awardXP(50,"Daily challenge");showNotif("🎯 Challenge complete!","50 XP earned!");fireConfetti();haptic("success");}} style={{flexShrink:0,height:32,padding:"0 12px",background:`linear-gradient(135deg,${accent.v},${accent.g})`,border:"none",borderRadius:10,color:"#fff",fontSize:11.5,fontWeight:700,cursor:"pointer"}}>Done! ✓</button>
        </div>
      )}
      {challengeDone&&(
        <div style={{background:"rgba(107,203,119,.12)",border:"1px solid rgba(107,203,119,.3)",borderRadius:14,padding:"10px 14px",marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:18}}>🎯</span>
          <span style={{fontSize:13,fontWeight:600,color:"#6bcb77",flex:1}}>Daily challenge complete! +50 XP</span>
          <span style={{fontSize:18}}>🏆</span>
        </div>
      )}

      {/* AI Top Suggestion Banner */}
      {aiSuggestions.length>0&&aiSuggestions[0]&&(
        <div onClick={()=>setShowSuggestionsPanel(true)} style={{display:"flex",alignItems:"center",gap:12,background:`${aiSuggestions[0].color}18`,border:`1px solid ${aiSuggestions[0].color}33`,borderRadius:14,padding:"11px 14px",marginBottom:14,cursor:"pointer",transition:"all .2s"}}>
          <span style={{fontSize:22}}>{aiSuggestions[0].icon}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12.5,fontWeight:700,color:aiSuggestions[0].color}}>{aiSuggestions[0].title}</div>
            <div style={{fontSize:11.5,color:"var(--t2)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{aiSuggestions[0].body}</div>
          </div>
          {aiSuggestions.length>1&&<span style={{fontSize:11,background:aiSuggestions[0].color+"22",color:aiSuggestions[0].color,fontWeight:700,padding:"2px 7px",borderRadius:20,flexShrink:0}}>+{aiSuggestions.length-1}</span>}
          <span style={{color:"var(--t3)",fontSize:14}}>›</span>
        </div>
      )}
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
          <button className="sort-btn" onClick={()=>setSort(s=>({created:"priority",priority:"due",due:"alpha",alpha:"created"}[s]))}>↕ {sort==="created"?"Recent":sort==="priority"?"Priority":sort==="due"?"Due":"A-Z"}</button>
          <button onClick={()=>{setBulkMode(m=>!m);setBulkSelected(new Set());}} style={{padding:"5px 10px",borderRadius:20,fontSize:11,fontWeight:700,border:`1.5px solid ${bulkMode?accent.v:"var(--b1)"}`,background:bulkMode?"var(--accd)":"var(--s2)",color:bulkMode?accent.v:"var(--t2)",cursor:"pointer",marginLeft:4,transition:"all .15s"}}>
            {bulkMode?"✕":"☑"}
          </button>
        </div>
      </div>
      {bulkMode&&bulkSelected.size>0&&(
        <div style={{display:"flex",gap:6,padding:"0 16px 10px"}}>
          <button onClick={bulkComplete} style={{flex:1,height:34,borderRadius:10,background:"rgba(107,203,119,.15)",border:"1px solid rgba(107,203,119,.4)",color:"#6bcb77",fontSize:12,fontWeight:700,cursor:"pointer"}}>✅ Done ({bulkSelected.size})</button>
          <button onClick={bulkStar} style={{flex:1,height:34,borderRadius:10,background:"rgba(255,211,67,.1)",border:"1px solid rgba(255,211,67,.4)",color:"#ffd93d",fontSize:12,fontWeight:700,cursor:"pointer"}}>⭐ Star</button>
          <button onClick={bulkDelete} style={{flex:1,height:34,borderRadius:10,background:"rgba(255,107,107,.12)",border:"1px solid rgba(255,107,107,.35)",color:"var(--red)",fontSize:12,fontWeight:700,cursor:"pointer"}}>🗑 Delete</button>
        </div>
      )}
      {viewTasks.length===0
        ?<div className="empty"><div className="empty-icon">{showDone?"🎉":"✦"}</div><div className="empty-t">{t.noTasks}</div><div className="empty-t" style={{fontSize:12,color:"var(--t3)"}}>{t.addFirst}</div></div>
        :<div className={viewMode==="grid"?"task-grid":"task-list"}>{viewTasks.map(task=><TaskCard key={task.id} task={task}/>)}</div>
      }
    </div>
    );
  };

  function StatsPage() {
    const now = new Date();
    const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });
    const weekData = weekDays.map(d=>({
      day:new Date(d).toLocaleDateString("en-US",{weekday:"short"}),
      date:d,
      done:profileTasks.filter(x=>x.done&&(x.due===d||(x.createdAt&&new Date(x.createdAt).toISOString().split('T')[0]===d))).length,
      added:profileTasks.filter(x=>x.createdAt&&new Date(x.createdAt).toISOString().split('T')[0]===d).length
    }));
    const maxBar = Math.max(...weekData.map(d=>d.done+d.added),1);
    const byCategory = categories.map(c=>({...c,count:profileTasks.filter(x=>!x.done&&x.categoryId===c.id).length})).filter(c=>c.count>0);
    const totalCat = byCategory.reduce((a,b)=>a+b.count,0)||1;

    // == 30-day heatmap (GitHub style) ==
    const heatDays = Array.from({length:35},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-34+i);
      const ds=d.toISOString().split("T")[0];
      const cnt = profileTasks.filter(x=>x.done&&x.createdAt&&new Date(x.createdAt).toISOString().split('T')[0]===ds).length;
      return {ds, cnt, isToday:ds===todayStr(), dow:d.getDay()};
    });
    const maxHeat = Math.max(...heatDays.map(d=>d.cnt),1);

    // == Productivity score ==
    const last7Done = weekData.reduce((a,d)=>a+d.done,0);
    const prev7Done = (() => {
      const prevDays = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-13+i); return d.toISOString().split("T")[0]; });
      return profileTasks.filter(x=>x.done&&x.createdAt&&prevDays.includes(new Date(x.createdAt).toISOString().split('T')[0])).length;
    })();
    const prodScore = Math.min(100, Math.round(
      (last7Done * 15) + (pct * 0.3) + (gamStats.streak * 2)
    ));
    const weekTrend = prev7Done===0 ? 100 : Math.round(((last7Done-prev7Done)/prev7Done)*100);

    // == Best day of week ==
    const byDow = [0,1,2,3,4,5,6].map(dow=>{
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow];
      const cnt = profileTasks.filter(x=>x.done&&x.createdAt&&new Date(x.createdAt).getDay()===dow).length;
      return {dow, dayName, cnt};
    });
    const bestDow = byDow.reduce((a,b)=>b.cnt>a.cnt?b:a, byDow[0]);
    const maxDow = Math.max(...byDow.map(d=>d.cnt),1);

    // == Most productive hour ==
    const byHour = Array.from({length:24},(_,h)=>{
      const cnt = profileTasks.filter(x=>x.done&&x.createdAt&&new Date(x.createdAt).getHours()===h).length;
      return {h, cnt, label:h===0?"12am":h<12?h+"am":h===12?"12pm":(h-12)+"pm"};
    });
    const peakHour = byHour.reduce((a,b)=>b.cnt>a.cnt?b:a, byHour[0]);
    const maxHour = Math.max(...byHour.map(h=>h.cnt),1);
    const peakHours = byHour.filter(h=>h.h>=6&&h.h<=22); // show 6am-10pm

    // == Completion streak ==
    const streakDays = Array.from({length:21},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-20+i);
      const ds=d.toISOString().split("T")[0];
      return {ds, hasDone:profileTasks.some(x=>x.done&&x.createdAt&&new Date(x.createdAt).toISOString().split('T')[0]===ds), isToday:ds===todayStr(), day:d.toLocaleDateString("en-US",{weekday:"short"})};
    });

    const scoreColor = prodScore>=80?"#6bcb77":prodScore>=50?accent.v:"#ffd93d";
    const scoreMsg = prodScore>=80?"Absolutely crushing it 🔥":prodScore>=60?"Strong performance 💪":prodScore>=40?"Building momentum ⚡":"Getting started 🌱";

    return (
      <div style={{padding:"18px 18px 100px"}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,marginBottom:18}}>{t.stats}</div>

        {/* ── Productivity Score */}
        <div style={{background:`linear-gradient(135deg,${scoreColor}15,${scoreColor}08)`,border:`1px solid ${scoreColor}35`,borderRadius:22,padding:"22px",marginBottom:14,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-30,right:-30,width:140,height:140,borderRadius:"50%",background:`${scoreColor}10`}}/>
          <div style={{display:"flex",alignItems:"center",gap:18}}>
            <div style={{position:"relative",flexShrink:0}}>
              <svg width="88" height="88" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r="36" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="8"/>
                <circle cx="44" cy="44" r="36" fill="none" stroke={scoreColor} strokeWidth="8"
                  strokeLinecap="round" strokeDasharray={226} strokeDashoffset={226*(1-prodScore/100)}
                  transform="rotate(-90 44 44)" style={{transition:"stroke-dashoffset 1s ease"}}/>
              </svg>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                <div style={{fontSize:22,fontWeight:900,color:scoreColor,lineHeight:1}}>{prodScore}</div>
                <div style={{fontSize:9,color:"var(--t3)",fontWeight:700}}>SCORE</div>
              </div>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Productivity Score</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:"var(--t1)",marginBottom:6}}>{scoreMsg}</div>
              <div style={{display:"flex",gap:14}}>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:accent.v}}>{last7Done}</div>
                  <div style={{fontSize:10,color:"var(--t3)"}}>tasks this week</div>
                </div>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:weekTrend>=0?"#6bcb77":"#ff6b6b"}}>{weekTrend>=0?"+":""}{weekTrend}%</div>
                  <div style={{fontSize:10,color:"var(--t3)"}}>vs last week</div>
                </div>
                <div>
                  <div style={{fontSize:18,fontWeight:800,color:"#ffd93d"}}>🔥{gamStats.streak||0}</div>
                  <div style={{fontSize:10,color:"var(--t3)"}}>day streak</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quick Stats Row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
          {[
            {icon:"✅",val:doneCount,  lbl:"Done",    col:"#6bcb77"},
            {icon:"⏳",val:activeCount,lbl:"Active",  col:accent.v},
            {icon:"⚠️",val:overdueCount,lbl:"Overdue",col:"#ff6b6b"},
            {icon:"📊",val:pct+"%",    lbl:"Rate",    col:accent.v},
          ].map(s=>(
            <div key={s.lbl} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 8px",textAlign:"center"}}>
              <div style={{fontSize:14}}>{s.icon}</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:s.col,lineHeight:1.1}}>{s.val}</div>
              <div style={{fontSize:10,color:"var(--t3)",marginTop:2}}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Activity Heatmap */}
        <div className="chart-card">
          <div className="chart-title">🔥 Activity Heatmap — Last 35 Days</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:8}}>
            {["S","M","T","W","T","F","S"].map((d,i)=>(
              <div key={i} style={{fontSize:9,color:"var(--t3)",textAlign:"center",fontWeight:700}}>{d}</div>
            ))}
            {heatDays.map((d,i)=>{
              const intensity = d.cnt===0?0:Math.max(0.15,d.cnt/maxHeat);
              return (
                <div key={i} title={`${d.ds}: ${d.cnt} tasks`} style={{
                  aspectRatio:"1",borderRadius:5,cursor:"default",transition:"transform .1s",
                  background:d.cnt===0?(d.isToday?`${accent.v}25`:"var(--s2)"):`${accent.v}`,
                  opacity:d.cnt===0?1:0.2+intensity*0.8,
                  border:d.isToday?`2px solid ${accent.v}`:"2px solid transparent",
                  boxShadow:d.cnt>0?`0 2px 6px ${accent.v}40`:"none",
                }}/>
              );
            })}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",fontSize:10,color:"var(--t3)"}}>
            <span>Less</span>
            {[0.15,0.4,0.65,0.9].map((o,i)=>(
              <div key={i} style={{width:12,height:12,borderRadius:3,background:accent.v,opacity:o}}/>
            ))}
            <span>More</span>
          </div>
        </div>

        {/* ── Weekly Bar Chart */}
        <div className="chart-card">
          <div className="chart-title">📅 This Week — Daily Tasks</div>
          <div className="bar-chart">
            {weekData.map((d,i)=>(
              <div key={i} className="bar-col">
                <div className="bar-val">{d.done||""}</div>
                <div style={{width:"100%",display:"flex",flexDirection:"column",gap:2,alignItems:"center"}}>
                  <div className="bar" style={{height:`${(d.done/maxBar)*80+4}px`,background:`linear-gradient(180deg,${accent.v},${accent.g})`,width:"100%",borderRadius:"4px 4px 0 0"}}/>
                </div>
                <div className="bar-lbl" style={{color:d.date===todayStr()?accent.v:"var(--t3)",fontWeight:d.date===todayStr()?800:400}}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Best Day of Week */}
        <div className="chart-card">
          <div className="chart-title">📆 Best Day of Week</div>
          <div style={{display:"flex",gap:6,alignItems:"flex-end",height:70,marginBottom:8}}>
            {byDow.map(d=>(
              <div key={d.dow} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{fontSize:9,color:d.dow===bestDow.dow?accent.v:"var(--t3)",fontWeight:800}}>{d.cnt||""}</div>
                <div style={{width:"100%",borderRadius:"4px 4px 0 0",background:d.dow===bestDow.dow?`linear-gradient(180deg,${accent.v},${accent.g})`:"var(--s3)",height:`${Math.max((d.cnt/maxDow)*50,4)}px`,transition:"height .5s ease"}}/>
                <div style={{fontSize:9,color:d.dow===bestDow.dow?accent.v:"var(--t3)",fontWeight:d.dow===bestDow.dow?800:400}}>{d.dayName}</div>
              </div>
            ))}
          </div>
          {bestDow.cnt>0&&<div style={{fontSize:12,color:"var(--t2)",textAlign:"center"}}>You're most productive on <strong style={{color:accent.v}}>{bestDow.dayName}days</strong> 🏆</div>}
        </div>

        {/* ── Peak Hour Chart */}
        <div className="chart-card">
          <div className="chart-title">⏰ Most Productive Hour</div>
          <div style={{display:"flex",gap:2,alignItems:"flex-end",height:60,marginBottom:8,overflowX:"auto"}}>
            {peakHours.map(h=>(
              <div key={h.h} style={{flex:1,minWidth:18,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                <div style={{width:"100%",borderRadius:"3px 3px 0 0",background:h.h===peakHour.h?`linear-gradient(180deg,${accent.v},${accent.g})`:h.cnt>0?"var(--s4)":"var(--s2)",height:`${Math.max((h.cnt/maxHour)*48,3)}px`,transition:"height .5s ease"}}/>
                <div style={{fontSize:7,color:h.h===peakHour.h?accent.v:"var(--t3)",fontWeight:h.h===peakHour.h?800:400,whiteSpace:"nowrap"}}>{h.h%3===0?h.label:""}</div>
              </div>
            ))}
          </div>
          {peakHour.cnt>0&&<div style={{fontSize:12,color:"var(--t2)",textAlign:"center"}}>Peak productivity at <strong style={{color:accent.v}}>{peakHour.label}</strong> — that's your golden hour! ⚡</div>}
        </div>

        {/* ── Category Breakdown */}
        <div className="chart-card">
          <div className="chart-title">📁 {t.byCategory}</div>
          {byCategory.length===0&&<div style={{fontSize:12,color:"var(--t3)",textAlign:"center",padding:"16px 0"}}>Add tasks with categories to see breakdown</div>}
          {byCategory.map(c=>(
            <div key={c.id} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:13,color:"var(--t1)"}}>{c.icon} {c.name}</span>
                <span style={{fontSize:12,fontWeight:700,color:c.color}}>{c.count} · {Math.round((c.count/totalCat)*100)}%</span>
              </div>
              <div style={{height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(c.count/totalCat)*100}%`,background:c.color,borderRadius:3,transition:"width .6s ease"}}/>
              </div>
            </div>
          ))}
        </div>

        {/* ── Priority Distribution */}
        <div className="chart-card">
          <div className="chart-title">🎯 Priority Distribution</div>
          <div style={{display:"flex",gap:10}}>
            {Object.entries(PRIORITIES).map(([k,v])=>{ const cnt=profileTasks.filter(x=>x.priority===k&&!x.done).length; return (
              <div key={k} style={{flex:1,background:v.bg,borderRadius:13,padding:"14px 10px",textAlign:"center",border:`1px solid ${v.color}28`}}>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:v.color}}>{cnt}</div>
                <div style={{fontSize:11,color:v.color,marginTop:2,fontWeight:700}}>{v.label}</div>
              </div>
            );})}
          </div>
        </div>

        {/* ── 21-day Streak Calendar */}
        <div className="chart-card">
          <div className="chart-title">🔥 21-Day Streak Calendar</div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {streakDays.map((d,i)=>(
              <div key={i} title={d.ds} style={{
                width:32,height:32,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:10,fontWeight:700,cursor:"default",transition:"transform .1s",
                background:d.hasDone?`linear-gradient(135deg,${accent.v},${accent.g})`:(d.isToday?"var(--accd)":"var(--s2)"),
                color:d.hasDone?"#fff":(d.isToday?accent.v:"var(--t3)"),
                border:d.isToday?`2px solid ${accent.v}`:"2px solid transparent",
                boxShadow:d.hasDone?`0 3px 8px ${accent.v}50`:"none",
              }}>
                {d.hasDone?"✓":d.isToday?"•":d.day[0]}
              </div>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--t3)"}}>✓ = tasks completed · Current streak: <strong style={{color:accent.v}}>🔥 {gamStats.streak||0} days</strong></div>
        </div>

        {/* ── LIBI Insight */}
        <div style={{background:`linear-gradient(135deg,${accent.v}15,${accent.v}08)`,border:`1px solid ${accent.v}30`,borderRadius:16,padding:"16px",marginBottom:14}}>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:36,height:36,borderRadius:11,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🤖</div>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:accent.v,marginBottom:4}}>LIBI's Analysis</div>
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.65}}>
                {prodScore>=80?`You're in the top tier this week with ${last7Done} tasks done! ${bestDow.cnt>0?`Your strongest day is ${bestDow.dayName}.`:""} ${peakHour.cnt>0?`Peak focus at ${peakHour.label}.`:""} Keep this momentum! 🏆`:
                 prodScore>=50?`Good week — ${last7Done} tasks done. ${weekTrend>=0?`Up ${weekTrend}% from last week!`:`Down ${Math.abs(weekTrend)}% vs last week — you got this.`} ${bestDow.cnt>0?`${bestDow.dayName}s are your best day.`:""}`:
                 `${last7Done>0?`You completed ${last7Done} tasks this week — good start!`:"No tasks completed yet this week."} ${overdueCount>0?`Clear ${overdueCount} overdue task${overdueCount>1?"s":""} to boost your score.`:""} Every task counts! 💪`}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };


  function CalendarPage() {
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
          <div style={{display:"flex",gap:8,marginBottom:10}}>
            <button onClick={()=>{setForm({...blankForm,due:selDate,profileId:activeProfile});setTagInput("");setSubInput("");setEditTaskObj(null);setShowTaskModal(true);play("tap");haptic("light");}} style={{display:"flex",alignItems:"center",gap:6,height:36,padding:"0 14px",background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:11,fontSize:12.5,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",boxShadow:`0 4px 14px ${accent.v}40`}}>
              ＋ Add task on this day
            </button>
            {selTasks.length>0&&<span style={{fontSize:11,color:"var(--t3)",alignSelf:"center"}}>{selTasks.length} task{selTasks.length!==1?"s":""}</span>}
          </div>
          {selTasks.length===0
            ?<div style={{textAlign:"center",padding:"20px 0",color:"var(--t3)"}}>
              <div style={{fontSize:28,marginBottom:6}}>📭</div>
              <div style={{fontSize:12.5}}>No tasks — tap the button above to add one!</div>
            </div>
            :<div className="task-list">{selTasks.map(task=><TaskCard key={task.id} task={task}/>)}</div>
          }
        </div>
      </div>
    );
  };

  function SettingsPage() { return (
    <div className="settings-page">
      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:16}}>{t.settings}</div>
      {/* Account section */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Account</div>
      <div className="settings-section" style={{marginBottom:16}}>
        {authUser?(
          <div className="settings-row">
            {authUser.photo?<img src={authUser.photo} alt="" style={{width:36,height:36,borderRadius:10,objectFit:"cover",flexShrink:0}}/>:<div className="settings-icon">👤</div>}
            <div className="settings-label">
              <div className="settings-title">{authUser.name}</div>
              <div className="settings-sub">{authUser.email} · {authUser.provider==="google.com"?"Google account":"Email account"}</div>
            </div>
            <button onClick={signOut} style={{padding:"6px 12px",borderRadius:9,background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.25)",color:"var(--red)",fontSize:11,fontWeight:700,cursor:"pointer"}}>Sign Out</button>
          </div>
        ):(
          <div className="settings-row" onClick={()=>setShowAuthScreen(true)} style={{cursor:"pointer"}}>
            <div className="settings-icon">🔓</div>
            <div className="settings-label">
              <div className="settings-title">Sign in with Google</div>
              <div className="settings-sub">Sync tasks across devices</div>
            </div>
            <span style={{fontSize:12,color:accent.v,fontWeight:700}}>Sign In ›</span>
          </div>
        )}
      </div>
      {/* Appearance */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Appearance</div>
      <div className="settings-section">
        <div className="settings-row" onClick={()=>setDark(d=>!d)}>
          <div className="settings-icon">🌙</div>
          <div className="settings-label"><div className="settings-title">{t.darkMode}</div><div className="settings-sub">Switch between dark & light</div></div>
          <div className={`toggle theme-toggle ${dark?"on":""}`} onClick={e=>{e.stopPropagation();setDark(d=>!d);}}><div className="toggle-knob"/></div>
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
          {/* ── Greeting Card Settings */}
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10,marginTop:16}}>🌅 Greeting Card Scene</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:16}}>
            {[
              {id:"auto",      label:"Auto 🕐",     preview:"linear-gradient(135deg,#000008,#7c6dfa,#ffd580)"},
              {id:"morning",   label:"Morning 🌅",  preview:"linear-gradient(135deg,#0a0510,#3d1f6e,#ffd580)"},
              {id:"afternoon", label:"Afternoon ☀️", preview:"linear-gradient(135deg,#030a1a,#1565c0,#f4d060)"},
              {id:"evening",   label:"Evening 🌆",  preview:"linear-gradient(135deg,#050210,#6b1a3a,#ff8030)"},
              {id:"night",     label:"Night 🌙",    preview:"linear-gradient(135deg,#000008,#0a0020,#7c6dfa)"},
              {id:"galaxy",    label:"Galaxy 🌌",   preview:"linear-gradient(135deg,#000008,#1e0050,#a855f7,#f472b6)"},
              {id:"forest",    label:"Forest 🌿",   preview:"linear-gradient(135deg,#020a04,#0d5228,#4ade80)"},
              {id:"ocean",     label:"Ocean 🌊",    preview:"linear-gradient(135deg,#000d1a,#003366,#1a8ccc)"},
              {id:"sakura",    label:"Sakura 🌸",   preview:"linear-gradient(135deg,#0d0010,#6b1060,#ffc8d8)"},
              {id:"northern",  label:"Aurora 🌠",   preview:"linear-gradient(135deg,#000005,#001033,#40ff80)"},
              {id:"volcano",   label:"Volcano 🌋",  preview:"linear-gradient(135deg,#020000,#4a0800,#ff6600)"},
              {id:"dawn",      label:"Dawn 🌄",     preview:"linear-gradient(135deg,#000208,#08103a,#e09040)"},
            ].map(s=>(
              <div key={s.id} onClick={()=>{setGreetScene(s.id);play("tap");}} style={{cursor:"pointer",borderRadius:10,border:`2px solid ${greetScene===s.id?"var(--acc)":"var(--b1)"}`,overflow:"hidden",transition:"all .15s",transform:greetScene===s.id?"scale(1.04)":"scale(1)"}}>
                <div style={{height:36,background:s.preview,borderRadius:7}}/>
                <div style={{fontSize:8.5,textAlign:"center",color:greetScene===s.id?"var(--acc)":"var(--t3)",fontWeight:600,padding:"3px 2px"}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>✨ Card Glow Color</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
            {[
              {id:"default",color:"linear-gradient(135deg,#7c6dfa,#a855f7)",label:"Auto"},
              {id:"purple", color:"#a855f7",label:"Purple"},
              {id:"gold",   color:"#f59e0b",label:"Gold"},
              {id:"blue",   color:"#3b82f6",label:"Blue"},
              {id:"green",  color:"#6bcb77",label:"Green"},
              {id:"red",    color:"#ff6b6b",label:"Red"},
              {id:"pink",   color:"#f472b6",label:"Pink"},
              {id:"white",  color:"rgba(255,255,255,.6)",label:"White"},
            ].map(c=>(
              <div key={c.id} onClick={()=>{setGreetAccent(c.id);play("tap");}} title={c.label} style={{
                width:28,height:28,borderRadius:"50%",background:c.color,cursor:"pointer",
                border:`3px solid ${greetAccent===c.id?"var(--t1)":"transparent"}`,
                transform:greetAccent===c.id?"scale(1.2)":"scale(1)",
                transition:"all .15s",
                boxShadow:greetAccent===c.id?`0 4px 12px ${c.color}80`:""
              }}/>
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

      {/* Integrations */}
      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,paddingLeft:4}}>Integrations</div>
      <div className="settings-section" style={{marginBottom:16}}>
        <div className="settings-row" onClick={exportToPDF} style={{cursor:"pointer"}}>
          <div className="settings-icon">📄</div>
          <div className="settings-label">
            <div className="settings-title">Export to PDF</div>
            <div className="settings-sub">Weekly report of your tasks &amp; progress</div>
          </div>
          <span style={{fontSize:12,color:"var(--t3)"}}>›</span>
        </div>
        <div className="settings-row" onClick={()=>sendEmailDigest()} style={{cursor:"pointer"}}>
          <div className="settings-icon">📧</div>
          <div className="settings-label">
            <div className="settings-title">Email Weekly Digest</div>
            <div className="settings-sub">Send your week summary to your email</div>
          </div>
          <span style={{fontSize:12,color:"var(--t3)"}}>›</span>
        </div>
        <div className="settings-row" onClick={()=>setShowICSModal(true)} style={{cursor:"pointer"}}>
          <div className="settings-icon">📅</div>
          <div className="settings-label">
            <div className="settings-title">Import Google Calendar</div>
            <div className="settings-sub">Import .ics file — events become tasks</div>
          </div>
          <span style={{fontSize:12,color:"var(--t3)"}}>›</span>
        </div>


        <div className="settings-row" onClick={()=>{ if(isInstalled){showNotif("✅ Already installed!","Taskflow is running as an installed app");}else if(pwaPrompt){installPWA();}else{showNotif("📲 How to install on mobile","Tap your browser menu → 'Add to Home Screen'");showNotif("💻 How to install on PC","Look for the ⊕ icon in Chrome's address bar, or go to Menu → Install Taskflow");} }} style={{cursor:"pointer"}}>
          <div className="settings-icon">📲</div>
          <div className="settings-label"><div className="settings-title">Install App</div><div className="settings-sub">Add Taskflow to your home screen</div></div>
          <span style={{fontSize:12,color:accent.v,fontWeight:700}}>Install ›</span>
        </div>
        {/* Google Sign In from settings */}
        <div className="settings-row" onClick={authUser?signOut:signInWithGoogle} style={{cursor:"pointer"}}>
          <div className="settings-icon">
            <svg width="18" height="18" viewBox="0 0 18 18" style={{verticalAlign:"middle"}}>
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
          </div>
          <div className="settings-label">
            <div className="settings-title">{authUser?"Signed in as Google":"Sign in with Google"}</div>
            <div className="settings-sub">{authUser?authUser.email:"Sync tasks across devices via collaboration"}</div>
          </div>
          <span style={{fontSize:12,color:authUser?"#6bcb77":"var(--t3)",fontWeight:700}}>{authUser?"✓ Connected":"Connect ›"}</span>
        </div>
      </div>

      {/* ── Legal footer ── */}
      <div style={{marginTop:24,paddingTop:16,borderTop:"1px solid var(--b1)",textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,flexWrap:"wrap",marginBottom:8}}>
          <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--t3)",textDecoration:"underline",padding:0}}>Privacy Policy</button>
          <span style={{color:"var(--b1)"}}>·</span>
          <button onClick={()=>setShowPrivacy(true)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:"var(--t3)",textDecoration:"underline",padding:0}}>Terms of Service</button>
          <span style={{color:"var(--b1)"}}>·</span>
          <span style={{fontSize:12,color:"var(--t3)"}}>© 2026 Taskflow · LIBI Labs</span>
        </div>
        <div style={{fontSize:10,color:"var(--t3)",opacity:.6}}>v2.0 · Built with ♥ · taskflow-ultimate.netlify.app</div>
      </div>

    </div>
  );
  }


  function ProfilesPage() { return (
    <div style={{padding:"20px 18px 90px"}}>
      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,marginBottom:16}}>{t.profiles}</div>
      {/* Google account card */}
      {authUser&&(
        <div style={{background:`linear-gradient(135deg,${accent.v}12,${accent.g}06)`,border:`1.5px solid ${accent.v}30`,borderRadius:18,padding:"14px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
          {authUser.photo
            ?<img src={authUser.photo} alt="" style={{width:44,height:44,borderRadius:14,objectFit:"cover",border:`2px solid ${accent.v}50`,flexShrink:0}}/>
            :<div style={{width:44,height:44,borderRadius:14,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>👤</div>
          }
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:800,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser.name}</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{authUser.email}</div>
            <div style={{fontSize:10,color:accent.v,fontWeight:700,marginTop:2}}>✅ Signed in with {authUser.provider==="google.com"?"Google":"Email"}</div>
          </div>
          <button onClick={signOut} style={{padding:"7px 12px",borderRadius:10,background:"rgba(255,107,107,.12)",border:"1px solid rgba(255,107,107,.3)",color:"var(--red)",fontSize:11.5,fontWeight:700,cursor:"pointer",flexShrink:0}}>Sign Out</button>
        </div>
      )}
      {!authUser&&!guestMode&&(
        <div style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:28}}>🔓</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:2}}>Not signed in</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>Sign in with Google to sync across devices</div>
          </div>
          <button onClick={()=>setShowAuthScreen(true)} style={{padding:"7px 12px",borderRadius:10,background:`linear-gradient(135deg,${accent.v},${accent.g})`,border:"none",color:"#fff",fontSize:11.5,fontWeight:700,cursor:"pointer",flexShrink:0,boxShadow:`0 3px 12px ${accent.v}50`}}>Sign In</button>
        </div>
      )}
      {guestMode&&(
        <div style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 16px",marginBottom:18,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:28}}>👤</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",marginBottom:2}}>Guest mode</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>Data saved locally only. Sign in to sync.</div>
          </div>
          <button onClick={()=>setShowAuthScreen(true)} style={{padding:"7px 12px",borderRadius:10,background:`linear-gradient(135deg,${accent.v},${accent.g})`,border:"none",color:"#fff",fontSize:11.5,fontWeight:700,cursor:"pointer",flexShrink:0}}>Sign In</button>
        </div>
      )}
      <div className="prof-grid">
        {profiles.map(p=>(
          <div key={p.id} style={{position:"relative"}}>
            <div className={`prof-card ${activeProfile===p.id?"on":""}`} onClick={()=>{if(editProfileId!==p.id){try{localStorage.setItem("tf_xp_"+activeProfile,JSON.stringify(xp));localStorage.setItem("tf_badges_"+activeProfile,JSON.stringify(earnedBadges));localStorage.setItem("tf_moods_"+activeProfile,JSON.stringify(moods));}catch{}try{const nx=localStorage.getItem("tf_xp_"+p.id);const nb=localStorage.getItem("tf_badges_"+p.id);const nm=localStorage.getItem("tf_moods_"+p.id);setXp(nx?JSON.parse(nx):0);setEarnedBadges(nb?JSON.parse(nb):[]);setMoods(nm?JSON.parse(nm):[]);setTodayMood(null);}catch{}setActiveProfile(p.id);play("tap");setTab("tasks");}}}>
              <div className="prof-avatar" onClick={e=>{e.stopPropagation();setShowAvatarPicker(v=>v===p.id?null:p.id);}} style={{cursor:"pointer",position:"relative"}} title="Tap to change photo">
                {p.icon}
                <div style={{position:"absolute",bottom:-2,right:-2,width:14,height:14,borderRadius:"50%",background:accent.v,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff",fontWeight:800}}>✎</div>
              </div>
              {showAvatarPicker===p.id&&(
                <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",zIndex:100,background:"var(--s1)",border:`1px solid ${accent.v}40`,borderRadius:16,padding:10,boxShadow:`0 8px 32px rgba(0,0,0,.4)`,width:200,display:"flex",flexWrap:"wrap",gap:4,justifyContent:"center"}}>
                  <div style={{width:"100%",fontSize:9,fontWeight:800,color:"var(--t3)",textAlign:"center",marginBottom:4,letterSpacing:1}}>PICK AN AVATAR</div>
                  {["👤","🧑","👩","👨","🧒","👧","👦","🧔","👩‍💻","👨‍💻","🧑‍🎨","👩‍🎤","🦊","🐱","🐶","🦁","🐼","🦋","🌟","🚀","🎯","💎","🔥","⚡","🌈","🎭","🏆","👑"].map(em=>(
                    <div key={em} onClick={()=>{setProfiles(ps=>ps.map(x=>x.id===p.id?{...x,icon:em}:x));setShowAvatarPicker(null);play("tap");showNotif("✅ Avatar updated!","");}} style={{width:32,height:32,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,cursor:"pointer",background:p.icon===em?"var(--accd)":"var(--s2)",border:p.icon===em?`1.5px solid ${accent.v}`:"1px solid transparent",transition:"all .1s"}}>
                      {em}
                    </div>
                  ))}
                  <button onClick={()=>setShowAvatarPicker(null)} style={{width:"100%",marginTop:4,height:26,borderRadius:8,background:"var(--s3)",border:"none",color:"var(--t3)",fontSize:11,cursor:"pointer"}}>Close</button>
                </div>
              )}
              {editProfileId===p.id
                ? <div style={{display:"flex",gap:6,alignItems:"center",width:"100%",marginTop:4}} onClick={e=>e.stopPropagation()}>
                    <input autoFocus value={editProfileName} onChange={e=>setEditProfileName(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter"){setProfiles(ps=>ps.map(x=>x.id===p.id?{...x,name:editProfileName.trim()||x.name}:x));setEditProfileId(null);showNotif("✅ Name updated!","");play("add");}if(e.key==="Escape")setEditProfileId(null);}}
                      style={{flex:1,fontSize:13,fontWeight:700,background:"var(--s3)",border:"1.5px solid var(--acc)",borderRadius:8,padding:"4px 8px",color:"var(--t1)",outline:"none",minWidth:0}}/>
                    <button onClick={()=>{setProfiles(ps=>ps.map(x=>x.id===p.id?{...x,name:editProfileName.trim()||x.name}:x));setEditProfileId(null);showNotif("✅ Name updated!","");play("add");}} style={{fontSize:16,background:"none",border:"none",cursor:"pointer",color:"#6bcb77"}}>✓</button>
                    <button onClick={()=>setEditProfileId(null)} style={{fontSize:14,background:"none",border:"none",cursor:"pointer",color:"var(--t3)"}}>✕</button>
                  </div>
                : <div className="prof-name" style={{display:"flex",alignItems:"center",gap:5}}>
                    {p.name}
                    <span onClick={e=>{e.stopPropagation();setEditProfileId(p.id);setEditProfileName(p.name);}} style={{fontSize:10,opacity:.5,cursor:"pointer",flexShrink:0}} title="Edit name">✎</span>
                  </div>
              }
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
  };

  // == Pomodoro State ==
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
            haptic("success");
            fireConfetti();
            const m = POMO_MODES[pomoMode];
            showNotif(`🍅 ${m.label} Done!`, pomoMode==="focus"?"Great focus! Take a break 🎉":"Break over — back to work!");
            // Play alarm tone
            try { playAlarmTone("gentle"); } catch(e){}
            if(pomoMode==="focus"){
              setPomoTotal(t=>t+1);
              setPomoMinsToday(t=>t+25);
              setPomoSession(s=>s>=3?0:s+1);
              awardXP(25,"Focus session");
              const msgs=["Great focus! Keep it up! 🔥","Building deep work habits! 💪","One step closer to your goals! 🏆","Flow state achieved! ⚡","Consistency is your superpower! 🌟"];
              setTimeout(()=>showNotif("💬 LIBI",msgs[Math.floor(Math.random()*msgs.length)]),2000);
            }
            return POMO_MODES[pomoMode].mins*60;
          }
          return s-1;
        });
      },1000);
    } else { clearInterval(pomoRef.current); }
    return ()=>clearInterval(pomoRef.current);
  },[pomoRunning,pomoMode]);

  function switchPomoMode(m) { setPomoMode(m); setPomoSecs(POMO_MODES[m].mins*60); setPomoRunning(false); };

  function resetPomo() { setPomoSecs(POMO_MODES[pomoMode].mins*60); setPomoRunning(false); };


  function PomoPage() {
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

  // == REAL Firebase Collaboration State ==
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

  // == Auth State ==
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInited, setAuthInited] = useState(false);
  const [showAuthScreen, setShowAuthScreen] = useState(()=>!localStorage.getItem("tf_guest")&&!localStorage.getItem("tf_uid"));
  const [guestMode, setGuestMode] = useState(()=>!!localStorage.getItem("tf_guest"));

  async function initAuth() {
    if (authInited) return;
    setAuthInited(true);
    try {
      const fb = await getFirebase();
      if (!fb) return;
      fb.auth.onAuthStateChanged(user => {
        if(user){
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
          if(user.displayName){
            const firstName = user.displayName.split(" ")[0];
            setUserName(firstName);
            localStorage.setItem("tf_username", firstName);
          }
        } else {
          setAuthUser(null);
          localStorage.removeItem("tf_uid");
        }
      });
    } catch(e) { console.error(e); }
  }

  useEffect(() => {
    // Pre-load Firebase scripts in background immediately
    getFirebase().then(fb=>{
      if(fb){
        fb.auth.onAuthStateChanged(user=>{
          if(user){
            const u={uid:user.uid,email:user.email,name:user.displayName||user.email.split("@")[0],photo:user.photoURL||null,provider:user.providerData?.[0]?.providerId||"password"};
            setAuthUser(u);
            setShowAuthScreen(false);
            setGuestMode(false);
            localStorage.setItem("tf_uid",user.uid);
            localStorage.removeItem("tf_guest");
            if(user.displayName){const fn=user.displayName.split(" ")[0];setUserName(fn);localStorage.setItem("tf_username",fn);}
          } else {
            setAuthUser(null);
            localStorage.removeItem("tf_uid");
          }
          setAuthInited(true);
        });
      }
    }).catch(()=>{});
  }, []); // Pre-warm Firebase + restore session on start
  useEffect(() => { if (tab === "collab") initAuth(); }, [tab]);

  async function signIn() {
    setAuthLoading(true); setAuthError("");
    try {
      const fb = await getFirebase();
      if (!fb) throw new Error("Firebase unavailable — check your connection!");
      await fb.auth.signInWithEmailAndPassword(authEmail, authPassword);
      showNotif("✅ Signed in!", authEmail); play("complete");
    } catch(e) {
      setAuthError(e.code==="auth/user-not-found"?"No account found":e.code==="auth/wrong-password"?"Wrong password":e.code==="auth/invalid-email"?"Invalid email format":e.message);
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
      showNotif("🎉 Welcome!", user.displayName||user.email);
      play("complete"); haptic("success");
      // Save name to LIBI memory
      if(user.displayName) {
        setLibiMemory(m=>({...m, name:user.displayName.split(" ")[0],
          facts:[...new Set([...m.facts, `My name is ${user.displayName.split(" ")[0]}`])]}));
      }
    } catch(e) {
      if(e.code==="auth/popup-closed-by-user") setAuthError("Sign-in cancelled — please try again");
      else if(e.code==="auth/popup-blocked") setAuthError("Popup blocked! Please allow popups for this site in your browser settings, then try again.");
      else if(e.message?.includes("unavailable")||e.message?.includes("Firebase")) setAuthError("Could not connect to Google. Check your internet connection and try again.");
      else setAuthError(e.message||"Sign-in failed. Please try again.");
    } finally { setAuthLoading(false); }
  };

  async function signUp() {
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

  async function signOut() {
    try {
      const fb = await getFirebase();
      if (fb) await fb.auth.signOut();
      setAuthUser(null); leaveRoom();
      localStorage.removeItem("tf_uid");
      showNotif("👋 Signed out","See you next time!");
    } catch(e) {}
  };
  function continueAsGuest() {
    localStorage.setItem("tf_guest","1");
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

  function leaveRoom() {

    if (collabUnsub.current) collabUnsub.current();
    setActiveRoomCode(null);
    setSharedTasks([]);
    setCollabStatus("idle");
    showNotif("👋 Left room","Disconnected from shared list");
  };

  async function addSharedTask(titleOverride) {
    const title = (titleOverride || newSharedTitle).trim();
    if (!title || !activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").add({
        title, addedBy: myName||"Anonymous",
        done: false, priority: "medium", createdAt: Date.now(),
      });
      setNewSharedTitle(""); play("add");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  async function toggleSharedTask(task) {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({...task,done:!task.done});
      play(task.done?"tap":"complete");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  async function deleteSharedTask(taskId) {
    if (!activeRoomCode) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(taskId).delete();
      play("delete");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  async function editSharedTask(task, newTitle) {
    if (!activeRoomCode || !newTitle.trim()) return;
    try {
      const db = await getDB(); if (!db) return;
      await db.collection("rooms").doc(activeRoomCode).collection("tasks").doc(task.id).set({...task,title:newTitle.trim()});
      setEditingSharedId(null); play("tap");
    } catch(err) { showNotif("❌ Error",err.message); }
  };

  async function shareMyTasks() {
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
  useEffect(()=>()=>{
    if(boardUnsubRef.current.col) try{boardUnsubRef.current.col();}catch(e){}
    if(boardUnsubRef.current.card) try{boardUnsubRef.current.card();}catch(e){}
  },[]);

  const statusColors = {idle:"var(--t3)",connecting:"#ffd93d",connected:"#6bcb77",error:"#ff6b6b"};
  const statusLabels = {idle:"Not connected",connecting:"Connecting…",connected:"🟢 Live — syncing in real time",error:"❌ Connection failed"};

  function CollabPage() {
    const emailRef = useRef(null);
    const passRef = useRef(null);
    const nameRef = useRef(null);
    const joinRef = useRef(null);
    const newTaskRef = useRef(null);

    function handleSignIn() {
      setAuthEmail(emailRef.current?.value||"");
      setAuthPassword(passRef.current?.value||"");
      setTimeout(()=>signIn(),50);
    };
    function handleSignUp() {
      setMyName(nameRef.current?.value||"Me");
      setAuthEmail(emailRef.current?.value||"");
      setAuthPassword(passRef.current?.value||"");
      setTimeout(()=>signUp(),50);
    };
    function handleJoin() {
      const code = joinRef.current?.value||"";
      setJoinCode(code);
      setTimeout(()=>joinRoom(code),50);
    };
    function handleAddTask() {
      const title = newTaskRef.current?.value||"";
      if(!title.trim()) return;
      if(newTaskRef.current) newTaskRef.current.value="";
      addSharedTask(title);
    };

    // == Sign-in wall ==
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
              <input ref={nameRef} className="f-in" placeholder="e.g. Your name" defaultValue={myName} autoComplete="off" autoCorrect="off" spellCheck="false"/>
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
          <button onClick={authMode==="signin"?handleSignIn:handleSignUp} style={{width:"100%",height:46,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:13,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",opacity:authLoading?0.6:1,transition:"all .2s",marginBottom:10}}>
            {authLoading?"Please wait…":authMode==="signin"?"Sign In →":"Create Account →"}
          </button>
          {/* ── OR divider */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
            <div style={{flex:1,height:1,background:"var(--b1)"}}/>
            <span style={{fontSize:11,color:"var(--t3)",fontWeight:600}}>OR</span>
            <div style={{flex:1,height:1,background:"var(--b1)"}}/>
          </div>
          {/* ── Google Sign-In */}
          <button onClick={signInWithGoogle} disabled={authLoading}
            style={{width:"100%",height:46,background:"#fff",borderRadius:13,fontSize:14,fontWeight:600,
              color:"#1a1a1a",border:"1.5px solid #e0e0e0",cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",gap:10,
              opacity:authLoading?0.6:1,transition:"all .2s",
              boxShadow:"0 2px 8px rgba(0,0,0,0.08)"}}>
            {/* Google G logo SVG */}
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
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
              <div key={task.id} style={{
                display:"flex",alignItems:"flex-start",gap:10,
                padding:"12px 0",borderBottom:"1px solid var(--b1)",
                background:task.assignedTo===myName?"var(--accd)":"transparent",
                borderRadius:task.assignedTo===myName?8:0,
                paddingLeft:task.assignedTo===myName?8:0,
                transition:"all .2s"
              }}>
                <div className={`chk ${task.done?"on":""}`} style={{flexShrink:0,marginTop:2}} onClick={()=>toggleSharedTask(task)}>
                  {task.done&&<span style={{color:"#fff",fontSize:10,fontWeight:800}}>✓</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,textDecoration:task.done?"line-through":"none",color:task.done?"var(--t3)":"var(--t1)",marginBottom:3}}>{task.title}</div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10,color:"var(--t3)"}}>by {task.addedBy}</span>
                    {task.assignedTo&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:task.assignedTo===myName?`${accent.v}25`:"var(--s3)",color:task.assignedTo===myName?accent.v:"var(--t3)",fontWeight:600}}>→ {task.assignedTo}</span>}
                    {task.priority&&<span style={{fontSize:10,color:task.priority==="high"?"#ff6b6b":task.priority==="medium"?"#ffd93d":"#6bcb77",fontWeight:700}}>{task.priority==="high"?"🔴":task.priority==="medium"?"🟡":"🟢"}</span>}
                    {task.dueDate&&<span style={{fontSize:10,color:"var(--t3)"}}>📅 {task.dueDate}</span>}
                  </div>
                  {task.comment&&<div style={{fontSize:11,color:"var(--t2)",marginTop:4,fontStyle:"italic",background:"var(--s2)",padding:"4px 8px",borderRadius:7}}>💬 {task.comment}</div>}
                </div>
                <div style={{display:"flex",gap:4,flexShrink:0}}>
                  <button onClick={()=>{
                    const assignee = prompt("Assign to (enter name):",task.assignedTo||"");
                    if(assignee!==null) toggleSharedTask({...task,assignedTo:assignee.trim()||null});
                  }} style={{fontSize:11,color:"var(--t3)",padding:"3px 7px",background:"var(--s2)",borderRadius:7,border:"none",cursor:"pointer"}} title="Assign">👤</button>
                  <button onClick={()=>deleteSharedTask(task.id)} style={{fontSize:11,color:"var(--t3)",padding:"3px 7px",background:"var(--s2)",borderRadius:7,border:"none",cursor:"pointer"}}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };


  // ==========================================
  //  GOALS & MILESTONES
  // ==========================================
  const [goals, setGoals] = useState(()=>{try{const s=localStorage.getItem("tf_goals");return s?JSON.parse(s):[];}catch(e){return [];}});
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [goalForm, setGoalForm] = useState({title:"",icon:"🎯",color:"#7c6dfa",deadline:"",milestones:[]});
  const [goalMilestoneInput, setGoalMilestoneInput] = useState("");
  const GOAL_ICONS = ["🎯","🚀","💪","📚","💰","🏠","🎨","✈️","🏆","❤️","🌟","🎵","🏋️","💡","🌿","⚡"];
  const GOAL_COLORS = ["#7c6dfa","#6bcb77","#ffd93d","#ff6b6b","#00d4aa","#f589a3","#ff9f43","#48dbfb","#d47cff"];

  const toggleMilestone = (goalId, mId) => setGoals(gs=>gs.map(g=>g.id===goalId?{...g,milestones:g.milestones.map(m=>m.id===mId?{...m,done:!m.done}:m)}:g));
  function saveGoal() {

    if(!goalForm.title.trim()) return;
    function doSave() {
      if(editGoal) setGoals(gs=>gs.map(g=>g.id===editGoal.id?{...g,...goalForm}:g));
      else setGoals(gs=>[{id:uid(),...goalForm,profileId:activeProfile},  ...gs]);
      setShowGoalModal(false); setEditGoal(null); play("add");
      showNotif("🏆 Goal saved!", goalForm.title);
    };
    if(editGoal) doSave(); else doSave();
  };
  function deleteGoal(id) { setGoals(gs=>gs.filter(g=>g.id!==id)); play("delete"); };


  function GoalsPage() {
    const profileGoals = goals.filter(g=>!g.profileId||g.profileId===activeProfile);
    return (
    <div style={{padding:"18px 18px 90px"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>🏆 Goals</div>
          <div style={{fontSize:12.5,color:"var(--t3)",marginTop:2}}>{profileGoals.length} goals · {profileGoals.reduce((a,g)=>a+g.milestones.filter(m=>m.done).length,0)} milestones done</div>
        </div>
        <button style={{height:38,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",boxShadow:"0 4px 14px var(--glow)"}} onClick={()=>{setGoalForm({title:"",icon:"🎯",color:"#7c6dfa",deadline:"",milestones:[]});setGoalMilestoneInput("");setEditGoal(null);setShowGoalModal(true);}}>+ New Goal</button>
      </div>

      {profileGoals.length===0&&<div className="empty"><div className="empty-icon">🏆</div><div className="empty-t">No goals yet!</div><div style={{fontSize:12.5,color:"var(--t3)"}}>Tap + to set your first goal</div></div>}

      {profileGoals.map(goal=>{
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
  };

  // ==========================================
  //  HABIT TRACKER
  // ==========================================
  const DAYS_LABELS = ["S","M","T","W","T","F","S"];
  const getLast14Days = () => Array.from({length:14},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-13+i); return d.toISOString().split("T")[0]; });
  const getLast7Days = () => Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-6+i); return d.toISOString().split("T")[0]; });

  const [habits, setHabits] = useState(()=>{try{const s=localStorage.getItem("tf_habits");return s?JSON.parse(s):[];}catch(e){return [];}});
  const [showHabitModal, setShowHabitModal] = useState(false);
  const [habitForm, setHabitForm] = useState({name:"",icon:"⭐",color:"#7c6dfa",freq:"daily"});
  const FREQ_OPTS = [{id:"daily",label:"Every Day"},{id:"weekdays",label:"Weekdays"},{id:"weekly",label:"Weekly"},{id:"3x",label:"3× Week"}];
  const HABIT_ICONS = ["🏃","📚","💧","🧘","📵","💪","🥗","😴","✍️","🎵","🙏","🌿","☀️","🚶","🍎","⭐","🔥","💊","🧹","📝"];

  function toggleHabit(habitId, date) {

    setHabits(hs=>hs.map(h=>h.id===habitId?{...h,completions:{...h.completions,[date]:!h.completions[date]}}:h));
    play("tap");
  };
  function getStreak(habit) {

    let streak=0; const d=new Date();
    while(true){ const ds=d.toISOString().split("T")[0]; if(!habit.completions[ds]) break; streak++; d.setDate(d.getDate()-1); }
    return streak;
  };
  function getBestStreak(habit) {

    const dates = Object.keys(habit.completions).filter(k=>habit.completions[k]).sort();
    if(!dates.length) return 0;
    let best=1,cur=1;
    for(let i=1;i<dates.length;i++){
      const diff=(new Date(dates[i])-new Date(dates[i-1]))/(1000*60*60*24);
      if(diff===1){cur++;best=Math.max(best,cur);}else{cur=1;}
    }
    return best;
  };
  function saveHabit() {

    if(!habitForm.name.trim()) return;
    setHabits(hs=>[{id:uid(),...habitForm,completions:{},profileId:activeProfile}, ...hs]);
    setShowHabitModal(false); play("add");
    showNotif("🔁 Habit added!", habitForm.name);
  };
  function deleteHabit(id) { setHabits(hs=>hs.filter(h=>h.id!==id)); play("delete"); };


  function HabitsPage() {
    const profileHabits = habits.filter(h=>!h.profileId||h.profileId===activeProfile);
    const last14 = getLast14Days();
    const last7 = getLast7Days();
    const totalDoneToday = profileHabits.filter(h=>h.completions[todayStr()]).length;
    const allDoneToday = profileHabits.length>0 && totalDoneToday===profileHabits.length;
    return (
      <div style={{padding:"18px 18px 90px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22}}>🔁 Habits</div>
            <div style={{fontSize:12.5,color:"var(--t3)",marginTop:2}}>{profileHabits.length} habits tracked</div>
          </div>
          <button style={{height:38,padding:"0 14px",background:"var(--acc)",borderRadius:11,fontSize:13,fontWeight:700,color:"#fff",boxShadow:"0 4px 14px var(--glow)"}} onClick={()=>{setHabitForm({name:"",icon:"⭐",color:"#7c6dfa",freq:"daily"});setShowHabitModal(true);}}>+ New Habit</button>
        </div>

        {/* Today summary card */}
        <div style={{background:allDoneToday?`linear-gradient(135deg,${accent.v}22,${accent.g}11)`:"var(--s1)",border:`1px solid ${allDoneToday?accent.v+"44":"var(--b1)"}`,borderRadius:14,padding:"14px 16px",marginBottom:16,marginTop:10,display:"flex",alignItems:"center",gap:14}}>
          <div style={{fontSize:36}}>{allDoneToday?"🔥":"📅"}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{allDoneToday?"Perfect day! All done! 🎉":"Today's Progress"}</div>
            <div style={{fontSize:12.5,color:"var(--t3)"}}>{totalDoneToday} of {profileHabits.length} habits completed today</div>
            <div style={{height:5,background:"var(--s3)",borderRadius:3,overflow:"hidden",marginTop:8}}>
              <div style={{height:"100%",width:`${profileHabits.length?(totalDoneToday/profileHabits.length)*100:0}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,transition:"width .5s ease"}}/>
            </div>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:accent.v}}>{profileHabits.length?Math.round((totalDoneToday/profileHabits.length)*100):0}%</div>
            <div style={{fontSize:10,color:"var(--t3)"}}>done</div>
          </div>
        </div>

        {profileHabits.length===0&&<div className="empty"><div className="empty-icon">🔁</div><div className="empty-t">No habits yet!</div><div style={{fontSize:12.5,color:"var(--t3)"}}>Tap + to track your first habit</div></div>}

        {/* Habit cards */}
        {profileHabits.map(habit=>{
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

  // ==========================================
  //  SMART DAILY PLANNER
  // ==========================================
  const TIME_BLOCKS = [
    {id:"morning",label:"Morning",icon:"🌅",time:"6:00 - 12:00",color:"#ffd93d"},
    {id:"afternoon",label:"Afternoon",icon:"☀️",time:"12:00 - 17:00",color:"#ff9f43"},
    {id:"evening",label:"Evening",icon:"🌆",time:"17:00 - 21:00",color:"#7c6dfa"},
    {id:"night",label:"Night",icon:"🌙",time:"21:00 - 24:00",color:"#48dbfb"},
  ];
  const [plannerDate, setPlannerDate] = useState(todayStr());
  const [plannedTasks, setPlannedTasks] = useState({}); // {taskId: blockId}
  const [plannerDone, setPlannerDone] = useState({}); // {taskId: bool}
  const [showPlannerPicker, setShowPlannerPicker] = useState(null); // blockId we're adding to

  // Auto-schedule: assigns tasks to blocks by priority & due date, skipping past blocks
  function autoSchedule() {

    const unscheduled = profileTasks.filter(t=>!t.done);
    const byPriority = [...unscheduled].sort((a,b)=>{const o={high:0,medium:1,low:2};return o[a.priority]-o[b.priority];});
    const slots = {morning:[],afternoon:[],evening:[],night:[]};
    const caps = {morning:3,afternoon:3,evening:2,night:1};
    const newPlan = {};
    const isToday = plannerDate === todayStr();
    const curHour = new Date().getHours();
    // Determine which blocks are still available (not in the past)
    const blockAvailable = {
      morning:  !isToday || curHour < 12,
      afternoon:!isToday || curHour < 17,
      evening:  !isToday || curHour < 21,
      night:    !isToday || curHour < 24,
    };
    // Helper to assign to first available block
    function assign(taskId, preferred) {
      const order = preferred==="morning"
        ? ["morning","afternoon","evening","night"]
        : preferred==="afternoon"
        ? ["afternoon","evening","night","morning"]
        : preferred==="evening"
        ? ["evening","night","afternoon","morning"]
        : ["night","evening","afternoon","morning"];
      for(const b of order){
        if(blockAvailable[b] && slots[b].length < caps[b]){
          slots[b].push(taskId); newPlan[taskId]=b; return;
        }
      }
      // All full -- just put in first available
      for(const b of ["morning","afternoon","evening","night"]){
        if(slots[b].length < caps[b]){ slots[b].push(taskId); newPlan[taskId]=b; return; }
      }
    };
    byPriority.forEach(task=>{
      if(task.due===plannerDate || task.priority==="high") assign(task.id,"morning");
      else if(task.priority==="medium") assign(task.id,"afternoon");
      else assign(task.id,"evening");
    });
    setPlannedTasks(newPlan);
    setPlannerDone({});
    play("add");
    showNotif("📅 Plan ready!",`${Object.keys(newPlan).length} tasks scheduled`);
  };

  function assignToBlock(taskId, blockId) {

    setPlannedTasks(p=>({...p,[taskId]:blockId}));
    setShowPlannerPicker(null); play("tap");
  };
  const removeFromPlan = (taskId) => setPlannedTasks(p=>{const n={...p};delete n[taskId];return n;});
  function togglePlannerDone(taskId) {

    const nowDone = !plannerDone[taskId];
    setPlannerDone(d=>({...d,[taskId]:nowDone}));
    // Sync to main task list
    setTasks(ts=>ts.map(t=>t.id===taskId?{...t,done:nowDone}:t));
    play(nowDone?"complete":"tap");
    if(nowDone){ awardXP(20,"Planner task done"); haptic("success"); showNotif("✅ Task completed!","Synced to your task list"); }
  };


  // == FINANCE PAGE ==
  const FINANCE_CATS = [
    {id:"food",      icon:"🍔", label:"Food",       color:"#ff6b6b"},
    {id:"transport", icon:"🚗", label:"Transport",   color:"#ffd93d"},
    {id:"shopping",  icon:"🛍", label:"Shopping",    color:"#a855f7"},
    {id:"bills",     icon:"📱", label:"Bills",       color:"#48dbfb"},
    {id:"health",    icon:"💊", label:"Health",      color:"#6bcb77"},
    {id:"entertain", icon:"🎬", label:"Fun",         color:"#ff9f43"},
    {id:"education", icon:"📚", label:"Education",   color:"#7c6dfa"},
    {id:"savings",   icon:"🏦", label:"Savings",     color:"#00d4aa"},
    {id:"salary",    icon:"💼", label:"Income",      color:"#6bcb77"},
    {id:"debt",      icon:"💳", label:"Debt/Loan",   color:"#ff6b6b"},
    {id:"other",     icon:"💸", label:"Other",       color:"#9090a0"},
  ];

  function FinancePage() {
    const now = new Date();
    const periodFilter = (f) => {
      const d = new Date(f.date||f.createdAt||Date.now());
      if(financePeriod==="week") { const w=new Date(); w.setDate(w.getDate()-7); return d>=w; }
      if(financePeriod==="month") return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
      if(financePeriod==="year") return d.getFullYear()===now.getFullYear();
      return true;
    };
    const profileFinances = finances.filter(f=>!f.profileId||f.profileId===activeProfile);
    const filtered = profileFinances.filter(periodFilter);
    const totalIncome  = filtered.filter(f=>f.type==="income").reduce((a,f)=>a+Number(f.amount),0);
    const totalExpense = filtered.filter(f=>f.type==="expense").reduce((a,f)=>a+Number(f.amount),0);
    const balance = totalIncome - totalExpense;
    const byCategory = FINANCE_CATS.map(c=>({
      ...c,
      total: filtered.filter(f=>f.category===c.id&&f.type==="expense").reduce((a,f)=>a+Number(f.amount),0)
    })).filter(c=>c.total>0).sort((a,b)=>b.total-a.total);
    const savingsRate = totalIncome>0 ? Math.round((balance/totalIncome)*100) : 0;
    const maxCat = Math.max(...byCategory.map(c=>c.total),1);

    return (
      <div style={{padding:"18px 18px 100px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24}}>💰 Finance</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>Track income & expenses</div>
          </div>
          <button onClick={()=>{setFinanceForm({type:"expense",amount:"",category:"food",note:"",date:new Date().toISOString().slice(0,10)});setShowFinanceModal(true);}} style={{height:40,padding:"0 18px",background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",boxShadow:`0 4px 14px ${accent.v}40`}}>+ Add</button>
        </div>

        {/* Main Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:14,background:"var(--s2)",borderRadius:12,padding:4}}>
          {[["overview","📊 Overview"],["transactions","📋 Transactions"],["debt","💳 Debt Tracker"]].map(([k,l])=>(
            <div key={k} onClick={()=>setFinanceTab(k)} style={{flex:1,textAlign:"center",padding:"9px 4px",borderRadius:9,fontSize:11.5,fontWeight:700,cursor:"pointer",background:financeTab===k?`linear-gradient(135deg,${accent.v},${accent.g})`:"transparent",color:financeTab===k?"#fff":"var(--t3)",transition:"all .2s"}}>{l}</div>
          ))}
        </div>

        {/* Period Picker - only on overview */}
        {financeTab==="overview"&&<div style={{display:"flex",gap:6,marginBottom:18,background:"var(--s2)",borderRadius:12,padding:4}}>
          {[["week","Week"],["month","Month"],["year","Year"],["all","All"]].map(([k,l])=>(
            <div key={k} onClick={()=>setFinancePeriod(k)} style={{flex:1,textAlign:"center",padding:"8px 0",borderRadius:9,fontSize:12,fontWeight:700,cursor:"pointer",background:financePeriod===k?`linear-gradient(135deg,${accent.v},${accent.g})`:"transparent",color:financePeriod===k?"#fff":"var(--t3)",transition:"all .2s"}}>{l}</div>
          ))}
        </div>}

        {/* Balance Card */}
        <div style={{background:`linear-gradient(135deg,${balance>=0?"#0a2a1a":"#2a0a0a"},${balance>=0?"#0d3520":"#3a0d0d"})`,border:`1px solid ${balance>=0?"rgba(107,203,119,.3)":"rgba(255,107,107,.3)"}`,borderRadius:20,padding:"20px 22px",marginBottom:14,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-20,right:-20,width:120,height:120,borderRadius:"50%",background:balance>=0?"rgba(107,203,119,.08)":"rgba(255,107,107,.08)"}}/>
          <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{financePeriod==="week"?"This Week":financePeriod==="month"?"This Month":financePeriod==="year"?"This Year":"All Time"} Balance</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:36,color:balance>=0?"#6bcb77":"#ff6b6b",letterSpacing:-1,marginBottom:14}}>
            {balance>=0?"+":""}{balance.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}
          </div>
          <div style={{display:"flex",gap:24}}>
            <div>
              <div style={{fontSize:10,color:"rgba(107,203,119,.7)",fontWeight:700,marginBottom:2}}>↑ INCOME</div>
              <div style={{fontSize:16,fontWeight:800,color:"#6bcb77"}}>{totalIncome.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:"rgba(255,107,107,.7)",fontWeight:700,marginBottom:2}}>↓ EXPENSES</div>
              <div style={{fontSize:16,fontWeight:800,color:"#ff6b6b"}}>{totalExpense.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            </div>
            <div>
              <div style={{fontSize:10,color:`${accent.v}cc`,fontWeight:700,marginBottom:2}}>💰 SAVED</div>
              <div style={{fontSize:16,fontWeight:800,color:accent.v}}>{savingsRate}%</div>
            </div>
          </div>
        </div>

        {/* LIBI Finance Insight */}
        <div style={{background:`linear-gradient(135deg,${accent.v}15,${accent.v}08)`,border:`1px solid ${accent.v}30`,borderRadius:16,padding:"13px 16px",marginBottom:14,display:"flex",gap:10,alignItems:"flex-start"}}>
          <div style={{width:32,height:32,borderRadius:10,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🤖</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:accent.v,marginBottom:3}}>LIBI says</div>
            <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.6}}>
              {totalExpense===0?"No expenses recorded yet — tap + to add your first transaction! 💸":
               savingsRate>=30?`Amazing! You're saving ${savingsRate}% of income. That's better than 80% of people! 🏆`:
               savingsRate>=10?`You're saving ${savingsRate}% — decent! Aim for 20%+ for financial freedom 🎯`:
               balance<0?`You spent ${Math.abs(balance).toFixed(2)} more than you earned. Time to cut back on ${byCategory[0]?.label||"expenses"} 📊`:
               `Your biggest expense is ${byCategory[0]?.icon||""} ${byCategory[0]?.label||"unknown"} at ${byCategory[0]?.total.toFixed(2)}. Track more to see insights! 💡`}
            </div>
          </div>
        </div>

        {/* Spending by Category */}
        {byCategory.length>0&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"16px 18px",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>Spending Breakdown</div>
            {byCategory.map(c=>(
              <div key={c.id} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,color:"var(--t1)",display:"flex",alignItems:"center",gap:6}}><span>{c.icon}</span>{c.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:"var(--t1)"}}>{c.total.toLocaleString("en",{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                </div>
                <div style={{height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(c.total/maxCat)*100}%`,background:c.color,borderRadius:3,transition:"width .6s ease"}}/>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TRANSACTIONS TAB */}
        {financeTab==="transactions"&&(
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"16px 18px"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>All Transactions ({profileFinances.length})</div>
            {/* Search/filter */}
            <input placeholder="🔍 Search transactions…" style={{width:"100%",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:10,padding:"9px 12px",fontSize:13,color:"var(--t1)",outline:"none",marginBottom:12,fontFamily:"inherit",boxSizing:"border-box"}}
              onChange={e=>{
                const q=e.target.value.toLowerCase();
                e.target._q=q;
                e.target.parentNode.querySelectorAll('.tx-row').forEach(r=>{
                  r.style.display=q&&!r.dataset.search?.includes(q)?'none':'';
                });
              }}/>
            {profileFinances.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--t3)",fontSize:13}}>No transactions yet — tap + to add one!</div>}
            {[...profileFinances].reverse().map(f=>{
              const cat = FINANCE_CATS.find(c=>c.id===f.category)||FINANCE_CATS[11];
              return (
                <div key={f.id} className="tx-row" data-search={`${f.note||""} ${cat.label} ${f.date}`.toLowerCase()} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--b1)"}}>
                  <div style={{width:38,height:38,borderRadius:12,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.note||cat.label}</div>
                    <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{f.date} · {cat.label}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{fontSize:14,fontWeight:800,color:f.type==="income"?"#6bcb77":"#ff6b6b"}}>{f.type==="income"?"+":"-"}{Number(f.amount).toFixed(2)}</div>
                  </div>
                  <button onClick={()=>setFinances(fs=>fs.filter(x=>x.id!==f.id))} style={{background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"4px",opacity:.5,flexShrink:0}}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DEBT TRACKER TAB */}
        {financeTab==="debt"&&(
          <div>
            {/* Summary */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.2)",borderRadius:16,padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#ff6b6b",marginBottom:4}}>YOU OWE</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#ff6b6b"}}>
                  {debts.filter(d=>d.type==="owe"&&!d.paid).reduce((a,d)=>a+Number(d.amount),0).toFixed(2)}
                </div>
              </div>
              <div style={{background:"rgba(107,203,119,.1)",border:"1px solid rgba(107,203,119,.2)",borderRadius:16,padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#6bcb77",marginBottom:4}}>OWED TO YOU</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#6bcb77"}}>
                  {debts.filter(d=>d.type==="lent"&&!d.paid).reduce((a,d)=>a+Number(d.amount),0).toFixed(2)}
                </div>
              </div>
            </div>
            <button onClick={()=>{setDebtForm({name:"",amount:"",type:"owe",dueDate:"",note:""});setShowDebtModal(true);}}
              style={{width:"100%",height:44,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:13,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",marginBottom:14}}>
              + Add Debt / Loan
            </button>
            {debts.length===0&&<div style={{textAlign:"center",padding:"32px 0",color:"var(--t3)",fontSize:13}}>No debts recorded 🎉</div>}
            {debts.map(d=>(
              <div key={d.id} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",marginBottom:8,borderRadius:14,background:d.paid?"var(--s1)":d.type==="owe"?"rgba(255,107,107,.08)":"rgba(107,203,119,.08)",border:`1px solid ${d.paid?"var(--b1)":d.type==="owe"?"rgba(255,107,107,.2)":"rgba(107,203,119,.2)"}`,opacity:d.paid?0.6:1}}>
                <div style={{width:40,height:40,borderRadius:12,background:d.type==="owe"?"rgba(255,107,107,.2)":"rgba(107,203,119,.2)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                  {d.type==="owe"?"💳":"💰"}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>{d.name}</div>
                  <div style={{fontSize:11,color:"var(--t3)"}}>{d.type==="owe"?"You owe":"They owe you"}{d.dueDate?` · Due ${d.dueDate}`:""}</div>
                  {d.note&&<div style={{fontSize:11,color:"var(--t3)",fontStyle:"italic"}}>{d.note}</div>}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:16,fontWeight:800,color:d.type==="owe"?"#ff6b6b":"#6bcb77"}}>{d.type==="owe"?"-":"+"}{Number(d.amount).toFixed(2)}</div>
                  <button onClick={()=>setDebts(ds=>ds.map(x=>x.id===d.id?{...x,paid:!x.paid}:x))} style={{fontSize:10,padding:"3px 8px",borderRadius:8,background:d.paid?"var(--s2)":`${accent.v}22`,border:`1px solid ${d.paid?"var(--b1)":accent.v}`,color:d.paid?"var(--t3)":accent.v,cursor:"pointer",marginTop:4,fontFamily:"inherit"}}>
                    {d.paid?"↩ Unpaid":"✓ Mark Paid"}
                  </button>
                </div>
                <button onClick={()=>setDebts(ds=>ds.filter(x=>x.id!==d.id))} style={{background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"4px",flexShrink:0}}>✕</button>
              </div>
            ))}

            {/* Debt Modal */}
            {showDebtModal&&(
              <div className="overlay" onClick={()=>setShowDebtModal(false)}>
                <div className="modal" onClick={e=>e.stopPropagation()}>
                  <div className="drag"/>
                  <div className="m-head">
                    <div className="m-title">💳 Add Debt / Loan</div>
                    <button className="ic-btn" onClick={()=>setShowDebtModal(false)}>✕</button>
                  </div>
                  <div style={{padding:"0 18px 28px",display:"flex",flexDirection:"column",gap:14}}>
                    <div style={{display:"flex",gap:8,background:"var(--s2)",borderRadius:12,padding:4}}>
                      {[["owe","💳 I Owe"],["lent","💰 They Owe Me"]].map(([k,l])=>(
                        <div key={k} onClick={()=>setDebtForm(f=>({...f,type:k}))} style={{flex:1,textAlign:"center",padding:"9px 0",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",background:debtForm.type===k?`linear-gradient(135deg,${accent.v},${accent.g})`:"transparent",color:debtForm.type===k?"#fff":"var(--t3)",transition:"all .2s"}}>{l}</div>
                      ))}
                    </div>
                    <div><div className="f-lbl">Person / Organization</div><input className="f-in" placeholder="e.g. John, Bank loan, Credit card" value={debtForm.name} onChange={e=>setDebtForm(f=>({...f,name:e.target.value}))}/></div>
                    <div><div className="f-lbl">Amount</div><input className="f-in" type="number" placeholder="0.00" value={debtForm.amount} onChange={e=>setDebtForm(f=>({...f,amount:e.target.value}))} style={{fontSize:20,fontWeight:800,textAlign:"center"}}/></div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <div><div className="f-lbl">Due Date</div><input className="f-in" type="date" value={debtForm.dueDate} onChange={e=>setDebtForm(f=>({...f,dueDate:e.target.value}))}/></div>
                      <div><div className="f-lbl">Note</div><input className="f-in" placeholder="Optional" value={debtForm.note} onChange={e=>setDebtForm(f=>({...f,note:e.target.value}))}/></div>
                    </div>
                    <button onClick={()=>{
                      if(!debtForm.name.trim()||!debtForm.amount) return;
                      setDebts(ds=>[...ds,{id:uid(),profileId:activeProfile,paid:false,createdAt:Date.now(),...debtForm,amount:Math.abs(Number(debtForm.amount))}]);
                      setShowDebtModal(false); play("add"); haptic("success");
                      showNotif(debtForm.type==="owe"?"💳 Debt added":"💰 Loan recorded",`${debtForm.name} · ${debtForm.amount}`);
                    }} style={{height:48,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:14,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>Save</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Transactions (overview tab only) */}
        {financeTab==="overview"&&<div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"16px 18px"}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>Recent Transactions</div>
          {filtered.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"var(--t3)",fontSize:13}}>No transactions yet — tap + to add one!</div>}
          {[...filtered].reverse().slice(0,10).map(f=>{
            const cat = FINANCE_CATS.find(c=>c.id===f.category)||FINANCE_CATS[11];
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--b1)"}}>
                <div style={{width:38,height:38,borderRadius:12,background:cat.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>{cat.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.note||cat.label}</div>
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{f.date} · {cat.label}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:f.type==="income"?"#6bcb77":"#ff6b6b"}}>{f.type==="income"?"+":"-"}{Number(f.amount).toFixed(2)}</div>
                </div>
                <button onClick={()=>setFinances(fs=>fs.filter(x=>x.id!==f.id))} style={{background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:14,padding:"4px",opacity:.5,flexShrink:0}}>✕</button>
              </div>
            );
          })}
          {profileFinances.length>10&&<div style={{textAlign:"center",padding:"10px 0",fontSize:12,color:accent.v,cursor:"pointer"}} onClick={()=>setFinanceTab("transactions")}>View all {profileFinances.length} transactions →</div>}
        </div>}

        {/* Finance Modal */}
        {showFinanceModal&&(
          <div className="overlay" onClick={()=>setShowFinanceModal(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="drag"/>
              <div className="m-head">
                <div className="m-title">💰 {financeForm.type==="income"?"Add Income":"Add Expense"}</div>
                <button className="ic-btn" onClick={()=>setShowFinanceModal(false)}>✕</button>
              </div>
              <div style={{padding:"0 18px 28px",display:"flex",flexDirection:"column",gap:14}}>
                {/* Type */}
                <div style={{display:"flex",gap:8,background:"var(--s2)",borderRadius:12,padding:4}}>
                  {[["expense","↓ Expense","#ff6b6b"],["income","↑ Income","#6bcb77"]].map(([k,l,c])=>(
                    <div key={k} onClick={()=>setFinanceForm(f=>({...f,type:k}))} style={{flex:1,textAlign:"center",padding:"9px 0",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer",background:financeForm.type===k?c:"transparent",color:financeForm.type===k?"#fff":"var(--t3)",transition:"all .2s"}}>{l}</div>
                  ))}
                </div>
                {/* Amount */}
                <div>
                  <div className="f-lbl">Amount</div>
                  <input className="f-in" type="number" placeholder="0.00" value={financeForm.amount} onChange={e=>setFinanceForm(f=>({...f,amount:e.target.value}))} style={{fontSize:22,fontWeight:800,textAlign:"center"}}/>
                </div>
                {/* Category */}
                <div>
                  <div className="f-lbl">Category</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7}}>
                    {FINANCE_CATS.map(c=>(
                      <div key={c.id} onClick={()=>setFinanceForm(f=>({...f,category:c.id}))} style={{padding:"8px 4px",borderRadius:11,border:`2px solid ${financeForm.category===c.id?c.color:"var(--b1)"}`,background:financeForm.category===c.id?c.color+"20":"var(--s2)",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                        <div style={{fontSize:20}}>{c.icon}</div>
                        <div style={{fontSize:8,color:financeForm.category===c.id?c.color:"var(--t3)",fontWeight:600,marginTop:2}}>{c.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Note & Date */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                  <div>
                    <div className="f-lbl">Note (optional)</div>
                    <input className="f-in" placeholder="What was this for?" value={financeForm.note} onChange={e=>setFinanceForm(f=>({...f,note:e.target.value}))}/>
                  </div>
                  <div>
                    <div className="f-lbl">Date</div>
                    <input className="f-in" type="date" value={financeForm.date} onChange={e=>setFinanceForm(f=>({...f,date:e.target.value}))}/>
                  </div>
                </div>
                <button onClick={()=>{
                  if(!financeForm.amount||isNaN(Number(financeForm.amount))) return;
                  setFinances(fs=>[...fs,{id:uid(),profileId:activeProfile,createdAt:Date.now(),...financeForm,amount:Math.abs(Number(financeForm.amount))}]);
                  setShowFinanceModal(false);
                  play("add"); awardXP(5,"Finance logged"); haptic("success");
                  showNotif(financeForm.type==="income"?"💰 Income added!":"💸 Expense logged!",`${financeForm.amount} · ${FINANCE_CATS.find(c=>c.id===financeForm.category)?.label}`);
                }} style={{height:48,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:14,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",boxShadow:`0 6px 20px ${accent.v}40`}}>
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


  //  PROJECT BOARD -- Kanban / Roadmap (Firebase Realtime)
  // ======================================================
  const DEFAULT_COLUMNS = [
    {id:"backlog",  title:"💡 Backlog",   color:"#7c8ff5"},
    {id:"todo",     title:"📋 To Do",     color:"#ffd93d"},
    {id:"progress", title:"⚡ In Progress",color:"#ff9f43"},
    {id:"review",   title:"🔍 Review",    color:"#d47cff"},
    {id:"done",     title:"✅ Done",      color:"#6bcb77"},
  ];
  const CARD_COLORS = ["#7c6dfa","#6bcb77","#ffd93d","#ff6b6b","#ff9f43","#48dbfb","#d47cff","#f589a3","#00d4aa","#7c8ff5"];
  const CARD_LABELS = ["Feature","Bug","Design","Research","Urgent","Backend","Frontend","Marketing","Planning","Review"];

  const [boardColumns, setBoardColumns]   = useState(()=>{try{const s=localStorage.getItem("tf_boardcols");return s?JSON.parse(s):DEFAULT_COLUMNS;}catch{return DEFAULT_COLUMNS;}});
  const [boardCards,   setBoardCards]     = useState(()=>{try{const s=localStorage.getItem("tf_boardcards");return s?JSON.parse(s):[];}catch{return [];}});
  
  // == Finance Tracker ==
  const [finances,setFinances] = useState(()=>{try{const s=localStorage.getItem("tf_finances");return s?JSON.parse(s):[];}catch{return [];}});
  const [financeForm,setFinanceForm] = useState({type:"expense",amount:"",category:"food",note:"",date:new Date().toISOString().slice(0,10)});
  const [showFinanceModal,setShowFinanceModal] = useState(false);
  const [financePeriod,setFinancePeriod] = useState("month");
  const [financeTab,setFinanceTab] = useState("overview");
  const [debts,setDebts] = useState(()=>{try{const s=localStorage.getItem("tf_debts");return s?JSON.parse(s):[];}catch{return [];}});
  const [debtForm,setDebtForm] = useState({name:"",amount:"",type:"owe",dueDate:"",note:""});
  const [showDebtModal,setShowDebtModal] = useState(false);
  useEffect(()=>{try{localStorage.setItem("tf_finances",JSON.stringify(finances));}catch{}}, [finances]);
  useEffect(()=>{try{localStorage.setItem("tf_debts",JSON.stringify(debts));}catch{}}, [debts]);
    const [boardSyncing,    setBoardSyncing]    = useState(false);
  const [boardRoomCode,   setBoardRoomCode]   = useState("");
  const [boardConnected,  setBoardConnected]  = useState(false);
  const boardUnsubRef = useRef({col:null,card:null});
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
  const [notifPermission, setNotifPermission] = useState(()=>{try{return Notification?.permission||"default";}catch{return "default";}});
  const [showShareModal,  setShowShareModal]  = useState(false);
  const [appIconEmoji,    setAppIconEmoji]    = useState(()=>localStorage.getItem("tf_icon")||"✦");
  const [appIconColor,    setAppIconColor]    = useState(()=>localStorage.getItem("tf_iconcolor")||"");
  const [showIconDesigner,setShowIconDesigner]= useState(false);
  const [shareStats,      setShareStats]      = useState(null);
  const [showEisenhower,  setShowEisenhower]  = useState(false);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [greetScene,      setGreetScene]      = useState(()=>localStorage.getItem("tf_greet_scene")||"galaxy");
  const [greetCardBg,     setGreetCardBg]     = useState(()=>localStorage.getItem("tf_greet_bg")||"scene");
  const [greetAccent,     setGreetAccent]     = useState(()=>localStorage.getItem("tf_greet_accent")||"purple");
  const [isListening,     setIsListening]     = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [darkAnimating,   setDarkAnimating]   = useState(false);
  const [streakMilestone, setStreakMilestone] = useState(null);
  const [webSearchInput,  setWebSearchInput]  = useState("");
  const [showWebSearch,   setShowWebSearch]   = useState(false);
    const [showMoreMenu,    setShowMoreMenu]    = useState(false);
  const [notes,           setNotes]           = useState(()=>{try{const s=localStorage.getItem("tf_notes");return s?JSON.parse(s):[];}catch(e){return [];}});
  const [showNoteModal,   setShowNoteModal]   = useState(false);
  const [editNote,        setEditNote]        = useState(null);
  const [noteForm,        setNoteForm]        = useState({title:"",body:"",color:"#7c6dfa",pinned:false,category:"general",tags:[]});
  const [noteTagInput,    setNoteTagInput]    = useState("");
  const [noteSearch,      setNoteSearch]      = useState("");
  const [noteView,        setNoteView]        = useState("grid"); // "grid" | "list"
  const [noteFilter,      setNoteFilter]      = useState("all"); // "all"|"pinned"|category
  const [wallpaper,       setWallpaper]       = useState(()=>{try{return localStorage.getItem("tf_wallpaper")||"galaxy";}catch(e){return "galaxy";}});
  const isForest = wallpaper==="forest" || accent.v==="#4ade80";
  const isGalaxy  = wallpaper==="galaxy" || wallpaper==="nebula" || wallpaper==="none" || accent.v==="#c084fc";

  const [showAiModal,     setShowAiModal]     = useState(false);
  const [aiInput,         setAiInput]         = useState("");
  const [aiLoading,       setAiLoading]       = useState(false);
  const [aiTasks,         setAiTasks]         = useState([]);
  const [aiSelected,      setAiSelected]      = useState([]);
  const [moods,           setMoods]           = useState(()=>{try{const s=localStorage.getItem("tf_moods");return s?JSON.parse(s):[];}catch(e){return [];}});
  const [showMoodModal,   setShowMoodModal]   = useState(false);
  const [todayMood,       setTodayMood]       = useState(null);

  // == Board Firebase sync ==
  async function connectBoard(code) {
    if (!code.trim()) return;
    setBoardSyncing(true);
    // Always clean up existing subscriptions first
    if (boardUnsubRef.current.col) { try { boardUnsubRef.current.col(); } catch(e){} boardUnsubRef.current.col = null; }
    if (boardUnsubRef.current.card) { try { boardUnsubRef.current.card(); } catch(e){} boardUnsubRef.current.card = null; }
    try {
      const db = await getDB(); if (!db) throw new Error("Firebase unavailable in preview");
      const room = code.trim().toUpperCase();
      const colRef = db.collection("boards").doc(room).collection("columns");
      const cardRef = db.collection("boards").doc(room).collection("cards");
      // Push local data only if room is brand new (no columns)
      const snap = await colRef.get();
      if (snap.empty) {
        for (const col of boardColumns) await colRef.doc(col.id).set(col);
        for (const card of boardCards)  await cardRef.doc(card.id).set(card);
      }
      // Subscribe with live listeners -- always fresh
      const unsubCol  = colRef.onSnapshot(s  => { setBoardColumns(s.docs.map(d=>({...d.data(),id:d.id}))); setBoardSyncing(false); setBoardConnected(true); });
      const unsubCard = cardRef.onSnapshot(s => { setBoardCards(s.docs.map(d=>({...d.data(),id:d.id}))); });
      boardUnsubRef.current = {col:unsubCol, card:unsubCard};
      setBoardUnsub({col:unsubCol,card:unsubCard});
      setBoardRoomCode(room);
      showNotif("🔥 Board synced!","Room: "+room);
    } catch(e) { setBoardSyncing(false); setBoardConnected(false); showNotif("❌ Board error", e.message); }
  };
  function disconnectBoard() {

    if (boardUnsubRef.current.col) { try { boardUnsubRef.current.col(); } catch(e){} boardUnsubRef.current.col = null; }
    if (boardUnsubRef.current.card) { try { boardUnsubRef.current.card(); } catch(e){} boardUnsubRef.current.card = null; }
    setBoardConnected(false); setBoardRoomCode(""); setBoardSyncing(false);
    showNotif("👋 Disconnected","Board is now local only");
  };

  async function pushCard(card) {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(card.id).set(card); } catch(e) {}
  };
  async function pushCol(col) {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(col.id).set(col); } catch(e) {}
  };
  async function deleteCardRemote(id) {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("cards").doc(id).delete(); } catch(e) {}
  };
  async function deleteColRemote(id) {
    if (!boardConnected) return;
    try { const db = await getDB(); if(db) await db.collection("boards").doc(boardRoomCode).collection("columns").doc(id).delete(); } catch(e) {}
  };

  // == Card CRUD ==
  async function saveCard() {
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
  async function deleteCard(id) {
    setBoardCards(cs=>cs.filter(c=>c.id!==id));
    await deleteCardRemote(id);
    setExpandedCard(null); play("delete");
  };
  async function moveCard(cardId, toColId) {
    const card = boardCards.find(c=>c.id===cardId);
    if (!card || card.colId===toColId) return;
    const updated = {...card, colId:toColId};
    setBoardCards(cs=>cs.map(c=>c.id===cardId?updated:c));
    await pushCard(updated); play("tap");
  };

  // == Column CRUD ==
  async function addColumn() {
    if (!colForm.title.trim()) return;
    const col = {id:uid(), title:colForm.title.trim(), color:colForm.color};
    setBoardColumns(cs=>[...cs, col]);
    await pushCol(col);
    setShowColModal(false); setColForm({title:"",color:"#7c6dfa"}); play("add");
  };
  async function deleteColumn(colId) {
    setBoardColumns(cs=>cs.filter(c=>c.id!==colId));
    const toDelete = boardCards.filter(c=>c.colId===colId);
    setBoardCards(cs=>cs.filter(c=>c.colId!==colId));
    for (const c of toDelete) await deleteCardRemote(c.id);
    await deleteColRemote(colId); play("delete");
  };

  // == Drag & Drop ==
  function onDragStart(e, cardId) { setDragCard(cardId); e.dataTransfer.effectAllowed="move"; };

  function onDragOver(e, colId) { e.preventDefault(); setDragOver(colId); };
  function onDrop(e, colId) { e.preventDefault(); if(dragCard) moveCard(dragCard,colId); setDragCard(null); setDragOver(null); };
  function onDragEnd() { setDragCard(null); setDragOver(null); };

  const PRIORITY_STYLES = {high:{bg:"rgba(255,107,107,.15)",color:"#ff6b6b"},medium:{bg:"rgba(255,159,67,.15)",color:"#ff9f43"},low:{bg:"rgba(107,203,119,.15)",color:"#6bcb77"}};

  function BoardPage() { return (
    <div className="content" style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"72vh"}}>
      <div style={{textAlign:"center",maxWidth:360,padding:"0 24px",position:"relative"}}>
        {/* Twinkling stars */}
        {[...Array(14)].map((_,i)=>(
          <div key={i} style={{position:"fixed",width:isForest?(i%4===0?8:5):(i%3===0?3:2),height:isForest?(i%4===0?8:5):(i%3===0?3:2),borderRadius:isForest?"3px 50%":"50%",background:isForest?(i%3===0?"#4ade8088":i%3===1?"#22c55e60":"#86efac50"):"#fff",opacity:.1+Math.random()*.5,top:`${Math.random()*100}%`,left:`${Math.random()*100}%`,animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite`,animationDelay:`${Math.random()*4}s`,pointerEvents:"none",zIndex:0}}/>
        ))}
        {/* Lock icon */}
        <div style={{width:90,height:90,borderRadius:28,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:42,margin:"0 auto 20px",boxShadow:`0 0 40px ${accent.v}55,0 8px 32px ${accent.v}35`,animation:"galaxyPulse 3s ease-in-out infinite",position:"relative",zIndex:1}}>
          🔒
        </div>
        {/* Coming Soon badge */}
        <div style={{display:"inline-flex",alignItems:"center",gap:7,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:30,padding:"6px 18px",marginBottom:18,boxShadow:`0 4px 16px ${accent.v}45`}}>
          <span style={{fontSize:12,fontWeight:800,color:"#fff",letterSpacing:1.2}}>🚀 COMING SOON</span>
        </div>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:32,background:`linear-gradient(135deg,var(--t1),${accent.v})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",marginBottom:12}}>Project Board</div>
        <div style={{fontSize:14,color:"var(--t2)",lineHeight:1.8,marginBottom:24}}>
          A full Kanban board with drag-and-drop, real-time collaboration, card labels, sprint tracking and team assignments — landing in the next update.
        </div>
        {/* Feature pills */}
        <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginBottom:24}}>
          {["🗂 Kanban Columns","🔀 Drag & Drop","👥 Real-time Collab","🏷 Card Labels","📎 Attachments","⚡ Automations"].map(f=>(
            <span key={f} style={{fontSize:11.5,padding:"5px 12px",borderRadius:20,background:"var(--accd)",color:"var(--acc)",fontWeight:700,border:"1px solid var(--acc)"}}>{f}</span>
          ))}
        </div>
        {/* Progress bar */}
        <div style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:14,padding:"14px 18px",textAlign:"left",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--t2)"}}>Build Progress</span>
            <span style={{fontSize:12,fontWeight:800,color:accent.v}}>68%</span>
          </div>
          <div style={{height:6,background:"var(--s3)",borderRadius:3,overflow:"hidden"}}>
            <div style={{height:"100%",width:"68%",background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:3,boxShadow:`0 0 10px ${accent.v}60`}}/>
          </div>
          <div style={{fontSize:11,color:"var(--t3)",marginTop:8}}>🔧 Building drag-and-drop engine...</div>
        </div>
        <div style={{fontSize:11,color:"var(--t3)"}}>🚀 Expected in the next major update</div>
      </div>
    </div>
  );
  };


  //  QUICK NOTES & SCRATCH PAD
  // ==========================================
  const NOTE_COLORS = ["#7c6dfa","#ff6b6b","#6bcb77","#ffd93d","#ff9f43","#48dbfb","#f589a3","#d47cff","#10b981","#06b6d4"];
  const NOTE_CATS = [{id:"general",icon:"📝",label:"General"},{id:"ideas",icon:"💡",label:"Ideas"},{id:"work",icon:"💼",label:"Work"},{id:"personal",icon:"🏠",label:"Personal"},{id:"todo",icon:"✅",label:"To-Do"},{id:"journal",icon:"📖",label:"Journal"}];

  function saveNote() {

    if(!noteForm.title.trim()&&!noteForm.body.trim()) return;
    const noteData = {...noteForm, tags: noteForm.tags||[], updatedAt: Date.now(), profileId:activeProfile};
    if(editNote) {
      setNotes(ns=>ns.map(n=>n.id===editNote.id?{...n,...noteData}:n));
      showNotif("✏️ Note updated!", noteForm.title||"Untitled");
    } else {
      setNotes(ns=>[{id:uid(),createdAt:Date.now(),...noteData}, ...ns]);
      showNotif("📝 Note saved!", noteForm.title||"Untitled");
      play("add");
    }
    setShowNoteModal(false);
    setEditNote(null);
    setNoteForm({title:"",body:"",color:"#7c6dfa",pinned:false,category:"general",tags:[]});
    setNoteTagInput("");
  };

  function deleteNote(id) {

    setNotes(ns=>ns.filter(n=>n.id!==id));
    play("delete");
    showNotif("🗑 Note deleted","");
  };

  function togglePinNote(id) {

    setNotes(ns=>ns.map(n=>n.id===id?{...n,pinned:!n.pinned}:n));
    play("tap");
  };
  function duplicateNote(note) {

    setNotes(ns=>[{...note,id:uid(),createdAt:Date.now(),updatedAt:Date.now(),title:note.title+" (copy)",pinned:false},...ns]);
    showNotif("📋 Duplicated!",note.title||"Note");
    play("add");
  };

  function NotesPage() {
    const profileNotes = notes.filter(n=>!n.profileId||n.profileId===activeProfile);
    const filtered = profileNotes
      .filter(n => noteFilter==="all" ? true : noteFilter==="pinned" ? n.pinned : n.category===noteFilter)
      .filter(n => noteSearch ? (n.title+n.body+(n.tags||[]).join(" ")).toLowerCase().includes(noteSearch.toLowerCase()) : true)
      .sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || b.createdAt-a.createdAt);
    const wordCount = (text="") => text.trim().split(/\s+/).filter(Boolean).length;
    const charCount = (text="") => text.length;
    return (
      <div style={{padding:"18px 18px 100px"}}>
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24}}>📝 Notes</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{profileNotes.length} notes · {profileNotes.filter(n=>n.pinned).length} pinned</div>
          </div>
          <button onClick={()=>{setNoteForm({title:"",body:"",color:"#7c6dfa",pinned:false,category:"general",tags:[]});setNoteTagInput("");setEditNote(null);setShowNoteModal(true);play("tap");}}
            style={{height:40,padding:"0 18px",background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",boxShadow:`0 4px 14px ${accent.v}40`,flexShrink:0}}>
            + New Note
          </button>
        </div>

        {/* Search bar */}
        <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:12,padding:"0 14px",height:40,marginBottom:12,transition:"border-color .2s"}}>
          <span style={{color:"var(--t3)",fontSize:14}}>⌕</span>
          <input value={noteSearch} onChange={e=>setNoteSearch(e.target.value)} placeholder="Search notes…"
            style={{flex:1,fontSize:13,color:"var(--t1)",background:"none",border:"none",outline:"none"}}/>
          {noteSearch&&<span style={{cursor:"pointer",color:"var(--t3)",fontSize:12}} onClick={()=>setNoteSearch("")}>✕</span>}
        </div>

        {/* Category filter chips */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14}}>
          {[{id:"all",icon:"🗂",label:"All"},{id:"pinned",icon:"📌",label:"Pinned"},...NOTE_CATS].map(c=>(
            <span key={c.id} onClick={()=>setNoteFilter(c.id)}
              style={{fontSize:11.5,padding:"5px 12px",borderRadius:20,border:`1.5px solid ${noteFilter===c.id?accent.v:"var(--b1)"}`,background:noteFilter===c.id?"var(--accd)":"var(--s1)",color:noteFilter===c.id?"var(--acc)":"var(--t2)",cursor:"pointer",fontWeight:noteFilter===c.id?700:500,transition:"all .15s"}}>
              {c.icon} {c.label}
              {c.id!=="all"&&c.id!=="pinned"&&<span style={{marginLeft:4,fontSize:10,opacity:.7}}>{profileNotes.filter(n=>n.category===c.id).length}</span>}
            </span>
          ))}
          <span onClick={()=>setNoteView(v=>v==="grid"?"list":"grid")}
            style={{marginLeft:"auto",fontSize:11.5,padding:"5px 12px",borderRadius:20,border:"1px solid var(--b1)",background:"var(--s1)",color:"var(--t2)",cursor:"pointer"}}>
            {noteView==="grid"?"☰ List":"⊞ Grid"}
          </span>
        </div>

        {/* Empty state */}
        {filtered.length===0&&(
          <div style={{textAlign:"center",padding:"60px 20px"}}>
            <div style={{fontSize:52,marginBottom:12}}>{noteSearch?"🔍":"📝"}</div>
            <div style={{fontSize:15,fontWeight:600,color:"var(--t2)",marginBottom:6}}>{noteSearch?"No notes found":"No notes yet"}</div>
            <div style={{fontSize:13,color:"var(--t3)",lineHeight:1.6}}>{noteSearch?`No matches for "${noteSearch}"`:"Tap + New Note to capture your first idea"}</div>
          </div>
        )}

        {/* Notes Grid / List */}
        <div style={noteView==="grid"?{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10}:{display:"flex",flexDirection:"column",gap:8}}>
          {filtered.map(note=>{
            const cat = NOTE_CATS.find(c=>c.id===note.category)||NOTE_CATS[0];
            const words = wordCount(note.body);
            const isLong = words > 50;
            return (
              <div key={note.id}
                onClick={()=>{setNoteForm({title:note.title,body:note.body,color:note.color,pinned:note.pinned,category:note.category||"general",tags:note.tags||[]});setNoteTagInput("");setEditNote(note);setShowNoteModal(true);}}
                style={{background:`${note.color}14`,border:`1.5px solid ${note.color}33`,borderRadius:16,padding:noteView==="grid"?"14px":"14px 16px",cursor:"pointer",position:"relative",transition:"all .2s",display:noteView==="list"?"flex":"block",gap:noteView==="list"?14:0,alignItems:noteView==="list"?"flex-start":"stretch"}}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px) scale(1.01)"}
                onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                {/* Color accent dot */}
                <div style={{width:6,height:6,borderRadius:"50%",background:note.color,position:"absolute",top:10,left:10}}/>
                <div style={{flex:1,paddingLeft:noteView==="list"?14:0}}>
                  {/* Top row: category + pin + delete */}
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:note.title?6:0}}>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:note.color+"25",color:note.color,fontWeight:600}}>{cat.icon} {cat.label}</span>
                    {note.pinned&&<span style={{fontSize:10,color:note.color}}>📌</span>}
                    {isLong&&<span style={{fontSize:9,color:"var(--t3)",marginLeft:"auto"}}>📄 {words}w</span>}
                    <div style={{marginLeft:isLong?"":  "auto",display:"flex",gap:2}}>
                      <button style={{width:22,height:22,borderRadius:6,background:"none",border:"none",cursor:"pointer",fontSize:12,opacity:.5,display:"flex",alignItems:"center",justifyContent:"center"}}
                        onClick={e=>{e.stopPropagation();togglePinNote(note.id);}}>📌</button>
                      <button style={{width:22,height:22,borderRadius:6,background:"none",border:"none",cursor:"pointer",fontSize:11,opacity:.5,color:"var(--red)",display:"flex",alignItems:"center",justifyContent:"center"}}
                        onClick={e=>{e.stopPropagation();deleteNote(note.id);}}>✕</button>
                    </div>
                  </div>
                  {note.title&&<div style={{fontSize:14,fontWeight:700,color:"var(--t1)",marginBottom:5,lineHeight:1.3}}>{note.title}</div>}
                  {note.body&&<div style={{fontSize:12,color:"var(--t2)",lineHeight:1.6,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:noteView==="list"?2:4,WebkitBoxOrient:"vertical"}}>{note.body}</div>}
                  {/* Tags */}
                  {(note.tags||[]).length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:7}}>
                      {note.tags.slice(0,3).map(tg=><span key={tg} style={{fontSize:9.5,padding:"2px 6px",borderRadius:20,background:"var(--s2)",color:"var(--t3)",border:"1px solid var(--b1)"}}>#{tg}</span>)}
                    </div>
                  )}
                  {/* Footer */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:8}}>
                    <span style={{fontSize:10,color:"var(--t3)"}}>{new Date(note.updatedAt||note.createdAt).toLocaleDateString("en",{month:"short",day:"numeric"})}</span>
                    {note.body&&<span style={{fontSize:9,color:"var(--t3)"}}>{words}w · {charCount(note.body)}c</span>}
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
    {label:"Exhausted",emoji:"😩",energy:1,color:"#ff6b6b"},
    {label:"Tired",   emoji:"😔",energy:2,color:"#ff9f43"},
    {label:"Okay",    emoji:"😐",energy:3,color:"#ffd93d"},
    {label:"Good",    emoji:"😊",energy:4,color:"#6bcb77"},
    {label:"Amazing", emoji:"🤩",energy:5,color:"#7c6dfa"},
  ];

  function saveMood(moodIdx) {

    const today = new Date().toISOString().slice(0,10);
    const entry = {id:uid(),date:today,mood:moodIdx,energy:MOOD_OPTIONS[moodIdx].energy,
      time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),profileId:activeProfile};
    setMoods(ms=>[...ms.filter(m=>!(m.date===today&&m.profileId===activeProfile)),entry]);
    setTodayMood(entry);
    setShowMoodModal(false);
    showNotif("😊 Mood logged!",MOOD_OPTIONS[moodIdx].label);
    play("add");
    awardXP(5,"Mood logged");
  };

  function MoodPage() {
    const profileMoods = moods.filter(m=>!m.profileId||m.profileId===activeProfile);
    const last7 = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-6+i);
      const ds=d.toISOString().slice(0,10);
      return {ds, day:d.toLocaleDateString("en",{weekday:"short"}), entry:profileMoods.find(m=>m.date===ds)};
    });
    const avgMood = profileMoods.length ? (profileMoods.reduce((a,m)=>a+m.energy,0)/profileMoods.length).toFixed(1) : "—";
    const streak  = (()=>{let s=0,d=new Date();for(let i=0;i<30;i++){const ds=d.toISOString().slice(0,10);if(!moods.find(m=>m.date===ds))break;s++;d.setDate(d.getDate()-1);}return s;})();
    const today   = new Date().toISOString().slice(0,10);
    return (
      <div style={{padding:"18px 18px 90px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
          <div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24}}>😊 Mood Tracker</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{moods.length} entries · {streak}d streak · avg {avgMood}/5</div>
          </div>
          <button style={{height:38,padding:"0 14px",background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",boxShadow:`0 4px 14px ${accent.v}40`}} onClick={()=>setShowMoodModal(true)}>+ Log</button>
        </div>

        {/* Today's mood */}
        <div style={{background:todayMood?`${MOOD_OPTIONS[todayMood.mood].color}18`:"var(--s1)",border:`1.5px solid ${todayMood?MOOD_OPTIONS[todayMood.mood].color+"40":"var(--b1)"}`,borderRadius:20,padding:"18px",marginBottom:16,textAlign:"center"}}>
          <div style={{fontSize:13,fontWeight:700,color:"var(--t3)",marginBottom:8,letterSpacing:.5}}>TODAY</div>
          {todayMood ? (<>
            <div style={{fontSize:52,marginBottom:6}}>{MOOD_OPTIONS[todayMood.mood].emoji}</div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:MOOD_OPTIONS[todayMood.mood].color}}>{MOOD_OPTIONS[todayMood.mood].label}</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:4}}>Logged at {todayMood.time}</div>
          </>) : (
            <div style={{padding:"10px 0"}}>
              <div style={{fontSize:36,marginBottom:8}}>🌫️</div>
              <div style={{fontSize:14,color:"var(--t2)",marginBottom:12}}>How are you feeling today?</div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                {MOOD_OPTIONS.map((m,i)=>(
                  <div key={i} onClick={()=>saveMood(i)} style={{fontSize:28,cursor:"pointer",padding:6,borderRadius:12,transition:"all .15s",background:"var(--s2)"}}
                    onMouseEnter={e=>e.currentTarget.style.transform="scale(1.2)"}
                    onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>{m.emoji}</div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 7-day chart */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:20,padding:18,marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>7-Day Mood</div>
          <div style={{display:"flex",gap:6,alignItems:"flex-end",height:70}}>
            {last7.map((d,i)=>{
              const e = d.entry ? d.entry.energy : 0;
              const col = d.entry ? MOOD_OPTIONS[d.entry.mood].color : "var(--s3)";
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  {d.entry&&<div style={{fontSize:14}}>{MOOD_OPTIONS[d.entry.mood].emoji}</div>}
                  <div style={{width:"100%",height:`${e*12+4}px`,background:e>0?`linear-gradient(180deg,${col},${col}88)`:col,borderRadius:"5px 5px 0 0",minHeight:4,transition:"height .6s ease",boxShadow:e>0?`0 0 8px ${col}50`:""}}/>
                  <div style={{fontSize:9.5,color:d.ds===today?"var(--acc)":"var(--t3)",fontWeight:d.ds===today?800:400}}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mood-Task Insight */}
        {moods.length>=3&&(()=>{
          const highMoodDays = moods.filter(m=>m.energy>=4).map(m=>m.date);
          const lowMoodDays  = moods.filter(m=>m.energy<=2).map(m=>m.date);
          const tasksOnHigh  = tasks.filter(t=>t.done && highMoodDays.includes((t.createdAt?new Date(t.createdAt).toISOString().slice(0,10):""))).length;
          const tasksOnLow   = tasks.filter(t=>t.done && lowMoodDays.includes((t.createdAt?new Date(t.createdAt).toISOString().slice(0,10):""))).length;
          const highAvg = highMoodDays.length ? (tasksOnHigh / highMoodDays.length).toFixed(1) : 0;
          const lowAvg  = lowMoodDays.length  ? (tasksOnLow  / lowMoodDays.length).toFixed(1)  : 0;
          return (
            <div style={{background:`${accent.v}12`,border:`1px solid ${accent.v}28`,borderRadius:16,padding:"14px 16px",marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:800,color:accent.v,marginBottom:10}}>🧠 Mood × Productivity Insight</div>
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7}}>
                On <strong style={{color:"#6bcb77"}}>good mood days (😊🤩)</strong> you complete <strong style={{color:"#6bcb77"}}>{highAvg} tasks</strong> on average.<br/>
                On <strong style={{color:"#ff6b6b"}}>low mood days (😩😔)</strong> you complete <strong style={{color:"#ff6b6b"}}>{lowAvg} tasks</strong> on average.
                {Number(highAvg)>Number(lowAvg)&&<div style={{marginTop:8,fontSize:12,color:"var(--t3)"}}>💡 You're {Math.round(((Number(highAvg)-Number(lowAvg))/Math.max(Number(lowAvg),0.1))*100)}% more productive on good mood days. Prioritise self-care!</div>}
              </div>
            </div>
          );
        })()}

        {/* History */}
        {moods.slice(-10).reverse().map(m=>(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:13,marginBottom:7}}>
            <span style={{fontSize:24}}>{MOOD_OPTIONS[m.mood].emoji}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:MOOD_OPTIONS[m.mood].color}}>{MOOD_OPTIONS[m.mood].label}</div>
              <div style={{fontSize:11,color:"var(--t3)"}}>{m.date} · {m.time}</div>
            </div>
            <div style={{display:"flex",gap:2}}>
              {Array.from({length:5},(_,i)=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:i<m.energy?MOOD_OPTIONS[m.mood].color:"var(--s3)"}}/>)}
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
    const totalToday = timeEntries.filter(e=>e.date===todayStr()).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
    const totalAll   = timeEntries.reduce((a,e)=>a+(e.duration||e.seconds||0),0);
    const byTask     = profileTasks.map(task=>{
      const secs = timeEntries.filter(e=>e.taskId===task.id).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
      return {...task, secs};
    }).filter(t=>t.secs>0).sort((a,b)=>b.secs-a.secs);

    // Weekly chart data
    const last7 = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-6+i);
      const ds=d.toISOString().slice(0,10);
      const secs=timeEntries.filter(e=>e.date===ds).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
      return {day:d.toLocaleDateString("en",{weekday:"short"}), ds, secs, mins:Math.round(secs/60)};
    });
    const maxMins = Math.max(...last7.map(d=>d.mins),1);

    return (
      <div style={{padding:"18px 18px 90px"}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,marginBottom:4}}>⏱ Time Tracking</div>
        <div style={{fontSize:12,color:"var(--t3)",marginBottom:18}}>See where your time really goes</div>

        {/* Active timer banner */}
        {activeTimer&&(()=>{
          const task=tasks.find(t=>t.id===activeTimer.taskId);
          return (
            <div style={{background:`linear-gradient(135deg,${accent.v}22,${accent.g}10)`,border:`1.5px solid ${accent.v}50`,borderRadius:18,padding:"14px 18px",marginBottom:14,display:"flex",alignItems:"center",gap:12,boxShadow:`0 4px 20px ${accent.v}25`}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:"#6bcb77",boxShadow:"0 0 10px #6bcb77",animation:"blink 1s infinite",flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:accent.v,letterSpacing:.5}}>TIMER RUNNING</div>
                <div style={{fontSize:14,fontWeight:700,color:"var(--t1)",marginTop:1}}>{task?.title||"Unknown task"}</div>
              </div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:accent.v,minWidth:64,textAlign:"center"}}>{(activeTimer?`${String(Math.floor((Date.now()-activeTimer.startedAt)/60000)).padStart(2,"0")}:${String(Math.floor(((Date.now()-activeTimer.startedAt)%60000)/1000)).padStart(2,"0")}`:"00:00")}</div>
              <button onClick={stopTimer} style={{height:36,padding:"0 14px",background:"rgba(255,107,107,.18)",border:"1px solid rgba(255,107,107,.4)",borderRadius:10,color:"var(--red)",fontWeight:700,fontSize:12,cursor:"pointer"}}>⏹ Stop</button>
            </div>
          );
        })()}

        {/* Summary cards */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16}}>
          {[
            {icon:"🕐",label:"Today",val:fmtTime(totalToday)},
            {icon:"📊",label:"Total",val:fmtTime(totalAll)},
            {icon:"📋",label:"Sessions",val:timeEntries.length},
          ].map(s=>(
            <div key={s.label} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 12px",textAlign:"center"}}>
              <div style={{fontSize:22,marginBottom:4}}>{s.icon}</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,color:accent.v}}>{s.val}</div>
              <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Weekly bar chart */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:20,padding:"18px",marginBottom:16}}>
          <div style={{fontSize:12,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>This Week</div>
          <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80}}>
            {last7.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
                {d.mins>0&&<div style={{fontSize:9,fontWeight:700,color:accent.v}}>{d.mins}m</div>}
                <div style={{width:"100%",height:`${(d.mins/maxMins)*64+4}px`,background:d.ds===todayStr()?`linear-gradient(180deg,${accent.v},${accent.g})`:`${accent.v}40`,borderRadius:"6px 6px 0 0",minHeight:4,transition:"height .7s cubic-bezier(.34,1.56,.64,1)",boxShadow:d.ds===todayStr()?`0 0 12px ${accent.v}50`:""}}/>
                <div style={{fontSize:9.5,color:d.ds===todayStr()?"var(--acc)":"var(--t3)",fontWeight:d.ds===todayStr()?800:400}}>{d.day}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Time by task */}
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,marginBottom:12}}>Time by Task</div>
        {byTask.length===0&&(
          <div style={{textAlign:"center",padding:"40px 20px",color:"var(--t3)"}}>
            <div style={{fontSize:40,marginBottom:10}}>⏱</div>
            <div style={{fontSize:14,color:"var(--t2)",marginBottom:6}}>No time tracked yet</div>
            <div style={{fontSize:12}}>Hit ▶ on any task to start tracking</div>
          </div>
        )}
        {byTask.map(task=>{
          const pct = Math.round((task.secs/totalAll)*100)||0;
          const cat = categories.find(c=>c.id===task.categoryId)||categories[0];
          return (
            <div key={task.id} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 14px",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <span style={{fontSize:14}}>{cat.icon}</span>
                <div style={{flex:1,fontWeight:600,fontSize:13,color:"var(--t1)"}}>{task.title}</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:17,color:accent.v}}>{fmtTime(task.secs)}</div>
                <button onClick={()=>activeTimer?.taskId===task.id?stopTimer():startTimer(task.id)} style={{width:30,height:30,borderRadius:9,background:activeTimer?.taskId===task.id?"rgba(255,107,107,.18)":"var(--accd)",border:`1px solid ${activeTimer?.taskId===task.id?"var(--red)":"var(--acc)"}`,color:activeTimer?.taskId===task.id?"var(--red)":"var(--acc)",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {activeTimer?.taskId===task.id?"⏹":"▶"}
                </button>
              </div>
              <div style={{height:4,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:2,transition:"width .6s ease"}}/>
              </div>
              <div style={{fontSize:10,color:"var(--t3)",marginTop:4}}>{pct}% of total time</div>
            </div>
          );
        })}

        {/* Clear data */}
        {timeEntries.length>0&&(
          <button onClick={()=>{setTimeEntries([]);}} style={{width:"100%",height:40,marginTop:8,background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.3)",borderRadius:12,color:"var(--red)",fontSize:13,fontWeight:600,cursor:"pointer"}}>🗑 Clear All Time Data</button>
        )}
      </div>
    );
  };

  // == ⏱🧘 MERGED FOCUS & TIME PAGE ==
  function FocusTimePage() {
    const [ftView, setFtView] = useState("focus"); // "focus"|"tracker"|"ambient"
    const [ambientMode, setAmbientMode] = useState("none");
    const [timerTick2, setTimerTick2] = useState(0);
    useEffect(()=>{
      const iv=setInterval(()=>setTimerTick2(t=>t+1),1000);
      return()=>clearInterval(iv);
    },[]);

    const totalToday=timeEntries.filter(e=>e.date===todayStr()).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
    const totalAll=timeEntries.reduce((a,e)=>a+(e.duration||e.seconds||0),0);
    const activeTasks=tasks.filter(t=>t.profileId===activeProfile&&!t.done);
    const byTask=tasks.filter(t=>t.profileId===activeProfile).map(task=>{
      const secs=timeEntries.filter(e=>e.taskId===task.id).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
      return{...task,secs};
    }).filter(t=>t.secs>0).sort((a,b)=>b.secs-a.secs);
    const last7=Array.from({length:7},(_,i)=>{
      const d=new Date();d.setDate(d.getDate()-6+i);
      const ds=d.toISOString().slice(0,10);
      const secs=timeEntries.filter(e=>e.date===ds).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
      return{day:d.toLocaleDateString("en",{weekday:"short"}),ds,secs,mins:Math.round(secs/60)};
    });
    const maxMins=Math.max(...last7.map(d=>d.mins),1);
    const mins=Math.floor(pomoSecs/60),secs2=pomoSecs%60;
    const total_s=POMO_MODES[pomoMode].mins*60;
    const progress=1-(pomoSecs/total_s);
    const R=72,C2=2*Math.PI*R;
    const pomoTask=pomoTaskId?tasks.find(t=>t.id===pomoTaskId):null;

    const AMBIENT=[
      {id:"none",   icon:"🔇",label:"None"},
      {id:"lofi",   icon:"☕",label:"Lo-Fi"},
      {id:"rain",   icon:"🌧",label:"Rain"},
      {id:"nature", icon:"🌿",label:"Forest"},
      {id:"cosmic", icon:"🌌",label:"Cosmic"},
    ];

    return(
      <div style={{padding:"0 0 90px",minHeight:"100%"}}>
        {/* Header */}
        <div style={{padding:"18px 18px 12px",background:"var(--s1)",borderBottom:"1px solid var(--b1)",position:"sticky",top:0,zIndex:10}}>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:24,marginBottom:10}}>⚡ Focus & Time</div>
          <div style={{display:"flex",gap:3,background:"var(--s2)",borderRadius:12,padding:3}}>
            {[["focus","🍅","Focus"],["tracker","⏱","Tracker"],["ambient","🎵","Ambient"]].map(([id,icon,lbl])=>(
              <button key={id} onClick={()=>setFtView(id)} style={{flex:1,height:32,borderRadius:9,fontSize:11.5,fontWeight:700,border:"none",cursor:"pointer",transition:"all .2s",background:ftView===id?`linear-gradient(135deg,${accent.v},${accent.g})`:"transparent",color:ftView===id?"#fff":"var(--t3)"}}>
                {icon} {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* ── 🍅 FOCUS VIEW */}
        {ftView==="focus"&&<div style={{padding:"16px 18px"}}>
          {/* Mode pills */}
          <div style={{display:"flex",gap:6,marginBottom:18}}>
            {Object.entries(POMO_MODES).map(([k,m])=>(
              <button key={k} onClick={()=>switchPomoMode(k)} style={{flex:1,height:32,borderRadius:10,fontSize:11,fontWeight:700,border:`1.5px solid ${pomoMode===k?m.color:"var(--b1)"}`,background:pomoMode===k?m.color+"20":"var(--s2)",color:pomoMode===k?m.color:"var(--t2)",cursor:"pointer",transition:"all .2s"}}>
                {k==="focus"?"🍅":k==="short"?"☕":"🛋"} {m.label}
              </button>
            ))}
          </div>

          {/* Big ring timer */}
          <div style={{display:"flex",justifyContent:"center",marginBottom:16,position:"relative"}}>
            <div style={{position:"relative",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
              {/* Outer glow ring */}
              <div style={{position:"absolute",width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle,${POMO_MODES[pomoMode].color}15 0%,transparent 70%)`,animation:pomoRunning?"galaxyPulse 2s ease-in-out infinite":"none"}}/>
              <svg width="170" height="170" style={{transform:"rotate(-90deg)"}}>
                <circle cx="85" cy="85" r={R} fill="none" stroke="var(--s3)" strokeWidth="9"/>
                <circle cx="85" cy="85" r={R} fill="none" stroke={POMO_MODES[pomoMode].color} strokeWidth="9"
                  strokeDasharray={C2} strokeDashoffset={C2*(1-progress)} strokeLinecap="round"
                  style={{transition:"stroke-dashoffset .8s cubic-bezier(.4,0,.2,1)",willChange:"stroke-dashoffset",filter:`drop-shadow(0 0 10px ${POMO_MODES[pomoMode].color}90)`}}/>
              </svg>
              <div style={{position:"absolute",textAlign:"center"}}>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:40,color:"var(--t1)",letterSpacing:1,lineHeight:1}}>{String(mins).padStart(2,"0")}:{String(secs2).padStart(2,"0")}</div>
                <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginTop:4}}>{POMO_MODES[pomoMode].label}</div>
                <div style={{fontSize:10,color:pomoRunning?"#6bcb77":"var(--t3)",marginTop:2}}>{pomoRunning?"● Running":"○ Paused"}</div>
              </div>
            </div>
          </div>

          {/* Session dots */}
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,marginBottom:16}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:i===pomoSession&&pomoRunning?14:10,height:i===pomoSession&&pomoRunning?14:10,borderRadius:"50%",background:i<pomoSession?POMO_MODES.focus.color:i===pomoSession&&pomoRunning?POMO_MODES.focus.color+"80":"var(--s3)",transition:"all .3s",boxShadow:i===pomoSession&&pomoRunning?`0 0 8px ${POMO_MODES.focus.color}`:"none"}}/>
            ))}
            <span style={{fontSize:10,color:"var(--t3)",marginLeft:4}}>Round {pomoSession+1} of 4</span>
          </div>

          {/* Controls */}
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            <button onClick={resetPomo} style={{width:48,height:52,borderRadius:14,background:"var(--s2)",border:"1px solid var(--b1)",fontSize:20,cursor:"pointer"}}>↺</button>
            <button onClick={()=>{setPomoRunning(r=>!r);haptic("medium");}} style={{flex:1,height:52,background:pomoRunning?`rgba(255,107,107,.18)`:`linear-gradient(135deg,${POMO_MODES[pomoMode].color},${POMO_MODES[pomoMode].color}cc)`,border:pomoRunning?`1.5px solid var(--red)`:"none",borderRadius:14,fontSize:16,fontWeight:800,color:pomoRunning?"var(--red)":"#fff",cursor:"pointer",boxShadow:pomoRunning?"none":`0 6px 24px ${POMO_MODES[pomoMode].color}50`,transition:"all .2s"}}>
              {pomoRunning?"⏸  Pause":"▶  Start Focus"}
            </button>
            <button onClick={()=>{setPomoRunning(false);resetPomo();haptic("light");setShowFocusMode(true);setFocusTaskId(pomoTaskId);}} style={{width:48,height:52,borderRadius:14,background:`${accent.v}18`,border:`1px solid ${accent.v}40`,fontSize:18,cursor:"pointer",color:accent.v}} title="Enter fullscreen Focus Mode">🌌</button>
          </div>

          {/* Ambient sound quick-pick */}
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8}}>🎵 Focus Sounds</div>
            <div style={{display:"flex",gap:6}}>
              {AMBIENT.map(a=>(
                <button key={a.id} onClick={()=>{
                  if(a.id==="none"){stopMusic();setMusicOn(false);}
                  else{startMusic(a.id);setMusicOn(true);}
                  setAmbientMode(a.id);haptic("light");
                }} style={{flex:1,height:38,borderRadius:10,fontSize:10,fontWeight:700,border:`1.5px solid ${ambientMode===a.id?accent.v:"var(--b1)"}`,background:ambientMode===a.id?"var(--accd)":"var(--s2)",color:ambientMode===a.id?"var(--acc)":"var(--t2)",cursor:"pointer",transition:"all .15s"}}>
                  <div style={{fontSize:14,marginBottom:1}}>{a.icon}</div>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Task picker */}
          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8}}>🎯 Focusing On</div>
            {pomoTask
              ?<div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:"var(--t1)"}}>{pomoTask.title}</div>
                  <div style={{fontSize:11,color:accent.v,marginTop:1}}>⏱ {fmtTime(getTaskTime(pomoTask.id))} tracked</div>
                </div>
                <button onClick={()=>{toggle(pomoTask.id);setPomoTaskId(null);haptic("success");}} style={{fontSize:11,height:30,padding:"0 10px",background:"rgba(107,203,119,.15)",border:"1px solid rgba(107,203,119,.4)",borderRadius:9,color:"#6bcb77",fontWeight:700,cursor:"pointer"}}>✅ Done</button>
                <button onClick={()=>setPomoTaskId(null)} style={{fontSize:13,background:"none",border:"none",cursor:"pointer",color:"var(--t3)"}}>✕</button>
              </div>
              :<div>
                <div style={{fontSize:11.5,color:"var(--t2)",marginBottom:8}}>No task selected — pick one to focus on:</div>
                <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:160,overflowY:"auto"}}>
                  {activeTasks.slice(0,6).map(task=>(
                    <div key={task.id} onClick={()=>{setPomoTaskId(task.id);haptic("light");}} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:10,cursor:"pointer",background:"var(--s2)",border:"1px solid var(--b1)",transition:"all .15s"}} onMouseEnter={e=>e.currentTarget.style.borderColor=accent.v} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b1)"}>
                      <span style={{fontSize:12}}>{PRIORITIES[task.priority]?.icon}</span>
                      <span style={{fontSize:12.5,fontWeight:500,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</span>
                      {getTaskTime(task.id)>0&&<span style={{fontSize:10,color:accent.v}}>⏱{fmtTime(getTaskTime(task.id))}</span>}
                    </div>
                  ))}
                  {activeTasks.length===0&&<div style={{fontSize:12,color:"var(--t3)",textAlign:"center",padding:"10px 0"}}>🎉 All done! No active tasks.</div>}
                </div>
              </div>
            }
          </div>

          {/* Today's stats row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
            {[{icon:"🍅",label:"Sessions",val:pomoTotal},{icon:"⏱",label:"Today",val:fmtTime(totalToday)},{icon:"🔥",label:"Streak",val:(gamStats.streak||0)+"d"}].map(s=>(
              <div key={s.label} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:12,padding:"10px 8px",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{s.icon}</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,color:accent.v}}>{s.val}</div>
                <div style={{fontSize:9,color:"var(--t3)",fontWeight:700}}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>}

        {/* ── ⏱ TRACKER VIEW */}
        {ftView==="tracker"&&<div style={{padding:"16px 18px"}}>
          {activeTimer && <div style={{background:`linear-gradient(135deg,${accent.v}20,${accent.g}10)`,border:`1.5px solid ${accent.v}60`,borderRadius:18,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:10,height:10,borderRadius:"50%",background:"#6bcb77",boxShadow:"0 0 12px #6bcb77",animation:"blink 1s infinite",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,fontWeight:800,color:accent.v,letterSpacing:.5}}>TRACKING NOW</div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tasks.find(t=>t.id===activeTimer.taskId)?.title||"Unknown"}</div>
                </div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:accent.v,minWidth:56,textAlign:"right"}}>{String(Math.floor((Date.now()-activeTimer.startedAt)/60000)).padStart(2,"0")}:{String(Math.floor(((Date.now()-activeTimer.startedAt)%60000)/1000)).padStart(2,"0")}</div>
                <button onClick={()=>{stopTimer();haptic("medium");}} style={{height:32,padding:"0 10px",background:"rgba(255,107,107,.18)",border:"1px solid rgba(255,107,107,.4)",borderRadius:9,color:"var(--red)",fontWeight:700,fontSize:11,cursor:"pointer"}}>⏹</button>
              </div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
            {[{icon:"🕐",label:"Today",val:fmtTime(totalToday)},{icon:"📊",label:"All Time",val:fmtTime(totalAll)},{icon:"📋",label:"Sessions",val:timeEntries.length}].map(s=>(
              <div key={s.label} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:12,padding:"11px 8px",textAlign:"center"}}>
                <div style={{fontSize:18,marginBottom:2}}>{s.icon}</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:17,color:accent.v}}>{s.val}</div>
                <div style={{fontSize:9,color:"var(--t3)",fontWeight:700}}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 14px",marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>7-Day Chart</div>
            <div style={{display:"flex",gap:5,alignItems:"flex-end",height:64}}>
              {last7.map((d,i)=>(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                  {d.mins>0&&<div style={{fontSize:8,fontWeight:700,color:accent.v}}>{d.mins}m</div>}
                  <div style={{width:"100%",height:`${(d.mins/maxMins)*52+3}px`,background:d.ds===todayStr()?`linear-gradient(180deg,${accent.v},${accent.g})`:`${accent.v}35`,borderRadius:"4px 4px 0 0",minHeight:3,transition:"height .6s ease"}}/>
                  <div style={{fontSize:8.5,color:d.ds===todayStr()?"var(--acc)":"var(--t3)",fontWeight:d.ds===todayStr()?800:400}}>{d.day}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{fontSize:13,fontWeight:800,color:"var(--t1)",marginBottom:10}}>All Tasks</div>
          {activeTasks.map(task=>{
            const taskSecs=timeEntries.filter(e=>e.taskId===task.id).reduce((a,e)=>a+(e.duration||e.seconds||0),0);
            const isRunning=activeTimer?.taskId===task.id;
            const cat=categories.find(c=>c.id===task.categoryId)||{icon:"📋"};
            return(
              <div key={task.id} style={{background:"var(--s1)",border:`1.5px solid ${isRunning?accent.v:"var(--b1)"}`,borderRadius:12,padding:"10px 12px",marginBottom:7,display:"flex",alignItems:"center",gap:9,transition:"border-color .2s"}}>
                <span style={{fontSize:14}}>{cat.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,fontWeight:600,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{task.title}</div>
                  <div style={{fontSize:10,color:isRunning?accent.v:"var(--t3)",fontWeight:isRunning?700:400,marginTop:1}}>{isRunning?"⏱ Tracking…":taskSecs>0?`⏱ ${fmtTime(taskSecs)}`:"No time yet"}</div>
                </div>
                <button onClick={()=>{isRunning?stopTimer():startTimer(task.id);haptic("medium");}} style={{height:30,padding:"0 10px",borderRadius:9,background:isRunning?"rgba(255,107,107,.18)":"var(--accd)",border:`1px solid ${isRunning?"var(--red)":"var(--acc)"}`,color:isRunning?"var(--red)":"var(--acc)",fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                  {isRunning?"⏹":"▶"}
                </button>
              </div>
            );
          })}
          {activeTasks.length===0&&<div style={{textAlign:"center",padding:"28px 0",color:"var(--t3)"}}><div style={{fontSize:32}}>✅</div><div style={{fontSize:12.5,marginTop:8}}>No active tasks!</div></div>}

          {byTask.length>0&&<>
            <div style={{fontSize:13,fontWeight:800,color:"var(--t1)",margin:"16px 0 10px"}}>Top by Time</div>
            {byTask.slice(0,4).map(task=>{
              const pct=Math.round((task.secs/totalAll)*100)||0;
              const cat=categories.find(c=>c.id===task.categoryId)||{icon:"📋"};
              return(
                <div key={task.id} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:11,padding:"9px 12px",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5}}>
                    <span>{cat.icon}</span><span style={{fontSize:12,fontWeight:600,flex:1,color:"var(--t1)"}}>{task.title}</span>
                    <span style={{fontFamily:"'Instrument Serif',serif",fontSize:14,color:accent.v}}>{fmtTime(task.secs)}</span>
                  </div>
                  <div style={{height:3,background:"var(--s3)",borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:2}}/>
                  </div>
                </div>
              );
            })}
          </>}
          {timeEntries.length>0&&<button onClick={()=>{setTimeEntries([]);}} style={{width:"100%",height:36,marginTop:10,background:"rgba(255,107,107,.1)",border:"1px solid rgba(255,107,107,.3)",borderRadius:10,color:"var(--red)",fontSize:12,fontWeight:600,cursor:"pointer"}}>🗑 Clear Time Data</button>}
        </div>}

        {/* ── 🎵 AMBIENT VIEW */}
        {ftView==="ambient"&&<div style={{padding:"16px 18px"}}>
          <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.6,marginBottom:20}}>Pick a sound to play while you work. Helps with focus and reduces distractions.</div>
          {[
            {id:"lofi",   icon:"☕",label:"Lo-Fi Chill",    desc:"Warm chord loops, hi-hats, vinyl crackle",       color:"#7c6dfa"},
            {id:"jazzy",  icon:"🎷",label:"Jazzy Lo-Fi",   desc:"Jazz chords, walking bass, brush snare",          color:"#ff9f43"},
            {id:"focus",  icon:"🧠",label:"Deep Focus",    desc:"Binaural drones, LFO modulation, minimal",        color:"#48dbfb"},
            {id:"rain",   icon:"🌧",label:"Rainy Day",      desc:"Rain noise, thunder rumbles, soft piano drops",    color:"#6bcb77"},
            {id:"nature", icon:"🌿",label:"Forest",         desc:"Birds, wind gusts, water stream",                  color:"#00d4aa"},
            {id:"cosmic", icon:"🌌",label:"Cosmic Drift",  desc:"Space pads, shimmer sparkles, sub bass",           color:"#a855f7"},
          ].map(track=>(
            <div key={track.id} onClick={()=>{
              if(musicOn && _musicTrack===track.id){stopMusic();setMusicOn(false);setAmbientMode("none");}
              else{startMusic(track.id);setMusicOn(true);setAmbientMode(track.id);haptic("light");}
            }} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",borderRadius:16,marginBottom:10,cursor:"pointer",background:ambientMode===track.id?`${track.color}14`:"var(--s1)",border:`1.5px solid ${ambientMode===track.id?track.color+"60":"var(--b1)"}`,transition:"all .2s"}}>
              <div style={{width:46,height:46,borderRadius:14,background:`${track.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0,boxShadow:ambientMode===track.id?`0 0 16px ${track.color}50`:"none"}}>
                {track.icon}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:700,color:"var(--t1)"}}>{track.label}</div>
                <div style={{fontSize:11,color:"var(--t3)",marginTop:1,lineHeight:1.4}}>{track.desc}</div>
              </div>
              {ambientMode===track.id&&musicOn
                ?<div style={{display:"flex",gap:2,alignItems:"flex-end",height:18}}>
                  {[4,7,5,8,6].map((h,i)=><div key={i} style={{width:3,height:`${h+Math.sin(Date.now()/400+i)*3}px`,background:track.color,borderRadius:2,animation:`soundbar${i} .6s ease-in-out infinite`,animationDelay:`${i*0.12}s`,minHeight:3}}/>)}
                </div>
                :<span style={{fontSize:11,color:"var(--t3)"}}>▶</span>
              }
            </div>
          ))}
          <div style={{marginTop:8,background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:14,padding:"12px 14px"}}>
            <div style={{fontSize:11,fontWeight:800,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:8}}>💡 Focus Tips</div>
            {["Put your phone face-down or in another room","Use the Pomodoro tab for 25-min deep work sessions","Pair ambient sound with the fullscreen 🌌 Focus Mode","Track your time to see your most productive hours"].map((tip,i)=>(
              <div key={i} style={{fontSize:12,color:"var(--t2)",padding:"5px 0",borderBottom:i<3?"1px solid var(--b1)":"none",display:"flex",gap:8}}>
                <span style={{color:accent.v,fontWeight:700,flexShrink:0}}>{i+1}.</span>{tip}
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
    const cat = categories.find(c=>c.id===task.categoryId)||{icon:"📋",name:"Task"};
    const status = task.done ? "✅ Completed" : task.due ? `📅 Due ${fmtDate(task.due)}` : "🔄 In progress";
    const priority = PRIORITIES[task.priority]?.icon || "";
    const timeLogged = getTaskTime(task.id);
    const timeStr = timeLogged>0 ? `\n⏱ ${fmtTime(timeLogged)} logged` : "";
    const text = `${priority} ${task.title}\n${status}\n${cat.icon} ${cat.name}${timeStr}\n\nTracked with Taskflow ✦`;
    if(navigator.share){
      navigator.share({title:"Taskflow Task",text}).catch(()=>{});
    } else {
      navigator.clipboard?.writeText(text).then(()=>showNotif("📋 Copied!","Task details copied to clipboard"));
    }
  };

  // == Customization: App Name & Icon ==
  const [appDisplayName, setAppDisplayName] = useState(()=>localStorage.getItem("tf_appname")||"Taskflow");
  const [appAccentMsg, setAppAccentMsg] = useState(()=>localStorage.getItem("tf_accentmsg")||"");
  useEffect(()=>{try{localStorage.setItem("tf_appname",appDisplayName);}catch(e){}},[appDisplayName]);




  // == Microsoft Store / PWA Meta ==
  useEffect(()=>{
    // Theme color syncs with accent
    const meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', accent.v);
    else {
      const m = document.createElement('meta');
      m.name = 'theme-color'; m.content = accent.v;
      document.head.appendChild(m);
    }
    // App title
    document.title = (appDisplayName||'Taskflow') + ' — Task Manager';
  },[accent.v, appDisplayName]);

  // == Service Worker registration ==
  useEffect(()=>{
    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("/sw.js").catch(()=>{});
    }
  },[]);

  // == PWA Install Prompt ==
  const [pwaPrompt, setPwaPrompt] = useState(null);

  function installPWA() {
    if(pwaPrompt){ pwaPrompt.prompt(); pwaPrompt.userChoice.then(()=>{setPwaPrompt(null);setIsInstalled(true);setShowInstallBanner(false);localStorage.setItem('tf_install_dismissed','1');}); }
    else { setShowInstallBanner(false); localStorage.setItem('tf_install_dismissed','1'); }
  };
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(()=>{
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  });
  useEffect(()=>{
    // Check if already installed
    if(window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true); return;
    }
    function handler(e) { e.preventDefault(); setPwaPrompt(e);
      // Show install banner after 20 seconds on first visit
      if(!localStorage.getItem('tf_install_dismissed')) {
        setTimeout(()=>setShowInstallBanner(true), 20000);
      }
    }
    window.addEventListener('beforeinstallprompt', handler);
    // Also show banner after 45s even without the prompt (iOS safari)
    if(!localStorage.getItem('tf_install_dismissed') && !isInstalled) {
      setTimeout(()=>setShowInstallBanner(true), 45000);
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  },[]);
  

  // == ICS Calendar Import ==
  const [showICSModal, setShowICSModal] = useState(false);
  function parseICS(text) {

    const events = []; let cur = null;
    text.split("\n").forEach(line=>{
      line = line.trim();
      if(line==="BEGIN:VEVENT")  cur = {};
      else if(line==="END:VEVENT" && cur){
        if(cur.title){ events.push(cur); } cur=null;
      } else if(cur){
        if(line.startsWith("SUMMARY:"))     cur.title = line.slice(8).replace(/\\n/g," ").trim();
        else if(line.startsWith("DTSTART")) {
          const d = line.split(":")[1]?.replace(/T.*/,"") || "";
          if(d.length>=8) cur.due = d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8);
        }
        else if(line.startsWith("DESCRIPTION:")) cur.notes = line.slice(12).replace(/\\n/g,"\n").trim();
      }
    });
    return events;
  };
  function importICS(e) {

    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const events = parseICS(ev.target.result);
      if(!events.length){ showNotif("❌ No events found","Check your .ics file"); return; }
      const newTasks = events.map(ev=>({id:uid(),title:ev.title,notes:ev.notes||"",priority:"medium",categoryId:"work",due:ev.due||"",photo:null,tags:["calendar"],subtasks:[],starred:false,recurring:"never",reminder:false,reminderTime:"09:00",reminderDate:"",alarmTone:"classic",profileId:activeProfile,done:false,createdAt:Date.now()}));
      setTasks(ts=>[...newTasks,...ts]);
      showNotif(`📅 ${events.length} events imported!`,"From Google Calendar");
      play("add"); awardXP(events.length*5,"Calendar import");
      setShowICSModal(false);
    };
    reader.readAsText(file);
  };

  // == Export to PDF (print dialog) ==
  function exportToPDF() {

    const today = new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    const doneThisWeek = tasks.filter(t=>{
      if(!t.done||!t.createdAt) return false;
      const d = new Date(t.createdAt);
      const now = new Date();
      const weekAgo = new Date(now.getTime()-7*24*60*60*1000);
      return d>weekAgo;
    });
    const activeTasks = profileTasks.filter(t=>!t.done);
    const pct = tasks.length?Math.round((tasks.filter(t=>t.done).length/tasks.length)*100):0;
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
  <div class="stat"><div class="stat-val">${tasks.filter(t=>t.done).length}</div><div class="stat-lbl">Completed</div></div>
  <div class="stat"><div class="stat-val">${activeTasks.length}</div><div class="stat-lbl">Active</div></div>
  <div class="stat"><div class="stat-val">${pct}%</div><div class="stat-lbl">Completion</div></div>
  <div class="stat"><div class="stat-val">${doneThisWeek.length}</div><div class="stat-lbl">This Week</div></div>
</div>
<h2>✅ Completed This Week (${doneThisWeek.length})</h2>
${doneThisWeek.slice(0,20).map(t=>`<div class="task-item done">✔️ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span></div>`).join("")}
${doneThisWeek.length===0?"<p style='color:#aaa;font-size:13px'>No tasks completed this week yet.</p>":""}
<h2>📋 Active Tasks (${Math.min(activeTasks.length,15)})</h2>
${activeTasks.slice(0,15).map(t=>`<div class="task-item active">○ <span>${t.title}</span><span class="pri ${t.priority}">${t.priority}</span>${t.due?`<span style='color:#aaa;font-size:11px'>due ${t.due}</span>`:""}</div>`).join("")}
<div class="footer">Generated by Taskflow ✦ — ${new Date().toISOString().slice(0,10)}</div>
</body></html>`;
    const w = window.open("","_blank","width=750,height=900");
    if(w){ w.document.write(html); w.document.close(); w.onload=()=>w.print(); }
    else { showNotif("📄 PDF blocked","Allow popups to export PDF"); }
    awardXP(20,"Exported report"); haptic("medium");
  };



  // == Request notification permission on first task add ==

  // == Bulk Actions ==
  const toggleBulkSelect = (id) => {
    setBulkSelected(s=>{ const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  };
  const bulkComplete = () => {
    setBulkSelected(s=>{ s.forEach(id=>{ setTasks(ts=>ts.map(t=>t.id===id?{...t,done:true}:t)); }); return new Set(); });
    setBulkMode(false); awardXP(bulkSelected.size*15,"Bulk complete"); haptic("success");
    showNotif(`✅ ${bulkSelected.size} tasks completed!`,"");
  };
  const bulkDelete = () => {
    if(!window.confirm(`Delete ${bulkSelected.size} tasks?`)) return;
    setTasks(ts=>ts.filter(t=>!bulkSelected.has(t.id)));
    setBulkSelected(new Set()); setBulkMode(false); haptic("error");
    showNotif(`🗑 ${bulkSelected.size} tasks deleted`,"");
  };
  const bulkStar = () => {
    setBulkSelected(s=>{ s.forEach(id=>setTasks(ts=>ts.map(t=>t.id===id?{...t,starred:true}:t))); return new Set(); });
    setBulkMode(false); showNotif(`⭐ ${bulkSelected.size} tasks starred`,"");
  };

  // == AI Smart Task Breakdown ==
  async function aiBreakdown() {
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
            content: `Break down this goal into 5-8 specific actionable tasks. Goal: "${aiInput}". Reply ONLY with a JSON array like: ["Task 1", "Task 2", "Task 3"]. No other text.`
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
      // == Offline Smart Breakdown Engine ==
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

      // GENERAL GOAL (catch-all -- still very detailed)
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

  function addAiTasksToApp() {

    const selected = aiTasks.filter((_,i)=>aiSelected.includes(i));
    const newTasks = selected.map(title => ({
      id:uid(), title, notes:"", priority:"medium",
      categoryId:"work", due:"", photo:null, tags:[], subtasks:[],
      starred:false, recurring:"never", reminder:false,
      reminderTime:"09:00", reminderDate:"", alarmTone:"classic",
      profileId:activeProfile, done:false, createdAt:Date.now()
    }));
    setTasks(ts=>[...newTasks,...ts]);
    showNotif("🤖 "+selected.length+" tasks added!", "AI breakdown complete");
    play("add");
    awardXP(selected.length*5,"AI tasks added");
    setShowAiModal(false);
    setAiInput("");
    setAiTasks([]);
    setAiSelected([]);
    setTab("tasks");
    setShowDone(false);
    setShowStarred(false);
  };


  // == 🤖 TASKLY BOT CHAT ==
  const [chatMsgs, setChatMsgs] = useState(()=>{ const n=localStorage.getItem('tf_username')||''; return [{from:"bot",text:`Hey${n?" "+n:""}! 👋 I'm LIBI — your built-in AI.\n\nI know your tasks, I work offline, and I'm always here.\n\n💬 Try:\n• "Plan my day"\n• "Motivate me"\n• "Tell me a joke 😄"\n• "I'm feeling overwhelmed"\n\nWhat's on your mind?`}]; });
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

  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:"smooth"}); },[chatMsgs]);

  async function sendChat(override=null) {

    const text = override || chatInput.trim();
    if(!text) return;
    setChatInput("");
    const newMsgs = [...chatMsgs, {from:"user",text}];
    setChatMsgs(newMsgs);
    setChatTyping(true);
    play("tap");
    // Online search capability
    const isOnline = navigator.onLine;
    const needsWeb = (q) => {
      const l = q.toLowerCase();
      return /what is|who is|when did|where is|how does|define |explain |news|weather|latest|current|today'?s|search|look up|tell me about|history of|why does|how many|capital of|population|president|prime minister|ceo|founder| vs |compare|difference between|recipe|how to make|stock price|score of|result of|who won/.test(l)
        && !/my task|my goal|my habit|remind me|add task|plan my day|how am i|my progress|my streak|taskflow|pomodoro|libi/.test(l);
    };
    const webSearch = async (q) => {
      try {
        const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`,{signal:AbortSignal.timeout(4000)});
        const d = await r.json();
        if(d.AbstractText?.length>40) return `🌐 ${d.AbstractText}${d.AbstractURL?"\n\nSource: "+d.AbstractURL:""}`;
        if(d.Answer) return `🌐 ${d.Answer}`;
        if(d.Definition) return `🌐 ${d.Definition}`;
      } catch(e){}
      try {
        const r2 = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&origin=*&srlimit=1`,{signal:AbortSignal.timeout(4000)});
        const d2 = await r2.json();
        const hit = d2?.query?.search?.[0];
        if(hit?.snippet) {
          const clean = hit.snippet.replace(/<[^>]+>/g,"").replace(/&quot;/g,'"').replace(/&#039;/g,"'");
          return `🌐 ${hit.title}: ${clean}...\n\nMore: https://en.wikipedia.org/wiki/${encodeURIComponent(hit.title.replace(/ /g,"_"))}`;
        }
      } catch(e){}
      return null;
    };
    if(isOnline && needsWeb(text)) {
      try {
        const webResult = await webSearch(text);
        if(webResult) {
          setChatMsgs(m=>[...m,{from:"bot",text:webResult+"\n\n_🌐 Live web answer — ask about your tasks too!_"}]);
          setChatTyping(false);
          return;
        }
      } catch(e){}
    }
    setTimeout(()=>{
      // Build context from last 6 messages so LIBI remembers the conversation
      const recentContext = newMsgs.slice(-6).map(m=>`${m.from==="user"?"You":"LIBI"}: ${m.text}`).join("\n");
      // Check if user is following up on previous topic
      const lowerText = text.toLowerCase();
      const prevBotMsg = newMsgs.filter(m=>m.from==="bot").slice(-1)[0]?.text||"";
      const offlineHint = !isOnline && needsWeb(text) ? "\n\n📡 Connect to WiFi for live web answers!" : "";
      let reply = libiBot(text, profileTasks, categories, t, userName||"friend", libiMemory) + offlineHint;
      // Context-aware follow-ups
      if(/more|tell me more|elaborate|explain|why|how|what do you mean/i.test(lowerText) && prevBotMsg.length > 50) {
        reply = libiBot(text + " (context: " + prevBotMsg.slice(0,120) + ")", profileTasks, categories, t, userName||"friend");
      }
      if(/yes|sure|ok|okay|let.s do it|sounds good|go ahead/i.test(lowerText) && prevBotMsg.includes("?")) {
        reply = "Got it! 👍\n\n" + libiBot("plan my day", profileTasks, categories, t);
      }
      if(/no|nope|not now|skip/i.test(lowerText) && prevBotMsg.includes("?")) {
        reply = "No problem! 😊 What else can I help you with? Try asking about your tasks, goals, or anything productivity-related.";
      }
      // Detect task creation intent from user message
      const taskCreationPatterns = /^(remind me to|add task|create task|new task|i need to|i have to|don.t forget to|schedule|set a reminder)/i;
      const reminderMatch = text.match(/(?:remind me to|add task|create task|new task|i need to|i have to|don.t forget to)\s+(.+?)(?:\s+(?:tomorrow|today|on\s+\w+|next\s+\w+))?$/i);
      const tomorrowDate = (()=>{ const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })();
      const todayDate2 = todayStr();
      if(taskCreationPatterns.test(text) && reminderMatch?.[1]){
        const taskTitle = reminderMatch[1].trim().replace(/[.!?]$/,"");
        const hasTomorrow = /tomorrow/i.test(text);
        const hasToday = /today|tonight/i.test(text);
        const dueDate = hasTomorrow ? tomorrowDate : hasToday ? todayDate2 : "";
        const newTask = {id:uid(),title:taskTitle,notes:"Added by LIBI from chat",priority:"medium",categoryId:"work",due:dueDate,photo:null,tags:["libi"],subtasks:[],starred:false,recurring:"never",reminder:false,reminderTime:"09:00",reminderDate:"",alarmTone:"classic",profileId:activeProfile,done:false,createdAt:Date.now()};
        setTasks(ts=>[newTask,...ts]);
        play("add"); awardXP(10,"LIBI task create"); haptic("success");
        reply = `✅ Done! I've added **"${taskTitle}"** to your tasks${dueDate ? " due "+(hasTomorrow?"tomorrow":"today") : ""}. You can find it at the top of your task list!\n\n💡 Tip: You can say things like:\n• "Remind me to call mum tomorrow"\n• "Add task buy groceries today"\n• "I need to finish the report"`;
      }
      // == LIBI Memory: extract and save facts ==
      const extractMemory = (txt) => {
        const lower = txt.toLowerCase();
        if(/i'?m? a? ?(student|developer|designer|teacher|doctor|engineer|freelancer|manager|nurse|lawyer)/i.test(txt)) {
          const match = txt.match(/i'?m? a? ?(student|developer|designer|teacher|doctor|engineer|freelancer|manager|nurse|lawyer)/i);
          if(match) setLibiMemory(m=>({...m, occupation:match[1], facts:[...new Set([...m.facts, txt.trim()])].slice(-20)}));
        }
        if(/i wake up at (\d+(?::\d+)?(?:am|pm)?)/i.test(txt)) {
          const t2 = txt.match(/wake up at ([\w:]+)/i)?.[1];
          if(t2) setLibiMemory(m=>({...m, wakeTime:t2, facts:[...new Set([...m.facts, txt.trim()])].slice(-20)}));
        }
        if(/my name is (\w+)/i.test(txt)) {
          const nm = txt.match(/my name is (\w+)/i)?.[1];
          if(nm) setLibiMemory(m=>({...m, name:nm, facts:[...new Set([...m.facts, txt.trim()])].slice(-20)}));
        }
        if(/i (love|hate|prefer|like|dislike|enjoy|work|study|live|am|feel)/i.test(txt) && txt.length < 120) {
          setLibiMemory(m=>({...m, facts:[...new Set([...m.facts, txt.trim()])].slice(-20)}));
        }
      };
      extractMemory(text);
      setChatMsgs(m=>[...m,{from:"bot",text:reply}]);
      setChatTyping(false);
    }, 500 + Math.random()*300);
  };

  // Chat panel rendered as inline JSX variable (never remounts -- fixes typing focus loss)
  const [libiTab, setLibiTab] = useState("chat");
  const [showLibiPanel, setShowLibiPanel] = useState(true);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState("week"); // week|month|all
  const [deletedTask, setDeletedTask] = useState(null); // for undo
  const [undoTimer, setUndoTimer] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelected, setBulkSelected] = useState(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);

  const [showSplash, setShowSplash] = useState(()=>!localStorage.getItem("tf_onboarded"));

  useEffect(()=>{ const done=localStorage.getItem('tf_onboarded'); if(!done){setTimeout(()=>{setShowSplash(false);setOnboardStep(1);},2200);}else{setTimeout(()=>setShowSplash(false),1500);} },[]);
  const [dailyChallenge, setDailyChallenge] = useState(()=>{ try{ return JSON.parse(localStorage.getItem('tf_challenge')||'null'); }catch(e){ return null; } });
  const [challengeDone, setChallengeDone] = useState(false);
  useEffect(()=>{
    const today=todayStr();
    if(!dailyChallenge||dailyChallenge.date!==today){
      const cs=[{text:'Complete 3 tasks before noon',target:3,type:'count',date:today},{text:'Finish all high-priority tasks',target:0,type:'high',date:today},{text:'Log your mood today',target:1,type:'mood',date:today},{text:'Add 2 new tasks',target:2,type:'add',date:today},{text:'Complete 1 overdue task',target:1,type:'overdue',date:today},{text:'Write a note about your day',target:1,type:'note',date:today},{text:'Start a Pomodoro session',target:1,type:'pomo',date:today},{text:'Star your top task',target:1,type:'star',date:today}];
      const c=cs[new Date().getDay()%cs.length];
      setDailyChallenge(c); try{localStorage.setItem('tf_challenge',JSON.stringify(c));}catch(e){}
    }
  },[]);
  // confetti + page state moved earlier
  const [showSidebar, setShowSidebar] = useState(true); // "chat" | "breakdown" | "editor"

  const chatPanelJSX = (
    <>
      {/* LIBI Header */}
      <div style={{padding:"14px 15px 0",borderBottom:"1px solid var(--b1)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:42,height:42,borderRadius:14,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,animation:"libiPulse 3s ease-in-out infinite",overflow:"hidden",boxShadow:"0 4px 16px #7c6dfa60"}}>
                  <svg width="42" height="42" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <linearGradient id="libiBg" x1="0" y1="0" x2="42" y2="42">
                        <stop offset="0%" stopColor="#7c6dfa"/>
                        <stop offset="100%" stopColor="#a855f7"/>
                      </linearGradient>
                      <radialGradient id="libiSheen" cx="30%" cy="25%" r="60%">
                        <stop offset="0%" stopColor="white" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="white" stopOpacity="0"/>
                      </radialGradient>
                    </defs>
                    <circle cx="21" cy="21" r="21" fill="url(#libiBg)"/>
                    <circle cx="21" cy="21" r="21" fill="url(#libiSheen)"/>
                    <path d="M21 9 L23.8 18.2 L33 21 L23.8 23.8 L21 33 L18.2 23.8 L9 21 L18.2 18.2 Z" fill="white" opacity="0.95"/>
                    <circle cx="21" cy="21" r="3.5" fill="url(#libiBg)"/>
                  </svg>
                </div>
            <div>

              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:16,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text",fontWeight:400}}>LIBI</div>
              <div style={{fontSize:10,color:"var(--t3)",marginTop:-1}}>Your AI • Always offline ✦</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:9,padding:"2px 8px",borderRadius:20,background:"rgba(107,203,119,.14)",color:"#6bcb77",border:"1px solid rgba(107,203,119,.3)",fontWeight:700}}>● ONLINE</span><button onClick={()=>setShowLibiPanel(false)} style={{width:22,height:22,borderRadius:7,background:"var(--s3)",border:"none",color:"var(--t3)",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}} title="Close LIBI">✕</button></div>
        </div>
        {/* Tabs */}
        <div style={{display:"flex",gap:4,background:"var(--s2)",borderRadius:10,padding:3,marginBottom:0}}>
          {[["chat","💬","Chat"],["breakdown","⚡","Breakdown"],["editor","🔒","NL Edit"]].map(([id,icon,label])=>(
            <button key={id} onClick={()=>setLibiTab(id)} style={{flex:1,height:28,borderRadius:8,fontSize:10.5,fontWeight:700,border:"none",cursor:"pointer",transition:"all .15s",background:libiTab===id?"linear-gradient(135deg,#7c6dfa,#a855f7)":"transparent",color:libiTab===id?"#fff":"var(--t3)"}}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TAB: CHAT */}
      {libiTab==="chat"&&<>
        <div className="chat-msgs">
          {chatMsgs.map((m,i)=>(
            <div key={i} className={`msg ${m.from==="user"?"u":"a"}`}>
              <div className="bubble">{m.text}</div>
            </div>
          ))}
          {chatTyping&&<div className="msg a"><div className="bubble"><div className="typing-b"><div className="tdot"/><div className="tdot"/><div className="tdot"/></div></div></div>}
          <div ref={chatEndRef}/>
        </div>
        <div className="chat-quick">
          {["Plan my day","What's overdue?","Motivate me","Give me a tip","My progress"].map(q=>(
            <button key={q} className="qbtn" onClick={()=>sendChat(q)}>{q}</button>
          ))}
        </div>
        <div className="chat-inp">
          <textarea className="chat-ta" rows={1} placeholder="Ask LIBI anything…" value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();}}}/>
          <button className="send-btn" disabled={!chatInput.trim()||chatTyping} onClick={()=>sendChat()}><span style={{color:"#fff",fontSize:13,fontWeight:700}}>↑</span></button>
        </div>
      </>}

      {/* ── TAB: AI BREAKDOWN */}
      {libiTab==="breakdown"&&<div style={{flex:1,display:"flex",flexDirection:"column",padding:"12px",gap:10,overflowY:"auto"}}>
        <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>Type any goal — LIBI breaks it into actionable tasks instantly.</div>
        <textarea value={aiInput} onChange={e=>setAiInput(e.target.value)} placeholder='e.g. "Launch my app", "Get fit in 30 days", "Learn guitar"' style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:12,padding:"10px 13px",fontSize:13,color:"var(--t1)",resize:"none",height:80,outline:"none",transition:"border-color .2s"}} onFocus={e=>e.target.style.borderColor="#7c6dfa"} onBlur={e=>e.target.style.borderColor="var(--b1)"}/>
        <button onClick={aiBreakdown} disabled={!aiInput.trim()||aiLoading} style={{height:42,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",boxShadow:"0 4px 14px #7c6dfa40",opacity:aiLoading||!aiInput.trim()?0.5:1}}>
          {aiLoading?"⏳ Breaking down…":"⚡ Break it down"}
        </button>
        {aiTasks.length>0&&!aiLoading&&<>
          <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:.5}}>SELECT TASKS TO ADD ({aiSelected.length}/{aiTasks.length})</div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flex:1,overflowY:"auto"}}>
            {aiTasks.map((task,i)=>(
              <div key={i} onClick={()=>setAiSelected(s=>s.includes(i)?s.filter(x=>x!==i):[...s,i])} style={{display:"flex",alignItems:"center",gap:9,padding:"9px 11px",borderRadius:11,cursor:"pointer",background:aiSelected.includes(i)?"var(--accd)":"var(--s2)",border:`1px solid ${aiSelected.includes(i)?"var(--acc)":"transparent"}`,transition:"all .15s"}}>
                <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${aiSelected.includes(i)?"var(--acc)":"var(--b2)"}`,background:aiSelected.includes(i)?"var(--acc)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:10,color:"#fff",fontWeight:800}}>{aiSelected.includes(i)&&"✓"}</div>
                <span style={{fontSize:12.5,fontWeight:500}}>{task}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:7}}>
            <button onClick={()=>setAiSelected(aiTasks.map((_,i)=>i))} style={{flex:1,height:36,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:10,fontSize:12,color:"var(--t2)",cursor:"pointer"}}>All</button>
            <button onClick={addAiTasksToApp} disabled={!aiSelected.length} style={{flex:2,height:36,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",border:"none",borderRadius:10,fontSize:12,fontWeight:700,color:"#fff",cursor:"pointer",opacity:aiSelected.length?1:0.4}}>➕ Add {aiSelected.length} task{aiSelected.length!==1?"s":""}</button>
          </div>
        </>}
      </div>}

      {/* ── TAB: NL EDITOR — COMING SOON */}
      {libiTab==="editor"&&<div style={{flex:1,display:"flex",flexDirection:"column",padding:"12px",gap:10,overflowY:"auto",alignItems:"center",justifyContent:"center",minHeight:200}}>
        <div style={{textAlign:"center",padding:"20px 16px"}}>
          <div style={{fontSize:40,marginBottom:12}}>🔒</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:20,marginBottom:8,color:"var(--t1)"}}>Coming Soon</div>
          <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.7,marginBottom:16}}>Natural Language Task Editing — type commands like "move my work tasks to tomorrow" and LIBI will do it automatically.</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
            {["🔀 Bulk reschedule","✅ Complete by category","🏷 Change priority","🗑 Clear done tasks"].map(f=>(
              <span key={f} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"var(--accd)",color:"var(--acc)",border:"1px solid var(--acc)",fontWeight:600}}>{f}</span>
            ))}
          </div>
          <div style={{marginTop:16,fontSize:11,color:"var(--t3)"}}>🚀 Coming in next update</div>
        </div>
      </div>}
      {false&&<div style={{display:"none"}}>
      </div>}
    </>
  );

  // == ⌘ COMMAND PALETTE ==
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const cmdRef = useRef(null);
  useEffect(()=>{
    function h(e) {
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowCmdPalette(p=>!p);setCmdQuery("");}
      if((e.ctrlKey||e.metaKey)&&e.key==="n"){e.preventDefault();openAdd();}
      if((e.ctrlKey||e.metaKey)&&e.key==="b"){e.preventDefault();setShowSidebar(s=>!s);}
      if(e.key==="F5"){e.preventDefault();}
      if(e.key==="?"&&!e.ctrlKey){setShowShortcuts(s=>!s);} // prevent reload on Windows
      if(e.key==="Escape"){setShowCmdPalette(false);setShowFocusMode(false);}
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);
  useEffect(()=>{if(showCmdPalette)setTimeout(()=>cmdRef.current?.focus(),50);},[showCmdPalette]);
  const CMD_ACTIONS=[
    {icon:"➕",label:"Add New Task",         action:()=>{openAdd();setShowCmdPalette(false);},group:"Tasks"},
    {icon:"📝",label:"New Note",              action:()=>{setNoteForm({title:"",body:"",color:"#7c6dfa",pinned:false,category:"personal",tags:[]});setEditNote(null);setShowNoteModal(true);setShowCmdPalette(false);},group:"Notes"},
    {icon:"🏆",label:"New Goal",              action:()=>{setShowGoalModal(true);setShowCmdPalette(false);},group:"Goals"},
    {icon:"📅",label:"Go to Calendar",        action:()=>{setTab("calendar");setShowCmdPalette(false);},group:"Navigate"},
    {icon:"📊",label:"Go to Stats",           action:()=>{setTab("stats");setShowCmdPalette(false);},group:"Navigate"},
    {icon:"⏱",label:"Time Tracking",         action:()=>{setTab("time");setShowCmdPalette(false);},group:"Navigate"},
    {icon:"🧘",label:"Focus Timer",           action:()=>{setTab("focus");setShowCmdPalette(false);},group:"Navigate"},
    {icon:"🌌",label:"Enter Focus Mode",      action:()=>{setFocusTaskId(null);setShowFocusMode(true);setShowCmdPalette(false);},group:"Focus"},
    {icon:"🤖",label:"LIBI AI Assistant",        action:()=>{setTab("bot");play("tap");setShowCmdPalette(false);},group:"AI"},
    {icon:"📋",label:"Task Templates",        action:()=>{setShowTemplateModal(true);setShowCmdPalette(false);},group:"Tasks"},
    {icon:"😊",label:"Log Today's Mood",      action:()=>{setShowMoodModal(true);setShowCmdPalette(false);},group:"Wellness"},
    {icon:"☀️",label:"Toggle Dark/Light",     action:()=>{setDark(d=>!d);setShowCmdPalette(false);},group:"Settings"},
    {icon:"🏅",label:"View Gamification",     action:()=>{setShowGamificationModal(true);setShowCmdPalette(false);},group:"Rewards"},
    {icon:"🎯",label:"View Overdue Tasks",    action:()=>{setTab("overdue");setShowCmdPalette(false);},group:"Tasks"},
    {icon:"⭐",label:"View Starred Tasks",    action:()=>{setTab("starred");setShowCmdPalette(false);},group:"Tasks"},
  ];
  const filteredCmds=cmdQuery.trim()?CMD_ACTIONS.filter(c=>c.label.toLowerCase().includes(cmdQuery.toLowerCase())||c.group.toLowerCase().includes(cmdQuery.toLowerCase())):CMD_ACTIONS;
  const taskResults=cmdQuery.trim().length>=2?profileTasks.filter(t=>!t.done&&t.title.toLowerCase().includes(cmdQuery.toLowerCase())).slice(0,4):[];

  // == Persist ALL data to localStorage ==
  useEffect(()=>{try{localStorage.setItem("tf_greet_scene",greetScene);localStorage.setItem("tf_greet_bg",greetCardBg);localStorage.setItem("tf_greet_accent",greetAccent);}catch{}}, [greetScene,greetCardBg,greetAccent]);
  useEffect(()=>{try{localStorage.setItem("tf_icon",appIconEmoji);localStorage.setItem("tf_iconcolor",appIconColor);}catch{}}, [appIconEmoji,appIconColor]);
  useEffect(()=>{
    try{localStorage.setItem("tf_tasks",JSON.stringify(tasks));}catch{}
    // == Cross-device sync via Firebase (when signed in) ==
    if(authUser){
      getFirebase().then(fb=>{
        if(!fb) return;
        const uid2 = authUser.uid;
        const ref = fb.db.collection("users").doc(uid2);
        ref.set({
          tasks: tasks.slice(0,200), // Firestore limit
          goals, habits, moods: moods.slice(0,100),
          notes: notes.slice(0,50),
          finances: finances.slice(0,200),
          lastSync: Date.now(),
          profile: (profiles.find(p=>p.id===activeProfile)||profiles[0])?.name || "User"
        }, {merge:true}).catch(()=>{});
      });
    }
  }, [tasks, goals, habits, moods, notes, finances, authUser]);
  useEffect(()=>{try{localStorage.setItem("tf_cats",JSON.stringify(categories));}catch{}}, [categories]);
  useEffect(()=>{try{localStorage.setItem("tf_profiles",JSON.stringify(profiles));}catch{}}, [profiles]);
  useEffect(()=>{try{localStorage.setItem("tf_dark",JSON.stringify(dark));}catch{}}, [dark]);
  useEffect(()=>{try{localStorage.setItem("tf_accent",JSON.stringify(accentIdx));}catch{}}, [accentIdx]);
  useEffect(()=>{try{localStorage.setItem("tf_lang",langKey);}catch{}}, [langKey]);
  useEffect(()=>{try{localStorage.setItem("tf_goals",JSON.stringify(goals));}catch{}}, [goals]);
  useEffect(()=>{try{localStorage.setItem("tf_habits",JSON.stringify(habits));}catch{}}, [habits]);
  useEffect(()=>{try{localStorage.setItem("tf_notes",JSON.stringify(notes));}catch{}}, [notes]);
  useEffect(()=>{try{localStorage.setItem("tf_moods",JSON.stringify(moods));}catch{}}, [moods]);
  useEffect(()=>{try{localStorage.setItem("tf_wallpaper",wallpaper);}catch{}}, [wallpaper]);
  useEffect(()=>{try{localStorage.setItem("tf_boardcols",JSON.stringify(boardColumns));}catch{}}, [boardColumns]);
  useEffect(()=>{try{localStorage.setItem("tf_boardcards",JSON.stringify(boardCards));}catch{}}, [boardCards]);
  useEffect(()=>{try{localStorage.setItem("tf_time",JSON.stringify(timeEntries));}catch{}}, [timeEntries]);


  // == Social Share Card ==
  const generateShareCard = () => {
    const done = profileTasks.filter(t=>t.done).length;
    const total = profileTasks.length;
    const streak = gamStats?.streak || 0;
    const pct = total ? Math.round((done/total)*100) : 0;
    setShareStats({done, total, streak, pct, name: userName||"Taskflow User"});
    setShowShareModal(true);
  };

  const shareAchievement = async () => {
    if(!shareStats) return;
    const text = `🔥 I completed ${shareStats.done} tasks today on Taskflow!\n⚡ ${shareStats.streak} day streak | ${shareStats.pct}% completion rate\n\nGet Taskflow — the ultimate productivity app by LIBI Labs 🚀`;
    try {
      if(navigator.share) {
        await navigator.share({title:"Taskflow Achievement", text, url:"https://taskflow-ultimate.netlify.app"});
      } else {
        await navigator.clipboard.writeText(text);
        showNotif("📋 Copied!", "Share text copied to clipboard");
      }
    } catch(e) {}
    setShowShareModal(false);
  };


  // == Request Notification Permission ==
  const requestNotifPermission = async () => {
    if (!("Notification" in window)) { showNotif("❌ Not supported","Your browser doesn't support notifications"); return; }
    const result = await Notification.requestPermission();
    setNotifPermission(result);
    if(result==="granted") showNotif("🔔 Notifications enabled!","You'll get reminders even when the app is in background");
    else showNotif("❌ Blocked","Enable notifications in your browser settings");
  };


  // == Weekly Review ==
  const WeeklyReviewPage = () => {
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
    const weekDays = Array.from({length:7},(_,i)=>{
      const d = new Date(weekStart); d.setDate(weekStart.getDate()+i);
      const ds = d.toISOString().slice(0,10);
      const dayTasks = tasks.filter(t=>t.profileId===activeProfile&&new Date(t.createdAt).toISOString().slice(0,10)===ds);
      const doneTasks = dayTasks.filter(t=>t.done);
      return {date:ds, day:d.toLocaleDateString("en",{weekday:"short"}), total:dayTasks.length, done:doneTasks.length, isToday:ds===todayStr()};
    });
    const weekDone = weekDays.reduce((a,d)=>a+d.done,0);
    const weekTotal = weekDays.reduce((a,d)=>a+d.total,0);
    const bestDay = weekDays.reduce((a,b)=>b.done>a.done?b:a, weekDays[0]);
    const pct = weekTotal ? Math.round((weekDone/weekTotal)*100) : 0;
    const mood7 = moods.filter(m=>weekDays.some(d=>d.date===m.date));
    const avgEnergy = mood7.length ? (mood7.reduce((a,m)=>a+m.energy,0)/mood7.length).toFixed(1) : "—";

    return (
      <div style={{padding:"18px 18px 100px"}}>
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,marginBottom:4}}>📅 Weekly Review</div>
        <div style={{fontSize:13,color:"var(--t3)",marginBottom:20}}>{weekStart.toLocaleDateString("en",{month:"long",day:"numeric"})} — {now.toLocaleDateString("en",{month:"long",day:"numeric"})}</div>

        {/* Hero stat */}
        <div style={{background:`linear-gradient(135deg,var(--acc)22,var(--acc2)11)`,border:"1px solid var(--acc)44",borderRadius:22,padding:"24px 20px",marginBottom:16,textAlign:"center",position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-30,right:-30,fontSize:100,opacity:.06}}>📅</div>
          <div style={{fontSize:56,fontWeight:900,color:"var(--acc)",lineHeight:1}}>{pct}%</div>
          <div style={{fontSize:13,color:"var(--t2)",marginTop:4}}>completion rate this week</div>
          <div style={{fontSize:12,color:"var(--t3)",marginTop:6}}>{weekDone} of {weekTotal} tasks done</div>
        </div>

        {/* Day bars */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"16px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:14}}>Daily Breakdown</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
            {weekDays.map(d=>{
              const h = d.total ? Math.max(8,(d.done/d.total)*100) : 6;
              return (
                <div key={d.date} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:10,color:"var(--t3)",fontWeight:600}}>{d.done||""}</div>
                  <div style={{width:"100%",background:"var(--s3)",borderRadius:8,height:80,display:"flex",alignItems:"flex-end",overflow:"hidden"}}>
                    <div style={{width:"100%",height:`${h}%`,background:d.isToday?"var(--acc)":"var(--acc)88",borderRadius:8,transition:"height .6s cubic-bezier(.34,1.56,.64,1)",minHeight:d.done?4:0}}/>
                  </div>
                  <div style={{fontSize:10,fontWeight:d.isToday?800:600,color:d.isToday?"var(--acc)":"var(--t3)"}}>{d.day}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats row */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
          {[
            {icon:"🏆",label:"Best Day",val:bestDay.done>0?bestDay.day:"—"},
            {icon:"😊",label:"Avg Mood",val:avgEnergy},
            {icon:"🔥",label:"Streak",val:`${gamStats?.streak||0}d`},
          ].map(s=>(
            <div key={s.label} style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:16,padding:"14px 10px",textAlign:"center"}}>
              <div style={{fontSize:22,marginBottom:4}}>{s.icon}</div>
              <div style={{fontSize:18,fontWeight:800,color:"var(--t1)"}}>{s.val}</div>
              <div style={{fontSize:10.5,color:"var(--t3)",marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Motivational message */}
        <div style={{background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"18px 16px",textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:8}}>{pct>=80?"🌟":pct>=50?"💪":"🌱"}</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:18,marginBottom:8}}>
            {pct>=80?"Outstanding week!":pct>=50?"Solid progress!":"Keep pushing!"}
          </div>
          <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.6}}>
            {pct>=80?"You crushed it this week. Your consistency is building something great.":
             pct>=50?"More than half your tasks done — that's real progress. Keep the momentum!":
             "Every step forward counts. Tomorrow is a fresh start. You've got this!"}
          </div>
          <button onClick={generateShareCard} style={{marginTop:16,height:42,padding:"0 20px",background:"var(--acc)",borderRadius:12,fontSize:13,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>
            🚀 Share My Week
          </button>
        </div>
      </div>
    );
  };


  // == Voice Input (Web Speech API) ==
  const startVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ showNotif("❌ Not supported","Voice input needs Chrome or Edge"); return; }
    const rec = new SR();
    rec.lang = langKey==="ar"?"ar-SA":langKey==="hi"?"hi-IN":langKey==="fr"?"fr-FR":langKey==="es"?"es-ES":"en-US";
    rec.continuous = false;
    rec.interimResults = true;
    setIsListening(true);
    setVoiceTranscript("");
    haptic("medium");
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r=>r[0].transcript).join("");
      setVoiceTranscript(t);
      if(e.results[e.results.length-1].isFinal) {
        setIsListening(false);
        // Parse voice command
        const lower = t.toLowerCase();
        if(/add task|remind me to|new task|i need to/i.test(lower)) {
          const title = t.replace(/^(add task|remind me to|new task|i need to)\s*/i,"").trim();
          if(title) {
            const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
            const hasTmr = /tomorrow/i.test(lower);
            const newT = {...blankForm, title:title.replace(/[.!?]$/,""),
              due:hasTmr?tomorrow.toISOString().slice(0,10):"",
              profileId:activeProfile, createdAt:Date.now(), done:false, id:uid()};
            setTasks(ts=>[newT,...ts]);
            showNotif("🎤 Task added!",newT.title);
            play("add"); haptic("success");
          }
        } else if(/open|go to|show/i.test(lower)) {
          const tabMap = {tasks:"tasks",goals:"goals",habits:"habits",notes:"notes",calendar:"calendar",stats:"stats",board:"board",mood:"mood",focus:"focus",planner:"planner"};
          for(const [k,v] of Object.entries(tabMap)) { if(lower.includes(k)){setTab(v);break;} }
        } else {
          // Send to LIBI chat
          if(tab!=="bot") setTab("bot");
          sendChat(t);
        }
      }
    };
    rec.onerror = () => { setIsListening(false); showNotif("❌ Voice error","Try again"); };
    rec.onend = () => setIsListening(false);
    rec.start();
  };

  // == Dark/Light animated toggle ==
  const toggleDark = () => {
    setDarkAnimating(true);
    setTimeout(()=>{ setDark(d=>!d); setDarkAnimating(false); }, 300);
    play("tap"); haptic("light");
  };

  // == Streak milestone detector ==
  useEffect(()=>{
    const streak = gamStats?.streak||0;
    if([7,14,30,60,100,365].includes(streak)) {
      setStreakMilestone(streak);
      fireConfetti();
      setTimeout(()=>setStreakMilestone(null), 4000);
    }
  }, [gamStats?.streak]);


  // == Complete Onboarding ==
  function completeOnboarding() {
    // Save name to profiles
    if(onboardName.trim()) {
      setProfiles(ps=>ps.map((p,i)=>i===0?{...p,name:onboardName.trim()}:p));
      setLibiMemory(m=>({...m, name:onboardName.trim(), wakeTime:onboardWake,
        occupation:onboardUse==="study"?"student":onboardUse==="work"?"professional":"individual",
        facts:[`My name is ${onboardName.trim()}`,`I wake up at ${onboardWake}`,`I use Taskflow for ${onboardUse}`]
      }));
    }
    // Add first task if entered
    if(onboardTask.trim()) {
      const t2 = {id:uid(),title:onboardTask.trim(),notes:"",priority:"high",categoryId:"work",
        due:todayStr(),done:false,tags:[],subtasks:[],starred:false,recurring:"never",
        reminder:false,profileId:activeProfile,createdAt:Date.now(),timeEstimate:0,dependsOn:[]};
      setTasks(ts=>[t2,...ts]);
      awardXP(20,"First task added");
    }
    // Request notifications
    if("Notification" in window) Notification.requestPermission();
    // Mark onboarded
    localStorage.setItem("tf_onboarded","1");
    setHasOnboarded(true);
    play("complete"); fireConfetti();
    showNotif(`🎉 Welcome to Taskflow, ${onboardName.trim()||"friend"}!`,"LIBI is ready to help you crush it today 🚀");
  };


  // == Email Weekly Digest ==
  function sendEmailDigest() {
    const email = prompt("Enter your email address:");
    if(!email||!email.includes("@")) return;
    const done7 = profileTasks.filter(t=>t.done&&t.createdAt&&(Date.now()-new Date(t.createdAt).getTime())<7*24*60*60*1000).length;
    const active = profileTasks.filter(t=>!t.done).length;
    const streak = gamStats.streak||0;
    const subject = `Your Taskflow Weekly Digest 📊`;
    const body = `Hi ${libiMemory.name||"there"}!%0A%0AHere's your week in Taskflow:%0A%0A` +
      `✅ Tasks completed: ${done7}%0A` +
      `⏳ Active tasks: ${active}%0A` +
      `🔥 Current streak: ${streak} days%0A` +
      `📊 Completion rate: ${pct}%25%0A%0A` +
      `Keep up the amazing work!%0A%0A— LIBI, your AI productivity assistant%0A%0ATaskflow by LIBI Labs%0Ahttps://cute-scone-3c8acb.netlify.app`;
    window.open(`mailto:${email}?subject=${subject}&body=${body}`);
    showNotif("📧 Email digest ready!","Check your email app to send it");
  };


  return (
    <>

      {/* PIN SCREEN */}
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

      {!(locked && pinEnabled) && (
      <>
      {/* CMD PALETTE */}
      {showCmdPalette&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.82)",backdropFilter:"blur(18px)",zIndex:600,display:"flex",alignItems:"flex-start",justifyContent:"center",paddingTop:"8vh"}} onClick={()=>setShowCmdPalette(false)}>
          <div style={{background:dark?"rgba(8,10,20,0.98)":"rgba(255,255,255,0.98)",border:`1px solid ${accent.v}40`,borderRadius:22,width:"90%",maxWidth:540,boxShadow:`0 24px 60px rgba(0,0,0,.7)`,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",alignItems:"center",gap:12,padding:"16px 18px",borderBottom:"1px solid var(--b1)"}}>
              <span style={{fontSize:20,color:accent.v}}>⌘</span>
              <input ref={cmdRef} value={cmdQuery} onChange={e=>setCmdQuery(e.target.value)} placeholder="Search commands, tasks…" style={{flex:1,fontSize:15,fontWeight:500,color:"var(--t1)",background:"none",border:"none",outline:"none"}}/>
              <span style={{fontSize:11,padding:"3px 8px",borderRadius:7,background:"var(--s3)",color:"var(--t3)",fontWeight:700}}>ESC</span>
            </div>
            <div style={{maxHeight:360,overflowY:"auto",padding:"6px 0"}}>
              {taskResults.length>0&&<>
                <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:1.2,textTransform:"uppercase",padding:"8px 18px 4px"}}>Tasks</div>
                {taskResults.map(task=>(
                  <div key={task.id} onClick={()=>{setDetailTaskId(task.id);setShowCmdPalette(false);}} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=`${accent.v}12`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{fontSize:16}}>{PRIORITIES[task.priority]?.icon}</span>
                    <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600}}>{task.title}</div>{task.due&&<div style={{fontSize:11,color:"var(--t3)"}}>Due {fmtDate(task.due)}</div>}</div>
                    <span style={{fontSize:11,color:"var(--t3)"}}>open</span>
                  </div>
                ))}
                <div style={{height:1,background:"var(--b1)",margin:"4px 0"}}/>
              </>}
              {Object.entries(filteredCmds.reduce((g,c)=>({...g,[c.group]:[...(g[c.group]||[]),c]}),{})).map(([group,cmds])=>(
                <div key={group}>
                  <div style={{fontSize:10,fontWeight:800,color:"var(--t3)",letterSpacing:1.2,textTransform:"uppercase",padding:"8px 18px 4px"}}>{group}</div>
                  {cmds.map((cmd,i)=>(
                    <div key={i} onClick={cmd.action} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 18px",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.background=`${accent.v}12`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <span style={{fontSize:18,width:28,textAlign:"center"}}>{cmd.icon}</span>
                      <span style={{fontSize:13,fontWeight:600,flex:1,color:"var(--t1)"}}>{cmd.label}</span>
                      <span style={{fontSize:10,color:accent.v,fontWeight:700,padding:"2px 8px",borderRadius:20,background:`${accent.v}18`}}>{cmd.group}</span>
                    </div>
                  ))}
                </div>
              ))}
              {filteredCmds.length===0&&taskResults.length===0&&<div style={{textAlign:"center",padding:"28px",color:"var(--t3)"}}>No results for "{cmdQuery}"</div>}
            </div>
            <div style={{padding:"10px 18px",borderTop:"1px solid var(--b1)",display:"flex",gap:16,fontSize:11,color:"var(--t3)"}}>
              <span>↵ select</span><span>ESC close</span>
              <span style={{marginLeft:"auto",color:accent.v,fontWeight:700}}>⌘K to open</span>
            </div>
          </div>
        </div>
      )}

      {/* FOCUS MODE */}
      {showFocusMode&&(()=>{
        const focusTask=focusTaskId?tasks.find(t=>t.id===focusTaskId):profileTasks.filter(t=>!t.done)[0];
        const digest=getDailyDigest();
        return(
          <div style={{position:"fixed",inset:0,background:"linear-gradient(160deg,#000008,#0a0020,#1a0040,#0d0030)",zIndex:500,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:24}}>
            {[...Array(25)].map((_,i)=><div key={i} style={{position:"absolute",width:isForest?(i%4===0?8:5):(i%3===0?3:2),height:isForest?(i%4===0?8:5):(i%3===0?3:2),borderRadius:isForest?"3px 50%":"50%",background:isForest?(i%3===0?"#4ade8088":i%3===1?"#22c55e60":"#86efac50"):"#fff",opacity:.1+Math.random()*.7,top:`${Math.random()*100}%`,left:`${Math.random()*100}%`,animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite`,animationDelay:`${Math.random()*4}s`,pointerEvents:"none"}}/>)}
            <button onClick={()=>setShowFocusMode(false)} style={{position:"absolute",top:20,right:20,width:40,height:40,borderRadius:12,background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",color:"rgba(255,255,255,.7)",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            <div style={{position:"absolute",top:20,left:24,fontFamily:"'Instrument Serif',serif",fontSize:22,color:accent.v}}>{String(liveHour).padStart(2,"0")}:{String(liveMin).padStart(2,"0")}</div>
            {focusTask?(
              <div style={{textAlign:"center",maxWidth:480,padding:"0 24px",zIndex:1}}>
                <div style={{fontSize:12,fontWeight:800,color:accent.v,letterSpacing:1.8,textTransform:"uppercase",marginBottom:12}}>🌌 FOCUS MODE</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:30,color:"#eceeff",lineHeight:1.3,marginBottom:14}}>{focusTask.title}</div>
                {focusTask.notes&&<div style={{fontSize:13,color:"rgba(255,255,255,.5)",lineHeight:1.7,marginBottom:16}}>{focusTask.notes}</div>}
                <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:20}}>
                  <div style={{background:"rgba(255,255,255,.06)",borderRadius:16,padding:"12px 20px",border:"1px solid rgba(255,255,255,.1)"}}>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:accent.v}}>{activeTimer?.taskId===focusTask.id?(activeTimer?`${String(Math.floor((Date.now()-activeTimer.startedAt)/60000)).padStart(2,"0")}:${String(Math.floor(((Date.now()-activeTimer.startedAt)%60000)/1000)).padStart(2,"0")}`:"00:00"):"00:00"}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.35)",marginTop:2}}>session</div>
                  </div>
                  <div style={{background:"rgba(255,255,255,.06)",borderRadius:16,padding:"12px 20px",border:"1px solid rgba(255,255,255,.1)"}}>
                    <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#6bcb77"}}>{fmtTime(getTaskTime(focusTask.id)).split(" ")[0]||"0m"}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,.35)",marginTop:2}}>total</div>
                  </div>
                </div>
                <textarea value={focusNotes} onChange={e=>setFocusNotes(e.target.value)} placeholder="Notes while you work…" style={{width:"100%",maxWidth:400,height:72,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.1)",borderRadius:13,padding:"11px 14px",color:"#eceeff",fontSize:13,resize:"none",marginBottom:18}}/>
                <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
                  <button onClick={()=>activeTimer?.taskId===focusTask.id?stopTimer():startTimer(focusTask.id)} style={{height:42,padding:"0 20px",background:activeTimer?.taskId===focusTask.id?"rgba(255,107,107,.22)":"rgba(124,109,250,.22)",border:`1.5px solid ${activeTimer?.taskId===focusTask.id?"#ff6b6b":accent.v}`,borderRadius:12,color:activeTimer?.taskId===focusTask.id?"#ff6b6b":accent.v,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    {activeTimer?.taskId===focusTask.id?"⏹ Stop":"▶ Start"}
                  </button>
                  <button onClick={()=>{toggle(focusTask.id);setShowFocusMode(false);}} style={{height:42,padding:"0 20px",background:"rgba(107,203,119,.18)",border:"1.5px solid #6bcb77",borderRadius:12,color:"#6bcb77",fontSize:13,fontWeight:700,cursor:"pointer"}}>✅ Done</button>
                  <button onClick={()=>{const n=profileTasks.filter(t=>!t.done&&t.id!==focusTask.id)[0];if(n)setFocusTaskId(n.id);}} style={{height:42,padding:"0 16px",background:"rgba(255,255,255,.06)",border:"1.5px solid rgba(255,255,255,.15)",borderRadius:12,color:"rgba(255,255,255,.5)",fontSize:13,cursor:"pointer"}}>⏭ Next</button>
                </div>
              </div>
            ):<div style={{textAlign:"center",color:"rgba(255,255,255,.5)"}}>
              <div style={{fontSize:48,marginBottom:12}}>🎉</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:isForest?"#14532d":"#eceeff"}}>All done!</div>
            </div>}
            <div style={{position:"absolute",bottom:22,left:"50%",transform:"translateX(-50%)",display:"flex",gap:14,background:"rgba(255,255,255,.05)",borderRadius:16,padding:"10px 18px",border:"1px solid rgba(255,255,255,.08)"}}>
              {[{icon:"⏳",val:digest.dueToday.length,label:"due"},{icon:"🔥",val:`${digest.streak}d`,label:"streak"},{icon:"✅",val:digest.completedToday.length,label:"done"}].map(s=>(
                <div key={s.label} style={{textAlign:"center"}}>
                  <div style={{fontSize:14}}>{s.icon}</div>
                  <div style={{fontFamily:"'Instrument Serif',serif",fontSize:17,color:accent.v}}>{s.val}</div>
                  <div style={{fontSize:9,color:"rgba(255,255,255,.3)"}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* TEMPLATES MODAL */}
      {showTemplateModal&&(
        <div className="overlay" onClick={()=>setShowTemplateModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">📋 Task Templates</div><button className="ic-btn" onClick={()=>setShowTemplateModal(false)}>✕</button></div>
            <div className="m-body">
              <div style={{fontSize:12.5,color:"var(--t2)",marginBottom:2}}>Instantly add a curated set of tasks for common workflows.</div>
              {TASK_TEMPLATES.map(tmpl=>(
                <div key={tmpl.id} style={{background:`${tmpl.color}10`,border:`1.5px solid ${tmpl.color}28`,borderRadius:16,padding:"14px",cursor:"pointer",transition:"all .2s",marginBottom:8}} onClick={()=>applyTemplate(tmpl)} onMouseEnter={e=>e.currentTarget.style.borderColor=`${tmpl.color}65`} onMouseLeave={e=>e.currentTarget.style.borderColor=`${tmpl.color}28`}>
                  <div style={{display:"flex",alignItems:"center",gap:11,marginBottom:8}}>
                    <div style={{width:40,height:40,borderRadius:12,background:`${tmpl.color}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{tmpl.icon}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:800,color:"var(--t1)"}}>{tmpl.name}</div>
                      <div style={{fontSize:11.5,color:"var(--t3)",marginTop:1}}>{tmpl.desc}</div>
                    </div>
                    <div style={{fontSize:11,fontWeight:700,color:tmpl.color,background:`${tmpl.color}18`,padding:"3px 10px",borderRadius:20,flexShrink:0}}>{tmpl.tasks.length} tasks</div>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {tmpl.tasks.slice(0,3).map((task,i)=><span key={i} style={{fontSize:10,padding:"2px 7px",borderRadius:20,background:`${tmpl.color}16`,color:tmpl.color}}>{task.slice(0,28)}{task.length>28?"...":""}</span>)}
                    {tmpl.tasks.length>3&&<span style={{fontSize:10,color:"var(--t3)"}}>+{tmpl.tasks.length-3} more</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowTemplateModal(false)}>Close</button></div>
          </div>
        </div>
      )}

      {/* == 🤖 AI NATURAL LANGUAGE TASK EDITOR == */}
      {showAiNL&&(
        <div className="overlay" onClick={()=>{setShowAiNL(false);setAiNLResult(null);setAiNLInput("");}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
            <div className="drag"/>
            <div className="m-head">
              <div className="m-title">🤖 AI Task Editor</div>
              <button className="ic-btn" onClick={()=>{setShowAiNL(false);setAiNLResult(null);setAiNLInput("");}}>✕</button>
            </div>
            <div className="m-body">
              <div style={{fontSize:12.5,color:"var(--t2)",lineHeight:1.6,marginBottom:4}}>
                Type a command in plain English — the AI will figure out what to do.
              </div>
              {/* Examples */}
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:4}}>
                {["Move my work tasks to tomorrow","Complete all high priority tasks","Set learning tasks to high priority","Delete all completed tasks","Star all overdue tasks"].map(ex=>(
                  <button key={ex} onClick={()=>{setAiNLInput(ex);setAiNLResult(parseNaturalLanguageCommand(ex));}} style={{fontSize:10.5,padding:"4px 10px",borderRadius:20,background:"var(--accd)",color:"var(--acc)",border:"1px solid var(--acc)",cursor:"pointer",fontWeight:600}}>{ex}</button>
                ))}
              </div>
              {/* Input */}
              <div>
                <div className="f-lbl">Your command</div>
                <div style={{display:"flex",gap:8}}>
                  <input className="f-in" autoFocus placeholder='e.g. "Move my work tasks to tomorrow"' value={aiNLInput} onChange={e=>{setAiNLInput(e.target.value);if(e.target.value.trim().length>5)setAiNLResult(parseNaturalLanguageCommand(e.target.value));else setAiNLResult(null);}} onKeyDown={e=>e.key==="Enter"&&aiNLResult&&!aiNLResult.error&&executeNLCommand()} style={{flex:1}}/>
                </div>
              </div>
              {/* Result preview */}
              {aiNLResult&&(
                aiNLResult.error ? (
                  <div style={{background:"rgba(255,107,107,.12)",border:"1px solid rgba(255,107,107,.3)",borderRadius:13,padding:"12px 14px",fontSize:13,color:"var(--red)"}}>{aiNLResult.error}</div>
                ) : (
                  <div style={{background:`${accent.v}12`,border:`1.5px solid ${accent.v}30`,borderRadius:14,padding:"14px"}}>
                    <div style={{fontSize:13,fontWeight:800,color:accent.v,marginBottom:10}}>✅ {aiNLResult.preview}</div>
                    <div style={{fontSize:11.5,color:"var(--t3)",marginBottom:10}}>Affected tasks ({aiNLResult.affected.length}):</div>
                    <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:160,overflowY:"auto"}}>
                      {aiNLResult.affected.slice(0,8).map(t=>(
                        <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",background:"var(--s2)",borderRadius:10}}>
                          <span style={{fontSize:13}}>{PRIORITIES[t.priority]?.icon}</span>
                          <span style={{fontSize:12.5,fontWeight:600,flex:1,color:"var(--t1)"}}>{t.title}</span>
                          {t.due&&<span style={{fontSize:10.5,color:"var(--t3)"}}>{fmtDate(t.due)}</span>}
                        </div>
                      ))}
                      {aiNLResult.affected.length>8&&<div style={{fontSize:11,color:"var(--t3)",textAlign:"center"}}>+{aiNLResult.affected.length-8} more</div>}
                    </div>
                  </div>
                )
              )}
            </div>
            <div className="m-foot">
              <button className="btn-c" onClick={()=>{setShowAiNL(false);setAiNLResult(null);setAiNLInput("");}}>Cancel</button>
              <button className="btn-s" disabled={!aiNLResult||!!aiNLResult.error} onClick={executeNLCommand}>🤖 Execute</button>
            </div>
          </div>
        </div>
      )}


      {/* == ICS IMPORT MODAL == */}
      {showICSModal&&(
        <div className="overlay" onClick={()=>setShowICSModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">📅 Import Calendar</div><button className="ic-btn" onClick={()=>setShowICSModal(false)}>✕</button></div>
            <div className="m-body">
              <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.7,marginBottom:14}}>Export your Google Calendar as a <strong>.ics file</strong> — each event becomes a task with the correct due date.</div>
              <div style={{background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:12,padding:"12px 14px",marginBottom:14,fontSize:12,color:"var(--t2)",lineHeight:1.9}}>
                <div style={{fontWeight:700,color:"var(--t1)",marginBottom:6}}>How to export:</div>
                <div>1. Open <strong>calendar.google.com</strong></div>
                <div>2. Settings ⚙️ → <strong>Import &amp; Export</strong></div>
                <div>3. Click <strong>Export</strong> → extract the zip</div>
                <div>4. Upload the <strong>.ics file</strong> below ↓</div>
              </div>
              <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"24px",background:`${accent.v}10`,border:`2px dashed ${accent.v}40`,borderRadius:14,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor=accent.v} onMouseLeave={e=>e.currentTarget.style.borderColor=`${accent.v}40`}>
                <div style={{fontSize:36}}>📂</div>
                <div style={{fontSize:13,fontWeight:700,color:accent.v}}>Choose .ics file</div>
                <div style={{fontSize:11,color:"var(--t3)"}}>Google · Apple · Outlook</div>
                <input type="file" accept=".ics" style={{display:"none"}} onChange={importICS}/>
              </label>
            </div>
            <div className="m-foot"><button className="btn-c" onClick={()=>setShowICSModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* == SPLASH SCREEN == */}
      {showSplash&&onboardStep===0&&(
        <div style={{position:"fixed",inset:0,background:"linear-gradient(135deg,#0a0a1a 0%,#1a0a2e 50%,#0d1a3e 100%)",zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:0}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:80,marginBottom:8,filter:"drop-shadow(0 0 30px #7c6dfa)",animation:"splash-pulse 2s ease-in-out infinite"}}>✦</div>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:42,color:"#fff",letterSpacing:-1,marginBottom:4}}>Taskflow</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.4)",letterSpacing:3,textTransform:"uppercase",marginBottom:48}}>by LIBI Labs</div>
            <div style={{width:48,height:48,border:"3px solid transparent",borderTopColor:"#7c6dfa",borderRadius:"50%",animation:"spin 1s linear infinite",margin:"0 auto"}}/>
          </div>
          <style>{`
            @keyframes splash-pulse { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.08);opacity:.8} }
            @keyframes spin { to{transform:rotate(360deg)} }
          `}</style>
        </div>
      )}

      {/* == GOOGLE SIGN-IN SPLASH == */}
      {showAuthScreen&&!authUser&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:dark?"linear-gradient(160deg,#04060e 0%,#0d0a1e 50%,#1a1040 100%)":"linear-gradient(160deg,#f0f4ff 0%,#e8f0fe 50%,#dde8ff 100%)"}}>
          {/* Animated background particles */}
          {[...Array(12)].map((_,i)=>(
            <div key={i} style={{position:"absolute",width:i%3===0?4:2,height:i%3===0?4:2,borderRadius:"50%",background:accent.v,opacity:.15+Math.random()*.2,top:`${10+Math.random()*80}%`,left:`${Math.random()*100}%`,animation:`twinkle ${2+Math.random()*3}s ease-in-out infinite`,animationDelay:`${Math.random()*3}s`,pointerEvents:"none"}}/>
          ))}

          {/* Logo */}
          <div style={{width:80,height:80,borderRadius:24,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,marginBottom:20,boxShadow:`0 0 40px ${accent.v}60,0 8px 32px ${accent.v}40`,animation:"galaxyPulse 3s ease-in-out infinite"}}>✦</div>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:36,marginBottom:6,background:`linear-gradient(135deg,${accent.v},${accent.g})`,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>Taskflow</div>
          <div style={{fontSize:14,color:"var(--t2)",marginBottom:40,textAlign:"center",lineHeight:1.6}}>Your personal AI-powered task manager.<br/>Sign in to sync across all your devices.</div>

          {/* Google Sign In — PRIMARY */}
          <button onClick={async()=>{
              setAuthError("");
              setAuthLoading(true);
              // Pre-warm Firebase before calling signInWithGoogle
              try{
                const fb = await getFirebase();
                if(!fb){ setAuthError("Could not reach Google servers. Check your internet and try again."); setAuthLoading(false); return; }
                await signInWithGoogle();
              }catch(e){
                setAuthError("Sign-in failed. Check your connection and try again.");
              }finally{setAuthLoading(false);}
            }} disabled={authLoading}
            style={{width:"100%",maxWidth:320,height:52,background:"#fff",borderRadius:16,fontSize:15,fontWeight:700,color:"#1a1a1a",border:"2px solid #e0e0e0",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:14,boxShadow:"0 4px 20px rgba(0,0,0,0.12)",transition:"all .2s",opacity:authLoading?.6:1}}>
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"/>
              <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
            </svg>
            {authLoading?"Signing in…":"Continue with Google"}
          </button>

          {/* OR divider */}
          <div style={{display:"flex",alignItems:"center",gap:12,width:"100%",maxWidth:320,marginBottom:14}}>
            <div style={{flex:1,height:1,background:"var(--b1)"}}/>
            <span style={{fontSize:12,color:"var(--t3)",fontWeight:600}}>OR</span>
            <div style={{flex:1,height:1,background:"var(--b1)"}}/>
          </div>

          {/* Email sign in toggle */}
          {authMode==="email"?(
            <div style={{width:"100%",maxWidth:320}}>
              <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="Email" type="email" style={{width:"100%",background:"var(--s2)",border:"1.5px solid var(--b1)",borderRadius:12,padding:"12px 14px",fontSize:14,color:"var(--t1)",outline:"none",marginBottom:10}}/>
              <input value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="Password (min 6 chars)" type="password" style={{width:"100%",background:"var(--s2)",border:"1.5px solid var(--b1)",borderRadius:12,padding:"12px 14px",fontSize:14,color:"var(--t1)",outline:"none",marginBottom:10}}/>
              {authError&&<div style={{color:"#ff6b6b",fontSize:12,marginBottom:8,textAlign:"center"}}>{authError}</div>}
              <div style={{display:"flex",gap:8}}>
                <button onClick={async()=>{setAuthLoading(true);try{const fb=await getFirebase();if(!fb)throw new Error("Check connection");await fb.auth.signInWithEmailAndPassword(authEmail,authPassword);showNotif("✅ Signed in!",authEmail);}catch(e){setAuthError(e.code==="auth/wrong-password"?"Wrong password":e.code==="auth/user-not-found"?"No account found":e.message);}finally{setAuthLoading(false);}}} style={{flex:1,height:46,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:12,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",opacity:authLoading?.6:1}}>Sign In</button>
                <button onClick={async()=>{setAuthLoading(true);try{const fb=await getFirebase();if(!fb)throw new Error("Check connection");const c=await fb.auth.createUserWithEmailAndPassword(authEmail,authPassword);showNotif("🎉 Account created!",authEmail);}catch(e){setAuthError(e.code==="auth/email-already-in-use"?"Email already in use":e.code==="auth/weak-password"?"Min 6 characters":e.message);}finally{setAuthLoading(false);}}} style={{flex:1,height:46,background:"var(--s2)",borderRadius:12,fontSize:14,fontWeight:600,color:"var(--t2)",border:"1px solid var(--b1)",cursor:"pointer"}}>Sign Up</button>
              </div>
              <button onClick={()=>setAuthMode("splash")} style={{width:"100%",marginTop:8,height:36,background:"none",border:"none",color:"var(--t3)",fontSize:12,cursor:"pointer"}}>← Back</button>
            </div>
          ):(
            <div style={{width:"100%",maxWidth:320,display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>setAuthMode("email")} style={{width:"100%",height:48,background:"var(--s2)",borderRadius:14,fontSize:14,fontWeight:600,color:"var(--t2)",border:"1.5px solid var(--b1)",cursor:"pointer",transition:"all .2s"}}>
                ✉️ Sign in with Email
              </button>
              <button onClick={continueAsGuest} style={{width:"100%",height:48,background:"transparent",borderRadius:14,fontSize:14,fontWeight:600,color:"var(--t3)",border:"1.5px solid var(--b1)",cursor:"pointer",transition:"all .2s"}}>
                Continue as Guest
              </button>
            </div>
          )}

          {authError&&authMode!=="email"&&<div style={{color:"#ff6b6b",fontSize:12,marginTop:10,textAlign:"center"}}>{authError}</div>}

          <div style={{marginTop:28,fontSize:11,color:"var(--t3)",textAlign:"center",lineHeight:1.8,maxWidth:300}}>
            By continuing you agree to our{" "}
            <button onClick={()=>{setShowAuthScreen(false);setGuestMode(true);setTimeout(()=>setShowPrivacy(true),100);}} style={{background:"none",border:"none",color:accent.v,cursor:"pointer",fontSize:11,textDecoration:"underline",padding:0}}>Privacy Policy</button>
            {" & "}
            <button onClick={()=>{setShowAuthScreen(false);setGuestMode(true);setTimeout(()=>setShowPrivacy(true),100);}} style={{background:"none",border:"none",color:accent.v,cursor:"pointer",fontSize:11,textDecoration:"underline",padding:0}}>Terms</button>
          </div>
        </div>
      )}

      {/* == ONBOARDING FLOW == */}
      {onboardStep>0&&onboardStep<=4&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.92)",backdropFilter:"blur(20px)",zIndex:9000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"24px"}}>
          {/* Progress dots */}
          <div style={{display:"flex",gap:8,marginBottom:32}}>
            {[1,2,3,4].map(i=><div key={i} style={{width:i===onboardStep?24:8,height:8,borderRadius:4,background:i<=onboardStep?"var(--acc)":"rgba(255,255,255,.2)",transition:"all .3s"}}/>)}
          </div>

          {onboardStep===1&&(
            <div style={{textAlign:"center",maxWidth:360}}>
              <div style={{fontSize:72,marginBottom:16,filter:"drop-shadow(0 0 20px #7c6dfa)"}}>✦</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:34,color:"#fff",marginBottom:12,lineHeight:1.2}}>Welcome to<br/>Taskflow</div>
              <div style={{fontSize:15,color:"rgba(255,255,255,.65)",lineHeight:1.7,marginBottom:32}}>The most personal task manager you've ever used. Built for focus, designed for you.</div>
              <div style={{marginBottom:20}}>
                <div style={{fontSize:13,color:"rgba(255,255,255,.5)",marginBottom:8}}>What should I call you?</div>
                <input autoFocus value={onboardName} onChange={e=>setOnboardName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&onboardName.trim()&&setOnboardStep(2)} placeholder="Your name…" style={{width:"100%",padding:"14px 18px",borderRadius:14,background:"rgba(255,255,255,.1)",border:"1.5px solid rgba(255,255,255,.2)",color:"#fff",fontSize:16,outline:"none",textAlign:"center"}}/>
              </div>
              <button disabled={!onboardName.trim()} onClick={()=>{setUserName(onboardName.trim());localStorage.setItem("tf_username",onboardName.trim());setOnboardStep(2);}} style={{width:"100%",height:52,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:14,fontSize:15,fontWeight:800,color:"#fff",border:"none",cursor:"pointer",opacity:onboardName.trim()?1:.4,boxShadow:"0 8px 28px #7c6dfa60"}}>
                Let's go →
              </button>
            </div>
          )}

          {onboardStep===2&&(
            <div style={{textAlign:"center",maxWidth:360}}>
              <div style={{fontSize:64,marginBottom:16}}>📋</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:"#fff",marginBottom:12}}>Smart Tasks</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,.65)",lineHeight:1.8,marginBottom:32}}>Add tasks with priorities, due dates, subtasks, reminders and categories. Swipe right to complete, left to delete on mobile. Double-tap for fullscreen Focus Mode.</div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:32}}>
                {["🔴 High priority tasks — tackled first","📅 Due dates with smart reminders","🔄 Recurring tasks that auto-regenerate","⭐ Star your most important ones"].map((f,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.08)",borderRadius:12,padding:"11px 14px",textAlign:"left"}}>
                    <span style={{fontSize:13,color:"rgba(255,255,255,.8)"}}>{f}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>setOnboardStep(3)} style={{width:"100%",height:50,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:14,fontSize:15,fontWeight:800,color:"#fff",border:"none",cursor:"pointer",boxShadow:"0 8px 28px #7c6dfa60"}}>Next →</button>
            </div>
          )}

          {onboardStep===3&&(
            <div style={{textAlign:"center",maxWidth:360}}>
              <div style={{fontSize:64,marginBottom:16}}>🤖</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:"#fff",marginBottom:12}}>Meet LIBI</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,.65)",lineHeight:1.8,marginBottom:32}}>Your personal AI, built right in. Ask me anything — plan your day, get motivated, break down goals. I work 100% offline, always.</div>
              <div style={{background:"rgba(124,109,250,.15)",border:"1px solid #7c6dfa40",borderRadius:16,padding:"16px",marginBottom:32,textAlign:"left"}}>
                <div style={{fontSize:12,color:"#a78bfa",fontWeight:700,marginBottom:10}}>Try asking LIBI:</div>
                {["Plan my day","Remind me to call mum tomorrow","I'm feeling overwhelmed","Give me a productivity tip"].map((q,i)=>(
                  <div key={i} style={{fontSize:13,color:"rgba(255,255,255,.7)",padding:"5px 0",borderBottom:i<3?"1px solid rgba(255,255,255,.06)":"none"}}>{q}</div>
                ))}
              </div>
              <button onClick={()=>setOnboardStep(4)} style={{width:"100%",height:50,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:14,fontSize:15,fontWeight:800,color:"#fff",border:"none",cursor:"pointer",boxShadow:"0 8px 28px #7c6dfa60"}}>Next →</button>
            </div>
          )}

          {onboardStep===4&&(
            <div style={{textAlign:"center",maxWidth:360}}>
              <div style={{fontSize:64,marginBottom:16}}>🚀</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:28,color:"#fff",marginBottom:12}}>You're all set!</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,.65)",lineHeight:1.8,marginBottom:28}}>Taskflow has Focus timers, Habit tracking, a Mood journal, Daily Planner, AI task breakdown, and much more. Explore at your own pace.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:32}}>
                {[["⏱","Focus & Time"],["🔁","Habits"],["😊","Mood Journal"],["📊","Statistics"]].map(([ic,lb])=>(
                  <div key={lb} style={{background:"rgba(255,255,255,.07)",borderRadius:12,padding:"14px 10px",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                    <span style={{fontSize:24}}>{ic}</span>
                    <span style={{fontSize:11.5,color:"rgba(255,255,255,.6)",fontWeight:600}}>{lb}</span>
                  </div>
                ))}
              </div>
              <button onClick={()=>{setOnboardStep(0);localStorage.setItem("tf_onboarded","1");if(!localStorage.getItem("tf_launched"))setShowTemplateModal(true);}} style={{width:"100%",height:52,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:14,fontSize:16,fontWeight:800,color:"#fff",border:"none",cursor:"pointer",boxShadow:"0 8px 28px #7c6dfa60"}}>
                Start using Taskflow ✦
              </button>
            </div>
          )}
        </div>
      )}
      {/* == CONFETTI BURST == */}
      {confettiBurst&&(
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:8000,overflow:"hidden"}}>
          {[...Array(32)].map((_,i)=>{
            const colors=["#7c6dfa","#ffd93d","#6bcb77","#ff6b9d","#48dbfb","#ff9f43","#a855f7","#ff6b6b"];
            const color=colors[i%colors.length];
            const x=10+Math.random()*80;
            const delay=Math.random()*0.4;
            const size=6+Math.random()*8;
            const rot=Math.random()*360;
            return <div key={i} style={{position:"absolute",left:`${x}%`,top:"-10px",width:size,height:size*0.6,background:color,borderRadius:2,transform:`rotate(${rot}deg)`,animation:`confettiFall ${1.2+Math.random()*0.8}s ease-in ${delay}s forwards`,opacity:.9}}/>;
          })}
        </div>
      )}
      

      {/* == ONBOARDING == */}
      {!hasOnboarded&&(
        <div style={{position:"fixed",inset:0,zIndex:9999,background:"#04060e",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>

          {/* Progress dots */}
          <div style={{display:"flex",gap:8,marginBottom:40}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:i===onboardStep?24:8,height:8,borderRadius:4,background:i<=onboardStep?accent.v:"var(--s3)",transition:"all .3s"}}/>
            ))}
          </div>

          {/* Step 0: Welcome + Name */}
          {onboardStep===0&&(
            <div style={{width:"100%",maxWidth:360,textAlign:"center",animation:"milestoneIn .5s ease both"}}>
              <div style={{fontSize:64,marginBottom:16}}>✦</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:32,color:"#eceeff",marginBottom:8,letterSpacing:-1}}>Welcome to Taskflow</div>
              <div style={{fontSize:15,color:"var(--t3)",marginBottom:32,lineHeight:1.6}}>Built by LIBI Labs. Your AI-powered productivity companion.</div>
              <div style={{textAlign:"left",marginBottom:16}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",marginBottom:8,letterSpacing:.5}}>WHAT'S YOUR NAME?</div>
                <input value={onboardName} onChange={e=>setOnboardName(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&onboardName.trim()&&setOnboardStep(1)}
                  placeholder="e.g. Alex, Sarah, Marcus…" autoFocus
                  style={{width:"100%",background:"var(--s2)",border:`1.5px solid ${accent.v}60`,borderRadius:14,padding:"14px 16px",fontSize:16,color:"#eceeff",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <button onClick={()=>onboardName.trim()&&setOnboardStep(1)} disabled={!onboardName.trim()}
                style={{width:"100%",height:52,background:onboardName.trim()?`linear-gradient(135deg,${accent.v},${accent.g})`:"var(--s3)",borderRadius:16,fontSize:16,fontWeight:700,color:"#fff",border:"none",cursor:onboardName.trim()?"pointer":"not-allowed",transition:"all .2s",marginBottom:12}}>
                Continue →
              </button>
            </div>
          )}

          {/* Step 1: Use case */}
          {onboardStep===1&&(
            <div style={{width:"100%",maxWidth:360,textAlign:"center",animation:"milestoneIn .5s ease both"}}>
              <div style={{fontSize:48,marginBottom:12}}>👋</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#eceeff",marginBottom:6}}>Hi {onboardName}!</div>
              <div style={{fontSize:14,color:"var(--t3)",marginBottom:28}}>What will you mostly use Taskflow for?</div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24}}>
                {[
                  {id:"work",    icon:"💼", title:"Work & Career",     sub:"Projects, meetings, deadlines"},
                  {id:"study",   icon:"📚", title:"Studying",          sub:"Assignments, exams, research"},
                  {id:"personal",icon:"🌱", title:"Personal Growth",   sub:"Habits, goals, self-improvement"},
                  {id:"all",     icon:"⚡", title:"Everything",        sub:"Work, study and personal life"},
                ].map(opt=>(
                  <div key={opt.id} onClick={()=>setOnboardUse(opt.id)}
                    style={{padding:"14px 16px",borderRadius:16,border:`2px solid ${onboardUse===opt.id?accent.v:"var(--b1)"}`,background:onboardUse===opt.id?`${accent.v}15`:"var(--s1)",cursor:"pointer",display:"flex",alignItems:"center",gap:14,textAlign:"left",transition:"all .15s"}}>
                    <div style={{fontSize:28,flexShrink:0}}>{opt.icon}</div>
                    <div>
                      <div style={{fontSize:14,fontWeight:700,color:"#eceeff"}}>{opt.title}</div>
                      <div style={{fontSize:12,color:"var(--t3)",marginTop:1}}>{opt.sub}</div>
                    </div>
                    {onboardUse===opt.id&&<div style={{marginLeft:"auto",color:accent.v,fontSize:18,flexShrink:0}}>✓</div>}
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setOnboardStep(0)} style={{flex:1,height:48,background:"var(--s2)",borderRadius:14,fontSize:14,color:"var(--t3)",border:"1px solid var(--b1)",cursor:"pointer"}}>← Back</button>
                <button onClick={()=>onboardUse&&setOnboardStep(2)} disabled={!onboardUse}
                  style={{flex:2,height:48,background:onboardUse?`linear-gradient(135deg,${accent.v},${accent.g})`:"var(--s3)",borderRadius:14,fontSize:15,fontWeight:700,color:"#fff",border:"none",cursor:onboardUse?"pointer":"not-allowed",transition:"all .2s"}}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Wake time + notifications */}
          {onboardStep===2&&(
            <div style={{width:"100%",maxWidth:360,textAlign:"center",animation:"milestoneIn .5s ease both"}}>
              <div style={{fontSize:48,marginBottom:12}}>⏰</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#eceeff",marginBottom:6}}>Set your morning</div>
              <div style={{fontSize:14,color:"var(--t3)",marginBottom:28,lineHeight:1.6}}>LIBI will send you a daily briefing at your wake-up time. Never miss a task again.</div>
              <div style={{textAlign:"left",marginBottom:20}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t3)",marginBottom:10,letterSpacing:.5}}>WHAT TIME DO YOU WAKE UP?</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {["5:00 AM","6:00 AM","7:00 AM","7:30 AM","8:00 AM","8:30 AM","9:00 AM","10:00 AM"].map(t=>(
                    <div key={t} onClick={()=>setOnboardWake(t)}
                      style={{padding:"10px 16px",borderRadius:11,border:`2px solid ${onboardWake===t?accent.v:"var(--b1)"}`,background:onboardWake===t?`${accent.v}20`:"var(--s2)",cursor:"pointer",fontSize:13,fontWeight:600,color:onboardWake===t?accent.v:"var(--t2)",transition:"all .15s"}}>
                      {t}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{background:`${accent.v}12`,border:`1px solid ${accent.v}25`,borderRadius:14,padding:"12px 16px",textAlign:"left",marginBottom:20}}>
                <div style={{fontSize:12,color:accent.v,fontWeight:700,marginBottom:3}}>🔔 Daily briefing</div>
                <div style={{fontSize:12,color:"var(--t3)",lineHeight:1.5}}>At {onboardWake} LIBI will remind you of today's tasks, your streak and any overdue items.</div>
              </div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>setOnboardStep(1)} style={{flex:1,height:48,background:"var(--s2)",borderRadius:14,fontSize:14,color:"var(--t3)",border:"1px solid var(--b1)",cursor:"pointer"}}>← Back</button>
                <button onClick={()=>setOnboardStep(3)} style={{flex:2,height:48,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:14,fontSize:15,fontWeight:700,color:"#fff",border:"none",cursor:"pointer"}}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: First task */}
          {onboardStep===3&&(
            <div style={{width:"100%",maxWidth:360,textAlign:"center",animation:"milestoneIn .5s ease both"}}>
              <div style={{fontSize:48,marginBottom:12}}>🚀</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:"#eceeff",marginBottom:6}}>Add your first task</div>
              <div style={{fontSize:14,color:"var(--t3)",marginBottom:24,lineHeight:1.6}}>What's the one thing you need to do today?</div>
              <div style={{textAlign:"left",marginBottom:20}}>
                <input value={onboardTask} onChange={e=>setOnboardTask(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&completeOnboarding()}
                  placeholder="e.g. Finish the report, Call mum, Study for exam…"
                  autoFocus
                  style={{width:"100%",background:"var(--s2)",border:`1.5px solid ${accent.v}60`,borderRadius:14,padding:"14px 16px",fontSize:15,color:"#eceeff",outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
              </div>
              <button onClick={completeOnboarding}
                style={{width:"100%",height:52,background:`linear-gradient(135deg,${accent.v},${accent.g})`,borderRadius:16,fontSize:16,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",marginBottom:10,boxShadow:`0 8px 28px ${accent.v}50`}}>
                {onboardTask.trim()?"Let's go! 🚀":"Skip and enter app →"}
              </button>
              <button onClick={()=>setOnboardStep(2)} style={{width:"100%",height:40,background:"none",border:"none",color:"var(--t3)",cursor:"pointer",fontSize:13}}>← Back</button>
            </div>
          )}
        </div>
      )}

      {/* == MOBILE TOOLS PANEL == */}
      {showMobileTools&&(
        <div className="overlay" onClick={()=>setShowMobileTools(false)} style={{zIndex:5500}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
            <div className="drag"/>
            <div style={{padding:"16px 18px 28px"}}>
              <div style={{fontSize:13,fontWeight:800,color:"var(--t3)",letterSpacing:1,textTransform:"uppercase",marginBottom:16,textAlign:"center"}}>Quick Tools</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[
                  {icon:"⊞",label:"Matrix",action:()=>{setShowEisenhower(true);setShowMobileTools(false);}},
                  {icon:"⌘",label:"Commands",action:()=>{setShowCmdPalette(true);setCmdQuery("");setShowMobileTools(false);}},
                  {icon:"⛶",label:"Focus Mode",action:()=>{setFocusTaskId(null);setShowFocusMode(true);setShowMobileTools(false);}},
                  {icon:"📋",label:"Templates",action:()=>{setShowTemplateModal(true);setShowMobileTools(false);}},
                  {icon:"🎵",label:musicOn?"Stop Music":"Music",action:()=>{setMusicOn(m=>!m);play("tap");setShowMobileTools(false);}},
                  {icon:"💡",label:"AI Tips",action:()=>{setShowSuggestionsPanel(p=>!p);setShowMobileTools(false);}},
                  {icon:"🤖",label:"LIBI Panel",action:()=>{setShowLibiPanel(p=>!p);setShowMobileTools(false);}},
                  {icon:dark?"☀️":"🌙",label:dark?"Light Mode":"Dark Mode",action:()=>{toggleDark();setShowMobileTools(false);}},
                  {icon:"🏆",label:"My Level",action:()=>{setShowGamificationModal(true);setShowMobileTools(false);}},
                ].map((tool,i)=>(
                  <div key={i} onClick={tool.action} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,padding:"14px 8px",borderRadius:14,background:"var(--s1)",border:"1px solid var(--b1)",cursor:"pointer",transition:"all .15s"}}>
                    <span style={{fontSize:22}}>{tool.icon}</span>
                    <span style={{fontSize:11,fontWeight:600,color:"var(--t2)",textAlign:"center"}}>{tool.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* == STREAK PROTECTION MODAL == */}
      {showStreakModal&&(
        <div className="overlay" onClick={()=>setShowStreakModal(false)} style={{zIndex:5000}}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:340}}>
            <div className="drag"/>
            <div style={{padding:"28px 24px",textAlign:"center"}}>
              <div style={{fontSize:64,marginBottom:8,animation:"milestoneIn .5s ease both"}}>🔥</div>
              <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,marginBottom:8,color:"var(--t1)"}}>Streak at Risk!</div>
              <div style={{fontSize:15,color:"var(--t2)",marginBottom:6,lineHeight:1.6}}>
                Your <strong style={{color:"#ff9f43"}}>{gamStats.streak}-day streak</strong> ends at midnight!
              </div>
              <div style={{fontSize:13,color:"var(--t3)",marginBottom:24}}>Complete just ONE task to keep it alive 💪</div>
              <div style={{display:"flex",gap:10}}>
                <button onClick={()=>{setShowStreakModal(false);setTab("tasks");}} style={{flex:1,height:46,background:`linear-gradient(135deg,#ff9f43,#ff6b35)`,borderRadius:13,fontSize:14,fontWeight:800,color:"#fff",border:"none",cursor:"pointer",boxShadow:"0 6px 20px rgba(255,159,67,.4)"}}>
                  ✅ Do a Task Now
                </button>
                <button onClick={()=>setShowStreakModal(false)} style={{height:46,padding:"0 16px",background:"var(--s2)",borderRadius:13,fontSize:13,color:"var(--t3)",border:"1px solid var(--b1)",cursor:"pointer"}}>
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
          <button className="install-banner-btn" onClick={()=>{
            installPWA();
            if(!pwaPrompt) {
              showNotif("📲 How to install","Tap the share button → 'Add to Home Screen' (iOS) or the ⊕ icon in Chrome's address bar (Android/PC)");
              setShowInstallBanner(false);
              localStorage.setItem('tf_install_dismissed','1');
            }
          }}>
            {/android|iphone|ipad|mobile/i.test(navigator.userAgent) ? "📱 Install" : "💻 Install"}
          </button>
          <button className="install-banner-close" onClick={()=>{
            setShowInstallBanner(false);
            localStorage.setItem('tf_install_dismissed','1');
          }}>✕</button>
        </div>
      )}

      {/* == PRIVACY POLICY + TERMS MODAL == */}
      {showPrivacy&&(
        <div className="privacy-modal-overlay" onClick={()=>setShowPrivacy(false)}>
          <div className="privacy-modal" onClick={e=>e.stopPropagation()}>
            <div style={{padding:"18px 22px 14px",borderBottom:"1px solid var(--b1)",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:"var(--t1)"}}>Privacy Policy & Terms</div>
                <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>Last updated: March 2026 · Taskflow by LIBI Labs</div>
              </div>
              <button onClick={()=>setShowPrivacy(false)} style={{width:32,height:32,borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)",fontSize:16,cursor:"pointer",color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div className="privacy-body">
              <h2>Privacy Policy</h2>
              <p>Taskflow ("we", "our") is committed to protecting your privacy. This policy explains how we handle information when you use Taskflow at <a href="https://taskflow-ultimate.netlify.app" target="_blank">taskflow-ultimate.netlify.app</a>.</p>
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
              <p>Taskflow uses localStorage (not cookies) for app data. Google AdSense may use cookies for personalised ads. Opt out at <a href="https://adssettings.google.com" target="_blank">adssettings.google.com</a>.</p>
              <h3>4. Data Deletion</h3>
              <p>Delete all data anytime via Settings → Clear Data, or by clearing your browser's site data. Firebase data can be removed by contacting us.</p>
              <h3>5. Children's Privacy</h3>
              <p>Taskflow is not directed at children under 13. We do not knowingly collect data from children under 13.</p>
              <h3>6. Third-Party Services</h3>
              <ul>
                <li><a href="https://policies.google.com/privacy" target="_blank">Google Privacy Policy</a> (Firebase, AdSense)</li>
                <li><a href="https://firebase.google.com/support/privacy" target="_blank">Firebase Privacy Policy</a></li>
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
              <div style={{marginTop:24,padding:"14px 16px",background:"var(--s2)",borderRadius:14,fontSize:12,color:"var(--t3)",textAlign:"center",lineHeight:1.8}}>
                Questions? <a href="mailto:privacy@libi-labs.com" style={{color:"var(--acc)"}}>privacy@libi-labs.com</a><br/>
                © 2026 Taskflow · LIBI Labs · Kerala, India
              </div>
            </div>
          </div>
        </div>
      )}

      {/* == UNDO TOAST == */}
      {showUndo&&deletedTask&&(
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",zIndex:9000,background:dark?"rgba(20,22,40,0.97)":"rgba(255,255,255,0.97)",border:"1px solid var(--b1)",borderRadius:16,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,boxShadow:"0 8px 32px rgba(0,0,0,.35)",backdropFilter:"blur(16px)",minWidth:280,maxWidth:"90vw",animation:"slideUp .2s ease"}}>
          <div style={{fontSize:18}}>🗑</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"var(--t1)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{deletedTask.title}</div>
            <div style={{fontSize:11,color:"var(--t3)"}}>Deleted</div>
          </div>
          <button onClick={undoDelete} style={{padding:"8px 14px",borderRadius:10,background:`linear-gradient(135deg,${accent.v},${accent.g})`,border:"none",color:"#fff",fontSize:12,fontWeight:800,cursor:"pointer",flexShrink:0}}>↩ Undo</button>
        </div>
      )}

{xpAnim&&(
        <div className="xp-float">+{xpAnim.amount} XP ⚡</div>
      )}

      {/* ── New Badge Popup */}
      {newBadgeAnim&&(
        <div className="badge-popup">
          <div style={{fontSize:36}}>{newBadgeAnim.icon}</div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--acc)",letterSpacing:1,textTransform:"uppercase",marginBottom:2}}>🏆 Badge Unlocked!</div>
            <div style={{fontSize:15,fontWeight:800,color:"var(--t1)"}}>{newBadgeAnim.name}</div>
            <div style={{fontSize:12,color:"var(--t3)",marginTop:2}}>{newBadgeAnim.desc}</div>
            <div style={{fontSize:11,color:"var(--acc)",fontWeight:700,marginTop:3}}>+{newBadgeAnim.xp} XP earned!</div>
          </div>
        </div>
      )}

      {/* ── AI Suggestions Panel */}
      {showSuggestionsPanel&&(
        <div style={{position:"fixed",top:64,right:12,width:320,background:"var(--s1)",border:"1px solid var(--b1)",borderRadius:18,padding:"16px",boxShadow:"0 12px 40px rgba(0,0,0,.3)",zIndex:500,animation:"slideIn .2s ease",maxHeight:"80vh",overflowY:"auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:17}}>💡 AI Suggestions</div>
            <button style={{fontSize:14,color:"var(--t3)",background:"none",border:"none",cursor:"pointer"}} onClick={()=>setShowSuggestionsPanel(false)}>✕</button>
          </div>
          {aiSuggestions.length===0?<div style={{fontSize:13,color:"var(--t3)",textAlign:"center",padding:"20px 0"}}>All caught up! No suggestions right now.</div>:
          aiSuggestions.map(s=>(
            <div key={s.id} className="suggest-card">
              <div style={{width:38,height:38,borderRadius:11,background:s.color+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>{s.icon}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:s.color,marginBottom:3}}>{s.title}</div>
                <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>{s.body}</div>
                <div style={{display:"flex",gap:6,marginTop:8}}>
                  {s.action&&<button onClick={()=>{setShowSuggestionsPanel(false);if(s.action==="add_task"){setForm({...blankForm,categoryId:s.categoryId||"personal",profileId:activeProfile});setShowTaskModal(true);}else if(s.action==="view_tasks"){setTab("tasks");}}} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"var(--accd)",color:"var(--acc)",fontWeight:700,border:"none",cursor:"pointer"}}>Take Action</button>}
                  <button onClick={()=>{setDismissedSuggestions(d=>[...d,s.id]);setAiSuggestions(a=>a.filter(x=>x.id!==s.id));}} style={{fontSize:11,padding:"4px 10px",borderRadius:20,background:"var(--s3)",color:"var(--t3)",fontWeight:600,border:"none",cursor:"pointer"}}>Dismiss</button>
                </div>
              </div>
            </div>
          ))}
          <div style={{fontSize:10,color:"var(--t3)",textAlign:"center",marginTop:8}}>🧠 Powered by offline AI — no internet needed</div>
        </div>
      )}



      {/* ── Gamification Modal */}
      {showGamificationModal&&(()=>{
        const lvl=getLevel(xp);
        const nextLvl=lvl.next;
        return (
          <div className="overlay" onClick={()=>setShowGamificationModal(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
              <div className="drag"/>
              <div className="m-head">
                <div className="m-title">🏆 Your Progress</div>
                <button className="ic-btn" onClick={()=>setShowGamificationModal(false)}>✕</button>
              </div>
              <div className="m-body">
                {/* Level card */}
                <div style={{background:`linear-gradient(135deg,${accent.v}22,${accent.g}11)`,border:`1px solid ${accent.v}33`,borderRadius:16,padding:"18px",textAlign:"center"}}>
                  <div style={{fontSize:48,marginBottom:6}}>{lvl.icon}</div>
                  <div style={{fontFamily:"'Instrument Serif',serif",fontSize:26,color:accent.v}}>{lvl.name}</div>
                  <div style={{fontSize:13,color:"var(--t3)",marginTop:2}}>Level {lvl.level} • {xp} XP total</div>
                  {nextLvl&&<>
                    <div style={{height:8,background:"var(--s3)",borderRadius:4,overflow:"hidden",margin:"12px 0 6px"}}>
                      <div style={{height:"100%",width:`${lvl.progress}%`,background:`linear-gradient(90deg,${accent.v},${accent.g})`,borderRadius:4,transition:"width .6s"}}/>
                    </div>
                    <div style={{fontSize:11,color:"var(--t3)"}}>{nextLvl.minXP-xp} XP to {nextLvl.icon} {nextLvl.name}</div>
                  </>}
                </div>
                {/* Stats row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                  {[{icon:"✅",label:"Tasks Done",val:gamStats.totalDone},{icon:"🔥",label:"Streak",val:`${gamStats.streak}d`},{icon:"🏅",label:"Badges",val:`${earnedBadges.length}/${BADGES.length}`}].map(s=>(
                    <div key={s.label} style={{background:"var(--s2)",borderRadius:12,padding:"12px 10px",textAlign:"center",border:"1px solid var(--b1)"}}>
                      <div style={{fontSize:22}}>{s.icon}</div>
                      <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:"var(--acc)",marginTop:2}}>{s.val}</div>
                      <div style={{fontSize:10,color:"var(--t3)",marginTop:2}}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {/* Badges grid */}
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",letterSpacing:.5,textTransform:"uppercase",marginBottom:10}}>🏅 Badges ({earnedBadges.length}/{BADGES.length})</div>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                    {BADGES.map(b=>{
                      const earned=earnedBadges.includes(b.id);
                      return (
                        <div key={b.id} title={b.name+": "+b.desc} style={{textAlign:"center",padding:"10px 4px",borderRadius:12,background:earned?"var(--accd)":"var(--s2)",border:`1.5px solid ${earned?"var(--acc)":"var(--b1)"}`,opacity:earned?1:0.45,transition:"all .2s",cursor:"default"}}>
                          <div style={{fontSize:22,filter:earned?"none":"grayscale(1)"}}>{b.icon}</div>
                          <div style={{fontSize:9,fontWeight:700,color:earned?"var(--acc)":"var(--t3)",marginTop:4,lineHeight:1.2}}>{b.name}</div>
                          {earned&&<div style={{fontSize:8,color:"var(--acc)",marginTop:1}}>+{b.xp}xp</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* How to earn XP */}
                <div style={{background:"var(--s2)",borderRadius:12,padding:"12px 14px"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",marginBottom:8}}>⚡ HOW TO EARN XP</div>
                  {[["✅ Complete low priority task","10 XP"],["✅ Complete medium priority task","20 XP"],["✅ Complete high priority task","30 XP"],["🏅 Unlock a badge","50-500 XP"]].map(([a,b])=>(
                    <div key={a} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:"1px solid var(--b1)"}}>
                      <span style={{fontSize:12,color:"var(--t2)"}}>{a}</span>
                      <span style={{fontSize:12,fontWeight:700,color:"var(--acc)"}}>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="m-foot"><button className="btn-s" onClick={()=>setShowGamificationModal(false)}>Awesome! 🎉</button></div>
            </div>
          </div>
        );
      })()}

      {/* Sidebar toggle — always visible */}
      {!showSidebar&&(
        <button onClick={()=>{setShowSidebar(true);haptic("light");}} title="Show sidebar" style={{position:"fixed",left:0,top:"50%",transform:"translateY(-50%)",zIndex:200,width:24,height:72,background:`linear-gradient(180deg,${accent.v},${accent.g})`,border:"none",borderRadius:"0 14px 14px 0",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:"#fff",boxShadow:`4px 0 24px ${accent.v}60`,transition:"width .15s"}} onMouseEnter={e=>e.currentTarget.style.width="30px"} onMouseLeave={e=>e.currentTarget.style.width="24px"}>
          <span style={{fontSize:14,fontWeight:700}}>›</span>
          <span style={{fontSize:7,letterSpacing:.5,writingMode:"vertical-rl",transform:"rotate(180deg)",opacity:.8}}>MENU</span>
        </button>
      )}
      <div className="shell" style={{position:"relative"}}>
        {/* Wallpaper layer — behind everything */}
        {(()=>{
          const h = liveHour;
          const autoGrad = h>=5&&h<12
            ? "linear-gradient(160deg,#0a0510 0%,#1a0f3e 20%,#3d1f6e 45%,#e8724a 70%,#f4a55a 85%,#ffd580 100%)"  // 🌅 morning
            : h>=12&&h<18
            ? "linear-gradient(160deg,#030a1a 0%,#0a1f4a 30%,#1565c0 65%,#e8a83a 85%,#f4d060 100%)"              // ☀️ afternoon
            : h>=18&&h<21
            ? "linear-gradient(160deg,#050210 0%,#1a0535 25%,#6b1a3a 55%,#ff6b35 80%,#ffa560 100%)"              // 🌆 evening
            : "linear-gradient(160deg,#000008 0%,#0a0020 25%,#1a0040 50%,#2d0060 70%,#7c6dfa 100%)";             // 🌙 night
          const grad = wallpaper==="auto" ? autoGrad : (wallpaper!=="none" ? WALLPAPERS.find(w=>w.id===wallpaper)?.gradient : null);
          return grad ? <div style={{position:"fixed",inset:0,zIndex:0,background:grad,backgroundSize:"cover",backgroundAttachment:"fixed",pointerEvents:"none",transition:"background 2s ease"}}/> : null;
        })()}
        {/* Sidebar */}
        <div className="sidebar" style={{width:showSidebar?"234px":"0px",overflowX:"hidden",overflowY:showSidebar?"auto":"hidden",minWidth:0,flexShrink:0,transition:"width .25s ease"}}>
          <div className="logo" style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingRight:12}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="logo-icon" onClick={()=>setShowIconDesigner(true)} style={{cursor:"pointer"}} title="Customize icon">{appIconEmoji}</div>
              <span className="logo-text">{appDisplayName||t.appName}</span>
            </div>
            <button onClick={()=>{setShowSidebar(false);haptic("light");}} title="Collapse sidebar" style={{width:28,height:28,borderRadius:8,background:"var(--s2)",border:"1px solid var(--b1)",color:"var(--t3)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>‹</button>
          </div>
          {/* XP Level Bar in Sidebar */}
          <div onClick={()=>setShowGamificationModal(true)} style={{margin:"0 12px 14px",background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:11,padding:"10px 12px",cursor:"pointer",transition:"all .15s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
              <span style={{fontSize:16}}>{getLevel(xp).icon}</span>
              <span style={{fontSize:12,fontWeight:700,color:"var(--t1)",flex:1}}>{getLevel(xp).name}</span>
              <span style={{fontSize:11,fontWeight:800,color:"var(--acc)"}}>{xp} XP</span>
            </div>
            <div className="level-bar-wrap">
              <div className="level-bar-fill" style={{width:`${getLevel(xp).progress}%`}}/>
            </div>
          </div>
          <div className="profile-bar" onClick={()=>{setTab("profiles");play("tap");}}>
            {authUser?.photo
              ? <img src={authUser.photo} alt="" style={{width:33,height:33,borderRadius:10,objectFit:"cover",border:`2px solid ${accent.v}60`,flexShrink:0}}/>
              : <div className="profile-avatar" style={{background:curProfile.color+"22"}}>{curProfile.icon}</div>
            }
            <span className="profile-name">{authUser?.name||curProfile.name}</span>
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
              
              {id:"goals",icon:"🏆",label:"Goals",cnt:null},
              {id:"habits",icon:"🔁",label:"Habits",cnt:null},
              {id:"planner",icon:"⏰",label:"Planner",cnt:null},
              {id:"notes",icon:"📝",label:"Notes",cnt:notes.length||null},
              {id:"mood",icon:"😊",label:"Mood",cnt:null},
              {id:"time",icon:"⏱",label:"Focus & Time",cnt:null},
              {id:"board",icon:"🗂",label:"Board",cnt:null},
              {id:"collab",icon:"👫",label:"Collaborate",cnt:null},
              {id:"finance",icon:"💰",label:"Finance",cnt:null},
              {id:"bot",icon:"🤖",label:"LIBI AI",cnt:null},
              {id:"settings",icon:"⚙️",label:t.settings,cnt:null},
              {id:"profiles",icon:"👥",label:t.profiles,cnt:null},
            ].map(v=>(
              <div key={v.id} className={`nav-item ${tab===v.id?"on":""}`} onClick={()=>{setTab(v.id);play("tap");if(v.id==="done"){setShowDone(true);setShowStarred(false);}else if(v.id==="starred"){setShowStarred(true);setShowDone(false);}else if(!["bot","stats","calendar","settings","profiles","focus","collab","goals","habits","planner","board","time"].includes(v.id)){setShowDone(false);setShowStarred(false);}}}>
                <span className="nav-icon">{v.icon}</span>{v.label}
                {v.cnt!==null&&<span className="nav-badge">{v.cnt}</span>}
              </div>
            ))}
            {/* Quick Actions */}
            <div style={{padding:"8px 12px 0",display:"flex",gap:7}}>
              <button onClick={()=>{setFocusTaskId(null);setShowFocusMode(true);play("tap");}} style={{flex:1,height:34,background:"linear-gradient(135deg,#1a0040,#4a0080)",border:"1px solid var(--acc)",borderRadius:10,fontSize:12,fontWeight:700,color:"var(--acc)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>🌌 Focus</button>
              <button onClick={()=>{setShowTemplateModal(true);play("tap");}} style={{flex:1,height:34,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:10,fontSize:12,fontWeight:700,color:"var(--t2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>📋 Template</button>
            </div>
          </div>

          {/* == Desktop Ad — sidebar bottom == */}
          <div style={{padding:"12px 10px 8px",marginTop:"auto",flexShrink:0}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--t3)",opacity:.55,marginBottom:4,paddingLeft:2}}>Advertisement</div>
            <div style={{borderRadius:12,overflow:"hidden",background:"var(--s2)",border:"1px solid var(--b1)",minHeight:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <ins
                className="adsbygoogle"
                style={{display:"block",width:"214px",height:"100px"}}
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
            <div className="topbar-logo-wrap" onClick={()=>setTab("tasks")}>
              <div style={{width:28,height:28,borderRadius:8,background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:800,color:"#fff",boxShadow:`0 3px 10px ${accent.v}50`,flexShrink:0}}>✦</div>
              <span style={{fontFamily:"'Instrument Serif',serif",fontSize:18,fontWeight:700,color:"var(--t1)",whiteSpace:"nowrap"}}>{appDisplayName||"Taskflow"}</span>
            </div>
            {/* Hamburger - desktop only */}
            <button className="menu-btn" onClick={()=>{setShowSidebar(s=>!s);haptic("light");}} title={showSidebar?"Hide sidebar":"Show sidebar"} style={{opacity:showSidebar?1:.5}}>☰</button>
            <span className="topbar-title">
              {tab==="stats"?`📊 ${t.stats}`:tab==="calendar"?`📆 ${t.calendar}`:tab==="settings"?`⚙️ ${t.settings}`:tab==="profiles"?`👥 ${t.profiles}`:tab==="time"?"⏱ Focus & Time":tab==="goals"?"🏆 Goals":tab==="habits"?"🔁 Habits":tab==="planner"?"⏰ Daily Planner":tab==="board"?"🗂 Board":tab==="collab"?"👫 Collaborate":tab==="starred"?`⭐ ${t.starred}`:tab==="overdue"?`⚠️ ${t.overdue}`:tab==="today"?`📅 ${t.today}`:tab==="done"?`✓ ${t.done}`:t.tasks}
            </span>
            {!["bot","stats","calendar","settings","profiles","focus","collab","goals","habits","planner","board"].includes(tab)&&<div className="search-wrap"><span style={{color:"var(--t3)",fontSize:13}}>⌕</span><input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<span style={{cursor:"pointer",color:"var(--t3)",fontSize:12}} onClick={()=>setSearch("")}>✕</span>}</div>}
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              {/* ── Mobile: show only Voice + Dark + Tools ── */}
              <button className="tb-btn mobile-only-btn" onClick={startVoice}
                style={{background:isListening?"rgba(255,107,107,.2)":"var(--s2)",borderColor:isListening?"#ff6b6b":"var(--b1)",color:isListening?"#ff6b6b":"var(--t2)"}}>
                {isListening?"🔴":"🎤"}
              </button>
              <button className="tb-btn mobile-only-btn" onClick={toggleDark}>{dark?"☀️":"🌙"}</button>
              <button className="tb-btn mobile-only-btn" onClick={()=>setShowMobileTools(true)} style={{fontWeight:800,fontSize:13}}>⋯</button>
              {/* ── Desktop: full button row ── */}
              <button className="tb-btn desktop-only-btn" onClick={()=>setShowEisenhower(true)} title="Eisenhower Matrix" style={{fontSize:12}}>⊞</button>
              <button className="tb-btn desktop-only-btn" onClick={()=>{setShowCmdPalette(true);setCmdQuery("");}} title="Command Palette (Ctrl+K)" style={{fontWeight:800,fontSize:11,color:"var(--acc)",borderColor:"var(--acc)",background:"var(--accd)"}}>⌘K</button>
              <button className="tb-btn desktop-only-btn" onClick={()=>setShowLibiPanel(p=>!p)} title="Toggle LIBI" style={{fontWeight:800,fontSize:11,color:showLibiPanel?"var(--acc)":"var(--t2)",borderColor:showLibiPanel?"var(--acc)":"var(--b1)",background:showLibiPanel?"var(--accd)":"var(--s2)",display:"flex",alignItems:"center",gap:4}}>
                <span style={{fontSize:13}}>🤖</span>LIBI
              </button>
              <button className="tb-btn" onClick={()=>{setFocusTaskId(null);setShowFocusMode(true);}} title="Focus Mode 🌌">🌌</button>
              <button className="tb-btn desktop-only-btn" onClick={()=>setShowTemplateModal(true)} title="Task Templates">📋</button>
              <button className="tb-btn desktop-only-btn" onClick={toggleDark} title="Toggle theme">{dark?"☀️":"🌙"}</button>
              <button className={`tb-btn desktop-only-btn${isListening?" voice-btn-active":""}`}
                onClick={startVoice}
                title="Voice input 🎤"
                style={{background:isListening?"rgba(255,107,107,.2)":"var(--s2)",borderColor:isListening?"#ff6b6b":"var(--b1)",color:isListening?"#ff6b6b":"var(--t2)",transition:"all .2s"}}>
                {isListening?"🔴":"🎤"}
              </button>
              <button className="tb-btn desktop-only-btn" onClick={()=>{setMusicOn(m=>!m);play("tap");}} title={musicOn?"Stop music":"Play music"} style={{background:musicOn?"var(--accd)":"var(--s2)",borderColor:musicOn?"var(--acc)":"var(--b1)",color:musicOn?"var(--acc)":"var(--t2)"}}>{musicOn?(
                  <span style={{display:"flex",alignItems:"flex-end",gap:1.5,height:14}}>
                    {[3,5,4,6,3,5].map((h,i)=>(
                      <div key={i} style={{width:2.5,height:musicOn?h+2:2,background:"var(--acc)",borderRadius:2,animation:musicOn?`soundbar${i} ${0.5+i*0.08}s ease-in-out infinite alternate`:"none",minHeight:2}}/>
                    ))}
                  </span>
                ):"🎵"}</button>
              {/* AI Suggestions Bell */}
              {aiSuggestions.length>0&&(
                <button className="tb-btn" onClick={()=>setShowSuggestionsPanel(p=>!p)} title="AI Suggestions" style={{position:"relative",background:"var(--accd)",borderColor:"var(--acc)",color:"var(--acc)"}}>
                  💡
                  <span style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"var(--red)",color:"#fff",fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{aiSuggestions.length}</span>
                </button>
              )}
              {/* XP Level chip */}
              <div onClick={()=>setShowGamificationModal(true)} style={{display:"flex",alignItems:"center",gap:5,background:"var(--accd)",border:"1px solid var(--acc)",borderRadius:20,padding:"3px 10px",cursor:"pointer",flexShrink:0}}>
                <span style={{fontSize:13}}>{getLevel(xp).icon}</span>
                <span style={{fontSize:11,fontWeight:800,color:"var(--acc)"}}>{getLevel(xp).name}</span>
              </div>
              {pinEnabled&&<button className="tb-btn" onClick={()=>{setLocked(true);setPinMode("unlock");setPinInput("");setPinError("");}} title="Lock app">🔒</button>}
              {tab==="time"&&<button className="tb-btn" style={{background:pomoRunning?`${accent.v}22`:"var(--s2)",color:pomoRunning?accent.v:"var(--t2)",borderColor:pomoRunning?accent.v:"var(--b1)"}} onClick={()=>setPomoRunning(r=>!r)}>{pomoRunning?"⏸":"▶"}</button>}
              {!["bot","stats","calendar","settings","profiles","focus","collab","goals","habits","planner","board"].includes(tab)&&<button className="add-btn" onClick={openAdd}>+ {t.add}</button>}
            </div>
          </div>
          {tab==="tasks"||tab==="starred"||tab==="today"||tab==="overdue"||tab==="done"?<div key={pageKey} className="content page-fade" style={{overflowY:"auto"}}><TasksPage/>
              <button className="tb-btn" onClick={generateShareCard} title="Share" style={{fontSize:14}}>🚀</button>
              {notifPermission!=="granted"&&<button className="tb-btn" onClick={requestNotifPermission} title="Enable notifications" style={{fontSize:13,color:"#ffd93d"}}>🔔</button>}</div>:
           tab==="stats"?<div className="content" style={{overflowY:"auto",height:"100%"}}><StatsPage/></div>:
           tab==="calendar"?<div className="content" style={{overflowY:"auto",height:"100%"}}><CalendarPage/></div>:
           tab==="settings"?<div className="content" style={{overflowY:"auto",height:"100%"}}><SettingsPage/></div>:
           tab==="profiles"?<div className="content" style={{overflowY:"auto",height:"100%"}}><ProfilesPage/></div>:
           tab==="focus"?<div className="content" style={{overflowY:"auto"}}><PomoPage/></div>:
           tab==="collab"?<div className="content" style={{overflowY:"auto"}}><CollabPage/></div>:
           tab==="time"?<div className="content" style={{overflowY:"auto"}}><FocusTimePage/></div>:
           tab==="goals"?<div className="content" style={{overflowY:"auto"}}><GoalsPage/></div>:
           tab==="habits"?<div className="content" style={{overflowY:"auto"}}><HabitsPage/></div>:
           tab==="planner"?<div className="content" style={{overflowY:"auto"}}><PlannerPage/></div>:
           tab==="mood"?<div className="content" style={{overflowY:"auto"}}><MoodPage/></div>:
           tab==="notes"?<div className="content" style={{overflowY:"auto"}}><NotesPage/></div>:
           tab==="finance"?<div className="content" style={{overflowY:"auto"}}><FinancePage/></div>:
           tab==="weekly"?<div className="content" style={{overflowY:"auto"}}><WeeklyReviewPage/></div>:
           tab==="board"?<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><BoardPage/></div>:
           tab==="bot"?<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",background:"var(--s0)",paddingBottom:"calc(64px + env(safe-area-inset-bottom,0px))"}}>{chatPanelJSX}</div>:
           <div className="content" style={{overflowY:"auto"}}><TasksPage/></div>}
        </div>


        {/* ── Right LIBI Panel */}
        <div style={{width:showLibiPanel?300:0,flexShrink:0,overflow:"hidden",transition:"width .28s cubic-bezier(.4,0,.2,1)",borderLeft:showLibiPanel?"1px solid var(--b1)":"none",background:"var(--s0)",display:"flex",flexDirection:"column",position:"relative"}}>
          {showLibiPanel&&chatPanelJSX}
        </div>

        {/* Mobile Bottom Nav */}
        {/* == GOOGLE AD BANNER — above bottom nav on mobile == */}
        <div className="ad-banner-wrap" style={{display:"none"}} id="taskflow-ad-wrap">
          <span className="ad-label">Advertisement</span>
          <div className="ad-inner">
            <ins
              className="adsbygoogle"
              style={{display:"block",width:"100%",height:"50px"}}
              data-ad-client="ca-pub-3574283815002402"
              data-ad-slot="3199106143"
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            />
          </div>
        </div>

        <nav className="bot-nav">
          <div className="bot-inner">
            <div className={`bot-item ${tab==="tasks"?"on":""}`} onClick={()=>{setTab("tasks");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon">○</span><span>{t.tasks}</span>
              {activeCount>0&&<span className="bot-num">{activeCount>99?"99+":activeCount}</span>}
            </div>
            <div className={`bot-item ${tab==="bot"?"on":""}`} onClick={()=>{setTab("bot");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon" style={{fontSize:18}}>🤖</span><span>LIBI</span>
            </div>
            <div className="fab-wrap"><button className="fab" onClick={openAdd}>+</button><span className="fab-lbl">Add Task</span></div>
            <div className={`bot-item ${tab==="stats"?"on":""}`} onClick={()=>{setTab("stats");play("tap");setShowMoreMenu(false);}}>
              <span className="bot-icon">📊</span><span>Stats</span>
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
                {id:"goals",icon:"🏆",label:"Goals"},
                {id:"habits",icon:"🔁",label:"Habits"},
                {id:"calendar",icon:"📆",label:"Calendar"},
                {id:"notes",icon:"📝",label:"Notes"},
                {id:"mood",icon:"😊",label:"Mood"},
                {id:"finance",icon:"💰",label:"Finance"},
                {id:"focus",icon:"🧘",label:"Focus"},
                {id:"board",icon:"🗂",label:"Board"},
                {id:"planner",icon:"⏰",label:"Planner"},
                {id:"weekly",icon:"📅",label:"Week"},
                {id:"collab",icon:"👫",label:"Team"},
                {id:"profiles",icon:"👥",label:"Profiles"},
                {id:"settings",icon:"⚙️",label:"Settings"},
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

      {/* == GOAL MODAL == */}
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

      {/* == HABIT MODAL == */}
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

      {/* == BOARD CARD MODAL == */}
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

      {/* == BOARD COLUMN MODAL == */}
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

      {/* == TASK MODAL == */}
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
                <div><div className="f-lbl">{t.recurring}</div><select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.recurring} onChange={e=>setForm(f=>({...f,recurring:e.target.value}))}><option value="never">⏹ {t.never}</option><option value="daily">📅 {t.daily}</option><option value="weekly">📆 {t.weekly}</option><option value="monthly">🗓 {t.monthly}</option></select>
              <div className="row2">
                <div>
                  <div className="f-lbl">⏱ Time Estimate</div>
                  <select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.timeEstimate||0} onChange={e=>setForm(f=>({...f,timeEstimate:Number(e.target.value)}))}>
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
                  <select className="f-in" style={{appearance:"none",cursor:"pointer"}} value={form.dependsOn?.[0]||""} onChange={e=>setForm(f=>({...f,dependsOn:e.target.value?[e.target.value]:[]}))}>
                    <option value="">No dependency</option>
                    {profileTasks.filter(t=>t.id!==editTaskObj?.id&&!t.done).map(t=>(
                      <option key={t.id} value={t.id}>{t.title.slice(0,30)}{t.title.length>30?"…":""}</option>
                    ))}
                  </select>
                </div>
              </div></div>
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
                      <>
                        <div style={{display:"flex",gap:8,marginBottom:10}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>📅 Date</div>
                            <input type="date" style={{width:"100%",background:"var(--s3)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 9px",fontSize:12,color:"var(--t1)"}} value={form.reminderDate||form.due||""} onChange={e=>setForm(f=>({...f,reminderDate:e.target.value}))}/>
                          </div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>⏰ Time</div>
                            <input type="time" style={{width:"100%",background:"var(--s3)",border:"1px solid var(--b1)",borderRadius:8,padding:"6px 9px",fontSize:12,color:"var(--t1)"}} value={form.reminderTime||"09:00"} onChange={e=>setForm(f=>({...f,reminderTime:e.target.value}))}/>
                          </div>
                        </div>
                        {/* Alarm Tone Picker */}
                        <div>
                          <div style={{fontSize:11,color:"var(--t3)",marginBottom:7,fontWeight:700,letterSpacing:.4,textTransform:"uppercase"}}>🎵 Alarm Tone</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                            {ALARM_TONES.map(tone=>(
                              <div key={tone.id}
                                onClick={()=>{setForm(f=>({...f,alarmTone:tone.id}));playAlarmTone(tone.id);}}
                                style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"9px 6px",borderRadius:10,cursor:"pointer",background:form.alarmTone===tone.id?"var(--accd)":"var(--s3)",border:`1.5px solid ${form.alarmTone===tone.id?"var(--acc)":"transparent"}`,transition:"all .15s"}}>
                                <span style={{fontSize:18}}>{tone.icon}</span>
                                <span style={{fontSize:9.5,fontWeight:700,color:form.alarmTone===tone.id?"var(--acc)":"var(--t3)",textAlign:"center",lineHeight:1.2}}>{tone.label}</span>
                                {form.alarmTone===tone.id&&<span style={{fontSize:8,color:"var(--acc)",fontWeight:800}}>▶ ACTIVE</span>}
                              </div>
                            ))}
                          </div>
                          <div style={{fontSize:10.5,color:"var(--t3)",marginTop:6,textAlign:"center"}}>Tap a tone to preview it 🔊</div>
                        </div>
                      </>
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

      {/* == DETAIL MODAL == */}
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

      {/* == EXPORT MODAL == */}
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

      {/* == CATEGORY MODAL == */}
      {showCatModal&&(
        <div className="overlay" onClick={()=>setShowCatModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">{editCatId?"Edit Category":"New Category"}</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowCatModal(false)}>✕</button></div>
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

      {/* == PROFILE MODAL == */}
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

      {/* == AD / PREMIUM MODAL == */}

      {/* == NOTE MODAL — Advanced == */}
      {showNoteModal&&(
        <div className="overlay" onClick={()=>setShowNoteModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
            <div className="drag"/>
            <div className="m-head">
              <div className="m-title">{editNote?"✏️ Edit Note":"📝 New Note"}</div>
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                {noteForm.body&&<span style={{fontSize:11,color:"var(--t3)",fontWeight:600}}>{noteForm.body.trim().split(/\s+/).filter(Boolean).length}w · {noteForm.body.length}c</span>}
                <button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowNoteModal(false)}>✕</button>
              </div>
            </div>
            <div className="m-body">
              {/* Title */}
              <div>
                <div className="f-lbl">Title</div>
                <input className="f-in" autoFocus placeholder="Give your note a title…" value={noteForm.title} onChange={e=>setNoteForm(f=>({...f,title:e.target.value}))} style={{fontSize:15,fontWeight:600}}/>
              </div>

              {/* Category */}
              <div>
                <div className="f-lbl">Category</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                  {NOTE_CATS.filter(c=>c.id!=="all").map(c=>(
                    <button key={c.id} onClick={()=>setNoteForm(f=>({...f,category:c.id}))} style={{fontSize:11.5,padding:"5px 11px",borderRadius:20,fontWeight:600,background:noteForm.category===c.id?"var(--accd)":"var(--s2)",color:noteForm.category===c.id?"var(--acc)":"var(--t2)",border:`1.5px solid ${noteForm.category===c.id?"var(--acc)":"var(--b1)"}`,cursor:"pointer",transition:"all .15s"}}>
                      {c.icon} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Formatting toolbar */}
              <div>
                <div className="f-lbl">Content</div>
                <div style={{display:"flex",gap:4,marginBottom:6,flexWrap:"wrap"}}>
                  {[
                    {label:"B",title:"Bold",wrap:["**","**"]},
                    {label:"I",title:"Italic",wrap:["_","_"]},
                    {label:"✓",title:"Checklist",wrap:["- [ ] ",""]},
                    {label:"•",title:"Bullet",wrap:["• ",""]},
                    {label:"1.",title:"Numbered",wrap:["1. ",""]},
                    {label:"''",title:"Quote",wrap:["> ",""]},
                    {label:"—",title:"Divider",wrap:["\n---\n",""]},
                  ].map(btn=>(
                    <button key={btn.label} title={btn.title} onClick={()=>{
                      const ta=document.getElementById("note-body-ta");
                      if(!ta)return;
                      const start=ta.selectionStart,end=ta.selectionEnd;
                      const sel=noteForm.body.slice(start,end);
                      const before=noteForm.body.slice(0,start);
                      const after=noteForm.body.slice(end);
                      const newText=before+btn.wrap[0]+sel+btn.wrap[1]+after;
                      setNoteForm(f=>({...f,body:newText}));
                      setTimeout(()=>{ta.focus();ta.setSelectionRange(start+btn.wrap[0].length,end+btn.wrap[0].length);},0);
                    }} style={{padding:"3px 8px",borderRadius:6,background:"var(--s2)",border:"1px solid var(--b1)",fontSize:11,fontWeight:800,color:"var(--t2)",cursor:"pointer",minWidth:28,fontFamily:"monospace"}}>
                      {btn.label}
                    </button>
                  ))}
                </div>
                <textarea id="note-body-ta" className="f-in" style={{height:320,lineHeight:1.8,fontSize:14,fontFamily:"inherit",resize:"vertical",minHeight:200}} placeholder={`Write anything…\n\nTips:\n• Use **bold** or _italic_ formatting\n• Start lines with • for bullets\n• Start with - [ ] for checklists`} value={noteForm.body} onChange={e=>setNoteForm(f=>({...f,body:e.target.value}))}/>
              </div>

              {/* Tags */}
              <div>
                <div className="f-lbl">Tags</div>
                {noteForm.tags?.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:7}}>
                    {noteForm.tags.map(tg=>(
                      <span key={tg} style={{fontSize:11,padding:"3px 9px",borderRadius:20,background:"var(--accd)",color:"var(--acc)",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                        #{tg}
                        <span style={{cursor:"pointer",opacity:.7}} onClick={()=>setNoteForm(f=>({...f,tags:f.tags.filter(x=>x!==tg)}))}>✕</span>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{display:"flex",gap:7}}>
                  <input style={{flex:1,background:"var(--s2)",border:"1px solid var(--b1)",borderRadius:9,padding:"7px 11px",fontSize:12.5,color:"var(--t1)"}} placeholder="Add tag (press Enter)…" value={noteTagInput} onChange={e=>setNoteTagInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&noteTagInput.trim()){const v=noteTagInput.trim().replace(/^#/,"");if(!noteForm.tags?.includes(v)){setNoteForm(f=>({...f,tags:[...(f.tags||[]),v]}));}setNoteTagInput("");}}}/>
                  <button style={{height:33,padding:"0 12px",background:"var(--s3)",borderRadius:9,fontSize:12,color:"var(--t1)",cursor:"pointer",border:"1px solid var(--b1)"}} onClick={()=>{const v=noteTagInput.trim().replace(/^#/,"");if(v&&!noteForm.tags?.includes(v)){setNoteForm(f=>({...f,tags:[...(f.tags||[]),v]}));setNoteTagInput("");}}}>+ Add</button>
                </div>
              </div>

              {/* Color + Pin row */}
              <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <div style={{flex:1}}>
                  <div className="f-lbl">Color</div>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:4}}>
                    {NOTE_COLORS.map(c=>(
                      <div key={c} onClick={()=>setNoteForm(f=>({...f,color:c}))} style={{width:26,height:26,borderRadius:"50%",background:c,cursor:"pointer",border:`3px solid ${noteForm.color===c?"var(--t1)":"transparent"}`,transform:noteForm.color===c?"scale(1.25)":"scale(1)",transition:"all .15s",boxShadow:noteForm.color===c?`0 2px 8px ${c}60`:"none"}}/>
                    ))}
                  </div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,background:"var(--s2)",borderRadius:11,padding:"10px 13px",border:"1px solid var(--b1)",flexShrink:0}}>
                  <span style={{fontSize:13}}>📌 Pin</span>
                  <div className={`toggle ${noteForm.pinned?"on":""}`} onClick={()=>setNoteForm(f=>({...f,pinned:!f.pinned}))}><div className="toggle-knob"/></div>
                </div>
              </div>

              {/* Preview of note color */}
              <div style={{background:`${noteForm.color}12`,border:`1.5px solid ${noteForm.color}30`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{fontSize:10,fontWeight:700,color:noteForm.color,letterSpacing:.5,textTransform:"uppercase",marginBottom:4}}>Preview</div>
                <div style={{fontSize:13.5,fontWeight:700,color:"var(--t1)",marginBottom:4}}>{noteForm.title||"Note title…"}</div>
                <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.5}}>{noteForm.body?.slice(0,80)||(noteForm.body?.length>80?"…":"Write something to preview…")}</div>
              </div>
            </div>
            <div className="m-foot">
              {editNote&&<button className="btn-c" style={{color:"var(--red)",borderColor:"rgba(255,107,107,.3)"}} onClick={()=>{deleteNote(editNote.id);setShowNoteModal(false);}}>🗑 Delete</button>}
              <button className="btn-c" onClick={()=>setShowNoteModal(false)}>Cancel</button>
              <button className="btn-s" onClick={saveNote}>{editNote?"Save Changes":"Save Note"}</button>
            </div>
          </div>
        </div>
      )}

      {/* == AI TASK BREAKDOWN MODAL == */}
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

      {/* == ALARM MODAL == */}
      {alarmTask&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",backdropFilter:"blur(10px)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"}}>
          <div style={{background:"var(--s1)",border:`2px solid ${accent.v}44`,borderRadius:26,padding:"32px 24px 26px",maxWidth:370,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:0,boxShadow:`0 32px 80px rgba(0,0,0,.6),0 0 0 1px ${accent.v}22`}}>

            {/* Pulsing icon */}
            <div style={{width:80,height:80,borderRadius:"50%",background:`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,marginBottom:18,animation:"alarm-pulse 1.2s ease-in-out infinite",boxShadow:`0 0 0 0 ${accent.v}60`}}>⏰</div>

            {/* Status label */}
            <div style={{fontSize:11,fontWeight:800,letterSpacing:1.5,textTransform:"uppercase",color:alarmSnoozed?"#ffd93d":accent.v,marginBottom:6}}>
              {alarmSnoozed?"💤 SNOOZE ENDED":"⏰ ALARM"}
            </div>

            {/* Task title */}
            <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,textAlign:"center",lineHeight:1.3,marginBottom:8,padding:"0 8px"}}>{alarmTask.title}</div>

            {/* Notes */}
            {alarmTask.notes&&<div style={{fontSize:12.5,color:"var(--t2)",textAlign:"center",lineHeight:1.6,background:"var(--s2)",borderRadius:11,padding:"9px 14px",width:"100%",marginBottom:12}}>{alarmTask.notes}</div>}

            {/* Meta info */}
            <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"center",marginBottom:20}}>
              <span style={{fontSize:11.5,padding:"3px 10px",borderRadius:20,background:`${accent.v}18`,color:accent.v,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
                {ALARM_TONES.find(t=>t.id===(alarmTask.alarmTone||"classic"))?.icon} {ALARM_TONES.find(t=>t.id===(alarmTask.alarmTone||"classic"))?.label}
              </span>
              <span style={{fontSize:11.5,padding:"3px 10px",borderRadius:20,background:"var(--s2)",color:"var(--t2)",fontWeight:600}}>⏰ {alarmTask.reminderTime||"09:00"}</span>
              {alarmTask.due&&<span style={{fontSize:11.5,padding:"3px 10px",borderRadius:20,background:"var(--s2)",color:"var(--t2)",fontWeight:600}}>📅 {fmtDate(alarmTask.due)}</span>}
            </div>

            {/* Action Buttons */}
            <div style={{display:"flex",gap:10,width:"100%",marginBottom:10}}>
              <button onClick={handleDismiss} style={{flex:1,height:48,background:"var(--s2)",border:"1.5px solid var(--b2)",borderRadius:14,fontSize:13,fontWeight:700,color:"var(--t2)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s"}}>
                🔕 Dismiss
              </button>
              <button onClick={handleSnooze} style={{flex:1,height:48,background:"rgba(255,217,61,.15)",border:"1.5px solid rgba(255,217,61,.4)",borderRadius:14,fontSize:13,fontWeight:700,color:"#ffd93d",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .15s"}}>
                💤 Snooze 5m
              </button>
            </div>
            <button onClick={handleMarkDone} style={{width:"100%",height:50,background:`linear-gradient(135deg,${accent.v},${accent.g})`,border:"none",borderRadius:14,fontSize:14,fontWeight:800,color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 8px 24px ${accent.v}50`,letterSpacing:.3}}>
              ✅ Mark as Done
            </button>

            {/* Snooze hint */}
            <div style={{fontSize:11,color:"var(--t3)",marginTop:12,textAlign:"center",lineHeight:1.5}}>
              {alarmSnoozed?"This was a snoozed reminder — it will stop after you dismiss or mark done.":"Snooze will ring again in 5 minutes."}
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
      {showShareModal&&shareStats&&(
        <div className="overlay" onClick={()=>setShowShareModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:360,textAlign:"center"}}>
            <div className="drag"/>
            <div style={{padding:"24px 20px 20px"}}>
              {/* Share Card Preview */}
              <div style={{background:"linear-gradient(135deg,#0a0a1a,#1a0a2e,#0d1a3e)",borderRadius:20,padding:"24px 20px",marginBottom:20,border:"1px solid #7c6dfa33"}}>
                <div style={{fontSize:36,marginBottom:6}}>✦</div>
                <div style={{fontFamily:"'Instrument Serif',serif",fontSize:22,color:"#fff",marginBottom:4}}>Taskflow</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,.4)",letterSpacing:2,textTransform:"uppercase",marginBottom:20}}>by LIBI Labs</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
                  {[
                    {val:shareStats.done,lbl:"Tasks Done",icon:"✅"},
                    {val:`${shareStats.streak}d`,lbl:"Streak",icon:"🔥"},
                    {val:`${shareStats.pct}%`,lbl:"Completion",icon:"📊"},
                  ].map(s=>(
                    <div key={s.lbl} style={{background:"rgba(255,255,255,.07)",borderRadius:12,padding:"10px 6px"}}>
                      <div style={{fontSize:18}}>{s.icon}</div>
                      <div style={{fontSize:18,fontWeight:800,color:"#fff",marginTop:4}}>{s.val}</div>
                      <div style={{fontSize:9,color:"rgba(255,255,255,.5)",marginTop:2}}>{s.lbl}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:12,color:"rgba(255,255,255,.5)"}}>{shareStats.name} · {new Date().toLocaleDateString("en",{month:"short",day:"numeric",year:"numeric"})}</div>
              </div>
              <button onClick={shareAchievement} style={{width:"100%",height:48,background:"linear-gradient(135deg,#7c6dfa,#a855f7)",borderRadius:14,fontSize:14,fontWeight:700,color:"#fff",border:"none",cursor:"pointer",marginBottom:10,boxShadow:"0 6px 20px rgba(124,109,250,.4)"}}>
                🚀 Share Achievement
              </button>
              <button onClick={()=>setShowShareModal(false)} style={{fontSize:12,color:"var(--t3)",background:"none",border:"none",cursor:"pointer"}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* == APP ICON DESIGNER == */}
      {showIconDesigner&&(
        <div className="overlay" onClick={()=>setShowIconDesigner(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
            <div className="drag"/>
            <div className="m-head"><div className="m-title">🎨 App Icon</div><button className="ic-btn" style={{fontSize:15}} onClick={()=>setShowIconDesigner(false)}>✕</button></div>
            <div className="m-body">
              {/* Preview */}
              <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
                <div style={{width:80,height:80,borderRadius:22,background:appIconColor||`linear-gradient(135deg,${accent.v},${accent.g})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:40,boxShadow:`0 12px 32px ${accent.v}55`}}>
                  {appIconEmoji}
                </div>
              </div>
              {/* Emoji picker */}
              <div className="f-lbl">Choose Icon</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:6,marginBottom:16}}>
                {["✦","⚡","🎯","🚀","💎","🔥","⭐","🌟","💪","🧠","🎨","🏆","🌈","💫","🎵","🌙","☀️","⚽","🎮","📱","💻","🤖","🦋","🌺"].map(em=>(
                  <button key={em} onClick={()=>setAppIconEmoji(em)} style={{width:36,height:36,borderRadius:10,fontSize:20,display:"flex",alignItems:"center",justifyContent:"center",background:appIconEmoji===em?"var(--accd)":"var(--s2)",border:`2px solid ${appIconEmoji===em?"var(--acc)":"transparent"}`,cursor:"pointer",transition:"all .15s"}}>
                    {em}
                  </button>
                ))}
              </div>
              {/* Color picker */}
              <div className="f-lbl">Background Color</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:6}}>
                {["",`linear-gradient(135deg,${accent.v},${accent.g})`,"linear-gradient(135deg,#ff6b6b,#ffd93d)","linear-gradient(135deg,#6bcb77,#00d4aa)","linear-gradient(135deg,#a855f7,#7c6dfa)","linear-gradient(135deg,#ff9f43,#ff6b6b)","linear-gradient(135deg,#48dbfb,#3b82f6)","#1a1a2e"].map((c,i)=>(
                  <div key={i} onClick={()=>setAppIconColor(c)} style={{width:32,height:32,borderRadius:10,background:c||`linear-gradient(135deg,${accent.v},${accent.g})`,cursor:"pointer",border:`3px solid ${appIconColor===c?"var(--t1)":"transparent"}`,transform:appIconColor===c?"scale(1.15)":"scale(1)",transition:"all .15s"}}/>
                ))}
              </div>
            </div>
            <div className="m-foot">
              <button className="btn-c" onClick={()=>setShowIconDesigner(false)}>Cancel</button>
              <button className="btn-s" onClick={()=>{setShowIconDesigner(false);showNotif("🎨 Icon updated!","Your app icon has been customized");haptic("success");}}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* == EISENHOWER MATRIX == */}
      {showEisenhower&&(
        <div className="overlay" onClick={()=>setShowEisenhower(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680,maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
            <div className="drag"/>
            <div className="m-head">
              <div className="m-title">⊞ Eisenhower Matrix</div>
              <div style={{fontSize:11,color:"var(--t3)"}}>Urgent+Important = Do · Important = Schedule · Urgent = Delegate · Neither = Delete</div>
              <button className="ic-btn" onClick={()=>setShowEisenhower(false)}>✕</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px 16px",flex:1,overflowY:"auto"}}>
              {[
                {label:"🔴 DO NOW",sub:"Urgent + Important",filter:t=>t.priority==="high"&&t.due&&(new Date(t.due)-new Date())<3*24*60*60*1000,bg:"rgba(255,107,107,.08)",border:"rgba(255,107,107,.3)"},
                {label:"📅 SCHEDULE",sub:"Important, Not Urgent",filter:t=>t.priority==="high"&&(!t.due||(new Date(t.due)-new Date())>=3*24*60*60*1000),bg:"rgba(124,109,250,.08)",border:"rgba(124,109,250,.3)"},
                {label:"📤 DELEGATE",sub:"Urgent, Not Important",filter:t=>t.priority==="medium"&&t.due&&(new Date(t.due)-new Date())<2*24*60*60*1000,bg:"rgba(255,217,61,.08)",border:"rgba(255,217,61,.3)"},
                {label:"🗑 ELIMINATE",sub:"Not Urgent, Not Important",filter:t=>t.priority==="low"&&(!t.due||(new Date(t.due)-new Date())>=7*24*60*60*1000),bg:"rgba(120,120,120,.06)",border:"rgba(120,120,120,.2)"},
              ].map(q=>{
                const qTasks = profileTasks.filter(t=>!t.done&&q.filter(t));
                return (
                  <div key={q.label} className="matrix-quad" style={{background:q.bg,borderColor:q.border}}>
                    <div style={{fontSize:12,fontWeight:800,color:"var(--t1)",marginBottom:2}}>{q.label}</div>
                    <div style={{fontSize:10,color:"var(--t3)",marginBottom:10}}>{q.sub} · {qTasks.length} tasks</div>
                    {qTasks.length===0&&<div style={{fontSize:11,color:"var(--t3)",textAlign:"center",padding:"20px 0",opacity:.5}}>None here</div>}
                    {qTasks.map(t=>(
                      <div key={t.id} className="matrix-task" onClick={()=>{setShowEisenhower(false);setDetailTaskId(t.id);}}>
                        <span style={{fontSize:11}}>{t.priority==="high"?"🔴":t.priority==="medium"?"🟡":"🟢"}</span>
                        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</span>
                        {t.due&&<span style={{fontSize:9,color:"var(--t3)",flexShrink:0}}>{t.due}</span>}
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
      {streakMilestone&&(
        <div className="milestone-popup">
          <div style={{fontSize:36,marginBottom:4}}>🔥</div>
          <div style={{fontSize:18,fontWeight:900,color:"#1a0a00"}}>
            {streakMilestone} Day Streak!
          </div>
          <div style={{fontSize:12,color:"rgba(0,0,0,.6)",marginTop:4}}>
            {streakMilestone===7?"One week strong! 💪":streakMilestone===14?"Two weeks! You're building real habits 🧠":streakMilestone===30?"A WHOLE MONTH! Legend 👑":streakMilestone===60?"60 days. Absolutely elite. 🏆":"You're unstoppable! 🚀"}
          </div>
        </div>
      )}

      {/* == VOICE TRANSCRIPT TOAST == */}
      {isListening&&(
        <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"rgba(255,107,107,.95)",color:"white",borderRadius:16,padding:"10px 20px",fontSize:13,fontWeight:700,zIndex:8000,backdropFilter:"blur(10px)",boxShadow:"0 8px 32px rgba(255,107,107,.4)",display:"flex",alignItems:"center",gap:8,maxWidth:320,textAlign:"center"}}>
          <span style={{fontSize:16}}>🔴</span>
          <span>{voiceTranscript||"Listening… speak now"}</span>
        </div>
      )}

      {/* == PIN MODAL == */}
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
      </>
      )}
    </>
  );
}