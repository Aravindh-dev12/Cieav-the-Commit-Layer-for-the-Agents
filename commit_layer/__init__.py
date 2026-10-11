"""
Commit Layer for the Internet package.
"""

from pathlib import Path
from dotenv import load_dotenv, find_dotenv

# Ensure environment variables from project root .env are loaded reliably
_env_path = Path(__file__).resolve().parent.parent / ".env"
if _env_path.exists():
    load_dotenv(dotenv_path=_env_path)
else:
    load_dotenv(find_dotenv(usecwd=True))

__version__ = "0.1.0"
