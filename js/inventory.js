/* ==========================================================================
   ModaGestão - Módulo de Gestão de Estoque & Produtos
   Listagem, cadastro de peças, variantes de tamanhos/cores e impressão de etiquetas
   ========================================================================== */

let allProducts = [];
let currentEditingProductId = null;
let currentProductImage = '';
let nfeImportDraft = [];
let nfeImportInfo = {};

function openNfeXmlFilePicker() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.xml,text/xml,application/xml';
  input.addEventListener('change', event => handleNfeXmlFile(event.target.files?.[0]));
  input.click();
}

async function handleNfeXmlFile(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) return showToast('O arquivo XML deve ter no máximo 10 MB.', 'warning');
  try {
    const xmlText = await file.text();
    const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (xml.querySelector('parsererror')) throw new Error('XML inválido');
    const elements = Array.from(xml.getElementsByTagName('*'));
    const byLocalName = name => elements.find(element => element.localName === name);
    const textFrom = (root, name) => Array.from(root.getElementsByTagName('*')).find(element => element.localName === name)?.textContent?.trim() || '';
    const detNodes = elements.filter(element => element.localName === 'det');
    if (!detNodes.length) throw new Error('Nenhum produto encontrado na NF-e');
    const ide = byLocalName('ide');
    const emit = byLocalName('emit');
    nfeImportInfo = { number: ide ? textFrom(ide, 'nNF') : '', supplier: emit ? textFrom(emit, 'xNome') : '', fileName: file.name };
    nfeImportDraft = detNodes.map((det, index) => {
      const prod = Array.from(det.children).find(element => element.localName === 'prod') || det;
      const rawBarcode = textFrom(prod, 'cEANTrib') || textFrom(prod, 'cEAN');
      const hasValidBarcode = /^\d{8,14}$/.test(rawBarcode);
      const barcode = hasValidBarcode ? rawBarcode : generateRandomBarcode();
      const cost = Number(textFrom(prod, 'vUnCom') || 0);
      return {
        key: `${Date.now()}_${index}`, name: textFrom(prod, 'xProd') || `Produto ${index + 1}`,
        barcode, barcodeGenerated: !hasValidBarcode, stockQty: Math.max(1, Math.round(Number(textFrom(prod, 'qCom') || 1))),
        costPrice: Number(cost.toFixed(2)), sellPrice: Number(cost.toFixed(2)),
        category: 'Feminino', size: 'Único', color: 'Padrão',
        supplierCode: textFrom(prod, 'cProd'), ncm: textFrom(prod, 'NCM')
      };
    });
    if (nfeImportDraft.length > 450) throw new Error('A nota possui mais de 450 itens. Divida a importação em partes.');
    renderNfeImportModal();
  } catch (error) {
    console.error('Erro ao importar XML da NF-e:', error);
    showToast(error.message || 'Não foi possível ler o XML da NF-e.', 'danger');
  }
}

function renderNfeImportModal() {
  let modal = document.getElementById('nfe-import-modal');
  if (!modal) { modal = document.createElement('div'); modal.id = 'nfe-import-modal'; modal.className = 'modal-overlay'; document.body.appendChild(modal); }
  modal.innerHTML = `<div class="modal-card nfe-import-card"><div class="modal-header"><div><h3><i class="fa-solid fa-file-invoice"></i> Revisar produtos da NF-e</h3><small>${escapeHtml(nfeImportInfo.supplier || 'Fornecedor não identificado')} ${nfeImportInfo.number ? `· Nota ${escapeHtml(nfeImportInfo.number)}` : ''}</small></div><button class="modal-close" onclick="closeNfeImportModal()"><i class="fa-solid fa-xmark"></i></button></div><div class="modal-body"><div class="nfe-import-notice"><i class="fa-solid fa-circle-info"></i><span>Nenhum item foi cadastrado ainda. Revise os dados, principalmente custo e preço de venda, antes de confirmar.</span></div><div class="nfe-draft-list">${nfeImportDraft.map((item, index) => renderNfeDraftItem(item, index)).join('')}</div>${!nfeImportDraft.length ? '<div class="empty-cell">Todos os itens foram removidos da importação.</div>' : ''}</div><div class="modal-footer"><span class="nfe-item-count">${nfeImportDraft.length} produto(s) aguardando confirmação</span><button class="btn btn-secondary" onclick="closeNfeImportModal()">Cancelar</button><button class="btn btn-primary" onclick="confirmNfeImport()" ${!nfeImportDraft.length ? 'disabled' : ''}><i class="fa-solid fa-check"></i> Confirmar cadastro</button></div></div>`;
  modal.classList.add('active');
}

function renderNfeDraftItem(item, index) {
  const existingDuplicate = allProducts.some(product => String(product.barcode) === String(item.barcode));
  const draftDuplicate = nfeImportDraft.some((other, otherIndex) => otherIndex !== index && String(other.barcode) === String(item.barcode));
  const duplicate = existingDuplicate || draftDuplicate;
  const categories = ['Feminino', 'Masculino', 'Infantil', 'Acessórios', 'Calçados'];
  const sizes = ['PP', 'P', 'M', 'G', 'GG', 'XGG', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', 'Único'];
  return `<div class="nfe-draft-item ${duplicate ? 'has-error' : ''}"><div class="nfe-draft-heading"><span>Item ${index + 1}${item.supplierCode ? ` · Cód. fornecedor: ${escapeHtml(item.supplierCode)}` : ''}${item.barcodeGenerated ? ' · <b class="internal-code-badge"><i class="fa-solid fa-wand-magic-sparkles"></i> Sem GTIN — código interno gerado</b>' : ''}</span><button class="btn btn-danger btn-sm" onclick="removeNfeDraftItem(${index})" title="Remover da importação"><i class="fa-solid fa-trash"></i></button></div><div class="nfe-draft-fields"><div class="form-group wide"><label>Nome *</label><input class="form-control" value="${escapeHtml(item.name)}" oninput="updateNfeDraft(${index}, 'name', this.value)"></div><div class="form-group"><label>${item.barcodeGenerated ? 'Código interno gerado pelo sistema *' : 'Código de barras da NF-e *'}</label><input class="form-control" value="${escapeHtml(item.barcode)}" oninput="updateNfeDraft(${index}, 'barcode', this.value)">${item.barcodeGenerated ? '<small class="nfe-generated-help">Este produto não possuía GTIN na nota.</small>' : ''}${duplicate ? '<small class="nfe-field-error">Código duplicado. Informe outro código.</small>' : ''}</div><div class="form-group"><label>Quantidade *</label><input class="form-control" type="number" min="1" step="1" value="${item.stockQty}" oninput="updateNfeDraft(${index}, 'stockQty', this.value)"></div><div class="form-group"><label>Custo unitário *</label><input class="form-control" type="number" min="0" step="0.01" value="${item.costPrice}" oninput="updateNfeDraft(${index}, 'costPrice', this.value)"></div><div class="form-group"><label>Preço de venda *</label><input class="form-control" type="number" min="0.01" step="0.01" value="${item.sellPrice}" oninput="updateNfeDraft(${index}, 'sellPrice', this.value)"></div><div class="form-group"><label>Categoria</label><select class="form-control" onchange="updateNfeDraft(${index}, 'category', this.value)">${categories.map(value => `<option ${item.category === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-group"><label>Tamanho</label><select class="form-control" onchange="updateNfeDraft(${index}, 'size', this.value)">${sizes.map(value => `<option ${item.size === value ? 'selected' : ''}>${value}</option>`).join('')}</select></div><div class="form-group"><label>Cor</label><input class="form-control" value="${escapeHtml(item.color)}" oninput="updateNfeDraft(${index}, 'color', this.value)"></div></div></div>`;
}

function updateNfeDraft(index, field, value) { if (nfeImportDraft[index]) nfeImportDraft[index][field] = value; }
function removeNfeDraftItem(index) { nfeImportDraft.splice(index, 1); renderNfeImportModal(); }
function closeNfeImportModal() { document.getElementById('nfe-import-modal')?.classList.remove('active'); }

async function confirmNfeImport() {
  if (!nfeImportDraft.length) return;
  if (allProducts.length + nfeImportDraft.length > 9000) return showToast('A importação ultrapassa o limite de 9.000 produtos.', 'warning');
  const barcodes = new Set();
  for (const item of nfeImportDraft) {
    item.name = String(item.name || '').trim(); item.barcode = String(item.barcode || '').trim();
    if (!item.name || !item.barcode || !(Number(item.stockQty) > 0) || !(Number(item.sellPrice) > 0)) return showToast('Preencha nome, código, quantidade e preço de venda de todos os produtos.', 'warning');
    if (barcodes.has(item.barcode) || allProducts.some(product => String(product.barcode) === item.barcode)) return showToast(`O código ${item.barcode} está duplicado. Corrija antes de confirmar.`, 'warning');
    barcodes.add(item.barcode);
  }
  const button = document.querySelector('#nfe-import-modal .btn-primary'); if (button) { button.disabled = true; button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cadastrando...'; }
  try {
    const products = nfeImportDraft.map(item => ({ ...item, nfeNumber: nfeImportInfo.number, supplierName: nfeImportInfo.supplier, description: `Importado da NF-e ${nfeImportInfo.number || ''}${item.ncm ? ` · NCM ${item.ncm}` : ''}`.trim(), minStock: 2 }));
    await addProductsBatch(products);
    const count = products.length; nfeImportDraft = []; closeNfeImportModal();
    showToast(`${count} produto(s) cadastrado(s) a partir da NF-e.`, 'success', 6000);
  } catch (error) {
    console.error('Erro ao cadastrar produtos da NF-e:', error); showToast(error.message || 'Não foi possível concluir a importação.', 'danger');
    if (button) { button.disabled = false; button.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar cadastro'; }
  }
}

// Escutar lista de produtos em tempo real no Firestore
function loadProducts() {
  db.collection('products').orderBy('createdAt', 'desc').onSnapshot(snapshot => {
    allProducts = [];
    snapshot.forEach(doc => {
      allProducts.push({ id: doc.id, ...doc.data() });
    });

    renderProductsUI();
    if (window.updateDashboardStats) window.updateDashboardStats();
    if (window.renderPDVCatalog) window.renderPDVCatalog();
  }, error => {
    console.error("Erro ao carregar produtos:", error);
    showToast("Erro ao sincronizar produtos do banco.", "danger");
  });
}

// Renderizar Tabela/Grade de Produtos com Filtros
function renderProductsUI() {
  const tableBody = document.getElementById('products-table-body');
  const searchInput = document.getElementById('inventory-search');
  const categoryFilter = document.getElementById('inventory-category-filter');
  const sizeFilter = document.getElementById('inventory-size-filter');
  
  if (!tableBody) return;

  const searchVal = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const categoryVal = categoryFilter ? categoryFilter.value : '';
  const sizeVal = sizeFilter ? sizeFilter.value : '';

  // Filtragem dos produtos
  const filteredProducts = allProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchVal) ||
                          (p.barcode && p.barcode.toLowerCase().includes(searchVal)) ||
                          (p.color && p.color.toLowerCase().includes(searchVal)) ||
                          (p.barcodeGenerated && 'codigo interno gerado sistema sem gtin'.includes(searchVal));
    const matchesCategory = !categoryVal || p.category === categoryVal;
    const matchesSize = !sizeVal || p.size === sizeVal;

    return matchesSearch && matchesCategory && matchesSize;
  });

  tableBody.innerHTML = '';

  if (filteredProducts.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <i class="fa-solid fa-shirt" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
          Nenhum produto cadastrado ou encontrado com os filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  filteredProducts.forEach(p => {
    const isLowStock = p.stockQty <= (p.minStock || 2);
    const stockBadge = isLowStock 
      ? `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> ${p.stockQty} un (Baixo)</span>`
      : `<span class="badge badge-success">${p.stockQty} un</span>`;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="inventory-product-cell">
          ${p.imageUrl ? `<img src="${escapeHtml(p.imageUrl)}" alt="Foto de ${escapeHtml(p.name)}" class="inventory-product-thumb">` : '<div class="inventory-product-placeholder"><i class="fa-solid fa-shirt"></i></div>'}
          <div><div style="font-weight: 600;">${escapeHtml(p.name)}</div>
        <small style="color: var(--text-muted); font-family: monospace;">Código: ${p.barcode || '-'}</small>
        ${p.barcodeGenerated ? '<small class="inventory-internal-code"><i class="fa-solid fa-wand-magic-sparkles"></i> Código interno gerado pelo sistema</small>' : ''}
          </div>
        </div>
      </td>
      <td><span class="badge badge-secondary">${escapeHtml(p.category || 'Geral')}</span></td>
      <td><span class="badge badge-size">${escapeHtml(p.size || 'M')}</span></td>
      <td>
        <span class="badge-color-dot" style="background-color: ${getColorHex(p.color)};"></span>
        ${escapeHtml(p.color || 'Padrão')}
      </td>
      <td>R$ ${(p.costPrice || 0).toFixed(2)}</td>
      <td style="font-weight: 700; color: var(--accent-primary);">R$ ${(p.sellPrice || 0).toFixed(2)}</td>
      <td>${stockBadge}</td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button class="btn btn-secondary btn-sm" onclick="openPrintLabelModal('${p.id}')" title="Imprimir Etiqueta">
            <i class="fa-solid fa-barcode"></i>
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openProductModal('${p.id}')" title="Editar">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteProduct('${p.id}', '${escapeHtml(p.name)}')" title="Excluir">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(row);
  });
}

// Abrir Modal de Cadastro/Edição
function openProductModal(productId = null) {
  currentEditingProductId = productId;
  const modal = document.getElementById('product-modal');
  const title = document.getElementById('product-modal-title');
  const form = document.getElementById('product-form');

  form.reset();
  currentProductImage = '';
  updateProductPhotoPreview();

  if (productId) {
    title.textContent = "Editar Peça de Roupa";
    const product = allProducts.find(p => p.id === productId);
    if (product) {
      document.getElementById('prod-name').value = product.name;
      document.getElementById('prod-category').value = product.category || 'Feminino';
      document.getElementById('prod-size').value = product.size || 'M';
      document.getElementById('prod-color').value = product.color || 'Preto';
      document.getElementById('prod-cost-price').value = product.costPrice || 0;
      document.getElementById('prod-sell-price').value = product.sellPrice || 0;
      document.getElementById('prod-stock').value = product.stockQty || 0;
      document.getElementById('prod-min-stock').value = product.minStock || 2;
      document.getElementById('prod-barcode').value = product.barcode || '';
      document.getElementById('prod-description').value = product.description || '';
      currentProductImage = product.imageUrl || '';
      updateProductPhotoPreview();
    }
  } else {
    title.textContent = "Nova Peça de Roupa";
    document.getElementById('prod-barcode').value = generateRandomBarcode();
  }

  modal.classList.add('active');
}

function closeProductModal() {
  document.getElementById('product-modal').classList.remove('active');
}

function generateProductBarcode() {
  const field = document.getElementById('prod-barcode');
  if (!field) return;
  if (field.value && !confirm('Substituir o código atual por um novo código EAN-13?')) return;
  field.value = generateRandomBarcode();
  showToast('Código EAN-13 gerado. Salve a peça para imprimir a etiqueta.', 'success');
}

// Salvar Produto (Submit)
async function handleProductFormSubmit(e) {
  e.preventDefault();

  const productData = {
    name: document.getElementById('prod-name').value.trim(),
    category: document.getElementById('prod-category').value,
    size: document.getElementById('prod-size').value,
    color: document.getElementById('prod-color').value.trim(),
    costPrice: document.getElementById('prod-cost-price').value,
    sellPrice: document.getElementById('prod-sell-price').value,
    stockQty: document.getElementById('prod-stock').value,
    minStock: document.getElementById('prod-min-stock').value,
    barcode: document.getElementById('prod-barcode').value.trim(),
    description: document.getElementById('prod-description').value.trim(),
    imageUrl: currentProductImage
  };

  if (!productData.name || !productData.sellPrice) {
    showToast("Preencha o nome e o preço de venda da peça.", "warning");
    return;
  }

  const duplicatedBarcode = allProducts.some(product =>
    product.barcode === productData.barcode && product.id !== currentEditingProductId
  );
  if (productData.barcode && duplicatedBarcode) {
    showToast('Este código de barras já pertence a outra peça.', 'warning');
    return;
  }

  if (!currentEditingProductId && allProducts.length >= 9000) {
    showToast('Limite de 9.000 produtos atingido.', 'warning');
    return;
  }

  try {
    if (currentEditingProductId) {
      await updateProduct(currentEditingProductId, productData);
      showToast("Produto atualizado com sucesso!", "success");
    } else {
      await addProduct(productData);
      showToast("Novo produto cadastrado com sucesso!", "success");
    }
    closeProductModal();
  } catch (err) {
    showToast("Erro ao salvar produto.", "danger");
  }
}

async function handleProductPhoto(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Selecione um arquivo de imagem válido.', 'warning');
    return;
  }
  try {
    currentProductImage = await compressProductImage(file);
    updateProductPhotoPreview();
    showToast('Foto adicionada à peça.', 'success');
  } catch (error) {
    console.error('Erro ao processar foto:', error);
    showToast('Não foi possível processar essa foto.', 'danger');
  }
}

function compressProductImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const maxSize = 700;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.68));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function updateProductPhotoPreview() {
  const preview = document.getElementById('prod-photo-preview');
  const removeButton = document.getElementById('btn-remove-product-photo');
  if (!preview) return;
  preview.innerHTML = currentProductImage
    ? `<img src="${currentProductImage}" alt="Pré-visualização da peça">`
    : '<i class="fa-solid fa-shirt"></i><span>Nenhuma foto selecionada</span>';
  if (removeButton) removeButton.style.display = currentProductImage ? 'inline-flex' : 'none';
}

function removeProductPhoto() {
  currentProductImage = '';
  updateProductPhotoPreview();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('prod-photo-file')?.addEventListener('change', handleProductPhoto);
  document.getElementById('prod-photo-camera')?.addEventListener('change', handleProductPhoto);
});

// Confirmar exclusão
async function confirmDeleteProduct(id, name) {
  if (confirm(`Deseja realmente excluir o produto "${name}" do estoque?`)) {
    try {
      await deleteProduct(id);
      showToast("Produto removido do estoque.", "warning");
    } catch (e) {
      showToast("Erro ao remover produto.", "danger");
    }
  }
}

// Modal de Gerar/Imprimir Etiqueta com Barcode
function openPrintLabelModal(productId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product) return;

  const modal = document.getElementById('label-modal');
  document.getElementById('label-prod-name').textContent = product.name;
  document.getElementById('label-prod-details').textContent = `Tam: ${product.size} | Cor: ${product.color}`;
  document.getElementById('label-prod-price').textContent = `R$ ${product.sellPrice.toFixed(2)}`;

  // Gerar Código de Barras com JsBarcode
  try {
    const barcode = product.barcode || "0000000000000";
    JsBarcode("#label-barcode-svg", barcode, {
      format: /^\d{13}$/.test(barcode) ? "EAN13" : "CODE128",
      lineColor: "#000",
      width: 2,
      height: 50,
      displayValue: true
    });
  } catch (e) {
    console.error("Erro ao gerar código de barras visual:", e);
  }

  modal.classList.add('active');
}

function closeLabelModal() {
  document.getElementById('label-modal').classList.remove('active');
}

function printLabel() {
  window.print();
}

// Helper para converter nome de cores em HEX aproximado para as bolinhas visuais
function getColorHex(colorName) {
  if (!colorName) return '#94a3b8';
  const c = colorName.toLowerCase();
  if (c.includes('preto') || c.includes('black')) return '#000000';
  if (c.includes('branco') || c.includes('white')) return '#ffffff';
  if (c.includes('vermelho') || c.includes('red')) return '#ef4444';
  if (c.includes('azul') || c.includes('blue')) return '#3b82f6';
  if (c.includes('verde') || c.includes('green')) return '#10b981';
  if (c.includes('rosa') || c.includes('pink')) return '#ec4899';
  if (c.includes('amarelo') || c.includes('yellow')) return '#f59e0b';
  if (c.includes('roxo') || c.includes('purple')) return '#8b5cf6';
  if (c.includes('cinza') || c.includes('gray')) return '#64748b';
  if (c.includes('bege') || c.includes('beige')) return '#d4b595';
  return '#8b5cf6';
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}
