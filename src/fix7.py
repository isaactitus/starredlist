import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_str = '"https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"'
new_str = '"https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"'

content = content.replace(old_str, new_str)

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
