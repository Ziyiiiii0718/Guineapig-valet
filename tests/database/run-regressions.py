"""Run the retained pre-v4 upgrade chain and final v4 suite, each in isolation."""

from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
for suite in ("run-photo-classification.py", "run-authorization.py"):
    subprocess.run([sys.executable, str(HERE / suite)], check=True)
print("PASS: PostgreSQL 17 upgrade and final-schema regression suites", flush=True)
