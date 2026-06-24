import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { SkillGamezVault } from '../wrappers/SkillGamezVault';

const VAULT_ADDRESS = 'EQCvo4IYY-BfJj_VANO3ejA3mBCkzQ5YsTSNsVaHkB5UWqDX';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
    const isTestnet = process.argv.includes('--testnet');
    const endpoint = isTestnet
        ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
        : 'https://toncenter.com/api/v2/jsonRPC';

    const client = new TonClient({ endpoint });
    const address = Address.parse(process.env.VAULT_ADDRESS ?? VAULT_ADDRESS);
    const vault = client.open(SkillGamezVault.fromAddress(address));

    console.log(`Verifying SkillGamezVault on ${isTestnet ? 'testnet' : 'mainnet'}`);
    console.log('Address:', address.toString());
    console.log('---');

    const balance = await vault.getBalance();
    console.log('Balance:', balance.toString(), 'nanoTON', `(${Number(balance) / 1e9} TON)`);

    await sleep(1500);

    const fees = await vault.getAccumulatedFees();
    console.log('Accumulated Fees:', fees.toString(), 'nanoTON', `(${Number(fees) / 1e9} TON)`);

    await sleep(1500);

    const owner = await vault.getOwner();
    console.log('Owner:', owner.toString());

    console.log('---');
    console.log('Verification complete.');
}

main().catch(console.error);
