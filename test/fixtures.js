import net from "node:net";
export async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
export function samplePdf() {
  const stream =
    "BT /F1 16 Tf 50 730 Td (Paperweave PDF integration fixture) Tj 0 -32 Td (Select this source passage to discuss it with your agent.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n",
    offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const x = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out);
}
export async function seedDemo(call) {
  const ws = await call("create_workspace", {
    title: "高效多模态学习 · 界面演示",
    question: "演示工作区：以下论文与实验数据均为虚构示例，用于展示研究流程。",
  });
  const rows = [
    {
      title: "Shared Representations for Visual Understanding",
      summary: "从共同表征出发，梳理视觉与语言如何在同一个语义空间对齐。",
      tags: ["基础表征", "演示"],
      year: 2021,
      status: "reviewed",
    },
    {
      title: "Efficient Adaptation with Lightweight Modules",
      summary: "通过轻量适配模块复用预训练表征，研究参数效率与任务泛化的关系。",
      tags: ["参数高效", "演示"],
      year: 2022,
      status: "reviewed",
    },
    {
      title: "Learning to Route Multimodal Experts",
      summary: "用动态路由选择适合当前输入的模块，理解稀疏计算中的协作机制。",
      tags: ["动态路由", "演示"],
      year: 2023,
      status: "reading",
    },
    {
      title: "Bridging Local Features and Global Context",
      summary: "对比局部细节与全局语义的融合方式，关注细粒度场景下的信息损耗。",
      tags: ["特征融合", "演示"],
      year: 2023,
      status: "reading",
    },
    {
      title: "A Closer Look at Efficient Transfer",
      summary: "重新审视跨任务迁移中的效率评估：收益来自结构，还是实验设置？",
      tags: ["迁移学习", "演示"],
      year: 2024,
      status: "unread",
    },
    {
      title: "Towards Reliable Multimodal Evaluation",
      summary: "建立可核对的评估维度，记录性能差异、适用边界和未解决的问题。",
      tags: ["评估协议", "演示"],
      year: 2024,
      status: "unread",
    },
  ];
  const papers = [];
  for (const row of rows)
    papers.push(
      await call("upsert_paper", {
        ...row,
        authors: "Paperweave · 虚构演示文献",
        abstract: `【虚构演示内容，不是真实论文】${row.summary} 本示例用于展示摘要、结构化阅读与论文之间的联系，不代表实际研究结论。`,
        method: "【演示】先构建共享表征，再通过任务模块适配具体的输入与目标。",
        findings:
          "【演示】把方法、数据设置和评估指标分开记录，便于在相同条件下对比。",
        limitations:
          "【演示】这些内容只展示产品交互，需要换成经过原文核验的真实研究。",
      }),
    );
  for (const [s, t, kind, explanation] of [
    [0, 1, "extends", "从共同表征延伸到轻量适配"],
    [1, 2, "uses", "路由模块复用轻量适配器"],
    [0, 3, "extends", "补充局部与全局特征的融合"],
    [1, 4, "compares", "对比相同预算下的迁移效果"],
    [4, 5, "supports", "评估协议关注实验的可比性"],
    [2, 5, "compares", "检验稀疏路由的收益来源"],
  ])
    await call("add_relation", {
      source: papers[s].id,
      target: papers[t].id,
      kind,
      explanation,
      evidence: "虚构界面演示关系，未核验真实文献。",
      confidence: "hypothesis",
    });
  await call("save_note", {
    title: "为什么轻量模块能改变表征？",
    kind: "concept",
    paperIds: [papers[1].id],
    body: "> 这是产品演示笔记，不是真实论文结论。\n\n## 我的问题\n\n当大部分参数冻结时，少量参数为什么仍能改变任务表现？\n\n## 下一步怎么读\n\n把输入、适配模块、梯度路径和输出画在一张图上，再核对论文中的实验条件。",
  });
  await call("draw_model", {
    title: "轻量适配框架 · 演示结构",
    paperIds: [papers[1].id],
    caption: "虚构演示结构，可导出原生 PowerPoint 形状。",
    nodes: [
      { id: "in", label: "Visual input", group: "input" },
      { id: "encoder", label: "Frozen encoder", group: "module" },
      { id: "head", label: "Task prediction", group: "output" },
      { id: "text", label: "Text prompt", group: "input" },
      { id: "adapter", label: "Trainable adapter", group: "module" },
      { id: "loss", label: "Alignment loss", group: "output" },
    ],
    edges: [
      { source: "in", target: "encoder", label: "features" },
      { source: "encoder", target: "head", label: "" },
      { source: "text", target: "adapter", label: "" },
      { source: "adapter", target: "loss", label: "" },
      { source: "encoder", target: "adapter", label: "adapt" },
    ],
  });
  await call("plot_results", {
    title: "参数效率对比 · 合成演示数据",
    paperIds: [papers[1].id],
    caption: "合成数据，仅用于展示图表功能，不代表实验结果。",
    source: "Paperweave UI fixture / synthetic data",
    xLabel: "Training budget",
    yLabel: "Illustrative score (a.u.)",
    chartType: "line",
    labels: ["1%", "5%", "10%", "25%"],
    series: [
      { name: "Baseline", values: [32, 45, 57, 65] },
      { name: "Adapter", values: [42, 58, 66, 72] },
    ],
  });
  await call("add_question", {
    paperId: papers[1].id,
    question: "冻结主干后，适配模块在哪一层改变了表示？",
    quote: "演示问题：尝试让 agent 画出信息流与梯度路径。",
    page: 1,
  });
  await call("save_manuscript", {
    title: "研究草稿 · 示例",
    format: "md",
    body: "# 高效多模态学习：研究草稿\n\n> 以下是写作区演示结构，不包含真实研究结论。\n\n## 研究动机\n\n让不同模态的信息以更少的训练成本适配新的任务。\n\n## 核心问题\n\n1. 参数效率与推理效率如何分别衡量？\n2. 模块之间的连接，能否解释性能变化？\n3. 对比实验是否使用一致的训练预算？\n\n## 方法与证据\n\n从论文原文和实验日志中补充，保留出处。\n\n## 待完成\n\n- [ ] 核验参考文献\n- [ ] 补充实测结果\n- [ ] 将模型结构导出为可编辑 PPTX\n",
  });
  await call("set_context", { paperId: papers[1].id, view: "graph" });
  return { workspace: ws, papers };
}
