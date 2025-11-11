import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    {
      name: 'serve-output-directory',
      configureServer(server) {
        // Read env from process (compose passes it in)
        const TRANSFORMER_BASE_URL = process.env.TRANSFORMER_BASE_URL || 'http://localhost:3001';
        // Cross-platform path resolution using relative paths
        const getOutputPath = () => {
          // Try current project path first (relative to dashboard directory)
          const currentPath = path.resolve(__dirname, '..', 'output');
          if (fs.existsSync(currentPath)) {
            return currentPath;
          }
          
          // Alternative relative path structure
          const alternativePath = path.resolve(__dirname, '..', '..', 'output');
          if (fs.existsSync(alternativePath)) {
            return alternativePath;
          }
          
          // Create output directory if it doesn't exist
          const defaultPath = path.resolve(__dirname, '..', 'output');
          if (!fs.existsSync(defaultPath)) {
            try {
              fs.mkdirSync(defaultPath, { recursive: true });
              console.log(`[API] Created output directory: ${defaultPath}`);
            } catch (error) {
              console.error(`[API] Failed to create output directory: ${error}`);
            }
          }
          
          return defaultPath;
        };

        // API endpoint to check if data exists (replaces timestamps)
        server.middlewares.use('/api/data-available', (req, res, next) => {
          try {
            const outputPath = getOutputPath();
            console.log(`[API] Checking data availability in: ${outputPath}`);
            
            const hasData = fs.existsSync(outputPath) && 
                           fs.readdirSync(outputPath).some(entry => 
                             fs.statSync(path.join(outputPath, entry)).isDirectory() &&
                             /^\d+$/.test(entry)
                           );
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({ available: hasData, path: outputPath }));
          } catch (error) {
            console.error('[API] Error checking data availability:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to check data availability' }));
          }
        });

        // API endpoint to trigger data fetching for a specific entity
        server.middlewares.use('/api/fetch-entity-data', (req, res, next) => {
          if (req.method !== 'POST') {
            res.writeHead(405);
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
          }

          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { entityId } = JSON.parse(body);
              
              if (!entityId) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Entity ID is required' }));
                return;
              }

              console.log(`[API] Triggering data fetch for entity ${entityId}`);
              
              // Call transformer server to process this entity
              const transformerResponse = await fetch(`${TRANSFORMER_BASE_URL}/process-entity/${entityId}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                signal: AbortSignal.timeout(1200000) // 20 minutes timeout (1200000ms)
              });

              if (transformerResponse.ok) {
                const result = await transformerResponse.json();
                
                // Clear the sorted entity cache to ensure fresh data on next request
                console.log(`[API] Clearing sorted entity cache after data fetch for entity ${entityId}`);
                sortedEntityCache = null;
                
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(JSON.stringify({ 
                  success: true, 
                  message: `Data fetching started for entity ${entityId}`,
                  result 
                }));
              } else {
                const errorText = await transformerResponse.text();
                console.error(`[API] Transformer server error:`, errorText);
                res.writeHead(500);
                res.end(JSON.stringify({ 
                  error: 'Failed to start data fetching', 
                  details: errorText 
                }));
              }
            } catch (error) {
              console.error('[API] Error triggering data fetch:', error);
              res.writeHead(500);
              res.end(JSON.stringify({ 
                error: 'Failed to trigger data fetch', 
                details: error.message 
              }));
            }
          });
        });

        // Cache for sorted entity IDs to improve performance
        let sortedEntityCache: { data: string[], timestamp: number, outputPath: string } | null = null;
        const CACHE_DURATION = 10000; // 10 seconds cache (reduced for dynamic data generation)
        
        // Helper function to get basic entity IDs (fast, for initial load)
        const getBasicEntityIds = (outputPath: string): string[] => {
          const entries = fs.readdirSync(outputPath, { withFileTypes: true });
          const entityDirs = entries
            .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => parseInt(a) - parseInt(b));
          
          console.log(`[API] Found ${entityDirs.length} entity directories (basic sort)`);
          return entityDirs;
        };

        // Helper function to get sorted entity IDs by data richness (slower, for background)
        const getSortedEntityIds = (outputPath: string): string[] => {
          // Check cache first
          const now = Date.now();
          if (sortedEntityCache && 
              sortedEntityCache.outputPath === outputPath &&
              (now - sortedEntityCache.timestamp) < CACHE_DURATION) {
            console.log(`[API] Using cached sorted entities (${sortedEntityCache.data.length} entities)`);
            return sortedEntityCache.data;
          }
          
          console.log(`[API] Computing sorted entities (cache miss or expired)...`);
          const startTime = Date.now();
          
          // First try to use output/index.json if it exists (much faster)
          const outputIndexPath = path.join(outputPath, 'index.json');
          if (fs.existsSync(outputIndexPath)) {
            try {
              const indexData = JSON.parse(fs.readFileSync(outputIndexPath, 'utf8'));
              if (indexData.entities && Array.isArray(indexData.entities)) {
                // Entities are already sorted in index.json, just extract entityIds
                const sortedEntities = indexData.entities;
                
                const result = sortedEntities.map((e: any) => e.entityId.toString());
                
                // Update cache
                const endTime = Date.now();
                sortedEntityCache = {
                  data: result,
                  timestamp: endTime,
                  outputPath: outputPath
                };
                
                const entitiesWithData = sortedEntities.filter((e: any) => e.totalData > 0).length;
                const entitiesWithoutData = sortedEntities.length - entitiesWithData;
                console.log(`[API] Sorted ${result.length} entities from index.json: ${entitiesWithData} with data, ${entitiesWithoutData} without data`);
                return result;
              }
            } catch (error) {
              console.warn(`[API] Failed to parse output/index.json, falling back to directory scanning:`, error.message);
            }
          }
          
          // Fallback: scan directories (slower)
          const entries = fs.readdirSync(outputPath, { withFileTypes: true });
          const entityDirs = entries
            .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
            .map(entry => entry.name);
          
          // Fast sorting based on index.json summary data if available
          const entitiesWithData: any[] = [];
          const entitiesWithoutData: any[] = [];
          
          for (const entityId of entityDirs) {
            try {
              const entityPath = path.join(outputPath, entityId);
              const indexJsonPath = path.join(entityPath, 'index.json');
              
              let totalCustomers = 0;
              let totalUnits = 0;
              let totalServiceOrders = 0;
              
              // Try to get summary data from index.json first (much faster)
              if (fs.existsSync(indexJsonPath)) {
                try {
                  const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
                  const summary = indexData.summary || {};
                  totalCustomers = summary.totalCustomers || 0;
                  totalUnits = summary.totalUnits || 0;
                  totalServiceOrders = summary.totalServiceOrders || 0;
                } catch (e) {
                  // If index.json parsing fails, fall back to directory scanning
                  const customersPath = path.join(entityPath, 'customers');
                  if (fs.existsSync(customersPath)) {
                    const customerDirs = fs.readdirSync(customersPath, { withFileTypes: true })
                      .filter(entry => entry.isDirectory());
                    totalCustomers = customerDirs.length;
                  }
                }
              } else {
                // No index.json, fall back to directory scanning
                const customersPath = path.join(entityPath, 'customers');
                if (fs.existsSync(customersPath)) {
                  const customerDirs = fs.readdirSync(customersPath, { withFileTypes: true })
                    .filter(entry => entry.isDirectory());
                  totalCustomers = customerDirs.length;
                }
              }
              
              const entityData = {
                entityId: parseInt(entityId),
                totalCustomers,
                totalUnits,
                totalServiceOrders,
                totalData: totalCustomers + totalUnits + totalServiceOrders
              };
              
              // Check if customers directory exists (not if it has data)
              const customersPath = path.join(entityPath, 'customers');
              if (fs.existsSync(customersPath)) {
                entitiesWithData.push(entityData);
              } else {
                entitiesWithoutData.push(entityData);
              }
              
            } catch (error) {
              console.warn(`[API] Failed to analyze entity ${entityId}:`, error.message);
              entitiesWithoutData.push({
                entityId: parseInt(entityId),
                totalCustomers: 0,
                totalUnits: 0,
                totalServiceOrders: 0,
                totalData: 0
              });
            }
          }
          
          // Sort entities with data by entity ID (ascending)
          entitiesWithData.sort((a, b) => a.entityId - b.entityId);
          
          // Sort entities without data by entity ID (ascending)
          entitiesWithoutData.sort((a, b) => a.entityId - b.entityId);
          
          // Combine: entities with data first, then entities without data
          const sortedEntities = [...entitiesWithData, ...entitiesWithoutData];
          const result = sortedEntities.map(e => e.entityId.toString());
          
          // Update cache
          const endTime = Date.now();
          sortedEntityCache = {
            data: result,
            timestamp: endTime,
            outputPath: outputPath
          };
          
          console.log(`[API] Computed sorted entities in ${endTime - startTime}ms (${result.length} entities)`);
          return result;
        };

        // API endpoint to search entities with fuzzy matching
        server.middlewares.use('/api/entities/search', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const query = url.searchParams.get('query')?.trim() || '';
            const status = url.searchParams.get('status')?.trim() || '';
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '100');
            
            // Allow search with either query or status (or both)
            if (!query && !status) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Search query or status filter is required' }));
              return;
            }
            
            const outputPath = getOutputPath();
            console.log(`[API] 🔍 Searching entities for query: "${query}", status: "${status}"`);
            
            if (!fs.existsSync(outputPath)) {
              res.writeHead(404);
              res.end(JSON.stringify({ error: 'Output directory not found' }));
              return;
            }
            
            let allEntities: any[] = [];
            
            // Try to use output/index.json first for better performance and rich data
            const outputIndexPath = path.join(outputPath, 'index.json');
            if (fs.existsSync(outputIndexPath)) {
              try {
                const indexData = JSON.parse(fs.readFileSync(outputIndexPath, 'utf8'));
                if (indexData.entities && Array.isArray(indexData.entities)) {
                  console.log(`[API] Using index.json for search (${indexData.entities.length} entities)`);
                  // Map entities to ensure they have all required fields including timestamps
                  allEntities = indexData.entities.map((entity: any) => {
                    const customersPath = path.join(outputPath, entity.entityId.toString(), 'customers');
                    const hasCustomersDir = entity.hasCustomersDir || fs.existsSync(customersPath);
                    
                    return {
                      ...entity,
                      // Ensure hasCustomersDir is up-to-date
                      hasCustomersDir: hasCustomersDir
                    };
                  });
                  console.log(`[API] 🔍 Sample entity structure for search:`, allEntities[0]);
                  console.log(`[API] 🔍 Sample entity hasCustomersDir check:`, {
                    entityId: allEntities[0]?.entityId,
                    originalHasCustomersDir: indexData.entities[0]?.hasCustomersDir,
                    updatedHasCustomersDir: allEntities[0]?.hasCustomersDir,
                    customersPathExists: fs.existsSync(path.join(outputPath, allEntities[0]?.entityId?.toString() || '0', 'customers'))
                  });
                }
              } catch (error) {
                console.warn(`[API] Failed to parse output/index.json for search:`, error.message);
              }
            }
            
            // Fallback: scan directories if index.json not available
            if (allEntities.length === 0) {
              console.log(`[API] Fallback: scanning directories for search`);
              const entries = fs.readdirSync(outputPath, { withFileTypes: true });
              const entityDirs = entries
                .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
                .map(entry => entry.name);
              
              // Load entity data from individual files
              for (const entityId of entityDirs) {
                try {
                  const entityJsonPath = path.join(outputPath, entityId, 'entity.json');
                  if (fs.existsSync(entityJsonPath)) {
                    const entityData = JSON.parse(fs.readFileSync(entityJsonPath, 'utf8'));
                    const entity = entityData.entity || entityData;
                    
                    // Check if customers directory exists
                    const customersPath = path.join(outputPath, entityId, 'customers');
                    const hasCustomersDir = fs.existsSync(customersPath);
                    
                    allEntities.push({
                      entityId: entity.entityId || parseInt(entityId),
                      title: entity.title || entity.legalName || `Entity ${entityId}`,
                      legalName: entity.legalName,
                      status: entity.status,
                      phone: entity.phone,
                      email: entity.email,
                      website: entity.website,
                      customers: 0, // Will be 0 for fallback method
                      units: 0,
                      serviceOrders: 0,
                      isSimpleShop: entity.isSimpleShop || false,
                      locationCount: entity.locationCount || 0,
                      employeeCount: entity.employeeCount || 0,
                      hasCustomersDir: hasCustomersDir,
                      lastUpdated: entity.lastUpdated,
                      processingStatus: entity.processingStatus,
                      fullData: entityData
                    });
                  }
                } catch (error) {
                  console.warn(`[API] Failed to load entity ${entityId} for search:`, error.message);
                }
              }
            }
            
            // Perform fuzzy search on entityId, title, legalName, status
            const searchLower = query.toLowerCase();
            const matchedEntities = allEntities.filter(entity => {
              const entityIdStr = entity.entityId?.toString() || '';
              const title = entity.title || '';
              const legalName = entity.legalName || '';
              const entityStatus = entity.status || '';
              
              // Check query match (if query is provided)
              const queryMatch = !query || (
                entityIdStr.includes(searchLower) ||
                title.toLowerCase().includes(searchLower) ||
                legalName.toLowerCase().includes(searchLower) ||
                entityStatus.toLowerCase().includes(searchLower)
              );
              
              // Check status match (if status filter is provided)
              // Map frontend status values to database status values
              let statusMatch = true;
              if (status) {
                const dbStatus = entityStatus;
                switch (status.toLowerCase()) {
                  case 'active':
                    statusMatch = dbStatus === 'Active';
                    break;
                  case 'on hold':
                    statusMatch = dbStatus === 'On Hold';
                    break;
                  case 'cancelled':
                    statusMatch = dbStatus === 'Cancelled';
                    break;
                  default:
                    statusMatch = dbStatus.toLowerCase() === status.toLowerCase();
                }
              }
              
              // Both conditions must be true (if they are provided)
              return queryMatch && statusMatch;
            });
            
            // Sort matched results: exact matches first, then partial matches
            matchedEntities.sort((a, b) => {
              const aEntityId = a.entityId?.toString() || '';
              const aTitle = a.title || '';
              const aLegalName = a.legalName || '';
              const aStatus = a.status || '';
              
              const bEntityId = b.entityId?.toString() || '';
              const bTitle = b.title || '';
              const bLegalName = b.legalName || '';
              const bStatus = b.status || '';
              
              // Check for exact matches (higher priority)
              const aExactMatch = (
                aEntityId === query ||
                aTitle.toLowerCase() === searchLower ||
                aLegalName.toLowerCase() === searchLower ||
                aStatus.toLowerCase() === searchLower
              );
              const bExactMatch = (
                bEntityId === query ||
                bTitle.toLowerCase() === searchLower ||
                bLegalName.toLowerCase() === searchLower ||
                bStatus.toLowerCase() === searchLower
              );
              
              if (aExactMatch && !bExactMatch) return -1;
              if (!aExactMatch && bExactMatch) return 1;
              
              // Secondary sort: by entityId ascending
              return a.entityId - b.entityId;
            });
            
            console.log(`[API] 🎯 Found ${matchedEntities.length} matches for "${query}"`);
            
            // Apply pagination to search results
            const totalResults = matchedEntities.length;
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalResults);
            const paginatedResults = matchedEntities.slice(startIndex, endIndex);
            
            // Add search metadata to results
            const entitiesWithSearchData = paginatedResults.map(entity => ({
              ...entity,
              searchQuery: query, // Store search query for highlighting
              searchMatches: {
                entityId: entity.entityId?.toString().toLowerCase().includes(searchLower),
                title: (entity.title || '').toLowerCase().includes(searchLower),
                legalName: (entity.legalName || '').toLowerCase().includes(searchLower),
                status: (entity.status || '').toLowerCase().includes(searchLower)
              }
            }));
            
            const response = {
              entities: entitiesWithSearchData,
              searchQuery: query,
              pagination: {
                page,
                limit,
                total: totalResults,
                totalPages: Math.ceil(totalResults / limit),
                hasNext: endIndex < totalResults,
                hasPrev: page > 1
              }
            };
            
            console.log(`[API] 📄 Returning ${paginatedResults.length} search results (page ${page}/${response.pagination.totalPages})`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(response));
            
          } catch (error) {
            console.error('[API] Error searching entities:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to search entities' }));
          }
        });

        // API endpoint to get entities by scanning directories
        server.middlewares.use('/api/entities', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '50');
            
            const outputPath = getOutputPath();
            
            console.log(`[API] Loading entities from: ${outputPath}`);
            
            if (!fs.existsSync(outputPath)) {
              res.writeHead(404);
              res.end(JSON.stringify({ error: 'Output directory not found' }));
              return;
            }
            
            // First try to use output/index.json if it exists (much faster and has rich data)
            const outputIndexPath = path.join(outputPath, 'index.json');
            if (fs.existsSync(outputIndexPath)) {
              try {
                const indexData = JSON.parse(fs.readFileSync(outputIndexPath, 'utf8'));
                if (indexData.entities && Array.isArray(indexData.entities)) {
                  console.log(`[API] Using index.json for entity list (contains rich statistical data)`);
                  console.log(`[API] Found ${indexData.entities.length} entities in index.json`);
                  
                  // 🚀 SMART SORTING: Update hasCustomersDir for all entities first, then sort
                  console.log(`[API] 🔄 Performing real-time sorting with updated hasCustomersDir values...`);
                  const entitiesWithUpdatedStatus = indexData.entities.map((entity: any) => {
                    let hasCustomersDir = entity.hasCustomersDir || false;
                    if (!hasCustomersDir) {
                      const customersPath = path.join(outputPath, entity.entityId.toString(), 'customers');
                      hasCustomersDir = fs.existsSync(customersPath);
                      if (hasCustomersDir) {
                        console.log(`[API] 🔄 Real-time update: Entity ${entity.entityId} now has customers directory`);
                      }
                    }
                    
                    return {
                      ...entity,
                      hasCustomersDir: hasCustomersDir // Update the status
                    };
                  });
                  
                  // 🎯 Re-sort entities: customers dir first, then by entityId
                  const sortedEntities = entitiesWithUpdatedStatus.sort((a, b) => {
                    // Primary sort: entities with customers directory first
                    if (a.hasCustomersDir && !b.hasCustomersDir) return -1;
                    if (!a.hasCustomersDir && b.hasCustomersDir) return 1;
                    // Secondary sort: by entityId ascending
                    return a.entityId - b.entityId;
                  });
                  
                  console.log(`[API] ✅ Sorted ${sortedEntities.length} entities with real-time hasCustomersDir status`);
                  
                  // Calculate pagination after sorting
                  const totalEntities = sortedEntities.length;
                  const startIndex = (page - 1) * limit;
                  const endIndex = Math.min(startIndex + limit, totalEntities);
                  const paginatedEntities = sortedEntities.slice(startIndex, endIndex);
                  
                  // Map to frontend format
                  const entities = paginatedEntities.map((entity: any) => {
                    return {
                      entityId: entity.entityId,
                      title: entity.title || entity.legalName || `Entity ${entity.entityId}`,
                      legalName: entity.legalName,
                      status: entity.status,
                      phone: entity.phone,
                      email: entity.email,
                      website: entity.website,
                      customers: entity.customers || 0,
                      units: entity.units || 0,
                      serviceOrders: entity.serviceOrders || 0,
                      isSimpleShop: entity.isSimpleShop || false,
                      locationCount: entity.locationCount || 0,
                      employeeCount: entity.employeeCount || 0,
                      hasIndexJson: true,
                      hasCustomersDir: entity.hasCustomersDir, // Already updated above
                      lastUpdated: entity.lastUpdated,
                      processingStatus: entity.processingStatus,
                      fullData: entity // Add full entity data for enhanced viewer
                    };
                  });
                  
                  const response = {
                    entities,
                    pagination: {
                      page,
                      limit,
                      total: totalEntities,
                      totalPages: Math.ceil(totalEntities / limit),
                      hasNext: endIndex < totalEntities,
                      hasPrev: page > 1
                    }
                  };
                  
                  console.log(`[API] Returning ${entities.length} entities from index.json (page ${page}/${response.pagination.totalPages})`);
                  
                  res.setHeader('Content-Type', 'application/json');
                  res.setHeader('Access-Control-Allow-Origin', '*');
                  res.setHeader('Cache-Control', 'no-cache');
                  res.end(JSON.stringify(response));
                  return;
                }
              } catch (error) {
                console.warn(`[API] Failed to parse output/index.json, falling back to directory scanning:`, error.message);
              }
            }
            
            // Fallback: Get sorted entity directories by data richness (same as entities-sorted)
            const entityDirs = getSortedEntityIds(outputPath);
            
            console.log(`[API] Found ${entityDirs.length} entity directories (sorted by data richness)`);
            
            // Calculate pagination
            const totalEntities = entityDirs.length;
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalEntities);
            const paginatedEntityDirs = entityDirs.slice(startIndex, endIndex);
            
            // Load entity data for this page
            const entities: any[] = [];
            for (const entityId of paginatedEntityDirs) {
              try {
                const entityJsonPath = path.join(outputPath, entityId, 'entity.json');
                const indexJsonPath = path.join(outputPath, entityId, 'index.json');
                
                if (fs.existsSync(entityJsonPath)) {
                  const entityData = JSON.parse(fs.readFileSync(entityJsonPath, 'utf8'));
                  
                  // Try to get summary data from index.json if it exists
                  let summaryData: any = {};
                  let hasIndexJson = false;
                  if (fs.existsSync(indexJsonPath)) {
                    try {
                      const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
                      summaryData = indexData.summary || {};
                      hasIndexJson = true;
                    } catch (indexError) {
                      console.warn(`[API] Failed to parse index.json for entity ${entityId}`);
                    }
                  }
                  
                  // Handle both nested and flat entity data structures
                  const entity = entityData.entity || entityData;
                  
                  // Check if customers directory exists (indicates full data processing)
                  const customersPath = path.join(outputPath, entityId, 'customers');
                  const hasCustomersDir = fs.existsSync(customersPath);
                  
                  entities.push({
                    entityId: entity.entityId || parseInt(entityId),
                    title: entity.title || entity.legalName || `Entity ${entityId}`,
                    legalName: entity.legalName,
                    status: entity.status,
                    phone: entity.phone,
                    email: entity.email,
                    website: entity.website,
                    customers: summaryData.totalCustomers || 0,
                    units: summaryData.totalUnits || 0,
                    serviceOrders: summaryData.totalServiceOrders || 0,
                    isSimpleShop: entity.isSimpleShop || false,
                    locationCount: entity.locationCount || 0,
                    employeeCount: entity.employeeCount || 0,
                    hasIndexJson: hasIndexJson,
                    hasCustomersDir: hasCustomersDir, // New field to check if full data exists
                    lastUpdated: summaryData.lastUpdated,
                    processingStatus: summaryData.processingStatus,
                    fullData: entityData // Add full entity data for enhanced viewer
                  });
                }
              } catch (error) {
                console.warn(`[API] Failed to load entity ${entityId}:`, error.message);
              }
            }
            
            const response = {
              entities,
              pagination: {
                page,
                limit,
                total: totalEntities,
                totalPages: Math.ceil(totalEntities / limit),
                hasNext: endIndex < totalEntities,
                hasPrev: page > 1
              }
            };
            
            console.log(`[API] Returning ${entities.length} entities (page ${page}/${response.pagination.totalPages})`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(response));
            
          } catch (error) {
            console.error('[API] Error loading entities:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to load entities' }));
          }
        });

        // API endpoint to discover shop structure (fast initial load)
        server.middlewares.use('/api/shop-structure', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const company = url.searchParams.get('company');
            
            const outputPath = getOutputPath();
            
            if (company) {
              // If company specified, list contents of that company directory
              const basePath = path.join(outputPath, company);
              const structure: any[] = [];
              
              if (fs.existsSync(basePath)) {
                const entries = fs.readdirSync(basePath, { withFileTypes: true });
                for (const entry of entries) {
                  structure.push({
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    isFile: entry.isFile(),
                    isDirectory: entry.isDirectory()
                  });
                }
              }
              
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify(structure));
            } else {
              // If no company specified, use fast entity listing
              const entityIds = getBasicEntityIds(outputPath);
              
              const result = {
                directories: entityIds,
                files: [],
                totalEntities: entityIds.length
              };
              
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify(result));
            }
          } catch (error) {
            console.error('[API] Error getting shop structure:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to get shop structure' }));
          }
        });

        // API endpoint to get sorted entities by data richness
        server.middlewares.use('/api/entities-sorted', (req, res, next) => {
          try {
            const outputPath = getOutputPath();
            console.log(`[API] Getting sorted entities from: ${outputPath}`);
            
            if (!fs.existsSync(outputPath)) {
              res.writeHead(404);
              res.end(JSON.stringify({ error: 'Output directory not found' }));
              return;
            }
            
            // Use the same sorting logic as /api/entities
            const sortedEntityIds = getSortedEntityIds(outputPath);
            
            // Count entities with and without data for stats
            let entitiesWithData = 0;
            let entitiesWithoutData = 0;
            
            for (const entityId of sortedEntityIds) {
              try {
                const entityPath = path.join(outputPath, entityId);
                const customersPath = path.join(entityPath, 'customers');
                
                if (fs.existsSync(customersPath)) {
                  const customerDirs = fs.readdirSync(customersPath, { withFileTypes: true })
                    .filter(entry => entry.isDirectory());
                  if (customerDirs.length > 0) {
                    entitiesWithData++;
                  } else {
                    entitiesWithoutData++;
                  }
                } else {
                  entitiesWithoutData++;
                }
              } catch (error) {
                entitiesWithoutData++;
              }
            }
            
            console.log(`[API] Sorted ${sortedEntityIds.length} entities: ${entitiesWithData} with data, ${entitiesWithoutData} without data`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({
              entityIds: sortedEntityIds,
              stats: {
                total: sortedEntityIds.length,
                withData: entitiesWithData,
                withoutData: entitiesWithoutData
              }
            }));
            
          } catch (error) {
            console.error('[API] Error getting sorted entities:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to get sorted entities' }));
          }
        });

        // API endpoint to get sorted customers by data richness
        server.middlewares.use('/api/customers-sorted', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityId = url.searchParams.get('entityId');
            
            if (!entityId) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing entityId' }));
              return;
            }
            
            const outputPath = getOutputPath();
            const customersPath = path.join(outputPath, entityId, 'customers');
            
            console.log(`[API] Getting sorted customers for entity ${entityId}`);
            
            if (!fs.existsSync(customersPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify({
                customerIds: [],
                stats: { total: 0, withData: 0, withoutData: 0 }
              }));
              return;
            }
            
            const customerDirs = fs.readdirSync(customersPath, { withFileTypes: true })
              .filter(entry => entry.isDirectory())
              .map(entry => entry.name);
            
            const customersWithData: any[] = [];
            const customersWithoutData: any[] = [];
            
            for (const customerId of customerDirs) {
              try {
                const unitsPath = path.join(customersPath, customerId, 'units');
                let totalUnits = 0;
                let totalServiceOrders = 0;
                
                if (fs.existsSync(unitsPath)) {
                  const unitDirs = fs.readdirSync(unitsPath, { withFileTypes: true })
                    .filter(entry => entry.isDirectory());
                  totalUnits = unitDirs.length;
                  
                  // Count service orders
                  for (const unitDir of unitDirs) {
                    const serviceOrdersPath = path.join(unitsPath, unitDir.name, 'service-orders');
                    if (fs.existsSync(serviceOrdersPath)) {
                      const serviceOrderDirs = fs.readdirSync(serviceOrdersPath, { withFileTypes: true })
                        .filter(entry => entry.isDirectory());
                      totalServiceOrders += serviceOrderDirs.length;
                    }
                  }
                }
                
                const customerData = {
                  customerId: parseInt(customerId),
                  totalUnits,
                  totalServiceOrders,
                  totalData: totalUnits + totalServiceOrders
                };
                
                if (totalUnits > 0) {
                  customersWithData.push(customerData);
                } else {
                  customersWithoutData.push(customerData);
                }
                
              } catch (error) {
                console.warn(`[API] Failed to analyze customer ${customerId}:`, error.message);
                customersWithoutData.push({
                  customerId: parseInt(customerId),
                  totalUnits: 0,
                  totalServiceOrders: 0,
                  totalData: 0
                });
              }
            }
            
            // Sort customers with data by total data count (descending)
            customersWithData.sort((a, b) => b.totalData - a.totalData);
            
            // Sort customers without data by customer ID
            customersWithoutData.sort((a, b) => a.customerId - b.customerId);
            
            // Combine: customers with data first, then customers without data
            const sortedCustomers = [...customersWithData, ...customersWithoutData];
            const sortedCustomerIds = sortedCustomers.map(c => c.customerId.toString());
            
            console.log(`[API] Sorted ${sortedCustomerIds.length} customers: ${customersWithData.length} with data, ${customersWithoutData.length} without data`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({
              customerIds: sortedCustomerIds,
              stats: {
                total: sortedCustomerIds.length,
                withData: customersWithData.length,
                withoutData: customersWithoutData.length
              }
            }));
            
          } catch (error) {
            console.error('[API] Error getting sorted customers:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to get sorted customers' }));
          }
        });

        // API endpoint to get sorted units by service orders count
        server.middlewares.use('/api/units-sorted', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityId = url.searchParams.get('entityId');
            const customerId = url.searchParams.get('customerId');
            
            if (!entityId || !customerId) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing entityId or customerId' }));
              return;
            }
            
            const outputPath = getOutputPath();
            const unitsPath = path.join(outputPath, entityId, 'customers', customerId, 'units');
            
            console.log(`[API] Getting sorted units for customer ${customerId}`);
            
            if (!fs.existsSync(unitsPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify({
                unitIds: [],
                stats: { total: 0, withData: 0, withoutData: 0 }
              }));
              return;
            }
            
            const unitDirs = fs.readdirSync(unitsPath, { withFileTypes: true })
              .filter(entry => entry.isDirectory())
              .map(entry => entry.name);
            
            const unitsWithData: any[] = [];
            const unitsWithoutData: any[] = [];
            
            for (const unitId of unitDirs) {
              try {
                const serviceOrdersPath = path.join(unitsPath, unitId, 'service-orders');
                let totalServiceOrders = 0;
                
                if (fs.existsSync(serviceOrdersPath)) {
                  const serviceOrderDirs = fs.readdirSync(serviceOrdersPath, { withFileTypes: true })
                    .filter(entry => entry.isDirectory());
                  totalServiceOrders = serviceOrderDirs.length;
                }
                
                const unitData = {
                  unitId: parseInt(unitId),
                  totalServiceOrders
                };
                
                if (totalServiceOrders > 0) {
                  unitsWithData.push(unitData);
                } else {
                  unitsWithoutData.push(unitData);
                }
                
              } catch (error) {
                console.warn(`[API] Failed to analyze unit ${unitId}:`, error.message);
                unitsWithoutData.push({
                  unitId: parseInt(unitId),
                  totalServiceOrders: 0
                });
              }
            }
            
            // Sort units with data by service orders count (descending)
            unitsWithData.sort((a, b) => b.totalServiceOrders - a.totalServiceOrders);
            
            // Sort units without data by unit ID
            unitsWithoutData.sort((a, b) => a.unitId - b.unitId);
            
            // Combine: units with data first, then units without data
            const sortedUnits = [...unitsWithData, ...unitsWithoutData];
            const sortedUnitIds = sortedUnits.map(u => u.unitId.toString());
            
            console.log(`[API] Sorted ${sortedUnitIds.length} units: ${unitsWithData.length} with data, ${unitsWithoutData.length} without data`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({
              unitIds: sortedUnitIds,
              stats: {
                total: sortedUnitIds.length,
                withData: unitsWithData.length,
                withoutData: unitsWithoutData.length
              }
            }));
            
          } catch (error) {
            console.error('[API] Error getting sorted units:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to get sorted units' }));
          }
        });

        // API endpoint to get customers with pagination
        server.middlewares.use('/api/customers', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityId = url.searchParams.get('entityId');
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '20');
            
            if (!entityId) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing entityId' }));
              return;
            }
            
            const outputPath = getOutputPath();
            const customersPath = path.join(outputPath, entityId, 'customers');
            const customersIndexPath = path.join(customersPath, 'index.json');
            
            console.log(`[API] Loading customers for entity ${entityId} (page ${page})`);
            
            if (!fs.existsSync(customersPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify({
                customers: [],
                pagination: {
                  page,
                  limit,
                  total: 0,
                  totalPages: 0,
                  hasNext: false,
                  hasPrev: false
                }
              }));
              return;
            }
            
            // Try to use customers/index.json first for better performance
            let allCustomers: any[] = [];
            let totalCustomers = 0;
            let useIndexJson = false;
            
            if (fs.existsSync(customersIndexPath)) {
              try {
                const indexData = JSON.parse(fs.readFileSync(customersIndexPath, 'utf-8'));
                allCustomers = indexData.customers || [];
                totalCustomers = indexData.totalCustomers || allCustomers.length;
                useIndexJson = true;
                console.log(`[API] Using customers/index.json with ${totalCustomers} customers`);
              } catch (e) {
                console.warn(`[API] Failed to parse customers/index.json, falling back to directory scan`);
                useIndexJson = false;
              }
            }
            
            // Fallback to directory scanning if index.json is not available
            if (!useIndexJson) {
              const customerDirs = fs.readdirSync(customersPath, { withFileTypes: true })
                .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
                .map(entry => entry.name)
                .sort((a, b) => parseInt(a) - parseInt(b));
              totalCustomers = customerDirs.length;
              
              // Create basic customer objects from directory names
              allCustomers = customerDirs.map(customerId => ({ customerId: parseInt(customerId) }));
            }
            
            // Calculate pagination
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalCustomers);
            const paginatedCustomers = allCustomers.slice(startIndex, endIndex);
            
            // Load customer data for this page
            const customers: any[] = [];
            
            if (useIndexJson) {
              // If using index.json, we already have the customer data
              for (const customerData of paginatedCustomers) {
                customers.push({
                  customerId: customerData.customerId,
                  title: customerData.title || customerData.legalName || `Customer ${customerData.customerId}`,
                  legalName: customerData.legalName,
                  status: customerData.status,
                  phone: customerData.phone,
                  email: customerData.email,
                  dotNumber: customerData.dotNumber,
                  creditLimit: customerData.creditLimit,
                  units: customerData.unitCount || customerData.units || 0,
                  serviceOrders: customerData.serviceOrders || 0,
                  hasIndexJson: true,
                  fullData: customerData // Store full data for modal
                });
              }
            } else {
              // Fallback: load individual customer files
              for (const customerObj of paginatedCustomers) {
                const customerId = customerObj.customerId.toString();
                try {
                  const customerPath = path.join(customersPath, customerId);
                  const entityJsonPath = path.join(customerPath, 'entity.json');
                  const indexJsonPath = path.join(customerPath, 'index.json');
                  
                  if (fs.existsSync(entityJsonPath)) {
                    const customerData = JSON.parse(fs.readFileSync(entityJsonPath, 'utf-8'));
                    
                    // Try to get summary data from index.json
                    let summaryData: any = {};
                    let hasIndexJson = false;
                    try {
                      if (fs.existsSync(indexJsonPath)) {
                        const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf-8'));
                        summaryData = indexData.summary || {};
                        hasIndexJson = true;
                      }
                    } catch (e) {
                      // Index doesn't exist or is invalid, continue with empty data
                    }
                    
                    customers.push({
                      customerId: customerData.customerId,
                      title: customerData.title || customerData.legalName || `Customer ${customerId}`,
                      legalName: customerData.legalName,
                      status: customerData.status,
                      phone: customerData.phone,
                      email: customerData.email,
                      dotNumber: customerData.dotNumber,
                      creditLimit: customerData.creditLimit,
                      units: summaryData.totalUnits || 0,
                      serviceOrders: summaryData.totalServiceOrders || 0,
                      hasIndexJson: hasIndexJson,
                      fullData: customerData // Store full data for modal
                    });
                  }
                } catch (error) {
                  console.warn(`[API] Failed to load customer ${customerId}:`, error.message);
                }
              }
            }
            
            const response = {
              customers,
              pagination: {
                page,
                limit,
                total: totalCustomers,
                totalPages: Math.ceil(totalCustomers / limit),
                hasNext: endIndex < totalCustomers,
                hasPrev: page > 1
              }
            };
            
            console.log(`[API] Returning ${customers.length} customers (page ${page}/${response.pagination.totalPages})`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(response));
            
          } catch (error) {
            console.error('[API] Error loading customers:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to load customers' }));
          }
        });

        // API endpoint to get units with pagination
        server.middlewares.use('/api/units', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityId = url.searchParams.get('entityId');
            const customerId = url.searchParams.get('customerId');
            const page = parseInt(url.searchParams.get('page') || '1');
            const limit = parseInt(url.searchParams.get('limit') || '20');
            
            if (!entityId || !customerId) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing entityId or customerId' }));
              return;
            }
            
            const outputPath = getOutputPath();
            const unitsPath = path.join(outputPath, entityId, 'customers', customerId, 'units');
            const unitsIndexPath = path.join(unitsPath, 'index.json');
            
            console.log(`[API] Loading units for entity ${entityId}, customer ${customerId} (page ${page})`);
            
            if (!fs.existsSync(unitsPath)) {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              res.end(JSON.stringify({
                units: [],
                pagination: {
                  page,
                  limit,
                  total: 0,
                  totalPages: 0,
                  hasNext: false,
                  hasPrev: false
                }
              }));
              return;
            }
            
            // Try to use units/index.json first for better performance
            let allUnits: any[] = [];
            let totalUnits = 0;
            let useIndexJson = false;
            
            if (fs.existsSync(unitsIndexPath)) {
              try {
                const indexData = JSON.parse(fs.readFileSync(unitsIndexPath, 'utf-8'));
                allUnits = indexData.units || [];
                totalUnits = indexData.totalUnits || allUnits.length;
                useIndexJson = true;
                console.log(`[API] Using units/index.json with ${totalUnits} units`);
              } catch (e) {
                console.warn(`[API] Failed to parse units/index.json, falling back to directory scan`);
                useIndexJson = false;
              }
            }
            
            // Fallback to directory scanning if index.json is not available
            if (!useIndexJson) {
              const unitDirs = fs.readdirSync(unitsPath, { withFileTypes: true })
                .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
                .map(entry => entry.name)
                .sort((a, b) => parseInt(a) - parseInt(b));
              totalUnits = unitDirs.length;
              
              // Create basic unit objects from directory names
              allUnits = unitDirs.map(unitId => ({ unitId: parseInt(unitId) }));
            }
            
            // Calculate pagination
            const startIndex = (page - 1) * limit;
            const endIndex = Math.min(startIndex + limit, totalUnits);
            const paginatedUnits = allUnits.slice(startIndex, endIndex);
            
            // Load unit data for this page
            const units: any[] = [];
            
            if (useIndexJson) {
              // If using index.json, we already have the unit data
              for (const unitData of paginatedUnits) {
                units.push({
                  unitId: unitData.unitId || unitData.customerUnitId,
                  customerUnitId: unitData.customerUnitId,
                  unitNumber: unitData.unitNumber || unitData.number || `Unit ${unitData.unitId || unitData.customerUnitId}`,
                  vin: unitData.vin,
                  year: unitData.year,
                  make: unitData.make,
                  model: unitData.model,
                  mileage: unitData.mileage,
                  status: unitData.status,
                  serviceOrders: unitData.serviceOrderCount || unitData.serviceOrders || 0,
                  hasIndexJson: true,
                  fullData: unitData // Store full data for modal
                });
              }
            } else {
              // Fallback: load individual unit files
              for (const unitObj of paginatedUnits) {
                const unitId = unitObj.unitId.toString();
                try {
                  const unitPath = path.join(unitsPath, unitId);
                  const entityJsonPath = path.join(unitPath, 'entity.json');
                  const indexJsonPath = path.join(unitPath, 'index.json');
                  
                  if (fs.existsSync(entityJsonPath)) {
                    const unitData = JSON.parse(fs.readFileSync(entityJsonPath, 'utf-8'));
                    
                    // Try to get summary data from index.json
                    let summaryData: any = {};
                    let hasIndexJson = false;
                    try {
                      if (fs.existsSync(indexJsonPath)) {
                        const indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf-8'));
                        summaryData = indexData.summary || {};
                        hasIndexJson = true;
                      }
                    } catch (e) {
                      // Index doesn't exist or is invalid, continue with empty data
                    }
                    
                    units.push({
                      unitId: unitData.unitId || unitData.customerUnitId,
                      customerUnitId: unitData.customerUnitId,
                      unitNumber: unitData.unitNumber || unitData.number || `Unit ${unitId}`,
                      vin: unitData.vin,
                      year: unitData.year,
                      make: unitData.make,
                      model: unitData.model,
                      mileage: unitData.mileage,
                      status: unitData.status,
                      serviceOrders: summaryData.totalServiceOrders || 0,
                      hasIndexJson: hasIndexJson,
                      fullData: unitData // Store full data for modal
                    });
                  }
                } catch (error) {
                  console.warn(`[API] Failed to load unit ${unitId}:`, error.message);
                }
              }
            }
            
            const response = {
              units,
              pagination: {
                page,
                limit,
                total: totalUnits,
                totalPages: Math.ceil(totalUnits / limit),
                hasNext: endIndex < totalUnits,
                hasPrev: page > 1
              }
            };
            
            console.log(`[API] Returning ${units.length} units (page ${page}/${response.pagination.totalPages})`);
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(response));
            
          } catch (error) {
            console.error('[API] Error loading units:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to load units' }));
          }
        });

        // API endpoint to list customer folders
        server.middlewares.use('/api/customer-folders', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const company = url.searchParams.get('company');
            
            if (!company) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Missing company' }));
              return;
            }
            
            const outputPath = getOutputPath();
            const customersPath = path.join(outputPath, company, 'customers');
            const folders: any[] = [];
            
            if (fs.existsSync(customersPath)) {
              const entries = fs.readdirSync(customersPath, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  folders.push(entry.name);
                }
              }
            }
            
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(folders));
          } catch (error) {
            console.error('[API] Error listing customer folders:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to list customer folders' }));
          }
        });

        // Analytics API endpoints
        server.middlewares.use('/api/analytics/overview', (req, res, next) => {
          try {
            const outputPath = getOutputPath();
            console.log(`[ANALYTICS] Computing overview statistics...`);
            
            const startTime = Date.now();
            const entities = fs.readdirSync(outputPath, { withFileTypes: true })
              .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
              .map(entry => entry.name);
            
            let totalEntities = entities.length;
            let entitiesWithAutocare = 0;
            let totalVehicles = 0;
            let totalMatchedVehicles = 0;
            let totalParts = 0;
            let totalMatchedParts = 0;
            let totalVehicleConfidence = 0;
            let totalPartsConfidence = 0;
            let vehicleConfidenceCount = 0;
            let partsConfidenceCount = 0;

            for (const entityId of entities) {
              const entityPath = path.join(outputPath, entityId, 'entity.json');
              if (fs.existsSync(entityPath)) {
                try {
                  const entityData = JSON.parse(fs.readFileSync(entityPath, 'utf8'));
                  if (entityData.autoCare || entityData.autocare) {
                    const autocare = entityData.autoCare || entityData.autocare;
                    entitiesWithAutocare++;
                    
                    if (autocare.vehicleMatching) {
                      const vm = autocare.vehicleMatching;
                      totalVehicles += vm.totalVehicles || 0;
                      totalMatchedVehicles += vm.matchedVehicles || 0;
                      if (vm.averageConfidence) {
                        totalVehicleConfidence += vm.averageConfidence;
                        vehicleConfidenceCount++;
                      }
                    }
                    
                    if (autocare.partsMatching) {
                      const pm = autocare.partsMatching;
                      if (pm.matchingStatistics) {
                        totalParts += pm.matchingStatistics.totalParts || 0;
                        totalMatchedParts += pm.matchingStatistics.matchedParts || 0;
                        if (pm.matchingStatistics.averageConfidence) {
                          totalPartsConfidence += pm.matchingStatistics.averageConfidence;
                          partsConfidenceCount++;
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[ANALYTICS] Error processing entity ${entityId}:`, error.message);
                }
              }
            }

            const overviewData = {
              totalEntities,
              entitiesWithAutocare,
              dataCompleteness: totalEntities > 0 ? (entitiesWithAutocare / totalEntities * 100).toFixed(1) : 0,
              vehicleStats: {
                totalVehicles,
                matchedVehicles: totalMatchedVehicles,
                matchRate: totalVehicles > 0 ? (totalMatchedVehicles / totalVehicles * 100).toFixed(1) : 0,
                averageConfidence: vehicleConfidenceCount > 0 ? (totalVehicleConfidence / vehicleConfidenceCount).toFixed(1) : 0
              },
              partsStats: {
                totalParts,
                matchedParts: totalMatchedParts,
                matchRate: totalParts > 0 ? (totalMatchedParts / totalParts * 100).toFixed(1) : 0,
                averageConfidence: partsConfidenceCount > 0 ? (totalPartsConfidence / partsConfidenceCount).toFixed(1) : 0
              },
              processingTime: Date.now() - startTime
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify(overviewData));
            
            console.log(`[ANALYTICS] Overview computed in ${overviewData.processingTime}ms`);
          } catch (error) {
            console.error('[ANALYTICS] Error computing overview:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to compute overview statistics' }));
          }
        });

        server.middlewares.use('/api/analytics/vehicle-matching', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityIdsParam = url.searchParams.get('entityIds');
            const filterEntityIds = entityIdsParam ? entityIdsParam.split(',').map(id => id.trim()) : null;
            
            const outputPath = getOutputPath();
            console.log(`[ANALYTICS] Computing vehicle matching statistics...`);
            if (filterEntityIds) {
              console.log(`[ANALYTICS] Filtering by entity IDs: ${filterEntityIds.join(', ')}`);
            }
            
            const startTime = Date.now();
            let entities = fs.readdirSync(outputPath, { withFileTypes: true })
              .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
              .map(entry => entry.name);
            
            // Apply entity ID filter if provided
            if (filterEntityIds) {
              entities = entities.filter(entityId => filterEntityIds.includes(entityId));
              console.log(`[ANALYTICS] Filtered to ${entities.length} entities`);
            }
            
            let matchingData = {
              totalVehicles: 0,
              exactMatches: 0,
              fuzzyMatches: 0,
              noMatches: 0,
              confidenceDistribution: [] as Array<{entityId: string, confidence: number, vehicles: number}>,
              failureReasons: {} as Record<string, number>,
              brandYearHeatmap: {},
              matchRateDistribution: [] as Array<{entityId: string, matchRate: number, totalVehicles: number}>,
              failureAnalytics: {
                uniqueFailureCount: 0,
                topFailurePatterns: {} as Record<string, number>,
                yearDistribution: {} as Record<string, number>,
                vinFailureStats: {
                  totalVinAttempts: 0,
                  vinDecodeFailures: 0,
                  vinFailureRate: 0,
                  commonVinIssues: {} as Record<string, number>
                }
              }
            };

            for (const entityId of entities) {
              const entityPath = path.join(outputPath, entityId, 'entity.json');
              if (fs.existsSync(entityPath)) {
                try {
                  const entityData = JSON.parse(fs.readFileSync(entityPath, 'utf8'));
                  const autocare = entityData.autoCare || entityData.autocare;
                  
                  if (autocare && autocare.vehicleMatching) {
                    const vm = autocare.vehicleMatching;
                    matchingData.totalVehicles += vm.totalVehicles || 0;
                    matchingData.exactMatches += vm.exactMatches || 0;
                    matchingData.fuzzyMatches += vm.fuzzyMatches || 0;
                    matchingData.noMatches += vm.noMatches || 0;
                    
                    // Confidence distribution
                    if (vm.averageConfidence) {
                      matchingData.confidenceDistribution.push({
                        entityId,
                        confidence: vm.averageConfidence,
                        vehicles: vm.totalVehicles
                      });
                    }
                    
                    // Match rate distribution
                    if (vm.matchRate !== undefined) {
                      matchingData.matchRateDistribution.push({
                        entityId,
                        matchRate: vm.matchRate,
                        totalVehicles: vm.totalVehicles
                      });
                    }
                    
                    // Failure reasons
                    if (vm.failureStatistics && vm.failureStatistics.failuresByReason) {
                      vm.failureStatistics.failuresByReason.forEach(failure => {
                        if (!matchingData.failureReasons[failure.reason]) {
                          matchingData.failureReasons[failure.reason] = 0;
                        }
                        matchingData.failureReasons[failure.reason] += failure.count;
                      });
                    }
                    
                    // Failure Analytics aggregation
                    if (vm.failureStatistics && vm.failureStatistics.failureAnalytics) {
                      const fa = vm.failureStatistics.failureAnalytics;
                      
                      // Aggregate unique failure count
                      matchingData.failureAnalytics.uniqueFailureCount += fa.uniqueFailureCount || 0;
                      
                      // Aggregate top failure patterns
                      if (fa.topFailurePatterns) {
                        fa.topFailurePatterns.forEach(pattern => {
                          if (!matchingData.failureAnalytics.topFailurePatterns[pattern.pattern]) {
                            matchingData.failureAnalytics.topFailurePatterns[pattern.pattern] = 0;
                          }
                          matchingData.failureAnalytics.topFailurePatterns[pattern.pattern] += pattern.count;
                        });
                      }
                      
                      // Aggregate year distribution
                      if (fa.yearDistribution) {
                        fa.yearDistribution.forEach(year => {
                          if (!matchingData.failureAnalytics.yearDistribution[year.yearRange]) {
                            matchingData.failureAnalytics.yearDistribution[year.yearRange] = 0;
                          }
                          matchingData.failureAnalytics.yearDistribution[year.yearRange] += year.count;
                        });
                      }
                      
                      // Aggregate VIN failure stats
                      if (fa.vinFailureStats) {
                        const vfs = fa.vinFailureStats;
                        matchingData.failureAnalytics.vinFailureStats.totalVinAttempts += vfs.totalVinAttempts || 0;
                        matchingData.failureAnalytics.vinFailureStats.vinDecodeFailures += vfs.vinDecodeFailures || 0;
                        
                        if (vfs.commonVinIssues) {
                          vfs.commonVinIssues.forEach(issue => {
                            if (!matchingData.failureAnalytics.vinFailureStats.commonVinIssues[issue.issue]) {
                              matchingData.failureAnalytics.vinFailureStats.commonVinIssues[issue.issue] = 0;
                            }
                            matchingData.failureAnalytics.vinFailureStats.commonVinIssues[issue.issue] += issue.count;
                          });
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[ANALYTICS] Error processing entity ${entityId}:`, error.message);
                }
              }
            }

            // Convert failure reasons to array format for charts
            const failureReasonsArray = Object.entries(matchingData.failureReasons)
              .map(([reason, count]) => ({ reason, count: count as number }))
              .sort((a, b) => b.count - a.count);

            // Convert failureAnalytics aggregated data to proper format
            const processedFailureAnalytics = {
              uniqueFailureCount: matchingData.failureAnalytics.uniqueFailureCount,
              topFailurePatterns: Object.entries(matchingData.failureAnalytics.topFailurePatterns)
                .map(([pattern, count]) => ({
                  pattern,
                  count: count as number,
                  percentage: parseFloat(((count as number / matchingData.failureAnalytics.uniqueFailureCount * 100) || 0).toFixed(1))
                }))
                .sort((a, b) => b.count - a.count),
              yearDistribution: Object.entries(matchingData.failureAnalytics.yearDistribution)
                .map(([yearRange, count]) => ({
                  yearRange,
                  count: count as number,
                  percentage: parseFloat(((count as number / matchingData.failureAnalytics.uniqueFailureCount * 100) || 0).toFixed(1))
                }))
                .sort((a, b) => b.count - a.count),
              vinFailureStats: {
                ...matchingData.failureAnalytics.vinFailureStats,
                vinFailureRate: parseFloat((matchingData.failureAnalytics.vinFailureStats.totalVinAttempts > 0 
                  ? (matchingData.failureAnalytics.vinFailureStats.vinDecodeFailures / matchingData.failureAnalytics.vinFailureStats.totalVinAttempts * 100)
                  : 0).toFixed(1)),
                commonVinIssues: Object.entries(matchingData.failureAnalytics.vinFailureStats.commonVinIssues)
                  .map(([issue, count]) => ({ issue, count: count as number }))
                  .sort((a, b) => b.count - a.count)
              }
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({
              ...matchingData,
              failureReasons: failureReasonsArray,
              failureAnalytics: processedFailureAnalytics,
              processingTime: Date.now() - startTime
            }));
            
            console.log(`[ANALYTICS] Vehicle matching computed in ${Date.now() - startTime}ms`);
          } catch (error) {
            console.error('[ANALYTICS] Error computing vehicle matching:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to compute vehicle matching statistics' }));
          }
        });

        server.middlewares.use('/api/analytics/parts-matching', (req, res, next) => {
          try {
            const url = new URL(req.url || '', `http://${req.headers.host}`);
            const entityIdsParam = url.searchParams.get('entityIds');
            const filterEntityIds = entityIdsParam ? entityIdsParam.split(',').map(id => id.trim()) : null;
            
            const outputPath = getOutputPath();
            console.log(`[ANALYTICS] Computing parts matching statistics...`);
            if (filterEntityIds) {
              console.log(`[ANALYTICS] Filtering by entity IDs: ${filterEntityIds.join(', ')}`);
            }
            
            const startTime = Date.now();
            let entities = fs.readdirSync(outputPath, { withFileTypes: true })
              .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
              .map(entry => entry.name);
            
            // Apply entity ID filter if provided
            if (filterEntityIds) {
              entities = entities.filter(entityId => filterEntityIds.includes(entityId));
              console.log(`[ANALYTICS] Filtered to ${entities.length} entities`);
            }
            
            let matchingData = {
              totalParts: 0,
              matchedParts: 0,
              exactMatches: 0,
              fuzzyMatches: 0,
              descriptionMatches: 0,
              keywordMatches: 0,
              noMatches: 0,
              failureReasons: {} as Record<string, number>,
              commonFailures: {} as Record<string, number>,
              matchRateDistribution: [] as Array<{entityId: string, matchRate: number, totalParts: number}>,
              confidenceDistribution: [] as Array<{entityId: string, confidence: number, parts: number}>,
              failureAnalytics: {
                uniqueFailedParts: 0,
                failuresByCategory: {} as Record<string, number>,
                failureDistribution: {
                  byFrequency: {} as Record<string, number>,
                  topFailureReasons: {} as Record<string, number>
                }
              }
            };

            for (const entityId of entities) {
              const entityPath = path.join(outputPath, entityId, 'entity.json');
              if (fs.existsSync(entityPath)) {
                try {
                  const entityData = JSON.parse(fs.readFileSync(entityPath, 'utf8'));
                  const autocare = entityData.autoCare || entityData.autocare;
                  
                  if (autocare && autocare.partsMatching) {
                    const pm = autocare.partsMatching;
                    
                    if (pm.matchingStatistics) {
                      const ms = pm.matchingStatistics;
                      matchingData.totalParts += ms.totalParts || 0;
                      matchingData.matchedParts += ms.matchedParts || 0;
                      matchingData.exactMatches += ms.exactMatches || 0;
                      matchingData.fuzzyMatches += ms.fuzzyMatches || 0;
                      matchingData.descriptionMatches += ms.descriptionMatches || 0;
                      matchingData.keywordMatches += ms.keywordMatches || 0;
                      matchingData.noMatches += ms.noMatches || 0;
                      
                      // Match rate and confidence distribution
                      if (ms.matchRate !== undefined) {
                        matchingData.matchRateDistribution.push({
                          entityId,
                          matchRate: ms.matchRate,
                          totalParts: ms.totalParts
                        });
                      }
                      
                      if (ms.averageConfidence) {
                        matchingData.confidenceDistribution.push({
                          entityId,
                          confidence: ms.averageConfidence,
                          parts: ms.totalParts
                        });
                      }
                    }
                    
                    // Failure reasons
                    if (pm.failureStatistics && pm.failureStatistics.failuresByReason) {
                      pm.failureStatistics.failuresByReason.forEach(failure => {
                        if (!matchingData.failureReasons[failure.reason]) {
                          matchingData.failureReasons[failure.reason] = 0;
                        }
                        matchingData.failureReasons[failure.reason] += failure.count;
                      });
                    }
                    
                    // Common failures
                    if (pm.failureStatistics && pm.failureStatistics.commonFailures) {
                      pm.failureStatistics.commonFailures.forEach(failure => {
                        if (!matchingData.commonFailures[failure.partName]) {
                          matchingData.commonFailures[failure.partName] = 0;
                        }
                        matchingData.commonFailures[failure.partName] += failure.count;
                      });
                    }
                    
                    // Parts Failure Analytics aggregation
                    if (pm.failureStatistics && pm.failureStatistics.failureAnalytics) {
                      const fa = pm.failureStatistics.failureAnalytics;
                      
                      // Aggregate unique failed parts count
                      matchingData.failureAnalytics.uniqueFailedParts += fa.uniqueFailedParts || 0;
                      
                      // Aggregate failures by category
                      if (fa.failuresByCategory) {
                        fa.failuresByCategory.forEach(category => {
                          if (!matchingData.failureAnalytics.failuresByCategory[category.category]) {
                            matchingData.failureAnalytics.failuresByCategory[category.category] = 0;
                          }
                          matchingData.failureAnalytics.failuresByCategory[category.category] += category.count;
                        });
                      }
                      
                      
                      // Aggregate failure distribution
                      if (fa.failureDistribution) {
                        // By frequency
                        if (fa.failureDistribution.byFrequency) {
                          fa.failureDistribution.byFrequency.forEach(freq => {
                            if (!matchingData.failureAnalytics.failureDistribution.byFrequency[freq.range]) {
                              matchingData.failureAnalytics.failureDistribution.byFrequency[freq.range] = 0;
                            }
                            matchingData.failureAnalytics.failureDistribution.byFrequency[freq.range] += freq.count;
                          });
                        }
                        
                        // Top failure reasons
                        if (fa.failureDistribution.topFailureReasons) {
                          fa.failureDistribution.topFailureReasons.forEach(reason => {
                            if (!matchingData.failureAnalytics.failureDistribution.topFailureReasons[reason.reason]) {
                              matchingData.failureAnalytics.failureDistribution.topFailureReasons[reason.reason] = 0;
                            }
                            matchingData.failureAnalytics.failureDistribution.topFailureReasons[reason.reason] += reason.count;
                          });
                        }
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[ANALYTICS] Error processing entity ${entityId}:`, error.message);
                }
              }
            }

            // Convert to array formats for charts
            const failureReasonsArray = Object.entries(matchingData.failureReasons)
              .map(([reason, count]) => ({ reason, count: count as number }))
              .sort((a, b) => b.count - a.count);
              
            const commonFailuresArray = Object.entries(matchingData.commonFailures)
              .map(([partName, count]) => ({ partName, count: count as number }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 20); // Top 20

            // Calculate total parts failures for percentage calculation
            const totalPartFailures = Object.values(matchingData.failureAnalytics.failuresByCategory).reduce((sum, count) => sum + (count as number), 0);

            // Convert failureAnalytics aggregated data to proper format
            const processedFailureAnalytics = {
              uniqueFailedParts: matchingData.failureAnalytics.uniqueFailedParts,
              failuresByCategory: Object.entries(matchingData.failureAnalytics.failuresByCategory)
                .map(([category, count]) => ({
                  category,
                  count: count as number,
                  percentage: parseFloat(((count as number / totalPartFailures * 100) || 0).toFixed(1))
                }))
                .sort((a, b) => b.count - a.count),
              failureDistribution: {
                byFrequency: Object.entries(matchingData.failureAnalytics.failureDistribution.byFrequency)
                  .map(([range, count]) => ({
                    range,
                    count: count as number,
                    percentage: parseFloat(((count as number / matchingData.failureAnalytics.uniqueFailedParts * 100) || 0).toFixed(1))
                  }))
                  .sort((a, b) => b.count - a.count),
                topFailureReasons: Object.entries(matchingData.failureAnalytics.failureDistribution.topFailureReasons)
                  .map(([reason, count]) => ({
                    reason,
                    count: count as number,
                    percentage: parseFloat(((count as number / totalPartFailures * 100) || 0).toFixed(1))
                  }))
                  .sort((a, b) => b.count - a.count)
              }
            };

            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.end(JSON.stringify({
              ...matchingData,
              failureReasons: failureReasonsArray,
              commonFailures: commonFailuresArray,
              failureAnalytics: processedFailureAnalytics,
              processingTime: Date.now() - startTime
            }));
            
            console.log(`[ANALYTICS] Parts matching computed in ${Date.now() - startTime}ms`);
          } catch (error) {
            console.error('[ANALYTICS] Error computing parts matching:', error);
            res.writeHead(500);
            res.end(JSON.stringify({ error: 'Failed to compute parts matching statistics' }));
          }
        });

        server.middlewares.use('/output', (req, res, next) => {
          try {
            const outputBasePath = getOutputPath();
            const filePath = path.join(outputBasePath, decodeURIComponent(req.url || ''));
            
            console.log(`[OUTPUT] Request: ${req.url} -> ${filePath}`);
            
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              if (filePath.endsWith('.json')) {
                res.setHeader('Content-Type', 'application/json');
              }
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Cache-Control', 'no-cache');
              
              console.log(`[OUTPUT] ✅ Serving: ${filePath}`);
              fs.createReadStream(filePath).pipe(res);
              return;
            }
            
            console.log(`[OUTPUT] ❌ Not found: ${filePath}`);
            res.writeHead(404);
            res.end('Not found');
          } catch (error) {
            console.error('[OUTPUT] Error:', error);
            res.writeHead(500);
            res.end('Server error');
          }
        });
      }
    }
  ],
  server: {
    port: 3002,
    open: false
  }
});
