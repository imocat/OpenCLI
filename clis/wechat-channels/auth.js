import { AuthRequiredError, CommandExecutionError } from '@jackwener/opencli/errors';
import { registerSiteAuthCommands } from '../_shared/site-auth.js';

async function hasWechatChannelsSessionCookie(page) {
  const cookies = await page.getCookies({ url: 'https://channels.weixin.qq.com' });
  return cookies.some(c => c.name === 'sessionid' && c.value);
}

export function parseWechatChannelsIdentityProbe(probe) {
  if (!probe || typeof probe !== 'object' || Array.isArray(probe)) {
    throw new CommandExecutionError('WeChat Channels auth_data returned an invalid identity probe');
  }
  if (probe.kind === 'auth' || probe.httpStatus === 401 || probe.httpStatus === 403) {
    throw new AuthRequiredError('channels.weixin.qq.com', probe.detail ?? 'WeChat Channels requires login');
  }
  if (probe.kind === 'exception') {
    throw new CommandExecutionError(`WeChat Channels whoami failed: ${probe.detail}`);
  }
  if (!probe.ok) {
    throw new CommandExecutionError(`HTTP ${probe.httpStatus ?? 0} from auth_data`);
  }
  const payload = probe.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CommandExecutionError('WeChat Channels auth_data returned malformed JSON');
  }
  const code = payload.errCode ?? payload.base_resp?.ret ?? payload.baseResp?.ret;
  const message = String(payload.errMsg ?? payload.base_resp?.err_msg ?? payload.baseResp?.errMsg ?? '');
  if (code != null && Number(code) !== 0) {
    if (/未登录|登录|login|session/i.test(message)) {
      throw new AuthRequiredError('channels.weixin.qq.com', `WeChat Channels auth_data rejected the session: ${message}`);
    }
    throw new CommandExecutionError(`WeChat Channels auth_data failed: code=${String(code)}${message ? ` ${message}` : ''}`);
  }
  const user = payload.data?.finderUser
    ?? payload.data?.finder_user
    ?? payload.finderUser
    ?? payload.finder_user;
  if (!user || typeof user !== 'object' || Array.isArray(user)) {
    throw new CommandExecutionError('WeChat Channels auth_data did not expose finderUser');
  }
  const userId = String(user.uniqId ?? user.uniq_id ?? user.finderUsername ?? user.username ?? '').trim();
  const name = String(user.nickname ?? user.name ?? '').trim();
  if (!userId) {
    throw new CommandExecutionError('WeChat Channels auth_data did not expose a stable account ID');
  }
  return { user_id: userId, name };
}

async function verifyWechatChannelsIdentity(page) {
  if (!await hasWechatChannelsSessionCookie(page)) {
    throw new AuthRequiredError('channels.weixin.qq.com', 'WeChat Channels sessionid cookie missing');
  }
  await page.goto('https://channels.weixin.qq.com/platform');
  await page.wait(2);
  const probe = await page.evaluate(`(async () => {
    try {
      if (/login\\.html/.test(location.href)) {
        return { kind: 'auth', detail: 'WeChat Channels platform redirected to login.html' };
      }
      const r = await fetch('/cgi-bin/mmfinderassistant-bin/auth/auth_data', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const text = await r.text();
      let payload = null;
      try { payload = JSON.parse(text); } catch {}
      return { ok: r.ok, httpStatus: r.status, payload, preview: text.slice(0, 200) };
    } catch (e) {
      return { kind: 'exception', detail: String(e && e.message || e) };
    }
  })()`);
  return parseWechatChannelsIdentityProbe(probe);
}

registerSiteAuthCommands({
  site: 'wechat-channels',
  domain: 'channels.weixin.qq.com',
  loginUrl: 'https://channels.weixin.qq.com/login.html?from=assistant',
  columns: ['user_id', 'name'],
  quickCheck: hasWechatChannelsSessionCookie,
  verify: verifyWechatChannelsIdentity,
  poll: async (page) => {
    if (!await hasWechatChannelsSessionCookie(page)) {
      throw new AuthRequiredError('channels.weixin.qq.com', 'Waiting for WeChat Channels sessionid cookie');
    }
    return verifyWechatChannelsIdentity(page);
  },
});
