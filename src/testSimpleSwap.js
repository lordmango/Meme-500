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

// Token mints (replace with the desired tokens for your swap)
const INPUT_MINT = "BmHWZjWxHfBm7uwwVe7ezyan4hRt6MZN3gczUa8Epump"; // Example: SOL
const OUTPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: USDC
const AMOUNT = 12467000000; // Amount in lamports (e.g., 0.05 SOL)
const SLIPPAGE_BPS = 1000; // Slippage in basis points (e.g., 2%)
const PRIORITY_FEE = 5000000; // Priority fee in lamports: 0.01 SOL
const MIN_BPS = 0; // Min slippage
const MAX_BPS = 200; // Min slippage

// Main function for swapping tokens
async function swapTokens() {
    try {
        console.log("[Test] Fetching quote for swap...");
        const quoteResponse = await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=${INPUT_MINT}&outputMint=${OUTPUT_MINT}&amount=${AMOUNT}&slippageBps=${SLIPPAGE_BPS}&restrictIntermediateTokens=true`
        ).then(res => res.json());

        if (!quoteResponse) throw new Error("Failed to fetch quote.");

        console.log("[Test] Generating swap transaction...");
        const { swapTransaction } = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse,
                userPublicKey: wallet.publicKey.toString(),
                wrapAndUnwrapSol: true,
                dynamicComputeUnitLimit: true, // Optimizes CU usage
                dynamicSlippage: { "minBps": MIN_BPS, "maxBps": MAX_BPS }, // Set slippage for high volatility
                prioritizationFeeLamports: {
                    priorityLevelWithMaxLamports: {
                        maxLamports: PRIORITY_FEE,
                        global: false, // Local fee market for hot accounts
                        priorityLevel: "veryHigh" // Prioritize landing the transaction
                    }
                }
            }),
        }).then(res => res.json());

        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        console.log("[Test] Signing the transaction...");
        transaction.sign([wallet]);

        console.log("[Test] Sending swap transaction...");
        const rawTransaction = transaction.serialize();

        // Revert to using connection.sendRawTransaction
        const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed', // Use a valid commitment level
            maxRetries: 5,
        });

        console.log(`[Test] Transaction sent successfully. TXID: ${txid}`);
        console.log(`[Test] View on Solscan: https://solscan.io/tx/${txid}`);
    } catch (error) {
        console.error("[Test] Error during transaction execution:", error.message);

        if (error.logs) {
            console.error("[Test] Transaction logs:");
            error.logs.forEach((log) => console.error(log));
        } else {
            console.error("[Test] No logs available.");
        }
    }
}

// Execute the swap test
swapTokens();
