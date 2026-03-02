/* ================================================================
   qr_codec.js  —  Компактний кодер/декодер для Robo Scratch QR
   ================================================================

   ТАБЛИЦЯ КОДІВ (для людей):
   ─────────────────────────────────────────────────────────────────
   1               → start (початок програми)
   2               → stop  (зупинка)
   RL:l,r          → robot_move          L=-100..100, R=-100..100
   RD:t,s          → robot_move_soft     t=%-швидкість, s=секунди
   RT:L|R,s        → robot_turn_timed    напрямок, секунди
   SP:n            → robot_set_speed     0..100
   M4:a,b,c,d      → move_4_motors       4 мотори -100..100
   MT:m,v          → motor_single        m=1..4, v=-100..100
   W:s             → wait_seconds        секунди (дробові ок)
   WU:s,op,v       → wait_until_sensor   s=0..7, op=<>!=, v=число
   TR              → timer_reset
   C:n{...}        → повтор n разів
   F{...}          → вічний цикл
   WH:s,op,v{...}  → while(sensor op val) {...}
   WT:s,op,v{...}  → until(sensor op val) {...}
   IF:s,op,v{...}         → if без else
   IF:s,op,v{...}EL{...}  → if з else

   Порівняння op: < > = != <= >=
   Приклад: 1;RL:100,100;W:1.5;C:3{RL:50,-50;W:0.5;2};F{RL:80,80}
   ================================================================ */

(function () {

/* ================================================================
   ENCODER  (Blockly workspace → compact string)
   ================================================================ */

function encodeWorkspace(workspace) {
    const starts = workspace.getBlocksByType('start_hat', false);
    if (!starts || !starts.length) throw new Error('Немає блоку Старт!');
    const parts = ['1'];
    encodeChain(starts[0].getNextBlock(), parts);
    return parts.join(';');
}

function encodeChain(block, out) {
    while (block) {
        encodeBlock(block, out);
        block = block.getNextBlock();
    }
}

function numVal(b, def) {
    if (!b) return def;
    if (b.type === 'math_number' || b.type === 'math_number_limited')
        return parseFloat(b.getFieldValue('NUM') || def);
    return def;
}

function encodeCond(sens, op, val) {
    /* op field values → compact symbol */
    const opMap = { LT:'<', GT:'>', EQ:'=', NEQ:'!=', LTE:'<=', GTE:'>=' };
    return sens + ',' + (opMap[op] || op) + ',' + val;
}

function encodeBlock(b, out) {
    switch (b.type) {

        case 'robot_stop':
            out.push('2'); break;

        case 'robot_move': {
            const l = numVal(b.getInputTargetBlock('L'), 0);
            const r = numVal(b.getInputTargetBlock('R'), 0);
            out.push('RL:' + l + ',' + r); break;
        }
        case 'robot_move_soft': {
            const t = numVal(b.getInputTargetBlock('TARGET'), 100);
            const s = numVal(b.getInputTargetBlock('SEC'), 1);
            out.push('RD:' + t + ',' + s); break;
        }
        case 'robot_turn_timed': {
            const dir = b.getFieldValue('DIR');
            const sec = numVal(b.getInputTargetBlock('SEC'), 0.5);
            out.push('RT:' + dir[0] + ',' + sec); break;  // L або R
        }
        case 'robot_set_speed': {
            const spd = numVal(b.getInputTargetBlock('SPEED'), 100);
            out.push('SP:' + spd); break;
        }
        case 'move_4_motors': {
            const a = numVal(b.getInputTargetBlock('M1'), 0);
            const bv= numVal(b.getInputTargetBlock('M2'), 0);
            const c = numVal(b.getInputTargetBlock('M3'), 0);
            const d = numVal(b.getInputTargetBlock('M4'), 0);
            out.push('M4:' + a + ',' + bv + ',' + c + ',' + d); break;
        }
        case 'motor_single': {
            const m = b.getFieldValue('MOTOR') || '1';
            const v = numVal(b.getInputTargetBlock('SPEED'), 0);
            out.push('MT:' + m + ',' + v); break;
        }
        case 'wait_seconds': {
            const s = numVal(b.getInputTargetBlock('SECONDS'), 1);
            out.push('W:' + s); break;
        }
        case 'wait_until_sensor': {
            const s  = b.getFieldValue('SENS') || '0';
            const op = b.getFieldValue('OP') || 'LT';
            const v  = numVal(b.getInputTargetBlock('VAL'), 50);
            out.push('WU:' + encodeCond(s, op, v)); break;
        }
        case 'timer_reset':
            out.push('TR'); break;

        /* ---- Цикли ---- */
        case 'controls_repeat_ext': {
            const n = Math.round(numVal(b.getInputTargetBlock('TIMES'), 1));
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            out.push('C:' + n + '{' + body.join(';') + '}');
            break;
        }
        case 'loop_repeat_pause': {
            const n = Math.round(numVal(b.getInputTargetBlock('TIMES'), 1));
            const pause = numVal(b.getInputTargetBlock('PAUSE'), 0);
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            /* CP:n,pause{body} — повтор з паузою */
            out.push('CP:' + n + ',' + pause + '{' + body.join(';') + '}');
            break;
        }
        case 'controls_forever':
        case 'loop_forever': {
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            out.push('F{' + body.join(';') + '}');
            return; // після forever немає наступних блоків
        }
        case 'controls_whileUntil': {
            const mode = b.getFieldValue('MODE') || 'WHILE';
            /* Очікуємо sensor_get всередині умови */
            const condBlock = b.getInputTargetBlock('BOOL');
            const cond = encodeCondBlock(condBlock);
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            const prefix = mode === 'UNTIL' ? 'WT:' : 'WH:';
            out.push(prefix + cond + '{' + body.join(';') + '}');
            break;
        }
        case 'controls_if': {
            const condBlock = b.getInputTargetBlock('IF0');
            const cond = encodeCondBlock(condBlock);
            const thenBody = [];
            encodeChain(b.getInputTargetBlock('DO0'), thenBody);
            const elseBody = [];
            encodeChain(b.getInputTargetBlock('ELSE'), elseBody);
            let s = 'IF:' + cond + '{' + thenBody.join(';') + '}';
            if (elseBody.length) s += 'EL{' + elseBody.join(';') + '}';
            out.push(s);
            break;
        }
        /* ---- Цикл кожні N секунд ---- */
        case 'loop_every_seconds': {
            const sec = numVal(b.getInputTargetBlock('SEC'), 1);
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            out.push('EV:' + sec + '{' + body.join(';') + '}');
            break;
        }
        /* ---- cooldown_do ---- */
        case 'cooldown_do': {
            const sec = numVal(b.getInputTargetBlock('SEC'), 1);
            const body = [];
            encodeChain(b.getInputTargetBlock('DO'), body);
            out.push('CD:' + sec + '{' + body.join(';') + '}');
            break;
        }
        /* ---- replay_loop ---- */
        case 'replay_loop': {
            const n = Math.round(numVal(b.getInputTargetBlock('TIMES'), 1));
            out.push('RPL:' + n); break;
        }
        /* ---- count_laps ---- */
        case 'count_laps': {
            const n = Math.round(numVal(b.getInputTargetBlock('LAPS'), 1));
            out.push('CL:' + n); break;
        }
        /* ---- Прості без параметрів ---- */
        case 'go_home':           out.push('GH');   break;
        case 'wait_start':        out.push('WS');   break;
        case 'stop_at_start':     out.push('SS');   break;
        case 'record_start':      out.push('RC');   break;
        case 'replay_track':      out.push('RP');   break;
        case 'state_get':         out.push('SG');   break;
        case 'state_time_s':      out.push('STM');  break;
        case 'state_prev':        out.push('SPR');  break;
        case 'track_action':      out.push('TA');   break;
        case 'start_line_action': out.push('SLA');  break;
        case 'math_speed_cms':    out.push('MSPD'); break;
        /* ---- logic_edge_detect ---- */
        case 'logic_edge_detect': {
            const val = encodeExprBlock(b.getInputTargetBlock('VAL'));
            out.push('ED:' + val); break;
        }
        /* ---- logic_schmitt ---- */
        case 'logic_schmitt': {
            const high = numVal(b.getInputTargetBlock('HIGH'), 60);
            const low  = numVal(b.getInputTargetBlock('LOW'), 30);
            const val  = encodeExprBlock(b.getInputTargetBlock('VAL'));
            out.push('SCH:' + high + ',' + low + ',' + val); break;
        }
        /* ---- math_smooth ---- */
        case 'math_smooth': {
            const val  = encodeExprBlock(b.getInputTargetBlock('VAL'));
            const size = b.getFieldValue('SIZE') || '5';
            out.push('MSM:' + size + ',' + val); break;
        }
        /* ---- math_pid ---- */
        case 'math_pid': {
            const err = numVal(b.getInputTargetBlock('ERROR'), 0);
            const kp  = numVal(b.getInputTargetBlock('KP'), 1);
            const ki  = numVal(b.getInputTargetBlock('KI'), 0);
            const kd  = numVal(b.getInputTargetBlock('KD'), 0);
            out.push('PID:' + err + ',' + kp + ',' + ki + ',' + kd); break;
        }
        /* ---- Math utilities (value blocks) ---- */
        case 'math_radius_from_diameter': {
            out.push('MRD:' + numVal(b.getInputTargetBlock('D'), 0)); break;
        }
        case 'math_diameter_from_radius': {
            out.push('MDR:' + numVal(b.getInputTargetBlock('R'), 0)); break;
        }
        case 'math_path_vt': {
            out.push('MPV:' + numVal(b.getInputTargetBlock('V'), 0) + ',' + numVal(b.getInputTargetBlock('T'), 0)); break;
        }
        case 'math_pythagoras': {
            out.push('MPY:' + numVal(b.getInputTargetBlock('A'), 0) + ',' + numVal(b.getInputTargetBlock('B'), 0)); break;
        }
        case 'math_rect_perimeter': {
            out.push('MRP:' + numVal(b.getInputTargetBlock('W'), 0) + ',' + numVal(b.getInputTargetBlock('H'), 0)); break;
        }
        /* ---- calibrate_speed_line ---- */
        case 'calibrate_speed_line': {
            const l   = numVal(b.getInputTargetBlock('L'), 50);
            const port= b.getFieldValue('PORT') || '1';
            const cmp = b.getFieldValue('CMP') || 'LT';
            const thr = numVal(b.getInputTargetBlock('THR'), 50);
            const spd = numVal(b.getInputTargetBlock('SPD'), 80);
            out.push('CAL:' + l + ',' + port + ',' + cmp + ',' + thr + ',' + spd); break;
        }
        /* ---- autopilot_distance ---- */
        case 'autopilot_distance': {
            const port= b.getFieldValue('PORT') || '1';
            const dir = b.getFieldValue('DIR') || 'RIGHT';
            const thr = numVal(b.getInputTargetBlock('THR'), 30);
            const spd = numVal(b.getInputTargetBlock('SPD'), 80);
            out.push('AP:' + port + ',' + dir[0] + ',' + thr + ',' + spd); break;
        }
        /* ---- State машина ---- */
        case 'state_set': {
            const st = b.getInputTargetBlock('STATE');
            const nm = st && st.getFieldValue ? (st.getFieldValue('TEXT') || 'idle') : 'idle';
            out.push('SET:' + nm); break;
        }
        case 'state_set_reason': {
            const st = b.getInputTargetBlock('STATE');
            const re = b.getInputTargetBlock('REASON');
            const sn = st && st.getFieldValue ? (st.getFieldValue('TEXT') || 'idle') : 'idle';
            const rn = re && re.getFieldValue ? (re.getFieldValue('TEXT') || '') : '';
            out.push('SETR:' + sn + ',' + rn); break;
        }
        case 'state_enter_count': {
            const st = b.getInputTargetBlock('STATE');
            const nm = st && st.getFieldValue ? (st.getFieldValue('TEXT') || 'idle') : 'idle';
            out.push('SECN:' + nm); break;
        }
        case 'state_if': {
            const st = b.getInputTargetBlock('STATE');
            const nm = st && st.getFieldValue ? (st.getFieldValue('TEXT') || 'idle') : 'idle';
            const doBody = []; encodeChain(b.getInputTargetBlock('DO'), doBody);
            const elBody = []; encodeChain(b.getInputTargetBlock('ELSE'), elBody);
            let s = 'SIF:' + nm + '{' + doBody.join(';') + '}';
            if (elBody.length) s += 'EL{' + elBody.join(';') + '}';
            out.push(s); break;
        }
        /* ---- latch ---- */
        case 'latch_set': {
            const n = b.getInputTargetBlock('NAME');
            out.push('LS:' + (n && n.getFieldValue ? (n.getFieldValue('TEXT') || 'f') : 'f')); break;
        }
        case 'latch_reset': {
            const n = b.getInputTargetBlock('NAME');
            out.push('LR:' + (n && n.getFieldValue ? (n.getFieldValue('TEXT') || 'f') : 'f')); break;
        }
        case 'latch_get': {
            const n = b.getInputTargetBlock('NAME');
            out.push('LG:' + (n && n.getFieldValue ? (n.getFieldValue('TEXT') || 'f') : 'f')); break;
        }
        /* ---- Умовні блоки з таймером ---- */
        case 'wait_until_true_for': {
            const cond = encodeCondBlock(b.getInputTargetBlock('COND'));
            const sec  = numVal(b.getInputTargetBlock('SEC'), 0.2);
            out.push('WTF:' + cond + ',' + sec); break;
        }
        case 'if_true_for': {
            const cond = encodeCondBlock(b.getInputTargetBlock('COND'));
            const sec  = numVal(b.getInputTargetBlock('SEC'), 0.2);
            const doBody = []; encodeChain(b.getInputTargetBlock('DO'), doBody);
            const elBody = []; encodeChain(b.getInputTargetBlock('ELSE'), elBody);
            let s = 'ITF:' + cond + ',' + sec + '{' + doBody.join(';') + '}';
            if (elBody.length) s += 'EL{' + elBody.join(';') + '}';
            out.push(s); break;
        }
        case 'timeout_do_until': {
            const sec  = numVal(b.getInputTargetBlock('SEC'), 3);
            const cond = encodeCondBlock(b.getInputTargetBlock('COND'));
            const doBody = []; encodeChain(b.getInputTargetBlock('DO'), doBody);
            out.push('TDU:' + sec + ',' + cond + '{' + doBody.join(';') + '}'); break;
        }
        case 'if_happened_n_times': {
            const times = Math.round(numVal(b.getInputTargetBlock('TIMES'), 3));
            const sec   = numVal(b.getInputTargetBlock('SEC'), 1);
            const cond  = encodeCondBlock(b.getInputTargetBlock('COND'));
            const doBody = []; encodeChain(b.getInputTargetBlock('DO'), doBody);
            const elBody = []; encodeChain(b.getInputTargetBlock('ELSE'), elBody);
            let s = 'IHN:' + times + ',' + sec + ',' + cond + '{' + doBody.join(';') + '}';
            if (elBody.length) s += 'EL{' + elBody.join(';') + '}';
            out.push(s); break;
        }
        default:
            /* Невідомий блок — пропускаємо */
            break;
    }
}

function encodeCondBlock(b) {
    if (!b) return '0,=,0';
    if (b.type === 'logic_compare') {
        const opMap = { LT:'<', GT:'>', EQ:'=', NEQ:'!=', LTE:'<=', GTE:'>=' };
        const op = opMap[b.getFieldValue('OP')] || '=';
        const a = encodeExprBlock(b.getInputTargetBlock('A'));
        const bv= encodeExprBlock(b.getInputTargetBlock('B'));
        return a + ',' + op + ',' + bv;
    }
    if (b.type === 'logic_operation') {
        const op = b.getFieldValue('OP') === 'AND' ? '&' : '|';
        /* Огортаємо складні умови в [] */
        return '[' + encodeCondBlock(b.getInputTargetBlock('A')) + op +
                     encodeCondBlock(b.getInputTargetBlock('B')) + ']';
    }
    if (b.type === 'logic_negate') {
        return '![' + encodeCondBlock(b.getInputTargetBlock('BOOL')) + ']';
    }
    if (b.type === 'logic_boolean') {
        return b.getFieldValue('BOOL') === 'TRUE' ? '1,=,1' : '1,=,0';
    }
    return '0,=,0';
}

function encodeExprBlock(b) {
    if (!b) return '0';
    if (b.type === 'math_number' || b.type === 'math_number_limited')
        return String(parseFloat(b.getFieldValue('NUM') || '0'));
    if (b.type === 'sensor_get')
        return 'S' + (b.getFieldValue('SENS') || '0');
    if (b.type === 'timer_get')
        return 'TM';
    if (b.type === 'logic_boolean')
        return b.getFieldValue('BOOL') === 'TRUE' ? '1' : '0';
    if (b.type === 'math_arithmetic') {
        const opMap = { ADD:'+', MINUS:'-', MULTIPLY:'*', DIVIDE:'/' };
        const op = opMap[b.getFieldValue('OP')] || '+';
        const a = encodeExprBlock(b.getInputTargetBlock('A'));
        const bv= encodeExprBlock(b.getInputTargetBlock('B'));
        return '(' + a + op + bv + ')';
    }
    return '0';
}

/* ================================================================
   DECODER  (compact string → Blockly XML)
   ================================================================ */

function decodeToXML(str) {
    str = str.trim();
    const parser = new Parser(str);
    const stmts = parser.parseProgram();
    return '<xml xmlns="https://developers.google.com/blockly/xml">' +
           blocksToXML(stmts) +
           '</xml>';
}

/* ---- Парсер ---- */
class Parser {
    constructor(src) { this.src = src; this.pos = 0; }

    peek()  { return this.src[this.pos] || ''; }
    next()  { return this.src[this.pos++] || ''; }
    eof()   { return this.pos >= this.src.length; }

    /* Читати до одного з символів-стоп (не включаючи) */
    readUntil(stops) {
        let s = '';
        while (!this.eof() && !stops.includes(this.peek())) s += this.next();
        return s;
    }

    /* Пропустити конкретний символ */
    expect(ch) {
        if (this.peek() === ch) this.next();
    }

    /* Читати блок у {...}, повертає вміст без дужок */
    readBlock() {
        this.expect('{');
        let depth = 1, s = '';
        while (!this.eof() && depth > 0) {
            const c = this.next();
            if (c === '{') depth++;
            if (c === '}') { depth--; if (depth === 0) break; }
            s += c;
        }
        return s;
    }

    parseProgram() {
        /* Перший елемент має бути "1" (start) */
        const first = this.readUntil([';', '{', '}']);
        if (first.trim() !== '1') {
            /* Якщо не "1" — все одно парсимо з початку */
            this.pos = 0;
        }
        if (this.peek() === ';') this.next();
        return this.parseStmtList();
    }

    parseStmtList() {
        const stmts = [];
        while (!this.eof() && this.peek() !== '}') {
            const s = this.parseOneStmt();
            if (s) stmts.push(s);
            if (this.peek() === ';') this.next();
        }
        return stmts;
    }

    parseOneStmt() {
        const tok = this.readUntil([';', '{', '}', ':']);
        const t = tok.trim();
        if (!t) return null;

        /* ---- Прості команди ---- */
        if (t === '1') return { type: 'start_hat' };
        if (t === '2') return { type: 'robot_stop' };
        if (t === 'TR') return { type: 'timer_reset' };

        /* ---- Команди з параметрами через ":" ---- */
        if (this.peek() === ':') {
            this.next(); // consume ':'
            const args = this.readUntil([';', '{', '}']);
            const params = args.split(',');

            if (t === 'RL') return { type:'robot_move', L:n(params[0]), R:n(params[1]) };
            if (t === 'RD') return { type:'robot_move_soft', TARGET:n(params[0]), SEC:n(params[1]) };
            if (t === 'RT') return { type:'robot_turn_timed', DIR: params[0]==='L'?'LEFT':'RIGHT', SEC:n(params[1]) };
            if (t === 'SP') return { type:'robot_set_speed', SPEED:n(params[0]) };
            if (t === 'M4') return { type:'move_4_motors', M1:n(params[0]), M2:n(params[1]), M3:n(params[2]), M4:n(params[3]) };
            if (t === 'MT') return { type:'motor_single', MOTOR:n(params[0]), SPEED:n(params[1]) };
            if (t === 'W')  return { type:'wait_seconds', SECONDS:n(params[0]) };
            if (t === 'WU') {
                /* WU:sens,op,val */
                return { type:'wait_until_sensor', SENS:params[0], OP:symToOp(params[1]), VAL:n(params[2]) };
            }

            /* ---- Нові прості з параметром ---- */
            if (t === 'RPL') return { type:'replay_loop', TIMES:n(params[0]) };
            if (t === 'CL')  return { type:'count_laps', LAPS:n(params[0]) };
            if (t === 'ED')  return { type:'logic_edge_detect', VAL:args };
            if (t === 'SCH') return { type:'logic_schmitt', HIGH:n(params[0]), LOW:n(params[1]), VAL:params[2] };
            if (t === 'MSM') return { type:'math_smooth', SIZE:params[0], VAL:params[1] };
            if (t === 'PID') return { type:'math_pid', ERROR:n(params[0]), KP:n(params[1]), KI:n(params[2]), KD:n(params[3]) };
            if (t === 'MRD') return { type:'math_radius_from_diameter', D:n(params[0]) };
            if (t === 'MDR') return { type:'math_diameter_from_radius', R:n(params[0]) };
            if (t === 'MPV') return { type:'math_path_vt', V:n(params[0]), T:n(params[1]) };
            if (t === 'MPY') return { type:'math_pythagoras', A:n(params[0]), B:n(params[1]) };
            if (t === 'MRP') return { type:'math_rect_perimeter', W:n(params[0]), H:n(params[1]) };
            if (t === 'CAL') return { type:'calibrate_speed_line', L:n(params[0]), PORT:params[1], CMP:params[2], THR:n(params[3]), SPD:n(params[4]) };
            if (t === 'AP')  return { type:'autopilot_distance', PORT:params[0], DIR:params[1]==='R'?'RIGHT':'LEFT', THR:n(params[2]), SPD:n(params[3]) };
            if (t === 'SET') return { type:'state_set', STATE:args };
            if (t === 'SETR')return { type:'state_set_reason', STATE:params[0], REASON:params[1] };
            if (t === 'SECN')return { type:'state_enter_count', STATE:args };
            if (t === 'LS')  return { type:'latch_set', NAME:args };
            if (t === 'LR')  return { type:'latch_reset', NAME:args };
            if (t === 'LG')  return { type:'latch_get', NAME:args };
            if (t === 'WTF') {
                /* WTF:cond,sec  — але cond може містити коми! треба парсити по-іншому */
                /* Останній елемент після останньої коми — це sec */
                const lastComma = args.lastIndexOf(',');
                const cond = parseSimpleCond(args.slice(0, lastComma));
                const sec  = n(args.slice(lastComma + 1));
                return { type:'wait_until_true_for', COND:cond, SEC:sec };
            }

            /* ---- Блокові команди з тілом ---- */
            if (t === 'EV') {
                const sec = n(args);
                const bodyStr = this.readBlock();
                return { type:'loop_every_seconds', SEC:sec, DO:new Parser(bodyStr).parseStmtList() };
            }
            if (t === 'CD') {
                const sec = n(args);
                const bodyStr = this.readBlock();
                return { type:'cooldown_do', SEC:sec, DO:new Parser(bodyStr).parseStmtList() };
            }
            if (t === 'SIF') {
                const name = args;
                const doStr = this.readBlock();
                const doBody = new Parser(doStr).parseStmtList();
                let elBody = [];
                const saved = this.pos;
                const nxt = this.readUntil([';', '{', '}']);
                if (nxt.trim() === 'EL') { elBody = new Parser(this.readBlock()).parseStmtList(); }
                else { this.pos = saved; }
                return { type:'state_if', STATE:name, DO:doBody, ELSE:elBody };
            }
            if (t === 'ITF') {
                const lastComma = args.lastIndexOf(',');
                const cond = parseSimpleCond(args.slice(0, lastComma));
                const sec  = n(args.slice(lastComma + 1));
                const doStr = this.readBlock();
                const doBody = new Parser(doStr).parseStmtList();
                let elBody = [];
                const saved = this.pos;
                const nxt = this.readUntil([';', '{', '}']);
                if (nxt.trim() === 'EL') { elBody = new Parser(this.readBlock()).parseStmtList(); }
                else { this.pos = saved; }
                return { type:'if_true_for', COND:cond, SEC:sec, DO:doBody, ELSE:elBody };
            }
            if (t === 'TDU') {
                /* TDU:sec,cond{body} — sec перша, потім cond */
                const firstComma = args.indexOf(',');
                const sec  = n(args.slice(0, firstComma));
                const cond = parseSimpleCond(args.slice(firstComma + 1));
                const bodyStr = this.readBlock();
                return { type:'timeout_do_until', SEC:sec, COND:cond, DO:new Parser(bodyStr).parseStmtList() };
            }
            if (t === 'IHN') {
                /* IHN:times,sec,cond{body} */
                const p = args.split(',');
                const times = n(p[0]);
                const sec   = n(p[1]);
                const cond  = parseSimpleCond(p.slice(2).join(','));
                const doStr = this.readBlock();
                const doBody = new Parser(doStr).parseStmtList();
                let elBody = [];
                const saved = this.pos;
                const nxt = this.readUntil([';', '{', '}']);
                if (nxt.trim() === 'EL') { elBody = new Parser(this.readBlock()).parseStmtList(); }
                else { this.pos = saved; }
                return { type:'if_happened_n_times', TIMES:times, SEC:sec, COND:cond, DO:doBody, ELSE:elBody };
            }
            /* ---- Оригінальні блокові команди ---- */
            if (t === 'C') {
                const count = n(args);
                const bodyStr = this.readBlock();
                const body = new Parser(bodyStr).parseStmtList();
                return { type:'controls_repeat_ext', TIMES:count, DO:body };
            }
            if (t === 'CP') {
                /* CP:n,pause{body} */
                const parts2 = args.split(',');
                const count = n(parts2[0]);
                const pause = n(parts2[1]);
                const bodyStr = this.readBlock();
                const body = new Parser(bodyStr).parseStmtList();
                return { type:'loop_repeat_pause', TIMES:count, PAUSE:pause, DO:body };
            }
            if (t === 'IF' || t === 'WH' || t === 'WT') {
                /* IF:s,op,v{then}[EL{else}] */
                /* WH:s,op,v{body}   WT:s,op,v{body} */
                const condStr = args; // вже прочитано до {
                const cond = parseSimpleCond(condStr);
                const thenStr = this.readBlock();
                const thenBody = new Parser(thenStr).parseStmtList();
                if (t === 'IF') {
                    let elseBody = [];
                    /* Перевірити чи є EL{ */
                    const saved = this.pos;
                    const nextTok = this.readUntil([';', '{', '}']);
                    if (nextTok.trim() === 'EL') {
                        const elseStr = this.readBlock();
                        elseBody = new Parser(elseStr).parseStmtList();
                    } else {
                        this.pos = saved; // відмотати назад
                    }
                    return { type:'controls_if', COND:cond, DO:thenBody, ELSE:elseBody };
                }
                const mode = t === 'WT' ? 'UNTIL' : 'WHILE';
                return { type:'controls_whileUntil', MODE:mode, COND:cond, DO:thenBody };
            }
        }

        if (t === 'GH')   return { type:'go_home' };
        if (t === 'WS')   return { type:'wait_start' };
        if (t === 'SS')   return { type:'stop_at_start' };
        if (t === 'RC')   return { type:'record_start' };
        if (t === 'RP')   return { type:'replay_track' };
        if (t === 'SG')   return { type:'state_get' };
        if (t === 'STM')  return { type:'state_time_s' };
        if (t === 'SPR')  return { type:'state_prev' };
        if (t === 'TA')   return { type:'track_action' };
        if (t === 'SLA')  return { type:'start_line_action' };
        if (t === 'MSPD') return { type:'math_speed_cms' };

        /* ---- Вічний цикл F{...} ---- */
        if (t === 'F') {
            const bodyStr = this.readBlock();
            const body = new Parser(bodyStr).parseStmtList();
            return { type:'controls_forever', DO:body };
        }

        return null;
    }
}

function n(s) { return parseFloat(String(s||'0').trim()) || 0; }

function symToOp(sym) {
    const m = { '<':'LT', '>':'GT', '=':'EQ', '!=':'NEQ', '<=':'LTE', '>=':'GTE' };
    return m[String(sym).trim()] || 'EQ';
}

function parseSimpleCond(str) {
    str = str.trim();
    /* Формат NOT: "![...]" */
    if (str.startsWith('![')) {
        const inner = str.slice(2, str.lastIndexOf(']'));
        return { type:'negate', inner: parseSimpleCond(inner) };
    }
    /* Формат AND/OR: "[A&B]" або "[A|B]" */
    if (str.startsWith('[')) {
        const inner = str.slice(1, str.lastIndexOf(']'));
        /* Знайти & або | поза вкладеними [] */
        let depth = 0, splitIdx = -1, op = '';
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === '[') depth++;
            else if (inner[i] === ']') depth--;
            else if (depth === 0 && (inner[i] === '&' || inner[i] === '|')) {
                splitIdx = i; op = inner[i]; break;
            }
        }
        if (splitIdx >= 0) {
            return { type:'compound', op: op === '&' ? 'AND' : 'OR',
                     a: parseSimpleCond(inner.slice(0, splitIdx)),
                     b: parseSimpleCond(inner.slice(splitIdx + 1)) };
        }
    }
    /* Формат: "expr,op,expr" — може містити (a+b) */
    const parts = str.split(',');
    if (parts.length < 3) return { type:'simple', SENS:'0', OP:'EQ', VAL:0 };
    return { type:'simple', SENS:parts[0].trim(), OP:symToOp(parts[1]), VAL:n(parts[2]) };
}

/* ================================================================
   ГЕНЕРАЦІЯ XML З AST
   ================================================================ */

function blocksToXML(stmts) {
    if (!stmts || !stmts.length) return '';
    /* Знайти чи є start_hat */
    let startIdx = stmts.findIndex(s => s && s.type === 'start_hat');
    if (startIdx < 0) {
        /* Обернути всі блоки в start_hat автоматично */
        return blockXML({ type:'start_hat' }, stmts);
    }
    const rest = stmts.filter((_, i) => i !== startIdx);
    return blockXML({ type:'start_hat' }, rest);
}

function blockXML(stmt, nextStmts) {
    if (!stmt) return '';
    const next = nextStmts && nextStmts.length ? nextStmts : [];

    /* Рекурсивно будуємо XML */
    const type = (stmt.type === 'controls_forever') ? 'loop_forever' : stmt.type;
    const inner = stmtInnerXML(stmt);
    const nextXML = chainXML(next);
    const nextTag = nextXML ? '<next>' + nextXML + '</next>' : '';

    return '<block type="' + type + '">' + inner + nextTag + '</block>';
}

function chainXML(stmts) {
    if (!stmts || !stmts.length) return '';
    const [head, ...tail] = stmts;
    if (!head) return chainXML(tail);
    return blockXML(head, tail);
}

function numBlock(val) {
    return '<block type="math_number"><field name="NUM">' + val + '</field></block>';
}

function valueTag(name, val) {
    return '<value name="' + name + '">' + numBlock(val) + '</value>';
}

function exprXML(exprStr) {
    const s = String(exprStr).trim();
    if (s.startsWith('S')) {
        const id = s.slice(1);
        return '<block type="sensor_get"><field name="SENS">' + id + '</field></block>';
    }
    if (s === 'TM') {
        return '<block type="timer_get"></block>';
    }
    /* Арифметичний вираз: (A+B), (A-B), (A*B), (A/B) */
    if (s.startsWith('(') && s.endsWith(')')) {
        const inner = s.slice(1, -1);
        const ops = ['+', '-', '*', '/'];
        const blockOp = { '+':'ADD', '-':'MINUS', '*':'MULTIPLY', '/':'DIVIDE' };
        /* Знайти оператор поза вкладеними дужками */
        let depth = 0, splitIdx = -1, op = '';
        for (let i = 0; i < inner.length; i++) {
            if (inner[i] === '(') depth++;
            else if (inner[i] === ')') depth--;
            else if (depth === 0 && ops.includes(inner[i])) {
                splitIdx = i; op = inner[i]; break;
            }
        }
        if (splitIdx >= 0) {
            const aXML = exprXML(inner.slice(0, splitIdx));
            const bXML = exprXML(inner.slice(splitIdx + 1));
            return '<block type="math_arithmetic">' +
                   '<field name="OP">' + (blockOp[op] || 'ADD') + '</field>' +
                   '<value name="A">' + aXML + '</value>' +
                   '<value name="B">' + bXML + '</value></block>';
        }
    }
    return numBlock(parseFloat(s) || 0);
}

function condToXML(cond) {
    if (!cond) return numBlock(1);
    if (cond.type === 'simple') {
        const opMap = { LT:'LT', GT:'GT', EQ:'EQ', NEQ:'NEQ', LTE:'LTE', GTE:'GTE' };
        const op = opMap[cond.OP] || 'EQ';
        const aXML = exprXML(cond.SENS);
        const bXML = exprXML(String(cond.VAL));
        return '<block type="logic_compare"><field name="OP">' + op + '</field>' +
               '<value name="A">' + aXML + '</value>' +
               '<value name="B">' + bXML + '</value></block>';
    }
    if (cond.type === 'negate') {
        return '<block type="logic_negate">' +
               '<value name="BOOL">' + condToXML(cond.inner) + '</value>' +
               '</block>';
    }
    if (cond.type === 'compound') {
        return '<block type="logic_operation"><field name="OP">' + cond.op + '</field>' +
               '<value name="A">' + condToXML(cond.a) + '</value>' +
               '<value name="B">' + condToXML(cond.b) + '</value></block>';
    }
    return numBlock(1);
}

function stmtInnerXML(stmt) {
    switch (stmt.type) {
        case 'start_hat':   return '';
        case 'robot_stop':  return '';
        case 'timer_reset': return '';

        case 'robot_move':
            return valueTag('L', stmt.L) + valueTag('R', stmt.R);

        case 'robot_move_soft':
            return valueTag('TARGET', stmt.TARGET) + valueTag('SEC', stmt.SEC);

        case 'robot_turn_timed':
            return '<field name="DIR">' + stmt.DIR + '</field>' +
                   valueTag('SEC', stmt.SEC);

        case 'robot_set_speed':
            return valueTag('SPEED', stmt.SPEED);

        case 'move_4_motors':
            return valueTag('M1', stmt.M1) + valueTag('M2', stmt.M2) +
                   valueTag('M3', stmt.M3) + valueTag('M4', stmt.M4);

        case 'motor_single':
            return '<field name="MOTOR">' + stmt.MOTOR + '</field>' +
                   valueTag('SPEED', stmt.SPEED);

        case 'wait_seconds':
            return valueTag('SECONDS', stmt.SECONDS);

        case 'wait_until_sensor':
            return '<field name="SENS">' + stmt.SENS + '</field>' +
                   '<field name="OP">' + stmt.OP + '</field>' +
                   valueTag('VAL', stmt.VAL);

        case 'controls_repeat_ext':
            return valueTag('TIMES', stmt.TIMES) +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';
        case 'loop_repeat_pause':
            return valueTag('TIMES', stmt.TIMES) +
                   valueTag('PAUSE', stmt.PAUSE || 0) +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';

        case 'controls_forever':
        case 'loop_forever':
            /* Завжди генеруємо loop_forever — бо controls_forever не визначений */
            return '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';


        case 'controls_whileUntil':
            return '<field name="MODE">' + stmt.MODE + '</field>' +
                   '<value name="BOOL">' + condToXML(stmt.COND) + '</value>' +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';

        case 'controls_if': {
            const elseTag = stmt.ELSE && stmt.ELSE.length
                ? '<statement name="ELSE">' + chainXML(stmt.ELSE) + '</statement>'
                : '';
            return '<value name="IF0">' + condToXML(stmt.COND) + '</value>' +
                   '<statement name="DO0">' + chainXML(stmt.DO) + '</statement>' +
                   elseTag;
        }
        /* ---- Прості без параметрів ---- */
        case 'go_home':
        case 'wait_start':
        case 'stop_at_start':
        case 'record_start':
        case 'replay_track':
        case 'state_get':
        case 'state_time_s':
        case 'state_prev':
        case 'track_action':
        case 'start_line_action':
        case 'math_speed_cms':
            return '';

        /* ---- З числом ---- */
        case 'replay_loop':
            return valueTag('TIMES', stmt.TIMES);
        case 'count_laps':
            return valueTag('LAPS', stmt.LAPS);

        /* ---- loop_every_seconds ---- */
        case 'loop_every_seconds':
            return valueTag('SEC', stmt.SEC) +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';

        /* ---- cooldown_do ---- */
        case 'cooldown_do':
            return valueTag('SEC', stmt.SEC) +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';

        /* ---- logic_edge_detect ---- */
        case 'logic_edge_detect':
            return '<value name="VAL">' + exprXML(stmt.VAL) + '</value>';

        /* ---- logic_schmitt ---- */
        case 'logic_schmitt':
            return valueTag('HIGH', stmt.HIGH) + valueTag('LOW', stmt.LOW) +
                   '<value name="VAL">' + exprXML(stmt.VAL) + '</value>';

        /* ---- math_smooth ---- */
        case 'math_smooth':
            return '<field name="SIZE">' + stmt.SIZE + '</field>' +
                   '<value name="VAL">' + exprXML(stmt.VAL) + '</value>';

        /* ---- math_pid ---- */
        case 'math_pid':
            return valueTag('ERROR', stmt.ERROR) + valueTag('KP', stmt.KP) +
                   valueTag('KI', stmt.KI) + valueTag('KD', stmt.KD);

        /* ---- Math utilities ---- */
        case 'math_radius_from_diameter': return valueTag('D', stmt.D);
        case 'math_diameter_from_radius': return valueTag('R', stmt.R);
        case 'math_path_vt':  return valueTag('V', stmt.V) + valueTag('T', stmt.T);
        case 'math_pythagoras': return valueTag('A', stmt.A) + valueTag('B', stmt.B);
        case 'math_rect_perimeter': return valueTag('W', stmt.W) + valueTag('H', stmt.H);

        /* ---- calibrate_speed_line ---- */
        case 'calibrate_speed_line':
            return valueTag('L', stmt.L) +
                   '<field name="PORT">' + stmt.PORT + '</field>' +
                   '<field name="CMP">' + stmt.CMP + '</field>' +
                   valueTag('THR', stmt.THR) + valueTag('SPD', stmt.SPD);

        /* ---- autopilot_distance ---- */
        case 'autopilot_distance':
            return '<field name="PORT">' + stmt.PORT + '</field>' +
                   '<field name="DIR">' + stmt.DIR + '</field>' +
                   valueTag('THR', stmt.THR) + valueTag('SPD', stmt.SPD);

        /* ---- State машина ---- */
        case 'state_set':
            return '<value name="STATE"><block type="text"><field name="TEXT">' + stmt.STATE + '</field></block></value>';
        case 'state_set_reason':
            return '<value name="STATE"><block type="text"><field name="TEXT">' + stmt.STATE + '</field></block></value>' +
                   '<value name="REASON"><block type="text"><field name="TEXT">' + stmt.REASON + '</field></block></value>';
        case 'state_enter_count':
            return '<value name="STATE"><block type="text"><field name="TEXT">' + stmt.STATE + '</field></block></value>';
        case 'state_if': {
            const elTag = stmt.ELSE && stmt.ELSE.length
                ? '<statement name="ELSE">' + chainXML(stmt.ELSE) + '</statement>' : '';
            return '<value name="STATE"><block type="text"><field name="TEXT">' + stmt.STATE + '</field></block></value>' +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>' + elTag;
        }

        /* ---- latch ---- */
        case 'latch_set':
            return '<value name="NAME"><block type="text"><field name="TEXT">' + stmt.NAME + '</field></block></value>';
        case 'latch_reset':
            return '<value name="NAME"><block type="text"><field name="TEXT">' + stmt.NAME + '</field></block></value>';
        case 'latch_get':
            return '<value name="NAME"><block type="text"><field name="TEXT">' + stmt.NAME + '</field></block></value>';

        /* ---- Умовні з таймером ---- */
        case 'wait_until_true_for':
            return '<value name="COND">' + condToXML(stmt.COND) + '</value>' +
                   valueTag('SEC', stmt.SEC);
        case 'if_true_for': {
            const elTag = stmt.ELSE && stmt.ELSE.length
                ? '<statement name="ELSE">' + chainXML(stmt.ELSE) + '</statement>' : '';
            return '<value name="COND">' + condToXML(stmt.COND) + '</value>' +
                   valueTag('SEC', stmt.SEC) +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>' + elTag;
        }
        case 'timeout_do_until':
            return valueTag('SEC', stmt.SEC) +
                   '<value name="COND">' + condToXML(stmt.COND) + '</value>' +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>';
        case 'if_happened_n_times': {
            const elTag = stmt.ELSE && stmt.ELSE.length
                ? '<statement name="ELSE">' + chainXML(stmt.ELSE) + '</statement>' : '';
            return valueTag('TIMES', stmt.TIMES) + valueTag('SEC', stmt.SEC) +
                   '<value name="COND">' + condToXML(stmt.COND) + '</value>' +
                   '<statement name="DO">' + chainXML(stmt.DO) + '</statement>' + elTag;
        }

        default: return '';
    }
}

/* ================================================================
   ПУБЛІЧНИЙ API
   ================================================================ */

window.QRCodec = {
    /**
     * Кодування: Blockly workspace → компактний рядок
     * Кидає Error якщо немає start_hat
     */
    encode: encodeWorkspace,

    /**
     * Декодування: компактний рядок → Blockly XML (рядок)
     */
    decode: decodeToXML,

    /**
     * Порівняти розміри: оригінальний JSON vs компактний
     */
    stats(workspace) {
        const xml  = Blockly.Xml.domToText(Blockly.Xml.workspaceToDom(workspace));
        const orig = JSON.stringify({ v:1, xml }).length;
        const compact = this.encode(workspace).length;
        return { original: orig, compact, ratio: (compact/orig*100).toFixed(1)+'%' };
    }
};

console.log('✅ QRCodec завантажено. Блок-коди: 1=start 2=stop RL:l,r RD:t,s RT:d,s SP:n M4:a,b,c,d MT:m,v W:s WU:s,op,v TR C:n{} F{} WH:cond{} IF:cond{}[EL{}]');

})();
