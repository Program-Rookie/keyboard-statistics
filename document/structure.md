d:\projects\keyBoardStatstic\keyboard-statistics
src/
├── main.rs                  # 主入口
├── lib.rs                   # 模块导出
├── core/
│   ├── keyboard.rs          # 键盘监听核心逻辑 (FR1)
│   ├── database.rs          # 数据库操作 (FR2)
│   └── analyzer.rs          # 数据分析逻辑 (FR3-FR7)
├── commands/
│   ├── mod.rs               # Tauri命令导出
│   ├── system.rs            # 系统控制命令 (FR10,FR13)
│   ├── stats.rs             # 统计相关命令 (FR3-FR7)
│   └── export.rs            # 数据导出命令 (FR9)
├── models/
│   ├── mod.rs
│   ├── event.rs             # 按键事件模型 (FR1.2)
│   └── health.rs            # 健康评估模型 (FR11)
└── utils/
    ├── mod.rs
    ├── time.rs              # 时间处理工具
    └── os.rs                # 系统平台相关工具

d:\projects\keyBoardStatstic\keyboard-statistics
src-tauri/
├── js/
│   ├── core/
│   │   ├── eventBus.js      # 事件总线
│   │   ├── tauriClient.js   # Tauri接口封装
│   │   └── stateManager.js   # 状态管理
│   ├── modules/
│   │   ├── dashboard/      # 概览模块 (FR3)
│   │   ├── statistics/     # 详细统计 (FR3-FR7)
│   │   ├── timeAnalysis/   # 时间分析 (FR4,FR6)
│   │   ├── appStats/       # 应用统计 (FR7)
│   │   ├── health/         # 健康洞察 (FR11)
│   │   └── settings/       # 设置模块 (FR10,FR13)
│   ├── components/
│   │   ├── charts/         # 图表组件 (FR8)
│   │   ├── controls/       # 控制组件
│   │   └── notifications/ # 通知组件
│   └── main.js             # 入口文件
└── styles/
    ├── modules/
    │   ├── dashboard.scss
    │   └── timeAnalysis.scss
    └── components/
        ├── chart.scss
        └── controlPanel.scss
