#!/usr/bin/env node

/**
 * Query Simple Shops with SSH Tunnel
 * 执行Simple_Shops.sql查询并输出结果
 */

const { spawn } = require('child_process');
const { createTunnel } = require('tunnel-ssh');
const fs = require('fs');
const path = require('path');
const net = require('net');

// Load environment variables
require('dotenv').config();

/**
 * SSH Tunnel Configuration (复用run-with-tunnel.js的配置)
 */
function getSSHTunnelConfig() {
  const remoteHost = process.env.REMOTE_HOST || process.env.SSH_HOST;
  const remoteUser = process.env.REMOTE_USER || process.env.SSH_USER;
  const remotePassword = process.env.REMOTE_PASSWORD || process.env.SSH_PASSWORD;
  const localPort = process.env.SSH_TUNNEL_PORT ? parseInt(process.env.SSH_TUNNEL_PORT) : 55306;
  const remoteDbHost = process.env.MYSQL_HOST;
  const remoteDbPort = process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT) : 3306;

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

/**
 * Check if SSH tunnel is already active on the specified port
 */
async function checkTunnelStatus(port) {
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

/**
 * Test database connectivity through the tunnel
 */
async function testDatabaseConnection(port) {
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

      connection.connect((err) => {
        if (err) {
          connection.destroy();
          console.log(`🚫 Database connection failed: ${err.message}`);
          resolve(false);
          return;
        }
        
        // Test with a simple query
        connection.query('SELECT 1', (queryErr) => {
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
    } catch (error) {
      console.log(`🚫 Database test error: ${error.message}`);
      resolve(false);
    }
  });
}

/**
 * Create SSH tunnel
 */
async function createSSHTunnel(config) {
  console.log('🔐 Creating SSH tunnel...');
  console.log(`📡 Connecting to: ${config.remoteUser}@${config.remoteHost}`);
  console.log(`🗄️  Target database: ${config.remoteDbHost}:${config.remoteDbPort}`);

  try {
    // SSH connection options
    const sshOptions = {
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
      autoClose: false // We'll manage the lifecycle manually
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
      tunnelOptions, 
      serverOptions, 
      sshOptions, 
      forwardOptions
    );

    const actualPort = server.address()?.port || config.localPort;

    console.log('✅ SSH tunnel established successfully!');
    console.log(`📍 Local tunnel endpoint: 127.0.0.1:${actualPort}`);
    console.log(`🎯 Remote database: ${config.remoteDbHost}:${config.remoteDbPort}`);

    return { server, client, actualPort, createdByUs: true };

  } catch (error) {
    console.error('❌ Failed to create SSH tunnel:', error);
    throw new Error(`SSH tunnel creation failed: ${error.message}`);
  }
}

/**
 * Smart tunnel management - check existing tunnel or create new one
 */
async function ensureSSHTunnel(config) {
  console.log('🔍 Checking for existing SSH tunnel...');
  
  // First check if the port is already in use
  const portOpen = await checkTunnelStatus(config.localPort);
  
  if (portOpen) {
    console.log(`📡 Found active connection on port ${config.localPort}`);
    
    // Test if we can actually connect to the database through this port
    console.log('🧪 Testing database connectivity through existing tunnel...');
    const dbConnectable = await testDatabaseConnection(config.localPort);
    
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
  return await createSSHTunnel(config);
}

/**
 * Execute SQL file using mysql command line
 */
async function executeSQL(sqlPath, actualPort) {
  return new Promise((resolve, reject) => {
    console.log(`\n📋 Executing SQL file: ${sqlPath}`);
    
    // Build mysql command
    const mysqlArgs = [
      '-h', '127.0.0.1',
      '-P', actualPort.toString(),
      '-u', process.env.MYSQL_USER,
      `-p${process.env.MYSQL_PASSWORD}`,
      process.env.MYSQL_DATABASE,
      '-e', `source ${sqlPath}`
    ];
    
    console.log('🔄 Running mysql query...');
    
    const mysqlProcess = spawn('mysql', mysqlArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    mysqlProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    mysqlProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    mysqlProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Query executed successfully!');
        console.log('\n📊 Query Results:');
        console.log('================');
        console.log(output);
        resolve(output);
      } else {
        console.error('❌ Query failed:', errorOutput);
        reject(new Error(`MySQL process exited with code ${code}: ${errorOutput}`));
      }
    });

    mysqlProcess.on('error', (error) => {
      console.error('❌ Failed to execute mysql command:', error);
      reject(error);
    });
  });
}

/**
 * Cleanup function - only closes tunnels that we created
 */
async function cleanup(tunnel) {
  if (tunnel && tunnel.createdByUs) {
    console.log('\n🔄 Closing SSH tunnel (created by this script)...');
    
    try {
      if (tunnel.server) {
        tunnel.server.close();
        console.log('✅ Tunnel server closed');
      }

      if (tunnel.client) {
        tunnel.client.end();
        console.log('✅ SSH client closed');
      }

      console.log('✅ SSH tunnel closed successfully');
    } catch (error) {
      console.error('⚠️  Error while closing tunnel:', error);
      // Force close
      try {
        if (tunnel.server) tunnel.server.unref();
        if (tunnel.client) tunnel.client.destroy();
      } catch (e) {}
    }
  } else if (tunnel && !tunnel.createdByUs) {
    console.log('\n🔄 Leaving existing SSH tunnel open (not created by this script)');
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 Simple Shops SQL Query Script');
  console.log('=================================');
  
  let tunnel = null;
  
  try {
    // Get SSH tunnel configuration
    const config = getSSHTunnelConfig();
    
    // Ensure SSH tunnel (check existing or create new)
    tunnel = await ensureSSHTunnel(config);
    
    // Find SQL file - allow command line argument to override
    const sqlFile = process.argv[2] || 'Simple_Shops.sql';
    const sqlPath = path.join(__dirname, '..', '..', sqlFile);
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`SQL file not found: ${sqlPath}`);
    }
    
    // Simple error handling: ensure SSH tunnel can be closed under any circumstances
    const cleanup_handler = async () => {
      await cleanup(tunnel);
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup_handler);   // Ctrl+C
    process.on('SIGTERM', cleanup_handler);  // Termination signal
    
    // Execute SQL file
    await executeSQL(sqlPath, tunnel.actualPort);
    
    // Clean up
    await cleanup(tunnel);
    
    console.log('\n🎉 Query completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    // Clean up on error
    await cleanup(tunnel);
    
    console.error('\n🛑 Script failed');
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}