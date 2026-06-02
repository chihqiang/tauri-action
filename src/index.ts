import * as core from '@actions/core';
import { Config } from './config';
import { Logger } from './log';
import { Workflow } from './workflow';

async function main(): Promise<void> {
  try {
    const config = new Config();
    const command = core.getInput('command') || 'build';

    Logger.info(`Command: ${command}`);
    Logger.info(`Tag: ${config.tag}`);
    Logger.info(`Repo: ${config.repo}`);
    Logger.info(`Target: ${config.target || '(not set — only needed for build)'}`);

    if (command === 'generate-updater') {
      Logger.step('Generate updater command');
      await new Workflow().runGenerateUpdater(config);
      Logger.endGroup();
    } else {
      config.validate();
      Logger.step('Build command');
      await new Workflow().runBuild(config);
      Logger.endGroup();
    }
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    core.setFailed(message);
  }
}

main();
