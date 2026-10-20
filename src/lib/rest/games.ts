// Shared contract for the Rest area games, used by the browser and the server. Games are pure
// client components: they never fetch or store anything; the page records the play on `onFinish`.

export const GAME_IDS = ['wordle', 'minesweeper', 'snake', 'xo', 'connect4'] as const;
export type GameId = typeof GAME_IDS[number];

/** win/loss for solo games, draw for pair games without a winner, end for score-only games. */
export type GameOutcome = 'win' | 'loss' | 'draw' | 'end';

export interface GameResult {
  /** Higher is better. 0 when a game has no meaningful score (e.g. a lost round). */
  score: number;
  outcome: GameOutcome;
  /** Short Arabic sentence shown to the player, e.g. "فاز اللاعب X". */
  summary: string;
}

export interface GameProps {
  /** Called exactly once per finished round. The game may offer "play again" afterwards. */
  onFinish: (result: GameResult) => void;
}

export interface GameInfo {
  id: GameId;
  name: string;
  description: string;
  players: 'solo' | 'pair';
  /** Whether a per-game best-score leaderboard makes sense. */
  ranked: boolean;
  /** How the score is explained on the leaderboard. */
  scoreLabel: string;
}

export const GAMES: readonly GameInfo[] = [
  { id: 'wordle', name: 'كلمة اليوم', description: 'احزر الكلمة العربية المشتركة لليوم بست محاولات.', players: 'solo', ranked: true, scoreLabel: 'نقاط (أقل محاولات = نقاط أكثر)' },
  { id: 'minesweeper', name: 'كاسحة الألغام', description: 'افتح المربعات وتجنّب الألغام بالاعتماد على الأرقام.', players: 'solo', ranked: true, scoreLabel: 'نقاط (أسرع فوز = نقاط أكثر)' },
  { id: 'snake', name: 'الثعبان', description: 'كُل أكبر عدد من النقاط دون أن تصطدم.', players: 'solo', ranked: true, scoreLabel: 'عدد النقاط المأكولة' },
  { id: 'xo', name: 'إكس أو', description: 'لاعبان على نفس الجهاز بالتناوب.', players: 'pair', ranked: false, scoreLabel: '' },
  { id: 'connect4', name: 'أربعة بخط', description: 'لاعبان على نفس الجهاز: صِل أربع قطع بخط واحد.', players: 'pair', ranked: false, scoreLabel: '' },
];

export function gameInfo(id: GameId): GameInfo {
  return GAMES.find(game => game.id === id)!;
}
