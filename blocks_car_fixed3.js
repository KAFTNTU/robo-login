// === 🚗 ROBOT CAR BLOCKS & XML ===

window.CAR_CATEGORY = `
<category name="🚗 Машинка" colour="#4C97FF">
    <block type="start_hat"></block>
    <block type="robot_move">
        <value name="L"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="R"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="robot_move_soft">
        <value name="TARGET"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="SEC"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="robot_turn_timed">
            <field name="DIR">LEFT</field>
            <value name="SEC"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value>
    </block>
    <block type="robot_set_speed">
        <value name="SPEED"><shadow type="math_number_limited"><field name="NUM">50</field></shadow></value>
    </block>
    <block type="robot_stop"></block>
    <block type="move_4_motors">
        <value name="M1"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M2"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M3"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
        <value name="M4"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="motor_single">
        <value name="SPEED"><shadow type="math_number_limited"><field name="NUM">100</field></shadow></value>
    </block>
    <block type="go_home"></block>
    <block type="record_start"></block>
    <block type="replay_track"></block>
    <block type="wait_start"></block>
    <block type="stop_at_start"></block>
    <block type="replay_loop">
            <value name="TIMES"><shadow type="math_number"><field name="NUM">1</field></shadow></value>
    </block>
    <block type="count_laps">
            <value name="LAPS"><shadow type="math_number"><field name="NUM">3</field></shadow></value>
    </block>
    <block type="autopilot_distance"></block>
</category>
`;


// === UI: Group/Scale container (collapse helper) ===
Blockly.defineBlocksWithJsonArray([{
  "type": "ui_group_scale",
  "message0": "масштаб %1 %2",
  "args0": [
    {
      "type": "field_dropdown",
      "name": "MODE",
      "options": [
        ["нормальний (1×)", "normal"],
        ["компактний (згорнути вміст)", "compact"],
        ["повністю згорнути", "collapsed"]
      ]
    },
    { "type": "input_statement", "name": "STACK" }
  ],
  "colour": 200,
  "tooltip": "Контейнер для групування блоків. Масштаб окремих блоків (0.5×) Blockly стандартно не підтримує, але можна компактно згорнути вміст або повністю сховати його в один блок.",
  "helpUrl": "",
  "extensions": ["ui_group_scale_extension"]
}]);


(function(){
  function setStackCollapsed(block, collapsed) {
    const stack = block.getInputTargetBlock('STACK');
    if (!stack) return;
    let b = stack;
    while (b) {
      b.setCollapsed(!!collapsed);
      const children = b.getChildren(false);
      for (const ch of children) ch.setCollapsed(!!collapsed);
      b = b.getNextBlock();
    }
  }

  if (Blockly.Extensions && Blockly.Extensions.register) {
    Blockly.Extensions.register('ui_group_scale_extension', function() {
      if (!this.getInput('STACK')) this.appendStatementInput('STACK');
      this.setInputsInline(false);

      this.setOnChange(function(e){
        if (!this.workspace || this.isInFlyout) return;
        if (e && e.type === Blockly.Events.BLOCK_CHANGE &&
            e.blockId === this.id && e.element === 'field' && e.name === 'MODE') {
          const mode = this.getFieldValue('MODE');
          if (mode === 'normal') {
            setStackCollapsed(this, false);
            this.setCollapsed(false);
          } else if (mode === 'compact') {
            this.setCollapsed(false);
            setStackCollapsed(this, true);
          } else if (mode === 'collapsed') {
            this.setCollapsed(true);
          }
        }
      });
    });
  }
})();

Blockly.Blocks['start_hat'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🏁 СТАРТ"); 
        this.setNextStatement(true); 
        this.setColour(120); 
    } 
};
javascript.javascriptGenerator.forBlock['start_hat'] = function(b) { return ''; };

Blockly.Blocks['robot_move'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🚗 Їхати"); this.appendValueInput("L").setCheck("Number").appendField("L"); this.appendValueInput("R").setCheck("Number").appendField("R"); 
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    } 
};
javascript.javascriptGenerator.forBlock['robot_move'] = function(b) {
    var l = javascript.javascriptGenerator.valueToCode(b, 'L', javascript.Order.ATOMIC) || '0';
    var r = javascript.javascriptGenerator.valueToCode(b, 'R', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var appliedL = ${l} * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
    var appliedR = ${r} * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
    recordMove(appliedL, appliedR, 0, 0); 
    await sendCarPacket(appliedL, appliedR);\n`;
};

Blockly.Blocks['robot_move_soft'] = {
    init: function() {
        this.appendDummyInput().appendField("🚀 Плавний старт до");
        this.appendValueInput("TARGET").setCheck("Number");
        this.appendValueInput("SEC").setCheck("Number").appendField("за (сек)");
        this.setInputsInline(true);
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['robot_move_soft'] = function(block) {
    var target = javascript.javascriptGenerator.valueToCode(block, 'TARGET', javascript.Order.ATOMIC) || '100';
    var sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '1';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var steps = ${sec} * 20; 
    for(var i=1; i<=steps; i++) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        var current = (${target} / steps) * i;
        var applied = current * (typeof _blocklySpeedMultiplier !== 'undefined' ? _blocklySpeedMultiplier : 1.0);
        await sendCarPacket(applied, applied);
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

Blockly.Blocks['robot_turn_timed'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🔄 Поворот")
            .appendField(new Blockly.FieldDropdown([["Ліворуч ⬅️","LEFT"], ["Праворуч ➡️","RIGHT"]]), "DIR");
        this.appendValueInput("SEC").setCheck("Number").appendField("на");
        this.appendDummyInput().appendField("сек");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    }
};
javascript.javascriptGenerator.forBlock['robot_turn_timed'] = function(block) {
    var dir = block.getFieldValue('DIR');
    var sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '0.5';
    var l = (dir === 'LEFT') ? -80 : 80;
    var r = (dir === 'LEFT') ? 80 : -80;
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    recordMove(${l}, ${r}, 0, 0);
    await sendCarPacket(${l}, ${r});
    await new Promise(r => setTimeout(r, ${sec} * 1000));
    recordMove(0,0,0,0);
    await sendCarPacket(0,0);
    \n`;
};

Blockly.Blocks['robot_set_speed'] = {
    init: function() {
        this.appendDummyInput().appendField("⚡ Швидкість");
        this.appendValueInput("SPEED").setCheck("Number");
        this.appendDummyInput().appendField("%");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); 
    }
};
javascript.javascriptGenerator.forBlock['robot_set_speed'] = function(block) {
    var s = javascript.javascriptGenerator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '100';
    return `_blocklySpeedMultiplier = ${s} / 100.0;\n`;
};

Blockly.Blocks['robot_stop'] = { init: function() { this.appendDummyInput().appendField("🛑 Стоп"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); } };
javascript.javascriptGenerator.forBlock['robot_stop'] = function() { return `recordMove(0,0,0,0); await sendCarPacket(0,0);\n`; };

Blockly.Blocks['move_4_motors'] = { 
    init: function() { 
        this.appendDummyInput().appendField("🚙 4 Мотори (ABCD)");
        this.appendValueInput("M1").setCheck("Number").appendField("A:");
        this.appendValueInput("M2").setCheck("Number").appendField("B:");
        this.appendValueInput("M3").setCheck("Number").appendField("C:");
        this.appendValueInput("M4").setCheck("Number").appendField("D:");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    } 
};
javascript.javascriptGenerator.forBlock['move_4_motors'] = function(block) {
    var m1 = javascript.javascriptGenerator.valueToCode(block, 'M1', javascript.Order.ATOMIC) || '0';
    var m2 = javascript.javascriptGenerator.valueToCode(block, 'M2', javascript.Order.ATOMIC) || '0';
    var m3 = javascript.javascriptGenerator.valueToCode(block, 'M3', javascript.Order.ATOMIC) || '0';
    var m4 = javascript.javascriptGenerator.valueToCode(block, 'M4', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    await sendDrivePacket(${m1}, ${m2}, ${m3}, ${m4});\n`;
};

Blockly.Blocks['motor_single'] = { 
    init: function() { 
        this.appendDummyInput()
            .appendField("⚙️ Мотор")
            .appendField(new Blockly.FieldDropdown([["A","1"], ["B","2"], ["C","3"], ["D","4"]]), "MOTOR")
            .appendField("Шв:");
        this.appendValueInput("SPEED").setCheck("Number");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    } 
};
javascript.javascriptGenerator.forBlock['motor_single'] = function(block) {
    var m = block.getFieldValue('MOTOR'); 
    var s = javascript.javascriptGenerator.valueToCode(block, 'SPEED', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    var current = window.motorState || {m1:0, m2:0, m3:0, m4:0};
    var m1 = current.m1, m2 = current.m2, m3 = current.m3, m4 = current.m4;
    if('${m}' == '1') m1 = ${s};
    if('${m}' == '2') m2 = ${s};
    if('${m}' == '3') m3 = ${s};
    if('${m}' == '4') m4 = ${s};
    await sendDrivePacket(m1, m2, m3, m4);
    \n`;
};

// --- LOGIC, SENSORS & RECORDING ---

Blockly.Blocks['record_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🔴 Запам'ятати трасу (Почати запис)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['record_start'] = function(block) {
    return `window._trackMemory = []; window._isRecordingTrack = true; console.log("Recording started...");\n`;
};

Blockly.Blocks['replay_track'] = {
    init: function() {
        this.appendDummyInput().appendField("▶️ Відтворити записану трасу");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['replay_track'] = function(block) {
    return `
    window._isRecordingTrack = false; 
    if (window._trackMemory.length > 0) {
        for (let i = 0; i < window._trackMemory.length; i++) {
            if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
            let step = window._trackMemory[i];
            if (i > 0) {
                let delay = step.t - window._trackMemory[i-1].t;
                if (delay > 0) await new Promise(r => setTimeout(r, delay));
            }
            await sendDrivePacket(step.l, step.r, step.m3, step.m4);
        }
        await sendDrivePacket(0,0,0,0);
    }
    \n`;
};

Blockly.Blocks['replay_loop'] = {
    init: function() {
        this.appendDummyInput().appendField("🔄 Повторити трасу з пам'яті");
        this.appendValueInput("TIMES").setCheck("Number");
        this.appendDummyInput().appendField("разів");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(260); 
    }
};
javascript.javascriptGenerator.forBlock['replay_loop'] = function(block) {
    let times = javascript.javascriptGenerator.valueToCode(block, 'TIMES', javascript.Order.ATOMIC) || '1';
    return `
    window._isRecordingTrack = false;
    for(let loop=0; loop < ${times}; loop++) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        if (window._trackMemory.length > 0) {
            for (let i = 0; i < window._trackMemory.length; i++) {
                if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
                let step = window._trackMemory[i];
                if (i > 0) {
                    let delay = step.t - window._trackMemory[i-1].t;
                    if (delay > 0) await new Promise(r => setTimeout(r, delay));
                }
                await sendDrivePacket(step.l, step.r, step.m3, step.m4);
            }
            await sendDrivePacket(0,0,0,0);
            await new Promise(r => setTimeout(r, 500));
        }
    }
    \n`;
};


// === ЦИКЛИ: Нескінченний цикл (loop_forever) ===
Blockly.Blocks['loop_forever'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("🔁 Повторювати завжди");
    this.appendStatementInput("DO")
      .appendField("виконувати");
    this.setPreviousStatement(true, null);
    this.setColour(120);
    this.setTooltip("Нескінченний цикл. Виконує команди всередині вічно (зупиняється кнопкою Стоп).");
  }
};

javascript.javascriptGenerator.forBlock['loop_forever'] = function(block) {
  const branch = javascript.javascriptGenerator.statementToCode(block, 'DO');
  return `
  while (true) {
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    ${branch}
    await new Promise(r => setTimeout(r, 10)); // Запобігає зависанню браузера
  }
  \n`;
};

// === ЦИКЛИ: Повторити з паузою (сек) ===
Blockly.Blocks['loop_repeat_pause'] = {
  init: function() {
    this.appendDummyInput()
      .appendField("🔁 Повторити");
    this.appendValueInput("TIMES").setCheck("Number");
    this.appendDummyInput().appendField("разів з паузою");
    this.appendValueInput("SEC").setCheck("Number");
    this.appendDummyInput().appendField("с");
    this.appendStatementInput("DO").appendField("виконати");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(120);
    this.setInputsInline(true);
  }
};

javascript.javascriptGenerator.forBlock['loop_repeat_pause'] = function(block) {
  const times = javascript.javascriptGenerator.valueToCode(block, 'TIMES', javascript.Order.ATOMIC) || '1';
  const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '0';
  const body = javascript.javascriptGenerator.statementToCode(block, 'DO');
  return `
{
  const __times = Math.max(0, Number(${times}) || 0);
  const __sec = Math.max(0, Number(${sec}) || 0);
  for (let __i = 0; __i < __times; __i++) {
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
${body}
    if (__i < __times - 1 && __sec > 0) {
      recordWait(__sec);
      await new Promise(r => setTimeout(r, __sec * 1000));
    }
  }
}
`;
};

// === ЦИКЛИ: Кожні S секунд ===
Blockly.Blocks['loop_every_seconds'] = {
  init: function() {
    this.appendDummyInput().appendField("⏱ Кожні");
    this.appendValueInput("SEC").setCheck("Number");
    this.appendDummyInput().appendField("с");
    this.appendStatementInput("DO").appendField("виконати");
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(120);
    this.setInputsInline(true);
  }
};

javascript.javascriptGenerator.forBlock['loop_every_seconds'] = function(block) {
  const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '1';
  const body = javascript.javascriptGenerator.statementToCode(block, 'DO');
  return `
{
  const __period = Math.max(0, Number(${sec}) || 0);
  const __now = () => (window.performance && performance.now ? performance.now() : Date.now());
  while (true) {
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    const __t0 = __now();
${body}
    const __elapsed = (__now() - __t0) / 1000;
    const __sleep = Math.max(0, __period - __elapsed);
    if (__sleep > 0) {
      recordWait(__sleep);
      await new Promise(r => setTimeout(r, __sleep * 1000));
    }
  }
}
`;
};


Blockly.Blocks['go_home'] = { init: function() { this.appendDummyInput().appendField("🏠 Додому (Назад)"); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230); } }; 
javascript.javascriptGenerator.forBlock['go_home'] = function() { return 'await goHomeSequence();\n'; };

Blockly.Blocks['wait_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🏁 Чекати Старт (Чорна лінія)");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    }
};
javascript.javascriptGenerator.forBlock['wait_start'] = function(block) {
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s1 = window.sensorData ? window.sensorData[0] : 0; 
        if (s1 > 60) break;
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

Blockly.Blocks['stop_at_start'] = {
    init: function() {
        this.appendDummyInput().appendField("🛑 Зупинитися на старті");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(0); 
    }
};
javascript.javascriptGenerator.forBlock['stop_at_start'] = function(block) {
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s1 = window.sensorData ? window.sensorData[0] : 0;
        if (s1 > 60) break; 
        await new Promise(r => setTimeout(r, 20));
    }
    await sendDrivePacket(0,0,0,0);
    \n`;
};

Blockly.Blocks['count_laps'] = {
    init: function() {
        this.appendValueInput("LAPS").setCheck("Number").appendField("🔢 Лічити кола до"); 
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    }
};
javascript.javascriptGenerator.forBlock['count_laps'] = function(block) {
    let laps = javascript.javascriptGenerator.valueToCode(block, 'LAPS', javascript.Order.ATOMIC) || '1';
    return `
    let lapsTarget = ${laps}; let lapsCounted = 0; let onLine = false;
    while(lapsCounted < lapsTarget) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        let s = (window.sensorData && window.sensorData[0] > 60); 
        if (s && !onLine) { onLine = true; lapsCounted++; } else if (!s && onLine) { onLine = false; }
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};


// === Заглушки для блоків track_action та start_line_action ===
Blockly.Blocks['track_action'] = {
    init: function() {
        this.appendDummyInput().appendField("🛣️ Дія на трасі");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['track_action'] = function() { return '\n'; };

Blockly.Blocks['start_line_action'] = {
    init: function() {
        this.appendDummyInput().appendField("🏁 Дія на старті");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['start_line_action'] = function() { return '\n'; };


// --- SENSORS & LOGIC ---

Blockly.Blocks['wait_seconds'] = { 
    init: function() { 
        this.appendDummyInput().appendField("⏳ Чекати");
        this.appendValueInput("SECONDS").setCheck("Number");
        this.appendDummyInput().appendField("сек");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40); 
    } 
};
javascript.javascriptGenerator.forBlock['wait_seconds'] = function(b) { 
    var s = javascript.javascriptGenerator.valueToCode(b, 'SECONDS', javascript.Order.ATOMIC) || '0';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    recordWait(${s}); 
    await new Promise(r => setTimeout(r, ${s} * 1000));
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    \n`; 
};

Blockly.Blocks['sensor_get'] = { 
    init: function() { 
        this.appendDummyInput()
            .appendField(new Blockly.FieldDropdown([["📏 Відстань", "DIST"], ["💡 Світло", "LIGHT"], ["👆 Дотик", "TOUCH"]]), "TYPE")
            .appendField("Порт")
            .appendField(new Blockly.FieldDropdown([["1","0"], ["2","1"], ["3","2"], ["4","3"]]), "SENS");
        this.setOutput(true, "Number"); 
        this.setColour(180); 
    } 
};
javascript.javascriptGenerator.forBlock['sensor_get'] = function(b) { 
    var idx = b.getFieldValue('SENS');
    return [`(window.sensorData ? window.sensorData[${idx}] : 0)`, javascript.Order.ATOMIC]; 
};

Blockly.Blocks['wait_until_sensor'] = {
     init: function() { 
        this.appendValueInput("VAL").setCheck("Number").appendField("⏳ Чекати, поки Порт").appendField(new Blockly.FieldDropdown([["1","0"], ["2","1"], ["3","2"], ["4","3"]]), "SENS").appendField(new Blockly.FieldDropdown([["<", "LT"], [">", "GT"]]), "OP");
        this.setInputsInline(true); this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['wait_until_sensor'] = function(block) {
    var s = block.getFieldValue('SENS');
    var op = block.getFieldValue('OP') === 'LT' ? '<' : '>';
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    return `
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        var currentVal = window.sensorData ? window.sensorData[${s}] : 0;
        if (currentVal ${op} ${val}) break;
        await new Promise(r => setTimeout(r, 50)); 
    }
    \n`;
};

Blockly.Blocks['math_number_limited'] = {
    init: function() {
        this.appendDummyInput().appendField(new Blockly.FieldNumber(100, -100, 100), "NUM"); 
        this.setOutput(true, "Number"); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['math_number_limited'] = function(block) {
    return [block.getFieldValue('NUM'), javascript.Order.ATOMIC];
};

Blockly.Blocks['logic_edge_detect'] = {
    init: function() {
        this.appendDummyInput().appendField("⚡ Сигнал став активним (0→1)");
        this.appendValueInput("VAL").setCheck(null).appendField("Перевірити");
        this.setOutput(true, "Boolean"); this.setColour(210); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['logic_edge_detect'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || 'false';
    var id = block.id;
    return [`checkRisingEdge('${id}', ${val})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['logic_schmitt'] = {
    init: function() {
        this.appendDummyInput().appendField("🛡️ Вкл >"); this.appendValueInput("HIGH").setCheck("Number");
        this.appendDummyInput().appendField("Викл <"); this.appendValueInput("LOW").setCheck("Number");
        this.appendValueInput("VAL").setCheck("Number").appendField("Значення");
        this.setOutput(true, "Boolean"); this.setColour(210); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['logic_schmitt'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    var low = javascript.javascriptGenerator.valueToCode(block, 'LOW', javascript.Order.ATOMIC) || '30';
    var high = javascript.javascriptGenerator.valueToCode(block, 'HIGH', javascript.Order.ATOMIC) || '70';
    var id = block.id;
    return [`schmittTrigger('${id}', ${val}, ${low}, ${high})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['math_smooth'] = {
    init: function() {
        this.appendValueInput("VAL").setCheck("Number").appendField("🌊 Згладити");
        this.appendDummyInput().appendField("К-сть:").appendField(new Blockly.FieldNumber(5, 2, 50), "SIZE");
        this.setOutput(true, "Number"); this.setColour(230); this.setInputsInline(true);
    }
};
javascript.javascriptGenerator.forBlock['math_smooth'] = function(block) {
    var val = javascript.javascriptGenerator.valueToCode(block, 'VAL', javascript.Order.ATOMIC) || '0';
    var size = block.getFieldValue('SIZE');
    var id = block.id;
    return [`smoothValue('${id}', ${val}, ${size})`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['math_pid'] = {
    init: function() {
        this.appendDummyInput().appendField("🎛️ PID Регулятор");
        this.appendValueInput("ERROR").setCheck("Number").appendField("Помилка");
        this.appendValueInput("KP").setCheck("Number").appendField("Kp");
        this.appendValueInput("KI").setCheck("Number").appendField("Ki");
        this.appendValueInput("KD").setCheck("Number").appendField("Kd");
        this.setOutput(true, "Number"); this.setInputsInline(true); this.setColour(230);
    }
};
javascript.javascriptGenerator.forBlock['math_pid'] = function(block) {
    var error = javascript.javascriptGenerator.valueToCode(block, 'ERROR', javascript.Order.ATOMIC) || '0';
    var kp = javascript.javascriptGenerator.valueToCode(block, 'KP', javascript.Order.ATOMIC) || '1';
    var ki = javascript.javascriptGenerator.valueToCode(block, 'KI', javascript.Order.ATOMIC) || '0';
    var kd = javascript.javascriptGenerator.valueToCode(block, 'KD', javascript.Order.ATOMIC) || '0';
    return [`calculatePID(${error}, ${kp}, ${ki}, ${kd})`, javascript.Order.FUNCTION_CALL];
};


// === 📐 ПРОСТА МАТЕМАТИКА ДЛЯ ДІТЕЙ (UA) ===

Blockly.Blocks['math_radius_from_diameter'] = {
    init: function() {
        this.appendValueInput("D").setCheck("Number").appendField("📏 Радіус");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setInputsInline(true);
        this.setTooltip("r = d / 2");
    }
};
javascript.javascriptGenerator.forBlock['math_radius_from_diameter'] = function(block) {
    var d = javascript.javascriptGenerator.valueToCode(block, 'D', javascript.Order.ATOMIC) || '0';
    return [`((${d}) / 2)`, javascript.Order.ATOMIC];
};

Blockly.Blocks['math_diameter_from_radius'] = {
    init: function() {
        this.appendValueInput("R").setCheck("Number").appendField("📏 Діаметр");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setInputsInline(true);
        this.setTooltip("d = 2 * r");
    }
};
javascript.javascriptGenerator.forBlock['math_diameter_from_radius'] = function(block) {
    var r = javascript.javascriptGenerator.valueToCode(block, 'R', javascript.Order.ATOMIC) || '0';
    return [`(2 * (${r}))`, javascript.Order.MULTIPLICATIVE];
};

Blockly.Blocks['math_path_vt'] = {
    init: function() {
        this.appendDummyInput().appendField("📏 Довжина шляху");
        this.appendValueInput("V").setCheck("Number").appendField("v (см/с)");
        this.appendValueInput("T").setCheck("Number").appendField("t (с)");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setInputsInline(true);
        this.setTooltip("s = v * t (см)");
    }
};
javascript.javascriptGenerator.forBlock['math_path_vt'] = function(block) {
    var v = javascript.javascriptGenerator.valueToCode(block, 'V', javascript.Order.MULTIPLICATIVE) || '0';
    var t = javascript.javascriptGenerator.valueToCode(block, 'T', javascript.Order.MULTIPLICATIVE) || '0';
    return [`((${v}) * (${t}))`, javascript.Order.MULTIPLICATIVE];
};

Blockly.Blocks['math_pythagoras'] = {
    init: function() {
        this.appendDummyInput().appendField("📐 Діагональ (Піфагор)");
        this.appendValueInput("A").setCheck("Number").appendField("a");
        this.appendValueInput("B").setCheck("Number").appendField("b");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setInputsInline(true);
        this.setTooltip("c = √(a² + b²)");
    }
};
javascript.javascriptGenerator.forBlock['math_pythagoras'] = function(block) {
    var a = javascript.javascriptGenerator.valueToCode(block, 'A', javascript.Order.ATOMIC) || '0';
    var b = javascript.javascriptGenerator.valueToCode(block, 'B', javascript.Order.ATOMIC) || '0';
    return [`Math.sqrt(((${a})*(${a})) + ((${b})*(${b})))`, javascript.Order.FUNCTION_CALL];
};

Blockly.Blocks['math_rect_perimeter'] = {
    init: function() {
        this.appendDummyInput().appendField("📏 Периметр прямокутника");
        this.appendValueInput("W").setCheck("Number").appendField("ширина");
        this.appendValueInput("H").setCheck("Number").appendField("висота");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setInputsInline(true);
        this.setTooltip("P = 2*(w + h)");
    }
};
javascript.javascriptGenerator.forBlock['math_rect_perimeter'] = function(block) {
    var w = javascript.javascriptGenerator.valueToCode(block, 'W', javascript.Order.ATOMIC) || '0';
    var h = javascript.javascriptGenerator.valueToCode(block, 'H', javascript.Order.ATOMIC) || '0';
    return [`(2 * ((${w}) + (${h})))`, javascript.Order.MULTIPLICATIVE];
};

// Калібрована швидкість (см/с), яку рахує блок калібрування
Blockly.Blocks['math_speed_cms'] = {
    init: function() {
        this.appendDummyInput().appendField("🚗 Швидкість (см/с)");
        this.setOutput(true, "Number");
        this.setColour(230);
        this.setTooltip("Повертає останню калібровану швидкість у см/с.");
    }
};
javascript.javascriptGenerator.forBlock['math_speed_cms'] = function(block) {
    return [`(window._rcSpeedCmS || 0)`, javascript.Order.ATOMIC];
};

Blockly.Blocks['timer_get'] = {
    init: function() {
        this.appendDummyInput().appendField("⏱️ Таймер (с)");
        this.setOutput(true, "Number"); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['timer_get'] = function(block) {
    return [`((new Date().getTime() - _startTime) / 1000)`, javascript.Order.ATOMIC];
};

Blockly.Blocks['timer_reset'] = {
    init: function() {
        this.appendDummyInput().appendField("🔄 Скинути таймер");
        this.setPreviousStatement(true); this.setNextStatement(true); this.setColour(40);
    }
};
javascript.javascriptGenerator.forBlock['timer_reset'] = function(block) {
    return `_startTime = new Date().getTime();\n`;
};




// === ⚙️ КАЛІБРУВАННЯ ШВИДКОСТІ ПО ЛІНІЇ (UA) ===
// Потрібно: 2 мітки (лінії) на підлозі на відстані L см.

Blockly.Blocks['calibrate_speed_line'] = {
    init: function() {
        this.appendDummyInput().appendField("⚙️ Калібрувати швидкість");
        this.appendValueInput("L").setCheck("Number").appendField("відстань L (см)");
        this.appendDummyInput()
            .appendField("датчик")
            .appendField(new Blockly.FieldDropdown([["1","1"],["2","2"],["3","3"],["4","4"]]), "PORT");
        this.appendDummyInput()
            .appendField("умова лінії")
            .appendField(new Blockly.FieldDropdown([["< поріг","LT"],["> поріг","GT"]]), "CMP");
        this.appendValueInput("THR").setCheck("Number").appendField("поріг");
        this.appendValueInput("SPD").setCheck("Number").appendField("швидк. (0-100)");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(40);
        this.setInputsInline(false);
        this.setTooltip("Рахує швидкість (см/с) між двома лініями та зберігає її.");
    }
};

javascript.javascriptGenerator.forBlock['calibrate_speed_line'] = function(block) {
    const L = javascript.javascriptGenerator.valueToCode(block, 'L', javascript.Order.ATOMIC) || '50';
    const thr = javascript.javascriptGenerator.valueToCode(block, 'THR', javascript.Order.ATOMIC) || '30';
    const spd = javascript.javascriptGenerator.valueToCode(block, 'SPD', javascript.Order.ATOMIC) || '60';
    const port = block.getFieldValue('PORT'); // "1".."4"
    const cmp = block.getFieldValue('CMP'); // LT/GT

    const cond = (cmp === 'GT') ? 'v > thr' : 'v < thr';

    return `
    // ⚙️ calibrate speed (cm/s) using 2 line marks and light sensor
    {
        const idx = Math.max(0, Math.min(3, (parseInt(${port}) - 1)));
        const thr = (${thr});
        const Lcm = (${L});
        const spd = (${spd});

        const readV = () => (window.sensorData ? (window.sensorData[idx] || 0) : 0);
        const isLine = () => { const v = readV(); return (${cond}); };

        // helper: wait until line is stable for ~0.12s
        async function _waitLineStable() {
            let okMs = 0;
            while (true) {
                if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
                if (isLine()) okMs += 30; else okMs = 0;
                if (okMs >= 120) return;
                await new Promise(r => setTimeout(r, 30));
            }
        }

        // 1) wait first line
        await _waitLineStable();
        // wait to leave the line (avoid instant second trigger)
        let offMs = 0;
        while (offMs < 180) {
            if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
            if (!isLine()) offMs += 30; else offMs = 0;
            await new Promise(r => setTimeout(r, 30));
        }

        // 2) start measuring
        _startTime = new Date().getTime();
        await window.sendCarPacket((spd), (spd));

        // 3) wait second line
        await _waitLineStable();

        // 4) stop and compute
        await window.sendCarPacket(0,0);
        const tSec = ((new Date().getTime() - _startTime) / 1000);
        window._rcSpeedCmS = (tSec > 0.05) ? (Lcm / tSec) : 0;
        window._rcSpeedPercent = spd;
        window._rcLastCalib = { Lcm: Lcm, tSec: tSec, thr: thr, port: idx };

        // small pause
        await new Promise(r => setTimeout(r, 120));
    }
    \n`;
};

// === 🤖 Autopilot by distance sensor (simple avoid) ===
Blockly.Blocks['autopilot_distance'] = {
    init: function() {
        this.appendDummyInput()
            .appendField("🤖 Автопілот (датчик)")
            .appendField("Port")
            .appendField(new Blockly.FieldDropdown([["1","1"],["2","2"],["3","3"],["4","4"]]), "PORT")
            .appendField("поворот")
            .appendField(new Blockly.FieldDropdown([["RIGHT","RIGHT"],["LEFT","LEFT"]]), "DIR");
        this.appendValueInput("THR").setCheck("Number").appendField("якщо <");
        this.appendValueInput("SPD").setCheck("Number").appendField("швидк.");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(20);
    }
};

javascript.javascriptGenerator.forBlock['autopilot_distance'] = function(block) {
    const port = block.getFieldValue('PORT'); // "1".."4"
    const dir = block.getFieldValue('DIR');
    const thr = javascript.javascriptGenerator.valueToCode(block, 'THR', javascript.Order.ATOMIC) || '40';
    const spd = javascript.javascriptGenerator.valueToCode(block, 'SPD', javascript.Order.ATOMIC) || '60';

    return `
    // autopilot loop (STOP breaks)
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";

        const idx = Math.max(0, Math.min(3, (parseInt(${port}) - 1)));
        const s = window.sensorData ? (window.sensorData[idx] || 0) : 0;

        if (s > 0 && s < (${thr})) {
            // obstacle: back then turn
            await window.sendCarPacket(-(${spd}), -(${spd}));
            await new Promise(r => setTimeout(r, 250));

            if ('${dir}' === 'LEFT') {
                await window.sendCarPacket(-(${spd}), (${spd}));
            } else {
                await window.sendCarPacket((${spd}), -(${spd}));
            }
            await new Promise(r => setTimeout(r, 320));

            await window.sendCarPacket(0,0);
            await new Promise(r => setTimeout(r, 80));
        } else {
            await window.sendCarPacket((${spd}), (${spd}));
            await new Promise(r => setTimeout(r, 80));
        }
    }
    \n`;
};



// === 🧠 STATE MACHINE + SMART CONDITIONS (UA) ===

// --- internal helpers (runtime-safe) ---
function _rcEnsureStateSystem() {
    if (typeof window._rcState === 'undefined') window._rcState = "";
    if (typeof window._rcStatePrev === 'undefined') window._rcStatePrev = "";
    if (typeof window._rcStateEnterMs === 'undefined') window._rcStateEnterMs = Date.now();
    if (typeof window._rcStateCounts === 'undefined') window._rcStateCounts = {};
    if (typeof window._rcStateReason === 'undefined') window._rcStateReason = "";
    if (typeof window._rcCooldowns === 'undefined') window._rcCooldowns = {};
    if (typeof window._rcLatches === 'undefined') window._rcLatches = {};
}

// --- state_set ---
Blockly.Blocks['state_set'] = {
    init: function() {
        this.appendDummyInput().appendField("🧠 Стан =");
        this.appendValueInput("STATE").setCheck("String");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(210);
        this.setTooltip("Встановлює режим (стан) роботи робота, наприклад SEARCH/ATTACK/MANUAL.");
    }
};
javascript.javascriptGenerator.forBlock['state_set'] = function(block) {
    const st = javascript.javascriptGenerator.valueToCode(block, 'STATE', javascript.Order.ATOMIC) || '""';
    return `
    _rcEnsureStateSystem();
    const __newState = String(${st});
    if (window._rcState !== __newState) {
        const __old = window._rcState;
        window._rcStatePrev = __old;
        window._rcState = __newState;
        window._rcStateEnterMs = Date.now();
        window._rcStateReason = "";
        window._rcStateCounts[__newState] = (window._rcStateCounts[__newState] || 0) + 1;
        if (typeof log === 'function') log("Стан: " + __old + " → " + __newState);
    }
    \n`;
};

// --- state_set_reason ---
Blockly.Blocks['state_set_reason'] = {
    init: function() {
        this.appendDummyInput().appendField("🧠 Стан =");
        this.appendValueInput("STATE").setCheck("String");
        this.appendDummyInput().appendField("бо");
        this.appendValueInput("REASON").setCheck("String");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(210);
        this.setTooltip("Встановлює стан і записує причину переходу (для логу/відладки).");
    }
};
javascript.javascriptGenerator.forBlock['state_set_reason'] = function(block) {
    const st = javascript.javascriptGenerator.valueToCode(block, 'STATE', javascript.Order.ATOMIC) || '""';
    const rs = javascript.javascriptGenerator.valueToCode(block, 'REASON', javascript.Order.ATOMIC) || '""';
    return `
    _rcEnsureStateSystem();
    const __newState = String(${st});
    const __reason = String(${rs});
    if (window._rcState !== __newState) {
        const __old = window._rcState;
        window._rcStatePrev = __old;
        window._rcState = __newState;
        window._rcStateEnterMs = Date.now();
        window._rcStateReason = __reason;
        window._rcStateCounts[__newState] = (window._rcStateCounts[__newState] || 0) + 1;
        if (typeof log === 'function') log("Стан: " + __old + " → " + __newState + " (" + __reason + ")");
    } else {
        window._rcStateReason = __reason;
    }
    \n`;
};

// --- state_get ---
Blockly.Blocks['state_get'] = {
    init: function() {
        this.appendDummyInput().appendField("🧠 Поточний стан");
        this.setOutput(true, "String");
        this.setColour(210);
        this.setTooltip("Повертає назву поточного стану (рядок).");
    }
};
javascript.javascriptGenerator.forBlock['state_get'] = function() {
    return ['( (_rcEnsureStateSystem(), window._rcState) )', javascript.Order.ATOMIC];
};

// --- state_time_s ---
Blockly.Blocks['state_time_s'] = {
    init: function() {
        this.appendDummyInput().appendField("⏱ Час у стані (с)");
        this.setOutput(true, "Number");
        this.setColour(210);
        this.setTooltip("Повертає, скільки секунд ти вже у поточному стані.");
    }
};
javascript.javascriptGenerator.forBlock['state_time_s'] = function() {
    return ['( (_rcEnsureStateSystem(), (Date.now() - (window._rcStateEnterMs || Date.now())) / 1000) )', javascript.Order.ATOMIC];
};

// --- state_enter_count ---
Blockly.Blocks['state_enter_count'] = {
    init: function() {
        this.appendDummyInput().appendField("🔁 Скільки разів зайшли в стан");
        this.appendValueInput("STATE").setCheck("String");
        this.setInputsInline(true);
        this.setOutput(true, "Number");
        this.setColour(210);
        this.setTooltip("Лічильник входів у конкретний стан (анти-зациклення).");
    }
};
javascript.javascriptGenerator.forBlock['state_enter_count'] = function(block) {
    const st = javascript.javascriptGenerator.valueToCode(block, 'STATE', javascript.Order.ATOMIC) || '""';
    return [`( (_rcEnsureStateSystem(), window._rcStateCounts[String(${st})] || 0) )`, javascript.Order.ATOMIC];
};

// --- state_prev ---
Blockly.Blocks['state_prev'] = {
    init: function() {
        this.appendDummyInput().appendField("↩️ Повернутись у попередній стан");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(210);
        this.setTooltip("Повертає стан, який був перед поточним.");
    }
};
javascript.javascriptGenerator.forBlock['state_prev'] = function() {
    return `
    _rcEnsureStateSystem();
    const __target = window._rcStatePrev || "";
    if (__target !== "" && window._rcState !== __target) {
        const __old = window._rcState;
        window._rcStatePrev = __old;
        window._rcState = __target;
        window._rcStateEnterMs = Date.now();
        window._rcStateReason = "повернення";
        window._rcStateCounts[__target] = (window._rcStateCounts[__target] || 0) + 1;
        if (typeof log === 'function') log("Стан: " + __old + " → " + __target + " (повернення)");
    }
    \n`;
};

// --- state_if ---
Blockly.Blocks['state_if'] = {
    init: function() {
        this.appendDummyInput().appendField("🧠 Якщо стан =");
        this.appendValueInput("STATE").setCheck("String");
        this.appendStatementInput("DO").appendField("то");
        this.appendStatementInput("ELSE").appendField("інакше");
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(210);
        this.setTooltip("Виконує різні дії залежно від поточного стану.");
    }
};
javascript.javascriptGenerator.forBlock['state_if'] = function(block) {
    const st = javascript.javascriptGenerator.valueToCode(block, 'STATE', javascript.Order.ATOMIC) || '""';
    const doCode = javascript.javascriptGenerator.statementToCode(block, 'DO');
    const elseCode = javascript.javascriptGenerator.statementToCode(block, 'ELSE');
    return `
    _rcEnsureStateSystem();
    if (String(window._rcState) === String(${st})) {
${doCode}
    } else {
${elseCode}
    }
    \n`;
};

// === Smart conditions (seconds) ===

// wait_until_true_for
Blockly.Blocks['wait_until_true_for'] = {
    init: function() {
        this.appendDummyInput().appendField("⏳ Чекати поки (умова) тримається");
        this.appendValueInput("COND").setCheck("Boolean");
        this.appendValueInput("SEC").setCheck("Number").appendField("с");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Чекає, щоб умова була TRUE без перерви заданий час (у секундах).");
    }
};
javascript.javascriptGenerator.forBlock['wait_until_true_for'] = function(block) {
    const cond = javascript.javascriptGenerator.valueToCode(block, 'COND', javascript.Order.ATOMIC) || 'false';
    const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '0.2';
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    let __t0 = null;
    while(true) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        const __ok = !!(${cond});
        if (__ok) {
            if (__t0 === null) __t0 = Date.now();
            if ((Date.now() - __t0) >= (${sec} * 1000)) break;
        } else {
            __t0 = null;
        }
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

// if_true_for
Blockly.Blocks['if_true_for'] = {
    init: function() {
        this.appendDummyInput().appendField("✅ Якщо (умова) тримається");
        this.appendValueInput("COND").setCheck("Boolean");
        this.appendValueInput("SEC").setCheck("Number").appendField("с");
        this.appendStatementInput("DO").appendField("то");
        this.appendStatementInput("ELSE").appendField("інакше");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Якщо умова буде TRUE без перерви SEC секунд — виконає 'то', інакше 'інакше'.");
    }
};
javascript.javascriptGenerator.forBlock['if_true_for'] = function(block) {
    const cond = javascript.javascriptGenerator.valueToCode(block, 'COND', javascript.Order.ATOMIC) || 'false';
    const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '0.2';
    const doCode = javascript.javascriptGenerator.statementToCode(block, 'DO');
    const elseCode = javascript.javascriptGenerator.statementToCode(block, 'ELSE');
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    let __t0 = null;
    let __pass = false;
    const __deadline = Date.now() + (${sec} * 1000) + 10;
    while(Date.now() < __deadline) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        const __ok = !!(${cond});
        if (__ok) {
            if (__t0 === null) __t0 = Date.now();
            if ((Date.now() - __t0) >= (${sec} * 1000)) { __pass = true; break; }
        } else {
            __pass = false; __t0 = null; break;
        }
        await new Promise(r => setTimeout(r, 50));
    }
    if (__pass) {
${doCode}
    } else {
${elseCode}
    }
    \n`;
};

// timeout_do_until
Blockly.Blocks['timeout_do_until'] = {
    init: function() {
        this.appendDummyInput().appendField("⏱ Робити максимум");
        this.appendValueInput("SEC").setCheck("Number").appendField("с поки НЕ");
        this.appendValueInput("COND").setCheck("Boolean");
        this.appendStatementInput("DO").appendField("виконувати");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Виконує вміст циклом, доки умова не стане TRUE або не мине таймаут (сек).");
    }
};
javascript.javascriptGenerator.forBlock['timeout_do_until'] = function(block) {
    const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '3';
    const cond = javascript.javascriptGenerator.valueToCode(block, 'COND', javascript.Order.ATOMIC) || 'false';
    const doCode = javascript.javascriptGenerator.statementToCode(block, 'DO');
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    const __end = Date.now() + (${sec} * 1000);
    while(Date.now() < __end) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        if (!!(${cond})) break;
${doCode}
        await new Promise(r => setTimeout(r, 50));
    }
    \n`;
};

// if_happened_n_times
Blockly.Blocks['if_happened_n_times'] = {
    init: function() {
        this.appendDummyInput().appendField("🔁 Якщо (умова) спрацює");
        this.appendValueInput("TIMES").setCheck("Number");
        this.appendDummyInput().appendField("разів за");
        this.appendValueInput("SEC").setCheck("Number").appendField("с");
        this.appendValueInput("COND").setCheck("Boolean").appendField("умова");
        this.appendStatementInput("DO").appendField("то");
        this.appendStatementInput("ELSE").appendField("інакше");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Рахує скільки разів умова стала TRUE (по фронту) за заданий час (сек).");
    }
};
javascript.javascriptGenerator.forBlock['if_happened_n_times'] = function(block) {
    const times = javascript.javascriptGenerator.valueToCode(block, 'TIMES', javascript.Order.ATOMIC) || '3';
    const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '1';
    const cond = javascript.javascriptGenerator.valueToCode(block, 'COND', javascript.Order.ATOMIC) || 'false';
    const doCode = javascript.javascriptGenerator.statementToCode(block, 'DO');
    const elseCode = javascript.javascriptGenerator.statementToCode(block, 'ELSE');
    return `
    if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
    const __end = Date.now() + (${sec} * 1000);
    let __count = 0;
    let __prev = false;
    while(Date.now() < __end) {
        if (typeof window._shouldStop !== 'undefined' && window._shouldStop) throw "STOPPED";
        const __cur = !!(${cond});
        if (__cur && !__prev) __count++;
        __prev = __cur;
        await new Promise(r => setTimeout(r, 50));
    }
    if (__count >= (${times})) {
${doCode}
    } else {
${elseCode}
    }
    \n`;
};

// cooldown_do
Blockly.Blocks['cooldown_do'] = {
    init: function() {
        this.appendDummyInput().appendField("🧊 Не частіше ніж раз на");
        this.appendValueInput("SEC").setCheck("Number").appendField("с");
        this.appendStatementInput("DO").appendField("виконати");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Обмежує виконання: блок спрацює максимум 1 раз за SEC секунд.");
    }
};
javascript.javascriptGenerator.forBlock['cooldown_do'] = function(block) {
    const sec = javascript.javascriptGenerator.valueToCode(block, 'SEC', javascript.Order.ATOMIC) || '1';
    const doCode = javascript.javascriptGenerator.statementToCode(block, 'DO');
    const key = block.id;
    return `
    _rcEnsureStateSystem();
    const __k = ${JSON.stringify(key)};
    const __now = Date.now();
    const __last = window._rcCooldowns[__k] || 0;
    if ((__now - __last) >= (${sec} * 1000)) {
        window._rcCooldowns[__k] = __now;
${doCode}
    }
    \n`;
};

// latch blocks
Blockly.Blocks['latch_set'] = {
    init: function() {
        this.appendDummyInput().appendField("📌 Прапор встановити");
        this.appendValueInput("NAME").setCheck("String");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Ставить прапор (TRUE) і тримає його, доки не скинеш.");
    }
};
javascript.javascriptGenerator.forBlock['latch_set'] = function(block) {
    const name = javascript.javascriptGenerator.valueToCode(block, 'NAME', javascript.Order.ATOMIC) || '""';
    return `
    _rcEnsureStateSystem();
    window._rcLatches[String(${name})] = true;
    \n`;
};

Blockly.Blocks['latch_reset'] = {
    init: function() {
        this.appendDummyInput().appendField("🧽 Прапор скинути");
        this.appendValueInput("NAME").setCheck("String");
        this.setInputsInline(true);
        this.setPreviousStatement(true);
        this.setNextStatement(true);
        this.setColour(60);
        this.setTooltip("Скидає прапор (FALSE).");
    }
};
javascript.javascriptGenerator.forBlock['latch_reset'] = function(block) {
    const name = javascript.javascriptGenerator.valueToCode(block, 'NAME', javascript.Order.ATOMIC) || '""';
    return `
    _rcEnsureStateSystem();
    delete window._rcLatches[String(${name})];
    \n`;
};

Blockly.Blocks['latch_get'] = {
    init: function() {
        this.appendDummyInput().appendField("📌 Прапор встановлено?");
        this.appendValueInput("NAME").setCheck("String");
        this.setInputsInline(true);
        this.setOutput(true, "Boolean");
        this.setColour(60);
        this.setTooltip("Повертає TRUE, якщо прапор з таким іменем встановлено.");
    }
};
javascript.javascriptGenerator.forBlock['latch_get'] = function(block) {
    const name = javascript.javascriptGenerator.valueToCode(block, 'NAME', javascript.Order.ATOMIC) || '""';
    return [`( (_rcEnsureStateSystem(), !!window._rcLatches[String(${name})]) )`, javascript.Order.ATOMIC];
};


// Generator: ui_group_scale (no-op container)
if (Blockly.JavaScript) {
  Blockly.JavaScript['ui_group_scale'] = function(block) {
    // This block is only for visual grouping/collapsing on the workspace.
    // Generate code for its inner statement blocks, unchanged.
    const statements = Blockly.JavaScript.statementToCode(block, 'STACK');
    return statements;
  };
}
