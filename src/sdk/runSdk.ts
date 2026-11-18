import { AI_PERSONALITIES, cloneDefaultPlayers, type PlayerConfig } from '../game/rules';

export interface AiBondHistory {
  matches: number;
  iCaptured: number;
  theyCaptured: number;
}

export interface WinStats {
  wins: Record<string, number>;
  balances: Record<string, number>;
  bonds: Record<string, number>;
  history: Record<string, AiBondHistory>;
  matchesPlayed: number;
}

export interface SavedPreferences {
  language: string;
  volume: number;
  musicVolume: number;
  musicId: string;
  boardThemeId: string;
  tournamentBoardThemeId: string;
  diceStyle: string;
  backgroundId: string;
  rotateBoard: boolean;
  cameraTilt: number;
  turnTimerEnabled: boolean;
  turnTimerDuration: 60 | 90 | 120 | 0;
  hasSeenGuide: boolean;
  aiVoiceMuted: boolean;
  mutedSeats: number[];
}

const STATS_KEY = 'ludo_dethroned_winstats_v2';
const PREFS_KEY = 'ludo_dethroned_prefs_v2';
const ONLINE_NAME_KEY = 'ludo_online_name';
const ONLINE_WISH_KEY = 'ludo_online_wish';
const PLAYERS_KEY = 'ludo_dethroned_players_v2';

export function getDefaultWinStats(): WinStats {
  const players = cloneDefaultPlayers();
  const wins: Record<string, number> = {};
  const balances: Record<string, number> = {};
  const bonds: Record<string, number> = {};
  players.forEach((p) => {
    wins[p.name] = 0;
    balances[p.name] = 5;
    bonds[p.name] = 50;
  });
  return { wins, balances, bonds, history: {}, matchesPlayed: 0 };
}

export function getDefaultPreferences(): SavedPreferences {
  return {
    language: 'en',
    volume: 0.7,
    musicVolume: 0.45,
    musicId: 'none',
    boardThemeId: 'classic',
    tournamentBoardThemeId: 'classic',
    diceStyle: 'classic',
    backgroundId: 'bg_led_display',
    rotateBoard: false,
    cameraTilt: 0.75,
    turnTimerEnabled: true,
    turnTimerDuration: 90,
    hasSeenGuide: false,
    aiVoiceMuted: false,
    mutedSeats: [],
  };
}

export const runSdk = {
  loadWinStats(): WinStats {
    const def = getDefaultWinStats();
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      return {
        wins: { ...def.wins, ...(parsed.wins || {}) },
        balances: { ...def.balances, ...(parsed.balances || {}) },
        bonds: { ...def.bonds, ...(parsed.bonds || {}) },
        history: { ...(parsed.history || {}) },
        matchesPlayed: Number(parsed.matchesPlayed) || 0,
      };
    } catch {
      return def;
    }
  },

  saveWinStats(stats: WinStats): void {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      // Ignore storage quota errors
    }
  },

  loadPreferences(): SavedPreferences {
    const def = getDefaultPreferences();
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      return {
        ...def,
        ...parsed,
        aiVoiceMuted: typeof parsed.aiVoiceMuted === 'boolean' ? parsed.aiVoiceMuted : def.aiVoiceMuted,
        mutedSeats: Array.isArray(parsed.mutedSeats)
          ? parsed.mutedSeats.filter((n: unknown) => typeof n === 'number' && n >= 0 && n <= 4)
          : def.mutedSeats,
      };
    } catch {
      return def;
    }
  },

  savePreferences(prefs: SavedPreferences): void {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  },

  loadPlayers(): PlayerConfig[] {
    const def = cloneDefaultPlayers();
    try {
      const raw = localStorage.getItem(PLAYERS_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length !== 5) return def;
      return def.map((d, idx) => {
        const saved = parsed[idx] || {};
        const validPersonality = AI_PERSONALITIES.some((ap) => ap.value === saved.personality)
          ? saved.personality
          : d.personality;
        return {
          ...d,
          name: typeof saved.name === 'string' && saved.name.trim() ? saved.name.trim() : d.name,
          color: d.color,
          isAI: typeof saved.isAI === 'boolean' ? saved.isAI : d.isAI,
          personality: validPersonality,
          gender: saved.gender === 'female' ? 'female' : 'male',
          icon: typeof saved.icon === 'string' ? saved.icon : d.icon,
          wish:
            Array.isArray(saved.wish) && saved.wish.length >= 2
              ? [Number(saved.wish[0]) || 6, Number(saved.wish[1]) || 5]
              : d.wish,
        };
      });
    } catch {
      return def;
    }
  },

  savePlayers(players: PlayerConfig[]): void {
    try {
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
    } catch {
      // Ignore storage quota errors
    }
  },

  getOnlineName(): string {
    try {
      return localStorage.getItem(ONLINE_NAME_KEY) || '';
    } catch {
      return '';
    }
  },

  setOnlineName(name: string): void {
    try {
      localStorage.setItem(ONLINE_NAME_KEY, name);
    } catch {}
  },

  getOnlineWish(): [number, number] {
    try {
      const raw = localStorage.getItem(ONLINE_WISH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          let w1 = Math.min(6, Math.max(1, Number(parsed[0]) || 6));
          let w2 = Math.min(6, Math.max(1, Number(parsed[1]) || 5));
          if (w1 === 6 && w2 === 6) w2 = 5;
          return [w1, w2];
        }
      }
    } catch {}
    return [6, 5];
  },

  setOnlineWish(wish: [number, number]): void {
    try {
      localStorage.setItem(ONLINE_WISH_KEY, JSON.stringify(wish));
    } catch {}
  },
};
