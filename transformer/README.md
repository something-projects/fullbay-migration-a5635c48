# Fullbay Database Transformer

A TypeScript application that connects directly to the Fullbay production database and transforms data for all repair shops (entities) into denormalized JSON files for efficient frontend consumption.

## Overview

This tool processes data from the Fullbay heavy-duty repair management system database for a single repair shop business and creates a comprehensive denormalized JSON structure that supports efficient frontend data consumption and unit-first navigation.

**Key Features:**
- **Direct Database Connection**: Connects to MySQL production database via SSH tunnel
- **Multi-Entity Processing**: Efficiently processes all repair shops' data
- **Flexible Processing Modes**: Demo mode (fast development) vs Full mode (production)
- **Comprehensive Data Loading**: Uses SQL queries to load all repair shop data with proper entity isolation

## Additional Features

- **Dual Processing Modes**: 
  - **Demo Mode** (default): First entity gets full data, others get basic company.json only (fast for development)
  - **Full Mode**: All entities get complete data processing (for production exports)
- **Skip Configuration**: Configure which entities to skip during full processing for performance optimization
- **Clean Output Structure**: Outputs directly to specified directory with automatic cleanup
- **Comprehensive Denormalization**: Includes all related data for each repair shop entity
- **Efficient Data Loading**: Uses optimized SQL queries and batch processing for performance
- **Environment Variables**: Secure credential management
- **Error Handling**: Robust error handling with detailed logging

## Installation

```bash
npm install
```

## Development

```bash
# Build the project
npm run build

# Start the application (after building)
npm run start

# Run tests
npm run test

# Clean build artifacts
npm run clean

# Build and export data
npm run export

# Generate data with automatic tunnel (recommended)
npm run gen

# Run server with tunnel (for development)
npm run server

# Generate data only (with tunnel)
npm run gen

# Remote fetch data (for advanced usage)
npm run remote-fetch
```

### AutoCare Parquet 导出

将 VCdb/PCdb JSON 转换为 Parquet 并附带匹配规范化键：

```bash
pnpm autocare:parquet
```

可选参数（直接运行脚本也可传参）：

- `--vcdb`: VCdb 目录（默认 `AUTOCARE_VCDB_PATH` 或 `./autocare-data/VCdb`）
- `--pcdb`: PCdb 目录（默认 `AUTOCARE_PCDB_PATH` 或 `./autocare-data/PCdb`）
- `--out`: 输出目录（默认 `../output`）

产出文件：

- `VCdb.parquet`：包含 `make, model, year, submodel?, engine?` 与 `key_norm = make|model|year|submodel|engine`
- `PCdb.parquet`：包含 `part_id, part_name, part_description` 与 `key_norm`（标准化部件名）

说明：本步骤与现有匹配实现兼容，作为性能优化的旁路产物；PCdb→车辆的直接匹配需要应用映射（本仓库数据未包含），因此未产出 `matched.*`。

### Parquet 在匹配中的使用

- ServiceOrder 批量部件匹配将优先走 JS 的 exact/fuzzy；若未命中且检测到 `PCdb_tokens.parquet` 与 `PCdb_enriched.parquet`，会用 DuckDB 做候选召回（按 token 命中计分），再以现有规则精排，提升召回率与整体命中。
- 无 Parquet 文件时，维持原有逻辑不变。

## Available Scripts

| Script | Description | Usage |
|--------|-------------|-------|
| `build` | Compile TypeScript to JavaScript | `npm run build` |
| `start` | Run the compiled application | `npm run start` |
| `gen` | Generate data with automatic tunnel (parallel server + data generation) | `npm run gen` |
| `server` | Build and run server with tunnel | `npm run server` |
| `gen` | Run data generation with tunnel | `npm run gen` |
| `remote-fetch` | Fetch data remotely with increased memory | `npm run remote-fetch` |
| `test` | Run Jest tests | `npm run test` |
| `clean` | Remove build artifacts | `npm run clean` |
| `export` | Build and start application | `npm run export` |

**Recommended for most users**: Use `npm run gen` for automatic tunnel management and data generation.

## Quick Start

### 🚀 Automatic SSH Tunnel (One-Click Usage)

1. **Configure Environment Variables**
```bash
# Make sure your .env file contains SSH and database configuration
```

2. **Run with Automatic Tunnel**
```bash
# Demo mode (default) - automatically establish tunnel, execute and close after completion
pnpm gen

# Full mode - process complete data for all entities
pnpm gen --full

# Specify entity ID (both formats supported)
pnpm gen --entityId 17
pnpm gen --entityID 17

# Custom output directory
pnpm gen --outputDir ./custom_output

# Combine multiple arguments
pnpm gen --full --outputDir ./production_export
pnpm gen --entityId 17 --prettyJson false

# Clear and reprocess all data
pnpm gen --rewrite
pnpm gen --full --rewrite
```

**Features:**
- ✅ No manual SSH tunnel setup required
- ✅ Automatic connection management and cleanup
- ✅ Cross-platform support (Windows, Mac, Linux)
- ✅ Automatic tunnel lifecycle management
- ✅ Automatic tunnel closure after execution

**Important**: See detailed configuration instructions below.

## Usage

### 🚀 Environment Setup

Now uses [tunnel-ssh](https://www.npmjs.com/package/tunnel-ssh) library for automatic SSH tunnel management, no manual tunnel setup required.

#### Configure Environment Variables

Make sure your `.env` file contains the following configuration:

```bash
# SSH connection configuration (gateway server)
REMOTE_HOST=74.80.248.156
REMOTE_USER=admin
REMOTE_PASSWORD=your-ssh-password

# Database configuration (accessed through gateway server)
MYSQL_HOST=fullbayproduction-copy.ccrb4rqyc6yi.us-west-2.rds.amazonaws.com
MYSQL_USER=your-database-username
MYSQL_PASSWORD=your-database-password
MYSQL_DATABASE=your-database-name

# Tunnel configuration
SSH_TUNNEL=true
SSH_TUNNEL_PORT=55306

# Note: Processing mode is now controlled via command line arguments
# --full for all entities, --entityId <id> for specific entity, default is demo mode
```

#### Usage

```bash
# Default demo mode - processes Simple Shop entities with full data, others with basic data
pnpm gen

# Full mode - processes all entities with complete data
pnpm gen --full

# Process specific entity with full data, others with basic data
pnpm gen --entityId 17
pnpm gen --entityID 17

# Custom output directory
pnpm gen --outputDir ./custom_output

# Compact JSON output
pnpm gen --prettyJson false

# Clear output directory before processing (rewrite mode)
pnpm gen --rewrite

# Combine rewrite with other options
pnpm gen --full --rewrite --outputDir ./production_export

# All arguments are now supported with pnpm gen (previously only pnpm gen)
pnpm gen --full --outputDir ./production_export --prettyJson false
```




### Usage Examples

#### Standard Denormalized Data Export
```bash
# Basic usage (demo mode) - outputs to output/
pnpm gen

# Full mode processing - outputs to output/ (respects skip configuration)
pnpm gen --full

# Specify entity ID (both formats supported) - overrides skip configuration
pnpm gen --entityId 17
pnpm gen --entityID 17

# Custom output directory - outputs to custom_output/
pnpm gen --outputDir ./custom_output

# Full mode with custom output directory
pnpm gen --full --outputDir ./production_export

# Clear output directory and reprocess (rewrite mode)
pnpm gen --rewrite

# Full rewrite mode with custom output directory
pnpm gen --full --rewrite --outputDir ./production_export
```

#### Skip Configuration

Configure which entities to skip during full processing for performance optimization:

```typescript
// Edit src/config/skipEntities.ts
export const SKIP_ENTITIES_CONFIG = {
  skipEntityIds: [
    1,  // Demo account - COPY (large dataset)
    3   // Default Company - COPY (test entity)
  ]
};
```

**Behavior:**
- **Basic Processing**: All entities receive basic data (entity info, locations, employees)
- **Skip List**: Entities in skipEntityIds only get basic processing during `pnpm gen --full`
- **Manual Override**: Using `--entityId <ID>` or dashboard "Fetch Data" overrides skip configuration
- **Performance**: Reduces processing time by skipping large datasets

#### Simple Shop Data Integration
Simple Shop data is now automatically integrated into entity.json files during processing. No separate generation step required - Simple Shop entities are identified and enhanced with additional fields during normal processing.

**Note**: The transformer automatically processes all entities in the database - no entity ID specification required.

### Command Line Options

**General Options:**
- `--outputDir, -o`: Base output directory (default: `./output`)  
- `--prettyJson, -p`: Pretty print JSON (default: true)
- `--rewrite`: Clear output directory before processing (default: false)
- `--help`: Show help information

**Processing Mode Options:**
- Default (no flags): Demo mode - Simple Shop entities get full data, others get basic company.json only (fast for development)
- `--full`: Full mode - All entities get complete data processing (for production exports)
- `--entityId <id>`: Entity-specific mode - Specified entity gets full data, others get basic data (for debugging)

**Connection Method:**
- Automatic SSH tunnel management, no manual operation required

**Processing Behavior:**
- Automatically processes all entities (repair shops) in the database based on selected mode
- By default, skips already processed entities (resume mode) for faster incremental processing
- Use `--rewrite` flag to clear output directory and reprocess all entities from scratch

**Database Connection Options:**
- `--dbHost`: Database host (or use `MYSQL_HOST` environment variable)
- `--dbPort`: Database port (default: 3306)
- `--dbUser`: Database username (or use `MYSQL_USER` environment variable)
- `--dbPassword`: Database password (or use `MYSQL_PASSWORD` environment variable)  
- `--dbName`: Database name (or use `MYSQL_DATABASE` environment variable)

## Simple Shop Integration

The transformer now includes **Simple Shop Integration** that automatically identifies and enhances small repair shops with specialized data fields for simplified management.

### Simple Shop Identification Criteria
- **≤ 2 Active Locations**: Small physical footprint
- **< 5 Active Employees**: Limited staff size  
- **Active Entity Status**: Not cancelled, inactive, or suspended
- **Automatic Detection**: Uses SQL query to identify qualifying entities

### Simple Shop Enhanced Fields
```json
{
  "isSimpleShop": true,
  "locationCount": 1,
  "employeeCount": 3,
  "locationNames": ["Main Shop"],
  "employeeNames": ["John Doe", "Jane Smith", "Mike Wilson"],
  "accounting": {
    "totalRevenue": 125000,
    "totalInvoices": 45,
    "averageInvoiceAmount": 2777,
    "pendingPayments": 5500,
    "lastInvoiceDate": "2024-12-15",
    "completedOrders": 40,
    "pendingOrders": 5
  },
  "units": {
    "totalUnits": 25,
    "activeUnits": 20,
    "unitsServicedThisYear": 18,
    "unitTypes": ["Truck", "Trailer", "Excavator"],
    "mostCommonUnitType": "Truck",
    "unitsWithActiveServiceOrders": 3,
    "totalCustomers": 8
  }
}
```

### Use Cases
- **Simplified Management**: Streamlined interface for small shops
- **Quick Overview**: Essential metrics at a glance
- **Performance Optimization**: Faster loading for smaller operations
- **Targeted Features**: Features designed for small business needs

## Output Structure

### Denormalized Data Structure
The tool creates output directories with separate folders for each entity:

```
output/                           # Base output directory
├── processing_summary.json      # Processing metadata & statistics
├── 1/                           # Entity ID 1 (Full data entity)
│   ├── entity.json              # Entity root data + Simple Shop fields
│   ├── index.json               # Entity summary & statistics
│   ├── customers/               # Fleet customers served by this shop
│   │   ├── {customer-id}/
│   │   │   ├── entity.json      # Customer details
│   │   │   ├── index.json       # Customer summary
│   │   │   └── units/           # Customer's fleet units
│   │   │       ├── {unit-id}/
│   │   │       │   ├── entity.json         # Unit details
│   │   │       │   └── service-orders/     # Unit's repair orders
│   │   │       │       ├── {order-id}/
│   │   │       │       │   └── entity.json # Service order details
│   │   │       │       └── index.json     # Service orders summary
│   │   │       └── index.json   # Units summary
│   │   └── index.json           # Customers summary
├── 2/                           # Entity ID 2 (Simple Shop - basic data only)
│   ├── entity.json              # Enhanced with Simple Shop fields
│   └── index.json               # Basic summary
├── 3/                           # Entity ID 3 (Simple Shop - basic data only)
│   ├── entity.json              # Enhanced with Simple Shop fields
│   └── index.json               # Basic summary
└── ... (additional entities)
```

### Processing Modes

#### Demo Mode (Default)
- **Active Simple Shop Entities**: Get complete hierarchical data (customers → units → service orders)
- **Non-Active Simple Shop Entities**: Get basic entity.json only
- **Other Entities**: Get basic entity.json with Simple Shop enhancements only
- **Purpose**: Fast development and testing with representative data

#### Full Mode (`--full`)
- **All Active Entities**: Get complete hierarchical data where available
- **Non-Active Entities**: Get basic entity.json only
- **Simple Shops**: Enhanced with accounting and units summaries (only if Active)
- **Purpose**: Production data exports with complete information for active businesses

#### Entity-Specific Mode (`--entityId <id>`)
- **Specified Entity**: Gets complete hierarchical data (customers → units → service orders) **regardless of status or Simple Shop classification**
- **Other Entities**: Get basic entity.json with Simple Shop enhancements only (not processed for customers/service orders)
- **Purpose**: Debugging specific entities and fast processing for single entity analysis
- **Key Feature**: **No status or type restrictions** - processes the specified entity unconditionally

### Processing Modes: Resume vs Rewrite

#### Resume Mode (Default)
- **Behavior**: Skips entities that already have processed data files
- **Performance**: Fast incremental processing for development
- **Use Case**: Continuing interrupted processing or adding new entities
- **Command**: `pnpm gen` (no additional flags)

#### Rewrite Mode (`--rewrite`)
- **Behavior**: Clears entire output directory before processing
- **Performance**: Full reprocessing from database (slower but comprehensive)
- **Use Case**: Fresh data export, fixing corrupted data, or production exports
- **Command**: `pnpm gen --rewrite`

## Data Processing Flow

1. **Entity Processing**: Loads all repair shop businesses with their locations and employees
2. **Customer Processing**: Processes fleet companies served by each repair shop with their units and contacts  
3. **Service Order Processing**: Handles repair orders for each entity's customers with action items and totals
4. **Index Generation**: Creates summary indexes for efficient browsing
5. **Validation**: Ensures data integrity and completeness

## Data Sources

The tool connects directly to the MySQL database and loads data for all entities:

### Core Tables
- `Entity` - All repair shop businesses (primary Fullbay users/tenants)
- `EntityLocation` - Physical locations for the repair shop
- `Customer` - Fleet companies served by each repair shop
- `CustomerUnit` - Individual fleet vehicles/trailers owned by customers
- `RepairOrder` - Service orders/work orders for customer units across all entities
- `Address` - Address records referenced by entities and customers

### Supporting Tables
- `EntityEmployee` - All repair shop employees across entities (mechanics, service advisors)
- `CustomerEmployee` - Fleet company contacts (fleet managers, drivers)
- `RepairOrderActionItem` - Individual work items performed on service orders
- `CustomerPayment` - Payment records from fleet companies
- Additional related tables as needed

## JSON Structure

### Repair Shop (Entity) JSON
```json
{
  "entityId": 1,
  "basicInfo": {
    "status": "Active",
    "legalName": "Company Legal Name",
    "title": "Display Name"
  },
  "contact": {
    "phone": "(555) 123-4567",
    "email": "info@company.com",
    "addresses": [...]
  },
  "locations": [...],
  "employees": [...],
  "metadata": {
    "created": "2022-01-15T09:00:00Z",
    "exportTimestamp": "2024-12-15T14:30:22Z"
  }
}
```

### Fleet Customer JSON
```json
{
  "customerId": 123,
  "basicInfo": {
    "legalName": "Customer Legal Name",
    "title": "Display Name",
    "status": "Confirmed",
    "active": true
  },
  "units": [...],
  "serviceHistory": {
    "totalRepairOrders": 15,
    "completedOrders": 12,
    "lastServiceDate": "2024-11-15T14:30:00Z"
  },
  "financials": {
    "totalLifetimeValue": 125000,
    "outstandingBalance": 2500
  }
}
```

### Service Order JSON
```json
{
  "repairOrderId": 789,
  "repairOrderNumber": 2024001001,
  "basicInfo": {
    "workFlowStatus": "Completed",
    "description": "Oil change and brake service"
  },
  "customer": {
    "customerId": 123,
    "customerUnitId": 456
  },
  "actionItems": [...],
  "totals": {
    "laborTotal": 300.00,
    "totalAmount": 450.00
  }
}
```

## Error Handling

- Missing TSV files are logged as warnings and processing continues
- Invalid data is cleaned (empty strings → null)
- Processing errors are captured in the summary file
- Failed exports include error details and partial results

## Performance Considerations

### Complete Processing
- **Multi-Entity Processing**: Processes all repair shops' data in the database
- **Optimized SQL Queries**: Uses batch loading and efficient WHERE clauses for each entity
- **Relationship-Aware Loading**: Loads related data based on foreign key relationships
- **Efficient Bulk Queries**: Uses IN clauses for batch processing of related records

### Memory Efficiency
- **Batch Data Loading**: Loads data in batches to prevent memory overload
- **Connection Management**: Efficient MySQL connection handling with proper cleanup
- **Entity Isolation**: Processes each entity's data separately for memory efficiency

### Optimization Features  
- **Direct Database Queries**: Eliminates file I/O overhead
- **Indexed Lookups**: Takes advantage of database indexes for faster data retrieval
- **Multi-Entity Processing**: Processes all entities in a single run for maximum efficiency
- **Quality Tracking**: Monitors processing statistics and data quality metrics

## Development Notes

### Architecture
- **Modular Design**: Separate processors for each entity type
- **Type Safety**: Full TypeScript interfaces for all data structures
- **Extensible**: Easy to add new entity processors
- **Testable**: Isolated components with dependency injection

### Adding New Entity Types
1. Add interface to `types/DatabaseTypes.ts`
2. Create processor in `processors/`
3. Update main application flow
4. Add corresponding TSV file handling

## Troubleshooting

### Common Issues

**No Entities Found**: Verify database connection and that Entity table contains data

**Database Connection**: Verify database credentials and network connectivity to MySQL server

**Auto-Tunnel Connection Issues**: 
- Check SSH credentials in environment variables (REMOTE_HOST, REMOTE_USER, REMOTE_PASSWORD)
- Verify that the gateway server allows SSH connections
- Ensure the database is accessible from the gateway server
- Check network connectivity to the gateway server

**Manual SSH Tunnel Issues**: Check that SSH tunnel is established before running the transformer

**Processing Failures**: Check processing_summary.json for detailed error information

**Permission errors**: Ensure write permissions on output directory

### Auto-Tunnel Troubleshooting

If auto-tunnel mode fails, the system provides detailed error messages. Common fixes:

1. **SSH Authentication Errors**:
   ```bash
   # Check SSH credentials
   ssh admin@74.80.248.156  # Test manual connection
   ```

2. **Database Access from Gateway**:
   ```bash
   # Test from gateway server
   mysql -h fullbayproduction-copy.ccrb4rqyc6yi.us-west-2.rds.amazonaws.com -u username -p
   ```

3. **Fallback to Manual Mode**:
   ```bash
   # If auto-tunnel fails, use manual mode
   ssh -L 55306:fullbayproduction-copy.ccrb4rqyc6yi.us-west-2.rds.amazonaws.com:3306 admin@74.80.248.156
   # Then run: pnpm gen
   ```

### Debugging

Enable verbose logging by setting environment variable:
```bash
DEBUG=true npm run gen
```

## Contributing

1. Follow TypeScript best practices
2. Add tests for new functionality  
3. Update documentation for API changes
4. Ensure backwards compatibility with existing output structure

## License

UNLICENSED - Internal Fullbay tool
