"""Junta, por seção, os quatro resultados (presidente e governador, 1º e 2º turnos) num CSV para o relatório comparativo.

Uso: python -I build_comparativo_data.py <pasta out>
"""
import csv, sys, os
OUT = sys.argv[1]

def load(key):
    sec = list(csv.DictReader(open(f'{OUT}/{key}_secoes.csv', encoding='utf-8')))
    geo = {(r['zona'], r['secao']): r for r in csv.DictReader(open(f'{OUT}/{key}_coordenadas.csv', encoding='utf-8'))}
    vot = list(csv.DictReader(open(f'{OUT}/{key}_votaveis.csv', encoding='utf-8')))
    cands = [v['coluna'] for v in vot if v['tipo'] == 'candidato']
    res = {}
    for r in sec:
        k = (r['zona'], r['secao'])
        res[k] = dict(r=r, g=geo[k], v={c: int(r[c] or 0) for c in cands}, bn=int(r['v95']) + int(r['v96']))
    return res

p1, p2, g1, g2 = (load(k) for k in ('presidente_t1', 'presidente_t2', 'governador_t1', 'governador_t2'))
assert set(p1) == set(p2) == set(g1) == set(g2)
cols = ['zona', 'secao', 'local', 'nome_local', 'endereco', 'bairro', 'lat', 'lon',
        'p1_aptos', 'p1_13', 'p1_22', 'p1_outros', 'p1_bn',
        'p2_aptos', 'p2_13', 'p2_22', 'p2_bn',
        'g1_aptos', 'g1_22', 'g1_13', 'g1_44', 'g1_outros', 'g1_bn',
        'g2_aptos', 'g2_44', 'g2_13', 'g2_bn']
rows = []
for k in sorted(p1, key=lambda k: (int(k[0]), int(k[1]))):
    a, b, c, d = p1[k], p2[k], g1[k], g2[k]
    rows.append([k[0], k[1], a['r']['local'], a['r']['nome_local'], a['r']['endereco'], a['g']['bairro'], a['g']['lat'], a['g']['lon'],
                 a['g']['aptos'], a['v']['v13'], a['v']['v22'], sum(a['v'].values()) - a['v']['v13'] - a['v']['v22'], a['bn'],
                 b['g']['aptos'], b['v']['v13'], b['v']['v22'], b['bn'],
                 c['g']['aptos'], c['v']['v22'], c['v']['v13'], c['v']['v44'], sum(c['v'].values()) - c['v']['v22'] - c['v']['v13'] - c['v']['v44'], c['bn'],
                 d['g']['aptos'], d['v']['v44'], d['v']['v13'], d['bn']])
with open(f'{OUT}/comparativo_secoes.csv', 'w', encoding='utf-8', newline='') as f:
    w = csv.writer(f, lineterminator='\n'); w.writerow(cols); w.writerows(rows)
print(len(rows), 'seções')
