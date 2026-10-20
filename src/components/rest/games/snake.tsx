'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GameProps } from '../types';
import styles from './snake.module.css';

export const GRID = 17;
export const BASE_TICK_MS = 140;
export const MIN_TICK_MS = 80;

export type Direction = 'up' | 'down' | 'left' | 'right';
export interface Cell { x: number; y: number }
export interface SnakeState {
  /** Head first. */
  snake: readonly Cell[];
  /** null only when the board is completely filled. */
  food: Cell | null;
  direction: Direction;
  alive: boolean;
  /** Foods eaten so far — this is the score. */
  eaten: number;
}
/** Picks the next food cell from the free cells; injectable so tests are deterministic. */
export type CellPicker = (free: readonly Cell[]) => Cell | undefined;

const DELTAS: Record<Direction, Cell> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const randomCell: CellPicker = free => free[Math.floor(Math.random() * free.length)];

/** True when `next` would reverse the snake straight into its own neck. */
export function isReversal(current: Direction, next: Direction): boolean {
  return OPPOSITE[current] === next;
}

/** Cells not occupied by the snake, in row-major order. */
export function freeCells(snake: readonly Cell[]): Cell[] {
  const taken = new Set(snake.map(c => c.y * GRID + c.x));
  const free: Cell[] = [];
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) if (!taken.has(y * GRID + x)) free.push({ x, y });
  return free;
}

/** A 3-cell snake in the middle row heading right, plus one food. */
export function initialState(pick: CellPicker = randomCell): SnakeState {
  const mid = Math.floor(GRID / 2);
  const snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
  return { snake, food: pick(freeCells(snake)) ?? null, direction: 'right', alive: true, eaten: 0 };
}

/**
 * Advances one tick. A reversing `direction` is ignored (the snake keeps its heading).
 * Hitting a wall or the body sets `alive: false` and leaves the snake unchanged.
 * Eating grows the snake by one, increments `eaten` and places new food via `pick`;
 * filling the whole board also ends the round.
 */
export function step(state: SnakeState, direction: Direction, pick: CellPicker = randomCell): SnakeState {
  if (!state.alive) return state;
  const dir = isReversal(state.direction, direction) ? state.direction : direction;
  const head = state.snake[0];
  const next = { x: head.x + DELTAS[dir].x, y: head.y + DELTAS[dir].y };
  const eats = state.food !== null && next.x === state.food.x && next.y === state.food.y;
  // The tail vacates its cell this tick unless we grow, so moving into it is legal.
  const body = eats ? state.snake : state.snake.slice(0, -1);
  const outside = next.x < 0 || next.y < 0 || next.x >= GRID || next.y >= GRID;
  if (outside || body.some(c => c.x === next.x && c.y === next.y)) return { ...state, direction: dir, alive: false };
  const snake = [next, ...body];
  if (!eats) return { ...state, snake, direction: dir };
  const food = pick(freeCells(snake)) ?? null;
  return { snake, food, direction: dir, alive: food !== null, eaten: state.eaten + 1 };
}

/** 140ms, 10ms faster every 5 foods, never below 80ms. */
export function tickInterval(eaten: number): number {
  return Math.max(MIN_TICK_MS, BASE_TICK_MS - Math.floor(eaten / 5) * 10);
}

export function finishSummary(score: number): string {
  return `انتهت الجولة! جمعت ${score} نقطة.`;
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};
const SWIPE_MIN_PX = 24;

type Status = 'idle' | 'running' | 'paused' | 'over';

// Survives remounts within the tab so "best" is per browser session without storage APIs.
let sessionBest = 0;

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function draw(canvas: HTMLCanvasElement, state: SnakeState) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const size = canvas.width;
  const cell = size / GRID;
  const bg = cssVar(canvas, '--surface', '') || cssVar(canvas, '--rd-chip', '#ffffff');
  const line = cssVar(canvas, '--rd-line', '#ececf0');
  const brand = cssVar(canvas, '--brand', '#A51C30');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = line;
  ctx.lineWidth = Math.max(1, size / 600);
  ctx.beginPath();
  for (let i = 1; i < GRID; i++) {
    const p = Math.round(i * cell) + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, size);
    ctx.moveTo(0, p); ctx.lineTo(size, p);
  }
  ctx.stroke();

  const inset = Math.max(1, cell * 0.08);
  const fillCell = (c: Cell) => ctx.fillRect(c.x * cell + inset, c.y * cell + inset, cell - inset * 2, cell - inset * 2);
  if (state.food) { ctx.fillStyle = '#2f9e6b'; fillCell(state.food); }
  ctx.fillStyle = brand;
  state.snake.forEach(fillCell);
  // A flat dark overlay darkens whatever --brand resolves to without parsing colours.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  fillCell(state.snake[0]);
}

export function SnakeGame({ onFinish }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<SnakeState>(initialState(() => ({ x: GRID - 4, y: Math.floor(GRID / 2) })));
  const queueRef = useRef<Direction[]>([]);
  const finishedRef = useRef(true);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const onFinishRef = useRef(onFinish);
  const [status, setStatus] = useState<Status>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => sessionBest);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  const redraw = useCallback(() => {
    if (canvasRef.current) draw(canvasRef.current, gameRef.current);
  }, []);

  // Size the backing store to CSS pixels × DPR so the board stays crisp.
  useEffect(() => {
    const board = boardRef.current;
    const canvas = canvasRef.current;
    if (!board || !canvas) return;
    const resize = () => {
      const px = Math.round(board.clientWidth * (window.devicePixelRatio || 1));
      if (px > 0 && canvas.width !== px) { canvas.width = px; canvas.height = px; }
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(board);
    // Theme toggles change CSS variables without resizing anything.
    const mo = new MutationObserver(redraw);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', redraw);
    return () => { ro.disconnect(); mo.disconnect(); mq.removeEventListener('change', redraw); };
  }, [redraw]);

  const finishRound = useCallback((eaten: number) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    sessionBest = Math.max(sessionBest, eaten);
    setBest(sessionBest);
    setStatus('over');
    setAnnouncement(finishSummary(eaten));
    onFinishRef.current({ score: eaten, outcome: 'end', summary: finishSummary(eaten) });
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = gameRef.current;
      // Skip queued inputs that would reverse so a fast double-tap is not swallowed.
      let dir = current.direction;
      while (queueRef.current.length) {
        const candidate = queueRef.current.shift()!;
        if (!isReversal(current.direction, candidate) && candidate !== current.direction) { dir = candidate; break; }
      }
      const next = step(current, dir);
      gameRef.current = next;
      redraw();
      if (next.eaten !== current.eaten) setScore(next.eaten);
      if (!next.alive) { finishRound(next.eaten); return; }
      timer = setTimeout(tick, tickInterval(next.eaten));
    };
    timer = setTimeout(tick, tickInterval(gameRef.current.eaten));
    return () => clearTimeout(timer);
  }, [status, redraw, finishRound]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) setStatus(s => (s === 'running' ? 'paused' : s)); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const queueDirection = useCallback((dir: Direction) => {
    const queue = queueRef.current;
    const last = queue[queue.length - 1] ?? gameRef.current.direction;
    if (dir === last || isReversal(last, dir) || queue.length >= 3) return;
    queue.push(dir);
  }, []);

  useEffect(() => {
    if (status !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIRECTIONS[e.key];
      if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      queueDirection(dir);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, queueDirection]);

  const start = () => {
    gameRef.current = initialState();
    queueRef.current = [];
    finishedRef.current = false;
    setScore(0);
    setAnnouncement('');
    setStatus('running');
    redraw();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => { swipeRef.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const origin = swipeRef.current;
    swipeRef.current = null;
    if (!origin || status !== 'running') return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    queueDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };

  const pad = (dir: Direction, label: string, glyph: string) => (
    <button type="button" className={`${styles.padButton} ${styles[dir]}`} aria-label={label}
      onClick={() => queueDirection(dir)} disabled={status !== 'running'}>
      <span aria-hidden="true">{glyph}</span>
    </button>
  );

  return (
    <div className={styles.root}>
      <div className={styles.hud}>
        <span>النقاط: <strong>{score}</strong></span>
        <span>أفضل نتيجة: <strong>{best}</strong></span>
        {(status === 'running' || status === 'paused') && (
          <button type="button" className={styles.secondary}
            onClick={() => setStatus(status === 'running' ? 'paused' : 'running')}>
            {status === 'running' ? 'إيقاف مؤقت' : 'متابعة'}
          </button>
        )}
      </div>

      <div className={styles.board} ref={boardRef} dir="ltr">
        <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={`لوحة الثعبان، النقاط ${score}`}
          onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { swipeRef.current = null; }} />
        {status !== 'running' && (
          <div className={styles.overlay} dir="rtl">
            {status === 'over' && <p className={styles.overlayText}>{finishSummary(score)}</p>}
            {status === 'paused' && <p className={styles.overlayText}>اللعبة متوقفة مؤقتاً</p>}
            <button type="button" className={styles.primary}
              onClick={status === 'paused' ? () => setStatus('running') : start}>
              {status === 'idle' ? 'ابدأ' : status === 'paused' ? 'متابعة' : 'جولة جديدة'}
            </button>
          </div>
        )}
      </div>

      <div className={styles.dpad} dir="ltr">
        {pad('up', 'أعلى', '▲')}
        {pad('left', 'يسار', '◀')}
        {pad('right', 'يمين', '▶')}
        {pad('down', 'أسفل', '▼')}
      </div>

      <p className={styles.hint}>استخدم الأسهم أو W A S D، أو اسحب على اللوحة.</p>
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
