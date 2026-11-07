/**
 * La marca de cada plataforma de transmisión (PlatformMark de src/components/live/LiveParts.tsx), simplificada y en su
 * color (decorativa: al lado siempre va su nombre). TikTok va en el color del texto para que se vea en claro y en oscuro.
 */
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { StreamPlatform } from '@mm/lib/streams';
import { useColors } from '@/theme/theme';

export function PlatformMark({ platform, size = 20 }: { platform: StreamPlatform; size?: number }) {
  const c = useColors();
  const box = { width: size, height: size, viewBox: '0 0 24 24' } as const;
  switch (platform) {
    case 'youtube':
      return (
        <Svg {...box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Rect x={1.5} y={5} width={21} height={14} rx={4.5} fill="#FF0000" />
          <Path d="M10 9v6l5.2-3z" fill="#fff" />
        </Svg>
      );
    case 'twitch':
      return (
        <Svg {...box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d="M4.5 2 3 5.8V20h4.8v2.5h2.7l2.6-2.5h3.8L21 15V2z" fill="#9146FF" />
          <Path d="M5.8 3.8h13.4v10.4l-3 3h-4l-2.7 2.6v-2.6H5.8z" fill="#fff" />
          <Path d="M11 7.2h1.9v5H11zm5 0h1.9v5H16z" fill="#9146FF" />
        </Svg>
      );
    case 'facebook':
      return (
        <Svg {...box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Circle cx={12} cy={12} r={10.5} fill="#1877F2" />
          <Path d="M13.4 22.4v-7.1h2.4l.4-2.8h-2.8v-1.8c0-.8.3-1.4 1.4-1.4h1.5V6.8a19 19 0 0 0-2.2-.1c-2.2 0-3.6 1.3-3.6 3.7v2.1H8.1v2.8h2.4v7.1z" fill="#fff" />
        </Svg>
      );
    case 'kick':
      return (
        <Svg {...box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Rect x={2} y={2} width={20} height={20} rx={4.5} fill="#53FC18" />
          <Path d="M7 6h3.2v4.2h1.2V8.1h2.1V6h3.2v4.2h-2.1v1.1h-1.1v1.4h1.1v1.1h2.1V18h-3.2v-2.1h-2.1v-2.1h-1.2V18H7z" fill="#0b0e0f" />
        </Svg>
      );
    case 'instagram':
      return (
        <Svg {...box} fill="none" stroke="#E1306C" strokeWidth={2} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Rect x={3} y={3} width={18} height={18} rx={5.5} />
          <Circle cx={12} cy={12} r={4.2} />
          <Circle cx={17.4} cy={6.6} r={1} fill="#E1306C" stroke="none" />
        </Svg>
      );
    case 'tiktok':
      return (
        <Svg {...box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Path d="M13.6 2.5h3.1a4.6 4.6 0 0 0 4.1 4.1v3.2a7.6 7.6 0 0 1-4.1-1.3v6.6a6.3 6.3 0 1 1-6.3-6.3h.6v3.3h-.6a3 3 0 1 0 3.2 3z" fill={c.fg} />
        </Svg>
      );
  }
}
