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

const THUMB_SIZES = Object.freeze(['small', 'medium', 'large']);
const PAGE_SIZES = Object.freeze([10, 30, 60, 100]);
const GRID_COLUMNS = ['auto', '3', '4', '5', '6', '7', '8', '9', '10'];
const ASPECT_RATIOS = ['16 / 9', '4 / 3', '3 / 2', '1 / 1'];
const ASSIGNMENT_SCOPES = ['global', 'chat', 'character', 'theme'];
const warn = (step, err) => console.warn(`[BGM] ${step}`, err);

const DEFAULT_SETTINGS = Object.freeze({
    hijackDrawer: true,
    confirmApply: false,
    thumbSize: 'medium',
    view: 'rows',
    gridColumns: '4',
    aspectRatio: '16 / 9',
    assignmentScope: 'global',
    characterBackgrounds: {},
    themeBackgrounds: {},
    sort: 'az',
    pageSize: 30,
    activeFolderId: null,
});

const _SIG_DELTAS = [97, 2, 2, 0, 9, 8, 1];
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
const VERSION = '1.1.0';

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
    selectionMode: false,
    refreshToken: 0,
    dom: {},
    boundChatHandler: false,
    suppressDrawerHijack: false,
    lastFocusedElement: null,
    refreshController: null,
    contextTimer: null,
    actionBusy: false,
    folderCounts: new Map(),
    drawerTimer: null,
    eventSource: null,
    contextEvents: [],
    libraryLoaded: false,
    foldersReady: false,
    searchFrame: 0,
    backgroundObserver: null,
    lastVisibleBackground: '',
    contextKey: '',
    inlineEditor: null,
};
const lifetime = new AbortController();

// ── i18n (EN / RU) ────────────────────────────────────────────────────────
const I18N = {
    en: {
        'toolbar.more': 'More',
        'toolbar.sort': 'Sort backgrounds',
        'toolbar.viewRows': 'Switch to rows',
        'toolbar.viewGrid': 'Switch to grid',
        'toolbar.select': 'Select backgrounds',
        'toolbar.native': 'Native background controls',
        'selection.empty': 'Select backgrounds for bulk actions',
        'action.select': 'Select background',
        'action.selected': '{n} selected',
        'action.assign': 'Apply to selected scope',
        'action.clearAssignment': 'Remove assignment (use fallback)',
        'scope.label': 'Assign to',
        'scope.global': 'Global',
        'scope.chat': 'Chat',
        'scope.character': 'Character / group',
        'scope.theme': 'Theme',
        'scope.none': 'No background',
        'scope.custom': 'Custom background',
        'scope.unavailable': 'Open a chat, select a character/group, or choose a theme first.',
        'scope.active': 'Active · {scope}',
        'status.noFolders': 'Folder information unavailable. Refresh to retry.',
        'settings.view': 'Library view',
        'settings.rows': 'Rows',
        'settings.grid': 'Grid',
        'settings.columns': 'Cards per row',
        'settings.columnsDesc': 'Maximum desktop columns; two on phones.',
        'settings.auto': 'Auto',
        'settings.ratio': 'Image ratio',
        'settings.ratioDesc': 'Thumbnail proportions in grid view.',
        'toast.videoLoader': 'Install Video Background Loader to upload videos as backgrounds.',
        'action.refresh': 'Refresh',
        'action.close': 'Close',
        'action.selectAll': 'Select page',
        'action.cancel': 'Cancel',
        'action.move': 'Move',
        'action.addToFolder': 'Add to folder',
        'action.delete': 'Delete',
        'toolbar.search': 'Search backgrounds',
        'toolbar.upload': 'Upload',
        'toolbar.uploadVideo': 'Upload video',
        'toolbar.newFolder': 'New Folder',
        'sort.az': 'Name A-Z',
        'sort.za': 'Name Z-A',
        'sort.newest': 'Newest first',
        'sort.oldest': 'Oldest first',
        'folder.all': 'All',
        'folder.heading': 'Folders',
        'folder.allBackgrounds': 'All Backgrounds',
        'folder.unfiled': 'Unsorted',
        'folder.chat': 'This Chat',
        'status.loading': 'Loading backgrounds...',
        'status.empty': 'No backgrounds match this view yet.',
        'pager.prev': 'Previous page',
        'pager.next': 'Next page',
        'pager.range': '{from}–{to} of {total}',
        'settings.intro': 'Browse, organize and link backgrounds to chats — all from one clean panel.',
        'settings.open': 'Open Background Manager',
        'settings.behaviorHeading': 'Behavior',
        'settings.displayHeading': 'Display',
        'settings.hijack': 'Open manager instead of the default Backgrounds drawer',
        'settings.hijackDesc': 'Clicking the Backgrounds drawer button opens this manager.',
        'settings.confirmApply': 'Confirm before applying a background',
        'settings.confirmApplyDesc': 'Ask before applying or linking a background.',
        'settings.thumbSize': 'Thumbnail size',
        'settings.thumbSizeDesc': 'Preview size in row view.',
        'settings.pageSize': 'Backgrounds per page',
        'settings.pageSizeDesc': 'Fewer per page keeps large libraries fast.',
        'settings.thumb.small': 'Small',
        'settings.thumb.medium': 'Medium',
        'settings.thumb.large': 'Large',
        'card.rename': 'Rename',
        'card.move': 'Move to folder',
        'card.addToFolder': 'Add to folder',
        'card.removeFromFolder': 'Remove from this folder',
        'card.delete': 'Delete',
        'badge.linked': 'Linked here',
        'badge.animated': 'Animated',
        'badge.inFolders': '{n} folders',
        'toast.renamed': 'Background renamed.',
        'toast.nameExists': 'A background with that name already exists.',
        'toast.deleted': 'Background deleted.',
        'toast.deletedMany': '{n} backgrounds deleted.',
        'toast.deletedPartial': 'Deleted {ok} of {total} backgrounds. Failed items remain selected.',
        'toast.referenceUpdateFailed': 'The file operation finished, but some background references could not be saved.',
        'toast.busy': 'Please wait for the current action to finish.',
        'toast.removedFromFolder': 'Removed from folder.',
        'toast.uploaded': 'Background uploaded.',
        'toast.uploadedMany': '{n} backgrounds uploaded.',
        'toast.uploadedPartial': '{ok} of {total} backgrounds uploaded.',
        'toast.uploadFolderFailed': '{n} uploaded background(s) could not be added to the folder.',
        'toast.folderPartial': 'Updated {ok} of {total} backgrounds. Unfinished items remain selected.',
        'toast.addedToFolder': 'Added to folder.',
        'toast.noFolders': 'Create a folder first.',
        'toast.folderCreated': 'Folder created.',
        'toast.folderRenamed': 'Folder renamed.',
        'toast.folderDeleted': 'Folder deleted.',
        'toast.moved': 'Moved.',
        'toast.error': 'Something went wrong.',
        'prompt.renameTitle': 'Rename background',
        'prompt.renameText': 'Enter a new name (without extension):',
        'prompt.pickFolderText': 'Move to this folder, replacing existing folder memberships:',
        'prompt.addFolderText': 'Add to this folder, keeping existing folder memberships:',
        'prompt.newFolderTitle': 'New folder',
        'prompt.newFolderText': 'Enter a folder name:',
        'prompt.renameFolderTitle': 'Rename folder',
        'prompt.deleteTitle': 'Delete background?',
        'prompt.deleteText': 'This permanently removes the file from the server.',
        'prompt.bulkDeleteTitle': 'Delete {n} background(s)?',
        'prompt.deleteFolderTitle': 'Delete folder "{name}"?',
        'prompt.deleteFolderText': 'Files are kept. This shared folder is removed from all SillyTavern images, including images outside the background library.',
        'prompt.applyTitle': 'Apply background?',
    },
    ru: {
        'toolbar.more': 'Ещё',
        'toolbar.sort': 'Сортировка фонов',
        'toolbar.viewRows': 'Переключить на строки',
        'toolbar.viewGrid': 'Переключить на сетку',
        'toolbar.select': 'Выбрать фоны',
        'toolbar.native': 'Стандартные настройки фона',
        'selection.empty': 'Выберите фоны для групповых действий',
        'action.select': 'Выбрать фон',
        'action.selected': 'Выбрано: {n}',
        'action.assign': 'Применить к выбранной области',
        'action.clearAssignment': 'Удалить привязку (использовать резервный фон)',
        'scope.label': 'Привязать к',
        'scope.global': 'Глобально',
        'scope.chat': 'Чат',
        'scope.character': 'Персонаж / группа',
        'scope.theme': 'Тема',
        'scope.none': 'Фон не выбран',
        'scope.custom': 'Пользовательский фон',
        'scope.unavailable': 'Сначала откройте чат, выберите персонажа/группу или тему.',
        'scope.active': 'Текущий · {scope}',
        'status.noFolders': 'Данные папок недоступны. Обновите список.',
        'settings.view': 'Вид библиотеки',
        'settings.rows': 'Строки',
        'settings.grid': 'Сетка',
        'settings.columns': 'Карточек в ряду',
        'settings.columnsDesc': 'Максимум столбцов на компьютере; два на телефоне.',
        'settings.auto': 'Авто',
        'settings.ratio': 'Пропорции изображения',
        'settings.ratioDesc': 'Пропорции миниатюр в сетке.',
        'toast.videoLoader': 'Для загрузки видео в качестве фонов установите Video Background Loader.',
        'action.refresh': 'Обновить',
        'action.close': 'Закрыть',
        'action.selectAll': 'Выбрать страницу',
        'action.cancel': 'Отмена',
        'action.move': 'Переместить',
        'action.addToFolder': 'Добавить в папку',
        'action.delete': 'Удалить',
        'toolbar.search': 'Поиск фонов',
        'toolbar.upload': 'Загрузить',
        'toolbar.uploadVideo': 'Загрузить видео',
        'toolbar.newFolder': 'Новая папка',
        'sort.az': 'Имя А-Я',
        'sort.za': 'Имя Я-А',
        'sort.newest': 'Сначала новые',
        'sort.oldest': 'Сначала старые',
        'folder.all': 'Все',
        'folder.heading': 'Папки',
        'folder.allBackgrounds': 'Все фоны',
        'folder.unfiled': 'Несортированное',
        'folder.chat': 'Этот чат',
        'status.loading': 'Загрузка фонов...',
        'status.empty': 'Нет фонов для этого вида.',
        'pager.prev': 'Предыдущая страница',
        'pager.next': 'Следующая страница',
        'pager.range': '{from}–{to} из {total}',
        'settings.intro': 'Просматривайте, сортируйте и привязывайте фоны к чатам — всё в одной аккуратной панели.',
        'settings.open': 'Открыть Background Manager',
        'settings.behaviorHeading': 'Поведение',
        'settings.displayHeading': 'Отображение',
        'settings.hijack': 'Открывать менеджер вместо стандартной панели фонов',
        'settings.hijackDesc': 'Нажатие на кнопку панели фонов открывает этот менеджер.',
        'settings.confirmApply': 'Подтверждать применение фона',
        'settings.confirmApplyDesc': 'Спрашивать перед применением или привязкой фона.',
        'settings.thumbSize': 'Размер миниатюр',
        'settings.thumbSizeDesc': 'Размер миниатюр в строках.',
        'settings.pageSize': 'Фонов на странице',
        'settings.pageSizeDesc': 'Меньше на странице — быстрее работает большая библиотека.',
        'settings.thumb.small': 'Маленький',
        'settings.thumb.medium': 'Средний',
        'settings.thumb.large': 'Большой',
        'card.rename': 'Переименовать',
        'card.move': 'В папку',
        'card.addToFolder': 'Добавить в папку',
        'card.removeFromFolder': 'Убрать из этой папки',
        'card.delete': 'Удалить',
        'badge.linked': 'Привязан',
        'badge.animated': 'Анимация',
        'badge.inFolders': 'Папок: {n}',
        'toast.renamed': 'Фон переименован.',
        'toast.nameExists': 'Фон с таким именем уже существует.',
        'toast.deleted': 'Фон удалён.',
        'toast.deletedMany': 'Удалено фонов: {n}.',
        'toast.deletedPartial': 'Удалено {ok} из {total} фонов. Неудалённые остаются выбранными.',
        'toast.referenceUpdateFailed': 'Операция с файлом завершена, но часть привязок фона не удалось сохранить.',
        'toast.busy': 'Дождитесь завершения текущего действия.',
        'toast.removedFromFolder': 'Убрано из папки.',
        'toast.uploaded': 'Фон загружен.',
        'toast.uploadedMany': 'Загружено фонов: {n}.',
        'toast.uploadedPartial': 'Загружено {ok} из {total} фонов.',
        'toast.uploadFolderFailed': 'Не удалось добавить в папку загруженные фоны: {n}.',
        'toast.folderPartial': 'Обновлено {ok} из {total} фонов. Незавершённые остаются выбранными.',
        'toast.addedToFolder': 'Добавлено в папку.',
        'toast.noFolders': 'Сначала создайте папку.',
        'toast.folderCreated': 'Папка создана.',
        'toast.folderRenamed': 'Папка переименована.',
        'toast.folderDeleted': 'Папка удалена.',
        'toast.moved': 'Перемещено.',
        'toast.error': 'Что-то пошло не так.',
        'prompt.renameTitle': 'Переименовать фон',
        'prompt.renameText': 'Введите новое имя (без расширения):',
        'prompt.pickFolderText': 'Переместить в эту папку, заменив прежние привязки к папкам:',
        'prompt.addFolderText': 'Добавить в эту папку, сохранив прежние привязки к папкам:',
        'prompt.newFolderTitle': 'Новая папка',
        'prompt.newFolderText': 'Введите имя папки:',
        'prompt.renameFolderTitle': 'Переименовать папку',
        'prompt.deleteTitle': 'Удалить фон?',
        'prompt.deleteText': 'Файл будет навсегда удалён с сервера.',
        'prompt.bulkDeleteTitle': 'Удалить фоны ({n} шт.)?',
        'prompt.deleteFolderTitle': 'Удалить папку «{name}»?',
        'prompt.deleteFolderText': 'Файлы останутся. Общая папка удалится у всех изображений SillyTavern, включая изображения вне библиотеки фонов.',
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
        return lang === 'ru' ? 'ru' : 'en';
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
        if (root.hasAttribute(dataAttr)) root.setAttribute(realAttr, t(root.getAttribute(dataAttr)));
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
            .catch((err) => { _bgModulePromise = null; warn('background module', err); return null; });
    }
    return _bgModulePromise;
}

// The native global background URL (CSS url(...) string), or '' if unknown.
function getGlobalBgUrl() {
    try {
        const url = _bgModule?.background_settings?.url;
        if (typeof url === 'string') return url;
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
        if (!Object.hasOwn(s, key)) s[key] = structuredClone(DEFAULT_SETTINGS[key]);
    }
    if (!THUMB_SIZES.includes(s.thumbSize)) s.thumbSize = DEFAULT_SETTINGS.thumbSize;
    if (!PAGE_SIZES.includes(Number(s.pageSize))) s.pageSize = DEFAULT_SETTINGS.pageSize;
    if (!['rows', 'grid'].includes(s.view)) s.view = 'rows';
    if (!GRID_COLUMNS.includes(String(s.gridColumns))) s.gridColumns = '4';
    if (!ASPECT_RATIOS.includes(s.aspectRatio)) s.aspectRatio = '16 / 9';
    if (!ASSIGNMENT_SCOPES.includes(s.assignmentScope)) s.assignmentScope = 'global';
    for (const key of ['characterBackgrounds', 'themeBackgrounds']) {
        if (!isObject(s[key])) s[key] = {};
    }
    for (const key of ['hijackDrawer', 'confirmApply']) {
        if (typeof s[key] !== 'boolean') s[key] = DEFAULT_SETTINGS[key];
    }
    if (!['az', 'za', 'newest', 'oldest'].includes(s.sort)) s.sort = DEFAULT_SETTINGS.sort;
    s.pageSize = Number(s.pageSize);
    s.gridColumns = String(s.gridColumns);
    if (s.activeFolderId !== null && typeof s.activeFolderId !== 'string') s.activeFolderId = null;
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
    if (name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return false;
    if (/[\u0000-\u001f\u0080-\u009f]/.test(name)) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(name)) return false;
    return true;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
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

function fileFromBackgroundUrl(cssUrl) {
    const match = typeof cssUrl === 'string' && cssUrl.match(/^url\(\s*["']?(.*?)["']?\s*\)$/i);
    if (!match) return '';
    try {
        const base = new URL(document.baseURI);
        const url = new URL(match[1], base);
        if (url.origin !== base.origin) return '';
        const file = url.pathname === '/thumbnail' && url.searchParams.get('type') === 'bg'
            ? url.searchParams.get('file')
            : url.pathname.startsWith('/backgrounds/') ? decodeURIComponent(url.pathname.slice('/backgrounds/'.length)) : '';
        return isSafeBackgroundFile(file) ? file : '';
    } catch (_) { return ''; }
}

function matchesBackgroundUrl(cssUrl, file) {
    return cssUrl === getBackgroundCssUrl(file) || fileFromBackgroundUrl(cssUrl) === file;
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
    return matchesBackgroundUrl(locked, file);
}

// #bg1 may show a chat lock; read the native global setting instead.
function getGlobalBgName() {
    try {
        const name = _bgModule?.background_settings?.name;
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

function requestSignal(timeout = 30000) {
    return AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeout)]);
}

async function apiFetchBackgrounds(signal) {
    const res = await fetch('/api/backgrounds/all', {
        signal,
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`backgrounds/all ${res.status}`);
    const payload = await res.json();
    if (!Array.isArray(payload?.images)) throw new Error('Invalid background library');
    const images = payload.images;
    return images.map((img) => ({
        file: String(img.filename ?? img),
        isAnimated: typeof img.isAnimated === 'boolean' ? img.isAnimated : isAnimatedExtension(String(img.filename ?? img)),
    })).filter((b) => isSafeBackgroundFile(b.file));
}

async function apiLoadBackgroundMetadata(signal) {
    const [folderResponse, metadataResponse] = await Promise.all([
        fetch('/api/image-metadata/folders/get', {
            signal, method: 'POST', headers: headers(), body: JSON.stringify({}),
        }),
        fetch('/api/image-metadata/all', {
            signal, method: 'POST', headers: headers(), body: JSON.stringify({ prefix: 'backgrounds/' }),
        }),
    ]);
    if (!folderResponse.ok) throw new Error(`folders/get ${folderResponse.status}`);
    if (!metadataResponse.ok) throw new Error(`image-metadata/all ${metadataResponse.status}`);
    const [folderData, metadata] = await Promise.all([folderResponse.json(), metadataResponse.json()]);
    if (!Array.isArray(folderData) || !isObject(metadata?.images)) throw new Error('Invalid background metadata');
    const folders = folderData.filter((folder) =>
        isObject(folder) && typeof folder.id === 'string' && folder.id && typeof folder.name === 'string');
    const folderIds = new Set(folders.map((folder) => folder.id));
    const imageFolderMap = Object.create(null);
    const timestamps = Object.create(null);
    for (const [path, meta] of Object.entries(metadata.images)) {
        if (!path.startsWith('backgrounds/')) continue;
        const file = path.slice('backgrounds/'.length);
        if (!isSafeBackgroundFile(file) || !isObject(meta)) continue;
        imageFolderMap[file] = Array.isArray(meta.folderIds)
            ? [...new Set(meta.folderIds.filter((id) => folderIds.has(id)))] : [];
        const timestamp = Number(meta.addedTimestamp);
        if (Number.isFinite(timestamp)) timestamps[file] = timestamp;
    }
    return { folders, imageFolderMap, timestamps };
}

async function apiDeleteBackground(file) {
    if (!isSafeBackgroundFile(file)) throw new Error('unsafe filename');
    const res = await fetch('/api/backgrounds/delete', {
        signal: requestSignal(),
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
        signal: requestSignal(),
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ old_bg: oldFile, new_bg: newFile }),
        cache: 'no-cache',
    });
    if (!res.ok) throw new Error(`backgrounds/rename ${res.status}`);
}

async function apiUploadBackground(formData) {
    const res = await fetch('/api/backgrounds/upload', {
        signal: requestSignal(120000),
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
        signal: requestSignal(),
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`folders/create ${res.status}`);
    return res.json();
}

async function apiFolderUpdate(payload) {
    const res = await fetch('/api/image-metadata/folders/update', {
        signal: requestSignal(),
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`folders/update ${res.status}`);
}

async function apiFolderDelete(id) {
    const res = await fetch('/api/image-metadata/folders/delete', {
        signal: requestSignal(),
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
        signal: requestSignal(),
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

// ── Background assignments ────────────────────────────────────────────────
function getCharacterTarget() {
    const ctx = getContext();
    if (ctx.groupId !== undefined && ctx.groupId !== null && ctx.groupId !== '') {
        const group = ctx.groups?.find((g) => String(g.id) === String(ctx.groupId));
        return { key: `group:${ctx.groupId}`, label: group?.name || String(ctx.groupId) };
    }
    const character = ctx.characters?.[ctx.characterId];
    return character?.avatar ? { key: `character:${character.avatar}`, label: character.name || character.avatar } : null;
}

function getAssignmentTarget(scope = getSettings().assignmentScope) {
    if (scope === 'character') return getCharacterTarget();
    if (scope === 'chat') return hasOpenChat() ? { key: JSON.stringify([getCharacterTarget()?.key, getChatId()]), label: String(getChatId()) } : null;
    if (scope === 'theme') {
        const name = document.getElementById('themes')?.value || getContext().powerUserSettings?.theme;
        return typeof name === 'string' && name ? { key: `theme:${name}`, label: name } : null;
    }
    return { key: 'global', label: t('scope.global') };
}

function getAssignedUrl(scope, target = getAssignmentTarget(scope)) {
    if (!target) return '';
    if (scope === 'global') return getGlobalBgUrl();
    if (scope === 'chat') return getLockedBgUrl();
    const map = getSettings()[`${scope}Backgrounds`];
    const file = Object.hasOwn(map, target.key) ? map[target.key] : '';
    return isSafeBackgroundFile(file) && (!state.libraryLoaded || state.backgrounds.some((bg) => bg.file === file))
        ? getBackgroundCssUrl(file) : '';
}

function resolveBackground() {
    for (const scope of ['chat', 'character', 'theme', 'global']) {
        const url = getAssignedUrl(scope);
        if (scope === 'chat' && url && state.libraryLoaded) {
            const file = fileFromBackgroundUrl(url);
            if (file && !state.backgrounds.some(bg => bg.file === file)) continue;
        }
        if (url) return { scope, url };
    }
    return { scope: 'global', url: '' };
}

function applyResolvedBackground() {
    setVisibleBackground(resolveBackground().url);
}

function nativeContextKey() {
    return JSON.stringify([getAssignmentTarget('chat')?.key, getLockedBgUrl(), getAssignmentTarget('theme')?.key, getGlobalBgUrl()]);
}

function observeNativeBackground() {
    const background = document.getElementById('bg1');
    if (!background || state.backgroundObserver) return;
    state.backgroundObserver = new MutationObserver(() => {
        if (background.style.backgroundImage !== state.lastVisibleBackground || nativeContextKey() !== state.contextKey) scheduleContextUpdate();
    });
    state.backgroundObserver.observe(background, { attributes: true, attributeFilter: ['style'] });
}

function scheduleContextUpdate() {
    if (lifetime.signal.aborted) return;
    clearTimeout(state.contextTimer);
    // Run after native CHAT_CHANGED listeners and ThemeAssist's theme change.
    state.contextTimer = setTimeout(() => {
        state.contextTimer = null;
        state.contextKey = nativeContextKey();
        applyResolvedBackground();
        if (!state.inlineEditor) render();
    }, 0);
}

function onNativeSettingsUpdate() {
    if (nativeContextKey() !== state.contextKey) scheduleContextUpdate();
}

function sameTarget(scope, target) {
    return target?.key === getAssignmentTarget(scope)?.key;
}

async function assignBackground(file, scope, target) {
    if (!isSafeBackgroundFile(file) || !target || !sameTarget(scope, target)) return;
    if (scope === 'global') return applyGlobal(file);
    if (scope === 'chat') {
        const ctx = getContext();
        ctx.chatMetadata[BG_METADATA_KEY] = getBackgroundCssUrl(file);
        await ctx.saveMetadata();
    } else {
        getSettings()[`${scope}Backgrounds`][target.key] = file;
    }
    saveSettings();
    applyResolvedBackground();
    render();
}

async function clearAssignment() {
    const scope = getSettings().assignmentScope;
    const target = getAssignmentTarget(scope);
    if (!target || scope === 'global') return;
    if (scope === 'chat') {
        const ctx = getContext();
        delete ctx.chatMetadata[BG_METADATA_KEY];
        await ctx.saveMetadata();
    } else {
        delete getSettings()[`${scope}Backgrounds`][target.key];
        saveSettings();
    }
    applyResolvedBackground();
    render();
}

function repairAssignments(file, replacement = '') {
    for (const scope of ['character', 'theme']) {
        const map = getSettings()[`${scope}Backgrounds`];
        for (const key of Object.keys(map)) {
            if (map[key] !== file) continue;
            if (replacement) map[key] = replacement;
            else delete map[key];
        }
    }
    saveSettings();
}

async function removeBackgroundReferences(file) {
    repairAssignments(file);
    if (getGlobalBgName() === file && _bgModule?.background_settings) {
        const fallback = state.backgrounds.find((bg) => bg.file === '__transparent.png' && bg.file !== file)
            || state.backgrounds.find((bg) => bg.file !== file);
        const name = fallback?.file || '__transparent.png';
        _bgModule.background_settings.name = name;
        _bgModule.background_settings.url = getBackgroundCssUrl(name);
        saveSettings();
    }
    try {
        if (isLinkedToChat(file)) await unlinkFromChat();
    } finally {
        applyResolvedBackground();
    }
}

// ── Apply / link operations ─────────────────────────────────────────────────
function setVisibleBackground(cssUrl) {
    const el = document.getElementById('bg1');
    if (!el || lifetime.signal.aborted) return;
    const normalized = document.createElement('div').style;
    normalized.backgroundImage = cssUrl;
    if (el.style.backgroundImage !== normalized.backgroundImage) el.style.backgroundImage = normalized.backgroundImage;
    state.lastVisibleBackground = el.style.backgroundImage;
    state.contextKey = nativeContextKey();
}

// Set the global background by mutating the native `background_settings` export
// directly (script.js persists it by identity via saveSettingsDebounced).
// Avoids `/bg` (needs the hijacked gallery rendered) and FORCE_SET_BACKGROUND
// (locks to chat, not global).
async function applyGlobal(file, expectedName = null) {
    if (!isSafeBackgroundFile(file)) return;
    const mod = await loadBgModule();
    if (!mod?.background_settings) throw new Error('Native background settings unavailable');
    if (expectedName !== null && mod.background_settings.name !== expectedName) return;
    mod.background_settings.name = file;
    mod.background_settings.url = getBackgroundCssUrl(file);
    saveSettings();
    applyResolvedBackground();
    render();
}

// Remove the native lock after its background file is deleted.
async function unlinkFromChat() {
    const ctx = getContext();
    if (!ctx.chatMetadata || !ctx.chatMetadata[BG_METADATA_KEY]) return;
    delete ctx.chatMetadata[BG_METADATA_KEY];
    await ctx.saveMetadata();
    applyResolvedBackground();
    render();
}

// ── Data refresh ────────────────────────────────────────────────────────────
async function refresh({ showLoader = false } = {}) {
    const token = ++state.refreshToken;
    state.refreshController?.abort();
    const controller = new AbortController();
    state.refreshController = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    const signal = AbortSignal.any([controller.signal, lifetime.signal]);
    if (showLoader) setLoading(true);
    try {
        // /all generates missing metadata; read memberships and dates afterwards.
        const backgrounds = await apiFetchBackgrounds(signal);
        const folderData = await apiLoadBackgroundMetadata(signal).catch(err => {
            if (token === state.refreshToken && !lifetime.signal.aborted) warn('folder metadata', err);
            return null;
        });
        if (token !== state.refreshToken || lifetime.signal.aborted) return;
        state.backgrounds = backgrounds;
        state.libraryLoaded = true;
        state.foldersReady = !!folderData;
        state.folders = folderData?.folders ?? [];
        state.imageFolderMap = folderData?.imageFolderMap ?? Object.create(null);
        state.timestamps = folderData?.timestamps ?? Object.create(null);
        if (!folderData) {
            state.activeFolderId = null;
            toastr.warning(t('status.noFolders'));
        } else state.activeFolderId = getSettings().activeFolderId;
        // Validate active folder still exists.
        const files = new Set(backgrounds.map((b) => b.file));
        for (const file of state.selected) if (!files.has(file)) state.selected.delete(file);
        if (state.activeFolderId && !['__all__', '__chat__', '__unfiled__'].includes(state.activeFolderId) && !state.folders.some((f) => f.id === state.activeFolderId)) {
            state.activeFolderId = null;
            getSettings().activeFolderId = null;
            saveSettings();
        }
        setLoading(false);
        applyResolvedBackground();
        render();
    } catch (err) {
        if (token !== state.refreshToken) return;
        warn('refresh', err);
        setEmptyMessage(t('toast.error'));
        toastr.error(t('toast.error'));
    } finally {
        clearTimeout(timeout);
        controller.abort();
        if (token === state.refreshToken) {
            state.refreshController = null;
            setLoading(false);
        }
    }
}

// ── Filtering / sorting ─────────────────────────────────────────────────────
function getVisibleBackgrounds(snapshot = createRenderSnapshot()) {
    const term = state.search.trim().toLowerCase();
    const folder = state.activeFolderId;

    let list = state.backgrounds.filter((bg) => {
        if (folder === '__unfiled__') {
            const fids = state.imageFolderMap[bg.file];
            if (fids && fids.length) return false;
        } else if (folder === '__chat__') {
            if (snapshot.linkedFile !== bg.file) return false;
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
    list.sort((a, b) => {
        const linked = Number(b.file === snapshot.linkedFile) - Number(a.file === snapshot.linkedFile);
        if (linked) return linked;
        if (state.sort === 'za') return cmp(b, a);
        if (state.sort === 'newest') return ts(b) - ts(a) || cmp(a, b);
        if (state.sort === 'oldest') return ts(a) - ts(b) || cmp(a, b);
        return cmp(a, b);
    });
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

function createRenderSnapshot() {
    const settings = getSettings();
    const lockedUrl = getLockedBgUrl();
    const assignedUrl = getAssignedUrl(settings.assignmentScope);
    const linkedFile = fileFromBackgroundUrl(lockedUrl);
    const assignedFile = fileFromBackgroundUrl(assignedUrl);
    return {
        settings, linkedFile, assignedFile, globalFile: getGlobalBgName(),
        target: getAssignmentTarget(settings.assignmentScope),
        folderNames: new Map(state.folders.map((folder) => [folder.id, folder.name])),
    };
}

function render() {
    if (!state.dom.modal || !state.isOpen) return;
    const snapshot = createRenderSnapshot();
    renderSpotlight();
    renderFolderTree(snapshot);
    renderGrid(snapshot);
    updateSelectUI();
}

function renderSpotlight() {
    const { globalThumb, globalName, targetName, assignmentScope, clearAssignment: clearButton } = state.dom;
    if (!globalName) return;
    const scope = getSettings().assignmentScope;
    const target = getAssignmentTarget(scope);
    const active = resolveBackground();
    const assigned = getAssignedUrl(scope, target);
    const file = fileFromBackgroundUrl(assigned);
    const bg = state.backgrounds.find(b => b.file === file);
    assignmentScope.value = scope;
    assignmentScope.title = target?.label || t('scope.unavailable');
    targetName.textContent = [target?.label || t('scope.unavailable'), active.scope !== scope && t('scope.active', { scope: t(`scope.${active.scope}`) })].filter(Boolean).join(' · ');
    targetName.title = targetName.textContent;
    globalName.textContent = file ? stripExtension(file) : t(assigned ? 'scope.custom' : 'scope.none');
    globalName.title = globalName.textContent;
    globalThumb.replaceChildren();
    if (bg) globalThumb.appendChild(createPreview(bg));
    clearButton.disabled = !target || !getAssignedUrl(scope, target) || scope === 'global';
    const clearLabel = `${t('action.clearAssignment')} · ${t(`scope.${scope}`)}${target ? `: ${target.label}` : ''}`;
    clearButton.title = clearLabel;
    clearButton.setAttribute('aria-label', clearLabel);
}

function renderHeader(visible = getVisibleBackgrounds()) {
    if (!state.dom.summary) return;
    state.dom.summary.textContent = `${visible.length} / ${state.backgrounds.length}`;
    if (state.dom.breadcrumb) {
        state.dom.breadcrumb.textContent = getActiveFolderLabel();
    }
}

function getActiveFolderLabel() {
    const id = state.activeFolderId;
    if (!id || id === '__all__') return t('folder.allBackgrounds');
    if (id === '__unfiled__') return t('folder.unfiled');
    if (id === '__chat__') return t('folder.chat');
    return state.folders.find((f) => f.id === id)?.name || t('folder.allBackgrounds');
}

// The active sidebar folder id, but only when it's a real folder (not one of
// the virtual views or "all"). Returns null otherwise.
function getActiveRealFolderId() {
    const id = state.activeFolderId;
    if (!id || ['__all__', '__unfiled__', '__chat__'].includes(id)) return null;
    return state.folders.some((f) => f.id === id) ? id : null;
}

// Folder names a file belongs to (synchronous; reads the already-loaded map).
function foldersOfFile(file, names) {
    const ids = state.imageFolderMap[file];
    if (!Array.isArray(ids) || !ids.length) return [];
    return ids
        .map((id) => names.get(id))
        .filter((n) => typeof n === 'string' && n);
}

function countForFolder(id) {
    return state.folderCounts.get(id) || 0;
}

function renderFolderTree(snapshot) {
    for (const control of ['sidebarToggle', 'newFolder', 'bulkMove', 'bulkAdd']) state.dom[control].disabled = !state.foldersReady;
    if (!state.foldersReady) {
        state.dom.folderTree.replaceChildren();
        state.dom.sidebar.classList.add('is-collapsed');
        state.dom.sidebarToggle.setAttribute('aria-expanded', 'false');
        return;
    }
    const tree = state.dom.folderTree;
    if (!tree) return;
    const focused = tree.contains(document.activeElement) ? document.activeElement : null;
    const folderId = focused?.dataset.folderId;
    const action = focused?.dataset.bgmFolderAction;
    state.folderCounts = new Map([['__all__', state.backgrounds.length]]);
    const increment = (id) => state.folderCounts.set(id, countForFolder(id) + 1);
    for (const bg of state.backgrounds) {
        const ids = state.imageFolderMap[bg.file];
        if (Array.isArray(ids) && ids.length) new Set(ids).forEach(increment);
        else increment('__unfiled__');
        if (snapshot.linkedFile === bg.file) increment('__chat__');
    }
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
    if (focused) {
        const control = [...tree.querySelectorAll('button')].find((el) => el.dataset.folderId === folderId && el.dataset.bgmFolderAction === action);
        (control || state.dom.sidebarToggle).focus({ preventScroll: true });
    }
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
    button.setAttribute('aria-pressed', String(state.activeFolderId === id || (!state.activeFolderId && id === '__all__')));

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
    button.setAttribute('aria-pressed', String(state.activeFolderId === folder.id));

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

function renderGrid(snapshot = createRenderSnapshot()) {
    const grid = state.dom.grid;
    if (!grid || !state.isOpen) return;
    if (state.inlineEditor?.isConnected) return;
    const focused = grid.contains(document.activeElement) ? document.activeElement
        : state.dom.cardMenu?.contains(document.activeElement) ? cardMenuOpener : null;
    const file = focused?.closest('.bgm_row')?.dataset.bgmFile;
    const action = focused?.dataset.bgmCardAction || 'rename-inline';
    closeCardMenu();
    const settings = snapshot.settings;
    grid.dataset.thumb = settings.thumbSize;
    grid.dataset.view = settings.view;
    grid.style.setProperty('--bgm-columns', settings.gridColumns === 'auto' ? '4' : settings.gridColumns);
    grid.dataset.columns = settings.gridColumns;
    grid.style.setProperty('--bgm-card-ratio', settings.aspectRatio);
    state.dom.view.setAttribute('aria-pressed', String(settings.view === 'grid'));
    const viewLabel = t(settings.view === 'grid' ? 'toolbar.viewRows' : 'toolbar.viewGrid');
    state.dom.view.title = viewLabel;
    state.dom.view.querySelector('span').textContent = viewLabel;
    state.dom.view.setAttribute('aria-label', viewLabel);
    state.dom.view.firstElementChild.className = `fa-solid ${settings.view === 'grid' ? 'fa-list' : 'fa-grip'}`;

    const visible = getVisibleBackgrounds(snapshot);
    renderHeader(visible);
    grid.innerHTML = '';

    if (!visible.length) {
        setEmptyMessage(state.isLoading ? '' : t('status.empty'));
        renderPager(0);
        updateSelectUI();
        if (focused) grid.focus({ preventScroll: true });
        return;
    }
    setEmptyMessage('');

    getBackgroundsOnPage(visible).forEach((bg) => grid.appendChild(createCard(bg, snapshot)));
    renderPager(visible.length);
    updateSelectUI();
    if (focused) {
        const row = [...grid.children].find((el) => el.dataset.bgmFile === file);
        const control = row && [...row.querySelectorAll('[data-bgm-card-action]')].find((el) => el.dataset.bgmCardAction === action);
        (control || grid).focus({ preventScroll: true });
    }
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

function createPreview(bg) {
    if (bg.isAnimated) {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-film bgm_preview_placeholder';
        icon.setAttribute('aria-hidden', 'true');
        return icon;
    }
    const img = document.createElement('img');
    img.src = `/thumbnail?type=bg&file=${encodeURIComponent(bg.file)}`;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', () => {
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-image bgm_preview_placeholder';
        icon.setAttribute('aria-hidden', 'true');
        img.replaceWith(icon);
    }, { once: true });
    return img;
}

function createCard(bg, snapshot) {
    const linked = snapshot.linkedFile === bg.file;

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
    checkbox.setAttribute('aria-label', `${t('action.select')}: ${bg.file}`);
    checkbox.setAttribute('aria-pressed', String(state.selected.has(bg.file)));
    checkbox.innerHTML = state.selected.has(bg.file)
        ? '<i class="fa-solid fa-square-check"></i>'
        : '<i class="fa-regular fa-square"></i>';

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'bgm_row_thumb';
    thumb.appendChild(createPreview(bg));
    thumb.title = bg.file;
    thumb.setAttribute('aria-label', `${t('action.assign')}: ${bg.file}`);
    thumb.dataset.bgmCardAction = 'assign';
    thumb.disabled = !snapshot.target;
    if (bg.isAnimated) {
        const film = document.createElement('span');
        film.className = 'bgm_row_thumb_film';
        film.innerHTML = '<i class="fa-solid fa-film"></i>';
        thumb.appendChild(film);
    }

    // Name + badges
    const main = document.createElement('div');
    main.className = 'bgm_row_main';

    const title = document.createElement('button');
    title.type = 'button';
    title.className = 'bgm_row_title';
    title.textContent = stripExtension(bg.file);
    title.title = bg.file;
    title.setAttribute('aria-label', `${t('card.rename')}: ${bg.file}`);
    title.dataset.bgmCardAction = 'rename-inline';
    title.tabIndex = 0;

    const meta = document.createElement('div');
    meta.className = 'bgm_row_meta';
    if (linked) meta.appendChild(makeBadge(t('badge.linked'), 'fa-link', 'is-linked'));
    if (bg.file === snapshot.globalFile) meta.appendChild(makeBadge(t('scope.global'), 'fa-globe', 'is-global'));
    if (snapshot.assignedFile === bg.file) card.classList.add('is-assigned');
    if (bg.isAnimated) meta.appendChild(makeBadge(t('badge.animated'), 'fa-film', 'is-animated'));
    const folderNames = foldersOfFile(bg.file, snapshot.folderNames);
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

    const more = cardIconButton('more', t('toolbar.more'), 'fa-ellipsis');
    more.classList.add('bgm_row_btn', 'bgm_row_more');
    more.setAttribute('aria-controls', 'bgm_card_menu');
    more.setAttribute('aria-expanded', 'false');
    actions.append(more);

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
    b.title = label;
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
    state.selectionMode = true;
    if (state.selected.has(file)) state.selected.delete(file);
    else state.selected.add(file);
    updateSelectUI();
}

function clearSelection() {
    state.selected.clear();
    state.selectionMode = false;
    updateSelectUI();
}

function updateSelectUI() {
    const count = state.selected.size;
    const selecting = state.selectionMode || count > 0;
    const targetAvailable = Boolean(getAssignmentTarget(getSettings().assignmentScope));
    if (!selecting && state.isOpen && state.dom.selectBar?.contains(document.activeElement)) state.dom.grid?.focus({ preventScroll: true });
    state.dom.modal?.setAttribute('data-selecting', String(selecting));
    state.dom.selectMode?.setAttribute('aria-pressed', String(selecting));
    state.dom.selectBar?.classList.toggle('bgm_hidden', !selecting);
    if (state.dom.selectCount) state.dom.selectCount.textContent = count ? t('action.selected', { n: count }) : t('selection.empty');
    for (const button of [state.dom.bulkMove, state.dom.bulkAdd, state.dom.bulkDelete]) {
        if (button) button.disabled = count === 0 || (!state.foldersReady && button !== state.dom.bulkDelete);
    }
    state.dom.grid?.querySelectorAll('.bgm_row').forEach((card) => {
        const file = card.dataset.bgmFile;
        const sel = state.selected.has(file);
        card.classList.toggle('is-selected', sel);
        card.querySelector('.bgm_row_check')?.setAttribute('aria-pressed', String(sel));
        const icon = card.querySelector('.bgm_row_check i');
        if (icon) icon.className = sel ? 'fa-solid fa-square-check' : 'fa-regular fa-square';
        const thumb = card.querySelector('.bgm_row_thumb');
        if (thumb) {
            thumb.disabled = !selecting && !targetAvailable;
            thumb.setAttribute('aria-label', `${t(selecting ? 'action.select' : 'action.assign')}: ${file}`);
        }
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
        case 'toggle-select':
            toggleSelection(file);
            break;
        case 'assign': {
            const scope = getSettings().assignmentScope;
            const target = getAssignmentTarget(scope);
            if (await maybeConfirmApply()) await assignBackground(file, scope, target);
            break;
        }
        case 'rename':
            await renameBackground(file);
            break;
        case 'move':
            await moveBackgroundToFolder(file);
            break;
        case 'add-to-folder':
            await moveBackgroundToFolder(file, true);
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
    const newFile = uniqueUploadName({ name: ext ? `${safe}.${ext}` : safe, type: '' }, new Set());
    if (newFile === file) return false;
    if (!isSafeBackgroundFile(newFile)) {
        toastr.error(t('toast.error'));
        return false;
    }
    if (state.backgrounds.some((b) => b.file !== file && b.file.normalize('NFC').toLowerCase() === newFile.normalize('NFC').toLowerCase())) {
        toastr.warning(t('toast.nameExists'));
        return false;
    }
    try {
        setLoading(true);
        const wasLinked = isLinkedToChat(file);
        const chatTarget = getAssignmentTarget('chat');
        await apiRenameBackground(file, newFile);
        repairAssignments(file, newFile);
        if (state.selected.delete(file)) state.selected.add(newFile);
        state.backgrounds = state.backgrounds.map((bg) => bg.file === file ? { ...bg, file: newFile } : bg);

        // Re-point old references.
        if (wasLinked && sameTarget('chat', chatTarget) && isLinkedToChat(file)) {
            const ctx = getContext();
            ctx.chatMetadata[BG_METADATA_KEY] = getBackgroundCssUrl(newFile);
            try { await ctx.saveMetadata(); }
            catch (err) { warn('rename references', err); toastr.warning(t('toast.referenceUpdateFailed')); }
        }
        await applyGlobal(newFile, file);
        applyResolvedBackground();

        await refresh();
        toastr.success(t('toast.renamed'));
        return true;
    } catch (err) {
        warn('rename', err);
        toastr.error(t('toast.error'));
        return false;
    } finally {
        setLoading(false);
    }
}

// Inline rename: swap the title button for a text input.
function startInlineRename(card, file) {
    if (state.actionBusy) { toastr.info(t('toast.busy')); return; }
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
    state.inlineEditor = input;

    input.focus();
    input.select();

    let done = false;
    const finish = async (commit) => {
        if (done) return;
        done = true;
        state.inlineEditor = null;
        if (commit) {
            const ok = await runAction(() => commitRename(file, input.value));
            if (!ok) renderGrid(); // restore original row if nothing changed
        } else {
            renderGrid();
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
}

async function deleteBackground(file) {
    const ok = await popup().show.confirm(t('prompt.deleteTitle'), t('prompt.deleteText'));
    if (!ok) return;
    try {
        setLoading(true);
        await apiDeleteBackground(file);
        state.backgrounds = state.backgrounds.filter((bg) => bg.file !== file);
        state.selected.delete(file);
        try { await removeBackgroundReferences(file); }
        catch (err) { warn('delete references', err); toastr.warning(t('toast.referenceUpdateFailed')); }
        toastr.success(t('toast.deleted'));
    } catch (err) {
        warn('delete', err);
        toastr.error(t('toast.error'));
    } finally {
        setLoading(false);
        await refresh();
    }
}

async function changeFolderMemberships(files, folderId, add = false) {
    if (!state.foldersReady) throw new Error('Folder metadata unavailable');
    if (folderId && !state.folders.some((folder) => folder.id === folderId)) throw new Error('Unknown folder');
    if (add && !folderId) throw new Error('Missing destination folder');
    const library = new Set(state.backgrounds.map((bg) => bg.file));
    const targets = [...new Set(files)].filter((file) => isSafeBackgroundFile(file) && library.has(file));
    const failed = new Set();
    const removals = new Map();
    for (const file of targets) {
        if (add) continue;
        for (const id of state.imageFolderMap[file] || []) {
            if (id === folderId) continue;
            if (!removals.has(id)) removals.set(id, []);
            removals.get(id).push(file);
        }
    }
    const additions = folderId ? targets.filter((file) => !(state.imageFolderMap[file] || []).includes(folderId)) : [];
    // Keep existing memberships intact if assigning the destination fails.
    if (additions.length) {
        await apiFolderAssign(additions, folderId, false);
        for (const file of additions) state.imageFolderMap[file] = [...(state.imageFolderMap[file] || []), folderId];
    }
    for (const [id, members] of removals) {
        try {
            await apiFolderAssign(members, id, true);
            for (const file of members) state.imageFolderMap[file] = (state.imageFolderMap[file] || []).filter((value) => value !== id);
        } catch (err) {
            warn('folder membership', err);
            for (const file of members) failed.add(file);
        }
    }
    return { files: targets, failed };
}

async function performFolderChange(files, folderId, add = false) {
    try {
        const result = await changeFolderMemberships(files, folderId, add);
        for (const file of result.files) {
            if (result.failed.has(file)) state.selected.add(file);
            else state.selected.delete(file);
        }
        if (result.failed.size) {
            toastr.warning(t('toast.folderPartial', { ok: result.files.length - result.failed.size, total: result.files.length }));
        } else if (result.files.length) {
            toastr.success(t(add ? 'toast.addedToFolder' : 'toast.moved'));
        }
    } catch (err) {
        warn('folder change', err);
        toastr.error(t('toast.error'));
    } finally {
        updateSelectUI();
        await refresh();
    }
}

async function moveBackgroundToFolder(file, add = false) {
    const folderId = await pickFolder(add);
    if (folderId !== undefined) await performFolderChange([file], folderId, add);
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
        warn('remove from folder', err);
        toastr.error(t('toast.error'));
    }
}

// Folder picker. Returns folderId, '' for none, or undefined if cancelled.
async function pickFolder(add = false) {
    if (add && !state.folders.length) {
        toastr.info(t('toast.noFolders'));
        return undefined;
    }
    const ctx = getContext();
    const Popup = ctx.Popup;
    const POPUP_TYPE = ctx.POPUP_TYPE;

    const container = document.createElement('div');
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.marginBottom = '6px';
    label.textContent = t(add ? 'prompt.addFolderText' : 'prompt.pickFolderText');
    const select = document.createElement('select');
    select.id = 'bgm_folder_picker';
    label.htmlFor = select.id;
    select.className = 'text_pole';
    select.style.width = '100%';
    if (!add) select.appendChild(new Option(t('folder.unfiled'), ''));
    state.folders
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .forEach((f) => select.appendChild(new Option(f.name, f.id)));
    container.append(label, select);

    const instance = new Popup(container, POPUP_TYPE?.CONFIRM ?? 2, '', {
        okButton: t(add ? 'action.addToFolder' : 'action.move'),
        cancelButton: t('action.cancel'),
    });
    const result = await instance.show();
    const affirmative = ctx.POPUP_RESULT?.AFFIRMATIVE ?? 1;
    if (result !== affirmative && result !== true) return undefined;
    return select.value;
}

async function bulkDelete() {
    const files = [...state.selected];
    if (!files.length) return;
    const ok = await popup().show.confirm(t('prompt.bulkDeleteTitle', { n: files.length }), t('prompt.deleteText'));
    if (!ok) return;
    let deleted = 0;
    let referenceFailed = false;
    setLoading(true);
    for (const file of files) {
        try {
            await apiDeleteBackground(file);
            deleted++;
            state.selected.delete(file);
            state.backgrounds = state.backgrounds.filter((bg) => bg.file !== file);
            try { await removeBackgroundReferences(file); }
            catch (err) { referenceFailed = true; warn('bulk delete references', err); }
        } catch (err) {
            warn('bulk delete', err);
        }
    }
    setLoading(false);
    updateSelectUI();
    await refresh();
    if (deleted === files.length) toastr.success(t('toast.deletedMany', { n: deleted }));
    else if (deleted) toastr.warning(t('toast.deletedPartial', { ok: deleted, total: files.length }));
    else toastr.error(t('toast.error'));
    if (referenceFailed) toastr.warning(t('toast.referenceUpdateFailed'));
}

async function bulkMove(add = false) {
    const files = [...state.selected];
    if (!files.length) return;
    const folderId = await pickFolder(add);
    if (folderId === undefined) return;
    await performFolderChange(files, folderId, add);
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
        warn('create folder', err);
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
        warn('rename folder', err);
        toastr.error(t('toast.error'));
    }
}

async function deleteFolder(folderId) {
    const folder = state.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const ok = await popup().show.confirm(
        t('prompt.deleteFolderTitle', { name: escapeHtml(folder.name) }),
        t('prompt.deleteFolderText'),
    );
    if (!ok) return;
    try {
        await apiFolderDelete(folderId);
        if (state.activeFolderId === folderId) {
            state.activeFolderId = null;
            getSettings().activeFolderId = null;
            saveSettings();
        }
        await refresh();
        toastr.success(t('toast.folderDeleted'));
    } catch (err) {
        warn('delete folder', err);
        toastr.error(t('toast.error'));
    }
}

// ── Upload ────────────────────────────────────────────────────────────────
function uniqueUploadName(file, reserved) {
    const inferred = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };
    const extension = getFileExtension(file.name) || inferred[file.type] || '';
    let base = sanitizeNameComponent(stripExtension(file.name))
        .replace(/[\u0080-\u009f]/g, '_').replace(/[. ]+$/g, '') || 'background';
    if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(base)) base = `_${base}`;
    const key = (name) => name.normalize('NFC').toLowerCase();
    const encoder = new TextEncoder();
    const tail = extension ? `.${extension}` : '';
    for (let number = 0; number <= reserved.size; number++) {
        const suffix = (number ? ` (${number + 1})` : '') + tail;
        const budget = 255 - encoder.encode(suffix).length;
        if (budget < 1) throw new Error('Upload extension is too long');
        let stem = '';
        let bytes = 0;
        for (const char of base) {
            const size = encoder.encode(char).length;
            if (bytes + size > budget) break;
            stem += char;
            bytes += size;
        }
        const name = stem.replace(/[. ]+$/g, '') + suffix;
        if (!isSafeBackgroundFile(name)) throw new Error('Invalid upload filename');
        if (!reserved.has(key(name))) {
            reserved.add(key(name));
            return name;
        }
    }
    throw new Error('Unable to reserve upload filename');
}

async function onUploadInput(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;

    const folderId = getActiveRealFolderId();
    setLoading(true);
    let uploaded = 0;
    let filingFailed = 0;
    try {
        // Refresh names before reserving destinations; stale UI must not cause overwrites.
        const library = await apiFetchBackgrounds(requestSignal());
        const reserved = new Set(library.map((bg) => bg.file.normalize('NFC').toLowerCase()));
        for (const file of files) {
            if (lifetime.signal.aborted) break;
            if (!file || file.size === 0) continue;
            try {
                const formData = new FormData();
                formData.append('avatar', file);
                await convertVideoIfNeeded(formData);
                const converted = formData.get('avatar');
                if (!(converted instanceof File) || !converted.size) continue;
                const name = uniqueUploadName(converted, reserved);
                formData.set('avatar', converted, name);
                const newName = await apiUploadBackground(formData);
                if (!isSafeBackgroundFile(newName) || newName !== name) throw new Error('Unexpected upload filename');
                uploaded++;
                if (folderId) {
                    try { await apiFolderAssign([newName], folderId, false); }
                    catch (err) { filingFailed++; warn('upload folder', err); }
                }
            } catch (err) {
                warn('upload', err);
            }
        }
    } finally {
        setLoading(false);
        if (!lifetime.signal.aborted) await refresh();
    }
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
    if (filingFailed) toastr.warning(t('toast.uploadFolderFailed', { n: filingFailed }));
}

// Convert video uploads via the Video Background Loader global (if installed).
async function convertVideoIfNeeded(formData) {
    const file = formData.get('avatar');
    if (!(file instanceof File) || !(file.type?.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'avi', 'mkv'].includes(getFileExtension(file.name)))) return;
    if (typeof globalThis.convertVideoToAnimatedWebp !== 'function') {
        toastr.warning(t('toast.videoLoader'));
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
        warn('video conversion', err);
        formData.delete('avatar');
    }
}

// ── Event binding ─────────────────────────────────────────────────────────
let domPromise = null;
function ensureDom() {
    if (state.dom.modal) return Promise.resolve();
    if (!domPromise) domPromise = createDom().finally(() => { domPromise = null; });
    return domPromise;
}

async function createDom() {

    const host = document.createElement('div');
    host.innerHTML = await getContext().renderExtensionTemplateAsync(EXTENSION_NAME, 'manager');
    if (lifetime.signal.aborted) return;
    const modal = host.firstElementChild;
    if (!modal) throw new Error('Failed to render Background Manager template');

    modal.dataset.build = buildStamp(VERSION);
    document.body.appendChild(modal);
    i18nApplyDom(modal);

    state.dom = {
        modal,
        view: modal.querySelector('#bgm_view'),
        selectMode: modal.querySelector('#bgm_select_mode'),
        nativeControls: modal.querySelector('#bgm_native_controls'),
        more: modal.querySelector('#bgm_more'),
        moreMenu: modal.querySelector('#bgm_more_menu'),
        cardMenu: modal.querySelector('#bgm_card_menu'),
        assignmentScope: modal.querySelector('#bgm_assignment_scope'),
        clearAssignment: modal.querySelector('#bgm_clear_assignment'),
        targetName: modal.querySelector('#bgm_target_name'),
        refresh: modal.querySelector('#bgm_refresh'),
        search: modal.querySelector('#bgm_search'),
        sort: modal.querySelector('#bgm_sort'),
        upload: modal.querySelector('#bgm_upload'),
        uploadVideo: modal.querySelector('#bgm_upload_video'),
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
        bulkAdd: modal.querySelector('#bgm_bulk_add'),
        bulkDelete: modal.querySelector('#bgm_bulk_delete'),
        sidebar: modal.querySelector('#bgm_sidebar'),
        sidebarToggle: modal.querySelector('#bgm_sidebar_toggle'),
        globalThumb: modal.querySelector('#bgm_global_thumb'),
        globalName: modal.querySelector('#bgm_global_name'),
    };

    bindEvents();
}

function bindEvents() {
    const d = state.dom;

    d.modal.addEventListener('click', (e) => {
        if (e.target.closest('[data-bgm-action="close"]')) closeManager();
        if (!e.target.closest('.bgm_more_wrap')) closeMoreMenu();
        if (!e.target.closest('.bgm_card_menu, .bgm_row_more')) closeCardMenu();
    });
    d.more.addEventListener('click', () => {
        closeCardMenu();
        const open = d.moreMenu.classList.toggle('is-open');
        d.more.setAttribute('aria-expanded', String(open));
        if (open) d.sort.focus();
    });
    d.view.addEventListener('click', () => {
        closeMoreMenu(true);
        const s = getSettings();
        s.view = s.view === 'grid' ? 'rows' : 'grid';
        saveSettings();
        const setting = document.getElementById('bgm_view_setting');
        if (setting) setting.value = s.view;
        renderGrid();
    });
    d.selectMode.addEventListener('click', () => {
        closeMoreMenu(true);
        if (state.selectionMode || state.selected.size) clearSelection();
        else { state.selectionMode = true; updateSelectUI(); }
    });
    d.nativeControls.addEventListener('click', () => runAction(async () => {
        closeManager();
        const mod = await loadBgModule();
        await mod?.getBackgrounds?.();
        if (lifetime.signal.aborted) return;
        state.suppressDrawerHijack = true;
        try { document.getElementById('backgrounds-drawer-toggle')?.click(); }
        finally { state.suppressDrawerHijack = false; }
    }));
    d.assignmentScope.addEventListener('change', () => {
        getSettings().assignmentScope = d.assignmentScope.value;
        saveSettings();
        render();
    });
    d.clearAssignment.addEventListener('click', () => runAction(clearAssignment));
    d.cardMenu.addEventListener('click', (e) => {
        const button = e.target.closest('[data-bgm-card-action]');
        if (!button) return;
        const file = d.cardMenu.dataset.file;
        closeCardMenu(true);
        runAction(() => onCardAction(button.dataset.bgmCardAction, file));
    });
    d.refresh.addEventListener('click', () => { closeMoreMenu(true); refresh({ showLoader: true }); });
    d.search.addEventListener('input', () => {
        state.search = d.search.value;
        state.currentPage = 1;
        if (!state.searchFrame) state.searchFrame = requestAnimationFrame(() => { state.searchFrame = 0; renderGrid(); });
    });
    d.sort.addEventListener('change', () => {
        state.sort = d.sort.value;
        getSettings().sort = state.sort;
        saveSettings();
        state.currentPage = 1;
        renderGrid();
    });
    d.upload.addEventListener('click', () => {
        d.uploadInput.accept = 'image/*';
        d.uploadInput.click();
    });
    d.uploadVideo.addEventListener('click', () => {
        closeMoreMenu(true);
        d.uploadInput.accept = 'video/*';
        d.uploadInput.click();
    });
    d.uploadInput.addEventListener('change', (e) => runAction(() => onUploadInput(e)));
    d.newFolder.addEventListener('click', () => { closeMoreMenu(true); runAction(createFolder); });

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
    d.bulkMove.addEventListener('click', () => runAction(bulkMove));
    d.bulkAdd.addEventListener('click', () => runAction(() => bulkMove(true)));
    d.bulkDelete.addEventListener('click', () => runAction(bulkDelete));

    d.sidebarToggle.addEventListener('click', onSidebarToggle);

    d.modal.addEventListener('keydown', onManagerKeydown);

}

async function runAction(action) {
    if (state.actionBusy) { toastr.info(t('toast.busy')); return false; }
    if (lifetime.signal.aborted) return false;
    state.actionBusy = true;
    state.dom.modal?.setAttribute('aria-busy', 'true');
    try { return await action(); }
    catch (err) {
        if (!lifetime.signal.aborted) { warn('action', err); toastr.error(t('toast.error')); }
        return false;
    }
    finally {
        state.actionBusy = false;
        state.dom.modal?.setAttribute('aria-busy', 'false');
    }
}

function closeMoreMenu(restoreFocus = false) {
    const d = state.dom;
    if (!d.moreMenu?.classList.contains('is-open')) return;
    d.moreMenu.classList.remove('is-open');
    d.more.setAttribute('aria-expanded', 'false');
    if (restoreFocus || d.moreMenu.contains(document.activeElement)) d.more.focus({ preventScroll: true });
}

let cardMenuOpener = null;
function closeCardMenu(restoreFocus = false) {
    state.dom.cardMenu?.classList.add('bgm_hidden');
    cardMenuOpener?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && cardMenuOpener?.isConnected) cardMenuOpener.focus({ preventScroll: true });
    cardMenuOpener = null;
}

function openCardMenu(card, opener) {
    const wasOpen = cardMenuOpener === opener;
    closeMoreMenu();
    closeCardMenu();
    if (wasOpen) return;
    const menu = state.dom.cardMenu;
    menu.replaceChildren();
    menu.dataset.file = card.dataset.bgmFile;
    const select = cardIconButton('toggle-select', t('action.select'), 'fa-check');
    const selectLabel = document.createElement('span');
    selectLabel.textContent = t('action.select');
    select.appendChild(selectLabel);
    menu.appendChild(select);
    for (const [action, key, icon] of [
        ['rename', 'card.rename', 'fa-pencil'], ['move', 'card.move', 'fa-folder-open'],
        ['add-to-folder', 'card.addToFolder', 'fa-folder-plus'], ['remove-from-folder', 'card.removeFromFolder', 'fa-folder-minus'],
        ['delete', 'card.delete', 'fa-trash-can'],
    ]) {
        if (action === 'remove-from-folder' && !getActiveRealFolderId()) continue;
        if (!state.foldersReady && !['rename', 'delete'].includes(action)) continue;
        const item = cardIconButton(action, t(key), icon);
        if (action === 'delete') item.classList.add('bgm_btn_danger');
        const label = document.createElement('span');
        label.textContent = t(key);
        item.appendChild(label);
        menu.appendChild(item);
    }
    menu.classList.remove('bgm_hidden');
    cardMenuOpener = opener;
    opener.setAttribute('aria-expanded', 'true');
    menu.querySelector('button')?.focus();
}

function onManagerKeydown(e) {
    if (!state.isOpen || e.defaultPrevented || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (cardMenuOpener) closeCardMenu(true);
        else if (state.dom.moreMenu.classList.contains('is-open')) closeMoreMenu(true);
        else closeManager();
    } else if (e.key === 'Tab') {
        const root = cardMenuOpener ? state.dom.cardMenu
            : state.dom.moreMenu.classList.contains('is-open') ? state.dom.moreMenu : state.dom.modal;
        const controls = [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]')].filter((el) => el.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) { e.preventDefault(); state.dom.modal.focus(); return; }
        if (e.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
            e.preventDefault(); last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) {
            e.preventDefault(); first.focus();
        }
    }
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
        runAction(() => renameFolder(folderId));
    } else if (action === 'delete-folder') {
        runAction(() => deleteFolder(folderId));
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
        if (state.selectionMode && (action === 'rename-inline' || actionEl.classList.contains('bgm_row_thumb'))) {
            toggleSelection(file);
            return;
        }

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
        if (action === 'more') { openCardMenu(card, actionEl); return; }
        runAction(() => onCardAction(action, file));
        return;
    }

    // Empty row space → selection.
    toggleSelection(file);
}

function onSelectAll() {
    state.selectionMode = true;
    getBackgroundsOnPage(getVisibleBackgrounds()).forEach((bg) => state.selected.add(bg.file));
    updateSelectUI();
}

function onSidebarToggle(event) {
    event?.stopPropagation();
    closeMoreMenu();
    closeCardMenu();
    const collapsed = state.dom.sidebar.classList.toggle('is-collapsed');
    state.dom.sidebarToggle.classList.toggle('is-open', !collapsed);
    state.dom.sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
}

function collapseMobileSidebar() {
    const { sidebar, sidebarToggle } = state.dom;
    if (!sidebar || !sidebarToggle) return;
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    if (sidebar.contains(document.activeElement)) sidebarToggle.focus({ preventScroll: true });
    sidebar.classList.add('is-collapsed');
    sidebarToggle.classList.remove('is-open');
    sidebarToggle.setAttribute('aria-expanded', 'false');
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
    await runAction(() => dropFileOnFolder(file, dropId));
}

async function dropFileOnFolder(file, dropId) {
    if (!isSafeBackgroundFile(file) || !state.backgrounds.some((bg) => bg.file === file)) return;
    if (dropId !== '__unfiled__' && !state.folders.some((folder) => folder.id === dropId)) return;
    await performFolderChange([file], dropId === '__unfiled__' ? '' : dropId);
}

function clearDropStyles() {
    state.dom.folderTree?.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
}

// ── Open / close ──────────────────────────────────────────────────────────
async function openManager() {
    await ensureDom();
    if (lifetime.signal.aborted) return;
    if (state.isOpen) return;
    state.lastFocusedElement = document.activeElement;
    state.isOpen = true;
    document.body.classList.add('bgm_open');
    state.activeFolderId = getSettings().activeFolderId || null;
    state.sort = getSettings().sort || 'az';
    state.pageSize = Number(getSettings().pageSize) || DEFAULT_SETTINGS.pageSize;
    state.currentPage = 1;
    state.dom.modal.classList.remove('bgm_hidden');
    state.dom.search.value = state.search;
    state.dom.sort.value = state.sort;
    collapseNativeBackgroundDrawer();
    state.dom.modal.focus({ preventScroll: true });
    await loadBgModule();
    if (!state.isOpen) return;
    applyResolvedBackground();
    await refresh({ showLoader: true });
}

function closeManager() {
    cancelAnimationFrame(state.searchFrame);
    state.searchFrame = 0;
    if (!state.dom.modal) return;
    state.isOpen = false;
    ++state.refreshToken;
    state.refreshController?.abort();
    state.refreshController = null;
    setLoading(false);
    document.body.classList.remove('bgm_open');
    state.inlineEditor = null;
    closeMoreMenu();
    closeCardMenu();
    clearSelection();
    state.dom.modal.classList.add('bgm_hidden');
    clearDropStyles();
    state.dom.grid.replaceChildren();
    state.dom.globalThumb.replaceChildren();
    if (state.lastFocusedElement?.isConnected) state.lastFocusedElement.focus({ preventScroll: true });
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
                for (const drawer of document.querySelectorAll('#top-settings-holder .drawer-content.openDrawer:not(.pinnedOpen):not(#Backgrounds)')) {
                    drawer.parentElement.querySelector(':scope > .drawer-toggle')?.click();
                }
                runAction(openManager);
            }
        }, { capture: true, signal: lifetime.signal });
    }
}

// The native toolbar can become available after extension initialization.
function startDrawerHijack(attempt = 0) {
    if (lifetime.signal.aborted) return;
    const button = document.getElementById('backgrounds-drawer-toggle');
    if (button) {
        hijackBackgroundDrawer();
        return;
    }
    if (attempt >= 20) return; // ~5s of bounded retries, then give up
    state.drawerTimer = setTimeout(() => startDrawerHijack(attempt + 1), 250);
}

// When the manager is open and the user clicks a different top-bar drawer
// icon, close the manager so it doesn't float over the newly opened panel.
function bindTopBarCloseHandlers() {
    const topBar = document.getElementById('top-settings-holder');
    if (!topBar || topBar.dataset.bgmTopBarBound) return;
    topBar.dataset.bgmTopBarBound = 'true';

    topBar.addEventListener('click', (e) => {
        if (!state.isOpen) return;
        // Our own button is handled by the drawer hijack (toggles the manager).
        if (e.target.closest('#backgrounds-drawer-toggle')) return;
        // Only react to actual top-bar drawer/menu buttons.
        if (!e.target.closest('.drawer-icon, .drawer-toggle')) return;
        closeManager();
    }, { capture: true, signal: lifetime.signal });
}

// ── Settings UI ───────────────────────────────────────────────────────────
function bindSettingsUI() {
    const root = document.querySelector('.background-manager-settings');
    if (!root || root.dataset.bgmBound) return;
    root.dataset.bgmBound = 'true';
    const s = getSettings();
    const $ = (id) => document.getElementById(id);

    const openBtn = $('bgm_open_button');
    const hijack = $('bgm_hijack_drawer');
    const confirmApply = $('bgm_confirm_apply');
    const thumbSize = $('bgm_thumb_size');
    const pageSize = $('bgm_page_size');
    for (const [id, key, values] of [
        ['bgm_view_setting', 'view', ['rows', 'grid']],
        ['bgm_grid_columns', 'gridColumns', GRID_COLUMNS],
        ['bgm_aspect_ratio', 'aspectRatio', ASPECT_RATIOS],
    ]) {
        const control = $(id);
        if (!control) continue;
        control.value = s[key];
        control.addEventListener('change', () => {
            if (!values.includes(control.value)) return;
            s[key] = control.value;
            saveSettings();
            renderGrid();
        });
    }

    if (openBtn) openBtn.addEventListener('click', () => runAction(openManager));
    if (hijack) {
        hijack.checked = s.hijackDrawer;
        hijack.addEventListener('change', () => { s.hijackDrawer = hijack.checked; saveSettings(); if (s.hijackDrawer) hijackBackgroundDrawer(); });
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
            src.on(evt, scheduleContextUpdate);
            const ready = getEventTypes().APP_READY;
            if (ready) src.on(ready, scheduleContextUpdate);
            state.eventSource = src;
            const forced = getEventTypes().FORCE_SET_BACKGROUND;
            if (forced) src.on(forced, scheduleContextUpdate);
            const settings = getEventTypes().SETTINGS_UPDATED;
            if (settings) src.on(settings, onNativeSettingsUpdate);
            state.contextEvents = [evt, ready, forced].filter(Boolean);
            state.boundChatHandler = true;
        }
    } catch (err) {
        warn('chat events', err);
    }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
function cleanup() {
    closeManager();
    lifetime.abort();
    clearTimeout(state.contextTimer);
    clearTimeout(state.drawerTimer);
    for (const event of state.contextEvents) state.eventSource?.removeListener(event, scheduleContextUpdate);
    state.contextEvents = [];
    state.eventSource?.removeListener(getEventTypes().SETTINGS_UPDATED, onNativeSettingsUpdate);
    state.backgroundObserver?.disconnect();
    state.backgroundObserver = null;
    jQuery(document).off('.bgmTheme');
    state.dom.modal?.remove();
    document.querySelector('.background-manager-settings')?.remove();
    document.getElementById('backgrounds-drawer-toggle')?.removeAttribute('data-bgm-hijacked');
    document.getElementById('top-settings-holder')?.removeAttribute('data-bgm-top-bar-bound');
    state.dom = {};
}

window.addEventListener('pagehide', (event) => {
    if (!event.persisted) cleanup();
}, { signal: lifetime.signal });

jQuery(async () => {
    try {
        LANG = detectLang();
        const settingsHtml = await getContext().renderExtensionTemplateAsync(EXTENSION_NAME, 'settings');
        if (lifetime.signal.aborted) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = settingsHtml;
        i18nApplyDom(wrap);
        document.getElementById('extensions_settings')?.append(...wrap.childNodes);
    } catch (err) {
        warn('settings template', err);
    }

    const settings = getSettings();
    if (Object.hasOwn(settings, 'bgScope')) {
        delete settings.bgScope;
        saveSettings();
    }
    bindSettingsUI();
    startDrawerHijack();
    bindTopBarCloseHandlers();
    bindChatChange();
    observeNativeBackground();
    // jQuery observes both native dispatchEvent and ThemeAssist's select2 trigger.
    jQuery(document).off('change.bgmTheme', '#themes').on('change.bgmTheme', '#themes', scheduleContextUpdate);

    // Resolve assignments once the native global settings are available.
    loadBgModule().then(() => { if (!lifetime.signal.aborted) scheduleContextUpdate(); });
});
