'use client';

import { useEffect, useState } from 'react';
import { Clock3, Gamepad2, Trophy, UsersRound } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, Card, EmptyState, PageHeader, Select, Skeleton, StatCard } from '@/components/ui';
import { useRest } from '@/components/rest/use-rest';
import { GAME_ICONS } from '@/components/rest/icons';
import { gameInfo, type GameId, type GameOutcome } from '@/lib/rest/games';
import { formatDuration, type RestStats } from '@/lib/rest/plays';
import { date, number, time } from '@/lib/format';

const OUTCOME: Record<GameOutcome, { label: string; tone: 'success' | 'neutral' | 'brand' }> = {
  win: { label: 'فوز', tone: 'success' }, loss: { label: 'خسارة', tone: 'neutral' }, draw: { label: 'تعادل', tone: 'neutral' }, end: { label: 'انتهت', tone: 'brand' },
};

export default function RestStatsPage() {
  const { session } = useDemo();
  const rest = useRest();
  const [days, setDays] = useState('30');
  const [stats, setStats] = useState<RestStats | null>(null);
  const [error, setError] = useState('');
  const isSuper = session?.role === 'SUPER_ADMIN';
  useEffect(() => {
    if (!isSuper) return;
    let alive = true;
    rest.stats(days === 'all' ? null : Number(days))
      .then(value => { if (alive) { setStats(value); setError(''); } })
      .catch((failure: unknown) => { if (alive) setError(failure instanceof Error ? failure.message : 'تعذر تحميل الإحصائيات.'); });
    return () => { alive = false; };
  }, [rest, days, isSuper]);

  if (!isSuper) return <EmptyState title="هذه الصفحة متاحة لـ المدير العام فقط" description="إحصائيات الاستراحة تعرض تفاصيل لعب كل موظف." />;
  const popular = stats?.games.reduce((top, game) => game.plays > (top?.plays ?? 0) ? game : top, null as RestStats['games'][number] | null);

  return <div className="page-stack">
    <PageHeader title="إحصائيات الاستراحة" actions={<Select aria-label="الفترة" value={days} onChange={event => { setStats(null); setDays(event.target.value); }}><option value="7">آخر 7 أيام</option><option value="30">آخر 30 يوماً</option><option value="90">آخر 90 يوماً</option><option value="all">كل الفترات</option></Select>} />
    {error && <p className="text-danger" role="alert">{error}</p>}
    {!stats ? !error && <><Skeleton className="skeleton-card" /><Skeleton className="skeleton-card" /></> : <>
      <div className="stats-grid">
        <StatCard label="اللعبة الأكثر لعباً" value={popular?.plays ? gameInfo(popular.game).name : '—'} icon={<Trophy size={20} />} accent />
        <StatCard label="عدد الجولات" value={number(stats.totals.plays)} icon={<Gamepad2 size={20} />} />
        <StatCard label="الموظفون اللاعبون" value={number(stats.totals.players)} icon={<UsersRound size={20} />} />
        <StatCard label="إجمالي وقت اللعب" value={formatDuration(stats.totals.totalMs)} icon={<Clock3 size={20} />} />
      </div>
      <Card title="حسب اللعبة">
        <div className="table-wrap" role="region" aria-label="إحصائيات حسب اللعبة" tabIndex={0}><table className="data-table"><thead><tr><th>اللعبة</th><th>الجولات</th><th>اللاعبون</th><th>إجمالي الوقت</th><th>متوسط الجولة</th><th>أفضل نتيجة</th><th>آخر لعب</th></tr></thead><tbody>
          {stats.games.map(game => { const Icon = GAME_ICONS[game.game]; return <tr key={game.game}>
            <td><span className="inline"><Icon size={17} /><strong>{gameInfo(game.game).name}</strong></span></td>
            <td dir="ltr">{number(game.plays)}</td><td dir="ltr">{number(game.players)}</td><td>{formatDuration(game.totalMs)}</td>
            <td>{game.plays ? formatDuration(game.totalMs / game.plays) : '—'}</td><td dir="ltr">{gameInfo(game.game).ranked && game.plays ? game.best : '—'}</td>
            <td>{game.lastPlayedAt ? <bdi dir="ltr">{date(game.lastPlayedAt)} {time(game.lastPlayedAt)}</bdi> : '—'}</td>
          </tr>; })}
        </tbody></table></div>
      </Card>
      <Card title="حسب الموظف">
        {!stats.employees.length ? <EmptyState title="لا توجد جولات في هذه الفترة" /> : <div className="table-wrap" role="region" aria-label="إحصائيات حسب الموظف" tabIndex={0}><table className="data-table"><thead><tr><th>الموظف</th><th>الجولات</th><th>إجمالي الوقت</th><th>أول دخول</th><th>آخر دخول</th><th>تفاصيل الألعاب</th></tr></thead><tbody>
          {stats.employees.map(employee => <tr key={employee.employeeId}>
            <td><strong>{employee.name}</strong></td><td dir="ltr">{number(employee.plays)}</td><td>{formatDuration(employee.totalMs)}</td>
            <td>{employee.firstPlayedAt ? <bdi dir="ltr">{date(employee.firstPlayedAt)} {time(employee.firstPlayedAt)}</bdi> : '—'}</td>
            <td>{employee.lastPlayedAt ? <bdi dir="ltr">{date(employee.lastPlayedAt)} {time(employee.lastPlayedAt)}</bdi> : '—'}</td>
            <td><div className="inline" style={{ flexWrap: 'wrap', gap: 6 }}>{Object.entries(employee.games).map(([id, value]) => value && <Badge key={id} tone="neutral">{gameInfo(id as GameId).name}: {value.plays} · {formatDuration(value.totalMs)}</Badge>)}</div></td>
          </tr>)}
        </tbody></table></div>}
      </Card>
      <Card title="آخر الجولات">
        {!stats.recent.length ? <EmptyState title="لا توجد جولات في هذه الفترة" /> : <div className="table-wrap" role="region" aria-label="آخر الجولات" tabIndex={0}><table className="data-table"><thead><tr><th>الموظف</th><th>اللعبة</th><th>البداية</th><th>المدة</th><th>النتيجة</th></tr></thead><tbody>
          {stats.recent.map(play => <tr key={play.id}>
            <td><strong>{play.name}</strong></td><td>{gameInfo(play.game).name}</td>
            <td><bdi dir="ltr">{date(play.startedAt)} {time(play.startedAt)}</bdi></td><td>{formatDuration(play.durationMs)}</td>
            <td><span className="inline"><Badge tone={OUTCOME[play.outcome].tone}>{OUTCOME[play.outcome].label}</Badge>{gameInfo(play.game).ranked && <bdi dir="ltr">{play.score}</bdi>}</span></td>
          </tr>)}
        </tbody></table></div>}
      </Card>
    </>}
  </div>;
}
