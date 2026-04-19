// app.js — Coop'Art Booking CRM
// Architecture modulaire disponible dans js/modules/ :
//   appComputed.js   | crmMethods.js    | adminMethods.js
//   mapMethods.js    | importMethods.js | gouvMethods.js  
//   searchMethods.js | projectMethods.js| venueMethods.js
// ─────────────────────────────────────────────────────────

// app.js — Point d'entrée Vue.js — Coop'Art Booking

// --- IMPORTS FIREBASE ---
import { auth, dbFirestore }                                              from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword,
         onAuthStateChanged, signOut }                                    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, onSnapshot, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const { createApp, nextTick } = Vue;

// --- IMPORTS MODULES ---
import { utilsMethods }                         from './utils.js';
import { contactsComputed, contactsMethods }    from './contacts.js';
import { planningComputed, planningMethods }    from './planning.js';
import { adminMethods }                           from './modules/adminMethods.js';
import { mapMethods }                             from './modules/mapMethods.js';
import { annuaireMethods }                       from './modules/annuaireMethods.js';
import { importMethods }                         from './modules/importMethods.js';
import { gouvMethods }                           from './modules/gouvMethods.js';
import { searchMethods }                         from './modules/searchMethods.js';
import { projectMethods }                        from './modules/projectMethods.js';
import { venueMethods }                          from './modules/venueMethods.js';
import { crmMethods }                            from './modules/crmMethods.js';
import { appComputed }                           from './modules/appComputed.js';
import { collaboratorMethods }                   from './modules/collaboratorMethods.js';

// --- CONSTANTE COULEURS PAR DÉFAUT ---
const DEFAULT_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6'];

// =============================================================================
createApp({

    // ─────────────────────────────────────────────────────────────────────────
    // DATA
    // ─────────────────────────────────────────────────────────────────────────
    data() {
        return {
            // Navigation & auth
            pageTitle: 'Tableau de bord',
            currentUser: null,
            currentUserName: '',
            tab: 'dashboard',
            authEmail: '', authPassword: '', isLoginMode: true,

            // Base de données locale (miroir Firestore)
            db: {
            projects: [],
            structures: [],
            tasks: [],
            events: [],
            templates: [
                    { id: 't1', name: 'Prise de contact', subject: 'Proposition de spectacle', body: "Bonjour {{contactFirstName}},\n\nJe me permets de vous contacter concernant la programmation de {{structName}}.\nNous sommes en préparation de notre prochaine tournée...\n\nBien à vous,\n{{userName}}" }
                ],
            campaignHistory: [],
            tagCategories: [],
            tagGenres:     [],
            tagReseaux:    [],
            tagKeywords:   [],
            savedSearches: [],
            selections:    [],
        },

            // Planning & calendrier
            viewMode: 'calendar',
            currentDate: new Date(),
            showTasksInCalendar: true,
            selectedProjectIds: [],
            planningSearch: '',
            planningStatusFilter: 'all',
            planningPeriod: 'all',

            // Pipeline
            pipelineFilterProj: '', pipelineSearch: '', draggedEventId: null,
            pipelineCols: [
                { id: 'lead',      name: 'À contacter',    dotColor: 'bg-slate-400'   },
                { id: 'contacted', name: 'Contact établi', dotColor: 'bg-blue-400'    },
                { id: 'nego',      name: 'En négociation', dotColor: 'bg-purple-400'  },
                { id: 'option',    name: 'Option posée',   dotColor: 'bg-orange-400'  },
                { id: 'contract',  name: 'Contrat envoyé', dotColor: 'bg-yellow-400'  },
                { id: 'won',       name: 'Confirmé',       dotColor: 'bg-emerald-500' },
            ],

            // Annuaire & contacts
            searchContact: '', searchStruct: '',
            contactViewMode: 'grid',
            contactSubTab: 'annuaire',
            currentSearch: { name: '', criteria: [], filterCity: '', filterStatus: '', filterRegion: '' },
            currentSearchId: null,
            searchResults: [],
            currentSelectionId: null,
            showAddToSelection: false,
            addToSelectionSearch: '',
            addToSelectionCat: '',
            addToSelectionGenre: '',
            addToSelectionPicked: [],

            // Modales
            showTaskModal:    false, editTaskData:    {},
            showEventModal:   false, editEventData:   {},
            showProjectModal: false, editProjectData: {}, isEditingProject: false,
            projectTab: 'resume',
            projectNoteText: '',
            showCrmModal:     false, currentCrmStruct: null, currentCrmContact: null,
            showTemplateModal: false, editTemplateData: {},
            showInactiveProjects: false,

            // CRM
            newCrmComment: '',
            newContactComment: '',

            // Mailing
            mailingSearch: '',
            mailingActiveTab: 'compose',
            selectedMailingContacts: [],
            selectedTemplateId: '',
            mailSubject: '', mailBody: '',
            previewContactIndex: 0,
            mailingTagFilter: {},
            mailingRightTab: 'contacts',

            // Carte géographique
            map: null, miniMap: null,
            searchRadius: 50, searchCenter: null,
            geoResults: [], mapMarkers: [], searchCircle: null,
            geoTagFilter: {},

            // Recherche globale (omnibox)
            omniSearch: '', showOmniDropdown: false,

           

            // Icônes projets
            projectIcons: ['fas fa-music', 'fas fa-guitar', 'fas fa-theater-masks', 'fas fa-microphone', 'fas fa-drum', 'fas fa-compact-disc', 'fas fa-star', 'fas fa-bolt'],

            // Dropdowns modales (non utilisés mais référencés dans certains templates)
            taskRelSearch: '', showRelDropdown: false,
            eventProjectSearch: '', showEventProjectDropdown: false,
            eventVenueSearch: '', showEventVenueDropdown: false,

            // Statut de synchronisation Firebase : 'idle' | 'saving' | 'saved' | 'error'
            saveStatus: 'idle',
            // Fonctions de désabonnement des listeners Firestore (pour logout propre)
            _firestoreUnsubs: [],
            // Debounce saveDB : évite les sauvegardes en rafale sur Firestore
            _saveDebounceTimer: null,
            // Déconnexion automatique après inactivité
            _inactivityTimer: null,
            // Vérification périodique du token (détecte révocation de session)
            _tokenCheckTimer: null,
            _inactivityDelay: 2 * 60 * 60 * 1000, // 2 heures en millisecondes
            saveStatusMessage: '',

            // Import Culture.gouv.fr
            showGouvImport: false,
            // Recherche structure dans modal Affaire
            venueSearch: '',
            venueSearchResults: [],
            showVenueDropdown: false,
            showVenueBrowser: false,
            venueBrowserRegion: '',
            venueBrowserCat: '',
            gouvImport: {
                loading: false,
                error: '',
                results: [],
                selected: [],
                totalFound: 0,
                page: 0,
                searchName: '',
                filterType: '',
                filterDept: '',
                filterRegion: '',
                activeTab: 'gouv',
            },
            // Import CSV libre
            csvImport: {
                headers: [],
                rows: [],
                mapping: {},
                fileName: '',
                mappingFields: [
                    { key: 'name',     label: 'Nom',         icon: 'fas fa-building',        required: true  },
                    { key: 'address',  label: 'Adresse',     icon: 'fas fa-map-marker-alt',  required: false },
                    { key: 'zip',      label: 'Code postal', icon: 'fas fa-mail-bulk',        required: false },
                    { key: 'city',     label: 'Ville',       icon: 'fas fa-city',            required: false },
                    { key: 'country',  label: 'Pays',        icon: 'fas fa-globe',           required: false },
                    { key: 'phone',    label: 'Téléphone',   icon: 'fas fa-phone',           required: false },
                    { key: 'email',    label: 'Email',       icon: 'fas fa-envelope',        required: false },
                    { key: 'website',  label: 'Site web',    icon: 'fas fa-link',            required: false },
                    { key: 'capacity', label: 'Jauge',       icon: 'fas fa-users',           required: false },
                    { key: 'category', label: 'Catégorie',   icon: 'fas fa-tag',             required: false },
                    { key: 'genre',    label: 'Genre musical',icon: 'fas fa-music',          required: false },
                    { key: 'source',   label: 'Source',      icon: 'fas fa-database',        required: false },
                ],
            },

            // Export avec mapping
            showExportMapping: false,
            exportMapping: {
                source: 'geo',
                contacts: [],
                cols: [],
                format: 'xlsx',
                filterStatus: '',
                filterStruct: '',
                filterCat: '',
                filterGenre: '',
                availableCols: [
                    { key: 'firstName',  label: 'Prénom',       example: 'Marie' },
                    { key: 'lastName',   label: 'Nom',          example: 'DUPONT' },
                    { key: 'role',       label: 'Fonction',     example: 'Programmatrice' },
                    { key: 'structName', label: 'Structure',    example: 'Le Théâtre' },
                    { key: 'structCity', label: 'Ville struct.', example: 'Lyon' },
                    { key: 'structZip',  label: 'CP struct.',   example: '69001' },
                    { key: 'emailPro',   label: 'Email pro',    example: 'm.dupont@theatre.fr' },
                    { key: 'emailPerso', label: 'Email perso',  example: 'marie@gmail.com' },
                    { key: 'phoneDirect',label: 'Tél. direct',  example: '04 72 00 00 00' },
                    { key: 'mobilePro',  label: 'Mobile pro',   example: '06 00 00 00 00' },
                    { key: 'structAddress', label: 'Adresse',   example: '1 rue de la Paix' },
                    { key: 'structPhone',label: 'Tél. structure',example: '04 72 00 00 01' },
                    { key: 'website',    label: 'Site web',     example: 'www.theatre.fr' },
                    { key: 'isVip',      label: 'VIP',          example: 'Oui / Non' },
                    { key: 'visibility', label: 'Visibilité',   example: 'Public / Privé' },
                    { key: 'suiviPar',   label: 'Suivi par',    example: 'Pierre' },
                ],
            },

            // Admin & permissions
            isAdmin:   false,
            userRole:  'lecteur',   // 'admin' | 'editeur' | 'lecteur'
            // Collaborateurs
            collaboratorsList:    [],
            // Historique des modifications
            activityLog:          [],
            // Notification tâches (flag pour n'afficher qu'une fois)
            _tasksAlertShown:     false,
            collaboratorsLoading: false,
            adminEmails: [],
            allowedEmails: [],          // Liste blanche des emails autorisés à s'inscrire
            newAllowedEmail: '',
            adminUsers: [],
            adminChangelog: [],
            newChangelogEntry: '',
            newAdminEmail: '',
            showChangelogBanner: false,
            latestChangelog: null,
            changelogDismissed: false,
        };
    },

    // ─────────────────────────────────────────────────────────────────────────
    // COMPUTED
    // ─────────────────────────────────────────────────────────────────────────
    computed: {
        ...contactsComputed,
        ...planningComputed,
        ...appComputed,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // WATCHERS
    // ─────────────────────────────────────────────────────────────────────────
    watch: {
        // Recharge le menu quand le statut admin change
        isAdmin(newVal, oldVal) {
            if (oldVal !== undefined && newVal !== oldVal) {
                // Forcer la mise à jour du menu sans recharger la page
                this.$forceUpdate();
            }
        },
        tab(newVal) {
            if (newVal === 'geo') { nextTick(() => { setTimeout(() => { this.initMap(); }, 300); }); }
        },
        searchRadius() {
            if (this.tab === 'geo') this.updateMap();
        },
        'db.structures': {
            deep: true,
            handler() { if (this.tab === 'geo') this.updateMap(); }
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // METHODS
    // Les méthodes des modules sont spreadées en premier.
    // Les méthodes inline ci-dessous les surchargent si nécessaire.
    // ─────────────────────────────────────────────────────────────────────────
    methods: {
        ...utilsMethods,
        ...contactsMethods,
        ...planningMethods,
        ...adminMethods,
        ...mapMethods,
        ...annuaireMethods,
        ...importMethods,
        ...gouvMethods,
        ...searchMethods,
        ...projectMethods,
        ...venueMethods,
        ...crmMethods,
        ...collaboratorMethods,

        // --- AUTHENTIFICATION FIREBASE ---
        async handleAuth() {
            try {
                if (this.isLoginMode) {
                    // ── Connexion ──────────────────────────────────────────
                    await signInWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Succès', 'Ravi de vous revoir !', 'success');
                } else {
                    // ── Inscription : vérification liste blanche ───────────
                    const emailLower = this.authEmail.trim().toLowerCase();

                    // Si la liste blanche est activée (non vide), vérifier l'email
                    if (this.allowedEmails.length > 0) {
                        const isAllowed = this.allowedEmails
                            .map(e => e.toLowerCase())
                            .includes(emailLower);
                        if (!isAllowed) {
                            return Swal.fire({
                                title: 'Accès refusé',
                                html: `Cet email n'est pas autorisé à créer un compte.<br><small class="text-slate-400">Contactez un administrateur pour obtenir l'accès.</small>`,
                                icon: 'error',
                                confirmButtonColor: '#ef4444',
                            });
                        }
                    }

                    await createUserWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Bienvenue', 'Votre compte a été créé avec succès.', 'success');
                }
                this.authEmail = '';
                this.authPassword = '';
            } catch (error) {
                Swal.fire('Erreur', 'Email ou mot de passe incorrect (ou compte déjà existant).', 'error');
            }
        },

        // --- NOTIFICATIONS DE TÂCHES ---

        // Demande la permission pour les notifications navigateur
        async requestNotificationPermission() {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'default') {
                await Notification.requestPermission();
            }
        },

        // Envoie une notification navigateur
        sendBrowserNotification(title, body, onClick = null) {
            if (!('Notification' in window) || Notification.permission !== 'granted') return;
            const notif = new Notification(title, {
                body,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
            });
            if (onClick) notif.onclick = onClick;
            setTimeout(() => notif.close(), 8000);
        },

        // Vérifie les tâches en retard et notifie si nécessaire
        checkOverdueTasks() {
            const overdue = this.tasksOverdue || [];
            const today   = this.tasksToday   || [];
            if (overdue.length === 0 && today.length === 0) return;

            // Notification navigateur
            if (overdue.length > 0) {
                this.sendBrowserNotification(
                    `⚠️ ${overdue.length} tâche(s) en retard`,
                    overdue.slice(0, 3).map(t => t.text).join('
'),
                    () => { this.tab = 'tasks'; window.focus(); }
                );
            }
        },

        // Affiche l'alerte de tâches en retard au démarrage (une seule fois)
        showTasksAlert() {
            const overdue = this.tasksOverdue || [];
            const today   = this.tasksToday   || [];
            if (overdue.length === 0 && today.length === 0) return;

            const lines = [];
            if (overdue.length > 0) lines.push(`<li class="text-red-600 font-bold">⚠ ${overdue.length} tâche(s) en retard</li>`);
            if (today.length  > 0) lines.push(`<li class="text-orange-600">📅 ${today.length} tâche(s) pour aujourd'hui</li>`);

            Swal.fire({
                title: 'Tâches à traiter',
                html: `<ul class="text-left space-y-2 mt-2">${lines.join('')}</ul>
                       <p class="text-xs text-slate-400 mt-3">Cliquez sur "Voir les tâches" pour y accéder.</p>`,
                icon: overdue.length > 0 ? 'warning' : 'info',
                showCancelButton:  true,
                confirmButtonText: 'Voir les tâches',
                cancelButtonText:  'Plus tard',
                confirmButtonColor: overdue.length > 0 ? '#ef4444' : '#f59e0b',
            }).then(r => {
                if (r.isConfirmed) this.tab = 'tasks';
            });
        },

        // --- VÉRIFICATION PÉRIODIQUE DU TOKEN ---
        // Détecte si le token a été révoqué côté serveur (changement de rôle)
        _startTokenCheck() {
            this._tokenCheckTimer = setInterval(async () => {
                if (!this.currentUser) return;
                try {
                    const { auth } = await import('./firebase.js');
                    const user = auth.currentUser;
                    if (!user) return;
                    // Force le rafraîchissement du token
                    await user.getIdToken(true);
                } catch (e) {
                    // Token révoqué ou invalide → déconnecter
                    if (e.code === 'auth/user-token-expired' ||
                        e.code === 'auth/user-disabled' ||
                        e.code === 'auth/id-token-revoked') {
                        await this.logout();
                    }
                }
            }, 30000); // Vérifie toutes les 30 secondes
        },

        _stopTokenCheck() {
            if (this._tokenCheckTimer) {
                clearInterval(this._tokenCheckTimer);
                this._tokenCheckTimer = null;
            }
        },

        // --- DÉCONNEXION AUTOMATIQUE PAR INACTIVITÉ ---
        _resetInactivityTimer() {
            if (!this.currentUser) return;
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = setTimeout(() => {
                Swal.fire({
                    title: 'Session expirée',
                    html: `Vous avez été déconnecté automatiquement après 2 heures d'inactivité.`,
                    icon: 'info',
                    confirmButtonColor: '#4f46e5',
                    confirmButtonText: 'Se reconnecter',
                    allowOutsideClick: false,
                }).then(() => this.logout());
            }, this._inactivityDelay);
        },

        _startInactivityWatcher() {
            const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
            const reset  = () => this._resetInactivityTimer();
            events.forEach(ev => window.addEventListener(ev, reset, { passive: true }));
            this._resetInactivityTimer(); // Démarre le timer initial
        },

        _stopInactivityWatcher() {
            clearTimeout(this._inactivityTimer);
            this._inactivityTimer = null;
        },

        async logout() {
            this._stopTokenCheck();
            this._stopInactivityWatcher();
            // Désabonner tous les listeners Firestore AVANT la déconnexion
            // pour éviter les erreurs "permission-denied" sur les snapshots actifs
            this._firestoreUnsubs.forEach(unsub => { try { unsub(); } catch(e) {} });
            this._firestoreUnsubs = [];
            await signOut(auth);
            this.currentUser = null;
        },

        // --- PERSISTANCE FIRESTORE ---

        // saveDB() : version debouncée — attend 1.5s avant de sauvegarder
        // Si appelée plusieurs fois en rafale, seul le dernier appel déclenche la sauvegarde
        saveDB() {
            clearTimeout(this._saveDebounceTimer);
            this._saveDebounceTimer = setTimeout(() => this._saveDBNow(), 1500);
        },

        // _saveDBNow() : sauvegarde immédiate (utilisée par logout et saveData)
        // --- HISTORIQUE DES MODIFICATIONS ---
        async logActivity(action, details = '') {
            if (!this.currentUser) return;
            try {
                await addDoc(collection(dbFirestore, "activity_log"), {
                    uid:       this.currentUser,
                    user:      this.currentUserName,
                    action,
                    details,
                    timestamp: serverTimestamp(),
                    date:      new Date().toISOString(),
                });
            } catch (e) { /* log silencieux */ }
        },

        async _saveDBNow() {
            if (!this.currentUser) return;
            this.saveStatus = 'saving';
            this.saveStatusMessage = 'Synchronisation…';
            try {
                // 1. Sauvegarde des données propres à l'utilisateur
                // AJOUT DE .uid ICI
                await setDoc(doc(dbFirestore, "users", this.currentUser), {
                    projects:        this.db.projects,
                    tasks:           this.db.tasks,
                    events:          this.db.events,
                    templates:       this.db.templates       || [],
                    campaignHistory: this.db.campaignHistory || [],
                    savedSearches:   this.db.savedSearches   || [],
                    selections:      this.db.selections      || [],
                });

                // 2. Sauvegarde des tags et de l'annuaire (Partagé)
                await setDoc(doc(dbFirestore, "shared", "annuaire"), {
                    structures:    this.db.structures,
                    // Utilisation de this.db.tag... pour être raccord avec le reste
                    tagCategories: this.db.tagCategories,
                    tagGenres:     this.db.tagGenres,
                    tagReseaux:    this.db.tagReseaux,
                    tagKeywords:   this.db.tagKeywords,
                });

                this.saveStatus = 'saved';
                this.saveStatusMessage = 'Synchronisé · ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                setTimeout(() => { if (this.saveStatus === 'saved') this.saveStatus = 'idle'; }, 4000);
            } catch (error) {
                // ... reste de votre gestion d'erreur
                console.error("Erreur sauvegarde cloud");
                this.saveStatus = 'error';
                this.saveStatusMessage = 'Erreur de sauvegarde !';
                Swal.fire({
                    title: 'Erreur Firebase',
                    html: 'Les données n\'ont pas pu être sauvegardées.<br><small>' + error.message + '</small>',
                    icon: 'error',
                    confirmButtonText: 'Réessayer',
                    showCancelButton: true,
                    cancelButtonText: 'Ignorer'
                }).then(r => { if (r.isConfirmed) this.saveDB(); });
            }
        },
        async refreshTags() {
    this.saveStatus = 'saving';
    this.saveStatusMessage = 'Actualisation des tags...';
    try {
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const docRef = doc(dbFirestore, "shared", "annuaire");
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const d = docSnap.data();
            this.db.tagCategories = d.tagCategories || this.db.tagCategories;
            this.db.tagGenres     = d.tagGenres     || this.db.tagGenres;
            this.db.tagReseaux    = d.tagReseaux    || this.db.tagReseaux;
            this.db.tagKeywords   = d.tagKeywords   || this.db.tagKeywords;
            
            this.saveStatus = 'saved';
            Swal.fire({ title: 'Tags actualisés', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        }
    } catch (error) {
        console.error("Erreur refresh tags");
        this.saveStatus = 'error';
    }
},
        async saveData() {
            // Sauvegarde manuelle = immédiate (bypass debounce)
            clearTimeout(this._saveDebounceTimer);
            await this._saveDBNow();
            if (this.saveStatus === 'saved') {
                Swal.fire({ title: 'Enregistré sur Firebase ✓', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
            }
        },

       // --- TAGS & PARAMÈTRES ---
async addGlobalTag(familyName) {
    const r = await Swal.fire({
        title: 'Nouveau tag', 
        input: 'text', 
        inputPlaceholder: 'Entrez le nom du tag...',
        showCancelButton: true, 
        confirmButtonText: 'Ajouter', 
        cancelButtonText: 'Annuler'
    });
    
    
    if (r.isConfirmed && r.value.trim()) {
        // CORRECTION : On modifie dans this.db[familyName]
        if (!this.db[familyName]) this.db[familyName] = [];
        
        // On crée une nouvelle copie du tableau dans db pour la réactivité
        this.db[familyName] = [...this.db[familyName], this.sanitizeText(r.value, 80)];
        
        // Sauvegarde de l'objet db (qui contient maintenant le nouveau tag)
        await this.saveDB();
        
        Swal.fire({ 
            title: 'Tag sauvegardé ✓', 
            icon: 'success', 
            toast: true, 
            position: 'top-end', 
            timer: 1500, 
            showConfirmButton: false 
        });
    }
},

async removeGlobalTag(familyName, tag) {
    const r = await Swal.fire({
        title: 'Supprimer ce tag ?', 
        text: `Le tag "${tag}" ne sera plus proposé.`,
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#ef4444', 
        confirmButtonText: 'Supprimer'
    });
    
    if (r.isConfirmed) {
        // CORRECTION : On filtre dans this.db[familyName]
        if (this.db[familyName]) {
            this.db[familyName] = this.db[familyName].filter(t => t !== tag);
            await this.saveDB();
        }
    }
},

        // --- OMNIBOX ---
        goOmni(item) {
            this.showOmniDropdown = false;
            this.omniSearch = '';
            if (item.type === 'structure') { this.tab = 'structures'; this.openCrmView(item.original); }
            if (item.type === 'contact')   { const s = this.db.structures.find(st => st.id === item.original.structId); if (s) { this.tab = 'structures'; this.openCrmView(s); } }
            if (item.type === 'project')   { this.tab = 'projects'; this.openProjectModal(item.original); }
        },

        hideOmni() {
            setTimeout(() => { this.showOmniDropdown = false; }, 200);
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // LIFECYCLE
    // ─────────────────────────────────────────────────────────────────────────
    mounted() {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.currentUser     = user.uid;
                this.currentUserName = user.displayName || user.email || user.uid;
                this._startInactivityWatcher(); // Démarre la surveillance d'inactivité
                this.requestNotificationPermission(); // Demande permission notifications
                this._startTokenCheck();           // Démarre la vérification du token

                // ── Enregistrement de l'utilisateur dans le registre ──
                try {
                    const userRef  = doc(dbFirestore, "users_registry", user.uid);
                    const userSnap = await getDoc(userRef);
                    const prevCount = userSnap.exists() ? (userSnap.data().loginCount || 0) : 0;
                    await setDoc(userRef, {
                        uid:        user.uid,
                        email:      user.email,
                        lastLogin:  new Date().toISOString(),
                        createdAt:  user.metadata?.creationTime || new Date().toISOString(),
                        loginCount: prevCount + 1,
                    }, { merge: true });
                } catch (e) { /* enregistrement registre silencieux */ }



                // ── Écoute de la config admin (changelog + adminEmails) ──
                this._firestoreUnsubs.push(onSnapshot(doc(dbFirestore, "shared", "config"), async (snap) => {
                    if (snap.exists()) {
                        const cfg = snap.data();
                        this.adminEmails    = cfg.adminEmails  || [];
                        this.allowedEmails  = cfg.allowedEmails || [];
                        this.adminChangelog = cfg.changelog    || [];
                        this.isAdmin        = this.adminEmails.includes(user.email);
                        if (this.adminChangelog.length > 0 && !this.changelogDismissed) {
                            this.latestChangelog    = this.adminChangelog[0];
                            this.showChangelogBanner = true;
                        }
                    } else {
                        this.adminEmails = [user.email];
                        this.isAdmin     = true;
                        this.saveAdminConfig();
                    }
                    // ── Rôle chargé depuis userRoles dans shared/config ──
                    const cfg2       = snap.exists() ? snap.data() : {};
                    const userRoles  = cfg2.userRoles || {};
                    const inUserRoles = userRoles.hasOwnProperty(user.email);
                    // Priorité : userRoles > adminEmails > editeur par défaut
                    const newRole = inUserRoles
                        ? userRoles[user.email]
                        : (this.adminEmails.includes(user.email) ? 'admin' : 'editeur');
                    const prevRole = this.userRole;
                    this.userRole  = newRole;
                    // Si le rôle a changé après le chargement initial → recharger
                    if (prevRole && prevRole !== 'lecteur' && prevRole !== newRole) {
                        window.location.reload();
                    }
                }));
                // ── Données privées (projets, tâches, affaires, templates) ──
                this._firestoreUnsubs.push(onSnapshot(doc(dbFirestore, "users", this.currentUser), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        this.db.projects        = data.projects        || [];
                        this.db.tasks           = data.tasks           || [];
                        this.db.events          = data.events          || [];
                        this.db.templates       = data.templates       || this.db.templates;
                        this.db.campaignHistory = data.campaignHistory || [];
                        this.db.savedSearches   = data.savedSearches   || [];
                        this.db.selections      = data.selections      || [];
                    } else {
                        const savedPrivate = localStorage.getItem(`coopArtBookingDB_${this.currentUser}`);
                        if (savedPrivate) {
                            try {
                                const parsed = JSON.parse(savedPrivate);
                                this.db.projects = parsed.projects || [];
                                this.db.tasks    = parsed.tasks    || [];
                                this.db.events   = parsed.events   || [];
                                this.saveDB();
                            } catch (e) { /* migration locale silencieuse */ }
                        } else {
                            this.db.projects = []; this.db.tasks = []; this.db.events = [];
                        }
                    }
                    if (this.selectedProjectIds.length === 0 && this.db.projects.length > 0) {
                        this.selectedProjectIds = this.db.projects.map(p => p.id);
                    }
                    // Vérifier les tâches en retard après chargement initial
                    if (!this._tasksAlertShown) {
                        this._tasksAlertShown = true;
                        this.$nextTick(() => {
                            setTimeout(() => {
                                this.checkOverdueTasks();
                                // Alerte au démarrage seulement si tâches en retard
                                if ((this.tasksOverdue || []).length > 0) {
                                    this.showTasksAlert();
                                }
                            }, 2000); // Délai pour laisser l'app se charger
                        });
                    }
                }));

                // ── Annuaire partagé (structures + tags) ── UNIQUE listener ──
                this._firestoreUnsubs.push(onSnapshot(doc(dbFirestore, "shared", "annuaire"), (docSnap) => {
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        this.db.structures    = d.structures    || [];
                        this.db.tagCategories = d.tagCategories || this.db.tagCategories;
                        this.db.tagGenres     = d.tagGenres     || this.db.tagGenres;
                        this.db.tagReseaux    = d.tagReseaux    || this.db.tagReseaux;
                        this.db.tagKeywords   = d.tagKeywords   || this.db.tagKeywords;
                        if (!d.tagCategories) this.saveDB();
                    } else {
                        const oldLocal = localStorage.getItem('coopArtBookingDB');
                        if (oldLocal) {
                            try {
                                const oldDb = JSON.parse(oldLocal);
                                if (oldDb.structures && oldDb.structures.length > 0) {
                                    this.db.structures = oldDb.structures;
                                    this.saveDB();
                                }
                            } catch (e) { /* migration annuaire silencieuse */ }
                        } else {
                            this.db.structures = [];
                        }
                    }
                }));

            } else {
                this.currentUser = null;
                this.currentUserName = '';
            }
        });
    },

}).mount('#app');
