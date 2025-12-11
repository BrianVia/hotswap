import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerIpcHandlers } from './ipc/handlers.js';
import { initAutoUpdater } from './updater.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 600,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 16 },
        icon: path.join(__dirname, '../assets/app-icon-macos.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });
    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
app.whenReady().then(() => {
    // Set dock icon on macOS
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(path.join(__dirname, '../assets/app-icon-macos.png'));
    }
    registerIpcHandlers();
    createWindow();
    // Initialize auto-updater after window is created
    if (mainWindow) {
        initAutoUpdater(mainWindow);
    }
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
//# sourceMappingURL=main.js.map