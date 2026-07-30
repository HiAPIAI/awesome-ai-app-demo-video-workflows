import {mkdir} from 'node:fs/promises';
import {extname, join} from 'node:path';
import sharp from 'sharp';
import type {ResolvedAsset} from './assets.js';

const MAX_SVG_PIXELS = 64 * 1024 * 1024;

export async function rasterizeSvgAssets(
  assets: ReadonlyMap<string, ResolvedAsset>,
  outputDirectory: string,
): Promise<Map<string, ResolvedAsset>> {
  const prepared = new Map<string, ResolvedAsset>();
  await mkdir(outputDirectory, {recursive: true});

  for (const [id, asset] of assets) {
    if (asset.type !== 'image' || extname(asset.path).toLowerCase() !== '.svg') {
      prepared.set(id, asset);
      continue;
    }
    if (!asset.verifiedSvg) throw new Error(`SVG asset ${asset.id} was not retained after integrity verification.`);

    const outputPath = join(outputDirectory, `${asset.sha256}.png`);
    await sharp(asset.verifiedSvg, {density: 96, limitInputPixels: MAX_SVG_PIXELS})
      .png({compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10})
      .toFile(outputPath);
    prepared.set(id, {...asset, absolutePath: outputPath});
  }

  return prepared;
}
