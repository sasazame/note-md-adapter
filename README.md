# note-md-adapter

Markdownで書いた記事を[note](https://note.com)に自動投稿するCLIツール

> **⚠️ 注意**: これは非公式ツールです。note.comとは一切関係ありません。自己責任でご利用ください。

## 特徴

- 📝 Markdown記事をnoteに自動投稿
- 🖼️ 画像の自動アップロード（ペースト操作をシミュレート）
- 🔐 ログイン情報の保存により2回目以降は自動ログイン
- 📄 下書き保存対応

## 仕組み

このツールがどのように動作しているか、技術的な詳細については[実装の詳細ドキュメント](./IMPLEMENTATION.md)をご覧ください。

## 動作環境

- Node.js 18以上
- Chrome/Chromium（Playwrightが自動インストール）

## インストール

### 1. リポジトリをクローン

```bash
git clone https://github.com/sasazame/note-md-adapter.git
cd note-md-adapter
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. ビルド

```bash
npm run build
```

### 4. Playwrightのブラウザをインストール

```bash
npx playwright install chromium
```

## 使い方

### 初回ログイン

初回は手動でnoteにログインする必要があります：

```bash
node dist/cli.js login
```

ブラウザが開くので、手動でログインしてください。ログイン情報は`~/.note-md-adapter/auth.json`に保存され、次回以降は自動ログインされます。

### 記事の投稿

#### ディレクトリ構造

記事ディレクトリには`article.md`ファイルが必要です。画像ファイルはMarkdown内のパスに従って配置してください：

```
my-article/
├── article.md      # Markdown記事（必須）
└── images/         # 画像ファイル（任意のディレクトリ構造可）
    ├── image1.jpg
    └── image2.png
```

> **Note**: 画像パスはMarkdown内で指定されたパスを使用します。相対パスは`article.md`からの相対パスとして解決されます。

#### 投稿コマンド

```bash
node dist/cli.js ./my-article --title "記事タイトル" --status draft
```

### オプション

- `--title <title>` - 記事タイトル（省略時はMarkdownの最初のH1を使用）
- `--status <status>` - 記事ステータス: "draft"（下書き）または "publish"（現在は下書きのみ対応）
- `--headless` - ブラウザをヘッドレスモードで実行
- `--login-only` - ログインのみ実行

## 記事の書き方

### Markdown例

```markdown
# 記事タイトル

## セクション1

本文テキスト。

![画像の説明](images/photo1.jpg)

## セクション2

別のテキスト。
```

### 画像について

- 画像は`images/`ディレクトリに配置
- 対応フォーマット: JPG, PNG, GIF, WebP
- 画像はクリップボード経由でペースト操作をシミュレートしてアップロード

## パフォーマンス

- 画像1枚あたり約10-18秒でアップロード（確実な完了待機）
- 大量の画像がある場合は時間がかかります（例：100枚で約20-30分）
- 画像アップロードの信頼性を大幅に向上（長時間待機で確実性重視）

## 制限事項

- noteのUI変更により動作しなくなる可能性があります
- 現在は下書き保存のみ対応（公開は手動で行ってください）
- 画像のアップロードに時間がかかる場合があります（ネットワーク状況による）
- 大量の画像（100枚以上）の場合、処理に10分以上かかることがあります

## トラブルシューティング

### ログインできない場合

```bash
# 認証情報をクリア
rm -rf ~/.note-md-adapter/

# 再度ログイン
node dist/cli.js login
```

### 画像がアップロードされない場合

- ネットワーク接続を確認
- 画像ファイルのパスが正しいか確認
- ヘッドレスモードを無効にして動作を確認

## 開発

### 開発モードで実行

```bash
npm run dev -- ./my-article --title "テスト"
```

### TypeScriptのビルド

```bash
npm run build
```

## ライセンス

MIT

## 免責事項

このツールは非公式であり、note.comによって承認、提携、またはスポンサーされていません。使用は自己責任で行ってください。

noteの利用規約に従って使用してください。自動化ツールの使用が制限される場合があります。

## 作者

このツールは個人プロジェクトとして開発されました。問題や提案がある場合は、GitHubのIssuesでお知らせください。