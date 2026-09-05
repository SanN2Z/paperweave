const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const colors = [
  "#6479cf",
  "#3a9c89",
  "#c8914c",
  "#b679a6",
  "#748995",
  "#ce776c",
  "#92a865",
  "#786cb3",
];
const wrap = (title, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="${height}" viewBox="0 0 960 ${height}"><rect width="960" height="${height}" rx="16" fill="#fbfcff"/><g font-family="Arial, sans-serif" fill="#29334e"><text x="42" y="44" font-size="20" font-weight="600">${esc(title)}</text>${body}</g></svg>`;
export function modelSvg(a) {
  const ids = new Set(a.nodes.map((n) => n.id));
  if (
    ids.size !== a.nodes.length ||
    a.edges.some((e) => !ids.has(e.source) || !ids.has(e.target))
  )
    throw new Error(
      "Model node IDs must be unique and all edges must reference existing nodes",
    );
  const height = Math.max(260, Math.ceil(a.nodes.length / 3) * 140 + 100);
  const pos = new Map(
    a.nodes.map((n, i) => [
      n.id,
      { x: 60 + (i % 3) * 305, y: 100 + Math.floor(i / 3) * 140 },
    ]),
  );
  let body =
    '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="none" stroke="#8a94b4"/></marker></defs>';
  for (const e of a.edges) {
    const s = pos.get(e.source),
      t = pos.get(e.target);
    const sameRow = s.y === t.y;
    const x1 = s.x + (sameRow ? (t.x > s.x ? 220 : 0) : 110),
      y1 = s.y + (sameRow ? 35 : 70);
    const x2 = t.x + (sameRow ? (t.x > s.x ? 0 : 220) : 110),
      y2 = t.y + (sameRow ? 35 : 0);
    body += `<path d="M${x1} ${y1} C${x1} ${y1 + 35},${x2} ${y2 - 35},${x2} ${y2}" fill="none" stroke="#8a94b4" stroke-width="2" marker-end="url(#arrow)"/><text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 8}" text-anchor="middle" font-size="10">${esc(e.label)}</text>`;
  }
  for (const n of a.nodes) {
    const p = pos.get(n.id);
    const color = { input: "#e6f3ef", module: "#eceffd", output: "#fbefd9" }[
      n.group
    ];
    body += `<rect x="${p.x}" y="${p.y}" width="220" height="70" rx="12" fill="${color}" stroke="#d4dbea"/><text x="${p.x + 110}" y="${p.y + 25}" text-anchor="middle" font-size="10" fill="#77829a">${esc(n.group.toUpperCase())}</text><text x="${p.x + 110}" y="${p.y + 48}" text-anchor="middle" font-size="13">${esc(n.label.slice(0, 28))}</text>`;
  }
  return wrap(a.title, height, body);
}
export function chartSvg(a) {
  if (a.series.some((s) => s.values.length !== a.labels.length))
    throw new Error("Every series must contain one value per label");
  const vals = a.series.flatMap((s) => s.values),
    low = Math.min(0, ...vals),
    high = Math.max(0, ...vals);
  const span = high - low || 1,
    y = (v) => 370 - ((v - low) / span) * 260;
  const step = 780 / a.labels.length;
  let body = "";
  for (let i = 0; i <= 5; i++) {
    const v = low + (span * i) / 5;
    body += `<line x1="95" y1="${y(v)}" x2="885" y2="${y(v)}" stroke="#e5e9f1"/><text x="82" y="${y(v) + 4}" text-anchor="end" font-size="11">${Number(v.toPrecision(4))}</text>`;
  }
  a.labels.forEach((l, i) => {
    body += `<text transform="translate(${95 + step * (i + 0.5)} 389) rotate(-25)" text-anchor="end" font-size="10">${esc(l.slice(0, 22))}</text>`;
  });
  a.series.forEach((s, j) => {
    const color = colors[j];
    body += `<rect x="${95 + j * 105}" y="69" width="10" height="10" rx="3" fill="${color}"/><text x="${110 + j * 105}" y="78" font-size="10">${esc(s.name.slice(0, 14))}</text>`;
    if (a.chartType === "line")
      body += `<polyline fill="none" stroke="${color}" stroke-width="2.5" points="${s.values.map((v, i) => `${95 + step * (i + 0.5)},${y(v)}`).join(" ")}"/>`;
    s.values.forEach((v, i) => {
      const x = 95 + step * (i + 0.5),
        w = (step * 0.7) / a.series.length;
      body +=
        a.chartType === "bar"
          ? `<rect x="${x - step * 0.35 + j * w}" y="${Math.min(y(v), y(0))}" width="${w * 0.88}" height="${Math.max(1, Math.abs(y(v) - y(0)))}" rx="2" fill="${color}"/>`
          : `<circle cx="${x}" cy="${y(v)}" r="4" fill="${color}"/>`;
    });
  });
  body += `<text x="490" y="449" text-anchor="middle" font-size="12">${esc(a.xLabel)}</text><text transform="translate(26 245) rotate(-90)" text-anchor="middle" font-size="12">${esc(a.yLabel)}</text><text x="42" y="482" font-size="10" fill="#7b8599">Source: ${esc(a.source.slice(0, 140))}</text>`;
  return wrap(a.title, 510, body);
}
