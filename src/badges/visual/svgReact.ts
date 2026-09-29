import { createElement, type CSSProperties, type ReactNode } from 'react';
import type { SvgElement } from './svg';

/** Un elemento de svg.ts como elemento de React. */
export function svgToReact(el: SvgElement, key?: string | number): ReactNode {
  const children = el.text != null ? el.text : el.children?.map((c, i) => svgToReact(c, i));
  return createElement(el.tag, { ...el.attrs, style: el.style as CSSProperties | undefined, key }, children);
}

/** Id seguro para url(#…) a partir de useId (que puede traer «:», ««» u otros signos). */
export const safeId = (raw: string) => raw.replace(/[^a-zA-Z0-9_-]/g, '');
