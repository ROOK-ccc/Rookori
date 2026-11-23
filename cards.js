const cardCanvas = document.getElementById('share-preview');
const saveCard = document.getElementById('save-card');
const shareCard = document.getElementById('share-card');
const cardStatus = document.getElementById('card-status');
let cardFile;
let cardRevision = 0;

const cardGold = '#edcf97';
const cardInk = '#151219';
const cardIvory = '#fff6e7';
const cardJapaneseFont = '"Yu Gothic", "Hiragino Sans", Meiryo, "Noto Sans CJK JP", sans-serif';

// オリジナルのSVGパス。共通の座標で描くので、駒のフォントや画像は不要です。
const piecePaths = {
  knight: 'M22 78H77L73 66C72 51 64 34 51 26L50 13L39 22L28 20L29 33L13 53L22 62L37 57L45 48C45 61 36 67 26 71Z',
  queen: 'M25 78H75L70 66L82 32L65 45L50 23L35 45L18 32L30 66Z M16 25a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z M50 17a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z M84 25a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z',
  bishop: 'M27 78H73L68 67L60 61C76 54 73 39 64 30L50 16L36 30C27 39 24 54 40 61L32 67Z M50 13a4 4 0 1 0 0-8a4 4 0 1 0 0 8Z',
  rook: 'M23 78H77L73 69L65 62V43L75 34V18H64V27H56V18H44V27H36V18H25V34L35 43V62L27 69Z',
  pawn: 'M24 78H76L71 69C61 63 58 56 58 48H65V40H57C64 37 67 28 63 21C58 11 42 11 37 21C33 28 36 37 43 40H35V48H42C42 56 39 63 29 69Z',
  king: 'M22 78H78L73 66L64 59C79 49 77 34 64 35L54 40V24H64V16H54V7H46V16H36V24H46V40L36 35C23 34 21 49 36 59L27 66Z',
};
const pieceDetails = {
  knight: 'M34 35L39 33 M25 73H73',
  queen: 'M32 63H68 M29 73H71',
  bishop: 'M57 29L46 43 M36 63H64',
  rook: 'M35 43H65 M33 66H67',
  pawn: 'M40 47H60 M33 69H67',
  king: 'M36 60H64 M29 72H71',
};

const metalFinishes = {
  gold: ['#fff5d8', '#e4bd7b', '#a1673c', '#62402c'],
  silver: ['#f3fbff', '#c8d8e9', '#698099', '#36465e'],
  copper: ['#fff0db', '#e5a587', '#a96057', '#693943'],
};

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function cardText(ctx, text, x, y, size, maxWidth, weight = 700, family = cardJapaneseFont) {
  ctx.font = `${weight} ${size}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > maxWidth) ctx.font = `${weight} ${Math.floor(size * maxWidth / width)}px ${family}`;
  ctx.fillText(text, x, y);
}

function drawCardBackground(ctx, card) {
  ctx.fillStyle = cardInk;
  ctx.fillRect(0, 0, 1200, 1500);
  const ambient = ctx.createRadialGradient(610, 694, 30, 610, 694, 760);
  ambient.addColorStop(0, card.color + '55');
  ambient.addColorStop(0.57, card.color + '24');
  ambient.addColorStop(1, card.color + '00');
  ctx.fillStyle = ambient;
  ctx.fillRect(40, 185, 1120, 900);

  ctx.strokeStyle = '#a98b5c';
  ctx.lineWidth = 2;
  ctx.strokeRect(38, 38, 1124, 1424);
  ctx.strokeStyle = '#edd29c34';
  ctx.strokeRect(50, 50, 1100, 1400);
  ctx.strokeStyle = cardGold;
  for (const [x, y, dx, dy] of [[38, 38, 1, 1], [1162, 38, -1, 1], [38, 1462, 1, -1], [1162, 1462, -1, -1]]) {
    line(ctx, x, y, x + 72 * dx, y);
    line(ctx, x, y, x, y + 72 * dy);
  }
}

const artworkPatterns = {
  rays(ctx) {
    for (let index = 0; index < 24; index++) {
      const angle = index * Math.PI / 12;
      const x = Math.cos(angle);
      const y = Math.sin(angle);
      const span = index % 3 ? 335 : 450;
      line(ctx, x * 188, y * 188, x * span, y * span);
    }
  },
  streaks(ctx) {
    for (let index = -4; index <= 4; index++) {
      const y = index * 58;
      line(ctx, -525, y + 148, 460 - Math.abs(index * 48), y - 185);
      if (index % 2 === 0) line(ctx, -375, y + 82, 535, y - 247);
    }
  },
  rings(ctx) {
    for (const [radius, tilt] of [[285, 0], [307, 0], [355, -0.36], [385, 0.32]]) {
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * (tilt ? .65 : .86), tilt, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  lattice(ctx) {
    for (const [width, height] of [[438, 430], [523, 508], [610, 580]]) {
      ctx.strokeRect(-width / 2, -height / 2, width, height);
    }
    for (let offset = -420; offset <= 420; offset += 70) {
      line(ctx, offset, -290, offset, 290);
      line(ctx, -424, offset, 424, offset);
    }
  },
  arches(ctx) {
    for (const radius of [212, 277, 342, 407]) {
      ctx.beginPath();
      ctx.moveTo(-radius, 290);
      ctx.lineTo(-radius, -42);
      ctx.arc(0, -42, radius, Math.PI, 0);
      ctx.lineTo(radius, 290);
      ctx.stroke();
    }
  },
};

function drawArtwork(ctx, card) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(70, 400, 1060, 594);
  ctx.clip();
  ctx.save();
  ctx.translate(600, 682);
  ctx.rotate(card.pattern === 'lattice' ? Math.PI / 4 + card.angle : card.angle);
  const light = ctx.createRadialGradient(0, 0, 125, 0, 0, 500);
  light.addColorStop(0, card.color + '17');
  light.addColorStop(0.48, card.color + 'b0');
  light.addColorStop(1, card.color + '00');
  ctx.strokeStyle = light;
  ctx.lineWidth = card.pattern === 'streaks' ? 4 : 3;
  artworkPatterns[card.pattern](ctx);
  ctx.restore();

  const floor = ctx.createLinearGradient(0, 830, 0, 990);
  floor.addColorStop(0, card.color + '42');
  floor.addColorStop(1, card.color + '00');
  ctx.fillStyle = floor;
  // Expand the squares towards the viewer to suggest the plane of a chessboard.
  for (let row = 0; row < 5; row++) {
    const y = 835 + row * row * 8;
    const nextY = 835 + (row + 1) * (row + 1) * 8;
    const tile = 61 + row * 17;
    const nextTile = tile + 17;
    for (let column = -5; column < 5; column++) {
      if ((column + row) % 2 !== 0) continue;
      ctx.beginPath();
      ctx.moveTo(600 + column * tile, y);
      ctx.lineTo(600 + (column + 1) * tile, y);
      ctx.lineTo(600 + (column + 1) * nextTile, nextY);
      ctx.lineTo(600 + column * nextTile, nextY);
      ctx.fill();
    }
  }

  ctx.save();
  ctx.translate(0, 740);
  ctx.scale(1, .19);
  const shadow = ctx.createRadialGradient(610, 910, 12, 610, 910, 263);
  shadow.addColorStop(0, '#050305dc');
  shadow.addColorStop(1, '#05030500');
  ctx.fillStyle = shadow;
  ctx.fillRect(338, 647, 543, 531);
  ctx.restore();
  drawPiece(ctx, card);
  ctx.restore();
}

function drawPiece(ctx, card) {
  const path = new Path2D(piecePaths[card.motif]);
  const [highlight, midtone, lower, edge] = metalFinishes[card.finish];
  ctx.save();
  ctx.translate(594, 661);
  ctx.rotate(card.angle);
  ctx.scale(6.15, 6.15);
  ctx.translate(-50, card.motif === 'king' ? -43 : -46);
  ctx.lineJoin = 'round';
  ctx.fillStyle = edge;
  for (let depth = 5; depth >= 1; depth--) {
    ctx.save();
    ctx.translate(depth * .74, depth * .65);
    ctx.fill(path);
    ctx.restore();
  }

  const metal = ctx.createLinearGradient(16, 14, 71, 84);
  metal.addColorStop(0, highlight);
  metal.addColorStop(.33, midtone);
  metal.addColorStop(.53, highlight);
  metal.addColorStop(.76, midtone);
  metal.addColorStop(1, lower);
  ctx.fillStyle = metal;
  ctx.fill(path);
  const rim = ctx.createLinearGradient(16, 10, 77, 84);
  rim.addColorStop(0, cardIvory);
  rim.addColorStop(.52, highlight);
  rim.addColorStop(1, edge);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 1.15;
  ctx.stroke(path);
  ctx.strokeStyle = '#251b24a0';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.stroke(new Path2D(pieceDetails[card.motif]));
  const base = new Path2D('M22 81H78L82 88Q82 91 79 91H21Q18 91 18 88Z');
  const baseMetal = ctx.createLinearGradient(0, 81, 0, 91);
  baseMetal.addColorStop(0, highlight);
  baseMetal.addColorStop(.2, midtone);
  baseMetal.addColorStop(1, edge);
  ctx.fillStyle = baseMetal;
  ctx.fill(base);
  ctx.restore();
}

function drawCardTitle(ctx, card) {
  ctx.textBaseline = 'middle';
  ctx.fillStyle = cardGold;
  ctx.beginPath();
  ctx.roundRect(84, 83, 73, 73, 12);
  ctx.fill();
  ctx.save();
  ctx.translate(87, 89);
  ctx.scale(.66, .66);
  ctx.fillStyle = cardInk;
  ctx.fill(new Path2D(piecePaths.rook));
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.fillStyle = cardIvory;
  cardText(ctx, 'ChessPath', 177, 105, 47, 420, 700, 'Georgia, serif');
  ctx.fillStyle = cardGold;
  cardText(ctx, 'チェス16タイプ診断', 178, 149, 35, 490, 600);
  ctx.textAlign = 'right';
  cardText(ctx, card.typeCode, 1112, 123, 67, 338, 700, 'Georgia, serif');

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e4c68d5c';
  line(ctx, 84, 188, 1116, 188);
  ctx.textAlign = 'center';
  ctx.fillStyle = cardIvory;
  cardText(ctx, card.typeName, 600, 273, 105, 1024);
  ctx.fillStyle = '#f1dabb';
  cardText(ctx, card.tagline, 600, 376, 56, 1032, 600);
}

function drawCardTraits(ctx, card) {
  ctx.textAlign = 'left';
  ctx.fillStyle = cardGold;
  cardText(ctx, '4軸の特徴', 87, 1035, 40, 400);
  card.traits.forEach(({ letter, label }, index) => {
    const x = 84 + index % 2 * 528;
    const y = 1080 + Math.floor(index / 2) * 159;
    ctx.beginPath();
    ctx.roundRect(x, y, 504, 138, 18);
    ctx.fillStyle = '#25212a';
    ctx.fill();
    ctx.strokeStyle = '#e4c68d64';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(x + 17, y + 19, 105, 100, 12);
    ctx.fillStyle = card.color + '26';
    ctx.fill();
    ctx.fillStyle = cardGold;
    ctx.textAlign = 'center';
    cardText(ctx, letter, x + 69, y + 70, 67, 85, 700, 'Georgia, serif');
    ctx.fillStyle = cardIvory;
    ctx.textAlign = 'left';
    cardText(ctx, label, x + 143, y + 70, 54, 337);
  });
}

function drawCard(canvas, card) {
  const ctx = canvas.getContext('2d');
  drawCardBackground(ctx, card);
  drawArtwork(ctx, card);
  drawCardTitle(ctx, card);
  drawCardTraits(ctx, card);
}

function renderShareCard(code) {
  const card = getCardData(code);
  const revision = ++cardRevision;
  cardCanvas.setAttribute('aria-label', [
    'ChessPath チェス16タイプ診断', card.typeCode, card.typeName, card.tagline,
    ...card.traits.map(({ letter, label }) => `${letter} ${label}`),
  ].join('、'));
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
