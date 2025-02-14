import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pythonExecutable = "/Users/lord_mango/Meme-500/.venv/bin/python"; // Use the virtual env's Python

export function executePython(scriptName, inputValues) {
    console.log("Input Values:", inputValues);
    
    const pythonScriptPath = path.join(__dirname, scriptName);
    
    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonExecutable, [pythonScriptPath, ...inputValues.map(String)]);
        let outputData = "";

        pythonProcess.stdout.on("data", (data) => {
            outputData += data.toString().trim();
        });

        pythonProcess.stderr.on("data", (data) => {
            console.error("Python Error:", data.toString());
        });

        pythonProcess.on("close", (code) => {
            console.log(`Python script exited with code ${code}`);

            if (code === 0) {
                const [prob06, prob1] = outputData.split(" ").map(parseFloat);
                console.log("Predicted Probabilities:", { prob06, prob1 });
                resolve({ prob06, prob1 }); // Return both probabilities
            } else {
                reject(new Error(`Python script exited with code ${code}`));
            }
        });
    });
}
