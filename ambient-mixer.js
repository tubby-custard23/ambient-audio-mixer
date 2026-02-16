/**
 * Ambient Audio Mixer
 * A dynamic audio mixer for creating atmospheric soundscapes
 *
 * @author Daniel Lopez-Cope
 * @license MIT
 */

class AmbientMixer {
  constructor(config = {}) {
    this.tracks = {};
    this.targetVolumes = {};
    this.currentVolumes = {};
    this.masterVolume = config.masterVolume || 0.5;
    this.fadeSpeed = config.fadeSpeed || 0.02;
    this.moodDuration = config.moodDuration || { min: 20000, max: 40000 };
    this.isPlaying = false;
    this.autoMood = true;
    this.currentMood = null;
    this.mixerInterval = null;
    this.moodTimeout = null;
    this.moods = {};
    this.onMoodChange = config.onMoodChange || null;
    this.onPlayStateChange = config.onPlayStateChange || null;
  }

  /**
   * Initialize the mixer with track definitions
   * @param {Object} trackConfig - Object mapping track names to audio file paths
   * @example
   * mixer.init({
   *   night: '/audio/night-ambience.mp3',
   *   rain: '/audio/rain.mp3',
   *   thunder: '/audio/thunder.mp3',
   *   piano: '/audio/piano.mp3'
   * });
   */
  init(trackConfig) {
    // Create audio elements for each track
    Object.entries(trackConfig).forEach(([name, src]) => {
      const audio = new Audio(src);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 0;
      this.tracks[name] = audio;
      this.targetVolumes[name] = 0;
      this.currentVolumes[name] = 0;
    });

    return this;
  }

  /**
   * Define mood presets - combinations of track volumes
   * @param {Object} moodConfig - Object mapping mood names to track volume settings
   * @example
   * mixer.defineMoods({
   *   calm: { night: 0.4, piano: 0.2 },
   *   stormy: { night: 0.2, rain: 0.4, thunder: 0.3 },
   *   intense: { rain: 0.5, thunder: 0.4, piano: 0.15 }
   * });
   */
  defineMoods(moodConfig) {
    this.moods = moodConfig;
    return this;
  }

  /**
   * Set the current mood
   * @param {string} moodName - Name of the mood to set
   */
  setMood(moodName) {
    if (!this.moods[moodName]) {
      console.warn(`Mood "${moodName}" not found`);
      return this;
    }

    this.currentMood = moodName;
    this.autoMood = false;

    // Reset all target volumes to 0
    Object.keys(this.targetVolumes).forEach(track => {
      this.targetVolumes[track] = 0;
    });

    // Set target volumes for this mood
    const moodSettings = this.moods[moodName];
    Object.entries(moodSettings).forEach(([track, volume]) => {
      if (this.targetVolumes.hasOwnProperty(track)) {
        this.targetVolumes[track] = volume;
      }
    });

    if (this.onMoodChange) {
      this.onMoodChange(moodName);
    }

    return this;
  }

  /**
   * Pick a random mood from defined moods
   */
  randomMood() {
    const moodNames = Object.keys(this.moods);
    if (moodNames.length === 0) return this;

    const randomIndex = Math.floor(Math.random() * moodNames.length);
    const moodName = moodNames[randomIndex];

    this.currentMood = moodName;

    // Reset all target volumes to 0
    Object.keys(this.targetVolumes).forEach(track => {
      this.targetVolumes[track] = 0;
    });

    // Set target volumes for this mood
    const moodSettings = this.moods[moodName];
    Object.entries(moodSettings).forEach(([track, volume]) => {
      if (this.targetVolumes.hasOwnProperty(track)) {
        this.targetVolumes[track] = volume;
      }
    });

    if (this.onMoodChange) {
      this.onMoodChange(moodName);
    }

    return this;
  }

  /**
   * Enable auto mood cycling
   */
  enableAutoMood() {
    this.autoMood = true;
    if (this.isPlaying) {
      this.scheduleMoodChange();
    }
    return this;
  }

  /**
   * Disable auto mood cycling
   */
  disableAutoMood() {
    this.autoMood = false;
    if (this.moodTimeout) {
      clearTimeout(this.moodTimeout);
      this.moodTimeout = null;
    }
    return this;
  }

  /**
   * Schedule the next automatic mood change
   */
  scheduleMoodChange() {
    if (!this.isPlaying || !this.autoMood) return;

    const delay = this.moodDuration.min +
      Math.random() * (this.moodDuration.max - this.moodDuration.min);

    this.moodTimeout = setTimeout(() => {
      if (this.isPlaying && this.autoMood) {
        this.randomMood();
        this.scheduleMoodChange();
      }
    }, delay);
  }

  /**
   * Smoothly update volumes toward target values
   */
  updateVolumes() {
    Object.keys(this.tracks).forEach(name => {
      const track = this.tracks[name];
      const target = this.targetVolumes[name] * this.masterVolume;
      const current = this.currentVolumes[name];

      if (Math.abs(target - current) > 0.01) {
        const newVol = current + (target > current ? this.fadeSpeed : -this.fadeSpeed);
        this.currentVolumes[name] = Math.max(0, Math.min(1, newVol));
        track.volume = this.currentVolumes[name];
      } else {
        track.volume = target;
        this.currentVolumes[name] = target;
      }
    });
  }

  /**
   * Set master volume
   * @param {number} volume - Volume level from 0 to 1
   */
  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    return this;
  }

  /**
   * Start playing the mixer
   */
  play() {
    if (this.isPlaying) return this;

    this.isPlaying = true;

    // Reset volumes
    Object.keys(this.currentVolumes).forEach(name => {
      this.currentVolumes[name] = 0;
    });

    // Start all tracks
    Object.values(this.tracks).forEach(track => {
      track.volume = 0;
      track.currentTime = 0;
      track.play().catch(err => {
        console.warn('Audio play failed:', err.message);
      });
    });

    // Set initial mood if auto
    if (this.autoMood) {
      this.randomMood();
      this.scheduleMoodChange();
    }

    // Start volume update loop
    this.mixerInterval = setInterval(() => this.updateVolumes(), 50);

    if (this.onPlayStateChange) {
      this.onPlayStateChange(true);
    }

    return this;
  }

  /**
   * Stop the mixer
   */
  stop() {
    if (!this.isPlaying) return this;

    this.isPlaying = false;

    // Stop interval
    if (this.mixerInterval) {
      clearInterval(this.mixerInterval);
      this.mixerInterval = null;
    }

    // Stop mood timeout
    if (this.moodTimeout) {
      clearTimeout(this.moodTimeout);
      this.moodTimeout = null;
    }

    // Stop all tracks
    Object.values(this.tracks).forEach(track => {
      track.pause();
      track.currentTime = 0;
    });

    // Reset volumes
    Object.keys(this.targetVolumes).forEach(name => {
      this.targetVolumes[name] = 0;
      this.currentVolumes[name] = 0;
    });

    if (this.onPlayStateChange) {
      this.onPlayStateChange(false);
    }

    return this;
  }

  /**
   * Toggle play/stop
   */
  toggle() {
    return this.isPlaying ? this.stop() : this.play();
  }

  /**
   * Get list of available moods
   */
  getMoods() {
    return Object.keys(this.moods);
  }

  /**
   * Get current mood name
   */
  getCurrentMood() {
    return this.currentMood;
  }

  /**
   * Check if mixer is currently playing
   */
  getIsPlaying() {
    return this.isPlaying;
  }

  /**
   * Destroy the mixer and clean up resources
   */
  destroy() {
    this.stop();
    Object.values(this.tracks).forEach(track => {
      track.src = '';
    });
    this.tracks = {};
    this.moods = {};
  }
}

// Export for different module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AmbientMixer;
}
if (typeof window !== 'undefined') {
  window.AmbientMixer = AmbientMixer;
}
