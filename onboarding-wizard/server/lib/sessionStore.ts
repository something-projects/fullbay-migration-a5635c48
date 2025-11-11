import path from 'path';
import type { CustomerMatch, CustomerProfile, EmployeeMatch, FinancialMatch, PartMatch, RepairOrderMatch, ReviewSummary, VehicleMatch } from '../../shared/onboarding.js';
import { ensureDir, pathExists, readJson, writeJson } from './fileUtils.js';

export interface OnboardingSession {
  sessionId: string;
  customerId: string;
  startedAt: string;
  customer: CustomerProfile;
  outputPath: string;  // 用于从output目录按需读取数据
  customerDirectory: string;
  // 移除大数据数组，只保留统计信息
  statistics?: {
    vehicleCount: number;
    partCount: number;
    customerCount: number;
    employeeCount: number;
    repairOrderCount: number;
    financialCount: number;
  };
  summary?: ReviewSummary;
}

const sessions = new Map<string, OnboardingSession>();
const sessionsBySessionId = new Map<string, OnboardingSession>();
const REVIEW_STATE_FILE = 'review-state.json';

export function rememberSession(session: OnboardingSession): void {
  sessions.set(session.customerId, session);
  sessionsBySessionId.set(session.sessionId, session);
}

export function getSession(identifier: string): OnboardingSession | undefined {
  // Try to find by sessionId first, then by customerId
  return sessionsBySessionId.get(identifier) || sessions.get(identifier);
}

export async function persistSession(session: OnboardingSession): Promise<void> {
  const stateFile = path.join(session.customerDirectory, REVIEW_STATE_FILE);
  await ensureDir(session.customerDirectory);
  await writeJson(stateFile, session);
  rememberSession(session);
}

export async function loadPersistedSession(customerId: string, customerDirectory: string): Promise<OnboardingSession | undefined> {
  const stateFile = path.join(customerDirectory, REVIEW_STATE_FILE);
  if (!(await pathExists(stateFile))) {
    return undefined;
  }
  const session = await readJson<OnboardingSession>(stateFile);
  rememberSession(session);
  return session;
}
