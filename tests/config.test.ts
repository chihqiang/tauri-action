import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInputs = vi.hoisted(() => ({ current: {} as Record<string, string> }));
const savedEnv = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  mockInputs.current = {};
  process.env.GITHUB_TOKEN = savedEnv.GITHUB_TOKEN;
  process.env.GITHUB_REF_NAME = savedEnv.GITHUB_REF_NAME;
  process.env.GITHUB_REPOSITORY = savedEnv.GITHUB_REPOSITORY;
});

describe('Config', () => {
  describe('constructor', () => {
    it('reads inputs from @actions/core', async () => {
      mockInputs.current = {
        token: 'gh_token_123',
        tag: 'v1.0.0',
        repo: 'owner/repo',
        target: 'x86_64-apple-darwin',
        privateKey: 'key123',
        releaseBody: 'Release notes',
        projectPath: './my-app',
        args: '--verbose',
      };
      const { Config } = await import('../src/config');
      const config = new Config();
      expect(config.token).toBe('gh_token_123');
      expect(config.tag).toBe('v1.0.0');
      expect(config.repo).toBe('owner/repo');
      expect(config.target).toBe('x86_64-apple-darwin');
      expect(config.privateKey).toBe('key123');
      expect(config.releaseBody).toBe('Release notes');
      expect(config.projectPath).toBe('./my-app');
      expect(config.args).toBe('--verbose');
    });

    it('falls back to env vars when inputs are empty', async () => {
      process.env.GITHUB_TOKEN = 'env_token';
      process.env.GITHUB_REF_NAME = 'v2.0.0';
      process.env.GITHUB_REPOSITORY = 'org/project';
      const { Config } = await import('../src/config');
      const config = new Config();
      expect(config.token).toBe('env_token');
      expect(config.tag).toBe('v2.0.0');
      expect(config.repo).toBe('org/project');
    });

    it('defaults to empty strings', async () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REF_NAME;
      delete process.env.GITHUB_REPOSITORY;
      const { Config } = await import('../src/config');
      const config = new Config();
      expect(config.token).toBe('');
      expect(config.tag).toBe('');
      expect(config.repo).toBe('');
      expect(config.target).toBe('');
      expect(config.privateKey).toBe('');
      expect(config.releaseBody).toBe('');
      expect(config.projectPath).toBe('');
      expect(config.args).toBe('');
    });
  });

  describe('parseRepo', () => {
    it('splits owner/repo correctly', async () => {
      mockInputs.current = { repo: 'foo/bar' };
      const { Config } = await import('../src/config');
      const [owner, repo] = new Config().parseRepo();
      expect(owner).toBe('foo');
      expect(repo).toBe('bar');
    });

    it('throws for invalid format', async () => {
      mockInputs.current = { repo: 'invalid' };
      const { Config } = await import('../src/config');
      expect(() => new Config().parseRepo()).toThrow('Invalid repo format');
    });
  });

  describe('validate', () => {
    it('throws when token is empty', async () => {
      mockInputs.current = { target: 'x86_64-apple-darwin', tag: 'v1.0.0' };
      delete process.env.GITHUB_TOKEN;
      const { Config } = await import('../src/config');
      expect(() => new Config().validate()).toThrow('token is required');
    });

    it('throws when target is empty', async () => {
      mockInputs.current = { token: 't', tag: 'v1.0.0' };
      const { Config } = await import('../src/config');
      expect(() => new Config().validate()).toThrow('target is required');
    });

    it('throws when tag is empty', async () => {
      mockInputs.current = { token: 't', target: 'x86_64-apple-darwin' };
      delete process.env.GITHUB_REF_NAME;
      const { Config } = await import('../src/config');
      expect(() => new Config().validate()).toThrow('tag is required');
    });

    it('passes when all required fields are present', async () => {
      mockInputs.current = { token: 't', target: 'x86_64-apple-darwin', tag: 'v1.0.0' };
      const { Config } = await import('../src/config');
      expect(() => new Config().validate()).not.toThrow();
    });
  });
});

vi.mock('@actions/core', () => ({
  getInput: (name: string) => mockInputs.current[name] || '',
}));
