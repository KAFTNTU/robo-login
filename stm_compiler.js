/* ================================================================
   stm_compiler.js
   Компілятор Blockly → байткод для program_runer STM32

   Підключити в index.html після blocks_car_fixed3.js:
     <script src="stm_compiler.js"></script>
   ================================================================ */

(function () {

/* ---- Опкоди (мусять збігатись з program_runner.h) ---- */
const OP = {
    DRIVE_SET:    0x01, DRIVE:        0x02,
    DRIVE4_SET:   0x03, DRIVE4:       0x04,
    SET_MOTOR:    0x05, STOP:         0x06,
    WAIT:         0x07, SET_SPEED:    0x08,

    JUMP:         0x10, JUMP_IF_F:    0x11,
    REPEAT_START: 0x12, REPEAT_END:   0x13,
    LOOP_END:     0x14,

    PUSH_CONST:   0x20, PUSH_SENSOR:  0x21,
    PUSH_BOOL:    0x22, PUSH_TIMER:   0x23,
    TIMER_RESET:  0x24,

    CMP_LT:  0x30, CMP_GT:  0x31, CMP_EQ:  0x32,
    CMP_NEQ: 0x33, CMP_LTE: 0x34, CMP_GTE: 0x35,
    AND: 0x38, OR: 0x39, NOT: 0x3A,
    ADD: 0x40, SUB: 0x41, MUL: 0x42, DIV: 0x43,
    END: 0xFF,
};

/* ---- Протокольні команди ---- */
const PCMD = {
    BEGIN: 0xA0, END: 0xA1,
    RUN:   0xA2, STOP: 0xA3,
    CLEAR: 0xA4, CHUNK: 0xB0,
    SAVE:  0xA5,  /* зберегти в FRAM автоматично */
};

/* ================================================================
   Клас Compiler
   ================================================================ */
class Compiler {
    constructor() {
        this.buf = [];     /* байти програми */
        this.errors = [];  /* попередження/помилки */
    }

    /* --- Базові emit --- */
    emit(b)    { this.buf.push(b & 0xFF); }
    emit16(v)  {
        v = Math.round(v);
        if (v < 0)      v = v & 0xFFFF;
        if (v > 65535)  v = 65535;
        this.buf.push((v >> 8) & 0xFF, v & 0xFF);
    }
    emitI8(v)  {
        v = Math.round(Math.max(-100, Math.min(100, v || 0)));
        this.buf.push(v < 0 ? v + 256 : v);
    }
    emitMs(sec) {
        const ms = Math.round(Math.max(0, Math.min(65535, (sec || 0) * 1000)));
        this.emit16(ms);
    }

    pc() { return this.buf.length; }

    /* Емітувати placeholder адресу (2 байти) → повертає індекс для backpatch */
    placeholder() {
        const idx = this.buf.length;
        this.buf.push(0, 0);
        return idx;
    }

    /* Заповнити placeholder поточним pc */
    patch(idx) {
        const addr = this.pc();
        this.buf[idx]     = (addr >> 8) & 0xFF;
        this.buf[idx + 1] = addr & 0xFF;
    }

    /* Заповнити placeholder конкретною адресою */
    patchAddr(idx, addr) {
        this.buf[idx]     = (addr >> 8) & 0xFF;
        this.buf[idx + 1] = addr & 0xFF;
    }

    /* ================================================================
       Головна функція: компілювати workspace
       ================================================================ */
    compile(workspace) {
        const starts = workspace.getBlocksByType('start_hat', false);
        if (!starts || starts.length === 0) {
            this.errors.push('Немає блоку "Старт"!');
            return null;
        }
        /* Debug: показати ланцюжок блоків */
        let dbgBlock = starts[0].getNextBlock();
        const dbgChain = [];
        while (dbgBlock) {
            dbgChain.push(dbgBlock.type);
            dbgBlock = dbgBlock.getNextBlock();
        }
        _log('📋 Блоки: ' + (dbgChain.length ? dbgChain.join(' → ') : '(немає!)'), 'info');

        this.compileStmt(starts[0].getNextBlock());
        this.emit(OP.END);
        return new Uint8Array(this.buf);
    }

    /* ================================================================
       Компіляція ланцюжка блоків (statement)
       ================================================================ */
    compileStmt(block) {
        if (!block) return;

        switch (block.type) {

            /* ---- Рух ---- */
            case 'robot_move': {
                const l = this.staticNum(block.getInputTargetBlock('L'), 0);
                const r = this.staticNum(block.getInputTargetBlock('R'), 0);
                this.emit(OP.DRIVE_SET);
                this.emitI8(l); this.emitI8(r);
                break;
            }
            case 'robot_move_soft': {
                const t = this.staticNum(block.getInputTargetBlock('TARGET'), 100);
                const s = this.staticNum(block.getInputTargetBlock('SEC'), 1);
                this.emit(OP.DRIVE);
                this.emitI8(t); this.emitI8(t);
                this.emitMs(s);
                break;
            }
            case 'robot_turn_timed': {
                const dir = block.getFieldValue('DIR');
                const sec = this.staticNum(block.getInputTargetBlock('SEC'), 0.5);
                const l   = dir === 'LEFT' ? -80 : 80;
                const r   = dir === 'LEFT' ?  80 : -80;
                this.emit(OP.DRIVE);
                this.emitI8(l); this.emitI8(r);
                this.emitMs(sec);
                this.emit(OP.STOP);
                break;
            }
            case 'robot_stop':
                this.emit(OP.STOP);
                break;

            case 'robot_set_speed': {
                const spd = this.staticNum(block.getInputTargetBlock('SPEED'), 100);
                this.emit(OP.SET_SPEED);
                this.emit(Math.round(Math.max(0, Math.min(100, spd))));
                break;
            }
            case 'move_4_motors': {
                this.emit(OP.DRIVE4_SET);
                this.emitI8(this.staticNum(block.getInputTargetBlock('M1'), 0));
                this.emitI8(this.staticNum(block.getInputTargetBlock('M2'), 0));
                this.emitI8(this.staticNum(block.getInputTargetBlock('M3'), 0));
                this.emitI8(this.staticNum(block.getInputTargetBlock('M4'), 0));
                break;
            }
            case 'motor_single': {
                const mid = parseInt(block.getFieldValue('MOTOR') || '1');
                const spd = this.staticNum(block.getInputTargetBlock('SPEED'), 0);
                this.emit(OP.SET_MOTOR);
                this.emit(mid);
                this.emitI8(spd);
                break;
            }

            /* ---- Очікування ---- */
            case 'wait_seconds': {
                const sec = this.staticNum(block.getInputTargetBlock('SECONDS'), 1);
                this.emit(OP.WAIT);
                this.emitMs(sec);
                break;
            }
            case 'wait_until_sensor': {
                /* Компілюємо як: while NOT(cond) { loop } */
                const sens  = parseInt(block.getFieldValue('SENS') || '0');
                const opStr = block.getFieldValue('OP') || 'LT';
                const val   = this.staticNum(block.getInputTargetBlock('VAL'), 50);

                const loopStart = this.pc();
                this.emit(OP.PUSH_SENSOR); this.emit(sens);
                this.emit(OP.PUSH_CONST);  this.emit16(val);
                this.emitCmp(opStr);          /* 1 = умова виконана */
                this.emit(OP.JUMP_IF_F);      /* якщо 0 (не виконана) — пропустити JUMP */
                const exitPh = this.placeholder();
                this.emit(OP.JUMP);            /* умова не виконана — повернутись */
                this.emit16(loopStart);
                this.patch(exitPh);            /* умова виконана — вийти сюди */
                break;
            }

            /* ---- Таймер ---- */
            case 'timer_reset':
                this.emit(OP.TIMER_RESET);
                break;

            /* ---- Умова if / if-else ---- */
            case 'controls_if': {
                const mutation  = block.mutationToDom ? block.mutationToDom() : null;
                const elseifCnt = mutation ? parseInt(mutation.getAttribute('elseif') || '0') : 0;
                const hasElse   = mutation ? !!parseInt(mutation.getAttribute('else') || '0') : false;

                const endJumps = [];

                /* if + elseif гілки */
                for (let i = 0; i <= elseifCnt; i++) {
                    this.compileExpr(block.getInputTargetBlock('IF' + i));
                    this.emit(OP.JUMP_IF_F);
                    const nextPh = this.placeholder();
                    this.compileStmt(block.getInputTargetBlock('DO' + i));
                    this.emit(OP.JUMP);
                    endJumps.push(this.placeholder());
                    this.patch(nextPh);
                }

                /* else гілка */
                if (hasElse) {
                    this.compileStmt(block.getInputTargetBlock('ELSE'));
                }

                /* Всі jump-to-end → сюди */
                for (const j of endJumps) this.patch(j);
                break;
            }

            /* ---- Цикл: repeat N разів ---- */
            case 'controls_repeat_ext': {
                const count = Math.max(1, Math.round(
                    this.staticNum(block.getInputTargetBlock('TIMES'), 1)
                ));
                this.emit(OP.REPEAT_START);
                this.emit16(count);
                const bodyStart = this.pc(); /* REPEAT_START зберігає цю адресу автоматично */
                this.compileStmt(block.getInputTargetBlock('DO'));
                this.emit(OP.REPEAT_END);
                break;
            }

            /* ---- Цикл: безкінечний ---- */
            case 'controls_forever': {
                const loopStart = this.pc();
                this.compileStmt(block.getInputTargetBlock('DO'));
                this.emit(OP.LOOP_END);
                this.emit16(loopStart);
                /* Після безкінечного циклу наступних блоків немає */
                return;
            }

            /* ---- Цикл: поки / доки ---- */
            case 'controls_whileUntil': {
                const mode      = block.getFieldValue('MODE') || 'WHILE';
                const loopStart = this.pc();

                this.compileExpr(block.getInputTargetBlock('BOOL'));
                if (mode === 'UNTIL') this.emit(OP.NOT); /* UNTIL = поки НЕ умова */

                this.emit(OP.JUMP_IF_F);
                const exitPh = this.placeholder();

                this.compileStmt(block.getInputTargetBlock('DO'));
                this.emit(OP.LOOP_END);
                this.emit16(loopStart);

                this.patch(exitPh);
                break;
            }

            /* ---- Кастомні блоки що відрізняються від Blockly стандарту ---- */
            case 'loop_forever': {
                const loopStart = this.pc();
                this.compileStmt(block.getInputTargetBlock('DO'));
                this.emit(OP.LOOP_END);
                this.emit16(loopStart);
                return; /* після forever немає наступних блоків */
            }

            case 'loop_repeat_pause': {
                const count = Math.max(1, Math.round(
                    this.staticNum(block.getInputTargetBlock('TIMES'), 1)
                ));
                const pause = this.staticNum(block.getInputTargetBlock('PAUSE'), 0);
                this.emit(OP.REPEAT_START);
                this.emit16(count);
                this.compileStmt(block.getInputTargetBlock('DO'));
                if (pause > 0) {
                    this.emit(OP.WAIT);
                    this.emitMs(pause);
                }
                this.emit(OP.REPEAT_END);
                break;
            }

            default:
                /* Невідомий блок — логувати і пропустити */
                _log('⚠️ Компілятор: невідомий блок "' + block.type + '" — пропущено', 'err');
                break;
        }

        /* Продовжити ланцюжок */
        this.compileStmt(block.getNextBlock());
    }

    /* ================================================================
       Компіляція виразу (expression) → push на стек
       ================================================================ */
    compileExpr(block) {
        if (!block) {
            this.emit(OP.PUSH_CONST); this.emit16(0);
            return;
        }

        switch (block.type) {

            case 'math_number':
            case 'math_number_limited': {
                const v = parseFloat(block.getFieldValue('NUM') || '0');
                this.emit(OP.PUSH_CONST);
                this.emit16(Math.round(v));
                break;
            }

            case 'logic_boolean': {
                const v = block.getFieldValue('BOOL') === 'TRUE' ? 1 : 0;
                this.emit(OP.PUSH_BOOL); this.emit(v);
                break;
            }

            case 'logic_compare': {
                const op = block.getFieldValue('OP') || 'EQ';
                this.compileExpr(block.getInputTargetBlock('A'));
                this.compileExpr(block.getInputTargetBlock('B'));
                this.emitCmp(op);
                break;
            }

            case 'logic_operation': {
                const op = block.getFieldValue('OP') || 'AND';
                this.compileExpr(block.getInputTargetBlock('A'));
                this.compileExpr(block.getInputTargetBlock('B'));
                this.emit(op === 'AND' ? OP.AND : OP.OR);
                break;
            }

            case 'logic_negate': {
                this.compileExpr(block.getInputTargetBlock('BOOL'));
                this.emit(OP.NOT);
                break;
            }

            case 'sensor_get': {
                const id = parseInt(block.getFieldValue('SENS') || '0');
                this.emit(OP.PUSH_SENSOR); this.emit(id);
                break;
            }

            case 'math_arithmetic': {
                const op = block.getFieldValue('OP') || 'ADD';
                this.compileExpr(block.getInputTargetBlock('A'));
                this.compileExpr(block.getInputTargetBlock('B'));
                const opmap = { ADD: OP.ADD, MINUS: OP.SUB, MULTIPLY: OP.MUL, DIVIDE: OP.DIV };
                this.emit(opmap[op] || OP.ADD);
                break;
            }

            case 'timer_get': {
                /* таймер_get повертає секунди → конвертуємо в мс для стека */
                this.emit(OP.PUSH_TIMER);
                /* Ділимо на 1000 щоб отримати секунди (VM таймер у мс) */
                this.emit(OP.PUSH_CONST); this.emit16(1000);
                this.emit(OP.DIV);
                break;
            }

            default:
                this.emit(OP.PUSH_CONST); this.emit16(0);
                break;
        }
    }

    /* ================================================================
       Допоміжники
       ================================================================ */

    /* Статично обчислити числовий блок (тільки math_number) */
    staticNum(block, def) {
        if (!block) return def;
        if (block.type === 'math_number' || block.type === 'math_number_limited')
            return parseFloat(block.getFieldValue('NUM') || String(def));
        return def;
    }

    /* Емітувати опкод порівняння */
    emitCmp(opStr) {
        const m = {
            LT: OP.CMP_LT, GT: OP.CMP_GT,
            EQ: OP.CMP_EQ, NEQ: OP.CMP_NEQ,
            LTE: OP.CMP_LTE, GTE: OP.CMP_GTE,
        };
        this.emit(m[opStr] || OP.CMP_LT);
    }
}

/* ================================================================
   SLIP encode (для відправки пакетів на STM32)
   ================================================================ */
function slipEncode(bytes) {
    const END = 0xC0, ESC = 0xDB, ESC_END = 0xDC, ESC_ESC = 0xDD;
    const out = [END];
    for (const b of bytes) {
        if      (b === END) out.push(ESC, ESC_END);
        else if (b === ESC) out.push(ESC, ESC_ESC);
        else                out.push(b);
    }
    out.push(END);
    return new Uint8Array(out);
}

/* Відправити один пакет через BLE characteristic */
async function sendPkt(bytes) {
    /* characteristic може бути в window або треба шукати через sendRawPacket */
    const chr = window.characteristic;
    if (chr) {
        try {
            await chr.writeValue(slipEncode(bytes));
        } catch (e) {
            console.error('BLE write:', e);
        }
        return;
    }
    /* Fallback: використати sendRawPacket якщо characteristic не в window */
    if (typeof window.sendRawPacket === 'function') {
        try { await window.sendRawPacket(new Int8Array(bytes)); } catch(e) {}
    }
}

const CHUNK_SIZE = 18; /* байт байткоду за один BLE/BT пакет */

/* Завантажити байткод на STM32 */
async function uploadBytecode(code) {
    await sendPkt([PCMD.BEGIN]);
    await new Promise(r => setTimeout(r, 60));

    for (let i = 0; i < code.length; i += CHUNK_SIZE) {
        const chunk = code.slice(i, i + CHUNK_SIZE);
        await sendPkt([PCMD.CHUNK, ...chunk]);
        await new Promise(r => setTimeout(r, 30));
    }

    await sendPkt([PCMD.END]);
    await new Promise(r => setTimeout(r, 60));
}

/* ================================================================
   Кнопка "Завантажити в робота"
   ================================================================ */
/* Логувати через window.log якщо доступний */
function _log(msg, type) {
    if (typeof window.log === 'function') window.log(msg, type || 'info');
    else console.log('[STM]', msg);
}

window.uploadToRobot = async function () {
    /* isConnected може бути локальна змінна (в тому ж scope що і characteristic)
       або window.isConnected якщо експортована */
    const _connected = window.isConnected || 
                       (window.characteristic != null) || 
                       window.isSimulating;
    if (!_connected) {
        const dbg = 'window.isConnected=' + window.isConnected +
                    ', characteristic=' + (window.characteristic ? 'ok' : 'null') +
                    ', isSimulating=' + window.isSimulating;
        alert('Спочатку підключіться до Bluetooth!\n(' + dbg + ')');
        return;
    }
    if (!window.workspace) {
        alert('Немає Blockly workspace!');
        return;
    }

    const btn  = document.getElementById('uploadProgBtn');
    const icon = document.getElementById('uploadProgIcon');

    btn.classList.add('uploading');
    btn.classList.remove('done');
    icon.className = 'fa-solid fa-spinner fa-spin';
    btn.disabled   = true;

    try {
        /* --- Компіляція --- */
        _log('🔄 Компілюю програму...', 'info');
        const compiler = new Compiler();
        const code     = compiler.compile(window.workspace);

        if (compiler.errors.length > 0) {
            for (const e of compiler.errors) _log('⚠️ ' + e, 'err');
        }

        if (!code || code.length === 0) {
            _log('❌ Немає блоків для компіляції!', 'err');
            alert('Немає блоків для компіляції!');
            btn.classList.remove('uploading');
            icon.className = 'fa-solid fa-upload';
            btn.disabled = false;
            return;
        }

        _log(`📦 Скомпільовано: ${code.length} байт (${Math.ceil(code.length / CHUNK_SIZE)} пакетів)`, 'info');

        /* --- Відправка --- */
        _log('📤 Відправляю на STM32...', 'info');
        let sentChunks = 0;
        const totalChunks = Math.ceil(code.length / CHUNK_SIZE);

        /* Перевизначити uploadBytecode локально щоб логувати прогрес */
        await sendPkt([PCMD.BEGIN]);
        _log('  → CMD_BEGIN надіслано', 'tx');
        await new Promise(r => setTimeout(r, 60));

        for (let i = 0; i < code.length; i += CHUNK_SIZE) {
            const chunk = Array.from(code.slice(i, i + CHUNK_SIZE));
            await sendPkt([PCMD.CHUNK, ...chunk]);
            sentChunks++;
            if (sentChunks % 5 === 0 || sentChunks === totalChunks) {
                _log(`  → Чанк ${sentChunks}/${totalChunks} (${i + chunk.length}/${code.length} байт)`, 'tx');
            }
            await new Promise(r => setTimeout(r, 30));
        }

        await sendPkt([PCMD.END]);
        _log('  → CMD_END надіслано', 'tx');
        await new Promise(r => setTimeout(r, 60));

        /* --- Авто-збереження в FRAM --- */
        await sendPkt([PCMD.SAVE]);
        _log('  → CMD_SAVE: збережено в FRAM', 'tx');
        await new Promise(r => setTimeout(r, 60));

        /* --- Успіх --- */
        btn.classList.remove('uploading');
        btn.classList.add('done');
        icon.className = 'fa-solid fa-check';
        _log(`✅ Готово! ${code.length} байт завантажено. Натисни OK на платі щоб запустити.`, 'info');

        setTimeout(() => {
            btn.classList.remove('done');
            icon.className = 'fa-solid fa-upload';
            btn.disabled   = false;
        }, 2500);

    } catch (e) {
        _log('❌ Помилка завантаження: ' + (e.message || String(e)), 'err');
        console.error('Upload error:', e);
        btn.classList.remove('uploading');
        icon.className = 'fa-solid fa-upload';
        btn.disabled   = false;
    }
};

/* Також зупинити виконання на STM32 */
window.progStopSTM  = async () => sendPkt([PCMD.STOP]);
window.progRunSTM   = async () => sendPkt([PCMD.RUN]);
window.progClearSTM = async () => sendPkt([PCMD.CLEAR]);

/* Expose компілятор для відладки */
window.STMCompiler = Compiler;

})();
