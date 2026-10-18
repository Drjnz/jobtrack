/* =========================================================
   JobTrack – Logique de l'application (JavaScript vanilla)
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     1. CONSTANTES ET ÉTAT
     --------------------------------------------------------- */

  // Clé utilisée pour stocker les données dans le navigateur
  const STORAGE_KEY = 'jobtrack.candidatures';

  // Libellés des statuts (avec l'émoji de couleur demandé)
  const STATUSES = {
    pending:  '🟠 En attente',
    accepted: '🟢 Acceptée',
    rejected: '🔴 Refusée'
  };

  // Liste des candidatures (source de vérité de l'application)
  let applications = loadApplications();

  // Identifiant de la candidature en cours de suppression
  let pendingDeleteId = null;

  /* ---------------------------------------------------------
     2. RÉFÉRENCES AUX ÉLÉMENTS DU DOM
     --------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const els = {
    tbody:        $('applications-body'),
    emptyState:   $('empty-state'),
    emptyTitle:   $('empty-title'),
    emptyText:    $('empty-text'),
    resultCount:  $('result-count'),
    search:       $('search-input'),
    filter:       $('filter-status'),
    btnAdd:       $('btn-add'),

    statTotal:    $('stat-total'),
    statPending:  $('stat-pending'),
    statAccepted: $('stat-accepted'),
    statRejected: $('stat-rejected'),

    form:         $('application-form'),
    modalTitle:   $('modal-title'),
    fId:          $('field-id'),
    fCompany:     $('field-company'),
    fPosition:    $('field-position'),
    fDate:        $('field-date'),
    fContract:    $('field-contract'),
    fLink:        $('field-link'),
    fStatus:      $('field-status'),

    deleteText:   $('delete-text'),
    btnConfirmDelete: $('btn-confirm-delete'),
    toastContainer:   $('toast-container')
  };

  // Instances des modales Bootstrap
  const appModal    = new bootstrap.Modal($('application-modal'));
  const deleteModal = new bootstrap.Modal($('delete-modal'));

  /* ---------------------------------------------------------
     3. SAUVEGARDE / CHARGEMENT (localStorage)
     --------------------------------------------------------- */

  /** Lit les candidatures depuis localStorage (avec vérification des données). */
  function loadApplications() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];

      // On ne garde que les entrées bien formées
      return data.filter((a) =>
        a && typeof a === 'object' &&
        typeof a.id === 'string' &&
        typeof a.company === 'string' &&
        typeof a.position === 'string' &&
        Object.prototype.hasOwnProperty.call(STATUSES, a.status)
      );
    } catch (err) {
      console.warn('Lecture du localStorage impossible :', err);
      return [];
    }
  }

  /** Enregistre la liste complète dans localStorage. */
  function saveApplications() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(applications));
    } catch (err) {
      console.warn('Sauvegarde impossible :', err);
      showToast('Impossible de sauvegarder les données dans le navigateur.', 'danger');
    }
  }

  /* ---------------------------------------------------------
     4. FONCTIONS UTILITAIRES
     --------------------------------------------------------- */

  /** Génère un identifiant unique. */
  function generateId() {
    if (window.crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /** Échappe le HTML pour éviter l'injection de code dans le tableau. */
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Retourne l'URL si elle est en http(s), sinon une chaîne vide. */
  function safeUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(value);
      return (url.protocol === 'http:' || url.protocol === 'https:') ? url.href : '';
    } catch {
      return '';
    }
  }

  /** Date du jour au format AAAA-MM-JJ (heure locale). */
  function todayISO() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  /** Convertit AAAA-MM-JJ en JJ/MM/AAAA sans décalage de fuseau horaire. */
  function formatDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return (y && m && d) ? `${d}/${m}/${y}` : '—';
  }

  /** Affiche une notification Bootstrap (toast). */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-bg-${type} border-0`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" aria-label="Fermer"></button>
      </div>`;
    els.toastContainer.appendChild(toast);

    const instance = new bootstrap.Toast(toast, { delay: 3000 });
    // On retire l'élément du DOM une fois le toast masqué
    toast.addEventListener('hidden.bs.toast', () => toast.remove());
    instance.show();
  }

  /* ---------------------------------------------------------
     5. AFFICHAGE (tableau, statistiques)
     --------------------------------------------------------- */

  /** Applique la recherche et le filtre de statut, puis trie par date décroissante. */
  function getVisibleApplications() {
    const query  = els.search.value.trim().toLowerCase();
    const status = els.filter.value;

    return applications
      .filter((a) => status === 'all' || a.status === status)
      .filter((a) => {
        if (!query) return true;
        // La recherche porte sur l'entreprise, le poste, le contrat et le lien
        return [a.company, a.position, a.contract, a.link]
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  /** Construit le <select> de statut pour une ligne. */
  function statusSelectHtml(app) {
    const options = Object.entries(STATUSES)
      .map(([value, label]) =>
        `<option value="${value}"${value === app.status ? ' selected' : ''}>${label}</option>`)
      .join('');
    return `<select class="form-select form-select-sm status-select status-${app.status}"
                    data-action="status" data-id="${escapeHtml(app.id)}"
                    aria-label="Statut de la candidature">${options}</select>`;
  }

  /** Transforme le champ « lien / e-mail » en HTML : lien web, lien mailto ou texte simple. */
  function contactHtml(value) {
    const text = (value || '').trim();
    if (!text) return '<span class="text-secondary">—</span>';

    // Lien web (http/https), ou adresse commençant par www.
    const url = safeUrl(/^www\./i.test(text) ? `https://${text}` : text);
    if (url) {
      return `<a class="offer-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                Voir l'offre <i class="bi bi-box-arrow-up-right"></i></a>`;
    }

    // Adresse e-mail : lien « mailto: » cliquable
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
      return `<a class="offer-link" href="mailto:${escapeHtml(text)}">
                ${escapeHtml(text)} <i class="bi bi-envelope"></i></a>`;
    }

    // Tout autre texte est affiché tel quel
    return `<span class="text-break">${escapeHtml(text)}</span>`;
  }

  /** Construit une ligne <tr> du tableau. */
  function rowHtml(app) {
    const linkHtml = contactHtml(app.link);
    const id = escapeHtml(app.id);

    return `
      <tr>
        <td class="fw-semibold">${escapeHtml(app.company)}</td>
        <td>${escapeHtml(app.position)}</td>
        <td class="text-nowrap">${formatDate(app.date)}</td>
        <td><span class="contract-badge">${escapeHtml(app.contract || '—')}</span></td>
        <td>${linkHtml}</td>
        <td>${statusSelectHtml(app)}</td>
        <td class="text-end text-nowrap">
          <button type="button" class="btn-icon me-1" data-action="edit" data-id="${id}"
                  title="Modifier" aria-label="Modifier"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn-icon danger" data-action="delete" data-id="${id}"
                  title="Supprimer" aria-label="Supprimer"><i class="bi bi-trash3"></i></button>
        </td>
      </tr>`;
  }

  /** Met à jour les 4 compteurs (calculés sur toutes les candidatures). */
  function renderStats() {
    const count = (s) => applications.filter((a) => a.status === s).length;
    els.statTotal.textContent    = applications.length;
    els.statPending.textContent  = count('pending');
    els.statAccepted.textContent = count('accepted');
    els.statRejected.textContent = count('rejected');
  }

  /** Redessine le tableau, le message « vide » et les statistiques. */
  function render() {
    const visible = getVisibleApplications();

    els.tbody.innerHTML = visible.map(rowHtml).join('');

    // Compteur de résultats
    els.resultCount.textContent =
      `${visible.length} résultat${visible.length > 1 ? 's' : ''}`;

    // Message adapté quand le tableau est vide
    const isEmpty = visible.length === 0;
    els.emptyState.classList.toggle('d-none', !isEmpty);
    els.tbody.closest('.table-responsive').classList.toggle('d-none', isEmpty);

    if (isEmpty) {
      if (applications.length === 0) {
        els.emptyTitle.textContent = 'Aucune candidature';
        els.emptyText.textContent  = 'Cliquez sur « Nouvelle candidature » pour commencer.';
      } else {
        els.emptyTitle.textContent = 'Aucun résultat';
        els.emptyText.textContent  = 'Modifiez votre recherche ou le filtre de statut.';
      }
    }

    renderStats();
  }

  /* ---------------------------------------------------------
     6. AJOUT / MODIFICATION (formulaire dans une modale)
     --------------------------------------------------------- */

  /** Ouvre la modale vide pour ajouter une candidature. */
  function openAddModal() {
    els.form.reset();
    els.form.classList.remove('was-validated');
    els.fId.value = '';
    els.fDate.value = todayISO();
    els.fStatus.value = 'pending';
    els.modalTitle.textContent = 'Nouvelle candidature';
    appModal.show();
  }

  /** Ouvre la modale préremplie pour modifier une candidature. */
  function openEditModal(id) {
    const app = applications.find((a) => a.id === id);
    if (!app) return;

    els.form.classList.remove('was-validated');
    els.fId.value       = app.id;
    els.fCompany.value  = app.company;
    els.fPosition.value = app.position;
    els.fDate.value     = app.date || todayISO();
    els.fContract.value = app.contract || 'Alternance';
    els.fLink.value     = app.link || '';
    els.fStatus.value   = app.status;
    els.modalTitle.textContent = 'Modifier la candidature';
    appModal.show();
  }

  /** Validation + enregistrement du formulaire. */
  function handleSubmit(event) {
    event.preventDefault();

    // Le champ « lien / e-mail » est libre : aucune condition de format
    const linkValue = els.fLink.value.trim();

    // Les champs ne contenant que des espaces sont refusés
    [els.fCompany, els.fPosition].forEach((field) => {
      field.setCustomValidity(field.value.trim() ? '' : 'Champ requis');
    });

    if (!els.form.checkValidity()) {
      els.form.classList.add('was-validated');
      return;
    }

    const data = {
      company:  els.fCompany.value.trim(),
      position: els.fPosition.value.trim(),
      date:     els.fDate.value,
      contract: els.fContract.value,
      link:     linkValue,
      status:   els.fStatus.value
    };

    const editingId = els.fId.value;

    if (editingId) {
      // Modification : on remplace les champs de la candidature existante
      const index = applications.findIndex((a) => a.id === editingId);
      if (index !== -1) {
        applications[index] = { ...applications[index], ...data };
        showToast('Candidature modifiée.');
      }
    } else {
      // Ajout : nouvelle candidature avec identifiant unique
      applications.push({ id: generateId(), ...data });
      showToast('Candidature ajoutée.');
    }

    saveApplications();
    appModal.hide();
    render();
  }

  /* ---------------------------------------------------------
     7. CHANGEMENT DE STATUT ET SUPPRESSION
     --------------------------------------------------------- */

  /** Change le statut directement depuis le tableau. */
  function changeStatus(id, newStatus) {
    const app = applications.find((a) => a.id === id);
    if (!app || !STATUSES[newStatus]) return;

    app.status = newStatus;
    saveApplications();
    render();
    showToast(`Statut mis à jour : ${STATUSES[newStatus]}`);
  }

  /** Demande confirmation avant de supprimer. */
  function askDelete(id) {
    const app = applications.find((a) => a.id === id);
    if (!app) return;

    pendingDeleteId = id;
    els.deleteText.textContent =
      `« ${app.company} – ${app.position} » sera supprimée définitivement.`;
    deleteModal.show();
  }

  /** Supprime la candidature après confirmation. */
  function confirmDelete() {
    if (!pendingDeleteId) return;

    applications = applications.filter((a) => a.id !== pendingDeleteId);
    pendingDeleteId = null;

    saveApplications();
    deleteModal.hide();
    render();
    showToast('Candidature supprimée.', 'secondary');
  }

  /* ---------------------------------------------------------
     8. ÉVÉNEMENTS
     --------------------------------------------------------- */

  els.btnAdd.addEventListener('click', openAddModal);
  els.form.addEventListener('submit', handleSubmit);
  els.btnConfirmDelete.addEventListener('click', confirmDelete);

  // Recherche et filtre : le tableau se met à jour en direct
  els.search.addEventListener('input', render);
  els.filter.addEventListener('change', render);

  // Délégation d'événements : un seul écouteur pour tout le tableau
  els.tbody.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const { action, id } = button.dataset;
    if (action === 'edit')   openEditModal(id);
    if (action === 'delete') askDelete(id);
  });

  els.tbody.addEventListener('change', (event) => {
    const select = event.target.closest('select[data-action="status"]');
    if (select) changeStatus(select.dataset.id, select.value);
  });

  /* ---------------------------------------------------------
     9. DÉMARRAGE
     --------------------------------------------------------- */
  render();
})();