/* ==========================================================================
   ModaGestão - Módulo de Leitura de Código de Barras / QR Code por Câmera
   Utiliza a biblioteca Html5Qrcode para escnear etiquetas de produtos
   ========================================================================== */

let html5QrCode = null;

/**
 * Inicia a câmera para ler Código de Barras ou QR Code
 * @param {Function} onScanSuccess Function callback (scannedText) => {}
 * @param {String} elementId ID do elemento HTML onde o vídeo da câmera será renderizado
 */
async function startCameraScanner(onScanSuccess, elementId = "reader") {
  try {
    // Parar escâner anterior se houver
    if (html5QrCode) {
      await stopCameraScanner();
    }

    html5QrCode = new Html5Qrcode(elementId);
    
    const config = {
      fps: 15,
      qrbox: { width: 280, height: 180 },
      aspectRatio: 1.0,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    // Tentar usar câmera traseira (environment) em dispositivos móveis
    await html5QrCode.start(
      { facingMode: "environment" },
      config,
      (decodedText, decodedResult) => {
        // Sucesso na leitura
        console.log(`Código lido: ${decodedText}`);
        
        // Tocar som suave de beep para feedback tátil/sonoro
        playBeepSound();

        // Parar leitor e disparar callback
        stopCameraScanner();
        if (onScanSuccess) {
          onScanSuccess(decodedText);
        }
      },
      (errorMessage) => {
        // Ignorar erros normais de varredura contínua sem código presente
      }
    );
  } catch (error) {
    console.error("Erro ao iniciar a câmera:", error);
    showToast("Não foi possível acessar a câmera do dispositivo. Verifique as permissões do navegador.", "danger");
  }
}

/**
 * Encerra o stream da câmera e libera os recursos
 */
async function stopCameraScanner() {
  if (html5QrCode) {
    try {
      if (html5QrCode.isScanning) {
        await html5QrCode.stop();
      }
      html5QrCode.clear();
      html5QrCode = null;
    } catch (e) {
      console.warn("Aviso ao encerrar câmera:", e);
      html5QrCode = null;
    }
  }
}

/**
 * Toca um bip de confirmação ao ler o código
 */
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz pitch
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    // Ignorar falhas de áudio caso o navegador bloqueie AutoPlay
  }
}
