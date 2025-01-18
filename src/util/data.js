import fs from 'fs'

const filePath = 'data/cache.json';

export function writeToJson(newData, isNew = true) {
   try {
       let data = [];
       if (fs.existsSync(filePath)) {
           const fileContent = fs.readFileSync(filePath, 'utf-8');
           data = JSON.parse(fileContent || '[]'); // Default to empty array
       }

       if (isNew) {
           data.push(newData); // Append new data
       } else {
           const index = data.findIndex(d => d.tokenId === newData.tokenId);
           if (index >= 0) {
               data[index] = { ...data[index], ...newData }; // Update data
           } else {
               data.push(newData); // If not found, add as new
           }
       }

       fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); // Write back to file
   } catch (error) {
       console.error('Error writing to JSON file:', error);
   }
}

export function readFromJson(tokenId) {
   try {
       if (!fs.existsSync(filePath)) {
           return null;
       }
       const fileContent = fs.readFileSync(filePath, 'utf-8');
       const data = JSON.parse(fileContent || '[]'); // Parse empty array if needed
       return data.find(d => d.tokenId === tokenId) || null; // Return matching entry or null
   } catch (error) {
       console.error('Error reading JSON file:', error);
       return null;
   }
}

export function removeFromJson(tokenId) {
    try {
        let data = [];
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          data = JSON.parse(fileContent);
        }
    
        const updatedData = data.filter((d) => d.tokenId !== tokenId)

        fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2));
    } catch (error) {
        console.error('Error writing to JSON file:', error);
      }  
}