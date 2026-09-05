export async function extractPdf(bytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    !bytes.subarray(0, 5).equals(Buffer.from("%PDF-")) ||
    bytes.length > 40 * 1024 * 1024
  )
    throw new Error("Use a valid PDF smaller than 40 MB");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  try {
    const doc = await loading.promise;
    if (doc.numPages > 1000) throw new Error("PDF exceeds 1000 pages");
    const pages = [];
    for (let page = 1; page <= doc.numPages; page++) {
      const p = await doc.getPage(page),
        content = await p.getTextContent();
      pages.push({
        page,
        text: content.items
          .map((i) => i.str + (i.hasEOL ? "\n" : " "))
          .join(""),
      });
      p.cleanup();
    }
    return pages;
  } finally {
    await loading.destroy();
  }
}
