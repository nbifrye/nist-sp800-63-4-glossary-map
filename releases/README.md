# 記事で固定する配布物

通常ビルドの `dist/widget/` は最新版です。記事から長期間参照する場合は、コード・データ・Worker・CSS をまとめた固定版をこのディレクトリに追加します。

```sh
npm run build
npm run freeze:widget
git add releases
```

配布内容の SHA-256 から決めたディレクトリ名に保存します。固定版をコミットすると、以後のビルドでも GitHub Pages の `releases/<識別子>/` にコピーされます。既に記事で参照しているディレクトリは変更・削除しないでください。修正は新しい識別子で公開します。

生成される `example.html` で単独動作を確認できます。CodePen で利用する手順は [埋め込みの説明](../docs/embedding.md) を参照してください。
