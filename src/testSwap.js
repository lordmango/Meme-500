import { swapTokens } from './swapToken.js';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
    try {
        const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
        const OUTPUT_MINT = "6jTQCFZR8JwvvenVGa3RzGM3a5YEagk9kQXDpHHdpump"; // Example: USDC
        const AMOUNT = 26675;
        const SELL_PRIORITY_FEE = 2000000; // Priority fee in lamports
        const SELL_MIN_BPS = 1000; // Min slippage in basis points (1%)
        const SELL_MAX_BPS = 1500; // Max slippage in basis points (1.5%)
        const QUOTE_SLIPPAGE = 1500; // Slippage when sending the quote (1.5%)

        console.log("Starting swap...");
        await swapTokens(
            OUTPUT_MINT,
            INPUT_MINT,
            AMOUNT,
            SELL_PRIORITY_FEE,
            SELL_MIN_BPS,
            SELL_MAX_BPS,
            QUOTE_SLIPPAGE
        );
        console.log("Swap completed successfully!");
    } catch (error) {
        console.error("Swap failed:", error.message);
    }
})();
