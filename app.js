/* 사진 편집 웹앱 - 1단계: 불러오기 / 자르기 / 회전 / 되돌리기 / 1MB 이내 저장·공유
   (2~4단계에서 모자이크, 글쓰기, 화살표·도형을 이 구조 위에 추가) */
(() => {
  'use strict';

  /* ===== 설정 ===== */
  const MAX_SIDE = 2048;        // 불러올 때 긴 변의 최대 픽셀 (아이폰 메모리 보호)
  const LIMIT_BYTES = 1000000;  // 저장 파일 크기 상한: 1MB 미만
  const HISTORY_MAX = 6;        // 되돌리기 최대 단계
  const MIN_CROP = 48;          // 자르기 영역 최소 크기(화면 px)
  const STAGE_PAD = 28;         // 화면 가장자리 여백(자르기 손잡이 공간)

  /* ===== 요소 ===== */
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), emptyBox = $('empty'), frame = $('frame');
  const work = $('work'), ctx = work.getContext('2d');
  const dimClip = $('dimClip'), dim = $('dim'), cropBox = $('cropBox');
  const tools = $('tools'), cropBar = $('cropBar');
  const fileInput = $('file');
  const btn = {
    open: $('btnOpen'), rotL: $('btnRotL'), rotR: $('btnRotR'),
    crop: $('btnCrop'), undo: $('btnUndo'), save: $('btnSave'),
  };
  const chips = Array.from(cropBar.querySelectorAll('.chip'));
  const sheet = $('sheet'), preview = $('preview'), info = $('info'), hint = $('hint');
  const shareBtn = $('shareBtn'), dlLink = $('dlLink'), closeBtn = $('closeBtn');

  /* ===== 상태 ===== */
  let hasImage = false;
  let history = [];
  let cropping = false;
  let crop = { x: 0, y: 0, w: 0, h: 0 };  // 화면 px 기준, frame 안의 좌표
  let ratio = 0;                          // 0 = 자유, 그 외 가로/세로 비율
  let frameW = 0, frameH = 0;
  let drag = null;
  let exported = null;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const T = (f) => (window.Tools && window.Tools[f] ? window.Tools[f]() : false); // tools.js 연결

  /* ===== 화면 갱신 ===== */
  function updateUI() {
    emptyBox.hidden = hasImage;
    frame.hidden = !hasImage;
    [btn.rotL, btn.rotR, btn.crop, btn.save].forEach((b) => { b.disabled = !hasImage; });
    btn.undo.disabled = history.length === 0;
  }

  // 편집 중인 사진을 화면에 꽉 차게 맞춤
  function layout() {
    if (!hasImage) return;
    const sw = stage.clientWidth - STAGE_PAD * 2;
    const sh = stage.clientHeight - STAGE_PAD * 2;
    if (sw <= 0 || sh <= 0) return;
    const s = Math.min(sw / work.width, sh / work.height);
    const dw = Math.max(1, Math.floor(work.width * s));
    const dh = Math.max(1, Math.floor(work.height * s));
    if (cropping && frameW && frameH) {
      const rx = dw / frameW, ry = dh / frameH;
      crop.x *= rx; crop.w *= rx; crop.y *= ry; crop.h *= ry;
    }
    frame.style.width = dw + 'px';
    frame.style.height = dh + 'px';
    frameW = dw; frameH = dh;
    if (cropping) renderCrop();
    T('sync');
  }

  /* ===== 사진 불러오기 ===== */
  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      // 촬영 방향(EXIF)은 브라우저가 자동으로 반영해서 그려 줌
      const nw = img.naturalWidth, nh = img.naturalHeight;
      const s = Math.min(1, MAX_SIDE / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * s));
      const h = Math.max(1, Math.round(nh * s));
      work.width = w;
      work.height = h;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      history = [];
      hasImage = true;
      T('reset');
      exitCrop();
      updateUI();
      layout();
    } catch (err) {
      alert('사진을 불러오지 못했습니다. 다른 사진으로 다시 시도해 주세요.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function openPicker() {
    if (hasImage && history.length && !confirm('지금까지 편집한 내용이 사라집니다. 새 사진을 불러올까요?')) return;
    fileInput.click();
  }

  /* ===== 되돌리기 ===== */
  function snapshot() {
    const c = document.createElement('canvas');
    c.width = work.width;
    c.height = work.height;
    c.getContext('2d').drawImage(work, 0, 0);
    return c;
  }

  function pushHistory() {
    history.push(snapshot());
    if (history.length > HISTORY_MAX) history.shift();
    updateUI();
  }

  function setWork(c) {
    work.width = c.width;
    work.height = c.height;
    ctx.drawImage(c, 0, 0);
  }

  function undo() {
    if (T('cancel')) return;
    const c = history.pop();
    if (!c) return;
    setWork(c);
    updateUI();
    layout();
  }

  /* ===== 회전 ===== */
  function rotate(dir) { // dir: 1 = 오른쪽(시계), -1 = 왼쪽
    if (!hasImage) return;
    T('stop');
    pushHistory();
    const src = history[history.length - 1];
    const out = document.createElement('canvas');
    out.width = src.height;
    out.height = src.width;
    const o = out.getContext('2d');
    o.translate(out.width / 2, out.height / 2);
    o.rotate(dir * Math.PI / 2);
    o.drawImage(src, -src.width / 2, -src.height / 2);
    setWork(out);
    layout();
  }

  /* ===== 자르기 ===== */
  function enterCrop() {
    if (!hasImage || cropping) return;
    T('stop');
    cropping = true;
    tools.hidden = true;
    cropBar.hidden = false;
    dimClip.hidden = false;
    cropBox.hidden = false;
    const mx = frameW * 0.08, my = frameH * 0.08;
    crop = { x: mx, y: my, w: frameW - mx * 2, h: frameH - my * 2 };
    setRatio(0);
  }

  function exitCrop() {
    cropping = false;
    drag = null;
    tools.hidden = false;
    cropBar.hidden = true;
    dimClip.hidden = true;
    cropBox.hidden = true;
  }

  function renderCrop() {
    [cropBox, dim].forEach((el) => {
      el.style.left = crop.x + 'px';
      el.style.top = crop.y + 'px';
      el.style.width = crop.w + 'px';
      el.style.height = crop.h + 'px';
    });
  }

  function setRatio(r) {
    ratio = r;
    cropBox.classList.toggle('locked', r > 0);
    chips.forEach((c) => c.classList.toggle('on', parseFloat(c.dataset.r) === r));
    if (r > 0) {
      const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
      let w = Math.min(crop.w, crop.h * r);
      let h = w / r;
      if (h > frameH) { h = frameH; w = h * r; }
      if (w > frameW) { w = frameW; h = w / r; }
      crop.w = w; crop.h = h;
      crop.x = clamp(cx - w / 2, 0, frameW - w);
      crop.y = clamp(cy - h / 2, 0, frameH - h);
    }
    renderCrop();
  }

  // 비율 자유: 잡은 손잡이 쪽 변만 움직임
  function resizeFree(h, dx, dy, s) {
    let x = s.x, y = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
    if (h.includes('w')) x = clamp(x + dx, 0, x2 - MIN_CROP);
    if (h.includes('e')) x2 = clamp(x2 + dx, x + MIN_CROP, frameW);
    if (h.includes('n')) y = clamp(y + dy, 0, y2 - MIN_CROP);
    if (h.includes('s')) y2 = clamp(y2 + dy, y + MIN_CROP, frameH);
    crop = { x, y, w: x2 - x, h: y2 - y };
  }

  // 비율 고정: 반대쪽 모서리를 고정하고 비율을 유지하며 크기 조절
  function resizeLocked(h, dx, dy, s) {
    const west = h.includes('w'), north = h.includes('n');
    const ax = west ? s.x + s.w : s.x;
    const ay = north ? s.y + s.h : s.y;
    const sx = west ? -1 : 1, sy = north ? -1 : 1;
    const k = Math.max((s.w + sx * dx) / s.w, (s.h + sy * dy) / s.h);
    const maxW = Math.min(west ? ax : frameW - ax, (north ? ay : frameH - ay) * ratio);
    const w = clamp(s.w * k, Math.min(MIN_CROP, maxW), maxW);
    const hh = w / ratio;
    crop = { x: west ? ax - w : ax, y: north ? ay - hh : ay, w, h: hh };
  }

  cropBox.addEventListener('pointerdown', (e) => {
    if (!cropping) return;
    drag = { h: e.target.dataset.h || 'move', sx: e.clientX, sy: e.clientY, start: { ...crop } };
    cropBox.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  cropBox.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, s = drag.start;
    if (drag.h === 'move') {
      crop = {
        x: clamp(s.x + dx, 0, frameW - s.w),
        y: clamp(s.y + dy, 0, frameH - s.h),
        w: s.w, h: s.h,
      };
    } else if (ratio > 0) {
      resizeLocked(drag.h, dx, dy, s);
    } else {
      resizeFree(drag.h, dx, dy, s);
    }
    renderCrop();
  });

  const endDrag = () => { drag = null; };
  cropBox.addEventListener('pointerup', endDrag);
  cropBox.addEventListener('pointercancel', endDrag);

  function applyCrop() {
    const kx = work.width / frameW, ky = work.height / frameH;
    const sx = clamp(Math.round(crop.x * kx), 0, work.width - 1);
    const sy = clamp(Math.round(crop.y * ky), 0, work.height - 1);
    const sw = clamp(Math.round(crop.w * kx), 1, work.width - sx);
    const sh = clamp(Math.round(crop.h * ky), 1, work.height - sy);
    pushHistory();
    const src = history[history.length - 1];
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    setWork(out);
    exitCrop();
    layout();
  }

  /* ===== 저장·공유 (1MB 미만 JPEG) ===== */
  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  // 화질을 먼저 낮추고, 그래도 크면 크기를 줄여가며 상한 이내로 맞춤
  async function exportUnder(source, limit) {
    const qualities = [0.92, 0.86, 0.80, 0.74, 0.68, 0.62, 0.56];
    let scale = 1;
    let last = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const w = Math.max(1, Math.round(source.width * scale));
      const h = Math.max(1, Math.round(source.height * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff';
      cx.fillRect(0, 0, w, h);
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(source, 0, 0, w, h);
      for (const q of qualities) {
        const blob = await toBlob(c, 'image/jpeg', q);
        if (!blob) continue;
        last = { blob, w, h };
        if (blob.size <= limit) return last;
      }
      scale *= 0.85;
    }
    return last;
  }

  const stamp = () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  };

  const fmtSize = (n) => (n >= 1000000 ? (n / 1000000).toFixed(2) + 'MB' : Math.round(n / 1000) + 'KB');

  function closeSheet() {
    sheet.hidden = true;
    if (exported) { URL.revokeObjectURL(exported.url); exported = null; }
    preview.removeAttribute('src');
  }

  async function openExport() {
    if (!hasImage) return;
    T('stop');
    if (exported) { URL.revokeObjectURL(exported.url); exported = null; }
    preview.removeAttribute('src');
    info.textContent = '이미지를 만드는 중…';
    hint.textContent = '';
    shareBtn.disabled = true;
    dlLink.hidden = true;
    sheet.hidden = false;
    await new Promise((r) => setTimeout(r, 30)); // 안내 문구가 먼저 보이도록 잠깐 대기
    try {
      const res = await exportUnder(work, LIMIT_BYTES);
      if (!res) throw new Error('export failed');
      const name = `edit-${stamp()}.jpg`;
      const url = URL.createObjectURL(res.blob);
      exported = { blob: res.blob, url, name };
      preview.src = url;
      info.textContent = `${res.w}×${res.h} · ${fmtSize(res.blob.size)}`;
      hint.textContent = '"공유 / 사진에 저장"을 누른 뒤 공유 창에서 "이미지 저장"을 선택하면 사진 앱에 저장됩니다. 공유 창이 열리지 않으면 위 사진을 길게 눌러 저장하세요.';
      dlLink.href = url;
      dlLink.download = name;
      dlLink.hidden = false;
      shareBtn.disabled = false;
    } catch (err) {
      info.textContent = '이미지를 만들지 못했습니다. 다시 시도해 주세요.';
    }
  }

  async function shareImage() {
    if (!exported) return;
    const file = new File([exported.blob], exported.name, { type: 'image/jpeg' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        hint.textContent = '이 브라우저에서는 바로 공유할 수 없습니다. 위 사진을 길게 눌러 저장하세요.';
      }
    } catch (err) {
      if (err && err.name !== 'AbortError') {
        hint.textContent = '공유하지 못했습니다. 위 사진을 길게 눌러 저장하세요.';
      }
    }
  }

  /* ===== 이벤트 연결 ===== */
  btn.open.addEventListener('click', openPicker);
  $('emptyOpen').addEventListener('click', openPicker);
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) loadFile(f);
  });

  btn.rotL.addEventListener('click', () => rotate(-1));
  btn.rotR.addEventListener('click', () => rotate(1));
  btn.crop.addEventListener('click', enterCrop);
  btn.undo.addEventListener('click', undo);
  btn.save.addEventListener('click', openExport);

  chips.forEach((c) => c.addEventListener('click', () => setRatio(parseFloat(c.dataset.r))));
  $('cropCancel').addEventListener('click', exitCrop);
  $('cropApply').addEventListener('click', applyCrop);

  shareBtn.addEventListener('click', shareImage);
  closeBtn.addEventListener('click', closeSheet);

  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  else window.addEventListener('resize', layout);

  // 2~4단계(모자이크·글쓰기·도형)에서 사용할 연결 지점
  window.Editor = {
    work,
    get hasImage() { return hasImage; },
    pushHistory,
    layout,
  };

  updateUI();
})();
