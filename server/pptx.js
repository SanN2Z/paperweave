import pptxgen from "pptxgenjs";
export async function exportModel(figure, file) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Paperweave";
  pptx.subject = figure.caption;
  pptx.title = figure.title;
  const slide = pptx.addSlide();
  slide.background = { color: "FBFCFF" };
  slide.addText(figure.title, {
    x: 0.5,
    y: 0.25,
    w: 12.3,
    h: 0.5,
    fontSize: 22,
    bold: true,
    color: "29334E",
  });
  const rows = Math.ceil(figure.nodes.length / 3),
    step = Math.min(1.4, 5.6 / rows),
    h = Math.min(0.75, step * 0.6);
  const pos = new Map(
    figure.nodes.map((n, i) => [
      n.id,
      { x: 0.65 + (i % 3) * 4.15, y: 1.2 + Math.floor(i / 3) * step },
    ]),
  );
  for (const e of figure.edges) {
    const s = pos.get(e.source),
      t = pos.get(e.target);
    const x1 = s.x + 1.45,
      y1 = s.y + h,
      x2 = t.x + 1.45,
      y2 = t.y;
    slide.addShape(pptx.ShapeType.line, {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1) || 0.001,
      h: Math.abs(y2 - y1) || 0.001,
      flipH: x2 < x1,
      flipV: y2 < y1,
      line: {
        color: "8A94B4",
        width: 1.5,
        beginArrowType: "none",
        endArrowType: "triangle",
      },
    });
    if (e.label)
      slide.addText(e.label, {
        x: (x1 + x2) / 2 - 0.5,
        y: (y1 + y2) / 2 - 0.12,
        w: 1,
        h: 0.25,
        fontSize: 9,
        color: "77829A",
        align: "center",
      });
  }
  for (const n of figure.nodes) {
    const p = pos.get(n.id);
    slide.addShape(pptx.ShapeType.roundRect, {
      ...p,
      w: 2.9,
      h,
      rectRadius: 0.12,
      fill: {
        color: { input: "E6F3EF", module: "ECEFFD", output: "FBEFD9" }[n.group],
      },
      line: { color: "D4DBEA", width: 1 },
    });
    slide.addText(n.label, {
      x: p.x + 0.12,
      y: p.y + 0.05,
      w: 2.66,
      h: h - 0.1,
      fontSize: Math.max(9, Math.min(16, 16 * step)),
      color: "29334E",
      align: "center",
      valign: "mid",
      breakLine: false,
      fit: "shrink",
    });
  }
  slide.addNotes(
    `Source: ${figure.caption || "User-provided model structure"}\nPaper IDs: ${figure.paperIds.join(", ")}\nEditable source JSON retained in Paperweave.`,
  );
  await pptx.writeFile({ fileName: file });
}
