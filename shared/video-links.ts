export type VideoLink = { provider: 'youtube' | 'tiktok'; videoId: string; url: string };
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
export const TIKTOK_HOSTS = new Set(['tiktok.com', 'www.tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com']);

export function videoLinkUrl(input: string): URL {
  if (input.length > 2048) throw new Error('Use a video link shorter than 2,048 characters.');
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('Paste a complete HTTPS YouTube, Shorts, or TikTok video link.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new Error('Use a public HTTPS video link without a login or custom port.');
  }
  return url;
}

/** Recognize video IDs, never HTML, scripts, playlists, or arbitrary iframe URLs. */
export function parseVideoLink(input: string): VideoLink | null {
  const url = videoLinkUrl(input);
  let id: string | undefined;
  if (url.hostname === 'youtu.be' || url.hostname === 'www.youtu.be') {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') ?? undefined
      : /^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname)?.[1];
  }
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) {
    return { provider: 'youtube', videoId: id, url: `https://www.youtube.com/watch?v=${id}` };
  }
  if (TIKTOK_HOSTS.has(url.hostname)) {
    const match = /^\/@([A-Za-z0-9._-]{1,64})\/video\/([0-9]{10,25})\/?$/.exec(url.pathname);
    if (match) return { provider: 'tiktok', videoId: match[2], url: `https://www.tiktok.com/@${match[1]}/video/${match[2]}` };
  }
  return null;
}

export function videoEmbedUrl(link: VideoLink, start: number, end: number): string {
  if (link.provider === 'youtube') {
    const params = new URLSearchParams({ start: String(Math.floor(start)), end: String(Math.ceil(end)), playsinline: '1', rel: '0' });
    return `https://www.youtube.com/embed/${link.videoId}?${params}`;
  }
  return `https://www.tiktok.com/player/v1/${link.videoId}?autoplay=0`;
}
