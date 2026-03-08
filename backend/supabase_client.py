import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

url: str = os.environ.get("SUPABASE_URL")
# Prefer service role key in production (server-side only, never expose to frontend).
# It bypasses RLS and gives the backend full access. Use anon key + RLS for least privilege.
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

supabase: Client = create_client(url, key)
