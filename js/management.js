/* Gestão complementar: clientes, financeiro, acessos, IA e integrações. */
const MG_LIMITS = { clients: 9000, products: 9000 };
let allFinancialEntries = [];
let financialUnsubscribe = null;
let financeSyncRunning = false;
let systemSettings = { whatsapp: '', terminal: 'Mercado Pago', cardFeeRates: {} };
let settingsUnsubscribe = null;

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
function getManagementClients() { return mgRead('clients'); }

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
  return `
    <div class="management-grid">
      <form class="table-container management-form" onsubmit="saveClient(event)">
        <h3><i class="fa-solid fa-user-plus"></i> Novo cliente</h3>
        <div class="form-group"><label>Nome *</label><input class="form-control" name="name" required maxlength="100"></div>
        <div class="form-row">
          <div class="form-group"><label>Telefone</label><input class="form-control" name="phone" inputmode="tel"></div>
          <div class="form-group"><label>CPF</label><input class="form-control" name="cpf" inputmode="numeric"></div>
        </div>
        <div class="form-group"><label>E-mail</label><input class="form-control" name="email" type="email"></div>
        <button class="btn btn-primary" type="submit"><i class="fa-solid fa-floppy-disk"></i> Salvar cliente</button>
      </form>
      <div class="table-container management-list">
        <div class="list-heading"><h3>Clientes cadastrados</h3><span>${clients.length.toLocaleString('pt-BR')} / 9.000</span></div>
        <div class="custom-table-responsive"><table class="custom-table"><thead><tr><th>Nome</th><th>Contato</th><th>CPF</th><th>Ações</th></tr></thead>
        <tbody>${clients.length ? clients.map(c => `<tr><td><b>${escapeHtml(c.name)}</b></td><td>${escapeHtml(c.phone || c.email || '—')}</td><td>${escapeHtml(c.cpf || '—')}</td><td><button class="btn btn-danger btn-sm" onclick="deleteClient('${c.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="4" class="empty-cell">Nenhum cliente cadastrado.</td></tr>'}</tbody></table></div>
      </div>
    </div>`;
}

function saveClient(event) {
  event.preventDefault();
  const clients = getManagementClients();
  if (clients.length >= MG_LIMITS.clients) return showToast('Limite de 9.000 clientes atingido.', 'warning');
  const data = new FormData(event.target);
  clients.unshift({ id: mgId(), name: data.get('name').trim(), phone: data.get('phone').trim(), cpf: data.get('cpf').trim(), email: data.get('email').trim(), createdAt: new Date().toISOString() });
  mgWrite('clients', clients); event.target.reset(); renderManagement(); refreshStoreCreditClients();
  showToast('Cliente cadastrado com sucesso.', 'success');
}
function deleteClient(id) {
  if (!confirm('Excluir este cliente?')) return;
  mgWrite('clients', getManagementClients().filter(c => c.id !== id)); renderManagement(); refreshStoreCreditClients();
}

function renderFinance() {
  const entries = allFinancialEntries.filter(entry => entry.status !== 'cancelled');
  syncExistingSalesToFinance();
  const income = entries.filter(e => e.type === 'income' && e.status !== 'pending').reduce((s, e) => s + Number(e.amount), 0);
  const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0);
  const receivable = entries.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount), 0);
  return `
    <div class="stats-grid compact-stats">
      <div class="stat-card"><div class="stat-icon green"><i class="fa-solid fa-arrow-trend-up"></i></div><div class="stat-info"><h3>${mgMoney(income)}</h3><p>Entradas</p></div></div>
      <div class="stat-card"><div class="stat-icon pink"><i class="fa-solid fa-arrow-trend-down"></i></div><div class="stat-info"><h3>${mgMoney(expense)}</h3><p>Saídas</p></div></div>
      <div class="stat-card"><div class="stat-icon amber"><i class="fa-solid fa-clock"></i></div><div class="stat-info"><h3>${mgMoney(receivable)}</h3><p>A receber (fiado)</p></div></div>
    </div>
    <div class="management-grid">
      <form class="table-container management-form" onsubmit="saveFinanceEntry(event)">
        <h3>Novo lançamento</h3>
        <div class="form-row"><div class="form-group"><label>Tipo</label><select class="form-control" name="type"><option value="income">Entrada</option><option value="expense">Saída</option></select></div><div class="form-group"><label>Valor *</label><input class="form-control" name="amount" type="number" min="0.01" step="0.01" required></div></div>
        <div class="form-group"><label>Descrição *</label><input class="form-control" name="description" required></div>
        <div class="form-group"><label>Vencimento</label><input class="form-control" name="dueDate" type="date"></div>
        <button class="btn btn-primary" type="submit">Adicionar lançamento</button>
      </form>
      <div class="table-container management-list"><div class="list-heading"><h3>Fluxo financeiro</h3></div>
        <div class="custom-table-responsive"><table class="custom-table"><thead><tr><th>Descrição</th><th>Valor</th><th>Vencimento</th><th>Status</th><th></th></tr></thead><tbody>
        ${entries.length ? entries.map(e => `<tr><td>${escapeHtml(e.description)}</td><td class="${e.type === 'expense' ? 'amount-out' : 'amount-in'}">${mgMoney(e.amount)}</td><td>${e.dueDate ? new Date(e.dueDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</td><td><span class="badge ${e.status === 'pending' ? 'badge-warning' : 'badge-success'}">${e.status === 'pending' ? 'Pendente' : 'Pago'}</span></td><td>${e.status === 'pending' ? `<button class="btn btn-success btn-sm" onclick="settleFinance('${e.id}')">Receber</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-cell">Nenhum lançamento.</td></tr>'}
        </tbody></table></div></div>
    </div>`;
}
async function saveFinanceEntry(event) {
  event.preventDefault(); const data = new FormData(event.target);
  try {
    await db.collection('financialEntries').add({ type: data.get('type'), amount: Number(data.get('amount')), description: data.get('description').trim(), dueDate: data.get('dueDate'), status: 'paid', automatic: false, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.uid });
    event.target.reset(); showToast('Lançamento registrado.', 'success');
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

function refreshStoreCreditClients() {
  const select = document.getElementById('store-credit-client'); if (!select) return;
  const selected = select.value;
  select.innerHTML = '<option value="">Selecione um cliente</option>' + getManagementClients().map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  select.value = selected;
}

document.addEventListener('DOMContentLoaded', initManagement);
