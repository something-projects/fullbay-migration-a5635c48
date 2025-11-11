#!/bin/bash

# Simple wrapper for fetching and transforming a specific entity
# Usage: ./fetch-entity.sh [ENTITY_ID]

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Check if entity ID was provided
if [ -z "$1" ]; then
    echo "❌ Please provide an Entity ID"
    echo ""
    echo "Usage: $0 <ENTITY_ID>"
    echo ""
    echo "Examples:"
    echo "  $0 1269          # Fetch and transform entity 1269"  
    echo "  $0 456           # Fetch and transform entity 456"
    echo ""
    echo "The script will use credentials from ../.env file"
    exit 1
fi

ENTITY_ID="$1"

echo "🚀 Fetching and transforming Entity $ENTITY_ID..."
echo "📁 Using configuration from ../.env"
echo ""

# Check if .env file exists
if [ ! -f "../.env" ]; then
    echo "❌ .env file not found in parent directory"
    echo "Please create ../.env with your database credentials"
    exit 1
fi

# Run the remote fetch with the specified entity ID
npm run remote-fetch -- --entityId "$ENTITY_ID"

echo ""
echo "🎉 Entity $ENTITY_ID processing completed!"
echo "📁 Check the output/ directory for generated JSON files"