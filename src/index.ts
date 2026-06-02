import * as core from '@actions/core';
import * as github from '@actions/github';
import { Config } from './config';
import { buildTauri, targetToPlatform, readSignature } from './build';
import { runGenerateUpdater } from './generate-updater';
import { Release } from './release';
import { info, success, step, endGroup } from './log';

/**
 * 构建模式：执行 tauri build、上传产物到 release
 */
async function runBuild(config: Config): Promise<void> {
  step('Building Tauri app');
  const buildResult = await buildTauri(
    config.projectPath,
    config.target,
    config.privateKey,
    config.args,
  );
  core.setOutput('version', buildResult.appVersion);
  endGroup();

  // 收集所有需上传的文件（含 .sig 签名文件）
  const uploadPaths = buildResult.artifacts.map(a => a.path);

  info('Files to upload:');
  for (const p of uploadPaths) {
    info(`  ${p}`);
  }

  // 获取或创建 GitHub Release，上传产物
  const [owner, repoName] = config.parseRepo();
  const octokit = github.getOctokit(config.token);
  const release = new Release(octokit, owner, repoName, config.tag);
  const releaseId = await release.ensureRelease(config.releaseBody);
  core.setOutput('releaseId', String(releaseId));

  step('Uploading artifacts');
  await release.uploadAll(uploadPaths);
  endGroup();

  // 输出平台信息供 generate-updater 使用
  const platform = targetToPlatform(config.target);
  core.setOutput('platform', platform);

  const sigArtifact = buildResult.artifacts.find(a => a.type === 'signature');
  if (sigArtifact) {
    core.setOutput('signature', readSignature(sigArtifact.path));
  }

  const archiveArtifact = buildResult.artifacts.find(
    a => a.type === 'archive' || a.type === 'installer',
  );
  if (archiveArtifact) {
    const url = `https://github.com/${config.repo}/releases/latest/download/${encodeURIComponent(archiveArtifact.name)}`;
    core.setOutput('downloadUrl', url);
    core.setOutput('archiveName', archiveArtifact.name);
  }

  success('Build and upload complete!');
}

/**
 * 入口：根据 command 参数分发到 build 或 generate-updater
 */
async function main(): Promise<void> {
  try {
    const config = new Config();
    const command = core.getInput('command') || 'build';

    info(`Command: ${command}`);
    info(`Tag: ${config.tag}`);
    info(`Repo: ${config.repo}`);

    if (command === 'generate-updater') {
      // generate-updater 模式：收集所有 .sig → 生成 updater.json → 上传
      if (!config.token) throw new Error('token is required');
      if (!config.tag) throw new Error('tag is required');
      await runGenerateUpdater(config);
    } else {
      // build 模式：默认行为
      config.validate();
      await runBuild(config);
    }
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    core.setFailed(message);
  }
}

main();
