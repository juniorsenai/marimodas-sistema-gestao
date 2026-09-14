/* ==========================================================================
   ModaGestão - Módulo de Histórico de Vendas & Relatórios
   ========================================================================== */

let allSales = [];

// Escutar vendas em tempo real no Firestore
function loadSales() {
  db.collection('sales').orderBy('createdAt', 'desc').limit(200).onSnapshot(snapshot => {
    allSales = [];
    snapshot.forEach(doc => {
      allSales.push({ id: doc.id, ...doc.data() });
    });
    renderSalesUI();
    if (window.updateDashboardStats) window.updateDashboardStats();
  }, error => {
    console.error("Erro ao carregar vendas:", error);
    showToast("Erro ao carregar histórico de vendas.", "danger");
  });
}

// Renderizar tabela de vendas com filtros de busca e data
function renderSalesUI() {
  const tbody = document.getElementById('sales-table-body');
  if (!tbody) return;

  const searchVal = (document.getElementById('sales-search')?.value || '').toLowerCase();
  const startDate = document.getElementById('sales-date-start')?.value || '';
  const endDate = document.getElementById('sales-date-end')?.value || '';
  const statusFilter = document.getElementById('sales-status-filter')?.value || '';

  const filtered = allSales.filter(sale => {
    const matchesSearch = !searchVal ||
      (sale.saleId && sale.saleId.toLowerCase().includes(searchVal)) ||
      (sale.cashierName && sale.cashierName.toLowerCase().includes(searchVal)) ||
      (sale.paymentMethod && sale.paymentMethod.toLowerCase().includes(searchVal));

    let matchesDate = true;
    if (sale.createdAt && (startDate || endDate)) {
      const saleDate = sale.createdAt.toDate ? sale.createdAt.toDate() : new Date(sale.createdAt.seconds * 1000);
      const saleDateStr = saleDate.toISOString().split('T')[0];
      if (startDate) matchesDate = matchesDate && saleDateStr >= startDate;
      if (endDate) matchesDate = matchesDate && saleDateStr <= endDate;
    }

    const matchesStatus = !statusFilter || sale.status === statusFilter;

    return matchesSearch && matchesDate && matchesStatus;
  });

  tbody.innerHTML = '';

  const paymentIcons = {
    'DINHEIRO': '<i class="fa-solid fa-money-bill-wave" style="color:var(--success)"></i> Dinheiro',
    'PIX': '<i class="fa-brands fa-pix" style="color:var(--info)"></i> PIX',
    'CARTAO_CREDITO': '<i class="fa-solid fa-credit-card" style="color:var(--accent-primary)"></i> Créd.',
    'CARTAO_DEBITO': '<i class="fa-solid fa-credit-card" style="color:var(--accent-secondary)"></i> Déb.',
    'CREDITO_LOJA': '<i class="fa-solid fa-address-card" style="color:var(--warning)"></i> Fiado'
  };

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:var(--text-muted); padding:2rem;">
          <i class="fa-solid fa-receipt" style="font-size:2rem; display:block; margin-bottom:10px;"></i>
          Nenhuma venda registrada com os filtros aplicados.
        </td>
      </tr>`;
    updateSalesSummary(filtered);
    return;
  }

  filtered.forEach(sale => {
    const date = sale.createdAt && sale.createdAt.toDate
      ? sale.createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    const statusBadge = sale.status === 'CANCELADA'
      ? `<span class="badge badge-danger"><i class="fa-solid fa-ban"></i> Cancelada</span>`
      : `<span class="badge badge-success"><i class="fa-solid fa-check"></i> Concluída</span>`;

    const itemsCount = (sale.items || []).reduce((s, i) => s + i.qty, 0);

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family:monospace; font-size:0.82rem;">#${(sale.saleId || sale.id).substring(0, 8).toUpperCase()}</td>
      <td>${date}</td>
      <td>${itemsCount} peça${itemsCount !== 1 ? 's' : ''}</td>
      <td>${paymentIcons[sale.paymentMethod] || sale.paymentMethod}</td>
      <td style="font-weight:700; color:var(--accent-primary);">R$ ${(sale.total || 0).toFixed(2)}</td>
      <td>${statusBadge}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" onclick="openSaleDetailsModal('${sale.id || sale.saleId}')" title="Ver Detalhes">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${sale.status !== 'CANCELADA' ? `
            <button class="btn btn-danger btn-sm" onclick="handleCancelSale('${sale.id || sale.saleId}')" title="Cancelar Venda">
              <i class="fa-solid fa-ban"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateSalesSummary(filtered);
}

// Atualizar resumo de total de vendas e receita
function updateSalesSummary(filteredSales) {
  const activeSales = filteredSales.filter(s => s.status !== 'CANCELADA');
  const totalRevenue = activeSales.reduce((s, sale) => s + (sale.total || 0), 0);
  const salesCount = activeSales.length;

  const el = (id) => document.getElementById(id);
  if (el('sales-total-revenue')) el('sales-total-revenue').textContent = `R$ ${totalRevenue.toFixed(2)}`;
  if (el('sales-total-count')) el('sales-total-count').textContent = `${salesCount} venda${salesCount !== 1 ? 's' : ''}`;
}

// Abrir Modal com Detalhes da Venda
function openSaleDetailsModal(saleId) {
  const sale = allSales.find(s => (s.id === saleId || s.saleId === saleId));
  if (!sale) return;

  const modal = document.getElementById('sale-detail-modal');
  const content = document.getElementById('sale-detail-content');

  const paymentLabels = {
    'DINHEIRO': '💵 Dinheiro',
    'PIX': '📲 PIX',
    'CARTAO_CREDITO': '💳 Cartão de Crédito',
    'CARTAO_DEBITO': '💳 Cartão de Débito',
    'CREDITO_LOJA': 'Crédito da loja (fiado)'
  };

  const date = sale.createdAt && sale.createdAt.toDate
    ? sale.createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const itemsHtml = (sale.items || []).map(item => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${item.size}</td>
      <td>${item.color}</td>
      <td>${item.qty}</td>
      <td>R$ ${(item.price || 0).toFixed(2)}</td>
      <td style="font-weight:700;">R$ ${(item.total || (item.price * item.qty) || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  content.innerHTML = `
    <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:1rem; margin-bottom:1.5rem;">
      <div>
        <p style="color:var(--text-muted); font-size:0.85rem;">Código da Venda</p>
        <p style="font-family:monospace; font-weight:700;">#${(sale.saleId || sale.id).toUpperCase()}</p>
      </div>
      <div>
        <p style="color:var(--text-muted); font-size:0.85rem;">Data / Hora</p>
        <p style="font-weight:600;">${date}</p>
      </div>
      <div>
        <p style="color:var(--text-muted); font-size:0.85rem;">Operador</p>
        <p style="font-weight:600;">${escapeHtml(sale.cashierName || '—')}</p>
      </div>
      <div>
        <p style="color:var(--text-muted); font-size:0.85rem;">Status</p>
        <p>${sale.status === 'CANCELADA' 
          ? '<span class="badge badge-danger">Cancelada</span>' 
          : '<span class="badge badge-success">Concluída</span>'}</p>
      </div>
    </div>
    <div class="table-container custom-table-responsive">
      <table class="custom-table">
        <thead>
          <tr>
            <th>Produto</th><th>Tam.</th><th>Cor</th><th>Qtd</th><th>Unit.</th><th>Total</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>
    </div>
    <div style="margin-top:1rem; text-align:right;">
      ${sale.discount > 0 ? `<p style="color:var(--text-secondary);">Desconto: - R$ ${(sale.discount || 0).toFixed(2)}</p>` : ''}
      <p style="font-size:1.3rem; font-weight:700; color:var(--accent-primary);">
        Total: R$ ${(sale.total || 0).toFixed(2)}
      </p>
      <p style="color:var(--text-secondary);">${paymentLabels[sale.paymentMethod] || sale.paymentMethod}</p>
      ${sale.paymentMethod === 'CREDITO_LOJA' ? `
        <p style="color:var(--text-muted); font-size:0.85rem;">
          Cliente: ${escapeHtml(sale.clientName || '—')} | ${(sale.installments || 1)}x | Primeiro vencimento: ${sale.dueDate ? new Date(sale.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
        </p>
      ` : ''}
      ${sale.paymentMethod === 'DINHEIRO' ? `
        <p style="color:var(--text-muted); font-size:0.85rem;">
          Recebido: R$ ${(sale.cashReceived || 0).toFixed(2)} | Troco: R$ ${(sale.changeGiven || 0).toFixed(2)}
        </p>
      ` : ''}
      ${sale.paymentMethod === 'CARTAO_CREDITO' ? `
        <p style="color:var(--text-muted); font-size:0.85rem;">
          Parcelamento: ${sale.cardInstallments || 1}x | Taxa: ${(sale.cardFeeRate || 0).toFixed(2)}% | Taxa paga por: ${sale.cardFeePayer === 'CUSTOMER' ? 'Cliente' : 'Loja'} | Cobrado: R$ ${(sale.chargedTotal ?? sale.total ?? 0).toFixed(2)} | Loja recebe: R$ ${(sale.netTotal ?? sale.total ?? 0).toFixed(2)}
        </p>
      ` : ''}
    </div>
  `;

  modal.classList.add('active');
}

function closeSaleDetailModal() {
  document.getElementById('sale-detail-modal').classList.remove('active');
}

// Cancelar Venda com confirmação
async function handleCancelSale(saleId) {
  if (!confirm("Tem certeza que deseja CANCELAR esta venda? O estoque dos produtos será restaurado automaticamente.")) return;
  
  try {
    await cancelSaleTransaction(saleId);
    showToast("Venda cancelada e estoque restaurado com sucesso!", "success");
    closeSaleDetailModal();
  } catch (err) {
    showToast(`Erro ao cancelar: ${err.message}`, "danger");
  }
}

// Exportar Vendas para CSV
function exportSalesToCSV() {
  const activeSales = allSales.filter(s => s.status !== 'CANCELADA');
  if (activeSales.length === 0) {
    showToast("Nenhuma venda para exportar.", "warning");
    return;
  }

  const headers = ['ID Venda', 'Data', 'Operador', 'Itens', 'Subtotal (R$)', 'Desconto (R$)', 'Total (R$)', 'Pagamento', 'Status'];

  const rows = activeSales.map(sale => {
    const date = sale.createdAt && sale.createdAt.toDate
      ? sale.createdAt.toDate().toLocaleString('pt-BR')
      : '';
    const itemsStr = (sale.items || []).map(i => `${i.qty}x ${i.name}`).join(' / ');
    return [
      (sale.saleId || sale.id).toUpperCase(),
      date,
      sale.cashierName || '',
      itemsStr,
      (sale.subtotal || 0).toFixed(2),
      (sale.discount || 0).toFixed(2),
      (sale.total || 0).toFixed(2),
      sale.paymentMethod,
      sale.status
    ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `modagestao_vendas_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Relatório CSV exportado com sucesso!", "success");
}

// Calcular stats para o dashboard
function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];
  const activeSales = allSales.filter(s => s.status !== 'CANCELADA');
  const todaySales = activeSales.filter(s => {
    if (!s.createdAt) return false;
    const d = s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt.seconds * 1000);
    return d.toISOString().split('T')[0] === today;
  });

  return {
    totalSalesToday: todaySales.length,
    revenueTodayTotal: todaySales.reduce((sum, s) => sum + (s.total || 0), 0),
    totalSalesAll: activeSales.length,
    revenueAll: activeSales.reduce((sum, s) => sum + (s.total || 0), 0)
  };
}
