const { listen } = window.__TAURI__.event;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
const popup = document.getElementById('popup');
let hideTimeout = null;
// 获取当前窗口
const currentWindow = WebviewWindow.getByLabel('key_popup');
listen('key-pressed', event => {
    currentWindow.then((window) => {
        if (window) {
            window.show();
        }
    });
    popup.textContent = event.payload.key_code;
    popup.classList.add('show');
    popup.classList.add('pressed');
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        popup.classList.remove('show');
        popup.classList.remove('pressed');
        // 在按键效果消失后再隐藏窗口
        setTimeout(() => {
            console.log("currentWindow ", currentWindow);
            currentWindow.then((window) => {
                if (window) {
                    window.hide();
                }
            });
        }, 300); // 等待淡出动画完成
    }, 800);
});
// 添加调试代码，确认脚本已加载
console.log('key_popup.js 已加载');
console.log(window.isIgnoreCursorEvents())