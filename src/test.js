
async function checkParameters(tokenId, timestamp, mcap) {
    console.log("tokenId " + tokenId);
    console.log("timestamp " + timestamp);
    console.log("mcap " + mcap);

    try {
        const pairResponse = await fetch(`https://api-v3.raydium.io/pools/info/mint?mint1=${tokenId}&poolType=all&poolSortField=default&sortType=desc&pageSize=1&page=1`);
        const pairData = await pairResponse.json();
        
        console.log(pairData.data.data);
        const pairId = pairData.data.data[0].id;

        const ohlcvResponse = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/GtfyCZKgfUxJWuEN7r3ftA67eeafTEmkJd5AUUuUfmC1/ohlcv/minute?aggregate=1&limit=3`);
        const ohlcvData = await ohlcvResponse.json();
        console.log(ohlcvData);

        const candles = ohlcvData.data.attributes.ohlcv_list.map(d => ({
            volume: d[5],
            green: d[1] < d[4] ? 1 : 0
        }));

        const probability = [
            mcap,
            0,  
            candles[0].green,
            candles[1] ? candles[1].green : candles[0].green,
            candles[2] ? candles[2].green : candles[1] ? candles[1].green : candles[0].green,
            candles[0].volume,
            candles[1] ? candles[1].volume : candles[0].volume,
            candles[2] ? candles[2].volume : candles[1] ? candles[1].volume : candles[0].volume,
        ];

        console.log("Probability Data: ", probability);
        return probability;
    } catch (error) {
        console.error("Error:", error);
    }
}

// Test function
(async () => {
    const tokenId = "CJ6tHzG72BsLMoAwquH1h6sWYE8NpGyComacQFQrpump";
    const timestamp = 0; // Current timestamp in seconds
    const mcap = 211000; // Example market cap

    const result = await checkParameters(tokenId, timestamp, mcap);
    console.log("Test Result:", result);
})();
