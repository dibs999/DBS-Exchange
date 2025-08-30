import { createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const CHAINS = [mainnet, sepolia] as const;

export const wagmiConfig = createConfig({
  chains: CHAINS,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

export type Address = `0x${string}`;

export const ADDR: Record<number, {
  WETH: Address;
  USDC: Address;
  WBTC?: Address;
  SWAP_ROUTER_02: Address;
  QUOTER_V2: Address;
  POSITION_MANAGER: Address;
}> = {
  [mainnet.id]: {
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    SWAP_ROUTER_02: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    QUOTER_V2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
    POSITION_MANAGER: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
  },
  [sepolia.id]: {
    WETH: '0xfff9976782d46cc05630d1f6ebab18b2324d6b14',
    USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    SWAP_ROUTER_02: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    QUOTER_V2: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
    POSITION_MANAGER: '0x1238536071E1c677A632429e3655c799b22cDA52',
  },
};
