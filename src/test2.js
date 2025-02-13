import puppeteer from 'puppeteer';

const testFetchPairID = async (tokenId) => {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    const url = `https://ave.ai/token/${tokenId}-solana?from=Token`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    
    try {
        await page.waitForSelector('div.color-text-1.text-16px', { timeout: 10000 });

        const links = await page.$$eval('a[href^="https://solscan.io/token/"]', elements =>
            elements.map(el => el.href)
        );
        
        if (links.length >= 3) {
            const pairID = links[2].split('/').pop();
            console.log(`Extracted Pair ID: ${pairID}`);
        } else {
            console.log('Pair ID not found');
        }
    } catch (error) {
        console.error(`Error fetching pair ID for ${tokenId}:`, error.message);
    }
    
    await browser.close();
};

// Example usage
testFetchPairID('BZH9tBDfzEPHgqnqx9To31HGdA29skxJFxnBXVd7nUuP');
