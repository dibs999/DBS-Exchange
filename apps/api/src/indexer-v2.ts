import { createPublicClient, formatUnits, hexToString, http, parseAbiItem } from 'viem';
import { base, sepolia } from 'viem/chains';
import { getPool } from './db/index.js';
import { env } from './config.js';
import { broadcast } from './ws.js';
import { getV2Orderbook, getV2Orders, getV2Positions, getV2Trades } from './v2Data.js';

// V2 Event ABIs
const ORDERBOOK_V2_ABI = [
  parseAbiItem('event OrderPlaced(uint256 indexed orderId, address indexed owner, bytes32 indexed marketId, int256 size, uint256 price, uint8 mode, uint8 orderType)'),
  parseAbiItem('event OrderCancelled(uint256 indexed orderId, address indexed owner)'),
  parseAbiItem('event OrderQueued(uint256 indexed orderId, bytes32 indexed marketId)'),
  parseAbiItem('event OrderMatched(uint256 indexed orderId, bytes32 indexed marketId, int256 size, uint256 price, bool isMaker)'),
  parseAbiItem('event AuctionExecuted(bytes32 indexed marketId, uint256 clearingPrice, uint256 ordersTouched)'),
];

const PERP_ENGINE_V2_ABI = [
  parseAbiItem('event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice)'),
  parseAbiItem('event PositionUpdated(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, int256 realizedPnl)'),
  parseAbiItem('event PositionClosed(address indexed account, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl)'),
  parseAbiItem('event LiquidationExecuted(address indexed account, address indexed liquidator, bytes32 indexed marketId, int256 size, uint256 price, int256 pnl, uint256 penalty)'),
  parseAbiItem('event AdlExecuted(address indexed account, bytes32 indexed marketId, int256 size, uint256 price, int256 pnl)'),
  parseAbiItem('event FundingRateUpdated(bytes32 indexed marketId, int256 ratePerSecond, int256 cumulativeFundingRate)'),
];

const VAULT_ABI = [
  parseAbiItem('event VaultDeposit(address indexed account, uint256 assets, uint256 shares)'),
  parseAbiItem('event VaultWithdraw(address indexed account, uint256 assets, uint256 shares)'),
];

export async function startIndexerV2() {
  if (!env.databaseUrl || !env.baseRpcUrl || !env.engineV2Address || !env.orderbookV2Address) {
    console.warn('V2 Indexer: Missing required config; skipping');
    return;
  }

  const pool = getPool();
  const chain = env.chainId === 8453 ? base : sepolia;
  const client = createPublicClient({
    chain,
    transport: http(env.baseRpcUrl || env.rpcUrl),
  });

  // Get last processed block
  let lastBlock = await getLastProcessedBlockV2(pool);
  const currentBlock = await client.getBlockNumber();

  if (lastBlock === 0n) {
    // First run: start from current block - 1000 (safety margin)
    lastBlock = currentBlock - 1000n;
    await updateLastProcessedBlockV2(pool, lastBlock);
  }

  console.log(`V2 Indexer: Starting from block ${lastBlock}, current: ${currentBlock}`);

  // Process historical blocks in batches
  const BATCH_SIZE = 1000n;
  let fromBlock = lastBlock + 1n;

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock 
      ? currentBlock 
      : fromBlock + BATCH_SIZE - 1n;

    try {
      await indexBlockRangeV2(client, pool, fromBlock, toBlock);
      await updateLastProcessedBlockV2(pool, toBlock);
      console.log(`V2 Indexed blocks ${fromBlock} to ${toBlock}`);
      fromBlock = toBlock + 1n;
    } catch (err) {
      console.error(`Error indexing blocks ${fromBlock}-${toBlock}:`, err);
      fromBlock = toBlock + 1n;
    }
  }

  // Watch for new events
  console.log('V2 Indexer: Starting event watchers...');

  if (env.orderbookV2Address) {
    client.watchContractEvent({
      address: env.orderbookV2Address as `0x${string}`,
      abi: ORDERBOOK_V2_ABI,
      eventName: 'OrderPlaced',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexOrderPlaced(pool, log);
          await broadcastV2Orderbook(pool, log.args.marketId as `0x${string}`);
          await broadcastV2Orders(pool, log.args.owner as string);
        }
      },
    });

    client.watchContractEvent({
      address: env.orderbookV2Address as `0x${string}`,
      abi: ORDERBOOK_V2_ABI,
      eventName: 'OrderMatched',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexOrderMatched(pool, log);
          await broadcastV2Orderbook(pool, log.args.marketId as `0x${string}`);
          await broadcastV2Trades(pool, log.args.marketId as `0x${string}`);
          await broadcastV2OrdersByOrderId(pool, log.args.orderId.toString());
        }
      },
    });

    client.watchContractEvent({
      address: env.orderbookV2Address as `0x${string}`,
      abi: ORDERBOOK_V2_ABI,
      eventName: 'OrderCancelled',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexOrderCancelledV2(pool, log);
          await broadcastV2Orderbook(pool, null, log.args.orderId.toString());
          await broadcastV2OrdersByOrderId(pool, log.args.orderId.toString());
        }
      },
    });

    client.watchContractEvent({
      address: env.orderbookV2Address as `0x${string}`,
      abi: ORDERBOOK_V2_ABI,
      eventName: 'AuctionExecuted',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexAuctionExecuted(pool, log);
          await broadcastV2Orderbook(pool, log.args.marketId as `0x${string}`);
          await broadcastV2Trades(pool, log.args.marketId as `0x${string}`);
        }
      },
    });
  }

  if (env.engineV2Address) {
    client.watchContractEvent({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      eventName: 'PositionOpened',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPositionOpenedV2(pool, log);
          await broadcastV2Positions(pool, log.args.account as string);
        }
      },
    });

    client.watchContractEvent({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      eventName: 'PositionUpdated',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPositionUpdatedV2(pool, log);
          await broadcastV2Positions(pool, log.args.account as string);
        }
      },
    });

    client.watchContractEvent({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      eventName: 'PositionClosed',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexPositionClosedV2(pool, log);
          await broadcastV2Positions(pool, log.args.account as string);
        }
      },
    });

    client.watchContractEvent({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      eventName: 'LiquidationExecuted',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexLiquidationExecutedV2(pool, log);
          await broadcastV2Positions(pool, log.args.account as string);
        }
      },
    });

    client.watchContractEvent({
      address: env.engineV2Address as `0x${string}`,
      abi: PERP_ENGINE_V2_ABI,
      eventName: 'FundingRateUpdated',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexFundingRateUpdatedV2(pool, log);
        }
      },
    });
  }

  if (env.vaultAddress) {
    client.watchContractEvent({
      address: env.vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      eventName: 'VaultDeposit',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexVaultDeposit(pool, log);
        }
      },
    });

    client.watchContractEvent({
      address: env.vaultAddress as `0x${string}`,
      abi: VAULT_ABI,
      eventName: 'VaultWithdraw',
      onLogs: async (logs) => {
        for (const log of logs) {
          await indexVaultWithdraw(pool, log);
        }
      },
    });
  }
}

async function getLastProcessedBlockV2(pool: any): Promise<bigint> {
  const result = await pool.query('SELECT last_processed_block FROM v2_indexer_state WHERE id = 1');
  if (result.rows.length === 0) {
    await pool.query('INSERT INTO v2_indexer_state (id, last_processed_block) VALUES (1, 0)');
    return 0n;
  }
  return BigInt(result.rows[0].last_processed_block);
}

async function updateLastProcessedBlockV2(pool: any, blockNumber: bigint) {
  await pool.query(
    'UPDATE v2_indexer_state SET last_processed_block = $1, last_updated_at = NOW() WHERE id = 1',
    [blockNumber.toString()]
  );
}

async function indexBlockRangeV2(client: any, pool: any, fromBlock: bigint, toBlock: bigint) {
  if (env.orderbookV2Address) {
    const [orderPlacedLogs, orderMatchedLogs, orderCancelledLogs, auctionLogs] = await Promise.all([
      client.getLogs({
        address: env.orderbookV2Address as `0x${string}`,
        event: parseAbiItem('event OrderPlaced(uint256 indexed orderId, address indexed owner, bytes32 indexed marketId, int256 size, uint256 price, uint8 mode, uint8 orderType)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.orderbookV2Address as `0x${string}`,
        event: parseAbiItem('event OrderMatched(uint256 indexed orderId, bytes32 indexed marketId, int256 size, uint256 price, bool isMaker)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.orderbookV2Address as `0x${string}`,
        event: parseAbiItem('event OrderCancelled(uint256 indexed orderId, address indexed owner)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.orderbookV2Address as `0x${string}`,
        event: parseAbiItem('event AuctionExecuted(bytes32 indexed marketId, uint256 clearingPrice, uint256 ordersTouched)'),
        fromBlock,
        toBlock,
      }),
    ]);

    for (const log of orderPlacedLogs) await indexOrderPlaced(pool, log);
    for (const log of orderMatchedLogs) await indexOrderMatched(pool, log);
    for (const log of orderCancelledLogs) await indexOrderCancelledV2(pool, log);
    for (const log of auctionLogs) await indexAuctionExecuted(pool, log);
  }

  if (env.engineV2Address) {
    const [posOpenedLogs, posUpdatedLogs, posClosedLogs, liquidatedLogs, fundingLogs] = await Promise.all([
      client.getLogs({
        address: env.engineV2Address as `0x${string}`,
        event: parseAbiItem('event PositionOpened(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.engineV2Address as `0x${string}`,
        event: parseAbiItem('event PositionUpdated(address indexed account, bytes32 indexed marketId, int256 size, uint256 entryPrice, int256 realizedPnl)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.engineV2Address as `0x${string}`,
        event: parseAbiItem('event PositionClosed(address indexed account, bytes32 indexed marketId, int256 size, uint256 exitPrice, int256 pnl)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.engineV2Address as `0x${string}`,
        event: parseAbiItem('event LiquidationExecuted(address indexed account, address indexed liquidator, bytes32 indexed marketId, int256 size, uint256 price, int256 pnl, uint256 penalty)'),
        fromBlock,
        toBlock,
      }),
      client.getLogs({
        address: env.engineV2Address as `0x${string}`,
        event: parseAbiItem('event FundingRateUpdated(bytes32 indexed marketId, int256 ratePerSecond, int256 cumulativeFundingRate)'),
        fromBlock,
        toBlock,
      }),
    ]);

    for (const log of posOpenedLogs) await indexPositionOpenedV2(pool, log);
    for (const log of posUpdatedLogs) await indexPositionUpdatedV2(pool, log);
    for (const log of posClosedLogs) await indexPositionClosedV2(pool, log);
    for (const log of liquidatedLogs) await indexLiquidationExecutedV2(pool, log);
    for (const log of fundingLogs) await indexFundingRateUpdatedV2(pool, log);
  }
}

async function indexOrderPlaced(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.size as bigint, 18));
  const mode = Number(log.args.mode) === 0 ? 'continuous' : 'batch';
  const orderType = Number(log.args.orderType) === 0 ? 'market' : Number(log.args.orderType) === 1 ? 'limit' : 'stop';
  const side = size >= 0 ? 'buy' : 'sell';

  await pool.query(
    `INSERT INTO v2_orders (order_id, address, market_id, side, type, mode, size, price, trigger_price, status, created_at, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
     ON CONFLICT (order_id) DO UPDATE SET status = $10`,
    [
      log.args.orderId.toString(),
      log.args.owner.toLowerCase(),
      marketId,
      side,
      orderType,
      mode,
      Math.abs(size),
      log.args.price ? Number(formatUnits(log.args.price as bigint, 18)) : null,
      null, // trigger_price not in OrderPlaced event
      orderType === 'stop' ? 'trigger_pending' : mode === 'batch' ? 'queued_for_auction' : 'live',
      log.transactionHash,
    ]
  );
}

async function indexOrderMatched(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.size as bigint, 18));
  const side = size >= 0 ? 'buy' : 'sell';

  // Update order filled amount
  await pool.query(
    `UPDATE v2_orders 
     SET filled = filled + $1, status = CASE WHEN filled + $1 >= size THEN 'filled' ELSE status END, filled_at = COALESCE(filled_at, NOW())
     WHERE order_id = $2`,
    [Math.abs(size), log.args.orderId.toString()]
  );

  // Insert trade (no unique constraint, so we check for duplicates by tx_hash + order_id)
  const existing = await pool.query(
    'SELECT id FROM v2_trades WHERE tx_hash = $1 AND order_id = $2',
    [log.transactionHash, log.args.orderId.toString()]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO v2_trades (market_id, order_id, side, size, price, is_maker, tx_hash, block_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        marketId,
        log.args.orderId.toString(),
        side,
        Math.abs(size),
        Number(formatUnits(log.args.price as bigint, 18)),
        log.args.isMaker,
        log.transactionHash,
        Number(log.blockNumber),
      ]
    );
  }
}

async function indexOrderCancelledV2(pool: any, log: any) {
  await pool.query(
    `UPDATE v2_orders 
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE order_id = $1`,
    [log.args.orderId.toString()]
  );
}

async function indexAuctionExecuted(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');

  // Get auction details from orderbook (would need to read contract state)
  // For now, store basic info
  // Check if auction already indexed
  const existing = await pool.query(
    'SELECT id FROM auction_history WHERE tx_hash = $1',
    [log.transactionHash]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO auction_history (market_id, clearing_price, orders_touched, buy_volume, sell_volume, matched_volume, tx_hash, block_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        marketId,
        Number(formatUnits(log.args.clearingPrice as bigint, 18)),
        Number(log.args.ordersTouched),
        0, // Would need to calculate from orders
        0, // Would need to calculate from orders
        0, // Would need to calculate from orders
        log.transactionHash,
        Number(log.blockNumber),
      ]
    );
  }
}

async function indexPositionOpenedV2(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.size as bigint, 18));

  // Check if position already exists (open position)
  const existing = await pool.query(
    'SELECT id FROM v2_positions WHERE address = $1 AND market_id = $2 AND closed_at IS NULL',
    [log.args.account.toLowerCase(), marketId]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO v2_positions (address, market_id, size, entry_price, funding_entry, opened_at, tx_hash_open)
       VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
      [
        log.args.account.toLowerCase(),
        marketId,
        size,
        Number(formatUnits(log.args.entryPrice as bigint, 18)),
        0, // funding_entry not in event, would need to read from contract
        log.transactionHash,
      ]
    );
  }
}

async function indexPositionUpdatedV2(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');
  const size = Number(formatUnits(log.args.size as bigint, 18));

  await pool.query(
    `UPDATE v2_positions 
     SET size = $1, entry_price = $2
     WHERE address = $3 AND market_id = $4 AND closed_at IS NULL
     ORDER BY opened_at DESC LIMIT 1`,
    [
      size,
      Number(formatUnits(log.args.entryPrice as bigint, 18)),
      log.args.account.toLowerCase(),
      marketId,
    ]
  );
}

async function indexPositionClosedV2(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');

  await pool.query(
    `UPDATE v2_positions 
     SET closed_at = NOW(), tx_hash_close = $1
     WHERE address = $2 AND market_id = $3 AND closed_at IS NULL
     ORDER BY opened_at DESC LIMIT 1`,
    [
      log.transactionHash,
      log.args.account.toLowerCase(),
      marketId,
    ]
  );
}

async function indexLiquidationExecutedV2(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');

  await pool.query(
    `UPDATE v2_positions 
     SET closed_at = NOW(), tx_hash_close = $1
     WHERE address = $2 AND market_id = $3 AND closed_at IS NULL
     ORDER BY opened_at DESC LIMIT 1`,
    [
      log.transactionHash,
      log.args.account.toLowerCase(),
      marketId,
    ]
  );
}

async function indexFundingRateUpdatedV2(pool: any, log: any) {
  const marketId = hexToString(log.args.marketId as `0x${string}`, { size: 32 }).replace(/\0/g, '');

  // Check if funding update already indexed for this block
  const existing = await pool.query(
    'SELECT id FROM v2_funding_history WHERE market_id = $1 AND block_number = $2',
    [marketId, Number(log.blockNumber)]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO v2_funding_history (market_id, rate_per_second, cumulative_rate, long_notional, short_notional, imbalance, block_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        marketId,
        Number(formatUnits(log.args.ratePerSecond as bigint, 18)),
        Number(formatUnits(log.args.cumulativeFundingRate as bigint, 18)),
        0, // Would need to read from contract
        0, // Would need to read from contract
        0, // Would need to calculate
        Number(log.blockNumber),
      ]
    );
  }
}

async function indexVaultDeposit(pool: any, log: any) {
  // Check if deposit already indexed
  const existing = await pool.query(
    'SELECT id FROM vault_deposits WHERE tx_hash = $1',
    [log.transactionHash]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO vault_deposits (address, assets, shares, tx_hash)
       VALUES ($1, $2, $3, $4)`,
      [
        log.args.account.toLowerCase(),
        Number(formatUnits(log.args.assets as bigint, 6)), // USDC 6 decimals
        Number(formatUnits(log.args.shares as bigint, 18)),
        log.transactionHash,
      ]
    );
  }
}

async function indexVaultWithdraw(pool: any, log: any) {
  // Check if withdrawal already indexed
  const existing = await pool.query(
    'SELECT id FROM vault_withdrawals WHERE tx_hash = $1',
    [log.transactionHash]
  );
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO vault_withdrawals (address, assets, shares, tx_hash)
       VALUES ($1, $2, $3, $4)`,
      [
        log.args.account.toLowerCase(),
        Number(formatUnits(log.args.assets as bigint, 6)), // USDC 6 decimals
        Number(formatUnits(log.args.shares as bigint, 18)),
        log.transactionHash,
      ]
    );
  }
}

function parseMarketId(marketIdHex: `0x${string}`): string {
  return hexToString(marketIdHex, { size: 32 }).replace(/\0/g, '');
}

async function getOrderMeta(pool: any, orderId: string): Promise<{ marketId: string | null; address: string | null }> {
  try {
    const result = await pool.query(
      `SELECT market_id, address FROM v2_orders WHERE order_id = $1 LIMIT 1`,
      [orderId]
    );
    if (result.rows.length === 0) return { marketId: null, address: null };
    return { marketId: result.rows[0].market_id, address: result.rows[0].address };
  } catch {
    return { marketId: null, address: null };
  }
}

async function broadcastV2Orderbook(pool: any, marketIdHex?: `0x${string}` | null, orderId?: string) {
  let marketId: string | null = null;
  if (marketIdHex) {
    marketId = parseMarketId(marketIdHex);
  } else if (orderId) {
    const meta = await getOrderMeta(pool, orderId);
    marketId = meta.marketId;
  }

  if (!marketId) return;
  const snapshot = await getV2Orderbook(pool, marketId);
  broadcast({ type: 'v2:orderbook', marketId, data: snapshot });
}

async function broadcastV2Trades(pool: any, marketIdHex: `0x${string}`) {
  const marketId = parseMarketId(marketIdHex);
  const trades = await getV2Trades(pool, marketId);
  broadcast({ type: 'v2:trades', marketId, data: trades });
}

async function broadcastV2Orders(pool: any, address: string) {
  const orders = await getV2Orders(pool, address);
  broadcast({ type: 'v2:orders', address, data: orders });
}

async function broadcastV2OrdersByOrderId(pool: any, orderId: string) {
  const meta = await getOrderMeta(pool, orderId);
  if (!meta.address) return;
  await broadcastV2Orders(pool, meta.address);
}

async function broadcastV2Positions(pool: any, address: string) {
  const positions = await getV2Positions(pool, address);
  broadcast({ type: 'v2:positions', address, data: positions });
}
