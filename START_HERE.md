# 交给 Codex 的启动指令
把整个文件夹作为 Codex 项目打开，粘贴下面这段话：
> 请先读取 AGENTS.md、CODEX_HANDOFF.md、README.md、PROJECT.md、MEMORY.md、TASKS.md、WORKLOG.md 和 TEST_REPORT.md，然后接手《霸王龙软软糖》。保留现有原生 WebGPU、程序化霸王龙几何、单文件 HTML 交付和固定 90 Hz 软体物理。当前 v1.4 按用户要求采用儿童乐园视觉：浅蓝天空、绿色草地、圆润描边标题、厚底按钮和内嵌 3D 图标；不要恢复成旧版暖白编辑式设计。保留双语、四个主操作按钮、更多玩法弹层，以及手机/平板触摸与全屏入口。先检查当前 Git 状态并运行 npm run check、npm test 和 npm run test:publish，再通过 npm run dev 在真实 WebGPU 浏览器检查拖拽、反复强拉、附肢连接、地板碰撞、材质、手机和平板横竖屏。分别验证原生全屏与不可用时的沉浸降级，设备尺寸与合成触摸不冒充真机结果。修复发现的问题后，复用 BreezeLife 已有 gh 授权同步到专用仓库 BreezeLife/trex-soft-candy 并部署 GitHub Pages；发布已获授权，无需重复询问。正式仓库已建立，先审阅并保留远端改动，再正常提交和推送，不强推、不改其他项目。核对本次提交的 Pages 构建及 HTTPS 文件，再做线上浏览器核心交互。最后提供真实源码与 Pages 链接、提交 SHA 和简短测试结果，未完成项明确报告。

当前源码版本为 v1.4.0，入口仍是根目录 `index.html`。12 格 Image 2 图标 atlas 已作为 data URI 内嵌；`design/toy-icons.png` 仅是设计源，不是运行时依赖。主工具栏包含三套配色和「推一下、暂停/继续、重新来、更多玩法」四个按钮；软硬、阻尼、慢动作、网格及相机复位在「更多玩法」中。

正式站点：<https://breezelife.github.io/trex-soft-candy/>；源码：<https://github.com/BreezeLife/trex-soft-candy>。当前提交是否上线、真实线上浏览器与真机是否通过，以 `TEST_REPORT.md` 最新记录为准。不要用 v1.1 离屏截图、v1.2 通过记录或移动尺寸截图替代 v1.4 的当前验收。

Android追加交付：查看 `android/README.md` 和 `TEST_REPORT.md` 的实际APK与验收结果。不要把开发签名安装包称为商店发行版，不提交 `.local` 密钥或Gradle缓存。

v1.4 新规则：操作按钮只显示3D图标，底部双手拉糖动画代替文字提示；双指分别命中软糖进行局部对拉，抓取时锁定相机，空白单指不转动视角。必须覆盖单指释放后另一抓点继续、混合空白触摸、第三指与中断清理。
