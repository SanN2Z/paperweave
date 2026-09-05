# Paperweave technical reference

**把论文精读、实时脉络、CLI Agent、科研绘图与论文写作放进同一个本地工作台。**

你的 Agent 继续在 Codex / Claude Code 中检索、读论文和跑实验；Paperweave 通过 MCP 将阅读上下文、关系图、笔记和研究产物连接起来。笔记就是本地 Markdown，Obsidian 可以直接使用。

![Paperweave research workbench, with clearly labelled synthetic demo papers](images/workbench.png)

## 快速开始

需要 Node.js **22.13+**（推荐 24 LTS）、npm，以及你已经配置好的 CLI Agent。

```sh
git clone https://github.com/shanyuzhe/paperweave.git
cd paperweave
npm ci
npm run build
npm start
```

`npm start` 会自动打开 **http://127.0.0.1:47831**。先由安装 Agent 注册下面的 MCP，之后可以直接在页面里的终端对话：

```sh
npm run setup
```

它会输出当前安装路径对应的 Codex / Claude Code MCP 注册命令。执行你使用的客户端命令，重启该 CLI 会话。工作台必须保持运行。

或者直接把仓库链接和下面这句话交给 Agent：

> 请按这个仓库的 INSTALL.md 在本地安装 Paperweave，验证服务，然后为我使用的 CLI 配置 MCP。笔记使用我指定的 Obsidian vault；不要覆盖已有笔记。

安装规范：[INSTALL.md](../INSTALL.md)。每次梳理新领域的统一规范：[docs/WORKFLOW.md](WORKFLOW.md)，也作为 MCP `research-workflow` prompt 提供。

安装 Agent 的跨平台依赖修复手册：[docs/DEPENDENCIES.md](DEPENDENCIES.md)。环境诊断：`npm run doctor`；机器可读输出：`node scripts/doctor.js --json`。

## 你可以做什么

- **论文精读**：导入论文元数据和本地 PDF；浏览、翻页、缩放、选择原文；保存作者摘要、个人总结、方法、发现与局限。
- **实时关系图**：Agent 添加或更新论文与关系，页面通过 WebSocket 同步；关系区分延伸、使用、支持、冲突与对比，附带依据和核验状态。
- **带上下文的讨论**：选中的论文、页码、原文和问题都能通过 `get_context` 读取。Agent 讨论后用 `save_note` 保存理解。
- **Obsidian 笔记**：直接读写 vault 中的 Markdown；检测外部文件变化；基于 revision 阻止过期写入覆盖你的修改。
- **真实终端**：xterm.js + node-pty，运行原来的 CLI 和实验命令。收起面板保留会话；点击结束、关闭网页或断开连接会结束该 Shell；外部 CLI 不受影响。
- **科研图件**：导入带来源的 SVG / PNG / JPEG / WebP；结构化模型图生成 SVG 和可编辑的原生形状 PPTX；实测数据生成折线 / 柱状图，保留 JSON 数据。
- **论文写作**：LaTeX / Markdown 草稿、本地源文件、Agent 读写、版本冲突保护、Markdown 预览、pdflatex PDF 编译预览、BibTeX 元数据导出。
- **按领域隔离**：每个工作区独立保存论文、关系、疑问、笔记、图件和草稿。

这是一版可以跑通主流程的 **本地 MVP**。它不内置模型 API，不替代你的 Codex / Claude Code 登录，也不会自动监听并理解全部终端对话。Agent 需要遵循 MCP 工作流主动保存产物。

## Obsidian 与实验目录

```sh
npm run setup -- --vault "D:/Notes/MyVault" --cwd "D:/Research/MyExperiment"
```

重启服务。笔记保存在 vault 的 `Paperweave/` 目录，文件使用稳定 UUID 命名，标题保存在 frontmatter 中。未指定 vault 时，默认使用 `.paperweave/vault`；可以把该目录直接作为 Obsidian vault 打开。

**改换 vault 不会自动移动旧文件**：先关闭服务，将旧 vault 的 `Paperweave/` 文件夹复制到新 vault，再配置并重启。不同安装实例应使用不同的数据目录和端口。

配置也可以通过 `PAPERWEAVE_DATA_DIR`、`PAPERWEAVE_VAULT`、`PAPERWEAVE_CWD`、`PAPERWEAVE_PORT` 设置。自定义数据目录时，MCP 进程也必须使用同一个 `PAPERWEAVE_DATA_DIR`（`npm run setup` 输出的通用 JSON 已包含该配置）。

## 保留你现有的 PPT 绘图方式

1. 用 CLI Agent 查找并下载矢量素材，保存来源与授权备注。
2. `import_figure` 导入素材；`draw_model` 生成结构草图。
3. `export_pptx` 生成可编辑的 PowerPoint 形状，返回实际文件路径。
4. 使用现有 Claude Code / Codex 的 PowerPoint 工具继续编辑该 PPTX。
5. 把精修后的 SVG / PNG 导入工作台，与论文和笔记关联。

模型导出的框、箭头、文字是 Office 原生对象。导入的外部 SVG 保留为矢量素材，能否在 PowerPoint 中解组取决于素材与 Office 支持。PPTX 的后续修改不会自动反映到 SVG 预览，需重新导入导出的预览图。

## MCP 接口

使用官方 MCP SDK 的 **stdio** transport。多个客户端连接到同一个本地服务，所有持久化写入由服务串行处理；详细输入 schema 通过 MCP tools/list 提供。

| 能力 | 工具 |
| --- | --- |
| 工作区与上下文 | `get_context`, `create_workspace`, `switch_workspace`, `set_context`, `list_papers` |
| 论文与证据 | `upsert_paper`, `attach_pdf`, `read_paper`, `add_relation` |
| 问题与笔记 | `add_question`, `save_note`, `get_note`, `log_activity` |
| 图件与数据 | `import_figure`, `draw_model`, `plot_results`, `export_pptx` |
| 写作 | `save_manuscript`, `get_manuscript` |

Resource：`paperweave://context`。Prompt：`research-workflow`。固定契约：`paperweave/1`。示例见 [docs/MCP.md](MCP.md)。

## 开发与验证

```sh
npm run dev
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run dev` 将 Vite 嵌入同一服务，无需启动两个端口。浏览器检查使用临时数据，包含明确标注的虚构演示论文与合成图表，不修改你的研究空间。

默认只监听 `127.0.0.1`。HTTP / WebSocket 检查 Host 和 Origin，API 使用本地随机令牌。数据、vault、运行时令牌和依赖目录均被 Git 忽略。GitHub 用于分发源码；GitHub Pages 不能直接提供本地文件读写和 PTY 服务。

## 当前边界

- 单用户本地工作流；多个 Agent 共用当前工作区，长任务期间避免切换领域。不支持多人协作和云端账号体系。
- PDF 文字提取不含 OCR；图像理解交给你使用的 CLI 的视觉能力。
- 图谱使用规则布局，支持缩放与滚动；还没有自由拖拽布局和大规模图谱优化。
- 草稿是单文件编辑和单次 `pdflatex` 编译。复杂多文件工程、BibTeX 编译链、参考文献核验及投稿模板管理继续使用终端工具；这并非完整 Prism 替代品。
- 模型图原生 PPTX 导出可继续编辑；不包含 PowerPoint COM 自动化、PPTX 在线渲染和任意 SVG 自动解组。
- 原生 PTY 在 Windows 需要对应预编译文件或 Visual Studio C++ Build Tools；缺失时界面会报告状态，外部 CLI + MCP 仍可使用。
- 当前 PptxGenJS 间接依赖 `image-size` 有上游高危解析器公告。本应用仅使用原生形状 / 文本导出，不调用该图片尺寸解析器；详见 [docs/VALIDATION.md](VALIDATION.md)。

MIT License.
