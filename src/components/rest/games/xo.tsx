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

/** Each player keeps at most this many marks; placing another removes their oldest. */
export const XO_MARKS_PER_PLAYER = 3;

export interface XoMove { index: number; player: XoPlayer }

export function boardOf(moves: readonly XoMove[]): XoCell[] {
  const board = Array<XoCell>(9).fill(null);
  for (const move of moves) board[move.index] = move.player;
  return board;
}

/** The mark that will vanish when `player` places their next one, if they already have the maximum. */
export function vanishingMove(moves: readonly XoMove[], player: XoPlayer): XoMove | null {
  const own = moves.filter(move => move.player === player);
  return own.length >= XO_MARKS_PER_PLAYER ? own[0] : null;
}

/** Places a mark; a player's oldest mark is removed once they would exceed the maximum. */
export function placeMark(moves: readonly XoMove[], index: number, player: XoPlayer): XoMove[] {
  const oldest = vanishingMove(moves, player);
  return [...moves.filter(move => move !== oldest), { index, player }];
}

interface Score { X: number; O: number }

const ZERO_SCORE: Score = { X: 0, O: 0 };

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
  const [moves, setMoves] = useState<XoMove[]>([]);
  const [moveCount, setMoveCount] = useState(0);
  const [round, setRound] = useState(0);
  const [score, setScore] = useState<Score>(ZERO_SCORE);

  const starter: XoPlayer = round % 2 === 0 ? 'X' : 'O';
  // Turns alternate from the round's starter; marks vanish, so count moves, not cells.
  const turn: XoPlayer = moveCount % 2 === 0 ? starter : starter === 'X' ? 'O' : 'X';
  const board = boardOf(moves);
  const win = winnerOf(board);
  const over = win !== null;
  const fading = over ? null : vanishingMove(moves, turn);

  function play(index: number) {
    if (over || board[index]) return;
    const next = placeMark(moves, index, turn);
    setMoves(next);
    setMoveCount(count => count + 1);

    // Finishing is detected here (not in an effect) so onFinish fires once per round, even under StrictMode.
    // With vanishing marks the board never fills, so every round ends with a winner.
    const result = winnerOf(boardOf(next));
    if (result) {
      setScore(s => ({ ...s, [result.player]: s[result.player] + 1 }));
      onFinish({ score: 0, outcome: 'win', summary: `فاز اللاعب ${result.player}!` });
    }
  }

  function newRound() {
    setMoves([]);
    setMoveCount(0);
    setRound(r => r + 1);
  }

  const status = win ? `فاز اللاعب ${win.player}!` : `دور اللاعب ${turn}`;

  return (
    <div className={styles.root}>
      <dl className={styles.score}>
        <div className={styles.scoreItem}><dt>اللاعب X</dt><dd>{score.X}</dd></div>
        <div className={styles.scoreItem}><dt>اللاعب O</dt><dd>{score.O}</dd></div>
      </dl>

      <p className={styles.status} aria-live="polite" role="status">{status}</p>
      <p className={styles.rule}>لكل لاعب {XO_MARKS_PER_PLAYER} علامات فقط؛ عند وضع الرابعة تختفي أقدم علامة له.</p>

      <div className={styles.board} dir="ltr" role="group" aria-label="لوحة إكس أو">
        {board.map((cell, i) => {
          const winning = win?.line.includes(i) ?? false;
          const vanishing = fading?.index === i;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.cell}${winning ? ` ${styles.win}` : ''}${vanishing ? ` ${styles.vanishing}` : ''}`}
              onClick={() => play(i)}
              disabled={cell !== null || over}
              aria-label={`المربع ${i + 1}: ${cell ?? 'فارغ'}${vanishing ? ' (ستختفي)' : ''}`}
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
