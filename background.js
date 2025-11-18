console.log('Facebook Post Extractor - Background Script Loaded');

// Optionnel: pour gérer des événements globaux si nécessaire
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed');
});
