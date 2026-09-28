export type BrowserTabPlacement = 'owned-container' | 'existing-window';

const TAB_PLACEMENTS: BrowserTabPlacement[] = ['owned-container', 'existing-window'];

export function isBrowserTabPlacement(raw: unknown): raw is BrowserTabPlacement {
  return raw === 'owned-container' || raw === 'existing-window';
}

export function normalizeBrowserTabPlacement(name: string, raw: unknown): BrowserTabPlacement | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (isBrowserTabPlacement(raw)) return raw;
  throw new Error(`${name} must be one of: ${TAB_PLACEMENTS.join(', ')}. Received: "${String(raw)}"`);
}

export function resolveBrowserTabPlacementFromEnv(): BrowserTabPlacement | undefined {
  return normalizeBrowserTabPlacement('OPENCLI_TAB_PLACEMENT', process.env.OPENCLI_TAB_PLACEMENT);
}
