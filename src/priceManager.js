import puppeteer from 'puppeteer';
import { priceUpdate } from './limitOrder.js';
import { swapTokens } from './sellToken.js';

let counter = 0;
const INPUT_MINT = "So11111111111111111111111111111111111111112"; // Example: SOL
const SELL_PRIORITY_FEE = 2000000; // Priority fee in lamports
const SELL_MIN_BPS = 1000; // Min slippage
const SELL_MAX_BPS = 1000; // Min slippage
const QUOTE_SLIPPAGE = 1000; // Slippage when we send quote

const fetchPrice = async (page, tokenId) => {
   try {
      // Wait for the element to appear on the page
      await page.waitForSelector('div.color-text-1.text-16px', { timeout: 10000 });

      // Extract the price value
      const priceText = await page.$eval('div.color-text-1.text-16px', (el) => el.textContent.trim());

      // Check if the price contains a subscript notation (e.g., $0.0{4}6556)
      const subscriptMatch = priceText.match(/\{(\d+)\}(\d+)/);
      if (subscriptMatch) {
          const subscriptValue = parseInt(subscriptMatch[1], 10); // Extract the subscript value (e.g., 4)
          const remainingDigits = subscriptMatch[2]; // Extract the digits after the subscript (e.g., 6556)

          // Create the correct decimal representation
          const leadingZeros = '0.'.padEnd(subscriptValue + 2, '0'); // Add leading zeros
          const tokenPrice = parseFloat(leadingZeros + remainingDigits);

         //  console.log(`Fetched Price with subscript: ${tokenPrice}`);
          return tokenPrice;
      } else {
          // Handle regular price format
          const tokenPrice = parseFloat(priceText.replace('$', ''));
          if (!tokenPrice) return null;

         //  console.log(`Fetched Price: ${tokenPrice}`);
          return tokenPrice;
      }
    } catch (error) {
        console.error(`[PriceManager] Error fetching price for ${tokenId}:`, error.message);
        return null;
    }
};

class PriceManager {
    constructor() {
        this.tokens = new Map(); // Map to store token data: { tokenId: { page, livePrice, boughtPrice, out_amount } }
        this.browser = null; // Puppeteer browser instance
    }

    // Add a token to the memory and start monitoring its price
    async addToken(tokenId, boughtPrice, out_amount) {
        if (this.tokens.has(tokenId)) {
            console.log(`[PriceManager] Token ${tokenId} is already being monitored.`);
            return;
        }

        // Initialize the browser if not already running
        if (!this.browser) {
            this.browser = await puppeteer.launch({ headless: false });
            console.log('[PriceManager] Browser initialized');
        }

        // Create a new tab for the token
        const page = await this.browser.newPage();
        const url = `https://ave.ai/token/${tokenId}-solana?from=Token`;
        await page.setViewport({width: 1080, height: 1000})
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        console.log(`[PriceManager] Monitoring price for token: ${tokenId}`);

        // Store token data in memory
        this.tokens.set(tokenId, { page, livePrice: null, boughtPrice, out_amount });

        // Start monitoring the price
        this.monitorPrice(tokenId, page);
    }

    // Stop monitoring a token and close its tab
    async removeToken(tokenId) {
        const tokenData = this.tokens.get(tokenId);

        if (tokenData) {
            await tokenData.page.close(); // Close the tab
            this.tokens.delete(tokenId);
            console.log(`[PriceManager] Stopped monitoring token: ${tokenId}`);
        } else {
            console.log(`[PriceManager] Token ${tokenId} is not being monitored.`);
        }

        // Close the browser if no tokens are being monitored
        if (this.tokens.size === 0 && this.browser) {
            await this.browser.close();
            this.browser = null;
            console.log('[PriceManager] Browser closed');
        }
    }

    // Monitor the price for a specific token
    async monitorPrice(tokenId, page) {
        const tokenData = this.tokens.get(tokenId);

        while (this.tokens.has(tokenId)) {
            const newPrice = await fetchPrice(page, tokenId);
            if (!newPrice) await new Promise((resolve) => setTimeout(resolve, 1000));

            if (newPrice !== null && newPrice !== tokenData.livePrice) {
                tokenData.livePrice = newPrice; // Update live price in memory
                await priceUpdate(tokenId, newPrice, tokenData.boughtPrice, tokenData.out_amount); // Notify price change
               //  console.log(`[PriceManager] Price updated for ${tokenId}: ${newPrice}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 1 second before checking again
        }
    }
}

// Export a singleton instance of PriceManager
const priceManager = new PriceManager();
export default priceManager;
