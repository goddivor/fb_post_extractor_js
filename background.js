// Import jsPDF library
importScripts('jspdf.min.js');

console.log('[Background] Service worker started');

// State global pour la window de capture
let captureWindowId = null;
let captureTabId = null;
let activeBatches = 0; // Compteur de batches en cours

// Gérer les messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processBatch') {
    console.log(`[Background] Received batch ${request.batchNumber} with ${request.posts.length} posts`);

    activeBatches++;
    console.log(`[Background] Active batches: ${activeBatches}`);

    // Traiter le batch de manière asynchrone
    processBatch(request.batchNumber, request.posts, request.keywords)
      .then(() => {
        activeBatches--;
        console.log(`[Background] Batch ${request.batchNumber} processed successfully. Active batches: ${activeBatches}`);

        // Si c'était le dernier batch, fermer la window
        if (activeBatches === 0) {
          console.log(`[Background] All batches completed, closing capture window`);
          setTimeout(() => {
            if (captureWindowId) {
              chrome.windows.remove(captureWindowId);
              captureWindowId = null;
              captureTabId = null;
            }
          }, 2000);
        }
      })
      .catch(error => {
        activeBatches--;
        console.error(`[Background] Error processing batch ${request.batchNumber}:`, error);
      });

    return false;
  }

  if (request.action === 'closeCaptureWindow') {
    console.log('[Background] Closing capture window');
    if (captureWindowId) {
      chrome.windows.remove(captureWindowId)
        .then(() => {
          console.log('[Background] Capture window closed');
          captureWindowId = null;
          captureTabId = null;
        })
        .catch(error => {
          console.error('[Background] Error closing window:', error);
        });
    }
    return false;
  }
});

// Traiter un batch: ouvrir/réutiliser window, capturer, générer PDF
async function processBatch(batchNumber, posts, keywords) {
  try {
    console.log(`[Background] Processing batch ${batchNumber} (${posts.length} posts)`);

    // Créer ou réutiliser la fenêtre de capture
    if (!captureWindowId) {
      const captureWindow = await chrome.windows.create({
        url: 'about:blank',
        type: 'popup',
        width: 1280,
        height: 800,
        focused: false
      });

      captureWindowId = captureWindow.id;
      captureTabId = captureWindow.tabs[0].id;
      console.log(`[Background] Capture window created: ${captureWindowId}`);
    } else {
      console.log(`[Background] Reusing existing capture window: ${captureWindowId}`);
    }

    const captures = [];

    // Capturer chaque post un par un
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      console.log(`[Background] Capturing post ${i + 1}/${posts.length}: ${post.post_url}`);

      try {
        // Naviguer vers l'URL du post
        await chrome.tabs.update(captureTabId, { url: post.post_url });

        // Attendre que la page charge
        await new Promise((resolve) => {
          const listener = (tabId, changeInfo) => {
            if (tabId === captureTabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);

          // Timeout de sécurité (augmenté à 15s)
          setTimeout(resolve, 15000);
        });

        // Attendre le rendu complet (augmenté à 3s)
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Délai entre captures pour respecter le quota (1 capture par seconde)
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1200));
        }

        // Capturer le screenshot
        const dataUrl = await chrome.tabs.captureVisibleTab(captureWindowId, {
          format: 'jpeg',
          quality: 80
        });

        captures.push({
          post: post,
          dataUrl: dataUrl,
          index: i + 1
        });

        console.log(`[Background] ✓ Captured post ${i + 1}/${posts.length}`);

      } catch (error) {
        console.error(`[Background] Error capturing post ${i + 1}:`, error);
      }
    }

    // NE PAS FERMER LA WINDOW - on la réutilisera pour le prochain batch

    // Générer le PDF avec toutes les captures
    if (captures.length > 0) {
      console.log(`[Background] Generating PDF for batch ${batchNumber} with ${captures.length} captures`);
      await generateBatchPDF(batchNumber, captures, keywords);
      console.log(`[Background] ✓ PDF generation complete for batch ${batchNumber}`);
    } else {
      console.warn(`[Background] No captures for batch ${batchNumber}`);
    }

  } catch (error) {
    console.error(`[Background] Error in processBatch:`, error);
    throw error;
  }
}

// Générer un nom de fichier avec date et heure
function generateFilename(batchNumber) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `facebook_keywords_${year}-${month}-${day}_${hours}-${minutes}-${seconds}_batch_${batchNumber}.pdf`;
}

// Générer et télécharger le PDF avec jsPDF
async function generateBatchPDF(batchNumber, captures, keywords) {
  try {
    console.log(`[Background] Generating PDF for batch ${batchNumber} with ${captures.length} captures`);

    const { jsPDF } = self.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4', true); // landscape, mm, A4, compression

    const title = `Keyword Matches - Batch ${batchNumber}`;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentWidth = pageWidth - 2 * margin;

    // Page de titre
    doc.setFontSize(20);
    doc.text(title, margin, 30);

    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, margin, 45);
    doc.text(`Batch ${batchNumber} - ${captures.length} keyword matches`, margin, 55);
    doc.text(`Keywords: ${keywords.join(', ')}`, margin, 65);

    // Ajouter chaque capture
    for (let i = 0; i < captures.length; i++) {
      const capture = captures[i];

      doc.addPage();

      // Titre du post
      doc.setFontSize(16);
      doc.text(`Post ${i + 1} of ${captures.length}`, margin, 20);

      let yPosition = 30;

      // Keyword matché
      if (capture.post.matchedKeyword) {
        doc.setFontSize(11);
        doc.setTextColor(16, 185, 129); // Couleur verte
        doc.text(`Keyword: ${capture.post.matchedKeyword}`, margin, yPosition);
        doc.setTextColor(0, 0, 0); // Reset couleur
        yPosition += 10;
      }

      // Date du post
      if (capture.post.date) {
        doc.setFontSize(11);
        doc.text(`Date: ${capture.post.date}`, margin, yPosition);
        yPosition += 10;
      }

      // Texte du post (5 lignes max)
      if (capture.post.text) {
        doc.setFontSize(10);
        const textLines = doc.splitTextToSize(capture.post.text, contentWidth);

        const maxLines = 5;
        const displayLines = textLines.slice(0, maxLines);
        doc.text(displayLines, margin, yPosition);
        yPosition += displayLines.length * 5 + 10;

        if (textLines.length > maxLines) {
          doc.setFontSize(9);
          doc.text('...', margin, yPosition);
          yPosition += 10;
        }
      }

      // URL du post
      if (capture.post.post_url) {
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text(`URL: ${capture.post.post_url}`, margin, yPosition);
        doc.setTextColor(0, 0, 0);
        yPosition += 10;
      }

      // Image du screenshot
      if (capture.dataUrl) {
        try {
          const imgData = capture.dataUrl;
          const imgWidth = contentWidth;
          const imgHeight = pageHeight - yPosition - margin;

          // Ajouter l'image avec compression FAST
          doc.addImage(
            imgData,
            'JPEG',
            margin,
            yPosition,
            imgWidth,
            imgHeight,
            '',
            'FAST'
          );
        } catch (imgError) {
          console.error(`[Background] Error adding image for capture ${i}:`, imgError);
          doc.setFontSize(10);
          doc.text('(Screenshot could not be added)', margin, yPosition);
        }
      }

      console.log(`[Background] Added capture ${i + 1}/${captures.length} to PDF`);
    }

    // Télécharger le PDF
    const filename = generateFilename(batchNumber);
    const pdfBlob = doc.output('blob');

    // Convertir blob en data URL et attendre le téléchargement
    await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const dataUrl = reader.result;

          const downloadId = await chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: false
          });

          console.log(`[Background] ✓ PDF download started: ${filename} (ID: ${downloadId})`);

          // Attendre que le téléchargement soit terminé
          const checkDownload = () => {
            chrome.downloads.search({ id: downloadId }, (downloads) => {
              if (downloads && downloads.length > 0) {
                const download = downloads[0];
                if (download.state === 'complete') {
                  console.log(`[Background] ✓ PDF downloaded successfully: ${filename}`);
                  resolve();
                } else if (download.state === 'interrupted') {
                  console.error(`[Background] PDF download failed: ${filename}`);
                  reject(new Error('Download interrupted'));
                } else {
                  // Encore en cours, vérifier à nouveau
                  setTimeout(checkDownload, 500);
                }
              } else {
                reject(new Error('Download not found'));
              }
            });
          };

          checkDownload();

        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

  } catch (error) {
    console.error(`[Background] Error generating PDF:`, error);
    throw error;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] Extension installed');
});
