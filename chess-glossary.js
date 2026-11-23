const chessGlossary = (() => {
  const popup = byId('chess-term-popup');
  const definitions = byId('chess-term-definitions');
  const glossary = byId('chess-glossary-list');
  const search = byId('chess-term-search');
  const category = byId('chess-term-category');
  const termsById = new Map(chessTerms.map(entry => [entry.id, entry]));
  const termsByName = new Map(chessTerms.flatMap(entry => [
    [entry.term, entry],
    ...(entry.aliases ?? []).filter(name => /^[ァ-ヿ・]+$/.test(name)).map(name => [name, entry]),
  ]));
  const escapePattern = term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp([...termsByName.keys()].sort((a, b) => b.length - a.length)
    .map(term => /^[A-Z]+$/.test(term) ? `\\b${escapePattern(term)}\\b` : escapePattern(term)).join('|'), 'g');
  const headingId = id => `chess-glossary-${id}`;
  let active;
  let pinned = false;
  let returningFocus = false;
  let timer;

  function termLink(entry, label = entry.term) {
    const link = element('a', label, 'text-button');
    link.href = `#glossary/${entry.id}`;
    return link;
  }

  for (const [id, label] of chessTermCategories) {
    const option = element('option', label);
    option.value = id;
    category.append(option);
  }

  for (const { id, definition } of chessTerms) {
    const accessible = element('span', definition);
    accessible.id = `chess-term-definition-${id}`;
    definitions.append(accessible);
  }

  function renderGlossary() {
    const matches = findChessTerms(search.value, category.value);
    byId('chess-glossary-status').textContent = matches.length
      ? `${matches.length}語` : '一致する用語がありません。';
    const sections = [];
    for (const [id, label] of chessTermCategories) {
      const entries = matches.filter(entry => entry.category === id);
      if (!entries.length) continue;
      const section = element('section', null, 'glossary-category');
      const heading = element('h2', label);
      const list = element('dl', null, 'chess-glossary-list');
      for (const entry of entries) {
        const item = element('div', null, 'glossary-entry');
        const term = element('dt', entry.term);
        term.id = headingId(entry.id);
        term.tabIndex = -1;
        const english = element('span', entry.english, 'glossary-english');
        english.lang = 'en';
        term.append(english);
        const description = element('dd');
        description.append(element('p', entry.definition));
        if (entry.aliases?.length) description.append(element('p', `別表記　${entry.aliases.join('・')}`, 'glossary-metadata'));
        if (entry.example) description.append(element('p', entry.example, 'glossary-example'));
        if (entry.related?.length) {
          const related = element('div', null, 'glossary-related');
          related.append(element('span', '関連用語'),
            ...entry.related.map(id => termLink(termsById.get(id))));
          description.append(related);
        }
        item.append(term, description);
        list.append(item);
      }
      section.append(heading, list);
      sections.push(section);
    }
    glossary.replaceChildren(...sections);
  }

  search.addEventListener('input', renderGlossary);
  category.addEventListener('change', renderGlossary);

  function open(id) {
    const entry = termsById.get(id);
    // A deep link always reveals its term, even if the prior search hid it.
    search.value = '';
    category.value = entry?.category ?? '';
    renderGlossary();
    const target = entry ? headingId(entry.id) : 'glossary-title';
    showScreen('glossary', target);
    if (entry) byId(target).scrollIntoView({ block: 'nearest' });
  }

  function close(restoreFocus = false) {
    clearTimeout(timer);
    const button = active;
    button?.setAttribute('aria-expanded', 'false');
    active = null;
    pinned = false;
    popup.hidden = true;
    popup.classList.remove('is-inline', 'is-overlay');
    if (popup.parentElement !== document.body) document.body.append(popup);
    if (restoreFocus && button?.isConnected) {
      returningFocus = true;
      button.focus({ preventScroll: true });
      returningFocus = false;
    }
  }

  function position() {
    if (!active || popup.classList.contains('is-inline')) return;
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
    const margin = 8;
    const gap = 6;
    const popupWidth = popup.offsetWidth;
    const popupHeight = popup.offsetHeight;
    const clamp = (value, max) => Math.max(margin, Math.min(max - margin, value));
    const left = clamp(bounds.left, width - popupWidth);
    const above = bounds.top - popupHeight - gap;
    const below = bounds.bottom + gap;
    const tops = [below, above];
    const sideTop = clamp(bounds.top, height - popupHeight);
    const candidates = [...tops.map(top => [left, top]),
      [bounds.right + gap, sideTop], [bounds.left - popupWidth - gap, sideTop]];
    const screen = active.closest('.screen');
    const protectedRects = [...screen.querySelectorAll(
      '.study-board, .study-actions, .game-move-controls, .lesson-actions, .button, .text-button'
    )].filter(node => !popup.contains(node)).map(node => node.getBoundingClientRect())
      .filter(rect => rect.width && rect.height);
    const safe = candidates.find(([x, y]) => x >= margin && y >= margin
      && x + popupWidth <= width - margin && y + popupHeight <= height - margin
      && !protectedRects.some(rect => x < rect.right && x + popupWidth > rect.left
        && y < rect.bottom && y + popupHeight > rect.top));
    if (!safe && pinned && !popup.contains(document.activeElement)) {
      const block = active.closest('p, h1, h2, h3, dl');
      if (block) {
        popup.classList.remove('is-overlay');
        popup.classList.add('is-inline');
        block.after(popup);
        return;
      }
    }
    popup.classList.toggle('is-overlay', !safe);
    const [x, y] = safe ?? [left, clamp(below + popupHeight <= height - margin ? below : above, height - popupHeight)];
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
  }

  function show(button, entry, keepOpen = false) {
    if (active !== button) close();
    clearTimeout(timer);
    if (active !== button) {
      active = button;
      const link = termLink(entry, '用語集で詳しく見る');
      link.setAttribute('aria-label', `${entry.term}を用語集で詳しく見る`);
      // The glossary link is in the flow after the text so it can be reached without scripting Tab order.
      const block = button.closest('p, h1, h2, h3, dl');
      if (block) block.after(popup);
      const label = element('strong', entry.term);
      label.setAttribute('aria-hidden', 'true');
      const definition = element('p', entry.definition);
      definition.setAttribute('aria-hidden', 'true');
      popup.replaceChildren(label, definition, link);
    }
    pinned = keepOpen || pinned;
    active.setAttribute('aria-expanded', 'true');
    popup.hidden = false;
    position();
  }

  function scheduleClose() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!pinned && !popup.matches(':hover, :focus-within') && !active?.matches(':hover, :focus-visible')) close();
    }, 180);
  }

  function trigger(entry, text) {
    const button = element('button', text, 'chess-term');
    button.type = 'button';
    button.setAttribute('aria-describedby', `chess-term-definition-${entry.id}`);
    button.setAttribute('aria-controls', popup.id);
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse' && !event.buttons && !pinned && !popup.contains(document.activeElement)) {
        show(button, entry);
      }
    });
    button.addEventListener('pointerleave', scheduleClose);
    button.addEventListener('focus', () => {
      if (!returningFocus && button.matches(':focus-visible')) show(button, entry);
    });
    button.addEventListener('blur', scheduleClose);
    button.addEventListener('click', () => {
      if (active === button && pinned) close();
      else show(button, entry, true);
    });
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' || active !== button) return;
      event.preventDefault();
      show(button, entry, true);
      popup.querySelector('a').focus();
    });
    return button;
  }

  function annotate(target, value) {
    const fragment = document.createDocumentFragment();
    const seen = new Set();
    let end = 0;
    for (const match of value.matchAll(pattern)) {
      const [term] = match;
      const entry = termsByName.get(term);
      if (seen.has(entry.id) || term === 'チェック' && value.slice(0, match.index).endsWith('理解度')) continue;
      fragment.append(value.slice(end, match.index), trigger(entry, term));
      seen.add(entry.id);
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
  document.addEventListener('focusin', event => {
    if (active && !active.contains(event.target) && !popup.contains(event.target)) {
      pinned = false;
      scheduleClose();
    }
  });
  document.addEventListener('keydown', event => {
    if (active && event.key === 'Escape') {
      close(popup.contains(document.activeElement));
      event.preventDefault();
    }
  });
  window.addEventListener('scroll', position, { capture: true, passive: true });
  window.addEventListener('resize', position);
  return { annotate, close, open };
})();

function chessTermText(tag, text, className) {
  return chessGlossary.annotate(element(tag, null, className), text);
}
