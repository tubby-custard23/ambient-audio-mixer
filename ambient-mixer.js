/**
 * Ambient Audio Mixer
 * A dynamic audio mixer for creating atmospheric soundscapes
 *
 * Built on the Web Audio API: every track runs through its own effects
 * chain, panner and fader into a master bus with its own effects.
 *
 * @author Daniel Lopez-Cope
 * @license MIT
 */

(function (root) {
  'use strict';

  const MASTER = '@master';
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  let idCounter = 0;
  const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

  /** Smoothly move an AudioParam to a value. */
  function glide(param, value, ctx, timeConstant = 0.03) {
    param.cancelScheduledValues(ctx.currentTime);
    param.setTargetAtTime(value, ctx.currentTime, timeConstant);
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  function makeImpulse(ctx, seconds, decay) {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return buffer;
  }

  /** Equal-power wet/dry pair. */
  function setMix(dry, wet, mix, ctx) {
    glide(dry.gain, Math.cos(mix * Math.PI / 2), ctx);
    glide(wet.gain, Math.sin(mix * Math.PI / 2), ctx);
  }

  /**
   * Effect definitions. Each one describes its parameters (used by UIs to
   * render controls) and builds a node pair { input, output, set, dispose }.
   */
  const EFFECTS = {
    filter: {
      label: 'Filter',
      params: {
        mode: { label: 'Type', type: 'select', options: ['lowpass', 'highpass', 'bandpass'], default: 'lowpass' },
        frequency: { label: 'Cutoff', min: 40, max: 18000, default: 2400, scale: 'log', unit: 'Hz' },
        q: { label: 'Resonance', min: 0.1, max: 12, default: 0.7, step: 0.1 },
        lfoRate: { label: 'Drift speed', min: 0.01, max: 2, default: 0.05, scale: 'log', unit: 'Hz' },
        lfoDepth: { label: 'Drift amount', min: 0, max: 1, default: 0, step: 0.01 }
      },
      build(ctx) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        input.connect(filter).connect(output);
        lfo.connect(depth).connect(filter.detune);
        lfo.start();
        return {
          input, output,
          set(p) {
            filter.type = p.mode;
            glide(filter.frequency, p.frequency, ctx);
            glide(filter.Q, p.q, ctx);
            glide(lfo.frequency, p.lfoRate, ctx);
            // Drift sweeps up to two octaves either side of the cutoff.
            glide(depth.gain, p.lfoDepth * 2400, ctx);
          },
          dispose() {
            lfo.stop();
            [input, filter, lfo, depth, output].forEach(n => n.disconnect());
          }
        };
      }
    },

    reverb: {
      label: 'Reverb',
      params: {
        size: { label: 'Length', min: 0.3, max: 10, default: 3.5, step: 0.1, unit: 's' },
        decay: { label: 'Decay', min: 0.5, max: 8, default: 2.5, step: 0.1 },
        tone: { label: 'Tone', min: 500, max: 18000, default: 6000, scale: 'log', unit: 'Hz' },
        mix: { label: 'Mix', min: 0, max: 1, default: 0.35, step: 0.01 }
      },
      build(ctx) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const convolver = ctx.createConvolver();
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        input.connect(dry).connect(output);
        input.connect(convolver).connect(tone).connect(wet).connect(output);
        let shape = null;
        return {
          input, output,
          set(p) {
            const nextShape = `${p.size}|${p.decay}`;
            if (nextShape !== shape) {
              shape = nextShape;
              convolver.buffer = makeImpulse(ctx, p.size, p.decay);
            }
            glide(tone.frequency, p.tone, ctx);
            setMix(dry, wet, p.mix, ctx);
          },
          dispose() {
            [input, dry, wet, convolver, tone, output].forEach(n => n.disconnect());
          }
        };
      }
    },

    delay: {
      label: 'Delay',
      params: {
        time: { label: 'Time', min: 0.02, max: 2, default: 0.6, step: 0.01, unit: 's' },
        feedback: { label: 'Feedback', min: 0, max: 0.92, default: 0.45, step: 0.01 },
        tone: { label: 'Tone', min: 300, max: 12000, default: 2500, scale: 'log', unit: 'Hz' },
        mix: { label: 'Mix', min: 0, max: 1, default: 0.3, step: 0.01 }
      },
      build(ctx) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const delay = ctx.createDelay(2.5);
        const feedback = ctx.createGain();
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        input.connect(dry).connect(output);
        input.connect(delay);
        delay.connect(tone).connect(feedback).connect(delay);
        tone.connect(wet).connect(output);
        return {
          input, output,
          set(p) {
            glide(delay.delayTime, p.time, ctx, 0.1);
            glide(feedback.gain, p.feedback, ctx);
            glide(tone.frequency, p.tone, ctx);
            setMix(dry, wet, p.mix, ctx);
          },
          dispose() {
            [input, dry, wet, delay, feedback, tone, output].forEach(n => n.disconnect());
          }
        };
      }
    },

    tremolo: {
      label: 'Tremolo',
      params: {
        rate: { label: 'Speed', min: 0.02, max: 12, default: 0.3, scale: 'log', unit: 'Hz' },
        depth: { label: 'Depth', min: 0, max: 1, default: 0.5, step: 0.01 }
      },
      build(ctx) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        const amp = ctx.createGain();
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        input.connect(amp).connect(output);
        lfo.connect(depth).connect(amp.gain);
        lfo.start();
        return {
          input, output,
          set(p) {
            glide(lfo.frequency, p.rate, ctx);
            // Gain swings between 1 - depth and 1.
            glide(amp.gain, 1 - p.depth / 2, ctx);
            glide(depth.gain, p.depth / 2, ctx);
          },
          dispose() {
            lfo.stop();
            [input, amp, lfo, depth, output].forEach(n => n.disconnect());
          }
        };
      }
    },

    compressor: {
      label: 'Compressor',
      params: {
        threshold: { label: 'Threshold', min: -60, max: 0, default: -24, step: 1, unit: 'dB' },
        ratio: { label: 'Ratio', min: 1, max: 20, default: 3, step: 0.1 },
        attack: { label: 'Attack', min: 0.001, max: 1, default: 0.03, scale: 'log', unit: 's' },
        release: { label: 'Release', min: 0.02, max: 2, default: 0.4, scale: 'log', unit: 's' },
        makeup: { label: 'Makeup', min: 0, max: 24, default: 0, step: 0.5, unit: 'dB' }
      },
      build(ctx) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        input.connect(comp).connect(output);
        return {
          input, output,
          set(p) {
            glide(comp.threshold, p.threshold, ctx);
            glide(comp.ratio, p.ratio, ctx);
            glide(comp.attack, p.attack, ctx);
            glide(comp.release, p.release, ctx);
            glide(output.gain, Math.pow(10, p.makeup / 20), ctx);
          },
          dispose() {
            [input, comp, output].forEach(n => n.disconnect());
          }
        };
      }
    }
  };

  function effectDefaults(type) {
    const out = {};
    Object.entries(EFFECTS[type].params).forEach(([key, spec]) => { out[key] = spec.default; });
    return out;
  }

  /** An ordered list of effects between an input and an output node. */
  class EffectChain {
    constructor(ctx, input, output) {
      this.ctx = ctx;
      this.input = input;
      this.output = output;
      this.effects = [];
      this.wire();
    }

    add(type, params = {}, enabled = true, id = null) {
      if (!EFFECTS[type]) throw new Error(`Unknown effect "${type}"`);
      const fx = {
        id: id || nextId('fx'),
        type,
        enabled,
        params: { ...effectDefaults(type), ...params },
        node: EFFECTS[type].build(this.ctx)
      };
      fx.node.set(fx.params);
      this.effects.push(fx);
      this.wire();
      return fx.id;
    }

    find(id) {
      const fx = this.effects.find(e => e.id === id);
      if (!fx) throw new Error(`Effect "${id}" not found`);
      return fx;
    }

    update(id, params) {
      const fx = this.find(id);
      fx.params = { ...fx.params, ...params };
      fx.node.set(fx.params);
    }

    setEnabled(id, enabled) {
      this.find(id).enabled = !!enabled;
      this.wire();
    }

    move(id, index) {
      const fx = this.find(id);
      this.effects.splice(this.effects.indexOf(fx), 1);
      this.effects.splice(clamp(index, 0, this.effects.length), 0, fx);
      this.wire();
    }

    remove(id) {
      const fx = this.find(id);
      this.effects.splice(this.effects.indexOf(fx), 1);
      this.wire();
      fx.node.dispose();
    }

    wire() {
      this.input.disconnect();
      this.effects.forEach(fx => fx.node.output.disconnect());
      let prev = this.input;
      this.effects.forEach(fx => {
        if (!fx.enabled) return;
        prev.connect(fx.node.input);
        prev = fx.node.output;
      });
      prev.connect(this.output);
    }

    list() {
      return this.effects.map(({ id, type, enabled, params }) => ({ id, type, enabled, params: { ...params } }));
    }

    dispose() {
      this.effects.forEach(fx => fx.node.dispose());
      this.effects = [];
      this.input.disconnect();
    }
  }

  // ---------------------------------------------------------------------------
  // Sources
  // ---------------------------------------------------------------------------

  /**
   * Source factories: (ctx, options, notify) => {
   *   output, start(), stop(), set(options), serialize(), dispose(), describe()
   * }. notify() tells listeners the source changed on its own (loaded,
   * failed). Other scripts can add more with AmbientMixer.registerSource().
   */
  const SOURCES = {};

  function isCrossOrigin(src) {
    if (typeof location === 'undefined' || !/^https?:/i.test(src)) return false;
    try {
      return new URL(src, location.href).origin !== location.origin;
    } catch (e) {
      return false;
    }
  }

  SOURCES.audio = function (ctx, options, notify) {
    const audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    const node = ctx.createMediaElementSource(audio);
    const output = ctx.createGain();
    node.connect(output);
    let src = null;
    let label = options.label || null;
    let playing = false;
    let error = null;

    audio.addEventListener('error', () => {
      if (!src) return;
      error = isCrossOrigin(src)
        ? 'This URL could not be loaded. Check the link, and that its server allows playback from other sites.'
        : 'This file could not be loaded.';
      notify();
    });
    audio.addEventListener('canplay', () => {
      if (error) { error = null; notify(); }
    });

    function load(next) {
      error = null;
      if (next instanceof Blob) {
        if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
        src = URL.createObjectURL(next);
        label = next.name || label;
      } else {
        src = next || null;
      }
      if (src) {
        if (isCrossOrigin(src)) audio.crossOrigin = 'anonymous';
        else audio.removeAttribute('crossorigin');
        audio.src = src;
        if (playing) audio.play().catch(err => console.warn('Audio play failed:', err.message));
      } else {
        audio.removeAttribute('src');
        audio.load();
      }
    }

    load(options.src);

    return {
      output,
      start() {
        playing = true;
        if (!src) return;
        audio.currentTime = 0;
        audio.play().catch(err => console.warn('Audio play failed:', err.message));
      },
      stop() {
        playing = false;
        audio.pause();
      },
      set(opts) {
        if ('label' in opts) label = opts.label;
        if ('src' in opts) load(opts.src);
      },
      serialize() {
        // Blob URLs only live as long as the page, so they are not saved.
        return { type: 'audio', src: src && !src.startsWith('blob:') ? src : null, label };
      },
      describe() {
        return { type: 'audio', label, loaded: !!src, error };
      },
      dispose() {
        audio.pause();
        if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
        audio.removeAttribute('src');
        audio.load();
        node.disconnect();
        output.disconnect();
      }
    };
  };

  function makeNoise(ctx, color, seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (color === 'pink') {
          // Paul Kellet's refined pink noise filter.
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        } else if (color === 'brown') {
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        } else {
          data[i] = white * 0.5;
        }
      }
    }
    return buffer;
  }

  SOURCES.noise = function (ctx, options) {
    const output = ctx.createGain();
    let color = options.color || 'pink';
    let buffer = makeNoise(ctx, color, 12);
    let node = null;

    function begin() {
      node = ctx.createBufferSource();
      node.buffer = buffer;
      node.loop = true;
      node.connect(output);
      node.start();
    }

    function end() {
      if (!node) return;
      node.stop();
      node.disconnect();
      node = null;
    }

    return {
      output,
      start() { end(); begin(); },
      stop() { end(); },
      set(opts) {
        if (opts.color && opts.color !== color) {
          color = opts.color;
          buffer = makeNoise(ctx, color, 12);
          if (node) { end(); begin(); }
        }
      },
      serialize() { return { type: 'noise', color }; },
      describe() { return { type: 'noise', label: `${color} noise`, color, loaded: true }; },
      dispose() { end(); output.disconnect(); }
    };
  };

  /** Turn whatever addTrack() was given into source options. */
  function normalizeSource(source) {
    if (source == null) return { type: 'audio', src: null };
    if (typeof source === 'string') return { type: 'audio', src: source };
    if (typeof Blob !== 'undefined' && source instanceof Blob) return { type: 'audio', src: source };
    return { type: 'audio', ...source };
  }

  // ---------------------------------------------------------------------------
  // Mixer
  // ---------------------------------------------------------------------------

  class AmbientMixer {
    constructor(config = {}) {
      this.ctx = config.audioContext || null;
      this.tracks = new Map();
      this.moods = {};
      this.masterVolume = clamp(config.masterVolume ?? 0.5, 0, 1);
      // fadeSpeed is the old per-tick step size; convert it to seconds.
      this.fadeTime = config.fadeTime ?? (config.fadeSpeed ? 0.05 / config.fadeSpeed : 2.5);
      this.moodDuration = config.moodDuration || { min: 20000, max: 40000 };
      this.autoMood = config.autoMood ?? true;
      this.currentMood = null;
      this.isPlaying = false;
      this.moodTimeout = null;
      this.stopTimer = null;
      this.listeners = {};
      this.onMoodChange = config.onMoodChange || null;
      this.onPlayStateChange = config.onPlayStateChange || null;
      this.master = null;
    }

    // ----- Events ------------------------------------------------------------

    /**
     * Listen for 'mood', 'play', 'tracks' (added, removed or renamed),
     * 'track' (one track's settings), 'effects' and 'moods' events.
     */
    on(event, fn) {
      (this.listeners[event] = this.listeners[event] || []).push(fn);
      return this;
    }

    off(event, fn) {
      this.listeners[event] = (this.listeners[event] || []).filter(f => f !== fn);
      return this;
    }

    emit(event, ...args) {
      (this.listeners[event] || []).forEach(fn => fn(...args));
    }

    // ----- Audio graph -------------------------------------------------------

    /** The AudioContext, created on first use. */
    getContext() {
      if (!this.ctx) {
        const Ctx = root.AudioContext || root.webkitAudioContext;
        this.ctx = new Ctx();
      }
      if (!this.master) this.buildMaster();
      return this.ctx;
    }

    buildMaster() {
      const ctx = this.ctx;
      const input = ctx.createGain();
      const chainOut = ctx.createGain();
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      gain.gain.value = this.masterVolume;
      chainOut.connect(gain).connect(analyser).connect(ctx.destination);
      this.master = {
        input, gain, analyser,
        chain: new EffectChain(ctx, input, chainOut),
        meter: new Float32Array(analyser.fftSize)
      };
    }

    // ----- Tracks ------------------------------------------------------------

    /**
     * Initialize the mixer with track definitions
     * @param {Object} trackConfig - Object mapping track names to audio file paths
     * @example
     * mixer.init({
     *   night: '/audio/night-ambience.mp3',
     *   rain: '/audio/rain.mp3'
     * });
     */
    init(trackConfig) {
      Object.entries(trackConfig).forEach(([name, src]) => this.addTrack(name, src));
      return this;
    }

    /**
     * Add a track.
     * @param {string} name - Unique track name
     * @param {string|Blob|Object} source - Audio URL, File/Blob, or source
     *   options such as { type: 'noise', color: 'brown' }
     * @param {Object} [options] - { volume, pan, mute, solo, meta }
     */
    addTrack(name, source, options = {}) {
      name = String(name).trim();
      if (!name) throw new Error('Track name is required');
      if (name === MASTER) throw new Error(`"${MASTER}" is reserved for the master bus`);
      if (this.tracks.has(name)) throw new Error(`A track named "${name}" already exists`);

      const ctx = this.getContext();
      const sourceOptions = normalizeSource(source);
      const factory = SOURCES[sourceOptions.type];
      if (!factory) throw new Error(`Unknown source type "${sourceOptions.type}"`);

      const chainIn = ctx.createGain();
      const chainOut = ctx.createGain();
      const panner = ctx.createStereoPanner();
      const fader = ctx.createGain();
      const muter = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      fader.gain.value = 0;
      chainOut.connect(panner).connect(fader).connect(muter).connect(analyser).connect(this.master.input);

      const track = {
        name,
        source: null,
        chain: new EffectChain(ctx, chainIn, chainOut),
        panner, fader, muter, analyser,
        meter: new Float32Array(analyser.fftSize),
        volume: clamp(options.volume ?? 0, 0, 1),
        pan: clamp(options.pan ?? 0, -1, 1),
        mute: !!options.mute,
        solo: !!options.solo,
        meta: options.meta || {}
      };
      track.source = factory(ctx, sourceOptions, () => this.emit('track', track.name));
      track.source.output.connect(chainIn);
      panner.pan.value = track.pan;
      this.tracks.set(name, track);
      this.updateMutes();

      if (this.isPlaying) {
        track.source.start();
        glide(fader.gain, track.volume, ctx, this.fadeTime / 3);
      }
      this.emit('tracks');
      return this;
    }

    track(name) {
      const track = this.tracks.get(name);
      if (!track) throw new Error(`Track "${name}" not found`);
      return track;
    }

    hasTrack(name) {
      return this.tracks.has(name);
    }

    removeTrack(name) {
      const track = this.track(name);
      track.source.stop();
      track.source.dispose();
      track.chain.dispose();
      [track.panner, track.fader, track.muter, track.analyser].forEach(n => n.disconnect());
      this.tracks.delete(name);
      Object.values(this.moods).forEach(mood => { delete mood[name]; });
      this.updateMutes();
      this.emit('tracks');
      return this;
    }

    renameTrack(name, newName) {
      newName = String(newName).trim();
      if (name === newName) return this;
      if (!newName) throw new Error('Track name is required');
      if (newName === MASTER) throw new Error(`"${MASTER}" is reserved for the master bus`);
      if (this.tracks.has(newName)) throw new Error(`A track named "${newName}" already exists`);
      const track = this.track(name);
      track.name = newName;
      // Rebuild the map so track order is kept.
      this.tracks = new Map([...this.tracks].map(([key, t]) => (key === name ? [newName, t] : [key, t])));
      Object.values(this.moods).forEach(mood => {
        if (name in mood) {
          mood[newName] = mood[name];
          delete mood[name];
        }
      });
      this.emit('tracks');
      return this;
    }

    /** Move a track to a new position in the track order. */
    moveTrack(name, index) {
      const entries = [...this.tracks];
      const from = entries.findIndex(([key]) => key === name);
      if (from < 0) throw new Error(`Track "${name}" not found`);
      const [entry] = entries.splice(from, 1);
      entries.splice(clamp(index, 0, entries.length), 0, entry);
      this.tracks = new Map(entries);
      this.emit('tracks');
      return this;
    }

    getTracks() {
      return [...this.tracks.keys()].map(name => this.getTrack(name));
    }

    getTrack(name) {
      const t = this.track(name);
      return {
        name: t.name,
        volume: t.volume,
        pan: t.pan,
        mute: t.mute,
        solo: t.solo,
        meta: t.meta,
        source: t.source.describe(),
        effects: t.chain.list()
      };
    }

    /**
     * Set a track's volume.
     * @param {string} name
     * @param {number} volume - 0 to 1
     * @param {Object} [opts] - { fade: true } glides over fadeTime
     */
    setTrackVolume(name, volume, opts = {}) {
      const t = this.track(name);
      t.volume = clamp(volume, 0, 1);
      if (this.isPlaying) {
        glide(t.fader.gain, t.volume, this.ctx, opts.fade ? this.fadeTime / 3 : 0.02);
      }
      this.emit('track', name);
      return this;
    }

    setTrackPan(name, pan) {
      const t = this.track(name);
      t.pan = clamp(pan, -1, 1);
      glide(t.panner.pan, t.pan, this.ctx);
      this.emit('track', name);
      return this;
    }

    setTrackMute(name, mute) {
      this.track(name).mute = !!mute;
      this.updateMutes();
      this.emit('track', name);
      return this;
    }

    setTrackSolo(name, solo) {
      this.track(name).solo = !!solo;
      this.updateMutes();
      this.emit('track', name);
      return this;
    }

    setTrackMeta(name, meta) {
      const t = this.track(name);
      t.meta = { ...t.meta, ...meta };
      this.emit('track', name);
      return this;
    }

    /** Change a track's source settings, e.g. { src } or { color }. */
    updateTrackSource(name, options) {
      this.track(name).source.set(options);
      this.emit('track', name);
      return this;
    }

    updateMutes() {
      if (!this.ctx) return;
      const anySolo = [...this.tracks.values()].some(t => t.solo);
      this.tracks.forEach(t => {
        const audible = !t.mute && (!anySolo || t.solo);
        glide(t.muter.gain, audible ? 1 : 0, this.ctx, 0.02);
      });
    }

    /**
     * Current output level of a track or the master bus.
     * @returns {{ peak: number, rms: number }} linear values 0 to 1+
     */
    getLevel(name = MASTER) {
      const target = name === MASTER ? this.master : this.tracks.get(name);
      if (!target || !this.isPlaying) return { peak: 0, rms: 0 };
      target.analyser.getFloatTimeDomainData(target.meter);
      let peak = 0;
      let sum = 0;
      for (let i = 0; i < target.meter.length; i++) {
        const v = target.meter[i];
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      return { peak, rms: Math.sqrt(sum / target.meter.length) };
    }

    // ----- Effects -----------------------------------------------------------

    chainFor(target) {
      if (target === MASTER) {
        this.getContext();
        return this.master.chain;
      }
      return this.track(target).chain;
    }

    /**
     * Add an effect to a track or to the master bus (AmbientMixer.MASTER).
     * @returns {string} effect id
     */
    addEffect(target, type, params = {}, opts = {}) {
      const id = this.chainFor(target).add(type, params, opts.enabled ?? true, opts.id);
      this.emit('effects', target);
      return id;
    }

    updateEffect(target, id, params) {
      this.chainFor(target).update(id, params);
      this.emit('effects', target);
      return this;
    }

    setEffectEnabled(target, id, enabled) {
      this.chainFor(target).setEnabled(id, enabled);
      this.emit('effects', target);
      return this;
    }

    moveEffect(target, id, index) {
      this.chainFor(target).move(id, index);
      this.emit('effects', target);
      return this;
    }

    removeEffect(target, id) {
      this.chainFor(target).remove(id);
      this.emit('effects', target);
      return this;
    }

    getEffects(target) {
      return this.chainFor(target).list();
    }

    // ----- Moods -------------------------------------------------------------

    /**
     * Define mood presets - combinations of track volumes
     * @param {Object} moodConfig - Object mapping mood names to track volume settings
     * @example
     * mixer.defineMoods({
     *   calm: { night: 0.4, piano: 0.2 },
     *   stormy: { night: 0.2, rain: 0.4, thunder: 0.3 }
     * });
     */
    defineMoods(moodConfig) {
      this.moods = {};
      Object.entries(moodConfig).forEach(([name, volumes]) => { this.moods[name] = { ...volumes }; });
      this.emit('moods');
      return this;
    }

    /** Add or replace a single mood. */
    saveMood(name, volumes) {
      this.moods[name] = { ...volumes };
      this.emit('moods');
      return this;
    }

    /** Save the current track volumes as a mood. */
    captureMood(name) {
      const volumes = {};
      this.tracks.forEach((t, key) => { if (t.volume > 0) volumes[key] = t.volume; });
      return this.saveMood(name, volumes);
    }

    removeMood(name) {
      delete this.moods[name];
      if (this.currentMood === name) this.currentMood = null;
      this.emit('moods');
      return this;
    }

    renameMood(name, newName) {
      if (!this.moods[name] || name === newName) return this;
      this.moods = Object.fromEntries(Object.entries(this.moods).map(([k, v]) => [k === name ? newName : k, v]));
      if (this.currentMood === name) this.currentMood = newName;
      this.emit('moods');
      return this;
    }

    /**
     * Set the current mood. This turns off automatic mood cycling.
     * @param {string} moodName - Name of the mood to set
     */
    setMood(moodName) {
      if (!this.moods[moodName]) {
        console.warn(`Mood "${moodName}" not found`);
        return this;
      }
      this.disableAutoMood();
      this.applyMood(moodName);
      return this;
    }

    /**
     * Pick a random mood from defined moods, avoiding the current one.
     */
    randomMood() {
      let names = Object.keys(this.moods);
      if (names.length === 0) return this;
      if (names.length > 1) names = names.filter(n => n !== this.currentMood);
      this.applyMood(names[Math.floor(Math.random() * names.length)]);
      return this;
    }

    applyMood(moodName) {
      const mood = this.moods[moodName];
      this.currentMood = moodName;
      this.tracks.forEach((t, name) => {
        t.volume = clamp(mood[name] ?? 0, 0, 1);
        if (this.isPlaying) glide(t.fader.gain, t.volume, this.ctx, this.fadeTime / 3);
      });
      if (this.onMoodChange) this.onMoodChange(moodName);
      this.emit('mood', moodName);
    }

    /**
     * Enable auto mood cycling
     */
    enableAutoMood() {
      this.autoMood = true;
      if (this.isPlaying) {
        this.scheduleMoodChange();
      }
      this.emit('mood', this.currentMood);
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

    setMoodDuration(min, max) {
      this.moodDuration = { min, max: Math.max(min, max) };
      if (this.isPlaying && this.autoMood) this.scheduleMoodChange();
      return this;
    }

    /**
     * Schedule the next automatic mood change
     */
    scheduleMoodChange() {
      if (this.moodTimeout) clearTimeout(this.moodTimeout);
      this.moodTimeout = null;
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

    // ----- Transport ---------------------------------------------------------

    /**
     * Set master volume
     * @param {number} volume - Volume level from 0 to 1
     */
    setMasterVolume(volume) {
      this.masterVolume = clamp(volume, 0, 1);
      if (this.master) glide(this.master.gain.gain, this.masterVolume, this.ctx);
      this.emit('track', MASTER);
      return this;
    }

    getMasterVolume() {
      return this.masterVolume;
    }

    /**
     * Start playing the mixer. Call this from a user gesture (a click), since
     * browsers only let audio start after one.
     */
    play() {
      if (this.isPlaying) return this;
      const ctx = this.getContext();
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      this.isPlaying = true;

      if (this.stopTimer) {
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }

      // Fade every track in from silence.
      this.tracks.forEach(t => {
        t.fader.gain.cancelScheduledValues(ctx.currentTime);
        t.fader.gain.setValueAtTime(0, ctx.currentTime);
        t.source.stop();
        t.source.start();
      });

      if (this.autoMood && Object.keys(this.moods).length) {
        this.randomMood();
        this.scheduleMoodChange();
      } else {
        this.tracks.forEach(t => glide(t.fader.gain, t.volume, ctx, this.fadeTime / 3));
      }

      if (this.onPlayStateChange) this.onPlayStateChange(true);
      this.emit('play', true);
      return this;
    }

    /**
     * Stop the mixer. Tracks fade out quickly to avoid clicks; their volumes
     * are kept for the next play().
     */
    stop() {
      if (!this.isPlaying) return this;
      this.isPlaying = false;

      if (this.moodTimeout) {
        clearTimeout(this.moodTimeout);
        this.moodTimeout = null;
      }

      const ctx = this.ctx;
      this.tracks.forEach(t => glide(t.fader.gain, 0, ctx, 0.04));
      this.stopTimer = setTimeout(() => {
        this.stopTimer = null;
        this.tracks.forEach(t => t.source.stop());
      }, 200);

      if (this.onPlayStateChange) this.onPlayStateChange(false);
      this.emit('play', false);
      return this;
    }

    /**
     * Toggle play/stop
     */
    toggle() {
      return this.isPlaying ? this.stop() : this.play();
    }

    getMoods() {
      return Object.keys(this.moods);
    }

    getMood(name) {
      return this.moods[name] ? { ...this.moods[name] } : null;
    }

    getCurrentMood() {
      return this.currentMood;
    }

    getIsPlaying() {
      return this.isPlaying;
    }

    // ----- Save and load -----------------------------------------------------

    /** The whole mix as plain JSON-safe data. */
    toJSON() {
      return {
        format: 'ambient-mixer',
        version: 2,
        masterVolume: this.masterVolume,
        fadeTime: this.fadeTime,
        autoMood: this.autoMood,
        moodDuration: { ...this.moodDuration },
        masterEffects: this.master ? this.master.chain.list() : [],
        tracks: [...this.tracks.values()].map(t => ({
          name: t.name,
          volume: t.volume,
          pan: t.pan,
          mute: t.mute,
          solo: t.solo,
          meta: t.meta,
          source: t.source.serialize(),
          effects: t.chain.list()
        })),
        moods: JSON.parse(JSON.stringify(this.moods))
      };
    }

    /**
     * Replace the current mix with one saved by toJSON().
     * @param {Object} data
     * @param {Object} [opts] - { resolveSource(track) } can return a source
     *   (URL, Blob or options) for each saved track, e.g. from local storage.
     */
    load(data, opts = {}) {
      if (!data || data.format !== 'ambient-mixer') throw new Error('This is not an Ambient Mixer file.');
      const wasPlaying = this.isPlaying;
      this.clear();
      this.masterVolume = clamp(data.masterVolume ?? 0.5, 0, 1);
      this.fadeTime = data.fadeTime ?? this.fadeTime;
      this.moodDuration = data.moodDuration || this.moodDuration;
      this.getContext();
      glide(this.master.gain.gain, this.masterVolume, this.ctx);
      (data.masterEffects || []).forEach(fx => {
        this.master.chain.add(fx.type, fx.params, fx.enabled, fx.id);
      });
      (data.tracks || []).forEach(t => {
        const source = opts.resolveSource ? opts.resolveSource(t) : t.source;
        this.addTrack(t.name, source ?? t.source, {
          volume: t.volume, pan: t.pan, mute: t.mute, solo: t.solo, meta: t.meta
        });
        (t.effects || []).forEach(fx => this.track(t.name).chain.add(fx.type, fx.params, fx.enabled, fx.id));
      });
      this.moods = JSON.parse(JSON.stringify(data.moods || {}));
      this.autoMood = !!data.autoMood;
      this.emit('moods');
      this.emit('effects', MASTER);
      this.emit('track', MASTER);
      if (wasPlaying) this.play();
      return this;
    }

    /** Remove every track, mood and master effect. */
    clear() {
      this.stop();
      [...this.tracks.keys()].forEach(name => this.removeTrack(name));
      if (this.master) {
        this.master.chain.list().forEach(fx => this.master.chain.remove(fx.id));
      }
      this.moods = {};
      this.currentMood = null;
      this.emit('moods');
      this.emit('effects', MASTER);
      return this;
    }

    /**
     * Destroy the mixer and clean up resources
     */
    destroy() {
      this.clear();
      if (this.stopTimer) clearTimeout(this.stopTimer);
      if (this.master) this.master.chain.dispose();
      if (this.ctx && this.ctx.close) this.ctx.close();
      this.ctx = null;
      this.master = null;
      this.listeners = {};
    }
  }

  AmbientMixer.MASTER = MASTER;
  AmbientMixer.EFFECTS = EFFECTS;
  AmbientMixer.SOURCES = SOURCES;
  AmbientMixer.effectDefaults = effectDefaults;
  AmbientMixer.glide = glide;
  AmbientMixer.registerSource = function (type, factory) {
    SOURCES[type] = factory;
  };

  // Export for different module systems
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AmbientMixer;
  }
  if (typeof window !== 'undefined') {
    window.AmbientMixer = AmbientMixer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
