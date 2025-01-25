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
    try {
      //   console.log(inputMint, outputMint, amount)
      //   console.log("[Test] Fetching quote for swap...");
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
                dynamicComputeUnitLimit: true, // Optimizes CU usage
                dynamicSlippage: { "minBps": minSlippage, "maxBps": maxSlippage }, // Set slippage for high volatility
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: priorityFee,
                        global: false, // Local fee market for hot accounts
                        priorityLevel: "veryHigh" // Prioritize landing the transaction
                    }
                }
            }),
        }).then(res => res.json());

        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      //   console.log("[Test] Signing the transaction...");
        transaction.sign([wallet]);

      //   console.log("[Test] Sending swap transaction...");
        const rawTransaction = transaction.serialize();

        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed', // Use a valid commitment level
            maxRetries: 3,
        });

        console.log(`[SellToken] Sell successfull: https://solscan.io/tx/${txid}`);
    } catch (error) {
        console.error("[SellToken] Failed to sell token", error.message);

        if (error.logs) {
            // console.error("[SellToken] Transaction logs:");
            // error.logs.forEach((log) => console.error(log));
        } else {
            console.error("[SellToken] No logs available.");
        }
    }
}