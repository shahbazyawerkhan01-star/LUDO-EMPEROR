// Core Client Application for NexusPlay Multiplayer Friends System
(function () {
  // State
  let socket = null;
  let currentUser = null;
  let friends = [];
  let pendingRequests = { incoming: [], outgoing: [] };
  let allOnlinePlayers = [];
  let currentParty = null;
  let activeDmFriend = null;
  let dmMessages = [];
  let typingTimer = null;
  let activeTab = 'all'; // 'all', 'online', 'party', 'pending', 'explore'
  let gameManager = null;

  // Predefined avatars
  const AVATARS = [
    { emoji: '⚡', name: 'Thunder', bg: 'from-amber-400 to-orange-600', frame: 'gold' },
    { emoji: '🚀', name: 'Astronaut', bg: 'from-cyan-500 to-blue-600', frame: 'cyan' },
    { emoji: '🥷', name: 'Ninja', bg: 'from-purple-600 to-indigo-900', frame: 'purple' },
    { emoji: '🦊', name: 'Cyber Fox', bg: 'from-pink-500 to-rose-700', frame: 'pink' },
    { emoji: '👾', name: 'Pixel Hero', bg: 'from-emerald-500 to-teal-800', frame: 'emerald' },
    { emoji: '🐉', name: 'Dragon', bg: 'from-red-600 to-amber-700', frame: 'gold' },
    { emoji: '🤖', name: 'Mecha', bg: 'from-slate-600 to-zinc-800', frame: 'silver' },
    { emoji: '🔮', name: 'Mage', bg: 'from-violet-600 to-fuchsia-800', frame: 'purple' }
  ];

  // Helper: Profile Storage & Multi-Profile Switcher
  function getStoredProfile() {
    const saved = localStorage.getItem('nexus_active_profile');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    const randNum = Math.floor(1000 + Math.random() * 9000);
    const initial = {
      id: 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 4),
      username: 'CyberStriker',
      tag: `Striker#${randNum}`,
      avatar: '⚡',
      avatarBg: 'from-cyan-500 to-blue-600',
      avatarFrame: 'cyan'
    };
    localStorage.setItem('nexus_active_profile', JSON.stringify(initial));
    return initial;
  }

  function saveProfile(user) {
    localStorage.setItem('nexus_active_profile', JSON.stringify(user));
  }

  // Multi-session switch profile (allows testing 2-3 players on one machine or tabs)
  window.switchProfile = function(profileNumber) {
    let p;
    if (profileNumber === 1) {
      p = { id: 'usr_p1_alex', username: 'Alex_Vortex', tag: 'Alex#1001', avatar: '⚡', avatarBg: 'from-cyan-500 to-blue-600', avatarFrame: 'cyan' };
    } else if (profileNumber === 2) {
      p = { id: 'usr_p2_maya', username: 'Maya_Valkyrie', tag: 'Maya#2002', avatar: '🦊', avatarBg: 'from-pink-500 to-rose-700', avatarFrame: 'pink' };
    } else if (profileNumber === 3) {
      p = { id: 'usr_p3_jaxon', username: 'Jax_Shadow', tag: 'Jax#3003', avatar: '🥷', avatarBg: 'from-purple-600 to-indigo-900', avatarFrame: 'purple' };
    } else {
      const rand = Math.floor(1000 + Math.random() * 9000);
      p = { id: 'usr_' + Date.now().toString(36), username: 'Player_' + rand, tag: `Player#${rand}`, avatar: '🚀', avatarBg: 'from-emerald-500 to-teal-800', avatarFrame: 'emerald' };
    }
    saveProfile(p);
    window.location.reload();
  };

  // Toast Notification
  function showToast(title, message, type = 'info') {
    window.sounds?.play(type === 'error' ? 'hit' : (type === 'success' ? 'score' : 'message'));
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    const borderColor = type === 'success' ? 'border-emerald-500' : (type === 'error' ? 'border-rose-500' : 'border-cyan-500');
    toast.className = `p-4 rounded-xl bg-slate-900/95 text-white shadow-2xl border-l-4 ${borderColor} backdrop-blur-md flex items-start justify-between gap-3 transform transition-all duration-300 translate-y-2 opacity-0 max-w-sm`;

    toast.innerHTML = `
      <div class="flex-1">
        <h4 class="font-bold text-sm tracking-wide text-slate-100">${escapeHtml(title)}</h4>
        <p class="text-xs text-slate-400 mt-0.5 leading-relaxed">${escapeHtml(message)}</p>
      </div>
      <button class="text-slate-500 hover:text-slate-200 text-lg leading-none" onclick="this.parentElement.remove()">&times;</button>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-x-full');
      setTimeout(() => toast.remove(), 350);
    }, 4500);
  }

  // Interactive Party Invite Notification Modal/Banner
  function showPartyInviteBanner(invite) {
    window.sounds?.play('invite');
    const banner = document.getElementById('invite-banner');
    if (!banner) return;

    banner.innerHTML = `
      <div class="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/95 via-purple-950/95 to-slate-900/95 border border-purple-500/40 shadow-2xl shadow-purple-950/80 backdrop-blur-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${invite.inviter.avatarBg} flex items-center justify-center text-2xl shadow-lg ring-2 ring-purple-400/50">
            ${invite.inviter.avatar}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="font-bold text-white">${escapeHtml(invite.inviter.username)}</span>
              <span class="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">Party Invite</span>
            </div>
            <p class="text-xs text-slate-300 mt-0.5">Invited you to play <span class="text-cyan-400 font-semibold">${escapeHtml(invite.gameName)}</span> in "${escapeHtml(invite.partyName)}"</p>
          </div>
        </div>
        <div class="flex items-center gap-2 w-full md:w-auto justify-end">
          <button id="btn-decline-invite" class="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">Decline</button>
          <button id="btn-accept-invite" class="px-5 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition">Join Party 🚀</button>
        </div>
      </div>
    `;

    banner.classList.remove('hidden');

    document.getElementById('btn-accept-invite').onclick = () => {
      banner.classList.add('hidden');
      socket.emit('party:join', { partyId: invite.partyId }, (res) => {
        if (res.success) {
          showToast('Party Joined', `You entered ${invite.partyName}!`, 'success');
        } else {
          showToast('Cannot Join Party', res.message, 'error');
        }
      });
    };

    document.getElementById('btn-decline-invite').onclick = () => {
      banner.classList.add('hidden');
    };

    // Auto dismiss after 20s
    setTimeout(() => {
      banner.classList.add('hidden');
    }, 20000);
  }

  // Initialize Socket.io and App
  function initApp() {
    currentUser = getStoredProfile();

    // Setup Socket.io
    socket = io({ transports: ['websocket', 'polling'] });
    gameManager = new GameManager(socket);
    gameManager.setUserId(currentUser.id);
    gameManager.setupCanvas(document.getElementById('game-canvas'));

    // Socket Connection
    socket.on('connect', () => {
      console.log('Connected to NexusPlay server:', socket.id);
      document.getElementById('connection-status').innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span class="text-xs text-emerald-400 font-semibold">Online & Synced</span>
      `;

      // Init user session
      socket.emit('user:init', currentUser, (response) => {
        if (response.success) {
          currentUser = response.user;
          friends = response.friends;
          pendingRequests = response.requests;
          allOnlinePlayers = response.allOnlinePlayers || [];
          renderMyProfile();
          renderFriendsList();
          renderPendingBadges();
          renderExplorePlayers();
        }
      });
    });

    socket.on('disconnect', () => {
      document.getElementById('connection-status').innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
        <span class="text-xs text-rose-400 font-semibold">Reconnecting...</span>
      `;
    });

    // Event: Full friends list updated
    socket.on('friend:list_updated', (updatedFriends) => {
      friends = updatedFriends;
      renderFriendsList();
    });

    // Event: Pending requests updated
    socket.on('friend:requests_updated', (updatedRequests) => {
      pendingRequests = updatedRequests;
      renderPendingBadges();
      if (activeTab === 'pending') renderFriendsList();
    });

    // Event: Friend Presence Changed
    socket.on('friend:presence_updated', (friendProfile) => {
      const idx = friends.findIndex(f => f.id === friendProfile.id);
      if (idx !== -1) {
        friends[idx] = friendProfile;
        renderFriendsList();
      }
    });

    // Event: Directory presence update
    socket.on('directory:presence_updated', (playerProfile) => {
      const idx = allOnlinePlayers.findIndex(p => p.id === playerProfile.id);
      if (idx !== -1) {
        allOnlinePlayers[idx] = playerProfile;
      } else if (playerProfile.id !== currentUser.id && playerProfile.status !== 'offline') {
        allOnlinePlayers.push(playerProfile);
      }
      renderExplorePlayers();
    });

    // Event: Friend request received
    socket.on('friend:request_received', (data) => {
      window.sounds?.play('request');
      showToast('New Friend Request!', data.message, 'info');
      // Request updated list
      renderPendingBadges();
    });

    // Event: General notification
    socket.on('notification', (data) => {
      showToast(data.title, data.message, data.type || 'info');
    });

    // Event: Direct message received
    socket.on('dm:new_message', (data) => {
      const { message, sender } = data;
      // If DM drawer open with this friend, append message
      if (activeDmFriend && (activeDmFriend.id === message.fromUserId || activeDmFriend.id === message.toUserId)) {
        dmMessages.push(message);
        renderDmMessages();
        scrollDmToBottom();
      } else if (message.fromUserId !== currentUser.id) {
        window.sounds?.play('message');
        showToast(`Message from ${sender.username}`, message.text || 'Sent an attachment', 'info');
      }
    });

    // Event: DM typing indicator
    socket.on('dm:typing', (data) => {
      if (activeDmFriend && activeDmFriend.id === data.fromUserId) {
        const typingEl = document.getElementById('dm-typing-status');
        if (typingEl) {
          typingEl.classList.toggle('hidden', !data.isTyping);
        }
      }
    });

    // Event: Party invited
    socket.on('party:invitation_received', (invite) => {
      showPartyInviteBanner(invite);
    });

    // Event: Party updated
    socket.on('party:updated', (party) => {
      currentParty = party;
      renderPartyUI();
    });

    // Event: Party member joined / left
    socket.on('party:member_joined', (data) => {
      showToast('Squad Member Joined', `${data.user.username} entered the party!`, 'info');
    });
    socket.on('party:member_left', (data) => {
      showToast('Squad Member Left', `${data.user.username} left the party.`, 'info');
    });

    // Event: Party chat
    socket.on('party:new_chat', (chatMsg) => {
      if (currentParty) {
        renderPartyChatMessage(chatMsg);
      }
    });

    // Game Events
    socket.on('game:start', (gameInfo) => {
      showToast('Game Started!', `${gameInfo.title} is now LIVE! 🎮`, 'success');
      window.sounds?.play('score');
      document.getElementById('game-modal').classList.remove('hidden');
      document.getElementById('game-title').innerText = gameInfo.title;

      if (gameInfo.gameId === 'pong') {
        document.getElementById('game-canvas').classList.remove('hidden');
        document.getElementById('trivia-container').classList.add('hidden');
        gameManager.startPong(gameInfo);
      } else if (gameInfo.gameId === 'arena') {
        document.getElementById('game-canvas').classList.remove('hidden');
        document.getElementById('trivia-container').classList.add('hidden');
        gameManager.startArena(gameInfo);
      }
    });

    socket.on('game:state', (state) => {
      if (gameManager.currentGame === 'pong') {
        gameManager.renderPongState(state);
      }
    });

    socket.on('game:arena_state', (state) => {
      if (gameManager.currentGame === 'arena') {
        gameManager.renderArenaState(state);
      }
    });

    socket.on('game:sound', (data) => {
      window.sounds?.play(data.sound);
    });

    socket.on('game:over', (data) => {
      showToast('Game Over!', `Winner: ${data.winner?.username || 'Player'} 🏆`, 'success');
    });

    // Trivia Specific Events
    socket.on('game:trivia_question', (qData) => {
      document.getElementById('game-modal').classList.remove('hidden');
      document.getElementById('game-canvas').classList.add('hidden');
      document.getElementById('trivia-container').classList.remove('hidden');
      renderTriviaQuestion(qData);
    });

    socket.on('game:trivia_tick', (data) => {
      const timerEl = document.getElementById('trivia-timer');
      if (timerEl) timerEl.innerText = `${data.timer}s`;
    });

    socket.on('game:trivia_round_result', (res) => {
      highlightTriviaAnswers(res);
    });

    socket.on('game:trivia_over', (res) => {
      showToast('Trivia Duel Complete!', `Winner: ${res.winner?.username || 'Champion'} 🏆`, 'success');
    });

    setupUIListeners();
  }

  // UI Setup & Listeners
  function setupUIListeners() {
    // Tab switching
    document.querySelectorAll('.friends-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.friends-tab-btn').forEach(b => {
          b.classList.remove('active', 'text-cyan-400', 'border-cyan-400');
          b.classList.add('text-slate-400', 'border-transparent');
        });
        btn.classList.add('active', 'text-cyan-400', 'border-cyan-400');
        btn.classList.remove('text-slate-400', 'border-transparent');
        activeTab = btn.getAttribute('data-tab');
        renderFriendsList();
      });
    });

    // Status selector dropdown
    const statusSelect = document.getElementById('user-status-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        const newStatus = e.target.value;
        currentUser.status = newStatus;
        socket.emit('user:update_profile', { status: newStatus });
        renderMyProfile();
      });
    }

    // Status message editing
    const statusMsgInput = document.getElementById('custom-status-input');
    if (statusMsgInput) {
      statusMsgInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = statusMsgInput.value.trim();
          currentUser.customStatus = val;
          socket.emit('user:update_profile', { customStatus: val });
          statusMsgInput.blur();
          showToast('Status Updated', 'Your custom status was broadcast to friends!', 'info');
        }
      });
    }

    // Add Friend Modal buttons
    document.getElementById('btn-open-add-friend').onclick = () => {
      document.getElementById('modal-add-friend').classList.remove('hidden');
      document.getElementById('my-share-tag').innerText = currentUser.tag;
    };
    document.getElementById('btn-close-add-friend').onclick = () => {
      document.getElementById('modal-add-friend').classList.add('hidden');
    };
    document.getElementById('btn-submit-friend-request').onclick = submitFriendRequest;
    document.getElementById('input-friend-tag').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitFriendRequest();
    });

    // Copy Tag
    document.getElementById('btn-copy-tag').onclick = () => {
      navigator.clipboard?.writeText(currentUser.tag);
      showToast('Copied to Clipboard!', `Gamer Tag: ${currentUser.tag}`, 'success');
    };

    // Edit Profile Modal
    document.getElementById('btn-open-profile-modal').onclick = openProfileModal;
    document.getElementById('btn-close-profile-modal').onclick = () => {
      document.getElementById('modal-profile').classList.add('hidden');
    };

    // Create Party Button
    document.getElementById('btn-create-party').onclick = () => {
      socket.emit('party:create', { name: `${currentUser.username}'s Squad`, gameId: 'pong' }, (res) => {
        if (res.success) {
          showToast('Squad Formed', 'Party created! Invite your friends to play.', 'success');
        }
      });
    };

    // Leave Party Button
    document.getElementById('btn-leave-party').onclick = () => {
      socket.emit('party:leave', () => {
        currentParty = null;
        renderPartyUI();
        showToast('Left Party', 'You left the squad.', 'info');
      });
    };

    // Ready Toggle in Party
    document.getElementById('btn-toggle-ready').onclick = () => {
      socket.emit('party:toggle_ready');
    };

    // Start Game in Party
    document.getElementById('btn-start-party-game').onclick = () => {
      socket.emit('party:start_game');
    };

    // Party Game Selector
    document.getElementById('party-game-selector').addEventListener('change', (e) => {
      socket.emit('party:change_game', { gameId: e.target.value });
    });

    // Party Chat Send
    const partyChatInput = document.getElementById('party-chat-input');
    document.getElementById('btn-send-party-chat').onclick = () => {
      if (!partyChatInput.value.trim()) return;
      socket.emit('party:send_chat', { text: partyChatInput.value.trim() });
      partyChatInput.value = '';
    };
    partyChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btn-send-party-chat').click();
      }
    });

    // Close DM Drawer
    document.getElementById('btn-close-dm').onclick = () => {
      document.getElementById('dm-drawer').classList.add('hidden');
      activeDmFriend = null;
    };

    // Send DM
    const dmInput = document.getElementById('dm-message-input');
    document.getElementById('btn-send-dm').onclick = sendDmMessage;
    dmInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendDmMessage();
      } else {
        // Typing indicator
        if (activeDmFriend) {
          socket.emit('dm:typing', { toUserId: activeDmFriend.id, isTyping: true });
          clearTimeout(typingTimer);
          typingTimer = setTimeout(() => {
            socket.emit('dm:typing', { toUserId: activeDmFriend.id, isTyping: false });
          }, 1500);
        }
      }
    });

    // Challenge buttons inside DM drawer
    document.getElementById('btn-challenge-pong').onclick = () => {
      sendGameChallenge('pong');
    };
    document.getElementById('btn-challenge-arena').onclick = () => {
      sendGameChallenge('arena');
    };
    document.getElementById('btn-challenge-trivia').onclick = () => {
      sendGameChallenge('trivia');
    };

    // Close Game Modal
    document.getElementById('btn-close-game').onclick = () => {
      document.getElementById('game-modal').classList.add('hidden');
      gameManager.stop();
    };

    // Mute Audio Toggle
    document.getElementById('btn-mute-toggle').onclick = () => {
      const isMuted = window.sounds?.toggleMute();
      document.getElementById('mute-icon').innerText = isMuted ? '🔇' : '🔊';
      showToast(isMuted ? 'Sound Muted' : 'Sound Enabled', '', 'info');
    };
  }

  function submitFriendRequest() {
    const input = document.getElementById('input-friend-tag');
    const tag = input.value.trim();
    if (!tag) return;

    socket.emit('friend:send_request', { targetTagOrId: tag }, (res) => {
      if (res.success) {
        showToast('Friend Request', res.message, 'success');
        input.value = '';
        document.getElementById('modal-add-friend').classList.add('hidden');
      } else {
        showToast('Could Not Add Friend', res.message, 'error');
      }
    });
  }

  // Profile Modal Flow
  function openProfileModal() {
    const modal = document.getElementById('modal-profile');
    modal.classList.remove('hidden');

    document.getElementById('profile-edit-username').value = currentUser.username;
    document.getElementById('profile-edit-status').value = currentUser.customStatus || '';

    // Render avatar choices
    const grid = document.getElementById('avatar-choice-grid');
    grid.innerHTML = '';
    AVATARS.forEach(av => {
      const isSel = currentUser.avatar === av.emoji;
      const el = document.createElement('button');
      el.className = `p-3 rounded-xl bg-slate-800 flex flex-col items-center justify-center gap-1 border-2 transition ${isSel ? 'border-cyan-400 bg-slate-700 ring-2 ring-cyan-500/50' : 'border-slate-700 hover:border-slate-500'}`;
      el.innerHTML = `
        <span class="text-3xl">${av.emoji}</span>
        <span class="text-[10px] text-slate-300 font-semibold">${av.name}</span>
      `;
      el.onclick = () => {
        currentUser.avatar = av.emoji;
        currentUser.avatarBg = av.bg;
        currentUser.avatarFrame = av.frame;
        openProfileModal(); // re-render selection border
      };
      grid.appendChild(el);
    });

    document.getElementById('btn-save-profile').onclick = () => {
      const newName = document.getElementById('profile-edit-username').value.trim() || 'Player';
      const newBio = document.getElementById('profile-edit-status').value.trim();
      currentUser.username = newName;
      currentUser.customStatus = newBio;
      saveProfile(currentUser);
      socket.emit('user:update_profile', {
        username: newName,
        avatar: currentUser.avatar,
        avatarBg: currentUser.avatarBg,
        avatarFrame: currentUser.avatarFrame,
        customStatus: newBio
      });
      renderMyProfile();
      modal.classList.add('hidden');
      showToast('Profile Saved', 'Your gamer profile has been updated!', 'success');
    };
  }

  // Render My Profile Top Left Bar
  function renderMyProfile() {
    if (!currentUser) return;
    document.getElementById('my-avatar').innerText = currentUser.avatar;
    document.getElementById('my-avatar-container').className = `w-12 h-12 rounded-2xl bg-gradient-to-br ${currentUser.avatarBg} flex items-center justify-center text-2xl shadow-lg ring-2 ring-cyan-500/40 cursor-pointer hover:scale-105 transition`;
    document.getElementById('my-username').innerText = currentUser.username;
    document.getElementById('my-tag').innerText = currentUser.tag;

    // Status dot color
    const dot = document.getElementById('my-status-dot');
    dot.className = `w-3 h-3 rounded-full border-2 border-slate-900 ${getStatusBg(currentUser.status)}`;

    // Custom status
    const statusInput = document.getElementById('custom-status-input');
    if (statusInput) statusInput.value = currentUser.customStatus || '';

    // Active Profile Switcher Badges
    document.querySelectorAll('.profile-switch-btn').forEach(btn => {
      const pNum = parseInt(btn.getAttribute('data-profile'));
      const active = (pNum === 1 && currentUser.tag.includes('1001')) ||
                     (pNum === 2 && currentUser.tag.includes('2002')) ||
                     (pNum === 3 && currentUser.tag.includes('3003'));
      btn.classList.toggle('ring-2', active);
      btn.classList.toggle('ring-cyan-400', active);
    });
  }

  // Render Pending Badges
  function renderPendingBadges() {
    const totalPending = pendingRequests.incoming.length;
    const badge = document.getElementById('pending-badge');
    if (badge) {
      if (totalPending > 0) {
        badge.innerText = totalPending;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  // Render Friends List based on Active Tab
  function renderFriendsList() {
    const listEl = document.getElementById('friends-list-container');
    const emptyEl = document.getElementById('friends-empty-state');
    if (!listEl) return;

    listEl.innerHTML = '';

    // Filter list
    let displayList = [];
    if (activeTab === 'all') {
      displayList = friends;
    } else if (activeTab === 'online') {
      displayList = friends.filter(f => f.status !== 'offline');
    } else if (activeTab === 'party') {
      if (currentParty) {
        displayList = currentParty.members.map(m => m.user).filter(u => u && u.id !== currentUser.id);
      } else {
        displayList = [];
      }
    } else if (activeTab === 'pending') {
      renderPendingTab(listEl);
      return;
    } else if (activeTab === 'explore') {
      renderExplorePlayers(listEl);
      return;
    }

    if (displayList.length === 0) {
      emptyEl.classList.remove('hidden');
      listEl.classList.add('hidden');
      return;
    }

    emptyEl.classList.add('hidden');
    listEl.classList.remove('hidden');

    displayList.forEach(friend => {
      const card = createFriendCard(friend);
      listEl.appendChild(card);
    });
  }

  function createFriendCard(friend) {
    const el = document.createElement('div');
    el.className = 'group p-3.5 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-cyan-500/40 transition duration-200 shadow-md hover:shadow-cyan-500/5 flex items-center justify-between gap-3';

    // Rich presence display
    let activityHtml = '';
    if (friend.gameActivity) {
      activityHtml = `
        <div class="mt-1 flex items-center gap-1.5 text-[11px] text-cyan-300 font-medium">
          <span class="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
          <span>Playing <strong>${escapeHtml(friend.gameActivity.gameName)}</strong></span>
          <span class="text-slate-500">•</span>
          <span class="text-slate-400">${escapeHtml(friend.gameActivity.details || '')}</span>
        </div>
      `;
    } else if (friend.customStatus) {
      activityHtml = `
        <p class="mt-0.5 text-[11px] text-slate-400 italic truncate max-w-xs">"${escapeHtml(friend.customStatus)}"</p>
      `;
    }

    el.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 cursor-pointer flex-1" onclick="openDirectMessage('${friend.id}')">
        <div class="relative">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-br ${friend.avatarBg || 'from-indigo-500 to-purple-700'} flex items-center justify-center text-xl shadow-md ring-1 ring-white/10 group-hover:scale-105 transition">
            ${friend.avatar}
          </div>
          <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${getStatusBg(friend.status)}"></span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-sm text-slate-200 group-hover:text-white truncate">${escapeHtml(friend.username)}</span>
            <span class="text-[11px] text-slate-400 font-mono">${escapeHtml(friend.tag.split('#')[1] ? '#' + friend.tag.split('#')[1] : '')}</span>
            ${friend.isBot ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-semibold uppercase">BOT</span>' : ''}
          </div>
          <div class="text-xs text-slate-400 flex items-center gap-1.5 capitalize">
            <span class="${getStatusTextColor(friend.status)} font-medium">${friend.status.replace('-', ' ')}</span>
            ${friend.status === 'offline' && friend.lastSeen ? `<span class="text-slate-400 text-[10px]">• ${timeAgo(friend.lastSeen)}</span>` : ''}
          </div>
          ${activityHtml}
        </div>
      </div>
      <div class="flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
        <button class="btn-dm-friend p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition" title="Direct Message">
          💬
        </button>
        <button class="btn-invite-friend p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-purple-400 transition" title="Invite to Squad / Party">
          🎮
        </button>
        <button class="btn-options-friend p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition" title="Remove Friend">
          ✕
        </button>
      </div>
    `;

    // Button actions
    el.querySelector('.btn-dm-friend').onclick = (e) => {
      e.stopPropagation();
      openDirectMessage(friend.id);
    };

    el.querySelector('.btn-invite-friend').onclick = (e) => {
      e.stopPropagation();
      if (!currentParty) {
        // Create party first, then invite
        socket.emit('party:create', { name: `${currentUser.username}'s Squad`, gameId: 'pong' }, (res) => {
          if (res.success) {
            socket.emit('party:invite', { friendId: friend.id }, (invRes) => {
              showToast('Party Invite', invRes.message, invRes.success ? 'success' : 'error');
            });
          }
        });
      } else {
        socket.emit('party:invite', { friendId: friend.id }, (res) => {
          showToast('Party Invite', res.message, res.success ? 'success' : 'error');
        });
      }
    };

    el.querySelector('.btn-options-friend').onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Remove ${friend.username} from your friends list?`)) {
        socket.emit('friend:remove', { targetUserId: friend.id }, () => {
          showToast('Friend Removed', `${friend.username} removed.`, 'info');
        });
      }
    };

    return el;
  }

  // Render Pending Tab (Incoming & Outgoing requests)
  function renderPendingTab(container) {
    const { incoming, outgoing } = pendingRequests;
    const total = incoming.length + outgoing.length;

    if (total === 0) {
      container.innerHTML = `
        <div class="py-16 text-center text-slate-500">
          <div class="text-4xl mb-2">📬</div>
          <p class="text-sm font-medium">No pending friend requests.</p>
          <p class="text-xs text-slate-600 mt-1">Send requests to other players by gamer tag!</p>
        </div>
      `;
      return;
    }

    let html = '';

    if (incoming.length > 0) {
      html += `<div class="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">Incoming Requests (${incoming.length})</div>`;
      incoming.forEach(req => {
        html += `
          <div class="p-3.5 mb-2.5 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${req.avatarBg || 'from-indigo-600 to-purple-800'} flex items-center justify-center text-xl shadow">
                ${req.avatar}
              </div>
              <div>
                <span class="font-bold text-sm text-white">${escapeHtml(req.username)}</span>
                <span class="text-xs text-slate-400 font-mono ml-1">${escapeHtml(req.tag)}</span>
                <p class="text-[11px] text-slate-400">Wants to be your friend!</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button onclick="acceptFriend('${req.id}')" class="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition">Accept</button>
              <button onclick="declineFriend('${req.id}')" class="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition">Decline</button>
            </div>
          </div>
        `;
      });
    }

    if (outgoing.length > 0) {
      html += `<div class="text-xs font-bold uppercase tracking-wider text-slate-400 mt-4 mb-2 px-1">Outgoing Requests (${outgoing.length})</div>`;
      outgoing.forEach(req => {
        html += `
          <div class="p-3 mb-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-lg bg-gradient-to-br ${req.avatarBg || 'from-slate-700 to-slate-900'} flex items-center justify-center text-lg">
                ${req.avatar}
              </div>
              <div>
                <span class="font-semibold text-sm text-slate-300">${escapeHtml(req.username)}</span>
                <span class="text-xs text-slate-400 font-mono ml-1">${escapeHtml(req.tag)}</span>
                <p class="text-[10px] text-amber-400">Waiting for response...</p>
              </div>
            </div>
            <button onclick="declineFriend('${req.id}')" class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition">Cancel</button>
          </div>
        `;
      });
    }

    container.innerHTML = html;
  }

  // Explore Tab: All Connected Players
  function renderExplorePlayers(container) {
    const listEl = container || document.getElementById('friends-list-container');
    if (!listEl) return;
    listEl.innerHTML = '';

    const nonFriends = allOnlinePlayers.filter(p => !friends.some(f => f.id === p.id) && p.id !== currentUser.id);

    if (nonFriends.length === 0) {
      listEl.innerHTML = `
        <div class="py-16 text-center text-slate-500">
          <div class="text-4xl mb-2">🌐</div>
          <p class="text-sm font-medium">All active online players are in your network!</p>
          <p class="text-xs text-slate-600 mt-1">Open a second browser tab to test live multiplayer presence!</p>
        </div>
      `;
      return;
    }

    const header = document.createElement('div');
    header.className = 'text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 px-1';
    header.innerText = `Online Players in the Nexus (${nonFriends.length})`;
    listEl.appendChild(header);

    nonFriends.forEach(player => {
      const isPending = pendingRequests.outgoing.some(o => o.id === player.id);
      const row = document.createElement('div');
      row.className = 'p-3.5 mb-2 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 shadow';
      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${player.avatarBg || 'from-cyan-500 to-blue-600'} flex items-center justify-center text-xl shadow">
            ${player.avatar}
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-sm font-bold text-slate-200">${escapeHtml(player.username)}</span>
              <span class="text-xs text-slate-400 font-mono">${escapeHtml(player.tag)}</span>
            </div>
            <div class="text-[11px] text-emerald-400 flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>Available for Games</span>
            </div>
          </div>
        </div>
        <button class="btn-quick-add px-3.5 py-1.5 rounded-xl text-xs font-bold shadow transition ${isPending ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-cyan-600 hover:bg-cyan-500 text-white'}" ${isPending ? 'disabled' : ''}>
          ${isPending ? 'Pending' : '+ Add Friend'}
        </button>
      `;

      row.querySelector('.btn-quick-add').onclick = () => {
        socket.emit('friend:send_request', { targetTagOrId: player.tag }, (res) => {
          showToast(res.success ? 'Request Sent' : 'Failed', res.message, res.success ? 'success' : 'error');
        });
      };

      listEl.appendChild(row);
    });
  }

  // Friend actions
  window.acceptFriend = function(targetId) {
    socket.emit('friend:accept_request', { targetUserId: targetId }, () => {
      showToast('Friend Added', 'Request accepted! You can now chat and play together.', 'success');
    });
  };

  window.declineFriend = function(targetId) {
    socket.emit('friend:decline_request', { targetUserId: targetId });
  };

  // Direct Messaging (DMs)
  window.openDirectMessage = function(friendId) {
    const friend = friends.find(f => f.id === friendId) || allOnlinePlayers.find(p => p.id === friendId);
    if (!friend) return;

    activeDmFriend = friend;
    const drawer = document.getElementById('dm-drawer');
    drawer.classList.remove('hidden');

    document.getElementById('dm-friend-avatar').innerText = friend.avatar;
    document.getElementById('dm-friend-avatar-bg').className = `w-9 h-9 rounded-xl bg-gradient-to-br ${friend.avatarBg || 'from-indigo-500 to-purple-600'} flex items-center justify-center text-lg shadow`;
    document.getElementById('dm-friend-name').innerText = friend.username;
    document.getElementById('dm-friend-tag').innerText = friend.tag;
    document.getElementById('dm-friend-status').innerText = friend.status;

    // Load message history from server
    socket.emit('dm:get_history', { friendId: friend.id }, (res) => {
      dmMessages = res.messages || [];
      renderDmMessages();
      scrollDmToBottom();
    });
  };

  function sendDmMessage() {
    const input = document.getElementById('dm-message-input');
    const text = input.value.trim();
    if (!text || !activeDmFriend) return;

    socket.emit('dm:send_message', {
      toUserId: activeDmFriend.id,
      text
    });
    input.value = '';
  }

  function sendGameChallenge(gameId) {
    if (!activeDmFriend) return;
    const gameName = gameId === 'pong' ? 'Neon Pong Clash 🏓' : (gameId === 'arena' ? 'Cyber Tank Arena ⚔️' : 'Rapid Trivia Duel 🧠');

    socket.emit('dm:send_message', {
      toUserId: activeDmFriend.id,
      text: `Let's duel! I challenge you to a 1v1 match in ${gameName}!`,
      challengeGame: gameId
    });

    showToast('Challenge Sent', `Challenged ${activeDmFriend.username} to ${gameName}!`, 'success');
  }

  function renderDmMessages() {
    const container = document.getElementById('dm-messages-container');
    if (!container) return;
    container.innerHTML = '';

    dmMessages.forEach(msg => {
      const isMe = msg.fromUserId === currentUser.id;
      const bubble = document.createElement('div');
      bubble.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} mb-3`;

      let challengeHtml = '';
      if (msg.challengeGame) {
        challengeHtml = `
          <div class="mt-2 p-2.5 rounded-lg bg-slate-900/80 border border-cyan-500/40 flex items-center justify-between gap-3 text-xs">
            <span class="font-bold text-cyan-300">1v1 Challenge: ${escapeHtml(msg.challengeGame.toUpperCase())}</span>
            ${!isMe ? `<button onclick="accept1v1Match('${msg.fromUserId}', '${msg.challengeGame}')" class="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow transition">Accept ⚔️</button>` : '<span class="text-[10px] text-slate-500">Sent</span>'}
          </div>
        `;
      }

      bubble.innerHTML = `
        <div class="max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${isMe ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-br-none shadow-md shadow-cyan-600/10' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'}">
          <p class="leading-relaxed break-words">${escapeHtml(msg.text)}</p>
          ${challengeHtml}
        </div>
        <span class="text-[10px] text-slate-400 mt-1 px-1 font-mono">${formatTime(msg.timestamp)}</span>
      `;
      container.appendChild(bubble);
    });
  }

  window.accept1v1Match = function(challengerId, gameId) {
    socket.emit('game:accept_challenge', { challengerId, gameId }, (res) => {
      if (res.success) {
        showToast('Challenge Accepted', 'Duel starting now!', 'success');
      }
    });
  };

  function scrollDmToBottom() {
    const container = document.getElementById('dm-messages-container');
    if (container) container.scrollTop = container.scrollHeight;
  }

  // Party / Squad UI Render
  function renderPartyUI() {
    const emptyPartyEl = document.getElementById('party-empty-view');
    const activePartyEl = document.getElementById('party-active-view');
    if (!emptyPartyEl || !activePartyEl) return;

    if (!currentParty) {
      emptyPartyEl.classList.remove('hidden');
      activePartyEl.classList.add('hidden');
      return;
    }

    emptyPartyEl.classList.add('hidden');
    activePartyEl.classList.remove('hidden');

    document.getElementById('party-name-title').innerText = currentParty.name;
    document.getElementById('party-member-count').innerText = `${currentParty.members.length}/4 Members`;

    const isLeader = currentParty.leaderId === currentUser.id;
    document.getElementById('btn-start-party-game').classList.toggle('hidden', !isLeader);
    document.getElementById('party-game-selector').disabled = !isLeader;
    document.getElementById('party-game-selector').value = currentParty.currentGame;

    // Render Slots
    const slotsGrid = document.getElementById('party-members-grid');
    slotsGrid.innerHTML = '';

    for (let i = 0; i < 4; i++) {
      const member = currentParty.members[i];
      const slotEl = document.createElement('div');

      if (member && member.user) {
        const u = member.user;
        const isMe = u.id === currentUser.id;
        const isSquadLeader = u.id === currentParty.leaderId;

        slotEl.className = 'p-3 rounded-2xl bg-slate-900 border border-purple-500/30 flex flex-col items-center justify-center relative group shadow-lg';
        slotEl.innerHTML = `
          ${isSquadLeader ? '<span class="absolute top-2 left-2 text-xs" title="Party Leader">👑</span>' : ''}
          <div class="relative mb-2">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br ${u.avatarBg || 'from-indigo-600 to-purple-800'} flex items-center justify-center text-2xl shadow">
              ${u.avatar}
            </div>
            <span class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${getStatusBg(u.status)}"></span>
          </div>
          <span class="font-bold text-xs text-white truncate max-w-[100px]">${escapeHtml(u.username)}</span>
          <span class="text-[10px] text-slate-400 font-mono">${u.stats ? `Lvl ${u.stats.level || 1}` : ''}</span>
          <div class="mt-2 flex items-center gap-1.5">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${member.isReady ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'}">
              ${member.isReady ? 'Ready' : 'Not Ready'}
            </span>
          </div>
          ${isMe ? `<button id="btn-party-ready-toggle" class="mt-2 text-[10px] text-cyan-400 hover:underline">Toggle Ready</button>` : ''}
        `;

        if (isMe) {
          slotEl.querySelector('#btn-party-ready-toggle')?.addEventListener('click', () => {
            socket.emit('party:toggle_ready');
          });
        }
      } else {
        // Open Invite Slot
        slotEl.className = 'p-4 rounded-2xl border-2 border-dashed border-slate-800 hover:border-purple-500/50 flex flex-col items-center justify-center text-center transition cursor-pointer min-h-[140px]';
        slotEl.innerHTML = `
          <div class="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mb-2 group-hover:text-purple-400 transition">
            +
          </div>
          <span class="text-xs font-semibold text-slate-400">Invite Friend</span>
          <span class="text-[10px] text-slate-600">Slot Open</span>
        `;
        slotEl.onclick = () => {
          showInviteFriendsList();
        };
      }
      slotsGrid.appendChild(slotEl);
    }
  }

  function showInviteFriendsList() {
    const onlineFriends = friends.filter(f => f.status !== 'offline');
    if (onlineFriends.length === 0) {
      showToast('No Friends Online', 'None of your friends are currently online to invite.', 'info');
      return;
    }
    // Show prompt or invite all
    onlineFriends.forEach(f => {
      socket.emit('party:invite', { friendId: f.id });
    });
    showToast('Invites Broadcast', `Sent squad invite to ${onlineFriends.length} online friend(s)!`, 'success');
  }

  function renderPartyChatMessage(msg) {
    const chatContainer = document.getElementById('party-chat-messages');
    if (!chatContainer) return;

    const row = document.createElement('div');
    row.className = 'text-xs mb-1.5 flex items-start gap-1.5';
    row.innerHTML = `
      <span class="font-bold text-purple-300">${escapeHtml(msg.username)}:</span>
      <span class="text-slate-300">${escapeHtml(msg.text)}</span>
    `;
    chatContainer.appendChild(row);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Trivia UI Renderer
  function renderTriviaQuestion(qData) {
    document.getElementById('trivia-question-num').innerText = `Question ${qData.qIndex}/${qData.total}`;
    document.getElementById('trivia-question-text').innerText = qData.question;
    document.getElementById('trivia-timer').innerText = `${qData.timer}s`;

    const optionsContainer = document.getElementById('trivia-options');
    optionsContainer.innerHTML = '';

    qData.options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'trivia-opt-btn p-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-left font-medium text-sm text-slate-200 transition shadow hover:border-cyan-400';
      btn.innerHTML = `<span class="inline-block w-6 text-cyan-400 font-bold font-mono">${String.fromCharCode(65 + idx)}.</span> ${escapeHtml(opt)}`;
      btn.onclick = () => {
        document.querySelectorAll('.trivia-opt-btn').forEach(b => {
          b.disabled = true;
          b.classList.add('opacity-60');
        });
        btn.classList.remove('opacity-60');
        btn.classList.add('ring-2', 'ring-cyan-400', 'bg-cyan-950/60');
        socket.emit('game:input', { selectedOption: idx });
      };
      optionsContainer.appendChild(btn);
    });
  }

  function highlightTriviaAnswers(res) {
    const buttons = document.querySelectorAll('.trivia-opt-btn');
    if (buttons[res.correctOption]) {
      buttons[res.correctOption].classList.add('bg-emerald-900/80', 'border-emerald-500', 'ring-2', 'ring-emerald-400');
    }
  }

  // Helpers
  function getStatusBg(status) {
    if (status === 'online') return 'bg-emerald-500';
    if (status === 'in-game') return 'bg-cyan-400 animate-pulse';
    if (status === 'away') return 'bg-amber-400';
    if (status === 'dnd') return 'bg-rose-500';
    return 'bg-slate-600';
  }

  function getStatusTextColor(status) {
    if (status === 'online') return 'text-emerald-400';
    if (status === 'in-game') return 'text-cyan-400';
    if (status === 'away') return 'text-amber-400';
    if (status === 'dnd') return 'text-rose-400';
    return 'text-slate-500';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTime(timestamp) {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  // Start when DOM is ready
  window.addEventListener('DOMContentLoaded', initApp);
})();
