console.log('Facebook Post Extractor - Content Script Loaded');

// Configuration
const FB_CONTEXT = {
  user_id: '',
  fb_dtsg: '',
  doc_id: '25011764728445626',
  asyncParams: null,  // Tous les paramètres de Facebook
  profileId: null     // ID du profil qu'on visite
};

// Injecter le script dans le contexte de la page
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);
}

// Écouter les messages du script injecté
window.addEventListener('message', function(event) {
  if (event.source !== window) return;

  if (event.data.type === 'FB_CONTEXT_DATA') {
    console.log('Received FB context from injected script:', event.data);

    // Stocker tous les asyncParams
    if (event.data.asyncParams) {
      FB_CONTEXT.asyncParams = event.data.asyncParams;
    }

    if (event.data.fb_dtsg) {
      FB_CONTEXT.fb_dtsg = event.data.fb_dtsg;
    }
    if (event.data.user_id) {
      FB_CONTEXT.user_id = event.data.user_id;
    }
    if (event.data.profileId) {
      FB_CONTEXT.profileId = event.data.profileId;
      console.log('Got profile ID from injected script:', event.data.profileId);
    }
  }
});

// Injecter le script au chargement
injectScript();

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractPosts') {
    console.log('[Content] Received extract request:', {
      profileId: request.profileId,
      keywords: request.keywords,
      stopDate: request.stopDate
    });

    extractPosts(request.profileId, request.keywords, request.stopDate)
      .then(result => {
        console.log('[Content] Extraction complete:', result);
        sendResponse({
          success: true,
          totalPosts: result.totalPosts,
          keywordMatches: result.keywordMatches,
          batches: result.batches
        });
      })
      .catch(error => {
        console.error('[Content] Extraction error:', error);
        sendResponse({ success: false, error: error.message });
      });

    return true; // Keep channel open for async response
  }

  if (request.action === 'getProfileId') {
    console.log('Popup requested profile ID, current value:', FB_CONTEXT.profileId);
    sendResponse({ profileId: FB_CONTEXT.profileId || null });
    return false;
  }
});

// Simple keyword matching - case insensitive
function matchKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) {
    return { found: false };
  }

  const lowerText = text.toLowerCase();

  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerText.includes(lowerKeyword)) {
      return {
        found: true,
        matchedKeyword: keyword
      };
    }
  }

  return { found: false };
}

// Fonction principale d'extraction avec batch processing
async function extractPosts(profileId, keywords = [], stopDate = null) {
  try {
    console.log('[Extractor] Starting extraction...');
    console.log('[Extractor] Profile ID:', profileId);
    console.log('[Extractor] Keywords:', keywords);
    console.log('[Extractor] Stop Date:', stopDate);

    // Convertir stopDate en timestamp
    let stopTimestamp = null;
    if (stopDate) {
      const stopDateObj = new Date(stopDate);
      stopDateObj.setHours(0, 0, 0, 0);
      stopTimestamp = Math.floor(stopDateObj.getTime() / 1000);
      console.log('[Extractor] Stop timestamp:', stopTimestamp, '(' + stopDateObj.toISOString() + ')');
    }

    // Initialiser le contexte Facebook
    await initializeFacebookContext();
    console.log('[Extractor] Facebook context initialized');

    // State pour batch processing
    const BATCH_SIZE = 12; // 4 fetches × 3 posts
    let currentBatch = [];
    let batchNumber = 0;
    let totalPostsExtracted = 0;
    let totalKeywordMatches = 0;

    let cursor = null;
    let hasNextPage = true;
    let pageCount = 0;

    while (hasNextPage) {
      pageCount++;
      console.log(`[Extractor] Fetching page ${pageCount}...`);

      // Fetch 3 posts par requête
      const response = await fetchPostsPage(profileId, cursor, 3);

      if (response.posts && response.posts.length > 0) {
        let reachedStopDate = false;

        for (const post of response.posts) {
          // Vérifier si on a atteint la date limite
          if (stopTimestamp && post.creation_time > 0 && post.creation_time < stopTimestamp) {
            console.log(`[Extractor] ✓ Reached stop date! Post date: ${new Date(post.creation_time * 1000).toISOString()}`);
            reachedStopDate = true;
            break;
          }

          totalPostsExtracted++;
          currentBatch.push(post);

          // Traiter le batch quand on atteint 12 posts (4 fetches)
          if (currentBatch.length >= BATCH_SIZE) {
            batchNumber++;
            console.log(`[Extractor] Batch ${batchNumber} ready (${currentBatch.length} posts) - Processing keywords...`);

            // Filtrer les posts qui matchent les keywords
            const matchedPosts = [];
            for (const post of currentBatch) {
              const match = matchKeywords(post.text, keywords);
              if (match.found) {
                matchedPosts.push({
                  ...post,
                  matchedKeyword: match.matchedKeyword
                });
              }
            }

            console.log(`[Extractor] Batch ${batchNumber}: ${matchedPosts.length}/${currentBatch.length} posts matched keywords`);
            totalKeywordMatches += matchedPosts.length;

            // Envoyer au background pour capture et PDF
            if (matchedPosts.length > 0) {
              chrome.runtime.sendMessage({
                action: 'processBatch',
                batchNumber: batchNumber,
                posts: matchedPosts,
                keywords: keywords
              });
            }

            // Réinitialiser le batch
            currentBatch = [];
          }
        }

        console.log(`[Extractor] Fetched ${response.posts.length} posts (total: ${totalPostsExtracted})`);

        if (reachedStopDate) {
          console.log('[Extractor] Stopping extraction: reached stop date');
          break;
        }
      }

      cursor = response.cursor;
      hasNextPage = response.hasNextPage && cursor;

      // Rate limiting
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Traiter le dernier batch (si < 12 posts)
    if (currentBatch.length > 0) {
      batchNumber++;
      console.log(`[Extractor] Final batch ${batchNumber} (${currentBatch.length} posts) - Processing keywords...`);

      const matchedPosts = [];
      for (const post of currentBatch) {
        const match = matchKeywords(post.text, keywords);
        if (match.found) {
          matchedPosts.push({
            ...post,
            matchedKeyword: match.matchedKeyword
          });
        }
      }

      console.log(`[Extractor] Final batch ${batchNumber}: ${matchedPosts.length}/${currentBatch.length} posts matched keywords`);
      totalKeywordMatches += matchedPosts.length;

      if (matchedPosts.length > 0) {
        chrome.runtime.sendMessage({
          action: 'processBatch',
          batchNumber: batchNumber,
          posts: matchedPosts,
          keywords: keywords
        });
      }
    }

    console.log(`[Extractor] Extraction complete!`);
    console.log(`[Extractor] - Total posts: ${totalPostsExtracted}`);
    console.log(`[Extractor] - Keyword matches: ${totalKeywordMatches}`);
    console.log(`[Extractor] - Batches processed: ${batchNumber}`);

    // Ne pas fermer la window ici - le background le fera automatiquement
    // quand tous les batches auront été traités

    // Retourner un résumé (pas tous les posts pour économiser la mémoire)
    return {
      success: true,
      totalPosts: totalPostsExtracted,
      keywordMatches: totalKeywordMatches,
      batches: batchNumber
    };
  } catch (error) {
    console.error('[Extractor] Error:', error);
    throw error;
  }
}

// Initialiser le contexte Facebook (tokens)
async function initializeFacebookContext() {
  try {
    // Attendre que le script injecté récupère les données
    // Si déjà récupérées, continuer
    if (!FB_CONTEXT.fb_dtsg || !FB_CONTEXT.user_id) {
      console.log('Waiting for FB context...');
      // Attendre max 5 secondes
      for (let i = 0; i < 50; i++) {
        if (FB_CONTEXT.fb_dtsg && FB_CONTEXT.user_id) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!FB_CONTEXT.fb_dtsg) {
      throw new Error('Could not find fb_dtsg token. Make sure you are logged in to Facebook.');
    }

    if (!FB_CONTEXT.user_id) {
      throw new Error('Could not find user ID. Make sure you are logged in to Facebook.');
    }

    console.log('Context initialized:', {
      user_id: FB_CONTEXT.user_id,
      has_dtsg: !!FB_CONTEXT.fb_dtsg,
      dtsg_length: FB_CONTEXT.fb_dtsg.length
    });
  } catch (error) {
    console.error('initializeFacebookContext error:', error);
    throw error;
  }
}

// Extraire l'ID du profil depuis l'URL
function extractProfileIdFromUrl(url) {
  try {
    const urlObj = new URL(url);

    // Format: facebook.com/profile.php?id=123456789
    const idParam = urlObj.searchParams.get('id');
    if (idParam) return idParam;

    // Format: facebook.com/username
    const pathname = urlObj.pathname;
    const match = pathname.match(/^\/([^\/]+)/);
    if (match && match[1] !== 'profile.php') {
      return match[1];
    }

    return null;
  } catch (e) {
    console.error('extractProfileIdFromUrl error:', e);
    return null;
  }
}

// Récupérer une page de posts via GraphQL
async function fetchPostsPage(profileId, cursor = null, count = 3) {
  try {
    const variables = {
      afterTime: null,
      beforeTime: null,
      count: 3,
      feedLocation: 'TIMELINE',
      feedbackSource: 0,
      focusCommentID: null,
      memorializedSplitTimeFilter: null,
      omitPinnedPost: true,
      postedBy: null,
      privacy: null,
      privacySelectorRenderLocation: 'COMET_STREAM',
      renderLocation: 'timeline',
      scale: 1,
      stream_count: 3,
      taggedInOnly: null,
      useDefaultActor: false,
      id: profileId,
      // Ajouter tous les relay providers requis
      __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
      __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
      __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: true,
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__TestPilotShouldIncludeDemoAdUseCaserelayprovider: false,
      __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
      __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
      __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
      __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
      __relay_internal__pv__IsMergQAPollsrelayprovider: false,
      __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
      __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
      __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
      __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
      __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
      __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
      __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
      __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 206,
      __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false
    };

    if (cursor) {
      variables.cursor = cursor;
    }

    // Utiliser asyncParams si disponible (meilleure méthode)
    let bodyParams;
    if (FB_CONTEXT.asyncParams) {
      // Copier tous les asyncParams
      bodyParams = { ...FB_CONTEXT.asyncParams };
      // Ajouter les paramètres spécifiques à GraphQL
      bodyParams.fb_api_caller_class = 'RelayModern';
      bodyParams.fb_api_req_friendly_name = 'ProfileCometTimelineFeedRefetchQuery';
      bodyParams.server_timestamps = 'true';
      bodyParams.variables = JSON.stringify(variables);
      bodyParams.doc_id = FB_CONTEXT.doc_id;
    } else {
      // Fallback: construire manuellement
      bodyParams = {
        av: FB_CONTEXT.user_id,
        __user: FB_CONTEXT.user_id,
        __a: '1',
        __req: '1',
        __comet_req: '15',
        fb_dtsg: FB_CONTEXT.fb_dtsg,
        jazoest: '25441',
        lsd: 'AVrPj4Zw',
        fb_api_caller_class: 'RelayModern',
        fb_api_req_friendly_name: 'ProfileCometTimelineFeedRefetchQuery',
        server_timestamps: 'true',
        variables: JSON.stringify(variables),
        doc_id: FB_CONTEXT.doc_id
      };
    }

    const body = new URLSearchParams(bodyParams);

    const response = await fetch('https://www.facebook.com/api/graphql/', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': '*/*'
      },
      body: body.toString(),
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    // Facebook renvoie plusieurs JSON séparés par des newlines
    let responseText = await response.text();

    console.log('Response text length:', responseText.length);

    // Nettoyer la réponse - Facebook peut ajouter plusieurs préfixes
    responseText = responseText.trim();

    // Enlever "for (;;);"
    if (responseText.startsWith('for (;;);')) {
      responseText = responseText.substring(9);
    }

    // Enlever d'autres préfixes possibles
    const prefixes = ['for(;;);', 'while(1);', 'while(true);'];
    for (const prefix of prefixes) {
      if (responseText.startsWith(prefix)) {
        responseText = responseText.substring(prefix.length);
        break;
      }
    }

    responseText = responseText.trim();

    // Facebook renvoie plusieurs objets JSON (un pour les données, un pour page_info)
    const lines = responseText.split('\n').filter(line => line.trim());
    console.log(`Found ${lines.length} JSON objects in response`);

    // Parser tous les objets JSON
    const jsonObjects = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        console.error('Failed to parse JSON line:', e);
        return null;
      }
    }).filter(obj => obj !== null);

    console.log(`Successfully parsed ${jsonObjects.length} JSON objects`);

    // Le premier objet contient les données principales
    const data = jsonObjects[0];

    // Chercher page_info dans les autres objets
    let pageInfo = null;
    for (const obj of jsonObjects) {
      if (obj.data?.page_info) {
        pageInfo = obj.data.page_info;
        console.log('Found page_info in additional JSON object:', pageInfo);
        break;
      }
    }

    if (data.errors && data.errors.length > 0) {
      console.error('GraphQL errors:', data.errors);
      throw new Error('GraphQL returned errors');
    }

    // Parser la réponse
    const edges = data.data?.node?.timeline_list_feed_units?.edges || [];

    // Utiliser le pageInfo extrait des objets JSON séparés, sinon celui du data principal
    if (!pageInfo) {
      pageInfo = data.data?.node?.timeline_list_feed_units?.page_info;
    }

    console.log(`Received ${edges.length} edges from GraphQL`);
    console.log('Page info:', pageInfo);

    const posts = edges
      .map(edge => {
        const post = extractPostData(edge.node);
        if (!post) {
          console.log('Failed to extract post from edge:', edge.node?.__typename || 'unknown type');
        }
        return post;
      })
      .filter(post => post !== null);

    console.log(`Successfully parsed ${posts.length} posts from ${edges.length} edges`);

    const lastCursor = edges.length > 0 ? edges[edges.length - 1].cursor : null;
    const nextCursor = pageInfo?.end_cursor || lastCursor;
    const hasNextPage = pageInfo?.has_next_page ?? (edges.length === count);

    console.log('Cursor info:', { lastCursor, nextCursor, hasNextPage });

    return {
      posts: posts,
      cursor: hasNextPage ? nextCursor : null,
      hasNextPage: hasNextPage
    };
  } catch (error) {
    console.error('fetchPostsPage error:', error);
    throw error;
  }
}

// Extraire les données d'un post
function extractPostData(node) {
  try {
    if (!node || !node.id) return null;

    const contentStory = node.comet_sections?.content?.story;
    const contextStory = node.comet_sections?.context_layout?.story;

    // Texte du post
    const text = contentStory?.message?.text || node.message?.text || '';

    // Date de création
    const creationTime = contentStory?.creation_time ||
                        contextStory?.comet_sections?.metadata?.[0]?.story?.creation_time ||
                        0;

    // URL du post
    const postUrl = contentStory?.wwwURL ||
                   contextStory?.comet_sections?.metadata?.[0]?.story?.url ||
                   '';

    // Auteur
    const actors = contentStory?.actors || node.actors || [];
    let author = null;

    if (actors.length > 0) {
      const firstActor = actors[0];
      author = {
        id: firstActor.id,
        name: firstActor.name,
        profile_url: firstActor.url || '',
        profile_picture: firstActor.profile_picture?.uri || ''
      };
    }

    if (!author && node.feedback?.owning_profile) {
      const owner = node.feedback.owning_profile;
      author = {
        id: owner.id,
        name: owner.name,
        profile_url: '',
        profile_picture: ''
      };
    }

    // Attachments (photos et vidéos)
    const attachments = [];
    let rawAttachments = [];

    // Détection des reposts: si node.attached_story existe, c'est un repost
    if (node.attached_story) {
      // Pour les reposts, les attachments sont dans attached_story.comet_sections.attached_story.story.attached_story.comet_sections.attached_story_layout.story.attachments
      try {
        const attachedStorySection = node.comet_sections?.content?.story?.comet_sections?.attached_story?.story?.attached_story;
        const attachedStoryLayout = attachedStorySection?.comet_sections?.attached_story_layout?.story;

        if (attachedStoryLayout?.attachments && attachedStoryLayout.attachments.length > 0) {
          rawAttachments.push(...attachedStoryLayout.attachments);
          console.log('Found attachments in repost:', rawAttachments.length);
        }
      } catch (e) {
        console.log('Error extracting repost attachments:', e);
      }
    } else {
      // Posts normaux: essayer contentStory.attachments et node.attachments
      if (contentStory?.attachments && contentStory.attachments.length > 0) {
        rawAttachments.push(...contentStory.attachments);
      }

      if (node.attachments && node.attachments.length > 0) {
        rawAttachments.push(...node.attachments);
      }
    }

    rawAttachments.forEach(attachment => {
      // Ignorer les attachments vides (juste action_links sans media)
      if (!attachment.styles && !attachment.media) {
        return;
      }
      // Cas 1: Album avec plusieurs photos (all_subattachments)
      if (attachment.styles?.attachment?.all_subattachments) {
        const subattachments = attachment.styles.attachment.all_subattachments.nodes || [];
        subattachments.forEach(sub => {
          const media = sub.media;
          if (media && media.__typename === 'Photo') {
            const photoImage = media.viewer_image || media.photo_image;
            if (photoImage && photoImage.uri) {
              attachments.push({
                type: 'photo',
                url: photoImage.uri,
                width: photoImage.width,
                height: photoImage.height
              });
            }
          }
        });
      }
      // Cas 2: Photo unique ou Vidéo
      else {
        const media = attachment.styles?.attachment?.media || attachment.media;

        // Photo unique
        if (media && media.__typename === 'Photo') {
          const photoImage = media.photo_image || media.viewer_image;
          if (photoImage && photoImage.uri) {
            attachments.push({
              type: 'photo',
              url: photoImage.uri,
              width: photoImage.width,
              height: photoImage.height
            });
          }
        }

        // Vidéo
        if (media && media.__typename === 'Video') {
          const thumbnailImage = media.thumbnailImage || media.preferred_thumbnail?.image;
          const videoUrl = media.url || media.permalink_url;

          if (videoUrl) {
            attachments.push({
              type: 'video',
              url: videoUrl,
              thumbnail: thumbnailImage?.uri || null,
              width: media.width || media.original_width,
              height: media.height || media.original_height,
              duration: media.playable_duration_in_ms ? Math.floor(media.playable_duration_in_ms / 1000) : null
            });
          }
        }
      }
    });

    return {
      id: node.id,
      post_id: node.post_id || node.id,
      text: text,
      creation_time: creationTime,
      date: creationTime ? new Date(creationTime * 1000).toISOString() : '',
      author: author,
      attachments: attachments,
      post_url: postUrl
    };
  } catch (error) {
    console.error('extractPostData error:', error, node);
    return null;
  }
}
