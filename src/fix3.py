import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'}</div> :\n      tab === "board"', '}</div> :\n      tab === "board"')

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
