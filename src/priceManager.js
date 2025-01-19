import fetch from 'node-fetch';
import EventEmitter from 'events';

const API_URL = 'https://api.jup.ag/price/v2';
const SOL_MINT_ADDRESS = 'So11111111111111111111111111111111111111112';

class PriceManager extends EventEmitter {
    constructor() {
        super();
        this.tokens = new Map(); // Map to store token data: { tokenId: { livePrice, boughtPrice } }
        this.monitoredTokens = new Set(); // Set to track monitored tokens
    }

    // Add a token to the monitored list with its bought price
    addToken(tokenId, boughtPrice, out_amount) {
        if (!this.monitoredTokens.has(tokenId)) {
            this.monitoredTokens.add(tokenId);
            this.tokens.set(tokenId, { livePrice: null, boughtPrice, out_amount }); // Store bought price
            console.log(`[PriceManager] Monitoring token: ${tokenId} with buy price: ${boughtPrice.toFixed(8)}`);
        }
    }

    // Remove a token from the monitored list
    removeToken(tokenId) {
      if (this.monitoredTokens.has(tokenId)) {
          this.monitoredTokens.delete(tokenId);
          this.tokens.delete(tokenId);
          console.log(`[PriceManager] Stopped monitoring token: ${tokenId}`);
      } else {
          console.log(`[PriceManager] Token ${tokenId} is not being monitored.`);
      }
  }

    // Fetch prices for all monitored tokens and convert to SOL
    async fetchPrices() {
        if (this.monitoredTokens.size === 0) {
            return;
        }

        try {
            const tokenIds = Array.from(this.monitoredTokens).join(',');
            const response = await fetch(`${API_URL}?ids=${tokenIds},${SOL_MINT_ADDRESS}`);
            const data = await response.json();

            const solPriceInUSD = data.data[SOL_MINT_ADDRESS]?.price;

            if (!solPriceInUSD) {
                console.error('[PriceManager] Could not fetch SOL price.');
                return;
            }

            this.monitoredTokens.forEach((tokenId) => {
                if (data.data && data.data[tokenId]) {
                    const newPriceInUSD = data.data[tokenId].price;
                    const newPriceInSOL = newPriceInUSD / solPriceInUSD; // Convert to SOL

                    const tokenData = this.tokens.get(tokenId);
                    const oldPrice = tokenData?.livePrice || null;

                    // Update the live price
                    this.tokens.set(tokenId, { ...tokenData, livePrice: newPriceInSOL });

                    // Emit event if the price changes
                    if (newPriceInSOL !== oldPrice) {
                        this.emit('priceUpdate', { tokenId, livePrice: newPriceInSOL, boughtPrice: tokenData?.boughtPrice, out_amount: tokenData?.out_amount });
                    }
                }
            });
        } catch (error) {
            console.error('[PriceManager] Error fetching prices:', error);
        }
    }

    // Get all token data (live and bought prices)
    getAllTokenData() {
        return Array.from(this.tokens.entries()).map(([tokenId, data]) => ({
            tokenId,
            livePrice: data.livePrice,
            boughtPrice: data.boughtPrice,
        }));
    }

    // Start periodic price fetching with handling for variable await durations
    startFetchingPrices(interval = 1000) {
        const fetchLoop = async () => {
            while (true) {
                const startTime = Date.now(); // Record the start time
                await this.fetchPrices(); // Await the API call
                const elapsedTime = Date.now() - startTime; // Calculate elapsed time

                // Calculate the remaining time to wait
                const waitTime = Math.max(interval - elapsedTime, 0);
                if (waitTime > 0) {
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                }
            }
        };

        fetchLoop().catch((error) => {
            console.error('[PriceManager] Error in price fetching loop:', error);
        });
    }
}

// Export a singleton instance of PriceManager
const priceManager = new PriceManager();
export default priceManager;
