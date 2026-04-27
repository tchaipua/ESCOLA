from pathlib import Path
lines=Path('backend/src/modules/shared-profiles/application/services/shared-profiles.service.ts').read_text(encoding='utf8').splitlines()
for i in range(600, 680):
    print(f"{i+1:04d}: {lines[i]}")
