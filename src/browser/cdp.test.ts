import { beforeEach, describe, expect, it, vi } from 'vitest';

const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    static OPEN = 1;
    static lastInstance: MockWebSocket | undefined;
    readyState = 1;
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();

    constructor(_url: string) {
      MockWebSocket.lastInstance = this;
      queueMicrotask(() => this.emit('open'));
    }

    on(event: string, handler: (...args: unknown[]) => void): void {
      const handlers = this.handlers.get(event) ?? [];
      handlers.push(handler);
      this.handlers.set(event, handlers);
    }

    send(_message: string): void {}

    close(): void {
      this.readyState = 3;
    }

    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args);
      }
    }
  }

  return { MockWebSocket };
});

vi.mock('ws', () => ({
  WebSocket: MockWebSocket,
}));

import { CDPBridge, CDP_REQUEST_BODY_CAPTURE_LIMIT } from './cdp.js';

describe('CDPBridge cookies', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('filters cookies by actual domain match instead of substring match', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    vi.spyOn(bridge, 'send').mockResolvedValue({
      cookies: [
        { name: 'good', value: '1', domain: '.example.com' },
        { name: 'exact', value: '2', domain: 'example.com' },
        { name: 'bad', value: '3', domain: 'notexample.com' },
      ],
    });

    const page = await bridge.connect();
    const cookies = await page.getCookies({ domain: 'example.com' });

    expect(cookies).toEqual([
      { name: 'good', value: '1', domain: '.example.com' },
      { name: 'exact', value: '2', domain: 'example.com' },
    ]);
  });

  it('exposes native input helpers on direct CDP pages', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const send = vi.spyOn(bridge, 'send').mockResolvedValue({});

    const page = await bridge.connect();
    send.mockClear();

    expect(page.nativeType).toBeTypeOf('function');
    expect(page.nativeKeyPress).toBeTypeOf('function');
    expect(page.nativeClick).toBeTypeOf('function');
    expect(page.handleJavaScriptDialog).toBeTypeOf('function');
    expect(page.cdp).toBeTypeOf('function');
    expect(page.setFileInput).toBeTypeOf('function');
    expect(page.setFilesViaChooser).toBeTypeOf('function');
    expect(page.dropFiles).toBeTypeOf('function');

    await page.nativeType!('hello');
    await page.nativeKeyPress!('a', ['Ctrl']);
    await page.nativeClick!(10, 20);
    await page.handleJavaScriptDialog!(true, 'ok');
    await page.cdp!('Page.getLayoutMetrics', {});

    expect(send.mock.calls).toEqual([
      ['Input.insertText', { text: 'hello' }],
      ['Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', modifiers: 2 }],
      ['Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', modifiers: 2 }],
      ['Input.dispatchMouseEvent', { type: 'mouseMoved', x: 10, y: 20 }],
      ['Input.dispatchMouseEvent', { type: 'mousePressed', x: 10, y: 20, button: 'left', clickCount: 1 }],
      ['Input.dispatchMouseEvent', { type: 'mouseReleased', x: 10, y: 20, button: 'left', clickCount: 1 }],
      ['Page.handleJavaScriptDialog', { accept: true, promptText: 'ok' }],
      ['Page.getLayoutMetrics', {}],
    ]);
  });

  it('sets native files on the resolved input node without opening a chooser', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const send = vi.spyOn(bridge, 'send').mockResolvedValue({});
    const page = await bridge.connect();
    send.mockClear();
    send.mockImplementation(async (method: string) => {
      if (method === 'DOM.getDocument') return { root: { nodeId: 12 } };
      if (method === 'DOM.querySelector') return { nodeId: 34 };
      return {};
    });

    await page.setFileInput!(['/tmp/first.jpg', '/tmp/second.jpg'], '[data-upload="images"]');

    expect(send.mock.calls).toEqual([
      ['DOM.enable'],
      ['DOM.getDocument', { depth: 0, pierce: true }],
      ['DOM.querySelector', {
        nodeId: 12,
        selector: '[data-upload="images"]',
      }],
      ['DOM.setFileInputFiles', {
        files: ['/tmp/first.jpg', '/tmp/second.jpg'],
        nodeId: 34,
      }],
    ]);
  });

  it('drops local files on a visible target with trusted CDP drag events', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const send = vi.spyOn(bridge, 'send').mockResolvedValue({});
    const page = await bridge.connect();
    send.mockClear();
    send.mockImplementation(async (method: string) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: { x: 120, y: 240 } } };
      }
      return {};
    });

    await page.dropFiles!(['/tmp/first.jpg', '/tmp/second.jpg'], '[data-upload-dropzone="images"]');

    const data = {
      items: [],
      files: ['/tmp/first.jpg', '/tmp/second.jpg'],
      dragOperationsMask: 1,
    };
    expect(send.mock.calls).toEqual([
      ['Runtime.evaluate', expect.objectContaining({ returnByValue: true, awaitPromise: true })],
      ['Input.dispatchDragEvent', { type: 'dragEnter', x: 120, y: 240, data }],
      ['Input.dispatchDragEvent', { type: 'dragOver', x: 120, y: 240, data }],
      ['Input.dispatchDragEvent', { type: 'drop', x: 120, y: 240, data }],
    ]);
  });

  it('sets files through the chooser opened by an Electron user gesture', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const send = vi.spyOn(bridge, 'send').mockResolvedValue({});
    const page = await bridge.connect();
    send.mockClear();
    send.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: { x: 120, y: 240, tagName: 'BUTTON' } } };
      }
      if (method === 'Miuta.clickUserGesture') {
        queueMicrotask(() => MockWebSocket.lastInstance?.emit('message', Buffer.from(JSON.stringify({
          method: 'Page.fileChooserOpened',
          params: { backendNodeId: 321 },
        }))));
      }
      if (method === 'DOM.describeNode') {
        return { node: { nodeName: 'INPUT', attributes: ['type', 'file', 'multiple', ''] } };
      }
      return {};
    });

    await page.setFilesViaChooser!(['/tmp/first.jpg'], '[data-upload-trigger="images"]');

    expect(send.mock.calls).toEqual([
      ['Runtime.evaluate', expect.objectContaining({ returnByValue: true, awaitPromise: true })],
      ['DOM.enable'],
      ['Page.enable'],
      ['Page.setInterceptFileChooserDialog', { enabled: true }],
      ['Miuta.clickUserGesture', { selector: '[data-upload-trigger="images"]' }],
      ['DOM.describeNode', { backendNodeId: 321 }],
      ['DOM.setFileInputFiles', { files: ['/tmp/first.jpg'], backendNodeId: 321 }],
      ['Page.setInterceptFileChooserDialog', { enabled: false }],
    ]);
  });

  it('falls back to native CDP click when the Electron user-gesture command is unavailable', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const send = vi.spyOn(bridge, 'send').mockResolvedValue({});
    const page = await bridge.connect();
    send.mockClear();
    send.mockImplementation(async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Runtime.evaluate') return { result: { value: { x: 12, y: 24, tagName: 'BUTTON' } } };
      if (method === 'Miuta.clickUserGesture') throw new Error("Method 'Miuta.clickUserGesture' wasn't found");
      if (method === 'Input.dispatchMouseEvent' && params?.type === 'mouseReleased') {
        queueMicrotask(() => MockWebSocket.lastInstance?.emit('message', Buffer.from(JSON.stringify({
          method: 'Page.fileChooserOpened',
          params: { backendNodeId: 654 },
        }))));
      }
      if (method === 'DOM.describeNode') return { node: { nodeName: 'INPUT', attributes: ['type', 'file'] } };
      return {};
    });

    await page.setFilesViaChooser!(['/tmp/fallback.jpg'], '[data-upload-trigger="images"]');

    expect(send).toHaveBeenCalledWith('Miuta.clickUserGesture', { selector: '[data-upload-trigger="images"]' });
    expect(send).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: 12, y: 24, button: 'left', clickCount: 1,
    });
    expect(send).toHaveBeenCalledWith('DOM.setFileInputFiles', { files: ['/tmp/fallback.jpg'], backendNodeId: 654 });
  });

  it('captures request headers and bounded post data on direct CDP pages', async () => {
    vi.stubEnv('OPENCLI_CDP_ENDPOINT', 'ws://127.0.0.1:9222/devtools/page/1');

    const bridge = new CDPBridge();
    const fullBody = 'x'.repeat(CDP_REQUEST_BODY_CAPTURE_LIMIT + 5);
    vi.spyOn(bridge, 'send').mockImplementation(async (method: string) => {
      if (method === 'Network.getRequestPostData') return { postData: fullBody };
      return {};
    });

    const page = await bridge.connect();
    await page.startNetworkCapture?.();
    MockWebSocket.lastInstance?.emit('message', Buffer.from(JSON.stringify({
      method: 'Network.requestWillBeSent',
      params: {
        requestId: 'request-1',
        request: {
          method: 'POST',
          url: 'https://example.test/rsc-action/actions/pagination',
          headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
          hasPostData: true,
        },
      },
    })));

    const entries = await page.readNetworkCapture?.() as Array<Record<string, unknown>>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      requestHeaders: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      requestBodyKind: 'string',
      requestBodyFullSize: fullBody.length,
      requestBodyTruncated: true,
    });
    expect(String(entries[0].requestBodyPreview)).toHaveLength(CDP_REQUEST_BODY_CAPTURE_LIMIT);
  });
});
