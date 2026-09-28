import * as os from 'node:os';
import * as path from 'node:path';

export function openCliTempPath(fileName) {
    const name = String(fileName);
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || name.includes('\0')) {
        throw new TypeError('OpenCLI temporary file name must be a plain file name');
    }
    return path.join(os.tmpdir(), name);
}
