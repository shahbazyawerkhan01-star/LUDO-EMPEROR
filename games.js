// Client-side game canvas rendering and multiplayer controls
class GameManager {
  constructor(socket) {
    this.socket = socket;
    this.currentGame = null;
    this.canvas = null;
    this.ctx = null;
    this.gameData = null;
    this.keys = {};
    this.animId = null;
    this.myUserId = null;

    this.bindEvents();
  }

  setUserId(id) {
    this.myUserId = id;
  }

  bindEvents() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        if (this.currentGame) e.preventDefault();
      }
      this.handleInputTick();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
      this.handleInputTick();
    });
  }

  setupCanvas(canvasElement) {
    this.canvas = canvasElement;
    if (this.canvas) {
      this.ctx = this.canvas.getContext('2d');
      // Mouse move for pong
      this.canvas.addEventListener('mousemove', (e) => {
        if (this.currentGame === 'pong') {
          const rect = this.canvas.getBoundingClientRect();
          const scaleY = this.canvas.height / rect.height;
          const mouseY = (e.clientY - rect.top) * scaleY;
          this.socket.emit('game:input', { paddleY: mouseY - 42 });
        }
      });
      // Touch support
      this.canvas.addEventListener('touchmove', (e) => {
        if (this.currentGame === 'pong' && e.touches[0]) {
          const rect = this.canvas.getBoundingClientRect();
          const scaleY = this.canvas.height / rect.height;
          const touchY = (e.touches[0].clientY - rect.top) * scaleY;
          this.socket.emit('game:input', { paddleY: touchY - 42 });
        }
      });
    }
  }

  handleInputTick() {
    if (!this.currentGame) return;

    if (this.currentGame === 'pong') {
      let paddleMove = 0;
      if (this.keys['w'] || this.keys['arrowup']) paddleMove -= 8;
      if (this.keys['s'] || this.keys['arrowdown']) paddleMove += 8;
      if (paddleMove !== 0 && this.lastPongY !== undefined) {
        this.lastPongY += paddleMove;
        this.socket.emit('game:input', { paddleY: this.lastPongY });
      }
    } else if (this.currentGame === 'arena') {
      let move = 0;
      let turn = 0;
      if (this.keys['w'] || this.keys['arrowup']) move += 1;
      if (this.keys['s'] || this.keys['arrowdown']) move -= 1;
      if (this.keys['a'] || this.keys['arrowleft']) turn -= 1;
      if (this.keys['d'] || this.keys['arrowright']) turn += 1;
      const shoot = !!(this.keys[' '] || this.keys['j'] || this.keys['enter']);

      this.socket.emit('game:input', { move, turn, shoot });
    }
  }

  // --- Pong Rendering ---
  startPong(info) {
    this.currentGame = 'pong';
    this.gameData = info;
    this.lastPongY = 180;
  }

  renderPongState(state) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Neon grid pattern
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Center dotted line
    ctx.setLineDash([8, 8]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Scores
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = '#06b6d4';
    ctx.textAlign = 'right';
    ctx.fillText(state.p1.score, w / 2 - 40, 60);

    ctx.fillStyle = '#ec4899';
    ctx.textAlign = 'left';
    ctx.fillText(state.p2.score, w / 2 + 40, 60);

    // Player labels
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textAlign = 'center';
    if (this.gameData?.p1) {
      ctx.fillText(this.gameData.p1.username, 80, 25);
    }
    if (this.gameData?.p2) {
      ctx.fillText(this.gameData.p2.username, w - 80, 25);
    }

    // Paddle 1 (Left - Cyan)
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(30, state.p1.y, 14, 85);

    // Paddle 2 (Right - Pink/Magenta)
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = '#ec4899';
    ctx.fillRect(w - 30 - 14, state.p2.y, 14, 85);

    // Ball
    ctx.shadowColor = '#facc15';
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, state.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0; // reset

    // Countdown overlay
    if (state.countdown > 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = 'bold 56px sans-serif';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.fillText(`Round starts in ${state.countdown}`, w / 2, h / 2 + 15);
    }
  }

  // --- Tank Arena Rendering ---
  startArena(info) {
    this.currentGame = 'arena';
    this.gameData = info;
  }

  renderArenaState(state) {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Cyber Arena Background
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw Obstacles
    if (this.gameData?.obstacles) {
      this.gameData.obstacles.forEach(o => {
        ctx.fillStyle = 'rgba(30, 41, 59, 0.9)';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeRect(o.x, o.y, o.w, o.h);
      });
    }

    // Draw Powerups
    state.powerups.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.shadowBlur = 12;
      ctx.shadowColor = p.type === 'shield' ? '#38bdf8' : '#4ade80';
      ctx.fillStyle = p.type === 'shield' ? '#0284c7' : '#16a34a';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(p.type === 'shield' ? '🛡️' : '❤️', 0, 4);
      ctx.restore();
    });

    // Draw Projectiles
    state.projectiles.forEach(p => {
      ctx.save();
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Draw Tanks
    state.tanks.forEach(tank => {
      if (tank.health <= 0) return;

      ctx.save();
      ctx.translate(tank.x, tank.y);
      ctx.rotate((tank.angle * Math.PI) / 180);

      // Tank Body
      ctx.shadowBlur = 12;
      ctx.shadowColor = tank.color;
      ctx.fillStyle = tank.color;
      ctx.fillRect(-14, -12, 28, 24);

      // Tank Treads
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(-16, -14, 32, 5);
      ctx.fillRect(-16, 9, 32, 5);

      // Turret Barrel
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, -3, 20, 6);

      // Center Hatch
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();

      // Shield effect if active
      if (tank.shield > 0) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Name & Health Bar (not rotated)
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${tank.avatar} ${tank.username} (${tank.score})`, tank.x, tank.y - 24);

      // Health background
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(tank.x - 20, tank.y - 18, 40, 4);

      // Health fill
      const hpColor = tank.health > 50 ? '#22c55e' : (tank.health > 25 ? '#eab308' : '#ef4444');
      ctx.fillStyle = hpColor;
      ctx.fillRect(tank.x - 20, tank.y - 18, (tank.health / 100) * 40, 4);
    });

    // Kill feed on top right
    if (state.killFeed && state.killFeed.length > 0) {
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'right';
      state.killFeed.forEach((item, idx) => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(w - 240, 10 + idx * 22, 230, 18);
        ctx.fillStyle = '#e2e8f0';
        ctx.fillText(item, w - 15, 23 + idx * 22);
      });
    }
  }

  stop() {
    this.currentGame = null;
    this.gameData = null;
  }
}

window.GameManager = GameManager;
