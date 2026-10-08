# Compare the last Nova run (scripts/qa-emulator/e2e/nova-upload.cjs) with golden/nova-before-fix.json.
# Run from the repo root: [GOLDEN=<golden json>] E2E_OUT=<same folder> python3 scripts/qa-emulator/e2e/nova-diff.py
import json,os,re,sys
shots=os.environ.get('E2E_OUT') or os.path.join(os.environ.get('TMPDIR','/tmp'),'sp1-nova-shots')  # same folder nova-upload.cjs writes to
golden=os.environ.get('GOLDEN','scripts/qa-emulator/golden/nova-before-fix.json')
before={r['tracking']:r for r in json.load(open(golden))['rows']}
rows=json.load(open(f'{shots}/nova-table.json'))
assigned={}
for l in open(f'{shots}/nova-assignments.log').read().splitlines():
    m=re.search(r'tracking (\S+) → slCode (\S+)',l)
    if m: assigned[m.group(1)]=m.group(2)
changed=[]
for r in rows:
    b=before[r['tracking']]; nowA=assigned.get(r['tracking']); nowP=r['P']
    diff=(b['assignedByPreAlert']!=nowA) or (b['P']!=nowP) or ('badge' in b and b['badge']!=r.get('badge'))
    if diff: changed.append(r['case'])
    print(('CAMBIO ' if diff else '       ')+r['case'].ljust(4), 'antes:', str(b['assignedByPreAlert']).ljust(7), '→ ahora:', str(nowA).ljust(7), '| P:', (nowP or '—'), '|', r.get('badge',''))
print('filas con cambio vs golden:', changed)
