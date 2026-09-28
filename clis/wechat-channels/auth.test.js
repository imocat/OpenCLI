import { describe, expect, it, vi } from 'vitest';
import { CommandExecutionError } from '@jackwener/opencli/errors';
import { getRegistry } from '@jackwener/opencli/registry';
import './auth.js';

function whoami() {
  return getRegistry().get('wechat-channels/whoami');
}

function pageWithProbe(probe) {
  return {
    getCookies: vi.fn().mockResolvedValue([{ name: 'sessionid', value: 'session' }]),
    goto: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(probe),
  };
}

describe('wechat-channels auth commands', () => {
  it('accepts the current HTTP 201 camelCase auth_data response', async () => {
    const page = pageWithProbe({
      ok: true,
      httpStatus: 201,
      payload: {
        errCode: 0,
        errMsg: '',
        data: { finderUser: { uniqId: 'finder-123', nickname: '视频号作者' } },
      },
    });

    await expect(whoami().func(page, {})).resolves.toEqual({
      logged_in: true,
      site: 'wechat-channels',
      user_id: 'finder-123',
      name: '视频号作者',
    });
  });

  it('keeps compatibility with the legacy snake_case response', async () => {
    const page = pageWithProbe({
      ok: true,
      httpStatus: 200,
      payload: {
        base_resp: { ret: 0 },
        data: { finder_user: { uniq_id: 'finder-legacy', nickname: '旧版作者' } },
      },
    });

    await expect(whoami().func(page, {})).resolves.toMatchObject({ user_id: 'finder-legacy', name: '旧版作者' });
  });

  it('classifies missing stable identity as an upstream response failure', async () => {
    const page = pageWithProbe({ ok: true, httpStatus: 201, payload: { errCode: 0, data: {} } });
    await expect(whoami().func(page, {})).rejects.toBeInstanceOf(CommandExecutionError);
  });
});
