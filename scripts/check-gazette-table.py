import os
import re
from pathlib import Path

for line in Path(".env").read_text(encoding="utf-8").splitlines():
    m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n]*)"?', line)
    if m and not os.environ.get(m.group(1)):
        os.environ[m.group(1)] = m.group(2)

from supabase import create_client

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
try:
    r = client.table("board_gazette_imports").select("id").limit(1).execute()
    print("table_ok", len(r.data or []))
except Exception as e:
    print("table_error", e)
