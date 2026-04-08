export interface SandboxConfig {
  memoryMb: number;
  cpus: number;
  defaultTimeoutMs: number;
  pidsLimit: number;
  idleTimeoutMs: number;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    console.error(`[config] Invalid ${key}="${val}", using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

export function loadConfig(): SandboxConfig {
  return {
    memoryMb: envInt("RE_SANDBOX_MEMORY", 512),
    cpus: envInt("RE_SANDBOX_CPUS", 1),
    defaultTimeoutMs: envInt("RE_SANDBOX_TIMEOUT", 30000),
    pidsLimit: envInt("RE_SANDBOX_PIDS", 64),
    idleTimeoutMs: envInt("RE_SANDBOX_IDLE_TIMEOUT", 1800000),
  };
}
