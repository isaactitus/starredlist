export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayStr = () => new Date().toISOString().split("T")[0];
export const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
export const fmtDateFull = d => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
export const isOverdue = (due, done) => !done && due && new Date(due) < new Date();
export const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const getFirstDay = (y, m) => new Date(y, m, 1).getDay();

