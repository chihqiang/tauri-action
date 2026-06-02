import * as core from '@actions/core';
import * as github from '@actions/github';
import { Config } from './config';
import { Builder } from './build';
import { Release } from './release';
import { Logger } from './log';
import { Target } from './target';
import { UpdaterGenerator } from './generate-updater';

export class Workflow {
  async runBuild(config: Config): Promise<void> {
    Logger.step('Building Tauri app');
    const buildResult = await Builder.run(
      config.projectPath,
      config.target,
      config.privateKey,
      config.args,
    );
    core.setOutput('version', buildResult.appVersion);
    Logger.info(`Set output version=${buildResult.appVersion}`);
    Logger.endGroup();

    const uploadPaths = buildResult.artifacts.map((a) => a.path);

    Logger.info('Files to upload:');
    for (const p of uploadPaths) {
      Logger.info(`  ${p}`);
    }

    Logger.step('Ensuring GitHub Release');
    const [owner, repoName] = config.parseRepo();
    Logger.info(`Repository: ${owner}/${repoName}`);
    Logger.info(`Tag: ${config.tag}`);
    const octokit = github.getOctokit(config.token);
    const release = new Release(octokit, owner, repoName, config.tag);
    const releaseId = await release.ensureRelease(config.releaseBody);
    core.setOutput('releaseId', String(releaseId));
    Logger.info(`Set output releaseId=${releaseId}`);
    Logger.endGroup();

    Logger.step('Uploading artifacts');
    const uploaded = await release.uploadAll(uploadPaths);
    Logger.info(`Uploaded ${uploaded.length} file(s)`);
    Logger.endGroup();

    const platform = Target.toPlatform(config.target);
    core.setOutput('platform', platform);
    Logger.info(`Set output platform=${platform}`);

    const sigArtifact = buildResult.artifacts.find((a) => a.type === 'signature');
    if (sigArtifact) {
      const sig = Builder.readSignature(sigArtifact.path);
      core.setOutput('signature', sig);
      Logger.info(`Set output signature (from ${sigArtifact.name})`);
    } else {
      Logger.info('No signature artifact found');
    }

    const archiveArtifact = buildResult.artifacts.find(
      (a) => a.type === 'archive' || a.type === 'installer',
    );
    if (archiveArtifact) {
      const url = `https://github.com/${config.repo}/releases/latest/download/${encodeURIComponent(archiveArtifact.name)}`;
      core.setOutput('downloadUrl', url);
      core.setOutput('archiveName', archiveArtifact.name);
      Logger.info(`Set output downloadUrl=${url}`);
      Logger.info(`Set output archiveName=${archiveArtifact.name}`);
    }

    Logger.success('Build and upload complete!');
  }

  async runGenerateUpdater(config: Config): Promise<void> {
    if (!config.token) throw new Error('token is required');
    if (!config.tag) throw new Error('tag is required');

    Logger.step('Generating updater.json');
    const generator = new UpdaterGenerator(config);
    const { owner, repoName, octokit } = generator.createClient();
    const release = await generator.fetchRelease(octokit, owner, repoName);
    const assets = await generator.listAssets(octokit, owner, repoName, release.id);
    const platforms = await generator.collectPlatforms(octokit, owner, repoName, assets);
    const updaterContent = generator.buildUpdaterJson(platforms);
    await generator.uploadUpdaterJson(octokit, owner, repoName, release.id, assets, updaterContent);
    Logger.success('updater.json generated and uploaded');
    Logger.endGroup();
  }
}
