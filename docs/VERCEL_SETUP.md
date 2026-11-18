# Vercel の設定手順（オーナー向け）

PM_REVIEW_07 §5 の方針に沿った、プレビュー環境の取り込み手順。Hobby プランが前提。

- **守られる範囲：** Vercel 認証（Standard Protection）で守られるのは、プレビューと、各デプロイに固有の URL だけ。**本番のドメイン（`<プロジェクト名>.vercel.app`）は誰でも見られる。**
- **最初のデプロイ：** 新しいプロジェクトでは、最初のデプロイが `main` の本番扱いになる。これは避けられないので、プロジェクト名を推測されにくくし、`noindex` を付けて検索エンジンに載せない。
- **取り込み後：** 本番のブランチを、まだ存在しない `release` に切り替える。以後の push はすべてプレビュー（保護あり）になる。

## 0. 取り込みの前に済ませたこと（Claude Code）

| 項目 | 内容 |
|---|---|
| 検索エンジン対策 | 全レスポンス（ページ・画像・JS・404・`/` のリダイレクト）に `X-Robots-Tag: noindex, nofollow` を付ける。外れるのは `SITE_LAUNCHED=true` でビルドしたときだけ。E2E で常に確認している（`tests/e2e/headers.spec.ts`）。 |
| `/lab/*` | 有効なのは、ローカルの `npm run dev` と Vercel のプレビュー（`VERCEL_ENV=preview`）でのビルドだけ。本番のビルド、CI、ローカルの `npm run build` では 404 になる。 |
| ビルドの確認 | Git の管理下にあるファイルだけをまっさらなフォルダに写し、`npm ci` → `npm run build` を3通りの環境変数で試した。①`VERCEL_ENV=preview`：`/lab/city` を含む、`noindex` あり。②`VERCEL_ENV=production`：`/lab` なし、`noindex` あり。③ ②＋`SITE_LAUNCHED=true`：`noindex` なし。3つとも警告なしで成功した。 |
| 守秘チェック | Vercel のビルド環境には `.git` がない。そのため守秘チェックは、フォルダを走査するときも `.gitignore` に従うようにした。生成物やログをリポジトリの一部と誤認しない。 |
| `main` | Phase 3（PM_REVIEW_07 で合格）と上記の対応までを `main` に入れた。最初の本番デプロイにも `noindex` が付く。 |
| 計測用のブランチ | `vercel.json` の `git.deploymentEnabled`（minimatch のパターン）で、`ab/**` のブランチへの push ではデプロイを作らない（PM の指示）。`ab/*` は、CI の A/B 計測（`.github/workflows/ab.yml`）専用のブランチ。ほかのブランチはこれまでどおりプレビューになる。 |

## 1. 取り込み

1. Vercel のダッシュボードで **Add New… → Project** を開く。このリポジトリを **Import** する。
   - GitHub 連携の権限は **Only select repositories** にして、このリポジトリだけを許可する。
2. **Project Name**：推測されにくい名前にする（例：英小文字と数字のランダムな並び）。
   - この名前がそのまま `<名前>.vercel.app` になり、誰でも見られる。
   - 本名、`portfolio`、GitHub のユーザー名など、たどれる語は避ける。
3. **Framework Preset**：Next.js（自動で選ばれる）。**Root Directory**：`./` のまま。
4. **Build and Output Settings**：
   - Build Command：既定（`npm run build`）のまま。`prebuild` が内容の検証と守秘チェックを先に行う。
   - Install Command：**`npm ci`** を推奨（lockfile と同じ版を入れる）。
   - Output Directory：既定のまま。
5. **Environment Variables**：この時点では**何も設定しない**（§3 の表）。
6. **Deploy** を押す。最初のデプロイは `main` の本番デプロイになる。公開 URL で、`noindex` が付いた状態。

## 2. 取り込み直後の設定

1. **本番のブランチを `release` にする**
   - 場所：**Settings → Environments → Production → Branch Tracking**（画面によっては **Settings → Git → Production Branch**）。
   - `main` を `release` に変える。`release` ブランチは作らない。
   - これで `main` と `feat/*` への push は、すべてプレビューになる。
2. **Settings → Deployment Protection → Vercel Authentication** が **Standard Protection** になっていることを確認する（Hobby の既定）。
3. **Settings → General → Node.js Version** を **22.x** にする。`package.json` の `engines`（`>=22.18.0 <23`）が優先されるが、揃えておく。
4. **Web Analytics と Speed Insights は有効にしない。**
   - どちらもページに外部スクリプトを足すため、初期 JS の予算（180KB）と、第三者への計測データの送信に関わる。
   - 使いたくなったら PM と相談する。
5. ドメインは何もしない（Phase 7 で設定する）。

> 補足：プレビューには Vercel のツールバーが出る。表示されるのはログインしている本人のブラウザだけ。性能の正式な計測は CI で行うので、影響はない。

## 3. 環境変数の一覧

| 変数 | Production | Preview | ローカル | 意味 | 設定する時期 |
|---|---|---|---|---|---|
| `SITE_LAUNCHED` | 未設定（公開日に `true`） | 未設定 | 未設定 | `true` のビルドだけ `X-Robots-Tag` を外す。**ビルド時に読む**ので、設定したら再デプロイが必要 | Phase 7 |
| `NEXT_PUBLIC_ENABLE_PEGASUS_LINK` | 未設定（＝無効） | 未設定 | `.env.example` では `false` | 先方の了承後に `true`（Production と Preview の両方）。ビルド時に埋め込まれる | 先方の了承後 |
| `NEXT_PUBLIC_SITE_URL` | 未設定（公開日に本番ドメイン） | 未設定 | 未設定 | canonical・hreflang・OGP の基準 URL。未設定なら Vercel の本番 URL を使う | Phase 7 |
| `VERCEL_ENV`・`VERCEL_PROJECT_PRODUCTION_URL` | Vercel が自動で設定 | 自動 | — | **自分では設定しない**（下の注を参照） | — |
| `GT_RELEASE` | 不要 | 不要 | `npm run build:release` が設定する | `VERCEL_ENV=production` と同じ扱い | — |

`VERCEL_ENV` の値によってビルドが変わる：

- **`production`**：`TODO(fact)` が残っているとビルドが失敗する（`build:release` と同じ）。これは意図どおりで、未確定の数字を本番に出さないため。現在、未解決の `TODO(fact)` は0件。
- **`preview`**：`/lab` を含めてビルドする。

## 4. 取り込み後に Claude Code が確認すること（オーナーの作業なし）

1. `feat/*` に小さな変更を push し、プレビューが作られることを確認する。プレビューの URL は、GitHub のデプロイ情報から取得する。
2. ログインしていない状態（シークレットウィンドウ、または `curl`）でプレビューの URL を開き、Vercel のログイン画面になることを確認する。
3. 本番の URL のヘッダーに `X-Robots-Tag: noindex, nofollow` が付いていることを確認する。
   - プレビューの中身はログインしないと取得できない。そのためヘッダーは、本番の URL と E2E のテストで確認する。
   - プレビューでも自動で確かめたい場合は、Vercel の **Protection Bypass for Automation** のシークレットを発行してもらう必要がある（任意）。
4. 結果を `docs/WORKLOG.md` に記録する。

## 5. 公開の日（Phase 7。参考）

1. Production の環境変数に `SITE_LAUNCHED=true` と `NEXT_PUBLIC_SITE_URL=<本番ドメイン>` を設定する。
2. ドメインを追加する。
3. `release` ブランチを作って push する。これが公開版の本番デプロイになる。
