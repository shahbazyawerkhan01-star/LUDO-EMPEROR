import React from 'react';
import { LANGUAGE_OPTIONS, translate } from '../i18n';
import { useGameStore } from '../state/store';

export const MainMenu: React.FC = () => {
  const { prefs, updatePrefs, setScreen, setActiveModal } = useGameStore();
  const lang = prefs.language;

  const isMuted = prefs.volume <= 0.01 && prefs.musicVolume <= 0.01;
  const toggleMute = () => {
    if (isMuted) {
      updatePrefs({ volume: 0.7, musicVolume: 0.45 });
    } else {
      updatePrefs({ volume: 0, musicVolume: 0 });
    }
  };

  return (
    <div id="player-setup-overlay">
      {/* Subtle Top-Right Language Switcher matching classic dark glass */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <span className="text-sm opacity-75">🌐</span>
        <select
          value={lang}
          onChange={(e) => updatePrefs({ language: e.target.value })}
          className="rounded-xl border border-white/25 bg-black/70 px-3 py-1.5 text-sm font-semibold text-white outline-none focus:border-[#f1c40f]"
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-[#111] text-white">
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div id="setup-content">
        <div id="main-menu-section">
          <h1 id="setup-title">{translate(lang, 'title')}</h1>
          <p className="setup-subtitle">{translate(lang, 'premium_exp')}</p>

          <div className="feature-badges">
            <div className="feature-badge">
              <span>🎲🎲</span> 2 DICE
            </div>
            <div className="feature-badge">
              <span>🖐️</span> 5 PLAYERS
            </div>
            <div className="feature-badge">
              <span>✨7</span> LUCKY 7
            </div>
          </div>

          <button
            type="button"
            className="main-menu-btn"
            onClick={() => setScreen('setup')}
            style={{
              background: 'linear-gradient(135deg, rgba(41, 128, 185, 0.2), rgba(41, 128, 185, 0.1))',
              borderColor: 'rgba(41, 128, 185, 0.5)',
            }}
          >
            <span className="btn-icon">👥</span>
            <div>
              <span>{translate(lang, 'pass_play')}</span>
              <span className="btn-subtitle">{translate(lang, 'pass_play_sub')}</span>
            </div>
          </button>

          <button
            type="button"
            className="main-menu-btn relative"
            onClick={() => setActiveModal('tournamentRules')}
            style={{
              background: 'linear-gradient(135deg, rgba(39, 174, 96, 0.14), rgba(39, 174, 96, 0.06))',
              borderColor: 'rgba(39, 174, 96, 0.35)',
            }}
          >
            <span className="btn-icon opacity-85">🏆</span>
            <div className="flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span>{translate(lang, 'tournament')}</span>
                <span className="rounded-md border border-[#f1c40f]/50 bg-[#f1c40f]/20 px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-[#f1c40f] uppercase">
                  Coming Soon
                </span>
              </div>
              <span className="btn-subtitle">{translate(lang, 'tournament_sub')}</span>
            </div>
          </button>

          <button
            type="button"
            className="main-menu-btn"
            onClick={() => setActiveModal('lobby')}
            style={{
              background: 'linear-gradient(135deg, rgba(241, 196, 15, 0.2), rgba(241, 196, 15, 0.1))',
              borderColor: 'rgba(241, 196, 15, 0.5)',
            }}
          >
            <span className="btn-icon">🌐</span>
            <div>
              <span>{translate(lang, 'invite_friends')}</span>
              <span className="btn-subtitle">{translate(lang, 'invite_friends_sub')}</span>
            </div>
          </button>

          <button
            type="button"
            className="main-menu-btn"
            onClick={() => setActiveModal('howto')}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02))',
            }}
          >
            <span className="btn-icon">📖</span>
            <div>
              <span>{translate(lang, 'how_to_play')}</span>
              <span className="btn-subtitle">{translate(lang, 'how_to_play_sub')}</span>
            </div>
          </button>

          <button
            type="button"
            className="main-menu-btn"
            onClick={() => setActiveModal('settings')}
            style={{
              background: 'linear-gradient(135deg, rgba(149, 165, 166, 0.2), rgba(149, 165, 166, 0.1))',
              borderColor: 'rgba(149, 165, 166, 0.5)',
            }}
          >
            <span className="btn-icon">⚙️</span>
            <div>
              <span>{translate(lang, 'settings')}</span>
              <span className="btn-subtitle">{translate(lang, 'settings_sub')}</span>
            </div>
          </button>
        </div>
      </div>

      {/* Bottom-right Quick Audio & Music Buttons matching original menu overlay */}
      <div id="music-controls-overlay">
        <button
          type="button"
          className="music-btn"
          title="Toggle Sound"
          onClick={toggleMute}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
        <button
          type="button"
          className="music-btn"
          title="Music Soundtrack"
          onClick={() => setActiveModal('music')}
        >
          🎵
        </button>
        <button
          type="button"
          className="music-btn"
          title="Game Settings"
          onClick={() => setActiveModal('settings')}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
};
