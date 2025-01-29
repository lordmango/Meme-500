import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// Environment variables
const { RPC_URL, WALLET_PRIVATE_KEY } = process.env;

if (!RPC_URL) throw new Error("Missing RPC_URL in .env file");
if (!WALLET_PRIVATE_KEY) throw new Error("Missing WALLET_PRIVATE_KEY in .env file");

// Setup Solana connection and wallet
const connection = new Connection(RPC_URL, "confirmed");
const wallet = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

export async function swapTokens(inputMint, outputMint, amount, priorityFee, minSlippage, maxSlippage, quoteSlippage) {
   const maxRetries = 3;
   let retryCount = 0;

   while (retryCount < maxRetries) {
       try {
           console.log(`[Attempt ${retryCount + 1}] Fetching quote for swap...`);
           const quoteResponse = await fetch(
               `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${Math.floor(amount * 1e6)}&slippageBps=${quoteSlippage}&restrictIntermediateTokens=true`
           ).then(res => res.json());

           if (!quoteResponse) throw new Error("Failed to fetch quote.");

           const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                   quoteResponse,
                   userPublicKey: wallet.publicKey.toString(),
                   wrapAndUnwrapSol: true,
                   dynamicComputeUnitLimit: true,
                   dynamicSlippage: { minBps: minSlippage, maxBps: maxSlippage },
                   prioritizationFeeLamports: {
                       priorityLevelWithMaxLamports: {
                           maxLamports: priorityFee,
                           global: false,
                           priorityLevel: "veryHigh",
                       },
                   },
               }),
           }).then(res => res.json());

           const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
           const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

           transaction.sign([wallet]);
           const rawTransaction = transaction.serialize();

           console.log(`[Attempt ${retryCount + 1}] Sending swap transaction...`);
           const txid = await connection.sendRawTransaction(rawTransaction, {
               skipPreflight: false,
               preflightCommitment: 'confirmed',
               maxRetries: 3,
           });

           const latestBlockHash = await connection.getLatestBlockhash();
           await connection.confirmTransaction({
               blockhash: latestBlockHash.blockhash,
               lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
               signature: txid,
           });

           console.log(`[SellToken] Swap successful: https://solscan.io/tx/${txid}`);
           return; // Exit on success

       } catch (error) {
           retryCount++;
           console.error(`[SellToken] Attempt ${retryCount} failed.`);
           if (retryCount === maxRetries) {
               console.error("[SellToken] Max retries reached. Transaction failed.");
               throw error; // Allow the calling function to handle the error
           }
           console.log("[SellToken] Retrying...");
       }
   }
}
