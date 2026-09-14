/* ==========================================================================
   ModaGestão - Módulo de Banco de Dados (Firebase Firestore)
   Gerenciamento de Produtos, Vendas e Baixa Automática de Estoque
   ========================================================================== */

// --- PRODUTOS (ESTOQUE) ---

// Cadastrar novo produto de roupa
async function addProduct(product) {
  try {
    const docRef = await db.collection('products').add({
      name: product.name,
      category: product.category || 'Geral',
      size: product.size || 'M',
      color: product.color || 'Preto',
      costPrice: parseFloat(product.costPrice) || 0,
      sellPrice: parseFloat(product.sellPrice) || 0,
      stockQty: parseInt(product.stockQty) || 0,
      minStock: parseInt(product.minStock) || 2,
      barcode: product.barcode || generateRandomBarcode(),
      imageUrl: product.imageUrl || '',
      description: product.description || '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  } catch (error) {
    console.error("Erro ao adicionar produto:", error);
    throw error;
  }
}

// Atualizar produto existente
async function updateProduct(id, product) {
  try {
    await db.collection('products').doc(id).update({
      name: product.name,
      category: product.category,
      size: product.size,
      color: product.color,
      costPrice: parseFloat(product.costPrice) || 0,
      sellPrice: parseFloat(product.sellPrice) || 0,
      stockQty: parseInt(product.stockQty) || 0,
      minStock: parseInt(product.minStock) || 2,
      barcode: product.barcode,
      imageUrl: product.imageUrl || '',
      description: product.description || '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error("Erro ao atualizar produto:", error);
    throw error;
  }
}

// Deletar produto
async function deleteProduct(id) {
  try {
    await db.collection('products').doc(id).delete();
  } catch (error) {
    console.error("Erro ao deletar produto:", error);
    throw error;
  }
}

// Buscar produto por Código de Barras / QR Code
async function getProductByBarcode(barcode) {
  try {
    const snapshot = await db.collection('products')
      .where('barcode', '==', barcode.trim())
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Erro ao buscar por código de barras:", error);
    return null;
  }
}

// --- VENDAS & PDV (FRENTE DE CAIXA) ---

// Finalizar Venda com Baixa Automática no Estoque via Firestore Batch Write
async function processSaleTransaction(saleData) {
  const batch = db.batch();
  
  // 1. Criar referência da nova venda
  const saleRef = db.collection('sales').doc();
  const timestamp = firebase.firestore.FieldValue.serverTimestamp();

  const formattedSale = {
    saleId: saleRef.id,
    items: saleData.items, // [{ id, name, size, color, qty, price, total }]
    subtotal: parseFloat(saleData.subtotal),
    discount: parseFloat(saleData.discount || 0),
    total: parseFloat(saleData.total),
    paymentMethod: saleData.paymentMethod, // PIX, CARTAO_CREDITO, CARTAO_DEBITO, DINHEIRO
    clientId: saleData.clientId || '',
    clientName: saleData.clientName || '',
    dueDate: saleData.dueDate || '',
    installments: parseInt(saleData.installments) || 1,
    cardInstallments: parseInt(saleData.cardInstallments) || 1,
    cardFeeRate: parseFloat(saleData.cardFeeRate) || 0,
    cardFeePayer: saleData.cardFeePayer || '',
    cardFeeAmount: parseFloat(saleData.cardFeeAmount) || 0,
    chargedTotal: parseFloat(saleData.chargedTotal ?? saleData.total),
    netTotal: parseFloat(saleData.netTotal ?? saleData.total),
    cashReceived: parseFloat(saleData.cashReceived || 0),
    changeGiven: parseFloat(saleData.changeGiven || 0),
    status: 'CONCLUIDA',
    cashierUid: currentUser ? currentUser.uid : 'anon',
    cashierName: currentUser ? (currentUser.displayName || currentUser.email) : 'Operador',
    createdAt: timestamp
  };

  batch.set(saleRef, formattedSale);

  // Registrar automaticamente a movimentação no financeiro.
  addSaleFinancialEntriesToBatch(batch, formattedSale, saleRef.id, timestamp);

  // 2. Dar baixa automática no estoque de cada produto vendido
  for (const item of saleData.items) {
    const productRef = db.collection('products').doc(item.id);
    batch.update(productRef, {
      stockQty: firebase.firestore.FieldValue.increment(-item.qty),
      updatedAt: timestamp
    });
  }

  // Commit no banco
  await batch.commit();
  return formattedSale;
}

// Cancelar Venda (Estorno com devolução automática ao estoque)
async function cancelSaleTransaction(saleId) {
  try {
    const saleDoc = await db.collection('sales').doc(saleId).get();
    if (!saleDoc.exists) {
      throw new Error("Venda não encontrada.");
    }

    const saleData = saleDoc.data();
    if (saleData.status === 'CANCELADA') {
      throw new Error("Esta venda já foi cancelada previamente.");
    }

    const batch = db.batch();

    // 1. Atualizar status da venda para CANCELADA
    const saleRef = db.collection('sales').doc(saleId);
    batch.update(saleRef, {
      status: 'CANCELADA',
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      cancelledBy: currentUser ? (currentUser.displayName || currentUser.email) : 'Operador'
    });

    // 2. Restituir as quantidades ao estoque
    for (const item of saleData.items) {
      const productRef = db.collection('products').doc(item.id);
      batch.update(productRef, {
        stockQty: firebase.firestore.FieldValue.increment(item.qty),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    // Cancelar também os lançamentos financeiros ligados à venda.
    const financialSnapshot = await db.collection('financialEntries').where('saleId', '==', saleId).get();
    financialSnapshot.forEach(doc => {
      batch.update(doc.ref, {
        status: 'cancelled',
        cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    return true;
  } catch (error) {
    console.error("Erro ao estornar venda:", error);
    throw error;
  }
}

function addSaleFinancialEntriesToBatch(batch, sale, saleId, timestamp) {
  const installments = sale.paymentMethod === 'CREDITO_LOJA' ? (parseInt(sale.installments) || 1) : 1;
  const totalCents = Math.round(Number(sale.total || 0) * 100);
  const baseCents = Math.floor(totalCents / installments);
  const firstDue = sale.dueDate ? new Date(sale.dueDate + 'T12:00:00') : new Date();
  const preferredDay = firstDue.getDate();

  for (let index = 0; index < installments; index++) {
    const cents = index === installments - 1
      ? totalCents - (baseCents * (installments - 1))
      : baseCents;
    const due = new Date(firstDue);
    due.setDate(1);
    due.setMonth(due.getMonth() + index);
    const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(preferredDay, lastDay));

    const entryRef = db.collection('financialEntries').doc(`sale_${saleId}_${index + 1}`);
    batch.set(entryRef, {
      type: 'income',
      amount: cents / 100,
      description: sale.paymentMethod === 'CREDITO_LOJA'
        ? `Fiado de ${sale.clientName || 'cliente'} · venda #${String(saleId).slice(0, 8).toUpperCase()} · parcela ${index + 1}/${installments}`
        : `Venda #${String(saleId).slice(0, 8).toUpperCase()}`,
      saleId,
      clientId: sale.clientId || '',
      paymentMethod: sale.paymentMethod,
      installment: index + 1,
      installments,
      dueDate: due.toISOString().slice(0, 10),
      status: sale.paymentMethod === 'CREDITO_LOJA' ? 'pending' : 'paid',
      automatic: true,
      createdAt: timestamp
    }, { merge: true });
  }

  if (sale.paymentMethod === 'CARTAO_CREDITO' && sale.cardFeePayer !== 'CUSTOMER' && Number(sale.cardFeeAmount) > 0) {
    const feeRef = db.collection('financialEntries').doc(`sale_${saleId}_fee`);
    batch.set(feeRef, {
      type: 'expense',
      amount: Number(sale.cardFeeAmount),
      description: `Taxa ${systemSettings?.terminal || 'Mercado Pago'} · venda #${String(saleId).slice(0, 8).toUpperCase()} · ${sale.cardInstallments || 1}x`,
      saleId,
      paymentMethod: sale.paymentMethod,
      installments: sale.cardInstallments || 1,
      feeRate: sale.cardFeeRate || 0,
      dueDate: firstDue.toISOString().slice(0, 10),
      status: 'paid',
      automatic: true,
      createdAt: timestamp
    }, { merge: true });
  }
}

async function ensureSaleFinancialEntries(sale) {
  if (!sale || sale.status !== 'CONCLUIDA') return;
  const saleId = sale.saleId || sale.id;
  const batch = db.batch();
  addSaleFinancialEntriesToBatch(batch, sale, saleId, sale.createdAt || firebase.firestore.FieldValue.serverTimestamp());
  await batch.commit();
}

// Gerar um EAN-13 válido para circulação interna da loja, com dígito verificador.
function generateRandomBarcode() {
  let barcode;
  do {
    let base = '200';
    for (let i = 0; i < 9; i++) base += Math.floor(Math.random() * 10);
    const weightedSum = base.split('').reduce((sum, digit, index) => {
      return sum + Number(digit) * (index % 2 === 0 ? 1 : 3);
    }, 0);
    barcode = base + ((10 - (weightedSum % 10)) % 10);
  } while (typeof allProducts !== 'undefined' && allProducts.some(product => product.barcode === barcode));
  return barcode;
}
