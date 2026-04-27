from pathlib import Path
lines=Path('backend/src/modules/students/application/services/students.service.ts').read_text(encoding='utf8').splitlines()
for i in range(1,80):
    print(f"{i:04d}: {lines[i-1]}")
