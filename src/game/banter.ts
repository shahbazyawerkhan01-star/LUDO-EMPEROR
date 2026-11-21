import enDialoguePack from './dialogues/en.json';

export type BanterEvent =
  | 'turn'
  | 'roll'
  | 'lucky_roll'
  | 'lucky7'
  | 'capture'
  | 'captured'
  | 'pawn_home'
  | 'home_stretch'
  | 'penalty'
  | 'win'
  | 'loss'
  | 'banter';

type DialogueEntry =
  | string
  | {
      text: string;
      roman?: string;
    };

type DialogueEventMap = Record<string, DialogueEntry[]>;

const EN_PACK = enDialoguePack as unknown as DialogueEventMap;
const loadedLanguagePacks = new Map<string, DialogueEventMap>([['en', EN_PACK]]);
const loadingPromises = new Map<string, Promise<void>>();
const lastPickedIndex = new Map<string, number>();

export const AI_EVENT_LINE_COUNT = 5;

const PERSONALITY_EMOTES: Record<string, string[]> = {
  Strategist: ['🧐', '📊', '♟️', '⚡', '🎯'],
  Confidante: ['❤️', '✨', '🤗', '🌟', '👏'],
  Rival: ['😏', '🔥', '😎', '💥', '😤'],
  Rideordie: ['🤝', '💪', '🎉', '🙌', '👊'],
};

const FALLBACK_LINES: Record<BanterEvent, string[]> = {
  turn: ['My turn! Watch closely! 🎲', 'Here we go! ✨'],
  roll: ['Come on, give me a six! 🎲', 'Let the dice decide!'],
  lucky_roll: ['Double 6 power! Let’s fly! 🔥', 'Boom! Sixes rolling! 🎲'],
  lucky7: ['Lucky 7 bonus! Straight to double 6! ✨'],
  capture: ['Back to base! Nothing personal! ⚔️', "Don't let the leader escape! 💥"],
  captured: ['Ouch! Wait till I come back out! 😤'],
  pawn_home: ['Home sweet home! Bonus turn! 🌟'],
  home_stretch: ['Almost there, racing for the crown! 👑'],
  penalty: ['Missed capture hurt! Watching carefully now! ⚠️'],
  win: ['Victory! Champion of the 5-Way Board! 🏆'],
  loss: ['Well played! Rematch soon! 🎲'],
  banter: ['Great match everyone! Stay sharp! 🎲'],
};

export function preloadDialogueLanguage(lang: string): Promise<void> {
  const safeLang = (lang || 'en').trim().toLowerCase();
  if (!safeLang || loadedLanguagePacks.has(safeLang)) return Promise.resolve();
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve();

  const existing = loadingPromises.get(safeLang);
  if (existing) return existing;

  const p = fetch(`/dialogues/${encodeURIComponent(safeLang)}.json`)
    .then(async (resp) => {
      if (!resp.ok) return;
      const json = (await resp.json()) as DialogueEventMap;
      if (json && typeof json === 'object') {
        loadedLanguagePacks.set(safeLang, json);
      }
    })
    .catch(() => {
      // Fall back cleanly to EN_PACK if offline
    })
    .finally(() => {
      loadingPromises.delete(safeLang);
    });

  loadingPromises.set(safeLang, p);
  return p;
}

export function getAILineWithIndex(
  lang: string,
  event: BanterEvent,
  forcedIdx?: number,
): { text: string; lineIdx: number } {
  const safeLang = (lang || 'en').trim().toLowerCase();
  if (!loadedLanguagePacks.has(safeLang)) {
    void preloadDialogueLanguage(safeLang);
  }
  const langDict = loadedLanguagePacks.get(safeLang) || EN_PACK;
  const list = langDict[event] || langDict['banter'] || EN_PACK[event] || [];
  if (list.length > 0) {
    let idx: number;
    if (typeof forcedIdx === 'number' && Number.isInteger(forcedIdx) && forcedIdx >= 0) {
      idx = forcedIdx % list.length;
    } else {
      const key = `${safeLang}:${event}`;
      idx = Math.floor(Math.random() * list.length);
      if (list.length > 1 && lastPickedIndex.get(key) === idx) {
        idx = (idx + 1) % list.length;
      }
      lastPickedIndex.set(key, idx);
    }
    const pick = list[idx];
    return {
      text: typeof pick === 'string' ? pick : pick.text,
      lineIdx: idx,
    };
  }
  const fb = FALLBACK_LINES[event] || FALLBACK_LINES.banter;
  const idx =
    typeof forcedIdx === 'number' && Number.isInteger(forcedIdx) && forcedIdx >= 0
      ? forcedIdx % fb.length
      : Math.floor(Math.random() * fb.length);
  return { text: fb[idx], lineIdx: idx };
}

export function getAILine(lang: string, event: BanterEvent, forcedIdx?: number): string {
  return getAILineWithIndex(lang, event, forcedIdx).text;
}

export function getStaticAiClipUrl(lang: string, event: BanterEvent, lineIdx: number): string {
  const safeLang = (lang || 'en').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'en';
  const safeIdx = Math.max(0, Math.floor(lineIdx));
  return `/audio/tts/${safeLang}/${event}_${safeIdx}.mp3`;
}

export function getPersonalityEmote(personality: string): string {
  const list = PERSONALITY_EMOTES[personality] || ['🎲', '🔥', '👍'];
  return list[Math.floor(Math.random() * list.length)];
}
