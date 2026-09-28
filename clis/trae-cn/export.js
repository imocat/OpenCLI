import * as fs from 'node:fs';
import { cli, Strategy } from '@jackwener/opencli/registry';
import { openCliTempPath } from '../_shared/temp-path.js';
import { normalizeLimit, readTraeMessages } from './utils.js';

const DEFAULT_OUTPUT_PATH = openCliTempPath('trae-cn-export.md');
export const exportCommand = cli({
  site: 'trae-cn',
  name: 'export',
  access: 'read',
  description: 'Export the current Trae CN conversation to Markdown',
  example: `OPENCLI_CDP_ENDPOINT=http://127.0.0.1:39240 OPENCLI_CDP_TARGET=talk opencli trae-cn export --limit 20 --output ${DEFAULT_OUTPUT_PATH}`,
  domain: 'localhost',
  strategy: Strategy.UI,
  browser: true,
  args: [
    { name: 'output', required: false, help: `Output file (default: ${DEFAULT_OUTPUT_PATH})` },
    { name: 'limit', type: 'int', required: false, help: 'Max recent turns to export (default: 50)', default: 50 },
  ],
  columns: ['Status', 'File', 'Messages'],
  func: async (page, kwargs) => {
    const outputPath = kwargs.output || DEFAULT_OUTPUT_PATH;
    const limit = normalizeLimit(kwargs.limit, 50);
    const messages = await readTraeMessages(page, limit);
    const markdown = [
      '# Trae CN Conversation Export',
      '',
      ...messages.map((message, index) => [
        `## ${index + 1}. ${message.Role}`,
        '',
        message.Text,
        '',
      ].join('\n')),
    ].join('\n');
    fs.writeFileSync(outputPath, markdown);
    return [{
      Status: 'Success',
      File: outputPath,
      Messages: messages.length,
    }];
  },
});
