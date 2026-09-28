import { describe, expect, it, vi } from 'vitest';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './auth.js';

function whoami() {
  return getRegistry().get('youtube/whoami');
}

function pageWithProbes(probes) {
  return {
    getCookies: vi.fn().mockResolvedValue([{ name: 'SAPISID', value: 'session' }]),
    goto: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async () => probes.shift()),
  };
}

describe('youtube auth commands', () => {
  it('returns the stable current channel ID from Advanced settings', async () => {
    const page = pageWithProbes([
      { ok: true, name: '频道名称' },
      { ok: true, channel_id: 'UC1234567890123456789012', handle: 'channel-handle' },
    ]);

    await expect(whoami().func(page, {})).resolves.toEqual({
      logged_in: true,
      site: 'youtube',
      channel_id: 'UC1234567890123456789012',
      handle: 'channel-handle',
      name: 'channel-handle',
    });
    expect(page.goto).toHaveBeenNthCalledWith(2, 'https://www.youtube.com/account_advanced');
  });

  it('does not accept a mutable display name without a stable channel ID', async () => {
    const page = pageWithProbes([{ ok: true, name: '频道名称' }, { ok: true, channel_id: '', handle: '' }]);
    await expect(whoami().func(page, {})).rejects.toBeInstanceOf(CommandExecutionError);
  });
});
