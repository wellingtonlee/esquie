# Changelog

## 0.4.0 — 2026-04-29

- Optional read-only host directory mount via `ESQUIE_SANDBOX_MOUNT` env var. When set to an absolute directory path, that directory is bind-mounted at `/mnt/host` inside the sandbox container as read-only. Lets `python_eval` analyze a corpus of files without uploading each one. Path is locked at server start (not LLM-controlled). Invalid paths are logged and skipped — server still starts.

## 0.3.0 — 2026-04-29

- **Rename:** project renamed from `re-helper-tools` to **Esquie**
  - npm package name → `esquie`
  - MCP server name → `esquie`
  - Docker image tag → `esquie-sandbox:latest`
  - Container name → `esquie-sandbox`
  - Env vars → `ESQUIE_SANDBOX_*` (was `RE_SANDBOX_*`) — **breaking**
  - Cleanup of prior install: `docker rmi re-helper-sandbox:latest` and `docker rm -f re-helper-sandbox`
- New tool: `list_sandbox_files` — `ls -la /tmp` inside the container
- New tool: `download_from_sandbox` — read a file from `/tmp` and return base64 (10MB limit)
- Scratchpad disk persistence — opt-in via `ESQUIE_NOTES_FILE` env var; atomic write on every set/delete
- Scratchpad notes exposed as MCP resources under `note://{key}` URIs
- CI: GitHub Actions build-check workflow on push/PR to `main`

## 0.2.1 — 2026-04-09

- Input validation on all hex/binary tools — returns clean errors instead of crashing
- Config bounds checking — clamps RE_SANDBOX_* env vars to valid ranges with warnings
- Upload size limit (10MB) on `upload_to_sandbox`
- Improved error diagnostics in sandbox catch blocks and runner.py session save/load

## 0.2.0 — 2026-04-08

- Security hardening: PidsLimit (64), CapDrop ALL, ShmSize 1MB
- Configurable resource limits via environment variables (RE_SANDBOX_*)
- Container auto-expiry after idle timeout (default 30min)
- New tool: `reset_sandbox` — destroy container and clear session state
- New tool: `upload_to_sandbox` — upload files into /tmp for Python analysis

## 0.1.0 — 2026-04-08

- Initial release
- Sandboxed Python eval via Docker with session persistence
- Pre-installed RE packages: pwntools, capstone, keystone, unicorn, lief, yara, pycryptodome
- Native hex/binary utilities (conversion, XOR, hashing, pattern search, base64)
- In-memory scratchpad for analysis notes
