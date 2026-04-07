import sys
start = int(sys.argv[1])
end = int(sys.argv[2])
path = sys.argv[3]
with open(path, 'r', encoding='utf-8', errors='ignore') as f:
    lines = f.readlines()
for i in range(start-1, min(end, len(lines))):
    print(f'{i+1:04d}: {lines[i].rstrip()}')
