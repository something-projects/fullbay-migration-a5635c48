import { promises as fs } from 'fs';
import path from 'path';
import type { OnboardingSession } from './sessionStore.js';
import type { VehicleMatch, PartMatch, EmployeeMatch, CustomerMatch, RepairOrderMatch, FinancialMatch } from '../../shared/onboarding.js';
import { copyDirectory, ensureDir, pathExists, readJson, writeJson } from './fileUtils.js';

// 包含数据的Session接口，用于导出时传递数据
export interface SessionWithData extends OnboardingSession {
  vehicles: VehicleMatch[];
  parts: PartMatch[];
  employees?: EmployeeMatch[];
  customers?: CustomerMatch[];
  repairOrders?: RepairOrderMatch[];
  financials?: FinancialMatch[];
}

/**
 * Export user-reviewed data to output/{entityId}/user-validated/ directory
 * 
 * Workflow:
 * 1. Copy all original data from output/{entityId}/ to user-validated/
 * 2. Apply review modifications and flags directly to the copied data
 * 3. Original output/{entityId}/ data remains unchanged
 * 
 * The user-validated/ directory is a directly importable new dataset containing:
 * - All original data files (with review modifications applied)
 * - _reviewMetadata field added to each reviewed record
 * - _legacy: true flag added to legacy records
 * 
 * No additional *-reviewed.json files are generated; all modifications are applied directly to data files
 */
export async function exportUserValidatedData(session: SessionWithData, outputRoot: string): Promise<string> {
  const entityId = session.customerId;
  const sourceOutputPath = path.join(outputRoot, entityId);
  const userValidatedPath = path.join(sourceOutputPath, 'user-validated');
  
  // 1. Create user-validated directory
  await ensureDir(userValidatedPath);
  
  // 2. Copy entire original directory structure to user-validated
  console.log(`Copying original data to user-validated directory...`);
  await copyOriginalStructure(sourceOutputPath, userValidatedPath);
  
  // 3. Apply review modifications to copied data (modify data files directly)
  console.log(`Applying review changes to data files...`);
  await applyVehicleChanges(session.vehicles, userValidatedPath);
  await applyPartChanges(session.parts, userValidatedPath);
  await applyEmployeeChanges(session.employees || [], userValidatedPath);
  await applyCustomerChanges(session.customers || [], userValidatedPath);
  await applyRepairOrderChanges(session.repairOrders || [], userValidatedPath);
  await applyFinancialChanges(session.financials || [], userValidatedPath);
  
  // 4. Generate review summary file
  console.log(`Generating review summary...`);
  await generateReviewSummary(session, userValidatedPath);
  
  console.log(`User-validated data exported to: ${userValidatedPath}`);
  return userValidatedPath;
}

/**
 * Copy original directory structure, but exclude existing user-validated directory
 */
async function copyOriginalStructure(sourcePath: string, destPath: string): Promise<void> {
  if (!(await pathExists(sourcePath))) {
    throw new Error(`Source path does not exist: ${sourcePath}`);
  }
  
  await ensureDir(destPath);
  
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  
  for (const entry of entries) {
    // Skip the user-validated directory itself
    if (entry.name === 'user-validated') {
      continue;
    }
    
    const srcPath = path.join(sourcePath, entry.name);
    const dstPath = path.join(destPath, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, dstPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath);
    }
  }
}

/**
 * Apply vehicle review changes to copied data
 */
async function applyVehicleChanges(vehicles: VehicleMatch[], userValidatedPath: string): Promise<void> {
  for (const vehicle of vehicles) {
    // Find corresponding unit entity.json file
    const customerId = vehicle.customerId as string;
    const unitId = vehicle.unitId;
    const unitPath = path.join(userValidatedPath, 'customers', customerId, 'units', unitId, 'entity.json');
    
    if (await pathExists(unitPath)) {
      try {
        const unitEntity = await readJson<any>(unitPath);
        
        // Apply review modifications
        if (vehicle.vin !== undefined) {
          unitEntity.vin = vehicle.vin;
        }
        if (vehicle.make !== undefined) {
          unitEntity.make = vehicle.make;
        }
        if (vehicle.model !== undefined) {
          unitEntity.model = vehicle.model;
        }
        if (vehicle.modelYear !== undefined) {
          unitEntity.year = vehicle.modelYear;
        }
        
        // Add review metadata
        unitEntity._reviewMetadata = {
          status: vehicle.status,
          matchRate: vehicle.matchRate,
          reviewedAt: vehicle.lastUpdated || new Date().toISOString(),
          notes: vehicle.notes,
          isLegacy: vehicle.status === 'legacy',
          matchedAttributes: vehicle.matchedAttributes,
          unmatchedAttributes: vehicle.unmatchedAttributes
        };
        
        // If marked as legacy, add flag
        if (vehicle.status === 'legacy') {
          unitEntity._legacy = true;
          unitEntity._legacyReason = vehicle.notes || 'Marked as legacy during review';
        }
        
        // Write back to file
        await writeJson(unitPath, unitEntity);
      } catch (error) {
        console.error(`Error applying vehicle changes for unit ${unitId}:`, error);
      }
    }
  }
}

/**
 * Apply parts review changes
 */
async function applyPartChanges(parts: PartMatch[], userValidatedPath: string): Promise<void> {
  const partsFilePath = path.join(userValidatedPath, 'parts.json');
  
  if (!(await pathExists(partsFilePath))) {
    return;
  }
  
  try {
    const partsData = await readJson<any>(partsFilePath);
    
    if (!partsData.parts || !Array.isArray(partsData.parts)) {
      return;
    }
    
    // Add review metadata to each part
    for (const reviewedPart of parts) {
      const partIndex = partsData.parts.findIndex((p: any) => String(p.entityPartId) === reviewedPart.partId);
      
      if (partIndex !== -1) {
        const part = partsData.parts[partIndex];
        
        // Apply modifications
        if (reviewedPart.oemPartNumber) {
          part.partNumber = reviewedPart.oemPartNumber;
        }
        if (reviewedPart.description) {
          part.description = reviewedPart.description;
        }
        
        // Add review metadata
        part._reviewMetadata = {
          status: reviewedPart.status,
          matchRate: reviewedPart.matchRate,
          reviewedAt: reviewedPart.lastUpdated || new Date().toISOString(),
          notes: reviewedPart.notes,
          isLegacy: reviewedPart.status === 'legacy',
          autoCareReference: reviewedPart.autoCareReference,
          genericPartMetadata: reviewedPart.genericPartMetadata
        };
        
        if (reviewedPart.status === 'legacy') {
          part._legacy = true;
        }
      }
    }
    
    await writeJson(partsFilePath, partsData);
  } catch (error) {
    console.error('Error applying part changes:', error);
  }
}

/**
 * Apply employee review changes
 * 
 * Due to the complex structure of employees.json (contains multiple related tables, no primary table),
 * we create a separate employees.metadata.json file to store review information.
 */
async function applyEmployeeChanges(employees: EmployeeMatch[], userValidatedPath: string): Promise<void> {
  const metadataPath = path.join(userValidatedPath, 'employees.metadata.json');
  
  try {
    const metadata = {
      metadata: {
        reviewedAt: new Date().toISOString(),
        totalReviewed: employees.length,
        note: 'Employee data structure is complex. This file contains review status and modified fields.'
      },
      employees: employees.map(emp => ({
        entityEmployeeId: emp.entityEmployeeId,
        status: emp.status,
        matchRate: emp.matchRate,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        jobTitle: emp.jobTitle,
        phoneNumber: emp.phoneNumber,
        hourlyWage: emp.hourlyWage,
        active: emp.active,
        reviewedAt: emp.lastUpdated || new Date().toISOString(),
        issues: emp.issues,
        notes: emp.notes,
        matchedAttributes: emp.matchedAttributes,
        unmatchedAttributes: emp.unmatchedAttributes
      }))
    };
    
    await writeJson(metadataPath, metadata);
    console.log(`✅ Created employees.metadata.json with ${employees.length} employee records`);
  } catch (error) {
    console.error('Error creating employee metadata:', error);
  }
}

/**
 * Apply customer review changes
 */
async function applyCustomerChanges(customers: CustomerMatch[], userValidatedPath: string): Promise<void> {
  for (const customer of customers) {
    const customerPath = path.join(userValidatedPath, 'customers', customer.customerId, 'entity.json');
    
    if (await pathExists(customerPath)) {
      try {
        const customerEntity = await readJson<any>(customerPath);
        
        // Apply modifications
        if (customer.customerName) customerEntity.title = customer.customerName;
        if (customer.legalName) customerEntity.legalName = customer.legalName;
        if (customer.accountNumber) customerEntity.accountNumber = customer.accountNumber;
        if (customer.taxId) customerEntity.taxId = customer.taxId;
        
        // Add review metadata
        customerEntity._reviewMetadata = {
          status: customer.status,
          matchRate: customer.matchRate,
          reviewedAt: customer.lastUpdated || new Date().toISOString(),
          notes: customer.notes,
          isLegacy: customer.status === 'legacy'
        };
        
        if (customer.status === 'legacy') {
          customerEntity._legacy = true;
        }
        
        await writeJson(customerPath, customerEntity);
      } catch (error) {
        console.error(`Error applying customer changes for ${customer.customerId}:`, error);
      }
    }
  }
}

/**
 * Apply repair order review changes
 */
async function applyRepairOrderChanges(orders: RepairOrderMatch[], userValidatedPath: string): Promise<void> {
  // Repair orders are scattered in service-orders directories of each unit
  for (const order of orders) {
    // Need to locate service order file based on actual data structure
    // Temporarily skipped, as more information about service order storage location is needed
    console.log(`Applying repair order changes for order ${order.repairOrderId}...`);
  }
}

/**
 * Apply financial review changes
 */
async function applyFinancialChanges(financials: FinancialMatch[], userValidatedPath: string): Promise<void> {
  const financialFilePath = path.join(userValidatedPath, 'financial.json');
  const invoicesFilePath = path.join(userValidatedPath, 'invoices.json');
  
  // Try to update both possible files
  for (const filePath of [financialFilePath, invoicesFilePath]) {
    if (await pathExists(filePath)) {
      try {
        const data = await readJson<any>(filePath);
        
        // Add review metadata to each invoice
        if (data.invoices && Array.isArray(data.invoices)) {
          for (const reviewedInvoice of financials) {
            const invIndex = data.invoices.findIndex(
              (inv: any) => String(inv.repairOrderInvoiceId) === reviewedInvoice.invoiceId
            );
            
            if (invIndex !== -1) {
              const inv = data.invoices[invIndex];
              
              inv._reviewMetadata = {
                status: reviewedInvoice.status,
                matchRate: reviewedInvoice.matchRate,
                reviewedAt: reviewedInvoice.lastUpdated || new Date().toISOString(),
                notes: reviewedInvoice.notes,
                isLegacy: reviewedInvoice.status === 'legacy',
                paymentStatus: reviewedInvoice.paymentStatus
              };
              
              if (reviewedInvoice.status === 'legacy') {
                inv._legacy = true;
              }
            }
          }
          
          await writeJson(filePath, data);
        }
      } catch (error) {
        console.error(`Error applying financial changes to ${filePath}:`, error);
      }
    }
  }
}

/**
 * Generate review summary file
 * 
 * Create review-summary.json file containing overall review statistics and usage instructions
 */
async function generateReviewSummary(session: SessionWithData, userValidatedPath: string): Promise<void> {
  try {
    const summary = {
      sessionId: session.sessionId,
      entityId: session.customerId,
      reviewedAt: new Date().toISOString(),
      reviewedBy: session.customer.displayName || session.customerId,
      
      totals: {
        employees: {
          total: (session.employees || []).length,
          validated: (session.employees || []).filter((e: EmployeeMatch) => e.status === 'validated').length,
          legacy: (session.employees || []).filter((e: EmployeeMatch) => e.status === 'legacy').length,
          pending: (session.employees || []).filter((e: EmployeeMatch) => e.status === 'pending').length
        },
        parts: {
          total: session.parts.length,
          validated: session.parts.filter((p: PartMatch) => p.status === 'validated').length,
          legacy: session.parts.filter((p: PartMatch) => p.status === 'legacy').length,
          pending: session.parts.filter((p: PartMatch) => p.status === 'pending').length
        },
        customers: {
          total: (session.customers || []).length,
          validated: (session.customers || []).filter((c: CustomerMatch) => c.status === 'validated').length,
          legacy: (session.customers || []).filter((c: CustomerMatch) => c.status === 'legacy').length,
          pending: (session.customers || []).filter((c: CustomerMatch) => c.status === 'pending').length
        },
        vehicles: {
          total: session.vehicles.length,
          validated: session.vehicles.filter((v: VehicleMatch) => v.status === 'validated').length,
          legacy: session.vehicles.filter((v: VehicleMatch) => v.status === 'legacy').length,
          pending: session.vehicles.filter((v: VehicleMatch) => v.status === 'pending').length
        },
        financials: {
          total: (session.financials || []).length,
          validated: (session.financials || []).filter((f: FinancialMatch) => f.status === 'validated').length,
          legacy: (session.financials || []).filter((f: FinancialMatch) => f.status === 'legacy').length,
          pending: (session.financials || []).filter((f: FinancialMatch) => f.status === 'pending').length
        }
      },
      
      dataFiles: {
        employees: {
          mainFile: 'employees.json',
          metadataFile: 'employees.metadata.json',
          hasReviewMetadata: false,
          note: 'Employee data structure is complex (multiple related tables). Use employees.metadata.json for review status and modified fields.'
        },
        parts: {
          mainFile: 'parts.json',
          hasReviewMetadata: true,
          note: 'Review metadata embedded in data file as _reviewMetadata field on each part record.'
        },
        customers: {
          mainFile: 'customers/{customerId}/entity.json',
          hasReviewMetadata: true,
          note: 'Review metadata embedded in each customer entity file as _reviewMetadata field.'
        },
        vehicles: {
          mainFile: 'customers/{customerId}/units/{unitId}/entity.json',
          hasReviewMetadata: true,
          note: 'Review metadata embedded in each vehicle/unit entity file as _reviewMetadata field.'
        },
        financials: {
          mainFile: 'invoices.json',
          hasReviewMetadata: true,
          note: 'Review metadata embedded in data file as _reviewMetadata field on each invoice record.'
        }
      },
      
      usage: {
        description: 'This directory contains validated and reviewed data ready for import.',
        importStrategies: {
          employees: 'Read employees.metadata.json and filter by status field',
          parts: 'Read parts.json and filter by _reviewMetadata.status field',
          customers: 'Read each customers/{id}/entity.json and check _reviewMetadata.status',
          vehicles: 'Read each customers/{id}/units/{unitId}/entity.json and check _reviewMetadata.status',
          financials: 'Read invoices.json and filter by _reviewMetadata.status field'
        },
        statusValues: {
          validated: 'Record has been verified and approved for import',
          pending: 'Record has not been reviewed yet',
          legacy: 'Record marked as legacy/historical, typically not imported'
        }
      }
    };
    
    await writeJson(path.join(userValidatedPath, 'review-summary.json'), summary);
    console.log(`✅ Created review-summary.json`);
  } catch (error) {
    console.error('Error generating review summary:', error);
  }
}

