function createGameLibrary(openDatabase = () => indexedDB.open('chesspath.game-library', 1)) {
  let connection;

  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const request = openDatabase();
      let blocked = false;
      request.onupgradeneeded = () => {
        const games = request.result.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('pgn', 'pgn', { unique: true });
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
    save(game, point, preferredId) {
      return access('readwrite', (store, read, result) => {
        read(store.index('pgn').get(game.pgn), existing => {
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
            if (record.notes.some(note => note.ply === point.ply)) {
              throw new Error('履歴の同じ局面にメモがあります。「対局を履歴に保存」で保存済みの対局を開いてください。');
            }
            record.notes.push(reviewNote(record, point.ply, point.text));
            record.notes.sort((a, b) => a.ply - b.ply);
          }
          if (existing) store.put(record);
          else store.add(record);
          result(record);
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
