'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { getSeasonRank } from '@/lib/evaluations';
import styles from './evaluations.module.css';

type RankTier = ReturnType<typeof getSeasonRank>['tier'];

function assetFor(tier: RankTier, level: number | null) {
  return tier === 'grandmaster' ? '/ranks/grandmaster.png' : `/ranks/${tier}-${level ?? 1}.png`;
}

export function RankBadge({ score, size = 'md', animated = false, showLabel = true }: { score: number; size?: 'sm' | 'md' | 'lg'; animated?: boolean; showLabel?: boolean }) {
  const rank = getSeasonRank(score);
  const src = assetFor(rank.tier, rank.level);
  const maskStyle = { '--rank-mask': `url("${src}")` } as CSSProperties;
  return <div className={`${styles.rankBadgeWrap} ${styles[`rankBadge${size.toUpperCase()}`]} ${animated ? styles.rankBadgeAnimated : ''}`} data-rank-tier={rank.tier} data-rank-level={rank.level ?? 'grandmaster'} aria-label={showLabel ? undefined : rank.name} role={showLabel ? undefined : 'img'}>
    <div className={styles.rankBadgeIcon}>
      <Image className={styles.rankAssetImage} src={src} width={512} height={512} alt="" aria-hidden="true" unoptimized priority={size === 'lg'} />
      {animated && <span className={styles.rankAssetShine} style={maskStyle} data-rank-shine aria-hidden="true" />}
    </div>
    {showLabel && <div className={styles.rankBadgeLabel}><strong dir="ltr">{rank.name}</strong></div>}
  </div>;
}
