import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:version'),
  getPlatform: () => ipcRenderer.invoke('app:platform'),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: (enabled: boolean) => ipcRenderer.invoke('autostart:set', enabled),
  setBadge: (count: number) => ipcRenderer.send('badge:set', count),
  flash: () => ipcRenderer.send('window:flash'),
  getServerUrl: () => ipcRenderer.invoke('server:get'),
  setServerUrl: (url: string) => ipcRenderer.invoke('server:set', url),
  showNotification: (title: string, body: string) => {
    ipcRenderer.send('notification:show', { title, body });
  },
  onMenuAction: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  onShortcut: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
});
