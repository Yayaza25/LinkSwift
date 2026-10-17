// ==UserScript==
// @name         LinkSwift 夸克悬浮修复
// @namespace    yayaza25.linkswift.quark-fix
// @version      1.0.0
// @description  把 LinkSwift 在夸克网盘网页版的「下载助手」按钮提升为固定悬浮按钮，勾选文件时不再消失。
// @author       Yayaza25
// @license      MIT
// @match        *://pan.quark.cn/*
// @run-at       document-idle
// @grant        none
// @noframes
// @downloadURL  https://yayaza25.github.io/LinkSwift/quark-fix.user.js
// @updateURL    https://yayaza25.github.io/LinkSwift/quark-fix.user.js
// ==/UserScript==

(function () {
  'use strict';

  var FAB_ID = 'plq-fab';
  var STYLE_ID = 'plq-fix-style';
  var TICK_INTERVAL_MS = 1000;

  var CSS = [
    '#' + FAB_ID + '{position:fixed;right:20px;bottom:128px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px}',
    '#' + FAB_ID + ' .pl-button{margin:0 !important}',
    '#' + FAB_ID + ' .pl-button .pl-dropdown-menu{top:auto !important;bottom:calc(100% + 8px) !important;left:auto !important;right:0 !important;z-index:2147483647 !important}'
  ].join('\n');

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensureFab() {
    var fab = document.getElementById(FAB_ID);
    if (fab) return fab;
    if (!document.body) return null;
    fab = document.createElement('div');
    fab.id = FAB_ID;
    document.body.appendChild(fab);
    return fab;
  }

  function tick() {
    if (!document.body) return;
    var buttons = document.querySelectorAll('.pl-button');
    if (!buttons.length) return;
    var fab = ensureFab();
    if (!fab) return;
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].parentElement !== fab) fab.appendChild(buttons[i]);
    }
    // Keep only the newest button if duplicates accumulate across re-renders.
    var all = fab.querySelectorAll('.pl-button');
    for (var j = 0; j < all.length - 1; j++) all[j].remove();
  }

  var scheduled = false;
  function scheduleTick() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      try { tick(); } catch (e) { /* never break the host page */ }
    });
  }

  injectStyle();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleTick);
  } else {
    scheduleTick();
  }

  var observer = new MutationObserver(scheduleTick);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(function () {
    try { tick(); } catch (e) { /* noop */ }
  }, TICK_INTERVAL_MS);
})();
