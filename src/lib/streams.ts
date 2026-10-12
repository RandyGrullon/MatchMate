/**
 * Links de transmisiones en vivo (docs/equipos-y-en-vivo.md §2): qué plataforma es, si se puede ver dentro de la app y
 * con qué URL. Las mismas plataformas que acepta la base (`private.stream_platform`): YouTube, Twitch, Facebook, Kick,
 * Instagram y TikTok, siempre https. Instagram y TikTok no dejan ver el video dentro de otra página: se abren afuera.
 */

export type StreamPlatform = 'youtube' | 'twitch' | 'facebook' | 'kick' | 'instagram' | 'tiktok';

export const PLATFORM_LABEL: Record<StreamPlatform, string> = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  facebook: 'Facebook',
  kick: 'Kick',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const HOSTS: Record<string, StreamPlatform> = {
  'youtube.com': 'youtube',
  'www.youtube.com': 'youtube',
  'm.youtube.com': 'youtube',
  'youtu.be': 'youtube',
  'twitch.tv': 'twitch',
  'www.twitch.tv': 'twitch',
  'm.twitch.tv': 'twitch',
  'facebook.com': 'facebook',
  'www.facebook.com': 'facebook',
  'm.facebook.com': 'facebook',
  'fb.watch': 'facebook',
  'kick.com': 'kick',
  'www.kick.com': 'kick',
  'instagram.com': 'instagram',
  'www.instagram.com': 'instagram',
  'tiktok.com': 'tiktok',
  'www.tiktok.com': 'tiktok',
  'vm.tiktok.com': 'tiktok',
};

export const STREAM_URL_MAX = 300;

function parse(raw: string): URL | null {
  const text = raw.trim();
  if (!text || text.length > STREAM_URL_MAX) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return u;
  } catch {
    return null;
  }
}

/** La plataforma del link (null si no es https de una de las permitidas). */
export function streamPlatform(raw: string): StreamPlatform | null {
  const u = parse(raw);
  return u ? (HOSTS[u.hostname.toLowerCase()] ?? null) : null;
}

/** El link como lo guarda la base: https y sin espacios (null si no se acepta). */
export function normalizeStreamUrl(raw: string): string | null {
  const u = parse(raw);
  return u && HOSTS[u.hostname.toLowerCase()] ? u.toString() : null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** El id del video de YouTube (watch?v=, youtu.be/, /live/, /shorts/, /embed/). */
export function youtubeId(raw: string): string | null {
  const u = parse(raw);
  if (!u || HOSTS[u.hostname.toLowerCase()] !== 'youtube') return null;
  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  let id: string | null = null;
  if (host === 'youtu.be') id = parts[0] ?? null;
  else if (parts[0] === 'watch') id = u.searchParams.get('v');
  else if (['live', 'shorts', 'embed'].includes(parts[0] ?? '')) id = parts[1] ?? null;
  return id && YT_ID.test(id) ? id : null;
}

const CHANNEL = /^[A-Za-z0-9_]{2,40}$/;

/**
 * La URL para ver la transmisión dentro de la app (un iframe), o null si esa plataforma no lo permite (se abre el link).
 * `parent`: el dominio de la app (Twitch lo exige).
 */
export function embedUrl(raw: string, parent: string): string | null {
  const platform = streamPlatform(raw);
  const u = parse(raw);
  if (!platform || !u) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  switch (platform) {
    case 'youtube': {
      const id = youtubeId(raw);
      return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1` : null;
    }
    case 'twitch': {
      const channel = parts[0];
      if (!channel || !CHANNEL.test(channel) || parts.length > 1) return null;
      return `https://player.twitch.tv/?channel=${encodeURIComponent(channel.toLowerCase())}&parent=${encodeURIComponent(parent)}&autoplay=true`;
    }
    case 'kick': {
      const channel = parts[0];
      if (!channel || !CHANNEL.test(channel) || parts.length > 1) return null;
      return `https://player.kick.com/${encodeURIComponent(channel.toLowerCase())}`;
    }
    case 'facebook':
      return u.hostname.toLowerCase() === 'fb.watch' ? null : `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.toString())}&show_text=false`;
    default:
      return null;
  }
}
