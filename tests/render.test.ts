import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {access, mkdtemp, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {interpolateFrame} from '../src/compositions/frame-math.js';
import type {CompiledDemoV1} from '../src/contracts/types.js';
import {parseRenderArguments} from '../src/cli/render.js';
import {renderProject} from '../src/render/renderer.js';

async function command(executable: string, args: readonly string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true});
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${executable} exited with ${code}: ${stderr}`));
    });
  });
}

async function assetRecord(path: string): Promise<{sha256: string; bytes: number}> {
  const [contents, metadata] = await Promise.all([readFile(path), stat(path)]);
  return {sha256: createHash('sha256').update(contents).digest('hex'), bytes: metadata.size};
}

test('frame interpolation is deterministic and bounded by frame progress', () => {
  assert.equal(interpolateFrame(0, 100, 0, 11, 'linear'), 0);
  assert.equal(interpolateFrame(0, 100, 5, 11, 'linear'), 50);
  assert.equal(interpolateFrame(0, 100, 10, 11, 'linear'), 100);
  assert.equal(interpolateFrame(0, 100, 20, 11, 'ease-out'), 100);
});

test('render CLI keeps the frozen argument names', () => {
  assert.deepEqual(parseRenderArguments(['--compiled', 'compiled.json', '--out-dir', 'rendered']), {
    compiledPath: 'compiled.json',
    outputDirectory: 'rendered',
  });
  assert.throws(() => parseRenderArguments(['--input', 'compiled.json']), /Unknown or incomplete/);
});

test('renders repeatable landscape and portrait H.264/AAC outputs with review artifacts', async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'app-demo-render-fixture-'));
  try {
    const firstImage = join(fixtureDirectory, 'screen-a.svg');
    const secondImage = join(fixtureDirectory, 'screen-b.png');
    const audioPath = join(fixtureDirectory, 'tone.wav');
    const sourceSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#1769aa"/><circle cx="320" cy="180" r="96" fill="#f6c445"/></svg>';
    await writeFile(firstImage, sourceSvg, 'utf8');
    await command('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'smptebars=size=640x360:rate=24',
      '-frames:v',
      '1',
      '-threads',
      '1',
      secondImage,
    ]);
    await command('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:sample_rate=48000:duration=1',
      '-c:a',
      'pcm_s16le',
      audioPath,
    ]);
    const [firstRecord, secondRecord, audioRecord] = await Promise.all([
      assetRecord(firstImage),
      assetRecord(secondImage),
      assetRecord(audioPath),
    ]);
    const compiled: CompiledDemoV1 = {
      schemaVersion: 'compiled-demo-v1',
      source: {schemaVersion: 'demo-v1', path: 'demo.yaml', sha256: '0'.repeat(64)},
      project: {id: 'render-acceptance', title: 'Render acceptance'},
      canvas: {width: 576, height: 324, fps: 24, durationFrames: 24, durationSeconds: 1},
      brand: {
        background: '#E8EDF2',
        foreground: '#111418',
        accent: '#E5484D',
        fontFamily: 'Arial',
      },
      assets: [
        {id: 'screen-a', type: 'image', path: 'screen-a.svg', width: 640, height: 360, ...firstRecord},
        {id: 'screen-b', type: 'image', path: 'screen-b.png', width: 640, height: 360, ...secondRecord},
        {id: 'tone', type: 'audio', path: 'tone.wav', durationSeconds: 1, ...audioRecord},
      ],
      scenes: [
        {
          id: 'title',
          kind: 'title',
          startFrame: 0,
          endFrame: 6,
          durationFrames: 6,
          heading: 'Frame-owned demo',
          body: 'Deterministic local layers',
          transitionIn: 'fade',
        },
        {
          id: 'screen',
          kind: 'screen',
          startFrame: 6,
          endFrame: 18,
          durationFrames: 12,
          assetId: 'screen-a',
          heading: 'Screenshot pan and crop',
          body: 'UI pixels stay local and unchanged',
          fit: 'cover',
          from: {x: -12, y: 4, scale: 0.96, opacity: 0},
          to: {x: 12, y: -4, scale: 1.08, opacity: 1},
          easing: 'ease-out',
          transitionIn: 'slide-left',
          transitionOut: 'fade',
          cursor: {from: {x: 120, y: 100}, to: {x: 420, y: 220}, clickFrames: [12]},
          callouts: [
            {text: 'Local callout', at: {x: 300, y: 60}, startFrame: 10, durationFrames: 5},
          ],
        },
        {
          id: 'comparison',
          kind: 'comparison',
          startFrame: 18,
          endFrame: 22,
          durationFrames: 4,
          assetId: 'screen-a',
          secondaryAssetId: 'screen-b',
          fit: 'contain',
          transitionIn: 'scale',
        },
        {
          id: 'outro',
          kind: 'outro',
          startFrame: 22,
          endFrame: 24,
          durationFrames: 2,
          heading: 'Done',
        },
      ],
      audio: [{id: 'music', assetId: 'tone', startFrame: 0, volume: 0.2, fadeInFrames: 2, fadeOutFrames: 2}],
      outputs: [
        {id: 'landscape', width: 576, height: 324, fps: 24, fileName: 'landscape.mp4'},
        {id: 'portrait', width: 324, height: 576, fps: 24, fileName: 'portrait.mp4'},
      ],
      hiapiRequests: [],
    };
    const compiledPath = join(fixtureDirectory, 'compiled.json');
    await writeFile(compiledPath, `${JSON.stringify(compiled, null, 2)}\n`, 'utf8');
    const firstOutput = join(fixtureDirectory, 'render-one');
    const secondOutput = join(fixtureDirectory, 'render-two');
    const firstReport = await renderProject({
      compiledPath,
      outputDirectory: firstOutput,
      workingDirectory: fixtureDirectory,
    });
    const secondReport = await renderProject({
      compiledPath,
      outputDirectory: secondOutput,
      workingDirectory: fixtureDirectory,
    });

    assert.equal(firstReport.animationClock, 'frame-number');
    assert.equal(firstReport.criticalUiPipeline, 'deterministic-local-layers');
    assert.equal(firstReport.generativeUiPasses, 0);
    assert.deepEqual(
      firstReport.outputs.map((output) => output.aspectRatio),
      ['16:9', '9:16'],
    );
    for (const [index, output] of firstReport.outputs.entries()) {
      assert.equal(output.validation.videoCodec, 'h264');
      assert.equal(output.validation.pixelFormat, 'yuv420p');
      assert.equal(output.validation.frameCount, 24);
      assert.equal(output.validation.durationSeconds, 1);
      assert.equal(output.validation.audioCodec, 'aac');
      assert.equal(output.features.screenshotTransform, true);
      assert.equal(output.features.crop, true);
      assert.equal(output.features.deviceFrame, true);
      assert.equal(output.features.cursor, true);
      assert.equal(output.features.clickRipple, true);
      assert.equal(output.features.callout, true);
      assert.equal(output.features.caption, true);
      assert.equal(output.features.transition, true);
      assert.equal(output.sha256, secondReport.outputs[index]?.sha256);
      assert.deepEqual(output.review.frameSha256, secondReport.outputs[index]?.review.frameSha256);
      await access(join(firstOutput, output.file));
      await access(join(firstOutput, output.review.contactSheet));
    }
    const checklist = await readFile(join(firstOutput, 'review-checklist.md'), 'utf8');
    assert.match(checklist, /No generative pass redrew UI or text/);
    await access(join(firstOutput, 'render-report.json'));

    await writeFile(firstImage, sourceSvg.replace('#1769aa', '#aa1769'), 'utf8');
    await assert.rejects(
      renderProject({
        compiledPath,
        outputDirectory: join(fixtureDirectory, 'render-tampered'),
        workingDirectory: fixtureDirectory,
      }),
      /SHA-256 differs/,
    );
  } finally {
    await rm(fixtureDirectory, {recursive: true, force: true});
  }
});
