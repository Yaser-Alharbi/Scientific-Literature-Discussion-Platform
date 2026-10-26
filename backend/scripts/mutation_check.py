# backend/scripts/mutation_check.py
"""Apply each mutation patch to production code and require the test suite to fail.

Usage (from backend/): python scripts/mutation_check.py

Runs every patch under mutations/, from all phases: a change in one phase can stop an
earlier phase's tests from catching their bugs.

A mutant is killed only when the suite fails and still runs the same number of tests as the
unmutated run. A patch that does not apply is stale and one that breaks compilation or
`manage.py check` is invalid. Neither counts as a kill, and either fails the run.
"""

import re
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
FORBIDDEN_DIRS = ('backend/testsupport/', 'backend/scripts/', 'backend/mutations/')


def run(cmd, cwd):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def repo_root():
    return Path(run(['git', 'rev-parse', '--show-toplevel'], BACKEND).stdout.strip())


def tracked_changes(root):
    return run(['git', 'status', '--porcelain', '--untracked-files=no'], root).stdout.strip()


def patched_files(patch_path):
    text = patch_path.read_text()
    return re.findall(r'^diff --git a/(\S+) b/\S+$', text, flags=re.M)


def is_forbidden(path):
    name = path.rsplit('/', 1)[-1]
    parts = path.split('/')
    return (
        name.startswith('test')
        or 'tests' in parts[:-1]
        or path.startswith(FORBIDDEN_DIRS)
    )


def run_suite():
    result = run([sys.executable, 'manage.py', 'test'], BACKEND)
    output = result.stdout + result.stderr
    ran = re.search(r'^Ran (\d+) tests?', output, flags=re.M)
    first_failure = re.search(r'^(?:FAIL|ERROR): (.+)$', output, flags=re.M)
    return result.returncode, int(ran.group(1)) if ran else None, first_failure.group(1) if first_failure else '-'


def check_one(root, patch):
    """Returns (status, detail)."""
    files = patched_files(patch)
    bad = [f for f in files if is_forbidden(f)]
    if not files or bad:
        return 'rejected', f'touches {bad or "no files"}'
    if run(['git', 'apply', '--check', str(patch)], root).returncode != 0:
        return 'stale', 'does not apply'
    run(['git', 'apply', str(patch)], root)
    try:
        for f in files:
            if run([sys.executable, '-m', 'py_compile', str(root / f)], root).returncode != 0:
                return 'invalid', f'{f} does not compile'
        if run([sys.executable, 'manage.py', 'check'], BACKEND).returncode != 0:
            return 'invalid', 'manage.py check fails'
        code, ran, failure = run_suite()
        if code == 0:
            return 'SURVIVED', '-'
        return ('killed', failure) if ran == EXPECTED_RAN else ('invalid', f'ran {ran} tests, expected {EXPECTED_RAN}')
    finally:
        run(['git', 'apply', '-R', str(patch)], root)


def main():
    global EXPECTED_RAN
    root = repo_root()
    if tracked_changes(root):
        sys.exit('refusing to run: tracked files are modified')
    patches = sorted((BACKEND / 'mutations').glob('*/*.patch'))
    if not patches:
        sys.exit('no patches under mutations/')

    code, EXPECTED_RAN, failure = run_suite()
    if code != 0:
        sys.exit(f'unmutated suite fails ({failure}); fix it before mutating')
    print(f'unmutated suite passes: Ran {EXPECTED_RAN} tests')

    rows = []
    for patch in patches:
        status, detail = check_one(root, patch)
        name = f'{patch.parent.name}/{patch.name}'
        rows.append((name, status, detail))
        print(f'{name:62} {status:9} {detail}', flush=True)

    counts = {s: sum(1 for r in rows if r[1] == s) for s in ('killed', 'SURVIVED', 'stale', 'invalid', 'rejected')}
    print(f'\n{counts["killed"]}/{len(rows)} killed, {counts["SURVIVED"]} survived, '
          f'{counts["stale"]} stale, {counts["invalid"]} invalid, {counts["rejected"]} rejected')
    dirty = tracked_changes(root)
    if dirty:
        print(f'WARNING: tracked files are not clean after the run:\n{dirty}')
    sys.exit(0 if counts['killed'] == len(rows) and not dirty else 1)


if __name__ == '__main__':
    main()
