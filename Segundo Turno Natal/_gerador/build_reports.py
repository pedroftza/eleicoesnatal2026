"""Monta os relatórios do 2º turno e o comparativo entre turnos a partir do modelo do 1º turno (index.html).

Uso: python -I build_reports.py <modelo index.html> <pasta de dados> <pasta de saída>
Para cada relatório: <caso>_body.html (textos), <caso>_app.js (gráficos e cálculos) e os CSV de dados.
"""
import os, re, sys

TPL, DADOS, SAIDA = sys.argv[1:4]
AQUI = os.path.dirname(os.path.abspath(__file__))

RELATORIOS = {
    'presidente_t2': dict(
        arquivo='index.html',
        titulo='Natal: Presidente 2º turno 2026 por seção',
        descricao='Votos para presidente e abstenção no 2º turno de 2026 em Natal (RN), seção por seção, com mapas de calor. Dados do TSE.',
        estado=False),
    'governador_t2': dict(
        arquivo='governador.html',
        titulo='Natal: Governador 2º turno 2026 por seção',
        descricao='Votos para governador do RN e abstenção no 2º turno de 2026 em Natal, seção por seção, com mapas de calor. Dados do TSE.',
        estado=True),
    'comparativo': dict(
        arquivo='comparativo.html',
        titulo='Natal: 1º × 2º turno 2026 por seção',
        descricao='Comparação seção por seção entre o 1º e o 2º turno de 2026 em Natal (RN): presidente, governador, abstenção e brancos e nulos, com mapas de calor. Dados do TSE.',
        estado=False, comparativo=True),
}

def ler(p): return open(p, encoding='utf-8').read()

modelo = ler(TPL)
os.makedirs(SAIDA, exist_ok=True)
for caso, cfg in RELATORIOS.items():
    s = modelo
    for bloco in ('secoes', 'votaveis', 'coordenadas'):
        if cfg.get('comparativo'):
            # O comparativo traz bairro e coordenadas no próprio CSV de seções.
            if bloco == 'secoes':
                csv_ = ler(os.path.join(DADOS, 'comparativo_secoes.csv'))
            else:
                s, n = re.subn(rf'<script type="text/plain" id="data-{bloco}">.*?</script>\n', '', s, flags=re.S)
                s = s.replace(f"    DATA.{bloco} = d3.csvParse(raw('{bloco}'));\n", '', 1)
                continue
        else:
            csv_ = ler(os.path.join(DADOS, f'{caso}_{bloco}.csv'))
        s, n = re.subn(rf'(<script type="text/plain" id="data-{bloco}">).*?(</script>)', lambda m: m.group(1) + csv_ + m.group(2), s, flags=re.S)
        assert n == 1, bloco
    if cfg['estado']:
        csv_ = ler(os.path.join(DADOS, f'{caso}_estado.csv'))
        s = s.replace('<script type="text/plain" id="data-contorno">', f'<script type="text/plain" id="data-estado_totais">{csv_}</script>\n<script type="text/plain" id="data-contorno">', 1)
        s = s.replace("    DATA.coordenadas = d3.csvParse(raw('coordenadas'));\n", "    DATA.coordenadas = d3.csvParse(raw('coordenadas'));\n    DATA.estado_totais = d3.csvParse(raw('estado_totais'));\n", 1)
    s = re.sub(r'<title>.*?</title>', lambda m: f'<title>{cfg["titulo"]}</title>', s, count=1)
    s = re.sub(r'<meta name="description" content="[^"]*">', lambda m: f'<meta name="description" content="{cfg["descricao"]}">', s, count=1)
    # Corpo do relatório (cabeçalho, seções e análise) e o script principal.
    i = s.index('<div class="nt">'); j = s.index('\n<script>', i)
    s = s[:i] + ler(os.path.join(AQUI, f'{caso}_body.html')) + s[j:]
    scripts = list(re.finditer(r'<script>(.*?)</script>', s, re.S))
    app = scripts[2]
    s = s[:app.start(1)] + ler(os.path.join(AQUI, f'{caso}_app.js')) + s[app.end(1):]
    i = s.index('<footer class="nt-footer">'); j = s.index('</footer>', i) + len('</footer>')
    s = s[:i] + ler(os.path.join(AQUI, f'{caso}_footer.html')).strip() + s[j:]
    open(os.path.join(SAIDA, cfg['arquivo']), 'w', encoding='utf-8', newline='\n').write(s)
    print(caso, '->', cfg['arquivo'], len(s))
