import puppeteer from 'puppeteer';

async function fetchAndMonitorPrice(tokenId) {
    const url = `https://www.defined.fi/sol/${tokenId}`;

    try {
        // Launch browser in non-headless mode
        const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
        const page = await browser.newPage();

        // Navigate to the URL
        console.log(`[Browser] Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Wait for the price element to load
        await page.waitForSelector('span[data-sentry-component="FormattedNumber"]', { timeout: 10000 });
        console.log('[PriceFetcher] Price element found. Monitoring for changes...');

        // Continuously poll for price changes every 1 second
        let previousPrice = null;

        setInterval(async () => {
            try {
                // Extract price from the dynamic structure
                const price = await page.$eval('span[data-sentry-component="FormattedNumber"]', (el) => {
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

                // Log the price if it changes
                if (price !== previousPrice) {
                    console.log(`[PriceFetcher] Updated Price: ${price} SOL`);
                    previousPrice = price;
                }
            } catch (error) {
                console.error('[PriceFetcher] Error while polling for price updates:', error.message);
            }
        }, 500); // Poll every 1 second

        // Keep the browser open
        console.log('[Browser] Monitoring in progress... Press Ctrl+C to exit.');
    } catch (error) {
        console.error(`[PriceFetcher] Error: ${error.message}`);
    }
}

// Replace with a token ID to test
const tokenId = '61nfNMVnnEfrL5AucutFq8aDtFQKABioBEo5XrvCpump';
fetchAndMonitorPrice(tokenId);
