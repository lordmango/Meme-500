import priceManager from './priceManager.js';
import { swapTokens } from './sellToken.js';

const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
const SELL_PRIORITY_FEE = 2000000; // Priority fee in lamports
const SELL_MIN_BPS = 1000; // Min slippage
const SELL_MAX_BPS = 1500; // Min slippage
const QUOTE_SLIPPAGE = 1500; // Slippage when we send quote

const monitoredTokens = new Map();
const triggeredThresholds = new Map(); // Store triggered thresholds per token

const thresholds = [
   { tp: 1.45, sellPrice: 1.0 },        // 50% = 1.5 * boughtPrice, sellPrice = 1.0 * boughtPrice
   { tp: 1.75, sellPrice: 1.3 },       // 75% = 1.75 * boughtPrice, sellPrice = 1.3 * boughtPrice
   { tp: 2.0, sellPrice: 1.5 },        // 100% = 2.0 * boughtPrice, sellPrice = 1.5 * boughtPrice
   { tp: 2.14, sellPrice: 1.64 },      // 114% = 2.14 * boughtPrice, sellPrice = 1.64 * boughtPrice
   { tp: 2.78, sellPrice: 2.28 },      // 178% = 2.78 * boughtPrice, sellPrice = 1.28 * boughtPrice
   { tp: 3.42, sellPrice: 2.92 },      // 242% = 3.42 * boughtPrice, sellPrice = 1.92 * boughtPrice
   { tp: 4.06, sellPrice: 3.56 },      // 306% = 4.06 * boughtPrice, sellPrice = 2.56 * boughtPrice
   { tp: 4.71, sellPrice: 4.21 },      // 371% = 4.71 * boughtPrice, sellPrice = 3.21 * boughtPrice
   { tp: 5.36, sellPrice: 4.86 },      // 436% = 5.36 * boughtPrice, sellPrice = 3.86 * boughtPrice
   { tp: 6.0, sellPrice: 5.5 },        // 500% = 6.0 * boughtPrice, sellPrice = 4.5 * boughtPrice
   { tp: 8.0, sellPrice: 6.5 },        // 700% = 8.0 * boughtPrice, sellPrice = 5.5 * boughtPrice
   { tp: 10.0, sellPrice: 8.5 },       // 900% = 10.0 * boughtPrice, sellPrice = 7.5 * boughtPrice
   { tp: 12.0, sellPrice: 10.5 },       // 1100% = 12.0 * boughtPrice, sellPrice = 9.5 * boughtPrice
   { tp: 14.0, sellPrice: 12.5 },      // 1300% = 14.0 * boughtPrice, sellPrice = 11.5 * boughtPrice
   { tp: 16.0, sellPrice: 14.5 },      // 1500% = 16.0 * boughtPrice, sellPrice = 13.5 * boughtPrice
   { tp: 18.0, sellPrice: 16.5 },      // 1700% = 18.0 * boughtPrice, sellPrice = 15.5 * boughtPrice
   { tp: 20.0, sellPrice: 18.5 }       // 1900% = 19.0 * boughtPrice, sellPrice = 17.5 * boughtPrice
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
   if (livePrice <= currentToken.sellPrice && livePrice > 0) {
      const percentageChange = ((livePrice - boughtPrice) / boughtPrice) * 100;
      console.log(`[LimitOrder] Selling token ${tokenId} at ${percentageChange.toFixed(2)}% change`);
      await swapTokens(tokenId, INPUT_MINT, Math.floor(out_amount), SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
      await swapTokens(tokenId, INPUT_MINT, Math.floor(out_amount), SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
      await swapTokens(tokenId, INPUT_MINT, Math.floor(out_amount), SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
      priceManager.removeToken(tokenId); // Stop tracking the token
      monitoredTokens.delete(tokenId); // Clean up local state
      triggeredThresholds.delete(tokenId); // Clean up thresholds
      return;
   }
}
