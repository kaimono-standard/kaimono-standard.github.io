# 買いもの標準

実購入レビューを使わず、公式情報・計算ツール・更新ログで購入判断を支援する静的サイトです。

現在のUIはPCとスマートフォン（390px幅）で表示監査済みです。トップページでは注文下限計算を最優先にし、全ページで確認日、調査主体、広告表記、出典導線を統一しています。

## 公開前に必ず行うこと

1. `config.js` に楽天アフィリエイト管理画面で発行した完全なURLを設定する
2. 本番URLは `https://kaimono-standard.echoant.com/`（Cloudflare DNS の CNAME → GitHub Pages、`CNAME` ファイルで設定済み）。HTML の canonical は直書き、`robots.txt`／`sitemap.xml` はビルド時に `SITE_URL` で置換
3. GitHubのリポジトリ変数 `SITE_URL` と `CONTACT_URL` を設定する
4. 楽天アフィリエイトへ本サイトを登録する
5. 広告リンクが通常リンクではなくアフィリエイトURLへ遷移することを確認する
6. Search Console は登録済み（URLプレフィックス、確認ファイル `google3723ec5dfc7ec3ff.html` は削除しない）。アクセス解析は未設定
7. 楽天側で媒体登録後、Secret `RAKUYOKO_AFFILIATE_HOME_URL` を設定する

## ローカル確認

依存関係はありません。PowerShellで以下を実行し、表示されたURLを開きます。

```powershell
python -m http.server 8000
```

## 運用

- 週1回: 送料、注文上下限、クーポン表示、返品条件を公式ページで確認
- 月1回: 検索クエリ、公式へのクリック、発生成果、承認成果、EPCを記録
- 条件変更時: `config.js` の日付、該当記事、`sources.html` の変更履歴を更新
- 記事追加時: `search-index.js`（商品を探すページの検索索引）に記事と製品を追加し、`build.mjs` の配布リストと `sitemap.xml` にも登録
- 商品画像と商品データは転載しない
- 実物未確認の商品をレビュー済みと表現しない

## 成果検証の区分

「リンク作成」「クリック」「購入成果」「承認」「支払」を別々に記録します。リンクが動くことだけで報酬確定とは判断しません。
