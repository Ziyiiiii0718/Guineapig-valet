"""Disposable PostgreSQL 17 only: no endpoints, credentials, mounts or published ports.

Requires the pinned image to be installed. Never pulls an image automatically.
"""

import json
import os
from pathlib import Path
import subprocess
import time
import uuid

IMAGE = "pgvector/pgvector@sha256:7d0a41464797aeb9862dfdc0bbf1526b82cfd324cdd8036df19e3545f4a9ccb8"
ROOT = Path(__file__).resolve().parents[2]


class LocalPostgres:
    def __init__(self, admin="fixture_admin"):
        self.admin = admin
        self.name = "piggievault-regression-" + uuid.uuid4().hex[:12]
        self.started = False
        self.command = [
            "docker",
            "exec",
            "-i",
            self.name,
            "psql",
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            admin,
            "-d",
            "postgres",
        ]

    def __enter__(self):
        # Refuse a remotely configured Docker daemon as well as database URLs.
        if os.environ.get("DOCKER_HOST"):
            raise RuntimeError(
                "Unset DOCKER_HOST; tests require a local Docker context"
            )
        context = json.loads(
            subprocess.check_output(["docker", "context", "inspect"], text=True)
        )
        if not context[0]["Endpoints"]["docker"]["Host"].startswith("unix://"):
            raise RuntimeError("Tests require a local Unix-socket Docker daemon")
        subprocess.run(
            [
                "docker",
                "run",
                "--pull=never",
                "--rm",
                "-d",
                "--name",
                self.name,
                "--network",
                "none",
                "--tmpfs",
                "/var/lib/postgresql/data",
                "-e",
                "POSTGRES_HOST_AUTH_METHOD=trust",
                "-e",
                "POSTGRES_USER=" + self.admin,
                IMAGE,
            ],
            check=True,
            capture_output=True,
        )
        self.started = True
        try:
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                if (
                    subprocess.run(
                        [
                            "docker",
                            "exec",
                            self.name,
                            "pg_isready",
                            "-h",
                            "127.0.0.1",
                            "-U",
                            self.admin,
                        ],
                        capture_output=True,
                    ).returncode
                    == 0
                ):
                    break
                time.sleep(0.2)
            else:
                raise RuntimeError("Disposable PostgreSQL did not start")
            assert self.sql("show server_version_num;").startswith("17")
            print("Local PostgreSQL:", self.sql("show server_version;"), flush=True)
            return self
        except BaseException:
            self.close()
            raise

    def sql(self, statement):
        result = subprocess.run(
            self.command, input=statement, text=True, capture_output=True, timeout=40
        )
        if result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip()

    def close(self):
        if self.started:
            subprocess.run(
                ["docker", "stop", self.name], check=True, capture_output=True
            )
            self.started = False
            print("Disposable network-disabled container removed.", flush=True)

    def __exit__(self, *args):
        self.close()
