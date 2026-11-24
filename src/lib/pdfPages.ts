/** Most pages a single PDF may add to one import, to keep a run on-device to a few minutes. */
export const MAX_PDF_PAGES = 20;

/**
 * Turns each page of a PDF into a JPEG in the browser (typed or scanned, it makes no difference), so the page
 * can be read like a photo. pdf.js loads only when a PDF is dropped in; nothing is uploaded.
 */
export async function pdfToImages(file: File, onPage?: (done: number, total: number) => void) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const count = doc.numPages;
  const total = Math.min(count, MAX_PDF_PAGES);
  const out: { base64: string; mimeType: 'image/jpeg'; thumb: string }[] = [];
  for (let n = 1; n <= total; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(3, 1600 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    const t = document.createElement('canvas');
    const k = 280 / Math.max(canvas.width, canvas.height);
    t.width = Math.round(canvas.width * k);
    t.height = Math.round(canvas.height * k);
    t.getContext('2d')!.drawImage(canvas, 0, 0, t.width, t.height);
    out.push({ base64: canvas.toDataURL('image/jpeg', 0.88).split(',')[1], mimeType: 'image/jpeg', thumb: t.toDataURL('image/jpeg', 0.7) });
    page.cleanup();
    onPage?.(n, total);
  }
  await task.destroy();
  return { pages: out, skipped: count - total };
}
