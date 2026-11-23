const openingHistoryKey = 'chesspath.opening-history.v1';

function openingDefaultColor(opening) {
  return opening.slot === 'white' ? 'w' : 'b';
}

function openingNotation(opening) {
  const study = new OpeningStudy(opening.moves);
  return opening.moves.map((_, ply) => {
    study.advance();
    return `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}${study.lastMove.san}`;
  });
}

class OpeningPractice {
  constructor(opening, color) {
    this.opening = opening;
    this.color = color;
    this.study = new OpeningStudy(opening.moves);
    this.errors = [];
    this.trained = 0;
    this.firstCorrect = 0;
    this.unassistedFirstCorrect = 0;
    this.hints = 0;
    this.hintLevel = 0;
    this.missed = false;
    this.total = opening.moves.filter((_, ply) => (ply % 2 ? 'b' : 'w') === color).length;
    this.id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    this.date = new Date().toISOString();
  }

  get complete() { return this.study.complete; }
  get learnerTurn() { return !this.complete && this.study.game.turn() === this.color; }
  get expected() { return this.opening.moves[this.study.step]; }

  opponentMove() {
    if (!this.complete && !this.learnerTurn) return this.study.advance();
    return false;
  }

  wrong(move = null) {
    if (!this.learnerTurn) return;
    this.errors.push({ ply: this.study.step, expected: this.expected, played: move });
    this.missed = true;
  }

  play(from, to, promotion) {
    if (!this.learnerTurn) return false;
    const uci = from + to + (promotion ?? '');
    if (uci !== this.expected || !this.study.play(from, to, promotion)) {
      this.wrong(uci);
      return false;
    }
    this.trained++;
    if (!this.missed) {
      this.firstCorrect++;
      if (!this.hintLevel) this.unassistedFirstCorrect++;
    }
    this.hintLevel = 0;
    this.missed = false;
    return true;
  }

  revealHint() {
    if (this.learnerTurn && this.hintLevel < 3) {
      this.hintLevel++;
      this.hints++;
    }
    return this.hintLevel;
  }

  record() {
    const { opening, color, id, date, trained, firstCorrect, unassistedFirstCorrect, hints, complete } = this;
    return {
      id, date, openingId: opening.parentId ?? opening.id, variationId: opening.parentId ? opening.id : null,
      lineId: opening.id + ':main-v1', color, trained, firstCorrect, unassistedFirstCorrect, hints, complete,
      mistakes: this.errors.length, errors: this.errors.map(error => ({ ...error })),
    };
  }
}

class OpeningPracticeHistory {
  constructor(storage) {
    this.storage = storage;
    this.records = [];
    this.available = Boolean(storage);
    this.refresh();
  }

  refresh() {
    try {
      const data = JSON.parse(this.storage?.getItem(openingHistoryKey) ?? 'null');
      if (data?.schemaVersion === 1 && Array.isArray(data.records)) {
        const merged = new Map(this.records.map(record => [record.id, record]));
        for (const record of data.records) {
          if (record && typeof record.id === 'string' && typeof record.openingId === 'string'
              && ['w', 'b'].includes(record.color) && typeof record.date === 'string'
              && !Number.isNaN(Date.parse(record.date))) merged.set(record.id, record);
        }
        this.records = [...merged.values()];
      }
    } catch {
      this.available = false;
    }
  }

  save(record) {
    this.refresh();
    const existing = this.records.findIndex(item => item.id === record.id);
    if (existing !== -1) this.records[existing] = record;
    else this.records.push(record);
    try {
      this.storage?.setItem(openingHistoryKey, JSON.stringify({ schemaVersion: 1, records: this.records }));
      this.available = Boolean(this.storage);
    } catch {
      this.available = false;
    }
  }

  summaries() {
    this.refresh();
    const groups = new Map();
    for (const record of this.records) {
      const id = record.variationId ?? record.openingId;
      const key = JSON.stringify([id, record.color, record.lineId]);
      if (!groups.has(key)) groups.set(key, { id, color: record.color, count: 0, latest: record, errors: new Map() });
      const group = groups.get(key);
      group.count++;
      if (Date.parse(record.date) >= Date.parse(group.latest.date)) group.latest = record;
      for (const error of Array.isArray(record.errors) ? record.errors : []) {
        if (Number.isInteger(error?.ply)) group.errors.set(error.ply, (group.errors.get(error.ply) ?? 0) + 1);
      }
    }
    return [...groups.values()].sort((a, b) => (b.latest.mistakes ?? 0) - (a.latest.mistakes ?? 0)
      || (b.latest.hints ?? 0) - (a.latest.hints ?? 0) || Date.parse(a.latest.date) - Date.parse(b.latest.date));
  }
}
