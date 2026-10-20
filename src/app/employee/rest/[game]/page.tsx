'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useDemo, useToast } from '@/components/demo-provider';
import { Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useRest } from '@/components/rest/use-rest';
import { WordleGame } from '@/components/rest/games/wordle';
import { MinesweeperGame } from '@/components/rest/games/minesweeper';
import { SnakeGame } from '@/components/rest/games/snake';
import { XoGame } from '@/components/rest/games/xo';
import { Connect4Game } from '@/components/rest/games/connect4';
import { GAME_IDS, gameInfo, type GameId, type GameResult } from '@/lib/rest/games';
import { dailyWord } from '@/lib/rest/daily-word';
import type { RestOverview } from '@/lib/rest/plays';
import styles from '@/components/rest/rest.module.css';

export default function RestGamePage() {
  const params = useParams<{ game: string }>();
  const game = (GAME_IDS as readonly string[]).includes(params.game) ? params.game as GameId : null;
  const { today } = useDemo();
  const toast = useToast();
  const rest = useRest();
  // A round starts when the page opens and again right after each finished round.
  const roundStart = useRef(0);
  const [overview, setOverview] = useState<RestOverview | null>(null);
  const [wordleResult, setWordleResult] = useState<GameResult | null>(null);
  useEffect(() => { roundStart.current = Date.now(); }, []);
  useEffect(() => {
    if (game !== 'wordle') return;
    let alive = true;
    rest.overview().then(value => { if (alive) setOverview(value); }).catch(() => { if (alive) setOverview({ today, leaderboards: {}, mine: { best: {}, wordleToday: null } }); });
    return () => { alive = false; };
  }, [game, rest, today]);

  if (!game) return <div className="page-stack"><PageHeader title="استراحة" /><Card><EmptyState title="اللعبة غير موجودة" action={<Link className="button-link" href="/employee/rest">العودة إلى الاستراحة</Link>} /></Card></div>;
  const info = gameInfo(game);

  function finish(result: GameResult) {
    const startedAt = new Date(roundStart.current || Date.now());
    const durationMs = Math.max(0, Date.now() - startedAt.getTime());
    roundStart.current = Date.now();
    if (game === 'wordle') setWordleResult(result);
    rest.recordPlay({ id: crypto.randomUUID(), game: game!, startedAt: startedAt.toISOString(), durationMs, score: result.score, outcome: result.outcome })
      .catch((failure: unknown) => toast(failure instanceof Error ? failure.message : 'تعذر حفظ نتيجة الجولة.'));
  }

  const playedToday = game === 'wordle' && !wordleResult ? overview?.mine.wordleToday : null;
  return <div className="page-stack">
    <PageHeader eyebrow={info.players === 'pair' ? 'لاعبان على نفس الجهاز' : 'لعبة فردية'} title={info.name} actions={<Link className="button-link" href="/employee/rest"><ArrowRight size={16} />كل الألعاب</Link>} />
    <Card className={styles.playCard}>
      {game === 'wordle' && !overview ? <Skeleton className="skeleton-card" />
        : playedToday ? <EmptyState title={playedToday.outcome === 'win' ? 'أحسنت! حللت كلمة اليوم.' : 'لعبت كلمة اليوم.'} description="الكلمة تتجدد كل يوم. عُد غداً لكلمة جديدة، وشاهد ترتيبك في لوحة النقاط." action={<Link className="button-link" href="/employee/rest"><CheckCircle2 size={16} />لوحة النقاط</Link>} />
        : game === 'wordle' ? <WordleGame word={dailyWord(today)} onFinish={finish} />
        : game === 'minesweeper' ? <MinesweeperGame onFinish={finish} />
        : game === 'snake' ? <SnakeGame onFinish={finish} />
        : game === 'xo' ? <XoGame onFinish={finish} />
        : <Connect4Game onFinish={finish} />}
    </Card>
  </div>;
}
