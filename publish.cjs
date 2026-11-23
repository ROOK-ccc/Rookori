const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parseArgs } = require('node:util');

try {
  const { values, positionals: [input] } = parseArgs({
    options: { 'print-output': { type: 'boolean' } },
    allowPositionals: true,
  });
  const sourceFiles = ['vendor/chess.js', 'opening-study.js', 'intro-data.js', 'problem-data.js'];
  if (!input) sourceFiles.push('course-problems.js');
  const source = sourceFiles.map(file => fs.readFileSync(path.join(__dirname, file), 'utf8')).join('\n');
  const context = vm.createContext({});
  if (input) context.publishedProblemPack = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8'));
  const courseScript = vm.runInContext(`${source}\nproblemCourseScript(validateProblemPack(publishedProblemPack, introLessons))`, context);
  const files = [
    'index.html', 'styles.css', 'app.js', 'navigation.js',
    'data.js', 'scoring.js', 'card-data.js', 'cards.js', 'result-links.js',
    'opening-data.js', 'opening-scoring.js', 'opening-study.js', 'opening-study-ui.js',
    'opening-variations.js', 'opening-memory.js', 'opening-memory-ui.js',
    'learning.js', 'learning-insights.js', 'learning-progress-ui.js', 'learning-ui.js', 'site-menu.js',
    'game-review.js', 'opening-classification.js', 'game-library.js', 'game-review-ui.js', 'game-review.css',
    'chess-glossary.js',
    'intro-data.js', 'intro-course.js', 'intro-ui.js', 'chess-board.js',
    'problem-data.js', 'problem-curriculum.js',
    'vendor/chess.js', 'vendor/chess.LICENSE.txt',
    ...['w', 'b'].flatMap(color => [...'KQRBNP'].map(piece => `pieces/cburnett/${color}${piece}.svg`)),
    'pieces/cburnett/LICENSE.txt',
  ];
  const output = fs.mkdtempSync(path.join(__dirname, 'chesspath-public-'));
  for (const file of files) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(__dirname, file), target);
  }
  fs.writeFileSync(path.join(output, 'course-problems.js'), courseScript);
  console.log(values['print-output'] ? output : `公開用フォルダーを作成しました。 ${output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
