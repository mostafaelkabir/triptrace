"""
SQLite-backed scan credit ledger.

One row per purchased pass. `scans_used` is incremented server-side on each
/parse call. The DB survives backend restarts (persistent file).

Schema:
  passes(jti TEXT PK, email TEXT, scans_cap INT, scans_used INT, created_at INT)
"""

import os
import sqlite3
import time
from contextlib import contextmanager

_DB_PATH = os.environ.get("CREDITS_DB_PATH", "credits.db")

_INIT_SQL = """
CREATE TABLE IF NOT EXISTS passes (
    jti        TEXT    PRIMARY KEY,
    email      TEXT    NOT NULL,
    scans_cap  INTEGER NOT NULL,
    scans_used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);
"""


def _conn():
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _conn() as c:
        c.execute(_INIT_SQL)


def register_pass(jti: str, email: str, scans_cap: int):
    """Called once when a Stripe purchase is completed."""
    with _conn() as c:
        c.execute(
            "INSERT OR IGNORE INTO passes(jti, email, scans_cap, scans_used, created_at) "
            "VALUES (?, ?, ?, 0, ?)",
            (jti, email, scans_cap, int(time.time())),
        )


def consume_scan(jti: str) -> bool:
    """
    Atomically increment scans_used if under cap.
    Returns True if the scan is allowed, False if cap reached.
    """
    with _conn() as c:
        row = c.execute(
            "SELECT scans_cap, scans_used FROM passes WHERE jti = ?", (jti,)
        ).fetchone()
        if row is None:
            return False  # unknown jti — don't allow
        if row["scans_used"] >= row["scans_cap"]:
            return False
        c.execute("UPDATE passes SET scans_used = scans_used + 1 WHERE jti = ?", (jti,))
        return True


def get_balance(jti: str) -> dict | None:
    with _conn() as c:
        row = c.execute(
            "SELECT scans_cap, scans_used FROM passes WHERE jti = ?", (jti,)
        ).fetchone()
        if row is None:
            return None
        return {
            "scans_cap": row["scans_cap"],
            "scans_used": row["scans_used"],
            "scans_remaining": row["scans_cap"] - row["scans_used"],
        }
