import express from 'express';
import priceManager from './priceManager.js';
import { startSellTokenListener } from './sellToken.js'; // Import SellToken logic
import { startLimitOrderListener } from './limitOrder.js'; // Import LimitOrder logic
import { readFromJson, writeToJson } from './util/data.js';

const SOL_MINT_ADDRESS = "So11111111111111111111111111111111111111112";
const app = express();
const totalFees = .00404

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route to handle transactions
app.post('/transaction', (req, res) => {
    const txn = req.body[0];

    const walletAddress = txn.transaction.message.accountKeys[0];

    // Process the transaction
    const defiTxn = processTransaction(txn, walletAddress);
   
    if (defiTxn) {

        const existingData = readFromJson(defiTxn.out_token_address);
        if (existingData && defiTxn.timestamp < existingData.timestamp + 24 * 3600) return;

        // Add the token to PriceManager with the bought price
        if (defiTxn.out_token_address && defiTxn.out_amount > 0) {
            const boughtPrice = (defiTxn.sol_change-totalFees) / defiTxn.out_amount;
            priceManager.addToken(defiTxn.out_token_address, boughtPrice);
        }

        writeToJson({
            tokenId: defiTxn.out_token_address,
            boughtPrice,
            timestamp: defiTxn.timestamp,
        })

        return res.status(200).json(defiTxn);
    }

    res.status(200).send('No significant changes detected.');
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);

    // Start the SellToken Listener
    startSellTokenListener();

    // Start the LimitOrder Listener
    startLimitOrderListener();
});

// Helper functions (Unchanged from your current code)

function processTransaction(tx, walletAddress) {
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
                sol_change: Math.abs(parseFloat(solChange)),
                out_token_address: finalChanges.to,
                out_amount: Math.abs(finalChanges.toAmount),
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
