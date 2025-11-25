// Ce script s'exécute dans le contexte de la page Facebook
(function() {
  try {
    let asyncParams = null;
    let fb_dtsg = null;
    let user_id = null;
    let lsd = null;

    // Méthode PRINCIPALE: getAsyncParams (donne TOUS les bons paramètres)
    if (typeof window.require !== 'undefined') {
      try {
        const getAsyncParams = window.require('getAsyncParams');
        if (getAsyncParams && typeof getAsyncParams === 'function') {
          asyncParams = getAsyncParams('POST');
          console.log('Got asyncParams:', asyncParams);

          if (asyncParams) {
            fb_dtsg = asyncParams.fb_dtsg;
            user_id = asyncParams.__user;
            lsd = asyncParams.lsd;
          }
        }
      } catch (e) {
        console.log('getAsyncParams failed:', e);
      }

      // Fallback: DTSGInitialData
      if (!fb_dtsg) {
        try {
          const DTSGInitialData = window.require('DTSGInitialData');
          if (DTSGInitialData && DTSGInitialData.token) {
            fb_dtsg = DTSGInitialData.token;
          }
        } catch (e) {}
      }

      // Fallback: CurrentUserInitialData
      if (!user_id) {
        try {
          const CurrentUserInitialData = window.require('CurrentUserInitialData');
          if (CurrentUserInitialData && CurrentUserInitialData.USER_ID) {
            user_id = CurrentUserInitialData.USER_ID;
          }
        } catch (e) {}
      }
    }

    // Méthode 2: Chercher dans le HTML
    if (!fb_dtsg) {
      const htmlContent = document.documentElement.innerHTML;
      const dtsgMatch = htmlContent.match(/"DTSGInitialData"[^}]*"token":"([^"]+)"/);
      if (dtsgMatch && dtsgMatch[1]) {
        fb_dtsg = dtsgMatch[1];
      }
    }

    // User ID depuis cookie
    if (!user_id) {
      const userIdMatch = document.cookie.match(/c_user=(\d+)/);
      if (userIdMatch) {
        user_id = userIdMatch[1];
      }
    }

    // Récupérer l'ID du profil actuel (celui qu'on visite)
    let profileId = null;

    try {
      // Méthode 0: ProfileCometTimelineFeedQueryRelayPreloader (PRIORITAIRE - très fiable)
      if (!profileId) {
        try {
          const regex = /"adp_ProfileCometTimelineFeedQueryRelayPreloader_[\w.]+",({.*}})]/g;
          const text = document.body.textContent;
          let match;
          const results = [];

          while ((match = regex.exec(text)) !== null) {
            try {
              const parsed = JSON.parse(match[1]).__bbox.result;
              results.push(parsed);
            } catch (e) {
              // Ignore parsing errors
            }
          }

          if (results.length > 0) {
            // L'ID peut être soit directement dans results[0].id soit dans results[0].data.user.id
            const extractedId = results[0]?.id || results[0]?.data?.user?.id;
            if (extractedId && /^\d+$/.test(extractedId)) {
              profileId = extractedId;
              console.log('Got profile ID from ProfileCometTimelineFeedQueryRelayPreloader:', profileId);
            }
          }
        } catch (e) {
          console.log('ProfileCometTimelineFeedQueryRelayPreloader extraction failed:', e);
        }
      }

      // Méthode 1: Vérifier si l'URL contient un ID numérique
      if (!profileId) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get('id');
        if (urlId && /^\d+$/.test(urlId)) {
          profileId = urlId;
          console.log('Got profile ID from URL params:', profileId);
        }
      }

      // Méthode 2: Utiliser require pour obtenir l'ID du profil (le plus fiable)
      if (!profileId && typeof window.require !== 'undefined') {
        try {
          // Essayer d'obtenir les données de routage de Comet
          const RouteParamsHook = window.require('RouteParamsHook');
          if (RouteParamsHook && RouteParamsHook.getRouteParams) {
            const routeParams = RouteParamsHook.getRouteParams();
            if (routeParams && routeParams.id) {
              profileId = routeParams.id;
              console.log('Got profile ID from RouteParamsHook:', profileId);
            }
          }
        } catch (e) {
          console.log('RouteParamsHook failed:', e);
        }
      }

      // Méthode 3: Chercher dans le HTML - patterns spécifiques
      if (!profileId) {
        const html = document.documentElement.innerHTML;

        // Pattern 1: Chercher dans les données de la page profile
        // Format: "userID":"100090485289846"
        const patterns = [
          /"userID":"(\d{10,})"/g,
          /"profile_id":"(\d{10,})"/g,
          /"pageID":"(\d{10,})"/g,
          /"ownerID":"(\d{10,})"/g
        ];

        // Collecter tous les IDs trouvés
        const foundIds = new Set();
        for (const pattern of patterns) {
          let match;
          while ((match = pattern.exec(html)) !== null) {
            if (match[1] && match[1] !== user_id) {
              foundIds.add(match[1]);
            }
          }
        }

        // Si on a trouvé des IDs, prendre le premier (qui n'est pas le user_id)
        if (foundIds.size > 0) {
          profileId = Array.from(foundIds)[0];
          console.log('Got profile ID from HTML patterns:', profileId);
          console.log('All found IDs:', Array.from(foundIds));
        }
      }

      // Méthode 4: Si c'est un username dans l'URL, extraire depuis le pathname
      if (!profileId) {
        const pathname = window.location.pathname;
        const match = pathname.match(/^\/([^\/]+)/);

        if (match && match[1] && /^\d+$/.test(match[1])) {
          profileId = match[1];
          console.log('Got profile ID from pathname:', profileId);
        }
      }
    } catch (e) {
      console.log('Could not get profile ID:', e);
    }

    // Envoyer les données au content script
    window.postMessage({
      type: 'FB_CONTEXT_DATA',
      asyncParams: asyncParams,
      fb_dtsg: fb_dtsg,
      user_id: user_id,
      lsd: lsd,
      profileId: profileId
    }, '*');

    console.log('Sent FB context:', {
      has_asyncParams: !!asyncParams,
      has_dtsg: !!fb_dtsg,
      has_user: !!user_id,
      profileId: profileId
    });

  } catch (error) {
    console.error('Injected script error:', error);
  }
})();
