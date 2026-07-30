import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {access, mkdtemp, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {buildFfmpegComposition} from '../src/compositions/ffmpeg-composition.js';
import {interpolateFrame} from '../src/compositions/frame-math.js';
import type {CompiledDemoV1} from '../src/contracts/types.js';
import {parseRenderArguments} from '../src/cli/render.js';
import {resolveAndVerifyAssets} from '../src/media/assets.js';
import {rasterizeSvgAssets} from '../src/media/rasterize.js';
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

async function renderWorkDirectories(path: string): Promise<string[]> {
  try {
    return (await readdir(path, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('.render-work-'))
      .map((entry) => entry.name);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
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
    const secondImage = join(fixtureDirectory, 'screen-b.svg');
    const audioPath = join(fixtureDirectory, 'tone.wav');
    const landscapeSvg = await readFile(new URL('./fixtures/render/landscape-ui.svg', import.meta.url));
    const portraitSvg = await readFile(new URL('./fixtures/render/portrait-ui.svg', import.meta.url));
    await Promise.all([writeFile(firstImage, landscapeSvg), writeFile(secondImage, portraitSvg)]);
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
        {id: 'screen-b', type: 'image', path: 'screen-b.svg', width: 360, height: 640, ...secondRecord},
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
    const compiledBeforeRender = await readFile(compiledPath, 'utf8');

    const verifiedAssets = await resolveAndVerifyAssets(compiled, compiledPath, fixtureDirectory);
    assert.deepEqual(
      [...verifiedAssets.values()].filter((asset) => asset.verifiedSvg).map((asset) => asset.path),
      ['screen-a.svg', 'screen-b.svg'],
    );
    await writeFile(firstImage, 'the verified SVG source changed before rasterization', 'utf8');
    const preparedDirectory = join(fixtureDirectory, 'prepared-assets');
    const preparedAssets = await rasterizeSvgAssets(verifiedAssets, preparedDirectory);
    await writeFile(firstImage, landscapeSvg);
    for (const id of ['screen-a', 'screen-b']) {
      const original = compiled.assets.find((asset) => asset.id === id);
      const prepared = preparedAssets.get(id);
      assert.ok(original);
      assert.ok(prepared);
      assert.match(prepared.absolutePath, /\.png$/u);
      assert.equal(prepared.path, original.path);
      assert.equal(prepared.sha256, original.sha256);
      assert.equal(prepared.bytes, original.bytes);
    }
    const composition = buildFfmpegComposition({
      compiled,
      output: compiled.outputs[0]!,
      assets: preparedAssets,
      textDirectory: join(fixtureDirectory, 'composition-text'),
      cursorPath: join(fixtureDirectory, 'cursor.rgba'),
      cursorSize: 64,
      fontPath: join(fixtureDirectory, 'font.ttf'),
    });
    const pngInputs = composition.inputArgs.filter((argument) => argument.endsWith('.png'));
    assert.equal(composition.inputArgs.some((argument) => argument.endsWith('.svg')), false);
    assert.equal(pngInputs.length, 3);
    assert.equal(pngInputs.every((argument) => argument.startsWith(preparedDirectory)), true);

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
    assert.deepEqual(await renderWorkDirectories(firstOutput), []);
    assert.deepEqual(await renderWorkDirectories(secondOutput), []);
    assert.equal(await readFile(compiledPath, 'utf8'), compiledBeforeRender);
    assert.deepEqual(
      JSON.parse(await readFile(compiledPath, 'utf8')).assets.map((asset: {path: string}) => asset.path),
      ['screen-a.svg', 'screen-b.svg', 'tone.wav'],
    );

    const tamperedSvg = landscapeSvg.toString('utf8').replace('#f4f6f8', '#f5f6f8');
    assert.equal(Buffer.byteLength(tamperedSvg), landscapeSvg.length);
    await writeFile(firstImage, tamperedSvg, 'utf8');
    const tamperedOutput = join(fixtureDirectory, 'render-tampered');
    await assert.rejects(
      renderProject({
        compiledPath,
        outputDirectory: tamperedOutput,
        workingDirectory: fixtureDirectory,
      }),
      /SHA-256 differs/,
    );
    assert.deepEqual(await renderWorkDirectories(tamperedOutput), []);
  } finally {
    await rm(fixtureDirectory, {recursive: true, force: true});
  }
});
