// app.js — Bob Booking CRM
// Architecture modulaire disponible dans js/modules/ :
//   appComputed.js   | crmMethods.js    | adminMethods.js
//   mapMethods.js    | importMethods.js | gouvMethods.js  
//   searchMethods.js | projectMethods.js| venueMethods.js
// ─────────────────────────────────────────────────────────

// app.js — Point d'entrée Vue.js — Bob Booking

// --- IMPORTS FIREBASE ---
import { auth, dbFirestore }                                              from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword,
         onAuthStateChanged, signOut }                                    from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc, onSnapshot }                               from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

            // Admin
            isAdmin: false,
            adminEmails: [],
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

        totalCA() {
            return this.db.events
                .filter(e => e.status === 'conf')
                .reduce((sum, e) => sum + (Number(e.fee) || 0), 0);
        },

        omniResults() {
            if (this.omniSearch.length < 2) return {};
            const s = this.omniSearch.toLowerCase();
            const res = {};
            const c = this.filteredContacts.filter(x => (x.name || '').toLowerCase().includes(s) || (x.structName && x.structName.toLowerCase().includes(s)));
            if (c.length) res['Contacts'] = c.map(x => ({ id: x.id, name: x.name || `${x.firstName||''} ${x.lastName||''}`.trim(), sub: x.structName, type: 'contact', original: x }));
            const st = this.db.structures.filter(x => x.name.toLowerCase().includes(s) || x.city.toLowerCase().includes(s));
            if (st.length) res['Lieux & Structures'] = st.map(x => ({ id: x.id, name: x.name, sub: x.city, type: 'structure', original: x }));
            const p = this.db.projects.filter(x => x.name.toLowerCase().includes(s));
            if (p.length) res['Spectacles'] = p.map(x => ({ id: x.id, name: x.name, sub: x.genre, type: 'project', original: x }));
            return res;
        },

        // ── Tags dynamiques : liste statique + tous les tags réellement en base ──
        allTagCategories() {
            const set = new Set(this.tagCategories);
            this.db.structures.forEach(s => (s.tags?.categories || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagGenres() {
            const set = new Set(this.tagGenres);
            this.db.structures.forEach(s => (s.tags?.genres || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagReseaux() {
            const set = new Set(this.tagReseaux);
            this.db.structures.forEach(s => (s.tags?.reseaux || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        allTagKeywords() {
            const set = new Set(this.tagKeywords);
            this.db.structures.forEach(s => (s.tags?.keywords || []).forEach(t => set.add(t)));
            return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
        },

        hasActiveGeoTagFilters() {
            return Object.values(this.geoTagFilter || {}).some(arr => arr && arr.length > 0);
        },

        exportMappingFilteredContacts() {
            let list = [...(this.exportMapping.contacts || [])];
            const f = this.exportMapping;
            if (f.source === 'contacts') {
                if (f.filterStatus === 'active')  list = list.filter(c => c.isActive !== false);
                if (f.filterStatus === 'vip')     list = list.filter(c => c.isVip);
                if (f.filterStatus === 'public')  list = list.filter(c => !c.isPrivate);
                if (f.filterStatus === 'private') list = list.filter(c => c.isPrivate);
                if (f.filterStruct) list = list.filter(c => c.structId === f.filterStruct);
                if (f.filterCat || f.filterGenre) {
                    list = list.filter(c => {
                        const s = this.db.structures.find(x => x.id === c.structId);
                        if (!s) return false;
                        if (f.filterCat   && !(s.tags?.categories||[]).includes(f.filterCat))   return false;
                        if (f.filterGenre && !(s.tags?.genres||[]).includes(f.filterGenre)) return false;
                        return true;
                    });
                }
            }
            return list;
        },

        exportMappingPreview() {
            return this.exportMappingFilteredContacts.slice(0, 3).map(c => this.buildExportRow(c));
        },

        // ── Projet : affaires liées ──
        getProjectEvents() {
            return (projectId) => this.db.events.filter(e => e.projectId === projectId);
        },

        // ── Projet : structures liées (via affaires) ──
        getProjectStructures() {
            return (projectId) => {
                const events = this.db.events.filter(e => e.projectId === projectId && e.venueId);
                const ids = [...new Set(events.map(e => e.venueId))];
                return ids.map(id => this.db.structures.find(s => s.id === id)).filter(Boolean);
            };
        },

        // ── Projet : contacts liés (via structures liées) ──
        getProjectContacts() {
            return (projectId) => {
                const structs = this.getProjectStructures(projectId);
                const contacts = [];
                structs.forEach(s => {
                    (s.contacts || []).forEach(c => {
                        contacts.push({
                            ...c,
                            structName: s.name,
                            structCity: s.city,
                            structId:   s.id,
                        });
                    });
                });
                return contacts;
            };
        },

        // ── Projet : prochaine date à venir ──
        getProjectNextDate() {
            return (projectId) => {
                const today = new Date().toISOString().slice(0, 10);
                return this.db.events
                    .filter(e => e.projectId === projectId && e.date && e.date >= today && e.stage !== 'ann')
                    .sort((a, b) => a.date.localeCompare(b.date))[0] || null;
            };
        },

        // ── Recherche venue dans modal affaire ──
        venueContacts() {
            if (!this.editEventData.venueId) return [];
            const s = this.db.structures.find(x => x.id === this.editEventData.venueId);
            return s ? (s.contacts || []) : [];
        },

        venueRegions() {
            const regions = new Set();
            this.db.structures.forEach(s => { if (s.region) regions.add(s.region); });
            return [...regions].sort();
        },

        venueBrowserResults() {
            let list = this.db.structures;
            if (this.venueBrowserRegion) {
                list = list.filter(s => (s.region || '') === this.venueBrowserRegion);
            }
            if (this.venueBrowserCat) {
                list = list.filter(s => (s.tags?.categories || []).includes(this.venueBrowserCat));
            }
            return list.slice(0, 50);
        },

        frenchRegions() {
            return [
                'Auvergne-Rhône-Alpes',
                'Bourgogne-Franche-Comté',
                'Bretagne',
                'Centre-Val de Loire',
                'Corse',
                'Grand Est',
                'Guadeloupe',
                'Guyane',
                'Hauts-de-France',
                'Île-de-France',
                'La Réunion',
                'Martinique',
                'Mayotte',
                'Normandie',
                'Nouvelle-Aquitaine',
                'Occitanie',
                'Pays de la Loire',
                "Provence-Alpes-Côte d'Azur",
                'Belgique',
                'Suisse',
                'Luxembourg',
                'Canada',
                'Autre',
            ];
        },

        currentSelectionObj() {
            return (this.db.selections || []).find(s => s.id === this.currentSelectionId) || null;
        },

        selectionContacts() {
            if (!this.currentSelectionObj) return [];
            const ids = this.currentSelectionObj.contactIds || [];
            return this.filteredContacts.filter(c => ids.includes(c.id));
        },

        addToSelectionFiltered() {
            if (!this.currentSelectionObj) return [];
            const existingIds = this.currentSelectionObj.contactIds || [];
            // On part de tous les contacts (pas déjà dans la sélection)
            let list = this.filteredContacts.filter(c => !existingIds.includes(c.id));
            const q = (this.addToSelectionSearch || '').toLowerCase().trim();
            if (q) {
                list = list.filter(c =>
                    (c.name       || '').toLowerCase().includes(q) ||
                    (c.structName || '').toLowerCase().includes(q) ||
                    (c.structCity || '').toLowerCase().includes(q)
                );
            }
            if (this.addToSelectionCat || this.addToSelectionGenre) {
                list = list.filter(c => {
                    const s = this.db.structures.find(x => x.id === c.structId);
                    if (!s) return false;
                    if (this.addToSelectionCat   && !(s.tags?.categories||[]).includes(this.addToSelectionCat))   return false;
                    if (this.addToSelectionGenre && !(s.tags?.genres||[]).includes(this.addToSelectionGenre)) return false;
                    return true;
                });
            }
            return list;
        },

        adminStats() {
            // Protection si les données ne sont pas encore chargées
            if (!this.db || !this.db.structures) {
                return { totalContacts: 0, privateContacts: 0, structsWithGps: 0, gpsRate: 0, emailRate: 0, tagRate: 0, recentActivity: [], alerts: [] };
            }
            const allContacts = this.db.structures.flatMap(s => s.contacts || []);
            const totalContacts   = allContacts.length;
            const privateContacts = allContacts.filter(c => c.isPrivate).length;
            const structsWithGps  = this.db.structures.filter(s => s.lat && s.lng).length;
            const structsTotal    = this.db.structures.length || 1;
            const gpsRate         = Math.round((structsWithGps / structsTotal) * 100);
            const contactsWithEmail = allContacts.filter(c => c.emailPro || c.emailPerso).length;
            const emailRate       = totalContacts > 0 ? Math.round((contactsWithEmail / totalContacts) * 100) : 0;
            const structsWithTags = this.db.structures.filter(s => {
                const t = s.tags || {};
                return (t.categories||[]).length > 0 || (t.genres||[]).length > 0 || (t.reseaux||[]).length > 0 || (t.keywords||[]).length > 0;
            }).length;
            const tagRate = Math.round((structsWithTags / structsTotal) * 100);

            // Activité récente : derniers commentaires + dernières structures créées
            const recentActivity = [];
            this.db.structures.forEach(s => {
                // Commentaires structure
                (s.comments || []).forEach(cm => {
                    recentActivity.push({ id: 'sc_' + cm.id, type: 'comment', label: `Commentaire sur "${s.name}" : ${cm.text.substring(0,50)}${cm.text.length>50?'…':''}`, date: cm.date, user: cm.user });
                });
                // Commentaires contacts
                (s.contacts || []).forEach(c => {
                    (c.comments || []).forEach(cm => {
                        recentActivity.push({ id: 'cc_' + cm.id, type: 'contact', label: `Note sur ${c.firstName} ${c.lastName} (${s.name}) : ${cm.text.substring(0,40)}${cm.text.length>40?'…':''}`, date: cm.date, user: cm.user });
                    });
                });
                // Structure créée
                if (s.createdDate) {
                    recentActivity.push({ id: 'st_' + s.id, type: 'structure', label: `Structure créée : "${s.name}" — ${s.city || ''}`, date: new Date(s.createdDate).toLocaleDateString('fr-FR'), user: '' });
                }
            });
            recentActivity.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            // Alertes qualité
            const alerts = [];
            const noEmail = allContacts.filter(c => !c.emailPro && !c.emailPerso).length;
            if (noEmail > 0) alerts.push({ id: 'a1', level: 'warn', message: 'Contacts sans email', detail: 'Ces contacts ne pourront pas recevoir de campagne mailing.', count: noEmail });
            const noGps = this.db.structures.filter(s => !s.lat || !s.lng).length;
            if (noGps > 0) alerts.push({ id: 'a2', level: 'warn', message: 'Structures sans GPS', detail: 'Non visibles sur la carte & invitations.', count: noGps });
            const noContact = this.db.structures.filter(s => !(s.contacts||[]).length).length;
            if (noContact > 0) alerts.push({ id: 'a3', level: 'warn', message: 'Structures sans contact', detail: 'Aucun interlocuteur renseigné pour ces structures.', count: noContact });
            const noPhone = allContacts.filter(c => !c.phoneDirect && !c.mobilePro && !c.phonePerso && !c.mobilePerso).length;
            if (noPhone > 0) alerts.push({ id: 'a4', level: 'warn', message: 'Contacts sans téléphone', detail: 'Aucun numéro renseigné.', count: noPhone });
            const noCity = this.db.structures.filter(s => !s.city).length;
            if (noCity > 0) alerts.push({ id: 'a5', level: 'error', message: 'Structures sans ville', detail: 'La ville est indispensable pour les recherches géographiques.', count: noCity });
            const noTags = this.db.structures.filter(s => { const t = s.tags||{}; return !(t.categories||[]).length && !(t.genres||[]).length && !(t.reseaux||[]).length && !(t.keywords||[]).length; }).length;
            if (noTags > 0) alerts.push({ id: 'a6', level: 'warn', message: 'Structures sans tags', detail: 'Non filtrables dans Mailing et Carte & Invitations.', count: noTags });

            return { totalContacts, privateContacts, structsWithGps, gpsRate, emailRate, tagRate, recentActivity: recentActivity.slice(0, 20), alerts };
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // WATCHERS
    // ─────────────────────────────────────────────────────────────────────────
    watch: {
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

        // --- AUTHENTIFICATION FIREBASE ---
        async handleAuth() {
            try {
                if (this.isLoginMode) {
                    await signInWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Succès', 'Ravi de vous revoir !', 'success');
                } else {
                    await createUserWithEmailAndPassword(auth, this.authEmail, this.authPassword);
                    Swal.fire('Bienvenue', 'Votre compte a été créé avec succès.', 'success');
                }
                this.authEmail = '';
                this.authPassword = '';
            } catch (error) {
                console.error(error);
                Swal.fire('Erreur', 'Email ou mot de passe incorrect (ou compte déjà existant).', 'error');
            }
        },

        async logout() {
            await signOut(auth);
            this.currentUser = null;
        },

        // --- PERSISTANCE FIRESTORE ---
        async saveDB() {
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
                console.error("Erreur sauvegarde cloud :", error);
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
        console.error("Erreur refresh tags:", error);
        this.saveStatus = 'error';
    }
},
        async saveData() {
            await this.saveDB();
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
        this.db[familyName] = [...this.db[familyName], r.value.trim()];
        
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

        // --- MOTEUR CRM ---
        openCrmView(struct = null) {
            if (!struct) {
                struct = {
                    id: Date.now().toString(), name: 'Nouvelle Structure', isClient: false, isActive: true,
                    clientCode: '', source: '', createdDate: new Date().toISOString(),
                    address: '', suite: '', zip: '', city: '', region: '', country: 'France',
                    phone1: '', phone2: '', mobile: '', fax: '', email: '', website: '',
                    capacity: '', season: '', hours: '', lat: null, lng: null,
                    progMonthStart: '', progMonthEnd: '',
                    tags: { categories: [], genres: [], reseaux: [], keywords: [] },
                    contacts: [], comments: [], venues: []
                };
            } else {
                if (!struct.tags || Array.isArray(struct.tags)) struct.tags = { categories: [], genres: [], reseaux: [], keywords: [] };
                if (!struct.contacts) struct.contacts = [];
                if (!struct.comments) struct.comments = [];
                if (!struct.venues)   struct.venues   = [];
            }
            this.currentCrmStruct  = JSON.parse(JSON.stringify(struct));
            this.currentCrmContact = null;
            this.showCrmModal      = true;
            nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
        },

        closeCrmContact() {
            this.currentCrmContact = null;
            nextTick(() => { setTimeout(() => { this.initMiniMap(); }, 400); });
        },

        saveCrmStruct(silent = false) {
            if (!this.currentCrmStruct.name.trim()) return Swal.fire('Erreur', 'Le nom de la structure est obligatoire.', 'error');
            const idx = this.db.structures.findIndex(s => s.id === this.currentCrmStruct.id);
            if (idx > -1) this.db.structures[idx] = this.currentCrmStruct;
            else          this.db.structures.push(this.currentCrmStruct);
            this.saveDB();
            this.showCrmModal = false;
            if (!silent) Swal.fire({ title: 'Fiche CRM Enregistrée', icon: 'success', toast: true, position: 'top-end', timer: 2000, showConfirmButton: false });
        },

        deleteStructure(s) {
            Swal.fire({ title: 'Supprimer ?', text: "Supprimer la structure et ses contacts ?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444' })
                .then(r => { if (r.isConfirmed) { this.db.structures = this.db.structures.filter(x => x.id !== s.id); this.saveDB(); } });
        },

        addCrmVenue() {
            Swal.fire({
                title: 'Ajouter un lieu/salle',
                html: '<input id="swal-v-name" class="swal2-input" placeholder="Nom (ex: Le Club, Petite Jauge...)">' +
                      '<input id="swal-v-cap" type="number" class="swal2-input" placeholder="Jauge (ex: 300)">',
                focusConfirm: false, showCancelButton: true, confirmButtonText: 'Ajouter', cancelButtonText: 'Annuler',
                preConfirm: () => {
                    const name = document.getElementById('swal-v-name').value;
                    const cap  = document.getElementById('swal-v-cap').value;
                    if (!name) Swal.showValidationMessage('Le nom de la salle est obligatoire');
                    return { name, capacity: cap };
                }
            }).then(r => {
                if (r.isConfirmed) {
                    if (!this.currentCrmStruct.venues) this.currentCrmStruct.venues = [];
                    this.currentCrmStruct.venues.push({ id: Date.now(), name: r.value.name, capacity: r.value.capacity });
                }
            });
        },

        removeCrmVenue(id) {
            this.currentCrmStruct.venues = this.currentCrmStruct.venues.filter(v => v.id !== id);
        },

        toggleCrmTag(family, tag) {
            const arr = this.currentCrmStruct.tags[family];
            const idx = arr.indexOf(tag);
            if (idx > -1) arr.splice(idx, 1);
            else          arr.push(tag);
        },

        addCrmComment() {
            if (!this.newCrmComment.trim()) return;
            if (!this.currentCrmStruct.comments) this.currentCrmStruct.comments = [];
            this.currentCrmStruct.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.newCrmComment.trim(), user: this.currentUserName });
            this.newCrmComment = '';
            // Sauvegarde automatique immédiate
            this.saveDB();
        },

        addContactComment() {
            if (!this.newContactComment.trim()) return;
            if (!this.currentCrmContact.comments) this.currentCrmContact.comments = [];
            this.currentCrmContact.comments.push({ id: Date.now(), date: this.getProTimestamp(), text: this.newContactComment.trim(), user: this.currentUserName });
            this.newContactComment = '';
            // Sauvegarde automatique immédiate
            this.saveDB();
        },

        // --- NOTES PROJET ---
        addProjectNote() {
            if (!this.projectNoteText.trim()) return;
            if (!this.editProjectData.notes) this.editProjectData.notes = [];
            this.editProjectData.notes.push({
                id:   Date.now().toString(),
                text: this.projectNoteText.trim(),
                date: this.getProTimestamp ? this.getProTimestamp() : new Date().toLocaleString('fr-FR'),
                user: this.currentUserName,
            });
            this.projectNoteText = '';
            this.saveProjectNotes();
        },

        removeProjectNote(noteId) {
            this.editProjectData.notes = (this.editProjectData.notes || []).filter(n => n.id !== noteId);
            this.saveProjectNotes();
        },

        saveProjectNotes() {
            const idx = this.db.projects.findIndex(p => p.id === this.editProjectData.id);
            if (idx > -1) {
                this.db.projects[idx].notes = this.editProjectData.notes;
                this.saveDB();
            }
        },

        openEventFromProject(p) {
            const prefilled = {
                id: '', projectId: p.id, stage: 'lead',
                venueId: '', venueName: '', city: '',
                date: '', time: '', fee: p.defaultFee || '',
                feeType: p.feeType || 'HT', contractType: 'cession',
            };
            this.showProjectModal = false;
            this.tab = 'planning';
            this.$nextTick(() => { this.openEventModal(null, prefilled); });
        },

        // --- RECHERCHE VENUE (modal Affaire) ---
        searchVenues() {
            const q = (this.venueSearch || '').toLowerCase().trim();
            if (q.length < 2) { this.venueSearchResults = []; return; }
            this.venueSearchResults = this.db.structures.filter(s => {
                return (s.name   || '').toLowerCase().includes(q) ||
                       (s.city   || '').toLowerCase().includes(q) ||
                       (s.zip    || '').includes(q) ||
                       (s.region || '').toLowerCase().includes(q) ||
                       (s.tags?.categories || []).some(t => t.toLowerCase().includes(q)) ||
                       (s.tags?.reseaux    || []).some(t => t.toLowerCase().includes(q));
            }).slice(0, 8);
            this.showVenueDropdown = true;
        },

        selectVenue(s) {
            this.editEventData.venueId   = s.id;
            this.editEventData.venueName = s.name;
            this.editEventData.city      = s.city || '';
            // Pré-remplir la jauge si disponible
            if (s.capacity && !this.editEventData.capacity) this.editEventData.capacity = s.capacity;
            this.venueSearch        = '';
            this.venueSearchResults = [];
            this.showVenueDropdown  = false;
            this.showVenueBrowser   = false;
        },

        clearVenueSelection() {
            this.editEventData.venueId    = '';
            this.editEventData.venueName  = '';
            this.editEventData.city       = '';
            this.editEventData.contactId  = '';
            this.editEventData.contactName= '';
            this.venueSearch = '';
            this.venueSearchResults = [];
        },

        getDeptLabel(dept) {
            const depts = {
                '01':'Ain','02':'Aisne','03':'Allier','04':'Alpes-de-Haute-Provence','05':'Hautes-Alpes',
                '06':'Alpes-Maritimes','07':'Ardèche','08':'Ardennes','09':'Ariège','10':'Aube',
                '11':'Aude','12':'Aveyron','13':'Bouches-du-Rhône','14':'Calvados','15':'Cantal',
                '16':'Charente','17':'Charente-Maritime','18':'Cher','19':'Corrèze','20':'Corse',
                '21':'Côte-d\'Or','22':'Côtes-d\'Armor','23':'Creuse','24':'Dordogne','25':'Doubs',
                '26':'Drôme','27':'Eure','28':'Eure-et-Loir','29':'Finistère','2A':'Corse-du-Sud',
                '2B':'Haute-Corse','30':'Gard','31':'Haute-Garonne','32':'Gers','33':'Gironde',
                '34':'Hérault','35':'Ille-et-Vilaine','36':'Indre','37':'Indre-et-Loire',
                '38':'Isère','39':'Jura','40':'Landes','41':'Loir-et-Cher','42':'Loire',
                '43':'Haute-Loire','44':'Loire-Atlantique','45':'Loiret','46':'Lot',
                '47':'Lot-et-Garonne','48':'Lozère','49':'Maine-et-Loire','50':'Manche',
                '51':'Marne','52':'Haute-Marne','53':'Mayenne','54':'Meurthe-et-Moselle',
                '55':'Meuse','56':'Morbihan','57':'Moselle','58':'Nièvre','59':'Nord',
                '60':'Oise','61':'Orne','62':'Pas-de-Calais','63':'Puy-de-Dôme',
                '64':'Pyrénées-Atlantiques','65':'Hautes-Pyrénées','66':'Pyrénées-Orientales',
                '67':'Bas-Rhin','68':'Haut-Rhin','69':'Rhône','70':'Haute-Saône',
                '71':'Saône-et-Loire','72':'Sarthe','73':'Savoie','74':'Haute-Savoie',
                '75':'Paris','76':'Seine-Maritime','77':'Seine-et-Marne','78':'Yvelines',
                '79':'Deux-Sèvres','80':'Somme','81':'Tarn','82':'Tarn-et-Garonne',
                '83':'Var','84':'Vaucluse','85':'Vendée','86':'Vienne','87':'Haute-Vienne',
                '88':'Vosges','89':'Yonne','90':'Territoire de Belfort','91':'Essonne',
                '92':'Hauts-de-Seine','93':'Seine-Saint-Denis','94':'Val-de-Marne',
                '95':'Val-d\'Oise','97':'Outre-Mer',
            };
            return depts[dept] ? `${dept} - ${depts[dept]}` : null;
        },

        // Wrapper openEventModal pour réinitialiser la recherche venue
        openEventModal(ev, data) {
            this.venueSearch        = '';
            this.venueSearchResults = [];
            this.showVenueDropdown  = false;
            this.showVenueBrowser   = false;
            // Appel du module planning
            if (this.$options.methods._openEventModal) {
                this.$options.methods._openEventModal.call(this, ev, data);
            } else {
                // Fallback direct
                this.editEventData = data ? JSON.parse(JSON.stringify(data)) : {
                    id:'', projectId:'', stage:'lead', venueId:'', venueName:'', city:'',
                    date:'', time:'', fee:'', feeType:'HT', contractType:'cession',
                    capacity:'', ticketPrice:'', corealPercentage:'', tourExpenses:'', estFillRate:'',
                    status:'prospect', notes:'', contactId:'', contactName:''
                };
                this.showEventModal = true;
            }
        },

        openCrmViewFromProject(s) {
            this.showProjectModal = false;
            this.tab = 'structures';
            this.$nextTick(() => { this.openCrmView(s); });
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
                } catch (e) { console.warn("Registre utilisateur:", e); }

                // ── Écoute de la config admin (changelog + adminEmails) ──
                onSnapshot(doc(dbFirestore, "shared", "config"), (snap) => {
                    if (snap.exists()) {
                        const cfg = snap.data();
                        this.adminEmails    = cfg.adminEmails || [];
                        this.adminChangelog = cfg.changelog   || [];
                        this.isAdmin        = this.adminEmails.includes(user.email);
                        // Afficher la dernière note de version si pas encore vue
                        if (this.adminChangelog.length > 0 && !this.changelogDismissed) {
                            this.latestChangelog    = this.adminChangelog[0];
                            this.showChangelogBanner = true;
                        }
                    } else {
                        // Premier lancement : initialiser avec l'email courant comme admin
                        this.adminEmails = [user.email];
                        this.isAdmin     = true;
                        this.saveAdminConfig();
                    }
                });
                // ── Données privées (projets, tâches, affaires, templates) ──
                onSnapshot(doc(dbFirestore, "users", this.currentUser), (docSnap) => {
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
                        const savedPrivate = localStorage.getItem(`bobBookingDB_${this.currentUser}`);
                        if (savedPrivate) {
                            try {
                                const parsed = JSON.parse(savedPrivate);
                                this.db.projects = parsed.projects || [];
                                this.db.tasks    = parsed.tasks    || [];
                                this.db.events   = parsed.events   || [];
                                this.saveDB();
                            } catch (e) { console.error('Erreur lecture DB locale privée'); }
                        } else {
                            this.db.projects = []; this.db.tasks = []; this.db.events = [];
                        }
                    }
                    if (this.selectedProjectIds.length === 0 && this.db.projects.length > 0) {
                        this.selectedProjectIds = this.db.projects.map(p => p.id);
                    }
                });

                // ── Annuaire partagé (structures + tags) ── UNIQUE listener ──
                onSnapshot(doc(dbFirestore, "shared", "annuaire"), (docSnap) => {
                    if (docSnap.exists()) {
                        const d = docSnap.data();
                        this.db.structures    = d.structures    || [];
                        this.db.tagCategories = d.tagCategories || this.db.tagCategories;
                        this.db.tagGenres     = d.tagGenres     || this.db.tagGenres;
                        this.db.tagReseaux    = d.tagReseaux    || this.db.tagReseaux;
                        this.db.tagKeywords   = d.tagKeywords   || this.db.tagKeywords;
                        if (!d.tagCategories) this.saveDB();
                    } else {
                        const oldLocal = localStorage.getItem('bobBookingDB');
                        if (oldLocal) {
                            try {
                                const oldDb = JSON.parse(oldLocal);
                                if (oldDb.structures && oldDb.structures.length > 0) {
                                    this.db.structures = oldDb.structures;
                                    this.saveDB();
                                }
                            } catch (e) { console.error('Erreur migration annuaire'); }
                        } else {
                            this.db.structures = [];
                        }
                    }
                });

            } else {
                this.currentUser = null;
                this.currentUserName = '';
            }
        });
    },

}).mount('#app');
