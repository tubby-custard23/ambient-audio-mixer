/**
 * Ambient Audio Mixer: chord progressions
 *
 * Adds a 'chords' track type that loops a chord progression on a synth pad
 * or on your own samples. Load it after ambient-mixer.js:
 *
 *   mixer.addTrack('Pad', {
 *     type: 'chords',
 *     key: 'A', mode: 'minor',
 *     progression: 'i VI III VII',
 *     bpm: 60, beatsPerChord: 8
 *   });
 *
 * The theory helpers are also available as AmbientChords.
 *
 * @author Daniel Lopez-Cope
 * @license MIT
 */

(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Theory
  // ---------------------------------------------------------------------------

  const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const MODES = {
    major: { label: 'Major', steps: [0, 2, 4, 5, 7, 9, 11], parent: 0 },
    minor: { label: 'Minor', steps: [0, 2, 3, 5, 7, 8, 10], parent: 9 },
    dorian: { label: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10], parent: 2 },
    phrygian: { label: 'Phrygian', steps: [0, 1, 3, 5, 7, 8, 10], parent: 4 },
    lydian: { label: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11], parent: 5 },
    mixolydian: { label: 'Mixolydian', steps: [0, 2, 4, 5, 7, 9, 10], parent: 7 },
    locrian: { label: 'Locrian', steps: [0, 1, 3, 5, 6, 8, 10], parent: 11 },
    harmonicMinor: { label: 'Harmonic minor', steps: [0, 2, 3, 5, 7, 8, 11], parent: 9 }
  };

  const ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7 };

  const TRIADS = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dim: [0, 3, 6],
    aug: [0, 4, 8]
  };

  /** Pitch class (0–11) of a note name such as 'C', 'F#', 'Bb'. */
  function pitchClass(name) {
    const m = /^([A-Ga-g])([#b♯♭]?)$/.exec(String(name).trim());
    if (!m) throw new Error(`“${name}” is not a note name`);
    let pc = LETTERS[m[1].toUpperCase()];
    if (m[2] === '#' || m[2] === '♯') pc += 1;
    if (m[2] === 'b' || m[2] === '♭') pc -= 1;
    return (pc + 12) % 12;
  }

  /** MIDI note number from a name like 'C4', 'F#2', 'Bb3'. Returns null if not a note. */
  function noteFromName(name) {
    const m = /([A-Ga-g])([#b♯♭]?)(-?\d)/.exec(String(name));
    if (!m) return null;
    return pitchClass(m[1] + m[2]) + (Number(m[3]) + 1) * 12;
  }

  function noteName(midi, flats) {
    return `${(flats ? FLAT_NAMES : SHARP_NAMES)[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  }

  /** Whether a key is usually written with flats. */
  function keyPrefersFlats(key, mode) {
    if (/b|♭/.test(key)) return true;
    if (/#|♯/.test(key)) return false;
    const parent = (pitchClass(key) - (MODES[mode] || MODES.major).parent + 12) % 12;
    return [5, 10, 3, 8, 1, 6].includes(parent);
  }

  /**
   * Apply a chord suffix such as '7', 'maj7', 'sus4', 'add9' to a triad.
   * Returns { intervals, suffix } or throws on anything it doesn't know.
   */
  function applySuffix(base, quality, text, token) {
    let intervals = base.slice();
    let rest = text;
    let suffix = '';
    const third = () => intervals.findIndex(i => i === 3 || i === 4);
    const add = (...ivs) => ivs.forEach(i => { if (!intervals.includes(i)) intervals.push(i); });

    while (rest.length) {
      let m;
      if ((m = /^(maj9|M9|Δ9)/.exec(rest))) { add(11, 14); suffix += 'maj9'; }
      else if ((m = /^(maj7|M7|Δ7|Δ|maj)/.exec(rest))) { add(11); suffix += 'maj7'; }
      else if ((m = /^add9|^add2/.exec(rest))) { add(14); suffix += 'add9'; }
      else if ((m = /^sus2/.exec(rest))) {
        const t = third();
        if (t >= 0) intervals[t] = 2;
        suffix += 'sus2';
      } else if ((m = /^sus4|^sus/.exec(rest))) {
        const t = third();
        if (t >= 0) intervals[t] = 5;
        suffix += 'sus4';
      } else if ((m = /^(b5|♭5)/.exec(rest))) {
        intervals = intervals.map(i => (i === 7 ? 6 : i));
        suffix += 'b5';
      } else if ((m = /^13/.exec(rest))) { add(quality === 'dim' ? 9 : 10, 14, 21); suffix += '13'; }
      else if ((m = /^11/.exec(rest))) { add(quality === 'dim' ? 9 : 10, 14, 17); suffix += '11'; }
      else if ((m = /^9/.exec(rest))) { add(10, 14); suffix += '9'; }
      else if ((m = /^7/.exec(rest))) {
        // Fully diminished chords take a diminished 7th; the rest a minor 7th.
        add(quality === 'dim' ? 9 : 10);
        suffix += '7';
      } else if ((m = /^6/.exec(rest))) { add(9); suffix += '6'; }
      else if ((m = /^5/.exec(rest))) { intervals = [0, 7]; suffix += '5'; }
      else throw new Error(`“${token}”: didn't understand “${rest}”`);
      rest = rest.slice(m[0].length);
    }
    return { intervals: intervals.sort((a, b) => a - b), suffix };
  }

  /** Quality marks written right after a numeral or root. */
  function readQuality(text) {
    let m;
    if ((m = /^(°|o|dim)/.exec(text))) return { quality: 'dim', rest: text.slice(m[0].length) };
    if ((m = /^(ø7?|m7b5|m7♭5)/.exec(text))) return { quality: 'half', rest: `7${text.slice(m[0].length)}` };
    if ((m = /^(\+|aug)/.exec(text))) return { quality: 'aug', rest: text.slice(m[0].length) };
    return { quality: null, rest: text };
  }

  function triadFor(quality) {
    return quality === 'half' ? TRIADS.dim : TRIADS[quality];
  }

  function qualityName(quality, suffix) {
    if (suffix === '5') return '5';
    if (quality === 'half') return `m7b5${suffix.replace(/^7/, '')}`;
    if (quality === 'dim') return suffix === '7' ? 'dim7' : `dim${suffix}`;
    if (quality === 'aug') return `aug${suffix}`;
    if (quality === 'minor') return `m${suffix}`;
    return suffix;
  }

  /**
   * Parse one chord: a Roman numeral relative to the key ('vi', 'bVII',
   * 'V7', 'ii°', 'IVmaj7') or a chord name ('Am', 'F#m7', 'Cadd9', 'G/B').
   * A ':n' ending makes the chord last n times as long.
   */
  function parseChord(token, key = 'C', mode = 'major') {
    const raw = String(token).trim();
    if (!raw) throw new Error('Empty chord');
    const scale = (MODES[mode] || MODES.major).steps;
    const keyPc = pitchClass(key);

    let text = raw;
    let length = 1;
    const lengthMatch = /:(\d*\.?\d+)$/.exec(text);
    if (lengthMatch) {
      length = Number(lengthMatch[1]);
      if (!(length > 0)) throw new Error(`“${raw}”: length must be more than 0`);
      text = text.slice(0, lengthMatch.index);
    }

    let bassText = null;
    const slash = text.indexOf('/');
    if (slash > 0) {
      bassText = text.slice(slash + 1);
      text = text.slice(0, slash);
    }

    let rootPc;
    let quality;
    let rest;
    let display;
    let flats = keyPrefersFlats(key, mode);

    const romanMatch = /^([b#♭♯]?)(vii|VII|iii|III|vi|VI|iv|IV|ii|II|v|V|i|I)/.exec(text);
    const name = /^([A-G])([#b♯♭]?)/.exec(text);

    if (romanMatch) {
      const [whole, accidental, numeral] = romanMatch;
      const degree = ROMAN[numeral.toLowerCase()];
      rootPc = keyPc + scale[degree - 1];
      if (accidental === 'b' || accidental === '♭') { rootPc -= 1; flats = true; }
      if (accidental === '#' || accidental === '♯') { rootPc += 1; flats = false; }
      rootPc = (rootPc + 12) % 12;
      const q = readQuality(text.slice(whole.length));
      quality = q.quality || (numeral === numeral.toUpperCase() ? 'major' : 'minor');
      rest = q.rest;
    } else if (name) {
      rootPc = pitchClass(name[1] + name[2]);
      display = name[1] + name[2].replace('♯', '#').replace('♭', 'b');
      if (name[2]) flats = name[2] === 'b' || name[2] === '♭';
      rest = text.slice(name[0].length);
      const q = readQuality(rest);
      if (q.quality) {
        quality = q.quality;
        rest = q.rest;
      } else if (/^(m(?!aj)|min|-)/.test(rest)) {
        quality = 'minor';
        rest = rest.replace(/^(min|m|-)/, '');
      } else {
        quality = 'major';
      }
    } else {
      throw new Error(`“${raw}” isn't a chord. Use Roman numerals like vi or chord names like Am.`);
    }

    const { intervals, suffix } = applySuffix(triadFor(quality), quality, rest, raw);

    let bassPc = null;
    if (bassText) {
      const bassRoman = /^([b#♭♯]?)(vii|VII|iii|III|vi|VI|iv|IV|ii|II|v|V|i|I)$/.exec(bassText);
      if (/^[A-G][#b♯♭]?$/.test(bassText)) bassPc = pitchClass(bassText);
      else if (bassRoman) {
        bassPc = keyPc + scale[ROMAN[bassRoman[2].toLowerCase()] - 1];
        if (bassRoman[1] === 'b' || bassRoman[1] === '♭') bassPc -= 1;
        if (bassRoman[1] === '#' || bassRoman[1] === '♯') bassPc += 1;
        bassPc = (bassPc + 12) % 12;
      } else throw new Error(`“${raw}”: “${bassText}” isn't a bass note`);
    }

    const rootName = display || (flats ? FLAT_NAMES : SHARP_NAMES)[rootPc];
    const bassName = bassPc == null ? '' : `/${(flats ? FLAT_NAMES : SHARP_NAMES)[bassPc]}`;
    return {
      token: raw,
      root: rootPc,
      bass: bassPc,
      intervals,
      length,
      name: `${rootName}${qualityName(quality, suffix)}${bassName}`
    };
  }

  /** Split a progression into chords. Separators: spaces, commas, bars, dashes. */
  function parseProgression(text, key = 'C', mode = 'major') {
    const tokens = String(text).split(/[\s,|–—]+|-(?=\s|$|[b#♭♯]?[ivIVA-G])/).filter(t => t && t !== '-');
    return tokens.map(t => parseChord(t, key, mode));
  }

  /**
   * Choose MIDI notes for a chord.
   * @param {Object} chord - from parseChord
   * @param {number[]|null} previous - the last chord's notes, for voice leading
   * @param {Object} opts - { octave, spread: 'close'|'open'|'wide', voiceLeading, bass }
   * @returns {{ notes: number[], bass: number|null }}
   */
  function voiceChord(chord, previous, opts = {}) {
    const octave = opts.octave ?? 3;
    const spread = opts.spread || 'open';
    const center = (octave + 1) * 12 + chord.root;
    const n = chord.intervals.length;

    function shape(inversion, shift) {
      const notes = chord.intervals.map((iv, i) => center + iv + (i < inversion ? 12 : 0) + shift * 12);
      notes.sort((a, b) => a - b);
      if (spread === 'open' && notes.length > 2) notes[1] += 12;
      if (spread === 'wide') for (let i = 1; i < notes.length; i += 2) notes[i] += 12;
      return notes.sort((a, b) => a - b);
    }

    let best = shape(0, 0);
    if (opts.voiceLeading !== false && previous && previous.length) {
      let bestScore = Infinity;
      for (let inv = 0; inv < n; inv++) {
        for (let shift = -1; shift <= 1; shift++) {
          const cand = shape(inv, shift);
          // Total movement, plus a nudge to stay near the chosen octave.
          let score = cand.reduce((sum, note) => sum + Math.min(...previous.map(p => Math.abs(p - note))), 0);
          score += previous.reduce((sum, p) => sum + Math.min(...cand.map(note => Math.abs(p - note))), 0) * 0.5;
          const mean = cand.reduce((a, b) => a + b, 0) / cand.length;
          score += Math.abs(mean - ((octave + 1) * 12 + 7)) * 0.35;
          if (score < bestScore) {
            bestScore = score;
            best = cand;
          }
        }
      }
    }

    let bass = null;
    const bassPc = chord.bass ?? chord.root;
    if (opts.bass !== false) {
      bass = (octave) * 12 + bassPc;           // an octave below the chord register
      while (bass >= best[0]) bass -= 12;
      while (bass < 28) bass += 12;
    } else if (chord.bass != null) {
      // Slash chords keep their bass note even without the bass voice.
      bass = best[0] - (((best[0] - bassPc) % 12 + 12) % 12 || 12);
    }
    return { notes: best, bass };
  }

  const PRESETS = [
    { name: 'Night drive', key: 'A', mode: 'minor', progression: 'i VI III VII' },
    { name: 'Lament', key: 'C', mode: 'minor', progression: 'i iv VI V' },
    { name: 'Dread', key: 'E', mode: 'phrygian', progression: 'i II i vii' },
    { name: 'Uncanny', key: 'C', mode: 'major', progression: 'I bIII I bVI' },
    { name: 'Weightless', key: 'D', mode: 'lydian', progression: 'Imaj7 II Imaj7 II' },
    { name: 'Hymn', key: 'F', mode: 'major', progression: 'Iadd9 V vi IV' },
    { name: 'Open fields', key: 'G', mode: 'mixolydian', progression: 'Isus2 VII IV Isus4' },
    { name: 'Long shadow', key: 'D', mode: 'dorian', progression: 'i7:2 IV7 bVImaj7' }
  ];

  // ---------------------------------------------------------------------------
  // Sound
  // ---------------------------------------------------------------------------

  const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const DEFAULTS = {
    key: 'A',
    mode: 'minor',
    progression: 'i VI III VII',
    bpm: 60,
    beatsPerChord: 8,
    pattern: 'sustain',        // sustain | bloom | pulse | arpeggio
    octave: 3,
    spread: 'open',            // close | open | wide
    voiceLeading: true,
    bass: true,
    instrument: 'pad',         // pad | sampler
    pad: { wave: 'sawtooth', detune: 12, unison: 2, warmth: 1400, attack: 2.5, release: 4 },
    sampler: { samples: [], attack: 0.01, release: 1.5, loop: false }
  };

  function chordsSource(ctx, options, notify) {
    const settings = JSON.parse(JSON.stringify(DEFAULTS));
    const output = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.Q.value = 0.4;
    tone.connect(output);

    let chords = [];
    let error = null;
    let timer = null;
    let index = 0;
    let nextTime = 0;
    let lastNotes = null;
    let positions = [];       // [{ time, index }] of scheduled chords
    const voices = new Set(); // live notes, so stop() can release them
    const buffers = new Map(); // sample src -> AudioBuffer | Promise | Error

    function samples() {
      return settings.sampler.samples.filter(s => buffers.get(s.key) instanceof AudioBuffer);
    }

    function loadSample(sample) {
      if (!sample.src || buffers.has(sample.key)) return;
      const pending = (sample.src instanceof Blob ? sample.src.arrayBuffer() : fetch(sample.src).then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      }))
        .then(data => ctx.decodeAudioData(data))
        .then(buffer => { buffers.set(sample.key, buffer); notify(); })
        .catch(() => { buffers.set(sample.key, new Error('load failed')); notify(); });
      buffers.set(sample.key, pending);
    }

    let sampleCounter = 0;
    /** Samples can be passed back from describe(), which leaves out src. */
    function normalizeSamples(list) {
      return (list || []).map(s => {
        const prev = s.key && settings.sampler.samples.find(p => p.key === s.key);
        const src = s.src !== undefined ? s.src : prev ? prev.src : null;
        const key = s.key || (src instanceof Blob ? `blob-${sampleCounter++}` : src) || `missing-${sampleCounter++}`;
        const { loaded, failed, ...rest } = s;
        return { ...rest, src, key, note: Number(s.note) || 60 };
      });
    }

    function apply(opts) {
      ['key', 'mode', 'progression', 'bpm', 'beatsPerChord', 'pattern', 'octave', 'spread', 'voiceLeading', 'bass', 'instrument']
        .forEach(k => { if (k in opts) settings[k] = opts[k]; });
      if (opts.pad) Object.assign(settings.pad, opts.pad);
      if (opts.sampler) {
        const { samples: list, ...rest } = opts.sampler;
        Object.assign(settings.sampler, rest);
        if (list) {
          settings.sampler.samples = normalizeSamples(list);
          settings.sampler.samples.forEach(loadSample);
        }
      }
      settings.bpm = Math.min(300, Math.max(10, Number(settings.bpm) || 60));
      settings.beatsPerChord = Math.min(64, Math.max(0.25, Number(settings.beatsPerChord) || 4));

      try {
        chords = parseProgression(settings.progression, settings.key, settings.mode);
        error = chords.length ? null : 'Type some chords to hear them.';
      } catch (err) {
        // Keep playing the last good progression.
        error = err.message;
      }
      if (index >= chords.length) index = 0;
      AmbientMixer.glide(tone.frequency, settings.instrument === 'pad' ? settings.pad.warmth : 20000, ctx, 0.05);
    }

    function beat() {
      return 60 / settings.bpm;
    }

    function envelope(t0, t1, peak, attack, release) {
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t0);
      env.gain.setTargetAtTime(peak, t0, Math.max(0.002, attack / 3));
      env.gain.setTargetAtTime(0, t1, Math.max(0.01, release / 3));
      return env;
    }

    /** Schedule one note from t0, released at t1. */
    function playNote(midi, t0, t1, velocity) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.35;
      pan.connect(tone);
      const nodes = [pan];
      let end;

      if (settings.instrument === 'sampler') {
        const list = samples();
        if (!list.length) return;
        const sample = list.reduce((a, b) => (Math.abs(b.note - midi) < Math.abs(a.note - midi) ? b : a));
        const s = settings.sampler;
        const env = envelope(t0, t1, 0.8 * velocity, s.attack, s.release);
        const src = ctx.createBufferSource();
        src.buffer = buffers.get(sample.key);
        src.playbackRate.value = Math.pow(2, (midi - sample.note) / 12);
        src.loop = !!s.loop;
        src.connect(env).connect(pan);
        end = t1 + s.release * 1.5 + 0.05;
        if (!s.loop) end = Math.min(end, t0 + src.buffer.duration / src.playbackRate.value + 0.05);
        src.start(t0);
        src.stop(Math.max(t0 + 0.01, end));
        nodes.push(env, src);
        src.onended = () => finish(voice);
      } else {
        const p = settings.pad;
        const unison = Math.max(1, Math.min(4, Math.round(p.unison)));
        const env = envelope(t0, t1, (0.16 * velocity) / Math.sqrt(unison), p.attack, p.release);
        env.connect(pan);
        nodes.push(env);
        end = t1 + p.release * 1.5 + 0.05;
        for (let u = 0; u < unison; u++) {
          const osc = ctx.createOscillator();
          osc.type = p.wave;
          osc.frequency.value = midiToHz(midi);
          osc.detune.value = unison > 1 ? (u / (unison - 1) - 0.5) * 2 * p.detune : 0;
          osc.connect(env);
          osc.start(t0);
          osc.stop(end);
          nodes.push(osc);
          if (u === 0) osc.onended = () => finish(voice);
        }
      }

      const voice = { nodes, end };
      voices.add(voice);
    }

    function finish(voice) {
      if (!voices.has(voice)) return;
      voices.delete(voice);
      voice.nodes.forEach(n => n.disconnect());
    }

    function scheduleChord(chord, t0) {
      const dur = beat() * settings.beatsPerChord * chord.length;
      const t1 = t0 + dur;
      const { notes, bass } = voiceChord(chord, lastNotes, settings);
      lastNotes = notes;
      const human = () => 0.85 + Math.random() * 0.15;

      if (bass != null) playNote(bass, t0, t1, 0.9);

      switch (settings.pattern) {
        case 'bloom':
          // Notes drift in one at a time through the first half of the chord.
          notes.forEach((note, i) => playNote(note, t0 + (i === 0 ? 0 : Math.random() * dur * 0.5), t1, human()));
          break;
        case 'pulse': {
          const b = beat();
          for (let t = t0; t < t1 - 0.001; t += b) {
            notes.forEach(note => playNote(note, t, Math.min(t + b * 0.9, t1), human()));
          }
          break;
        }
        case 'arpeggio': {
          const step = beat() / 2;
          const order = notes.length > 2 ? notes.concat(notes.slice(1, -1).reverse()) : notes;
          let i = 0;
          for (let t = t0; t < t1 - 0.001; t += step, i++) {
            playNote(order[i % order.length], t, Math.min(t + step * 2, t1), human());
          }
          break;
        }
        default:
          // A light strum so the chord doesn't land as one block.
          notes.forEach((note, i) => playNote(note, t0 + i * 0.025, t1, human()));
      }
      return dur;
    }

    /** Schedule chords up to a time. Runs on a timer while playing. */
    function scheduleUntil(time) {
      if (!chords.length) return;
      while (nextTime < time) {
        if (index >= chords.length) index = 0;
        positions.push({ time: nextTime, index });
        nextTime += scheduleChord(chords[index], nextTime);
        index = (index + 1) % chords.length;
      }
      const now = ctx.currentTime;
      while (positions.length > 1 && positions[1].time <= now) positions.shift();
    }

    apply({ ...options });

    return {
      output,
      start() {
        this.stop();
        index = 0;
        lastNotes = null;
        positions = [];
        nextTime = ctx.currentTime + 0.05;
        scheduleUntil(ctx.currentTime + 0.5);
        timer = setInterval(() => scheduleUntil(ctx.currentTime + 0.5), 100);
      },
      stop() {
        clearInterval(timer);
        timer = null;
        positions = [];
        const now = ctx.currentTime;
        voices.forEach(v => {
          v.nodes.forEach(n => {
            if (n instanceof GainNode && n !== v.nodes[0]) {
              n.gain.cancelScheduledValues(now);
              n.gain.setTargetAtTime(0, now, 0.05);
            }
            if (n.stop) { try { n.stop(now + 0.3); } catch (e) { /* already stopped */ } }
          });
        });
      },
      set(opts) {
        apply(opts);
        notify();
      },
      scheduleUntil,
      /** Index of the chord sounding now, or -1. */
      position() {
        const now = ctx.currentTime;
        let current = -1;
        positions.forEach(p => { if (p.time <= now) current = p.index; });
        return current;
      },
      serialize() {
        const out = JSON.parse(JSON.stringify({ ...settings, sampler: { ...settings.sampler, samples: [] } }));
        // Blob samples can't be saved as JSON; keep their notes and labels.
        out.sampler.samples = settings.sampler.samples.map(({ key, src, ...rest }) => ({
          ...rest,
          src: typeof src === 'string' && !src.startsWith('blob:') ? src : null
        }));
        return { type: 'chords', ...out };
      },
      describe() {
        const sampleState = settings.sampler.samples.map(s => {
          const b = buffers.get(s.key);
          return { ...s, src: undefined, loaded: b instanceof AudioBuffer, failed: b instanceof Error };
        });
        return {
          type: 'chords',
          label: chords.map(c => c.name).join(' '),
          loaded: true,
          error: error || (settings.instrument === 'sampler' && !samples().length
            ? 'Add samples to hear the sampled instrument.' : null),
          chords: chords.map(c => ({ name: c.name, token: c.token, length: c.length })),
          settings: JSON.parse(JSON.stringify({ ...settings, sampler: { ...settings.sampler, samples: [] } })),
          samples: sampleState
        };
      },
      dispose() {
        this.stop();
        tone.disconnect();
        output.disconnect();
      }
    };
  }

  const AmbientChords = {
    MODES,
    PRESETS,
    DEFAULTS,
    NOTE_NAMES: SHARP_NAMES,
    FLAT_NAMES,
    pitchClass,
    noteFromName,
    noteName,
    parseChord,
    parseProgression,
    voiceChord,
    keyPrefersFlats
  };

  const Mixer = root.AmbientMixer || (typeof require === 'function' ? safeRequire('./ambient-mixer.js') : null);
  if (Mixer) Mixer.registerSource('chords', chordsSource);

  function safeRequire(path) {
    try {
      return require(path);
    } catch (e) {
      return null;
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = AmbientChords;
  }
  if (typeof window !== 'undefined') {
    window.AmbientChords = AmbientChords;
  }
})(typeof window !== 'undefined' ? window : globalThis);
