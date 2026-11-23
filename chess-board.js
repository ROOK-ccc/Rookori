const chessColorNames = { w: '白', b: '黒' };

function createChessBoard(board, promotionDialog, {
  position, play, onMove, feedback, onIllegal = feedback,
  isFlipped = () => false, canPlay = () => !position().outcome,
  editSquare, editDrag, editSelected = () => null, hints = () => [], canSelect = () => true,
}) {
  const colorNames = chessColorNames;
  const pieceNames = { p: 'ポーン', n: 'ナイト', b: 'ビショップ', r: 'ルーク', q: 'クイーン', k: 'キング' };
  const keyOffsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  let selected;
  let cursor = 'a8';
  let promotion;
  let drag;
  let skipPointerClick = false;

  function clearSelection() {
    selected = null;
    feedback('');
  }

  function close() {
    endDrag();
    promotion = null;
    if (promotionDialog?.open) promotionDialog.close();
  }

  function reset() {
    close();
    cursor = 'a8';
    clearSelection();
  }

  function renderBoard() {
    endDrag();
    const study = position();
    const hadFocus = board.contains(document.activeElement);
    const positions = study.game.board().flat().map((piece, index) => ({
      piece,
      square: 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8)),
      dark: (index % 8 + Math.floor(index / 8)) % 2 === 1,
    }));
    if (isFlipped()) positions.reverse();
    const playable = canPlay();
    const currentSelection = editSquare ? editSelected() : selected;
    const targets = new Set(!editSquare && playable && selected ? study.legalMoves(selected).map(({ to }) => to) : []);
    const hinted = hints();
    const checked = study.game.isCheck?.() ? study.game.turn() : null;
    const last = study.lastMove;
    const buttons = positions.map(({ piece, square, dark }, index) => {
      const button = element('button', null, 'study-square');
      button.type = 'button';
      button.dataset.square = square;
      if (!playable) button.setAttribute('aria-disabled', 'true');
      button.tabIndex = square === cursor ? 0 : -1;
      button.classList.toggle('dark-square', dark);
      button.classList.toggle('last-move', Boolean(last && (last.from === square || last.to === square)));
      button.classList.toggle('last-from', last?.from === square);
      button.classList.toggle('last-to', last?.to === square);
      button.classList.toggle('legal-target', targets.has(square));
      button.classList.toggle('draggable-piece', Boolean(piece && playable && (
        editSquare ? editDrag : piece.color === study.game.turn() && canSelect(square)
      )));
      const inCheck = piece?.type === 'k' && piece.color === checked;
      const hintFrom = hinted.some(move => move.slice(0, 2) === square);
      const hintTo = hinted.some(move => move.slice(2, 4) === square);
      button.classList.toggle('checked-square', inCheck);
      button.classList.toggle('hint-from', hintFrom);
      button.classList.toggle('hint-to', hintTo);
      button.setAttribute('aria-pressed', String(square === currentSelection));
      const description = piece ? `${colorNames[piece.color]}の${pieceNames[piece.type]}` : '空きマス';
      const marks = [square, description];
      if (targets.has(square)) marks.push('移動できます');
      if (inCheck) marks.push('チェック');
      if (hintFrom) marks.push('ヒントの移動元');
      if (hintTo) marks.push('ヒントの移動先');
      if (last?.from === square) marks.push('直前の移動元');
      if (last?.to === square) marks.push('直前の移動先');
      button.setAttribute('aria-label', marks.join('、'));
      if (piece) {
        const image = element('img', null, 'study-piece');
        image.alt = '';
        image.draggable = false;
        image.src = `pieces/cburnett/${piece.color}${piece.type.toUpperCase()}.svg`;
        button.append(image);
      }
      if (index % 8 === 0 || index >= 56) {
        const rank = index % 8 === 0 ? square[1] : '';
        const file = index >= 56 ? square[0] : '';
        const coordinates = element('span', null, 'study-coordinates');
        coordinates.setAttribute('aria-hidden', 'true');
        coordinates.append(element('span', rank), element('span', file));
        button.append(coordinates);
      }
      return button;
    });
    board.replaceChildren(...buttons);
    if (hadFocus) buttons.find((button) => button.dataset.square === cursor)?.focus({ preventScroll: true });
  }

  function tryMove(from, to, piece) {
    const moved = play(from, to, piece);
    if (moved) {
      clearSelection();
      onMove();
    } else {
      renderBoard();
    }
  }

  function pickSquare(square) {
    if (!canPlay()) return;
    cursor = square;
    if (editSquare) {
      editSquare(square);
      renderBoard();
      return;
    }
    const study = position();
    if (selected === square) {
      clearSelection();
    } else if (study.game.get(square)?.color === study.game.turn()) {
      if (!canSelect(square)) {
        feedback('課題の駒を選んでください。');
        return;
      }
      selected = square;
      feedback(study.legalMoves(square).length ? '印のついたマスに移動できます。' : 'この駒は今は動けません。');
    } else if (selected) {
      dropMove(selected, square);
      return;
    } else {
      feedback(`${colorNames[study.game.turn()]}の駒を先に選んでください。`);
    }
    renderBoard();
  }

  function dropMove(from, to) {
    const choices = position().legalMoves(from).filter(move => move.to === to);
    if (choices.some(move => move.promotion)) {
      promotion = { from, to };
      promotionDialog.returnValue = '';
      promotionDialog.showModal();
    } else if (choices.length) {
      tryMove(from, to);
    } else {
      onIllegal('そのマスには移動できません。', from, to);
      renderBoard();
    }
  }

  function endDrag() {
    if (!drag) return;
    const current = drag;
    drag = null;
    if (current.image) {
      skipPointerClick = true;
      current.image.remove();
      for (const square of board.children) square.classList.remove('drag-source', 'drag-target', 'drag-legal');
    }
    if (current.button.hasPointerCapture(current.id)) current.button.releasePointerCapture(current.id);
  }

  function squareAt(event) {
    const square = document.elementFromPoint(event.clientX, event.clientY)?.closest('.study-square');
    return square?.parentElement === board ? square : null;
  }

  board.addEventListener('pointerdown', event => {
    if (drag || !event.isPrimary || event.button !== 0) return;
    skipPointerClick = false;
    const button = event.target.closest('.study-square');
    const movable = button?.classList.contains('draggable-piece');
    if (!button || (!movable && event.pointerType !== 'touch') || !canPlay() || promotion) return;
    drag = { id: event.pointerId, button, movable, x: event.clientX, y: event.clientY };
  });
  window.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    if (!drag.image) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7) return;
      if (!drag.movable) {
        endDrag();
        return;
      }
      drag.button.setPointerCapture(event.pointerId);
      drag.image = drag.button.querySelector('img').cloneNode();
      drag.image.className = 'drag-piece';
      drag.image.style.width = `${drag.button.clientWidth}px`;
      document.body.append(drag.image);
      drag.button.classList.add('drag-source');
      if (!editSquare) {
        const moves = position().legalMoves(drag.button.dataset.square);
        for (const square of board.children) {
          square.classList.toggle('drag-legal', moves.some(move => move.to === square.dataset.square));
        }
      }
    }
    drag.image.style.left = `${event.clientX}px`;
    drag.image.style.top = `${event.clientY}px`;
    const target = squareAt(event);
    if (target !== drag.target) {
      drag.target?.classList.remove('drag-target');
      target?.classList.add('drag-target');
      drag.target = target;
    }
  });
  window.addEventListener('pointerup', event => {
    if (drag?.id !== event.pointerId) return;
    const from = drag.button.dataset.square;
    const to = squareAt(event)?.dataset.square;
    const tap = event.pointerType === 'touch' && !drag.image && to === from
      && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 7;
    const dropped = Boolean(drag.image);
    endDrag();
    if (tap) {
      // タッチでは指を離した時点でタップを確定し、後続の互換クリックを抑止します。
      skipPointerClick = true;
      pickSquare(from);
      return;
    }
    if (!dropped || !to || to === from || !canPlay()) return;
    cursor = to;
    if (editSquare) {
      editDrag(from, to);
      renderBoard();
    } else {
      selected = from;
      dropMove(from, to);
    }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) {
    board.addEventListener(type, event => {
      if (drag?.id === event.pointerId) endDrag();
    });
  }
  window.addEventListener('resize', endDrag);
  window.addEventListener('blur', endDrag);

  board.addEventListener('focusin', (event) => {
    const square = event.target.dataset.square;
    if (!square) return;
    if (square !== cursor) {
      board.querySelector('[tabindex="0"]')?.setAttribute('tabindex', '-1');
      cursor = square;
    }
    event.target.tabIndex = 0;
  });
  board.addEventListener('click', (event) => {
    if (skipPointerClick && (event.detail !== 0 || event.pointerType === 'touch')) return;
    const square = event.target.closest('button')?.dataset.square;
    if (square) pickSquare(square);
  });
  board.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      endDrag();
      clearSelection();
      renderBoard();
      return;
    }
    const offset = keyOffsets[event.key];
    if (!Array.isArray(offset)) return;
    event.preventDefault();
    const cells = Array.from(board.children);
    const index = cells.indexOf(event.target);
    const column = index % 8 + offset[0];
    const row = Math.floor(index / 8) + offset[1];
    if (column >= 0 && column < 8 && row >= 0 && row < 8) cells[row * 8 + column].focus();
  });
  promotionDialog?.addEventListener('close', () => {
    if (!promotion) return;
    const { from, to } = promotion;
    promotion = null;
    if (promotionDialog.returnValue) tryMove(from, to, promotionDialog.returnValue);
    board.querySelector(`[data-square="${cursor}"]`)?.focus({ preventScroll: true });
  });

  return { render: renderBoard, reset, close, clearSelection };
}
