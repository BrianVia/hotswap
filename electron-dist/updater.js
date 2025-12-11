import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
// Configure logging
autoUpdater.logger = log;
// Don't auto-download - we'll trigger it manually after user sees notification
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
let currentStatus = { state: 'idle' };
let mainWindow = null;
export function getUpdateStatus() {
    return currentStatus;
}
function setStatus(status) {
    currentStatus = status;
    // Notify renderer of status change
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status-changed', status);
    }
}
export function initAutoUpdater(window) {
    mainWindow = window;
    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        setStatus({ state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
        log.info('Update available:', info.version);
        setStatus({ state: 'available', version: info.version });
    });
    autoUpdater.on('update-not-available', () => {
        log.info('Update not available - running latest version');
        setStatus({ state: 'not-available' });
    });
    autoUpdater.on('download-progress', (progress) => {
        log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
        setStatus({ state: 'downloading', percent: progress.percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded:', info.version);
        setStatus({ state: 'downloaded', version: info.version });
    });
    autoUpdater.on('error', (err) => {
        log.error('Update error:', err);
        setStatus({ state: 'error', message: err.message });
    });
    // Check for updates after a short delay (don't slow down startup)
    setTimeout(() => {
        checkForUpdates();
    }, 3000);
}
export function checkForUpdates() {
    // Don't check in development
    if (process.env.NODE_ENV === 'development') {
        log.info('Skipping update check in development mode');
        return;
    }
    autoUpdater.checkForUpdates().catch((err) => {
        log.error('Failed to check for updates:', err);
    });
}
export function quitAndInstall() {
    autoUpdater.quitAndInstall();
}
//# sourceMappingURL=updater.js.map