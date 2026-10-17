# グラフの単独利用と Zenn への埋め込み

## 単独ページ

公開サイトの `embed.html` では、グラフ、手法の選択、定義と参照の根拠を表示する詳細欄を利用できます。`cluster`、`layout`、`term`、`scope`、`source`、`kind`、`settings` の URL パラメーターは、通常サイトと共通です。「通常サイトで開く」を選ぶと、同じ条件で通常サイトに移動できます。

iframe を使えるサイトには、このページを埋め込めます。高さは 760px 程度を目安に、記事の幅や画面の大きさに合わせて指定してください。表示領域が狭い場合は、グラフの下に詳細欄が表示されます。

## Zenn

Zenn では、公式の Markdown 記法を使って CodePen などの対応サービスを埋め込めます。この手順では、CodePen でグラフを表示し、その Pen を記事に埋め込みます。

- [Zenn の Markdown 記法](https://zenn.dev/zenn/articles/markdown-guide#コンテンツの埋め込み)
- [CodePen の外部リソース](https://blog.codepen.io/documentation/adding-external-resources/)

次の手順で設定します。

1. `npm run build` を実行し、`dist/widget/glossary-map.js` と `glossary-map.css` を生成します。
2. 記事を公開する際は、`npm run freeze:widget` で固定版を `releases/<識別子>/` に保存します。コミットして GitHub Pages に公開してください。既存の固定版は残します。
3. CodePen の外部 JS/CSS の設定に、固定版の `glossary-map.js` と `glossary-map.css` の URL を指定します。
4. CodePen の HTML、CSS、JS の各欄に、以下のコードを記入します。
5. Zenn の記事に `@[codepen](Pen の URL)` を追加し、記事のプレビューで操作と高さを確認します。

HTML:

```html
<div id="map"></div>
```

CSS:

```css
body { margin: 0; }
#map { height: 100vh; min-height: 600px; }
```

JS:

```js
const explorer = GlossaryMap.mount(document.getElementById('map'), {
  initialState: {
    clustering: 'louvain',
    layout: 'force',
    scope: 'all'
  }
});
```

JS には、データ、計算処理、Worker を同梱しています。最初はページをスクロールする操作が有効です。「グラフを操作する」を選ぶと、表示の移動、ピンチによる拡大・縮小、ドラッグができるようになります。原文、訳文、参照の根拠、各手法の説明も、埋め込み先で読めます。

固定版を参照すれば、通常サイトを更新しても記事中のデータや計算方法を維持できます。最新版の `widget/` は動作確認に使い、記事で同じ内容を表示し続ける必要がある場合は固定版を使ってください。

このリポジトリの自動テストでは、別オリジンの iframe で外部の JS と CSS を読み込み、グラフが動作することを確認しています。CodePen での公開と、Zenn の実際の記事でのプレビューは、記事を公開する際に確認してください。

## アプリ内での利用

TypeScript からは `mountExplorer` を使います。

```ts
import { mountExplorer } from './src/explorer/explorer';

const explorer = mountExplorer(container, {
  data: corpus,
  initialState: { clustering: 'flow', layout: 'circle' },
  onStateChange(state) { /* URL や親アプリの状態に反映する */ },
  onRead(termId) { /* 必要に応じて用語集を開く */ }
});
await explorer.ready;
explorer.updateState({ scope: 'all' });
explorer.getState();
explorer.activate(); // 非表示にしていた領域を再び表示したときに呼ぶ
explorer.destroy();
```

`container` には、幅と高さを指定してください。同じページに複数のグラフを配置することもできます。状態が変わると呼び出し側に通知されるので、その通知を使って埋め込み先で URL を管理できます。

`ready` は、初回描画後にキャッシュを準備し、描画が安定した時点で解決する Promise です。準備処理は、低速な環境でも最長1秒で終了します。準備中も検索と定義の閲覧は利用できますが、ズームなどのグラフ操作は準備が終わってから有効になります。UI の構築に失敗した場合、`ready` は失敗として扱われます。Worker の起動や計算に失敗した場合は、画面内の「再試行」からやり直せます。
