import type { WagerAmount } from './types/common.js';

/** Platform fee percentage taken from each match payout */
export const PLATFORM_FEE_PERCENT = 10;

/** All valid wager amounts in TON */
export const VALID_WAGER_AMOUNTS: readonly WagerAmount[] = [0.5, 1, 2, 5, 10, 25];

/** Timeout for deposits after match creation (5 minutes) */
export const MATCH_TIMEOUT_MS = 300_000;

/** Grace period for opponent reconnection (10 seconds) */
export const RECONNECT_GRACE_MS = 10_000;

/** WebSocket heartbeat interval (15 seconds) */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** SkillGamezVault contract address on TON mainnet */
export const VAULT_CONTRACT_ADDRESS = 'EQCvo4IYY-BfJj_VANO3ejA3mBCkzQ5YsTSNsVaHkB5UWqDX';

/** Valid deposit amounts in TON */
export const VALID_DEPOSIT_AMOUNTS: readonly number[] = [0.5, 1, 2, 5];
