import priceManager from './priceManager.js';

// Listen for new tokens being added
priceManager.on('newToken', (tokenId) => {
    console.log(`[Test] New token added: ${tokenId}`);
});

// Listen for price updates
priceManager.on('priceUpdate', ({ tokenId, price }) => {
    console.log(`[Test] Token ${tokenId} updated to price: ${price}`);
});

// Add tokens to monitor
console.log('[Test] Adding tokens...');
priceManager.addToken('So11111111111111111111111111111111111111112'); // Example: SOL
priceManager.addToken('9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9'); // Example: USDC

// Start fetching prices
console.log('[Test] Starting price fetching...');
priceManager.startFetchingPrices();
