import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import '@ton/test-utils';
import { SkillGamezVault } from '../build/SkillGamezVault/tact_SkillGamezVault';

describe('SkillGamezVault', () => {
    let blockchain: Blockchain;
    let owner: SandboxContract<TreasuryContract>;
    let player: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<SkillGamezVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        owner = await blockchain.treasury('owner');
        player = await blockchain.treasury('player');

        vault = blockchain.openContract(
            await SkillGamezVault.fromInit(owner.address),
        );

        // Deploy
        const deployResult = await vault.send(
            owner.getSender(),
            { value: toNano('0.1') },
            { $$type: 'Deploy', queryId: 0n },
        );
        expect(deployResult.transactions).toHaveTransaction({
            from: owner.address,
            to: vault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy with correct owner and zero fees', async () => {
        const contractOwner = await vault.getOwner();
        expect(contractOwner.equals(owner.address)).toBe(true);

        const fees = await vault.getAccumulatedFees();
        expect(fees).toBe(0n);
    });

    it('should accept deposit above minimum', async () => {
        const balanceBefore = await vault.getBalance();

        const result = await vault.send(
            player.getSender(),
            { value: toNano('1') },
            null, // empty message = deposit
        );
        expect(result.transactions).toHaveTransaction({
            from: player.address,
            to: vault.address,
            success: true,
        });

        const balanceAfter = await vault.getBalance();
        expect(balanceAfter).toBeGreaterThan(balanceBefore);
    });

    it('should reject deposit below minimum (0.1 TON)', async () => {
        const result = await vault.send(
            player.getSender(),
            { value: toNano('0.05') },
            null,
        );
        expect(result.transactions).toHaveTransaction({
            from: player.address,
            to: vault.address,
            success: false,
        });
    });

    it('should withdraw: owner sends payout minus 10% fee', async () => {
        // Deposit first
        await vault.send(player.getSender(), { value: toNano('2') }, null);

        const recipient = await blockchain.treasury('recipient');
        const withdrawAmount = toNano('1'); // 1 TON gross
        const expectedPayout = toNano('0.9'); // 90%
        const expectedFee = toNano('0.1'); // 10%

        const result = await vault.send(
            owner.getSender(),
            { value: toNano('0.05') }, // gas
            {
                $$type: 'Withdraw',
                recipient: recipient.address,
                amount: withdrawAmount,
            },
        );

        expect(result.transactions).toHaveTransaction({
            from: vault.address,
            to: recipient.address,
            value: expectedPayout,
            success: true,
        });

        const fees = await vault.getAccumulatedFees();
        expect(fees).toBe(expectedFee);
    });

    it('should reject withdraw from non-owner', async () => {
        await vault.send(player.getSender(), { value: toNano('2') }, null);

        const result = await vault.send(
            player.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Withdraw',
                recipient: player.address,
                amount: toNano('1'),
            },
        );
        expect(result.transactions).toHaveTransaction({
            from: player.address,
            to: vault.address,
            success: false,
        });
    });

    it('should reject withdraw with insufficient balance', async () => {
        // No deposit — contract only has deployment gas
        const result = await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            {
                $$type: 'Withdraw',
                recipient: player.address,
                amount: toNano('100'),
            },
        );
        expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: vault.address,
            success: false,
        });
    });

    it('should compute correct fee math for various amounts', async () => {
        await vault.send(player.getSender(), { value: toNano('10') }, null);

        // Withdraw 0.5 TON → fee 0.05, payout 0.45
        const recipient = await blockchain.treasury('feetest');
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('0.5') },
        );
        let fees = await vault.getAccumulatedFees();
        expect(fees).toBe(toNano('0.05'));

        // Withdraw 2 TON → fee 0.2, total fees 0.25
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('2') },
        );
        fees = await vault.getAccumulatedFees();
        expect(fees).toBe(toNano('0.25'));

        // Withdraw 0.33 TON → fee = 330000000 * 10 / 100 = 33000000 (integer division, no rounding issue)
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('0.33') },
        );
        fees = await vault.getAccumulatedFees();
        expect(fees).toBe(toNano('0.25') + toNano('0.033'));
    });

    it('should collect fees: owner receives accumulated fees', async () => {
        await vault.send(player.getSender(), { value: toNano('5') }, null);

        // Generate fees via withdrawals
        const recipient = await blockchain.treasury('payee');
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('2') },
        );

        const feesBefore = await vault.getAccumulatedFees();
        expect(feesBefore).toBe(toNano('0.2'));

        // Collect fees
        const result = await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'CollectFees' },
        );

        expect(result.transactions).toHaveTransaction({
            from: vault.address,
            to: owner.address,
            value: toNano('0.2'),
            success: true,
        });

        const feesAfter = await vault.getAccumulatedFees();
        expect(feesAfter).toBe(0n);
    });

    it('should reject collectFees from non-owner', async () => {
        await vault.send(player.getSender(), { value: toNano('5') }, null);
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: player.address, amount: toNano('1') },
        );

        const result = await vault.send(
            player.getSender(),
            { value: toNano('0.05') },
            { $$type: 'CollectFees' },
        );
        expect(result.transactions).toHaveTransaction({
            from: player.address,
            to: vault.address,
            success: false,
        });
    });

    it('should reject collectFees when zero fees accumulated', async () => {
        const result = await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'CollectFees' },
        );
        expect(result.transactions).toHaveTransaction({
            from: owner.address,
            to: vault.address,
            success: false,
        });
    });

    it('should handle multi-cycle: deposit → withdraw → deposit → withdraw → collectFees', async () => {
        // Cycle 1: deposit 3 TON, withdraw 1 TON
        await vault.send(player.getSender(), { value: toNano('3') }, null);
        const recipient = await blockchain.treasury('multi');
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('1') },
        );
        expect(await vault.getAccumulatedFees()).toBe(toNano('0.1'));

        // Cycle 2: deposit 2 TON, withdraw 2 TON
        await vault.send(player.getSender(), { value: toNano('2') }, null);
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: recipient.address, amount: toNano('2') },
        );
        expect(await vault.getAccumulatedFees()).toBe(toNano('0.3'));

        // Collect all fees
        const result = await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'CollectFees' },
        );
        expect(result.transactions).toHaveTransaction({
            from: vault.address,
            to: owner.address,
            value: toNano('0.3'),
            success: true,
        });
        expect(await vault.getAccumulatedFees()).toBe(0n);
    });

    it('should return correct getter values', async () => {
        // Owner getter
        const contractOwner = await vault.getOwner();
        expect(contractOwner.equals(owner.address)).toBe(true);

        // Deposit and check balance
        await vault.send(player.getSender(), { value: toNano('5') }, null);
        const balance = await vault.getBalance();
        expect(balance).toBeGreaterThan(toNano('4.9')); // minus gas

        // Withdraw and check accumulatedFees
        await vault.send(
            owner.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Withdraw', recipient: player.address, amount: toNano('1') },
        );
        const fees = await vault.getAccumulatedFees();
        expect(fees).toBe(toNano('0.1'));
    });
});
