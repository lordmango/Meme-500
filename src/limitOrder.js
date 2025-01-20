import priceManager from './priceManager.js';
import { swapTokens } from './sellToken.js';

const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
const SELL_PRIORITY_FEE = 2000000; // Priority fee in lamports
const SELL_MIN_BPS = 1000; // Min slippage
const SELL_MAX_BPS = 1000; // Min slippage
const QUOTE_SLIPPAGE = 1000; // Slippage when we send quote

const monitoredTokens = new Map();

export async function priceUpdate(tokenId, livePrice, boughtPrice, out_amount) {
   
  console.log(`[LimitOrder] Price update ${tokenId}: Live=${livePrice.toFixed(8)}, out_amount=${out_amount.toFixed(2)}, buy_price=${boughtPrice.toFixed(8)}`);

  // Initialize the token state if not already set
  if (!monitoredTokens.has(tokenId)) {
     monitoredTokens.set(tokenId, { sellPrice: 0 });
  }

  const currentToken = monitoredTokens.get(tokenId);

  // Condition: Price reaches 2x (100% increase)
  if (livePrice >= boughtPrice * 1.4) {
     console.log(`[LimitOrder] Selling token ${tokenId} at ${livePrice.toFixed(8)} (100%)`);
     swapTokens(INPUT_MINT, tokenId, out_amount, SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE); // sell
     priceManager.removeToken(tokenId); // Stop tracking the token
     monitoredTokens.delete(tokenId); // Clean up local state
     return;
  }

  // limit conditions
  if (livePrice >= boughtPrice * 1.1) {
     currentToken.sellPrice = boughtPrice;
     console.log(`[LimitOrder] Set sell price ${boughtPrice.toFixed(8)} for token ${tokenId} (40%)`);
  } else if (livePrice >= boughtPrice * 1.2) {
     currentToken.sellPrice = boughtPrice * 1.1;
     console.log(`[LimitOrder] Updated sell price ${(boughtPrice * 1.5).toFixed(8)} for token ${tokenId} (90%)`);
  }

  // Sell if the live price hits the sell price
  if (livePrice <= currentToken.sellPrice) {
     const percentageChange = ((livePrice - boughtPrice) / boughtPrice) * 100;
     console.log(`[LimitOrder] Selling token ${tokenId} at ${percentageChange.toFixed(2)}% change`);
     swapTokens(INPUT_MINT, tokenId, AMOUNT, SELL_PRIORITY_FEE, SELL_MIN_BPS, SELL_MAX_BPS, QUOTE_SLIPPAGE);
     priceManager.removeToken(tokenId); // Stop tracking the token
     monitoredTokens.delete(tokenId); // Clean up local state
     return;
  }
}