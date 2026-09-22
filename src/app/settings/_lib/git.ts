/**
 * Git is the real save layer under /settings: every change lands on disk at once, and the
 * dirty strip reads `git status` for the files settings can write. Review shows the diff;
 * Revert is `git checkout -- <file>`. Only the files in WRITABLE_FILES are ever touched.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CONFIG_FILE, ROOT } from '@/lib/site-config-writer'

const execFileAsync = promisify(execFile)

/** Repo-relative paths the settings page may write, and therefore may revert. */
export const WRITABLE_FILES = [CONFIG_FILE] as const

export type DirtyFile = { file: string; status: string }

async function git(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 })
  return stdout
}

/** The writable files that differ from HEAD (staged or not). */
export async function dirtyFiles(): Promise<DirtyFile[]> {
  const out = await git(['status', '--porcelain', '--', ...WRITABLE_FILES])
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => ({ status: line.slice(0, 2).trim() || 'M', file: line.slice(3).trim() }))
}

/** Unified diff of one writable file against HEAD (working tree, staged changes included). */
export async function diffFile(file: string): Promise<string> {
  assertWritable(file)
  return git(['diff', 'HEAD', '--no-color', '--', file])
}

/** Discard the working-tree changes of one writable file. */
export async function revertFile(file: string): Promise<void> {
  assertWritable(file)
  await git(['checkout', 'HEAD', '--', file])
}

export function assertWritable(file: string): asserts file is (typeof WRITABLE_FILES)[number] {
  if (!(WRITABLE_FILES as readonly string[]).includes(file)) {
    throw new Error(`${file} is not a file the settings page writes`)
  }
}
