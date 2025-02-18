import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import fetch from 'cross-fetch';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

// Environment variables
const { RPC_URL, WALLET_PRIVATE_KEY, WALLET_ADDRESS } = process.env;

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
            preflightCommitment: 'confirmed',
            maxRetries: 3,
        });

        const txResult = await fetchTransactionWithRetry(txid);

        if (txResult) {
            console.log(`[SwapToken] Swap succeeded: https://solscan.io/tx/${txid}`);
            return txid; // Transaction succeeded
        } else {
            console.error("[SwapToken] Swap failed on-chain.");
            return null; // Transaction failed
        }

    } catch (error) {
        console.error("[SwapToken] Failed to Swap token", error.message);

        if (error.logs) {
            // console.error("[SellToken] Transaction logs:");
            // error.logs.forEach((log) => console.error(log));
        } else {
            console.error("[SwapToken] No logs available.");
        }
        return null;
    }
}

async function fetchTransactionWithRetry(txid, retries = 4, delay = 1000) {
    for (let i = 0; i <= retries; i++) {
        await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying

        console.log(`[SwapToken] Attempt ${i + 1}: Fetching transaction ${txid}...`);
        const txn = await connection.getParsedTransaction(txid, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
        });

        if (txn && txn.meta && !txn.meta.err) {
            return txn;
        }
    }

    console.error("[SwapToken] Transaction not found after retries.");
    return null;
}
