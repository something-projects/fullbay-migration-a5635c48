import path from 'path';
import type {
  VehicleMatch,
  PartMatch,
  CustomerMatch,
  EmployeeMatch,
  RepairOrderMatch,
  FinancialMatch
} from '../../shared/onboarding.js';
import { pathExists, readJson, writeJson } from './fileUtils.js';

/**
 * 管理用户reviewed数据的持久化
 * 用户的修改存储在customerDirectory下的单独文件中
 */

const REVIEWED_FILES = {
  vehicles: 'vehicles-reviewed.json',
  parts: 'parts-reviewed.json',
  customers: 'customers-reviewed.json',
  employees: 'employees-reviewed.json',
  repairOrders: 'repair-orders-reviewed.json',
  financials: 'financials-reviewed.json'
};

type DataType = 'vehicles' | 'parts' | 'customers' | 'employees' | 'repairOrders' | 'financials';

/**
 * 从reviewed文件读取用户修改的数据（如果存在）
 */
async function loadReviewedData<T>(customerDirectory: string, dataType: DataType): Promise<Map<string, T>> {
  const filePath = path.join(customerDirectory, REVIEWED_FILES[dataType]);
  const reviewedMap = new Map<string, T>();

  if (await pathExists(filePath)) {
    const items = await readJson<T[]>(filePath);
    // 根据不同类型使用不同的ID字段构建Map
    items.forEach((item: any) => {
      let id: string | undefined;
      if (dataType === 'vehicles') {
        id = item.unitId;
      } else if (dataType === 'parts') {
        id = item.partId;
      } else if (dataType === 'customers') {
        id = item.customerId;
      } else if (dataType === 'employees') {
        id = item.entityEmployeeId;
      } else if (dataType === 'repairOrders') {
        id = item.repairOrderId;
      } else if (dataType === 'financials') {
        id = item.invoiceId;
      }
      if (id) {
        reviewedMap.set(id, item);
      }
    });
  }

  return reviewedMap;
}

/**
 * 保存单个项目的修改到reviewed文件
 */
async function saveReviewedItem<T>(
  customerDirectory: string,
  dataType: DataType,
  itemId: string,
  updatedItem: T
): Promise<void> {
  const reviewedMap = await loadReviewedData<T>(customerDirectory, dataType);
  reviewedMap.set(itemId, updatedItem);

  const filePath = path.join(customerDirectory, REVIEWED_FILES[dataType]);
  const items = Array.from(reviewedMap.values());
  await writeJson(filePath, items);
}

/**
 * 合并原始数据和用户reviewed数据
 * reviewed数据优先级更高（覆盖原始数据）
 */
function mergeWithReviewed<T>(originalItems: T[], reviewedMap: Map<string, T>, idField: string): T[] {
  return originalItems.map(item => {
    const id = (item as any)[idField];
    return reviewedMap.has(id) ? reviewedMap.get(id)! : item;
  });
}

// 导出特定类型的functions
export async function loadVehiclesWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<VehicleMatch[]>
): Promise<VehicleMatch[]> {
  const originalVehicles = await loader(outputPath);
  const reviewedMap = await loadReviewedData<VehicleMatch>(customerDirectory, 'vehicles');
  return mergeWithReviewed(originalVehicles, reviewedMap, 'unitId');
}

export async function saveReviewedVehicle(
  customerDirectory: string,
  vehicle: VehicleMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'vehicles', vehicle.unitId, vehicle);
}

export async function loadPartsWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<PartMatch[]>
): Promise<PartMatch[]> {
  const originalParts = await loader(outputPath);
  const reviewedMap = await loadReviewedData<PartMatch>(customerDirectory, 'parts');
  return mergeWithReviewed(originalParts, reviewedMap, 'partId');
}

export async function saveReviewedPart(
  customerDirectory: string,
  part: PartMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'parts', part.partId, part);
}

export async function loadCustomersWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<CustomerMatch[]>
): Promise<CustomerMatch[]> {
  const originalCustomers = await loader(outputPath);
  const reviewedMap = await loadReviewedData<CustomerMatch>(customerDirectory, 'customers');
  return mergeWithReviewed(originalCustomers, reviewedMap, 'customerId');
}

export async function saveReviewedCustomer(
  customerDirectory: string,
  customer: CustomerMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'customers', customer.customerId, customer);
}

export async function loadEmployeesWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<EmployeeMatch[]>
): Promise<EmployeeMatch[]> {
  const originalEmployees = await loader(outputPath);
  const reviewedMap = await loadReviewedData<EmployeeMatch>(customerDirectory, 'employees');
  return mergeWithReviewed(originalEmployees, reviewedMap, 'entityEmployeeId');
}

export async function saveReviewedEmployee(
  customerDirectory: string,
  employee: EmployeeMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'employees', employee.entityEmployeeId, employee);
}

export async function loadRepairOrdersWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<RepairOrderMatch[]>
): Promise<RepairOrderMatch[]> {
  const originalOrders = await loader(outputPath);
  const reviewedMap = await loadReviewedData<RepairOrderMatch>(customerDirectory, 'repairOrders');
  return mergeWithReviewed(originalOrders, reviewedMap, 'repairOrderId');
}

export async function saveReviewedRepairOrder(
  customerDirectory: string,
  order: RepairOrderMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'repairOrders', order.repairOrderId, order);
}

export async function loadFinancialsWithReviews(
  outputPath: string,
  customerDirectory: string,
  loader: (outputPath: string) => Promise<FinancialMatch[]>
): Promise<FinancialMatch[]> {
  const originalFinancials = await loader(outputPath);
  const reviewedMap = await loadReviewedData<FinancialMatch>(customerDirectory, 'financials');
  return mergeWithReviewed(originalFinancials, reviewedMap, 'invoiceId');
}

export async function saveReviewedFinancial(
  customerDirectory: string,
  financial: FinancialMatch
): Promise<void> {
  await saveReviewedItem(customerDirectory, 'financials', financial.invoiceId, financial);
}
