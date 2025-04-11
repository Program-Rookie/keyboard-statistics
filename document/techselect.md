# 键盘统计桌面程序 - 技术选型文档

## 1. 核心技术栈

### 1.1 应用框架
- **选型**: Tauri + Rust + React
- **理由**:
  - Tauri 比 Electron 更轻量，内存占用低（符合 NFR1.1、NFR1.2）
  - Rust 保证性能和安全性（符合 NFR1.3、NFR4.2）
  - React 生态系统成熟，组件丰富
  - Tauri 原生支持跨平台（符合 NFR7.1、NFR7.2）

### 1.2 后端技术
- **核心语言**: Rust
- **键盘监听**:
  - Windows: `windows-rs` (Windows API)
  - macOS: `core-foundation-rs` (macOS API)
- **数据库**: SQLite（通过 `rusqlite`）
  - 轻量级，无需额外安装（符合 FR2.1、FR2.2）
  - 支持 SQL 查询，便于数据分析（符合 FR3-FR7）

### 1.3 前端技术
- **框架**: Vue 3 + TypeScript
- **状态管理**: Pinia（Vue 官方推荐的状态管理方案）
- **UI 组件库**: Naive UI
  - 完整的 TypeScript 支持
  - 支持暗色模式（符合 FR13.2）
  - 中文文档完善
  - 响应式设计
- **图表库**: Apache ECharts
  - Vue 生态中有完善的封装（vue-echarts）
  - 高性能
  - 丰富的图表类型（符合 FR8.1、FR8.2）
  - 支持交互功能

## 2. 详细技术选型说明

### 2.1 系统架构
```plaintext
[前端 UI (React)] <-> [Tauri Bridge] <-> [Rust 后端]
                                         |
                    [SQLite] <-----------+
                                         |
                    [系统 API] <---------+
```

### 2.2 关键模块技术选择

#### 前端展示模块
- Vue 3 组合式 API 处理业务逻辑
- Naive UI 处理界面布局
- vue-echarts 处理图表展示
- 理由：
  - Vue 3 性能优秀，开发体验好
  - Naive UI 组件丰富，中文支持好
  - vue-echarts 深度集成 ECharts

## 4. 依赖版本控制
- Rust: 2021 Edition
- Node.js: >=16.0.0
- Tauri: ^1.0.0
- Vue: ^3.3.0
- TypeScript: ^5.0.0