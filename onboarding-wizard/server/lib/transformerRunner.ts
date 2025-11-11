import path from 'path';
import { pathExists } from './fileUtils.js';

export async function ensureOutputAvailable(customerId: string, outputDir: string): Promise<void> {
  const customerOutput = path.join(outputDir, customerId);
  if (!(await pathExists(customerOutput))) {
    throw new Error(`Transformer output not found for customer ${customerId} in ${outputDir}`);
  }
}
