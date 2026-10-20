'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronLeft, Trophy } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { useRest } from '@/components/rest/use-rest';
import { GAME_ICONS } from '@/components/rest/icons';
import { GAMES, gameInfo, type GameId } from '@/lib/rest/games';
import type { RestOverview } from '@/lib/rest/plays';
import styles from '@/components/rest/rest.module.css';

const BOARDS: { value: GameId; label: string }[] = [{ value: 'wordle', label: 'كلمة اليوم' }, { value: 'minesweeper', label: 'كاسحة الألغام' }, { value: 'snake', label: 'الثعبان' }];

export default function RestPage() {
  const { session } = useDemo();
  const rest = useRest();
  const [overview, setOverview] = useState<RestOverview | null>(null);
  const [error, setError] = useState('');
  const [board, setBoard] = useState<GameId>('wordle');
  useEffect(() => {
    let alive = true;
    rest.overview().then(value => { if (alive) setOverview(value); }).catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : 'تعذر تحميل لوحة النقاط.'); });
    return () => { alive = false; };
  }, [rest]);
  const entries = overview?.leaderboards[board] ?? [];
  const wordleDone = overview?.mine.wordleToday;

  return <div className="page-stack">
    <PageHeader eyebrow="ألعاب خفيفة لوقت الراحة" title="استراحة" />
    <div className={styles.gameGrid}>{GAMES.map(game => {
      const Icon = GAME_ICONS[game.id];
      const best = overview?.mine.best[game.id];
      return <Link key={game.id} href={`/employee/rest/${game.id}`} className={styles.gameCard}>
        <span className={styles.gameIcon}><Icon size={26} /></span>
        <span className={styles.gameText}><strong>{game.name}</strong><span>{game.description}</span></span>
        <span className={styles.gameMeta}>
          <Badge tone={game.players === 'pair' ? 'neutral' : 'brand'}>{game.players === 'pair' ? 'لاعبان' : 'فردية'}</Badge>
          {game.id === 'wordle' && wordleDone && <Badge tone="success">لُعبت اليوم</Badge>}
          {game.ranked && game.id !== 'wordle' && best ? <span className={styles.best}>أفضل نتيجة لك: <b dir="ltr">{best}</b></span> : null}
        </span>
        <ChevronLeft size={18} className={styles.gameArrow} />
      </Link>;
    })}</div>
    <Card title="لوحة النقاط" action={<Trophy size={18} className={styles.trophy} />}>
      <Tabs items={BOARDS} value={board} onChange={value => setBoard(value as GameId)} />
      <p className="muted" style={{ marginTop: 12 }}>{board === 'wordle' ? 'ترتيب اليوم: محاولات أقل = نقاط أكثر.' : gameInfo(board).scoreLabel}</p>
      {error ? <p className="text-danger" role="alert">{error}</p> : !overview ? <Skeleton className="skeleton-card" /> : !entries.length ? <EmptyState title="لا توجد نتائج بعد" description="كن أول من يسجل نتيجة في هذه اللعبة." /> :
        <ol className={styles.board}>{entries.map((entry, index) => <li key={entry.employeeId} className={entry.employeeId === session?.employeeId ? styles.me : ''}>
          <span className={`${styles.rank} ${index < 3 ? styles.top : ''}`}>{index + 1}</span>
          <strong>{entry.name}</strong>
          <span className={styles.score} dir="ltr">{entry.best}</span>
        </li>)}</ol>}
    </Card>
  </div>;
}
