"""Gera os CSV embutidos nos relatórios (secoes, votaveis, coordenadas) para Natal, por cargo e turno.

Uso: python -I build_data.py <pasta_tse> <html_1turno_para_coordenadas> <saida>
"""
import csv, io, re, sys, collections, os

TSE, REF, OUT = sys.argv[1:4]
# A seção 642 da zona 1 fica numa unidade prisional em Parnamirim: entra nos totais, mas sem bairro nem coordenada em Natal.
FORA_DE_NATAL = {('1', '642')}
APELIDOS = {'CARLOS EDUARDO XAVIER': 'Cadu'}  # nome usado nos relatórios no lugar do nome de urna

def embedded(path):
    s = open(path, encoding='utf-8').read()
    return {m.group(1): m.group(2).strip('\n') for m in re.finditer(r'<script type="text/plain" id="data-([^"]+)">(.*?)</script>', s, re.S)}

# Bairro e coordenadas de cada seção vêm do 1º turno (Eleitorado por local de votação).
geo = {(r['zona'], r['secao']): r for r in csv.DictReader(io.StringIO(embedded(REF)['coordenadas']))}

def read(path):
    with open(path, encoding='latin1', newline='') as f:
        for r in csv.DictReader(f, delimiter=';'):
            if r['NM_MUNICIPIO'] == 'NATAL':
                yield r

CASES = {  # chave: (cargo, turno, arquivo de votação, arquivo de detalhe)
    'presidente_t1': ('Presidente', '1', 'vot_br_natal.csv', 'detalhe_votacao_secao_2026_BR.csv'),
    'presidente_t2': ('Presidente', '2', 'vot_br_natal.csv', 'detalhe_votacao_secao_2026_BR.csv'),
    'governador_t1': ('Governador', '1', 'votacao_secao_2026_RN.csv', 'detalhe_votacao_secao_2026_RN.csv'),
    'governador_t2': ('Governador', '2', 'votacao_secao_2026_RN.csv', 'detalhe_votacao_secao_2026_RN.csv'),
}

cache = {}
def rows(fn):
    if fn not in cache:
        cache[fn] = list(read(os.path.join(TSE, fn)))
    return cache[fn]

def write(path, header, data):
    with open(path, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f, lineterminator='\n'); w.writerow(header); w.writerows(data)

os.makedirs(OUT, exist_ok=True)
for key, (cargo, turno, fvot, fdet) in CASES.items():
    votos = collections.defaultdict(collections.Counter); info = {}; nomes = {}; tot = collections.Counter()
    for r in rows(fvot):
        if r['DS_CARGO'] != cargo or r['NR_TURNO'] != turno: continue
        k = (r['NR_ZONA'], r['NR_SECAO'])
        n = r['NR_VOTAVEL']; q = int(r['QT_VOTOS'])
        votos[k][n] += q; tot[n] += q; nomes[n] = APELIDOS.get(r['NM_VOTAVEL'], r['NM_VOTAVEL'])
        info[k] = (r['NR_LOCAL_VOTACAO'], ' '.join(r['NM_LOCAL_VOTACAO'].split()), ' '.join(r['DS_LOCAL_VOTACAO_ENDERECO'].split()))
    aptos = {}; comp = {}
    for r in rows(fdet):
        if r['DS_CARGO'] != cargo or r['NR_TURNO'] != turno: continue
        k = (r['NR_ZONA'], r['NR_SECAO'])
        aptos[k] = aptos.get(k, 0) + int(r['QT_APTOS']); comp[k] = comp.get(k, 0) + int(r['QT_COMPARECIMENTO'])
    # Conferência: votos registrados de cada seção = comparecimento do arquivo de detalhe.
    divergentes = [k for k in votos if sum(votos[k].values()) != comp.get(k)]
    print(key, 'seções com comparecimento divergente:', divergentes)
    if cargo == 'Governador':
        # Totais do estado inteiro, para a comparação Natal × RN.
        est = collections.Counter(); en = {}
        with open(os.path.join(TSE, fvot), encoding='latin1', newline='') as f:
            for r in csv.DictReader(f, delimiter=';'):
                if r['DS_CARGO'] == cargo and r['NR_TURNO'] == turno:
                    est[r['NR_VOTAVEL']] += int(r['QT_VOTOS']); en[r['NR_VOTAVEL']] = APELIDOS.get(r['NM_VOTAVEL'], r['NM_VOTAVEL'])
        write(os.path.join(OUT, key + '_estado.csv'), ['numero', 'nome', 'votos'], [[n, en[n], v] for n, v in est.most_common()])
    cands = sorted((n for n in tot if n not in ('95', '96')), key=lambda n: -tot[n])
    ordem = cands + ['95', '96']
    tipo = lambda n: {'95': 'branco', '96': 'nulo'}.get(n, 'candidato')
    write(os.path.join(OUT, key + '_votaveis.csv'), ['numero', 'nome', 'coluna', 'tipo'],
          [[n, nomes.get(n, {'95': 'VOTO BRANCO', '96': 'VOTO NULO'}[n] if n in ('95', '96') else n), 'v' + n, tipo(n)] for n in ordem])
    secs = sorted(votos, key=lambda k: (int(k[0]), int(k[1])))
    write(os.path.join(OUT, key + '_secoes.csv'), ['zona', 'secao', 'local', 'nome_local', 'endereco'] + ['v' + n for n in ordem],
          [[k[0], k[1], *info[k]] + [votos[k][n] for n in ordem] for k in secs])
    falta = [k for k in secs if k not in geo and k not in FORA_DE_NATAL]
    sem = {'bairro': '', 'lat': 'NaN', 'lon': 'NaN'}
    write(os.path.join(OUT, key + '_coordenadas.csv'), ['zona', 'secao', 'bairro', 'lat', 'lon', 'aptos'],
          [[k[0], k[1], g['bairro'], g['lat'], g['lon'], aptos.get(k, 0)] for k in secs for g in [sem if k in FORA_DE_NATAL else geo.get(k)] if g])
    print(key, 'secoes', len(secs), 'sem coordenada', falta, 'sem aptos', [k for k in secs if k not in aptos],
          'top', [(nomes[n], tot[n]) for n in cands[:3]])
