import { execFile } from 'node:child_process';
import { basename, dirname, join, resolve } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const ffmpeg = () => process.env.EVIDENCE_FFMPEG || (require('@ffmpeg-installer/ffmpeg') as { path: string }).path;

// Include a nested folder in the name to distinguish similarly named specs.
export const specName = (file: string) => file.replace(/^tests\//, '').replace(/\.tsx?$/, '').replace(/\//g, '--').replace(/[^a-zA-Z0-9._-]/g, '-');

export async function convertVideo(input: string, output: string): Promise<boolean> {
    try {
        await execute(ffmpeg(), ['-loglevel', 'error', '-nostats', '-y', '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-threads', '2', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { timeout: 120_000 });
        return true;
    } catch {
        if (existsSync(output)) rmSync(output);
        console.warn('Evidence MP4 conversion failed; keeping original WebM.');
        return false;
    }
}

async function mergeVideos(inputs: string[], output: string): Promise<boolean> {
    if (!inputs.length) return false;
    if (inputs.length === 1) {
        copyFileSync(inputs[0], output);
        return true;
    }
    const list = output + '.concat.tmp';
    try {
        // All generated names contain only safe characters and reside in the same directory.
        writeFileSync(list, inputs.map(input => "file '" + basename(input) + "'").join('\n') + '\n');
        await execute(ffmpeg(), ['-loglevel', 'error', '-nostats', '-y', '-f', 'concat', '-safe', '0', '-i', basename(list), '-c', 'copy', '-movflags', '+faststart', output], { cwd: dirname(output), timeout: 120_000 });
        return true;
    } catch {
        if (existsSync(output)) rmSync(output);
        console.warn('Could not merge spec video; individual test videos remain in the tracker.');
        return false;
    } finally {
        if (existsSync(list)) rmSync(list);
    }
}

interface CaseEvidence {
    screenshots: { url: string }[];
    videos: { url: string }[];
}

/** Publish latest-only evidence into one folder per spec (evidence/<spec>/) and keep a self-contained tracker copy. */
export async function publishLatest(spec: string, cases: CaseEvidence[], trackerDir: string): Promise<string | undefined> {
    const evidenceRoot = resolve(process.cwd(), 'evidence');
    const root = join(evidenceRoot, spec); // evidence/<spec>/<spec>.video.mp4, <spec>.tcN.screenshot.png ...
    const trackerEvidence = join(trackerDir, 'evidence');
    mkdirSync(root, { recursive: true });
    // Only remove files with our exact name pattern for this spec. Unrelated specs and user files survive.
    const belongs = (name: string) => {
        if (!name.startsWith(spec + '.')) return false;
        const suffix = name.slice(spec.length + 1);
        return /^video\.mp4$|^tc\d+(?:\.\d+)?\.screenshot\.(?:png|jpe?g)$|^tc\d+\.video\.(?:mp4|webm)$/.test(suffix);
    };
    // The second pass also removes flat files left by the previous layout (evidence/<spec>.*).
    for (const dir of [root, evidenceRoot]) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isFile() && belongs(entry.name)) rmSync(join(dir, entry.name));
        }
    }

    const videos: string[] = [];
    const fallbackVideos: string[] = [];
    for (const record of cases) {
        for (const image of record.screenshots) {
            const name = basename(image.url);
            copyFileSync(join(trackerEvidence, name), join(root, name));
        }
        const video = record.videos.find(v => v.url.endsWith('.mp4'));
        if (video) videos.push(join(trackerEvidence, basename(video.url)));
        else if (record.videos[0]) fallbackVideos.push(join(trackerEvidence, basename(record.videos[0].url)));
    }
    const merged = join(trackerEvidence, spec + '.video.mp4');
    if (!fallbackVideos.length && await mergeVideos(videos, merged)) {
        copyFileSync(merged, join(root, basename(merged)));
        return 'evidence/' + basename(merged);
    }
    // Export each available clip instead of silently losing evidence if a conversion fails.
    for (const video of [...videos, ...fallbackVideos]) copyFileSync(video, join(root, basename(video)));
}
