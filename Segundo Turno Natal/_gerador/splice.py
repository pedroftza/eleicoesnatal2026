"""Substitui o cabeçalho e a seção de análise de <caso>_body.html pelos arquivos <caso>_header.html e <caso>_analise.html."""
import re, sys
caso = sys.argv[1]
b = open(f'{caso}_body.html', encoding='utf-8').read()
h = open(f'{caso}_header.html', encoding='utf-8').read().rstrip('\n')
a = open(f'{caso}_analise.html', encoding='utf-8').read().rstrip('\n')
b, n1 = re.subn(r'  <header class="nt-head" id="topo">.*?</header>', lambda m: h, b, count=1, flags=re.S)
b, n2 = re.subn(r'  <section class="nt-sec nt-analise" id="analise">.*?</section>', lambda m: a, b, count=1, flags=re.S)
assert n1 == n2 == 1
open(f'{caso}_body.html', 'w', encoding='utf-8').write(b)
