import * as os from 'node:os';
import * as path from 'node:path';

export function getOpenCliConfigDir(): string {
  return process.env.OPENCLI_CONFIG_DIR?.trim() || path.join(os.homedir(), '.opencli');
}

export function getOpenCliCacheDir(): string {
  return process.env.OPENCLI_CACHE_DIR?.trim() || path.join(getOpenCliConfigDir(), 'cache');
}
