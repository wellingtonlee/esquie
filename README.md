# re-helper-tools

MCP server providing reverse engineering helper tools for AI-assisted analysis.

## Tools

### python_eval
Execute Python code in a sandboxed Docker container with pre-installed RE packages (pwntools, capstone, keystone, unicorn, lief, yara, pycryptodome). Session state persists across calls.

### Hex/Binary Utilities
Native TypeScript tools for common RE operations:
- `hex_to_dec` / `dec_to_hex` — number base conversion
- `hex_to_ascii` / `ascii_to_hex` — encoding conversion
- `xor_buffers` — XOR two hex buffers
- `hash` — MD5, SHA1, SHA256
- `byte_pattern_search` — find byte patterns with `??` wildcard support
- `base64_encode` / `base64_decode`

### Scratchpad
In-memory key-value notepad for persisting analysis notes across a session:
- `set_note` / `get_note` / `list_notes` / `delete_note`

## Setup

```bash
npm install
npm run build
docker build -t re-helper-sandbox:latest .
```

## Usage with Claude Code

Add to your MCP config:

```json
{
  "re-helper-tools": {
    "command": "node",
    "args": ["dist/index.js"],
    "cwd": "/path/to/re-helper-tools"
  }
}
```

## Requirements

- Node.js 20+
- Docker
