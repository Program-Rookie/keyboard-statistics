const { listen } = window.__TAURI__.event;
const { WebviewWindow } = window.__TAURI__.webviewWindow;
const popupContainer = document.getElementById('popup-container');
// 获取当前窗口
const currentWindow = WebviewWindow.getByLabel('key_popup');

// 跟踪最后一次按键时间
let lastKeyPressTime = 0;
// 窗口自动隐藏的计时器
let hideWindowTimer = null;
// 添加窗口可见状态标志
let isWindowVisible = false;

listen('key-pressed', event => {
    // 更新最后按键时间
    lastKeyPressTime = Date.now();
    
    // 清除之前的隐藏计时器
    if (hideWindowTimer) {
        clearTimeout(hideWindowTimer);
        hideWindowTimer = null;
    }
    
    // 如果窗口不可见，则显示窗口
    if (!isWindowVisible) {
        currentWindow.then((window) => {
            if (window) {
                window.show();
                isWindowVisible = true;
            }
        });
    }

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
            // 检查元素是否仍然存在于DOM中
            if (popup.parentNode === popupContainer) {
                popupContainer.removeChild(popup);
            }
            
            // 如果没有popup了，设置窗口隐藏计时器
            if (popupContainer.children.length === 0) {
                // 根据最后按键时间计算窗口消失的延迟
                // 如果最后按键时间超过500ms，则立即隐藏
                const timeSinceLastKey = Date.now() - lastKeyPressTime;
                const hideDelay = timeSinceLastKey > 500 ? 50 : Math.min(200, Math.max(50, 200 - popupContainer.children.length * 30));
                
                hideWindowTimer = setTimeout(() => {
                    // 再次检查是否仍然没有子元素
                    if (popupContainer.children.length === 0) {
                        currentWindow.then((window) => {
                            if (window) {
                                window.hide();
                                isWindowVisible = false;
                                hideWindowTimer = null;
                            }
                        });
                    }
                }, hideDelay);
            }
        }, 200); // 减少动画结束后的等待时间
    }, 1000); // 减少popup显示时间
});

// 添加窗口状态检查函数
function checkWindowVisibility() {
    currentWindow.then((window) => {
        if (window) {
            window.isVisible().then((visible) => {
                isWindowVisible = visible;
            });
        }
    });
}

// 初始化时检查窗口状态
checkWindowVisibility();

// 添加调试代码，确认脚本已加载
console.log('key_popup.js 已加载');