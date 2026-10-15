/* Trocas e devoluções parciais vinculadas à venda original. */
let exchangeSaleId = '';
let exchangeReturned = new Map();
let exchangeReplacements = new Map();

function exchangeMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getExchangeSale() {
  return allSales.find(sale => sale.id === exchangeSaleId || sale.saleId === exchangeSaleId);
}

function getSaleDate(sale) {
  if (sale?.createdAt?.toDate) return sale.createdAt.toDate();
  if (sale?.createdAt?.seconds) return new Date(sale.createdAt.seconds * 1000);
  return null;
}

function getExchangeDeadline(sale) {
  const date = getSaleDate(sale);
  return date ? new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
}

function canExchangeSale(sale) {
  const deadline = getExchangeDeadline(sale);
  return sale?.status !== 'CANCELADA' && deadline && Date.now() <= deadline.getTime();
}

function renderSaleExchangeHistory(sale) {
  const exchanges = Array.isArray(sale?.exchanges) ? sale.exchanges : [];
  if (!exchanges.length) return '';
  return `<div class="sale-exchange-history"><h4><i class="fa-solid fa-clock-rotate-left"></i> Histórico de trocas e devoluções</h4>${exchanges.slice().reverse().map(exchange => {
    const date = exchange.createdAt?.toDate ? exchange.createdAt.toDate().toLocaleString('pt-BR') : 'Registrada';
    const returned = (exchange.returnedItems || []).map(item => `${item.qty}x ${escapeHtml(item.name)}`).join(', ');
    const replacements = (exchange.replacementItems || []).map(item => `${item.qty}x ${escapeHtml(item.name)}`).join(', ');
    return `<div><span><b>${escapeHtml(exchange.typeLabel || 'Troca/devolução')}</b><small>${date} · ${escapeHtml(exchange.operatorName || '')}</small><small>Devolvido: ${returned}</small>${replacements ? `<small>Levado: ${replacements}</small>` : ''}</span><strong>${exchange.difference > 0 ? '+' : exchange.difference < 0 ? '-' : ''}${exchangeMoney(Math.abs(exchange.difference || 0))}</strong></div>`;
  }).join('')}</div>`;
}

function openExchangeModal(saleId) {
  const sale = allSales.find(item => item.id === saleId || item.saleId === saleId);
  if (!sale) return showToast('Venda não encontrada.', 'warning');
  const deadline = getExchangeDeadline(sale);
  if (!canExchangeSale(sale)) {
    const date = deadline ? deadline.toLocaleDateString('pt-BR') : 'indisponível';
    return showToast(`O prazo de troca desta venda terminou em ${date}.`, 'warning', 6000);
  }
  if (!(sale.items || []).some(item => Number(item.qty) > 0)) return showToast('Esta venda não possui peças disponíveis para troca.', 'warning');

  exchangeSaleId = sale.id || sale.saleId;
  exchangeReturned = new Map();
  exchangeReplacements = new Map();
  let modal = document.getElementById('exchange-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'exchange-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card exchange-modal-card">
    <div class="modal-header"><div><h3><i class="fa-solid fa-rotate"></i> Trocar ou devolver peças</h3><small>Venda #${String(sale.saleId || sale.id).slice(0, 8).toUpperCase()} · ${escapeHtml(sale.clientName || 'Cliente')}</small></div><button class="modal-close" onclick="closeExchangeModal()"><i class="fa-solid fa-xmark"></i></button></div>
    <div class="modal-body">
      <div class="exchange-deadline"><i class="fa-solid fa-calendar-check"></i><span>Troca permitida até <b>${deadline.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</b> — prazo de 7 dias.</span></div>
      <div class="exchange-columns">
        <section><h4>1. Peças devolvidas</h4><p class="exchange-help">Informe somente a quantidade que a cliente está trazendo.</p><div class="exchange-return-list">${sale.items.map((item, index) => `<label class="exchange-item"><span><b>${escapeHtml(item.name)}</b><small>Tam. ${escapeHtml(item.size || '—')} · ${escapeHtml(item.color || '—')} · ${exchangeMoney(item.price)}</small></span><input class="form-control" type="number" min="0" max="${Number(item.qty)}" step="1" value="0" aria-label="Quantidade devolvida de ${escapeHtml(item.name)}" oninput="setExchangeReturned(${index}, this.value)"></label>`).join('')}</div></section>
        <section><h4>2. Peças substitutas <small>(opcional)</small></h4><p class="exchange-help">Deixe vazio quando for apenas uma devolução.</p><div class="client-search-box"><i class="fa-solid fa-magnifying-glass"></i><input class="form-control" type="search" placeholder="Buscar peça..." oninput="renderExchangeProducts(this.value)"></div><div id="exchange-product-list" class="exchange-product-list"></div></section>
      </div>
      <div id="exchange-summary" class="exchange-summary"></div>
      <div id="exchange-payment-field" class="form-group exchange-payment-field" style="display:none;"><label id="exchange-payment-label">Forma de pagamento da diferença</label><select id="exchange-payment-method" class="form-control"><option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="CARTAO_DEBITO">Cartão de débito</option><option value="CARTAO_CREDITO">Cartão de crédito</option><option value="CREDITO_LOJA">Crédito da loja (fiado)</option></select><small id="exchange-payment-help" class="form-help"></small></div>
    </div>
    <div class="modal-footer"><button class="btn btn-secondary" onclick="closeExchangeModal()">Cancelar</button><button id="confirm-exchange-button" class="btn btn-warning" onclick="confirmExchange()"><i class="fa-solid fa-check"></i> Confirmar troca/devolução</button></div>
  </div>`;
  modal.classList.add('active');
  renderExchangeProducts();
  updateExchangeSummary();
}

function closeExchangeModal() { document.getElementById('exchange-modal')?.classList.remove('active'); }

function setExchangeReturned(index, value) {
  const sale = getExchangeSale();
  const maximum = Number(sale?.items?.[index]?.qty || 0);
  const quantity = Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)));
  if (quantity) exchangeReturned.set(index, quantity); else exchangeReturned.delete(index);
  updateExchangeSummary();
}

function setExchangeReplacement(productId, value) {
  const product = allProducts.find(item => item.id === productId);
  const maximum = Number(product?.stockQty || 0);
  const quantity = Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)));
  if (quantity) exchangeReplacements.set(productId, quantity); else exchangeReplacements.delete(productId);
  updateExchangeSummary();
}

function renderExchangeProducts(filter = '') {
  const target = document.getElementById('exchange-product-list');
  if (!target) return;
  const query = String(filter || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const products = allProducts.filter(product => Number(product.stockQty) > 0 && (!query || `${product.name} ${product.barcode || ''} ${product.size || ''} ${product.color || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(query))).slice(0, 60);
  target.innerHTML = products.length ? products.map(product => `<label class="exchange-item exchange-product"><span><b>${escapeHtml(product.name)}</b><small>Tam. ${escapeHtml(product.size || '—')} · ${escapeHtml(product.color || '—')} · ${product.stockQty} disponível(is)</small></span><strong>${exchangeMoney(product.sellPrice)}</strong><input class="form-control" type="number" min="0" max="${Number(product.stockQty)}" step="1" value="${exchangeReplacements.get(product.id) || 0}" aria-label="Quantidade substituta de ${escapeHtml(product.name)}" oninput="setExchangeReplacement('${product.id}', this.value)"></label>`).join('') : '<div class="empty-cell">Nenhuma peça disponível.</div>';
}

function getExchangeValues() {
  const sale = getExchangeSale();
  const returnedItems = [...exchangeReturned].map(([index, qty]) => ({ ...(sale?.items?.[index] || {}), index, qty })).filter(item => item.id && item.qty > 0);
  const replacementItems = [...exchangeReplacements].map(([productId, qty]) => ({ productId, qty, product: allProducts.find(item => item.id === productId) })).filter(item => item.product && item.qty > 0);
  const nominalReturnedTotal = returnedItems.reduce((sum, item) => sum + Number(item.price || 0) * item.qty, 0);
  const replacementTotal = replacementItems.reduce((sum, item) => sum + Number(item.product.sellPrice || 0) * item.qty, 0);
  const returnedTotal = Math.min(nominalReturnedTotal, replacementTotal + Number(sale?.total || 0));
  return { returnedItems, replacementItems, returnedTotal, replacementTotal, difference: Number((replacementTotal - returnedTotal).toFixed(2)) };
}

function updateExchangeSummary() {
  const summary = document.getElementById('exchange-summary');
  const paymentField = document.getElementById('exchange-payment-field');
  const paymentLabel = document.getElementById('exchange-payment-label');
  const paymentHelp = document.getElementById('exchange-payment-help');
  const paymentSelect = document.getElementById('exchange-payment-method');
  if (!summary) return;
  const values = getExchangeValues();
  summary.innerHTML = `<div><span>Crédito das peças devolvidas</span><strong>${exchangeMoney(values.returnedTotal)}</strong></div><div><span>Novas peças</span><strong>${exchangeMoney(values.replacementTotal)}</strong></div><div class="exchange-difference ${values.difference > 0 ? 'pay' : values.difference < 0 ? 'refund' : ''}"><span>${values.difference > 0 ? 'Cliente paga a diferença' : values.difference < 0 ? 'Valor a devolver/reduzir' : 'Diferença'}</span><strong>${exchangeMoney(Math.abs(values.difference))}</strong></div>`;
  if (paymentField) paymentField.style.display = values.returnedItems.length && values.difference !== 0 ? 'flex' : 'none';
  if (paymentLabel) paymentLabel.textContent = values.difference > 0 ? 'Forma de pagamento da diferença' : 'Forma do reembolso (se houver valor já pago)';
  if (paymentHelp) paymentHelp.textContent = values.difference < 0 ? 'Se houver fiado pendente desta venda, o sistema reduzirá primeiro a dívida da cliente.' : 'Somente a diferença será lançada no financeiro.';
  if (paymentSelect) {
    const mode = values.difference < 0 ? 'refund' : 'charge';
    if (paymentSelect.dataset.mode !== mode) {
      paymentSelect.dataset.mode = mode;
      paymentSelect.innerHTML = mode === 'refund'
        ? '<option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option>'
        : '<option value="PIX">PIX</option><option value="DINHEIRO">Dinheiro</option><option value="CARTAO_DEBITO">Cartão de débito</option><option value="CARTAO_CREDITO">Cartão de crédito</option><option value="CREDITO_LOJA">Crédito da loja (fiado)</option>';
    }
  }
}

async function confirmExchange() {
  const sale = getExchangeSale();
  const values = getExchangeValues();
  if (!sale || !values.returnedItems.length) return showToast('Informe pelo menos uma peça devolvida.', 'warning');
  if (!canExchangeSale(sale)) return showToast('O prazo de 7 dias para esta troca terminou.', 'warning');
  const paymentMethod = document.getElementById('exchange-payment-method')?.value || 'PIX';
  const button = document.getElementById('confirm-exchange-button');
  if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Registrando...'; }
  try {
    const saleRef = db.collection('sales').doc(sale.id || sale.saleId);
    const financialSnapshot = await db.collection('financialEntries').where('saleId', '==', sale.id || sale.saleId).get();
    const financialDocs = financialSnapshot.docs;
    const exchangeId = db.collection('financialEntries').doc().id;
    await db.runTransaction(async transaction => {
      const liveSaleDoc = await transaction.get(saleRef);
      if (!liveSaleDoc.exists) throw new Error('Venda não encontrada.');
      const liveSale = liveSaleDoc.data();
      if (liveSale.status === 'CANCELADA') throw new Error('Esta venda foi cancelada.');
      const liveDeadline = getExchangeDeadline(liveSale);
      if (!liveDeadline || Date.now() > liveDeadline.getTime()) throw new Error('O prazo de 7 dias terminou.');

      const stockDeltas = new Map();
      values.returnedItems.forEach(item => {
        const liveItem = liveSale.items?.[item.index];
        if (!liveItem || liveItem.id !== item.id || Number(liveItem.qty) < item.qty) throw new Error(`A quantidade de "${item.name}" foi alterada. Abra a troca novamente.`);
        stockDeltas.set(item.id, (stockDeltas.get(item.id) || 0) + item.qty);
      });
      values.replacementItems.forEach(item => stockDeltas.set(item.productId, (stockDeltas.get(item.productId) || 0) - item.qty));
      const productRefs = [...stockDeltas.keys()].map(id => db.collection('products').doc(id));
      const [productDocs, financeLiveDocs] = await Promise.all([
        Promise.all(productRefs.map(ref => transaction.get(ref))),
        Promise.all(financialDocs.map(doc => transaction.get(doc.ref)))
      ]);
      productDocs.forEach((doc, index) => {
        const delta = stockDeltas.get(productRefs[index].id);
        if (!doc.exists) throw new Error('Uma das peças não existe mais no estoque.');
        if (delta < 0 && Number(doc.data().stockQty || 0) < Math.abs(delta)) throw new Error(`Estoque insuficiente para "${doc.data().name}".`);
      });

      const updatedItems = (liveSale.items || []).map(item => ({ ...item }));
      values.returnedItems.forEach(item => { updatedItems[item.index].qty -= item.qty; updatedItems[item.index].total = Number((updatedItems[item.index].qty * Number(updatedItems[item.index].price || 0)).toFixed(2)); });
      const keptItems = updatedItems.filter(item => Number(item.qty) > 0);
      values.replacementItems.forEach(({ product, qty }) => {
        const existing = keptItems.find(item => item.id === product.id && Number(item.price) === Number(product.sellPrice) && !item.stockAlreadyDeducted);
        if (existing) { existing.qty += qty; existing.total = Number((existing.qty * Number(existing.price)).toFixed(2)); }
        else keptItems.push({ id: product.id, name: product.name, size: product.size || '', color: product.color || '', qty, price: Number(product.sellPrice || 0), total: Number((qty * Number(product.sellPrice || 0)).toFixed(2)), stockAlreadyDeducted: false, tryOnId: '' });
      });
      productRefs.forEach(ref => transaction.update(ref, { stockQty: firebase.firestore.FieldValue.increment(stockDeltas.get(ref.id)), updatedAt: firebase.firestore.FieldValue.serverTimestamp() }));

      const now = firebase.firestore.Timestamp.now();
      const typeLabel = values.replacementItems.length ? 'Troca de peças' : 'Devolução parcial';
      const record = { id: exchangeId, typeLabel, returnedItems: values.returnedItems.map(item => ({ productId: item.id, name: item.name, size: item.size || '', color: item.color || '', qty: item.qty, unitPrice: Number(item.price || 0), total: Number((item.qty * Number(item.price || 0)).toFixed(2)) })), replacementItems: values.replacementItems.map(({ product, qty }) => ({ productId: product.id, name: product.name, size: product.size || '', color: product.color || '', qty, unitPrice: Number(product.sellPrice || 0), total: Number((qty * Number(product.sellPrice || 0)).toFixed(2)) })), returnedTotal: values.returnedTotal, replacementTotal: values.replacementTotal, difference: values.difference, paymentMethod: values.difference ? paymentMethod : '', operatorUid: currentUser.uid, operatorName: currentUser.displayName || currentUser.email, createdAt: now };
      const newTotal = Math.max(0, Number((Number(liveSale.total || 0) + values.difference).toFixed(2)));
      transaction.update(saleRef, { items: keptItems, subtotal: Math.max(0, Number((Number(liveSale.subtotal || 0) + values.difference).toFixed(2))), total: newTotal, chargedTotal: Math.max(0, Number((Number(liveSale.chargedTotal ?? liveSale.total ?? 0) + values.difference).toFixed(2))), netTotal: Math.max(0, Number((Number(liveSale.netTotal ?? liveSale.total ?? 0) + values.difference).toFixed(2))), exchanges: firebase.firestore.FieldValue.arrayUnion(record), updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

      let adjustment = values.difference;
      if (adjustment < 0) {
        let credit = Math.abs(adjustment);
        const pendingDocs = financeLiveDocs.filter(doc => doc.exists && doc.data().status === 'pending').sort((a, b) => String(a.data().dueDate || '').localeCompare(String(b.data().dueDate || '')));
        let debtReduced = 0;
        pendingDocs.forEach(doc => {
          if (credit <= 0.001) return;
          const amount = Number(doc.data().amount || 0); const applied = Math.min(amount, credit);
          if (applied >= amount - 0.001) transaction.update(doc.ref, { status: 'settled', settledAt: now, settledReason: 'exchange_return', amount: 0, originalAmount: Number(doc.data().originalAmount || amount) });
          else transaction.update(doc.ref, { amount: Number((amount - applied).toFixed(2)), originalAmount: Number(doc.data().originalAmount || amount), updatedAt: now });
          credit = Number((credit - applied).toFixed(2)); debtReduced += applied;
        });
        if (debtReduced > 0) transaction.set(db.collection('financialEntries').doc(`exchange_${exchangeId}_debt`), { type: 'tracking', amount: debtReduced, description: `Crédito de devolução abatido do fiado · venda #${String(sale.id || sale.saleId).slice(0, 8).toUpperCase()}`, saleId: sale.id || sale.saleId, exchangeId, clientId: liveSale.clientId || '', clientName: liveSale.clientName || '', source: 'exchange_debt_reduction', status: 'recorded', automatic: true, createdAt: now });
        if (credit > 0.001) transaction.set(db.collection('financialEntries').doc(`exchange_${exchangeId}_refund`), { type: 'expense', amount: credit, description: `Reembolso de devolução · venda #${String(sale.id || sale.saleId).slice(0, 8).toUpperCase()}`, saleId: sale.id || sale.saleId, exchangeId, clientId: liveSale.clientId || '', clientName: liveSale.clientName || '', paymentMethod, source: 'exchange_refund', status: 'paid', automatic: true, createdAt: now, dueDate: new Date().toISOString().slice(0, 10) });
      } else if (adjustment > 0) {
        const isCredit = paymentMethod === 'CREDITO_LOJA'; const due = new Date(); if (isCredit) due.setDate(due.getDate() + 30);
        transaction.set(db.collection('financialEntries').doc(`exchange_${exchangeId}_charge`), { type: 'income', amount: adjustment, description: `Diferença de troca · venda #${String(sale.id || sale.saleId).slice(0, 8).toUpperCase()}`, saleId: sale.id || sale.saleId, exchangeId, clientId: liveSale.clientId || '', clientName: liveSale.clientName || '', paymentMethod, source: 'exchange_charge', status: isCredit ? 'pending' : 'paid', automatic: true, createdAt: now, dueDate: due.toISOString().slice(0, 10) });
      }
    });
    closeExchangeModal();
    showToast(values.replacementItems.length ? 'Troca concluída e estoque atualizado.' : 'Devolução concluída e estoque atualizado.', 'success', 6000);
  } catch (error) {
    console.error('Erro ao registrar troca/devolução:', error);
    showToast(error.message || 'Não foi possível concluir a troca.', 'danger', 7000);
  } finally {
    if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar troca/devolução'; }
  }
}
