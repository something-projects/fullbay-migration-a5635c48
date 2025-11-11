console.log('Script directory:', __dirname);
console.log('Current working directory:', process.cwd());

const path = require('path');
const fs = require('fs');

const schemaDir = path.join(__dirname, '../../test_db/schema');
console.log('Schema directory path:', schemaDir);
console.log('Schema directory exists:', fs.existsSync(schemaDir));

if (fs.existsSync(schemaDir)) {
  const files = fs.readdirSync(schemaDir).filter(f => f.endsWith('.sql'));
  console.log('Found SQL files:', files.length);
  console.log('First few files:', files.slice(0, 5));
}