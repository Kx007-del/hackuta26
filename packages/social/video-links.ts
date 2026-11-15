import { parseVideoLink, TIKTOK_HOSTS, videoLinkUrl, type VideoLink } from '../../shared/video-links';

/** Expand only TikTok's own share links; every redirect is checked before fetching. */
export async function resolveVideoLink(input: string): Promise<VideoLink> {
  const direct = parseVideoLink(input);
  if (direct) return direct;
  let current = videoLinkUrl(input);
  const isShare = (url: URL) => ['vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)
    ? /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    : ['www.tiktok.com', 'tiktok.com'].includes(url.hostname) && /^\/t\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
  if (!isShare(current)) throw new Error('Use a YouTube, YouTube Shorts, or TikTok video link, not a profile or playlist.');
  const signal = AbortSignal.timeout(8000);
  for (let hop = 0; hop < 5; hop++) {
    // No cookies, authorization, server credentials, or user-supplied headers are forwarded.
    const response = await fetch(current, { method: 'HEAD', redirect: 'manual', signal });
    await response.body?.cancel();
    const location = response.headers.get('location');
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
    const next = videoLinkUrl(new URL(location, current).href);
    if (!TIKTOK_HOSTS.has(next.hostname)) break;
    const parsed = parseVideoLink(next.href);
    if (parsed) return parsed;
    current = next;
  }
  throw new Error('This TikTok share link could not be opened. Copy the full @creator/video link from your browser.');
}
