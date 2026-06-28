import { createHmac } from 'node:crypto';

export interface TelegramUser {
  id: number;
  firstName: string;
  username?: string;
}

/**
 * Validate Telegram initData using HMAC-SHA256 chain.
 * Falls back to dev mode (accepts mock JSON) when BOT_TOKEN is not set.
 */
export function validateInitData(initData: string): TelegramUser | null {
  const botToken = process.env.BOT_TOKEN;

  if (!botToken) {
    console.warn('[Auth] No BOT_TOKEN set — using dev mode auth');
    return validateMock(initData);
  }

  // Try real Telegram initData validation first
  const result = validateTelegram(initData, botToken);
  if (result) return result;

  // If BOT_TOKEN is set but validation fails, don't fall back to mock
  console.warn('[Auth] initData validation failed');
  return null;
}

function validateTelegram(initData: string, botToken: string): TelegramUser | null {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Remove hash, sort params alphabetically, join with \n
    params.delete('hash');
    const entries = Array.from(params.entries());
    entries.sort(([a], [b]) => a.localeCompare(b));
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

    // HMAC chain: secret = HMAC-SHA256("WebAppData", bot_token)
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (computedHash !== hash) {
      console.warn('[Auth] initData hash mismatch');
      return null;
    }

    // Extract user data
    const userStr = params.get('user');
    if (!userStr) return null;

    const user = JSON.parse(userStr) as { id: number; first_name: string; last_name?: string; username?: string };
    return {
      id: user.id,
      firstName: user.username || user.first_name || `Player${user.id}`,
      username: user.username,
    };
  } catch (err) {
    console.error('[Auth] Failed to validate initData:', err);
    return null;
  }
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
