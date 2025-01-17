import priceManager from './priceManager.js';
import fetch from 'node-fetch';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const { RPC_URL, WALLET_PRIVATE_KEY } = process.env;

if (!RPC_URL) throw "Missing RPC_URL in .env file";
if (!WALLET_PRIVATE_KEY) throw "Missing WALLET_PRIVATE_KEY in .env file";

// Wallet setup
const RPC_CONNECTION = new Connection(RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

// Jupiter API endpoints
const CANCEL_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2/cancelOrders";
const ACTIVE_ORDERS_API = 'https://api.jup.ag/limit/v2/openOrders';
const QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const SWAP_API = "https://quote-api.jup.ag/v6/swap";

// Helper function to cancel a limit order
export async function cancelLimitOrder(tokenID) {

   let limitOrderPublicKey = null;

   const activeOrders = await getActiveOrders(); // Function to fetch active orders for the wallet
   if (activeOrders.length === 0) {
      console.log( '[SellToken] No active orders to cancel.');
      return;
   }

   // only works assuming 1 limit order per tokenID
   activeOrders.forEach(async (order) => {
      if (order.account.inputMint == tokenID) {
         limitOrderPublicKey = order.publicKey;
      }
   })

   if (limitOrderPublicKey == null) {
      return;
   }

   const cancelOrderBody = {
      maker: wallet.limitOrderPublicKey.toBase58(),
      computeUnitPrice: "auto",
      orders: [limitOrderPublicKey],
   };

   const fetchOpts = {
      method: "POST",
      headers: {
         Accept: "application/json",
         "Content-Type": "application/json",
      },
      body: JSON.stringify(cancelOrderBody),
   };

   try {
      const response = await fetch(CANCEL_LIMIT_ORDER_API, fetchOpts);
      const responseData = await response.json();

      console.log(`[SellToken] API Response: ${JSON.stringify(responseData)}`);

      if (responseData.error) {
         console.error(`[SellToken] API Error: ${responseData.error}`);
         return;
      }

      if (!responseData.txs || !Array.isArray(responseData.txs)) {
         console.error(`[SellToken] Unexpected response format. Response: ${JSON.stringify(responseData)}`);
         return;
      }

      for (const tx of responseData.txs) {
         if (!tx || typeof tx !== "string") {
            console.error(`[SellToken] Invalid transaction in 'txs': ${tx}`);
            continue;
         }

         try {
            const txBuff = Buffer.from(tx, "base64");
            const vtx = VersionedTransaction.deserialize(txBuff);
            vtx.sign([wallet]);

            const rpcSendOpts = { skipPreflight: true };
            const hash = await RPC_CONNECTION.sendRawTransaction(vtx.serialize(), rpcSendOpts);
            console.log(`[SellToken] Order canceled successfully for token ${order.publicKey}. Hash: ${hash}`);
         } catch (sendError) {
            console.error(`[SellToken] Failed to send transaction: ${sendError.message}`);
         }
      }

   } catch (error) {
      console.error(`[SellToken] Error canceling order for token ${order.publicKey}:`, error);
   }
}

// Helper function to get active orders
async function getActiveOrders() {
   try {
      const fetchOpts = {
         method: "GET",
         headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
         },
      };

      const response = await fetch(`${ACTIVE_ORDERS_API}?wallet=${wallet.publicKey.toBase58()}`, fetchOpts);
      const responseData = await response.json();

      if (Array.isArray(responseData) && responseData.length > 0) {
         console.log("[SellToken] Active Orders:", responseData);
         return responseData;
      } else {
         console.error("[SellToken] No active orders found.");
         return [];
      }

   } catch (error) {
      console.error("[SellToken] Error fetching active orders:", error);
      return [];
   }
}

// Helper function to perform a swap
async function swapTokenForSol(tokenId, amount) {
   try {
      console.log(`[SellToken] Fetching quote for token ${tokenId}...`);

      const quoteResponse = await (
         await fetch(
            `${QUOTE_API}?inputMint=${tokenId}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=50`
         )
      ).json();

      if (!quoteResponse) throw new Error("Failed to get quote for swap.");

      const { swapTransaction } = await (
         await fetch(SWAP_API, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
            },
            body: JSON.stringify({
               quoteResponse,
               userPublicKey: wallet.publicKey.toString(),
               wrapAndUnwrapSol: true,
               prioritizationFeeLamports: 2000000,
            }),
         })
      ).json();

      const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([wallet]);

      const rawTransaction = transaction.serialize();
      const latestBlockhash = await RPC_CONNECTION.getLatestBlockhash();
      const txid = await RPC_CONNECTION.sendRawTransaction(rawTransaction, {
         skipPreflight: true,
         maxRetries: 2,
      });
      await RPC_CONNECTION.confirmTransaction({
         signature: txid,
         blockhash: latestBlockhash.blockhash,
         lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      });
      console.log(`[SellToken] Swap successful. Tx: https://solscan.io/tx/${txid}`);
   } catch (error) {
      console.error(`[SellToken] Error swapping token ${tokenId}:`, error);
   }
}

// Main function to start the SellToken logic
export function startSellTokenListener() {
   priceManager.on('priceUpdate', async ({ tokenId, livePrice, boughtPrice }) => {
      // console.log(`[SellToken] Price update for token ${tokenId}: Live Price = ${livePrice}, Bought Price = ${boughtPrice}`);

      if (livePrice >= boughtPrice * 2) {
         console.log(`[SellToken] Condition met for token ${tokenId}. Canceling any limit orders and swapping for SOL.`);
         
         await cancelLimitOrder(tokenId);
         
         const amount = Math.floor(boughtPrice * 1e9);
         await swapTokenForSol(tokenId, amount);
      }
   });

   console.log('[SellToken] Listening for price updates...');
   priceManager.startFetchingPrices();
}
