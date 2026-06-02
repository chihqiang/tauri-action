import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import { GitHubClient } from './github';
import { Logger } from './log';

export interface Asset {
  name: string;
  browser_download_url: string;
}

export class Release {
  private client: GitHubClient;
  private owner: string;
  private repoName: string;
  private tag: string;
  private releaseId: number | null = null;

  constructor(client: GitHubClient, owner: string, repoName: string, tag: string) {
    this.client = client;
    this.owner = owner;
    this.repoName = repoName;
    this.tag = tag;
  }

  async ensureRelease(body: string): Promise<number> {
    Logger.info('Checking if release already exists...');
    const existingId = await this.getReleaseByTag();
    if (existingId) {
      this.releaseId = existingId;
      Logger.info(`Found existing release ID: ${this.releaseId}`);
      return this.releaseId;
    }

    Logger.info('Release not found — creating new one');
    const releaseBody = body || (await this.generateReleaseNotes());
    if (body) {
      Logger.info('Using provided release body');
    } else {
      Logger.info('Using auto-generated release notes');
    }

    const data = await this.client.createRelease(this.owner, this.repoName, this.tag, releaseBody);
    this.releaseId = data.id;
    Logger.success(`Created release ID: ${this.releaseId}`);
    return this.releaseId;
  }

  async uploadAll(filePaths: string[]): Promise<Asset[]> {
    if (!this.releaseId) {
      throw new Error('Release not ensured. Call ensureRelease() first.');
    }

    Logger.info(`Uploading ${filePaths.length} file(s) to release ${this.releaseId}...`);
    const results = await Promise.allSettled(filePaths.map((file) => this.uploadAsset(file)));

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected');

    Logger.info(`Uploaded: ${succeeded}, Failed: ${failed.length}`);

    if (failed.length > 0) {
      const messages = failed.map((f) => {
        const reason = (f as PromiseRejectedResult).reason;
        return reason?.message || String(reason);
      });
      throw new Error(`Upload failed for ${failed.length} file(s): ${messages.join('; ')}`);
    }

    return (results as PromiseFulfilledResult<Asset>[]).map((r) => r.value);
  }

  private async getReleaseByTag(): Promise<number | null> {
    try {
      const data = await this.client.getReleaseByTag(this.owner, this.repoName, this.tag);
      Logger.info(`Release found: ID ${data.id}`);
      return data.id;
    } catch (err: unknown) {
      const httpError = err as { status?: number };
      if (httpError.status === 404) {
        Logger.info('No existing release found (404)');
        return null;
      }
      throw new Error(`Failed to check release: ${(err as Error)?.message || err}`, { cause: err });
    }
  }

  private async generateReleaseNotes(): Promise<string> {
    try {
      Logger.info('Generating release notes...');
      const data = await this.client.generateReleaseNotes(this.owner, this.repoName, this.tag);
      Logger.info('Release notes generated');
      return data.body;
    } catch {
      Logger.info('Could not generate release notes — using empty body');
      return '';
    }
  }

  private async uploadAsset(filePath: string): Promise<Asset> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const name = basename(filePath);
    Logger.info(`Uploading: ${name}`);
    Logger.info(`  File size: ${readFileSync(filePath).length} bytes`);

    const assets = await this.client.listReleaseAssets(this.owner, this.repoName, this.releaseId!);

    const existing = assets.find((a) => a.name === name);
    if (existing) {
      Logger.info(`  Duplicate found — deleting existing asset: ${name}`);
      await this.client.deleteReleaseAsset(this.owner, this.repoName, existing.id);
      Logger.info('  Deleted');
    }

    const content = readFileSync(filePath);
    const asset = await this.withRetry(() =>
      this.client.uploadReleaseAsset(
        this.owner,
        this.repoName,
        this.releaseId!,
        name,
        content,
        'application/octet-stream',
      ),
    );

    const assetResult = asset as unknown as Asset;
    Logger.success(`Uploaded: ${name} → ${assetResult.browser_download_url}`);
    return assetResult;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        Logger.warning(`Upload attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}`);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          Logger.info(`  Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }
}
