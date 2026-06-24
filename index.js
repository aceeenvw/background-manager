/*
 * ⊹ BACKGROUND MANAGER ⊹ — a prettier, chat-aware background manager for SillyTavern.
 *
 * Copyright (C) 2025-2026 aceenvw
 * Repository: https://github.com/aceeenvw/background-manager
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * Inspired by Kamoi (Nufahi)'s "My lorebook manager" and "ST-ImageManager".
 */

const MODULE_SETTINGS_KEY = 'aevBackgroundManager';

// Native chat-metadata keys (public/scripts/backgrounds.js).
const BG_METADATA_KEY = 'custom_background';   // per-chat lock (CSS url string)
const LIST_METADATA_KEY = 'chat_backgrounds';  // per-chat uploads (relative paths)

const THUMB_SIZES = Object.freeze(['small', 'medium', 'large']);
const PAGE_SIZES = Object.freeze([10, 30, 60, 100]);

const DEFAULT_SETTINGS = Object.freeze({
    hijackDrawer: true,
    confirmApply: false,
    thumbSize: 'medium',
    sort: 'az',
    pageSize: 30,
    activeFolderId: null,
    // Scope mode: 'global' (all chats share global) | 'per-chat' (lock, else global).
    bgScope: 'global',
});

// ── aceenvw signature: delta-encoded FNV-1a seed ──────────────────────────
// Author string stored as code-point deltas (not plaintext). Seeds the hash
// behind stable DOM ids and the data-build stamp that CSS [data-build] needs.
// Verify: atob(document.getElementById('bgm_modal').dataset.build)
const _SIG_DELTAS = [97, 2, 2, 0, 9, 8, 1]; // a, +c, +e, +e, +n, +v, +w
function _sigString() {
    let acc = 0;
    const codes = _SIG_DELTAS.map((d) => (acc += d));
    return String.fromCharCode(...codes);
}
const _SIG = _sigString();
function fnv1a(str, seedStr = _SIG) {
    let h = 0x811c9dc5 >>> 0;
    const seed = `${seedStr}:${str}`;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
}
function buildStamp(version) {
    try {
        return btoa(JSON.stringify({ a: _SIG, v: version, h: fnv1a(version).toString(16) }));
    } catch (_) {
        return '';
    }
}
const VERSION = '1.2.0';

// ── Module state ──────────────────────────────────────────────────────────
const state = {
    isOpen: false,
    isLoading: false,
    backgrounds: [],            // [{ file, isAnimated }]
    folders: [],                // [{ id, name }]
    imageFolderMap: {},         // { file: [folderId] }
    timestamps: {},             // { file: addedTimestamp } for newest/oldest sort
    activeFolderId: null,
    search: '',
    sort: DEFAULT_SETTINGS.sort,
    pageSize: DEFAULT_SETTINGS.pageSize,
    currentPage: 1,
    selected: new Set(),
    refreshToken: 0,
    dom: {},
    boundChatHandler: false,
    suppressDrawerHijack: false,
};

// ── i18n (EN / RU) ────────────────────────────────────────────────────────
const I18N = {
    en: {
        'app.title': '⊹ Background Manager ⊹',
        'app.subtitle': 'Browse, organize and link backgrounds to chats.',
        'action.refresh': 'Refresh',
        'action.close': 'Close',
        'action.selectAll': 'Select All',
        'action.cancel': 'Cancel',
        'action.move': 'Move',
        'action.delete': 'Delete',
        'toolbar.search': 'Search backgrounds',
        'toolbar.upload': 'Upload',
        'toolbar.newFolder': 'New Folder',
        'sort.az': 'Name A-Z',
        'sort.za': 'Name Z-A',
        'sort.newest': 'Newest first',
        'sort.oldest': 'Oldest first',
        'folder.all': 'All',
        'folder.heading': 'Folders',
        'folder.hint': 'Drag backgrounds here to organize them.',
        'folder.allBackgrounds': 'All Backgrounds',
        'folder.unfiled': 'Unsorted',
        'folder.chat': 'This Chat',
        'status.loading': 'Loading backgrounds...',
        'status.empty': 'No backgrounds match this view yet.',
        'pager.prev': 'Previous page',
        'pager.next': 'Next page',
        'pager.range': '{from}–{to} of {total}',
        'chat.bar.modeGlobal': 'Global mode — every chat shows the global background.',
        'chat.bar.modePerChat': 'Per-chat mode — each chat keeps its own background (global by default).',
        'chat.scope.global': 'Global',
        'chat.scope.perchat': 'Per-chat',
        'global.heading': 'Global background',
        'global.hint': 'Shown in every chat unless a chat has its own.',
        'global.none': 'No global background set',
        'global.change': 'Change',
        'prompt.pickGlobalTitle': 'Choose global background',
        'settings.intro': 'Browse, organize and link backgrounds to chats — all from one clean panel.',
        'settings.open': 'Open Background Manager',
        'settings.behaviorHeading': 'Behavior',
        'settings.displayHeading': 'Display',
        'settings.hijack': 'Open manager instead of the default Backgrounds drawer',
        'settings.hijackDesc': 'Clicking the Backgrounds drawer button opens this manager.',
        'settings.confirmApply': 'Confirm before applying a background',
        'settings.confirmApplyDesc': 'Ask before applying or linking a background.',
        'settings.thumbSize': 'Thumbnail size',
        'settings.thumbSizeDesc': 'Grid density inside the manager.',
        'settings.pageSize': 'Backgrounds per page',
        'settings.pageSizeDesc': 'Fewer per page keeps large libraries fast.',
        'settings.thumb.small': 'Small',
        'settings.thumb.medium': 'Medium',
        'settings.thumb.large': 'Large',
        'card.linkChat': 'Link to this chat',
        'card.unlinkChat': 'Unlink from chat',
        'card.linkDisabledMode': 'Switch to Per-chat mode to link backgrounds.',
        'card.rename': 'Rename',
        'card.move': 'Move to folder',
        'card.removeFromFolder': 'Remove from this folder',
        'card.delete': 'Delete',
        'badge.linked': 'Linked here',
        'badge.animated': 'Animated',
        'badge.inFolders': '{n} folders',
        'toast.noChat': 'Open a chat first to link a background.',
        'toast.appliedGlobal': 'Set as global background.',
        'toast.linked': 'Linked to this chat.',
        'toast.modePerChatNoChat': 'Per-chat mode on. Open a chat to give it its own background.',
        'toast.unlinked': 'Reverted to the global background.',
        'toast.renamed': 'Background renamed.',
        'toast.nameExists': 'A background with that name already exists.',
        'toast.deleted': 'Background deleted.',
        'toast.removedFromFolder': 'Removed from folder.',
        'toast.uploaded': 'Background uploaded.',
        'toast.uploadedMany': '{n} backgrounds uploaded.',
        'toast.uploadedPartial': '{ok} of {total} backgrounds uploaded.',
        'toast.folderCreated': 'Folder created.',
        'toast.folderRenamed': 'Folder renamed.',
        'toast.folderDeleted': 'Folder deleted.',
        'toast.moved': 'Moved.',
        'toast.error': 'Something went wrong.',
        'prompt.renameTitle': 'Rename background',
        'prompt.renameText': 'Enter a new name (without extension):',
        'prompt.pickFolderText': 'Please choose a folder to move to:',
        'prompt.newFolderTitle': 'New folder',
        'prompt.newFolderText': 'Enter a folder name:',
        'prompt.renameFolderTitle': 'Rename folder',
        'prompt.deleteTitle': 'Delete background?',
        'prompt.deleteText': 'This permanently removes the file from the server.',
        'prompt.bulkDeleteTitle': 'Delete {n} background(s)?',
        'prompt.deleteFolderTitle': 'Delete folder "{name}"?',
        'prompt.deleteFolderText': 'Backgrounds are kept, only the grouping is removed.',
        'prompt.applyTitle': 'Apply background?',
    },
    ru: {
        'app.title': '⊹ Менеджер фонов ⊹',
        'app.subtitle': 'Просмотр, сортировка и привязка фонов к чатам.',
        'action.refresh': 'Обновить',
        'action.close': 'Закрыть',
        'action.selectAll': 'Выбрать все',
        'action.cancel': 'Отмена',
        'action.move': 'Переместить',
        'action.delete': 'Удалить',
        'toolbar.search': 'Поиск фонов',
        'toolbar.upload': 'Загрузить',
        'toolbar.newFolder': 'Новая папка',
        'sort.az': 'Имя А-Я',
        'sort.za': 'Имя Я-А',
        'sort.newest': 'Сначала новые',
        'sort.oldest': 'Сначала старые',
        'folder.all': 'Все',
        'folder.heading': 'Папки',
        'folder.hint': 'Перетащите фоны сюда для сортировки.',
        'folder.allBackgrounds': 'Все фоны',
        'folder.unfiled': 'Несортированное',
        'folder.chat': 'Этот чат',
        'status.loading': 'Загрузка фонов...',
        'status.empty': 'Нет фонов для этого вида.',
        'pager.prev': 'Предыдущая страница',
        'pager.next': 'Следующая страница',
        'pager.range': '{from}–{to} из {total}',
        'chat.bar.modeGlobal': 'Глобальный режим — во всех чатах общий фон.',
        'chat.bar.modePerChat': 'Режим «для чата» — у каждого чата свой фон (по умолчанию глобальный).',
        'chat.scope.global': 'Глобально',
        'chat.scope.perchat': 'Для чата',
        'global.heading': 'Глобальный фон',
        'global.hint': 'Показывается во всех чатах, если у чата нет своего.',
        'global.none': 'Глобальный фон не задан',
        'global.change': 'Изменить',
        'prompt.pickGlobalTitle': 'Выберите глобальный фон',
        'settings.intro': 'Просматривайте, сортируйте и привязывайте фоны к чатам — всё в одной аккуратной панели.',
        'settings.open': 'Открыть менеджер фонов',
        'settings.behaviorHeading': 'Поведение',
        'settings.displayHeading': 'Отображение',
        'settings.hijack': 'Открывать менеджер вместо стандартной панели фонов',
        'settings.hijackDesc': 'Нажатие на кнопку панели фонов открывает этот менеджер.',
        'settings.confirmApply': 'Подтверждать применение фона',
        'settings.confirmApplyDesc': 'Спрашивать перед применением или привязкой фона.',
        'settings.thumbSize': 'Размер миниатюр',
        'settings.thumbSizeDesc': 'Плотность сетки внутри менеджера.',
        'settings.pageSize': 'Фонов на странице',
        'settings.pageSizeDesc': 'Меньше на странице — быстрее работает большая библиотека.',
        'settings.thumb.small': 'Маленький',
        'settings.thumb.medium': 'Средний',
        'settings.thumb.large': 'Большой',
        'card.linkChat': 'Привязать к чату',
        'card.unlinkChat': 'Отвязать от чата',
        'card.linkDisabledMode': 'Включите режим «для чата», чтобы привязывать фоны.',
        'card.rename': 'Переименовать',
        'card.move': 'В папку',
        'card.removeFromFolder': 'Убрать из этой папки',
        'card.delete': 'Удалить',
        'badge.linked': 'Привязан',
        'badge.animated': 'Анимация',
        'badge.inFolders': 'Папок: {n}',
        'toast.noChat': 'Сначала откройте чат для привязки фона.',
        'toast.appliedGlobal': 'Установлен как глобальный фон.',
        'toast.linked': 'Привязан к этому чату.',
        'toast.modePerChatNoChat': 'Режим «для чата» включён. Откройте чат, чтобы задать ему свой фон.',
        'toast.unlinked': 'Возврат к глобальному фону.',
        'toast.renamed': 'Фон переименован.',
        'toast.nameExists': 'Фон с таким именем уже существует.',
        'toast.deleted': 'Фон удалён.',
        'toast.removedFromFolder': 'Убрано из папки.',
        'toast.uploaded': 'Фон загружен.',
        'toast.uploadedMany': 'Загружено фонов: {n}.',
        'toast.uploadedPartial': 'Загружено {ok} из {total} фонов.',
        'toast.folderCreated': 'Папка создана.',
        'toast.folderRenamed': 'Папка переименована.',
        'toast.folderDeleted': 'Папка удалена.',
        'toast.moved': 'Перемещено.',
        'toast.error': 'Что-то пошло не так.',
        'prompt.renameTitle': 'Переименовать фон',
        'prompt.renameText': 'Введите новое имя (без расширения):',
        'prompt.pickFolderText': 'Выберите папку для перемещения:',
        'prompt.newFolderTitle': 'Новая папка',
        'prompt.newFolderText': 'Введите имя папки:',
        'prompt.renameFolderTitle': 'Переименовать папку',
        'prompt.deleteTitle': 'Удалить фон?',
        'prompt.deleteText': 'Файл будет навсегда удалён с сервера.',
        'prompt.bulkDeleteTitle': 'Удалить фоны ({n} шт.)?',
        'prompt.deleteFolderTitle': 'Удалить папку «{name}»?',
        'prompt.deleteFolderText': 'Фоны останутся, удаляется только группировка.',
        'prompt.applyTitle': 'Применить фон?',
    },
};

let LANG = 'en';

// EN by default; RU only when ST's own locale is RU (navigator language ignored).
function detectLang() {
    const candidates = [];
    try {
        const c = getContext();
        if (c && typeof c.getCurrentLocale === 'function') candidates.push(c.getCurrentLocale());
        candidates.push(c?.powerUserSettings?.locale);
    } catch (_) { /* ignore */ }
    try { candidates.push(localStorage.getItem('language')); } catch (_) { /* ignore */ }
    for (const raw of candidates) {
        if (typeof raw !== 'string' || !raw) continue;
        const lang = raw.toLowerCase().split(/[-_]/)[0];
        if (lang === 'ru') return 'ru';
    }
    return 'en';
}

function t(key, params) {
    let str = (I18N[LANG] && I18N[LANG][key]) ?? I18N.en[key] ?? key;
    if (params) {
        str = str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
    }
    return str;
}

function i18nApplyDom(root) {
    if (!root) return;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.getAttribute('data-i18n'));
    });
    const attrs = [['data-i18n-title', 'title'], ['data-i18n-placeholder', 'placeholder'], ['data-i18n-aria-label', 'aria-label']];
    for (const [dataAttr, realAttr] of attrs) {
        root.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
            el.setAttribute(realAttr, t(el.getAttribute(dataAttr)));
        });
    }
}

// ── Context & extension name ──────────────────────────────────────────────
function getContext() {
    return SillyTavern.getContext();
}

// Native backgrounds module exports `background_settings` (live global), not on
// getContext(). Imported once; primary source for global detection.
let _bgModule = null;
let _bgModulePromise = null;
function loadBgModule() {
    if (_bgModule) return Promise.resolve(_bgModule);
    if (!_bgModulePromise) {
        _bgModulePromise = import('/scripts/backgrounds.js')
            .then((mod) => { _bgModule = mod; return mod; })
            .catch((err) => { console.error('[BGM] could not import native backgrounds module', err); return null; });
    }
    return _bgModulePromise;
}

// The native global background URL (CSS url(...) string), or '' if unknown.
function getGlobalBgUrl() {
    try {
        const url = _bgModule?.background_settings?.url;
        if (typeof url === 'string' && url) return url;
    } catch (_) { /* continue */ }
    const name = getGlobalBgName();
    return name ? getBackgroundCssUrl(name) : '';
}

// Event enum is `event_types` (alias `eventTypes`); check both.
function getEventTypes() {
    const ctx = getContext();
    return ctx?.event_types || ctx?.eventTypes || {};
}

const EXTENSION_NAME = (() => {
    try {
        const pathname = new URL(import.meta.url).pathname;
        const match = pathname.match(/\/scripts\/extensions\/(.+)\/[^/]+$/);
        if (match?.[1]) return decodeURIComponent(match[1]);
    } catch (_) { /* ignore */ }
    return 'third-party/background-manager';
})();

// ── Settings ──────────────────────────────────────────────────────────────
function isObject(v) {
    return v && typeof v === 'object' && !Array.isArray(v);
}

function getSettings() {
    const ctx = getContext();
    if (!isObject(ctx.extensionSettings[MODULE_SETTINGS_KEY])) {
        ctx.extensionSettings[MODULE_SETTINGS_KEY] = structuredClone(DEFAULT_SETTINGS);
    }
    const s = ctx.extensionSettings[MODULE_SETTINGS_KEY];
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(s, key)) s[key] = DEFAULT_SETTINGS[key];
    }
    if (!THUMB_SIZES.includes(s.thumbSize)) s.thumbSize = DEFAULT_SETTINGS.thumbSize;
    if (!PAGE_SIZES.includes(Number(s.pageSize))) s.pageSize = DEFAULT_SETTINGS.pageSize;
    return s;
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

// ── Security helpers ──────────────────────────────────────────────────────
// Reject path traversal, protocol URLs, control chars. Run before every
// delete/rename/folder call and on every filename ingested from the server.
function isSafeBackgroundFile(name) {
    if (typeof name !== 'string' || !name) return false;
    if (name.includes('..') || name.includes('/') || name.includes('\\') || name.includes('\0')) return false;
    if (/[\u0000-\u001f]/.test(name)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(name)) return false;
    return true;
}

// Sanitize a user-typed name into a safe single filename component.
function sanitizeNameComponent(name) {
    return String(name ?? '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_')  // strip path / illegal chars
        .replace(/\.{2,}/g, '.')                       // collapse runs of dots (no "..")
        .replace(/^\.+/, '')                           // no leading dots (hidden files / traversal)
        .replace(/\.+$/g, '')                          // no trailing dots
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

function getFileExtension(name) {
    const m = String(name || '').match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : '';
}

function stripExtension(name) {
    const ext = getFileExtension(name);
    return ext ? name.slice(0, name.length - ext.length - 1) : name;
}

const ANIMATED_EXTENSIONS = ['mp4', 'webp', 'gif', 'apng', 'webm'];
function isAnimatedExtension(name) {
    return ANIMATED_EXTENSIONS.includes(getFileExtension(name));
}

// ── Background path / url helpers (mirror native generateUrlParameter) ─────
function getBackgroundPath(file) {
    return `backgrounds/${encodeURIComponent(file)}`;
}

function getBackgroundCssUrl(file) {
    return `url("${getBackgroundPath(file)}")`;
}

function stableId(file) {
    return `bgm-${fnv1a(file).toString(16)}`;
}

// ── Native chat-metadata access (never cache the reference) ─────────────────
function getChatId() {
    try {
        const ctx = getContext();
        return ctx.getCurrentChatId?.() ?? ctx.chatId ?? null;
    } catch (_) {
        return null;
    }
}

function hasOpenChat() {
    const id = getChatId();
    return id !== undefined && id !== null && id !== '';
}

function getLockedBgUrl() {
    try {
        return getContext().chatMetadata?.[BG_METADATA_KEY] || '';
    } catch (_) {
        return '';
    }
}

// True if a given system background file is the one locked to the current chat.
function isLinkedToChat(file) {
    const locked = getLockedBgUrl();
    if (!locked) return false;
    return locked === getBackgroundCssUrl(file);
}

// Global background filename (never the per-chat lock), or ''.
// Order: live module export → persisted power_user → native gallery highlight.
// #bg1 is never read — it shows the linked bg while locked.
function getGlobalBgName() {
    try {
        const name = _bgModule?.background_settings?.name;
        if (typeof name === 'string' && name && isSafeBackgroundFile(name)) return name;
    } catch (_) { /* continue */ }

    try {
        const name = getContext().powerUserSettings?.background?.name;
        if (typeof name === 'string' && name && isSafeBackgroundFile(name)) return name;
    } catch (_) { /* continue */ }

    try {
        const selected = document.querySelector('#bg_menu_content .bg_example.selected-background');
        const file = selected?.getAttribute('bgfile');
        if (file && isSafeBackgroundFile(file)) return file;
    } catch (_) { /* continue */ }

    return '';
}

// ── Server API ──────────────────────────────────────────────────────────────
function headers(extra) {
    return getContext().getRequestHeaders(extra);
}

async function apiFetchBackgrounds() {
    const res = await fetch('/api/backgrounds/all', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`backgrounds/all ${res.status}`);
    const payload = await res.json();
    const images = Array.isArray(payload?.images) ? payload.images : [];
    return images.map((img) => ({
        file: String(img.filename ?? img),
        isAnimated: Boolean(img.isAnimated) || isAnimatedExtension(String(img.filename ?? img)),
    })).filter((b) => isSafeBackgroundFile(b.file));
}

async function apiLoadFolders() {
    try {
        const res = await fetch('/api/backgrounds/folders', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({}),
        });
        if (!res.ok) return { folders: [], imageFolderMap: {} };
        const data = await res.json();
        return {
            folders: Array.isArray(data.folders) ? data.folders : [],
            imageFolderMap: isObject(data.imageFolderMap) ? data.imageFolderMap : {},
        };
    } catch (_) {
        return { folders: [], imageFolderMap: {} };
    }
}

// Upload timestamps for newest/oldest sort. Keys are raw `backgrounds/<file>`
// (not URL-encoded). Returns { file: addedTimestamp }; {} on failure.
async function apiLoadImageTimestamps() {
    try {
        const res = await fetch('/api/image-metadata/all', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ prefix: 'backgrounds/' }),
        });
        if (!res.ok) return {};
        const data = await res.json();
        const images = isObject(data?.images) ? data.images : {};
        const map = {};
        for (const [path, meta] of Object.entries(images)) {
            if (typeof path !== 'string' || !path.startsWith('backgrounds/')) continue;
            const file = path.slice('backgrounds/'.length);
            const ts = Number(meta?.addedTimestamp);
            if (file && Number.isFinite(ts)) map[file] = ts;
        }
        return map;
    } catch (_) {
        return {};
    }
}

async function apiDeleteBackground(file) {
    if (!isSafeBackgroundFile(file)) throw new Error('unsafe filename');
    const res = await fetch('/api/backgrounds/delete', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ bg: file }),
        cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`backgrounds/delete ${res.status}`);
}

async function apiRenameBackground(oldFile, newFile) {
    if (!isSafeBackgroundFile(oldFile) || !isSafeBackgroundFile(newFile)) throw new Error('unsafe filename');
    const res = await fetch('/api/backgrounds/rename', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ old_bg: oldFile, new_bg: newFile }),
        cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`backgrounds/rename ${res.status}`);
}

async function apiUploadBackground(formData) {
    const res = await fetch('/api/backgrounds/upload', {
        method: 'POST',
        headers: headers({ omitContentType: true }),
        body: formData,
        cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`backgrounds/upload ${res.status}`);
    return (await res.text()).trim();
}

async function apiFolderCreate(name) {
    const res = await fetch('/api/image-metadata/folders/create', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`folders/create ${res.status}`);
    return res.json();
}

async function apiFolderUpdate(payload) {
    const res = await fetch('/api/image-metadata/folders/update', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`folders/update ${res.status}`);
}

async function apiFolderDelete(id) {
    const res = await fetch('/api/image-metadata/folders/delete', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error(`folders/delete ${res.status}`);
}

async function apiFolderAssign(files, folderId, remove) {
    const paths = files.filter(isSafeBackgroundFile).map((f) => `backgrounds/${f}`);
    if (paths.length === 0) return;
    const endpoint = remove ? '/api/image-metadata/folders/unassign' : '/api/image-metadata/folders/assign';
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ id: folderId, paths }),
    });
    if (!res.ok) throw new Error(`folders/assign ${res.status}`);
}

// ── Popup helpers (via context) ─────────────────────────────────────────────
function popup() {
    return getContext().Popup;
}

// ── Scope mode (global vs per-chat) ─────────────────────────────────────────
function getScopeMode() {
    return getSettings().bgScope === 'per-chat' ? 'per-chat' : 'global';
}

function isPerChatMode() {
    return getScopeMode() === 'per-chat';
}

// Set #bg1 for the current mode without mutating the stored lock (reversible):
// global → always global; per-chat → lock if present, else global.
function applyScopeMode() {
    const globalUrl = getGlobalBgUrl();
    if (isPerChatMode()) {
        const locked = getLockedBgUrl();
        if (locked) setVisibleBackground(locked);
        else if (globalUrl) setVisibleBackground(globalUrl);
    } else if (globalUrl) {
        setVisibleBackground(globalUrl);
    }
}

// ── Apply / link operations ─────────────────────────────────────────────────
function setVisibleBackground(cssUrl) {
    const el = document.getElementById('bg1');
    if (el) el.style.backgroundImage = cssUrl;
}

// Set the global background by mutating the native `background_settings` export
// directly (script.js persists it by identity via saveSettingsDebounced).
// Avoids `/bg` (needs the hijacked gallery rendered) and FORCE_SET_BACKGROUND
// (locks to chat, not global).
async function applyGlobal(file) {
    let written = false;
    try {
        const mod = await loadBgModule();
        if (mod?.background_settings) {
            mod.background_settings.name = file;
            mod.background_settings.url = getBackgroundCssUrl(file);
            getContext().saveSettingsDebounced?.();
            written = true;
        }
    } catch (err) {
        console.error('[BGM] applyGlobal: module write failed', err);
    }

    // Fallback: persist via power_user if the module is unavailable.
    if (!written) {
        try {
            const pu = getContext().powerUserSettings;
            if (pu) {
                pu.background = pu.background || {};
                pu.background.name = file;
                pu.background.url = getBackgroundCssUrl(file);
                getContext().saveSettingsDebounced?.();
            }
        } catch (err) {
            console.error('[BGM] applyGlobal fallback failed', err);
        }
    }

    applyScopeMode();
    toastr.success(t('toast.appliedGlobal'));
    renderGrid();
}

// Link a background to the current chat via the native lock key.
async function linkToChat(file) {
    if (!hasOpenChat()) {
        toastr.info(t('toast.noChat'));
        return;
    }
    const ctx = getContext();
    const cssUrl = getBackgroundCssUrl(file);
    ctx.chatMetadata[BG_METADATA_KEY] = cssUrl;
    await ctx.saveMetadata();
    setVisibleBackground(cssUrl);
    toastr.success(t('toast.linked'));
    renderChatBar();
    renderGrid();
}

// Remove the per-chat lock and revert to the global background.
async function unlinkFromChat() {
    const ctx = getContext();
    if (!ctx.chatMetadata || !ctx.chatMetadata[BG_METADATA_KEY]) return;
    delete ctx.chatMetadata[BG_METADATA_KEY];
    await ctx.saveMetadata();
    applyScopeMode();
    toastr.info(t('toast.unlinked'));
    renderChatBar();
    renderGrid();
}

// ── Data refresh ────────────────────────────────────────────────────────────
async function refresh({ showLoader = false } = {}) {
    const token = ++state.refreshToken;
    if (showLoader) setLoading(true);
    try {
        const [backgrounds, folderData, timestamps] = await Promise.all([
            apiFetchBackgrounds(),
            apiLoadFolders(),
            apiLoadImageTimestamps(),
        ]);
        if (token !== state.refreshToken) return;
        state.backgrounds = backgrounds;
        state.folders = folderData.folders;
        state.imageFolderMap = folderData.imageFolderMap;
        state.timestamps = timestamps;
        // Validate active folder still exists.
        if (state.activeFolderId && !state.folders.some((f) => f.id === state.activeFolderId)) {
            state.activeFolderId = null;
        }
        render();
    } catch (err) {
        console.error('[BGM] refresh failed', err);
        setEmptyMessage(t('toast.error'));
        toastr.error(t('toast.error'));
    } finally {
        if (showLoader) setLoading(false);
    }
}

// ── Filtering / sorting ─────────────────────────────────────────────────────
function getVisibleBackgrounds() {
    const term = state.search.trim().toLowerCase();
    const folder = state.activeFolderId;

    let list = state.backgrounds.filter((bg) => {
        if (folder === '__unfiled__') {
            const fids = state.imageFolderMap[bg.file];
            if (fids && fids.length) return false;
        } else if (folder === '__chat__') {
            if (!isLinkedToChat(bg.file)) return false;
        } else if (folder && folder !== '__all__') {
            const fids = state.imageFolderMap[bg.file];
            if (!fids || !fids.includes(folder)) return false;
        }
        if (term && !bg.file.toLowerCase().includes(term)) return false;
        return true;
    });

    const cmp = (a, b) => a.file.localeCompare(b.file, undefined, { sensitivity: 'base' });
    // Missing timestamps sort as 0, tie-broken by name for stability.
    const ts = (b) => state.timestamps[b.file] ?? 0;
    switch (state.sort) {
        case 'za': list.sort((a, b) => cmp(b, a)); break;
        case 'newest': list.sort((a, b) => ts(b) - ts(a) || cmp(a, b)); break;
        case 'oldest': list.sort((a, b) => ts(a) - ts(b) || cmp(a, b)); break;
        case 'az':
        default: list.sort(cmp); break;
    }
    // Float the chat-linked background to the top (stable hoist).
    list.sort((a, b) => (isLinkedToChat(b.file) ? 1 : 0) - (isLinkedToChat(a.file) ? 1 : 0));
    return list;
}

// ── Rendering ────────────────────────────────────────────────────────────────
function setLoading(v) {
    state.isLoading = v;
    state.dom.loading?.classList.toggle('bgm_hidden', !v);
}

function setEmptyMessage(msg = '') {
    if (!state.dom.empty) return;
    state.dom.empty.textContent = msg;
    state.dom.empty.classList.toggle('bgm_hidden', !msg);
}

function render() {
    if (!state.dom.modal || !state.isOpen) return;
    renderChatBar();
    renderGlobalCard();
    renderFolderTree();
    renderGrid();
    renderHeader();
    updateSelectUI();
}

// Render the Global-background card (the single place to view/change global).
function renderGlobalCard() {
    const { globalThumb, globalName } = state.dom;
    if (!globalName) return;
    const file = getGlobalBgName();
    if (file && state.backgrounds.some((b) => b.file === file)) {
        globalName.textContent = stripExtension(file);
        if (globalThumb) {
            globalThumb.style.backgroundImage = getBackgroundCssUrl(file);
            globalThumb.classList.remove('is-empty');
        }
    } else {
        globalName.textContent = t('global.none');
        if (globalThumb) {
            globalThumb.style.backgroundImage = '';
            globalThumb.classList.add('is-empty');
        }
    }
}

function renderHeader() {
    if (!state.dom.summary) return;
    const visible = getVisibleBackgrounds().length;
    state.dom.summary.textContent = `${visible} / ${state.backgrounds.length}`;
    if (state.dom.breadcrumb) {
        state.dom.breadcrumb.textContent = getActiveFolderLabel();
    }
    if (state.dom.sidebarToggleLabel) {
        state.dom.sidebarToggleLabel.textContent = getActiveFolderLabel();
    }
}

function getActiveFolderLabel() {
    const id = state.activeFolderId;
    if (!id || id === '__all__') return t('folder.allBackgrounds');
    if (id === '__unfiled__') return t('folder.unfiled');
    if (id === '__chat__') return t('folder.chat');
    return state.folders.find((f) => f.id === id)?.name || t('folder.allBackgrounds');
}

function renderChatBar() {
    if (!state.dom.chatBarText) return;
    const perChat = isPerChatMode();
    // Mode preference, not a per-chat action — always available.
    state.dom.chatBarText.textContent = perChat
        ? t('chat.bar.modePerChat')
        : t('chat.bar.modeGlobal');

    state.dom.scopeGlobal?.classList.toggle('is-active', !perChat);
    state.dom.scopeChat?.classList.toggle('is-active', perChat);
    state.dom.scopeGlobal?.removeAttribute('disabled');
    state.dom.scopeChat?.removeAttribute('disabled');
    state.dom.chatBar?.classList.toggle('is-linked', perChat);
}

// The active sidebar folder id, but only when it's a real folder (not one of
// the virtual views or "all"). Returns null otherwise.
function getActiveRealFolderId() {
    const id = state.activeFolderId;
    if (!id || ['__all__', '__unfiled__', '__chat__'].includes(id)) return null;
    return state.folders.some((f) => f.id === id) ? id : null;
}

// Folder names a file belongs to (synchronous; reads the already-loaded map).
function foldersOfFile(file) {
    const ids = state.imageFolderMap[file];
    if (!Array.isArray(ids) || !ids.length) return [];
    return ids
        .map((id) => state.folders.find((f) => f.id === id)?.name)
        .filter((n) => typeof n === 'string' && n);
}

function countForFolder(id) {
    if (id === '__all__') return state.backgrounds.length;
    if (id === '__unfiled__') return state.backgrounds.filter((b) => !(state.imageFolderMap[b.file]?.length)).length;
    if (id === '__chat__') return state.backgrounds.filter((b) => isLinkedToChat(b.file)).length;
    return state.backgrounds.filter((b) => state.imageFolderMap[b.file]?.includes(id)).length;
}

function renderFolderTree() {
    const tree = state.dom.folderTree;
    if (!tree) return;
    tree.innerHTML = '';

    tree.appendChild(createVirtualRow('__all__', t('folder.allBackgrounds'), 'fa-layer-group', false));
    tree.appendChild(createVirtualRow('__unfiled__', t('folder.unfiled'), 'fa-inbox', true));
    if (hasOpenChat()) {
        tree.appendChild(createVirtualRow('__chat__', t('folder.chat'), 'fa-comments', false));
    }

    state.folders
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((folder) => tree.appendChild(createFolderRow(folder)));
}

function createVirtualRow(id, label, icon, dropTarget) {
    const row = document.createElement('div');
    row.className = 'bgm_folder_row bgm_virtual_row';
    if (state.activeFolderId === id || (!state.activeFolderId && id === '__all__')) row.classList.add('is-selected');
    if (dropTarget) {
        row.dataset.bgmDropTarget = id;
        row.classList.add('bgm_folder_target');
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bgm_folder_button';
    button.dataset.bgmFolderAction = 'select';
    button.dataset.folderId = id;

    const i = document.createElement('i');
    i.className = `fa-solid ${icon}`;
    const name = document.createElement('span');
    name.className = 'bgm_folder_name';
    name.textContent = label;
    const count = document.createElement('span');
    count.className = 'bgm_folder_count';
    count.textContent = String(countForFolder(id));

    button.append(i, name, count);
    row.appendChild(button);
    return row;
}

function createFolderRow(folder) {
    const row = document.createElement('div');
    row.className = 'bgm_folder_row bgm_folder_target';
    row.dataset.bgmDropTarget = folder.id;
    if (state.activeFolderId === folder.id) row.classList.add('is-selected');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bgm_folder_button';
    button.dataset.bgmFolderAction = 'select';
    button.dataset.folderId = folder.id;

    const i = document.createElement('i');
    i.className = 'fa-solid fa-folder';
    const name = document.createElement('span');
    name.className = 'bgm_folder_name';
    name.textContent = folder.name;
    const count = document.createElement('span');
    count.className = 'bgm_folder_count';
    count.textContent = String(countForFolder(folder.id));
    button.append(i, name, count);

    const tools = document.createElement('div');
    tools.className = 'bgm_folder_tools';
    tools.append(
        folderToolButton('rename-folder', folder.id, t('card.rename'), 'fa-pencil'),
        folderToolButton('delete-folder', folder.id, t('card.delete'), 'fa-trash-can'),
    );

    row.append(button, tools);
    return row;
}

function folderToolButton(action, folderId, title, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'bgm_folder_tool';
    b.dataset.bgmFolderAction = action;
    b.dataset.folderId = folderId;
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    return b;
}

// Total pages for a given visible count (>= 1).
function totalPages(visibleCount) {
    return Math.max(1, Math.ceil(visibleCount / state.pageSize));
}

// Clamp currentPage into range and return it.
function clampCurrentPage(visibleCount) {
    const pages = totalPages(visibleCount);
    if (state.currentPage > pages) state.currentPage = pages;
    if (state.currentPage < 1) state.currentPage = 1;
    return state.currentPage;
}

// Slice the visible backgrounds down to the current page.
function getBackgroundsOnPage(visible) {
    const page = clampCurrentPage(visible.length);
    const start = (page - 1) * state.pageSize;
    return visible.slice(start, start + state.pageSize);
}

function renderGrid() {
    const grid = state.dom.grid;
    if (!grid) return;
    grid.dataset.thumb = getSettings().thumbSize;

    const visible = getVisibleBackgrounds();
    grid.innerHTML = '';

    if (!visible.length) {
        setEmptyMessage(state.isLoading ? '' : t('status.empty'));
        renderPager(0);
        return;
    }
    setEmptyMessage('');

    getBackgroundsOnPage(visible).forEach((bg) => grid.appendChild(createCard(bg)));
    renderPager(visible.length);
}

// Pager: « prev · page X / Y · A–B of N · next ». Hidden when a single page.
function renderPager(visibleCount) {
    const pager = state.dom.pager;
    if (!pager) return;
    const pages = totalPages(visibleCount);
    if (visibleCount === 0 || pages <= 1) {
        pager.classList.add('bgm_hidden');
        return;
    }
    pager.classList.remove('bgm_hidden');
    const page = clampCurrentPage(visibleCount);
    if (state.dom.pagerLabel) state.dom.pagerLabel.textContent = `${page} / ${pages}`;
    if (state.dom.pagerRange) {
        const from = (page - 1) * state.pageSize + 1;
        const to = Math.min(page * state.pageSize, visibleCount);
        state.dom.pagerRange.textContent = t('pager.range', { from, to, total: visibleCount });
    }
    state.dom.pagerPrev?.toggleAttribute('disabled', page <= 1);
    state.dom.pagerNext?.toggleAttribute('disabled', page >= pages);
}

function goToPage(delta) {
    const visible = getVisibleBackgrounds();
    const pages = totalPages(visible.length);
    const next = Math.min(pages, Math.max(1, state.currentPage + delta));
    if (next === state.currentPage) return;
    state.currentPage = next;
    renderGrid();
    state.dom.grid?.scrollTo?.({ top: 0 });
}

// Row layout: [✓] [thumb] [name + badges] [actions]. One baseline so action
// buttons are never clipped.
function createCard(bg) {
    const linked = isLinkedToChat(bg.file);

    const card = document.createElement('article');
    card.className = 'bgm_row';
    card.id = stableId(bg.file);
    card.draggable = true;
    card.dataset.bgmFile = bg.file;
    if (state.selected.has(bg.file)) card.classList.add('is-selected');
    if (linked) card.classList.add('is-linked');

    // Selection checkbox
    const checkbox = document.createElement('button');
    checkbox.type = 'button';
    checkbox.className = 'bgm_row_check';
    checkbox.dataset.bgmCardAction = 'toggle-select';
    checkbox.setAttribute('aria-label', 'Select');
    checkbox.innerHTML = state.selected.has(bg.file)
        ? '<i class="fa-solid fa-square-check"></i>'
        : '<i class="fa-regular fa-square"></i>';

    // Thumbnail. Click links/unlinks in per-chat mode; inert in global mode.
    const thumb = document.createElement('div');
    thumb.className = 'bgm_row_thumb';
    thumb.style.backgroundImage = getBackgroundCssUrl(bg.file);
    thumb.title = bg.file;
    thumb.dataset.bgmCardAction = linked ? 'unlink-chat' : 'link-chat';
    if (!isPerChatMode()) {
        thumb.classList.add('bgm_disabled', 'bgm_disabled_mode');
    } else if (!hasOpenChat()) {
        thumb.classList.add('bgm_disabled');
    }
    if (bg.isAnimated) {
        const film = document.createElement('span');
        film.className = 'bgm_row_thumb_film';
        film.innerHTML = '<i class="fa-solid fa-film"></i>';
        thumb.appendChild(film);
    }

    // Name + badges
    const main = document.createElement('div');
    main.className = 'bgm_row_main';

    const title = document.createElement('span');
    title.className = 'bgm_row_title';
    title.textContent = stripExtension(bg.file);
    title.title = t('card.rename');
    title.dataset.bgmCardAction = 'rename-inline';
    title.tabIndex = 0;

    const meta = document.createElement('div');
    meta.className = 'bgm_row_meta';
    // Rows show Linked/Animated/In-folder; global is set in the card above.
    if (linked) meta.appendChild(makeBadge(t('badge.linked'), 'fa-link', 'is-linked'));
    if (bg.isAnimated) meta.appendChild(makeBadge(t('badge.animated'), 'fa-film', 'is-animated'));
    const folderNames = foldersOfFile(bg.file);
    if (folderNames.length) {
        const label = folderNames.length === 1 ? folderNames[0] : t('badge.inFolders', { n: folderNames.length });
        const badge = makeBadge(label, 'fa-folder', 'is-folder');
        badge.title = folderNames.join(', ');
        meta.appendChild(badge);
    }

    main.append(title, meta);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'bgm_row_actions';

    // Link toggle. Active when linked; enabled only in per-chat mode with a chat.
    const linkBtn = cardIconButton(
        linked ? 'unlink-chat' : 'link-chat',
        linked ? t('card.unlinkChat') : t('card.linkChat'),
        linked ? 'fa-link-slash' : 'fa-link',
    );
    linkBtn.classList.add('bgm_row_btn', 'bgm_row_btn_link');
    if (!isPerChatMode()) {
        linkBtn.classList.add('bgm_disabled', 'bgm_disabled_mode');
        linkBtn.title = t('card.linkDisabledMode');
        linkBtn.setAttribute('aria-label', t('card.linkDisabledMode'));
    } else if (!hasOpenChat()) {
        linkBtn.classList.add('bgm_disabled');
    }
    if (linked) linkBtn.classList.add('is-active');

    const renameBtn = cardIconButton('rename', t('card.rename'), 'fa-pencil');
    renameBtn.classList.add('bgm_row_btn');
    const moveBtn = cardIconButton('move', t('card.move'), 'fa-folder-open');
    moveBtn.classList.add('bgm_row_btn');
    const deleteBtn = cardIconButton('delete', t('card.delete'), 'fa-trash-can');
    deleteBtn.classList.add('bgm_row_btn', 'bgm_row_btn_danger');

    actions.append(linkBtn, renameBtn, moveBtn);

    // Inside a real folder view: quick "remove from this folder" (→ Unfiled).
    if (getActiveRealFolderId()) {
        const removeBtn = cardIconButton('remove-from-folder', t('card.removeFromFolder'), 'fa-folder-minus');
        removeBtn.classList.add('bgm_row_btn');
        actions.append(removeBtn);
    }

    actions.append(deleteBtn);

    card.append(checkbox, thumb, main, actions);
    return card;
}

function makeBadge(label, icon, cls) {
    const b = document.createElement('span');
    b.className = `bgm_badge ${cls}`;
    const i = document.createElement('i');
    i.className = `fa-solid ${icon}`;
    const span = document.createElement('span');
    span.textContent = label;
    b.append(i, span);
    return b;
}

function cardIconButton(action, label, icon) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'menu_button menu_button_icon interactable';
    b.dataset.bgmCardAction = action;
    b.title = label;
    b.setAttribute('aria-label', label);
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    return b;
}

// ── Selection ────────────────────────────────────────────────────────────────
function toggleSelection(file) {
    if (state.selected.has(file)) state.selected.delete(file);
    else state.selected.add(file);
    updateSelectUI();
}

function clearSelection() {
    state.selected.clear();
    updateSelectUI();
}

function updateSelectUI() {
    const count = state.selected.size;
    state.dom.selectBar?.classList.toggle('bgm_hidden', count === 0);
    if (state.dom.selectCount) state.dom.selectCount.textContent = `${count} selected`;
    state.dom.grid?.querySelectorAll('.bgm_row').forEach((card) => {
        const file = card.dataset.bgmFile;
        const sel = state.selected.has(file);
        card.classList.toggle('is-selected', sel);
        const icon = card.querySelector('.bgm_row_check i');
        if (icon) icon.className = sel ? 'fa-solid fa-square-check' : 'fa-regular fa-square';
    });
}

// ── Card actions ──────────────────────────────────────────────────────────
async function maybeConfirmApply() {
    if (!getSettings().confirmApply) return true;
    return Boolean(await popup().show.confirm(t('prompt.applyTitle'), ''));
}

async function onCardAction(action, file) {
    const bg = state.backgrounds.find((b) => b.file === file);
    if (!bg) return;

    switch (action) {
        case 'link-chat':
            if (await maybeConfirmApply()) await linkToChat(file);
            break;
        case 'unlink-chat':
            await unlinkFromChat();
            break;
        case 'rename':
            await renameBackground(file);
            break;
        case 'move':
            await moveBackgroundToFolder(file);
            break;
        case 'remove-from-folder':
            await removeFromActiveFolder(file);
            break;
        case 'delete':
            await deleteBackground(file);
            break;
        default:
            break;
    }
}

async function renameBackground(file) {
    const current = stripExtension(file);
    const input = await popup().show.input(t('prompt.renameTitle'), t('prompt.renameText'), current);
    if (input === null || input === undefined) return;
    await commitRename(file, input);
}

// Validate a new (extension-less) name, rename on the server, and re-point any
// global/per-chat references. Returns true on success.
async function commitRename(file, newBaseName) {
    const ext = getFileExtension(file);
    const current = stripExtension(file);
    const safe = sanitizeNameComponent(newBaseName);
    if (!safe || safe === current) return false;
    const newFile = ext ? `${safe}.${ext}` : safe;
    if (!isSafeBackgroundFile(newFile)) {
        toastr.error(t('toast.error'));
        return false;
    }
    if (state.backgrounds.some((b) => b.file === newFile)) {
        toastr.warning(t('toast.nameExists'));
        return false;
    }
    try {
        setLoading(true);
        const wasGlobal = file === getGlobalBgName();
        const wasLinked = isLinkedToChat(file);
        await apiRenameBackground(file, newFile);

        // Re-point old references.
        if (wasLinked) {
            const ctx = getContext();
            ctx.chatMetadata[BG_METADATA_KEY] = getBackgroundCssUrl(newFile);
            await ctx.saveMetadata();
        }
        if (wasGlobal) await applyGlobal(newFile);

        await refresh();
        toastr.success(t('toast.renamed'));
        return true;
    } catch (err) {
        console.error('[BGM] rename failed', err);
        toastr.error(t('toast.error'));
        return false;
    } finally {
        setLoading(false);
    }
}

// Inline rename: swap the title span for a text input.
function startInlineRename(card, file) {
    const titleSpan = card.querySelector('.bgm_row_title');
    if (!titleSpan || card.querySelector('.bgm_row_name_input')) return;

    const current = stripExtension(file);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'bgm_row_name_input text_pole';
    input.value = current;
    input.maxLength = 200;
    input.setAttribute('aria-label', t('card.rename'));
    // Swallow clicks so editing doesn't toggle row selection.
    input.addEventListener('click', (e) => e.stopPropagation());

    titleSpan.replaceWith(input);

    input.focus();
    input.select();

    let done = false;
    const finish = async (commit) => {
        if (done) return;
        done = true;
        if (commit) {
            const ok = await commitRename(file, input.value);
            if (!ok) renderGrid(); // restore original row if nothing changed
        } else {
            renderGrid();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

async function deleteBackground(file) {
    const ok = await popup().show.confirm(t('prompt.deleteTitle'), t('prompt.deleteText'));
    if (!ok) return;
    try {
        setLoading(true);
        // Drop a dangling lock first.
        if (isLinkedToChat(file)) await unlinkFromChat();
        await apiDeleteBackground(file);
        state.selected.delete(file);
        await refresh();
        toastr.success(t('toast.deleted'));
    } catch (err) {
        console.error('[BGM] delete failed', err);
        toastr.error(t('toast.error'));
    } finally {
        setLoading(false);
    }
}

async function moveBackgroundToFolder(file) {
    const folderId = await pickFolder();
    if (folderId === undefined) return; // cancelled
    try {
        const current = state.imageFolderMap[file] || [];
        // Remove from existing folders, then assign to the chosen one (or none).
        for (const fid of current) await apiFolderAssign([file], fid, true);
        if (folderId) await apiFolderAssign([file], folderId, false);
        await refresh();
        toastr.success(t('toast.moved'));
    } catch (err) {
        console.error('[BGM] move failed', err);
        toastr.error(t('toast.error'));
    }
}

// Quick-remove a background from the currently open folder (→ Unfiled if it
// has no other folders). No-op unless a real folder view is active.
async function removeFromActiveFolder(file) {
    const folderId = getActiveRealFolderId();
    if (!folderId) return;
    try {
        await apiFolderAssign([file], folderId, true);
        state.selected.delete(file);
        await refresh();
        toastr.success(t('toast.removedFromFolder'));
    } catch (err) {
        console.error('[BGM] remove from folder failed', err);
        toastr.error(t('toast.error'));
    }
}

// Folder picker. Returns folderId, '' for none, or undefined if cancelled.
async function pickFolder() {
    const ctx = getContext();
    const Popup = ctx.Popup;
    const POPUP_TYPE = ctx.POPUP_TYPE;

    const container = document.createElement('div');
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.marginBottom = '6px';
    label.textContent = t('prompt.pickFolderText');
    const select = document.createElement('select');
    select.className = 'text_pole';
    select.style.width = '100%';
    select.appendChild(new Option(t('folder.unfiled'), ''));
    state.folders
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((f) => select.appendChild(new Option(f.name, f.id)));
    container.append(label, select);

    const instance = new Popup(container, POPUP_TYPE?.CONFIRM ?? 2, '', {
        okButton: t('action.move'),
        cancelButton: t('action.cancel'),
    });
    const result = await instance.show();
    const affirmative = ctx.POPUP_RESULT?.AFFIRMATIVE ?? 1;
    if (result !== affirmative && result !== true) return undefined;
    return select.value;
}

// One clickable thumbnail tile for the global picker.
function buildPickTile(bg, current, onPick) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'bgm_pick_tile';
    tile.dataset.file = bg.file;
    tile.dataset.name = stripExtension(bg.file).toLowerCase();
    if (bg.file === current) tile.classList.add('is-current');

    const thumb = document.createElement('div');
    thumb.className = 'bgm_pick_thumb';
    thumb.style.backgroundImage = getBackgroundCssUrl(bg.file);

    const name = document.createElement('span');
    name.className = 'bgm_pick_name';
    name.textContent = stripExtension(bg.file);

    tile.append(thumb, name);
    tile.addEventListener('click', () => onPick(bg.file));
    return tile;
}

// Group backgrounds by folder. Returns ordered sections:
// [{ id, name, items[] }] for real folders (A-Z) then an Unfiled section.
function groupBackgroundsByFolder(list) {
    const byFolder = new Map(); // folderId -> items
    const unfiled = [];
    for (const bg of list) {
        const ids = state.imageFolderMap[bg.file];
        if (Array.isArray(ids) && ids.length) {
            for (const id of ids) {
                if (!byFolder.has(id)) byFolder.set(id, []);
                byFolder.get(id).push(bg);
            }
        } else {
            unfiled.push(bg);
        }
    }
    const sections = state.folders
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .filter((f) => byFolder.has(f.id))
        .map((f) => ({ id: f.id, name: f.name, items: byFolder.get(f.id) }));
    if (unfiled.length) sections.push({ id: '__unfiled__', name: t('folder.unfiled'), items: unfiled });
    return sections;
}

// Global picker: collapsible folder sections + search. A tile click resolves
// with the chosen file. The first section starts open; the rest are collapsed.
// The current global background is still highlighted via its tile.
async function pickGlobalBackground() {
    const ctx = getContext();
    const Popup = ctx.Popup;
    const POPUP_TYPE = ctx.POPUP_TYPE;

    const list = state.backgrounds.slice()
        .sort((a, b) => a.file.localeCompare(b.file, undefined, { sensitivity: 'base' }));
    if (!list.length) {
        toastr.info(t('status.empty'));
        return undefined;
    }

    const current = getGlobalBgName();

    const container = document.createElement('div');
    container.className = 'bgm_pick_wrap';

    const heading = document.createElement('h3');
    heading.className = 'bgm_pick_heading';
    heading.textContent = t('prompt.pickGlobalTitle');

    const searchWrap = document.createElement('div');
    searchWrap.className = 'bgm_pick_search';
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-magnifying-glass';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'text_pole';
    searchInput.placeholder = t('toolbar.search');
    searchWrap.append(searchIcon, searchInput);

    const sectionsWrap = document.createElement('div');
    sectionsWrap.className = 'bgm_pick_sections';

    let chosen;
    const instancePromise = { resolve: null };
    const onPick = (file) => { chosen = file; instancePromise.resolve?.(); };

    const sections = groupBackgroundsByFolder(list);
    const sectionEls = [];

    sections.forEach((section, index) => {
        // Open just the first section by default; the rest start collapsed.
        const open = index === 0;

        const sectionEl = document.createElement('div');
        sectionEl.className = 'bgm_pick_section' + (open ? '' : ' is-collapsed');

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'bgm_pick_section_header';
        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-down bgm_pick_chevron';
        const folderIcon = document.createElement('i');
        folderIcon.className = 'fa-solid fa-folder';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'bgm_pick_section_name';
        nameSpan.textContent = section.name;
        const countSpan = document.createElement('span');
        countSpan.className = 'bgm_pick_section_count';
        countSpan.textContent = String(section.items.length);
        header.append(chevron, folderIcon, nameSpan, countSpan);
        header.addEventListener('click', () => sectionEl.classList.toggle('is-collapsed'));

        const grid = document.createElement('div');
        grid.className = 'bgm_pick_grid';
        section.items.forEach((bg) => grid.appendChild(buildPickTile(bg, current, onPick)));

        sectionEl.append(header, grid);
        sectionsWrap.appendChild(sectionEl);
        sectionEls.push({ sectionEl, defaultOpen: open });
    });

    // Search across all folders; matching sections auto-expand, empties hide.
    searchInput.addEventListener('input', () => {
        const q = searchInput.value.trim().toLowerCase();
        for (const { sectionEl, defaultOpen } of sectionEls) {
            let anyVisible = false;
            sectionEl.querySelectorAll('.bgm_pick_tile').forEach((tile) => {
                const match = !q || tile.dataset.name.includes(q);
                tile.classList.toggle('bgm_hidden', !match);
                if (match) anyVisible = true;
            });
            sectionEl.classList.toggle('bgm_hidden', !anyVisible);
            if (q) sectionEl.classList.toggle('is-collapsed', !anyVisible);
            else sectionEl.classList.toggle('is-collapsed', !defaultOpen);
        }
    });

    container.append(heading, searchWrap, sectionsWrap);

    const instance = new Popup(container, POPUP_TYPE?.TEXT ?? 1, '', {
        okButton: false,
        cancelButton: t('action.cancel'),
        wide: true,
        allowVerticalScrolling: true,
    });
    // A tile click confirms the popup.
    instancePromise.resolve = () => instance.completeAffirmative();

    await instance.show();
    return chosen;
}

async function onPickGlobal() {
    const file = await pickGlobalBackground();
    if (!file || !isSafeBackgroundFile(file)) return;
    await applyGlobal(file);
    renderGlobalCard();
}

// ── Bulk actions ──────────────────────────────────────────────────────────
async function bulkDelete() {
    const files = [...state.selected];
    if (!files.length) return;
    const ok = await popup().show.confirm(t('prompt.bulkDeleteTitle', { n: files.length }), t('prompt.deleteText'));
    if (!ok) return;
    let deleted = 0;
    setLoading(true);
    for (const file of files) {
        try {
            if (isLinkedToChat(file)) await unlinkFromChat();
            await apiDeleteBackground(file);
            deleted++;
        } catch (err) {
            console.error('[BGM] bulk delete failed for', file, err);
        }
    }
    setLoading(false);
    clearSelection();
    await refresh();
    if (deleted) toastr.success(t('toast.deleted'));
}

async function bulkMove() {
    const files = [...state.selected];
    if (!files.length) return;
    const folderId = await pickFolder();
    if (folderId === undefined) return;
    try {
        for (const file of files) {
            const current = state.imageFolderMap[file] || [];
            for (const fid of current) await apiFolderAssign([file], fid, true);
        }
        if (folderId) await apiFolderAssign(files, folderId, false);
        clearSelection();
        await refresh();
        toastr.success(t('toast.moved'));
    } catch (err) {
        console.error('[BGM] bulk move failed', err);
        toastr.error(t('toast.error'));
    }
}

// ── Folder management ─────────────────────────────────────────────────────
async function createFolder() {
    const name = await popup().show.input(t('prompt.newFolderTitle'), t('prompt.newFolderText'), '');
    if (!name || !name.trim()) return;
    try {
        const folder = await apiFolderCreate(name.trim());
        if (folder?.id) state.folders.push(folder);
        await refresh();
        toastr.success(t('toast.folderCreated'));
    } catch (err) {
        console.error('[BGM] create folder failed', err);
        toastr.error(t('toast.error'));
    }
}

async function renameFolder(folderId) {
    const folder = state.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const name = await popup().show.input(t('prompt.renameFolderTitle'), '', folder.name);
    if (!name || !name.trim() || name.trim() === folder.name) return;
    try {
        await apiFolderUpdate({ id: folderId, name: name.trim() });
        folder.name = name.trim();
        render();
        toastr.success(t('toast.folderRenamed'));
    } catch (err) {
        console.error('[BGM] rename folder failed', err);
        toastr.error(t('toast.error'));
    }
}

async function deleteFolder(folderId) {
    const folder = state.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const ok = await popup().show.confirm(
        t('prompt.deleteFolderTitle', { name: folder.name }),
        t('prompt.deleteFolderText'),
    );
    if (!ok) return;
    try {
        await apiFolderDelete(folderId);
        if (state.activeFolderId === folderId) state.activeFolderId = null;
        await refresh();
        toastr.success(t('toast.folderDeleted'));
    } catch (err) {
        console.error('[BGM] delete folder failed', err);
        toastr.error(t('toast.error'));
    }
}

// ── Upload ────────────────────────────────────────────────────────────────
async function onUploadInput(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;

    setLoading(true);
    let uploaded = 0;
    for (const file of files) {
        if (!file || file.size === 0) continue;
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            await convertVideoIfNeeded(formData);
            if (!formData.has('avatar')) continue; // conversion failed / aborted
            const newName = await apiUploadBackground(formData);
            uploaded++;
            // Assign to the active folder if one is open.
            if (newName && isSafeBackgroundFile(newName)
                && state.activeFolderId
                && !['__all__', '__unfiled__', '__chat__'].includes(state.activeFolderId)) {
                try { await apiFolderAssign([newName], state.activeFolderId, false); } catch (_) { /* non-fatal */ }
            }
        } catch (err) {
            console.error('[BGM] upload failed', err);
        }
    }
    setLoading(false);
    await refresh();
    const failed = files.length - uploaded;
    if (uploaded && failed) {
        toastr.warning(t('toast.uploadedPartial', { ok: uploaded, total: files.length }));
    } else if (uploaded > 1) {
        toastr.success(t('toast.uploadedMany', { n: uploaded }));
    } else if (uploaded) {
        toastr.success(t('toast.uploaded'));
    } else if (failed) {
        toastr.error(t('toast.error'));
    }
}

// Convert video uploads via the Video Background Loader global (if installed).
async function convertVideoIfNeeded(formData) {
    const file = formData.get('avatar');
    if (!(file instanceof File) || !file.type?.startsWith('video/')) return;
    if (typeof globalThis.convertVideoToAnimatedWebp !== 'function') {
        toastr.warning('Install the Video Background Loader extension to upload videos as backgrounds.');
        formData.delete('avatar');
        return;
    }
    try {
        const buffer = await file.arrayBuffer();
        const converted = await globalThis.convertVideoToAnimatedWebp({
            buffer: new Uint8Array(buffer),
            name: file.name,
        });
        const name = `${stripExtension(file.name)}.webp`;
        formData.set('avatar', new File([new Uint8Array(converted)], name, { type: 'image/webp' }));
    } catch (err) {
        console.error('[BGM] video conversion failed', err);
        formData.delete('avatar');
    }
}

// ── Event binding ─────────────────────────────────────────────────────────
async function ensureDom() {
    if (state.dom.modal) return;

    const host = document.createElement('div');
    host.innerHTML = await getContext().renderExtensionTemplateAsync(EXTENSION_NAME, 'manager');
    const modal = host.firstElementChild;
    if (!modal) throw new Error('Failed to render Background Manager template');

    // Signature build stamp (CSS [data-build] depends on it).
    modal.dataset.build = buildStamp(VERSION);
    document.body.appendChild(modal);
    i18nApplyDom(modal);

    state.dom = {
        modal,
        refresh: modal.querySelector('#bgm_refresh'),
        search: modal.querySelector('#bgm_search'),
        sort: modal.querySelector('#bgm_sort'),
        upload: modal.querySelector('#bgm_upload'),
        uploadInput: modal.querySelector('#bgm_upload_input'),
        newFolder: modal.querySelector('#bgm_new_folder'),
        folderTree: modal.querySelector('#bgm_folder_tree'),
        breadcrumb: modal.querySelector('#bgm_breadcrumb'),
        summary: modal.querySelector('#bgm_summary'),
        loading: modal.querySelector('#bgm_loading'),
        empty: modal.querySelector('#bgm_empty'),
        grid: modal.querySelector('#bgm_grid'),
        pager: modal.querySelector('#bgm_pager'),
        pagerPrev: modal.querySelector('#bgm_pager_prev'),
        pagerNext: modal.querySelector('#bgm_pager_next'),
        pagerLabel: modal.querySelector('#bgm_pager_label'),
        pagerRange: modal.querySelector('#bgm_pager_range'),
        selectBar: modal.querySelector('#bgm_select_bar'),
        selectCount: modal.querySelector('#bgm_select_count'),
        selectAll: modal.querySelector('#bgm_select_all'),
        deselectAll: modal.querySelector('#bgm_deselect_all'),
        bulkMove: modal.querySelector('#bgm_bulk_move'),
        bulkDelete: modal.querySelector('#bgm_bulk_delete'),
        sidebar: modal.querySelector('#bgm_sidebar'),
        sidebarToggle: modal.querySelector('#bgm_sidebar_toggle'),
        sidebarToggleLabel: modal.querySelector('#bgm_sidebar_toggle_label'),
        chatBar: modal.querySelector('#bgm_chat_bar'),
        chatBarText: modal.querySelector('#bgm_chat_bar_text'),
        scopeGlobal: modal.querySelector('#bgm_scope_global'),
        scopeChat: modal.querySelector('#bgm_scope_chat'),
        globalCard: modal.querySelector('#bgm_global_card'),
        globalThumb: modal.querySelector('#bgm_global_thumb'),
        globalName: modal.querySelector('#bgm_global_name'),
        globalChange: modal.querySelector('#bgm_global_change'),
    };

    bindEvents();
}

function bindEvents() {
    const d = state.dom;

    d.modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-bgm-action="close"]')) closeManager();
    });
    d.refresh.addEventListener('click', () => refresh({ showLoader: true }));
    d.search.addEventListener('input', () => { state.search = d.search.value; state.currentPage = 1; renderGrid(); renderHeader(); });
    d.sort.addEventListener('change', () => {
        state.sort = d.sort.value;
        getSettings().sort = state.sort;
        saveSettings();
        state.currentPage = 1;
        renderGrid();
    });
    d.upload.addEventListener('click', () => d.uploadInput.click());
    d.uploadInput.addEventListener('change', onUploadInput);
    d.newFolder.addEventListener('click', createFolder);

    d.folderTree.addEventListener('click', onFolderTreeClick);
    d.folderTree.addEventListener('dragover', onFolderDragOver);
    d.folderTree.addEventListener('dragleave', onFolderDragLeave);
    d.folderTree.addEventListener('drop', onFolderDrop);

    d.grid.addEventListener('click', onGridClick);
    d.grid.addEventListener('dragstart', onCardDragStart);
    d.grid.addEventListener('dragend', onCardDragEnd);

    d.pagerPrev?.addEventListener('click', () => goToPage(-1));
    d.pagerNext?.addEventListener('click', () => goToPage(1));

    d.selectAll.addEventListener('click', onSelectAll);
    d.deselectAll.addEventListener('click', clearSelection);
    d.bulkMove.addEventListener('click', bulkMove);
    d.bulkDelete.addEventListener('click', bulkDelete);

    d.sidebarToggle.addEventListener('click', onSidebarToggle);
    d.scopeGlobal.addEventListener('click', () => setScopeMode('global'));
    d.scopeChat.addEventListener('click', () => setScopeMode('per-chat'));
    d.globalChange?.addEventListener('click', onPickGlobal);

    document.addEventListener('keydown', (e) => {
        if (state.isOpen && e.key === 'Escape') closeManager();
    });

    bindTouch();
}

function onFolderTreeClick(event) {
    const el = event.target.closest('[data-bgm-folder-action]');
    if (!el) return;
    const action = el.dataset.bgmFolderAction;
    const folderId = el.dataset.folderId || '';
    if (action === 'select') {
        state.activeFolderId = folderId === '__all__' ? null : folderId;
        getSettings().activeFolderId = state.activeFolderId;
        saveSettings();
        state.currentPage = 1;
        clearSelection();
        render();
        collapseMobileSidebar();
    } else if (action === 'rename-folder') {
        renameFolder(folderId);
    } else if (action === 'delete-folder') {
        deleteFolder(folderId);
    }
}

function onGridClick(event) {
    const actionEl = event.target.closest('[data-bgm-card-action]');
    const card = event.target.closest('.bgm_row');
    if (!card) return;
    const file = card.dataset.bgmFile;
    if (!file) return;

    if (actionEl) {
        const action = actionEl.dataset.bgmCardAction;

        // Name → inline rename.
        if (action === 'rename-inline') {
            startInlineRename(card, file);
            return;
        }
        // Checkbox → selection.
        if (action === 'toggle-select') {
            toggleSelection(file);
            return;
        }
        if (actionEl.classList.contains('bgm_disabled')) {
            toastr.info(actionEl.classList.contains('bgm_disabled_mode')
                ? t('card.linkDisabledMode')
                : t('toast.noChat'));
            return;
        }
        onCardAction(action, file);
        return;
    }

    // Empty row space → selection.
    toggleSelection(file);
}

function onSelectAll() {
    getVisibleBackgrounds().forEach((bg) => state.selected.add(bg.file));
    updateSelectUI();
}

// Switch scope mode (preserves per-chat lock data; reversible).
function setScopeMode(mode) {
    const next = mode === 'per-chat' ? 'per-chat' : 'global';
    if (getSettings().bgScope === next) return;
    getSettings().bgScope = next;
    saveSettings();
    applyScopeMode();
    if (next === 'per-chat' && !hasOpenChat()) toastr.info(t('toast.modePerChatNoChat'));
    render();
}

function onSidebarToggle(event) {
    event?.stopPropagation();
    const collapsed = state.dom.sidebar.classList.toggle('is-collapsed');
    state.dom.sidebarToggle.classList.toggle('is-open', !collapsed);
}

function collapseMobileSidebar() {
    const { sidebar, sidebarToggle } = state.dom;
    if (!sidebar || !sidebarToggle) return;
    if (sidebarToggle.offsetParent === null) return; // desktop
    sidebar.classList.add('is-collapsed');
    sidebarToggle.classList.remove('is-open');
}

// ── Desktop drag & drop ───────────────────────────────────────────────────
function onCardDragStart(event) {
    const card = event.target.closest('.bgm_row');
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData('text/bgm-file', card.dataset.bgmFile || '');
    event.dataTransfer.effectAllowed = 'move';
    card.classList.add('is-dragging');
}

function onCardDragEnd(event) {
    event.target.closest('.bgm_row')?.classList.remove('is-dragging');
}

function onFolderDragOver(event) {
    const target = event.target.closest('[data-bgm-drop-target]');
    if (!target) return;
    event.preventDefault();
    clearDropStyles();
    target.classList.add('is-drop-target');
}

function onFolderDragLeave(event) {
    event.target.closest('[data-bgm-drop-target]')?.classList.remove('is-drop-target');
}

async function onFolderDrop(event) {
    const target = event.target.closest('[data-bgm-drop-target]');
    const file = event.dataTransfer?.getData('text/bgm-file');
    clearDropStyles();
    if (!target || !file) return;
    event.preventDefault();
    const dropId = target.dataset.bgmDropTarget;
    await dropFileOnFolder(file, dropId);
}

async function dropFileOnFolder(file, dropId) {
    try {
        const current = state.imageFolderMap[file] || [];
        if (dropId === '__unfiled__') {
            for (const fid of current) await apiFolderAssign([file], fid, true);
        } else {
            for (const fid of current) await apiFolderAssign([file], fid, true);
            await apiFolderAssign([file], dropId, false);
        }
        await refresh();
        toastr.success(t('toast.moved'));
    } catch (err) {
        console.error('[BGM] drop move failed', err);
        toastr.error(t('toast.error'));
    }
}

function clearDropStyles() {
    state.dom.folderTree?.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
}

// ── Touch drag (mobile) ─────────────────────────────────────────────────────
const touch = {
    card: null, file: '', startX: 0, startY: 0, active: false,
    ghost: null, longPressTimer: null, longPressed: false,
    LONG_PRESS_MS: 350, THRESHOLD: 10,
};

function isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function bindTouch() {
    if (!isTouchDevice()) return;
    const grid = state.dom.grid;
    if (!grid) return;
    grid.addEventListener('touchstart', onTouchStart, { passive: true });
    grid.addEventListener('touchmove', onTouchMove, { passive: false });
    grid.addEventListener('touchend', onTouchEnd, { passive: true });
    grid.addEventListener('touchcancel', onTouchEnd, { passive: true });
}

function touchPos(e) {
    const tp = e.touches?.[0] || e.changedTouches?.[0];
    return tp ? { x: tp.clientX, y: tp.clientY } : { x: 0, y: 0 };
}

function onTouchStart(e) {
    if (e.target.closest('button, select, input, a')) return;
    const card = e.target.closest('.bgm_row');
    if (!card) return;
    const pos = touchPos(e);
    touch.card = card;
    touch.file = card.dataset.bgmFile || '';
    touch.startX = pos.x;
    touch.startY = pos.y;
    touch.active = false;
    touch.longPressed = false;
    clearTimeout(touch.longPressTimer);
    touch.longPressTimer = setTimeout(() => {
        touch.longPressed = true;
        if (navigator.vibrate) navigator.vibrate(25);
    }, touch.LONG_PRESS_MS);
}

function onTouchMove(e) {
    if (!touch.card) return;
    const pos = touchPos(e);
    const dist = Math.hypot(pos.x - touch.startX, pos.y - touch.startY);
    if (dist > touch.THRESHOLD) clearTimeout(touch.longPressTimer);
    if (!touch.active && dist > touch.THRESHOLD && touch.longPressed) {
        touch.active = true;
        touch.card.classList.add('is-dragging');
        touch.ghost = makeGhost(touch.card);
    }
    if (touch.active) {
        e.preventDefault();
        positionGhost(pos.x, pos.y);
        highlightTouchTarget(pos.x, pos.y);
    }
}

async function onTouchEnd(e) {
    clearTimeout(touch.longPressTimer);
    if (touch.active) {
        const pos = touchPos(e);
        const target = dropTargetAt(pos.x, pos.y);
        if (target && touch.file) await dropFileOnFolder(touch.file, target.dataset.bgmDropTarget);
        touch.card?.classList.remove('is-dragging');
        clearDropStyles();
        removeGhost();
    }
    touch.card = null;
    touch.file = '';
    touch.active = false;
    touch.longPressed = false;
}

function makeGhost(card) {
    const ghost = document.createElement('div');
    ghost.className = 'bgm_drag_ghost';
    const i = document.createElement('i');
    i.className = 'fa-solid fa-image';
    ghost.append(i, document.createTextNode(' ' + (card.querySelector('.bgm_row_title')?.textContent || '?')));
    document.body.appendChild(ghost);
    return ghost;
}

function positionGhost(x, y) {
    if (!touch.ghost) return;
    touch.ghost.style.left = `${x}px`;
    touch.ghost.style.top = `${y}px`;
}

function removeGhost() {
    touch.ghost?.remove();
    touch.ghost = null;
}

function dropTargetAt(x, y) {
    if (touch.ghost) touch.ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    if (touch.ghost) touch.ghost.style.display = '';
    return el?.closest('[data-bgm-drop-target]') || null;
}

function highlightTouchTarget(x, y) {
    clearDropStyles();
    dropTargetAt(x, y)?.classList.add('is-drop-target');
}

// ── Open / close ──────────────────────────────────────────────────────────
async function openManager() {
    await ensureDom();
    state.isOpen = true;
    state.activeFolderId = getSettings().activeFolderId || null;
    state.sort = getSettings().sort || 'az';
    state.pageSize = Number(getSettings().pageSize) || DEFAULT_SETTINGS.pageSize;
    state.currentPage = 1;
    state.dom.modal.classList.remove('bgm_hidden');
    state.dom.search.value = state.search;
    state.dom.sort.value = state.sort;
    collapseNativeBackgroundDrawer();
    await loadBgModule();
    applyScopeMode();
    await refresh({ showLoader: true });
}

function closeManager() {
    if (!state.dom.modal) return;
    state.isOpen = false;
    clearSelection();
    state.dom.modal.classList.add('bgm_hidden');
    clearDropStyles();
}

function collapseNativeBackgroundDrawer() {
    const drawer = document.getElementById('Backgrounds');
    if (drawer && !drawer.classList.contains('closedDrawer')) {
        // Bypass our hijack so this synthetic click only collapses the native drawer.
        state.suppressDrawerHijack = true;
        document.getElementById('backgrounds-drawer-toggle')?.click();
        state.suppressDrawerHijack = false;
    }
}

// ── Drawer hijack ─────────────────────────────────────────────────────────
function hijackBackgroundDrawer() {
    if (!getSettings().hijackDrawer) return;

    const drawerButton = document.getElementById('backgrounds-drawer-toggle');
    if (drawerButton && !drawerButton.dataset.bgmHijacked) {
        drawerButton.dataset.bgmHijacked = 'true';
        // Native top-bar button toggles our manager (open ↔ close); swallow native.
        drawerButton.addEventListener('click', (e) => {
            if (!getSettings().hijackDrawer) return;
            if (state.suppressDrawerHijack) return; // synthetic collapse click
            e.stopImmediatePropagation();
            e.preventDefault();
            if (state.isOpen) {
                closeManager();
            } else {
                openManager();
            }
        }, true);
    }
}

// Bind the drawer hijack once. The native top-bar button is present at load in
// practice; if not yet, retry a few times with a short delay instead of running
// a permanent MutationObserver (the old approach re-fired on every mutation
// inside the native gallery, which made the manager janky to interact with).
function startDrawerHijack(attempt = 0) {
    const button = document.getElementById('backgrounds-drawer-toggle');
    if (button) {
        hijackBackgroundDrawer();
        return;
    }
    if (attempt >= 20) return; // ~5s of bounded retries, then give up
    setTimeout(() => startDrawerHijack(attempt + 1), 250);
}

// ── Settings UI ───────────────────────────────────────────────────────────
function bindSettingsUI() {
    const s = getSettings();
    const $ = (id) => document.getElementById(id);

    const openBtn = $('bgm_open_button');
    const hijack = $('bgm_hijack_drawer');
    const confirmApply = $('bgm_confirm_apply');
    const thumbSize = $('bgm_thumb_size');
    const pageSize = $('bgm_page_size');

    if (openBtn) openBtn.addEventListener('click', openManager);
    if (hijack) {
        hijack.checked = s.hijackDrawer;
        hijack.addEventListener('change', () => { s.hijackDrawer = hijack.checked; saveSettings(); });
    }
    if (confirmApply) {
        confirmApply.checked = s.confirmApply;
        confirmApply.addEventListener('change', () => { s.confirmApply = confirmApply.checked; saveSettings(); });
    }
    if (thumbSize) {
        thumbSize.value = s.thumbSize;
        thumbSize.addEventListener('change', () => {
            s.thumbSize = THUMB_SIZES.includes(thumbSize.value) ? thumbSize.value : 'medium';
            saveSettings();
            if (state.isOpen) renderGrid();
        });
    }
    if (pageSize) {
        pageSize.value = String(s.pageSize);
        pageSize.addEventListener('change', () => {
            const val = Number(pageSize.value);
            s.pageSize = PAGE_SIZES.includes(val) ? val : DEFAULT_SETTINGS.pageSize;
            saveSettings();
            if (state.isOpen) {
                state.pageSize = s.pageSize;
                state.currentPage = 1;
                renderGrid();
            }
        });
    }
}

function bindChatChange() {
    if (state.boundChatHandler) return;
    try {
        const ctx = getContext();
        const evt = getEventTypes().CHAT_CHANGED;
        const src = ctx.eventSource;
        if (src && evt) {
            src.on(evt, () => {
                // Enforce scope mode on every chat switch (even when closed).
                applyScopeMode();
                if (state.isOpen) { renderChatBar(); renderGrid(); }
            });
            state.boundChatHandler = true;
        }
    } catch (err) {
        console.error('[BGM] failed to bind CHAT_CHANGED', err);
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
jQuery(async () => {
    try {
        LANG = detectLang();
        const settingsHtml = await getContext().renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
        const wrap = document.createElement('div');
        wrap.innerHTML = settingsHtml;
        i18nApplyDom(wrap);
        document.getElementById('extensions_settings')?.append(...wrap.childNodes);
    } catch (err) {
        console.error('[BGM] failed to inject settings', err);
    }

    getSettings();
    bindSettingsUI();
    startDrawerHijack();
    bindChatChange();

    // Warm the module, then enforce the saved scope mode on load.
    loadBgModule().then(() => applyScopeMode());
});
