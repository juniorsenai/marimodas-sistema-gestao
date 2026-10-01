/* Controle de peças levadas para experimentar em casa. */
let allTryOns = [];
let tryOnsUnsubscribe = null;
let tryOnSelectedProducts = new Set();
let tryOnAlertTimer = null;

function loadTryOns() {
  if (tryOnsUnsubscribe) tryOnsUnsubscribe();
  tryOnsUnsubscribe = db.collection('tryOns').onSnapshot(snapshot => {
    allTryOns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    allTryOns.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    updateTryOnAlert();
  }, error => {
    console.error('Erro ao carregar experimentações:', error);
    showToast('Erro ao carregar peças em experimentação.', 'danger');
  });
  if (tryOnAlertTimer) clearInterval(tryOnAlertTimer);
  tryOnAlertTimer = setInterval(updateTryOnAlert, 60000);
}

function tryOnDueDate(record) {
  return record.dueAt?.toDate ? record.dueAt.toDate() : record.dueAt ? new Date(record.dueAt) : null;
}
function isTryOnOpen(record) { return ['PENDING', 'OVERDUE', 'AWAITING_PURCHASE'].includes(record.status); }
function isTryOnOverdue(record) {
  const due = tryOnDueDate(record);
  return record.status === 'AWAITING_PURCHASE' || (isTryOnOpen(record) && due && due.getTime() <= Date.now());
}
function formatTryOnDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

function updateTryOnAlert() {
  const overdue = allTryOns.filter(isTryOnOverdue);
  let button = document.getElementById('tryon-global-alert');
  if (!overdue.length) { button?.remove(); return; }
  if (!button) {
    button = document.createElement('button'); button.id = 'tryon-global-alert'; button.type = 'button'; button.className = 'tryon-global-alert';
    button.onclick = openTryOnOverview; document.body.appendChild(button);
  }
  button.innerHTML = `<i class="fa-solid fa-bell"></i><span>${overdue.length}</span><b>Peças atrasadas</b>`;
}

function openTryOnOverview() {
  const records = allTryOns.filter(isTryOnOpen);
  let modal = document.getElementById('tryon-overview-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'tryon-overview-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card tryon-overview-card"><div class="modal-header"><div><h3><i class="fa-solid fa-house-user"></i> Peças em experimentação</h3><small>Prazo de devolução ou compra: 24 horas</small></div><button class="modal-close" onclick="closeTryOnOverview()"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="client-search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="form-control" type="search" placeholder="Buscar por cliente ou peça..." oninput="filterTryOnRecords(this.value)"></div><div class="tryon-record-list">${records.length ? records.map(renderTryOnRecord).join('') : '<div class="empty-cell">Nenhuma peça está em experimentação.</div>'}<div id="tryon-search-empty" class="empty-cell" style="display:none;">Nenhum registro encontrado.</div></div></div><div class="modal-footer"><button class="btn btn-primary" onclick="closeTryOnOverview(); openNewTryOnModal()"><i class="fa-solid fa-plus"></i> Nova saída</button><button class="btn btn-secondary" onclick="closeTryOnOverview()">Fechar</button></div></div>`;
  modal.classList.add('active');
}
function renderTryOnRecord(record) {
  const due = tryOnDueDate(record); const overdue = isTryOnOverdue(record);
  const activeItems = (record.items || []).filter(item => !['returned', 'purchased'].includes(item.status));
  const search = `${record.clientName || ''} ${activeItems.map(item => item.name).join(' ')}`;
  return `<div class="tryon-record ${overdue ? 'overdue' : ''}" data-tryon-search="${escapeHtml(search)}"><div><b>${escapeHtml(record.clientName || 'Cliente')}</b><small>${activeItems.length} peça(s) · Prazo: ${formatTryOnDate(due)}</small><p>${activeItems.map(item => escapeHtml(item.name)).join(' · ')}</p></div><span class="badge ${overdue ? 'badge-danger' : 'badge-warning'}">${record.status === 'AWAITING_PURCHASE' ? 'Aguardando compra' : overdue ? 'Atrasado' : 'Em prazo'}</span><button class="btn ${overdue ? 'btn-danger' : 'btn-secondary'} btn-sm" onclick="openResolveTryOn('${record.id}')"><i class="fa-solid fa-list-check"></i> Resolver</button></div>`;
}
function closeTryOnOverview() { document.getElementById('tryon-overview-modal')?.classList.remove('active'); }
function filterTryOnRecords(value) {
  const query = normalizeClientSearch(value); const rows = Array.from(document.querySelectorAll('.tryon-record')); let count = 0;
  rows.forEach(row => { const match = !query || normalizeClientSearch(row.dataset.tryonSearch).includes(query); row.style.display = match ? '' : 'none'; if (match) count++; });
  const empty = document.getElementById('tryon-search-empty'); if (empty) empty.style.display = rows.length && !count ? 'block' : 'none';
}

function openNewTryOnModal() {
  if (!getManagementClients().length) return showToast('Cadastre a cliente antes de liberar peças.', 'warning');
  tryOnSelectedProducts = new Set();
  let modal = document.getElementById('new-tryon-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'new-tryon-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card tryon-new-card"><div class="modal-header"><h3><i class="fa-solid fa-shirt"></i> Liberar peças para experimentar</h3><button class="modal-close" onclick="closeNewTryOnModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="tryon-rule"><i class="fa-solid fa-clock"></i><span>A cliente terá 24 horas para devolver ou comprar as peças.</span></div><div class="form-group"><label>Cliente *</label><select id="tryon-client" class="form-control"><option value="">Selecione a cliente</option>${getManagementClients().map(client => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('')}</select></div><div class="client-search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="form-control" type="search" placeholder="Buscar peça por nome, tamanho, cor ou código..." oninput="renderTryOnProductChoices(this.value)"></div><div id="tryon-product-choices" class="tryon-product-choices"></div></div><div class="modal-footer"><span id="tryon-selected-count" class="nfe-item-count">0 peça(s) selecionada(s)</span><button class="btn btn-secondary" onclick="closeNewTryOnModal()">Cancelar</button><button id="confirm-tryon-button" class="btn btn-primary" onclick="confirmNewTryOn()"><i class="fa-solid fa-check"></i> Liberar por 24h</button></div></div>`;
  modal.classList.add('active'); renderTryOnProductChoices();
}
function closeNewTryOnModal() { document.getElementById('new-tryon-modal')?.classList.remove('active'); }
function renderTryOnProductChoices(query = '') {
  const target = document.getElementById('tryon-product-choices'); if (!target) return;
  const search = normalizeClientSearch(query);
  const products = allProducts.filter(product => Number(product.stockQty) > 0 && (!search || normalizeClientSearch(`${product.name} ${product.size} ${product.color} ${product.barcode}`).includes(search)));
  target.innerHTML = products.length ? products.map(product => `<label class="tryon-product-choice"><input type="checkbox" ${tryOnSelectedProducts.has(product.id) ? 'checked' : ''} onchange="toggleTryOnProduct('${product.id}', this.checked)"><span><b>${escapeHtml(product.name)}</b><small>Tam. ${escapeHtml(product.size || '—')} · ${escapeHtml(product.color || '—')} · ${product.stockQty} disponível(is)</small></span><strong>${Number(product.sellPrice || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}</strong></label>`).join('') : '<div class="empty-cell">Nenhuma peça disponível.</div>';
}
function toggleTryOnProduct(id, selected) {
  if (selected) tryOnSelectedProducts.add(id); else tryOnSelectedProducts.delete(id);
  const count = document.getElementById('tryon-selected-count'); if (count) count.textContent = `${tryOnSelectedProducts.size} peça(s) selecionada(s)`;
}
async function confirmNewTryOn() {
  const clientId = document.getElementById('tryon-client')?.value || '';
  const client = getManagementClients().find(item => item.id === clientId);
  const products = [...tryOnSelectedProducts].map(id => allProducts.find(product => product.id === id)).filter(Boolean);
  if (!client) return showToast('Selecione a cliente.', 'warning');
  if (!products.length) return showToast('Selecione pelo menos uma peça.', 'warning');
  const button = document.getElementById('confirm-tryon-button'); if (button) button.disabled = true;
  try {
    const recordRef = db.collection('tryOns').doc(); const productRefs = products.map(product => db.collection('products').doc(product.id));
    const dueAt = firebase.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
    await db.runTransaction(async transaction => {
      const docs = await Promise.all(productRefs.map(ref => transaction.get(ref)));
      docs.forEach((doc, index) => { if (!doc.exists || Number(doc.data().stockQty) < 1) throw new Error(`A peça "${products[index].name}" não está mais disponível.`); });
      productRefs.forEach(ref => transaction.update(ref, { stockQty: firebase.firestore.FieldValue.increment(-1), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));
      transaction.set(recordRef, { clientId, clientName: client.name, items: products.map(product => ({ productId: product.id, name: product.name, size: product.size || '', color: product.color || '', barcode: product.barcode || '', sellPrice: Number(product.sellPrice || 0), qty: 1, status: 'pending' })), status: 'PENDING', dueAt, createdAt: firebase.firestore.FieldValue.serverTimestamp(), createdBy: currentUser.uid });
    });
    closeNewTryOnModal(); showToast('Peças liberadas. Prazo de devolução: 24 horas.', 'success', 6000);
  } catch (error) { console.error(error); showToast(error.message || 'Não foi possível liberar as peças.', 'danger'); }
  finally { if (button) button.disabled = false; }
}

function openResolveTryOn(id) {
  const record = allTryOns.find(item => item.id === id); if (!record) return;
  const activeItems = (record.items || []).map((item, index) => ({ ...item, index })).filter(item => !['returned', 'purchased'].includes(item.status));
  let modal = document.getElementById('resolve-tryon-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'resolve-tryon-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card tryon-resolve-card"><div class="modal-header"><div><h3>Resolver peças de ${escapeHtml(record.clientName)}</h3><small>Marque o destino de cada peça</small></div><button class="modal-close" onclick="closeResolveTryOn()"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="tryon-resolve-list">${activeItems.map(item => `<div class="tryon-resolve-item"><div><b>${escapeHtml(item.name)}</b><small>Tam. ${escapeHtml(item.size || '—')} · ${escapeHtml(item.color || '—')} · ${Number(item.sellPrice || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' })}</small></div><select class="form-control" data-tryon-item="${item.index}"><option value="">Selecione...</option><option value="returned">Devolvida</option><option value="purchase">Será comprada</option></select></div>`).join('')}</div><div class="tryon-rule"><i class="fa-solid fa-circle-info"></i><span>Peças devolvidas voltam ao estoque. As compradas irão para o caixa sem nova baixa de estoque.</span></div></div><div class="modal-footer"><button class="btn btn-secondary" onclick="closeResolveTryOn()">Cancelar</button><button class="btn btn-primary" onclick="confirmTryOnResolution('${record.id}')"><i class="fa-solid fa-check"></i> Confirmar</button></div></div>`;
  modal.classList.add('active');
}
function closeResolveTryOn() { document.getElementById('resolve-tryon-modal')?.classList.remove('active'); }
async function confirmTryOnResolution(id) {
  const record = allTryOns.find(item => item.id === id); if (!record) return;
  const selectors = Array.from(document.querySelectorAll('[data-tryon-item]'));
  if (!selectors.length || selectors.some(select => !select.value)) return showToast('Defina se cada peça foi devolvida ou será comprada.', 'warning');
  const items = (record.items || []).map(item => ({ ...item })); const returned = []; const purchased = [];
  selectors.forEach(select => { const index = Number(select.dataset.tryonItem); if (select.value === 'returned') { items[index].status = 'returned'; returned.push(items[index]); } else { items[index].status = 'purchase_pending'; purchased.push(items[index]); } });
  try {
    const batch = db.batch(); const timestamp = firebase.firestore.FieldValue.serverTimestamp();
    returned.forEach(item => batch.update(db.collection('products').doc(item.productId), { stockQty: firebase.firestore.FieldValue.increment(1), updatedAt: timestamp }));
    batch.update(db.collection('tryOns').doc(id), { items, status: purchased.length ? 'AWAITING_PURCHASE' : 'RESOLVED', resolvedAt: purchased.length ? null : timestamp, updatedAt: timestamp });
    await batch.commit();
    returned.forEach(item => { const cartKey = `tryon_${id}_${item.productId}`; cartItems = cartItems.filter(cartItem => (cartItem.cartKey || cartItem.id) !== cartKey); });
    purchased.forEach(item => {
      const cartKey = `tryon_${id}_${item.productId}`;
      if (!cartItems.some(cartItem => (cartItem.cartKey || cartItem.id) === cartKey)) cartItems.push({ id: item.productId, cartKey, name: item.name, size: item.size, color: item.color, price: Number(item.sellPrice || 0), stockQty: 1, qty: 1, stockAlreadyDeducted: true, tryOnId: id });
    });
    closeResolveTryOn(); closeTryOnOverview();
    if (purchased.length) { window.tryOnCheckoutClientId = record.clientId; navigateTo('pdv'); renderCart(); showToast('Peças para compra adicionadas ao caixa. Finalize a venda.', 'success', 6000); }
    else showToast('Devolução concluída e estoque atualizado.', 'success');
  } catch (error) { console.error(error); showToast('Não foi possível concluir a resolução.', 'danger'); }
}
