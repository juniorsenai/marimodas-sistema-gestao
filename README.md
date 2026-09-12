# 🛍️ ModaGestão — Sistema de Gestão para Loja de Roupas

Sistema completo de gestão para negócios de moda, com **PDV**, **Controle de Estoque**, **Leitor de Código de Barras por Câmera**, **Firebase Auth** e hospedagem gratuita no **GitHub Pages**.

---

## ✨ Funcionalidades

- 🔐 **Autenticação segura** com Firebase (E-mail/Senha, Recuperação de Conta)
- 📦 **Controle de Estoque** com atributos específicos de moda (Tamanho, Cor, Categoria)
- 📲 **Leitor de QR Code / Código de Barras** usando a câmera do dispositivo
- 🖨️ **Gerador e impressor de Etiquetas** com código de barras
- 🛒 **PDV (Ponto de Venda)** com carrinho, desconto, troco automático
- 💳 **Formas de Pagamento**: Dinheiro, PIX, Cartão de Crédito e Débito
- 🧾 **Recibo Digital** imprimível com comprovante
- 📊 **Relatórios de Vendas** com filtros, cancelamento/estorno e exportação CSV
- 🔔 **Alertas de Estoque Baixo** no Dashboard
- 📱 **100% Responsivo** para Celular, Tablet e Desktop

---

## 🚀 Configuração Passo a Passo

### 1. Criar Projeto no Firebase

1. Acesse [Firebase Console](https://console.firebase.google.com) e clique em **"Adicionar Projeto"**.
2. Dê um nome (ex: `modagestao`) e conclua o assistente.
3. Registre um **app Web** (ícone `</>`) dentro do projeto e copie as credenciais.

### 2. Ativar Authentication

1. No console Firebase, vá em **Authentication > Método de Login**.
2. Ative o provedor **E-mail/Senha**.

### 3. Criar Banco de Dados Firestore

1. Vá em **Firestore Database > Criar banco de dados**.
2. Inicie no **modo de produção** (iremos aplicar as regras de segurança a seguir).

### 4. ⚠️ Aplicar Regras de Segurança (OBRIGATÓRIO)

1. No Firebase Console, vá em **Firestore > Guias > Regras**.
2. Substitua o conteúdo pelas regras do arquivo [`firestore.rules`](firestore.rules).
3. Clique em **Publicar**.

> **IMPORTANTE:** Sem as regras de segurança, qualquer pessoa poderia acessar seu banco de dados. Nunca publique sem configurar as regras.

### 5. Inserir Credenciais no Sistema

Após abrir o sistema no navegador:
1. Na tela de login, crie sua conta clicando em **"Criar Conta"**.
2. Após logar, vá em **⚙️ Configurações** no menu.
3. Cole suas credenciais do Firebase nos campos correspondentes.
4. Clique em **Salvar Configurações** — o sistema recarregará com seu Firebase.

---

## 🌐 Hospedar no GitHub Pages (Gratuito)

### Passo a passo:

1. Crie um novo repositório público no [GitHub](https://github.com).
2. Faça upload de todos os arquivos do projeto para o repositório.
3. Vá em **Settings > Pages** do repositório.
4. Em **Source**, selecione `main` e a pasta `/ (root)`.
5. Salve. Em alguns minutos o site estará disponível em:
   `https://seu-usuario.github.io/nome-do-repositorio`

> **Dica:** Para subir via terminal:
> ```bash
> git init
> git add .
> git commit -m "Primeiro deploy ModaGestão"
> git remote add origin https://github.com/SEU_USUARIO/modagestao.git
> git push -u origin main
> ```

### Configurar Domínio Autorizado no Firebase

Para o login funcionar no GitHub Pages:
1. Vá em **Firebase Console > Authentication > Settings > Authorized Domains**.
2. Clique em **Add Domain** e adicione: `seu-usuario.github.io`.

---

## 📁 Estrutura de Arquivos

```
SISTEMA_GESTÃO/
├── index.html              # Aplicação SPA principal
├── firestore.rules         # Regras de segurança do Firestore
├── README.md               # Este guia
├── css/
│   └── styles.css          # Sistema de design responsivo
└── js/
    ├── firebase-config.js  # Inicialização do Firebase
    ├── auth.js             # Autenticação (Login/Registro/Logout)
    ├── db.js               # Operações no Firestore
    ├── scanner.js          # Leitor de QR Code/Barcode por câmera
    ├── inventory.js        # Gestão de Estoque
    ├── pdv.js              # Frente de Caixa / PDV
    ├── sales.js            # Histórico de Vendas e Relatórios
    └── app.js              # Navegação e inicialização
```

---

## 🔒 Segurança dos Dados

- As credenciais do Firebase são armazenadas no **localStorage** do navegador, nunca expostas no código-fonte público.
- As regras do **Firestore** garantem que apenas usuários autenticados acessam ou modificam dados.
- Todo o acesso sem login é **bloqueado** automaticamente pelo Firebase Auth.
- Use senhas fortes ao criar sua conta de administrador.

---

## 📱 Compatibilidade

| Dispositivo | Suporte |
|-------------|---------|
| 📱 Smartphone | ✅ Barra de navegação inferior |
| 📟 Tablet | ✅ Layout adaptável |
| 💻 Desktop | ✅ Sidebar completa |
| 🎥 Câmera para scanner | ✅ Todos os dispositivos com câmera |

---

Desenvolvido com ❤️ para **ModaGestão** — Seu negócio de moda no controle!
