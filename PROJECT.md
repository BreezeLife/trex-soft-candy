# 霸王龙软软糖 · T-Rex Jelly

## 产品

可以局部抓取、拉伸、揉捏并自然回弹的半透明霸王龙软糖。保留大头、短前肢、粗后腿、长尾巴、暖白背景与简洁编辑式界面。

## 架构与原则

- `index.html` 是唯一运行时入口，样式、JavaScript 与 WGSL 全部内嵌；无外部运行时资源或框架。
- 程序 SDF 与焊接 marching tetrahedra 生成连续 3D 表面；面孔和身体共享三线性变形绑定。
- `SoftBody` 使用固定 90 Hz 体积晶格 PBD、距离/体积约束、地面摩擦和阻尼；抓取作用于射线命中附近的节点。
- `Renderer` 直接使用 WebGPU，背面厚度通道与 Beer–Lambert 吸收表现软糖材质。
- 先验证再发布；静态、模拟事件、数值、离屏、真实浏览器与真机结果分开记录。
- 发布仅使用 BreezeLife 现有 gh 授权，目标 `BreezeLife/trex-soft-candy`、main 根目录 GitHub Pages；不得 force push 或覆盖未审阅远端差异。

## 项目记录

长期决策见 `MEMORY.md`，当前状态见 `TASKS.md`，工作历史见 `WORKLOG.md`，验收证据见 `TEST_REPORT.md`。交接任务与完整约束仍以 `CODEX_HANDOFF.md`、`AGENTS.md` 为准。

## 正式地址

- 源码：https://github.com/BreezeLife/trex-soft-candy
- GitHub Pages：https://breezelife.github.io/trex-soft-candy/
- 当前功能版本：v1.2.0，中英文UI；真实设备与部署验收边界见测试报告。
