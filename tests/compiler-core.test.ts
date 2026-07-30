import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {stringify} from 'yaml';
import {compileDemoFile, writeCompiledDemo} from '../src/compiler/compile.js';

test('compiles byte-identical canonical output without timestamps or absolute paths', () => {
  const directory = makeProject();
  try {
    const source = path.join(directory, 'demo.yaml');
    const first = compileDemoFile(source);
    const second = compileDemoFile(source);
    assert.equal(first.json, second.json);
    assert.deepEqual(first.compiled, second.compiled);
    assert.equal(first.compiled.scenes[0]?.endFrame, 90);
    assert.deepEqual(first.compiled.scenes[0]?.from, {x: 0, y: 0, scale: 1, opacity: 1});
    assert.equal(first.json.includes(directory), false);
    assert.equal(/createdAt|generatedAt|timestamp/i.test(first.json), false);
    assert.equal(first.compiled.hiapiRequests[0]?.endpoint, '/v1/tasks');
    assert.deepEqual(first.compiled.hiapiRequests[0]?.body, {model: 'mock-video-model', input: {prompt: 'A quiet abstract background'}});

    const output = path.join(directory, 'compiled');
    const files = writeCompiledDemo(first, output);
    assert.equal(files.length, 2);
    assert.equal(fs.readFileSync(path.join(output, 'compiled-demo-v1.json'), 'utf8'), first.json);
    assert.deepEqual(writeCompiledDemo(second, output), files);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('asset byte changes alter the compiled asset hash and cannot overwrite an old artifact', () => {
  const directory = makeProject();
  try {
    const source = path.join(directory, 'demo.yaml');
    const before = compileDemoFile(source);
    const output = path.join(directory, 'compiled');
    writeCompiledDemo(before, output);
    fs.writeFileSync(path.join(directory, 'assets', 'screen.png'), 'changed-image-bytes');
    const after = compileDemoFile(source);
    assert.notEqual(after.compiled.assets[0]?.sha256, before.compiled.assets[0]?.sha256);
    assert.throws(() => writeCompiledDemo(after, output), /Refusing to replace/);
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

function makeProject(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'app-demo-compiler-'));
  fs.mkdirSync(path.join(directory, 'assets'));
  fs.writeFileSync(path.join(directory, 'assets', 'screen.png'), 'fixture-image');
  fs.writeFileSync(path.join(directory, 'demo.yaml'), stringify({
    schemaVersion: 'demo-v1',
    project: {id: 'compiler-demo', title: 'Compiler Demo'},
    canvas: {width: 1280, height: 720, fps: 30, durationFrames: 90},
    brand: {background: '#FFFFFF', foreground: '#111111', accent: '#0066CC', fontFamily: 'Arial'},
    assets: [{id: 'screen', type: 'image', path: 'assets/screen.png'}],
    scenes: [{id: 'screen', kind: 'screen', startFrame: 0, durationFrames: 90, assetId: 'screen'}],
    outputs: [{id: 'main', width: 1280, height: 720, fps: 30, fileName: 'demo.mp4'}],
    hiapi: {enabled: true, enhancements: [{id: 'background', model: 'mock-video-model', purpose: 'background', prompt: 'A quiet abstract background'}]},
  }));
  return directory;
}
