/**
 * Ambient Studio: effects rack for tracks and the master bus.
 */
(function () {
  'use strict';

  const { mixer, state, render, h, drawerTabs } = window.studio;
  const MASTER = AmbientMixer.MASTER;
  const EFFECTS = AmbientMixer.EFFECTS;

  const DESCRIPTIONS = {
    filter: 'Cuts high or low frequencies. Drift sweeps the cutoff slowly, like wind changing.',
    reverb: 'Places the sound in a space, from a small room to a long cave.',
    delay: 'Repeating echoes that fade away.',
    tremolo: 'Swells the volume up and down.',
    compressor: 'Evens out loud and quiet moments.'
  };

  // Sliders run 0–1000; log parameters spread evenly across octaves.
  function toSlider(spec, value) {
    const t = spec.scale === 'log'
      ? Math.log(value / spec.min) / Math.log(spec.max / spec.min)
      : (value - spec.min) / (spec.max - spec.min);
    return Math.round(Math.min(1, Math.max(0, t)) * 1000);
  }

  function fromSlider(spec, pos) {
    const t = pos / 1000;
    let value = spec.scale === 'log'
      ? spec.min * Math.pow(spec.max / spec.min, t)
      : spec.min + t * (spec.max - spec.min);
    if (spec.step) value = Math.round(value / spec.step) * spec.step;
    return Number(value.toPrecision(4));
  }

  function formatValue(spec, value) {
    switch (spec.unit) {
      case 'Hz': return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz` : `${value < 10 ? value.toFixed(2) : Math.round(value)} Hz`;
      case 's': return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(1)} s`;
      case 'dB': return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(spec.step < 1 ? 1 : 0)} dB`;
      case ':1': return `${value.toFixed(1)}:1`;
      default:
        // Unitless 0–1 amounts read best as percentages.
        if (spec.min === 0 && spec.max <= 1) return `${Math.round(value * 100)}%`;
        return value.toFixed(1);
    }
  }

  function renderControl(target, fx, key, spec) {
    if (spec.type === 'select') {
      return h('div', { class: 'fx-param' },
        h('span', { class: 'fx-param-label' }, spec.label),
        h('div', { class: 'segmented', role: 'group', 'aria-label': spec.label },
          spec.options.map(option => h('button', {
            type: 'button',
            'aria-pressed': String(fx.params[key] === option),
            onclick: (e) => {
              mixer.updateEffect(target, fx.id, { [key]: option });
              e.currentTarget.parentNode.querySelectorAll('button').forEach(b => {
                b.setAttribute('aria-pressed', String(b === e.currentTarget));
              });
            }
          }, option[0].toUpperCase() + option.slice(1).replace('pass', ' pass')))));
    }

    const readout = h('output', { class: 'fx-param-value' }, formatValue(spec, fx.params[key]));
    const apply = (e) => {
      const value = fromSlider(spec, Number(e.target.value));
      readout.textContent = formatValue(spec, value);
      if (!spec.heavy || e.type === 'change') mixer.updateEffect(target, fx.id, { [key]: value });
    };
    const slider = h('input', {
      type: 'range',
      min: 0,
      max: 1000,
      step: 1,
      value: toSlider(spec, fx.params[key]),
      'aria-label': `${EFFECTS[fx.type].label} ${spec.label.toLowerCase()}`,
      oninput: apply,
      onchange: apply,
      ondblclick: () => {
        mixer.updateEffect(target, fx.id, { [key]: spec.default });
        slider.value = toSlider(spec, spec.default);
        readout.textContent = formatValue(spec, spec.default);
      }
    });
    return h('label', { class: 'fx-param' },
      h('span', { class: 'fx-param-label' }, spec.label),
      readout,
      slider);
  }

  function renderUnit(target, fx, index, count) {
    const def = EFFECTS[fx.type];
    return h('article', { class: `fx${fx.enabled ? '' : ' off'}`, 'aria-label': def.label },
      h('header', { class: 'fx-head' },
        h('label', { class: 'fx-power', title: fx.enabled ? 'Bypass this effect' : 'Turn this effect on' },
          h('input', {
            type: 'checkbox',
            checked: fx.enabled,
            onchange: (e) => mixer.setEffectEnabled(target, fx.id, e.target.checked)
          }),
          h('span', {}, def.label)),
        h('span', { class: 'fx-tools' },
          h('button', {
            type: 'button', class: 'quiet', 'aria-label': `Move ${def.label} earlier`, title: 'Move earlier',
            disabled: index === 0,
            onclick: () => mixer.moveEffect(target, fx.id, index - 1)
          }, '‹'),
          h('button', {
            type: 'button', class: 'quiet', 'aria-label': `Move ${def.label} later`, title: 'Move later',
            disabled: index === count - 1,
            onclick: () => mixer.moveEffect(target, fx.id, index + 1)
          }, '›'),
          h('button', {
            type: 'button', class: 'quiet', 'aria-label': `Remove ${def.label}`, title: 'Remove',
            onclick: () => mixer.removeEffect(target, fx.id)
          }, '×'))),
      h('div', { class: 'fx-params' },
        Object.entries(def.params).map(([key, spec]) => renderControl(target, fx, key, spec))));
  }

  function renderRack(target) {
    const effects = mixer.getEffects(target);
    state.effectsShape = shape(target);
    return h('div', { class: 'rack-wrap' },
      h('div', { class: 'rack' },
        effects.length
          ? effects.map((fx, i) => renderUnit(target, fx, i, effects.length))
          : h('p', { class: 'drawer-hint' }, target === MASTER
            ? 'Effects here shape the whole mix. A long reverb ties separate sounds into one space.'
            : 'No effects yet. Sound passes through them left to right.')),
      h('div', { class: 'fx-add' },
        h('h3', {}, 'Add an effect'),
        Object.entries(EFFECTS).map(([type, def]) => h('button', {
          type: 'button',
          title: DESCRIPTIONS[type],
          onclick: () => mixer.addEffect(target, type)
        }, def.label))));
  }

  /** Everything about the rack except parameter values. */
  function shape(target) {
    return mixer.getEffects(target).map(fx => `${fx.id}:${fx.enabled}`).join();
  }

  drawerTabs.unshift({
    id: 'effects',
    label: 'Effects',
    show: () => true,
    render: renderRack
  });

  // Rebuild the rack when effects are added, removed, moved or switched,
  // but not while a slider is being dragged.
  mixer.on('effects', (target) => {
    if (target === state.selected && state.tab === 'effects' && shape(target) !== state.effectsShape) {
      render.drawer();
    }
  });

  render.drawer();
})();
