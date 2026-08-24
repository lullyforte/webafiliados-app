
    const API = 'https://webafiliados-backend-production.up.railway.app';
    let SESSION = null;
    let IS_ADMIN = false;
    let heroTimer = null;
    let heroIndex = 0;
    let heroSlides = [];

    // ── SUB-CONTAS ──
    let _subAccounts = [];         // lista completa carregada do backend
    let _activeSubAccount = null;  // objeto { id, name, shopee_app_id, ... }

    function _saveActiveSubAccount(sub) {
      _activeSubAccount = sub;
      try { sessionStorage.setItem('wa_active_sub', JSON.stringify(sub)); } catch(e) {}
      _updateSubAccountChip();
    }

    function _loadActiveSubAccount() {
      try {
        const s = sessionStorage.getItem('wa_active_sub');
        if (s) _activeSubAccount = JSON.parse(s);
      } catch(e) {}
    }

    function _updateSubAccountChip() {
      const chip = document.getElementById('subAccountChip');
      const name = document.getElementById('subAccountChipName');
      if (!chip || !name) return;
      if (_activeSubAccount) {
        chip.style.display = 'flex';
        name.textContent = _activeSubAccount.name || '—';
      } else {
        chip.style.display = 'none';
      }
    }

    async function _ensureSubAccounts() {
      if (_subAccounts.length > 0) return;
      if (!SESSION) return;
      // Tenta ate 3 vezes antes de desistir (rede instavel, token momentaneo)
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(API + '/api/subaccounts', {
            headers: { 'Authorization': 'Bearer ' + SESSION.token }
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const data = await res.json();
          _subAccounts = data.subAccounts || [];
          // define ativa: tenta recuperar da sessao, senao usa a primeira
          _loadActiveSubAccount();
          if (!_activeSubAccount && _subAccounts.length > 0) {
            _saveActiveSubAccount(_subAccounts[0]);
          } else if (_activeSubAccount) {
            const fresh = _subAccounts.find(s => s.id === _activeSubAccount.id);
            if (fresh) _saveActiveSubAccount(fresh);
          }
          return; // sucesso, sai do loop
        } catch(e) {
          console.warn('sub-contas tentativa ' + attempt + ':', e);
          if (attempt < 3) await new Promise(r => setTimeout(r, 1500));
        }
      }
      console.error('sub-contas: falhou apos 3 tentativas');
    }

    function toggleSubAccountDropdown() {
      const dd = document.getElementById('subAccountDropdown');
      const ov = document.getElementById('subAccountDropdownOverlay');
      if (dd.classList.contains('open')) {
        closeSubAccountDropdown();
      } else {
        dd.classList.add('open');
        ov.style.display = 'block';
        // garante que sub-contas foram carregadas antes de renderizar
        _ensureSubAccounts().then(() => _renderSubAccountDropdown());
      }
    }

    function closeSubAccountDropdown() {
      document.getElementById('subAccountDropdown').classList.remove('open');
      document.getElementById('subAccountDropdownOverlay').style.display = 'none';
    }

    function _renderSubAccountDropdown() {
      const list = document.getElementById('subAccountDropdownList');
      if (!_subAccounts.length) {
        list.innerHTML = '<div style="padding:8px 12px;font-size: 13.5px;color:var(--text-faint);">Nenhuma sub-conta encontrada.</div>';
        return;
      }
      list.innerHTML = _subAccounts.map(sub => {
        const isActive = _activeSubAccount && _activeSubAccount.id === sub.id;
        const initial = (sub.name || '?')[0].toUpperCase();
        return `
          <div class="sub-account-dropdown-item ${isActive ? 'active' : ''}" onclick="selectSubAccount(${sub.id})">
            <div class="sub-account-dropdown-avatar ${isActive ? '' : 'inactive'}">${initial}</div>
            <div class="sub-account-dropdown-info">
              <div class="sub-account-dropdown-name">${escapeHtml(sub.name)}</div>
              <div class="sub-account-dropdown-status">${sub.shopee_app_id ? 'API configurada ' : 'API pendente'}</div>
            </div>
            ${isActive ? '<span class="sub-account-dropdown-check"></span>' : ''}
          </div>
        `;
      }).join('');
    }

    function selectSubAccount(subId) {
      const sub = _subAccounts.find(s => s.id === subId);
      if (sub) _saveActiveSubAccount(sub);
      closeSubAccountDropdown();
    }

    function openNewSubAccountModal() {
      document.getElementById('newSubAccountName').value = '';
      const st = document.getElementById('newSubAccountStatus');
      st.style.display = 'none';
      document.getElementById('newSubAccountModal').classList.add('open');
      setTimeout(() => document.getElementById('newSubAccountName').focus(), 200);
    }

    function closeNewSubAccountModal() {
      document.getElementById('newSubAccountModal').classList.remove('open');
    }

    async function createNewSubAccount() {
      const name = document.getElementById('newSubAccountName').value.trim();
      const btn = document.getElementById('newSubAccountBtn');
      const st = document.getElementById('newSubAccountStatus');
      if (!name) { showStatus(st, 'Digite um nome para a sub-conta.', 'err'); return; }
      btn.disabled = true;
      btn.textContent = 'Criando...';
      try {
        const res = await fetch(API + '/api/subaccounts', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar sub-conta');
        // força recarregar lista
        _subAccounts = [];
        await _ensureSubAccounts();
        // seleciona a nova automaticamente
        const nova = _subAccounts.find(s => s.name === name) || _subAccounts[_subAccounts.length - 1];
        if (nova) _saveActiveSubAccount(nova);
        closeNewSubAccountModal();
        // atualiza a lista na tela Conta se estiver aberta
        if (document.getElementById('accountSection').style.display !== 'none') {
          renderSubAccountList();
        }
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Criar sub-conta';
      }
    }

    async function renderSubAccountList() {
      const list = document.getElementById('subAccountList');
      if (!list) return;
      list.innerHTML = '<div class="loading" style="padding:20px 0;">Carregando...</div>';
      await _ensureSubAccounts();
      if (!_subAccounts.length) {
        list.innerHTML = '<div class="status info" style="display:block;">Nenhuma sub-conta encontrada.</div>';
        return;
      }
      list.innerHTML = _subAccounts.map(sub => {
        const isActive = _activeSubAccount && _activeSubAccount.id === sub.id;
        const initial = (sub.name || '?')[0].toUpperCase();
        const hasApi = !!sub.shopee_app_id;
        return `
          <div class="subaccount-item ${isActive ? 'active' : ''}" onclick="selectSubAccount(${sub.id}); renderSubAccountList();">
            <div class="subaccount-avatar ${isActive ? '' : 'inactive'}">${initial}</div>
            <div class="subaccount-info">
              <div class="subaccount-name">${escapeHtml(sub.name)}</div>
              <div class="subaccount-meta ${hasApi ? 'ok' : 'warn'}">${hasApi ? 'API configurada ' : 'API Shopee pendente'}</div>
            </div>
            ${isActive ? '<span class="subaccount-badge">ATIVA</span>' : '<span class="subaccount-arrow">›</span>'}
          </div>
        `;
      }).join('');
    }

    function urlB64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    function getSession() {
      const saved = localStorage.getItem('wa_session');
      if (!saved) return null;
      try { return JSON.parse(saved); } catch(e) { return null; }
    }

    function goHome() {
      if (SESSION) {
        showDash();
      } else {
        hideAllCards();
        document.getElementById('loginSection').style.display = 'block';
      }
    }

    function hideAllCards() {
      ['loginSection','registerSection','dashSection','accountSection','pushSection','promptSection','packageSection','uploadSection','settingsMenuSection','settingsSection','apiAfiliadoSection','onboardingSection','aiSettingsSection','pincarAnuncioSection','searchNowSection','aiEditSection','promptsListSection','promptDetailSection','anuncioExpressSection','videosPublicadosSection','videoCreatorSection','appsSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });
      document.getElementById('bottomNav').style.display = 'none';
      document.getElementById('headerActions').style.display = 'none';
    }

    function setActiveNav(id) {
      ['navInicio','navExplorar','navVideoIA','navProjetos','navVoce'].forEach(n => {
        const el = document.getElementById(n);
        if (el) el.classList.remove('active');
      });
      if (id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
    }

    window.addEventListener('load', async () => {
      if ('serviceWorker' in navigator) {
        try {
          await navigator.serviceWorker.register('./sw.js');
        } catch(e) {
          console.warn('SW erro:', e.message);
        }
      }

      SESSION = getSession();

      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      const inviteCode = params.get('invite');

      // Se tem código de convite na URL, abre tela de cadastro
      if (inviteCode) {
        hideAllCards();
        document.getElementById('registerSection').style.display = 'block';
        setTimeout(() => {
          const el = document.getElementById('regCodeInput');
          if (el) el.value = inviteCode;
        }, 100);
        return;
      }

      if (view === 'prompt') {
        renderPromptView(params);
        return;
      }

      if (view === 'package') {
        renderPackageView(params);
        return;
      }

      if (view === 'upload') {
        if (SESSION) {
          showUploadScreen();
        } else {
          hideAllCards();
          document.getElementById('loginSection').style.display = 'block';
        }
        return;
      }

      if (SESSION) {
        // Antes de confiar no token salvo, valida ele com o servidor. Sem
        // isso, um token expirado (dias parado) fazia o app pular direto
        // pro dashboard achando que estava logado, e só quebrava depois,
        // com "Token inválido ou expirado" em telas espalhadas pelo app —
        // uma experiência confusa. Agora, se o token não for mais válido,
        // a sessão é limpa e a tela de login aparece normalmente.
        const tokenValido = await _validarSessao();
        if (!tokenValido) {
          SESSION = null;
          localStorage.removeItem('wa_session');
          document.body.classList.add('pre-login');
        } else {
          document.body.classList.remove('pre-login');
          await _ensureSubAccounts();
          // Tenta restaurar tela do prompt somente apos carregar sub-contas
          if (_subAccounts.length > 0 && restorePromptIfNeeded()) return;
          _goToDashOrOnboarding();
        }
      } else {
        document.body.classList.add('pre-login');
      }
    });

    // Faz uma checagem leve e rapida do token salvo contra o servidor.
    // Retorna true se o token ainda e valido, false caso contrario
    // (expirado, revogado, ou erro de rede tratado como invalido por
    // seguranca — evita deixar o usuario preso numa tela quebrada).
    async function _validarSessao() {
      try {
        const res = await fetch(API + '/api/affiliates/me', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        return res.ok;
      } catch (e) {
        return false;
      }
    }

    function renderPromptView(params) {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Vídeo pronto para gerar';
      document.getElementById('promptSection').style.display = 'block';
      const text = params.get('text') || '(prompt vazio)';
      document.getElementById('promptText').textContent = decodeURIComponent(text);
      window._currentPrompt = decodeURIComponent(text);

      const imageParam = params.get('image');
      const imageUrl = imageParam ? decodeURIComponent(imageParam) : '';
      window._currentProductImage = imageUrl;
      const imgEl = document.getElementById('promptProductImage');
      if (imageUrl) {
        imgEl.src = imageUrl;
        imgEl.style.display = 'block';
      } else {
        imgEl.style.display = 'none';
      }

      // Lê packageId da URL e mostra seção de envio de vídeo
      const packageId = params.get('packageId');
      window._currentPackageId = packageId || null;
      const uploadSection = document.getElementById('promptUploadSection');
      if (uploadSection) uploadSection.style.display = packageId ? 'block' : 'none';

      // Ler narration da URL e mostrar secao
      const narrationParam = params.get('narration');
      const narrationText = narrationParam ? decodeURIComponent(narrationParam) : '';
      window._currentNarration = narrationText;
      const narrationSection = document.getElementById('promptNarrationSection');
      const narrationEl = document.getElementById('promptNarrationText');
      if (narrationSection && narrationEl && narrationText) {
        narrationEl.textContent = narrationText;
        narrationSection.style.display = 'block';
      } else if (narrationSection) {
        narrationSection.style.display = 'none';
      }

      // Salva estado no localStorage para restaurar mesmo apos login
      try {
        localStorage.setItem('wa_prompt_state', JSON.stringify({
          text: window._currentPrompt,
          image: imageUrl,
          packageId: packageId || null,
          narration: narrationText,
          savedAt: Date.now()
        }));
      } catch(e) {}
    }

    function restorePromptIfNeeded() {
      try {
        const saved = localStorage.getItem('wa_prompt_state');
        if (!saved) return false;
        const state = JSON.parse(saved);
        if (!state.text || state.text === '(prompt vazio)') return false;
        // Expira apos 2 horas
        if (state.savedAt && Date.now() - state.savedAt > 2 * 60 * 60 * 1000) {
          localStorage.removeItem('wa_prompt_state');
          return false;
        }
        const fakeParams = new URLSearchParams();
        fakeParams.set('text', state.text);
        if (state.image) fakeParams.set('image', state.image);
        if (state.packageId) fakeParams.set('packageId', state.packageId);
        if (state.narration) fakeParams.set('narration', state.narration);
        renderPromptView(fakeParams);
        return true;
      } catch(e) { return false; }
    }

    function clearPromptState() {
      try { localStorage.removeItem('wa_prompt_state'); } catch(e) {}
    }

    // ── PADRÃO ÚNICO DE CÓPIA: PROMPT + NARRAÇÃO + IMAGEM ──────────────────
    // Usado por TODOS os fluxos que geram prompt de vídeo (renderPromptView,
    // renderSingleUpload, showPromptDetail, Criador de Vídeo IA). Cada tela
    // só precisa preencher window._currentPrompt / _currentNarration /
    // _currentProductImage antes de chamar esta função, passando o id do
    // seu próprio elemento de status.
    function copyPromptAndImageCore(statusElId) {
      const st = document.getElementById(statusElId);
      const narration = window._currentNarration || '';
      const promptBlock = narration
        ? (window._currentPrompt || '') + '\n\nNarração: ' + narration
        : (window._currentPrompt || '');
      navigator.clipboard.writeText(promptBlock)
        .then(() => {
          if (window._currentProductImage) {
            openImageModal(window._currentProductImage);
            showStatus(st, 'Prompt + narração copiados! Salve a imagem abaixo.', 'ok');
          } else {
            showStatus(st, 'Prompt + narração copiados!', 'ok');
          }
        })
        .catch(() => showStatus(st, 'Não foi possível copiar. Selecione o texto manualmente.', 'err'));
    }

    function copyPromptAndImage() {
      copyPromptAndImageCore('promptStatus');
    }

    function openImageModal(imageUrl) {
      const modal = document.getElementById('imageModal');
      const img = document.getElementById('modalProductImage');
      const btn = document.getElementById('modalSaveBtn');
      if (!modal || !img || !btn) return;
      img.src = imageUrl;
      btn.href = imageUrl;
      modal.style.display = 'flex';
    }

    function closeImageModal() {
      const modal = document.getElementById('imageModal');
      if (modal) modal.style.display = 'none';
    }

    function copyNarration() {
      const st = document.getElementById('narrationStatus');
      navigator.clipboard.writeText(window._currentNarration || '')
        .then(() => showStatus(st, 'Narracao copiada!', 'ok'))
        .catch(() => showStatus(st, 'Nao foi possivel copiar.', 'err'));
    }

    function openYoutubeCreate() {
      const ua = navigator.userAgent || navigator.vendor || window.opera;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      const isAndroid = /android/i.test(ua);
      if (isIOS) {
        window.open('https://apps.apple.com/br/app/youtube-create/id6476327393', '_blank');
      } else if (isAndroid) {
        window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.youtube.producer', '_blank');
      } else {
        window.open('https://www.youtube.com/creators/create/youtube-create-app/', '_blank');
      }
    }

    function openGemini() {
      const ua = navigator.userAgent || navigator.vendor || window.opera;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
      const isAndroid = /android/i.test(ua);
      if (isIOS) {
        window.open('https://apps.apple.com/us/app/google-gemini/id6477489729', '_blank');
      } else if (isAndroid) {
        window.open('https://play.google.com/store/apps/details?id=com.google.android.apps.bard', '_blank');
      } else {
        window.open('https://gemini.google.com', '_blank');
      }
    }

    function openGoogleVids() {
      window.open('https://vids.google.com', '_blank');
    }

    // Confirma que o vídeo já foi gerado e publicado pelo afiliado, sem
    // exigir upload de arquivo MP4 — o vídeo em si nunca era reaproveitado
    // pelo sistema, servia só de gatilho para o Push 2. Usada nos 3 fluxos
    // de criação (push1, push2, Criador de Vídeo).
    async function confirmVideoPronto(videoId, btnId, statusId) {
      const btn = document.getElementById(btnId);
      const st = document.getElementById(statusId);
      if (!videoId) {
        showStatus(st, 'Vídeo não identificado. Tente novamente.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Confirmando...';
      showStatus(st, 'Confirmando vídeo pronto...', 'info');
      try {
        const res = await fetch(API + '/api/video/' + videoId + '/confirm-ready', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao confirmar vídeo.');
        showStatus(st, 'Vídeo confirmado! Continue no fluxo normal do app.', 'ok');
        btn.textContent = 'Vídeo confirmado';
      } catch (e) {
        showStatus(st, 'Erro: ' + e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Vídeo pronto';
      }
    }

    async function doUploadFromPrompt() {
      const btn = document.getElementById('promptUploadBtn');
      const st = document.getElementById('promptUploadStatus');
      if (!window._currentPackageId) {
        showStatus(st, 'ID do pacote não encontrado. Acesse pelo push.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Confirmando...';
      showStatus(st, 'Aguarde, finalizando o pacote...', 'info');
      try {
        // 1. Busca o pacote para extrair o videoId
        const res = await fetch(API + '/api/packaging/' + window._currentPackageId, {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const pkg = await res.json();
        if (!res.ok) throw new Error(pkg.error || 'Erro ao buscar pacote (status ' + res.status + ')');

        // Loga a estrutura real para diagnosticar onde está o videoId
        console.log('[doUpload] pkg response:', JSON.stringify(pkg));

        // Cobre todas as variações possíveis de estrutura do JSON
        const p = pkg.package || pkg.data || pkg;
        const videoId = p.video_id || p.videoId || p.video?.id || pkg.video_id || pkg.videoId;

        if (!videoId) {
          throw new Error('videoId não encontrado. JSON: ' + JSON.stringify(pkg).slice(0, 300));
        }

        // 2. Chama confirm-ready — o backend atualiza o status e dispara Push 2
        const res2 = await fetch(API + '/api/video/' + videoId + '/confirm-ready', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data2 = await res2.json();
        if (!res2.ok) throw new Error(data2.error || 'Erro ao confirmar vídeo.');

        showStatus(st, 'Vídeo confirmado! Aguarde o Push com legenda e hashtags.', 'ok');
        btn.textContent = 'Confirmado ✓';
      } catch(e) {
        showStatus(st, e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Vídeo pronto';
      }
    }

    async function renderPackageView(params) {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Conferir e publicar';
      document.getElementById('packageSection').style.display = 'block';
      const content = document.getElementById('packageContent');
      const packageId = params.get('id');

      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login no app para ver este pacote.</div>';
        return;
      }
      if (!packageId) {
        content.innerHTML = '<div class="status err" style="display:block;">Pacote não identificado.</div>';
        return;
      }

      try {
        const res = await fetch(API + '/api/packaging/ready', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao buscar pacote');

        const pkg = (data.packages || []).find(p => String(p.id) === String(packageId));
        if (!pkg) throw new Error('Pacote não encontrado na lista de prontos');

        window._currentPackageCaption = pkg.caption || '';
        window._currentPackageLink = pkg.affiliate_link || '';

        content.innerHTML = `
          <div class="product-title">${escapeHtml(pkg.title || pkg.product_name || 'Produto')}</div>
          <div class="product-meta">R$ ${pkg.price || ''} • Status: ${escapeHtml(pkg.status)}</div>

          <div class="field-label">Título</div>
          <div class="prompt-box" style="max-height:80px;">${escapeHtml(pkg.title || '—')}</div>

          <div class="field-label">Legenda + Hashtags</div>
          <div class="prompt-box" style="max-height:120px;">${escapeHtml(pkg.caption || '—')}</div>

          <div class="field-label">Link de Afiliado</div>
          <div class="prompt-box" style="max-height:60px;">${escapeHtml(pkg.affiliate_link || '—')}</div>

          <button class="btn btn-secondary" onclick="copyPackageCaption()">Copiar Legenda + Hashtags</button>
          <button class="btn btn-secondary" onclick="openProductOnShopee()" style="margin-top:10px;">Favoritar na Shopee</button>
          <div class="status" id="copyPackageStatus"></div>

          <button class="btn" onclick="confirmPackage('${packageId}')" id="confirmBtn" style="margin-top:16px;">Confirmar Publicação</button>
          <div class="status" id="confirmStatus"></div>
        `;
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>';
      }
    }

    async function confirmPackage(packageId) {
      const btn = document.getElementById('confirmBtn');
      const st = document.getElementById('confirmStatus');
      btn.disabled = true;
      btn.textContent = 'Confirmando...';
      try {
        const res = await fetch(API + '/api/packaging/' + packageId + '/confirm', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao confirmar');
        showStatus(st, 'Publicação confirmada!', 'ok');
        btn.textContent = 'Confirmado ';
        clearPromptState(); // limpa estado salvo — prompt já foi usado
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Confirmar Publicação';
      }
    }

    function copyPackageCaption() {
      const st = document.getElementById('copyPackageStatus');
      navigator.clipboard.writeText(window._currentPackageCaption || '')
        .then(() => showStatus(st, 'Legenda e hashtags copiadas!', 'ok'))
        .catch(() => showStatus(st, 'Não foi possível copiar. Selecione o texto manualmente.', 'err'));
    }

    function openProductOnShopee() {
      const link = window._currentPackageLink;
      if (!link) {
        const st = document.getElementById('copyPackageStatus');
        showStatus(st, 'Link de afiliado não disponível.', 'err');
        return;
      }
      window.open(link, '_blank');
    }

    function showUploadScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Vídeos pendentes';
      document.getElementById('uploadSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav('navProjetos');
      renderPendingList(document.getElementById('uploadContent'));
    }

    async function renderPendingList(content) {
      content.innerHTML = '<div class="loading">Carregando vídeos pendentes...</div>';

      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para ver os vídeos pendentes.</div>';
        return;
      }

      try {
        const res = await fetch(API + '/api/video/pending', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao buscar pendentes');

        if (!data.videos || data.videos.length === 0) {
          content.innerHTML = '<p class="empty-note">Nenhum vídeo pendente no momento.</p>';
          return;
        }

        window.__PENDING_VIDEOS = data.videos;

        content.innerHTML = '<div class="video-list">' + data.videos.map(v => {
          const cover = v.image_url || v.thumbnail_url;
          const bgStyle = cover ? `style="background-image:url('${cover}')"` : '';
          return `
            <div class="video-card" style="cursor:pointer;" onclick="renderSingleUpload(${v.id})">
              <div class="video-card-bg" ${bgStyle}></div>
              <div class="video-card-overlay">
                <div class="video-card-title">${escapeHtml(v.title || v.product_name || ('Vídeo #' + v.id))}</div>
                <div class="video-card-meta">
                  <span class="video-card-status">Pendente</span>
                </div>
              </div>
            </div>
          `;
        }).join('') + '</div>';
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderSingleUpload(videoId) {
      const content = document.getElementById('uploadContent');
      const video = (window.__PENDING_VIDEOS || []).find(v => v.id === videoId) || {};

      window._currentPrompt = video.video_prompt || '';
      window._currentProductImage = video.image_url || '';
      window._currentNarration = video.narration || '';

      content.innerHTML = `
        <button class="btn btn-outline" onclick="showUploadScreen()" style="margin-bottom:16px;">← Ver outros pendentes</button>

        <div class="field-label" style="margin-top:0;">${escapeHtml(video.title || video.product_name || ('Vídeo #' + videoId))}</div>

        ${video.image_url ? `<img src="${video.image_url}" class="thumb" alt="Foto do produto">` : ''}

        ${video.video_prompt ? `
          <div class="field-label">Prompt do vídeo (YouTube Create)</div>
          <div class="prompt-box">${escapeHtml(video.video_prompt)}</div>
          <button class="btn" onclick="copyPromptAndImage()">Copiar Prompt + Imagem</button>
          <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-align:center;">GERAR VÍDEO COM:</div>
            <button class="btn btn-secondary" onclick="openYoutubeCreate()">▶ YouTube Create</button>
            <button class="btn btn-secondary" onclick="openGemini()">✦ Gemini</button>
            <button class="btn btn-secondary" onclick="openGoogleVids()">▣ Google Vids</button>
          </div>
          <div class="status" id="promptStatus"></div>
        ` : ''}

        <div class="field-label" style="margin-top:22px;border-top:1px solid var(--border);padding-top:16px;">Já gerou o vídeo?</div>
        <button class="btn" id="uploadBtn" onclick="confirmVideoPronto(${videoId}, 'uploadBtn', 'uploadStatus')">Vídeo pronto</button>
        <div class="status" id="uploadStatus"></div>
      `;
    }

    // ===== TELA: PROMPTS PRONTOS (histórico permanente) =====
    function showPromptsScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Prompts Prontos';
      document.getElementById('promptsListSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav('navProjetos');
      renderPromptsList();
    }

    async function renderPromptsList() {
      const content = document.getElementById('promptsListContent');
      content.innerHTML = '<div class="loading">Carregando prompts...</div>';

      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para continuar.</div>';
        return;
      }

      try {
        const res = await fetch(API + '/api/ai/list', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao buscar prompts');

        window.__PROMPTS_LIST = data.items || [];

        if (!window.__PROMPTS_LIST.length) {
          content.innerHTML = '<div class="status info" style="display:block;">Nenhum prompt gerado ainda. Vá em "Editar com IA" para criar um.</div>';
          return;
        }

        content.innerHTML = window.__PROMPTS_LIST.map(item => `
          <div class="prompt-box" style="display:flex;gap:10px;align-items:center;">
            <div style="flex:1;cursor:pointer;" onclick="showPromptDetail(${item.id})">
              ${item.image_url ? `<img src="${item.image_url}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;float:left;margin-right:10px;">` : ''}
              <strong>${escapeHtml(item.title || item.product_name || ('Prompt #' + item.id))}</strong>
            </div>
            <button onclick="archivePrompt(${item.id})" title="Remover da lista" style="background:none;border:none;font-size: 19.5px;cursor:pointer;padding:6px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
          </div>
        `).join('');
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>';
      }
    }

    async function archivePrompt(contentId) {
      if (!confirm('Remover este prompt da lista? Ele não será mais exibido aqui.')) return;
      try {
        const res = await fetch(API + '/api/ai/' + contentId, {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ archived: true })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao remover');
        renderPromptsList();
      } catch(e) {
        alert('' + e.message);
      }
    }

    function showPromptDetail(contentId) {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Prompt Pronto';
      document.getElementById('promptDetailSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav('navProjetos');

      const item = (window.__PROMPTS_LIST || []).find(p => p.id === contentId);
      const content = document.getElementById('promptDetailContent');

      if (!item) {
        content.innerHTML = '<div class="status err" style="display:block;">Prompt não encontrado.</div>';
        return;
      }

      window._currentPrompt = item.video_prompt || '';
      window._currentProductImage = item.image_url || '';
      window._currentNarration = item.narration || '';
      window._currentPackageId = item.package_id || null;

      content.innerHTML = `
        <div class="field-label" style="margin-top:0;">${escapeHtml(item.title || item.product_name || '')}</div>
        ${item.image_url ? `<img src="${item.image_url}" class="thumb" alt="Foto do produto">` : ''}

        <div class="field-label">PROMPT DO VÍDEO (YOUTUBE CREATE)</div>
        <div class="prompt-box">${escapeHtml(item.video_prompt || '(sem prompt)')}</div>

        <button class="btn" onclick="copyPromptAndImage()">Copiar Prompt + Imagem</button>
        <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.08em;text-align:center;">GERAR VÍDEO COM:</div>
          <button class="btn btn-secondary" onclick="openYoutubeCreate()">▶ YouTube Create</button>
          <button class="btn btn-secondary" onclick="openGemini()">✦ Gemini</button>
          <button class="btn btn-secondary" onclick="openGoogleVids()">▣ Google Vids</button>
        </div>
        <div class="status" id="promptStatus"></div>
        ${item.package_id ? `
        <div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
          <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:0.08em;margin-bottom:10px;">JÁ GEROU O VÍDEO?</div>
          <button class="btn" id="promptUploadBtn" onclick="doUploadFromPrompt()">Vídeo pronto</button>
          <div class="status" id="promptUploadStatus"></div>
        </div>` : ''}
      `;
    }

    function downloadPromptFile(titleForFileName) {
      const text = window._currentPrompt || '';
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = (titleForFileName || 'prompt').replace(/[^a-z0-9]+/gi, '_').slice(0, 60);
      a.download = safeName + '.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    async function doLogin() {
      const email = document.getElementById('emailInput').value.trim();
      const pass  = document.getElementById('passInput').value;
      const btn   = document.getElementById('loginBtn');
      const st    = document.getElementById('loginStatus');
      if (!email || !pass) { showStatus(st, 'Preencha e-mail e senha.', 'err'); return; }
      btn.disabled = true;
      btn.textContent = 'Entrando...';
      showStatus(st, 'Autenticando...', 'info');
      try {
        const res = await fetch(API + '/api/affiliates/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao entrar');
        SESSION = data;
        localStorage.setItem('wa_session', JSON.stringify(SESSION));
        document.body.classList.remove('pre-login');
        _subAccounts = [];
        await _ensureSubAccounts();
        _goToDashOrOnboarding();
      } catch(e) {
        showStatus(st, e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    }

    function doLogout() {
      SESSION = null;
      _subAccounts = [];
      _activeSubAccount = null;
      try { sessionStorage.removeItem('wa_active_sub'); } catch(e) {}
      localStorage.removeItem('wa_session');
      document.body.classList.add('pre-login');
      hideAllCards();
      _updateSubAccountChip();
      document.getElementById('pageSubtitle').style.display = 'none';
      document.getElementById('loginSection').style.display = 'block';
    }

    async function _goToDashOrOnboarding() {
      refreshAdminStatus();
      if (!_subAccounts.length) {
        // Se nao carregou sub-contas, tenta uma vez mais antes de mostrar onboarding
        await _ensureSubAccounts();
      }
      if (!_subAccounts.length) {
        // Mesmo apos retry — se o afiliado tem sessao valida, provavelmente é erro de rede
        // Mostra dash com aviso em vez de onboarding (evita loop de reconexao Shopee)
        if (SESSION && SESSION.token) {
          showDash();
          const st = document.getElementById('dashStatus');
          if (st) { st.style.display = 'block'; st.textContent = 'Erro ao carregar dados. Verifique sua conexao e recarregue.'; st.style.color = '#F59E0B'; }
        } else {
          showOnboardingScreen();
        }
      } else {
        showDash();
      }
    }

    async function refreshAdminStatus() {
      const card = document.getElementById('adminInvitesCard');
      try {
        const res = await fetch(API + '/api/affiliates/me', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        if (!res.ok) throw new Error('Nao foi possivel confirmar admin');
        const data = await res.json();
        IS_ADMIN = !!(data.affiliate && data.affiliate.is_admin);
      } catch (e) {
        // Em caso de qualquer erro, assume que NAO é admin (padrao seguro)
        IS_ADMIN = false;
      }
      if (card) card.style.display = IS_ADMIN ? 'block' : 'none';
    }

    function showOnboardingScreen() {
      hideAllCards();
      document.body.classList.remove('pre-login');
      document.getElementById('pageSubtitle').style.display = 'none';
      document.getElementById('onboardingSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'none';
      document.getElementById('headerActions').style.display = 'none';
      const st = document.getElementById('onboardStatus');
      if (st) { st.style.display = 'none'; st.textContent = ''; }
      const fi = document.getElementById('onboardScreenshotInput');
      if (fi) fi.value = '';
    }

    async function doOnboardConnect() {
      const fileInput = document.getElementById('onboardScreenshotInput');
      const btn = document.getElementById('onboardBtn');
      const st = document.getElementById('onboardStatus');
      if (!fileInput.files || fileInput.files.length === 0) {
        showStatus(st, 'Selecione o print da tela "Meu API" primeiro.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Conectando...';
      showStatus(st, 'Lendo o print e conectando sua conta...', 'info');
      try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        const res = await fetch(API + '/api/subaccounts/onboard', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao conectar');
        showStatus(st, 'Conectado com sucesso!', 'ok');
        _subAccounts = [];
        await _ensureSubAccounts();
        setTimeout(() => { showDash(); }, 900);
      } catch(e) {
        showStatus(st, e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Conectar automaticamente';
      }
    }

    function showDash() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'none';
      document.getElementById('dashSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav('navInicio');
      loadHeroCarousel();
      loadReadyVideoGallery();
    }

    function showAccountScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'none';
      document.getElementById('accountSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav('navVoce');
      const info = document.getElementById('affiliateInfo');
      if (SESSION) {
        info.innerHTML = '<strong>' + (SESSION.affiliate && SESSION.affiliate.name ? SESSION.affiliate.name : SESSION.name || 'Afiliado') + '</strong>' + (SESSION.affiliate && SESSION.affiliate.email ? SESSION.affiliate.email : SESSION.email || '');
      }
      checkPushStatus();
      renderSubAccountList();
      loadPendingApprovals();
    }

    async function loadHeroCarousel() {
      const hero = document.getElementById('heroCarousel');
      if (heroTimer) clearInterval(heroTimer);
      hero.innerHTML = '<div class="loading">Carregando...</div>';
      if (!SESSION) return;

      let videos = [];
      try {
        const res = await fetch(API + '/api/video/ready', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        videos = (data.videos || []).slice(0, 5);
      } catch(e) { /* segue com fallback */ }

      heroSlides = videos.length > 0 ? videos : [null];
      heroIndex = 0;

      const slidesHtml = heroSlides.map((v, i) => {
        const cover = v ? (v.thumbnail_url || v.image_url) : '';
        const bg = cover ? `style="background-image:url('${cover}')"` : '';
        return `<div class="hero-slide ${i === 0 ? 'active' : ''}" data-i="${i}" ${bg}></div>`;
      }).join('');

      const dotsHtml = heroSlides.length > 1
        ? `<div class="hero-dots">${heroSlides.map((_, i) => `<div class="hero-dot ${i === 0 ? 'active' : ''}" data-dot="${i}"></div>`).join('')}</div>`
        : '';

      hero.innerHTML = `
        ${slidesHtml}
        <div class="hero-glow"></div>
        <div class="hero-content">
          <span class="hero-badge">✦ NOVO</span>
          <div class="hero-title">Editor com IA</div>
          <div class="hero-sub">Crie, edite e publique vídeos incríveis com Inteligência Artificial.</div>
          <button class="hero-cta" onclick="showVideoCreatorScreen()">
            <div class="hero-cta-icon">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </div>
            Criar projeto →
          </button>
        </div>
        ${dotsHtml}
        ${heroSlides.length > 1 ? '<button class="hero-nav" onclick="advanceHero()">›</button>' : ''}
      `;

      if (heroSlides.length > 1) {
        heroTimer = setInterval(advanceHero, 4500);
      }
    }

    function advanceHero() {
      const hero = document.getElementById('heroCarousel');
      const slides = hero.querySelectorAll('.hero-slide');
      const dots = hero.querySelectorAll('.hero-dot');
      if (slides.length === 0) return;
      slides[heroIndex].classList.remove('active');
      if (dots[heroIndex]) dots[heroIndex].classList.remove('active');
      heroIndex = (heroIndex + 1) % slides.length;
      slides[heroIndex].classList.add('active');
      if (dots[heroIndex]) dots[heroIndex].classList.add('active');
    }

    async function loadReadyVideoGallery() {
      const list = document.getElementById('readyVideoGrid');
      if (!SESSION) return;
      try {
        const res = await fetch(API + '/api/video/ready', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar vídeos');

        const videos = data.videos || [];
        if (videos.length === 0) {
          list.innerHTML = '<p class="empty-note">Nenhum vídeo pronto ainda. Gere um vídeo pra começar.</p>';
          return;
        }

        list.innerHTML = videos.slice(0, 6).map(v => {
          const cover = v.thumbnail_url || v.image_url;
          const bgStyle = cover ? `background-image:url('${cover}')` : 'background:#1a1a1a';
          const statusLabel = v.package_status === 'confirmed' ? '✓ Publicado' : '📦 Pronto para publicar';
          const views = v.views ? (v.views > 999 ? (v.views/1000).toFixed(1) + 'mil' : v.views) : '';
          const likes = v.likes || '';
          return `
            <div class="video-card" onclick="window.location.href='?view=package&id=${v.package_id}'">
              <div style="position:absolute;inset:0;${bgStyle};background-size:cover;background-position:center;opacity:0.75;"></div>
              <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(0,0,0,0.8) 0%,rgba(0,0,0,0.3) 60%,transparent 100%);"></div>
              <div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:5px 8px;color:#fff;font-size:16px;cursor:pointer;">⋯</div>
              <div style="position:absolute;bottom:0;left:0;right:0;padding:14px 16px;">
                <div style="font-size:15px;font-weight:700;color:#fff;line-height:1.3;margin-bottom:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(v.title || v.product_name || 'Vídeo')}</div>
                <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.1);border-radius:100px;padding:3px 10px;font-size:11.5px;font-weight:600;color:rgba(255,255,255,0.8);">${statusLabel}</div>
              </div>
              ${views || likes ? `<div style="position:absolute;bottom:14px;right:14px;display:flex;gap:8px;">
                ${views ? `<div style="display:flex;align-items:center;gap:3px;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);border-radius:100px;padding:3px 8px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">▶ ${views}</div>` : ''}
                ${likes ? `<div style="display:flex;align-items:center;gap:3px;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);border-radius:100px;padding:3px 8px;font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">♥ ${likes}</div>` : ''}
              </div>` : ''}
            </div>
          `;
        }).join('');
      } catch (e) {
        list.innerHTML = '<p class="empty-note">Não foi possível carregar os vídeos.</p>';
      }
    }

    function showComingSoon(featureName) {
      alert(featureName + ' — em breve! ');
    }

    function showSettingsScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Configurações';
      document.getElementById('settingsMenuSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
    }

    function showCalendarScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Calendário Editorial';
      document.getElementById('settingsSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      renderSettingsScreen();
    }

    function showAppsScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Apps & Integrações';
      document.getElementById('appsSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
    }

    let _currentSubAccountId = null;

    function showLogin() {
      hideAllCards();
      document.getElementById('loginSection').style.display = 'block';
      document.getElementById('headerActions').style.display = 'none';
      document.getElementById('bottomNav').style.display = 'none';
    }

    function showRegister() {
      hideAllCards();
      document.getElementById('registerSection').style.display = 'block';
      document.getElementById('headerActions').style.display = 'none';
      document.getElementById('bottomNav').style.display = 'none';
    }

    async function doRegister() {
      const btn = document.getElementById('registerBtn');
      const st = document.getElementById('registerStatus');
      const code = document.getElementById('regCodeInput').value.trim();
      const name = document.getElementById('regNameInput').value.trim();
      const email = document.getElementById('regEmailInput').value.trim();
      const password = document.getElementById('regPassInput').value;
      if (!code || !name || !email || !password) {
        showStatus(st, 'Preencha todos os campos.', 'err'); return;
      }
      btn.disabled = true; btn.textContent = 'Cadastrando...';
      try {
        const res = await fetch(API + '/api/invites/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar');
        showStatus(st, 'Cadastro realizado! Aguarde aprovação do administrador.', 'ok');
        btn.textContent = 'Cadastrado!';
        setTimeout(() => { window.history.replaceState({}, "", "/"); showLogin(); }, 3000);
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
        btn.disabled = false; btn.textContent = 'Cadastrar';
      }
    }

    async function generateInviteCode() {
      if (!SESSION) return;
      const btn = document.getElementById('genInviteBtn');
      const box = document.getElementById('inviteCodeBox');
      btn.disabled = true; btn.textContent = 'Gerando...';
      try {
        const res = await fetch(API + '/api/invites/generate', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const link = window.location.origin + window.location.pathname + '?invite=' + data.code;
        box.style.display = 'block';
        document.getElementById('inviteCodeText').textContent = link;
        btn.textContent = 'Novo convite';
        btn.disabled = false;
      } catch(e) {
        btn.textContent = 'Gerar convite';
        btn.disabled = false;
        alert('Erro: ' + e.message);
      }
    }

    function copyInviteCode() {
      const text = document.getElementById('inviteCodeText').textContent;
      navigator.clipboard.writeText(text).then(() => {
        document.getElementById('copyInviteBtn').textContent = 'Copiado!';
        setTimeout(() => document.getElementById('copyInviteBtn').textContent = 'Copiar', 2000);
      });
    }

    async function loadPendingApprovals() {
      if (!SESSION) return;
      const box = document.getElementById('pendingApprovalsBox');
      box.innerHTML = '<div class="loading">Carregando...</div>';
      try {
        const res = await fetch(API + '/api/invites/pending', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!data.pending.length) {
          box.innerHTML = '<div style="font-size: 14.5px;color:var(--text-faint);padding:8px 0;">Nenhum cadastro pendente.</div>';
          return;
        }
        box.innerHTML = data.pending.map(p => `
          <div class="subaccount-item" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div style="display:flex;align-items:center;gap:10px;width:100%;">
              <div class="sub-account-dropdown-avatar">${p.name[0].toUpperCase()}</div>
              <div style="flex:1;">
                <div style="font-weight:700;font-size: 14.5px;">${escapeHtml(p.name)}</div>
                <div style="font-size: 12.5px;color:var(--text-faint);">${escapeHtml(p.email)}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;width:100%;">
              <button class="btn" style="flex:1;padding:8px;font-size: 13.5px;" onclick="approveUser(${p.id})">Aprovar</button>
              <button class="btn btn-secondary" style="flex:1;padding:8px;font-size: 13.5px;" onclick="rejectUser(${p.id})">Rejeitar</button>
            </div>
          </div>
        `).join('');
      } catch(e) {
        box.innerHTML = '<div style="font-size: 14.5px;color:var(--red);">Erro: ' + e.message + '</div>';
      }
    }

    async function approveUser(id) {
      if (!SESSION) return;
      try {
        const res = await fetch(API + '/api/invites/approve/' + id, {
          method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        if (!res.ok) throw new Error('Erro ao aprovar');
        loadPendingApprovals();
      } catch(e) { alert('Erro: ' + e.message); }
    }

    async function rejectUser(id) {
      if (!SESSION) return;
      try {
        const res = await fetch(API + '/api/invites/reject/' + id, {
          method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        if (!res.ok) throw new Error('Erro ao rejeitar');
        loadPendingApprovals();
      } catch(e) { alert('Erro: ' + e.message); }
    }

    function showAiSettingsScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Ajustes de IA';
      document.getElementById('aiSettingsSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      renderAiSettingsScreen();
    }

    async function renderAiSettingsScreen() {
      const content = document.getElementById('aiSettingsContent');
      content.innerHTML = '<div class="loading">Carregando...</div>';
      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para configurar.</div>';
        return;
      }
      const subId = (_activeSubAccount && _activeSubAccount.id) || (SESSION.affiliate && SESSION.affiliate.id) || SESSION.id;
      if (!subId) {
        content.innerHTML = '<div class="status err" style="display:block;">&#10060; Nenhuma conta selecionada. Volte ao início e selecione uma conta.</div>';
        return;
      }
      try {
        const res = await fetch(API + '/api/subaccounts/' + subId + '/ai-settings', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar ajustes');
        const s = data.settings || {};
        content.innerHTML = renderAiSettingsLayout(s, subId);
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;">&#10060; ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderAiSettingsLayout(s, subId) {
      return `
        <div class="cal-hero">
          <div class="cal-hero-ico">
            <svg width="130" height="130" viewBox="0 0 130 130" fill="none" xmlns="http://www.w3.org/2000/svg">
              <ellipse cx="65" cy="124" rx="40" ry="6" fill="rgba(200,0,0,0.2)"/>
              <circle cx="65" cy="58" r="36" fill="#1a0000" stroke="#cc1010" stroke-width="1.5"/>
              <circle cx="65" cy="58" r="22" fill="#2a0000" stroke="#cc1010" stroke-width="1"/>
              <path d="M55 58c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10-10-4.5-10-10z" fill="#cc1010" opacity="0.9"/>
              <path d="M58 44v-8M72 44v-8M50 50l-6-4M80 50l6-4M50 66l-6 4M80 66l6 4" stroke="#ff4444" stroke-width="2" stroke-linecap="round"/>
              <rect x="59" y="80" width="12" height="24" rx="4" fill="#cc1010"/>
              <rect x="55" y="100" width="20" height="6" rx="3" fill="#880808"/>
            </svg>
          </div>
          <div class="cal-hero-title">Ajustes de IA</div>
          <div class="cal-hero-desc">Configure como a IA gera conteúdo para esta conta.</div>
        </div>

        <div class="cal-day-card">
          <div class="cal-day-card-head">
            <h3>Conteúdo</h3>
            <span class="cal-status-badge active">Texto</span>
          </div>
          <div class="cal-category-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Tom e estilo do conteúdo
          </div>

          <div class="field-label">Tom de voz</div>
          <select id="ais-tom" onchange="aiSettingsPreviewChips()">
            <option value="descontraido" ${(!s.tom || s.tom==='descontraido') ? 'selected' : ''}>Descontraído</option>
            <option value="vendedor" ${s.tom==='vendedor' ? 'selected' : ''}>Vendedor</option>
            <option value="formal" ${s.tom==='formal' ? 'selected' : ''}>Formal</option>
          </select>

          <div class="field-label">Foco do conteúdo</div>
          <select id="ais-foco" onchange="aiSettingsPreviewChips()">
            <option value="beneficio" ${(!s.foco || s.foco==='beneficio') ? 'selected' : ''}>Destacar benefício</option>
            <option value="preco" ${s.foco==='preco' ? 'selected' : ''}>Destacar preço</option>
            <option value="urgencia" ${s.foco==='urgencia' ? 'selected' : ''}>Criar urgência</option>
          </select>

          <div class="field-label">Tamanho do texto</div>
          <select id="ais-tamanho" onchange="aiSettingsPreviewChips()">
            <option value="curto" ${s.tamanho==='curto' ? 'selected' : ''}>Curto</option>
            <option value="medio" ${(!s.tamanho || s.tamanho==='medio') ? 'selected' : ''}>Médio</option>
            <option value="longo" ${s.tamanho==='longo' ? 'selected' : ''}>Longo</option>
          </select>

          <div class="field-label">Público-alvo (texto livre)</div>
          <input type="text" id="ais-publico" placeholder="Ex: mães de primeira viagem, gamers..." value="${escapeHtml(s.publico || '')}">

          <div class="cal-chips" id="ais-chips-texto">
            <div class="cal-chip">
              <div class="cal-chip-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 9.5-9.5z"/></svg></div>
              <div class="cal-chip-label">Tom</div>
              <div class="cal-chip-value" id="ais-chip-tom">${s.tom || 'descontraido'}</div>
            </div>
            <div class="cal-chip">
              <div class="cal-chip-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg></div>
              <div class="cal-chip-label">Foco</div>
              <div class="cal-chip-value" id="ais-chip-foco">${s.foco || 'beneficio'}</div>
            </div>
            <div class="cal-chip">
              <div class="cal-chip-ico"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h6"/></svg></div>
              <div class="cal-chip-label">Tamanho</div>
              <div class="cal-chip-value" id="ais-chip-tamanho">${s.tamanho || 'medio'}</div>
            </div>
          </div>
        </div>

        <div class="cal-day-card">
          <div class="cal-day-card-head">
            <h3>Vídeo / Prompt</h3>
            <span class="cal-status-badge active">Vídeo</span>
          </div>
          <div class="cal-category-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m10 9 6 3-6 3V9Z" fill="currentColor" stroke="none"/></svg>
            Estilo visual e formato
          </div>

          <div class="field-label">Estilo visual</div>
          <select id="ais-estilo">
            <option value="dinamico" ${(!s.estilo_video || s.estilo_video==='dinamico') ? 'selected' : ''}>Dinâmico</option>
            <option value="minimalista" ${s.estilo_video==='minimalista' ? 'selected' : ''}>Minimalista</option>
            <option value="elegante" ${s.estilo_video==='elegante' ? 'selected' : ''}>Elegante</option>
          </select>

          <div class="field-label">Duração alvo do vídeo</div>
          <select id="ais-duracao">
            <option value="15" ${s.duracao_video===15 || s.duracao_video==='15' ? 'selected' : ''}>15 segundos</option>
            <option value="30" ${(!s.duracao_video || s.duracao_video===30 || s.duracao_video==='30') ? 'selected' : ''}>30 segundos</option>
            <option value="60" ${s.duracao_video===60 || s.duracao_video==='60' ? 'selected' : ''}>60 segundos</option>
          </select>

          <div class="field-label">Narração</div>
          <select id="ais-narracao">
            <option value="sim" ${(!s.narracao || s.narracao==='sim') ? 'selected' : ''}>Com narração</option>
            <option value="nao" ${s.narracao==='nao' ? 'selected' : ''}>Sem narração</option>
          </select>

          <div class="field-label">Gancho inicial</div>
          <select id="ais-gancho">
            <option value="pergunta" ${(!s.gancho || s.gancho==='pergunta') ? 'selected' : ''}>Pergunta</option>
            <option value="afirmacao" ${s.gancho==='afirmacao' ? 'selected' : ''}>Afirmação</option>
            <option value="numero" ${s.gancho==='numero' ? 'selected' : ''}>Número / dado</option>
          </select>

          <div class="field-label">Presença humana no vídeo</div>
          <select id="ais-presenca" onchange="aiSettingsTogglePessoa()">
            <option value="sem_humano" ${(!s.presenca_humana || s.presenca_humana==='sem_humano') ? 'selected' : ''}>Sem pessoas (só produto)</option>
            <option value="mao_segurando" ${s.presenca_humana==='mao_segurando' ? 'selected' : ''}>Mão segurando o produto</option>
            <option value="pessoa_usando" ${s.presenca_humana==='pessoa_usando' ? 'selected' : ''}>Pessoa usando o produto</option>
          </select>

          <div id="ais-pessoa-detalhes" style="display:${(s.presenca_humana && s.presenca_humana!=='sem_humano') ? 'block' : 'none'};">
            <div class="field-label">Gênero da pessoa</div>
            <select id="ais-genero">
              <option value="indiferente" ${(!s.genero_pessoa || s.genero_pessoa==='indiferente') ? 'selected' : ''}>Indiferente</option>
              <option value="homem" ${s.genero_pessoa==='homem' ? 'selected' : ''}>Homem</option>
              <option value="mulher" ${s.genero_pessoa==='mulher' ? 'selected' : ''}>Mulher</option>
            </select>

            <div class="field-label">Faixa etária</div>
            <select id="ais-idade">
              <option value="indiferente" ${(!s.idade_pessoa || s.idade_pessoa==='indiferente') ? 'selected' : ''}>Indiferente</option>
              <option value="jovem" ${s.idade_pessoa==='jovem' ? 'selected' : ''}>Jovem (18-25)</option>
              <option value="adulto" ${s.idade_pessoa==='adulto' ? 'selected' : ''}>Adulto (25-45)</option>
              <option value="maduro" ${s.idade_pessoa==='maduro' ? 'selected' : ''}>Maduro (45+)</option>
            </select>
          </div>

          <div class="field-label">Fotos do produto no prompt</div>
          <select id="ais-fotos">
            <option value="1" ${(!s.fotos_prompt || s.fotos_prompt===1 || s.fotos_prompt==='1') ? 'selected' : ''}>1 foto</option>
            <option value="2" ${(s.fotos_prompt===2 || s.fotos_prompt==='2') ? 'selected' : ''}>2 fotos</option>
            <option value="3" ${(s.fotos_prompt===3 || s.fotos_prompt==='3') ? 'selected' : ''}>3 fotos</option>
          </select>
        </div>

        <div class="cal-day-card">
          <div class="cal-day-card-head">
            <h3>Personalização</h3>
            <span class="cal-status-badge inactive">Opcional</span>
          </div>
          <div class="cal-category-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            Instruções extras para a IA
          </div>
          <div class="field-label" style="margin-top:0;">Instruções livres (aplicadas em todo conteúdo gerado)</div>
          <textarea id="ais-instrucoes" rows="4" placeholder="Ex: sempre mencione frete grátis, público são mecânicos profissionais, use gírias jovens..." style="width:100%; background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:14px 16px; color:#fff; font-family:inherit; font-size:0.95rem; resize:vertical; margin-bottom:8px;">${escapeHtml(s.instrucoes_extras || '')}</textarea>
          <div style="font-size:0.75rem; color:var(--text-faint); line-height:1.4;">Essas instruções são adicionadas ao final de todos os textos e do prompt de vídeo gerados pela IA.</div>
        </div>

        <div class="cal-day-card">
          <div class="cal-day-card-head">
            <h3>Chave de IA</h3>
            <span class="cal-status-badge inactive">Opcional</span>
          </div>
          <div class="cal-category-row">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4.5"/><path d="M11.3 11.7 20 3M16.5 6.5 19 9M14 9l2 2"/></svg>
            Chave OpenRouter desta conta
          </div>
          <div class="field-label">Enviar print da página de chaves do OpenRouter</div>
          <input type="file" id="openrouterScreenshotInput" accept="image/jpeg,image/png" style="margin-bottom:12px; color:#fff;">
          <button class="btn btn-secondary" onclick="doOcrOpenRouterKey(${subId})" id="ocrOpenRouterBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4 20 14 10"/><path d="m13 9 2-2 2 2-2 2z"/><path d="M18 4v2.5M16.75 5.25h2.5"/><path d="M5.5 13v2M4.5 14h2"/></svg>Ler chave com IA</button>
          <div class="status" id="ocrOpenRouterStatus"></div>
          <div class="field-label">API Key OpenRouter (deixe vazio para usar a chave global)</div>
          <input type="password" id="ais-openrouter-key" placeholder="sk-or-..." value="${escapeHtml(s.openrouter_api_key || '')}">
          <div style="font-size: 0.83rem; color:var(--text-faint); margin-bottom:14px; line-height:1.4;">Se não configurada, o sistema usa a chave global do servidor automaticamente.</div>
        </div>

        <div class="status" id="ais-status"></div>
        <button class="btn" onclick="saveAiSettings(${subId})" style="margin-bottom:32px;">Salvar Ajustes de IA</button>
      `;
    }

    async function doOcrOpenRouterKey(subId) {
      const fileInput = document.getElementById('openrouterScreenshotInput');
      const btn = document.getElementById('ocrOpenRouterBtn');
      const st = document.getElementById('ocrOpenRouterStatus');
      if (!fileInput.files || fileInput.files.length === 0) {
        showStatus(st, 'Selecione uma imagem primeiro.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Lendo imagem...';
      showStatus(st, 'A IA está lendo o print, aguarde...', 'info');
      try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        const res = await fetch(API + '/api/subaccounts/' + subId + '/ocr-openrouter-key', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao ler imagem');
        if (!data.api_key) {
          showStatus(st, 'Não foi possível encontrar a chave nessa imagem. Tente outro print ou cole manualmente.', 'err');
          return;
        }
        document.getElementById('ais-openrouter-key').value = data.api_key;
        showStatus(st, 'Chave extraída! Confira antes de salvar.', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4 20 14 10"/><path d="m13 9 2-2 2 2-2 2z"/><path d="M18 4v2.5M16.75 5.25h2.5"/><path d="M5.5 13v2M4.5 14h2"/></svg>Ler chave com IA';
      }
    }

    function aiSettingsPreviewChips() {
      const tom = document.getElementById('ais-tom');
      const foco = document.getElementById('ais-foco');
      const tamanho = document.getElementById('ais-tamanho');
      if (tom) document.getElementById('ais-chip-tom').textContent = tom.value;
      if (foco) document.getElementById('ais-chip-foco').textContent = foco.value;
      if (tamanho) document.getElementById('ais-chip-tamanho').textContent = tamanho.value;
    }

    function aiSettingsTogglePessoa() {
      const presenca = document.getElementById('ais-presenca');
      const detalhes = document.getElementById('ais-pessoa-detalhes');
      if (!presenca || !detalhes) return;
      detalhes.style.display = presenca.value === 'sem_humano' ? 'none' : 'block';
    }

    async function saveAiSettings(subId) {
      const st = document.getElementById('ais-status');
      const btn = document.querySelector('#aiSettingsContent .btn');
      if (!SESSION) return;
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      const payload = {
        tom: document.getElementById('ais-tom').value,
        foco: document.getElementById('ais-foco').value,
        tamanho: document.getElementById('ais-tamanho').value,
        publico: document.getElementById('ais-publico').value.trim(),
        estilo_video: document.getElementById('ais-estilo').value,
        duracao_video: parseInt(document.getElementById('ais-duracao').value),
        narracao: document.getElementById('ais-narracao').value,
        gancho: document.getElementById('ais-gancho').value,
        presenca_humana: document.getElementById('ais-presenca').value,
        genero_pessoa: document.getElementById('ais-genero').value,
        idade_pessoa: document.getElementById('ais-idade').value,
        fotos_prompt: parseInt(document.getElementById('ais-fotos').value),
        instrucoes_extras: document.getElementById('ais-instrucoes').value.trim(),
        openrouter_api_key: document.getElementById('ais-openrouter-key').value.trim()
      };
      try {
        const res = await fetch(API + '/api/subaccounts/' + subId + '/ai-settings', {
          method: 'PATCH',
          headers: { 'Authorization': 'Bearer ' + SESSION.token, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
        showStatus(st, 'Ajustes salvos com sucesso!', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Ajustes de IA';
      }
    }

    function showApiAfiliadoScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'API Afiliado';
      document.getElementById('apiAfiliadoSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      renderApiAfiliadoScreen();
    }

    async function renderApiAfiliadoScreen() {
      const content = document.getElementById('apiAfiliadoContent');
      content.innerHTML = '<div class="loading">Carregando...</div>';
      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para configurar.</div>';
        return;
      }
      await _ensureSubAccounts();
      const subs = _subAccounts;
      if (!subs.length) {
        content.innerHTML = '<div class="status info" style="display:block;">Nenhuma sub-conta encontrada. Crie uma em Conta → Nova sub-conta.</div>';
        return;
      }
      // usa a sub-conta ativa, ou a primeira
      const sub = (_activeSubAccount && subs.find(s => s.id === _activeSubAccount.id)) || subs[0];
      _currentSubAccountId = sub.id;

      // seletor de sub-conta se houver mais de uma
      const selectorHtml = subs.length > 1 ? `
        <div class="field-label" style="margin-top:0;">Sub-conta</div>
        <select id="apiSubSelect" onchange="onApiSubChange(this.value)" style="margin-bottom:16px;">
          ${subs.map(s => `<option value="${s.id}" ${s.id === sub.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('')}
        </select>
      ` : `
        <div class="field-label" style="margin-top:0;">Sub-conta</div>
        <div class="prompt-box" style="max-height:52px;margin-bottom:16px;">${escapeHtml(sub.name)}</div>
      `;

      content.innerHTML = `
        ${selectorHtml}
        <div class="field-label">Enviar print da tela "Meu API" da Shopee</div>
        <input type="file" id="apiScreenshotInput" accept="image/jpeg,image/png" style="margin-bottom:12px; color:#fff;">
        <button class="btn btn-secondary" onclick="doOcrExtract()" id="ocrBtn"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4 20 14 10"/><path d="m13 9 2-2 2 2-2 2z"/><path d="M18 4v2.5M16.75 5.25h2.5"/><path d="M5.5 13v2M4.5 14h2"/></svg>Ler print com IA</button>
        <div class="status" id="ocrStatus"></div>
        <div class="field-label" style="margin-top:20px;">App ID</div>
        <input type="text" id="appIdInput" placeholder="AppID da Shopee" value="${escapeHtml(sub.shopee_app_id || '')}">
        <div class="field-label">App Secret</div>
        <input type="password" id="appSecretInput" placeholder="Deixe em branco para manter o atual">
        <button class="btn" onclick="saveCredentials()" id="saveCredsBtn" style="margin-top:12px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>Salvar Credenciais</button>
        <div class="status" id="saveCredsStatus"></div>
      `;
    }

    function onApiSubChange(subId) {
      const sub = _subAccounts.find(s => String(s.id) === String(subId));
      if (!sub) return;
      _currentSubAccountId = sub.id;
      _saveActiveSubAccount(sub);
      // atualiza campos com dados da sub selecionada
      document.getElementById('appIdInput').value = sub.shopee_app_id || '';
      document.getElementById('appSecretInput').value = '';
    }

    async function doOcrExtract() {
      const fileInput = document.getElementById('apiScreenshotInput');
      const btn = document.getElementById('ocrBtn');
      const st = document.getElementById('ocrStatus');
      if (!fileInput.files || fileInput.files.length === 0) {
        showStatus(st, 'Selecione uma imagem primeiro.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Lendo imagem...';
      showStatus(st, 'A IA está lendo o print, aguarde...', 'info');
      try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        const res = await fetch(API + '/api/subaccounts/' + _currentSubAccountId + '/ocr-credentials', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao ler imagem');
        const extracted = data.extracted || {};
        if (extracted.appId) document.getElementById('appIdInput').value = extracted.appId;
        if (extracted.appSecret) document.getElementById('appSecretInput').value = extracted.appSecret;
        showStatus(st, 'Dados extraídos! Confira antes de salvar.', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M4 20 14 10"/><path d="m13 9 2-2 2 2-2 2z"/><path d="M18 4v2.5M16.75 5.25h2.5"/><path d="M5.5 13v2M4.5 14h2"/></svg>Ler print com IA';
      }
    }

    async function saveCredentials() {
      const btn = document.getElementById('saveCredsBtn');
      const st = document.getElementById('saveCredsStatus');
      const appId = document.getElementById('appIdInput').value.trim();
      const appSecret = document.getElementById('appSecretInput').value.trim();
      btn.disabled = true;
      btn.textContent = 'Salvando...';
      try {
        const res = await fetch(API + '/api/subaccounts/' + _currentSubAccountId + '/credentials', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SESSION.token
          },
          body: JSON.stringify({
            shopeeAppId: appId || null,
            shopeeAppSecret: appSecret || null,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
        showStatus(st, 'Credenciais salvas!', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>Salvar Credenciais';
      }
    }

function showSearchNowScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'none';
      document.getElementById('searchNowSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      const st = document.getElementById('searchNowStatus');
      if (st) { st.style.display = 'none'; st.textContent = ''; }
      // Popula o dropdown de categoria com TODAS as categorias reais —
      // antes ficavam 6 fixas no HTML, desatualizadas em relação às 34
      // categorias que o calendário já usa. Mesma fonte de dados dos dois
      // lugares (window.__SETTINGS_CATEGORIES), garantindo consistência.
      _populateSearchNowCategories();
    }

    async function _populateSearchNowCategories() {
      const sel = document.getElementById('sn-category');
      if (!sel) return;
      let categories = window.__SETTINGS_CATEGORIES;
      if (!categories || categories.length === 0) {
        try {
          const res = await fetch(API + '/api/settings/categories', {
            headers: { 'Authorization': 'Bearer ' + SESSION.token }
          });
          const data = await res.json();
          categories = data.categories || [];
          window.__SETTINGS_CATEGORIES = categories;
        } catch (e) {
          console.warn('[SearchNow] Não foi possível carregar categorias:', e.message);
          categories = [];
        }
      }
      const valorAtual = sel.value;
      sel.innerHTML = categories.map(c =>
        `<option value="${c.key}">${escapeHtml(c.label)}</option>`
      ).join('');
      if (valorAtual && categories.some(c => c.key === valorAtual)) {
        sel.value = valorAtual;
      }
    }

    async function doSearchNow() {
      const btn = document.getElementById('searchNowBtn');
      const st = document.getElementById('searchNowStatus');
      const category = document.getElementById('sn-category').value;
      const priceMin = document.getElementById('sn-pricemin').value;
      const priceMax = document.getElementById('sn-pricemax').value;
      const commissionMin = document.getElementById('sn-commission').value;

      btn.disabled = true;
      btn.textContent = 'Buscando...';
      showStatus(st, 'Buscando produtos na Shopee e gerando conteúdo... isso pode levar até 1 minuto.', 'info');

      try {
        const subAccountId = await ensureSubAccountId();
        const res = await fetch(API + '/api/products/search-now', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + SESSION.token
          },
          body: JSON.stringify({
            subAccountId,
            category,
            priceMin: priceMin ? parseFloat(priceMin) : 0,
            priceMax: priceMax ? parseFloat(priceMax) : null,
            commissionMin: commissionMin ? parseFloat(commissionMin) : 0,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao buscar produto');

        const fallbackMsg = data.ownKeyFailed ? ' Sua chave OpenRouter própria falhou nesta geração, usamos a IA global.' : '';
        showStatus(st, 'Produto "' + data.product.name + '" encontrado e gerado! Confira o push que acabou de chegar.' + fallbackMsg, 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Buscar e Gerar Agora';
      }
    }

    function showAnuncioExpressScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Anúncio Express';
      document.getElementById('anuncioExpressSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      if (typeof rlRenderHistorico === 'function') rlRenderHistorico();
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
    }

    function showVideosPublicadosScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Vídeos Publicados';
      document.getElementById('videosPublicadosSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
    }

    function showPincarAnuncioScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Print do Anúncio';
      document.getElementById('pincarAnuncioSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      const st = document.getElementById('pincarStatus');
      if (st) { st.style.display = 'none'; st.textContent = ''; }
    }

    async function doPincarAnuncio() {
      const fileInput = document.getElementById('adScreenshotInput');
      const btn = document.getElementById('pincarBtn');
      const st = document.getElementById('pincarStatus');
      if (!fileInput.files || fileInput.files.length === 0) {
        showStatus(st, 'Selecione o print do anúncio primeiro.', 'err');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Processando...';
      showStatus(st, 'Lendo o anúncio, buscando o produto e gerando conteúdo... isso pode levar até 1 minuto.', 'info');
      try {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);
        const res = await fetch(API + '/api/products/from-screenshot', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao processar anúncio');
        showStatus(st, 'Produto "' + data.productNameDetected + '" pinçado! Confira o push que acabou de chegar.', 'ok');
        fileInput.value = '';
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Pinçar este Anúncio';
      }
    }

    const CAL_DAY_ABBR = { 0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb' };
    let _calActiveDay = 0;

    // Cache: sub-conta ativa tem chave OpenRouter própria configurada?
    let _calHasOwnOpenRouter = false;

    async function _refreshOpenRouterFlag(subId) {
      _calHasOwnOpenRouter = false;
      if (!subId || !SESSION) return;
      try {
        const res = await fetch(API + '/api/subaccounts/' + subId + '/ai-settings', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        if (!res.ok) return;
        const data = await res.json();
        const key = data.settings && data.settings.openrouter_api_key;
        _calHasOwnOpenRouter = !!(key && String(key).trim()) || IS_ADMIN;
      } catch(e) {
        // silencioso — se falhar, assume sem chave própria (limite de 3 prevalece)
      }
    }

    function openOpenRouterLimitModal() {
      document.getElementById('openRouterLimitModal').classList.add('open');
    }

    function closeOpenRouterLimitModal(e) {
      if (e && e.target !== e.currentTarget) return;
      document.getElementById('openRouterLimitModal').classList.remove('open');
    }

    function goToOpenRouterSetup() {
      closeOpenRouterLimitModal();
      closeDaySheet();
      showAppsScreen();
    }

    async function renderSettingsScreen() {
      const content = document.getElementById('settingsContent');
      content.innerHTML = '<div class="loading">Carregando configurações...</div>';

      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para configurar.</div>';
        return;
      }

      await _ensureSubAccounts();
      if (!_activeSubAccount) {
        content.innerHTML = '<div class="status err" style="display:block;">Nenhuma sub-conta encontrada. Crie uma sub-conta antes de configurar o calendário.</div>';
        return;
      }

      try {
        const [catRes, schedRes] = await Promise.all([
          fetch(API + '/api/settings/categories', {
            headers: { 'Authorization': 'Bearer ' + SESSION.token }
          }),
          fetch(API + '/api/settings/schedule?subAccountId=' + _activeSubAccount.id, {
            headers: { 'Authorization': 'Bearer ' + SESSION.token }
          })
        ]);
        const catData = await catRes.json();
        const schedData = await schedRes.json();
        if (!catRes.ok) throw new Error(catData.error || 'Erro ao buscar categorias');
        if (!schedRes.ok) throw new Error(schedData.error || 'Erro ao buscar calendário');

        window.__SETTINGS_CATEGORIES = catData.categories || [];
        window.__SETTINGS_SCHEDULE = schedData.schedule || [];

        const today = new Date().getDay();
        _calActiveDay = window.__SETTINGS_SCHEDULE.some(d => d.day_of_week === today) ? today : (window.__SETTINGS_SCHEDULE[0] || {}).day_of_week || 0;

        content.innerHTML = renderCalendarLayout();

        // Não bloqueia a renderização — atualiza a flag em paralelo
        _refreshOpenRouterFlag(_activeSubAccount.id);
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderCalendarLayout() {
      const schedule = window.__SETTINGS_SCHEDULE || [];
      return `
        <div class="cal-hero">
          <div class="cal-hero-ico">
<svg width="155" height="155" viewBox="0 0 155 155" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bodyGrad" x1="20" y1="30" x2="135" y2="155" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#3a0000"/>
      <stop offset="100%" stop-color="#1a0000"/>
    </linearGradient>
    <linearGradient id="topGrad" x1="20" y1="20" x2="135" y2="55" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#cc1010"/>
      <stop offset="100%" stop-color="#880808"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- Shadow -->
  <ellipse cx="78" cy="148" rx="48" ry="7" fill="rgba(200,0,0,0.25)"/>
  <!-- Calendar body -->
  <rect x="18" y="38" width="119" height="102" rx="10" fill="url(#bodyGrad)" stroke="#cc1010" stroke-width="1.5"/>
  <!-- Top bar (red) -->
  <rect x="18" y="38" width="119" height="36" rx="10" fill="url(#topGrad)"/>
  <rect x="18" y="58" width="119" height="16" fill="#880808"/>
  <!-- Rings -->
  <rect x="44" y="24" width="10" height="28" rx="5" fill="#cc1010"/>
  <rect x="44" y="24" width="10" height="28" rx="5" fill="none" stroke="#ff4444" stroke-width="1"/>
  <rect x="101" y="24" width="10" height="28" rx="5" fill="#cc1010"/>
  <rect x="101" y="24" width="10" height="28" rx="5" fill="none" stroke="#ff4444" stroke-width="1"/>
  <!-- Grid dots - row 1 -->
  <rect x="34" y="90" width="16" height="14" rx="3" fill="#cc1010" opacity="0.9"/>
  <rect x="62" y="90" width="16" height="14" rx="3" fill="#cc1010" opacity="0.9"/>
  <rect x="90" y="90" width="16" height="14" rx="3" fill="#cc1010" opacity="0.9"/>
  <rect x="105" y="90" width="16" height="14" rx="3" fill="#cc1010" opacity="0.5"/>
  <!-- Grid dots - row 2 -->
  <rect x="34" y="112" width="16" height="14" rx="3" fill="#cc1010" opacity="0.7"/>
  <rect x="62" y="112" width="16" height="14" rx="3" fill="#cc1010" opacity="0.7"/>
  <rect x="90" y="112" width="16" height="14" rx="3" fill="#cc1010" opacity="0.3"/>
  <!-- Shine -->
  <rect x="22" y="42" width="111" height="6" rx="4" fill="rgba(255,100,100,0.18)"/>
</svg>
</div>
          <div class="cal-hero-title">Agenda Inteligente</div>
          <div class="cal-hero-desc">Automatize quais produtos sua IA publica em cada dia.</div>
          <button class="cal-hero-btn" onclick="showNewScheduleSheet && showNewScheduleSheet()">+ &nbsp;Novo agendamento</button>
        </div>

        <div class="cal-tabs" id="calTabs">
          ${schedule.map(d => `<div class="cal-tab ${d.day_of_week === _calActiveDay ? 'active' : ''}" onclick="switchCalDay(${d.day_of_week})">${CAL_DAY_ABBR[d.day_of_week]}</div>`).join('')}
        </div>

        <div id="calDayCardWrap">${renderCalDayCard(_calActiveDay)}</div>

        <div class="cal-summary-title">Todos os dias · Resumo</div>
        <div class="cal-summary-scroll" id="calSummaryScroll">
          ${schedule.map(d => renderCalSummaryCard(d)).join('')}
        </div>
      `;
    }

    function getCategoryLabel(key) {
      if (!key) return 'Categoria aleatória';
      const categories = window.__SETTINGS_CATEGORIES || [];
      const found = categories.find(c => c.key === key);
      return found ? found.label : key;
    }

    function renderCalDayCard(dayOfWeek) {
      const schedule = window.__SETTINGS_SCHEDULE || [];
      const day = schedule.find(d => d.day_of_week === dayOfWeek);
      if (!day) return '<div class="empty-note">Dia não encontrado.</div>';

      const slots = day.slots || [];
      const activeCount = slots.filter(s => s.active).length;

      return `
        <div class="cal-day-card" id="calDayCard-${day.day_of_week}">
          <div class="cal-day-card-head">
            <h3>${escapeHtml(day.day_label)}</h3>
            <span class="cal-status-badge ${activeCount > 0 ? 'active' : 'inactive'}">${activeCount} de ${slots.length} horários ativos</span>
          </div>

          <div class="cal-slot-list">
            ${slots.map(slot => renderCalSlotRow(day.day_of_week, slot)).join('')}
          </div>

          <button class="cal-edit-link" onclick="openNewSlotSheet(${day.day_of_week})">
            Adicionar horário
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      `;
    }

    function renderCalSlotRow(dayOfWeek, slot) {
      const videos = slot.videos || 1;
      return `
        <div class="cal-slot-row ${slot.active ? '' : 'cal-slot-inactive'}" onclick="openSlotSheet(${dayOfWeek}, '${slot.horario}')">
          <div class="cal-slot-time">${slot.horario}</div>
          <div class="cal-slot-info">
            <div class="cal-slot-cat">${escapeHtml(getCategoryLabel(slot.category))}</div>
            <div class="cal-slot-meta">${videos} vídeo${videos === 1 ? '' : 's'} · <span class="${slot.is_default ? 'cal-slot-tag-default' : 'cal-slot-tag-edited'}">${slot.is_default ? 'Padrão' : 'Editado'}</span></div>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="cal-slot-chevron"><path d="M9 6l6 6-6 6"/></svg>
        </div>
      `;
    }

    function renderCalSummaryCard(day) {
      const slots = day.slots || [];
      const activeCount = slots.filter(s => s.active).length;
      const totalVideos = slots.filter(s => s.active).reduce((sum, s) => sum + (s.videos || 1), 0);
      return `
        <div class="cal-summary-card ${day.day_of_week === _calActiveDay ? 'active' : ''}" onclick="switchCalDay(${day.day_of_week})">
          <div class="day-abbr">${CAL_DAY_ABBR[day.day_of_week]}</div>
          <div class="cat-name">${activeCount} horário${activeCount === 1 ? '' : 's'}</div>
          <div class="stat-line"><b>${totalVideos}</b> vídeos/dia</div>
        </div>
      `;
    }

    function fmtNum(n) {
      const v = parseFloat(n);
      if (isNaN(v)) return '0';
      return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/\.?0+$/, '');
    }

    function switchCalDay(dayOfWeek) {
      _calActiveDay = dayOfWeek;
      document.querySelectorAll('#calTabs .cal-tab').forEach((el, i) => {
        const schedule = window.__SETTINGS_SCHEDULE || [];
        el.classList.toggle('active', schedule[i] && schedule[i].day_of_week === dayOfWeek);
      });
      document.getElementById('calDayCardWrap').innerHTML = renderCalDayCard(dayOfWeek);
      document.getElementById('calSummaryScroll').innerHTML = (window.__SETTINGS_SCHEDULE || []).map(d => renderCalSummaryCard(d)).join('');
    }

    // horario === null/undefined → modo "novo horário" (cria um slot extra no dia)
    function _renderSlotSheet(dayOfWeek, slot, isNew) {
      const categories = window.__SETTINGS_CATEGORIES || [];
      const options = categories.map(c =>
        `<option value="${c.key}" ${c.key === slot.category ? 'selected' : ''}>${escapeHtml(c.label)}</option>`
      ).join('');
      const commissionPercent = (parseFloat(slot.commission_min || 0) * 100).toFixed(0);
      const slotKey = isNew ? '__new__' : slot.horario;

      document.getElementById('daySheetContent').innerHTML = `
        <h2>${isNew ? 'Novo horário' : slot.horario}</h2>
        <label class="day-active-label">
          <input type="checkbox" id="sheet-active-${slotKey}" ${slot.active ? 'checked' : ''}>
          Horário ativo
        </label>
        ${isNew ? `
        <span class="sheet-label" style="display:block;margin-bottom:8px;">Horário</span>
        <div class="sheet-num-box" style="margin-bottom:16px;">
          <input type="time" id="sheet-horario-${slotKey}" value="09:00" style="font-size:1.1rem;font-weight:700;color:#fff;background:transparent;border:none;outline:none;width:100%;">
        </div>
        ` : ''}
        <span class="sheet-label" style="display:block;margin-bottom:8px;">Categoria</span>
        <select id="sheet-category-${slotKey}" style="margin-bottom:16px;">
          <option value="">— Categoria aleatória (padrão) —</option>
          ${options}
        </select>
        <div class="field-grid">
          <div>
            <span class="sheet-label">Preço mínimo (R$)</span>
            <div class="sheet-num-box"><input type="number" step="0.01" min="0" id="sheet-pricemin-${slotKey}" value="${slot.price_min}"></div>
          </div>
          <div>
            <span class="sheet-label">Preço máximo (R$)</span>
            <div class="sheet-num-box"><input type="number" step="0.01" min="0" id="sheet-pricemax-${slotKey}" value="${slot.price_max}"></div>
          </div>
        </div>
        <div class="field-grid">
          <div>
            <span class="sheet-label">Comissão mínima (%)</span>
            <div class="sheet-num-box"><input type="number" step="1" min="0" max="100" id="sheet-commission-${slotKey}" value="${commissionPercent}"></div>
          </div>
          <div>
            <span class="sheet-label">Vídeos neste horário</span>
            <div class="sheet-num-box"><input type="number" step="1" min="1" max="10" id="sheet-videos-${slotKey}" value="${slot.videos || 1}"></div>
          </div>
        </div>
        <div class="status" id="sheet-status-${slotKey}"></div>
        <div class="sheet-btn-row">
          <button class="btn btn-outline" onclick="closeDaySheet()">Cancelar</button>
          <button class="btn" onclick="${isNew ? `saveNewSlot(${dayOfWeek})` : `saveScheduleSlot(${dayOfWeek}, '${slot.horario}')`}">${isNew ? 'Criar horário' : 'Salvar alterações'}</button>
        </div>
        ${(!isNew && !slot.is_default) ? `
        <button class="cal-reset-link" onclick="${slot.is_default_horario ? `resetScheduleSlot(${dayOfWeek}, '${slot.horario}')` : `excluirHorarioExtra(${dayOfWeek}, '${slot.horario}')`}">${slot.is_default_horario ? 'Restaurar para o padrão' : '🗑️ Excluir horário'}</button>
        ` : ''}
      `;
      document.getElementById('daySheetOverlay').classList.add('open');
    }

    function openSlotSheet(dayOfWeek, horario) {
      const schedule = window.__SETTINGS_SCHEDULE || [];
      const day = schedule.find(d => d.day_of_week === dayOfWeek);
      if (!day) return;
      const slot = (day.slots || []).find(s => s.horario === horario);
      if (!slot) return;
      _renderSlotSheet(dayOfWeek, slot, false);
    }

    function openNewSlotSheet(dayOfWeek) {
      const blankSlot = { horario: '', category: null, price_min: 0, price_max: 99999, commission_min: 0, videos: 1, active: true, is_default: false };
      _renderSlotSheet(dayOfWeek, blankSlot, true);
    }

    function closeDaySheet(e) {
      if (e && e.target !== e.currentTarget) return;
      document.getElementById('daySheetOverlay').classList.remove('open');
    }

    function _readSlotForm(slotKey, isNew) {
      const category = document.getElementById('sheet-category-' + slotKey).value || null;
      const price_min = parseFloat(document.getElementById('sheet-pricemin-' + slotKey).value) || 0;
      const price_max = parseFloat(document.getElementById('sheet-pricemax-' + slotKey).value) || 99999;
      const commissionPercent = parseFloat(document.getElementById('sheet-commission-' + slotKey).value) || 0;
      const videos = parseInt(document.getElementById('sheet-videos-' + slotKey).value) || 1;
      const active = document.getElementById('sheet-active-' + slotKey).checked;
      const horario = isNew ? (document.getElementById('sheet-horario-' + slotKey)?.value || '09:00') : null;
      return { category, price_min, price_max, commission_min: commissionPercent / 100, videos, active, horario };
    }

    async function _submitSlot(dayOfWeek, horarioOriginal, horarioParaEnviar, formData, statusEl, btn) {
      const schedule = window.__SETTINGS_SCHEDULE || [];
      const day = schedule.find(d => d.day_of_week === dayOfWeek);
      const outrosSlots = day ? (day.slots || []).filter(s => s.horario !== horarioOriginal) : [];
      const totalVideosNoDia = outrosSlots.filter(s => s.active).reduce((sum, s) => sum + (s.videos || 1), 0)
        + (formData.active ? formData.videos : 0);

      if (totalVideosNoDia > 3 && !_calHasOwnOpenRouter) {
        openOpenRouterLimitModal();
        return false;
      }
      if (!_activeSubAccount) {
        showStatus(statusEl, 'Nenhuma sub-conta ativa.', 'err');
        return false;
      }

      // Aviso se agendamento for para menos de 7 minutos a partir de agora
      const agoraMinutos = (() => {
        const now = new Date();
        const sp = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
        return sp.getHours() * 60 + sp.getMinutes();
      })();
      const [hh, mm] = (horarioParaEnviar || '').split(':').map(Number);
      const slotMinutos = hh * 60 + (mm || 0);
      const diffMinutos = slotMinutos - agoraMinutos;
      if (diffMinutos >= 0 && diffMinutos < 7) {
        // Modal premium centralizado, não bloqueante — a pessoa lê e fecha
        // quando quiser, sem risco de a mensagem sumir sozinha junto com
        // o bottom-sheet de edição (que fecha em 700ms após salvar).
        showProximityModal();
        // Não bloqueia — só avisa, salva normalmente
      }

      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Salvando...';

      try {
        const res = await fetch(API + '/api/settings/schedule/' + dayOfWeek, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            subAccountId: _activeSubAccount.id,
            horario: horarioParaEnviar,
            category: formData.category,
            price_min: formData.price_min,
            price_max: formData.price_max,
            commission_min: formData.commission_min,
            videos: formData.videos,
            active: formData.active
          })
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.error || 'Erro ao salvar';
          if (/openrouter/i.test(msg)) {
            openOpenRouterLimitModal();
            btn.disabled = false;
            btn.textContent = originalText;
            return false;
          }
          throw new Error(msg);
        }

        window.__SETTINGS_SCHEDULE = data.schedule;
        showStatus(statusEl, 'Salvo com sucesso!', 'ok');
        document.getElementById('calDayCardWrap').innerHTML = renderCalDayCard(dayOfWeek);
        document.getElementById('calSummaryScroll').innerHTML = data.schedule.map(d => renderCalSummaryCard(d)).join('');
        setTimeout(() => closeDaySheet(), 700);
        return true;
      } catch(e) {
        showStatus(statusEl, '' + e.message, 'err');
        return false;
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    function showProximityModal() {
      document.getElementById('proximityModalOverlay').classList.add('open');
    }
    function closeProximityModal() {
      document.getElementById('proximityModalOverlay').classList.remove('open');
    }

    async function saveScheduleSlot(dayOfWeek, horario) {
      const st = document.getElementById('sheet-status-' + horario);
      const btn = document.querySelector('#daySheetContent .sheet-btn-row .btn:last-child');
      const formData = _readSlotForm(horario, false);
      await _submitSlot(dayOfWeek, horario, horario, formData, st, btn);
    }

    async function saveNewSlot(dayOfWeek) {
      const st = document.getElementById('sheet-status-__new__');
      const btn = document.querySelector('#daySheetContent .sheet-btn-row .btn:last-child');
      const formData = _readSlotForm('__new__', true);
      if (!formData.horario) {
        showStatus(st, 'Escolha um horário.', 'err');
        return;
      }
      await _submitSlot(dayOfWeek, formData.horario, formData.horario, formData, st, btn);
    }

    async function resetScheduleSlot(dayOfWeek, horario) {
      if (!_activeSubAccount) return;
      if (!confirm('Restaurar este horário para o padrão? A edição será perdida.')) return;
      try {
        const res = await fetch(API + '/api/settings/schedule/' + dayOfWeek + '/reset', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ subAccountId: _activeSubAccount.id, horario })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao restaurar');

        window.__SETTINGS_SCHEDULE = data.schedule;
        document.getElementById('calDayCardWrap').innerHTML = renderCalDayCard(dayOfWeek);
        document.getElementById('calSummaryScroll').innerHTML = data.schedule.map(d => renderCalSummaryCard(d)).join('');
        closeDaySheet();
      } catch(e) {
        alert('Erro ao restaurar: ' + e.message);
      }
    }

    // Excluir um horário EXTRA (criado pelo afiliado, fora dos horários
    // padrão globais). Usa o MESMO endpoint de reset — o backend já apaga
    // a linha, e como esse horário não faz parte da lista padrão, ele some
    // da lista de vez (não vira um "default virtual" como aconteceria com
    // um horário padrão). Só o texto/confirmação são diferentes, para
    // deixar claro que a ação é definitiva.
    async function excluirHorarioExtra(dayOfWeek, horario) {
      if (!_activeSubAccount) return;
      if (!confirm('Excluir este horário definitivamente? Ele vai sumir do calendário.')) return;
      try {
        const res = await fetch(API + '/api/settings/schedule/' + dayOfWeek + '/reset', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ subAccountId: _activeSubAccount.id, horario })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao excluir');

        window.__SETTINGS_SCHEDULE = data.schedule;
        document.getElementById('calDayCardWrap').innerHTML = renderCalDayCard(dayOfWeek);
        document.getElementById('calSummaryScroll').innerHTML = data.schedule.map(d => renderCalSummaryCard(d)).join('');
        closeDaySheet();
      } catch(e) {
        alert('Erro ao excluir: ' + e.message);
      }
    }

    // ===== TELA: EDITAR COM IA =====
    function showAiEditScreen() {
      hideAllCards();
      document.getElementById('pageSubtitle').style.display = 'block';
      document.getElementById('pageSubtitle').textContent = 'Editar com IA';
      document.getElementById('aiEditSection').style.display = 'block';
      document.getElementById('bottomNav').style.display = 'flex';
      document.getElementById('headerActions').style.display = 'flex';
      setActiveNav(null);
      renderAiProductList();
    }

    async function ensureSubAccountId() {
      if (_currentSubAccountId) return _currentSubAccountId;
      const res = await fetch(API + '/api/subaccounts', {
        headers: { 'Authorization': 'Bearer ' + SESSION.token }
      });
      const data = await res.json();
      const subs = data.subAccounts || [];
      if (!subs.length) throw new Error('Nenhuma sub-conta encontrada');
      _currentSubAccountId = subs[0].id;
      return _currentSubAccountId;
    }

    async function renderAiProductList() {
      const content = document.getElementById('aiEditContent');
      content.innerHTML = '<div class="loading">Carregando produtos do dia...</div>';

      if (!SESSION) {
        content.innerHTML = '<div class="status err" style="display:block;">Faça login para continuar.</div>';
        return;
      }

      try {
        const subAccountId = await ensureSubAccountId();
        const res = await fetch(API + '/api/products?subAccountId=' + subAccountId, {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao buscar produtos');

        const products = Array.isArray(data) ? data : (data.products || []);

        if (!products.length) {
          content.innerHTML = `
            <div style="text-align:center;padding:32px 20px;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.5" style="margin-bottom:16px;"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m8 21 4-4 4 4M12 17v4"/></svg>
              <div style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:8px;">Nenhum produto selecionado hoje</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.25);margin-bottom:24px;line-height:1.5;">A seleção automática roda diariamente.<br>Você pode buscar um produto agora.</div>
              <button class="btn" onclick="showSearchNowScreen()" style="margin:0 auto;">🔍 Buscar produto agora</button>
            </div>
          `;
          return;
        }

        content.innerHTML = `
          <div class="field-label" style="margin-top:0;">Escolha um produto para gerar/editar o conteúdo:</div>
          ${products.map(p => {
            const safeName = escapeHtml(p.name).replace(/'/g, "\\'");
            const safeImg  = (p.image_url || '').replace(/'/g, "\\'");
            const safePrice = escapeHtml(String(p.price || ''));
            const safeScore = parseFloat(p.score || 0).toFixed(1);
            return `
            <div style="background:#151515;border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:12px 14px;display:flex;gap:12px;align-items:center;margin-bottom:10px;">
              ${p.image_url ? `<img src="${p.image_url}" style="width:52px;height:52px;object-fit:cover;border-radius:12px;flex-shrink:0;cursor:pointer;" onclick="selectProductForAi(${p.id}, '${safeName}')">` : ''}
              <div style="flex:1;min-width:0;cursor:pointer;" onclick="selectProductForAi(${p.id}, '${safeName}')">
                <div style="font-weight:600;font-size:0.95rem;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(p.name)}</div>
                <div style="font-size:0.80rem;color:#8B8B8B;margin-top:3px;">R$ ${safePrice} &nbsp;·&nbsp; Score ${safeScore}</div>
              </div>
              <button
                onclick="openVideoCreatorFromProduct({id:${p.id},name:'${safeName}',image_url:'${safeImg}',price:'${safePrice}',score:${safeScore}})"
                style="flex-shrink:0;background:rgba(255,32,32,0.12);border:1px solid rgba(255,40,40,0.45);border-radius:12px;color:#FF2020;font-size:11px;font-weight:700;padding:8px 12px;cursor:pointer;letter-spacing:0.3px;white-space:nowrap;box-shadow:0 0 10px rgba(255,32,32,0.15);">
                + Vídeo
              </button>
            </div>`;
          }).join('')}
        `;
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>';
      }
    }

    async function selectProductForAi(productId, productName) {
      const content = document.getElementById('aiEditContent');
      content.innerHTML = `<div class="loading">Gerando conteúdo com IA para "${escapeHtml(productName)}"... (pode levar alguns segundos)</div>`;

      try {
        const subAccountId = await ensureSubAccountId();
        const res = await fetch(API + '/api/ai/generate', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ productId, subAccountId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao gerar conteúdo');

        renderAiContentEditor(data.content);
      } catch(e) {
        content.innerHTML = '<div class="status err" style="display:block;"> ' + escapeHtml(e.message) + '</div>' +
          '<button class="btn btn-outline" onclick="renderAiProductList()" style="margin-top:12px;">← Escolher outro produto</button>';
      }
    }

    function renderAiContentEditor(item) {
      const content = document.getElementById('aiEditContent');
      const fallbackNotice = item.ownKeyFailed
        ? '<div class="status err" style="display:block;margin-bottom:14px;">Sua chave OpenRouter própria falhou nesta geração. Usamos a IA global do sistema para não travar. Confira sua chave em Ajustes de IA.</div>'
        : '';
      content.innerHTML = `
        <button class="btn btn-outline" onclick="renderAiProductList()" style="margin-bottom:16px;">← Escolher outro produto</button>
        ${fallbackNotice}
        <div class="field-label" style="margin-top:0;">Título</div>
        <input type="text" id="ai-title" value="${escapeHtml(item.title || '')}" maxlength="80" oninput="generateUnifiedText()">

        <div class="field-label">Descrição</div>
        <textarea id="ai-description" style="width:100%;min-height:90px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px;color:#fff;font-size: 0.98rem;" oninput="generateUnifiedText()">${escapeHtml(item.description || '')}</textarea>

        <div class="field-label">Legenda</div>
        <input type="text" id="ai-caption" value="${escapeHtml(item.caption || '')}" oninput="generateUnifiedText()">

        <div class="field-label">Hashtags</div>
        <input type="text" id="ai-hashtags" value="${escapeHtml(item.hashtags || '')}" oninput="generateUnifiedText()">

        <div class="field-label">Narração</div>
        <textarea id="ai-narration" style="width:100%;min-height:70px;background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px;color:#fff;font-size: 0.98rem;">${escapeHtml(item.narration || '')}</textarea>

        <button class="btn btn-secondary" style="margin-top:14px;" onclick="saveAiContent(${item.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M5 3h11l3 3v15H5V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></svg>Salvar alterações</button>
        <div class="status" id="ai-save-status"></div>

        <div class="field-label" style="margin-top:22px;border-top:1px solid var(--border);padding-top:16px;">Texto unificado</div>
        <textarea id="ai-unified" readonly style="width:100%;min-height:120px;background:#141414;border:1px solid var(--border);border-radius:10px;padding:12px;color:#fff;font-size: 0.98rem;"></textarea>
        <button class="btn btn-secondary" style="margin-top:10px;" onclick="copyUnifiedText()">Copiar tudo</button>
        <div class="status" id="ai-copy-status"></div>

        <div class="field-label" style="margin-top:22px;border-top:1px solid var(--border);padding-top:16px;">Vídeo e Capa</div>
        <div style="font-size: 0.88rem;color:#999;margin-bottom:10px;">Já fez o vídeo no YouTube Create? Empacota aqui, envia o vídeo e escolhe a capa antes de publicar.</div>
        <button class="btn btn-outline" onclick="createPackageForContent(${item.id})">Empacotar (vídeo + capa)</button>
        <div class="status" id="ai-package-status"></div>
        <div id="ai-packaging-area"></div>
      `;
      generateUnifiedText();
    }

    async function saveAiContent(contentId) {
      const st = document.getElementById('ai-save-status');
      const btn = document.querySelector('#aiEditContent .btn-secondary');
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Salvando...';

      try {
        const res = await fetch(API + '/api/ai/' + contentId, {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            title: document.getElementById('ai-title').value,
            description: document.getElementById('ai-description').value,
            caption: document.getElementById('ai-caption').value,
            hashtags: document.getElementById('ai-hashtags').value,
            narration: document.getElementById('ai-narration').value,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
        showStatus(st, 'Salvo com sucesso!', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }

    function stripPrice(text) {
      return (text || '')
        .replace(/R\$\s?\d{1,3}(\.\d{3})*(,\d{2})?/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,!?])/g, '$1')
        .trim();
    }

    function generateUnifiedText() {
      const title = (document.getElementById('ai-title')?.value || '').trim();
      const description = stripPrice(document.getElementById('ai-description')?.value);
      const caption = stripPrice(document.getElementById('ai-caption')?.value);
      const hashtagsRaw = document.getElementById('ai-hashtags')?.value || '';

      const topHashtags = hashtagsRaw
        .split(/\s+/)
        .filter(t => t.startsWith('#'))
        .slice(0, 5)
        .join(' ');

      const parts = [title, description, caption, topHashtags].filter(Boolean);
      const unified = parts.join('\n\n');

      const unifiedEl = document.getElementById('ai-unified');
      if (unifiedEl) unifiedEl.value = unified;
    }

    function copyUnifiedText() {
      const el = document.getElementById('ai-unified');
      const st = document.getElementById('ai-copy-status');
      el.select();
      el.setSelectionRange(0, 999999);
      try {
        navigator.clipboard.writeText(el.value).then(() => {
          showStatus(st, 'Copiado!', 'ok');
        }).catch(() => {
          document.execCommand('copy');
          showStatus(st, 'Copiado!', 'ok');
        });
      } catch(e) {
        document.execCommand('copy');
        showStatus(st, 'Copiado!', 'ok');
      }
    }

    // ===== EMPACOTAMENTO MANUAL: vídeo + capa =====
    async function createPackageForContent(contentId) {
      const st = document.getElementById('ai-package-status');
      showStatus(st, 'Criando pacote...', 'info');
      try {
        const res = await fetch(API + '/api/packaging/create', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ contentId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao criar pacote');
        showStatus(st, 'Pacote criado! Envie o vídeo abaixo.', 'ok');
        renderPackagingArea(data.videoId);
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      }
    }

    function renderPackagingArea(videoId) {
      const area = document.getElementById('ai-packaging-area');
      area.innerHTML = `
        <div class="field-label">Envie o vídeo (MP4)</div>
        <input type="file" id="ai-video-file" accept="video/mp4" style="color:#fff;margin-bottom:10px;">
        <button class="btn btn-outline" onclick="uploadAiVideo(${videoId})">Enviar vídeo</button>
        <div id="ai-video-preview-area"></div>
      `;
    }

    async function uploadAiVideo(videoId) {
      const fileInput = document.getElementById('ai-video-file');
      const st = document.getElementById('ai-package-status');
      if (!fileInput.files || !fileInput.files.length) {
        showStatus(st, 'Selecione um vídeo MP4 primeiro.', 'err');
        return;
      }
      const file = fileInput.files[0];
      showStatus(st, 'Enviando vídeo, aguarde...', 'info');

      try {
        const formData = new FormData();
        formData.append('video', file);
        const res = await fetch(API + '/api/video/' + videoId + '/upload', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao enviar vídeo');
        showStatus(st, 'Vídeo enviado! Escolha o frame de capa abaixo.', 'ok');
        renderVideoPreviewForCapture(videoId, data.fileUrl);
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      }
    }

    function renderVideoPreviewForCapture(videoId, fileUrl) {
      const area = document.getElementById('ai-video-preview-area');
      area.innerHTML = `
        <video id="ai-video-preview" src="${fileUrl}" controls playsinline style="width:100%;border-radius:10px;margin-top:12px;background:#000;"></video>
        <div style="font-size: 0.83rem;color:#999;margin-top:6px;">Pause no momento que quiser usar como capa e toque no botão abaixo.</div>
        <button class="btn btn-outline" style="margin-top:8px;" onclick="captureThumbnailFrame(${videoId})"> Capturar capa neste momento</button>
        <canvas id="ai-thumb-canvas" style="display:none;"></canvas>
        <div>
          <div class="field-label" style="margin-top:10px;">Capa escolhida:</div>
          <img id="ai-thumb-preview" style="display:none;max-width:160px;border-radius:8px;border:2px solid var(--red);">
        </div>
      `;
    }

    function captureThumbnailFrame(videoId) {
      const video = document.getElementById('ai-video-preview');
      const canvas = document.getElementById('ai-thumb-canvas');
      if (!video || !video.videoWidth) {
        const st = document.getElementById('ai-package-status');
        showStatus(st, 'Aguarde o vídeo carregar antes de capturar.', 'err');
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        uploadThumbnailBlob(videoId, blob);
      }, 'image/jpeg', 0.9);
    }

    async function uploadThumbnailBlob(videoId, blob) {
      const st = document.getElementById('ai-package-status');
      showStatus(st, 'Enviando capa...', 'info');
      try {
        const formData = new FormData();
        formData.append('thumbnail', blob, 'capa.jpg');
        const res = await fetch(API + '/api/video/' + videoId + '/thumbnail', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token },
          body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao salvar capa');

        const preview = document.getElementById('ai-thumb-preview');
        preview.src = URL.createObjectURL(blob);
        preview.style.display = 'block';
        showStatus(st, 'Capa salva com sucesso!', 'ok');
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      }
    }

    async function checkPushStatus() {
      const dot  = document.getElementById('pushDot');
      const text = document.getElementById('pushText');
      const btn  = document.getElementById('pushBtn');
      if (!('PushManager' in window)) {
        dot.className = 'dot red';
        text.textContent = 'Push não suportado — instale como app';
        btn.style.display = 'none';
        return;
      }
      const perm = Notification.permission;
      if (perm === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          dot.className = 'dot green';
          text.textContent = 'Notificações ativas ';
          btn.textContent = 'Reativar';
          return;
        }
      }
      if (perm === 'denied') {
        dot.className = 'dot red';
        text.textContent = 'Bloqueado — libere nas configurações';
        btn.style.display = 'none';
        return;
      }
      dot.className = 'dot yellow';
      text.textContent = 'Notificações não ativadas';
    }

    async function requestPush() {
      const btn = document.getElementById('pushBtn');
      const st  = document.getElementById('pushStatus');
      if (!SESSION) { showStatus(st, 'Faça login primeiro.', 'err'); return; }
      btn.disabled = true;
      btn.textContent = 'Ativando...';
      try {
        const keyRes = await fetch(API + '/api/push/vapid-key');
        const keyData = await keyRes.json();
        const publicKey = keyData.publicKey;

        const reg  = await navigator.serviceWorker.ready;
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') throw new Error('Permissão negada');

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicKey)
        });

        const affiliateId = SESSION.affiliate ? SESSION.affiliate.id : SESSION.id;
        const token = SESSION.token;

        const saveRes = await fetch(API + '/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({ affiliateId, subscription: sub.toJSON() })
        });

        if (!saveRes.ok) {
          const errData = await saveRes.json();
          throw new Error(errData.error || 'Erro ao salvar');
        }

        showStatus(st, 'Notificações ativadas!', 'ok');
        checkPushStatus();
      } catch(e) {
        showStatus(st, '' + e.message, 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ativar Notificações';
      }
    }

    function showStatus(el, msg, type) {
      el.textContent = msg;
      el.className = 'status ' + type;
    }

    // ═══════════════════════════════════════════════
    // CRIADOR DE VÍDEO COM IA
    // ═══════════════════════════════════════════════

    function openVideoCreatorFromProduct(p) {
      // Abre o Criador de Vídeo pré-preenchido com dados do produto
      showVideoCreatorScreen();

      // Guarda o produto vinculado — necessário para, ao final, criar o
      // pacote de verdade (content + package) e liberar o upload do vídeo
      // pronto, fechando o fluxo até o push2.
      window._vcProductId = p.id || null;
      window._vcProductLink = p.affiliate_link || p.offerLink || null;

      // Preenche o prompt com nome + dados relevantes do produto
      const promptEl = document.getElementById('vc-prompt');
      const countEl  = document.getElementById('vc-prompt-count');
      if (promptEl) {
        const txt = p.name + (p.price ? ' — R$ ' + p.price : '') + (p.score ? ' — Score ' + p.score : '');
        promptEl.value = txt;
        if (countEl) countEl.textContent = txt.length + '/1500';
      }

      // Carrega imagem do produto no slot 0 do passo 2
      if (p.image_url) {
        setTimeout(async () => {
          try {
            const res  = await fetch(p.image_url);
            const blob = await res.blob();
            const file = new File([blob], 'produto.jpg', { type: blob.type || 'image/jpeg' });
            const input = document.getElementById('vc-img-input-0');
            if (input) {
              const dt = new DataTransfer();
              dt.items.add(file);
              input.files = dt.files;
              vcPreviewImg(0, input);
            }
          } catch(e) {
            console.warn('[VideoCreator] Imagem do produto não carregada:', e.message);
          }
        }, 450);
      }
    }

    function showVideoCreatorScreen() {
      try {
        hideAllCards();
        const sec = document.getElementById('videoCreatorSection');
        if (sec) sec.style.display = 'block';
        const bn = document.getElementById('bottomNav');
        if (bn) bn.style.display = 'flex';
        const ha = document.getElementById('headerActions');
        if (ha) ha.style.display = 'flex';
        setActiveNav('navVideoIA');
        vcGoStep(1);
        // Limpar qualquer erro anterior
        const oldErr = document.querySelector('.vc-err-msg');
        if (oldErr) oldErr.remove();
      } catch(e) {
        console.error('[VideoCreator] Erro ao abrir:', e);
      }
    }

    function vcGoStep(n) {
      _vcCurrentStep = n;
      // Esconder todos os passos e telas
      [1,2,3].forEach(i => {
        const el = document.getElementById('vc-passo-' + i);
        if (el) el.style.display = 'none';
      });
      ['vc-step-gerando','vc-step-resultado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      });

      // Mostrar passo atual
      if (n <= 3) {
        const el = document.getElementById('vc-passo-' + n);
        if (el) el.style.display = 'block';
      }

      // Atualizar steps bar
      [0,1,2,3].forEach(i => {
        const dot = document.getElementById('vcs-' + i);
        if (!dot) return;
        dot.classList.remove('active','done');
        if (i + 1 < n) dot.classList.add('done');
        else if (i + 1 === n) dot.classList.add('active');
      });
    }

    function vcShowStep(step) {
      [1,2,3].forEach(i => {
        const el = document.getElementById('vc-passo-' + i);
        if (el) el.style.display = 'none';
      });
      const gerando   = document.getElementById('vc-step-gerando');
      const resultado = document.getElementById('vc-step-resultado');
      if (gerando)   gerando.style.display   = step === 'gerando'   ? 'block' : 'none';
      if (resultado) resultado.style.display = step === 'resultado' ? 'block' : 'none';
      if (step === 'gerando')   _vcCurrentStep = 'gerando';
      if (step === 'resultado') _vcCurrentStep = 'resultado';
      if (step === 'editor') vcGoStep(1);
      // Steps bar
      if (step === 'gerando') {
        [0,1,2,3].forEach(i => {
          const dot = document.getElementById('vcs-' + i);
          if (dot) { dot.classList.remove('active','done'); dot.classList.add(i < 3 ? 'done' : 'active'); }
        });
      }
    }

    function vcSelect(groupId, el) {
      document.querySelectorAll('#' + groupId + ' .vc-chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    }

    // ── REFINAR LEGENDA COM IA ──
    function rlGetHistorico() {
      try { return JSON.parse(localStorage.getItem('rl_historico') || '[]'); }
      catch (e) { return []; }
    }
    function rlSalvarHistorico(item) {
      const hist = rlGetHistorico();
      hist.unshift(item);
      localStorage.setItem('rl_historico', JSON.stringify(hist.slice(0, 8)));
      rlRenderHistorico();
    }
    function rlRenderHistorico() {
      const hist = rlGetHistorico();
      const wrap = document.getElementById('rl-historico-wrap');
      const list = document.getElementById('rl-historico');
      if (!hist.length) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      list.innerHTML = hist.map(h => `
        <div class="ae-action" style="cursor:pointer;" onclick="rlUsarHistorico('${h.id}')">
          <div class="ae-action-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></div>
          <div class="ae-action-text">
            <div class="ae-action-title">${h.ajusteLabel}</div>
            <div class="ae-action-sub">${(h.legenda || '').slice(0, 60)}${(h.legenda||'').length > 60 ? '…' : ''}</div>
          </div>
        </div>`).join('');
      window._rlHistorico = hist;
    }
    function rlUsarHistorico(id) {
      const item = (window._rlHistorico || []).find(h => h.id === id);
      if (!item) return;
      window._rlUltimoResultado = item;
      document.getElementById('rl-legenda-texto').textContent = item.legenda || '';
      document.getElementById('rl-hashtags-texto').textContent = item.hashtags || '';
      document.getElementById('rl-resultado').style.display = 'block';
    }

    async function doRefinarLegenda() {
      const texto = document.getElementById('rl-texto').value.trim();
      const statusEl = document.getElementById('rl-status');
      const btn = document.getElementById('rl-btn');
      statusEl.className = 'status';
      statusEl.style.display = 'none';

      if (!texto) {
        statusEl.className = 'status err';
        statusEl.textContent = 'Cole uma legenda antes de refinar.';
        statusEl.style.display = 'block';
        return;
      }

      const chipAtivo = document.querySelector('#rl-ajuste .vc-chip.active');
      const ajuste = chipAtivo ? chipAtivo.getAttribute('data-value') : 'mais_vendedora';
      const ajusteLabel = chipAtivo ? chipAtivo.textContent : 'Mais vendedora';
      const promptLivre = document.getElementById('rl-prompt-livre').value.trim();

      btn.disabled = true;
      btn.textContent = 'Refinando...';
      document.getElementById('rl-resultado').style.display = 'none';

      try {
        const res = await fetch(API + '/api/ai/refinar-legenda', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ texto, ajuste, prompt_livre: promptLivre || undefined })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao refinar legenda');

        const legenda = data.legenda || data.caption || '';
        const hashtags = data.hashtags || '';

        document.getElementById('rl-legenda-texto').textContent = legenda;
        document.getElementById('rl-hashtags-texto').textContent = hashtags;
        document.getElementById('rl-resultado').style.display = 'block';

        const item = { id: Date.now().toString(), ajusteLabel, legenda, hashtags };
        window._rlUltimoResultado = item;
        rlSalvarHistorico(item);

        statusEl.className = 'status ok';
        statusEl.textContent = 'Legenda refinada com sucesso!';
        statusEl.style.display = 'block';
      } catch (err) {
        statusEl.className = 'status err';
        statusEl.textContent = err.message || 'Erro ao refinar legenda.';
        statusEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Refinar com IA';
      }
    }

    function rlCopiar(tipo) {
      const item = window._rlUltimoResultado;
      if (!item) return;
      const texto = tipo === 'hashtags' ? (item.hashtags || '') : (item.legenda || '');
      navigator.clipboard.writeText(texto).then(() => {
        const statusEl = document.getElementById('rl-status');
        statusEl.className = 'status ok';
        statusEl.textContent = tipo === 'hashtags' ? 'Hashtags copiadas!' : 'Legenda copiada!';
        statusEl.style.display = 'block';
      });
    }

    function vcPreviewImg(idx, input) {
      if (!input.files || !input.files[0]) return;
      const preview = document.getElementById('vc-img-preview-' + idx);
      const slot    = document.getElementById('vc-img-slot-' + idx);
      const plus    = document.getElementById('vc-img-plus-' + idx);
      const lbl     = document.getElementById('vc-img-lbl-' + idx);
      const url     = URL.createObjectURL(input.files[0]);
      if (preview) { preview.src = url; preview.style.display = 'block'; }
      if (plus) plus.style.display = 'none';
      if (lbl)  lbl.style.display  = 'none';
      if (slot) slot.classList.add('has-img');
    }

    function vcGetSelected(groupId) {
      const el = document.querySelector('#' + groupId + ' .vc-chip.active');
      return el ? el.textContent.trim() : '';
    }

    // Converte File para base64
    function vcFileToBase64(file) {
      return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
    }

    async function vcGerarVideo() {
      const prompt = (document.getElementById('vc-prompt').value || '').trim();
      if (!prompt) {
        alert('Digite um prompt para descrever seu vídeo.');
        return;
      }

      // Coletar opções
      const formato  = vcGetSelected('vc-formato');
      const duracao  = vcGetSelected('vc-duracao');
      const estilo   = vcGetSelected('vc-estilo');
      const narrador = vcGetSelected('vc-narrador');
      const legendas = document.getElementById('vc-legendas').classList.contains('on');

      // Coletar imagens (base64)
      const imagens = [];
      for (let i = 0; i < 3; i++) {
        const inp = document.getElementById('vc-img-input-' + i);
        if (inp.files && inp.files[0]) {
          try {
            const b64  = await vcFileToBase64(inp.files[0]);
            const mime = inp.files[0].type || 'image/jpeg';
            imagens.push({ b64, mime });
          } catch(e) {}
        }
      }

      // Mudar para tela de geração
      vcShowStep('gerando');
      vcStartProgress();

      try {
        const roteiro = await vcGerarComHierarquia(prompt, formato, duracao, estilo, narrador, legendas, imagens);
        vcShowResultado(roteiro, prompt, formato, duracao, estilo, narrador);
      } catch(e) {
        clearInterval(_vcProgressTimer);
        vcShowStep('editor');
        // Limpar erro anterior antes de mostrar novo
        const oldErr2 = document.querySelector('#vc-step-editor .vc-err-msg');
        if (oldErr2) oldErr2.remove();
        // Mostrar erro visível dentro do card
        const errBox = document.createElement('div');
        errBox.className = 'status err';
        errBox.style.cssText = 'display:block;margin-top:12px;';
        errBox.textContent = '❌ ' + e.message;
        const card = document.querySelector('#vc-step-editor .card');
        if (card) {
          const old = card.querySelector('.vc-err-msg');
          if (old) old.remove();
          errBox.classList.add('vc-err-msg');
          card.appendChild(errBox);
          // Rola a tela até o erro — sem isso, a mensagem ficava fora da
          // área visível e parecia "sumir rápido" na transição de tela.
          errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        console.error('[Criador de Vídeo] Erro ao gerar roteiro:', e.message);
      }
    }

    // ── HIERARQUIA EXCLUSIVA DO CRIADOR DE VÍDEO ──────────────────────────
    // 1º Gemini Pro  → chave GLOBAL do servidor
    // 2º Nemotron    → chave OpenRouter da SUB-CONTA
    // 3º Nemotron    → chave OpenRouter GLOBAL do servidor
    // NÃO interfere com a hierarquia do gerador automático existente.
    // ──────────────────────────────────────────────────────────────────────

    const VC_SYSTEM_PROMPT = (formato, duracao, estilo, narrador, legendas) =>
      `Você é um roteirista especialista em vídeos para redes sociais de afiliados e criadores de conteúdo brasileiro.
Crie um roteiro completo para um vídeo ${formato} de ${duracao}, estilo ${estilo}, narrador ${narrador}${legendas ? ', com legendas automáticas' : ''}.

Responda EXATAMENTE neste formato JSON puro (sem markdown, sem backticks, sem comentários):
{
  "titulo": "Título chamativo do vídeo (máx 60 caracteres)",
  "gancho": "Frase de abertura impactante para os primeiros 3 segundos",
  "roteiro": "Roteiro completo cena a cena com timestamps. Ex: [00:00] Cena 1...",
  "narracao": "Texto completo da narração para ser gravado em voz off",
  "legenda": "Legenda completa para redes sociais com emojis e chamada para ação",
  "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5 #tag6 #tag7",
  "cta": "Call to action final do vídeo",
  "dicas": "3 dicas práticas de produção para este vídeo específico"
}`;

    function vcParseJson(raw) {
      try {
        const clean = raw.replace(/```json|```/g, '').trim();
        const match = clean.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
      } catch(e) { return null; }
    }

    // Carrega ai-settings da sub-conta ativa (openrouter_api_key)
    async function vcLoadSubSettings() {
      if (!SESSION) return {};
      const subId = _activeSubAccount ? _activeSubAccount.id : null;
      if (!subId) return {};
      try {
        const res = await fetch(API + '/api/subaccounts/' + subId + '/ai-settings', {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        if (!res.ok) return {};
        const data = await res.json();
        return data.settings || data || {};
      } catch(e) { return {}; }
    }

    // Carrega chave Gemini Pro global do servidor (endpoint exclusivo do Criador de Vídeo)
    async function vcLoadGlobalKeys() {
      try {
        const res = await fetch(API + '/api/subaccounts/system/gemini-key', {
          headers: { 'Authorization': 'Bearer ' + (SESSION ? SESSION.token : '') }
        });
        if (!res.ok) return {};
        const data = await res.json();
        // Retorna no formato esperado pelo orquestrador
        return { gemini_key: data.gemini_key || '', gemini_model: data.model || 'gemini-2.5-pro' };
      } catch(e) { return {}; }
    }

    // 1º tentativa: Gemini Pro com chave global
    async function vcChamarGemini(geminiKey, geminiModel, prompt, formato, duracao, estilo, narrador, legendas, imagens) {
      const parts = [];
      // Imagens primeiro (inline_data)
      for (const img of imagens) {
        parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
      }
      parts.push({
        text: (imagens.length ? 'Usando as imagens acima como referência do produto, ' : '') +
              'Crie um roteiro para: ' + prompt
      });

      const body = {
        system_instruction: { parts: [{ text: VC_SYSTEM_PROMPT(formato, duracao, estilo, narrador, legendas) }] },
        contents: [{ role: 'user', parts }],
        generationConfig: { temperature: 0.85, maxOutputTokens: 2048 }
      };

      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + geminiModel + ':generateContent?key=' + geminiKey,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error && err.error.message) || 'Gemini erro ' + res.status);
      }
      const data = await res.json();
      const raw  = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      const parsed = vcParseJson(raw);
      if (!parsed) throw new Error('Gemini retornou resposta inválida.');
      return parsed;
    }

    // 2º/3º tentativa: Nemotron via OpenRouter
    async function vcChamarNemotron(orKey, prompt, formato, duracao, estilo, narrador, legendas, imagens) {
      const userContent = [];
      for (const img of imagens) {
        userContent.push({ type: 'image_url', image_url: { url: 'data:' + img.mime + ';base64,' + img.b64 } });
      }
      userContent.push({
        type: 'text',
        text: (imagens.length ? 'Usando as imagens acima como referência do produto, crie um roteiro para: ' : 'Crie um roteiro para: ') + prompt
      });

      const body = {
        model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1:free',
        messages: [
          { role: 'system', content: VC_SYSTEM_PROMPT(formato, duracao, estilo, narrador, legendas) },
          { role: 'user',   content: userContent }
        ],
        temperature: 0.82,
        max_tokens: 2048
      };

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + orKey,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://afilia.app',
          'X-Title': 'Afilia IA'
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err.error && err.error.message) || 'OpenRouter erro ' + res.status);
      }
      const data = await res.json();
      const raw  = (data.choices?.[0]?.message?.content || '').trim();
      const parsed = vcParseJson(raw);
      if (!parsed) throw new Error('OpenRouter retornou resposta inválida.');
      return parsed;
    }

    // Orquestrador: chama o backend que gerencia a hierarquia Gemini → OpenRouter
    async function vcGerarComHierarquia(prompt, formato, duracao, estilo, narrador, legendas, imagens) {
      if (!SESSION) throw new Error('Faça login para usar a IA.');

      const subAccountId = _activeSubAccount ? _activeSubAccount.id : null;

      const body = { prompt, formato, duracao, estilo, narrador, legendas, subAccountId, imagens };

      const res = await fetch(API + '/api/ai/video-script', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SESSION.token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao gerar roteiro.');
      if (!data.roteiro) throw new Error('Resposta inválida do servidor.');
      return data.roteiro;
    }

    // Animação de progresso
    let _vcProgressTimer = null;
    let _vcCurrentStep = 1;

    function vcVoltar() {
      if (_vcCurrentStep === "resultado") {
        vcGoStep(3);
        _vcCurrentStep = 3;
      } else if (_vcCurrentStep === "gerando") {
        return;
      } else if (_vcCurrentStep > 1) {
        vcGoStep(_vcCurrentStep - 1);
        _vcCurrentStep--;
      } else {
        if (confirm("Sair do Criador de Vídeo? O prompt será perdido.")) showDash();
      }
    }
    function vcStartProgress() {
      let pct = 0;
      const steps  = ['vc-si-0','vc-si-1','vc-si-2','vc-si-3','vc-si-4'];
      const targets = [15, 30, 55, 75, 95];

      // Reset
      steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'vc-check-item';
      });
      vcSetProgress(0);

      clearInterval(_vcProgressTimer);
      _vcProgressTimer = setInterval(() => {
        if (pct < 95) {
          pct = Math.min(pct + (Math.random() * 3 + 0.5), 95);
          vcSetProgress(Math.floor(pct));
          for (let i = 0; i < targets.length; i++) {
            const el = document.getElementById(steps[i]);
            if (!el) continue;
            if (pct >= targets[i]) {
              el.className = 'vc-check-item done';
            } else if (i === 0 || pct >= targets[i-1]) {
              el.className = 'vc-check-item active';
            }
          }
        }
      }, 180);
    }

    function vcSetProgress(pct) {
      const ring = document.getElementById('vc-progress-ring');
      const pctEl = document.getElementById('vc-progress-pct');
      if (!ring || !pctEl) return;
      const circumference = 427;
      ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
      pctEl.textContent = pct + '%';
    }

    function vcShowResultado(roteiro, prompt, formato, duracao, estilo, narrador) {
      clearInterval(_vcProgressTimer);
      vcSetProgress(100);
      ['vc-si-0','vc-si-1','vc-si-2','vc-si-3','vc-si-4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.classList.remove('active'); el.classList.add('done'); }
      });

      setTimeout(() => {
        vcShowStep('resultado');
        const container = document.getElementById('vc-resultado-content');
        const legTxt = (roteiro.legenda || '') + (roteiro.hashtags ? '\n\n' + roteiro.hashtags : '');

        // Guarda o roteiro completo para o botão único de cópia
        window._vcRoteiroAtual = roteiro;
        window._vcPromptOriginal = prompt;

        container.innerHTML = `
          <div class="vc-result-hero">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;">
              <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,31,31,0.12);border:1px solid rgba(255,31,31,0.25);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff1f1f" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              </div>
              <div>
                <div style="font-size:9px;font-weight:700;color:rgba(255,31,31,0.5);letter-spacing:2px;text-transform:uppercase;">Roteiro Pronto</div>
                <div style="font-size:16px;font-weight:800;color:#fff;margin-top:2px;">${escapeHtml(roteiro.titulo || 'Roteiro Gerado')}</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
              <span style="padding:5px 12px;border-radius:100px;background:rgba(255,31,31,0.1);border:1px solid rgba(255,31,31,0.2);font-size:11px;font-weight:600;color:rgba(255,31,31,0.7);">${escapeHtml(formato)}</span>
              <span style="padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);">${escapeHtml(duracao)}</span>
              <span style="padding:5px 12px;border-radius:100px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);">${escapeHtml(estilo)}</span>
            </div>
          </div>

          <div class="vc-result-card" style="margin-top:12px;background:rgba(255,31,31,0.06);border-color:rgba(255,31,31,0.25);">
            <button class="vc-btn-gerar" style="margin:0;width:100%;" onclick="vcCopiarTudo()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              Copiar Prompt Completo
            </button>
            <div style="font-size:11px;color:#8B8B8B;text-align:center;margin-top:8px;">Copia roteiro + narração + legenda + CTA + dicas + prompt em inglês, tudo junto</div>
            <div class="status" id="vc-copy-status" style="margin-top:8px;"></div>
          </div>

          ${roteiro.gancho ? `
          <div class="vc-result-card" style="margin-top:12px;">
            <div class="vc-result-label">🎯 Gancho de Abertura</div>
            <div class="vc-result-text">${escapeHtml(roteiro.gancho)}</div>
          </div>` : ''}

          <div class="vc-result-card">
            <div class="vc-result-label">🎬 Roteiro Completo</div>
            <div class="vc-result-text" id="vc-roteiro-text">${escapeHtml(roteiro.roteiro || '')}</div>
          </div>

          ${roteiro.narracao ? `
          <div class="vc-result-card">
            <div class="vc-result-label">🎙️ Narração — ${escapeHtml(narrador)} <span style="font-weight:400;color:#8B8B8B;">(${roteiro.narracao.length}/850)</span></div>
            <div class="vc-result-text">${escapeHtml(roteiro.narracao)}</div>
          </div>` : ''}

          ${legTxt ? `
          <div class="vc-result-card">
            <div class="vc-result-label">📱 Legenda + Hashtags</div>
            <div class="vc-result-text" id="vc-legenda-text">${escapeHtml(legTxt)}</div>
          </div>` : ''}

          ${roteiro.cta ? `
          <div class="vc-result-card">
            <div class="vc-result-label">🔥 Call to Action</div>
            <div class="vc-result-text">${escapeHtml(roteiro.cta)}</div>
          </div>` : ''}

          ${roteiro.dicas ? `
          <div class="vc-result-card">
            <div class="vc-result-label">💡 Dicas de Produção</div>
            <div class="vc-result-text">${escapeHtml(roteiro.dicas)}</div>
          </div>` : ''}

          <div class="vc-result-card" style="margin-top:12px;">
            <div class="vc-result-label" style="margin-bottom:10px;">Prompt para gerar o vídeo (EN)</div>
            <div id="vc-prompt-en-text" style="font-size:13px;color:#CFCFCF;line-height:1.6;word-break:break-word;">${escapeHtml(roteiro.video_prompt_en || prompt)}</div>
          </div>

          <div style="padding:0 16px 8px;">
            <div style="font-size:11px;font-weight:700;color:#8B8B8B;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:12px;">Gerar vídeo com</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">

              <button onclick="openYoutubeCreate()" style="background:#151515;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(255,40,40,0.45)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#FF0000"/><polygon points="10,8 17,12 10,16" fill="#fff"/></svg>
                <span style="font-size:12px;font-weight:700;color:#fff;">YouTube Create</span>
                <span style="font-size:10px;color:#8B8B8B;">Edição automática</span>
              </button>

              <button onclick="vcAbrirVeo()" style="background:#151515;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(255,40,40,0.45)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#1A73E8"/><path d="M7 8l10 4-10 4V8z" fill="#fff"/><circle cx="17" cy="8" r="2.5" fill="#34A853"/></svg>
                <span style="font-size:12px;font-weight:700;color:#fff;">Veo 3.1</span>
                <span style="font-size:10px;color:#8B8B8B;">Google IA</span>
              </button>

              <button onclick="vcAbrirApp('vids')" style="background:#151515;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(255,40,40,0.45)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#34A853"/><text x="4" y="17" font-size="13" font-weight="bold" fill="#fff">Vids</text></svg>
                <span style="font-size:12px;font-weight:700;color:#fff;">Google Vids</span>
                <span style="font-size:10px;color:#8B8B8B;">Apresentações IA</span>
              </button>

              <button onclick="vcAbrirApp('gemini')" style="background:#151515;border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:14px 10px;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;transition:border-color 0.2s;" onmouseover="this.style.borderColor='rgba(255,40,40,0.45)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)'">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="6" fill="#8B5CF6"/><path d="M12 5l2 6h6l-5 3.5 2 6L12 17l-5 3.5 2-6L4 11h6z" fill="#fff"/></svg>
                <span style="font-size:12px;font-weight:700;color:#fff;">Gemini</span>
                <span style="font-size:10px;color:#8B8B8B;">Multimodal IA</span>
              </button>

            </div>

            <div id="vc-veo-status" class="status" style="display:none;margin-bottom:10px;"></div>

            ${window._vcProductId ? `
            <div id="vc-finalizar-wrap" style="margin-top:4px;">
              <button class="btn" style="width:100%;" onclick="vcFinalizarEEnviar()" id="vc-finalizar-btn">
                Finalizar
              </button>
              <div class="status" id="vc-finalizar-status" style="margin-top:8px;"></div>
              <div id="vc-upload-wrap" style="display:none;margin-top:14px;">
                <div style="font-size:11px;font-weight:700;color:#8B8B8B;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Já gerou o vídeo?</div>
                <button class="btn" style="width:100%;" onclick="vcEnviarVideo()" id="vc-enviar-video-btn">Vídeo pronto</button>
                <div class="status" id="vc-enviar-status" style="margin-top:8px;"></div>
              </div>
            </div>
            ` : `
            <div class="status" style="margin-top:4px;" >Este roteiro não está vinculado a um produto — abra o Criador de Vídeo a partir de um produto (em "Produtos") para poder publicar e enviar o vídeo pronto.</div>
            `}

            <button class="vc-btn-secondary" style="margin:12px 0 0;width:100%;" onclick="vcNovoVideo()">Criar novo vídeo</button>
          </div>
        `;
      }, 600);
    }

    // Cria o pacote (content + package) a partir do roteiro já gerado,
    // liberando a seção de upload do vídeo pronto. Chamada uma única vez;
    // se já existir um packageId para este roteiro, só reabre a seção.
    async function vcFinalizarEEnviar() {
      const st = document.getElementById('vc-finalizar-status');
      const btn = document.getElementById('vc-finalizar-btn');

      if (window._vcPackageId) {
        document.getElementById('vc-upload-wrap').style.display = 'block';
        return;
      }

      if (!window._vcProductId) {
        showStatus(st, 'Este roteiro não está vinculado a um produto.', 'err');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Finalizando...';
      try {
        const res = await fetch(API + '/api/ai/video-script/finalizar', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + SESSION.token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            roteiro: window._vcRoteiroAtual,
            productId: window._vcProductId,
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao finalizar roteiro.');

        window._vcPackageId = data.packageId;
        showStatus(st, 'Pronto! Confirme quando o vídeo estiver gerado.', 'ok');
        document.getElementById('vc-upload-wrap').style.display = 'block';
        btn.textContent = 'Finalizado';
      } catch(e) {
        showStatus(st, 'Erro: ' + e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Finalizar';
      }
    }

    // Dispara Push 2 a partir do Criador de Vídeo via confirm-ready.
    async function vcEnviarVideo() {
      const btn = document.getElementById('vc-enviar-video-btn');
      const st = document.getElementById('vc-enviar-status');

      if (!window._vcPackageId) {
        showStatus(st, 'Finalize o roteiro primeiro.', 'err');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Confirmando...';
      showStatus(st, 'Aguarde, finalizando o pacote...', 'info');
      try {
        // 1. Busca o pacote para extrair o videoId
        const res = await fetch(API + '/api/packaging/' + window._vcPackageId, {
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const pkg = await res.json();
        if (!res.ok) throw new Error(pkg.error || 'Erro ao buscar pacote (status ' + res.status + ')');

        console.log('[vcEnviarVideo] pkg response:', JSON.stringify(pkg));

        const p = pkg.package || pkg.data || pkg;
        const videoId = p.video_id || p.videoId || p.video?.id || pkg.video_id || pkg.videoId;

        if (!videoId) {
          throw new Error('videoId não encontrado. JSON: ' + JSON.stringify(pkg).slice(0, 300));
        }

        // 2. Confirm-ready dispara Push 2 no backend
        const res2 = await fetch(API + '/api/video/' + videoId + '/confirm-ready', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + SESSION.token }
        });
        const data2 = await res2.json();
        if (!res2.ok) throw new Error(data2.error || 'Erro ao confirmar vídeo.');

        showStatus(st, 'Vídeo confirmado! Aguarde o Push com legenda e hashtags.', 'ok');
        btn.textContent = 'Confirmado ✓';
      } catch(e) {
        showStatus(st, 'Erro: ' + e.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Vídeo pronto';
      }
    }

    // ── BOTÃO ÚNICO: copia tudo que a IA gerou, num bloco só, formatado ──
    function vcCopiarTudo() {
      const r = window._vcRoteiroAtual || {};
      const st = document.getElementById('vc-copy-status');

      // O texto copiado para o gerador de vídeo (YouTube Create/Veo) segue o
      // MESMO padrão já usado em todo o resto do app (push1/push2): só o
      // prompt de vídeo em inglês + a narração em português, separados por
      // uma linha em branco. Título, gancho, roteiro completo, legenda,
      // CTA e dicas de produção são conteúdo de LEITURA na tela — nunca
      // devem entrar no texto colado no campo de prompt, pois o limite de
      // 900 caracteres do YouTube Create é para o prompt+narração, não
      // para o roteiro inteiro.
      const videoPromptEn = r.video_prompt_en || window._vcPromptOriginal || '';
      const narracao = r.narracao || '';
      const textoCompleto = narracao ? (videoPromptEn + '\n\n' + narracao) : videoPromptEn;

      navigator.clipboard.writeText(textoCompleto)
        .then(() => showStatus(st, 'Prompt + narração copiados! Cole no gerador de vídeo.', 'ok'))
        .catch(() => showStatus(st, 'Não foi possível copiar. Selecione o texto manualmente.', 'err'));
    }

    function vcAbrirApp(app) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isAndroid = /Android/.test(navigator.userAgent);
      const links = {
        gemini: {
          ios:     'https://apps.apple.com/app/google-gemini/id6477489729',
          android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.bard',
          web:     'https://gemini.google.com'
        },
        vids: {
          ios:     'https://apps.apple.com/app/google-vids/id6504171482',
          android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.docs.editors.vids',
          web:     'https://vids.google.com'
        }
      };
      const l = links[app];
      if (!l) return;
      const url = isIOS ? l.ios : isAndroid ? l.android : l.web;
      window.open(url, '_blank');
    }

    // vcCopiarPromptEn removida — substituída pelo botão único vcCopiarTudo()

    function vcAbrirVeo() {
      const st = document.getElementById('vc-veo-status');
      showStatus(st, 'Veo 3.1 em integração — em breve disponível. Por enquanto copie o prompt e use no Google AI Studio.', 'info');
      setTimeout(() => window.open('https://aistudio.google.com', '_blank'), 1200);
    }

    function vcNovoVideo() {
      document.getElementById('vc-prompt').value = '';
      document.getElementById('vc-prompt-count').textContent = '0/1500';
      for (let i = 0; i < 3; i++) {
        const inp  = document.getElementById('vc-img-input-' + i);
        const prev = document.getElementById('vc-img-preview-' + i);
        const slot = document.getElementById('vc-img-slot-' + i);
        const plus = document.getElementById('vc-img-plus-' + i);
        const lbl  = document.getElementById('vc-img-lbl-' + i);
        if (inp)  inp.value = '';
        if (prev) { prev.style.display = 'none'; prev.src = ''; }
        if (slot) slot.classList.remove('has-img');
        if (plus) plus.style.display = 'flex';
        if (lbl)  lbl.style.display  = '';
      }
      const leg = document.getElementById('vc-legendas');
      if (leg) leg.classList.remove('on');
      vcGoStep(1);
    }

  