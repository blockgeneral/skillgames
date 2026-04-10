/**
 * Telegram WebApp development shim.
 *
 * In production, the real Telegram environment provides window.Telegram.WebApp.
 * In development, we stub it with reasonable defaults so @telegram-apps/telegram-ui
 * components render correctly in a normal browser tab.
 *
 * This file should only be imported in development mode.
 */

interface ThemeParams {
  bg_color: string;
  text_color: string;
  hint_color: string;
  link_color: string;
  button_color: string;
  button_text_color: string;
  secondary_bg_color: string;
  header_bg_color: string;
  accent_text_color: string;
  section_bg_color: string;
  section_header_text_color: string;
  subtitle_text_color: string;
  destructive_text_color: string;
}

interface WebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

interface WebApp {
  initData: string;
  initDataUnsafe: {
    user?: WebAppUser;
    auth_date?: number;
    hash?: string;
  };
  version: string;
  platform: string;
  colorScheme: 'light' | 'dark';
  themeParams: ThemeParams;
  isExpanded: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  isClosingConfirmationEnabled: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation: () => void;
  disableClosingConfirmation: () => void;
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  onEvent: (eventType: string, callback: () => void) => void;
  offEvent: (eventType: string, callback: () => void) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    isProgressVisible: boolean;
    setText: (text: string) => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
    enable: () => void;
    disable: () => void;
    showProgress: (leaveActive?: boolean) => void;
    hideProgress: () => void;
  };
  BackButton: {
    isVisible: boolean;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
    show: () => void;
    hide: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: WebApp;
    };
  }
}

const darkThemeParams: ThemeParams = {
  bg_color: '#212121',
  text_color: '#ffffff',
  hint_color: '#aaaaaa',
  link_color: '#8774e1',
  button_color: '#8774e1',
  button_text_color: '#ffffff',
  secondary_bg_color: '#181818',
  header_bg_color: '#212121',
  accent_text_color: '#8774e1',
  section_bg_color: '#212121',
  section_header_text_color: '#8774e1',
  subtitle_text_color: '#aaaaaa',
  destructive_text_color: '#ff6b6b',
};

const lightThemeParams: ThemeParams = {
  bg_color: '#ffffff',
  text_color: '#000000',
  hint_color: '#999999',
  link_color: '#3390ec',
  button_color: '#3390ec',
  button_text_color: '#ffffff',
  secondary_bg_color: '#f4f4f5',
  header_bg_color: '#ffffff',
  accent_text_color: '#3390ec',
  section_bg_color: '#ffffff',
  section_header_text_color: '#3390ec',
  subtitle_text_color: '#999999',
  destructive_text_color: '#ff3b30',
};

/**
 * Initialize the Telegram WebApp shim for development.
 * Only call this in development mode.
 */
export function initTelegramShim(): void {
  // Don't override if real Telegram WebApp exists
  if (window.Telegram?.WebApp?.initData) {
    return;
  }

  // Detect preferred color scheme
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const colorScheme = prefersDark ? 'dark' : 'light';
  const themeParams = prefersDark ? darkThemeParams : lightThemeParams;

  const noop = (): void => {};
  const eventCallbacks: Map<string, Set<() => void>> = new Map();

  const webApp: WebApp = {
    initData: '',
    initDataUnsafe: {
      user: {
        id: 12345678,
        first_name: 'Dev',
        last_name: 'User',
        username: 'devuser',
        language_code: 'en',
      },
      auth_date: Math.floor(Date.now() / 1000),
      hash: 'dev_hash',
    },
    version: '7.0',
    platform: 'web',
    colorScheme,
    themeParams,
    isExpanded: true,
    viewportHeight: window.innerHeight,
    viewportStableHeight: window.innerHeight,
    headerColor: themeParams.header_bg_color,
    backgroundColor: themeParams.bg_color,
    isClosingConfirmationEnabled: false,
    ready: noop,
    expand: noop,
    close: () => window.close(),
    enableClosingConfirmation: noop,
    disableClosingConfirmation: noop,
    setHeaderColor: noop,
    setBackgroundColor: noop,
    onEvent: (eventType: string, callback: () => void) => {
      if (!eventCallbacks.has(eventType)) {
        eventCallbacks.set(eventType, new Set());
      }
      eventCallbacks.get(eventType)!.add(callback);
    },
    offEvent: (eventType: string, callback: () => void) => {
      eventCallbacks.get(eventType)?.delete(callback);
    },
    MainButton: {
      text: '',
      color: themeParams.button_color,
      textColor: themeParams.button_text_color,
      isVisible: false,
      isActive: true,
      isProgressVisible: false,
      setText: function(text: string) { this.text = text; },
      onClick: noop,
      offClick: noop,
      show: function() { this.isVisible = true; },
      hide: function() { this.isVisible = false; },
      enable: function() { this.isActive = true; },
      disable: function() { this.isActive = false; },
      showProgress: function() { this.isProgressVisible = true; },
      hideProgress: function() { this.isProgressVisible = false; },
    },
    BackButton: {
      isVisible: false,
      onClick: noop,
      offClick: noop,
      show: function() { this.isVisible = true; },
      hide: function() { this.isVisible = false; },
    },
    HapticFeedback: {
      impactOccurred: noop,
      notificationOccurred: noop,
      selectionChanged: noop,
    },
  };

  // Update viewport on resize
  window.addEventListener('resize', () => {
    webApp.viewportHeight = window.innerHeight;
    webApp.viewportStableHeight = window.innerHeight;
    eventCallbacks.get('viewportChanged')?.forEach(cb => cb());
  });

  window.Telegram = { WebApp: webApp };
}
