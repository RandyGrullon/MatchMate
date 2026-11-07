import { describe, expect, it } from 'vitest';
import { PROFILE_TABS, profileTab } from './userProfileTabs';

describe('las partes del perfil público', () => {
  it('el link abre la parte que pide; si no, Publicaciones', () => {
    expect(profileTab('juegos')).toBe('juegos');
    expect(profileTab('estadisticas')).toBe('estadisticas');
    expect(profileTab('insignias')).toBe('insignias');
    expect(profileTab(null)).toBe('publicaciones');
    expect(profileTab(undefined)).toBe('publicaciones');
    expect(profileTab('Estadisticas')).toBe('publicaciones');
    expect(profileTab('cualquier-cosa')).toBe('publicaciones');
  });

  it('las cuatro pestañas en su orden', () => {
    expect(PROFILE_TABS.map((t) => t.label)).toEqual(['Publicaciones', 'Juegos', 'Estadísticas', 'Insignias']);
    for (const t of PROFILE_TABS) expect(profileTab(t.key)).toBe(t.key);
  });
});
