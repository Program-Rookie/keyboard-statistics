const { listen } = window.__TAURI__.event;
const popup = document.getElementById('popup');
let hideTimeout = null;

listen('key-pressed', event => {
    popup.textContent = event.payload.key_code;
    popup.classList.add('show');
    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        popup.classList.remove('show');
    }, 800);
});