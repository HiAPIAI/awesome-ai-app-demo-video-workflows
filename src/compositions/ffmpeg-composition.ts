import {join} from 'node:path';
import type {
  AudioTrackSpec,
  CompiledDemoV1,
  CompiledScene,
  Easing,
  FitMode,
  OutputSpec,
  Transition,
} from '../contracts/types.js';
import type {ResolvedAsset} from '../media/assets.js';
import {
  TRANSITION_FRAMES,
  interpolateExpression,
  interpolateFrame,
  transformValue,
  transitionScaleExpression,
} from './frame-math.js';
import {comparisonRects, screenRect, type ContentRect} from './layout.js';

export interface TextFileSpec {
  path: string;
  contents: string;
}

export interface CompositionFeatures {
  screenshotTransform: boolean;
  crop: boolean;
  deviceFrame: boolean;
  cursor: boolean;
  clickRipple: boolean;
  callout: boolean;
  caption: boolean;
  transition: boolean;
}

export interface FfmpegComposition {
  inputArgs: string[];
  filterGraph: string;
  videoLabel: '[vout]';
  audioLabel?: '[aout]';
  textFiles: TextFileSpec[];
  expectedFrames: number;
  durationSeconds: number;
  features: CompositionFeatures;
}

interface CompositionOptions {
  compiled: CompiledDemoV1;
  output: OutputSpec;
  assets: ReadonlyMap<string, ResolvedAsset>;
  textDirectory: string;
  cursorPath: string;
  cursorSize: number;
  fontPath: string;
}

function color(value: string, label: string): string {
  if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) {
    throw new Error(`${label} must be a six- or eight-digit hexadecimal color.`);
  }
  return `0x${value.slice(1)}`;
}

function filterPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^([a-z]):/i, '$1\\:').replaceAll("'", "\\'");
}

function frameAtOutput(frame: number, sourceFps: number, outputFps: number): number {
  return Math.round((frame * outputFps) / sourceFps);
}

function decimal(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function assetInputArgs(asset: ResolvedAsset, fps: number): string[] {
  if (asset.type === 'image') {
    return ['-loop', '1', '-framerate', String(fps), '-i', asset.absolutePath];
  }
  if (asset.type === 'video') {
    return ['-stream_loop', '-1', '-i', asset.absolutePath];
  }
  throw new Error(`Asset ${asset.id} cannot be used as a visual layer because it is ${asset.type}.`);
}

function fitFilters(rect: ContentRect, fit: FitMode): string[] {
  const size = `w=${rect.width}:h=${rect.height}`;
  if (fit === 'fill') {
    return [`scale=${size}`];
  }
  if (fit === 'cover') {
    return [
      `scale=${size}:force_original_aspect_ratio=increase:force_divisible_by=2`,
      `crop=${rect.width}:${rect.height}`,
    ];
  }
  return [
    `scale=${size}:force_original_aspect_ratio=decrease:force_divisible_by=2`,
    `pad=${rect.width}:${rect.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
  ];
}

function opacityFilters(scene: CompiledScene, durationFrames: number): string[] {
  const from = transformValue(scene.from, 'opacity', 1);
  const to = transformValue(scene.to, 'opacity', 1);
  const filters: string[] = [];
  const transitionFrames = Math.min(TRANSITION_FRAMES, Math.max(1, Math.floor(durationFrames / 3)));

  if (from === to && from < 1) {
    filters.push(`colorchannelmixer=aa=${decimal(Math.max(0, from))}`);
  } else if (from === 0 && to > 0) {
    if (to < 1) filters.push(`colorchannelmixer=aa=${decimal(to)}`);
    filters.push(`fade=t=in:start_frame=0:nb_frames=${durationFrames}:alpha=1`);
  } else if (to === 0 && from > 0) {
    if (from < 1) filters.push(`colorchannelmixer=aa=${decimal(from)}`);
    filters.push(`fade=t=out:start_frame=0:nb_frames=${durationFrames}:alpha=1`);
  } else if (from !== 1 || to !== 1) {
    filters.push(`colorchannelmixer=aa=${decimal(Math.max(0, Math.min(1, (from + to) / 2)))}`);
  }

  if (scene.transitionIn === 'fade') {
    filters.push(`fade=t=in:start_frame=0:nb_frames=${transitionFrames}:alpha=1`);
  }
  if (scene.transitionOut === 'fade') {
    filters.push(
      `fade=t=out:start_frame=${Math.max(0, durationFrames - transitionFrames)}:nb_frames=${transitionFrames}:alpha=1`,
    );
  }
  return filters;
}

function slideExpression(
  base: number,
  distance: number,
  transitionIn: Transition | undefined,
  transitionOut: Transition | undefined,
  globalFrame: string,
  startFrame: number,
  durationFrames: number,
  kind: 'horizontal' | 'vertical',
): string {
  const expectedIn = kind === 'horizontal' ? 'slide-left' : 'slide-up';
  const transitionFrames = Math.min(TRANSITION_FRAMES, Math.max(1, Math.floor(durationFrames / 3)));
  const local = `(${globalFrame}-${startFrame})`;
  let expression = `${base}`;
  if (transitionIn === expectedIn) {
    expression += `-${distance}*(1-min(max(${local}/${transitionFrames},0),1))`;
  }
  if (transitionOut === expectedIn) {
    const outStart = durationFrames - transitionFrames;
    expression += `-${distance}*min(max((${local}-${outStart})/${transitionFrames},0),1)`;
  }
  return expression;
}

function wrapText(value: string, maximumCharacters: number): string {
  const words = value.trim().split(/\s+/u);
  if (words.length === 1 && (words[0]?.length ?? 0) > maximumCharacters) {
    return value.match(new RegExp(`.{1,${maximumCharacters}}`, 'gu'))?.join('\n') ?? value;
  }
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length > 0 && line.length + word.length + 1 > maximumCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = line.length === 0 ? word : `${line} ${word}`;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join('\n');
}

export function buildFfmpegComposition(options: CompositionOptions): FfmpegComposition {
  const {compiled, output, assets, textDirectory, cursorPath, cursorSize: sourceCursorSize, fontPath} = options;
  const width = output.width;
  const height = output.height;
  const fps = output.fps;
  const sourceFps = compiled.canvas.fps;
  const expectedFrames = frameAtOutput(compiled.canvas.durationFrames, sourceFps, fps);
  const durationSeconds = expectedFrames / fps;
  const inputArgs = [
    '-f',
    'lavfi',
    '-i',
    `color=c=${color(compiled.brand.background, 'brand.background')}:s=${width}x${height}:r=${fps}:d=${durationSeconds}`,
  ];
  const filters: string[] = [
    `[0:v]fps=${fps},trim=end_frame=${expectedFrames},setpts=N/(${fps}*TB),format=rgba[base]`,
  ];
  const textFiles: TextFileSpec[] = [];
  const features: CompositionFeatures = {
    screenshotTransform: false,
    crop: false,
    deviceFrame: false,
    cursor: false,
    clickRipple: false,
    callout: false,
    caption: false,
    transition: false,
  };
  const font = filterPath(fontPath);
  const foreground = color(compiled.brand.foreground, 'brand.foreground');
  const accent = color(compiled.brand.accent, 'brand.accent');
  let current = 'base';
  let inputIndex = 1;
  let labelIndex = 0;
  let textIndex = 0;

  const addTextFile = (prefix: string, contents: string): string => {
    const path = join(textDirectory, `${String(textIndex++).padStart(3, '0')}-${prefix}.txt`);
    textFiles.push({path, contents});
    return filterPath(path);
  };

  const drawText = (spec: {
    name: string;
    text: string;
    color: string;
    size: number;
    x: string | number;
    y: string | number;
    start: number;
    end: number;
    alpha?: string;
  }): void => {
    const outputLabel = `text${labelIndex++}`;
    const textPath = addTextFile(spec.name, spec.text);
    const alpha = spec.alpha ? `:alpha='${spec.alpha}'` : '';
    filters.push(
      `[${current}]drawtext=fontfile='${font}':textfile='${textPath}':reload=0:` +
        `fontcolor=${spec.color}:fontsize=${spec.size}:line_spacing=${Math.max(4, Math.round(spec.size * 0.25))}:` +
        `x=${spec.x}:y=${spec.y}${alpha}:enable='between(n,${spec.start},${spec.end})'[${outputLabel}]`,
    );
    current = outputLabel;
  };

  const drawDeviceFrame = (rect: ContentRect, start: number, end: number): void => {
    const border = Math.max(6, Math.round(Math.min(width, height) * 0.012));
    const outputLabel = `device${labelIndex++}`;
    filters.push(
      `[${current}]drawbox=x=${rect.x - border}:y=${rect.y - border}:w=${rect.width + border * 2}:` +
        `h=${rect.height + border * 2}:color=0x11151B:t=fill:enable='between(n,${start},${end})'[${outputLabel}]`,
    );
    current = outputLabel;
    features.deviceFrame = true;
  };

  const addVisual = (scene: CompiledScene, assetId: string, rect: ContentRect): void => {
    const asset = assets.get(assetId);
    if (!asset) throw new Error(`Scene ${scene.id} references missing asset ${assetId}.`);
    inputArgs.push(...assetInputArgs(asset, fps));
    const sceneStart = frameAtOutput(scene.startFrame, sourceFps, fps);
    const sceneEnd = Math.min(expectedFrames, frameAtOutput(scene.endFrame, sourceFps, fps));
    const sceneDuration = Math.max(1, sceneEnd - sceneStart);
    const easing = scene.easing ?? 'linear';
    const fromScale = transformValue(scene.from, 'scale', 1);
    const toScale = transformValue(scene.to, 'scale', 1);
    const scale = interpolateExpression(fromScale, toScale, 'n', sceneDuration, easing);
    const transitionScale = transitionScaleExpression(
      scene.transitionIn,
      scene.transitionOut,
      'n',
      sceneDuration,
    );
    const scaleExpression = `(${scale})*(${transitionScale})`;
    const xFrom = transformValue(scene.from, 'x', 0) * (width / compiled.canvas.width);
    const xTo = transformValue(scene.to, 'x', 0) * (width / compiled.canvas.width);
    const yFrom = transformValue(scene.from, 'y', 0) * (height / compiled.canvas.height);
    const yTo = transformValue(scene.to, 'y', 0) * (height / compiled.canvas.height);
    const panX = interpolateExpression(xFrom, xTo, 'n', sceneDuration, easing);
    const panY = interpolateExpression(yFrom, yTo, 'n', sceneDuration, easing);
    const sourceLabel = `source${labelIndex++}`;
    const scaledLabel = `scaled${labelIndex++}`;
    const canvasLabel = `viewportCanvas${labelIndex++}`;
    const viewportLabel = `viewport${labelIndex++}`;
    const alphaLabel = `alpha${labelIndex++}`;
    const shiftedLabel = `shifted${labelIndex++}`;
    const visualLabel = `visual${labelIndex++}`;
    const fit = scene.fit ?? 'contain';

    filters.push(
      `[${inputIndex}:v]fps=${fps},trim=end_frame=${sceneDuration},setpts=N/(${fps}*TB),format=rgba,` +
        `${fitFilters(rect, fit).join(',')},setsar=1[${sourceLabel}]`,
    );
    filters.push(
      `[${sourceLabel}]scale=w='max(2,trunc(${rect.width}*${scaleExpression}/2)*2)':` +
        `h='max(2,trunc(${rect.height}*${scaleExpression}/2)*2)':eval=frame[${scaledLabel}]`,
    );
    filters.push(
      `color=c=black@0.0:s=${rect.width}x${rect.height}:r=${fps}:d=${sceneDuration},format=rgba[${canvasLabel}]`,
    );
    filters.push(
      `[${canvasLabel}][${scaledLabel}]overlay=x='(main_w-overlay_w)/2+${panX}':` +
        `y='(main_h-overlay_h)/2+${panY}':shortest=1:format=auto[${viewportLabel}]`,
    );
    const alphaChain = opacityFilters(scene, sceneDuration);
    filters.push(
      `[${viewportLabel}]${alphaChain.length > 0 ? `${alphaChain.join(',')},` : ''}format=rgba[${alphaLabel}]`,
    );
    filters.push(`[${alphaLabel}]setpts=PTS+${sceneStart}/${fps}/TB[${shiftedLabel}]`);
    const x = slideExpression(
      rect.x,
      width,
      scene.transitionIn,
      scene.transitionOut,
      'n',
      sceneStart,
      sceneDuration,
      'horizontal',
    );
    const y = slideExpression(
      rect.y,
      height,
      scene.transitionIn,
      scene.transitionOut,
      'n',
      sceneStart,
      sceneDuration,
      'vertical',
    );
    filters.push(
      `[${current}][${shiftedLabel}]overlay=x='${x}':y='${y}':eof_action=pass:repeatlast=0:` +
        `enable='between(n,${sceneStart},${sceneEnd - 1})'[${visualLabel}]`,
    );
    current = visualLabel;
    inputIndex += 1;
    features.screenshotTransform = true;
    features.crop ||= fit === 'cover';
    features.transition ||= scene.transitionIn !== undefined && scene.transitionIn !== 'none';
    features.transition ||= scene.transitionOut !== undefined && scene.transitionOut !== 'none';
  };

  for (const scene of compiled.scenes) {
    const sceneStart = frameAtOutput(scene.startFrame, sourceFps, fps);
    const sceneEnd = Math.min(expectedFrames, frameAtOutput(scene.endFrame, sourceFps, fps));
    if (sceneStart >= expectedFrames || sceneEnd <= sceneStart) continue;

    if (scene.kind === 'screen' && scene.assetId) {
      const rect = screenRect(width, height);
      drawDeviceFrame(rect, sceneStart, sceneEnd - 1);
      addVisual(scene, scene.assetId, rect);
    } else if (scene.kind === 'comparison' && scene.assetId && scene.secondaryAssetId) {
      const rects = comparisonRects(width, height);
      drawDeviceFrame(rects[0], sceneStart, sceneEnd - 1);
      drawDeviceFrame(rects[1], sceneStart, sceneEnd - 1);
      addVisual(scene, scene.assetId, rects[0]);
      addVisual(scene, scene.secondaryAssetId, rects[1]);
    } else if (scene.assetId) {
      addVisual(scene, scene.assetId, {x: 0, y: 0, width, height});
    }

    const headingSize = Math.max(24, Math.round(Math.min(width, height) * (scene.kind === 'title' ? 0.1 : 0.055)));
    const bodySize = Math.max(18, Math.round(Math.min(width, height) * 0.04));
    if (scene.heading) {
      drawText({
        name: `${scene.id}-heading`,
        text: wrapText(scene.heading, scene.kind === 'title' ? 32 : 52),
        color: foreground,
        size: headingSize,
        x: '(w-text_w)/2',
        y: scene.kind === 'title' || scene.kind === 'outro' ? 'h*0.34' : 'h*0.045',
        start: sceneStart,
        end: sceneEnd - 1,
      });
    }
    if (scene.body) {
      if (scene.kind === 'screen' || scene.kind === 'comparison') {
        const boxLabel = `captionBox${labelIndex++}`;
        const captionHeight = Math.round(height * 0.13);
        const captionX = Math.round(width * 0.08);
        const captionY = Math.round(height * 0.82);
        const captionWidth = Math.round(width * 0.84);
        filters.push(
          `[${current}]drawbox=x=${captionX}:y=${captionY}:w=${captionWidth}:h=${captionHeight}:color=black@0.72:t=fill:` +
            `enable='between(n,${sceneStart},${sceneEnd - 1})'[${boxLabel}]`,
        );
        current = boxLabel;
        features.caption = true;
      }
      drawText({
        name: `${scene.id}-body`,
        text: wrapText(scene.body, 58),
        color: scene.kind === 'screen' || scene.kind === 'comparison' ? 'white' : foreground,
        size: bodySize,
        x: '(w-text_w)/2',
        y: scene.kind === 'screen' || scene.kind === 'comparison' ? 'h*0.845' : 'h*0.52',
        start: sceneStart,
        end: sceneEnd - 1,
      });
    }

    for (const callout of scene.callouts ?? []) {
      const calloutStart = frameAtOutput(callout.startFrame, sourceFps, fps);
      const calloutEnd = Math.min(
        expectedFrames - 1,
        frameAtOutput(callout.startFrame + callout.durationFrames, sourceFps, fps) - 1,
      );
      const x = Math.round(callout.at.x * (width / compiled.canvas.width));
      const y = Math.round(callout.at.y * (height / compiled.canvas.height));
      const calloutSize = Math.max(16, Math.round(Math.min(width, height) * 0.032));
      const wrapped = wrapText(callout.text, 34);
      const longestLine = Math.max(...wrapped.split('\n').map((line) => line.length));
      const boxWidth = Math.min(Math.round(width * 0.48), Math.round(longestLine * calloutSize * 0.62 + 28));
      const boxHeight = Math.round(wrapped.split('\n').length * calloutSize * 1.35 + 20);
      const calloutColor = callout.accent ? color(callout.accent, `callout ${callout.text}`) : accent;
      const boxLabel = `calloutBox${labelIndex++}`;
      filters.push(
        `[${current}]drawbox=x=${x}:y=${y}:w=${boxWidth}:h=${boxHeight}:color=${calloutColor}@0.92:t=fill:` +
          `enable='between(n,${calloutStart},${calloutEnd})'[${boxLabel}]`,
      );
      current = boxLabel;
      drawText({
        name: `${scene.id}-callout`,
        text: wrapped,
        color: 'white',
        size: calloutSize,
        x: x + 14,
        y: y + 8,
        start: calloutStart,
        end: calloutEnd,
      });
      features.callout = true;
    }

    if (scene.cursor) {
      inputArgs.push(
        '-f',
        'rawvideo',
        '-pixel_format',
        'rgba',
        '-video_size',
        `${sourceCursorSize}x${sourceCursorSize}`,
        '-framerate',
        String(fps),
        '-i',
        cursorPath,
      );
      const cursorSource = `cursorSource${labelIndex++}`;
      const cursorShifted = `cursorShifted${labelIndex++}`;
      const cursorOutput = `cursorOutput${labelIndex++}`;
      const sceneDuration = sceneEnd - sceneStart;
      const easing: Easing = scene.easing ?? 'linear';
      const fromX = scene.cursor.from.x * (width / compiled.canvas.width);
      const toX = scene.cursor.to.x * (width / compiled.canvas.width);
      const fromY = scene.cursor.from.y * (height / compiled.canvas.height);
      const toY = scene.cursor.to.y * (height / compiled.canvas.height);
      const localFrame = `(n-${sceneStart})`;
      const x = interpolateExpression(fromX, toX, localFrame, sceneDuration, easing);
      const y = interpolateExpression(fromY, toY, localFrame, sceneDuration, easing);
      const cursorSize = Math.max(28, Math.round(Math.min(width, height) * 0.075));
      filters.push(
        `[${inputIndex}:v]loop=loop=-1:size=1:start=0,fps=${fps},trim=end_frame=${sceneDuration},` +
          `scale=${cursorSize}:${cursorSize},format=rgba[${cursorSource}]`,
      );
      filters.push(`[${cursorSource}]setpts=PTS+${sceneStart}/${fps}/TB[${cursorShifted}]`);
      filters.push(
        `[${current}][${cursorShifted}]overlay=x='${x}':y='${y}':eof_action=pass:repeatlast=0:` +
          `enable='between(n,${sceneStart},${sceneEnd - 1})'[${cursorOutput}]`,
      );
      current = cursorOutput;
      inputIndex += 1;
      features.cursor = true;

      for (const clickFrame of scene.cursor.clickFrames ?? []) {
        const click = frameAtOutput(clickFrame, sourceFps, fps);
        const sourceLocalClick = clickFrame - scene.startFrame;
        const clickX = interpolateFrame(fromX, toX, sourceLocalClick, scene.durationFrames, easing);
        const clickY = interpolateFrame(fromY, toY, sourceLocalClick, scene.durationFrames, easing);
        const rippleEnd = Math.min(expectedFrames - 1, click + Math.max(5, Math.round(fps * 0.42)));
        const rippleLabel = `ripple${labelIndex++}`;
        const rippleText = addTextFile('click-ripple', 'O');
        filters.push(
          `[${current}]drawtext=fontfile='${font}':textfile='${rippleText}':reload=0:fontcolor=${accent}:` +
            `fontsize='${Math.max(22, Math.round(cursorSize * 0.9))}+2.2*(n-${click})':` +
            `x=${decimal(clickX)}-text_w/2:y=${decimal(clickY)}-text_h/2:` +
            `alpha='max(0,1-(n-${click})/${Math.max(1, rippleEnd - click)})':` +
            `enable='between(n,${click},${rippleEnd})'[${rippleLabel}]`,
        );
        current = rippleLabel;
        features.clickRipple = true;
      }
    }
  }

  const audioLabels: string[] = [];
  for (const [audioNumber, track] of compiled.audio.entries()) {
    const asset = assets.get(track.assetId);
    if (!asset) throw new Error(`Audio track ${track.id} references missing asset ${track.assetId}.`);
    if (asset.type !== 'audio') throw new Error(`Audio track ${track.id} references non-audio asset ${asset.id}.`);
    inputArgs.push('-i', asset.absolutePath);
    const start = frameAtOutput(track.startFrame, sourceFps, fps);
    if (start >= expectedFrames) throw new Error(`Audio track ${track.id} starts after the render ends.`);
    const label = `audio${audioNumber}`;
    const chain = [
      `[${inputIndex}:a]aresample=48000`,
      `atrim=duration=${decimal(durationSeconds - start / fps)}`,
      'asetpts=PTS-STARTPTS',
      `volume=${decimal(track.volume)}`,
    ];
    appendAudioFades(chain, track, durationSeconds - start / fps, sourceFps);
    chain.push(`asetpts=PTS+${start}/${fps}/TB[${label}]`);
    filters.push(chain.join(','));
    audioLabels.push(`[${label}]`);
    inputIndex += 1;
  }

  const finalVideo = 'videoFormatted';
  filters.push(`[${current}]trim=end_frame=${expectedFrames},format=yuv420p[${finalVideo}]`);
  filters.push(`[${finalVideo}]null[vout]`);
  if (audioLabels.length > 0) {
    filters.push(
      `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0,` +
        `atrim=duration=${decimal(durationSeconds)},asetpts=N/SR/TB[aout]`,
    );
  }

  return {
    inputArgs,
    filterGraph: `${filters.join(';\n')}\n`,
    videoLabel: '[vout]',
    ...(audioLabels.length > 0 ? {audioLabel: '[aout]' as const} : {}),
    textFiles,
    expectedFrames,
    durationSeconds,
    features,
  };
}

function appendAudioFades(
  chain: string[],
  track: AudioTrackSpec,
  availableSeconds: number,
  sourceFps: number,
): void {
  if (track.fadeInFrames && track.fadeInFrames > 0) {
    const seconds = track.fadeInFrames / sourceFps;
    chain.push(`afade=t=in:st=0:d=${decimal(seconds)}`);
  }
  if (track.fadeOutFrames && track.fadeOutFrames > 0) {
    const seconds = track.fadeOutFrames / sourceFps;
    const start = Math.max(0, availableSeconds - seconds);
    chain.push(`afade=t=out:st=${decimal(start)}:d=${decimal(seconds)}`);
  }
}
