import { app, BrowserWindow, Menu, Tray, nativeImage, nativeTheme, ipcMain, shell, globalShortcut, session, desktopCapturer, screen } from 'electron';
import { autoUpdater } from 'electron-updater';
import { startLocalServer } from './localServer';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let appOrigin = 'http://127.0.0.1:47731';

const WEB_CLIENT_URL = process.env.WEB_CLIENT_URL || 'http://localhost:5173';
const IS_DEV = !app.isPackaged && process.env.NODE_ENV !== 'production';
const LOCAL_PORT = 47731;

/** Where the FLUX server lives: FLUX_SERVER_URL, else userData/config.json { "serverUrl": ... }, else local dev. */
function getServerUrl(): string {
  if (process.env.FLUX_SERVER_URL) return process.env.FLUX_SERVER_URL;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'));
    if (typeof cfg.serverUrl === 'string' && /^https?:\/\//.test(cfg.serverUrl)) return cfg.serverUrl;
  } catch {
    /* no config yet */
  }
  return 'http://127.0.0.1:3000';
}

function setServerUrl(url: string): boolean {
  if (!/^https?:\/\/[^\s]+$/.test(url)) return false;
  fs.writeFileSync(path.join(app.getPath('userData'), 'config.json'), JSON.stringify({ serverUrl: url }));
  return true;
}

/** Window size, position and maximized state survive restarts. */
interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized?: boolean;
}
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState(): WindowState {
  try {
    const st = JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as WindowState;
    const onScreen =
      st.x === undefined ||
      st.y === undefined ||
      screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return st.x! >= b.x - 50 && st.x! < b.x + b.width - 50 && st.y! >= b.y - 50 && st.y! < b.y + b.height - 50;
      });
    if (st.width >= 800 && st.height >= 600 && onScreen) return st;
  } catch {
    /* first run */
  }
  return { width: 1280, height: 800 };
}
function saveWindowState(win: BrowserWindow): void {
  const maximized = win.isMaximized();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...(maximized ? win.getNormalBounds() : win.getBounds()), maximized }));
  } catch {
    /* not critical */
  }
}

/** Set by the OS login item: start in the tray without showing the window. */
const STARTED_HIDDEN = process.argv.includes('--hidden');

// One FLUX at a time: starting it again (from the menu, or at login while it runs) shows the running window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

const LINUX_AUTOSTART_FILE = path.join(os.homedir(), '.config', 'autostart', 'flux.desktop');

/** Autostart only makes sense for an installed app; a dev run would register the bare Electron binary. */
function autostartSupported(): boolean {
  return app.isPackaged;
}

function getAutostart(): boolean {
  if (!autostartSupported()) return false;
  if (process.platform === 'linux') return fs.existsSync(LINUX_AUTOSTART_FILE);
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
}

function setAutostart(enabled: boolean): boolean {
  if (!autostartSupported()) return false;
  if (process.platform === 'linux') {
    if (enabled) {
      // An AppImage moves around; APPIMAGE points at the file the user actually runs.
      const exec = process.env.APPIMAGE || process.execPath;
      fs.mkdirSync(path.dirname(LINUX_AUTOSTART_FILE), { recursive: true });
      fs.writeFileSync(
        LINUX_AUTOSTART_FILE,
        `[Desktop Entry]\nType=Application\nName=FLUX\nExec="${exec}" --hidden\nX-GNOME-Autostart-enabled=true\n`,
      );
    } else {
      fs.rmSync(LINUX_AUTOSTART_FILE, { force: true });
    }
  } else {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: enabled, args: enabled ? ['--hidden'] : [] });
  }
  return getAutostart();
}

async function createWindow(): Promise<void> {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 800,
    minHeight: 600,
    title: 'FLUX',
    icon: path.join(__dirname, '../resources/icon.png'),
    backgroundColor: '#0e0f1a',
    autoHideMenuBar: true,
    // No system title bar: the app's own top strip is the drag area; the window buttons stay native.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#14171f', symbolColor: '#c9cbe0', height: 32 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  if (state.maximized) mainWindow.maximize();

  if (IS_DEV) {
    void mainWindow.loadURL(WEB_CLIENT_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const dist = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '../../web/dist');
    appOrigin = await startLocalServer(dist, getServerUrl(), LOCAL_PORT);
    void mainWindow.loadURL(appOrigin);
  }

  mainWindow.once('ready-to-show', () => {
    if (!STARTED_HIDDEN) mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (mainWindow) saveWindowState(mainWindow);
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // The window never navigates away from the app: outside links open in the user's browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(appOrigin) && !url.startsWith(WEB_CLIENT_URL)) {
      event.preventDefault();
      if (/^https?:/.test(url)) void shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../resources/tray.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip('FLUX');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show window',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu:new-chat');
          },
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('menu:settings');
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FLUX',
          click: () => {
            mainWindow?.webContents.send('menu:about');
          },
        },
      ],
    },
  ];

  // Windows and Linux messengers have no menu bar; macOS keeps its standard one.
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate(template) : null);
}

function registerShortcuts(): void {
  globalShortcut.register('CmdOrCtrl+Shift+M', () => {
    mainWindow?.webContents.send('shortcut:toggle-mute');
  });

  globalShortcut.register('CmdOrCtrl+Shift+V', () => {
    mainWindow?.webContents.send('shortcut:toggle-video');
  });
}

/** Startup failures end up in userData/flux.log instead of vanishing silently. */
function logError(err: unknown): void {
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'flux.log'), `${new Date().toISOString()} ${String((err as Error)?.stack ?? err)}
`);
  } catch {
    /* nothing else to do */
  }
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  nativeTheme.themeSource = 'dark';
  app.setAppUserModelId('com.flux.messenger');
  setupPermissions();
  await createWindow();
  createTray();
  createMenu();
  registerShortcuts();
  setupUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('app:platform', () => process.platform);
ipcMain.handle('autostart:get', () => ({ supported: autostartSupported(), enabled: getAutostart() }));
ipcMain.handle('autostart:set', (_event, enabled: unknown) => ({
  supported: autostartSupported(),
  enabled: setAutostart(enabled === true),
}));

ipcMain.on('notification:show', (_event, { title, body }) => {
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    notification.show();
  }
});

/** Microphone, camera, notifications and screen capture are granted to the app itself and nothing else. */
function setupPermissions(): void {
  const allowed = new Set(['media', 'notifications', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'display-capture']);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));
  // Screen sharing: hand the call the primary screen (the web UI has no custom picker).
  ses.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => callback(sources[0] ? { video: sources[0] } : {}))
      .catch(() => callback({}));
  });
}

/** Updates download silently and install on the next quit. Needs a publish feed in the build config. */
function setupUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => undefined);
  const check = () => void autoUpdater.checkForUpdates().catch(() => undefined);
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

/** Unread count: taskbar dot, tray tooltip, macOS/Linux dock badge. */
function setUnread(count: number): void {
  const n = Math.max(0, Math.floor(count) || 0);
  app.setBadgeCount(n);
  tray?.setToolTip(n > 0 ? `FLUX (${n})` : 'FLUX');
  if (process.platform === 'win32' && mainWindow) {
    const dot = nativeImage.createFromPath(path.join(__dirname, '../resources/badge.png'));
    mainWindow.setOverlayIcon(n > 0 && !dot.isEmpty() ? dot : null, n > 0 ? `${n} unread` : '');
  }
}

ipcMain.on('badge:set', (_event, count: unknown) => setUnread(Number(count)));
ipcMain.on('window:flash', () => {
  if (mainWindow && !mainWindow.isFocused()) mainWindow.flashFrame(true);
});
ipcMain.handle('server:get', () => getServerUrl());
ipcMain.handle('server:set', (_event, url: unknown) => {
  if (typeof url !== 'string' || !setServerUrl(url)) return false;
  isQuitting = true;
  app.relaunch();
  app.quit();
  return true;
});
