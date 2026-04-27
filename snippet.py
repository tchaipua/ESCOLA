from pathlib import Path
lines=Path('backend/src/modules/students/application/services/students.service.ts').read_text(encoding='utf8').splitlines()
for i in range(400, 440):
    print(f"{i+1:04d}: {lines[i]}")
