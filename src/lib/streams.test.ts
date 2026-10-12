import { describe, expect, it } from 'vitest';
import { embedUrl, normalizeStreamUrl, streamPlatform, youtubeId } from './streams';
import { streamFor, streamProblem, type LiveStream } from './data/streams';
import { cleanTag, recordText, squadJoinUrl, squadProblem, suggestTag } from './data/squads';

describe('links de transmisiones', () => {
  it('reconoce las plataformas permitidas, solo https y sin usuario ni puerto', () => {
    expect(streamPlatform('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('youtube');
    expect(streamPlatform('youtu.be/dQw4w9WgXcQ')).toBe('youtube');
    expect(streamPlatform('https://twitch.tv/liga_este')).toBe('twitch');
    expect(streamPlatform('https://fb.watch/abc123/')).toBe('facebook');
    expect(streamPlatform('https://kick.com/canal')).toBe('kick');
    expect(streamPlatform('https://www.instagram.com/p/xyz/')).toBe('instagram');
    expect(streamPlatform('https://vm.tiktok.com/ZM123/')).toBe('tiktok');
    expect(streamPlatform('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(streamPlatform('https://evil.com/youtube.com')).toBeNull();
    expect(streamPlatform('https://user:pw@youtube.com/')).toBeNull();
    expect(streamPlatform('https://youtube.com:8443/')).toBeNull();
    expect(streamPlatform(`https://youtube.com/${'x'.repeat(320)}`)).toBeNull();
    expect(normalizeStreamUrl('  youtu.be/dQw4w9WgXcQ ')).toBe('https://youtu.be/dQw4w9WgXcQ');
  });

  it('el id de YouTube de cualquier forma de link', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?si=abc',
      'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    ])
      expect(youtubeId(url)).toBe('dQw4w9WgXcQ');
    expect(youtubeId('https://www.youtube.com/@canal/live')).toBeNull();
  });

  it('se ve dentro de la app en YouTube, Twitch, Kick y Facebook; Instagram y TikTok se abren afuera', () => {
    expect(embedUrl('https://youtu.be/dQw4w9WgXcQ', 'app.test')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1');
    expect(embedUrl('https://www.twitch.tv/Liga_Este', 'app.test')).toBe('https://player.twitch.tv/?channel=liga_este&parent=app.test&autoplay=true');
    expect(embedUrl('https://www.twitch.tv/videos/123', 'app.test')).toBeNull();
    expect(embedUrl('https://kick.com/canal', 'app.test')).toBe('https://player.kick.com/canal');
    expect(embedUrl('https://www.facebook.com/liga/videos/123/', 'app.test')).toMatch(/^https:\/\/www\.facebook\.com\/plugins\/video\.php\?href=/);
    expect(embedUrl('https://www.instagram.com/liga/live/', 'app.test')).toBeNull();
    expect(embedUrl('https://www.tiktok.com/@liga/live', 'app.test')).toBeNull();
  });

  it('qué le falta para empezar y cuál es la de un partido', () => {
    expect(streamProblem({ url: ' ' })).toMatch(/Pega el link/);
    expect(streamProblem({ url: 'https://evil.com' })).toMatch(/YouTube/);
    expect(streamProblem({ url: 'https://youtu.be/dQw4w9WgXcQ', title: 'x'.repeat(81) })).toMatch(/80/);
    expect(streamProblem({ url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Final' })).toBeNull();
    const s = { id: 's1', matchId: 'm1', eventId: null } as LiveStream;
    expect(streamFor([s], { matchId: 'm1' })).toBe(s);
    expect(streamFor([s], { matchId: 'm2' })).toBeNull();
  });
});

describe('equipos', () => {
  it('el tag: mayúsculas sin espacios y uno sugerido por las iniciales', () => {
    expect(cleanTag(' tg-r ')).toBe('TGR');
    expect(suggestTag('Los Tigres del Este')).toBe('TE');
    expect(suggestTag('Águilas Doradas de Santiago')).toBe('ADS');
    expect(suggestTag('Leones')).toBe('LEO');
  });

  it('qué le falta al equipo', () => {
    expect(squadProblem({ name: 'A', tag: 'TGR' })).toMatch(/nombre/);
    expect(squadProblem({ name: 'Tigres', tag: 'T' })).toMatch(/tag/);
    expect(squadProblem({ name: 'Tigres', tag: 'tgr', description: 'x'.repeat(201) })).toMatch(/200/);
    expect(squadProblem({ name: 'Tigres', tag: 'tgr', city: 'Santo Domingo' })).toBeNull();
  });

  it('el récord y el link para unirse', () => {
    expect(recordText({ played: 0, won: 0, drawn: 0, lost: 0 })).toBe('');
    expect(recordText({ played: 7, won: 5, drawn: 0, lost: 2 })).toBe('5 G · 2 P');
    expect(recordText({ played: 8, won: 5, drawn: 1, lost: 2 })).toBe('5 G · 1 E · 2 P');
    expect(squadJoinUrl('https://matchmate-oficial.vercel.app/', 'ABCD2345')).toBe('https://matchmate-oficial.vercel.app/equipos/unirse/ABCD2345');
  });
});
