# ScrollHint

ScrollHint は、スクロール位置に応じて **UI / CTA / ナビゲーション状態** を切り替えるための「後付け・超軽量」ライブラリです。  
依存なし・Vanilla JavaScript 1ファイルで動作し、制作会社 / WordPress / 静的サイトなど既存ページに **差し込むだけ**で使えます。

- 目次（TOC）の現在位置ハイライト
- セクション進入時の CTA 切り替え
- ナビゲーションの状態更新（active 付与）
- 固定ヘッダを考慮したオフセット
- スクロール方向（up / down）の判定
- resize / orientationchange 追従
- requestAnimationFrame / throttle による軽量最適化

---

## Demo
以下のURLより、実際の動作を確認できるデモページをご覧いただけます。

[https://monou-jp.github.io/scrollhint/](https://monou-jp.github.io/scrollhint/)


ローカルで確認する場合は、`docs/index.html` をブラウザで開いてください。

----

## Install

HTML に 1 行追加するだけで動作します。

```html
<script src="path/to/scrollhint.js" defer></script>
```

初期化は DOMContentLoaded 後に呼び出すのが安全です。

```html
<script>
  window.addEventListener('DOMContentLoaded', function () {
    scrollhint({
      offset: 72,
      sections: [
        { target: "#pricing" }
      ]
    });
  });
</script>
```

---

## Quick Start

### 1) 目次ハイライト（記事ページ）

```js
scrollhint({
offset: 72,
sections: [
{ target: "#intro", applyTo: [{ selector: 'a[href="#intro"]', className: "is-current" }] },
{ target: "#usage", applyTo: [{ selector: 'a[href="#usage"]', className: "is-current" }] },
{ target: "#faq",   applyTo: [{ selector: 'a[href="#faq"]',   className: "is-current" }] }
]
});
```

### 2) セクション進入で CTA 切り替え（LP）

```js
function updateCTA(text) {
var el = document.querySelector('.cta__button');
if (el) el.textContent = text;
}
function resetCTA() { updateCTA('資料請求'); }

scrollhint({
offset: 72,
sections: [
{
target: "#pricing",
onEnter: function () { updateCTA("今すぐ申し込む"); },
onLeave: function () { resetCTA(); }
}
]
});
```

### 3) セレクタ一括指定 + TOC 自動バインド（推奨）

- セクションに `id` がある
- TOC が `.toc` 配下にある（`a[href="#id"]` 形式）

なら、これだけでハイライトできます。

```js
scrollhint({
sections: ".js-section",
offset: 72,
enterAt: "top",
bindTOC: true,
tocSelector: ".toc"
});
```

#### セクションごとの TOC バインドを上書きしたい場合

セクション要素に `data-scrollhint-toc` を指定します（任意）。

```html
<section id="pricing" class="js-section" data-scrollhint-toc=".toc a[data-id='pricing']">
  ...
</section>
```

---

## API

### scrollhint(options) -> instance

```js
var inst = scrollhint({ ... });
```

戻り値 `instance` は以下のメソッドを持ちます。

- `destroy()` : 監視解除 + class を掃除
- `pause()` / `resume()` : 一時停止 / 再開
- `refreshNow()` : 位置を再計測して即時反映
- `getActive()` : 現在 active のセクション情報を取得（ない場合 null）

---

## Options

### sections（必須）
監視するセクションを指定します。以下を受け付けます。

- 配列（推奨）：`[{ target: "#pricing", ... }, ...]`
- セレクタ文字列：`".js-section"`
- NodeList / HTMLCollection / Element

#### sections item（配列指定時）

- `target` : selector または Element（必須）
- `enterClass` : セクション自身に付与する class（省略時 `activeClass`）
- `applyTo` : class を付け替える対象（目次/ナビ/CTA領域など）
    - `{ selector: "..." , className: "..." }`
    - `{ element: someElement, className: "..." }`
- `onEnter(ctx)` : セクションが active になった時
- `onLeave(ctx)` : active から外れた時
- `onUpdate(ctx)` : active 継続中に呼ばれる（任意）

### offset（固定ヘッダ対策）
固定ヘッダがある場合は必ず指定してください。

- 数値（px）：`offset: 72`
- 関数（動的）：`offset: function(){ return header.offsetHeight; }`

```js
scrollhint({
offset: function () {
var header = document.querySelector('.site-header');
return header ? header.offsetHeight : 0;
},
sections: ".js-section"
});
```

### enterAt（判定ライン）
どの位置で「そのセクションに入った」とみなすか。

- `"top"`（既定）
- `"center"`
- `"bottom"`
- `0..1`（割合。0=top, 0.5=center, 1=bottom）

例：画面中央基準で active 切り替え

```js
scrollhint({
enterAt: "center",
offset: 72,
sections: ".js-section"
});
```

### bindTOC / tocSelector（TOC 自動ハイライト）
`bindTOC: true` を指定すると、各セクションの `id` に対応する TOC リンクへ `is-current` を付与します。

```js
scrollhint({
sections: ".js-section",
bindTOC: true,
tocSelector: ".toc",
offset: 72
});
```

### onUpdate（グローバル）
active 継続中の更新フック（進捗に応じた UI 更新など）。必要時のみ使用してください。

```js
scrollhint({
sections: ".js-section",
offset: 72,
onUpdate: function (ctx) {
// ctx.progress: 0..1-ish
// 例: progress に応じてバーを更新
}
});
```

### パフォーマンス関連
- `useRAF`（既定 true）：scroll を rAF で集約
- `throttle`（既定 50ms）：useRAF=false の時のみ使用
- `softRefresh`（既定 true）：初期化後に遅延 refresh（LP の画像/フォント遅延対策）
- `softRefreshDelay`（既定 400ms）

---

## ctx（コールバック引数）

`onEnter / onLeave / onUpdate` には以下の情報が渡されます。

- `section` : 対象のセクション要素
- `id` : `#id` 形式（id がない場合は空）
- `direction` : `"up"` / `"down"`
- `scrollY` : 現在のスクロール位置
- `line` : 判定ライン（ドキュメント座標）
- `top` / `bottom` : セクションのドキュメント座標
- `progress` : セクション内進捗（0..1-ish）

---

## Fixed header（固定ヘッダ）への注意

固定ヘッダがある場合、判定ラインがズレるため **offset の指定が必須**です。

- `offset: 72` のように px 指定する
- もしくは `offset: function(){ return header.offsetHeight; }` で動的計算する（レスポンシブ向け）

---

## Why not IntersectionObserver?

ScrollHint は IntersectionObserver を使いません。

- 制作現場では「固定ヘッダ下端を判定ラインにする」「方向（up/down）で挙動を変える」など、判定ルールを **明示的に制御**したいケースが多い
- scroll/resize ベースの方が挙動が単純で、説明・デバッグが容易
- 古めの環境でも壊れにくく、サイト事情に左右されにくい

---

## Performance notes

- scroll イベントは requestAnimationFrame（または軽量 throttle）でまとめて処理します
- 位置計算は `refresh()` でキャッシュし、resize/orientationchange に追従します
- DOM 変更（class 付与/コールバック実行）は active 切替時中心にして無駄を削減しています

---

## Global override (optional)

1ファイル運用向けに、`window.SCROLLHINT_CONFIG` で設定を上書きできます。

```js
window.SCROLLHINT_CONFIG = {
offset: 80,
enterAt: "top"
};
```

---

## License

BSD 3-Clause
