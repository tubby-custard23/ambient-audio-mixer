// Tiny async test harness for the browser test pages. Results end up in
// window.__results, which test/run.mjs reads. Open a page directly to see
// them in the browser too.
(function () {
  const tests = [];
  window.test = (name, fn) => tests.push({ name, fn });

  window.assert = (cond, message) => {
    if (!cond) throw new Error(message || 'assertion failed');
  };
  window.near = (actual, expected, tolerance, message) => {
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error(`${message || 'value'}: expected ~${expected}, got ${actual}`);
    }
  };

  /** Peak absolute sample value of a rendered buffer within [from, to) seconds. */
  window.peakOf = (buffer, from = 0, to = buffer.duration) => {
    let peak = 0;
    const start = Math.floor(from * buffer.sampleRate);
    const end = Math.min(buffer.length, Math.floor(to * buffer.sampleRate));
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i]));
    }
    return peak;
  };

  window.rmsOf = (buffer, channel, from = 0, to = buffer.duration) => {
    const data = buffer.getChannelData(channel);
    const start = Math.floor(from * buffer.sampleRate);
    const end = Math.min(buffer.length, Math.floor(to * buffer.sampleRate));
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i] * data[i];
    return Math.sqrt(sum / Math.max(1, end - start));
  };

  window.offline = (seconds = 1, rate = 22050) => new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);

  window.addEventListener('load', async () => {
    const results = [];
    for (const t of tests) {
      try {
        await t.fn();
        results.push({ name: t.name, ok: true });
      } catch (err) {
        results.push({ name: t.name, ok: false, error: String(err && err.stack || err) });
      }
    }
    const list = document.createElement('pre');
    list.textContent = results.map(r => `${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : '\n     ' + r.error}`).join('\n');
    document.body.appendChild(list);
    window.__results = results;
  });
})();
