import { describe, expect, it } from 'vitest';
import { APP_ORIGIN, shareOrigin } from './origin';

describe('el dominio de los links que se comparten', () => {
  it('en producción, en cualquiera de sus direcciones, es matchmate.grullonb.com', () => {
    expect(APP_ORIGIN).toBe('https://matchmate.grullonb.com');
    expect(shareOrigin('https://matchmate.grullonb.com')).toBe(APP_ORIGIN);
    expect(shareOrigin('https://matchmate-oficial.vercel.app')).toBe(APP_ORIGIN);
    expect(shareOrigin(null)).toBe(APP_ORIGIN);
  });

  it('en desarrollo o en una vista previa, donde corre', () => {
    expect(shareOrigin('http://localhost:5173')).toBe('http://localhost:5173');
    expect(shareOrigin('https://match-mate-git-rama-randygrullons-projects.vercel.app')).toBe('https://match-mate-git-rama-randygrullons-projects.vercel.app');
  });
});
