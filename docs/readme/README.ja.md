# Banana Batch Studio

> 1つのプロンプトで複数の画像を一括処理する、ローカル実行型の BANANA/Gemini 画像生成デスクトップアプリです。

**言語**：[中文](../../README.md) | [繁體中文](README.zh-Hant.md) | [English](README.en.md) | 日本語 | [한국어](README.ko.md)

現在のリリース：`v2.0.2`

![macOS](https://img.shields.io/badge/macOS-12%2B-black)
![Windows](https://img.shields.io/badge/Windows-x64-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![Bun](https://img.shields.io/badge/Bun-runtime-f5f0e8)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

Banana Batch Studio は、**同じプロンプトと同じ参照画像セットを複数の入力画像に適用し、並列で結果を生成する**ためのローカルデスクトップアプリです。

EC、デザイン、映像、ショート動画、AI 画像ワークフローに向いています。複数の元画像を追加し、必要に応じて参照画像を追加し、共通プロンプトとモデル設定を選んで生成できます。画像はあなたのPCから、設定した Google Gemini API または互換リレー API に直接送信されます。第三者のアプリサーバーは経由しません。

![Banana Batch Studio interface](../images/banana-batch-studio-interface.png)

> 現在のデスクトップ画面。

![Banana Batch Studio concept](../images/banana-batch-studio-concept.png)

> プロダクトコンセプト画像。

## ダウンロード

最新のデスクトップ版は GitHub Releases から入手できます。

[Banana Batch Studio v2.0.2 をダウンロード](https://github.com/bleeeet/banana-batch-studio/releases/tag/v2.0.2)

| プラットフォーム | パッケージ | メモ |
|---|---|---|
| macOS Apple Silicon | `Banana Batch Studio (Apple Silicon).app` | M1/M2/M3/M4 Mac 向け |
| macOS Intel | `Banana Batch Studio (Intel).app` | Intel Mac 向け |
| Windows x64 | `BananaBatchStudio-Windows-x64/` | `start.bat` を実行 |

## 機能

| 機能 | 説明 |
|---|---|
| 複数画像の追加 | 複数画像をドラッグ、または画像 / フォルダーを選択 |
| スタックプレビュー | アップロード後に実画像サムネイルを重ねて表示 |
| 参照画像 | 同じ参照画像セットをすべての入力画像に適用 |
| リアルタイム並列処理 | デフォルト最大並列数は 10、最大 100 まで調整可能 |
| Batch モード | Gemini Batch Job に対応し、大きなバッチに向く |
| API プロバイダー | Google 公式 API と Gemini 互換リレー API に対応 |
| プリセット | プロンプトとモデル設定を JSON として保存、インポート、エクスポート |
| フォルダー書き出し | 成功した結果を通常のダウンロードフォルダーへ一括保存 |
| 多言語 UI | 簡体字中国語、繁体字中国語、English、日本語、한국어 |
| ローカル実行 | ローカルサービスは `127.0.0.1:4178` で動作 |

## クイックスタート

1. GitHub Releases からアプリをダウンロードします。
2. `Banana Batch Studio (Apple Silicon).app` または `Banana Batch Studio (Intel).app` を開きます。
3. Google 公式 API または Gemini 互換リレー API を選びます。
4. API key を保存します。
5. 画像をドラッグするか、画像 / フォルダー選択ボタンをクリックします。
6. 必要に応じて参照画像ボタンで参照画像を追加します。
7. 共通プロンプトを入力します。
8. モデル、アスペクト比、画像サイズ、Temperature、リクエスト間隔、並列数を選びます。
9. 生成開始ボタンをクリックします。
10. 個別画像のダウンロード、失敗項目の再試行、保存済みジョブのプロンプト編集、タスク再作成、結果フォルダーの書き出しができます。

macOS で開発元を確認できないと表示された場合は、Finder でアプリを右クリックし、`開く` を選んで確認してください。

## API プロバイダー

| プロバイダー | 用途 |
|---|---|
| Google 公式 API | Google AI Studio / Gemini API key を直接使用 |
| Gemini 互換リレー API | 互換リレーサービス、カスタム API URL、モデル一覧を使用 |

アプリは API key を同梱しません。自分の Google Gemini API key またはリレー API key が必要です。

## データとプライバシー

Banana Batch Studio はローカルで動作します。ジョブ記録と生成ファイルはあなたのPCに保存されます。

**Mac App データパス：**

```text
~/Library/Application Support/BananaBatchStudio/
  uploads/       アップロード画像のコピー
  outputs/       生成結果
  batch/         Batch モードのリクエストファイル
  zips/          旧 ZIP 書き出しキャッシュ
  jobs.json      ジョブ記録
  api-keys.json  API key、ローカル JSON として保存
```

**Windows データパス：**

```text
%APPDATA%\BananaBatchStudio\
```

公開リリースパッケージには、個人の API key や保存済みプリセットは含まれません。API key とプリセットはユーザー自身のローカル設定ディレクトリに保存されます。

## 開発とパッケージング

```bash
npm install
npm run dev
npm run package:mac
npm run package:windows
```

GitHub にはソースコードのみをコミットし、`.app` と Windows パッケージは GitHub Releases にアップロードします。

## 使用技術

- [Google Gemini / Google AI API](https://ai.google.dev/)：画像生成モデルへのアクセス。
- [Bun](https://bun.sh/)：同梱ローカルランタイム。
- [React](https://react.dev/)：デスクトップ Web UI。
- [Vite](https://vite.dev/)：フロントエンド開発と本番ビルド。

## License

ISC
