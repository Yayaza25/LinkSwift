// ==UserScript==
// @name         LinkSwift 夸克悬浮修复
// @namespace    yayaza25.linkswift.quark-fix
// @version      1.2.0
// @description  把 LinkSwift 在夸克网盘网页版的「下载助手」按钮提升为固定悬浮按钮，勾选文件时不再消失；修复鼠标上移时菜单消失。
// @author       Yayaza25
// @license      MIT
// @match        *://pan.quark.cn/*
// @run-at       document-idle
// @grant        none
// @noframes
// @downloadURL  https://yayaza25.github.io/LinkSwift/quark-fix.user.js
// @updateURL    https://yayaza25.github.io/LinkSwift/quark-fix.user.js
// ==/UserScript==

/*
 * v1.2.0 修复说明（勿回退）：
 * LinkSwift 的下拉菜单是「鼠标离开 .pl-button 子树即收起」的 hover 模型。
 * 旧版把菜单抬到 bottom: calc(100% + 8px)，在按钮与菜单之间留出空隙，
 * 指针上移穿过空隙时会落到宿主页面上，被判定为"离开" → 菜单消失。
 * 因此这里把菜单钉在 bottom: 100% 与按钮上沿严格相接，命中区连续；
 * 同时用 margin:0 / transform:none 抹掉 LinkSwift 自带的间距与飞入动画，
 * 避免实际间距不可控。不要为了视觉留白再把菜单往上挪；
 * 确需间距时改 CFG.menuGapPx（会额外插入透明桥接元素保持命中链）。
 */

(function () {
  'use strict';

  // 幂等：SPA 重复注入 / 多实例时只保留一份
  if (window.__LSQ_FIX__) return;
  window.__LSQ_FIX__ = true;

  var CFG = {
    btnSelector: '.pl-button',   // LinkSwift 的按钮类名
    textFilter: '下载助手',       // 只接管这个按钮；置空则接管全部 .pl-button
    edgeRight: 20,
    edgeBottom: 128,
    gap: 8,
    menuGapPx: 0,                // 按钮与菜单的视觉间距；>0 时自动插入透明桥接保持命中连续
    minGapMs: 100,               // DOM 批量变更的最小处理间隔
    fallbackMs: 1500,            // 兜底巡检，防止漏看
    zIndex: 2147483647
  };

  var FAB_ID = 'plq-fab';
  var STYLE_ID = 'plq-fix-style';
  var BRIDGE_CLASS = 'plq-bridge';

  var fab = null;
  var adopted = null;            // 当前唯一被接管的按钮
  var timer = null;
  var lastRun = 0;
  var observer = null;

  // ---------- 样式 ----------
  function buildCss() {
    // 关键：0 间距时菜单底边贴住按钮上沿，鼠标路径不产生"空地"
    var menuBottom = CFG.menuGapPx > 0 ? 'calc(100% + ' + CFG.menuGapPx + 'px)' : '100%';
    return [
      '#' + FAB_ID + '{position:fixed;right:' + CFG.edgeRight + 'px;bottom:' + CFG.edgeBottom + 'px;' +
        'z-index:' + CFG.zIndex + ';display:flex;flex-direction:column;align-items:flex-end;' +
        'gap:' + CFG.gap + 'px;pointer-events:none;isolation:isolate}',
      '#' + FAB_ID + '>*{pointer-events:auto}',                       // 空白区域不挡页面点击
      // 按钮作为定位包含块：菜单严格相对按钮计算，不受 fab 高度与宿主样式影响
      '#' + FAB_ID + ' .pl-button{position:relative!important;margin:0!important}',
      '#' + FAB_ID + ' .pl-button .pl-dropdown-menu{position:absolute!important;top:auto!important;' +
        'bottom:' + menuBottom + '!important;left:auto!important;right:0!important;' +
        'margin:0!important;transform:none!important;animation:none!important;' +
        'max-height:calc(100vh - 176px)!important;overflow-y:auto!important;' +
        'overscroll-behavior:contain;z-index:' + CFG.zIndex + '!important}',
      '@media (max-height:640px){#' + FAB_ID + '{bottom:88px}' +
        '#' + FAB_ID + ' .pl-button .pl-dropdown-menu{max-height:calc(100vh - 136px)!important}}',
      '@media (prefers-reduced-motion:reduce){#' + FAB_ID + '{transition:none}}'
    ].join('\n');
  }

  function injectStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = buildCss();
  }

  // ---------- 容器 ----------
  function ensureFab() {
    if (fab && fab.isConnected) return fab;
    if (!document.body) return null;
    fab = document.getElementById(FAB_ID);
    if (!fab) {
      fab = document.createElement('div');
      fab.id = FAB_ID;
    }
    if (fab.parentNode !== document.body) document.body.appendChild(fab);
    return fab;
  }

  // ---------- 可选桥接：仅当 menuGapPx > 0 时使用 ----------
  function ensureBridge(btn) {
    if (CFG.menuGapPx <= 0) return;
    var bridge = btn.querySelector('.' + BRIDGE_CLASS);
    if (!bridge) {
      bridge = document.createElement('i');
      bridge.className = BRIDGE_CLASS;
      btn.appendChild(bridge);
    }
    bridge.style.cssText = 'position:absolute;left:0;right:0;bottom:100%;height:' +
      CFG.menuGapPx + 'px;pointer-events:auto;background:transparent;z-index:0;';
  }

  // ---------- 目标识别 ----------
  function isTarget(el) {
    if (!el || el.nodeType !== 1 || !el.matches || !el.matches(CFG.btnSelector)) return false;
    if (!CFG.textFilter) return true;
    return (el.textContent || '').indexOf(CFG.textFilter) !== -1;
  }

  function pickTarget() {
    var all = document.querySelectorAll(CFG.btnSelector);
    var hit = null;
    for (var i = 0; i < all.length; i++) {
      if (isTarget(all[i])) hit = all[i];   // 文档中最后一个 = 最新一次渲染
    }
    if (!hit && all.length === 1) hit = all[0];   // 标签改版兜底
    return hit;
  }

  // ---------- 接管 ----------
  function adopt() {
    var container = ensureFab();
    if (!container) return;

    var live = pickTarget();
    if (!live) {
      if (adopted && !adopted.isConnected) adopted = null;
      return;
    }

    if (live !== adopted || live.parentNode !== container) {
      try {
        container.appendChild(live);   // 移动而非克隆，保留事件监听
      } catch (e) {
        return;                        // 宿主正在批量替换节点，下一轮再试
      }
      adopted = live;
    }
    ensureBridge(adopted);

    // 清理历史副本：只动「同一目标按钮」的重复节点，不碰页面里其它按钮
    var inside = container.querySelectorAll(CFG.btnSelector);
    for (var i = 0; i < inside.length; i++) {
      if (inside[i] !== adopted && isTarget(inside[i])) inside[i].remove();
    }
    var outside = document.querySelectorAll(CFG.btnSelector);
    for (var j = 0; j < outside.length; j++) {
      if (outside[j] !== adopted && isTarget(outside[j])) outside[j].remove();
    }
  }

  // ---------- 调度：批量合并 + 限频 ----------
  function run() {
    lastRun = Date.now();
    try { adopt(); } catch (e) { /* 永不打断宿主页面 */ }
  }

  function schedule() {
    if (timer) return;
    var wait = Math.max(0, CFG.minGapMs - (Date.now() - lastRun));
    timer = setTimeout(function () {
      timer = null;
      run();
    }, wait);
  }

  function hasTarget(nodes) {
    // 快路径命中按钮本身；慢路径只对前 20 个元素做子树查询
    var budget = 20;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n || n.nodeType !== 1) continue;
      if (n.matches && n.matches(CFG.btnSelector)) return true;
      if (budget > 0 && n.querySelector && n.childElementCount > 0) {
        budget--;
        if (n.querySelector(CFG.btnSelector)) return true;
      }
    }
    return false;
  }

  // ---------- 启动 ----------
  injectStyle();
  run();

  observer = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      if (r.type !== 'childList') continue;
      if (hasTarget(r.addedNodes)) { schedule(); return; }
      if (!fab || !fab.isConnected) { schedule(); return; }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 兜底：观察器漏事件 / 节点被静默抽走
  setInterval(function () {
    if (!fab || !fab.isConnected || !adopted || !adopted.isConnected) schedule();
  }, CFG.fallbackMs);

  window.addEventListener('pagehide', function () {
    if (observer) observer.disconnect();
    if (timer) clearTimeout(timer);
  }, { once: true });
})();
