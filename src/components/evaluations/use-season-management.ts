'use client';

import { useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useDemo, useToast } from '@/components/demo-provider';
import { useAsyncMutation } from '@/components/use-async-mutation';
import { buildEvaluationSeasonSnapshot, getOpenEvaluationCycle, getOpenEvaluationSeason, getSeasonLeaderboard } from '@/lib/evaluations';

/** Owns season forms and the atomic closing-date snapshot transition. */
export function useSeasonManagement() {
  const { data, session, updateData, month: currentMonth } = useDemo();
  const params = useSearchParams();
  const toast = useToast();
  const { mutate, pending } = useAsyncMutation(toast);
  const season = getOpenEvaluationSeason(data);
  const cycle = getOpenEvaluationCycle(data);
  const rows = season ? getSeasonLeaderboard(data, season.id) : [];
  const archived = [...data.evaluationSeasons].filter(item => item.state === 'ARCHIVED').sort((a,b) => (b.closedAt || '').localeCompare(a.closedAt || ''));
  const [createOpen, setCreateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState(`${currentMonth}-01`);
  const [error, setError] = useState('');

  async function createSeason(event: FormEvent) {
    event.preventDefault();
    if (!session || season) return;
    const id = crypto.randomUUID();
    const value = name.trim() || `الموسم ${data.evaluationSeasons.length + 1}`;
    const now = new Date().toISOString();
    try {
      if (!await mutate(() => updateData(draft => {
        draft.evaluationSeasons.push({ id, name: value, startDate, state: 'OPEN', openedAt: now, openedBy: session.name });
      }, {
        action: 'فتح موسم تقييم جديد', entity: 'evaluation-season', entityId: id,
        newValues: { name: value, startDate },
      }), setError)) return;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'تعذر فتح الموسم.');
      return;
    }
    setCreateOpen(false);
    setName('');
    setError('');
    toast('تم فتح الموسم.');
  }

  async function closeSeason() {
    if (!session || !season) return;
    if (cycle) { toast('أغلق الـ Drive الحالي أولاً.'); return; }
    const now = new Date().toISOString();
    try {
      if (!await mutate(() => updateData(draft => {
        const current = draft.evaluationSeasons.find(item => item.id === season.id);
        if (!current) throw new Error('الموسم غير موجود.');
        current.endDate = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Baghdad', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(now));
        current.snapshot = buildEvaluationSeasonSnapshot(draft, season.id);
        current.state = 'ARCHIVED';
        current.closedAt = now;
        current.closedBy = session.name;
      }, (_before, after) => {
        const snapshot = after.evaluationSeasons.find(item => item.id === season.id)?.snapshot;
        return {
          action: 'إغلاق وأرشفة الموسم', entity: 'evaluation-season', entityId: season.id,
          oldValues: { state: 'OPEN' },
          newValues: { state: 'ARCHIVED', rows: snapshot?.rows.length ?? 0, cycles: snapshot?.cycleIds.length ?? 0 },
        };
      }))) return;
      setCloseOpen(false);
      toast('تم أرشفة الموسم.');
    }
    catch (failure) { toast(failure instanceof Error ? failure.message : 'تعذرت أرشفة الموسم.'); }
  }

  return {
    data, season, cycle, rows, archived, selectedSeason: params.get('season'),
    createOpen, setCreateOpen, closeOpen, setCloseOpen, name, setName,
    startDate, setStartDate, error, createSeason, closeSeason, pending,
  };
}
