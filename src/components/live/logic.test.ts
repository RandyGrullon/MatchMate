import { describe, expect, it } from 'vitest';
import type { League } from '../../lib/types';
import { canStartStream, isStreamOfficial, linkHint, liveHref, ownStreamTitle, streamShareText, streamTitle } from './logic';

const league = (o: Partial<League> = {}) => ({ id: 'L1', name: 'Liga de Ejemplo', sport: 'esports', kind: 'liga', liveEnabled: true, ...o }) as League;

describe('transmisiones en vivo (lo puro)', () => {
  it('transmiten los admins y los anotadores (en el boliche, solo los admins), con la liga en vivo activada', () => {
    expect(isStreamOfficial({ isAdmin: true, member: null, league: league() })).toBe(true);
    expect(isStreamOfficial({ isAdmin: false, member: { scorer: true } as never, league: league() })).toBe(true);
    expect(isStreamOfficial({ isAdmin: false, member: { scorer: true } as never, league: league({ sport: 'bowling' }) })).toBe(false);
    expect(canStartStream({ isAdmin: true, member: null, league: league({ liveEnabled: false }) })).toBe(false);
  });
  it('el link de En vivo, el título y el texto al compartir', () => {
    expect(liveHref('L1', 'S 1')).toBe('/l/L1/vivo?s=S%201');
    expect(liveHref('L1')).toBe('/l/L1/vivo');
    expect(streamTitle({ title: ' ', label: 'Equipo Uno vs. Equipo Dos' })).toBe('Equipo Uno vs. Equipo Dos');
    expect(streamTitle({ title: null, label: null })).toBe('Transmisión de la liga');
    expect(streamShareText({ title: 'Final de ejemplo', label: null })).toBe('🔴 En vivo: Final de ejemplo');
  });
  it('lo que dice debajo del link y el título propio', () => {
    expect(linkHint('', false)).toEqual({ tone: 'muted', platform: null, text: 'De YouTube, Twitch, Facebook, Kick, Instagram o TikTok.' });
    expect(linkHint('', true).tone).toBe('error');
    expect(linkHint('https://www.youtube.com/watch?v=abcdefghijk', false)).toMatchObject({ tone: 'ok', platform: 'youtube' });
    expect(ownStreamTitle('Equipo Uno vs. Equipo Dos', 'Equipo Uno vs. Equipo Dos')).toBeNull();
    expect(ownStreamTitle('  La final  ', 'Equipo Uno vs. Equipo Dos')).toBe('La final');
  });
});
