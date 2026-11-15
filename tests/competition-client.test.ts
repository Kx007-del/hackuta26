import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTab, eventCode } from '../src/competitions/api';
import { submitScore } from '../packages/showcase-scoring/client';
import type { AttemptTelemetry } from '../packages/showcase-scoring/telemetry';

test('navigation maps nested routes to the proper tab; event code/link parsing rejects foreign path shapes', () => {
  for (const path of ['/', '/play', '/practice', '/results']) assert.equal(activeTab(path), 'Play');
  assert.equal(activeTab('/leaderboards'), 'Leaderboards');
  assert.equal(activeTab('/events/ABC123'), 'Join Events');
  assert.equal(activeTab('/host/events/event-123'), 'Host an Event');
  assert.equal(eventCode(' abcDEF123456 '), 'abcDEF123456');
  assert.equal(eventCode('https://hackuta26.onrender.com/events/ABCDEF123456?source=invite'), 'ABCDEF123456');
  for (const input of ['javascript:alert(1)', 'https://evil.invalid/host/events/abc', 'https://evil.invalid/events/a/b', '<script>']) assert.equal(eventCode(input), '');
});

test('event scoring sends only actual telemetry and owned ticket headers, never a clip or AI request', async () => {
  const original = globalThis.fetch;
  let sent: RequestInit | undefined;
  globalThis.fetch = async (_input, options) => { sent = options; return new Response(JSON.stringify({ score: 45, competition: { globalXpAwarded: 0 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try {
    const telemetry = { version: 1, shots: 1, ads: false, hit: false } as AttemptTelemetry;
    await submitScore(telemetry, new Blob(['private game clip'], { type: 'video/webm' }), 'yes', undefined, 'client-attempt', { eventId: 'event-uuid', ticketId: 'server-ticket' });
    const headers = sent!.headers as Record<string, string>;
    assert.equal(headers['x-competition-id'], 'event-uuid');
    assert.equal(headers['x-competition-attempt'], 'server-ticket');
    assert.equal(headers['x-attempt-id'], 'client-attempt');
    assert.equal(headers['x-score-ai'], 'no');
    assert.equal(sent!.body, undefined);
    assert.deepEqual(JSON.parse(Buffer.from(headers['x-score-telemetry'], 'base64url').toString()), telemetry);
    await submitScore(telemetry, new Blob(['ordinary game clip'], { type: 'video/webm' }), 'yes', undefined, 'global-attempt');
    assert.equal((sent!.headers as Record<string, string>)['x-score-ai'], 'yes');
    assert.equal((sent!.headers as Record<string, string>)['x-competition-id'], undefined);
    assert.ok(sent!.body instanceof Blob);
  } finally { globalThis.fetch = original; }
});
