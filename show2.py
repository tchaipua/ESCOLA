from pathlib import Path
lines=Path('backend/src/modules/students/application/services/students.service.ts').read_text(encoding='utf8').splitlines()
for i in range(320, 420):
    print(f"{i+1:04d}: {lines[i]}")
