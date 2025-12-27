import { isAddress, stringToHex } from 'viem';

// V2 Contract Addresses (Base Network)
export const ENGINE_V2_ADDRESS = (import.meta.env.VITE_ENGINE_V2_ADDRESS || '') as `0x${string}`;
export const ORDERBOOK_V2_ADDRESS = (import.meta.env.VITE_ORDERBOOK_V2_ADDRESS || '') as `0x${string}`;
export const ORACLE_ROUTER_ADDRESS = (import.meta.env.VITE_ORACLE_ROUTER_ADDRESS || '') as `0x${string}`;
export const VAULT_ADDRESS = (import.meta.env.VITE_VAULT_ADDRESS || '') as `0x${string}`;
export const INSURANCE_ADDRESS = (import.meta.env.VITE_INSURANCE_ADDRESS || '') as `0x${string}`;
export const COLLATERAL_V2_ADDRESS = (import.meta.env.VITE_COLLATERAL_V2_ADDRESS || '') as `0x${string}`; // USDC
export const MARKET_ID_V2_STRING = (import.meta.env.VITE_MARKET_ID || 'ETH-USD') as string;
export const CHAIN_ID_V2 = Number(import.meta.env.VITE_CHAIN_ID || '8453'); // Base

export const MARKET_ID_V2 = stringToHex(MARKET_ID_V2_STRING, { size: 32 });

export const ENGINE_V2_READY =
  isAddress(ENGINE_V2_ADDRESS) &&
  isAddress(COLLATERAL_V2_ADDRESS) &&
  isAddress(ORACLE_ROUTER_ADDRESS);

export const ORDERBOOK_V2_READY = isAddress(ORDERBOOK_V2_ADDRESS);
export const VAULT_READY = isAddress(VAULT_ADDRESS);

// USDC ABI (6 decimals)
export const USDC_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'value', type: 'uint8' }],
  },
] as const;

// PerpEngineV2 ABI (key functions)
export const PERP_ENGINE_V2_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getPosition',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
    ],
    outputs: [
      {
        components: [
          { name: 'size', type: 'int256' },
          { name: 'entryPrice', type: 'uint256' },
          { name: 'fundingEntry', type: 'int256' },
        ],
        name: 'position',
        type: 'tuple',
      },
    ],
  },
  {
    type: 'function',
    name: 'collateralBalance',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'active', type: 'bool' },
      { name: 'initialMarginBps', type: 'uint256' },
      { name: 'maintenanceMarginBps', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'maxOpenInterest', type: 'uint256' },
      { name: 'maxAccountExposure', type: 'uint256' },
      { name: 'maxFundingRateBps', type: 'uint256' },
      { name: 'openInterest', type: 'uint256' },
      { name: 'longSize', type: 'uint256' },
      { name: 'shortSize', type: 'uint256' },
      { name: 'cumulativeFundingRate', type: 'int256' },
      { name: 'fundingRatePerSecond', type: 'int256' },
      { name: 'lastFundingTime', type: 'uint256' },
    ],
  },
] as const;

// OrderbookV2 ABI (key functions)
export const ORDERBOOK_V2_ABI = [
  {
    type: 'function',
    name: 'placeOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'size', type: 'int256' },
      { name: 'price', type: 'uint256' },
      { name: 'mode', type: 'uint8' }, // 0 = Continuous, 1 = Batch
      { name: 'orderType', type: 'uint8' }, // 0 = Market, 1 = Limit, 2 = Stop
      { name: 'triggerPrice', type: 'uint256' },
    ],
    outputs: [{ name: 'orderId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cancelOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'size', type: 'int256' },
      { name: 'price', type: 'uint256' },
      { name: 'triggerPrice', type: 'uint256' },
      { name: 'mode', type: 'uint8' },
      { name: 'orderType', type: 'uint8' },
      { name: 'status', type: 'uint8' },
      { name: 'next', type: 'uint256' },
      { name: 'createdAt', type: 'uint64' },
      { name: 'lastUpdateAt', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'makerFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'takerFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

// Vault ABI
export const VAULT_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'assets', type: 'uint256' }],
    outputs: [{ name: 'shares', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'shares', type: 'uint256' }],
    outputs: [{ name: 'assets', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalAssets',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

