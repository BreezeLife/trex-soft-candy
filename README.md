# 霸王龙软软糖 · T-Rex Jelly

一只可以抓住、拉伸、揉捏，再松手看它摇晃回弹的 3D 霸王龙软糖。首选原生 WebGPU，兼容原生 WebGL2 渲染，软糖几何、材质与灯光由代码生成；完整体验放在一个 HTML 文件内，无第三方运行时依赖或外部资源请求。

当前源码为 v1.4：浅蓝天空、绿色草地、圆润描边标题和厚底 3D 图标按钮，适配桌面、手机与平板；支持中文 / English、更多玩法面板和全屏入口。UI 图标由 Image 2 生成并内嵌为 PNG atlas，独立打开 `index.html` 无需读取图标文件。按钮只显示图标，保留双语无障碍名称；底部用双手拉糖的动画演示抓取、拉长和松手。

GitHub Pages 正式地址：<https://breezelife.github.io/trex-soft-candy/>；源码：<https://github.com/BreezeLife/trex-soft-candy>。**当前版本的构建、线上浏览器与真机验收状态以 `TEST_REPORT.md` 为准**，不能沿用旧版结果。接手开发先读 `AGENTS.md`、`CODEX_HANDOFF.md` 和四份项目记录。历史试玩站点为 <https://trex-soft-candy.weiqi.chatgpt.site>。

## 开始试玩

通过 HTTPS 或 localhost 打开 `index.html`。首选 WebGPU；设备不能提供时会尝试 WebGL2，仍使用真实三维网格和同一软体模拟。两者都不可用时显示明确说明。

本地启动（Node.js 18+；无需 `npm install`）：

```sh
npm run dev
```

随后打开 <http://localhost:8080>。按 Ctrl+C 停止。如果 8080 被占用，可运行 `PORT=8081 npm run dev`。也可使用 `python3 -m http.server 8080`，或将根目录的 `index.html` 部署到 HTTPS 静态托管服务。直接打开 HTML 文件时，浏览器本地文件权限可能影响 WebGPU。

## 操作

右上「中文 / EN」切换界面语言，默认中文。选择会在本浏览器保存；存储不可用时仍能切换。语言变化保留软体形状、速度、暂停、配色、滑块和相机设置。

主工具栏放置三种配色与「推一下、暂停/继续、重新来、更多玩法」四个大按钮。手机竖屏工具栏在底部，横屏与桌面位于舞台右侧；其他调节收进「更多玩法」弹层。按钮只显示 3D 风格图标，完整中英文名称供屏幕阅读器使用，触摸与键盘均可操作。

| 操作 | 效果 |
| --- | --- |
| 左键 / 单指拖动霸王龙 | 抓住点击位置，拉伸或揉捏；松手回弹 |
| 两指分别按住软糖 | 各抓一个局部点，向两边拉长；松开一指保留另一抓点 |
| 鼠标右键 / 鼠标拖动空白处 | 环绕观察 |
| 两指都从空白处开始 | 两指开合缩放，中点移动转动视角；空白单指不转相机 |
| 滚轮 | 在限定范围内缩放 |
| 珊瑚 / 泻湖 / 葡萄（Coral / Lagoon / Grape） | 切换配色，保留当前物理状态 |
| 推一下 / Nudge / `N` | 轻轻推一下 |
| 重新来 / Again / `R` | 恢复软糖初始形状与速度 |
| 暂停 / Pause / 空格 | 暂停或继续模拟，图标与无障碍名称同步切换 |
| 更多玩法 / More | 打开调节弹层；关闭按钮、点击遮罩或 `Esc` 可关闭 |
| 软硬手感 / Feel（更多玩法） | 左侧软绵绵，右侧更硬、更有弹性；数值越大越硬 |
| 摇晃方式 / Wobble（更多玩法） | 调整内部阻尼；左侧晃久一点，右侧快快停下 |
| 慢动作 / Slow-mo（更多玩法） | 四分之一速度 |
| 小网格 / Jelly mesh（更多玩法） | 查看网格 |
| 看正面 / Front view（更多玩法） | 恢复默认相机视角，保留软糖形状 |
| 全屏玩 / Full screen | 请求原生全屏；不可用时切换沉浸视图 |
| 方向键 / `+` / `−` | 转动视角 / 缩放 |

暂停时仍可查看与切换配色，恢复模拟后才能继续抓取和推动。键盘快捷键不会抢占正在操作的按钮与输入控件。

打开或关闭更多玩法会释放当前抓取，弹层遮罩阻止触摸穿透到软糖；键盘焦点留在面板内，关闭后回到「更多玩法」。两根手指都命中软糖时各自拉扯，抓取期间锁定相机；额外的空白触摸不会抢走抓取。触摸中断、失焦与窗口改变都会清理抓取状态。

全屏依赖浏览器提供相应能力。请求失败或接口不可用时，沉浸视图隐藏页面标题并扩大舞台，同时显示说明；这不代表浏览器已进入原生全屏。再次点全屏按钮可退出；原生全屏也可用浏览器退出操作，沉浸视图可按 `Esc` 退出。手机和平板的实际触摸、浏览器全屏支持及性能需按设备验证。

## GitHub Pages

正式仓库 **BreezeLife/trex-soft-candy** 已建立，后续更新应审阅远端差异后正常提交和推送，不使用强推。下列脚本保留用于首次安全导入同一份交接包：

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

`npm test` 运行适配器选择、渲染后端、控制、全屏状态与物理回归测试。也可分别运行 `npm run test:controls`、`npm run test:fullscreen` 与 `npm run test:physics`。这些测试直接读取当前 HTML 的实现，使用 Node 环境与 DOM 桩；不能替代真实浏览器、GPU 和手机测试。`npm run test:publish` 使用隔离的 gh/git/curl mock 检查发布安全，不调用真实 GitHub。详细结果与局限见 `TEST_REPORT.md`。

`preview/coral.png`、`lagoon.png`、`grape.png` 是历史原生 `wgpu` 软件 GPU 离屏渲染参考，供 Codex 对照形态与材质；不是实际手机截图，也不被应用加载。本次本机真实浏览器结果见测试报告；**手机真机触控与性能仍待设备验收**。

## Technical notes

- **Geometry:** smooth-union signed distance fields, welded marching tetrahedra, and shared trilinear skin bindings. Eyes and mouth follow deformation.
- **Physics:** fixed 90 Hz position-based dynamics on a volumetric lattice, edge constraints, signed tetrahedral volume constraints, bounded stretching, gravity, floor contact, friction, and internal damping.
- **Rendering:** native WebGPU with WGSL shaders; visible entry and nearest-exit depth passes feed Beer–Lambert color absorption, analytical studio refraction/reflection and scattering approximations, plus procedural internal bubbles. This is an interactive rendering approximation, not spectral path tracing.
- **Interface:** a child-friendly sky-and-grass playground with bilingual accessible names, icon-only controls, a two-hand stretch demonstration, a play-settings dialog and a fullscreen control. The Image 2 icon atlas is embedded in the HTML as a data URI; `design/toy-icons.png` is an optional design source, not a runtime dependency.
- **Performance:** meshes and GPU buffers are reused while dragging. No framework, CDN, downloaded assets, or build step.
- **Compatibility:** native WebGPU is preferred, with a compatibility-adapter retry and a native WebGL2 startup fallback. Both use the same generated geometry and soft-body simulation. Devices without either API receive an explicit message. Browser-size checks do not certify Android hardware performance.
- **Fullscreen:** uses the browser's native API when available, with a clearly identified immersive layout fallback. Device-size browser checks do not establish real phone or tablet touch performance.

`index.html` is the complete application. Development tools, tests, documentation and preview references are optional; none are runtime dependencies. The app stays self-contained even when served alone.

## Android手机和平板

Android安装包工程在 `android/`，内置与网页完全同源的HTML。共用一个手机/平板包，支持横竖屏和离线运行，不申请网络、存储、相机、麦克风权限。最低Android 8.0，实际设备仍需支持WebGPU或WebGL2。安装测试包使用开发签名，不是Google Play发行包；构建方法与生命周期策略见 [Android说明](android/README.md)。[下载 Android 手机/平板 APK](https://breezelife.github.io/trex-soft-candy/downloads/trex-jelly-android-v1.4.0.apk)，实际验收状态见 [测试报告](TEST_REPORT.md)。

WebGPU适配器回退依据Chrome官方发布的 [Android兼容模式](https://developer.chrome.com/blog/new-in-webgpu-146)，无需实验性浏览器flags。可用 `?renderer=webgl2` 显式复核备用管线，此参数不替代默认自动选择。
