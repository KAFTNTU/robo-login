/* ================================================================
   qr_manager.js
   QR-менеджер для Robo Scratch
   - Генерація QR з програми (байткод + XML блоків)
   - Сканування QR камерою (мобільний)
   - Історія QR з мініатюрами
   - Кастомний скролбар в логу
   ================================================================ */

(function () {

/* ---- Завантажити бібліотеки ---- */
function loadScript(src, cb) {
    const s = document.createElement('script');
    s.src = src; s.onload = cb; s.onerror = cb;
    document.head.appendChild(s);
}

const QR_LIBS_LOADED = { qrcode: false, jsqr: false };
loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    () => { QR_LIBS_LOADED.qrcode = true; });
loadScript('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
    () => { QR_LIBS_LOADED.jsqr = true; });

/* ---- Визначити чи мобільний ---- */
const IS_MOBILE = /Android|iPhone|iPad/i.test(navigator.userAgent) ||
                  document.body.classList.contains('layout-mobile');

/* ---- Ключ localStorage ---- */
const HISTORY_KEY = 'robo_qr_history';
const MAX_HISTORY = 20;

/* ================================================================
   CSS
   ================================================================ */
const css = `
/* ---- QR кнопка ---- */
.btn-qr {
    background: linear-gradient(135deg, rgba(14,165,233,0.85), rgba(6,182,212,0.85));
    border: 1px solid rgba(14,165,233,0.5) !important;
}
.btn-qr:hover { background: linear-gradient(135deg,rgba(56,189,248,.9),rgba(34,211,238,.9)); transform:translateY(-1px); }
body.layout-mobile .sensor-row .btn-qr {
    background: linear-gradient(135deg,rgba(14,165,233,.85),rgba(6,182,212,.85)) !important;
    border: 1px solid rgba(14,165,233,.55) !important;
    color: #fff !important;
}

/* ---- Панель QR (модальне вікно) ---- */
#qrPanel {
    position: fixed; inset: 0; z-index: 60;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(6px);
    display: none;
    align-items: flex-end;
    justify-content: center;
}
#qrPanel.open { display: flex; }
@media (min-width: 640px) {
    #qrPanel { align-items: center; padding: 20px; }
}
#qrPanelInner {
    background: #1e293b;
    border: 1px solid rgba(148,163,184,0.15);
    border-radius: 20px 20px 0 0;
    width: 100%; max-width: 520px;
    height: 82vh;
    display: flex; flex-direction: column;
    overflow: hidden;
}
@media (min-width: 640px) {
    #qrPanelInner { border-radius: 20px; height: auto; max-height: 92vh; }
}

/* ---- Хедер панелі ---- */
#qrPanelHeader {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px 0;
    flex-shrink: 0;
}
#qrPanelHeader h2 {
    font-size: 16px; font-weight: 700; color: #f1f5f9;
}
#qrCloseBtn {
    width:32px; height:32px; border-radius:50%;
    background: rgba(148,163,184,0.12);
    border: none; cursor: pointer; color: #94a3b8;
    font-size:18px; display:flex; align-items:center; justify-content:center;
    transition: all .2s;
}
#qrCloseBtn:hover { background: rgba(239,68,68,.2); color:#ef4444; }

/* ---- Таби ---- */
#qrTabs {
    display: flex; gap: 8px; padding: 14px 20px 0;
    flex-shrink: 0;
}
.qr-tab {
    flex: 1; padding: 8px 0; border-radius: 10px;
    background: rgba(148,163,184,0.08);
    border: 1px solid rgba(148,163,184,0.12);
    color: #94a3b8; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all .2s;
    display: flex; align-items: center; justify-content: center; gap: 6px;
}
.qr-tab.active {
    background: rgba(14,165,233,0.18);
    border-color: rgba(14,165,233,0.4);
    color: #38bdf8;
}
.qr-tab:hover:not(.active) { background: rgba(148,163,184,0.14); }

/* ---- Вміст табів ---- */
#qrTabContent { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.qr-pane { display: none; flex-direction: column; flex: 1; overflow: hidden; padding: 16px 20px 20px; }
.qr-pane.active { display: flex; }

/* ---- Генерація ---- */
#qrGenBox {
    display: flex; flex-direction: column; align-items: center; gap: 14px;
    flex: 1;
}
#qrCanvasWrap {
    background: #fff; border-radius: 12px; padding: 12px;
    box-shadow: 0 0 30px rgba(14,165,233,0.2);
}
#qrCanvas { display: block; }
#qrNameInput {
    width: 100%; padding: 10px 14px; border-radius: 10px;
    background: rgba(148,163,184,0.08);
    border: 1px solid rgba(148,163,184,0.2);
    color: #f1f5f9; font-size: 14px; outline: none;
    box-sizing: border-box;
}
#qrNameInput:focus { border-color: rgba(14,165,233,0.5); }
#qrNameInput::placeholder { color: #64748b; }
#qrGenBtn {
    width: 100%; padding: 11px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(14,165,233,0.9), rgba(6,182,212,0.9));
    border: none; color: #fff; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: all .2s;
}
#qrGenBtn:hover { filter: brightness(1.1); transform: translateY(-1px); }
#qrGenBtn:disabled { opacity: .5; cursor: not-allowed; transform: none; }
#qrSaveBtn {
    width: 100%; padding: 9px; border-radius: 12px;
    background: rgba(34,197,94,0.18);
    border: 1px solid rgba(34,197,94,0.3);
    color: #4ade80; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: all .2s; display: none;
}
#qrSaveBtn:hover { background: rgba(34,197,94,0.28); }

/* ---- Сканування ---- */
#qrScanBox { display: flex; flex-direction: column; align-items: center; gap: 14px; flex: 1; }
#qrVideo {
    width: 100%; max-width: 320px; border-radius: 14px;
    background: #000; aspect-ratio: 1;
    object-fit: cover; display: none;
}
#qrScanOverlay {
    position: relative; width: 100%; max-width: 320px;
}
#qrScanResult {
    width: 100%; padding: 10px 14px; border-radius: 10px;
    background: rgba(34,197,94,0.08);
    border: 1px solid rgba(34,197,94,0.2);
    color: #4ade80; font-size: 13px; display: none;
    word-break: break-all;
}
#qrStartScanBtn, #qrLoadBtn {
    width: 100%; padding: 11px; border-radius: 12px;
    border: none; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: all .2s;
}
#qrStartScanBtn {
    background: linear-gradient(135deg, rgba(168,85,247,0.9), rgba(139,92,246,0.9));
    color: #fff;
}
#qrStartScanBtn:hover { filter: brightness(1.1); }
#qrLoadBtn {
    background: rgba(34,197,94,0.2); border: 1px solid rgba(34,197,94,0.3);
    color: #4ade80; display: none;
}
#qrLoadBtn:hover { background: rgba(34,197,94,0.3); }
.qr-pc-only {
    color: #64748b; font-size: 13px; text-align: center; padding: 20px;
}

/* ---- Історія ---- */
#qrHistoryList {
    flex: 1;
    overflow-y: auto;
    display: flex; flex-direction: column; gap: 10px;
    padding-right: 4px;
}
/* Кастомний скролбар в списку */
#qrHistoryList::-webkit-scrollbar { width: 4px; }
#qrHistoryList::-webkit-scrollbar-track { background: rgba(148,163,184,0.05); border-radius:4px; }
#qrHistoryList::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.25); border-radius:4px; }
#qrHistoryList::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.45); }

.qr-history-item {
    display: flex; align-items: center; gap: 12px;
    background: rgba(148,163,184,0.06);
    border: 1px solid rgba(148,163,184,0.1);
    border-radius: 14px; padding: 10px 12px;
    cursor: default; transition: background .15s;
}
.qr-history-item:hover { background: rgba(148,163,184,0.1); }
.qr-history-thumb {
    width: 52px; height: 52px; flex-shrink: 0;
    border-radius: 8px; overflow: hidden;
    background: #fff; padding: 3px;
    cursor: pointer; transition: transform .2s;
}
.qr-history-thumb:hover { transform: scale(1.08); }
.qr-history-thumb canvas, .qr-history-thumb img { width: 100%; height: 100%; display:block; }
.qr-history-info { flex: 1; min-width: 0; }
.qr-history-name {
    font-size: 14px; font-weight: 600; color: #e2e8f0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    cursor: pointer; transition: color .15s;
}
.qr-history-name:hover { color: #38bdf8; text-decoration: underline; }
.qr-history-date { font-size: 11px; color: #64748b; margin-top: 2px; }
.qr-history-size { font-size: 11px; color: #475569; }
.qr-history-del {
    width: 28px; height: 28px; border-radius: 8px;
    background: none; border: none;
    color: #475569; cursor: pointer; font-size: 14px;
    transition: all .15s; display:flex; align-items:center; justify-content:center;
}
.qr-history-del:hover { background: rgba(239,68,68,.15); color:#ef4444; }
.qr-history-empty {
    text-align: center; color: #475569; font-size: 13px;
    padding: 40px 20px;
}

/* ---- Fullscreen QR overlay ---- */
#qrFullscreen {
    position: fixed; inset: 0; z-index: 70;
    background: rgba(0,0,0,0.92);
    display: none; align-items: center; justify-content: center;
    flex-direction: column; gap: 20px;
    cursor: pointer;
}
#qrFullscreen.open { display: flex; }
#qrFullscreenImg {
    background: #fff; border-radius: 16px; padding: 20px;
    max-width: min(90vw, 90vh);
    box-shadow: 0 0 60px rgba(14,165,233,0.3);
}
#qrFullscreenImg canvas, #qrFullscreenImg img { display: block; max-width: 100%; }
#qrFullscreenName { color: #f1f5f9; font-size: 16px; font-weight: 600; }
#qrFullscreenHint { color: #64748b; font-size: 13px; }

/* ---- Кастомний скролбар в логу ---- */
#logContainer::-webkit-scrollbar { width: 5px; }
#logContainer::-webkit-scrollbar-track { background: rgba(148,163,184,0.04); }
#logContainer::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, rgba(14,165,233,0.4), rgba(6,182,212,0.2));
    border-radius: 4px;
}
#logContainer::-webkit-scrollbar-thumb:hover { background: rgba(14,165,233,0.6); }
`;

const styleEl = document.createElement('style');
styleEl.textContent = css;
document.head.appendChild(styleEl);

/* ================================================================
   HTML панелі
   ================================================================ */
const SCAN_TAB_HTML = IS_MOBILE ? `
    <div class="qr-pane" id="qrPaneScan">
        <div id="qrScanBox">
            <div id="qrScanOverlay">
                <video id="qrVideo" playsinline autoplay muted></video>
            </div>
            <div id="qrScanResult"></div>
            <button id="qrStartScanBtn">
                <i class="fa-solid fa-camera"></i> Сканувати QR
            </button>
            <button id="qrLoadBtn">
                <i class="fa-solid fa-download"></i> Завантажити блоки
            </button>
        </div>
    </div>
` : `
    <div class="qr-pane" id="qrPaneScan">
        <div class="qr-pc-only">
            <i class="fa-solid fa-desktop" style="font-size:32px;margin-bottom:12px;display:block;opacity:.3"></i>
            Сканування доступне тільки на мобільному.<br>
            На ПК відкрийте камеру телефону і наведіть на QR.
        </div>
    </div>
`;

const panelHTML = `
<div id="qrPanel">
  <div id="qrPanelInner">
    <div id="qrPanelHeader">
      <h2><i class="fa-solid fa-qrcode" style="margin-right:8px;color:#38bdf8"></i>QR Менеджер</h2>
      <button id="qrCloseBtn" onclick="closeQRPanel()">✕</button>
    </div>

    <div id="qrTabs">
      <button class="qr-tab active" id="qrTabGen" onclick="switchQRTab('gen')">
        <i class="fa-solid fa-qrcode"></i> Генерація
      </button>
      ${IS_MOBILE ? `<button class="qr-tab" id="qrTabScan" onclick="switchQRTab('scan')">
        <i class="fa-solid fa-camera"></i> Сканувати
      </button>` : ''}
      <button class="qr-tab" id="qrTabHistory" onclick="switchQRTab('history')">
        <i class="fa-solid fa-clock-rotate-left"></i> Історія
      </button>
    </div>

    <div id="qrTabContent">

      <!-- Генерація -->
      <div class="qr-pane active" id="qrPaneGen">
        <div id="qrGenBox">
          <input id="qrNameInput" type="text" placeholder="Назва програми (необов'язково)">
          <button id="qrGenBtn" onclick="generateQR()">
            <i class="fa-solid fa-qrcode"></i> Згенерувати QR
          </button>
          <div id="qrCanvasWrap" style="display:none">
            <div id="qrCanvas"></div>
          </div>
          <button id="qrSaveBtn" onclick="saveCurrentQR()">
            <i class="fa-solid fa-floppy-disk"></i> Зберегти в історію
          </button>
        </div>
      </div>

      <!-- Сканування -->
      ${SCAN_TAB_HTML}

      <!-- Історія -->
      <div class="qr-pane" id="qrPaneHistory">
        <div id="qrHistoryList"></div>
      </div>

    </div>
  </div>
</div>

<!-- Fullscreen QR overlay -->
<div id="qrFullscreen" onclick="closeQRFullscreen()">
  <div id="qrFullscreenImg"></div>
  <div id="qrFullscreenName"></div>
  <div id="qrFullscreenHint">Натисни будь-де щоб закрити</div>
</div>
`;

document.body.insertAdjacentHTML('beforeend', panelHTML);

/* ================================================================
   Поточний QR для збереження
   ================================================================ */
let _currentQRData = null;  /* { name, xml, bytecode, dataUrl } */
let _scanStream    = null;
let _scanInterval  = null;
let _scannedData   = null;

/* ================================================================
   Відкрити / закрити панель
   ================================================================ */
window.openQRPanel = function () {
    document.getElementById('qrPanel').classList.add('open');
    switchQRTab('gen');
};

window.closeQRPanel = function () {
    document.getElementById('qrPanel').classList.remove('open');
    stopScan();
};

/* Закрити по кліку на фон */
document.getElementById('qrPanel').addEventListener('click', function (e) {
    if (e.target === this) window.closeQRPanel();
});

/* ================================================================
   Перемикання табів
   ================================================================ */
window.switchQRTab = function (tab) {
    ['gen', 'scan', 'history'].forEach(t => {
        const btn  = document.getElementById('qrTab' + t.charAt(0).toUpperCase() + t.slice(1));
        const pane = document.getElementById('qrPane' + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn)  btn.classList.toggle('active',  t === tab);
        if (pane) pane.classList.toggle('active', t === tab);
    });
    if (tab === 'history') renderHistory();
    if (tab !== 'scan') stopScan();
};

/* ================================================================
   ГЕНЕРАЦІЯ QR
   ================================================================ */
window.generateQR = async function () {
    if (!window.workspace) {
        alert('Немає Blockly workspace!'); return;
    }
    if (!QR_LIBS_LOADED.qrcode) {
        alert('Бібліотека QR ще завантажується, спробуй ще раз.'); return;
    }

    const btn = document.getElementById('qrGenBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Генерую...';

    try {
        /* ── Спробувати компактний формат v2 (QRCodec) ── */
        let payload, xml, bytecodeB64 = '', useCompact = false;

        if (window.QRCodec) {
            try {
                const compact = window.QRCodec.encode(window.workspace);
                payload = 'Q2:' + compact;   // префікс версії v2
                useCompact = true;
                /* XML зберігаємо локально (для history), але не в QR */
                xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(window.workspace));
            } catch(e) {
                useCompact = false;
                if (typeof window.log === 'function')
                    window.log('⚠️ Компактний QR не вдався: ' + e + ' — використовую XML', 'err');
            }
        }

        if (!useCompact) {
            /* Fallback: старий формат v1 (повний XML) */
            xml = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(window.workspace));
            if (window.STMCompiler) {
                try {
                    const c = new window.STMCompiler();
                    const code = c.compile(window.workspace);
                    if (code && code.length > 0)
                        bytecodeB64 = btoa(String.fromCharCode(...code));
                } catch(e) {}
            }
            payload = JSON.stringify({ v:1, xml, bc: bytecodeB64 });
        }

        /* Показати розмір у логу */
        if (typeof window.log === 'function') {
            const fmt = useCompact ? 'компактний v2' : 'XML v1';
            window.log(`📦 QR формат: ${fmt} — ${payload.length} символів`, 'info');
        }

        /* Перевірити розмір */
        if (payload.length > 2953) {
            alert(`Програма завелика для QR (${payload.length} символів, максимум ~2900).\nСпробуй спростити програму.`);
            return;
        }

        /* Очистити попередній */
        const wrap = document.getElementById('qrCanvasWrap');
        const canv = document.getElementById('qrCanvas');
        canv.innerHTML = '';
        wrap.style.display = 'none';

        /* Генерувати QR */
        await new Promise((resolve, reject) => {
            try {
                new QRCode(canv, {
                    text: payload,
                    width: 240, height: 240,
                    colorDark: '#000000',
                    colorLight: '#ffffff',
                    correctLevel: QRCode.CorrectLevel.M,
                });
                setTimeout(resolve, 100);
            } catch(e) { reject(e); }
        });

        wrap.style.display = 'block';

        /* Отримати dataUrl для збереження (мобільний повертає <img>, десктоп — <canvas>) */
        const imgEl    = canv.querySelector('img');
        const canvEl   = canv.querySelector('canvas');
        let dataUrl = '';
        if (imgEl && imgEl.src && imgEl.src.startsWith('data:')) {
            dataUrl = imgEl.src;
        } else if (canvEl && typeof canvEl.toDataURL === 'function') {
            dataUrl = canvEl.toDataURL();
        } else if (imgEl && imgEl.src) {
            /* img.src може бути blob або http — спробуємо через canvas */
            try {
                const tmp = document.createElement('canvas');
                tmp.width = 240; tmp.height = 240;
                const ctx = tmp.getContext('2d');
                ctx.drawImage(imgEl, 0, 0);
                dataUrl = tmp.toDataURL();
            } catch(e) { dataUrl = ''; }
        }

        const name = document.getElementById('qrNameInput').value.trim() ||
                     _autoName() || 'Програма';

        _currentQRData = { name, xml, bytecodeB64, dataUrl, size: payload.length };

        document.getElementById('qrSaveBtn').style.display = 'block';

        if (typeof window.log === 'function')
            window.log(`📱 QR згенеровано: ${payload.length} символів`, 'info');

    } catch(e) {
        alert('Помилка генерації: ' + e);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-qrcode"></i> Оновити QR';
    }
};

/* Автоматична назва з блоків */
function _autoName() {
    if (!window.workspace) return '';
    const all = window.workspace.getAllBlocks(false).map(b => b.type);
    if (all.includes('controls_whileUntil') || all.includes('loop_forever'))
        return 'Автопілот';
    if (all.includes('controls_repeat_ext'))
        return 'Маршрут';
    if (all.includes('wait_until_sensor'))
        return 'Датчик';
    if (all.includes('robot_turn_timed'))
        return 'Поворот';
    if (all.includes('robot_move'))
        return 'Рух';
    return 'Програма';
}

/* ================================================================
   ЗБЕРЕЖЕННЯ В ІСТОРІЮ
   ================================================================ */
window.saveCurrentQR = function () {
    if (!_currentQRData) return;

    const history = loadHistory();
    const entry = {
        id:       Date.now(),
        name:     _currentQRData.name,
        xml:      _currentQRData.xml,
        bc:       _currentQRData.bytecodeB64,
        dataUrl:  _currentQRData.dataUrl,
        size:     _currentQRData.size,
        date:     new Date().toLocaleString('uk-UA', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        }),
    };

    history.unshift(entry);
    if (history.length > MAX_HISTORY) history.pop();
    saveHistory(history);

    document.getElementById('qrSaveBtn').innerHTML =
        '<i class="fa-solid fa-check"></i> Збережено!';
    setTimeout(() => {
        document.getElementById('qrSaveBtn').innerHTML =
            '<i class="fa-solid fa-floppy-disk"></i> Зберегти в історію';
    }, 1500);

    if (typeof window.log === 'function')
        window.log(`💾 QR збережено: "${entry.name}"`, 'info');
};


/* ================================================================
   АВТО-ОНОВЛЕННЯ QR — спрацьовує при зміні блоків
   ================================================================ */
let _autoQRTimer = null;
function _scheduleAutoQR() {
    if (!_autoQRTimer) {
        _autoQRTimer = setTimeout(() => {
            _autoQRTimer = null;
            /* Оновлюємо тільки якщо панель відкрита і таб генерації активний */
            const panel = document.getElementById('qrPanel');
            const pane  = document.getElementById('qrPaneGen');
            const wrap  = document.getElementById('qrCanvasWrap');
            if (panel && panel.classList.contains('open') &&
                pane  && pane.classList.contains('active') &&
                wrap  && wrap.style.display !== 'none') {
                window.generateQR();
            }
        }, 1500);
    }
}

/* Підключити до Blockly після завантаження */
function _attachBlocklyListener() {
    if (window.workspace && window.workspace.addChangeListener) {
        window.workspace.addChangeListener(e => {
            if (e.type === 'finished_loading') return;
            _scheduleAutoQR();
        });
    } else {
        setTimeout(_attachBlocklyListener, 1000);
    }
}
_attachBlocklyListener();

/* ================================================================
   СКАНУВАННЯ (мобільний)
   ================================================================ */
/* Тільки onclick щоб не конфліктували обробники */
const _scanBtn = document.getElementById('qrStartScanBtn');
if (_scanBtn) _scanBtn.onclick = IS_MOBILE ? startScan : null;

async function startScan() {
    if (!QR_LIBS_LOADED.jsqr) {
        alert('Бібліотека сканування ще завантажується.'); return;
    }
    try {
        _scanStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
        const video = document.getElementById('qrVideo');
        if (!video) return;
        video.srcObject = _scanStream;
        video.style.display = 'block';
        document.getElementById('qrStartScanBtn').innerHTML =
            '<i class="fa-solid fa-stop"></i> Зупинити';
        document.getElementById('qrStartScanBtn').onclick = stopScan;

        _scanInterval = setInterval(() => scanFrame(video), 200);
    } catch(e) {
        alert('Немає доступу до камери: ' + e.message);
    }
}

function stopScan() {
    if (_scanInterval) { clearInterval(_scanInterval); _scanInterval = null; }
    const video = document.getElementById('qrVideo');
    if (video) {
        video.pause();
        video.srcObject = null;
        try { video.load(); } catch(e) {}
        video.style.display = 'none';
    }
    if (_scanStream) {
        _scanStream.getTracks().forEach(t => { try { t.stop(); } catch(e) {} });
        _scanStream = null;
    }
    const startBtn = document.getElementById('qrStartScanBtn');
    if (startBtn) {
        startBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Сканувати QR';
        startBtn.onclick = startScan;
    }
}

function scanFrame(video) {
    if (!video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const result  = jsQR(imgData.data, imgData.width, imgData.height);
    if (result) {
        stopScan();
        processScannedData(result.data);
    }
}

function processScannedData(raw) {
    try {
        let xml = null;

        if (raw.startsWith('Q2:')) {
            /* ── Формат v2: компактний рядок ── */
            const compact = raw.slice(3);
            if (window.QRCodec) {
                xml = window.QRCodec.decode(compact);
            } else {
                throw new Error('QRCodec не завантажений');
            }
            _scannedData = { xml, compact };
        } else {
            /* ── Формат v1: JSON з XML ── */
            const data = JSON.parse(raw);
            xml = data.xml;
            _scannedData = data;
        }

        const resultEl = document.getElementById('qrScanResult');
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = '';
            resultEl.textContent = '✅ Знайдено програму!';
        }

        const loadBtn = document.getElementById('qrLoadBtn');
        if (loadBtn) {
            loadBtn.style.display = 'block';
            loadBtn.onclick = () => loadXMLToWorkspace(xml, 'Сканований QR');
        }

        if (typeof window.log === 'function')
            window.log('📷 QR відсканований успішно', 'info');

    } catch(e) {
        const resultEl = document.getElementById('qrScanResult');
        if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.style.color = '#f87171';
            resultEl.textContent = '❌ Невідомий QR код: ' + e.message;
        }
    }
}

/* ================================================================
   ЗАВАНТАЖИТИ XML В WORKSPACE
   ================================================================ */
function loadXMLToWorkspace(xml, name) {
    if (!window.workspace || !xml) return;
    try {
        window.workspace.clear();
        /* Сумісність з різними версіями Blockly */
        const textToDom = Blockly.Xml.textToDom
            || Blockly.utils?.xml?.textToDom
            || ((s) => new DOMParser().parseFromString(s, 'text/xml').documentElement);
        const dom = textToDom(xml);
        Blockly.Xml.domToWorkspace(dom, window.workspace);
        window.closeQRPanel();
        if (typeof window.log === 'function')
            window.log(`📂 Завантажено блоки: "${name}"`, 'info');
    } catch(e) {
        alert('Помилка завантаження блоків: ' + e);
    }
}

/* ================================================================
   РЕНДЕР ІСТОРІЇ
   ================================================================ */
function renderHistory() {
    const list    = document.getElementById('qrHistoryList');
    const history = loadHistory();

    if (history.length === 0) {
        list.innerHTML = `<div class="qr-history-empty">
            <i class="fa-solid fa-clock-rotate-left" style="font-size:28px;opacity:.2;display:block;margin-bottom:10px"></i>
            Ще немає збережених QR.<br>Згенеруй і збережи програму.
        </div>`;
        return;
    }

    list.innerHTML = history.map(entry => `
        <div class="qr-history-item" data-id="${entry.id}">
            <div class="qr-history-thumb" onclick="showQRFullscreen(${entry.id})">
                ${entry.dataUrl
                    ? `<img src="${entry.dataUrl}" alt="QR">`
                    : `<div id="qr-thumb-${entry.id}" style="width:46px;height:46px"></div>`}
            </div>
            <div class="qr-history-info">
                <div class="qr-history-name"
                     onclick="loadHistoryEntry(${entry.id})"
                     title="Завантажити блоки">
                    ${escHtml(entry.name)}
                </div>
                <div class="qr-history-date">${entry.date}</div>
                <div class="qr-history-size">${entry.size || '?'} симв.</div>
            </div>
            <button class="qr-history-del" onclick="deleteHistoryEntry(${entry.id})"
                    title="Видалити">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>
    `).join('');

    /* Генерувати мініатюри для записів без dataUrl */
    history.forEach(entry => {
        if (!entry.dataUrl && QR_LIBS_LOADED.qrcode) {
            const el = document.getElementById('qr-thumb-' + entry.id);
            if (el) {
                try {
                    new QRCode(el, {
                        text: JSON.stringify({ v:1, xml: entry.xml, bc: entry.bc }),
                        width: 46, height: 46,
                    });
                } catch(e) {}
            }
        }
    });
}

/* ================================================================
   FULLSCREEN QR
   ================================================================ */
window.showQRFullscreen = function (id) {
    const history = loadHistory();
    const entry   = history.find(e => e.id === id);
    if (!entry) return;

    const wrap = document.getElementById('qrFullscreenImg');
    wrap.innerHTML = '';

    if (entry.dataUrl) {
        wrap.innerHTML = `<img src="${entry.dataUrl}" style="width:min(80vw,80vh);height:min(80vw,80vh);display:block">`;
    } else if (QR_LIBS_LOADED.qrcode) {
        const div = document.createElement('div');
        div.style.cssText = 'width:280px;height:280px';
        wrap.appendChild(div);
        try {
            new QRCode(div, {
                text: JSON.stringify({ v:1, xml: entry.xml, bc: entry.bc }),
                width: 280, height: 280,
            });
        } catch(e) {}
    }

    document.getElementById('qrFullscreenName').textContent = entry.name;
    document.getElementById('qrFullscreen').classList.add('open');
};

window.closeQRFullscreen = function () {
    document.getElementById('qrFullscreen').classList.remove('open');
};

/* ================================================================
   ЗАВАНТАЖИТИ З ІСТОРІЇ
   ================================================================ */
window.loadHistoryEntry = function (id) {
    const history = loadHistory();
    const entry   = history.find(e => e.id === id);
    if (!entry || !entry.xml) return;
    loadXMLToWorkspace(entry.xml, entry.name);
};

/* ================================================================
   ВИДАЛИТИ З ІСТОРІЇ
   ================================================================ */
window.deleteHistoryEntry = function (id) {
    let history = loadHistory();
    history = history.filter(e => e.id !== id);
    saveHistory(history);
    renderHistory();
};

/* ================================================================
   localStorage
   ================================================================ */
function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
    catch(e) { return []; }
}
function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch(e) {}
}

/* ================================================================
   Хелпер
   ================================================================ */
function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ================================================================
   Замінити кнопку "крок" на кнопку QR
   ================================================================ */
function patchStepButton() {
    const btn = document.getElementById('rcDbgStep');
    if (!btn) return;
    btn.id      = 'qrManagerBtn';
    btn.title   = 'QR Менеджер';
    btn.onclick = () => window.openQRPanel();
    btn.classList.remove('btn-step');
    btn.classList.add('btn-qr');
    btn.innerHTML = '<i class="fa-solid fa-qrcode"></i>';
}

/* Чекати поки DOM готовий */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', patchStepButton);
} else {
    setTimeout(patchStepButton, 100);
}

/* Гарячі клавіші */
document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key === 'q') { e.preventDefault(); window.openQRPanel(); }
    if (e.key === 'Escape') {
        window.closeQRFullscreen();
        window.closeQRPanel();
    }
});

})();
