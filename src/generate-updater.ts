import { Config } from './config';
import { Logger } from './log';
import { PLATFORMS, ARCH, ARCH_ALIASES, EXT } from './target';
import { GitHubClient } from './github';

interface UpdaterPlatform {
  signature: string;
  url: string;
}

interface ReleaseAsset {
  id: number;
  name: string;
}

export class UpdaterGenerator {
  private client: GitHubClient;
  private owner: string;
  private repoName: string;

  constructor(private config: Config) {
    this.client = new GitHubClient(config.token);
    [this.owner, this.repoName] = config.parseRepo();
  }

  async run(): Promise<void> {
    Logger.info(`Fetching release for tag: ${this.config.tag}`);
    const release = await this.client.getReleaseByTag(this.owner, this.repoName, this.config.tag);
    Logger.info(`Found release ID: ${release.id}`);

    Logger.info('Listing release assets...');
    const assets = await this.client.listReleaseAssets(this.owner, this.repoName, release.id);
    Logger.info(`Found ${assets.length} asset(s) total`);

    const platforms = await this.collectPlatforms(assets);

    const updaterContent = this.buildUpdaterJson(platforms);

    await this.uploadUpdaterJson(release.id, assets, updaterContent);
    Logger.success('updater.json generated and uploaded');
  }

  private async collectPlatforms(assets: ReleaseAsset[]): Promise<Record<string, UpdaterPlatform>> {
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
      const signature = await this.client.getReleaseAsset(this.owner, this.repoName, sigAsset.id);
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

  private buildUpdaterJson(platforms: Record<string, UpdaterPlatform>): string {
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

  private async uploadUpdaterJson(
    releaseId: number,
    assets: ReleaseAsset[],
    updaterContent: string,
  ): Promise<void> {
    Logger.info('Uploading updater.json to release...');

    const existingUpdater = assets.find((a) => a.name === 'updater.json');
    if (existingUpdater) {
      Logger.info('Deleting existing updater.json...');
      await this.client.deleteReleaseAsset(this.owner, this.repoName, existingUpdater.id);
      Logger.info('Deleted');
    }

    const buffer = Buffer.from(updaterContent, 'utf-8');
    await this.client.uploadReleaseAsset(
      this.owner,
      this.repoName,
      releaseId,
      'updater.json',
      buffer,
      'application/json',
    );
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
