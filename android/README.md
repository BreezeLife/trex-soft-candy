# 霸王龙软软糖 · Android 安装版

这是根目录网页的原生 Android 容器，面向 Android 手机和平板。Activity 使用系统 WebView，Java 与 Android 平台 API，无 AndroidX、Compose 或第三方运行时依赖。

APK 将根目录 `index.html` 原样打包到 assets，构建时自动同步。网页仍是唯一的游戏入口，模型、物理、界面和图形后端都沿用该文件，不能在 Android 目录另维护一套网页。它优先使用 WebGPU，支持根页面的 WebGL2 降级；设备必须实际具备其中一种可用图形能力。**Android 8.0+ 能安装，不代表所有 Android 8.0+ 设备都能渲染。** 若两种图形能力都不可用，保留网页错误说明，不显示伪造的成功画面。

当前输出为**开发签名的安装测试包**，不是应用商店生产签名版本。编译通过和 APK 检查不能代替真机验证；本机当前没有可用于验收的 Android 手机、平板或模拟器，触控、旋转、后台恢复、全屏和 GPU 性能仍须在目标设备验证。

## 构建

要求 JDK 17、Android SDK 35、Gradle 8.14.3；工程固定 Android Gradle Plugin 8.13.0。首次准备依赖需要正常取得 Google/Maven 构建依赖，应用运行时不使用这些仓库。已有缓存时可离线构建：

```sh
cd android
bash ./build-local.sh
```

脚本使用项目内 Gradle 工作目录和 `android/.local/debug.keystore`，不修改用户的全局凭据或全局签名文件。debug key 的固定密码仅用于本地测试，不能作为发布签名身份；`.local/`、构建输出、设备配置及缓存已忽略，不应提交私钥。

默认 APK：`app/build/outputs/apk/debug/app-debug.apk`。离线构建所需缓存缺失时应补齐明确缺少的构建组件，不将构建失败写成 APK 已生成。每次根 `index.html` 修改后重新构建，并核对 APK 内 `assets/index.html` 与根文件字节一致。

## 安装与操作

将已验证的 APK 复制到自己的 Android 手机或平板，使用系统安装界面安装；若系统要求，按其提示允许当前文件来源安装应用。打开「霸王龙软软糖 / T-Rex Jelly」后无需联网即可加载内置页面。图形支持来自设备的 Android System WebView，Chrome 浏览器支持 WebGPU 不能直接证明系统 WebView 也支持；遇到图形错误时先更新系统 WebView，再按页面反馈检查设备能力。

- 保留页面中的中文 / EN、三套配色、推一下、暂停/继续、重新来及更多玩法。
- 单指抓取软糖、双指缩放；手机和平板可横竖切换，旋转保留当前 WebView，不主动重置软糖。
- 默认保留系统状态栏与导航栏；系统边距与刘海区域由原生容器留出，避免盖住网页控件。
- 「全屏玩」请求系统 WebView 的原生全屏。原生全屏时可从边缘滑出系统栏，按 Android 返回键退出全屏。
- 浏览器能力不足时，网页使用沉浸布局并显示说明；返回键先关闭更多玩法，再退出沉浸布局，最后退出应用。原生全屏状态下返回键优先退出原生全屏。
- 进入后台时调用 WebView 的暂停与计时器暂停，返回前台时恢复。系统回收进程后再次打开会重新载入页面；语言偏好由本地存储保留。

## 本地加载与权限边界

唯一页面地址为 `https://appassets.androidplatform.net/index.html`。`shouldInterceptRequest` 精确匹配此 GET 首页并从 APK assets 返回内容，除此之外的 URL、查询参数、路径变体和子框架请求均拒绝；它不是对公网该域名的访问。

Manifest 不请求网络、存储、相机、麦克风或位置权限。WebView 禁止网络加载、file/content 访问、混合内容、自动弹窗、外部下载与页面权限申请；未暴露 `addJavascriptInterface`。页面图标使用自己的内嵌 data URI。Android 返回键只通过固定 DOM 命令调用根页面现有的关闭/退出按钮，不另实现游戏逻辑。

APK 启动图标由本项目 Android vector 绘制。网页图标仍使用根 HTML 内嵌的 Image 2 atlas，不需要额外文件或下载。

## 验证边界

`tests/LocalContentPolicyTest.java` 是无第三方依赖的 JVM 白名单检查，覆盖唯一合法 URL、外域、伪造 authority、file/content/data/javascript/intent URL、额外路径/查询及非 GET 请求。它只能证明 URL 策略，不能证明 WebView、GPU、系统手势或全屏行为。

安装包验收还应核对签名、Manifest 无权限、SDK 与包名、内置 HTML 字节；在至少一部 Android 手机和一台平板分别检查离线启动、WebGPU 或 WebGL2 实际渲染、连续抓取、双指缩放、方向切换、安全区、暂停、后台恢复、设置弹层、原生全屏/沉浸降级及返回退出。最终通过与未通过项写入根 `TEST_REPORT.md`，不要将桌面浏览器尺寸模拟称为 Android 真机通过。
