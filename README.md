# tauri-action

A GitHub Action that builds, signs, and publishes Tauri v2 apps with built-in updater support.

## Features

- Build Tauri v2 apps for any target platform
- Sign bundles and upload all artifacts (DMG, tar.gz, MSI, .sig)
- Generate `updater.json` from all platforms' signatures after builds complete
- Auto-create release and overwrite existing assets
- Retry failed uploads with exponential backoff

## Inputs

| Name | Description | Required |
|------|-------------|----------|
| `command` | Command: `build` (default) or `generate-updater` | No |
| `token` | GitHub token with `contents:write` permission (default: `${{ github.token }}`) | No |
| `tag` | Release tag name (default: `github.ref_name`) | No |
| `repo` | Target repository in `owner/repo` format (default: current repo) | No |
| `target` | Rust target triple, e.g. `aarch64-apple-darwin`, `x86_64-pc-windows-msvc` | build 模式下必填 |
| `privateKey` | Tauri signing private key (set via `secrets.TAURI_PRIVATE_KEY`) | No |
| `releaseBody` | Release description body (leave empty to auto-generate) | No |
| `projectPath` | Path to the Tauri project root (default: `.`) | No |
| `args` | Additional arguments for `tauri build` | No |

## Outputs

| Name | Description |
|------|-------------|
| `releaseId` | Release ID |
| `version` | App version from the built artifact |
| `platform` | Updater platform key, e.g. `darwin-aarch64` |
| `signature` | Base64 signature from .sig file |
| `downloadUrl` | Download URL of the archive/installer |
| `archiveName` | Filename of the archive/installer |

## Required Permissions

```yaml
permissions:
  contents: write
```

## Complete Workflow Example

Build for macOS ARM + Intel, then generate `updater.json` with both platforms:

```yaml
name: publish
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        target:
          - aarch64-apple-darwin
          - x86_64-apple-darwin
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.ref_name }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: lts/*

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Build & upload
        uses: chihqiang/tauri-action@main
        with:
          command: build
          target: ${{ matrix.target }}
          privateKey: ${{ secrets.TAURI_PRIVATE_KEY }}
          tag: ${{ github.ref_name }}

  finalize:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Generate updater.json
        uses: chihqiang/tauri-action@main
        with:
          command: generate-updater
          tag: ${{ github.ref_name }}
```

## Usage

### Single platform

```yaml
- uses: chihqiang/tauri-action@main
  with:
    target: aarch64-apple-darwin
    privateKey: ${{ secrets.TAURI_PRIVATE_KEY }}
    tag: v0.2.0
```

### Cross-repo upload

```yaml
- uses: chihqiang/tauri-action@main
  with:
    target: aarch64-apple-darwin
    token: ${{ secrets.GH_TOKEN }}
    repo: other-org/other-repo
    tag: v0.2.0
    privateKey: ${{ secrets.TAURI_PRIVATE_KEY }}
```

## Development

```bash
npm install
npm run build
npm test
```

## License

Apache License 2.0
