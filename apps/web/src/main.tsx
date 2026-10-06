import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { realtime } from './lib/realtime';
import { Toaster } from 'react-hot-toast';

// Self-hosted variable fonts, so the font setting works offline and renders
// identically on every machine. The package entry points ship every subset the
// font covers, including Cyrillic (U+0460-052F), which the UI needs for Russian.
// `unicode-range` keeps the browser from downloading what a page does not show.
import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/lora';
import '@fontsource-variable/jetbrains-mono';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});

// The server could not replay everything this device missed (offline longer
// than the replay window, or its event log was reset), so cached server state
// is not trustworthy: refetch every active query.
realtime.on('sync.reset', () => {
  void queryClient.invalidateQueries();
});

// The server pushes the whole folder list whenever it changes on any device.
realtime.on('folder.updated', (payload) => {
  queryClient.setQueryData(['folders'], payload);
});

// A chat moved into or out of the archive on another device: refresh the archive view.
realtime.on('chat.updated', (chat) => {
  if (chat && typeof chat.isArchived === 'boolean') {
    void queryClient.invalidateQueries({ queryKey: ['chats', 'archived'] });
  }
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Desktop app: the title bar is drawn by the page (see .is-desktop in index.css).
if (window.electronAPI) {
  document.documentElement.classList.add('is-desktop');
  const strip = document.createElement('div');
  strip.className = 'desktop-drag';
  document.body.appendChild(strip);
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: 'rgb(var(--color-bg-panel))',
              color: 'rgb(var(--color-fg-primary))',
              border: '1px solid rgb(var(--color-border))',
              borderRadius: '12px',
              boxShadow:
                '0 12px 32px -8px rgba(16, 24, 40, 0.18), 0 4px 8px -4px rgba(16, 24, 40, 0.08)',
              fontSize: '14px',
              padding: '10px 14px',
            },
            success: {
              iconTheme: {
                primary: 'rgb(var(--color-fg-success))',
                secondary: 'rgb(var(--color-bg-panel))',
              },
            },
            error: {
              iconTheme: {
                primary: 'rgb(var(--color-fg-error))',
                secondary: 'rgb(var(--color-bg-panel))',
              },
            },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
