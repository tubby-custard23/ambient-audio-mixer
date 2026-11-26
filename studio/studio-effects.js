/**
 * Ambient Studio: effects chain for tracks and the master bus.
 */
(function () {
  'use strict';

  const { mixer, state, render, drawerTabs } = window.studio;
  const { h, icon, fmt, knob, segmented, popover, menu } = window.ui;
  const MASTER = AmbientMixer.MASTER;
  const EFFECTS = AmbientMixer.EFFECTS;

  const DESCRIPTIONS = {
    filter: 'Cuts highs or lows; drift sweeps it slowly',
    reverb: 'Places the sound in a room, hall or cave',
    delay: 'Echoes that repeat and fade',
    tremolo: 'Swells the volume up and down',
    compressor: 'Evens out loud and quiet moments'
  };

  function formatValue(spec, value) {
    switch (spec.unit) {
      case 'Hz': return `${fmt.hz(value)}Hz`;
      case 's': return fmt.seconds(value);
      case 'dB': return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(spec.step < 1 ? 1 : 0)}dB`;
      case ':1': return `${value.toFixed(1)}:1`;
      default:
        // Unitless 0–1 amounts read best as percentages.
        if (spec.min === 0 && spec.max <= 1) return fmt.percent(value);
        return value.toFixed(1);
    }
  }

  const MODE_LABELS = { lowpass: 'Low pass', highpass: 'High pass', bandpass: 'Band' };

  function renderControl(target, fx, key, spec) {
    if (spec.type === 'select') {
      return h('div', { class: 'device-select' },
        segmented(spec.label, spec.options.map(o => [o, MODE_LABELS[o] || o]), fx.params[key],
          (v) => mixer.updateEffect(target, fx.id, { [key]: v }), 'segmented-small'));
    }
    // Heavy parameters (reverb length) rebuild audio, so apply on release.
    const apply = (v) => mixer.updateEffect(target, fx.id, { [key]: v });
    return knob({
      label: spec.label,
      value: fx.params[key],
      min: spec.min,
      max: spec.max,
      log: spec.scale === 'log',
      step: spec.step,
      default: spec.default,
      format: (v) => formatValue(spec, v),
      onInput: spec.heavy ? null : apply,
      onChange: spec.heavy ? apply : null
    }).el;
  }

  function renderDevice(target, fx, index, count) {
    const def = EFFECTS[fx.type];
    return h('article', { class: `device${fx.enabled ? '' : ' off'}`, 'aria-label': def.label },
      h('header', { class: 'device-head' },
        h('button', {
          type: 'button',
          class: 'device-power',
          'aria-pressed': String(fx.enabled),
          'aria-label': fx.enabled ? `Bypass ${def.label}` : `Turn ${def.label} on`,
          title: fx.enabled ? 'On. Click to bypass.' : 'Bypassed. Click to turn on.',
          onclick: () => mixer.setEffectEnabled(target, fx.id, !fx.enabled)
        }, icon('power', 12)),
        h('span', { class: 'device-name' }, def.label),
        h('span', { class: 'device-tools' },
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Move ${def.label} earlier`, title: 'Move earlier',
            disabled: index === 0,
            onclick: () => mixer.moveEffect(target, fx.id, index - 1)
          }, icon('chevronLeft', 14)),
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Move ${def.label} later`, title: 'Move later',
            disabled: index === count - 1,
            onclick: () => mixer.moveEffect(target, fx.id, index + 1)
          }, icon('chevronRight', 14)),
          h('button', {
            type: 'button', class: 'icon-btn', 'aria-label': `Remove ${def.label}`, title: 'Remove',
            onclick: () => mixer.removeEffect(target, fx.id)
          }, icon('close', 14)))),
      h('div', { class: 'device-params' },
        Object.entries(def.params).map(([key, spec]) => renderControl(target, fx, key, spec))));
  }

  function renderChain(target) {
    const effects = mixer.getEffects(target);
    state.effectsShape = shape(target);
    const addBtn = h('button', {
      type: 'button',
      class: 'device-add',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      onclick: () => popover(addBtn, menu(Object.entries(EFFECTS).map(([type, def]) => ({
        label: def.label,
        hint: DESCRIPTIONS[type],
        onSelect: () => mixer.addEffect(target, type)
      })), { label: 'Add an effect' }), { label: 'Add an effect' })
    }, icon('plus', 18), h('span', {}, 'Add effect'));

    const chain = h('div', { class: 'chain' });
    const source = h('div', { class: 'chain-end' }, target === MASTER ? 'All tracks' : 'Input');
    chain.append(source);
    effects.forEach((fx, i) => {
      chain.append(h('span', { class: 'chain-link', 'aria-hidden': 'true' }), renderDevice(target, fx, i, effects.length));
    });
    chain.append(h('span', { class: 'chain-link', 'aria-hidden': 'true' }), addBtn);

    return h('div', { class: 'chain-wrap' },
      chain,
      effects.length ? null : h('p', { class: 'hint chain-hint' }, target === MASTER
        ? 'Effects here shape the whole mix. A long reverb ties separate sounds into one space.'
        : 'Sound flows left to right through each effect. Drag a knob up or down, or scroll over it.'));
  }

  /** Everything about the chain except parameter values. */
  function shape(target) {
    return mixer.getEffects(target).map(fx => `${fx.id}:${fx.enabled}`).join();
  }

  drawerTabs.unshift({
    id: 'effects',
    label: 'Effects',
    show: () => true,
    render: renderChain
  });

  // Rebuild the chain when effects are added, removed, moved or switched,
  // but not while a knob is being turned.
  mixer.on('effects', (target) => {
    if (target === state.selected && state.tab === 'effects' && shape(target) !== state.effectsShape) {
      render.drawer();
    }
  });

  render.drawer();
})();
