#!/usr/bin/env python3
"""Deploy Levorato Prospect worker to Hostinger VPS via SSH."""
from __future__ import annotations

import os
import sys
import time

import paramiko

HOST = os.environ.get("VPS_HOST", "31.97.175.147")
USER = os.environ.get("VPS_USER", "root")
PASSWORD = os.environ.get("VPS_PASSWORD", "")
KEY_PATH = os.environ.get(
    "VPS_KEY",
    os.path.expanduser("~/.ssh/levorato-prospect-vps"),
)
DATABASE_URL = os.environ["DATABASE_URL"]
GH_TOKEN = os.environ.get("GH_TOKEN", "")
REPO = "Levoratoo/levorato-prospect"


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs = {
        "hostname": HOST,
        "username": USER,
        "timeout": 30,
        "allow_agent": False,
        "look_for_keys": False,
    }
    if os.path.exists(KEY_PATH):
        try:
            print(f"Trying key auth: {KEY_PATH}")
            client.connect(pkey=paramiko.Ed25519Key.from_private_key_file(KEY_PATH), **kwargs)
            print("Connected with SSH key")
            return client
        except Exception as e:
            print(f"Key auth failed: {e}")
            client.close()
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    if not PASSWORD:
        raise SystemExit("No password and key auth failed")
    print("Trying password auth")
    client.connect(password=PASSWORD, **kwargs)
    print("Connected with password")
    return client


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> str:
    print(f"$ {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if out.strip():
        print(out)
    if err.strip():
        print(err, file=sys.stderr)
    if code != 0:
        raise RuntimeError(f"Command failed ({code}): {cmd}")
    return out


def main() -> None:
    client = connect()
    try:
        run(client, "uname -a && whoami")

        # Docker install if needed
        _, stdout, _ = client.exec_command("command -v docker || true")
        has_docker = bool(stdout.read().strip())
        if not has_docker:
            print("Installing Docker...")
            run(
                client,
                "curl -fsSL https://get.docker.com | sh",
                timeout=900,
            )
            run(client, "systemctl enable --now docker || service docker start || true")
        else:
            run(client, "docker --version && docker compose version || docker-compose --version || true")

        run(client, "mkdir -p /opt/levorato-prospect")

        # Clone or pull private repo
        if GH_TOKEN:
            clone_url = f"https://x-access-token:{GH_TOKEN}@github.com/{REPO}.git"
        else:
            clone_url = f"https://github.com/{REPO}.git"

        run(
            client,
            f"""
set -e
cd /opt
if [ -d levorato-prospect/.git ]; then
  cd levorato-prospect
  git remote set-url origin '{clone_url}'
  git fetch origin master
  git reset --hard origin/master
else
  rm -rf levorato-prospect
  git clone --depth 1 -b master '{clone_url}' levorato-prospect
fi
""",
            timeout=300,
        )

        # Write env (escape carefully)
        env_content = (
            f"DATABASE_URL={DATABASE_URL}\n"
            "HEADLESS=true\n"
            "POLL_MS=15000\n"
        )
        sftp = client.open_sftp()
        with sftp.file("/opt/levorato-prospect/.env", "w") as f:
            f.write(env_content)
        sftp.close()
        print("Wrote /opt/levorato-prospect/.env")

        # Ensure docker compose plugin
        run(
            client,
            """
set -e
cd /opt/levorato-prospect
docker compose down || true
docker compose up -d --build
docker compose ps
sleep 5
docker compose logs --tail=80
""",
            timeout=1200,
        )
        print("DEPLOY OK")
    finally:
        client.close()


if __name__ == "__main__":
    main()
