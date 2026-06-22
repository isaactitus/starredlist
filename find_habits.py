import re, sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
with open('habit_search.txt', 'w', encoding='utf-8') as out:
    for i, line in enumerate(lines, 1):
        if any(kw in line.lower() for kw in ['habits page', 'habitpage', 'heatmap', 'streak-row', 'streak_row', 'streakRow', '14-day', 'gridtemplate', '7 col', '7col']):
            out.write(f'{i}: {line[:150]}\n')

print('Done - check habit_search.txt')
