import express from 'express';
import priceManager from './priceManager.js';
import { removeMonitoredTokens } from './limitOrder.js';
import { executePython } from './util/marwan.js';
import fs from 'fs'
import { readFromJson, writeToJson, removeFromJson } from './util/data.js';
import { swapTokens } from './swapToken.js';

const VALID_PROGRAM_IDS = {
   "Raydium": "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
   "Raydium CPMM": "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
   "Raydium CAMM": "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
   "Pump.fun": "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
   "Jupiter": "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
   "Orca": "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc",
   "Meteora": "Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB",
   "Meteora DLMM": "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
   "OKX V2": "6m2CDdhRgxpH4WjvdzxAYbGxwdGUz5MziiL5jek2kBma"
}

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const PRIORITY_FEE = 8000000; // Priority fee in lamports
const MIN_BPS = 1000;      // Min slippage
const MAX_BPS = 1500;      // Max slippage
const QUOTE_SLIPPAGE = 1500;    // Slippage when we send quote
const SOL_AMOUNT = 250;         // 1000 = 1 Sol

const CUPSEY = 'suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK'
const THREE_HOURS = 3 * 60 * 60 * 1000; // 3 hours in milliseconds
const filePath = 'data/cache.json';
const totalFees = .016 // photon
let pairID = '';

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Periodically check and remove expired tokens
// setInterval(() => {
//    let allTokens = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf-8')) : [];

//    if (!Array.isArray(allTokens)) return; // Ensure it's an array

//    const currentTime = Date.now();
//    allTokens.filter(token => {
//       if (currentTime - token.timestamp >= THREE_HOURS) {
//          priceManager.removeToken(token.tokenId); // Stop tracking the token
//          removeMonitoredTokens(token.tokenId); // Clean up local state
//          removeFromJson(token.tokenId); // Remove token from JSON
//          console.log(`Stopped monitoring token: ${token.tokenId}`);
//       }
//    });

// }, 60 * 1000); // Check every minute

// Basic route to handle transactions
app.post('/transaction', async (req, res) => {

   const txn = req.body[0];
   const walletAddress = txn.transaction.message.accountKeys[0];

   let matchingProgramKey = null;

   txn.transaction.message.accountKeys.some(key => {
      const programId = key
      matchingProgramKey = Object.keys(VALID_PROGRAM_IDS).find(
         programKey => VALID_PROGRAM_IDS[programKey] === programId
      );

      return !!matchingProgramKey;
   });

   if (!matchingProgramKey) return res.status(200).send("Did not Interact with Dex")

   // Process the transaction
   const defiTxn = processTransaction(txn, matchingProgramKey, walletAddress);
   if (defiTxn.dex == "Pump.fun") { return res.status(200).json(defiTxn) }

   const solPrice = await getPriceData();
   const boughtPrice = ((defiTxn.sol_change - totalFees) / defiTxn.out_amount) * solPrice * 0.975;

   if (defiTxn && walletAddress === CUPSEY) {      // buy
      
      console.log(defiTxn)
      
      if (defiTxn.out_token_address && defiTxn.out_amount > 0) {

         const existingData = readFromJson(defiTxn.out_token_address);

         if (existingData) {

            if (existingData.triggered) {return}
            let newData = {};

            if (existingData.sells > 0) {

               const takeProfit = await checkParameters(
                  defiTxn.out_token_address,
                  defiTxn.timestamp,
                  boughtPrice * 1_000_000_000,
                  existingData.buyAmount - existingData.sellAmount
               );

               if (takeProfit != 0) {
                   priceManager.addToken(defiTxn.out_token_address, boughtPrice, defiTxn.out_amount, takeProfit);             
                  //  await swapTokens(SOL_MINT_ADDRESS, defiTxn.out_token_address, SOL_AMOUNT, PRIORITY_FEE, MIN_BPS, MAX_BPS, QUOTE_SLIPPAGE)
               }

               newData = {
                  tokenId: defiTxn.out_token_address,
                  buys: existingData.buys + 1,
                  buyAmount: existingData.buyAmount + defiTxn.out_amount,
                  triggered: true,
                  takeProfit: takeProfit,
               }

            } else {
               
               newData = {
                  tokenId: defiTxn.out_token_address,
                  buys: existingData.buys + 1,
                  buyAmount: existingData.buyAmount + defiTxn.out_amount
               }
           
            }
            writeToJson(newData, false)
         
         } else {
            
            writeToJson({
               tokenId: defiTxn.out_token_address,
               buys: 1,
               sells: 0,
               buyPrice: boughtPrice,
               buyAmount: defiTxn.out_amount,
               sellAmount: 0,
               triggered: false,
               timestamp: Date.now()
            })
         
         }
      
      } else if (defiTxn.in_token_address && defiTxn.in_amount > 0) {      // sell
         
         const existingData = readFromJson(defiTxn.in_token_address);

         if (existingData) {
            
            if (existingData.triggered) {return}
            
            writeToJson({
               tokenId: defiTxn.in_token_address,
               sellAmount: existingData.sellAmount + defiTxn.in_amount,
               sells: existingData.sells + 1,
            }, false)
         
         } else {
            return;
         }
     
      }

      return res.status(200).json(defiTxn);
   }

   res.status(200).send('No significant changes detected.');
});

// Start the server
const PORT = process.env.PORT || 3030;
app.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});

// Helper functions

// checkParameters("Vy8Tau21KkrEhuk9978YY2AGKqnv1BaCh9yKpbAGGFM", 1739398394, 387000)

async function checkParameters(tokenId, timestamp, mcap, holdingBalance) {
   
   const roundedTimestamp = Math.round(timestamp);
   const roundedMcap = Math.round(mcap);
   
   console.log("tokenId:", tokenId);
   console.log("timestamp:", roundedTimestamp);
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
      const ohlcvResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute?aggregate=1&limit=3&before_timestamp=${roundedTimestamp}`);

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
            volume: candles[0]?.volume || 0,
            green: candles[0]?.green || 0
         });
      }

      console.log("Processed Candles:", candles);

      const probability = await executePython([
         roundedMcap,
         holdingBalance < 1000 ? 1 : 0,
         candles[0].green,
         candles[1].green,
         candles[2].green,
         candles[0].volume,
         candles[1].volume,
         candles[2].volume,
      ]);

      console.log("Received Probability:", probability);

      const { prob06, prob1 } = probability;
      if (prob1 > 0.7) {
         return 2;
      } else if (prob06 > 0.7) {
         return 1.6;
      } else {
         return 0;
      }
   } catch (error) {
      console.error("Error in checkParameters:", error);
      return 0;
   }
}

export function setPairID(pairIDFromPriceManager) {
   pairID = pairIDFromPriceManager;
}

export function processTransaction(tx, programName, walletAddress) {
   if (
      tx &&
      tx.meta &&
      tx.meta.err === null
   ) {
      const getFilteredBalances = (balances, key, value) =>
         (balances || []).filter(balance => {
            if (key === "owner" && balance.mint === SOL_MINT_ADDRESS) {
               return false;
            }
            return balance[key] === value;
         });

      const preBalances = getFilteredBalances(tx.meta?.preTokenBalances, 'owner', walletAddress)
      const postBalances = getFilteredBalances(tx.meta?.postTokenBalances, 'owner', walletAddress)
      let solChange = ((tx.meta?.postBalances[0] - tx.meta?.preBalances[0]) / 1e9);

      const changes = calculateBalanceChanges(preBalances, postBalances)

      if (changes.length > 0) {
         const direction = changes.length === 2 ? "Swap" : changes.length === 1 && changes[0].splAmount > 0 ? "Buy" : "Sell";
         if (direction === "Swap") {
            const preBalances = getFilteredBalances(tx.meta?.preTokenBalances, 'mint', SOL_MINT_ADDRESS)
            const postBalances = getFilteredBalances(tx.meta?.postTokenBalances, 'mint', SOL_MINT_ADDRESS)
            const solChanges = calculateBalanceChanges(preBalances, postBalances)
            const totalAbsSum = solChanges.reduce((sum, current) => {
               return sum + Math.abs(current.splAmount);
            }, 0);
            if (solChanges.length > 1) {
               solChange = totalAbsSum / 2;
            } else solChange = totalAbsSum
         }
         const finalChanges = analyzeAccountChanges(changes, direction)

         return {
            signature: tx.transaction.signatures[0],
            in_token_address: finalChanges.from,
            in_amount: Math.abs(finalChanges.fromAmount),
            spl_direction: direction,
            sol_change: Math.abs(parseFloat(solChange)),
            out_token_address: finalChanges.to,
            out_amount: Math.abs(finalChanges.toAmount),
            wallet_address: walletAddress,
            timestamp: new Date(tx.blockTime).getTime(),
            dex: programName
         };
      } else return {}
   }

   return null;
}

function analyzeAccountChanges(changes, direction) {
   if (direction === "Swap") {

      const fromToken = changes.filter(change => parseFloat(change.splAmount) < 0)[0];
      const toToken = changes.filter(change => parseFloat(change.splAmount) > 0)[0];

      return {
         from: fromToken.splTokenAddress,
         fromAmount: parseFloat(fromToken.splAmount),
         to: toToken.splTokenAddress,
         toAmount: parseFloat(toToken.splAmount),
      };
   } else if (direction === "Buy") {
      return {
         from: "",
         fromAmount: 0,
         to: changes[0].splTokenAddress,
         toAmount: parseFloat(changes[0].splAmount),
      };
   } else if (direction === "Sell") {
      return {
         from: changes[0].splTokenAddress,
         fromAmount: parseFloat(changes[0].splAmount),
         to: "",
         toAmount: 0,
      };
   } else {
      return null;
   }
}


function calculateBalanceChanges(preBalances, postBalances) {
   const [longerBalances, shorterBalances] = preBalances.length >= postBalances.length
      ? [preBalances, postBalances]
      : [postBalances, preBalances];

   const changes = longerBalances.reduce((acc, balance) => {
      const matchingBalance = shorterBalances.find(
         (b) => b.accountIndex === balance.accountIndex
      );

      const splAmount = longerBalances === postBalances ? (
         (balance?.uiTokenAmount.uiAmount || 0) -
         (matchingBalance?.uiTokenAmount.uiAmount || 0)
      ) : (
         (matchingBalance?.uiTokenAmount.uiAmount || 0) -
         (balance?.uiTokenAmount.uiAmount || 0)
      );

      if (Math.abs(splAmount) > 0) {
         acc.push({
            splTokenAddress: balance.mint,
            splAmount: splAmount,
         });
      }

      return acc;
   }, []);

   return changes;
}

async function getPriceData() {
   try {
      const res = await fetch("https://hermes.pyth.network/v2/updates/price/latest?ids%5B%5D=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43&ids%5B%5D=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace&ids%5B%5D=0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d", {
         method: "GET",
         headers: {
            "Content-Type": "application/json"
         },
         next: {
            revalidate: 5
         }
      })

      const data = await res.json();
      const solPrice = data.parsed[2].price.price / 10 ** 8;

      return solPrice;
   } catch (error) {
      console.error(error)
      return 0;
   }
}
