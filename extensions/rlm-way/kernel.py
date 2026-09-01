#!/usr/bin/env python3
"""rlm-way lite kernel — persistent Python over NDJSON stdio. Zero deps.

Protocol: one JSON request per stdin line -> one JSON response per stdout line.
Requests:  {"code": "...", "n": <exec_count>}  or  {"op": "shutdown"}
Responses: {"ready": true, "python": "3.x.y"} on start, then
           {"ok": bool, "stdout": "...", "result": "...", "error": "...", "n": int}
The namespace persists across requests until stdin closes or shutdown.
Last-expression semantics mirror the REPL (result of a trailing expression).
"""
import ast
import io
import json
import sys
import traceback
from contextlib import redirect_stdout


def main() -> None:
    for stream in (sys.stdout, sys.stdin):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

    ns: dict = {"__name__": "__main__"}

    def send(obj: dict) -> None:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        sys.stdout.flush()

    send({"ready": True, "python": sys.version.split()[0]})
    n = 0
    while True:
        line = sys.stdin.readline()
        if not line:
            break
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:
            send({"ok": False, "stdout": "", "error": "bad request line", "n": n})
            continue
        if req.get("op") == "shutdown":
            break
        n = int(req.get("n") or n + 1)
        code = req.get("code") or ""
        buf = io.StringIO()
        result = None
        err = None
        try:
            with redirect_stdout(buf):
                tree = ast.parse(code)
                last = tree.body[-1] if tree.body else None
                if isinstance(last, ast.Expr):
                    if len(tree.body) > 1:
                        exec(compile(ast.Module(tree.body[:-1], []), "<cell>", "exec"), ns)
                    result = eval(compile(ast.Expression(last.value), "<cell>", "eval"), ns)
                else:
                    exec(compile(tree, "<cell>", "exec"), ns)
        except SystemExit as e:
            send({"ok": True, "stdout": buf.getvalue(),
                  "result": "SystemExit(%s)" % (e.code,), "n": n})
            return
        except BaseException:
            err = traceback.format_exc(limit=10)
        send({
            "ok": err is None,
            "stdout": buf.getvalue(),
            "result": None if result is None else repr(result),
            "error": err,
            "n": n,
        })


if __name__ == "__main__":
    main()
