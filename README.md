# 霸王龙软软糖 · T-Rex Jelly

一只可以抓住、拉伸、揉捏，再松手看它摇晃回弹的 3D 霸王龙软糖。原生 WebGPU 渲染，所有几何、材质与灯光由代码生成；完整体验放在一个 HTML 文件内，无第三方依赖、外部模型或图片。

这是 v1.2 本机续开发版，增加中文 / English 选择，并修复横屏布局及抓取中断。先读 `AGENTS.md`、`CODEX_HANDOFF.md`、四份项目记录和 `TEST_REPORT.md`。GitHub Pages 已部署：<https://breezelife.github.io/trex-soft-candy/>；源码：<https://github.com/BreezeLife/trex-soft-candy>。构建与HTTPS文件核对已通过，真实线上浏览器与真机验收的详细状态见测试报告。历史试玩站点为 <https://trex-soft-candy.weiqi.chatgpt.site>。

## 开始试玩

使用支持 WebGPU 的浏览器，通过 HTTPS 或 localhost 打开 `index.html`。如果浏览器无法提供 WebGPU，页面会显示明确的说明。

本地启动（Node.js 18+；无需 `npm install`）：

```sh
npm run dev
```

随后打开 <http://localhost:8080>。按 Ctrl+C 停止。如果 8080 被占用，可运行 `PORT=8081 npm run dev`。也可使用 `python3 -m http.server 8080`，或将根目录的 `index.html` 部署到 HTTPS 静态托管服务。直接打开 HTML 文件时，浏览器本地文件权限可能影响 WebGPU。

## 操作

右上「中文 / EN」切换界面语言，默认中文。选择会在本浏览器保存；存储不可用时仍能切换。语言变化保留软体形状、速度、暂停、配色、滑块和相机设置。

| 操作 | 效果 |
| --- | --- |
| 左键 / 单指拖动霸王龙 | 抓住点击位置，拉伸或揉捏；松手回弹 |
| 右键拖动 / 拖动空白处 | 环绕观察 |
| 滚轮 / 双指缩放 | 在限定范围内缩放 |
| 珊瑚 / 泻湖 / 葡萄（Coral / Lagoon / Grape） | 切换配色，保留当前物理状态 |
| Give it a nudge / `N` | 轻轻推一下 |
| Reset / `R` | 恢复软糖初始形状 |
| Reset view | 恢复相机视角 |
| Pause / 空格 | 暂停或继续模拟 |
| Firmness | 调整软硬程度 |
| Internal damping | 调整内部阻尼 |
| ¼ speed | 四分之一速度 |
| Show mesh | 查看网格 |
| 方向键 / `+` / `−` | 转动视角 / 缩放 |

暂停时仍可查看与切换配色，恢复模拟后才能继续抓取和推动。键盘快捷键不会抢占正在操作的按钮与输入控件。

## GitHub Pages

已有 GitHub CLI 授权的电脑可以一键同步到 **BreezeLife/trex-soft-candy** 并启用 GitHub Pages：

```sh
bash /完整路径/trex-soft-candy-codex/publish-github-pages.sh
```

脚本从任何工作目录都能执行，需要 `gh`、Git、curl 和 Node.js 18+。它只复用现有 `gh` 授权，不调用 `gh auth login`，也不会发起网页登录；当前授权账号必须是 BreezeLife。新仓库创建为 public，Pages 来源设为 `main` 分支的根目录。

若目标仓库已存在，脚本保留额外文件；本项目同名文件如有不同，会停止并要求先审阅、合并差异。脚本不覆盖不同内容、不强推，也不修改用户的全局 Git 凭据配置。已有 Pages 必须使用 `main` 根目录的分支部署；其他部署配置会保留，脚本提示后停止。

推送后脚本最多等待约三分钟，核对 Pages 构建的提交以及线上 HTML 与本地文件是否一致，再报告上线成功。若构建失败或等待超时，会明确报告尚未确认上线；源码已同步的状态会保留。

此脚本用于安全地首次导入本交接包。后续开发请在正式克隆的仓库里正常 pull、commit、push；已有同名文件发生变化时，首次导入脚本会拒绝覆盖，Codex 应先审阅并合并差异。

也可手动发布：

仓库可直接作为静态站点发布，无需构建或安装依赖：

1. 将这些文件提交到仓库的 `main` 分支。
2. 打开 **Settings → Pages**，选择 **Deploy from a branch**。
3. 选择 **main** 与 **/ (root)**，保存。
4. 等待 Pages 发布完成，打开设置页面给出的 HTTPS 地址。

`.nojekyll` 让 Pages 原样发布静态文件。

## 验证

使用 Node.js 18 或更新版本，无需 `npm install`：

```sh
npm run check
npm test
npm run test:publish
```

检查脚本验证内嵌 JavaScript 语法、资源引用是否自包含，以及原生 WebGPU/WGSL 入口是否保留。这是静态检查，不能替代浏览器中的渲染与交互验证。

`npm test` 运行随包附带的控制和物理回归测试。也可分别运行 `npm run test:controls` 与 `npm run test:physics`。这些测试直接读取当前 HTML 的实现，使用 Node 环境与 DOM 桩；不能替代真实浏览器、GPU 和手机测试。`npm run test:publish` 使用隔离的 gh/git/curl mock 检查发布安全，不调用真实 GitHub。详细结果与局限见 `TEST_REPORT.md`。

`preview/coral.png`、`lagoon.png`、`grape.png` 是历史原生 `wgpu` 软件 GPU 离屏渲染参考，供 Codex 对照形态与材质；不是实际手机截图，也不被应用加载。本次本机真实浏览器结果见测试报告；**手机真机触控与性能仍待设备验收**。

## Technical notes

- **Geometry:** smooth-union signed distance fields, welded marching tetrahedra, and shared trilinear skin bindings. Eyes and mouth follow deformation.
- **Physics:** fixed 90 Hz position-based dynamics on a volumetric lattice, edge constraints, signed tetrahedral volume constraints, bounded stretching, gravity, floor contact, friction, and internal damping.
- **Rendering:** native WebGPU with WGSL shaders; a back-face thickness pass feeds Beer–Lambert color absorption, analytical studio refraction/reflection and scattering approximations, plus procedural internal bubbles. This is an interactive rendering approximation, not spectral path tracing.
- **Performance:** meshes and GPU buffers are reused while dragging. No framework, CDN, downloaded assets, or build step.
- **Compatibility:** requires a WebGPU-capable browser and a secure context (HTTPS or localhost). No WebGL renderer is included; unsupported devices receive an explicit fallback message.

`index.html` is the complete application. Development tools, tests, documentation and preview references are optional; none are runtime dependencies. The app stays self-contained even when served alone.
