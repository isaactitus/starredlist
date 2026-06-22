import re

with open('src/App.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('more_search.txt', 'w', encoding='utf-8') as out:
    for i, line in enumerate(lines, 1):
        low = line.lower()
        if any(k in low for k in ['all features', 'more', 'moreopen', 'showmore', 'bot-item.*more', 'moresheet', 'more-menu']):
            out.write(f'{i}: {line.rstrip()[:150]}\n')

print('Done')
