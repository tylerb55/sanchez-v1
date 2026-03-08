#!/usr/bin/env python3
"""
Upload files to Supabase Storage (S3-compatible).

Usage:
  # From repo root (recommended)
  python backend/scripts/upload_to_storage.py --bucket project-files path/to/file.pdf path/to/other.docx

  # Upload with a prefix (path inside the bucket)
  python backend/scripts/upload_to_storage.py --bucket project-files --prefix project-alpha/ ./file.pdf

  # Create bucket if it doesn't exist (default: true)
  python backend/scripts/upload_to_storage.py --bucket project-files --no-create-bucket file.txt

  # Upload all files in a directory (one bucket per project = use project UUID as bucket)
  python backend/scripts/upload_to_storage.py --bucket 4bf14cb2-e16f-4357-bcce-9d39226c8961 --dir backend/scripts

Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY).
"""

import argparse
import os
import sys
from pathlib import Path

# Ensure we can load .env from backend directory
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(BACKEND_DIR / ".env")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")


def ensure_bucket(supabase, bucket: str, public: bool = False) -> None:
    try:
        supabase.storage.get_bucket(bucket)
    except Exception:
        supabase.storage.create_bucket(bucket, options={"public": public})
        print(f"Created bucket: {bucket}")


def upload_file(supabase, bucket: str, local_path: Path, storage_path: str, upsert: bool = False) -> str:
    """Upload a single file. Returns path in bucket."""
    path = Path(local_path)
    if not path.is_file():
        raise FileNotFoundError(f"Not a file: {path}")
    with open(path, "rb") as f:
        data = f.read()
    opts = {"content-type": _mime(path)}
    if upsert:
        opts["upsert"] = "true"
    supabase.storage.from_(bucket).upload(storage_path, data, opts)
    return storage_path


def _mime(path: Path) -> str:
    ext = path.suffix.lower()
    m = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".xls": "application/vnd.ms-excel",
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
        ".xlsb": "application/vnd.ms-excel.sheet.binary.macroEnabled.12",
        ".txt": "text/plain",
        ".md": "text/markdown",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return m.get(ext, "application/octet-stream")


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload files to Supabase Storage")
    parser.add_argument("files", nargs="*", type=Path, help="Local file path(s) to upload")
    parser.add_argument("--bucket", "-b", default="project-files", help="Storage bucket name (use project UUID for one bucket per project)")
    parser.add_argument("--dir", "-d", type=Path, metavar="DIR", help="Upload all files from this directory (excludes .py by default; use --include-script to include this script)")
    parser.add_argument("--prefix", "-p", default="", help="Path prefix inside the bucket (e.g. project-alpha/)")
    parser.add_argument("--public", action="store_true", help="Create bucket as public (if creating)")
    parser.add_argument("--no-create-bucket", action="store_true", help="Do not create bucket if missing")
    parser.add_argument("--upsert", action="store_true", help="Overwrite existing file with same path")
    parser.add_argument("--include-script", action="store_true", help="When using --dir, include .py files (default: exclude them)")
    args = parser.parse_args()

    if args.dir is not None:
        dir_path = args.dir.resolve()
        if not dir_path.is_dir():
            print(f"Error: Not a directory: {dir_path}", file=sys.stderr)
            sys.exit(1)
        files = [f for f in dir_path.iterdir() if f.is_file()]
        if not args.include_script:
            files = [f for f in files if f.suffix.lower() != ".py"]
        args.files = sorted(files)
        if not args.files:
            print(f"No files to upload in {dir_path}", file=sys.stderr)
            sys.exit(1)

    if not args.files:
        parser.error("Provide at least one file path, or use --dir to upload a directory")

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY) in backend/.env", file=sys.stderr)
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    if not args.no_create_bucket:
        ensure_bucket(supabase, args.bucket, public=args.public)

    for local_path in args.files:
        local_path = local_path.resolve()
        if not local_path.is_file():
            print(f"Skip (not a file): {local_path}", file=sys.stderr)
            continue
        name = local_path.name
        storage_path = (args.prefix.rstrip("/") + "/" + name).lstrip("/")
        try:
            path_in_bucket = upload_file(supabase, args.bucket, local_path, storage_path, upsert=args.upsert)
            print(f"Uploaded: {local_path} -> {args.bucket}/{path_in_bucket}")
        except Exception as e:
            print(f"Failed {local_path}: {e}", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
