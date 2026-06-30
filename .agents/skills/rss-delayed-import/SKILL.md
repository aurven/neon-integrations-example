---
name: rss-delayed-import
description: "Fetch an RSS feed and build a delayed import job body for the old Neon delayed-import endpoint. Use when the user asks to 'import RSS', 'set up RSS import', 'schedule RSS feed import', or wants to pull content from an RSS feed into a Neon workspace. Triggers on: 'RSS import', 'delayed import from RSS', 'import from feed', 'schedule feed'."
---

# RSS → Delayed Import (old endpoint)

Fetches an RSS feed via bash, builds a static items array with attribution paragraph, writes it to an example file, and provides a curl command for `POST /in/delayed-import`.

**Endpoint:** `POST /in/delayed-import`

**Example output file pattern:** `examples/delayed-import-{slug}-example.json`

---

## Step 1 — Collect required information

Ask for any missing values. If an `args` string was passed (e.g. an RSS URL), use it directly.

| Field | Description | Default |
|---|---|---|
| `rssUrl` | Full URL of the RSS feed | **required** |
| `site` | Neon target site name | **required** |
| `workspace` | Neon workspace path (e.g. `wire/cronaca`) | **required** |
| `duration` | Minutes over which to spread imports | `1` |
| `type` | Neon node type for each story | `wirestory` |
| `maxItems` | Max items to fetch from feed | all |
| `sourceName` | Source label used in attribution paragraph | auto (from RSS hostname) |
| `slug` | Short name for output filename (e.g. `adnkronos-cronaca`) | derived from URL |

---

## Step 2 — Fetch RSS and build items

Run this bash command, substituting `RSS_URL`, `SOURCE_NAME`, `TYPE`, and `MAX_ITEMS`:

```bash
python3 - <<'PYEOF'
import urllib.request, xml.etree.ElementTree as ET, json, html, re
from datetime import datetime

RSS_URL     = "https://example.com/feed.xml"
SOURCE_NAME = "Example.com"
ITEM_TYPE   = "wirestory"
MAX_ITEMS   = 0   # 0 = all

def strip_html(s):
    return re.sub(r'<[^>]+>', '', html.unescape(s or '')).strip()

def format_italian_date(date_str):
    try:
        dt = datetime.strptime(date_str[:25].strip(), "%a, %d %b %Y %H:%M:%S")
        months = ["gennaio","febbraio","marzo","aprile","maggio","giugno",
                  "luglio","agosto","settembre","ottobre","novembre","dicembre"]
        return f"{dt.day} {months[dt.month-1]} {dt.year}"
    except Exception:
        return date_str or ""

with urllib.request.urlopen(RSS_URL) as r:
    tree = ET.parse(r)
root = tree.getroot()
ns = {'dc': 'http://purl.org/dc/elements/1.1/'}

all_items = root.findall('.//item')
if MAX_ITEMS > 0:
    all_items = all_items[:MAX_ITEMS]

items = []
for item in all_items:
    title  = (item.findtext('title') or '').strip()
    desc   = (item.findtext('description') or '').strip()
    link   = (item.findtext('link') or '').strip()
    pub    = (item.findtext('pubDate') or '').strip()
    byline = (item.findtext('dc:creator', namespaces=ns) or
              item.findtext('author') or '').strip()
    summary = strip_html(desc)
    pub_label = format_italian_date(pub)
    attribution = f'<p>Questo articolo è apparso su {SOURCE_NAME} <a href="{link}">a questo indirizzo</a> il {pub_label}</p>'
    content = desc + attribution
    entry = {"contentType": "story", "type": ITEM_TYPE, "title": title, "summary": summary, "content": content}
    if byline:
        entry["byline"] = byline
    items.append(entry)

print(json.dumps(items, indent=2, ensure_ascii=False))
PYEOF
```

Adjust `RSS_URL`, `SOURCE_NAME`, `ITEM_TYPE`, and `MAX_ITEMS` before running.

---

## Step 3 — Write the example file

Wrap the items array in the full request body and write to `examples/delayed-import-{slug}-example.json`:

```json
{
  "site": "<site>",
  "workspace": "<workspace>",
  "duration": <duration>,
  "publish": false,
  "items": [ ... ]
}
```

---

## Step 4 — Generate and show the curl command

```bash
curl -s -X POST \
  http://localhost:3000/in/delayed-import \
  -H "Content-Type: application/json" \
  -H "apikey: $NEON_EXT_APIKEY" \
  -d @examples/delayed-import-<slug>-example.json \
  | jq .
```

Show the command and ask: **"Run it now, or keep it for later?"**

---

## Step 5 — Optionally run and report

If the user confirms, run the curl command via Bash. Parse the JSON response:
- On success (HTTP 202): show `jobId`, `itemCount`, `intervalMs`, `estimatedEndAt`
- On error: show the `error` field and suggest fixes

---

## Notes

- Server must be running (`npm run dev`) for the endpoint to be reachable.
- RSS feed must be publicly accessible from the server's network.
- Items with no `title` or no `content`/`description` will import with empty fields — warn if this could be an issue.
- `duration: 1` distributes all items over 1 minute. Increase for gentler pacing.
- To check job status after submission: `GET /in/delayed-import/{jobId}`
- To cancel: `DELETE /in/delayed-import/{jobId}`
- For a **live RSS endpoint** (no pre-built JSON needed), use `POST /in/delayed-import/from/rss` with `examples/delayed-import-{slug}-config.json` instead. See `examples/delayed-import-adnkronos-cronaca-config.json` for the config shape.
