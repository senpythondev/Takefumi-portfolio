# docs/facts/ — 追加の事実データ

CLAUDE.md §0 のとおり、ここにあるデータはファクトシート（`docs/BRIEF.md` §6）と同じく**正**として扱う。
サイトは `src/content/facts.ts` 経由でここを読み、`npm run validate`（ビルド前と CI で必ず実行）が整合性を検査する。

## genten-eval.json（正）／ genten-eval.csv（オーナーの元データ）

| フィールド | 型 | 内容 |
|---|---|---|
| `source` | string | データの出どころ（自由記述） |
| `confidence` | `"measured"` | 確度。評価結果なので実測 |
| `configs[]` | `{ id, label_ja, label_en }` | 比較した構成。`id` は `closed-book` / `keyword-search` / `genten` |
| `questions` | number | 設問数（25） |
| `results[]` | `{ question, config, correct }` | 設問ごと・構成ごとの正誤。`questions × configs` 件ちょうど |
| `summary[]` | `{ config, correct, correct_with_official_citation, avg_seconds? , avg_seconds_approx? }` | 集計値。平均時間が約値なら `avg_seconds_approx` に入れる（サイトでは `概算` になる） |
| `summary_source` | string | 集計値の出どころ |

`npm run validate` が検査すること：

- `results` が設問数 × 構成数そろっていること
- `summary.correct` が `results` の正答数と一致すること
- サイトの正答率・出典率・応答時間の数値が、この JSON から計算した値と一致すること（ja／en 両方）
- `avg_seconds_approx` の値はサイトで `概算` ラベルになっていること
- CSV（`問番号, 構成名, 正誤` の3列）が JSON の `results` と1件ずつ一致すること

設問の本文は受領していないため、ファイルにもサイトにも載せない（BRIEF §5-2）。

## 新しい事実データを追加するとき

- ファイル名は `<対象>-<内容>.json`。顧客名・事業者を特定できる語をファイル名にも中身にも入れない（ASSET_CHECKLIST A）。
- 数値の確度（`measured` / `approx` / `reconstructed`）をデータ側に持たせる。
- 追加したら `src/content/facts.ts` に zod スキーマを書き、`scripts/validate-content.ts` に整合性チェックを足す。
