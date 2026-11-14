import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalRelayRoute, hasHostMarker, hostMarkerKey, parseRoute, rememberHost, routeSearch, type Route } from '../src/navigation';

type Valid = Exclude<Route, { screen: 'invalid' }>;
const INVALID = { screen: 'invalid' };
const ID100 = 'a'.repeat(100);
const CHARSET = 'AZaz09_-';

function memoryStorage(entries: Array<[string, string]> = []) {
  const map = new Map<string, string>(entries);
  return {
    map,
    getItem: (key: string): string | null => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string): void => { map.set(key, String(value)); },
  };
}

test('parseRoute maps the frozen URL contract', () => {
  const cases: Array<[string, Route]> = [
    ['', { screen: 'home' }],
    ['?', { screen: 'home' }],
    ['?screen=arena', { screen: 'arena' }],
    ['?screen=arena&parent=p1', { screen: 'arena', parentId: 'p1' }],
    ['?relay=abc', { screen: 'relay', id: 'abc' }],
    ['?relay=abc&screen=premiere', { screen: 'premiere', id: 'abc' }],
    ['?screen=premiere&relay=abc', { screen: 'premiere', id: 'abc' }],
    ['relay=abc', { screen: 'relay', id: 'abc' }],
    [`?relay=${ID100}`, { screen: 'relay', id: ID100 }],
    [`?relay=${CHARSET}`, { screen: 'relay', id: CHARSET }],
    [`?screen=arena&parent=${ID100}`, { screen: 'arena', parentId: ID100 }],
  ];
  for (const [search, expected] of cases) assert.deepEqual(parseRoute(search), expected, search);
});

test('parseRoute rejects malformed, duplicate and conflicting params', () => {
  const invalid = [
    '?screen=', '?screen=bogus', '?screen=Arena', '?screen=relay', '?screen=premiere', '?screen=home',
    '?screen=arena&screen=arena', '?screen=arena&screen=premiere', '?relay=abc&screen=premiere&screen=premiere',
    '?relay=', '?relay=a&relay=b', '?relay=a&relay=a', '?relay=abc&screen=', '?relay=abc&screen=arena',
    '?relay=abc&screen=Premiere', '?relay=abc&parent=p1', '?relay=abc&screen=premiere&parent=p1',
    '?parent=p1', '?screen=arena&parent=', '?screen=arena&parent=a&parent=b', '?screen=arena&parent=bad.id',
    `?relay=${'a'.repeat(101)}`, `?screen=arena&parent=${'a'.repeat(101)}`,
    '?relay=a%20b', '?relay=a+b', '?relay=..%2Fetc', '?relay=a.b', '?relay=%C3%A9', '?relay=a%00', '?relay=%3Cscript%3E',
  ];
  for (const search of invalid) assert.deepEqual(parseRoute(search), INVALID, search);
});

test('parseRoute ignores unrelated params (characterizes current behavior)', () => {
  assert.deepEqual(parseRoute('?utm_source=x'), { screen: 'home' });
  assert.deepEqual(parseRoute('?relay=abc&utm_source=x'), { screen: 'relay', id: 'abc' });
  assert.deepEqual(parseRoute('?screen=arena&fbclid=1'), { screen: 'arena' });
});

test('routeSearch emits canonical searches that round-trip, including remix parent', () => {
  const expected: Array<[Valid, string]> = [
    [{ screen: 'home' }, ''],
    [{ screen: 'arena' }, '?screen=arena'],
    [{ screen: 'arena', parentId: 'p_1-X' }, '?screen=arena&parent=p_1-X'],
    [{ screen: 'relay', id: 'abc' }, '?relay=abc'],
    [{ screen: 'premiere', id: 'abc' }, '?relay=abc&screen=premiere'],
    [{ screen: 'relay', id: ID100 }, `?relay=${ID100}`],
  ];
  for (const [route, search] of expected) {
    assert.equal(routeSearch(route), search);
    assert.deepEqual(parseRoute(search), route, search);
  }
});

test('routeSearch encodes unsafe ids so they parse invalid instead of injecting params', () => {
  const relay = routeSearch({ screen: 'relay', id: 'abc&screen=arena' });
  assert.equal(relay, '?relay=abc%26screen%3Darena');
  assert.deepEqual(parseRoute(relay), INVALID);
  assert.deepEqual(parseRoute(routeSearch({ screen: 'arena', parentId: 'x&relay=y' })), INVALID);
  assert.deepEqual(parseRoute(routeSearch({ screen: 'premiere', id: 'a b' })), INVALID);
});

test('canonicalRelayRoute: waiting -> relay, completed -> premiere', () => {
  assert.deepEqual(canonicalRelayRoute('abc', 'waiting'), { screen: 'relay', id: 'abc' });
  assert.deepEqual(canonicalRelayRoute('abc', 'completed'), { screen: 'premiere', id: 'abc' });
  assert.equal(routeSearch(canonicalRelayRoute('abc', 'completed')), '?relay=abc&screen=premiere');
  assert.deepEqual(parseRoute(routeSearch(canonicalRelayRoute('abc', 'waiting'))), { screen: 'relay', id: 'abc' });
});

test('host marker is per-store: host context remembers, fresh guest context does not', () => {
  const host = memoryStorage();
  const guest = memoryStorage();
  assert.equal(hostMarkerKey('abc'), 'rib-host-relay:abc');
  assert.equal(hasHostMarker(host, 'abc'), false);
  rememberHost(host, 'abc');
  assert.equal(host.map.get('rib-host-relay:abc'), '1');
  assert.equal(hasHostMarker(host, 'abc'), true);
  assert.equal(hasHostMarker(guest, 'abc'), false);
  assert.equal(hasHostMarker(host, 'abcd'), false);
  assert.equal(hasHostMarker(host, 'ab'), false);
  assert.equal(hasHostMarker(memoryStorage([...host.map]), 'abc'), true, 'duplicated tab may inherit');
  rememberHost(host, 'abc');
  assert.equal(host.map.size, 1);
});

test('only the exact value "1" counts as a host marker', () => {
  for (const value of ['', '0', 'true', 'yes', ' 1', '1 ', '{}', 'null']) {
    assert.equal(hasHostMarker(memoryStorage([[hostMarkerKey('abc'), value]]), 'abc'), false, JSON.stringify(value));
  }
});

test('storage failures propagate from helpers (App must catch and degrade)', () => {
  const broken = {
    getItem(): string | null { throw new Error('SecurityError'); },
    setItem(): void { throw new Error('QuotaExceededError'); },
  };
  assert.throws(() => hasHostMarker(broken, 'abc'), /SecurityError/);
  assert.throws(() => rememberHost(broken, 'abc'), /QuotaExceededError/);
});
