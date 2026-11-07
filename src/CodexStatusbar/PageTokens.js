(() => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
  function initialize() {
  if (window.__codexPageTokens) { window.__codexPageTokens.request(); return; }
  const marker = 'data-codex-token-usage';
  const snapshots = new Map();
  let opened = null;
  let scheduled = false;
  const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig;
  const full = n => n == null ? '--' : Number(n).toLocaleString('en-US');
  const compact = n => n == null ? '--' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
  const rate = u => !u || u.input <= 0 ? '--' : `${(u.cached * 100 / u.input).toFixed(2)}%`;
  const style = document.createElement('style');
  style.setAttribute(marker, 'style');
  style.textContent = `
    .codex-token-usage { display:inline-flex; flex:none; margin:0; color:var(--text-tertiary,#999); font-family:inherit;font-size:12px;line-height:20px; }
    .codex-token-usage > button { display:inline-flex; align-items:center; justify-content:center; gap:4px; height:24px; font:inherit; color:inherit; padding:4px; border:0; border-radius:6px; background:transparent; cursor:pointer; }
    .codex-token-usage > button:hover,.codex-token-usage > button[aria-expanded=true] { background:var(--bg-primary-ghost-hover,rgba(128,128,128,.18)); color:var(--text-primary,#ccc); }
    .codex-token-usage > button:focus-visible { outline:2px solid #7299d5; outline-offset:2px; }
    .codex-token-usage svg { width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:1.3;flex:none; }
    .codex-token-total > button { width:26px;height:28px; }
    .codex-token-panel { position:fixed; z-index:2147483647; box-sizing:border-box; width:290px; max-width:calc(100vw - 16px); max-height:calc(100vh - 24px); overflow:auto; margin:0; padding:16px 18px; border-radius:12px; background:var(--bg-surface,light-dark(#fff,#292a2d)); color:var(--text-primary,light-dark(#222,#eee)); border:1px solid rgba(128,128,128,.2); box-shadow:0 8px 30px #0003; font:12px/1.5 var(--font-sans,system-ui); }
    .codex-token-panel[hidden] { display:none; }
    .codex-token-panel h4 { margin:0 0 12px; font-size:13px; font-weight:600; }
    .codex-token-panel dl { margin:0; display:grid; grid-template-columns:1fr auto; gap:9px 20px; }
    .codex-token-panel dt { opacity:.7; } .codex-token-panel dd { margin:0; text-align:right; font-variant-numeric:tabular-nums; }
  `;
  (document.head || document.documentElement).append(style);

  function fibreOf(element) {
    const key = Object.keys(element || {}).find(key => key.startsWith('__reactFiber$'));
    return key ? element[key] : null;
  }
  function identity(element) {
    if (!element) {
      const footer = [...document.querySelectorAll('[data-thread-scroll-footer]')].find(e => e.getBoundingClientRect().width > 0);
      element = footer || [...document.querySelectorAll('[data-turn-key]')].find(e => e.getBoundingClientRect().width > 0);
    }
    const composerId = element?.querySelector('[data-above-composer-conversation-id]')?.getAttribute('data-above-composer-conversation-id');
    if (composerId) return composerId;
    let fibre = fibreOf(element);
    for (let i = 0; fibre && i < 70; i++, fibre = fibre.return) {
      const p = fibre.memoizedProps;
      for (const value of [p?.conversationId, p?.threadId, p?.entry?.conversationId, p?.conversation?.id, p?.thread?.id,
        p?.value?.conversationId, p?.value?.threadId])
        if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return value;
    }
    return null;
  }

  function close() {
    if (!opened) return;
    opened.panel.hidden = true;
    opened.button.setAttribute('aria-expanded', 'false');
    opened = null;
  }
  function position() {
    if (!opened) return;
    const {button, panel} = opened;
    const r = button.getBoundingClientRect();
    if (!button.isConnected || !r.width || r.bottom < 0 || r.top > innerHeight) { close(); return; }
    panel.style.left = `${Math.max(8, Math.min(r.left, innerWidth - panel.offsetWidth - 8))}px`;
    panel.style.top = `${Math.max(8, r.top > panel.offsetHeight + 12 ? r.top - panel.offsetHeight - 8 : Math.min(r.bottom + 8, innerHeight - panel.offsetHeight - 8))}px`;
  }
  document.addEventListener('pointerdown', e => { if (opened && !opened.panel.contains(e.target) && !opened.button.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', position);
  document.addEventListener('scroll', position, true);

  function usageFor(row, records) {
    const key = row.getAttribute('data-turn-key') || '';
    for (const id of key.match(uuid) || []) {
      const found = records.find(t => t.turnId === id);
      if (found) return found;
    }
    let fibre = fibreOf(row);
    for (let i = 0; fibre && i < 12; i++, fibre = fibre.return) {
      const p = fibre.memoizedProps;
      const entry = p?.entry ?? p?.turn ?? p?.item;
      for (const id of [p?.turnId, p?.sourceTurnId, entry?.turnId, entry?.sourceTurnId, entry?.id]) {
        const found = typeof id === 'string' && records.find(t => t.turnId === id || t.messageId === id);
        if (found) return found;
      }
    }
    return null;
  }

  function createBlock(kind, id) {
    const block = document.createElement('div');
    block.setAttribute(marker, kind);
    block.dataset.usageId = id;
    block.className = `codex-token-usage${kind === 'total' ? ' codex-token-total' : ''}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="4" rx="6.5" ry="2.5"/><path d="M3.5 4v5c0 3.3 13 3.3 13 0V4M3.5 9v5c0 3.3 13 3.3 13 0V9"/></svg><span></span>';
    const panel = document.createElement('section');
    panel.className = 'codex-token-panel';
    panel.hidden = true;
    panel.innerHTML = `<h4>${kind === 'total' ? '本会话累计用量' : '本轮回复用量'}</h4><dl></dl>`;
    block._panel = panel;
    panel.setAttribute(marker, 'panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', kind === 'total' ? '本会话累计用量' : '本轮回复用量');
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const wasOpen = opened?.button === button;
      close();
      if (!wasOpen) { panel.hidden = false; button.setAttribute('aria-expanded', 'true'); opened = {button, panel}; position(); }
    });
    block.append(button);
    document.body.append(panel);
    return block;
  }

  function fill(block, usage) {
    const signature = JSON.stringify(usage);
    if (block.dataset.usageSignature === signature) return;
    block.dataset.usageSignature = signature;
    const total = usage ? usage.input + usage.output : null;
    const cumulative = block.getAttribute(marker) === 'total';
    block.querySelector('button span').textContent = cumulative ? '' : usage ? '用量' : '用量不可用';
    block.querySelector('button').title = cumulative ? '查看整个会话的真实累计用量' : '查看该轮回复的真实用量';
    block.querySelector('button').setAttribute('aria-label', cumulative ? '会话累计 Token 用量' : usage ? '本轮 Token 用量' : '用量不可用');
    const rows = [
      ['输入 Token', full(usage?.input)], ['输出 Token', full(usage?.output)],
      ['缓存 Token', full(usage?.cached)], ['总 Token', full(total)], ['缓存命中率', rate(usage)]
    ];
    const dl = block._panel.querySelector('dl'); dl.replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement('dt'); dt.textContent = label;
      const dd = document.createElement('dd'); dd.textContent = value;
      dl.append(dt, dd);
    }
    if (!usage) { const note = document.createElement('dt'); note.textContent = '用量不可用'; dl.append(note); }
  }

  function paint() {
    scheduled = false;
    for (const panel of document.querySelectorAll(`section[${marker}="panel"]`)) {
      if (![...document.querySelectorAll(`div[${marker}]`)].some(b => b._panel === panel)) panel.remove();
    }
    let count = 0;
    for (const row of document.querySelectorAll('[data-turn-key]')) {
      const thread = identity(row);
      const snapshot = snapshots.get(thread);
      const turn = usageFor(row, snapshot?.turns || []);
      // Only the final-answer native action row; never user-message or code-copy controls.
      const native = [...row.querySelectorAll('button[aria-label]')].find(b => ['复制', 'Copy'].includes(b.getAttribute('aria-label')) && b.closest('.turn-action-controls'));
      const toolbar = native?.parentElement;
      if (!toolbar) continue;
      const id = `${thread}:${turn?.turnId || row.getAttribute('data-turn-key')}`;
      let block = row.querySelector(`div[${marker}="turn"]`);
      if (block && block.dataset.usageId !== id) { block._panel?.remove(); block.remove(); block = null; }
      if (!block) { block = createBlock('turn', id); toolbar.append(block); }
      if (block.parentElement !== toolbar) toolbar.append(block);
      fill(block, turn?.usage || null); count++;
    }
    for (const footer of document.querySelectorAll('[data-thread-scroll-footer], [data-codex-composer-root]')) {
      if (!footer.matches('[data-thread-scroll-footer]') && footer.closest('[data-thread-scroll-footer]')) continue;
      const thread = identity(footer);
      const ring = footer.querySelector('[role="img"][aria-label^="上下文用量"], [role="img"][aria-label^="Context"]');
      const model = footer.querySelector('[data-composer-navigation-target="reasoning"]');
      const anchor = ring?.parentElement || model?.parentElement;
      if (!anchor) continue;
      let total = footer.querySelector(`div[${marker}="total"]`);
      if (total && total.dataset.usageId !== (thread || 'new')) { total._panel?.remove(); total.remove(); total = null; }
      if (!total) { total = createBlock('total', thread || 'new'); anchor.after(total); }
      if (total.previousElementSibling !== anchor) anchor.after(total);
      fill(total, snapshots.get(thread)?.total || null);
    }
    if (opened) position();
    return { threadId: identity(), buttons: count, total: !!document.querySelector(`div[${marker}="total"]`) };
  }

  function request() {
    const threadIds = [...new Set([...document.querySelectorAll('[data-turn-key], [data-thread-scroll-footer]')].map(identity).filter(Boolean))];
    try { window.__codexTokenRequest?.(JSON.stringify({ threadId: identity(), threadIds })); } catch (_) { }
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { paint(); request(); }, 150);
  }
  window.__codexPageTokens = {
    request,
    update(data) { if (!data?.threadId) return null; snapshots.set(data.threadId, data); return paint(); },
    inspect() { return { threadId: identity(), url: location.href, rows: [...document.querySelectorAll('[data-turn-key]')].map(e => e.getAttribute('data-turn-key')), snapshot: snapshots.get(identity()), threadIds: [...snapshots.keys()] }; }
  };
  new MutationObserver(schedule).observe(document.body || document.documentElement, { childList: true, subtree: true });
  setInterval(() => { request(); paint(); }, 1000);
  request();
  }
})();


