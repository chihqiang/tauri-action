import * as github from '@actions/github';
import { GitHub } from '@actions/github/lib/utils';

export type Octokit = InstanceType<typeof GitHub>;

export class GitHubClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = github.getOctokit(token);
  }

  getOctokit(): Octokit {
    return this.octokit;
  }

  async getReleaseByTag(owner: string, repo: string, tag: string) {
    const { data } = await this.octokit.rest.repos.getReleaseByTag({ owner, repo, tag });
    return data;
  }

  async listReleaseAssets(owner: string, repo: string, releaseId: number) {
    const { data } = await this.octokit.rest.repos.listReleaseAssets({
      owner,
      repo,
      release_id: releaseId,
      per_page: 100,
    });
    return data;
  }

  async getReleaseAsset(owner: string, repo: string, assetId: number): Promise<string> {
    const response = await this.octokit.rest.repos.getReleaseAsset({
      owner,
      repo,
      asset_id: assetId,
      headers: { accept: 'application/octet-stream' },
    });
    const raw = response.data as unknown;
    if (raw instanceof ArrayBuffer) {
      return Buffer.from(raw).toString('utf-8').trim();
    }
    if (Buffer.isBuffer(raw)) {
      return raw.toString('utf-8').trim();
    }
    return String(raw).trim();
  }

  async deleteReleaseAsset(owner: string, repo: string, assetId: number) {
    await this.octokit.rest.repos.deleteReleaseAsset({ owner, repo, asset_id: assetId });
  }

  async uploadReleaseAsset(
    owner: string,
    repo: string,
    releaseId: number,
    name: string,
    data: Buffer,
    contentType: string,
  ) {
    const { data: asset } = await this.octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: releaseId,
      name,
      data: data as unknown as string,
      headers: {
        'content-type': contentType,
        'content-length': data.length,
      },
    });
    return asset;
  }

  async createRelease(owner: string, repo: string, tag: string, body: string) {
    const { data } = await this.octokit.rest.repos.createRelease({
      owner,
      repo,
      tag_name: tag,
      name: tag,
      body,
      draft: false,
      prerelease: false,
    });
    return data;
  }

  async generateReleaseNotes(owner: string, repo: string, tag: string) {
    const { data } = await this.octokit.rest.repos.generateReleaseNotes({
      owner,
      repo,
      tag_name: tag,
    });
    return data;
  }
}
