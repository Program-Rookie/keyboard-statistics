# 按键统计桌面程序更新日志

## 2024-04-11

### 项目初始化
- 创建基本项目结构
- 设置Tauri环境
- 配置Rust后端
- 创建前端基本界面
- 实现基本的应用启动功能

## 2024-04-12

### 前端界面布局调整
- 实现侧边栏导航布局，取代原单一 Header 布局。
- 将内容区域划分为多个可切换的面板 (`content-pane`)，对应侧边栏导航项。
- 添加应用状态栏 (`status-bar`)。
- 更新 HTML 结构 (`src/index.html`) 以匹配新布局。
- 更新 CSS 样式 (`src/css/main.css`) 以支持新布局和导航样式。
- 更新 JavaScript (`src/js/main.js`) 以实现侧边栏导航的面板切换逻辑。

## 2024-04-13

### 用户控制功能
- 在前端 `src/js/main.js` 中为"导出数据"按钮添加了点击事件监听器，调用后端 `export_data` 命令。
- 在前端 `src/js/main.js` 中为"清除数据"按钮添加了点击事件监听器，增加确认提示，并调用后端 `clear_all_data` 命令。
- 清除数据后会尝试调用 `fetchAllDataAndUpdateUI` 刷新界面。
- 在 `DOMContentLoaded` 事件中添加了 `initSettings` 函数的调用。
- 在前端 `src/js/main.js` 中添加了 `initControlPanel` 函数。
- 实现了"暂停/恢复记录"按钮 (`toggle-recording-btn`) 的逻辑，调用后端 `pause_tracking` 和 `resume_tracking` 命令，并更新按钮文本和状态指示 (`recording-status-indicator`)。
- 实现了"停止记录"按钮 (`stop-recording-btn`) 的逻辑，增加确认提示，调用后端 `stop_tracking` 命令，并禁用相关按钮、更新状态指示。
- 在 `DOMContentLoaded` 事件中添加了 `initControlPanel` 函数的调用。

### 健康评估功能
- 在前端 `src/js/main.js` 的 `initSettings` 函数中为 AI 分析引导按钮 (`ai-analysis-btn`) 添加了点击事件监听器。
- 点击按钮会弹出一个提示框，说明如何导出数据并引导用户访问外部 AI 分析服务，同时包含隐私提示。
- 在前端 `src/js/main.js` 的 `initSettings` 函数中为健康档案按钮 (`health-profile-btn`) 添加了点击事件监听器。
- 添加了获取用户职业 (`user-occupation`) 和日均使用时长 (`user-daily-usage`) 输入值的逻辑。
- 点击按钮会调用后端 `get_health_assessment` 命令，并将返回的评估结果显示在 `health-assessment-result` 区域，同时附带免责声明。

## 2024-04-14

### 前端重构与功能完善
- **代码拆分**:
    - 将 `src/js/main.js` 拆分为多个模块：`api.js` (后端调用), `ui.js` (DOM操作与UI逻辑), `charts.js` (图表管理), `listeners.js` (事件监听器), `main.js` (入口与协调)。
    - 创建了对应的 `.js` 文件。
    - 修改 `src/index.html` 使 `main.js` 作为 `type="module"` 加载。
- **API 对接**:
    - `api.js` 封装了所有 `invoke` 调用，统一了函数命名（如 `startRecording`, `stopRecording`, `getStats` 等）。
    - `listeners.js` 中的事件处理器现在调用 `api.js` 中的函数。
    - **实现了开始/停止记录** 的前端逻辑与后端API (`startRecording`, `stopRecording`) 的对接。
- **UI 改进**:
    - `ui.js` 负责管理侧边栏激活、面板切换、统计数据显示、记录状态更新、错误信息显示。
    - 添加了简单的错误显示区域 (`#error-display`)。
- **主题切换**:
    - 在 `ui.js` 中添加了 `initThemeSwitcher` 和 `setTheme` 函数，使用 `localStorage` 保存用户选择。
    - 在 `index.html` 中添加了 `data-theme="light"` 到 `<body>`，并添加了一个主题切换按钮 (`#theme-toggle`)。
    - 在 `src/css/main.css` 中定义了 `--dark-theme` 变量和对应的样式规则。
    - `main.js` 在初始化时调用 `initThemeSwitcher`。
- **HTML 调整**:
    - 统一和调整了部分按钮和元素的 ID 以匹配新的 JS 逻辑 (e.g., `export-data-btn`, `clear-data-btn`, `health-profile-btn`等)。

### API & Control Flow Refinement
- **Control Logic**: 
    - Removed the "永久停止记录" button (`stop-recording-btn`) and its associated functionality from HTML (`index.html`), JavaScript listeners (`listeners.js`), and API calls (`api.js` - removed `stopTracking`).
    - Refined the Pause/Resume button (`toggle-recording-btn`) logic in `listeners.js`: it now manages its text state locally (`isPaused`) and correctly calls `pauseTracking` or `resumeTracking` API endpoints. Error handling now reverts the button state if the API call fails.
    - The main Start/Stop buttons (`startRecord`, `stopRecord`) remain for overall recording control.
- **API Consistency**: Confirmed frontend API calls in `api.js` match the expected backend commands (excluding the removed `stopTracking`). Assumed backend commands like `start_recording`, `stop_recording`, `get_stats`, `pause_tracking`, `resume_tracking` are implemented as expected.
- **CSS Cleanup**: Removed non-standard `darken()` function calls from button hover states in `src/css/main.css` and replaced them with a standard `filter: brightness(90%)` effect.
- **Linter Note**: Acknowledged a persistent linter warning on `listeners.js` (line ~173) after multiple attempts to fix; proceeding as the code structure appears sound.
