import * as core from '@actions/core';
import { GitHub } from '@actions/github/lib/utils';
import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import { info, warning, error, success, step, endGroup } from './log';

export interface Asset {
  name: string;
  browser_download_url: string;
}

export class Release {
  private octokit: InstanceType<typeof GitHub>;
  private owner: string;
  private repoName: string;
  private tag: string;
  private releaseId: number | null = null;

  constructor(
    octokit: InstanceType<typeof GitHub>,
    owner: string,
    repoName: string,
    tag: string,
  ) {
    this.octokit = octokit;
    this.owner = owner;
    this.repoName = repoName;
    this.tag = tag;
  }

  async ensureRelease(body: string): Promise<number> {
    // Check if release already exists
    const existingId = await this.getReleaseByTag();
    if (existingId) {
      this.releaseId = existingId;
      success(`Found existing release ID: ${this.releaseId}`);
      return this.releaseId;
    }

    // Create release
    step(`Creating release "${this.tag}"`);
    const releaseBody = body || await this.generateReleaseNotes();
    const response = await this.octokit.rest.repos.createRelease({
      owner: this.owner,
      repo: this.repoName,
      tag_name: this.tag,
      name: this.tag,
      body: releaseBody,
      draft: false,
      prerelease: false,
    });
    this.releaseId = response.data.id;
    endGroup();
    success(`Created release ID: ${this.releaseId}`);
    return this.releaseId;
  }

  async uploadAll(filePaths: string[]): Promise<Asset[]> {
    if (!this.releaseId) {
      throw new Error('Release not ensured. Call ensureRelease() first.');
    }

    const results = await Promise.allSettled(
      filePaths.map(file => this.uploadAsset(file)),
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      for (const f of failed) {
        const reason = (f as PromiseRejectedResult).reason;
        error(`Upload failed: ${reason?.message || reason}`);
      }
      core.setFailed(`${failed.length} file(s) failed to upload`);
      return [];
    }

    return (results as PromiseFulfilledResult<Asset>[]).map(r => r.value);
  }

  private async getReleaseByTag(): Promise<number | null> {
    try {
      const response = await this.octokit.rest.repos.getReleaseByTag({
        owner: this.owner,
        repo: this.repoName,
        tag: this.tag,
      });
      return response.data.id;
    } catch (err: unknown) {
      const httpError = err as { status?: number };
      if (httpError.status !== 404) {
        throw new Error(`Failed to check release: ${(err as Error)?.message || err}`);
      }
      return null;
    }
  }

  private async generateReleaseNotes(): Promise<string> {
    try {
      const notes = await this.octokit.rest.repos.generateReleaseNotes({
        owner: this.owner,
        repo: this.repoName,
        tag_name: this.tag,
      });
      return notes.data.body;
    } catch {
      return '';
    }
  }

  private async uploadAsset(filePath: string): Promise<Asset> {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const name = basename(filePath);
    step(`Uploading: ${name}`);

    // Delete existing asset with same name
    const assetsResponse = await this.octokit.rest.repos.listReleaseAssets({
      owner: this.owner,
      repo: this.repoName,
      release_id: this.releaseId!,
      per_page: 100,
    });

    const existing = assetsResponse.data.find(a => a.name === name);
    if (existing) {
      await this.octokit.rest.repos.deleteReleaseAsset({
        owner: this.owner,
        repo: this.repoName,
        asset_id: existing.id,
      });
      info(`Deleted existing asset: ${name}`);
    }

    // Upload
    const content = readFileSync(filePath);
    const response = await this.withRetry(() =>
      this.octokit.rest.repos.uploadReleaseAsset({
        owner: this.owner,
        repo: this.repoName,
        release_id: this.releaseId!,
        name,
        data: content as unknown as string,
        headers: {
          'content-type': 'application/octet-stream',
          'content-length': content.length,
        },
      }),
    );

    const asset = response.data as unknown as Asset;
    success(`Uploaded: ${name} → ${asset.browser_download_url}`);
    endGroup();
    return asset;
  }

  private async withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        warning(`Attempt ${attempt}/${maxRetries} failed: ${(err as Error)?.message || err}`);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
        }
      }
    }
    throw lastError;
  }
}
