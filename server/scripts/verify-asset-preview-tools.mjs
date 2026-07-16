import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'arcspro-preview-verify-'));

async function assertFile(filePath, expectedHeader) {
    const buffer = await fsp.readFile(filePath);
    if (buffer.length === 0 || !buffer.subarray(0, expectedHeader.length).equals(expectedHeader)) {
        throw new Error(`Invalid preview output: ${path.basename(filePath)}`);
    }
    return buffer.length;
}

try {
    const epsPath = path.join(root, 'vector.eps');
    await fsp.writeFile(epsPath, [
        '%!PS-Adobe-3.0 EPSF-3.0',
        '%%BoundingBox: 0 0 360 220',
        '0.85 0.15 0.18 setrgbcolor',
        '0 0 360 220 rectfill',
        '1 1 1 setrgbcolor',
        '/Helvetica-Bold findfont 32 scalefont setfont',
        '42 100 moveto (ArcSpro EPS) show',
        'showpage',
    ].join('\n'));
    const epsPngPath = path.join(root, 'vector.png');
    await run('gs', [
        '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop', '-dFirstPage=1', '-dLastPage=1',
        '-r144', '-sDEVICE=pngalpha', `-sOutputFile=${epsPngPath}`, epsPath,
    ], { timeout: 45_000 });
    const epsWebpPath = path.join(root, 'vector.webp');
    await run('magick', [epsPngPath, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', epsWebpPath], { timeout: 45_000 });

    const psdPath = path.join(root, 'design.psd');
    await run('magick', ['-size', '640x360', 'gradient:#d8262c-#1c1917', psdPath], { timeout: 45_000 });
    const psdPreviewPath = path.join(root, 'design.webp');
    await run('magick', [`${psdPath}[0]`, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', psdPreviewPath], { timeout: 45_000 });

    const tiffPath = path.join(root, 'photo.tiff');
    await run('magick', ['-size', '800x500', 'gradient:#2563eb-#16a34a', tiffPath], { timeout: 45_000 });
    const tiffPreviewPath = path.join(root, 'photo.webp');
    await run('magick', [`${tiffPath}[0]`, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', tiffPreviewPath], { timeout: 45_000 });

    const heicPath = path.join(root, 'photo.heic');
    await run('magick', ['-size', '480x320', 'gradient:#f59e0b-#7c3aed', heicPath], { timeout: 45_000 });
    const heicPreviewPath = path.join(root, 'heic.webp');
    await run('magick', [`${heicPath}[0]`, '-auto-orient', '-thumbnail', '2000x2000>', '-strip', '-quality', '88', heicPreviewPath], { timeout: 45_000 });

    const result = {
        epsWebpBytes: await assertFile(epsWebpPath, Buffer.from('RIFF')),
        psdWebpBytes: await assertFile(psdPreviewPath, Buffer.from('RIFF')),
        tiffWebpBytes: await assertFile(tiffPreviewPath, Buffer.from('RIFF')),
        heicWebpBytes: await assertFile(heicPreviewPath, Buffer.from('RIFF')),
        rawDecoder: (await run('dcraw_emu', ['-v']).catch((error) => ({ stderr: error.stderr || '' }))).stderr !== undefined,
    };
    console.log(JSON.stringify(result));
} finally {
    await fsp.rm(root, { recursive: true, force: true });
}
