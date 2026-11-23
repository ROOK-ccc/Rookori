const chessTerms = [
  { id: 'opening', term: 'オープニング', definition: '対局の序盤に、駒をどの順で動かして形を作るかという作戦です。イタリアン・ゲームなど、よく使われる形には名前が付いています。' },
  { id: 'gambit', term: 'ギャンビット', definition: '序盤にポーンなどを取らせる代わりに、駒を早く出したり中央を使いやすくしたりする作戦です。相手が取らない手順もあります。' },
  { id: 'tactics', term: 'タクティクス', definition: '数手で駒を取ったり、メイトを狙ったりする具体的な手の組み合わせです。例えば、一つの駒で相手の二つの駒を同時に攻撃する「フォーク」があります。' },
  { id: 'endgame', term: 'エンドゲーム', definition: '駒が少なくなった対局の終盤です。キングを積極的に動かしたり、ポーンの昇格を狙ったりします。' },
  { id: 'pgn', term: 'PGN', definition: '対局で指した手や対局者名などを記録できるテキスト形式です。対局サイトの「棋譜をコピー」や「.pgnをダウンロード」から取得できます。' },
  { id: 'fen', term: 'FEN', definition: '駒の配置や次に指す側など、一つの盤面の状態を文字で表す形式です。棋譜の途中の局面も、この文字列から再現できます。' },
  { id: 'eco', term: 'ECOコード', definition: 'オープニングを整理するための、英字一つと数字二つの分類番号です。例えば B20 はシシリアン・ディフェンスの基本形を表すコードです。' },
  { id: 'variation', term: 'バリエーション', definition: '同じオープニングから分かれた別の手順です。相手が選んだ手や、自分の駒の出し方によって分かれます。' },
  { id: 'checkmate', term: 'チェックメイト', definition: 'キングが攻撃されていて、どの手を指してもその攻撃から逃れられない状態です。チェックメイトをした側の勝ちです。' },
];

const chessGlossary = (() => {
  const popup = byId('chess-term-popup');
  const definitions = byId('chess-term-definitions');
  const glossary = byId('chess-glossary-list');
  const escapePattern = term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const termsByName = new Map(chessTerms.map(entry => [entry.term, entry]));
  const pattern = new RegExp(chessTerms.map(({ term }) => term)
    .sort((a, b) => b.length - a.length)
    .map(term => /^[A-Z]+$/.test(term) ? `\\b${escapePattern(term)}\\b` : escapePattern(term)).join('|'), 'g');
  let active;
  let pinned = false;
  let timer;

  for (const { id, term, definition } of chessTerms) {
    const accessible = element('span', definition);
    accessible.id = `chess-term-definition-${id}`;
    definitions.append(accessible);
    const item = element('div');
    item.append(element('dt', term), element('dd', definition));
    glossary.append(item);
  }

  function close() {
    clearTimeout(timer);
    active?.setAttribute('aria-expanded', 'false');
    active = null;
    pinned = false;
    popup.hidden = true;
  }

  function position() {
    if (!active) return;
    if (!active.isConnected || !active.getClientRects().length) {
      close();
      return;
    }
    const bounds = active.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    if (bounds.bottom <= 0 || bounds.top >= height || bounds.right <= 0 || bounds.left >= width) {
      close();
      return;
    }
    const left = Math.max(8, Math.min(bounds.left, width - popup.offsetWidth - 8));
    const below = bounds.bottom + 6;
    const above = bounds.top - popup.offsetHeight - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${below + popup.offsetHeight <= height - 8 ? below : Math.max(8, above)}px`;
  }

  function show(button, definition, keepOpen = false) {
    if (active !== button) close();
    clearTimeout(timer);
    active = button;
    pinned = keepOpen || pinned;
    active.setAttribute('aria-expanded', 'true');
    popup.replaceChildren(element('strong', button.textContent), element('p', definition));
    popup.hidden = false;
    position();
  }

  function scheduleClose() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!pinned && !popup.matches(':hover') && !active?.matches(':hover, :focus-visible')) close();
    }, 130);
  }

  function trigger({ id, term, definition }) {
    const button = element('button', term, 'chess-term');
    button.type = 'button';
    button.setAttribute('aria-describedby', `chess-term-definition-${id}`);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') show(button, definition);
    });
    button.addEventListener('pointerleave', scheduleClose);
    button.addEventListener('focus', () => {
      if (button.matches(':focus-visible')) show(button, definition);
    });
    button.addEventListener('blur', () => {
      if (active !== button) return;
      pinned = false;
      scheduleClose();
    });
    button.addEventListener('click', () => {
      if (active === button && pinned) close();
      else show(button, definition, true);
    });
    return button;
  }

  function annotate(target, value) {
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let end = 0;
    for (const match of value.matchAll(pattern)) {
      const [term] = match;
      if (seen.has(term)) continue;
      fragment.append(value.slice(end, match.index), trigger(termsByName.get(term)));
      seen.add(term);
      end = match.index + term.length;
    }
    fragment.append(value.slice(end));
    if (active && target.contains(active)) close();
    target.replaceChildren(fragment);
    return target;
  }

  for (const target of document.querySelectorAll('[data-chess-terms]')) annotate(target, target.textContent);
  popup.addEventListener('pointerenter', () => clearTimeout(timer));
  popup.addEventListener('pointerleave', scheduleClose);
  document.addEventListener('pointerdown', event => {
    if (active && !active.contains(event.target) && !popup.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') {
      close();
      event.preventDefault();
    }
  });
  window.addEventListener('scroll', position, { capture: true, passive: true });
  window.addEventListener('resize', position);
  return { annotate, close };
})();

function chessTermText(tag, text, className) {
  return chessGlossary.annotate(element(tag, null, className), text);
}
