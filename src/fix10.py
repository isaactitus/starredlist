import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('const MUSIC_TRACKS = [')
end_idx = content.find('];', start_idx) + 2

new_array = '''const MUSIC_TRACKS = [
  { id: "lofi", label: "Lo-Fi Chill", icon: "☕", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" }
];'''

content = content[:start_idx] + new_array + content[end_idx:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
