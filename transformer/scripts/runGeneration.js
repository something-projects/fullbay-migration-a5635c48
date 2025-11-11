const fs = require('fs');
const path = require('path');

// Configuration
const SCHEMA_DIR = '/Users/bozhaoyu/src/customer-work/fullbay/fullbay-all/test_db/schema';
const OUTPUT_FILE = '/Users/bozhaoyu/src/customer-work/fullbay/fullbay-all/denormalized/src/utils/TsvHeaders.ts';

/**
 * Extract table name and column names from SQL CREATE TABLE statement
 */
function parseCreateTableSQL(sqlContent, fileName) {
  const tableName = path.basename(fileName, '.sql');
  
  // Replace literal \n with actual newlines
  let normalizedContent = sqlContent.replace(/\\n/g, '\n');
  
  const columns = [];
  
  // Start after the CREATE TABLE declaration
  const createTableMatch = normalizedContent.match(/CREATE TABLE\s+`[^`]+`\s*\(/);
  if (!createTableMatch) {
    console.warn(`Warning: Could not find CREATE TABLE in ${fileName}`);
    return null;
  }
  
  const startIndex = createTableMatch.index + createTableMatch[0].length;
  const endMatch = normalizedContent.match(/\)\s*ENGINE/);
  if (!endMatch) {
    console.warn(`Warning: Could not find ENGINE clause in ${fileName}`);
    return null;
  }
  
  const columnSection = normalizedContent.substring(startIndex, endMatch.index);
  
  // Split by comma and process each potential column
  const parts = columnSection.split(',');
  
  for (let part of parts) {
    part = part.trim();
    
    // Skip constraint lines
    if (part.includes('PRIMARY KEY') || 
        part.includes('UNIQUE KEY') || 
        part.includes('KEY ') ||
        part.includes('INDEX ') ||
        part.includes('CONSTRAINT') ||
        part.includes('FOREIGN KEY')) {
      continue;
    }
    
    // Look for backtick-quoted column name at start
    const columnMatch = part.match(/^\s*`([^`]+)`/);
    if (columnMatch) {
      columns.push(columnMatch[1]);
    }
  }
  
  return {
    tableName: tableName,
    fileName: tableName,
    columns: columns.filter(col => col)
  };
}

/**
 * Generate TypeScript file content
 */
function generateTypeScriptFile(tableData) {
  let content = `/**
 * TSV file headers mapping for Fullbay database tables
 * Generated from SQL schema definitions
 * 
 * Auto-generated on ${new Date().toISOString()}
 * Total tables: ${tableData.length}
 */

export const TSV_HEADERS: { [tableName: string]: string[] } = {
`;

  // Sort tables alphabetically
  tableData.sort((a, b) => a.fileName.localeCompare(b.fileName));
  
  for (let i = 0; i < tableData.length; i++) {
    const table = tableData[i];
    const isLast = i === tableData.length - 1;
    
    content += `  ${table.fileName}: [\n`;
    
    // Add columns
    for (let j = 0; j < table.columns.length; j++) {
      const column = table.columns[j];
      const isLastColumn = j === table.columns.length - 1;
      content += `    '${column}'${isLastColumn ? '' : ','}\n`;
    }
    
    content += `  ]${isLast ? '' : ','}\n`;
    if (!isLast) content += '\n';
  }
  
  content += `};
`;

  return content;
}

// Main execution
try {
  console.log('🚀 Starting TSV Headers generation...');
  console.log(`📂 Schema directory: ${SCHEMA_DIR}`);
  console.log(`📂 Output file: ${OUTPUT_FILE}`);
  
  if (!fs.existsSync(SCHEMA_DIR)) {
    throw new Error(`Schema directory not found: ${SCHEMA_DIR}`);
  }
  
  const files = fs.readdirSync(SCHEMA_DIR)
    .filter(file => file.endsWith('.sql'))
    .sort();
  
  console.log(`📋 Found ${files.length} SQL files`);
  
  const tableData = [];
  let processedCount = 0;
  let skippedCount = 0;
  
  // Process each file
  for (const file of files) {
    const filePath = path.join(SCHEMA_DIR, file);
    const sqlContent = fs.readFileSync(filePath, 'utf8');
    
    const parsed = parseCreateTableSQL(sqlContent, file);
    if (parsed && parsed.columns.length > 0) {
      tableData.push(parsed);
      processedCount++;
      console.log(`✅ Processed: ${file} (${parsed.columns.length} columns)`);
    } else {
      skippedCount++;
      console.log(`⚠️  Skipped: ${file} - Could not parse or no columns`);
    }
  }
  
  console.log(`\n📊 Processing Summary:`);
  console.log(`   - Total files: ${files.length}`);
  console.log(`   - Processed: ${processedCount}`);
  console.log(`   - Skipped: ${skippedCount}`);
  console.log(`   - Total columns: ${tableData.reduce((sum, t) => sum + t.columns.length, 0)}`);
  
  // Generate and write the file
  const tsContent = generateTypeScriptFile(tableData);
  fs.writeFileSync(OUTPUT_FILE, tsContent, 'utf8');
  
  console.log(`\n🎉 Successfully generated TSV headers file!`);
  console.log(`📝 File: ${OUTPUT_FILE}`);
  console.log(`📈 Contains ${tableData.length} tables`);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}