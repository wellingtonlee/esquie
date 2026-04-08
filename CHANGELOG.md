# Changelog

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
