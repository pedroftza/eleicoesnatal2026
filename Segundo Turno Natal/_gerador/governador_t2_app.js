
dash.calc('coordenadas_revisadas', {
  title: 'Coordenadas revisadas',
  description: 'Coordenadas do TSE com uma correção: quando cinco ou mais locais de votação com endereços diferentes estão a menos de 60 m uns dos outros, a coordenada é tratada como inválida (em 2026 isso só ocorre com sete escolas de Igapó e N. S. da Apresentação, todas registradas num mesmo ponto do outro lado do rio). Esses locais vão para a mediana das coordenadas válidas do seu bairro, espalhados num círculo de cerca de 250 m, e ficam marcados como posição aproximada.',
  inputs: ['coordenadas', 'secoes'],
  fn: (coordenadas, secoes) => {
    const endOf = new Map(secoes.map((s) => [s.zona + '|' + s.secao, s.endereco]));
    const rows = coordenadas.map((c) => ({ ...c, lat: Number(c.lat), lon: Number(c.lon), endereco: endOf.get(c.zona + '|' + c.secao) }));
    const places = [...new Map(rows.map((r) => [r.endereco, r])).values()];
    const km = (a, b) => Math.hypot((a.lon - b.lon) * 110.8 * Math.cos(5.8 * Math.PI / 180), (a.lat - b.lat) * 110.57);
    const bad = new Set(places.filter((a) => places.filter((b) => km(a, b) < 0.06).length >= 5).map((a) => a.endereco));
    const med = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const ok = rows.filter((r) => !bad.has(r.endereco));
    return rows.map((r) => {
      const { endereco, ...c } = r;
      if (!bad.has(endereco)) return { ...c, aproximada: false };
      const ref = ok.filter((o) => o.bairro === r.bairro);
      const peers = [...new Set(rows.filter((o) => o.bairro === r.bairro && bad.has(o.endereco)).map((o) => o.endereco))];
      const ang = 2 * Math.PI * peers.indexOf(endereco) / peers.length, rad = peers.length > 1 ? 0.0022 : 0;
      return { ...c, lat: med(ref.map((o) => o.lat)) + rad * Math.sin(ang), lon: med(ref.map((o) => o.lon)) + rad * Math.cos(ang), aproximada: true };
    });
  },
});

dash.calc('por_secao', {
  title: 'Resultado por seção',
  description: 'Para cada seção: votos válidos (todos os candidatos, sem brancos e nulos), % de Allyson e de Cadu nos válidos, margem entre os dois em p.p., % de brancos e nulos no total, comparecimento (votos registrados ÷ eleitores aptos) e abstenção (aptos − votos registrados, em % dos aptos), com bairro e coordenadas do local de votação.',
  inputs: ['secoes', 'votaveis', 'coordenadas_revisadas'],
  fn: (secoes, votaveis, coordenadas_revisadas) => {
    const cols = votaveis.filter((t) => t.tipo === 'candidato').map((t) => t.coluna);
    const geo = new Map(coordenadas_revisadas.map((c) => [c.zona + '|' + c.secao, c]));
    return secoes.map((r) => {
      const c = geo.get(r.zona + '|' + r.secao) || {};
      const aptos = Number(c.aptos) || 0;
      const v = (k) => Number(r[k]) || 0;
      const validos = cols.reduce((s, k) => s + v(k), 0);
      const total = validos + v('v95') + v('v96');
      const pl = validos ? v('v44') / validos : 0;
      const pf = validos ? v('v13') / validos : 0;
      return {
        zona: Number(r.zona), secao: Number(r.secao), local: Number(r.local),
        nome_local: r.nome_local, endereco: r.endereco,
        total, validos, allyson: v('v44'), carlos: v('v13'),
        pct_allyson: pl, pct_carlos: pf, margem_pp: (pl - pf) * 100,
        pct_brancos_nulos: total ? (v('v95') + v('v96')) / total : 0,
        bairro: c.bairro || '', lat: Number(c.lat), lon: Number(c.lon), coord_aproximada: !!c.aproximada, aptos,
        comparecimento: aptos ? total / aptos : null,
        pct_abstencao: aptos ? (aptos - total) / aptos : null,
      };
    });
  },
});

dash.calc('resumo', {
  title: 'Totais de Natal',
  description: 'Soma das seções: votos registrados, válidos, % de Allyson e Cadu nos válidos, % de brancos e nulos, e quantas seções cada um liderou.',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const s = (k) => por_secao.reduce((a, r) => a + r[k], 0);
    const total = s('total'), validos = s('validos'), allyson = s('allyson'), carlos = s('carlos'), aptos = s('aptos');
    return [{
      total, validos, allyson, carlos, aptos, pct_comparecimento: total / aptos,
      abstencoes: aptos - total, pct_abstencao: (aptos - total) / aptos,
      pct_allyson: allyson / validos, pct_carlos: carlos / validos,
      pct_brancos_nulos: (total - validos) / total,
      secoes: por_secao.length,
      vence_allyson: por_secao.filter((r) => r.allyson > r.carlos).length,
      vence_carlos: por_secao.filter((r) => r.carlos > r.allyson).length,
      empates: por_secao.filter((r) => r.carlos === r.allyson).length,
    }];
  },
});

dash.calc('totais', {
  title: 'Votos por candidato',
  description: 'Votos de cada candidato, branco e nulo somados nas seções de Natal; % dos válidos para candidatos e % do total registrado para todos.',
  inputs: ['secoes', 'votaveis'],
  fn: (secoes, votaveis) => {
    const sum = (c) => secoes.reduce((a, r) => a + (Number(r[c]) || 0), 0);
    const rows = votaveis.map((t) => ({ numero: Number(t.numero), nome: t.nome, tipo: t.tipo, votos: sum(t.coluna) }));
    const validos = rows.filter((r) => r.tipo === 'candidato').reduce((a, r) => a + r.votos, 0);
    const total = rows.reduce((a, r) => a + r.votos, 0);
    return rows.map((r) => ({ ...r, pct_validos: r.tipo === 'candidato' ? r.votos / validos : null, pct_total: r.votos / total }));
  },
});

dash.calc('por_zona', {
  title: 'Resultado por zona',
  description: 'Soma das seções de cada zona eleitoral: válidos, % de Allyson e Cadu, margem em p.p., seções lideradas por cada um, eleitores aptos, comparecimento (votos registrados) e abstenções (aptos − comparecimento).',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const g = new Map();
    por_secao.forEach((r) => { if (!g.has(r.zona)) g.set(r.zona, []); g.get(r.zona).push(r); });
    const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
    return [...g].map(([zona, rs]) => {
      const validos = sum(rs, 'validos'), l = sum(rs, 'allyson'), f = sum(rs, 'carlos');
      return {
        zona, secoes: rs.length, validos,
        pct_allyson: l / validos, pct_carlos: f / validos, margem_pp: (l - f) / validos * 100,
        vence_allyson: rs.filter((r) => r.allyson > r.carlos).length,
        vence_carlos: rs.filter((r) => r.carlos > r.allyson).length,
        aptos: sum(rs, 'aptos'), comparecimento: sum(rs, 'total'),
        saldo_votos: l - f, pct_brancos_nulos: (sum(rs, 'total') - validos) / sum(rs, 'total'),
        abstencoes: sum(rs, 'aptos') - sum(rs, 'total'),
        pct_abstencao: (sum(rs, 'aptos') - sum(rs, 'total')) / sum(rs, 'aptos'),
      };
    }).sort((a, b) => a.zona - b.zona);
  },
});

dash.calc('por_local', {
  title: 'Resultado por local de votação',
  description: 'Soma das seções de cada local de votação (zona + número do local): válidos, % de Allyson e Cadu, margem em p.p., eleitores aptos, comparecimento e abstenção (em % dos aptos).',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const g = new Map();
    por_secao.forEach((r) => { const k = r.zona + '|' + r.local; if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
    const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
    return [...g.values()].map((rs) => {
      const validos = sum(rs, 'validos'), l = sum(rs, 'allyson'), f = sum(rs, 'carlos');
      const total = sum(rs, 'total'), aptos = sum(rs, 'aptos');
      return {
        zona: rs[0].zona, local: rs[0].local, nome_local: rs[0].nome_local, endereco: rs[0].endereco, bairro: rs[0].bairro,
        lat: sum(rs, 'lat') / rs.length, lon: sum(rs, 'lon') / rs.length, coord_aproximada: rs.some((r) => r.coord_aproximada),
        secoes: rs.length, validos, allyson: l, carlos: f, total, aptos,
        pct_allyson: l / validos, pct_carlos: f / validos, margem_pp: (l - f) / validos * 100,
        comparecimento: aptos ? total / aptos : null,
        pct_abstencao: aptos ? (aptos - total) / aptos : null,
        abstencoes: aptos - total,
      };
    });
  },
});

dash.calc('por_bairro', {
  title: 'Resultado por bairro',
  description: 'Soma das seções cujos locais de votação ficam em cada bairro (cadastro do TSE): válidos, % de Allyson e Cadu, margem em p.p., comparecimento, abstenções (número e % dos aptos), parte do total de ausentes da cidade, ausentes acima ou abaixo do esperado pela taxa média da cidade e posição no ranking de ausentes.',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const g = new Map();
    // A seção da unidade prisional (zona 1, seção 642) fica em Parnamirim e não tem bairro de Natal: entra nos totais, não nos bairros.
    por_secao.filter((r) => r.bairro).forEach((r) => { if (!g.has(r.bairro)) g.set(r.bairro, []); g.get(r.bairro).push(r); });
    const sum = (rs, k) => rs.reduce((a, r) => a + r[k], 0);
    const rows = [...g].map(([bairro, rs]) => {
      const validos = sum(rs, 'validos'), l = sum(rs, 'allyson'), f = sum(rs, 'carlos');
      return {
        bairro, zonas: [...new Set(rs.map((r) => r.zona))].sort((a, b) => a - b).join(', '),
        secoes: rs.length, validos,
        pct_allyson: l / validos, pct_carlos: f / validos, margem_pp: (l - f) / validos * 100,
        comparecimento: sum(rs, 'total') / sum(rs, 'aptos'),
        aptos: sum(rs, 'aptos'), saldo_votos: l - f,
        abstencoes: sum(rs, 'aptos') - sum(rs, 'total'),
        pct_abstencao: (sum(rs, 'aptos') - sum(rs, 'total')) / sum(rs, 'aptos'),
      };
    });
    // Peso de cada bairro no total de ausentes, ausentes acima/abaixo do esperado pela taxa média da cidade, e posição no ranking absoluto.
    const aptosCidade = sum(por_secao, 'aptos'), abstCidade = aptosCidade - sum(por_secao, 'total'), taxa = abstCidade / aptosCidade;
    const ordem = rows.slice().sort((a, b) => b.abstencoes - a.abstencoes).map((r) => r.bairro);
    return rows.map((r) => ({ ...r, pct_do_total_abst: r.abstencoes / abstCidade, abst_vs_media: r.abstencoes - r.aptos * taxa, posicao_abstencoes: ordem.indexOf(r.bairro) + 1 }));
  },
});


dash.calc('estado', {
  title: 'Resultado no estado',
  description: 'Votos de cada candidato a governador em todo o Rio Grande do Norte e % dos válidos.',
  inputs: ['estado_totais'],
  fn: (estado_totais) => {
    const rows = estado_totais.map((r) => ({ numero: Number(r.numero), nome: r.nome, votos: Number(r.votos) }));
    const validos = rows.filter((r) => r.numero !== 95 && r.numero !== 96).reduce((a, r) => a + r.votos, 0);
    return rows.map((r) => ({ ...r, pct_validos: r.numero === 95 || r.numero === 96 ? null : r.votos / validos }));
  },
});

dash.calc('analise', {
  title: 'Números da análise',
  description: 'Valores citados no texto da análise: abstenção e saldo de votos da Zona Norte (bairros ao norte do rio), peso dos 5 bairros com mais ausentes, diferença de votos, quartis da margem e da abstenção por seção, contagens de seções muito favoráveis a cada candidato, abstenção por faixa de margem, correlações (Pearson) entre abstenção, margem e brancos/nulos, a parte da vantagem de Allyson vinda das zonas 69 e 2, e a comparação com o resultado no estado.',
  inputs: ['por_secao', 'por_bairro', 'por_zona', 'resumo', 'estado'],
  fn: (por_secao, por_bairro, por_zona, resumo, estado) => {
    const r = resumo[0];
    const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
    const corr = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };
    const grp = (f) => { const rs = por_secao.filter(f), a = rs.reduce((s, x) => s + x.aptos, 0), t = rs.reduce((s, x) => s + x.total, 0); return (a - t) / a; };
    const m = por_secao.map((s) => s.margem_pp), ab = por_secao.map((s) => s.pct_abstencao);
    const saldo = (z) => (por_zona.find((x) => x.zona === z) || {}).saldo_votos || 0;
    return [{
      dif_votos: r.allyson - r.carlos, margem_pp: (r.pct_allyson - r.pct_carlos) * 100,
      margem_mediana: q(m, 0.5), margem_q25: q(m, 0.25), margem_q75: q(m, 0.75),
      secoes_allyson_60: por_secao.filter((s) => s.pct_allyson > 0.6).length, secoes_carlos_60: por_secao.filter((s) => s.pct_carlos > 0.6).length,
      abst_q25: q(ab, 0.25), abst_q75: q(ab, 0.75), abst_min: Math.min(...ab), abst_max: Math.max(...ab),
      abst_g_carlos5: grp((s) => s.margem_pp <= -5), abst_g_equilibrio: grp((s) => s.margem_pp > -5 && s.margem_pp <= 5),
      abst_g_allyson5_15: grp((s) => s.margem_pp > 5 && s.margem_pp <= 15), abst_g_allyson15: grp((s) => s.margem_pp > 15),
      corr_secao: corr(ab, m), corr_bairro: corr(por_bairro.map((b) => b.pct_abstencao), por_bairro.map((b) => b.margem_pp)),
      corr_abst_bn: corr(ab, por_secao.map((s) => s.pct_brancos_nulos)),
      share_saldo_69_2: (saldo(69) + saldo(2)) / (r.allyson - r.carlos),
      ...(() => {
        const est = (n) => (estado.find((e) => e.numero === n) || {}).pct_validos;
        const estValidos = estado.filter((e) => e.numero !== 95 && e.numero !== 96).reduce((a, e) => a + e.votos, 0);
        return { dif_estado_44: (r.pct_allyson - est(44)) * 100, dif_estado_13: (r.pct_carlos - est(13)) * 100, natal_parte_estado: r.validos / estValidos };
      })(),
      ...(() => {
        // Zona Norte de Natal: bairros ao norte do rio Potengi (Salinas não tem local de votação).
        const norte = ['IGAPO', 'LAGOA AZUL', 'N.S.DA APRESENTAÇÃO', 'PAJUCARA', 'POTENGI', 'REDINHA'];
        const nb = por_bairro.filter((b) => norte.includes(b.bairro));
        const ab = nb.reduce((s, b) => s + b.abstencoes, 0), ap = nb.reduce((s, b) => s + b.aptos, 0), sd = nb.reduce((s, b) => s + b.saldo_votos, 0);
        const top5 = por_bairro.slice().sort((a, b) => b.abstencoes - a.abstencoes).slice(0, 5).reduce((s, b) => s + b.abstencoes, 0);
        return { norte_abstencoes: ab, norte_pct_abstencao: ab / ap, norte_parte_abst: ab / r.abstencoes, norte_parte_aptos: ap / r.aptos, norte_saldo: sd, norte_parte_saldo: sd / (r.allyson - r.carlos), top5_parte_abst: top5 / r.abstencoes, n_bairros: por_bairro.length };
      })(),
    }];
  },
});

/* ---------- formatting ---------- */
const nf = new Intl.NumberFormat('pt-BR');
const pf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v == null || isNaN(v)) ? '—' : pf1.format(v * 100) + '%';
const pct2 = (v) => (v == null || isNaN(v)) ? '—' : pf2.format(v * 100) + '%';
const pp = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + pf1.format(Math.abs(v)) + ' p.p.';
const C = () => ({ allyson: '#1E9E62', carlos: '#D7332F' }); /* Allyson verde, Cadu vermelho, como no relatório do 1º turno: tons médios legíveis no tema claro e no escuro */
const sideColor = (m) => (m < 0 ? C().carlos : C().allyson);
// Cor por faixa de margem: forte = vitória por 10 p.p. ou mais; fraca = vitória por menos de 10 p.p.
const MARGEM_FORTE = 10;
const MCLASS = [
  { cor: '#0B6E3E', rotulo: 'Allyson +10 p.p. ou mais', ok: (m) => m >= MARGEM_FORTE },
  { cor: '#9EDDBB', rotulo: 'Allyson por menos de 10 p.p.', ok: (m) => m > 0 },
  { cor: '#BDBDBD', rotulo: 'Empate', ok: (m) => m === 0 },
  { cor: '#F2A09A', rotulo: 'Cadu por menos de 10 p.p.', ok: (m) => m > -MARGEM_FORTE },
  { cor: '#B3191A', rotulo: 'Cadu +10 p.p. ou mais', ok: () => true },
];
const marginColor = (m) => MCLASS.find((c) => c.ok(m)).cor;

window.ntFormat = { nf, pct, pct2, pp };

/* swatches */
const paintSwatches = () => document.querySelectorAll('.nt-sw[data-c]').forEach((el) => { el.style.background = el.dataset.c === '1' ? C().carlos : C().allyson; });

/* shared tooltip helper */
const tipFor = (box) => {
  let t = box.querySelector('.nt-tip');
  if (!t) { t = document.createElement('div'); t.className = 'nt-tip'; t.hidden = true; box.appendChild(t); }
  return {
    show(lines, x, y) {
      t.replaceChildren(...lines.map((l, i) => { const d = document.createElement('div'); if (i === 0) d.className = 't1'; d.textContent = l; return d; }));
      t.hidden = false;
      const bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight;
      let left = x + 12; if (left + tw > bw) left = Math.max(0, x - tw - 12);
      let top = y - th - 8; if (top < 0) top = y + 12;
      t.style.left = left + 'px'; t.style.top = top + 'px';
    },
    hide() { t.hidden = true; },
  };
};

const failLine = (el) => { el.replaceChildren(); const d = document.createElement('div'); d.className = 'nt-fail'; d.textContent = 'Falha ao carregar'; el.appendChild(d); };

/* ---------- headline marks ---------- */
const fillResumo = () => {
  const r = dash.data('resumo');
  document.querySelectorAll('[data-source="resumo"]').forEach((el) => {
    if (r.status !== 'ok' || !r.data.length) { el.textContent = '—'; if (r.status === 'error') el.classList.remove('dash-skeleton'); return; }
    el.classList.remove('dash-skeleton');
    const v = r.data[0][el.dataset.field];
    el.textContent = el.dataset.field.startsWith('pct') ? pct(v) : nf.format(v);
  });
};

/* ---------- candidates (HTML bars) ---------- */
const drawCand = () => {
  const el = document.getElementById('ch-cand');
  const s = dash.data('totais');
  if (s.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); return; }
  if (s.status !== 'ok') { el.replaceChildren(); return; }
  el.classList.remove('dash-skeleton');
  const rows = s.data.filter((r) => r.tipo === 'candidato').sort((a, b) => b.votos - a.votos);
  const max = d3.max(rows, (r) => r.pct_validos);
  const wrap = document.createElement('div'); wrap.className = 'nt-bars';
  rows.forEach((r) => {
    const row = document.createElement('div'); row.className = 'nt-bar-row';
    const top = document.createElement('div'); top.className = 'nt-bar-top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.numero + ' · ' + r.nome;
    const vl = document.createElement('span'); vl.className = 'vl';
    const b = document.createElement('b'); b.textContent = pct2(r.pct_validos);
    vl.append(b, document.createTextNode(' · ' + nf.format(r.votos)));
    top.append(nm, vl);
    const tr = document.createElement('div'); tr.className = 'nt-bar-track';
    const fill = document.createElement('div'); fill.className = 'nt-bar-fill';
    fill.style.width = Math.max(0.4, r.pct_validos / max * 100) + '%';
    fill.style.background = r.numero === 44 ? C().allyson : r.numero === 13 ? C().carlos : 'var(--cds-chart-muted)';
    tr.appendChild(fill); row.append(top, tr); wrap.appendChild(row);
  });
  const bn = document.createElement('div'); bn.className = 'nt-bn';
  s.data.filter((r) => r.tipo !== 'candidato').forEach((r) => {
    const sp = document.createElement('span');
    sp.textContent = (r.tipo === 'branco' ? 'Brancos: ' : 'Nulos: ') + nf.format(r.votos) + ' (' + pct(r.pct_total) + ' do total)';
    bn.appendChild(sp);
  });
  el.replaceChildren(wrap, bn);
};

/* ---------- Natal x RN ---------- */
const CANDS = [
  { num: 44, curto: 'Allyson Bezerra', cor: C().allyson },
  { num: 13, curto: 'Cadu', cor: C().carlos },
];
const drawEstado = () => {
  const el = document.getElementById('ch-estado');
  const n = dash.data('totais'), e = dash.data('estado');
  if (n.status === 'error' || e.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); return; }
  if (n.status !== 'ok' || e.status !== 'ok') { el.replaceChildren(); return; }
  el.classList.remove('dash-skeleton');
  const wrap = document.createElement('div'); wrap.className = 'nt-bars';
  const max = Math.max(...CANDS.map((c) => Math.max((n.data.find((r) => r.numero === c.num) || {}).pct_validos || 0, (e.data.find((r) => r.numero === c.num) || {}).pct_validos || 0)));
  CANDS.forEach((c) => {
    const pn = (n.data.find((r) => r.numero === c.num) || {}).pct_validos, pe = (e.data.find((r) => r.numero === c.num) || {}).pct_validos;
    const row = document.createElement('div'); row.className = 'nt-bar-row';
    const top = document.createElement('div'); top.className = 'nt-bar-top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = c.num + ' · ' + c.curto;
    const vl = document.createElement('span'); vl.className = 'vl';
    const b = document.createElement('b'); b.textContent = 'Natal ' + pct(pn);
    vl.append(b, document.createTextNode(' · RN ' + pct(pe)));
    top.append(nm, vl);
    const mk = (v, op) => { const tr = document.createElement('div'); tr.className = 'nt-bar-track'; const f = document.createElement('div'); f.className = 'nt-bar-fill'; f.style.width = (v / max * 100) + '%'; f.style.background = c.cor; f.style.opacity = op; tr.appendChild(f); return tr; };
    row.append(top, mk(pn, 1), mk(pe, 0.45)); wrap.appendChild(row);
  });
  const leg = document.createElement('div'); leg.className = 'nt-bn';
  const s1 = document.createElement('span'); s1.textContent = 'Barra cheia: Natal · barra clara: Rio Grande do Norte inteiro';
  leg.appendChild(s1);
  el.replaceChildren(wrap, leg);
};

/* ---------- histogram ---------- */
const drawHist = () => {
  const el = document.getElementById('ch-hist');
  el.querySelectorAll('.nt-tip').forEach((n) => { n.hidden = true; });
  const s = dash.data('por_secao');
  if (s.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); return; }
  if (s.status !== 'ok') { el.replaceChildren(); return; }
  el.classList.remove('dash-skeleton');
  const W = Math.max(280, el.clientWidth), H = 260, step = 5;
  const lo = Math.floor(d3.min(s.data, (r) => r.margem_pp) / step) * step;
  const hi = (Math.floor(d3.max(s.data, (r) => r.margem_pp) / step) + 1) * step;
  const bins = d3.range(lo, hi, step).map((x0) => ({ x0, x1: x0 + step, n: 0 }));
  s.data.forEach((r) => { const i = Math.floor((r.margem_pp - lo) / step); if (bins[i]) bins[i].n++; });
  const ymax = d3.max(bins, (b) => b.n);
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Histograma da margem Allyson menos Cadu por seção');
  // measure y labels
  const yTicks = d3.ticks(0, ymax, 4);
  const probe = svg.append('text').attr('font-size', 11).text(nf.format(yTicks[yTicks.length - 1]));
  el.appendChild(svg.node());
  const yw = probe.node().getComputedTextLength() || 24; probe.remove(); svg.node().remove();
  const m = { t: 22, r: 8, b: 26, l: Math.ceil(yw) + 10 };
  const x = d3.scaleLinear([lo, hi], [m.l, W - m.r]);
  const y = d3.scaleLinear([0, ymax], [H - m.b, m.t]);
  const g = svg.append('g');
  g.selectAll('line.gr').data(yTicks).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  g.selectAll('text.yt').data(yTicks).join('text').attr('x', m.l - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => nf.format(d));
  const tip = tipFor(el);
  g.selectAll('rect').data(bins).join('rect')
    .attr('x', (b) => x(b.x0) + 1).attr('width', (b) => Math.max(1, x(b.x1) - x(b.x0) - 2))
    .attr('y', (b) => y(b.n)).attr('height', (b) => y(0) - y(b.n)).attr('rx', 3)
    .attr('fill', (b) => (b.x0 < 0 ? C().carlos : C().allyson))
    .on('mousemove', (ev, b) => {
      const [px, py] = d3.pointer(ev, el);
      const label = b.x0 < 0 ? `Cadu à frente por ${pf1.format(-b.x1)} a ${pf1.format(-b.x0)} p.p.` : `Allyson à frente por ${pf1.format(b.x0)} a ${pf1.format(b.x1)} p.p.`;
      tip.show([label, nf.format(b.n) + (b.n === 1 ? ' seção' : ' seções')], px, py);
    })
    .on('mouseleave', () => tip.hide());
  g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', m.t - 6).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '3 3');
  g.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
  const every = W < 420 ? 20 : 10;
  const xt = d3.range(Math.ceil(lo / every) * every, hi + 0.001, every);
  g.selectAll('text.xt').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d));
  g.append('text').attr('x', x(0) - 6).attr('y', 12).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text('← Cadu');
  g.append('text').attr('x', x(0) + 6).attr('y', 12).attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text('Allyson →');
  el.querySelectorAll('svg').forEach((n) => n.remove());
  el.prepend(svg.node());
};

/* ---------- strip plot ---------- */
const drawStrip = () => {
  const el = document.getElementById('ch-strip');
  el.querySelectorAll('.nt-tip').forEach((n) => { n.hidden = true; });
  const s = dash.data('por_secao');
  if (s.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); return; }
  if (s.status !== 'ok') { el.replaceChildren(); return; }
  el.classList.remove('dash-skeleton');
  const zonas = [...new Set(s.data.map((r) => r.zona))].sort((a, b) => a - b);
  const W = Math.max(280, el.clientWidth), rowH = 52, m = { t: 8, r: 10, b: 26, l: 64 };
  const H = m.t + zonas.length * rowH + m.b;
  const ext = d3.extent(s.data, (r) => r.margem_pp);
  const x = d3.scaleLinear([Math.floor(ext[0] / 10) * 10, Math.ceil(ext[1] / 10) * 10], [m.l, W - m.r]);
  const y = d3.scaleBand(zonas, [m.t, m.t + zonas.length * rowH]).padding(0.12);
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Margem de cada seção por zona eleitoral');
  const every = W < 420 ? 20 : 10;
  const xt = d3.range(x.domain()[0], x.domain()[1] + 0.001, every);
  svg.append('g').selectAll('line').data(xt).join('line').attr('x1', x).attr('x2', x).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', (d) => (d === 0 ? 'var(--cds-chart-reference)' : 'var(--cds-chart-grid)')).attr('stroke-dasharray', (d) => (d === 0 ? '3 3' : null));
  svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 8).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((d) => (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d));
  const byZ = d3.group(s.data, (r) => r.zona);
  svg.append('g').selectAll('text').data(zonas).join('text').attr('x', 0).attr('y', (z) => y(z) + y.bandwidth() / 2 + 4).attr('font-size', 12).attr('fill', 'var(--color-fg)').text((z) => 'Zona ' + z);
  // deterministic jitter
  const jit = (r) => { const h = Math.sin(r.zona * 9301 + r.secao * 49297) * 233280; return h - Math.floor(h); };
  const tip = tipFor(el);
  svg.append('g').selectAll('circle').data(s.data).join('circle')
    .attr('cx', (r) => x(r.margem_pp))
    .attr('cy', (r) => y(r.zona) + 4 + jit(r) * (y.bandwidth() - 8))
    .attr('r', W < 420 ? 2 : 2.6)
    .attr('fill', (r) => marginColor(r.margem_pp)).attr('fill-opacity', 0.85)
    .on('mouseenter', function (ev, r) {
      d3.select(this).attr('fill-opacity', 1).attr('r', 5);
      const [px, py] = d3.pointer(ev, el);
      tip.show([`Zona ${r.zona} · Seção ${r.secao}`, r.nome_local, `Allyson ${pct(r.pct_allyson)} · Cadu ${pct(r.pct_carlos)}`, `Margem ${pp(r.margem_pp)} · ${nf.format(r.validos)} válidos`], px, py);
    })
    .on('mouseleave', function () { d3.select(this).attr('fill-opacity', 0.85).attr('r', W < 420 ? 2 : 2.6); tip.hide(); });
  svg.append('g').selectAll('line').data(zonas).join('line')
    .attr('x1', (z) => x(d3.median(byZ.get(z), (r) => r.margem_pp))).attr('x2', (z) => x(d3.median(byZ.get(z), (r) => r.margem_pp)))
    .attr('y1', (z) => y(z) - 2).attr('y2', (z) => y(z) + y.bandwidth() + 2)
    .attr('stroke', 'var(--color-fg)').attr('stroke-width', 2.5).attr('stroke-linecap', 'round').attr('pointer-events', 'none');
  el.querySelectorAll('svg').forEach((n) => n.remove());
  el.prepend(svg.node());
};

/* ---------- sortable tables ---------- */
const tableState = {};
const setupSort = (id, def) => {
  if (tableState[id]) return tableState[id];
  const st = tableState[id] = { key: def.key, dir: def.dir };
  const tbl = document.getElementById(id);
  tbl.querySelectorAll('th').forEach((th) => {
    th.querySelector('button').addEventListener('click', () => {
      const k = th.dataset.field;
      if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.key = k; st.dir = typeof def.textCols !== 'undefined' && def.textCols.includes(k) ? 'asc' : 'desc'; }
      st.render && st.render();
    });
  });
  return st;
};
const markSort = (tbl, st) => tbl.querySelectorAll('th').forEach((th) => {
  if (th.dataset.field === st.key) th.setAttribute('aria-sort', st.dir === 'asc' ? 'ascending' : 'descending'); else th.removeAttribute('aria-sort');
});
const sortRows = (rows, st) => {
  const k = st.key, f = st.dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const va = a[k], vb = b[k];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * f || (a.zona - b.zona) || ((a.secao ?? a.local) - (b.secao ?? b.local));
    return String(va).localeCompare(String(vb), 'pt-BR') * f;
  });
};
const td = (text, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text; return c; };
const marginCell = (m, scale) => {
  const c = document.createElement('td'); c.className = 'num';
  const w = document.createElement('span'); w.className = 'nt-mg';
  const bar = document.createElement('i'); bar.style.width = Math.max(2, Math.abs(m) * scale) + 'px'; bar.style.background = sideColor(m);
  const t = document.createElement('span'); t.textContent = pp(m).replace(' p.p.', '');
  const u = document.createElement('span'); u.className = 'nt-u'; u.textContent = ' p.p.'; t.appendChild(u);
  w.append(t); if (scale) w.append(bar); c.appendChild(w); return c;
};

const drawZona = () => {
  const tbl = document.getElementById('tb-zona'); const body = tbl.querySelector('tbody');
  const s = dash.data('por_zona');
  const st = setupSort('tb-zona', { key: 'zona', dir: 'asc' });
  st.render = () => {
    markSort(tbl, st);
    if (s.status !== 'ok') { body.replaceChildren(); return; }
    body.replaceChildren(...sortRows(s.data, st).map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = String(r.zona);
      tr.append(td(String(r.zona)), td(nf.format(r.secoes), 'num'), td(nf.format(r.validos), 'num'), td(pct(r.pct_allyson), 'num'), td(pct(r.pct_carlos), 'num'), marginCell(r.margem_pp, 3), td(nf.format(r.vence_allyson), 'num nt-hide-sm'), td(nf.format(r.vence_carlos), 'num nt-hide-sm'));
      return tr;
    }));
  };
  st.render();
};

const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const drawLocal = () => {
  const tbl = document.getElementById('tb-local'); const body = tbl.querySelector('tbody');
  const q = document.getElementById('q-local'); const n = document.getElementById('n-local');
  const st = setupSort('tb-local', { key: 'margem_pp', dir: 'asc', textCols: ['nome_local'] });
  if (!st.bound) { q.addEventListener('input', () => st.render()); st.bound = true; }
  st.render = () => {
    markSort(tbl, st);
    const s = dash.data('por_local');
    if (s.status !== 'ok') { body.replaceChildren(); n.textContent = ''; return; }
    const term = norm(q.value.trim());
    const rows = term ? s.data.filter((r) => norm(`zona ${r.zona} ${r.nome_local} ${r.bairro} ${r.endereco}`).includes(term)) : s.data;
    n.textContent = nf.format(rows.length) + ' de ' + nf.format(s.data.length) + ' locais';
    body.replaceChildren(...sortRows(rows, st).map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.zona + ',' + r.local;
      const name = document.createElement('td'); name.className = 'txt';
      const a = document.createElement('span'); a.textContent = r.nome_local;
      const b = document.createElement('span'); b.className = 'addr'; b.textContent = r.bairro + ' · ' + r.endereco;
      name.append(a, b);
      tr.append(td(String(r.zona)), td(String(r.local), 'nt-hide-sm'), name, td(nf.format(r.secoes), 'num nt-hide-sm'), td(nf.format(r.validos), 'num nt-hide-sm'), td(pct(r.pct_allyson), 'num'), td(pct(r.pct_carlos), 'num'), marginCell(r.margem_pp, 0.6), td(pct(r.pct_abstencao), 'num nt-hide-sm'));
      return tr;
    }));
  };
  st.render();
};

const drawSecao = () => {
  const tbl = document.getElementById('tb-secao'); const body = tbl.querySelector('tbody');
  const q = document.getElementById('q-secao'); const z = document.getElementById('z-secao'); const n = document.getElementById('n-secao');
  const st = setupSort('tb-secao', { key: 'zona', dir: 'asc', textCols: ['nome_local'] });
  const s = dash.data('por_secao');
  if (!st.bound) {
    q.addEventListener('input', () => st.render());
    z.addEventListener('change', () => st.render());
    st.bound = true;
  }
  if (s.status === 'ok' && z.options.length === 0) {
    z.append(new Option('Todas as zonas', ''), ...[...new Set(s.data.map((r) => r.zona))].sort((a, b) => a - b).map((zz) => new Option('Zona ' + zz, String(zz))));
  }
  st.render = () => {
    markSort(tbl, st);
    const s2 = dash.data('por_secao');
    if (s2.status !== 'ok') { body.replaceChildren(); n.textContent = ''; return; }
    const term = norm(q.value.trim()); const zz = z.value;
    let rows = s2.data;
    if (zz) rows = rows.filter((r) => String(r.zona) === zz);
    if (term) rows = rows.filter((r) => norm(`${r.secao} ${r.nome_local} ${r.bairro} ${r.endereco}`).includes(term));
    n.textContent = nf.format(rows.length) + ' de ' + nf.format(s2.data.length) + ' seções';
    body.replaceChildren(...sortRows(rows, st).map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.zona + ',' + r.secao;
      const name = document.createElement('td'); name.className = 'txt';
      const a = document.createElement('span'); a.textContent = r.nome_local;
      const b = document.createElement('span'); b.className = 'addr'; b.textContent = r.bairro;
      name.append(a, b);
      tr.append(td(String(r.zona), 'nt-hide-sm'), td(String(r.secao)), name, td(nf.format(r.validos), 'num nt-hide-sm'), td(pct(r.pct_allyson), 'num'), td(pct(r.pct_carlos), 'num'), marginCell(r.margem_pp, 0.6), td(pct(r.pct_brancos_nulos), 'num nt-hide-sm'), td(pct(r.pct_abstencao), 'num nt-hide-sm'));
      return tr;
    }));
  };
  st.render();
};

/* ---------- abstention ---------- */
const drawAbst = () => {
  const el = document.getElementById('ch-abst');
  const z = dash.data('por_zona'), r = dash.data('resumo');
  if (z.status === 'error' || r.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); return; }
  if (z.status !== 'ok' || r.status !== 'ok') { el.replaceChildren(); return; }
  el.classList.remove('dash-skeleton');
  const avg = r.data[0].pct_abstencao;
  const max = Math.max(avg, ...z.data.map((d) => d.pct_abstencao)) * 1.15;
  const wrap = document.createElement('div'); wrap.className = 'nt-bars';
  z.data.slice().sort((a, b) => b.pct_abstencao - a.pct_abstencao).forEach((d) => {
    const row = document.createElement('div'); row.className = 'nt-bar-row';
    const top = document.createElement('div'); top.className = 'nt-bar-top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = 'Zona ' + d.zona;
    const vl = document.createElement('span'); vl.className = 'vl';
    const b = document.createElement('b'); b.textContent = pct(d.pct_abstencao);
    vl.append(b, document.createTextNode(' · ' + nf.format(d.abstencoes) + ' de ' + nf.format(d.aptos)));
    top.append(nm, vl);
    const tr = document.createElement('div'); tr.className = 'nt-bar-track'; tr.style.position = 'relative'; tr.style.overflow = 'visible';
    const fill = document.createElement('div'); fill.className = 'nt-bar-fill';
    fill.style.width = (d.pct_abstencao / max * 100) + '%';
    fill.style.background = d.pct_abstencao > avg ? 'var(--color-fg-muted)' : 'var(--cds-chart-muted)';
    const tick = document.createElement('div');
    tick.style.cssText = `position:absolute;top:-3px;bottom:-3px;width:2px;border-radius:1px;background:var(--color-fg);left:calc(${avg / max * 100}% - 1px)`;
    tr.append(fill, tick); row.append(top, tr); wrap.appendChild(row);
  });
  const foot = document.createElement('div'); foot.className = 'nt-bn';
  const s = document.createElement('span'); s.textContent = `Natal: ${pct(avg)} de abstenção (${nf.format(r.data[0].abstencoes)} de ${nf.format(r.data[0].aptos)} aptos). Barras mais escuras: acima da média.`;
  foot.appendChild(s);
  el.replaceChildren(wrap, foot);
};
const drawAbstTable = () => {
  const tbl = document.getElementById('tb-abst'); const body = tbl.querySelector('tbody');
  const st = setupSort('tb-abst', { key: 'zona', dir: 'asc' });
  st.render = () => {
    markSort(tbl, st);
    const s = dash.data('por_zona');
    if (s.status !== 'ok') { body.replaceChildren(); return; }
    body.replaceChildren(...sortRows(s.data, st).map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = String(r.zona);
      tr.append(td(String(r.zona)), td(nf.format(r.aptos), 'num'), td(nf.format(r.comparecimento), 'num nt-hide-sm'), td(nf.format(r.abstencoes), 'num'), td(pct(r.pct_abstencao), 'num'));
      return tr;
    }));
  };
  st.render();
};

/* ---------- bairro tables ---------- */
const drawBairroTable = (id, def, cells) => {
  const tbl = document.getElementById(id); const body = tbl.querySelector('tbody');
  const st = setupSort(id, def);
  st.render = () => {
    markSort(tbl, st);
    const s = dash.data('por_bairro');
    if (s.status !== 'ok') { body.replaceChildren(); return; }
    body.replaceChildren(...sortRows(s.data, st).map((r) => {
      const tr = document.createElement('tr'); tr.dataset.key = r.bairro;
      tr.append(...cells(r));
      return tr;
    }));
  };
  st.render();
};
const drawBairro = () => {
  drawBairroTable('tb-bairro-v', { key: 'margem_pp', dir: 'asc', textCols: ['bairro', 'zonas'] },
    (r) => [td(r.bairro, 'txt'), td(r.zonas, 'nt-hide-sm'), td(nf.format(r.secoes), 'num nt-hide-sm'), td(pct(r.pct_allyson), 'num'), td(pct(r.pct_carlos), 'num'), marginCell(r.margem_pp, 0.6)]);
  drawBairroTable('tb-bairro-a', { key: 'pct_abstencao', dir: 'desc', textCols: ['bairro', 'zonas'] },
    (r) => [td(r.bairro, 'txt'), td(r.zonas, 'nt-hide-sm'), td(nf.format(r.aptos), 'num'), td(nf.format(r.abstencoes), 'num'), td(pct(r.pct_abstencao), 'num')]);
};

/* ---------- map ---------- */
const ZPAL = { 1: '#8C6BB1', 2: '#D08C1F', 3: '#2A9D8F', 4: '#7A8F2E', 69: '#C25B86' };
const zcol = (z) => ZPAL[z] || '#888888';
const MAPS = {
  v: { kind: 'votos', state: { metric: 'margem', zonas: true, pts: true } },
  a: { kind: 'abst', state: { metric: 'abst', zonas: true, pts: true } },
};
const METRICS = {
  margem: { num: (r) => r.allyson - r.carlos, den: (r) => r.validos, kind: 'div', dom: 0.3 },
  abst: { num: (r) => r.aptos - r.total, den: (r) => r.aptos, kind: 'seq', end: 'abst', lo: 0.12, mid: 0.165, hi: 0.21 },
  zona: { kind: 'cat' },
};
const pxCanvas = document.createElement('canvas'); pxCanvas.width = pxCanvas.height = 1;
const toRGB = (css) => {
  const c = pxCanvas.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = css; c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`;
};
const tokenRGB = (host, name) => {
  const probe = document.createElement('span'); probe.style.color = `var(${name})`; probe.hidden = false; probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
  host.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return toRGB(c);
};
const makeColor = (m, mid) => {
  const ends = { allyson: '#1E9E62', carlos: '#D7332F', abst: '#1F8A70' };
  const cache = new Map();
  if (m.kind === 'div') {
    const toL = d3.interpolateRgb(mid, ends.allyson), toF = d3.interpolateRgb(mid, ends.carlos);
    return (v) => { const t = Math.max(-1, Math.min(1, v / m.dom)); const k = Math.round(t * 100); if (!cache.has(k)) cache.set(k, k >= 0 ? toL(Math.pow(k / 100, 0.85)) : toF(Math.pow(-k / 100, 0.85))); return cache.get(k); };
  }
  if (m.end === 'abst') {
    // Degradê de quatro paradas, do quase branco ao verde quase preto (invertido no tema escuro).
    const stops = d3.hsl(mid).l < 0.5 ? ['#000A07', '#0A4A36', '#2FA57B', '#A6EFD2', '#FFFFFF'] : ['#FFFFFF', '#B9EAD6', '#2FA57B', '#0A4A36', '#000A07'];
    const seg = stops.slice(1).map((c, i) => d3.interpolateRgb(stops[i], c));
    // Contraste extra: afasta os valores do meio em direção às pontas do degradê.
    const push = (t) => 0.5 + 0.5 * Math.sign(2 * t - 1) * Math.pow(Math.abs(2 * t - 1), 0.6);
    const g = (t) => { const x = Math.min(0.9999, push(t)) * seg.length, i = Math.floor(x); return seg[i](x - i); };
    const pos = (v) => (v <= m.mid ? 0.5 * (v - m.lo) / (m.mid - m.lo) : 0.5 + 0.5 * (v - m.mid) / (m.hi - m.mid));
    return (v) => { const t = Math.max(0, Math.min(1, pos(v))); const k = Math.round(t * 100); if (!cache.has(k)) cache.set(k, g(k / 100)); return cache.get(k); };
  }
  const f = d3.interpolateRgb(mid, ends[m.end]);
  return (v) => { const t = Math.max(0, Math.min(1, (v - m.lo) / (m.hi - m.lo))); const k = Math.round(t * 100); if (!cache.has(k)) cache.set(k, f(0.08 + 0.92 * k / 100)); return cache.get(k); };
};
// Cor única dos locais de votação: amarelo com contorno escuro, visível sobre verde, vermelho, azul e branco.
const PT_FILL = '#FFC928', PT_LINE = '#1A1A1A';
const pointItem = () => {
  const s = document.createElement('span'); s.className = 'nt-legend-water';
  const i = document.createElement('i'); i.style.cssText = `width:.7rem;height:.7rem;border-radius:50%;background:${PT_FILL};border:1px solid ${PT_LINE}`;
  s.append(i, document.createTextNode('Local de votação')); return s;
};
const waterItem = (fill, line) => {
  const s = document.createElement('span'); s.className = 'nt-legend-water';
  const i = document.createElement('i'); i.style.background = `repeating-linear-gradient(135deg, ${fill} 0 3px, ${line} 3px 4px)`;
  s.append(i, document.createTextNode('Rio Potengi (traçado do OpenStreetMap)')); return s;
};
const marginItems = () => MCLASS.map((c) => {
  const s = document.createElement('span'); s.className = 'nt-legend-water';
  const i = document.createElement('i'); i.style.cssText = `width:.7rem;height:.7rem;border-radius:50%;background:${c.cor};border:1px solid ${PT_LINE}`;
  s.append(i, document.createTextNode(c.rotulo)); return s;
});
const drawLegend = (el, m, color, water, votos) => {
  const dots = () => (votos ? marginItems() : [pointItem()]);
  if (m.kind === 'cat') {
    const wrap = document.createElement('div'); wrap.className = 'nt-legend-cat';
    Object.keys(ZPAL).forEach((z) => { const s = document.createElement('span'); const sw = document.createElement('span'); sw.className = 'nt-sw'; sw.style.background = ZPAL[z]; s.append(sw, document.createTextNode('Zona ' + z)); wrap.appendChild(s); });
    if (water) wrap.appendChild(waterItem(water.fill, water.line));
    wrap.append(...dots());
    el.replaceChildren(wrap); return;
  }
  const wrap = document.createElement('div'); wrap.className = 'nt-legend-ramp';
  const bar = document.createElement('div'); bar.className = 'bar';
  const ticks = document.createElement('div'); ticks.className = 'ticks';
  let stops, labels;
  if (m.kind === 'div') {
    stops = d3.range(-1, 1.001, 0.1).map((t) => color(t * m.dom));
    labels = [`Cadu +${Math.round(m.dom * 100)} p.p. ou mais`, 'Empate', `Allyson +${Math.round(m.dom * 100)} p.p. ou mais`];
  } else {
    const at = (t) => (m.mid != null ? (t <= 0.5 ? m.lo + (t / 0.5) * (m.mid - m.lo) : m.mid + ((t - 0.5) / 0.5) * (m.hi - m.mid)) : m.lo + t * (m.hi - m.lo));
    stops = d3.range(0, 1.001, 0.05).map((t) => color(at(t)));
    labels = [`${Math.round(m.lo * 100)}% ou menos`, `${pf1.format(at(0.5) * 100).replace(',0', '')}%`, `${Math.round(m.hi * 100)}% ou mais`];
  }
  bar.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  ticks.replaceChildren(...labels.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
  wrap.append(bar, ticks);
  { const row = document.createElement('div'); row.className = 'nt-legend-cat'; if (water) row.appendChild(waterItem(water.fill, water.line)); row.append(...dots()); wrap.appendChild(row); }
  el.replaceChildren(wrap);
};
Object.keys(MAPS).forEach((k) => ['map-metric-', 'map-zonas-', 'map-pts-'].forEach((id) => document.getElementById(id + k).addEventListener('change', () => {
  const st = MAPS[k].state;
  st.metric = document.getElementById('map-metric-' + k).value;
  st.zonas = document.getElementById('map-zonas-' + k).checked;
  st.pts = document.getElementById('map-pts-' + k).checked;
  drawMap(k);
})));

const drawMap = (key) => {
  const cfg = MAPS[key], mapState = cfg.state;
  const box = document.getElementById('nt-map-' + key);
  const L = dash.data('por_local'), O = dash.data('contorno'), SX = dash.data('por_secao');
  if ([L, O, SX].some((d) => d.status === 'error')) { box.classList.remove('dash-skeleton'); failLine(box); return; }
  if ([L, O, SX].some((d) => d.status !== 'ok')) { box.querySelectorAll('canvas, svg').forEach((n) => n.remove()); return; }
  box.classList.remove('dash-skeleton');
  box.querySelectorAll('.nt-fail').forEach((n) => n.remove());
  box.querySelectorAll('.nt-tip').forEach((n) => { n.hidden = true; });

  // Projeção equirretangular local (cos da latitude), adequada à escala de uma cidade.
  const ring = O.data.map((p) => [Number(p.lon), Number(p.lat)]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
  const kx = Math.cos(5.8 * Math.PI / 180);
  const gx = ring.map((p) => p[0] * kx), gy = ring.map((p) => -p[1]);
  const x0 = d3.min(gx), x1 = d3.max(gx), y0 = d3.min(gy), y1 = d3.max(gy);
  const W = Math.max(260, box.clientWidth);
  const sc = (W - 16) / (x1 - x0);
  const H = Math.ceil((y1 - y0) * sc) + 16;
  box.style.height = H + 'px';
  const proj = ([lon, lat]) => [8 + (lon * kx - x0) * sc, 8 + (-lat - y0) * sc];
  const kmPx = sc / 111.32;
  const ringPx = ring.map(proj);
  const outline = (c) => { c.beginPath(); ringPx.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); };

  const m = METRICS[mapState.metric];
  const mid = tokenRGB(box, '--color-panel');
  const fg = tokenRGB(box, '--color-fg');
  const color = m.kind === 'cat' ? null : makeColor(m, mid);
  const RIO = dash.data('rio');
  const water = RIO.status === 'ok' ? { fill: d3.interpolateRgb(mid, '#7C9CB0')(0.6), line: d3.interpolateRgb(mid, '#3E5F73')(0.75) } : null;
  drawLegend(document.getElementById('map-legend-' + key), m, color, water, cfg.kind === 'votos');

  const pts = L.data.filter((r) => isFinite(r.lat) && isFinite(r.lon)).map((r) => {
    const [x, y] = proj([r.lon, r.lat]);
    return { r, x, y, num: m.num ? m.num(r) : 0, den: m.den ? m.den(r) : 0, zona: r.zona };
  });

  // heat surface
  let cv = box.querySelector('canvas'); if (!cv) { cv = document.createElement('canvas'); box.prepend(cv); }
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.save(); outline(ctx); ctx.clip();
  ctx.globalAlpha = 0.06; ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const step = W < 480 ? 3 : 4, nx = Math.ceil(W / step), ny = Math.ceil(H / step);
  const sig = 0.5 * kmPx, sig2 = 2 * sig * sig, cut2 = (3 * sig) ** 2;
  const near = 1.0 * kmPx, far = 1.5 * kmPx;
  const zgrid = new Int16Array(nx * ny).fill(-1);
  const off = document.createElement('canvas'); off.width = nx; off.height = ny;
  const octx = off.getContext('2d'); const img = octx.createImageData(nx, ny); const px = img.data;
  const rgbCache = new Map();
  const rgbOf = (c) => { if (!rgbCache.has(c)) { const q = d3.color(c); rgbCache.set(c, q ? [q.r, q.g, q.b] : [128, 128, 128]); } return rgbCache.get(c); };
  for (let j = 0; j < ny; j++) {
    const cy = (j + 0.5) * step;
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * step;
      let n = 0, d = 0, dmin = Infinity, zn = -1;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < dmin) { dmin = d2; zn = p.zona; }
        if (d2 < cut2) { const w = Math.exp(-d2 / sig2); n += w * p.num; d += w * p.den; }
      }
      dmin = Math.sqrt(dmin);
      const alpha = dmin <= near ? 1 : dmin >= far ? 0 : 1 - (dmin - near) / (far - near);
      if (alpha <= 0) continue;
      zgrid[j * nx + i] = zn;
      let c;
      if (m.kind === 'cat') c = zcol(zn); else if (d > 0) c = color(n / d); else continue;
      const [r0, g0, b0] = rgbOf(c), o = (j * nx + i) * 4;
      px[o] = r0; px[o + 1] = g0; px[o + 2] = b0; px[o + 3] = Math.round(255 * alpha * (m.kind === 'cat' ? 0.5 : m.end === 'abst' ? 1 : 0.92));
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, nx * step, ny * step);
  ctx.globalAlpha = 1;
  if (mapState.zonas) {
    ctx.beginPath();
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const z = zgrid[j * nx + i]; if (z < 0) continue;
      if (i + 1 < nx) { const zr = zgrid[j * nx + i + 1]; if (zr >= 0 && zr !== z) { ctx.moveTo((i + 1) * step, j * step); ctx.lineTo((i + 1) * step, (j + 1) * step); } }
      if (j + 1 < ny) { const zb = zgrid[(j + 1) * nx + i]; if (zb >= 0 && zb !== z) { ctx.moveTo(i * step, (j + 1) * step); ctx.lineTo((i + 1) * step, (j + 1) * step); } }
    }
    ctx.lineCap = 'square';
    ctx.strokeStyle = mid; ctx.globalAlpha = 0.85; ctx.lineWidth = 3.6; ctx.stroke();
    ctx.strokeStyle = fg; ctx.globalAlpha = 0.9; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (water) {
    const rings = d3.group(RIO.data.filter((r) => r.tipo === 'agua'), (r) => r.parte + '|' + r.anel);
    ctx.save(); ctx.beginPath();
    for (const rs of rings.values()) {
      rs.slice().sort((a, b) => Number(a.ponto) - Number(b.ponto)).forEach((r, i) => { const [x, y] = proj([Number(r.lon), Number(r.lat)]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    }
    ctx.globalAlpha = 1; ctx.fillStyle = water.fill; ctx.fill('evenodd');
    ctx.clip('evenodd');
    ctx.strokeStyle = water.line; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); for (let d = -H; d < W + H; d += 5) { ctx.moveTo(d, 0); ctx.lineTo(d + H, H); } ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.beginPath();
    for (const rs of rings.values()) {
      rs.slice().sort((a, b) => Number(a.ponto) - Number(b.ponto)).forEach((r, i) => { const [x, y] = proj([Number(r.lon), Number(r.lat)]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
    }
    ctx.strokeStyle = water.line; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore();
  }
  outline(ctx); ctx.strokeStyle = fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;

  // overlay: zone labels + points
  box.querySelectorAll('svg').forEach((n) => n.remove());
  const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const bySec = d3.group(SX.data, (r) => r.zona + '|' + r.local);
  const tip = tipFor(box);
  if (mapState.pts) {
    const rad = (r) => (W < 480 ? 1.6 : 2) + 1.05 * Math.sqrt(r.secoes);
    svg.append('g').selectAll('circle').data(pts.slice().sort((a, b) => b.r.secoes - a.r.secoes)).join('circle')
      .attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', (p) => rad(p.r))
      .attr('fill', (p) => (cfg.kind === 'votos' ? marginColor(p.r.margem_pp) : PT_FILL)).attr('fill-opacity', 0.95)
      .attr('stroke', PT_LINE).attr('stroke-opacity', 0.9).attr('stroke-width', 1)
      .attr('stroke-dasharray', (p) => (p.r.coord_aproximada ? '2 2' : null))
      .on('mouseenter', function (ev, p) {
        d3.select(this).attr('stroke-width', 2.4).attr('stroke-opacity', 1);
        const r = p.r;
        const secs = (bySec.get(r.zona + '|' + r.local) || []).slice().sort((a, b) => a.secao - b.secao);
        const nsec = `${nf.format(r.secoes)} ${r.secoes === 1 ? 'seção' : 'seções'}`;
        const abst = (c) => (c == null ? null : 1 - c);
        const lines = cfg.kind === 'abst'
          ? [`Zona ${r.zona} · ${r.bairro}`, r.nome_local,
            `${nsec} · ${nf.format(r.aptos)} aptos · ${nf.format(r.total)} votaram`,
            `Abstenção ${pct(abst(r.comparecimento))} (${nf.format(r.aptos - r.total)} eleitores)`,
            'Abstenção por seção: ' + secs.map((s) => `${s.secao} (${pct(abst(s.comparecimento))})`).join(' · ')]
          : [`Zona ${r.zona} · ${r.bairro}`, r.nome_local,
            `${nsec} · ${nf.format(r.validos)} válidos`,
            `Allyson ${pct(r.pct_allyson)} · Cadu ${pct(r.pct_carlos)} · margem ${pp(r.margem_pp)}`,
            'Margem por seção: ' + secs.map((s) => `${s.secao} (${pp(s.margem_pp).replace(' p.p.', '')})`).join(' · ')];
        if (r.coord_aproximada) lines.push('Posição aproximada: a coordenada do TSE para esta escola é inválida; ela foi posta no centro do bairro.');
        const [px, py] = d3.pointer(ev, box); tip.show(lines, px, py);
      })
      .on('mouseleave', function () { d3.select(this).attr('stroke-width', 1).attr('stroke-opacity', 0.9); tip.hide(); });
  }
  if (mapState.zonas || m.kind === 'cat') {
    const zs = d3.group(pts, (p) => p.zona);
    const lab = [...zs].map(([z, ps]) => {
      const reach = (1.5 * kmPx) ** 2;
      const score = (p) => ps.reduce((s, q) => s + (((q.x - p.x) ** 2 + (q.y - p.y) ** 2) < reach ? q.r.secoes : 0), 0);
      const best = ps.reduce((a, p) => (score(p) > score(a) ? p : a), ps[0]);
      return { z, x: best.x, y: best.y - 10 };
    });
    svg.append('g').selectAll('text').data(lab).join('text').attr('class', 'zl').attr('x', (d) => d.x).attr('y', (d) => d.y).attr('text-anchor', 'middle').text((d) => 'Zona ' + d.z);
  }
  if (water) {
    const rl = RIO.data.find((r) => r.tipo === 'rotulo');
    if (rl) {
      const [x, y] = proj([Number(rl.lon), Number(rl.lat)]);
      svg.append('text').attr('class', 'rl').attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
        .attr('transform', `translate(${x},${y}) rotate(${Number(rl.angulo) || 0})`).attr('fill', d3.interpolateRgb(fg, '#3E5F73')(0.35)).text('Rio Potengi');
    }
  }
};


/* ---------- análise: preenche os números citados no texto ---------- */
const FMT = {
  pct: (v) => pct(v), pct0: (v) => Math.round(v * 100) + '%', int: (v) => nf.format(v), num1: (v) => pf1.format(v),
  pp: (v) => pp(v), sint: (v) => (Math.round(v) > 0 ? '+' : Math.round(v) < 0 ? '−' : '') + nf.format(Math.round(Math.abs(v))), absint: (v) => nf.format(Math.round(Math.abs(v))),
  ord: (v) => v + 'º',
  corr: (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
};
const fillAnalise = () => {
  document.querySelectorAll('#analise [data-fmt], #takeaway [data-fmt]').forEach((el) => {
    const s = dash.data(el.dataset.source);
    if (s.status !== 'ok') { el.textContent = '—'; return; }
    let row;
    if (el.dataset.where) {
      const conds = el.dataset.where.split('&').map((c) => c.split('=').map(decodeURIComponent));
      row = s.data.find((r) => conds.every(([k, v]) => String(r[k]) === v));
    } else row = s.data[Number(el.dataset.row || 0)];
    const v = row ? row[el.dataset.field] : null;
    el.textContent = v == null || Number.isNaN(v) ? '—' : FMT[el.dataset.fmt](v);
  });
};

/* ---------- links ---------- */
let linked = false;
const goLink = () => {
  if (linked) return; linked = true;
  const named = document.getElementById(location.hash.slice(1));
  if (named) { named.scrollIntoView(); dash.setLink(named.id); }
};
document.querySelectorAll('.nt-sec[id]').forEach((sec) => sec.addEventListener('click', () => dash.setLink(sec.id)));

dash.onData(() => {
  paintSwatches();
  fillResumo();
  drawCand();
  drawEstado();
  drawHist();
  drawStrip();
  drawZona();
  drawLocal();
  drawSecao();
  drawBairro();
  drawAbst();
  drawAbstTable();
  drawMap('v');
  drawMap('a');
  fillAnalise();
  if (dash.data('por_secao').status === 'ok') goLink();
});
