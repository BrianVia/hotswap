import { useState, useEffect } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import type { UpdateStatus } from '../types';

export function UpdateNotifier() {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [dismissed, setDismissed] = useState(false);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    // Get initial status and app version
    window.hotswap.getUpdateStatus().then(setStatus);
    window.hotswap.getAppVersion().then(setAppVersion);

    // Subscribe to status changes
    const unsubscribe = window.hotswap.onUpdateStatusChange((newStatus) => {
      setStatus(newStatus);
      // Reset dismissed when new update becomes available
      if (newStatus.state === 'downloaded') {
        setDismissed(false);
      }
    });

    return unsubscribe;
  }, []);

  const handleRestart = () => {
    window.hotswap.quitAndInstall();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Only show for downloaded state (ready to install)
  if (status.state !== 'downloaded' || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg bg-blue-600 px-4 py-3 text-white shadow-lg">
      <Download className="h-5 w-5" />
      <div className="flex flex-col">
        <span className="text-sm font-medium">Update ready</span>
        <span className="text-xs opacity-80">
          v{status.version} available (current: v{appVersion})
        </span>
      </div>
      <div className="flex items-center gap-2 ml-2">
        <button
          onClick={handleRestart}
          className="flex items-center gap-1.5 rounded bg-white px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Restart
        </button>
        <button
          onClick={handleDismiss}
          className="rounded p-1 hover:bg-blue-500 transition-colors"
          title="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
