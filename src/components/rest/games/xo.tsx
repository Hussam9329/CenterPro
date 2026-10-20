'use client';

import { useState } from 'react';
import type { GameProps } from '../types';
import styles from './xo.module.css';

export type XoPlayer = 'X' | 'O';
export type XoCell = XoPlayer | null;

const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function winnerOf(board: XoCell[]): { player: XoPlayer; line: number[] } | null {
  for (const [a, b, c] of LINES) {
    const player = board[a];
    if (player && player === board[b] && player === board[c]) return { player, line: [a, b, c] };
  }
  return null;
}

interface Score { X: number; O: number; draws: number }

const EMPTY_BOARD: XoCell[] = Array<XoCell>(9).fill(null);
const ZERO_SCORE: Score = { X: 0, O: 0, draws: 0 };

function Mark({ player }: { player: XoPlayer }) {
  return player === 'X' ? (
    <svg className={`${styles.mark} ${styles.markX}`} viewBox="0 0 40 40" aria-hidden="true">
      <path d="M10 10 L30 30 M30 10 L10 30" />
    </svg>
  ) : (
    <svg className={`${styles.mark} ${styles.markO}`} viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="11" />
    </svg>
  );
}

export function XoGame({ onFinish }: GameProps) {
  const [board, setBoard] = useState<XoCell[]>(EMPTY_BOARD);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<Score>(ZERO_SCORE);

  const starter: XoPlayer = round % 2 === 0 ? 'X' : 'O';
  const filled = board.filter(Boolean).length;
  // Turns alternate from the round's starter, so the mover follows from the move count.
  const turn: XoPlayer = filled % 2 === 0 ? starter : starter === 'X' ? 'O' : 'X';
  const win = winnerOf(board);
  const over = win !== null || filled === 9;

  function play(index: number) {
    if (over || board[index]) return;
    const next = board.slice();
    next[index] = turn;
    setBoard(next);

    // Finishing is detected here (not in an effect) so onFinish fires once per round, even under StrictMode.
    const result = winnerOf(next);
    if (result) {
      setScore(s => ({ ...s, [result.player]: s[result.player] + 1 }));
      onFinish({ score: 0, outcome: 'win', summary: `فاز اللاعب ${result.player}!` });
    } else if (next.every(Boolean)) {
      setScore(s => ({ ...s, draws: s.draws + 1 }));
      onFinish({ score: 0, outcome: 'draw', summary: 'تعادل!' });
    }
  }

  function newRound() {
    setBoard(EMPTY_BOARD);
    setRound(r => r + 1);
  }

  const status = win ? `فاز اللاعب ${win.player}!` : over ? 'تعادل!' : `دور اللاعب ${turn}`;

  return (
    <div className={styles.root}>
      <dl className={styles.score}>
        <div className={styles.scoreItem}><dt>اللاعب X</dt><dd>{score.X}</dd></div>
        <div className={styles.scoreItem}><dt>تعادل</dt><dd>{score.draws}</dd></div>
        <div className={styles.scoreItem}><dt>اللاعب O</dt><dd>{score.O}</dd></div>
      </dl>

      <p className={styles.status} aria-live="polite" role="status">{status}</p>

      <div className={styles.board} dir="ltr" role="group" aria-label="لوحة إكس أو">
        {board.map((cell, i) => {
          const winning = win?.line.includes(i) ?? false;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.cell}${winning ? ` ${styles.win}` : ''}`}
              onClick={() => play(i)}
              disabled={cell !== null || over}
              aria-label={`المربع ${i + 1}: ${cell ?? 'فارغ'}`}
            >
              {cell && <Mark player={cell} />}
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        {over && (
          <button type="button" className={`${styles.pill} ${styles.primary}`} onClick={newRound}>جولة جديدة</button>
        )}
        <button type="button" className={styles.pill} onClick={() => setScore(ZERO_SCORE)}>تصفير النتيجة</button>
      </div>
    </div>
  );
}
