let extractedPosts = [];

document.getElementById('extractBtn').addEventListener('click', async () => {
  const profileId = document.getElementById('profileId').value.trim();
  const maxPosts = parseInt(document.getElementById('maxPosts').value) || 0;
  const extractBtn = document.getElementById('extractBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const status = document.getElementById('status');

  // Vérifier que l'ID est fourni
  if (!profileId) {
    status.className = 'show error';
    status.textContent = '❌ Please enter a Profile ID';
    return;
  }

  extractBtn.disabled = true;
  extractBtn.textContent = '⏳ Extracting...';
  status.className = 'show';
  status.textContent = 'Starting extraction...';

  try {
    // Récupérer l'onglet actif
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('facebook.com')) {
      throw new Error('Please open a Facebook profile page first!');
    }

    // Envoyer un message au content script
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractPosts',
      profileId: profileId,
      maxPosts: maxPosts
    });

    if (response.success) {
      extractedPosts = response.posts;
      status.className = 'show success';
      status.innerHTML = `✅ Extracted <span id="postCount">${extractedPosts.length}</span> posts successfully!`;
      downloadBtn.style.display = 'block';
    } else {
      throw new Error(response.error || 'Extraction failed');
    }
  } catch (error) {
    status.className = 'show error';
    status.textContent = `❌ Error: ${error.message}`;
    console.error('Extraction error:', error);
  } finally {
    extractBtn.disabled = false;
    extractBtn.textContent = '🚀 Extract Posts';
  }
});

document.getElementById('downloadBtn').addEventListener('click', () => {
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

  const status = document.getElementById('status');
  status.className = 'show success';
  status.textContent = '✅ Downloaded successfully!';
});
