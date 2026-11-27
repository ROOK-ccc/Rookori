const chessTermCategories = [
  ['rules', '基本ルール'],
  ['tactics', '戦術'],
  ['strategy', '戦略'],
  ['opening', 'オープニング'],
  ['analysis', '対局分析'],
];

const chessTerms = [
  { id: 'turn', category: 'rules', term: '手番', english: 'Side to move', definition: '次に指す側のことです。対局は白から始まり、白と黒が交互に指します。' },
  { id: 'legal-move', category: 'rules', term: '合法手', english: 'Legal move', definition: 'チェスのルールに従って指せる手のことです。駒の動きが正しくても、自分のキングが攻撃されたままになる手は指せません。', related: ['check'] },
  { id: 'check', category: 'rules', term: 'チェック', english: 'Check', aliases: ['王手'], definition: 'キングが相手の駒に攻撃されている状態です。キングを動かす、攻撃している駒を取る、間に駒を置くなどして対処します。', related: ['checkmate'] },
  { id: 'interposition', category: 'rules', term: '合駒', english: 'Interposition', definition: 'ルーク、ビショップ、クイーンのチェックに対し、キングと攻撃している駒の間に駒を置いてチェックを防ぐことです。', related: ['check'] },
  { id: 'checkmate', category: 'rules', term: 'チェックメイト', english: 'Checkmate', aliases: ['メイト', '詰み'], definition: 'キングが攻撃されていて、どの手を指してもその攻撃から逃れられない状態です。チェックメイトを指した側の勝ちです。', related: ['check', 'stalemate'] },
  { id: 'stalemate', category: 'rules', term: 'ステイルメイト', english: 'Stalemate', aliases: ['ステールメイト'], definition: '手番の側がチェックされていないのに、ルール上指せる手が一つもない状態です。対局は引き分けになります。', related: ['draw', 'checkmate'] },
  { id: 'castling', category: 'rules', term: 'キャスリング', english: 'Castling', definition: 'キングとルークを一手で動かす特別な手です。まだ動かしていないキングとルークの間が空いていて、キングがチェックされず、攻撃されているマスを通ったり止まったりしないときに指せます。', example: '白のキング側ではキングがe1からg1へ、ルークがh1からf1へ動きます。', related: ['king-safety'] },
  { id: 'en-passant', category: 'rules', term: 'アンパッサン', english: 'En passant', aliases: ['アン・パッサン', 'アンパサン'], definition: '相手のポーンが初めて2マス進んで自分のポーンの横に並んだとき、そのポーンを1マスだけ進んだものとして取れる特別な手です。直後の手番でだけ指せます。' },
  { id: 'promotion', category: 'rules', term: '昇格', english: 'Promotion', aliases: ['プロモーション'], definition: 'ポーンが盤の反対側まで進んだとき、クイーン・ルーク・ビショップ・ナイトのどれかに替わることです。すでに同じ種類の駒が盤上にあっても選べます。', related: ['passed-pawn', 'endgame'] },
  { id: 'draw', category: 'rules', term: '引き分け', english: 'Draw', aliases: ['ドロー'], definition: 'どちらも勝たずに対局が終わることです。ステイルメイトや合意など、複数の成立条件があります。', related: ['stalemate', 'insufficient-material', 'threefold-repetition'] },
  { id: 'insufficient-material', category: 'rules', term: '駒不足', english: 'Insufficient material', definition: '残った駒では、どちらも相手をチェックメイトできない状態です。例えば両者にキングしか残っていなければ引き分けです。' },
  { id: 'threefold-repetition', category: 'rules', term: '三回同一局面', english: 'Threefold repetition', aliases: ['千日手', '3回同一局面'], definition: '同じ側が手番で、駒の配置と指せる手も同じ局面が3回現れることです。通常の対局では引き分けを申告できます。' },
  { id: 'tactics', category: 'tactics', term: 'タクティクス', english: 'Tactics', aliases: ['戦術'], definition: '数手で駒を取ったり、チェックメイトを狙ったりする手の組み合わせです。', related: ['fork', 'pin', 'discovered-attack'] },
  { id: 'fork', category: 'tactics', term: 'フォーク', english: 'Fork', aliases: ['両取り'], definition: '一つの駒で相手の駒を二つ以上同時に狙う手です。例えばナイトで相手のキングとクイーンを攻撃し、チェックに対処させてからクイーンを取れます。', related: ['tactics'] },
  { id: 'pin', category: 'tactics', term: 'ピン', english: 'Pin', definition: 'ある駒を動かすと、その後ろにいる大切な駒が攻撃される状態です。後ろにキングがいると、手前の駒はキングを攻撃にさらすようには動けません。', related: ['skewer'] },
  { id: 'skewer', category: 'tactics', term: 'スキュア', english: 'Skewer', aliases: ['スキュアー', '串刺し'], definition: '一直線に並んだ二つの駒のうち、手前の大切な駒を先に攻撃し、それが逃げた後で奥の駒を取る手です。', related: ['pin'] },
  { id: 'discovered-attack', category: 'tactics', term: 'ディスカバードアタック', english: 'Discovered attack', aliases: ['発見攻撃', 'ディスカバード・アタック'], definition: '手前の味方の駒を動かして、その後ろにいるルークやビショップなどの攻撃を通す戦術です。キングに攻撃が届く場合は開き王手と呼びます。', related: ['double-check'] },
  { id: 'recapture', category: 'tactics', term: '取り返し', english: 'Recapture', definition: '相手に味方の駒を取られた直後に、別の味方の駒で、その相手の駒を取ることです。', related: ['reply'] },
  { id: 'double-check', category: 'tactics', term: '両王手', english: 'Double check', aliases: ['ダブルチェック'], definition: '一手で二つの駒から相手のキングを同時に攻撃することです。対処するにはキングを動かす必要があります。', related: ['check', 'discovered-attack'] },
  { id: 'deflection', category: 'tactics', term: 'ディフレクション', english: 'Deflection', aliases: ['守備駒のそらし'], definition: '相手の守り駒を、守っているマスや駒から引き離す手です。例えば守り役のルークを別の場所に誘い、守られていた駒を取ります。' },
  { id: 'back-rank-mate', category: 'tactics', term: 'バックランク・メイト', english: 'Back-rank mate', aliases: ['バックランクメイト'], definition: 'キングが自分の駒などに遮られて最も奥の列から逃げられず、ルークやクイーンの攻撃でチェックメイトになる形です。', related: ['checkmate', 'king-safety'] },
  { id: 'center', category: 'strategy', term: '中央', english: 'Center', aliases: ['センター', 'Centre'], definition: '盤の真ん中にあるd4・e4・d5・e5の4マスです。駒やポーンで中央を押さえると、盤の両側に駒を動かしやすくなります。', related: ['development'] },
  { id: 'piece-control', category: 'strategy', term: '駒の利き', english: 'Piece control', definition: '駒が攻撃しているマスや、味方の駒を守っているマスのことです。例えばルークの利きは、駒に遮られるまで縦横に伸びます。' },
  { id: 'development', category: 'strategy', term: '展開', english: 'Development', definition: 'ナイトやビショップなどを初期位置から働きやすい場所へ出すことです。序盤は同じ駒を繰り返し動かす前に、ほかの駒も使えるようにします。', related: ['center', 'tempo'] },
  { id: 'tempo', category: 'strategy', term: 'テンポ', english: 'Tempo', definition: '指し手一手分の時間や手数のことです。例えば駒を展開しながら相手のクイーンを攻撃すると、相手は逃げるために一手使うことがあります。' },
  { id: 'pawn-structure', category: 'strategy', term: 'ポーン構造', english: 'Pawn structure', aliases: ['ポーンの形'], definition: '盤上のポーンの並び方です。ポーンは後ろに戻れないので、どこを守れてどこに弱いマスができるかが、その後の作戦に関わります。', related: ['isolated-pawn', 'passed-pawn'] },
  { id: 'isolated-pawn', category: 'strategy', term: '孤立ポーン', english: 'Isolated pawn', aliases: ['アイソレーテッド・ポーン'], definition: '両隣の縦列に味方のポーンがなく、別のポーンに守ってもらえないポーンです。守るにはほかの種類の駒を使う必要があります。' },
  { id: 'passed-pawn', category: 'strategy', term: 'パスポーン', english: 'Passed pawn', aliases: ['通過ポーン', 'パス・ポーン'], definition: '前方の同じ縦列と両隣の縦列に、前進を止められる相手のポーンがいないポーンです。相手は別の種類の駒を使って昇格を防ぐ必要があります。', related: ['promotion', 'endgame'] },
  { id: 'king-safety', category: 'strategy', term: 'キングの安全', english: 'King safety', definition: 'キングが攻撃されにくい状態を作ることです。序盤ではキャスリングや、キングの前に守りのポーンを残すことが役立ちます。', related: ['castling'] },
  { id: 'endgame', category: 'strategy', term: 'エンドゲーム', english: 'Endgame', aliases: ['終盤', 'エンド・ゲーム'], definition: '駒が少なくなった対局の終盤です。キングを積極的に動かしたり、ポーンの昇格を目指したりします。', related: ['promotion', 'passed-pawn'] },
  { id: 'opening', category: 'opening', term: 'オープニング', english: 'Opening', aliases: ['序盤'], definition: '対局の序盤に、駒をどの順で動かして形を作るかという作戦です。イタリアン・ゲームなど、よく使われる形には名前が付いています。', related: ['development', 'variation', 'eco'] },
  { id: 'variation', category: 'opening', term: 'バリエーション', english: 'Variation', aliases: ['ヴァリエーション', '分岐'], definition: '同じオープニングから分かれた別の手順です。相手が選んだ手や自分の駒の出し方で、別の形に進みます。' },
  { id: 'gambit', category: 'opening', term: 'ギャンビット', english: 'Gambit', aliases: ['ガンビット'], definition: '序盤にポーンなどを取らせる代わりに、駒を早く出したり中央を使いやすくしたりする作戦です。相手が取らない手順もあります。', example: 'クイーンズ・ギャンビットでは、白が序盤にcポーンを出して黒の中央のポーンに働きかけます。', related: ['opening', 'center'] },
  { id: 'fianchetto', category: 'opening', term: 'フィアンケット', english: 'Fianchetto', aliases: ['フィアンケット'], definition: '端に近いポーンを1マス進め、空いたマスにビショップを置く駒組みです。例えば白のポーンをg3へ動かし、ビショップをg2に置くと長い斜めの線を狙えます。' },
  { id: 'transposition', category: 'opening', term: '手順前後', english: 'Transposition', aliases: ['トランスポジション', '手順の入れ替え'], definition: '別の順番で指した手が、同じ盤面と手番に行き着くことです。Rookoriのオープニング判定では、駒の配置や指せる手の条件も照合します。', related: ['opening', 'fen'] },
  { id: 'eco', category: 'opening', term: 'ECOコード', english: 'Encyclopaedia of Chess Openings', aliases: ['ECO', 'ECO コード'], definition: 'オープニングを整理するための、英字一つと数字二つの分類番号です。例えばB20はシシリアン・ディフェンスの基本形を表します。' },
  { id: 'pgn', category: 'analysis', term: 'PGN', english: 'Portable Game Notation', aliases: ['棋譜ファイル'], definition: '対局で指した手や対局者名などを記録できるテキスト形式です。対局サイトの「棋譜をコピー」や「.pgnをダウンロード」から取得できます。', related: ['san', 'fen'] },
  { id: 'fen', category: 'analysis', term: 'FEN', english: 'Forsyth–Edwards Notation', definition: '駒の配置や次に指す側など、一つの盤面の状態を文字で表す形式です。棋譜の途中の局面も、この文字列から再現できます。', related: ['position', 'pgn'] },
  { id: 'san', category: 'analysis', term: 'SAN', english: 'Standard Algebraic Notation', aliases: ['標準代数式表記'], definition: '指した手を短く記録する表し方です。たとえばNf3は、ナイトがf3のマスへ動いたことを表します。', related: ['pgn', 'uci'] },
  { id: 'uci', category: 'analysis', term: 'UCI', english: 'Universal Chess Interface', aliases: ['座標表記'], definition: 'チェスソフトが解析エンジンとやり取りする決まりです。手を送るときには、e2からe4へ指す手をe2e4と書くように、移動元と移動先を並べます。', related: ['san'] },
  { id: 'position', category: 'analysis', term: '局面', english: 'Position', definition: '対局のある時点の状態です。駒の配置に加え、次に指す側やキャスリングができるかなども含みます。', related: ['fen', 'turn'] },
  { id: 'reply', category: 'analysis', term: '応手', english: 'Reply', definition: '相手の着手に対して指す手のことです。初心者は、自分が指したい手を見つけたら、相手の応手を一つ考えてみましょう。', related: ['recapture'] },
  { id: 'evaluation', category: 'analysis', term: '評価値', english: 'Evaluation', aliases: ['エンジン評価', 'センチポーン'], definition: '解析エンジンなどが、どちらがどの程度有利かを数値で示した目安です。白を基準に表示する場合、+1.0は白にとってポーン約1個分の有利さを表します。' },
  { id: 'best-move', category: 'analysis', term: '最善手', english: 'Best move', definition: 'ある局面で最も良いと考えられる手です。解析エンジンが示す候補は、調べる深さや条件によって変わることがあります。', related: ['evaluation'] },
];

function normalizeChessTerm(value) {
  return value.normalize('NFKD').toLowerCase()
    .replace(/[ァ-ヶ]/g, letter => String.fromCharCode(letter.charCodeAt(0) - 0x60))
    .replace(/\p{Mark}/gu, mark => mark === '\u3099' || mark === '\u309a' ? mark : '')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}]/gu, '').normalize('NFC');
}

function findChessTerms(query, category = '') {
  const key = normalizeChessTerm(query);
  return chessTerms.filter(entry => (!category || entry.category === category) && (!key ||
    [entry.term, entry.english, ...(entry.aliases ?? []), entry.definition, entry.example ?? '']
      .some(value => normalizeChessTerm(value).includes(key))));
}
