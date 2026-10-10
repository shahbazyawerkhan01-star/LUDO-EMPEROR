import sys

def update_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Update room modal HTML
    old_modal = '''          <!-- Player Name Section (Always accessible so host and guests can write & update their name) -->
          <div id="room-name-container" style="background:rgba(255,255,255,0.08); border:1px solid rgba(46,204,113,0.3); border-radius:12px; padding:10px 12px; margin-bottom:12px;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#2ecc71; font-family:'Inter'; font-weight:700; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <span>👤 YOUR PLAYER NAME</span>
                <span id="room-profile-seat" style="font-size:11px; background:rgba(46,204,113,0.25); color:#2ecc71; border:1px solid #2ecc71; padding:2px 8px; border-radius:10px; font-weight:bold; display:none;">Seat 1</span>
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" id="room-name-input" maxlength="16" placeholder="Enter your name..." style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #555; background:rgba(0,0,0,0.6); color:white; font-size:14px; outline:none; font-family:'Fredoka'; box-sizing:border-box;">
                <button id="room-name-save-btn" type="button" style="background:#2ecc71; color:#063; font-weight:bold; border:none; border-radius:8px; padding:0 14px; font-size:13px; cursor:pointer; font-family:'Fredoka';">Save</button>
              </div>
          </div>

          <!-- Room Code & Share Invite Link Banner (Visible once room is created/joined) -->
          <div id="room-invite-banner" style="display:none; padding:10px 12px; background:rgba(46,204,113,0.15); border:1px solid #2ecc71; border-radius:10px; margin-bottom:12px; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:10px; color:#aaa; font-family:'Inter'; text-transform:uppercase;">Room Code</div>
              <strong id="room-banner-code" style="font-size:20px; color:#2ecc71; letter-spacing:2px; font-family:monospace;"></strong>
            </div>
            <button id="room-copy-link-btn" type="button" style="background:#2ecc71; color:#063; font-weight:bold; border:none; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:'Fredoka'; box-shadow:0 2px 8px rgba(46,204,113,0.3);">📋 Copy Invite Link</button>
          </div>

          <!-- Host Controls: Start Match with Connected Friends -->
          <div id="room-host-controls" style="display:none; margin-bottom:12px;">
            <button id="room-start-match-btn" type="button" style="width:100%; background:linear-gradient(135deg, #f39c12, #e67e22); color:white; font-family:'Fredoka'; font-weight:bold; font-size:16px; padding:12px; border:none; border-radius:10px; cursor:pointer; box-shadow:0 4px 15px rgba(243,156,18,0.45); letter-spacing:0.5px;">🚀 START MATCH WITH FRIENDS</button>
          </div>

          <!-- Guest Waiting Status Banner -->
          <div id="room-guest-waiting" style="display:none; padding:10px 12px; background:rgba(52,152,219,0.2); border:1px solid #3498db; border-radius:10px; margin-bottom:12px; text-align:center; color:#5dade2; font-size:13px; font-family:'Inter'; font-weight:600;">
            ⏳ Waiting for host to start the match...
          </div>'''

    new_modal = '''          <!-- Player / Guest Name Section (Host & Guests can write and save their name anytime) -->
          <div id="room-name-container" style="background:rgba(255,255,255,0.08); border:1px solid rgba(46,204,113,0.3); border-radius:12px; padding:10px 12px; margin-bottom:12px;">
              <div style="font-size:11px; text-transform:uppercase; letter-spacing:1px; color:#2ecc71; font-family:'Inter'; font-weight:700; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center;">
                <span>👤 WRITE YOUR GUEST / PLAYER NAME</span>
                <span id="room-profile-seat" style="font-size:11px; background:rgba(46,204,113,0.25); color:#2ecc71; border:1px solid #2ecc71; padding:2px 8px; border-radius:10px; font-weight:bold; display:none;">Seat 1</span>
              </div>
              <div style="display:flex; gap:8px;">
                <input type="text" id="room-name-input" maxlength="16" placeholder="Enter your guest or player name..." style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #555; background:rgba(0,0,0,0.6); color:white; font-size:14px; outline:none; font-family:'Fredoka'; box-sizing:border-box;">
                <button id="room-name-save-btn" type="button" style="background:#2ecc71; color:#063; font-weight:bold; border:none; border-radius:8px; padding:0 14px; font-size:13px; cursor:pointer; font-family:'Fredoka';">Save Name</button>
              </div>
          </div>

          <!-- Room Code & Share Invite Link Banner (Visible once room is created/joined) -->
          <div id="room-invite-banner" style="display:none; padding:10px 12px; background:rgba(46,204,113,0.15); border:1px solid #2ecc71; border-radius:10px; margin-bottom:12px; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:10px; color:#aaa; font-family:'Inter'; text-transform:uppercase;">Room Code</div>
              <strong id="room-banner-code" style="font-size:20px; color:#2ecc71; letter-spacing:2px; font-family:monospace;"></strong>
            </div>
            <button id="room-copy-link-btn" type="button" style="background:#2ecc71; color:#063; font-weight:bold; border:none; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; font-family:'Fredoka'; box-shadow:0 2px 8px rgba(46,204,113,0.3);">📋 Copy Invite Link</button>
          </div>

          <!-- 5-Player Lobby Seat Preview: Shows connected host and guests in real-time -->
          <div id="room-seats-preview" style="background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 12px; margin-bottom:12px; font-family:'Fredoka';"></div>

          <!-- Start Match Controls (Always visible in room window: start match or host & start) -->
          <div id="room-host-controls" style="margin-bottom:12px;">
            <button id="room-start-match-btn" type="button" style="width:100%; background:linear-gradient(135deg, #27ae60, #2ecc71); color:white; font-family:'Fredoka'; font-weight:bold; font-size:16px; padding:12px; border:none; border-radius:10px; cursor:pointer; box-shadow:0 4px 15px rgba(46,204,113,0.45); letter-spacing:0.5px;">🚀 START MATCH WITH FRIENDS</button>
          </div>

          <!-- Guest Waiting Status Banner -->
          <div id="room-guest-waiting" style="display:none; padding:10px 12px; background:rgba(52,152,219,0.2); border:1px solid #3498db; border-radius:10px; margin-bottom:12px; text-align:center; color:#5dade2; font-size:13px; font-family:'Inter'; font-weight:600;">
            ⏳ Waiting for host to start the match...
          </div>'''

    if old_modal in content:
        content = content.replace(old_modal, new_modal)
        print(f'{filename}: replaced room modal HTML')
    else:
        print(f'{filename}: old_modal not found!', file=sys.stderr)

    # 2. Update arePawnsSettled
    old_settled = '''        function arePawnsSettled() {
          for (let pIdx = 0; pIdx < 5; pIdx++) {
            for (let iIdx = 0; iIdx < 4; iIdx++) {
              const pawn = gameState.pawns[pIdx][iIdx];
              if (pawn.renderX === 0) continue;
              let target;
              if (pawn.pos === -1) target = getBasePawnPos(pIdx, iIdx);
              else {
                const path = getPawnPath(pIdx);
                const pData = path[Math.min(path.length - 1, Math.round(pawn.pos))];
                target = getSpaceCoords(pData.arm, pData.c, pData.r);
              }
              // Increased tolerance from 2.0 to 5.0 for more robust settling detection
              if (Math.hypot(target.x - pawn.renderX, target.y - pawn.renderY) > 5.0) {
                return false;
              }
            }
          }
          return true;
        }'''

    new_settled = '''        function arePawnsSettled() {
          for (let pIdx = 0; pIdx < 5; pIdx++) {
            for (let iIdx = 0; iIdx < 4; iIdx++) {
              const pawn = gameState.pawns[pIdx][iIdx];
              if (pawn.displayPos !== undefined && Math.abs(pawn.displayPos - pawn.pos) > 0.05) {
                return false;
              }
            }
          }
          return true;
        }'''

    if old_settled in content:
        content = content.replace(old_settled, new_settled)
        print(f'{filename}: replaced arePawnsSettled')
    else:
        print(f'{filename}: old_settled not found!', file=sys.stderr)

    # 3. Update guest move block to pass steps: stepsToUse
    old_guest_move = '''                  if (stepsToUse !== null) {
                  if (window.__roomSystem && window.__roomSystem.isConnected() && !window.__roomSystem.isHost()) {
                    window.__roomSystem.submitAction({ kind: 'move', player: gameState.currentPlayer, pawn: pIdx, dieIndex: usedIndex });
                    // Immediate local move execution so the pawn animates without delay
                    movePawn(gameState.currentPlayer, pIdx, stepsToUse);
                    gameState.movesAvailable.splice(usedIndex, 1);
                    gameState.selectedMoveIndex = null;
                    updateDiceHud();
                    if (!gameState.movesAvailable.length) {
                      gameState.pendingNextTurn = true;
                    } else if (!canAnyPawnMove(gameState.currentPlayer, gameState.movesAvailable)) {
                      rollHint.innerText = t('no_moves');
                      gameState.isWaitingToPass = true;
                      gameState.autoTurnTimer = 1.0;
                    }
                    return;
                  }'''

    new_guest_move = '''                  if (stepsToUse !== null) {
                  if (window.__roomSystem && window.__roomSystem.isConnected() && !window.__roomSystem.isHost()) {
                    window.__roomSystem.submitAction({ kind: 'move', player: gameState.currentPlayer, pawn: pIdx, steps: stepsToUse, dieIndex: usedIndex });
                    // Immediate local move execution so the pawn animates without delay
                    movePawn(gameState.currentPlayer, pIdx, stepsToUse);
                    gameState.movesAvailable.splice(usedIndex, 1);
                    gameState.selectedMoveIndex = null;
                    updateDiceHud();
                    if (!gameState.movesAvailable.length) {
                      gameState.pendingNextTurn = true;
                    } else if (!canAnyPawnMove(gameState.currentPlayer, gameState.movesAvailable)) {
                      rollHint.innerText = t('no_moves');
                      gameState.isWaitingToPass = true;
                      gameState.autoTurnTimer = 1.0;
                    }
                    return;
                  }'''

    if old_guest_move in content:
        content = content.replace(old_guest_move, new_guest_move)
        print(f'{filename}: replaced guest move block')
    else:
        print(f'{filename}: old_guest_move not found!', file=sys.stderr)

    # 4. Update handleDirectAction
    old_hda = '''        function handleDirectAction(sessionId, action) {
          if (!amHost || !action) return;
          const playerIdx = action.player;
          const owner = seatOwners[playerIdx];
          const validSeat = (owner === sessionId) || (Number.isInteger(playerIdx) && action.player === window.gameState.currentPlayer);
          if (!validSeat) return;

          if (action.kind === 'set_name' && action.name && Number.isInteger(action.player)) {
            if (window.gameConfig && window.gameConfig.players && window.gameConfig.players[action.player]) {
              window.gameConfig.players[action.player].name = action.name;
            }
            broadcastState();
            return;
          }

          if (action.player === window.gameState.currentPlayer) {
            if (action.kind === 'roll' && !window.gameState.hasRolled && !window.gameState.isRolling && !window.gameState.isSettling) {
              rollDice();
              broadcastDiceRoll(window.gameState.dice, action.player);
            } else if (action.kind === 'move' && window.gameState.hasRolled && Number.isInteger(action.pawn) && Number.isInteger(action.dieIndex)) {
              const steps = window.gameState.movesAvailable[action.dieIndex];
              if (steps !== undefined) {
                const possibleCaptures = (typeof getPossibleCaptures === 'function') ? getPossibleCaptures(action.player, window.gameState.movesAvailable) : [];
                const isMovePartOfCapture = possibleCaptures.some(c => c.pawnIdx === action.pawn && c.diceIndices[0] === action.dieIndex);
                const startPos = window.gameState.pawns[action.player][action.pawn].pos;

                if (movePawn(action.player, action.pawn, steps)) {
                  if (!isMovePartOfCapture && possibleCaptures.length > 0) {
                    const uniquePawnIndices = [...new Set(possibleCaptures.map(c => c.pawnIdx))];
                    uniquePawnIndices.forEach(pI => {
                      const p = window.gameState.pawns[action.player][pI];
                      if (p.status === 'on-path') { p.status = 'home'; p.pos = -1; p.displayPos = -1; }
                    });
                  } else if (isMovePartOfCapture && possibleCaptures.length > 0 && typeof applySplitSacrifice === 'function') {
                    applySplitSacrifice(action.player, action.pawn, startPos, possibleCaptures, action.dieIndex);
                  }

                  window.gameState.movesAvailable.splice(action.dieIndex, 1);
                  window.gameState.selectedMoveIndex = null;
                  updateDiceHud();
                  if (!window.gameState.movesAvailable.length) {
                    window.gameState.pendingNextTurn = true;
                  } else if (!canAnyPawnMove(action.player, window.gameState.movesAvailable)) {
                    window.gameState.isWaitingToPass = true;
                    window.gameState.autoTurnTimer = 1.2;
                  }
                  broadcastState();
                }
              }
            }
          }
        }'''

    new_hda = '''        function handleDirectAction(sessionId, action) {
          if (!amHost || !action) return;
          const playerIdx = action.player;
          const owner = seatOwners[playerIdx];
          const validSeat = (owner === sessionId) || (Number.isInteger(playerIdx) && action.player === window.gameState.currentPlayer);
          if (!validSeat) return;

          if (action.kind === 'set_name' && action.name && Number.isInteger(action.player)) {
            if (window.gameConfig && window.gameConfig.players && window.gameConfig.players[action.player]) {
              window.gameConfig.players[action.player].name = action.name;
            }
            broadcastState();
            updateRoomUI();
            return;
          }

          if (action.player === window.gameState.currentPlayer) {
            if (action.kind === 'roll') {
              if (!window.gameState.hasRolled || window.gameState.isRolling || window.gameState.isSettling) {
                window.gameState.isRolling = false;
                window.gameState.isSettling = false;
                window.gameState.hasRolled = false;
              }
              rollDice();
              broadcastDiceRoll(window.gameState.dice, action.player);
            } else if (action.kind === 'move' && Number.isInteger(action.pawn)) {
              if (window.gameState.isRolling || window.gameState.isSettling) {
                window.gameState.isRolling = false;
                window.gameState.isSettling = false;
                window.gameState.hasRolled = true;
              }
              if (!window.gameState.hasRolled) {
                window.gameState.hasRolled = true;
              }
              if (!window.gameState.movesAvailable || !window.gameState.movesAvailable.length) {
                if (window.gameState.dice && window.gameState.dice.length) {
                  window.gameState.movesAvailable = window.gameState.dice.slice();
                }
              }

              let steps = Number.isInteger(action.steps) ? action.steps : window.gameState.movesAvailable[action.dieIndex];
              let dieIdx = window.gameState.movesAvailable.indexOf(steps);
              if (dieIdx === -1 && Number.isInteger(action.dieIndex) && window.gameState.movesAvailable[action.dieIndex] !== undefined) {
                dieIdx = action.dieIndex;
                steps = window.gameState.movesAvailable[dieIdx];
              }

              // Fallback to any valid die for this pawn
              if (!canMovePawn(action.player, action.pawn, steps)) {
                const validIdx = window.gameState.movesAvailable.findIndex(s => canMovePawn(action.player, action.pawn, s));
                if (validIdx >= 0) {
                  dieIdx = validIdx;
                  steps = window.gameState.movesAvailable[dieIdx];
                }
              }

              if (steps !== undefined && dieIdx >= 0) {
                const possibleCaptures = (typeof getPossibleCaptures === 'function') ? getPossibleCaptures(action.player, window.gameState.movesAvailable) : [];
                const isMovePartOfCapture = possibleCaptures.some(c => c.pawnIdx === action.pawn && c.diceIndices[0] === dieIdx);
                const startPos = window.gameState.pawns[action.player][action.pawn].pos;

                if (movePawn(action.player, action.pawn, steps)) {
                  if (!isMovePartOfCapture && possibleCaptures.length > 0) {
                    const uniquePawnIndices = [...new Set(possibleCaptures.map(c => c.pawnIdx))];
                    uniquePawnIndices.forEach(pI => {
                      const p = window.gameState.pawns[action.player][pI];
                      if (p.status === 'on-path') { p.status = 'home'; p.pos = -1; p.displayPos = -1; }
                    });
                  } else if (isMovePartOfCapture && possibleCaptures.length > 0 && typeof applySplitSacrifice === 'function') {
                    applySplitSacrifice(action.player, action.pawn, startPos, possibleCaptures, dieIdx);
                  }

                  window.gameState.movesAvailable.splice(dieIdx, 1);
                  window.gameState.selectedMoveIndex = null;
                  updateDiceHud();
                  if (!window.gameState.movesAvailable.length) {
                    window.gameState.pendingNextTurn = true;
                  } else if (!canAnyPawnMove(action.player, window.gameState.movesAvailable)) {
                    window.gameState.isWaitingToPass = true;
                    window.gameState.autoTurnTimer = 1.2;
                  }
                  broadcastState();
                }
              }
            }
          }
        }'''

    if old_hda in content:
        content = content.replace(old_hda, new_hda)
        print(f'{filename}: replaced handleDirectAction')
    else:
        print(f'{filename}: old_hda not found!', file=sys.stderr)

    # 5. Update updateRoomUI
    old_urui = '''        function updateRoomUI() {
          const banner = document.getElementById('room-invite-banner');
          const bannerCode = document.getElementById('room-banner-code');
          const hostControls = document.getElementById('room-host-controls');
          const guestWaiting = document.getElementById('room-guest-waiting');
          const seatBadge = document.getElementById('room-profile-seat');
          const joinRow = document.getElementById('room-join-row');
          const nameInputEl = document.getElementById('room-name-input');
          const codeDisplay = document.getElementById('room-code-display');

          if (roomCode) {
            if (codeDisplay) codeDisplay.innerText = roomCode;
            if (banner) {
              banner.style.display = 'flex';
              if (bannerCode) bannerCode.innerText = roomCode;
            }
            if (joinRow) joinRow.style.display = 'none';
            if (seatBadge) {
              seatBadge.style.display = 'inline-block';
              seatBadge.innerText = amHost ? 'Host (Seat 1)' : `Guest (Seat ${mySlot + 1})`;
            }
            if (window.gameState && window.gameState.gameStarted) {
              if (hostControls) hostControls.style.display = 'none';
              if (guestWaiting) guestWaiting.style.display = 'none';
            } else {
              if (hostControls) hostControls.style.display = amHost ? 'block' : 'none';
              if (guestWaiting) guestWaiting.style.display = amHost ? 'none' : 'block';
            }
          } else {
            if (codeDisplay) codeDisplay.innerText = '—';
            if (banner) banner.style.display = 'none';
            if (hostControls) hostControls.style.display = 'none';
            if (guestWaiting) guestWaiting.style.display = 'none';
            if (seatBadge) seatBadge.style.display = 'none';
            if (joinRow) joinRow.style.display = 'flex';
          }

          if (nameInputEl && !nameInputEl.value.trim()) {
            nameInputEl.value = localPlayerName();
          }
        }'''

    new_urui = '''        function updateRoomUI() {
          const banner = document.getElementById('room-invite-banner');
          const bannerCode = document.getElementById('room-banner-code');
          const hostControls = document.getElementById('room-host-controls');
          const guestWaiting = document.getElementById('room-guest-waiting');
          const seatBadge = document.getElementById('room-profile-seat');
          const joinRow = document.getElementById('room-join-row');
          const nameInputEl = document.getElementById('room-name-input');
          const codeDisplay = document.getElementById('room-code-display');
          const startBtn = document.getElementById('room-start-match-btn');
          const seatsPreview = document.getElementById('room-seats-preview');

          if (nameInputEl && !nameInputEl.value.trim()) {
            nameInputEl.value = localPlayerName();
          }

          if (roomCode) {
            if (codeDisplay) codeDisplay.innerText = roomCode;
            if (banner) {
              banner.style.display = 'flex';
              if (bannerCode) bannerCode.innerText = roomCode;
            }
            if (joinRow) joinRow.style.display = 'none';
            if (seatBadge) {
              seatBadge.style.display = 'inline-block';
              seatBadge.innerText = amHost ? '👑 Host (Seat 1)' : `👤 Guest (Seat ${mySlot + 1})`;
            }
            if (hostControls) {
              hostControls.style.display = amHost ? 'block' : 'none';
              if (startBtn) {
                startBtn.innerText = '🚀 START MATCH WITH FRIENDS';
                startBtn.style.background = 'linear-gradient(135deg, #27ae60, #2ecc71)';
              }
            }
            if (guestWaiting) {
              guestWaiting.style.display = amHost ? 'none' : 'block';
              guestWaiting.innerText = `⏳ Connected as Guest (Seat ${mySlot + 1}) — waiting for host to start...`;
            }
          } else {
            if (codeDisplay) codeDisplay.innerText = '—';
            if (banner) banner.style.display = 'none';
            if (seatBadge) seatBadge.style.display = 'none';
            if (joinRow) joinRow.style.display = 'flex';
            if (guestWaiting) guestWaiting.style.display = 'none';
            if (hostControls) {
              hostControls.style.display = 'block';
              if (startBtn) {
                startBtn.innerText = '🚀 CREATE ROOM & START MATCH';
                startBtn.style.background = 'linear-gradient(135deg, #f39c12, #e67e22)';
              }
            }
          }

          if (seatsPreview) {
            const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#3498db', '#9b59b6'];
            let html = '<div style="font-weight:700; color:#2ecc71; margin-bottom:6px; font-size:11px; text-transform:uppercase; letter-spacing:1px;">🎮 5-PLAYER ROOM LOBBY:</div><div style="display:flex; flex-direction:column; gap:4px;">';
            for (let i = 0; i < 5; i++) {
              const owner = seatOwners[i];
              const p = window.gameConfig && window.gameConfig.players && window.gameConfig.players[i];
              const pName = (p && p.name) || (i === 0 ? 'Host' : `Player ${i+1}`);
              const isMe = (owner === localSessionId) || (i === 0 && amHost) || (i === mySlot && !amHost);
              let statusLabel = '';
              let badgeColor = '#555';
              if (i === 0) {
                statusLabel = amHost ? (isMe ? '👑 You (Host)' : '👑 Host') : '👑 Host';
                badgeColor = '#e74c3c';
              } else if (owner) {
                statusLabel = isMe ? '👤 You (Guest)' : '👤 Guest';
                badgeColor = '#2ecc71';
              } else {
                statusLabel = '🤖 AI';
                badgeColor = '#7f8c8d';
              }
              html += `<div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.06); padding:4px 8px; border-radius:6px; font-size:12px; border-left:3px solid ${colors[i]};">
                <span style="display:flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${colors[i]};"></span>
                  <strong>${pName}</strong>
                </span>
                <span style="font-size:10px; background:${badgeColor}; color:white; padding:2px 6px; border-radius:4px;">${statusLabel}</span>
              </div>`;
            }
            html += '</div>';
            seatsPreview.innerHTML = html;
          }
        }'''

    if old_urui in content:
        content = content.replace(old_urui, new_urui)
        print(f'{filename}: replaced updateRoomUI')
    else:
        print(f'{filename}: old_urui not found!', file=sys.stderr)

    # 6. Update roomStartMatchBtn handler
    old_smb = '''        const roomStartMatchBtn = document.getElementById('room-start-match-btn');
        if (roomStartMatchBtn) {
          roomStartMatchBtn.onclick = (e) => {
            e.stopPropagation();
            broadcastMatchStart();
            roomToast('🚀 Starting match with friends!');
            updateRoomUI();
          };
        }'''

    new_smb = '''        const roomStartMatchBtn = document.getElementById('room-start-match-btn');
        if (roomStartMatchBtn) {
          roomStartMatchBtn.onclick = async (e) => {
            e.stopPropagation();
            const nameInputEl = document.getElementById('room-name-input');
            if (nameInputEl && nameInputEl.value.trim()) {
              localStorage.setItem('ludo_online_name', nameInputEl.value.trim());
            }
            if (!hasEnteredName()) {
              roomToast('Please enter your player/guest name first!');
              if (nameInputEl) nameInputEl.focus();
              return;
            }
            if (!roomCode) {
              roomStartMatchBtn.disabled = true;
              showConnectingState('Creating room...');
              try {
                const shareUrl = await hostRoom();
                if (shareUrl) {
                  broadcastMatchStart();
                  roomToast('🚀 Match started with friends!');
                  if (roomPanel) roomPanel.style.display = 'none';
                }
              } finally {
                roomStartMatchBtn.disabled = false;
              }
              return;
            }
            if (amHost) {
              broadcastMatchStart();
              roomToast('🚀 Starting match with friends!');
              if (roomPanel) roomPanel.style.display = 'none';
              updateRoomUI();
            } else {
              roomToast('Waiting for the host to start match...');
            }
          };
        }'''

    if old_smb in content:
        content = content.replace(old_smb, new_smb)
        print(f'{filename}: replaced roomStartMatchBtn handler')
    else:
        print(f'{filename}: old_smb not found!', file=sys.stderr)

    # 7. Update btnOnlinePlay to call updateRoomUI
    old_bop = '''          btnOnlinePlay.onclick = async () => {
              if (!window.__roomSystem) {
                  showToast("Room service still loading, try again in a moment.");
                  return;
              }
              if (window.__roomSystem.isConnected()) {
                  document.getElementById('room-chat-panel').style.display = 'block';
                  return;
              }
              // Show the panel with BOTH options — "HOST" a new room, or "JOIN" a
              // friend's existing room by typing their code — rather than assuming
              // this person wants to host. Whichever they pick wires up from there.
              const nameInputEl = document.getElementById('room-name-input');
              if (nameInputEl && !nameInputEl.value.trim()) {
                const human = window.gameConfig.players.find(p => !p.isAI);
                nameInputEl.value = (human && human.name && human.name !== 'Anees') ? human.name : '';
              }
              document.getElementById('room-join-row').style.display = 'flex';
              document.getElementById('room-chat-panel').style.display = 'block';
              btnOnlineIngame.classList.add('online-mode');
              document.getElementById('voice-status').classList.add('active');
          };'''

    new_bop = '''          btnOnlinePlay.onclick = async () => {
              if (!window.__roomSystem) {
                  showToast("Room service still loading, try again in a moment.");
                  return;
              }
              const nameInputEl = document.getElementById('room-name-input');
              if (nameInputEl && !nameInputEl.value.trim()) {
                const stored = localStorage.getItem('ludo_online_name');
                if (stored) {
                  nameInputEl.value = stored;
                } else {
                  const human = window.gameConfig.players.find(p => !p.isAI);
                  nameInputEl.value = (human && human.name && human.name !== 'Anees') ? human.name : '';
                }
              }
              document.getElementById('room-chat-panel').style.display = 'block';
              if (window.__roomSystem && window.__roomSystem.updateRoomUI) {
                window.__roomSystem.updateRoomUI();
              }
              btnOnlineIngame.classList.add('online-mode');
              document.getElementById('voice-status').classList.add('active');
          };'''

    if old_bop in content:
        content = content.replace(old_bop, new_bop)
        print(f'{filename}: replaced btnOnlinePlay.onclick')
    else:
        print(f'{filename}: old_bop not found!', file=sys.stderr)

    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'{filename}: successfully updated!')

update_file('index.html')
update_file('mobile.html')
