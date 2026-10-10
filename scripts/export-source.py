"""Create a portable source bundle, excluding runtime state and Site identity."""
from pathlib import Path
import json
import zipfile
root = Path(__file__).resolve().parents[1]
output = root / 'public/evidence-atlas-source.zip'
excluded = {'node_modules', '.git', '.sites-runtime', '.wrangler', '.next', 'dist', '.vinext', 'outputs', 'work', '.agents', '.codex', 'examples', '__pycache__'}
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root)
        if not path.is_file() or excluded.intersection(relative.parts) or path == output:
            continue
        if path.name.startswith('.env') or path.suffix in {'.tsbuildinfo', '.log', '.pem'}:
            continue
        name = f'evidence-atlas/{relative.as_posix()}'
        if relative.as_posix() == '.openai/hosting.json':
            data = json.loads(path.read_text())
            data.pop('project_id', None)
            archive.writestr(name, json.dumps(data, indent=2))
        else:
            archive.write(path, name)
print(f'Source bundle: {output.name} ({output.stat().st_size:,} bytes)')
