# TaskFlow Calendar Feature - Complete Implementation Analysis

## 1. CALENDAR STATE MANAGEMENT

### Location: [src/App.js](src/App.js#L2525) - Line 2525

```javascript
// Calendar State Variables
const now = new Date();
const [calYear, setCalYear] = useState(now.getFullYear());    // Current year (e.g., 2025)
const [calMonth, setCalMonth] = useState(now.getMonth());      // Current month (0-11)
const [selDate, setSelDate] = useState(todayStr());            // Selected date (YYYY-MM-DD)
```

**State Description:**
- `calYear`: Tracks the current year being displayed in the calendar
- `calMonth`: Tracks the current month (0 = January, 11 = December)
- `selDate`: Tracks the user's selected date for viewing tasks on that day

---

## 2. HELPER FUNCTIONS FOR DATE CALCULATIONS

### Location: [src/utils/helpers.js](src/utils/helpers.js#L1-L7)

```javascript
export const uid = () => Math.random().toString(36).slice(2, 10);
export const todayStr = () => new Date().toISOString().split("T")[0];
export const fmtDate = d => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
export const fmtDateFull = d => d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
export const isOverdue = (due, done) => !done && due && new Date(due) < new Date();

// Calendar-specific helpers
export const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const getFirstDay = (y, m) => new Date(y, m, 1).getDay();
```

**Function Details:**
- `todayStr()`: Returns today's date in YYYY-MM-DD format (used to set initial selDate)
- `fmtDate()`: Formats dates as "Mon DD"
- `fmtDateFull()`: Formats dates as "Month DD, YYYY"
- `getDaysInMonth(year, month)`: Returns the number of days in a given month
- `getFirstDay(year, month)`: Returns the starting day of the week for a month (0=Sunday, 6=Saturday)

---

## 3. CALENDAR PAGE COMPONENT

### Location: [src/App.js](src/App.js#L3442-L3505)

```javascript
function CalendarPage() {
  // Calculate calendar grid
  const days = getDaysInMonth(calYear, calMonth);
  const firstDay = getFirstDay(calYear, calMonth);
  const cells = Array.from({ length: firstDay + (days) }, (_, i) => i < firstDay ? null : i - firstDay + 1);
  const pad = (7 - cells.length % 7) % 7;
  const allCells = [...cells, ...Array(pad).fill(null)];
  
  // Get tasks for selected date
  const selTasks = profileTasks.filter(t => t.due === selDate);
  const monthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  
  return (
    <div className="cal-page">
      {/* Component content structure here */}
    </div>
  );
}
```

### Component Structure:

#### 3.1 Calendar Header with Navigation
```jsx
{/* Header */}
<div className="cal-header">
  {/* Previous Month Button */}
  <button className="cal-nav" onClick={() => { 
    if (calMonth === 0) { 
      setCalMonth(11); 
      setCalYear(y => y - 1); 
    } else 
      setCalMonth(m => m - 1); 
  }} title="Previous month">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  </button>
  
  {/* Month/Year Label */}
  <div className="cal-month">{monthLabel}</div>
  
  {/* Next Month Button */}
  <button className="cal-nav" onClick={() => { 
    if (calMonth === 11) { 
      setCalMonth(0); 
      setCalYear(y => y + 1); 
    } else 
      setCalMonth(m => m + 1); 
  }} title="Next month">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  </button>
  
  {/* Today Button */}
  <button onClick={() => { 
    const n = new Date(); 
    setCalMonth(n.getMonth()); 
    setCalYear(n.getFullYear()); 
    setSelDate(todayStr()); 
  }} 
  style={{ height: 32, padding: "0 14px", borderRadius: 16, background: "transparent", border: "1px solid var(--b2)", fontSize: 12, fontWeight: 500, color: "var(--t2)", cursor: "pointer", whiteSpace: "nowrap", transition: "background .15s" }}
  onMouseEnter={e => e.target.style.background = "var(--s2)"} 
  onMouseLeave={e => e.target.style.background = "transparent"}>
    Today
  </button>
</div>
```

#### 3.2 Calendar Grid (7-column layout for days of week)
```jsx
{/* Day names */}
<div className="cal-grid">
  {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
    <div key={i} className="cal-day-name">{d}</div>
  ))}
  
  {/* Calendar cells */}
  {allCells.map((day, i) => {
    if (!day) return <div key={i} />;
    const ds = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayTasks = profileTasks.filter(t => t.due === ds);
    const isToday = ds === todayStr();
    const isSel = ds === selDate;
    
    return (
      <div key={i} 
        className={`cal-cell ${isToday ? "today" : ""} ${isSel ? "selected" : ""} ${dayTasks.length > 0 ? "has-tasks" : ""}`} 
        onClick={() => setSelDate(ds)}>
        <div className="cal-num">{day}</div>
        {dayTasks.length > 0 && (
          <div className="cal-dots">
            {dayTasks.slice(0, 3).map((t, j) => (
              <div key={j} className="cal-dot" 
                style={{ background: j === 0 ? accent.v : j === 1 ? "var(--red)" : "var(--green)" }} />
            ))}
          </div>
        )}
      </div>
    );
  })}
</div>
```

#### 3.3 Divider
```jsx
<div style={{ height: 1, background: "var(--b1)", marginBottom: 16 }} />
```

#### 3.4 Selected Date Tasks Section
```jsx
{/* Selected date tasks */}
<div className="cal-task-list">
  {/* Date Header with Task Count and New Task Button */}
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
    <div className="cal-task-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <span style={{ color: "var(--t1)", fontWeight: 600 }}>{fmtDateFull(selDate)}</span>
      {selTasks.length > 0 && <span style={{ fontSize: 11, background: "var(--s2)", color: "var(--t3)", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>{selTasks.length}</span>}
    </div>
    
    {/* Create New Task Button */}
    <button onClick={() => { 
      setForm({ ...blankForm, due: selDate, profileId: activeProfile }); 
      setTagInput(""); 
      setSubInput(""); 
      setEditTaskObj(null); 
      setShowTaskModal(true); 
      play("tap"); 
      haptic("light"); 
    }}
    style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", background: accent.v, borderRadius: 17, fontSize: 12.5, fontWeight: 500, color: "#fff", border: "none", cursor: "pointer", boxShadow: `0 1px 6px ${accent.v}40`, transition: "opacity .15s" }}
    onMouseEnter={e => e.currentTarget.style.opacity = ".85"} 
    onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/>
        <line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      New task
    </button>
  </div>
  
  {/* Tasks List or Empty State */}
  {selTasks.length === 0
    ? <div style={{ textAlign: "center", padding: "32px 0 16px", color: "var(--t3)" }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: .35, marginBottom: 10 }}>
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <div style={{ fontSize: 13, fontWeight: 400 }}>No tasks for this day</div>
      </div>
    : <div className="task-grid">{selTasks.map(task => <TaskCard key={task.id} task={task} />)}</div>
  }
</div>
```

---

## 4. CSS CLASSES AND STYLING

### Location: [src/App.js](src/App.js#L621-L660)

```css
/* == CALENDAR == */
.cal-page {
  padding: 20px 18px 90px;
}

.cal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
}

.cal-month {
  font-size: 18px;
  font-weight: 600;
  color: var(--t1);
  letter-spacing: -0.3px;
  flex: 1;
  margin-left: 4px;
}

.cal-nav {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--t2);
  transition: background 0.15s;
  cursor: pointer;
}

.cal-nav:hover {
  background: var(--s2);
}

/* Calendar Grid Layout */
.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 12px;
}

.cal-day-name {
  text-align: center;
  font-size: 11px;
  font-weight: 500;
  color: var(--t3);
  padding: 6px 0;
  letter-spacing: 0.3px;
}

/* Individual Calendar Cell */
.cal-cell {
  min-height: 40px;
  border-radius: 8px;
  padding: 4px 2px;
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.cal-cell:hover {
  background: var(--s2);
}

/* Today's Date Highlight */
.cal-cell.today .cal-num {
  background: var(--acc);
  color: #fff;
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Selected Date Highlight */
.cal-cell.selected .cal-num {
  background: var(--acc)22;
  color: var(--acc);
  border-radius: 50%;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

/* Combined Today + Selected */
.cal-cell.today.selected .cal-num {
  background: var(--acc);
  color: #fff;
}

/* Day Number */
.cal-num {
  font-size: 13px;
  font-weight: 400;
  color: var(--t1);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Task Indicator Dots */
.cal-dots {
  display: flex;
  gap: 3px;
  justify-content: center;
}

.cal-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

/* Calendar Task List Container */
.cal-task-list {
  margin-top: 4px;
}

.cal-task-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--t2);
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}
```

---

## 5. TAB NAVIGATION INTEGRATION

### Location: [src/App.js](src/App.js#L7279)

```jsx
{/* Calendar tab rendering in main content area */}
tab === "calendar" ? <div key="calendar" className="content page-fade" style={{ overflowY: "auto", height: "100%" }}>{CalendarPage()}</div> :
```

### Navigation Button Configuration
Location: [src/App.js](src/App.js#L7191)

```jsx
{ id: "calendar", 
  icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>, 
  label: t.calendar, 
  cnt: null 
}
```

---

## 6. TASK CARD COMPONENT (Calendar Display)

### Location: [src/App.js](src/App.js#L2815-L2900+)

When tasks are displayed in the calendar grid, they use the `TaskCard` component which renders:

**Task Card Features:**
- ✅ Completion checkbox
- ⭐ Star/favorite button
- 📝 Task title with age indicator (for tasks >7 days old)
- 📸 Task photo (if attached)
- 📋 Task notes
- Priority badge (High/Medium/Low with color coding)
- Category badge
- Tags (up to 2 shown)
- Due date with overdue indicator
- Time estimate badge
- Dependency/blocking status
- Recurring pattern indicator
- Time tracking display
- Subtask progress bar
- Swipe actions (right=complete, left=delete)

---

## 7. EVENT/TASK CREATION ON CALENDAR

### From Selected Date

When clicking the "New task" button on a selected calendar date:

```javascript
onClick={() => { 
  setForm({ ...blankForm, due: selDate, profileId: activeProfile }); 
  setTagInput(""); 
  setSubInput(""); 
  setEditTaskObj(null); 
  setShowTaskModal(true); 
  play("tap"); 
  haptic("light"); 
}}
```

**Actions:**
1. Pre-fills the task form with the selected date
2. Sets the profile to the active profile
3. Clears tag and subtask inputs
4. Opens the task modal
5. Plays a tap sound
6. Triggers haptic feedback

---

## 8. CALENDAR INTEGRATION WITH TASKS

### Task Filtering
```javascript
// Get tasks for a specific day
const dayTasks = profileTasks.filter(t => t.due === ds);

// Get tasks for selected date
const selTasks = profileTasks.filter(t => t.due === selDate);
```

### Date Format
All calendar dates use ISO format: `YYYY-MM-DD`

### Task Indicators
- **Dots on calendar cells**: Show up to 3 tasks per day
  - First dot: Primary accent color
  - Second dot: Red
  - Third dot: Green

---

## 9. DATA FLOW ARCHITECTURE

```
App Component
  ├── State: calYear, calMonth, selDate
  ├── State: profileTasks (all tasks)
  ├── State: activeProfile (current profile)
  │
  └── CalendarPage()
      ├── Calculate calendar grid
      │   ├── getDaysInMonth(calYear, calMonth)
      │   ├── getFirstDay(calYear, calMonth)
      │   └── Generate cells array
      │
      ├── Render Header
      │   ├── Previous/Next month buttons (update calMonth/calYear)
      │   ├── Month label display
      │   └── Today button (resets to current date)
      │
      ├── Render Grid (7 columns x 6 rows)
      │   ├── Day name headers (Sun-Sat)
      │   └── Calendar cells
      │       ├── Cell styling (today, selected, has-tasks)
      │       ├── Day number
      │       └── Task indicator dots (max 3)
      │
      └── Render Task List
          ├── Date header (formatted full date)
          ├── Task count badge
          ├── New task button (pre-fills due date)
          └── TaskCard components or empty state
```

---

## 10. COLOR AND STYLING VARIABLES

Used from CSS custom properties:

```css
--acc          /* Primary accent color */
--t1           /* Primary text color */
--t2           /* Secondary text color */
--t3           /* Tertiary/muted text color */
--b1           /* Primary border color */
--b2           /* Secondary border color */
--s1           /* Surface 1 (background) */
--s2           /* Surface 2 (hover state) */
--red          /* Error/overdue color */
--green        /* Success/completed color */
```

---

## 11. RESPONSIVE BEHAVIOR

### Mobile (max-width: 920px)
- Calendar is fully responsive within the single-column layout
- Bottom navigation shows the calendar tab as "📅"
- Task cards display in a 2-column grid on mobile
- Modal dialogs adjust to fit viewport

---

## 12. FEATURES SUMMARY

✅ **Month Navigation**
- Previous/Next month buttons
- Today button to reset to current month and date

✅ **Visual Indicators**
- Today highlighting
- Selected date highlighting
- Task count dots (up to 3 per day)
- Multi-profile support

✅ **Task Management**
- View all tasks for a selected date
- Create new tasks with pre-filled due date
- Edit/delete tasks from calendar
- Complete tasks with swipe gesture

✅ **Date Selection**
- Click any calendar cell to select it
- View tasks for that date below the grid
- Empty state when no tasks exist

✅ **Integration**
- Fully integrated with task system
- Respects active profile
- Uses consistent styling with app theme
- Supports dark/light mode

---

## 13. KEY DEPENDENCIES

- `getDaysInMonth()` - Helper function for calendar calculation
- `getFirstDay()` - Helper function for calendar layout
- `todayStr()` - Get current date in YYYY-MM-DD format
- `fmtDateFull()` - Format date for display
- `profileTasks` - Filtered task list for active profile
- `TaskCard` component - Displays individual tasks
- `accent` - Color configuration from settings
- Sound/haptic feedback functions

---

## 14. COMMAND PALETTE INTEGRATION

Location: [src/App.js](src/App.js#L6584)

```javascript
{ icon: "📅", label: "Go to Calendar", action: () => { setTab("calendar"); setShowCmdPalette(false); }, group: "Navigate" }
```

Users can quickly navigate to the calendar using the command palette.

