/* ==========================================================================
   ModaGestão - Módulo PDV (Ponto de Venda / Frente de Caixa)
   Carrinho de compras, cálculo de troco, formas de pagamento e finalização de venda
   ========================================================================== */

let cartItems = [];
let cartDiscount = 0;

// Renderizar o catálogo de produtos no PDV com busca
function renderPDVCatalog(filterText = '') {
  const grid = document.getElementById('pdv-product-grid');
  if (!grid) return;

  const filtered = allProducts.filter(p => {
    const query = filterText.toLowerCase();
    return p.stockQty > 0 && (
      p.name.toLowerCase().includes(query) ||
      (p.barcode && p.barcode.includes(query)) ||
      (p.category && p.category.toLowerCase().includes(query)) ||
      (p.color && p.color.toLowerCase().includes(query))
    );
  });

  grid.innerHTML = '';

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="text-align:center; color: var(--text-muted); padding: 2rem; grid-column: 1 / -1;">
        <i class="fa-solid fa-magnifying-glass" style="font-size:1.5rem; margin-bottom:8px; display:block;"></i>
        Nenhum produto disponível em estoque.
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.style.cursor = 'pointer';
    card.innerHTML = `
      ${p.imageUrl
        ? `<img class="product-card-img" src="${escapeHtml(p.imageUrl)}" alt="Foto de ${escapeHtml(p.name)}" style="height:100px;">`
        : `<div class="product-card-img" style="height:100px; font-size:2rem; background:rgba(15,23,42,0.6);"><i class="fa-solid fa-shirt"></i></div>`}
      <div>
        <div class="product-title">${escapeHtml(p.name)}</div>
        <div class="product-meta">
          <span class="badge badge-size">${p.size || 'M'}</span>
          <span class="badge" style="background:rgba(255,255,255,0.07);">
            <span class="badge-color-dot" style="background-color:${getColorHex(p.color)};"></span>${p.color || ''}
          </span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="product-price">R$ ${(p.sellPrice || 0).toFixed(2)}</span>
          <span class="badge ${p.stockQty <= 3 ? 'badge-warning' : 'badge-success'}" style="font-size:0.75rem;">
            ${p.stockQty} em estoque
          </span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => addToCart(p));
    grid.appendChild(card);
  });
}

// Adicionar produto ao carrinho
function addToCart(product) {
  if (product.stockQty <= 0) {
    showToast(`"${product.name}" está sem estoque!`, "warning");
    return;
  }

  const existingItem = cartItems.find(item => item.id === product.id);

  if (existingItem) {
    if (existingItem.qty >= product.stockQty) {
      showToast(`Estoque insuficiente para "${product.name}".`, "warning");
      return;
    }
    existingItem.qty += 1;
  } else {
    cartItems.push({
      id: product.id,
      name: product.name,
      size: product.size,
      color: product.color,
      price: product.sellPrice,
      stockQty: product.stockQty,
      qty: 1
    });
  }

  renderCart();
  showToast(`"${product.name}" adicionado ao carrinho.`, "success");
}

// Adicionar ao carrinho via código de barras (PDV Scanner)
async function addToCartByBarcode(barcode) {
  const product = await getProductByBarcode(barcode);
  if (!product) {
    showToast(`Produto com código "${barcode}" não encontrado.`, "danger");
    return;
  }
  addToCart(product);
}

// Atualizar quantidade de item no carrinho
function updateCartItemQty(productId, delta) {
  const item = cartItems.find(i => i.id === productId);
  if (!item) return;

  item.qty += delta;

  if (item.qty <= 0) {
    removeFromCart(productId);
  } else if (item.qty > item.stockQty) {
    item.qty = item.stockQty;
    showToast("Quantidade máxima disponível em estoque atingida.", "warning");
    renderCart();
  } else {
    renderCart();
  }
}

// Remover item do carrinho
function removeFromCart(productId) {
  cartItems = cartItems.filter(i => i.id !== productId);
  renderCart();
}

// Limpar carrinho
function clearCart() {
  if ((cartItems.length > 0 || getJewelryAmount() > 0) && confirm("Deseja limpar o carrinho e cancelar a venda atual?")) {
    cartItems = [];
    cartDiscount = 0;
    document.getElementById('cart-discount').value = 0;
    document.getElementById('cart-jewelry').value = 0;
    renderCart();
  }
}

function getJewelryAmount() { return Math.max(0, Number(document.getElementById('cart-jewelry')?.value || 0)); }

// Renderizar o Carrinho de Compras
function renderCart() {
  const cartList = document.getElementById('cart-items-list');
  const cartBadge = document.getElementById('cart-items-count');
  const cartEmptyMsg = document.getElementById('cart-empty-msg');

  const clothingSubtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const jewelryAmount = getJewelryAmount();
  const subtotal = clothingSubtotal + jewelryAmount;
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  cartDiscount = discount;
  const total = Math.max(subtotal - discount, 0);
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  // Atualizar badge de quantidade
  if (cartBadge) cartBadge.textContent = totalQty;

  if (!cartList) return;
  cartList.innerHTML = '';

  if (cartItems.length === 0 && jewelryAmount <= 0) {
    if (cartEmptyMsg) cartEmptyMsg.style.display = 'flex';
    const jewelryRow = document.getElementById('cart-jewelry-row');
    if (jewelryRow) jewelryRow.style.display = 'none';
    updateCartTotals(0, 0, 0);
    return;
  }

  if (cartEmptyMsg) cartEmptyMsg.style.display = 'none';

  cartItems.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = 'cart-item';
    itemEl.innerHTML = `
      <div class="cart-item-info">
        <h4>${escapeHtml(item.name)}</h4>
        <p>Tam: ${item.size} | ${item.color} | R$ ${item.price.toFixed(2)} un.</p>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <div class="qty-controls">
          <button class="qty-btn" onclick="updateCartItemQty('${item.id}', -1)">−</button>
          <span style="font-weight:700; min-width:24px; text-align:center;">${item.qty}</span>
          <button class="qty-btn" onclick="updateCartItemQty('${item.id}', 1)">+</button>
        </div>
        <span style="font-weight:700; min-width:64px; text-align:right; color:var(--accent-primary);">
          R$ ${(item.price * item.qty).toFixed(2)}
        </span>
        <button class="btn btn-danger btn-sm btn-icon" onclick="removeFromCart('${item.id}')">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    `;
    cartList.appendChild(itemEl);
  });

  updateCartTotals(clothingSubtotal, discount, total);
  const jewelryRow = document.getElementById('cart-jewelry-row');
  if (jewelryRow) jewelryRow.style.display = jewelryAmount > 0 ? 'flex' : 'none';
  const jewelryDisplay = document.getElementById('cart-jewelry-display');
  if (jewelryDisplay) jewelryDisplay.textContent = `R$ ${jewelryAmount.toFixed(2)}`;
}

function updateCartTotals(subtotal, discount, total) {
  const el = (id) => document.getElementById(id);
  if (el('cart-subtotal')) el('cart-subtotal').textContent = `R$ ${subtotal.toFixed(2)}`;
  if (el('cart-discount-display')) el('cart-discount-display').textContent = `- R$ ${discount.toFixed(2)}`;
  if (el('cart-total')) el('cart-total').textContent = `R$ ${total.toFixed(2)}`;
  
  // Atualizar cálculo de troco quando pago em dinheiro
  recalcChange();
}

function recalcChange() {
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + getJewelryAmount();
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);
  const cashReceived = parseFloat(document.getElementById('cash-received')?.value || 0) || 0;
  const change = Math.max(cashReceived - total, 0);
  const changeEl = document.getElementById('change-amount');
  if (changeEl) changeEl.textContent = `R$ ${change.toFixed(2)}`;
}

// Abrir Modal de Finalização de Venda
function openCheckoutModal() {
  if (cartItems.length === 0 && getJewelryAmount() <= 0) {
    showToast("Adicione roupas ou o valor das bijuterias antes de finalizar.", "warning");
    return;
  }

  const jewelryAmount = getJewelryAmount();
  const clothingSubtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const subtotal = clothingSubtotal + jewelryAmount;
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);

  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  el('checkout-subtotal', `R$ ${clothingSubtotal.toFixed(2)}`);
  el('checkout-discount', `- R$ ${discount.toFixed(2)}`);
  el('checkout-total', `R$ ${total.toFixed(2)}`);
  el('checkout-jewelry', `R$ ${jewelryAmount.toFixed(2)}`);
  const checkoutJewelryRow = document.getElementById('checkout-jewelry-row');
  if (checkoutJewelryRow) checkoutJewelryRow.style.display = jewelryAmount > 0 ? 'flex' : 'none';

  // Resetar campos de pagamento
  document.getElementById('cash-received').value = '';
  document.getElementById('change-amount').textContent = 'R$ 0,00';
  document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.combined-payment-input').forEach(input => { input.value = '0'; });
  const due = document.getElementById('store-credit-due');
  if (due) {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    due.value = date.toISOString().slice(0, 10);
  }
  if (window.refreshStoreCreditClients) refreshStoreCreditClients();
  const saleClient = document.getElementById('sale-client');
  if (saleClient) saleClient.value = '';
  const quickClientForm = document.getElementById('quick-client-form');
  if (quickClientForm) { quickClientForm.reset(); quickClientForm.style.display = 'none'; }
  updateStoreCreditInstallments(total);
  updateCardCreditInstallments(total);
  const creditSection = document.getElementById('store-credit-section');
  if (creditSection) creditSection.style.display = 'none';
  const cardSection = document.getElementById('card-credit-section');
  if (cardSection) cardSection.style.display = 'none';
  const combinedSection = document.getElementById('combined-payment-section');
  if (combinedSection) combinedSection.style.display = 'none';
  const feePayer = document.getElementById('card-fee-payer');
  if (feePayer) feePayer.value = 'STORE';
  resetCheckoutCardTotals(total);

  document.getElementById('checkout-modal').classList.add('active');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.remove('active');
}

// Selecionar método de pagamento
function selectPaymentMethod(method) {
  document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`[data-payment="${method}"]`);
  if (btn) btn.classList.add('active');

  const cashSection = document.getElementById('cash-section');
  if (cashSection) {
    cashSection.style.display = method === 'DINHEIRO' ? 'block' : 'none';
  }
  const creditSection = document.getElementById('store-credit-section');
  if (creditSection) creditSection.style.display = (method === 'CREDITO_LOJA' || method === 'COMBINADO') ? 'block' : 'none';
  const cardSection = document.getElementById('card-credit-section');
  if (cardSection) cardSection.style.display = (method === 'CARTAO_CREDITO' || method === 'COMBINADO') ? 'block' : 'none';
  const combinedSection = document.getElementById('combined-payment-section');
  if (combinedSection) combinedSection.style.display = method === 'COMBINADO' ? 'block' : 'none';
  if (method === 'CARTAO_CREDITO') updateCardFeePreview();
  else if (method === 'COMBINADO') updateCombinedPaymentSummary();
  else resetCheckoutCardTotals(getCurrentCartTotal());
}

function isCombinedPaymentSelected() {
  return document.querySelector('.payment-method-btn.active')?.dataset.payment === 'COMBINADO';
}
function getCombinedAmount(id) { return Math.max(0, Number(document.getElementById(id)?.value || 0)); }
function getCombinedPayments() {
  return [
    { method: 'PIX', amount: getCombinedAmount('combined-pix') },
    { method: 'DINHEIRO', amount: getCombinedAmount('combined-cash') },
    { method: 'CARTAO_CREDITO', amount: getCombinedAmount('combined-card-credit') },
    { method: 'CARTAO_DEBITO', amount: getCombinedAmount('combined-card-debit') },
    { method: 'CREDITO_LOJA', amount: getCombinedAmount('combined-store-credit') }
  ].filter(payment => payment.amount > 0);
}
function updateCombinedPaymentSummary() {
  const total = getCurrentCartTotal();
  const payments = getCombinedPayments();
  const distributed = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Number((total - distributed).toFixed(2));
  const summary = document.getElementById('combined-payment-summary');
  if (summary) {
    summary.classList.toggle('invalid', Math.abs(remaining) > 0.009);
    summary.innerHTML = `<span>Distribuído: <b>R$ ${distributed.toFixed(2).replace('.', ',')}</b></span><span>${remaining >= 0 ? 'Falta' : 'Excedeu'}: <b>R$ ${Math.abs(remaining).toFixed(2).replace('.', ',')}</b></span>`;
  }
  const storeCreditAmount = getCombinedAmount('combined-store-credit');
  const cardAmount = getCombinedAmount('combined-card-credit');
  updateStoreCreditInstallments(storeCreditAmount);
  updateCardCreditInstallments(cardAmount);
}

function getCurrentCartTotal() {
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + getJewelryAmount();
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  return Math.max(subtotal - discount, 0);
}

function updateCardCreditInstallments(total = getCurrentCartTotal()) {
  const select = document.getElementById('card-credit-installments');
  if (!select) return;
  const previous = Number(select.value) || 1;
  select.innerHTML = Array.from({ length: 12 }, (_, index) => {
    const installments = index + 1;
    return `<option value="${installments}">${installments}x de R$ ${(total / installments).toFixed(2).replace('.', ',')}</option>`;
  }).join('');
  select.value = previous;
  updateCardFeePreview(total);
}

function updateCardFeePreview(total = getCurrentCartTotal()) {
  if (isCombinedPaymentSelected()) total = getCombinedAmount('combined-card-credit');
  const installments = Number(document.getElementById('card-credit-installments')?.value || 1);
  const rate = window.getCardFeeRate ? getCardFeeRate(installments) : 0;
  const feePayer = document.getElementById('card-fee-payer')?.value || 'STORE';
  const payment = calculateCardPayment(total, rate, feePayer);
  const preview = document.getElementById('card-fee-preview');
  if (preview) preview.innerHTML = `<span>Taxa Mercado Pago<b>${rate.toFixed(2).replace('.', ',')}%</b></span><span>${feePayer === 'CUSTOMER' ? 'Acréscimo ao cliente' : 'Custo para a loja'}<b>R$ ${payment.feeAmount.toFixed(2).replace('.', ',')}</b></span><span>Loja recebe<b>R$ ${payment.netAmount.toFixed(2).replace('.', ',')}</b></span>`;
  const feeRow = document.getElementById('checkout-card-fee-row');
  const feeValue = document.getElementById('checkout-card-fee');
  if (feeRow) feeRow.style.display = feePayer === 'CUSTOMER' && payment.feeAmount > 0 ? 'flex' : 'none';
  if (feeValue) feeValue.textContent = `+ R$ ${payment.feeAmount.toFixed(2).replace('.', ',')}`;
  const totalElement = document.getElementById('checkout-total');
  const checkoutTotal = isCombinedPaymentSelected() ? getCurrentCartTotal() + (feePayer === 'CUSTOMER' ? payment.feeAmount : 0) : payment.chargedTotal;
  if (totalElement) totalElement.textContent = `R$ ${checkoutTotal.toFixed(2).replace('.', ',')}`;
}

function calculateCardPayment(total, rate, feePayer) {
  if (feePayer === 'CUSTOMER' && rate > 0 && rate < 100) {
    const chargedTotal = Number((total / (1 - rate / 100)).toFixed(2));
    return { chargedTotal, feeAmount: Number((chargedTotal - total).toFixed(2)), netAmount: total };
  }
  const feeAmount = Number((total * rate / 100).toFixed(2));
  return { chargedTotal: total, feeAmount, netAmount: Number((total - feeAmount).toFixed(2)) };
}

function resetCheckoutCardTotals(total) {
  const feeRow = document.getElementById('checkout-card-fee-row');
  if (feeRow) feeRow.style.display = 'none';
  const totalElement = document.getElementById('checkout-total');
  if (totalElement) totalElement.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
}

function getStoreCreditMaxInstallments(total) {
  if (total >= 500) return 6;
  if (total >= 400) return 5;
  if (total >= 300) return 4;
  if (total >= 200) return 3;
  if (total >= 100) return 2;
  return 1;
}

function updateStoreCreditInstallments(total) {
  const select = document.getElementById('store-credit-installments');
  const rule = document.getElementById('store-credit-rule');
  if (!select) return;
  const max = getStoreCreditMaxInstallments(total);
  const previous = Math.min(Number(select.value) || 1, max);
  select.innerHTML = Array.from({ length: max }, (_, index) => {
    const installments = index + 1;
    const value = total / installments;
    return `<option value="${installments}">${installments}x de R$ ${value.toFixed(2).replace('.', ',')}</option>`;
  }).join('');
  select.value = previous;
  if (rule) rule.textContent = max === 1
    ? 'Compras abaixo de R$ 100,00 não podem ser parceladas.'
    : `Esta compra permite parcelamento em até ${max}x.`;
}

// Finalizar Venda
async function finalizeSale() {
  const selectedPaymentBtn = document.querySelector('.payment-method-btn.active');
  if (!selectedPaymentBtn) {
    showToast("Selecione a forma de pagamento.", "warning");
    return;
  }

  const jewelryAmount = getJewelryAmount();
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0) + jewelryAmount;
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);
  const paymentMethod = selectedPaymentBtn.dataset.payment;
  const isCombined = paymentMethod === 'COMBINADO';
  const combinedPayments = isCombined ? getCombinedPayments() : [];
  const cashReceived = parseFloat(document.getElementById('cash-received')?.value || total) || total;
  const clientId = document.getElementById('sale-client')?.value || '';
  const creditDueDate = document.getElementById('store-credit-due')?.value || '';
  const creditInstallments = Number(document.getElementById('store-credit-installments')?.value || 1);
  const cardInstallments = Number(document.getElementById('card-credit-installments')?.value || 1);
  const cardPartAmount = isCombined ? (combinedPayments.find(payment => payment.method === 'CARTAO_CREDITO')?.amount || 0) : total;
  const cardFeeRate = (paymentMethod === 'CARTAO_CREDITO' || (isCombined && cardPartAmount > 0)) && window.getCardFeeRate ? getCardFeeRate(cardInstallments) : 0;
  const cardFeePayer = paymentMethod === 'CARTAO_CREDITO' || (isCombined && cardPartAmount > 0) ? (document.getElementById('card-fee-payer')?.value || 'STORE') : '';
  const cardPayment = paymentMethod === 'CARTAO_CREDITO' || (isCombined && cardPartAmount > 0)
    ? calculateCardPayment(cardPartAmount, cardFeeRate, cardFeePayer)
    : { chargedTotal: total, feeAmount: 0, netAmount: total };

  if (paymentMethod === 'DINHEIRO' && cashReceived < total) {
    showToast("O valor recebido é menor que o total da venda.", "danger");
    return;
  }

  if (!clientId) {
    showToast('Selecione ou cadastre o cliente antes de concluir a venda.', 'warning');
    return;
  }
  const storeCreditPartAmount = isCombined ? (combinedPayments.find(payment => payment.method === 'CREDITO_LOJA')?.amount || 0) : total;
  if (isCombined) {
    const distributed = combinedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    if (combinedPayments.length < 2) { showToast('Informe pelo menos duas formas de pagamento.', 'warning'); return; }
    if (Math.abs(distributed - total) > 0.009) { showToast('A soma das formas de pagamento deve ser igual ao total da compra.', 'warning'); return; }
  }
  if ((paymentMethod === 'CREDITO_LOJA' || (isCombined && storeCreditPartAmount > 0)) && !creditDueDate) {
    showToast('Informe o vencimento do fiado.', 'warning');
    return;
  }
  if ((paymentMethod === 'CREDITO_LOJA' || (isCombined && storeCreditPartAmount > 0)) && (creditInstallments < 1 || creditInstallments > getStoreCreditMaxInstallments(storeCreditPartAmount))) {
    showToast('O parcelamento escolhido não é permitido para o valor desta compra.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-finalize-sale');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processando...';
  }

  try {
    const saleData = {
      items: cartItems.map(i => ({
        id: i.id,
        name: i.name,
        size: i.size,
        color: i.color,
        qty: i.qty,
        price: i.price,
        total: i.price * i.qty
      })),
      subtotal,
      jewelryAmount,
      discount,
      total,
      paymentMethod,
      payments: isCombined ? combinedPayments.map(payment => ({
        ...payment,
        installments: payment.method === 'CREDITO_LOJA' ? creditInstallments : payment.method === 'CARTAO_CREDITO' ? cardInstallments : 1,
        dueDate: payment.method === 'CREDITO_LOJA' ? creditDueDate : '',
        feeRate: payment.method === 'CARTAO_CREDITO' ? cardFeeRate : 0,
        feePayer: payment.method === 'CARTAO_CREDITO' ? cardFeePayer : '',
        feeAmount: payment.method === 'CARTAO_CREDITO' ? cardPayment.feeAmount : 0,
        chargedAmount: payment.method === 'CARTAO_CREDITO' ? cardPayment.chargedTotal : payment.amount,
        netAmount: payment.method === 'CARTAO_CREDITO' ? cardPayment.netAmount : payment.amount
      })) : [],
      clientId,
      clientName: getManagementClients().find(c => c.id === clientId)?.name || '',
      dueDate: (paymentMethod === 'CREDITO_LOJA' || isCombined) ? creditDueDate : '',
      installments: (paymentMethod === 'CREDITO_LOJA' || isCombined) ? creditInstallments : 1,
      cardInstallments: (paymentMethod === 'CARTAO_CREDITO' || isCombined) ? cardInstallments : 1,
      cardFeeRate,
      cardFeePayer,
      cardFeeAmount: cardPayment.feeAmount,
      chargedTotal: isCombined ? total + (cardFeePayer === 'CUSTOMER' ? cardPayment.feeAmount : 0) : cardPayment.chargedTotal,
      netTotal: isCombined ? total - (cardFeePayer === 'STORE' ? cardPayment.feeAmount : 0) : cardPayment.netAmount,
      cashReceived,
      changeGiven: Math.max(cashReceived - total, 0)
    };

    const completedSale = await processSaleTransaction(saleData);
    closeCheckoutModal();
    
    // Abrir Recibo
    openReceiptModal(completedSale);
    
    // Limpar carrinho
    cartItems = [];
    cartDiscount = 0;
    document.getElementById('cart-jewelry').value = 0;
    renderCart();

    showToast("Venda finalizada com sucesso! 🎉", "success");
  } catch (err) {
    console.error("Erro ao finalizar venda:", err);
    showToast("Erro ao processar venda. Tente novamente.", "danger");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Venda';
    }
  }
}

// Abrir Modal de Recibo
function openReceiptModal(sale) {
  const modal = document.getElementById('receipt-modal');
  const receiptContent = document.getElementById('printable-receipt');

  const paymentLabels = {
    'DINHEIRO': '💵 Dinheiro',
    'PIX': '📲 PIX',
    'CARTAO_CREDITO': '💳 Cartão de Crédito',
    'CARTAO_DEBITO': '💳 Cartão de Débito',
    'CREDITO_LOJA': '🪪 Crédito da loja (fiado)',
    'COMBINADO': '🔀 Pagamento combinado'
  };
  const combinedPaymentsHtml = sale.paymentMethod === 'COMBINADO' && Array.isArray(sale.payments)
    ? sale.payments.map(payment => `<div style="display:flex; justify-content:space-between;"><span>${paymentLabels[payment.method] || payment.method}${payment.installments > 1 ? ` (${payment.installments}x)` : ''}:</span><span>R$ ${Number(payment.chargedAmount ?? payment.amount).toFixed(2)}</span></div>`).join('')
    : '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const itemsHtml = sale.items.map(item => `
    <div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed #ddd;">
      <div>
        <span style="font-weight:600;">${item.name}</span><br>
        <small>Tam: ${item.size} | ${item.color} | ${item.qty}x R$ ${item.price.toFixed(2)}</small>
      </div>
      <span style="font-weight:700;">R$ ${item.total.toFixed(2)}</span>
    </div>
  `).join('');

  receiptContent.innerHTML = `
    <div style="text-align:center; margin-bottom:12px;">
      <h2 style="font-size:1.2rem; margin:0;">🛍️ MARIMODAS</h2>
      <p style="color:#666; font-size:0.85rem; margin:4px 0;">Comprovante de Venda</p>
      <hr style="border:none; border-top:1px dashed #ccc; margin:8px 0;">
      <p style="font-size:0.8rem; color:#444;">${dateStr} às ${timeStr}</p>
      <p style="font-size:0.78rem; color:#666;">Pedido: #${sale.saleId ? sale.saleId.substring(0, 8).toUpperCase() : 'XXXXXXXX'}</p>
      <p style="font-size:0.78rem; color:#666;">Cliente: ${escapeHtml(sale.clientName || '—')}</p>
    </div>
    <div>${itemsHtml}</div>
    <div style="margin-top:12px; padding-top:8px; border-top:1px dashed #ccc;">
      <div style="display:flex; justify-content:space-between;"><span>Roupas:</span><span>R$ ${Math.max(0, sale.subtotal - Number(sale.jewelryAmount || 0)).toFixed(2)}</span></div>
      ${Number(sale.jewelryAmount) > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Bijuterias:</span><span>R$ ${Number(sale.jewelryAmount).toFixed(2)}</span></div>` : ''}
      ${sale.discount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Desconto:</span><span>- R$ ${sale.discount.toFixed(2)}</span></div>` : ''}
      ${(sale.paymentMethod === 'CARTAO_CREDITO' || sale.paymentMethod === 'COMBINADO') && sale.cardFeePayer === 'CUSTOMER' && sale.cardFeeAmount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Acréscimo da taxa:</span><span>R$ ${sale.cardFeeAmount.toFixed(2)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-weight:700; font-size:1.1rem; margin-top:4px;">
        <span>TOTAL:</span><span>R$ ${(sale.chargedTotal ?? sale.total).toFixed(2)}</span>
      </div>
      <div style="margin-top:8px; font-size:0.85rem; color:#555;">
        <div><b>Cliente:</b> ${escapeHtml(sale.clientName || '—')}</div>
        <div><b>Pagamento:</b> ${paymentLabels[sale.paymentMethod] || sale.paymentMethod}</div>
        ${combinedPaymentsHtml}
        ${sale.paymentMethod === 'CARTAO_CREDITO' ? `<div><b>Parcelamento:</b> ${sale.cardInstallments || 1}x</div>` : ''}
        ${sale.paymentMethod === 'CREDITO_LOJA' ? `<div><b>Parcelamento:</b> ${sale.installments || 1}x</div><div><b>Primeiro vencimento:</b> ${new Date(sale.dueDate + 'T12:00:00').toLocaleDateString('pt-BR')}</div>` : ''}
        ${sale.paymentMethod === 'DINHEIRO' ? `<div><b>Recebido:</b> R$ ${sale.cashReceived.toFixed(2)}</div><div><b>Troco:</b> R$ ${sale.changeGiven.toFixed(2)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:center; margin-top:12px; padding-top:8px; border-top:1px dashed #ccc; font-size:0.78rem; color:#888;">
      Obrigado pela preferência! 💝<br>Volte sempre!
    </div>
  `;

  modal.classList.add('active');
}

function closeReceiptModal() {
  document.getElementById('receipt-modal').classList.remove('active');
}

function printReceipt() {
  const receipt = document.getElementById('printable-receipt');
  if (!receipt) return showToast('Não foi possível preparar o comprovante.', 'danger');

  const printFrame = document.createElement('iframe');
  printFrame.setAttribute('title', 'Impressão do comprovante');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '1px';
  printFrame.style.height = '1px';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  document.body.appendChild(printFrame);

  const printDocument = printFrame.contentDocument || printFrame.contentWindow.document;
  printDocument.open();
  printDocument.write(`<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>MARIMODAS - Comprovante de Venda</title><style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, sans-serif; }
    .receipt-print { width: 80mm; max-width: 100%; margin: 0 auto; padding: 10px; font-family: monospace; font-size: 11px; line-height: 1.35; background: #fff; color: #000; break-inside: avoid; page-break-inside: avoid; }
    @media print { .receipt-print { margin: 0 auto; } }
  </style></head><body><main class="receipt-print">${receipt.innerHTML}</main></body></html>`);
  printDocument.close();

  const cleanup = () => { if (printFrame.isConnected) printFrame.remove(); };
  printFrame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => {
    try {
      printFrame.contentWindow.focus();
      printFrame.contentWindow.print();
    } catch (error) {
      console.error('Erro ao imprimir comprovante:', error);
      cleanup();
      showToast('Não foi possível abrir a impressão do comprovante.', 'danger');
    }
  }, 250);
  setTimeout(cleanup, 60000);
}

// Iniciar Scanner para o PDV
function startPDVScanner() {
  document.getElementById('pdv-scanner-modal').classList.add('active');
  startCameraScanner(async (code) => {
    document.getElementById('pdv-scanner-modal').classList.remove('active');
    await addToCartByBarcode(code);
  }, 'pdv-reader');
}

function closePDVScannerModal() {
  stopCameraScanner();
  document.getElementById('pdv-scanner-modal').classList.remove('active');
}
