import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { SHOWCASE_CONFIG, SHOWCASE_REFERENCE, isLegacyShowcaseLink } from '../src/showcase';

let vite: ViteDevServer;
let FortniteShowcase: (props: { search?: string }) => ReturnType<typeof createElement>;
before(async () => {
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  FortniteShowcase = (await vite.ssrLoadModule('/src/FortniteShowcase.tsx')).default;
});
after(async () => { await vite?.close(); });

test('public entry uses the fixed Fortnite showcase rather than the legacy app', () => {
  const entry = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
  assert.match(entry, /from "\.\/FortniteShowcase"/);
  assert.doesNotMatch(entry, /from ["']\.\/App["']/);
  assert.equal(SHOWCASE_CONFIG.arenaId, 'buildyard-v1');
  const html = renderToStaticMarkup(createElement(FortniteShowcase, { search: '' }));
  assert.match(html, /FORTNITE SHOWCASE/);
  assert.match(html, /still being built/);
  assert.match(html, /START PRACTICE/);
  assert.match(html, /<video[^>]*controls/);
  assert.match(html, /src="\/showcase\/fortnite-reference.mp4"/);
  assert.doesNotMatch(html, /Call of Duty|Valorant|Rooftop|Courtyard|<input|<iframe|leaderboard/i);
});

test('old game and relay deep links cannot select legacy experiences', () => {
  for (const search of ['?screen=arena&arena=rooftop-v1', '?screen=arena&arena=tactical-v1', '?relay=abc', '?parent=abc', '?arena=buildyard-v1&arena=rooftop-v1']) {
    assert.equal(isLegacyShowcaseLink(search), true);
    const html = renderToStaticMarkup(createElement(FortniteShowcase, { search }));
    assert.match(html, /earlier demo/);
    assert.match(html, /FORTNITE SHOWCASE/);
    assert.doesNotMatch(html, /<canvas|CALL OF DUTY|VALORANT/);
  }
  assert.equal(isLegacyShowcaseLink('?screen=arena&arena=buildyard-v1'), false);
});

test('the fixed reference is the exact supplied recording', () => {
  const bytes = readFileSync(new URL(`../public${SHOWCASE_REFERENCE.src}`, import.meta.url));
  const manifest = JSON.parse(readFileSync(new URL('../docs/showcase/reference.json', import.meta.url), 'utf8').trimStart());
  assert.equal(bytes.length, manifest.bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  assert.equal(manifest.source, 'Recording 2026-11-14 221821.mp4');
});
