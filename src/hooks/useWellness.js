import { useState, useEffect } from 'react';
import { uid, todayStr } from '../utils/helpers';
import { WATER_GOAL, MOOD_OPTIONS } from '../utils/constants';

export const useWellness = (activeProfile, awardXP, showNotif, haptic, play) => {
  // == State ==
  const [moods, setMoods] = useState(() => {
    try {
      const s = localStorage.getItem("tf_moods");
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });

  const [sleepLogs, setSleepLogs] = useState(() => {
    try {
      const s = localStorage.getItem("tf_sleep");
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });

  const [calorieLogs, setCalorieLogs] = useState(() => {
    try {
      const s = localStorage.getItem("tf_calories");
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });

  const [waterLogs, setWaterLogs] = useState(() => {
    try {
      const s = localStorage.getItem("tf_water");
      return s ? JSON.parse(s) : [];
    } catch (e) {
      return [];
    }
  });

  const [sleepGoalHrs, setSleepGoalHrs] = useState(() => {
    try {
      const s = localStorage.getItem("tf_sleep_goal");
      return s ? JSON.parse(s) : 8;
    } catch (e) {
      return 8;
    }
  });

  const [calorieGoal, setCalorieGoal] = useState(() => {
    try {
      const s = localStorage.getItem("tf_calorie_goal");
      return s ? JSON.parse(s) : 2000;
    } catch (e) {
      return 2000;
    }
  });

  // == Persistence ==
  useEffect(() => { localStorage.setItem("tf_moods", JSON.stringify(moods)); }, [moods]);
  useEffect(() => { localStorage.setItem("tf_sleep", JSON.stringify(sleepLogs)); }, [sleepLogs]);
  useEffect(() => { localStorage.setItem("tf_calories", JSON.stringify(calorieLogs)); }, [calorieLogs]);
  useEffect(() => { localStorage.setItem("tf_water", JSON.stringify(waterLogs)); }, [waterLogs]);
  useEffect(() => { localStorage.setItem("tf_sleep_goal", JSON.stringify(sleepGoalHrs)); }, [sleepGoalHrs]);
  useEffect(() => { localStorage.setItem("tf_calorie_goal", JSON.stringify(calorieGoal)); }, [calorieGoal]);

  // == Actions ==
  const saveMood = (moodIdx) => {
    const today = todayStr();
    const entry = {
      id: uid(),
      date: today,
      mood: moodIdx,
      energy: MOOD_OPTIONS[moodIdx].energy,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      profileId: activeProfile
    };
    setMoods(ms => [...ms.filter(m => !(m.date === today && m.profileId === activeProfile)), entry]);
    if (showNotif) showNotif("😊 Mood logged!", MOOD_OPTIONS[moodIdx].label);
    if (play) play("add");
    if (awardXP) awardXP(5, "Mood logged");
    return entry;
  };

  const addWater = (amount = 1) => {
    const today = todayStr();
    const existing = waterLogs.find(l => l.date === today && l.profileId === activeProfile);
    if (existing) {
      setWaterLogs(ls => ls.map(l => l.id === existing.id ? { ...l, amount: l.amount + amount } : l));
    } else {
      setWaterLogs(ls => [...ls, { id: uid(), date: today, amount, profileId: activeProfile }]);
    }
    if (showNotif) showNotif("💧 Hydration!", `Added ${amount} glass${amount > 1 ? 'es' : ''} of water`);
    if (play) play("add");
    if (awardXP) awardXP(2, "Water logged");
    if (haptic) haptic("light");
  };

  const getTodayWater = () => {
    const today = todayStr();
    const log = waterLogs.find(l => l.date === today && l.profileId === activeProfile);
    return log ? log.amount : 0;
  };

  const saveSleep = (sleepData) => {
    const entry = { id: uid(), ...sleepData };
    setSleepLogs(ls => [entry, ...ls.filter(l => l.date !== sleepData.date)]);
    if (awardXP) awardXP(10, "Sleep logged");
    if (showNotif) showNotif("💤 Sleep logged!", `${sleepData.duration.toFixed(1)} hrs`);
    if (haptic) haptic("success");
    if (play) play("add");
  };

  const saveCalorie = (calorieData) => {
    const entry = { id: uid(), ...calorieData };
    setCalorieLogs(ls => [entry, ...ls]);
    if (awardXP) awardXP(5, "Food logged");
    if (showNotif) showNotif("🍎 Food logged!", `${calorieData.name}: ${calorieData.cal} cal`);
    if (haptic) haptic("success");
    if (play) play("add");
  };

  return {
    moods,
    setMoods,
    sleepLogs,
    setSleepLogs,
    calorieLogs,
    setCalorieLogs,
    waterLogs,
    setWaterLogs,
    sleepGoalHrs,
    setSleepGoalHrs,
    calorieGoal,
    setCalorieGoal,
    saveMood,
    addWater,
    getTodayWater,
    saveSleep,
    saveCalorie,
    WATER_GOAL
  };
};
