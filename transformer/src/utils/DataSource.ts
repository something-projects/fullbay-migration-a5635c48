import { DatabaseConnection, DatabaseConfig } from './DatabaseConnection';

export interface DataReader {
  /**
   * Read all records from a table
   */
  readTable<T = any>(tableName: string): Promise<T[]>;
  
  /**
   * Read records with pagination
   */
  readTablePaginated<T = any>(tableName: string, batchSize?: number): Promise<T[]>;
  
  /**
   * Read records using lazy loading (memory efficient)
   */
  readTableLazy<T = any>(tableName: string, batchSize?: number): AsyncGenerator<T[], void, unknown>;
  
  /**
   * Execute custom SQL query
   */
  query<T = any>(sql: string, params?: any[]): Promise<T[]>;
  
  /**
   * Check if a table exists
   */
  exists(tableName: string): Promise<boolean>;
  
  /**
   * Get available tables
   */
  getAvailableTables(): Promise<string[]>;
  
  /**
   * Close connection/cleanup
   */
  close(): Promise<void>;
}

export class DatabaseDataReader implements DataReader {
  private db: DatabaseConnection;

  constructor(config: DatabaseConfig) {
    this.db = new DatabaseConnection(config);
  }

  async connect(): Promise<void> {
    await this.db.connect();
  }

  async readTable<T = any>(tableName: string): Promise<T[]> {
    return await this.db.getAllFromTable<T>(tableName);
  }

  async readTablePaginated<T = any>(tableName: string, batchSize: number = 10000): Promise<T[]> {
    return await this.db.getAllFromTablePaginated<T>(tableName, batchSize);
  }

  async *readTableLazy<T = any>(tableName: string, batchSize: number = 1000): AsyncGenerator<T[], void, unknown> {
    for await (const batch of this.db.getAllFromTableLazy<T>(tableName, batchSize)) {
      yield batch;
    }
  }

  async exists(tableName: string): Promise<boolean> {
    return await this.db.tableExists(tableName);
  }

  async getAvailableTables(): Promise<string[]> {
    return await this.db.getAllTables();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  // Database-specific methods
  async getTableRowCount(tableName: string): Promise<number> {
    return await this.db.getTableRowCount(tableName);
  }

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    return await this.db.query<T>(sql, params);
  }
}

/**
 * Create database data reader
 */
export function createDatabaseDataReader(config: DatabaseConfig): DatabaseDataReader {
  return new DatabaseDataReader(config);
}