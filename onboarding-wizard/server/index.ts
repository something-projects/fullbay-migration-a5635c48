import express from 'express';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import type {
  CustomerBootstrapRequest,
  CustomerLookupRequest,
  CustomerMatch,
  CustomerUpdatePayload,
  EmployeeMatch,
  EmployeeUpdatePayload,
  FinancialMatch,
  FinancialUpdatePayload,
  PartMatch,
  PartUpdatePayload,
  RepairOrderMatch,
  RepairOrderUpdatePayload,
  ReviewSummary,
  VehicleMatch,
  VehicleUpdatePayload,
  WizardSession
} from '../shared/onboarding.js';
import { ensureOutputAvailable } from './lib/transformerRunner.js';
import { loadVehicleMatches, applyVehicleUpdate, summarizeVehicleFailures } from './lib/vehicleLoader.js';
import { loadPartMatches, applyPartUpdate, summarizePartFailures } from './lib/partLoader.js';
import { loadCustomerMatches, applyCustomerUpdate, summarizeCustomerFailures } from './lib/customerLoader.js';
import { loadEmployeeMatches, applyEmployeeUpdate, summarizeEmployeeFailures } from './lib/employeeLoader.js';
import { loadRepairOrderMatches, applyRepairOrderUpdate, summarizeRepairOrderFailures } from './lib/repairOrderLoader.js';
import { loadFinancialMatches, applyFinancialUpdate, summarizeFinancialFailures } from './lib/financialLoader.js';
import {
  loadVehiclesWithReviews,
  loadPartsWithReviews,
  loadCustomersWithReviews,
  loadEmployeesWithReviews,
  loadRepairOrdersWithReviews,
  loadFinancialsWithReviews,
  saveReviewedVehicle,
  saveReviewedPart,
  saveReviewedCustomer,
  saveReviewedEmployee,
  saveReviewedRepairOrder,
  saveReviewedFinancial
} from './lib/reviewedDataManager.js';
import { copyDirectory, ensureDir, pathExists } from './lib/fileUtils.js';
import {
  OnboardingSession,
  getSession,
  loadPersistedSession,
  persistSession,
  rememberSession
} from './lib/sessionStore.js';
import { findCustomerByUsername } from './lib/customerLookup.js';
import { exportUserValidatedData } from './lib/userValidatedExporter.js';
import { getS3Sync } from './lib/S3Sync.js';

const app = express();
app.use(express.json({ limit: '4mb' }));

const PORT = Number(process.env.PORT || 4005);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(process.cwd(), '..');
const OUTPUT_ROOT = path.join(REPO_ROOT, 'output');
const CUSTOMER_OUTPUT_ROOT = path.join(REPO_ROOT, 'customer-output');
// Client build directory (vite build outDir)
const CLIENT_DIST = path.resolve(__dirname, '../../client');

async function resolveSession(identifier: string): Promise<OnboardingSession> {
  const trimmedId = identifier?.trim();
  if (!trimmedId) {
    throw Object.assign(new Error('session identifier required'), { statusCode: 400 });
  }

  // First try to get from memory (works with both sessionId and customerId)
  const inMemory = getSession(trimmedId);
  if (inMemory) {
    return inMemory;
  }

  // If not in memory, try to load from disk
  // We need to scan customer-output directory to find the session
  try {
    const customerOutputDirs = await fs.readdir(CUSTOMER_OUTPUT_ROOT);
    for (const dirName of customerOutputDirs) {
      const customerDirectory = path.join(CUSTOMER_OUTPUT_ROOT, dirName);
      const stats = await fs.stat(customerDirectory);
      if (stats.isDirectory()) {
        const persisted = await loadPersistedSession(dirName, customerDirectory);
        if (persisted && (persisted.sessionId === trimmedId || persisted.customerId === trimmedId)) {
          return persisted;
        }
      }
    }
  } catch (error) {
    // If directory doesn't exist or other error, continue to throw not found
  }

  throw Object.assign(new Error(`No onboarding session found for ${trimmedId}`), { statusCode: 404 });
}

function handleError(error: unknown, response: express.Response) {
  const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
  const message = (error as Error).message || 'Unexpected server error';
  if (statusCode >= 500) {
    console.error(error);
  }
  response.status(statusCode).json({ message });
}

app.post('/api/onboarding/lookup', async (request, response) => {
  try {
    const payload = request.body as CustomerLookupRequest;
    const match = await findCustomerByUsername(payload, OUTPUT_ROOT);
    response.json(match);
  } catch (error) {
    handleError(error, response);
  }
});

// Direct endpoint for loading customers without session (for preview)
app.get('/api/entity/:entityId/customers', async (request, response) => {
  try {
    const entityId = request.params.entityId;
    const outputPath = path.join(OUTPUT_ROOT, entityId);

    if (!(await pathExists(outputPath))) {
      response.status(404).json({ message: `Entity ${entityId} not found` });
      return;
    }

    const customers = await loadCustomerMatches(outputPath);
    const summary = summarizeCustomerFailures(customers);
    response.json({ customers, summary });
  } catch (error) {
    handleError(error, response);
  }
});

// Direct endpoint for loading employees without session (for preview)
app.get('/api/entity/:entityId/employees', async (request, response) => {
  try {
    const entityId = request.params.entityId;
    const outputPath = path.join(OUTPUT_ROOT, entityId);

    if (!(await pathExists(outputPath))) {
      response.status(404).json({ message: `Entity ${entityId} not found` });
      return;
    }

    const employees = await loadEmployeeMatches(outputPath);
    const summary = summarizeEmployeeFailures(employees);
    response.json({ employees, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/bootstrap', async (request, response) => {
  try {
    const payload = request.body as CustomerBootstrapRequest;
    if (!payload?.customerId?.trim()) {
      response.status(400).json({ message: 'customerId is required' });
      return;
    }

    const customerId = payload.customerId.trim();
    const outputPath = path.join(OUTPUT_ROOT, customerId);
    const customerDirectory = path.join(CUSTOMER_OUTPUT_ROOT, customerId);

    await ensureOutputAvailable(customerId, OUTPUT_ROOT);
    await ensureDir(customerDirectory);

    // 加载数据用于响应，但不存储在session中
    const vehicles = await loadVehicleMatches(outputPath);
    const parts = await loadPartMatches(outputPath);
    const customers = await loadCustomerMatches(outputPath);
    const employees = await loadEmployeeMatches(outputPath);
    const repairOrders = await loadRepairOrderMatches(outputPath);
    const financials = await loadFinancialMatches(outputPath);

    // Session只存储元数据和统计信息，不存储大数据数组
    const session: OnboardingSession = {
      sessionId: randomUUID(),
      customerId,
      startedAt: new Date().toISOString(),
      customer: {
        customerId,
        displayName: payload.displayName,
        notes: payload.notes,
        status: 'reviewing',
        lastExportedAt: new Date().toISOString(),
        sourceOutputPath: outputPath,
        customerDirectory
      },
      outputPath,  // 存储路径，用于后续按需读取
      customerDirectory,
      statistics: {
        vehicleCount: vehicles.length,
        partCount: parts.length,
        customerCount: customers.length,
        employeeCount: employees.length,
        repairOrderCount: repairOrders.length,
        financialCount: financials.length
      }
    };

    // 现在session很小（只有元数据），可以安全地序列化
    await persistSession(session);

    const wizardSession: WizardSession = {
      sessionId: session.sessionId,
      customer: session.customer,
      startedAt: session.startedAt
    };

    // 返回数据给前端，但不存储在session中
    response.json({ session: wizardSession, vehicles, parts, customers });
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/customers', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const customers = await loadCustomersWithReviews(session.outputPath, session.customerDirectory, loadCustomerMatches);
    const summary = summarizeCustomerFailures(customers);
    response.json({ customers, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/customers/:customerRecordId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as CustomerUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const customers = await loadCustomersWithReviews(session.outputPath, session.customerDirectory, loadCustomerMatches);
    const customer = customers.find((c: CustomerMatch) => c.customerId === request.params.customerRecordId);

    if (!customer) {
      response.status(404).json({ message: 'Customer not found' });
      return;
    }

    // 应用更新
    const updatedCustomer: CustomerMatch = applyCustomerUpdate(customer, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedCustomer(session.customerDirectory, updatedCustomer);

    response.json(updatedCustomer);
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/vehicles', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const vehicles = await loadVehiclesWithReviews(session.outputPath, session.customerDirectory, loadVehicleMatches);
    const summary = summarizeVehicleFailures(vehicles);
    response.json({ vehicles, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/vehicles/:vehicleId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as VehicleUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const vehicles = await loadVehiclesWithReviews(session.outputPath, session.customerDirectory, loadVehicleMatches);
    const vehicle = vehicles.find((v: VehicleMatch) => v.unitId === request.params.vehicleId);

    if (!vehicle) {
      response.status(404).json({ message: 'Vehicle not found' });
      return;
    }

    // 应用更新
    const updatedVehicle: VehicleMatch = await applyVehicleUpdate(vehicle, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedVehicle(session.customerDirectory, updatedVehicle);

    response.json(updatedVehicle);
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/parts', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const parts = await loadPartsWithReviews(session.outputPath, session.customerDirectory, loadPartMatches);
    const summary = summarizePartFailures(parts);
    response.json({ parts, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/parts/:partId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as PartUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const parts = await loadPartsWithReviews(session.outputPath, session.customerDirectory, loadPartMatches);
    const part = parts.find((p: PartMatch) => p.partId === request.params.partId);

    if (!part) {
      response.status(404).json({ message: 'Part not found' });
      return;
    }

    // 应用更新
    const updatedPart: PartMatch = await applyPartUpdate(part, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedPart(session.customerDirectory, updatedPart);

    response.json(updatedPart);
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/employees', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const employees = await loadEmployeesWithReviews(session.outputPath, session.customerDirectory, loadEmployeeMatches);
    const summary = summarizeEmployeeFailures(employees);
    response.json({ employees, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/employees/:employeeId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as EmployeeUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const employees = await loadEmployeesWithReviews(session.outputPath, session.customerDirectory, loadEmployeeMatches);
    const employee = employees.find((e: EmployeeMatch) => e.entityEmployeeId === request.params.employeeId);

    if (!employee) {
      response.status(404).json({ message: 'Employee not found' });
      return;
    }

    // 应用更新
    const updatedEmployee: EmployeeMatch = applyEmployeeUpdate(employee, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedEmployee(session.customerDirectory, updatedEmployee);

    response.json(updatedEmployee);
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/repair-orders', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const repairOrders = await loadRepairOrdersWithReviews(session.outputPath, session.customerDirectory, loadRepairOrderMatches);
    const summary = summarizeRepairOrderFailures(repairOrders);
    response.json({ repairOrders, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/repair-orders/:orderId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as RepairOrderUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const repairOrders = await loadRepairOrdersWithReviews(session.outputPath, session.customerDirectory, loadRepairOrderMatches);
    const order = repairOrders.find((o: RepairOrderMatch) => o.repairOrderId === request.params.orderId);

    if (!order) {
      response.status(404).json({ message: 'Repair order not found' });
      return;
    }

    // 应用更新
    const updatedOrder: RepairOrderMatch = applyRepairOrderUpdate(order, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedRepairOrder(session.customerDirectory, updatedOrder);

    response.json(updatedOrder);
  } catch (error) {
    handleError(error, response);
  }
});

app.get('/api/onboarding/:customerId/financial', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    // 从outputPath按需加载数据，合并用户的reviewed修改
    const financials = await loadFinancialsWithReviews(session.outputPath, session.customerDirectory, loadFinancialMatches);
    const summary = summarizeFinancialFailures(financials);
    response.json({ invoices: financials, summary });
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/financial/:invoiceId', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);
    const payload = request.body as FinancialUpdatePayload;

    // 从outputPath加载数据（包含reviewed修改）
    const financials = await loadFinancialsWithReviews(session.outputPath, session.customerDirectory, loadFinancialMatches);
    const financial = financials.find((f: FinancialMatch) => f.invoiceId === request.params.invoiceId);

    if (!financial) {
      response.status(404).json({ message: 'Financial record not found' });
      return;
    }

    // 应用更新
    const updatedFinancial: FinancialMatch = applyFinancialUpdate(financial, payload);

    // 保存到reviewed文件，而不是session
    await saveReviewedFinancial(session.customerDirectory, updatedFinancial);

    response.json(updatedFinancial);
  } catch (error) {
    handleError(error, response);
  }
});

app.post('/api/onboarding/:customerId/complete', async (request, response) => {
  try {
    const session = await resolveSession(request.params.customerId);

    console.log(`\n========================================`);
    console.log(`Starting complete review for entity: ${session.customerId}`);
    console.log(`========================================\n`);

    // 加载所有reviewed数据（用户修改已经保存在单独的文件中）
    console.log(`[Step 1/6] Loading reviewed data...`);
    const vehicles = await loadVehiclesWithReviews(session.outputPath, session.customerDirectory, loadVehicleMatches);
    const parts = await loadPartsWithReviews(session.outputPath, session.customerDirectory, loadPartMatches);
    const employees = await loadEmployeesWithReviews(session.outputPath, session.customerDirectory, loadEmployeeMatches);
    const repairOrders = await loadRepairOrdersWithReviews(session.outputPath, session.customerDirectory, loadRepairOrderMatches);
    const financials = await loadFinancialsWithReviews(session.outputPath, session.customerDirectory, loadFinancialMatches);
    console.log(`✅ All reviewed data loaded`);

    // 2. Export reviewed data to output/{entityId}/user-validated/
    console.log(`\n[Step 2/6] Exporting user-validated data...`);
    // 临时构造包含数据的session对象用于export（仅在这里使用）
    const sessionWithData = { ...session, vehicles, parts, employees, repairOrders, financials } as any;
    const userValidatedPath = await exportUserValidatedData(sessionWithData, OUTPUT_ROOT);
    console.log(`✅ User-validated data exported to: ${userValidatedPath}`);

    // 2.5. Sync user-validated data to S3
    try {
      const s3Sync = getS3Sync();
      if (s3Sync.isEnabled()) {
        await s3Sync.syncDirectory(
          userValidatedPath,
          `customer-output/${session.customerId}/user-validated`,
          `User-validated data for ${session.customerId}`
        );
      }
    } catch (s3Error) {
      console.warn(`⚠️  S3 sync failed for user-validated data:`, s3Error);
      // Don't fail the completion process if S3 sync fails
    }

    // 3. Also keep backup in original customer-output directory
    console.log(`\n[Step 3/6] Creating backup in customer-output...`);
    const exportPath = path.join(session.customerDirectory, 'raw-output');
    const summary: ReviewSummary = {
      vehiclesReviewed: vehicles.length,
      vehiclesValidated: vehicles.filter((vehicle: VehicleMatch) => vehicle.status === 'validated').length,
      partsReviewed: parts.length,
      partsValidated: parts.filter((part: PartMatch) => part.status === 'validated').length,
      exportPath,
      userValidatedPath
    };

    await copyDirectory(session.outputPath, exportPath);
    console.log(`✅ Backup created at: ${exportPath}`);

    // 4. Update session
    console.log(`\n[Step 4/6] Updating session data...`);
    session.summary = summary;
    session.customer = { ...session.customer, status: 'completed' };

    // 5. Write review result files (这些文件可能已经由POST endpoints创建，这里确保它们存在)
    console.log(`\n[Step 5/6] Writing review result files...`);
    await ensureDir(session.customerDirectory);
    await Promise.all([
      fs.writeFile(
        path.join(session.customerDirectory, 'vehicles-reviewed.json'),
        JSON.stringify(vehicles, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(session.customerDirectory, 'parts-reviewed.json'),
        JSON.stringify(parts, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(session.customerDirectory, 'employees-reviewed.json'),
        JSON.stringify(employees, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(session.customerDirectory, 'repair-orders-reviewed.json'),
        JSON.stringify(repairOrders, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(session.customerDirectory, 'financials-reviewed.json'),
        JSON.stringify(financials, null, 2),
        'utf-8'
      ),
      fs.writeFile(
        path.join(session.customerDirectory, 'summary.json'),
        JSON.stringify(summary, null, 2),
        'utf-8'
      )
    ]);
    console.log(`✅ Review files written to: ${session.customerDirectory}`);

    // 6. Persist session (现在session很小，只有元数据)
    console.log(`\n[Step 6/6] Persisting session...`);
    await persistSession(session);
    rememberSession(session);
    console.log(`✅ Session persisted`);

    console.log(`\n========================================`);
    console.log(`✅ Review completed successfully!`);
    console.log(`========================================`);
    console.log(`Summary:`);
    console.log(`  - Entity ID: ${session.customerId}`);
    console.log(`  - Original data: output/${session.customerId}/`);
    console.log(`  - User validated: ${userValidatedPath}`);
    console.log(`  - Customer output: ${session.customerDirectory}`);
    console.log(`  - Vehicles: ${summary.vehiclesValidated}/${summary.vehiclesReviewed} validated`);
    console.log(`  - Parts: ${summary.partsValidated}/${summary.partsReviewed} validated`);
    console.log(`========================================\n`);

    response.json({ summary });
  } catch (error) {
    console.error(`\n❌ Error completing review for entity ${request.params.customerId}:`);
    console.error(error);
    console.error(`Stack trace:`, (error as Error).stack);
    handleError(error, response);
  }
});
// Serve static assets
app.use(express.static(CLIENT_DIST));

// SPA fallback for non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ message: 'Not Found' });
    return;
  }
  res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(PORT, async () => {
  if (!(await pathExists(CUSTOMER_OUTPUT_ROOT))) {
    await ensureDir(CUSTOMER_OUTPUT_ROOT);
  }
  console.log(`Onboarding wizard API ready on http://localhost:${PORT}`);
});
