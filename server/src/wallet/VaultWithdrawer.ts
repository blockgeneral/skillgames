import { TonClient, WalletContractV3R2, internal, Address, beginCell, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { VAULT_CONTRACT_ADDRESS } from '@skillgamez/shared';

const WITHDRAW_OPCODE = 1859205641;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 60000;

let cachedClient: TonClient | null = null;

function getClient(): TonClient {
  if (!cachedClient) {
    cachedClient = new TonClient({
      endpoint: process.env.TONCENTER_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC',
      apiKey: process.env.TONCENTER_API_KEY,
    });
  }
  return cachedClient;
}

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
      console.log(`[VaultWithdrawer] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('withRetry: unreachable');
}

export interface WithdrawResult {
  success: boolean;
  reason?: string;
}

/**
 * Build the Withdraw message body matching the Tact contract's Withdraw struct:
 * opcode(uint32) + recipient(address) + amount(coins)
 */
function buildWithdrawBody(recipient: Address, amount: bigint) {
  return beginCell()
    .storeUint(WITHDRAW_OPCODE, 32)
    .storeAddress(recipient)
    .storeCoins(amount)
    .endCell();
}

/**
 * Send a Withdraw message to the vault contract from the owner wallet.
 * The contract deducts 10% fee and sends 90% to the recipient.
 */
export async function sendWithdrawal(
  recipientAddress: string,
  grossAmountNano: bigint,
): Promise<WithdrawResult> {
  const mnemonic = process.env.VAULT_OWNER_MNEMONIC;
  if (!mnemonic) {
    return { success: false, reason: 'Server withdrawal not configured (missing mnemonic)' };
  }

  const client = getClient();
  const recipient = Address.parse(recipientAddress);
  const vaultAddress = Address.parse(VAULT_CONTRACT_ADDRESS);

  try {
    // Step 1: Derive owner wallet from mnemonic
    console.log('[VaultWithdrawer] Deriving owner wallet from mnemonic...');
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    const ownerWallet = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log(`[VaultWithdrawer] Owner wallet address: ${ownerWallet.address.toString()}`);
    console.log(`[VaultWithdrawer] Expected owner:       EQDIChzlqjH-2e3Mq7yP54ACE9Y_l_9vl17xS23Ski_s9uGM`);
    if (ownerWallet.address.toString() !== 'EQDIChzlqjH-2e3Mq7yP54ACE9Y_l_9vl17xS23Ski_s9uGM') {
      console.warn('[VaultWithdrawer] WARNING: Derived address does NOT match expected vault owner!');
    }

    // Step 2: Get current seqno
    console.log('[VaultWithdrawer] Getting seqno...');
    const ownerContract = client.open(ownerWallet);
    let seqno: number;
    try {
      seqno = await withRetry(() => ownerContract.getSeqno());
    } catch (err) {
      console.error('[VaultWithdrawer] Failed to get seqno:', (err as Error).message);
      throw err;
    }
    console.log(`[VaultWithdrawer] Seqno: ${seqno}`);

    // Step 3: Build and send withdraw transaction
    console.log('[VaultWithdrawer] Sending withdraw tx...', {
      recipient: recipient.toString(),
      amount: grossAmountNano.toString(),
      vault: vaultAddress.toString(),
      seqno,
    });
    try {
      await withRetry(() => ownerContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
          internal({
            to: vaultAddress,
            value: toNano('0.05'),
            body: buildWithdrawBody(recipient, grossAmountNano),
          }),
        ],
      }));
    } catch (err) {
      console.error('[VaultWithdrawer] Failed to send transfer:', (err as Error).message);
      throw err;
    }
    console.log('[VaultWithdrawer] Transfer sent, polling confirmation...');

    // Step 4: Poll for confirmation — wait for seqno to increment
    const startedAt = Date.now();
    let confirmed = false;
    let pollCount = 0;

    while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      pollCount++;
      try {
        const currentSeqno = await withRetry(() => ownerContract.getSeqno());
        console.log(`[VaultWithdrawer] Poll #${pollCount}: seqno=${currentSeqno} (waiting for >${seqno})`);
        if (currentSeqno > seqno) {
          confirmed = true;
          break;
        }
      } catch (err) {
        console.log(`[VaultWithdrawer] Poll #${pollCount} error: ${(err as Error).message}`);
      }
    }

    if (confirmed) {
      console.log(`[VaultWithdrawer] Withdrawal confirmed (seqno ${seqno} → ${seqno + 1})`);
      return { success: true };
    }

    console.log(`[VaultWithdrawer] Withdrawal timeout after ${pollCount} polls`);
    return { success: false, reason: 'Transaction not confirmed within 60 seconds. It may still be processing.' };
  } catch (err) {
    console.error(`[VaultWithdrawer] Error:`, (err as Error).message);
    return { success: false, reason: `Withdrawal failed: ${(err as Error).message}` };
  }
}
