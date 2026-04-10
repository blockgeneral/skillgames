import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@telegram-apps/telegram-ui/dist/styles.css';
import { App } from './App.js';

// Initialize Telegram WebApp shim in development
if (import.meta.env.DEV) {
  const { initTelegramShim } = await import('./lib/telegram-shim.js');
  initTelegramShim();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
