'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { buildEvaluationCycleSnapshot, getCycleLeaderboard, getOpenEvaluationCycle, getOpenEvaluationSeason } from '@/lib/evaluations';

/** Cycle lifecycle writes and their audit records share the same live snapshot. */
export function useCycleManagement() {
  const { data, session, updateData } = useDemo();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const [closeOpen, setCloseOpen] = useState(false);
  const requestedSeason = params.get('season') ?? '';
  const seasonFilter = requestedSeason === '__legacy__' || data.evaluationSeasons.some(item => item.id === requestedSeason) ? requestedSeason : '';
  const matchesSeason = (seasonId?: string) => !seasonFilter || (seasonFilter === '__legacy__' ? !seasonId : seasonId === seasonFilter);
  const visibleCycle = cycle && matchesSeason(cycle.seasonId) ? cycle : undefined;
  const canOpen = !cycle && Boolean(season && matchesSeason(season.id));
  const archived = [...data.evaluationCycles].filter(item => item.state === 'ARCHIVED' && matchesSeason(item.seasonId)).sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const leaderboard = cycle ? getCycleLeaderboard(data, cycle.id) : [];

  async function openCycle() {
    if (!session || cycle) return;
    if (!season) { toast('افتح موسماً أولاً.'); return; }
    const id = crypto.randomUUID();
    const count = data.evaluationCycles.filter(item => item.seasonId === season.id).length + 1;
    const now = new Date().toISOString();
    const name = `دورة التقييم ${count}`;
    try {
      if (!await mutate(() => updateData(draft => {
        draft.evaluationCycles.push({ id, seasonId: season.id, name, state: 'OPEN', openedAt: now, openedBy: session.name });
      }, {
        action: 'فتح دورة تقييم جديدة', entity: 'evaluation-cycle', entityId: id,
        newValues: { name, seasonId: season.id },
      }))) return;
    } catch (failure) {
      toast(failure instanceof Error ? failure.message : 'تعذر فتح دورة التقييم.');
      return;
    }
    toast('تم فتح دورة تقييم جديدة.');
  }

  async function closeCycle() {
    if (!session || !cycle) return;
    const now = new Date().toISOString();
    try {
      if (!await mutate(() => updateData(draft => {
        const current = draft.evaluationCycles.find(item => item.id === cycle.id);
        if (!current) throw new Error('دورة التقييم غير موجودة.');
        const snapshot = buildEvaluationCycleSnapshot(draft, cycle.id);
        current.state = 'ARCHIVED';
        current.closedAt = now;
        current.closedBy = session.name;
        current.snapshot = snapshot;
        draft.evaluationExams.filter(item => item.cycleId === cycle.id).forEach(exam => {
          if (exam.state === 'OPEN') {
            exam.state = 'CLOSED';
            exam.closedAt = now;
            exam.closedBy = session.name;
          }
        });
      }, (_before, after) => {
        const snapshot = after.evaluationCycles.find(item => item.id === cycle.id)?.snapshot;
        return {
          action: 'إغلاق وأرشفة دورة التقييم', entity: 'evaluation-cycle', entityId: cycle.id,
          oldValues: { state: 'OPEN' },
          newValues: { state: 'ARCHIVED', rows: snapshot?.rows.length ?? 0, exams: snapshot?.exams.length ?? 0 },
        };
      }))) return;
      setCloseOpen(false);
      toast('تم إغلاق وأرشفة دورة التقييم.');
    } catch (failure) { toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الدورة.'); }
  }

  function selectSeason(value: string) {
    router.replace(value ? `/evaluations/cycles?season=${encodeURIComponent(value)}` : '/evaluations/cycles');
  }

  return { data, season, cycle, visibleCycle, canOpen, archived, leaderboard, seasonFilter, selectSeason, closeOpen, setCloseOpen, openCycle, closeCycle, pending };
}
