import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = 3000;

// Helper for mobile detection
function isMobileUserAgent(ua = '') {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
}

// Mobile specific routes
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile.html'));
});
app.get('/mobile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'mobile.html'));
});

// Web specific routes
app.get('/web', (req, res) => {
  res.sendFile(path.join(__dirname, 'web.html'));
});
app.get('/web.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'web.html'));
});

// Main entry with smart device detection and explicit override support
app.get('/', (req, res) => {
  const view = (req.query.view || req.query.mode || '').toLowerCase();
  if (view === 'mobile') {
    return res.sendFile(path.join(__dirname, 'mobile.html'));
  }
  if (view === 'desktop' || view === 'web') {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }

  const userAgent = req.headers['user-agent'] || '';
  if (isMobileUserAgent(userAgent)) {
    return res.sendFile(path.join(__dirname, 'mobile.html'));
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname, { index: false }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NexusPlay Multiplayer Friends Network', onlineUsers: store.users.size });
});

// High-fidelity native language TTS endpoint with caching
const ttsAudioCache = new Map();

app.get('/api/tts', async (req, res) => {
  try {
    const rawText = String(req.query.text || '').trim();
    let lang = String(req.query.lang || 'ur').trim().toLowerCase();
    if (!rawText) return res.status(400).send('No text');

    // Clean emojis and decorative symbols
    const cleanText = rawText.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]/gu, '').trim();
    if (!cleanText) return res.status(400).send('Empty text');

    // Language mapping for Google TTS
    const langMap = {
      'zh': 'zh-CN',
      'fa': 'ar'
    };
    const targetLang = langMap[lang] || lang;

    const cacheKey = `${targetLang}:${cleanText}`;
    if (ttsAudioCache.has(cacheKey)) {
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(ttsAudioCache.get(cacheKey));
    }

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=${encodeURIComponent(targetLang)}&client=tw-ob`;
    const ttsRes = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!ttsRes.ok) {
      return res.status(502).send('TTS service unavailable');
    }

    const arrayBuffer = await ttsRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Keep cache bounded
    if (ttsAudioCache.size > 800) {
      const oldestKey = ttsAudioCache.keys().next().value;
      ttsAudioCache.delete(oldestKey);
    }
    ttsAudioCache.set(cacheKey, buffer);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.warn('[TTS] Generation error:', err);
    res.status(500).send('TTS Error');
  }
});

// ==========================================
// In-Memory Real-time State & Storage
// ==========================================
class UserStore {
  constructor() {
    this.users = new Map(); // id -> user object
    this.socketToUser = new Map(); // socketId -> userId
    this.userToSockets = new Map(); // userId -> Set<socketId>
    this.parties = new Map(); // partyId -> party object
    this.directMessages = new Map(); // "minId:maxId" -> Array<message>
    this.activeGames = new Map(); // gameId -> game instance

    this.initDefaultBots();
  }

  initDefaultBots() {
    const demoBots = [
      {
        id: 'bot_nova',
        username: 'Nova_Prime',
        tag: 'Nova#4412',
        avatar: '🚀',
        avatarBg: 'from-cyan-500 to-blue-600',
        avatarFrame: 'cyan',
        status: 'online',
        customStatus: 'Ranked grind in Pong Clash! 🏓',
        gameActivity: {
          gameId: 'pong',
          gameName: 'Neon Pong Clash',
          details: 'Ranked 1v1 • Score 4 - 3',
          startedAt: Date.now() - 1000 * 60 * 4
        },
        stats: { gamesPlayed: 142, wins: 98, level: 14, xp: 2450 },
        isBot: true
      },
      {
        id: 'bot_kage',
        username: 'ShadowKage',
        tag: 'Kage#9901',
        avatar: '🥷',
        avatarBg: 'from-purple-600 to-indigo-900',
        avatarFrame: 'purple',
        status: 'in-game',
        customStatus: 'In Cyber Tank Arena 🔥',
        gameActivity: {
          gameId: 'arena',
          gameName: 'Cyber Tank Arena',
          details: 'Deathmatch • 7 Kills',
          startedAt: Date.now() - 1000 * 60 * 12
        },
        stats: { gamesPlayed: 230, wins: 154, level: 22, xp: 4800 },
        isBot: true
      },
      {
        id: 'bot_valkyrie',
        username: 'Valkyrie99',
        tag: 'Valkyrie#3210',
        avatar: '⚡',
        avatarBg: 'from-amber-400 to-orange-600',
        avatarFrame: 'gold',
        status: 'online',
        customStatus: 'Looking for party! Join me ✨',
        gameActivity: null,
        stats: { gamesPlayed: 88, wins: 51, level: 9, xp: 1200 },
        isBot: true
      },
      {
        id: 'bot_drifter',
        username: 'PixelDrifter',
        tag: 'Drifter#7723',
        avatar: '👾',
        avatarBg: 'from-emerald-500 to-teal-800',
        avatarFrame: 'emerald',
        status: 'away',
        customStatus: 'Grabbing coffee & energy drink ☕',
        gameActivity: null,
        stats: { gamesPlayed: 112, wins: 64, level: 11, xp: 1750 },
        isBot: true
      },
      {
        id: 'bot_cyberfox',
        username: 'CyberFox',
        tag: 'Fox#1154',
        avatar: '🦊',
        avatarBg: 'from-pink-500 to-rose-700',
        avatarFrame: 'pink',
        status: 'offline',
        customStatus: 'Will be back at 8pm UTC',
        gameActivity: null,
        lastSeen: Date.now() - 1000 * 60 * 35,
        stats: { gamesPlayed: 45, wins: 20, level: 5, xp: 620 },
        isBot: true
      }
    ];

    demoBots.forEach(bot => {
      this.users.set(bot.id, {
        ...bot,
        friends: new Set(),
        pendingIncoming: new Set(),
        pendingOutgoing: new Set(),
        blocked: new Set(),
        partyId: null,
        createdAt: Date.now()
      });
    });
  }

  getDmKey(u1, u2) {
    return [u1, u2].sort().join(':::');
  }

  findUserByTag(tag) {
    const cleanTag = tag.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.tag.toLowerCase() === cleanTag) return user;
    }
    return null;
  }

  getUser(id) {
    return this.users.get(id);
  }

  getPublicProfile(id) {
    const u = this.users.get(id);
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      tag: u.tag,
      avatar: u.avatar,
      avatarBg: u.avatarBg,
      avatarFrame: u.avatarFrame,
      status: u.status,
      customStatus: u.customStatus,
      gameActivity: u.gameActivity,
      lastSeen: u.lastSeen,
      partyId: u.partyId,
      stats: u.stats,
      isBot: !!u.isBot
    };
  }

  getFriendsList(userId) {
    const user = this.users.get(userId);
    if (!user) return [];
    const list = [];
    user.friends.forEach(fId => {
      const f = this.getPublicProfile(fId);
      if (f) list.push(f);
    });
    return list;
  }

  getPendingRequests(userId) {
    const user = this.users.get(userId);
    if (!user) return { incoming: [], outgoing: [] };
    const incoming = [];
    const outgoing = [];
    user.pendingIncoming.forEach(reqId => {
      const u = this.getPublicProfile(reqId);
      if (u) incoming.push(u);
    });
    user.pendingOutgoing.forEach(reqId => {
      const u = this.getPublicProfile(reqId);
      if (u) outgoing.push(u);
    });
    return { incoming, outgoing };
  }
}

const store = new UserStore();

// ==========================================
// Bot Automation (Simulates Active Network)
// ==========================================
setInterval(() => {
  // Occasionally simulate bot activity changes
  const botIds = ['bot_nova', 'bot_kage', 'bot_valkyrie', 'bot_drifter'];
  const botId = botIds[Math.floor(Math.random() * botIds.length)];
  const bot = store.getUser(botId);
  if (!bot) return;

  const activities = [
    { gameId: 'pong', gameName: 'Neon Pong Clash', details: `Match • Round ${Math.floor(Math.random() * 5) + 1}`, startedAt: Date.now() },
    { gameId: 'arena', gameName: 'Cyber Tank Arena', details: `Sector 4 • ${Math.floor(Math.random() * 12) + 1} Kills`, startedAt: Date.now() },
    { gameId: 'trivia', gameName: 'Rapid Trivia Duel', details: `Clash • Question ${Math.floor(Math.random() * 5) + 1}/5`, startedAt: Date.now() },
    null
  ];
  const newActivity = activities[Math.floor(Math.random() * activities.length)];
  bot.gameActivity = newActivity;
  if (newActivity) {
    bot.status = 'in-game';
  } else {
    bot.status = Math.random() > 0.3 ? 'online' : 'away';
  }

  // Broadcast to all online users who are friends with this bot
  bot.friends.forEach(fId => {
    const sockets = store.userToSockets.get(fId);
    if (sockets) {
      sockets.forEach(sId => {
        io.to(sId).emit('friend:presence_updated', store.getPublicProfile(bot.id));
      });
    }
  });
}, 18000);

// ==========================================
// Socket.io Real-Time Event Handlers
// ==========================================
io.on('connection', (socket) => {
  let currentUserId = null;

  // 1. Initial User Registration / Session Login
  socket.on('user:init', (payload, callback) => {
    try {
      const { id, username, tag, avatar, avatarBg, avatarFrame } = payload;
      currentUserId = id;

      let user = store.getUser(id);
      if (!user) {
        // Create new user profile
        user = {
          id,
          username: username || 'Player',
          tag: tag || `${username || 'Player'}#${Math.floor(1000 + Math.random() * 9000)}`,
          avatar: avatar || '⚡',
          avatarBg: avatarBg || 'from-indigo-500 to-purple-700',
          avatarFrame: avatarFrame || 'cyan',
          status: 'online',
          customStatus: 'Ready to play! 🎮',
          gameActivity: null,
          friends: new Set(['bot_nova', 'bot_valkyrie']), // Pre-seed friendly companions for immediate fun
          pendingIncoming: new Set(['bot_kage']), // One pending request to explore accept/decline
          pendingOutgoing: new Set(),
          blocked: new Set(),
          partyId: null,
          lastSeen: Date.now(),
          stats: { gamesPlayed: 0, wins: 0, level: 1, xp: 120 },
          createdAt: Date.now()
        };
        store.users.set(id, user);

        // Make bots mutual friends
        store.getUser('bot_nova')?.friends.add(id);
        store.getUser('bot_valkyrie')?.friends.add(id);
        store.getUser('bot_kage')?.pendingOutgoing.add(id);

        // Seed an initial friendly welcome DM
        const dmKey = store.getDmKey(id, 'bot_nova');
        store.directMessages.set(dmKey, [
          {
            id: 'msg_welcome_1',
            fromUserId: 'bot_nova',
            toUserId: id,
            text: `Hey ${user.username}! Welcome to NexusPlay! 👋 Challenge me to Neon Pong anytime! 🏓`,
            timestamp: Date.now() - 1000 * 60 * 3,
            read: false
          }
        ]);
      } else {
        // Update presence to online
        user.status = 'online';
        user.lastSeen = Date.now();
        if (username) user.username = username;
        if (tag) user.tag = tag;
        if (avatar) user.avatar = avatar;
        if (avatarBg) user.avatarBg = avatarBg;
        if (avatarFrame) user.avatarFrame = avatarFrame;
      }

      // Map socket
      store.socketToUser.set(socket.id, id);
      if (!store.userToSockets.has(id)) {
        store.userToSockets.set(id, new Set());
      }
      store.userToSockets.get(id).add(socket.id);

      // Join user room for private messages & invites
      socket.join(`user:${id}`);

      // Broadcast online status to friends
      broadcastPresence(id);

      const response = {
        success: true,
        user: store.getPublicProfile(id),
        friends: store.getFriendsList(id),
        requests: store.getPendingRequests(id),
        allOnlinePlayers: Array.from(store.users.values())
          .filter(u => u.id !== id && u.status !== 'offline')
          .map(u => store.getPublicProfile(u.id))
      };

      if (typeof callback === 'function') callback(response);
      socket.emit('user:ready', response);
    } catch (err) {
      console.error('user:init error:', err);
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // 2. Profile & Status Update
  socket.on('user:update_profile', (payload) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user) return;

    if (payload.username) user.username = payload.username;
    if (payload.avatar) user.avatar = payload.avatar;
    if (payload.avatarBg) user.avatarBg = payload.avatarBg;
    if (payload.avatarFrame) user.avatarFrame = payload.avatarFrame;
    if (payload.status) user.status = payload.status;
    if (payload.customStatus !== undefined) user.customStatus = payload.customStatus;
    if (payload.gameActivity !== undefined) user.gameActivity = payload.gameActivity;

    broadcastPresence(currentUserId);
    socket.emit('user:profile_updated', store.getPublicProfile(currentUserId));
  });

  // 3. Friend Request Flow: Send Friend Request
  socket.on('friend:send_request', (payload, callback) => {
    if (!currentUserId) return;
    const sender = store.getUser(currentUserId);
    if (!sender) return;

    const { targetTagOrId } = payload;
    let target = null;

    if (targetTagOrId.includes('#')) {
      target = store.findUserByTag(targetTagOrId);
    } else {
      target = store.getUser(targetTagOrId);
    }

    if (!target) {
      return callback?.({ success: false, message: 'Player tag or ID not found. Check spelling (e.g., Alex#4092)' });
    }

    if (target.id === currentUserId) {
      return callback?.({ success: false, message: 'You cannot send a friend request to yourself.' });
    }

    if (sender.friends.has(target.id)) {
      return callback?.({ success: false, message: 'You are already friends with this player!' });
    }

    if (sender.blocked.has(target.id) || target.blocked.has(sender.id)) {
      return callback?.({ success: false, message: 'Unable to send friend request.' });
    }

    if (sender.pendingOutgoing.has(target.id)) {
      return callback?.({ success: false, message: 'Friend request already pending.' });
    }

    // If target already sent us a request, automatically accept it!
    if (sender.pendingIncoming.has(target.id)) {
      acceptFriendRequest(currentUserId, target.id);
      return callback?.({ success: true, message: `Mutual request! ${target.username} added as friend!` });
    }

    sender.pendingOutgoing.add(target.id);
    target.pendingIncoming.add(sender.id);

    // Notify recipient via socket if online
    io.to(`user:${target.id}`).emit('friend:request_received', {
      from: store.getPublicProfile(sender.id),
      message: `${sender.username} (${sender.tag}) sent you a friend request!`
    });

    // Notify sender with updated requests
    socket.emit('friend:requests_updated', store.getPendingRequests(sender.id));

    // If target is bot, auto respond after short delay for awesome feedback
    if (target.isBot) {
      setTimeout(() => {
        acceptFriendRequest(target.id, sender.id);
        io.to(`user:${sender.id}`).emit('notification', {
          title: 'Friend Request Accepted',
          message: `${target.username} accepted your friend request! 🎉`,
          type: 'success'
        });
      }, 2500);
    }

    callback?.({ success: true, message: `Friend request sent to ${target.tag}!` });
  });

  // 4. Accept Friend Request
  socket.on('friend:accept_request', (payload, callback) => {
    if (!currentUserId) return;
    const { targetUserId } = payload;
    acceptFriendRequest(currentUserId, targetUserId);
    callback?.({ success: true });
  });

  function acceptFriendRequest(userId1, userId2) {
    const u1 = store.getUser(userId1);
    const u2 = store.getUser(userId2);
    if (!u1 || !u2) return;

    u1.pendingIncoming.delete(userId2);
    u1.pendingOutgoing.delete(userId2);
    u2.pendingIncoming.delete(userId1);
    u2.pendingOutgoing.delete(userId1);

    u1.friends.add(userId2);
    u2.friends.add(userId1);

    // Emit updated friend lists to both
    io.to(`user:${u1.id}`).emit('friend:list_updated', store.getFriendsList(u1.id));
    io.to(`user:${u1.id}`).emit('friend:requests_updated', store.getPendingRequests(u1.id));

    io.to(`user:${u2.id}`).emit('friend:list_updated', store.getFriendsList(u2.id));
    io.to(`user:${u2.id}`).emit('friend:requests_updated', store.getPendingRequests(u2.id));

    // Also notify
    io.to(`user:${u1.id}`).emit('notification', {
      title: 'New Friend Added',
      message: `You and ${u2.username} are now friends! 🎮`,
      type: 'success'
    });
    io.to(`user:${u2.id}`).emit('notification', {
      title: 'New Friend Added',
      message: `${u1.username} accepted your friend request! 🎮`,
      type: 'success'
    });
  }

  // 5. Decline / Cancel Friend Request
  socket.on('friend:decline_request', (payload, callback) => {
    if (!currentUserId) return;
    const { targetUserId } = payload;
    const user = store.getUser(currentUserId);
    const target = store.getUser(targetUserId);

    if (user) {
      user.pendingIncoming.delete(targetUserId);
      user.pendingOutgoing.delete(targetUserId);
      socket.emit('friend:requests_updated', store.getPendingRequests(user.id));
    }
    if (target) {
      target.pendingIncoming.delete(currentUserId);
      target.pendingOutgoing.delete(currentUserId);
      io.to(`user:${target.id}`).emit('friend:requests_updated', store.getPendingRequests(target.id));
    }

    callback?.({ success: true });
  });

  // 6. Remove Friend
  socket.on('friend:remove', (payload, callback) => {
    if (!currentUserId) return;
    const { targetUserId } = payload;
    const user = store.getUser(currentUserId);
    const target = store.getUser(targetUserId);

    if (user) {
      user.friends.delete(targetUserId);
      socket.emit('friend:list_updated', store.getFriendsList(user.id));
    }
    if (target) {
      target.friends.delete(currentUserId);
      io.to(`user:${target.id}`).emit('friend:list_updated', store.getFriendsList(target.id));
    }
    callback?.({ success: true });
  });

  // 7. Direct Messaging (DMs)
  socket.on('dm:get_history', (payload, callback) => {
    if (!currentUserId) return;
    const { friendId } = payload;
    const dmKey = store.getDmKey(currentUserId, friendId);
    const messages = store.directMessages.get(dmKey) || [];
    callback?.({ success: true, messages });
  });

  socket.on('dm:send_message', (payload, callback) => {
    if (!currentUserId) return;
    const { toUserId, text, challengeGame } = payload;
    const sender = store.getUser(currentUserId);
    const recipient = store.getUser(toUserId);

    if (!sender || !recipient) {
      return callback?.({ success: false, message: 'User not found' });
    }

    if (!sender.friends.has(toUserId)) {
      return callback?.({ success: false, message: 'You can only message friends.' });
    }

    const dmKey = store.getDmKey(currentUserId, toUserId);
    if (!store.directMessages.has(dmKey)) {
      store.directMessages.set(dmKey, []);
    }

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      fromUserId: currentUserId,
      toUserId,
      text: text ? text.trim() : '',
      challengeGame: challengeGame || null,
      timestamp: Date.now(),
      read: false
    };

    store.directMessages.get(dmKey).push(message);

    // Send to recipient
    io.to(`user:${toUserId}`).emit('dm:new_message', {
      message,
      sender: store.getPublicProfile(currentUserId)
    });

    // Send back to sender sockets
    io.to(`user:${currentUserId}`).emit('dm:new_message', {
      message,
      sender: store.getPublicProfile(currentUserId)
    });

    // Bot instant smart reply if messaging a bot
    if (recipient.isBot) {
      handleBotChatReply(recipient, sender, message);
    }

    callback?.({ success: true, message });
  });

  socket.on('dm:typing', (payload) => {
    if (!currentUserId) return;
    const { toUserId, isTyping } = payload;
    io.to(`user:${toUserId}`).emit('dm:typing', {
      fromUserId: currentUserId,
      isTyping
    });
  });

  // 8. Party / Lobby Management
  socket.on('party:create', (payload, callback) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user) return;

    // Leave any existing party
    leaveParty(currentUserId);

    const partyId = `party_${Date.now().toString(36)}`;
    const party = {
      id: partyId,
      name: payload.name || `${user.username}'s Squad`,
      leaderId: currentUserId,
      privacy: payload.privacy || 'friends', // 'friends', 'public', 'invite'
      currentGame: payload.gameId || 'pong',
      gameStatus: 'lobby', // 'lobby' | 'playing'
      createdAt: Date.now(),
      members: [
        {
          userId: currentUserId,
          isReady: true,
          isMuted: false,
          isDeafened: false,
          ping: Math.floor(18 + Math.random() * 15)
        }
      ],
      chat: []
    };

    store.parties.set(partyId, party);
    user.partyId = partyId;
    socket.join(`party:${partyId}`);

    broadcastPresence(currentUserId);
    const partyData = getPartyDetails(partyId);

    io.to(`party:${partyId}`).emit('party:updated', partyData);
    callback?.({ success: true, party: partyData });
  });

  socket.on('party:invite', (payload, callback) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) {
      return callback?.({ success: false, message: 'You are not in a party' });
    }

    const party = store.parties.get(user.partyId);
    if (!party) return callback?.({ success: false, message: 'Party not found' });

    if (party.members.length >= 4) {
      return callback?.({ success: false, message: 'Party is full (max 4 players)' });
    }

    const { friendId } = payload;
    const friend = store.getUser(friendId);
    if (!friend) return callback?.({ success: false, message: 'Friend not found' });

    // Send party invite notification to friend
    io.to(`user:${friendId}`).emit('party:invitation_received', {
      partyId: party.id,
      partyName: party.name,
      gameName: getGameTitle(party.currentGame),
      inviter: store.getPublicProfile(currentUserId),
      memberCount: party.members.length,
      maxMembers: 4
    });

    // If bot invited, they can join or reply
    if (friend.isBot) {
      setTimeout(() => {
        if (party.members.length < 4) {
          joinPartyInternal(friend.id, party.id);
        }
      }, 1500);
    }

    callback?.({ success: true, message: `Invite sent to ${friend.username}!` });
  });

  socket.on('party:join', (payload, callback) => {
    if (!currentUserId) return;
    const { partyId } = payload;
    const res = joinPartyInternal(currentUserId, partyId);
    callback?.(res);
  });

  function joinPartyInternal(userId, partyId) {
    const user = store.getUser(userId);
    const party = store.parties.get(partyId);
    if (!user || !party) {
      return { success: false, message: 'Party or user does not exist' };
    }

    if (party.members.length >= 4) {
      return { success: false, message: 'Party is already full!' };
    }

    leaveParty(userId);

    party.members.push({
      userId,
      isReady: false,
      isMuted: false,
      isDeafened: false,
      ping: Math.floor(20 + Math.random() * 20)
    });
    user.partyId = partyId;

    // Join socket room
    const userSockets = store.userToSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(sId => {
        io.sockets.sockets.get(sId)?.join(`party:${partyId}`);
      });
    }

    const partyData = getPartyDetails(partyId);
    io.to(`party:${partyId}`).emit('party:updated', partyData);
    io.to(`party:${partyId}`).emit('party:member_joined', {
      user: store.getPublicProfile(userId)
    });

    broadcastPresence(userId);
    return { success: true, party: partyData };
  }

  socket.on('party:leave', (callback) => {
    if (!currentUserId) return;
    leaveParty(currentUserId);
    callback?.({ success: true });
  });

  function leaveParty(userId) {
    const user = store.getUser(userId);
    if (!user || !user.partyId) return;

    const partyId = user.partyId;
    const party = store.parties.get(partyId);
    user.partyId = null;

    const userSockets = store.userToSockets.get(userId);
    if (userSockets) {
      userSockets.forEach(sId => {
        io.sockets.sockets.get(sId)?.leave(`party:${partyId}`);
      });
    }

    if (party) {
      party.members = party.members.filter(m => m.userId !== userId);

      if (party.members.length === 0) {
        // Dissolve party
        store.parties.delete(partyId);
        // Clean up game if running
        stopGame(partyId);
      } else {
        // If leader left, assign new leader
        if (party.leaderId === userId) {
          party.leaderId = party.members[0].userId;
        }
        io.to(`party:${partyId}`).emit('party:updated', getPartyDetails(partyId));
        io.to(`party:${partyId}`).emit('party:member_left', {
          user: store.getPublicProfile(userId)
        });
      }
    }

    broadcastPresence(userId);
  }

  socket.on('party:toggle_ready', () => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) return;
    const party = store.parties.get(user.partyId);
    if (!party) return;

    const member = party.members.find(m => m.userId === currentUserId);
    if (member) {
      member.isReady = !member.isReady;
      io.to(`party:${party.id}`).emit('party:updated', getPartyDetails(party.id));
    }
  });

  socket.on('party:send_chat', (payload) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) return;

    const chatMsg = {
      id: `pchat_${Date.now()}`,
      userId: currentUserId,
      username: user.username,
      avatar: user.avatar,
      text: payload.text,
      timestamp: Date.now()
    };

    io.to(`party:${user.partyId}`).emit('party:new_chat', chatMsg);
  });

  socket.on('party:change_game', (payload) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) return;
    const party = store.parties.get(user.partyId);
    if (!party || party.leaderId !== currentUserId) return;

    party.currentGame = payload.gameId;
    io.to(`party:${party.id}`).emit('party:updated', getPartyDetails(party.id));
  });

  // 9. Party Game Start & Real-Time Multiplayer Gameplay
  socket.on('party:start_game', (callback) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) return;
    const party = store.parties.get(user.partyId);
    if (!party || party.leaderId !== currentUserId) return;

    startGameForParty(party);
    callback?.({ success: true });
  });

  // Direct 1v1 Challenge Play
  socket.on('game:accept_challenge', (payload, callback) => {
    if (!currentUserId) return;
    const { challengerId, gameId } = payload;
    const challenger = store.getUser(challengerId);
    const user = store.getUser(currentUserId);
    if (!challenger || !user) return;

    // Create a 2-player quick match party or match
    const partyId = `match_${Date.now()}`;
    const party = {
      id: partyId,
      name: `1v1 Duel: ${challenger.username} vs ${user.username}`,
      leaderId: challengerId,
      privacy: 'invite',
      currentGame: gameId || 'pong',
      gameStatus: 'playing',
      members: [
        { userId: challengerId, isReady: true, ping: 24 },
        { userId: currentUserId, isReady: true, ping: 28 }
      ],
      chat: []
    };
    store.parties.set(partyId, party);

    challenger.partyId = partyId;
    user.partyId = partyId;

    // Add both to room
    store.userToSockets.get(challengerId)?.forEach(sId => io.sockets.sockets.get(sId)?.join(`party:${partyId}`));
    store.userToSockets.get(currentUserId)?.forEach(sId => io.sockets.sockets.get(sId)?.join(`party:${partyId}`));

    startGameForParty(party);
    callback?.({ success: true, partyId });
  });

  // In-Game Player Input (Pong Paddle, Tank Controls, Trivia Choice)
  socket.on('game:input', (payload) => {
    if (!currentUserId) return;
    const user = store.getUser(currentUserId);
    if (!user || !user.partyId) return;

    const game = store.activeGames.get(user.partyId);
    if (!game) return;

    game.handleInput(currentUserId, payload);
  });

  // Disconnect Handling
  socket.on('disconnect', () => {
    if (currentUserId) {
      const userSockets = store.userToSockets.get(currentUserId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          store.userToSockets.delete(currentUserId);
          const user = store.getUser(currentUserId);
          if (user) {
            user.status = 'offline';
            user.lastSeen = Date.now();
            user.gameActivity = null;
            broadcastPresence(currentUserId);
          }
        }
      }
      store.socketToUser.delete(socket.id);
    }
  });

  // Helper: Presence Broadcast to mutual friends
  function broadcastPresence(userId) {
    const user = store.getUser(userId);
    if (!user) return;
    const pub = store.getPublicProfile(userId);

    // Notify all mutual friends who are online
    user.friends.forEach(fId => {
      const friendSockets = store.userToSockets.get(fId);
      if (friendSockets) {
        friendSockets.forEach(sId => {
          io.to(sId).emit('friend:presence_updated', pub);
        });
      }
    });

    // Also broadcast to public player directory
    io.emit('directory:presence_updated', pub);
  }
});

// ==========================================
// Helper functions
// ==========================================
function getPartyDetails(partyId) {
  const p = store.parties.get(partyId);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    leaderId: p.leaderId,
    privacy: p.privacy,
    currentGame: p.currentGame,
    gameStatus: p.gameStatus,
    members: p.members.map(m => {
      const u = store.getPublicProfile(m.userId);
      return {
        ...m,
        user: u
      };
    }),
    chat: p.chat
  };
}

function getGameTitle(gameId) {
  if (gameId === 'pong') return 'Neon Pong Clash';
  if (gameId === 'arena') return 'Cyber Tank Arena';
  if (gameId === 'trivia') return 'Rapid Trivia Duel';
  return 'Multiplayer Match';
}

function handleBotChatReply(bot, sender, message) {
  setTimeout(() => {
    // Show typing
    io.to(`user:${sender.id}`).emit('dm:typing', {
      fromUserId: bot.id,
      isTyping: true
    });

    setTimeout(() => {
      io.to(`user:${sender.id}`).emit('dm:typing', {
        fromUserId: bot.id,
        isTyping: false
      });

      let botReply = '';
      const text = message.text.toLowerCase();

      if (text.includes('hi') || text.includes('hello') || text.includes('hey')) {
        botReply = `Hey ${sender.username}! Great to see you online. Up for a match of Neon Pong or Tank Arena? 🔥`;
      } else if (text.includes('play') || text.includes('game') || text.includes('pong') || text.includes('tank')) {
        botReply = `I'm down! Create a party or send me a 1v1 challenge and let's roll! 🎮⚡`;
      } else if (text.includes('party')) {
        botReply = `Invite me to your party and I'll jump right in! 🚀`;
      } else if (message.challengeGame) {
        botReply = `Challenge accepted! Loading up ${getGameTitle(message.challengeGame)}... let's see what you've got! 🏆`;
      } else {
        const randomReplies = [
          `Nice! We should squad up for Cyber Tank Arena next! 🛡️`,
          `Haha true! My high score in Pong is 11 in a row. Bet you can't beat it! 😉`,
          `Let's go! Send a party invite whenever you're ready! ✨`,
          `GG! Always ready for another round.`
        ];
        botReply = randomReplies[Math.floor(Math.random() * randomReplies.length)];
      }

      const dmKey = store.getDmKey(sender.id, bot.id);
      const replyMsg = {
        id: `msg_bot_${Date.now()}`,
        fromUserId: bot.id,
        toUserId: sender.id,
        text: botReply,
        timestamp: Date.now(),
        read: false
      };

      if (!store.directMessages.has(dmKey)) {
        store.directMessages.set(dmKey, []);
      }
      store.directMessages.get(dmKey).push(replyMsg);

      io.to(`user:${sender.id}`).emit('dm:new_message', {
        message: replyMsg,
        sender: store.getPublicProfile(bot.id)
      });
    }, 1200);
  }, 600);
}

// ==========================================
// Server-Authoritative Mini-Game Engines
// ==========================================
function startGameForParty(party) {
  party.gameStatus = 'playing';

  // Update rich presence for all members
  party.members.forEach(m => {
    const user = store.getUser(m.userId);
    if (user) {
      user.status = 'in-game';
      user.gameActivity = {
        gameId: party.currentGame,
        gameName: getGameTitle(party.currentGame),
        details: `Live match • Party of ${party.members.length}`,
        startedAt: Date.now()
      };
      // Broadcast to their friends
      user.friends.forEach(fId => {
        store.userToSockets.get(fId)?.forEach(sId => {
          io.to(sId).emit('friend:presence_updated', store.getPublicProfile(user.id));
        });
      });
    }
  });

  io.to(`party:${party.id}`).emit('party:updated', getPartyDetails(party.id));

  // Instantiate appropriate game
  if (party.currentGame === 'pong') {
    const pongGame = new NeonPongGame(party.id, party.members.map(m => m.userId));
    store.activeGames.set(party.id, pongGame);
    pongGame.start();
  } else if (party.currentGame === 'arena') {
    const tankGame = new CyberTankGame(party.id, party.members.map(m => m.userId));
    store.activeGames.set(party.id, tankGame);
    tankGame.start();
  } else if (party.currentGame === 'trivia') {
    const triviaGame = new RapidTriviaGame(party.id, party.members.map(m => m.userId));
    store.activeGames.set(party.id, triviaGame);
    triviaGame.start();
  }
}

function stopGame(partyId) {
  const game = store.activeGames.get(partyId);
  if (game) {
    game.stop();
    store.activeGames.delete(partyId);
  }
}

// 1. Neon Pong Engine (1v1 or 2 players with spectators)
class NeonPongGame {
  constructor(partyId, playerIds) {
    this.partyId = partyId;
    this.p1Id = playerIds[0];
    this.p2Id = playerIds[1] || 'bot_nova'; // fallback to bot if single player
    this.spectatorIds = playerIds.slice(2);

    this.width = 800;
    this.height = 450;
    this.paddleHeight = 85;
    this.paddleWidth = 14;

    this.p1 = { y: 225 - 42, score: 0 };
    this.p2 = { y: 225 - 42, score: 0 };
    this.ball = {
      x: 400,
      y: 225,
      vx: Math.random() > 0.5 ? 5 : -5,
      vy: (Math.random() * 4) - 2,
      radius: 8,
      speed: 6
    };

    this.maxScore = 7;
    this.isOver = false;
    this.interval = null;
    this.roundCountdown = 3;
  }

  start() {
    io.to(`party:${this.partyId}`).emit('game:start', {
      gameId: 'pong',
      title: 'Neon Pong Clash',
      p1: store.getPublicProfile(this.p1Id),
      p2: store.getPublicProfile(this.p2Id),
      dimensions: { width: this.width, height: this.height }
    });

    let ticks = 0;
    this.interval = setInterval(() => {
      ticks++;
      this.update(ticks);
      io.to(`party:${this.partyId}`).emit('game:state', {
        p1: this.p1,
        p2: this.p2,
        ball: this.ball,
        isOver: this.isOver,
        countdown: this.roundCountdown
      });
    }, 1000 / 40); // 40 FPS sync
  }

  handleInput(userId, input) {
    // input: { paddleY: number }
    if (userId === this.p1Id && input.paddleY !== undefined) {
      this.p1.y = Math.max(0, Math.min(this.height - this.paddleHeight, input.paddleY));
    } else if (userId === this.p2Id && input.paddleY !== undefined) {
      this.p2.y = Math.max(0, Math.min(this.height - this.paddleHeight, input.paddleY));
    }
  }

  update(ticks) {
    if (this.isOver) return;

    if (this.roundCountdown > 0) {
      if (ticks % 30 === 0) {
        this.roundCountdown--;
      }
      return;
    }

    // Bot AI if p2 is bot or away
    if (this.p2Id.startsWith('bot_')) {
      const targetY = this.ball.y - this.paddleHeight / 2;
      const speed = 4.2;
      if (this.p2.y < targetY) this.p2.y += Math.min(speed, targetY - this.p2.y);
      else if (this.p2.y > targetY) this.p2.y -= Math.min(speed, this.p2.y - targetY);
      this.p2.y = Math.max(0, Math.min(this.height - this.paddleHeight, this.p2.y));
    }

    // Move ball
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Bounce top / bottom
    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = Math.abs(this.ball.vy);
    } else if (this.ball.y + this.ball.radius >= this.height) {
      this.ball.y = this.height - this.ball.radius;
      this.ball.vy = -Math.abs(this.ball.vy);
    }

    // Paddle 1 collision (Left)
    const p1X = 30;
    if (this.ball.x - this.ball.radius <= p1X + this.paddleWidth &&
        this.ball.x + this.ball.radius >= p1X &&
        this.ball.y >= this.p1.y && this.ball.y <= this.p1.y + this.paddleHeight) {
      this.ball.x = p1X + this.paddleWidth + this.ball.radius;
      this.ball.vx = Math.abs(this.ball.vx) * 1.05;
      const hitOffset = (this.ball.y - (this.p1.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
      this.ball.vy = hitOffset * 6;
      io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'paddle_hit' });
    }

    // Paddle 2 collision (Right)
    const p2X = this.width - 30 - this.paddleWidth;
    if (this.ball.x + this.ball.radius >= p2X &&
        this.ball.x - this.ball.radius <= p2X + this.paddleWidth &&
        this.ball.y >= this.p2.y && this.ball.y <= this.p2.y + this.paddleHeight) {
      this.ball.x = p2X - this.ball.radius;
      this.ball.vx = -Math.abs(this.ball.vx) * 1.05;
      const hitOffset = (this.ball.y - (this.p2.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
      this.ball.vy = hitOffset * 6;
      io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'paddle_hit' });
    }

    // Score left / right
    if (this.ball.x < 0) {
      // P2 scored
      this.p2.score++;
      this.resetBall(1);
      io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'score' });
      this.checkEnd();
    } else if (this.ball.x > this.width) {
      // P1 scored
      this.p1.score++;
      this.resetBall(-1);
      io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'score' });
      this.checkEnd();
    }
  }

  resetBall(direction) {
    this.ball.x = this.width / 2;
    this.ball.y = this.height / 2;
    this.ball.vx = direction * 5;
    this.ball.vy = (Math.random() * 4) - 2;
    this.roundCountdown = 2;
  }

  checkEnd() {
    if (this.p1.score >= this.maxScore || this.p2.score >= this.maxScore) {
      this.isOver = true;
      const winnerId = this.p1.score >= this.maxScore ? this.p1Id : this.p2Id;
      const winner = store.getPublicProfile(winnerId);

      // Reward XP to players
      const u1 = store.getUser(this.p1Id);
      const u2 = store.getUser(this.p2Id);
      if (u1 && !u1.isBot) {
        u1.stats.gamesPlayed++;
        if (winnerId === this.p1Id) u1.stats.wins++;
        u1.stats.xp += 150;
      }
      if (u2 && !u2.isBot) {
        u2.stats.gamesPlayed++;
        if (winnerId === this.p2Id) u2.stats.wins++;
        u2.stats.xp += 150;
      }

      io.to(`party:${this.partyId}`).emit('game:over', {
        winner,
        p1Score: this.p1.score,
        p2Score: this.p2.score
      });

      setTimeout(() => {
        this.stop();
        const party = store.parties.get(this.partyId);
        if (party) {
          party.gameStatus = 'lobby';
          party.members.forEach(m => {
            const u = store.getUser(m.userId);
            if (u) {
              u.status = 'online';
              u.gameActivity = null;
            }
          });
          io.to(`party:${this.partyId}`).emit('party:updated', getPartyDetails(this.partyId));
        }
      }, 5000);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// 2. Cyber Tank Arena Engine (2-4 players)
class CyberTankGame {
  constructor(partyId, playerIds) {
    this.partyId = partyId;
    this.width = 800;
    this.height = 450;
    this.tanks = new Map();
    this.projectiles = [];
    this.powerups = [];
    this.killFeed = [];
    this.isOver = false;
    this.interval = null;

    const colors = ['#06b6d4', '#a855f7', '#ec4899', '#eab308'];
    const spawnPoints = [
      { x: 80, y: 80, angle: 45 },
      { x: 720, y: 370, angle: 225 },
      { x: 720, y: 80, angle: 135 },
      { x: 80, y: 370, angle: 315 }
    ];

    playerIds.slice(0, 4).forEach((id, idx) => {
      const u = store.getUser(id);
      const spawn = spawnPoints[idx] || { x: 400, y: 225, angle: 0 };
      this.tanks.set(id, {
        id,
        username: u ? u.username : `Tank ${idx + 1}`,
        avatar: u ? u.avatar : '🛡️',
        color: colors[idx],
        x: spawn.x,
        y: spawn.y,
        angle: spawn.angle,
        speed: 0,
        angularVelocity: 0,
        health: 100,
        score: 0,
        shield: 0,
        lastFired: 0,
        isBot: !!u?.isBot
      });
    });

    // If only 1 human, add bot tank!
    if (this.tanks.size === 1) {
      const bot = store.getUser('bot_kage') || { username: 'ShadowKage', avatar: '🥷' };
      this.tanks.set('bot_kage', {
        id: 'bot_kage',
        username: bot.username,
        avatar: bot.avatar,
        color: '#ec4899',
        x: 720,
        y: 370,
        angle: 225,
        speed: 0,
        angularVelocity: 0,
        health: 100,
        score: 0,
        shield: 0,
        lastFired: 0,
        isBot: true
      });
    }

    // Spawn obstacles
    this.obstacles = [
      { x: 220, y: 120, w: 60, h: 60 },
      { x: 520, y: 120, w: 60, h: 60 },
      { x: 220, y: 270, w: 60, h: 60 },
      { x: 520, y: 270, w: 60, h: 60 },
      { x: 370, y: 195, w: 60, h: 60 }
    ];
  }

  start() {
    io.to(`party:${this.partyId}`).emit('game:start', {
      gameId: 'arena',
      title: 'Cyber Tank Arena',
      dimensions: { width: this.width, height: this.height },
      obstacles: this.obstacles,
      tanks: Array.from(this.tanks.values())
    });

    let ticks = 0;
    this.interval = setInterval(() => {
      ticks++;
      this.update(ticks);
      io.to(`party:${this.partyId}`).emit('game:arena_state', {
        tanks: Array.from(this.tanks.values()),
        projectiles: this.projectiles,
        powerups: this.powerups,
        killFeed: this.killFeed.slice(-3)
      });
    }, 1000 / 30);
  }

  handleInput(userId, input) {
    // input: { move: -1|0|1, turn: -1|0|1, shoot: boolean, angle: number }
    const tank = this.tanks.get(userId);
    if (!tank || tank.health <= 0) return;

    if (input.turn !== undefined) {
      tank.angle += input.turn * 4.5;
    }
    if (input.move !== undefined) {
      tank.speed = input.move * 3.5;
    }
    if (input.shoot && Date.now() - tank.lastFired > 380) {
      tank.lastFired = Date.now();
      const rad = (tank.angle * Math.PI) / 180;
      this.projectiles.push({
        id: `proj_${Date.now()}_${Math.random()}`,
        ownerId: userId,
        x: tank.x + Math.cos(rad) * 22,
        y: tank.y + Math.sin(rad) * 22,
        vx: Math.cos(rad) * 9,
        vy: Math.sin(rad) * 9,
        color: tank.color,
        createdAt: Date.now()
      });
      io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'laser' });
    }
  }

  update(ticks) {
    if (this.isOver) return;

    // Powerup spawn
    if (ticks % 240 === 0 && this.powerups.length < 3) {
      this.powerups.push({
        id: `pow_${Date.now()}`,
        x: 100 + Math.random() * (this.width - 200),
        y: 80 + Math.random() * (this.height - 160),
        type: Math.random() > 0.5 ? 'shield' : 'heal'
      });
    }

    // Update tanks
    for (const tank of this.tanks.values()) {
      if (tank.health <= 0) continue;

      // Bot AI
      if (tank.isBot) {
        // Find nearest player tank
        let target = null;
        let minDist = 9999;
        for (const other of this.tanks.values()) {
          if (other.id !== tank.id && other.health > 0) {
            const d = Math.hypot(other.x - tank.x, other.y - tank.y);
            if (d < minDist) {
              minDist = d;
              target = other;
            }
          }
        }
        if (target) {
          const targetAngle = (Math.atan2(target.y - tank.y, target.x - tank.x) * 180) / Math.PI;
          let diff = (targetAngle - tank.angle) % 360;
          if (diff < -180) diff += 360;
          if (diff > 180) diff -= 360;
          tank.angle += Math.sign(diff) * Math.min(3.5, Math.abs(diff));
          tank.speed = minDist > 180 ? 2.5 : (minDist < 90 ? -1.5 : 0);

          if (Math.abs(diff) < 20 && Date.now() - tank.lastFired > 900) {
            tank.lastFired = Date.now();
            const rad = (tank.angle * Math.PI) / 180;
            this.projectiles.push({
              id: `proj_${Date.now()}_${Math.random()}`,
              ownerId: tank.id,
              x: tank.x + Math.cos(rad) * 22,
              y: tank.y + Math.sin(rad) * 22,
              vx: Math.cos(rad) * 8.5,
              vy: Math.sin(rad) * 8.5,
              color: tank.color,
              createdAt: Date.now()
            });
          }
        }
      }

      if (tank.speed !== 0) {
        const rad = (tank.angle * Math.PI) / 180;
        const newX = tank.x + Math.cos(rad) * tank.speed;
        const newY = tank.y + Math.sin(rad) * tank.speed;

        // Collision with bounds
        const radius = 18;
        if (newX > radius && newX < this.width - radius && !this.checkObstacleCollision(newX, tank.y, radius)) {
          tank.x = newX;
        }
        if (newY > radius && newY < this.height - radius && !this.checkObstacleCollision(tank.x, newY, radius)) {
          tank.y = newY;
        }
      }

      // Check powerup collection
      this.powerups = this.powerups.filter(pow => {
        if (Math.hypot(pow.x - tank.x, pow.y - tank.y) < 26) {
          if (pow.type === 'heal') tank.health = Math.min(100, tank.health + 35);
          if (pow.type === 'shield') tank.shield = 50;
          io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'powerup' });
          return false;
        }
        return true;
      });
    }

    // Update projectiles
    const now = Date.now();
    this.projectiles = this.projectiles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Expiry or out of bounds
      if (now - p.createdAt > 3200 || p.x < 0 || p.x > this.width || p.y < 0 || p.y > this.height) {
        return false;
      }

      // Check obstacle hit
      if (this.checkObstacleCollision(p.x, p.y, 4)) {
        return false;
      }

      // Check hit against tanks
      for (const tank of this.tanks.values()) {
        if (tank.id !== p.ownerId && tank.health > 0) {
          if (Math.hypot(p.x - tank.x, p.y - tank.y) < 20) {
            let dmg = 25;
            if (tank.shield > 0) {
              const absorb = Math.min(tank.shield, dmg);
              tank.shield -= absorb;
              dmg -= absorb;
            }
            tank.health = Math.max(0, tank.health - dmg);
            io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'hit' });

            if (tank.health <= 0) {
              const shooter = this.tanks.get(p.ownerId);
              if (shooter) shooter.score++;
              this.killFeed.push(`${shooter ? shooter.username : 'Someone'} eliminated ${tank.username} 💥`);
              io.to(`party:${this.partyId}`).emit('game:sound', { sound: 'explosion' });

              // Respawn after 3 seconds
              setTimeout(() => {
                if (!this.isOver) {
                  tank.health = 100;
                  tank.x = 100 + Math.random() * (this.width - 200);
                  tank.y = 80 + Math.random() * (this.height - 160);
                }
              }, 3000);

              // Check if shooter reached winning threshold
              if (shooter && shooter.score >= 5) {
                this.finishGame(shooter);
              }
            }
            return false;
          }
        }
      }
      return true;
    });
  }

  checkObstacleCollision(x, y, radius) {
    for (const o of this.obstacles) {
      if (x + radius >= o.x && x - radius <= o.x + o.w &&
          y + radius >= o.y && y - radius <= o.y + o.h) {
        return true;
      }
    }
    return false;
  }

  finishGame(winner) {
    this.isOver = true;
    const winnerUser = store.getPublicProfile(winner.id);

    io.to(`party:${this.partyId}`).emit('game:over', {
      winner: winnerUser,
      leaderboard: Array.from(this.tanks.values()).sort((a, b) => b.score - a.score)
    });

    setTimeout(() => {
      this.stop();
      const party = store.parties.get(this.partyId);
      if (party) {
        party.gameStatus = 'lobby';
        party.members.forEach(m => {
          const u = store.getUser(m.userId);
          if (u) {
            u.status = 'online';
            u.gameActivity = null;
          }
        });
        io.to(`party:${this.partyId}`).emit('party:updated', getPartyDetails(this.partyId));
      }
    }, 5000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// 3. Rapid Trivia Duel (Multiplayer quiz battle)
class RapidTriviaGame {
  constructor(partyId, playerIds) {
    this.partyId = partyId;
    this.playerIds = playerIds;
    this.scores = new Map();
    playerIds.forEach(id => this.scores.set(id, 0));

    this.questions = [
      {
        question: 'Which iconic game introduced the phrase "Finish Him!"?',
        options: ['Street Fighter II', 'Mortal Kombat', 'Tekken', 'Killer Instinct'],
        correct: 1
      },
      {
        question: 'In Minecraft, what do you need to enter the Nether realm?',
        options: ['Obsidian & Flint/Steel', 'Diamond Portal', 'Ender Eyes', 'Gold Blocks'],
        correct: 0
      },
      {
        question: 'What is the highest competitive rank in Valorant?',
        options: ['Grandmaster', 'Radiant', 'Immortal', 'Apex Predator'],
        correct: 1
      },
      {
        question: 'Which legendary company created the Pokémon franchise alongside Nintendo?',
        options: ['Capcom', 'Game Freak', 'Square Enix', 'Konami'],
        correct: 1
      },
      {
        question: 'What is the primary currency used in League of Legends in-game shop?',
        options: ['V-Bucks', 'Riot Points', 'Gold', 'Credits'],
        correct: 2
      }
    ];

    this.currentQIndex = 0;
    this.timer = 10;
    this.answers = new Map(); // questionIndex -> Map(userId -> { option, timeTaken })
    this.isOver = false;
    this.interval = null;
  }

  start() {
    this.sendQuestion();
    this.interval = setInterval(() => {
      this.timer--;
      if (this.timer <= 0) {
        this.evaluateRound();
      } else {
        io.to(`party:${this.partyId}`).emit('game:trivia_tick', { timer: this.timer });
      }
    }, 1000);
  }

  sendQuestion() {
    this.timer = 10;
    const q = this.questions[this.currentQIndex];
    io.to(`party:${this.partyId}`).emit('game:trivia_question', {
      qIndex: this.currentQIndex + 1,
      total: this.questions.length,
      question: q.question,
      options: q.options,
      timer: this.timer
    });
  }

  handleInput(userId, input) {
    // input: { selectedOption: number }
    if (!this.answers.has(this.currentQIndex)) {
      this.answers.set(this.currentQIndex, new Map());
    }
    const qAnswers = this.answers.get(this.currentQIndex);
    if (!qAnswers.has(userId)) {
      qAnswers.set(userId, { option: input.selectedOption, timeRemaining: this.timer });
      io.to(`party:${this.partyId}`).emit('game:trivia_player_answered', { userId });
    }
  }

  evaluateRound() {
    const q = this.questions[this.currentQIndex];
    const qAnswers = this.answers.get(this.currentQIndex) || new Map();

    // Reward points
    for (const [userId, ans] of qAnswers.entries()) {
      if (ans.option === q.correct) {
        const bonus = ans.timeRemaining * 10;
        const points = 100 + bonus;
        this.scores.set(userId, (this.scores.get(userId) || 0) + points);
      }
    }

    const scoreboard = Array.from(this.scores.entries()).map(([uId, score]) => ({
      user: store.getPublicProfile(uId),
      score
    })).sort((a, b) => b.score - a.score);

    io.to(`party:${this.partyId}`).emit('game:trivia_round_result', {
      correctOption: q.correct,
      scoreboard
    });

    this.currentQIndex++;
    if (this.currentQIndex < this.questions.length) {
      setTimeout(() => {
        if (!this.isOver) this.sendQuestion();
      }, 3000);
    } else {
      this.finishGame(scoreboard);
    }
  }

  finishGame(scoreboard) {
    this.isOver = true;
    if (this.interval) clearInterval(this.interval);

    io.to(`party:${this.partyId}`).emit('game:trivia_over', {
      winner: scoreboard[0]?.user,
      scoreboard
    });

    setTimeout(() => {
      const party = store.parties.get(this.partyId);
      if (party) {
        party.gameStatus = 'lobby';
        party.members.forEach(m => {
          const u = store.getUser(m.userId);
          if (u) {
            u.status = 'online';
            u.gameActivity = null;
          }
        });
        io.to(`party:${this.partyId}`).emit('party:updated', getPartyDetails(this.partyId));
      }
    }, 5000);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Start server with port error recovery
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Server] Port ${PORT} already in use. Retrying in 1s...`);
    setTimeout(() => {
      try { server.close(); } catch (_) {}
      server.listen(PORT, '0.0.0.0');
    }, 1000);
  } else {
    console.error('[Server] Fatal server error:', err);
  }
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Ludo Emperor / NexusPlay server live on port ${PORT}`);
});

