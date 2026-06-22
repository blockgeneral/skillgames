import { toNano } from '@ton/core';
import { NetworkProvider } from '@ton/blueprint';
import { SkillGamezVault } from '../wrappers/SkillGamezVault';

export async function run(provider: NetworkProvider) {
    const owner = provider.sender().address;
    if (!owner) throw new Error('Sender address not available');

    const vault = provider.open(
        await SkillGamezVault.fromInit(owner),
    );

    await vault.send(
        provider.sender(),
        { value: toNano('0.1') },
        { $$type: 'Deploy', queryId: 0n },
    );

    await provider.waitForDeploy(vault.address);

    console.log('SkillGamezVault deployed at:', vault.address.toString());
    console.log('Owner:', owner.toString());

    const balance = await vault.getBalance();
    console.log('Initial balance:', balance.toString(), 'nanotons');
}
