/** Los tours guiados se retiraron en el rediseño: aunque una pantalla todavía monte uno, no sale nada. */
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HOME_TOUR } from '../lib/tours';
import { Tour } from './Tour';

describe('tours retirados', () => {
  it('Tour no dibuja nada (ni pide la cuenta ni arranca solo)', () => {
    expect(renderToString(h(Tour, { name: 'inicio', steps: HOME_TOUR, when: true }))).toBe('');
  });
});
