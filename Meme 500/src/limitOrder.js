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
const CREATE_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2/createOrder";
const CANCEL_LIMIT_ORDER_API = "https://api.jup.ag/limit/v2/cancelOrders";

// Track active orders
const activeOrders = new Map(); // Map to store the active order for each token

// Helper function to create a limit order
async function createLimitOrder({ tokenId, outputMint, makingAmount, takingAmount }) {
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

    const fetchOpts = {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(createOrderBody),
    };

    try {
        const response = await fetch(CREATE_LIMIT_ORDER_API, fetchOpts);
        const { order, tx } = await response.json();

        // Deserialize and sign the transaction
        const txBuff = Buffer.from(tx, "base64");
        const vtx = VersionedTransaction.deserialize(txBuff);
        vtx.sign([wallet]);

        // Send the transaction
        const rpcSendOpts = { skipPreflight: true };
        const hash = await RPC_CONNECTION.sendRawTransaction(
            vtx.serialize(),
            rpcSendOpts
        );

        console.log(`[LimitOrder] Order created successfully for token ${tokenId}. Hash: ${hash}`);
        activeOrders.set(tokenId, order); // Store the active order for this token
    } catch (error) {
        console.error(`[LimitOrder] Error creating limit order for token ${tokenId}:`, error);
    }
}

// Helper function to cancel a limit order
async function cancelLimitOrder(tokenId) {
    const activeOrder = activeOrders.get(tokenId);
    if (!activeOrder) {
        console.log(`[LimitOrder] No active order to cancel for token ${tokenId}`);
        return;
    }

    const cancelOrderBody = {
        maker: wallet.publicKey.toBase58(),
        computeUnitPrice: "auto",
        orders: [activeOrder], // Specify the order to cancel
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
        const { txs } = await response.json();

        // Execute cancellation transactions
        for (const tx of txs) {
            const txBuff = Buffer.from(tx, "base64");
            const vtx = VersionedTransaction.deserialize(txBuff);
            vtx.sign([wallet]);

            const rpcSendOpts = { skipPreflight: true };
            const hash = await RPC_CONNECTION.sendRawTransaction(
                vtx.serialize(),
                rpcSendOpts
            );
            console.log(`[LimitOrder] Order canceled successfully for token ${tokenId}. Hash: ${hash}`);
        }

        activeOrders.delete(tokenId); // Remove the active order after cancellation
    } catch (error) {
        console.error(`[LimitOrder] Error canceling order for token ${tokenId}:`, error);
    }
}

// Event listener for price updates
priceManager.on('priceUpdate', ({ tokenId, livePrice, boughtPrice }) => {
    console.log(`[LimitOrder] Price update for token ${tokenId}: Live Price = ${livePrice}, Bought Price = ${boughtPrice}`);

    // Condition 1: Price increases by 40%
    if (livePrice >= boughtPrice * 1.4) {
        console.log(`[LimitOrder] Condition 1 met for token ${tokenId}.`);

        // Cancel existing order (if any) and create a new one
        cancelLimitOrder(tokenId).then(() => {
            createLimitOrder({
                tokenId,
                outputMint: "So11111111111111111111111111111111111111112", // Example output token (SOL)
                makingAmount: boughtPrice, // Selling at bought price
                takingAmount: livePrice, // Receiving at live price
            });
        });
    }

    // Condition 2: Price increases by 90%
    if (livePrice >= boughtPrice * 1.9) {
        console.log(`[LimitOrder] Condition 2 met for token ${tokenId}.`);

        // Cancel existing order (if any) and create a new one
        cancelLimitOrder(tokenId).then(() => {
            createLimitOrder({
                tokenId,
                outputMint: "So11111111111111111111111111111111111111112", // Example output token (SOL)
                makingAmount: boughtPrice * 0.5, // Selling at 50% of bought price
                takingAmount: livePrice, // Receiving at live price
            });
        });
    }
});

// Start monitoring prices
console.log('[LimitOrder] Listening for price updates...');
priceManager.startFetchingPrices();
