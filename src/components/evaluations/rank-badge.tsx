'use client';

import type { CSSProperties } from 'react';
import { getSeasonRank, type SeasonRank } from '@/lib/evaluations';
import styles from './evaluations.module.css';

const palette: Record<SeasonRank['tier'], { primary: string; secondary: string; text: string }> = {
  bronze: { primary: '#7A4A34', secondary: '#C48A63', text: '#7A4A34' },
  silver: { primary: '#6F7886', secondary: '#D3D8DE', text: '#68717D' },
  gold: { primary: '#9A6B16', secondary: '#E2B84B', text: '#8A5E10' },
  platinum: { primary: '#66758A', secondary: '#C6D0DC', text: '#647287' },
  diamond: { primary: '#3E6F98', secondary: '#B8E1F3', text: '#3D6D92' },
  emerald: { primary: '#17644F', secondary: '#49B489', text: '#17644F' },
  master: { primary: '#111318', secondary: '#A51C30', text: '#A51C30' },
  grandmaster: { primary: '#A51C30', secondary: '#111318', text: '#A51C30' },
};
const darkPalette: typeof palette = {
  bronze: { primary: '#C48A63', secondary: '#E7B895', text: '#E7B895' },
  silver: { primary: '#A7B1BF', secondary: '#D3D8DE', text: '#D3D8DE' },
  gold: { primary: '#D4A236', secondary: '#F3D170', text: '#F3D170' },
  platinum: { primary: '#96ADC8', secondary: '#D4E2EF', text: '#D4E2EF' },
  diamond: { primary: '#6AA6CF', secondary: '#B8E1F3', text: '#B8E1F3' },
  emerald: { primary: '#49B489', secondary: '#94DFC0', text: '#94DFC0' },
  master: { primary: '#D3D8DE', secondary: '#D74E69', text: '#F194A5' },
  grandmaster: { primary: '#D74E69', secondary: '#D3D8DE', text: '#F194A5' },
};

export function RankBadge({ score, size = 'md', animated = false, showLabel = true }: { score: number; size?: 'sm' | 'md' | 'lg'; animated?: boolean; showLabel?: boolean }) {
  const rank = getSeasonRank(score);
  const colors = palette[rank.tier], darkColors = darkPalette[rank.tier];
  return <div className={`${styles.rankBadgeWrap} ${styles[`rankBadge${size.toUpperCase()}`]} ${animated ? styles.rankBadgeAnimated : ''}`} data-rank-tier={rank.tier} aria-label={showLabel ? undefined : rank.name} role={showLabel ? undefined : 'img'} style={{ '--rank-primary-light': colors.primary, '--rank-secondary-light': colors.secondary, '--rank-text-light': colors.text, '--rank-primary-dark': darkColors.primary, '--rank-secondary-dark': darkColors.secondary, '--rank-text-dark': darkColors.text } as CSSProperties}>
    <div className={styles.rankBadgeIcon} aria-hidden="true">
      <svg viewBox="0 0 956.73 770.44" role="img">
        <polygon fill="var(--rank-primary)" points="762.98 198.82 298.45 282.88 179.4 770.28 0 770.44 188.35 .28 367.6 0 311.84 227.03 775.34 142.85 762.98 198.82"/>
        <path fill="var(--rank-primary)" d="M742.18,304.5l-421.86,77.75c5.52-21.23,11.04-42.47,16.57-63.7l420.06-76.52-14.77,62.47Z"/>
        <path fill="var(--rank-secondary)" d="M431.96,535.15c-49.91,9.43-99.82,18.87-149.73,28.3,12.7-47.58,25.39-95.17,38.09-142.75,106.39-20.46,212.78-40.91,319.16-61.37-34.51,137.03-69.01,274.07-103.52,411.1h-160.65c18.88-78.43,37.77-156.86,56.65-235.29Z"/>
        <path fill="var(--rank-secondary)" d="M699.86,118.94l-170.82,31.07c13.06-50,26.12-100.01,39.19-150.01h156.32c-8.23,39.65-16.46,79.3-24.68,118.94Z"/>
      </svg>
      {rank.level && <span className={styles.rankLevel}>{rank.level}</span>}
      <span className={styles.rankShine}/>
    </div>
    {showLabel && <div className={styles.rankBadgeLabel}><strong dir="ltr">{rank.name}</strong></div>}
  </div>;
}
