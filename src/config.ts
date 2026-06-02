import * as core from '@actions/core';

export interface ActionConfig {
  token: string;
  tag: string;
  repo: string;
  target: string;
  privateKey: string;
  releaseBody: string;
  projectPath: string;
  args: string;
  eventName: string;
  ref: string;
}

export class Config implements ActionConfig {
  readonly token: string;
  readonly tag: string;
  readonly repo: string;
  readonly target: string;
  readonly privateKey: string;
  readonly releaseBody: string;
  readonly projectPath: string;
  readonly args: string;
  readonly eventName: string;
  readonly ref: string;

  constructor() {
    this.token = core.getInput('token') || process.env.GITHUB_TOKEN || '';
    this.tag = core.getInput('tag') || process.env.GITHUB_REF_NAME || '';
    this.repo = core.getInput('repo') || process.env.GITHUB_REPOSITORY || '';
    this.target = core.getInput('target');
    this.privateKey = core.getInput('privateKey') || '';
    this.releaseBody = core.getInput('releaseBody');
    this.projectPath = core.getInput('projectPath');
    this.args = core.getInput('args') || '';
    this.eventName = process.env.GITHUB_EVENT_NAME || '';
    this.ref = process.env.GITHUB_REF || '';
  }

  validate(): void {
    if (!this.token) {
      throw new Error('token is required');
    }
    if (!this.target) {
      throw new Error('target is required (e.g. aarch64-apple-darwin)');
    }
    if (!this.tag) {
      throw new Error('tag is required. Provide it via input or ensure GITHUB_REF_NAME is set');
    }
  }

  parseRepo(): [owner: string, repoName: string] {
    const parts = this.repo.split('/');
    if (parts.length !== 2) {
      throw new Error(`Invalid repo format: ${this.repo}, expected "owner/repo"`);
    }
    return parts as [string, string];
  }
}
