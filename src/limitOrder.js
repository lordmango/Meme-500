import priceManager from './priceManager.js';
import fetch from 'node-fetch';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import { writeToJson, readFromJson } from './util/data.js';

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


// Get the publicKey of an active order for a specific token ID and save it to JSON
async function getActiveOrderKeyByTokenId(tokenId) {
   try {
      const response = await fetch(`${ACTIVE_ORDERS_API}?wallet=${wallet.publicKey.toBase58()}`, { method: "GET" });
      const responseData = await response.json();

      if (!Array.isArray(responseData)) {
         console.error("[LimitOrder] Unexpected response format:", responseData);
         return null;
      }

      // Find the matching order by tokenId (inputMint)
      const matchingOrder = responseData.find(order => order.account.inputMint === tokenId);

      if (matchingOrder) {
         const publicKey = matchingOrder.publicKey;

         // Update the publicKey in the JSON file
         writeToJson({ tokenId, orderPublicKey: publicKey }, false);

         console.log(`[LimitOrder] Found and saved publicKey for token ${tokenId}: ${publicKey}`);
         return publicKey;
      } else {
         console.error(`[LimitOrder] No active order found for token ${tokenId}.`);
         return null;
      }
   } catch (err) {
      console.error("[LimitOrder] Error fetching active orders:", err);
      return null;
   }
}

// Create Limit Order
export async function createLimitOrder({ tokenId, outputMint, makingAmount, takingAmount }) {

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
         return false;
      }

      const { tx } = responseData;
      const txBuff = Buffer.from(tx, "base64");
      const vtx = VersionedTransaction.deserialize(txBuff);
      vtx.sign([wallet]);

      const hash = await RPC_CONNECTION.sendRawTransaction(vtx.serialize(), { skipPreflight: true });
      const confirmation = await RPC_CONNECTION.confirmTransaction({ signature: hash, commitment: "processed" });
      if (confirmation.value.err) {
         console.error(`[LimitOrder] Transaction failed: ${confirmation.value.err}`);
         return false;
      }

      // Fetch and save the publicKey for the new order
      console.log(`[LimitOrder] Fetching the publicKey for the created order of token ${tokenId}.`);
      await getActiveOrderKeyByTokenId(tokenId);

      console.log(`[LimitOrder] Limit order for token ${tokenId} created successfully.`);
      return true;
   } catch (error) {
      console.error(`[LimitOrder] Error creating limit order for token ${tokenId}:`, error);
      return false;
   }
}

// Cancel Limit Order
export async function cancelLimitOrder(orderPublicKey) {

   const cancelOrderBody = {
      maker: wallet.publicKey.toBase58(),
      computeUnitPrice: "auto",
      orders: [orderPublicKey],
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
            console.log(`[LimitOrder] Order canceled successfully: ${orderPublicKey}. Hash: ${hash}`);
         } catch (sendError) {
            console.error(`[LimitOrder] Failed to send transaction: ${sendError.message}`);
         }
      }

   } catch (err) {
      console.error(`[LimitOrder] Error canceling order: ${orderPublicKey}`, err);
   }
}

// Main
export function startLimitOrderListener() {
   priceManager.on('priceUpdate', async ({ tokenId, livePrice, boughtPrice }) => {
      console.log(`[LimitOrder] Price update for token ${tokenId}: Live=${livePrice}, Bought=${boughtPrice}`);

      const existingData = readFromJson(tokenId);

      // Condition 1: Price increases by 40%
      if (livePrice >= boughtPrice * 1.4) {
         if (!existingData?.orderPublicKey) {
            // No existing order, create a new one for 1.4
            console.log(`[LimitOrder] Creating new 40% limit order for token ${tokenId}.`);
            await createLimitOrder({
               tokenId,
               outputMint: "So11111111111111111111111111111111111111112",
               makingAmount: boughtPrice,
               takingAmount: livePrice,
            });

            writeToJson({ tokenId, threshold: 1.4 }, false);
            return;
         }

         if (existingData.threshold === 1.4) {
            // Existing order matches 1.4, no action needed
            console.log(`[LimitOrder] 1.4 threshold already exists for token ${tokenId}. No action taken.`);
            return;
         }

         // Update the order to 1.4 if it doesn't match
         console.log(`[LimitOrder] Updating limit order for 40% condition (1.4) for token ${tokenId}.`);
         await cancelLimitOrder(existingData.orderPublicKey);
         await createLimitOrder({
            tokenId,
            outputMint: "So11111111111111111111111111111111111111112",
            makingAmount: boughtPrice,
            takingAmount: livePrice,
         });

         writeToJson({ tokenId, threshold: 1.4 }, false);
      }

      // Condition 2: Price increases by 90%
      if (livePrice >= boughtPrice * 1.9) {
         if (!existingData?.orderPublicKey) {
            // Error: 1.9 should only occur after 1.4
            console.log(`[LimitOrder] Error: No existing order found before reaching 90% condition (1.9) for token ${tokenId}.`);
            return;
         }

         if (existingData.threshold === 1.9) {
            // Existing order matches 1.9, no action needed
            console.log(`[LimitOrder] 1.9 threshold already exists for token ${tokenId}. No action taken.`);
            return;
         }

         // Update the order to 1.9 if it doesn't match
         console.log(`[LimitOrder] Updating limit order for 90% condition (1.9) for token ${tokenId}.`);
         await cancelLimitOrder(existingData.orderPublicKey);
         await createLimitOrder({
            tokenId,
            outputMint: "So11111111111111111111111111111111111111112",
            makingAmount: boughtPrice * 0.5,
            takingAmount: livePrice,
         });

         writeToJson({ tokenId, threshold: 1.9 }, false);
      }
   });

   console.log('[LimitOrder] Listening for price updates...');
   priceManager.startFetchingPrices();
}
