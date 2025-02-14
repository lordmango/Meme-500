import puppeteer from 'puppeteer';
import { priceUpdate } from './limitOrder.js';
import { setPairID, updateLivePrice } from './server.js';

const fetchPrice = async (page, tokenId) => {
   try {
      await page.waitForSelector('div.color-text-1.text-16px', { timeout: 10000 });

      // Extract the price value
      const priceText = await page.$eval('div.color-text-1.text-16px', (el) => el.textContent.trim());

   //    const links = await page.$$eval('a[href^="https://solscan.io/token/"]', elements =>
   //       elements.map(el => el.href, { timeout: 10000 })
   //   );
      
   //    if (links.length >= 3) {
   //       const pairID = links[2].split('/').pop();
   //       setPairID(pairID);
   //       // console.log(`Extracted Pair ID: ${pairID}`);
   //    }

      // Handle subscript notation in price
      const subscriptMatch = priceText.match(/\{(\d+)\}(\d+)/);
      if (subscriptMatch) {
         const subscriptValue = parseInt(subscriptMatch[1], 10);
         const remainingDigits = subscriptMatch[2];
         const leadingZeros = '0.'.padEnd(subscriptValue + 2, '0');
         return parseFloat(leadingZeros + remainingDigits);
      } else {
         return parseFloat(priceText.replace('$', '')) || null;
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

   updateBoughtPrice(tokenId, newBoughtPrice) {
      if (this.tokens.has(tokenId)) {
         let tokenData = this.tokens.get(tokenId);
         tokenData.boughtPrice = newBoughtPrice;
         this.tokens.set(tokenId, tokenData);
      } else {
         console.log(`Token with ID ${tokenId} not found.`);
      }
   }

   updateTakeProfit(tokenId, newTakeProfit) {
      if (this.tokens.has(tokenId)) {
         let tokenData = this.tokens.get(tokenId);
         tokenData.takeProfit = newTakeProfit;
         this.tokens.set(tokenId, tokenData);
      } else {
         console.log(`Token with ID ${tokenId} not found.`);
      }
   }

   // Add a token to the memory and start monitoring its price
   async addToken(tokenId, boughtPrice, out_amount, takeProfit) {
      if (this.tokens.has(tokenId)) {
         // console.log(`[PriceManager] Token ${tokenId} is already being monitored.`);
         return;
      }

      // Initialize the browser if not already running
      if (!this.browser) {
         this.browser = await puppeteer.launch({ headless: false });
         console.log('[PriceManager] Browser initialized');
      }

      // Create a new tab for the token
      const page = await this.browser.newPage();

      // Store token data in memory
      this.tokens.set(tokenId, { page, livePrice: null, boughtPrice, out_amount, takeProfit });

      const url = `https://ave.ai/token/${tokenId}-solana?from=Token`;
      await page.setViewport({ width: 1080, height: 1000 })
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      console.log(`[PriceManager] Monitoring price for token: ${tokenId}`);

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
            await priceUpdate(tokenId, newPrice, tokenData.boughtPrice, tokenData.out_amount, tokenData.takeProfit);
            updateLivePrice(newPrice);
         }

         await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 1 second before checking again
      }
   }
}

// Export a singleton instance of PriceManager
const priceManager = new PriceManager();
export default priceManager;
