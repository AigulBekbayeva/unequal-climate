/* Unequal Climate - three maps on one page.
   Data: data/countries.js (built by scripts/build_data.py), geometry: data/world.js */
(function () {
  'use strict';

  var DATA = window.MAP_DATA;
  var META = window.MAP_META;
  var TOPO = window.WORLD_TOPO;

  // Territories drawn separately in Natural Earth but reported with their UN member state
  var ALIAS = { SOL: 'SOM', CYN: 'CYP' };

  var byIso = new Map(DATA.map(function (d) { return [d.iso, d]; }));
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- colour ---------- */

  var TEAL = ['#d8f5f5', '#abe6e5', '#77cfd0', '#40b1b5', '#178c94', '#00646f', '#003d49'];
  var CARBON = ['#fbf2d0', '#fadd96', '#f9ba58', '#eb9132', '#c86529', '#8f3f26', '#56241d'];
  // 3 x 3 bivariate scheme (Joshua Stevens): rows = vulnerability low -> high, columns = GDP low -> high
  var BIV = [
    ['#e8e8e8', '#ace4e4', '#5ac8c8'],
    ['#dfb0d6', '#a5add3', '#5698b9'],
    ['#be64ac', '#8c62aa', '#3b4994']
  ];
  var GDP_BREAKS = [10000, 30000];
  var VULN_BREAKS = [0.38, 0.48];
  var INCOME_WORDS = ['Lower income', 'Middle income', 'Higher income'];
  var VULN_WORDS = ['low vulnerability', 'medium vulnerability', 'high vulnerability'];

  /* ---------- formatting ---------- */

  var f0 = d3.format(',.0f');
  var f1 = d3.format(',.1f');
  var f2 = d3.format(',.2f');
  var f3 = d3.format('.3f');

  function usd(v) { return '$' + f0(v); }
  function tonnes(v) { return (v < 1 ? f2(v) : v < 100 ? f1(v) : f0(v)) + ' t'; }
  function pct(v) { return (v < 0.1 ? f2(v) : f1(v)) + '%'; }
  function people(v) {
    if (v >= 1e9) return f2(v / 1e9) + ' billion';
    if (v >= 1e6) return (v >= 1e7 ? f0(v / 1e6) : f1(v / 1e6)) + ' million';
    return f0(v);
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var CO2 = 'CO<sub>2</sub>';

  /* ---------- ranks (1 = highest value) ---------- */

  var RANK = {};
  ['gdp_pc', 'co2_pc', 'co2_cum_pc', 'co2_cum_share', 'vuln'].forEach(function (key) {
    var rows = DATA.filter(function (d) { return d[key] != null; })
      .sort(function (a, b) { return b[key] - a[key]; });
    var m = new Map();
    rows.forEach(function (d, i) { m.set(d.iso, i + 1); });
    RANK[key] = { of: m, n: rows.length, rows: rows };
  });

  function bivClass(d) {
    if (!d || d.gdp_pc == null || d.vuln == null) return null;
    var gx = d3.bisectRight(GDP_BREAKS, d.gdp_pc);
    var gy = d3.bisectRight(VULN_BREAKS, d.vuln);
    return gy * 3 + gx;
  }
  function bivColor(c) { return BIV[Math.floor(c / 3)][c % 3]; }
  function bivLabel(c) { return INCOME_WORDS[c % 3] + ', ' + VULN_WORDS[Math.floor(c / 3)]; }

  /* ---------- views ---------- */

  var gdpYear = META.gdp_year, co2Year = META.co2_year, gainYear = META.gain_year;
  var bigEnough = function (d) { return d.pop >= 1e6; };

  var VIEWS = {
    wealth: {
      kind: 'seq', key: 'gdp_pc', colors: TEAL,
      breaks: [2500, 5000, 10000, 20000, 40000, 80000],
      ticks: ['$2.5k', '$5k', '$10k', '$20k', '$40k', '$80k'],
      legendTitle: 'GDP per person, international dollars. Bars count countries in each class.',
      format: usd,
      credit: 'GDP per capita, purchasing-power parity, current international $, ' + gdpYear + '. Source: World Bank, as published with the ND-GAIN Country Index.',
      rankFilter: null
    },
    annual: {
      kind: 'seq', key: 'co2_pc', colors: CARBON,
      breaks: [0.5, 1, 2.5, 5, 10, 20],
      ticks: ['0.5', '1', '2.5', '5', '10', '20 t'],
      legendTitle: 'Tonnes of ' + CO2 + ' per person in ' + co2Year + '. Bars count countries in each class.',
      format: tonnes,
      mark: { value: META.world.co2_pc, label: 'World average ' + f1(META.world.co2_pc) + ' t' },
      credit: 'CO₂ from fossil fuels and industry per person, ' + co2Year + '. Source: Global Carbon Budget (2026) via Our World in Data.',
      rankFilter: bigEnough
    },
    cumulative: {
      kind: 'seq', key: 'co2_cum_pc', colors: CARBON,
      breaks: [10, 30, 100, 250, 500, 1000],
      ticks: ['10', '30', '100', '250', '500', '1,000 t'],
      legendTitle: 'Tonnes of ' + CO2 + ' emitted since 1750, per person living there today. Bars count countries.',
      format: tonnes,
      mark: { value: META.world.co2_cum_pc, label: 'World average ' + f0(META.world.co2_cum_pc) + ' t' },
      credit: 'Cumulative CO₂ from fossil fuels and industry, 1750–' + co2Year + ', divided by ' + co2Year + ' population. Source: Global Carbon Budget (2026) via Our World in Data.',
      rankFilter: bigEnough
    },
    adapt: {
      kind: 'biv',
      credit: 'GDP per capita (PPP, ' + gdpYear + ') against the ND-GAIN climate vulnerability score (' + gainYear + '). Sources: World Bank; Notre Dame Global Adaptation Initiative.'
    }
  };

  var MAPS = [
    { id: 'wealth', n: 'Map 01', tab: 'Wealth', question: 'Who is rich and who is poor?', views: ['wealth'],
      ramp: TEAL },
    { id: 'emissions', n: 'Map 02', tab: 'Emissions', question: 'Who contributes most to climate change?', views: ['annual', 'cumulative'],
      ramp: CARBON },
    { id: 'adaptation', n: 'Map 03', tab: 'Adaptation', question: 'Who can afford to adapt to climate change?', views: ['adapt'],
      ramp: [BIV[2][0], BIV[1][0], BIV[0][0], BIV[0][1], BIV[0][2], BIV[1][2], BIV[2][2]] }
  ];

  var LAYERS = {
    annual: { title: 'Today', sub: 'Emitted in ' + co2Year },
    cumulative: { title: 'Since 1750', sub: 'Everything emitted so far' }
  };

  var state = { map: 0, view: 'wealth', selected: null, highlight: null };

  function classOf(d) {
    var v = VIEWS[state.view];
    if (!d) return null;
    if (v.kind === 'biv') return bivClass(d);
    return d[v.key] == null ? null : d3.bisectRight(v.breaks, d[v.key]);
  }
  function colorOf(c) {
    var v = VIEWS[state.view];
    return v.kind === 'biv' ? bivColor(c) : v.colors[c];
  }

  /* ---------- text for the side panel ---------- */

  function indicatorText() {
    switch (state.view) {
      case 'wealth': return 'GDP per capita at purchasing-power parity, ' + gdpYear;
      case 'annual': return CO2 + ' emissions per person, ' + co2Year;
      case 'cumulative': return CO2 + ' emitted since 1750, per person alive today';
      default: return 'GDP per capita set against climate vulnerability, ' + gainYear;
    }
  }

  function leadHTML() {
    var g = META.income_groups, rows, top, bottom;
    if (state.view === 'wealth') {
      rows = RANK.gdp_pc.rows; top = rows[0]; bottom = rows[rows.length - 1];
      var median = d3.median(rows, function (d) { return d.gdp_pc; });
      var poor = rows.filter(function (d) { return d.gdp_pc < 5000; });
      return '<p>A person in <strong>' + esc(top.name) + '</strong> accounts for about <strong>' +
        f0(top.gdp_pc / bottom.gdp_pc) + ' times</strong> the economic output of a person in <strong>' + esc(bottom.name) +
        '</strong>, even after adjusting for local prices: ' + usd(top.gdp_pc) + ' against ' + usd(bottom.gdp_pc) + ' a year.</p>' +
        '<p>Half of all countries sit below ' + usd(Math.round(median / 100) * 100) + ' per person. ' + poor.length +
        ' countries, home to ' + people(d3.sum(poor, function (d) { return d.pop; })) + ' people, are under $5,000.</p>' +
        '<p class="read">Darker teal means more output per person. International dollars adjust for what money buys in each country.</p>';
    }
    if (state.view === 'annual') {
      rows = RANK.co2_pc.rows.filter(bigEnough); top = rows[0]; bottom = rows[rows.length - 1];
      var w = META.world.co2_pc;
      var heavy = rows.filter(function (d) { return d.co2_pc > 2 * w; }).length;
      return '<p>The world emits <strong>' + f1(w) + ' tonnes</strong> of ' + CO2 + ' per person a year. In <strong>' + esc(top.name) +
        '</strong> the figure is ' + tonnes(top.co2_pc) + '; in <strong>' + esc(bottom.name) + '</strong>, ' + tonnes(bottom.co2_pc) + '. ' +
        heavy + ' countries emit more than twice the world average.</p>' +
        '<p>High-income countries hold ' + f0(g.high.pop_share) + '% of the world’s people and emit ' + f1(g.high.co2_pc) +
        ' t each. Low-income countries hold ' + f0(g.low.pop_share) + '% and emit ' + f2(g.low.co2_pc) + ' t each.</p>' +
        '<p class="read">Darker means more ' + CO2 + ' per person. Emissions are counted where fuel is burned, not where goods are consumed.</p>';
    }
    if (state.view === 'cumulative') {
      var us = byIso.get('USA'), cn = byIso.get('CHN'), ind = byIso.get('IND');
      var tiny = RANK.co2_cum_pc.rows.filter(function (d) { return d.co2_cum_pc < us.co2_pc; }).length;
      return '<p>' + CO2 + ' stays in the air for centuries, so the past counts. The <strong>United States</strong> accounts for <strong>' +
        f0(us.co2_cum_share) + '%</strong> of all ' + CO2 + ' ever emitted from fossil fuels and industry, and China for ' + f0(cn.co2_cum_share) +
        '%. Spread over today’s population, that is ' + tonnes(us.co2_cum_pc) + ' per American, ' + tonnes(cn.co2_cum_pc) +
        ' per person in China and ' + tonnes(ind.co2_cum_pc) + ' per person in India.</p>' +
        '<p>High-income countries, with ' + f0(g.high.pop_share) + '% of the world’s people, account for <strong>' + f0(g.high.co2_cum_share) +
        '%</strong> of the total; low-income countries for ' + f1(g.low.co2_cum_share) + '%. In ' + tiny +
        ' countries the whole historical total per person is less than what one American emits in a single year.</p>' +
        '<p class="read">Darker means a larger historical total per person living there today.</p>';
    }
    var both = DATA.filter(function (d) { return bivClass(d) != null; });
    var groups = d3.group(both, bivClass);
    var worst = groups.get(6) || [], best = groups.get(2) || [], richExposed = groups.get(8) || [];
    var sumPop = function (a) { return d3.sum(a, function (d) { return d.pop; }); };
    var sumShare = function (a) { return d3.sum(a, function (d) { return d.co2_cum_share || 0; }); };
    var r = pearson(both.map(function (d) { return Math.log(d.gdp_pc); }), both.map(function (d) { return d.vuln; }));
    return '<p>The countries most exposed to climate damage are mostly the ones with the least money to deal with it. <strong>' + worst.length +
      ' countries</strong>, home to <strong>' + people(sumPop(worst)) + ' people</strong>, combine an income under ' + usd(GDP_BREAKS[0]) +
      ' per person with high vulnerability. Together they produced about ' + f0(sumShare(worst)) + '% of all ' + CO2 + ' ever emitted.</p>' +
      '<p>The ' + best.length + ' higher-income, low-vulnerability countries account for ' + f0(sumShare(best)) + '%. ' +
      (richExposed.length === 0 ? 'No country is both higher-income and highly vulnerable.' :
        richExposed.length + ' higher-income countries are also highly vulnerable.') + '</p>' +
      '<p class="read">Pink means more vulnerable, teal means richer, grey is low on both. Each dot in the chart is a country (correlation ' +
      f2(r).replace('-', '−') + ').</p>';
  }

  function methodHTML() {
    if (state.view === 'wealth') {
      return '<p>World Bank series “GDP per capita, PPP (current international $)” for ' + gdpYear +
        ', taken from the ND-GAIN Country Index data release so that Maps 01 and 03 use identical figures. ' +
        'Where ' + gdpYear + ' is missing, the latest value from 2021–2022 is used (' + lateGdpNames() + ').</p>' +
        '<p>GDP per capita is an average. It says nothing about how income is shared inside a country, and it is not household income. ' +
        'Hatched areas have no data.</p>';
    }
    if (state.view === 'annual' || state.view === 'cumulative') {
      return '<p>Global Carbon Budget (2026), distributed by Our World in Data. Territorial ' + CO2 + ' from fossil fuels and industry in ' + co2Year +
        '. Emissions from land-use change, other greenhouse gases and international transport are not included, and nothing is adjusted for trade.</p>' +
        '<p>“Since 1750” is each country’s cumulative emissions divided by its ' + co2Year +
        ' population. It is a way of comparing historical totals between countries of different size, not a measure of what any individual emitted. ' +
        'Rankings list countries with at least 1 million people.</p>';
    }
    return '<p>Vulnerability is the ND-GAIN Country Index vulnerability score for ' + gainYear +
      ' (Notre Dame Global Adaptation Initiative): 0 to 1, higher is more vulnerable, built from exposure, sensitivity and adaptive capacity in food, water, health, ecosystems, habitat and infrastructure. GDP per capita is the Map 01 figure.</p>' +
      '<p>Class breaks are rounded terciles: ' + usd(GDP_BREAKS[0]) + ' and ' + usd(GDP_BREAKS[1]) + ' for GDP per capita, ' + VULN_BREAKS[0] + ' and ' + VULN_BREAKS[1] +
      ' for vulnerability. The income labels are not the World Bank income groups.</p>' +
      '<p>ND-GAIN’s adaptive-capacity indicators themselves follow income, so part of the relationship is built into the score. The map shows where money and vulnerability coincide; it does not prove that one causes the other.</p>';
  }

  function lateGdpNames() {
    return DATA.filter(function (d) { return d.gdp_year && d.gdp_year !== gdpYear; })
      .map(function (d) { return d.name; }).join(', ');
  }

  function pearson(x, y) {
    var mx = d3.mean(x), my = d3.mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < x.length; i++) {
      sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my);
    }
    return sxy / Math.sqrt(sxx * syy);
  }

  /* ---------- tooltip ---------- */

  var tip = document.getElementById('tooltip');

  function row(label, value) { return '<div class="tip-row"><span>' + label + '</span><b>' + value + '</b></div>'; }

  function tipHTML(d, fallbackName) {
    var name = '<div class="tip-name">' + esc(d ? d.name : fallbackName) + '</div>';
    var c = classOf(d);
    if (c == null) return name + '<div class="tip-note">No data for this map</div>';
    if (state.view === 'wealth') {
      return name + row('GDP per person', usd(d.gdp_pc)) +
        row('Rank', RANK.gdp_pc.of.get(d.iso) + ' of ' + RANK.gdp_pc.n) +
        (d.gdp_year !== gdpYear ? '<div class="tip-note">' + d.gdp_year + ' value</div>' : '');
    }
    if (state.view === 'annual') {
      var ratio = d.co2_pc / META.world.co2_pc;
      return name + row(CO2 + ' per person, ' + co2Year, tonnes(d.co2_pc)) +
        row('World average', (ratio >= 10 ? f0(ratio) : ratio >= 0.1 ? f1(ratio) : f2(ratio)) + '×') +
        row('Rank', RANK.co2_pc.of.get(d.iso) + ' of ' + RANK.co2_pc.n);
    }
    if (state.view === 'cumulative') {
      return name + row('Per person, since 1750', tonnes(d.co2_cum_pc)) +
        row('Share of world total', pct(d.co2_cum_share)) +
        row('Rank per person', RANK.co2_cum_pc.of.get(d.iso) + ' of ' + RANK.co2_cum_pc.n);
    }
    return name + '<div class="tip-class"><i style="background:' + bivColor(c) + '"></i>' + bivLabel(c) + '</div>' +
      row('GDP per person', usd(d.gdp_pc)) + row('Vulnerability, 0 to 1', f3(d.vuln));
  }

  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = x + 16, top = y + 16;
    if (left + w > window.innerWidth - 8) left = x - w - 12;
    if (top + h > window.innerHeight - 8) top = y - h - 12;
    tip.style.transform = 'translate(' + Math.max(8, left) + 'px,' + Math.max(8, top) + 'px)';
  }
  function hideTip() { tip.hidden = true; }

  /* ---------- map ---------- */

  var stage = document.getElementById('mapwrap');
  var svg = d3.select('#map');
  var defs = svg.append('defs');
  var hatch = defs.append('pattern').attr('id', 'hatch').attr('patternUnits', 'userSpaceOnUse')
    .attr('width', 5).attr('height', 5).attr('patternTransform', 'rotate(45)');
  hatch.append('rect').attr('width', 5).attr('height', 5).attr('fill', '#eef1f0');
  hatch.append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 5).attr('stroke', '#bfc9cb').attr('stroke-width', 1.6);

  var root = svg.append('g');
  var sphere = root.append('path').attr('class', 'sphere').datum({ type: 'Sphere' });
  var graticule = root.append('path').attr('class', 'graticule').datum(d3.geoGraticule().step([30, 30])());
  var gLand = root.append('g');
  var borders = root.append('path').attr('class', 'borders')
    .datum(topojson.mesh(TOPO, TOPO.objects.countries, function (a, b) { return a !== b; }));
  var coast = root.append('path').attr('class', 'coast')
    .datum(topojson.mesh(TOPO, TOPO.objects.countries, function (a, b) { return a === b; }));
  var gMarkers = root.append('g');
  var hoverOutline = root.append('path').attr('class', 'outline hover');
  var selOutline = root.append('path').attr('class', 'outline selected');
  var hoverRing = root.append('circle').attr('class', 'ring hover').attr('display', 'none');
  var selRing = root.append('circle').attr('class', 'ring selected').attr('display', 'none');

  var features = topojson.feature(TOPO, TOPO.objects.countries).features.map(function (f) {
    var a3 = f.properties.a3;
    f.iso = ALIAS[a3] || a3;
    f.datum = byIso.get(f.iso);
    f.label = f.datum ? f.datum.name : f.properties.name;
    f.context = a3 === 'ATA';
    f.small = !f.context && !!f.datum && d3.geoArea(f) < 1.6e-4;
    return f;
  });
  var featuresByIso = d3.group(features, function (f) { return f.iso; });
  var smalls = features.filter(function (f) { return f.small; });

  var projection = d3.geoEqualEarth().rotate([-11, 0]);
  var path = d3.geoPath(projection);
  var W = 0, H = 0, K = 1;
  var MARKER_R = 3.6;
  var lastPointer = 'mouse';

  var lands = gLand.selectAll('path').data(features).join('path')
    .attr('class', function (f) { return 'land' + (f.context ? ' context' : ''); });

  var markers = gMarkers.selectAll('circle').data(smalls).join('circle').attr('class', 'marker');

  function interactive(sel) {
    sel.on('pointerenter pointermove', function (ev, f) {
      if (f.context) return;
      lastPointer = ev.pointerType || 'mouse';
      setHover(f.iso);
      if (lastPointer !== 'touch') showTip(tipHTML(f.datum, f.label), ev.clientX, ev.clientY);
    }).on('pointerleave', function () {
      setHover(null); hideTip();
    }).on('click', function (ev, f) {
      if (f.context) return;
      ev.stopPropagation();
      select(state.selected === f.iso ? null : f.iso);
      if (lastPointer === 'touch' && state.selected) showTip(tipHTML(f.datum, f.label), ev.clientX, ev.clientY);
    });
  }
  interactive(lands);
  interactive(markers);

  svg.on('click', function () { hideTip(); select(null); });

  var zoom = d3.zoom().scaleExtent([1, 14]).on('zoom', function (ev) {
    K = ev.transform.k;
    root.attr('transform', ev.transform);
    markers.attr('r', MARKER_R / K);
    hoverRing.attr('r', (MARKER_R + 2.5) / K);
    selRing.attr('r', (MARKER_R + 3) / K);
    hatch.attr('patternTransform', 'rotate(45) scale(' + (1 / K) + ')');
    if (ev.sourceEvent) hideTip();
  });
  svg.call(zoom).on('dblclick.zoom', null);

  function layout() {
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    W = w; H = h;
    var narrow = w < 620;
    MARKER_R = narrow ? 2.4 : 3.6;
    svg.attr('viewBox', '0 0 ' + W + ' ' + H);
    projection.fitExtent([[narrow ? 8 : 20, narrow ? 50 : 72], [W - (narrow ? 8 : 20), H - (narrow ? 10 : 14)]], { type: 'Sphere' });
    sphere.attr('d', path);
    graticule.attr('d', path);
    lands.attr('d', path);
    borders.attr('d', path);
    coast.attr('d', path);
    smalls.forEach(function (f) { f.xy = projection(d3.geoCentroid(f)); });
    markers.attr('cx', function (f) { return f.xy[0]; }).attr('cy', function (f) { return f.xy[1]; });
    zoom.translateExtent([[0, 0], [W, H]]).extent([[0, 0], [W, H]]);
    svg.call(zoom.transform, d3.zoomIdentity);
    drawOutlines();
  }

  function paint() {
    lands.attr('fill', function (f) {
      if (f.context) return null;
      var c = classOf(f.datum);
      f.cls = c;
      return c == null ? 'url(#hatch)' : colorOf(c);
    });
    markers.each(function (f) { f.cls = classOf(f.datum); })
      .attr('display', function (f) { return f.cls == null ? 'none' : null; })
      .attr('fill', function (f) { return f.cls == null ? null : colorOf(f.cls); });
    applyHighlight();
  }

  function applyHighlight() {
    var h = state.highlight;
    lands.classed('dim', function (f) { return h != null && !f.context && f.cls !== h; });
    markers.classed('dim', function (f) { return h != null && f.cls !== h; });
  }

  var hoverIso = null;
  function setHover(iso) {
    if (iso === hoverIso) return;
    hoverIso = iso;
    drawOutlines();
    d3.selectAll('.biv .dot').attr('r', function (d) { return d.iso === iso ? 4.6 : 2.7; });
  }

  function outlineFor(iso, outlineSel, ringSel) {
    var fs = iso ? featuresByIso.get(iso) : null;
    outlineSel.attr('d', fs ? fs.map(function (f) { return path(f); }).join(' ') : null);
    var small = fs && fs.find(function (f) { return f.small && f.cls != null; });
    if (small) ringSel.attr('display', null).attr('cx', small.xy[0]).attr('cy', small.xy[1]);
    else ringSel.attr('display', 'none');
  }
  function drawOutlines() {
    outlineFor(hoverIso && hoverIso !== state.selected ? hoverIso : null, hoverOutline, hoverRing);
    outlineFor(state.selected, selOutline, selRing);
  }

  function zoomTo(iso) {
    var fs = featuresByIso.get(iso);
    if (!fs) return;
    var b = path.bounds({ type: 'FeatureCollection', features: fs });
    var dx = b[1][0] - b[0][0], dy = b[1][1] - b[0][1];
    var cx = (b[0][0] + b[1][0]) / 2, cy = (b[0][1] + b[1][1]) / 2;
    var k = Math.max(1, Math.min(7, 0.42 / Math.max(dx / W, dy / H)));
    if (dx > W * 0.55) { k = 1; cx = W / 2; cy = H / 2; }   // spans the antimeridian
    var t = d3.zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-cx, -cy);
    svg.transition().duration(reduceMotion ? 0 : 650).call(zoom.transform, t);
  }

  d3.select('#zoom-in').on('click', function () { svg.transition().duration(reduceMotion ? 0 : 250).call(zoom.scaleBy, 1.7); });
  d3.select('#zoom-out').on('click', function () { svg.transition().duration(reduceMotion ? 0 : 250).call(zoom.scaleBy, 1 / 1.7); });
  d3.select('#zoom-reset').on('click', function () { svg.transition().duration(reduceMotion ? 0 : 450).call(zoom.transform, d3.zoomIdentity); });

  /* ---------- legend ---------- */

  var legendEl = d3.select('#legend');

  function setHighlight(c) {
    state.highlight = c;
    applyHighlight();
    legendEl.selectAll('.hist-cell').classed('on', function (d, i) { return i === c; });
    legendEl.selectAll('.biv .cell, .bkey-cell').classed('on', function (d) { return d.c === c; });
    legendEl.selectAll('.biv .dot').classed('off', function (d) { return c != null && d.c !== c; });
  }

  function drawLegend() {
    var v = VIEWS[state.view];
    legendEl.html('').classed('is-biv', v.kind === 'biv');
    state.highlight = null;
    if (v.kind === 'biv') return drawScatter();

    var n = v.colors.length;
    var counts = d3.range(n).map(function () { return 0; });
    var missing = 0;
    features.forEach(function (f) { if (!f.context && f.datum == null) missing++; });
    DATA.forEach(function (d) { if (d[v.key] != null) counts[d3.bisectRight(v.breaks, d[v.key])]++; });
    var max = d3.max(counts);

    legendEl.append('p').attr('class', 'block-title').html(v.legendTitle);
    var hist = legendEl.append('div').attr('class', 'hist');
    var cells = hist.selectAll('button').data(counts).join('button')
      .attr('type', 'button').attr('class', 'hist-cell')
      .attr('aria-label', function (c, i) {
        var lo = i === 0 ? 'under ' + v.ticks[0] : i === n - 1 ? 'over ' + v.ticks[n - 2] : v.ticks[i - 1] + ' to ' + v.ticks[i];
        return c + ' countries, ' + lo + '. Highlight on the map.';
      })
      .on('pointerenter focus', function (ev, c) { setHighlight(cells.nodes().indexOf(this)); })
      .on('pointerleave blur', function () { setHighlight(null); });
    cells.append('span').attr('class', 'hist-n').text(function (c) { return c; });
    cells.append('span').attr('class', 'hist-bar')
      .style('height', function (c) { return Math.max(8, Math.round(46 * c / max)) + 'px'; })
      .style('background', function (c, i) { return v.colors[i]; });

    var ticks = legendEl.append('div').attr('class', 'scale-ticks');
    v.ticks.forEach(function (t, i) {
      ticks.append('span').style('left', ((i + 1) / n * 100) + '%').text(t);
    });

    if (v.mark) {
      var ci = d3.bisectRight(v.breaks, v.mark.value);
      var lo = ci === 0 ? 0 : v.breaks[ci - 1], hi = v.breaks[ci];
      var pos = (ci + (v.mark.value - lo) / (hi - lo)) / n * 100;
      legendEl.append('div').attr('class', 'scale-mark').append('span').style('left', pos + '%').text(v.mark.label);
    }

    legendEl.append('p').attr('class', 'legend-notes')
      .html('<span><i class="nodata-key"></i>No data</span>');
  }

  function drawScatter() {
    var both = DATA.filter(function (d) { return bivClass(d) != null; })
      .map(function (d) { return { iso: d.iso, d: d, c: bivClass(d) }; });
    var Wd = 430, Hd = 190, m = { l: 48, r: 8, t: 6, b: 38 };
    var xb = [700, GDP_BREAKS[0], GDP_BREAKS[1], 200000];
    var yb = [0.22, VULN_BREAKS[0], VULN_BREAKS[1], 0.68];
    var x = d3.scaleLog().domain([xb[0], xb[3]]).range([m.l, Wd - m.r]);
    var y = d3.scaleLinear().domain([yb[0], yb[3]]).range([Hd - m.b, m.t]);
    var counts = d3.rollup(both, function (a) { return a.length; }, function (p) { return p.c; });

    legendEl.append('p').attr('class', 'block-title').text('Every country by income and vulnerability. Colours match the map.');
    var s = legendEl.append('svg').attr('class', 'biv').attr('viewBox', '0 0 ' + Wd + ' ' + Hd)
      .attr('role', 'img').attr('aria-label', 'Scatter plot of GDP per capita against climate vulnerability, divided into nine colour classes');

    var cellData = [];
    for (var gy = 0; gy < 3; gy++) for (var gx = 0; gx < 3; gx++) cellData.push({ gx: gx, gy: gy, c: gy * 3 + gx });

    s.selectAll('rect.cell').data(cellData).join('rect').attr('class', 'cell')
      .attr('x', function (d) { return x(xb[d.gx]); })
      .attr('y', function (d) { return y(yb[d.gy + 1]); })
      .attr('width', function (d) { return x(xb[d.gx + 1]) - x(xb[d.gx]); })
      .attr('height', function (d) { return y(yb[d.gy]) - y(yb[d.gy + 1]); })
      .attr('fill', function (d) { return bivColor(d.c); })
      .on('pointerenter', function (ev, d) { setHighlight(d.c); })
      .on('pointerleave', function () { setHighlight(null); })
      .append('title').text(function (d) { return bivLabel(d.c) + ': ' + (counts.get(d.c) || 0) + ' countries'; });

    s.append('rect').attr('class', 'frame').attr('x', m.l).attr('y', m.t).attr('width', Wd - m.l - m.r).attr('height', Hd - m.t - m.b);

    [[1000, '$1k'], [10000, '$10k'], [30000, '$30k'], [100000, '$100k']].forEach(function (t) {
      s.append('text').attr('x', x(t[0])).attr('y', Hd - m.b + 14).attr('text-anchor', 'middle').text(t[1]);
    });
    [0.25, 0.38, 0.48, 0.6].forEach(function (t) {
      s.append('text').attr('x', m.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t.toFixed(2));
    });
    s.append('text').attr('class', 'axis-title').attr('x', m.l).attr('y', Hd - 6).text('GDP per person, log scale');
    s.append('text').attr('class', 'axis-title').attr('transform', 'translate(11,' + (Hd - m.b) + ') rotate(-90)').text('Climate vulnerability');

    s.selectAll('circle.dot').data(both).join('circle').attr('class', 'dot')
      .attr('cx', function (p) { return x(p.d.gdp_pc); })
      .attr('cy', function (p) { return y(p.d.vuln); })
      .attr('r', 2.7)
      .on('pointerenter pointermove', function (ev, p) {
        setHover(p.iso); setHighlight(null);
        showTip(tipHTML(p.d), ev.clientX, ev.clientY);
      })
      .on('pointerleave', function () { setHover(null); hideTip(); })
      .on('click', function (ev, p) { select(p.iso); zoomTo(p.iso); });

    s.append('text').attr('class', 'sel-label');
    markScatterSelection();

    var side = legendEl.append('div').attr('class', 'bkey-side');
    var key = side.append('div').attr('class', 'bkey');
    key.append('span').attr('class', 'bkey-y').text('More vulnerable \u2192');
    var keyCells = cellData.slice().sort(function (a, b) { return b.gy - a.gy || a.gx - b.gx; });
    key.append('div').attr('class', 'bkey-grid').selectAll('button').data(keyCells).join('button')
      .attr('type', 'button')
      .attr('class', function (d) { return 'bkey-cell' + (d.c === 7 || d.c === 8 ? ' light' : ''); })
      .style('background', function (d) { return bivColor(d.c); })
      .attr('aria-label', function (d) { return bivLabel(d.c) + ': ' + (counts.get(d.c) || 0) + ' countries. Highlight on the map.'; })
      .text(function (d) { return counts.get(d.c) || 0; })
      .on('pointerenter focus', function (ev, d) { setHighlight(d.c); })
      .on('pointerleave blur', function () { setHighlight(null); });
    key.append('span').attr('class', 'bkey-x').text('Richer \u2192');
    side.append('p').attr('class', 'bkey-note').text('Numbers count the countries in each class.');
    side.append('p').attr('class', 'legend-notes').html('<span><i class="nodata-key"></i>No data</span>');
  }

  function markScatterSelection() {
    var s = legendEl.select('.biv');
    if (s.empty()) return;
    var chosen = null;
    s.selectAll('.dot').classed('sel', function (p) {
      var on = p.iso === state.selected;
      if (on) chosen = this;
      return on;
    });
    var label = s.select('.sel-label');
    if (!chosen) { label.text(''); return; }
    d3.select(chosen).raise();
    label.raise();
    var cx = +chosen.getAttribute('cx'), cy = +chosen.getAttribute('cy');
    var right = cx < 290;
    label.attr('x', cx + (right ? 9 : -9)).attr('y', cy + (cy < 24 ? 14 : -8))
      .attr('text-anchor', right ? 'start' : 'end').text(byIso.get(state.selected).name);
  }

  /* ---------- rankings ---------- */

  function rankList(title, rows, fmt) {
    var box = d3.select('#ranks').append('div');
    box.append('p').attr('class', 'block-title').text(title);
    var li = box.append('ol').selectAll('li').data(rows).join('li');
    var b = li.append('button').attr('type', 'button').attr('class', 'rank-item')
      .on('click', function (ev, d) { select(d.iso); zoomTo(d.iso); })
      .on('pointerenter focus', function (ev, d) { setHover(d.iso); })
      .on('pointerleave blur', function () { setHover(null); });
    b.append('i').style('background', function (d) { return colorOf(classOf(d)); });
    b.append('span').attr('class', 'rank-name').text(function (d) { return d.name; });
    b.append('span').attr('class', 'rank-val').text(fmt);
  }

  function drawRanks() {
    var v = VIEWS[state.view];
    d3.select('#ranks').html('');
    if (v.kind === 'seq') {
      var rows = RANK[v.key].rows;
      if (v.rankFilter) rows = rows.filter(v.rankFilter);
      var f = function (d) { return v.format(d[v.key]); };
      rankList('Highest', rows.slice(0, 6), f);
      rankList('Lowest', rows.slice(-6).reverse(), f);
      return;
    }
    var both = RANK.vuln.rows.filter(function (d) { return bivClass(d) != null; });
    var fv = function (d) { return f3(d.vuln); };
    rankList('Lower income, most vulnerable', both.filter(function (d) { return bivClass(d) % 3 === 0; }).slice(0, 6), fv);
    rankList('Higher income, most vulnerable', both.filter(function (d) { return bivClass(d) % 3 === 2; }).slice(0, 6), fv);
  }

  /* ---------- selected country ---------- */

  function fact(label, key, fmt, rankWord) {
    var d = byIso.get(state.selected);
    if (d[key] == null) {
      return '<li class="fact"><span class="fact-label">' + label + '</span><span class="fact-value">No data</span></li>';
    }
    var r = RANK[key], rank = r.of.get(d.iso);
    var pos = r.n > 1 ? (1 - (rank - 1) / (r.n - 1)) * 100 : 50;
    return '<li class="fact"><span class="fact-label">' + label + '</span><span class="fact-value">' + fmt(d[key]) + '</span>' +
      '<span class="fact-track" aria-hidden="true"><i style="left:' + pos.toFixed(1) + '%"></i></span>' +
      '<span class="fact-rank">' + ordinal(rank) + ' ' + rankWord + ' of ' + r.n + '</span></li>';
  }

  function drawCountry() {
    var el = document.getElementById('country');
    var d = state.selected ? byIso.get(state.selected) : null;
    if (!state.selected) {
      el.innerHTML = '<p class="country-hint">Select a country on the map to see its figures for all three maps.</p>';
      return;
    }
    if (!d) {
      var f = featuresByIso.get(state.selected)[0];
      el.innerHTML = '<div class="country-head"><h3 class="country-name">' + esc(f.label) + '</h3>' +
        '<button type="button" class="country-close">Clear</button></div><p class="country-meta">No data in these sources.</p>';
    } else {
      var where = [d.subregion || d.region, d.pop ? people(d.pop) + ' people' : ''].filter(Boolean).join(', ');
      var c = bivClass(d);
      el.innerHTML = '<div class="country-head"><div><h3 class="country-name">' + esc(d.name) + '</h3>' +
        '<p class="country-meta">' + esc(where) + '</p></div><button type="button" class="country-close">Clear</button></div>' +
        '<ul class="facts">' +
        fact('GDP per person' + (d.gdp_year && d.gdp_year !== gdpYear ? ' (' + d.gdp_year + ')' : ''), 'gdp_pc', usd, 'highest') +
        fact(CO2 + ' per person, ' + co2Year, 'co2_pc', tonnes, 'highest') +
        fact(CO2 + ' per person since 1750', 'co2_cum_pc', tonnes, 'highest') +
        fact('Share of all ' + CO2 + ' ever emitted', 'co2_cum_share', pct, 'largest') +
        fact('Climate vulnerability, 0 to 1', 'vuln', f3, 'most vulnerable') +
        '</ul>' +
        (c != null ? '<p class="country-meta" style="margin-top:10px"><i style="display:inline-block;width:11px;height:11px;margin-right:7px;vertical-align:-1px;background:' +
          bivColor(c) + '"></i>Map 03 class: ' + bivLabel(c).toLowerCase() + '</p>' : '');
    }
    el.querySelector('.country-close').addEventListener('click', function () { select(null); });
  }

  function select(iso) {
    if (iso && !featuresByIso.has(iso) && !byIso.has(iso)) iso = null;
    state.selected = iso;
    drawOutlines();
    drawCountry();
    markScatterSelection();
    writeHash();
  }

  /* ---------- panel ---------- */

  var tabsEl = d3.select('#tabs');
  var tabs = tabsEl.selectAll('button').data(MAPS).join('button')
    .attr('type', 'button').attr('class', 'tab').attr('role', 'tab')
    .attr('id', function (m) { return 'tab-' + m.id; })
    .attr('aria-controls', 'story')
    .on('click', function (ev, m) { setMap(MAPS.indexOf(m)); })
    .on('keydown', function (ev, m) {
      var i = MAPS.indexOf(m), j = null;
      if (ev.key === 'ArrowRight') j = (i + 1) % MAPS.length;
      if (ev.key === 'ArrowLeft') j = (i + MAPS.length - 1) % MAPS.length;
      if (j == null) return;
      ev.preventDefault();
      setMap(j);
      tabs.nodes()[j].focus();
    });
  tabs.append('span').attr('class', 'tab-n').text(function (m) { return m.n; });
  tabs.append('span').attr('class', 'tab-l').text(function (m) { return m.tab; });
  tabs.append('span').attr('class', 'tab-ramp').attr('aria-hidden', 'true')
    .selectAll('i').data(function (m) { return m.ramp; }).join('i').style('background', function (c) { return c; });

  function drawLayers() {
    var m = MAPS[state.map], el = d3.select('#layers');
    el.html('');
    el.property('hidden', m.views.length < 2);
    if (m.views.length < 2) return;
    var b = el.selectAll('button').data(m.views).join('button')
      .attr('type', 'button').attr('class', 'layer')
      .attr('aria-pressed', function (v) { return String(v === state.view); })
      .on('click', function (ev, v) { setView(v); });
    b.append('b').text(function (v) { return LAYERS[v].title; });
    b.append('span').text(function (v) { return LAYERS[v].sub; });
  }

  function render() {
    var m = MAPS[state.map];
    tabs.attr('aria-selected', function (t) { return String(t === m); })
      .attr('tabindex', function (t) { return t === m ? 0 : -1; });
    document.getElementById('story').setAttribute('aria-labelledby', 'tab-' + m.id);
    document.getElementById('question').textContent = m.question;
    document.getElementById('indicator').innerHTML = indicatorText();
    document.getElementById('lead').innerHTML = leadHTML();
    document.getElementById('method-body').innerHTML = methodHTML();
    document.getElementById('credit').textContent = VIEWS[state.view].credit;
    document.getElementById('map-title').textContent = m.n + ': ' + m.question;
    document.getElementById('map-desc').textContent = VIEWS[state.view].credit;
    drawLayers();
    drawLegend();
    paint();
    drawRanks();
    drawCountry();
    drawOutlines();
    writeHash();
  }

  function setMap(i) {
    if (i === state.map) return;
    state.map = i;
    state.view = MAPS[i].views[0];
    document.getElementById('story').scrollTop = 0;
    render();
  }
  function setView(v) {
    if (v === state.view) return;
    state.view = v;
    render();
  }

  /* ---------- search ---------- */

  var nameIndex = new Map();
  var options = [];
  features.forEach(function (f) {
    if (f.context || nameIndex.has(f.label.toLowerCase())) return;
    nameIndex.set(f.label.toLowerCase(), f.iso);
    options.push(f.label);
  });
  options.sort(d3.ascending);
  d3.select('#country-list').selectAll('option').data(options).join('option').attr('value', function (d) { return d; });

  var search = document.getElementById('search');
  function runSearch(strict) {
    var q = search.value.trim().toLowerCase();
    if (!q) return;
    var iso = nameIndex.get(q);
    if (!iso && !strict) {
      var hit = options.find(function (o) { return o.toLowerCase().indexOf(q) === 0; }) ||
        options.find(function (o) { return o.toLowerCase().indexOf(q) > -1; });
      if (hit) { iso = nameIndex.get(hit.toLowerCase()); search.value = hit; }
    }
    if (iso) { select(iso); zoomTo(iso); }
  }
  search.addEventListener('input', function () { runSearch(true); });
  search.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { runSearch(false); search.blur(); } });

  /* ---------- URL hash: #emissions, #emissions-since-1750, #adaptation/KAZ ---------- */

  var HASH_VIEW = { wealth: 'wealth', annual: 'emissions', cumulative: 'emissions-since-1750', adapt: 'adaptation' };
  var writing = false;

  function writeHash() {
    var h = '#' + HASH_VIEW[state.view] + (state.selected ? '/' + state.selected : '');
    if (location.hash === h) return;
    writing = true;
    try { history.replaceState(null, '', h); } catch (e) { /* file:// in some browsers */ }
    writing = false;
  }
  function readHash() {
    var parts = location.hash.replace(/^#/, '').split('/');
    var view = Object.keys(HASH_VIEW).find(function (k) { return HASH_VIEW[k] === parts[0]; });
    if (view) {
      state.view = view;
      state.map = MAPS.findIndex(function (m) { return m.views.indexOf(view) > -1; });
    }
    var iso = (parts[1] || '').toUpperCase();
    state.selected = featuresByIso.has(iso) ? iso : null;
  }
  window.addEventListener('hashchange', function () { if (!writing) { readHash(); render(); } });

  /* ---------- start ---------- */

  readHash();
  layout();
  render();

  var resizeTimer;
  new ResizeObserver(function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (stage.clientWidth !== W || stage.clientHeight !== H) { layout(); paint(); }
    }, 120);
  }).observe(stage);
})();
