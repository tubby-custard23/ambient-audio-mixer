/**
 * Ambient Studio
 * A mixing desk UI for AmbientMixer: add tracks, mix them, save moods.
 */
(function () {
  'use strict';

  const MASTER = AmbientMixer.MASTER;
  const mixer = new AmbientMixer({ autoMood: false, masterVolume: 0.8, fadeTime: 3 });

  const state = {
    selected: null,       // track name, or MASTER
    tab: null,            // drawer tab
    moodEdited: false,    // faders moved since the current mood was applied
    addingUrl: false,
    savingMood: false,
    confirmRemove: null   // track name awaiting a second click on Remove
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);

  /** Create an element: h('button', { class: 'x', onclick }, 'Label') */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.className = value;
      else if (key === 'style') el.style.cssText = value;
      else if (key in el && key !== 'list' && key !== 'form') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    });
    children.flat(Infinity).forEach(child => {
      if (child == null || child === false) return;
      el.append(child instanceof Node ? child : document.createTextNode(child));
    });
    return el;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  let toastTimer = null;
  function toast(message, isError) {
    const el = $('toast');
    el.textContent = message;
    el.classList.toggle('error', !!isError);
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), isError ? 6000 : 3000);
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

  // Faders use a squared taper so the travel feels even in loudness.
  const volumeToFader = (v) => Math.round(Math.sqrt(v) * 1000);
  const faderToVolume = (pos) => Math.pow(pos / 1000, 2);

  function formatDb(v) {
    if (v <= 0.0001) return '−∞ dB';
    const db = 20 * Math.log10(v);
    return `${db < 0 ? '−' : ''}${Math.abs(db).toFixed(1)} dB`;
  }

  function formatPan(p) {
    if (Math.abs(p) < 0.02) return 'C';
    return `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;
  }

  /** Map a linear level to meter height, showing −60 dB to 0 dB. */
  function meterHeight(linear) {
    if (linear <= 0.001) return 0;
    return clamp((20 * Math.log10(linear) + 60) / 60, 0, 1);
  }

  function stripName(fileName) {
    return fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').trim();
  }

  function isAudioFile(file) {
    return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(file.name);
  }

  // ---------------------------------------------------------------------------
  // Adding tracks
  // ---------------------------------------------------------------------------

  /** A saved track whose audio file is missing and has this file's name. */
  function trackMissing(fileName) {
    return mixer.getTracks().find(t => t.source.type === 'audio' && !t.source.loaded && t.meta.fileName === fileName);
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
      const meta = { fileName: file.name, fileId: window.studio.storeFile(file) };
      if (attempt(() => mixer.addTrack(name, file, { volume: 0.5, meta }))) {
        added++;
        state.selected = name;
      }
    });
    if (added) render.drawer();
    return added;
  }

  function relinkFile(name, file) {
    mixer.updateTrackSource(name, { src: file, label: file.name });
    mixer.setTrackMeta(name, { fileName: file.name, fileId: window.studio.storeFile(file) });
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
    if (!attempt(() => mixer.addTrack(name, url, { volume: 0.5 }))) return false;
    state.selected = name;
    render.drawer();
    return true;
  }

  const NOISE_NAMES = { white: 'White noise', pink: 'Pink noise', brown: 'Brown noise' };

  function addNoise(color) {
    const name = uniqueName(NOISE_NAMES[color]);
    if (attempt(() => mixer.addTrack(name, { type: 'noise', color }, { volume: 0.4 }))) {
      state.selected = name;
      render.drawer();
    }
  }

  /** A starting point that needs no audio files. */
  function addNoiseBed() {
    const wind = uniqueName('Wind');
    mixer.addTrack(wind, { type: 'noise', color: 'brown' }, { volume: 0.55, pan: -0.2 });
    mixer.addEffect(wind, 'filter', { frequency: 420, q: 1.2, lfoRate: 0.04, lfoDepth: 0.55 });
    const rain = uniqueName('Rain');
    mixer.addTrack(rain, { type: 'noise', color: 'pink' }, { volume: 0.18, pan: 0.15 });
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

  // ---------------------------------------------------------------------------
  // Channel strips
  // ---------------------------------------------------------------------------

  const strips = new Map(); // name -> element refs

  function sourceText(info) {
    const src = info.source;
    if (src.error) return { text: src.error, problem: true };
    if (src.type === 'audio' && !src.loaded) return { text: 'No audio loaded', problem: true };
    return { text: src.label || src.type, problem: false };
  }

  function buildStrip(name) {
    const isMaster = name === MASTER;
    const refs = { name };

    refs.nameBtn = h('button', {
      class: 'strip-name',
      type: 'button',
      title: isMaster ? 'Master' : name,
      'aria-pressed': 'false',
      onclick: () => select(name)
    }, isMaster ? 'Master' : name);
    refs.source = h('span', { class: 'strip-source' });

    refs.meter = h('div', { class: 'meter', 'aria-hidden': 'true' },
      h('div', { class: 'meter-fill' }), h('div', { class: 'meter-peak' }));

    refs.fader = h('input', {
      class: 'fader',
      type: 'range',
      min: 0,
      max: 1000,
      step: 1,
      'aria-label': `${isMaster ? 'Master' : name} volume`,
      oninput: () => {
        const v = faderToVolume(Number(refs.fader.value));
        if (isMaster) {
          mixer.setMasterVolume(v);
        } else {
          mixer.setTrackVolume(name, v);
          if (mixer.getCurrentMood() && !state.moodEdited) {
            state.moodEdited = true;
            render.moods();
          }
        }
      },
      ondblclick: () => {
        // Double-click resets to unity (0 dB) on master, −6 dB on tracks.
        const v = isMaster ? 1 : 0.5;
        if (isMaster) mixer.setMasterVolume(v); else mixer.setTrackVolume(name, v);
      }
    });

    refs.db = h('output', { class: 'strip-db' });
    const children = [
      h('div', { class: 'strip-head' }, refs.nameBtn, refs.source),
      h('div', { class: 'fader-wrap' }, refs.meter, refs.fader),
      refs.db
    ];

    if (isMaster) {
      // Empty rows keep the master fader level with the track faders.
      children.push(h('div', { class: 'pan-row' }), h('div', { class: 'strip-buttons' }));
    } else {
      refs.panLabel = h('span', {}, 'C');
      refs.pan = h('input', {
        class: 'pan',
        type: 'range',
        min: -100,
        max: 100,
        step: 1,
        'aria-label': `${name} pan`,
        oninput: () => mixer.setTrackPan(name, Number(refs.pan.value) / 100),
        ondblclick: () => mixer.setTrackPan(name, 0)
      });
      refs.mute = h('button', {
        class: 'mute', type: 'button', title: 'Mute', 'aria-label': `Mute ${name}`,
        onclick: () => mixer.setTrackMute(name, !mixer.getTrack(name).mute)
      }, 'M');
      refs.solo = h('button', {
        class: 'solo', type: 'button', title: 'Solo', 'aria-label': `Solo ${name}`,
        onclick: () => mixer.setTrackSolo(name, !mixer.getTrack(name).solo)
      }, 'S');
      children.push(
        h('label', { class: 'pan-row' }, refs.panLabel, refs.pan),
        h('div', { class: 'strip-buttons' }, refs.mute, refs.solo)
      );
    }

    refs.el = h('section', {
      class: `strip${isMaster ? ' master' : ''}`,
      'aria-label': isMaster ? 'Master' : `${name} channel`
    }, children);
    refs.peakHold = 0;
    strips.set(name, refs);
    updateStrip(name);
    return refs.el;
  }

  function updateStrip(name) {
    const refs = strips.get(name);
    if (!refs) return;
    const selected = state.selected === name;
    refs.el.classList.toggle('selected', selected);
    refs.nameBtn.setAttribute('aria-pressed', String(selected));

    if (name === MASTER) {
      const v = mixer.getMasterVolume();
      refs.fader.value = volumeToFader(v);
      refs.db.textContent = formatDb(v);
      refs.source.textContent = `${mixer.getTracks().length} tracks`;
      return;
    }

    const info = mixer.getTrack(name);
    const anySolo = mixer.getTracks().some(t => t.solo);
    refs.fader.value = volumeToFader(info.volume);
    refs.db.textContent = formatDb(info.volume);
    refs.pan.value = Math.round(info.pan * 100);
    refs.panLabel.textContent = formatPan(info.pan);
    refs.mute.setAttribute('aria-pressed', String(info.mute));
    refs.solo.setAttribute('aria-pressed', String(info.solo));
    refs.el.classList.toggle('silenced', info.mute || (anySolo && !info.solo));
    refs.el.classList.toggle('chord', info.source.type === 'chords');
    const src = sourceText(info);
    refs.source.textContent = src.text;
    refs.source.title = src.text;
    refs.source.classList.toggle('problem', src.problem);
  }

  function renderStrips() {
    const container = $('strips');
    container.replaceChildren();
    [...strips.keys()].forEach(key => { if (key !== MASTER) strips.delete(key); });

    const tracks = mixer.getTracks();
    if (!tracks.length) {
      container.append(renderEmpty());
      return;
    }
    tracks.forEach(t => container.append(buildStrip(t.name)));
    container.append(renderAddStrip());
  }

  function renderUrlForm(onDone) {
    const input = h('input', {
      type: 'url',
      placeholder: 'https://…/rain.mp3',
      'aria-label': 'Audio URL',
      required: true
    });
    const form = h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (addUrl(input.value)) onDone();
      }
    },
    input,
    h('div', { class: 'row' },
      h('button', { type: 'submit' }, 'Add URL'),
      h('button', { type: 'button', class: 'quiet', onclick: onDone }, 'Cancel')));
    requestAnimationFrame(() => input.focus());
    return form;
  }

  /** Extra ways to add a track, registered by other studio scripts. */
  const addButtons = [];

  function extraAddButtons() {
    return addButtons.map(b => h('button', { type: 'button', onclick: b.run }, b.label));
  }

  function noiseButtons() {
    return h('div', { class: 'noise-row' },
      ['white', 'pink', 'brown'].map(color =>
        h('button', { type: 'button', title: NOISE_NAMES[color], onclick: () => addNoise(color) },
          color[0].toUpperCase() + color.slice(1))));
  }

  function renderAddStrip() {
    const closeUrl = () => { state.addingUrl = false; renderStrips(); };
    return h('div', { class: 'add-strip' },
      h('h2', {}, 'Add a track'),
      h('p', {}, 'Drop audio files anywhere on the page, or:'),
      h('button', { type: 'button', onclick: chooseFiles }, 'Choose audio files'),
      state.addingUrl
        ? renderUrlForm(closeUrl)
        : h('button', { type: 'button', onclick: () => { state.addingUrl = true; renderStrips(); } }, 'Add from a URL'),
      extraAddButtons(),
      h('p', { style: 'margin-top:0.5rem' }, 'Noise bed'),
      noiseButtons());
  }

  function renderEmpty() {
    const closeUrl = () => { state.addingUrl = false; renderStrips(); };
    return h('div', { class: 'empty' },
      h('h2', {}, 'Start a soundscape'),
      h('p', {}, 'Drop audio files anywhere on this page to add them as tracks. Or start with a wind and rain bed made from filtered noise, which needs no files.'),
      h('div', { class: 'row' },
        h('button', { type: 'button', onclick: addNoiseBed }, 'Add a wind and rain bed'),
        h('button', { type: 'button', onclick: chooseFiles }, 'Choose audio files'),
        extraAddButtons(),
        state.addingUrl ? null : h('button', { type: 'button', class: 'quiet', onclick: () => { state.addingUrl = true; renderStrips(); } }, 'Add from a URL')),
      state.addingUrl ? h('div', { style: 'margin-top:0.75rem;max-width:24rem' }, renderUrlForm(closeUrl)) : null);
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

  // Meters
  function tickMeters() {
    const playing = mixer.getIsPlaying();
    strips.forEach((refs, name) => {
      if (!playing) {
        if (refs.lastLevel !== 0) {
          refs.el.style.setProperty('--level', 0);
          refs.meter.style.setProperty('--peak', 0);
          refs.meter.classList.remove('clipping');
          refs.lastLevel = 0;
          refs.peakHold = 0;
        }
        return;
      }
      if (name !== MASTER && !mixer.hasTrack(name)) return;
      const { peak, rms } = mixer.getLevel(name);
      const level = meterHeight(rms * Math.SQRT2);
      refs.peakHold = Math.max(meterHeight(peak), refs.peakHold - 0.006);
      refs.el.style.setProperty('--level', level.toFixed(3));
      refs.meter.style.setProperty('--peak', refs.peakHold.toFixed(3));
      refs.meter.classList.toggle('clipping', peak >= 1);
      refs.lastLevel = level;
    });
    requestAnimationFrame(tickMeters);
  }

  // ---------------------------------------------------------------------------
  // Moods
  // ---------------------------------------------------------------------------

  function renderMoods() {
    const bar = $('moods');
    const moods = mixer.getMoods();
    const current = mixer.getCurrentMood();
    const children = [h('span', { class: 'moods-label' }, 'Moods')];

    moods.forEach(name => {
      const isCurrent = name === current;
      children.push(h('span', { class: `mood${isCurrent ? ' current' : ''}${isCurrent && state.moodEdited ? ' edited' : ''}` },
        h('button', {
          type: 'button',
          'aria-pressed': String(isCurrent),
          title: isCurrent && state.moodEdited ? 'Changed since this mood was applied' : `Crossfade to ${name}`,
          onclick: () => mixer.setMood(name)
        }, name),
        h('button', {
          type: 'button',
          'aria-label': `Delete mood ${name}`,
          title: 'Delete mood',
          onclick: () => mixer.removeMood(name)
        }, '×')));
    });

    if (!moods.length && !state.savingMood) {
      children.push(h('span', { class: 'drawer-hint' }, 'Save a mix as a mood, then crossfade between moods.'));
    }

    if (current && state.moodEdited) {
      children.push(h('button', {
        type: 'button',
        onclick: () => {
          mixer.captureMood(current);
          state.moodEdited = false;
          render.moods();
          toast(`Updated “${current}”.`);
        }
      }, `Update “${current}”`));
    }

    if (state.savingMood) {
      const input = h('input', { type: 'text', placeholder: 'Mood name', 'aria-label': 'Mood name', required: true });
      children.push(h('form', {
        class: 'mood-form',
        onsubmit: (e) => {
          e.preventDefault();
          const name = input.value.trim();
          if (!name) return;
          mixer.captureMood(name);
          // Treat the saved mood as current without crossfading anything.
          mixer.currentMood = name;
          state.savingMood = false;
          state.moodEdited = false;
          render.moods();
          toast(`Saved “${name}”.`);
        }
      }, input,
      h('button', { type: 'submit' }, 'Save'),
      h('button', { type: 'button', class: 'quiet', onclick: () => { state.savingMood = false; render.moods(); } }, 'Cancel')));
      requestAnimationFrame(() => input.focus());
    } else {
      children.push(h('button', {
        type: 'button',
        class: 'quiet',
        disabled: !mixer.getTracks().length,
        onclick: () => { state.savingMood = true; render.moods(); }
      }, 'Save mix as mood'));
    }

    const min = Math.round(mixer.moodDuration.min / 1000);
    const max = Math.round(mixer.moodDuration.max / 1000);
    const updateDuration = () => {
      const lo = clamp(Number(minInput.value) || 1, 1, 3600);
      const hi = clamp(Number(maxInput.value) || lo, lo, 3600);
      mixer.setMoodDuration(lo * 1000, hi * 1000);
    };
    const minInput = h('input', { type: 'number', min: 1, max: 3600, value: min, 'aria-label': 'Shortest time per mood, seconds', onchange: updateDuration });
    const maxInput = h('input', { type: 'number', min: 1, max: 3600, value: max, 'aria-label': 'Longest time per mood, seconds', onchange: updateDuration });
    children.push(h('span', { class: 'mood-auto' },
      h('label', {},
        h('input', {
          type: 'checkbox',
          checked: mixer.autoMood,
          disabled: moods.length < 2,
          onchange: (e) => {
            if (e.target.checked) {
              mixer.enableAutoMood();
              if (mixer.getIsPlaying()) mixer.randomMood();
            } else {
              mixer.disableAutoMood();
            }
          }
        }),
        ' Cycle moods every'),
      minInput, '–', maxInput, 's'));

    bar.replaceChildren(...children);
  }

  // ---------------------------------------------------------------------------
  // Drawer: settings for the selected channel
  // ---------------------------------------------------------------------------

  /** Tabs registered by later sections: { id, label, show(name), render(name) } */
  const drawerTabs = [];

  function renderDrawer() {
    const drawer = $('drawer');
    const name = state.selected;
    if (name && name !== MASTER && !mixer.hasTrack(name)) state.selected = null;
    if (!state.selected) {
      drawer.replaceChildren(h('p', { class: 'drawer-hint' },
        mixer.getTracks().length ? 'Select a channel by its name to see its settings.' : ''));
      return;
    }

    state.drawerSource = state.selected === MASTER ? null : sourceSignature(state.selected);
    const tabs = drawerTabs.filter(t => t.show(state.selected));
    if (!tabs.some(t => t.id === state.tab)) state.tab = tabs[0] && tabs[0].id;
    const active = tabs.find(t => t.id === state.tab);

    const head = state.selected === MASTER
      ? h('div', { class: 'drawer-head' }, h('h2', {}, 'Master'))
      : renderTrackHead(state.selected);

    drawer.replaceChildren(...[
      head,
      tabs.length > 1 ? h('div', { class: 'tabs', role: 'tablist' }, tabs.map(t => h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(t.id === state.tab),
        onclick: () => { state.tab = t.id; renderDrawer(); }
      }, t.label))) : null,
      active ? active.render(state.selected) : null
    ].filter(Boolean));
  }

  function sourceSignature(name) {
    if (!mixer.hasTrack(name)) return null;
    const src = mixer.getTrack(name).source;
    // Chord tracks update their own panel as you edit; only sample loading
    // needs a redraw.
    if (src.type === 'chords') return JSON.stringify(src.samples.map(x => [x.key, x.loaded, x.failed]));
    return JSON.stringify(src);
  }

  function renderTrackHead(name) {
    const input = h('input', {
      type: 'text',
      value: name,
      'aria-label': 'Track name',
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
    const confirming = state.confirmRemove === name;
    input.className = 'drawer-name';
    return h('div', { class: 'drawer-head' },
      h('h2', {}, input),
      h('span', { class: 'spacer' }),
      h('button', {
        type: 'button',
        class: confirming ? 'danger' : 'quiet',
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
      }, confirming ? 'Click again to remove' : 'Remove track'));
  }

  function renderSourcePanel(name) {
    const info = mixer.getTrack(name);
    const src = info.source;
    const panel = h('div', { class: 'panel' });

    if (src.type === 'noise') {
      panel.append(
        h('h3', {}, 'Noise colour'),
        h('p', {}, 'White is bright hiss, pink is softer like rain, brown is a deep rumble like wind or surf.'),
        h('div', { class: 'segmented', role: 'group', 'aria-label': 'Noise colour' },
          ['white', 'pink', 'brown'].map(color => h('button', {
            type: 'button',
            'aria-pressed': String(src.color === color),
            onclick: () => { mixer.updateTrackSource(name, { color }); render.drawer(); }
          }, color[0].toUpperCase() + color.slice(1)))));
      return panel;
    }

    if (src.type === 'audio') {
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
      const urlInput = h('input', { type: 'url', placeholder: 'https://…/rain.mp3', 'aria-label': 'Audio URL', style: 'flex:1;min-width:12rem' });
      panel.append(
        h('h3', {}, 'Audio'),
        src.error
          ? h('p', { class: 'problem' }, src.error)
          : !src.loaded
            ? h('p', { class: 'problem' }, info.meta.fileName
              ? `“${info.meta.fileName}” isn't loaded. Choose the file again to hear this track.`
              : 'No audio is loaded. Choose a file or paste a URL.')
            : h('p', {}, src.label || 'Audio file'),
        h('div', { class: 'row' },
          replaceInput,
          h('button', { type: 'button', onclick: () => replaceInput.click() }, src.loaded ? 'Replace file' : 'Choose file')),
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
        }, urlInput, h('button', { type: 'submit' }, 'Use URL')));
    }
    return panel;
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
    // Several mixer events can arrive together; draw the drawer once.
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
    // Redraw the drawer only when the source changed on its own (loaded,
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
    btn.querySelector('.transport-label').textContent = playing ? 'Stop' : 'Play';
  });

  // ---------------------------------------------------------------------------
  // Global controls
  // ---------------------------------------------------------------------------

  $('transport').addEventListener('click', () => mixer.toggle());

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target.closest('input, select, textarea, button, [contenteditable]')) return;
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
    // Replaced by studio-storage.js to keep dropped files between visits.
    storeFile: () => null
  };

  renderMaster();
  renderStrips();
  renderMoods();
  renderDrawer();
  requestAnimationFrame(tickMeters);
})();
