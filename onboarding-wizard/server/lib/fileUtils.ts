import { promises as fs } from 'fs';
import path from 'path';

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function readJson<T>(filePath: string): Promise<T> {
  const contents = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(contents) as T;
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  if (!(await pathExists(source))) {
    return;
  }
  await ensureDir(destination);

  if (typeof (fs as unknown as { cp?: Function }).cp === 'function') {
    await (fs as unknown as { cp: Function }).cp(source, destination, { recursive: true, force: true });
    return;
  }

  const entries = await fs.readdir(source, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const link = await fs.readlink(srcPath);
      await fs.symlink(link, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }));
}
