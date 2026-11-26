# Ambient Audio Mixer

A lightweight JavaScript library for creating dynamic, atmospheric soundscapes on your website. Perfect for immersive experiences, meditation apps, games, or any project that needs ambient audio.

## Features

- **Dynamic Mixing**: Smoothly crossfade between multiple audio tracks
- **Per-Track Controls**: Volume, pan, mute and solo for every track, plus live level meters
- **Effects**: Filter (with slow drift), reverb, delay, tremolo and compressor on any track or the master bus
- **Generated Sounds**: White, pink and brown noise beds that need no audio files
- **Save & Load**: The whole mix, including effects and moods, as JSON
- **Mood Presets**: Define combinations of track volumes as "moods"
- **Auto-Cycling**: Automatically transition between moods over time
- **Smooth Fading**: Gradual volume transitions for seamless audio changes
- **Easy Integration**: Simple API, no dependencies
- **Customizable UI**: Included CSS with theme variants

## Ambient Studio

`studio/index.html` is a mixing desk built on the library. Open it in a browser (no build step or server needed) to:

- add tracks from audio files (drag them onto the page), URLs, or generated noise
- mix with faders, pan, mute and solo while watching live meters
- save mixes as moods and crossfade between them, by hand or on a cycle

Press Space to play or stop.

## Quick Start

### 1. Include the Files

```html
<link rel="stylesheet" href="ambient-mixer.css">
<script src="ambient-mixer.js"></script>
```

### 2. Create the Mixer

```javascript
const mixer = new AmbientMixer({
  masterVolume: 0.5
});
```

### 3. Add Your Audio Tracks

```javascript
mixer.init({
  // Track name: path to audio file
  night: '/audio/night-ambience.mp3',
  rain: '/audio/rain.mp3',
  thunder: '/audio/thunder.mp3',
  piano: '/audio/soft-piano.mp3'
});
```

### 4. Define Mood Presets

```javascript
mixer.defineMoods({
  // Mood name: { track: volume (0-1), ... }
  calm: {
    night: 0.4,
    piano: 0.2
  },
  stormy: {
    night: 0.2,
    rain: 0.4,
    thunder: 0.3,
    piano: 0.1
  },
  intense: {
    rain: 0.5,
    thunder: 0.4
  }
});
```

### 5. Start Playing

```javascript
mixer.play();
```

Browsers only allow audio to start after the visitor interacts with the page, so call `play()` from a click handler.

## Finding Royalty-Free Audio

Here are some great sources for free ambient audio:

- **[Freesound](https://freesound.org)** - Community-contributed sounds (check individual licenses)
- **[Pixabay](https://pixabay.com/music/)** - Free music and sound effects
- **[Mixkit](https://mixkit.co/free-sound-effects/)** - Free sound effects
- **[Zapsplat](https://www.zapsplat.com)** - Free sound effects library
- **[BBC Sound Effects](https://sound-effects.bbcrewind.co.uk)** - Thousands of free sounds

### Recommended Track Types

For a good ambient mix, consider including:

| Category | Examples |
|----------|----------|
| **Base Layer** | Night ambience, wind, room tone |
| **Weather** | Rain, thunder, storm |
| **Music** | Soft piano, ambient pads, strings |
| **Accents** | Occasional sounds (used sparingly) |

## API Reference

### Constructor Options

```javascript
new AmbientMixer({
  masterVolume: 0.5,        // Initial volume (0-1)
  fadeTime: 2.5,            // Seconds a mood crossfade takes
  autoMood: true,           // Cycle moods automatically when playing
  moodDuration: {
    min: 20000,             // Min ms before auto mood change
    max: 40000              // Max ms before auto mood change
  },
  onMoodChange: (mood) => {},       // Mood change callback
  onPlayStateChange: (playing) => {} // Play state callback
})
```

### Methods

| Method | Description |
|--------|-------------|
| `init(tracks)` | Initialize with audio track paths |
| `defineMoods(moods)` | Define mood presets |
| `play()` | Start the mixer |
| `stop()` | Stop the mixer |
| `toggle()` | Toggle play/stop |
| `setMood(name)` | Set a specific mood |
| `randomMood()` | Pick a random mood |
| `enableAutoMood()` | Enable automatic mood cycling |
| `disableAutoMood()` | Disable automatic mood cycling |
| `setMasterVolume(vol)` | Set master volume (0-1) |
| `getMoods()` | Get array of mood names |
| `getCurrentMood()` | Get current mood name |
| `getIsPlaying()` | Check if playing |
| `destroy()` | Clean up resources |

#### Tracks

| Method | Description |
|--------|-------------|
| `addTrack(name, source, opts)` | Add a track. `source` is a URL, a `File`/`Blob`, or options such as `{ type: 'noise', color: 'brown' }`. `opts`: `{ volume, pan, mute, solo, meta }` |
| `removeTrack(name)` | Remove a track (and its entries in every mood) |
| `renameTrack(name, newName)` | Rename a track; moods follow |
| `moveTrack(name, index)` | Change track order |
| `setTrackVolume(name, vol, { fade })` | Set volume (0-1), optionally crossfading over `fadeTime` |
| `setTrackPan(name, pan)` | Pan from -1 (left) to 1 (right) |
| `setTrackMute(name, bool)` / `setTrackSolo(name, bool)` | Mute or solo |
| `updateTrackSource(name, opts)` | Change the source, e.g. `{ src: newFile }` or `{ color: 'pink' }` |
| `getTracks()` / `getTrack(name)` | Track settings, source info and effects |
| `getLevel(name)` | Live `{ peak, rms }` of a track, or of the master bus when called with no name |

#### Effects

Pass a track name, or `AmbientMixer.MASTER` for the master bus.

| Method | Description |
|--------|-------------|
| `addEffect(target, type, params)` | Add `filter`, `reverb`, `delay`, `tremolo` or `compressor`; returns an id |
| `updateEffect(target, id, params)` | Change parameters |
| `setEffectEnabled(target, id, bool)` | Bypass or re-enable |
| `moveEffect(target, id, index)` / `removeEffect(target, id)` | Reorder or remove |
| `getEffects(target)` | List effects with their parameters |

`AmbientMixer.EFFECTS` describes every effect's parameters (range, default, unit), which is handy for building controls.

```javascript
mixer.addEffect('rain', 'filter', { frequency: 900, lfoDepth: 0.4, lfoRate: 0.03 });
mixer.addEffect(AmbientMixer.MASTER, 'reverb', { size: 6, mix: 0.3 });
```

#### Moods, saving and events

| Method | Description |
|--------|-------------|
| `saveMood(name, volumes)` / `removeMood(name)` / `renameMood(a, b)` | Edit single moods |
| `captureMood(name)` | Save the current track volumes as a mood |
| `setMoodDuration(min, max)` | Auto-cycle timing in ms |
| `toJSON()` | The whole mix as plain data |
| `load(data, { resolveSource })` | Replace the mix with saved data |
| `on(event, fn)` / `off(event, fn)` | Events: `play`, `mood`, `moods`, `tracks`, `track`, `effects` |

## Adding UI Controls

### Basic HTML Structure

```html
<div class="ambient-mixer-controls">
  <button class="ambient-mixer-toggle" id="mixer-toggle">
    <span class="icon-off">🔇</span>
    <span class="icon-on">🔊</span>
  </button>
  <button class="ambient-mixer-settings-btn" id="settings-btn">⚙️</button>
  <div class="ambient-mixer-panel" id="settings-panel">
    <div class="ambient-mixer-volume">
      <label>Volume</label>
      <input type="range" id="volume" min="0" max="100" value="50">
    </div>
    <div class="ambient-mixer-mood">
      <label>Mood</label>
      <select id="mood-select">
        <option value="auto">Auto</option>
        <!-- Add your moods here -->
      </select>
    </div>
  </div>
</div>
```

### Wire Up the Controls

```javascript
const toggleBtn = document.getElementById('mixer-toggle');
const settingsBtn = document.getElementById('settings-btn');
const panel = document.getElementById('settings-panel');
const volumeSlider = document.getElementById('volume');
const moodSelect = document.getElementById('mood-select');

// Populate mood options
mixer.getMoods().forEach(mood => {
  const option = document.createElement('option');
  option.value = mood;
  option.textContent = mood;
  moodSelect.appendChild(option);
});

// Toggle play/stop
toggleBtn.addEventListener('click', () => {
  mixer.toggle();
  toggleBtn.classList.toggle('playing', mixer.getIsPlaying());
  settingsBtn.classList.toggle('visible', mixer.getIsPlaying());
});

// Show/hide settings
let panelOpen = false;
settingsBtn.addEventListener('click', () => {
  panelOpen = !panelOpen;
  panel.classList.toggle('visible', panelOpen);
});

// Volume control
volumeSlider.addEventListener('input', () => {
  mixer.setMasterVolume(volumeSlider.value / 100);
});

// Mood selection
moodSelect.addEventListener('change', () => {
  if (moodSelect.value === 'auto') {
    mixer.enableAutoMood();
  } else {
    mixer.setMood(moodSelect.value);
  }
});
```

## CSS Themes

The included CSS supports three themes:

```html
<!-- Dark theme (default) -->
<div class="ambient-mixer-controls">

<!-- Light theme -->
<div class="ambient-mixer-controls theme-light">

<!-- Minimal theme -->
<div class="ambient-mixer-controls theme-minimal">
```

## Tips for Great Mixes

1. **Layer thoughtfully**: Start with a quiet base layer, add weather/atmosphere, then subtle music
2. **Keep music subtle**: Music tracks should usually be 0.15-0.25 volume max
3. **Use crossfades**: The default fade speed creates smooth 2-3 second transitions
4. **Vary your moods**: Create moods that are noticeably different but not jarring
5. **Consider pacing**: Longer mood durations (30-60s) feel more natural

## Example: Spooky Night Theme

```javascript
const mixer = new AmbientMixer();

mixer.init({
  night: '/audio/night-crickets.mp3',
  wind: '/audio/wind-howling.mp3',
  rain: '/audio/light-rain.mp3',
  thunder: '/audio/distant-thunder.mp3',
  piano: '/audio/creepy-piano.mp3',
  strings: '/audio/tense-strings.mp3'
});

mixer.defineMoods({
  'Quiet Night': { night: 0.4, wind: 0.1 },
  'Building Tension': { night: 0.3, wind: 0.2, piano: 0.15 },
  'Storm Approaches': { night: 0.2, wind: 0.3, rain: 0.3, thunder: 0.2 },
  'Full Storm': { wind: 0.2, rain: 0.5, thunder: 0.4, strings: 0.15 },
  'Eerie Calm': { night: 0.35, piano: 0.2, strings: 0.1 }
});

mixer.play();
```

## Tests

```bash
npm test
```

Runs the browser test pages in `test/` with headless Chrome or Chromium (set `CHROME=/path/to/chrome` if it isn't found).

## Browser Support

Works in all modern browsers that support the Web Audio API:
- Chrome 34+
- Firefox 25+
- Safari 14.1+
- Edge 79+

## License

MIT License - feel free to use in personal and commercial projects.

## Credits

Created by Daniel Lopez-Cope

Inspired by the ambient audio systems in video games and meditation apps.
