import React from 'react';
import { SvgXml } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

const MARK_XML = `
<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180" fill="none">
  <circle cx="90" cy="90" r="68" stroke="#182333" stroke-width="7"/>
  <path d="M57 97L90 75" stroke="#182333" stroke-width="7" stroke-linecap="round"/>
  <path d="M106 68L133 92" stroke="#182333" stroke-width="7" stroke-linecap="round"/>
</svg>
`;

const WORDMARK_XML = `
<svg xmlns="http://www.w3.org/2000/svg" width="238" height="48" viewBox="0 0 238 48" fill="none">
  <g transform="translate(2 11)">
    <circle cx="13" cy="13" r="11.5" stroke="#182333" stroke-width="2"/>
    <path d="M7.5 14.2L13.2 10.5" stroke="#182333" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 9.3L20.6 13.4" stroke="#182333" stroke-width="2" stroke-linecap="round"/>
  </g>
  <text x="44" y="33" fill="#182333" font-family="Georgia, 'Times New Roman', serif" font-size="28" font-weight="700" letter-spacing="-1.7">ausease</text>
</svg>
`;

export function AuseaseLogo({
  variant = 'full',
  width,
  height,
  color,
}: {
  variant?: 'full' | 'mark';
  width?: number;
  height?: number;
  color?: string;
}) {
  const colors = useColors();
  const source = variant === 'mark' ? MARK_XML : WORDMARK_XML;
  const xml = source.replaceAll('#182333', color ?? colors.foreground);
  const defaultWidth = variant === 'mark' ? 180 : 119;
  const defaultHeight = variant === 'mark' ? 180 : 24;

  return (
    <SvgXml
      xml={xml}
      width={width ?? defaultWidth}
      height={height ?? defaultHeight}
      accessibilityLabel="ausease"
    />
  );
}