/*
 * open_plan – modal "Wärmebedarf Quartier" (neighbourhood heat demand), as in the canvas design.
 * Plain JS, no build step, no libraries. Used by modal.html.
 *
 *   0. PLACEHOLDER DATA – MODAL_DATA: building groups, connections, rates, generation.
 *   1. VIEW MODEL – QuartierLogic: sums per row/column, open rows, totals, texts
 *      (taken over from the canvas prototype).
 *   2. TEMPLATES – HTML of the node, the modal and the warning (BEM classes, see modal.scss).
 *   3. RUNTIME – state, redraw, events, focus.
 */

/* ==========================================================================================
   0. PLACEHOLDER DATA
   ========================================================================================== */
var MODAL_DATA = (function () {
  // Connections of the node = edges drawn to it on the canvas (read-only here).
  // Two sets for the prototype: 3 connections, and 24 to show the table with many connections
  // (sticky columns, sideways scrolling). Switch between them in the bar above the modal.
  var few = [{ id: "s1", name: "Wärmenetz" }, { id: "s2", name: "Luft-Wärmepumpe" }, { id: "s3", name: "Gaskessel" }];
  var many = few.slice();
  for (var i = 1; i <= 21; i += 1) {
    many.push({ id: "x" + i, name: (i % 2 ? "Luft-WP Geb. " : "Solarth. Geb. ") + String(i).padStart(2, "0") });
  }
  return {
    startTab: "rates",
    // Building groups (load profiles). type: efh | mfh | schule | gewerbe | own (own = uploaded time series)
    // demand: kWh/a as typed (string), year: construction year
    profiles: [
      { id: 1, name: "Wohnen", type: "efh", demand: "250000", year: "1980" },
      { id: 2, name: "Bildung", type: "schule", demand: "500000", year: "1960" },
      { id: 3, name: "Gewerbehof", type: "gewerbe", demand: "350000", year: "1970" }
    ],
    suppliersFew: few,
    suppliersMany: many,
    manySuppliers: true,     // prototype: start with 24 connections
    // Connection rates in %: key "<profile id>_<supplier id>". Each building group must reach 100 %.
    rates: { "1_s1": "60", "1_s2": "30", "1_s3": "10", "2_s1": "90", "3_s1": "80", "3_s2": "20" },
    // Generation of the heating network (central supply), read from the system: kWh/a per producer
    generation: [
      { name: "Fluss-Wärmepumpe", kwh: 600000, color: "#3a8cc7" },
      { name: "Biomasse-BHKW", kwh: 150000, color: "#e08a2c" },
      { name: "Industrielle Abwärme", kwh: 350000, color: "#4c8c4a" }
    ]
  };
})();


/* ==========================================================================================
   1. VIEW MODEL
   ------------------------------------------------------------------------------------------
   state: open tab, rotated table, entered values … renderVals() returns everything the
   templates in part 2 use; the functions in it (set…, pick, requestClose …) change the state.
   ========================================================================================== */
class QuartierLogic {
  constructor() {
    this.nextId = 100;
    this.state = {
      tab: MODAL_DATA.startTab,  // "profiles" | "rates"
      closed: false,             // modal closed (prototype: click the node to open it again)
      warning: false,            // "Nicht alle Anschlussraten ergeben 100 %" dialog
      rotated: false,            // rates table: suppliers as rows
      genOpen: false,            // details of the central supply
      tsMode: "select",          // time series: select | upload | const
      manySuppliers: MODAL_DATA.manySuppliers,  // prototype only: 24 instead of 3 connections
      editingDemand: null,       // profile whose demand field has focus (shown unformatted)
      profiles: MODAL_DATA.profiles.map(function (p) { return Object.assign({}, p); }),
      rates: Object.assign({}, MODAL_DATA.rates)
    };
  }

  typeLabel(t) {
    return { efh: 'Einfamilienhäuser', mfh: 'Mehrfamilienhäuser', schule: 'Schule', gewerbe: 'Gewerbe', own: 'Eigene Zeitreihe' }[t] || t;
  }

  fmt(n) { return Math.round(n).toLocaleString('de-DE'); }

  updateProfile(id, patch) {
    this.setState({ profiles: this.state.profiles.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  renderVals() {
    const st = this.state;
    const self = this;
    const tab = st.tab || 'rates';
    const num = (x) => parseFloat(x) || 0;

    const suppliers = st.manySuppliers ? MODAL_DATA.suppliersMany : MODAL_DATA.suppliersFew;

    const offRows = [];
    let total = 0;
    let totalKnown = true;
    const rateRows = st.profiles.map((p) => {
      const raw = suppliers.reduce((a, s) => a + num(st.rates[p.id + '_' + s.id]), 0);
      const sum = Math.round(raw * 100) / 100;
      const ok = Math.abs(sum - 100) < 0.01;
      const over = sum > 100.001;
      if (!ok) offRows.push({ name: p.name, sum: sum });
      const color = ok ? '#1e6b47' : (over ? '#b3261e' : '#8a5200');
      const demand = p.type === 'own' ? 0 : num(p.demand);
      return {
        name: p.name,
        sub: self.typeLabel(p.type) + (demand ? ' · ' + self.fmt(demand) + ' kWh' : ''),
        ok: ok, notOk: !ok, sum: sum, color: color,
        hint: ok ? 'vollständig' : (over ? Math.round((sum - 100) * 100) / 100 + ' % zu viel' : Math.round((100 - sum) * 100) / 100 + ' % fehlen'),
        rowBg: ok ? '#ffffff' : '#fffaf2',
        headBg: ok ? '#f6f8fa' : '#fdf3e4',
        sumBg: ok ? '#f1f8f4' : (over ? '#fcf0ef' : '#fdf3e4'),
        cells: suppliers.map((s) => {
          const key = p.id + '_' + s.id;
          return {
            value: st.rates[key] || '',
            border: num(st.rates[key]) > 0 ? '#9fb2c1' : '#dbe3ea',
            aria: p.name + ' über ' + s.name,
            set: (e) => { const v = e.target.value; self.setState({ rates: { ...self.state.rates, [key]: v } }); }
          };
        })
      };
    });

    const genRaw = MODAL_DATA.generation;
    const genSum = genRaw.reduce((a, g) => a + g.kwh, 0);
    const genItems = genRaw.map((g) => {
      const pct = genSum ? (g.kwh / genSum) * 100 : 0;
      return { name: g.name, color: g.color, value: self.fmt(g.kwh), pct: pct, pctLabel: (Math.round(pct * 10) / 10).toLocaleString('de-DE') + ' %' };
    });
    const assigned = st.profiles.reduce((a, p) => (p.type === 'own' ? a : a + num(p.demand) * num(st.rates[p.id + '_s1']) / 100), 0);
    const assignedOver = assigned > genSum + 0.5;
    const assignedLine = 'Davon über Anschlüsse zugewiesen: ' + self.fmt(assigned) + ' kWh (' + (Math.round(assigned / genSum * 1000) / 10).toLocaleString('de-DE') + ' %)' + (assignedOver ? ' · mehr als erzeugt' : '');
    const rot = !!st.rotated;
    const rotRows = suppliers.map((s) => ({
      name: s.name,
      cells: st.profiles.map((p) => {
        const key = p.id + '_' + s.id;
        return {
          value: st.rates[key] || '',
          border: num(st.rates[key]) > 0 ? '#9fb2c1' : '#dbe3ea',
          aria: p.name + ' über ' + s.name,
          set: (e) => { const v = e.target.value; self.setState({ rates: { ...self.state.rates, [key]: v } }); }
        };
      })
    }));

    const profiles = st.profiles.map((p) => {
      if (p.type === 'own') { totalKnown = false; } else { total += num(p.demand); }
      return {
        name: p.name, type: p.type, demand: p.demand, year: p.year,
        demandShown: st.editingDemand === p.id ? p.demand : (p.demand === '' ? '' : self.fmt(num(p.demand))),
        focusDemand: () => self.setState({ editingDemand: p.id }),
        isOwn: p.type === 'own', isStandard: p.type !== 'own',
        setName: (e) => self.updateProfile(p.id, { name: e.target.value }),
        setType: (e) => self.updateProfile(p.id, { type: e.target.value }),
        setDemand: (e) => self.updateProfile(p.id, { demand: e.target.value.replace(/[^\d]/g, '') }),
        setYear: (e) => self.updateProfile(p.id, { year: e.target.value }),
        remove: () => self.setState({ profiles: self.state.profiles.filter((x) => x.id !== p.id) })
      };
    });

    const n = st.profiles.length;
    const summary = n + (n === 1 ? ' Gebäudegruppe' : ' Gebäudegruppen') + ' · ' + (totalKnown ? self.fmt(total) + ' kWh/a gesamt' : 'Gesamtbedarf inkl. eigener Zeitreihen');
    const isP = tab === 'profiles';

    return {
      tabProfiles: isP, tabRates: !isP,
      tabProfilesSel: isP ? 'true' : 'false', tabRatesSel: isP ? 'false' : 'true',
      tabProfilesLine: isP ? '#1f5673' : 'transparent', tabRatesLine: isP ? 'transparent' : '#1f5673',
      tabProfilesColor: isP ? '#1b2b3a' : '#5a6b7b', tabRatesColor: isP ? '#5a6b7b' : '#1b2b3a',
      showProfiles: () => self.setState({ tab: 'profiles' }),
      showRates: () => self.setState({ tab: 'rates' }),
      profiles: profiles,
      suppliers: suppliers,
      supplierCount: suppliers.length,
      manyHint: suppliers.length > 6 && !rot,
      rotated: rot, notRotated: !rot,
      rotatedStr: rot ? 'true' : 'false', notRotatedStr: rot ? 'false' : 'true',
      rotRule: rot ? 'Jede Spalte muss 100 % ergeben.' : 'Jede Zeile muss 100 % ergeben.',
      segABg: rot ? '#ffffff' : '#1f5673', segAFg: rot ? '#3b4d5e' : '#ffffff',
      segBBg: rot ? '#1f5673' : '#ffffff', segBFg: rot ? '#ffffff' : '#3b4d5e',
      rotate: () => self.setState({ rotated: true }),
      unrotate: () => self.setState({ rotated: false }),
      rotRows: rotRows,
      gen: genItems,
      genOpen: !!st.genOpen,
      genOpenStr: st.genOpen ? 'true' : 'false',
      genRot: st.genOpen ? 90 : 0,
      genLabel: st.genOpen ? 'Details ausblenden' : 'Details anzeigen',
      toggleGen: () => self.setState({ genOpen: !self.state.genOpen }),
      genTotal: self.fmt(genSum),
      assignedLine: assignedLine,
      assignedColor: assignedOver ? '#b3261e' : '#5a6b7b',
      assignedWeight: assignedOver ? 700 : 400,
      blurDemand: () => self.setState({ editingDemand: null }),
      genAria: 'Erzeugung Wärmenetz: ' + genItems.map((g) => g.name + ' ' + g.value + ' kWh (' + g.pctLabel + ')').join(', '),
      tsSelect: (st.tsMode || 'select') === 'select',
      tsUpload: st.tsMode === 'upload',
      tsConst: st.tsMode === 'const',
      tsModes: [['select', 'Auswählen'], ['upload', 'Hinzufügen'], ['const', 'Konstanter Wert']].map((m, i) => {
        const on = (st.tsMode || 'select') === m[0];
        return {
          label: m[1],
          sel: on ? 'true' : 'false',
          bg: on ? '#1f5673' : '#ffffff',
          fg: on ? '#ffffff' : '#3b4d5e',
          divider: i === 0 ? '0' : '1px solid #c3cfd9',
          pick: () => self.setState({ tsMode: m[0] })
        };
      }),
      gridCols: '200px repeat(' + suppliers.length + ', minmax(120px, 1fr)) 130px',
      rateRows: rateRows,
      offRows: offRows,
      hasOff: offRows.length > 0,
      offCount: offRows.length,
      summary: summary,
      open: !st.closed, closed: st.closed,
      warning: st.warning && !st.closed,
      addProfile: () => { self.nextId += 1; self.setState({ profiles: self.state.profiles.concat([{ id: self.nextId, name: 'Neue Gruppe', type: 'efh', demand: '', year: '' }]) }); },
      fillRest: () => {
        const r = { ...self.state.rates };
        self.state.profiles.forEach((p) => {
          const sum = suppliers.reduce((a, s) => a + num(r[p.id + '_' + s.id]), 0);
          if (sum < 100) {
            const k = p.id + '_' + suppliers[0].id;
            r[k] = String(Math.round((num(r[k]) + 100 - sum) * 100) / 100);
          }
        });
        self.setState({ rates: r });
      },
      requestClose: () => { if (offRows.length) { self.setState({ warning: true }); } else { self.setState({ closed: true }); } },
      forceClose: () => self.setState({ closed: true, warning: false }),
      goFix: () => self.setState({ warning: false, tab: 'rates' }),
      nodeTitle: offRows.length ? 'Anschlussraten unvollständig: ' + offRows.map((o) => o.name + ' ' + o.sum + ' %').join(', ') : 'Wärmebedarf Quartier bearbeiten',
      setFew: () => self.setState({ manySuppliers: false }),
      setMany: () => self.setState({ manySuppliers: true }),
      manyStr: st.manySuppliers ? 'true' : 'false', fewStr: st.manySuppliers ? 'false' : 'true',
      reopen: () => self.setState(offRows.length ? { closed: false, tab: 'rates' } : { closed: false })
    };
  }
}


/* ==========================================================================================
   2. TEMPLATES
   ------------------------------------------------------------------------------------------
   HTML for each part, from the view model (part 1). Static styling: modal.scss (BEM, qm-).
   Only data-driven values (bar widths, colours) are inline styles.
   bind("click", fn, key) marks an element for the event handling in part 3; key keeps the
   focus (and the caret) on that control after the modal is redrawn.
   ========================================================================================== */

var ICON = {
  close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  trash: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"></path></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>',
  help: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.5v.7M12 17h.01"></path></svg>',
  upload: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"></path></svg>',
  chevron: '<svg class="qm-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"></path></svg>',
  warn: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path></svg>',
  node: '<svg width="42" height="28" viewBox="0 0 36 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 14l5-5 5 5v8H2zM13 10l5-5 5 5v12H13zM24 14l5-5 5 5v8H24z"></path><path d="M5 17h4M16 13h4M27 17h4"></path></svg>'
};

var esc = function (value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c];
  });
};
var map = function (list, fn) { return (list || []).map(fn).join(""); };

var TYPES = [["efh", "Einfamilienhäuser"], ["mfh", "Mehrfamilienhäuser"], ["schule", "Schule"], ["gewerbe", "Gewerbe"], ["own", "Eigene Zeitreihe"]];

// PROTOTYPE ONLY: bar above the modal to switch 3 / 24 connections and to open the modal again.
// In the app the modal opens from the node on the canvas (the red dot marks incomplete rates).
var tplNode = function (v) {
  return '<div class="qm-proto">' +
    '<span class="qm-proto__label">Prototyp</span>' +
    '<div class="qm-segmented" role="group" aria-label="Anzahl Anschlüsse">' +
      '<button type="button" aria-pressed="' + v.fewStr + '"' + bind("click", v.setFew, "few") + '>3 Anschlüsse</button>' +
      '<button type="button" aria-pressed="' + v.manyStr + '"' + bind("click", v.setMany, "many") + '>24 Anschlüsse</button>' +
    '</div>' +
    (v.open ? "" : '<button type="button" class="qm-btn qm-btn--primary qm-proto__open" title="' + esc(v.nodeTitle) + '"' + bind("click", v.reopen, "node") + '>' +
      'Modal öffnen' + (v.hasOff ? '<span class="qm-dot" role="img" aria-label="Anschlussraten unvollständig"></span>' : "") + '</button>') +
  '</div>';
};

// one % field of the rates table (text + inputmode, so the caret survives a redraw)
var tplRate = function (c, key) {
  return '<div class="qm-rate' + (Number(c.value) > 0 ? " qm-rate--filled" : "") + '">' +
    '<input type="text" inputmode="decimal" placeholder="0" aria-label="' + esc(c.aria) + '" value="' + esc(c.value) + '"' + bind("input", c.set, key) + '>' +
    '<span>%</span></div>';
};

var tplSum = function (r) {
  return '<div class="qm-sum__value">' + (r.ok ? ICON.check : ICON.warn) + '<span>' + esc(r.sum) + ' %</span></div>';
};
// state of a row/column sum: ok (100 %), under, over
var sumState = function (r) { return r.ok ? "ok" : (r.sum > 100.001 ? "over" : "under"); };

var tplProfiles = function (v) {
  var rows = map(v.profiles, function (p, i) {
    var k = "p" + i + "-";
    return '<div class="qm-profiles__row">' +
      '<input class="qm-input" type="text" aria-label="Name" value="' + esc(p.name) + '"' + bind("input", p.setName, k + "name") + '>' +
      '<select class="qm-input" aria-label="Lastgangtyp von ' + esc(p.name) + '"' + bind("change", p.setType, k + "type") + '>' +
        map(TYPES, function (t) { return '<option value="' + t[0] + '"' + (t[0] === p.type ? " selected" : "") + '>' + t[1] + '</option>'; }) +
      '</select>' +
      (p.isStandard
        ? '<div class="qm-unit-field"><input type="text" inputmode="numeric" aria-label="Jährlicher Wärmebedarf von ' + esc(p.name) + '" value="' + esc(p.demandShown) + '"' +
            bind("input", p.setDemand, k + "demand") + bind("focus", p.focusDemand) + bind("blur", v.blurDemand) + '><span>kWh/a</span></div>'
        : '<select class="qm-input" aria-label="Zeitreihe für ' + esc(p.name) + '"' + bind("change", function () {}, k + "series") + '><option>Zeitreihe wählen…</option><option>[Zeitreihe A]</option><option>[Zeitreihe B]</option><option>+ Neue hochladen</option></select>') +
      '<input class="qm-input" type="text" inputmode="numeric" maxlength="4" aria-label="Baujahr von ' + esc(p.name) + '" value="' + esc(p.year) + '"' + bind("input", p.setYear, k + "year") + '>' +
      '<button type="button" class="qm-icon-btn" aria-label="' + esc(p.name) + ' entfernen"' + bind("click", p.remove, k + "remove") + '>' + ICON.trash + '</button>' +
    '</div>';
  });
  return '<div class="qm-profiles">' +
      '<div class="qm-profiles__row qm-profiles__row--head"><div>Name</div><div>Lastgangtyp</div><div>Jährlicher Wärmebedarf</div><div>Baujahr</div><div></div></div>' +
      rows +
      '<button type="button" class="qm-profiles__add"' + bind("click", v.addProfile, "add-profile") + '>' + ICON.plus + 'Lastgang hinzufügen</button>' +
    '</div>' +

    // time series of the whole node (replaces the profiles above)
    '<div class="qm-block">' +
      '<div class="qm-label">Zeitreihe Quartier (kWh)<span class="qm-help" role="img" aria-label="Hilfe zu Zeitreihe" title="Gilt für den gesamten Quartiersknoten: zeitlicher Verlauf des Wärmebedarfs aus der Bibliothek wählen, neu hochladen oder als konstanten Wert angeben">' + ICON.help + '</span></div>' +
      '<div class="qm-note qm-note--tight">Ersetzt die Lastprofile oben.</div>' +
      '<div class="qm-modes" role="tablist">' + map(v.tsModes, function (m, i) {
        return '<button type="button" role="tab" class="qm-modes__btn" aria-selected="' + m.sel + '"' + bind("click", m.pick, "ts-" + i) + '>' + esc(m.label) + '</button>';
      }) + '</div>' +
      (v.tsSelect ? '<select class="qm-input qm-input--tall" aria-label="Zeitreihe auswählen"><option>Wählen Sie eine Zeitreihe aus</option><option>[Zeitreihe A]</option><option>[Zeitreihe B]</option></select>' : "") +
      (v.tsUpload ? '<label class="qm-drop">' + ICON.upload + '<span>CSV- oder Excel-Datei hierher ziehen oder <b>durchsuchen</b></span><input type="file" accept=".csv,.xlsx" hidden></label>' : "") +
      (v.tsConst ? '<div class="qm-unit-field qm-unit-field--const"><input type="number" min="0" aria-label="Konstanter Wert in kWh" placeholder="0"><span>kWh</span></div>' : "") +
    '</div>' +

    // central supply: generation of the heating network and how much of it is assigned
    '<div class="qm-block qm-block--supply">' +
      '<div class="qm-block__head"><div class="qm-block__title">Zentrale Energieversorgung</div><div class="qm-note">Erzeugung Wärmenetz · ' + esc(v.genTotal) + ' kWh gesamt</div></div>' +
      '<div class="qm-gen" role="img" aria-label="' + esc(v.genAria) + '">' + map(v.gen, function (g) { return '<div style="width: ' + g.pct + '%; background: ' + g.color + '"></div>'; }) + '</div>' +
      '<div class="qm-gen-legend">' + map(v.gen, function (g) {
        return '<div class="qm-gen-legend__item"><span class="qm-swatch" style="background: ' + g.color + '"></span><span>' + esc(g.name) + '</span><span class="qm-muted">' + esc(g.pctLabel) + '</span></div>';
      }) + '</div>' +
      '<div class="qm-note' + (v.assignedWeight === 700 ? " qm-note--error" : "") + '">' + esc(v.assignedLine) + '</div>' +
      '<button type="button" class="qm-link-btn" aria-expanded="' + v.genOpenStr + '"' + bind("click", v.toggleGen, "gen") + '>' + ICON.chevron + esc(v.genLabel) + '</button>' +
      (v.genOpen ? '<table class="qm-gen-table"><thead><tr><th scope="col">Parameter</th>' + map(v.gen, function (g) { return '<th scope="col">' + esc(g.name) + '</th>'; }) + '</tr></thead>' +
        '<tbody><tr><th scope="row">Erzeugung gesamt</th>' + map(v.gen, function (g) { return '<td>' + esc(g.value) + ' kWh</td>'; }) + '</tr></tbody></table>' : "") +
    '</div>';
};

var tplRates = function (v) {
  var head = '<div class="qm-rates__intro"><div class="qm-rates__text">Wie viel Prozent ihres Wärmebedarfs bezieht jede Gebäudegruppe über welchen Anschluss? ' + esc(v.rotRule) + '</div>' +
    '<div class="qm-segmented">' +
      '<button type="button" aria-pressed="' + v.notRotatedStr + '"' + bind("click", v.unrotate, "unrotate") + '>Gebäude als Zeilen</button>' +
      '<button type="button" aria-pressed="' + v.rotatedStr + '"' + bind("click", v.rotate, "rotate") + '>Anschlüsse als Zeilen</button>' +
    '</div></div>';

  if (v.notRotated) {
    // building groups as rows; sticky first column and sticky Σ column, scrolls sideways
    return head + '<div class="qm-table"><div class="qm-table__inner">' +
      '<div class="qm-table__row qm-table__row--head"><div class="qm-table__first">Gebäude</div>' +
        map(v.suppliers, function (s) { return '<div class="qm-table__cell" title="' + esc(s.name) + '">' + esc(s.name) + '</div>'; }) +
        '<div class="qm-table__sum">Σ</div></div>' +
      map(v.rateRows, function (r, ri) {
        var stt = sumState(r);
        return '<div class="qm-table__row' + (r.ok ? "" : " is-open") + '"><div class="qm-table__first"><span>' + esc(r.name) + '</span></div>' +
          map(r.cells, function (c, ci) { return '<div class="qm-table__cell">' + tplRate(c, "rate-" + ri + "-" + ci) + '</div>'; }) +
          '<div class="qm-table__sum qm-sum qm-sum--' + stt + '">' + tplSum(r) + '</div></div>';
      }) +
    '</div></div>';
  }
  // suppliers as rows; each column (building group) must reach 100 %
  return head + '<div class="qm-table qm-table--rotated"><div class="qm-table__inner">' +
    '<div class="qm-table__row qm-table__row--head qm-table__row--sticky-top"><div class="qm-table__first">Anschluss</div>' +
      map(v.rateRows, function (g) { return '<div class="qm-table__cell">' + esc(g.name) + '</div>'; }) + '</div>' +
    map(v.rotRows, function (s, si) {
      return '<div class="qm-table__row"><div class="qm-table__first"><span>' + esc(s.name) + '</span></div>' +
        map(s.cells, function (c, ci) { return '<div class="qm-table__cell">' + tplRate(c, "rot-" + si + "-" + ci) + '</div>'; }) + '</div>';
    }) +
    '<div class="qm-table__row qm-table__row--foot"><div class="qm-table__first">Σ</div>' +
      map(v.rateRows, function (g) { return '<div class="qm-table__cell qm-sum qm-sum--' + sumState(g) + '">' + tplSum(g) + '</div>'; }) + '</div>' +
  '</div></div>';
};

var tplModal = function (v) {
  if (!v.open) { return ""; }
  return '<div class="qm-backdrop">' +
    '<div class="qm-modal" role="dialog" aria-modal="true" aria-labelledby="qm-title">' +
      '<div class="qm-modal__head"><h2 class="qm-modal__title" id="qm-title">Wärmebedarf Quartier</h2>' +
        '<button type="button" class="qm-modal__close" aria-label="Schließen"' + bind("click", v.requestClose, "close") + '>' + ICON.close + '</button></div>' +
      '<div class="qm-modal__body">' +
        '<div class="qm-modal__name"><label class="qm-field">Name<input class="qm-input qm-input--tall" type="text" value="Wärmebedarf Quartier"' + bind("input", function () {}, "node-name") + '></label></div>' +
        '<div class="qm-tabs" role="tablist">' +
          '<button type="button" role="tab" class="qm-tabs__tab" aria-selected="' + v.tabProfilesSel + '"' + bind("click", v.showProfiles, "tab-profiles") + '>Lastprofile</button>' +
          '<button type="button" role="tab" class="qm-tabs__tab" aria-selected="' + v.tabRatesSel + '"' + bind("click", v.showRates, "tab-rates") + '>Anschlussraten' +
            '<span class="qm-tabs__count">' + v.supplierCount + '</span>' +
            (v.hasOff ? '<span class="qm-dot" role="img" aria-label="Nicht alle Zeilen ergeben 100 %" title="Nicht alle Zeilen ergeben 100 %"></span>' : "") + '</button>' +
        '</div>' +
        '<div class="qm-modal__panel" role="tabpanel">' + (v.tabProfiles ? tplProfiles(v) : tplRates(v)) + '</div>' +
      '</div>' +
      '<div class="qm-modal__foot"><div class="qm-note">' + esc(v.summary) + '</div>' +
        '<div class="qm-modal__actions">' +
          '<button type="button" class="qm-btn"' + bind("click", v.requestClose, "cancel") + '>Abbrechen</button>' +
          '<button type="button" class="qm-btn qm-btn--primary"' + bind("click", v.requestClose, "save") + '>Speichern</button>' +
        '</div></div>' +
    '</div>' +
  '</div>';
};

// shown on Close / Cancel / Save while a building group is not at 100 %
var tplWarning = function (v) {
  if (!v.warning) { return ""; }
  return '<div class="qm-backdrop qm-backdrop--alert">' +
    '<div class="qm-alert" role="alertdialog" aria-modal="true" aria-labelledby="qm-warn-title" aria-describedby="qm-warn-text">' +
      '<div class="qm-alert__head"><div class="qm-alert__icon">' + ICON.warn.replace('width="15" height="15"', 'width="20" height="20"') + '</div>' +
        '<div><div class="qm-alert__title" id="qm-warn-title">Nicht alle Anschlussraten ergeben 100 %</div>' +
        '<div class="qm-alert__text" id="qm-warn-text">Diese Gebäudegruppen sind noch nicht vollständig verteilt:</div></div></div>' +
      '<div class="qm-alert__list">' + map(v.offRows, function (o) { return '<div class="qm-alert__row"><span>' + esc(o.name) + '</span><b>' + esc(o.sum) + ' %</b></div>'; }) + '</div>' +
      '<div class="qm-alert__actions">' +
        '<button type="button" class="qm-btn"' + bind("click", v.forceClose, "force-close") + '>Trotzdem schließen</button>' +
        '<button type="button" class="qm-btn qm-btn--primary"' + bind("click", v.goFix, "go-fix") + '>Zu den Anschlussraten</button>' +
      '</div>' +
    '</div>' +
  '</div>';
};


/* ==========================================================================================
   3. RUNTIME
   ------------------------------------------------------------------------------------------
   One state object (part 1); every change redraws the node, the modal and the warning.
   Events are delegated: bind() stores the handler, the listeners below call it.
   ========================================================================================== */

var handlers = [];
function bind(type, fn, key) {
  if (typeof fn !== "function") { return ""; }
  handlers.push(fn);
  return ' data-' + type + '="' + (handlers.length - 1) + '"' + (key ? ' data-k="' + esc(key) + '"' : "");
}

function renderParts(logic) {
  handlers = [];
  var v = logic.renderVals();
  return { node: tplNode(v), modal: tplModal(v), warning: tplWarning(v) };
}

if (typeof document !== "undefined") {
  (function () {
    "use strict";
    var root = document.querySelector("[data-qm]");
    if (!root) { return; }
    var el = { node: root.querySelector("[data-qm-node]"), modal: root.querySelector("[data-qm-modal]"), warning: root.querySelector("[data-qm-warning]") };
    var logic = new QuartierLogic();

    var render = function () {
      // keep focus and caret on the same control
      var active = document.activeElement;
      var key = active && active.getAttribute && active.getAttribute("data-k");
      var caret = null;
      try { caret = active && active.selectionStart != null ? [active.selectionStart, active.selectionEnd] : null; } catch (err) { caret = null; }
      var scroll = el.modal.querySelector(".qm-modal__body");
      var scrollPos = scroll ? [scroll.scrollTop, (scroll.querySelector(".qm-table") || {}).scrollLeft || 0] : null;
      var wasWarning = !!logic._lastWarning;

      var parts = renderParts(logic);
      el.node.innerHTML = parts.node;
      el.modal.innerHTML = parts.modal;
      el.warning.innerHTML = parts.warning;
      logic._lastWarning = !!parts.warning;

      var body = el.modal.querySelector(".qm-modal__body");
      if (body && scrollPos) {
        body.scrollTop = scrollPos[0];
        var table = body.querySelector(".qm-table");
        if (table) { table.scrollLeft = scrollPos[1]; }
      }
      if (parts.warning && !wasWarning) {
        el.warning.querySelector('[data-k="go-fix"]').focus();       // the alert takes the focus
      } else if (key) {
        var target = root.querySelector('[data-k="' + key + '"]');
        if (target) {
          target.focus({ preventScroll: true });
          if (caret) { try { target.setSelectionRange(caret[0], caret[1]); } catch (err) { /* number inputs */ } }
        } else if (key === "close" || key === "cancel" || key === "save" || key === "force-close") {
          var opener = el.node.querySelector('[data-k="node"]');      // modal closed: back to the opener
          if (opener) { opener.focus(); }
        }
      }
    };
    // focus/blur handlers redraw on the next tick, so the browser can first move the focus
    var later = null;
    logic.setState = function (patch) {
      Object.assign(logic.state, patch);
      if (logic._deferred) {
        clearTimeout(later);
        later = setTimeout(render, 0);
      } else {
        render();
      }
    };
    var call = function (attr, e, deferred) {
      var t = e.target.closest && e.target.closest("[" + attr + "]");
      if (!t) { return; }
      logic._deferred = deferred;
      handlers[Number(t.getAttribute(attr))](e);
      logic._deferred = false;
    };
    root.addEventListener("click", function (e) { call("data-click", e, false); });
    root.addEventListener("input", function (e) { call("data-input", e, false); });
    root.addEventListener("change", function (e) { call("data-change", e, false); });
    root.addEventListener("focusin", function (e) { call("data-focus", e, true); });
    // ignore the blur of a field that a redraw just removed (its replacement gets the focus)
    root.addEventListener("focusout", function (e) { if (e.target.isConnected) { call("data-blur", e, true); } });
    // Escape: closes the warning, otherwise asks to close the modal
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") { return; }
      var v = logic.renderVals();
      if (v.warning) { v.goFix(); } else if (v.open) { v.requestClose(); }
    });
    render();
    var first = el.modal.querySelector(".qm-tabs__tab[aria-selected=\"true\"]");
    if (first) { first.focus(); }
  })();
}
