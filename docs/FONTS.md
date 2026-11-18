# フォント（自前ホストのサブセット）

サイトは、使う文字だけを含む woff2 を自前でホストする（CLAUDE.md §4、PM_REVIEW_08 §4）。
目的は2つある。

- **見た目**：書体をデザインの一部として確定させる。
- **性能**：日本語の字形を持つフォントを確実に用意する。
  - 字形を持つフォントがないと、ブラウザは日本語の文字の並びごとに OS へ代わりのフォントを問い合わせる。
  - CI では、これで `/ja` のレイアウトが `/en` の約2.5倍になっていた（PM_REVIEW_07 §2-3）。

## 仕組み
| 置き場所 | 中身 | git |
|---|---|---|
| `.cache/fonts/<family>/` | 元のフォント（TTF）と `OFL.txt` | 対象外（数MB〜15MB／ファイル） |
| `.cache/fonts-venv/` | fontTools（`npm run fonts` が初回に自動で作る） | 対象外 |
| `src/fonts/<set>/*.woff2` | サブセット | コミットする |
| `src/fonts/LICENSES/` | 各フォントのライセンス（OFL 1.1） | コミットする（同梱が義務） |
| `src/fonts/manifest.json` | 案ごとの元ファイルの SHA-256、収録した文字、サイズ | コミットする |
| `src/fonts/active.ts` | 使う案を `next/font/local` で読み込むモジュール（生成物） | コミットする |

- `npm run fonts`：全案のサブセットを作り直す（元のフォントと Python 3 が必要）。
- `npm run fonts -- --activate <a|b|c>`：使う案を切り替える。
- `npm run fonts -- --display <swap|optional>`：`font-display` を切り替える。
- `npm run validate`（ビルドの前にも実行）は、**サイトで使う文字がサブセットに入っているか**を確認する。コンテンツに新しい文字が増えたら失敗するので、`npm run fonts` で作り直す。
  - CI と Vercel は元のフォントも Python も必要としない。
- 収録する文字は、役割ごとに分ける。
  - 本文：コンテンツ・messages・コンポーネント内の全文字と、ASCII・約物。
  - 見出し：タイトル・見出し・ラベル・名前と、UI の文言。
  - 等幅：ASCII と記号。等幅の中の日本語は、本文のフォントで表示される。

## 元のフォントの入手
Google Fonts の公式リポジトリ（GitHub の `google/fonts`）の `ofl/<ディレクトリ>/` から取得する。リポジトリに URL は書かない（守秘チェックの方針）。

```
cd .cache/fonts
get() { mkdir -p "$1"; gh api "repos/google/fonts/contents/ofl/$1/$2" -H "Accept: application/vnd.github.raw" > "$1/$2"; }
get ibmplexsansjp IBMPlexSansJP-Regular.ttf;  get ibmplexsansjp IBMPlexSansJP-SemiBold.ttf;  get ibmplexsansjp IBMPlexSansJP-Bold.ttf;  get ibmplexsansjp OFL.txt
get shipporiminchob1 ShipporiMinchoB1-SemiBold.ttf;  get shipporiminchob1 OFL.txt
get bizudpgothic BIZUDPGothic-Regular.ttf;  get bizudpgothic BIZUDPGothic-Bold.ttf;  get bizudpgothic OFL.txt
get ibmplexmono IBMPlexMono-Regular.ttf;  get ibmplexmono IBMPlexMono-SemiBold.ttf;  get ibmplexmono OFL.txt
get jetbrainsmono 'JetBrainsMono[wght].ttf';  get jetbrainsmono OFL.txt
```

取得したファイルが前回と同じかは、`src/fonts/manifest.json` の `sourceSha256` で確かめられる。

## ライセンス
すべて SIL Open Font License 1.1 で、商用利用・同梱・改変が可能。ライセンス文は `src/fonts/LICENSES/` に同梱する。

| フォント | 予約フォント名（RFN） | サブセットの扱い |
|---|---|---|
| IBM Plex Sans JP | **"Plex"** | 名前を変える：`GroundTruth Sans JP` |
| IBM Plex Mono | **"Plex"** | 名前を変える：`GroundTruth Mono` |
| Shippori Mincho B1 | なし | そのまま |
| BIZ UDPGothic | なし | そのまま |
| JetBrains Mono | なし | そのまま |

- OFL では、**サブセットは改変版（Modified Version）にあたり、予約フォント名を名乗れない。**
- そのため Plex のサブセットは、フォント内部の名前（family・full・PostScript・unique ID）を置き換える（`scripts/fonts/subset.py`）。著作権表示とライセンス（name ID 0・13・14）は残す。
- 置き換えた後に "Plex" が残っていないことは、スクリプトが確認する。

## 案（PM_REVIEW_08 §4）
| 案 | 見出し | 本文 | 数字・データ |
|---|---|---|---|
| A 編集的 | Shippori Mincho B1（600） | IBM Plex Sans JP（400・600） | IBM Plex Mono（400・600） |
| B 工学的 | 本文の太字（700） | IBM Plex Sans JP（400・600・700） | IBM Plex Mono（400・600） |
| C 読みやすさ重視 | 本文の太字（700） | BIZ UDPGothic（400・700） | JetBrains Mono（可変、100〜800） |

日本語のウェイトは、どの案も合計3つ以内（CLAUDE.md §4）。
