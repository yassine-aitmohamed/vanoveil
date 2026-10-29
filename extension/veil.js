/* VanoVeil — the page blurs behind a quiet privacy veil when the mouse leaves the window,
   when Chrome loses focus, or after a few seconds without moving. Moving the mouse lifts it. */
(() => {
  if (window.top !== window.self) return;
  const DEF = { enabled: false, idle: 10, onLeave: true, onWindowBlur: true, exclude: [] };
  let cfg = { ...DEF }, host, root, veiled = false, locked = false, idleT = null, leaveT = null, armed = false;

  function build() {
    if (host) return;
    host = document.createElement('vanoveil-x');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:block';
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .v{position:fixed;inset:0;opacity:0;transition:opacity .18s ease;backdrop-filter:blur(26px) saturate(.55) brightness(.92);-webkit-backdrop-filter:blur(26px) saturate(.55) brightness(.92);
        background:radial-gradient(1200px 700px at 20% 10%,rgba(88,101,242,.30),transparent 60%),radial-gradient(900px 600px at 85% 90%,rgba(32,201,151,.22),transparent 60%),rgba(12,14,22,.38);
        display:grid;place-items:center;font:500 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:rgba(255,255,255,.86)}
      .v.on{opacity:1}
      .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:44px 44px;mask-image:radial-gradient(circle at center,#000 30%,transparent 75%)}
      .c{position:relative;text-align:center;letter-spacing:.02em}
      .m{width:58px;height:58px;margin:0 auto 14px;border-radius:16px;background:conic-gradient(from 210deg,#5865f2,#20c997,#f2b84b,#5865f2);box-shadow:0 10px 40px rgba(88,101,242,.45);position:relative}
      .m::after{content:'';position:absolute;inset:9px;border-radius:11px;background:rgba(12,14,22,.82)}
      .t{font:600 15px/1 -apple-system,sans-serif;letter-spacing:.32em;text-transform:uppercase}
      .s{margin-top:8px;font-size:12px;color:rgba(255,255,255,.6)}
      .l{margin-top:18px;font-size:11px;color:rgba(255,255,255,.45)}
    </style><div class="v"><div class="grid"></div><div class="c"><div class="m"></div><div class="t">VanoVeil</div><div class="s">Workspace paused</div><div class="l"></div></div></div>`;
    (document.documentElement || document).appendChild(host);
  }
  const hostOk = () => !cfg.exclude.some(h => h && (location.hostname === h || location.hostname.endsWith('.' + h)));
  function veil(lock) {
    if (!cfg.enabled && !lock) return;
    if (!lock && !hostOk()) return;
    build(); if (!host.isConnected) (document.documentElement || document).appendChild(host);
    veiled = true; locked = !!lock;
    root.querySelector('.l').textContent = locked ? 'Press ⌥⇧H to return' : 'Move the mouse to continue';
    root.querySelector('.v').classList.add('on');
  }
  function lift() {
    if (!veiled || locked) return;
    veiled = false; root && root.querySelector('.v').classList.remove('on');
  }
  function playing() { return [...document.querySelectorAll('video,audio')].some(m => !m.paused && !m.ended && m.readyState > 2); }
  function poke() {
    clearTimeout(leaveT);
    if (veiled && !locked) lift();
    clearTimeout(idleT);
    if (cfg.enabled && cfg.idle > 0) idleT = setTimeout(() => { if (!playing() && document.visibilityState === 'visible') veil(); else poke(); }, cfg.idle * 1000);
  }
  function arm() {
    if (armed) return; armed = true;
    ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(ev => addEventListener(ev, e => { if (ev === 'keydown' && locked) return; poke(); }, { capture: true, passive: true }));
    document.addEventListener('mouseleave', e => { if (cfg.enabled && cfg.onLeave && !e.relatedTarget) { clearTimeout(leaveT); leaveT = setTimeout(() => veil(), 250); } });
    document.addEventListener('mouseenter', () => { clearTimeout(leaveT); poke(); });
    addEventListener('blur', () => { if (cfg.enabled && cfg.onWindowBlur) veil(); });
    addEventListener('focus', () => poke());
    addEventListener('keydown', e => { if (e.altKey && e.shiftKey && (e.code === 'KeyH')) { e.preventDefault(); toggleLock(); } }, true);
    poke();
  }
  function toggleLock() { if (locked) { locked = false; lift(); poke(); } else veil(true); }
  chrome.runtime.onMessage.addListener(m => { if (m && m.veil === 'toggle') toggleLock(); });
  chrome.storage.local.get('veil', o => { cfg = { ...DEF, ...(o.veil || {}) }; arm(); });
  chrome.storage.onChanged.addListener(ch => { if (ch.veil) { cfg = { ...DEF, ...(ch.veil.newValue || {}) }; if (!cfg.enabled && !locked) lift(); poke(); } });
})();
