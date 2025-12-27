export const ORACLE_ABI = [
  {
    type: 'event',
    name: 'PriceUpdated',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'price', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'getPrice',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [{ name: 'price', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setPrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export const ENGINE_ABI = [
  {
    type: 'event',
    name: 'PositionOpened',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'size', type: 'int256', indexed: false },
      { name: 'entryPrice', type: 'uint256', indexed: false },
      { name: 'margin', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionUpdated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'size', type: 'int256', indexed: false },
      { name: 'entryPrice', type: 'uint256', indexed: false },
      { name: 'margin', type: 'uint256', indexed: false },
      { name: 'realizedPnl', type: 'int256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PositionClosed',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'size', type: 'int256', indexed: false },
      { name: 'exitPrice', type: 'uint256', indexed: false },
      { name: 'pnl', type: 'int256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Liquidated',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'liquidator', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'size', type: 'int256', indexed: false },
      { name: 'exitPrice', type: 'uint256', indexed: false },
      { name: 'pnl', type: 'int256', indexed: false },
      { name: 'penalty', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'initialMarginBps', type: 'uint256', indexed: false },
      { name: 'maintenanceMarginBps', type: 'uint256', indexed: false },
      { name: 'maxLeverage', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FundingRateUpdated',
    inputs: [
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'ratePerSecond', type: 'int256', indexed: false },
      { name: 'cumulativeFundingRate', type: 'int256', indexed: false },
    ],
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
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'isActive', type: 'bool' },
      { name: 'initialMarginBps', type: 'uint256' },
      { name: 'maintenanceMarginBps', type: 'uint256' },
      { name: 'maxLeverage', type: 'uint256' },
      { name: 'cumulativeFundingRate', type: 'int256' },
      { name: 'fundingRatePerSecond', type: 'int256' },
      { name: 'lastFundingTime', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'liquidate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setFundingRate',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'ratePerSecond', type: 'int256' },
    ],
    outputs: [],
  },
] as const;

export const ORDERBOOK_ABI = [
  {
    type: 'event',
    name: 'OrderCreated',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'sizeDelta', type: 'int256', indexed: false },
      { name: 'leverage', type: 'uint256', indexed: false },
      { name: 'triggerPrice', type: 'uint256', indexed: false },
      { name: 'isStop', type: 'bool', indexed: false },
      { name: 'reduceOnly', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrderCancelled',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'OrderExecuted',
    inputs: [
      { name: 'orderId', type: 'uint256', indexed: true },
      { name: 'owner', type: 'address', indexed: true },
      { name: 'marketId', type: 'bytes32', indexed: true },
      { name: 'sizeDelta', type: 'int256', indexed: false },
      { name: 'executionPrice', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'nextOrderId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'orders',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'marketId', type: 'bytes32' },
      { name: 'sizeDelta', type: 'int256' },
      { name: 'leverage', type: 'uint256' },
      { name: 'triggerPrice', type: 'uint256' },
      { name: 'isStop', type: 'bool' },
      { name: 'reduceOnly', type: 'bool' },
      { name: 'active', type: 'bool' },
      { name: 'createdAt', type: 'uint64' },
    ],
  },
  {
    type: 'function',
    name: 'executeOrder',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'uint256' }],
    outputs: [],
  },
] as const;
