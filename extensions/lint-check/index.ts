/**
 * pi-lint-check — runs project linters (via nano-staged) on changed files
 * after each agent turn.
 *
 * Merged single-file extension for pi-e4779 monorepo.
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { isEditToolResult, isToolCallEventType, isWriteToolResult } from '@earendil-works/pi-coding-agent';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// nano-staged is an optional runtime dependency. The extension's core purpose
// (strip --no-verify, track modified files) still works without it; only the
// post-turn lint run is skipped. Use a guarded require so a missing package
// never crashes pi at extension load time — a top-level `import` would abort
// the whole agent. Resolved once at module init.
let nanoStaged: ((opts?: unknown) => Promise<unknown>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nanoStaged = require('nano-staged');
} catch {
  nanoStaged = null;
}
let nanoStagedMissingWarned = false;

// ===========================================================================
// Core: Config
// ===========================================================================

export interface LintCheckConfig {
  ignoreErrors?: string[];
  nanoStagedConfig?: string;
  maxConsecutiveFailures?: number;
}

function tryReadJson(path: string): LintCheckConfig | null {
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

function loadConfig(cwd: string): LintCheckConfig {
  const config: LintCheckConfig = {};
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (home) {
    const userConfigPath = join(home, '.pi', 'extensions', 'lint-check.json');
    const data = tryReadJson(userConfigPath);
    if (data) Object.assign(config, data);
  }
  const projectConfigPath = join(cwd, '.pi', 'extensions', 'lint-check.json');
  const projectData = tryReadJson(projectConfigPath);
  if (projectData) Object.assign(config, projectData);
  return config;
}

// ===========================================================================
// Core: nano-staged runner
// ===========================================================================

function isBenignNanoStagedMessage(msg: string): boolean {
  return (
    msg.includes('No staged files found') ||
    msg.includes('No unstaged files found') ||
    msg.includes('No diff files found') ||
    msg.includes('No files match any configured task') ||
    msg.includes('Create Nano Staged config')
  );
}

function parseNanoStagedErrors(err: unknown): string[] {
  if (Array.isArray(err)) {
    return err.flatMap((e) => parseNanoStagedErrors(e));
  }
  if (err instanceof Error && err.message) {
    if (isBenignNanoStagedMessage(err.message)) return [];
    return err.message
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
  return [];
}

async function runNanoStaged(
  cwd: string,
  config?: { nanoStagedConfig?: string },
): Promise<string[]> {
  if (!nanoStaged) {
    // Warn once per session so the user knows linting is disabled, then stay
    // quiet — silent no-op afterwards. Install hint in the message.
    if (!nanoStagedMissingWarned) {
      nanoStagedMissingWarned = true;
      console.error(
        'lint-check: nano-staged not installed — run `npm install nano-staged` in the pi-etc package to enable lint runs. Extension is otherwise active (--no-verify stripping still works).',
      );
    }
    return [];
  }
  try {
    await nanoStaged({
      cwd,
      unstaged: true,
      quiet: true,
      config: config?.nanoStagedConfig,
      bail: true,
    } as any);
    return [];
  } catch (err: unknown) {
    return parseNanoStagedErrors(err);
  }
}

// ===========================================================================
// Core: Error filtering
// ===========================================================================

function filterErrors(
  errors: string[],
  ignoredErrors: string[],
): string[] {
  if (ignoredErrors.length === 0) return errors;
  return errors.filter(
    (line) => !ignoredErrors.some((code) => line.includes(code)),
  );
}

// ===========================================================================
// Core: Command helpers
// ===========================================================================

const GIT_COMMIT_NO_VERIFY_RE = /\bgit\s+commit\b.*--no-verify(?:\s|$)/;

function shouldStripNoVerify(command: string): boolean {
  return GIT_COMMIT_NO_VERIFY_RE.test(command);
}

function stripNoVerify(command: string): string {
  return command
    .replace(/\s*--no-verify\b\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ===========================================================================
// Status / Config helpers
// ===========================================================================

const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

function getStatusText(enabled: boolean): string {
  if (enabled) return `${GREEN}lint-check${RESET}`;
  return `${YELLOW}lint-check${RESET} ${DIM}(off)${RESET}`;
}

function getConfigPaths(cwd: string): { userPath: string | null; projectPath: string } {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const userPath = home ? join(home, '.pi', 'extensions', 'lint-check.json') : null;
  const projectPath = join(cwd, '.pi', 'extensions', 'lint-check.json');
  return { userPath, projectPath };
}

function saveConfig(config: LintCheckConfig, path: string): void {
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
}

function readConfigFile(path: string): LintCheckConfig {
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// ===========================================================================
// Interactive sub-commands
// ===========================================================================

async function manageIgnoredErrors(
  ctx: ExtensionContext,
  config: LintCheckConfig,
): Promise<void> {
  const errors = config.ignoreErrors || [];

  const options: string[] = [];
  if (errors.length > 0) {
    options.push(`View ignored errors (${errors.length})`);
  }
  options.push('Add new ignored error');
  if (errors.length > 0) {
    options.push('Remove all ignored errors');
  }

  const choice = await ctx.ui.select('Manage ignored errors', options);
  if (!choice) return;

  if (choice.includes('View')) {
    ctx.ui.notify(`Ignored errors: [${errors.join(', ')}]`, 'info');
  } else if (choice.includes('Add')) {
    ctx.ui.notify(
      'To add ignored errors, edit your lint-check config:\n' +
        '  ~/.pi/extensions/lint-check.json\n' +
        '  or <project>/.pi/extensions/lint-check.json\n\n' +
        'Example:\n' +
        '  {"ignoreErrors": ["TS6059", "TS5101"]}',
      'info',
    );
  } else if (choice.includes('Remove')) {
    const { userPath, projectPath } = getConfigPaths(ctx.cwd);
    for (const path of [userPath, projectPath]) {
      if (path && existsSync(path)) {
        const data = readConfigFile(path);
        const updated = { ...data, ignoreErrors: [] };
        saveConfig(updated, path);
      }
    }
    ctx.ui.notify('Cleared all ignored errors', 'info');
  }
}

async function resetConfig(ctx: ExtensionContext): Promise<void> {
  const { userPath, projectPath } = getConfigPaths(ctx.cwd);

  const scope = await ctx.ui.select('Reset which config?', [
    'User config',
    'Project config',
    'Both',
  ]);
  if (!scope) return;

  const paths: string[] = [];
  if (userPath) {
    if (scope.includes('User') || scope.includes('Both')) paths.push(userPath);
  }
  if (scope.includes('Project') || scope.includes('Both')) paths.push(projectPath);

  const defaultConfig: LintCheckConfig = { ignoreErrors: [] };
  for (const path of paths) {
    if (existsSync(path)) {
      saveConfig(defaultConfig, path);
    }
  }
  ctx.ui.notify('Config reset to defaults', 'info');
}

// ===========================================================================
// Extension entry point
// ===========================================================================

export default function (pi: ExtensionAPI) {
  let modifiedFiles: Set<string> = new Set();
  let enabled: boolean = true;

  // Anti-loop protection
  let consecutiveFailures = 0;
  let lastErrorFingerprint = '';

  // ── 1. Strip --no-verify from git commit ─────────────────────────────────
  pi.on('tool_call', async (event, _ctx) => {
    if (isToolCallEventType('bash', event)) {
      const command = event.input.command;
      if (shouldStripNoVerify(command)) {
        event.input.command = stripNoVerify(command);
      }
    }
  });

  // ── 2. Track file-modifying tool results ─────────────────────────────────
  pi.on('tool_result', async (event, _ctx) => {
    if (event.isError) return;

    if (isEditToolResult(event)) {
      const p = event.input.path;
      if (typeof p === 'string') modifiedFiles.add(p);
    } else if (isWriteToolResult(event)) {
      const p = event.input.path;
      if (typeof p === 'string') modifiedFiles.add(p);
    }
  });

  // ── 3. Post-agent validation via nano-staged ─────────────────────────────
  pi.on('agent_end', async (_event, ctx) => {
    if (!enabled) return;

    const files = [...modifiedFiles];
    modifiedFiles = new Set();

    if (files.length === 0) return;

    const config = loadConfig(ctx.cwd);
    const maxFailures = config.maxConsecutiveFailures ?? 3;

    ctx.ui.setStatus('lint-check', `${DIM}lint-check running...${RESET}`);

    runNanoStaged(ctx.cwd, config)
      .then((rawErrors) => {
        const ignored = config.ignoreErrors ?? [];
        const errors = filterErrors(rawErrors, ignored);

        if (errors.length > 0) {
          const fingerprint = errors.join('\n');
          if (fingerprint === lastErrorFingerprint) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 1;
            lastErrorFingerprint = fingerprint;
          }

          if (maxFailures > 0 && consecutiveFailures >= maxFailures) {
            ctx.ui.setStatus(
              'lint-check',
              `${YELLOW}lint-check${RESET} ${DIM}(suppressed — same errors ${consecutiveFailures}×)${RESET}`,
            );
            return;
          }

          ctx.ui.notify('Lint/typecheck failed!', 'error');
          ctx.ui.setWidget('lint-check', errors);
          ctx.ui.setStatus('lint-check', `${RED}lint-check ✗${RESET}`);
        } else {
          consecutiveFailures = 0;
          lastErrorFingerprint = '';
          ctx.ui.setWidget('lint-check', undefined);
          ctx.ui.setStatus('lint-check', getStatusText(enabled));
        }
      })
      .catch((e: any) => {
        console.error('lint-check extension error:', e.message);
        ctx.ui.setStatus('lint-check', getStatusText(enabled));
      });
  });

  // ── 4. Interactive /lint-check command ───────────────────────────────────
  pi.registerCommand('lint-check', {
    description: 'Lint-check settings (nano-staged hook)',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify('lint-check settings require UI', 'warning');
        return;
      }

      const setStatus = ctx.ui.setStatus ? ctx.ui.setStatus.bind(ctx.ui) : null;
      setStatus?.('lint-check', getStatusText(enabled));

      const config = loadConfig(ctx.cwd);
      const { userPath, projectPath } = getConfigPaths(ctx.cwd);
      const userExists = userPath ? existsSync(userPath) : false;
      const projectExists = existsSync(projectPath);

      const options: string[] = [];

      if (enabled) {
        options.push('Disable lint-check (this session)');
      } else {
        options.push('Enable lint-check');
      }

      options.push('View current config');
      options.push('Manage ignored errors');

      if (userExists || projectExists) {
        options.push('Reset config to defaults');
      }

      const choice = await ctx.ui.select('lint-check settings', options);
      if (!choice) return;

      if (choice.includes('Disable')) {
        enabled = false;
        setStatus?.('lint-check', getStatusText(enabled));
        ctx.ui.notify('lint-check disabled for this session', 'warning');
      } else if (choice.includes('Enable')) {
        enabled = true;
        setStatus?.('lint-check', getStatusText(enabled));
        ctx.ui.notify('lint-check enabled', 'info');
      } else if (choice.includes('View')) {
        const lines: string[] = [];
        lines.push('lint-check config:');
        lines.push(`  enabled (session): ${enabled}`);
        lines.push(`  ignoreErrors: [${(config.ignoreErrors || []).join(', ')}]`);
        lines.push(`  maxConsecutiveFailures: ${config.maxConsecutiveFailures ?? 3}`);
        if (config.nanoStagedConfig) {
          lines.push(`  nanoStagedConfig: ${config.nanoStagedConfig}`);
        } else {
          lines.push('  nanoStagedConfig: auto (project .nano-staged.json)');
        }
        if (userExists) lines.push(`  user config: ${userPath}`);
        if (projectExists) lines.push(`  project config: ${projectPath}`);
        ctx.ui.notify(lines.join('\n'), 'info');
      } else if (choice.includes('Manage')) {
        await manageIgnoredErrors(ctx, config);
      } else if (choice.includes('Reset')) {
        await resetConfig(ctx);
      }
    },
  });
}
