import { Bomb, Grid3x3, Rows4, SpellCheck2, Spline, type LucideIcon } from 'lucide-react';
import type { GameId } from '@/lib/rest/games';

export const GAME_ICONS: Record<GameId, LucideIcon> = { wordle: SpellCheck2, minesweeper: Bomb, snake: Spline, xo: Grid3x3, connect4: Rows4 };
