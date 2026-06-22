// script.js — FTMO-style Trade Journal app (Fully Fixed with Combined PDF & Screenshots)
const LS_KEY = 'tj_ftmo_v1';
let trades = JSON.parse(localStorage.getItem(LS_KEY) || '[]');

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

let equityChart, winLossChart, monthlyChart;

function uid() { return Math.random().toString(36).slice(2, 9); }
function save() { 
  localStorage.setItem(LS_KEY, JSON.stringify(trades)); 
  renderAll(); 
}

// Category detection
function getCategory(sym) {
  if (!sym) return 'Other';
  sym = sym.toUpperCase().trim();
  if (sym.includes('XAU')) return 'Gold';
  if (sym.includes('XAG')) return 'Silver';
  if (sym.includes('XTI') || sym.includes('OIL') || sym.includes('USOIL')) return 'Oil';
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('XRP') || sym.includes('SOL')) return 'Crypto';
  if (/[A-Z]{6}/.test(sym) && sym.endsWith('USD')) return 'Forex';
  return 'Other';
}

// P/L calculation per instrument
function calculatePL(symbol, entry, exit, lot, contract = 1, side = 'long') {
  if (isNaN(entry) || isNaN(exit) || isNaN(lot)) return null;
  symbol = (symbol || '').toUpperCase().trim();
  let pl = 0;
  
  if (symbol.includes('XAU')) {
    pl = (exit - entry) * 100 * lot * contract;
  } else if (symbol.includes('XAG')) {
    pl = (exit - entry) * 5000 * lot * contract; 
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

// Render Journal Table
function renderJournal(filter = 'All', search = '') {
  journalBody.innerHTML = '';
  const rows = trades.filter(t => {
    if (filter && filter !== 'All' && getCategory(t.symbol) !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (t.symbol || '').toLowerCase().includes(s);
    }
    return true;
  });

  rows.forEach((t) => {
    const tr = document.createElement('tr');
    const isSweep = t.liquidity === 'Yes';
    const tf = t.liquidity_tf || 'None';
    let liquidityDisplay = 'No';
    if (isSweep) {
      liquidityDisplay = `⚡ Yes (${tf !== 'None' ? tf : 'No TF'})`;
    }

    tr.innerHTML = `
      <td>${t.date} ${t.time || ''}</td>
      <td><strong>${t.symbol}</strong></td>
      <td>${getCategory(t.symbol)}</td>
      <td><span class="side-badge ${t.side}">${t.side.toUpperCase()}</span></td>
      <td>${t.entry}</td>
      <td>${t.exit}</td>
      <td>${t.lot}</td>
      <td style="color:${t.pl >= 0 ? '#7ef0c7' : '#ff7b7b'}; font-weight:bold;">${t.pl >= 0 ? '+' : ''}${t.pl?.toFixed(2) ?? '—'}</td>
      <td style="font-weight: 600; color: ${isSweep ? '#7c4dff' : '#cfe6ff'}">${liquidityDisplay}</td>
      <td>
        ${t.screenshot
        ? `<img src="${t.screenshot}" alt="screenshot" width="60" style="border-radius:4px; cursor:pointer;">`
        : '—'}
      </td>
      <td>
        <button class="remove-btn" data-index="${t._id}" title="Remove trade">🗑️</button>
      </td>
    `;
    journalBody.appendChild(tr);
  });
}

// Render Dashboard Charts & Stats
function renderDashboard() {
  const net = trades.reduce((a, b) => a + (Number(b.pl) || 0), 0);
  const total = trades.length;
  const wins = trades.filter(t => Number(t.pl) > 0).length;
  const losses = trades.filter(t => Number(t.pl) < 0).length;
  const winRate = total ? ((wins / total) * 100).toFixed(1) + '%' : '—';

  statNet.textContent = `$${net.toFixed(2)}`;
  statWin.textContent = winRate;
  statRR.textContent = '—';
  statTotal.textContent = total;

  recentList.innerHTML = '';
  trades.slice(0, 6).forEach(t => {
    const d = document.createElement('div'); d.className = 'recent-item';
    d.innerHTML = `<div><strong>${t.symbol}</strong><div class="muted">${t.date}</div></div><div style="text-align:right"><div style="font-weight:700; color:${t.pl >= 0 ? '#7ef0c7' : '#ff7b7b'}">${t.pl >= 0 ? '+' : ''}${t.pl?.toFixed(2) ?? '—'}</div><div class="muted">${getCategory(t.symbol)}</div></div>`;
    recentList.appendChild(d);
  });

  const labels = [...trades].reverse().map(t => t.date);
  let cum = 0; const data = [...trades].reverse().map(t => (cum += Number(t.pl) || 0));
  if (equityChart) equityChart.destroy();
  equityChart = new Chart(equityCtx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Equity', data, borderColor: '#00f0d1', backgroundColor: 'rgba(0,240,209,0.06)', tension: 0.35, fill: true }] },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  if (winLossChart) winLossChart.destroy();
  winLossChart = new Chart(winLossCtx, {
    type: 'doughnut',
    data: { labels: ['Wins', 'Losses'], datasets: [{ data: [wins, losses], backgroundColor: ['#16a34a', '#ef4444'] }] },
    options: { plugins: { legend: { position: 'bottom', labels: { color: '#e6f2ff' } } } }
  });

  const monthly = {};
  trades.forEach(t => {
    const m = (t.date || '').slice(0, 7) || 'unknown';
    monthly[m] = (monthly[m] || 0) + Number(t.pl || 0);
  });
  const months = Object.keys(monthly).sort();
  const mdata = months.map(k => monthly[k]);
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(monthlyCtx, {
    type: 'bar',
    data: { labels: months, datasets: [{ label: 'Monthly P/L', data: mdata, backgroundColor: mdata.map(v => v >= 0 ? '#00f0d1' : '#ff6b6b') }] },
    options: { plugins: { legend: { display: false } } }
  });

  updateTicker();
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
  const btn = document.querySelector(`[onclick="showSection('${id}')"]`);
  if (btn) btn.classList.add('active');
  document.getElementById(id).classList.add('active');
  renderAll();
}

// Auto Category Setup
document.getElementById('symbol').addEventListener('input', e => {
  const cat = getCategory(e.target.value);
  document.getElementById('category').value = cat;
  updatePLPreview();
});

// Event listeners for REAL-TIME preview calculations
['entry', 'exit', 'lot', 'contract', 'side', 'stoploss'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', updatePLPreview);
  if (el && el.tagName === 'SELECT') el.addEventListener('change', updatePLPreview);
});

function updatePLPreview() {
  const sym = document.getElementById('symbol').value.trim();
  const entry = parseFloat(document.getElementById('entry').value);
  const exit = parseFloat(document.getElementById('exit').value);
  const lot = parseFloat(document.getElementById('lot').value) || 1;
  const contract = parseFloat(document.getElementById('contract').value) || 1;
  const side = document.getElementById('side').value || 'long';
  const preview = document.getElementById('plPreview');
  
  if (sym && !isNaN(entry) && !isNaN(exit)) {
    const pl = calculatePL(sym, entry, exit, lot, contract, side);
    let output = "Target P/L: " + (pl === null ? '—' : (pl >= 0 ? '+' : '') + pl.toFixed(2));
    
    const stop = parseFloat(document.getElementById("stoploss").value);
    if (!isNaN(stop)) {
      const slLoss = calculatePL(sym, entry, stop, lot, contract, side);
      output += ` | SL Risk: ${(slLoss >= 0 ? '+' : '')}${slLoss.toFixed(2)}`;
    }
    preview.value = output;
  } else {
    preview.value = '';
  }
}

// ====== FORM SUBMISSION LOGIC (FIXED SAVE FUNCTION) ======
document.getElementById("tradeForm").addEventListener("submit", e => {
  e.preventDefault();
  const fileInput = document.getElementById("screenshot");

  const saveTradeWithScreenshot = (screenshotData) => {
    const symbol = document.getElementById("symbol").value.toUpperCase().trim();
    const entry = parseFloat(document.getElementById("entry").value);
    const exit = parseFloat(document.getElementById("exit").value);
    const side = document.getElementById("side").value;

    if (!symbol || isNaN(entry) || isNaN(exit)) {
      alert("Please fill Symbol, Entry, and Exit before saving!");
      return;
    }

    const trade = {
      _id: uid(),
      date: document.getElementById("tradeDate").value || new Date().toISOString().slice(0, 10),
      time: document.getElementById("tradeTime").value || new Date().toTimeString().slice(0, 5),
      symbol,
      side,
      entry,
      exit,
      lot: parseFloat(document.getElementById("lot").value) || 1,
      contract: parseFloat(document.getElementById("contract").value) || 1,
      screenshot: screenshotData || "",
      liquidity: document.getElementById("liquidityTag").value,
      liquidity_tf: document.getElementById("liquidityTF").value,
      notes: document.getElementById("notes").value
    };

    trade.pl = calculatePL(trade.symbol, trade.entry, trade.exit, trade.lot, trade.contract, trade.side);

    trades.unshift(trade);
    save();

    alert("🎉 Saved your trade successfully!");
    document.getElementById("tradeForm").reset();
    document.getElementById("category").value = 'Other';
    document.getElementById("plPreview").value = '';
  };

  if (fileInput && fileInput.files.length > 0) {
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
  document.getElementById('category').value = 'Other';
});

// Remove single trade
document.body.addEventListener('click', (ev) => {
  if (ev.target.matches('.remove-btn')) {
    const id = ev.target.getAttribute('data-index');
    if (!confirm('Remove this trade?')) return;
    trades = trades.filter(t => t._id !== id);
    save();
  }
});

// Clear All Trades Functionality
const clearAllBtn = document.getElementById('clearAllBtn');
if (clearAllBtn) {
  clearAllBtn.addEventListener('click', () => {
    if (trades.length === 0) {
      alert("Journal pehle se hi khali hai!");
      return;
    }
    if (confirm("🚨 Warning: Kya aap sach mein SARE trades delete karna chahte hain?")) {
      trades = [];
      save();
      alert("Saare trades clear kar diye gaye hain!");
    }
  });
}

// Screenshot Zoom Modal Popup Click Handler
document.body.addEventListener('click', (ev) => {
  if (ev.target.matches('.journal-table img')) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('imgModalTarget');
    if (modal && modalImg) {
      modalImg.src = ev.target.src;
      modal.style.display = "flex";
    }
  }
});

const modal = document.getElementById('imageModal');
if (modal) {
  modal.addEventListener('click', () => {
    modal.style.display = "none";
  });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderAll();
  });
});

const searchBox = document.getElementById('searchBox');
if (searchBox) {
  searchBox.addEventListener('input', () => renderAll());
}

// ====== COMBINED IN-LINE PDF EXPORT BUTTON LOGIC ======
document.getElementById('exportPdfBtn').addEventListener('click', async () => {
  if (trades.length === 0) { 
    alert('No trades to export'); 
    return; 
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p', 'mm', 'a4'); 
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // --- Title Section ---
  pdf.setFillColor(15, 19, 24); 
  pdf.rect(0, 0, pageWidth, 40, 'F');
  
  pdf.setTextColor(0, 240, 209); 
  pdf.setFontSize(22);
  pdf.setFont("helvetica", "bold");
  pdf.text("TRADEBACK TESTING REPORT", 14, 18);

  pdf.setTextColor(154, 164, 178); 
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 25);

  const netPL = trades.reduce((a, b) => a + (Number(b.pl) || 0), 0).toFixed(2);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(11);
  pdf.text(`Total Trades: ${trades.length}   |   Net P/L: $${netPL}`, 14, 34);

  let yPos = 50;

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    let requiredSpace = t.screenshot && t.screenshot.startsWith("data:image") ? 95 : 35;
    
    if (yPos + requiredSpace > pageHeight - 15) {
      pdf.addPage();
      yPos = 20; 
    }

    // 1. Card Border Box
    pdf.setDrawColor(220, 225, 235);
    pdf.setFillColor(248, 250, 252); 
    pdf.rect(12, yPos, pageWidth - 24, requiredSpace - 5, 'FM');

    // 2. Card Header
    pdf.setFillColor(22, 160, 133); 
    pdf.rect(12, yPos, pageWidth - 24, 7, 'F');
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text(`TRADE DETAILS — Date: ${t.date || "-"} ${t.time || ""} | Symbol: ${t.symbol || "-"}`, 16, yPos + 5);

    yPos += 14;
    pdf.setTextColor(40, 40, 40);
    pdf.setFontSize(9.5);
    
    // Side
    pdf.setFont("helvetica", "bold"); pdf.text("Side:", 16, yPos);
    pdf.setFont("helvetica", "normal"); 
    const sideText = (t.side || "-").toUpperCase();
    pdf.setTextColor(sideText === 'LONG' ? 22 : 239, sideText === 'LONG' ? 163 : 68, sideText === 'LONG' ? 74 : 68); 
    pdf.text(sideText, 32, yPos);
    pdf.setTextColor(40, 40, 40);

    pdf.setFont("helvetica", "bold"); pdf.text("Lot Size:", 65, yPos);
    pdf.setFont("helvetica", "normal"); pdf.text(`${t.lot || "-"}`, 85, yPos);

    pdf.setFont("helvetica", "bold"); pdf.text("P/L Amount:", 125, yPos);
    pdf.setFont("helvetica", "bold");
    const plVal = Number(t.pl || 0);
    pdf.setTextColor(plVal >= 0 ? 22 : 211, plVal >= 0 ? 160 : 47, plVal >= 0 ? 133 : 47);
    pdf.text(`${plVal >= 0 ? '+' : ''}${plVal.toFixed(2)}`, 150, yPos);
    pdf.setTextColor(40, 40, 40);

    yPos += 6;
    pdf.setFont("helvetica", "bold"); pdf.text("Entry:", 16, yPos);
    pdf.setFont("helvetica", "normal"); pdf.text(`${t.entry || "-"}`, 32, yPos);

    pdf.setFont("helvetica", "bold"); pdf.text("Exit Price:", 65, yPos);
    pdf.setFont("helvetica", "normal"); pdf.text(`${t.exit || "-"}`, 85, yPos);

    pdf.setFont("helvetica", "bold"); pdf.text("Liq Sweep:", 125, yPos);
    pdf.setFont("helvetica", "normal"); 
    const liqDisplay = t.liquidity === 'Yes' ? `Yes (${t.liquidity_tf || 'No TF'})` : 'No';
    pdf.text(liqDisplay, 150, yPos);

    // Image Embed
    if (t.screenshot && t.screenshot.startsWith("data:image")) {
      yPos += 5;
      try {
        pdf.addImage(t.screenshot, 'PNG', 16, yPos, 115, 55);
        yPos += 60; 
      } catch (err) {
        console.error("Error drawing image in-line:", err);
        yPos += 5;
      }
    } else {
      yPos += 5;
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(120, 120, 120);
      pdf.text("[No Screenshot Attached for this trade]", 16, yPos);
      pdf.setTextColor(40, 40, 40);
      yPos += 10;
    }
    yPos += 5; 
  }
  pdf.save("trade_journal_combined_report.pdf");
});

// Master Render
function renderAll() {
  trades = trades.filter(t => t && t._id && t.symbol);
  const activeFilter = document.querySelector('.filter-btn.active')?.dataset.cat || 'All';
  const search = document.getElementById('searchBox')?.value || '';
  renderJournal(activeFilter, search);
  renderDashboard();
}

window.addEventListener("load", () => {
  renderAll();
});
