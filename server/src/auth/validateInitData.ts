export interface TelegramUser {
  id: number;
  firstName: string;
  username?: string;
}

/**
 * Validate Telegram initData and extract user info.
 * In development mode, accepts raw JSON for testing.
 * Production HMAC-SHA256 validation is a TODO.
 */
export function validateInitData(initData: string): TelegramUser | null {
  if (process.env.NODE_ENV === 'development') {
    return validateMock(initData);
  }

  // TODO: Production mode — parse initData query string, validate HMAC-SHA256
  // against the bot token, extract and return the user.
  return validateMock(initData);
}

function validateMock(initData: string): TelegramUser | null {
  try {
    const parsed = JSON.parse(initData);
    if (typeof parsed.id !== 'number' || typeof parsed.firstName !== 'string') {
      return null;
    }
    return {
      id: parsed.id,
      firstName: parsed.firstName,
      username: typeof parsed.username === 'string' ? parsed.username : undefined,
    };
  } catch {
    return null;
  }
}
