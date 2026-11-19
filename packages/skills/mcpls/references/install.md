# Install — pre-built binaries

Download from [GitHub Releases](https://github.com/bug-ops/mcpls/releases),
verify the `.sha256` sidecar, extract, and move `mcpls` onto `PATH`:

```bash
curl -LO https://github.com/bug-ops/mcpls/releases/latest/download/mcpls-<target>.tar.gz
curl -LO https://github.com/bug-ops/mcpls/releases/latest/download/mcpls-<target>.tar.gz.sha256
shasum -a 256 -c mcpls-<target>.tar.gz.sha256
```

`<target>` — per-platform archive name; see the releases page. Verify with
`mcpls --version`.
