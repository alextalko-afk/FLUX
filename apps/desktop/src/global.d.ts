export {};

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      getAutostart: () => Promise<{ supported: boolean; enabled: boolean }>;
      setAutostart: (enabled: boolean) => Promise<{ supported: boolean; enabled: boolean }>;
      setBadge: (count: number) => void;
      flash: () => void;
      getServerUrl: () => Promise<string>;
      setServerUrl: (url: string) => Promise<boolean>;
      showNotification: (title: string, body: string) => void;
      onMenuAction: (channel: string, callback: (...args: any[]) => void) => () => void;
      onShortcut: (channel: string, callback: (...args: any[]) => void) => () => void;
    };
  }
}
