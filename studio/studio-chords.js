/**
 * Ambient Studio: chord progression tracks.
 */
(function () {
  'use strict';

  const { mixer, state, render, h, toast, attempt, drawerTabs, addButtons, uniqueName } = window.studio;
  const Chords = window.AmbientChords;

  const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const PATTERNS = {
    sustain: 'Held',
    bloom: 'Bloom',
    pulse: 'Pulse',
    arpeggio: 'Arpeggio'
  };
  const SPREADS = { close: 'Close', open: 'Open', wide: 'Wide' };
  const WAVES = { sine: 'Sine', triangle: 'Triangle', sawtooth: 'Saw', square: 'Square' };

  function addChordTrack() {
    const name = uniqueName('Chords');
    if (attempt(() => mixer.addTrack(name, { type: 'chords' }, { volume: 0.45 }))) {
      mixer.addEffect(name, 'reverb', { size: 6, decay: 3, mix: 0.4 });
      state.selected = name;
      state.tab = 'chords';
      render.drawer();
    }
  }

  addButtons.push({ label: 'Chord progression', run: addChordTrack });

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------

  function update(name, opts) {
    mixer.updateTrackSource(name, opts);
  }

  function segmented(label, options, value, onPick) {
    return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
      Object.entries(options).map(([key, text]) => h('button', {
        type: 'button',
        'aria-pressed': String(key === value),
        onclick: (e) => {
          e.currentTarget.parentNode.querySelectorAll('button').forEach(b => {
            b.setAttribute('aria-pressed', String(b === e.currentTarget));
          });
          onPick(key);
        }
      }, text)));
  }

  /** A labelled slider. spec: { label, min, max, step, log, format } */
  function slider(spec, value, onChange) {
    const toPos = (v) => (spec.log
      ? Math.log(v / spec.min) / Math.log(spec.max / spec.min) * 1000
      : (v - spec.min) / (spec.max - spec.min) * 1000);
    const fromPos = (p) => {
      let v = spec.log ? spec.min * Math.pow(spec.max / spec.min, p / 1000) : spec.min + (p / 1000) * (spec.max - spec.min);
      if (spec.step) v = Math.round(v / spec.step) * spec.step;
      return Number(v.toPrecision(4));
    };
    const readout = h('output', { class: 'fx-param-value' }, spec.format(value));
    const input = h('input', {
      type: 'range',
      min: 0,
      max: 1000,
      value: Math.round(toPos(value)),
      'aria-label': spec.label,
      oninput: () => {
        const v = fromPos(Number(input.value));
        readout.textContent = spec.format(v);
        onChange(v);
      }
    });
    return h('label', { class: 'fx-param' }, h('span', { class: 'fx-param-label' }, spec.label), readout, input);
  }

  const seconds = (v) => (v < 1 ? `${Math.round(v * 1000)} ms` : `${v.toFixed(1)} s`);

  function noteOptions(selected) {
    const out = [];
    for (let m = 24; m <= 96; m++) {
      out.push(h('option', { value: m, selected: m === selected }, Chords.noteName(m, true)));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  function renderChordsPanel(name) {
    const info = mixer.getTrack(name).source;
    const s = info.settings;

    // Progression, key and mode
    const chips = h('ol', { class: 'chord-chips', 'aria-label': 'Chords' });
    const problem = h('p', { class: 'problem chord-problem', role: 'alert' });

    function showParse() {
      let parsed = null;
      try {
        parsed = Chords.parseProgression(progression.value, keySelect.value, modeSelect.value);
        problem.textContent = parsed.length ? '' : 'Type some chords to hear them.';
      } catch (err) {
        problem.textContent = `${err.message} The last working progression keeps playing.`;
      }
      if (parsed && parsed.length) {
        chips.replaceChildren(...parsed.map(c => h('li', {
          class: 'chord-chip',
          style: `flex-grow:${c.length}`,
          title: c.token
        }, c.name)));
      }
      return parsed;
    }

    let typingTimer = null;
    const progression = h('input', {
      type: 'text',
      class: 'chord-input',
      value: s.progression,
      spellcheck: false,
      autocomplete: 'off',
      'aria-label': 'Progression',
      oninput: () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          if (showParse()) update(name, { progression: progression.value });
        }, 250);
      }
    });

    const keySelect = h('select', {
      'aria-label': 'Key',
      onchange: () => { update(name, { key: keySelect.value }); showParse(); }
    }, KEYS.map(k => h('option', { value: k, selected: Chords.pitchClass(k) === Chords.pitchClass(s.key) }, k)));

    const modeSelect = h('select', {
      'aria-label': 'Mode',
      onchange: () => { update(name, { mode: modeSelect.value }); showParse(); }
    }, Object.entries(Chords.MODES).map(([k, m]) => h('option', { value: k, selected: k === s.mode }, m.label)));

    const preset = h('select', {
      'aria-label': 'Start from a preset',
      onchange: () => {
        const p = Chords.PRESETS[Number(preset.value)];
        if (!p) return;
        update(name, { key: p.key, mode: p.mode, progression: p.progression });
        render.drawer();
        toast(`Loaded “${p.name}”: ${p.progression} in ${p.key} ${Chords.MODES[p.mode].label.toLowerCase()}.`);
      }
    },
    h('option', { value: '' }, 'Start from a preset…'),
    Chords.PRESETS.map((p, i) => h('option', { value: i }, `${p.name} (${p.progression})`)));

    showParse();

    const harmony = h('section', { class: 'chord-section chord-harmony' },
      h('h3', {}, 'Progression'),
      h('div', { class: 'row' },
        h('label', { class: 'chord-field' }, 'Key', keySelect),
        h('label', { class: 'chord-field' }, 'Mode', modeSelect),
        preset),
      progression,
      problem,
      chips,
      h('p', { class: 'chord-help' },
        'Use Roman numerals that follow the key, like ', h('code', {}, 'i VI III VII'),
        ', or chord names like ', h('code', {}, 'Am F C G'),
        '. Add 7, maj7, sus2, sus4, add9, ° or a bass note (', h('code', {}, 'G/B'),
        '). ', h('code', {}, 'Am:2'), ' holds a chord twice as long. Edits take effect from the next chord.'));

    // Timing and pattern
    const timing = h('section', { class: 'chord-section' },
      h('h3', {}, 'Rhythm'),
      slider({ label: 'Tempo', min: 20, max: 160, step: 1, format: v => `${v} bpm` }, s.bpm,
        v => update(name, { bpm: v })),
      slider({ label: 'Chord length', min: 1, max: 32, step: 1, format: v => `${v} beat${v === 1 ? '' : 's'}` }, s.beatsPerChord,
        v => update(name, { beatsPerChord: v })),
      h('div', { class: 'fx-param' },
        h('span', { class: 'fx-param-label' }, 'Pattern'),
        segmented('Pattern', PATTERNS, s.pattern, v => update(name, { pattern: v }))));

    // Voicing
    const voicing = h('section', { class: 'chord-section' },
      h('h3', {}, 'Voicing'),
      slider({ label: 'Register', min: 1, max: 5, step: 1, format: v => `Octave ${v}` }, s.octave,
        v => update(name, { octave: v })),
      h('div', { class: 'fx-param' },
        h('span', { class: 'fx-param-label' }, 'Spread'),
        segmented('Spread', SPREADS, s.spread, v => update(name, { spread: v }))),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.voiceLeading, onchange: e => update(name, { voiceLeading: e.target.checked }) }),
        ' Smooth voice leading'),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.bass, onchange: e => update(name, { bass: e.target.checked }) }),
        ' Bass note'));

    // Instrument
    const instrument = h('section', { class: 'chord-section' },
      h('h3', {}, 'Instrument'),
      segmented('Instrument', { pad: 'Synth pad', sampler: 'Samples' }, s.instrument, v => {
        update(name, { instrument: v });
        render.drawer();
      }),
      s.instrument === 'pad' ? renderPad(name, s.pad) : renderSampler(name, info));

    return h('div', { class: 'chords-panel', 'data-track': name }, harmony, timing, voicing, instrument);
  }

  function renderPad(name, p) {
    const set = (key) => (v) => update(name, { pad: { [key]: v } });
    return h('div', { class: 'fx-params' },
      h('div', { class: 'fx-param' },
        h('span', { class: 'fx-param-label' }, 'Wave'),
        segmented('Wave', WAVES, p.wave, set('wave'))),
      slider({ label: 'Warmth', min: 200, max: 12000, log: true, format: v => (v >= 1000 ? `${(v / 1000).toFixed(1)} kHz` : `${Math.round(v)} Hz`) }, p.warmth, set('warmth')),
      slider({ label: 'Voices per note', min: 1, max: 4, step: 1, format: v => String(v) }, p.unison, set('unison')),
      slider({ label: 'Detune', min: 0, max: 40, step: 1, format: v => `${v} cents` }, p.detune, set('detune')),
      slider({ label: 'Fade in', min: 0.01, max: 8, log: true, format: seconds }, p.attack, set('attack')),
      slider({ label: 'Fade out', min: 0.05, max: 12, log: true, format: seconds }, p.release, set('release')));
  }

  function renderSampler(name, info) {
    const s = info.settings.sampler;
    const samples = info.samples;
    const setSamples = (list) => {
      update(name, { sampler: { samples: list } });
      render.drawer();
    };

    const fileInput = h('input', {
      type: 'file',
      accept: 'audio/*',
      multiple: true,
      hidden: true,
      onchange: (e) => {
        const list = samples.slice();
        [...e.target.files].forEach(file => {
          const sample = { src: file, label: file.name, fileId: window.studio.storeFile(file) };
          // A file chosen again for a saved sample replaces it, keeping its pitch.
          const missing = list.findIndex(x => x.key.startsWith('missing') && x.label === file.name);
          if (missing >= 0) list[missing] = { ...list[missing], ...sample, key: undefined };
          else list.push({ ...sample, note: Chords.noteFromName(file.name) ?? 60 });
        });
        e.target.value = '';
        setSamples(list);
      }
    });

    const rows = samples.map((sample, i) => {
      const missing = sample.key.startsWith('missing');
      const status = sample.failed ? ' (could not be loaded)' : missing ? ' (choose the file again)' : !sample.loaded ? ' (loading…)' : '';
      return h('li', { class: 'sample-row' },
        h('span', { class: `sample-name${sample.failed || missing ? ' problem' : ''}`, title: sample.label },
          sample.label || 'Sample', status),
        h('select', {
          'aria-label': `Pitch of ${sample.label || 'sample'}`,
          onchange: (e) => setSamples(samples.map((x, j) => (j === i ? { ...x, note: Number(e.target.value) } : x)))
        }, noteOptions(sample.note)),
      h('button', {
        type: 'button', class: 'quiet', 'aria-label': `Remove ${sample.label || 'sample'}`,
        onclick: () => setSamples(samples.filter((_, j) => j !== i))
      }, '×'));
    });

    const set = (key) => (v) => update(name, { sampler: { [key]: v } });
    return h('div', { class: 'fx-params' },
      h('p', { class: 'chord-help' }, 'Add one or more recordings of single notes, such as a piano key or a bowed string. Each chord note uses the closest sample, shifted in pitch. A note in the file name (piano-C4.wav) sets its pitch.'),
      samples.length ? h('ul', { class: 'sample-list' }, rows) : null,
      h('div', { class: 'row' }, fileInput,
        h('button', { type: 'button', onclick: () => fileInput.click() }, 'Add samples')),
      slider({ label: 'Fade in', min: 0.005, max: 8, log: true, format: seconds }, s.attack, set('attack')),
      slider({ label: 'Fade out', min: 0.05, max: 12, log: true, format: seconds }, s.release, set('release')),
      h('label', { class: 'check' },
        h('input', { type: 'checkbox', checked: s.loop, onchange: e => update(name, { sampler: { loop: e.target.checked } }) }),
        ' Loop samples so long chords keep sounding'));
  }

  drawerTabs.unshift({
    id: 'chords',
    label: 'Chords',
    show: (name) => name !== AmbientMixer.MASTER && mixer.getTrack(name).source.type === 'chords',
    render: renderChordsPanel
  });

  // Light up the chord that is sounding now.
  function tick() {
    const panel = document.querySelector('.chords-panel');
    if (panel && mixer.hasTrack(panel.dataset.track)) {
      const index = mixer.getIsPlaying() ? mixer.getSource(panel.dataset.track).position() : -1;
      panel.querySelectorAll('.chord-chip').forEach((chip, i) => chip.classList.toggle('now', i === index));
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  render.strips();
  render.drawer();
})();
