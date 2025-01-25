import { connect } from "puppeteer-real-browser";
import fs from "fs";

(async () => {
    const { browser, page } = await connect({
        headless: false,
        args: ["--start-maximized"],
        turnstile: true,
        connectOption: {
            defaultViewport: null,
        },
        customConfig: {},
    });

    try {
        console.log("Navigating to the URL...");
        await page.goto("https://dexscreener.com/solana/78sbwyimvhlumzzg1bdmd6oggig8qpmgyzqcxnymxx4z", {
            waitUntil: "domcontentloaded",
        });
        console.log("Page loaded successfully!");

        console.log("Waiting for you to manually navigate to the desired page...");
        await new Promise((resolve) => setTimeout(resolve, 10000));

        console.log("Extracting filtered solscan.io links...");
        const { filteredLinks, loggedData } = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll(".custom-1nvxwu0"));
            const filteredLinks = [];
            const loggedData = []; // Array to log bought and sold tokens

            rows.forEach((row) => {
                const allElements = row.querySelectorAll(".custom-1o79wax");

                for (let i = 0; i < allElements.length; i += 2) {
                    const boughtElement = allElements[i];
                    const soldElement = allElements[i + 1];

                    const boughtAmount = boughtElement.querySelector('span').textContent.trim();
                    if (boughtAmount === '-') continue;

                    const boughtTokenElement = boughtElement.querySelector('span span').textContent.trim().toLowerCase();
                    let boughtTokenAmount = parseFloat(boughtTokenElement);
                    if (boughtTokenElement.includes('m')) boughtTokenAmount *= 1000000;
                    if (boughtTokenElement.includes('k')) boughtTokenAmount *= 1000;

                    const boughtNumTxns = parseInt(boughtElement.querySelector('span span + span + span').textContent.trim());

                    const soldAmount = soldElement.querySelector('span').textContent.trim();
                    if (soldAmount === '-') continue;

                    const soldTokenElement = soldElement.querySelector('span span').textContent.trim().toLowerCase();
                    let soldTokenAmount = parseFloat(soldTokenElement);
                    if (soldTokenElement.includes('m')) soldTokenAmount *= 1000000;
                    if (soldTokenElement.includes('k')) soldTokenAmount *= 1000;

                    const solNumTxns = parseInt(soldElement.querySelector('span span + span + span').textContent.trim());

                    // Log bought and sold tokens
                    loggedData.push({ boughtTokenElement, soldTokenElement });

                    if (boughtNumTxns >= 100) continue;
                    if (boughtTokenAmount - soldTokenAmount < 0) continue;

                    const solscanLink = row.querySelector(".custom-1dwgrrr a")?.href;
                    if (solscanLink && solscanLink.startsWith("https://solscan.io")) {
                        const walletAddress = solscanLink.split('/').pop();
                        if (!filteredLinks.includes(walletAddress)) {
                            filteredLinks.push(walletAddress);
                        }
                    }
                }
            });

            return { filteredLinks, loggedData };
        });

        console.log("Filtered Links:");
        console.log(JSON.stringify(filteredLinks, null, 2));

        // Save to "prospects.json"
        const prospectsFilePath = "/Users/lord_mango/Meme-500/prospects.json";
        const existingData = fs.existsSync(prospectsFilePath)
            ? JSON.parse(fs.readFileSync(prospectsFilePath, "utf8"))
            : [];

        const updatedData = [...existingData, ...filteredLinks];
        fs.writeFileSync(prospectsFilePath, JSON.stringify(updatedData, null, 2), "utf8");
        console.log(`Filtered links successfully saved to ${prospectsFilePath}`);

    } catch (err) {
        console.error("An error occurred:", err);
    }
})();
