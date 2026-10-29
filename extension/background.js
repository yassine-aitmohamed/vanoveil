/* VanoVeil — background.
   1. ⌥⇧H: veil the page now.
   2. My space: a private Chrome window. "Enter" opens it with the tabs you left there;
      "Exit" puts every tab away (saved in the extension), closes the window and leaves Chrome blank (Google),
      and, if you want, removes those sites from Chrome's history. */
const get = k => chrome.storage.local.get(k).then(o => o[k]);
const set = (k, v) => chrome.storage.local.set({ [k]: v });
const SDEF = { open: false, winId: null, tabs: [], visited: [], at: 0 };
const space = async () => ({ ...SDEF, ...((await get('space')) || {}) });
const prefs = async () => ({ wipeHistory: true, ...((await get('spacePrefs')) || {}) });
const usable = u => u && !/^(chrome|edge|about|devtools|chrome-extension):/.test(u);

async function winAlive(id) { if (id == null) return false; try { await chrome.windows.get(id); return true; } catch (e) { return false; } }

async function snapshot() {                     // remember the tabs of the space window
  const s = await space(); if (!s.open || !(await winAlive(s.winId))) return s;
  const tabs = await chrome.tabs.query({ windowId: s.winId });
  s.tabs = tabs.filter(t => usable(t.url || t.pendingUrl)).map(t => ({ url: t.url || t.pendingUrl, title: t.title || '', pinned: t.pinned, active: t.active }));
  s.at = Date.now(); await set('space', s); return s;
}
let snapT = null;
const soon = () => { clearTimeout(snapT); snapT = setTimeout(snapshot, 400); };

/* ── private bookmarks: what you bookmark inside the space lives only in the space ──
   enter → your private bookmarks are put in Chrome's bookmarks bar / Other bookmarks
   exit  → every bookmark that was not there before you entered is stored in VanoVeil and removed from Chrome */
async function roots() {
  const t = await chrome.bookmarks.getTree(), r = t[0].children || [];
  const by = k => r.find(n => n.folderType === k);
  return { bar: by('bookmarks-bar') || r[0], other: by('other') || r[1] || r[0] };
}
const strip = n => n.url ? { title: n.title, url: n.url } : { title: n.title, children: (n.children || []).map(strip) };
async function plant(parentId, nodes) {
  for (const n of nodes) {
    if (n.url) await chrome.bookmarks.create({ parentId, title: n.title, url: n.url });
    else { const f = await chrome.bookmarks.create({ parentId, title: n.title }); await plant(f.id, n.children || []); }
  }
}
async function seedFromLinks() {                // the bookmarks hidden earlier become the space's bookmarks bar
  const links = (await get('links')) || [], bar = [], folders = {};
  for (const x of links) {
    if (!x.tags) { bar.push({ title: x.title, url: x.url }); continue; }
    let level = bar, path = '';
    for (const part of x.tags.split(' / ')) {
      path += '/' + part;
      if (!folders[path]) { folders[path] = { title: part, children: [] }; level.push(folders[path]); }
      level = folders[path].children;
    }
    level.push({ title: x.title, url: x.url });
  }
  return { bar, other: [] };
}
async function bookmarksIn() {
  const R = await roots();
  const outside = [...(await chrome.bookmarks.getChildren(R.bar.id)), ...(await chrome.bookmarks.getChildren(R.other.id))].map(n => n.id);
  let saved = await get('spaceBookmarks');
  if (!saved) saved = await seedFromLinks();
  await set('spaceOutside', outside);
  await set('spaceCreated', []);
  bmBusy = true;
  try { await plant(R.bar.id, saved.bar || []); await plant(R.other.id, saved.other || []); } finally { bmBusy = false; }
  await set('spaceBookmarks', { bar: [], other: [] });          // they now live in Chrome until you leave
}
let bmBusy = false;
async function bookmarksOut() {
  const R = await roots(), outside = new Set((await get('spaceOutside')) || []);
  const saved = { bar: [], other: [] };
  bmBusy = true;
  try {
    for (const [k, root] of [['bar', R.bar], ['other', R.other]]) {
      const [full] = await chrome.bookmarks.getSubTree(root.id);
      for (const c of full.children || []) if (!outside.has(c.id)) { saved[k].push(strip(c)); await chrome.bookmarks.removeTree(c.id); }
    }
    // bookmarks you added inside the space into a folder that already existed outside
    for (const id of (await get('spaceCreated')) || []) {
      try { const [n] = await chrome.bookmarks.getSubTree(id); if (n) { saved.bar.push(strip(n)); await chrome.bookmarks.removeTree(id); } } catch (e) {}
    }
  } finally { bmBusy = false; }
  const prev = (await get('spaceBookmarks')) || { bar: [], other: [] };
  await set('spaceBookmarks', { bar: [...prev.bar, ...saved.bar], other: [...prev.other, ...saved.other] });
  await set('spaceOutside', null); await set('spaceCreated', []);
}
chrome.bookmarks.onCreated.addListener(async (id, node) => {
  if (bmBusy) return; const s = await space(); if (!s.open) return;
  const outside = new Set((await get('spaceOutside')) || []), R = await roots();
  if (node.parentId === R.bar.id || node.parentId === R.other.id) return;   // top level: handled on exit
  // inside a folder: remember it only if that folder belongs to the outside world
  let p = node.parentId, top = null;
  while (p && p !== R.bar.id && p !== R.other.id) { const [x] = await chrome.bookmarks.get(p); top = x.id; p = x.parentId; }
  if (top && outside.has(top)) { const L = (await get('spaceCreated')) || []; L.push(id); await set('spaceCreated', L); }
});
async function cleanAfterSpace(s) {             // history, recently closed, download list, bookmarks
  try { await bookmarksOut(); } catch (e) {}
  if ((await prefs()).wipeHistory) {
    await wipe([...(s.visited || []), ...(s.tabs || []).map(t => t.url)]);
    if (s.openedAt) try { await chrome.downloads.erase({ startedAfter: new Date(s.openedAt).toISOString() }); } catch (e) {}
  }
}

async function enter(urls) {
  const s = await space();
  if (s.open && await winAlive(s.winId)) {       // already inside: bring the window to the front
    await chrome.windows.update(s.winId, { focused: true, state: 'normal' });
    for (const u of urls || []) await chrome.tabs.create({ windowId: s.winId, url: u });
    return s.winId;
  }
  try { await bookmarksIn(); } catch (e) {}
  const list = [...s.tabs.map(t => t.url), ...(urls || [])];
  const w = await chrome.windows.create({ url: list.length ? list : 'chrome://newtab', focused: true, state: 'maximized' });
  const tabs = await chrome.tabs.query({ windowId: w.id });
  for (let i = 0; i < s.tabs.length && i < tabs.length; i++) {
    if (s.tabs[i].pinned) chrome.tabs.update(tabs[i].id, { pinned: true });
    if (s.tabs[i].active) chrome.tabs.update(tabs[i].id, { active: true });
  }
  await set('space', { ...s, open: true, winId: w.id, visited: [], openedAt: Date.now() });
  syncIcon(true);
  return w.id;
}

async function wipe(urls) {                      // remove the space's sites from Chrome's history
  for (const url of new Set(urls)) { try { await chrome.history.deleteUrl({ url }); } catch (e) {} }
}

async function exit() {
  const s = await space();
  if (!s.open) return;
  const id = s.winId;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ windowId: id }); } catch (e) {}
  // 1. a blank Chrome on the Google start page, in front, right away
  const others = (await chrome.windows.getAll({ windowTypes: ['normal'] })).filter(w => w.id !== id);
  if (others.length) chrome.windows.update(others[0].id, { focused: true }).catch(() => {});
  else await chrome.windows.create({ url: 'chrome://newtab', focused: true, state: 'maximized' });
  // 2. the space disappears
  await set('space', { ...s, open: false, winId: null });
  chrome.windows.remove(id).catch(() => {});
  syncIcon(false);
  // 3. then, quietly: remember its tabs and clean the history
  const kept = tabs.filter(t => usable(t.url || t.pendingUrl)).map(t => ({ url: t.url || t.pendingUrl, title: t.title || '', pinned: t.pinned, active: t.active }));
  if (kept.length) await set('space', { ...s, open: false, winId: null, tabs: kept, at: Date.now() });
  await cleanAfterSpace({ ...s, tabs: kept.length ? kept : s.tabs });
}

/* the toolbar icon: outside the space it opens the bar; inside, one click = leave instantly */
async function syncIcon(inside) {
  if (inside === undefined) { const s = await space(); inside = s.open && await winAlive(s.winId); }
  await chrome.action.setPopup({ popup: inside ? '' : 'bar.html' });
  await chrome.action.setTitle({ title: 'VanoVeil' });
}
chrome.action.onClicked.addListener(() => exit());          // only fires when no popup is set, i.e. inside the space
chrome.runtime.onStartup.addListener(async () => {
  const s = await space();
  if (s.open && !(await winAlive(s.winId))) { await set('space', { ...s, open: false, winId: null }); await cleanAfterSpace(s); }
  syncIcon();
});
chrome.runtime.onInstalled.addListener(async () => {
  syncIcon();
  if (!(await get('autoVeilOff'))) { const v = (await get('veil')) || {}; await set('veil', { ...v, enabled: false }); await set('autoVeilOff', true); }
});
/* ⌘⇧K always opens the bar, even inside the space (where a click on the icon means "leave") */
async function openBar() {
  await chrome.action.setPopup({ popup: 'bar.html' });
  try { await chrome.action.openPopup(); } catch (e) {
    const s = await space(); if (s.open) syncIcon(true);
  }
}
chrome.runtime.onConnect.addListener(port => {             // the bar closed: restore the "click = leave" icon inside the space
  if (port.name !== 'bar') return;
  port.onDisconnect.addListener(() => syncIcon());
});

/* put every tab open in Chrome (outside the space) into the space, and leave Chrome blank */
async function absorb() {
  const s = await space();
  const wins = (await chrome.windows.getAll({ windowTypes: ['normal'], populate: true })).filter(w => !(s.open && w.id === s.winId));
  const known = new Set(s.tabs.map(t => t.url)), moved = [];
  for (const w of wins) for (const t of w.tabs) {
    const u = t.url || t.pendingUrl;
    if (usable(u) && !known.has(u)) { s.tabs.push({ url: u, title: t.title || '', pinned: t.pinned, active: false }); known.add(u); moved.push(u); }
  }
  await set('space', s);
  if (s.open && await winAlive(s.winId)) for (const u of moved) await chrome.tabs.create({ windowId: s.winId, url: u, active: false });
  const blank = await chrome.windows.create({ url: 'chrome://newtab', focused: !s.open, state: 'maximized' });
  for (const w of wins) { try { await chrome.windows.remove(w.id); } catch (e) {} }
  if (s.open) { const n = await space(); n.tabs = n.tabs; await set('space', n); soon(); }
  if ((await prefs()).wipeHistory) await wipe(moved);
  return moved.length;
}

/* bookmarks → the private bar, a backup file in Downloads/VanoVeil, then removed from Chrome */
async function hideBookmarks() {
  const tree = await chrome.bookmarks.getTree(), links = (await get('links')) || [], seen = new Set(links.map(x => x.url)), all = [];
  (function walk(nodes, path) { for (const n of nodes) { if (n.url) all.push({ n, path }); if (n.children) walk(n.children, [...path, n.title]); } })(tree, []);
  for (const { n, path } of all) if (/^https?:/.test(n.url) && !seen.has(n.url)) { links.push({ id: n.id + '-' + Date.now().toString(36), title: n.title || n.url, url: n.url, tags: path.filter(Boolean).slice(1).join(' / '), added: Date.now() }); seen.add(n.url); }
  await set('links', links);
  const backup = JSON.stringify({ savedAt: new Date().toISOString(), bookmarks: tree }, null, 1);
  const dlId = await chrome.downloads.download({ url: 'data:application/json;charset=utf-8,' + encodeURIComponent(backup), filename: 'VanoVeil/bookmarks-backup-' + new Date().toISOString().slice(0, 10) + '.json', saveAs: false, conflictAction: 'uniquify' });
  for (let i = 0; i < 40; i++) {                    // remove nothing until the backup is really on disk
    const [d] = await chrome.downloads.search({ id: dlId });
    if (d && d.state === 'complete') break;
    if (!d || d.state === 'interrupted' || i === 39) throw new Error('backup not saved — bookmarks kept in Chrome');
    await new Promise(r => setTimeout(r, 250));
  }
  const roots = tree[0].children || [];                // "Bookmarks bar", "Other bookmarks", "Mobile bookmarks": empty them
  let removed = 0;
  for (const r of roots) for (const c of (await chrome.bookmarks.getChildren(r.id))) { try { await chrome.bookmarks.removeTree(c.id); removed++; } catch (e) {} }
  return { kept: all.length, removed };
}

chrome.tabs.onCreated.addListener(async t => { const s = await space(); if (s.open && t.windowId === s.winId) soon(); });
chrome.tabs.onUpdated.addListener(async (id, info, t) => {
  const s = await space(); if (!s.open || t.windowId !== s.winId) return;
  if (info.url && usable(info.url)) { const v = new Set(s.visited || []); v.add(info.url); s.visited = [...v].slice(-500); await set('space', s); }
  if (info.url || info.status === 'complete' || info.pinned !== undefined) soon();
});
chrome.tabs.onRemoved.addListener(async (id, info) => { const s = await space(); if (s.open && info.windowId === s.winId && !info.isWindowClosing) soon(); });
chrome.tabs.onAttached.addListener(soon); chrome.tabs.onDetached.addListener(soon); chrome.tabs.onMoved.addListener(soon);
chrome.windows.onRemoved.addListener(async id => {   // the space window was closed by hand: same as "Exit"
  const s = await space(); if (!s.open || id !== s.winId) return;
  await set('space', { ...s, open: false, winId: null });
  syncIcon(false);
  await cleanAfterSpace(s);
});

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  if (!m || !m.space) return;
  (async () => {
    if (m.space === 'absorb') { const n = await absorb(); return reply({ moved: n }); }
    if (m.space === 'hideBookmarks') { if ((await space()).open) return reply({ error: 'leave your space first' }); try { return reply(await hideBookmarks()); } catch (e) { return reply({ error: String(e.message || e) }); } }
    if (m.space === 'enter') await enter(m.urls);
    else if (m.space === 'exit') await exit();
    const s = await space(); reply({ open: s.open && await winAlive(s.winId), count: s.tabs.length, winId: s.winId });
  })();
  return true;
});

chrome.commands.onCommand.addListener(async cmd => {
  if (cmd === 'veil-now') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) chrome.tabs.sendMessage(tab.id, { veil: 'toggle' }).catch(() => {});
  } else if (cmd === 'space-exit') exit();
  else if (cmd === 'open-bar') openBar();
});
