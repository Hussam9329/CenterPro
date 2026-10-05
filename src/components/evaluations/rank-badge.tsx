'use client';

import { useId } from 'react';
import { getSeasonRank } from '@/lib/evaluations';
import styles from './evaluations.module.css';

type RankTier = ReturnType<typeof getSeasonRank>['tier'];

type Palette = {
  dark: string;
  mid: string;
  light: string;
  highlight: string;
  edge: string;
  accent: string;
};

const PALETTES: Record<RankTier, Palette> = {
  bronze: { dark:'#54270f', mid:'#a95120', light:'#e59a55', highlight:'#ffd09b', edge:'#351608', accent:'#8b3d17' },
  silver: { dark:'#4f5964', mid:'#9da9b6', light:'#d9e0e7', highlight:'#ffffff', edge:'#303943', accent:'#b9c3ce' },
  gold: { dark:'#784804', mid:'#c8830c', light:'#f3bd3d', highlight:'#fff0a5', edge:'#4d2b00', accent:'#d99b18' },
  platinum: { dark:'#466b89', mid:'#8fb4d0', light:'#d8e8f3', highlight:'#ffffff', edge:'#304e67', accent:'#8bc3e8' },
  diamond: { dark:'#2367aa', mid:'#63b3f7', light:'#bfe8ff', highlight:'#ffffff', edge:'#164678', accent:'#6ad1ff' },
  emerald: { dark:'#004d31', mid:'#078d59', light:'#35c482', highlight:'#9dffd0', edge:'#003722', accent:'#0db66f' },
  master: { dark:'#590710', mid:'#a90f20', light:'#e33243', highlight:'#ff9ca7', edge:'#330208', accent:'#c3912f' },
  grandmaster: { dark:'#5b0710', mid:'#b21427', light:'#ed3447', highlight:'#ffc0c8', edge:'#320208', accent:'#d4a33c' },
};

function starPoints(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const values: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (-Math.PI / 2) + (i * Math.PI / points);
    values.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }
  return values.join(' ');
}

function CoreGeometry({ primary, secondary, edge, highlight }: { primary:string; secondary:string; edge:string; highlight:string }) {
  return <>
    <polygon points="762.98 198.82 298.45 282.88 179.4 770.28 0 770.44 188.35 .28 367.6 0 311.84 227.03 775.34 142.85 762.98 198.82" fill={primary} stroke={edge} strokeWidth="13" strokeLinejoin="round"/>
    <path d="M742.18,304.5l-421.86,77.75c5.52-21.23,11.04-42.47,16.57-63.7l420.06-76.52-14.77,62.47Z" fill={primary} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
    <path d="M431.96,535.15c-49.91,9.43-99.82,18.87-149.73,28.3,12.7-47.58,25.39-95.17,38.09-142.75,106.39-20.46,212.78-40.91,319.16-61.37-34.51,137.03-69.01,274.07-103.52,411.1h-160.65c18.88-78.43,37.77-156.86,56.65-235.29Z" fill={secondary} stroke={edge} strokeWidth="13" strokeLinejoin="round"/>
    <path d="M699.86,118.94l-170.82,31.07c13.06-50,26.12-100.01,39.19-150.01h156.32c-8.23,39.65-16.46,79.3-24.68,118.94Z" fill={secondary} stroke={edge} strokeWidth="12" strokeLinejoin="round"/>
    <path d="M190 28L336 26 319 96 173 120Z" fill={highlight} opacity=".28"/>
    <path d="M339 333L718 264 711 291 332 359Z" fill={highlight} opacity=".24"/>
    <path d="M339 438L610 385 595 445 326 496Z" fill={highlight} opacity=".18"/>
  </>;
}

function LevelDecorations({ level, accent, edge, highlight }: { level:number|null; accent:string; edge:string; highlight:string }) {
  if (!level || level === 1) return null;
  const left = '145,420 92,455 66,565 133,520';
  const right = '690,384 760,405 811,505 735,478';
  const leftInner = '135,520 82,559 67,626 124,592';
  const rightInner = '735,478 794,513 826,580 758,548';
  return <>
    <polygon points={left} fill={accent} stroke={edge} strokeWidth="10" strokeLinejoin="round"/>
    <polygon points={right} fill={accent} stroke={edge} strokeWidth="10" strokeLinejoin="round"/>
    <path d="M113 466L139 450 127 495 101 511Z" fill={highlight} opacity=".45"/>
    <path d="M752 420L775 433 791 465 764 449Z" fill={highlight} opacity=".38"/>
    {level >= 3 && <>
      <polygon points={leftInner} fill={accent} stroke={edge} strokeWidth="9" strokeLinejoin="round"/>
      <polygon points={rightInner} fill={accent} stroke={edge} strokeWidth="9" strokeLinejoin="round"/>
      <polygon points={starPoints(655,640,66,29)} fill={highlight} stroke={edge} strokeWidth="10" strokeLinejoin="round"/>
    </>}
  </>;
}

function GrandmasterDecorations({ accent, edge, highlight }: { accent:string; edge:string; highlight:string }) {
  return <>
    <polygon points="146,350 64,392 18,527 128,470" fill={accent} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
    <polygon points="126,470 38,531 31,641 142,574" fill={accent} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
    <polygon points="750,338 842,373 930,494 794,452" fill={accent} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
    <polygon points="794,452 901,503 930,614 805,554" fill={accent} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
    <polygon points="400,89 450,11 486,74 532,7 567,79 632,28 620,124 411,163" fill={highlight} stroke={edge} strokeWidth="12" strokeLinejoin="round"/>
    <polygon points={starPoints(560,655,76,31)} fill={highlight} stroke={edge} strokeWidth="11" strokeLinejoin="round"/>
  </>;
}

function RankEmblem({ tier, level, animated }: { tier:RankTier; level:number|null; animated:boolean }) {
  const rawId = useId().replace(/:/g, '');
  const palette = PALETTES[tier];
  const metal = `${rawId}-metal`;
  const secondary = `${rawId}-secondary`;
  const accent = `${rawId}-accent`;
  const clip = `${rawId}-clip`;
  const shine = `${rawId}-shine`;
  const isGrandmaster = tier === 'grandmaster';

  const geometry = <>
    <CoreGeometry primary={`url(#${metal})`} secondary={`url(#${secondary})`} edge={palette.edge} highlight={palette.highlight}/>
    {isGrandmaster
      ? <GrandmasterDecorations accent={`url(#${accent})`} edge={palette.edge} highlight={palette.highlight}/>
      : <LevelDecorations level={level} accent={`url(#${accent})`} edge={palette.edge} highlight={palette.highlight}/>
    }
  </>;

  return <svg className={styles.rankSvg} viewBox="-40 -55 1035 900" role="presentation" focusable="false" aria-hidden="true">
    <defs>
      <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={palette.dark}/><stop offset=".28" stopColor={palette.light}/><stop offset=".5" stopColor={palette.highlight}/><stop offset=".7" stopColor={palette.mid}/><stop offset="1" stopColor={palette.dark}/>
      </linearGradient>
      <linearGradient id={secondary} x1=".15" y1="0" x2=".9" y2="1">
        <stop offset="0" stopColor={palette.highlight}/><stop offset=".34" stopColor={palette.light}/><stop offset=".7" stopColor={palette.mid}/><stop offset="1" stopColor={palette.dark}/>
      </linearGradient>
      <linearGradient id={accent} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={palette.dark}/><stop offset=".45" stopColor={palette.accent}/><stop offset=".7" stopColor={palette.highlight}/><stop offset="1" stopColor={palette.dark}/>
      </linearGradient>
      <linearGradient id={shine} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0"/>
        <stop offset=".46" stopColor="#fff" stopOpacity="0"/>
        <stop offset=".5" stopColor="#fff" stopOpacity=".9"/>
        <stop offset=".56" stopColor="#fff" stopOpacity=".2"/>
        <stop offset="1" stopColor="#fff" stopOpacity="0"/>
      </linearGradient>
      <clipPath id={clip}>
        <CoreGeometry primary="#000" secondary="#000" edge="#000" highlight="#000"/>
        {isGrandmaster
          ? <GrandmasterDecorations accent="#000" edge="#000" highlight="#000"/>
          : <LevelDecorations level={level} accent="#000" edge="#000" highlight="#000"/>
        }
      </clipPath>
    </defs>
    <g className={styles.rankSvgArtwork}>{geometry}</g>
    {animated && <g clipPath={`url(#${clip})`} className={styles.rankSvgShineLayer}>
      <rect className={styles.rankSvgShine} x="-520" y="-140" width="270" height="1120" rx="80" fill={`url(#${shine})`} transform="rotate(18 0 0)"/>
    </g>}
  </svg>;
}

export function RankBadge({ score, size = 'md', animated = false, showLabel = true }: { score: number; size?: 'sm' | 'md' | 'lg'; animated?: boolean; showLabel?: boolean }) {
  const rank = getSeasonRank(score);
  return <div className={`${styles.rankBadgeWrap} ${styles[`rankBadge${size.toUpperCase()}`]} ${animated ? styles.rankBadgeAnimated : ''}`} data-rank-tier={rank.tier} data-rank-level={rank.level ?? 'grandmaster'} aria-label={showLabel ? undefined : rank.name} role={showLabel ? undefined : 'img'}>
    <div className={styles.rankBadgeIcon}><RankEmblem tier={rank.tier} level={rank.level} animated={animated}/></div>
    {showLabel && <div className={styles.rankBadgeLabel}><strong dir="ltr">{rank.name}</strong></div>}
  </div>;
}
