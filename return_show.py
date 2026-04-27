from pathlib import Path
lines=Path('backend/src/modules/people/application/services/people.service.ts').read_text(encoding='utf8').splitlines()
for i in range(780, len(lines)):
    if 'return this.mapPersonResponse' in lines[i]:
        for j in range(i, min(i+20,len(lines))):
            print(f"{j+1:04d}: {lines[j]}")
        break
