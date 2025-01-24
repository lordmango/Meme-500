import { connect } from "puppeteer-real-browser";

(async () => {
    const { browser, page } = await connect({
        headless: false, // Set false for visible browser
        args: ["--start-maximized"], // Additional arguments
        turnstile: true, // Enable captcha solving
        connectOption: {
            defaultViewport: null, // Use full screen
        },
        customConfig: {}, // Custom Chromium options
    });

    try {
        console.log("Navigating to the URL...");
        await page.goto("https://dexscreener.com/solana/58fzjmbx5patnfjpqwwsqkvfprkptkbb5r2vcw4qq3z9", {
            waitUntil: "domcontentloaded",
        });
        console.log("Page loaded successfully!");

        console.log("Waiting for you to manually navigate to the desired page...");
        await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10 seconds

        console.log("Extracting filtered solscan.io links...");
        const { filteredLinks } = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".custom-1nvxwu0"));
            const filteredLinks = [];

            rows.forEach((row) => {
                const allElements = row.querySelectorAll(".custom-1o79wax");
            
                // Ensure every pair of elements (bought and sold) is processed
                for (let i = 0; i < allElements.length; i += 2) {
                    const boughtElement = allElements[i];
                    const soldElement = allElements[i + 1];
            
                    // Extract data for bought element
                    const boughtAmount = boughtElement.querySelector('span').textContent.trim();
                    if (boughtAmount === '-') continue; // Skip if no bought amount
            
                    const boughtTokenElement = boughtElement.querySelector('span span').textContent.trim()
                    let boughtTokenAmount = parseFloat(boughtTokenElement);
                    if (boughtTokenElement.includes('M')) boughtTokenAmount = parseFloat(boughtTokenElement) * 1000000
                    if (boughtTokenElement.includes('K')) boughtTokenAmount = parseFloat(boughtTokenElement) * 1000

                    const boughtNumTxns = parseInt(boughtElement.querySelector('span span + span + span').textContent.trim());
            
                    // Extract data for sold element
                    const soldAmount = soldElement.querySelector('span').textContent.trim();
                    if (soldAmount === '-') continue; // Skip if no sold amount
            
                    const soldTokenElement = soldElement.querySelector('span span').textContent.trim()
                    let soldTokenAmount = parseFloat(soldTokenElement);;
                    if (soldTokenElement.includes('M')) boughtTokenAmount = parseFloat(soldTokenElement) * 1000000
                    if (soldTokenElement.includes('K')) boughtTokenAmount = parseFloat(soldTokenElement) * 1000
                    
                    const solNumTxns = parseInt(soldElement.querySelector('span span + span + span').textContent.trim());
            
                    // Check conditions
                    if (boughtNumTxns >= 100) continue; // Skip if transactions >= 100
                    if (boughtTokenAmount - soldTokenAmount <= 0) continue; // Skip if tokens difference is not positive
            
                    // Extract wallet address from Solscan link
                    const solscanLink = row.querySelector(".custom-1dwgrrr a")?.href;
                    if (solscanLink && solscanLink.startsWith("https://solscan.io")) {
                        const walletAddress = solscanLink.split('/').pop(); // Get the last part of the URL
            
                        // Ensure wallet address is unique in filtered links
                        if (!filteredLinks.includes(walletAddress)) {
                            filteredLinks.push(walletAddress);            
                        }
                    }
                }
            });

            return { filteredLinks };
        });

        console.log("Results:");
        console.log(filteredLinks)

    } catch (err) {
        console.error("An error occurred:", err);
    }
})();
