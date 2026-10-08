#!/usr/bin/env python3
"""Read-only upstream comparison. Never silently replace reviewed content."""
import hashlib
import json
import tempfile
import urllib.request
from pathlib import Path
from build import DOCS, ROOT, extract

manifest = json.loads((ROOT / 'sources/manifest.json').read_text())
report = []
for stem, label, anchor in DOCS:
    metadata = manifest['documents'][stem]
    request = urllib.request.Request(metadata['url'], headers={'User-Agent': 'NIST-Glossary-Map-source-check/1.0'})
    raw = urllib.request.urlopen(request, timeout=60).read()
    with tempfile.TemporaryDirectory() as folder:
        # Reuse extractor against a separate snapshot, not the published sources.
        import build
        scratch = Path(folder)
        (scratch / 'sources').mkdir()
        (scratch / 'sources' / (stem + '.html')).write_bytes(raw)
        original = build.ROOT
        try:
            build.ROOT = scratch
            fresh = {e['heading']: e['hash'] for e in extract(stem, label, anchor)}
        finally:
            build.ROOT = original
    old = {e['heading']: e['hash'] for e in extract(stem, label, anchor)}
    report.append({'source': stem, 'htmlChanged': hashlib.sha256(raw).hexdigest() != metadata['sha256'],
                   'added': sorted(fresh.keys() - old.keys()), 'removed': sorted(old.keys() - fresh.keys()),
                   'changed': sorted(k for k in fresh.keys() & old.keys() if fresh[k] != old[k])})
print(json.dumps(report, ensure_ascii=False, indent=2))
if any(r['added'] or r['removed'] or r['changed'] for r in report):
    raise SystemExit(1)
