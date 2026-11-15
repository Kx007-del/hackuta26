// claude-2 independent H26-3 practice-guide regressions (pure helper only).
// Contract: docs/H26-3-PLAN.md frozen decisions + GameArena.tsx mechanics. Assertions are semantic
// (keys, ordering, mode availability), not sentence snapshots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceGuide} from '../packages/challenges/practice-guide.ts';
import {TARGET_DISTANCES, validConfig, type ChallengeConfig, type TemplateId} from '../shared/contracts.ts';

const PRESETS: Array<{arenaId: ChallengeConfig['arenaId']; templateId: TemplateId; spin: 0 | 180 | 360}> = [
  {arenaId: 'rooftop-v1', templateId: 'jump', spin: 0},
  {arenaId: 'rooftop-v1', templateId: 'spin180', spin: 180},
  {arenaId: 'rooftop-v1', templateId: 'spin360', spin: 360},
  {arenaId: 'buildyard-v1', templateId: 'ramp-shot', spin: 0},
  {arenaId: 'buildyard-v1', templateId: 'wall-edit', spin: 0},
  {arenaId: 'tactical-v1', templateId: 'precision', spin: 0},
  {arenaId: 'tactical-v1', templateId: 'dash-peek', spin: 0},
];
const cfg = (p: typeof PRESETS[number], targetDistance = 14, referenceClipId?: string): ChallengeConfig => ({
  schemaVersion: 1, arenaId: p.arenaId, templateId: p.templateId, targetDistance, requiredSpinDegrees: p.spin,
  ...(referenceClipId ? {referenceClipId} : {}),
});
const preset = (id: TemplateId) => PRESETS.find(p => p.templateId === id)!;
const guideFor = (id: TemplateId, d = 14) => practiceGuide(cfg(preset(id), d));
const all = (g: {title: string; steps: string[]; controls: string[]}) => [g.title, ...g.steps, ...g.controls].join('\n');
const deepFreeze = <T>(o: T): T => { Object.freeze(o); for (const v of Object.values(o as object)) if (v && typeof v === 'object') deepFreeze(v); return o; };

/** First index in joined steps of each pattern; asserts every pattern is present and indices strictly increase. */
function assertOrdered(steps: string[], patterns: RegExp[], label: string) {
  const text = steps.join('\n');
  let prev = -1;
  for (const p of patterns) {
    const rest = text.slice(prev + 1);
    const m = rest.search(p);
    assert.ok(m >= 0, `${label}: expected ${p} after position ${prev} in steps:\n${text}`);
    prev = prev + 1 + m;
  }
}
const hasControl = (controls: string[], key: RegExp, action: RegExp) => controls.some(c => key.test(c) && action.test(c));

// Mode-specific key detectors (standalone key tokens).
const SPACE = /\bspace\b/i, KEY_B = /\bB\b/, KEY_G = /\bG\b/, KEY_X = /\bX\b/;

test('fixture covers seven contract-valid presets at every supported distance', () => {
  assert.equal(PRESETS.length, 7);
  for (const p of PRESETS) for (const d of TARGET_DISTANCES) assert.ok(validConfig(cfg(p, d)), `${p.templateId}@${d}`);
});

test('every preset × distance yields non-empty title/steps/controls with only the selected distance', () => {
  const titles = new Set<string>();
  for (const p of PRESETS) for (const d of TARGET_DISTANCES) {
    const g = practiceGuide(cfg(p, d));
    assert.deepEqual(Object.keys(g).sort(), ['controls', 'steps', 'title']);
    assert.ok(g.title.trim().length > 0, p.templateId);
    assert.ok(g.steps.length >= 2 && g.steps.every(s => typeof s === 'string' && s.trim().length > 0), p.templateId);
    assert.ok(g.controls.length > 0 && g.controls.every(s => typeof s === 'string' && s.trim().length > 0), p.templateId);
    assert.equal(new Set(g.controls).size, g.controls.length, `${p.templateId}: duplicate controls`);
    assert.ok(g.steps.some(s => new RegExp(`\\b${d}\\s?m\\b`).test(s)), `${p.templateId}: step must name ${d} m target`);
    for (const other of TARGET_DISTANCES.filter(x => x !== d))
      assert.doesNotMatch(all(g), new RegExp(`\\b${other}\\s?m\\b`), `${p.templateId}@${d} leaks ${other} m`);
    if (d === 14) titles.add(g.title);
  }
  assert.equal(titles.size, 7, 'each preset has a distinct title');
});

test('input config is not mutated; results are deterministic and fresh per call', () => {
  for (const p of PRESETS) {
    const input = deepFreeze(cfg(p, 20, 'clip_ref-01'));
    const before = structuredClone(input);
    const a = practiceGuide(input);
    const b = practiceGuide(input);
    assert.deepEqual(input, before);
    assert.deepEqual(a, b, `${p.templateId}: deterministic`);
    assert.notEqual(a, b);
    assert.notEqual(a.steps, b.steps);
    assert.notEqual(a.controls, b.controls);
    a.steps.push('mutated'); a.controls.length = 0; a.steps[0] = 'x';
    assert.deepEqual(practiceGuide(input), b, `${p.templateId}: caller mutation must not leak into later calls`);
  }
});

test('reference clip wording is optional, prepended and honest', () => {
  for (const p of PRESETS) {
    const plain = practiceGuide(cfg(p, 14));
    const ref = practiceGuide(cfg(p, 14, 'abc123'));
    assert.ok(plain.steps.every(s => !/\b(reference|clip)\b/i.test(s)), `${p.templateId}: no clip wording without referenceClipId`);
    assert.equal(ref.steps.length, plain.steps.length + 1);
    assert.match(ref.steps[0], /reference/i);
    assert.match(ref.steps[0], /clip/i);
    assert.deepEqual(ref.steps.slice(1), plain.steps, 'mechanic steps unchanged by reference');
    assert.deepEqual(ref.controls, plain.controls, 'controls unchanged by reference');
    assert.equal(ref.title, plain.title);
    assert.doesNotMatch(ref.steps[0], /abc123/, 'clip id is not echoed');
  }
});

test('no detection, reconstruction, anti-cheat or completion claims (negated statements allowed)', () => {
  const positive = /(?<!\b(?:not|no|never|isn't|without)\s(?:an?\s)?)\b(?:automatic(?:ally)?|detect(?:s|ed|ion)?|reconstruct(?:s|ed|ion)?|recreated?\s+automatically)\b/i;
  for (const p of PRESETS) for (const ref of [undefined, 'r1']) {
    const text = all(practiceGuide(cfg(p, 26, ref)));
    assert.doesNotMatch(text, positive, p.templateId);
    assert.doesNotMatch(text, /anti-?cheat|✓|\bverified\b|\bcompleted?\b|\bproven\b/i, p.templateId);
  }
});

test('common controls match real inputs in every preset', () => {
  for (const p of PRESETS) {
    const {controls: c} = guideFor(p.templateId);
    const t = p.templateId;
    assert.ok(hasControl(c, /keyboard start/i, /./), `${t}: Keyboard Start`);
    assert.ok(hasControl(c, /\bWASD\b/, /move/i), `${t}: WASD move`);
    assert.ok(hasControl(c, /\bQ\s*\/\s*E\b/, /turn/i) && hasControl(c, /left\s*\/\s*right|←|→/i, /turn/i), `${t}: Q/E + left/right arrows turn`);
    assert.ok(hasControl(c, /up\s*\/\s*down|↑|↓/i, /aim/i), `${t}: up/down aim`);
    assert.ok(hasControl(c, /mouse/i, /aim/i), `${t}: mouse aim`);
    assert.ok(hasControl(c, /\bC\b/, /aim down sights|\bADS\b/i), `${t}: C ADS`);
    assert.ok(hasControl(c, /\bF\b/, /fire/i), `${t}: F fire`);
    assert.ok(hasControl(c, /click/i, /fire/i) && hasControl(c, /captured/i, /click/i), `${t}: captured click fire`);
    assert.ok(hasControl(c, /\bR\b/, /retry/i), `${t}: R retry`);
    assert.ok(hasControl(c, /\besc\b/i, /release/i), `${t}: Esc releases`);
  }
});

test('Space/B/G/X availability follows mode; steps never reference unavailable keys', () => {
  for (const p of PRESETS) {
    const g = guideFor(p.templateId);
    const t = p.templateId, tactical = p.arenaId === 'tactical-v1', buildyard = p.arenaId === 'buildyard-v1';
    const expect = (re: RegExp, on: boolean, name: string) => {
      assert.equal(g.controls.some(c => re.test(c)), on, `${t}: ${name} control ${on ? 'required' : 'forbidden'}`);
      if (!on) assert.ok(!g.steps.some(s => re.test(s)), `${t}: steps must not mention ${name}`);
    };
    expect(SPACE, !tactical, 'Space');
    expect(KEY_B, buildyard, 'B');
    expect(KEY_G, t === 'wall-edit', 'G');
    expect(KEY_X, t === 'dash-peek', 'X');
    if (!tactical) assert.ok(hasControl(g.controls, SPACE, /jump/i), `${t}: Space jumps`);
    if (buildyard) assert.ok(hasControl(g.controls, KEY_B, /build/i), `${t}: B builds`);
    if (t === 'wall-edit') assert.ok(hasControl(g.controls, KEY_G, /edit/i), 'G edits');
    if (t === 'dash-peek') assert.ok(hasControl(g.controls, KEY_X, /dash/i), 'X dashes');
    if (tactical) assert.doesNotMatch(g.steps.join('\n'), /\bjump/i, `${t}: tactical has no jump`);
  }
});

test('ALIGN assist is absent for spin presets and offered for non-spin presets (matches GameArena)', () => {
  for (const p of PRESETS) {
    const g = guideFor(p.templateId);
    const hasAlign = /\balign\b/i.test(all(g));
    assert.equal(hasAlign, p.spin === 0, `${p.templateId}: align ${p.spin ? 'forbidden' : 'expected'}`);
  }
});

test('tactical presets use turn wording, never spin', () => {
  for (const id of ['precision', 'dash-peek'] as const) {
    const g = guideFor(id);
    assert.doesNotMatch(all(g), /\bspin/i, id);
    assert.doesNotMatch(all(g), /\d+\s*°|rotation/i, `${id}: no rotation requirement`);
    assert.ok(g.controls.some(c => /\bturn\b/i.test(c)), `${id}: turn control`);
  }
});

test('jump: jump then fire while airborne', () => {
  const s = guideFor('jump').steps;
  assertOrdered(s, [SPACE, /\bjump/i, /\bfire\b/i], 'jump');
  assert.match(s.join(' '), /before landing|airborne|in the air/i);
});

test('spin180: facing-away start, jump, net 180° airborne turn, then fire', () => {
  const s = guideFor('spin180').steps;
  assertOrdered(s, [/facing away|away from the target/i, /\bjump/i, /180/, /\bfire\b/i], 'spin180');
  assert.match(s.join(' '), /\bnet\b/i);
  assert.match(s.join(' '), /airborne|in the air|before landing/i);
  assert.match(s.join(' '), /takeoff/i);
});

test('spin360: facing-target start (not away), jump, net 360° airborne turn, then fire', () => {
  const s = guideFor('spin360').steps;
  assert.doesNotMatch(s.join(' '), /facing away|away from the target/i);
  assertOrdered(s, [/facing (?:the )?(?:\d+\s?m )?target/i, /\bjump/i, /360/, /\bfire\b/i], 'spin360');
  assert.match(s.join(' '), /\bnet\b/i);
  assert.match(s.join(' '), /in the air|airborne|before landing/i);
});

test('ramp-shot: outside slot, B build, walk onto ramp, jump from ramp, airborne fire', () => {
  const s = guideFor('ramp-shot').steps;
  assertOrdered(s, [/outside/i, KEY_B, /onto the ramp|up onto|on the ramp/i, /\bjump/i, /\bfire\b/i], 'ramp-shot');
  assert.match(s.join(' '), /before landing|airborne/i);
  assert.match(s.join(' '), /jump from (?:it|the ramp)|on the ramp to jump/i, 'takeoff must be from the ramp');
});

test('wall-edit: no ramp; B wall, G open upper panel, near-side jump, airborne fire through opening', () => {
  const s = guideFor('wall-edit').steps;
  assert.doesNotMatch(all(guideFor('wall-edit')), /\bramp\b/i);
  assertOrdered(s, [KEY_B, /\bwall\b/i, KEY_G, /\bnear side\b/i, /\bjump/i, /opening/i, /\bfire\b/i], 'wall-edit');
  assert.match(s.join(' '), /upper/i);
  assert.match(s.join(' '), /airborne|before landing/i);
});

test('precision: grounded, stop, then fire while still', () => {
  const s = guideFor('precision').steps;
  assertOrdered(s, [/grounded/i, /\bstop\b|release/i, /\bfire\b/i], 'precision');
  assert.match(s.join(' '), /still/i);
});

test('dash-peek: behind left crate, one X dash 4 m right, release/settle/stop, grounded still fire', () => {
  const s = guideFor('dash-peek').steps;
  assertOrdered(s, [/behind the left crate/i, KEY_X, /\bdash/i, /release/i, /\bstop\b/i, /\bfire\b/i], 'dash-peek');
  const text = s.join(' ');
  assert.match(text, /\b4\s?m\b/);
  assert.match(text, /\bright\b/i);
  assert.match(text, /\bonce\b|\bone\b/i);
  assert.match(text, /grounded|on the ground/i);
  assert.match(text, /still/i);
  assert.doesNotMatch(text, /\bleft\b(?! crate)/i, 'dash direction is right, only the crate is left');
});
