#!/usr/bin/env python3
"""Package an allowlisted static site; no source HTML, tools, or dependencies."""
from pathlib import Path
import shutil
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'_site'
FILES=['index.html','styles.css','app.mjs','core.mjs','graph.mjs','graph-model.mjs','data/layout.json','data/glossary.json','data/review-history.json']
DEST.mkdir(exist_ok=True)
for item in FILES:
    target=DEST/item
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/item,target)
(DEST/'.nojekyll').touch()
print('Packaged',len(FILES),'static files in _site/')
