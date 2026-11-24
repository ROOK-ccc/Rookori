function createGameLibrary(openDatabase = () => indexedDB.open('chesspath.game-library', 2)) {
  let connection;

  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = openDatabase();
      let blocked = false;
      request.onupgradeneeded = event => {
        const games = event.oldVersion === 0 ? request.result.createObjectStore('games', { keyPath: 'id' })
          : request.transaction.objectStore('games');
        if (event.oldVersion === 0) games.createIndex('pgn', 'pgn', { unique: true });
        // Keep historical duplicates intact if two different PGNs already describe one game.
        games.createIndex('lichessId', 'lichessId');
        if (event.oldVersion === 0) return;
        const scan = games.openCursor();
        scan.onsuccess = () => {
          const cursor = scan.result;
          if (!cursor) return;
          const record = cursor.value;
          const id = lichessPgnId(record.pgn);
          if (id) cursor.update({ ...record, lichessId: id });
          cursor.continue();
        };
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => {
        blocked = true;
        reject(new Error('別のタブで対局履歴を開いています。閉じてからもう一度お試しください。'));
      };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => {
          db.close();
          connection = null;
        };
        db.onclose = () => { connection = null; };
        resolve(db);
      };
    }).catch(error => {
      connection = null;
      throw error;
    });
    return connection;
  }

  async function access(mode, work) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('games', mode);
      let result;
      let failure;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('対局履歴の処理を中断しました。'));
      const setResult = value => { result = value; };
      function safely(action) {
        try { action(); }
        catch (error) {
          failure = error;
          tx.abort();
        }
      }
      const read = (request, useResult = setResult) => {
        request.onsuccess = () => safely(() => useResult(request.result));
      };
      safely(() => work(tx.objectStore('games'), read, setResult));
    });
  }

  return {
    get: id => access('readonly', (store, read) => read(store.get(id))),
    all: () => access('readonly', (store, read) => read(store.getAll())),
    lichessIds: () => access('readonly', (store, read, result) => {
      const ids = new Set();
      read(store.index('lichessId').openKeyCursor(null, 'nextunique'), cursor => {
        if (!cursor) { result(ids); return; }
        ids.add(cursor.key);
        cursor.continue();
      });
    }),
    saveExternal(game) {
      return access('readwrite', (store, read, result) => {
        const source = validateReviewExternal(game.source, game.pgn, game.metadata.result);
        read(store.index('lichessId').get(source.id), existing => {
          if (existing) {
            if (!existing.source && sameReviewMainline(existing, game)) {
              existing.source = source;
              store.put(existing);
            }
            result({ record: existing, duplicate: true });
            return;
          }
          const bytes = crypto.getRandomValues(new Uint8Array(16));
          const id = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
          const record = reviewGameRecord({ ...game, source }, id);
          store.add(record);
          result({ record, duplicate: false });
        });
      });
    },
    save(game, point, preferredId) {
      return access('readwrite', (store, read, result) => {
        function write(existing) {
          if (existing && !point) {
            if (game.cpu && !existing.cpu) {
              existing.cpu = game.cpu;
              store.put(existing);
            }
            result(existing);
            return;
          }
          let record = existing;
          if (!record) {
            const id = preferredId ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), value =>
              value.toString(16).padStart(2, '0')).join('');
            record = reviewGameRecord(game, id);
          }
          if (point) {
            if (existing && record.positions[point.ply]?.fen !== game.positions[point.ply]?.fen) {
              throw new Error('保存済みの棋譜と局面が一致しません。履歴から開いてメモしてください。');
            }
            if (record.notes.some(note => note.ply === point.ply)) {
              throw new Error('履歴の同じ局面にメモがあります。「対局を履歴に保存」で保存済みの対局を開いてください。');
            }
            record.notes.push(reviewNote(record, point.ply, point.text));
            record.notes.sort((a, b) => a.ply - b.ply);
          }
          if (existing) store.put(record);
          else store.add(record);
          result(record);
        }
        read(store.index('pgn').get(game.pgn), existing => {
          const lichessId = !existing && lichessPgnId(game.pgn);
          if (lichessId) read(store.index('lichessId').get(lichessId), write);
          else write(existing);
        });
      });
    },
    remove(id) {
      return access('readwrite', store => store.delete(id));
    },
    updateNote({ id, pgn }, ply, previous, text) {
      return access('readwrite', (store, read, result) => {
        read(store.get(id), game => {
          if (!game || game.pgn !== pgn) throw new Error('対局が見つかりません。');
          const current = game.notes.find(note => note.ply === ply);
          if (current?.savedAt !== previous?.savedAt || current?.text !== previous?.text) {
            throw new Error('別のタブでメモが更新されました。入力した内容を控えてから、対局を開き直してください。');
          }
          game.notes = game.notes.filter(note => note.ply !== ply);
          if (text !== null) game.notes.push(reviewNote(game, ply, text));
          game.notes.sort((a, b) => a.ply - b.ply);
          store.put(game);
          result(game);
        });
      });
    },
    restore(games) {
      return access('readwrite', store => {
        store.clear();
        for (const game of games) store.add(game);
      });
    },
  };
}
