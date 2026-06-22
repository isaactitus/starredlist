import re

path = 'src/App.js'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace SVG gradient stop colors (pink -> blue)
content = content.replace('stopColor="#FF2D78"/>', 'stopColor="#22d3ee"/>')
content = content.replace('stopColor="#FF6EB4"/>', 'stopColor="#38bdf8"/>')
content = content.replace('stopColor="#C2185B"/>', 'stopColor="#0ea5e9"/>')

# Replace text gradient (pink -> blue)
content = content.replace(
    'linear-gradient(135deg,#FF2D78,#C2185B)',
    'linear-gradient(135deg,#22d3ee,#0ea5e9)'
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Done! All logo colors updated to blue.')
