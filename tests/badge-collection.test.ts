import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGES } from '../packages/progression/rules';
import { BADGE_FAMILIES, collection, compactBadges } from '../src/community/badges';

test('five distinct badge families cover every existing award exactly once', () => {
  assert.equal(BADGE_FAMILIES.length, 5);
  const ids = BADGE_FAMILIES.flatMap(f => [...f.ids]);
  assert.equal(new Set(ids).size, BADGES.length);
  assert.deepEqual([...ids].sort(), BADGES.map(b => b.id).sort());
  assert.equal(new Set(BADGE_FAMILIES.map(f => f.color)).size, 5);
  assert.equal(new Set(BADGE_FAMILIES.map(f => f.shape)).size, 5);
});

test('consolidation preserves earned milestones/dates without awarding anything or mutating server data', () => {
  const badges = BADGES.map((b, i) => Object.freeze({ ...b, earnedAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString() }));
  const before = JSON.stringify(badges);
  const grouped = collection(Object.freeze(badges));
  assert.equal(grouped.filter(b => b.earned).length, 5);
  assert.deepEqual(grouped.flatMap(b => b.milestones).map(b => [b.id,b.earnedAt]).sort(), badges.map(b => [b.id,b.earnedAt]).sort());
  assert.equal(JSON.stringify(badges), before);
  assert.deepEqual(compactBadges(badges.map(b => b.id)), ['first-run', 'dedicated', 'streak-7', 'top-ten', 'reigning-champion']);
  assert.ok(collection().every(b => !b.earned && b.milestones.every(m => m.earnedAt === null)));
});

test('partial awards stay in their correct family and compact strips never duplicate a family', () => {
  const input = BADGES.map(b => ({ ...b, earnedAt: ['first-run','regular','streak-3'].includes(b.id) ? '2026-11-15T12:00:00.000Z' : null }));
  const grouped = collection(input);
  assert.equal(grouped.filter(b => b.earned).length, 3);
  assert.equal(grouped.find(b => b.key === 'regular')!.next!.id, 'dedicated');
  assert.equal(grouped.find(b => b.key === 'streak')!.next!.id, 'streak-7');
  assert.equal(grouped.find(b => b.key === 'champion')!.earned, false);
  assert.deepEqual(compactBadges(['regular','regular','dedicated']), ['dedicated']);
});
