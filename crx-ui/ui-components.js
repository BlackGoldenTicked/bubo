/* =====================================================================
   LUMNO UI DESIGN COMPONENTS — EXTRACTED BEHAVIOR
   Reusable, framework-free modules extracted from src/shared/*.
   Each module mirrors the public API of the original (de-extensioned
   class names). Pair with ui-components.css.
   ===================================================================== */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------
   * MenuSurface (shared/menu-surface.js)
   * Popover/overlay open-close + content-width. Uses CSS data-open to
   * drive the scale+fade transition (see .l-menu-surface in CSS).
   * ------------------------------------------------------------- */
  const LumnoMenuSurface = (function () {
    function raf(opts) {
      if (opts && typeof opts.requestAnimationFrame === 'function') return opts.requestAnimationFrame;
      if (root.requestAnimationFrame) return root.requestAnimationFrame.bind(root);
      return (cb) => (root.setTimeout ? root.setTimeout(cb, 0) : cb());
    }
    function normLength(v) {
      if (v === undefined || v === null || v === '') return '';
      if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v + 'px' : '';
      return String(v).trim();
    }
    function open(el, opts) {
      if (!el || !el.setAttribute) return null;
      el.setAttribute('data-open', 'false');
      raf(opts)(() => el.setAttribute('data-open', 'true'));
      return el;
    }
    function close(el) { if (el && el.setAttribute) el.setAttribute('data-open', 'false'); return el; }
    function applyContentWidth(el, o) {
      const cfg = o || {};
      const min = normLength(cfg.minWidth) || '0';
      const max = normLength(cfg.maxWidth) || 'calc(100vw - 32px)';
      el.setAttribute('data-menu-surface-width', 'content');
      el.style.setProperty('--x-extension-menu-surface-min-width', min);
      el.style.setProperty('--x-extension-menu-surface-max-width', max);
      return el;
    }
    return Object.freeze({ open, close, applyContentWidth });
  })();

  /* ---------------------------------------------------------------
   * Checkbox (shared/checkbox.js)
   * A "required group": at least one checkbox must stay checked.
   * ------------------------------------------------------------- */
  const LumnoCheckbox = (function () {
    function createRequiredGroup(inputs, options) {
      const cfg = options && typeof options === 'object' ? options : {};
      const list = (Array.isArray(inputs) ? inputs : []).filter(i => i && i.addEventListener);
      const getValue = cfg.getValue || (i => i.value);
      const normalize = cfg.normalizeValue || (v => (Array.isArray(v) && v.length ? v : []));
      const onChange = cfg.onChange || (() => {});
      function read() { return list.filter(i => i.checked).map(getValue).filter(Boolean); }
      function setValue(v) { const s = new Set(normalize(v)); list.forEach(i => (i.checked = s.has(getValue(i)))); }
      function handle(e) {
        let next = read();
        const t = e && e.target;
        if (next.length <= 0 && t) { t.checked = true; next = read(); }
        setValue(next); onChange(normalize(next));
      }
      list.forEach(i => i.addEventListener('change', handle));
      return Object.freeze({ getValue: read, setValue, refresh: () => setValue(read()) });
    }
    return Object.freeze({ createRequiredGroup });
  })();

  /* ---------------------------------------------------------------
   * Tooltip (shared/tooltip.js)
   * Floating tooltip with smart viewport placement + show/hide +
   * declarative bind(bindAll via [data-tooltip]).
   * ------------------------------------------------------------- */
  const LumnoTooltip = (function () {
    const CLASS = 'l-tooltip';
    const LINE = 'l-tooltip__line';
    const DIVIDER = 'l-tooltip__divider';
    const DIVIDER_MARKER = '────────';

    function getDoc(o) { return (o && o.documentObj) || (root && root.document) || null; }
    function getWin(o) { return (o && o.windowObj) || (root && root.window) || root || {}; }
    function raf(w) { if (w.requestAnimationFrame) return w.requestAnimationFrame.bind(w); return (cb) => (root.setTimeout ? root.setTimeout(cb, 0) : cb()); }

    function createElement(doc, o) {
      const cfg = o || {};
      const el = doc.createElement('div');
      el.className = CLASS;
      el.setAttribute('data-visible', 'false');
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-tooltip-position', cfg.positionMode === 'absolute' ? 'absolute' : 'fixed');
      return el;
    }
    function renderText(el, text) {
      const lines = String(text || '').split('\n').map(l => l.trimEnd());
      el.textContent = '';
      lines.forEach(line => {
        const n = el.ownerDocument.createElement('span');
        if (line === DIVIDER_MARKER) n.className = DIVIDER; else { n.className = LINE; n.textContent = line; }
        el.appendChild(n);
      });
      return el;
    }
    function position(el, target, o) {
      const cfg = o || {};
      const w = getWin(cfg);
      const placement = ['left', 'left-above', 'bottom'].includes(cfg.placement) ? cfg.placement : 'top';
      const margin = Number.isFinite(Number(cfg.margin)) ? Number(cfg.margin) : 8;
      const spacing = Number.isFinite(Number(cfg.spacing)) ? Number(cfg.spacing) : 10;
      const vw = w.innerWidth || 1024, vh = w.innerHeight || 768;
      const maxW = cfg.maxWidth === undefined ? 420 : cfg.maxWidth;
      const resolvedMax = typeof maxW === 'number' ? Math.min(maxW, vw - margin * 2) + 'px' : maxW;
      el.style.maxWidth = resolvedMax;
      const tr = target.getBoundingClientRect(), er = el.getBoundingClientRect();
      let top, left;
      const tT = tr.top, tB = tr.bottom, tL = tr.left, tR = tr.right;
      if (placement === 'bottom') { top = tB + spacing; left = tL + (tr.width - er.width) / 2; if (top + er.height + margin > vh) top = tT - er.height - spacing; }
      else if (placement === 'left') { top = tT + (tr.height - er.height) / 2; left = tL - er.width - spacing; if (left < margin) left = tR + spacing; }
      else { top = tT - er.height - spacing; left = tL + (tr.width - er.width) / 2; if (top < margin) top = tB + spacing; }
      top = Math.max(margin, Math.min(top, Math.max(margin, vh - er.height - margin)));
      left = Math.max(margin, Math.min(left, Math.max(margin, vw - er.width - margin)));
      el.style.top = Math.round(top) + 'px'; el.style.left = Math.round(left) + 'px';
    }
    function createController(options) {
      const cfg = options || {};
      const doc = getDoc(cfg), w = getWin(cfg);
      const r = raf(w), setT = w.setTimeout ? w.setTimeout.bind(w) : (c) => 0, clrT = w.clearTimeout ? w.clearTimeout.bind(w) : () => {};
      let el = null, hideTimer = null, target = null, token = 0;
      function ensure() { if (el) return el; el = createElement(doc, cfg); (cfg.appendTo || doc.body).appendChild(el); return el; }
      function show(t, text, so) {
        const content = String(text || ''); if (!t || !content) return null;
        const tip = ensure(); if (hideTimer) clrT(hideTimer);
        token++; const tk = token; target = t; renderText(tip, content);
        tip.setAttribute('data-visible', 'false'); tip.setAttribute('aria-hidden', 'true');
        position(tip, t, Object.assign({}, cfg, so || {}));
        r(() => { if (tk !== token || target !== t) return; tip.setAttribute('data-visible', 'true'); tip.setAttribute('aria-hidden', 'false'); });
        return tip;
      }
      function hide() { if (!el) return null; token++; el.setAttribute('data-visible', 'false'); el.setAttribute('aria-hidden', 'true'); return el; }
      function bind(t, getText, bo) {
        if (!t || !t.addEventListener) return null;
        const set = bo || {};
        const resolve = typeof getText === 'function' ? getText : () => t.getAttribute(set.attributeName || 'data-tooltip') || '';
        t.addEventListener('mouseenter', () => show(t, resolve(t), set));
        t.addEventListener('mouseleave', hide);
        t.addEventListener('focus', () => show(t, resolve(t), set));
        t.addEventListener('blur', hide);
        return t;
      }
      function bindAll(node, bo) {
        const scope = node || doc; const sel = (bo && bo.selector) || '[data-tooltip]';
        return Array.from(scope.querySelectorAll(sel)).map(n => bind(n, null, bo)).filter(Boolean);
      }
      return Object.freeze({ get element() { return ensure(); }, show, hide, bind, bindAll });
    }
    return Object.freeze({ className: CLASS, createElement, createController, renderText, position });
  })();

  /* ---------------------------------------------------------------
   * Shortcut formatter (onboarding-content.js)
   * Normalize a "Ctrl+Shift+K" string into display tokens, with Mac
   * symbol compaction. Used by copy rows / action buttons.
   * ------------------------------------------------------------- */
  const LumnoShortcut = (function () {
    function modSym(t) {
      const s = String(t || '').toLowerCase();
      if (/^(command|cmd|meta|super)$/.test(s) || t === '⌘') return '⌘';
      if (/^(shift)$/.test(s) || t === '⇧') return '⇧';
      if (/^(ctrl|control|macctrl)$/.test(s) || t === '⌃') return '⌃';
      if (/^(alt|option)$/.test(s) || t === '⌥') return '⌥';
      return '';
    }
    function keyLabel(k, sym) {
      const map = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↩', Escape: '⎋', Tab: '⇥', Space: 'Space' };
      return sym ? (map[k] || k) : k;
    }
    function tokens(value) {
      const v = String(value || '').trim().replace(/\s*\+\s*/g, '+');
      if (!v) return [];
      const parts = v.split('+').filter(Boolean);
      const key = parts.pop();
      const prefer = parts.some(p => /[⌘⇧⌃⌥]/.test(p)) || /^(command|cmd|meta|super)$/i.test(parts[0] || '');
      const out = [];
      parts.forEach(p => { const s = modSym(p); if (prefer && s) out.push(s); else out.push(/^command$/i.test(p) ? 'Cmd' : p); });
      out.push(keyLabel(key, prefer));
      return out;
    }
    function format(value) {
      const t = tokens(value); if (!t.length) return '';
      const compact = t.some(x => /[⌘⇧⌃⌥]/.test(x));
      return t.join(compact ? '' : '+');
    }
    return Object.freeze({ tokens, format });
  })();

  root.LumnoUI = Object.freeze({
    MenuSurface: LumnoMenuSurface,
    Checkbox: LumnoCheckbox,
    Tooltip: LumnoTooltip,
    Shortcut: LumnoShortcut
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
