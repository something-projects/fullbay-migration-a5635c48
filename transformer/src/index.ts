#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import * as yargs from 'yargs';
import * as dotenv from 'dotenv';
import { createDatabaseDataReader, DatabaseDataReader } from './utils/DataSource';
import { DatabaseConfig } from './utils/DatabaseConnection';
import { OutputManager } from './utils/OutputManager';
import { DataQualityTracker } from './utils/DataQualityTracker';
import { EntityProcessor } from './processors/EntityProcessor';
import { CustomerProcessor } from './processors/CustomerProcessor';
import { OptimizedCustomerProcessor } from './processors/OptimizedCustomerProcessor';
import { ServiceOrderProcessor } from './processors/ServiceOrderProcessor';
import { AutoCareLoader, setAutoCareLoader } from './utils/AutoCareLoader';
import { spawn } from 'child_process';


// Load environment variables from .env file
dotenv.config();

interface CliArgs {
  outputDir: string;
  prettyJson?: boolean;

  // Database options
  dbHost?: string;
  dbPort?: number;
  dbUser?: string;
  dbPassword?: string;
  dbName?: string;
  // Processing options
  full?: boolean;
  // AutoCare options
  vcdbPath?: string;
  pcdbPath?: string;
  enableAutocare?: boolean;
  entityId?: number;
  rewrite?: boolean;
  help?: boolean;
}

async function main() {
  const argv = yargs
    .option('outputDir', {
      alias: 'o', 
      type: 'string',
      default: process.env.OUTPUT_DIR || '../output',
      description: 'Base output directory for JSON files'
    })


    .option('prettyJson', {
      alias: 'p',
      type: 'boolean',
      default: process.env.PRETTY_JSON !== 'false',
      description: 'Pretty print JSON output'
    })
    .option('dbHost', {
      type: 'string',
      description: 'Database host (or use MYSQL_HOST env var)'
    })
    .option('dbPort', {
      type: 'number',
      default: 3306,
      description: 'Database port (default: 3306)'
    })
    .option('dbUser', {
      type: 'string',
      description: 'Database username (or use MYSQL_USER env var)'
    })
    .option('dbPassword', {
      type: 'string',
      description: 'Database password (or use MYSQL_PASSWORD env var)'
    })
    .option('dbName', {
      type: 'string',
      description: 'Database name (or use MYSQL_DATABASE env var)'
    })
    .option('full', {
      describe: 'Process all entities with complete data (customers, units, service orders)',
      type: 'boolean',
      default: false
    })
    .option('entityId', {
      describe: 'Process the specified entity ID with full data, others get basic data only',
      type: 'number',
      alias: 'entityID'
    })
    .option('vcdbPath', {
      type: 'string',
      description: 'Path to AutoCare VCdb files directory (or use AUTOCARE_VCDB_PATH env var)'
    })
    .option('pcdbPath', {
      type: 'string',
      description: 'Path to AutoCare PCdb files directory (or use AUTOCARE_PCDB_PATH env var)'
    })
    .option('enableAutocare', {
      type: 'boolean',
      default: true,
      description: 'Enable AutoCare vehicle and parts matching (default: true)'
    })
    .option('rewrite', {
      type: 'boolean',
      default: false,
      description: 'Clear output directory before processing (default: false)'
    })
    .help()
    .example('$0', 'Connect to database using environment variables')
    .example('$0 --dbHost localhost --dbUser root --dbName fullbay', 'Connect with command line options')
    .example('$0 --full', 'Process all entities with full data (production mode)')
    .example('$0', 'Demo mode - Process Simple Shop entities fully, others basic (development mode)')
    .example('$0 --vcdbPath ./autocare/vcdb --pcdbPath ./autocare/pcdb', 'Specify custom AutoCare data paths')
    .example('$0 --enableAutocare false', 'Disable AutoCare matching')
    .example('$0 --entityId 17', 'Process entity 17 with full data, others basic')
    .example('$0 --entityID 17', 'Alternative format: Process entity 17 (both --entityId and --entityID work)')
    .example('$0 --rewrite', 'Clear output directory and reprocess all entities')
    .example('$0 --full --rewrite', 'Full mode with output directory clearing')
    .argv as CliArgs;

  const startTime = Date.now();
  
  // Determine the final output path based on mode
  const baseOutputPath = path.resolve(argv.outputDir);
  const outputPath = baseOutputPath; // Output directly to output directory, no longer using denormalized-data subdirectory
  
  // Determine processing mode based on command line arguments
  const specificEntityId = argv.entityId;
  const fullMode = argv.full;
  
  let processingMode: 'demo' | 'full';
  
  if (fullMode) {
    processingMode = 'full';
  } else {
    processingMode = 'demo';
  }

  console.log('🚀 Starting Fullbay Data Denormalization Process');
  console.log('===============================================');
  
  if (fullMode) {
    console.log(`🏭 Processing Mode: FULL`);
    console.log(`📋 Full Mode Strategy:`);
    console.log(`   • All Entities: FULL processing (customers, units, service orders)`);
    console.log(`   • Use for production data exports`);
  } else if (specificEntityId) {
    console.log(`🎯 Processing Mode: ENTITY-SPECIFIC`);
    console.log(`🆔 Target Entity ID: ${specificEntityId}`);
    console.log(`📋 Entity-Specific Strategy:`);
    console.log(`   • Entity ${specificEntityId}: FULL processing (customers, units, service orders)`);
    console.log(`   • All other entities: BASIC processing (company.json only)`);
  } else {
    console.log(`🎯 Processing Mode: DEMO (Simple Shop Focus)`);
    console.log(`📋 Demo Mode Strategy:`);
    console.log(`   • Simple Shop entities: FULL processing (customers, units, service orders)`);
    console.log(`   • Other entities: BASIC processing (company.json only)`);
    console.log(`   • Use for development and testing`);
  }
  
  if (argv.rewrite) {
    console.log(`🗑️  Rewrite Mode: Will clear output directory before processing`);
  } else {
    console.log(`📁 Resume Mode: Will skip already processed entities`);
    console.log(`💡 Use --rewrite to clear and reprocess all entities`);
  }
  
  try {
    console.log(`📤 Output directory: ${outputPath}`);
    
    // Check database credentials
    const hasDbCredentials = (
      (argv.dbHost || process.env.MYSQL_HOST) &&
      (argv.dbUser || process.env.MYSQL_USER) &&
      (argv.dbName || process.env.MYSQL_DATABASE)
    );

    if (!hasDbCredentials) {
      console.error('❌ Database credentials required');
      console.error('   Set MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE environment variables');
      console.error('   Or use command line options: --dbHost, --dbUser, --dbName');
      process.exit(1);
    }

    // Setup database connection
    const useSshTunnel = process.env.SSH_TUNNEL === 'true';
    const sshTunnelPort = parseInt(process.env.SSH_TUNNEL_PORT || '55306');
    
    const dbConfig: DatabaseConfig = {
      host: useSshTunnel ? '127.0.0.1' : (argv.dbHost || process.env.MYSQL_HOST || 'localhost'),
      port: useSshTunnel ? sshTunnelPort : (argv.dbPort || 3306),
      user: argv.dbUser || process.env.MYSQL_USER || '',
      password: argv.dbPassword || process.env.MYSQL_PASSWORD || '',
      database: argv.dbName || process.env.MYSQL_DATABASE || '',
      ssl: useSshTunnel ? { rejectUnauthorized: false } : undefined
    };

    console.log('\n🔗 DATABASE CONNECTION SETUP');
    console.log('===============================');
    
    if (useSshTunnel) {
      console.log(`🔐 Connection Type: SSH Tunnel`);
      console.log(`📡 Tunnel: localhost:${sshTunnelPort} → ${process.env.MYSQL_HOST}:3306`);
      console.log(`🏠 Remote Host: ${process.env.REMOTE_HOST}`);
      console.log(`👤 Remote User: ${process.env.REMOTE_USER}`);
      console.log(`🗄️  Target Database: ${dbConfig.database}@${process.env.MYSQL_HOST}`);
      console.log('');
      console.log('💡 SSH Tunnel Requirements:');
      console.log(`   • SSH tunnel must be running on port ${sshTunnelPort}`);
      console.log(`   • Or manually: ssh -L ${sshTunnelPort}:${process.env.MYSQL_HOST}:3306 ${process.env.REMOTE_USER}@${process.env.REMOTE_HOST}`);
      console.log(`   • Tunnel is automatically managed when using pnpm gen`);
    } else {
      console.log(`🔗 Connection Type: Direct`);
      console.log(`🗄️  Database: ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
      console.log(`🔐 SSL: ${dbConfig.ssl ? 'Enabled' : 'Disabled'}`);
    }
    
    console.log('');
    console.log('🔄 Establishing connection...');
    
    const dataReader = createDatabaseDataReader(dbConfig);

    // Test database connection
    try {
      console.log('⏳ Connecting to database...');
      await dataReader.connect();
      
      console.log('✅ DATABASE CONNECTION SUCCESSFUL!');
      console.log('===================================');
      console.log(`📊 Connected to: ${dbConfig.database}`);
      console.log(`🏷️  User: ${dbConfig.user}`);
      console.log(`🌐 Host: ${dbConfig.host}:${dbConfig.port}`);
      
      // Test query
      try {
        const testQuery = await dataReader.query('SELECT 1 as test_connection, NOW() as server_time');
        console.log(`🕐 Server Time: ${testQuery[0]?.server_time || 'Unknown'}`);
        console.log(`✨ Database is ready for data processing!`);
      } catch (queryError) {
        console.log('⚠️  Connection established but query test failed:', queryError);
      }
      console.log('');
      
    } catch (error) {
      console.error('\n❌ DATABASE CONNECTION FAILED');
      console.error('==============================');
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
      
      if (useSshTunnel) {
        console.error('');
        console.error('🔍 SSH Tunnel Troubleshooting:');
        console.error('   1. Check if SSH tunnel is running:');
        console.error(`      lsof -i :${sshTunnelPort}`);
        console.error('   2. Test tunnel manually:');
        console.error(`      mysql -h 127.0.0.1 -P ${sshTunnelPort} -u ${dbConfig.user} -p ${dbConfig.database}`);
        console.error('   3. Tunnel is automatically managed when using pnpm gen');
      } else {
        console.error('');
        console.error('🔍 Direct Connection Troubleshooting:');
        console.error('   1. Check network connectivity:');
        console.error(`      ping ${dbConfig.host}`);
        console.error('   2. Check port accessibility:');
        console.error(`      telnet ${dbConfig.host} ${dbConfig.port}`);
        console.error('   3. Verify credentials and database name');
      }
      
      console.error('');
      console.error('🛑 Database connection failed');
      process.exit(1);
    }
    
    const outputManager = new OutputManager({
      baseOutputDir: outputPath,
      prettyJson: argv.prettyJson
    });

    await outputManager.initialize(argv.rewrite || false);

    // Initialize data quality tracker
    const qualityTracker = new DataQualityTracker();

    // Initialize AutoCare data loader if enabled
    if (argv.enableAutocare !== false) {
      console.log('\n🚗 AUTOCARE INITIALIZATION');
      console.log('===========================');
      
      try {
        const vcdbPathInput = argv.vcdbPath || process.env.AUTOCARE_VCDB_PATH || 
          './autocare-data/VCdb';
        const pcdbPathInput = argv.pcdbPath || process.env.AUTOCARE_PCDB_PATH || 
          './autocare-data/PCdb';
        const vcdbPath = path.resolve(vcdbPathInput);
        const pcdbPath = path.resolve(pcdbPathInput);

        console.log(`🔧 VCdb Path: ${vcdbPath}`);
        console.log(`📦 PCdb Path: ${pcdbPath}`);
        
        await ensureParquetAssets(vcdbPath, pcdbPath, outputPath);

        const autoCareLoader = new AutoCareLoader(vcdbPath, pcdbPath);
        setAutoCareLoader(autoCareLoader);
        
        // Pre-load AutoCare data to validate paths
        await autoCareLoader.loadData();
        
        console.log('✅ AutoCare data loaded successfully');
        console.log('   🚗 Vehicle and parts matching will be enabled');
        
      } catch (error) {
        console.warn('⚠️  AutoCare initialization failed:', error instanceof Error ? error.message : String(error));
        console.warn('   📄 Processing will continue without AutoCare matching');
        console.warn('   💡 To fix: Check file paths or disable with --enableAutocare false');
      }
      console.log('');
    } else {
      console.log('\n🚫 AutoCare matching disabled by configuration');
      console.log('');
    }

    // Check available tables
    const availableTables = await dataReader.getAvailableTables();
    console.log(`📋 Found ${availableTables.length} database tables`);

    // Initialize processors
    const customerProcessor = new CustomerProcessor(dataReader, outputManager, qualityTracker);
    const serviceOrderProcessor = new ServiceOrderProcessor(dataReader, outputManager, qualityTracker);
    const entityProcessor = new EntityProcessor(dataReader, outputManager, qualityTracker, customerProcessor, serviceOrderProcessor);

    // 🔍 Check if basic entity data already exists
    const basicDataExists = await outputManager.fileExists('index.json');
    
    let entities: { [entityId: number]: any } = {};
    let simpleShopEntities: Set<number> = new Set();
    
    // Helper function to process a single entity with full data (shared across all modes)
    const processEntityFull = async (entityId: number, processingType: string, checkIfProcessed: boolean = true): Promise<boolean> => {
      const entity = entities[entityId];
      if (!entity) {
        console.error(`❌ Entity ${entityId} not found in loaded entities`);
        return false;
      }

      // Check if this entity is already fully processed (optional for performance)
      if (checkIfProcessed) {
        console.log(`🔍 Checking if entity ${entityId} is fully processed...`);
        const isFullyProcessed = await outputManager.isEntityFullyProcessed(entityId.toString());
        console.log(`🔍 Entity ${entityId} isFullyProcessed result: ${isFullyProcessed}`);
        
        if (isFullyProcessed) {
          console.log(`⏭️  Entity ${entityId} is already fully processed`);
          return true;
        }
      }

      const entityName = entity.basicInfo.legalName || entity.basicInfo.title || `Entity ${entityId}`;
      const isSimpleShop = simpleShopEntities.has(entityId);
      const shopType = isSimpleShop ? '(Simple Shop)' : '(Regular Entity)';
      console.log(`\n${processingType} Processing entity ${entityId}: ${entityName} ${shopType}`);
      
      try {
        // Process customers for this entity
        console.log(`   👥 Processing customers...`);
        await customerProcessor.processCustomers(
          { [entityId]: entity }, 
          'full',
          entityId, 
          simpleShopEntities
        );
        
        // Process service orders for this entity
        console.log(`   🔧 Processing service orders...`);
        await serviceOrderProcessor.processServiceOrders(
          { [entityId]: entity }, 
          'full',
          entityId, 
          simpleShopEntities
        );
        
        // Generate index files and mark as fully processed
        console.log(`   📝 Generating index.json files and marking as complete...`);
        await outputManager.generateEntityIndexes(entityId.toString(), true);
        
        // 🔥 NEW: Auto-aggregate invoices & repair orders after entity processing
        console.log(`   📊 Auto-aggregating invoices for entity ${entityId}...`);
        try {
          const { InvoiceAggregator } = await import('./utils/InvoiceAggregator');
          const aggregator = new InvoiceAggregator(outputManager.getOutputDirectory());
          await aggregator.aggregateEntityInvoices(entityId);
          console.log(`   ✅ Invoice aggregation completed for entity ${entityId}`);
        } catch (aggError) {
          console.warn(`   ⚠️  Invoice aggregation failed for entity ${entityId}:`, aggError);
          // Don't fail the entire processing if aggregation fails
        }

        console.log(`   🧩 Auto-aggregating repair orders for entity ${entityId}...`);
        try {
          const { RepairOrderAggregator } = await import('./utils/RepairOrderAggregator');
          const roAggregator = new RepairOrderAggregator(outputManager.getOutputDirectory());
          await roAggregator.aggregateEntityRepairOrders(entityId);
          console.log(`   ✅ Repair order aggregation completed for entity ${entityId}`);
        } catch (roAggError) {
          console.warn(`   ⚠️  Repair order aggregation failed for entity ${entityId}:`, roAggError);
          // Don't fail the entire processing if aggregation fails
        }
        
        // Verify that the entity was marked as fully processed (optional)
        if (checkIfProcessed) {
          const wasMarked = await outputManager.isEntityFullyProcessed(entityId.toString());
          if (wasMarked) {
            console.log(`   ✅ Verified: Entity ${entityId} is now marked as fully processed`);
          } else {
            console.error(`   ❌ Warning: Entity ${entityId} was NOT marked as fully processed!`);
          }
        }
        
        console.log(`   ✅ Entity ${entityId} processing completed (including invoice aggregation)`);
        return true;
      } catch (error) {
        console.error(`   ❌ Error processing entity ${entityId}:`, error);
        return false;
      }
    };
    
    if (basicDataExists && !argv.rewrite) {
      console.log(`\n📋 Found existing basic entity data (index.json)`);
      console.log(`🚀 Skipping basic entity processing, loading entity list from existing data...`);
      
      try {
        // Read existing root index.json to get entity list
        const rootIndexData = JSON.parse(await outputManager.readFileContent('index.json'));
        const existingEntities = rootIndexData.entities || [];
        
        console.log(`📊 Found ${existingEntities.length} entities in existing data`);
        
        // If no entities found in existing data, fall back to database processing
        if (existingEntities.length === 0) {
          console.log(`⚠️  No entities found in existing index.json, falling back to database processing...`);
          throw new Error('Empty entities list in index.json');
        }
        
        // Convert to the expected format for compatibility and populate entitySummaries
        for (const entityData of existingEntities) {
          entities[entityData.entityId] = {
            basicInfo: {
              entityId: entityData.entityId,
              legalName: entityData.legalName || entityData.title,
              title: entityData.title,
              status: entityData.status
            }
          };
          
          // Identify simple shop entities from existing data
          if (entityData.isSimpleShop) {
            simpleShopEntities.add(entityData.entityId);
          }
          
          // 🔧 CRITICAL: Populate entitySummaries from existing entity index.json
          const entityIndexPath = `${entityData.entityId}/index.json`;
          try {
            if (await outputManager.fileExists(entityIndexPath)) {
              // Read existing entity index.json to get complete summary data
              const existingEntityIndex = JSON.parse(await outputManager.readFileContent(entityIndexPath));
              
              // Create entity directory and initialize summary with existing data
              await outputManager.createShopDirectory(entityData.entityId.toString());
              
              // Update entitySummary with existing complete data
              outputManager.updateEntityData(entityData.entityId.toString(), {
                title: existingEntityIndex.title,
                legalName: existingEntityIndex.legalName,
                status: existingEntityIndex.status,
                phone: existingEntityIndex.phone,
                email: existingEntityIndex.email,
                website: existingEntityIndex.website,
                businessType: existingEntityIndex.businessType,
                created: existingEntityIndex.created,
                active: existingEntityIndex.status === 'Active'
              });
              
              // Also populate the summary statistics from existing data
              // We need to access entitySummaries directly since there's no getter method
              const entitySummariesMap = (outputManager as any).entitySummaries;
              const entitySummary = entitySummariesMap.get(entityData.entityId.toString());
              if (entitySummary && existingEntityIndex.summary) {
                entitySummary.summary = existingEntityIndex.summary;
                entitySummary.subdirectories = existingEntityIndex.subdirectories || [];
              }
            } else {
              // Fallback to basic initialization if entity index.json doesn't exist
              await outputManager.createShopDirectory(entityData.entityId.toString());
              outputManager.updateEntityData(entityData.entityId.toString(), {
                title: entityData.title,
                legalName: entityData.legalName,
                status: entityData.status,
                phone: entityData.phone,
                email: entityData.email,
                website: entityData.website,
                businessType: entityData.businessType,
                created: entityData.created,
                active: entityData.status === 'Active'
              });
            }
          } catch (error) {
            console.warn(`⚠️  Failed to read existing index.json for entity ${entityData.entityId}, using basic data:`, error);
            await outputManager.createShopDirectory(entityData.entityId.toString());
            outputManager.updateEntityData(entityData.entityId.toString(), {
              title: entityData.title,
              legalName: entityData.legalName,
              status: entityData.status,
              active: entityData.status === 'Active'
            });
          }
        }
        
        // Set simple shop entities in output manager
        outputManager.setSimpleShopEntities(simpleShopEntities);
        
        console.log(`✅ Loaded ${Object.keys(entities).length} entities from existing data`);
        console.log(`🏪 Found ${simpleShopEntities.size} Simple Shop entities`);
        
        // Process entities based on the specified processing mode
        if (specificEntityId) {
          // Entity-Specific mode: process only the specified entity
          console.log(`\n🎯 Entity-Specific mode: Processing only specified entity ${specificEntityId}...`);
          await processEntityFull(specificEntityId, '🎯');
        } else if (processingMode === 'demo') {
          // Demo mode: process Simple Shop entities when not in Entity-Specific mode
          if (simpleShopEntities.size > 0) {
            console.log(`\n🏪 Demo mode: Processing Simple Shop entities that were skipped in basic processing...`);
            
            for (const simpleShopEntityId of simpleShopEntities) {
              await processEntityFull(simpleShopEntityId, '🏪');
            }
          }
        } else if (processingMode === 'full') {
          // Full mode: we'll process entities in the main processing loop below
          console.log(`\n🏭 Full mode: Simple Shop processing will be handled in main processing loop`);
        }
        
      } catch (error) {
        console.warn(`⚠️  Failed to read existing index.json, falling back to full processing:`, error);
        console.log(`\n🏢 Processing Entities from database...`);
        entities = await entityProcessor.processEntities(processingMode as 'demo' | 'full', specificEntityId);
        simpleShopEntities = outputManager.getSimpleShopEntities();
      }
    } else {
      if (basicDataExists && argv.rewrite) {
        console.log(`\n🗑️  Rewrite mode: Processing all entities from database (ignoring existing data)...`);
      } else {
        console.log(`\n🏢 No existing basic data found, processing entities from database...`);
      }
      
      entities = await entityProcessor.processEntities(processingMode as 'demo' | 'full', specificEntityId);
      simpleShopEntities = outputManager.getSimpleShopEntities();
    }

    if (Object.keys(entities).length === 0) {
      console.error(`❌ No entities found`);
      process.exit(1);
    }

    const entityIds = Object.keys(entities).map(id => parseInt(id)).sort((a, b) => a - b);
    
    if (basicDataExists && !argv.rewrite) {
      console.log(`\n✅ Entity data loaded from existing files and Simple Shop processing completed!`);
    } else {
      console.log(`\n✅ Entity processing completed with immediate customer/service order processing!`);
    }
    console.log(`   📊 Total entities: ${entityIds.length}`);
    console.log(`   🏪 Simple Shop entities: ${simpleShopEntities.size}`);
    console.log(`   ⚡ Other entities: ${entityIds.length - simpleShopEntities.size}`);
    
    // Process remaining entities that need customer/service order processing
    // Only process Active entities for full data processing
    const remainingEntitiesToProcess: number[] = [];
    
    if (specificEntityId) {
      // Entity-Specific mode: specified entity already processed above, no additional processing needed
      console.log(`📋 Entity-Specific mode: Specified entity ${specificEntityId} already processed, no additional entities needed`);
    } else if (processingMode === 'full') {
      // Full mode: process ALL Active entities (including Simple Shop entities)
      // But skip entities that are already fully processed
      console.log(`🔍 Full mode: Filtering Active entities and checking processing status...`);
      
      const activeEntityIds = [];
      let skippedAlreadyProcessed = 0;
      
      for (const id of entityIds) {
        const entity = entities[id];
        if (!entity || entity.basicInfo.status !== 'Active') continue;
        
        // Check if already fully processed
        const isFullyProcessed = await outputManager.isEntityFullyProcessed(id.toString());
        if (isFullyProcessed) {
          skippedAlreadyProcessed++;
          continue;
        }
        
        activeEntityIds.push(id);
      }
      
      remainingEntitiesToProcess.push(...activeEntityIds);
      
      const skippedNonActive = entityIds.filter(id => {
        const entity = entities[id];
        return entity && entity.basicInfo.status !== 'Active';
      }).length;
      
      console.log(`📋 Full mode: Processing ${activeEntityIds.length} Active entities that need processing`);
      console.log(`   ⏭️  Skipped ${skippedAlreadyProcessed} already processed entities`);
      console.log(`   ⏭️  Skipped ${skippedNonActive} non-Active entities (basic data only)`);
    } else if (processingMode === 'demo') {
      // Demo mode: Simple Shop entities are already processed above
      // No additional entities need processing in demo mode
      console.log(`📋 Demo mode: Simple Shop entities already processed, no additional entities needed`);
    }
    
    // Process remaining entities using the shared helper function
    for (const entityId of remainingEntitiesToProcess) {
      const isTargetEntity = specificEntityId === entityId;
      const processingReason = isTargetEntity ? '🎯 TARGET ENTITY' : '🏭 FULL MODE';
      await processEntityFull(entityId, processingReason, false); // Skip check since we already filtered above
    }
    
    console.log(`\n✅ All entity processing completed!`);
    
    // Calculate statistics
    const totalEntities = entityIds.length;
    const activeEntities = entityIds.filter(id => {
      const entity = entities[id];
      return entity && entity.basicInfo.status === 'Active';
    }).length;
    const nonActiveEntities = totalEntities - activeEntities;
    
    console.log(`   📊 Total entities: ${totalEntities}`);
    console.log(`   🟢 Active entities: ${activeEntities} (full processing)`);
    console.log(`   ⚪ Non-Active entities: ${nonActiveEntities} (basic data only)`);
    console.log(`   🏪 Simple Shops: ${simpleShopEntities.size} (already filtered for active status)`);
    console.log(`   🎯 Additional Active entities: ${remainingEntitiesToProcess.length} (processed separately)`);

    // AutoCare statistics are now updated immediately when each entity is processed
    // No need for batch updating - removed to improve real-time performance

    // 🔧 FIX: Only finalize index files if we processed basic entity data
    // If we skipped basic processing (index.json already exists), don't regenerate it
    if (!basicDataExists || argv.rewrite) {
      console.log('\n📋 Finalizing index files...');
      await outputManager.finalizeAndWriteIndexes();
    } else {
      console.log('\n⏭️  Skipping index.json regeneration (using existing data to preserve all entities)');
    }

    // Clean up data reader
    await dataReader.close();

    // Generate data quality report
    console.log(qualityTracker.generateReport());

    // Generate processing summary
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    const qualityReport = qualityTracker.getQualityReport();
    
    const summary = {
      processingTimeMs: processingTime,
      processingTimeFormatted: formatDuration(processingTime),
      entitiesProcessed: Object.keys(entities).length,
      dataSourceType: 'database',
      availableTables: availableTables.length,
      outputDirectory: outputManager.getOutputDirectory(),
      timestamp: new Date().toISOString(),
      dataQuality: {
        totalRecords: qualityReport.summary.totalRecords,
        successRate: qualityReport.summary.overallSuccessRate,
        totalIssues: qualityReport.summary.totalIssues,
        entityStats: qualityReport.entityStats
      },
      success: true
    };

    await outputManager.writeSummary(summary);

    console.log('\n✅ Data denormalization completed successfully!');
    console.log('===============================================');
    console.log(`📊 Entities processed: ${summary.entitiesProcessed}`);
    console.log(`⏱️  Processing time: ${summary.processingTimeFormatted}`);
    console.log(`📁 Output location: ${summary.outputDirectory}`);

  } catch (error) {
    console.error('\n❌ Error during processing:', error);
    
    const summary = {
      processingTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
      success: false
    };

    try {
      const outputManager = new OutputManager({
        baseOutputDir: path.resolve(argv.outputDir),
        prettyJson: argv.prettyJson
      });
      await outputManager.initialize(argv.rewrite || false);
      await outputManager.writeSummary(summary);
    } catch (summaryError) {
      console.error('Failed to write error summary:', summaryError);
    }

    process.exit(1);
  }
}

const REQUIRED_PARQUET_FILES = [
  'VCdb.parquet',
  'VCdb_keys.parquet',
  'PCdb.parquet',
  'PCdb_enriched.parquet',
  'PCdb_tokens.parquet'
];

async function ensureParquetAssets(vcdbPath: string, pcdbPath: string, outputDir: string): Promise<void> {
  const resolvedOutput = path.resolve(outputDir);
  const missing = REQUIRED_PARQUET_FILES
    .map(fileName => ({ fileName, filePath: path.join(resolvedOutput, fileName) }))
    .filter(({ filePath }) => !fs.existsSync(filePath));

  if (missing.length === 0) {
    console.log('🦆 AutoCare Parquet assets already present');
    return;
  }

  console.log('🦆 AutoCare Parquet assets missing, rebuilding...');
  missing.forEach(({ fileName }) => console.log(`   • ${fileName}`));

  const buildScript = path.resolve(__dirname, '../scripts/build-parquet.js');

  try {
    await runParquetBuild(buildScript, vcdbPath, pcdbPath, resolvedOutput);
    console.log('✅ AutoCare Parquet assets rebuilt successfully');
  } catch (error) {
    console.warn('⚠️  Failed to rebuild AutoCare Parquet assets:', error instanceof Error ? error.message : String(error));
    console.warn('   Parquet-backed matching will remain disabled until assets are generated');
  }
}

function runParquetBuild(buildScript: string, vcdbPath: string, pcdbPath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      buildScript,
      '--vcdb',
      vcdbPath,
      '--pcdb',
      pcdbPath,
      '--out',
      outputDir
    ];

    const child = spawn(process.execPath, args, { stdio: 'inherit' });

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`build-parquet exited with code ${code}`));
      }
    });
  });
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

// Run the application
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
