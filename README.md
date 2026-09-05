# Paperweave

**读论文、理脉络、记笔记、画图、写论文，一个工作台。**

右侧继续和 Codex / Claude Code CLI 讨论，左侧像浏览器一样切换论文、脉络、图件、LaTeX / Markdown 和笔记。Agent 整理的内容实时出现，笔记可以直接接入 Obsidian。

![Paperweave 研究工作台；图中为明确标注的虚构演示数据](docs/images/workbench.png)

## 开始使用

**Windows：**桌面版已支持独立窗口和托盘，无需安装 Node 或 npm。当前测试安装包可从 [Windows desktop 构建产物](https://github.com/shanyuzhe/paperweave/actions/workflows/desktop.yml)获取，正式发布名称尚在确定。关闭窗口会收进托盘，终端继续保留。

**macOS：**Apple Silicon 和 Intel 测试包均已通过自动安装、启动与 MCP 验收，详见[测试记录](docs/VALIDATION.md)。当前尚未做 Apple 公证，原生输入法和快捷操作仍需人工体验验收。

把下面这段话发给你的 Agent：

> 把 https://github.com/shanyuzhe/paperweave 接到我当前的科研项目。先读 INSTALL.md，安装缺失依赖，保留我现有的 CLI 会话和实验文件，配置好后告诉我打开哪里。

安装好后，在“连接 Agent”中复制连接信息给当前 CLI，即可继续原来的研究对话。其他系统目前可使用浏览器版，打开 Agent 给你的本地地址。

下次说“启动 Paperweave”即可；也可以在项目目录运行 `npm start`，它会启动服务并打开页面。

桌面版可从快捷方式或托盘打开。“会话监控”可以拆成置顶小浮窗，查看 Claude 会话是否等待处理。Codex 实时监控暂未接入。[桌面版说明](docs/DESKTOP.md)

Windows 安装包自带卸载程序，可在系统“已安装的应用”或开始菜单卸载；卸载会保留论文、笔记和研究项目。

## 日常怎么用

| 想做什么 | 你可以这样说 |
| --- | --- |
| 梳理一个新领域 | “用 Paperweave 梳理这个方向，补充论文摘要，画出发展脉络。” |
| 精读一篇论文 | “读这篇论文，把方法、发现和局限整理进看板。” |
| 弄懂一个问题 | 划选 PDF 原文，点“让 Agent 解读”，在右侧 CLI 继续讨论。 |
| 留下自己的理解 | “把刚才讨论清楚的内容记成笔记，关联到这篇论文。” |
| 科研绘图 | 选模板，点“用这个模板绘图”，告诉 Agent 要怎样修改矢量组件。 |
| 写论文 | “根据已经核实的论文和笔记，组织提纲，和我一起修改草稿。” |

研究资料保存在你的电脑上。每个领域可以使用独立的研究空间。左右面板可拖动调宽，终端支持分屏和切换配色；能读取到本地 Windows Terminal 配色时会自动沿用，否则使用奶油黄。

PDF 可以连续下拉；笔记打开即能在排版后的正文里编辑，仍保存为 Markdown。随产品提供 11 份 SVG / PPTX 模板，下载即有使用入口。

也可以作为 [ARIS](https://github.com/wanshuiyin/Auto-claude-code-research-in-sleep) 或其他科研 harness 的可视化补充：Agent 可发现项目论文和阶段报告，笔记补充在项目内。当前提供文件适配接口，独立维护，并非 ARIS 官方组件。[项目接入说明](docs/PROJECTS.md)

想多了解一点：[简短使用指南](docs/USER_GUIDE.md)。

## 给 Agent 和开发者

[安装入口](INSTALL.md) · [Agent 操作手册](docs/AGENT_GUIDE.md) · [跨平台依赖修复](docs/DEPENDENCIES.md) · [统一研究规范](docs/WORKFLOW.md) · [MCP 接口](docs/MCP.md) · [技术参考与当前边界](docs/REFERENCE.md) · [验证记录](docs/VALIDATION.md)

当前是可运行的本地 MVP，支持 Codex、Claude Code 及标准 MCP 客户端。代码采用 MIT；[模板素材按各自来源说明使用](assets/templates/README.md)。
