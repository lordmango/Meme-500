import priceManager from './priceManager.js';
import { swapTokens } from './swapToken.js';

const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
const SELL_PRIORITY_FEE = 2000000; // Priority fee in lamports
const SELL_MIN_BPS = 1000; // Min slippage
const SELL_MAX_BPS = 1500; // Max slippage
const QUOTE_SLIPPAGE = 1500; // Slippage when we send quote

const monitoredTokens = new Map();
const triggeredThresholds = new Map(); // Store triggered thresholds per token

const thresholds = [
   { tp: 0.8, sellPrice: 0.25 },
   { tp: 1.5, sellPrice: 0.75 },
   { tp: 2, sellPrice: 1.25 },
   { tp: 2.5, sellPrice: 1.5 },
   { tp: 3, sellPrice: 2 },
   { tp: 3.5, sellPrice: 2.5 },
   { tp: 4, sellPrice: 3 },
   { tp: 4.5, sellPrice: 3.5 },
   { tp: 5, sellPrice: 4 },
   { tp: 6, sellPrice: 5 },
   { tp: 7, sellPrice: 6 },
   { tp: 8, sellPrice: 7 },
   { tp: 9, sellPrice: 8 },
   { tp: 10, sellPrice: 9 },
];

export async function priceUpdate(tokenId, livePrice, boughtPrice, out_amount) {
   console.log(`[LimitOrder] Price update ${tokenId}: Live=${livePrice.toFixed(8)}, out_amount=${out_amount.toFixed(2)}, buy_price=${boughtPrice.toFixed(8)}`);

   // Initialize the token state if not already set
   if (!monitoredTokens.has(tokenId)) {
      monitoredTokens.set(tokenId, { sellPrice: 0 });
      triggeredThresholds.set(tokenId, new Set()); // Initialize triggered thresholds for this token
   }

   const currentToken = monitoredTokens.get(tokenId);
   const tokenTriggeredThresholds = triggeredThresholds.get(tokenId);

   console.log('Sell price:', currentToken.sellPrice);

   // Process thresholds
   for (const { tp, sellPrice } of thresholds) {
      const triggerCondition = boughtPrice * tp;

      if (livePrice >= triggerCondition && !tokenTriggeredThresholds.has(tp)) {
         tokenTriggeredThresholds.add(tp);

         currentToken.sellPrice = boughtPrice * sellPrice;

         console.log(
            `[LimitOrder] Sell price updated to ${currentToken.sellPrice.toFixed(
               8
            )} for token ${tokenId} at ${(tp * 100 - 100).toFixed(2)}% threshold`
         );

         break; // Only trigger one condition per price update
      }
   }

   // Sell if the live price hits the sell price
   // if (livePrice >= boughtPrice * 1.25) {
   // if (livePrice <= currentToken.sellPrice && livePrice > 0) {
   if (livePrice <= currentToken.sellPrice && livePrice > 0) {
      const percentageChange = ((livePrice - boughtPrice) / boughtPrice) * 100;
      console.log(`[LimitOrder] Selling token ${tokenId} at ${percentageChange.toFixed(2)}% change`);
      await swapTokens(tokenId, INPUT_MINT, Math.floor(out_amount), SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
      await swapTokens(tokenId, INPUT_MINT, Math.floor(out_amount), SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
      priceManager.removeToken(tokenId); // Stop tracking the token
      monitoredTokens.delete(tokenId); // Clean up local state
      triggeredThresholds.delete(tokenId); // Clean up thresholds
      return;
   }
}
