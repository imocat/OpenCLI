import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { registerSiteAuthCommands } from '../_shared/site-auth.js';

async function hasXhsSessionCookies(page) {
  const cookies = await page.getCookies({ url: 'https://creator.xiaohongshu.com' });
  const names = new Set(cookies.map(cookie => cookie.name));
  return names.has('web_session');
}

export function parseXhsIdentityProbe(probe) {
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
    throw new CommandExecutionError('Xiaohongshu creator profile returned an invalid identity probe');
  }
  if (probe.loginPage || probe.status === 401 || probe.status === 403) {
    throw new AuthRequiredError('creator.xiaohongshu.com', 'Xiaohongshu creator profile requires login');
  }
  if (!probe.ok) {
    const detail = probe.parsed?.msg ?? `HTTP ${probe.status ?? 0}`;
    throw new CommandExecutionError(`Xiaohongshu creator profile request failed: ${detail}`);
  }
  const data = probe.parsed?.data;
  if (!data) {
    throw new CommandExecutionError('Xiaohongshu creator profile returned malformed personal_info payload');
  }
  const id = String(probe.accountId ?? '').trim();
  if (!id) {
    throw new CommandExecutionError('Xiaohongshu creator profile did not expose a stable userId');
  }
  return {
    id,
    username: String(data.name ?? '').trim(),
    redId: String(data.red_num ?? '').trim(),
    followers: data.fans_count ?? 0,
  };
}

async function verifyXhsIdentity(page) {
  await page.goto('https://creator.xiaohongshu.com/new/home');
  const probe = await page.evaluate(`
    async () => {
      try {
        const parseStored = (key) => {
          try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
        };
        const userInfo = parseStored('USER_INFO');
        const bizInfo = parseStored('USER_INFO_FOR_BIZ');
        const accountId = String(bizInfo?.userId || userInfo?.user?.value?.userId || '');
        const resp = await fetch('/api/galaxy/creator/home/personal_info', { credentials: 'include' });
        const text = await resp.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        return {
          ok: resp.ok,
          status: resp.status,
          parsed,
          accountId,
          loginPage: /(?:passport|login)/i.test(location.href) || /(?:passport|login)/i.test(resp.url),
          preview: text.slice(0, 200),
        };
      } catch (error) {
        return { ok: false, status: 0, parsed: null, preview: String(error && error.message || error) };
      }
    }
  `);
  return parseXhsIdentityProbe(probe);
}

registerSiteAuthCommands({
  site: 'xiaohongshu',
  domain: 'creator.xiaohongshu.com',
  loginUrl: 'https://creator.xiaohongshu.com/',
  columns: ['id', 'username', 'redId', 'followers'],
  quickCheck: hasXhsSessionCookies,
  verify: verifyXhsIdentity,
  poll: async (page) => {
    if (!await hasXhsSessionCookies(page)) {
      throw new AuthRequiredError('creator.xiaohongshu.com', 'Waiting for Xiaohongshu session cookies');
    }
    return verifyXhsIdentity(page);
  },
});
