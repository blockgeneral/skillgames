import { TonClient, Address } from '@ton/ton';
import { VAULT_CONTRACT_ADDRESS } from '@skillgamez/shared';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 30000;

const client = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

const vaultAddress = Address.parse(VAULT_CONTRACT_ADDRESS);

export interface DepositResult {
  confirmed: boolean;
  reason?: string;
}

/**
 * Poll toncenter for a deposit transaction from the given wallet address
 * to the vault contract with the expected amount.
 */
export async function verifyDeposit(
  senderAddress: string,
  expectedAmountTon: number,
): Promise<DepositResult> {
  const sender = Address.parse(senderAddress);
  const expectedNano = BigInt(Math.round(expectedAmountTon * 1e9));
  // Allow 5% tolerance for gas fees
  const minNano = (expectedNano * 95n) / 100n;

  const startedAt = Date.now();

  while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
    try {
      const transactions = await client.getTransactions(vaultAddress, { limit: 20 });

      for (const tx of transactions) {
        const inMsg = tx.inMessage;
        if (!inMsg || inMsg.info.type !== 'internal') continue;

        const txSender = inMsg.info.src;
        const txAmount = inMsg.info.value.coins;

        if (txSender.equals(sender) && txAmount >= minNano) {
          return { confirmed: true };
        }
      }
    } catch {
      // Rate limited or network error — continue polling
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  return { confirmed: false, reason: 'Transaction not found within 30 seconds. It may still be processing — check your balance shortly.' };
}
