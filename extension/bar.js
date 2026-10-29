chrome.runtime.connect({ name: 'bar' });
/* VanoVeil — private bar: your own links, searchable, opened with ⌘⇧K; nothing shows in Chrome's bookmarks bar. */
const $ = s => document.querySelector(s);
const E = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = k => chrome.storage.local.get(k).then(o => o[k]);
const set = (k, v) => chrome.storage.local.set({ [k]: v });
const DEF = { enabled: false, idle: 10, onLeave: true, onWindowBlur: true, exclude: [] };
let items = [], rows = [], sel = 0, curTab = null;

/* password: PBKDF2-SHA256 with a random salt; 5 wrong tries lock the bar for a while */
const B64 = u => btoa(String.fromCharCode(...new Uint8Array(u))), UNB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function derive(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return B64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256));
}
async function makePw(pw) { const salt = crypto.getRandomValues(new Uint8Array(16)); return { v: 2, salt: B64(salt), hash: await derive(pw, salt) }; }
async function legacySha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('vanoveil:' + s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
async function checkPw(pw, rec) {
  if (!rec) return false;
  if (typeof rec === 'string') return (await legacySha(pw)) === rec;      // old numeric passcode
  return (await derive(pw, UNB64(rec.salt))) === rec.hash;
}
const fav = u => { try { new URL(u); return chrome.runtime.getURL('/_favicon/?pageUrl=' + encodeURIComponent(u) + '&size=32'); } catch (e) { return ''; } };
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

async function start() {
  [curTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const rec = await get('pin'), sp = (await get('space')) || {}, prefs = (await get('lockPrefs')) || {};
  const inside = !!sp.open && sp.winId != null && await chrome.windows.get(sp.winId).then(() => true, () => false);
  if (rec && inside && !prefs.askInside) return open();     // already inside your space: no need to ask again
  $('#lock').hidden = false;
  const p = $('#pin'), p2 = $('#pin2'), m = $('#pinmsg');
  if (!rec) {                                                 // first time: choose a password
    $('#lk-title').textContent = 'Choose a password for your space';
    p2.hidden = false; $('#lk-go').textContent = 'Set password';
    p.focus();
    $('#lk-form').onsubmit = async e => {
      e.preventDefault();
      if (p.value.length < 4) { m.textContent = 'At least 4 characters.'; return; }
      if (p.value !== p2.value) { m.textContent = 'The two passwords differ.'; p2.select(); return; }
      await set('pin', await makePw(p.value)); $('#lock').hidden = true; open();
    };
    return;
  }
  p.focus();
  $('#lk-form').onsubmit = async e => {
    e.preventDefault();
    const f = (await get('pinFails')) || { n: 0, until: 0 };
    if (Date.now() < f.until) { m.textContent = `Too many tries. Wait ${Math.ceil((f.until - Date.now()) / 1000)} s.`; return; }
    $('#lk-go').disabled = true;
    const ok = await checkPw(p.value, rec);
    $('#lk-go').disabled = false;
    if (ok) {
      if (typeof rec === 'string') await set('pin', await makePw(p.value));   // upgrade the old passcode
      await set('pinFails', { n: 0, until: 0 }); $('#lock').hidden = true; open(); return;
    }
    f.n++; if (f.n >= 5) { f.until = Date.now() + 60000 * Math.min(30, 2 ** (f.n - 5)); }
    await set('pinFails', f);
    m.textContent = f.until > Date.now() ? `Wrong password. Locked for ${Math.round((f.until - Date.now()) / 60000)} min.` : `Wrong password (${f.n}/5).`;
    p.select();
  };
}
const msg = m => chrome.runtime.sendMessage(m);
async function paintSpace() {
  const s = (await get('space')) || { tabs: [] }, inside = !!s.open, n = (s.tabs || []).length;
  $('#space').innerHTML = inside
    ? `<i class="dot on"></i><div class="st"><b>You are in your space</b><span>${n} tab${n > 1 ? 's' : ''} · one click on the icon = instant exit</span></div><button class="out" id="sp">Leave</button>`
    : `<i class="dot"></i><div class="st"><b>My space</b><span>${n ? n + ' tab' + (n > 1 ? 's' : '') + ' put away' : 'empty — type a site to start'}</span></div><button id="sp">Enter</button>`;
  $('#sp').onclick = async () => { await msg({ space: inside ? 'exit' : 'enter' }); window.close(); };
}
async function open() {
  $('#app').hidden = false; items = (await get('links')) || []; paintSpace();
  const q = $('#q'); q.focus(); q.oninput = () => { sel = 0; search(); }; q.onkeydown = key; search();
}
function hl(t, ws) { let s = E(t); ws.forEach(w => { if (w) s = s.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); }); return s; }
async function search() {
  const q = $('#q').value.trim(), ws = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = x => ws.every(w => ((x.title || '') + ' ' + x.url + ' ' + (x.tags || '')).toLowerCase().includes(w));
  const mine = items.filter(match).slice(0, 40).map(x => ({ ...x, kind: 'mine' }));
  let tabs = [], hist = [], bm = [];
  if (ws.length) {
    tabs = (await chrome.tabs.query({})).filter(t => match({ title: t.title, url: t.url || '' })).slice(0, 6).map(t => ({ title: t.title, url: t.url, tabId: t.id, winId: t.windowId, kind: 'tab' }));
    try { bm = (await chrome.bookmarks.search(q)).filter(b => b.url).slice(0, 6).map(b => ({ title: b.title, url: b.url, kind: 'bm' })); } catch (e) {}
    if (q.length >= 2) try { hist = (await chrome.history.search({ text: q, maxResults: 12, startTime: 0 })).filter(h => !mine.some(m => m.url === h.url)).slice(0, 8).map(h => ({ title: h.title || h.url, url: h.url, kind: 'hist' })); } catch (e) {}
  }
  rows = [...mine, ...tabs, ...bm, ...hist];
  const sec = { mine: 'My links', tab: 'Open tabs', bm: 'Chrome bookmarks', hist: 'History' };
  let html = '', last = '';
  rows.forEach((r, i) => {
    if (r.kind !== last) { html += `<div class="sec">${sec[r.kind]}</div>`; last = r.kind; }
    html += `<div class="it${i === sel ? ' on' : ''}" data-i="${i}"><img src="${E(fav(r.url))}" alt=""><div class="b"><div class="t">${hl(r.title || host(r.url), ws)}</div><div class="u">${hl(host(r.url) + (r.tags ? ' · ' + r.tags : ''), ws)}</div></div>${r.kind === 'mine' ? `<button class="x" data-x="${E(r.id)}" title="Remove">✕</button>` : ''}</div>`;
  });
  $('#list').innerHTML = html || `<div class="empty">${ws.length ? 'Nothing found. ↵ to open or search it in your space.' : 'Your private bar is empty.<br>“⇢ Move all tabs to my space” or “⇣ Hide my bookmarks”.'}</div>`;
  document.querySelectorAll('.it').forEach(el => el.onclick = e => { if (e.target.dataset.x) return remove(e.target.dataset.x); go(rows[+el.dataset.i], e.metaKey || e.ctrlKey); });
  document.querySelectorAll('.it img').forEach(im => im.onerror = () => { im.replaceWith(Object.assign(document.createElement('span'), { className: 'fi' })); });
}
function key(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!rows.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; document.querySelectorAll('.it').forEach((el, i) => el.classList.toggle('on', i === sel)); const on = document.querySelector('.it.on'); on && on.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') { e.preventDefault(); const q = $('#q').value.trim(); if (rows[sel]) go(rows[sel], e.metaKey || e.ctrlKey); else if (q) msg({ space: 'enter', urls: [/^https?:\/\//.test(q) ? q : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(q) ? 'https://' + q : 'https://www.google.com/search?q=' + encodeURIComponent(q)] }); window.close(); }
}
async function go(r, bg) {
  if (!r) return;
  if (r.kind === 'tab') { await chrome.tabs.update(r.tabId, { active: true }); await chrome.windows.update(r.winId, { focused: true }); }
  else await msg({ space: 'enter', urls: [r.url] });          // every site opens inside my space
  if (r.kind === 'mine') { const it = items.find(x => x.id === r.id); if (it) { it.used = Date.now(); it.n = (it.n || 0) + 1; await set('links', items); } }
  if (!bg) window.close();
}
async function remove(id) { items = items.filter(x => x.id !== id); await set('links', items); search(); }
$('#add').onclick = async () => {
  if (!curTab || !/^https?:/.test(curTab.url || '')) return;
  if (!items.some(x => x.url === curTab.url)) { items.unshift({ id: Date.now().toString(36), title: curTab.title, url: curTab.url, added: Date.now() }); await set('links', items); }
  $('#add').textContent = '✓ Kept'; search();
};
$('#abs').onclick = async () => {
  const n = await chrome.tabs.query({}).then(t => t.length);
  if (!confirm('Move every open tab into your secret space?\nChrome will be left blank (just Google). Get them back with “Enter”.')) return;
  const r = await msg({ space: 'absorb' }); $('#abs').textContent = `✓ ${r.moved} tab${r.moved > 1 ? 's' : ''} moved`; paintSpace();
};
$('#hbm').onclick = async () => {
  if (!confirm('Hide all your Chrome bookmarks?\n1. They are copied into your private bar.\n2. A backup is saved in Downloads/VanoVeil.\n3. They are removed from Chrome.')) return;
  const r = await msg({ space: 'hideBookmarks' });
  $('#hbm').textContent = r.error ? '✕ ' + r.error : `✓ ${r.kept} bookmarks hidden`; items = (await get('links')) || []; search();
};
$('#imp') && ($('#imp').onclick = async () => {
  const tree = await chrome.bookmarks.getTree(), seen = new Set(items.map(x => x.url)); let n = 0;
  (function walk(nodes, path) { for (const b of nodes) { if (b.url && /^https?:/.test(b.url) && !seen.has(b.url)) { items.push({ id: b.id + '-' + Date.now().toString(36), title: b.title || b.url, url: b.url, tags: path.filter(Boolean).slice(1).join(' / '), added: Date.now() }); seen.add(b.url); n++; } if (b.children) walk(b.children, [...path, b.title]); } })(tree, []);
  await set('links', items); $('#imp').textContent = `✓ ${n} imported`; search();
});
/* settings */
$('#gear').onclick = async () => {
  const c = { ...DEF, ...((await get('veil')) || {}) }, h = curTab && host(curTab.url || '');
  $('#s-en').checked = c.enabled; $('#s-leave').checked = c.onLeave; $('#s-wblur').checked = c.onWindowBlur; $('#s-idle').value = c.idle;
  $('#s-host').textContent = h || 'this site'; $('#s-ex').checked = !!h && c.exclude.includes(h); $('#s-ex').disabled = !h;
  const save = async () => { const x = { ...c, enabled: $('#s-en').checked, onLeave: $('#s-leave').checked, onWindowBlur: $('#s-wblur').checked, idle: Math.max(0, +$('#s-idle').value || 0) };
    x.exclude = c.exclude.filter(e => e !== h); if ($('#s-ex').checked && h) x.exclude.push(h); Object.assign(c, x); await set('veil', x); };
  ['#s-en', '#s-leave', '#s-wblur', '#s-idle', '#s-ex'].forEach(s => $(s).onchange = save);
  const sp = { wipeHistory: true, ...((await get('spacePrefs')) || {}) }; $('#s-wipe').checked = sp.wipeHistory;
  $('#s-wipe').onchange = () => set('spacePrefs', { ...sp, wipeHistory: $('#s-wipe').checked });
  const lp = (await get('lockPrefs')) || {}; $('#s-askin').checked = !!lp.askInside;
  $('#s-askin').onchange = () => set('lockPrefs', { ...lp, askInside: $('#s-askin').checked });
  $('#s-pinset').onclick = async () => { const v = $('#s-pin').value; if (v.length < 4) { $('#s-pinmsg').textContent = 'At least 4 characters.'; return; } await set('pin', await makePw(v)); $('#s-pinmsg').textContent = 'Password changed.'; $('#s-pin').value = ''; };
  $('#set').hidden = false;
};
/* backup of my links as a standard bookmarks file, and restore into Chrome if ever needed */
function bookmarksHtml(list) {
  const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const groups = {};
  for (const x of list) (groups[x.tags || 'VanoVeil'] = groups[x.tags || 'VanoVeil'] || []).push(x);
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n' +
    Object.entries(groups).map(([g, L]) => `  <DT><H3>${esc(g)}</H3>\n  <DL><p>\n` + L.map(x => `    <DT><A HREF="${esc(x.url)}" ADD_DATE="${Math.floor((x.added || Date.now()) / 1000)}">${esc(x.title)}</A>`).join('\n') + '\n  </DL><p>').join('\n') + '\n</DL><p>\n';
}
$('#s-exp').onclick = async () => {
  const list = (await get('links')) || [];
  if (!list.length) { $('#s-favmsg').textContent = 'No links in your private bar.'; return; }
  const url = URL.createObjectURL(new Blob([bookmarksHtml(list)], { type: 'text/html' }));
  const a = document.createElement('a'); a.href = url; a.download = 'vanoveil-bookmarks-' + new Date().toISOString().slice(0, 10) + '.html';
  document.body.appendChild(a); a.click(); a.remove();
  $('#s-favmsg').textContent = `✓ ${list.length} links exported to Downloads (vanoveil-bookmarks-….html).`;
};
$('#s-rest').onclick = async () => {
  const list = (await get('links')) || [];
  if (!list.length || !confirm(`Put ${list.length} links back into Chrome bookmarks (folder “Restored from VanoVeil”)?`)) return;
  const root = await chrome.bookmarks.create({ parentId: '2', title: 'Restored from VanoVeil' });
  const folders = {};
  for (const x of list) {
    const g = x.tags || '';
    let pid = root.id;
    if (g) { if (!folders[g]) folders[g] = (await chrome.bookmarks.create({ parentId: root.id, title: g })).id; pid = folders[g]; }
    await chrome.bookmarks.create({ parentId: pid, title: x.title, url: x.url });
  }
  $('#s-favmsg').textContent = `✓ ${list.length} links put back into Chrome (Other bookmarks → Restored from VanoVeil).`;
};
$('#back').onclick = () => { $('#set').hidden = true; $('#q').focus(); };
start();
