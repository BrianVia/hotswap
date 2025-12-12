import pkg from 'electron-updater';
const { autoUpdater } = pkg;
type UpdateInfo = pkg.UpdateInfo;
import { BrowserWindow } from 'electron';
import log from 'electron-log';

// Configure logging
autoUpdater.logger = log;

// Don't auto-download - user must explicitly trigger download from the UI
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

let currentStatus: UpdateStatus = { state: 'idle' };
let mainWindow: BrowserWindow | null = null;

export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

function setStatus(status: UpdateStatus) {
  currentStatus = status;
  // Notify renderer of status change
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status-changed', status);
  }
}

export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    setStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
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

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
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
