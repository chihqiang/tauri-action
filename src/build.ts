import { exec } from '@actions/exec';
import { existsSync, readFileSync, readdirSync, renameSync } from 'fs';
import { join, resolve } from 'path';
import { Logger } from './log';
import { ARCH, EXT, Target } from './target';

export interface BundleArtifact {
  path: string;
  name: string;
  type: 'dmg' | 'archive' | 'signature' | 'installer' | 'updater-json';
}

export interface BuildResult {
  artifacts: BundleArtifact[];
  appVersion: string;
}

export class Builder {
  static readSignature(sigPath: string): string {
    return readFileSync(sigPath, 'utf-8').trim();
  }

  static async run(
    projectPath: string,
    target: string,
    privateKey: string,
    extraArgs: string,
  ): Promise<BuildResult> {
    const root = resolve(projectPath);
    Logger.info(`Resolved project root: ${root}`);
    if (!existsSync(join(root, 'src-tauri'))) {
      throw new Error(`No src-tauri directory found in ${root}`);
    }

    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    if (privateKey) {
      Logger.info('Private key provided — signing will be enabled');
      env['TAURI_PRIVATE_KEY'] = privateKey;
      env['TAURI_SIGNING_PRIVATE_KEY'] = privateKey;
      env['TAURI_SIGNING_PRIVATE_KEY_PASSWORD'] = process.env.TAURI_PRIVATE_KEY_PASSWORD || '';
    } else {
      Logger.info('No private key — skipping signing');
    }

    const runner = Builder.findRunner(root);
    Logger.info(`Detected package manager: ${runner}`);
    const cmd = runner === 'npm' ? 'npx' : runner;
    const execArgs = ['tauri', 'build', '--target', target];
    if (extraArgs) {
      const extra = extraArgs.split(/\s+/).filter(Boolean);
      Logger.info(`Extra args: ${extra.join(' ')}`);
      execArgs.push(...extra);
    }

    Logger.step('Running tauri build');
    Logger.info(`Command: ${cmd} ${execArgs.join(' ')}`);
    const exitCode = await exec(cmd, execArgs, { cwd: root, env });
    Logger.endGroup();

    if (exitCode !== 0) {
      throw new Error(`Tauri build failed with exit code ${exitCode}`);
    }
    Logger.info('Build completed successfully');

    const bundleDir = join(root, 'src-tauri', 'target', target, 'release', 'bundle');
    if (!existsSync(bundleDir)) {
      throw new Error(`Bundle directory not found: ${bundleDir}`);
    }
    Logger.info(`Bundle directory: ${bundleDir}`);

    const tauriConfPath = join(root, 'src-tauri', 'tauri.conf.json');
    const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf-8'));
    const appVersion = tauriConf.version || '';
    Logger.info(`App version: ${appVersion}`);

    const artifacts: BundleArtifact[] = [];

    Logger.step('Collecting artifacts');

    const dmgDir = join(bundleDir, 'dmg');
    if (existsSync(dmgDir)) {
      const files = readdirSync(dmgDir).filter((f) => f.endsWith(EXT.DMG));
      Logger.info(`Found ${files.length} DMG file(s) in ${dmgDir}`);
      for (const f of files) {
        artifacts.push({ path: join(dmgDir, f), name: f, type: 'dmg' });
        Logger.info(`  → ${f}`);
      }
    }

    const msiDir = join(bundleDir, 'msi');
    if (existsSync(msiDir)) {
      const files = readdirSync(msiDir).filter((f) => f.endsWith(EXT.MSI));
      Logger.info(`Found ${files.length} MSI file(s)`);
      for (const f of files) {
        artifacts.push({ path: join(msiDir, f), name: f, type: 'installer' });
        Logger.info(`  → ${f}`);
      }
    }

    const nsisDir = join(bundleDir, 'nsis');
    if (existsSync(nsisDir)) {
      const files = readdirSync(nsisDir).filter((f) => f.endsWith(EXT.EXE));
      Logger.info(`Found ${files.length} NSIS file(s)`);
      for (const f of files) {
        artifacts.push({ path: join(nsisDir, f), name: f, type: 'installer' });
        Logger.info(`  → ${f}`);
      }
    }

    const appImageDir = join(bundleDir, 'appimage');
    if (existsSync(appImageDir)) {
      const files = readdirSync(appImageDir).filter((f) => f.endsWith(EXT.APP_IMAGE));
      Logger.info(`Found ${files.length} AppImage file(s)`);
      for (const f of files) {
        artifacts.push({ path: join(appImageDir, f), name: f, type: 'installer' });
        Logger.info(`  → ${f}`);
      }
    }
    const debDir = join(bundleDir, 'deb');
    if (existsSync(debDir)) {
      const files = readdirSync(debDir).filter((f) => f.endsWith(EXT.DEB));
      Logger.info(`Found ${files.length} deb file(s)`);
      for (const f of files) {
        artifacts.push({ path: join(debDir, f), name: f, type: 'installer' });
        Logger.info(`  → ${f}`);
      }
    }

    const macosDir = join(bundleDir, 'macos');
    await Builder.collectMacosArtifacts(macosDir, target, privateKey, runner, root, env, artifacts);

    Logger.endGroup();

    Logger.success(`Collected ${artifacts.length} artifact(s) total`);
    return { artifacts, appVersion };
  }

  private static async collectMacosArtifacts(
    macosDir: string,
    target: string,
    privateKey: string,
    runner: string,
    root: string,
    env: Record<string, string>,
    artifacts: BundleArtifact[],
  ): Promise<void> {
    if (!existsSync(macosDir)) {
      Logger.info('macOS bundle directory not found — skipping');
      return;
    }

    Logger.info('Processing macOS artifacts...');
    let hasTarGz = readdirSync(macosDir).some((f) => f.endsWith(EXT.TAR_GZ));
    if (!hasTarGz) {
      const appDir = readdirSync(macosDir).find((f) => f.endsWith(EXT.APP));
      if (appDir) {
        Logger.info(`Creating ${appDir}${EXT.TAR_GZ}...`);
        const tarPath = join(macosDir, `${appDir}${EXT.TAR_GZ}`);
        await exec('tar', ['czf', tarPath, '-C', macosDir, appDir], { cwd: macosDir });
        Logger.info('Archive created');
        hasTarGz = true;
        if (privateKey) {
          Logger.step('Signing archive');
          await Builder.signArchive(tarPath, runner, root, env);
          Logger.endGroup();
        }
      }
    }

    if (!hasTarGz) {
      Logger.info(`No ${EXT.APP} or ${EXT.TAR_GZ} found in macOS bundle — skip`);
      return;
    }

    for (const f of readdirSync(macosDir)) {
      if (f.endsWith(EXT.TAR_GZ)) {
        let name = f;
        if (!name.includes(ARCH.AARCH64) && !name.includes(ARCH.X86_64)) {
          const suffix = Target.archSuffix(target);
          if (suffix) {
            name = name.replace(`${EXT.APP}${EXT.TAR_GZ}`, `_${suffix}${EXT.APP}${EXT.TAR_GZ}`);
            renameSync(join(macosDir, f), join(macosDir, name));
            Logger.info(`Renamed archive: ${f} → ${name}`);
          }
        }
        artifacts.push({ path: join(macosDir, name), name, type: 'archive' });
        Logger.info(`  → archive: ${name}`);
      }
      if (f.endsWith(EXT.SIG)) {
        let name = f;
        if (!name.includes(ARCH.AARCH64) && !name.includes(ARCH.X86_64)) {
          const suffix = Target.archSuffix(target);
          if (suffix) {
            name = name.replace(
              `${EXT.APP}${EXT.TAR_GZ}${EXT.SIG}`,
              `_${suffix}${EXT.APP}${EXT.TAR_GZ}${EXT.SIG}`,
            );
            renameSync(join(macosDir, f), join(macosDir, name));
            Logger.info(`Renamed sig: ${f} → ${name}`);
          }
        }
        artifacts.push({ path: join(macosDir, name), name, type: 'signature' });
        Logger.info(`  → signature: ${name}`);
      }
    }

    if (privateKey) {
      for (const a of artifacts) {
        if (a.type === 'archive') {
          const sigName = `${a.name}${EXT.SIG}`;
          if (!existsSync(join(macosDir, sigName))) {
            Logger.info(`Missing .sig for ${a.name}, generating...`);
            Logger.step('Signing archive');
            const ok = await Builder.signArchive(a.path, runner, root, env);
            Logger.endGroup();
            if (ok) {
              artifacts.push({ path: join(macosDir, sigName), name: sigName, type: 'signature' });
              Logger.info(`  → signature: ${sigName}`);
            }
          }
        }
      }
    }
  }

  private static async signArchive(
    filePath: string,
    runner: string,
    root: string,
    env: Record<string, string>,
  ): Promise<boolean> {
    try {
      const cmd = runner === 'npm' ? 'npx' : runner;
      Logger.info(`Signing: ${filePath}`);
      const exitCode = await exec(cmd, ['tauri', 'signer', 'sign', filePath], { env, cwd: root });
      if (exitCode !== 0) {
        throw new Error(`tauri signer sign exited with code ${exitCode}`);
      }
      Logger.info(`Generated signature: ${filePath}${EXT.SIG}`);
      return true;
    } catch (err) {
      Logger.warning(`Failed to generate .sig: ${(err as Error).message}`);
      return false;
    }
  }

  private static findRunner(root: string): string {
    if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(root, 'bun.lockb'))) return 'bun';
    return 'npm';
  }
}
