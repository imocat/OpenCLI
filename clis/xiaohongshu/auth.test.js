import { describe, expect, it, vi } from 'vitest';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './auth.js';

function whoami() {
  return getRegistry().get('xiaohongshu/whoami');
}

function pageWithProbe(probe) {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(probe),
  };
}

describe('xiaohongshu auth commands', () => {
  it('uses creator state userId as the stable identity', async () => {
    const page = pageWithProbe({
      ok: true,
      status: 200,
      accountId: '66c876f7000000001d023624',
      parsed: { data: { name: '创作者', red_num: 'red-account', fans_count: 12 } },
    });

    await expect(whoami().func(page, {})).resolves.toEqual({
      logged_in: true,
      site: 'xiaohongshu',
      id: '66c876f7000000001d023624',
      username: '创作者',
      redId: 'red-account',
      followers: 12,
    });
  });

  it('fails explicitly when the stable userId disappears', async () => {
    const page = pageWithProbe({
      ok: true,
      status: 200,
      accountId: '',
      parsed: { data: { name: '创作者', red_num: 'red-account' } },
    });

    await expect(whoami().func(page, {})).rejects.toBeInstanceOf(CommandExecutionError);
  });

  it('does not expose a failed profile response body in the error', async () => {
    const page = pageWithProbe({
      ok: false,
      status: 500,
      parsed: null,
      preview: 'private-profile-payload',
    });

    await expect(whoami().func(page, {})).rejects.not.toThrow('private-profile-payload');
  });
});
