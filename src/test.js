import { executePython } from './util/marwan.js';

async function fetchAndPrintData(tokenId, timeStamp, roundedMcap) {
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
       const ohlcvResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute?aggregate=1&limit=3&before_timestamp=${timeStamp}`);

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

       const probability = await executePython(
         "zaza3.py",
         [
           roundedMcap,
           1,
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

// Test function
(async () => {
    const tokenId = "Sa7mxdXXRk7SgaPyvK5nCpYtSFgdvQNucDA4w8bpump";
    const timeStamp = 1739507568;
    const roundedMcap = 538148;
    const result = await fetchAndPrintData(tokenId, timeStamp, roundedMcap);
    console.log("Final Result:", result);
})();
