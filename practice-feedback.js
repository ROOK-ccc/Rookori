const practiceMessages = {
  correct: ['正解！', 'answer-check'],
  progress: ['良い手です！ 次の手を考えましょう。', 'answer-check'],
  wrong: ['不正解', 'close'],
  opponent: ['相手の応手を再生中…', 'review'],
  checking: ['別解を確認中…', 'find'],
  hold: ['判定保留', 'find'],
};

function practiceFeedback(id, state, detail = '') {
  const node = byId(id);
  if (!state) {
    node.hidden = true;
    node.replaceChildren();
    delete node.dataset.state;
    return;
  }
  const [label, icon] = practiceMessages[state];
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ui-icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#ui-' + icon);
  svg.append(use);
  node.dataset.state = state;
  node.hidden = false;
  node.replaceChildren(svg, element('strong', label));
  if (detail) node.append(chessTermText('span', detail));
}
