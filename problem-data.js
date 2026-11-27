const problemSchemaVersion = 1;
const problemKinds = { square: '指定のマスへ動かす', goal: '目的に合う手を探す', sequence: '複数の手を指す' };
const problemLevels = { intro: '入門', beginner: '初級', intermediate: '中級' };
const positionFiles = 'abcdefgh';

function parsePositionFen(fen) {
  const fields = String(fen).trim().split(/\s+/);
  const [placement, turn, castling, ep, halfmove, fullmove] = fields;
  const error = () => { throw new Error('FENを読み込めません。駒の配置、手番、権利、手数を確認してください。'); };
  if (fields.length !== 6 || !/^[wb]$/.test(turn) || !/^(?:-|K?Q?k?q?)$/.test(castling)
      || !/^(?:-|[a-h][36])$/.test(ep) || !/^\d+$/.test(halfmove) || !/^\d+$/.test(fullmove)
      || !Number.isSafeInteger(Number(halfmove)) || !Number.isSafeInteger(Number(fullmove)) || Number(fullmove) < 1) error();
  const rows = placement.split('/');
  const squares = {};
  if (rows.length !== 8) error();
  rows.forEach((row, index) => {
    if (!/^[prnbqkPRNBQK1-8]+$/.test(row) || /\d\d/.test(row)) error();
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
      } else {
        if (file > 7) error();
        squares[positionFiles[file] + (8 - index)] = {
          type: char.toLowerCase(), color: char === char.toUpperCase() ? 'w' : 'b',
        };
        file += 1;
      }
    }
    if (file !== 8) error();
  });
  if (ep !== '-' && ep[1] !== (turn === 'w' ? '6' : '3')) error();
  return { squares, turn, castling, ep, halfmove: Number(halfmove), fullmove: Number(fullmove) };
}

function positionMatrix(squares) {
  return Array.from({ length: 8 }, (_, row) => Array.from(positionFiles, file => squares[file + (8 - row)] ?? null));
}

function formatPositionFen({ squares, turn, castling, ep, halfmove, fullmove }) {
  const placement = positionMatrix(squares).map(row => row.map(piece => {
    if (!piece) return '_';
    return piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
  }).join('').replace(/_+/g, empty => empty.length)).join('/');
  return [placement, turn, castling || '-', ep, halfmove, fullmove].join(' ');
}

function problemStart(fen) {
  const position = parsePositionFen(fen);
  const normalized = formatPositionFen(position);
  const { ok } = chessRules.validateFen(normalized);
  if (!ok) throw new Error('白黒のキングを1個ずつ置き、最後の段に残っているポーンなどがないか確認してください。');
  for (const color of ['w', 'b']) {
    const pieces = Object.values(position.squares).filter(piece => piece.color === color);
    if (pieces.length > 16 || pieces.filter(piece => piece.type === 'p').length > 8) {
      throw new Error('白黒それぞれ、駒は16個まで、ポーンは8個までです。');
    }
  }
  const game = new chessRules.Chess(normalized);
  const opponent = game.board().flat().find(piece => piece?.type === 'k' && piece.color !== game.turn());
  if (game.isAttacked(opponent.square, game.turn())) {
    throw new Error('手番ではない側のキングが攻撃されています。配置か手番を見直してください。');
  }
  const requiredCastlingPieces = {
    K: ['w', 'e1', 'h1'], Q: ['w', 'e1', 'a1'],
    k: ['b', 'e8', 'h8'], q: ['b', 'e8', 'a8'],
  };
  for (const right of position.castling.replace('-', '')) {
    const [color, king, rook] = requiredCastlingPieces[right];
    if (game.get(king)?.type !== 'k' || game.get(king)?.color !== color
        || game.get(rook)?.type !== 'r' || game.get(rook)?.color !== color) {
      throw new Error('キャスリング権に対応するキングとルークを元のマスに置いてください。');
    }
  }
  if (position.ep !== '-') {
    const file = position.ep[0];
    const white = position.turn === 'w';
    const pawn = game.get(file + (white ? '5' : '4'));
    if (pawn?.type !== 'p' || pawn.color === position.turn || game.get(position.ep)
        || game.get(file + (white ? '7' : '2')) || position.halfmove !== 0) {
      throw new Error('アンパッサンは直前にポーンが2マス進んだ局面です。ポーンと手数の欄を確認してください。');
    }
  }
  return normalized;
}

function splitProblemMove(uci) {
  return [uci.slice(0, 2), uci.slice(2, 4), uci[4]];
}

class ProblemPosition extends OpeningStudy {
  constructor(fen, mode) {
    super([], fen);
    this.mode = mode;
  }
  get mayMove() {
    return this.mode === 'piece' && this.game.isInsufficientMaterial() || !this.game.isGameOver();
  }
  legalMoves(square) {
    return this.mayMove ? this.game.moves({ square, verbose: true }) : [];
  }
}

function baseLessonProblem(lesson) {
  return {
    id: lesson.id, title: lesson.title, chapter: lesson.chapter, difficulty: 'intro',
    kind: 'goal', mode: 'standard', goal: 'match', practiceSquare: '',
    description: lesson.text, prompt: lesson.task, hint: lesson.hint, correct: lesson.success,
    incorrect: '課題に合う手を探しましょう。', fen: lesson.fen ?? chessRules.DEFAULT_POSITION,
    lines: lesson.moves.map(uci => [uci]), tags: [],
  };
}

function validateProblem(problem, baseLessons) {
  if (!problem || typeof problem !== 'object') throw new Error('問題データの形式を確認してください。');
  const value = {};
  const strings = ['id', 'title', 'chapter', 'difficulty', 'kind', 'mode', 'goal', 'description',
    'practiceSquare', 'prompt', 'fen', 'hint', 'correct', 'incorrect'];
  for (const key of strings) value[key] = typeof problem[key] === 'string' ? problem[key].trim() : '';
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(value.id)) throw new Error('問題IDの形式が正しくありません。');
  if (['title', 'prompt', 'fen', 'hint', 'correct', 'incorrect'].some(key => !value[key])) {
    throw new Error('タイトル・問題文・FEN・ヒント・正解解説・不正解解説を入力してください。');
  }
  if (!baseLessons.some(lesson => lesson.chapter === value.chapter) || !Object.hasOwn(problemLevels, value.difficulty)
      || !Object.hasOwn(problemKinds, value.kind) || !['standard', 'piece'].includes(value.mode)
      || !['match', 'mate'].includes(value.goal)) throw new Error('章・難易度・問題形式・判定方法を選んでください。');
  const original = baseLessons.find(lesson => lesson.id === value.id);
  if (original && (!original.moves || original.chapter !== value.chapter)) {
    throw new Error('既存教材のIDと章を確認してください。編集できる既存問題は駒を動かす課題です。');
  }
  const lines = problem.lines;
  if (!Array.isArray(lines) || !lines.length) throw new Error('正解手や手順を1つ以上登録してください。');
  value.fen = problemStart(value.fen);
  const starts = new Set();
  const replies = new Map();
  const complete = new Set();
  const continuations = new Set();
  value.lines = lines.map((line, routeIndex) => {
    if (!Array.isArray(line) || (value.kind === 'sequence' ? line.length < 3 || line.length % 2 === 0 : line.length !== 1)) {
      throw new Error('単手は1手、複数手は「自分・相手・自分」の順で3手以上登録してください。');
    }
    const study = new ProblemPosition(value.fen, value.mode);
    line.forEach((uci, index) => {
      if (typeof uci !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci) || !study.play(...splitProblemMove(uci))) {
        throw new Error(`手順${routeIndex + 1}の${index + 1}手目は、この局面では指せません。`);
      }
      if (index % 2 === 1) {
        const prefix = line.slice(0, index).join(' ');
        if (replies.has(prefix) && replies.get(prefix) !== uci) {
          throw new Error('同じ手順の途中で相手の応手が分かれています。共通部分の応手を1つにしてください。');
        }
        replies.set(prefix, uci);
      }
      if (index < line.length - 1) continuations.add(line.slice(0, index + 1).join(' '));
    });
    if (value.goal === 'mate' && study.outcome !== 'checkmate') {
      throw new Error(`手順${routeIndex + 1}の最後がチェックメイトになっていません。`);
    }
    const key = line.join(' ');
    if (complete.has(key)) throw new Error('同じ正解や手順が重複しています。');
    complete.add(key);
    starts.add(line[0].slice(0, 2));
    return [...line];
  });
  if ([...complete].some(key => continuations.has(key))) throw new Error('途中で終わる手順が重複しています。');
  if (value.mode === 'piece' && (!/^[a-h][1-8]$/.test(value.practiceSquare)
      || value.kind === 'sequence' || starts.size !== 1 || !starts.has(value.practiceSquare))) {
    throw new Error('駒の練習では、指定した開始マスから指す1手を登録してください。');
  }
  if (value.mode === 'standard') value.practiceSquare = '';
  if (!Array.isArray(problem.tags) || problem.tags.some(tag => typeof tag !== 'string')) throw new Error('タグの形式を確認してください。');
  value.tags = [...new Set(problem.tags.map(tag => tag.trim()).filter(Boolean))];
  return value;
}

function validateProblemPack(pack, baseLessons) {
  if (pack?.schemaVersion !== problemSchemaVersion || !Array.isArray(pack.problems)) {
    throw new Error('JSONのバージョンまたは問題一覧の形式を確認してください。');
  }
  const seen = new Set();
  return { schemaVersion: problemSchemaVersion, problems: pack.problems.map(problem => {
    const value = validateProblem(problem, baseLessons);
    if (seen.has(value.id)) throw new Error(`問題ID「${value.id}」が重複しています。`);
    seen.add(value.id);
    return value;
  }) };
}

function problemCourseScript(pack) {
  const json = JSON.stringify(pack, null, 2).replace(/</g, '\\u003c');
  return `// Rookoriの公開教材データ。編集は問題エディターから行えます。\nconst publishedProblemPack = ${json};\n`;
}

class ProblemPractice {
  constructor(problem) {
    this.problem = problem;
    this.position = new ProblemPosition(problem.fen, problem.mode);
    this.steps = [];
  }

  get routes() {
    return this.problem.lines.filter(line =>
      this.position.played.every(({ lan }, index) => line[index] === lan));
  }

  get nextMoves() {
    return [...new Set(this.routes.map(line => line[this.position.step]).filter(Boolean))];
  }

  get solved() {
    return this.routes.some(line => line.length === this.position.step);
  }

  play(from, to, promotion, deferReply = false) {
    const uci = from + to + (promotion ?? '');
    if (!this.nextMoves.includes(uci) || !this.position.play(from, to, promotion)) return false;
    this.steps.push(1);
    if (!deferReply) this.reply();
    return true;
  }

  reply() {
    if (!this.solved && this.steps.at(-1) === 1) {
      this.position.play(...splitProblemMove(this.nextMoves[0]));
      this.steps[this.steps.length - 1]++;
    }
  }

  back() {
    for (let index = this.steps.pop() ?? 0; index > 0; index -= 1) this.position.undo();
  }
}
