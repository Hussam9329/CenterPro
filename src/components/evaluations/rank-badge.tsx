'use client';

import type { CSSProperties } from 'react';
import Image from 'next/image';
import { getSeasonRank } from '@/lib/evaluations';
import styles from './evaluations.module.css';

function rankAsset(name: string): string {
  return `/ranks/${name.toLowerCase().replace(/\s+/g, '-')}.png`;
}

export function RankBadge({ score, size = 'md', animated = false, showLabel = true }: { score: number; size?: 'sm' | 'md' | 'lg'; animated?: boolean; showLabel?: boolean }) {
  const rank = getSeasonRank(score);
  const asset = rankAsset(rank.name);
  return <div className={`${styles.rankBadgeWrap} ${styles[`rankBadge${size.toUpperCase()}`]} ${animated ? styles.rankBadgeAnimated : ''}`} data-rank-tier={rank.tier} aria-label={showLabel ? undefined : rank.name} role={showLabel ? undefined : 'img'}>
    <div className={styles.rankBadgeIcon} aria-hidden="true" style={{ '--rank-mask': `url("${asset}")` } as CSSProperties}>
      <Image src={asset} alt="" fill unoptimized draggable={false}/>
      {animated && <span className={styles.rankShine}/>}
    </div>
    {showLabel && <div className={styles.rankBadgeLabel}><strong dir="ltr">{rank.name}</strong></div>}
  </div>;
}
