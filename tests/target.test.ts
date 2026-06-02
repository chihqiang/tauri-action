import { describe, it, expect } from 'vitest';
import { ARCH, RUST_TARGETS, PLATFORMS, EXT, ARCH_ALIASES, Target } from '../src/target';

describe('ARCH constants', () => {
  it('has correct values', () => {
    expect(ARCH.AARCH64).toBe('aarch64');
    expect(ARCH.X86_64).toBe('x86_64');
  });
});

describe('RUST_TARGETS constants', () => {
  it('has correct values', () => {
    expect(RUST_TARGETS.AARCH64_MAC).toBe('aarch64-apple-darwin');
    expect(RUST_TARGETS.X86_64_MAC).toBe('x86_64-apple-darwin');
    expect(RUST_TARGETS.X86_64_WINDOWS).toBe('x86_64-pc-windows-msvc');
    expect(RUST_TARGETS.X86_64_LINUX).toBe('x86_64-unknown-linux-gnu');
    expect(RUST_TARGETS.AARCH64_LINUX).toBe('aarch64-unknown-linux-gnu');
  });
});

describe('PLATFORMS constants', () => {
  it('has correct values', () => {
    expect(PLATFORMS.DARWIN_AARCH64).toBe('darwin-aarch64');
    expect(PLATFORMS.DARWIN_X86_64).toBe('darwin-x86_64');
    expect(PLATFORMS.WINDOWS_X86_64).toBe('windows-x86_64');
    expect(PLATFORMS.LINUX_X86_64).toBe('linux-x86_64');
    expect(PLATFORMS.LINUX_AARCH64).toBe('linux-aarch64');
  });
});

describe('EXT constants', () => {
  it('has correct values', () => {
    expect(EXT.DMG).toBe('.dmg');
    expect(EXT.TAR_GZ).toBe('.tar.gz');
    expect(EXT.APP).toBe('.app');
    expect(EXT.APPIMAGE).toBe('.appimage');
    expect(EXT.APP_IMAGE).toBe('.AppImage');
    expect(EXT.DEB).toBe('.deb');
    expect(EXT.MSI).toBe('.msi');
    expect(EXT.EXE).toBe('.exe');
    expect(EXT.SIG).toBe('.sig');
  });
});

describe('ARCH_ALIASES constants', () => {
  it('has correct values', () => {
    expect(ARCH_ALIASES.ARM64).toBe('arm64');
    expect(ARCH_ALIASES.X64).toBe('x64');
    expect(ARCH_ALIASES.AMD64).toBe('amd64');
    expect(ARCH_ALIASES.INTEL).toBe('intel');
  });
});

describe('Target', () => {
  describe('toPlatform', () => {
    it('maps aarch64-apple-darwin to darwin-aarch64', () => {
      expect(Target.toPlatform('aarch64-apple-darwin')).toBe('darwin-aarch64');
    });

    it('maps x86_64-apple-darwin to darwin-x86_64', () => {
      expect(Target.toPlatform('x86_64-apple-darwin')).toBe('darwin-x86_64');
    });

    it('maps x86_64-pc-windows-msvc to windows-x86_64', () => {
      expect(Target.toPlatform('x86_64-pc-windows-msvc')).toBe('windows-x86_64');
    });

    it('maps x86_64-unknown-linux-gnu to linux-x86_64', () => {
      expect(Target.toPlatform('x86_64-unknown-linux-gnu')).toBe('linux-x86_64');
    });

    it('maps aarch64-unknown-linux-gnu to linux-aarch64', () => {
      expect(Target.toPlatform('aarch64-unknown-linux-gnu')).toBe('linux-aarch64');
    });

    it('throws for unknown target', () => {
      expect(() => Target.toPlatform('unknown-target')).toThrow('Unknown target');
    });
  });

  describe('archSuffix', () => {
    it('returns aarch64 for aarch64- targets', () => {
      expect(Target.archSuffix('aarch64-apple-darwin')).toBe('aarch64');
    });

    it('returns x86_64 for x86_64- targets', () => {
      expect(Target.archSuffix('x86_64-pc-windows-msvc')).toBe('x86_64');
    });

    it('returns empty string for unrecognized targets', () => {
      expect(Target.archSuffix('arm-unknown-linux-gnueabihf')).toBe('');
    });
  });
});
