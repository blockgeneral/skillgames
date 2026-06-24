import { Config } from '@ton/blueprint';

const isTestnet = process.argv.includes('--testnet');

export const config: Config = {
  network: {
    endpoint: isTestnet
      ? 'https://testnet.toncenter.com/api/v2/jsonRPC'
      : 'https://toncenter.com/api/v2/jsonRPC',
    type: isTestnet ? 'testnet' : 'mainnet',
    version: 'v2',
    key: process.env.TONCENTER_API_KEY ?? '',
  },
};
