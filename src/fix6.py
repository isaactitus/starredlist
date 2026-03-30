import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix Music Array
start_idx = content.find('const MUSIC_TRACKS = [')
end_idx = content.find('];', start_idx) + 2

new_array = '''const MUSIC_TRACKS = [
  { id: "lofi", label: "Lo-Fi Beats", icon: "☕", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { id: "jazzy", label: "Jazzy Lounge", icon: "🎷", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
  { id: "focus", label: "Deep Focus", icon: "🧠", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3" },
  { id: "nature", label: "Forest Sounds", icon: "🌿", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3" },
  { id: "rain", label: "Rainy Day", icon: "🌧", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3" }
];'''

content = content[:start_idx] + new_array + content[end_idx:]

# Fix Voice AI Protocol (Microphones are blocked on HTTP non-localhost IPs)
voice_search = 'const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;'
voice_replace = '''
    if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost') {
      showNotif("Security Alert", "Voice AI requires HTTPS when accessing from network IP.");
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
'''

if 'window.location.protocol' not in content:
    content = content.replace(voice_search, voice_replace.strip())

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
