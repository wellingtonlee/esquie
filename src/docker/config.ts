export interface SandboxConfig {
  memoryMb: number;
  cpus: number;
  defaultTimeoutMs: number;
  pidsLimit: number;
  idleTimeoutMs: number;
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

export function loadConfig(): SandboxConfig {
  return {
    memoryMb: envIntBounded("ESQUIE_SANDBOX_MEMORY", 512, 64, 8192),
    cpus: envIntBounded("ESQUIE_SANDBOX_CPUS", 1, 1, 16),
    defaultTimeoutMs: envIntBounded("ESQUIE_SANDBOX_TIMEOUT", 30000, 1000, 600000),
    pidsLimit: envIntBounded("ESQUIE_SANDBOX_PIDS", 64, 8, 1024),
    idleTimeoutMs: envIntBounded("ESQUIE_SANDBOX_IDLE_TIMEOUT", 1800000, 60000, 86400000),
  };
}
