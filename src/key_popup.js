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
// 跟踪连击计数
let comboCount = 0;
// 上一个按键
let lastKeyCode = '';
// 连击计时器
let comboTimer = null;
// 最大同时显示的弹窗数量
const MAX_POPUPS = 6;
// 按键计数器（用于透明度计算）
let keyCounter = 0;

// 定义字母键、功能键和修饰键
const letterKeys = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('');
const functionKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    'Tab', 'CapsLock', 'Esc', 'Enter', 'Backspace', 'Delete', 'Insert',
    'Home', 'End', 'PageUp', 'PageDown', 'PrintScreen'
];
const modifierKeys = ['Shift', 'Ctrl', 'Alt', 'Control', 'Option', 'Command', 'Meta', 'Super', 'Win'];

// 判断按键类型的函数
function getKeyClass(keyCode) {
    if (letterKeys.includes(keyCode)) {
        return 'letter-key';
    } else if (functionKeys.some(key => keyCode.includes(key))) {
        return 'function-key';
    } else if (modifierKeys.some(key => keyCode.includes(key))) {
        return 'modifier-key';
    }
    return '';
}

// 计算透明度函数
function calculateOpacity(count) {
    // 随着按键计数增加，透明度从1.0逐渐降低到0.4
    // 使用非线性衰减确保体验更好
    const baseOpacity = 1.0;
    const minOpacity = 0.4;
    const decayFactor = 0.1; // 控制衰减速度

    return Math.max(minOpacity, baseOpacity - Math.log1p(count * decayFactor) * 0.25);
}

// 更新所有弹窗透明度
function updateAllPopupsOpacity() {
    const popups = popupContainer.querySelectorAll('.popup');
    const count = popups.length;

    popups.forEach((popup, index) => {
        // 新弹出的按键透明度保持较高，较早的按键透明度降低
        const positionFactor = 1 - (index / count) * 0.3; // 位置影响因子
        const baseOpacity = calculateOpacity(keyCounter);
        const finalOpacity = baseOpacity * positionFactor;

        // 设置透明度
        popup.style.opacity = finalOpacity;
    });
}

listen('key-pressed', event => {
    // 更新按键计数器
    keyCounter++;

    // 定期减少计数器，以便长期后透明度恢复
    setTimeout(() => {
        keyCounter = Math.max(0, keyCounter - 1);
    }, 5000);

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

    // 检查当前弹窗数量，如果超过最大数量，则移除最早的弹窗
    while (popupContainer.children.length >= MAX_POPUPS) {
        const oldestPopup = popupContainer.firstChild;
        if (oldestPopup) {
            popupContainer.removeChild(oldestPopup);
        }
    }

    // 创建新的popup元素
    const popup = document.createElement('div');
    const keyCode = event.payload.key_code;
    const keyClass = getKeyClass(keyCode);

    // 检查是否连击
    let isCombo = false;
    if (keyCode === lastKeyCode) {
        comboCount++;
        clearTimeout(comboTimer);

        if (comboCount >= 3) {
            isCombo = true;
        }
    } else {
        comboCount = 1;
        lastKeyCode = keyCode;
    }

    // 重置连击计时器
    comboTimer = setTimeout(() => {
        comboCount = 0;
        lastKeyCode = '';
    }, 800);

    // 设置基础类和按键类型类
    const comboClass = isCombo ? 'combo' : '';
    popup.className = `popup show pressed ${keyClass} ${comboClass}`;
    popup.textContent = keyCode;

    // 计算并设置初始透明度
    const initialOpacity = calculateOpacity(keyCounter);
    popup.style.opacity = initialOpacity;

    // 添加爆炸效果当打击速度很快时
    if (Date.now() - lastKeyPressTime < 100) {
        popup.classList.add('key-press');
    }

    // 按键位置稍微错开，避免完全重叠
    if (popupContainer.children.length > 0) {
        const offset = (popupContainer.children.length % 3) - 1; // -1, 0, 1
        if (offset !== 0) {
            // 水平错开但不改变垂直位置，避免顶部溢出
            popup.style.transform = `translateX(${offset * 8}px)`;
        }
    }

    popupContainer.appendChild(popup);

    // 更新所有弹窗的透明度
    updateAllPopupsOpacity();

    // 动画：pressed -> show
    setTimeout(() => {
        popup.classList.remove('pressed');
    }, 280);

    // 淡出并移除
    setTimeout(() => {
        popup.classList.add('hide');
        popup.classList.remove('show');
        // 动画结束后移除节点
        setTimeout(() => {
            // 检查元素是否仍然存在于DOM中
            if (popup.parentNode === popupContainer) {
                popupContainer.removeChild(popup);
                // 更新所有弹窗的透明度
                updateAllPopupsOpacity();
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
                                // 重置按键计数器
                                keyCounter = 0;
                            }
                        });
                    }
                }, hideDelay);
            }
        }, 500); // 增加动画结束后的等待时间以匹配新的动画
    }, 1200); // 增加popup显示时间，提升用户体验
});

// 添加窗口状态检查函数
function checkWindowVisibility() {
    currentWindow.then((window) => {
        if (window) {
            window.isVisible().then((visible) => {
                isWindowVisible = visible;
                if (!visible) {
                    // 窗口隐藏时重置按键计数器
                    keyCounter = 0;
                }
            });
        }
    });
}

// 初始化时检查窗口状态
checkWindowVisibility();

// 添加调试代码，确认脚本已加载
console.log('key_popup.js 已加载，小红书风格动画优化版（带透明度渐变）');