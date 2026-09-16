from sqlalchemy import inspect, text


def ensure_columns(engine, table_name: str, expected_columns: dict[str, str]):
    """
    Checks an existing SQLite table for missing columns and adds them.
    expected_columns maps column_name -> SQL type (e.g. "TEXT", "INTEGER").
    This only ADDS columns; it never removes or alters existing ones,
    and it does nothing for tables that don't exist yet (create_all handles those).
    """
    inspector = inspect(engine)
    if table_name not in inspector.get_table_names():
        return

    existing = {col["name"] for col in inspector.get_columns(table_name)}
    missing = {name: sqltype for name, sqltype in expected_columns.items() if name not in existing}

    if not missing:
        return

    with engine.begin() as conn:
        for name, sqltype in missing.items():
            conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {name} {sqltype}"))
            print(f"[migration] Added column '{name}' to '{table_name}'")