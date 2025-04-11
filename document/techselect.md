# 键盘统计桌面程序 - 技术选型文档

## 1. 核心技术栈

### 1.1 应用框架
- **选型**: Tauri + Rust + HTML5
- **理由**:
  - Tauri 比 Electron 更轻量，内存占用低
  - Rust 保证性能和安全性
  - 原生 Web 技术栈，无需框架依赖
  - Tauri 原生支持跨平台

### 1.2 后端技术
- **核心语言**: Rust
- **键盘监听**:
  - Windows: `windows-rs` (Windows API)
  - macOS: `core-foundation-rs` (macOS API)
- **数据库**: SQLite（通过 `rusqlite`）
  - 轻量级，无需额外安装
  - 支持 SQL 查询，便于数据分析

### 1.3 前端技术
- **核心**: HTML5 + CSS3 + JavaScript
- **布局**: CSS Grid + Flexbox
- **样式**: 
  - CSS 变量实现主题切换
  - CSS 动画优化交互体验
- **JavaScript**:
  - 原生 ES6+ 特性
  - Web Components 组件化
- **图表库**: Apache ECharts
  - 原生 JavaScript 支持
  - 高性能
  - 丰富的图表类型
  - 支持交互功能

## 2. 详细技术选型说明

### 2.1 系统架构
```plaintext
[前端 UI (HTML5)] <-> [Tauri Bridge] <-> [Rust 后端]
                                         |
                    [SQLite] <-----------+
                                         |
                    [系统 API] <---------+
```
### 2.2 关键模块技术选择 前端展示模块
- Web Components 自定义组件
- CSS Grid 系统布局
- 原生 JavaScript 事件处理
- ECharts 图表渲染
- 理由：
  - 更轻量级，无框架依赖
  - 原生性能优秀
  - 易于维护和调试
  - 学习成本低

### 2.3 文件结构
```plaintext
keyboard-statistics/
├── src/                    # 前端代码
│   ├── css/               # CSS 样式
│   │   ├── components/   # 组件样式
│   │   ├── themes/      # 主题样式
│   │   └── main.css     # 主样式文件
│   ├── js/                # JavaScript 代码
│   │   ├── components/   # 自定义组件
│   │   ├── utils/       # 工具函数
│   │   ├── charts/      # 图表配置
│   │   └── main.js      # 主入口文件
│   ├── assets/           # 静态资源
│   └── index.html        # 主页面
├── src-tauri/             # Rust 后端代码
│   ├── src/              # Rust 源代码
│   │   └── main.rs      # 主程序
│   ├── Cargo.toml       # Rust 项目配置
│   └── tauri.conf.json  # Tauri 配置
├── package.json          # Node.js 项目配置
└── README.md            # 项目说明
```