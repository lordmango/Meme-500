async function fetchAndPrintData(tokenId) {
   try {
       // Fetch Raydium API data
       const pairResponse = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${tokenId}`);
       const pairData = await pairResponse.json();
       const pairAddress = pairData[0].pairAddress;
       console.log("Pair Address:", pairAddress);

       // Fetch GeckoTerminal API data
       const ohlcvResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pairAddress}/ohlcv/minute?aggregate=1&limit=3`);
       const ohlcvData = await ohlcvResponse.json();
       console.log("GeckoTerminal API Response:", JSON.stringify(ohlcvData, null, 2));
   } catch (error) {
       console.error("Error fetching data:", error);
   }
}

// Test function
(async () => {
    const tokenId = "6p3dUBCQDWGoxnup7xM5iTtNSCzsCQ7WKW7quvcgpump"; // 55SN27Mt4BHSyLoSopgarFR3tzmDacjbPTUffk1BKjwc
    await fetchAndPrintData(tokenId);
})();