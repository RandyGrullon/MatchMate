/**
 * Piezas del perfil (renderToString, sin navegador): la cara grande (foto o iniciales en el color del deporte), el
 * «•••» con Bloquear y la tarjeta «Bloqueaste a …» con «Desbloquear».
 */
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AVATAR_BUCKET, primePublicUrl } from '../../lib/publicImages';
import { FeedbackProvider } from '../feedback';
import { BLOCK_EXPLAIN, BlockedCard, ProfileMoreMenu } from './BlockControls';
import { ProfileAvatar } from './ProfileAvatar';

const render = (el: ReactElement) => renderToString(h(MemoryRouter, null, h(FeedbackProvider, null, el)));
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('la cara grande', () => {
  it('sin foto: las iniciales en el color del deporte', () => {
    const out = renderToString(h(ProfileAvatar, { name: 'Ana Pérez', className: 'size-[60px]' }));
    expect(out).toContain('bg-accent');
    expect(text(out).trim()).toBe('AP');
  });

  it('con foto: la foto', () => {
    primePublicUrl(AVATAR_BUCKET, 'u2/a.webp', 'https://img.test/u2/a.webp');
    const out = renderToString(h(ProfileAvatar, { name: 'Ana Pérez', photo: 'u2/a.webp', className: 'size-[60px]' }));
    expect(out).toContain('<img src="https://img.test/u2/a.webp"');
    expect(out).toContain('size-[60px]');
  });
});

describe('bloquear', () => {
  it('«•••» abre una hoja (cerrada al entrar)', () => {
    const out = render(h(ProfileMoreMenu, { person: { id: 'u2', name: 'Ana Pérez' }, blocked: false }));
    expect(out).toContain('aria-label="Más opciones"');
    expect(out).toContain('aria-haspopup="dialog"');
    expect(text(out)).not.toContain('Bloquear a Ana Pérez');
  });

  it('bloqueada: «Bloqueaste a …» con «Desbloquear»', () => {
    const t = text(render(h(BlockedCard, { person: { id: 'u2', name: 'Ana Pérez' } })));
    expect(t).toContain('Bloqueaste a Ana Pérez');
    expect(t).toContain('No ves sus publicaciones ni sus juegos');
    expect(t).toContain('Desbloquear');
  });

  it('la pregunta antes de bloquear dice qué pasa', () => {
    expect(BLOCK_EXPLAIN).toContain('publicaciones');
    expect(BLOCK_EXPLAIN).toContain('dejarán de seguirse');
    expect(BLOCK_EXPLAIN).toContain('no te encontrará');
  });
});
