from contextlib import contextmanager
import psycopg2
from config import DATABASE_URL


@contextmanager
def get_connection():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        yield conn
    finally:
        conn.close()


def get_connection_string():
    return DATABASE_URL
