import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * AnimePet — Catzy-inspired kawaii cat companion.
 * A fully CSS/SVG-drawn interactive virtual pet that evolves with XP.
 */

// ── Evolution Data ──
const EVOLUTIONS = [
  { name: "Egg", minXp: 0, title: "A Mysterious Egg", scarf: false, crown: false, wings: false, bodyColor: "#fdf6e3", earInner: "#fbc4ab", blush: "#fed7d7" },
  { name: "Kitten", minXp: 50, title: "Tiny Kitten", scarf: false, crown: false, wings: false, bodyColor: "#fef9ef", earInner: "#fbc4ab", blush: "#fed7d7" },
  { name: "Cat", minXp: 200, title: "Curious Cat", scarf: true, crown: false, wings: false, bodyColor: "#fff8f0", earInner: "#f4a4a4", blush: "#ffc9c9" },
  { name: "Royal Cat", minXp: 500, title: "Royal Neko", scarf: true, crown: true, wings: false, bodyColor: "#fff5f5", earInner: "#e8a0bf", blush: "#fbb4d4" },
  { name: "Celestial Cat", minXp: 1000, title: "Celestial Neko ✦", scarf: true, crown: true, wings: true, bodyColor: "#f0f0ff", earInner: "#c4b5fd", blush: "#ddd6fe" },
];

const MESSAGES = {
  happy: [
    "Nyan~! You're doing amazing! ✨",
    "Keep going, I believe in you! 💪",
    "So productive today! Purrrr~ 🐾",
    "You're on fire! Let's goooo! 🔥",
    "I'm so proud of you! 😸",
    "Every task done = more snuggles! 🤗",
  ],
  idle: [
    "Hey... wanna work on something? 🐾",
    "*stretches* ...time for a task? 😺",
    "I'll nap here until you start~ 💤",
    "Poke me when you're ready! 👆",
    "The tasks miss you too, y'know~ 📋",
  ],
  sleeping: [
    "Zzz... too many overdue tasks... 😿",
    "*yawns* ...clear some tasks to wake me 💤",
    "I'm tired from worrying about deadlines 😴",
    "Help me... the overdue pile is scary 🙀",
  ],
  tap: [
    "Nya~! 😸",
    "Hehe, that tickles! 🐾",
    "*purrs loudly* 💕",
    "Mrow~? 🐱",
    "Again again! 😻",
    "Nyaaa~! ✨",
  ],
};

const AnimePet = ({ streak = 0, overdue = 0, xp = 0, activeItems = { hat: null, glass: null } }) => {
  const [isTapped, setIsTapped] = useState(false);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleMsg, setBubbleMsg] = useState('');
  const [hearts, setHearts] = useState([]);
  const [blinkPhase, setBlinkPhase] = useState(false);
  const [tailWag, setTailWag] = useState(false);
  const bubbleTimer = useRef(null);
  const heartId = useRef(0);

  const level = Math.max(1, Math.floor(xp / 100) + 1);
  const xpProgress = (xp % 100);
  const isSleeping = overdue >= 3 || streak === 0;
  const isHappy = streak > 2 && overdue === 0;

  // Find current evolution
  const evolution = useMemo(() => {
    let evo = EVOLUTIONS[0];
    for (const e of EVOLUTIONS) {
      if (xp >= e.minXp) evo = e;
    }
    return evo;
  }, [xp]);

  // Blinking every 3-5 seconds
  useEffect(() => {
    if (isSleeping) return;
    const blink = () => {
      setBlinkPhase(true);
      setTimeout(() => setBlinkPhase(false), 180);
    };
    const interval = setInterval(blink, 3000 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isSleeping]);

  // Tail wagging for happy state
  useEffect(() => {
    if (!isHappy) { setTailWag(false); return; }
    setTailWag(true);
  }, [isHappy]);

  // Auto greeting bubble
  useEffect(() => {
    const timer = setTimeout(() => {
      const msgs = isSleeping ? MESSAGES.sleeping : isHappy ? MESSAGES.happy : MESSAGES.idle;
      setBubbleMsg(msgs[Math.floor(Math.random() * msgs.length)]);
      setShowBubble(true);
      setTimeout(() => setShowBubble(false), 4000);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isSleeping, isHappy]);

  const handleTap = () => {
    setIsTapped(true);
    setTimeout(() => setIsTapped(false), 500);

    // Show tap message
    const msgs = MESSAGES.tap;
    setBubbleMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    setShowBubble(true);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setShowBubble(false), 2500);

    // Spawn hearts
    const id = heartId.current++;
    const newHearts = Array.from({length: 3}, (_, i) => ({
      id: id * 10 + i,
      x: 30 + Math.random() * 40,
      delay: i * 0.15,
    }));
    setHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setHearts(prev => prev.filter(h => !newHearts.find(nh => nh.id === h.id)));
    }, 1200);
  };

  const mood = isSleeping ? 'sleeping' : isHappy ? 'happy' : 'idle';

  // Eye expression
  const eyeRy = blinkPhase ? 0.5 : (isSleeping ? 0 : (isHappy ? 5 : 5.5));

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {/* CSS Keyframes */}
      <style>{`
        @keyframes petBreathe {
          0%, 100% { transform: scaleY(1) translateY(0); }
          50% { transform: scaleY(1.02) translateY(-1px); }
        }
        @keyframes petBounce {
          0% { transform: scale(1); }
          30% { transform: scale(0.92) translateY(3px); }
          60% { transform: scale(1.08) translateY(-5px); }
          100% { transform: scale(1); }
        }
        @keyframes tailSwish {
          0%, 100% { transform: rotate(-15deg) scaleX(1); }
          25% { transform: rotate(5deg) scaleX(1.05); }
          50% { transform: rotate(-20deg) scaleX(0.95); }
          75% { transform: rotate(10deg) scaleX(1.02); }
        }
        @keyframes floatHeart {
          0% { opacity: 1; transform: translateY(0) scale(0.6); }
          50% { opacity: 0.9; transform: translateY(-20px) scale(1); }
          100% { opacity: 0; transform: translateY(-45px) scale(0.7); }
        }
        @keyframes bubbleIn {
          0% { opacity: 0; transform: translateY(6px) scale(0.8); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes bubbleOut {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-4px) scale(0.9); }
        }
        @keyframes sleepFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.5; }
          50% { transform: translateY(-8px) rotate(10deg); opacity: 1; }
        }
        @keyframes wingFlap {
          0%, 100% { transform: scaleX(1) rotate(0deg); }
          50% { transform: scaleX(0.7) rotate(-8deg); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
          50% { opacity: 1; transform: scale(1.2) rotate(180deg); }
        }
        @keyframes eggWobble {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(5deg); }
          75% { transform: rotate(-5deg); }
        }
        @keyframes crownGlow {
          0%, 100% { filter: drop-shadow(0 0 3px rgba(255,215,0,0.3)); }
          50% { filter: drop-shadow(0 0 8px rgba(255,215,0,0.8)); }
        }
      `}</style>

      <div
        onClick={handleTap}
        style={{
          background: 'linear-gradient(145deg, var(--s2) 0%, var(--s1, #1a1a2e) 100%)',
          borderRadius: 24,
          padding: '16px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          border: isHappy ? '1.5px solid var(--acc, #7c6dfa)' : '1px solid var(--b1, rgba(255,255,255,0.06))',
          boxShadow: isHappy
            ? '0 8px 32px var(--glow, rgba(124,109,250,0.15)), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 4px 16px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.03)',
          transition: 'all .4s cubic-bezier(.4,0,.2,1)',
          cursor: 'pointer',
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* ── PET AVATAR ── */}
        <div style={{
          position: 'relative',
          width: 80,
          height: 80,
          flexShrink: 0,
          animation: isTapped ? 'petBounce 0.5s ease' : (isSleeping ? 'none' : 'petBreathe 3s ease-in-out infinite'),
        }}>
          {/* Floating hearts on tap */}
          {hearts.map(h => (
            <span key={h.id} style={{
              position: 'absolute',
              left: `${h.x}%`,
              bottom: '70%',
              fontSize: 16,
              animation: `floatHeart 1s ease-out ${h.delay}s forwards`,
              pointerEvents: 'none',
              zIndex: 20,
            }}>💕</span>
          ))}

          {/* Sleep Zzz */}
          {isSleeping && (
            <>
              <span style={{ position: 'absolute', top: -4, right: 2, fontSize: 14, animation: 'sleepFloat 2s ease-in-out infinite', zIndex: 20 }}>💤</span>
              <span style={{ position: 'absolute', top: -8, right: 14, fontSize: 10, animation: 'sleepFloat 2.5s ease-in-out 0.5s infinite', zIndex: 20 }}>z</span>
            </>
          )}

          {/* Sparkle for celestial */}
          {evolution.wings && (
            <>
              <span style={{ position: 'absolute', top: -2, left: 5, fontSize: 10, animation: 'sparkle 2s ease infinite', zIndex: 20 }}>✦</span>
              <span style={{ position: 'absolute', top: 10, right: 0, fontSize: 8, animation: 'sparkle 2s ease 0.7s infinite', zIndex: 20 }}>✧</span>
              <span style={{ position: 'absolute', bottom: 10, left: 0, fontSize: 9, animation: 'sparkle 2s ease 1.4s infinite', zIndex: 20 }}>✦</span>
            </>
          )}

          {/* SVG Cat */}
          <svg viewBox="0 0 100 100" width="80" height="80" style={{ overflow: 'visible' }}>
            {/* Glow behind for happy state */}
            {isHappy && (
              <circle cx="50" cy="55" r="38" fill="none" stroke="var(--acc, #7c6dfa)" strokeWidth="1" opacity="0.3">
                <animate attributeName="r" values="36;40;36" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.4;0.2" dur="3s" repeatCount="indefinite" />
              </circle>
            )}

            {evolution.name === "Egg" ? (
              /* ── EGG STAGE ── */
              <g style={{ animation: 'eggWobble 2s ease-in-out infinite', transformOrigin: '50px 50px' }}>
                <ellipse cx="50" cy="55" rx="22" ry="28" fill={evolution.bodyColor} stroke="#e8d5c4" strokeWidth="1.5" />
                <ellipse cx="50" cy="50" rx="18" ry="22" fill="none" stroke="#f5e6d3" strokeWidth="0.5" opacity="0.5" />
                {/* Crack lines */}
                <path d="M42 45 L46 50 L43 55" fill="none" stroke="#d4c4b0" strokeWidth="1" strokeLinecap="round" />
                <path d="M55 42 L58 48 L54 52" fill="none" stroke="#d4c4b0" strokeWidth="0.8" strokeLinecap="round" />
                {/* Little peeking eyes */}
                <circle cx="44" cy="48" r="2" fill="#4a4a5a" />
                <circle cx="56" cy="48" r="2" fill="#4a4a5a" />
                <circle cx="44.8" cy="47.3" r="0.7" fill="white" />
                <circle cx="56.8" cy="47.3" r="0.7" fill="white" />
              </g>
            ) : (
              <g>
                {/* ── WINGS (Celestial) ── */}
                {evolution.wings && (
                  <g>
                    <ellipse cx="18" cy="48" rx="12" ry="18" fill="url(#wingGrad)" opacity="0.7"
                      style={{ animation: 'wingFlap 2s ease-in-out infinite', transformOrigin: '30px 48px' }} />
                    <ellipse cx="82" cy="48" rx="12" ry="18" fill="url(#wingGrad)" opacity="0.7"
                      style={{ animation: 'wingFlap 2s ease-in-out 0.15s infinite', transformOrigin: '70px 48px' }} />
                    <defs>
                      <radialGradient id="wingGrad">
                        <stop offset="0%" stopColor="#ddd6fe" />
                        <stop offset="100%" stopColor="#c4b5fd" stopOpacity="0.3" />
                      </radialGradient>
                    </defs>
                  </g>
                )}

                {/* ── TAIL ── */}
                <path
                  d="M72 72 Q85 65 82 50 Q80 42 75 45"
                  fill="none"
                  stroke={evolution.bodyColor}
                  strokeWidth="5"
                  strokeLinecap="round"
                  style={{
                    transformOrigin: '72px 72px',
                    animation: tailWag ? 'tailSwish 1s ease-in-out infinite' : 'none',
                    filter: `drop-shadow(1px 1px 0 #e5d5c5)`,
                  }}
                />

                {/* ── BODY ── */}
                <ellipse cx="50" cy="68" rx="26" ry="20" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="1" />
                {/* Belly */}
                <ellipse cx="50" cy="72" rx="16" ry="12" fill="#fff" opacity="0.5" />

                {/* ── PAWS ── */}
                <ellipse cx="34" cy="84" rx="8" ry="5" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="0.8" />
                <ellipse cx="66" cy="84" rx="8" ry="5" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="0.8" />
                {/* Paw pads */}
                <circle cx="33" cy="84" r="1.5" fill="#fbc4ab" opacity="0.7" />
                <circle cx="36" cy="83" r="1" fill="#fbc4ab" opacity="0.7" />
                <circle cx="65" cy="84" r="1.5" fill="#fbc4ab" opacity="0.7" />
                <circle cx="68" cy="83" r="1" fill="#fbc4ab" opacity="0.7" />

                {/* ── HEAD ── */}
                <circle cx="50" cy="42" r="24" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="1" />

                {/* ── EARS ── */}
                <polygon points="30,30 22,10 40,24" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="1" strokeLinejoin="round" />
                <polygon points="70,30 78,10 60,24" fill={evolution.bodyColor} stroke="#ecdac8" strokeWidth="1" strokeLinejoin="round" />
                {/* Inner ears */}
                <polygon points="31,28 25,14 38,25" fill={evolution.earInner} opacity="0.6" />
                <polygon points="69,28 75,14 62,25" fill={evolution.earInner} opacity="0.6" />

                {/* ── ACCESSORIES (PURCHASED) ── */}
                {activeItems?.hat === 'party_hat' && (
                  <g transform="translate(50, 18) scale(1.1) rotate(-5)">
                    <path d="M-10 0 L0 -24 L10 0 Z" fill="#ff6b6b" stroke="white" strokeWidth="0.5" />
                    <circle cx="0" cy="-24" r="2.5" fill="white" />
                    <circle cx="-3" cy="-10" r="1" fill="white" opacity="0.6" />
                    <circle cx="4" cy="-18" r="0.8" fill="white" opacity="0.4" />
                  </g>
                )}
                {activeItems?.hat === 'top_hat' && (
                  <g transform="translate(50, 20) scale(1.1)">
                    <rect x="-14" y="-2" width="28" height="4" rx="2" fill="#333" />
                    <rect x="-9" y="-18" width="18" height="16" fill="#333" />
                    <rect x="-9" y="-6" width="18" height="3" fill="#ff6b8a" />
                  </g>
                )}
                {activeItems?.hat === 'straw_hat' && (
                  <g transform="translate(50, 22) scale(1.1)">
                    <ellipse cx="0" cy="0" rx="22" ry="6" fill="#f1c40f" />
                    <path d="M-10 0 Q-10 -12 0 -12 Q10 -12 10 0" fill="#f1c40f" stroke="#d4ac0d" strokeWidth="0.5" />
                    <rect x="-10" y="-3" width="20" height="2" fill="#ff6b3d" />
                  </g>
                )}

                {activeItems?.glass === 'cool_shades' && (
                  <g transform="translate(50, 42) scale(0.9)">
                    <rect x="-18" y="-4" width="15" height="10" rx="4" fill="#222" />
                    <rect x="3" y="-4" width="15" height="10" rx="4" fill="#222" />
                    <path d="M-3 1 L3 1" stroke="#222" strokeWidth="2" />
                  </g>
                )}
                {activeItems?.glass === 'heart_glasses' && (
                  <g transform="translate(50, 42) scale(0.9)">
                    <path d="M-16 -4 Q-12 -12 -8 -4 Q-4 -12 0 -4 L-8 6 Z" fill="rgba(232,67,147,0.4)" stroke="#e84393" strokeWidth="1.5" />
                    <path d="M4 -4 Q8 -12 12 -4 Q16 -12 20 -4 L12 6 Z" fill="rgba(232,67,147,0.4)" stroke="#e84393" strokeWidth="1.5" />
                    <path d="M0 1 L4 1" stroke="#e84393" strokeWidth="2" />
                  </g>
                )}

                {/* ── CROWN (Royal+) ── */}
                {evolution.crown && (
                  <g style={{ animation: 'crownGlow 3s ease-in-out infinite' }}>
                    <polygon points="38,18 42,6 46,14 50,2 54,14 58,6 62,18" fill="#ffd700" stroke="#f0c000" strokeWidth="0.5" />
                    <circle cx="50" cy="6" r="2" fill="#ff6b8a" />
                    <circle cx="42" cy="10" r="1.3" fill="#60d6ff" />
                    <circle cx="58" cy="10" r="1.3" fill="#60d6ff" />
                  </g>
                )}

                {/* ── FACE ── */}
                {/* Eyes */}
                {isSleeping ? (
                  /* Sleeping - closed eyes */
                  <g>
                    <path d="M38 42 Q42 45 46 42" fill="none" stroke="#6a6a7a" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M54 42 Q58 45 62 42" fill="none" stroke="#6a6a7a" strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                ) : (
                  <g>
                    {/* Eye whites */}
                    <ellipse cx="41" cy="42" rx="6" ry={eyeRy + 1} fill="white" />
                    <ellipse cx="59" cy="42" rx="6" ry={eyeRy + 1} fill="white" />
                    {/* Pupils */}
                    <ellipse cx="42" cy="42" rx="3.5" ry={eyeRy} fill="#3d3d50">
                      {isHappy && <animate attributeName="cy" values="42;41;42" dur="3s" repeatCount="indefinite" />}
                    </ellipse>
                    <ellipse cx="60" cy="42" rx="3.5" ry={eyeRy} fill="#3d3d50">
                      {isHappy && <animate attributeName="cy" values="42;41;42" dur="3s" repeatCount="indefinite" />}
                    </ellipse>
                    {/* Eye highlights */}
                    <circle cx="43.5" cy="40" r="1.5" fill="white" />
                    <circle cx="61.5" cy="40" r="1.5" fill="white" />
                    <circle cx="41" cy="43" r="0.8" fill="white" opacity="0.6" />
                    <circle cx="59" cy="43" r="0.8" fill="white" opacity="0.6" />
                  </g>
                )}

                {/* Blush cheeks */}
                <ellipse cx="33" cy="48" rx="5" ry="3" fill={evolution.blush} opacity={isHappy ? "0.7" : "0.4"} />
                <ellipse cx="67" cy="48" rx="5" ry="3" fill={evolution.blush} opacity={isHappy ? "0.7" : "0.4"} />

                {/* Nose */}
                <ellipse cx="50" cy="47" rx="2" ry="1.5" fill="#f4a4a4" />

                {/* Mouth */}
                {isHappy ? (
                  <g>
                    <path d="M46 50 Q50 55 54 50" fill="none" stroke="#c88" strokeWidth="1" strokeLinecap="round" />
                  </g>
                ) : isSleeping ? (
                  <path d="M47 51 Q50 53 53 51" fill="none" stroke="#aaa" strokeWidth="0.8" strokeLinecap="round" />
                ) : (
                  <g>
                    <path d="M47 50 Q50 52 53 50" fill="none" stroke="#c88" strokeWidth="0.8" strokeLinecap="round" />
                  </g>
                )}

                {/* Whiskers */}
                <line x1="24" y1="44" x2="35" y2="46" stroke="#d4c4b0" strokeWidth="0.6" />
                <line x1="24" y1="48" x2="35" y2="48" stroke="#d4c4b0" strokeWidth="0.6" />
                <line x1="65" y1="46" x2="76" y2="44" stroke="#d4c4b0" strokeWidth="0.6" />
                <line x1="65" y1="48" x2="76" y2="48" stroke="#d4c4b0" strokeWidth="0.6" />

                {/* ── SCARF (Cat+) ── */}
                {evolution.scarf && (
                  <g>
                    <path d="M32 58 Q50 65 68 58 Q65 62 50 64 Q35 62 32 58Z" fill="#ff6b8a" opacity="0.85" />
                    <circle cx="50" cy="63" r="3" fill="#ffd700" opacity="0.9" />
                  </g>
                )}
              </g>
            )}

            {/* XP Progress ring */}
            <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
            <circle
              cx="50" cy="50" r="46"
              fill="none"
              stroke="var(--acc, #7c6dfa)"
              strokeWidth="2"
              strokeDasharray={`${2 * Math.PI * 46}`}
              strokeDashoffset={2 * Math.PI * 46 * (1 - xpProgress / 100)}
              strokeLinecap="round"
              opacity="0.4"
              style={{ transform: 'rotate(-90deg)', transformOrigin: '50px 50px', transition: 'stroke-dashoffset 0.6s ease' }}
            />
          </svg>
        </div>

        {/* ── INFO PANEL ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name & Level */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t1, #e8eaf8)', letterSpacing: -0.3 }}>
              Neko-chan
              {evolution.crown && <span style={{ marginLeft: 4, fontSize: 12 }}>👑</span>}
            </div>
            <div style={{
              fontSize: 10,
              fontWeight: 900,
              color: 'var(--acc, #7c6dfa)',
              background: 'var(--accd, rgba(124,109,250,0.15))',
              padding: '2px 8px',
              borderRadius: 10,
              letterSpacing: 0.5,
            }}>Lv {level}</div>
          </div>

          {/* Evolution Stage */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t3, #888)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {evolution.title}
          </div>

          {/* Status badges */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 9,
              background: mood === 'happy' ? 'rgba(107,203,119,0.15)' : mood === 'sleeping' ? 'rgba(255,107,107,0.12)' : 'rgba(255,193,7,0.12)',
              color: mood === 'happy' ? '#6bcb77' : mood === 'sleeping' ? '#ff6b6b' : '#ffc107',
              padding: '2px 7px',
              borderRadius: 8,
              fontWeight: 700,
            }}>
              {mood === 'happy' ? '😸 Energetic' : mood === 'sleeping' ? '😴 Sleepy' : '😺 Calm'}
            </span>
            {streak > 0 && (
              <span style={{
                fontSize: 9,
                background: 'rgba(255,107,61,0.12)',
                color: '#ff6b3d',
                padding: '2px 7px',
                borderRadius: 8,
                fontWeight: 700,
              }}>🔥 {streak} streak</span>
            )}
          </div>

          {/* XP Progress Bar */}
          <div style={{ position: 'relative', height: 6, background: 'var(--s3, rgba(255,255,255,0.06))', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              width: `${xpProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--acc, #7c6dfa), #b06dfa)',
              borderRadius: 3,
              transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
              boxShadow: '0 0 8px var(--acc, rgba(124,109,250,0.4))',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 3 }}>
            <span style={{ fontSize: 8.5, color: 'var(--t3, #888)', fontWeight: 600 }}>
              {xpProgress}/100 XP
            </span>
            <span style={{ fontSize: 8.5, color: 'var(--t3, #888)', fontWeight: 600 }}>
              → Lv {level + 1}
            </span>
          </div>
        </div>

        {/* ── SPEECH BUBBLE ── */}
        {showBubble && (
          <div style={{
            position: 'absolute',
            left: 10,
            top: -38,
            background: 'var(--s2, #242438)',
            border: '1px solid var(--b1, rgba(255,255,255,0.08))',
            borderRadius: 14,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--t1, #e8eaf8)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
            animation: 'bubbleIn 0.3s ease forwards',
            zIndex: 30,
            maxWidth: 200,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}>
            {bubbleMsg}
            {/* Bubble tail */}
            <div style={{
              position: 'absolute',
              bottom: -5,
              left: 20,
              width: 10,
              height: 10,
              background: 'var(--s2, #242438)',
              border: '1px solid var(--b1, rgba(255,255,255,0.08))',
              borderTop: 'none',
              borderLeft: 'none',
              transform: 'rotate(45deg)',
            }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AnimePet;
