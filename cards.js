const cardCanvas = document.getElementById('share-preview');
const saveCard = document.getElementById('save-card');
const shareCard = document.getElementById('share-card');
const cardStatus = document.getElementById('card-status');
let cardFile;
let cardRevision = 0;

const cardGold = '#cbb27c';

// オリジナルのSVGパス。共通の座標で描くので、駒のフォントや画像は不要です。
const piecePaths = {
  knight: 'M22 78H77L73 66C72 51 64 34 51 26L50 13L39 22L28 20L29 33L13 53L22 62L37 57L45 48C45 61 36 67 26 71Z',
  queen: 'M25 78H75L70 66L82 32L65 45L50 23L35 45L18 32L30 66Z M16 25a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z M50 17a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z M84 25a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z',
  bishop: 'M27 78H73L68 67L60 61C76 54 73 39 64 30L50 16L36 30C27 39 24 54 40 61L32 67Z M50 13a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z',
  rook: 'M23 78H77L73 69L65 62V43L75 34V18H64V27H56V18H44V27H36V18H25V34L35 43V62L27 69Z',
  pawn: 'M24 78H76L71 69C61 63 58 56 58 48H65V40H57C64 37 67 28 63 21C58 11 42 11 37 21C33 28 36 37 43 40H35V48H42C42 56 39 63 29 69Z',
};
const pieceDetails = {
  knight: 'M34 35L39 33 M25 73H73',
  queen: 'M32 63H68 M29 73H71',
  bishop: 'M57 29L46 43 M36 63H64',
  rook: 'M35 43H65 M33 66H67',
  pawn: 'M40 47H60 M33 69H67',
};

function drawCardBackground(ctx, card) {
  const glow = ctx.createRadialGradient(600, 620, 50, 600, 640, 910);
  glow.addColorStop(0, card.backgroundColor);
  glow.addColorStop(1, '#111113');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1200, 1500);

  ctx.save();
  ctx.translate(600, 625);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = card.accentColor;
  ctx.globalAlpha = 0.06;
  for (let row = 0; row < 8; row += 1) {
    for (let col = row % 2; col < 8; col += 2) {
      ctx.fillRect(col * 86 - 344, row * 86 - 344, 86, 86);
    }
  }
  ctx.restore();

  ctx.strokeStyle = cardGold;
  ctx.lineWidth = 2;
  ctx.strokeRect(42, 42, 1116, 1416);
  ctx.globalAlpha = 0.34;
  ctx.lineWidth = 1;
  ctx.strokeRect(54, 54, 1092, 1392);
  ctx.globalAlpha = 1;
}

function drawEmblem(ctx, card) {
  ctx.save();
  ctx.translate(600, 620);
  for (const [radius, color, opacity] of [[258, cardGold, 0.5], [237, card.accentColor, 0.9], [216, cardGold, 0.23]]) {
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = cardGold;
  for (let turn = 0; turn < 4; turn += 1) {
    ctx.fill(new Path2D('M0 -268L7 -258L0 -248L-7 -258Z'));
    ctx.rotate(Math.PI / 2);
  }

  ctx.scale(4.35, 4.35);
  ctx.translate(-50, -45);
  const metal = ctx.createLinearGradient(0, 12, 0, 86);
  metal.addColorStop(0, '#fff0ce');
  metal.addColorStop(0.53, cardGold);
  metal.addColorStop(1, card.accentColor);
  ctx.fillStyle = metal;
  ctx.fill(new Path2D(piecePaths[card.motif]));
  ctx.fill(new Path2D('M23 83H77L81 90H19Z'));
  ctx.strokeStyle = '#251d1f';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(pieceDetails[card.motif]));
  ctx.restore();
}

function drawCard(canvas, card) {
  const ctx = canvas.getContext('2d');
  drawCardBackground(ctx, card);
  drawEmblem(ctx, card);
  const japaneseFont = '"Yu Gothic", "Hiragino Sans", Meiryo, "Noto Sans CJK JP", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = cardGold;
  ctx.font = '700 44px Georgia, serif';
  ctx.fillText('ChessPath', 600, 136);
  ctx.fillRect(550, 165, 100, 2);
  ctx.fillStyle = card.accentColor;
  ctx.font = '700 76px Georgia, serif';
  ctx.fillText(card.typeCode, 600, 279);

  ctx.fillStyle = '#fff5e4';
  ctx.font = `700 100px ${japaneseFont}`;
  ctx.fillText(card.typeName, 600, 1007, 1010);
  ctx.font = `500 56px ${japaneseFont}`;
  ctx.fillText(card.shortTagline, 600, 1122, 1000);
  ctx.fillStyle = '#e1cfae';
  ctx.font = `600 48px ${japaneseFont}`;
  ctx.fillText(card.axesLabels.slice(0, 2).join('  /  '), 600, 1235, 980);
  ctx.fillText(card.axesLabels.slice(2).join('  /  '), 600, 1301, 980);
  ctx.fillStyle = cardGold;
  ctx.font = '700 32px Georgia, serif';
  ctx.fillText('ChessPath', 600, 1401);
}

function renderShareCard(code) {
  const card = getCardData(code);
  const revision = ++cardRevision;
  cardCanvas.dataset.theme = card.cardTheme;
  cardCanvas.setAttribute('aria-label', ['ChessPath', card.typeCode, card.typeName, card.shortTagline, ...card.axesLabels].join('、'));
  cardStatus.textContent = '';
  cardFile = undefined;
  saveCard.disabled = true;
  shareCard.hidden = true;

  drawCard(cardCanvas, card);
  cardCanvas.toBlob((blob) => {
    if (revision !== cardRevision) return;
    if (!blob) {
      cardStatus.textContent = 'PNG画像を作成できませんでした。';
      return;
    }
    cardFile = new File([blob], `ChessPath-${code}.png`, { type: 'image/png' });
    saveCard.disabled = false;
    shareCard.hidden = !navigator.share || !navigator.canShare?.({ files: [cardFile] });
    if (shareCard.hidden) {
      cardStatus.textContent = '画像を共有するには、PNG画像を保存してSNSに添付してください。';
    }
  }, 'image/png');
}

saveCard.addEventListener('click', () => {
  if (!cardFile) return;
  const url = URL.createObjectURL(cardFile);
  const link = document.createElement('a');
  link.href = url;
  link.download = cardFile.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
});

shareCard.addEventListener('click', async () => {
  if (!cardFile) return;
  try {
    await navigator.share({ files: [cardFile] });
  } catch (error) {
    if (error.name !== 'AbortError') cardStatus.textContent = '共有できませんでした。PNG画像を保存して共有できます。';
  }
});
