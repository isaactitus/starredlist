#!/usr/bin/env python3
import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove from line 2009 (0-based index 2008 - the Sleep Tracker comment) to line 2610 (0-based index 2609)
before_sleep = lines[:2009]
after_app = lines[2610:]

# Write the new content
with open('src/App.js', 'w', encoding='utf-8') as f:
    f.writelines(before_sleep)
    f.write('\nexport default function App() {\n')
    f.writelines(after_app)

print(f"Successfully removed SleepPage and CaloriePage functions")
print(f"File now has {len(before_sleep) + len(after_app) + 2} lines")
