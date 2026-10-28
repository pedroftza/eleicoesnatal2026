
/* ---------- cálculos ---------- */
const CAMPOS = ['p1_aptos', 'p1_13', 'p1_22', 'p1_outros', 'p1_bn', 'p2_aptos', 'p2_13', 'p2_22', 'p2_bn',
  'g1_aptos', 'g1_22', 'g1_13', 'g1_44', 'g1_outros', 'g1_bn', 'g2_aptos', 'g2_44', 'g2_13', 'g2_bn'];

// Indicadores dos dois turnos a partir das somas de um grupo de seções (uma seção, um local, um bairro, uma zona ou a cidade).
const indicadores = (s) => {
  const p1v = s.p1_13 + s.p1_22 + s.p1_outros, p1t = p1v + s.p1_bn, p2v = s.p2_13 + s.p2_22, p2t = p2v + s.p2_bn;
  const g1v = s.g1_22 + s.g1_13 + s.g1_44 + s.g1_outros, g1t = g1v + s.g1_bn, g2v = s.g2_44 + s.g2_13, g2t = g2v + s.g2_bn;
  const d = (a, b) => (b ? a / b : null);
  const r = {
    p1_validos: p1v, p2_validos: p2v, g1_validos: g1v, g2_validos: g2v, p1_total: p1t, p2_total: p2t,
    lula1: d(s.p1_13, p1v), flavio1: d(s.p1_22, p1v), lula2: d(s.p2_13, p2v), flavio2: d(s.p2_22, p2v),
    alvaro1: d(s.g1_22, g1v), carlos1: d(s.g1_13, g1v), allyson1: d(s.g1_44, g1v), allyson2: d(s.g2_44, g2v), carlos2: d(s.g2_13, g2v),
    abst1: d(s.p1_aptos - p1t, s.p1_aptos), abst2: d(s.p2_aptos - p2t, s.p2_aptos),
    gabst1: d(s.g1_aptos - g1t, s.g1_aptos), gabst2: d(s.g2_aptos - g2t, s.g2_aptos),
    pbn1: d(s.p1_bn, p1t), pbn2: d(s.p2_bn, p2t), gbn1: d(s.g1_bn, g1t), gbn2: d(s.g2_bn, g2t),
    p1_abst: s.p1_aptos - p1t, p2_abst: s.p2_aptos - p2t, g1_abst: s.g1_aptos - g1t, g2_abst: s.g2_aptos - g2t,
  };
  r.margem1 = (r.lula1 - r.flavio1) * 100; r.margem2 = (r.lula2 - r.flavio2) * 100; r.virada = r.margem2 - r.margem1;
  r.ganho_allyson = (r.allyson2 - r.allyson1) * 100; r.ganho_carlos = (r.carlos2 - r.carlos1) * 100; r.gmargem2 = (r.allyson2 - r.carlos2) * 100;
  r.var_abst = (r.abst2 - r.abst1) * 100;
  return r;
};
const somar = (rs) => { const s = {}; CAMPOS.forEach((k) => { s[k] = rs.reduce((a, r) => a + r[k], 0); }); return s; };
const agrupar = (rows, chave, extra) => [...d3.group(rows, chave).values()].map((rs) => {
  const s = somar(rs); return { ...extra(rs), secoes: rs.length, ...s, ...indicadores(s) };
});

dash.calc('por_secao', {
  title: 'Seções nos dois turnos',
  description: 'Uma linha por seção, com os votos de presidente e governador no 1º e no 2º turnos e os indicadores de cada turno. Coordenadas do TSE com a mesma correção dos relatórios de cada turno: quando cinco ou mais locais com endereços diferentes estão a menos de 60 m uns dos outros, a coordenada é tratada como inválida e o local vai para a mediana das coordenadas válidas do seu bairro.',
  inputs: ['secoes'],
  fn: (secoes) => {
    const rows = secoes.map((r) => {
      const o = { zona: Number(r.zona), secao: Number(r.secao), local: Number(r.local), nome_local: r.nome_local, endereco: r.endereco, bairro: r.bairro, lat: Number(r.lat), lon: Number(r.lon) };
      CAMPOS.forEach((k) => { o[k] = Number(r[k]) || 0; });
      return o;
    });
    const places = [...new Map(rows.map((r) => [r.endereco, r])).values()];
    const km = (a, b) => Math.hypot((a.lon - b.lon) * 110.8 * Math.cos(5.8 * Math.PI / 180), (a.lat - b.lat) * 110.57);
    const bad = new Set(places.filter((a) => places.filter((b) => km(a, b) < 0.06).length >= 5).map((a) => a.endereco));
    const med = (a) => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const ok = rows.filter((r) => !bad.has(r.endereco));
    return rows.map((r) => {
      let { lat, lon } = r, aprox = false;
      if (bad.has(r.endereco)) {
        const ref = ok.filter((o) => o.bairro === r.bairro);
        const peers = [...new Set(rows.filter((o) => o.bairro === r.bairro && bad.has(o.endereco)).map((o) => o.endereco))];
        const ang = 2 * Math.PI * peers.indexOf(r.endereco) / peers.length, rad = peers.length > 1 ? 0.0022 : 0;
        lat = med(ref.map((o) => o.lat)) + rad * Math.sin(ang); lon = med(ref.map((o) => o.lon)) + rad * Math.cos(ang); aprox = true;
      }
      return { ...r, lat, lon, coord_aproximada: aprox, ...indicadores(r) };
    });
  },
});

dash.calc('resumo', {
  title: 'Totais de Natal nos dois turnos',
  description: 'Soma das seções: votos, percentuais e abstenção de presidente e governador em cada turno, e quantas seções mudaram de lado na eleição para presidente.',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const s = somar(por_secao);
    return [{
      ...s, ...indicadores(s), secoes: por_secao.length,
      vira_lula: por_secao.filter((r) => r.margem1 < 0 && r.margem2 > 0).length,
      vira_flavio: por_secao.filter((r) => r.margem1 > 0 && r.margem2 < 0).length,
      lula_cresce: por_secao.filter((r) => r.virada > 0).length,
      abst_cai: por_secao.filter((r) => r.var_abst < 0).length,
    }];
  },
});

dash.calc('por_zona', {
  title: 'Zonas nos dois turnos', description: 'Soma das seções de cada zona eleitoral, com os indicadores dos dois turnos.',
  inputs: ['por_secao'],
  fn: (por_secao) => agrupar(por_secao, (r) => r.zona, (rs) => ({ zona: rs[0].zona })).sort((a, b) => a.zona - b.zona),
});

dash.calc('por_bairro', {
  title: 'Bairros nos dois turnos', description: 'Soma das seções cujos locais de votação ficam em cada bairro (cadastro do TSE), com os indicadores dos dois turnos.',
  inputs: ['por_secao'],
  // A seção da unidade prisional (zona 1, seção 642) fica em Parnamirim e não tem bairro de Natal: entra nos totais, não nos bairros.
  fn: (por_secao) => agrupar(por_secao.filter((r) => r.bairro), (r) => r.bairro, (rs) => ({ bairro: rs[0].bairro, zonas: [...new Set(rs.map((r) => r.zona))].sort((a, b) => a - b).join(', ') })),
});

dash.calc('por_local', {
  title: 'Locais de votação nos dois turnos', description: 'Soma das seções de cada local de votação (zona + número do local), com os indicadores dos dois turnos.',
  inputs: ['por_secao'],
  fn: (por_secao) => agrupar(por_secao, (r) => r.zona + '|' + r.local, (rs) => ({
    zona: rs[0].zona, local: rs[0].local, nome_local: rs[0].nome_local, endereco: rs[0].endereco, bairro: rs[0].bairro,
    lat: d3.mean(rs, (r) => r.lat), lon: d3.mean(rs, (r) => r.lon), coord_aproximada: rs.some((r) => r.coord_aproximada),
  })),
});

dash.calc('regressao', {
  title: 'Álvaro no 1º turno × crescimento de Allyson',
  description: 'Correlação (Pearson) e reta de mínimos quadrados, seção a seção, entre o % de Álvaro Dias no 1º turno e o ganho de Allyson Bezerra (p.p. dos válidos) do 1º para o 2º turno.',
  inputs: ['por_secao'],
  fn: (por_secao) => {
    const xs = por_secao.map((r) => r.alvaro1 * 100), ys = por_secao.map((r) => r.ganho_allyson);
    const mx = d3.mean(xs), my = d3.mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
    const b = sxy / sxx;
    return [{ corr: sxy / Math.sqrt(sxx * syy), inclinacao: b, intercepto: my - b * mx }];
  },
});

/* ---------- formatting ---------- */
const nf = new Intl.NumberFormat('pt-BR');
const pf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => (v == null || isNaN(v)) ? '—' : pf1.format(v * 100) + '%';
const pp = (v) => (v == null || isNaN(v)) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + pf1.format(Math.abs(v)) + ' p.p.';
const sint = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + nf.format(Math.abs(v));
const COR = { lula: '#D7332F', flavio: '#2F6BD6', allyson: '#1E9E62', carlos: '#D7332F', alvaro: '#2F6BD6', outros: 'var(--cds-chart-muted)', abst: '#1F8A70' };

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
const pronto = (el, ...ids) => {
  const ds = ids.map((id) => dash.data(id));
  if (ds.some((d) => d.status === 'error')) { el.classList.remove('dash-skeleton'); failLine(el); return null; }
  if (ds.some((d) => d.status !== 'ok')) { el.replaceChildren(); return null; }
  el.classList.remove('dash-skeleton');
  return ds.map((d) => d.data);
};

/* ---------- números no texto ---------- */
const FMT = {
  pct, pp, int: (v) => nf.format(v), sint, num1: (v) => pf1.format(v), pct0: (v) => Math.round(v * 100) + '%',
  corr: (v) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v),
};
const fillNumeros = () => {
  document.querySelectorAll('[data-fmt]').forEach((el) => {
    const s = dash.data(el.dataset.source);
    el.classList.remove('dash-skeleton');
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

/* ---------- barras: 1º turno × 2º turno ---------- */
const drawPares = (id, itens) => {
  const el = document.getElementById(id);
  const d = pronto(el, 'resumo'); if (!d) return;
  const r = d[0][0];
  const linhas = itens(r);
  const max = d3.max(linhas, (l) => Math.max(l.v1 ?? 0, l.v2 ?? 0));
  const wrap = document.createElement('div'); wrap.className = 'nt-bars';
  linhas.forEach((l) => {
    const row = document.createElement('div'); row.className = 'nt-bar-row';
    const top = document.createElement('div'); top.className = 'nt-bar-top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = l.nome;
    const vl = document.createElement('span'); vl.className = 'vl';
    const b = document.createElement('b'); b.textContent = l.v2 == null ? l.fora : nf.format(l.v2);
    vl.append(document.createTextNode((l.v1 == null ? '1º —' : '1º ' + nf.format(l.v1)) + ' · 2º '), b);
    if (l.v1 != null && l.v2 != null) vl.append(document.createTextNode(' (' + sint(l.v2 - l.v1) + ')'));
    top.append(nm, vl);
    const mk = (v, op) => { const tr = document.createElement('div'); tr.className = 'nt-bar-track'; const f = document.createElement('div'); f.className = 'nt-bar-fill'; f.style.width = ((v || 0) / max * 100) + '%'; f.style.background = l.cor; f.style.opacity = op; tr.appendChild(f); return tr; };
    row.append(top, mk(l.v1, 0.45), mk(l.v2, 1)); wrap.appendChild(row);
  });
  const leg = document.createElement('div'); leg.className = 'nt-bn';
  const s1 = document.createElement('span'); s1.textContent = 'Barra clara: 1º turno (4/10) · barra cheia: 2º turno (25/10). Entre parênteses, a diferença em votos.';
  leg.appendChild(s1);
  el.replaceChildren(wrap, leg);
};
const drawVotosP = () => drawPares('ch-votos-p', (r) => [
  { nome: '13 · Lula', v1: r.p1_13, v2: r.p2_13, cor: COR.lula },
  { nome: '22 · Flávio Bolsonaro', v1: r.p1_22, v2: r.p2_22, cor: COR.flavio },
  { nome: 'Outros candidatos', v1: r.p1_outros, v2: null, fora: 'sem candidatos', cor: COR.outros },
  { nome: 'Brancos e nulos', v1: r.p1_bn, v2: r.p2_bn, cor: COR.outros },
  { nome: 'Abstenções', v1: r.p1_abst, v2: r.p2_abst, cor: COR.abst },
]);
const drawVotosG = () => drawPares('ch-votos-g', (r) => [
  { nome: '44 · Allyson Bezerra', v1: r.g1_44, v2: r.g2_44, cor: COR.allyson },
  { nome: '13 · Cadu', v1: r.g1_13, v2: r.g2_13, cor: COR.carlos },
  { nome: '22 · Álvaro Dias', v1: r.g1_22, v2: null, fora: 'fora do 2º turno', cor: COR.alvaro },
  { nome: 'Outros candidatos', v1: r.g1_outros, v2: null, fora: 'sem candidatos', cor: COR.outros },
  { nome: 'Brancos e nulos', v1: r.g1_bn, v2: r.g2_bn, cor: COR.outros },
  { nome: 'Abstenções', v1: r.g1_abst, v2: r.g2_abst, cor: COR.abst },
]);

/* ---------- dispersão por seção ---------- */
const drawDispersao = (cfg) => {
  const el = document.getElementById(cfg.id);
  el.querySelectorAll('.nt-tip').forEach((n) => { n.hidden = true; });
  const d = pronto(el, 'por_secao', 'regressao'); if (!d) return;
  const [rows, [reg]] = d;
  const W = Math.max(280, el.clientWidth), H = Math.min(360, Math.max(260, W * 0.7)), m = { t: 12, r: 12, b: 40, l: 44 };
  const x = d3.scaleLinear(cfg.xdom, [m.l, W - m.r]), y = d3.scaleLinear(cfg.ydom, [H - m.b, m.t]);
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', cfg.aria);
  const xt = x.ticks(W < 420 ? 5 : 8), yt = y.ticks(6);
  svg.append('g').selectAll('line').data(yt).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('line').data(xt).join('line').attr('x1', x).attr('x2', x).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-grid)');
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', m.l - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(cfg.ytick);
  svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - m.b + 16).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(cfg.xtick);
  svg.append('text').attr('x', (m.l + W - m.r) / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(cfg.xlabel);
  svg.append('text').attr('transform', `translate(11,${(m.t + H - m.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text(cfg.ylabel);
  cfg.linhas(reg).forEach((l) => svg.append('line').attr('x1', x(l[0][0])).attr('y1', y(l[0][1])).attr('x2', x(l[1][0])).attr('y2', y(l[1][1]))
    .attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', l[2] ? '4 3' : null).attr('stroke-width', 1.5));
  const tip = tipFor(el);
  svg.append('g').selectAll('circle').data(rows).join('circle')
    .attr('cx', (r) => x(cfg.fx(r))).attr('cy', (r) => y(cfg.fy(r))).attr('r', W < 420 ? 2 : 2.4)
    .attr('fill', cfg.cor).attr('fill-opacity', 0.55)
    .on('mouseenter', function (ev, r) {
      d3.select(this).attr('fill-opacity', 1).attr('r', 5);
      const [px, py] = d3.pointer(ev, el);
      tip.show([`Zona ${r.zona} · Seção ${r.secao}`, r.nome_local + ' · ' + r.bairro, ...cfg.tip(r)], px, py);
    })
    .on('mouseleave', function () { d3.select(this).attr('fill-opacity', 0.55).attr('r', W < 420 ? 2 : 2.4); tip.hide(); });
  el.querySelectorAll('svg').forEach((n) => n.remove());
  el.prepend(svg.node());
};
const drawDispP = () => drawDispersao({
  id: 'ch-disp-p', aria: 'Margem de Lula sobre Flávio em cada seção no 1º turno e no 2º turno',
  xdom: [-50, 60], ydom: [-50, 60], xtick: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v), ytick: (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v),
  xlabel: 'Margem Lula − Flávio no 1º turno (p.p.)', ylabel: 'Margem no 2º turno (p.p.)',
  linhas: () => [[[-50, -50], [60, 60], true]],
  fx: (r) => r.margem1, fy: (r) => r.margem2, cor: (r) => (r.margem2 >= 0 ? COR.lula : COR.flavio),
  tip: (r) => [`1º turno: Lula ${pct(r.lula1)} · Flávio ${pct(r.flavio1)} (${pp(r.margem1)})`, `2º turno: Lula ${pct(r.lula2)} · Flávio ${pct(r.flavio2)} (${pp(r.margem2)})`],
});
const drawDispG = () => drawDispersao({
  id: 'ch-disp-g', aria: 'Percentual de Álvaro Dias no 1º turno e ganho de Allyson Bezerra do 1º para o 2º turno, por seção',
  xdom: [10, 70], ydom: [-5, 65], xtick: (v) => v + '%', ytick: (v) => (v > 0 ? '+' : '') + v,
  xlabel: 'Álvaro Dias no 1º turno (% dos válidos)', ylabel: 'Ganho de Allyson (p.p.)',
  linhas: (reg) => [[[10, reg.intercepto + reg.inclinacao * 10], [70, reg.intercepto + reg.inclinacao * 70], true]],
  fx: (r) => r.alvaro1 * 100, fy: (r) => r.ganho_allyson, cor: () => COR.allyson,
  tip: (r) => [`1º turno: Álvaro ${pct(r.alvaro1)} · Cadu ${pct(r.carlos1)} · Allyson ${pct(r.allyson1)}`, `2º turno: Allyson ${pct(r.allyson2)} · Cadu ${pct(r.carlos2)}`, `Ganho de Allyson: ${pp(r.ganho_allyson)}`],
});

/* ---------- abstenção por zona ---------- */
const drawAbstZona = () => {
  const el = document.getElementById('ch-abst-z');
  const d = pronto(el, 'por_zona', 'resumo'); if (!d) return;
  const [zs, [r]] = d;
  const max = d3.max(zs, (z) => z.abst1) * 1.1;
  const wrap = document.createElement('div'); wrap.className = 'nt-bars';
  [{ zona: 'Natal', ...r }, ...zs].forEach((z) => {
    const row = document.createElement('div'); row.className = 'nt-bar-row';
    const top = document.createElement('div'); top.className = 'nt-bar-top';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = z.zona === 'Natal' ? 'Natal' : 'Zona ' + z.zona;
    const vl = document.createElement('span'); vl.className = 'vl';
    const b = document.createElement('b'); b.textContent = pct(z.abst2);
    vl.append(document.createTextNode('1º ' + pct(z.abst1) + ' · 2º '), b, document.createTextNode(' (' + pp(z.var_abst) + ')'));
    top.append(nm, vl);
    const mk = (v, op) => { const tr = document.createElement('div'); tr.className = 'nt-bar-track'; const f = document.createElement('div'); f.className = 'nt-bar-fill'; f.style.width = (v / max * 100) + '%'; f.style.background = COR.abst; f.style.opacity = op; tr.appendChild(f); return tr; };
    row.append(top, mk(z.abst1, 0.45), mk(z.abst2, 1)); wrap.appendChild(row);
  });
  const leg = document.createElement('div'); leg.className = 'nt-bn';
  const s1 = document.createElement('span'); s1.textContent = 'Abstenção para presidente, em % dos aptos. Barra clara: 1º turno · barra cheia: 2º turno.';
  leg.appendChild(s1);
  el.replaceChildren(wrap, leg);
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
      if (st.key === k) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.key = k; st.dir = (def.textCols || []).includes(k) ? 'asc' : 'desc'; }
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
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * f || (a.zona - b.zona) || ((a.local ?? 0) - (b.local ?? 0));
    return String(va).localeCompare(String(vb), 'pt-BR') * f;
  });
};
const td = (text, cls) => { const c = document.createElement('td'); if (cls) c.className = cls; c.textContent = text; return c; };
const barCell = (v, scale, cor) => {
  const c = document.createElement('td'); c.className = 'num';
  const w = document.createElement('span'); w.className = 'nt-mg';
  const t = document.createElement('span'); t.textContent = pp(v).replace(' p.p.', '');
  const u = document.createElement('span'); u.className = 'nt-u'; u.textContent = ' p.p.'; t.appendChild(u);
  const bar = document.createElement('i'); bar.style.width = Math.max(2, Math.abs(v) * scale) + 'px'; bar.style.background = typeof cor === 'function' ? cor(v) : cor;
  w.append(t, bar); c.appendChild(w); return c;
};
const norm = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lado = (v) => (v < 0 ? COR.flavio : COR.lula);

// Tabelas descritas por colunas: [campo, rótulo da célula(r), classe] — o cabeçalho já está no HTML.
const drawTabela = (id, fonte, def, cells, filtro) => {
  const tbl = document.getElementById(id); const body = tbl.querySelector('tbody');
  const st = setupSort(id, def);
  st.render = () => {
    markSort(tbl, st);
    const s = dash.data(fonte);
    if (s.status !== 'ok') { body.replaceChildren(); return; }
    const rows = filtro ? filtro(s.data) : s.data;
    body.replaceChildren(...sortRows(rows, st).map((r) => { const tr = document.createElement('tr'); tr.append(...cells(r)); return tr; }));
  };
  st.render();
};
const drawTabelas = () => {
  drawTabela('tb-zona-p', 'por_zona', { key: 'zona', dir: 'asc' }, (r) => [td(String(r.zona)), td(pct(r.lula1), 'num'), td(pct(r.lula2), 'num'), td(pp(r.margem1), 'num nt-hide-sm'), td(pp(r.margem2), 'num'), barCell(r.virada, 3, COR.lula)]);
  drawTabela('tb-bairro-p', 'por_bairro', { key: 'virada', dir: 'asc', textCols: ['bairro', 'zonas'] }, (r) => [td(r.bairro, 'txt'), td(r.zonas, 'nt-hide-sm'), td(pp(r.margem1), 'num'), td(pp(r.margem2), 'num'), barCell(r.virada, 4, COR.lula)]);
  drawTabela('tb-zona-g', 'por_zona', { key: 'zona', dir: 'asc' }, (r) => [td(String(r.zona)), td(pct(r.alvaro1), 'num'), td(pct(r.carlos1), 'num nt-hide-sm'), td(pct(r.allyson1), 'num nt-hide-sm'), td(pct(r.allyson2), 'num'), td(pct(r.carlos2), 'num')]);
  drawTabela('tb-bairro-g', 'por_bairro', { key: 'ganho_allyson', dir: 'desc', textCols: ['bairro', 'zonas'] }, (r) => [td(r.bairro, 'txt'), td(pct(r.alvaro1), 'num'), td(pct(r.allyson1) + ' → ' + pct(r.allyson2), 'num nt-hide-sm'), barCell(r.ganho_allyson, 1.4, COR.allyson), td(pct(r.carlos1) + ' → ' + pct(r.carlos2), 'num nt-hide-sm'), barCell(r.ganho_carlos, 1.4, COR.carlos)]);
  drawTabela('tb-bairro-a', 'por_bairro', { key: 'var_abst', dir: 'asc', textCols: ['bairro', 'zonas'] }, (r) => [td(r.bairro, 'txt'), td(nf.format(r.p1_abst), 'num nt-hide-sm'), td(nf.format(r.p2_abst), 'num nt-hide-sm'), td(pct(r.abst1), 'num'), td(pct(r.abst2), 'num'), barCell(r.var_abst, 6, COR.abst)]);
  const q = document.getElementById('q-local'), n = document.getElementById('n-local');
  if (!q.dataset.bound) { q.addEventListener('input', () => tableState['tb-local'].render()); q.dataset.bound = '1'; }
  drawTabela('tb-local', 'por_local', { key: 'virada', dir: 'asc', textCols: ['nome_local'] }, (r) => {
    const name = document.createElement('td'); name.className = 'txt';
    const a = document.createElement('span'); a.textContent = r.nome_local;
    const b = document.createElement('span'); b.className = 'addr'; b.textContent = 'Zona ' + r.zona + ' · ' + r.bairro;
    name.append(a, b);
    return [name, td(pp(r.margem1), 'num nt-hide-sm'), td(pp(r.margem2), 'num'), barCell(r.virada, 2, lado), td(pct(r.allyson1) + ' → ' + pct(r.allyson2), 'num'), td(pct(r.abst1) + ' → ' + pct(r.abst2), 'num nt-hide-sm')];
  }, (rows) => {
    const term = norm(q.value.trim());
    const out = term ? rows.filter((r) => norm(`zona ${r.zona} ${r.nome_local} ${r.bairro} ${r.endereco}`).includes(term)) : rows;
    n.textContent = nf.format(out.length) + ' de ' + nf.format(rows.length) + ' locais';
    return out;
  });
};

/* ---------- mapas de calor da variação ---------- */
const ZPAL = { 1: '#8C6BB1', 2: '#D08C1F', 3: '#2A9D8F', 4: '#7A8F2E', 69: '#C25B86' };
const PT_LINE = '#1A1A1A';
const MAPS = {
  // Fundo: média ponderada da variação nas seções próximas (peso = votos válidos no 2º turno).
  p: {
    num: (r) => r.virada * r.p2_validos, den: (r) => r.p2_validos, valor: (r) => r.virada, fim: COR.lula, lo: 0, hi: 12,
    rotulos: ['0 p.p. ou menos', '+6 p.p.', '+12 p.p. ou mais'],
    tip: (r) => [`Margem de Lula: ${pp(r.margem1)} no 1º turno → ${pp(r.margem2)} no 2º`, `Variação: ${pp(r.virada)}`],
  },
  g: {
    num: (r) => r.ganho_allyson * r.g2_validos, den: (r) => r.g2_validos, valor: (r) => r.ganho_allyson, fim: COR.allyson, lo: 10, hi: 45,
    rotulos: ['+10 p.p. ou menos', '+27,5 p.p.', '+45 p.p. ou mais'],
    tip: (r) => [`Allyson: ${pct(r.allyson1)} no 1º turno → ${pct(r.allyson2)} no 2º (${pp(r.ganho_allyson)})`, `Álvaro tinha ${pct(r.alvaro1)} no 1º turno`],
  },
};
const pxCanvas = document.createElement('canvas'); pxCanvas.width = pxCanvas.height = 1;
const toRGB = (css) => {
  const c = pxCanvas.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = css; c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`;
};
const tokenRGB = (host, name) => {
  const probe = document.createElement('span'); probe.style.color = `var(${name})`; probe.style.position = 'absolute'; probe.style.visibility = 'hidden';
  host.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return toRGB(c);
};
const waterItem = (fill, line) => {
  const s = document.createElement('span'); s.className = 'nt-legend-water';
  const i = document.createElement('i'); i.style.background = `repeating-linear-gradient(135deg, ${fill} 0 3px, ${line} 3px 4px)`;
  s.append(i, document.createTextNode('Rio Potengi (traçado do OpenStreetMap)')); return s;
};
const drawMap = (key) => {
  const cfg = MAPS[key];
  const box = document.getElementById('nt-map-' + key);
  const zonasOn = document.getElementById('map-zonas-' + key).checked;
  const d = pronto(box, 'por_local', 'contorno'); if (!d) return;
  const [L, O] = d;
  box.querySelectorAll('.nt-tip').forEach((n) => { n.hidden = true; });

  // Projeção equirretangular local (cos da latitude), adequada à escala de uma cidade.
  const ring = O.map((p) => [Number(p.lon), Number(p.lat)]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
  const kx = Math.cos(5.8 * Math.PI / 180);
  const gx = ring.map((p) => p[0] * kx), gy = ring.map((p) => -p[1]);
  const x0 = d3.min(gx), x1 = d3.max(gx), y0 = d3.min(gy), y1 = d3.max(gy);
  const W = Math.max(260, box.clientWidth), sc = (W - 16) / (x1 - x0), H = Math.ceil((y1 - y0) * sc) + 16;
  box.style.height = H + 'px';
  const proj = ([lon, lat]) => [8 + (lon * kx - x0) * sc, 8 + (-lat - y0) * sc];
  const kmPx = sc / 111.32;
  const ringPx = ring.map(proj);
  const outline = (c) => { c.beginPath(); ringPx.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.closePath(); };

  const mid = tokenRGB(box, '--color-panel'), fg = tokenRGB(box, '--color-fg');
  const ramp = d3.interpolateRgb(mid, cfg.fim);
  const color = (v) => ramp(0.08 + 0.92 * Math.max(0, Math.min(1, (v - cfg.lo) / (cfg.hi - cfg.lo))));
  const RIO = dash.data('rio');
  const water = RIO.status === 'ok' ? { fill: d3.interpolateRgb(mid, '#7C9CB0')(0.6), line: d3.interpolateRgb(mid, '#3E5F73')(0.75) } : null;

  // legenda
  const leg = document.getElementById('map-legend-' + key);
  const lw = document.createElement('div'); lw.className = 'nt-legend-ramp';
  const bar = document.createElement('div'); bar.className = 'bar'; bar.style.background = `linear-gradient(to right, ${d3.range(0, 1.001, 0.05).map((t) => color(cfg.lo + t * (cfg.hi - cfg.lo))).join(', ')})`;
  const ticks = document.createElement('div'); ticks.className = 'ticks';
  ticks.replaceChildren(...cfg.rotulos.map((l) => { const s = document.createElement('span'); s.textContent = l; return s; }));
  const row = document.createElement('div'); row.className = 'nt-legend-cat'; if (water) row.appendChild(waterItem(water.fill, water.line));
  lw.append(bar, ticks, row); leg.replaceChildren(lw);

  const pts = L.filter((r) => isFinite(r.lat) && isFinite(r.lon)).map((r) => { const [x, y] = proj([r.lon, r.lat]); return { r, x, y, num: cfg.num(r), den: cfg.den(r), zona: r.zona }; });

  let cv = box.querySelector('canvas'); if (!cv) { cv = document.createElement('canvas'); box.prepend(cv); }
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  ctx.save(); outline(ctx); ctx.clip();
  ctx.globalAlpha = 0.06; ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
  const step = W < 480 ? 3 : 4, nx = Math.ceil(W / step), ny = Math.ceil(H / step);
  const sig = 0.5 * kmPx, sig2 = 2 * sig * sig, cut2 = (3 * sig) ** 2, near = 1.0 * kmPx, far = 1.5 * kmPx;
  const zgrid = new Int16Array(nx * ny).fill(-1);
  const off = document.createElement('canvas'); off.width = nx; off.height = ny;
  const octx = off.getContext('2d'); const img = octx.createImageData(nx, ny); const px = img.data;
  const rgbCache = new Map();
  const rgbOf = (c) => { if (!rgbCache.has(c)) { const q = d3.color(c); rgbCache.set(c, q ? [q.r, q.g, q.b] : [128, 128, 128]); } return rgbCache.get(c); };
  for (let j = 0; j < ny; j++) {
    const cy = (j + 0.5) * step;
    for (let i = 0; i < nx; i++) {
      const cx = (i + 0.5) * step;
      let n = 0, dd = 0, dmin = Infinity, zn = -1;
      for (let k = 0; k < pts.length; k++) {
        const p = pts[k], dx = p.x - cx, dy = p.y - cy, d2 = dx * dx + dy * dy;
        if (d2 < dmin) { dmin = d2; zn = p.zona; }
        if (d2 < cut2) { const w = Math.exp(-d2 / sig2); n += w * p.num; dd += w * p.den; }
      }
      dmin = Math.sqrt(dmin);
      const alpha = dmin <= near ? 1 : dmin >= far ? 0 : 1 - (dmin - near) / (far - near);
      if (alpha <= 0 || dd <= 0) continue;
      zgrid[j * nx + i] = zn;
      const [r0, g0, b0] = rgbOf(color(n / dd)), o = (j * nx + i) * 4;
      px[o] = r0; px[o + 1] = g0; px[o + 2] = b0; px[o + 3] = Math.round(255 * alpha * 0.92);
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(off, 0, 0, nx * step, ny * step);
  if (zonasOn) {
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
    const path = () => { ctx.beginPath(); for (const rs of rings.values()) { rs.slice().sort((a, b) => Number(a.ponto) - Number(b.ponto)).forEach((r, i) => { const [x, y] = proj([Number(r.lon), Number(r.lat)]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.closePath(); } };
    ctx.save(); path(); ctx.fillStyle = water.fill; ctx.fill('evenodd'); ctx.clip('evenodd');
    ctx.strokeStyle = water.line; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    ctx.beginPath(); for (let k = -H; k < W + H; k += 5) { ctx.moveTo(k, 0); ctx.lineTo(k + H, H); } ctx.stroke(); ctx.restore();
    ctx.save(); path(); ctx.strokeStyle = water.line; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.7; ctx.stroke(); ctx.restore();
  }
  outline(ctx); ctx.strokeStyle = fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;

  box.querySelectorAll('svg').forEach((n) => n.remove());
  const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('viewBox', `0 0 ${W} ${H}`);
  const tip = tipFor(box);
  const rad = (r) => (W < 480 ? 1.6 : 2) + 1.05 * Math.sqrt(r.secoes);
  svg.append('g').selectAll('circle').data(pts.slice().sort((a, b) => b.r.secoes - a.r.secoes)).join('circle')
    .attr('cx', (p) => p.x).attr('cy', (p) => p.y).attr('r', (p) => rad(p.r))
    .attr('fill', (p) => color(cfg.valor(p.r))).attr('fill-opacity', 0.95)
    .attr('stroke', PT_LINE).attr('stroke-opacity', 0.9).attr('stroke-width', 1)
    .attr('stroke-dasharray', (p) => (p.r.coord_aproximada ? '2 2' : null))
    .on('mouseenter', function (ev, p) {
      d3.select(this).attr('stroke-width', 2.4).attr('stroke-opacity', 1);
      const r = p.r;
      const lines = [`Zona ${r.zona} · ${r.bairro}`, r.nome_local, `${nf.format(r.secoes)} ${r.secoes === 1 ? 'seção' : 'seções'}`, ...cfg.tip(r)];
      if (r.coord_aproximada) lines.push('Posição aproximada: a coordenada do TSE para esta escola é inválida; ela foi posta no centro do bairro.');
      const [qx, qy] = d3.pointer(ev, box); tip.show(lines, qx, qy);
    })
    .on('mouseleave', function () { d3.select(this).attr('stroke-width', 1).attr('stroke-opacity', 0.9); tip.hide(); });
  if (zonasOn) {
    const lab = [...d3.group(pts, (p) => p.zona)].map(([z, ps]) => {
      const reach = (1.5 * kmPx) ** 2;
      const score = (p) => ps.reduce((s, q) => s + (((q.x - p.x) ** 2 + (q.y - p.y) ** 2) < reach ? q.r.secoes : 0), 0);
      const best = ps.reduce((a, p) => (score(p) > score(a) ? p : a), ps[0]);
      return { z, x: best.x, y: best.y - 10 };
    });
    svg.append('g').selectAll('text').data(lab).join('text').attr('class', 'zl').attr('x', (q) => q.x).attr('y', (q) => q.y).attr('text-anchor', 'middle').text((q) => 'Zona ' + q.z);
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
Object.keys(MAPS).forEach((k) => document.getElementById('map-zonas-' + k).addEventListener('change', () => drawMap(k)));

/* ---------- links ---------- */
let linked = false;
const goLink = () => {
  if (linked) return; linked = true;
  const named = document.getElementById(location.hash.slice(1));
  if (named) { named.scrollIntoView(); dash.setLink(named.id); }
};
document.querySelectorAll('.nt-sec[id]').forEach((sec) => sec.addEventListener('click', () => dash.setLink(sec.id)));

dash.onData(() => {
  fillNumeros();
  drawVotosP();
  drawVotosG();
  drawDispP();
  drawDispG();
  drawAbstZona();
  drawTabelas();
  drawMap('p');
  drawMap('g');
  if (dash.data('por_secao').status === 'ok') goLink();
});
