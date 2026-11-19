# デザイントークン

> `scripts/build-tokens.ts` が `src/styles/tokens.ts` から生成する。手で編集しない（`npm run tokens`）。
> コントラスト比は WCAG の相対輝度による。

## ベースと文字
| 名前 | 値 | 地色 ground との比 | stratum との比 |
| --- | --- | --- | --- |
| ground | `#13110f` | 1.00 | 1.07 |
| stratum | `#1b1815` | 1.07 | 1.00 |
| seam | `#34302a` | 1.44 | 1.35 |
| ink | `#ece6dd` | 15.19 | 14.25 |
| inkMuted | `#b3aa9f` | 8.22 | 7.72 |

## 信号色（光る・強調するときだけ。地層の色には使わない）
| 名前 | 値 | ground との比 |
| --- | --- | --- |
| evidence | `#8fcbd0` | 10.42 |
| crisis | `#e26943` | 5.68 |
| ok | `#9cc9a0` | 10.11 |

## 確度ラベル
| 確度 | 表示名 | 値 | ground との比 |
| --- | --- | --- | --- |
| measured | 確認済み／Verified | `#8fcbd0` | 10.42 |
| approx | 概算／Approx. | `#ddb877` | 10.04 |
| reconstructed | 再現／Reconstructed | `#d3b9a6` | 10.10 |

## 地層（上から順。隣同士のコントラスト比は 1.4 以上）
| 地層 | 値 | 次の地層との比 |
| --- | --- | --- |
| surface | `#988979` | 1.74 |
| current | `#4c6970` | 1.99 |
| genten | `#8c9b7e` | 1.93 |
| pegasus | `#5a677e` | 1.42 |
| php-audit | `#9d7665` | 1.62 |
| auction | `#b2a381` | 2.12 |
| patent | `#5c6e7c` | 1.42 |
| deep | `#8f7f97` | 1.73 |
| catchup | `#4a645b` | 1.49 |
| bedrock | `#86776c` | 2.15 |
| next | `#4d463f` | — |

## 伝統色の名前（帯のラベルとケーススタディの見出しに小さく添える。値は上の表のまま）
| 地層 | 色名 | ローマ字 |
| --- | --- | --- |
| surface | 胡桃染 | kurumizome |
| current | 藍鼠 | ainezu |
| genten | 青磁色 | seiji-iro |
| pegasus | 紺鼠 | konnezu |
| php-audit | 錆色 | sabi-iro |
| auction | 黄土色 | ōdo-iro |
| patent | 藍鉄色 | aitetsu-iro |
| deep | 鳩羽色 | hatoba-iro |
| catchup | 鉄色 | tetsu-iro |
| bedrock | 煤竹色 | susutake-iro |
| next | 墨色 | sumi-iro |

## 金継ぎ（PHP診断の亀裂の封じ込めと、終幕のコアの継ぎ目の2か所だけ）
| 名前 | 値 |
| --- | --- |
| kintsugi | `#d4a94e` |

## 都市（地層4）
| 名前 | 値 |
| --- | --- |
| building | `#444e59` |
| buildingLit | `#667380` |
| pulse | `#e26943` |
| fog | `#13110f` |

## 書体・余白・動き
- 本文：`var(--font-face-sans, system-ui), var(--font-face-mono, system-ui), 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif`
- 見出し：`var(--font-face-heading, var(--font-face-sans, system-ui)), var(--font-face-sans, system-ui), 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif`
- 等幅：`var(--font-face-mono, ui-monospace), ui-monospace, 'SFMono-Regular', 'Menlo', 'Consolas', var(--font-face-sans, system-ui), 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', 'Yu Gothic UI', 'Meiryo', monospace`
- 余白：gutter `clamp(1rem, 4vw, 3rem)`、本文の幅 `46rem`
- イージング：strata `cubic-bezier(0.2, 0.7, 0.2, 1)`、drill `cubic-bezier(0.6, 0, 0.4, 1)`
- 時間：quick 160ms、base 220ms、slow 400ms
