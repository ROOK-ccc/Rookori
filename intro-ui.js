const introScreen = (() => {
  let storage;
  try {
    storage = window.localStorage;
  } catch {
    // 保存できない環境でも、そのタブで学習を続けられます。
  }
  const progress = new IntroProgress(storage);
  const review = introLessons.filter(({ chapter }) => chapter === 'review');
  let lesson;
  let exercise;
  const board = createChessBoard(byId('lesson-board'), byId('lesson-promotion'), {
    position: () => exercise.position,
    canPlay: () => Boolean(lesson.moves && !exercise.solved),
    play: (from, to, promotion) => {
      const correct = exercise.play(from, to, promotion);
      if (!correct || exercise.solved) return grade(correct, lesson.problem?.incorrect ?? 'その手はルール上指せます。課題に合う手を探しましょう。');
      byId('lesson-feedback').textContent = `その手で進めます。相手は ${exercise.position.lastMove.san} と応じました。次の手を指しましょう。`;
      delete byId('lesson-feedback').dataset.correct;
      setHint(false);
      return true;
    },
    onMove: renderExercise,
    feedback: (message) => { byId('lesson-board-message').textContent = message; },
    onIllegal: (message) => grade(false, lesson.problem ? `${message} ${lesson.problem.incorrect}` : message),
    hints: () => byId('lesson-hint').hidden || exercise.solved ? [] : (exercise.nextMoves ?? lesson.moves ?? []),
    canSelect: square => lesson.problem?.mode !== 'piece' || lesson.problem.practiceSquare === square,
  });

  function setHint(visible) {
    byId('lesson-hint').hidden = !visible;
    const toggle = byId('lesson-show-hint');
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.textContent = visible ? 'ヒントを閉じる' : 'ヒントを見る';
  }

  function grade(correct, wrongMessage = 'もう一度試してみましょう。') {
    learningTracker.lessonAnswer(lesson.id, correct);
    progress.answer(lesson, correct);
    const feedback = byId('lesson-feedback');
    feedback.textContent = correct ? `${lesson.completionMessage ?? '正解！'} ${lesson.success}` : `不正解。 ${wrongMessage}`;
    feedback.dataset.correct = String(correct);
    setHint(!correct);
    return correct;
  }

  function renderExercise() {
    const { game, outcome } = exercise.position;
    const turn = byId('lesson-turn');
    turn.dataset.color = game.turn();
    const ending = { stalemate: 'ステイルメイト・引き分け', checkmate: 'チェックメイト', 'insufficient-material': '引き分け' };
    turn.textContent = exercise.solved ? (lesson.problem?.mode === 'piece' ? '課題クリア' : ending[outcome] ?? '課題クリア')
      : `${chessColorNames[game.turn()]}の手番${game.isCheck() ? '（チェック）' : ''}`;
    byId('lesson-move-instructions').hidden = !lesson.moves || exercise.solved;
    for (const button of byId('lesson-choices').children) {
      button.setAttribute('aria-disabled', String(exercise.solved));
    }
    byId('lesson-next').hidden = !exercise.solved;
    const back = byId('lesson-back-move');
    back.hidden = lesson.problem?.kind !== 'sequence';
    back.disabled = !exercise.steps?.length;
    board.render();
  }

  function resetExercise() {
    exercise = lesson.problem ? new ProblemPractice(lesson.problem) : new IntroExercise(lesson);
    setHint(false);
    const feedback = byId('lesson-feedback');
    feedback.textContent = '';
    delete feedback.dataset.correct;
    board.reset();
    renderExercise();
  }

  function open(current) {
    lesson = current;
    progress.enter(lesson);
    const chapter = introChapters[lesson.chapterNumber - 1];
    byId('lesson-chapter').textContent = `第${lesson.chapterNumber}章　${chapter.title}`;
    byId('lesson-title').textContent = lesson.title;
    chessGlossary.annotate(byId('lesson-description'), lesson.text ?? '');
    byId('lesson-description').hidden = !lesson.text;
    const termNote = byId('lesson-terms');
    termNote.hidden = lesson.id !== 'mate';
    if (!termNote.hidden) chessGlossary.annotate(termNote, 'この課題では、エンドゲームでチェックメイトを狙うタクティクスを練習します。');
    byId('lesson-task').textContent = lesson.task;
    byId('lesson-hint').textContent = `ヒント　${lesson.hint}`;
    const choices = byId('lesson-choices');
    choices.hidden = !lesson.choices;
    choices.replaceChildren(...(lesson.choices ?? []).map((choice, index) => {
      const button = element('button', choice, 'answer');
      button.type = 'button';
      button.addEventListener('click', () => {
        if (exercise.solved) return;
        grade(exercise.choose(index));
        renderExercise();
      });
      return button;
    }));
    const next = introLessons[introLessons.indexOf(lesson) + 1];
    byId('lesson-next').href = next ? `#lesson/${next.id}` : '#intro-summary';
    byId('lesson-next').textContent = next ? '次のレッスンへ' : '理解度チェックの結果を見る';
    resetExercise();
    showScreen('intro-lesson', 'lesson-title');
  }

  function overview() {
    const { completed, lesson: lastLesson, quiz } = progress.data;
    const current = introLessons.findIndex(({ id }) => id === lastLesson);
    const unfinished = ({ id }) => !completed.includes(id);
    const next = introLessons.slice(Math.max(0, current)).find(unfinished) ?? introLessons.find(unfinished);
    const resume = byId('intro-resume');
    resume.href = next ? `#lesson/${next.id}` : '#intro-summary';
    resume.textContent = next ? (lastLesson ? '学習を続ける' : '最初のレッスンを始める') : '学習のまとめを見る';
    byId('intro-count').textContent = `${completed.length} / ${introLessons.length} レッスン完了`;
    byId('intro-storage-warning').hidden = progress.available;
    byId('intro-check-results').hidden = !Object.keys(quiz).length;
    byId('intro-clear').disabled = !lastLesson && completed.length === 0 && !Object.keys(quiz).length;
    byId('intro-chapters').replaceChildren(...introChapters.map((chapter, index) => {
      const section = element('section');
      const list = element('ul', null, 'goal-links');
      for (const item of chapter.lessons) {
        const row = element('li');
        const link = element('a', item.title);
        link.href = `#lesson/${item.id}`;
        if (completed.includes(item.id)) link.append(element('span', '完了', 'lesson-done'));
        if (item.id === lastLesson) link.setAttribute('aria-current', 'location');
        row.append(link);
        list.append(row);
      }
      section.append(element('h2', `第${index + 1}章　${chapter.title}`), list);
      return section;
    }));
  }

  function showOverview() {
    byId('intro-clear-prompt').hidden = true;
    byId('intro-storage-status').textContent = '';
    overview();
    showScreen('intro', 'intro-title');
  }

  function showSummary() {
    const quiz = progress.data.quiz;
    const firstCorrect = review.filter(({ id }) => quiz[id]?.firstCorrect).length;
    const solved = review.filter(({ id }) => quiz[id]?.solved).length;
    byId('intro-quiz-score').textContent = `初回正解 ${firstCorrect} / ${review.length} 問・解けた問題 ${solved} / ${review.length} 問`;
    byId('intro-quiz-results').replaceChildren(...review.map(({ id, title }) => {
      const state = quiz[id];
      const item = element('li');
      const link = element('a', title);
      link.href = `#lesson/${id}`;
      const label = !state ? '未回答' : state.firstCorrect ? '初回で正解' : state.solved ? '再挑戦で正解' : '再挑戦できます';
      item.append(link, element('span', label));
      return item;
    }));
    showScreen('intro-summary', 'intro-summary-title');
  }

  byId('lesson-show-hint').addEventListener('click', () => {
    setHint(byId('lesson-hint').hidden);
    board.render();
  });
  byId('lesson-reset').addEventListener('click', resetExercise);
  byId('lesson-back-move').addEventListener('click', () => {
    exercise.back();
    byId('lesson-feedback').textContent = '';
    delete byId('lesson-feedback').dataset.correct;
    setHint(false);
    board.clearSelection();
    renderExercise();
  });
  const prompt = byId('intro-clear-prompt');
  byId('intro-clear').addEventListener('click', () => {
    prompt.hidden = false;
    byId('intro-cancel-clear').focus();
  });
  byId('intro-cancel-clear').addEventListener('click', () => {
    prompt.hidden = true;
    byId('intro-clear').focus();
  });
  byId('intro-confirm-clear').addEventListener('click', () => {
    const cleared = progress.clear();
    prompt.hidden = true;
    overview();
    byId('intro-storage-status').textContent = cleared ? '学習の進捗を削除しました。' : '学習の進捗を削除できませんでした。';
    byId(cleared ? 'intro-resume' : 'intro-clear').focus();
  });

  return { open, showOverview, showSummary, close: board.close };
})();
