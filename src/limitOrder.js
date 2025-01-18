import priceManager from './priceManager.js';
import fetch from 'node-fetch';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { writeToJson } from './util/data.js';

dotenv.config();

const { RPC_URL, WALLET_PRIVATE_KEY } = process.env;
if (!RPC_URL) throw "Missing RPC_URL in .env file";
if (!WALLET_PRIVATE_KEY) throw "Missing WALLET_PRIVATE_KEY in .env file";

// Wallet setup
const RPC_CONNECTION = new Connection(RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

// Jupiter API endpoints
const CREATE_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2/createOrder";
const CANCEL_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2/cancelOrders";
const ACTIVE_ORDERS_API = 'https://api.jup.ag/limit/v2/openOrders';

// In-memory cache: key = tokenId, value = { limitOrderPublicKey, threshold }
const orderCache = new Map();

// Get active orders for a wallet
async function getActiveOrders() {
  try {
    const response = await fetch(`${ACTIVE_ORDERS_API}?wallet=${wallet.publicKey.toBase58()}`, { method: "GET" });
    const responseData = await response.json();
    return Array.isArray(responseData) ? responseData : [];
  } catch (err) {
    console.error("[LimitOrder] Error fetching active orders:", err);
    return [];
  }
}

// Create Limit Order
export async function createLimitOrder({ tokenId, outputMint, makingAmount, takingAmount, threshold }) {
  // Check cache to see if we already created an order for this token with the same threshold
  const cachedOrder = orderCache.get(tokenId);
  if (cachedOrder && cachedOrder.threshold === threshold) {
    console.log(`[LimitOrder] Order already exists for token ${tokenId} with threshold ${threshold}. Skipping...`);
    return cachedOrder;
  }

  const createOrderBody = {
    inputMint: tokenId,
    outputMint,
    maker: wallet.publicKey.toBase58(),
    payer: wallet.publicKey.toBase58(),
    params: {
      makingAmount: makingAmount.toString(),
      takingAmount: takingAmount.toString(),
    },
    computeUnitPrice: "auto",
  };

  try {
    const response = await fetch(CREATE_LIMIT_ORDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createOrderBody),
    });
    const responseData = await response.json();

    if (!responseData.order) {
      console.error(`[LimitOrder] Error creating limit order: ${JSON.stringify(responseData)}`);
      return null;
    }

    const { order, tx } = responseData;
    const txBuff = Buffer.from(tx, "base64");
    const vtx = VersionedTransaction.deserialize(txBuff);
    vtx.sign([wallet]);

    const hash = await RPC_CONNECTION.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
    const confirmation = await RPC_CONNECTION.confirmTransaction({ signature: hash, commitment: "processed" });
    if (confirmation.value.err) {
      console.error(`[LimitOrder] Transaction failed: ${confirmation.value.err}`);
      return null;
    }

    // Get the new limitOrderPublicKey. You could also grab from API response if available
    // or from a fresh call to getActiveOrders (e.g. find the newly-created order).
    let limitOrderPublicKey = order.publicKey;
    if (!limitOrderPublicKey) {
      const allOrders = await getActiveOrders();
      const newlyCreated = allOrders.find(o => o.account.inputMint === tokenId);
      limitOrderPublicKey = newlyCreated?.publicKey || null;
    }

    // Cache the new order details
    if (limitOrderPublicKey) {
      orderCache.set(tokenId, { limitOrderPublicKey, threshold });
      console.log(`[LimitOrder] Order created for token ${tokenId}, stored in cache. Hash: ${hash}`);
    }

    return { order, hash };
  } catch (error) {
    console.error(`[LimitOrder] Error creating limit order for token ${tokenId}:`, error);
    return null;
  }
}

// Cancel Limit Order
export async function cancelLimitOrder(tokenId) {
  // Check cache for the limitOrderPublicKey
  const cachedOrder = orderCache.get(tokenId);
  let limitOrderPublicKey = cachedOrder?.limitOrderPublicKey;

  if (!limitOrderPublicKey) {
    console.error("[LimitOrder] No matching order found to cancel.");
    return;
  }

  const cancelOrderBody = {
    maker: wallet.publicKey.toBase58(),
    computeUnitPrice: "auto",
    orders: [limitOrderPublicKey],
  };

  try {
    const response = await fetch(CANCEL_LIMIT_ORDER_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cancelOrderBody),
    });
    const responseData = await response.json();

    if (responseData.error) {
      console.error(`[LimitOrder] API Error: ${responseData.error}`);
      return;
    }

    if (!responseData.txs || !Array.isArray(responseData.txs)) {
      console.error(`[LimitOrder] Unexpected response format. Response: ${JSON.stringify(responseData)}`);
      return;
    }

    for (const tx of responseData.txs) {
      if (!tx) continue;
      try {
        const txBuff = Buffer.from(tx, "base64");
        const vtx = VersionedTransaction.deserialize(txBuff);
        vtx.sign([wallet]);
        const hash = await RPC_CONNECTION.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
        console.log(`[LimitOrder] Order canceled successfully: ${limitOrderPublicKey}. Hash: ${hash}`);
      } catch (sendError) {
        console.error(`[LimitOrder] Failed to send transaction: ${sendError.message}`);
      }
    }

    // Remove from cache after successful cancellation
    orderCache.delete(tokenId);
  } catch (err) {
    console.error(`[LimitOrder] Error canceling order: ${limitOrderPublicKey}`, err);
  }
}

// Main
export function startLimitOrderListener() {
  priceManager.on('priceUpdate', async ({ tokenId, livePrice, boughtPrice }) => {
    console.log(`[LimitOrder] Price update for token ${tokenId}: Live=${livePrice}, Bought=${boughtPrice}`);

    const cachedOrder = orderCache.get(tokenId);

    // Condition 1: Price increases by 40%
    if (livePrice >= boughtPrice * 1.4) {
      if (cachedOrder?.threshold === 1.4) return;
      console.log(`[LimitOrder] 40% condition met for token ${tokenId}.`);
      await cancelLimitOrder(tokenId);
      const {order, hash} = await createLimitOrder({
        tokenId,
        outputMint: "So11111111111111111111111111111111111111112",
        makingAmount: boughtPrice,
        takingAmount: livePrice,
        threshold: 1.4,
      });

      writeToJson({
        tokenId,
        threshold: 1.4,
        orderPublicKey: order.publicKey,
      }, 
      false)
    }

    // Condition 2: Price increases by 90%
    if (livePrice >= boughtPrice * 1.9) {
      if (cachedOrder?.threshold === 1.9) return;
      console.log(`[LimitOrder] 90% condition met for token ${tokenId}.`);
      await cancelLimitOrder(tokenId);
      const {order, hash} = await createLimitOrder({
        tokenId,
        outputMint: "So11111111111111111111111111111111111111112",
        makingAmount: boughtPrice * 0.5,
        takingAmount: livePrice,
        threshold: 1.9,
      });

      writeToJson({
        tokenId,
        threshold: 1.9,
        orderPublicKey: order.publicKey,
      }, 
      false)
    }
  });

  console.log('[LimitOrder] Listening for price updates...');
  priceManager.startFetchingPrices();
}
