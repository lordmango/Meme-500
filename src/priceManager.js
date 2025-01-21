import puppeteer from 'puppeteer';
import { priceUpdate } from './limitOrder.js';

const fetchPrice = async (page, tokenId) => {
    try {
        await page.waitForSelector('span[data-sentry-component="FormattedNumber"]', { timeout: 10000 });
        const tokenPrice = await page.$eval('span[data-sentry-component="FormattedNumber"]', (el) => {
            const subElement = el.querySelector('sub');
            const spanElements = el.querySelectorAll('span');

            if (subElement) {
                // Case with <sub>: Extract subscript value and digits
                const subscriptValue = parseInt(subElement.textContent.trim(), 10); // Number of leading zeros
                const remainingDigits = subElement.nextSibling.textContent.trim(); // Digits after subscript

                // Construct the full number
                const leadingZeros = '0.'.padEnd(subscriptValue + 2, '0'); // Add leading zeros
                return parseFloat(leadingZeros + remainingDigits);
            } else {
                // Case without <sub>: Extract digits directly
                const mainValue = spanElements[1]?.textContent.trim(); // The second <span> holds the price
                return parseFloat(mainValue);
            }
        });


        await page.waitForSelector('span.MuiTypography-root.MuiTypography-caption.css-xpsis6 span:last-child', { timeout: 10000 });
        const solPrice = await page.$eval('span.MuiTypography-root.MuiTypography-caption.css-xpsis6 span:last-child', (el) => {
            // const spanElements = el.querySelectorAll('span');

            // // Case without <sub>: Extract digits directly
            // const mainValue = spanElements[1]?.textContent.trim(); // The second <span> holds the price
            // return parseFloat(mainValue);
            return parseFloat(el.textContent.trim())
        });
        if (!parseFloat(tokenPrice) || !parseFloat(solPrice)) return null;
        const tokenPriceInSol = parseFloat(tokenPrice) / parseFloat(solPrice)
        console.log(`${tokenId} : ${tokenPriceInSol}`)

        return tokenPriceInSol;
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
            this.browser = await puppeteer.launch({ headless: true });
            console.log('[PriceManager] Browser initialized');
        }

        // Create a new tab for the token
        const page = await this.browser.newPage();
        const url = `https://www.defined.fi/sol/${tokenId}`;
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
                console.log(`[PriceManager] Price updated for ${tokenId}: ${newPrice}`);
            }

            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before checking again
        }
    }
}

// Export a singleton instance of PriceManager
const priceManager = new PriceManager();
export default priceManager;
