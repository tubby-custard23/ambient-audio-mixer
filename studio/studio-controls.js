/**
 * Ambient Studio: shared controls (knobs, faders, meters, menus, icons).
 * Loaded before the other studio scripts; exposes window.ui.
 */
(function () {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Create an element: h('button', { class: 'x', onclick }, 'Label') */
  function h(tag, props, ...children) {
    const el = tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'line'
      ? document.createElementNS('http://www.w3.org/2000/svg', tag)
      : document.createElement(tag);
    const svg = el instanceof SVGElement;
    Object.entries(props || {}).forEach(([key, value]) => {
      if (value == null || value === false) return;
      if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else if (key === 'class') el.setAttribute('class', value);
      else if (key === 'style') el.style.cssText = value;
      else if (!svg && key in el && key !== 'list' && key !== 'form') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    });
    children.flat(Infinity).forEach(child => {
      if (child == null || child === false) return;
      el.append(child instanceof Node ? child : document.createTextNode(child));
    });
    return el;
  }

  // ---------------------------------------------------------------------------
  // Icons (24×24, stroked)
  // ---------------------------------------------------------------------------

  const ICONS = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" stroke="none"/>',
    record: '<circle cx="12" cy="12" r="6.5" fill="currentColor" stroke="none"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
    exportFile: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    importFile: '<path d="M12 15V4M7 9l5-5 5 5M5 20h14"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><circle cx="10.5" cy="16" r="1.8"/><path d="M12.3 16V10l3 1"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    keys: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 5v8M12 5v8M16 5v8"/>',
    noise: '<path d="M2 12h2.5l1.5-5 2 10 2-13 2 15 2-11 2 7 1.5-3H22"/>',
    wind: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
    sine: '<path d="M2 12c2.5-8 5.5-8 8 0s5.5 8 8 0c1-3 2.2-4.5 4-4.5"/>',
    triangle: '<path d="M2 12 6.5 5l9 14 4.5-7H22"/>',
    sawtooth: '<path d="M2 17 11 6v11l9-11v6"/>',
    square: '<path d="M2 16V7h6.5v10H15V7h7"/>',
    spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M17.7 6.3l-2.5 2.5M8.8 15.2l-2.5 2.5"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20"/>',
    power: '<path d="M12 3v8"/><path d="M6.3 6.6a8 8 0 1 0 11.4 0"/>',
    check: '<path d="m5 12 5 5 9-10"/>'
  };

  function icon(name, size = 16) {
    const span = h('span', { class: 'icon', 'aria-hidden': 'true' });
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return span;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  const fmt = {
    db(v) {
      if (v <= 0.0001) return '−∞';
      const db = 20 * Math.log10(v);
      return `${db < 0 ? '−' : db > 0 ? '+' : ''}${Math.abs(db).toFixed(1)}`;
    },
    pan(p) {
      if (Math.abs(p) < 0.02) return 'C';
      return `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;
    },
    hz(v) {
      if (v >= 1000) return `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)}k`;
      return v < 10 ? v.toFixed(2) : String(Math.round(v));
    },
    seconds(v) {
      return v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(v < 10 ? 2 : 1)}s`;
    },
    percent(v) {
      return `${Math.round(v * 100)}%`;
    }
  };

  // ---------------------------------------------------------------------------
  // Drag behaviour shared by knobs and faders
  // ---------------------------------------------------------------------------

  /**
   * Make an element behave as a slider over a 0–1 "position".
   * get/set work in positions; pixels is how far a full sweep drags.
   */
  function sliderBehaviour(el, { get, set, commit, reset, pixels }) {
    let startY = 0;
    let startPos = 0;
    let dragging = false;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      el.focus({ preventScroll: true });
      el.setPointerCapture(e.pointerId);
      dragging = true;
      startY = e.clientY;
      startPos = get();
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const range = typeof pixels === 'function' ? pixels() : pixels;
      const fine = e.shiftKey ? 0.2 : 1;
      set(clamp(startPos + ((startY - e.clientY) / range) * fine, 0, 1));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      commit();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 0.004 : 0.02;
      set(clamp(get() - Math.sign(e.deltaY) * step, 0, 1));
      clearTimeout(el._wheelTimer);
      el._wheelTimer = setTimeout(commit, 250);
    }, { passive: false });

    el.addEventListener('keydown', (e) => {
      const steps = { ArrowUp: 0.01, ArrowRight: 0.01, ArrowDown: -0.01, ArrowLeft: -0.01, PageUp: 0.1, PageDown: -0.1 };
      let next = null;
      if (e.key in steps) next = get() + steps[e.key] * (e.shiftKey ? 5 : 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = 1;
      if (next == null) return;
      e.preventDefault();
      set(clamp(next, 0, 1));
      commit();
    });

    el.addEventListener('dblclick', () => {
      reset();
      commit();
    });
  }

  /** Map between values and 0–1 positions (linear, log or custom). */
  function scale(opts) {
    if (opts.toPos) return { toPos: opts.toPos, fromPos: opts.fromPos };
    const { min, max, log, step } = opts;
    return {
      toPos: (v) => clamp(log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min), 0, 1),
      fromPos: (p) => {
        let v = log ? min * Math.pow(max / min, p) : min + p * (max - min);
        if (step) v = Math.round(v / step) * step;
        return Number(v.toPrecision(5));
      }
    };
  }

  // ---------------------------------------------------------------------------
  // Knob
  // ---------------------------------------------------------------------------

  const ARC = 135; // degrees either side of straight up

  function polar(r, deg) {
    const a = (deg - 90) * Math.PI / 180;
    return [20 + r * Math.cos(a), 20 + r * Math.sin(a)];
  }

  function arcPath(r, from, to) {
    if (Math.abs(to - from) < 0.01) return '';
    const [x0, y0] = polar(r, from);
    const [x1, y1] = polar(r, to);
    const large = Math.abs(to - from) > 180 ? 1 : 0;
    const sweep = to > from ? 1 : 0;
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  /**
   * A rotary knob.
   * opts: { label, value, min, max, log, step, default, bipolar, size,
   *         format(v), onInput(v), onChange(v) }
   */
  function knob(opts) {
    const { toPos, fromPos } = scale(opts);
    const format = opts.format || ((v) => String(v));
    let value = opts.value;

    const track = h('path', { class: 'knob-track', d: arcPath(15, -ARC, ARC) });
    const fill = h('path', { class: 'knob-fill' });
    const pointer = h('line', { class: 'knob-pointer', x1: 20, y1: 20, x2: 20, y2: 8 });
    const dial = h('svg', { class: 'knob-dial', viewBox: '0 0 40 40', 'aria-hidden': 'true' },
      track, fill, h('circle', { class: 'knob-cap', cx: 20, cy: 20, r: 10.5 }), pointer);
    const readout = h('span', { class: 'knob-value' });
    const el = h('div', {
      class: `knob${opts.size === 'small' ? ' knob-small' : ''}`,
      role: 'slider',
      tabindex: 0,
      'aria-label': opts.label,
      title: `${opts.label}. Drag, scroll or use arrow keys; double-click to reset.`
    }, h('span', { class: 'knob-label' }, opts.label), dial, readout);

    function draw() {
      const pos = toPos(value);
      const deg = -ARC + pos * ARC * 2;
      const from = opts.bipolar ? 0 : -ARC;
      fill.setAttribute('d', from < deg ? arcPath(15, from, deg) : arcPath(15, deg, from));
      pointer.setAttribute('transform', `rotate(${deg.toFixed(1)} 20 20)`);
      const text = format(value);
      readout.textContent = text;
      el.setAttribute('aria-valuenow', String(value));
      el.setAttribute('aria-valuetext', text);
    }

    function setValue(v, notify) {
      value = v;
      draw();
      if (notify && opts.onInput) opts.onInput(value);
    }

    sliderBehaviour(el, {
      get: () => toPos(value),
      set: (pos) => setValue(fromPos(pos), true),
      commit: () => opts.onChange && opts.onChange(value),
      reset: () => setValue(opts.default ?? value, true),
      pixels: 180
    });
    el.setAttribute('aria-valuemin', String(opts.min ?? 0));
    el.setAttribute('aria-valuemax', String(opts.max ?? 1));
    draw();
    return { el, set: (v) => setValue(v, false), get: () => value };
  }

  // ---------------------------------------------------------------------------
  // Fader
  // ---------------------------------------------------------------------------

  // Squared taper so loudness changes evenly along the travel.
  const faderPos = (v) => Math.sqrt(clamp(v, 0, 1));
  const faderValue = (p) => p * p;
  const FADER_MARKS = [0, -6, -12, -24, -48];

  /** A vertical volume fader. opts: { label, value, default, onInput, onChange } */
  function fader(opts) {
    let value = opts.value;
    const cap = h('div', { class: 'fader-cap' });
    const fill = h('div', { class: 'fader-fill' });
    const groove = h('div', { class: 'fader-groove' }, fill);
    const scaleEl = h('div', { class: 'fader-scale', 'aria-hidden': 'true' },
      FADER_MARKS.map(db => h('span', { style: `bottom:${(faderPos(Math.pow(10, db / 20)) * 100).toFixed(1)}%` }, db === 0 ? '0' : String(-db))));
    const body = h('div', { class: 'fader-body' }, groove, cap);
    const el = h('div', {
      class: 'fader',
      role: 'slider',
      tabindex: 0,
      'aria-orientation': 'vertical',
      'aria-label': opts.label,
      'aria-valuemin': '0',
      'aria-valuemax': '1',
      title: `${opts.label}. Drag, scroll or use arrow keys; double-click to reset.`
    }, scaleEl, body);

    function draw() {
      const pos = faderPos(value);
      cap.style.bottom = `${(pos * 100).toFixed(2)}%`;
      fill.style.height = `${(pos * 100).toFixed(2)}%`;
      el.setAttribute('aria-valuenow', value.toFixed(3));
      el.setAttribute('aria-valuetext', `${fmt.db(value)} dB`);
    }

    function setValue(v, notify) {
      value = clamp(v, 0, 1);
      draw();
      if (notify && opts.onInput) opts.onInput(value);
    }

    sliderBehaviour(el, {
      get: () => faderPos(value),
      set: (pos) => setValue(faderValue(pos), true),
      commit: () => opts.onChange && opts.onChange(value),
      reset: () => setValue(opts.default ?? 0.5, true),
      pixels: () => body.clientHeight || 200
    });
    draw();
    return { el, set: (v) => setValue(v, false), get: () => value };
  }

  // ---------------------------------------------------------------------------
  // Stereo LED meter
  // ---------------------------------------------------------------------------

  /** Map a linear level to meter height, showing −60 dB to +3 dB. */
  function meterHeight(linear) {
    if (linear <= 0.001) return 0;
    return clamp((20 * Math.log10(linear) + 60) / 63, 0, 1);
  }

  function meter(opts = {}) {
    const bars = [0, 1].map(() => {
      const fillEl = h('div', { class: 'meter-fill' });
      const peakEl = h('div', { class: 'meter-peak' });
      const bar = h('div', { class: 'meter-bar' }, fillEl, peakEl);
      return { bar, fillEl, peakEl, hold: 0, shown: -1, shownPeak: -1 };
    });
    const el = h('div', { class: `meter${opts.horizontal ? ' meter-h' : ''}`, 'aria-hidden': 'true' }, bars.map(b => b.bar));

    function set(level) {
      const sides = level ? [level.left, level.right] : [null, null];
      bars.forEach((b, i) => {
        const side = sides[i];
        const height = side ? meterHeight(side.rms * Math.SQRT2) : 0;
        b.hold = side ? Math.max(meterHeight(side.peak), b.hold - 0.008) : 0;
        if (Math.abs(height - b.shown) > 0.002) {
          b.bar.style.setProperty('--h', height.toFixed(3));
          b.shown = height;
        }
        if (Math.abs(b.hold - b.shownPeak) > 0.002) {
          b.bar.style.setProperty('--p', b.hold.toFixed(3));
          b.shownPeak = b.hold;
        }
        b.bar.classList.toggle('clip', !!side && side.peak >= 1);
      });
    }

    set(null);
    return { el, set };
  }

  // ---------------------------------------------------------------------------
  // Small controls
  // ---------------------------------------------------------------------------

  /** Segmented buttons. options: [[value, text, iconName?]] */
  function segmented(label, options, value, onPick, extraClass = '') {
    const group = h('div', { class: `segmented ${extraClass}`, role: 'radiogroup', 'aria-label': label });
    options.forEach(([key, text, iconName]) => {
      group.append(h('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': String(key === value),
        title: iconName ? text : null,
        'aria-label': iconName ? text : null,
        onclick: (e) => {
          group.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b === e.currentTarget)));
          onPick(key);
        }
      }, iconName ? icon(iconName, 18) : text));
    });
    return group;
  }

  /** An on/off switch with a label. */
  function toggle(label, checked, onChange) {
    return h('label', { class: 'switch' },
      h('input', { type: 'checkbox', role: 'switch', checked, onchange: (e) => onChange(e.target.checked) }),
      h('span', { class: 'switch-track', 'aria-hidden': 'true' }),
      h('span', { class: 'switch-label' }, label));
  }

  // ---------------------------------------------------------------------------
  // Popovers and menus
  // ---------------------------------------------------------------------------

  let current = null; // { el, anchor, onClose }

  function closePopover(focusAnchor) {
    if (!current) return;
    const { el, anchor, onClose } = current;
    current = null;
    el.remove();
    if (anchor) {
      anchor.setAttribute('aria-expanded', 'false');
      if (focusAnchor && anchor.isConnected) anchor.focus();
    }
    if (onClose) onClose();
  }

  function place(el, anchor, align) {
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = align === 'end' ? r.right - w : r.left;
    left = clamp(left, 8, window.innerWidth - w - 8);
    // Open below the anchor, or above it when there's more room there.
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    let top;
    let room;
    if (hgt > below && above > below) {
      room = above;
      top = r.top - 6 - Math.min(hgt, above);
    } else {
      room = below;
      top = r.bottom + 6;
    }
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(8, top)}px`;
    el.style.maxHeight = `${Math.max(120, room)}px`;
  }

  /**
   * Show content in a floating panel under an anchor element.
   * opts: { align: 'start' | 'end', className, label, onClose }
   */
  function popover(anchor, content, opts = {}) {
    const reopen = current && current.anchor === anchor;
    closePopover();
    if (reopen && !opts.keepOpen) return null;
    const el = h('div', {
      class: `popover ${opts.className || ''}`,
      role: 'dialog',
      'aria-label': opts.label || null
    }, content);
    document.body.append(el);
    place(el, anchor, opts.align);
    anchor.setAttribute('aria-expanded', 'true');
    current = { el, anchor, onClose: opts.onClose };
    requestAnimationFrame(() => {
      const first = el.querySelector('[autofocus], input, [role="menuitem"], button, select');
      if (first) first.focus({ preventScroll: true });
    });
    return el;
  }

  /** Replace the open popover's content, keeping its position. */
  function refreshPopover(content) {
    if (!current) return;
    current.el.replaceChildren(content);
    place(current.el, current.anchor, 'start');
  }

  document.addEventListener('pointerdown', (e) => {
    if (!current) return;
    if (current.el.contains(e.target) || current.anchor.contains(e.target)) return;
    closePopover();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current) {
      e.preventDefault();
      closePopover(true);
    }
  });
  window.addEventListener('resize', () => closePopover());

  /**
   * A menu of actions. items: { label, hint, icon, swatch, tag, onSelect,
   * danger, checked } | { heading } | { separator: true } | Node
   */
  function menu(items, opts = {}) {
    const list = h('div', { class: `menu ${opts.className || ''}`, role: 'menu', 'aria-label': opts.label || null });
    items.forEach(item => {
      if (!item) return;
      if (item instanceof Node) { list.append(item); return; }
      if (item.separator) { list.append(h('div', { class: 'menu-sep', role: 'separator' })); return; }
      if (item.heading) { list.append(h('div', { class: 'menu-heading' }, item.heading)); return; }
      list.append(h('button', {
        type: 'button',
        role: 'menuitem',
        class: `menu-item${item.danger ? ' danger' : ''}${item.checked ? ' checked' : ''}`,
        disabled: item.disabled,
        style: item.color ? `--c:${item.color}` : null,
        onclick: () => {
          if (!item.keepOpen) closePopover(true);
          item.onSelect();
        }
      },
      item.icon ? icon(item.icon, 16) : item.swatch ? h('span', { class: 'menu-swatch', style: `--c:${item.swatch}` }) : null,
      h('span', { class: 'menu-text' },
        h('span', { class: 'menu-label' }, item.label),
        item.hint ? h('span', { class: 'menu-hint' }, item.hint) : null),
      item.tag ? h('span', { class: 'menu-tag' }, item.tag) : null));
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...list.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const i = items.indexOf(document.activeElement);
      const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    });
    return list;
  }

  /** A button that opens a menu or panel built on demand. */
  function menuButton(content, build, opts = {}) {
    const btn = h('button', {
      type: 'button',
      class: opts.className || 'btn',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      title: opts.title || null,
      'aria-label': opts.ariaLabel || null,
      onclick: () => popover(btn, build(), { align: opts.align, className: opts.popoverClass, label: opts.label })
    }, content);
    return btn;
  }

  // ---------------------------------------------------------------------------
  // Track colours
  // ---------------------------------------------------------------------------

  const COLORS = [
    ['Green', '#3dff8f'],
    ['Orange', '#ff9a2e'],
    ['Pink', '#ff3d9a'],
    ['Blue', '#36c5ff'],
    ['Violet', '#a675ff'],
    ['Yellow', '#ffe24a'],
    ['Red', '#ff4d5e'],
    ['Cyan', '#2ef2e0']
  ];

  window.ui = {
    h, icon, fmt, clamp, knob, fader, meter, segmented, toggle,
    popover, refreshPopover, closePopover, menu, menuButton, COLORS
  };
})();
