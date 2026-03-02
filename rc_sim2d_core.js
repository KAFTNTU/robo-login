/* RoboScratch 2D Simulator (single-file) 1 */
(function(){
  'use strict';

  // NOTE: Online functionality is now in rc_sim2d_online.js
  // Load that file BEFORE this one to enable multiplayer

  // ========== Small utilities ==========

  // ========== Small utilities ==========
  const clamp = (v,a,b)=> (v<a?a:(v>b?b:v));
  const lerp = (a,b,t)=> a + (b-a)*t;
  const hypot = Math.hypot;

  const now = ()=> (typeof performance!=='undefined' && performance.now)? performance.now() : Date.now();


  function themeForTrack(name, tr){
    // Default: dark, slightly colorful road that doesn't "burn the eyes"
    const dark = {
      bg: '#0b1220',
      grid: 'rgba(226,232,240,0.08)',
      roadOuter: 'rgba(0,0,0,0.35)',
      roadMain: 'rgba(20,184,166,0.72)', // muted teal
      wallOuter: 'rgba(0,0,0,0.45)',
      wallMain: 'rgba(20,184,166,0.55)',
    };

    // Line-follow / custom-line mode:
    // Keep the UI dark (Scratch-like), and draw a high-contrast line.
    // NOTE: the simulator uses geometric line tracking (not pixel colors), so this is visual-only.
    const lineFollow = {
      bg: '#0b1220',
      grid: 'rgba(255,255,255,0.05)',
      roadOuter: 'rgba(0,0,0,0.20)',
      roadMain: '#ffffff',
      wallOuter: 'rgba(239,68,68,0.20)',
      wallMain: 'rgba(239,68,68,0.40)',
    };

    const nm = String(name||'');
    const isLineFollowName = (nm === 'LineFollow' || nm === 'CustomLine' || nm === 'line-follow' || nm === 'empty-white');
    const isLineKind = !!(tr && tr.kind === 'line');
    const base = (isLineFollowName || isLineKind) ? lineFollow : dark;
    const extra = (tr && tr.theme) ? tr.theme : null;
    return extra ? Object.assign({}, base, extra) : base;
  }

  function makeEl(tag, attrs, children){
    const el = document.createElement(tag);
    if (attrs){
      for (const k in attrs){
        if (k==='style') el.style.cssText = attrs[k];
        else if (k==='class') el.className = attrs[k];
        else if (k==='html') el.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k]==='function') el.addEventListener(k.slice(2), attrs[k]);
        else el.setAttribute(k, attrs[k]);
      }
    }
    if (children!=null){
      const add = (c)=>{
        if (c==null) return;
        if (Array.isArray(c)) c.forEach(add);
        else if (c instanceof Node) el.appendChild(c);
        else el.appendChild(document.createTextNode(String(c)));
      };
      add(children);
    }
    return el;
  }

  // Hide scrollbars visually but keep scrolling capability (important for drag-pan to work in some UIs)
  const CSS = `
  .rcsim2d-root{position:fixed;inset:0;z-index:2147483647;background:#0b1020;display:none;color:#e5e7eb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
  .rcsim2d-shell{position:absolute;inset:0;border-radius:0;background: radial-gradient(1200px 700px at 20% 15%, rgba(17,27,58,.95) 0%, rgba(6,10,22,.92) 55%, rgba(6,10,22,.96) 100%),radial-gradient(900px 600px at 75% 65%, rgba(11,42,46,.55) 0%, transparent 55%),#060a16;box-shadow:none;border:none;overflow:hidden;}
  .rcsim2d-top{height:56px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid rgba(148,163,184,.12);}
  .rcsim2d-title{display:flex;gap:10px;align-items:center;font-weight:950;color:#e2e8f0;letter-spacing:.08em;text-transform:uppercase;font-size:12px;}
  .rcsim2d-dot{width:10px;height:10px;border-radius:999px;background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.12);}
  .rcsim2d-btn{user-select:none;cursor:pointer;border-radius:14px;padding:10px 14px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.14);color:#e2e8f0;font-weight:900;}
  .rcsim2d-btn:hover{background:rgba(148,163,184,.12)}
  .rcsim2d-btn.primary{background:rgba(59,130,246,.92);border-color:rgba(59,130,246,.95)}
  .rcsim2d-btn.danger{background:rgba(239,68,68,.92);border-color:rgba(239,68,68,.95)}
  /* Slightly smaller content area so panels never touch the top bar (≈10% overall tighter) */
  /* Keep simulator UI below the top header and slightly bigger overall.
     - translateY moves the whole block down without changing internal layout
     - smaller insets add ~2% size so it feels closer to the reference mock */
  .rcsim2d-content{position:absolute;inset:62px 18px 18px 18px;display:grid;grid-template-columns:240px 1fr;gap:12px;min-height:0;transform:translateY(12px);}
  .rcsim2d-side{border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:10px 14px;overflow:auto;background: rgba(14,22,40,.34);backdrop-filter: blur(14px) saturate(140%);-webkit-backdrop-filter: blur(14px) saturate(140%);box-shadow: 0 14px 40px rgba(0,0,0,.35);}
  .rcsim2d-side::-webkit-scrollbar{width:0;height:0}
  .rcsim2d-side{scrollbar-width:none;}
  .rcsim2d-main{position:relative;overflow:hidden;min-height:0;border-radius:26px;border:1px solid rgba(148,163,184,.18);background: rgba(14,22,40,.22);box-shadow: 0 18px 50px rgba(0,0,0,.40);}
  .rcsim2d-canvas{width:100%;height:100%;display:block;outline:none;user-select:none;-webkit-user-select:none;border-radius:inherit;}
  .rcsim2d-hud{position:absolute;left:14px;top:14px;display:flex;gap:8px;z-index:3;}
  .rcsim2d-pill{background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.14);color:#e2e8f0;border-radius:999px;padding:7px 10px;font-weight:900;font-size:12px;backdrop-filter: blur(6px);}
  .rcsim2d-footer{position:absolute;right:14px;bottom:14px;display:flex;gap:10px;z-index:3;}
  .rcsim2d-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;}
  .rcsim2d-panelTitle{color:#e2e8f0;font-weight:950;letter-spacing:.08em;text-transform:uppercase;font-size:12px;margin:7px 0 5px 0;}
  .rcsim2d-field{margin:6px 0;}
  .rcsim2d-label{display:flex;align-items:center;justify-content:space-between;color:#cbd5e1;font-weight:800;font-size:12px;margin-bottom:4px;}
  .rcsim2d-labelRight{justify-content:flex-end;}
  .rcsim2d-select,.rcsim2d-input{width:100%;border-radius:14px;padding:10px 12px;background:rgba(2,6,23,.45);border:1px solid rgba(148,163,184,.18);color:#e2e8f0;outline:none;}
  /* Make native <select> dropdowns readable (no white menu) */
  .rcsim2d-side select{color-scheme:dark;}
  .rcsim2d-side option{background:#0b1220;color:#e2e8f0;}
  .rcsim2d-check{display:flex;align-items:center;gap:10px;color:#e2e8f0;font-weight:800;font-size:13px;margin:6px 0;}
  .rcsim2d-check input{width:18px;height:18px}
  .rcsim2d-row{display:flex;gap:8px}
  /* Make the main control buttons readable even on narrow sidebars */
  .rcsim2d-row.rcsim2d-btncol{flex-direction:column}
  .rcsim2d-row.rcsim2d-btncol .rcsim2d-btn{width:100%;min-height:44px;font-size:16px}
  .rcsim2d-row .rcsim2d-btn{flex:1;justify-content:center;display:flex}
  .rcsim2d-slist{display:grid;grid-template-columns:1fr auto;row-gap:8px;column-gap:10px;align-items:center;}
  /* Sensor rows: light frame so it's clear which dropdown belongs to which S */
  .rcsim2d-sensorRow{display:flex;align-items:center;gap:10px;border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:6px 8px;background:rgba(2,6,23,.20);}
  .rcsim2d-sname{color:#e2e8f0;font-weight:900}
  .rcsim2d-sval{color:#93c5fd;font-weight:950;min-width:52px;text-align:right}
  .rcsim2d-help{margin-top:10px;color:#94a3b8;font-weight:900;font-size:12px;line-height:1.35;}
  
  .rcsim2d-root.collapsed .rcsim2d-content{grid-template-columns:1fr;}
  .rcsim2d-root.collapsed .rcsim2d-side{display:none;}
  .rcsim2d-root.collapsed .rcsim2d-main{border-left:none;}
  .rcsim2d-topBtn{background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.14);color:#e2e8f0;border-radius:12px;padding:8px 10px;font-weight:900;font-size:12px;cursor:pointer;}
  .rcsim2d-top > .rcsim2d-topBtn{margin-left:10px;}
  .rcsim2d-topBtn:hover{background:rgba(2,6,23,.72);}
  /* Top tools (obstacles/brush/eraser/help) */
  .rcsim2d-topTools{display:flex;align-items:center;gap:10px;margin-left:auto;margin-right:10px;align-self:center;}

  .rcsim2d-onlineDot{width:10px;height:10px;border-radius:50%;display:inline-block;background:#ef4444;box-shadow:0 0 0 2px rgba(0,0,0,.35) inset;}
  .rcsim2d-onlineDot.green{background:#22c55e;}
  .rcsim2d-onlineDot.yellow{background:#f59e0b;}
  .rcsim2d-onlineDot.red{background:#ef4444;}

  .rcsim2d-onlineStatus{
    position:static;
    padding:8px 10px; border-radius:12px;
    background:rgba(0,0,0,.55); color:#fff;
    font:600 12px/1.1 system-ui,Segoe UI,Arial;
    z-index:99999; user-select:none; pointer-events:none;
  }

  /* aligned, no transform */
  .rcsim2d-topToolsSep{width:1px;height:22px;background:rgba(148,163,184,.18);margin:0 2px;}
  .rcsim2d-topTool{background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.18);color:#e2e8f0;border-radius:14px;padding:10px 14px;font-weight:950;font-size:18px;cursor:pointer;line-height:1;min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;}
  .rcsim2d-topTool:hover{background:rgba(2,6,23,.72);}
  .rcsim2d-topTool.active{outline:2px solid rgba(59,130,246,.65);background:rgba(59,130,246,.22);}
  .rcsim2d-topTool.help{font-size:18px;min-width:44px;}
  .rcsim2d-help{position:absolute;top:62px;right:16px;z-index:10;background:rgba(2,6,23,.92);border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:12px 14px;max-width:420px;backdrop-filter: blur(10px);}

  /* Sensor rows: subtle frame so it's clear which select belongs to which sensor */
  .rcsim2d-scfg .rcsim2d-sensorRow{border:1px solid rgba(148,163,184,.12);border-radius:14px;padding:8px 10px;background:rgba(2,6,23,.18);}
  .rcsim2d-helpTitle{font-weight:950;color:#e2e8f0;margin-bottom:8px;}
  .rcsim2d-helpBody{display:flex;flex-direction:column;gap:6px;color:rgba(226,232,240,.82);font-weight:850;font-size:12px;}
  .rcsim2d-pill.bad{background:rgba(220,38,38,.20);border-color:rgba(220,38,38,.45);color:#fecaca;}
  .rcsim2d-help{font-size:12px;line-height:1.35;color:rgba(226,232,240,.78);margin-top:10px;}


  .rcsim2d-row{display:flex;gap:10px;margin:10px 0;}
  .rcsim2d-small{color:#94a3b8;font-weight:800;font-size:11px;line-height:1.25;}
  .rcsim2d-obsHint{color:#94a3b8;font-weight:800;font-size:11px;margin-top:6px;}
  .rcsim2d-miniLabel{color:#cbd5e1;font-weight:900;font-size:11px;margin:8px 0 6px 0;}
  .rcsim2d-inline{display:flex;gap:10px;}
  .rcsim2d-inline .rcsim2d-input{flex:1;}
  .rcsim2d-pill.good{border-color:rgba(34,197,94,.35);}
  .rcsim2d-pill.bad{border-color:rgba(239,68,68,.40);}


  /* ===== iOS Glass redesign overrides (sim 3D/2D UI) ===== */
  :root{
    --rcg-glass: rgba(14,22,40,.42);
    --rcg-glass2: rgba(14,22,40,.28);
    --rcg-stroke: rgba(255,255,255,.14);
    --rcg-stroke2: rgba(255,255,255,.08);
    --rcg-text: rgba(255,255,255,.92);
    --rcg-muted: rgba(255,255,255,.65);
    --rcg-shadow: 0 18px 50px rgba(0,0,0,.55);
    --rcg-shadow2: 0 10px 22px rgba(0,0,0,.35);
    --rcg-r16: 16px;
    --rcg-r20: 20px;
    --rcg-r24: 24px;
    --rcg-blue: #3aa0ff;
    --rcg-red: #ff4b4b;
  }

  .rcsim2d-root{
    background:
      radial-gradient(1200px 700px at 20% 20%, rgba(17,27,58,.95) 0%, transparent 55%),
      radial-gradient(900px 600px at 70% 60%, rgba(11,42,46,.85) 0%, transparent 55%),
      rgba(6,10,22,.98);
  }

  /* Top bar becomes pill glass */
  .rcsim2d-top{
    height:54px;
    border-radius:999px;
    margin:14px 16px 0 16px;
    padding:8px 10px;
    background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
    background-color: var(--rcg-glass);
    border:1px solid var(--rcg-stroke);
    box-shadow: var(--rcg-shadow2);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
  }

  /* Left side panel: keep ORIGINAL sizing/placement, change only visuals */
  .rcsim2d-side{
    border-right:1px solid rgba(148,163,184,.10); /* keep old divider behavior */
    padding:10px 14px; /* original spacing */
    background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
    background-color: var(--rcg-glass);
    border:1px solid var(--rcg-stroke);
    border-radius: var(--rcg-r24);
    box-shadow: var(--rcg-shadow2);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
  }
  /* Main view: rounded "stage" without changing layout sizes */
  .rcsim2d-main{
    background: transparent !important;
    border-radius: var(--rcg-r24);
    overflow: hidden;
  }

  /* Footer: keep original positioning logic; style only */
  .rcsim2d-footer{
    background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
    background-color: var(--rcg-glass);
    border:1px solid var(--rcg-stroke);
    box-shadow: var(--rcg-shadow2);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    border-radius: 999px;
  }

  /* Buttons */
  .rcsim2d-btn{
    border-radius: 18px;
    border: 1px solid var(--rcg-stroke2);
    background: linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04));
    color: var(--rcg-text);
    font-weight: 900;
    box-shadow: 0 10px 22px rgba(0,0,0,.25);
    transition: transform .10s ease, filter .18s ease, background .18s ease;
  }
  .rcsim2d-btn:hover{ filter: brightness(1.06); }
  .rcsim2d-btn:active{ transform: translateY(1px) scale(.99); }

  /* start/stop coloring */
  .rcsim2d-btn.good{
    border-color: rgba(58,160,255,.45);
    box-shadow: 0 16px 32px rgba(58,160,255,.20);
  }
  .rcsim2d-btn.bad{
    border-color: rgba(255,75,75,.45);
    box-shadow: 0 16px 32px rgba(255,75,75,.18);
  }

  /* Pills / chips */
  .rcsim2d-pill, .rcsim2d-topBtn, .rcsim2d-topTool{
    background: rgba(255,255,255,.06);
    border: 1px solid var(--rcg-stroke2);
    color: var(--rcg-text);
    backdrop-filter: blur(12px) saturate(140%);
    -webkit-backdrop-filter: blur(12px) saturate(140%);
  }
  .rcsim2d-pill{ border-radius: 999px; }
  .rcsim2d-topTool{ border-radius: 16px; }
  .rcsim2d-topBtn{ border-radius: 999px; padding: 8px 12px; }

  /* Inputs */
  .rcsim2d-select,.rcsim2d-input{
    border-radius: 16px;
    background: rgba(255,255,255,.06);
    border: 1px solid var(--rcg-stroke2);
    color: var(--rcg-text);
  }
  .rcsim2d-select:focus,.rcsim2d-input:focus{
    outline: none;
    border-color: rgba(58,160,255,.55);
    box-shadow: 0 0 0 3px rgba(58,160,255,.18);
  }

  /* Slider accents (best effort) */
  input[type="range"]{ accent-color: var(--rcg-blue); }

  /* Make help/modal glass */
  .rcsim2d-help, .rcsim2d-modal, .rcsim2d-toast, .rcsim2d-dlg, .rcsim2d-dialog{
    background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03));
    background-color: rgba(14,22,40,.55);
    border: 1px solid var(--rcg-stroke);
    box-shadow: var(--rcg-shadow);
    border-radius: var(--rcg-r24);
    backdrop-filter: blur(16px) saturate(140%);
    -webkit-backdrop-filter: blur(16px) saturate(140%);
  }

  /* NOTE: we intentionally do NOT override layout sizing/placement here.
     The project already has its own responsive rules; we only restyle visuals. */


  /* --- Glass polish tweaks --- */
  .rcsim2d-stickyBottom{
    position: sticky;
    bottom: 0;
    padding-top: 12px;
    margin-top: auto;
    background: linear-gradient(180deg, rgba(12,18,34,0.00), rgba(12,18,34,0.55) 35%, rgba(12,18,34,0.85));
    border-radius: 18px;
  }
  .rcsim2d-runrow{gap:10px; align-items:stretch;}
  .rcsim2d-runrow .rcsim2d-btn{flex:1; height:48px; border-radius:18px;}
  .rcsim2d-panel, .rcsim2d-top, .rcsim2d-pill{
    box-shadow: 0 14px 40px rgba(0,0,0,0.45);
  }
  .rcsim2d-panel{
    border:1px solid rgba(255,255,255,0.14);
    backdrop-filter: blur(14px) saturate(140%);
    -webkit-backdrop-filter: blur(14px) saturate(140%);
  }
  .rcsim2d-btn.primary{
    box-shadow: 0 16px 32px rgba(58,160,255,0.18);
  }
  .rcsim2d-btn.danger{
    box-shadow: 0 16px 32px rgba(255,75,75,0.14);
  }

  .rcsim2d-side select{background:rgba(2,6,23,.55);border:1px solid rgba(148,163,184,.18);color:#e2e8f0;border-radius:14px;padding:10px 12px;}
  .rcsim2d-side option{background:#0b1220;color:#e2e8f0;}
`;

  function ensureStyle(){
    if (document.getElementById('rcsim2d-style')) return;
    const st = document.createElement('style');
    st.id = 'rcsim2d-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ========== Tracks (large prebuilt point sets) ==========
  const TRACKS = {
  "Oval": {
    kind: 'line',
    lineWidth: 16,
    line: [
      [220.0, 0.0],
      [219.99, 1.35],
      [219.96, 2.71],
      [219.91, 4.06],
      [219.84, 5.41],
      [219.74, 6.76],
      [219.63, 8.12],
      [219.5, 9.47],
      [219.34, 10.82],
      [219.17, 12.16],
      [218.97, 13.51],
      [218.76, 14.86],
      [218.52, 16.2],
      [218.27, 17.55],
      [217.99, 18.89],
      [217.69, 20.23],
      [217.37, 21.57],
      [217.04, 22.9],
      [216.68, 24.24],
      [216.3, 25.57],
      [215.9, 26.9],
      [215.48, 28.22],
      [215.04, 29.55],
      [214.59, 30.87],
      [214.11, 32.19],
      [213.61, 33.5],
      [213.09, 34.82],
      [212.55, 36.13],
      [211.99, 37.43],
      [211.41, 38.73],
      [210.81, 40.03],
      [210.2, 41.33],
      [209.56, 42.62],
      [208.9, 43.91],
      [208.22, 45.19],
      [207.53, 46.47],
      [206.81, 47.74],
      [206.08, 49.01],
      [205.32, 50.28],
      [204.55, 51.54],
      [203.76, 52.79],
      [202.95, 54.04],
      [202.12, 55.29],
      [201.27, 56.53],
      [200.4, 57.77],
      [199.51, 59.0],
      [198.61, 60.22],
      [197.68, 61.44],
      [196.74, 62.65],
      [195.78, 63.86],
      [194.8, 65.06],
      [193.8, 66.26],
      [192.79, 67.45],
      [191.75, 68.63],
      [190.7, 69.8],
      [189.63, 70.97],
      [188.55, 72.14],
      [187.44, 73.29],
      [186.32, 74.44],
      [185.18, 75.59],
      [184.02, 76.72],
      [182.85, 77.85],
      [181.66, 78.97],
      [180.45, 80.09],
      [179.23, 81.19],
      [177.98, 82.29],
      [176.73, 83.38],
      [175.45, 84.46],
      [174.16, 85.54],
      [172.85, 86.61],
      [171.53, 87.67],
      [170.19, 88.72],
      [168.83, 89.76],
      [167.46, 90.79],
      [166.07, 91.82],
      [164.67, 92.84],
      [163.25, 93.85],
      [161.82, 94.85],
      [160.37, 95.84],
      [158.91, 96.82],
      [157.43, 97.79],
      [155.94, 98.76],
      [154.43, 99.71],
      [152.91, 100.66],
      [151.37, 101.59],
      [149.82, 102.52],
      [148.26, 103.43],
      [146.68, 104.34],
      [145.09, 105.24],
      [143.48, 106.13],
      [141.87, 107.0],
      [140.23, 107.87],
      [138.59, 108.73],
      [136.93, 109.58],
      [135.26, 110.41],
      [133.58, 111.24],
      [131.88, 112.06],
      [130.17, 112.86],
      [128.45, 113.66],
      [126.72, 114.44],
      [124.97, 115.22],
      [123.22, 115.98],
      [121.45, 116.73],
      [119.67, 117.48],
      [117.88, 118.21],
      [116.08, 118.93],
      [114.27, 119.63],
      [112.45, 120.33],
      [110.61, 121.02],
      [108.77, 121.69],
      [106.92, 122.36],
      [105.05, 123.01],
      [103.18, 123.65],
      [101.3, 124.28],
      [99.4, 124.89],
      [97.5, 125.5],
      [95.59, 126.09],
      [93.67, 126.68],
      [91.74, 127.25],
      [89.81, 127.8],
      [87.86, 128.35],
      [85.91, 128.89],
      [83.94, 129.41],
      [81.98, 129.92],
      [80.0, 130.42],
      [78.01, 130.9],
      [76.02, 131.38],
      [74.02, 131.84],
      [72.02, 132.29],
      [70.0, 132.72],
      [67.98, 133.15],
      [65.96, 133.56],
      [63.93, 133.96],
      [61.89, 134.35],
      [59.84, 134.72],
      [57.8, 135.08],
      [55.74, 135.43],
      [53.68, 135.77],
      [51.62, 136.09],
      [49.55, 136.4],
      [47.47, 136.7],
      [45.39, 136.99],
      [43.31, 137.26],
      [41.22, 137.52],
      [39.13, 137.77],
      [37.04, 138.0],
      [34.94, 138.22],
      [32.84, 138.43],
      [30.74, 138.63],
      [28.63, 138.81],
      [26.52, 138.98],
      [24.41, 139.14],
      [22.29, 139.28],
      [20.17, 139.41],
      [18.06, 139.53],
      [15.94, 139.63],
      [13.81, 139.72],
      [11.69, 139.8],
      [9.57, 139.87],
      [7.44, 139.92],
      [5.32, 139.96],
      [3.19, 139.99],
      [1.06, 140.0],
      [-1.06, 140.0],
      [-3.19, 139.99],
      [-5.32, 139.96],
      [-7.44, 139.92],
      [-9.57, 139.87],
      [-11.69, 139.8],
      [-13.81, 139.72],
      [-15.94, 139.63],
      [-18.06, 139.53],
      [-20.17, 139.41],
      [-22.29, 139.28],
      [-24.41, 139.14],
      [-26.52, 138.98],
      [-28.63, 138.81],
      [-30.74, 138.63],
      [-32.84, 138.43],
      [-34.94, 138.22],
      [-37.04, 138.0],
      [-39.13, 137.77],
      [-41.22, 137.52],
      [-43.31, 137.26],
      [-45.39, 136.99],
      [-47.47, 136.7],
      [-49.55, 136.4],
      [-51.62, 136.09],
      [-53.68, 135.77],
      [-55.74, 135.43],
      [-57.8, 135.08],
      [-59.84, 134.72],
      [-61.89, 134.35],
      [-63.93, 133.96],
      [-65.96, 133.56],
      [-67.98, 133.15],
      [-70.0, 132.72],
      [-72.02, 132.29],
      [-74.02, 131.84],
      [-76.02, 131.38],
      [-78.01, 130.9],
      [-80.0, 130.42],
      [-81.98, 129.92],
      [-83.94, 129.41],
      [-85.91, 128.89],
      [-87.86, 128.35],
      [-89.81, 127.8],
      [-91.74, 127.25],
      [-93.67, 126.68],
      [-95.59, 126.09],
      [-97.5, 125.5],
      [-99.4, 124.89],
      [-101.3, 124.28],
      [-103.18, 123.65],
      [-105.05, 123.01],
      [-106.92, 122.36],
      [-108.77, 121.69],
      [-110.61, 121.02],
      [-112.45, 120.33],
      [-114.27, 119.63],
      [-116.08, 118.93],
      [-117.88, 118.21],
      [-119.67, 117.48],
      [-121.45, 116.73],
      [-123.22, 115.98],
      [-124.97, 115.22],
      [-126.72, 114.44],
      [-128.45, 113.66],
      [-130.17, 112.86],
      [-131.88, 112.06],
      [-133.58, 111.24],
      [-135.26, 110.41],
      [-136.93, 109.58],
      [-138.59, 108.73],
      [-140.23, 107.87],
      [-141.87, 107.0],
      [-143.48, 106.13],
      [-145.09, 105.24],
      [-146.68, 104.34],
      [-148.26, 103.43],
      [-149.82, 102.52],
      [-151.37, 101.59],
      [-152.91, 100.66],
      [-154.43, 99.71],
      [-155.94, 98.76],
      [-157.43, 97.79],
      [-158.91, 96.82],
      [-160.37, 95.84],
      [-161.82, 94.85],
      [-163.25, 93.85],
      [-164.67, 92.84],
      [-166.07, 91.82],
      [-167.46, 90.79],
      [-168.83, 89.76],
      [-170.19, 88.72],
      [-171.53, 87.67],
      [-172.85, 86.61],
      [-174.16, 85.54],
      [-175.45, 84.46],
      [-176.73, 83.38],
      [-177.98, 82.29],
      [-179.23, 81.19],
      [-180.45, 80.09],
      [-181.66, 78.97],
      [-182.85, 77.85],
      [-184.02, 76.72],
      [-185.18, 75.59],
      [-186.32, 74.44],
      [-187.44, 73.29],
      [-188.55, 72.14],
      [-189.63, 70.97],
      [-190.7, 69.8],
      [-191.75, 68.63],
      [-192.79, 67.45],
      [-193.8, 66.26],
      [-194.8, 65.06],
      [-195.78, 63.86],
      [-196.74, 62.65],
      [-197.68, 61.44],
      [-198.61, 60.22],
      [-199.51, 59.0],
      [-200.4, 57.77],
      [-201.27, 56.53],
      [-202.12, 55.29],
      [-202.95, 54.04],
      [-203.76, 52.79],
      [-204.55, 51.54],
      [-205.32, 50.28],
      [-206.08, 49.01],
      [-206.81, 47.74],
      [-207.53, 46.47],
      [-208.22, 45.19],
      [-208.9, 43.91],
      [-209.56, 42.62],
      [-210.2, 41.33],
      [-210.81, 40.03],
      [-211.41, 38.73],
      [-211.99, 37.43],
      [-212.55, 36.13],
      [-213.09, 34.82],
      [-213.61, 33.5],
      [-214.11, 32.19],
      [-214.59, 30.87],
      [-215.04, 29.55],
      [-215.48, 28.22],
      [-215.9, 26.9],
      [-216.3, 25.57],
      [-216.68, 24.24],
      [-217.04, 22.9],
      [-217.37, 21.57],
      [-217.69, 20.23],
      [-217.99, 18.89],
      [-218.27, 17.55],
      [-218.52, 16.2],
      [-218.76, 14.86],
      [-218.97, 13.51],
      [-219.17, 12.16],
      [-219.34, 10.82],
      [-219.5, 9.47],
      [-219.63, 8.12],
      [-219.74, 6.76],
      [-219.84, 5.41],
      [-219.91, 4.06],
      [-219.96, 2.71],
      [-219.99, 1.35],
      [-220.0, 0.0],
      [-219.99, -1.35],
      [-219.96, -2.71],
      [-219.91, -4.06],
      [-219.84, -5.41],
      [-219.74, -6.76],
      [-219.63, -8.12],
      [-219.5, -9.47],
      [-219.34, -10.82],
      [-219.17, -12.16],
      [-218.97, -13.51],
      [-218.76, -14.86],
      [-218.52, -16.2],
      [-218.27, -17.55],
      [-217.99, -18.89],
      [-217.69, -20.23],
      [-217.37, -21.57],
      [-217.04, -22.9],
      [-216.68, -24.24],
      [-216.3, -25.57],
      [-215.9, -26.9],
      [-215.48, -28.22],
      [-215.04, -29.55],
      [-214.59, -30.87],
      [-214.11, -32.19],
      [-213.61, -33.5],
      [-213.09, -34.82],
      [-212.55, -36.13],
      [-211.99, -37.43],
      [-211.41, -38.73],
      [-210.81, -40.03],
      [-210.2, -41.33],
      [-209.56, -42.62],
      [-208.9, -43.91],
      [-208.22, -45.19],
      [-207.53, -46.47],
      [-206.81, -47.74],
      [-206.08, -49.01],
      [-205.32, -50.28],
      [-204.55, -51.54],
      [-203.76, -52.79],
      [-202.95, -54.04],
      [-202.12, -55.29],
      [-201.27, -56.53],
      [-200.4, -57.77],
      [-199.51, -59.0],
      [-198.61, -60.22],
      [-197.68, -61.44],
      [-196.74, -62.65],
      [-195.78, -63.86],
      [-194.8, -65.06],
      [-193.8, -66.26],
      [-192.79, -67.45],
      [-191.75, -68.63],
      [-190.7, -69.8],
      [-189.63, -70.97],
      [-188.55, -72.14],
      [-187.44, -73.29],
      [-186.32, -74.44],
      [-185.18, -75.59],
      [-184.02, -76.72],
      [-182.85, -77.85],
      [-181.66, -78.97],
      [-180.45, -80.09],
      [-179.23, -81.19],
      [-177.98, -82.29],
      [-176.73, -83.38],
      [-175.45, -84.46],
      [-174.16, -85.54],
      [-172.85, -86.61],
      [-171.53, -87.67],
      [-170.19, -88.72],
      [-168.83, -89.76],
      [-167.46, -90.79],
      [-166.07, -91.82],
      [-164.67, -92.84],
      [-163.25, -93.85],
      [-161.82, -94.85],
      [-160.37, -95.84],
      [-158.91, -96.82],
      [-157.43, -97.79],
      [-155.94, -98.76],
      [-154.43, -99.71],
      [-152.91, -100.66],
      [-151.37, -101.59],
      [-149.82, -102.52],
      [-148.26, -103.43],
      [-146.68, -104.34],
      [-145.09, -105.24],
      [-143.48, -106.13],
      [-141.87, -107.0],
      [-140.23, -107.87],
      [-138.59, -108.73],
      [-136.93, -109.58],
      [-135.26, -110.41],
      [-133.58, -111.24],
      [-131.88, -112.06],
      [-130.17, -112.86],
      [-128.45, -113.66],
      [-126.72, -114.44],
      [-124.97, -115.22],
      [-123.22, -115.98],
      [-121.45, -116.73],
      [-119.67, -117.48],
      [-117.88, -118.21],
      [-116.08, -118.93],
      [-114.27, -119.63],
      [-112.45, -120.33],
      [-110.61, -121.02],
      [-108.77, -121.69],
      [-106.92, -122.36],
      [-105.05, -123.01],
      [-103.18, -123.65],
      [-101.3, -124.28],
      [-99.4, -124.89],
      [-97.5, -125.5],
      [-95.59, -126.09],
      [-93.67, -126.68],
      [-91.74, -127.25],
      [-89.81, -127.8],
      [-87.86, -128.35],
      [-85.91, -128.89],
      [-83.94, -129.41],
      [-81.98, -129.92],
      [-80.0, -130.42],
      [-78.01, -130.9],
      [-76.02, -131.38],
      [-74.02, -131.84],
      [-72.02, -132.29],
      [-70.0, -132.72],
      [-67.98, -133.15],
      [-65.96, -133.56],
      [-63.93, -133.96],
      [-61.89, -134.35],
      [-59.84, -134.72],
      [-57.8, -135.08],
      [-55.74, -135.43],
      [-53.68, -135.77],
      [-51.62, -136.09],
      [-49.55, -136.4],
      [-47.47, -136.7],
      [-45.39, -136.99],
      [-43.31, -137.26],
      [-41.22, -137.52],
      [-39.13, -137.77],
      [-37.04, -138.0],
      [-34.94, -138.22],
      [-32.84, -138.43],
      [-30.74, -138.63],
      [-28.63, -138.81],
      [-26.52, -138.98],
      [-24.41, -139.14],
      [-22.29, -139.28],
      [-20.17, -139.41],
      [-18.06, -139.53],
      [-15.94, -139.63],
      [-13.81, -139.72],
      [-11.69, -139.8],
      [-9.57, -139.87],
      [-7.44, -139.92],
      [-5.32, -139.96],
      [-3.19, -139.99],
      [-1.06, -140.0],
      [1.06, -140.0],
      [3.19, -139.99],
      [5.32, -139.96],
      [7.44, -139.92],
      [9.57, -139.87],
      [11.69, -139.8],
      [13.81, -139.72],
      [15.94, -139.63],
      [18.06, -139.53],
      [20.17, -139.41],
      [22.29, -139.28],
      [24.41, -139.14],
      [26.52, -138.98],
      [28.63, -138.81],
      [30.74, -138.63],
      [32.84, -138.43],
      [34.94, -138.22],
      [37.04, -138.0],
      [39.13, -137.77],
      [41.22, -137.52],
      [43.31, -137.26],
      [45.39, -136.99],
      [47.47, -136.7],
      [49.55, -136.4],
      [51.62, -136.09],
      [53.68, -135.77],
      [55.74, -135.43],
      [57.8, -135.08],
      [59.84, -134.72],
      [61.89, -134.35],
      [63.93, -133.96],
      [65.96, -133.56],
      [67.98, -133.15],
      [70.0, -132.72],
      [72.02, -132.29],
      [74.02, -131.84],
      [76.02, -131.38],
      [78.01, -130.9],
      [80.0, -130.42],
      [81.98, -129.92],
      [83.94, -129.41],
      [85.91, -128.89],
      [87.86, -128.35],
      [89.81, -127.8],
      [91.74, -127.25],
      [93.67, -126.68],
      [95.59, -126.09],
      [97.5, -125.5],
      [99.4, -124.89],
      [101.3, -124.28],
      [103.18, -123.65],
      [105.05, -123.01],
      [106.92, -122.36],
      [108.77, -121.69],
      [110.61, -121.02],
      [112.45, -120.33],
      [114.27, -119.63],
      [116.08, -118.93],
      [117.88, -118.21],
      [119.67, -117.48],
      [121.45, -116.73],
      [123.22, -115.98],
      [124.97, -115.22],
      [126.72, -114.44],
      [128.45, -113.66],
      [130.17, -112.86],
      [131.88, -112.06],
      [133.58, -111.24],
      [135.26, -110.41],
      [136.93, -109.58],
      [138.59, -108.73],
      [140.23, -107.87],
      [141.87, -107.0],
      [143.48, -106.13],
      [145.09, -105.24],
      [146.68, -104.34],
      [148.26, -103.43],
      [149.82, -102.52],
      [151.37, -101.59],
      [152.91, -100.66],
      [154.43, -99.71],
      [155.94, -98.76],
      [157.43, -97.79],
      [158.91, -96.82],
      [160.37, -95.84],
      [161.82, -94.85],
      [163.25, -93.85],
      [164.67, -92.84],
      [166.07, -91.82],
      [167.46, -90.79],
      [168.83, -89.76],
      [170.19, -88.72],
      [171.53, -87.67],
      [172.85, -86.61],
      [174.16, -85.54],
      [175.45, -84.46],
      [176.73, -83.38],
      [177.98, -82.29],
      [179.23, -81.19],
      [180.45, -80.09],
      [181.66, -78.97],
      [182.85, -77.85],
      [184.02, -76.72],
      [185.18, -75.59],
      [186.32, -74.44],
      [187.44, -73.29],
      [188.55, -72.14],
      [189.63, -70.97],
      [190.7, -69.8],
      [191.75, -68.63],
      [192.79, -67.45],
      [193.8, -66.26],
      [194.8, -65.06],
      [195.78, -63.86],
      [196.74, -62.65],
      [197.68, -61.44],
      [198.61, -60.22],
      [199.51, -59.0],
      [200.4, -57.77],
      [201.27, -56.53],
      [202.12, -55.29],
      [202.95, -54.04],
      [203.76, -52.79],
      [204.55, -51.54],
      [205.32, -50.28],
      [206.08, -49.01],
      [206.81, -47.74],
      [207.53, -46.47],
      [208.22, -45.19],
      [208.9, -43.91],
      [209.56, -42.62],
      [210.2, -41.33],
      [210.81, -40.03],
      [211.41, -38.73],
      [211.99, -37.43],
      [212.55, -36.13],
      [213.09, -34.82],
      [213.61, -33.5],
      [214.11, -32.19],
      [214.59, -30.87],
      [215.04, -29.55],
      [215.48, -28.22],
      [215.9, -26.9],
      [216.3, -25.57],
      [216.68, -24.24],
      [217.04, -22.9],
      [217.37, -21.57],
      [217.69, -20.23],
      [217.99, -18.89],
      [218.27, -17.55],
      [218.52, -16.2],
      [218.76, -14.86],
      [218.97, -13.51],
      [219.17, -12.16],
      [219.34, -10.82],
      [219.5, -9.47],
      [219.63, -8.12],
      [219.74, -6.76],
      [219.84, -5.41],
      [219.91, -4.06],
      [219.96, -2.71],
      [219.99, -1.35],
    ],
    start: { x:220.0, y:0.0, a:0 },
  }
  };

  // Expose tracks for the 3D overlay editor (custom line drawing, etc.)
  try{ window.RCSim2D_TRACKS = TRACKS; }catch(e){}
  // ===== Line-follow track preset =====
  // Uses the same geometry as Oval, but rendered as: white ground + black line.
  // This makes it ideal for "color sensor" (black/white) line-follow algorithms.
  TRACKS['LineFollow'] = {
    kind: 'line',
    lineWidth: 12,
    // Make the preset MUCH larger (~10x) so it's easier to draw/move the robot around.
    // We scale the geometry itself (not just the camera zoom).
    line: (TRACKS['Oval'] && TRACKS['Oval'].line)
      ? TRACKS['Oval'].line.map(p => [p[0] * 10, p[1] * 10])
      : [],
    start: (TRACKS['Oval'] && TRACKS['Oval'].start)
      ? { x: TRACKS['Oval'].start.x * 10, y: TRACKS['Oval'].start.y * 10, a: TRACKS['Oval'].start.a }
      : {x:0,y:0,a:0},
    theme: {
      bg: '#f7f7f8',
      grid: 'rgba(0,0,0,0.05)',
      roadOuter: 'rgba(0,0,0,0.08)',
      roadMain: 'rgba(0,0,0,0.96)',
    }
  };

  // User-drawn line track (edited in 3D overlay)
  
  // Sumo arena: circular ring, diameter about 6 robot lengths (tunable)
  TRACKS['SumoArena'] = {
    kind: 'sumo',
    // Robot radius is 32px => robot diameter ~= 64px. We want ring diameter = 6 robots => 384px, radius=192.
    arenaRadius: 400,
    ringWidth:  8,
    // Start distance between robot bodies = 2 robots (128px). Center distance = 128 + 64 = 192 => ±96.
    start: { x: -100, y: 0, a: 0 },
    start2:{ x:  100, y: 0, a: Math.PI },
    theme: { bg: '#0b1020' }
  };

TRACKS['CustomLine'] = {
    kind: 'line',
    // User-drawn polyline (open stroke, not auto-closed)
    open: true,
    // A bit wider by default so the line sensor can reliably see it.
    lineWidth: 18,
    // Detection tolerance multiplier for line/color sensors.
    detectMult: 1.8,
    line: [],
    start: {x:0,y:0,a:0},
    theme: {
      bg: '#0b1224',
      grid: 'rgba(255,255,255,0.06)',
      roadOuter: 'rgba(255,255,255,0.10)',
      roadMain: 'rgba(0,0,0,0.96)',
    }
  };
  // Simple polygon-based arena walls
  const ARENA = {
    kind:'arena',
    lineWidth: 18,
    walls: [
      [[-210,-120],[210,-120]],
      [[210,-120],[310,0]],
      [[310,0],[210,120]],
      [[210,120],[-210,120]],
      [[-210,120],[-310,0]],
      [[-310,0],[-210,-120]],
    ],
    start:{x:0,y:0,a:0},
    name:'Arena'
  };

  // Register Arena as track option
  TRACKS['Arena'] = {
    kind:'arena',
    lineWidth:18,
    walls: ARENA.walls,
    start: ARENA.start,
  };

  // Sandbox: empty arena (no walls/line) for free experiments
  TRACKS['Sandbox'] = {
    kind:'arena',
    lineWidth: 0,
    walls: [],
    start: {x:0,y:0,a:0},
  };


  const TRACK_ORDER = ['LineFollow','CustomLine','SumoArena','Sandbox'];

  // ========== Geometry helpers ==========
  function segDist(px,py, ax,ay, bx,by){
    const vx = bx-ax, vy = by-ay;
    const wx = px-ax, wy = py-ay;
    const c1 = vx*wx + vy*wy;
    if (c1<=0) return hypot(px-ax, py-ay);
    const c2 = vx*vx + vy*vy;
    if (c2<=c1) return hypot(px-bx, py-by);
    const t = c1 / c2;
    const cx = ax + t*vx;
    const cy = ay + t*vy;
    return hypot(px-cx, py-cy);
  }

  function raySegIntersect(ox,oy, dx,dy, ax,ay, bx,by){
    // returns t along ray if intersects segment, else null
    const vx = bx-ax, vy = by-ay;
    const det = (-dx*vy + dy*vx);
    if (Math.abs(det) < 1e-9) return null;
    const s = (-vy*(ax-ox) + vx*(ay-oy)) / det;
    const t = ( dx*(ay-oy) - dy*(ax-ox)) / det;
    if (s>=0 && t>=0 && t<=1) return s;
    return null;
  }

  function distToLineTrack(track,x,y){
    const pts = track && track.line;
    if (!pts || pts.length < 2) return 1e9;
    const n = pts.length;
    const open = !!(track && track.open);
    let best = 1e9;
    if (open){
      for (let i=0;i<n-1;i++){
        const a = pts[i];
        const b = pts[i+1];
        const d = segDist(x,y, a[0],a[1], b[0],b[1]);
        if (d<best) best = d;
      }
    } else {
      for (let i=0;i<n;i++){
        const a = pts[i];
        const b = pts[(i+1)%n];
        const d = segDist(x,y, a[0],a[1], b[0],b[1]);
        if (d<best) best = d;
      }
    }
    return best;
  }

  function pointOnLineTrack(track, x,y){
    const pts = track && track.line;
    if (!pts || pts.length < 2) return false;
    const w = (track.lineWidth || 16) * (Number(track.detectMult)||1);
    return distToLineTrack(track,x,y) <= w*0.5;
  }

  function distanceToWalls(track, obstacles, x,y, ang, maxDist){
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = maxDist;
    const checkSeg = (ax,ay,bx,by)=>{
      const t = raySegIntersect(x,y, dx,dy, ax,ay,bx,by);
      if (t!=null && t<best) best = t;
    };
    if (track.kind==='arena' && track.walls){
      for (let i=0;i<track.walls.length;i++){
        const s=track.walls[i];
        checkSeg(s[0][0],s[0][1],s[1][0],s[1][1]);
      }
    }
    
    // obstacles: simple shapes (rect/square/circle)
    if (obstacles && obstacles.length){
      const eps = 1e-9;
      const rayCircle = (cx,cy,r)=>{
        const ox = x - cx;
        const oy = y - cy;
        // If the ray starts inside the obstacle, distance is 0 (not the far exit point).
        if ((ox*ox + oy*oy) <= r*r){
          if (0 < best) best = 0;
          return;
        }
        const b = ox*dx + oy*dy;
        const c = ox*ox + oy*oy - r*r;
        const disc = b*b - c;
        if (disc < 0) return;
        const s = Math.sqrt(disc);
        let t = -b - s;
        if (t < 0) t = -b + s;
        if (t >= 0 && t < best) best = t;
      };
      const rayAABB = (minX,minY,maxX,maxY)=>{
        // If the ray starts inside the obstacle, distance is 0.
        if (x >= minX && x <= maxX && y >= minY && y <= maxY){
          if (0 < best) best = 0;
          return;
        }
        let tmin = -1e18, tmax = 1e18;
        if (Math.abs(dx) < eps){
          if (x < minX || x > maxX) return;
        } else {
          const tx1 = (minX - x)/dx;
          const tx2 = (maxX - x)/dx;
          const a = Math.min(tx1,tx2), b = Math.max(tx1,tx2);
          tmin = Math.max(tmin, a);
          tmax = Math.min(tmax, b);
        }
        if (Math.abs(dy) < eps){
          if (y < minY || y > maxY) return;
        } else {
          const ty1 = (minY - y)/dy;
          const ty2 = (maxY - y)/dy;
          const a = Math.min(ty1,ty2), b = Math.max(ty1,ty2);
          tmin = Math.max(tmin, a);
          tmax = Math.min(tmax, b);
        }
        if (tmax < tmin) return;
        let t = tmin;
        if (t < 0) t = tmax; // if starting inside
        if (t >= 0 && t < best) best = t;
      };
      for (let i=0;i<obstacles.length;i++){
        const o = obstacles[i];
        if (!o) continue;
        if (o.type==='circle'){
          rayCircle(o.x,o.y,o.r);
        } else {
          const w = (o.type==='square') ? (o.s||0) : (o.w||0);
          const h = (o.type==='square') ? (o.s||0) : (o.h||0);
          const hx = w*0.5, hy = h*0.5;
          rayAABB(o.x-hx, o.y-hy, o.x+hx, o.y+hy);
        }
      }
    }

// For line tracks, we can optionally treat outer boundary as none.
    return best;
  }

  // --- Arena helpers (for light sensors detecting edge) ---
  function arenaPoly(track){
    if (track._poly) return track._poly;
    if (!(track && track.walls && track.walls.length)) return null;
    const pts = [];
    // walls are ordered; build polygon by chaining endpoints
    pts.push([track.walls[0][0][0], track.walls[0][0][1]]);
    for (let i=0;i<track.walls.length;i++){
      const p = track.walls[i][1];
      pts.push([p[0], p[1]]);
    }
    // drop duplicate closing point
    if (pts.length>2){
      const a = pts[0], b = pts[pts.length-1];
      if (a[0]===b[0] && a[1]===b[1]) pts.pop();
    }
    track._poly = pts;
    return pts;
  }

  function pointInPolygon(pts, x, y){
    if (!pts || pts.length<3) return true;
    let inside = false;
    for (let i=0, j=pts.length-1; i<pts.length; j=i++){
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      const intersect = ((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/((yj-yi)||1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distPointToSeg(px,py, ax,ay, bx,by){
    const vx = bx-ax, vy = by-ay;
    const wx = px-ax, wy = py-ay;
    const c1 = wx*vx + wy*vy;
    if (c1<=0) return Math.hypot(px-ax, py-ay);
    const c2 = vx*vx + vy*vy;
    if (c2<=c1) return Math.hypot(px-bx, py-by);
    const t = c1 / c2;
    const projx = ax + t*vx, projy = ay + t*vy;
    return Math.hypot(px-projx, py-projy);
  }

  function distToArenaEdge(track, x, y){
    if (!(track && track.kind==='arena' && track.walls)) return Infinity;
    let best = Infinity;
    for (let i=0;i<track.walls.length;i++){
      const s = track.walls[i];
      const d = distPointToSeg(x,y, s[0][0],s[0][1], s[1][0],s[1][1]);
      if (d < best) best = d;
    }
    return best;
  }



  // ========== Simulator core ==========
  const Sim = {
    mounted:false,
    root:null,
    canvas:null,
    ctx:null,
    side:null,
    ui:{},

    // view
    zoom: 0.62,
    targetZoom: 0.62,
    panX: 0,
    panY: 0,
    targetPanX: 0,
    targetPanY: 0,
    dragging:false,
    dragBtn:0,
    lastX:0,
    lastY:0,

    // time
    lastT:0,
    fps:60,
    dt:1/60,
    speedScale: 1.0,

    // world
    trackName:'Sandbox',
    track:null,

    // robot
    bot:{
      x:0,y:0,a:0,
      vx:0,vy:0,wa:0,
      l:0,r:0,
      wheelBase: 60,
      maxSpeed: 240, // px/s
      maxAccel: 520, // px/s^2
      radius: 32,
      wheelRotL:0,
      wheelRotR:0,
    },
    // opponent (for Sumo online / local tests)
    bot2:null,


    // sensors: 4 sensors in bot local coords (px)
    // Default: corners of a square so they don't start stacked in one point.
    sensors:[
      // front-left, front-right, back-left, back-right
      {x: 45, y:-45},
      {x: 45, y: 45},
      {x:-45, y:-45},
      {x:-45, y: 45},
    ],
    editSensors:false,
    sensorHover:-1,
    sensorDrag:-1,

    sensorValues:[0,0,0,0],
    // sensorEnabled/mode are used for per-sensor rendering + optional config from Scratch
    sensorEnabled:[true,true,true,true],
    // User request: when entering the sim, each sensor should default to distance mode.
    sensorModes:['distance','distance','distance','distance'],
    // distance sensor value (0..100). 100 means "nothing detected".
    distValue: 100,
    offTrack:false,
    offTrackAccum:0,
    autoStopOffTrack:true,
    
    // obstacles (simple shapes): global for all tracks
    obstacles:[],
    editObstacles:false,
    obstacleType:'rect',
    obstacleW:140,
    obstacleH:90,
    obstacleR:70,
    obstacleHover:-1,
    obstacleDrag:-1,
    obstacleDragOffX:0,
    obstacleDragOffY:0,

    // simulation speed multiplier
    speedMul:0.65,

    // run state
    running:false,
    paused:true,
    stopFlag:false,

    // direct-manipulation
    botDrag:false,
    botDragOffX:0,
    botDragOffY:0,
    _lmbDown:false,
    _lmbOnBot:false,
    _keyRDown:false,

    // logging minimal
    lastCmd:'L0 R0',

    // 3D editor tool (used by 3D overlay UI)
    // '' | 'obs_rect' | 'obs_square' | 'obs_circle' | 'line_brush' | 'line_eraser'
    uiTool:'',

    // Show 3D pick/hit boxes (debug; helps when it's hard to grab a sensor).
    showHitboxes:false,

    // Persist simulator state between opens (track, drawings, obstacles, bot pose, view)
    _stateLoaded:false,
    _stateKey:'rcsim2d_state_v1',

    open(){
      this.paused = false;
      // Ensure simulator does not auto-run when reopened
      this.running = false;
      if (this.ui && this.ui.btnStop){ this.ui.btnStop.disabled = true; this.ui.btnStop.style.opacity = '.6'; }
      this.paused = false;      if (this.ui && this.ui.btnRun){ this.ui.btnRun.textContent = 'Старт'; }
      ensureStyle();
      if (!this.mounted) this.mount();
      this.root.style.display='block';
      try{ window.isSimulating = true; }catch(e){}
      this.resize();
      // Fit view to track/obstacles after open
      requestAnimationFrame(()=>{ this.resize(); this.fitToTrack(); });
      // Sync targets and resize again after layout
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
      requestAnimationFrame(()=>{ this.resize(); this.targetPanX=this.panX; this.targetPanY=this.panY; });
      setTimeout(()=>{ this.resize(); this.targetPanX=this.panX; this.targetPanY=this.panY; }, 60);
      // Restore last state (track + drawings + obstacles + bot pose) after first mount.
      // If no saved state exists, fall back to default center/reset.
      if (!this._stateLoaded){
        this._stateLoaded = true;
        if (!this._loadState()){
          this.center();
          this.resetBot();
        }
      }
      this.startLoop();
    },
    close(){
      if (!this.root) return;
      // Save state so returning to simulator keeps the same track content.
      this._saveState();
      this.root.style.display='none';
      this.paused = true;
      this.running = false;
      this.stopFlag = true;

      // Also clear global UI flags/classes in case the caller bypasses window.RCSim2D.close().
      try{ window.isSimulating = false; }catch(e){}
      try{ document.documentElement.classList.remove('rcSimOpen'); document.body.classList.remove('rcSimOpen'); }catch(e){}
    },

    _saveState(){
      try{
        const state = {
          v:1,
          trackName: this.trackName,
          // save CustomLine drawing if active
          customLine: (this.trackName==='CustomLine' && this.track && Array.isArray(this.track.line)) ? this.track.line : null,
          obstacles: Array.isArray(this.obstacles) ? this.obstacles : [],
          bot: { x:this.bot.x, y:this.bot.y, a:this.bot.a },
          view: { zoom:this.zoom, panX:this.panX, panY:this.panY },
        };
        localStorage.setItem(this._stateKey, JSON.stringify(state));
      }catch(e){}
    },
    _loadState(){
      try{
        const raw = localStorage.getItem(this._stateKey);
        if (!raw) return false;
        const s = JSON.parse(raw);
        if (!s || s.v!==1) return false;

        if (s.trackName && TRACKS[s.trackName]){
          this.setTrack(String(s.trackName));
        }
        // restore CustomLine points
        if (s.customLine && this.trackName==='CustomLine' && this.track && Array.isArray(s.customLine)){
          this.track.line = s.customLine.map(p=>({x:Number(p.x)||0,y:Number(p.y)||0}));
        }
        if (Array.isArray(s.obstacles)){
          this.obstacles = s.obstacles.map(o=>({
            kind: o.kind||o.type||'rect',
            x: Number(o.x)||0,
            y: Number(o.y)||0,
            w: Number(o.w)||Number(o.width)||140,
            h: Number(o.h)||Number(o.height)||90,
            r: Number(o.r)||Number(o.radius)||70,
            a: Number(o.a)||0,
          }));
        }
        if (s.bot){
          this.bot.x = Number(s.bot.x)||0;
          this.bot.y = Number(s.bot.y)||0;
          this.bot.a = Number(s.bot.a)||0;
        }
        if (s.view){
          this.zoom = Number(s.view.zoom)||this.zoom;
          this.targetZoom = this.zoom;
          this.panX = Number(s.view.panX)||0;
          this.panY = Number(s.view.panY)||0;
          this.targetPanX = this.panX;
          this.targetPanY = this.panY;
        }
        return true;
      }catch(e){
        return false;
      }
    },

    mount(){
      this.mounted = true;

      // load sensor layout
      try{
        const raw = localStorage.getItem('rcsim2d_sensors');
        if (raw){
          const v = JSON.parse(raw);
          if (Array.isArray(v) && v.length===4){
            this.sensors = v.map(p=>({x:Number(p.x)||0,y:Number(p.y)||0}));
          }
        }
      }catch(e){}

      this.root = makeEl('div',{class:'rcsim2d-root',id:'rcsim2dRoot'});
      const shell = makeEl('div',{class:'rcsim2d-shell'});
      const top = makeEl('div',{class:'rcsim2d-top'});
      this.ui.top = top;
      // Title removed (hide "Симулятор" and yellow dot)
      const title = makeEl('div',{class:'rcsim2d-title'},'');
      const btnPanel = makeEl('button',{class:'rcsim2d-topBtn',onclick:()=>{ this.root.classList.toggle('collapsed'); this.resize(); }},'Панель');
      const btnTrack = makeEl('button',{class:'rcsim2d-topBtn',onclick:()=>{
        // Leaving Sumo: always disconnect any ONLINE session (new ws-based online).
        try{ if (window.serverWs) window.serverWs.close(); }catch(e){}
        try{ window.isOnline = false; window.onlineState = 'offline'; window.useServerPhysics = false; window.myPID = null; }catch(e){}
        try{ this.setOnlineStatus && this.setOnlineStatus(''); }catch(e){}
        const last = this._lastNonSumoTrack || (this.trackName!=='SumoArena' ? this.trackName : 'Sandbox');
        this.setTrack(last);
      }},'Траса');

      // "Сумо онлайн" is now a single button that:
      // 1) switches to the sumo arena
      // 2) toggles online connection (connect/disconnect)
      // 3) shows a small dot indicator (red/yellow/green)
      const btnSumoOnline = makeEl('button',{class:'rcsim2d-topBtn',onclick:()=>{
        try{
          const ws = window.serverWs;
          const online = !!(ws && ws.readyState === 1);

          // Toggle: if online -> disconnect
          if (online){
            try{ ws.close(); }catch(e){}
            try{ window.isOnline = false; window.onlineState = 'offline'; window.useServerPhysics = false; window.myPID = null; }catch(e){}
            try{ this.setOnlineStatus && this.setOnlineStatus(''); }catch(e){}
            return;
          }

          // Ensure sumo track selected
          if (this.track && this.track.kind!=='sumo') this._lastNonSumoTrack = this.trackName;
          if (!this.track || this.track.kind!=='sumo') this.setTrack('SumoArena');

          // Need room code before connecting
          const room = (localStorage.getItem('rc_online_room')||'').trim();
          if (!room){
            try{ this.ui && this.ui.roomInput && this.ui.roomInput.focus(); }catch(e){}
            try{ this.setOnlineStatus && this.setOnlineStatus('error'); }catch(e){}
            alert('Введи код кімнати (ROOM) поруч з кнопкою “Сумо онлайн”.');
            return;
          }

          // Connect
          try{ this.setOnlineStatus && this.setOnlineStatus('connecting'); }catch(e){}
          if (window.connectToSumo) window.connectToSumo();
        }catch(e){
          alert('Не вдалося підключитись: ' + (e && e.message ? e.message : e));
        }
      }},[
        'Сумо онлайн',
        (function(){
          const dot = document.createElement('span');
          dot.className = 'rcsim2d-onlineDot red';
          dot.style.marginLeft = '10px';
          dot.style.transform = 'translateY(1px)';
          // store ref for setOnlineStatus()
          this.ui = this.ui || {};
          this.ui._sumoDot = dot;
          return dot;
        }).call(this)
      ]);

      // Room input (PC-friendly): sets localStorage rc_online_room used by connectToSumo()
      const roomInput = makeEl('input', {
        class:'rcsim2d-roomInput',
        type:'text',
        maxlength:'32',
        placeholder:'ROOM',
        value: (localStorage.getItem('rc_online_room')||'').trim()
      });
      roomInput.addEventListener('input', ()=>{
        const v = (roomInput.value||'').trim();
        try{ if (v) localStorage.setItem('rc_online_room', v); else localStorage.removeItem('rc_online_room'); }catch(e){}
        try{ if (window.setSumoRoom) window.setSumoRoom(v); }catch(e){}
      });
      this.ui.roomInput = roomInput;

      const btnExitOnline = makeEl('button',{class:'rcsim2d-topBtn',onclick:()=>{ try{ this.disconnectOnline && this.disconnectOnline(); }catch(e){} }},'Вийти');
      this.ui.btnExitOnline = btnExitOnline;
      btnExitOnline.style.display='none';


      // Top tools: obstacles + line brush/eraser + help.
      const tools = makeEl('div',{class:'rcsim2d-topTools'});
      const mkToolBtn = (key, label)=>{
        const b = makeEl('button',{class:'rcsim2d-topTool',onclick:()=>{
          // Toggle tool
          this.uiTool = (this.uiTool===key) ? '' : key;
          // Keep legacy flags in sync for old code paths
          this.editObstacles = /^obs_/.test(this.uiTool);
          this.obstacleType = this.uiTool==='obs_circle' ? 'circle' : (this.uiTool==='obs_square' ? 'square' : 'rect');
          // Drawing is allowed only on CustomLine track
          if (!/^line_/.test(this.uiTool)){
            // ok
          } else {
            if ((this.trackName||'') !== 'CustomLine'){
              this.setTrack('CustomLine');
            }
          }
          syncActive();
        }}, label);
        b.dataset.tool = key;
        return b;
      };
      const btnRect   = mkToolBtn('obs_rect','▭');
      const btnSquare = mkToolBtn('obs_square','▢');
      const btnCircle = mkToolBtn('obs_circle','◯');
      const btnBrush  = mkToolBtn('line_brush','🖌');
      const btnErase  = mkToolBtn('line_eraser','🩹');

      // Hitbox toggle (does NOT change uiTool; it's a debug overlay).
      const btnHit = makeEl('button',{class:'rcsim2d-topTool',onclick:()=>{
        this.showHitboxes = !this.showHitboxes;
        btnHit.classList.toggle('active', !!this.showHitboxes);
      }},'▣');
      btnHit.title = 'Хітбокси';

      const btnHelp   = makeEl('button',{class:'rcsim2d-topTool help',onclick:()=>{
        helpWrap.style.display = (helpWrap.style.display==='block') ? 'none' : 'block';
      }},'?');
      tools.appendChild(btnRect);
      tools.appendChild(btnSquare);
      tools.appendChild(btnCircle);
      tools.appendChild(makeEl('div',{class:'rcsim2d-topToolsSep'}));
      tools.appendChild(btnBrush);
      tools.appendChild(btnErase);
      tools.appendChild(makeEl('div',{class:'rcsim2d-topToolsSep'}));
      tools.appendChild(btnHit);
      tools.appendChild(btnHelp);

      // Use the public API so external UI (top-bar button state) stays in sync.
      const btnBack = makeEl('button',{class:'rcsim2d-btn',onclick:()=>{
        try{ window.RCSim2D && typeof window.RCSim2D.close==='function' ? window.RCSim2D.close() : this.close(); }
        catch(e){ try{ this.close(); }catch(_e){} }
      }},'Назад');
      top.appendChild(title);
      top.appendChild(btnPanel);
      top.appendChild(btnTrack);
      top.appendChild(btnSumoOnline);
      top.appendChild(this.ui.roomInput);
      top.appendChild(btnExitOnline);
      top.appendChild(tools);
      top.appendChild(btnBack);

      const content = makeEl('div',{class:'rcsim2d-content'});
      this.side = makeEl('div',{class:'rcsim2d-side'});
      const main = makeEl('div',{class:'rcsim2d-main'});

      // canvas
      // tabindex=-1 prevents default focus outline flashes on click in some browsers
      this.canvas = makeEl('canvas',{class:'rcsim2d-canvas',tabindex:'-1'});
      this.ctx = this.canvas.getContext('2d');
      main.appendChild(this.canvas);

      // Keep canvas size in sync with layout (prevents "small/cropped field")
      if (!this._ro && typeof ResizeObserver !== 'undefined'){
        this._ro = new ResizeObserver(()=>this.resize());
        this._ro.observe(main);
        this._ro.observe(shell);
      }
      if (!this._winResizeBound){
        this._winResizeBound = true;
        window.addEventListener('resize', ()=>this.resize(), {passive:true});
      }


      // HUD
      const hud = makeEl('div',{class:'rcsim2d-hud'});
      this.ui.pLR = makeEl('div',{class:'rcsim2d-pill'},'L0 R0');
      // Hide L0/R0 pill (user request). Keep element for compatibility.
      this.ui.pLR.style.display='none';
      hud.appendChild(this.ui.pLR);
      // FPS pill (top-left)
      this.ui.pFps = makeEl('div',{class:'rcsim2d-pill'},['FPS ', makeEl('span',{id:'rcsim2dFpsVal'},'--')]);
      hud.appendChild(this.ui.pFps);
      main.appendChild(hud);

      // Footer buttons moved into side panel (Start/Stop)

      this.buildSideUI();

      // Help popover
      const helpWrap = makeEl('div',{class:'rcsim2d-help',style:'display:none;'});
      helpWrap.appendChild(makeEl('div',{class:'rcsim2d-helpTitle'},'Жести керування'));
      helpWrap.appendChild(makeEl('div',{class:'rcsim2d-helpBody'},[
        makeEl('div',{},'Камера: ЛКМ — обертати · Колесо — зум · ПКМ — панорама'),
        makeEl('div',{},'Перемістити машинку: Пробіл + ЛКМ (почати по машинці) + тягнути'),
        makeEl('div',{},'Повернути машинку: R + ЛКМ (почати по машинці) + тягнути вліво/вправо'),
        makeEl('div',{},'Сенсори: ПКМ+drag — пересувати · Shift+ПКМ+drag — кут променя/поворот'),
        makeEl('div',{},'▣ Хітбокси: показати/сховати зони захвату (допомагає зловити сенсор)'),
        makeEl('div',{},'Перешкоди: вибери ▭/▢/◯ зверху → ЛКМ по полю ставить'),
        makeEl('div',{},'Лінія: 🖌 малює, 🩹 стирає (лише на трасі “Лінія: намалювати”)'),
        makeEl('div',{},'▣ Хітбокси: показати/сховати зони захвату (щоб легше ловити сенсори)'),
      ]));
      helpWrap.addEventListener('pointerdown',(e)=>{ e.stopPropagation(); });
      shell.appendChild(helpWrap);

      function syncActive(){
        // highlight active tool button
        const all = tools.querySelectorAll('.rcsim2d-topTool');
        all.forEach(el=>{
          const k = el.dataset.tool;
          if (!k) return;
          el.classList.toggle('active', k===this.uiTool);
        });
      }
      syncActive = syncActive.bind(this);
      this._syncTopTools = syncActive;

      content.appendChild(this.side);
      content.appendChild(main);

      shell.appendChild(top);
      shell.appendChild(content);
      this.root.appendChild(shell);
      document.documentElement.appendChild(this.root);

      // events
      window.addEventListener('resize', ()=> this.resize());

      this.canvas.addEventListener('contextmenu', (e)=>e.preventDefault());

      this.canvas.addEventListener('wheel', (e)=>{
        e.preventDefault();

        // ПКМ + колесо: швидко перемикати фігуру перешкоди (без окремого меню)
        if (this._rmbDown && this.editObstacles){
          const types = ['rect','square','circle'];
          const dir = (e.deltaY>0) ? 1 : -1;
          const cur = types.indexOf(this.obstacleType||'rect');
          const next = types[(cur<0?0:cur + dir + types.length) % types.length];
          this.obstacleType = next;
          if (typeof this._syncObsInputs === 'function') this._syncObsInputs();
          return;
        }

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX-rect.left;
        const my = e.clientY-rect.top;
        const wpt = this.screenToWorld(mx,my);
        const wx = wpt.x;
        const wy = wpt.y;
        const k = Math.exp(-e.deltaY*0.0012);
        this.targetZoom = clamp(this.targetZoom*k, 0.15, 3.2);
        // zoom around cursor
        const nz = this.targetZoom;
        this.panX = mx - wx*nz;
        this.panY = my - wy*nz;
      }, {passive:false});

      this.canvas.addEventListener('mousedown', (e)=>{
        if (e.button===2) e.preventDefault();

        const btn = e.button;
        if (btn===0) this._lmbDown = true;

        // Track RMB hold (for RMB+wheel obstacle type switch)
        if (btn===2) this._rmbDown = true;

        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX-rect.left;
        const my = e.clientY-rect.top;

        const onlineSumo = (this.isOnlineSumo && this.isOnlineSumo());
        if (onlineSumo){
          // Disallow any interaction that can move/rotate the bot or edit sensors/obstacles.
          this.botDrag = false;
          this._lmbOnBot = false;
          this.sensorDrag = -1;
          this.obstacleDrag = -1;
        }

        if (!onlineSumo){

        // quick RMB delete obstacle when obstacle tool is selected
        if (btn===2 && /^obs_/.test(this.uiTool||'')){
          const w = this.screenToWorld(mx,my);
          const idx = this.pickObstacle(w.x,w.y);
          if (idx>=0){
            this.obstacles.splice(idx,1);
            this.obstacleHover = -1;
            this.obstacleDrag = -1;
            return;
          }
        }

        // obstacle edit (simple shapes)
        if (this.editObstacles){
          const w = this.screenToWorld(mx,my);
          if (btn===2){
            const idx = this.pickObstacle(w.x,w.y);
            if (idx>=0){
              this.obstacles.splice(idx,1);
              this.obstacleHover = -1;
              this.obstacleDrag = -1;
              return;
            }
          }
          if (btn===0){
            const idx = this.pickObstacle(w.x,w.y);
            if (idx>=0){
              this.obstacleDrag = idx;
              const o = this.obstacles[idx];
              this.obstacleDragOffX = w.x - o.x;
              this.obstacleDragOffY = w.y - o.y;
              this.dragging = false;
              return;
            }
            this.addObstacleAt(w.x,w.y);
            this.dragging = false;
            return;
          }
        }

        // sensor edit drag
        if (this.editSensors){
          const w = this.screenToWorld(mx,my);
          const idx = this.pickSensor(w.x,w.y);
          if (idx>=0){
            this.sensorDrag = idx;
            this.dragging = false;
            return;
          }
        }


        // bot direct manipulation (requested):
        // LMB drag on bot => move it; hold R while dragging => rotate it
        if (btn===0 && !this.editObstacles && !this.editSensors){
          const w = this.screenToWorld(mx,my);
          if (this.pickBot(w.x,w.y)){
            this._lmbDown = true;
            this._lmbOnBot = true;
            this.botDrag = true;
            this.botDragOffX = w.x - this.bot.x;
            this.botDragOffY = w.y - this.bot.y;
            this.dragging = false;
            return;
          }
        }

        
        }

        // ONLINE SUMO: disable canvas panning/dragging gestures (anti-cheat)
        if (onlineSumo){
          return;
        }

        // pan with any mouse button
        this.dragging = true;
        this.dragBtn = btn;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      });


      window.addEventListener('mousemove', (e)=>{
        // bot drag/rotate
        if (this.botDrag){
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX-rect.left;
          const my = e.clientY-rect.top;
          const w = this.screenToWorld(mx,my);
          if (this._keyRDown){
            const dx = e.clientX - (this.lastX||e.clientX);
            this.bot.a += dx * 0.01;
          }else{
            this.bot.x = w.x - (this.botDragOffX||0);
            this.bot.y = w.y - (this.botDragOffY||0);
          }
          this.bot.vx = 0;
          this.bot.vy = 0;
          this.bot.wa = 0;
          this.updateHUD();
          this.lastX = e.clientX;
          this.lastY = e.clientY;
          return;
        }

        // obstacle drag
        if (this.obstacleDrag>=0){
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX-rect.left;
          const my = e.clientY-rect.top;
          const w = this.screenToWorld(mx,my);
          const o = this.obstacles[this.obstacleDrag];
          if (o){
            o.x = w.x - (this.obstacleDragOffX||0);
            o.y = w.y - (this.obstacleDragOffY||0);
          }
          return;
        }
        // obstacle hover (only when editing)
        if (this.editObstacles){
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX-rect.left;
          const my = e.clientY-rect.top;
          const w = this.screenToWorld(mx,my);
          this.obstacleHover = this.pickObstacle(w.x,w.y);
        } else {
          this.obstacleHover = -1;
        }

        if (this.sensorDrag>=0){
          const rect = this.canvas.getBoundingClientRect();
          const mx = e.clientX-rect.left;
          const my = e.clientY-rect.top;
          const w = this.screenToWorld(mx,my);
          // convert world to bot-local at current bot pose
          const bx = this.bot.x;
          const by = this.bot.y;
          const ca = Math.cos(-this.bot.a);
          const sa = Math.sin(-this.bot.a);
          const lx = (w.x-bx)*ca - (w.y-by)*sa;
          const ly = (w.x-bx)*sa + (w.y-by)*ca;
          // Allow extending sensors beyond the chassis.
          // The previous limit (-80..80) was too tight and could feel asymmetric
          // relative to the bot sprite. Keep a generous symmetric bound.
          const SENSOR_LIM = Math.max(120, (this.bot?.wheelBase || 60) * 2.4);
          this.sensors[this.sensorDrag].x = clamp(lx, -SENSOR_LIM, SENSOR_LIM);
          this.sensors[this.sensorDrag].y = clamp(ly, -SENSOR_LIM, SENSOR_LIM);
          return;
        }

        if (!this.dragging) return;
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.targetPanX += dx;
        this.targetPanY += dy;
        this.panX = this.targetPanX;
        this.panY = this.targetPanY;
      });

      window.addEventListener('mouseup', ()=>{
        this._rmbDown = false;
        this._lmbDown = false;
        this._lmbOnBot = false;
        this._keyRDown = false;
        this.botDrag = false;
        if (this.obstacleDrag>=0){
          this.obstacleDrag = -1;
        }
        if (this.sensorDrag>=0){
          this.sensorDrag=-1;
          this.saveSensors();
        }
        this.dragging=false;
      });

      // Keyboard
      window.addEventListener('keydown', (e)=>{
        if (this.root.style.display!=='block') return;
        if (e.key==='Escape'){ this.close(); return; }
        if (e.key===' '){ this.togglePause(); e.preventDefault(); return; }

        // Requested: rotate bot with LMB+R (hold LMB on the bot and press/hold R)
        if ((e.key==='r' || e.key==='R') && this._lmbDown && this._lmbOnBot){
          this._keyRDown = true;
          e.preventDefault();
          return;
        }

        // Default: R resets bot
        if (e.key==='r' || e.key==='R'){
          this.resetBot();
          return;
        }

        if (e.key==='o' || e.key==='O'){
          this.editObstacles = !this.editObstacles;
          if (this.ui.chkObs) this.ui.chkObs.checked = this.editObstacles;
        }
      });

      window.addEventListener('keyup', (e)=>{
        if (this.root.style.display!=='block') return;
        if (e.key==='r' || e.key==='R'){ this._keyRDown = false; }
      });

      // Expose bridge functions for generated code
      this.installBridge();

      // initial track
      this.setTrack(this.trackName);
    },

    buildSideUI(){
      const s = this.side;
      s.innerHTML='';

      
      // Track selector removed (single track workflow)

const chkCam = makeEl('label',{class:'rcsim2d-check'},[
        makeEl('input',{type:'checkbox',checked:true}),
        makeEl('span',null,'Камера')
      ]);
      this.ui.chkCam = chkCam.querySelector('input');
      s.appendChild(chkCam);

      const chkRay = makeEl('label',{class:'rcsim2d-check'},[
        makeEl('input',{type:'checkbox',checked:true}),
        makeEl('span',null,'Промінь')
      ]);
      this.ui.chkRay = chkRay.querySelector('input');
      s.appendChild(chkRay);

      // (removed) Sensor editing is always available in 3D; auto-stop removed per request.

      s.appendChild(makeEl('div',{class:'rcsim2d-panelTitle'},'Швидкість'));

      const speedWrap = makeEl('div',{class:'rcsim2d-field'});
      // Keep the multiplier value only (no left label) and avoid empty spacing.
      const speedLabel = makeEl('div',{class:'rcsim2d-label rcsim2d-labelRight'},[
        makeEl('span',{id:'rcsim2dSpeedVal'}, (this.speedMul||1).toFixed(2)+'x')
      ]);
      const speed = makeEl('input',{class:'rcsim2d-input',type:'range',min:'0.15',max:'2.50',step:'0.05',value:String(this.speedMul||1)});
      speed.addEventListener('input', ()=>{
        this.speedMul = clamp(parseFloat(speed.value)||1, 0.05, 5);
        speedLabel.querySelector('#rcsim2dSpeedVal').textContent = (this.speedMul||1).toFixed(2)+'x';
      });
            // Keep refs so we can lock speed in online sumo
      this.ui.speedSlider = speed;
      this.ui.speedValEl = speedLabel.querySelector('#rcsim2dSpeedVal');
speedWrap.appendChild(speedLabel);
      speedWrap.appendChild(speed);
      s.appendChild(speedWrap);




      const row = makeEl('div',{class:'rcsim2d-row rcsim2d-btncol'},[
        makeEl('button',{class:'rcsim2d-btn',onclick:()=>this.resetBot()},'Скинути'),
        makeEl('button',{class:'rcsim2d-btn',onclick:()=>this.center()},'Центр'),      ]);
      s.appendChild(row);



      // FPS readout moved to canvas overlay

      s.appendChild(makeEl('div',{class:'rcsim2d-panelTitle'},'Сенсори'));

      // Values + per-sensor config combined (port mapping shown explicitly)
      const cfgWrap = makeEl('div',{class:'rcsim2d-scfg'});
      this.ui.svals=[];
      this.ui.senEn=[];
      this.ui.senMode=[];
      for (let i=0;i<4;i++){
        const row = makeEl('div',{class:'rcsim2d-sensorRow'});
        const chk = makeEl('label',{class:'rcsim2d-check',style:'margin:0; flex: 0 0 auto;'},[
          makeEl('input',{type:'checkbox',checked:!!this.sensorEnabled[i]}),
          makeEl('span',null,`S${i+1}`)
        ]);
        const v = makeEl('div',{class:'rcsim2d-sval',style:'width:44px; text-align:right;'},'0');
        const modeSel = makeEl('select',{class:'rcsim2d-select',style:'flex:1;'});
        // Short labels so they fit in the side panel and are easier to read.
        modeSel.appendChild(makeEl('option',{value:'color'},'лінія'));
        modeSel.appendChild(makeEl('option',{value:'light'},'світло'));
        modeSel.appendChild(makeEl('option',{value:'distance'},'дистанція'));
        modeSel.value = (this.sensorModes[i]||'color');
        chk.querySelector('input').addEventListener('change', ()=>{
          this.sensorEnabled[i] = !!chk.querySelector('input').checked;
          this.updateSensors();
        });
        modeSel.addEventListener('change', ()=>{
          this.sensorModes[i] = modeSel.value;
          this.updateSensors();
        });
        row.appendChild(chk);
        row.appendChild(v);
        row.appendChild(modeSel);
        cfgWrap.appendChild(row);
        this.ui.svals.push(v);
        this.ui.senEn.push(chk.querySelector('input'));
        this.ui.senMode.push(modeSel);
      }
      s.appendChild(cfgWrap);


      // Export/Import buttons removed

      // Start/Stop: keep ORIGINAL sidebar flow and place at the very bottom (under "Програма")
      const runRow = makeEl('div',{class:'rcsim2d-row rcsim2d-runrow'},[]);
      this.ui.btnRun  = makeEl('button',{class:'rcsim2d-btn primary',onclick:()=>this.onStartPressed()},'Старт');
      this.ui.btnStop = makeEl('button',{class:'rcsim2d-btn danger',onclick:()=>this.onStopPressed()},'Стоп');
      this.ui.btnStop.disabled = true;
      this.ui.btnStop.style.opacity = '.6';
      runRow.appendChild(this.ui.btnRun);
      runRow.appendChild(this.ui.btnStop);
      s.appendChild(runRow);
    },

    exportSnapshot(){
      const snap = {
        track:this.trackName,
        sensors:this.sensors,
        bot:{x:this.bot.x,y:this.bot.y,a:this.bot.a},
        zoom:this.targetZoom,
        panX:this.panX, panY:this.panY,
      };
      const txt = JSON.stringify(snap);
      try{
        navigator.clipboard.writeText(txt);
        alert('Snapshot скопійовано в буфер обміну');
      }catch(e){
        prompt('Скопіюй snapshot:', txt);
      }
    },
    importSnapshotPrompt(){
      const txt = prompt('Встав snapshot JSON');
      if (!txt) return;
      try{
        const s = JSON.parse(txt);
        if (s.track) this.setTrack(s.track);
        if (Array.isArray(s.sensors) && s.sensors.length===4){
          this.sensors = s.sensors.map(p=>({x:Number(p.x)||0, y:Number(p.y)||0}));
          this.saveSensors();
        }
        if (s.bot){
          this.bot.x = Number(s.bot.x)||0;
          this.bot.y = Number(s.bot.y)||0;
          this.bot.a = Number(s.bot.a)||0;
        }
        if (typeof s.zoom==='number') this.targetZoom = clamp(s.zoom,0.15,3.2);
        if (typeof s.panX==='number') this.panX = s.panX;
        if (typeof s.panY==='number') this.panY = s.panY;
      }catch(e){
        alert('Помилка JSON');
      }
    },

    saveSensors(){
      try{
        localStorage.setItem('rcsim2d_sensors', JSON.stringify(this.sensors));
      }catch(e){}
    },

    setTrack(name){
      // Safety: stop any running async program when swapping track.
      this.stopFlag = true;
      window._shouldStop = true;
      this.paused = true;
      this.running = false;
      this.trackName = name;
      this.track = TRACKS[name] || TRACKS['Sandbox'] || TRACKS['LineFollow'];
      this.theme = themeForTrack(name, this.track);
      // In sumo mode, "off track" doesn't apply.
      if (this.track && this.track.kind==='sumo'){
        this.offTrack = false;
        this.offTrackAccum = 0;
        this.autoStopOffTrack = false;
      } else {
        this.autoStopOffTrack = true;
      }
      this.buildSideUI();
      // Fit view after UI/layout settles
      requestAnimationFrame(()=>{ this.resize(); this.fitToTrack(); });
    },

    resetBot(){
      const st = this.track.start || {x:0,y:0,a:0};
      this.bot.x = st.x;
      this.bot.y = st.y;
      this.bot.a = st.a;
      this.bot.vx = 0;
      this.bot.vy = 0;
      this.bot.wa = 0;
      this.bot.l = 0;
      this.bot.r = 0;
      this.bot.wheelRotL = 0;
      this.bot.wheelRotR = 0;
      this.bot.radius = 32;
      this.bot.halfWidth = 34;
      this.bot.halfLength = 44;
      // Sumo: opponent is shown ONLY when a real second player is connected online.
// Do not spawn a fake bot offline (prevents "bot" appearing outside/after leaving online sumo).
if (this.track && this.track.kind==='sumo'){
  this.bot2 = null;
  this.sumoWinner = null;
  this.sumoOut = false;
  this.sumoOut2 = false;
} else {
  this.bot2 = null;
  this.sumoWinner = null;
}
      this.lastCmd = 'L0 R0';
      this.updateHUD();
    },

    center(){
      const rect = this.canvas.getBoundingClientRect();
      const z = this.targetZoom;
      this.panX = rect.width/2 - this.bot.x*z;
      this.panY = rect.height/2 - this.bot.y*z;
      this.targetPanX = this.panX;
      this.targetPanY = this.panY;
    },


    findBot(){ this.center(); },

    fitToTrack(){
      if (!this.canvas) return;
      const tr = this.track || TRACKS['Arena'];
      let minX=1e18, minY=1e18, maxX=-1e18, maxY=-1e18;
      const addPt=(x,y)=>{ if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y; };
      if (tr.kind==='line' && Array.isArray(tr.line)){
        for (let i=0;i<tr.line.length;i++){
          const p=tr.line[i];
          addPt(p[0],p[1]);
        }
      } else if (tr.kind==='arena' && Array.isArray(tr.walls)){
        for (let i=0;i<tr.walls.length;i++){
          const s=tr.walls[i];
          addPt(s[0][0],s[0][1]);
          addPt(s[1][0],s[1][1]);
        }
      } else {
        addPt(-400,-300); addPt(400,300);
      }
      // include obstacles bounds (global)
      if (this.obstacles && this.obstacles.length){
        for (let i=0;i<this.obstacles.length;i++){
          const o=this.obstacles[i];
          if (!o) continue;
          if (o.type==='circle'){
            addPt(o.x-o.r, o.y-o.r);
            addPt(o.x+o.r, o.y+o.r);
          } else {
            const w = (o.type==='square') ? (o.s||0) : (o.w||0);
            const h = (o.type==='square') ? (o.s||0) : (o.h||0);
            addPt(o.x-w*0.5, o.y-h*0.5);
            addPt(o.x+w*0.5, o.y+h*0.5);
          }
        }
      }
      if (!(isFinite(minX)&&isFinite(minY)&&isFinite(maxX)&&isFinite(maxY))){ return; }
      const rect = this.canvas.getBoundingClientRect();
      const pad = 80;
      const availW = Math.max(40, rect.width - pad*2);
      const availH = Math.max(40, rect.height - pad*2);
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const z = clamp(Math.min(availW/spanX, availH/spanY), 0.15, 3.2);
      this.targetZoom = z;
      const cx=(minX+maxX)*0.5;
      const cy=(minY+maxY)*0.5;
      this.panX = rect.width/2 - cx*z;
      this.panY = rect.height/2 - cy*z;
      this.targetPanX=this.panX;
      this.targetPanY=this.panY;
    },



    resize(){
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssW = Math.max(1, Math.floor(rect.width));
      const cssH = Math.max(1, Math.floor(rect.height));
      const w = Math.max(1, Math.floor(cssW*dpr));
      const h = Math.max(1, Math.floor(cssH*dpr));
      this._dpr = dpr;
      this._cssW = cssW;
      this._cssH = cssH;
      if (this.canvas.width!==w || this.canvas.height!==h){
        this.canvas.width = w;
        this.canvas.height = h;
      }
      // keep default transform = dpr scale (so all drawing uses CSS px)
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
    },

    screenToWorld(mx,my){
      const z = this.zoom;
      return {x:(mx - this.panX)/z, y:(my - this.panY)/z};
    },
    screenToWorldX(mx){ return (mx - this.panX)/this.zoom; },
    screenToWorldY(my){ return (my - this.panY)/this.zoom; },

    pickSensor(wx,wy){
      // compute sensors world positions and pick within radius
      const bx=this.bot.x, by=this.bot.y;
      const ca=Math.cos(this.bot.a), sa=Math.sin(this.bot.a);
      let best=-1, bestD=1e9;
      for (let i=0;i<4;i++){
        const p=this.sensors[i];
        const sx=bx + p.x*ca - p.y*sa;
        const sy=by + p.x*sa + p.y*ca;
        const d=hypot(wx-sx, wy-sy);
        if (d<26 && d<bestD){best=i; bestD=d;}
      }
      return best;
    },

    pickBot(wx,wy){
      const d = hypot(wx-this.bot.x, wy-this.bot.y);
      return d < 48;
    },

    togglePause(){
      this.paused = !this.paused;
      if (this.ui && this.ui.btnPause) { this.ui.btnPause.textContent = this.paused ? "Продовжити" : "Пауза"; }
    },

    updateRunBtn(){
      if (!this.ui) return;
      const btn = this.ui.btnRun;
      if (btn){
        btn.textContent = 'Старт';
        if (this.ui && this.ui.btnStop){ this.ui.btnStop.disabled = !this.running; this.ui.btnStop.style.opacity = this.running ? '1' : '.6'; }
      }
    },

        startProgram(){
      // Start only (no Pause). Reuses the same prechecks as toggleRunStop.
      if (this.running) return;
      this.toggleRunStop();
    },

toggleRunStop(){
      // If running -> stop (no reset)
      if (this.running){
        this.stopProgram();
        return;
      }
      // Precheck: compile current workspace code; warn if empty.
      try{
        const Blockly = window.Blockly;
        const ws = window.workspace || window.mainWorkspace || window.__workspace || (Blockly && Blockly.getMainWorkspace ? Blockly.getMainWorkspace() : null);
        let codeTry = '';
        if (Blockly && Blockly.JavaScript && ws){
          try{ codeTry = String(Blockly.JavaScript.workspaceToCode(ws)).trim(); }catch(e){}
        }
        if (!codeTry){
          alert('Нема програми. Додай блок "старт" і команди, тоді натисни Run.');
          return;
        }
      }catch(e){}


      // Start from current pose


      this.paused = false;      this.runProgram();
    },


    stopProgram(){
      try{ if (window.RC && window.RC===window.__RCSIM_LAST_RC) delete window.RC; }catch(e){}

      this.paused = false;      // Stop the running async program WITHOUT resetting the bot pose.
      this.stopFlag = true;
      window._shouldStop = true;
      this.running = false;
      this.paused = true;
      // Zero wheel commands/velocities but keep position/orientation
      this.bot.vx = 0;
      this.bot.vy = 0;
      this.bot.wa = 0;
      this.bot.l = 0;
      this.bot.r = 0;
      this.lastCmd = 'L0 R0';
      this.updateHUD();
    
      this.updateRunBtn();
},

    stepOnce(){
      // one physics tick
      this.paused = true;
      this.tick(1/60);
      this.render();
    },

    async runProgram(){
      this.paused = false;      // This starts an async program from either main workspace or custom-block preview.
      // Requested behavior: Stop/Run must NOT teleport the bot back to start.
      // Use the 'Скинути' button (or press R when not dragging the bot) to reset.
      this.stopFlag = false;
      window._shouldStop = false;

      // Start from current pose, but clear velocities/commands so it doesn't keep drifting.
      this.bot.vx = 0; this.bot.vy = 0; this.bot.wa = 0;
      this.bot.l = 0;  this.bot.r = 0;
      // If the robot was previously considered "off track", allow it to move again after Stop→Start.
      // (Otherwise offTrackAccum can clamp speed to 0 and it feels like Start is broken.)
      this.offTrackAccum = 0;
      this.lastCmd = 'L0 R0';
      this.updateHUD();

      this.running = true;
      if (this.ui && this.ui.btnStop){ this.ui.btnStop.disabled = false; this.ui.btnStop.style.opacity = '1'; }
      this.paused = false;
      this.updateRunBtn();

      try{
          await this.runWorkspaceProgram();
      }catch(e){
        // stop silently if canceled
        if (String(e).includes('RC_STOP')) return;
        console.error(e);
        alert('Помилка виконання програми (дивись консоль)');
      }finally{
        this.running = false;
        // Keep pose; pause after program ends
      }
    },

    async runWorkspaceProgram(){
      const Blockly = window.Blockly;
      if (!Blockly || !Blockly.JavaScript){
        alert('Blockly не знайдено');
        return;
      }
      const ws = window.workspace || window.mainWorkspace || window.__workspace || null;
      if (!ws){
        alert('Workspace не знайдено');
        return;
      }
      let code='';
      try{
        code = Blockly.JavaScript.workspaceToCode(ws);
      }catch(e){
        console.error(e);
        alert('Не вдалось згенерувати код з workspace');
        return;
      }
      if (!code.trim()){
        alert('Порожня програма');
        return;
      }
      await this.evalAsync(code);
    },

    async evalAsync(code){
      // wrap as async function
      const wrapped = `return (async ()=>{
${code}
})();`;
      const fn = new Function('RC', wrapped);
      // Provide minimal RC api
      const RC = {
        wait: (ms)=> this.rcWait(ms),
        stopIfNeeded: ()=> this.stopIfNeeded(),
        getSensors: ()=> this.sensorValues.slice(),
        getDistance: ()=> this.distValue,
        drive: (l,r)=> this.sendDrive(l,r),
      };
      try{
        window.__RCSIM_LAST_RC = RC;
        try{ window.RC = RC; }catch(e){}

        await fn(RC);
      }catch(err){
        if (err && String(err.message||err) === 'RC_STOP'){
        }else{
          console.error('[RCSim] Program error:', err);
          try{ console.error(err && err.stack ? err.stack : ''); }catch(e){}
          throw err;
        }
      }
    },

    stopIfNeeded(){
      if (this.stopFlag || window._shouldStop) throw new Error('RC_STOP');
    },

    rcWait(ms){
      return new Promise((resolve,reject)=>{
        const t0=now();
        const loop=()=>{
          if (this.stopFlag || window._shouldStop) return reject(new Error('RC_STOP'));
          if ((now()-t0)>=ms) return resolve();
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });
    },

    sendDrive(l,r){
      // ВИПРАВЛЕНО: Використовуємо НОВИЙ онлайн модуль (rc_sim2d_online.js)
      // Якщо онлайн через window.serverWs - відправляємо туди
      if (window.isOnline && window.serverWs && window.serverWs.readyState === WebSocket.OPEN){
        try {
          window.serverWs.send(JSON.stringify({
            t: 'input',
            l: Number(l) || 0,
            r: Number(r) || 0
          }));
        } catch(e){
          console.error('Failed to send input to new WebSocket:', e);
        }
        // ВАЖЛИВО: також встановити локально для UI
        this.setDrive(l, r);
        return;
      }
      
      // Старий вбудований онлайн (закоментовано, бо конфліктує)
      // if (this.online && this.online.ws && this.online.ws.readyState===1){
      //   const msg = { t:'input', pid: this.online.pid || 'p1', l:Number(l)||0, r:Number(r)||0 };
      //   try { this.online.ws.send(JSON.stringify(msg)); } catch(e){}
      //   this.lastCmd = `L${Math.round(msg.l)} R${Math.round(msg.r)}`;
      //   return;
      // }
      
      // Офлайн режим
      this.setDrive(l,r);
    },

    setOnlineStatus(state){
      // state: 'connected'|'connecting'|'error'|''
      try{
        const dot = this.ui && this.ui._sumoDot ? this.ui._sumoDot : null;
        if (this.ui && this.ui.btnExitOnline) this.ui.btnExitOnline.style.display='none';
        if (!dot){
          // fallback (should not happen): keep old behavior
          return;
        }
        if (!state){
          dot.classList.remove('green','yellow');
          dot.classList.add('red');
          dot.title = 'OFFLINE';
          return;
        }
        dot.classList.remove('red','green','yellow');
        if (state==='connected') dot.classList.add('green');
        else if (state==='connecting') dot.classList.add('yellow');
        else dot.classList.add('red');
        dot.title = state;
      }catch(e){}
    },

    disconnectOnline(){
      try{
        if (this.online && this.online.ws){
          try{ this.online.ws.close(1000,'bye'); }catch(e){}
        }
      }catch(e){}
      this.online = null;
      // Ensure we don't keep showing an opponent when leaving online mode.
      this.bot2 = null;
      this.sumoWinner = null;
      this.setOnlineStatus && this.setOnlineStatus('');
    },

    connectOnline(room, server){
      this.setOnlineStatus && this.setOnlineStatus('connecting');

      // Normalize room code. Users may paste "room=ABC", full query strings, or just the code.
      let roomCode = (room || 'default').toString().trim();
      // If they pasted a full URL or query string, extract the room param.
      roomCode = roomCode.replace(/^.*[?&]room=/i, '');
      // If they pasted "room=XYZ" directly, strip prefix.
      roomCode = roomCode.replace(/^room=/i, '');
      // Stop at next param delimiter.
      roomCode = roomCode.split('&')[0].trim();
      if (!roomCode) roomCode = 'default';

      const r = encodeURIComponent(roomCode);
      let u = (server||'').toString().trim();

      // server can be: host, https://host, ws(s)://host, or full ws url
      if (!u){
        u = location.origin.replace(/^http/i,'ws') + '/ws?room=' + r;
      } else {
        // if full http(s) url provided, convert to ws(s)
        u = u.replace(/^https?:\/\//i, (m)=> m.toLowerCase()==='https://' ? 'wss://' : 'ws://');

        // if only host provided, build ws url
        if (!/^wss?:\/\//i.test(u)){
          u = u.replace(/^wss?:\/\//i,'').replace(/^https?:\/\//i,'');
          u = u.replace(/\/$/,'');
          const isLocal = /^localhost|^127\.0\.0\.1/i.test(u);
          const proto = isLocal ? 'ws' : 'wss';
          u = proto + '://' + u;
        }

        // ensure path contains /ws
        if (!/\/ws(\?|$)/i.test(u)){
          u = u.replace(/\/$/,'') + '/ws';
        }

        // normalize existing room param if present, otherwise append it
        if (/[?&]room=/i.test(u)){
          // Replace existing room param value (handles "room=room=1" mistakes)
          u = u.replace(/([?&]room=)[^&]*/i, '$1' + r);
        } else {
          u += (u.includes('?') ? '&' : '?') + 'room=' + r;
        }
      }

      // Debug
      try { console.log('[SUMO] ws url:', u); } catch(e){}

      const ws = new WebSocket(u);
      this.online = { ws, room: room||'default', pid:null, fightStarted:false, startPending:false, startPendingUntil:0 };
      ws.addEventListener('open',()=>{ this.setOnlineStatus && this.setOnlineStatus('connected'); });
      ws.addEventListener('error',()=>{ this.setOnlineStatus && this.setOnlineStatus('error'); });

      ws.addEventListener('message',(ev)=>{
  try{
    const d = JSON.parse(ev.data);
    if (d.t==='hello'){
      this.online.pid = d.pid;
      this.online.phase = (typeof d.phase==='string') ? d.phase : (this.online.phase||'lobby');
      this.online.fightStarted = (this.online.phase==='fight');
      this.online.startPending = (this.online.phase==='countdown');
      this.online.startPendingUntil = 0;
      if (d.bots){ this.applyOnlineState(d.bots); }
      // Auto-run local program in online mode
      try{ if (!this.running) this.startProgram(); }catch(e){}

    }
    if (d.t==='countdown'){
      // Server-driven countdown (no control messages)
      this.online.phase = 'countdown';
      this.online.fightStarted = false;
      this.online.startPending = true;
      const ms = Number(d.ms || d.msLeft || 0) || 0;
      this.online.startPendingUntil = Date.now() + Math.max(0, ms);
    }

    if (d.t==='control'){
      if (d.op==='start'){
        if (d.phase==='fight'){
          this.online.fightStarted = true;
          this.online.startPending = false;
          this.online.startPendingUntil = 0;
        } else {
          // pending window
          this.online.startPending = true;
          if (typeof d.msLeft==='number') this.online.startPendingUntil = Date.now() + Math.max(0, d.msLeft);
        }
      }
      if (d.op==='stop'){
        // End match (timeout/manual/opponent_left) and exit online mode
        this.online.fightStarted = false;
        this.online.startPending = false;
        this.online.startPendingUntil = 0;
        try{ this.online.ws.close(1000,'match_end'); }catch(e){}
        this.online.ws = null;
        this.setOnlineStatus && this.setOnlineStatus('error');
      }
    }
    if (d.t==='state'){
      if (typeof d.phase==='string'){ this.online.phase = d.phase; this.online.fightStarted = (d.phase==='fight'); this.online.startPending = (d.phase==='countdown'); if (this.online.startPending && typeof d.msLeft==='number') this.online.startPendingUntil = Date.now()+Math.max(0,d.msLeft); }
      if (d.bots){ this.applyOnlineState(d.bots); }
      // Auto-run local program in online mode
      try{ if (!this.running) this.startProgram(); }catch(e){}

      this.sumoWinner = d.winner ? (d.winner===this.online.pid?'you':'opponent') : null;
    }
  }catch(e){}
});
      ws.addEventListener('close',()=>{ if (this.online){ this.online.ws=null; this.online.fightStarted=false; this.online.startPending=false; this.online.startPendingUntil=0; } this.setOnlineStatus && this.setOnlineStatus('error'); });
    },

    applyOnlineState(bots){
      // bots.{p1,p2} are in sim pixel units already (server-authoritative)
      const pid = (this.online && this.online.pid) || 'p1';
      const me = bots[pid] || bots.p1;
      const opp = (pid==='p1') ? bots.p2 : bots.p1;

      const applyBot = (dst, src)=>{
        if (!dst || !src) return;
        dst.x = Number(src.x)||0;
        dst.y = Number(src.y)||0;
        dst.a = Number(src.a)||0;
        // also sync velocities + last motor commands to avoid local physics fighting server state
        if ('vx' in src) dst.vx = Number(src.vx)||0;
        if ('vy' in src) dst.vy = Number(src.vy)||0;
        if ('wa' in src) dst.wa = Number(src.wa)||0;
        if ('l'  in src) dst.l  = clamp(Number(src.l)||0, -100, 100);
        if ('r'  in src) dst.r  = clamp(Number(src.r)||0, -100, 100);
      };

      if (me){
        applyBot(this.bot, me);
      }
      if (opp){
        if (!this.bot2) this.bot2 = Object.assign({}, this.bot, {x:0,y:0,a:0,vx:0,vy:0,wa:0,l:0,r:0});
        applyBot(this.bot2, opp);
      } else {
        // If opponent is not connected, hide/remove bot2 so we don't show a fake bot.
        this.bot2 = null;
      }
    },


    isOnlineSumoConnected(){
      // ВИМКНЕНО - використовуємо новий онлайн модуль (rc_sim2d_online.js)
      // Старий вбудований WebSocket конфліктував з новим
      return false;
      
      // Старий код (закоментовано):
      // try{
      //   return !!(this.track && this.track.kind==='sumo' && this.online && this.online.ws && this.online.ws.readyState===1);
      // }catch(e){ return false; }
    },

    sendControl(op){
      if (!this.online || !this.online.ws || this.online.ws.readyState!==1) return;
      try{ this.online.ws.send(JSON.stringify({ t:'control', op })); }catch(e){}
    },

    onStartPressed(){
      // In online sumo, "Старт" means: request match start (both must press within 5s)
      if (this.isOnlineSumoConnected()){
        if (!this.online) return;
        this.online.fightStarted = false;
        this.online.startPending = true;
        this.online.startPendingUntil = Date.now() + 5000;
        this.sendControl('start');
        // Start program locally too (server will ignore inputs until fight begins)
        if (!this.running) this.startProgram();
        // Disable Stop button until program actually starts/stop? keep as-is
        return;
      }
      // offline: start program as usual
      this.startProgram();
    },

    onStopPressed(){
      // Stop local program
      this.stopProgram();
      // In online sumo, stop also exits match (kicks both sides)
      if (this.isOnlineSumoConnected()){
        this.sendControl('stop');
        try{ this.online.ws.close(1000,'manual_stop'); }catch(e){}
        this.online.ws = null;
        this.online.fightStarted = false;
        this.online.startPending = false;
        this.setOnlineStatus && this.setOnlineStatus('error');
      }
    },

setDrive(l,r){
      l = clamp(Number(l)||0, -100, 100);
      r = clamp(Number(r)||0, -100, 100);
      this.bot.l = l;
      this.bot.r = r;
      this.lastCmd = `L${l.toFixed(0)} R${r.toFixed(0)}`;
      
      // Відправка команд на сервер (якщо онлайн)
      if (window.sendInputToServer) {
          window.sendInputToServer(l, r);
      }
    },

    // Configure which sensors exist + what they measure.
    // Supported formats:
    //  - Array(4): entries can be 'color' | 'distance' | {enabled,mode} | null/false (disabled)
    //  - Object: {enabled:[...], modes:[...], mask:[...]}
    setSensorsConfig(cfg){
      if (!cfg) return;
      // Ensure arrays exist (older builds may not define them)
      this.sensorEnabled = Array.isArray(this.sensorEnabled) ? this.sensorEnabled : [true,true,true,true];
      // Default to distance mode on first load (user preference).
      this.sensorModes = Array.isArray(this.sensorModes) ? this.sensorModes : ['distance','distance','distance','distance'];
      const applyOne = (i, it)=>{
        let enabled = this.sensorEnabled[i];
        let mode = this.sensorModes[i] || 'color';
        if (it===null || it===false || it===0){
          enabled = false;
        } else if (typeof it==='string'){
          enabled = true;
          mode = (it==='distance') ? 'distance' : 'color';
        } else if (typeof it==='object'){
          if ('enabled' in it) enabled = !!it.enabled;
          const m = it.mode || it.type || it.sensor;
          if (typeof m==='string') mode = (m==='distance') ? 'distance' : 'color';
        }
        this.sensorEnabled[i] = !!enabled;
        this.sensorModes[i] = (mode==='distance') ? 'distance' : 'color';
      };

      if (Array.isArray(cfg)){
        for (let i=0;i<4;i++) applyOne(i, cfg[i]);
      } else if (typeof cfg==='object'){
        if (Array.isArray(cfg.enabled)){
          for (let i=0;i<4;i++) this.sensorEnabled[i] = !!cfg.enabled[i];
        }
        if (Array.isArray(cfg.mask)){
          for (let i=0;i<4;i++) this.sensorEnabled[i] = !!cfg.mask[i];
        }
        if (typeof cfg.mask==='number'){
          for (let i=0;i<4;i++) this.sensorEnabled[i] = ((cfg.mask>>i)&1)===1;
        }
        if (Array.isArray(cfg.modes)){
          for (let i=0;i<4;i++) this.sensorModes[i] = (cfg.modes[i]==='distance') ? 'distance' : 'color';
        }
        if (Array.isArray(cfg.sensors)){
          for (let i=0;i<4;i++) applyOne(i, cfg.sensors[i]);
        }
      }

      // Sync UI if it exists
      if (this.ui && this.ui.senEn){
        for (let i=0;i<4;i++){
          if (this.ui.senEn[i]) this.ui.senEn[i].checked = !!this.sensorEnabled[i];
          if (this.ui.senMode[i]) this.ui.senMode[i].value = (this.sensorModes[i]||'color');
        }
      }
      this.updateSensors();
    },

    installBridge(){
      const self = this;
      // Standard globals used by generator output
      window.sensorData = window.sensorData || [0,0,0,0];
      window.distanceData = window.distanceData || 100;

      // Optional: let the generator configure sensor list/modes
      window.rcsim2d_configSensors = (cfg)=> self.setSensorsConfig(cfg);

      window.recordMove = function(l,r){
        self.setDrive(l,r);
      };

      window.sendDrivePacket = async function(){
        // Accept many signatures: (l,r), (l,r,l2,r2), array, object
        let l=0,r=0;
        if (arguments.length===1 && Array.isArray(arguments[0])){
          l=arguments[0][0]||0; r=arguments[0][1]||0;
        }else if (arguments.length>=2){
          l=arguments[0]; r=arguments[1];
        }else if (arguments.length===1 && typeof arguments[0]==='object'){
          l=arguments[0].l||0; r=arguments[0].r||0;
        }
        self.setDrive(l,r);
        // small yield so "await sendDrivePacket" works
        await self.rcWait(0);
      };

      window.rc_wait = (ms)=> self.rcWait(ms);

      // Expose for debug
      window.RCSim2D_get = ()=> self;
    },

    startLoop(){
      if (this._raf) return;
      this.lastT = now();
      const loop = ()=>{
        if (this.root.style.display!=='block'){
          this._raf = null;
          return;
        }
        const t = now();
        let dt = (t - this.lastT)/1000;
        this.lastT = t;
        dt = clamp(dt, 0, 0.05);

        // FPS (smoothed)
        const instFps = dt > 1e-6 ? (1/dt) : 0;
        this.fps = lerp(this.fps || 60, instFps, 0.10);
        if (!this._lastFpsUi || (t - this._lastFpsUi) > 200){
          this._lastFpsUi = t;
          const el = document.getElementById('rcsim2dFpsVal');
          if (el) el.textContent = Math.round(this.fps||0);
        }
        // Smooth zoom
        const zk = 1 - Math.pow(0.00008, dt*60);
        this.zoom = lerp(this.zoom, this.targetZoom, clamp(zk,0,1));
        const pk = 1 - Math.pow(0.00006, dt*60);
        this.panX = lerp(this.panX, this.targetPanX, clamp(pk,0,1));
        this.panY = lerp(this.panY, this.targetPanY, clamp(pk,0,1));
        this.dtBase = dt;

        // Anti-cheat + fairness: in ONLINE SUMO lock interactive edits and force speed multiplier to 1.00x.
        const _onlineSumo = (this.isOnlineSumo && this.isOnlineSumo());
        if (_onlineSumo){
          // hard-disable any in-canvas bot manipulation
          this.botDrag = false;
          this._lmbOnBot = false;
          this.sensorDrag = -1;
          this.obstacleDrag = -1;

          if (this.speedMul !== 1) this.speedMul = 1;
          if (this.ui && this.ui.speedSlider){
            this.ui.speedSlider.disabled = true;
            this.ui.speedSlider.value = '1';
            this.ui.speedSlider.style.pointerEvents = 'none';
            this.ui.speedSlider.style.opacity = '0.55';
          }
          if (this.ui && this.ui.speedValEl){
            this.ui.speedValEl.textContent = '1.00x';
          }

          // Show 5s READY countdown on the Start button (UX clarity)
          try{
            if (this.ui && this.ui.btnRun){
              if (this.online && this.online.fightStarted){
                this.ui.btnRun.textContent = 'Бій';
              } else if (this.online && this.online.startPending){
                const ms = (this.online.startPendingUntil||0) - Date.now();
                const s = Math.max(0, Math.ceil(ms/1000));
                this.ui.btnRun.textContent = s>0 ? ('Старт ('+s+')') : 'Старт';
              } else {
                this.ui.btnRun.textContent = 'Старт';
              }
            }
          }catch(e){}
        } else {
          if (this.ui && this.ui.speedSlider){
            this.ui.speedSlider.disabled = false;
            this.ui.speedSlider.style.pointerEvents = '';
            this.ui.speedSlider.style.opacity = '';
          }
        }
        const physDt = dt * (this.speedMul||1);
        this.dt = physDt;
        try{
          if (!this.paused){
            this.tick(physDt);
          } else {
            // Keep sensors/HUD live even when paused.
            // Otherwise UI (and Scratch/Blockly reads) stays at 0 until a UI event triggers updateSensors().
            try{ this.updateSensors(); }catch(_e){}
            try{ this.updateHUD(); }catch(_e){}
          }
          this.render();
        }catch(err){
          console.error('RCSim2D loop error:', err);
          // Don't hard-freeze the sim: pause and keep rendering disabled
          this.paused = true;
        }
        this._raf = requestAnimationFrame(loop);
      };
      this._raf = requestAnimationFrame(loop);
    },

    tick(dt){
      // ONLINE SUMO: server-authoritative positions. Do not integrate locally.
      if (this.isOnlineSumoConnected && this.isOnlineSumoConnected()){
        // Update sensors
        this.updateSensors();

        // Camera follow (optional)
        if (this.ui && this.ui.chkCam && this.ui.chkCam.checked){
          const rect = this.canvas.getBoundingClientRect();
          const z = this.zoom;
          const tx = rect.width/2 - this.bot.x*z;
          const ty = rect.height/2 - this.bot.y*z;
          this.panX = lerp(this.panX, tx, clamp(dt*3.6,0,1));
          this.panY = lerp(this.panY, ty, clamp(dt*3.6,0,1));
        }

        // Update HUD
        this.updateHUD();
        return;
      }

      // Convert motor commands to wheel speeds
      const bot = this.bot;
      const maxV = bot.maxSpeed;
      const targVL = (bot.l/100) * maxV;
      const targVR = (bot.r/100) * maxV;
             // Sumo online: no offline 'bot2' AI. Opponent appears only when real second player is connected.



      // Accel limit: adjust vx along heading and angular
      const v = (targVL + targVR)*0.5;
      // If robot is off-track, optionally auto-stop smoothly
      let offScale = 1;
      if (this.offTrack && this.autoStopOffTrack){
        offScale = clamp(1 - (this.offTrackAccum*1.6), 0, 1);
      }
      const v2 = v * offScale;
      const w = (targVR - targVL) / bot.wheelBase;

      // Integrate with smoothing
      bot.vx = lerp(bot.vx, v2*Math.cos(bot.a), clamp(dt*4.0,0,1));
      bot.vy = lerp(bot.vy, v2*Math.sin(bot.a), clamp(dt*4.0,0,1));
      bot.wa = lerp(bot.wa, w, clamp(dt*5.0,0,1));

      // Position update
      // === СЕРВЕРНА vs ЛОКАЛЬНА ФІЗИКА ===
      if (window.useServerPhysics && window.serverBotData) {
          // ОНЛАЙН РЕЖИМ: Беремо позицію з сервера
          bot.x = window.serverBotData.x;
          bot.y = window.serverBotData.y;
          bot.a = window.serverBotData.a;
          
          // Показуємо ворога
          if (window.enemyBotData) {
              if (!this.bot2) {
                  this.bot2 = {x:0,y:0,a:0,vx:0,vy:0,wa:0,l:0,r:0,wheelRotL:0,wheelRotR:0};
              }
              this.bot2.x = window.enemyBotData.x;
              this.bot2.y = window.enemyBotData.y;
              this.bot2.a = window.enemyBotData.a;
          } else {
              // Якщо ворога немає - прибираємо bot2
              this.bot2 = null;
          }
      } else {
          // ОФЛАЙН РЕЖИМ: Локальна фізика
          bot.x += bot.vx * dt;
          bot.y += bot.vy * dt;
          bot.a += bot.wa * dt;
      }
      // Wheels rotation for visuals
      bot.wheelRotL += targVL * dt * 0.03;
      bot.wheelRotR += targVR * dt * 0.03;

      
       // Opponent physics (only in offline mode)
       if (this.bot2 && !window.useServerPhysics){
         const b2 = this.bot2;
         const maxV2 = b2.maxSpeed || maxV;
         const tvl2 = (b2.l/100) * maxV2;
         const tvr2 = (b2.r/100) * maxV2;
         const v2 = (tvl2 + tvr2)*0.5;
         const w2 = (tvr2 - tvl2) / (b2.wheelBase || bot.wheelBase);
         const ca2 = Math.cos(b2.a||0), sa2 = Math.sin(b2.a||0);
         const vx2 = ca2 * v2;
         const vy2 = sa2 * v2;
         b2.vx = lerp(b2.vx||0, vx2, clamp(dt*4.0,0,1));
         b2.vy = lerp(b2.vy||0, vy2, clamp(dt*4.0,0,1));
         b2.wa = lerp(b2.wa||0, w2, clamp(dt*5.0,0,1));
         b2.x += (b2.vx||0) * dt;
         b2.y += (b2.vy||0) * dt;
         b2.a = (b2.a||0) + (b2.wa||0) * dt;
         b2.wheelRotL = (b2.wheelRotL||0) + tvl2 * dt * 0.03;
         b2.wheelRotR = (b2.wheelRotR||0) + tvr2 * dt * 0.03;
       }

      // Sumo: robot-robot collision using rectangular hitboxes (OBB, SAT) — prevents any mesh overlap
      if (this.track && this.track.kind==='sumo' && this.bot2){
        const b1 = this.bot, b2 = this.bot2;

        // Tight hitbox around roof + wheels (tweak if needed)
        const hw1 = (b1.halfWidth  != null) ? b1.halfWidth  : 34; // half width
        const hl1 = (b1.halfLength != null) ? b1.halfLength : 44; // half length
        const hw2 = (b2.halfWidth  != null) ? b2.halfWidth  : 34;
        const hl2 = (b2.halfLength != null) ? b2.halfLength : 44;

        // Oriented rectangle axes
        const a1 = b1.a || 0, a2 = b2.a || 0;
        const c1 = Math.cos(a1), s1 = Math.sin(a1);
        const c2 = Math.cos(a2), s2 = Math.sin(a2);

        // Axes (unit) for each box in world space
        const ax1x = c1, ax1y = s1;      // forward
        const ay1x = -s1, ay1y = c1;     // left
        const ax2x = c2, ax2y = s2;
        const ay2x = -s2, ay2y = c2;

        // Center delta from b1 to b2
        const dx = (b2.x - b1.x), dy = (b2.y - b1.y);

        // Helper: project box onto an axis -> radius
        const abs = Math.abs;
        const projRadius = (hw, hl, axx, axy, bx, by) => {
          // radius = sum of half extents * |dot(axis, boxAxis)|
          return hw*abs(axx*bx + axy*by) + hl*abs(axx*axx + axy*axy); // placeholder
        };

        // We'll do SAT properly using 4 candidate axes: ax1, ay1, ax2, ay2
        function satAxis(axisX, axisY){
          // distance between centers along axis
          const dist = dx*axisX + dy*axisY;

          // b1 projection radius
          const r1 = hw1 * abs(axisX*ay1x + axisY*ay1y) + hl1 * abs(axisX*ax1x + axisY*ax1y);
          // b2 projection radius
          const r2 = hw2 * abs(axisX*ay2x + axisY*ay2y) + hl2 * abs(axisX*ax2x + axisY*ax2y);

          const pen = (r1 + r2) - abs(dist);
          return { pen, dist };
        }

        const axes = [
          {x:ax1x,y:ax1y},
          {x:ay1x,y:ay1y},
          {x:ax2x,y:ax2y},
          {x:ay2x,y:ay2y},
        ];

        let minPen = 1e9;
        let minAxis = null;
        let minDist = 0;

        for (const ax of axes){
          const res = satAxis(ax.x, ax.y);
          if (res.pen <= 0){ minAxis = null; break; } // separated
          if (res.pen < minPen){
            minPen = res.pen;
            minAxis = ax;
            minDist = res.dist;
          }
        }

        if (minAxis){
          // Push out along minimum-penetration axis
          const nx = (minDist >= 0) ? minAxis.x : -minAxis.x;
          const ny = (minDist >= 0) ? minAxis.y : -minAxis.y;

          const maxPush = 5; // clamp per tick to avoid "teleport"
          const push = Math.min(minPen * 0.55, maxPush);

          b1.x -= nx*push; b1.y -= ny*push;
          b2.x += nx*push; b2.y += ny*push;

          // Dampen relative velocity along collision normal (prevents launching)
          const v1n = (b1.vx||0)*nx + (b1.vy||0)*ny;
          const v2n = (b2.vx||0)*nx + (b2.vy||0)*ny;
          const rel = v2n - v1n;
          if (rel < 0){
            const damp = 0.8;
            const impulse = (-rel) * (1-damp);
            b1.vx = (b1.vx||0) - nx*impulse;
            b1.vy = (b1.vy||0) - ny*impulse;
            b2.vx = (b2.vx||0) + nx*impulse;
            b2.vy = (b2.vy||0) + ny*impulse;
          }
        }
      }

// Collision with arena walls (simple)
      if (this.track.kind==='arena' && this.track.walls){
        this.resolveWallCollisions();
      }
      // Collision with user obstacles
      this.resolveObstacleCollisions();


      // Sumo: out-of-ring check using rectangular hitbox corners (tighter than radius)
      if (this.track && this.track.kind==='sumo'){
        const R = this.track.arenaRadius || 120;

        const cornerOut = (b)=>{
          const hw = (b.halfWidth  != null) ? b.halfWidth  : 34;
          const hl = (b.halfLength != null) ? b.halfLength : 44;
          const a = b.a || 0;
          const ca = Math.cos(a), sa = Math.sin(a);
          // forward axis (ca,sa), left axis (-sa,ca)
          const fx = ca, fy = sa;
          const lx = -sa, ly = ca;
          const corners = [
            {x: b.x + fx*hl + lx*hw, y: b.y + fy*hl + ly*hw},
            {x: b.x + fx*hl - lx*hw, y: b.y + fy*hl - ly*hw},
            {x: b.x - fx*hl + lx*hw, y: b.y - fy*hl + ly*hw},
            {x: b.x - fx*hl - lx*hw, y: b.y - fy*hl - ly*hw},
          ];
          for (const p of corners){
            if (Math.hypot(p.x||0, p.y||0) > R) return true;
          }
          return false;
        };

        const out1 = cornerOut(this.bot);
        const out2 = this.bot2 ? cornerOut(this.bot2) : false;

        this.sumoOut = out1;
        this.sumoOut2 = out2;

        if (!this.sumoWinner){
          if (out1 && !out2) this.sumoWinner = 'opponent';
          else if (out2 && !out1) this.sumoWinner = 'you';
          else if (out1 && out2) this.sumoWinner = 'draw';
        }
      }

      // Update sensors
      this.updateSensors();

      // Camera follow (optional)
      if (this.ui.chkCam && this.ui.chkCam.checked){
        const rect = this.canvas.getBoundingClientRect();
        const z = this.zoom;
        const tx = rect.width/2 - bot.x*z;
        const ty = rect.height/2 - bot.y*z;
        this.panX = lerp(this.panX, tx, clamp(dt*3.6,0,1));
        this.panY = lerp(this.panY, ty, clamp(dt*3.6,0,1));
      }

      // Update HUD
      this.updateHUD();
    },

    resolveWallCollisions(){
      const bot=this.bot;
      const r=bot.radius;
      let pushX=0, pushY=0;
      const walls=this.track.walls;
      for (let i=0;i<walls.length;i++){
        const s=walls[i];
        const ax=s[0][0], ay=s[0][1], bx=s[1][0], by=s[1][1];
        // Closest point on segment to bot center
        const vx=bx-ax, vy=by-ay;
        const wx=bot.x-ax, wy=bot.y-ay;
        const c1 = vx*wx + vy*wy;
        const c2 = vx*vx + vy*vy;
        let t = 0;
        if (c2>1e-9) t = clamp(c1/c2, 0, 1);
        const cx=ax+vx*t, cy=ay+vy*t;
        const dx=bot.x-cx, dy=bot.y-cy;
        const d=hypot(dx,dy);
        if (d<r && d>1e-6){
          const pen = (r-d);
          pushX += (dx/d)*pen;
          pushY += (dy/d)*pen;
        }
      }
      if (pushX||pushY){
        bot.x += pushX;
        bot.y += pushY;
        // damp velocities
        bot.vx *= 0.4;
        bot.vy *= 0.4;
      }
    },

    updateSensors(){
      const bot=this.bot;
      const track=this.track;
      // Ensure arrays exist
      this.sensorEnabled = Array.isArray(this.sensorEnabled) ? this.sensorEnabled : [true,true,true,true];
      // IMPORTANT: default sensor mode should NOT flip to "color" after Stop/Start.
      // Users typically expect distance sensors by default, and Blockly blocks read window.sensorData.
      // If sensorModes becomes undefined (e.g. after re-init), fall back to distance.
      this.sensorModes = Array.isArray(this.sensorModes) ? this.sensorModes : ['distance','distance','distance','distance'];

      const ca=Math.cos(bot.a), sa=Math.sin(bot.a);

      const maxSensorDist = 100;

      for (let i=0;i<4;i++){
        const enabled = !!(this.sensorEnabled ? this.sensorEnabled[i] : true);
        const mode = ((this.sensorModes && this.sensorModes[i]) || 'color');
        const p=this.sensors[i];
        // Sensor origin (in world px).
        // Normally it's computed from the robot pose + per-sensor local offset (p.x/p.y).
        // But when the 3D overlay is active, it can provide the *exact* world position of the
        // sensor mount (the point where the red beam starts). If so, use that to keep 2D math
        // perfectly in sync with the visible red ray.
        let sx, sy;
        if (Number.isFinite(p.wx) && Number.isFinite(p.wy)){
          sx = p.wx;
          sy = p.wy;
        } else {
          sx = bot.x + p.x*ca - p.y*sa;
          sy = bot.y + p.x*sa + p.y*ca;
        }

        if (!enabled){
          this.sensorValues[i]=0;
          window.sensorData[i]=0;
          continue;
        }

        if (mode==='distance'){
          // Per-sensor distance: clamp to 0..100, "no hit" -> 100
          // IMPORTANT: include per-sensor yaw (synced from 3D overlay) so rotated sensors work.
          const yaw = Number(p.yaw)||0;
          // Absolute ray angle (world) can be provided by the 3D overlay to match the red beam.
          // Fall back to bot heading + yaw if not present.
          const rayAng = (Number.isFinite(p.rayAngAbs) ? p.rayAngAbs : (bot.a + yaw));
          let d = distanceToWalls(track, this.obstacles, sx, sy, rayAng, maxSensorDist);
          if (!Number.isFinite(d) || d>=maxSensorDist) d = maxSensorDist;
          d = clamp(Math.floor(d), 0, maxSensorDist);
          if (d>maxSensorDist) d = maxSensorDist;
          this.sensorValues[i]=d;
          window.sensorData[i]=d;
        } else {
          // Color/Light sensor: sample a 5x5 footprint under the sensor (stable line reading)
          let val = 0;
          if (track.kind==='line'){
            const pts = track.line;
            if (!pts || pts.length < 2){
              val = 0;
            } else {
              // Use a slightly larger footprint than the visual width so the sensor doesn't miss thin/fast strokes.
              const dm = Math.max(1, Number(track.detectMult)||1);
              const w = (track.lineWidth || 16);
              // Slightly larger footprint so the sensor doesn't miss thin/fast strokes.
              const step = (w*dm)/4; // 5 samples: -2..2 => span ~w*dm
            let on = 0, total = 0;
            for (let iy=-2; iy<=2; iy++){
              for (let ix=-2; ix<=2; ix++){
                const ox = ix*step;
                const oy = iy*step;
                const px = sx + ox*ca - oy*sa;
                const py = sy + ox*sa + oy*ca;
                total++;
                if (pointOnLineTrack(track, px, py)) on++;
              }
            }
            val = Math.round((on/total)*100);
            if (!this._lightSmooth) this._lightSmooth = [0,0,0,0];
            const prev = this._lightSmooth[i] || 0;
            // ✅ ВИПРАВЛЕНО: Зменшено згладжування з 65% на 20% для швидшої реакції
            const sm = prev*0.2 + val*0.8;
            this._lightSmooth[i] = sm;
            val = Math.round(sm);
            }
          } else if (track.kind==='sumo'){
            // Sumo: treat ring border (and outside) as a "black line" for light sensors.
            // Output 0..100 where 100 means near/outside the edge.
            const R = Number(track.arenaRadius)||0;
            const ringW0 = Number(track.ringWidth)||8;
            const ringW = Math.max(18, ringW0*3); // widen a bit for reliable detection
            const step = ringW/4; // 5x5 footprint span ~= ringW
            let on = 0, total = 0;
            for (let iy=-2; iy<=2; iy++){
              for (let ix=-2; ix<=2; ix++){
                const ox = ix*step;
                const oy = iy*step;
                const px = sx + ox*ca - oy*sa;
                const py = sy + ox*sa + oy*ca;
                const cx0 = Number(track.cx || track.centerX || (track.center && track.center.x) || 0) || 0;
                const cy0 = Number(track.cy || track.centerY || (track.center && track.center.y) || 0) || 0;
                const rr = Math.hypot(px - cx0, py - cy0);
                total++;
                if (rr >= (R - ringW)) on++; // border + outside
              }
            }
            val = Math.round((on/total)*100);
            if (!this._lightSmooth) this._lightSmooth = [0,0,0,0];
            const prev = this._lightSmooth[i] || 0;
            // ✅ ВИПРАВЛЕНО: Зменшено згладжування з 65% на 20% для швидшої реакції
            const sm = prev*0.2 + val*0.8;
            this._lightSmooth[i] = sm;
            val = Math.round(sm);
          } else if (track.kind==='arena'){
            // Arena: treat walls edge (and outside) as a "black line" for light sensors.
            // Output 0..100 where 100 means near/outside the edge.
            const edgeW0 = Number(track.lineWidth)||18;
            const edgeW = Math.max(22, edgeW0*2); // widen for reliable detection
            const step = edgeW/4; // 5x5 footprint span ~= edgeW
            const poly = arenaPoly(track);
            let on = 0, total = 0;
            for (let iy=-2; iy<=2; iy++){
              for (let ix=-2; ix<=2; ix++){
                const ox = ix*step;
                const oy = iy*step;
                const px = sx + ox*ca - oy*sa;
                const py = sy + ox*sa + oy*ca;
                total++;
                const inside = pointInPolygon(poly, px, py);
                const dEdge = distToArenaEdge(track, px, py);
                if (!inside || dEdge <= edgeW) on++;
              }
            }
            val = Math.round((on/total)*100);
            if (!this._lightSmooth) this._lightSmooth = [0,0,0,0];
            const prev = this._lightSmooth[i] || 0;
            // ✅ ВИПРАВЛЕНО: Зменшено згладжування з 65% на 20% для швидшої реакції
            const sm = prev*0.2 + val*0.8;
            this._lightSmooth[i] = sm;
            val = Math.round(sm);
          } else {
            val = 0;
          }
          // "light" mode is the inverse of "line/color" (bright surface -> higher value).
          if (mode==='light') val = 100 - clamp(val, 0, 100);
          this.sensorValues[i]=val;
          window.sensorData[i]=val;
        }
      }

      // off-track detection (distance from robot center to line)
      if (track.kind==='line'){
        const pts = track.line;
        if (!pts || pts.length < 2){
          // No usable line yet (e.g. freshly selected CustomLine) -> don't auto-stop.
          this.offTrack = false;
        } else {
          const dLine = distToLineTrack(track, bot.x, bot.y);
          const w = track.lineWidth || 16;
          const dm = Math.max(1, Number(track.detectMult)||1);
          // threshold: half road (with a bit of tolerance) + robot half-size
          const thresh = (w*0.55*dm) + 18;
          this.offTrack = dLine > thresh;
        }
      } else {
        this.offTrack = false;
      }
      this.offTrackAccum = this.offTrack ? (this.offTrackAccum + (this.dt||0)) : 0;

      // legacy/global distance sensor
      // legacy/global distance sensor (kept for UI): 0..100
      const maxDist=maxSensorDist;
      let dist=maxDist;
      dist = distanceToWalls(track, this.obstacles, bot.x,bot.y, bot.a, maxDist);
      if (!Number.isFinite(dist) || dist>=maxDist) dist = maxDist;
      this.distValue = clamp(Math.floor(dist), 0, maxDist);
      window.distanceData = this.distValue;

      if (this.ui.svals){
        for (let i=0;i<4;i++) this.ui.svals[i].textContent = String(this.sensorValues[i]|0);
      }

      // Optional console debug output (enable by setting window.RCSIM_CONSOLE = true)
      try{
        if (window.RCSIM_CONSOLE){
          const tNow = now();
          if (!this._lastConsole || (tNow - this._lastConsole) > 300){
            this._lastConsole = tNow;
            console.log('[RCSim]', {
              x: +(bot.x||0).toFixed(2),
              y: +(bot.y||0).toFixed(2),
              a: +(bot.a||0).toFixed(3),
              L: bot.l|0,
              R: bot.r|0,
              sensors: (this.sensorValues||[]).slice(),
              dist: this.distValue|0,
              track: this.trackName||'',
              tool: this.uiTool||''
            });
          }
        }
      }catch(e){}

    },

    updateHUD(){
      if (this.ui.pLR) this.ui.pLR.textContent = this.lastCmd;
    },

    render(){
      const ctx=this.ctx;
      const w = this._cssW || this.canvas.getBoundingClientRect().width || 1;
      const h = this._cssH || this.canvas.getBoundingClientRect().height || 1;
      // ensure correct DPR transform before clearing
      const dpr = this._dpr || (window.devicePixelRatio||1);
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);

      // background grid (gray)
      this.drawGrid(ctx,w,h);

      // apply view transform
      ctx.save();
      ctx.translate(this.panX, this.panY);
      ctx.scale(this.zoom, this.zoom);

      // draw track
      this.drawTrack(ctx);

      // obstacles
      this.drawObstacles(ctx);

      // distance rays (per-sensor)
      if (this.ui.chkRay && this.ui.chkRay.checked) this.drawSensorRays(ctx);

      // draw bot
      this.drawBot(ctx);

      // draw sensors
      this.drawSensors(ctx);

      ctx.restore();
    },

    drawGrid(ctx,w,h){
      ctx.save();

      // Special background for Sandbox: 3-color soft mosaic (not a flat fill)
      const isSandbox = (this.trackName === 'Sandbox');
      if (isSandbox){
        const tile = 64;
        const c1 = 'rgba(11,18,32,1)';   // deep navy
        const c2 = 'rgba(12,26,38,1)';   // blue-green tint
        const c3 = 'rgba(16,32,58,1)';   // muted indigo
        for (let y=0; y<h; y+=tile){
          for (let x=0; x<w; x+=tile){
            const xi = (x/tile)|0, yi = (y/tile)|0;
            // deterministic hash
            const hsh = ((xi*73856093) ^ (yi*19349663)) >>> 0;
            const k = hsh % 3;
            ctx.fillStyle = (k===0)?c1:(k===1)?c2:c3;
            ctx.fillRect(x,y,tile,tile);
          }
        }
        // subtle grid overlay
        ctx.strokeStyle = 'rgba(226,232,240,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x=0;x<=w;x+=32){ ctx.moveTo(x,0); ctx.lineTo(x,h); }
        for (let y=0;y<=h;y+=32){ ctx.moveTo(0,y); ctx.lineTo(w,y); }
        ctx.stroke();

      } else {
        // Default background (track-dependent)
        ctx.fillStyle = (this.theme && this.theme.bg) ? this.theme.bg : 'rgba(148,163,184,0.03)';
        ctx.fillRect(0,0,w,h);
        const step = 28;
        ctx.strokeStyle = (this.theme && this.theme.grid) ? this.theme.grid : 'rgba(148,163,184,0.10)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x=0;x<=w;x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,h); }
        for (let y=0;y<=h;y+=step){ ctx.moveTo(0,y); ctx.lineTo(w,y); }
        ctx.stroke();
      }

      ctx.restore();
    },

    drawTrack(ctx){
      const tr=this.track;
      ctx.save();
      ctx.lineCap='round';
      ctx.lineJoin='round';

      if (tr.kind==='arena'){
        // arena walls
        ctx.strokeStyle=(this.theme&&this.theme.wallOuter)|| (this.theme&&this.theme.roadOuter) || 'rgba(0,0,0,0.40)';
        ctx.lineWidth=tr.lineWidth+10;
        ctx.beginPath();
        for (const s of tr.walls){
          ctx.moveTo(s[0][0],s[0][1]);
          ctx.lineTo(s[1][0],s[1][1]);
        }
        ctx.stroke();

        ctx.strokeStyle=(this.theme&&this.theme.wallMain)|| 'rgba(15,23,42,0.95)';
        ctx.lineWidth=tr.lineWidth;
        ctx.beginPath();
        for (const s of tr.walls){
          ctx.moveTo(s[0][0],s[0][1]);
          ctx.lineTo(s[1][0],s[1][1]);
        }
        ctx.stroke();
      }else{
        const pts=tr.line;
        if (pts && pts.length>1){
          ctx.strokeStyle=(this.theme&&this.theme.roadOuter)|| 'rgba(0,0,0,0.25)';
          ctx.lineWidth=(tr.lineWidth||16)+10;
          ctx.beginPath();
          ctx.moveTo(pts[0][0],pts[0][1]);
          for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
          ctx.closePath();
          ctx.stroke();

          ctx.strokeStyle=(this.theme&&this.theme.roadMain)|| 'rgba(17,24,39,0.95)';
          ctx.lineWidth=(tr.lineWidth||16);
          ctx.beginPath();
          ctx.moveTo(pts[0][0],pts[0][1]);
          for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
          ctx.closePath();
          ctx.stroke();
        }
      }

      ctx.restore();
    },
    drawObstacles(ctx){
      const obs = this.obstacles;
      if (!obs || !obs.length) return;
      ctx.save();
      for (let i=0;i<obs.length;i++){
        const o = obs[i];
        const hi = (i===this.obstacleHover) || (i===this.obstacleDrag);
        ctx.fillStyle = hi ? 'rgba(245,158,11,0.20)' : 'rgba(167,139,250,0.18)';
        ctx.strokeStyle = hi ? 'rgba(245,158,11,0.88)' : 'rgba(167,139,250,0.72)';
        ctx.lineWidth = hi ? 2.6 : 1.6;
        if (o.type==='circle'){
          ctx.beginPath();
          ctx.arc(o.x,o.y, o.r, 0, Math.PI*2);
          ctx.fill(); ctx.stroke();
        } else {
          const w = (o.type==='square') ? (o.s||0) : (o.w||0);
          const h = (o.type==='square') ? (o.s||0) : (o.h||0);
          ctx.beginPath();
          ctx.rect(o.x - w*0.5, o.y - h*0.5, w, h);
          ctx.fill(); ctx.stroke();
        }
      }
      ctx.restore();
    },

    pickObstacle(wx,wy){
      const obs = this.obstacles;
      if (!obs || !obs.length) return -1;
      for (let i=obs.length-1;i>=0;i--){
        const o = obs[i];
        if (!o) continue;
        if (o.type==='circle'){
          const dx = wx - o.x, dy = wy - o.y;
          if (dx*dx + dy*dy <= (o.r*o.r)) return i;
        } else {
          const w = (o.type==='square') ? (o.s||0) : (o.w||0);
          const h = (o.type==='square') ? (o.s||0) : (o.h||0);
          if (Math.abs(wx-o.x) <= w*0.5 && Math.abs(wy-o.y) <= h*0.5) return i;
        }
      }
      return -1;
    },

    addObstacleAt(wx,wy){
      const t = this.obstacleType || 'rect';
      if (t==='circle'){
        this.obstacles.push({type:'circle', x:wx, y:wy, r: clamp(+this.obstacleR||60, 6, 800)});
      } else if (t==='square'){
        this.obstacles.push({type:'square', x:wx, y:wy, s: clamp(+this.obstacleW||80, 6, 1200)});
      } else {
        this.obstacles.push({type:'rect', x:wx, y:wy, w: clamp(+this.obstacleW||120, 6, 1600), h: clamp(+this.obstacleH||80, 6, 1600)});
      }
    },

    resolveObstacleCollisions(){
      const bot = this.bot;
      const r = bot.radius || 22;
      const obs = this.obstacles;
      if (!obs || !obs.length) return;
      for (let i=0;i<obs.length;i++){
        const o = obs[i];
        if (!o) continue;
        if (o.type==='circle'){
          const dx = bot.x - o.x;
          const dy = bot.y - o.y;
          const rr = r + o.r;
          const d2 = dx*dx + dy*dy;
          if (d2 > 0 && d2 < rr*rr){
            const d = Math.sqrt(d2);
            const k = (rr - d) / d;
            bot.x += dx * k;
            bot.y += dy * k;
          } else if (d2===0){
            bot.x += rr;
          }
        } else {
          const w = (o.type==='square') ? (o.s||0) : (o.w||0);
          const h = (o.type==='square') ? (o.s||0) : (o.h||0);
          const hx = w*0.5, hy = h*0.5;
          const minX = o.x - hx, maxX = o.x + hx;
          const minY = o.y - hy, maxY = o.y + hy;
          const cx = clamp(bot.x, minX, maxX);
          const cy = clamp(bot.y, minY, maxY);
          let dx = bot.x - cx;
          let dy = bot.y - cy;
          let d2 = dx*dx + dy*dy;
          if (d2 < r*r){
            if (d2 === 0){
              // inside: push out along smallest penetration axis
              const penX = Math.min(Math.abs(bot.x-minX), Math.abs(maxX-bot.x));
              const penY = Math.min(Math.abs(bot.y-minY), Math.abs(maxY-bot.y));
              if (penX < penY){
                bot.x += (bot.x < o.x ? -(r+penX) : (r+penX));
              } else {
                bot.y += (bot.y < o.y ? -(r+penY) : (r+penY));
              }
            } else {
              const d = Math.sqrt(d2);
              const k = (r - d) / d;
              bot.x += dx * k;
              bot.y += dy * k;
            }
          }
        }
      }
    },



    drawBot(ctx){
      // 2D car rendering disabled: we render the robot in 3D overlay instead.
      return;
      const b=this.bot;
      ctx.save();
      ctx.translate(b.x,b.y);
      ctx.rotate(b.a);

      // shadow
      ctx.fillStyle='rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(0,8, 26, 18, 0, 0, Math.PI*2);
      ctx.fill();

      // body (gradient)
      const g = ctx.createLinearGradient(-18,-24, 18, 24);
      g.addColorStop(0,'rgba(147,197,253,0.95)');
      g.addColorStop(1,'rgba(59,130,246,0.90)');
      ctx.fillStyle = g;
      ctx.strokeStyle='rgba(2,6,23,0.6)';
      ctx.lineWidth=2.2;
      roundRect(ctx,-18,-24,36,48,10);
      ctx.fill();
      ctx.stroke();

      // wheels
      ctx.fillStyle='rgba(15,23,42,0.95)';
      roundRect(ctx,-22,-20,6,14,3); ctx.fill();
      roundRect(ctx,-22,6,6,14,3); ctx.fill();
      roundRect(ctx,16,-20,6,14,3); ctx.fill();
      roundRect(ctx,16,6,6,14,3); ctx.fill();

      // wheel highlights
      ctx.strokeStyle='rgba(148,163,184,0.25)';
      ctx.lineWidth=1;
      ctx.beginPath();
      ctx.moveTo(-19,-18); ctx.lineTo(-19,-8);
      ctx.moveTo(-19,8); ctx.lineTo(-19,18);
      ctx.moveTo(19,-18); ctx.lineTo(19,-8);
      ctx.moveTo(19,8); ctx.lineTo(19,18);
      ctx.stroke();

      // top hatch
      ctx.fillStyle='rgba(2,6,23,0.35)';
      roundRect(ctx,-8,-6,16,20,7);
      ctx.fill();

      // front marker
      ctx.fillStyle='rgba(245,158,11,0.95)';
      ctx.beginPath();
      ctx.arc(0,-22,3.2,0,Math.PI*2);
      ctx.fill();

      // small LEDs on right
      ctx.fillStyle='rgba(251,191,36,0.95)';
      for (let i=0;i<4;i++){
        ctx.beginPath();
        ctx.arc(14, -10 + i*7, 1.8, 0, Math.PI*2);
        ctx.fill();
      }

      ctx.restore();
    },

    drawSensors(ctx){
      const b=this.bot;
      const ca=Math.cos(b.a), sa=Math.sin(b.a);
      for (let i=0;i<4;i++){
        const p=this.sensors[i];
        const sx=b.x + p.x*ca - p.y*sa;
        const sy=b.y + p.x*sa + p.y*ca;
        const enabled = !!(this.sensorEnabled ? this.sensorEnabled[i] : true);
        const mode = ((this.sensorModes && this.sensorModes[i]) || 'color');
        if (!enabled && !this.editSensors) continue;
        ctx.save();
        ctx.translate(sx,sy);
        // Color sensor: black/white dot. Distance sensor: red dot.
        if (mode==='distance'){
          ctx.fillStyle = enabled ? 'rgba(239,68,68,0.85)' : 'rgba(148,163,184,0.25)';
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        } else {
          const on = (this.sensorValues[i] >= 50);
          ctx.fillStyle = enabled ? (on ? 'rgba(0,0,0,0.95)' : 'rgba(255,255,255,0.95)') : 'rgba(148,163,184,0.25)';
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        }
        ctx.lineWidth=2;
        ctx.beginPath();
        ctx.arc(0,0,5.2,0,Math.PI*2);
        ctx.fill();
        ctx.stroke();
        if (this.editSensors){
          ctx.strokeStyle='rgba(59,130,246,0.8)';
          ctx.lineWidth=2;
          ctx.beginPath();
          ctx.arc(0,0,11,0,Math.PI*2);
          ctx.stroke();
          // label
          ctx.font = '900 11px system-ui, -apple-system, Segoe UI, Roboto, Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(226,232,240,0.95)';
          ctx.strokeStyle = 'rgba(2,6,23,0.85)';
          ctx.lineWidth = 3;
          const t = 'S'+(i+1);
          ctx.strokeText(t, 0, -18);
          ctx.fillText(t, 0, -18);
        }
        ctx.restore();
      }
    },

    drawSensorRays(ctx){
      const b=this.bot;
      const ang = b.a - Math.PI/2;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      const ca=Math.cos(b.a), sa=Math.sin(b.a);
      const maxDist = 100;
      ctx.save();
      ctx.strokeStyle='rgba(239,68,68,0.45)';
      ctx.lineWidth=2.2;
      ctx.fillStyle='rgba(239,68,68,0.55)';
      for (let i=0;i<4;i++){
        const enArr = this.sensorEnabled;
        if (enArr && !enArr[i]) continue;
        const mArr = this.sensorModes;
        if (((mArr && mArr[i])||'color')!=='distance') continue;
        const p=this.sensors[i];
        const ox=b.x + p.x*ca - p.y*sa;
        const oy=b.y + p.x*sa + p.y*ca;
        const d = clamp(Math.floor(this.sensorValues[i]||0), 0, maxDist);
        ctx.beginPath();
        ctx.moveTo(ox,oy);
        ctx.lineTo(ox+dx*d, oy+dy*d);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ox+dx*d, oy+dy*d, 3.6, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    },
  };

  function roundRect(ctx,x,y,w,h,r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.lineTo(x+w-rr,y);
    ctx.quadraticCurveTo(x+w,y, x+w,y+rr);
    ctx.lineTo(x+w,y+h-rr);
    ctx.quadraticCurveTo(x+w,y+h, x+w-rr,y+h);
    ctx.lineTo(x+rr,y+h);
    ctx.quadraticCurveTo(x,y+h, x,y+h-rr);
    ctx.lineTo(x,y+rr);
    ctx.quadraticCurveTo(x,y, x+rr,y);
    ctx.closePath();
  }

  // expose
  window.RCSim2D = {
    open: ()=> Sim.open(),
    close: ()=> Sim.close(),
    configureSensors: (cfg)=> Sim.setSensorsConfig(cfg),
    _sim: Sim,
  };

  console.log("✅ RCSim2D Core loaded");

})();
