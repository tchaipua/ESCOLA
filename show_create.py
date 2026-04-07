from pathlib import Path
lines=Path('backend/src/modules/people/application/services/people.service.ts').read_text(encoding='utf8').splitlines()
for i,line in enumerate(lines):
    if 'async create(createDto' in line:
        for j in range(i, i+200):
            print(f"{j+1:04d}: {lines[j]}")
        break
