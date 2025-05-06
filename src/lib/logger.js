// 日志工具
// 与后端的日志系统集成

// 导入Tauri API
const { invoke } = window.__TAURI__.core;

// 日志级别定义
const LogLevel = {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARNING: 'WARNING',
    ERROR: 'ERROR'
};

// 日志源，用于区分不同的日志来源
const LogSource = {
    MAIN: 'main',
    KEY_POPUP: 'key_popup',
    CONSOLE: 'console'
};

// 记录日志的函数
async function logMessage(level, source, message) {
    try {
        await invoke('log_message', { level, source, message });
        return true;
    } catch (error) {
        console.error(`记录日志失败: ${error}`);
        return false;
    }
}

// 便捷日志函数
async function debug(source, message) {
    return logMessage(LogLevel.DEBUG, source, message);
}

async function info(source, message) {
    return logMessage(LogLevel.INFO, source, message);
}

async function warning(source, message) {
    return logMessage(LogLevel.WARNING, source, message);
}

async function error(source, message) {
    return logMessage(LogLevel.ERROR, source, message);
}

// 获取日志目录路径
async function getLogDirectory() {
    try {
        return await invoke('get_log_directory');
    } catch (error) {
        console.error(`获取日志目录失败: ${error}`);
        return null;
    }
}

// 重写console方法，将日志同时记录到文件
function interceptConsole() {
    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error
    };

    // 重写console.log
    console.log = function(...args) {
        originalConsole.log.apply(console, args);
        const message = args.map(arg => formatArgument(arg)).join(' ');
        info(LogSource.CONSOLE, `[log] ${message}`).catch(() => {});
    };

    // 重写console.info
    console.info = function(...args) {
        originalConsole.info.apply(console, args);
        const message = args.map(arg => formatArgument(arg)).join(' ');
        info(LogSource.CONSOLE, `[info] ${message}`).catch(() => {});
    };

    // 重写console.warn
    console.warn = function(...args) {
        originalConsole.warn.apply(console, args);
        const message = args.map(arg => formatArgument(arg)).join(' ');
        warning(LogSource.CONSOLE, `[warn] ${message}`).catch(() => {});
    };

    // 重写console.error
    console.error = function(...args) {
        originalConsole.error.apply(console, args);
        const message = args.map(arg => formatArgument(arg)).join(' ');
        error(LogSource.CONSOLE, `[error] ${message}`).catch(() => {});
    };

    // 添加全局错误处理
    window.addEventListener('error', (event) => {
        const errorInfo = {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno,
            stack: event.error ? event.error.stack : 'No stack trace available'
        };
        error(LogSource.CONSOLE, `[uncaught] ${JSON.stringify(errorInfo)}`).catch(() => {});
    });

    // 添加未处理的Promise拒绝处理
    window.addEventListener('unhandledrejection', (event) => {
        const reason = event.reason ? event.reason.toString() : 'Unknown Promise rejection reason';
        const stack = event.reason && event.reason.stack ? event.reason.stack : 'No stack trace available';
        error(LogSource.CONSOLE, `[unhandledrejection] ${reason}, Stack: ${stack}`).catch(() => {});
    });

    console.log('Console intercepted - now logging to file');
}

// 将各种参数类型转换为字符串
function formatArgument(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
        try {
            return JSON.stringify(arg);
        } catch (error) {
            return `[Object: ${typeof arg}]`;
        }
    }
    return String(arg);
}

// 传统的CommonJS导出方式
export default {
    LogLevel,
    LogSource,
    logMessage,
    debug,
    info,
    warning,
    error,
    getLogDirectory,
    interceptConsole
};