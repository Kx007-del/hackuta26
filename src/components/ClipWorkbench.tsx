import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ARENAS, type ChallengeConfig, type ClipReference } from '../../shared/contracts';
import './clip-workbench.css';

type Props = { config: ChallengeConfig; onChange: (config: ChallengeConfig) => void; locked?: boolean; onBusyChange?: (pending: boolean) => void };
type Draft = { file: File; url: string; duration: number; contentType: string; decoded?: boolean };
const MAX_SIZE = 50 * 1024 * 1024;
const seconds = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, '0')}`;
const mimeForFile = (file: File) => file.type || (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4');

export default function ClipWorkbench({ config, onChange, locked = false, onBusyChange }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reference, setReference] = useState<ClipReference | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [segmentPlaying, setSegmentPlaying] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const uploadLock = useRef(false);
  const arena = ARENAS.find(item => item.id === config.arenaId)!;
  const clipId = config.referenceClipId;
  const source = draft?.url || (reference ? `/api/clips/${encodeURIComponent(reference.id)}/media` : '');
  const clipDuration = draft?.duration || reference?.duration || 0;
  const segmentStart = draft ? start : reference?.start || 0;
  const segmentEnd = draft ? end : reference?.end || 0;
  const validSegment = !!draft?.decoded && clipDuration > 0 && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= clipDuration && end - start >= 0.25;
  useEffect(() => { onBusyChange?.(!!draft || uploading); return () => onBusyChange?.(false); }, [!!draft, uploading, onBusyChange]);

  useEffect(() => () => { if (draft?.url) URL.revokeObjectURL(draft.url); }, [draft?.url]);

  useEffect(() => {
    operation.current += 1;
    request.current?.abort();
    uploadLock.current = false;
    setUploading(false);
    setDraft(null);
    setStart(0);
    setEnd(0);
    setError('');
    setNotice('');
    setSegmentPlaying(false);
  }, [config.arenaId]);

  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setReference(null);
    setError('');
    setLoading(!!clipId);
    if (clipId) {
      fetch(`/api/clips/${encodeURIComponent(clipId)}`, { signal: controller.signal })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'This reference clip could not be loaded.');
          if (data.arenaId !== config.arenaId) throw new Error('This clip belongs to another game environment.');
          return data as ClipReference;
        })
        .then(data => { if (current) setReference(data); })
        .catch(cause => { if (current && cause.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Could not load this clip.'); })
        .finally(() => { if (current) setLoading(false); });
    }
    return () => { current = false; controller.abort(); };
  }, [clipId, config.arenaId, retry]);

  useEffect(() => () => { operation.current += 1; request.current?.abort(); }, []);

  function selectFile(file: File | undefined) {
    if (!file || locked || uploadLock.current) return;
    setError('');
    setNotice('');
    setSegmentPlaying(false);
    if (!/\.(mp4|webm|mov)$/i.test(file.name) || !['video/mp4', 'video/webm', 'video/quicktime'].includes(mimeForFile(file))) {
      setError('Choose an MP4, WebM, or MOV gameplay clip.'); return;
    }
    if (!file.size || file.size > MAX_SIZE) { setError('Choose a non-empty clip smaller than 50 MB.'); return; }
    setDraft({ file, url: URL.createObjectURL(file), duration: 0, contentType: mimeForFile(file) });
    setStart(0); setEnd(0);
    if (input.current) input.current.value = '';
  }

  function readDuration(event: ChangeEvent<HTMLVideoElement> | { currentTarget: HTMLVideoElement }) {
    const duration = event.currentTarget.duration;
    if (!draft) return;
    if (!Number.isFinite(duration) || duration < 0.25 || duration > 90) {
      setError('Choose a clip between 0.25 and 90 seconds long.');
      setDraft(null); return;
    }
    setDraft(current => current?.url === draft.url ? { ...current, duration } : current);
    setStart(0); setEnd(duration);
  }

  async function upload() {
    if (!draft || !validSegment || locked || uploadLock.current) return;
    uploadLock.current = true;
    const token = ++operation.current;
    const controller = new AbortController(); request.current = controller;
    setUploading(true); setError(''); setNotice('');
    const params = new URLSearchParams({ arenaId: config.arenaId, name: draft.file.name, duration: String(draft.duration), start: String(start), end: String(end) });
    try {
      const response = await fetch(`/api/clips?${params}`, {
        method: 'POST', headers: { 'Content-Type': draft.contentType }, body: draft.file, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The clip could not be saved. Try again.');
      if (token !== operation.current) return;
      if (data.arenaId !== config.arenaId || typeof data.id !== 'string') throw new Error('The uploaded clip returned unexpected settings. Please try again.');
      setReference(data as ClipReference);
      setDraft(null);
      setNotice('Reference ready. Match its movement below, land your version, then raise the bar.');
      onChange({ ...config, referenceClipId: data.id });
    } catch (cause) {
      if (token === operation.current && !(cause instanceof Error && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'The upload failed. Try again.');
    } finally {
      if (token === operation.current) { setUploading(false); uploadLock.current = false; }
    }
  }

  function cancelDraft() {
    operation.current += 1;
    request.current?.abort();
    uploadLock.current = false;
    setUploading(false); setDraft(null); setError(''); setNotice(''); setSegmentPlaying(false);
    if (input.current) input.current.value = '';
  }

  async function playMoment() {
    if (!video.current) return;
    setError('');
    video.current.currentTime = segmentStart;
    setSegmentPlaying(true);
    try { await video.current.play(); }
    catch { setSegmentPlaying(false); setError('Press play on the video to watch your selected moment.'); }
  }

  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); setDragging(false);
    selectFile(event.dataTransfer.files[0]);
  }

  return <section className="clip-workbench" aria-label="Reference clip workbench">
    <div className="clip-section-label"><span>02 / BRING THE MOMENT</span><span>{arena.game} / REFERENCE CLIP</span></div>
    <div className="clip-workbench__layout">
      <div className="clip-workbench__viewer">
        {source ? <video key={source} ref={video} src={source} controls playsInline preload="metadata"
          aria-label="Reference gameplay clip"
          onLoadedMetadata={readDuration}
          onLoadedData={() => setDraft(current => current ? {...current, decoded: true} : current)}
          onTimeUpdate={event => { if (segmentPlaying && event.currentTarget.currentTime >= segmentEnd) { event.currentTarget.pause(); setSegmentPlaying(false); } }}
          onError={() => { setSegmentPlaying(false); setDraft(null); setError('This browser cannot play the clip. Try an H.264 MP4 or a WebM file.'); }}
        /> : <div className={`clip-dropzone${dragging ? ' is-dragging' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!locked) setDragging(true); }}
          onDragLeave={() => setDragging(false)} onDrop={drop}>
          <img src="/brand/logo.png" alt="FaZe"/>
          <span className="clip-workbench__eyebrow">YOUR REFERENCE. YOUR RECREATION.</span>
          <h2>{loading ? 'LOADING THE MOMENT…' : locked ? 'A NEW MOMENT STARTS HERE.' : 'DROP THE CLIP.\nRUN IT BACK.'}</h2>
          <p>{locked ? 'This challenge was created without a reference clip. Recreate its arena settings to join the relay.' : 'Bring a gameplay moment from your chosen game. Watch it, choose the action, and make it playable in the arena.'}</p>
          {!locked && <button type="button" className="secondary" disabled={uploading} onClick={() => input.current?.click()}>CHOOSE A CLIP ↗</button>}
          <span className="clip-workbench__file-note">MP4 / WEBM / MOV · UP TO 50 MB · 90 SECONDS</span>
        </div>}
        {!!source && <div className="clip-player-caption"><span>{draft ? 'PREVIEW / NOT SAVED YET' : 'SQUAD REFERENCE / SAVED'}</span><span>{seconds(segmentStart)} — {seconds(segmentEnd)}</span></div>}
      </div>
      <div className="clip-workbench__details">
        <span className="clip-workbench__eyebrow">WATCH → RECREATE → RAISE THE BAR</span>
        <h2>{draft ? 'PICK THE MOMENT.' : reference ? 'MAKE YOUR VERSION.' : 'FROM CLIP TO CHALLENGE.'}</h2>
        <p>{draft ? 'Select the start and end of the action you want to recreate. Save that reference, then set up your shot below.' : reference ? 'Keep the original in view as you practice. Match the shot with the arena controls, then change its difficulty and prove your remix.' : 'Choose a clip and a moment. Use the arena’s mechanics and challenge settings to recreate it, then make it harder for your squad.'}</p>
        {(draft || reference) && <div className="clip-reference-name"><strong>{draft?.file.name || reference?.name}</strong><span>{draft ? 'YOUR UPLOAD' : 'REFERENCE ATTACHED TO THIS CHALLENGE'}</span></div>}
        {draft && draft.duration > 0 && <div className="clip-trim">
          <div><label htmlFor="clip-trim-start">START / SECONDS</label><input id="clip-trim-start" type="number" min="0" max={draft.duration} step="0.1" value={start} disabled={uploading} onChange={event => { setStart(event.target.valueAsNumber); setSegmentPlaying(false); }}/></div>
          <div><label htmlFor="clip-trim-end">END / SECONDS</label><input id="clip-trim-end" type="number" min="0.25" max={draft.duration} step="0.1" value={end} disabled={uploading} onChange={event => { setEnd(event.target.valueAsNumber); setSegmentPlaying(false); }}/></div>
          {!validSegment && <p role="status">Choose a moment at least 0.25 seconds long within this clip.</p>}
        </div>}
        {!!source && <button type="button" className="secondary full" disabled={draft ? !validSegment : !reference} onClick={playMoment}>PLAY SELECTED MOMENT ▷</button>}
        {draft && <div className="clip-workbench__actions"><button type="button" className="primary" disabled={!validSegment || uploading} onClick={upload}>{uploading ? 'SAVING CLIP…' : 'USE THIS CLIP ↗'}</button><button type="button" className="clip-text-button" onClick={cancelDraft}>{uploading ? 'CANCEL UPLOAD' : 'CANCEL'}</button></div>}
        {!locked && !draft && source && <button type="button" className="clip-text-button" onClick={() => input.current?.click()}>REPLACE REFERENCE ↗</button>}
        {clipId && !reference && !loading && !draft && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>RETRY CLIP</button>}
        {error && <p className="clip-workbench__error" role="alert">{error}</p>}
        {notice && <p className="clip-workbench__notice" role="status">{notice}</p>}
        <p className="clip-workbench__guided">Guided recreation: you choose the mechanics and settings. A clip is a reference, not an automatic copy of its map.</p>
      </div>
    </div>
    <input ref={input} type="file" className="clip-native-input" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" aria-label="Upload a gameplay clip" disabled={locked || uploading} onChange={event => selectFile(event.target.files?.[0])}/>
  </section>;
}
