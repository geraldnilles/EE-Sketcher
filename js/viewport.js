/* =====================================================================
   viewport.js
   Pan & zoom for the SVG canvas.
   - Replaces the static viewBox with a dynamic one centred on the world
     so the canvas opens at a "natural" size by default.
   - Plain wheel     -> pan (deltaX, deltaY)
   - Shift + wheel   -> horizontal pan only
   - Ctrl/Cmd+wheel -> zoom in/out around the cursor
     (Trackpad pinch-zoom also fires as ctrlKey+wheel in browsers, so
     pinch works as zoom for free.)

   The viewBox always preserves the aspect ratio of the canvas-wrap
   container (because the <svg> still has preserveAspectRatio="xMidYMid
   meet").  The world extents we expose to the user stay (0, 0, 1500, 1000)
   so all existing coordinates remain valid; we just choose which slice
   of that world to display.
   ===================================================================== */
(function (global) {
  'use strict';

  /* -------- World extents (the "infinite" drawing area) -------- */
  const WORLD_W = 1500;
  const WORLD_H = 1000;

  /* -------- Zoom limits (in user-units-per-CSS-pixel) -------- */
  // MIN_SCALE = world units per pixel at most-zoomed-out.
  // MAX_SCALE = world units per pixel at most-zoomed-in.
  // 1.0 would mean 1 user unit == 1 CSS pixel (true 1:1).
  // We allow between 0.1 (very far out) and 8 (very close in).
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 8.0;

  /* -------- Internal state -------- */
  let _view = { x: 0, y: 0, w: WORLD_W, h: WORLD_H };   // current viewBox
  let _wrap = null;                                      // canvas-wrap element
  let _svg  = null;                                      // <svg id="canvas">
  let _onViewChange = [];                                // listener callbacks

  /** Current scale (world units per CSS pixel). */
  function _scale() {
    return _view.w / _wrap.clientWidth;
  }

  /** Read the live viewBox as {x, y, w, h}. */
  function getViewBox() {
    return { x: _view.x, y: _view.y, w: _view.w, h: _view.h };
  }

  /** Programmatic viewBox setter (also clamps). */
  function setViewBox(x, y, w, h) {
    const wrap = _wrap;
    const aspect = wrap.clientWidth / wrap.clientHeight;
    // Force aspect ratio of viewBox to match the wrap, otherwise preserveAspectRatio
    // will letterbox and our scale calc gets weird.
    h = w / aspect;

    // Clamp scale (don't fight aspect clamp below; do it after).
    const newScale = w / wrap.clientWidth;
    if (newScale < MIN_SCALE) {
      w = MIN_SCALE * wrap.clientWidth;
      h = w / aspect;
    } else if (newScale > MAX_SCALE) {
      w = MAX_SCALE * wrap.clientWidth;
      h = w / aspect;
    }

    // Clamp viewBox to world size so the user never sees beyond the valid canvas.
    if (w > WORLD_W || h > WORLD_H) {
      const wrapAsp = wrap.clientWidth / wrap.clientHeight;
      // Calculate the largest viewBox that fits within the world at this aspect ratio.
      // We must ensure BOTH width and height are within bounds, otherwise a viewBox
      // that exceeds one dimension can re-trigger the clamp on every zoom step,
      // cancelling the zoom and making zoom-in appear stuck.
      const wFit = WORLD_W;
      const hFit = wFit / wrapAsp;
      if (hFit <= WORLD_H) {
        w = wFit;
        h = hFit;
      } else {
        h = WORLD_H;
        w = h * wrapAsp;
      }
    }

    // Clamp panning so the viewBox stays strictly within the world bounds.
    // If the view is larger than the world (zoomed far out), centre it.
    if (w <= WORLD_W) {
      x = Math.max(0, Math.min(WORLD_W - w, x));
    } else {
      x = (WORLD_W - w) / 2;
    }
    if (h <= WORLD_H) {
      y = Math.max(0, Math.min(WORLD_H - h, y));
    } else {
      y = (WORLD_H - h) / 2;
    }

    _view = { x, y, w, h };
    _svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    _notify();
  }

  function _notify() {
    for (const cb of _onViewChange) cb(getViewBox());
  }

  function onViewChange(cb) {
    _onViewChange.push(cb);
    return () => {
      const i = _onViewChange.indexOf(cb);
      if (i >= 0) _onViewChange.splice(i, 1);
    };
  }

  /* -------- coordinate helpers -------- */

  /** Convert a wheel-event's clientX/Y into SVG user-space coords. */
  function _clientToSvg(clientX, clientY) {
    const pt = _svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = _svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, y: r.y };
  }

  /* -------- public actions -------- */

  /** Zoom by `factor` (e.g. 1.2) keeping the SVG point under (clientX, clientY) fixed. */
  function zoom(factor, clientX, clientY) {
    // Anchor in SVG user space; if no cursor given, use the centre of the wrap.
    let anchor;
    if (typeof clientX === 'number' && typeof clientY === 'number') {
      anchor = _clientToSvg(clientX, clientY);
    } else {
      const r = _wrap.getBoundingClientRect();
      anchor = _clientToSvg(r.left + r.width / 2, r.top + r.height / 2);
    }
    const newW = _view.w / factor;
    // Convert "anchor in world" -> "anchor fraction within viewBox"
    const fx = (anchor.x - _view.x) / _view.w;
    const fy = (anchor.y - _view.y) / _view.h;
    const newX = anchor.x - fx * newW;
    const newY = anchor.y - fy * newW * (_view.h / _view.w); // keep aspect
    setViewBox(newX, newY, newW, newW * (_view.h / _view.w));
  }

  /** Pan by screen-pixel delta (positive dx -> viewBox moves right, content appears to move right). */
  function panByPixels(dxPx, dyPx) {
    const s = _scale();
    // Mouse wheel deltaY is small on trackpads, large on mice.  We always
    // convert via the current scale so the world moves the same distance
    // on screen regardless of zoom level.
    setViewBox(_view.x + dxPx * s, _view.y + dyPx * s, _view.w, _view.h);
  }

  /** Reset to the default "natural" view. */
  function resetView() {
    _setDefaultView();
  }

  /* -------- defaults -------- */

  function _setDefaultView() {
    // Aim for ~2x zoom on a typical monitor: viewBox half the size of the wrap.
    // But cap the viewBox width between 800 and 1500 so a tiny window still
    // shows something useful and a 4K window doesn't open overzoomed.
    const wrapW = _wrap.clientWidth;
    const wrapH = _wrap.clientHeight;
    const aspect = wrapW / wrapH;
    let w = wrapW / 2;
    w = Math.max(800, Math.min(1500, w));
    const h = w / aspect;
    // Centre on the middle of the world.
    const x = (WORLD_W - w) / 2;
    const y = (WORLD_H - h) / 2;
    setViewBox(x, y, w, h);
  }

  /* -------- wheel handler -------- */

  function _onWheel(evt) {
    // Always intercept the wheel so the page never scrolls when the user is
    // hovering the canvas.
    evt.preventDefault();

    // Trackpad pinch-zoom and Ctrl/Cmd + wheel both fire with ctrlKey=true.
    if (evt.ctrlKey || evt.metaKey) {
      // Standard "zoom": deltaY > 0 = zoom out, < 0 = zoom in.
      // Use a smooth exponential mapping.
      const factor = Math.exp(-evt.deltaY * 0.003);
      zoom(factor, evt.clientX, evt.clientY);
    } else if (evt.shiftKey) {
      // Shift + wheel = horizontal pan only (map the vertical wheel delta to horizontal scroll).
      panByPixels(evt.deltaY, 0);
    } else {
      // Plain wheel = pan.  Trackpads deliver small deltaY frequently;
      // mice deliver large deltas rarely.  We use the raw pixel delta.
      panByPixels(evt.deltaX, evt.deltaY);
    }
  }

  /* -------- init -------- */

  function init() {
    _svg  = document.getElementById('canvas');
    _wrap = _svg ? _svg.parentElement : null;
    if (!_svg || !_wrap) return;

    // Set a sensible default before showing.
    _setDefaultView();

    // Wheel listener.  We use { passive: false } so we can preventDefault.
    _wrap.addEventListener('wheel', _onWheel, { passive: false });

    // Keep the view sensible when the window is resized.  We adjust the
    // viewBox WIDTH only (height recomputed from aspect) and recentre on
    // the same world point that was at the centre of the wrap.
    let _lastCenter = null;
    _svg.addEventListener('viewBoxChanged', () => { _lastCenter = _currentCenter(); });
    function _currentCenter() {
      return { x: _view.x + _view.w / 2, y: _view.y + _view.h / 2 };
    }
    window.addEventListener('resize', () => {
      // Try to keep the world point under the centre of the wrap stable.
      const center = _lastCenter || _currentCenter();
      // Pick a width that keeps the current scale if possible, otherwise
      // fall back to the default sizing.
      const scale = _scale();
      const targetW = scale * _wrap.clientWidth;
      let w = targetW;
      // Clamp using the same rules as setViewBox would.
      if (w < MIN_SCALE * _wrap.clientWidth) w = MIN_SCALE * _wrap.clientWidth;
      if (w > MAX_SCALE * _wrap.clientWidth) w = MAX_SCALE * _wrap.clientWidth;
      w = Math.max(200, w);
      const h = w / (_wrap.clientWidth / _wrap.clientHeight);
      const x = center.x - w / 2;
      const y = center.y - h / 2;
      setViewBox(x, y, w, h);
      _lastCenter = _currentCenter();
    });
  }

  // Expose
  global.initViewport   = init;
  global.getViewBox     = getViewBox;
  global.setViewBox     = setViewBox;
  global.viewportZoom   = zoom;
  global.viewportPanByPixels = panByPixels;
  global.resetView      = resetView;
  global.onViewChange   = onViewChange;
  global.WORLD_W        = WORLD_W;
  global.WORLD_H        = WORLD_H;
})(typeof window !== 'undefined' ? window : globalThis);
