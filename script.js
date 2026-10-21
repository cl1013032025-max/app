/**
 * ArtSpace — script.js
 * Aplicación front-end (HTML + CSS + JS puro, sin frameworks).
 *
 * Funciones:
 *  - Navegación entre vistas (Inicio, Explorar, Favoritos, Publicar, Perfil)
 *  - Galería con búsqueda, filtros por categoría y tarjetas animadas
 *  - Favoritos guardados en localStorage
 *  - Publicación de obras con validación e imagen redimensionada
 *  - Perfil editable (nombre artístico y biografía)
 *  - Fondo de partículas, toasts animados y soporte de "reducir movimiento"
 *
 * NOTA: no hay autenticación ni base de datos. Todo se guarda en el
 * almacenamiento local del navegador (localStorage) de forma tolerante a fallos.
 */
(function () {
  'use strict';

  /* ======================= Constantes y estado ======================= */

  const STORAGE_KEYS = {
    favorites: 'artspace_favorites',
    works: 'artspace_user_works',
    profile: 'artspace_profile'
  };

  const CATEGORIES = ['Pintura', 'Ilustración', 'Fotografía', 'Arte digital'];

  const DEFAULT_PROFILE = {
    name: 'Artista anónimo',
    bio: 'Aún no has escrito tu biografía. Pulsa «Editar información» para contarle al mundo quién eres y qué te inspira.'
  };

  /** Preferencia de movimiento del sistema (se respeta en todo el código). */
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Estado central de la aplicación. */
  const state = {
    works: [],        // obras por defecto + obras del usuario
    userWorks: [],    // solo obras publicadas aquí
    favorites: new Set(),
    profile: { ...DEFAULT_PROFILE },
    filter: 'Todas',
    query: ''
  };

  /* ======================= Utilidades generales ======================= */

  /**
   * Lectura segura de localStorage (evita que la app se rompa si el
   * navegador bloquea el almacenamiento o los datos están corruptos).
   */
  function storageGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (error) {
      console.warn('[ArtSpace] No se pudo leer', key, error);
      return fallback;
    }
  }

  /** Escritura segura. Devuelve false si falla (p. ej. cuota excedida). */
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('[ArtSpace] No se pudo guardar', key, error);
      return false;
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /** Iniciales (máximo 2) para el avatar del perfil. */
  function getInitials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'AR';
    return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('');
  }

  /* ======================= Obras de ejemplo ==========================
     Las imágenes son SVG generados por código y almacenados como data URI,
     de modo que la galería funcione también sin conexión a internet.      */

  function svgDataURI(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /** Escena de círculos superpuestos (arte abstracto). */
  function artCircles(colors, seed) {
    const [c1, c2, c3] = colors;
    let circles = '';
    for (let i = 0; i < 7; i += 1) {
      const cx = 60 + ((i * 97 + seed * 41) % 320);
      const cy = 60 + ((i * 151 + seed * 23) % 320);
      const r = 30 + ((i * 53 + seed * 17) % 90);
      const color = [c1, c2, c3][i % 3];
      const opacity = (0.3 + (i % 5) * 0.1).toFixed(1);
      circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
    }
    return svgDataURI(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440">
        <defs>
          <linearGradient id="bg${seed}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#241046"/>
            <stop offset="0.55" stop-color="#160c30"/>
            <stop offset="1" stop-color="#0a0518"/>
          </linearGradient>
        </defs>
        <rect width="440" height="440" fill="url(#bg${seed})"/>
        <g style="mix-blend-mode:screen">${circles}</g>
        <circle cx="220" cy="220" r="130" fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="2"/>
        <circle cx="220" cy="220" r="72" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1.5"/>
      </svg>`
    );
  }

  /** Escena de montañas con sol (paisaje). */
  function artMountains(colors, seed) {
    const [sky1, sky2, sun] = colors;
    const sunX = 130 + ((seed * 37) % 170);
    return svgDataURI(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440">
        <defs>
          <linearGradient id="sky${seed}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="${sky1}"/>
            <stop offset="1" stop-color="${sky2}"/>
          </linearGradient>
        </defs>
        <rect width="440" height="440" fill="url(#sky${seed})"/>
        <circle cx="${sunX}" cy="130" r="72" fill="${sun}" opacity="0.92"/>
        <path d="M0 300 L110 185 L205 300 Z" fill="#1a1030" opacity="0.92"/>
        <path d="M120 322 L255 168 L385 322 Z" fill="#251444" opacity="0.96"/>
        <path d="M265 332 L362 232 L440 332 Z" fill="#140b26"/>
        <rect y="330" width="440" height="110" fill="#0b061e"/>
        <path d="M0 342 Q110 322 220 342 T440 342" fill="none" stroke="${sun}" stroke-opacity="0.55" stroke-width="3"/>
        <path d="M0 366 Q140 348 260 368 T440 362" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="2"/>
      </svg>`
    );
  }

  /** Ondas sinusoidales (arte digital fluido). */
  function artWaves(colors, seed) {
    const [c1, c2, c3] = colors;
    let paths = '';
    for (let i = 0; i < 5; i += 1) {
      const y = 120 + i * 62;
      const color = [c1, c2, c3][i % 3];
      const width = 6 + i * 2;
      paths += `<path d="M0 ${y} C 90 ${y - 55}, 150 ${y + 55}, 240 ${y} S 390 ${y - 55}, 440 ${y + 8}"
                fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="0.78"/>`;
    }
    return svgDataURI(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440">
        <defs>
          <linearGradient id="w${seed}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#160b32"/>
            <stop offset="1" stop-color="#080418"/>
          </linearGradient>
        </defs>
        <rect width="440" height="440" fill="url(#w${seed})"/>
        ${paths}
        <circle cx="${330 - (seed * 13) % 90}" cy="82" r="46" fill="#ffffff" opacity="0.85"/>
        <circle cx="${330 - (seed * 13) % 90}" cy="82" r="66" fill="none" stroke="#ffffff" stroke-opacity="0.25" stroke-width="2"/>
      </svg>`
    );
  }

  /** Composición geométrica (arte digital). */
  function artGeo(colors, seed) {
    const [c1, c2, c3] = colors;
    const shift = (seed * 9) % 40;
    return svgDataURI(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 440">
        <rect width="440" height="440" fill="#0c0722"/>
        <polygon points="0,440 ${220 + shift},110 440,440" fill="${c1}" opacity="0.85"/>
        <polygon points="50,440 ${300 - shift},55 440,440" fill="${c2}" opacity="0.55"/>
        <rect x="150" y="150" width="140" height="140" rx="18" fill="none"
              stroke="${c3}" stroke-width="6" transform="rotate(45 220 220)"/>
        <circle cx="220" cy="220" r="36" fill="${c3}"/>
        <circle cx="220" cy="220" r="56" fill="none" stroke="#ffffff" stroke-opacity="0.3" stroke-width="2"/>
      </svg>`
    );
  }

  /** Colección inicial de obras (semilla). */
  const DEFAULT_WORKS = [
    { id: 'seed-1', title: 'Aurora interior', artist: 'Lucía Marín', category: 'Pintura',
      description: 'Óleo sobre lienzo inspirado en las luces del amanecer sobre el valle.',
      image: artCircles(['#8b5cf6', '#ec4899', '#3b82f6'], 3) },
    { id: 'seed-2', title: 'Cumbres de cobalto', artist: 'Andrés Rivas', category: 'Fotografía',
      description: 'La montaña al atardecer, capturada con luz natural y larga exposición.',
      image: artMountains(['#2b1a6b', '#120a34', '#f59e0b'], 5) },
    { id: 'seed-3', title: 'Flujo neón', artist: 'Kenji Sato', category: 'Arte digital',
      description: 'Serie de ondas generativas sobre degradados violeta y azul.',
      image: artWaves(['#8b5cf6', '#3b82f6', '#ec4899'], 7) },
    { id: 'seed-4', title: 'Geometría del sueño', artist: 'Marta Ochoa', category: 'Ilustración',
      description: 'Pieza vectorial que combina triángulos y círculos en equilibrio.',
      image: artGeo(['#7c3aed', '#db2777', '#38bdf8'], 4) },
    { id: 'seed-5', title: 'Noche de iris', artist: 'Lucía Marín', category: 'Pintura',
      description: 'Composición abstracta de círculos luminosos sobre fondo profundo.',
      image: artCircles(['#ec4899', '#3b82f6', '#a78bfa'], 9) },
    { id: 'seed-6', title: 'Sendero de bruma', artist: 'Pablo Nieto', category: 'Fotografía',
      description: 'Paisaje montañoso entre la niebla, con un sol pálido y filtered.',
      image: artMountains(['#1e3a8a', '#0b1030', '#f472b6'], 6) },
    { id: 'seed-7', title: 'Marea digital', artist: 'Kenji Sato', category: 'Arte digital',
      description: 'Corrientes de color que ondulan al ritmo de un algoritmo generativo.',
      image: artWaves(['#ec4899', '#8b5cf6', '#22d3ee'], 11) },
    { id: 'seed-8', title: 'Ciudad en capas', artist: 'Marta Ochoa', category: 'Ilustración',
      description: 'Interpretación geométrica de una ciudad imaginaria en capas superpuestas.',
      image: artGeo(['#3b82f6', '#8b5cf6', '#f472b6'], 8) },
    { id: 'seed-9', title: 'Retrato de luz', artist: 'Andrés Rivas', category: 'Pintura',
      description: 'Estudio de color donde el morado y el rosa se encuentran en el centro.',
      image: artCircles(['#a78bfa', '#f472b6', '#60a5fa'], 12) },
    { id: 'seed-10', title: 'Horizonte violeta', artist: 'Sofía Delgado', category: 'Fotografía',
      description: 'El último rayo de sol sobre una cordillera de silueta violácea.',
      image: artMountains(['#5b21b6', '#171033', '#fbbf24'], 10) },
    { id: 'seed-11', title: 'Impulso cromático', artist: 'Sofía Delgado', category: 'Arte digital',
      description: 'Ondas de energía que representan el impulso creativo de los artistas.',
      image: artWaves(['#6366f1', '#ec4899', '#38bdf8'], 14) },
    { id: 'seed-12', title: 'Estructura onírica', artist: 'Pablo Nieto', category: 'Ilustración',
      description: 'Formas geométricas flotando en un espacio de ensueño índigo.',
      image: artGeo(['#8b5cf6', '#3b82f6', '#fbbf24'], 13) }
  ];

  /* ======================= Navegación entre vistas ======================= */

  const viewElements = Array.from(document.querySelectorAll('.view'));

  /** Identificador de vista válido a partir del hash (#explorar, etc.). */
  function viewFromHash() {
    const id = location.hash.replace('#', '');
    return id && document.getElementById(id) ? id : 'inicio';
  }

  /** Muestra una vista, actualiza la navegación y cierra el menú móvil. */
  function showView(viewId) {
    const target = document.getElementById(viewId);
    if (!target || !target.classList.contains('view')) return;

    viewElements.forEach((view) => {
      const isActive = view === target;
      view.hidden = !isActive;
      // Se reinserta la clase para que la animación de entrada se reproduzca.
      view.classList.toggle('is-active', isActive);
    });

    document.querySelectorAll('.nav-link[data-view]').forEach((link) => {
      const isActive = link.dataset.view === viewId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    closeMobileMenu();
    window.scrollTo({ top: 0, behavior: motionQuery.matches ? 'auto' : 'smooth' });
  }

  /**
   * Navega a una vista usando el hash: así el botón "atrás" del navegador
   * funciona y no hace falta manipular la History API (problemática en file://).
   */
  function navigateTo(viewId) {
    if (location.hash === '#' + viewId) {
      showView(viewId);
      return;
    }
    location.hash = viewId;
  }

  /* ======================= Menú móvil ======================= */

  const navToggle = document.getElementById('nav-toggle');
  const mainNav = document.getElementById('main-nav');

  function openMobileMenu() {
    mainNav.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    navToggle.setAttribute('aria-label', 'Cerrar menú de navegación');
  }

  function closeMobileMenu() {
    mainNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.setAttribute('aria-label', 'Abrir menú de navegación');
  }

  function toggleMobileMenu() {
    if (mainNav.classList.contains('is-open')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  }

  /* ======================= Favoritos ======================= */

  function isFavorite(workId) {
    return state.favorites.has(workId);
  }

  function saveFavorites() {
    const saved = storageSet(STORAGE_KEYS.favorites, Array.from(state.favorites));
    if (!saved) {
      showToast('No se pudieron guardar los favoritos: almacenamiento local no disponible.', 'error');
    }
  }

  /** Alterna el favorito y actualiza solo los elementos afectados. */
  function toggleFavorite(workId) {
    const work = state.works.find((item) => item.id === workId);
    if (!work) return;

    if (isFavorite(workId)) {
      state.favorites.delete(workId);
      showToast(`«${work.title}» eliminado de favoritos`, 'info');
    } else {
      state.favorites.add(workId);
      showToast(`«${work.title}» guardado en favoritos ♥`, 'success');
    }

    saveFavorites();
    syncHeartButtons(workId);
    updateFavoriteBadges();
    renderFavorites(); // la lista de favoritos cambia
    updateProfileStats();
  }

  /** Sincroniza el estado visual de todos los botones de una obra. */
  function syncHeartButtons(workId) {
    document.querySelectorAll(`[data-heart-id="${workId}"]`).forEach((button) => {
      const active = isFavorite(workId);
      const work = state.works.find((item) => item.id === workId);
      button.classList.toggle('is-favorite', active);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute(
        'aria-label',
        active
          ? `Quitar «${work ? work.title : ''}» de favoritos`
          : `Guardar «${work ? work.title : ''}» en favoritos`
      );
    });
  }

  function updateFavoriteBadges() {
    const badge = document.getElementById('fav-badge');
    if (badge) badge.textContent = String(state.favorites.size);
  }

  /* ======================= Tarjetas de obra ======================= */

  const HEART_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>' +
    '</svg>';

  /**
   * Crea una tarjeta de obra con DOM programático (evita inyección HTML
   * ya que el título/artista provienen del formulario del usuario).
   * @param {object} work obra a representar
   * @param {number} index posición para retrasar la animación de entrada
   * @param {boolean} showDelete añade botón de eliminar (obras propias)
   */
  function createArtworkCard(work, index, showDelete) {
    const card = document.createElement('article');
    card.className = 'art-card';
    card.dataset.id = work.id;
    card.style.setProperty('--i', String(index));

    /* Imagen + botón de favorito */
    const media = document.createElement('figure');
    media.className = 'art-card__media';

    const image = document.createElement('img');
    image.src = work.image;
    image.alt = `Obra «${work.title}» de ${work.artist}`;
    image.loading = 'lazy';
    image.decoding = 'async';

    const heart = document.createElement('button');
    heart.type = 'button';
    heart.className = 'heart-btn';
    heart.dataset.heartId = work.id;
    heart.innerHTML = HEART_ICON;
    const favorite = isFavorite(work.id);
    heart.classList.toggle('is-favorite', favorite);
    heart.setAttribute('aria-pressed', String(favorite));
    heart.setAttribute(
      'aria-label',
      favorite ? `Quitar «${work.title}» de favoritos` : `Guardar «${work.title}» en favoritos`
    );

    media.append(image, heart);
    card.appendChild(media);

    /* Contenido */
    const body = document.createElement('div');
    body.className = 'art-card__body';

    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = work.category;

    const title = document.createElement('h3');
    title.className = 'art-card__title';
    title.textContent = work.title;

    const artist = document.createElement('p');
    artist.className = 'art-card__artist';
    artist.textContent = work.artist;

    body.append(chip, title, artist);

    if (work.description) {
      const description = document.createElement('p');
      description.className = 'art-card__desc';
      description.textContent = work.description;
      body.appendChild(description);
    }

    card.appendChild(body);

    /* Acciones extra: eliminar obras publicadas por el usuario */
    if (showDelete) {
      const actions = document.createElement('div');
      actions.className = 'card-actions';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'btn-delete';
      deleteButton.dataset.deleteId = work.id;
      deleteButton.textContent = 'Eliminar obra';

      actions.appendChild(deleteButton);
      card.appendChild(actions);
    }

    return card;
  }

  /** Renderiza una lista de obras dentro de un contenedor concreto. */
  function renderCards(container, works, showDelete) {
    container.textContent = '';
    works.forEach((work, index) => {
      container.appendChild(createArtworkCard(work, index, showDelete));
    });
  }

  /* ======================= Galería (filtro + búsqueda) ======================= */

  function getFilteredWorks() {
    const query = state.query.trim().toLowerCase();

    return state.works.filter((work) => {
      const matchesCategory = state.filter === 'Todas' || work.category === state.filter;
      if (!matchesCategory) return false;
      if (!query) return true;

      const haystack = `${work.title} ${work.artist} ${work.description || ''} ${work.category}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderGallery() {
    const grid = document.getElementById('gallery-grid');
    const empty = document.getElementById('gallery-empty');
    const counter = document.getElementById('gallery-count');
    const works = getFilteredWorks();

    renderCards(grid, works, false);
    empty.hidden = works.length > 0;

    if (state.filter === 'Todas' && !state.query.trim()) {
      counter.textContent = `${works.length} ${works.length === 1 ? 'obra' : 'obras'} en la galería`;
    } else {
      counter.textContent = `${works.length} ${works.length === 1 ? 'obra encontrada' : 'obras encontradas'}`;
    }
  }

  function renderFavorites() {
    const grid = document.getElementById('favorites-grid');
    const empty = document.getElementById('favorites-empty');
    const works = state.works.filter((work) => isFavorite(work.id));

    renderCards(grid, works, false);
    empty.hidden = works.length > 0;
  }

  function renderPublishedWorks() {
    const grid = document.getElementById('published-grid');
    const empty = document.getElementById('published-empty');

    renderCards(grid, state.userWorks, true);
    empty.hidden = state.userWorks.length > 0;
  }

  function updateHeroStats() {
    const artists = new Set(state.works.map((work) => work.artist));
    const categories = new Set(state.works.map((work) => work.category));

    document.getElementById('stat-works').textContent = String(state.works.length);
    document.getElementById('stat-artists').textContent = String(artists.size);
    document.getElementById('stat-cats').textContent = String(categories.size);
  }

  /** Restablece el filtro de categorías y el buscador a su estado inicial. */
  function resetGalleryControls() {
    state.filter = 'Todas';
    state.query = '';

    const searchElement = document.getElementById('search-input');
    if (searchElement) searchElement.value = '';

    document.querySelectorAll('[data-category]').forEach((button) => {
      const active = button.dataset.category === 'Todas';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function updateProfileStats() {
    document.getElementById('stat-published').textContent = String(state.userWorks.length);
    document.getElementById('stat-favorites').textContent = String(state.favorites.size);
  }

  /** Actualiza todas las vistas que dependen de los datos. */
  function renderAll() {
    renderGallery();
    renderFavorites();
    renderPublishedWorks();
    updateFavoriteBadges();
    updateHeroStats();
    updateProfileStats();
  }

  /* ======================= Perfil ======================= */

  function renderProfile() {
    document.getElementById('profile-name').textContent = state.profile.name;
    document.getElementById('profile-bio').textContent = state.profile.bio;
    document.getElementById('profile-avatar').textContent = getInitials(state.profile.name);

    document.getElementById('profile-name-input').value = state.profile.name;
    document.getElementById('profile-bio-input').value = state.profile.bio;
    updateProfileStats();
  }

  function setupProfileForm() {
    const form = document.getElementById('profile-form');
    const nameInput = document.getElementById('profile-name-input');
    const bioInput = document.getElementById('profile-bio-input');

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const name = nameInput.value.trim();
      const bio = bioInput.value.trim();
      let valid = true;

      if (!name) {
        setFieldError(nameInput, 'error-profile-name', 'El nombre artístico es obligatorio.');
        valid = false;
      } else {
        setFieldError(nameInput, 'error-profile-name', '');
      }

      if (bio.length > 600) {
        setFieldError(bioInput, 'error-profile-bio', 'La biografía no puede superar los 600 caracteres.');
        valid = false;
      } else {
        setFieldError(bioInput, 'error-profile-bio', '');
      }

      if (!valid) {
        form.querySelector('[aria-invalid="true"]').focus();
        showToast('Revisa los campos marcados del perfil.', 'error');
        return;
      }

      state.profile.name = name;
      state.profile.bio = bio || DEFAULT_PROFILE.bio;

      const saved = storageSet(STORAGE_KEYS.profile, state.profile);
      renderProfile();

      if (saved) {
        showToast('Cambios del perfil guardados correctamente ✓', 'success');
      } else {
        showToast('Perfil actualizado, pero no se pudo guardar en el navegador.', 'error');
      }
    });

    // Al escribir se limpia el error correspondiente.
    nameInput.addEventListener('input', () => setFieldError(nameInput, 'error-profile-name', ''));
    bioInput.addEventListener('input', () => setFieldError(bioInput, 'error-profile-bio', ''));
  }

  /* ======================= Publicar una obra ======================= */

  /** Redimensiona y comprime la imagen elegida para caber en localStorage. */
  function processImageFile(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('Debes seleccionar una imagen.'));
        return;
      }
      if (!file.type.startsWith('image/')) {
        reject(new Error('El archivo seleccionado no es una imagen válida.'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('La imagen está dañada o no es compatible.'));
        image.onload = () => {
          try {
            const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
            const width = Math.max(1, Math.round(image.width * scale));
            const height = Math.max(1, Math.round(image.height * scale));

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, width, height);

            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (error) {
            reject(new Error('No se pudo procesar la imagen.'));
          }
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setupPublishForm() {
    const form = document.getElementById('publish-form');
    const titleInput = document.getElementById('work-title');
    const artistInput = document.getElementById('work-artist');
    const categoryInput = document.getElementById('work-category');
    const descriptionInput = document.getElementById('work-description');
    const imageInput = document.getElementById('work-image');
    const preview = document.getElementById('publish-preview');
    const previewImage = document.getElementById('publish-preview-img');

    let imageDataURL = null; // imagen lista para guardar

    /* Vista previa al elegir un archivo */
    imageInput.addEventListener('change', async () => {
      const file = imageInput.files && imageInput.files[0];
      setFieldError(imageInput, 'error-image', '');

      if (!file) {
        imageDataURL = null;
        preview.hidden = true;
        return;
      }

      try {
        // Máx. 1200px de lado y JPEG 0.82: reduce mucho el uso de localStorage.
        imageDataURL = await processImageFile(file, 1200, 0.82);
        previewImage.src = imageDataURL;
        preview.hidden = false;
      } catch (error) {
        imageDataURL = null;
        preview.hidden = true;
        setFieldError(imageInput, 'error-image', error.message);
      }
    });

    /* Envío del formulario con validación */
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const title = titleInput.value.trim();
      const artist = artistInput.value.trim();
      const category = categoryInput.value;
      const description = descriptionInput.value.trim();
      let valid = true;

      if (!title) {
        setFieldError(titleInput, 'error-title', 'El título es obligatorio.');
        valid = false;
      } else {
        setFieldError(titleInput, 'error-title', '');
      }

      if (!artist) {
        setFieldError(artistInput, 'error-artist', 'El nombre del artista es obligatorio.');
        valid = false;
      } else {
        setFieldError(artistInput, 'error-artist', '');
      }

      if (!category) {
        setFieldError(categoryInput, 'error-category', 'Selecciona una categoría.');
        valid = false;
      } else {
        setFieldError(categoryInput, 'error-category', '');
      }

      if (!imageDataURL) {
        const message = (imageInput.files && imageInput.files.length)
          ? 'La imagen seleccionada no es válida.'
          : 'Debes seleccionar una imagen.';
        setFieldError(imageInput, 'error-image', message);
        valid = false;
      }

      if (!valid) {
        const firstInvalid = form.querySelector('[aria-invalid="true"]');
        if (firstInvalid) firstInvalid.focus();
        showToast('Hay errores en el formulario. Revísalos.', 'error');
        return;
      }

      const newWork = {
        id: 'user-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        title,
        artist,
        category,
        description,
        image: imageDataURL,
        isUserWork: true,
        createdAt: Date.now()
      };

      state.userWorks.unshift(newWork);
      state.works = state.userWorks.concat(DEFAULT_WORKS);

      const saved = storageSet(STORAGE_KEYS.works, state.userWorks);

      // Se restablece la galería (filtro y búsqueda) para que la obra
      // recién publicada sea visible inmediatamente.
      resetGalleryControls();

      // Reset visual del formulario y de la vista previa.
      form.reset();
      imageDataURL = null;
      preview.hidden = true;
      clearFormErrors(form);
      renderAll();

      if (saved) {
        showToast(`¡Obra «${newWork.title}» publicada con éxito! 🎉`, 'success');
      } else {
        showToast('Obra publicada en esta sesión, pero no se pudo guardar (almacenamiento lleno).', 'error');
      }

      navigateTo('explorar');
    });

    /* Limpiar errores al escribir y al reiniciar el formulario */
    [titleInput, artistInput, categoryInput, descriptionInput].forEach((input) => {
      input.addEventListener('input', () => {
        const map = {
          'work-title': 'error-title',
          'work-artist': 'error-artist',
          'work-category': 'error-category',
          'work-description': 'error-description'
        };
        setFieldError(input, map[input.id] || '', '');
      });
    });

    document.getElementById('publish-reset').addEventListener('click', () => {
      imageDataURL = null;
      // La vista previa se oculta tras el reset del navegador.
      setTimeout(() => {
        preview.hidden = true;
        clearFormErrors(form);
      }, 0);
    });
  }

  /** Elimina una obra publicada por el usuario. */
  function deletePublishedWork(workId) {
    const work = state.userWorks.find((item) => item.id === workId);
    if (!work) return;

    const confirmed = window.confirm(`¿Eliminar la obra «${work.title}»? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    state.userWorks = state.userWorks.filter((item) => item.id !== workId);
    state.works = state.userWorks.concat(DEFAULT_WORKS);
    state.favorites.delete(workId);

    storageSet(STORAGE_KEYS.works, state.userWorks);
    saveFavorites();
    renderAll();
    showToast(`Obra «${work.title}» eliminada.`, 'info');
  }

  /* ======================= Validación de formularios ======================= */

  /** Muestra u oculta el mensaje de error de un campo concreto. */
  function setFieldError(field, errorId, message) {
    if (!errorId) return;
    const errorElement = document.getElementById(errorId);
    if (errorElement) errorElement.textContent = message;

    if (field) {
      if (message) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', errorId);
      } else {
        field.removeAttribute('aria-invalid');
        field.removeAttribute('aria-describedby');
      }
    }
  }

  function clearFormErrors(form) {
    form.querySelectorAll('.field__error').forEach((element) => {
      element.textContent = '';
    });
    form.querySelectorAll('[aria-invalid]').forEach((field) => {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
  }

  /* ======================= Mensajes animados (toasts) ======================= */

  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type || 'success'}`;

    const icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = type === 'error' ? '✕' : type === 'info' ? 'i' : '✓';

    const text = document.createElement('span');
    text.textContent = message;

    toast.append(icon, text);
    container.appendChild(toast);

    // Forzar un frame para que la transición de entrada se reproduzca.
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  /* ======================= Fondo de partículas ======================= */

  function initParticles() {
    const canvas = document.getElementById('particles-canvas');
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return; // Canvas no soportado: la app sigue funcionando

    const COLORS = ['139,92,246', '236,72,153', '59,130,246', '167,139,250'];
    let particles = [];
    let animationId = null;
    let width = 0;
    let height = 0;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;

      const count = Math.max(24, Math.min(70, Math.round((width * height) / 26000)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 1 + Math.random() * 3.2,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        alpha: 0.25 + Math.random() * 0.45
      }));
    }

    function paintParticles(move) {
      context.clearRect(0, 0, width, height);
      context.shadowBlur = 12;

      for (const particle of particles) {
        if (move) {
          particle.x += particle.vx;
          particle.y += particle.vy;

          // Envoltado: la partícula reaparece por el lado contrario.
          if (particle.x < -12) particle.x = width + 12;
          if (particle.x > width + 12) particle.x = -12;
          if (particle.y < -12) particle.y = height + 12;
          if (particle.y > height + 12) particle.y = -12;
        }

        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fillStyle = `rgba(${particle.color},${particle.alpha})`;
        context.shadowColor = `rgba(${particle.color},0.85)`;
        context.fill();
      }

      context.shadowBlur = 0;
    }

    function startAnimation() {
      if (animationId !== null) return;
      const loop = () => {
        paintParticles(true);
        animationId = requestAnimationFrame(loop);
      };
      animationId = requestAnimationFrame(loop);
    }

    function stopAnimation() {
      if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
      }
    }

    /** Respeta la preferencia del sistema de reducir movimiento. */
    function applyMotionPreference() {
      stopAnimation();
      if (motionQuery.matches) {
        paintParticles(false); // dibujo estático
      } else {
        startAnimation();
      }
    }

    window.addEventListener('resize', debounce(() => {
      resize();
      applyMotionPreference();
    }, 200));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAnimation();
      } else {
        applyMotionPreference();
      }
    });

    if (typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', applyMotionPreference);
    } else if (typeof motionQuery.addListener === 'function') {
      motionQuery.addListener(applyMotionPreference);
    }

    resize();
    applyMotionPreference();
  }

  /* ======================= Eventos globales ======================= */

  function setupEventDelegation() {
    document.addEventListener('click', (event) => {
      const target = event.target;

      /* Navegación por vistas (marca, enlaces del menú y botones data-goto) */
      const viewTrigger = target.closest('[data-view], [data-goto]');
      if (viewTrigger) {
        const viewId = viewTrigger.dataset.view || viewTrigger.dataset.goto;
        navigateTo(viewId);
        return;
      }

      /* Alternar favorito */
      const heartButton = target.closest('[data-heart-id]');
      if (heartButton) {
        toggleFavorite(heartButton.dataset.heartId);
        return;
      }

      /* Eliminar obra propia */
      const deleteButton = target.closest('[data-delete-id]');
      if (deleteButton) {
        deletePublishedWork(deleteButton.dataset.deleteId);
        return;
      }

      /* Filtro por categoría */
      const filterButton = target.closest('[data-category]');
      if (filterButton) {
        state.filter = filterButton.dataset.category;
        document.querySelectorAll('[data-category]').forEach((button) => {
          const active = button === filterButton;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        renderGallery();
        return;
      }

      /* Cerrar el menú móvil al pulsar fuera de la cabecera */
      if (mainNav.classList.contains('is-open') && !target.closest('.site-header')) {
        closeMobileMenu();
      }
    });

    navToggle.addEventListener('click', toggleMobileMenu);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMobileMenu();
    });

    window.addEventListener('hashchange', () => showView(viewFromHash()));

    /* Búsqueda en vivo */
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', () => {
      state.query = searchInput.value;
      renderGallery();
    });
  }

  /* ======================= Inicio de la aplicación ======================= */

  function loadState() {
    /* Favoritos */
    const storedFavorites = storageGet(STORAGE_KEYS.favorites, []);
    state.favorites = new Set(
      Array.isArray(storedFavorites)
        ? storedFavorites.filter((id) => typeof id === 'string')
        : []
    );

    /* Obras publicadas por el usuario */
    const storedWorks = storageGet(STORAGE_KEYS.works, []);
    state.userWorks = Array.isArray(storedWorks)
      ? storedWorks.filter((work) =>
          work && typeof work === 'object' &&
          typeof work.id === 'string' &&
          typeof work.title === 'string' &&
          typeof work.image === 'string'
        )
      : [];

    /* Perfil */
    const storedProfile = storageGet(STORAGE_KEYS.profile, null);
    if (storedProfile && typeof storedProfile === 'object' && typeof storedProfile.name === 'string') {
      state.profile = {
        name: storedProfile.name || DEFAULT_PROFILE.name,
        bio: typeof storedProfile.bio === 'string' ? storedProfile.bio : DEFAULT_PROFILE.bio
      };
    }

    state.works = state.userWorks.concat(DEFAULT_WORKS);
  }

  function setupHeroImages() {
    // Collage de portada con obras de ejemplo (sin depender de red).
    const byCategory = (category) => DEFAULT_WORKS.find((work) => work.category === category);
    const picks = [byCategory('Pintura'), byCategory('Arte digital'), byCategory('Ilustración')];
    const ids = ['hero-img-1', 'hero-img-2', 'hero-img-3'];

    picks.forEach((work, index) => {
      const element = document.getElementById(ids[index]);
      if (element && work) {
        element.src = work.image;
        element.alt = `Ejemplo de obra: ${work.title}`;
      }
    });
  }

  function init() {
    loadState();
    setupHeroImages();
    renderProfile();
    renderAll();
    setupEventDelegation();
    setupPublishForm();
    setupProfileForm();
    initParticles();
    showView(viewFromHash());
  }

  // El DOM está listo porque script.js se carga al final del <body>,
  // pero se comprueba por si alguien lo incluye en el <head>.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
