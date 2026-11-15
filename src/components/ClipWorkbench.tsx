import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ARENAS, type ChallengeConfig, type ClipReference } from '../../shared/contracts';
import { parseVideoLink, TIKTOK_HOSTS, videoEmbedUrl, type VideoLink } from '../../shared/video-links';
import './clip-workbench.css';

type Props = { config: ChallengeConfig; onChange: (config: ChallengeConfig) => void; locked?: boolean; onBusyChange?: (pending: boolean) => void };
const seconds = (time: number) => `${Math.floor(time / 60)}:${(time % 60).toFixed(1).padStart(4, '0')}`;

function LinkedPlayer({ link, start, end }: { link: VideoLink; start: number; end: number }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (link.provider !== 'tiktok') return;
    const send = (type: string, value?: number) => frame.current?.contentWindow?.postMessage({ type, value, 'x-tiktok-player': true }, 'https://www.tiktok.com');
    const receive = (event: MessageEvent) => {
      if (event.origin !== 'https://www.tiktok.com' || event.source !== frame.current?.contentWindow || !event.data || event.data['x-tiktok-player'] !== true) return;
      if (event.data.type === 'onPlayerReady') send('seekTo', start);
      if (event.data.type === 'onCurrentTime' && typeof event.data.value?.currentTime === 'number' && event.data.value.currentTime >= end) send('pause');
      if (event.data.type === 'onPlayerError' || event.data.type === 'onError') setFailed(true);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [link.provider, link.videoId, start, end]);
  return <div className="clip-linked-player">
    <iframe key={`${link.provider}/${link.videoId}/${start}/${end}`} ref={frame} src={videoEmbedUrl(link, start, end)} title={`${link.provider === 'youtube' ? 'YouTube' : 'TikTok'} reference video`}
      allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" onError={() => setFailed(true)} />
    {failed && <p role="alert">The provider could not play this video here. Open the original link or choose another public video.</p>}
    <a href={link.url} target="_blank" rel="noopener noreferrer">OPEN ORIGINAL VIDEO ↗</a>
  </div>;
}

export default function ClipWorkbench({ config, onChange, locked = false, onBusyChange }: Props) {
  const [reference, setReference] = useState<ClipReference | null>(null);
  const [url, setUrl] = useState('');
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(10);
  const [preview, setPreview] = useState<VideoLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const request = useRef<AbortController | null>(null);
  const operation = useRef(0);
  const saveLock = useRef(false);
  const arena = ARENAS.find(item => item.id === config.arenaId)!;
  const clipId = config.referenceClipId;
  const validMoment = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end <= 86400 && end - start >= 0.25 && end - start <= 90;
  const linked = preview ?? (reference?.source === 'link' ? reference : null);
  const momentStart = preview ? start : reference?.start ?? 0;
  const momentEnd = preview ? end : reference?.end ?? 0;

  useEffect(() => { onBusyChange?.(saving); return () => onBusyChange?.(false); }, [saving, onBusyChange]);
  useEffect(() => { setUrl(''); setStart(0); setEnd(10); setPreview(null); setNotice(''); }, [config.arenaId]);
  useEffect(() => {
    operation.current += 1;
    request.current?.abort();
    saveLock.current = false; setSaving(false);
    let current = true;
    const controller = new AbortController();
    setReference(null); setPreview(null); setError(''); setLoading(!!clipId);
    if (clipId) {
      fetch(`/api/clips/${encodeURIComponent(clipId)}`, { signal: controller.signal })
        .then(async response => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'This reference could not be loaded.');
          if (data.arenaId !== config.arenaId) throw new Error('This reference belongs to another game environment.');
          return data as ClipReference;
        })
        .then(data => { if (current) setReference(data); })
        .catch(cause => { if (current && cause.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Could not load this reference.'); })
        .finally(() => { if (current) setLoading(false); });
    }
    return () => { current = false; controller.abort(); };
  }, [clipId, config.arenaId, retry]);
  useEffect(() => () => { operation.current += 1; request.current?.abort(); }, []);
  useEffect(() => {
    if (locked) { operation.current += 1; request.current?.abort(); saveLock.current = false; setSaving(false); setPreview(null); }
  }, [locked]);

  function previewLink() {
    if (locked || saving || !validMoment) return;
    setError(''); setNotice('');
    try {
      const parsed = parseVideoLink(url);
      if (!parsed) {
        // Only TikTok short share links need server-side resolution; anything else is simply unsupported.
        const tiktok = TIKTOK_HOSTS.has(new URL(url.trim()).hostname);
        setError(tiktok
          ? 'For TikTok short share links, select USE THIS LINK to resolve and preview the video. Otherwise paste a full video URL.'
          : 'Use a YouTube, YouTube Shorts, or TikTok video link, not a profile or playlist.');
        return;
      }
      setPreview(parsed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the video link.'); }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (locked || saveLock.current || !validMoment || !url.trim()) return;
    saveLock.current = true;
    const token = ++operation.current;
    const controller = new AbortController(); request.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/clips/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, arenaId: config.arenaId, start, end }), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The reference could not be saved.');
      if (token !== operation.current) return;
      if (data.source !== 'link' || data.arenaId !== config.arenaId || typeof data.id !== 'string') throw new Error('The reference returned unexpected settings. Please try again.');
      setPreview(null); setReference(data); setNotice('Reference saved. Match its movement in the arena below.');
      onChange({ ...config, referenceClipId: data.id });
    } catch (cause) {
      if (token === operation.current && !(cause instanceof Error && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Could not save the reference. Try again.');
    } finally { if (token === operation.current) { setSaving(false); saveLock.current = false; } }
  }

  function cancel() {
    operation.current += 1; request.current?.abort(); saveLock.current = false;
    setSaving(false); setPreview(null); setError(''); setNotice('');
  }

  return <section className="clip-workbench" aria-label="Reference clip workbench">
    <div className="clip-section-label"><span>02 / BRING THE MOMENT</span><span>{arena.game} / REFERENCE VIDEO</span></div>
    <div className="clip-workbench__layout">
      <div className="clip-workbench__viewer">
        {linked ? <LinkedPlayer link={linked} start={momentStart} end={momentEnd} />
          : reference && reference.source !== 'link' ? <video ref={video} src={`/api/clips/${encodeURIComponent(reference.id)}/media`} controls playsInline preload="metadata" aria-label="Saved reference gameplay clip"
            onTimeUpdate={event => { if (event.currentTarget.currentTime >= reference.end) event.currentTarget.pause(); }}
            onError={() => setError('This saved upload is unavailable or cannot play in this browser.')} />
          : <div className="clip-dropzone">
            <img src="/brand/logo.png" alt="FaZe" />
            <span className="clip-workbench__eyebrow">YOUR REFERENCE. YOUR RECREATION.</span>
            <h2>{loading ? 'LOADING THE MOMENT…' : locked ? 'A NEW MOMENT STARTS HERE.' : 'PASTE THE LINK.\nRUN IT BACK.'}</h2>
            <p>{locked ? 'This challenge was created without a reference video. Recreate its arena settings to join the relay.' : 'Bring a YouTube video, Short, or TikTok. Keep the original in view while you recreate the action.'}</p>
            <span className="clip-workbench__file-note">YOUTUBE / SHORTS / TIKTOK · NO FILE UPLOAD NEEDED</span>
          </div>}
        {(linked || reference) && <div className="clip-player-caption"><span>{preview ? 'LINK PREVIEW / NOT SAVED YET' : 'SQUAD REFERENCE / SAVED'}</span><span>{seconds(momentStart)} — {seconds(momentEnd)}</span></div>}
      </div>
      <div className="clip-workbench__details">
        <span className="clip-workbench__eyebrow">WATCH → RECREATE → RAISE THE BAR</span>
        <h2>{reference ? 'MAKE YOUR VERSION.' : locked ? 'THE CHALLENGE IS SET.' : 'ONE LINK. YOUR NEXT PLAY.'}</h2>
        <p>{locked
          ? 'This challenge is locked. Match its arena settings in the practice arena below.'
          : 'Paste a public video link and choose the action’s start and end in seconds. Save up to 90 seconds as your squad’s reference moment.'}</p>
        {reference && <div className="clip-reference-name"><strong>{reference.name}</strong><span>REFERENCE ATTACHED TO THIS CHALLENGE</span></div>}
        {!locked && <form className="clip-link-form" onSubmit={save}>
          <label htmlFor="clip-link">VIDEO LINK</label>
          <input id="clip-link" type="url" inputMode="url" required maxLength={2048} value={url} placeholder="https://youtube.com/shorts/…" disabled={saving} autoComplete="off" aria-describedby="clip-link-help" onChange={event => { setUrl(event.target.value); setPreview(null); setError(''); }} />
          <p id="clip-link-help">YouTube, youtu.be, Shorts, or TikTok video/share links.</p>
          <div className="clip-trim">
            <div><label htmlFor="clip-trim-start">START / SECONDS</label><input id="clip-trim-start" type="number" min={0} max={86399.75} step="any" value={Number.isNaN(start) ? '' : start} disabled={saving} required onChange={event => { setStart(event.target.valueAsNumber); setPreview(null); }} /></div>
            <div><label htmlFor="clip-trim-end">END / SECONDS</label><input id="clip-trim-end" type="number" min={0.25} max={86400} step="any" value={Number.isNaN(end) ? '' : end} disabled={saving} required onChange={event => { setEnd(event.target.valueAsNumber); setPreview(null); }} /></div>
            {!validMoment && <p role="status">Choose 0.25–90 seconds, within the first 24 hours of the video.</p>}
          </div>
          <div className="clip-workbench__actions">
            <button type="button" className="secondary" disabled={!url.trim() || !validMoment || saving} onClick={previewLink}>PREVIEW LINK ▷</button>
            <button type="submit" className="primary" disabled={!url.trim() || !validMoment || saving}>{saving ? 'SAVING LINK…' : reference ? 'REPLACE REFERENCE ↗' : 'USE THIS LINK ↗'}</button>
          </div>
          {(saving || preview) && <button type="button" className="clip-text-button" onClick={cancel}>{saving ? 'CANCEL SAVE' : 'CLOSE PREVIEW'}</button>}
        </form>}
        {reference && reference.source !== 'link' && <button type="button" className="secondary" onClick={() => { if (video.current) { video.current.currentTime = reference.start; void video.current.play().catch(() => setError('Use the video’s play control to watch this reference.')); } }}>PLAY SAVED MOMENT ▷</button>}
        {clipId && !reference && !loading && <button type="button" className="secondary" onClick={() => setRetry(value => value + 1)}>RETRY REFERENCE</button>}
        {error && <p className="clip-workbench__error" role="alert">{error}</p>}
        {notice && <p className="clip-workbench__notice" role="status">{notice}</p>}
        <p className="clip-workbench__guided">Videos play through their original provider. Private, removed, region-restricted, or embed-disabled videos may need to be opened at the source. Times mark your reference moment; they do not download or cut the original video.</p>
        <p className="clip-workbench__guided">Guided recreation: you choose the mechanics and settings. A video is a reference, not an automatic copy of its map.</p>
      </div>
    </div>
  </section>;
}
