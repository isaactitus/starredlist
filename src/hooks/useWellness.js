import { useState, useEffect } from 'react';
import { uid, todayStr } from '../utils/helpers';
import { WATER_GOAL } from '../utils/constants';

export const useWellness = (activeProfile, showNotif, haptic, play) => {
  // == State ==

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

  const [calorieGoal, setCalorieGoal] = useState(() => {
    try {
      const s = localStorage.getItem("tf_calorie_goal");
      return s ? JSON.parse(s) : 2000;
    } catch (e) {
      return 2000;
    }
  });

  // == Persistence ==
  useEffect(() => { localStorage.setItem("tf_calories", JSON.stringify(calorieLogs)); }, [calorieLogs]);
  useEffect(() => { localStorage.setItem("tf_water", JSON.stringify(waterLogs)); }, [waterLogs]);
  useEffect(() => { localStorage.setItem("tf_calorie_goal", JSON.stringify(calorieGoal)); }, [calorieGoal]);

  // == Actions ==

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
    if (haptic) haptic("light");
  };

  const getTodayWater = () => {
    const today = todayStr();
    const log = waterLogs.find(l => l.date === today && l.profileId === activeProfile);
    return log ? log.amount : 0;
  };

  const saveCalorie = (calorieData) => {
    const entry = { id: uid(), ...calorieData };
    setCalorieLogs(ls => [entry, ...ls]);
    if (showNotif) showNotif("🍎 Food logged!", `${calorieData.name}: ${calorieData.cal} cal`);
    if (haptic) haptic("success");
    if (play) play("add");
  };

  return {
    calorieLogs,
    setCalorieLogs,
    waterLogs,
    setWaterLogs,
    calorieGoal,
    setCalorieGoal,
    addWater,
    getTodayWater,
    saveCalorie,
    WATER_GOAL
  };
};