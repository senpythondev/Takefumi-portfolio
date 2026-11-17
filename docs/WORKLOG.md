# 作業ログ — GROUND TRUTH / 原典

> 各エントリ：やったこと／使ったモデル／計測値／判断と理由／残課題。
> 新しいエントリを上に追加する。

## 予定に対する実績（PM_REVIEW_01 A6）

| Phase | 見積（PLAN.md） | 実績 | 状態 |
|---|---|---|---|
| 1 全体計画 | —（見積の対象外） | 1セッション（2026-11-17） | 完了・PM承認済み（PM_REVIEW_01） |
| 2 土台づくり | 約4日（33h） | 約6時間＋レビュー対応 約1.5時間（2026-11-17 23時台〜11-18 6時前。壁時計） | **完了**（PM_REVIEW_03 で合格。PM_REVIEW_03・04 の対応後にコミット） |
| 3 中核の仕組み | 約5日 | — | 未着手 |
| 4 デザインシステムと地表 | 約3日 | — | 未着手 |
| 5 各地層 | 約14〜16日 | — | 未着手 |
| 6 品質の仕上げ | 約3日 | — | 未着手 |
| 7 公開 | 約0.5日 | — | 未着手 |

実績は Phase 2 以降、各 Phase の最初と最後のコミット時刻から作業時間を記録する（Phase 2 はコミットを保留したため壁時計で記録）。

---

## 2026-11-18 — PM_REVIEW_03・04 への対応と Phase 2 のコミット

**モデル：** Claude Opus 5.5（`confidentiality-guard` は定義どおり Sonnet）

### やったこと（PM_REVIEW_04 §3 の順）
1. **サブエージェントの配置**：`docs/_agents/confidentiality-guard.md`・`perf-auditor.md` を `.claude/agents/` にコピーし（内容が一致することを確認）、`docs/_agents/` を削除した。
2. **PM_REVIEW_04 §1 が対象とする個人情報の記述の削除**
   - スキャナから §1 に関係する検出パターンとその除外設定を削除。WORKLOG の該当箇所（過去のエントリを含む）を書き直した。
   - 作業ツリー全体を再確認：§1 の話題に触れているのは `docs/PM_REVIEW_04.md` 自体だけ（値なし。PM の文書なので触っていない）。
   - **履歴（`git log -p` 相当、全コミット）**：既存の2コミット（`e72037e`・`3afd342`）に、§1 の対象となる旧ルールの一般的な説明（BRIEF・CLAUDE.md・PM_REVIEW_01・WORKLOG）と拒否リストの記述が残っている。**具体的な値は履歴のどこにもない。** 履歴の書き換えは行っていない（オーナーの承認が必要なため）。
3. **拒否リストの仕組みの削除**（PM_REVIEW_04 §2）：スキャナの読み込み処理とスキップ用オプション、pre-commit フックの説明、CI のシークレット、`.gitignore` の項目、PLAN.md・CLAUDE.md §8 の記述。`npm run build` は拒否リストなしで通る。
4. **「Places フォルダ」の確認**：リポジトリにもホームディレクトリ以下にも、その名前のフォルダ・ファイルは見つからなかった。何を指すかオーナーに確認中。
5. **PM_REVIEW_03 §5（稼働時間）**：「月180h以内」「up to 180 hours a month」に修正。`TODO(fact)` は0件になり、本番公開用ビルドの検査も通る。
6. **PM_REVIEW_03 §6（Genten のフック）**：`Citation` 型を追加。出典リンク（許可リストのキー）が必須で、欠けるとビルドが失敗する。中の数字はファクトシートとの照合から外し、代わりに ja と en で金額が一致するか（「万」と "million" を換算して）を検査する。Genten の地層の冒頭に表示。
7. **CLAUDE.md §8**：PM の更新で元の雛形に戻っていたので、拒否リストの記述を除いて実際のコマンド一覧を書き直した。

### 判断と理由
| # | 判断 | 理由 |
|---|---|---|
| 1 | **`content-visibility: auto` を取り消した**（Phase 2 で TBT 対策として入れたもの） | 描画を省略した地層の中身は、位置を問い合わせると仮の高さ（1,200px）からはみ出して次の地層と重なる。axe の当たり判定（WCAG 2.2 target-size）がこの重なりを誤検出し、コンテンツを1か所変えただけでアクセシビリティの結果が変わった。Phase 3 の ScrollTrigger も正確な位置が必要。TBT は PM_REVIEW_03 §0 のとおり CI の値を正とし、170ms を超えたら Phase 3 の冒頭で原因を調べる |
| 2 | 古いレビュー文書（PM_REVIEW_04）は編集しない | PM の判断記録であり、値は含まない |
| 3 | スキャナのパターンは PM_REVIEW_04 §2 の範囲（IP、AWS の ID・ARN、許可外の URL・メール、画像のメタデータ）に、AWS のアクセスキー・秘密鍵・AWS のホスト名を残した | どれも「AWS の ID」「秘密情報」の延長で、個人情報の記述を含まない |

### 計測値（コミットする状態。開発機は共有 VM のため参考値）
| 指標 | 予算 | 計測値 |
|---|---|---|
| 初期JS（gzip） | 180KB | 136.0KB（ja・en） |
| LCP（モバイル） | 2.5秒 | 0.915〜0.934秒（中央値） |
| CLS | 0.05 | 0.000 |
| TBT | 200ms | 中央値 82ms（ja）／198ms（en）。各回 77〜291ms。直前の別の回では en の中央値が 217ms で不合格 |
| Lighthouse | Perf 90／A11y 100 | Perf 97〜100、A11y・Best Practices・SEO 100 |
| E2E | — | 58件合格（2回連続） |

`content-visibility` を外したことで、この開発機では TBT の中央値が予算の境目に戻った。**正式な値は push 後の GitHub Actions で確認する。**

### confidentiality-guard の結果
- **判定：PASS**（ブロッカーなし）。対象：既存の2コミット（`e72037e`・`3afd342`）と、`feat/foundation` 上のコミット対象81ファイル（スクリーンショットの基準画像18枚を含む）。
- 実行方法：`.claude/agents/` はこのセッションの開始後に配置したため、エージェント種別としてまだ登録されていなかった。そこで**定義ファイルの内容をそのまま渡し、定義どおり Sonnet・読み取り専用**で実行した（次のセッションからは `confidentiality-guard` として直接呼べる）。
- 検出なし：許可外の URL、IP・12桁の ID・ARN・インスタンスID・キー、電話番号、本人以外のメールアドレス、顧客名・企業名、§1 の対象となる具体的な値、スクリーンショットへの URL バー・OS のユーザー名・実データの写り込み、画像のメタデータ（PNG のテキストチャンクを直接解析）。
- 要オーナー確認（ブロッカーではない）：
  1. 既存の2コミットに残る、§1 の旧ルールの一般的な説明（値なし）。履歴を書き換えるかはオーナーが判断する。
  2. `docs/PM_REVIEW_04.md` 自体、`docs/PLAN.md`・`docs/PM_REVIEW_02.md` の「拒否リスト」という語（取りやめの記録。値なし）。この WORKLOG の §1 に関する記述は、話題の名前を出さない書き方に直した。
  3. 「AIトレーニングプラットフォーム」という総称（BRIEF の承認済み表記。固有名・タスク内容・リポジトリ名はない）。
  4. pegasus の旧テーマ名「TCD NANO」・新テーマ名「SWELL」（WordPress の製品名。顧客の特定にはつながらない）。

### GitHub
- `gh repo view senpythondev/Takefumi-portfolio`：**visibility が PUBLIC**（空のリポジトリ）。PM_REVIEW_03 §7 に従い、`origin` の設定と push は**行っていない**。非公開に変更されたら push する。

---

## 2026-11-17〜18 — Phase 2：土台づくり（ブランチ `feat/foundation`）

**モデル：** Claude Opus 5.5（全工程）。CLAUDE.md §5 では i18n の配線・コピーの流し込み・テストは Sonnet 推奨だが、モデルの切替はオーナーの操作のため、今回は Opus のまま進めた。

### 開始時の確認（PM_REVIEW_02 の指示）
- **`.claude/` が届いていない。** プロジェクト内、`~/.claude/agents`、ホームディレクトリ以下、`/tmp` のどこにも `confidentiality-guard.md`・`perf-auditor.md` がなかった。始動パックのアーカイブも見つからない。
  - そのため「`.claude/` のコミット」と「既存2コミットを含む `confidentiality-guard` での再チェック」は**未実施**。
  - Phase 2 の実装は進めたが、**コミットはすべて保留**した（CLAUDE.md §1-6「コミット前に confidentiality-guard でチェックする」を守るため）。作業はブランチ `feat/foundation` に未コミットの状態で残っている。

### やったこと（PLAN.md の ID 順）
| ID | 内容 |
|---|---|
| 2-1 | `.npmrc`（save-exact・engine-strict）、`.nvmrc`（22.23.3）、`engines`（Node 22.18 以上：TypeScript を直接実行する機能が必要） |
| 2-2 | Next.js 16.4.6、TypeScript 6.0.3（strict＋`noUncheckedIndexedAccess`・`erasableSyntaxOnly`）、Tailwind 4.3.5、ESLint 9.39.5（flat config、`eslint-config-next`） |
| 2-3 | next-intl 4.15.1。`/ja`・`/en` を静的生成。`/` だけ proxy で Accept-Language から振り分け。hreflang（＋`x-default`）・canonical・`metadataBase` |
| 2-4 | `src/content/schema.ts`（zod）、`validate.ts`（構造・本文中の裸の数字・ja/en の一致・Genten データとの一致・派生値の検算）、`scripts/validate-content.ts`（BRIEF §6＋`docs/facts/` との照合、CSV と JSON の一致、`TODO(fact)` の本番ビルド停止） |
| 2-5・2-6 | `layers.ja.ts`・`layers.en.ts`：11地層、各74個の数値（Metric）。英語は自然な英語で、数値・確度・出典は ja と機械的に一致させている |
| 2-7 | HTMLだけ版のページ。数値ボタン（HTML の `command` 属性で JS なしに根拠を開く）、根拠ダイアログ74個、フォールバック用の小さな JS、メールの組み立て、地層の一覧、Genten の評価表と25問×3構成の正誤グリッド、深層8案件、スキル評価 |
| 2-8 | Playwright：desktop／mobile／reduced-motion の3プロジェクト、各20テスト（58件合格、2件は reduced-motion 専用のため他でスキップ）。axe（WCAG 2.2 AA）、スクリーンショット基準画像18枚 |
| 2-9 | Lighthouse CI（§4 の予算をアサーション化、5回の中央値）、初期JSの計測テスト（`npm run budget`） |
| 2-10 | 決定的な守秘チェック `scripts/check-confidentiality.ts`、理由つき除外リスト、pre-commit フック。※サブエージェント定義はオーナーの `.claude/` を使う（PM_REVIEW_01 D1）ので書いていない |
| 2-11 | ベースライン計測（下記）。加えて、Phase 3 で入れる予定のライブラリのサイズを隔離環境で試算 |
| 2-12 | この WORKLOG、`docs/EVIDENCE_INTAKE.md`（74項目、オーナー記入用）、`docs/facts/README.md` |
| 2-13 | `.github/workflows/ci.yml`（リモート未作成のため未実行） |
| ほか | `scripts/screenshots.ts`（レビュー用。出力はコミットしない）、CLAUDE.md §8 のコマンド一覧を実際の内容に更新 |

### 計測値（この開発機：GPU なしの共有 VM。下記「計測の信頼性」を参照）
| 指標 | 予算（CLAUDE.md §4） | 計測値 | 方法 |
|---|---|---|---|
| 初期JS（gzip） | 180KB 以下 | **136.0KB**（ja・en とも）。うち React DOM 71.8KB＋Next.js ランタイム約63KB、自前のクライアントコードは **1.1KB** | Playwright：最初の操作前（network idle まで）に読まれた全スクリプトを zlib 既定レベルで gzip。1KB＝1,000バイト（厳しいほうの解釈） |
| LCP（モバイル・4G相当） | 2.5秒以内（目標2.0秒） | **0.913〜0.926秒**（中央値） | Lighthouse CI 0.16.1、既定のモバイル設定（シミュレーション）、各URL5回 |
| CLS | 0.05 以下 | **0.000** | 同上 |
| TBT（INP の代理指標） | 200ms 以内 | 中央値 **184ms（ja）／140ms（en）**。各回のばらつき 49〜207ms | 同上 |
| Lighthouse Performance | 90 以上 | **97（ja）／99（en）** | 同上 |
| Lighthouse Accessibility | 100 | **100／100** | 同上（Best Practices 100、SEO 100） |
| HTML（gzip） | — | 40.8KB（ja）／36.8KB（en）。非圧縮 約364KB（React の描画データが本文と二重に入るため） | Playwright |
| CSS（gzip） | — | 4.1KB | Playwright |
| DOM 要素数 | — | 約2,770 | Lighthouse |
| 開発モードの警告・エラー | — | 0件（ja・en、ダイアログを開いた状態も含む） | `next dev` を Playwright で読み込み |

**Phase 3 で入れる予定のライブラリの試算**（隔離したディレクトリで esbuild によりバンドルして gzip。Turbopack での実測は Phase 3）：
| まとまり | gzip | 内訳・備考 |
|---|---|---|
| 演出バンドル（GSAP＋ScrollTrigger＋Lenis） | 50.5KB | 初期JS 136KB に足すと 186.5KB で予算超過 → load 後に遅延読込する方針（PM_REVIEW_01 A1）が必須であることを確認 |
| **3D基盤（three.js＋R3F＋drei の最小構成）** | **254.2KB** | **上限 250KB（PM_REVIEW_01 D8）をシーンのコードなしで超える。** R3F が three.js の全クラスを既定で登録するため tree-shaking が効かない（three.js 750KB min）、R3F 自体も独自の React reconciler を含む（173KB min） |
| ポストプロセス（high ティアのみ） | 47.7KB | 別枠（PM_REVIEW_02 §2） |

**計測の信頼性：** この開発機はリモートデスクトップ・ブラウザ・他のセッションと CPU を共有しており、計測中の負荷平均は最大5.3（6コア）。同じビルドでも TBT が1回ごとに 49〜262ms の範囲で揺れた。Lighthouse のシミュレーションは観測した処理時間を CPU 4倍の遅さに換算するため、揺れも増幅される。**正式な値は CI（GitHub Actions）での計測とする。** ja の中央値 184ms は予算 200ms に対して余裕が小さい。

### 判断と理由
| # | 判断 | 理由 |
|---|---|---|
| 1 | **ESLint を 9.39.5 に固定**（最新は 10.15.0） | `eslint-config-next` が依存する `eslint-plugin-react`・`jsx-a11y`・`import` の peer が ESLint 9 まで。npm は 9.39.5 に「サポート終了」の警告を出す。プラグインが 10 に対応したら移行する（TypeScript 6.0.3 固定と同じ理由） |
| 2 | **根拠ダイアログを静的な HTML 文字列で出力**（`dangerouslySetInnerHTML`） | ダイアログは HTML の `command` 属性で開き `<form method="dialog">` で閉じるので、React が管理する必要がない。DOM の約4割を React の hydration から外せる。中身は検証済みのコンテンツだけで、値はすべてエスケープしている。HTML として残るので検索エンジン・スクリーンリーダーからは従来どおり読める |
| 3 | **画面外の地層に `content-visibility: auto`** | 読み込み時の長いタスク（HTML の解析＋全地層のレイアウト）を短くする。導入前は同じ環境で TBT 88〜262ms、導入後は 49〜207ms。内容はアクセシビリティツリーに残り、ページ内検索も効く。Phase 3 の sticky なスクロール演出と合わせて見直す |
| 4 | CSS のスムーズスクロールを使わない | Phase 3 で Lenis がスクロールを担当するため競合する。reduced-motion とも矛盾しない |
| 5 | **pegasus のドメイン名はタイトルにも出さない**（フラグが false の間） | BRIEF §5-3 は「掲載・リンクについて先方の了承を得てから公開」。リンクだけでなく掲載（ドメイン名の表示）も了承待ちと解釈した。タイトルは「就労支援法人サイトの移行」 |
| 6 | 参画条件の「180h」は Metric にしない（本文として表示） | 実績の主張ではなく条件の提示なので、根拠ドロワーで裏付けるものではない。年・日付・期間を本文として扱うルール（BRIEF §6）と同じ考え方。検証スクリプトの許可リストに理由つきで登録 |
| 7 | 「30秒で見る」の「30」は Metric にしない | BRIEF §4 が定める UI 機能の名前であり、主張ではない |
| 8 | 出典の表示は「本人の実績記録」（ja）／"Author's project records"（en） | ファクトシートの各項目がどの文書に由来するかまでは確認できないため、特定の文書名を出さない。Genten の評価は「評価結果（本人が実施）」、平均応答時間は「DEV の記事」 |
| 9 | スキル評価の C は定義を表示しない | BRIEF §6 に A・B の定義しかない。定義を創作しない |
| 10 | 「数万件」「ゼロ」も Metric にする（確度つき） | 数字（量）の主張なので根拠と確度を付ける。数字の文字がなくても ja/en の一致検査は通る |
| 11 | メタ情報（description）の「約8年」は `career-years` の値を埋め込む | 数字の出典を1か所にするため |
| 12 | 言語切替リンクに `aria-label` を付けない | 表示テキスト（English／日本語）と異なる名前は WCAG 2.5.3 に反する（axe で検出） |
| 13 | 外部リンク等の当たり判定を24px以上に | WCAG 2.2（2.5.8）。Lighthouse で検出 |
| 14 | 画面外へはみ出す要素の対策（表のスクロール領域を `position: relative` に） | 表の中のスクリーンリーダー用テキストがスクロール領域の外に出て、モバイルでページ幅が 682px に広がっていた。テストも「デバイス幅との比較」に直した（以前のテストは広がった幅と比べていたため見逃していた） |
| 15 | レビュー用スクリーンショットはコミットしない（`docs/screenshots/` は .gitignore） | 生成物でサイズが大きい（今回3.8MB）。`npm run screenshots -- <URL>` でいつでも再生成できる |
| 16 | 初期JSの「KB」は 1,000 バイトで数える | 1,024 より厳しい側 |
| 17 | `next.config.ts` に `agentRules: false` | Next.js 16.4 の `next dev` は AI エージェントを検出すると `AGENTS.md` を自動で書き込む（`node_modules/next/dist/server/lib/generate-agent-files.js` で確認）。エージェント向けの指示は CLAUDE.md に一本化するため無効化し、生成されたファイルは削除した。なお、その中身は「Next.js 16 は破壊的変更が多いので `node_modules/next/dist/docs/` の同梱ドキュメントを読むこと」という案内で、今後の実装ではこれに従う |

### 未完了の完了条件（CLAUDE.md §7）とブロッカー
| 条件 | 状態 | 必要なこと |
|---|---|---|
| `npm run build` が警告なしで通る | 記録時点では prebuild の守秘チェックで止まっていた。PM_REVIEW_04 の対応で解消（2026-11-18 のエントリ） | — |
| lint・typecheck | ✅ | — |
| Playwright（3パターン） | ✅ 58件合格（2回連続で安定） | — |
| Lighthouse CI | ✅ 全アサーション合格（ただし TBT は環境の揺れが大きい） | CI での正式計測 |
| `confidentiality-guard`・`perf-auditor` | ❌ 未実行 | `.claude/` の配置 |
| ja/en の表示確認 | ✅ スクリーンショットで確認 | — |
| WORKLOG | ✅ このエントリ | — |


### 残課題
1. **3D基盤 254KB が上限 250KB を超える見込み**（Phase 3 開始前に PM の判断が必要）。選択肢と推奨は Phase 2 の報告に記載。
2. `TODO(fact)`：「稼働180h以内」が月あたりかどうか（英語版で "a month" を補っている）。本番公開用ビルドはこれが残っていると失敗する。
3. Genten の記事のフック（「英語の解説は600万円、金融庁は1,800万円」）は実績値ではなく制度の数字の引用。Metric にするなら確度ラベルの扱いを決める必要がある（Phase 5 の地層2の前まで）。Phase 2 の HTML 版には入れていない。
4. GitHub のプライベートリポジトリができたら：`git remote add origin <URL>` → `git push -u origin main feat/foundation`。CI は `.github/workflows/ci.yml` で用意済み。
5. CI ではスクリーンショットの基準画像と同じ日本語フォント（Droid Sans Fallback）を入れている。Phase 4 でサブセット化したフォントを自前ホストしたら、この依存はなくなる（基準画像は撮り直し）。
6. 根拠ドロワーの完成版（図表、`#ev-…` のリンクをコピーする機能など）は Phase 3-7。
7. iPhone 実機での計測は Phase 3 の `?debug=1` HUD で行う（PM_REVIEW_02 §8）。

---

## 2026-11-17 — PM_REVIEW_01 への対応（Phase 2 開始条件）

**モデル：** Claude Opus 5.5

### やったこと
- 更新版の `CLAUDE.md`・`docs/BRIEF.md`・`docs/KICKOFF_PROMPTS.md`・`docs/ASSET_CHECKLIST.md`・`docs/PM_REVIEW_01.md` を全文読んだ。
- `git init`（ブランチ `main`）、`.gitignore` を作成、ドキュメントだけの最初のコミット `e72037e`。
  - コミット作成者はグローバル設定の公開用アイデンティティ（`senpythondev`）。リポジトリを公開した場合も、非公開のメールアドレスは履歴に残らない。
  - `.gitignore` は PM 指定の項目に加えて、`.env.example` だけは追跡する例外と、`.claude/settings.local.json` を入れた。
- コミット前の守秘チェック：`confidentiality-guard` は `.claude/` が未着のため**実行できなかった**。代わりに D9 の決定的チェック相当を grep で手動実行（IPv4、12桁の数字、ARN、インスタンスID、メールアドレス、URL、内部ホスト名）。
  - 結果：メールは本人の公開用1種のみ、URL は許可リスト内（genten.vercel.app、github.com/senpythondev、pegasus-job.com）のみ。
- D7・D8・D9 の差分を確認し、オーナーに報告（下記）。

### TypeScript を 6.0.3 に固定した理由（PM_REVIEW_01 A5）
- 2026-11-17 時点の npm `latest` は 7.0.2（Go によるネイティブ版）。
- `typescript-eslint` の peerDependencies が `typescript: ">=4.8.4 <6.1.0"` のため、7 系では ESLint の型情報つきルールが動かない。
- よって 6.0.3 に固定する。`typescript-eslint` が 7 系に対応したら移行を検討する（移行時はこのログに記録）。

### D7・D8・D9 の差分報告（PM の回答待ち）

**D7：確度ラベル（付録B ↔ BRIEF §6「確度ラベルの付け方」）** — 食い違いのあるものだけ：

| 数値 | 付録Bの案 | ルール | 対応 |
|---|---|---|---|
| pegasus「当初見積2〜4時間」 | 実測（行末の `実測` が掛かると解釈） | 概算（「〜」が付く、見積） | ルールに従い**概算** |
| pegasus「1/6以下」 | 実測（同上） | 概算（ルールの例示） | ルールに従い**概算** |
| PHP「約45,000本」 | 概算 | 例示では**実測**（数えた件数）だが、本文の「約が付く→概算」にも当たる | **要判断**。推奨：概算（「迷う場合は弱いほう」）。正確な本数があるなら、その数を実測で出す。なお BRIEF 内でも「約45,000本」（§5-4・§6）と「45,000ファイル」（§4・キャッチアップ証拠）が混在している |
| AIツールの導入年（2022／2023／2025） | 実測 | どの区分にも当たらない | 推奨：日付・期間（案件期間・学歴・導入年）は Metric にせず、ラベルなしの本文として扱う |

- 読み方の前提：行末のラベルはその行の主たる結果に掛かり、同じ行の見積比較などはルールで決まる、と解釈した（1/6以下の例示から）。この解釈だと「約6時間・約10,000件」は「約2日」と同じく `実測` のまま。
- 新しく追加された数値（チーム規模「6〜10名」「1〜5名」、「4年以上」など）は、ルールどおり `概算` にする。

**D8：3Dのサイズ予算** — **差分なし。** B6（共通の3D基盤は別枠、シーンのチャンクにはシーン固有分だけを数える、どちらも初期JSに含めない）は PM の原則と同じ。B6 で後回しにしていた基盤の上限値は、PM の 250KB（gzip）を採用する。
- 計測の定義（具体化）：基盤＝シーンを1枚もマウントしない状態で Stage を起動したときに追加で読まれる JS。シーン＝基盤の読込後、そのシーンをマウントしたときに増える JS。
- 確認したい点（Phase 3 までに回答でよい）：high ティア専用のポストプロセス（`postprocessing`）をどこで数えるか。推奨は「基盤に含めず、high 専用の追加チャンクとして別に計測・報告する」。three.js 本体だけで推定150KB前後あり、ポストプロセスまで基盤に入れると 250KB を超えるおそれがある（いずれも推定。Phase 2-11 と Phase 3 で実測する）。

**D9：守秘チェック** — 決定的なスクリプトを第一の防御線にする方針、pre-commit と CI の両方での実行、コミットとビルドの停止、EXIF、理由つきの除外リストは**すべて採用**（B8 より範囲が広い）。B8 との差分は2点：
1. **拒否リスト**：提案したが、PM_REVIEW_04 で取りやめになった（守秘は出典の制限・パターンのスキャナ・`confidentiality-guard` の3つで守る）。
2. **`confidentiality-guard` のモデル**：B8 では Haiku ではなく Sonnet を提案した。更新版のエージェント定義が未着のため、指定を確認できていない。届いたら確認する。
- 実装メモ（差分ではない）：スクリプトは Node 22 に組み込みの TypeScript 実行機能で動かす（依存の追加なし）。フックは `core.hooksPath`＋npm の `prepare` で設定する（husky を入れない）。Vercel 上のビルドも止めるため `prebuild` でも実行する。除外リストに入る見込みのもの：SVG の名前空間 URL、構造化データの `schema.org`、テスト設定の localhost、`package-lock.json` 内のレジストリ URL。

### 判断と理由（PLAN.md §6 のうち、レビューで触れていないもの。PM の判断原則で決定）

| # | 対象 | 判断 | 理由 |
|---|---|---|---|
| 1 | A5：BRIEF §4 の Genten「2日で」 | 画面では「**約2日**」と書く | ファクトシートの表記に合わせる（原則2：誠実さ）。BRIEF §4 の本文は「2日で」のまま残っている |
| 2 | A8：移行前のコア数がない | 届くまで**コア数を示さない**。コアは抽象的に描き、シミュレーションには `再現` を付ける | 原則2「データのない演出は作らない。足りなければ控えめに見せる」 |
| 3 | A10：測定方法の記述がない | 根拠ドロワーにはファクトシートの記述と確度だけを表示。測定方法は `docs/EVIDENCE_INTAKE.md`（Phase 2 で作成）にオーナーが書いたものだけを載せる | 原則2：方法を創作しない |
| 4 | A11：英字表記・DEV・LinkedIn | `TODO(fact)` のまま進める | BRIEF §6・CLAUDE.md §1-2 の指示どおり |
| 5 | PLAN §2.6-5「本番ビルドで TODO(fact) が残っていたら失敗」の修正 | `npm run build` では件数を表示するだけにし、**本番公開用のビルド**（`VERCEL_ENV=production`）でだけ失敗させる | 元の案のままだと、TODO(fact) が残る Phase 2〜5 の間、完了の定義「build が通る」を満たせない。TODO が残ったまま公開されないことは本番ビルドで担保できる（原則2） |
| 6 | A12：フッターの Lighthouse スコア | CI が計測した値を `Metric`（`実測`）として出し、計測日・条件・レポートを根拠に付ける | CLAUDE.md §4 が明示的に求めている。経歴の事実ではなく自動計測値で、根拠つきで出せば誠実さの原則にも合う |
| 7 | B1：Genten の iframe | **クリックしてから読み込む**（スクリーンショット＋「ここで試す」＋外部リンク） | 原則3（性能予算）。訪問者の操作で LLM API の費用が発生することも避けられる |
| 8 | B2：ヒーローの懐中電灯効果（タッチ端末） | 光が自動でゆっくり動き、ドラッグで追従。ジャイロは使わない | iOS の許可ダイアログを避ける。原則と衝突しない |
| 9 | B3：要約カードの印刷用スタイル | Phase 4 で CSS だけで対応（JS 追加なし） | 原則3への影響なし。エージェントが社内共有しやすくなる |
| 10 | B5：Lighthouse スコアの計測日・条件 | 併記する | 原則2 |
| 11 | B10：アクセス計測 | **入れない**。オーナーが希望したときに改めて提案する | 原則1・3 |
| 12 | B11：セキュリティヘッダー | Phase 6 で選択肢を出す | 今決める必要がない |
| 13 | Genten の評価データの形式 | オーナーからは CSV（ASSET_CHECKLIST の `問番号, 構成名, 正誤`）で受け取り、こちらで `docs/facts/genten-eval.json` に変換する。JSON の形式案は Phase 2 で `docs/facts/README.md` に置く | BRIEF は JSON、ASSET_CHECKLIST は CSV と書いており、オーナーの負担が小さいほうに合わせる |

### 計測値
- なし（コード未着手）。

### ブロッカー（Phase 2 開始条件）
- [ ] **`.claude/` がまだプロジェクト内にない**（`/home/oono/Oono-portfolio/.claude` が存在しない。ホームディレクトリ以下にも `confidentiality-guard.md` は見つからなかった）。隠しフォルダなので、ファイルマネージャーでは隠しファイルの表示（Ctrl+H）が必要。または `cp -r <始動パック>/.claude /home/oono/Oono-portfolio/`。
- [x] `git init` と最初のコミット（`e72037e`）
- [x] D7・D8・D9 の差分報告（PM の回答待ち：D7 の45,000本と導入年、D8 のポストプロセス、D9 の守秘チェックの構成）

### 残課題
- `.claude/` が届いたら、コミットして `confidentiality-guard` で最初のコミット分も含めて改めてチェックする。
- `pegasus-job.com` はドキュメントに書かれている。リポジトリは非公開なので現状は問題ないが、Phase 7 でリポジトリの公開を判断するときに、先方の了承状況とあわせて再確認する。
- 実機検証用の端末（PM 確認中、D10）。

---

## 2026-11-17 — Phase 1：全体計画

**モデル：** Claude Opus 5.5

### やったこと
- `CLAUDE.md`・`docs/BRIEF.md`・`docs/ASSET_CHECKLIST.md`・`docs/KICKOFF_PROMPTS.md` を読み、`docs/PLAN.md` を作成した。
- npm で各ライブラリの最新安定版を確認した（PLAN.md §1.3）。
- genten.vercel.app のレスポンスヘッダーを確認した（X-Frame-Options・CSP frame-ancestors なし＝iframe 埋め込みは技術的に可能）。

### 計測値・環境
- 開発機は GPU のない VM（WebGL はソフトウェア描画）。fps・GPU メモリは実機でのみ計測する。

### 残課題
- PM_REVIEW_01 で回答済み。
