// The sample document of act 3-6 (the patent disclosure system): a FICTIONAL patent filing, made
// here from scratch so that nothing in it can point at a real person, organisation, platform or
// filing (owner decision 2026-11-20). Everything in it says so: "見本 / SAMPLE" at the top of every
// page, an applicant and an inventor that are plainly placeholders, a number no real filing can have.
//
//   node scripts/build-patent-sample.mjs
//   → public/media/patent/sample-document.pdf        (A4, 2 pages, fonts embedded as subsets, no metadata)
//   → public/media/patent/sample-page-<n>.webp       (the pages as images: the viewer shows these,
//                                                       so no PDF renderer is loaded in the browser)
//
// Needs the font sources of `npm run fonts` (.cache/fonts, see docs/FONTS.md: IBM Plex Sans JP and
// Shippori Mincho B1, both SIL OFL 1.1, which allows embedding) and poppler's `pdftoppm`.
// The outputs are committed; run this again only to change the document.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { PDFDocument, PDFName } from 'pdf-lib';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/media/patent');
const FONTS = join(ROOT, '.cache/fonts');
const font = (path) => {
  const full = join(FONTS, path);
  if (!existsSync(full)) throw new Error(`missing font source ${path} — see docs/FONTS.md`);
  return pathToFileURL(full).href;
};

const html = /* html */ `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<title></title>
<style>
  @font-face { font-family: Body; font-weight: 400; src: url('${font('ibmplexsansjp/IBMPlexSansJP-Regular.ttf')}'); }
  @font-face { font-family: Body; font-weight: 600; src: url('${font('ibmplexsansjp/IBMPlexSansJP-SemiBold.ttf')}'); }
  @font-face { font-family: Title; font-weight: 600; src: url('${font('shipporiminchob1/ShipporiMinchoB1-SemiBold.ttf')}'); }
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font: 400 9.6pt/1.75 Body, sans-serif; color: #1c1a17; }
  .page { position: relative; width: 210mm; height: 297mm; padding: 30mm 22mm 20mm; page-break-after: always; overflow: hidden; }
  .page:last-child { page-break-after: auto; }
  .banner { position: absolute; inset: 0 0 auto 0; height: 15mm; display: flex; align-items: center; justify-content: space-between; padding: 0 22mm; background: #1c1a17; color: #fff; font-weight: 600; letter-spacing: 0.3em; font-size: 12pt; }
  .banner small { font-size: 7.5pt; letter-spacing: 0.08em; font-weight: 400; }
  .foot { position: absolute; inset: auto 22mm 9mm 22mm; display: flex; justify-content: space-between; border-top: 0.4pt solid #8a8378; padding-top: 2mm; font-size: 7pt; color: #5c564d; }
  .kind { font-size: 9pt; letter-spacing: 0.5em; color: #5c564d; }
  h1 { margin: 3mm 0 7mm; font: 600 17pt/1.5 Title, serif; }
  dl { display: grid; grid-template-columns: 30mm 1fr; gap: 1.2mm 0; margin: 0 0 6mm; padding: 4mm 5mm; border: 0.5pt solid #8a8378; }
  dt { color: #5c564d; }
  dd { margin: 0; }
  .note { margin: 0 0 6mm; padding: 3mm 5mm; background: #f1ede6; font-size: 8.4pt; }
  h2 { margin: 6mm 0 1.5mm; font: 600 10.5pt/1.5 Body, sans-serif; }
  h3 { margin: 3.5mm 0 0.5mm; font: 600 9.6pt/1.5 Body, sans-serif; }
  p { margin: 0 0 1.5mm; text-align: justify; }
  figure { margin: 4mm 0 2mm; }
  figcaption { font-size: 8.2pt; color: #5c564d; text-align: center; }
  svg { display: block; width: 100%; height: 44mm; }
  table { width: 100%; border-collapse: collapse; font-size: 8.6pt; margin-top: 1mm; }
  th, td { border: 0.4pt solid #8a8378; padding: 1.2mm 2.5mm; text-align: left; }
  th { background: #f1ede6; font-weight: 600; }
</style>
<body>
<section class="page">
  <div class="banner"><span>見本 / SAMPLE</span><small>架空の見本文書です。実在の出願・人物・団体とは関係ありません。</small></div>
  <div class="kind">特許出願書類（見本）</div>
  <h1>見本：地層データの可視化装置に関する発明</h1>
  <dl>
    <dt>【出願番号】</dt><dd>特願 0000-000000（見本）</dd>
    <dt>【出願日】</dt><dd>0000年00月00日（見本）</dd>
    <dt>【発明者】</dt><dd>見本 太郎（架空の人物）</dd>
    <dt>【出願人】</dt><dd>（架空）見本研究機構</dd>
  </dl>
  <p class="note">この書類は、文書の閲覧画面を説明するために作成した架空の見本です。記載した技術の内容、数値、名称は、すべて説明用の作りものであり、実在の発明・製品・試験結果を示すものではありません。</p>
  <h2>【要約】</h2>
  <p>掘削で得た地層の試料について、深さごとの測定値を1本の円柱の図として表示する可視化装置を提供する。本装置は、測定値を層ごとにまとめる集計部と、各層を色と模様で描き分ける描画部と、利用者が選んだ層の根拠となる測定記録を示す参照部とを備える。利用者は、円柱の図の上で層を選ぶだけで、その層の測定値と、値のもとになった記録とを続けて確認できる。</p>
  <h2>【特許請求の範囲】</h2>
  <h3>【請求項1】</h3>
  <p>地層の試料から得た測定値を深さの順に受け取る入力部と、前記測定値を層ごとにまとめる集計部と、まとめた各層を1本の円柱の図として描く描画部とを備えることを特徴とする、地層データの可視化装置。</p>
  <h3>【請求項2】</h3>
  <p>請求項1に記載の可視化装置において、前記描画部が、層ごとの測定値の確かさに応じて、当該層の輪郭の描き方を変えることを特徴とする可視化装置。</p>
  <h3>【請求項3】</h3>
  <p>請求項1または2に記載の可視化装置において、利用者が前記円柱の図の上で選んだ層について、その測定値のもとになった記録を表示する参照部をさらに備えることを特徴とする可視化装置。</p>
  <div class="foot"><span>見本 / SAMPLE — 架空の見本文書</span><span>1 / 2</span></div>
</section>
<section class="page">
  <div class="banner"><span>見本 / SAMPLE</span><small>架空の見本文書です。実在の出願・人物・団体とは関係ありません。</small></div>
  <h2 style="margin-top:0">【発明の詳細な説明】</h2>
  <h3>【技術分野】</h3>
  <p>本発明は、掘削で得た地層の試料の測定値を、見て分かる図として表示する装置に関する。</p>
  <h3>【背景技術】</h3>
  <p>従来、地層の測定値は、深さと値を並べた表として記録されることが多かった。表は正確だが、層の境目や全体の傾向を読み取るには、慣れと時間が必要であった。</p>
  <h3>【発明が解決しようとする課題】</h3>
  <p>本発明の課題は、測定値の全体像を一目で把握でき、かつ、気になる層については元の記録までたどれる表示を提供することにある。</p>
  <h3>【課題を解決するための手段】</h3>
  <p>本発明の可視化装置は、深さの順に並んだ測定値を層ごとにまとめ、1本の円柱の図として描く。各層は色と模様で描き分けられ、測定値の確かさは輪郭の描き方で示される。利用者が層を選ぶと、その層の測定値と、もとになった記録が表示される。</p>
  <h3>【発明の効果】</h3>
  <p>本発明によれば、利用者は、表を読み込むことなく層の並びと傾向を把握できる。また、図から元の記録へ直接たどれるため、値の確認にかかる手間が減る。</p>
  <figure>
    <svg viewBox="0 0 500 130" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#1c1a17" stroke-width="1.1" font-family="Body" font-size="9">
      <rect x="20" y="42" width="96" height="46"/><text x="68" y="69" text-anchor="middle" fill="#1c1a17" stroke="none">入力部 10</text>
      <rect x="150" y="42" width="96" height="46"/><text x="198" y="69" text-anchor="middle" fill="#1c1a17" stroke="none">集計部 20</text>
      <rect x="280" y="12" width="96" height="46"/><text x="328" y="39" text-anchor="middle" fill="#1c1a17" stroke="none">描画部 30</text>
      <rect x="280" y="72" width="96" height="46"/><text x="328" y="99" text-anchor="middle" fill="#1c1a17" stroke="none">参照部 40</text>
      <path d="M116 65H150M246 58L280 38M246 72L280 92M376 35H410M376 95H410"/>
      <ellipse cx="445" cy="22" rx="26" ry="7"/><path d="M419 22V108M471 22V108"/><path d="M419 108A26 7 0 0 0 471 108"/>
      <path d="M419 44A26 7 0 0 0 471 44M419 66A26 7 0 0 0 471 66M419 88A26 7 0 0 0 471 88" stroke-dasharray="3 2"/>
    </svg>
    <figcaption>【図1】（見本）可視化装置の構成を示す図。右端は、層を描き分けた円柱の図の例。</figcaption>
  </figure>
  <h3>【表1】（見本）実施の形態の比較</h3>
  <table>
    <tr><th>項目</th><th>形態A</th><th>形態B</th><th>形態C</th></tr>
    <tr><td>層のまとめ方</td><td>一定の深さごと</td><td>値の変化点ごと</td><td>利用者が指定</td></tr>
    <tr><td>確かさの示し方</td><td>輪郭の太さ</td><td>輪郭の実線と破線</td><td>記号を添える</td></tr>
    <tr><td>記録の参照</td><td>一覧で表示</td><td>層の横に表示</td><td>別の画面で表示</td></tr>
  </table>
  <p style="margin-top:3mm">なお、上記の形態はいずれも説明のための例であり、本書類は架空の見本である。</p>
  <div class="foot"><span>見本 / SAMPLE — 架空の見本文書</span><span>2 / 2</span></div>
</section>
</body>
</html>`;

const work = mkdtempSync(join(tmpdir(), 'patent-sample-'));
try {
  const source = join(work, 'document.html');
  writeFileSync(source, html);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(pathToFileURL(source).href);
  await page.evaluate(() => document.fonts.ready);
  const printed = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });

  // No metadata at all: no Info dictionary (title, author, creator, producer, dates), no XMP.
  const doc = await PDFDocument.load(printed, { updateMetadata: false });
  doc.context.trailerInfo.Info = undefined;
  doc.catalog.delete(PDFName.of('Metadata'));
  const bytes = await doc.save();
  if (doc.getPageCount() > 2) throw new Error(`the sample must be 1–2 pages, got ${doc.getPageCount()}`);
  if (bytes.length >= 1024 * 1024) throw new Error(`the sample must stay under 1 MB, got ${bytes.length} bytes`);
  mkdirSync(OUT, { recursive: true });
  const pdf = join(OUT, 'sample-document.pdf');
  writeFileSync(pdf, bytes);
  console.log(`sample-document.pdf ${(bytes.length / 1024).toFixed(1)} KB, ${doc.getPageCount()} pages`);

  // The pages as images, rendered from the PDF itself (poppler), stored as WebP.
  execFileSync('pdftoppm', ['-r', '110', '-png', pdf, join(work, 'page')]);
  for (let n = 1; n <= doc.getPageCount(); n += 1) {
    const png = readFileSync(join(work, `page-${n}.png`)).toString('base64');
    const webp = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext('2d').drawImage(image, 0, 0);
      return canvas.toDataURL('image/webp', 0.86);
    }, png);
    const out = Buffer.from(webp.split(',')[1], 'base64');
    writeFileSync(join(OUT, `sample-page-${n}.webp`), out);
    console.log(`sample-page-${n}.webp ${(out.length / 1024).toFixed(1)} KB`);
  }
  await browser.close();
} finally {
  rmSync(work, { recursive: true, force: true });
}
