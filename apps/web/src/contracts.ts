import { isAddress, stringToHex } from 'viem';

export const ENGINE_ADDRESS = (import.meta.env.VITE_ENGINE_ADDRESS || '') as `0x${string}`;
export const COLLATERAL_ADDRESS = (import.meta.env.VITE_COLLATERAL_ADDRESS || '') as `0x${string}`;
export const ORACLE_ADDRESS = (import.meta.env.VITE_ORACLE_ADDRESS || '') as `0x${string}`;
export const ORDERBOOK_ADDRESS = (import.meta.env.VITE_ORDERBOOK_ADDRESS || '') as `0x${string}`;
export const MARKET_ID_STRING = (import.meta.env.VITE_MARKET_ID || 'ETH-USD') as string;

export const MARKET_ID = stringToHex(MARKET_ID_STRING, { size: 32 });

export const ENGINE_READY =
  isAddress(ENGINE_ADDRESS) &&
  isAddress(COLLATERAL_ADDRESS) &&
  isAddress(ORACLE_ADDRESS);

export const ORDERBOOK_READY = isAddress(ORDERBOOK_ADDRESS);

export const COLLATERAL_ABI = [
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

export const ENGINE_ABI = [
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
    name: 'openPosition',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'sizeDelta', type: 'int256' },
      { name: 'leverage', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setOperator',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isOperator',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: 'approved', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'closePosition',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
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
          { name: 'margin', type: 'uint256' },
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
] as const;

export const ORDERBOOK_ABI = [
  {
    type: 'function',
    name: 'createOrder',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'sizeDelta', type: 'int256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'triggerPrice', type: 'uint256' },
      { name: 'isStop', type: 'bool' },
      { name: 'reduceOnly', type: 'bool' },
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
] as const;
