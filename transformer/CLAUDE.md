# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Fullbay Transformer - Data Processing Pipeline

## Overview

The **Fullbay Transformer** is a TypeScript data processing pipeline that converts raw Fullbay database data into organized, denormalized JSON files for efficient frontend consumption. It processes multi-tenant repair shop data and creates entity-centric exports.

**Input:** MySQL database or TSV files
**Output:** Structured JSON files organized by repair shop (entity) with hierarchical data

## Essential Commands

### Development Commands
```bash
# Build the TypeScript project
npm run build

# Run with automatic SSH tunnel management (recommended)
npm run gen
npm run gen --full                       # Full mode (all entities)
npm run gen --entityId 17               # Process specific entity
npm run gen --outputDir ./custom        # Custom output directory
npm run gen --full --outputDir ./prod   # Combine multiple arguments

# Development server mode
npm run server

# Direct execution (after build)
npm run start

# Clean build artifacts
npm run clean

# Run tests
npm run test
```

### Core Processing Modes

1. **Demo Mode (Default)**: Simple Shop entities get full processing, others get basic data only - optimized for development
2. **Full Mode (`--full`)**: All entities get complete processing - for production exports  
3. **Entity-Specific (`--entityId <id>`)**: Specific entity gets full processing, others basic - for debugging

## Architecture

### Core Components

#### **Data Sources (`utils/DataSource.ts`)**
- **DatabaseDataReader**: Direct MySQL connection with SSH tunnel support
- **FileDataReader**: TSV file processing for development
- Automatic connection management with credential handling

#### **Processors (`processors/`)**
- **EntityProcessor**: Processes repair shops with caching and Simple Shop identification
- **CustomerProcessor**: Processes fleet companies with optimized batch loading  
- **ServiceOrderProcessor**: Processes repair orders with action items and financial totals
- **OptimizedCustomerProcessor**: Performance-optimized variant for large datasets

#### **Services (`services/`)**
- **AutoCareAggregator**: Vehicle and parts matching using AutoCare data
- **VehicleAggregator/VehicleMatcher**: Vehicle identification and standardization
- **PartsMatcher/PartRecommendationService**: Parts identification and recommendations
- **InterchangeService**: Parts interchange and compatibility
- **AssetManager**: File and asset management utilities

#### **Infrastructure (`utils/`)**
- **OutputManager**: JSON file generation with hierarchical directory structure
- **DataQualityTracker**: Processing statistics and data quality monitoring
- **DatabaseConnection**: MySQL connection with SSH tunnel integration
- **DataCache**: Caching layer for performance optimization
- **AutoCareLoader**: AutoCare data loading and management

### Data Hierarchy

```
Entity (Repair Shop Business)
├── EntityLocations (Physical shop locations)
├── EntityEmployees (Mechanics, service advisors, etc.)
├── Customers (Fleet companies served by this repair shop)
│   ├── CustomerUnits (Individual vehicles/trailers)
│   ├── CustomerEmployees (Fleet managers, drivers)
│   └── ServiceOrders (Repair orders for customer units)
│       ├── RepairOrderActionItems (Individual work performed)
│       ├── Parts, Labor, Outside Services
│       └── Financial totals
├── Configuration (Rates, settings, tax locations)
├── Integrations (QuickBooks, payment processors)
└── Audit trails and history
```

## Key Features

### **Smart SSH Tunnel Management**
- Automatic tunnel detection and reuse
- Creates new tunnels only when necessary
- Proper cleanup of self-created tunnels
- Cross-platform support with error handling

### **Simple Shop Integration** 
- Automatic identification of small repair shops (≤2 locations, <5 employees)
- Enhanced data fields for simplified management
- Optimized processing for small operations

### **Performance Optimizations**
- Batch SQL queries with entity isolation
- Comprehensive caching system for related data
- Optimized processors for large datasets
- Memory-efficient processing with cleanup

### **Multi-Mode Processing**
- Demo mode for fast development
- Full mode for production exports
- Entity-specific mode for debugging
- Flexible output directory management

## Database Connection

The transformer supports both direct database connections and SSH tunnel connections:

### Environment Variables Required:
```bash
# Database connection
MYSQL_HOST=your-database-host
MYSQL_USER=your-username  
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=your-database-name

# SSH Tunnel (optional)
SSH_TUNNEL=true
SSH_TUNNEL_PORT=55306
REMOTE_HOST=gateway-server
REMOTE_USER=ssh-username
REMOTE_PASSWORD=ssh-password
```

### Connection Detection:
- Checks `SSH_TUNNEL=true` to use tunnel mode
- Falls back to direct connection if tunnel not configured
- Automatic tunnel lifecycle management via `run-with-tunnel.js`

## Output Structure

```
output/
├── processing_summary.json      # Processing metadata & statistics
├── 1/                          # Entity ID directory (repair shop)
│   ├── entity.json            # Entity root data + Simple Shop enhancements
│   ├── index.json             # Entity summary & statistics  
│   ├── customers/             # Fleet customers
│   │   ├── {customer-id}/
│   │   │   ├── entity.json    # Customer details with units
│   │   │   └── units/         # Customer's fleet units
│   │   │       └── {unit-id}/
│   │   │           └── service-orders/  # Unit's repair orders
│   │   └── index.json
│   └── service-orders/        # All repair orders for entity
│       ├── {order-id}/
│       │   └── entity.json    # Complete service order details
│       └── index.json
└── ... (additional entities)
```

## Development Patterns

### **Adding New Processors**
1. Extend base processor patterns from existing processors
2. Implement caching for performance (see EntityProcessor caching examples)
3. Add quality tracking for data issues
4. Follow hierarchical data structure patterns

### **Database Schema Handling**
- The database has **zero foreign key constraints** - handle missing relationships gracefully
- Missing `entityId` fields break multi-tenant isolation - validate entity scope manually
- NULL foreign keys are common - implement defensive null checking
- Use batch loading with IN clauses for performance

### **AutoCare Integration**
- Vehicle and parts matching using industry-standard AutoCare data
- VCdb (Vehicle Configuration Database) for vehicle identification
- PCdb (Product Classification Database) for parts categorization
- Optional feature that can be disabled if AutoCare data unavailable

## Testing and Quality

### **Data Quality Tracking**
- Comprehensive statistics on processed records
- Success/failure rates by entity type
- Missing relationship identification
- Processing time and performance metrics

### **Error Handling**
- Graceful handling of missing database relationships
- Partial processing continuation on errors
- Detailed error logging in processing summary
- SSH tunnel connection resilience

## Troubleshooting

### **Common Issues**
- **SSH Connection Failed**: Check tunnel credentials and network connectivity
- **Database Connection**: Verify MySQL credentials and host accessibility  
- **No Entities Found**: Confirm database contains Entity table with data
- **Processing Failures**: Check `processing_summary.json` for detailed errors
- **Memory Issues**: Increase Node.js memory with `--max-old-space-size=8192`

### **Performance Issues**
- Use demo mode for development (faster processing)
- Check entity count and consider entity-specific processing
- Monitor memory usage during large dataset processing
- Verify SSH tunnel stability for remote connections

The transformer is designed for reliability and performance when handling the complex Fullbay multi-tenant database structure while providing efficient data exports for frontend consumption.