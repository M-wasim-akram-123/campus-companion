import os
import re
import sys
from pathlib import Path

for line in Path(".env").read_text(encoding="utf-8").splitlines():
    m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\n]*)"?', line)
    if m and not os.environ.get(m.group(1)):
        os.environ[m.group(1)] = m.group(2)

from supabase import create_client

client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
imports = client.table("board_gazette_imports").select("id,label,row_count").execute().data or []
if not imports:
    print("No imports found")
    sys.exit(1)

imp = imports[0]
print(f"Import: {imp['label']} ({imp['row_count']} rows)")

rolls = sys.argv[1:] or ["300003", "300004", "506124"]
for roll in rolls:
    rows = (
        client.table("board_gazette_results")
        .select("roll_number,candidate_name,marks_obtained,result_status")
        .eq("import_id", imp["id"])
        .eq("roll_number", roll)
        .limit(1)
        .execute()
        .data
        or []
    )
    if rows:
        r = rows[0]
        print(f"{roll}: {r['candidate_name']} — {r['marks_obtained']} marks ({r['result_status']})")
    else:
        print(f"{roll}: NOT FOUND")
