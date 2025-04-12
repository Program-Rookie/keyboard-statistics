# Rust语法学习笔记

本文档整理了项目中 `src-tauri`目录下使用的Rust语法特性，帮助理解Rust编程的基础概念。

## 条件编译

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
```

- `#!` 表示应用于整个文件的属性
- `cfg_attr` 是条件配置属性，根据条件选择是否应用某个属性
- `not(debug_assertions)` 表示在非调试模式下
- `windows_subsystem = "windows"` 防止在Windows发行版上显示额外的控制台窗口

## 导入语句 (use)

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, Manager,
};
```

- `use` 导入其他模块的项到当前作用域
- 嵌套路径语法 `tauri::{...}` 可以在一个use语句中导入多个相关项
- 子模块路径使用 `::` 分隔

## 宏 (Macros)

```rust
#[tauri::command]
tauri::generate_handler![exit_app]
tauri::generate_context!()
```

- `#[tauri::command]` 是过程宏，标记函数可以从前端调用
- `generate_handler!` 和 `generate_context!` 是函数式宏
- 宏调用使用 `!` 符号，如 `println!`

## 函数定义

```rust
#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

fn main() {
    // ...
}
```

- 函数使用 `fn` 关键字定义
- 参数需明确指定类型 `app: tauri::AppHandle`
- `main()` 是程序入口点
- 如无明确返回值，隐式返回 `()`（空元组）

## 闭包 (Closures)

```rust
.on_menu_event(|app, event| match event.id.as_ref() {
    // ...
})
```

- 闭包使用 `|参数1, 参数2, ...| 函数体` 语法
- 闭包可以捕获外部环境中的变量
- 编译器可以自动推断闭包参数和返回值类型

## 模式匹配 (Pattern Matching)

```rust
match event.id.as_ref() {
    "quit" => app.exit(0),
    "show" => {
        // ...
    },
    _ => println!("未知菜单项: {:?}", event.id),
}
```

```rust
if let TrayIconEvent::Click {
    button: MouseButton::Left,
    button_state: MouseButtonState::Up,
    id: _,
    position: _,
    rect: _,
} = event
{
    // ...
}
```

- `match` 表达式用于模式匹配
- `=>` 连接模式和对应代码
- `_` 是通配符，匹配任何值
- `if let` 是简化版的匹配，只关注一个模式
- 结构体模式匹配允许解构复杂数据类型

## 方法链式调用 (Method Chaining)

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
        // ...
        Ok(())
    })
    .invoke_handler(tauri::generate_handler![exit_app])
    .run(tauri::generate_context!())
    .expect("启动失败");
```

- 多个方法可以链式调用
- 每个方法返回修改后的对象，允许继续调用其他方法
- 增强代码可读性

## 错误处理

```rust
.expect("启动失败");
```

```rust
let _ = window.show();
```

- `expect` 方法用于处理 `Result<T, E>` 类型，如果是错误则终止程序并显示错误信息
- `let _ = ...` 模式用于忽略可能出错的操作结果

## 结构体创建与构建模式

```rust
let tray = TrayIconBuilder::new()
    .icon(app.default_window_icon().unwrap().clone())
    .tooltip("右键显示菜单")
    .menu(&menu)
    .build(app)?;
```

- 使用构建器模式创建复杂对象
- 方法链接设置各种属性
- `build()` 方法最终创建对象

## 所有权与借用

```rust
.menu(&menu)  // 借用 menu
app.default_window_icon().unwrap().clone()  // 克隆图标
```

- `&` 表示不可变借用，不转移所有权
- `clone()` 创建对象的副本，避免所有权转移

## 问号操作符 (?)

```rust
let menu = Menu::with_items(app, &[&show, &about, &quit])?;
```

- `?` 操作符用于简化错误处理
- 如果表达式返回 `Err`，会提前返回错误
- 如果是 `Ok`，则解包并继续执行

## 其他特性

- `unwrap()` 方法：从 `Result` 或 `Option` 中提取值，如果是 `Err` 或 `None` 则 panic
- 类型推断：Rust 通常可以推断变量类型，无需总是显式声明
