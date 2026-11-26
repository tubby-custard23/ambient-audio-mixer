/**
 * Ambient Studio: chord progression tracks.
 */
(function () {
  'use strict';

  const { mixer, render, toast, attempt, drawerTabs, addButtons, uniqueName, newTrackMeta } = window.studio;
  const { h, icon, fmt, knob, segmented, toggle, popover, closePopover, menu } = window.ui;
  const Chords = window.AmbientChords;
  const state = window.studio.state;

  const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  // What each chord does in the key, shown as a colour on its block.
  const FUNCTIONS = {
    tonic: { label: 'Stable', color: '#3dff8f' },
    predominant: { label: 'Moving', color: '#36c5ff' },
    dominant: { label: 'Tension', color: '#ff9a2e' },
    color: { label: 'Outside the key', color: '#ff3d9a' }
  };

  const PATTERNS = [['sustain', 'Held'], ['bloom', 'Bloom'], ['pulse', 'Pulse'], ['arpeggio', 'Arpeggio']];
  const SPREADS = [['close', 'Close'], ['open', 'Open'], ['wide', 'Wide']];
  const WAVES = [['sine', 'Sine', 'sine'], ['triangle', 'Triangle', 'triangle'], ['sawtooth', 'Saw', 'sawtooth'], ['square', 'Square', 'square']];
  const LENGTHS = [[0.5, '½'], [1, '1'], [2, '2'], [3, '3'], [4, '4']];

  function addChordTrack() {
    const name = uniqueName('Chords');
    if (attempt(() => mixer.addTrack(name, { type: 'chords' }, { volume: 0.45, meta: newTrackMeta() }))) {
      mixer.addEffect(name, 'reverb', { size: 6, decay: 3, mix: 0.4 });
      state.selected = name;
      state.tab = 'chords';
      render.drawer();
    }
  }

  addButtons.push({ id: 'chords', label: 'Chord progression', hint: 'A synth pad or your own samples', icon: 'keys', run: addChordTrack });

  function update(name, opts) {
    mixer.updateTrackSource(name, opts);
  }

  function modeLabel(mode) {
    return (Chords.MODES[mode] || Chords.MODES.major).label.toLowerCase();
  }

  function safeDescribe(token, key, mode) {
    try {
      return Chords.describeChord(token, key, mode);
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Chord timeline
  // ---------------------------------------------------------------------------

  function renderTimeline(name, s) {
    const tokens = Chords.tokenize(s.progression);
    const setTokens = (list) => {
      update(name, { progression: list.join(' ') });
      render.drawer();
    };

    const blocks = tokens.map((token, i) => {
      const info = safeDescribe(token, s.key, s.mode);
      const length = Number((/:(\d*\.?\d+)$/.exec(token) || [])[1] || 1);
      const fn = info ? FUNCTIONS[info.fn] : null;
      const block = h('button', {
        type: 'button',
        class: `chord-block${info ? '' : ' invalid'}`,
        'data-index': i,
        style: `flex-grow:${length};${fn ? `--fn:${fn.color}` : ''}`,
        'aria-haspopup': 'true',
        'aria-expanded': 'false',
        'aria-label': info ? `${info.name}, ${info.numeral}, ${fn.label}. Edit chord` : `${token}, not a chord. Edit`,
        onclick: () => popover(block, chordEditor(name, s, tokens, i, setTokens), { label: 'Edit chord', className: 'popover-wide' })
      },
      h('span', { class: 'cb-top' },
        h('span', { class: 'cb-numeral' }, info ? info.numeral : '?'),
        length !== 1 ? h('span', { class: 'cb-length' }, `×${length === 0.5 ? '½' : length}`) : null),
      h('span', { class: 'cb-name' }, info ? info.name : token),
      h('span', { class: 'cb-role' }, info ? info.role : 'Not a chord'));
      return block;
    });

    const addBtn = h('button', {
      type: 'button',
      class: 'chord-add',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onclick: () => popover(addBtn, chordPalette(s, tokens[tokens.length - 1] || null, (token) => setTokens(tokens.concat(token))),
        { label: 'Add a chord', className: 'popover-wide', align: 'end' })
    }, icon('plus', 18), h('span', {}, 'Add chord'));

    return h('div', { class: 'timeline', role: 'list', 'aria-label': 'Progression' },
      blocks.length ? blocks : h('p', { class: 'hint timeline-empty' }, 'No chords yet. Add one, or pick a progression idea.'),
      addBtn);
  }

  /** A menu of chords to add: suggestions, the key's chords, outside chords. */
  function chordPalette(s, previous, onPick) {
    const pal = Chords.chordPalette(s.key, s.mode);
    const prevInfo = previous ? safeDescribe(previous, s.key, s.mode) : null;
    const item = (c, hint) => ({
      label: c.name,
      hint,
      tag: c.token,
      swatch: FUNCTIONS[c.fn].color,
      onSelect: () => onPick(c.token)
    });
    return menu([
      { heading: prevInfo ? `Suggested after ${prevInfo.name}` : 'Suggested to start' },
      ...Chords.suggestNext(previous, s.key, s.mode).map(c => item(c, c.why)),
      { separator: true },
      { heading: `In ${s.key} ${modeLabel(s.mode)}` },
      ...pal.inKey.map(c => item(c, c.role)),
      { separator: true },
      { heading: 'Outside the key' },
      ...pal.color.map(c => item(c, c.role))
    ], { label: 'Add a chord', className: 'menu-chords' });
  }

  /** The editor shown when a chord block is clicked. */
  function chordEditor(name, s, tokens, index, setTokens) {
    const token = tokens[index];
    const info = safeDescribe(token, s.key, s.mode);
    const replace = (next) => {
      closePopover();
      setTokens(tokens.map((t, i) => (i === index ? next : t)));
    };
    const length = Number((/:(\d*\.?\d+)$/.exec(token) || [])[1] || 1);

    const variants = Chords.chordVariants(token, s.key, s.mode);
    const previous = index > 0 ? tokens[index - 1] : null;
    const swaps = Chords.suggestNext(previous, s.key, s.mode)
      .filter(c => !info || c.name !== info.name)
      .map(c => ({ label: c.name, hint: c.why, tag: c.token, swatch: FUNCTIONS[c.fn].color, onSelect: () => replace(Chords.withLength(c.token, length)) }));

    const move = (dir) => {
      const list = tokens.slice();
      [list[index], list[index + dir]] = [list[index + dir], list[index]];
      closePopover();
      setTokens(list);
    };

    return h('div', { class: 'chord-editor' },
      h('header', { class: 'ce-head', style: info ? `--fn:${FUNCTIONS[info.fn].color}` : '' },
        h('span', { class: 'ce-name' }, info ? info.name : token),
        h('span', { class: 'ce-numeral' }, info ? info.numeral : ''),
        h('span', { class: 'ce-role' }, info ? `${FUNCTIONS[info.fn].label}. ${info.role}` : 'This isn’t a chord the parser understands.')),
      variants.length ? h('section', { class: 'ce-section' },
        h('p', { class: 'menu-heading' }, 'Flavour'),
        h('div', { class: 'ce-variants' }, variants.map(v => h('button', {
          type: 'button',
          class: 'ce-variant',
          'aria-pressed': String(v.token === token),
          title: v.why,
          onclick: () => replace(v.token)
        }, h('span', { class: 'ce-variant-name' }, v.name), h('span', { class: 'ce-variant-why' }, v.why))))) : null,
      h('section', { class: 'ce-section' },
        h('p', { class: 'menu-heading' }, 'Length in chords'),
        segmented('Chord length', LENGTHS, length, (v) => replace(Chords.withLength(token, v)), 'segmented-small')),
      swaps.length ? h('section', { class: 'ce-section' },
        h('p', { class: 'menu-heading' }, previous ? 'Swap for something that follows the chord before' : 'Swap for an opening chord'),
        menu(swaps.slice(0, 5), { label: 'Swap chord' })) : null,
      h('footer', { class: 'ce-actions' },
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', disabled: index === 0, onclick: () => move(-1) }, icon('chevronLeft', 14), 'Earlier'),
        h('button', { type: 'button', class: 'btn btn-small btn-ghost', disabled: index === tokens.length - 1, onclick: () => move(1) }, 'Later', icon('chevronRight', 14)),
        h('span', { class: 'spacer' }),
        h('button', {
          type: 'button',
          class: 'btn btn-small btn-danger-ghost',
          onclick: () => {
            closePopover();
            setTokens(tokens.filter((_, i) => i !== index));
          }
        }, icon('trash', 14), 'Remove')));
  }

  function ideasMenu(name) {
    const items = [];
    Chords.MOODS.forEach(mood => {
      items.push({ heading: mood });
      Chords.PRESETS.filter(p => p.mood === mood).forEach(p => {
        let names = '';
        try {
          names = Chords.parseProgression(p.progression, p.key, p.mode).map(c => c.name).join(' ');
        } catch (e) { /* every preset parses; see tests */ }
        items.push({
          label: p.name,
          hint: p.about,
          tag: names,
          onSelect: () => {
            update(name, { key: p.key, mode: p.mode, progression: p.progression });
            render.drawer();
            toast(`Loaded “${p.name}”: ${p.progression} in ${p.key} ${modeLabel(p.mode)}.`);
          }
        });
      });
    });
    return menu(items, { label: 'Progression ideas', className: 'menu-ideas' });
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  function renderChordsPanel(name) {
    const info = mixer.getTrack(name).source;
    const s = info.settings;

    const keySelect = h('select', {
      class: 'field select',
      'aria-label': 'Key',
      onchange: () => { update(name, { key: keySelect.value }); render.drawer(); }
    }, KEYS.map(k => h('option', { value: k, selected: Chords.pitchClass(k) === Chords.pitchClass(s.key) }, k)));

    const modeSelect = h('select', {
      class: 'field select',
      'aria-label': 'Mode',
      onchange: () => { update(name, { mode: modeSelect.value }); render.drawer(); }
    }, Object.entries(Chords.MODES).map(([k, m]) => h('option', { value: k, selected: k === s.mode }, m.label)));

    const ideasBtn = h('button', {
      type: 'button',
      class: 'btn',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onclick: () => popover(ideasBtn, ideasMenu(name), { label: 'Progression ideas', className: 'popover-wide' })
    }, icon('book', 14), 'Progression ideas', icon('chevronDown', 14));

    // Text editing for people who'd rather type
    const problem = h('p', { class: 'text-problem', role: 'alert' });
    let typingTimer = null;
    const text = h('input', {
      type: 'text',
      class: 'field mono progression-text',
      value: s.progression,
      spellcheck: false,
      autocomplete: 'off',
      'aria-label': 'Progression as text',
      oninput: () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
          try {
            const parsed = Chords.parseProgression(text.value, s.key, s.mode);
            problem.textContent = parsed.length ? '' : 'Type some chords to hear them.';
            if (!parsed.length) return;
            update(name, { progression: text.value });
            const fresh = renderTimeline(name, { ...s, progression: text.value });
            panel.querySelector('.timeline').replaceWith(fresh);
          } catch (err) {
            problem.textContent = `${err.message} The last working progression keeps playing.`;
          }
        }, 300);
      }
    });

    const legend = h('ul', { class: 'legend', 'aria-label': 'Chord colours' },
      Object.values(FUNCTIONS).map(f => h('li', { style: `--fn:${f.color}` }, f.label)));

    const harmony = h('section', { class: 'chords-harmony' },
      h('div', { class: 'toolbar' },
        h('label', { class: 'field-label' }, h('span', {}, 'Key'), keySelect),
        h('label', { class: 'field-label' }, h('span', {}, 'Mode'), modeSelect),
        ideasBtn,
        h('span', { class: 'spacer' }),
        legend),
      renderTimeline(name, s),
      h('div', { class: 'text-row' },
        h('label', { class: 'text-label', for: `progression-${name}` }, 'As text'),
        text,
        h('span', { class: 'hint text-help', title: 'Roman numerals follow the key; chord names are absolute.' },
          'Numerals like i VI III VII or names like Am F C G. Am:2 holds a chord twice as long.')),
      problem);
    text.id = `progression-${name}`;

    const k = (opts) => knob(opts).el;

    const rhythm = h('section', { class: 'panel-card' },
      h('h3', { class: 'card-title' }, 'Rhythm'),
      h('div', { class: 'knob-row' },
        k({ label: 'Tempo', value: s.bpm, min: 20, max: 160, step: 1, default: 60, format: v => `${v}bpm`, onInput: v => update(name, { bpm: v }) }),
        k({ label: 'Chord length', value: s.beatsPerChord, min: 1, max: 32, step: 1, default: 8, format: v => `${v} beat${v === 1 ? '' : 's'}`, onInput: v => update(name, { beatsPerChord: v }) })),
      h('div', { class: 'control-row' },
        h('span', { class: 'control-label' }, 'Pattern'),
        segmented('Pattern', PATTERNS, s.pattern, v => update(name, { pattern: v }), 'segmented-small')));

    const voicing = h('section', { class: 'panel-card' },
      h('h3', { class: 'card-title' }, 'Voicing'),
      h('div', { class: 'knob-row' },
        k({ label: 'Register', value: s.octave, min: 1, max: 5, step: 1, default: 3, format: v => `Octave ${v}`, onInput: v => update(name, { octave: v }) })),
      h('div', { class: 'control-row' },
        h('span', { class: 'control-label' }, 'Spread'),
        segmented('Spread', SPREADS, s.spread, v => update(name, { spread: v }), 'segmented-small')),
      toggle('Smooth voice leading', s.voiceLeading, v => update(name, { voiceLeading: v })),
      toggle('Bass note', s.bass, v => update(name, { bass: v })));

    const instrument = h('section', { class: 'panel-card instrument-card' },
      h('h3', { class: 'card-title' }, 'Instrument'),
      segmented('Instrument', [['pad', 'Synth pad'], ['sampler', 'Samples']], s.instrument, v => {
        update(name, { instrument: v });
        render.drawer();
      }, 'segmented-small'),
      s.instrument === 'pad' ? renderPad(name, s.pad) : renderSampler(name, info));

    const panel = h('div', { class: 'chords-panel', 'data-track': name },
      harmony,
      h('div', { class: 'cards' }, rhythm, voicing, instrument));
    return panel;
  }

  function renderPad(name, p) {
    const set = (key) => (v) => update(name, { pad: { [key]: v } });
    return h('div', { class: 'instrument' },
      h('div', { class: 'control-row' },
        h('span', { class: 'control-label' }, 'Wave'),
        segmented('Wave', WAVES, p.wave, set('wave'), 'segmented-icons')),
      h('div', { class: 'knob-row' },
        knob({ label: 'Warmth', value: p.warmth, min: 200, max: 12000, log: true, default: 1400, format: v => `${fmt.hz(v)}Hz`, onInput: set('warmth') }).el,
        knob({ label: 'Voices', value: p.unison, min: 1, max: 4, step: 1, default: 2, format: v => String(v), onInput: set('unison') }).el,
        knob({ label: 'Detune', value: p.detune, min: 0, max: 40, step: 1, default: 12, format: v => `${v}ct`, onInput: set('detune') }).el,
        knob({ label: 'Fade in', value: p.attack, min: 0.01, max: 8, log: true, default: 2.5, format: fmt.seconds, onInput: set('attack') }).el,
        knob({ label: 'Fade out', value: p.release, min: 0.05, max: 12, log: true, default: 4, format: fmt.seconds, onInput: set('release') }).el));
  }

  function noteOptions(selected) {
    const out = [];
    for (let m = 24; m <= 96; m++) {
      out.push(h('option', { value: m, selected: m === selected }, Chords.noteName(m, true)));
    }
    return out;
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
      const status = sample.failed ? 'Could not be loaded' : missing ? 'Choose the file again' : !sample.loaded ? 'Loading…' : null;
      return h('li', { class: 'sample-row' },
        h('span', { class: `sample-name${sample.failed || missing ? ' problem' : ''}`, title: sample.label },
          sample.label || 'Sample', status ? h('small', {}, status) : null),
        h('select', {
          class: 'field select field-small',
          'aria-label': `Pitch of ${sample.label || 'sample'}`,
          onchange: (e) => setSamples(samples.map((x, j) => (j === i ? { ...x, note: Number(e.target.value) } : x)))
        }, noteOptions(sample.note)),
        h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `Remove ${sample.label || 'sample'}`, title: 'Remove',
          onclick: () => setSamples(samples.filter((_, j) => j !== i))
        }, icon('close', 14)));
    });

    const set = (key) => (v) => update(name, { sampler: { [key]: v } });
    return h('div', { class: 'instrument' },
      h('p', { class: 'hint' }, 'Add recordings of single notes, like a piano key or a bowed string. Each chord note uses the closest sample, shifted in pitch. A note in the file name (piano-C4.wav) sets its pitch.'),
      samples.length ? h('ul', { class: 'sample-list' }, rows) : null,
      h('div', { class: 'row' }, fileInput,
        h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click() }, icon('plus', 14), 'Add samples')),
      h('div', { class: 'knob-row' },
        knob({ label: 'Fade in', value: s.attack, min: 0.005, max: 8, log: true, default: 0.01, format: fmt.seconds, onInput: set('attack') }).el,
        knob({ label: 'Fade out', value: s.release, min: 0.05, max: 12, log: true, default: 1.5, format: fmt.seconds, onInput: set('release') }).el),
      toggle('Loop samples so long chords keep sounding', s.loop, v => update(name, { sampler: { loop: v } })));
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
      panel.querySelectorAll('.chord-block').forEach(block => {
        block.classList.toggle('now', Number(block.dataset.index) === index);
      });
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  render.strips();
  render.drawer();
})();
