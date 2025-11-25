console.log('[FB Popup] Loaded');

const extractBtn = document.getElementById('extractBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusDiv = document.getElementById('status');
const profileIdInput = document.getElementById('profileId');
const keywordsInput = document.getElementById('keywords');
const maxPostsInput = document.getElementById('maxPosts');
const stopDateInput = document.getElementById('stopDate');

let extractedPosts = [];

// Valeurs par défaut
const DEFAULT_KEYWORDS = 'cateno, luca, federico, basile';
const DEFAULT_STOP_DATE = '2024-01-01';

// Charger les valeurs sauvegardées au chargement du popup
chrome.storage.local.get(['savedProfileId', 'savedKeywords', 'savedMaxPosts', 'savedStopDate'], (result) => {
  console.log('[FB Popup] Loaded saved values:', result);

  // Auto-remplir les valeurs sauvegardées
  if (result.savedProfileId) {
    profileIdInput.value = result.savedProfileId;
  }

  keywordsInput.value = result.savedKeywords || DEFAULT_KEYWORDS;

  if (result.savedMaxPosts !== undefined) {
    maxPostsInput.value = result.savedMaxPosts;
  }

  stopDateInput.value = result.savedStopDate || DEFAULT_STOP_DATE;
});

// Auto-remplir le Profile ID depuis la page Facebook (prioritaire)
(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab.url && tab.url.includes('facebook.com')) {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getProfileId' });

      if (response && response.profileId) {
        profileIdInput.value = response.profileId;
        console.log('[FB Popup] Auto-filled profile ID:', response.profileId);
      }
    }
  } catch (error) {
    console.log('[FB Popup] Could not auto-fill profile ID:', error.message);
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
    const profileId = profileIdInput.value.trim();
    const keywords = keywordsInput.value
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
    const maxPosts = parseInt(maxPostsInput.value) || 0;
    const stopDate = stopDateInput.value; // Format YYYY-MM-DD

    if (!profileId) {
      showStatus('Please enter a Profile ID', 'error');
      return;
    }

    // Sauvegarder les valeurs pour la prochaine fois
    chrome.storage.local.set({
      savedProfileId: profileId,
      savedKeywords: keywordsInput.value,
      savedMaxPosts: maxPosts,
      savedStopDate: stopDate
    }, () => {
      console.log('[FB Popup] Saved values:', { profileId, keywords, maxPosts, stopDate });
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

    // Envoyer le message au content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractPosts',
      profileId: profileId,
      keywords: keywords, // Passer les keywords
      maxPosts: maxPosts,
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
