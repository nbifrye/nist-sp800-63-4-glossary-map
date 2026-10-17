# グラフの単独利用と Zenn への埋め込み

## 単独ページ

公開サイトの `embed.html` はグラフ・手法選択・定義と参照根拠の詳細欄だけを表示します。`cluster`、`layout`、`term`、`scope`、`source`、`kind`、`settings` の URL パラメーターは通常サイトと共通です。「サイトで開く」から同じ条件の通常サイトへ移動できます。

自分で iframe を使えるサイトではこのページを埋め込めます。高さは 760px 程度を目安に、記事の幅と画面の大きさに合わせて指定します。小さな領域では詳細欄がグラフの下になります。

## Zenn

Zenn の公式記法では CodePen などの対応サービスを埋め込めます。GitHub Pages の任意の URL を直接インタラクティブな iframe として表示できる前提にはしていません。

- [Zenn の Markdown 記法](https://zenn.dev/zenn/articles/markdown-guide#コンテンツの埋め込み)
- [CodePen の外部リソース](https://blog.codepen.io/documentation/adding-external-resources/)

推奨手順は次のとおりです。

1. `npm run build` で `dist/widget/glossary-map.js` と `glossary-map.css` を生成します。
2. 記事公開時は `npm run freeze:widget` で固定版を `releases/<識別子>/` に保存し、コミットして GitHub Pages に公開します。既存の固定版は残します。
3. CodePen の外部 JS/CSS に、その固定版の `glossary-map.js` と `glossary-map.css` の URL を設定します。
4. HTML/CSS/JS に下記の小さな起動処理を置きます。
5. Zenn の記事に `@[codepen](Pen の URL)` を追加し、記事プレビューで操作と高さを確認します。

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

データ・アルゴリズム・Worker は JS に同梱されており、通常サイトのアプリやデータ API は不要です。初期表示はページスクロールを優先します。「グラフを操作する」でパンやピンチ、ドラッグを有効にできます。原文・訳文・参照根拠・方式の説明は埋め込み内で読めます。

配布物のパスを固定することで、通常サイトを更新しても記事中のデータや計算方式は変わりません。最新版の `widget/` は動作確認用に使えますが、記事の再現性が必要な場合は固定版を使ってください。

このリポジトリの自動テストは、別オリジンの iframe が外部 JS/CSS を読み込んで動作することまで確認します。CodePen の公開や Zenn での実記事プレビューは、記事公開時に実施してください。

## アプリ内での利用

TypeScript からは `mountExplorer` を使います。

```ts
import { mountExplorer } from './src/explorer/explorer';

const explorer = mountExplorer(container, {
  data: corpus,
  initialState: { clustering: 'flow', layout: 'circle' },
  onStateChange(state) { /* URL や親アプリの状態に反映 */ },
  onRead(termId) { /* 必要なら用語集へ移動 */ }
});
await explorer.ready;
explorer.updateState({ scope: 'all' });
explorer.getState();
explorer.activate(); // 非表示の領域を表示し直したとき
explorer.destroy();
```

`container` に幅と高さを指定してください。複数インスタンスを同じページに配置できます。状態変更の通知からホスト側が URL を管理でき、グラフ UI 自体はページの履歴や親ウィンドウを操作しません。`ready` は初回描画後にキャッシュを準備し、描画が安定した時点で resolve します。この準備処理は低速な環境でも最長1秒で終了します。準備中はズームなどのグラフ操作を無効にし、検索と定義の参照は利用できます。UI の構築に失敗した場合の `ready` は reject し、Worker の失敗は画面内の再試行操作からも回復できます。
