#!/usr/bin/env python3
"""Session-persistent Python runner for the RE sandbox.

Reads code from stdin, executes it in a namespace that persists across
calls via dill serialization to /tmp/session.pkl.
"""

import sys
import os
import io
import traceback

SESSION_FILE = "/tmp/session.pkl"


def load_session() -> dict:
    if not os.path.exists(SESSION_FILE):
        return {}
    try:
        import dill
        with open(SESSION_FILE, "rb") as f:
            return dill.load(f)
    except Exception:
        return {}


def save_session(ns: dict) -> None:
    try:
        import dill
        save_ns = {k: v for k, v in ns.items() if not k.startswith("__")}
        with open(SESSION_FILE, "wb") as f:
            dill.dump(save_ns, f)
    except Exception:
        print("[warning: session state could not be saved]", file=sys.stderr)


def main() -> None:
    ns = load_session()
    code = sys.stdin.read()

    old_stdout = sys.stdout
    old_stderr = sys.stderr
    sys.stdout = captured_out = io.StringIO()
    sys.stderr = captured_err = io.StringIO()

    try:
        # Try eval first (expressions return their value)
        try:
            result = eval(compile(code, "<eval>", "eval"), ns)
            if result is not None:
                print(repr(result))
        except SyntaxError:
            exec(compile(code, "<exec>", "exec"), ns)
    except Exception:
        traceback.print_exc()

    sys.stdout = old_stdout
    sys.stderr = old_stderr

    stdout_val = captured_out.getvalue()
    stderr_val = captured_err.getvalue()

    if stdout_val:
        print(stdout_val, end="")
    if stderr_val:
        print(stderr_val, end="", file=sys.stderr)

    save_session(ns)


if __name__ == "__main__":
    main()
