import { describe, expect, it } from 'vitest';
import { PHOTO_FAILED, PHOTO_NO_QR, PHOTO_READING, SCAN_NOTE_MS, firstScanText } from './photo';

describe('leer el QR de una foto', () => {
  it('el primer código con texto (sin espacios de más)', () => {
    expect(firstScanText([{ data: '  https://matchmate.grullonb.com/unirse/ABCD2345 ' }])).toBe('https://matchmate.grullonb.com/unirse/ABCD2345');
    expect(firstScanText([{ data: '' }, { data: '   ' }, { data: 'ABCD2345' }, { data: 'otro' }])).toBe('ABCD2345');
  });

  it('sin códigos (o vacíos): null', () => {
    expect(firstScanText([])).toBeNull();
    expect(firstScanText(null)).toBeNull();
    expect(firstScanText(undefined)).toBeNull();
    expect(firstScanText([{ data: null }, {}])).toBeNull();
  });

  it('los textos y el aviso que se va solo', () => {
    expect(PHOTO_READING).toBe('Leyendo la foto…');
    expect(PHOTO_NO_QR).toContain('No encontramos un QR');
    expect(PHOTO_FAILED).toContain('No pudimos leer esa foto');
    expect(SCAN_NOTE_MS).toBe(4000);
  });
});
