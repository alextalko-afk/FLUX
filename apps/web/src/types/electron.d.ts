export {};

declare global {
  interface Window {
    /** Present only inside the desktop (Electron) app; see apps/desktop/src/preload.ts. */
    electronAPI?: {
      getAutostart: () => Promise<{ supported: boolean; enabled: boolean }>;
      setBadge?: (count: number) => void;
      flash?: () => void;
      setAutostart: (enabled: boolean) => Promise<{ supported: boolean; enabled: boolean }>;
    };
  }
}
