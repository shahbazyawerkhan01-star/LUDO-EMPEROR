// ============================================================================
// 4-WAY LUDO TOKENS BUNDLE (EXCLUDING ORANGE)
// Ready to copy-paste directly into your 4-Way Ludo Google AI Studio project!
// Standard 4-Way Colors: Blue (Player 0), Green (Player 1), Red (Player 2), Yellow (Player 3)
// ============================================================================

export const LUDO_4WAY_TOKEN_ASSETS = {
  // 1. Blue Token (Seat 0)
  "pawn_blue_new": {
    "name": "Blue Token",
    "color": "#2980b9",
    "url": "https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_blue_new_034e5f7e-6288-4623-ab27-bfea929ce511.webp",
    "type": "image",
    "aspect_ratio": [207, 449]
  },

  // 2. Green Token (Seat 1)
  "pawn_green_new": {
    "name": "Green Token",
    "color": "#27ae60",
    "url": "https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_green_new_9e1c7486-5fd9-4cd0-8c64-dacf0f14650f.webp",
    "type": "image",
    "aspect_ratio": [216, 465]
  },

  // 3. Red Token (Seat 2)
  "pawn_red_new": {
    "name": "Red Token",
    "color": "#c0392b",
    "url": "https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_red_new_3f7aebf7-05e8-40cf-8524-7715fc45f59b.webp",
    "type": "image",
    "aspect_ratio": [200, 435]
  },

  // 4. Yellow Token (Seat 3)
  "pawn_yellow_new": {
    "name": "Yellow Token",
    "color": "#f1c40f",
    "url": "https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_yellow_new_b842d639-1ad7-4099-aadd-55acb56d3d9f.webp",
    "type": "image",
    "aspect_ratio": [193, 420]
  }
};

// --- HOW TO PRELOAD AND DRAW IN 4-WAY GAME CANVAS ---
/*
// 1. In your asset preload function:
const pawnImages = {};
const pawnTokens = [
  { id: 'pawn_0', url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_blue_new_034e5f7e-6288-4623-ab27-bfea929ce511.webp' },   // Blue
  { id: 'pawn_1', url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_green_new_9e1c7486-5fd9-4cd0-8c64-dacf0f14650f.webp' },  // Green
  { id: 'pawn_2', url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_red_new_3f7aebf7-05e8-40cf-8524-7715fc45f59b.webp' },    // Red
  { id: 'pawn_3', url: 'https://d2oir5eh8rty2e.cloudfront.net/assets/images/pawn_yellow_new_b842d639-1ad7-4099-aadd-55acb56d3d9f.webp' }  // Yellow
];

pawnTokens.forEach(token => {
  const img = new Image();
  img.src = token.url;
  img.onload = () => { pawnImages[token.id] = img; };
});

// 2. In your canvas drawPawns function:
// (Draws upright 3D billboarded token with correct aspect ratio)
function drawToken(ctx, playerIdx, x, y, spaceSize, bounce = 0) {
  const img = pawnImages[`pawn_${playerIdx}`];
  if (img && img.complete && img.naturalWidth > 0) {
    const pw = spaceSize * 1.15;
    const ph = pw * (img.naturalHeight / img.naturalWidth);
    ctx.drawImage(img, x - pw / 2, y - ph + 8 - bounce, pw, ph);
  } else {
    // Vector fallback circle
    ctx.beginPath();
    ctx.arc(x, y, spaceSize * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}
*/
