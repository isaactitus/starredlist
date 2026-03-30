import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('const MUSIC_TRACKS = [')
end_idx = content.find('];', start_idx) + 2

new_array = '''const MUSIC_TRACKS = [
  { id: "lofi", label: "Lo-Fi Chill", icon: "☕", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { id: "jazzy", label: "Jazzy Lo-Fi", icon: "🎷", url: "https://cdn.pixabay.com/audio/2022/11/22/audio_d1718ab41b.mp3" },
  { id: "focus", label: "Deep Focus", icon: "🧠", url: "https://cdn.pixabay.com/audio/2024/08/27/audio_496ec20eb8.mp3" },
  { id: "nature", label: "Forest Sounds", icon: "🌿", url: "https://cdn.pixabay.com/audio/2022/01/18/audio_82c2196da7.mp3" },
  { id: "rain", label: "Rainy Day", icon: "🌧", url: "https://cdn.pixabay.com/audio/2021/08/09/audio_8bb1611d04.mp3" }
];'''

content = content[:start_idx] + new_array + content[end_idx:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)
print('Success')
