/**
 * Ambient Studio
 * A mixing desk UI for AmbientMixer: add tracks, mix them, save moods.
 */
(function () {
  'use strict';

  const { h, icon, fmt, clamp, knob, fader, meter, toggle, popover, closePopover, menu, COLORS } = window.ui;
  const MASTER = AmbientMixer.MASTER;
  const MASTER_COLOR = '#e8ecf3';
  const mixer = new AmbientMixer({ autoMood: false, masterVolume: 0.8, fadeTime: 3 });

  const state = {
    selected: null,       // track name, or MASTER
    tab: null,            // detail panel tab
    moodEdited: false,    // faders moved since the current mood was applied
    confirmRemove: null   // track name awaiting a second click on Remove
  };

  const $ = (id) => document.getElementById(id);

  let toastTimer = null;
  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), isError ? 6500 : 3000);
  }

  /** Run a mixer call, showing its error message instead of throwing. */
  function attempt(fn) {
    try {
      fn();
      return true;
    } catch (err) {
      toast(err.message, true);
      return false;
    }
  }

  function uniqueName(base) {
    base = (base || 'Track').trim() || 'Track';
    if (!mixer.hasTrack(base) && base !== MASTER) return base;
    let n = 2;
    while (mixer.hasTrack(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  }

  // ---------------------------------------------------------------------------
  // Track colours
  // ---------------------------------------------------------------------------

  /** The first neon colour no track is using yet. */
  function nextColor() {
    const used = mixer.getTracks().map(t => t.meta.color);
    const free = COLORS.find(([, hex]) => !used.includes(hex));
    return (free || COLORS[mixer.getTracks().length % COLORS.length])[1];
  }

  /** Metadata for a new track, with its colour picked. */
  function newTrackMeta(extra) {
    return { color: nextColor(), ...extra };
  }

  function colorOf(name) {
    if (name === MASTER || !mixer.hasTrack(name)) return MASTER_COLOR;
    const tracks = mixer.getTracks();
    const info = tracks.find(t => t.name === name);
    return info.meta.color || COLORS[tracks.indexOf(info) % COLORS.length][1];
  }

  // ---------------------------------------------------------------------------
  // Adding tracks
  // ---------------------------------------------------------------------------

  function stripName(fileName) {
    return fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  }

  function isAudioFile(file) {
    return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(file.name);
  }

  /** A saved track whose audio file is missing and has this file's name. */
  function trackMissing(fileName) {
    return mixer.getTracks().find(t => t.source.type === 'audio' && !t.source.loaded && t.meta.fileName === fileName);
  }

  function relinkFile(name, file) {
    mixer.updateTrackSource(name, { src: file, label: file.name });
    mixer.setTrackMeta(name, { fileName: file.name, fileId: window.studio.storeFile(file) });
  }

  function addFiles(files) {
    let added = 0;
    [...files].forEach(file => {
      if (!isAudioFile(file)) {
        toast(`“${file.name}” isn't an audio file.`, true);
        return;
      }
      const missing = trackMissing(file.name);
      if (missing) {
        relinkFile(missing.name, file);
        toast(`Reconnected “${file.name}” to ${missing.name}.`);
        return;
      }
      const name = uniqueName(stripName(file.name));
      const meta = newTrackMeta({ fileName: file.name, fileId: window.studio.storeFile(file) });
      if (attempt(() => mixer.addTrack(name, file, { volume: 0.5, meta }))) {
        added++;
        state.selected = name;
      }
    });
    if (added) render.drawer();
    return added;
  }

  function addUrl(url) {
    url = url.trim();
    if (!url) return false;
    let base = 'Track';
    try {
      base = stripName(decodeURIComponent(new URL(url, location.href).pathname.split('/').pop())) || base;
    } catch (e) {
      toast('That URL is not valid. Paste a full link to an audio file.', true);
      return false;
    }
    const name = uniqueName(base);
    if (!attempt(() => mixer.addTrack(name, url, { volume: 0.5, meta: newTrackMeta() }))) return false;
    state.selected = name;
    render.drawer();
    return true;
  }

  const NOISE_NAMES = { white: 'White noise', pink: 'Pink noise', brown: 'Brown noise' };

  function addNoise(color) {
    const name = uniqueName(NOISE_NAMES[color]);
    if (attempt(() => mixer.addTrack(name, { type: 'noise', color }, { volume: 0.4, meta: newTrackMeta() }))) {
      state.selected = name;
      render.drawer();
    }
  }

  /** A starting point that needs no audio files. */
  function addNoiseBed() {
    const wind = uniqueName('Wind');
    mixer.addTrack(wind, { type: 'noise', color: 'brown' }, { volume: 0.55, pan: -0.2, meta: newTrackMeta() });
    mixer.addEffect(wind, 'filter', { frequency: 420, q: 1.2, lfoRate: 0.04, lfoDepth: 0.55 });
    const rain = uniqueName('Rain');
    mixer.addTrack(rain, { type: 'noise', color: 'pink' }, { volume: 0.18, pan: 0.15, meta: newTrackMeta() });
    mixer.addEffect(rain, 'filter', { mode: 'highpass', frequency: 1100, q: 0.5 });
    if (!mixer.getEffects(MASTER).some(fx => fx.type === 'reverb')) {
      mixer.addEffect(MASTER, 'reverb', { size: 5, decay: 3, mix: 0.25 });
    }
    state.selected = wind;
    render.drawer();
  }

  function chooseFiles() {
    $('file-input').click();
  }

  $('file-input').addEventListener('change', (e) => {
    addFiles(e.target.files);
    e.target.value = '';
  });

  function urlForm() {
    const input = h('input', { type: 'url', class: 'field', placeholder: 'https://…/rain.mp3', 'aria-label': 'Audio URL', required: true, autofocus: true });
    return h('form', {
      class: 'url-form',
      onsubmit: (e) => {
        e.preventDefault();
        if (addUrl(input.value)) closePopover();
      }
    },
    h('p', { class: 'popover-title' }, 'Add audio from a URL'),
    input,
    h('p', { class: 'popover-note' }, 'The server must allow playback from other sites.'),
    h('div', { class: 'row end' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Add track')));
  }

  /** Extra ways to add a track, registered by other studio scripts. */
  const addButtons = [];

  function addMenuItems(anchor) {
    return [
      { label: 'Audio files…', hint: 'Or drop them anywhere on the page', icon: 'file', onSelect: chooseFiles },
      { label: 'Audio from a URL…', icon: 'link', onSelect: () => requestAnimationFrame(() => popover(anchor, urlForm(), { label: 'Add audio from a URL' })) },
      ...addButtons.map(b => ({ label: b.label, hint: b.hint, icon: b.icon, onSelect: b.run })),
      { separator: true },
      { heading: 'Generated noise' },
      { label: 'White noise', hint: 'Bright hiss', icon: 'noise', onSelect: () => addNoise('white') },
      { label: 'Pink noise', hint: 'Soft, like rain', icon: 'noise', onSelect: () => addNoise('pink') },
      { label: 'Brown noise', hint: 'Deep rumble, like wind or surf', icon: 'noise', onSelect: () => addNoise('brown') },
      { label: 'Wind and rain bed', hint: 'Two shaped noise tracks with reverb', icon: 'wind', onSelect: addNoiseBed }
    ];
  }

  // ---------------------------------------------------------------------------
  // Channel strips
  // ---------------------------------------------------------------------------

  const strips = new Map(); // name -> refs

  function sourceInfo(info) {
    const src = info.source;
    if (src.error) return { text: src.error, problem: true, icon: 'file' };
    if (src.type === 'audio' && !src.loaded) return { text: 'No audio loaded', problem: true, icon: 'file' };
    const icons = { audio: 'file', noise: 'noise', chords: 'keys' };
    return { text: src.label || src.type, problem: false, icon: icons[src.type] || 'file' };
  }

  function buildStrip(name) {
    const isMaster = name === MASTER;
    const refs = { name };
    const label = isMaster ? 'Master' : name;

    refs.nameBtn = h('button', {
      class: 'strip-name',
      type: 'button',
      title: `${label}: show settings`,
      'aria-pressed': 'false',
      onclick: () => select(name)
    }, label);
    refs.source = h('span', { class: 'strip-source' });

    refs.meter = meter();
    refs.fader = fader({
      label: `${label} volume`,
      value: isMaster ? mixer.getMasterVolume() : mixer.getTrack(name).volume,
      default: isMaster ? 1 : 0.5,
      onInput: (v) => {
        if (isMaster) {
          mixer.setMasterVolume(v);
          return;
        }
        mixer.setTrackVolume(name, v);
        if (mixer.getCurrentMood() && !state.moodEdited) {
          state.moodEdited = true;
          renderMoods();
        }
      }
    });
    refs.db = h('output', { class: 'strip-db' });

    const head = h('header', { class: 'strip-head' }, refs.nameBtn, refs.source);
    const level = h('div', { class: 'strip-level' }, refs.meter.el, refs.fader.el);
    const children = [h('div', { class: 'strip-color', 'aria-hidden': 'true' }), head];

    if (isMaster) {
      children.push(h('div', { class: 'strip-pan strip-pan-empty' }), level, refs.db,
        h('div', { class: 'strip-buttons' }, h('span', { class: 'strip-out' }, 'Stereo out')));
    } else {
      refs.pan = knob({
        label: 'Pan',
        value: mixer.getTrack(name).pan,
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        bipolar: true,
        size: 'small',
        format: fmt.pan,
        onInput: (v) => mixer.setTrackPan(name, v)
      });
      refs.mute = h('button', {
        class: 'mute', type: 'button', title: 'Mute', 'aria-label': `Mute ${name}`,
        onclick: () => mixer.setTrackMute(name, !mixer.getTrack(name).mute)
      }, 'M');
      refs.solo = h('button', {
        class: 'solo', type: 'button', title: 'Solo', 'aria-label': `Solo ${name}`,
        onclick: () => mixer.setTrackSolo(name, !mixer.getTrack(name).solo)
      }, 'S');
      children.push(h('div', { class: 'strip-pan' }, refs.pan.el), level, refs.db,
        h('div', { class: 'strip-buttons' }, refs.mute, refs.solo));
    }

    refs.el = h('section', {
      class: `strip${isMaster ? ' master' : ''}`,
      'aria-label': isMaster ? 'Master' : `${name} channel`
    }, children);
    strips.set(name, refs);
    updateStrip(name);
    return refs.el;
  }

  function updateStrip(name) {
    const refs = strips.get(name);
    if (!refs) return;
    const selected = state.selected === name;
    refs.el.classList.toggle('selected', selected);
    refs.el.style.setProperty('--c', colorOf(name));
    refs.nameBtn.setAttribute('aria-pressed', String(selected));

    if (name === MASTER) {
      const v = mixer.getMasterVolume();
      refs.fader.set(v);
      refs.db.textContent = fmt.db(v);
      const n = mixer.getTracks().length;
      refs.source.replaceChildren(`${n} track${n === 1 ? '' : 's'}`);
      return;
    }

    const info = mixer.getTrack(name);
    const anySolo = mixer.getTracks().some(t => t.solo);
    refs.fader.set(info.volume);
    refs.db.textContent = fmt.db(info.volume);
    refs.pan.set(info.pan);
    refs.mute.setAttribute('aria-pressed', String(info.mute));
    refs.solo.setAttribute('aria-pressed', String(info.solo));
    refs.el.classList.toggle('silenced', info.mute || (anySolo && !info.solo));
    const src = sourceInfo(info);
    refs.source.replaceChildren(icon(src.icon, 12), h('span', {}, src.text));
    refs.source.title = src.text;
    refs.source.classList.toggle('problem', src.problem);
  }

  function renderStrips() {
    closePopover();
    const container = $('strips');
    container.replaceChildren();
    [...strips.keys()].forEach(key => { if (key !== MASTER) strips.delete(key); });

    const tracks = mixer.getTracks();
    $('console').classList.toggle('is-empty', !tracks.length);
    if (!tracks.length) {
      container.append(renderEmpty());
      return;
    }
    tracks.forEach(t => container.append(buildStrip(t.name)));
    const addBtn = h('button', {
      type: 'button',
      class: 'add-strip',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onclick: () => popover(addBtn, menu(addMenuItems(addBtn), { label: 'Add a track' }), { label: 'Add a track' })
    }, icon('plus', 22), h('span', {}, 'Add track'));
    container.append(addBtn);
  }

  function renderEmpty() {
    const card = (iconName, color, title, text, run) => h('button', {
      type: 'button',
      class: 'start-card',
      style: `--c:${color}`,
      onclick: run
    }, h('span', { class: 'start-icon' }, icon(iconName, 22)),
    h('span', { class: 'start-title' }, title),
    h('span', { class: 'start-text' }, text));

    const chordButton = addButtons.find(b => b.id === 'chords');
    return h('div', { class: 'empty' },
      h('h2', {}, 'Start a soundscape'),
      h('p', {}, 'Layer recordings, generated noise and slow chord progressions, then shape them with effects. Drop audio files anywhere on the page to add them.'),
      h('div', { class: 'start-cards' },
        card('wind', COLORS[0][1], 'Wind and rain bed', 'Filtered noise that needs no files', addNoiseBed),
        chordButton ? card('keys', COLORS[2][1], 'Chord progression', 'A synth pad playing chords you choose', chordButton.run) : null,
        card('file', COLORS[3][1], 'Audio files', 'Your own recordings and loops', chooseFiles)),
      h('button', {
        type: 'button',
        class: 'btn btn-ghost',
        onclick: (e) => popover(e.currentTarget, urlForm(), { label: 'Add audio from a URL' })
      }, icon('link', 14), 'Add audio from a URL'));
  }

  function renderMaster() {
    $('master-slot').replaceChildren(buildStrip(MASTER));
  }

  function select(name) {
    state.selected = state.selected === name ? null : name;
    state.confirmRemove = null;
    strips.forEach((_, key) => updateStrip(key));
    render.drawer();
  }

  // ---------------------------------------------------------------------------
  // Meters and clock
  // ---------------------------------------------------------------------------

  const barMeter = meter({ horizontal: true });
  $('bar-meter').append(barMeter.el);
  let playStarted = 0;
  let lastClock = '';

  function tick() {
    const playing = mixer.getIsPlaying();
    strips.forEach((refs, name) => {
      if (!playing || (name !== MASTER && !mixer.hasTrack(name))) {
        refs.meter.set(null);
        return;
      }
      refs.meter.set(mixer.getLevel(name));
    });
    barMeter.set(playing ? mixer.getLevel() : null);

    const t = playing ? (performance.now() - playStarted) / 1000 : 0;
    const text = `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;
    if (text !== lastClock) {
      $('clock').textContent = text;
      lastClock = text;
    }
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // Moods
  // ---------------------------------------------------------------------------

  let savingMood = false;

  function renderMoods() {
    const bar = $('moods');
    const moods = mixer.getMoods();
    const current = mixer.getCurrentMood();
    const chips = h('div', { class: 'mood-chips' });

    moods.forEach(name => {
      const isCurrent = name === current;
      chips.append(h('span', { class: `mood${isCurrent ? ' current' : ''}${isCurrent && state.moodEdited ? ' edited' : ''}` },
        h('button', {
          type: 'button',
          class: 'mood-pick',
          'aria-pressed': String(isCurrent),
          title: isCurrent && state.moodEdited ? 'Changed since this mood was applied' : `Crossfade to ${name}`,
          onclick: () => mixer.setMood(name)
        }, h('span', { class: 'mood-led', 'aria-hidden': 'true' }), name),
        h('button', {
          type: 'button',
          class: 'mood-remove',
          'aria-label': `Delete mood ${name}`,
          title: 'Delete mood',
          onclick: () => mixer.removeMood(name)
        }, icon('close', 12))));
    });

    if (current && state.moodEdited) {
      chips.append(h('button', {
        type: 'button',
        class: 'btn btn-small',
        onclick: () => {
          mixer.captureMood(current);
          state.moodEdited = false;
          renderMoods();
          toast(`Updated “${current}”.`);
        }
      }, `Update “${current}”`));
    }

    if (savingMood) {
      const input = h('input', { type: 'text', class: 'field field-small', placeholder: 'Mood name', 'aria-label': 'Mood name', required: true });
      chips.append(h('form', {
        class: 'mood-form',
        onsubmit: (e) => {
          e.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          mixer.captureMood(name);
          // Treat the saved mood as current without crossfading anything.
          mixer.currentMood = name;
          savingMood = false;
          state.moodEdited = false;
          renderMoods();
          toast(`Saved “${name}”.`);
        }
      }, input,
      h('button', { type: 'submit', class: 'btn btn-small btn-primary' }, 'Save'),
      h('button', { type: 'button', class: 'btn btn-small btn-ghost', onclick: () => { savingMood = false; renderMoods(); } }, 'Cancel')));
      requestAnimationFrame(() => input.focus());
    } else {
      chips.append(h('button', {
        type: 'button',
        class: 'btn btn-small btn-ghost',
        disabled: !mixer.getTracks().length,
        title: 'Save the current fader positions as a mood',
        onclick: () => { savingMood = true; renderMoods(); }
      }, icon('plus', 12), moods.length ? 'Save mood' : 'Save mix as mood'));
    }

    if (!moods.length && !savingMood) {
      chips.append(h('span', { class: 'hint' }, 'Moods are saved fader positions you can crossfade between.'));
    }

    const min = Math.round(mixer.moodDuration.min / 1000);
    const max = Math.round(mixer.moodDuration.max / 1000);
    const updateDuration = () => {
      const lo = clamp(Number(minInput.value) || 1, 1, 3600);
      const hi = clamp(Number(maxInput.value) || lo, lo, 3600);
      mixer.setMoodDuration(lo * 1000, hi * 1000);
    };
    const minInput = h('input', { type: 'number', class: 'field field-num', min: 1, max: 3600, value: min, 'aria-label': 'Shortest time per mood, seconds', onchange: updateDuration });
    const maxInput = h('input', { type: 'number', class: 'field field-num', min: 1, max: 3600, value: max, 'aria-label': 'Longest time per mood, seconds', onchange: updateDuration });
    const auto = toggle('Cycle moods', mixer.autoMood, (on) => {
      if (on) {
        mixer.enableAutoMood();
        if (mixer.getIsPlaying()) mixer.randomMood();
      } else {
        mixer.disableAutoMood();
      }
    });
    if (moods.length < 2) auto.querySelector('input').disabled = true;

    bar.replaceChildren(
      h('span', { class: 'section-label' }, 'Moods'),
      chips,
      h('div', { class: 'mood-auto' }, auto, h('span', { class: 'hint' }, 'every'), minInput, h('span', { class: 'hint' }, 'to'), maxInput, h('span', { class: 'hint' }, 's')));
  }

  // ---------------------------------------------------------------------------
  // Detail panel: settings for the selected channel
  // ---------------------------------------------------------------------------

  /** Tabs registered by other scripts: { id, label, show(name), render(name) } */
  const drawerTabs = [];

  function sourceSignature(name) {
    if (!mixer.hasTrack(name)) return null;
    const src = mixer.getTrack(name).source;
    // Chord tracks update their own panel as you edit; only sample loading
    // needs a redraw.
    if (src.type === 'chords') return JSON.stringify(src.samples.map(x => [x.key, x.loaded, x.failed]));
    return JSON.stringify(src);
  }

  function renderDrawer() {
    const drawer = $('drawer');
    const name = state.selected;
    if (name && name !== MASTER && !mixer.hasTrack(name)) state.selected = null;
    // Tracks can select themselves (a new track), so keep the strips in step.
    strips.forEach((refs, key) => {
      refs.el.classList.toggle('selected', key === state.selected);
      refs.nameBtn.setAttribute('aria-pressed', String(key === state.selected));
    });
    if (!state.selected) {
      drawer.style.removeProperty('--c');
      drawer.replaceChildren(h('div', { class: 'detail-empty' },
        mixer.getTracks().length
          ? [icon('layers', 20), h('p', {}, 'Select a channel by its name to edit its effects, chords and source.')]
          : null));
      return;
    }

    state.drawerSource = state.selected === MASTER ? null : sourceSignature(state.selected);
    const tabs = drawerTabs.filter(t => t.show(state.selected));
    if (!tabs.some(t => t.id === state.tab)) state.tab = tabs[0] && tabs[0].id;
    const active = tabs.find(t => t.id === state.tab);

    drawer.style.setProperty('--c', colorOf(state.selected));
    drawer.replaceChildren(
      renderDetailHead(state.selected, tabs),
      h('div', { class: 'detail-body', role: 'tabpanel' }, active ? active.render(state.selected) : null));
  }

  function renderDetailHead(name, tabs) {
    const tabList = tabs.length > 1 ? h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(t.id === state.tab),
      onclick: () => { state.tab = t.id; renderDrawer(); }
    }, t.label))) : null;

    if (name === MASTER) {
      return h('header', { class: 'detail-head' },
        h('span', { class: 'swatch', 'aria-hidden': 'true' }),
        h('h2', { class: 'detail-title' }, 'Master'),
        tabList,
        h('span', { class: 'spacer' }));
    }

    const info = mixer.getTrack(name);
    const swatch = h('button', {
      type: 'button',
      class: 'swatch',
      title: 'Track colour',
      'aria-label': 'Track colour',
      'aria-haspopup': 'true',
      onclick: () => popover(swatch, h('div', { class: 'swatches', role: 'group', 'aria-label': 'Track colour' },
        COLORS.map(([label, hex]) => h('button', {
          type: 'button',
          class: 'swatch-pick',
          style: `--c:${hex}`,
          title: label,
          'aria-label': label,
          'aria-pressed': String(colorOf(name) === hex),
          onclick: () => {
            closePopover();
            mixer.setTrackMeta(name, { color: hex });
            renderDrawer();
          }
        }))), { label: 'Track colour' })
    });

    const input = h('input', {
      type: 'text',
      class: 'detail-name',
      value: name,
      'aria-label': 'Track name',
      spellcheck: false,
      onchange: () => {
        const next = input.value.trim();
        if (next === name) return;
        if (attempt(() => mixer.renameTrack(name, next))) {
          state.selected = next;
          render.drawer();
        } else {
          input.value = name;
        }
      },
      onkeydown: (e) => { if (e.key === 'Enter') input.blur(); }
    });

    const types = { audio: 'Audio', noise: 'Noise', chords: 'Chords' };
    const confirming = state.confirmRemove === name;
    return h('header', { class: 'detail-head' },
      swatch,
      input,
      tabs.length > 1 ? null : h('span', { class: 'badge' }, types[info.source.type] || info.source.type),
      tabList,
      h('span', { class: 'spacer' }),
      h('button', {
        type: 'button',
        class: `btn btn-small ${confirming ? 'btn-danger' : 'btn-ghost'}`,
        onclick: () => {
          if (!confirming) {
            state.confirmRemove = name;
            render.drawer();
            return;
          }
          state.confirmRemove = null;
          state.selected = null;
          mixer.removeTrack(name);
          render.drawer();
          toast(`Removed “${name}”.`);
        },
        onblur: () => {
          if (state.confirmRemove === name) {
            state.confirmRemove = null;
            setTimeout(() => render.drawer());
          }
        }
      }, icon('trash', 14), confirming ? 'Click again to remove' : 'Remove'));
  }

  function renderSourcePanel(name) {
    const info = mixer.getTrack(name);
    const src = info.source;

    if (src.type === 'noise') {
      return h('div', { class: 'panel-card' },
        h('h3', { class: 'card-title' }, 'Noise colour'),
        h('p', { class: 'card-text' }, 'White is bright hiss, pink is softer like rain, brown is a deep rumble like wind or surf.'),
        window.ui.segmented('Noise colour', [['white', 'White'], ['pink', 'Pink'], ['brown', 'Brown']], src.color,
          (color) => mixer.updateTrackSource(name, { color })));
    }

    const replaceInput = h('input', {
      type: 'file',
      accept: 'audio/*',
      hidden: true,
      onchange: (e) => {
        const file = e.target.files[0];
        if (!file) return;
        relinkFile(name, file);
        render.drawer();
      }
    });
    const urlInput = h('input', { type: 'url', class: 'field', placeholder: 'https://…/rain.mp3', 'aria-label': 'Audio URL' });
    const status = src.error
      ? h('p', { class: 'card-text problem' }, src.error)
      : !src.loaded
        ? h('p', { class: 'card-text problem' }, info.meta.fileName
          ? `“${info.meta.fileName}” isn't loaded. Choose the file again, or drop it on the page, to hear this track.`
          : 'No audio is loaded. Choose a file or paste a URL.')
        : h('p', { class: 'card-text' }, h('span', { class: 'mono' }, src.label || 'Audio file'));

    return h('div', { class: 'panel-card' },
      h('h3', { class: 'card-title' }, 'Audio'),
      status,
      h('div', { class: 'row' },
        replaceInput,
        h('button', { type: 'button', class: 'btn', onclick: () => replaceInput.click() }, icon('file', 14), src.loaded ? 'Replace file' : 'Choose file')),
      h('form', {
        class: 'row',
        onsubmit: (e) => {
          e.preventDefault();
          const url = urlInput.value.trim();
          if (!url) return;
          mixer.updateTrackSource(name, { src: url, label: url.split('/').pop() });
          mixer.setTrackMeta(name, { fileName: null, fileId: null });
          render.drawer();
        }
      }, urlInput, h('button', { type: 'submit', class: 'btn' }, icon('link', 14), 'Use URL')));
  }

  drawerTabs.push({
    id: 'source',
    label: 'Source',
    show: (name) => name !== MASTER && ['audio', 'noise'].includes(mixer.getTrack(name).source.type),
    render: renderSourcePanel
  });

  // ---------------------------------------------------------------------------
  // Rendering hooks
  // ---------------------------------------------------------------------------

  let drawerQueued = false;
  const render = {
    strips: renderStrips,
    moods: renderMoods,
    // Several mixer events can arrive together; draw the panel once.
    drawer() {
      if (drawerQueued) return;
      drawerQueued = true;
      queueMicrotask(() => {
        drawerQueued = false;
        renderDrawer();
      });
    }
  };

  mixer.on('tracks', () => {
    renderStrips();
    updateStrip(MASTER);
    renderMoods();
    render.drawer();
  });
  mixer.on('track', (name) => {
    if (name === MASTER) {
      updateStrip(MASTER);
      return;
    }
    // Solo on one track changes how every other strip looks.
    strips.forEach((_, key) => updateStrip(key));
    // Redraw the panel only when the source changed on its own (loaded,
    // failed), not on every fader move.
    if (name === state.selected && sourceSignature(name) !== state.drawerSource) render.drawer();
  });
  mixer.on('mood', () => {
    state.moodEdited = false;
    strips.forEach((_, key) => updateStrip(key));
    renderMoods();
  });
  mixer.on('moods', renderMoods);
  mixer.on('play', (playing) => {
    const btn = $('transport');
    btn.setAttribute('aria-pressed', String(playing));
    btn.setAttribute('aria-label', playing ? 'Stop' : 'Play');
    btn.title = playing ? 'Stop (Space)' : 'Play (Space)';
    if (playing) playStarted = performance.now();
    document.body.classList.toggle('playing', playing);
  });

  // ---------------------------------------------------------------------------
  // Global controls
  // ---------------------------------------------------------------------------

  $('transport').addEventListener('click', () => mixer.toggle());

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target.closest('input, select, textarea, button, [contenteditable], [role="slider"]')) return;
    e.preventDefault();
    mixer.toggle();
  });

  // Drag and drop anywhere on the page
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    dragDepth++;
    $('drop-overlay').hidden = false;
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) $('drop-overlay').hidden = true;
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    $('drop-overlay').hidden = true;
    addFiles(e.dataTransfer.files);
  });

  // Exposed for the other studio scripts and for poking at in the console.
  window.studio = {
    mixer, state, render, h, toast, attempt, drawerTabs, addButtons, uniqueName, select, updateStrip,
    colorOf, newTrackMeta,
    // Replaced by studio-storage.js to keep dropped files between visits.
    storeFile: () => null
  };

  renderMaster();
  renderStrips();
  renderMoods();
  renderDrawer();
  requestAnimationFrame(tick);
})();
