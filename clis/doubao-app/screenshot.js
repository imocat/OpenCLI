import { cli, Strategy } from '@jackwener/opencli/registry';
import { openCliTempPath } from '../_shared/temp-path.js';
const DEFAULT_OUTPUT_PATH = openCliTempPath('doubao-screenshot.png');
export const screenshotCommand = cli({
    site: 'doubao-app',
    name: 'screenshot',
    access: 'read',
    description: 'Capture a screenshot of the Doubao desktop app window',
    domain: 'doubao-app',
    strategy: Strategy.UI,
    browser: true,
    args: [
        { name: 'output', required: false, help: `Output file path (default: ${DEFAULT_OUTPUT_PATH})` },
    ],
    columns: ['Status', 'File'],
    func: async (page, kwargs) => {
        const outputPath = kwargs.output || DEFAULT_OUTPUT_PATH;
        await page.screenshot({ path: outputPath });
        return [{ Status: 'Success', File: outputPath }];
    },
});
