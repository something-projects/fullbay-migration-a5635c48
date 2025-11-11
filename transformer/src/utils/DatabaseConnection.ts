import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  ssl?: mysql.SslOptions;
  connectionLimit?: number;
  timeout?: number;
  cacheDir?: string;
}

interface CacheEntry {
  data: any[];
  timestamp: number;
  ttl: number;
}

export class DatabaseConnection {
  private pool: mysql.Pool | null = null;
  private config: DatabaseConfig;
  private memoryCache: Map<string, CacheEntry> = new Map();

  constructor(config: DatabaseConfig) {
    this.config = {
      connectionLimit: 50, // Increased default connection limit
      timeout: 60000,
      cacheDir: path.join(process.cwd(), 'cache'),
      ...config
    };
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.config.cacheDir!)) {
      fs.mkdirSync(this.config.cacheDir!, { recursive: true });
    }
  }

  /**
   * Initialize the database connection pool
   */
  async connect(): Promise<void> {
    if (this.pool) {
      return;
    }

    try {
      const poolConfig = {
        host: this.config.host,
        port: this.config.port || 3306,
        user: this.config.user,
        password: this.config.password,
        database: this.config.database,
        connectionLimit: this.config.connectionLimit || 50,
        // Connection settings optimized for stability and EntityUnitType aggregation
        connectTimeout: 90000,
        acquireTimeout: 90000,
        timeout: 90000,
        queueLimit: 200, // Increased queue limit to handle more concurrent queries
        // Minimal MySQL settings to avoid compatibility issues
        supportBigNumbers: true,
        bigNumberStrings: false,
        dateStrings: false,
        multipleStatements: false,
        typeCast: true
      } as any;

      // Add SSL configuration if provided
      if (this.config.ssl) {
        poolConfig.ssl = this.config.ssl;
      }

      this.pool = mysql.createPool(poolConfig);

      console.log('✅ Database connection pool created');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Execute a SQL query
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      // Use query instead of execute to avoid the MySQL2 bug
      const [rows] = await this.pool.query(sql, params);
      return rows as T[];
    } catch (error) {
      console.error(`❌ Query failed: ${sql}`, error);
      throw error;
    }
  }

  /**
   * Execute a query with pagination
   */
  async queryWithPagination<T = any>(
    sql: string, 
    params: any[] = [], 
    batchSize: number = 10000
  ): Promise<T[]> {
    let allResults: T[] = [];
    let offset = 0;

    while (true) {
      const paginatedSql = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
      const batch = await this.query<T>(paginatedSql, params);
      
      if (batch.length === 0) break;
      
      allResults = allResults.concat(batch);
      offset += batchSize;
      
      console.log(`📄 Loaded ${allResults.length} records so far...`);
    }

    return allResults;
  }

  /**
   * Generate a cache key from SQL query and parameters
   */
  private getCacheKey(sql: string, params: any[] = []): string {
    // Extract table name from SQL query for readable cache filenames
    const tableMatch = sql.match(/FROM\s+`?([^`\s]+)`?/i);
    const tableName = tableMatch ? tableMatch[1] : 'unknown';
    
    // Create readable filename with table name and parameter hash
    const paramStr = params.length > 0 ? JSON.stringify(params) : '';
    const paramHash = paramStr ? `_${Buffer.from(paramStr).toString('base64').substring(0, 8).replace(/[/+=]/g, '_')}` : '';
    
    // Include query type for better identification
    const queryType = sql.trim().toLowerCase().startsWith('select count') ? 'count' : 
                     sql.includes('WHERE') ? 'filtered' : 'all';
    
    return `${tableName}_${queryType}${paramHash}`;
  }

  /**
   * Get cached data from memory or disk
   */
  private async getCachedData<T = any>(cacheKey: string): Promise<T[] | null> {
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(cacheKey);
    if (memoryEntry && Date.now() < memoryEntry.timestamp + memoryEntry.ttl) {
      console.log(`🧠 Cache hit (memory): ${cacheKey}`);
      return memoryEntry.data as T[];
    }

    // Check disk cache
    const cacheFile = path.join(this.config.cacheDir!, `${cacheKey}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const fileContent = fs.readFileSync(cacheFile, 'utf8');
        const entry: CacheEntry = JSON.parse(fileContent);
        
        if (Date.now() < entry.timestamp + entry.ttl) {
          console.log(`💾 Cache hit (disk): ${cacheKey}`);
          
          // Load back into memory cache
          this.memoryCache.set(cacheKey, entry);
          return entry.data as T[];
        } else {
          // Cache expired, remove file
          fs.unlinkSync(cacheFile);
        }
      } catch (error) {
        console.warn(`⚠️  Cache file corrupted, removing: ${cacheFile}`);
        fs.unlinkSync(cacheFile);
      }
    }

    return null;
  }

  /**
   * Store data in cache (memory and disk)
   */
  private async setCachedData(cacheKey: string, data: any[], ttlMs: number = 3600000): Promise<void> {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    };

    // Store in memory cache
    this.memoryCache.set(cacheKey, entry);

    // Store in disk cache
    const cacheFile = path.join(this.config.cacheDir!, `${cacheKey}.json`);
    try {
      fs.writeFileSync(cacheFile, JSON.stringify(entry), 'utf8');
      console.log(`💾 Cached ${data.length} records to disk: ${cacheKey}`);
    } catch (error) {
      console.warn(`⚠️  Failed to write cache file: ${cacheFile}`, error);
    }
  }

  /**
   * Execute a query with caching support
   */
  async queryCached<T = any>(
    sql: string, 
    params: any[] = [], 
    ttlMs: number = 3600000
  ): Promise<T[]> {
    const cacheKey = this.getCacheKey(sql, params);
    
    // Try to get from cache first
    const cachedData = await this.getCachedData<T>(cacheKey);
    if (cachedData !== null) {
      return cachedData;
    }

    // Not in cache, execute query
    console.log(`🔄 Cache miss, executing query: ${sql.substring(0, 100)}...`);
    const results = await this.query<T>(sql, params);
    
    // Cache the results
    await this.setCachedData(cacheKey, results, ttlMs);
    
    return results;
  }

  /**
   * Lazy loading generator for large datasets
   */
  async *queryLazy<T = any>(
    sql: string,
    params: any[] = [],
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const paginatedSql = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
      const batch = await this.query<T>(paginatedSql, params);
      
      if (batch.length === 0) {
        hasMore = false;
        break;
      }
      
      console.log(`🔄 Lazy loading batch: ${offset + 1}-${offset + batch.length}`);
      yield batch;
      
      offset += batch.length;
      hasMore = batch.length === batchSize;
    }
  }

  /**
   * Clear cache (memory and disk)
   */
  async clearCache(): Promise<void> {
    // Clear memory cache
    this.memoryCache.clear();
    
    // Clear disk cache
    if (fs.existsSync(this.config.cacheDir!)) {
      const files = fs.readdirSync(this.config.cacheDir!);
      for (const file of files) {
        if (file.endsWith('.json')) {
          fs.unlinkSync(path.join(this.config.cacheDir!, file));
        }
      }
    }
    
    console.log('🧹 Cache cleared');
  }

  /**
   * Get all records from a table (with caching)
   */
  async getAllFromTable<T = any>(tableName: string, useCache: boolean = true): Promise<T[]> {
    const sql = `SELECT * FROM ${mysql.escapeId(tableName)}`;
    
    if (useCache) {
      return await this.queryCached<T>(sql, [], 1800000); // 30 min cache
    } else {
      return await this.query<T>(sql);
    }
  }

  /**
   * Get all records from a table with pagination
   */
  async getAllFromTablePaginated<T = any>(tableName: string, batchSize: number = 10000): Promise<T[]> {
    const sql = `SELECT * FROM ${mysql.escapeId(tableName)}`;
    return await this.queryWithPagination<T>(sql, [], batchSize);
  }

  /**
   * Get records by entity ID (for multi-tenant tables) with caching
   */
  async getByEntityId<T = any>(tableName: string, entityId: number, useCache: boolean = true): Promise<T[]> {
    const sql = `SELECT * FROM ${mysql.escapeId(tableName)} WHERE entityId = ?`;
    
    if (useCache) {
      return await this.queryCached<T>(sql, [entityId], 1800000); // 30 min cache
    } else {
      return await this.query<T>(sql, [entityId]);
    }
  }

  /**
   * Get all records from a table using lazy loading (memory efficient)
   */
  async *getAllFromTableLazy<T = any>(
    tableName: string, 
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    const sql = `SELECT * FROM ${mysql.escapeId(tableName)}`;
    
    for await (const batch of this.queryLazy<T>(sql, [], batchSize)) {
      yield batch;
    }
  }

  /**
   * Get records by entity ID using lazy loading (memory efficient)
   */
  async *getByEntityIdLazy<T = any>(
    tableName: string, 
    entityId: number, 
    batchSize: number = 1000
  ): AsyncGenerator<T[], void, unknown> {
    const sql = `SELECT * FROM ${mysql.escapeId(tableName)} WHERE entityId = ?`;
    
    for await (const batch of this.queryLazy<T>(sql, [entityId], batchSize)) {
      yield batch;
    }
  }

  /**
   * Check if a table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    const sql = `
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = ? AND table_name = ?
    `;
    const results = await this.query<{count: number}>(sql, [this.config.database, tableName]);
    return results[0]?.count > 0;
  }

  /**
   * Get table row count
   */
  async getTableRowCount(tableName: string): Promise<number> {
    const sql = `SELECT COUNT(*) as count FROM ${mysql.escapeId(tableName)}`;
    const results = await this.query<{count: number}>(sql);
    return results[0]?.count || 0;
  }

  /**
   * Get all table names in the database
   */
  async getAllTables(): Promise<string[]> {
    const sql = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = ?
      ORDER BY table_name
    `;
    const results = await this.query<{table_name: string}>(sql, [this.config.database]);
    return results.map(row => row.table_name);
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      console.log('🔌 Database connection closed');
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: Array<{sql: string, params?: any[]}>): Promise<any[]> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const connection = await this.pool.getConnection();
    const results: any[] = [];

    try {
      await connection.beginTransaction();

      for (const query of queries) {
        const [rows] = await connection.execute(query.sql, query.params || []);
        results.push(rows);
      }

      await connection.commit();
      return results;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats() {
    if (!this.pool) {
      return null;
    }

    return {
      allConnections: (this.pool as any)._allConnections?.length || 0,
      freeConnections: (this.pool as any)._freeConnections?.length || 0,
      connectionQueue: (this.pool as any)._connectionQueue?.length || 0
    };
  }
}