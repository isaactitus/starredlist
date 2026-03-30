import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('const MUSIC_TRACKS = [')
end_idx = content.find('];', start_idx) + 2

new_array = '''const MUSIC_TRACKS = [
  { id: "lofi", label: "Lo-Fi Chill", icon: "☕", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { id: "jazzy", label: "Jazzy Beat", icon: "🎷", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3" },
  { id: "focus", label: "Deep Focus", icon: "🧠", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3" },
  { id: "nature", label: "Forest Sounds", icon: "🌿", url: "https://upload.wikimedia.org/wikipedia/commons/5/52/Nature_sounds_in_a_forest_with_birds.ogg" },
  { id: "rain", label: "Rainy Day", icon: "🌧", url: "https://upload.wikimedia.org/wikipedia/commons/3/36/Rain_sounds_on_window.ogg" }
];'''

content = content[:start_idx] + new_array + content[end_idx:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
