import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const SECURE_DIR_MODE = 0o700;
export const SECURE_FILE_MODE = 0o600;

interface SecureWriteOptions {
  flag?: string;
}

export async function ensureSecureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: SECURE_DIR_MODE });
  await chmodIfPresent(dir, SECURE_DIR_MODE);
}

export async function writeSecureFile(file: string, data: string, options: SecureWriteOptions = {}): Promise<void> {
  await ensureSecureDir(path.dirname(file));
  await writeFile(file, data, { ...options, mode: SECURE_FILE_MODE });
  await chmodIfPresent(file, SECURE_FILE_MODE);
}

export async function appendSecureFile(file: string, data: string): Promise<void> {
  await ensureSecureDir(path.dirname(file));
  await writeFile(file, data, { flag: "a", mode: SECURE_FILE_MODE });
  await chmodIfPresent(file, SECURE_FILE_MODE);
}

async function chmodIfPresent(target: string, mode: number): Promise<void> {
  try {
    await chmod(target, mode);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }
}
