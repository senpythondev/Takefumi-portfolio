# CLAUDE.md — Portfolio "GROUND TRUTH / 原典"

あなた（Claude Code）は、フリーランスのフルスタックエンジニアのポートフォリオサイトを実装する**リードエンジニア**である。
企画・優先順位の最終判断はオーナー（ユーザー）とPMが行う。あなたは実装・技術提案・検証に責任を持つ。

## 0. 最初に読むもの（唯一の出典）

| ファイル | 内容 | 扱い |
|---|---|---|
| `docs/BRIEF.md` | コンセプト・情報設計・各シーン仕様・**ファクトシート** | 企画の正。数値・事実は必ずここから引く |
| `docs/KICKOFF_PROMPTS.md` | フェーズごとの作業指示 | オーナーが1フェーズずつ渡す |
| `docs/ASSET_CHECKLIST.md` | 素材と匿名化ルール | 素材を扱う前に確認 |
| `docs/STORYBOARD.md` | スクロール絵コンテ：**ホームの体験の唯一の設計図**（BRIEF §4〜§5 の「地層ごとのテキストパネル＋背景の3D」という構成を置き換える）。§3 の仕組みの変更は、この CLAUDE.md より優先する | ホームのシーンを作る前に確認 |
| `docs/concept/ART_DIRECTION.md` | ビジュアルの基準（参照画像4枚の「取り入れること／取り入れないこと」） | 3Dと見た目の作業の前に確認 |

- BRIEFと矛盾する実装をしない。矛盾や改善案に気づいたら、実装せずに**提案として報告**する。
- **数値・実績・事実を創作しない。** ファクトシートにない数字が必要になったら `TODO(fact)` を残して報告する。
  - 例外：CI が自動計測した Lighthouse などの数値は、計測日・計測条件・レポートを根拠とする `Metric`（確度＝実測）として表示してよい。
  - 追加の事実データは `docs/facts/` に置く（例：`genten-eval.json`）。ここにあるデータもファクトシートと同じく正とする。

## 1. 絶対ルール（守秘・誠実さ）

1. 顧客名・事業者を特定できる情報・顧客システムの実コード・実ログ・IPアドレス・ホスト名・AWSアカウントID・インスタンスID・（本人の公開用以外の）メールアドレスを**一切コミットしない**。
2. 外部リンクは次の許可リストのみ（`src/content/links.ts` に一元管理し、ここ以外にURLを書かない）：
   - `https://genten.vercel.app/`（本人の公開物）
   - `https://github.com/senpythondev`（本人）
   - `https://dev.to/kaze001`（DEVプロフィール）
   - `https://dev.to/kaze001/english-guides-say-y6-million-the-fsa-says-y18-million-genten-checks-japans-money-rules-against-4jfe`（Genten記事）
   - `mailto:sen.python.dev@gmail.com`（HTMLに平文で書かず、クライアント側で組み立てる）
   - `https://pegasus-job.com`（先方の了承後に有効化。`NEXT_PUBLIC_ENABLE_PEGASUS_LINK` フラグで制御）
   - 技術経歴書に記載された内容は公開してよい。サイトに載せる個人情報は、名前・メール・GitHub・DEVだけにする。
3. AIトレーニングプラットフォームの名称・タスク内容・リポジトリ名は書かない。
4. セキュリティ診断の演出はすべて模擬データで作り、UI上に `再現` ラベルを表示する。実在の攻撃ペイロードや悪用可能なコードは載せない。
5. 確度ラベル（`実測`／`概算`／`再現`）はファクトシートの指定どおりに付ける。画面に出す表示名は `確認済み／Verified`・`概算／Approx.`・`再現／Reconstructed`（PM_REVIEW_08 §3-b、オーナー承認済み）。内部の値（`measured`／`approx`／`reconstructed`）と BRIEF の定義は変えない。
6. コミット前に `confidentiality-guard` サブエージェントでチェックする。

## 2. 技術スタック（セットアップ時点の最新安定版を使う）

- **Next.js（App Router）＋ TypeScript（strict）**、Vercelにデプロイ。可能な部分は静的生成。
- **React Three Fiber ＋ drei ＋ @react-three/postprocessing**（3D）
- **GSAP ＋ ScrollTrigger**（スクロール演出）、**Lenis**（スムーズスクロール）
- **Tailwind CSS**、デザイントークンは `src/styles/tokens.ts` に集約
- **next-intl**（`ja` を既定、`en`）
- **zod**（コンテンツスキーマ）
- **pdf-lib**（特許シーンの透かしPDFをクライアント側で生成）
- 品質ティアの決め方（ライブラリなし。PM_REVIEW_06・07 で detect-gpu を外した）：簡単な判定（reduced-motion・Save-Data・WebGL2 非対応・ソフトウェア描画は static、タッチ端末は medium から、デスクトップは high から）＋ drei の `PerformanceMonitor` による実行中の自動調整
- **Playwright**（E2E・スクリーンショット比較）、**Lighthouse CI**（性能の自動計測）

ライブラリを追加するときは、理由とバンドルサイズへの影響を報告してから入れる。

## 3. アーキテクチャ方針

```
src/
  app/[locale]/page.tsx          # ホーム：シネマティック・スクロール（docs/STORYBOARD.md）
  app/[locale]/work/[id]/        # 案件ごとのケーススタディ（長い説明文はここ。HTML が本体で、JS なしで読める）
  app/[locale]/evidence/[id]/    # 根拠ページ（数字ごと。JS なしで読める）
  content/                        # 型付きコンテンツ（ja/en）。schema.ts で zod 検証
    schema.ts                     # Layer, Metric, Evidence, Confidence('measured'|'approx'|'reconstructed')
    layers.ja.ts / layers.en.ts
  components/
    layout/                       # 深度計、言語切替、30秒ボタン
    evidence/                     # 根拠ドロワー（全数字クリック可能）
    core-sample/                  # ボーリングコア・ナビゲーター
    layers/<layer-id>/            # 各地層のHTML部分
  three/
    Stage.tsx                     # 単一の固定Canvas（WebGLコンテキストは1つだけ）
    scenes/<layer-id>/            # 各地層の3Dシーン（動的import）
    quality.ts                    # 品質ティア（high/medium/low/static）の判定と自動調整
  lib/scroll/                     # Lenis + ScrollTrigger の統合、現在の地層の状態管理
public/media/                     # 匿名化済み素材のみ
```

- **Canvasは1つだけ。** スクロール位置から「現在の地層」を決め、その地層と前後1枚のシーンだけをマウントする。それ以外は破棄してGPUメモリを解放する。
- 各シーンは遅延読み込みの独立したチャンクにする（3Dの描画ツリー内のシーンは `React.lazy`）。最初の描画（LCP）に3Dを含めない。
- **3Dは、読み込みが終わったらすぐ準備を始める**（medium と high ティア。最初の操作を待たない。STORYBOARD §3-2）。準備中の様子は、第0幕のボアホールが掘り進む演出で見せる。ページを止める読み込み画面は作らない。low ティアは変化があるときだけ描く。
- **ホームはシネマティック・スクロール**（STORYBOARD §3-1）：各シーンは「1行の見出し＋大きな数字2〜3個＋ケーススタディへのリンク」だけにし、長い説明文は `/[locale]/work/[id]` に置く。各幕は固定した全画面のシーンで、スクロール量に対応したタイムラインとして再生し、戻せば逆再生される。
- **ポストプロセス**（ブルーム、被写界深度）は high ティアで使い、medium では軽量版にする（STORYBOARD §3-4）。
- **static 版と reduced-motion 版**は、同じ物語を、各シーンのポスター画像と HTML で見せる（STORYBOARD §3-5）。
- 確度の記号（≈ ✓ ↺）は大きな数字にも小さく添え、ラベルの全文はケーススタディと根拠ページで示す（STORYBOARD §3-6）。
- コンテンツはすべてHTMLとして描画し、3Dは `aria-hidden` の演出レイヤーにする。
- 数値は `Metric` 型を通じてのみ描画し、`Evidence`（測定方法・確度・図表）と必ず紐づける。

## 4. 性能予算（このサイト自体が「性能改善エンジニア」の実績になる）

| 指標 | 目標 |
|---|---|
| LCP（モバイル・4G相当） | 2.5秒以内（目標2.0秒） |
| CLS | 0.05以下 |
| INP | 200ms以内（実際の操作への反応） |
| 初期JS（3Dを除く、gzip） | 180KB以下 |
| 3D基盤チャンク（three.js＋R3F＋drei の共通部分、gzip） | 250KB以下（2026-11-18 実測 193.5KB） |
| 各3Dシーンのチャンク | 250KB以下（gzip、テクスチャ除く） |
| TBT | **ホームは計測して報告するだけ**（合否の条件から外す。STORYBOARD §3-3）。ケーススタディ・根拠ページ・static 版は 200ms 以内 |
| 3D関連の合計（基盤＋全シーン＋テクスチャ・モデル、圧縮後） | 1.5MB以内を目安（STORYBOARD §3-3）。次の幕のアセットは先読みする |
| 操作直後の Long Task（4倍スロットリング） | 1回あたり100ms以下（目標） |
| フレームレート | デスクトップ60fps、モバイル30fps以上 |
| 動画1本 | 3MB以下、ポスター画像必須、画面に入ってから読み込む |
| 日本語Webフォント | サブセット化、ウェイトは最大3つ |
| Lighthouse（モバイル） | Performance 90以上、Accessibility 100 |

- `prefers-reduced-motion` のときは3Dを読み込まず、各シーンのポスター画像と HTML で同じ物語を見せる。
- WebGL非対応・低性能端末（quality=`static`）でも全コンテンツが読めること。
- 最終的な実測Lighthouseスコアをフッターに表示する（自分の主張に根拠をつける）。

## 5. モデルの使い分け（Claude MAXプラン）

| 場面 | モデル | 切替 |
|---|---|---|
| 各フェーズの計画（Plan Mode）、アーキテクチャ、3Dシーン設計、GSAPタイムライン、セキュリティ地層の実装 | **Claude Opus 5.5**（既定） | `/model opus` |
| 特に難しい部分だけ：独自GLSLシェーダー（地層・コアのマテリアル）、45,000インスタンスの描画最適化、複雑な物理表現 | **Claude Fable 5.2** | `/model fable` |
| スタイリング、レイアウト調整、i18nの配線、コピーの流し込み、テストの追加 | **Claude Sonnet 5.5** | `/model sonnet` |
| 定型的なデータ変換・一貫性チェック（サブエージェント） | **Claude Haiku 5.5** | サブエージェントの `model:` で指定 |

- Fable 5.2 は安全分類器がサイバーセキュリティ関連と判定した依頼で自動的に別モデルへ切り替わることがある。**セキュリティ地層の作業は Opus 5.5 で行う。** 都市の描画最適化をFableに依頼するときは「45,000個のインスタンスを持つ都市の描画最適化」という純粋なグラフィックス課題として切り出す。
- 使用中のモデルを変えたら、作業ログ（§7）に記録する。

## 6. 作業の進め方

1. 各フェーズは **Plan Mode で計画 → オーナー承認 → 実装** の順。承認なしにフェーズを越えない。
2. 1シーン＝1ブランチ（`feat/layer-<id>`）。マイルストーンごとにコミットする。
3. 実装中は `npm run dev` で実際の見た目と挙動を確認する。見た目の作業は、スクリーンショットを撮って自分の目で確認してから完了とする。
4. 不明点・判断が分かれる点は推測で進めず、選択肢と推奨を添えて質問する。
5. この CLAUDE.md は、**PM レビューで承認された変更に限り** Claude Code が更新してよい（オーナー承認済みの運用ルール、PM_REVIEW_07 §4）。更新したら WORKLOG に記録する。

## 7. 完了の定義（各フェーズ・各シーン共通）

- [ ] `npm run build` が警告なしで通る
- [ ] `npm run lint` と `npm run typecheck` が通る
- [ ] Playwright のE2E・スクリーンショットテストが通る（デスクトップ／モバイル／reduced-motion の3パターン）
- [ ] Lighthouse CI が §4 の予算内
- [ ] `confidentiality-guard` と `perf-auditor` のサブエージェントチェックが通る
- [ ] ja/en 両方で表示を確認した
- [ ] `docs/WORKLOG.md` に「やったこと／使ったモデル／計測値／残課題」を追記した

## 8. コマンド（Phase 2 で実装済み。Node 22.18 以上、`.nvmrc` 参照）

```
npm run dev                     # 開発サーバー
npm run build                   # 本番ビルド（prebuild で validate と check:confidentiality を先に実行）
npm run build:release           # 本番公開用ビルド（TODO(fact) が残っていたら失敗。VERCEL_ENV=production でも同じ）
npm run lint
npm run typecheck               # next typegen + tsc
npm run validate                # コンテンツ検証（zod、ja/en の一致、ファクトシートとの照合、docs/facts の整合性）
npm run check:confidentiality   # パターンによる守秘チェック（IP、AWS の ID・ARN、許可外の URL・メール、画像のメタデータ）
npm run test:e2e                # Playwright（desktop / mobile / reduced-motion）。先に build が必要
npm run test:e2e:update         # スクリーンショットの基準画像を更新
npm run budget                  # 初期JS 180KB の計測（Playwright）
npm run lhci                    # Lighthouse CI（モバイル、§4 の予算をアサーション）
npm run perf                    # 操作直後の Long Task（CPU 4倍・6倍スロットリング）。budget と perf の結果は perf-results/（コミットしない）
npm run screenshots -- <URL>    # レビュー用スクリーンショット（docs/screenshots/、コミットしない）
```

- pre-commit フック（`.githooks/pre-commit`、`npm install` で自動設定）が、ステージした内容に守秘チェックをかける。
