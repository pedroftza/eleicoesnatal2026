"""Estatísticas de um caso (espelha os cálculos do relatório) para escrever o texto da análise.

Uso: python -I stats.py <pasta_out> <caso> <num_A> <num_B>   (margem = A − B)
"""
import csv, sys, json, statistics, collections, math
sys.stdout.reconfigure(encoding='utf-8')
OUT, key, A, B = sys.argv[1:5]

def load(t): return list(csv.DictReader(open(f'{OUT}/{key}_{t}.csv', encoding='utf-8')))
sec, vot, geo = load('secoes'), load('votaveis'), {(r['zona'], r['secao']): r for r in load('coordenadas')}
cands = [v['coluna'] for v in vot if v['tipo'] == 'candidato']
rows = []
for r in sec:
    g = geo[(r['zona'], r['secao'])]; v = lambda k: int(r[k] or 0)
    val = sum(v(c) for c in cands); tot = val + v('v95') + v('v96'); ap = int(g['aptos'])
    rows.append(dict(zona=int(r['zona']), secao=int(r['secao']), local=int(r['local']), nome=r['nome_local'], bairro=g['bairro'],
                     a=v('v' + A), b=v('v' + B), val=val, tot=tot, aptos=ap, bn=v('v95') + v('v96'),
                     m=(v('v' + A) - v('v' + B)) / val * 100 if val else 0, abst=(ap - tot) / ap if ap else 0))

def agg(rs):
    a, b, val, tot, ap, bn = (sum(r[k] for r in rs) for k in ('a', 'b', 'val', 'tot', 'aptos', 'bn'))
    return dict(n=len(rs), pa=a / val * 100, pb=b / val * 100, m=(a - b) / val * 100, saldo=a - b, aptos=ap,
                abst=ap - tot, pabst=(ap - tot) / ap * 100, pbn=bn / tot * 100, vA=sum(r['a'] > r['b'] for r in rs), vB=sum(r['b'] > r['a'] for r in rs))

def group(k):
    g = collections.defaultdict(list)
    for r in rows: g[k(r)].append(r)
    return {kk: agg(v) for kk, v in g.items()}

f = lambda d: {k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()}
cid = agg(rows); print('CIDADE', f(cid))
print('ZONAS'); [print(' ', z, f(d)) for z, d in sorted(group(lambda r: r['zona']).items())]
bai = group(lambda r: r['bairro'])
print('BAIRROS por margem'); [print(f'  {k:<28}', f(d)) for k, d in sorted(bai.items(), key=lambda x: x[1]['m'])]
print('BAIRROS por saldo'); [print(f'  {k:<28} {d["saldo"]:+}') for k, d in sorted(bai.items(), key=lambda x: x[1]['saldo'])]
print('BAIRROS por abst abs'); [print(f'  {k:<28} {d["abst"]} {d["pabst"]:.1f}% esperado {d["abst"] - d["aptos"] * cid["pabst"] / 100:+.0f}') for k, d in sorted(bai.items(), key=lambda x: -x[1]['abst'])]
loc = group(lambda r: (r['zona'], r['local'], r['nome'], r['bairro']))
ls = sorted(loc.items(), key=lambda x: x[1]['m'])
print('LOCAIS pró-B'); [print('  ', k, f(d)) for k, d in ls[:5]]
print('LOCAIS pró-A'); [print('  ', k, f(d)) for k, d in ls[-5:]]
print('LOCAIS abst %'); [print('  ', k, round(d['pabst'], 1), d['abst']) for k, d in sorted(loc.items(), key=lambda x: -x[1]['pabst'])[:6]]
print('LOCAIS abst abs'); [print('  ', k, d['abst']) for k, d in sorted(loc.items(), key=lambda x: -x[1]['abst'])[:5]]
ms = sorted(r['m'] for r in rows); q = statistics.quantiles(ms, n=4, method='inclusive')
print('MARGEM q25/med/q75', [round(x, 1) for x in q], 'min/max', round(ms[0], 1), round(ms[-1], 1),
      'A>60', sum(r['a'] / r['val'] > .6 for r in rows), 'B>60', sum(r['b'] / r['val'] > .6 for r in rows),
      '|m|<5', sum(abs(r['m']) < 5 for r in rows), '|m|>=10', sum(abs(r['m']) >= 10 for r in rows))
ab = sorted(r['abst'] for r in rows); qa = statistics.quantiles(ab, n=4, method='inclusive')
print('ABST q25/q75', [round(100 * x, 1) for x in qa], 'min/max', round(100 * ab[0], 1), round(100 * ab[-1], 1))
def corr(x, y): return statistics.correlation(x, y)
print('CORR abst×margem', round(corr([r['abst'] for r in rows], [r['m'] for r in rows]), 3),
      'bairro', round(corr([d['pabst'] for d in bai.values()], [d['m'] for d in bai.values()]), 3),
      'abst×bn', round(corr([r['abst'] for r in rows], [r['bn'] / r['tot'] for r in rows]), 3))
def gab(fn):
    rs = [r for r in rows if fn(r['m'])]; return round(100 * (sum(r['aptos'] for r in rs) - sum(r['tot'] for r in rs)) / sum(r['aptos'] for r in rs), 1), len(rs)
print('ABST por faixa: B>=5', gab(lambda m: m <= -5), 'equil', gab(lambda m: -5 < m <= 5), 'A 5-15', gab(lambda m: 5 < m <= 15), 'A>15', gab(lambda m: m > 15))
norte = ['IGAPO', 'LAGOA AZUL', 'N.S.DA APRESENTAÇÃO', 'PAJUCARA', 'POTENGI', 'REDINHA']
print('NORTE', f(agg([r for r in rows if r['bairro'] in norte])))
json.dump({'rows': rows}, open(f'{OUT}/{key}_rows.json', 'w', encoding='utf-8'))
