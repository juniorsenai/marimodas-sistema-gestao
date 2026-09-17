/* ==========================================================================
   ModaGestão - App Principal (Navegação, Dashboard & Utilitários)
   ========================================================================== */

// ---- NAVEGAÇÃO ENTRE SEÇÕES ----

function navigateTo(sectionId) {
  // Remover active de todas as seções e links
  document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link, .mobile-nav-item').forEach(l => l.classList.remove('active'));

  // Ativar a seção alvo
  const section = document.getElementById(`section-${sectionId}`);
  if (section) section.classList.add('active');

  // Ativar o link correspondente no sidebar e nav mobile
  document.querySelectorAll(`[data-nav="${sectionId}"]`).forEach(l => l.classList.add('active'));

  // Atualizar título mobile
  const mobileTitleEl = document.getElementById('mobile-page-title');
  if (mobileTitleEl) {
    const pageTitles = {
      'dashboard': 'Dashboard',
      'inventory': 'Estoque',
      'pdv': 'Caixa / PDV',
      'sales': 'Vendas',
      'management': 'Gestão Completa',
      'settings': 'Configurações'
    };
    mobileTitleEl.textContent = pageTitles[sectionId] || 'ModaGestão';
  }

  // Ações específicas por seção
  if (sectionId === 'pdv') {
    renderPDVCatalog();
    renderCart();
  }

  if (sectionId === 'inventory') {
    renderProductsUI();
  }

  if (sectionId === 'sales') {
    renderSalesUI();
  }

  if (sectionId === 'management' && window.renderManagement) {
    renderManagement();
  }

  if (sectionId === 'dashboard') {
    updateDashboardStats();
  }
}

// ---- DASHBOARD ----

function loadDashboardData() {
  updateDashboardStats();
}

function updateDashboardStats() {
  if (!allProducts || !allSales) return;

  const totalProducts = allProducts.length;
  const lowStockProducts = allProducts.filter(p => p.stockQty <= (p.minStock || 2)).length;

  const stats = getDashboardStats();

  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };

  el('dash-total-products', totalProducts);
  el('dash-low-stock', lowStockProducts);
  el('dash-sales-today', stats.totalSalesToday);
  el('dash-revenue-today', `R$ ${stats.revenueTodayTotal.toFixed(2)}`);

  renderLowStockAlerts();
  renderRecentSales();
}

// Renderizar alertas de baixo estoque no dashboard
function renderLowStockAlerts() {
  const container = document.getElementById('low-stock-list');
  if (!container) return;

  const lowStock = allProducts.filter(p => p.stockQty <= (p.minStock || 2));

  if (lowStock.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--success); padding:1.5rem;">
        <i class="fa-solid fa-circle-check" style="font-size:1.5rem; margin-bottom:6px; display:block;"></i>
        Todos os produtos com estoque adequado!
      </div>`;
    return;
  }

  container.innerHTML = lowStock.map(p => `
    <div class="cart-item" style="margin-bottom:8px;">
      <div class="cart-item-info">
        <h4>${escapeHtml(p.name)}</h4>
        <p>Tam: ${p.size} | ${p.color} | Mín: ${p.minStock || 2} un.</p>
      </div>
      <span class="badge ${p.stockQty === 0 ? 'badge-danger' : 'badge-warning'}">
        ${p.stockQty === 0 ? 'SEM ESTOQUE' : `${p.stockQty} un.`}
      </span>
    </div>
  `).join('');
}

// Renderizar últimas vendas no dashboard
function renderRecentSales() {
  const container = document.getElementById('recent-sales-list');
  if (!container) return;

  const recent = allSales.filter(s => s.status !== 'CANCELADA').slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:1.5rem;">
      <i class="fa-solid fa-receipt" style="font-size:1.5rem; display:block; margin-bottom:6px;"></i>
      Nenhuma venda realizada ainda.
    </div>`;
    return;
  }

  const paymentIcons = {
    'DINHEIRO': '💵', 'PIX': '📲', 'CARTAO_CREDITO': '💳 Créd.', 'CARTAO_DEBITO': '💳 Déb.'
  };

  container.innerHTML = recent.map(sale => {
    const date = sale.createdAt && sale.createdAt.toDate
      ? sale.createdAt.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—';

    return `
      <div class="cart-item" style="margin-bottom:8px;">
        <div class="cart-item-info">
          <h4 style="font-family:monospace;">#${(sale.saleId || sale.id).substring(0, 8).toUpperCase()}</h4>
          <p>${date} — ${paymentIcons[sale.paymentMethod] || sale.paymentMethod}</p>
        </div>
        <span style="font-weight:700; color:var(--accent-primary);">R$ ${(sale.total || 0).toFixed(2)}</span>
      </div>
    `;
  }).join('');
}

// ---- TOAST NOTIFICATIONS ----

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconMap = {
    'success': 'fa-circle-check',
    'warning': 'fa-triangle-exclamation',
    'danger': 'fa-circle-xmark',
    'info': 'fa-circle-info'
  };

  toast.innerHTML = `
    <i class="fa-solid ${iconMap[type] || 'fa-circle-info'}" style="font-size:1.1rem;"></i>
    <span style="flex:1;">${escapeHtml(message)}</span>
    <button onclick="this.parentElement.remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:0;">
      <i class="fa-solid fa-xmark"></i>
    </button>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---- CONFIGURAÇÕES ----

function loadSettingsForm() {
  const savedConfig = localStorage.getItem('modagestao_firebase_config');
  if (savedConfig) {
    try {
      const cfg = JSON.parse(savedConfig);
      const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
      setVal('cfg-api-key', cfg.apiKey);
      setVal('cfg-auth-domain', cfg.authDomain);
      setVal('cfg-project-id', cfg.projectId);
      setVal('cfg-storage-bucket', cfg.storageBucket);
      setVal('cfg-messaging-sender-id', cfg.messagingSenderId);
      setVal('cfg-app-id', cfg.appId);
    } catch (e) { }
  }
}

function handleSaveSettings(e) {
  e.preventDefault();

  const getVal = (id) => document.getElementById(id)?.value.trim() || '';

  const newConfig = {
    apiKey: getVal('cfg-api-key'),
    authDomain: getVal('cfg-auth-domain'),
    projectId: getVal('cfg-project-id'),
    storageBucket: getVal('cfg-storage-bucket'),
    messagingSenderId: getVal('cfg-messaging-sender-id'),
    appId: getVal('cfg-app-id')
  };

  if (!newConfig.apiKey || !newConfig.projectId) {
    showToast("Preencha ao menos a API Key e o Project ID do Firebase.", "warning");
    return;
  }

  saveFirebaseConfig(newConfig);
}

function handleResetSettings() {
  if (confirm("Deseja restaurar as configurações Firebase para o padrão? A página será recarregada.")) {
    resetFirebaseConfig();
  }
}

// ---- AUTENTICAÇÃO UI (Handlers) ----

function handleLoginFormSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  if (!email || !password) {
    showToast("Preencha e-mail e senha.", "warning");
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Entrando...';

  loginUser(email, password).finally(() => {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Entrar';
  });
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-form-panel').forEach(p => p.style.display = 'none');

  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`panel-${tab}`).style.display = 'block';
}

// ---- INICIALIZAÇÃO DO APP ----

document.addEventListener('DOMContentLoaded', () => {
  // Navegação sidebar/mobile
  document.querySelectorAll('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigateTo(link.dataset.nav);
    });
  });

  // Auth Forms
  document.getElementById('login-form')?.addEventListener('submit', handleLoginFormSubmit);
  document.querySelectorAll('.auth-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAuthTab(btn.dataset.tab));
  });

  // Recuperar senha
  document.getElementById('forgot-password-link')?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    if (!email) {
      showToast("Digite seu e-mail para recuperar a senha.", "warning");
      return;
    }
    sendPasswordReset(email);
  });

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logoutUser);

  // Estoque - Formulário de produto
  document.getElementById('product-form')?.addEventListener('submit', handleProductFormSubmit);
  document.getElementById('inventory-search')?.addEventListener('input', renderProductsUI);
  document.getElementById('inventory-category-filter')?.addEventListener('change', renderProductsUI);
  document.getElementById('inventory-size-filter')?.addEventListener('change', renderProductsUI);
  document.getElementById('btn-new-product')?.addEventListener('click', () => openProductModal());
  document.getElementById('btn-scan-inventory')?.addEventListener('click', openInventoryScanner);

  // Scanner do estoque
  document.getElementById('btn-close-inventory-scanner')?.addEventListener('click', () => {
    stopCameraScanner();
    document.getElementById('inventory-scanner-modal').classList.remove('active');
  });

  // PDV
  document.getElementById('pdv-search-input')?.addEventListener('input', (e) => renderPDVCatalog(e.target.value));
  document.getElementById('btn-pdv-scanner')?.addEventListener('click', startPDVScanner);
  document.getElementById('btn-checkout')?.addEventListener('click', openCheckoutModal);
  document.getElementById('btn-clear-cart')?.addEventListener('click', clearCart);
  document.getElementById('cart-discount')?.addEventListener('input', () => renderCart());
  document.getElementById('cash-received')?.addEventListener('input', recalcChange);
  document.getElementById('btn-finalize-sale')?.addEventListener('click', finalizeSale);
  document.querySelectorAll('.payment-method-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPaymentMethod(btn.dataset.payment));
  });

  // Vendas / Relatórios
  document.getElementById('sales-search')?.addEventListener('input', renderSalesUI);
  document.getElementById('sales-date-start')?.addEventListener('change', renderSalesUI);
  document.getElementById('sales-date-end')?.addEventListener('change', renderSalesUI);
  document.getElementById('sales-status-filter')?.addEventListener('change', renderSalesUI);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportSalesToCSV);

  // Configurações
  document.getElementById('settings-form')?.addEventListener('submit', handleSaveSettings);
  document.getElementById('btn-reset-settings')?.addEventListener('click', handleResetSettings);

  // Inicializar na seção Dashboard por padrão (após Auth)
  navigateTo('dashboard');
  loadSettingsForm();
});

// Função para abrir o scanner de código de barras no estoque (busca produto pelo código)
function openInventoryScanner() {
  document.getElementById('inventory-scanner-modal').classList.add('active');
  startCameraScanner((code) => {
    document.getElementById('inventory-scanner-modal').classList.remove('active');
    document.getElementById('inventory-search').value = code;
    renderProductsUI();
    const results = allProducts.filter(p => p.barcode === code);
    if (results.length > 0) {
      showToast(`Produto encontrado: ${results[0].name}`, "success");
    } else {
      showToast(`Nenhum produto com código "${code}" encontrado. Deseja cadastrar?`, "warning");
      openProductModal();
      const barcodeField = document.getElementById('prod-barcode');
      if (barcodeField) barcodeField.value = code;
    }
  }, 'inventory-reader');
}
