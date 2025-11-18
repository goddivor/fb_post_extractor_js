# Facebook Post Extractor - JavaScript Simple

Extension Chrome 100% JavaScript (pas de TypeScript, pas de build) pour extraire les posts Facebook.

## 🚀 Installation

1. **Ouvrir Chrome**
   - Aller sur `chrome://extensions/`
   - Activer le "Mode développeur" (coin supérieur droit)

2. **Charger l'extension**
   - Cliquer sur "Charger l'extension non empaquetée"
   - Sélectionner le dossier `fb_post_extractor_js`

3. **C'est prêt !**

## 📖 Utilisation

1. **Aller sur un profil Facebook**
   - Exemple: `https://www.facebook.com/username`
   - Vous devez être connecté

2. **Cliquer sur l'icône de l'extension**
   - Un popup s'ouvre

3. **Configurer et extraire**
   - Entrer le nombre de posts (0 = tous)
   - Cliquer sur "Extract Posts"
   - Attendre...

4. **Télécharger les résultats**
   - Cliquer sur "Download JSON"
   - Fichier sauvegardé !

## 🐛 Debug

Pour voir les logs:
1. Ouvrir les DevTools (F12)
2. Onglet "Console"
3. Tous les logs sont affichés

## 📁 Structure

```
fb_post_extractor_js/
├── manifest.json      # Configuration
├── popup.html         # Interface popup
├── popup.js           # Logique popup
├── content.js         # Script d'extraction
└── background.js      # Service worker
```

## ⚠️ Notes

- Pas de compilation nécessaire
- Tout est en JavaScript pur
- Facile à debugger
- Simple à modifier
# fb_post_extractor_js
