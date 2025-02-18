import priceManager from './priceManager.js';
import { writeToJson } from './util/data.js';
import { swapTokens } from './swapToken.js';
import { executePython } from './util/marwan.js';

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const PRIORITY_FEE = 8000000; // Priority fee in lamports
const MIN_BPS = 1000;      // Min slippage
const MAX_BPS = 1500;      // Max slippage
const QUOTE_SLIPPAGE = 1500;    // Slippage when we send quote
const SOL_AMOUNT = 200;         // 1000 = 1 Sol

const TAKE_PROFIT_100 = 1.8;
const TAKE_PROFIT_60 = 1.5;

let newData = {};
let percentageChange = 0;
let precentLimit = 0;

export async function getCandleData(boughtPrice, defiTxn, existingData) {
   const roundedTimestamp = Math.round(defiTxn.timestamp);
   let buyExecuted = false;

   let initialTakeProfit = await checkParameters(
      defiTxn.out_token_address,
      roundedTimestamp,
      boughtPrice * 1_000_000_000,
      existingData.buyAmount - existingData.sellAmount,
      "zaza3.py"
   );
   
   if (initialTakeProfit != 0) {
      
      if (initialTakeProfit == TAKE_PROFIT_100) {
         precentLimit = 50;
      } else {
         precentLimit = 25;
      }
      
      try {
         console.log("First buy start: " + Date.now())
         let txid = await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
         if (txid == null && percentageChange < precentLimit) {
            console.log("First buy retry: " + Date.now())
            txid = await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
         }
         if (txid) { 
            console.log("First buy end: " + Date.now())
            buyExecuted = true;
            await priceManager.addToken(defiTxn.out_token_address, boughtPrice, defiTxn.out_amount, initialTakeProfit);
            console.log("First buy add token finish: " + Date.now())
         }
      } catch (error) {
         console.error(`[Server] Buy failed for token ${tokenId}`);
      }
   
   }

   const remainingTime = 59 - (roundedTimestamp % 60);
   
   setTimeout(async () => {
      console.log("Inside: " + Date.now())
      
      let updatedTakeProfit = await checkParameters(
         defiTxn.out_token_address,
         roundedTimestamp + remainingTime,
         boughtPrice * 1_000_000_000,
         existingData.buyAmount - existingData.sellAmount,
         "zaza4.py"
      );
      
      if (updatedTakeProfit !== 0 && buyExecuted == false) {
      
         if (updatedTakeProfit == TAKE_PROFIT_100) {
            precentLimit = 50;
         } else {
            precentLimit = 25;
         }

         if (percentageChange < precentLimit) {
            
            try {
               console.log("Second buy start: " + Date.now())
               let txid = await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
               if (txid == null && percentageChange < precentLimit) {
                  console.log("Second buy retry: " + Date.now())
                  txid = await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE);
               }
               if (txid) { 
                  console.log("Second buy end: " + Date.now())
                  await priceManager.addToken(defiTxn.out_token_address, boughtPrice, defiTxn.out_amount, updatedTakeProfit);
                  console.log("Second buy add token finish: " + Date.now())
               }
            } catch (error) {
               console.error(`[Get Buy Candle End] Buy failed for token ${tokenId}`);
            }
         
         }

      }
      
      if (buyExecuted && updatedTakeProfit !== 0) { priceManager.updateTakeProfit(defiTxn.out_token_address, updatedTakeProfit) }

      newData = {
         tokenId: defiTxn.out_token_address,
         zaza3TakeProfit: initialTakeProfit,
         zaza4TakeProfit: updatedTakeProfit,
      }

      writeToJson(newData, false);
      

   }, remainingTime * 1000);
}

export async function checkParameters(tokenId, timestamp, mcap, holdingBalance, fileName) {

   const roundedMcap = Math.round(mcap);

   console.log("tokenId:", tokenId);
   console.log("timestamp:", timestamp);
   console.log("mcap:", roundedMcap);

   if (mcap < 100000) {
      console.log("Marketcap < 100K");
      return 0;
   }

   try {
      // Fetch pair address from dexscreener
      const pairResponse = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenId}`);
      const pairData = await pairResponse.json();

      if (!pairData || !Array.isArray(pairData) || pairData.length === 0 || !pairData[0].pairAddress) {
         console.error("Invalid pair data response.");
         return 0;
      }

      const pairAddress = pairData[0].pairAddress;
      console.log("Pair Address:", pairAddress);

      // Fetch OHLCV data
      const ohlcvResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute?aggregate=1&limit=3&before_timestamp=${timestamp}`);

      if (!ohlcvResponse.ok) {
         console.error("Error fetching OHLCV data. Response status:", ohlcvResponse.status);
         return 0;
      }

      const ohlcvData = await ohlcvResponse.json();

      if (ohlcvData.errors) {
         console.error("GeckoTerminal API Response:", JSON.stringify(ohlcvData, null, 2));
         return 0;
      }

      console.log("GeckoTerminal API Response:", JSON.stringify(ohlcvData, null, 2));

      if (!ohlcvData.data || !ohlcvData.data.attributes || !ohlcvData.data.attributes.ohlcv_list) {
         console.error("Invalid OHLCV API response structure.");
         return 0;
      }

      const ohlcvList = ohlcvData.data.attributes.ohlcv_list;
      if (ohlcvList.length === 0) {
         console.error("Empty OHLCV list received from API.");
         return 0;
      }

      const candles = ohlcvList.map(d => ({
         volume: d[5],
         green: d[1] < d[4] ? 1 : 0
      }));

      while (candles.length < 3) {
         candles.push({
            volume: candles[1]?.volume || 0,
            green: candles[1]?.green || 0
         });
      }

      console.log("Processed Candles:", candles);

      const probability = await executePython(
         fileName,
         [
            roundedMcap,
            holdingBalance >= 0 && holdingBalance < 1000 ? 1 : 0,
            candles[0].green,
            candles[1].green,
            candles[2].green,
            candles[0].volume,
            candles[1].volume,
            candles[2].volume,
         ]
      );

      console.log("Received Probability:", probability);

      const { prob06, prob1 } = probability;
      if (prob1 > 0.7) {
         return TAKE_PROFIT_100;
      } else if (prob06 > 0.7) {
         return TAKE_PROFIT_60;
      } else {
         return 0;
      }
   } catch (error) {
      console.error("Error in checkParameters:", error);
      return 0;
   }
}

export function updateLivePrice(livePriceFromPriceManager) {
   percentageChange = ((livePriceFromPriceManager - boughtPrice) / boughtPrice) * 100;
}

export function setPairID(pairIDFromPriceManager) {
   pairID = pairIDFromPriceManager;
}