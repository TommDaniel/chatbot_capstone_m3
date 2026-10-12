"""Package a reviewable academic submission with an explicit source allowlist."""
from pathlib import Path
import hashlib
import json
import re
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "output/fluxsus-ai-entrega.zip"
DIRECTORIES = (".github", "data", "docs", "evaluation", "migrations", "scripts", "server", "shared", "tests", "web")
ROOT_FILES = (
    ".dockerignore", ".env.example", ".gitattributes", ".gitignore", "Dockerfile", "docker-compose.yml",
    "README.md", "package.json", "package-lock.json", "requirements-report.txt", "tsconfig.json",
    "vite.config.ts", "vitest.config.ts", "vitest.integration.config.ts", "playwright.config.ts",
)
paths = [ROOT / name for name in ROOT_FILES if (ROOT / name).is_file()]
for directory in DIRECTORIES:
    paths.extend(path for path in (ROOT / directory).rglob("*") if path.is_file())
paths.extend(path for path in (ROOT / "output").glob("*.json") if path.name != "submission-manifest.json")
for directory in ("screenshots", "pdf"):
    paths.extend(path for path in (ROOT / "output" / directory).rglob("*") if path.is_file())

for path in paths:
    relative = path.relative_to(ROOT)
    if any(part in {"node_modules", ".cache", ".git", "tmp", "test-results"} for part in relative.parts):
        raise SystemExit("A directory excluded from submission reached the allowlist.")
    if path.name == ".env" or path.suffix in {".log", ".pyc"}:
        raise SystemExit("A local secret or runtime artifact reached the allowlist.")

# Check the actual local secret without logging or incorporating it.
local_env = ROOT / ".env"
secret_match = re.search(r"^DEEPSEEK_API_KEY\s*=\s*(.+)\s*$", local_env.read_text(encoding="utf-8"), re.M) if local_env.exists() else None
secret = secret_match.group(1).strip().strip("\"'").encode() if secret_match else b""
manifest = []
DESTINATION.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(DESTINATION, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(set(paths)):
        content = path.read_bytes()
        if secret and secret in content:
            raise SystemExit("The local API secret was detected in a submission file; packaging stopped.")
        name = "fluxsus-ai/" + path.relative_to(ROOT).as_posix()
        archive.writestr(name, content)
        manifest.append({"file": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})

with zipfile.ZipFile(DESTINATION) as archive:
    if archive.testzip() is not None or any(Path(name).name == ".env" for name in archive.namelist()):
        raise SystemExit("Archive integrity or secret exclusion check failed.")

metadata = {"archive": DESTINATION.name, "fileCount": len(manifest),
            "bytes": DESTINATION.stat().st_size,
            "sha256": hashlib.sha256(DESTINATION.read_bytes()).hexdigest(),
            "secretExcluded": True, "files": manifest}
(ROOT / "output/submission-manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: metadata[key] for key in ("archive", "fileCount", "bytes", "sha256", "secretExcluded")}))
