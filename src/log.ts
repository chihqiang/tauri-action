import * as core from '@actions/core';

export const info = core.info;
export const warning = core.warning;
export const error = core.error;

export function success(message: string) {
  core.info(`✓ ${message}`);
}

export function step(message: string) {
  core.startGroup(message);
}

export function endGroup() {
  core.endGroup();
}
