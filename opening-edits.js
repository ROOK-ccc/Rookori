const openingEditFields = {
  name: '日本語名称', english: '英語名称', aliases: '別名（1行に1件）',
  description: '概要', level: '対象レベル', prerequisites: '前提知識',
  tip: '基本の狙い', white: '白番の狙い', black: '黒番の狙い', placement: '駒の配置',
  strengths: '長所', weakness: '短所・注意点', mistake: 'よくあるミス', practical: '実戦で意識する点',
  faq: 'よくある疑問と回答', references: '参考文献・出典', seoTitle: 'SEOタイトル',
  seoDescription: 'メタディスクリプション', updated: '更新日（YYYY-MM-DD）',
};

function validateOpeningEdits(pack, entries, { draft = false } = {}) {
  const needObject = value => value && typeof value === 'object' && !Array.isArray(value);
  if (!needObject(pack)) throw new Error('教材データはオブジェクト形式で入力してください。');
  const known = new Map(entries.map(entry => [entry.id, entry]));
  for (const [id, edit] of Object.entries(pack)) {
    const base = known.get(id);
    if (!base || !needObject(edit)) throw new Error('不明な教材ID ' + id);
    for (const [key, value] of Object.entries(edit)) {
      const allowBlank = draft || !['name', 'english', 'description', 'explanations'].includes(key);
      const validText = text => typeof text === 'string' && (allowBlank || text.trim()) && text.length <= 4000;
      const list = key === 'aliases' || key === 'explanations';
      const valid = list ? Array.isArray(value) && value.every(validText)
        && (key === 'aliases' ? value.length <= 30 : value.length === base.moves.length)
        : Object.hasOwn(openingEditFields, key) && validText(value);
      if (!valid || !draft && key === 'updated' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) {
        throw new Error(id + ' の ' + key + ' を確認してください。');
      }
    }
  }
  return pack;
}

function applyOpeningEdits(entries, edits) {
  return entries.map(entry => Object.hasOwn(edits, entry.id) ? { ...entry, ...edits[entry.id] } : entry);
}
