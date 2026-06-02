import { Logger } from './log';

export const ARCH = {
  AARCH64: 'aarch64',
  X86_64: 'x86_64',
} as const;

export const RUST_TARGETS = {
  AARCH64_MAC: 'aarch64-apple-darwin',
  X86_64_MAC: 'x86_64-apple-darwin',
  X86_64_WINDOWS: 'x86_64-pc-windows-msvc',
  X86_64_LINUX: 'x86_64-unknown-linux-gnu',
  AARCH64_LINUX: 'aarch64-unknown-linux-gnu',
} as const;

export const PLATFORMS = {
  DARWIN_AARCH64: 'darwin-aarch64',
  DARWIN_X86_64: 'darwin-x86_64',
  WINDOWS_X86_64: 'windows-x86_64',
  LINUX_X86_64: 'linux-x86_64',
  LINUX_AARCH64: 'linux-aarch64',
} as const;

const TARGET_PLATFORM: Record<string, string> = {
  [RUST_TARGETS.AARCH64_MAC]: PLATFORMS.DARWIN_AARCH64,
  [RUST_TARGETS.X86_64_MAC]: PLATFORMS.DARWIN_X86_64,
  [RUST_TARGETS.X86_64_WINDOWS]: PLATFORMS.WINDOWS_X86_64,
  [RUST_TARGETS.X86_64_LINUX]: PLATFORMS.LINUX_X86_64,
  [RUST_TARGETS.AARCH64_LINUX]: PLATFORMS.LINUX_AARCH64,
};

export const EXT = {
  DMG: '.dmg',
  TAR_GZ: '.tar.gz',
  APP: '.app',
  APPIMAGE: '.appimage',
  APP_IMAGE: '.AppImage',
  DEB: '.deb',
  MSI: '.msi',
  EXE: '.exe',
  SIG: '.sig',
} as const;

export const ARCH_ALIASES = {
  ARM64: 'arm64',
  X64: 'x64',
  AMD64: 'amd64',
  INTEL: 'intel',
} as const;

export class Target {
  static toPlatform(target: string): string {
    const platform = TARGET_PLATFORM[target];
    if (!platform) {
      throw new Error(`Unknown target: ${target}`);
    }
    return platform;
  }

  static archSuffix(target: string): string {
    if (target.includes(ARCH.AARCH64)) return ARCH.AARCH64;
    if (target.includes(ARCH.X86_64)) return ARCH.X86_64;
    return '';
  }

  static logSupported(): void {
    Logger.info('Supported targets:');
    for (const [key, value] of Object.entries(TARGET_PLATFORM)) {
      Logger.info(`  ${key} → ${value}`);
    }
  }
}
