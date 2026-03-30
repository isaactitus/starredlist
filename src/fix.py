import sys

with open('src/App.js', 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find('let _currentAudioNode = null;')
end_idx = content.find('const DEFAULT_CATEGORIES = [')

if start_idx == -1 or end_idx == -1:
    print('Failed to find markers')
    sys.exit(1)

new_music = '''let _currentAudioNode = null;
function startMusic(trackId) {
  stopMusic();
  const track = MUSIC_TRACKS.find(t => t.id === trackId);
  if (!track) return;
  _currentAudioNode = new Audio(track.url);
  _currentAudioNode.loop = true;
  _currentAudioNode.volume = 0.4;
  _currentAudioNode.play().catch(e => console.log("Audio play blocked", e));
}

function stopMusic() {
  if (_currentAudioNode) {
    _currentAudioNode.pause();
    _currentAudioNode = null;
  }
}

'''

new_content = content[:start_idx] + new_music + content[end_idx:]

with open('src/App.js', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Success')
