const introStorageKey = 'chesspath.intro.v1';

class IntroExercise {
  constructor(lesson) {
    this.lesson = lesson;
    this.position = new OpeningStudy([], lesson.fen);
    this.solved = false;
  }

  play(from, to, promotion) {
    const uci = from + to + (promotion ?? '');
    if (this.solved || !this.lesson.moves?.includes(uci)) return false;
    this.solved = this.position.play(from, to, promotion);
    return this.solved;
  }

  choose(index) {
    if (this.solved || !this.lesson.choices) return false;
    this.solved = index === this.lesson.answer;
    return this.solved;
  }
}

class IntroProgress {
  constructor(storage) {
    this.storage = storage;
    this.available = Boolean(storage);
    this.data = { completed: [], chapter: null, lesson: null, quiz: {} };
    if (!this.available) return;
    let raw;
    try {
      raw = storage.getItem(introStorageKey);
    } catch {
      this.available = false;
      return;
    }
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      const current = introLessons.find(({ id }) => id === saved?.lesson);
      this.data.lesson = current?.id ?? null;
      this.data.chapter = current?.chapter ?? null;
      for (const { id, chapter } of introLessons) {
        if (Array.isArray(saved?.completed) && saved.completed.includes(id)) this.data.completed.push(id);
        const result = saved?.quiz?.[id];
        if (chapter === 'review' && Number.isSafeInteger(result?.attempts) && result.attempts > 0
            && typeof result.firstCorrect === 'boolean' && typeof result.solved === 'boolean') {
          this.data.quiz[id] = { attempts: result.attempts, firstCorrect: result.firstCorrect, solved: result.solved };
        }
      }
    } catch {
      // 壊れた保存内容からでも新しく始められます。
    }
  }

  enter(lesson) {
    this.data.lesson = lesson.id;
    this.data.chapter = lesson.chapter;
    this.save();
  }

  answer(lesson, correct) {
    if (lesson.chapter === 'review') {
      const last = this.data.quiz[lesson.id];
      this.data.quiz[lesson.id] = {
        attempts: (last?.attempts ?? 0) + 1,
        firstCorrect: last?.firstCorrect ?? correct,
        solved: Boolean(last?.solved || correct),
      };
    }
    if (correct && !this.data.completed.includes(lesson.id)) this.data.completed.push(lesson.id);
    this.save();
  }

  save() {
    try {
      this.storage?.setItem(introStorageKey, JSON.stringify(this.data));
      this.available = Boolean(this.storage);
    } catch {
      this.available = false;
    }
  }

  clear() {
    try {
      this.storage?.removeItem(introStorageKey);
      this.available = Boolean(this.storage);
    } catch {
      this.available = false;
      return false;
    }
    this.data = { completed: [], chapter: null, lesson: null, quiz: {} };
    return true;
  }
}
