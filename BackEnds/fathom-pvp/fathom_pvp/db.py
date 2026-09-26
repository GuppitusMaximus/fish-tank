from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


class Database:
    def __init__(self, dsn: str):
        self.pool = ConnectionPool(
            dsn, min_size=1, max_size=10, kwargs={"row_factory": dict_row}, open=False
        )

    def open(self) -> None:
        self.pool.open(wait=True)

    def close(self) -> None:
        self.pool.close()

    @contextmanager
    def transaction(self) -> Iterator[Connection]:
        with self.pool.connection() as conn:
            with conn.transaction():
                yield conn

    def check(self) -> bool:
        with self.pool.connection() as conn:
            return conn.execute("SELECT 1").fetchone() is not None
