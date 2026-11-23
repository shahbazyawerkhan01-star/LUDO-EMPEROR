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

export type RivalryCalloutKind = 'dethrone_alert' | 'leader_hit' | 'grudge_hit';

const RIVALRY_LINES: Record<string, Record<RivalryCalloutKind, string[]>> = {
  Strategist: {
    dethrone_alert: [
      'Alert: {target} is at {pct}%! Build 2-token roadblocks before their home stretch!',
      '{target} leads at {pct}% — hold a truce and cut off their path!',
    ],
    leader_hit: [
      'Calculated ambush! {target} goes back to base!',
      'Dethroned {target}! The board is wide open again!',
    ],
    grudge_hit: [
      'Debt settled, {target}. Check the math on that payback!',
    ],
  },
  Confidante: {
    dethrone_alert: [
      'Everyone watch {target} at {pct}%! Truce for now until we slow them down!',
      'Hold on — {target} is pulling away ({pct}%). Team up and stop the leader!',
    ],
    leader_hit: [
      'Needed that! Sorry {target}, the table needed a reset!',
      'Whew! {target} was too close to winning — great stop!',
    ],
    grudge_hit: [
      'Got you back, {target}! Now we are even!',
    ],
  },
  Rival: {
    dethrone_alert: [
      '{target} at {pct}%?! Nobody let them walk into home!',
      'Crown check on {target} ({pct}%) — hunting the leader now!',
    ],
    leader_hit: [
      'Sit down, {target}! Nobody runs away with my crown!',
      'Target eliminated! Back to base, {target}!',
    ],
    grudge_hit: [
      'Told you I do not forget, {target}! Back to base!',
    ],
  },
  Rideordie: {
    dethrone_alert: [
      'Yo squad, {target} hit {pct}%! Whisper to your allies and trap them!',
      '{target} is running away at {pct}% — all hands on the leader!',
    ],
    leader_hit: [
      'Boom! Took out the leader {target} for the table!',
      'Not on my watch, {target}! Back to yard!',
    ],
    grudge_hit: [
      'Payback delivered to {target}! Loyalty remembers!',
    ],
  },
};

export function getRivalryCalloutLine(opts: {
  kind: RivalryCalloutKind;
  personality?: string;
  targetName: string;
  leaderPct?: number;
  seedIdx?: number;
}): string {
  const persona = opts.personality && RIVALRY_LINES[opts.personality] ? opts.personality : 'Rival';
  const pool = RIVALRY_LINES[persona][opts.kind] || RIVALRY_LINES.Rival[opts.kind];
  const idx =
    typeof opts.seedIdx === 'number' && Number.isInteger(opts.seedIdx) && opts.seedIdx >= 0
      ? opts.seedIdx % pool.length
      : Math.floor(Math.random() * pool.length);
  const pctStr = String(Math.max(0, Math.round(opts.leaderPct ?? 0)));
  return pool[idx]
    .replace(/\{target\}/g, opts.targetName || 'Leader')
    .replace(/\{pct\}/g, pctStr);
}
