import fetch from 'node-fetch';
import EventEmitter from 'events';

const API_URL = 'https://api.jup.ag/price/v2';

class PriceManager extends EventEmitter {
    constructor() {
        super();
        this.tokens = new Map(); // Map to store token data: { tokenId: { livePrice, boughtPrice } }
        this.monitoredTokens = new Set(); // Set to track monitored tokens
    }

    // Add a token to the monitored list with its bought price
    addToken(tokenId, boughtPrice) {
        if (!this.monitoredTokens.has(tokenId)) {
            this.monitoredTokens.add(tokenId);
            this.tokens.set(tokenId, { livePrice: null, boughtPrice }); // Store bought price
            console.log(`[PriceManager] Now monitoring token: ${tokenId} with bought price: ${boughtPrice}`);
            // Emit event for new token
            this.emit('newToken', { tokenId, boughtPrice });
        }
    }

    // Fetch prices for all monitored tokens
    async fetchPrices() {
        if (this.monitoredTokens.size === 0) {
            console.log('[PriceManager] No tokens to monitor.');
            return;
        }

        try {
            const tokenIds = Array.from(this.monitoredTokens).join(',');
            const response = await fetch(`${API_URL}?ids=${tokenIds}`);
            const data = await response.json();

            this.monitoredTokens.forEach((tokenId) => {
                if (data.data && data.data[tokenId]) {
                    const newPrice = data.data[tokenId].price;
                    const tokenData = this.tokens.get(tokenId);
                    const oldPrice = tokenData?.livePrice || null;

                    // Update the live price
                    this.tokens.set(tokenId, { ...tokenData, livePrice: newPrice });

                    // Emit event if the price changes
                    if (newPrice !== oldPrice) {
                        this.emit('priceUpdate', { tokenId, livePrice: newPrice, boughtPrice: tokenData?.boughtPrice });
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

    // Start periodic price fetching
    startFetchingPrices(interval = 6000) {
        setInterval(() => this.fetchPrices(), interval);
    }
}

// Export a singleton instance of PriceManager
const priceManager = new PriceManager();
export default priceManager;
