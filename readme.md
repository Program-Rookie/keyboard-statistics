
# Keyboard Statistics

一个基于 Tauri 开发的键盘使用统计工具。

## 项目结构

### 前端部分 (`/src`)

- `assets/` - 存放项目静态资源文件
- `index.html` - 应用程序的主要 HTML 入口文件
- `main.js` - 前端主要的 JavaScript 逻辑文件
- `styles.css` - 全局样式表文件

### 后端部分 (`/src-tauri/src`)

- `main.rs` - Tauri 应用程序的主入口文件，负责：

  - 系统托盘的初始化和管理
  - 窗口事件的处理
  - 应用程序生命周期管理
- `lib.rs` - 核心库文件，包含：

  - Tauri 插件的配置和初始化
  - 应用程序的主要业务逻辑
  - 前后端通信接口的实现

## 开发说明

本项目使用 Tauri 2.0 框架开发，集成了系统托盘功能，支持最小化到托盘和后台运行。前端使用原生 HTML/CSS/JavaScript 开发。
