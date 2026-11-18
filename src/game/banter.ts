import dialoguesData from './aiDialogues.json';

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

type DialogueEntry = string | {
  text: string;
  roman?: string;
};

type DialogueMap = Record<string, Record<string, DialogueEntry[]>>;

const DIALOGUES = dialoguesData as unknown as DialogueMap;
const lastPickedIndex = new Map<string, number>();

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

export function getAILine(lang: string, event: BanterEvent): string {
  const langDict = DIALOGUES[lang] || DIALOGUES['en'] || {};
  const list = langDict[event] || langDict['banter'] || DIALOGUES['en']?.[event] || [];
  if (list.length > 0) {
    const key = `${lang}:${event}`;
    let idx = Math.floor(Math.random() * list.length);
    if (list.length > 1 && lastPickedIndex.get(key) === idx) {
      idx = (idx + 1) % list.length;
    }
    lastPickedIndex.set(key, idx);
    const pick = list[idx];
    return typeof pick === 'string' ? pick : pick.text;
  }
  const fb = FALLBACK_LINES[event] || FALLBACK_LINES.banter;
  return fb[Math.floor(Math.random() * fb.length)];
}

export function getPersonalityEmote(personality: string): string {
  const list = PERSONALITY_EMOTES[personality] || ['🎲', '🔥', '👍'];
  return list[Math.floor(Math.random() * list.length)];
}
