/* Gestão complementar: clientes, financeiro, acessos, IA e integrações. */
const MG_LIMITS = { clients: 9000, products: 9000 };

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
  const entries = mgRead('finance');
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
function saveFinanceEntry(event) {
  event.preventDefault(); const data = new FormData(event.target); const entries = mgRead('finance');
  entries.unshift({ id: mgId(), type: data.get('type'), amount: Number(data.get('amount')), description: data.get('description').trim(), dueDate: data.get('dueDate'), status: 'paid', createdAt: new Date().toISOString() });
  mgWrite('finance', entries); event.target.reset(); renderManagement(); showToast('Lançamento registrado.', 'success');
}
function settleFinance(id) {
  const entries = mgRead('finance'); const entry = entries.find(e => e.id === id);
  if (entry) { entry.status = 'paid'; entry.paidAt = new Date().toISOString(); mgWrite('finance', entries); renderManagement(); showToast('Recebimento confirmado.', 'success'); }
}
function recordStoreCredit(saleId, clientId, dueDate, amount, installments = 1) {
  const client = getManagementClients().find(c => c.id === clientId); const entries = mgRead('finance');
  const totalCents = Math.round(Number(amount) * 100);
  const baseCents = Math.floor(totalCents / installments);
  const firstDueDate = new Date(dueDate + 'T12:00:00');
  const dueDay = firstDueDate.getDate();
  for (let index = 0; index < installments; index++) {
    const installmentCents = index === installments - 1
      ? totalCents - (baseCents * (installments - 1))
      : baseCents;
    const installmentDue = addMonthsKeepingDay(firstDueDate, index, dueDay);
    entries.push({
      id: mgId(), type: 'income', amount: installmentCents / 100,
      description: `Fiado de ${client?.name || 'cliente'} · venda #${String(saleId).slice(0, 8).toUpperCase()} · parcela ${index + 1}/${installments}`,
      clientId, saleId, installment: index + 1, installments,
      dueDate: installmentDue.toISOString().slice(0, 10), status: 'pending', createdAt: new Date().toISOString()
    });
  }
  entries.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  mgWrite('finance', entries);
}

function addMonthsKeepingDay(date, months, preferredDay) {
  const result = new Date(date);
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(preferredDay, lastDay));
  return result;
}

function renderTeam() {
  const members = mgRead('team');
  return `<div class="management-grid"><form class="table-container management-form" onsubmit="saveTeamMember(event)"><h3>Novo acesso</h3>
    <div class="form-group"><label>Nome *</label><input class="form-control" name="name" required></div><div class="form-group"><label>E-mail *</label><input class="form-control" name="email" type="email" required></div>
    <div class="form-group"><label>Perfil</label><select class="form-control" name="role"><option>Operador de caixa</option><option>Estoquista</option><option>Gerente</option><option>Administrador</option></select></div>
    <button class="btn btn-primary">Adicionar usuário</button><p class="form-help">O administrador deve criar o login correspondente no Firebase Authentication.</p></form>
    <div class="table-container management-list"><div class="list-heading"><h3>Usuários e permissões</h3></div><div class="team-cards">${members.length ? members.map(m => `<div class="team-card"><div class="user-avatar">${escapeHtml(m.name[0].toUpperCase())}</div><div><b>${escapeHtml(m.name)}</b><p>${escapeHtml(m.email)}</p><span class="badge badge-size">${escapeHtml(m.role)}</span></div><button class="btn btn-danger btn-sm" onclick="deleteTeamMember('${m.id}')"><i class="fa-solid fa-trash"></i></button></div>`).join('') : '<p class="empty-cell">Nenhum acesso adicional.</p>'}</div></div></div>`;
}
function saveTeamMember(event) {
  event.preventDefault(); const data = new FormData(event.target); const members = mgRead('team');
  members.unshift({ id: mgId(), name: data.get('name').trim(), email: data.get('email').trim(), role: data.get('role') });
  mgWrite('team', members); event.target.reset(); renderManagement(); showToast('Perfil de acesso adicionado.', 'success');
}
function deleteTeamMember(id) { if (confirm('Remover este acesso?')) { mgWrite('team', mgRead('team').filter(m => m.id !== id)); renderManagement(); } }

function renderAI() {
  const settings = mgRead('integrations')[0] || {};
  return `<div class="management-grid">
    <div class="table-container management-form"><h3><i class="fa-solid fa-wand-magic-sparkles"></i> Assistente de conteúdo</h3>
      <div class="form-group"><label>Produto ou campanha</label><input id="ai-topic" class="form-control" placeholder="Ex.: coleção primavera"></div>
      <div class="form-group"><label>Canal</label><select id="ai-channel" class="form-control"><option>Instagram</option><option>Facebook</option><option>WhatsApp</option></select></div>
      <button class="btn btn-primary" onclick="generateSocialContent()"><i class="fa-solid fa-sparkles"></i> Gerar texto</button>
      <textarea id="ai-output" class="form-control ai-output" rows="7" placeholder="O conteúdo aparecerá aqui..."></textarea>
    </div>
    <form class="table-container management-form" onsubmit="saveIntegrations(event)"><h3><i class="fa-solid fa-plug"></i> Integrações</h3>
      <div class="form-group"><label>WhatsApp da loja</label><input class="form-control" name="whatsapp" value="${escapeHtml(settings.whatsapp || '')}" placeholder="5585999999999"></div>
      <div class="form-group"><label>Provedor da maquininha</label><input class="form-control" name="terminal" value="${escapeHtml(settings.terminal || '')}" placeholder="Rede, Stone, Cielo..."></div>
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
function saveIntegrations(event) {
  event.preventDefault(); const data = new FormData(event.target);
  mgWrite('integrations', [{ whatsapp: data.get('whatsapp').replace(/\D/g, ''), terminal: data.get('terminal').trim() }]);
  showToast('Integrações salvas.', 'success');
}
function openWhatsAppSupport() {
  const phone = (mgRead('integrations')[0]?.whatsapp || '').replace(/\D/g, '');
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
