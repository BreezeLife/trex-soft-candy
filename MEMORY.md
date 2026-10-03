# 长期决策

## 2026-10-03 接手

- 输入是 v1.1 交接包，本地没有 `.git` 或四份长期项目记录；先读取交接和历史报告，再补齐记录。
- 中文名固定「霸王龙软软糖」，英文名 T-Rex Jelly，不重写应用或换成框架。
- 用户已授权同步、创建指定公开仓库并部署 GitHub Pages，无需再次询问发布许可。只复用 BreezeLife 已有 gh keyring 授权，不登录或打印 token。
- 本次只读联网检查确认 BreezeLife 授权有效；指定仓库与 Pages 当时均返回 404，适合首次安全导入。
- 手机尺寸下的浏览器布局验证不等于手机硬件、触屏或性能验收。真机不可用时明确保留待测。
- 横屏 CSS 必须重置竖屏继承的 left/bottom/grid；中断与重置必须清理指针捕获，旧指针事件不能取消后续新抓取。

## 2026-10-03 · 双语要求

用户追加支持中文和英文选择。采用单HTML内嵌词典，默认中文，中文标题仍固定「霸王龙软软糖」，英文为T-Rex Jelly。切换仅更新界面文案和文档lang/title，不重置软体、相机或控制设置。语言按钮独立于GPU控制fieldset；偏好保存失败时保持可用。

## 2026-10-03 · 正式仓库与部署

源码：https://github.com/BreezeLife/trex-soft-candy，Pages：https://breezelife.github.io/trex-soft-candy/。运行时首次发布SHA `e4f65c9f416d0b553039680a01341c1ab1545b13` 已构建成功，HTTPS文件与本地一致，Pages来源legacy/main/根目录。初始导入脚本只用于同内容安全导入；后续变更在本项目正式Git历史中审阅、commit、普通push，不再使用导入脚本覆盖同名差异。语言偏好按站点origin保存，本地localhost与GitHub Pages互不继承。
