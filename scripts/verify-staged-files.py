"""Check staged submission files without logging the actual local API secret."""
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(["git", "ls-files", "--cached", "-z"], cwd=ROOT).decode().split("\0")
paths = [path for path in paths if path]
if not paths:
    raise SystemExit("No staged files to verify.")
secret_match = re.search(r"^DEEPSEEK_API_KEY\s*=\s*(.+)\s*$", (ROOT / ".env").read_text(encoding="utf-8"), re.M) if (ROOT / ".env").exists() else None
secret = secret_match.group(1).strip().strip("\"'").encode() if secret_match else b""
for name in paths:
    path = Path(name)
    if path.name.startswith(".env") and path.name != ".env.example":
        raise SystemExit("A local environment file is staged; remove it before publication.")
    if any(part in {"node_modules", ".cache", "tmp", "test-results", "__pycache__"} for part in path.parts):
        raise SystemExit("A runtime directory is staged; remove it before publication.")
    content = subprocess.check_output(["git", "show", ":" + name], cwd=ROOT)
    if secret and secret in content:
        raise SystemExit("The local API secret occurs in a staged file; publication stopped.")
    if re.search(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----", content):
        raise SystemExit("A private key occurs in a staged file; publication stopped.")
required = {"README.md", ".env.example", "docs/16-parecer-professor.md", "output/evaluation-live.json", "output/pdf/fluxsus-ai-lab-relatorio-tecnico.pdf"}
if not required.issubset(paths):
    raise SystemExit("Required professor-facing evidence is not staged.")
print(json.dumps({"stagedFiles": len(paths), "localEnvironmentExcluded": True,
                  "localApiSecretAbsent": True, "professorEvidenceIncluded": True}))
