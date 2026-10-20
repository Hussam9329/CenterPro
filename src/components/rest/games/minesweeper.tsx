'use client';

import { Flag } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { GameProps } from '../types';
import styles from './minesweeper.module.css';

export const ROWS = 9;
export const COLS = 9;
export const MINES = 10;

export interface Cell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
}

export type Board = Cell[][];
type Status = 'ready' | 'playing' | 'won' | 'lost';

function neighbours(rows: number, cols: number, row: number, col: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      if ((dr !== 0 || dc !== 0) && r >= 0 && r < rows && c >= 0 && c < cols) out.push([r, c]);
    }
  }
  return out;
}

export function emptyBoard(rows: number, cols: number): Board {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ mine: false, adjacent: 0, revealed: false, flagged: false })),
  );
}

/** Places `mines` mines anywhere except (safeRow, safeCol) and its neighbours, then counts adjacency. */
export function createBoard(
  rows: number,
  cols: number,
  mines: number,
  safeRow: number,
  safeCol: number,
  random: () => number = Math.random,
): Board {
  const board = emptyBoard(rows, cols);
  const safe = new Set([`${safeRow},${safeCol}`, ...neighbours(rows, cols, safeRow, safeCol).map(([r, c]) => `${r},${c}`)]);
  const candidates: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) if (!safe.has(`${r},${c}`)) candidates.push([r, c]);
  }
  // Partial Fisher–Yates: unbiased and never loops forever on dense boards.
  const count = Math.min(mines, candidates.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    const [r, c] = candidates[i];
    board[r][c].mine = true;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      board[r][c].adjacent = neighbours(rows, cols, r, c).filter(([nr, nc]) => board[nr][nc].mine).length;
    }
  }
  return board;
}

function cloneBoard(board: Board): Board {
  return board.map(row => row.map(cell => ({ ...cell })));
}

/** Reveals a cell (flood-filling zero regions). Flagged or already revealed cells are left unchanged. */
export function revealCells(board: Board, row: number, col: number): Board {
  const start = board[row]?.[col];
  if (!start || start.revealed || start.flagged) return board;
  const next = cloneBoard(board);
  const rows = next.length;
  const cols = next[0].length;
  const stack: Array<[number, number]> = [[row, col]];
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const cell = next[r][c];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (!cell.mine && cell.adjacent === 0) stack.push(...neighbours(rows, cols, r, c));
  }
  return next;
}

export function toggleFlag(board: Board, row: number, col: number): Board {
  const cell = board[row]?.[col];
  if (!cell || cell.revealed) return board;
  const next = cloneBoard(board);
  next[row][col].flagged = !cell.flagged;
  return next;
}

export function revealMines(board: Board): Board {
  return board.map(row => row.map(cell => (cell.mine ? { ...cell, revealed: true } : cell)));
}

export function isWon(board: Board): boolean {
  return board.every(row => row.every(cell => cell.mine || cell.revealed));
}

export function hitMine(board: Board): boolean {
  return board.some(row => row.some(cell => cell.mine && cell.revealed));
}

export function winScore(seconds: number): number {
  return Math.max(1, 999 - seconds);
}

// Event handlers only; the purity lint cannot tell them apart from render code.
const now = () => Date.now();

function cellLabel(cell: Cell, row: number, col: number): string {
  const prefix = `مربع ${row + 1}، ${col + 1}: `;
  if (!cell.revealed) return prefix + (cell.flagged ? 'علم' : 'مغلق');
  if (cell.mine) return prefix + 'لغم';
  if (cell.adjacent === 0) return prefix + 'فارغ';
  return prefix + `${cell.adjacent} ألغام مجاورة`;
}

export function MinesweeperGame({ onFinish }: GameProps) {
  const [board, setBoard] = useState<Board>(() => emptyBoard(ROWS, COLS));
  const [status, setStatus] = useState<Status>('ready');
  const [seconds, setSeconds] = useState(0);
  const [flagMode, setFlagMode] = useState(false);
  const startedAt = useRef(0);
  const reported = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== 'playing') return;
    const id = window.setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const over = status === 'won' || status === 'lost';
  const flags = board.reduce((n, row) => n + row.filter(cell => cell.flagged).length, 0);

  function finish(nextStatus: 'won' | 'lost', elapsed: number) {
    setStatus(nextStatus);
    setSeconds(elapsed);
    if (reported.current) return;
    reported.current = true;
    onFinish(
      nextStatus === 'won'
        ? { score: winScore(elapsed), outcome: 'win', summary: `فزت خلال ${elapsed} ثانية!` }
        : { score: 0, outcome: 'loss', summary: 'انفجر لغم! حاول مرة أخرى.' },
    );
  }

  function reveal(row: number, col: number) {
    if (over || board[row][col].flagged || board[row][col].revealed) return;
    let current = board;
    if (status === 'ready') {
      // Mines are placed only now so the first click is always safe; flags placed earlier carry over.
      current = createBoard(ROWS, COLS, MINES, row, col).map((cells, r) =>
        cells.map((cell, c) => ({ ...cell, flagged: board[r][c].flagged })),
      );
      startedAt.current = now();
      setStatus('playing');
    }
    let next = revealCells(current, row, col);
    const elapsed = Math.floor((now() - startedAt.current) / 1000);
    if (hitMine(next)) {
      next = revealMines(next);
      setBoard(next);
      finish('lost', elapsed);
      return;
    }
    setBoard(next);
    if (isWon(next)) finish('won', elapsed);
  }

  function flag(row: number, col: number) {
    if (over) return;
    setBoard(toggleFlag(board, row, col));
  }

  function handleClick(row: number, col: number) {
    if (flagMode) flag(row, col);
    else reveal(row, col);
  }

  function handleContextMenu(event: MouseEvent, row: number, col: number) {
    event.preventDefault();
    flag(row, col);
  }

  function handleKeyDown(event: KeyboardEvent, row: number, col: number) {
    if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      flag(row, col);
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    const r = Math.min(ROWS - 1, Math.max(0, row + move[0]));
    const c = Math.min(COLS - 1, Math.max(0, col + move[1]));
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${c}"]`)?.focus();
  }

  function newRound() {
    setBoard(emptyBoard(ROWS, COLS));
    setStatus('ready');
    setSeconds(0);
    setFlagMode(false);
    reported.current = false;
  }

  return (
    <div className={styles.game}>
      <div className={styles.bar}>
        <span className={styles.counter} aria-label={`الألغام المتبقية: ${MINES - flags}`}>
          <Flag size={16} aria-hidden="true" />
          <b>{MINES - flags}</b>
        </span>
        <button
          type="button"
          className={styles.mode}
          aria-pressed={flagMode}
          onClick={() => setFlagMode(mode => !mode)}
          disabled={over}
        >
          {flagMode ? 'وضع العلم' : 'وضع الفتح'}
        </button>
        <span className={styles.counter} aria-label={`الوقت: ${seconds} ثانية`} role="timer">
          <b>{seconds}</b>
          <small>ث</small>
        </span>
      </div>

      <div
        ref={gridRef}
        className={styles.board}
        dir="ltr"
        role="grid"
        aria-label="لوحة كاسحة الألغام"
      >
        {board.map((cells, r) => (
          <div key={r} role="row" className={styles.row} style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
            {cells.map((cell, c) => {
              const className = [
                styles.cell,
                cell.revealed ? styles.open : '',
                cell.revealed && cell.mine ? styles.mine : '',
                cell.revealed && !cell.mine && cell.adjacent > 0 ? styles[`n${cell.adjacent}`] : '',
              ].filter(Boolean).join(' ');
              return (
                <div key={c} role="gridcell" className={styles.slot}>
                  <button
                    type="button"
                    data-cell={`${r}-${c}`}
                    className={className}
                    aria-label={cellLabel(cell, r, c)}
                    aria-disabled={over || cell.revealed}
                    onClick={() => handleClick(r, c)}
                    onContextMenu={event => handleContextMenu(event, r, c)}
                    onKeyDown={event => handleKeyDown(event, r, c)}
                  >
                    {cell.revealed && cell.mine && <span className={styles.dot} aria-hidden="true" />}
                    {cell.revealed && !cell.mine && cell.adjacent > 0 && cell.adjacent}
                    {!cell.revealed && cell.flagged && <Flag className={styles.flag} aria-hidden="true" />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className={styles.hint}>
        انقر لفتح مربع، والنقر بالزر الأيمن أو زر «وضع العلم» لوضع علم. بلوحة المفاتيح: Enter للفتح وF للعلم والأسهم للتنقل.
      </p>

      {over && (
        <div className={styles.result} role="status">
          <strong>{status === 'won' ? `فزت خلال ${seconds} ثانية!` : 'انفجر لغم! حاول مرة أخرى.'}</strong>
          <button type="button" className={styles.again} onClick={newRound}>
            جولة جديدة
          </button>
        </div>
      )}
    </div>
  );
}
