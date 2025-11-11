#!/usr/bin/env node

import * as yargs from 'yargs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { SSHTunnelSimple, createSimpleSSHTunnelFromEnv } from './utils/SSHTunnelSimple';
import { createDatabaseDataReader, DatabaseDataReader } from './utils/DataSource';
import { DatabaseConfig } from './utils/DatabaseConnection';
import { OutputManager } from './utils/OutputManager';
import { DataQualityTracker } from './utils/DataQualityTracker';
import { EntityProcessor } from './processors/EntityProcessor';
import { CustomerProcessor } from './processors/CustomerProcessor';
import { ServiceOrderProcessor } from './processors/ServiceOrderProcessor';

// Load environment variables from parent directory .env file
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

interface TunnelFetchArgs {
  entityId: number;
  outputDir: string;
  prettyJson?: boolean;
  testConnection?: boolean;
  keepTunnel?: boolean;
  help?: boolean;
}

async function main() {
  console.log('🚀 Fullbay SSH Tunnel Data Fetcher');
  console.log('==================================');

  const argv = yargs
    .option('entityId', {
      alias: 'e',
      type: 'number',
      default: process.env.ENTITY_ID ? parseInt(process.env.ENTITY_ID) : undefined,
      description: 'Entity ID (Repair Shop ID) to fetch'
    })
    .option('outputDir', {
      alias: 'o',
      type: 'string',
      default: '../output',
      description: 'Output directory for transformed JSON'
    })
    .option('prettyJson', {
      alias: 'p',
      type: 'boolean',
      default: true,
      description: 'Pretty print JSON output'
    })
    .option('testConnection', {
      alias: 't',
      type: 'boolean',
      default: false,
      description: 'Test SSH tunnel and MySQL connection only'
    })
    .option('keepTunnel', {
      alias: 'k',
      type: 'boolean',
      default: false,
      description: 'Keep SSH tunnel open after completion (for debugging)'
    })
    .help()
    .example('$0 --entityId 1269', 'Fetch and transform entity 1269')
    .example('$0 -e 1269 -t', 'Test connection for entity 1269')
    .parseSync() as TunnelFetchArgs;

  // Get Entity ID from command line or environment
  const entityId = argv.entityId;
  
  if (!entityId) {
    console.error('❌ Entity ID required');
    console.error('   Set ENTITY_ID environment variable or use --entityId (-e) flag');
    console.error('   Example: npm run tunnel-fetch -- --entityId 1269');
    process.exit(1);
  }

  console.log(`🏢 Processing Entity ID: ${entityId}`);
  console.log(`📤 Output directory: ${path.resolve(argv.outputDir)}`);
  
  let tunnel: SSHTunnelSimple | undefined;
  let dataReader: DatabaseDataReader | undefined;

  try {
    // 1. Create and connect SSH tunnel
    console.log('\n🔗 Setting up SSH Tunnel');
    console.log('========================');
    
    tunnel = createSimpleSSHTunnelFromEnv();
    await tunnel.connect();

    // 2. Create database connection through tunnel
    console.log('\n🗄️  Connecting to Database');
    console.log('=========================');
    
    const dbConfig: DatabaseConfig = {
      host: '127.0.0.1',
      port: tunnel.getLocalPort(),
      user: process.env.MYSQL_USER || '',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || '',
      ssl: undefined, // Tunnel handles encryption
    };

    if (!dbConfig.user || !dbConfig.database) {
      console.error('❌ Database credentials required. Set MYSQL_USER, MYSQL_DATABASE environment variables.');
      process.exit(1);
    }

    dataReader = createDatabaseDataReader(dbConfig);
    await dataReader.connect();

    // 3. Test connection
    console.log('⏳ Testing database connection...');
    const testResult = await tunnel.testConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
    });

    if (!testResult) {
      console.error('❌ Database connection test failed');
      process.exit(1);
    }

    // 4. Verify entity exists
    console.log(`\n🔍 Verifying Entity ${entityId}`);
    console.log('=============================');
    
    const entities = await dataReader.query(
      'SELECT entityId, legalName, title, status FROM Entity WHERE entityId = ?',
      [entityId]
    );

    if (entities.length === 0) {
      console.error(`❌ Entity ${entityId} not found in database`);
      process.exit(1);
    }

    const entity = entities[0];
    console.log(`✅ Entity found: ${entity.legalName || entity.title}`);
    console.log(`   Status: ${entity.status}`);

    // Get related counts for overview
    const [customerCount] = await dataReader.query(
      'SELECT COUNT(*) as count FROM Customer WHERE entityId = ?',
      [entityId]
    );
    
    const [unitCount] = await dataReader.query(
      'SELECT COUNT(*) as count FROM CustomerUnit cu JOIN Customer c ON cu.customerId = c.customerId WHERE c.entityId = ?',
      [entityId]
    );
    
    const [orderCount] = await dataReader.query(
      'SELECT COUNT(*) as count FROM RepairOrder ro JOIN Customer c ON ro.customerId = c.customerId WHERE c.entityId = ?',
      [entityId]
    );

    console.log(`   Customers: ${customerCount.count}`);
    console.log(`   Units: ${unitCount.count}`);
    console.log(`   Orders: ${orderCount.count}`);

    // 5. If test-only mode, stop here
    if (argv.testConnection) {
      console.log('\n✅ Connection test completed successfully!');
      console.log('   SSH tunnel and database connection are working correctly.');
      console.log('   Ready to fetch and transform data.');
      return;
    }

    // 6. Initialize transformation components
    console.log('\n🔄 Starting Data Transformation');
    console.log('==============================');
    
    const timestamp = new Date();
    const outputManager = new OutputManager({
      baseOutputDir: argv.outputDir,
      prettyJson: argv.prettyJson
    });
    
    await outputManager.initialize();
    console.log(`📁 Output directory: ${outputManager.getOutputDirectory()}`);

    const qualityTracker = new DataQualityTracker();
    const startTime = Date.now();

    // 7. Process the data through transformers
    console.log(`\n🏢 Processing Entity ${entityId}...`);
    const entityProcessor = new EntityProcessor(dataReader, outputManager, qualityTracker);
    const processedEntities = await entityProcessor.processSpecificEntity(entityId);

    if (Object.keys(processedEntities).length === 0) {
      console.error(`❌ Failed to process entity ${entityId}`);
      process.exit(1);
    }

    console.log(`\n👥 Processing Customers for Entity ${entityId}...`);
    const customerProcessor = new CustomerProcessor(dataReader, outputManager, qualityTracker);
    await customerProcessor.processCustomers(processedEntities);

    console.log(`\n🔧 Processing Service Orders for Entity ${entityId}...`);
    const serviceOrderProcessor = new ServiceOrderProcessor(dataReader, outputManager, qualityTracker);
    await serviceOrderProcessor.processServiceOrders(processedEntities);

    // 🔥 NEW: Auto-aggregate invoices & repair orders after entity processing
    console.log(`\n📊 Auto-aggregating invoices for entity ${entityId}...`);
    try {
      const { InvoiceAggregator } = await import('./utils/InvoiceAggregator');
      const aggregator = new InvoiceAggregator(outputManager.getOutputDirectory());
      await aggregator.aggregateEntityInvoices(entityId);
      console.log(`✅ Invoice aggregation completed for entity ${entityId}`);
    } catch (aggError) {
      console.warn(`⚠️  Invoice aggregation failed for entity ${entityId}:`, aggError);
      // Don't fail the entire processing if aggregation fails
    }

    console.log(`\n🧩 Auto-aggregating repair orders for entity ${entityId}...`);
    try {
      const { RepairOrderAggregator } = await import('./utils/RepairOrderAggregator');
      const roAggregator = new RepairOrderAggregator(outputManager.getOutputDirectory());
      await roAggregator.aggregateEntityRepairOrders(entityId);
      console.log(`✅ Repair order aggregation completed for entity ${entityId}`);
    } catch (roAggError) {
      console.warn(`⚠️  Repair order aggregation failed for entity ${entityId}:`, roAggError);
      // Don't fail the entire processing if aggregation fails
    }

    // 8. Generate summary
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const qualityReport = qualityTracker.getQualityReport();
    
    const summary = {
      processingTimeMs: processingTime,
      processingTimeFormatted: formatDuration(processingTime),
      entityId: entityId,
      entitiesProcessed: Object.keys(processedEntities).length,
      dataSourceType: 'database_ssh_tunnel',
      outputDirectory: outputManager.getOutputDirectory(),
      timestamp: timestamp.toISOString(),
      dataQuality: {
        totalRecords: qualityReport.summary.totalRecords,
        successRate: qualityReport.summary.overallSuccessRate,
        totalIssues: qualityReport.summary.totalIssues,
        entityStats: qualityReport.entityStats
      },
      tunnelInfo: {
        sshHost: process.env.REMOTE_HOST,
        localPort: tunnel.getLocalPort(),
        remoteHost: process.env.MYSQL_HOST
      },
      success: true
    };

    await outputManager.writeSummary(summary);

    console.log('\n🎉 Transformation completed successfully!');
    console.log('========================================');
    console.log(`🏢 Entity ID processed: ${entityId}`);
    console.log(`📊 Total records: ${qualityReport.summary.totalRecords}`);
    console.log(`⏱️  Processing time: ${summary.processingTimeFormatted}`);
    console.log(`📁 Output location: ${summary.outputDirectory}`);
    console.log(`🔌 SSH tunnel: ${process.env.REMOTE_USER}@${process.env.REMOTE_HOST}:${tunnel.getLocalPort()}`);

    if (qualityReport.summary.totalIssues > 0) {
      console.log(`⚠️  Data issues: ${qualityReport.summary.totalIssues} (see processing_summary.json)`);
    }

  } catch (error) {
    console.error('\n❌ Error during processing:', error);
    
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      
      if (error.message.includes('ECONNREFUSED')) {
        console.error('\n🔍 Connection troubleshooting:');
        console.error('   1. Check SSH tunnel is working');
        console.error('   2. Verify MySQL server is accessible from gateway');
        console.error('   3. Check database credentials');
      }
      
      if (error.message.includes('SSH')) {
        console.error('\n🔍 SSH troubleshooting:');
        console.error('   1. Check REMOTE_HOST, REMOTE_USER in .env');
        console.error('   2. Verify SSH credentials/keys');
        console.error('   3. Check network connectivity');
      }
    }
    
    process.exit(1);
  } finally {
    // 9. Cleanup
    console.log('\n🧹 Cleaning up...');
    
    if (dataReader) {
      await dataReader.close();
      console.log('✅ Database connection closed');
    }
    
    if (tunnel) {
      if (argv.keepTunnel) {
        console.log('🔌 SSH tunnel kept open (--keepTunnel specified)');
        console.log(`   Connect manually: mysql -h 127.0.0.1 -P ${tunnel.getLocalPort()} -u ${process.env.MYSQL_USER} -p ${process.env.MYSQL_DATABASE}`);
        console.log('   Press Ctrl+C to close tunnel and exit');
        
        // Keep process alive
        await new Promise(() => {});
      } else {
        await tunnel.close();
        console.log('✅ SSH tunnel closed');
      }
    }
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Received interrupt signal, cleaning up...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received termination signal, cleaning up...');
  process.exit(0);
});

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
