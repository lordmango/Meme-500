import puppeteer from 'puppeteer';

const testFetchPairID = async (tokenId) => {
    let browser = null;
    try {
        browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        const url = `https://ave.ai/token/${tokenId}-solana?from=Token`;
        await page.setViewport({ width: 1080, height: 1000 });
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        await page.waitForSelector('td[data-v-6fa340bb=""]', { timeout: 20000 });
        
        const links = await page.$$eval('a[href^="https://solscan.io/token/"]', elements =>
            elements.map(el => el.href, { timeout: 10000 })
        );
        
        if (links.length >= 3) {
            const pairID = links[2].split('/').pop();
            console.log(`Extracted Pair ID: ${pairID}`);
        } else {
            console.log('Pair ID not found');
        }
    } catch (error) {
        console.error(`Error fetching pair ID for ${tokenId}:`, error.message);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
};

// Example usage
testFetchPairID('BZH9tBDfzEPHgqnqx9To31HGdA29skxJFxnBXVd7nUuP');
