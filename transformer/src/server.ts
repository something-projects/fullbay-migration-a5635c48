#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import * as net from 'net';
const { createTunnel } = require('tunnel-ssh');
import { createDatabaseDataReader } from './utils/DataSource';
import { DatabaseConfig } from './utils/DatabaseConnection';
import { OutputManager } from './utils/OutputManager';
import { DataQualityTracker } from './utils/DataQualityTracker';
import { EntityProcessor } from './processors/EntityProcessor';
import { CustomerProcessor } from './processors/CustomerProcessor';
import { ServiceOrderProcessor } from './processors/ServiceOrderProcessor';
import { AutoCareLoader, setAutoCareLoader } from './utils/AutoCareLoader';
import { VehicleMatcher } from './services/VehicleMatcher';
import { PartsMatcher } from './services/PartsMatcher';

// Load environment variables
dotenv.config();

// SSH Tunnel interfaces
interface SSHTunnelConfig {
  remoteHost: string;
  remoteUser: string;
  remotePassword?: string;
  localPort: number;
  remoteDbHost: string;
  remoteDbPort: number;
}

interface TunnelInfo {
  server: any;
  client: any;
  actualPort: number;
  createdByUs: boolean;
}

interface ServerConfig {
  port: number;
  outputDir: string;
  prettyJson: boolean;
}

class TransformerServer {
  private app: express.Application;
  private config: ServerConfig;
  private dataReader: any;
  private outputManager!: OutputManager;
  private qualityTracker!: DataQualityTracker;
  private entityProcessor!: EntityProcessor;
  private customerProcessor!: CustomerProcessor;
  private serviceOrderProcessor!: ServiceOrderProcessor;
  private isInitialized = false;
  private tunnel: TunnelInfo | null = null;
  private serverInstance: any = null;
  private serverResolve: (() => void) | null = null;

  // 🚗 Matching services
  private vehicleMatcher: VehicleMatcher | null = null;
  private partsMatcher: PartsMatcher | null = null;

  // 🔒 Request queue management
  private isProcessing = false;
  private requestQueue: Array<{
    entityId: number;
    resolve: (value: any) => void;
    reject: (error: any) => void;
    startTime: number;
  }> = [];

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        initialized: this.isInitialized,
        services: {
          database: this.isInitialized ? 'connected' : 'not initialized',
          vehicleMatcher: this.vehicleMatcher ? 'ready' : 'not initialized',
          partsMatcher: this.partsMatcher ? 'ready' : 'not initialized'
        },
        timestamp: new Date().toISOString()
      });
    });

    // ===== 🚗 Vehicle Matching API =====

    // Single vehicle matching
    this.app.post('/api/match/vehicle', async (req, res) => {
      try {
        const { make, model, year, vin } = req.body;

        if (!make || !model) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'make and model are required'
          });
        }

        if (!year && !vin) {
          return res.status(400).json({
            error: 'Missing required fields',
            message: 'Either year or vin is required for matching'
          });
        }

        if (!this.vehicleMatcher) {
          return res.status(503).json({
            error: 'Vehicle matcher not available',
            message: 'Vehicle matching service is not initialized'
          });
        }

        // matchVehicle(make, model, year, subModel, engineInfo, transmissionInfo, bodyInfo, vin, entityId)
        const result = await this.vehicleMatcher.matchVehicle(
          make, model, year,
          undefined, // subModel
          undefined, // engineInfo
          undefined, // transmissionInfo
          undefined, // bodyInfo
          vin,       // vin
          undefined  // entityId
        );

        res.json({
          success: true,
          matched: result.matched,
          standardizedVehicle: result.standardizedVehicle,
          attemptedMethods: result.attemptedMethods || [],
          confidence: result.standardizedVehicle?.confidence || 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Vehicle matching error:', error);
        res.status(500).json({
          error: 'Vehicle matching failed',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Batch vehicle matching
    this.app.post('/api/match/vehicles/batch', async (req, res) => {
      try {
        const { vehicles } = req.body;

        if (!Array.isArray(vehicles)) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'vehicles array is required'
          });
        }

        if (!this.vehicleMatcher) {
          return res.status(503).json({
            error: 'Vehicle matcher not available',
            message: 'Vehicle matching service is not initialized'
          });
        }

        const results = await this.vehicleMatcher.batchMatchVehicles(vehicles);

        res.json({
          success: true,
          results: Array.from<[string, any]>(results.entries()).map(([id, result]) => ({
            id,
            ...result
          })),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Batch vehicle matching error:', error);
        res.status(500).json({
          error: 'Batch matching failed',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // ===== 🔧 Parts Matching API =====

    // Single part matching
    this.app.post('/api/match/part', async (req, res) => {
      try {
        const { partNumber, description, category } = req.body;

        if (!partNumber) {
          return res.status(400).json({
            error: 'Missing required field',
            message: 'partNumber is required'
          });
        }

        if (!this.partsMatcher) {
          return res.status(503).json({
            error: 'Parts matcher not available',
            message: 'Parts matching service is not initialized'
          });
        }

        const result = await this.partsMatcher.matchPart(
          partNumber,
          description,
          category
        );

        res.json({
          success: true,
          matched: result.matched,
          standardizedPart: result.standardizedPart,
          confidence: result.standardizedPart?.confidence || 0,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Part matching error:', error);
        res.status(500).json({
          error: 'Part matching failed',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Batch parts matching
    this.app.post('/api/match/parts/batch', async (req, res) => {
      try {
        const { parts } = req.body;

        if (!Array.isArray(parts)) {
          return res.status(400).json({
            error: 'Invalid request',
            message: 'parts array is required'
          });
        }

        if (!this.partsMatcher) {
          return res.status(503).json({
            error: 'Parts matcher not available',
            message: 'Parts matching service is not initialized'
          });
        }

        const results = await this.partsMatcher.batchMatchParts(parts);

        res.json({
          success: true,
          results: Array.from<[string, any]>(results.entries()).map(([id, result]) => ({
            id,
            ...result
          })),
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Batch part matching error:', error);
        res.status(500).json({
          error: 'Batch matching failed',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Process single entity endpoint with queue management
    this.app.post('/process-entity/:entityId', async (req, res) => {
      try {
        const entityId = parseInt(req.params.entityId);
        
        if (isNaN(entityId)) {
          return res.status(400).json({ 
            error: 'Invalid entity ID', 
            message: 'Entity ID must be a valid number' 
          });
        }

        if (!this.isInitialized) {
          return res.status(503).json({ 
            error: 'Server not initialized', 
            message: 'Database connection and processors are not ready' 
          });
        }

        // Add request to queue and wait for processing
        const result = await this.queueEntityProcessing(entityId);
        
        res.json({
          success: true,
          entityId,
          duration: result.duration,
          result: result.data,
          queuePosition: result.queuePosition,
          waitTime: result.waitTime,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ Error processing entity ${req.params.entityId}:`, error);
        
        res.status(500).json({
          error: 'Processing failed',
          message: error instanceof Error ? error.message : String(error),
          entityId: req.params.entityId
        });
      }
    });

    // Get entity status endpoint
    this.app.get('/entity-status/:entityId', async (req, res) => {
      try {
        const entityId = parseInt(req.params.entityId);
        
        if (isNaN(entityId)) {
          return res.status(400).json({ 
            error: 'Invalid entity ID', 
            message: 'Entity ID must be a valid number' 
          });
        }

        const status = await this.getEntityStatus(entityId);
        
        res.json({
          entityId,
          status,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error(`❌ Error getting entity status ${req.params.entityId}:`, error);
        
        res.status(500).json({
          error: 'Status check failed',
          message: error instanceof Error ? error.message : String(error),
          entityId: req.params.entityId
        });
      }
    });

    // List all entities endpoint
    this.app.get('/entities', async (req, res) => {
      try {
        if (!this.isInitialized) {
          return res.status(503).json({ 
            error: 'Server not initialized', 
            message: 'Database connection and processors are not ready' 
          });
        }

        const entities = await this.listAllEntities();
        
        res.json({
          entities,
          count: entities.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Error listing entities:', error);
        
        res.status(500).json({
          error: 'Failed to list entities',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Queue status endpoint
    this.app.get('/queue-status', (req, res) => {
      res.json({
        isProcessing: this.isProcessing,
        queueLength: this.requestQueue.length,
        queuedEntities: this.requestQueue.map((req, index) => ({
          position: index + 1,
          entityId: req.entityId,
          waitTime: Date.now() - req.startTime,
          queuedAt: new Date(req.startTime).toISOString()
        })),
        timestamp: new Date().toISOString()
      });
    });
  }

  private async processEntityFull(entityId: number) {
    console.log(`🏢 Processing entity ${entityId} with full data...`);
    
    // Process entity with FULL data so that downstream aggregators run
    const entities = await this.entityProcessor.processEntities('full', entityId);
    
    const entity = entities[entityId];
    if (!entity) {
      throw new Error(`Entity ${entityId} not found in database`);
    }

    // Create a mock entity object for processing
    const mockEntity = {
      basicInfo: {
        entityId: entityId,
        title: `Entity ${entityId}`,
        legalName: `Entity ${entityId}`,
        status: 'Active'
      }
    };
    
    // Process customers and service orders for this entity
    console.log(`👥 Processing customers for entity ${entityId}...`);
    await this.customerProcessor.processCustomers({ [entityId]: mockEntity as any }, 'full', entityId);
    
    console.log(`🔧 Processing service orders for entity ${entityId}...`);
    await this.serviceOrderProcessor.processServiceOrders({ [entityId]: mockEntity as any }, 'full', entityId);
    
    // Generate index.json for the entity and mark as fully processed
    console.log(`📋 Generating index.json for entity ${entityId} and marking as complete...`);
    await this.outputManager.generateEntityIndexes(entityId.toString(), true);
    
    return {
      entityId,
      entityName: entity.basicInfo.legalName || entity.basicInfo.title || `Entity ${entityId}`,
      processed: true,
      hasIndex: true
    };
  }

  private async getEntityStatus(entityId: number) {
    const entityPath = this.outputManager.getEntityPath(entityId.toString());
    const indexPath = `${entityPath}/index.json`;
    
    const hasEntityJson = await this.outputManager.fileExists(`${entityPath}/entity.json`);
    const hasIndex = await this.outputManager.fileExists(indexPath);
    
    let indexData = null;
    if (hasIndex) {
      try {
        indexData = await this.outputManager.readJsonFile(indexPath);
      } catch (error) {
        console.warn(`Failed to read index.json for entity ${entityId}:`, error);
      }
    }
    
    return {
      exists: hasEntityJson,
      hasIndex,
      hasFullData: hasIndex && indexData?.summary,
      summary: indexData?.summary || null,
      lastUpdated: indexData?.lastUpdated || null
    };
  }

  private async listAllEntities() {
    const query = 'SELECT id, title, legal_name, active FROM Entity ORDER BY id';
    const entities = await this.dataReader.query(query);
    
    const result = [];
    for (const entity of entities) {
      const status = await this.getEntityStatus(entity.id);
      result.push({
        id: entity.id,
        title: entity.title,
        legalName: entity.legal_name,
        active: entity.active,
        ...status
      });
    }
    
    return result;
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * 🔒 Queue entity processing to prevent concurrent database access
   */
  private async queueEntityProcessing(entityId: number): Promise<{
    data: any;
    duration: number;
    queuePosition: number;
    waitTime: number;
  }> {
    const requestStartTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // Add to queue
      const queuePosition = this.requestQueue.length + 1;
      this.requestQueue.push({
        entityId,
        resolve,
        reject,
        startTime: requestStartTime
      });
      
      console.log(`📋 Entity ${entityId} added to queue (position: ${queuePosition}, queue size: ${this.requestQueue.length})`);
      
      // Process queue if not already processing
      this.processQueue();
    });
  }

  /**
   * 🔄 Process the request queue one by one
   */
  private async processQueue(): Promise<void> {
    // If already processing or queue is empty, return
    if (this.isProcessing || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift()!;
      const waitTime = Date.now() - request.startTime;
      
      console.log(`🎯 Processing entity ${request.entityId} (waited ${this.formatDuration(waitTime)}, ${this.requestQueue.length} remaining in queue)`);
      
      try {
        const processingStartTime = Date.now();
        
        // Process the entity
        const result = await this.processEntityFull(request.entityId);
        
        const processingDuration = Date.now() - processingStartTime;
        const totalDuration = Date.now() - request.startTime;
        
        console.log(`✅ Entity ${request.entityId} processing completed in ${this.formatDuration(processingDuration)} (total: ${this.formatDuration(totalDuration)})`);
        
        // Resolve the promise
        request.resolve({
          data: result,
          duration: processingDuration,
          queuePosition: 1, // Was first in queue when processed
          waitTime: waitTime
        });
        
      } catch (error) {
        console.error(`❌ Error processing entity ${request.entityId}:`, error);
        request.reject(error);
      }
      
      // Small delay between requests to prevent overwhelming the database
      if (this.requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    this.isProcessing = false;
    console.log(`✅ Queue processing completed. Queue is now empty.`);
  }

  // SSH Tunnel Management Methods
  private getSSHTunnelConfig(): SSHTunnelConfig {
    const remoteHost = process.env.REMOTE_HOST;
    const remoteUser = process.env.REMOTE_USER;
    const remotePassword = process.env.SSH_PASSWORD;
    const localPort = process.env.SSH_TUNNEL_PORT ? parseInt(process.env.SSH_TUNNEL_PORT) : 55306;
    const remoteDbHost = process.env.MYSQL_HOST;
    const remoteDbPort = 3306;

    if (!remoteHost || !remoteUser || !remoteDbHost) {
      throw new Error(
        'Missing required SSH tunnel configuration. Please set: ' +
        'REMOTE_HOST, REMOTE_USER, MYSQL_HOST environment variables'
      );
    }

    return {
      remoteHost,
      remoteUser,
      remotePassword,
      localPort,
      remoteDbHost,
      remoteDbPort
    };
  }

  private async checkTunnelStatus(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(3000); // 3 second timeout
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true); // Port is open, tunnel likely exists
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false); // Port is not responding
      });
      
      socket.on('error', () => {
        socket.destroy();
        resolve(false); // Port is not accessible
      });
      
      socket.connect(port, '127.0.0.1');
    });
  }

  private async testDatabaseConnection(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const mysql = require('mysql2');
        
        const connection = mysql.createConnection({
          host: '127.0.0.1',
          port: port,
          user: process.env.MYSQL_USER,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE,
          connectTimeout: 5000,
          acquireTimeout: 5000,
          timeout: 5000
        });

        connection.connect((err: any) => {
          if (err) {
            connection.destroy();
            console.log(`🚫 Database connection failed: ${err.message}`);
            resolve(false);
            return;
          }
          
          // Test with a simple query
          connection.query('SELECT 1', (queryErr: any) => {
            connection.end();
            if (queryErr) {
              console.log(`🚫 Database query failed: ${queryErr.message}`);
              resolve(false);
            } else {
              console.log('✅ Database connection test successful');
              resolve(true);
            }
          });
        });
      } catch (error: any) {
        console.log(`🚫 Database test error: ${error.message}`);
        resolve(false);
      }
    });
  }

  private async createSSHTunnel(config: SSHTunnelConfig): Promise<TunnelInfo> {
    console.log('🔐 Creating SSH tunnel...');
    console.log(`📡 Connecting to: ${config.remoteUser}@${config.remoteHost}`);
    console.log(`🗄️  Target database: ${config.remoteDbHost}:${config.remoteDbPort}`);

    try {
      // SSH connection options
      const sshOptions: any = {
        host: config.remoteHost,
        port: 22,
        username: config.remoteUser,
        password: config.remotePassword,
        // Connection settings for stability
        readyTimeout: 20000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3
      };

      // Remove undefined values
      Object.keys(sshOptions).forEach(key => {
        if (sshOptions[key] === undefined) {
          delete sshOptions[key];
        }
      });

      // Tunnel options
         const tunnelOptions = {
           username: config.remoteUser,
           password: config.remotePassword,
           host: config.remoteHost,
           port: 22, // SSH port
           dstHost: config.remoteDbHost,
           dstPort: config.remoteDbPort,
           localHost: '127.0.0.1',
           localPort: config.localPort,
           keepAlive: true,
           readyTimeout: 30000,
           forwardTimeout: 30000,
           autoClose: false,
           reconnectOnError: true
         };

      // Server options
      const serverOptions = {
        port: config.localPort,
        host: '127.0.0.1'
      };

      // Forward options
      const forwardOptions = {
        dstAddr: config.remoteDbHost,
        dstPort: config.remoteDbPort
      };

      console.log('⏳ Establishing SSH connection and tunnel...');
      
      // Create the tunnel
      const [server, client] = await createTunnel(
        { autoClose: false }, // tunnel options
        serverOptions, 
        sshOptions, 
        forwardOptions
      );

      const actualPort = (server.address() as any)?.port || config.localPort;

      console.log('✅ SSH tunnel established successfully!');
      console.log(`📍 Local tunnel endpoint: 127.0.0.1:${actualPort}`);
      console.log(`🎯 Remote database: ${config.remoteDbHost}:${config.remoteDbPort}`);

      return { server, client, actualPort, createdByUs: true };

    } catch (error: any) {
      console.error('❌ Failed to create SSH tunnel:', error);
      throw new Error(`SSH tunnel creation failed: ${error.message}`);
    }
  }

  private async ensureSSHTunnel(config: SSHTunnelConfig): Promise<TunnelInfo> {
    console.log('🔍 Checking for existing SSH tunnel...');
    
    // First check if the port is already in use
    const portOpen = await this.checkTunnelStatus(config.localPort);
    
    if (portOpen) {
      console.log(`📡 Found active connection on port ${config.localPort}`);
      
      // Test if we can actually connect to the database through this port
      console.log('🧪 Testing database connectivity through existing tunnel...');
      const dbConnectable = await this.testDatabaseConnection(config.localPort);
      
      if (dbConnectable) {
        console.log('✅ Existing SSH tunnel is working properly!');
        console.log(`📍 Using existing tunnel: 127.0.0.1:${config.localPort}`);
        return { 
          server: null, 
          client: null, 
          actualPort: config.localPort, 
          createdByUs: false 
        };
      } else {
        console.log('⚠️  Port is occupied but database is not accessible');
        console.log('🔄 Will attempt to create new tunnel...');
      }
    } else {
      console.log(`📭 No active tunnel found on port ${config.localPort}`);
    }
    
    // Create new tunnel since existing one doesn't work or doesn't exist
    return await this.createSSHTunnel(config);
  }

  private async cleanupTunnel(): Promise<void> {
    if (this.tunnel && this.tunnel.createdByUs) {
      console.log('🔄 Closing SSH tunnel (created by this server)...');
      
      try {
        if (this.tunnel.server) {
          this.tunnel.server.close();
          console.log('✅ Tunnel server closed');
        }

        if (this.tunnel.client) {
          this.tunnel.client.end();
          console.log('✅ SSH client closed');
        }

        console.log('✅ SSH tunnel closed successfully');
      } catch (error: any) {
        console.error('⚠️  Error while closing tunnel:', error);
        // Force close
        try {
          if (this.tunnel.server) this.tunnel.server.unref();
          if (this.tunnel.client) this.tunnel.client.destroy();
        } catch (e) {}
      }
    } else if (this.tunnel && !this.tunnel.createdByUs) {
      console.log('🔄 Leaving existing SSH tunnel open (not created by this server)');
    }
    this.tunnel = null;
  }

  async initialize() {
    console.log('🚀 Initializing Transformer Server');
    console.log('==================================');

    try {
      // Check if SSH tunnel is needed
      const useSshTunnel = process.env.SSH_TUNNEL === 'true';

      if (useSshTunnel) {
        console.log('🔐 Setting up SSH tunnel...');
        const tunnelConfig = this.getSSHTunnelConfig();
        this.tunnel = await this.ensureSSHTunnel(tunnelConfig);
        console.log('✅ SSH tunnel ready');
      } else {
        console.log('🔗 Using direct database connection (no SSH tunnel)');
        console.log(`📍 Database host: ${process.env.MYSQL_HOST}`);
        this.tunnel = null;
      }

      console.log('📊 Setting up data quality tracker...');
      this.qualityTracker = new DataQualityTracker();

      console.log('📁 Setting up output manager...');
      this.outputManager = new OutputManager({
          baseOutputDir: this.config.outputDir,
          prettyJson: this.config.prettyJson
        });

      console.log('🔌 Setting up database connection...');
      const dbConfig: DatabaseConfig = {
        host: useSshTunnel ? '127.0.0.1' : (process.env.MYSQL_HOST || 'localhost'),
        port: useSshTunnel ? this.tunnel!.actualPort : 3306,
        user: process.env.MYSQL_USER!,
        password: process.env.MYSQL_PASSWORD!,
        database: process.env.MYSQL_DATABASE!,
      };

      console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
      console.log(`   Database: ${dbConfig.database}`);
      console.log(`   User: ${dbConfig.user}`);

      this.dataReader = createDatabaseDataReader(dbConfig);
      await this.dataReader.connect();
      
      console.log('🏭 Setting up processors...');
      this.entityProcessor = new EntityProcessor(this.dataReader, this.outputManager, this.qualityTracker);
      this.customerProcessor = new CustomerProcessor(this.dataReader, this.outputManager, this.qualityTracker);
      this.serviceOrderProcessor = new ServiceOrderProcessor(this.dataReader, this.outputManager, this.qualityTracker);
      
      console.log('🔧 Loading AutoCare data...');
      // Align defaults with CLI: fallback to ./autocare-data/* when env not set
      const vcdbPath = process.env.AUTOCARE_VCDB_PATH || './autocare-data/VCdb';
      const pcdbPath = process.env.AUTOCARE_PCDB_PATH || './autocare-data/PCdb';
      let autoCareLoader: AutoCareLoader;
      try {
        autoCareLoader = new AutoCareLoader(vcdbPath, pcdbPath);
        await autoCareLoader.loadData();
        setAutoCareLoader(autoCareLoader);
      } catch (e: any) {
        console.warn('⚠️  AutoCare data load failed, continuing without AutoCare matching:', e?.message || e);
        autoCareLoader = new AutoCareLoader('', '');
        await autoCareLoader.loadData();
        setAutoCareLoader(autoCareLoader);
      }

      // Initialize matching services
      console.log('🚗 Initializing vehicle and parts matching services...');
      const matchingStartTime = Date.now();
      try {
        const autoCareData = autoCareLoader.getData();

        this.vehicleMatcher = new VehicleMatcher(autoCareData, {
          enableFuzzyMatch: true,
          enableYearRange: true,
          enableCache: true
        });

        // Enable Parquet index for enhanced SubModel matching
        await this.vehicleMatcher.enableParquetIndex(process.env.OUTPUT_DIR || '/app/output');

        this.partsMatcher = new PartsMatcher(autoCareData);

        const matchingDuration = Date.now() - matchingStartTime;
        console.log(`✅ Matching services initialized (${matchingDuration}ms)`);
        console.log(`   Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
      } catch (error: any) {
        console.warn('⚠️  Matching services initialization failed:', error?.message || error);
        console.warn('   Matching API endpoints will be unavailable');
      }

      this.isInitialized = true;
      console.log('✅ Transformer Server initialized successfully!');
      
    } catch (error: any) {
      console.error('❌ Failed to initialize server:', error);
      // Clean up tunnel on initialization failure
      await this.cleanupTunnel();
      throw error;
    }
  }

  async start() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    return new Promise<void>((resolve, reject) => {
      const server = this.app.listen(this.config.port, () => {
        console.log('');
        console.log('🌐 TRANSFORMER SERVER STARTED');
        console.log('==============================');
        console.log(`🚀 Server running on port ${this.config.port}`);
        console.log(`📤 Output directory: ${this.config.outputDir}`);
        console.log('');
        console.log('📋 Available endpoints:');
        console.log(`   GET  /health                     - Health check`);
        console.log(`   GET  /entities                   - List all entities with status`);
        console.log(`   GET  /entity-status/:entityId    - Get entity processing status`);
        console.log(`   GET  /queue-status               - Get processing queue status`);
        console.log(`   POST /process-entity/:entityId   - Process entity with full data (queued)`);
        console.log(`   POST /api/match/vehicle          - Match single vehicle`);
        console.log(`   POST /api/match/vehicles/batch   - Match multiple vehicles`);
        console.log(`   POST /api/match/part             - Match single part`);
        console.log(`   POST /api/match/parts/batch      - Match multiple parts`);
        console.log('');
        console.log(`💡 Process: curl -X POST http://localhost:${this.config.port}/process-entity/123`);
        console.log(`💡 Match:   curl -X POST http://localhost:${this.config.port}/api/match/vehicle -H "Content-Type: application/json" -d '{"make":"Ford","model":"F-150","year":2022}'`);
        console.log('');
        
        // Don't resolve immediately - keep the server running
        // The promise will only resolve when the server is explicitly stopped
      });
      
      // Store server instance for graceful shutdown
      this.serverInstance = server;
      
      server.on('error', (error) => {
        reject(error);
      });
      
      // Store the resolve function to call it later during shutdown
      this.serverResolve = resolve;
    });
  }

  async stop() {
    console.log('🛑 Stopping server...');
    
    try {
      // Close HTTP server
      if (this.serverInstance) {
        await new Promise<void>((resolve) => {
          this.serverInstance.close(() => {
            console.log('✅ HTTP server closed');
            resolve();
          });
        });
      }
      
      // Clean up SSH tunnel
      await this.cleanupTunnel();
      
      // Close database connection if exists
      if (this.dataReader && this.dataReader.disconnect) {
        await this.dataReader.disconnect();
        console.log('✅ Database connection closed');
      }
      
      // Resolve the start promise to allow the main function to exit
      if (this.serverResolve) {
        this.serverResolve();
      }
      
      console.log('✅ Server stopped successfully');
    } catch (error: any) {
      console.error('⚠️  Error during server shutdown:', error);
    }
  }
}

// CLI interface for server mode
async function main() {
  const config: ServerConfig = {
    port: 3001,
    outputDir: process.env.OUTPUT_DIR || '../output',
    prettyJson: process.env.PRETTY_JSON === 'true'
  };
  
  const server = new TransformerServer(config);
  
  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);
    try {
      await server.stop();
      console.log('🎉 Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };
  
  // Register signal handlers
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Termination signal
  process.on('uncaughtException', async (error) => {
    console.error('💥 Uncaught Exception:', error);
    await server.stop();
    process.exit(1);
  });
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    await server.stop();
    process.exit(1);
  });
  
  try {
    await server.start();
    // Keep the process running until a signal is received
    // Create a promise that never resolves to keep the process alive
    await new Promise<void>(() => {
      // This promise will never resolve, keeping the process running
      // until a signal handler calls process.exit()
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    await server.stop();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('❌ Server startup failed:', error);
    process.exit(1);
  });
}

export { TransformerServer };
