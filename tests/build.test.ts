import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
});

describe('Builder', () => {
  describe('findRunner', () => {
    it('detects pnpm', async () => {
      vi.doMock('fs', () => ({
        existsSync: (path: string) => path.endsWith('pnpm-lock.yaml'),
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        renameSync: vi.fn(),
      }));
      const { Builder } = await import('../src/build');
      const root = '/some/project';
      expect(Builder.findRunner(root)).toBe('pnpm');
    });

    it('detects yarn', async () => {
      vi.doMock('fs', () => ({
        existsSync: (path: string) => path.endsWith('yarn.lock'),
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        renameSync: vi.fn(),
      }));
      const { Builder } = await import('../src/build');
      expect(Builder.findRunner('/some/project')).toBe('yarn');
    });

    it('detects bun', async () => {
      vi.doMock('fs', () => ({
        existsSync: (path: string) => path.endsWith('bun.lockb'),
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        renameSync: vi.fn(),
      }));
      const { Builder } = await import('../src/build');
      expect(Builder.findRunner('/some/project')).toBe('bun');
    });

    it('defaults to npm when no lockfile found', async () => {
      vi.doMock('fs', () => ({
        existsSync: () => false,
        readFileSync: vi.fn(),
        readdirSync: vi.fn(),
        renameSync: vi.fn(),
      }));
      const { Builder } = await import('../src/build');
      expect(Builder.findRunner('/some/project')).toBe('npm');
    });
  });

  describe('readSignature', () => {
    it('reads and trims file content', async () => {
      const fakeSig = '  base64sig123\n  ';
      vi.doMock('fs', () => ({
        existsSync: vi.fn(),
        readFileSync: vi.fn().mockReturnValue(fakeSig),
        readdirSync: vi.fn(),
        renameSync: vi.fn(),
      }));
      const { Builder } = await import('../src/build');
      expect(Builder.readSignature('/path/to/sig.sig')).toBe('base64sig123');
    });
  });
});
