from pathlib import Path
lines=Path('backend/src/modules/people/application/services/people.service.ts').read_text(encoding='utf8').splitlines()
for i in range(760, 820):
    print(f"{i+1:04d}: {lines[i]}")
