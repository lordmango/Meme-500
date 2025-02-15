
import priceManager from './priceManager.js';
import { writeToJson } from './util/data.js';
import { swapTokens } from './swapToken.js';
import { checkParameters } from './server.js'

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const PRIORITY_FEE = 8000000; // Priority fee in lamports
const MIN_BPS = 1000;      // Min slippage
const MAX_BPS = 1500;      // Max slippage
const QUOTE_SLIPPAGE = 1500;    // Slippage when we send quote
const SOL_AMOUNT = 400;         // 1000 = 1 Sol

const TAKE_PROFIT_100 = 1.8;
const TAKE_PROFIT_60 = 1.5;
let livePrice = 0;


export async function getCandleCloseData(remainingTime, boughtPrice, buyExecuted, roundedTimestamp, defiTxn, existingData) {
   console.log("Outside: " + Date.now())
   
   setTimeout(async () => {
      console.log("Inside: " + Date.now())
      let takeProfit = await checkParameters(
         defiTxn.out_token_address,
         roundedTimestamp + remainingTime,
         boughtPrice * 1_000_000_000,
         existingData.buyAmount - existingData.sellAmount,
         "zaza4.py"
      );
      
      if (takeProfit !== 0) {

         const percentageChange = ((livePrice - boughtPrice) / boughtPrice) * 100;

         if (buyExecuted == false && takeProfit == TAKE_PROFIT_100 && percentageChange < 70) {
            try {
               // await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
               // await priceManager.addToken(defiTxn.out_token_address, boughtPrice, defiTxn.out_amount, takeProfit);
            } catch (error) {
               console.error(`[Get Buy Candle End] Buy failed for token ${tokenId}`);
            }
         } else if (buyExecuted == false && takeProfit == TAKE_PROFIT_60 && percentageChange < 25) {
            try {
               // await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
               // await priceManager.addToken(defiTxn.out_token_address, boughtPrice, defiTxn.out_amount, takeProfit);
            } catch (error) {
               console.error(`[Get Buy Candle End] Buy failed for token ${tokenId}`);
            }
         }

      }
      if (buyExecuted) { priceManager.updateTakeProfit(defiTxn.out_token_address, takeProfit) }

      newData = {
         tokenId: defiTxn.out_token_address,
         zaza4TakeProfit: takeProfit,
      }

      writeToJson(newData, false);
      

   }, remainingTime * 1000);

}

export function updateLivePriceSecondCandle(livePriceFromPriceManager) {
   livePrice = livePriceFromPriceManager;
}