'use client';

import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type { GameProps } from '../types';
import styles from './connect4.module.css';

export const ROWS = 6;
export const COLS = 7;

export type Player = 'red' | 'black';
export type Cell = Player | null;
/** Row 0 is the top row. */
export type Board = readonly (readonly Cell[])[];
export interface WinLine { player: Player; cells: readonly (readonly [number, number])[] }

const NAMES: Record<Player, string> = { red: 'الأحمر', black: 'الأسود' };
const other = (p: Player): Player => (p === 'red' ? 'black' : 'red');

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Cell>(COLS).fill(null));
}

export function landingRow(board: Board, column: number): number | null {
  for (let row = board.length - 1; row >= 0; row--) if (board[row][column] === null) return row;
  return null;
}

export function dropDisc(board: Board, column: number, player: Player): { board: Board; row: number } | null {
  if (column < 0 || column >= (board[0]?.length ?? 0)) return null;
  const row = landingRow(board, column);
  if (row === null) return null;
  const next = board.map((cells, r) => (r === row ? cells.map((c, col) => (col === column ? player : c)) : cells));
  return { board: next, row };
}

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

export function findWinner(board: Board): WinLine | null {
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const player = board[r][c];
      if (!player) continue;
      for (const [dr, dc] of DIRECTIONS) {
        const cells = [0, 1, 2, 3].map(i => [r + dr * i, c + dc * i] as const);
        if (cells.every(([rr, cc]) => board[rr]?.[cc] === player)) return { player, cells };
      }
    }
  }
  return null;
}

export const isFull = (board: Board): boolean => board[0].every(cell => cell !== null);

interface Round { board: Board; turn: Player; winner: WinLine | null; draw: boolean }
const newRound = (starter: Player): Round => ({ board: emptyBoard(), turn: starter, winner: null, draw: false });

export function Connect4Game({ onFinish }: GameProps) {
  const [starter, setStarter] = useState<Player>('red');
  const [round, setRound] = useState<Round>(() => newRound('red'));
  const [tally, setTally] = useState({ red: 0, black: 0, draws: 0 });
  const [preview, setPreview] = useState<number | null>(null);
  const columnRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const over = round.winner !== null || round.draw;
  const winning = new Set(round.winner?.cells.map(([r, c]) => `${r}-${c}`));

  function play(column: number) {
    if (over) return;
    const dropped = dropDisc(round.board, column, round.turn);
    if (!dropped) return;
    const winner = findWinner(dropped.board);
    const draw = !winner && isFull(dropped.board);
    setRound({ board: dropped.board, turn: other(round.turn), winner, draw });
    // Reported from the move handler (not an effect) so each round fires exactly once.
    if (winner) {
      setTally(t => ({ ...t, [winner.player]: t[winner.player] + 1 }));
      onFinish({ score: 0, outcome: 'win', summary: `فاز ${NAMES[winner.player]}!` });
    } else if (draw) {
      setTally(t => ({ ...t, draws: t.draws + 1 }));
      onFinish({ score: 0, outcome: 'draw', summary: 'تعادل!' });
    }
  }

  function nextRound() {
    const next = other(starter);
    setStarter(next);
    setRound(newRound(next));
    // Columns are still disabled until the reset renders.
    requestAnimationFrame(() => columnRefs.current[3]?.focus());
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, column: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const target = (column + step + COLS) % COLS;
    columnRefs.current[target]?.focus();
    setPreview(target);
  }

  const status = round.winner ? `فاز ${NAMES[round.winner.player]}!` : round.draw ? 'تعادل!' : `دور ${NAMES[round.turn]}`;
  const statusPlayer = round.winner?.player ?? (round.draw ? null : round.turn);

  return (
    <div className={styles.game}>
      <div className={styles.scores}>
        <span className={styles.score}><i className={`${styles.dot} ${styles.red}`} />الأحمر: {tally.red}</span>
        <span className={styles.score}><i className={`${styles.dot} ${styles.black}`} />الأسود: {tally.black}</span>
        <span className={styles.score}>تعادل: {tally.draws}</span>
      </div>

      <p className={styles.status} aria-live="polite">
        {statusPlayer && <i className={`${styles.dot} ${styles[statusPlayer]}`} />}
        {status}
      </p>

      <div className={styles.board} dir="ltr">
        {Array.from({ length: COLS }, (_, col) => {
          const land = landingRow(round.board, col);
          const free = land === null ? 0 : land + 1;
          return (
            <button
              key={col}
              ref={el => { columnRefs.current[col] = el; }}
              type="button"
              className={styles.column}
              aria-label={`العمود ${col + 1} (${free} خانات فارغة)`}
              disabled={over || land === null}
              onClick={() => play(col)}
              onKeyDown={e => onKeyDown(e, col)}
              onMouseEnter={() => setPreview(col)}
              onMouseLeave={() => setPreview(p => (p === col ? null : p))}
              onFocus={() => setPreview(col)}
              onBlur={() => setPreview(p => (p === col ? null : p))}
            >
              {round.board.map((cells, row) => {
                const cell = cells[col];
                const ghost = !over && cell === null && preview === col && land === row;
                return (
                  <span key={row} className={styles.slot}>
                    {cell && (
                      <span
                        className={`${styles.disc} ${styles[cell]} ${winning.has(`${row}-${col}`) ? styles.win : ''}`}
                        style={{ '--fall': row + 1 } as CSSProperties}
                      />
                    )}
                    {ghost && <span className={`${styles.disc} ${styles.ghost} ${styles[round.turn]}`} />}
                  </span>
                );
              })}
            </button>
          );
        })}
      </div>

      <div className={styles.actions}>
        {over && <button type="button" className={styles.primary} onClick={nextRound}>جولة جديدة</button>}
        <button type="button" className={styles.secondary} onClick={() => setTally({ red: 0, black: 0, draws: 0 })}>
          تصفير النتيجة
        </button>
      </div>
    </div>
  );
}
