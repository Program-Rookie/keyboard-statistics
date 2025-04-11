# 键盘统计工具 (Keyboard Statistics Tool)

这是一个跨平台的键盘使用统计工具，可以帮助用户了解个人键盘使用习惯、频率和模式，以辅助提高生产力、关注打字健康，并为自我量化提供数据支持。

## 主要功能

- 后台全局键盘事件监听（仅记录按键发生，不记录具体内容）
- 按键次数统计（总量、分类别）
- 按键频率 (KPM) 计算与展示
- 常用按键及组合键识别
- 按键活动时间分布可视化
- 将按键活动关联到前台应用程序
- 数据图表化展示
- 用户数据本地存储
- 用户数据导出功能
- 基于用户输入和简单规则的基础健康风险评估提示

## 技术栈

- 前端：Web技术 (HTML, CSS, JavaScript/TypeScript)
- 后端：Rust (Tauri框架)
- 数据存储：SQLite
- 图表可视化：Chart.js

## 隐私声明

本应用程序严格保护用户隐私：
- 不记录任何按键的具体字符内容
- 所有数据仅存储在用户本地计算机
- 无网络数据传输功能
- 所有核心功能可在离线状态下运行

## 开发与贡献

本项目是开源的，欢迎贡献代码或提出建议。

## 许可证

[MIT License](LICENSE)