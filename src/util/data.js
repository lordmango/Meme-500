import fs from 'fs'

const filePath = 'data/cache.json';

export function writeToJson(newData, isNew = true) {
    try {
      let data = [];
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(fileContent);
      }

      if (isNew) {
        data.push(newData);
  
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));  
      } else {
        const modifiedData = data.find((d) => d.tokenId === newData.tokenId)
        modifiedData.orderPublicKey = newData.orderPublicKey
        modifiedData.thershold = newData.threshold

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      }
  
    } catch (error) {
      console.error('Error writing to JSON file:', error);
    }
}

export function readFromJson(tokenId) {
    try {
        let data = [];
        if (fs.existsSync(filePath)) {
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          data = JSON.parse(fileContent);
        }
    
        const existingData = data.filter((d) => d.tokenId === tokenId)
    
        return existingData;
    } catch (error) {
        console.error('Error writing to JSON file:', error);
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