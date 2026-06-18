// script.js — FTMO-style Trade Journal app with Advanced Liquidity Analytics
const LS_KEY = 'tj_ftmo_v1';
let trades = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

// DOM refs
const pages = {
  dashboard: document.getElementById('dashboard'),
  journal: document.getElementById('journal'),
  newTrade: document.getElementById('newTrade'),
  reports: document.getElementById('reports')
};

const journalBody = document.getElementById('journalBody');
const statNet = document.getElementById('statNet'),
  statWin = document.getElementById('statWin'),
  statRR = document.getElementById('statRR'),
  statTotal = document.getElementById('statTotal');
const recentList = document.getElementById('recentList');
const equityCtx = document.getElementById('equityChart').getContext('2d');
const winLossCtx = document.getElementById('winLossChart').getContext('2d');
const monthlyCtx = document.getElementById('monthlyChart').getContext('2d');

// New Analytics Canvas Context
let liquidityCtx;
let equityChart, winLossChart, monthlyChart, liquidityChart;

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function save() {
  localStorage.setItem(LS_KEY, JSON.stringify(trades));
  renderAll();
}

// Category detection (Updated for Silver)
function getCategory(sym) {
  if (!sym) return 'Other';
  sym = sym.toUpperCase();
  if (sym.includes('XAU')) return 'Gold';
  if (sym.includes('XAG')) return 'Silver';
  if (sym.includes('XTI') || sym.includes('OIL') || sym.includes('USOIL')) return 'Oil';
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('XRP') || sym.includes('SOL')) return 'Crypto';
  if (/[A-Z]{6}/.test(sym) && sym.endsWith('USD')) return 'Forex';
  return 'Other';
}

// P/L calculation per instrument (Fixed for XAGUSD)
function calculatePL(symbol, entry, exit, lot, contract = 1, side = 'long') {
  if (isNaN(entry) || isNaN(exit) || isNaN(lot)) return null;
  symbol = (symbol || '').toUpperCase();
  let pl = 0;

  if (symbol.includes('XAU')) {
    pl = (exit - entry) * 100 * lot * contract;
  } else if (symbol.includes('XAG')) {
    const silverContract = contract === 1 ? 5000 : contract;
    pl = (exit - entry) * lot * silverContract;
  } else if (symbol.includes('XTI') || symbol.includes('OIL') || symbol.includes('USOIL')) {
    pl = ((exit - entry) / 0.01) * lot * contract;
  } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
    pl = (exit - entry) * lot * contract;
  } else if (/[A-Z]{6}/.test(symbol) && symbol.endsWith('USD')) {
    const pips = (exit - entry) / 0.0001;
    pl = pips * 10 * lot * contract;
  } else {
    pl = (exit - entry) * lot * contract;
  }

  return side === 'long' ? Number(pl.toFixed(2)) : Number((-pl).toFixed(2));
}

// Render Journal
function renderJournal(filter = 'All', search = '') {
  journalBody.innerHTML = '';
  const rows = trades.filter(t => {
    if (filter && filter !== 'All' && getCategory(t.symbol) !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      // Notes remove hone ke baad bhi filter functionality backup ke liye notes search rakhegi
      return (t.symbol || '').toLowerCase().includes(s) || (t.notes || '').toLowerCase().includes(s);
    }
    return true;
  });

  rows.forEach((t) => {
    const tr = document.createElement('tr');

    // Check liquidity data or fallback to defaults
    const isSweep = t.liquidity === 'Yes' || t.trade_liquidity === 'Yes';
    const tf = t.liquidity_tf || t.trade_liquidity_tf || 'None';

    let liquidityDisplay = '—';
    if (isSweep) {
      liquidityDisplay = `⚡ Yes (${tf !== 'None' ? tf : 'No TF'})`;
    } else if (t.liquidity === 'No' || t.trade_liquidity === 'No') {
      liquidityDisplay = 'No';
    }

    tr.innerHTML = `
      <td>${t.date} ${t.time || ''}</td>
      <td><strong>${t.symbol}</strong></td>
      <td>${getCategory(t.symbol)}</td>
      <td>${t.side}</td>
      <td>${t.entry}</td>
      <td>${t.exit}</td>
      <td>${t.lot}</td>
      <td style="color:${t.pl >= 0 ? '#7ef0c7' : '#ff7b7b'}">${t.pl?.toFixed(2) ?? '—'}</td>
      <td style="font-weight: 600; color: ${isSweep ? '#7c4dff' : '#cfe6ff'}">${liquidityDisplay}</td>
      <td>
        ${t.screenshot
        ? `<img src="${t.screenshot}" alt="screenshot" width="60" style="border-radius:4px;">`
        : '—'}
      </td>
      <td>
        <button class="remove-btn" data-index="${t._id}" title="Remove trade">🗑️</button>
      </td>
    `;
    journalBody.appendChild(tr);
  });
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Dashboard rendering
function renderDashboard() {
  const net = trades.reduce((a, b) => a + (Number(b.pl) || 0), 0);
  const total = trades.length;
  const wins = trades.filter(t => Number(t.pl) > 0).length;
  const losses = trades.filter(t => Number(t.pl) < 0).length;
  const winRate = total ? ((wins / total) * 100).toFixed(1) + '%' : '—';

  statNet.textContent = `$${net.toFixed(2)}`;
  statNet.style.color = net >= 0 ? '#00f0d1' : '#ff6b6b';
  statWin.textContent = winRate;
  statTotal.textContent = total;

  let totalRR = 0, countRR = 0;
  trades.forEach(t => {
    if (t.stoploss && !isNaN(t.stoploss)) {
      const risk = Math.abs(t.entry - t.stoploss);
      const reward = t.pl;
      if (risk > 0) {
        totalRR += (reward / (risk * t.lot * (t.symbol.includes('XAU') ? 100 : t.symbol.includes('XAG') ? 5000 : 1)));
        countRR++;
      }
    }
  });
  statRR.textContent = countRR > 0 ? `1:${(totalRR / countRR).toFixed(1)}` : '—';

  recentList.innerHTML = '';
  trades.slice(0, 6).forEach(t => {
    const d = document.createElement('div');
    d.className = 'recent-item';
    d.innerHTML = `
      <div><strong>${t.symbol}</strong><div class="muted">${t.date}</div></div>
      <div style="text-align:right">
        <div style="font-weight:700; color: ${t.pl >= 0 ? '#7ef0c7' : '#ff7b7b'}">${t.pl >= 0 ? '+' : ''}${t.pl?.toFixed(2) ?? '—'}</div>
        <div class="muted">${t.category || getCategory(t.symbol)}</div>
      </div>`;
    recentList.appendChild(d);
  });

  // Main Equity Line Chart
  const labels = [...trades].reverse().map(t => t.date);
  let cum = 0;
  const data = [...trades].reverse().map(t => (cum += Number(t.pl) || 0));

  if (equityChart) equityChart.destroy();
  equityChart = new Chart(equityCtx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Equity', data, borderColor: '#00f0d1', backgroundColor: 'rgba(0,240,209,0.06)', tension: 0.35, fill: true }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  updateTicker();
}

// Advanced Reports Analytics & Interactive Calendar
function renderAdvancedReports() {
  const total = trades.length;
  const wins = trades.filter(t => Number(t.pl) > 0);
  const losses = trades.filter(t => Number(t.pl) < 0);

  // 1. Profit Factor Calculation
  const grossProfit = wins.reduce((a, b) => a + Number(b.pl), 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + Number(b.pl), 0));
  document.getElementById('statProfitFactor').textContent = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? '∞' : '—');

  // 2. Average Win & Loss Amounts
  document.getElementById('statAvgWin').textContent = wins.length > 0 ? `$${(grossProfit / wins.length).toFixed(2)}` : '—';
  document.getElementById('statAvgLoss').textContent = losses.length > 0 ? `$${(grossLoss / losses.length).toFixed(2)}` : '—';

  // 3. Liquidity Strategy Analytics
  const liqTrades = trades.filter(t => t.liquidity === 'Yes');
  const liqWins = liqTrades.filter(t => Number(t.pl) > 0).length;
  document.getElementById('statLiqWinRate').textContent = liqTrades.length > 0 ? `${((liqWins / liqTrades.length) * 100).toFixed(1)}%` : '—';

  // 4. Update Native Report Charts
  if (winLossChart) winLossChart.destroy();
  winLossChart = new Chart(winLossCtx, {
    type: 'doughnut',
    data: { labels: ['Wins', 'Losses'], datasets: [{ data: [wins.length, losses.length], backgroundColor: ['#16a34a', '#ef4444'] }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#e6f2ff' } } } }
  });

  const monthly = {};
  trades.forEach(t => {
    const m = (t.date || '').slice(0, 7) || 'unknown';
    monthly[m] = (monthly[m] || 0) + Number(t.pl || 0);
  });
  const months = Object.keys(monthly).sort();
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(monthlyCtx, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Monthly P/L', data: months.map(k => monthly[k]), backgroundColor: months.map(k => monthly[k] >= 0 ? '#00f0d1' : '#ff6b6b') }] },
    options: { plugins: { legend: { display: false } } }
  });

  // 5. Liquidity Timeframe Performance Multi-Chart
  const tfPerformance = { '5m': 0, '15m': 0, '30m': 0, '1h': 0, '4h': 0, '1D': 0, '1W': 0, '1M': 0 };
  liqTrades.forEach(t => {
    if (t.liquidityTF in tfPerformance) {
      tfPerformance[t.liquidityTF] += Number(t.pl || 0);
    }
  });

  const liqEl = document.getElementById('liquidityChart');
  if (liqEl) {
    liquidityCtx = liqEl.getContext('2d');
    if (liquidityChart) liquidityChart.destroy();
    liquidityChart = new Chart(liquidityCtx, {
      type: 'bar',
      data: {
        labels: Object.keys(tfPerformance),
        datasets: [{ label: 'Cumulative P/L ($)', data: Object.values(tfPerformance), backgroundColor: Object.values(tfPerformance).map(v => v >= 0 ? '#7c4dff' : '#ff6b6b') }]
      },
      options: { plugins: { legend: { display: false } } }
    });
  }

  // 6. Generate Trading Calendar System
  generateCalendar();
}

function generateCalendar() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const today = new Date();
  document.getElementById('calendarMonthYear').textContent = today.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Add Calendar Week Header
  const daysHeader = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  daysHeader.forEach(d => {
    const head = document.createElement('div');
    head.className = 'calendar-day-head';
    head.textContent = d;
    grid.appendChild(head);
  });

  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  // Create padding for empty trailing days
  for (let i = 0; i < firstDay; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.className = 'calendar-cell cal-empty';
    grid.appendChild(emptyCell);
  }

  // Map P/L performance data points by precise calendar date string matches
  const dailyPLMap = {};
  trades.forEach(t => {
    if (t.date) {
      dailyPLMap[t.date] = (dailyPLMap[t.date] || 0) + Number(t.pl || 0);
    }
  });

  for (let day = 1; day <= totalDays; day++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    // Parse date parsing string format tracking setup rules
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    const dateKey = `${today.getFullYear()}-${monthStr}-${dayStr}`;

    const numDiv = document.createElement('div');
    numDiv.className = 'day-num';
    numDiv.textContent = day;
    cell.appendChild(numDiv);

    if (dateKey in dailyPLMap) {
      const netDayPL = dailyPLMap[dateKey];
      const plDiv = document.createElement('div');
      plDiv.className = 'day-pl';
      plDiv.textContent = (netDayPL >= 0 ? '+$' : '-$') + Math.abs(netDayPL).toFixed(0);
      plDiv.style.color = netDayPL >= 0 ? '#00f0d1' : '#ff6b6b';
      cell.appendChild(plDiv);
      cell.classList.add(netDayPL >= 0 ? 'cal-profit' : 'cal-loss');
    }

    grid.appendChild(cell);
  }
}

function updateTicker() {
  const net = trades.reduce((a, b) => a + (Number(b.pl) || 0), 0).toFixed(2);
  const wins = trades.filter(t => Number(t.pl) > 0).length;
  const losses = trades.filter(t => Number(t.pl) < 0).length;
  const total = trades.length;
  const winRate = total ? ((wins / total) * 100).toFixed(1) : '0';
  document.getElementById('tickerContent').innerHTML = `
    <span class="net">Net P/L: $${net}</span>
    <span class="wins">Wins: ${wins}</span>
    <span class="loss">Losses: ${losses}</span>
    <span class="winrate">WinRate: ${winRate}%</span>
    <span class="total">Trades: ${total}</span>
  `;
}

function showSection(id) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const targetBtn = document.querySelector(`[onclick="showSection('${id}')"]`);
  if (targetBtn) targetBtn.classList.add('active');
  document.getElementById(id).classList.add('active');

  if (id === 'reports') {
    renderAdvancedReports();
  } else {
    renderAll();
  }
}

// Auto Category Switcher
document.getElementById('symbol').addEventListener('input', e => {
  const cat = getCategory(e.target.value);
  document.getElementById('category').value = cat;
  updatePLPreview();
});

['entry', 'exit', 'lot', 'contract', 'side', 'stoploss'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePLPreview);
});

function updatePLPreview() {
  const sym = document.getElementById('symbol').value.trim();
  const entry = parseFloat(document.getElementById('entry').value);
  const exit = parseFloat(document.getElementById('exit').value);
  const lot = parseFloat(document.getElementById('lot').value) || 1;
  const contract = parseFloat(document.getElementById('contract').value) || 1;
  const side = document.getElementById('side').value || 'long';
  const preview = document.getElementById('plPreview');

  let baseText = '—';
  if (sym && !isNaN(entry) && !isNaN(exit)) {
    const pl = calculatePL(sym, entry, exit, lot, contract, side);
    baseText = (pl === null ? '—' : (pl >= 0 ? '+' : '') + pl.toFixed(2));
  }

  const stop = parseFloat(document.getElementById("stoploss").value);
  if (!isNaN(stop) && sym && !isNaN(entry)) {
    const slLoss = calculatePL(sym, entry, stop, lot, contract, side);
    baseText += ` | SL Risk: ${slLoss ? slLoss.toFixed(2) : '—'}`;
  }

  preview.value = baseText;
}

// Save trade setup
document.getElementById("tradeForm").addEventListener("submit", e => {
  e.preventDefault();
  const fileInput = document.getElementById("screenshot");

  const saveTradeWithScreenshot = (screenshot) => {
    const symbol = document.getElementById("symbol").value.toUpperCase().trim();
    const entry = parseFloat(document.getElementById("entry").value);
    const exit = parseFloat(document.getElementById("exit").value);

    if (!symbol || isNaN(entry) || isNaN(exit)) {
      alert("Please fill Symbol, Entry, and Exit before saving!");
      return;
    }

    const trade = {
      _id: uid(),
      date: document.getElementById("tradeDate").value || new Date().toISOString().slice(0, 10),
      time: document.getElementById("tradeTime").value || new Date().toTimeString().slice(0, 5),
      symbol,
      side: document.getElementById("side").value,
      entry,
      exit,
      stoploss: parseFloat(document.getElementById("stoploss").value) || null,
      lot: parseFloat(document.getElementById("lot").value) || 1,
      contract: parseFloat(document.getElementById("contract").value) || 1,
      category: document.getElementById("category").value,
      notes: document.getElementById("notes").value,
      screenshot: screenshot || "",
      // Capture custom user liquidity specifications fields
      liquidity: document.getElementById("liquidityTag").value,
      liquidityTF: document.getElementById("liquidityTF").value
    };

    trade.pl = calculatePL(trade.symbol, trade.entry, trade.exit, trade.lot, trade.contract, trade.side);

    trades.unshift(trade);
    save();

    alert("Trade saved successfully!");
    document.getElementById("tradeForm").reset();
    document.getElementById("category").value = 'Other';
    document.getElementById("plPreview").value = '';
  };

  if (fileInput.files.length > 0) {
    const reader = new FileReader();
    reader.onload = () => saveTradeWithScreenshot(reader.result);
    reader.readAsDataURL(fileInput.files[0]);
  } else {
    saveTradeWithScreenshot("");
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  document.getElementById('tradeForm').reset();
  document.getElementById('plPreview').value = '';
});

// Remove trade setup safely
document.body.addEventListener('click', (ev) => {
  if (ev.target.matches('.remove-btn') || ev.target.closest('.remove-btn')) {
    const btn = ev.target.matches('.remove-btn') ? ev.target : ev.target.closest('.remove-btn');
    const id = btn.getAttribute('data-index');
    if (!confirm('Are you sure you want to remove this trade?')) return;
    trades = trades.filter(t => t._id !== id);
    save();
  }
});

// Filters & search mapping
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
  });
});

document.getElementById('searchBox').addEventListener('input', () => renderAll());

window.addEventListener("load", () => {
  trades = trades.filter(t => t && t._id && t.symbol);
  renderAll();
});

// PDF Export 
document.getElementById('exportPdfBtn').addEventListener('click', () => {
  if (trades.length === 0) {
    alert('No trades to export');
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  pdf.setFontSize(16);
  pdf.text("TradeLog Backtesting Report", 14, 20);

  pdf.setFontSize(12);
  pdf.text(`Total Trades: ${trades.length}`, 14, 35);
  const netPL = trades.reduce((a, b) => a + (Number(b.pl) || 0), 0).toFixed(2);
  pdf.text(`Net P/L: $${netPL}`, 14, 45);

  const tableData = trades.map(t => [
    t.date || "-",
    t.time || "-",
    t.symbol || "-",
    t.side.toUpperCase() || "-",
    t.entry || "-",
    t.exit || "-",
    t.lot || "-",
    (t.pl >= 0 ? "+" : "") + (t.pl?.toFixed(2) ?? "-")
  ]);

  pdf.autoTable({
    head: [["Date", "Time", "Symbol", "Side", "Entry", "Exit", "Lot", "P/L"]],
    body: tableData,
    startY: 60,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [124, 77, 255] },
    alternateRowStyles: { fillColor: [245, 245, 245] }
  });

  pdf.save("trade_report.pdf");
});

function renderAll() {
  trades = trades.filter(t => t && t._id && t.symbol);
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.cat || 'All';
  const search = document.getElementById('searchBox')?.value || '';

  renderJournal(activeFilter, search);
  renderDashboard();
}

// Initial fire
renderAll();
