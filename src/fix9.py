import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('const MUSIC_TRACKS = [')
end_idx = content.find('];', start_idx) + 2

new_array = '''const MUSIC_TRACKS = [
  { id: "lofi", label: "Lo-Fi Chill", icon: "☕", url: "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3" },
  { id: "jazzy", label: "Jazzy Lounge", icon: "🎷", url: "https://raw.githubusercontent.com/muhammederdem/mini-player/master/mp3/1.mp3" },
  { id: "focus", label: "Deep Focus", icon: "🧠", url: "https://raw.githubusercontent.com/muhammederdem/mini-player/master/mp3/2.mp3" },
  { id: "acoustic", label: "Acoustic Vibes", icon: "🎸", url: "https://raw.githubusercontent.com/muhammederdem/mini-player/master/mp3/3.mp3" },
  { id: "evening", label: "Evening Chill", icon: "🌙", url: "https://raw.githubusercontent.com/muhammederdem/mini-player/master/mp3/4.mp3" }
];'''

content = content[:start_idx] + new_array + content[end_idx:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
