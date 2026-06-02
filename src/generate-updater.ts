import * as github from '@actions/github';
import { Config } from './config';
import { Logger } from './log';
import { PLATFORMS, ARCH, ARCH_ALIASES, EXT } from './target';

interface UpdaterPlatform {
  signature: string;
  url: string;
}

interface ReleaseInfo {
  id: number;
}

interface ReleaseAsset {
  id: number;
  name: string;
}

export class UpdaterGenerator {
  constructor(private config: Config) {}

  createClient() {
    const [owner, repoName] = this.config.parseRepo();
    const octokit = github.getOctokit(this.config.token);
    return { owner, repoName, octokit };
  }

  async fetchRelease(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repoName: string,
  ): Promise<ReleaseInfo> {
    Logger.info(`Fetching release for tag: ${this.config.tag}`);
    const { data: release } = await octokit.rest.repos.getReleaseByTag({
      owner,
      repo: repoName,
      tag: this.config.tag,
    });
    Logger.info(`Found release ID: ${release.id}`);
    return release;
  }

  async listAssets(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repoName: string,
    releaseId: number,
  ): Promise<ReleaseAsset[]> {
    Logger.info('Listing release assets...');
    const { data: assets } = await octokit.rest.repos.listReleaseAssets({
      owner,
      repo: repoName,
      release_id: releaseId,
      per_page: 100,
    });
    Logger.info(`Found ${assets.length} asset(s) total`);
    return assets;
  }

  async collectPlatforms(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repoName: string,
    assets: ReleaseAsset[],
  ): Promise<Record<string, UpdaterPlatform>> {
    const sigAssets = assets.filter((a) => a.name.endsWith(EXT.SIG));
    Logger.info(`Found ${sigAssets.length} ${EXT.SIG} file(s)`);

    const platforms: Record<string, UpdaterPlatform> = {};

    for (const sigAsset of sigAssets) {
      const archiveName = sigAsset.name.replace(/\.sig$/, '');
      Logger.info(`Processing: ${sigAsset.name}`);

      const platform = this.inferPlatform(archiveName);
      if (!platform) {
        Logger.info(`  ↳ Skipping — could not infer platform from name`);
        continue;
      }
      Logger.info(`  ↳ Platform: ${platform}`);

      Logger.info(`  ↳ Downloading signature...`);
      const sigResponse = await octokit.rest.repos.getReleaseAsset({
        owner,
        repo: repoName,
        asset_id: sigAsset.id,
        headers: { accept: 'application/octet-stream' },
      });
      const signature = String(sigResponse.data).trim();
      Logger.info(`  ↳ Signature length: ${signature.length} chars`);

      const downloadUrl = `https://github.com/${this.config.repo}/releases/latest/download/${encodeURIComponent(archiveName)}`;
      Logger.info(`  ↳ Download URL: ${downloadUrl}`);

      platforms[platform] = { signature, url: downloadUrl };
    }

    if (Object.keys(platforms).length === 0) {
      throw new Error('No .sig files found in release');
    }
    Logger.info(`Resolved platforms: ${Object.keys(platforms).join(', ')}`);

    return platforms;
  }

  buildUpdaterJson(platforms: Record<string, UpdaterPlatform>): string {
    const version = this.config.tag.replace(/^v/, '');
    const updater = {
      version,
      notes: '',
      pub_date: new Date().toISOString(),
      platforms,
    };
    const content = JSON.stringify(updater, null, 2);
    Logger.info(`updater.json:\n${content}`);
    return content;
  }

  async uploadUpdaterJson(
    octokit: ReturnType<typeof github.getOctokit>,
    owner: string,
    repoName: string,
    releaseId: number,
    assets: ReleaseAsset[],
    updaterContent: string,
  ): Promise<void> {
    Logger.info('Uploading updater.json to release...');

    const existingUpdater = assets.find((a) => a.name === 'updater.json');
    if (existingUpdater) {
      Logger.info('Deleting existing updater.json...');
      await octokit.rest.repos.deleteReleaseAsset({
        owner,
        repo: repoName,
        asset_id: existingUpdater.id,
      });
      Logger.info('Deleted');
    }

    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo: repoName,
      release_id: releaseId,
      name: 'updater.json',
      data: Buffer.from(updaterContent, 'utf-8') as unknown as string,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(updaterContent, 'utf-8'),
      },
    });
  }

  private inferPlatform(assetName: string): string | null {
    const lower = assetName.toLowerCase();
    if (lower.includes(ARCH.AARCH64) || lower.includes(ARCH_ALIASES.ARM64)) {
      if (lower.endsWith(EXT.TAR_GZ) || lower.includes(EXT.APP)) return PLATFORMS.DARWIN_AARCH64;
      if (lower.endsWith(EXT.APPIMAGE) || lower.endsWith(EXT.DEB)) return PLATFORMS.LINUX_AARCH64;
    }
    if (
      lower.includes(ARCH.X86_64) ||
      lower.includes(ARCH_ALIASES.X64) ||
      lower.includes(ARCH_ALIASES.AMD64) ||
      lower.includes(ARCH_ALIASES.INTEL)
    ) {
      if (lower.endsWith(EXT.TAR_GZ) || lower.includes(EXT.APP)) return PLATFORMS.DARWIN_X86_64;
      if (lower.endsWith(EXT.MSI) || lower.endsWith(EXT.EXE)) return PLATFORMS.WINDOWS_X86_64;
      if (lower.endsWith(EXT.APPIMAGE) || lower.endsWith(EXT.DEB)) return PLATFORMS.LINUX_X86_64;
    }
    return null;
  }
}
