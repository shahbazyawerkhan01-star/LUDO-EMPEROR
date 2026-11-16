const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');

const modal_css = `
      /* ========================================================= */
      /* PROMPT 1: START-UP DIALOGUE MODE MODAL & COMMENTARY STYLES */
      /* ========================================================= */
      #dialogue-mode-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(4, 7, 18, 0.88);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 100000;
          padding: 16px;
          box-sizing: border-box;
      }
      #dialogue-mode-modal.visible {
          display: flex;
          animation: dmmFadeIn 0.28s ease-out;
      }
      @keyframes dmmFadeIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
      }
      .dialogue-mode-card {
          background: radial-gradient(circle at top, rgba(32, 24, 52, 0.98) 0%, rgba(12, 10, 24, 0.99) 100%);
          border: 2px solid rgba(241, 196, 15, 0.55);
          border-radius: 26px;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.9), 0 0 35px rgba(241, 196, 15, 0.28);
          max-width: 540px;
          width: 100%;
          padding: 28px 24px 24px;
          text-align: center;
          color: #ffffff;
          font-family: 'Fredoka', 'Noto Nastaliq Urdu', sans-serif;
          position: relative;
          direction: rtl;
      }
      .dialogue-mode-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, rgba(241, 196, 15, 0.22), rgba(230, 126, 34, 0.22));
          border: 1px solid rgba(241, 196, 15, 0.6);
          padding: 6px 16px;
          border-radius: 30px;
          font-size: 13px;
          font-weight: 700;
          color: #f1c40f;
          letter-spacing: 0.5px;
          margin-bottom: 12px;
      }
      .dialogue-mode-title {
          font-size: 22px;
          font-weight: 800;
          margin: 6px 0 10px 0;
          line-height: 1.45;
          color: #ffffff;
          text-shadow: 0 2px 10px rgba(0,0,0,0.6);
      }
      .dialogue-mode-subtitle {
          font-size: 14px;
          color: #cbd5e1;
          margin: 0 0 20px 0;
          line-height: 1.6;
      }
      .dialogue-mode-options {
          display: flex;
          flex-direction: column;
          gap: 14px;
          text-align: right;
      }
      .dialogue-mode-btn {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 2px solid rgba(255, 255, 255, 0.12);
          border-radius: 18px;
          padding: 16px 18px;
          cursor: pointer;
          transition: all 0.22s ease;
          color: #ffffff;
          position: relative;
          overflow: hidden;
          width: 100%;
          box-sizing: border-box;
      }
      .dialogue-mode-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      }
      .dialogue-mode-btn.commentary-opt {
          border-color: rgba(241, 196, 15, 0.45);
          background: linear-gradient(135deg, rgba(241, 196, 15, 0.12) 0%, rgba(230, 126, 34, 0.08) 100%);
      }
      .dialogue-mode-btn.commentary-opt:hover {
          border-color: #f1c40f;
          background: linear-gradient(135deg, rgba(241, 196, 15, 0.22) 0%, rgba(230, 126, 34, 0.18) 100%);
          box-shadow: 0 8px 26px rgba(241, 196, 15, 0.35);
      }
      .dialogue-mode-btn.banter-opt {
          border-color: rgba(52, 152, 219, 0.45);
          background: linear-gradient(135deg, rgba(52, 152, 219, 0.12) 0%, rgba(155, 89, 182, 0.08) 100%);
      }
      .dialogue-mode-btn.banter-opt:hover {
          border-color: #3498db;
          background: linear-gradient(135deg, rgba(52, 152, 219, 0.22) 0%, rgba(155, 89, 182, 0.18) 100%);
          box-shadow: 0 8px 26px rgba(52, 152, 219, 0.35);
      }
      .dialogue-opt-icon {
          font-size: 32px;
          flex-shrink: 0;
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.35);
      }
      .dialogue-opt-body {
          flex: 1;
      }
      .dialogue-opt-title {
          font-size: 16.5px;
          font-weight: 800;
          margin-bottom: 4px;
          color: #ffffff;
      }
      .commentary-opt .dialogue-opt-title {
          color: #f1c40f;
      }
      .banter-opt .dialogue-opt-title {
          color: #60a5fa;
      }
      .dialogue-opt-desc {
          font-size: 12px;
          color: #cbd5e1;
          line-height: 1.45;
          margin: 0;
      }
      .dialogue-mode-footer {
          margin-top: 18px;
          font-size: 12px;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
          align-items: center;
          direction: ltr;
      }

      /* In-game commentary booth overlay */
      #commentary-booth-hud {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          display: none;
          align-items: center;
          gap: 12px;
          background: rgba(15, 12, 26, 0.88);
          border: 1.5px solid rgba(241, 196, 15, 0.5);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.75), 0 0 16px rgba(241, 196, 15, 0.25);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          padding: 6px 14px;
          border-radius: 20px;
          z-index: 1200;
          pointer-events: none;
          font-family: 'Fredoka', 'Noto Nastaliq Urdu', sans-serif;
          transition: all 0.3s ease;
      }
      #commentary-booth-hud.active {
          display: flex;
      }
      .booth-avatar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 14px;
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
          opacity: 0.65;
          transition: all 0.2s ease;
      }
      .booth-avatar.abubakar-tag {
          background: rgba(30, 41, 59, 0.85);
          border: 1px solid #3b82f6;
          color: #93c5fd;
      }
      .booth-avatar.yaryab-tag {
          background: rgba(88, 28, 135, 0.85);
          border: 1px solid #ec4899;
          color: #fbcfe8;
      }
      .booth-avatar.speaking {
          opacity: 1;
          transform: scale(1.08);
          box-shadow: 0 0 14px currentColor;
      }
      .booth-badge-live {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 10px;
          font-weight: 800;
          background: #ef4444;
          color: #ffffff;
          padding: 2px 7px;
          border-radius: 8px;
          letter-spacing: 0.8px;
          animation: boothLivePulse 1.6s infinite;
      }
      @keyframes boothLivePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
      }

      /* Specific balloon stylings for Abubakar & Yaryab */
      .speech-balloon.commentator-abubakar {
          background: radial-gradient(circle at top, rgba(15, 23, 42, 0.95) 0%, rgba(2, 6, 23, 0.98) 100%) !important;
          border: 2px solid #3b82f6 !important;
          color: #e2e8f0 !important;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.85), 0 0 20px rgba(59, 130, 246, 0.45) !important;
          font-size: 14px !important;
          max-width: 320px !important;
          padding: 10px 18px !important;
          border-radius: 18px !important;
          direction: rtl !important;
          text-align: center !important;
          line-height: 1.45 !important;
      }
      .speech-balloon.commentator-yaryab {
          background: radial-gradient(circle at top, rgba(49, 10, 36, 0.95) 0%, rgba(20, 3, 14, 0.98) 100%) !important;
          border: 2px solid #ec4899 !important;
          color: #fdf2f8 !important;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.85), 0 0 20px rgba(236, 72, 153, 0.45) !important;
          font-size: 14px !important;
          max-width: 320px !important;
          padding: 10px 18px !important;
          border-radius: 18px !important;
          direction: rtl !important;
          text-align: center !important;
          line-height: 1.45 !important;
      }
      .commentator-label {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
          text-transform: uppercase;
      }
      .commentator-abubakar .commentator-label {
          color: #60a5fa;
      }
      .commentator-yaryab .commentator-label {
          color: #f472b6;
      }
`;

const modal_html = `
    <!-- PROMPT 1: Start-Up Dialogue Mode Selection Modal -->
    <div id="dialogue-mode-modal">
      <div class="dialogue-mode-card">
        <div class="dialogue-mode-badge">
          <span>🎙️</span>
          <span>ماحول و گفتگو کا انتخاب</span>
        </div>
        <h2 class="dialogue-mode-title">آپ گیم میں کس قسم کی گفتگو یا ماحول چاہتے ہیں؟</h2>
        <p class="dialogue-mode-subtitle">اپنی پسند کا موڈ منتخب کریں تاکہ پوری گیم کے دوران وہی انداز اور ڈائیلاگ ایکٹیو رہیں۔</p>
        
        <div class="dialogue-mode-options">
          <!-- Option 1: Live Commentary (Abubakar & Yaryab) -->
          <button id="dialogue-opt-commentary" type="button" class="dialogue-mode-btn commentary-opt">
            <div class="dialogue-opt-icon">🎙️</div>
            <div class="dialogue-opt-body">
              <div class="dialogue-opt-title">لائیو ڈرامائی کمنٹری (ابوبکر اور یریاب)</div>
              <p class="dialogue-opt-desc">ڈرامہ 'درِ نجات' کے انداز کے دو کمنٹیٹرز — ابوبکر اور یریاب — لائیو کمنٹری، نوک جھونک اور بحث کریں گے۔</p>
            </div>
          </button>

          <!-- Option 2: Players Banter Mode -->
          <button id="dialogue-opt-banter" type="button" class="dialogue-mode-btn banter-opt">
            <div class="dialogue-opt-icon">👥</div>
            <div class="dialogue-opt-body">
              <div class="dialogue-opt-title">پلئیرز کی آپس میں بات چیت (Banter Mode)</div>
              <p class="dialogue-opt-desc">صرف گیم کے اندرونی کھلاڑی یعنی شاہباز، مغل، زویہ اور کاجل آپس میں بات چیت، نوک جھونک اور مذاق کریں گے۔</p>
            </div>
          </button>
        </div>

        <div class="dialogue-mode-footer">
          <span>⚙️ Selected mode saved to localStorage</span>
          <span id="current-dialogue-mode-tag">Mode: Banter</span>
        </div>
      </div>
    </div>

    <!-- Live Commentary Booth In-Game HUD Indicator -->
    <div id="commentary-booth-hud">
      <div class="booth-badge-live">● LIVE</div>
      <div id="booth-abubakar" class="booth-avatar abubakar-tag">
        <span>🎙️</span>
        <span>ابوبکر</span>
      </div>
      <div id="booth-yaryab" class="booth-avatar yaryab-tag">
        <span>🎙️</span>
        <span>یریاب</span>
      </div>
    </div>
`;

// Insert CSS
const headIdx = html.indexOf("</head>");
if (headIdx === -1) throw new Error("No </head>");
html = html.slice(0, headIdx) + "<style>" + modal_css + "</style>\n" + html.slice(headIdx);

// Insert HTML
const bodyAnchor = html.indexOf("<div id=\"speech-balloons-container\"");
if (bodyAnchor === -1) throw new Error("No speech-balloons-container");
html = html.slice(0, bodyAnchor) + modal_html + "\n" + html.slice(bodyAnchor);

fs.writeFileSync("index.html", html, "utf8");
console.log("Successfully injected modal CSS and HTML via inject_modal.js! New length:", html.length);
