import { cli, Strategy } from '@jackwener/opencli/registry';
import * as fs from 'node:fs';
import { openCliTempPath } from '../_shared/temp-path.js';
const HTML_OUTPUT_PATH = openCliTempPath('antigravity-dom.html');
const SNAPSHOT_OUTPUT_PATH = openCliTempPath('antigravity-snapshot.json');
export const dumpCommand = cli({
    site: 'antigravity',
    name: 'dump',
    access: 'read',
    description: 'Dump the DOM to help AI understand the UI',
    domain: 'localhost',
    strategy: Strategy.UI,
    browser: true,
    args: [],
    columns: ['htmlFile', 'snapFile'],
    func: async (page) => {
        // Extract HTML
        const html = await page.evaluate('document.body.innerHTML');
        fs.writeFileSync(HTML_OUTPUT_PATH, html);
        // Extract Snapshot
        let snapFile = '';
        try {
            const snap = await page.snapshot({ raw: true });
            snapFile = SNAPSHOT_OUTPUT_PATH;
            fs.writeFileSync(snapFile, JSON.stringify(snap, null, 2));
        }
        catch (e) {
            snapFile = 'Failed';
        }
        return [{ htmlFile: HTML_OUTPUT_PATH, snapFile }];
    },
});
