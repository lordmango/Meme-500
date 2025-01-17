import dotenv from 'dotenv';
import { createLimitOrder, cancelLimitOrder } from './limitOrder.js'; // Ensure correct path to the limitOrder file
import fetch from 'node-fetch';
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config();

const { RPC_URL, WALLET_PRIVATE_KEY } = process.env;

if (!RPC_URL) throw "Missing RPC_URL in .env file";
if (!WALLET_PRIVATE_KEY) throw "Missing WALLET_PRIVATE_KEY in .env file";

// Wallet setup
const RPC_CONNECTION = new Connection(RPC_URL);
const wallet = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));

// Sample tokenId and amounts for testing
const TEST_TOKEN_ID = '7zSPfAY8ntprxdpAtpKK6RYwnQTAzdGac2hFeGTGpump'; // Replace with a valid token mint address
const OUTPUT_MINT = 'So11111111111111111111111111111111111111112'; // Example output token (SOL)
const MAKING_AMOUNT = 20000 * 1e6;
const TAKING_AMOUNT = 0.000001714 * 2 * 20000 *  1e9;
const ACTIVE_ORDERS = 'https://api.jup.ag/limit/v2/openOrders';

// Menu for testing functions
async function runTest() {
    console.log('--- Limit Order Testing ---');
    console.log('1. Create Limit Order');
    console.log('2. Cancel Limit Order');
    console.log('3. Exit');

    const choice = await getInput('Enter your choice: ');

    switch (choice) {
      case '1':
         console.log('--- Creating Limit Order ---');
         const createResponse = await createLimitOrder({
             tokenId: TEST_TOKEN_ID,
             outputMint: OUTPUT_MINT,
             makingAmount: MAKING_AMOUNT,
             takingAmount: TAKING_AMOUNT,
         });
     

         break;
     

         case '2':
            console.log('--- Canceling Limit Order ---');
            try {
                const activeOrders = await getActiveOrders(); // Function to fetch active orders for the wallet
                if (activeOrders.length === 0) {
                    console.log('No active orders to cancel.');
                    break;
                }
        
                console.log(`Found ${activeOrders.length} active order(s). Canceling now...`);
        
                 activeOrders.forEach( async (order)=>{
                  await cancelLimitOrder(order.publicKey);
                 })
        
                console.log('All active orders have been successfully canceled.');
            } catch (error) {
                console.error('Error during order cancellation:', error);
            }
            break;
        

        case '3':
            console.log('Exiting...');
            process.exit(0);

        default:
            console.log('Invalid choice. Please try again.');
            break;
    }

    // Restart the menu
    await runTest();
}

// Helper function to get user input
function getInput(prompt) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;

        stdin.resume();
        stdout.write(prompt);

        stdin.once('data', (data) => {
            resolve(data.toString().trim());
        });
    });
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

        const response = await fetch(`${ACTIVE_ORDERS}?wallet=${wallet.publicKey.toBase58()}`, fetchOpts);
        const responseData = await response.json();

        if (Array.isArray(responseData) && responseData.length > 0) {
         console.log("[LimitOrder] Active Orders:", responseData);
         return responseData;
     } else {
         console.error("[LimitOrder] No active orders found.");
         return [];
     }
     
    } catch (error) {
        console.error("[LimitOrder] Error fetching active orders:", error);
        return [];
    }
}

// Start the testing script
runTest().catch((error) => {
    console.error('Error during testing:', error);
    process.exit(1);
});
