"""CI boundaries and bounded diagnostics. Never reads hosted credentials or logs."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
CHECKS = (
    'preflight', 'install', 'safety', 'unit', 'lint', 'types',
    'database', 'browser', 'cleanup',
)
OUTCOMES = {'success', 'failure', 'cancelled', 'skipped'}
PATTERNS = {
    'container': r'(?:supabase_[a-z0-9_]+_pv-e2e-[a-f0-9]{24}|piggievault-regression-[a-f0-9]{12})',
    'volume': r'supabase_[a-z0-9_]+_pv-e2e-[a-f0-9]{24}',
    'network': r'supabase_network_pv-e2e-[a-f0-9]{24}',
}


def check_environment(env):
    # Fail rather than silently ignoring accidental hosted configuration in CI.
    # Only the launcher may generate local Supabase keys after this check.
    for key, value in env.items():
        name = key.upper()
        if value and (
            'SUPABASE' in name or name.startswith(('VERCEL', 'AI_SERVICE_', 'PG', 'POSTGRES'))
            or name in {'DATABASE_URL', 'DIRECT_URL', 'DB_URL', 'DOCKER_HOST', 'NODE_OPTIONS', 'PIGGIE_E2E_SESSION'}
        ):
            raise RuntimeError('CI refuses inherited service configuration; values are never printed')


def preflight():
    check_environment(os.environ)
    files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    for filename in files:
        path = Path(filename)
        if path.name.startswith('.env') and path.name != '.env.example':
            raise RuntimeError('CI refuses tracked environment files')
        if any(part in {'.vercel', '.local'} for part in path.parts):
            raise RuntimeError('CI refuses tracked private workspaces or deployment links')
    print('CI configuration boundary passed; no hosted service configuration accepted.')


def owned(kind, name):
    return re.fullmatch(PATTERNS[kind], name) is not None


def cleanup():
    # Never apply CI-wide name discovery to a developer workstation/self-hosted runner.
    if os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted':
        raise RuntimeError('CI cleanup requires an ephemeral GitHub-hosted runner')
    failures = 0
    try:
        if os.environ.get('DOCKER_HOST'):
            raise RuntimeError('Remote Docker refused')
        context = json.loads(subprocess.check_output(['docker', 'context', 'inspect']))
        if not context[0]['Endpoints']['docker']['Host'].startswith('unix://'):
            raise RuntimeError('Remote Docker refused')
        for kind in PATTERNS:
            command = (
                ['docker', 'ps', '-a', '--format', '{{.Names}}']
                if kind == 'container'
                else ['docker', kind, 'ls', '--format', '{{.Name}}']
            )
            try:
                names = subprocess.check_output(command, stderr=subprocess.DEVNULL, text=True).splitlines()
                for name in names:
                    if not owned(kind, name):
                        continue
                    remove = (
                        ['docker', 'rm', '-fv', name] if kind == 'container'
                        else ['docker', kind, 'rm', name]
                    )
                    try:
                        result = subprocess.run(
                            remove, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, timeout=30,
                        )
                        failures += int(result.returncode != 0)
                    except (subprocess.SubprocessError, OSError):
                        failures += 1
            except (subprocess.SubprocessError, OSError):
                failures += 1
    finally:
        # No raw logs, snapshots or runtime credentials survive this job step.
        private = ROOT / '.local/piggievault-e2e'
        if private.exists():
            shutil.rmtree(private)
    if failures:
        raise RuntimeError('Disposable resource cleanup incomplete; runner disposal is the final boundary')
    print('Disposable CI resource cleanup passed.')


def summary(env):
    # Do not parse raw logs or interpolate free-form error messages/test titles.
    result = {}
    for name in CHECKS:
        value = env.get('CHECK_' + name.upper())
        result[name] = value if value in OUTCOMES else 'unavailable'
    return result


if __name__ == '__main__':
    try:
        if sys.argv[1:] == ['preflight']:
            preflight()
        elif sys.argv[1:] == ['cleanup']:
            cleanup()
        elif sys.argv[1:] == ['summary']:
            content = json.dumps(summary(os.environ), indent=2) + '\n'
            assert len(content.encode()) < 2048
            (ROOT / 'ci-safe-summary.json').write_text(content)
        else:
            raise RuntimeError('Choose preflight, cleanup or summary')
    except Exception:
        # Exception payloads from external commands may contain environment material.
        print('CI support step failed; inspect its configuration and sanitized check outcomes.', file=sys.stderr)
        sys.exit(1)
