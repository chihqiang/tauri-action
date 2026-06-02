import * as core from '@actions/core';

export class Logger {
  static info(message: string) {
    core.info(message);
  }
  static warning(message: string) {
    core.warning(message);
  }
  static error(message: string) {
    core.error(message);
  }
  static success(message: string) {
    core.info(`✓ ${message}`);
  }
  static step(message: string) {
    core.startGroup(message);
  }
  static endGroup() {
    core.endGroup();
  }
}
