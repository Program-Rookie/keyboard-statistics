# 键盘统计桌面程序 - 技术选型文档

## 1. 核心技术栈

### 前端技术
- **Tauri**: 用于构建轻量级跨平台桌面应用，相比Electron有更小的体积和更好的性能
  - 当前版本: @tauri-apps/api@^2.0.0 (package.json)
  - CLI版本: @tauri-apps/cli@^2.0.0 (package.json)
- **Vite**: 前端构建工具，版本^5.0.0 (package.json)
- **React**: 用于构建用户界面，提供良好的组件化开发体验

### 后端技术
- **Rust**: 作为Tauri的后端语言，提供高性能和内存安全保证

### 数据存储
- **SQLite**: 轻量级嵌入式数据库，适合存储键盘统计数据的本地存储需求

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

### 架构设计
采用前后端分离架构：
- 前端: Tauri+React构建用户界面
- 后端: Rust处理核心逻辑
- 通信: 通过Tauri提供的API进行前后端交互

### 关键技术组件
1. **键盘事件监听**
   - 使用系统原生API捕获全局键盘事件
   - 通过Rust实现高效的事件处理

2. **数据统计与分析**
   - 实时计算按键频率、热键使用情况等
   - 提供可视化图表展示统计结果

3. **数据持久化**
   - 使用SQLite存储历史统计数据
   - 支持数据导入导出功能

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