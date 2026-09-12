/* ==========================================================================
   ModaGestão - Módulo de Autenticação (Firebase Auth)
   ========================================================================== */

let currentUser = null;

// Escutar estado de autenticação em tempo real
function initAuthListener() {
  auth.onAuthStateChanged(user => {
    const authContainer = document.getElementById('auth-container');
    const mainApp = document.getElementById('main-app');

    if (user) {
      currentUser = user;
      console.log("Usuário autenticado:", user.email);

      // Atualizar interface com dados do usuário
      const userNameEl = document.getElementById('current-user-name');
      const userAvatarEl = document.getElementById('current-user-avatar');
      const userRoleEl = document.getElementById('current-user-role');

      const displayName = user.displayName || user.email.split('@')[0];
      if (userNameEl) userNameEl.textContent = displayName;
      if (userAvatarEl) userAvatarEl.textContent = displayName.charAt(0).toUpperCase();
      if (userRoleEl) userRoleEl.textContent = "Administrador / Operador";

      // Esconder Auth / Mostrar App
      if (authContainer) authContainer.style.display = 'none';
      if (mainApp) mainApp.style.display = 'flex';

      // Carregar dados iniciais do Firestore
      if (window.loadDashboardData) window.loadDashboardData();
      if (window.loadProducts) window.loadProducts();
      if (window.loadSales) window.loadSales();

    } else {
      currentUser = null;
      console.log("Usuário não autenticado.");

      // Mostrar Auth / Esconder App
      if (authContainer) authContainer.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';
    }
  });
}

// Login com E-mail e Senha
async function loginUser(email, password) {
  try {
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    showToast("Login realizado com sucesso!", "success");
    return userCredential.user;
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    let msg = "Erro ao fazer login. Verifique suas credenciais.";
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      msg = "E-mail ou senha incorretos.";
    } else if (error.code === 'auth/too-many-requests') {
      msg = "Muitas tentativas malsucedidas. Tente novamente mais tarde.";
    }
    showToast(msg, "danger");
    throw error;
  }
}

// Cadastrar Novo Usuário
async function registerUser(name, email, password) {
  try {
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    const user = userCredential.user;
    
    // Atualizar nome de exibição no Firebase Auth Profile
    await user.updateProfile({
      displayName: name
    });

    // Salvar perfil do usuário no Firestore
    await db.collection('users').doc(user.uid).set({
      uid: user.uid,
      name: name,
      email: email,
      role: 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    showToast("Conta criada com sucesso!", "success");
    return user;
  } catch (error) {
    console.error("Erro ao registrar:", error);
    let msg = "Erro ao criar conta.";
    if (error.code === 'auth/email-already-in-use') {
      msg = "Este e-mail já está cadastrado.";
    } else if (error.code === 'auth/weak-password') {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    }
    showToast(msg, "danger");
    throw error;
  }
}

// Enviar e-mail de redefinição de senha
async function sendPasswordReset(email) {
  try {
    await auth.sendPasswordResetEmail(email);
    showToast("E-mail de redefinição enviado com sucesso!", "success");
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    showToast("Erro ao enviar e-mail de redefinição.", "danger");
  }
}

// Logout do Usuário
async function logoutUser() {
  try {
    await auth.signOut();
    showToast("Sessão encerrada.", "warning");
  } catch (error) {
    console.error("Erro ao sair:", error);
    showToast("Erro ao encerrar sessão.", "danger");
  }
}

// Inicializar listener de Auth ao carregar o script
document.addEventListener('DOMContentLoaded', () => {
  initAuthListener();
});
