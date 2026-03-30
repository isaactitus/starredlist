import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(r'\n  function BoardPage', '\n  function BoardPage')
content = content.replace(r'Timeline</div>\n', 'Timeline</div>\n')

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Success")
