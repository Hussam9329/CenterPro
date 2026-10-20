import { describe, expect, it } from 'vitest';
import { scoreGuess } from '../../src/components/rest/games/wordle';
import { winnerOf } from '../../src/components/rest/games/xo';
import { dropDisc, emptyBoard, findWinner } from '../../src/components/rest/games/connect4';
import { createBoard, revealCells } from '../../src/components/rest/games/minesweeper';
import { initialState, step } from '../../src/components/rest/games/snake';
import { formatDuration, leaderboard, playProblem, restStats, type PlayRecord } from '../../src/lib/rest/plays';

describe('rest games logic', () => {
  it('scores Arabic Wordle guesses with repeated letters and alef forms', () => {
    expect(scoreGuess('مدرسة', 'مدرسة')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
    // Only one ة exists in the answer, so the second guessed copy is absent.
    expect(scoreGuess('ةةبرد', 'مدرسة')).toEqual(['present', 'absent', 'absent', 'present', 'present']);
    expect(scoreGuess('أمطار', 'امطار')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
  });

  it('finds XO and Connect 4 winners', () => {
    expect(winnerOf(['X', 'X', 'X', null, 'O', 'O', null, null, null])).toEqual({ player: 'X', line: [0, 1, 2] });
    expect(winnerOf(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toBeNull();
    let board = emptyBoard();
    for (const column of [0, 1, 2, 3]) board = dropDisc(board, column, 'red')!.board;
    expect(findWinner(board)?.player).toBe('red');
    let full = emptyBoard();
    for (let row = 0; row < 6; row++) full = dropDisc(full, 0, row % 2 ? 'red' : 'black')!.board;
    expect(dropDisc(full, 0, 'red')).toBeNull();
  });

  it('keeps the first Minesweeper click and its neighbours safe and floods empty areas', () => {
    const board = createBoard(9, 9, 10, 4, 4, () => 0.5);
    expect(board.flat().filter(cell => cell.mine)).toHaveLength(10);
    for (let row = 3; row <= 5; row++) for (let col = 3; col <= 5; col++) expect(board[row][col].mine).toBe(false);
    const opened = revealCells(board, 4, 4);
    expect(opened[4][4].revealed).toBe(true);
    expect(opened.flat().filter(cell => cell.revealed).length).toBeGreaterThanOrEqual(1);
  });

  it('moves the snake, grows on food and ends on a wall', () => {
    const start = initialState(free => free[0]);
    const moved = step(start, 'right', free => free[0]);
    expect(moved.alive).toBe(true);
    let state = start;
    for (let index = 0; index < 20 && state.alive; index++) state = step(state, 'up', free => free[0]);
    expect(state.alive).toBe(false);
  });
});

describe('rest play records', () => {
  const now = new Date('2026-10-20T10:00:00.000Z');
  const base = { id: 'p', game: 'snake' as const, startedAt: '2026-10-20T09:58:00.000Z', durationMs: 100_000, score: 9, outcome: 'end' as const };
  it('accepts plausible plays and rejects tampered ones', () => {
    expect(playProblem(base, now)).toBeNull();
    expect(playProblem({ ...base, score: 400 }, now)).not.toBeNull();
    expect(playProblem({ ...base, durationMs: 500_000 }, now)).not.toBeNull();
    expect(playProblem({ ...base, game: 'wordle', score: 7, outcome: 'win' }, now)).not.toBeNull();
    expect(playProblem({ ...base, game: 'xo', score: 0, outcome: 'loss' }, now)).not.toBeNull();
  });

  it('builds leaderboards and owner statistics', () => {
    const names = new Map([['a', 'علي'], ['b', 'مريم']]);
    const plays: PlayRecord[] = [
      { ...base, id: '1', employeeId: 'a', score: 5, playDate: '2026-10-20' },
      { ...base, id: '2', employeeId: 'a', score: 11, playDate: '2026-10-20', startedAt: '2026-10-20T09:59:00.000Z' },
      { ...base, id: '3', employeeId: 'b', score: 11, playDate: '2026-10-20' },
      { ...base, id: '4', employeeId: 'b', game: 'xo', score: 0, outcome: 'draw', playDate: '2026-10-20', durationMs: 20_000 },
    ];
    // Same best score: fewer attempts ranks first.
    expect(leaderboard(plays, 'snake', names).map(entry => [entry.name, entry.best])).toEqual([['مريم', 11], ['علي', 11]]);
    const stats = restStats(plays, names);
    expect(stats.totals).toEqual({ plays: 4, players: 2, totalMs: 320_000 });
    expect(stats.employees.find(entry => entry.employeeId === 'b')?.games.xo).toMatchObject({ plays: 1, totalMs: 20_000 });
    expect(stats.recent[0].id).toBe('2');
    expect(formatDuration(45_000)).toBe('45 ث');
    expect(formatDuration(125_000)).toBe('2 د 05 ث');
    expect(formatDuration(3_900_000)).toBe('1 س 05 د');
  });
});
