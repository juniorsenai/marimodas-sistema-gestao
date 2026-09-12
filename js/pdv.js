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
  if (cartItems.length > 0 && confirm("Deseja limpar o carrinho e cancelar a venda atual?")) {
    cartItems = [];
    cartDiscount = 0;
    document.getElementById('cart-discount').value = 0;
    renderCart();
  }
}

// Renderizar o Carrinho de Compras
function renderCart() {
  const cartList = document.getElementById('cart-items-list');
  const cartBadge = document.getElementById('cart-items-count');
  const cartEmptyMsg = document.getElementById('cart-empty-msg');

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  cartDiscount = discount;
  const total = Math.max(subtotal - discount, 0);
  const totalQty = cartItems.reduce((s, i) => s + i.qty, 0);

  // Atualizar badge de quantidade
  if (cartBadge) cartBadge.textContent = totalQty;

  if (!cartList) return;
  cartList.innerHTML = '';

  if (cartItems.length === 0) {
    if (cartEmptyMsg) cartEmptyMsg.style.display = 'flex';
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

  updateCartTotals(subtotal, discount, total);
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
  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);
  const cashReceived = parseFloat(document.getElementById('cash-received')?.value || 0) || 0;
  const change = Math.max(cashReceived - total, 0);
  const changeEl = document.getElementById('change-amount');
  if (changeEl) changeEl.textContent = `R$ ${change.toFixed(2)}`;
}

// Abrir Modal de Finalização de Venda
function openCheckoutModal() {
  if (cartItems.length === 0) {
    showToast("Adicione itens ao carrinho antes de finalizar.", "warning");
    return;
  }

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);

  const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
  el('checkout-subtotal', `R$ ${subtotal.toFixed(2)}`);
  el('checkout-discount', `- R$ ${discount.toFixed(2)}`);
  el('checkout-total', `R$ ${total.toFixed(2)}`);

  // Resetar campos de pagamento
  document.getElementById('cash-received').value = '';
  document.getElementById('change-amount').textContent = 'R$ 0,00';
  document.querySelectorAll('.payment-method-btn').forEach(btn => btn.classList.remove('active'));
  const due = document.getElementById('store-credit-due');
  if (due) {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    due.value = date.toISOString().slice(0, 10);
  }
  if (window.refreshStoreCreditClients) refreshStoreCreditClients();
  updateStoreCreditInstallments(total);
  const creditSection = document.getElementById('store-credit-section');
  if (creditSection) creditSection.style.display = 'none';

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
  if (creditSection) creditSection.style.display = method === 'CREDITO_LOJA' ? 'block' : 'none';
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

  const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const discount = parseFloat(document.getElementById('cart-discount')?.value || 0) || 0;
  const total = Math.max(subtotal - discount, 0);
  const paymentMethod = selectedPaymentBtn.dataset.payment;
  const cashReceived = parseFloat(document.getElementById('cash-received')?.value || total) || total;
  const creditClientId = document.getElementById('store-credit-client')?.value || '';
  const creditDueDate = document.getElementById('store-credit-due')?.value || '';
  const creditInstallments = Number(document.getElementById('store-credit-installments')?.value || 1);

  if (paymentMethod === 'DINHEIRO' && cashReceived < total) {
    showToast("O valor recebido é menor que o total da venda.", "danger");
    return;
  }

  if (paymentMethod === 'CREDITO_LOJA' && (!creditClientId || !creditDueDate)) {
    showToast('Selecione o cliente e informe o vencimento do fiado.', 'warning');
    return;
  }
  if (paymentMethod === 'CREDITO_LOJA' && (creditInstallments < 1 || creditInstallments > getStoreCreditMaxInstallments(total))) {
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
      discount,
      total,
      paymentMethod,
      clientId: paymentMethod === 'CREDITO_LOJA' ? creditClientId : '',
      clientName: paymentMethod === 'CREDITO_LOJA' ? (getManagementClients().find(c => c.id === creditClientId)?.name || '') : '',
      dueDate: paymentMethod === 'CREDITO_LOJA' ? creditDueDate : '',
      installments: paymentMethod === 'CREDITO_LOJA' ? creditInstallments : 1,
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
    'CREDITO_LOJA': '🪪 Crédito da loja (fiado)'
  };

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
    </div>
    <div>${itemsHtml}</div>
    <div style="margin-top:12px; padding-top:8px; border-top:1px dashed #ccc;">
      <div style="display:flex; justify-content:space-between;"><span>Subtotal:</span><span>R$ ${sale.subtotal.toFixed(2)}</span></div>
      ${sale.discount > 0 ? `<div style="display:flex; justify-content:space-between;"><span>Desconto:</span><span>- R$ ${sale.discount.toFixed(2)}</span></div>` : ''}
      <div style="display:flex; justify-content:space-between; font-weight:700; font-size:1.1rem; margin-top:4px;">
        <span>TOTAL:</span><span>R$ ${sale.total.toFixed(2)}</span>
      </div>
      <div style="margin-top:8px; font-size:0.85rem; color:#555;">
        <div><b>Pagamento:</b> ${paymentLabels[sale.paymentMethod] || sale.paymentMethod}</div>
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
  const originalTitle = document.title;
  document.title = 'MARIMODAS | Comprovante de Venda';
  window.addEventListener('afterprint', () => {
    document.title = originalTitle;
  }, { once: true });
  window.print();
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
