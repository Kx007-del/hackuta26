import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, readdirSync, statSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { ARENAS, type ArenaId, type ClipReference } from '../../shared/contracts';

export const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const MAX_STORED_BYTES = 512 * 1024 * 1024;
const idValid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const extensions: Record<string, string> = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
const supportedType = (v: unknown): v is string => typeof v === 'string' && Object.prototype.hasOwnProperty.call(extensions, v);

/** Container-header check; browser decoding is still required before upload. */
export function validVideoHeader(bytes: Buffer, type: string) {
  if (bytes.length < 24) return false;
  if (type === 'video/webm') return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (type !== 'video/mp4' && type !== 'video/quicktime') return false;
  if (bytes.toString('ascii', 4, 8) !== 'ftyp') return false;
  const size = bytes.readUInt32BE(0);
  if (size < 16 || size > bytes.length || (size - 16) % 4 !== 0) return false;
  const major = bytes.toString('latin1', 8, 12);
  return type === 'video/quicktime' ? major === 'qt  ' : new Set(['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','dash','M4V ']).has(major);
}

export function registerClipApi(app: Express, options: { directory?: string } = {}) {
  const database = process.env.DATABASE_PATH?.trim();
  const defaultDirectory = database && database !== ':memory:' ? join(dirname(resolve(database)), 'clips') : resolve('data/clips');
  const directory = resolve(options.directory ?? (process.env.CLIP_DIRECTORY?.trim() || defaultDirectory));
  mkdirSync(directory, { recursive: true });
  // One server process owns this directory. Retain orphan media for explicit recovery.
  for (const file of readdirSync(directory)) {
    if (file.endsWith('.json.tmp') && idValid(file.slice(0, -9))) unlinkSync(join(directory, file));
  }
  function writeSynced(file: string, data: string | Buffer) {
    const fd = openSync(file, 'wx');
    try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  }
  function get(id: string): ClipReference | undefined {
    if (!idValid(id)) return undefined;
    const file = join(directory, id + '.json');
    if (!existsSync(file)) return undefined;
    try {
      const clip = JSON.parse(readFileSync(file, 'utf8')) as ClipReference;
      if (!clip || typeof clip !== 'object' || clip.id !== id || !supportedType(clip.contentType) || !ARENAS.some(a => a.id === clip.arenaId) || typeof clip.name !== 'string' || !clip.name.trim() || clip.name.length > 160 || /[\u0000-\u001f\u007f]/.test(clip.name) || !Number.isSafeInteger(clip.size) || clip.size < 24 || clip.size > MAX_CLIP_BYTES || ![clip.duration,clip.start,clip.end].every(v => typeof v === 'number' && Number.isFinite(v)) || clip.duration <= 0 || clip.duration > 90 || clip.start < 0 || clip.end <= clip.start || clip.end > clip.duration || typeof clip.createdAt !== 'string' || !Number.isFinite(Date.parse(clip.createdAt))) return undefined;
      const media = statSync(join(directory, id + extensions[clip.contentType]));
      return media.isFile() && media.size === clip.size ? clip : undefined;
    } catch { return undefined; }
  }
  const fail = (res: Response, message: string, status = 400) => res.status(status).json({ error: message });
  const raw = express.raw({ type: () => true, limit: MAX_CLIP_BYTES, inflate: false });
  let uploads = 0;
  let closing = false;
  const pending = new Set<() => void>();
  app.post('/api/clips', (req, res, next) => {
    const type = req.headers['content-type']?.split(';')[0].trim().toLowerCase() ?? '';
    if (!supportedType(type)) { fail(res, 'Choose an MP4, WebM, or MOV video.', 415); return; }
    if (req.headers['content-encoding'] && req.headers['content-encoding'].trim().toLowerCase() !== 'identity') { fail(res, 'Compressed uploads are not supported.', 415); return; }
    if (closing || uploads >= 2) { res.setHeader('Connection', 'close'); fail(res, 'Two uploads are already in progress. Try again shortly.', 503); return; }
    const length = Number(req.headers['content-length']);
    if (length > MAX_CLIP_BYTES) { res.setHeader('Connection', 'close'); fail(res, 'Clips must be 50 MB or smaller.', 413); return; }
    uploads += 1;
    let released = false;
    const timer = setTimeout(() => {
      if (req.readableEnded || res.writableEnded || res.destroyed) return;
      res.setHeader('Connection', 'close');
      res.once('finish', () => req.destroy());
      fail(res, 'Clip upload timed out. Please try again.', 408);
    }, 60_000);
    timer.unref();
    const cancel = () => { req.destroy(); res.destroy(); };
    pending.add(cancel);
    const release = () => { if (!released) { released = true; uploads -= 1; clearTimeout(timer); pending.delete(cancel); } };
    res.once('finish', release); res.once('close', release);
    raw(req, res, error => {
      if (res.writableEnded || res.destroyed || req.aborted) return;
      if (error) { fail(res, 'Clip upload failed. Choose a video up to 50 MB.', (error as {status?:number}).status === 413 ? 413 : 400); return; }
      next();
    });
  }, (req: Request, res: Response) => {
    const arenaId = req.query.arenaId;
    const name = typeof req.query.name === 'string' ? req.query.name.trim() : '';
    const queryNumber = (v: unknown) => typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    const duration = queryNumber(req.query.duration), start = queryNumber(req.query.start), end = queryNumber(req.query.end);
    if (typeof arenaId !== 'string' || !ARENAS.some(a => a.id === arenaId)) { fail(res, 'Select one of the three environments.'); return; }
    if (!name || name.length > 160 || /[\u0000-\u001f\u007f]/.test(name)) { fail(res, 'Use a clip name between 1 and 160 characters.'); return; }
    if (![duration, start, end].every(Number.isFinite) || duration <= 0 || duration > 90 || start < 0 || end <= start || end > duration) { fail(res, 'Select a valid moment within a clip up to 90 seconds long.'); return; }
    const contentType = req.headers['content-type']!.split(';')[0].trim().toLowerCase();
    if (!Buffer.isBuffer(req.body) || req.body.length > MAX_CLIP_BYTES || !validVideoHeader(req.body, contentType)) { fail(res, 'This file does not have a supported video container.'); return; }
    const id = randomUUID();
    const mediaPath = join(directory, id + extensions[contentType]);
    const metadataPath = join(directory, id + '.json');
    let committed = false;
    try {
      const total = readdirSync(directory).filter(file => /\.(mp4|webm|mov)$/.test(file)).reduce((size, file) => size + statSync(join(directory, file)).size, 0);
      if (total + req.body.length > MAX_STORED_BYTES) { fail(res, 'Clip storage is full. Ask the host to free space before uploading.', 507); return; }
      const clip: ClipReference = { id, arenaId: arenaId as ArenaId, name, contentType, size: req.body.length, duration, start, end, createdAt: new Date().toISOString() };
      writeSynced(mediaPath, req.body);
      writeSynced(metadataPath + '.tmp', JSON.stringify(clip));
      renameSync(metadataPath + '.tmp', metadataPath);
      committed = true;
      res.status(201).json(clip);
    } catch {
      if (!committed) for (const file of [mediaPath, metadataPath + '.tmp']) { try { unlinkSync(file); } catch {} }
      fail(res, 'Unable to save this clip. Please try again.', 500);
    }
  });
  app.get('/api/clips/:id', (req, res) => {
    const clip = get(String(req.params.id));
    if (!clip) { fail(res, 'Reference clip not found.', 404); return; }
    res.json(clip);
  });
  app.get('/api/clips/:id/media', (req, res, next) => {
    const clip = get(String(req.params.id));
    if (!clip) { fail(res, 'Reference clip not found.', 404); return; }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]) || (match[1] && match[2] && Number(match[1]) > Number(match[2]))) delete req.headers.range;
    }
    res.type(clip.contentType).sendFile(join(directory, clip.id + extensions[clip.contentType]), {acceptRanges: true, dotfiles: 'deny'}, error => {
      if (!error) return;
      if (res.headersSent) { next(error); return; }
      const status = (error as {status?:number}).status;
      if (status === 416) { res.setHeader('Content-Range', `bytes */${clip.size}`); res.status(416).end(); return; }
      fail(res, 'Reference media is unavailable.', status === 404 ? 404 : 500);
    });
  });
  return { get, close: () => { closing = true; for (const cancel of pending) cancel(); } };
}
