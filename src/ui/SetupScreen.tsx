import React from 'react';
import { AI_PERSONALITIES, getPlayerColor, PLAYER_ICONS } from '../game/rules';
import { translate } from '../i18n';
import { useGameStore } from '../state/store';

export const SetupScreen: React.FC = () => {
  const {
    players,
    winStats,
    prefs,
    updatePlayer,
    updatePrefs,
    setScreen,
    openWishModal,
    startLocalMatch,
  } = useGameStore();
  const lang = prefs.language;

  const myGender = players[0]?.gender || 'male';

  const setGender = (gender: 'male' | 'female') => {
    updatePlayer(0, {
      gender,
      icon: gender === 'female' ? '👸' : '🤴',
    });
  };

  return (
    <div id="player-setup-overlay">
      <div id="setup-content" className="modal-scroll">
        <div id="local-setup-section">
          {/* Top Bar: Title + Gender + Turn Timer (stacks in portrait, horizontal row in landscape) */}
          <div className="setup-top-bar">
            <h2 className="setup-section-heading font-display font-bold text-white">
              {translate(lang, 'local_setup')}
            </h2>

            {/* Gender Selector (#gender-setup) */}
            <div id="gender-setup">
              <span className="mr-1.5 font-semibold text-white">I AM:</span>
              <button
                type="button"
                onClick={() => setGender('male')}
                className={`gender-btn ${myGender === 'male' ? 'active' : ''}`}
              >
                MALE 🤴
              </button>
              <button
                type="button"
                onClick={() => setGender('female')}
                className={`gender-btn ${myGender === 'female' ? 'active' : ''}`}
              >
                FEMALE 👸
              </button>
            </div>

            {/* Turn Timer Strip */}
            <div className="setup-timer-strip">
              <span className="font-display text-sm font-bold text-[#f1c40f] uppercase">
                Turn Timer
              </span>
              <div className="flex items-center gap-1.5">
                {([60, 90, 120, 0] as const).map((sec) => {
                  const active =
                    (sec === 0 && !prefs.turnTimerEnabled) ||
                    (prefs.turnTimerEnabled && prefs.turnTimerDuration === sec);
                  return (
                    <button
                      key={sec}
                      type="button"
                      onClick={() =>
                        updatePrefs({
                          turnTimerEnabled: sec !== 0,
                          turnTimerDuration: sec,
                        })
                      }
                      className={`cursor-pointer rounded-full px-3 py-1 font-display text-xs font-bold transition ${
                        active
                          ? 'bg-[#f1c40f] text-black'
                          : 'border border-white/20 bg-white/10 text-white hover:bg-white/20'
                      }`}
                    >
                      {sec === 0 ? 'Off' : `${sec}s`}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 5 Player Setup Cards (1 column in portrait, 2-column wide grid in landscape) */}
          <div className="setup-players-grid">
            {players.map((p, idx) => {
              const bal = winStats.balances[p.name] ?? 5;
              const wins = winStats.wins[p.name] ?? 0;
              return (
                <div
                  key={idx}
                  className={`setup-row ${idx === 4 ? 'setup-row-fifth' : ''}`}
                >
                  <div
                    className="setup-color-dot"
                    style={{ backgroundColor: getPlayerColor(idx, false) }}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={20}
                        value={p.name}
                        onChange={(e) => updatePlayer(idx, { name: e.target.value })}
                        placeholder={`Player ${idx + 1} Name`}
                        className="setup-input"
                      />
                      <span className="shrink-0 text-xs font-bold text-[#f1c40f] tabular-nums">
                        ${bal} • {wins}W
                      </span>
                    </div>

                    {/* Player Icon Selector Strip */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {PLAYER_ICONS.map((icon) => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => updatePlayer(idx, { icon })}
                          className={`cursor-pointer text-lg transition ${
                            (p.icon || '🤴') === icon ? 'scale-110 opacity-100' : 'opacity-40 hover:opacity-80'
                          }`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>

                    {/* Lucky Wish & AI Personality Controls */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openWishModal(idx)}
                        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#f1c40f] bg-[#f1c40f]/20 px-2.5 py-1 font-display text-xs font-semibold text-[#f1c40f] hover:bg-[#f1c40f]/30"
                      >
                        <span>{translate(lang, 'set_lucky_wish')}</span>
                        <span className="font-bold tabular-nums">
                          ({p.wish ? p.wish.join(', ') : '6, 5'})
                        </span>
                      </button>

                      {p.isAI && (
                        <select
                          value={p.personality}
                          onChange={(e) =>
                            updatePlayer(idx, {
                              personality: e.target.value as typeof p.personality,
                            })
                          }
                          className="rounded-md border border-white/20 bg-black/60 px-2 py-1 text-xs text-white outline-none focus:border-[#f1c40f]"
                        >
                          {AI_PERSONALITIES.map((ap) => (
                            <option key={ap.value} value={ap.value} className="bg-[#111]">
                              {ap.value}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* AI Checkbox Toggle (.setup-ai-toggle) */}
                  <label className={`setup-ai-toggle ${p.isAI ? 'active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={p.isAI}
                      onChange={(e) => updatePlayer(idx, { isAI: e.target.checked })}
                      className="h-5 w-5 cursor-pointer accent-[#f1c40f]"
                    />
                    <span>AI</span>
                  </label>
                </div>
              );
            })}
          </div>

          <div className="setup-footer-bar">
            <button
              id="start-game-btn"
              type="button"
              onClick={() => startLocalMatch(false)}
            >
              {translate(lang, 'start_match')}
            </button>

            <button
              id="back-to-menu-btn"
              type="button"
              onClick={() => setScreen('menu')}
            >
              {translate(lang, 'back_menu')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
