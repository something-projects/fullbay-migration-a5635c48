#!/usr/bin/env node

/**
 * SSH Tunnel + Transformer Script
 * 
 * Smart SSH tunnel management that:
 * - Detects existing SSH tunnels and reuses them if working properly
 * - Only creates new tunnels when necessary
 * - Only closes tunnels that were created by this script
 * - Leaves externally managed tunnels untouched
 * 
 * Usage:
 *   pnpm gen [arguments]
 * 
 * Examples:
 *   pnpm gen
 *   pnpm gen --full
 *   pnpm gen --entityId 17
 */

const { spawn } = require('child_process');
const { createTunnel } = require('tunnel-ssh');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Load environment variables
require('dotenv').config();

/**
 * SSH Tunnel Configuration
 */
function getSSHTunnelConfig() {
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

    // Server options - try the configured port first, then find an available port
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
    
    try {
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
    } catch (tunnelError) {
      if (tunnelError.message && tunnelError.message.includes('EADDRINUSE')) {
        console.log(`⚠️  Port ${config.localPort} is already in use, checking if tunnel is functional...`);
        
        // Double-check if the existing tunnel is working
        const dbConnectable = await testDatabaseConnection(config.localPort);
        if (dbConnectable) {
          console.log('✅ Found working tunnel on the same port, will reuse it!');
          return { 
            server: null, 
            client: null, 
            actualPort: config.localPort, 
            createdByUs: false 
          };
        }
      }
      throw tunnelError;
    }

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
 * Run the transformer with the tunnel active
 */
async function runTransformer(args) {
  return new Promise((resolve, reject) => {
    console.log('\n🚀 Starting Fullbay Transformer...');
    console.log('===============================================');
    
    // Build the command
    const command = 'node';
    const commandArgs = [
      '--max-old-space-size=8192',
      '-r', 'ts-node/register',
      'src/index.ts',
      ...args
    ];
    
    console.log(`Command: ${command} ${commandArgs.join(' ')}`);
    console.log('');
    
    // Spawn the transformer process
    const transformerProcess = spawn(command, commandArgs, {
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure tunnel mode is set
        SSH_TUNNEL: 'true'
      }
    });

    transformerProcess.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Transformer completed successfully!');
        resolve();
      } else {
        console.error(`\n❌ Transformer failed with exit code ${code}`);
        reject(new Error(`Transformer process exited with code ${code}`));
      }
    });

    transformerProcess.on('error', (error) => {
      console.error('\n❌ Failed to start transformer:', error);
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
 * Start server process in parallel
 */
async function startServerInParallel() {
  console.log('\n🚀 Starting server process in parallel...');
  
  // Use the appropriate command for the platform
  const isWindows = process.platform === 'win32';
  const command = isWindows ? 'npm.cmd' : 'npm';
  
  const serverProcess = spawn(command, ['run', 'server'], {
    stdio: 'inherit',
    env: process.env,
    shell: isWindows,
    detached: true // Run independently
  });

  serverProcess.on('error', (error) => {
    console.error('\n❌ Failed to start server:', error);
  });

  // Don't wait for server to complete - let it run in parallel
  return serverProcess;
}

/**
 * Main execution function
 */
async function main() {
  // Get transformer arguments (everything except node and script name)
  const transformerArgs = process.argv.slice(2);
  // Check if entityId is specified (single entity processing mode)
  const hasEntityId = transformerArgs.some(arg => arg.includes('entityId'));
  const isSingleEntityMode = hasEntityId;
  console.log('🚀 SSH Tunnel + Transformer Script');
  console.log('===================================');
  
  if (isSingleEntityMode) {
    console.log('📋 Running in SINGLE ENTITY mode (transformer only, no server)');
  }else {
    console.log('📋 Running in gen mode (transformer only)');
  }
  
  if (transformerArgs.length > 0) {
    console.log(`📋 Transformer arguments: ${transformerArgs.join(' ')}`);
  } else {
    console.log('📋 Running with default transformer arguments');
  }
  
  let tunnel = null;
  let serverProcess = null;
  
  try {
    // Get SSH tunnel configuration
    const config = getSSHTunnelConfig();
    
    // Ensure SSH tunnel (check existing or create new)
    tunnel = await ensureSSHTunnel(config);
    
    // Start server in parallel if this is gen command but NOT single entity mode
    if (!isSingleEntityMode) {
      // Wait a bit for tunnel to be established
      setTimeout(async () => {
        serverProcess = await startServerInParallel();
      }, 2000);
    }
    
    // Simple error handling: ensure SSH tunnel can be closed under any circumstances
    const cleanup_handler = async () => {
      if (serverProcess && !serverProcess.killed) {
        console.log('🔄 Stopping server process...');
        serverProcess.kill('SIGTERM');
      }
      await cleanup(tunnel);
      process.exit(0);
    };
    
    process.on('SIGINT', cleanup_handler);   // Ctrl+C
    process.on('SIGTERM', cleanup_handler);  // Termination signal
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGTERM');
      }
      await cleanup(tunnel);
      process.exit(1);
    });
    
    // Run the transformer
    await runTransformer(transformerArgs);
    
    if (isSingleEntityMode) {
      // Single entity mode: clean up and exit immediately
      console.log('\n🎉 Single entity processing completed!');
      await cleanup(tunnel);
      console.log('✅ SSH tunnel closed, script exiting...');
    } else {
      // Gen mode with server: keep tunnel open for server
      console.log('\n🎉 Transformer completed! Server continues running...');
      console.log('📝 Press Ctrl+C to stop the server');
      console.log('🔗 SSH tunnel remains open for server...');
      
      // Keep the process alive to let server run
      process.stdin.resume();
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    // Clean up on error
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
    }
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
