// 各軸から1問ずつ取り出し、A/S → T/P → C/L → I/D の順を3周します。
function getQuestions(mode) {
  return modes[mode].questions.A.flatMap((_, round) =>
    axes.map(({ codes: [left, right] }) => {
      const [prompt, optionA, optionB] = modes[mode].questions[left][round];
      return { axis: left, prompt, choices: [optionA, optionB], codes: [left, right] };
    }),
  );
}

function scoreAxisAnswers(questions, answers) {
  const points = Object.fromEntries(axes.flatMap(({ codes }) => codes.map((code) => [code, 0])));

  for (const [index, question] of questions.entries()) {
    const answer = answers[index];
    if (answer !== 0 && answer !== 1) {
      throw new Error('採点には全問の回答が必要です。');
    }
    points[question.codes[answer]] += 1;
  }

  return axes.map(({ codes: [left, right] }) => [points[left], points[right]]);
}

function scoreAnswers(questions, answers) {
  return scoreAxisAnswers(questions, answers).map(([left, right], index) => axes[index].codes[left > right ? 0 : 1]).join('');
}
