import { Client } from 'ssh2';
import { createConnection, Connection } from 'mysql2/promise';

export interface SSHTunnelConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: Buffer | string;
  localPort?: number;
  remoteHost: string;
  remotePort?: number;
}

export interface MySQLConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
}

export class SSHTunnel {
  private sshClient: Client;
  private tunnelConfig: SSHTunnelConfig;
  private isConnected: boolean = false;
  private localPort: number;

  constructor(config: SSHTunnelConfig) {
    this.sshClient = new Client();
    this.tunnelConfig = {
      port: 22,
      localPort: 55306,
      remotePort: 3306,
      ...config
    };
    this.localPort = this.tunnelConfig.localPort!;
  }

  /**
   * Establish SSH tunnel
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔗 Connecting to SSH server: ${this.tunnelConfig.username}@${this.tunnelConfig.host}:${this.tunnelConfig.port}`);
      
      this.sshClient.on('ready', () => {
        console.log(`✅ SSH connection established`);
        console.log(`🔌 SSH tunnel ready for connections`);
        this.isConnected = true;
        resolve();
      });

      this.sshClient.on('error', (err) => {
        console.error('❌ SSH connection failed:', err.message);
        reject(err);
      });

      this.sshClient.on('end', () => {
        console.log('🔌 SSH connection ended');
        this.isConnected = false;
      });

      this.sshClient.on('close', () => {
        console.log('🔌 SSH connection closed');
        this.isConnected = false;
      });

      // Connect to SSH server
      const connectionConfig: any = {
        host: this.tunnelConfig.host,
        port: this.tunnelConfig.port,
        username: this.tunnelConfig.username,
        readyTimeout: 10000,
        keepaliveInterval: 10000,
      };

      if (this.tunnelConfig.password) {
        connectionConfig.password = this.tunnelConfig.password;
      }

      if (this.tunnelConfig.privateKey) {
        connectionConfig.privateKey = this.tunnelConfig.privateKey;
      }

      this.sshClient.connect(connectionConfig);
    });
  }

  /**
   * Create MySQL connection through the tunnel
   */
  async createMySQLConnection(mysqlConfig: MySQLConfig): Promise<Connection> {
    if (!this.isConnected) {
      throw new Error('SSH tunnel not connected. Call connect() first.');
    }

    console.log(`🗄️  Connecting to MySQL through tunnel: ${mysqlConfig.user}@localhost:${this.localPort}/${mysqlConfig.database}`);

    const connection = await createConnection({
      host: '127.0.0.1',
      port: this.localPort,
      user: mysqlConfig.user,
      password: mysqlConfig.password,
      database: mysqlConfig.database,
      ssl: false, // Tunnel handles encryption
      connectTimeout: 10000,
      acquireTimeout: 10000,
      timeout: 10000,
    });

    console.log('✅ MySQL connection established through tunnel');
    return connection;
  }

  /**
   * Test the tunnel and MySQL connection
   */
  async testConnection(mysqlConfig: MySQLConfig): Promise<boolean> {
    try {
      const connection = await this.createMySQLConnection(mysqlConfig);
      
      // Test query
      const [rows] = await connection.execute('SELECT 1 as test_connection, NOW() as server_time');
      const result = (rows as any[])[0];
      
      console.log(`🕐 MySQL server time: ${result.server_time}`);
      console.log('✅ Tunnel and MySQL connection test successful');
      
      await connection.end();
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      return false;
    }
  }

  /**
   * Get the local port for the tunnel
   */
  getLocalPort(): number {
    return this.localPort;
  }

  /**
   * Check if tunnel is connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Close the SSH tunnel
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.sshClient) {
        console.log('🔌 Closing SSH tunnel...');
        
        this.sshClient.on('close', () => {
          console.log('✅ SSH tunnel closed');
          this.isConnected = false;
          resolve();
        });
        
        this.sshClient.end();
      } else {
        resolve();
      }
    });
  }
}

/**
 * Utility function to create SSH tunnel with MySQL connection
 */
export async function createSSHTunnelWithMySQL(
  sshConfig: SSHTunnelConfig, 
  mysqlConfig: MySQLConfig
): Promise<{ tunnel: SSHTunnel, connection: Connection }> {
  
  const tunnel = new SSHTunnel(sshConfig);
  await tunnel.connect();
  
  const connection = await tunnel.createMySQLConnection(mysqlConfig);
  
  return { tunnel, connection };
}

/**
 * Auto-configure SSH tunnel from environment variables
 */
export function createSSHTunnelFromEnv(): SSHTunnel {
  const config: SSHTunnelConfig = {
    host: process.env.REMOTE_HOST || '',
    username: process.env.REMOTE_USER || '',
    password: process.env.SSH_PASSWORD,
    localPort: parseInt(process.env.SSH_TUNNEL_PORT || '55306'),
    remoteHost: process.env.MYSQL_HOST || '',
    remotePort: 3306,
  };

  // Validate required config
  if (!config.host || !config.username || !config.remoteHost) {
    throw new Error('Missing SSH tunnel configuration. Required: REMOTE_HOST, REMOTE_USER, MYSQL_HOST');
  }

  return new SSHTunnel(config);
}