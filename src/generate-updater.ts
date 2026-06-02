import * as core from '@actions/core';
import * as github from '@actions/github';
import { Config } from './config';
import { info, success, step, endGroup, error } from './log';

interface UpdaterPlatform {
  signature: string;
  url: string;
}

function inferPlatform(assetName: string): string | null {
  const lower = assetName.toLowerCase();
  if (lower.includes('aarch64') || lower.includes('arm64')) {
    if (lower.endsWith('.tar.gz') || lower.includes('.app')) return 'darwin-aarch64';
    if (lower.endsWith('.appimage') || lower.endsWith('.deb')) return 'linux-aarch64';
  }
  if (lower.includes('x86_64') || lower.includes('x64') || lower.includes('amd64') || lower.includes('intel')) {
    if (lower.endsWith('.tar.gz') || lower.includes('.app')) return 'darwin-x86_64';
    if (lower.endsWith('.msi') || lower.endsWith('.exe')) return 'windows-x86_64';
    if (lower.endsWith('.appimage') || lower.endsWith('.deb')) return 'linux-x86_64';
  }
  return null;
}

export async function runGenerateUpdater(config: Config): Promise<void> {
  step('Generating updater.json');

  const [owner, repoName] = config.parseRepo();
  const octokit = github.getOctokit(config.token);

  // Get release
  const { data: release } = await octokit.rest.repos.getReleaseByTag({
    owner,
    repo: repoName,
    tag: config.tag,
  });
  info(`Found release ID: ${release.id}`);

  // Get all assets
  const { data: assets } = await octokit.rest.repos.listReleaseAssets({
    owner,
    repo: repoName,
    release_id: release.id,
    per_page: 100,
  });
  info(`Found ${assets.length} asset(s)`);

  // Download .sig files
  const sigAssets = assets.filter(a => a.name.endsWith('.sig'));
  const platforms: Record<string, UpdaterPlatform> = {};

  for (const sigAsset of sigAssets) {
    const archiveName = sigAsset.name.replace(/\.sig$/, '');
    const platform = inferPlatform(archiveName);
    if (!platform) {
      info(`Skipping ${sigAsset.name}: could not infer platform`);
      continue;
    }

    // Download signature content
    const sigResponse = await octokit.rest.repos.getReleaseAsset({
      owner,
      repo: repoName,
      asset_id: sigAsset.id,
      headers: { accept: 'application/octet-stream' },
    });
    const signature = String(sigResponse.data).trim();

    const downloadUrl = `https://github.com/${config.repo}/releases/latest/download/${encodeURIComponent(archiveName)}`;

    platforms[platform] = { signature, url: downloadUrl };
    info(`  ${platform}: ${archiveName}`);
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('No .sig files found in release');
  }

  // Build updater.json
  const version = config.tag.replace(/^v/, '');
  const updater = {
    version,
    notes: '',
    pub_date: new Date().toISOString(),
    platforms,
  };

  const updaterContent = JSON.stringify(updater, null, 2);
  info(`updater.json:\n${updaterContent}`);

  // Upload updater.json as a release asset
  const existingUpdater = assets.find(a => a.name === 'updater.json');
  if (existingUpdater) {
    await octokit.rest.repos.deleteReleaseAsset({
      owner,
      repo: repoName,
      asset_id: existingUpdater.id,
    });
    info('Deleted existing updater.json');
  }

  await octokit.rest.repos.uploadReleaseAsset({
    owner,
    repo: repoName,
    release_id: release.id,
    name: 'updater.json',
    data: Buffer.from(updaterContent, 'utf-8') as unknown as string,
    headers: {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(updaterContent, 'utf-8'),
    },
  });
  endGroup();
  success('updater.json generated and uploaded');
}
