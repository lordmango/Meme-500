import priceManager from '../priceManager.js';
import { swapToken } from './sellToken.js';

const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
const AMOUNT = 25000000; // Amount in lamports (e.g., 0.05 SOL)
const SELL_PRIORITY_FEE = 5000000; // Priority fee in lamports: 0.01 SOL
const SELL_MIN_BPS = 1000; // Min slippage
const SELL_MAX_BPS = 1000; // Min slippage
const QUOTE_SLIPPAGE = 1000; // Slippage when we send quote

export function startLimitOrderListener() {
   const monitoredTokens = new Map();

   priceManager.on('priceUpdate', async ({ tokenId, livePrice, boughtPrice }) => {
      console.log(`[LimitOrder] Price update for token ${tokenId}: Live=${livePrice}, Bought=${boughtPrice}`);

      // Initialize the token state if not already set
      if (!monitoredTokens.has(tokenId)) {
         monitoredTokens.set(tokenId, { sellPrice: 0 });
      }

      const currentToken = monitoredTokens.get(tokenId);

      // Condition: Price reaches 2x (100% increase)
      if (livePrice >= boughtPrice * 2) {
         console.log(`[LimitOrder] Selling token ${tokenId} at ${livePrice} (2x bought price)`);
         swapToken(INPUT_MINT, tokenId, AMOUNT, SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE); // sell
         priceManager.removeToken(tokenId); // Stop tracking the token
         monitoredTokens.delete(tokenId); // Clean up local state
         return;
      }

      // limit conditions
      if (livePrice >= boughtPrice * 1.4) {
         currentToken.sellPrice = boughtPrice;
         console.log(`[LimitOrder] Set sell price for token ${tokenId} at ${boughtPrice}`);
      } else if (livePrice >= boughtPrice * 1.9) {
         currentToken.sellPrice = boughtPrice * 1.5;
         console.log(`[LimitOrder] Updated sell price for token ${tokenId} to ${currentToken.sellPrice}`);
      }

      // Sell if the live price hits the sell price
      if (livePrice <= currentToken.sellPrice) {
         console.log(`[LimitOrder] Selling token ${tokenId} at ${livePrice} (sell price reached)`);
         swapToken(INPUT_MINT, tokenId, AMOUNT, SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
         priceManager.removeToken(tokenId); // Stop tracking the token
         monitoredTokens.delete(tokenId); // Clean up local state
         return;
      }
   });

   console.log('[LimitOrder] Listening for price updates...');
   priceManager.startFetchingPrices();
}
