import React, { useState } from 'react';
import { stripSeatTag } from '../game/rules';
import { sfx } from '../game/sfx';
import { multiplayerClient } from '../network/multiplayerClient';
import { runSdk } from '../sdk/runSdk';
import { useGameStore } from '../state/store';

const QUICK_CHAT_PRESETS = [
  'Good move! 👏',
  'Play fast! ⏱️',
  'So lucky! 🍀',
  'Watch out! 🔥',
  'Oops! 😅',
  'Well played! 👍',
];

export const MultiplayerLobbyModal: React.FC = () => {
  const {
    roomCode,
    mySeat,
    hostSeatIndex,
    amHost,
    fillBots,
    secretWhispers,
    onlineTimerConfig,
    onlineSeats,
    chatMessages,
    pendingInviteCode,
    roomError,
    gameStarted,
    prefs,
    setActiveModal,
    openWhisperModal,
    toggleSeatMute,
    showToast,
  } = useGameStore();

  const [playerName, setPlayerName] = useState(
    () => runSdk.getOnlineName() || (pendingInviteCode ? '' : 'Anees'),
  );
  const [joinCode, setJoinCode] = useState(() => pendingInviteCode || '');
  const [roomEditName, setRoomEditName] = useState('');
  const [wish, setWish] = useState<[number, number]>(() => runSdk.getOnlineWish());
  const [pickingDie, setPickingDie] = useState<1 | 2 | null>(null);
  const [chatText, setChatText] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (pendingInviteCode && !roomCode) {
      setJoinCode(pendingInviteCode);
      if (!runSdk.getOnlineName().trim()) {
        setPlayerName('');
      }
    }
  }, [pendingInviteCode, roomCode]);

  const myCurrentSeatName =
    typeof mySeat === 'number' ? stripSeatTag(onlineSeats[mySeat]?.name || '') : '';

  React.useEffect(() => {
    if (roomCode && myCurrentSeatName) {
      setRoomEditName(myCurrentSeatName);
    }
  }, [roomCode, myCurrentSeatName]);

  const handleSelectWishNum = (num: number) => {
    let [w1, w2] = wish;
    if (pickingDie === 1) {
      w1 = num;
      if (w1 === 6 && w2 === 6) w2 = 5;
      setPickingDie(2);
    } else {
      w2 = num;
      if (w1 === 6 && w2 === 6) {
        w2 = 5;
        showToast('(6, 6) is not allowed as Lucky Wish — set to (6, 5).');
      }
      setPickingDie(null);
    }
    const next: [number, number] = [w1, w2];
    setWish(next);
    if (roomCode && !gameStarted) {
      multiplayerClient.updateWish(next);
    } else {
      runSdk.setOnlineWish(next);
    }
  };

  const handleHostCreate = async () => {
    setBusy(true);
    await multiplayerClient.createRoom(stripSeatTag(playerName) || 'Host', wish);
    setBusy(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) {
      showToast('Enter a room code first.');
      return;
    }
    const cleanName = stripSeatTag(playerName).trim();
    if (!cleanName) {
      showToast('Please write your guest name first.');
      return;
    }
    setBusy(true);
    await multiplayerClient.joinRoom(
      joinCode.trim().toUpperCase(),
      cleanName,
      wish,
    );
    setBusy(false);
  };

  const handleUpdateRoomName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = stripSeatTag(roomEditName).trim();
    if (!clean) {
      showToast('Enter a valid name.');
      return;
    }
    multiplayerClient.updateName(clean, (res) => {
      if (res?.success) {
        showToast(`Name updated to ${res.name}`);
      } else if (res?.error) {
        showToast(res.error);
      }
    });
  };

  const handleCopyInvite = () => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    showToast(`Invite link for ${roomCode} copied!`);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    multiplayerClient.sendChat(chatText.trim());
    setChatText('');
  };

  const mySeatObj = typeof mySeat === 'number' ? onlineSeats[mySeat] : null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && gameStarted) {
          setActiveModal(null);
        }
      }}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: gameStarted ? 'transparent' : 'rgba(0, 0, 0, 0.8)',
        backdropFilter: gameStarted ? 'none' : 'blur(8px)',
        padding: '16px',
      }}
    >
      <div
        className={`${gameStarted ? 'mirror-message-card' : 'royal-modal-card'} modal-scroll flex max-h-[92vh] w-full max-w-[500px] flex-col gap-3.5 overflow-y-auto`}
        style={{ borderColor: roomCode ? (gameStarted ? 'rgba(46, 204, 113, 0.85)' : '#2ecc71') : '#f1c40f' }}
      >
        <div className={`flex items-center justify-between border-b ${gameStarted ? 'border-white/35' : 'border-white/10'} pb-3`}>
          <h2 className="royal-modal-title text-xl" style={{ color: roomCode ? '#2ecc71' : '#f1c40f' }}>
            {roomCode ? `🌐 ONLINE ROOM: ${roomCode}` : '👥 ONLINE 5-WAY MULTIPLAYER'}
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className={`${gameStarted ? 'mirror-glass-btn' : 'border border-white/25 bg-white/10 hover:bg-white/20'} flex h-9 w-9 cursor-pointer items-center justify-center rounded-full font-bold text-white`}
          >
            ✕
          </button>
        </div>

        {roomError && (
          <div className="rounded-xl border border-[#e74c3c]/60 bg-[#e74c3c]/20 px-3 py-2 text-xs font-bold text-[#ffb3ad]">
            {roomError}
          </div>
        )}

        {/* Two-Box Pre-Match Lucky Wish Selector */}
        <div className="rounded-2xl border border-[#f1c40f]/45 bg-white/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-display text-xs font-bold text-[#f1c40f] uppercase">
                ✨ LUCKY WISH
              </div>
              <div className="text-[11px] text-white/65">
                {gameStarted ? 'Locked for this match' : 'Tap box to set one-time wish (6+6 blocked)'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {([1, 2] as const).map((dieNum) => {
                const val = dieNum === 1 ? wish[0] : wish[1];
                const active = pickingDie === dieNum;
                return (
                  <button
                    key={dieNum}
                    type="button"
                    disabled={gameStarted}
                    onClick={() => setPickingDie(active ? null : dieNum)}
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border-2 font-display text-lg font-bold tabular-nums"
                    style={{
                      background: active ? '#f1c40f' : 'rgba(0,0,0,0.8)',
                      color: active ? '#000' : '#f1c40f',
                      borderColor: active ? '#fff' : 'rgba(241,196,15,0.65)',
                    }}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {pickingDie !== null && !gameStarted && (
            <div className="mt-2.5 flex items-center justify-between gap-1.5 border-t border-white/10 pt-2.5">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleSelectWishNum(n)}
                  className="h-9 flex-1 cursor-pointer rounded-lg border border-[#f1c40f]/50 bg-white/10 font-display text-sm font-bold text-[#f1c40f] hover:bg-[#f1c40f] hover:text-black"
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        {!roomCode ? (
          <div className="space-y-3.5">
            {pendingInviteCode && (
              <div className="rounded-xl border border-[#2ecc71]/60 bg-[#27ae60]/20 px-3 py-2 text-xs font-bold text-[#d4ffe5]">
                🎟️ Invited to Room <span className="font-mono tracking-wider">{pendingInviteCode}</span> — write your guest name and tap JOIN ROOM!
              </div>
            )}

            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                {pendingInviteCode ? 'YOUR GUEST NAME' : 'YOUR DISPLAY NAME'}
              </label>
              <input
                type="text"
                maxLength={20}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                autoFocus={!!pendingInviteCode}
                className="setup-input w-full"
                style={{ width: '100%' }}
              />
            </div>

            {!pendingInviteCode && (
              <button
                type="button"
                disabled={busy}
                onClick={handleHostCreate}
                className="w-full cursor-pointer rounded-2xl bg-[#f1c40f] py-3 font-display text-lg font-bold text-black shadow-lg hover:brightness-110 disabled:opacity-50"
              >
                👑 CREATE / HOST ROOM
              </button>
            )}

            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CODE"
                className="w-36 rounded-xl border-2 border-[#2ecc71]/50 bg-black/80 px-3 py-2.5 text-center font-mono text-base font-bold tracking-widest text-[#2ecc71] uppercase outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleJoin}
                className="flex-1 cursor-pointer rounded-xl bg-[#27ae60] py-3 font-display text-base font-bold text-white hover:bg-[#2ecc71] disabled:opacity-50"
              >
                JOIN ROOM
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#2ecc71]/40 bg-white/5 px-3 py-2">
              <span className="font-mono text-base font-bold tracking-widest text-[#2ecc71]">
                CODE: {roomCode}
              </span>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="cursor-pointer rounded-lg border border-[#2ecc71]/60 bg-[#27ae60]/30 px-3 py-1 font-display text-xs font-bold text-white hover:bg-[#27ae60]/55"
              >
                📋 COPY LINK
              </button>
            </div>

            {!gameStarted && (
              <form
                onSubmit={handleUpdateRoomName}
                className="flex items-center gap-2 rounded-xl border border-[#f1c40f]/35 bg-white/5 px-3 py-2"
              >
                <span className="font-display text-[11px] font-bold text-[#f1c40f] uppercase shrink-0">
                  {amHost ? 'HOST NAME' : 'GUEST NAME'}
                </span>
                <input
                  type="text"
                  maxLength={20}
                  value={roomEditName}
                  onChange={(e) => setRoomEditName(e.target.value)}
                  placeholder="Enter your name..."
                  className="min-w-0 flex-1 rounded-lg border border-white/25 bg-black/70 px-2.5 py-1.5 text-xs font-semibold text-white outline-none focus:border-[#f1c40f]"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-lg bg-[#f1c40f] px-3 py-1.5 font-display text-[11px] font-bold text-black hover:brightness-110"
                >
                  SAVE
                </button>
              </form>
            )}

            {/* 5 Seats */}
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4].map((idx) => {
                const s = onlineSeats[idx];
                const isHostSeat = idx === hostSeatIndex;
                const isRemoteHuman = !s?.isAI && mySeat !== idx;
                const isSeatMuted = prefs.mutedSeats.includes(idx);
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                      gameStarted ? 'border-white/35 bg-black/22' : 'border-white/15 bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white/40 text-xs"
                        style={{ backgroundColor: s?.color || '#64748b' }}
                      >
                        {s?.icon || '🤴'}
                      </span>
                      <span className="font-display text-sm font-bold text-white">
                        {stripSeatTag(s?.name || `Player ${idx + 1}`)}
                      </span>
                      {isHostSeat && (
                        <span className="rounded bg-[#f1c40f]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#f1c40f]">
                          HOST
                        </span>
                      )}
                      {mySeat === idx && (
                        <span className="rounded bg-[#00d4ff]/25 px-1.5 py-0.5 text-[10px] font-bold text-[#00d4ff]">
                          YOU
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {isRemoteHuman && s?.connected && (
                        <button
                          type="button"
                          onClick={() => toggleSeatMute(idx)}
                          title={isSeatMuted ? 'Unmute this player' : 'Mute this player'}
                          className="cursor-pointer rounded-lg border border-white/25 bg-black/35 px-2 py-0.5 text-xs text-white hover:bg-white/20"
                          style={{ opacity: isSeatMuted ? 0.6 : 1 }}
                        >
                          {isSeatMuted ? '🔇' : '🔊'}
                        </button>
                      )}
                      <span
                        className="font-display font-bold"
                        style={{
                          color: s?.tempBotTakeover
                            ? '#f39c12'
                            : s?.isAI
                              ? '#c084fc'
                              : !s?.connected
                                ? '#e74c3c'
                                : s?.ready
                                  ? '#2ecc71'
                                  : '#f1c40f',
                        }}
                      >
                        {s?.tempBotTakeover
                          ? 'BOT COVER'
                          : s?.isAI
                            ? 'AI BOT'
                            : !s?.connected
                              ? 'OFFLINE'
                              : s?.ready
                                ? 'READY'
                                : 'WAITING'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Host Controls before start */}
            {!gameStarted && amHost && (
              <div className="space-y-2.5 rounded-2xl border border-white/15 bg-white/5 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-bold text-white">🤖 FILL EMPTY SEATS WITH BOTS</span>
                  <button
                    type="button"
                    onClick={() => multiplayerClient.toggleFillBots(!fillBots)}
                    className="cursor-pointer rounded-lg px-3 py-1 font-display text-xs font-bold"
                    style={{
                      background: fillBots ? '#2ecc71' : 'rgba(255,255,255,0.12)',
                      color: fillBots ? '#000' : '#fff',
                    }}
                  >
                    {fillBots ? 'ON' : 'OFF'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-bold text-white">🤫 WHISPER PRIVACY</span>
                  <button
                    type="button"
                    onClick={() => multiplayerClient.toggleSecretWhispers(!secretWhispers)}
                    className="cursor-pointer rounded-lg px-3 py-1 font-display text-xs font-bold"
                    style={{
                      background: secretWhispers ? '#9333ea' : 'rgba(255,255,255,0.12)',
                      color: '#fff',
                    }}
                    title="Hidden: Room cannot see whispers. Transparent: Room sees who whispered without audio."
                  >
                    {secretWhispers ? '🤫 Whispers: Hidden' : '🤫 Whispers: Transparent'}
                  </button>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-display font-bold text-white">⏱️ TURN TIMER</span>
                  <div className="flex gap-1">
                    {([60, 90, 120, 0] as const).map((sec) => {
                      const active =
                        (sec === 0 && !onlineTimerConfig.enabled) ||
                        (onlineTimerConfig.enabled && onlineTimerConfig.duration === sec);
                      return (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => multiplayerClient.updateTimer(sec)}
                          className="cursor-pointer rounded-lg px-2.5 py-1 font-display text-xs font-bold"
                          style={{
                            background: active ? '#f1c40f' : 'rgba(255,255,255,0.12)',
                            color: active ? '#000' : '#fff',
                          }}
                        >
                          {sec === 0 ? 'Off' : `${sec}s`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => multiplayerClient.startMatch()}
                  className="w-full cursor-pointer rounded-xl bg-[#27ae60] py-3 font-display text-base font-bold text-white shadow-lg hover:bg-[#2ecc71]"
                >
                  🚀 START MATCH
                </button>
              </div>
            )}

            {/* Guest Ready Toggle */}
            {!gameStarted && !amHost && (
              <button
                type="button"
                onClick={() => multiplayerClient.toggleReady()}
                className="w-full cursor-pointer rounded-xl py-3 font-display text-base font-bold"
                style={{
                  background: mySeatObj?.ready ? '#27ae60' : 'rgba(46,204,113,0.18)',
                  color: mySeatObj?.ready ? '#fff' : '#2ecc71',
                  border: '2px solid #2ecc71',
                }}
              >
                {mySeatObj?.ready ? '✓ READY (WAITING FOR HOST)' : 'MARK AS READY'}
              </button>
            )}

            {/* Read-Only Whisper Privacy Indicator for Non-Hosts (and In-Match View) */}
            {(gameStarted || !amHost) && (
              <div className="flex items-center justify-between rounded-xl border border-[#c084fc]/35 bg-[#581c87]/20 px-3 py-2 text-xs">
                <span className="font-display font-bold text-[#e9d5ff]">🤫 WHISPERS</span>
                <span className="font-semibold text-white/90">
                  {secretWhispers
                    ? '🕶️ Hidden Mode (Room cannot see whispers)'
                    : '👁️ Transparent Mode (Room sees who whispered)'}
                </span>
              </div>
            )}

            {/* Live Room Chat */}
            <div className={`space-y-2 rounded-2xl border p-3 ${gameStarted ? 'border-white/45 bg-black/20' : 'border-white/15 bg-white/5'}`}>
              <div className="flex items-center justify-between border-b border-white/15 pb-1.5">
                <span className="font-display text-xs font-bold text-[#f1c40f] uppercase">
                  💬 Room Chat
                </span>
                <button
                  type="button"
                  onClick={() => openWhisperModal()}
                  className="cursor-pointer rounded-lg border border-[#e9d5ff]/70 bg-[#7e22ce]/85 px-2.5 py-1 font-display text-[11px] font-bold text-white hover:bg-[#9333ea]"
                >
                  🤫 Whisper
                </button>
              </div>
              <div className="modal-scroll max-h-28 space-y-1 overflow-y-auto text-xs">
                {chatMessages.length === 0 ? (
                  <div className={gameStarted ? 'text-white/85' : 'text-white/50'}>No messages yet. Say hello!</div>
                ) : (
                  chatMessages.map((m) => {
                    const kind = m.kind || (m.audioData ? 'voice' : 'text');
                    if (kind === 'whisper_in' || kind === 'whisper_out') {
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-1.5 rounded-lg border border-[#c084fc]/45 bg-[#581c87]/35 px-2 py-1"
                        >
                          <span className="font-bold text-[#f3e8ff]">
                            {kind === 'whisper_in'
                              ? `🤫 ${stripSeatTag(m.sender)} → You`
                              : `🤫 You → ${(m.targetNames || []).join(', ')}`}
                          </span>
                          {m.audioData && (
                            <button
                              type="button"
                              onClick={() => useGameStore.getState().playVoiceNote(m.id)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#e9d5ff]/75 bg-[#7e22ce] px-2 py-0.5 text-[11px] font-bold text-white hover:bg-[#9333ea]"
                            >
                              ▶ {m.duration || 2}s
                            </button>
                          )}
                        </div>
                      );
                    }
                    if (kind === 'whisper_notice') {
                      return (
                        <div key={m.id} className="text-[11px] italic text-[#fde68a]">
                          {m.sender} {m.text}
                        </div>
                      );
                    }
                    return (
                      <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-[#2ecc71]">{stripSeatTag(m.sender)}: </span>
                        {m.audioData ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (m.audioData) {
                                useGameStore.getState().playVoiceNote(m.id);
                              }
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#2ecc71]/60 bg-[#27ae60]/30 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-[#27ae60]/55"
                          >
                            <span>▶ {m.duration || 2}s</span>
                          </button>
                        ) : (
                          <span className="text-white">{m.text}</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHAT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => multiplayerClient.sendChat(preset)}
                    className={`cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-bold text-white hover:border-[#f1c40f] ${
                      gameStarted ? 'mirror-glass-btn' : 'border-white/20 bg-white/10'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={100}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Type message..."
                  className={`${gameStarted ? 'mirror-glass-input' : 'border border-white/20 bg-black/70 text-white'} flex-1 rounded-xl px-3 py-2 text-xs outline-none`}
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-xl border border-white/55 bg-[#27ae60]/90 px-4 font-display text-xs font-bold text-white hover:bg-[#27ae60]"
                >
                  SEND
                </button>
              </form>
            </div>

            <button
              type="button"
              onClick={() => multiplayerClient.disconnectAndReset()}
              className="w-full cursor-pointer rounded-xl border border-[#e74c3c]/50 bg-[#e74c3c]/20 py-2.5 font-display text-xs font-bold text-[#ffb3ad]"
            >
              LEAVE ROOM
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
