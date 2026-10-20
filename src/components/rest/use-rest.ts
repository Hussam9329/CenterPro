'use client';

import { useMemo } from 'react';
import { useDemo } from '@/components/demo-provider';
import { apiRequest } from '@/lib/api-client';
import { GAMES, type GameId } from '@/lib/rest/games';
import { leaderboard, playProblem, restStats, type NewPlay, type PlayRecord, type RestOverview, type RestStats } from '@/lib/rest/plays';

// The browser-only preview keeps plays on this device; the server build uses the API.
const LOCAL_KEY = 'centerpro-rest-plays-v1';

function readLocal(): PlayRecord[] {
  try { const value: unknown = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? '[]'); return Array.isArray(value) ? value as PlayRecord[] : []; }
  catch { return []; }
}
function writeLocal(plays: PlayRecord[]) {
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(plays.slice(-5000))); } catch { /* storage full or blocked: the round still counts on screen */ }
}

export interface RestApi {
  recordPlay: (play: NewPlay) => Promise<void>;
  overview: () => Promise<RestOverview>;
  stats: (days: number | null) => Promise<RestStats>;
}

export function useRest(): RestApi {
  const { backend, session, data, today } = useDemo();
  return useMemo<RestApi>(() => {
    if (backend === 'neon') return {
      recordPlay: async play => { await apiRequest('/api/rest/plays', play); },
      overview: () => apiRequest<RestOverview>('/api/rest/overview'),
      stats: days => apiRequest<RestStats>(`/api/rest/stats${days ? `?days=${days}` : ''}`),
    };
    const names = new Map(data.employees.map(employee => [employee.id, employee.name]));
    const employeeId = session?.employeeId ?? '';
    return {
      recordPlay: async play => {
        const problem = playProblem(play, new Date());
        if (problem) throw new Error(problem);
        const plays = readLocal();
        if (play.game === 'wordle' && plays.some(row => row.game === 'wordle' && row.employeeId === employeeId && row.playDate === today && row.id !== play.id)) throw new Error('لعبت كلمة اليوم مسبقاً. عُد غداً لكلمة جديدة.');
        if (!plays.some(row => row.id === play.id)) writeLocal([...plays, { ...play, employeeId, playDate: today }]);
      },
      overview: async () => {
        const plays = readLocal();
        const leaderboards: RestOverview['leaderboards'] = {};
        for (const game of GAMES.filter(item => item.ranked && item.id !== 'wordle')) leaderboards[game.id] = leaderboard(plays, game.id, names);
        leaderboards.wordle = leaderboard(plays.filter(play => play.playDate === today), 'wordle', names);
        const best: Partial<Record<GameId, number>> = {};
        for (const play of plays) if (play.employeeId === employeeId) best[play.game] = Math.max(best[play.game] ?? 0, play.score);
        const mineToday = plays.find(play => play.game === 'wordle' && play.employeeId === employeeId && play.playDate === today);
        return { today, leaderboards, mine: { best, wordleToday: mineToday ? { score: mineToday.score, outcome: mineToday.outcome } : null } };
      },
      stats: async days => {
        const since = days ? Date.now() - days * 86_400_000 : 0;
        return restStats(readLocal().filter(play => Date.parse(play.startedAt) >= since), names);
      },
    };
  }, [backend, session?.employeeId, data.employees, today]);
}
