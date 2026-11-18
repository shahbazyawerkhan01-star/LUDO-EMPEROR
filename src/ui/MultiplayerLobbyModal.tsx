import React, { useState } from 'react';
import { stripSeatTag } from '../game/rules';
import { multiplayerClient } from '../network/multiplayerClient';
import { runSdk } from '../sdk/runSdk';
import { useGameStore } from '../state/store';

export const MultiplayerLobbyModal: React.FC = () => {
  const {
    roomCode,
    mySeat,
    hostSeatIndex,
    amHost,
    fillBots,
    onlineTimerConfig,
    onlineSeats,
    chatMessages,
    roomError,
    gameStarted,
    setActiveModal,
    showToast,
  } = useGameStore();

  const [playerName, setPlayerName] = useState(() => runSdk.getOnlineName() || 'Anees');
  const [joinCode, setJoinCode] = useState('');
  const [wish, setWish] = useState<[number, number]>(() => runSdk.getOnlineWish());
  const [pickingDie, setPickingDie] = useState<1 | 2 | null>(null);
  const [chatText, setChatText] = useState('');
  const [busy, setBusy] = useState(false);

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
    setBusy(true);
    await multiplayerClient.joinRoom(
      joinCode.trim().toUpperCase(),
      stripSeatTag(playerName) || 'Guest',
      wish,
    );
    setBusy(false);
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
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 4000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        padding: '16px',
      }}
    >
      <div
        className="royal-modal-card modal-scroll flex max-h-[92vh] w-full max-w-[500px] flex-col gap-3.5 overflow-y-auto"
        style={{ borderColor: roomCode ? '#2ecc71' : '#f1c40f' }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <h2 className="royal-modal-title text-xl" style={{ color: roomCode ? '#2ecc71' : '#f1c40f' }}>
            {roomCode ? `🌐 ONLINE ROOM: ${roomCode}` : '👥 ONLINE 5-WAY MULTIPLAYER'}
          </h2>
          <button
            type="button"
            onClick={() => setActiveModal(null)}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-white/10 font-bold text-white hover:bg-white/20"
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
            <div>
              <label className="mb-1 block font-display text-xs font-bold text-[#f1c40f] uppercase">
                YOUR DISPLAY NAME
              </label>
              <input
                type="text"
                maxLength={20}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                className="setup-input w-full"
                style={{ width: '100%' }}
              />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={handleHostCreate}
              className="w-full cursor-pointer rounded-2xl bg-[#f1c40f] py-3 font-display text-lg font-bold text-black shadow-lg hover:brightness-110 disabled:opacity-50"
            >
              👑 CREATE / HOST ROOM
            </button>

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

            {/* 5 Seats */}
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4].map((idx) => {
                const s = onlineSeats[idx];
                const isHostSeat = idx === hostSeatIndex;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: s?.color || '#64748b' }}
                      />
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

            {/* Live Room Chat */}
            <div className="space-y-2 rounded-2xl border border-white/15 bg-white/5 p-3">
              <div className="modal-scroll max-h-28 space-y-1 overflow-y-auto text-xs">
                {chatMessages.length === 0 ? (
                  <div className="text-white/50">No messages yet. Say hello!</div>
                ) : (
                  chatMessages.map((m) => (
                    <div key={m.id}>
                      <span className="font-bold text-[#2ecc71]">{stripSeatTag(m.sender)}: </span>
                      <span className="text-white/90">{m.text}</span>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendChat} className="flex gap-1.5">
                <input
                  type="text"
                  maxLength={100}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  placeholder="Type message..."
                  className="flex-1 rounded-xl border border-white/20 bg-black/70 px-3 py-2 text-xs text-white outline-none"
                />
                <button
                  type="submit"
                  className="cursor-pointer rounded-xl bg-[#27ae60] px-4 font-display text-xs font-bold text-white"
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
