'use client';

import { useEffect, useEffectEvent, useRef, useState, type CSSProperties } from 'react';
import type { GameProps } from '../types';
import styles from './wordle.module.css';

export type LetterState = 'correct' | 'present' | 'absent';

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const LETTER = /^[ء-غف-ي]$/;
const KEY_ROWS = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
];
const STATE_LABEL: Record<LetterState, string> = {
  correct: 'في المكان الصحيح',
  present: 'موجود في مكان آخر',
  absent: 'غير موجود',
};
const STATE_RANK: Record<LetterState, number> = { absent: 1, present: 2, correct: 3 };
const LENGTH_ERROR = 'الكلمة يجب أن تكون 5 أحرف';

/** Folds hamza/alef-maqsura variants so spelling habits don't count as wrong letters; ة and ه stay distinct. */
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي');
}

/** Standard two-pass Wordle scoring: exact matches consume letters first, so repeats are never over-credited. */
export function scoreGuess(guess: string, word: string): LetterState[] {
  const g = Array.from(normalizeArabic(guess));
  const w = Array.from(normalizeArabic(word));
  const result: LetterState[] = g.map(() => 'absent');
  const remaining = new Map<string, number>();
  g.forEach((letter, i) => {
    if (letter === w[i]) result[i] = 'correct';
    else if (w[i] !== undefined) remaining.set(w[i], (remaining.get(w[i]) ?? 0) + 1);
  });
  g.forEach((letter, i) => {
    if (result[i] === 'correct') return;
    const left = remaining.get(letter) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      remaining.set(letter, left - 1);
    }
  });
  return result;
}

interface Guess { letters: string[]; states: LetterState[] }

export function WordleGame({ word, onFinish }: GameProps & { word: string }) {
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [current, setCurrent] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [shaking, setShaking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const finishedRef = useRef(false);
  const finished = result !== null;

  const keyStates = new Map<string, LetterState>();
  for (const guess of guesses) {
    guess.letters.forEach((letter, i) => {
      const key = normalizeArabic(letter);
      const state = guess.states[i];
      const known = keyStates.get(key);
      if (!known || STATE_RANK[state] > STATE_RANK[known]) keyStates.set(key, state);
    });
  }

  function addLetter(letter: string) {
    if (finished || current.length >= WORD_LENGTH) return;
    setMessage('');
    setCurrent([...current, letter]);
  }

  function removeLetter() {
    if (finished) return;
    setMessage('');
    setCurrent(current.slice(0, -1));
  }

  function submit() {
    if (finished || finishedRef.current) return;
    if (current.length !== WORD_LENGTH) {
      setMessage(LENGTH_ERROR);
      setShaking(true);
      return;
    }
    const states = scoreGuess(current.join(''), word);
    const next = [...guesses, { letters: current, states }];
    setGuesses(next);
    setCurrent([]);
    setMessage('');
    const won = states.every(state => state === 'correct');
    if (!won && next.length < MAX_GUESSES) return;
    // The ref guards against a double submit landing before the state update re-renders.
    finishedRef.current = true;
    const n = next.length;
    const summary = won ? `أحسنت! عرفت الكلمة بـ ${n} محاولات.` : `انتهت المحاولات. الكلمة كانت: ${word}`;
    setResult(summary);
    onFinish(won ? { score: 7 - n, outcome: 'win', summary } : { score: 0, outcome: 'loss', summary });
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (finished || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    // preventDefault on Enter also stops a focused on-screen key from being "clicked" a second time.
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
    else if (event.key === 'Backspace') { event.preventDefault(); removeLetter(); }
    else if (LETTER.test(event.key)) { event.preventDefault(); addLetter(event.key); }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const rows = Array.from({ length: MAX_GUESSES }, (_, rowIndex) => {
    const submitted = guesses[rowIndex];
    const isCurrent = !finished && rowIndex === guesses.length;
    const letters = submitted?.letters ?? (isCurrent ? current : []);
    return (
      <div
        key={rowIndex}
        role="row"
        className={`${styles.row} ${isCurrent && shaking ? styles.shake : ''}`}
        onAnimationEnd={isCurrent ? () => setShaking(false) : undefined}
      >
        {Array.from({ length: WORD_LENGTH }, (_, i) => {
          const letter = letters[i];
          const state = submitted?.states[i];
          const label = !letter ? 'فارغ' : state ? `حرف ${letter}: ${STATE_LABEL[state]}` : `حرف ${letter}`;
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={label}
              className={`${styles.tile} ${letter ? styles.filled : ''} ${state ? styles[state] : ''}`}
              style={{ '--i': i } as CSSProperties}
            >
              {letter}
            </div>
          );
        })}
      </div>
    );
  });

  return (
    <div className={styles.game}>
      <div className={styles.board} dir="rtl" role="grid" aria-label="لوحة كلمة اليوم" aria-readonly="true">
        {rows}
      </div>

      <p className={`${styles.message} ${finished ? styles.result : ''}`} role="status" aria-live="polite">
        {result ?? message}
      </p>

      <div className={styles.keyboard} dir="rtl" role="group" aria-label="لوحة المفاتيح">
        {KEY_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className={styles.keyRow}>
            {row.map(letter => {
              const state = keyStates.get(normalizeArabic(letter));
              return (
                <button
                  key={letter}
                  type="button"
                  className={`${styles.key} ${state ? styles[state] : ''}`}
                  aria-label={state ? `${letter}: ${STATE_LABEL[state]}` : letter}
                  disabled={finished}
                  onClick={() => addLetter(letter)}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        ))}
        <div className={styles.keyRow}>
          <button type="button" className={`${styles.key} ${styles.action}`} disabled={finished} onClick={submit}>إدخال</button>
          <button type="button" className={`${styles.key} ${styles.action}`} disabled={finished} onClick={removeLetter}>حذف</button>
        </div>
      </div>
    </div>
  );
}
