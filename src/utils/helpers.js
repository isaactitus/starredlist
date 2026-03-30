export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayStr = () => new Date().toISOString().split("T")[0];
export const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
export const fmtDateFull = d => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
export const isOverdue = (due, done) => !done && due && new Date(due) < new Date();
export const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const getFirstDay = (y, m) => new Date(y, m, 1).getDay();

export const XP_LEVELS = [
  { level: 1, name: "Beginner", minXP: 0, icon: "🌱" },
  { level: 2, name: "Learner", minXP: 100, icon: "📚" },
  { level: 3, name: "Doer", minXP: 250, icon: "⚡" },
  { level: 4, name: "Achiever", minXP: 500, icon: "🎯" },
  { level: 5, name: "Go-Getter", minXP: 800, icon: "🔥" },
  { level: 6, name: "Pro", minXP: 1200, icon: "💼" },
  { level: 7, name: "Expert", minXP: 1800, icon: "🏆" },
  { level: 8, name: "Master", minXP: 2500, icon: "💎" },
  { level: 9, name: "Legend", minXP: 3500, icon: "🌟" },
  { level: 10, name: "Taskflow King", minXP: 5000, icon: "👑" },
];

export function getLevel(xp) {
  let current = XP_LEVELS[0];
  for (const lvl of XP_LEVELS) { if (xp >= lvl.minXP) current = lvl; }
  const next = XP_LEVELS.find(l => l.minXP > xp);
  const progress = next ? Math.round(((xp - current.minXP) / (next.minXP - current.minXP)) * 100) : 100;
  return { ...current, next, progress, xp };
}
