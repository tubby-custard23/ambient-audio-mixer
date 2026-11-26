/**
 * Ambient Studio: saving mixes in the browser, export/import, recording.
 *
 * Mixes and the audio files dropped into them are kept in IndexedDB, so a
 * mix comes back with its sounds on the next visit. Exported JSON files
 * hold the mix settings only; their audio files are chosen again on import.
 */
(function () {
  'use strict';

  const studio = window.studio;
  const { mixer, state, render, h, toast } = studio;
  const titleInput = document.getElementById('mix-title');

  // ---------------------------------------------------------------------------
  // IndexedDB
  // ---------------------------------------------------------------------------

  const request = (req) => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const open = indexedDB.open('ambient-studio', 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore('mixes', { keyPath: 'id' });
          open.result.createObjectStore('files');
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return dbPromise;
  }

  async function store(name, mode = 'readonly') {
    return (await db()).transaction(name, mode).objectStore(name);
  }

  const mixes = {
    list: async () => (await request((await store('mixes')).getAll())).sort((a, b) => b.updated - a.updated),
    get: async (id) => request((await store('mixes')).get(id)),
    put: async (mix) => request((await store('mixes', 'readwrite')).put(mix)),
    remove: async (id) => request((await store('mixes', 'readwrite')).delete(id))
  };

  const files = {
    get: async (id) => request((await store('files')).get(id)),
    put: async (id, blob) => request((await store('files', 'readwrite')).put(blob, id)),
    keys: async () => request((await store('files')).getAllKeys()),
    remove: async (id) => request((await store('files', 'readwrite')).delete(id))
  };

  const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // Keep every dropped file so the mix can be reopened later.
  studio.storeFile = (file) => {
    const id = newId('file');
    files.put(id, file).catch(err => toast(`“${file.name}” couldn't be saved in this browser: ${err.message}`, true));
    return id;
  };

  function readLastId() {
    try { return localStorage.getItem('ambient-studio:last'); } catch (e) { return null; }
  }
  function writeLastId(id) {
    try { localStorage.setItem('ambient-studio:last', id); } catch (e) { /* private mode */ }
  }

  // ---------------------------------------------------------------------------
  // Current mix
  // ---------------------------------------------------------------------------

  let currentId = newId('mix');
  let loading = false;
  let saveTimer = null;
  const status = h('span', { class: 'save-status', 'aria-live': 'polite' });

  function title() {
    return titleInput.value.trim() || 'Untitled mix';
  }

  function snapshot() {
    return { ...mixer.toJSON(), title: title() };
  }

  function scheduleSave() {
    if (loading) return;
    clearTimeout(saveTimer);
    status.textContent = '';
    saveTimer = setTimeout(save, 700);
  }

  async function save() {
    clearTimeout(saveTimer);
    saveTimer = null;
    // Capture everything now: callers may change the mix while we wait.
    const id = currentId;
    const data = snapshot();
    // An empty, untitled mix is not worth keeping.
    if (!data.tracks.length && data.title === 'Untitled mix' && !(await mixes.get(id))) return;
    try {
      await mixes.put({ id, title: data.title, updated: Date.now(), data });
      writeLastId(id);
      status.textContent = 'Saved';
    } catch (err) {
      status.textContent = '';
      toast(`This mix couldn't be saved: ${err.message}`, true);
    }
  }

  /** Every stored file id a mix refers to. */
  function fileIdsIn(data) {
    const ids = [];
    (data.tracks || []).forEach(t => {
      if (t.meta && t.meta.fileId) ids.push(t.meta.fileId);
      const samples = t.source && t.source.sampler && t.source.sampler.samples;
      (samples || []).forEach(s => { if (s.fileId) ids.push(s.fileId); });
    });
    return ids;
  }

  async function open(data, id) {
    // Fetch stored files first; mixer.load() resolves sources synchronously.
    const blobs = new Map();
    await Promise.all(fileIdsIn(data).map(async fid => {
      try {
        const blob = await files.get(fid);
        if (blob) blobs.set(fid, blob);
      } catch (e) { /* treated as missing */ }
    }));

    loading = true;
    try {
      mixer.load(data, {
        resolveSource(track) {
          const source = { ...track.source };
          if (source.type === 'audio' && track.meta && blobs.has(track.meta.fileId)) {
            source.src = blobs.get(track.meta.fileId);
          }
          if (source.type === 'chords' && source.sampler) {
            source.sampler = {
              ...source.sampler,
              samples: source.sampler.samples.map(s => (blobs.has(s.fileId) ? { ...s, src: blobs.get(s.fileId) } : s))
            };
          }
          return source;
        }
      });
    } finally {
      loading = false;
    }
    currentId = id;
    titleInput.value = data.title || 'Untitled mix';
    state.selected = null;
    state.moodEdited = false;
    render.strips();
    render.moods();
    render.drawer();
    writeLastId(id);
    status.textContent = '';

    const missing = mixer.getTracks().filter(t => t.source.type === 'audio' && !t.source.loaded && t.meta.fileName);
    if (missing.length) {
      toast(`Choose these files again to hear them: ${missing.map(t => t.meta.fileName).join(', ')}. Dropping a file with the same name reconnects it.`, true);
    }
    return missing.length;
  }

  function newMix() {
    save();
    mixer.clear();
    currentId = newId('mix');
    titleInput.value = 'Untitled mix';
    state.selected = null;
    render.drawer();
    status.textContent = '';
    closeMenu();
  }

  /** Remove stored files that no saved mix uses any more. */
  async function collectGarbage() {
    const all = await mixes.list();
    const used = new Set(all.flatMap(m => fileIdsIn(m.data)));
    fileIdsIn(snapshot()).forEach(id => used.add(id));
    const keys = await files.keys();
    await Promise.all(keys.filter(k => !used.has(k)).map(k => files.remove(k)));
  }

  ['tracks', 'track', 'effects', 'moods', 'mood'].forEach(event => mixer.on(event, scheduleSave));
  titleInput.addEventListener('input', scheduleSave);
  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') titleInput.blur(); });
  window.addEventListener('pagehide', () => { if (saveTimer) save(); });

  // ---------------------------------------------------------------------------
  // Mixes menu
  // ---------------------------------------------------------------------------

  const menu = h('div', { class: 'menu', id: 'mix-menu', hidden: true });
  const menuButton = h('button', {
    type: 'button',
    'aria-expanded': 'false',
    'aria-controls': 'mix-menu',
    onclick: () => (menu.hidden ? openMenu() : closeMenu())
  }, 'Mixes');

  let confirmDelete = null;

  async function openMenu() {
    await save();
    const list = await mixes.list();
    const rows = list.map(m => {
      const isCurrent = m.id === currentId;
      const confirming = confirmDelete === m.id;
      return h('li', { class: `menu-mix${isCurrent ? ' current' : ''}` },
        h('button', {
          type: 'button',
          class: 'menu-open',
          disabled: isCurrent,
          onclick: async () => {
            closeMenu();
            const mix = await mixes.get(m.id);
            if (mix) open(mix.data, mix.id).catch(err => toast(err.message, true));
          }
        },
        h('span', { class: 'menu-title' }, m.title),
        h('span', { class: 'menu-meta' }, isCurrent ? 'Open now' : new Date(m.updated).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))),
        h('button', {
          type: 'button',
          class: confirming ? 'danger' : 'quiet',
          'aria-label': confirming ? `Delete ${m.title} for good` : `Delete ${m.title}`,
          onclick: async () => {
            if (!confirming) {
              confirmDelete = m.id;
              openMenu();
              return;
            }
            confirmDelete = null;
            await mixes.remove(m.id);
            if (isCurrent) {
              currentId = newId('mix');
              titleInput.value = 'Untitled mix';
              mixer.clear();
            }
            collectGarbage().catch(() => {});
            openMenu();
            toast(`Deleted “${m.title}”.`);
          }
        }, confirming ? 'Delete for good' : 'Delete'));
    });

    menu.replaceChildren(
      h('button', { type: 'button', class: 'menu-new', onclick: newMix }, 'New mix'),
      rows.length ? h('ul', { class: 'menu-list' }, rows) : h('p', { class: 'drawer-hint' }, 'Mixes you make are saved here automatically.'));
    menu.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    menu.hidden = true;
    confirmDelete = null;
    menuButton.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('click', (e) => {
    if (!menu.hidden && !e.target.closest('#mix-menu') && e.target !== menuButton) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });

  // ---------------------------------------------------------------------------
  // Export and import
  // ---------------------------------------------------------------------------

  function download(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: fileName });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const safeFileName = () => title().replace(/[\\/:*?"<>|]+/g, '').trim() || 'mix';

  function exportMix() {
    const data = snapshot();
    // Stored file ids mean nothing in another browser.
    data.tracks.forEach(t => {
      if (t.meta) delete t.meta.fileId;
      if (t.source.sampler) t.source.sampler.samples.forEach(s => { delete s.fileId; });
    });
    download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${safeFileName()}.json`);
    const hasFiles = data.tracks.some(t => t.meta && t.meta.fileName);
    toast(hasFiles
      ? 'Exported the mix. Audio files aren’t included; whoever opens it will choose them again.'
      : 'Exported the mix.');
  }

  const importInput = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    hidden: true,
    onchange: async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
        if (data.format !== 'ambient-mixer') throw new Error('not a mix');
      } catch (err) {
        toast(`“${file.name}” isn't an Ambient Studio mix file.`, true);
        return;
      }
      await save();
      try {
        const missing = await open(data, newId('mix'));
        await save();
        // The list of files to choose again matters more than this.
        if (!missing) toast(`Imported “${title()}”.`);
      } catch (err) {
        toast(`“${file.name}” couldn't be opened: ${err.message}`, true);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  let recorder = null;
  let recordStart = 0;
  let recordTimer = null;
  const recordButton = h('button', {
    type: 'button',
    class: 'record',
    'aria-pressed': 'false',
    onclick: () => (recorder ? stopRecording() : startRecording())
  }, 'Record');

  function startRecording() {
    if (typeof MediaRecorder === 'undefined') {
      toast('This browser can’t record audio.', true);
      return;
    }
    if (!mixer.getIsPlaying()) mixer.play();
    const tap = mixer.captureStream();
    const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || '';
    const chunks = [];
    recorder = new MediaRecorder(tap.stream, type ? { mimeType: type } : undefined);
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      tap.release();
      const mime = recorder.mimeType || type || 'audio/webm';
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      download(new Blob(chunks, { type: mime }), `${safeFileName()}.${ext}`);
      recorder = null;
      clearInterval(recordTimer);
      recordButton.textContent = 'Record';
      recordButton.setAttribute('aria-pressed', 'false');
      toast('Saved the recording to your downloads.');
    };
    recorder.start(1000);
    recordStart = Date.now();
    recordButton.setAttribute('aria-pressed', 'true');
    const tick = () => {
      const s = Math.floor((Date.now() - recordStart) / 1000);
      recordButton.textContent = `Stop recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    tick();
    recordTimer = setInterval(tick, 500);
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  mixer.on('play', (playing) => { if (!playing) stopRecording(); });

  // ---------------------------------------------------------------------------
  // Start up
  // ---------------------------------------------------------------------------

  document.getElementById('topbar-actions').replaceChildren(
    status,
    recordButton,
    h('span', { class: 'menu-anchor' }, menuButton, menu),
    h('button', { type: 'button', class: 'quiet', onclick: exportMix }, 'Export'),
    h('button', { type: 'button', class: 'quiet', onclick: () => importInput.click() }, 'Import'),
    importInput);

  (async () => {
    try {
      const lastId = readLastId();
      const last = lastId && await mixes.get(lastId);
      if (last && !mixer.getTracks().length) await open(last.data, last.id);
      collectGarbage().catch(() => {});
    } catch (err) {
      toast(`Saved mixes couldn't be read in this browser: ${err.message}`, true);
    }
  })();

  studio.storage = { save, open, mixes, files, newMix };
})();
