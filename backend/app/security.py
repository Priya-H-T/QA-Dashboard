import hashlib
import secrets

PBKDF2_ITERATIONS = 260_000


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS
    )
    return salt, digest.hex()


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    _, computed_hash = hash_password(password, salt)
    return secrets.compare_digest(computed_hash, expected_hash)


def generate_token() -> str:
    return secrets.token_urlsafe(32)