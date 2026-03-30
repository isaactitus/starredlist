import { todayStr } from './helpers';

/**
 * LIBI BRAIN v3.0 — Full Reasoning Engine (No API Required)
 * Built-in intelligence with deep context, multi-domain knowledge,
 * adaptive personality, and true conversation understanding.
 */
export function libiBot(input, tasks, cats, t, userName = "friend", memory = {}) {
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
  // 1. GREETINGS
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
  // 2. WHO ARE YOU / CAPABILITIES
  // =========================================================
  if (/(who are you|what are you|what can you do|your (name|capabilities|features)|tell me about yourself|are you (ai|chatgpt|gpt|claude|gemini|real|human|a bot|an ai)|how (do you|does libi) work|are you smart|are you intelligent|libi v4|what version)/i.test(cleanMsg)) {
    return `I'm **LIBI V4** ✦ — the most advanced version of your personal AI productivity assistant, built for Taskflow.\n\n**🆕 What's new in V4:**\n• 🧠 **Deeper reasoning** — I understand context better, give smarter plans\n• ☁️ **Cloud sync awareness** — I know your data syncs across devices\n• 📵 **Social media coaching** — I can help you reduce screen time\n• 👫 **Team intelligence** — I understand your collaboration rooms\n• 🌟 **Richer personality** — warmer, more nuanced, less robotic\n• ⚡ **Faster task parsing** — I understand natural language even better\n\n**💡 My full capabilities:**\n• 📋 **Task intelligence** — I know your priorities, deadlines, patterns\n• 📅 **Day planning** — I build real time-blocked schedules from your tasks\n• 🧠 **Deep knowledge** — productivity, focus, habits, health, science, career, finance, coding, and more\n• 💬 **True conversation** — I remember what you tell me\n• ⚡ **Task creation** — just say "remind me to..." and I'll add it\n• 🎯 **Smart prioritisation** — I tell you what to do first, and why\n• 💪 **Coaching** — motivation, stress relief, mental health support\n\n**🔒 Privacy first:** Your data stays on your device (or your Google account if you sync).\n\nI'm not ChatGPT or Gemini. I'm LIBI — purpose-built for your productivity. What do you need? ✦`;
  }

  // =========================================================
  // 3. WHAT SHOULD I DO FIRST
  // =========================================================
  if (/(what (should|do) i (do|start|work on|tackle|focus on|begin|attack|prioriti)|^(first|start|begin)|most important|urgent|which task|where do i start|top task|highest priority|what'?s next|what now|what's first|most urgent|critical task)/i.test(cleanMsg)) {
    if (active.length === 0) return `🎉 Clear slate${hi}! No active ${taskWords} right now. Take a breath — then add something meaningful with the + button, or open the Goals tab and plan your next big move.`;

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
      if (tk.subtasks?.some(s => s.done)) score += 8;
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
  // 4. PLAN MY DAY
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
  // 5. PROGRESS / STATUS
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
  // 6. MOTIVATION
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
    return `⚡ **Let's go${hi}!**\n\n${q}${taskPush}`;
  }

  // =========================================================
  // 7. STRESS / OVERWHELM
  // =========================================================
  if (/(stress|overwhelm|anxious|anxiety|too much|can'?t cope|burned? out|exhausted|drowning|falling behind|behind on|panic|losing it|can'?t handle|mental load|so much to do|buried in)/i.test(cleanMsg)) {
    const taskLoad = active.length > 10
      ? `\n\n📋 You have ${active.length} active ${taskWords} — that IS a lot. Let me help: **"Plan my day"** will break it into manageable blocks.`
      : "";
    return `💙 I hear you${hi}. What you're feeling is real — and it makes sense.\n\n**Right now, do this:**\n1. 🛑 **Stop** — seriously, just pause for 10 seconds\n2. 😮‍💨 **Breathe** — 4 counts in, hold 4, out for 6 (×3)\n3. 📝 **Brain dump** — write everything on your mind\n4. 🎯 **Pick ONE tiny thing**\n\n${taskLoad}`;
  }

  // =========================================================
  // 37. CELEBRATE
  // =========================================================
  if (/(i did it|i (just |finally )?(finished|completed|done with|got|passed|achieved|launched|shipped)|i won|we won|just (graduated|got hired|got promoted)|big win|celebrate|i'm proud)/i.test(cleanMsg)) {
    return `🎉 **YES${hi}!**\n\n**Stop and actually feel this moment.** Most people rush straight to the next thing — don't.\n\nRide this energy. What's next? I'm ready to help you plan it. 🚀`;
  }

  // =========================================================
  // 38. WHO MADE LIBI
  // =========================================================
  if (/\b(who (made|built|created|designed|developed) (you|libi)|libi labs|your (creator|developer|maker)|who (is behind|runs) libi|libi history|who.?s behind)\b/i.test(cleanMsg)) {
    return `✦ **About LIBI${hi}:**\n\nI'm LIBI — built by **LIBI Labs**, a team obsessed with making productivity personal, offline-first, and genuinely helpful.`;
  }

  // =========================================================
  // 40. SMART FALLBACK
  // =========================================================
  const contextual = active.length > 0 && topTask
    ? `\n\n💡 By the way — you have **${active.length} active ${taskWords}**. Your top priority right now: **"${topTask.title}"**.`
    : active.length === 0
      ? `\n\n✅ Your task list is clear! Want to add something new?`
      : "";

  const fallbacks = [
    `🤔 Hmm, I'm not sure I fully caught that${hi}. Could you rephrase?\n\nI can help with:\n• **Tasks** — "Plan my day", "What's overdue?"\n• **Wellbeing** — "I'm stressed", "Motivate me"${contextual}`,
    `✦ I want to make sure I give you the best answer${hi}! Try asking:\n• _"Plan my day"_\n• _"What's most urgent?"_\n• _"Motivate me"${contextual}`,
  ];

  return pick(fallbacks);
}
