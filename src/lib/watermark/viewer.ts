/**
 * The full-page viewer of act 3-6 (STORYBOARD v2.3, the patent disclosure system): after 確認 the
 * sample document fills the screen, with the visitor's name and the current date and time repeated
 * on the diagonal as a faint watermark — forming from motes like on the 3D document (§11.3) — a
 * footer line naming the viewer, and a button that makes the watermarked PDF.
 *
 * Everything happens in this browser: the name is drawn on canvases and into the PDF bytes here,
 * and is never sent or stored (tests/e2e/phase-a.spec.ts proves no request carries it). The pages
 * shown are images made from the PDF at build time (scripts/build-patent-sample.mjs), so no PDF
 * renderer is loaded; pdf-lib is loaded only when the download button is pressed.
 * The document is a fictional sample and says so on every page.
 */
import { createInkLine, drawWatermark, stampOf } from './ink';

const INK = 'rgba(28, 98, 110, 0.16)';
const PDF_URL = '/media/patent/sample-document.pdf';

export function openDocViewer(dialog: HTMLDialogElement, name: string, onClose: () => void): void {
  if (dialog.open) return;
  const stamp = stampOf(new Date());
  const footer = (dialog.dataset.footer ?? '{name} {stamp}').replace('{name}', name).replace('{stamp}', stamp);
  for (const img of dialog.querySelectorAll<HTMLImageElement>('img[data-src]')) {
    if (!img.getAttribute('src')) img.src = img.dataset.src as string;
  }
  for (const caption of dialog.querySelectorAll<HTMLElement>('[data-doc-footer]')) caption.textContent = footer;

  const line = createInkLine();
  line.set(name, performance.now() + 500); // the page comes forward first, then the watermark forms
  // One canvas over each page, made here (the page's HTML carries no canvas until the viewer opens).
  const canvases = [...dialog.querySelectorAll<HTMLElement>('.doc-page')].map((page) => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    page.insertBefore(canvas, page.querySelector('figcaption'));
    return canvas;
  });
  let raf = 0;
  const frame = () => {
    const now = performance.now();
    for (const canvas of canvases) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) continue;
      const scale = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * scale)) {
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, w, h);
      drawWatermark(ctx, line, now, w, h, stamp, INK);
    }
    // Keeps drawing until every character has settled (and again after a resize).
    raf = line.settled(now) ? 0 : requestAnimationFrame(frame);
  };
  const redraw = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const resize = new ResizeObserver(redraw);
  canvases.forEach((c) => resize.observe(c));

  const download = dialog.querySelector<HTMLButtonElement>('[data-doc-download]');
  const onDownload = async () => {
    if (!download || download.disabled) return;
    const label = download.textContent;
    download.disabled = true;
    download.textContent = dialog.dataset.downloading ?? label;
    try {
      const bytes = await makeWatermarkedPdf(name, stamp, footer);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sample-watermarked.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } finally {
      download.disabled = false;
      download.textContent = label;
    }
  };
  const onDownloadClick = () => void onDownload();
  const close = dialog.querySelector<HTMLButtonElement>('[data-doc-close]');
  const onCloseClick = () => dialog.close();
  const onBackdrop = (e: MouseEvent) => {
    if (e.target === dialog) dialog.close();
  };
  const closed = () => {
    cancelAnimationFrame(raf);
    resize.disconnect();
    canvases.forEach((c) => c.remove());
    download?.removeEventListener('click', onDownloadClick);
    close?.removeEventListener('click', onCloseClick);
    dialog.removeEventListener('click', onBackdrop);
    dialog.removeEventListener('close', closed);
    onClose();
  };
  download?.addEventListener('click', onDownloadClick);
  close?.addEventListener('click', onCloseClick);
  dialog.addEventListener('click', onBackdrop);
  dialog.addEventListener('close', closed);
  dialog.showModal();
  redraw();
}

/** The sample PDF with the watermark and the viewer's footer line on every page, made here. */
async function makeWatermarkedPdf(name: string, stamp: string, footer: string): Promise<Uint8Array> {
  const [{ PDFDocument, PDFName }, source] = await Promise.all([import('pdf-lib'), fetch(PDF_URL).then((r) => r.arrayBuffer())]);
  const doc = await PDFDocument.load(source, { updateMetadata: false });
  // The text is drawn on a canvas with the visitor's own fonts (any script a name can be in) and laid
  // over each page as an image: no font file has to be downloaded to write a name into the PDF.
  const line = createInkLine();
  line.set(name, -1e6);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const k = 2.5; // canvas pixels per PDF point
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * k);
    canvas.height = Math.round(height * k);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.scale(k, k);
    drawWatermark(ctx, line, 0, width, height, stamp, INK);
    ctx.fillStyle = '#1c1a17';
    ctx.font = '600 8px system-ui, "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(footer, width / 2, height - 12);
    const png = await doc.embedPng(canvas.toDataURL('image/png'));
    page.drawImage(png, { x: 0, y: 0, width, height });
  }
  // As in the source file: no metadata (pdf-lib would add its own producer and dates).
  doc.context.trailerInfo.Info = undefined;
  doc.catalog.delete(PDFName.of('Metadata'));
  return doc.save();
}
