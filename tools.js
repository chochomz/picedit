/* 모자이크 · 글자 · 화살표 · 도형
   사진 위에 배치 → 끌어서 이동 / 모서리·끝점으로 크기 조절 → 확정하면 사진에 반영 */
(() => {
  'use strict';

  const E = window.Editor, work = E.work, wctx = work.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const frame = $('frame'), ov = $('ov'), octx = ov.getContext('2d');
  const opts = $('opts'), txt = $('txt'), font = $('font'), sz = $('sz'), szl = $('szl');
  const fillBox = $('fill'), col = $('col'), tip = $('tip'), sw = $('swatches');
  const rows = { text: $('rowText'), shape: $('rowShape'), color: $('rowColor') };
  const toolBtns = document.querySelectorAll('[data-tool]');

  const COLORS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#af52de', '#ffffff', '#000000'];
  const CFG = {
    text:   { label: '크기', min: 8, max: 100, v: 30 },
    arrow:  { label: '굵기', min: 2, max: 30, v: 6 },
    shape:  { label: '굵기', min: 1, max: 30, v: 5 },
    mosaic: { label: '강도', min: 4, max: 50, v: 12 },
  };
  const TIPS = {
    text: '사진을 터치해 글자를 놓고, 끌어서 옮기세요',
    arrow: '사진 위를 끌어서 화살표를 그리세요',
    shape: '사진 위를 끌어서 도형을 그리세요',
    mosaic: '가릴 부분을 끌어서 지정하세요',
  };

  let tool = null, act = null, drag = null, color = COLORS[0], shape = 'rect';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const U = () => Math.max(work.width, work.height) / 500;           // 사진 크기에 맞춘 기준 단위
  const K = () => work.width / (frame.clientWidth || work.width);   // 사진 px / 화면 px
  const box = (o) => ({
    x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2),
    w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1),
  });
  const fontStr = (o) => `${o.size}px "${o.font}", sans-serif`;
  const textBox = (o) => { octx.font = fontStr(o); return { x: o.x1, y: o.y1, w: octx.measureText(o.text).width, h: o.size * 1.2 }; };
  const pt = (e) => {
    const r = ov.getBoundingClientRect();
    return { x: (e.clientX - r.left) * work.width / r.width, y: (e.clientY - r.top) * work.height / r.height };
  };

  /* ----- 그리기 ----- */
  function mosaic(c, b, n) {
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    const w = Math.min(work.width, b.x + b.w) - x, h = Math.min(work.height, b.y + b.h) - y;
    if (w < 2 || h < 2) return;
    const t = document.createElement('canvas');
    t.width = Math.max(1, Math.ceil(w / n));
    t.height = Math.max(1, Math.ceil(h / n));
    t.getContext('2d').drawImage(work, x, y, w, h, 0, 0, t.width, t.height);
    c.imageSmoothingEnabled = false;
    c.drawImage(t, 0, 0, t.width, t.height, x, y, w, h);
  }

  function drawObj(c, o) {
    c.save();
    c.lineWidth = o.lw;
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = c.fillStyle = o.color;
    const b = box(o);
    if (o.type === 'mosaic') {
      mosaic(c, b, o.block);
    } else if (o.type === 'rect') {
      if (o.fill) c.fillRect(b.x, b.y, b.w, b.h); else c.strokeRect(b.x, b.y, b.w, b.h);
    } else if (o.type === 'ellipse') {
      c.beginPath();
      c.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2);
      if (o.fill) c.fill(); else c.stroke();
    } else if (o.type === 'arrow') {
      const a = Math.atan2(o.y2 - o.y1, o.x2 - o.x1), L = o.lw * 3.5 + 10;
      c.beginPath();
      c.moveTo(o.x1, o.y1);
      c.lineTo(o.x2 - Math.cos(a) * L * 0.6, o.y2 - Math.sin(a) * L * 0.6);
      c.stroke();
      c.beginPath();
      c.moveTo(o.x2, o.y2);
      c.lineTo(o.x2 - L * Math.cos(a - 0.45), o.y2 - L * Math.sin(a - 0.45));
      c.lineTo(o.x2 - L * Math.cos(a + 0.45), o.y2 - L * Math.sin(a + 0.45));
      c.closePath();
      c.fill();
    } else {
      c.font = fontStr(o);
      c.textBaseline = 'top';
      c.fillText(o.text, o.x1, o.y1);
    }
    c.restore();
  }

  function handles(o) {
    if (o.type === 'text') return [];
    if (o.type === 'arrow') return [[o.x1, o.y1, 'a'], [o.x2, o.y2, 'b']];
    const b = box(o);
    return [[b.x, b.y, 'nw'], [b.x + b.w, b.y, 'ne'], [b.x, b.y + b.h, 'sw'], [b.x + b.w, b.y + b.h, 'se']];
  }

  function draw() {
    octx.clearRect(0, 0, ov.width, ov.height);
    if (!act) return;
    drawObj(octx, act);
    const k = K();
    octx.save();
    octx.lineWidth = 2 * k;
    octx.strokeStyle = '#6aa9ff';
    octx.setLineDash([6 * k, 4 * k]);
    if (act.type === 'text') {
      const t = textBox(act);
      octx.strokeRect(t.x - 4 * k, t.y - 4 * k, t.w + 8 * k, t.h + 8 * k);
    } else if (act.type !== 'arrow') {
      const b = box(act);
      octx.strokeRect(b.x, b.y, b.w, b.h);
    }
    octx.setLineDash([]);
    octx.fillStyle = '#fff';
    handles(act).forEach(([x, y]) => {
      octx.beginPath();
      octx.arc(x, y, 11 * k, 0, Math.PI * 2);
      octx.fill();
      octx.stroke();
    });
    octx.restore();
  }

  function sync() {
    if (ov.width !== work.width || ov.height !== work.height) {
      ov.width = work.width;
      ov.height = work.height;
    }
    draw();
  }

  /* ----- 옵션 → 개체 반영 ----- */
  function apply(o) {
    const v = +sz.value * U();
    o.color = color;
    o.fill = fillBox.checked;
    if (o.type === 'text') { o.size = v; o.text = txt.value; o.font = font.value; }
    else if (o.type === 'mosaic') o.block = v;
    else o.lw = v;
  }

  function loadFont(o) {
    if (o.type === 'text' && document.fonts) {
      document.fonts.load(fontStr(o), o.text || 'A가').then(draw, () => {});
    }
  }

  const upd = () => { if (act) { apply(act); loadFont(act); draw(); } };

  function showOpts() {
    opts.hidden = !tool;
    if (!tool) return;
    const c = CFG[tool];
    rows.text.hidden = tool !== 'text';
    rows.shape.hidden = tool !== 'shape';
    rows.color.hidden = tool === 'mosaic';
    szl.textContent = c.label;
    sz.min = c.min;
    sz.max = c.max;
    sz.value = c.v;
    tip.textContent = TIPS[tool];
  }

  function setTool(t) {
    if (act && t !== tool) commit();
    tool = t;
    frame.classList.toggle('tooling', !!t);
    toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    showOpts();
    draw();
  }

  function commit() {
    if (!act) return;
    const o = act;
    act = null;
    if (o.type !== 'text' || o.text.trim()) {
      E.pushHistory();
      drawObj(wctx, o);
    }
    draw();
  }

  /* ----- 터치 조작 ----- */
  function hit(o, p, k) {
    const pad = 14 * k;
    if (o.type === 'text') {
      const t = textBox(o);
      return p.x > t.x - pad && p.x < t.x + t.w + pad && p.y > t.y - pad && p.y < t.y + t.h + pad;
    }
    if (o.type === 'arrow') {
      const dx = o.x2 - o.x1, dy = o.y2 - o.y1, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - o.x1) * dx + (p.y - o.y1) * dy) / l2, 0, 1);
      return Math.hypot(p.x - (o.x1 + t * dx), p.y - (o.y1 + t * dy)) < pad + o.lw;
    }
    const b = box(o);
    return p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
  }

  ov.addEventListener('pointerdown', (e) => {
    if (!tool) return;
    const p = pt(e), k = K();
    const h = act && handles(act).find(([x, y]) => Math.hypot(x - p.x, y - p.y) < 26 * k);
    if (h) {
      if (act.type !== 'arrow') {
        const b = box(act);
        Object.assign(act, { x1: b.x, y1: b.y, x2: b.x + b.w, y2: b.y + b.h });
      }
      drag = { m: h[2] };
    } else if (act && hit(act, p, k)) {
      drag = { m: 'move', p, s: { ...act } };
    } else {
      commit();
      const o = { type: tool === 'shape' ? shape : tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      apply(o);
      act = o;
      loadFont(o);
      drag = tool === 'text' ? { m: 'move', p, s: { ...o } } : { m: tool === 'arrow' ? 'b' : 'se' };
    }
    ov.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  });

  ov.addEventListener('pointermove', (e) => {
    if (!drag || !act) return;
    const p = pt(e), o = act, m = drag.m;
    if (m === 'move') {
      const dx = p.x - drag.p.x, dy = p.y - drag.p.y, s = drag.s;
      o.x1 = s.x1 + dx; o.y1 = s.y1 + dy; o.x2 = s.x2 + dx; o.y2 = s.y2 + dy;
    } else {
      const x = clamp(p.x, 0, work.width), y = clamp(p.y, 0, work.height);
      if (m === 'a') { o.x1 = x; o.y1 = y; }
      else if (m === 'b') { o.x2 = x; o.y2 = y; }
      else {
        if (m[1] === 'w') o.x1 = x; else o.x2 = x;
        if (m[0] === 'n') o.y1 = y; else o.y2 = y;
      }
    }
    draw();
  });

  const end = () => {
    if (!drag) return;
    drag = null;
    if (act && act.type !== 'text') { // 실수로 톡 건드린 정도의 크기는 취소
      const b = box(act), k = K();
      const small = act.type === 'arrow' ? Math.hypot(b.w, b.h) < 12 * k : (b.w < 12 * k || b.h < 12 * k);
      if (small) act = null;
    }
    draw();
  };
  ov.addEventListener('pointerup', end);
  ov.addEventListener('pointercancel', end);

  /* ----- 옵션 이벤트 ----- */
  COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'sw' + (i ? '' : ' on');
    b.style.background = c;
    b.setAttribute('aria-label', c);
    b.addEventListener('click', () => pick(c));
    sw.appendChild(b);
  });
  function pick(c) {
    color = c;
    col.value = c;
    sw.querySelectorAll('.sw').forEach((b, i) => b.classList.toggle('on', COLORS[i] === c));
    upd();
  }
  col.addEventListener('input', () => pick(col.value));

  rows.shape.querySelectorAll('[data-shape]').forEach((b) => b.addEventListener('click', () => {
    shape = b.dataset.shape;
    rows.shape.querySelectorAll('[data-shape]').forEach((x) => x.classList.toggle('on', x === b));
    if (act && (act.type === 'rect' || act.type === 'ellipse')) act.type = shape;
    draw();
  }));

  txt.addEventListener('input', upd);
  font.addEventListener('change', upd);
  fillBox.addEventListener('change', upd);
  sz.addEventListener('input', () => { if (tool) CFG[tool].v = +sz.value; upd(); });

  toolBtns.forEach((b) => b.addEventListener('click', () => setTool(tool === b.dataset.tool ? null : b.dataset.tool)));
  $('optDone').addEventListener('click', commit);
  $('optDel').addEventListener('click', () => { act = null; draw(); });

  /* app.js 에서 호출 */
  window.Tools = {
    sync,
    stop() { commit(); setTool(null); },
    cancel() { if (!act) return false; act = null; draw(); return true; },
    reset() {
      act = null; drag = null;
      setTool(null);
      toolBtns.forEach((b) => { b.disabled = false; });
      sync();
    },
  };
})();
