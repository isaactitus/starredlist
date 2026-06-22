#!/usr/bin/env python3
import re

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove imports
content = content.replace(
    'import { WellnessHub } from "./components/WellnessHub";\n',
    ''
)
content = content.replace(
    'import { useWellness } from "./hooks/useWellness";\n',
    ''
)

# 2. Remove wellness hook block
wellness_pattern = r'  // == Wellness & Health Hook ==\n  const wellness = useWellness\(activeProfile\);[\s\S]*?const \[showSleepForm, setShowSleepForm\] = useState\(false\);\n\n'
content = re.sub(wellness_pattern, '', content)

# 3. Remove calForm state
content = content.replace(
    '  const [calForm, setCalForm] = useState(null);\n',
    ''
)

# 4. Remove PROJECT BOARD section with state definitions
board_section = r'  //  PROJECT BOARD --[\s\S]*?const \[boardCards, setBoardCards\] = useState\(\(\) => \{[\s\S]*?\}\);\n'
content = re.sub(board_section, '\n  // == Finance Tracker ==\n', content, count=1)

# 5. Remove sleep/calorie state and persistence hooks
sleep_state_pattern = r'  // == Sleep Tracker State[\s\S]*?const \[showCalForm, setShowCalForm\] = useState\(false\);[\s\S]*?const calorieForm = calForm; const setCalorieForm = setCalForm;\n\n\n'
content = re.sub(sleep_state_pattern, '', content)

# 6. Remove persistence useEffect hooks for sleep/calorie
content = re.sub(
    r'  useEffect\(\) \{ try \{ localStorage\.setItem\("tf_sleep",[\s\S]*?\}\}[\s\S]*?\}\n',
    '',
    content
)
content = re.sub(
    r'  useEffect\(\) \{ try \{ localStorage\.setItem\("tf_calories",[\s\S]*?\}\n',
    '',
    content
)
content = re.sub(
    r'  useEffect\(\) \{ try \{ localStorage\.setItem\("tf_calorie_goal",[\s\S]*?\}\n',
    '',
    content
)
content = re.sub(
    r'  useEffect\(\) \{ try \{ localStorage\.setItem\("tf_sleep_goal",[\s\S]*?\}\n',
    '',
    content
)

# 7. Remove board related state variables
board_state_pattern = r'  const \[boardSyncing, setBoardSyncing\] = useState\(false\);[\s\S]*?const \[boardTab, setBoardTab\] = useState\("board"\);'
content = re.sub(board_state_pattern, '', content)

# 8. Remove SleepPage function
sleep_page_pattern = r'\n// =====================================================================\n//  💤 SLEEP TRACKER PAGE\n// =====================================================================\nfunction SleepPage\(\{[\s\S]*?\n\}\n\n// =====================================================================\n//  🔥 CALORIE TRACKER PAGE\n// =====================================================================\n'
content = re.sub(sleep_page_pattern, '\n', content)

# 9. Remove FOOD_DB and CaloriePage function
calorie_page_pattern = r'// ── Food Database[\s\S]*?function CaloriePage\(\{[\s\S]*?\n\}\n\n\n\nexport default function App\(\) \{'
replacement = '\nexport default function App() {'
content = re.sub(calorie_page_pattern, replacement, content)

# Ensure we don't have double export default
if content.count('export default function App() {') > 1:
    # Keep only the first one
    first = content.find('export default function App() {')
    last = content.rfind('export default function App() {')
    if first != last:
        before = content[:first]
        after = content[last:]
        content = before + after

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully cleaned up sleep, calories, wellness, and board features")
