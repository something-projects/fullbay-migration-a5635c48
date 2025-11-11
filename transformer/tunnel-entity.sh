#!/bin/bash

# Node.js SSH Tunnel Entity Fetcher
# Uses Node.js ssh2 library instead of shell SSH commands
# More reliable and cross-platform than shell-based tunnels

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check if entity ID was provided
if [ -z "$1" ]; then
    echo "❌ Please provide an Entity ID"
    echo ""
    echo "Usage: $0 <ENTITY_ID> [OPTIONS]"
    echo ""
    echo "Examples:"
    echo "  $0 1269                    # Fetch and transform entity 1269"
    echo "  $0 1269 --testConnection   # Test connection for entity 1269"
    echo "  $0 456 --keepTunnel        # Fetch entity 456 and keep tunnel open"
    echo ""
    echo "The script will use credentials from ../.env file"
    echo ""
    echo "Available options:"
    echo "  --testConnection, -t       Test SSH tunnel and MySQL connection only"
    echo "  --keepTunnel, -k          Keep SSH tunnel open after completion"
    echo "  --outputDir, -o DIR       Custom output directory"
    echo "  --prettyJson, -p          Pretty print JSON (default: true)"
    echo ""
    exit 1
fi

ENTITY_ID="$1"
shift # Remove entity ID from arguments, pass rest to Node.js script

echo "🚀 Node.js SSH Tunnel Entity Fetcher"
echo "===================================="
echo "🏢 Entity ID: $ENTITY_ID"
echo "📁 Using configuration from ../.env"
echo ""

# Check if .env file exists
if [ ! -f "../.env" ]; then
    echo "❌ .env file not found in parent directory"
    echo "Please create ../.env with your SSH and database credentials"
    echo ""
    echo "Required variables:"
    echo "  REMOTE_HOST=your-ssh-server"
    echo "  REMOTE_USER=your-ssh-username"
    echo "  SSH_PASSWORD=your-ssh-password"
    echo "  MYSQL_HOST=your-mysql-host"
    echo "  MYSQL_USER=your-mysql-username"
    echo "  MYSQL_PASSWORD=your-mysql-password"
    echo "  MYSQL_DATABASE=your-database-name"
    exit 1
fi

# Check if Node.js dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "⚠️  Node.js dependencies not found. Installing..."
    if command -v yarn >/dev/null 2>&1; then
        yarn install
    elif command -v npm >/dev/null 2>&1; then
        npm install
    else
        echo "❌ Neither yarn nor npm found. Please install Node.js and npm/yarn."
        exit 1
    fi
fi

# Run the Node.js SSH tunnel fetcher
echo "🔌 Starting Node.js SSH tunnel fetcher..."
echo ""

npm run tunnel-fetch -- --entityId "$ENTITY_ID" "$@"

RESULT=$?

echo ""
if [ $RESULT -eq 0 ]; then
    echo "🎉 Entity $ENTITY_ID processing completed successfully!"
    echo "📁 Check the output/ directory for generated JSON files"
    echo ""
    echo "Benefits of Node.js SSH tunnels:"
    echo "  ✅ More reliable than shell-based SSH tunnels"
    echo "  ✅ Better error handling and connection management" 
    echo "  ✅ Cross-platform compatibility (Windows/Mac/Linux)"
    echo "  ✅ Automatic cleanup and resource management"
else
    echo "❌ Entity $ENTITY_ID processing failed with exit code $RESULT"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Test connection: $0 $ENTITY_ID --testConnection"
    echo "  2. Check .env file: cat ../.env"
    echo "  3. Verify SSH access: ssh \$REMOTE_USER@\$REMOTE_HOST"
    echo "  4. Check MySQL credentials and network connectivity"
fi

exit $RESULT