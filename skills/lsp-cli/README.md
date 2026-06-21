# lsp-cli skill

Semantic code navigation via LSP from the command line. This skill teaches
pi agents to use `lsp-cli` instead of `grep`/`rg` for code structure queries.

## Prerequisites

```bash
cargo install --git https://github.com/e4779/lsp-cli.git
npm install -g typescript-language-server typescript  # for TS/JS
pip install pyright                                    # for Python
```

## What it replaces

| Instead of | Use |
|---|---|
| `rg 'class\|interface\|function' *.ts` | `lsp-cli list-symbols --detach file.ts` |
| `rg 'MyComponent' src/` | `lsp-cli grep MyComponent --detach .` |
| `rg 'import.*from.*foo'` | `lsp-cli references Foo --detach .` |
| `rg 'TODO\|FIXME'` | `lsp-cli diagnostics --detach .` (real errors) |

## Fork

We maintain a fork at https://github.com/e4779/lsp-cli with fixes for
TypeScript/tsserver compatibility (workspace/symbol warmup, diagnostics
collection improvements).
