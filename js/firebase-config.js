/* ==========================================================================
   ModaGestão - Configuração do Firebase
   Inicialização segura e suporte a credenciais customizadas via LocalStorage
   ========================================================================== */

// Configuração Padrão do Firebase (Substitua pelas suas chaves do Firebase Console)
const defaultFirebaseConfig = {
  apiKey: "AIzaSyAdMG6PeOAIl_BqzsSjqxj1xYjYe9Aedlc",
  authDomain: "marimodas-794e4.firebaseapp.com",
  projectId: "marimodas-794e4",
  storageBucket: "marimodas-794e4.firebasestorage.app",
  messagingSenderId: "666607317133",
  appId: "1:666607317133:web:660133becd24e8175332c4"
};

// Carrega as credenciais salvas no LocalStorage ou usa as padrão
function getFirebaseConfig() {
  const savedConfig = localStorage.getItem('modagestao_firebase_config');
  if (savedConfig) {
    try {
      return JSON.parse(savedConfig);
    } catch (e) {
      console.error("Erro ao ler credenciais do Firebase salvas:", e);
    }
  }
  return defaultFirebaseConfig;
}

// Salva credenciais customizadas informadas pelo usuário na tela de Configurações
function saveFirebaseConfig(configObj) {
  localStorage.setItem('modagestao_firebase_config', JSON.stringify(configObj));
  location.reload();
}

// Restaura credenciais para o padrão
function resetFirebaseConfig() {
  localStorage.removeItem('modagestao_firebase_config');
  location.reload();
}

// Inicializar Firebase
let app, auth, db;

function initFirebase() {
  try {
    const config = getFirebaseConfig();
    if (!firebase.apps.length) {
      app = firebase.initializeApp(config);
    } else {
      app = firebase.app();
    }
    auth = firebase.auth();
    db = firebase.firestore();

    // Habilitar persistência offline no Firestore se suportado
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
      if (err.code == 'failed-precondition') {
        console.warn('Persistência offline falhou: Múltiplas abas abertas.');
      } else if (err.code == 'unimplemented') {
        console.warn('Navegador atual não suporta persistência offline.');
      }
    });

    console.log("Firebase inicializado com sucesso!");
    return { app, auth, db };
  } catch (error) {
    console.error("Erro na inicialização do Firebase:", error);
    return null;
  }
}

// Executar inicialização
initFirebase();
