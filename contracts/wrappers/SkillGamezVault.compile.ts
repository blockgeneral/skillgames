import { CompilerConfig } from '@ton/blueprint';

export const compile: CompilerConfig = {
    lang: 'tact',
    target: 'contracts/skill_gamez_vault.tact',
    options: {
        debug: true,
    },
};
