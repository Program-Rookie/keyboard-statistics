const { listen } = window.__TAURI__.event;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
const popupContainer = document.getElementById('popup-container');
// 获取当前窗口
const currentWindow = WebviewWindow.getByLabel('key_popup');

listen('key-pressed', event => {
    currentWindow.then((window) => {
        if (window) {
            window.show();
        }
    });

    // 创建新的popup元素
    const popup = document.createElement('div');
    popup.className = 'popup show pressed';
    popup.textContent = event.payload.key_code;
    popupContainer.appendChild(popup);

    // 动画：pressed -> show
    setTimeout(() => {
        popup.classList.remove('pressed');
    }, 280);

    // 淡出并移除
    setTimeout(() => {
        popup.classList.remove('show');
        // 动画结束后移除节点
        setTimeout(() => {
            popupContainer.removeChild(popup);
            // 如果没有popup了，隐藏窗口
            if (popupContainer.children.length === 0) {
                currentWindow.then((window) => {
                    if (window) {
                        window.hide();
                    }
                });
            }
        }, 300);
    }, 1200); // 每个popup显示1.2秒
});

// 添加调试代码，确认脚本已加载
console.log('key_popup.js 已加载');