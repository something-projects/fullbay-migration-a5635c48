import { promises as fs } from 'fs';
import path from 'path';
import type { EmployeeMatch, EmployeeSuggestion } from '../../shared/onboarding.js';
import { pathExists, readJson } from './fileUtils.js';

interface EmployeeData {
  entityEmployeeId?: string | number;
  firstName?: string;
  lastName?: string;
  email?: string;
  jobTitle?: string;
  hourlyWage?: number;
  phoneNumber?: string;
  active?: number | boolean;
  status?: string;
}

interface EmployeesExport {
  totalRecords?: number;
  employees?: EmployeeData[];
}

export async function loadEmployeeMatches(entityOutputDir: string): Promise<EmployeeMatch[]> {
  // Try entity.json first (correct location)
  const entityPath = path.join(entityOutputDir, 'entity.json');
  
  if (await pathExists(entityPath)) {
    try {
      const entityData = await readJson<{ employees?: EmployeeData[] }>(entityPath);
      
      if (entityData.employees && entityData.employees.length > 0) {
        console.log(`Found ${entityData.employees.length} employees in entity.json`);
        const matches = entityData.employees.map(emp => createEmployeeMatch(emp));
        return matches.sort((a, b) => {
          const nameA = `${a.firstName} ${a.lastName}`;
          const nameB = `${b.firstName} ${b.lastName}`;
          return nameA.localeCompare(nameB);
        });
      }
    } catch (error) {
      console.error('Error loading employees from entity.json:', error);
    }
  }

  // Fallback to employees.json (legacy format)
  const employeesPath = path.join(entityOutputDir, 'employees.json');

  if (!(await pathExists(employeesPath))) {
    console.log('No employees.json or entity.json file found');
    return [];
  }

  try {
    const employeesExport = await readJson<EmployeesExport>(employeesPath);

    // Check if there are any employees
    if (!employeesExport.employees || employeesExport.employees.length === 0) {
      console.log(`No employees in export (totalRecords: ${employeesExport.totalRecords || 0})`);
      return [];
    }

    const matches = employeesExport.employees.map(emp => createEmployeeMatch(emp));
    return matches.sort((a, b) => {
      const nameA = `${a.firstName} ${a.lastName}`;
      const nameB = `${b.firstName} ${b.lastName}`;
      return nameA.localeCompare(nameB);
    });
  } catch (error) {
    console.error('Error loading employees:', error);
    return [];
  }
}

export function summarizeEmployeeFailures(employees: EmployeeMatch[]) {
  const total = employees.length;
  const validated = employees.filter((e) => e.status === 'validated').length;
  const legacy = employees.filter((e) => e.status === 'legacy').length;
  const pending = total - validated - legacy;

  const reasonCounts = new Map<string, { reason: string; count: number }>();

  for (const employee of employees) {
    for (const reason of employee.unmatchedAttributes) {
      const key = reason.toLowerCase();
      const existing = reasonCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        reasonCounts.set(key, { reason, count: 1 });
      }
    }
  }

  const topFailures = Array.from(reasonCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totals: {
      total,
      validated,
      legacy,
      pending
    },
    topFailures
  };
}

function createEmployeeMatch(emp: EmployeeData): EmployeeMatch {
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];
  const issues: string[] = [];

  // Check required fields
  if (emp.firstName) {
    matchedAttributes.push('firstName');
  } else {
    unmatchedAttributes.push('firstName');
    issues.push('missing-first-name');
  }

  if (emp.lastName) {
    matchedAttributes.push('lastName');
  } else {
    unmatchedAttributes.push('lastName');
    issues.push('missing-last-name');
  }

  if (emp.email) {
    matchedAttributes.push('email');
  } else {
    unmatchedAttributes.push('email');
    issues.push('missing-email');
  }

  if (emp.jobTitle) {
    matchedAttributes.push('jobTitle');
  } else {
    unmatchedAttributes.push('jobTitle');
    issues.push('missing-job-title');
  }

  if (emp.hourlyWage && emp.hourlyWage > 0) {
    matchedAttributes.push('hourlyWage');
  } else {
    unmatchedAttributes.push('hourlyWage');
    issues.push('invalid-wage');
  }

  if (emp.phoneNumber) {
    matchedAttributes.push('phoneNumber');
  } else {
    unmatchedAttributes.push('phoneNumber');
    issues.push('missing-phone');
  }

  const active = typeof emp.active === 'boolean' ? emp.active : emp.active === 1;
  if (!active) {
    issues.push('inactive');
  }

  const matchRate = Math.round((matchedAttributes.length / 6) * 100);
  const status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';

  const match: EmployeeMatch = {
    entityEmployeeId: String(emp.entityEmployeeId || 'unknown'),
    firstName: emp.firstName || '',
    lastName: emp.lastName || '',
    email: emp.email || '',
    jobTitle: emp.jobTitle || '',
    hourlyWage: emp.hourlyWage || 0,
    phoneNumber: emp.phoneNumber || '',
    active,
    matchRate,
    matchedAttributes,
    unmatchedAttributes,
    status,
    suggestions: buildEmployeeSuggestions(matchedAttributes, unmatchedAttributes, String(emp.entityEmployeeId)),
    issues: issues.length > 0 ? issues : undefined
  };

  return match;
}

function buildEmployeeSuggestions(
  matchedAttributes: string[],
  unmatchedAttributes: string[],
  employeeId: string
): EmployeeSuggestion[] {
  const suggestions: EmployeeSuggestion[] = [];

  if (unmatchedAttributes.includes('email')) {
    suggestions.push({
      suggestionId: `email-${employeeId}`,
      kind: 'normalized-name',
      title: 'Add employee email',
      description: 'Add an email address for communication',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('phoneNumber')) {
    suggestions.push({
      suggestionId: `phone-${employeeId}`,
      kind: 'normalized-name',
      title: 'Add phone number',
      description: 'Add a contact phone number',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('jobTitle')) {
    suggestions.push({
      suggestionId: `job-${employeeId}`,
      kind: 'role-mapping',
      title: 'Set job title',
      description: 'Assign a job title for this employee',
      payload: {}
    });
  }

  if (unmatchedAttributes.includes('hourlyWage')) {
    suggestions.push({
      suggestionId: `wage-${employeeId}`,
      kind: 'role-mapping',
      title: 'Set hourly wage',
      description: 'Set the hourly wage for this employee',
      payload: {}
    });
  }

  return suggestions;
}

export function applyEmployeeUpdate(
  employee: EmployeeMatch,
  payload: import('../../shared/onboarding.js').EmployeeUpdatePayload
): EmployeeMatch {
  const updated = { ...employee };

  // Apply field updates
  if (payload.firstName !== undefined) updated.firstName = payload.firstName;
  if (payload.lastName !== undefined) updated.lastName = payload.lastName;
  if (payload.email !== undefined) updated.email = payload.email;
  if (payload.jobTitle !== undefined) updated.jobTitle = payload.jobTitle;
  if (payload.hourlyWage !== undefined) updated.hourlyWage = payload.hourlyWage;
  if (payload.phoneNumber !== undefined) updated.phoneNumber = payload.phoneNumber;
  if (payload.active !== undefined) updated.active = payload.active;
  if (payload.notes !== undefined) updated.notes = payload.notes;

  // Handle legacy status
  if (payload.markAsLegacy) {
    updated.status = 'legacy';
    updated.lastUpdated = new Date().toISOString();
    return updated;
  }

  // Recalculate match attributes
  const matchedAttributes: string[] = [];
  const unmatchedAttributes: string[] = [];
  const issues: string[] = [];

  // Check required fields
  if (updated.firstName) {
    matchedAttributes.push('firstName');
  } else {
    unmatchedAttributes.push('firstName');
    issues.push('missing-first-name');
  }

  if (updated.lastName) {
    matchedAttributes.push('lastName');
  } else {
    unmatchedAttributes.push('lastName');
    issues.push('missing-last-name');
  }

  if (updated.email) {
    matchedAttributes.push('email');
  } else {
    unmatchedAttributes.push('email');
    issues.push('missing-email');
  }

  if (updated.jobTitle) {
    matchedAttributes.push('jobTitle');
  } else {
    unmatchedAttributes.push('jobTitle');
    issues.push('missing-job-title');
  }

  if (updated.hourlyWage && updated.hourlyWage > 0) {
    matchedAttributes.push('hourlyWage');
  } else {
    unmatchedAttributes.push('hourlyWage');
    issues.push('invalid-wage');
  }

  if (updated.phoneNumber) {
    matchedAttributes.push('phoneNumber');
  } else {
    unmatchedAttributes.push('phoneNumber');
    issues.push('missing-phone');
  }

  if (!updated.active) {
    issues.push('inactive');
  }

  updated.matchedAttributes = matchedAttributes;
  updated.unmatchedAttributes = unmatchedAttributes;
  updated.matchRate = Math.round((matchedAttributes.length / 6) * 100);
  updated.status = unmatchedAttributes.length === 0 ? 'validated' : 'pending';
  updated.issues = issues.length > 0 ? issues : undefined;
  updated.lastUpdated = new Date().toISOString();
  updated.suggestions = buildEmployeeSuggestions(matchedAttributes, unmatchedAttributes, updated.entityEmployeeId);

  return updated;
}
