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
    cashReceived: parseFloat(saleData.cashReceived || 0),
    changeGiven: parseFloat(saleData.changeGiven || 0),
    status: 'CONCLUIDA',
    cashierUid: currentUser ? currentUser.uid : 'anon',
    cashierName: currentUser ? (currentUser.displayName || currentUser.email) : 'Operador',
    createdAt: timestamp
  };

  batch.set(saleRef, formattedSale);

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

    await batch.commit();
    return true;
  } catch (error) {
    console.error("Erro ao estornar venda:", error);
    throw error;
  }
}

// Gerar código de barras aleatório de 12 dígitos se não fornecido
function generateRandomBarcode() {
  let result = '789'; // Código padrão nacional Brasil EAN
  for (let i = 0; i < 9; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}
