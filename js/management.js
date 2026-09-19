/* Gestão complementar: clientes, financeiro, acessos, IA e integrações. */
const MG_LIMITS = { clients: 9000, products: 9000 };
let allFinancialEntries = [];
let financialUnsubscribe = null;
let financeSyncRunning = false;
let showInventoryCapital = false;
let systemSettings = { whatsapp: '', terminal: 'Mercado Pago', cardFeeRates: {} };
let settingsUnsubscribe = null;
let allManagementClients = [];
let clientsUnsubscribe = null;

function mgOwner() { return currentUser?.uid || 'local'; }
function mgKey(name) { return `modagestao_${mgOwner()}_${name}`; }
function mgRead(name) {
  try { return JSON.parse(localStorage.getItem(mgKey(name))) || []; } catch (_) { return []; }
}
function mgWrite(name, value) { localStorage.setItem(mgKey(name), JSON.stringify(value)); }
function mgId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function mgMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function getManagementClients() { return allManagementClients; }

function loadManagementClients() {
  if (clientsUnsubscribe) clientsUnsubscribe();
  clientsUnsubscribe = db.collection('clients').orderBy('name').onSnapshot(async snapshot => {
    allManagementClients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const localClients = mgRead('clients');
    if (localClients.length && !localStorage.getItem(mgKey('clients_migrated'))) {
      localStorage.setItem(mgKey('clients_migrated'), '1');
      const existing = new Map(allManagementClients.map(client => [`${String(client.name).trim().toLowerCase()}|${String(client.phone || '').replace(/\D/g, '')}`, client.id]));
      for (const client of localClients) {
        const key = `${String(client.name).trim().toLowerCase()}|${String(client.phone || '').replace(/\D/g, '')}`;
        if (!existing.has(key)) {
          const id = await createManagementClient(client);
          existing.set(key, id);
        } else if (client.id && existing.get(key) !== client.id) {
          await relinkClientSales(client.id, existing.get(key), client.name);
        }
      }
      return;
    }
    if (managementTab === 'clients' || managementTab === 'finance') renderManagement();
    refreshCheckoutClients();
    notifyMonthlyBirthdays();
  }, error => {
    console.error('Erro ao carregar clientes:', error);
    showToast('Erro ao carregar o banco de clientes.', 'danger');
  });
}

async function createManagementClient(client) {
  const docRef = client.id ? db.collection('clients').doc(client.id) : db.collection('clients').doc();
  await docRef.set({
    name: String(client.name || '').trim(), phone: String(client.phone || '').trim(),
    birthDate: String(client.birthDate || '').trim(), email: String(client.email || '').trim(),
    createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser?.uid || ''
  });
  return docRef.id;
}

async function relinkClientSales(oldClientId, newClientId, clientName) {
  const snapshot = await db.collection('sales').where('clientId', '==', oldClientId).get();
  if (snapshot.empty) return;
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.update(doc.ref, { clientId: newClientId, clientName: String(clientName || '').trim() }));
  await batch.commit();
}

function loadSystemSettings() {
  if (settingsUnsubscribe) settingsUnsubscribe();
  settingsUnsubscribe = db.collection('storeSettings').doc('integrations').onSnapshot(doc => {
    if (doc.exists) systemSettings = { ...systemSettings, ...doc.data() };
    if (managementTab === 'ai') renderManagement();
    if (window.updateCardFeePreview) updateCardFeePreview();
  }, error => console.error('Erro ao carregar configurações da loja:', error));
}

function getCardFeeRate(installments) {
  return Number(systemSettings.cardFeeRates?.[String(installments)] || 0);
}

function loadFinancialEntries() {
  if (financialUnsubscribe) financialUnsubscribe();
  financialUnsubscribe = db.collection('financialEntries').onSnapshot(snapshot => {
    allFinancialEntries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allFinancialEntries.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    if (managementTab === 'finance') renderManagement();
    syncExistingSalesToFinance();
  }, error => {
    console.error('Erro ao carregar financeiro:', error);
    showToast('Erro ao sincronizar os dados financeiros.', 'danger');
  });
}

async function syncExistingSalesToFinance() {
  if (financeSyncRunning || !Array.isArray(allSales)) return;
  const registeredSaleIds = new Set(allFinancialEntries.map(entry => entry.saleId).filter(Boolean));
  const missingSales = allSales.filter(sale => sale.status === 'CONCLUIDA' && !registeredSaleIds.has(sale.saleId || sale.id));
  if (!missingSales.length) return;
  financeSyncRunning = true;
  try {
    for (const sale of missingSales) await ensureSaleFinancialEntries(sale);
  } catch (error) {
    console.error('Erro ao sincronizar vendas antigas com o financeiro:', error);
    showToast('Não foi possível sincronizar algumas vendas com o financeiro.', 'warning');
  } finally {
    financeSyncRunning = false;
  }
}

let managementTab = 'clients';
function initManagement() {
  document.querySelectorAll('[data-management-tab]').forEach(button => {
    button.addEventListener('click', () => {
      managementTab = button.dataset.managementTab;
      document.querySelectorAll('[data-management-tab]').forEach(item => item.classList.toggle('active', item === button));
      renderManagement();
    });
  });
  renderManagement();
}

function renderManagement() {
  const target = document.getElementById('management-content');
  if (!target) return;
  const views = { clients: renderClients, finance: renderFinance, team: renderTeam, ai: renderAI, plan: renderPlan };
  target.innerHTML = views[managementTab]();
}

function renderClients() {
  const clients = getManagementClients();
  const activeSales = (Array.isArray(allSales) ? allSales : []).filter(sale => sale.status !== 'CANCELADA');
  const birthdayClients = getMonthlyBirthdayClients();
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
  return `
    <div class="birthday-panel table-container">
      <div class="birthday-panel-heading"><div><h3><i class="fa-solid fa-cake-candles"></i> Aniversariantes de ${monthName}</h3><p>${birthdayClients.length ? `${birthdayClients.length} cliente(s) para lembrar e preparar promoções.` : 'Nenhum aniversariante cadastrado neste mês.'}</p></div><span>${birthdayClients.length}</span></div>
      ${birthdayClients.length ? `<div class="birthday-list">${birthdayClients.map(client => `<div class="birthday-client"><div class="birthday-day">${String(getBirthdayParts(client.birthDate).day).padStart(2, '0')}</div><div><b>${escapeHtml(client.name)}</b><small>${formatBirthDate(client.birthDate)}${isBirthdayToday(client.birthDate) ? ' · Hoje! 🎉' : ''}</small></div>${client.phone ? `<button class="btn btn-success btn-sm" onclick="openClientWhatsApp('${client.id}')" title="Enviar promoção pelo WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>` : ''}</div>`).join('')}</div>` : ''}
    </div>
    <div class="management-grid">
      <form class="table-container management-form" onsubmit="saveClient(event)">
        <h3><i class="fa-solid fa-user-plus"></i> Novo cliente</h3>
        <div class="form-group"><label>Nome *</label><input class="form-control" name="name" required maxlength="100"></div>
        <div class="form-row">
          <div class="form-group"><label>Telefone</label><input class="form-control" name="phone" inputmode="tel"></div>
          <div class="form-group"><label>Data de nascimento</label><input class="form-control" name="birthDate" type="date"></div>
        </div>
        <div class="form-group"><label>E-mail</label><input class="form-control" name="email" type="email"></div>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar cliente</button>
      </form>
      <div class="table-container management-list">
        <div class="list-heading"><h3>Clientes cadastrados</h3><span>${clients.length.toLocaleString('pt-BR')} / 9.000</span></div>
        <div class="custom-table-responsive"><table class="custom-table"><thead><tr><th>Nome</th><th>WhatsApp</th><th>Compras</th><th>Preferência</th><th>Ações</th></tr></thead>
        <tbody>${clients.length ? clients.map(c => {
          const sales = activeSales.filter(sale => sale.clientId === c.id);
          const counts = sales.reduce((result, sale) => ({ ...result, [sale.paymentMethod]: (result[sale.paymentMethod] || 0) + 1 }), {});
          const favorite = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
          return `<tr><td><b>${escapeHtml(c.name)}</b><small class="client-secondary">${c.birthDate ? `🎂 ${formatBirthDate(c.birthDate)}` : escapeHtml(c.email || '')}</small></td><td>${c.phone ? `<a class="whatsapp-link" href="${getClientWhatsAppUrl(c.phone)}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> ${escapeHtml(c.phone)}</a>` : '—'}</td><td>${sales.length}</td><td>${favorite ? getPaymentLabel(favorite) : '—'}</td><td><div class="client-actions"><button class="btn btn-secondary btn-sm" onclick="openClientProfile('${c.id}')" title="Ver perfil e histórico"><i class="fa-solid fa-chart-pie"></i></button>${c.phone ? `<button class="btn btn-success btn-sm" onclick="openClientWhatsApp('${c.id}')" title="Conversar no WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>` : ''}<button class="btn btn-danger btn-sm" onclick="deleteClient('${c.id}')" title="Excluir"><i class="fa-solid fa-trash"></i></button></div></td></tr>`;
        }).join('') : '<tr><td colspan="5" class="empty-cell">Nenhum cliente cadastrado.</td></tr>'}</tbody></table></div>
      </div>
    </div>`;
}

async function saveClient(event) {
  event.preventDefault();
  const clients = getManagementClients();
  if (clients.length >= MG_LIMITS.clients) return showToast('Limite de 9.000 clientes atingido.', 'warning');
  const data = new FormData(event.target);
  try {
    await createManagementClient({ name: data.get('name'), phone: data.get('phone'), birthDate: data.get('birthDate'), email: data.get('email') });
    event.target.reset();
    showToast('Cliente cadastrado com sucesso.', 'success');
  } catch (error) {
    console.error('Erro ao cadastrar cliente:', error);
    showToast('Não foi possível cadastrar o cliente.', 'danger');
  }
}
async function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  try {
    const [sales, financialEntries] = await Promise.all([
      db.collection('sales').where('clientId', '==', id).limit(1).get(),
      db.collection('financialEntries').where('clientId', '==', id).limit(1).get()
    ]);
    if (!sales.empty || !financialEntries.empty) return showToast('Este cliente possui compras ou lançamentos financeiros e não pode ser excluído.', 'warning');
    await db.collection('clients').doc(id).delete();
  }
  catch (error) { console.error(error); showToast('Não foi possível excluir o cliente.', 'danger'); }
}

function getClientWhatsAppUrl(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

function openClientWhatsApp(id) {
  const client = getManagementClients().find(item => item.id === id);
  if (!client?.phone) return showToast('Este cliente não possui WhatsApp cadastrado.', 'warning');
  window.open(getClientWhatsAppUrl(client.phone), '_blank', 'noopener');
}

function getPaymentLabel(method) {
  return ({ DINHEIRO: 'Dinheiro', PIX: 'PIX', CARTAO_CREDITO: 'Crédito', CARTAO_DEBITO: 'Débito', CREDITO_LOJA: 'Fiado' })[method] || method;
}

function getBirthdayParts(value) {
  const parts = String(value || '').split('-').map(Number);
  return { year: parts[0] || 0, month: parts[1] || 0, day: parts[2] || 0 };
}

function formatBirthDate(value) {
  const { year, month, day } = getBirthdayParts(value);
  return year && month && day ? `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}` : '—';
}

function getMonthlyBirthdayClients() {
  const currentMonth = new Date().getMonth() + 1;
  return getManagementClients().filter(client => getBirthdayParts(client.birthDate).month === currentMonth)
    .sort((a, b) => getBirthdayParts(a.birthDate).day - getBirthdayParts(b.birthDate).day);
}

function isBirthdayToday(value) {
  const now = new Date(); const birthday = getBirthdayParts(value);
  return birthday.month === now.getMonth() + 1 && birthday.day === now.getDate();
}

function notifyMonthlyBirthdays() {
  const clients = getMonthlyBirthdayClients();
  if (!clients.length) return;
  const now = new Date();
  const noticeKey = `marimodas_birthday_notice_${currentUser?.uid || 'user'}_${now.getFullYear()}_${now.getMonth() + 1}`;
  if (sessionStorage.getItem(noticeKey)) return;
  sessionStorage.setItem(noticeKey, '1');
  const names = clients.slice(0, 3).map(client => client.name).join(', ');
  showToast(`🎂 ${clients.length} aniversariante(s) neste mês: ${names}${clients.length > 3 ? ' e mais.' : '.'}`, 'info', 7000);
}

async function saveClientBirthDate(id) {
  const input = document.getElementById('client-profile-birthdate');
  if (!input?.value) return showToast('Informe a data de nascimento.', 'warning');
  try {
    await db.collection('clients').doc(id).update({ birthDate: input.value, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('Data de nascimento atualizada.', 'success');
    document.getElementById('client-profile-modal')?.classList.remove('active');
  } catch (error) {
    console.error('Erro ao atualizar nascimento:', error);
    showToast('Não foi possível atualizar a data.', 'danger');
  }
}

async function openClientProfile(id) {
  const client = getManagementClients().find(item => item.id === id);
  if (!client) return;
  let sales = (Array.isArray(allSales) ? allSales : []).filter(sale => sale.clientId === id && sale.status !== 'CANCELADA');
  try {
    const snapshot = await db.collection('sales').where('clientId', '==', id).get();
    sales = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(sale => sale.status !== 'CANCELADA');
    sales.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  } catch (error) { console.error('Erro ao buscar histórico completo do cliente:', error); }
  const total = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const pendingDebt = allFinancialEntries.filter(entry => entry.clientId === id && entry.status === 'pending').reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const counts = sales.reduce((result, sale) => ({ ...result, [sale.paymentMethod]: (result[sale.paymentMethod] || 0) + 1 }), {});
  const preferred = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const paymentSummary = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([method, count]) => `<span>${getPaymentLabel(method)}: <b>${count}</b></span>`).join('');
  let modal = document.getElementById('client-profile-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'client-profile-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card client-profile-card"><div class="modal-header"><h3><i class="fa-solid fa-user"></i> ${escapeHtml(client.name)}</h3><button class="modal-close" onclick="document.getElementById('client-profile-modal').classList.remove('active')"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="client-birthday-editor"><div><label for="client-profile-birthdate"><i class="fa-solid fa-cake-candles"></i> Data de nascimento</label><input id="client-profile-birthdate" class="form-control" type="date" value="${escapeHtml(client.birthDate || '')}"></div><button class="btn btn-secondary" onclick="saveClientBirthDate('${client.id}')"><i class="fa-solid fa-floppy-disk"></i> Salvar data</button></div><div class="client-profile-stats"><div><span>Compras</span><strong>${sales.length}</strong></div><div><span>Total comprado</span><strong>${mgMoney(total)}</strong></div><div><span>Pagamento preferido</span><strong>${preferred ? getPaymentLabel(preferred) : '—'}</strong></div><div><span>Fiado pendente</span><strong class="client-debt-value">${mgMoney(pendingDebt)}</strong></div></div>${paymentSummary ? `<div class="client-payment-summary">${paymentSummary}</div>` : ''}<h4>Histórico de compras</h4><div class="client-history">${sales.length ? sales.map(sale => `<div><span><b>#${String(sale.saleId || sale.id).slice(0, 8).toUpperCase()}</b><small>${sale.createdAt?.toDate ? sale.createdAt.toDate().toLocaleDateString('pt-BR') : '—'} · ${getPaymentLabel(sale.paymentMethod)}</small></span><strong>${mgMoney(sale.total)}</strong></div>`).join('') : '<p class="empty-cell">Nenhuma compra vinculada a este cliente.</p>'}</div></div><div class="modal-footer">${client.phone ? `<button class="btn btn-success" onclick="openClientWhatsApp('${client.id}')"><i class="fa-brands fa-whatsapp"></i> Conversar</button>` : ''}<button class="btn btn-secondary" onclick="document.getElementById('client-profile-modal').classList.remove('active')">Fechar</button></div></div>`;
  modal.classList.add('active');
}

function renderFinance() {
  const entries = allFinancialEntries.filter(entry => entry.status !== 'cancelled');
  syncExistingSalesToFinance();
  const income = entries.filter(e => e.type === 'income' && e.status !== 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const expense = entries.filter(e => e.type === 'expense' && e.status !== 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const receivable = entries.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const balance = income - expense;
  const inventoryCapital = (allProducts || []).reduce((sum, product) => sum + (Number(product.costPrice) || 0) * (Number(product.stockQty) || 0), 0);
  const inventoryExpectedRevenue = (allProducts || []).reduce((sum, product) => sum + (Number(product.sellPrice) || 0) * (Number(product.stockQty) || 0), 0);
  const inventoryPotentialMargin = inventoryExpectedRevenue - inventoryCapital;
  const inventoryUnits = (allProducts || []).reduce((sum, product) => sum + (Number(product.stockQty) || 0), 0);
  const productsWithoutCost = (allProducts || []).filter(product => Number(product.stockQty) > 0 && !(Number(product.costPrice) > 0)).length;
  const productsWithoutSellPrice = (allProducts || []).filter(product => Number(product.stockQty) > 0 && !(Number(product.sellPrice) > 0)).length;
  return `
    <div class="stats-grid compact-stats">
      <div class="stat-card"><div class="stat-icon green"><i class="fa-solid fa-arrow-trend-up"></i></div><div class="stat-info"><h3>${mgMoney(income)}</h3><p>Entradas</p></div></div>
      <div class="stat-card"><div class="stat-icon pink"><i class="fa-solid fa-arrow-trend-down"></i></div><div class="stat-info"><h3>${mgMoney(expense)}</h3><p>Saídas</p></div></div>
      <div class="stat-card"><div class="stat-icon amber"><i class="fa-solid fa-clock"></i></div><div class="stat-info"><h3>${mgMoney(receivable)}</h3><p>A receber (fiado)</p></div></div>
      <div class="stat-card"><div class="stat-icon ${balance < 0 ? 'pink' : 'purple'}"><i class="fa-solid fa-scale-balanced"></i></div><div class="stat-info"><h3 style="color:${balance < 0 ? 'var(--danger)' : 'var(--text-primary)'}">${mgMoney(balance)}</h3><p>Saldo atual</p></div></div>
    </div>
    <div class="inventory-capital-control table-container">
      <div>
        <h3><i class="fa-solid fa-boxes-stacked"></i> Valores do estoque</h3>
        <p>Consulte o valor investido e o faturamento esperado com a venda das peças.</p>
      </div>
      <button class="btn btn-secondary" type="button" onclick="toggleInventoryCapital()">
        <i class="fa-solid ${showInventoryCapital ? 'fa-eye-slash' : 'fa-eye'}"></i> ${showInventoryCapital ? 'Ocultar valor' : 'Ver valor no estoque'}
      </button>
      ${showInventoryCapital ? `<div class="inventory-capital-result">
        <div class="inventory-value-card invested"><span>Dinheiro investido</span><strong>${mgMoney(inventoryCapital)}</strong><small>Preço de custo × estoque atual</small></div>
        <div class="inventory-value-card expected"><span>Faturamento esperado</span><strong>${mgMoney(inventoryExpectedRevenue)}</strong><small>Preço de venda × estoque atual</small></div>
        <div class="inventory-value-card margin"><span>Margem bruta potencial</span><strong>${mgMoney(inventoryPotentialMargin)}</strong><small>Esperado menos investido</small></div>
        <p class="inventory-capital-summary">${inventoryUnits.toLocaleString('pt-BR')} unidade(s) disponível(is)${productsWithoutCost ? ` · ${productsWithoutCost} produto(s) sem preço de custo` : ''}${productsWithoutSellPrice ? ` · ${productsWithoutSellPrice} produto(s) sem preço de venda` : ''}</p>
      </div>` : ''}
    </div>
    <div class="management-grid">
      <form class="table-container management-form" onsubmit="saveFinanceEntry(event)">
        <h3>Novo lançamento</h3>
        <div class="form-row"><div class="form-group"><label>Tipo</label><select class="form-control" name="type" onchange="toggleFinanceEntryFields(this.value)"><option value="income">Entrada recebida</option><option value="expense">Saída paga</option><option value="receivable">Fiado antigo / a receber</option></select></div><div class="form-group"><label>Valor *</label><input class="form-control" name="amount" type="number" min="0.01" step="0.01" required></div></div>
        <div id="finance-client-field" class="form-group" style="display:none;"><label>Cliente devedor *</label><select class="form-control" name="clientId"><option value="">Selecione uma cliente</option>${getManagementClients().map(client => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('')}</select><small class="form-help">A dívida será vinculada ao perfil da cliente, sem movimentar o estoque.</small></div>
        <div class="form-group"><label>Descrição *</label><input class="form-control" name="description" required></div>
        <div class="form-group"><label>Vencimento</label><input id="finance-due-date" class="form-control" name="dueDate" type="date"></div>
        <button class="btn btn-primary" type="submit">Adicionar lançamento</button>
      </form>
      <div class="table-container management-list"><div class="list-heading"><h3>Fluxo financeiro</h3></div>
        <div class="custom-table-responsive"><table class="custom-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>
        ${entries.length ? entries.map(e => `<tr><td>${escapeHtml(e.description)}${e.clientName ? `<small class="finance-client-name"><i class="fa-solid fa-user"></i> ${escapeHtml(e.clientName)}</small>` : ''}</td><td class="${e.type === 'expense' ? 'amount-out' : 'amount-in'}">${mgMoney(e.amount)}</td><td>${e.dueDate ? new Date(e.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td><td><span class="badge ${e.status === 'pending' ? 'badge-warning' : 'badge-success'}">${e.status === 'pending' ? 'Pendente' : 'Pago'}</span></td><td>${e.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="settleFinance('${e.id}')">Receber</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Nenhum lançamento.</td></tr>'}
        </tbody></table></div></div>
    </div>`;
}

function toggleInventoryCapital() {
  showInventoryCapital = !showInventoryCapital;
  renderManagement();
}
async function saveFinanceEntry(event) {
  event.preventDefault(); const data = new FormData(event.target);
  const selectedType = data.get('type');
  const isReceivable = selectedType === 'receivable';
  const client = isReceivable ? getManagementClients().find(item => item.id === data.get('clientId')) : null;
  if (isReceivable && !client) return showToast('Selecione a cliente responsável pelo fiado.', 'warning');
  if (isReceivable && !data.get('dueDate')) return showToast('Informe o vencimento da dívida.', 'warning');
  try {
    await db.collection('financialEntries').add({ type: isReceivable ? 'income' : selectedType, amount: Number(data.get('amount')), description: data.get('description').trim(), dueDate: data.get('dueDate'), status: isReceivable ? 'pending' : 'paid', clientId: client?.id || '', clientName: client?.name || '', paymentMethod: isReceivable ? 'CREDITO_LOJA' : '', source: isReceivable ? 'legacy_credit' : 'manual', automatic: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.uid });
    event.target.reset(); toggleFinanceEntryFields('income'); showToast(isReceivable ? 'Dívida cadastrada em contas a receber.' : 'Lançamento registrado.', 'success');
  } catch (error) {
    console.error('Erro ao salvar lançamento:', error); showToast('Erro ao salvar lançamento financeiro.', 'danger');
  }
}
async function settleFinance(id) {
  try {
    await db.collection('financialEntries').doc(id).update({ status: 'paid', paidAt: firebase.firestore.FieldValue.serverTimestamp(), paidBy: currentUser.uid });
    showToast('Recebimento confirmado.', 'success');
  } catch (error) {
    console.error('Erro ao confirmar recebimento:', error); showToast('Erro ao confirmar recebimento.', 'danger');
  }
}
function renderTeam() {
  return `<div class="table-container management-form" style="max-width:760px;"><h3><i class="fa-solid fa-user-shield"></i> Acessos gerenciados pelo Firebase</h3>
    <p style="color:var(--text-secondary); line-height:1.7;">O cadastro público está desativado. Para liberar uma pessoa, crie a conta em <b>Firebase Authentication</b> e depois crie o perfil autorizado na coleção <b>users</b> do Firestore usando o mesmo UID.</p>
    <div class="auth-access-steps"><div><b>1.</b> Authentication → Users → Add user</div><div><b>2.</b> Copie o UID criado</div><div><b>3.</b> Firestore → users → Add document</div><div><b>4.</b> Use o UID como ID e informe active = true</div></div>
    <p class="form-help">Para bloquear alguém sem apagar o histórico, altere o campo <b>active</b> para <b>false</b>.</p></div>`;
}
function renderAI() {
  const settings = systemSettings;
  return `<div class="management-grid">
    <div class="table-container management-form"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Assistente de conteúdo</h3>
      <div class="form-group"><label>Produto ou campanha</label><input id="ai-topic" class="form-control" placeholder="Ex.: coleção primavera"></div>
      <div class="form-group"><label>Canal</label><select id="ai-channel" class="form-control"><option>Instagram</option><option>Facebook</option><option>WhatsApp</option></select></div>
      <button class="btn btn-primary" onclick="generateSocialContent()"><i class="fa-solid fa-sparkles"></i> Gerar texto</button>
      <textarea id="ai-output" class="form-control ai-output" rows="7" placeholder="O conteúdo aparecerá aqui..."></textarea>
    </div>
    <form class="table-container management-form" onsubmit="saveIntegrations(event)"><h3><i class="fa-solid fa-plug"></i> Integrações</h3>
      <div class="form-group"><label>WhatsApp da loja</label><input class="form-control" name="whatsapp" value="${escapeHtml(settings.whatsapp || '')}" placeholder="5585999999999"></div>
      <div class="form-group"><label>Provedor da maquininha</label><input class="form-control" name="terminal" value="${escapeHtml(settings.terminal || 'Mercado Pago')}" placeholder="Mercado Pago"></div>
      <h4 style="margin:8px 0 10px;">Taxa do cartão de crédito por parcela (%)</h4>
      <div class="fee-rate-grid">${Array.from({ length: 12 }, (_, index) => { const n = index + 1; return `<div class="form-group"><label>${n}x</label><input class="form-control" name="fee_${n}" type="number" min="0" max="100" step="0.01" value="${Number(settings.cardFeeRates?.[String(n)] || 0).toFixed(2)}"></div>`; }).join('')}</div>
      <button class="btn btn-primary">Salvar integrações</button>
      <button type="button" class="btn btn-success" onclick="openWhatsAppSupport()"><i class="fa-brands fa-whatsapp"></i> Abrir WhatsApp</button>
      <p class="form-help">A confirmação automática da maquininha e respostas automáticas no WhatsApp exigem as credenciais/API do provedor.</p>
    </form>
  </div>`;
}
function generateSocialContent() {
  const topic = document.getElementById('ai-topic').value.trim(); const channel = document.getElementById('ai-channel').value;
  if (!topic) return showToast('Informe um produto ou campanha.', 'warning');
  const texts = {
    Instagram: `✨ Novidade na MARIMODAS! ${topic} chegou para transformar seus looks. Visite a loja e escolha o seu favorito! 💖 #Moda #Novidade #MariModas`,
    Facebook: `Tem novidade esperando por você: ${topic}. Qualidade, estilo e atendimento especial na MARIMODAS. Fale com a gente e saiba mais!`,
    WhatsApp: `Olá! 💖 Passando para contar uma novidade da MARIMODAS: ${topic}. Quer que eu separe algumas opções para você?`
  };
  document.getElementById('ai-output').value = texts[channel];
}
async function saveIntegrations(event) {
  event.preventDefault(); const data = new FormData(event.target);
  const cardFeeRates = {};
  for (let n = 1; n <= 12; n++) cardFeeRates[String(n)] = Number(data.get(`fee_${n}`) || 0);
  try {
    await db.collection('storeSettings').doc('integrations').set({ whatsapp: data.get('whatsapp').replace(/\D/g, ''), terminal: data.get('terminal').trim() || 'Mercado Pago', cardFeeRates, updatedAt: firebase.firestore.FieldValue.serverTimestamp(), updatedBy: currentUser.uid }, { merge: true });
    showToast('Integrações e taxas salvas.', 'success');
  } catch (error) {
    console.error('Erro ao salvar integrações:', error); showToast('Erro ao salvar as configurações.', 'danger');
  }
}
function openWhatsAppSupport() {
  const phone = (systemSettings.whatsapp || '').replace(/\D/g, '');
  if (!phone) return showToast('Configure o WhatsApp da loja primeiro.', 'warning');
  window.open(`https://wa.me/${phone}`, '_blank', 'noopener');
}

function renderPlan() {
  const features = ['Gestão financeira completa', 'Controle de acesso por usuários', 'Controle de estoque', 'Recursos com Inteligência Artificial', 'Faturamento ilimitado', 'Até 9.000 clientes', 'Até 9.000 produtos', 'WhatsApp AI', 'Redes sociais IA', 'Pagamento por maquininha', 'Crédito da loja (fiado)'];
  return `<div class="plan-card table-container"><div class="plan-hero"><i class="fa-solid fa-store"></i><div><h2>Recursos da loja</h2><p>Sistema de gestão particular da MARIMODAS</p></div></div><div class="feature-list">${features.map(f => `<div><i class="fa-solid fa-circle-check"></i><span>${f}</span></div>`).join('')}</div><p class="form-help">Emissão de notas fiscais não está habilitada, conforme solicitado.</p></div>`;
}

function refreshCheckoutClients(selectedId = '') {
  ['sale-client', 'store-credit-client'].forEach(id => {
    const select = document.getElementById(id); if (!select) return;
    const selected = selectedId || select.value;
    select.innerHTML = '<option value="">Selecione um cliente cadastrado</option>' + getManagementClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    select.value = selected;
  });
}
function toggleFinanceEntryFields(type) {
  const isReceivable = type === 'receivable';
  const clientField = document.getElementById('finance-client-field');
  const clientSelect = clientField?.querySelector('select');
  const dueDate = document.getElementById('finance-due-date');
  if (clientField) clientField.style.display = isReceivable ? 'block' : 'none';
  if (clientSelect) clientSelect.required = isReceivable;
  if (dueDate) dueDate.required = isReceivable;
}
function refreshStoreCreditClients() { refreshCheckoutClients(); }

function toggleQuickClientForm() {
  const form = document.getElementById('quick-client-form');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

async function saveQuickClient(event) {
  event.preventDefault();
  const data = new FormData(event.target);
  if (getManagementClients().length >= MG_LIMITS.clients) return showToast('Limite de 9.000 clientes atingido.', 'warning');
  const button = event.submitter;
  if (button) button.disabled = true;
  try {
    const client = { name: data.get('name'), phone: data.get('phone'), birthDate: data.get('birthDate'), email: data.get('email') };
    const id = await createManagementClient(client);
    if (!allManagementClients.some(item => item.id === id)) allManagementClients.push({ id, ...client });
    refreshCheckoutClients(id);
    event.target.reset(); event.target.style.display = 'none';
    showToast('Cliente cadastrado e selecionado.', 'success');
  } catch (error) {
    console.error('Erro no cadastro rápido:', error);
    showToast('Não foi possível cadastrar o cliente.', 'danger');
  } finally { if (button) button.disabled = false; }
}

document.addEventListener('DOMContentLoaded', initManagement);
