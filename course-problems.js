// ChessPathの公開教材データ。編集は問題エディターから行えます。
const publishedProblemPack = {
  "schemaVersion": 1,
  "problems": [
    {
      "id": "bishop",
      "title": "ビショップ",
      "chapter": "pieces",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "ビショップは斜めに進みます。斜めに進むたびに、着くマスの色は同じです。",
      "practiceSquare": "",
      "prompt": "d4の白ビショップでa7のポーンをテイクしましょう",
      "fen": "4k3/p7/8/8/3B4/8/8/4K3 w - - 0 1",
      "hint": "d4からc5、b6と斜めにたどります。",
      "correct": "a7はd4と同じ色のマスです。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "d4a7"
        ]
      ],
      "tags": []
    },
    {
      "id": "rook",
      "title": "ルーク",
      "chapter": "pieces",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "ルークは縦か横へ、道が空いているところまで進めます。",
      "practiceSquare": "",
      "prompt": "d4の白ルークを同じ列のd6へ動かしましょう。",
      "fen": "4k3/8/8/8/3R4/8/8/4K3 w - - 0 1",
      "hint": "d4とd6は同じd列です。",
      "correct": "ルークはまっすぐ縦に2マス進みました。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "d4d6"
        ]
      ],
      "tags": []
    },
    {
      "id": "queen",
      "title": "クイーン",
      "chapter": "pieces",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "クイーンは縦・横・斜めへ、道が空いているところまで進めます。",
      "practiceSquare": "",
      "prompt": "b3の白クイーンを横に動かしてe3へ進めましょう。",
      "fen": "4k3/p7/8/8/8/1Q6/8/4K3 w - - 0 1",
      "hint": "b3とe3はどちらも3段目です。",
      "correct": "e3に進んだことで、チェックをかけつつa7のポーンを狙うことができました。クイーンはルークとビショップの動き方を合わせた駒です。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "b3e3"
        ]
      ],
      "tags": []
    },
    {
      "id": "castle",
      "title": "キャスリング",
      "chapter": "special",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "キングとルークを一手で動かす特別な手です。両方がまだ動いておらず、間が空き、キングの現在地・通過点・到着点が攻撃されていないときに指せます。",
      "practiceSquare": "",
      "prompt": "白キングをe1から右に2マス動かしましょう。",
      "fen": "r1bqkbnr/ppp2ppp/2np4/4p3/4P3/5N2/PPPPBPPP/RNBQK2R w KQkq - 0 1",
      "hint": "動かすのはキングです。g1を選ぶとルークも一緒に動きます。",
      "correct": "キングはg1、ルークはf1に移りました。これでキングを盤の端に近づけ、安全な位置に置くことができます。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "e1g1"
        ]
      ],
      "tags": []
    },
    {
      "id": "en-passant",
      "title": "アンパッサン",
      "chapter": "special",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "黒のポーンが今、e7からe5へ2マス進みました。横にいた白ポーンは、その直後の一手だけ、黒がe6まで1マス進んだときのように取れます。",
      "practiceSquare": "",
      "prompt": "f5の白ポーンをe6に動かしましょう。",
      "fen": "8/8/3p4/4pPKp/2k4P/8/8/8 w - e6 0 1",
      "hint": "白ポーンの着地はe6、取られる黒ポーンはe5にあります。",
      "correct": "白はe6に着き、e5の黒ポーンが盤から消えました。使えるのは相手が2マス進んだ直後だけです。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "f5e6"
        ]
      ],
      "tags": []
    },
    {
      "id": "quiz-promotion",
      "title": "昇格する駒を選ぶ",
      "chapter": "review",
      "difficulty": "intro",
      "kind": "goal",
      "mode": "standard",
      "goal": "match",
      "description": "白ポーンが最後の段に届きます。",
      "practiceSquare": "",
      "prompt": "a8に進み、ナイトに昇格させましょう。",
      "fen": "7k/P7/8/8/8/8/8/7K w - - 0 1",
      "hint": "クイーン、ルーク、ビショップ、ナイトの4種類から選べます。",
      "correct": "白ポーンをナイトに交換できました。しかし、ナイトとキングのみではどうやってもチェックメイトにできないので、引き分けになってしまいました。",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "a7a8n"
        ]
      ],
      "tags": []
    },
    {
      "id": "quiz-knight",
      "title": "ナイトで指定のマスへ",
      "chapter": "review",
      "difficulty": "beginner",
      "kind": "sequence",
      "mode": "standard",
      "goal": "match",
      "description": "ナイトの動きを思い出しましょう。",
      "practiceSquare": "",
      "prompt": "e2の白ナイトをd5へ動かしましょう。",
      "fen": "1nb2rk1/pp4pp/3p4/2p1p3/4P3/3P3P/PPP1NPP1/5RK1 w - - 0 4",
      "hint": "d5から逆算すると...",
      "correct": "c3→d5とたどることで、強力なポジションに移動することができました。(これを、マヌーバリングといいます。)",
      "incorrect": "課題に合う手を探しましょう。",
      "lines": [
        [
          "e2c3",
          "b8c6",
          "c3d5"
        ]
      ],
      "tags": []
    }
  ]
};
