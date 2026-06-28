import { TonClient, Address } from '@ton/ton';
import { VAULT_CONTRACT_ADDRESS } from '@skillgamez/shared';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 60000;

let cachedClient: TonClient | null = null;

function getClient(): TonClient {
  if (!cachedClient) {
    cachedClient = new TonClient({
      endpoint: 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TONCENTER_API_KEY,
    });
  }
  return cachedClient;
}

const vaultAddress = Address.parse(VAULT_CONTRACT_ADDRESS);

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const is429 = err instanceof Error && err.message.includes('429');
      if (!is429 || attempt === maxRetries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt);
      console.log(`[DepositVerifier] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('withRetry: unreachable');
}

export interface DepositResult {
  confirmed: boolean;
  actualAmountNano?: bigint;
  reason?: string;
}

/**
 * Poll toncenter for a deposit transaction from the given wallet address
 * to the vault contract with approximately the expected amount.
 */
export async function verifyDeposit(
  senderAddress: string,
  expectedAmountTon: number,
): Promise<DepositResult> {
  const client = getClient();
  const sender = Address.parse(senderAddress);
  const senderRaw = sender.toRawString();
  const expectedNano = BigInt(Math.round(expectedAmountTon * 1e9));
  const minNano = (expectedNano * 90n) / 100n;

  const startedAt = Date.now();
  let pollCount = 0;

  console.log(`[DepositVerifier] Looking for deposit from ${senderRaw} of ~${expectedAmountTon} TON (min ${minNano} nanoTON)`);

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    pollCount++;
    try {
      const transactions = await withRetry(() => client.getTransactions(vaultAddress, { limit: 20 }));

      for (const tx of transactions) {
        const inMsg = tx.inMessage;
        if (!inMsg || inMsg.info.type !== 'internal') continue;

        const txSenderRaw = inMsg.info.src.toRawString();
        const txAmount = inMsg.info.value.coins;

        if (txSenderRaw === senderRaw && txAmount >= minNano) {
          console.log(`[DepositVerifier] Confirmed deposit: ${txAmount} nanoTON from ${txSenderRaw} (poll #${pollCount})`);
          return { confirmed: true, actualAmountNano: txAmount };
        }
      }

      if (pollCount === 1) {
        console.log(`[DepositVerifier] First poll: checked ${transactions.length} transactions, no match yet`);
      }
    } catch (err) {
      console.log(`[DepositVerifier] Poll #${pollCount} error: ${(err as Error).message}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log(`[DepositVerifier] Timeout after ${pollCount} polls (${MAX_POLL_DURATION_MS / 1000}s)`);
  return { confirmed: false, reason: 'Transaction not found within 60 seconds. It may still be processing — check your balance shortly.' };
}
