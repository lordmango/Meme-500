import express from 'express';
import priceManager from './priceManager.js';
import { executePython } from './util/marwan.js';
// import { startLimitOrderListener } from './limitOrder.js'; // Import LimitOrder logic
import { readFromJson, writeToJson } from './util/data.js';
import { swapTokens } from './swapToken.js';

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const PRIORITY_FEE = 8000000; // Priority fee in lamports
const MIN_BPS = 1000;      // Min slippage
const MAX_BPS = 1500;      // Max slippage
const QUOTE_SLIPPAGE = 1500;    // Slippage when we send quote
const SOL_AMOUNT = 250;         // 1000 = 1 Sol

const CUPSEY = 'suqh5sHtr8HyJ7q8scBimULPkPpA557prMG47xCHQfK'
const app = express();
const totalFees = .016 // photon

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route to handle transactions
app.post('/transaction', async (req, res) => {
    // const token = req.body.token;

    // const defiTxn = {
    //     sol_change: 1,
    //     out_token_address: token,
    //     out_amount: 525000,
    //     timestamp: 1673445
    //   }

    const txn = req.body[0];

    const walletAddress = txn.transaction.message.accountKeys[0];

    // Process the transaction
    const defiTxn = processTransaction(txn, walletAddress);

    const solPrice = await getPriceData();
    const boughtPrice = ((defiTxn.sol_change-totalFees) / defiTxn.out_amount) * solPrice;
   
    if (defiTxn && defiTxn.wallet_address === CUPSEY) {
        if (defiTxn.out_token_address && defiTxn.out_amount > 0) {
            const existingData = readFromJson(defiTxn.out_token_address);
            // if (existingData && defiTxn.timestamp < existingData.timestamp + 24 * 3600) return;
            if (existingData) {
                if (existingData.triggered) return;

                let newData = {};
                if (existingData.sells > 0) {
                    const buy = checkParameters(
                        defiTxn.out_token_address,
                        defiTxn.timestamp,
                        boughtPrice * 1_000_000_000
                    );

                    // if (buy) {
                    //     const newBoughtPrice = await swapTokens(
                    //         SOL_MINT_ADDRESS, 
                    //         defiTxn.out_token_address, 
                    //         SOL_AMOUNT, 
                    //         PRIORITY_FEE,
                    //         MIN_BPS,
                    //         MAX_BPS,
                    //         QUOTE_SLIPPAGE,
                    //         solPrice
                    //     )

                    //     priceManager.updateBoughtPrice(defiTxn.out_token_address, newBoughtPrice)
                    // }
                    newData = {
                        tokenId: defiTxn.out_token_address,
                        buys: existingData.buys + 1, 
                        buyAmount: existingData.buyAmount + defiTxn.out_amount,
                        triggered: true,
                        probability: buy,
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
                })
            }
        } else if (defiTxn.in_token_address && defiTxn.in_amount > 0) {
            const existingData = readFromJson(defiTxn.in_token_address);
            // if (existingData && defiTxn.timestamp < existingData.timestamp + 24 * 3600) return;
            if (existingData) {
                if (existingData.triggered) return;
                // priceManager.addToken(defiTxn.out_token_address, 0, defiTxn.out_amount);

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

// Helper functions (Unchanged from your current code)

async function checkParameters(tokenId, timestamp, mcap) {
    const pairResponse = await fetch(`https://api-v3.raydium.io/pools/info/mint?mint1=${tokenId}&poolType=all&poolSortField=default&sortType=desc&pageSize=1&page=1`)
    const pairData = await pairResponse.json();

    const pairId = pairData.data.data[0].id;

    const ohlcvReponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairId}/ohlcv/minute?aggregate=1&limit=3&before_timestamp=${timestamp}`)
    const ohlcvData = await ohlcvReponse.json();

    const candles = ohlcvData.data.attributes.ohlcv_list.map(d => ({
        volume: d[5],
        green: d[1] < d[4] ? 1 : 0
    }));

    const probability = executePython([
        mcap, // Market Cap (size of the company or asset)
        0,      // All Sold? (1 = Yes, 0 = No)
        candles[0].green,      // Buy Candle (1 = Green candle, 0 = Red candle)
        candles[1] ? candles[1].green : candles[0].green,      // P1 Candle (1 = Green candle, 0 = Red candle)
        candles[2] ? candles[2].green : candles[1] ? candles[1].green : candles[0].green,      // P2 Candle (1 = Green candle, 0 = Red candle)
        candles[0].volume,  // Buy Volume (how much was bought)
        candles[1] ? candles[1].volume : candles[0].volume,  // P1 Volume (volume of previous period 1)
        candles[2] ? candles[2].volume : candles[1] ? candles[1].volume : candles[0].volume,    // P2 Volume (volume of previous period 2)
    ])

    return probability

    // if (probability >= 0.7) {
    //     return true
    // } else {
    //     return false
    // }
}

export function processTransaction(tx, walletAddress) {
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
                timestamp: new Date(tx.blockTime).getTime() / 1000,
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
  