# VanoVeil

**A private corner inside Chrome.** VanoVeil gives you a password-protected bar for your links, a hidden workspace for your tabs, and a one-key privacy veil for your screen. Free, open source, and everything stays in your browser.

[Version française](README.fr.md)

<p align="center"><img src="docs/2-private-bar.png" width="520" alt="The private bar with sample links"></p>

> All screenshots use sample data.

## Why VanoVeil?

You share a laptop, you work in a library or an open office, or you simply don't want every tab and bookmark on display. Chrome's profiles and incognito mode help, but they are all-or-nothing. VanoVeil sits inside your normal Chrome:

- your private links don't show in Chrome's bookmarks bar,
- your workspace tabs are put away in one click and come back when you want them,
- a single shortcut covers the page you are reading.

## Features

### 🔒 A private bar, behind a password
Press **⌘⇧K** (Ctrl+Shift+K on Windows/Linux) to open the bar. The first time, choose a password (4 characters or more).

<p align="center"><img src="docs/1-choose-password.png" width="420" alt="Choosing a password"></p>

- The password is never stored as such: VanoVeil keeps a salted PBKDF2-SHA-256 hash (210,000 iterations).
- After 5 wrong attempts the bar locks itself for a while, longer each time.
- You can choose whether to ask for the password again inside your space.

### 🔎 One search for everything
Type in the bar to search your private links, your open tabs, your Chrome bookmarks and your history at once. Use ↑ ↓ and ↵, or click. Folders and tags are searchable too.

<p align="center"><img src="docs/3-search.png" width="520" alt="Searching across links, tabs, bookmarks and history"></p>

- **＋ Keep page** saves the current page in your private links.
- **⇣ Hide my bookmarks** moves your Chrome bookmarks into the private bar. A backup file is saved first in *Downloads/VanoVeil*, and nothing is removed until the backup is really on disk.

### 🪟 My space, a hidden workspace
**Enter** opens your space: a separate Chrome window with the tabs you put away last time.

- **Leave** with **⌥⇧Q** (Alt+Shift+Q), or with one click on the VanoVeil icon while you are inside. The window closes at once and its tabs are kept in VanoVeil until next time.
- **⇢ Move all tabs to my space** takes every tab open in Chrome into your space and leaves Chrome blank.
- **Private bookmarks**: bookmarks you save while inside your space only appear inside it. They are removed from Chrome when you leave and come back when you enter again.
- Optionally, when you leave, the sites opened in your space are erased from Chrome's history, recently closed tabs and download list.

### 🌫️ The privacy veil
Press **⌥⇧H** (Alt+Shift+H) on any page to cover it with a blurred veil. Press it again to lift it.

<p align="center">
  <img src="docs/5-page.png" width="420" alt="A page before the veil">
  &nbsp;
  <img src="docs/6-veil.png" width="420" alt="The same page under the veil">
</p>

The veil can also come on by itself (off by default): when the mouse leaves the window, when you switch to another app, or after a few seconds without moving. You can exclude sites.

### ⚙️ Settings

<p align="center"><img src="docs/4-settings.png" width="460" alt="Settings"></p>

- **⤓ Export a backup** saves your private links as a standard bookmarks `.html` file that any browser can import.
- **⇡ Put back into Chrome** returns them to Chrome's bookmarks (*Other bookmarks → Restored from VanoVeil*).

## Installation

VanoVeil is not on the Chrome Web Store yet. Install it in one minute:

1. Download this repository (**Code → Download ZIP**, or the zip in [Releases](../../releases)) and unzip it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `extension` folder.
5. Pin the VanoVeil icon in the toolbar, then press **⌘⇧K**.

Shortcuts can be changed in `chrome://extensions/shortcuts`.

Works in Chrome, and should work in other Chromium browsers (Edge, Brave, Arc).

> **Keep the folder where it is.** Chrome ties an unpacked extension to its folder. If you move or delete the folder, or click **Remove** on the extension, Chrome treats it as a new extension and your links, space and password are lost. Export a backup first.

## Shortcuts

| Shortcut | Action |
|---|---|
| ⌘⇧K / Ctrl+Shift+K | Open the private bar |
| ⌥⇧Q / Alt+Shift+Q | Leave my space at once |
| ⌥⇧H / Alt+Shift+H | Veil or unveil the page |

## Privacy

- No account, no server, no analytics. VanoVeil makes no network requests of its own: everything is kept in `chrome.storage.local` on your computer.
- Site icons in the bar come from Chrome's own favicon cache, so no site or service is contacted to draw them.

## Limits, honestly

VanoVeil is a **discretion** tool, not a vault.

- The password protects the VanoVeil interface. Your links are stored unencrypted in Chrome's extension storage, so someone with full access to your computer account and some technical knowledge could still read them.
- Erasing history works on Chrome's own history. It does not affect your network, your employer, your DNS provider or the websites you visit.
- For real secrecy, use a separate computer account with its own password, and disk encryption.

## Project structure

```
extension/
  manifest.json    Chrome MV3 manifest, permissions and shortcuts
  background.js    service worker: my space, private bookmarks, history clean-up
  bar.html/css/js  the private bar, password screen and settings
  veil.js          the privacy veil, injected in every page
  icons/
docs/              screenshots
```

Permissions: `storage`, `favicon`, `tabs`, `bookmarks`, `history`, `downloads` (backup file and download-list clean-up), and access to all sites for the veil.

## License

MIT © Yassine Ait Mohamed
