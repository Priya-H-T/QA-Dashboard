from sqlalchemy import inspect, text


def ensure_columns(engine, table_name: str, expected_columns: dict[str, str]) -> set[str]:
    """
    Checks an existing SQLite table for missing columns and adds them.
    expected_columns maps column_name -> SQL type (e.g. "TEXT", "INTEGER").
    This only ADDS columns; it never removes or alters existing ones,
    and it does nothing for tables that don't exist yet (create_all handles those).

    Returns the set of column names that were actually added in this call
    (empty on every call after the first, since the column already exists
    from then on). Callers can use this to run one-time backfill logic —
    e.g. NOTE: if expected_columns includes a "... DEFAULT 'x'" clause,
    SQLite backfills every existing row with 'x' on ADD COLUMN, not just
    new rows going forward. That's fine for incidental columns, but for
    anything with real per-row meaning (like a user's role), a blanket
    default can silently overwrite what should've been a deliberate
    choice. Prefer adding such columns WITHOUT a SQL-level default and
    doing an explicit, logged backfill in the caller instead.
    """
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return set()

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    missing = {name: sqltype for name, sqltype in expected_columns.items() if name not in existing}

    if not missing:
        return set()

    with engine.begin() as conn:
        for name, sqltype in missing.items():
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {name} {sqltype}"))
            print(f"[migration] Added column '{name}' to '{table_name}'")

    return set(missing.keys())