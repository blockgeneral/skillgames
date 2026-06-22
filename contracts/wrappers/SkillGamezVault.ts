// Re-export everything from the Tact-generated wrapper
export {
    SkillGamezVault,
    Withdraw,
    CollectFees,
    storeWithdraw,
    storeCollectFees,
} from '../build/SkillGamezVault/tact_SkillGamezVault';
export type { Withdraw as WithdrawType, CollectFees as CollectFeesType } from '../build/SkillGamezVault/tact_SkillGamezVault';
