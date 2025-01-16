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
const QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const SWAP_API = "https://quote-api.jup.ag/v6/swap";

// Helper function to cancel existing limit orders
async function cancelLimitOrder(tokenId) {
   try {
      const cancelOrderBody = {
         maker: wallet.publicKey.toBase58(),
         computeUnitPrice: "auto",
      };

      const fetchOpts = {
         method: "POST",
         headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
         },
         body: JSON.stringify(cancelOrderBody),
      };

      const response = await fetch(CANCEL_LIMIT_ORDER_API, fetchOpts);
      const { txs } = await response.json();

      for (const tx of txs) {
         const txBuff = Buffer.from(tx, "base64");
         const vtx = VersionedTransaction.deserialize(txBuff);
         vtx.sign([wallet]);

         const rpcSendOpts = { skipPreflight: true };
         const hash = await RPC_CONNECTION.sendRawTransaction(
            vtx.serialize(),
            rpcSendOpts
         );
         console.log(`[SellToken] Canceled limit order for token ${tokenId}. Tx Hash: ${hash}`);
      }
   } catch (error) {
      console.error(`[SellToken] Error canceling limit order for token ${tokenId}:`, error);
   }
}

// Helper function to perform a swap
async function swapTokenForSol(tokenId, amount) {
   try {
      console.log(`[SellToken] Fetching quote for token ${tokenId}...`);

      // Fetch the quote for the swap
      const quoteResponse = await (
         await fetch(
            `${QUOTE_API}?inputMint=${tokenId}&outputMint=So11111111111111111111111111111111111111112&amount=${amount}&slippageBps=50`
         )
      ).json();

      if (!quoteResponse) throw new Error("Failed to get quote for swap.");

      console.log(`[SellToken] Quote received. Performing swap...`);

      // Request the swap transaction
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

      if (!swapTransaction) throw new Error("Failed to get swap transaction.");

      // Deserialize and sign the transaction
      const swapTransactionBuf = Buffer.from(swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([wallet]);

      // Execute the transaction
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

// Event listener for price updates
priceManager.on('priceUpdate', ({ tokenId, livePrice, boughtPrice }) => {
   console.log(`[SellToken] Price update for token ${tokenId}: Live Price = ${livePrice}, Bought Price = ${boughtPrice}`);

   // Condition: Price increases by 100%
   if (livePrice >= boughtPrice * 2) {
      console.log(`[SellToken] Condition met for token ${tokenId}. Canceling any limit orders and swapping for SOL.`);

      // Cancel existing limit orders and swap the token for SOL
      cancelLimitOrder(tokenId).then(() => {
         const amount = Math.floor(boughtPrice * 1e9); // Assuming amount is in Lamports (adjust as needed)
         swapTokenForSol(tokenId, amount);
      });
   }
});

// Start monitoring prices
console.log('[SellToken] Listening for price updates...');
priceManager.startFetchingPrices();
