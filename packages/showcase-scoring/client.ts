import type { AttemptTelemetry } from './telemetry';
import type { ScoreResponse } from './server';

export type { ScoreResponse };
export type AiConsent = 'yes' | 'no' | undefined;
const CONSENT_KEY = 'rib-showcase-ai-scoring';

export function readConsent(): AiConsent {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'yes' || v === 'no' ? v : undefined; } catch { return undefined; }
}
export function writeConsent(value: 'yes' | 'no') {
  try { localStorage.setItem(CONSENT_KEY, value); } catch { /* storage unavailable: the choice lasts for this page only */ }
}

const PREFERRED_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
/** Restart a recording that has run this long without a shot, so clips stay short. */
export const MAX_RECORDING_MS = 12_000;

/** Records the game canvas only (no camera, mic, page or system audio). */
export function createAttemptRecorder(canvas: HTMLCanvasElement) {
  const supported = typeof MediaRecorder !== 'undefined' && typeof canvas.captureStream === 'function';
  const mimeType = supported ? PREFERRED_TYPES.find(t => MediaRecorder.isTypeSupported?.(t)) : undefined;
  let recorder: MediaRecorder | undefined;
  let chunks: Blob[] = [];
  let startedAt = 0;
  let stream: MediaStream | undefined;

  function discard() {
    if (recorder && recorder.state !== 'inactive') { recorder.ondataavailable = null; recorder.onstop = null; recorder.stop(); }
    recorder = undefined;
    chunks = [];
  }
  function start() {
    discard();
    if (!supported || !mimeType) return;
    try {
      stream ??= canvas.captureStream(30);
      const r = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1_500_000 });
      r.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      r.start(250);
      recorder = r;
      startedAt = performance.now();
    } catch { recorder = undefined; }
  }
  /** Call every frame: restarts a recording that has grown too long without a shot. */
  function maintain(now: number) {
    if (recorder && now - startedAt > MAX_RECORDING_MS) start();
  }
  /** Finish the current recording and return it (or undefined when unsupported/failed). */
  function finish(): Promise<{ blob: Blob; durationMs: number } | undefined> {
    const r = recorder;
    if (!r || r.state === 'inactive') return Promise.resolve(undefined);
    const durationMs = performance.now() - startedAt;
    return new Promise(resolve => {
      r.onstop = () => {
        const blob = chunks.length ? new Blob(chunks, { type: (r.mimeType || mimeType || 'video/webm').split(';')[0] }) : undefined;
        recorder = undefined;
        chunks = [];
        resolve(blob ? { blob, durationMs } : undefined);
      };
      r.stop();
    });
  }
  function dispose() {
    discard();
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
  }
  return { supported: !!(supported && mimeType), start, cancel: discard, maintain, finish, dispose };
}

/** A failed scoring request; `status` is 0 for a network failure. */
export class ScoreError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** A random id for one attempt, so a repeated request for it is recorded once. */
export function newAttemptId() {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
}

/** Sends the attempt for scoring. The clip is only sent when the player allowed AI scoring. */
export async function submitScore(telemetry: AttemptTelemetry, clip: Blob | undefined, consent: AiConsent, signal?: AbortSignal, attemptId?: string): Promise<ScoreResponse> {
  const json = JSON.stringify(telemetry);
  const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const sendClip = consent === 'yes' && clip && clip.size > 0 && clip.size <= 8 * 1024 * 1024;
  const response = await fetch('/api/showcase/score', {
    method: 'POST',
    headers: {
      'x-score-telemetry': encoded,
      'x-score-ai': sendClip ? 'yes' : 'no',
      ...(attemptId ? { 'x-attempt-id': attemptId } : {}),
      ...(sendClip ? { 'Content-Type': clip!.type || 'video/webm' } : {}),
    },
    body: sendClip ? clip : undefined,
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ScoreError(data?.error ?? 'Scoring is unavailable right now.', response.status);
  return data as ScoreResponse;
}
