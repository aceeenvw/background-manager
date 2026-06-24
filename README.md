# ⊹ BACKGROUND MANAGER ⊹

> A prettier, chat-aware background manager for [SillyTavern](https://github.com/SillyTavern/SillyTavern).
> Browse and organize your backgrounds in a clean modal, drop them into folders, and **link a background to a specific chat** so switching chats switches the scene.

![SillyTavern](https://img.shields.io/badge/SillyTavern-Extension-9333ea)
![Version](https://img.shields.io/badge/version-1.1.0-3b82f6)
![Author](https://img.shields.io/badge/author-aceenvw-1f2937)
![License](https://img.shields.io/badge/license-AGPL--3.0-10b981)

---

## Table of Contents

- [What it does](#what-it-does)
- [Features](#features)
- [Per-chat backgrounds](#per-chat-backgrounds)
- [Installation](#installation)
- [Usage](#usage)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Security model](#security-model)
- [Credits](#credits)
- [Provenance](#provenance)

---

## What it does

SillyTavern's built-in background panel works, but it gets crowded fast and a
background change is global by default. **⊹ BACKGROUND MANAGER ⊹** replaces that
panel with a full-screen, theme-aware modal that opens over everything on both
desktop and mobile, and adds the two things the default panel lacks:

1. A nicer, faster way to **organize** backgrounds (folders, search, sort, bulk
   actions, rename, delete, upload).
2. The ability to **link a background to the current chat**, so that opening a
   different chat brings back that chat's own scene — while leaving everything
   else on the shared global background.

It is built directly on SillyTavern's **native** background system, so it stays
fully compatible: per-chat links use the same metadata that `/lockbg` uses,
folders are the same folders the native panel shows, and uploads/renames/deletes
go through the same server endpoints.

---

## Features

- **Pretty modal UI** — theme-driven colors, responsive thumbnail grid, three
  thumbnail sizes, smooth states. Opens over the default UI on PC and mobile.
- **Per-chat linking** — pin any background to the open chat; a `Global / Per-chat`
  toggle and a `Linked here` badge make the current state obvious at a glance.
- **Folders** — create, rename and delete folders; drag-and-drop backgrounds
  into them (mouse drag on desktop, long-press drag on touch); filter the grid by
  folder, by *Unfiled*, or by *This Chat*. Cards show an **in-folder badge** so you
  can see at a glance which folder(s) a background belongs to, and a quick
  **remove-from-folder** button appears while you are inside a folder view.
- **Pagination** — the grid is paged (10 / 30 / 60 / 100 per page, configurable)
  to keep large libraries fast and the modal snappy to open and close. A pager
  shows the current page and an item-range counter (e.g. `1–60 of 142`).
- **Apply globally** — set any background as the shared global one in one click.
  The global picker groups backgrounds into **collapsible folder sections** with
  a search box for fast navigation.
- **Rename / delete** — with safe filename handling and reference repair (if you
  rename or delete the background a chat is linked to, the link is fixed up).
- **Bulk actions** — multi-select, then move-to-folder or delete in one go.
- **Upload** — add **multiple** backgrounds at once (static images, animated
  `webp` / `gif` / `apng`, and `mp4` / `webm` videos via the Video Background
  Loader extension), auto-filed into the open folder.
- **Bilingual** — English and Russian, auto-detected from your SillyTavern locale.
- **Drawer hijack (optional)** — open the manager instead of the default
  Backgrounds drawer; toggle it off any time in settings.

---

## Per-chat backgrounds

The per-chat feature is built on SillyTavern's own chat-background **lock**
(`custom_background` in the chat metadata), the same one used by `/lockbg` and
`/unlockbg`. That means:

- **Global** — the chat follows the shared global background. This is the default.
- **Per-chat** — the chat stores its own background URL. When you switch to this
  chat, SillyTavern restores that background automatically; switch away and you
  are back on global.

Because it reuses the native lock, your per-chat backgrounds keep working even if
you disable or remove this extension, and they play nicely with the built-in
slash commands.

To link: open a chat, open the manager, and click the **link** button on any
card (or the **Per-chat** toggle in the top bar). To revert: click **unlink** or
the **Global** toggle.

---

## Installation

1. In SillyTavern, open **Extensions → Install Extension**.
2. Paste the repository URL and install.
3. Open the **Extensions** tab and find **⊹ BACKGROUND MANAGER ⊹** (it sits just
   below ⊹ ACE ENTRY TRACK ⊹ and ⊹ ACE INPUT DECK ⊹).

Or clone into `SillyTavern/data/<user>/extensions/third-party/background-manager`.

---

## Usage

- Click the **Backgrounds** drawer icon (with hijack on) **or** open the manager
  from its settings block via **Open Background Manager**.
- Search, sort, and pick a folder in the left sidebar.
- On a card: **Link to this chat**, rename, move to folder, delete, and — while
  inside a folder view — **remove from this folder** in one click.
- Drag a card onto a folder (or onto *Unfiled*) to file it.
- Set the shared **global background** from the Global card's **Change** button;
  the picker is grouped by folder with a search box.
- Use **Upload** to add new backgrounds; select **multiple** files at once and
  they are all imported (and filed into the open folder).
- Page through large libraries with the pager beneath the grid.

---

## Settings

| Setting | Description |
| --- | --- |
| **Open manager instead of the default Backgrounds drawer** | Hijack the native drawer button. On by default. |
| **Confirm before applying a background** | Ask for confirmation before applying/linking. Off by default. |
| **Thumbnail size** | Small / Medium / Large grid density. |
| **Backgrounds per page** | How many backgrounds each page shows: 10 / 30 / 60 / 100. Defaults to 60. |

---

## How it works

| Concern | Native mechanism reused |
| --- | --- |
| Global background | `background_settings` / `FORCE_SET_BACKGROUND` event / `/bg` |
| Per-chat link | `chat_metadata['custom_background']` (the `/lockbg` lock) |
| Background list | `POST /api/backgrounds/all` |
| Rename / delete / upload | `POST /api/backgrounds/{rename,delete,upload}` |
| Folders | `POST /api/backgrounds/folders` + `/api/image-metadata/folders/*` |
| Visible background element | `#bg1` |

The manager never invents a parallel data store; it reads and writes the same
state SillyTavern already manages.

---

## Security model

- **No `innerHTML` interpolation of server/user data.** Filenames, folder names
  and other untrusted strings are inserted with `textContent` / DOM nodes.
- **Path-traversal guards.** Background filenames are validated before any
  `delete` / `rename` / folder-assign call: no `..`, no slashes, no NUL/control
  characters, no protocol-style URLs, no absolute paths.
- **Name sanitization.** User-typed rename input is reduced to a single safe
  filename component before it is combined with the original extension.
- **CSRF tokens.** Every request goes through SillyTavern's `getRequestHeaders()`.
- **No non-configurable globals, no external network calls, no eval.**

---

## Credits

This extension stands on the shoulders of two excellent storage managers by
**Kamoi (Nufahi)**, whose work directly inspired its folder sidebar, selection
model and touch drag-and-drop:

- [**My lorebook manager**](https://github.com/Nufahi/My-lorebook-manager) — the
  folder/sidebar layout, card grid and touch drag module are modeled on it.
- [**ST-ImageManager**](https://github.com/Nufahi/ST-ImageManager) — the
  storage-management mindset and the image-folder handling patterns.

Background handling follows SillyTavern's own `public/scripts/backgrounds.js`.

Built and maintained by **aceenvw**.

---

## Provenance

This build is signed by its author. To verify authorship in your browser's
DevTools console while the manager modal exists in the DOM:

```js
atob(document.getElementById('bgm_modal').dataset.build)
// → {"a":"aceenvw","v":"1.1.0","h":"..."}
```

The same author-seeded hash drives the stable per-background element IDs and the
panel's `[data-build]` styling gate, so the signature is woven into real,
load-bearing code rather than bolted on.

---

## License

AGPL-3.0-or-later. See [LICENSE](./LICENSE).
