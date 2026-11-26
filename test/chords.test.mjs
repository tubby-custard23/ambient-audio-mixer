import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Chords = require('../ambient-chords.js');
const { parseChord, parseProgression, voiceChord, noteFromName, pitchClass } = Chords;

const names = (text, key, mode) => parseProgression(text, key, mode).map(c => c.name).join(' ');

test('Roman numerals follow the key and mode', () => {
  assert.equal(names('i VI III VII', 'A', 'minor'), 'Am F C G');
  assert.equal(names('I V vi IV', 'C', 'major'), 'C G Am F');
  assert.equal(names('i II i vii', 'E', 'phrygian'), 'Em F Em Dm');
  assert.equal(names('I II', 'D', 'lydian'), 'D E');
  assert.equal(names('i iv V', 'A', 'harmonicMinor'), 'Am Dm E');
});

test('accidentals and flat keys are spelled sensibly', () => {
  assert.equal(names('I bIII I bVI', 'C', 'major'), 'C Eb C Ab');
  assert.equal(names('I IV V', 'F', 'major'), 'F Bb C');
  assert.equal(names('i iv', 'Eb', 'minor'), 'Ebm Abm');
  assert.equal(names('#iv°', 'C', 'major'), 'F#dim');
});

test('qualities and extensions', () => {
  const iv = (t, k = 'C', m = 'major') => parseChord(t, k, m).intervals.join();
  assert.equal(iv('V7'), '0,4,7,10');
  assert.equal(iv('ii7'), '0,3,7,10');
  assert.equal(iv('Imaj7'), '0,4,7,11');
  assert.equal(iv('vii°'), '0,3,6');
  assert.equal(iv('vii°7'), '0,3,6,9');
  assert.equal(iv('viiø7'), '0,3,6,10');
  assert.equal(iv('viiø'), '0,3,6,10');
  assert.equal(iv('III+'), '0,4,8');
  assert.equal(iv('Isus2'), '0,2,7');
  assert.equal(iv('V7sus4'), '0,5,7,10');
  assert.equal(iv('Iadd9'), '0,4,7,14');
  assert.equal(iv('ii9'), '0,3,7,10,14');
  assert.equal(iv('I6'), '0,4,7,9');
  assert.equal(iv('I5'), '0,7');
});

test('chord names', () => {
  const c = (t) => parseChord(t);
  assert.equal(c('Am').name, 'Am');
  assert.equal(c('F#m7').root, 6);
  assert.equal(c('F#m7').intervals.join(), '0,3,7,10');
  assert.equal(c('Bbmaj7').name, 'Bbmaj7');
  assert.equal(c('Bm7b5').intervals.join(), '0,3,6,10');
  assert.equal(c('Bm7b5').name, 'Bm7b5');
  assert.equal(c('Cdim7').intervals.join(), '0,3,6,9');
  assert.equal(c('Gsus4').intervals.join(), '0,5,7');
  assert.equal(c('Caug').intervals.join(), '0,4,8');
  assert.equal(c('Cmaj9').intervals.join(), '0,4,7,11,14');
});

test('slash chords and lengths', () => {
  const g = parseChord('G/B');
  assert.equal(g.bass, 11);
  assert.equal(g.name, 'G/B');
  assert.equal(parseChord('V/vii', 'C').bass, 11);
  assert.equal(parseChord('Am:2').length, 2);
  assert.equal(parseChord('i:0.5', 'A', 'minor').length, 0.5);
});

test('separators', () => {
  assert.equal(names('i-VI-III-VII', 'A', 'minor'), 'Am F C G');
  assert.equal(names('Am, F | C – G'), 'Am F C G');
  assert.equal(names('  Am   F  '), 'Am F');
});

test('bad chords explain themselves', () => {
  assert.throws(() => parseChord('X7'), /isn't a chord/);
  assert.throws(() => parseChord('Amxyz'), /didn't understand “xyz”/);
  assert.throws(() => parseChord('C/H'), /isn't a bass note/);
  assert.throws(() => parseChord('C:0'), /more than 0/);
});

test('note names', () => {
  assert.equal(noteFromName('C4'), 60);
  assert.equal(noteFromName('piano_A3.wav'), 57);
  assert.equal(noteFromName('Bb2'), 46);
  assert.equal(noteFromName('rain'), null);
  assert.equal(pitchClass('Cb'), 11);
});

test('voicing stays in range and contains the chord tones', () => {
  const chord = parseChord('Am7');
  const { notes, bass } = voiceChord(chord, null, { octave: 3, spread: 'open', bass: true });
  assert.deepEqual([...new Set(notes.map(n => n % 12))].sort((a, b) => a - b), [0, 4, 7, 9]);
  assert.ok(notes.every(n => n >= 40 && n <= 84), `notes ${notes}`);
  assert.equal(bass % 12, 9);
  assert.ok(bass < notes[0]);
});

test('voice leading moves less than root position', () => {
  const prog = parseProgression('C F G C Am Dm G C', 'C');
  const movement = (lead) => {
    let prev = null;
    let total = 0;
    prog.forEach(ch => {
      const { notes } = voiceChord(ch, prev, { octave: 3, spread: 'close', voiceLeading: lead, bass: false });
      if (prev) total += notes.reduce((s, n) => s + Math.min(...prev.map(p => Math.abs(p - n))), 0);
      prev = notes;
    });
    return total;
  };
  assert.ok(movement(true) < movement(false) * 0.7, `${movement(true)} vs ${movement(false)}`);
});

test('slash bass sits below the chord even without the bass voice', () => {
  const { notes, bass } = voiceChord(parseChord('C/G'), null, { bass: false, spread: 'close' });
  assert.equal(bass % 12, 7);
  assert.ok(bass < notes[0]);
});

test('every preset parses', () => {
  Chords.PRESETS.forEach(p => assert.ok(parseProgression(p.progression, p.key, p.mode).length >= 2, p.name));
});

test('palette lists the key’s own chords with their roles', () => {
  const { inKey, color } = Chords.chordPalette('A', 'minor');
  assert.equal(inKey.map(c => c.name).join(' '), 'Am Bdim C Dm Em F G');
  assert.equal(inKey[0].fn, 'tonic');
  assert.equal(inKey[4].fn, 'dominant');
  assert.ok(color.some(c => c.token === 'V' && c.name === 'E'), 'major five offered in minor');
  assert.ok(!color.some(c => inKey.some(k => k.name === c.name)), 'no duplicates of in-key chords');
});

test('outside chords are spelled from their usual degree', () => {
  const { color } = Chords.chordPalette('C', 'major');
  assert.deepEqual(color.slice(0, 3).map(c => c.token), ['iv', 'bVI', 'bVII']);
  assert.equal(Chords.describeChord('C#', 'A', 'minor').numeral, '#III');
  assert.equal(Chords.chordPalette('G', 'mixolydian').inKey[6].name, 'F');
});

test('describeChord works for numerals and names', () => {
  assert.equal(Chords.describeChord('Fm', 'C').fn, 'color');
  assert.equal(Chords.describeChord('G7', 'C').fn, 'dominant');
  assert.equal(Chords.describeChord('Am', 'C').role, 'Home’s shadow');
  assert.equal(Chords.describeChord('Isus2', 'D').diatonic, true);
});

test('suggestions follow common harmonic moves', () => {
  const afterFive = Chords.suggestNext('V', 'C');
  assert.equal(afterFive[0].name, 'C');
  assert.ok(afterFive.some(s => s.name === 'Am' && /Deceptive/.test(s.why)));
  assert.equal(Chords.suggestNext(null, 'C')[0].why, 'Start at home');
  assert.ok(Chords.suggestNext('Am', 'C').every(s => s.name !== 'Am'), 'never suggests the same chord');
  assert.ok(Chords.suggestNext('garbage', 'C').length > 0, 'falls back when the chord does not parse');
});

test('variants keep slash bass and length', () => {
  const v = Chords.chordVariants('G/B:2', 'C');
  assert.ok(v.some(x => x.token === 'Gsus4/B:2'));
  assert.ok(Chords.chordVariants('vi', 'C').some(x => x.token === 'vi7' && x.name === 'Am7'));
  assert.deepEqual(Chords.chordVariants('vii°', 'C').map(x => x.name), ['Bdim', 'Bdim7']);
  assert.equal(Chords.withLength('Am:2', 1), 'Am');
  assert.equal(Chords.withLength('Am', 0.5), 'Am:0.5');
});

test('every preset has a mood and an explanation', () => {
  Chords.PRESETS.forEach(p => {
    assert.ok(Chords.MOODS.includes(p.mood), p.name);
    assert.ok(p.about.length > 20, p.name);
  });
});
