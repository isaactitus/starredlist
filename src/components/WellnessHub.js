import React, { useState, useEffect } from 'react';
import { WATER_GOAL } from '../utils/constants';

const BreathingTool = ({ accent }) => {
  const [phase, setPhase] = useState('Inhale');
  const [timer, setTimer] = useState(4);

  useEffect(() => {
    let nextPhase = 'Inhale';
    let nextTimer = 4;
    
    const interval = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          if (nextPhase === 'Inhale') { nextPhase = 'Hold'; nextTimer = 4; }
          else if (nextPhase === 'Hold') { nextPhase = 'Exhale'; nextTimer = 4; }
          else { nextPhase = 'Inhale'; nextTimer = 4; }
          setPhase(nextPhase);
          return nextTimer;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: 20, background: 'var(--s2)', borderRadius: 20, border: '1px solid var(--b1)' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1 }}>Guided Breathing</div>
      <div className={`breathing-circle ${phase.toLowerCase()}`} style={{ 
        width: 140, height: 140, borderRadius: '50%', 
        background: `radial-gradient(circle at center, ${accent.v}88, ${accent.g}44)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 40px ${accent.v}44`,
        transition: 'transform 4s ease-in-out'
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>{timer}</div>
      </div>
      <div style={{ fontSize: 22, fontFamily: "'Instrument Serif',serif", color: 'var(--acc)' }}>{phase}</div>
      <style>{`
        .breathing-circle.inhale { transform: scale(1.4); }
        .breathing-circle.hold { transform: scale(1.4); }
        .breathing-circle.exhale { transform: scale(1.0); }
      `}</style>
    </div>
  );
};

export const WellnessHub = ({ 
  wellness, 
  accent, 
  activeProfile 
}) => {
  const { 
    calorieLogs, 
    getTodayWater, 
    addWater, 
    calorieGoal
  } = wellness;

  const todayWater = getTodayWater();
  const waterProgress = Math.min(100, (todayWater / WATER_GOAL) * 100);

  return (
    <div className="wellness-hub" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
         <div style={{ fontSize: 28 }}>🌿</div>
         <div>
            <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 26, color: 'var(--t1)' }}>Wellness Hub</div>
            <div style={{ fontSize: 12, color: 'var(--t3)' }}>Balance your mind and body.</div>
         </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
        {/* Hydration Card */}
        <div style={{ background: 'var(--s2)', borderRadius: 20, padding: 16, border: '1px solid var(--b1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t2)' }}>🌊 Hydration</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#48dbfb' }}>{todayWater}/{WATER_GOAL}</div>
           </div>
           <div style={{ height: 8, background: 'var(--s3)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${waterProgress}%`, height: '100%', background: 'linear-gradient(90deg, #48dbfb, #00d4aa)', transition: 'width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
           </div>
            <div style={{ display: 'flex', gap: 6 }}>
               <button 
                  onClick={() => addWater(250)} 
                  style={{ flex: 1, padding: '8px 0', background: 'var(--s3)', border: '1px solid var(--b1)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#48dbfb', cursor: 'pointer' }}
               >
                 +250ml
               </button>
               <button 
                  onClick={() => addWater(500)} 
                  style={{ flex: 1, padding: '8px 0', background: 'var(--s3)', border: '1px solid var(--b1)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#48dbfb', cursor: 'pointer' }}
               >
                 +500ml
               </button>
            </div>
        </div>
      </div>

      {/* Breathing Section */}
      <BreathingTool accent={accent} />

      {/* Wellness Stats summary */}
      <div style={{ background: 'var(--s2)', borderRadius: 20, padding: 16, border: '1px solid var(--b1)' }}>
         <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Health Insights</div>
         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <div style={{ fontSize: 13, color: 'var(--t2)' }}>🍎 Daily Calories</div>
               <div style={{ fontSize: 13, fontWeight: 700 }}>{calorieLogs.length > 0 ? calorieLogs.reduce((acc, l) => acc + l.cal, 0) : 0} <span style={{ color: 'var(--t3)', fontWeight: 400 }}>/ {calorieGoal} kcal</span></div>
            </div>
         </div>
      </div>
    </div>
  );
};
