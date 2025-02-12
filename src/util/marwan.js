import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pythonScriptPath = path.join(__dirname, "zaza3.py");
const pythonExecutable = "/Users/bobob/Documents/meme500/Meme-500/.venv/bin/python"; // Use the virtual env's Python

export function executePython(inputValues) {
    console.log(inputValues)
    // const inputValues = [
    //     470000, // Market Cap (size of the company or asset)
    //     1,      // All Sold? (1 = Yes, 0 = No)
    //     1,      // Buy Candle (1 = Green candle, 0 = Red candle)
    //     1,      // P1 Candle (1 = Green candle, 0 = Red candle)
    //     0,      // P2 Candle (1 = Green candle, 0 = Red candle)
    //     46000,  // Buy Volume (how much was bought)
    //     33000,  // P1 Volume (volume of previous period 1)
    //     4000    // P2 Volume (volume of previous period 2)
    //  ];
     
     const pythonProcess = spawn(pythonExecutable, [pythonScriptPath, ...inputValues.map(String)]);
     let outputData = "";
     
     pythonProcess.stdout.on("data", (data) => {
         console.log("Predicted Probability:", data.toString().trim());
         outputData += data.toString().trim();
     });
     
     pythonProcess.stderr.on("data", (data) => {
         console.error("Error:", data.toString());
     });
     
     pythonProcess.on("close", (code) => {
         console.log(`Python script exited with code ${code}`);
         console.log("Predicted Probability:", outputData.trim()); // Display final output
     });     
}