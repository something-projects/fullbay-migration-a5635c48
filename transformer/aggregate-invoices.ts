#!/usr/bin/env ts-node
/**
 * Invoice Aggregation CLI Tool
 * 
 * Aggregates invoice data from service orders into invoice index files
 * for easy access and financial reporting.
 * 
 * Usage:
 *   npm run aggregate-invoices                  # Aggregate all entities
 *   npm run aggregate-invoices -- --entityId 12  # Aggregate specific entity
 */

import { InvoiceAggregator } from './src/utils/InvoiceAggregator';
import * as path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const entityIdArg = args.find(arg => arg.startsWith('--entityId'));
  const entityId = entityIdArg ? parseInt(entityIdArg.split('=')[1]) : null;

  const outputDir = path.join(__dirname, '..', 'output');
  const aggregator = new InvoiceAggregator(outputDir);

  console.log('🚀 Starting Invoice Aggregation');
  console.log(`📁 Output Directory: ${outputDir}`);
  
  const startTime = Date.now();

  try {
    if (entityId) {
      console.log(`🎯 Aggregating entity ${entityId}...`);
      await aggregator.aggregateEntityInvoices(entityId);
    } else {
      console.log(`🌍 Aggregating all entities...`);
      await aggregator.aggregateAllEntities();
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Invoice aggregation completed in ${duration}s`);
  } catch (error) {
    console.error('\n❌ Invoice aggregation failed:', error);
    process.exit(1);
  }
}

main();

