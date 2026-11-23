function installProblemPack(pack, chapters, lessons) {
  const valid = validateProblemPack(pack, lessons);
  for (const problem of valid.problems) {
    const chapterIndex = chapters.findIndex(chapter => chapter.id === problem.chapter);
    const chapter = chapters[chapterIndex];
    const originalIndex = chapter.lessons.findIndex(item => item.id === problem.id);
    const lesson = {
      id: problem.id, title: problem.title, task: problem.prompt, text: problem.description,
      hint: problem.hint, success: problem.correct, moves: problem.lines.map(line => line[0]),
      chapter: chapter.id, chapterNumber: chapterIndex + 1, problem,
      completionMessage: chapter.lessons[originalIndex]?.completionMessage,
    };
    if (originalIndex === -1) chapter.lessons.push(lesson);
    else chapter.lessons[originalIndex] = lesson;
  }
  lessons.splice(0, lessons.length, ...chapters.flatMap((chapter, index) => chapter.lessons.map(lesson => ({
    ...lesson, chapter: chapter.id, chapterNumber: index + 1,
  }))));
}

try {
  installProblemPack(publishedProblemPack, introChapters, introLessons);
} catch (error) {
  console.warn('追加教材を読み込めませんでした。', error.message);
}
