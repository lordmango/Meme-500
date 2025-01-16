import express from 'express';
import priceManager from './priceManager.js';

const app = express();
 
// Basic route to handle transactions
app.post('/transaction', (req, res) => {
    const txn = req.body[0];

    const walletAddress = txn.transaction.message.accountKeys[0];
    console.log(`[Server] Wallet Address: ${walletAddress}`);

    let matchingProgramKey = null;

    txn.transaction.message.accountKeys.some(key => {
        const programId = key;
        matchingProgramKey = Object.keys(VALID_PROGRAM_IDS).find(
            programKey => VALID_PROGRAM_IDS[programKey] === programId
        );

        return !!matchingProgramKey;
    });

    if (!matchingProgramKey) {
        console.error('[Server] Did not interact with Dex');
        return res.status(400).send('Invalid transaction.');
    }

    // Process the transaction
    const defiTxn = processTransaction(txn, matchingProgramKey, walletAddress);

    if (defiTxn) {
        console.log('[Server] Processed Transaction:', defiTxn);

        // Add the token to PriceManager with the bought price
        if (defiTxn.out_token_address && defiTxn.out_amount > 0) {
            const boughtPrice = defiTxn.sol_change / defiTxn.out_amount;
            priceManager.addToken(defiTxn.out_token_address, boughtPrice);
        }

        // Send a success response
        return res.status(200).json(defiTxn);
    }

    res.status(200).send('No significant changes detected.');
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
   console.log(`Server is running on port ${PORT}`);
});


// helper functions

function processTransaction(tx, programName, walletAddress) {
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