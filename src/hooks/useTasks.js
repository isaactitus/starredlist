import { useState, useEffect, useMemo } from 'react';
import { uid } from '../utils/helpers';
import { INIT_TASKS, DEFAULT_CATEGORIES, DEFAULT_PROFILES } from '../utils/constants';

export const useTasks = () => {
  // == State ==
  const [tasks, setTasks] = useState(() => {
    try {
      const s = localStorage.getItem("tf_tasks");
      return s ? JSON.parse(s) : INIT_TASKS;
    } catch (e) {
      return INIT_TASKS;
    }
  });

  const [categories, setCategories] = useState(() => {
    try {
      const s = localStorage.getItem("tf_cats");
      return s ? JSON.parse(s) : DEFAULT_CATEGORIES;
    } catch (e) {
      return DEFAULT_CATEGORIES;
    }
  });

  const [profiles, setProfiles] = useState(() => {
    try {
      const s = localStorage.getItem("tf_profiles");
      return s ? JSON.parse(s) : DEFAULT_PROFILES;
    } catch (e) {
      return DEFAULT_PROFILES;
    }
  });

  const [activeProfile, setActiveProfile] = useState(() => {
    try {
      const s = localStorage.getItem("tf_profiles");
      const ps = s ? JSON.parse(s) : DEFAULT_PROFILES;
      return ps[0]?.id || "default";
    } catch (e) {
      return "default";
    }
  });

  const [deletedTask, setDeletedTask] = useState(null);
  const [showUndo, setShowUndo] = useState(false);
  const [undoTimer, setUndoTimer] = useState(null);

  // == Persistence ==
  useEffect(() => {
    localStorage.setItem("tf_tasks", JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem("tf_cats", JSON.stringify(categories));
  }, [categories]);

  useEffect(() => {
    localStorage.setItem("tf_profiles", JSON.stringify(profiles));
  }, [profiles]);

  // == Computed ==
  const profileTasks = useMemo(() => 
    tasks.filter(t => t.profileId === activeProfile && !t.isCalendarSticker), 
    [tasks, activeProfile]
  );

  const profileStickers = useMemo(() => 
    tasks.filter(t => t.profileId === activeProfile && t.isCalendarSticker), 
    [tasks, activeProfile]
  );

  // == Actions ==
  const addTask = (taskData) => {
    const newTask = {
      id: uid(),
      ...taskData,
      done: false,
      createdAt: Date.now()
    };
    setTasks(ts => [newTask, ...ts]);
    return newTask;
  };

  const updateTask = (id, updates) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const deleteTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    setTasks(ts => ts.filter(t => t.id !== id));
    setDeletedTask(task);
    setShowUndo(true);
    if (undoTimer) clearTimeout(undoTimer);
    const timer = setTimeout(() => {
      setShowUndo(false);
      setDeletedTask(null);
    }, 4000);
    setUndoTimer(timer);
    return task;
  };

  const undoDeleteTask = () => {
    if (!deletedTask) return;
    setTasks(ts => [deletedTask, ...ts]);
    setShowUndo(false);
    setDeletedTask(null);
    if (undoTimer) clearTimeout(undoTimer);
  };

  const toggleTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    const isDone = !task.done;
    
    // Logic for recurring tasks
    if (isDone && task.recurring && task.recurring !== "never") {
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
            ...task,
            id: uid(),
            done: false,
            createdAt: Date.now(),
            due: nextDue,
            reminder: false,
            subtasks: task.subtasks.map(s => ({ ...s, done: false }))
        };
        setTasks(ts => [nextTask, ...ts]);
    }

    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: isDone, completedAt: isDone ? Date.now() : null } : t));
    return { ...task, done: isDone };
  };

  const starTask = (id) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, starred: !t.starred } : t));
  };

  const addCategory = (catData) => {
    const newCat = { id: uid(), ...catData };
    setCategories(cs => [...cs, newCat]);
    return newCat;
  };

  const addProfile = (profData) => {
    const newProf = { id: uid(), ...profData };
    setProfiles(ps => [...ps, newProf]);
    setActiveProfile(newProf.id);
    return newProf;
  };

  return {
    tasks,
    setTasks,
    categories,
    setCategories,
    profiles,
    setProfiles,
    activeProfile,
    setActiveProfile,
    profileTasks,
    profileStickers,
    addTask,
    updateTask,
    deleteTask,
    undoDeleteTask,
    toggleTask,
    starTask,
    addCategory,
    addProfile,
    showUndo,
    setShowUndo,
    deletedTask
  };
};
