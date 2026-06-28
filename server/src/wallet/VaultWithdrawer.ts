import { TonClient, WalletContractV4, internal, Address, beginCell, toNano } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { VAULT_CONTRACT_ADDRESS } from '@skillgamez/shared';

const WITHDRAW_OPCODE = 1859205641;
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 60000;

let cachedClient: TonClient | null = null;

function getClient(): TonClient {
  if (!cachedClient) {
    cachedClient = new TonClient({
      endpoint: process.env.TONCENTER_ENDPOINT ?? 'https://toncenter.com/api/v2/jsonRPC',
    });
  }
  return cachedClient;
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
 *
 * @param recipientAddress - player's wallet address (user-friendly or raw)
 * @param grossAmountNano - gross amount in nanoTON (before fee)
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
    // Derive owner wallet from mnemonic
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    const ownerWallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const ownerContract = client.open(ownerWallet);
    const seqno = await ownerContract.getSeqno();

    console.log(`[VaultWithdrawer] Sending withdraw: ${grossAmountNano} nanoTON to ${recipient.toString()}`);

    // Send Withdraw message to vault contract
    await ownerContract.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: vaultAddress,
          value: toNano('0.05'), // gas for the vault contract to process
          body: buildWithdrawBody(recipient, grossAmountNano),
        }),
      ],
    });

    // Poll for confirmation — wait for seqno to increment
    const startedAt = Date.now();
    let confirmed = false;

    while (Date.now() - startedAt < MAX_POLL_DURATION_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      try {
        const currentSeqno = await ownerContract.getSeqno();
        if (currentSeqno > seqno) {
          confirmed = true;
          break;
        }
      } catch {
        // Rate limited — keep polling
      }
    }

    if (confirmed) {
      console.log(`[VaultWithdrawer] Withdrawal confirmed (seqno ${seqno} → ${seqno + 1})`);
      return { success: true };
    }

    console.log(`[VaultWithdrawer] Withdrawal timeout — transaction may still be processing`);
    return { success: false, reason: 'Transaction not confirmed within 60 seconds. It may still be processing.' };
  } catch (err) {
    console.error(`[VaultWithdrawer] Error:`, (err as Error).message);
    return { success: false, reason: `Withdrawal failed: ${(err as Error).message}` };
  }
}
