console.log('[FB Popup] Loaded');

const extractBtn = document.getElementById('extractBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const keywordsInput = document.getElementById('keywords');
const stopDateInput = document.getElementById('stopDate');

let extractedPosts = [];
let detectedProfileId = null; // Stocker l'ID détecté

// Valeurs par défaut
const DEFAULT_KEYWORDS = 'cateno, luca, federico, basile';
const DEFAULT_STOP_DATE = '2024-01-01';

// Charger les valeurs sauvegardées au chargement du popup
chrome.storage.local.get(['savedKeywords', 'savedStopDate'], (result) => {
  console.log('[FB Popup] Loaded saved values:', result);

  keywordsInput.value = result.savedKeywords || DEFAULT_KEYWORDS;
  stopDateInput.value = result.savedStopDate || DEFAULT_STOP_DATE;
});

// Détecter le Profile ID depuis la page Facebook
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url && tab.url.includes('facebook.com')) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getProfileId' });

      if (response && response.profileId) {
        detectedProfileId = response.profileId;
        console.log('[FB Popup] Detected profile ID:', detectedProfileId);
      }
    }
  } catch (error) {
    console.log('[FB Popup] Could not detect profile ID:', error.message);
  }
})();

// Afficher un message de status
function showStatus(message, type = 'info') {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  statusDiv.classList.remove('hidden');
}

// Démarrer l'extraction
extractBtn.addEventListener('click', async () => {
  try {
    const keywords = keywordsInput.value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    const stopDate = stopDateInput.value; // Format YYYY-MM-DD

    if (!detectedProfileId) {
      showStatus('Could not detect Profile ID. Please refresh the Facebook page.', 'error');
      return;
    }

    if (!stopDate) {
      showStatus('Please select a stop date', 'error');
      return;
    }

    // Sauvegarder les valeurs pour la prochaine fois
    chrome.storage.local.set({
      savedKeywords: keywordsInput.value,
      savedStopDate: stopDate
    }, () => {
      console.log('[FB Popup] Saved values:', { keywords, stopDate });
    });

    extractBtn.disabled = true;
    extractBtn.textContent = 'Extracting...';
    showStatus('Starting extraction...');

    // Obtenir l'onglet actif
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Vérifier qu'on est sur Facebook
    if (!tab.url || !tab.url.includes('facebook.com')) {
      showStatus('Please navigate to a Facebook profile first', 'error');
      extractBtn.disabled = false;
      extractBtn.textContent = 'Start Extraction';
      return;
    }

    // Envoyer le message au content script avec l'ID détecté
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractPosts',
      profileId: detectedProfileId,
      keywords: keywords,
      stopDate: stopDate
    });

    if (response && response.success) {
      extractedPosts = response.posts;
      showStatus(`Extracted ${extractedPosts.length} posts successfully!`, 'success');
      downloadBtn.style.display = 'block';
    } else {
      throw new Error(response?.error || 'Extraction failed');
    }
  } catch (error) {
    console.error('[FB Popup] Error:', error);
    showStatus('Error: ' + error.message, 'error');
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = 'Start Extraction';
  }
});

// Télécharger le JSON
downloadBtn.addEventListener('click', () => {
  const jsonString = JSON.stringify(extractedPosts, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `facebook_posts_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showStatus('Downloaded successfully!', 'success');
});
