import { isAbsolute } from "node:path";
import { realpathSync, statSync } from "node:fs";

export interface SandboxConfig {
  memoryMb: number;
  cpus: number;
  defaultTimeoutMs: number;
  pidsLimit: number;
  idleTimeoutMs: number;
  hostMountPath?: string;
}

function envIntBounded(key: string, fallback: number, min: number, max: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    console.error(`[config] Invalid ${key}="${val}", using default ${fallback}`);
    return fallback;
  }
  if (parsed < min) {
    console.error(`[config] ${key}=${parsed} below minimum ${min}, clamping`);
    return min;
  }
  if (parsed > max) {
    console.error(`[config] ${key}=${parsed} above maximum ${max}, clamping`);
    return max;
  }
  return parsed;
}

function envHostMountDir(key: string): string | undefined {
  const val = process.env[key];
  if (val === undefined || val === "") return undefined;
  if (!isAbsolute(val)) {
    console.error(`[config] ${key}="${val}" is not an absolute path, ignoring`);
    return undefined;
  }
  let resolved: string;
  try {
    resolved = realpathSync(val);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[config] ${key}="${val}" cannot be resolved: ${msg}, ignoring`);
    return undefined;
  }
  try {
    if (!statSync(resolved).isDirectory()) {
      console.error(`[config] ${key}="${val}" is not a directory, ignoring`);
      return undefined;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[config] ${key}="${val}" stat failed: ${msg}, ignoring`);
    return undefined;
  }
  if (resolved !== val) {
    console.error(`[config] ${key}="${val}" resolved to "${resolved}"`);
  }
  console.error(`[config] Mounting host directory ${resolved} → /mnt/host (read-only)`);
  return resolved;
}

export function loadConfig(): SandboxConfig {
  return {
    memoryMb: envIntBounded("ESQUIE_SANDBOX_MEMORY", 512, 64, 8192),
    cpus: envIntBounded("ESQUIE_SANDBOX_CPUS", 1, 1, 16),
    defaultTimeoutMs: envIntBounded("ESQUIE_SANDBOX_TIMEOUT", 30000, 1000, 600000),
    pidsLimit: envIntBounded("ESQUIE_SANDBOX_PIDS", 64, 8, 1024),
    idleTimeoutMs: envIntBounded("ESQUIE_SANDBOX_IDLE_TIMEOUT", 1800000, 60000, 86400000),
    hostMountPath: envHostMountDir("ESQUIE_SANDBOX_MOUNT"),
  };
}
