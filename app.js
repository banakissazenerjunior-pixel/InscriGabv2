// ==========================================================
// InscriGab - app.js (version bêta, données dans localStorage)
// Un seul fichier pour tout le projet. Chaque page est détectée
// avec getElementById : si l'id existe, on exécute le code de la page.
// ==========================================================

// SOMMAIRE : un bloc de code par page
//   index.html .................... pageIndex()
//   parent.html ................... pageParent()          (étape 1)
//   documents.html ................ pageDocuments()       (étape 2)
//   paiement.html ................. pagePaiement()        (étape 3)
//   recu.html ..................... pageRecu()            (billets)
//   directeur.html ................ pageDirecteur()       (inscription + connexion)
//   dashboard.html ................ pageDashboard()
//   eleves / dossiers / paiements / classes / parametres / fiche-eleve .html
//   dashboardSuperadmin / ecoles / fiche-ecole / abonnements / utilisateurs /
//   sauvegardes / demandes-restauration .html ... partie D (saXxx())

// ================= PARTIE A : OUTILS & DONNÉES =================
// Toutes les pages passent par ces fonctions. Le jour où tu passeras
// à Supabase, tu ne changeras que cette partie.
const CLE_ECOLES = 'inscrigab_ecoles';
const CLE_INS = 'inscrigab_inscriptions';
const CLE_CONN = 'inscrigab_ecole_connectee';
const CLE_SA = 'inscrigab_superadmin';
const CLE_COURANTE = 'inscrigab_inscription_courante';
const CLE_SA_COMPTE = 'inscrigab_superadmin_compte';
const CLE_SAUV = 'inscrigab_sauvegardes';
const CLE_REST = 'inscrigab_restaurations';

const $ = (id) => document.getElementById(id);

function lire(cle) {
  try { return JSON.parse(localStorage.getItem(cle) || '[]'); } catch (e) { return []; }
}
function ecrire(cle, valeur) { localStorage.setItem(cle, JSON.stringify(valeur)); }

const getEcoles = () => lire(CLE_ECOLES);
const getInscriptions = () => lire(CLE_INS);

function saveEcole(ecole) {
  const l = getEcoles();
  const i = l.findIndex((x) => x.id === ecole.id);
  if (i > -1) l[i] = ecole; else l.push(ecole);
  ecrire(CLE_ECOLES, l);
}
function saveInscription(ins) {
  const l = getInscriptions();
  const i = l.findIndex((x) => x.id === ins.id);
  if (i > -1) l[i] = ins; else l.push(ins);
  ecrire(CLE_INS, l);
}

// Retourne l'école connectée (on stocke seulement son id)
// L'inscription que le parent est en train de remplir (sinon la dernière enregistrée)
function inscriptionCourante() {
  const liste = getInscriptions();
  const id = localStorage.getItem(CLE_COURANTE);
  return liste.find((x) => x.id === id) || liste[liste.length - 1] || null;
}
function getEcoleConnectee() {
  let brut = localStorage.getItem(CLE_CONN);
  if (!brut) return null;
  try { const o = JSON.parse(brut); if (o && typeof o === 'object') brut = o.id; } catch (e) { /* c'est déjà un id */ }
  return getEcoles().find((x) => x.id === brut) || null;
}

// Protège contre l'injection de HTML quand on affiche du texte saisi par l'utilisateur
function esc(t) {
  return String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const fcfa = (n) => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';

// Classes proposées automatiquement selon les niveaux cochés par le directeur
const CLASSES_PAR_NIVEAU = {
  maternelle: ['Petite section', 'Moyenne section', 'Grande section'],
  primaire: ['CP1', 'CP2', 'CE1', 'CE2', 'CM1', 'CM2'],
  college: ['6ème', '5ème', '4ème', '3ème'],
  lycee: ['2nde', '1ère', 'Terminale'],
  universite: ['Licence 1', 'Licence 2', 'Licence 3']
};
function classesDepuisNiveaux(niveaux, max) {
  const liste = [];
  (niveaux || []).forEach((n) => (CLASSES_PAR_NIVEAU[n] || []).forEach((nom) => liste.push({ nom: nom, max: max })));
  return liste;
}

// Inscriptions d'une école (accepte aussi les anciennes qui stockaient le nom)
function inscriptionsEcole(ecole) {
  return getInscriptions().filter((i) => i.ecoleId === ecole.id || i.ecoleId === ecole.nomEcole);
}
// Un élève = un enfant d'une inscription
function listeEleves(ecole) {
  const r = [];
  inscriptionsEcole(ecole).forEach((ins) => (ins.enfants || []).forEach((e, idx) => r.push({ ins: ins, e: e, idx: idx })));
  return r;
}
const fraisParEnfant = (ecole) => Number(ecole.fraisInscription || 0) + Number(ecole.fraisDossier || 0);
const lienFiche = (r) => 'fiche-eleve.html?id=' + encodeURIComponent(r.ins.id) + '&i=' + r.idx;

function badgeStatut(s) {
  if (s === 'valide') return '<span class="badge badge-valide">Validé</span>';
  if (s === 'refuse') return '<span class="badge badge-special">Refusé</span>';
  return '<span class="badge badge-attente">En attente</span>';
}
function depuis(iso) {
  if (!iso) return '—';
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return j <= 0 ? "Aujourd'hui" : 'Il y a ' + j + ' jour' + (j > 1 ? 's' : '');
}
// Quel est le problème d'un dossier en attente ?
function problemeDossier(ins) {
  if (!ins.documents || !ins.documents.length) return { txt: 'Document manquant', cle: 'doc', cls: 'badge-attente' };
  if (!ins.paiement) return { txt: 'Paiement incomplet', cle: 'paiement', cls: 'badge-special' };
  if (ins.paiement.statut !== 'paye') return { txt: 'Paiement à vérifier', cle: 'verif', cls: 'badge-attente' };
  return { txt: 'Prêt à valider', cle: 'pret', cls: 'badge-valide' };
}

// Données de démonstration pour tester les tableaux sans tout saisir
function chargerDemo() {
  let ecole = getEcoles().find((x) => x.email === 'demo@inscrigab.ga');
  if (!ecole) {
    ecole = {
      id: 'ecole_demo', nomDirecteur: 'M. Demo', nomEcole: 'Ecole Privée Démo', villeEcole: 'Libreville', typeEcole: 'École Privée', numAutorisation: 'Arrêté N° 0012/MEN', validation: 'auto', plan: 'gratuit',
      niveaux: ['primaire', 'college'], classes: classesDepuisNiveaux(['primaire', 'college'], 30), maxParClasse: 30,
      fraisInscription: 25000, fraisDossier: 5000, montantMensuel: 35000, dateLimite: '',
      docsDemandes: ['acte_naissance', 'photo', 'carnet_sante', 'piece_parent'], telephone: '074000000',
      email: 'demo@inscrigab.ga', motDePasse: '1234', sessionOuverte: true, creeLe: new Date().toISOString()
    };
    saveEcole(ecole);
  }
  chargerDemoSA();
  const jour = 86400000;
  const doc = (nom) => [{ enfant: nom, fichiers: { acte_naissance: 'acte.pdf', photo: 'photo.jpg', carnet_sante: 'carnet.pdf', piece_parent: 'cni.jpg' } }];
  const mk = (n, parent, tel, enf, statut, paiement, docs, age) => ({
    id: 'ins_demo_' + n, parentNom: parent, parentTel: tel, ecoleId: ecole.id, enfants: [enf], eleve: enf,
    anneeScolaire: '2026-2027', statut: statut, documents: docs, paiement: paiement,
    creeLe: new Date(Date.now() - age * jour).toISOString()
  });
  const pay = (statut) => ({ moyen: 'airtel', telephonePaiement: '074000000', nomCompte: 'Parent Demo', codeTransaction: 'TX123', montant: 30000, nbEnfants: 1, statut: statut, payeLe: new Date().toISOString() });
  const demo = [
    mk(1, 'Mme Mba', '074111111', { nom: 'Nze', prenom: 'Léa', naissance: '2018-03-12', sexe: 'Fille', classe: 'CP1' }, 'valide', pay('paye'), doc('Léa Nze'), 5),
    mk(2, 'M. Ondo', '066222222', { nom: 'Ondo', prenom: 'Kevin', naissance: '2015-06-01', sexe: 'Garçon', classe: 'CM1' }, 'en_attente', pay('en_attente_verification'), doc('Kevin Ondo'), 2),
    mk(3, 'Mme Bouka', '077333333', { nom: 'Bouka', prenom: 'Yanis', naissance: '2013-09-20', sexe: 'Garçon', classe: '6ème' }, 'en_attente', null, doc('Yanis Bouka'), 3),
    mk(4, 'M. Mengue', '062444444', { nom: 'Mengue', prenom: 'Sarah', naissance: '2012-01-05', sexe: 'Fille', classe: '5ème' }, 'en_attente', null, null, 1)
  ];
  const existants = getInscriptions();
  demo.forEach((d) => { if (!existants.find((x) => x.id === d.id)) existants.push(d); });
  ecrire(CLE_INS, existants);
}

// ================= PARTIE B : PAGES =================
document.addEventListener('DOMContentLoaded', function () {
  pageIndex();
  pageParent();
  pageDocuments();
  pagePaiement();
  pageRecu();
  pageDirecteur();
  pageSuperAdminLogin();
  pagesSuperAdmin();

  // Pages réservées au directeur : il faut être connecté
  const pagesDirecteur = ['dashboard-ecole', 'page-eleves', 'page-dossiers', 'page-paiements', 'page-classes', 'page-parametres', 'page-fiche-eleve'];
  if (pagesDirecteur.some((id) => $(id))) {
    const ecole = getEcoleConnectee();
    if (!ecole) { window.location.href = 'directeur.html'; return; }
    remplirSidebar(ecole);
    pageDashboard(ecole);
    pageEleves(ecole);
    pageDossiers(ecole);
    pagePaiements(ecole);
    pageClasses(ecole);
    pageParametres(ecole);
    pageFicheEleve(ecole);
  }
});

// ---------- index.html : bouton démo ----------
function pageIndex() {
  const btn = $('btn-demo');
  if (!btn) return;
  btn.addEventListener('click', function () {
    chargerDemo();
    alert('Démo chargée ✅\nDirecteur : demo@inscrigab.ga\nMot de passe : 1234');
  });

}

// ---------- parent.html : ÉTAPE 1 ----------
function optionsEcoles() {
  const ouvertes = getEcoles().filter((e) => e.sessionOuverte && e.validation !== 'refuse');
  if (!ouvertes.length) return '<option value="">Aucune école n\'a ouvert ses inscriptions</option>';
  return ouvertes.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.nomEcole) + ' - ' + esc(e.villeEcole) + '</option>').join('');
}
function optionsClasses(ecoleId) {
  const e = getEcoles().find((x) => x.id === ecoleId);
  if (!e || !e.classes || !e.classes.length) return '<option value="">—</option>';
  return e.classes.map((c) => '<option>' + esc(c.nom) + '</option>').join('');
}

function pageParent() {
  const container = $('liste-enfants');
  const btnAjouter = $('btn-ajouter-enfant');
  const form = $('form-inscription');
  if (!container || !btnAjouter || !form) return;

  let compteur = 0;
  function creerBlocEnfant() {
    compteur++;
    const premier = container.querySelector('.sel-ecole');
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'bloc-enfant';
    fieldset.innerHTML =
      '<legend>Enfant ' + compteur + (compteur > 1 ? ' <button type="button" class="btn-supprimer" style="float:right">Supprimer ✕</button>' : '') + '</legend>' +
      '<label>Nom de l\'enfant</label><br><input type="text" name="nom_eleve" placeholder="Ex : Nze" required><br><br>' +
      '<label>Prénom de l\'enfant</label><br><input type="text" name="prenom_eleve" placeholder="Ex : Léa" required><br><br>' +
      '<label>Date de naissance</label><br><input type="date" name="date_naissance" required><br><br>' +
      '<label>Sexe</label><br><select name="sexe"><option>Fille</option><option>Garçon</option></select><br><br>' +
      '<label>Choisis l\'école</label><br><select name="ecole" class="sel-ecole">' + optionsEcoles() + '</select><br><br>' +
      '<label>Choisis la classe</label><br><select name="classe" class="sel-classe"></select><br><br>';
    container.appendChild(fieldset);

    const selEcole = fieldset.querySelector('.sel-ecole');
    const selClasse = fieldset.querySelector('.sel-classe');
    if (premier) selEcole.value = premier.value; // même école que l'enfant 1
    selClasse.innerHTML = optionsClasses(selEcole.value);
    selEcole.addEventListener('change', function () { selClasse.innerHTML = optionsClasses(selEcole.value); });

    const btnSupp = fieldset.querySelector('.btn-supprimer');
    if (btnSupp) btnSupp.addEventListener('click', function () { fieldset.remove(); });
  }

  creerBlocEnfant();
  btnAjouter.addEventListener('click', creerBlocEnfant);

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
    const parentNom = v('parent_nom');
    const parentTel = v('parent_tel');
    if (!parentNom || parentTel.replace(/\s/g, '').length < 8) { alert('Vérifie le nom et le téléphone'); return; }

    const enfants = [];
    container.querySelectorAll('.bloc-enfant').forEach((bloc) => {
      const get = (name) => bloc.querySelector('[name="' + name + '"]').value.trim();
      const nom = get('nom_eleve');
      const prenom = get('prenom_eleve');
      if (nom && prenom) enfants.push({ nom: nom, prenom: prenom, naissance: get('date_naissance'), sexe: get('sexe'), classe: get('classe'), ecoleId: get('ecole') });
    });
    if (enfants.length === 0) { alert('Ajoute au moins 1 enfant'); return; }

    const ecoleId = enfants[0].ecoleId;
    const ecole = getEcoles().find((x) => x.id === ecoleId);
    if (!ecole) { alert('Aucune école disponible pour le moment'); return; }
    if (enfants.some((x) => x.ecoleId !== ecoleId)) { alert('Tous les enfants doivent être dans la même école. Fais une inscription séparée pour une autre école.'); return; }

    // Vérifie que les classes ne sont pas pleines
    const occupes = {};
    listeEleves(ecole).forEach((r) => { if (r.ins.statut !== 'refuse') occupes[r.e.classe] = (occupes[r.e.classe] || 0) + 1; });
    for (const enf of enfants) {
      const c = (ecole.classes || []).find((x) => x.nom === enf.classe);
      occupes[enf.classe] = (occupes[enf.classe] || 0) + 1;
      if (c && occupes[enf.classe] > c.max) { alert('La classe ' + enf.classe + ' est pleine.'); return; }
    }

    const nouvelId = 'ins_' + Date.now();
    localStorage.setItem(CLE_COURANTE, nouvelId);
    saveInscription({
      id: nouvelId, parentNom: parentNom, parentTel: parentTel, ecoleId: ecoleId,
      eleve: enfants[0], enfants: enfants, anneeScolaire: v('annee_scolaire'), statut: 'en_attente', creeLe: new Date().toISOString()
    });
    window.location.href = 'documents.html';
  });
}

// ---------- documents.html : ÉTAPE 2 ----------
const DOCS = [
  ['acte_naissance', 'Acte de naissance'], ['photo', "Photo d'identité de l'enfant"], ['carnet_sante', 'Carnet de santé / vaccination'],
  ['bulletin', "Bulletin de l'année précédente"], ['piece_parent', "Pièce d'identité du parent"]
];

function pageDocuments() {
  const formDocs = $('form-documents');
  if (!formDocs) return;
  const derniere = inscriptionCourante();
  const info = $('info-enfant');
  const zone = $('liste-documents');

  if (!derniere) {
    if (info) info.textContent = "Aucune inscription trouvée. Retourne sur parent.html et remplis le formulaire d'abord.";
    return;
  }
  const ecole = getEcoles().find((x) => x.id === derniere.ecoleId);
  const obligatoires = (ecole && ecole.docsDemandes) || ['acte_naissance', 'photo', 'carnet_sante', 'piece_parent'];
  const enfants = derniere.enfants && derniere.enfants.length ? derniere.enfants : [derniere.eleve];

  if ($('nom-ecole-docs')) $('nom-ecole-docs').textContent = ecole ? ecole.nomEcole + ' - ' + ecole.villeEcole : '—';
  if (info) info.textContent = 'Pour : ' + enfants.map((e) => e.prenom + ' ' + e.nom).join(', ') + ' (' + enfants.length + ' enfant(s)) - Parent : ' + derniere.parentNom;

  if (zone) {
    zone.innerHTML = '';
    enfants.forEach(function (enfant, i) {
      const fs = document.createElement('fieldset');
      let html = '<legend>Documents pour Enfant ' + (i + 1) + ' : ' + esc(enfant.prenom + ' ' + enfant.nom) + ' - ' + esc(enfant.classe) + '</legend>';
      DOCS.forEach(function (d, k) {
        const req = obligatoires.includes(d[0]);
        html += '<label>' + (k + 1) + '. ' + d[1] + (req ? ' *' : ' (facultatif)') + '</label><br>' +
          '<input type="file" name="' + d[0] + '_' + (i + 1) + '" accept="' + (d[0] === 'photo' ? 'image/*' : 'image/*,.pdf') + '"' + (req ? ' required' : '') + '><br><br>';
      });
      fs.innerHTML = html;
      zone.appendChild(fs);
    });
  }

  const btnRetour = $('btn-retour');
  if (btnRetour) btnRetour.addEventListener('click', function () { window.location.href = 'parent.html'; });

  formDocs.addEventListener('submit', function (e) {
    e.preventDefault();
    const certifie = $('certifie');
    if (certifie && !certifie.checked) { alert('Coche la case de confirmation'); return; }

    // On garde seulement le NOM des fichiers (le vrai stockage viendra avec Supabase)
    const documents = enfants.map(function (enfant, i) {
      const fichiers = {};
      DOCS.forEach(function (d) {
        const champ = formDocs.elements[d[0] + '_' + (i + 1)];
        fichiers[d[0]] = champ && champ.files[0] ? champ.files[0].name : '';
      });
      return { enfant: enfant.prenom + ' ' + enfant.nom, fichiers: fichiers };
    });
    for (const doc of documents) {
      if (obligatoires.some((k) => !doc.fichiers[k])) { alert('Il manque des documents obligatoires pour ' + doc.enfant + '. Vérifie les *'); return; }
    }
    derniere.documents = documents;
    derniere.documentsEnvoyeLe = new Date().toISOString();
    saveInscription(derniere);
    const msg = $('message-docs');
    if (msg) msg.textContent = 'Documents enregistrés !';
    window.location.href = 'paiement.html';
  });
}

// ---------- paiement.html : ÉTAPE 3 ----------
function pagePaiement() {
  const formPaiement = $('form-paiement');
  if (!formPaiement) return;
  const derniere = inscriptionCourante();
  if (!derniere) {
    if ($('recap-parent')) $('recap-parent').textContent = 'Aucune inscription trouvée. Retourne sur parent.html.';
    return;
  }
  const ecole = getEcoles().find((x) => x.id === derniere.ecoleId) || {};
  const enfants = derniere.enfants && derniere.enfants.length ? derniere.enfants : [derniere.eleve];
  const nb = enfants.length;
  const pInsc = Number(ecole.fraisInscription || 25000);
  const pDossier = Number(ecole.fraisDossier || 5000);
  const total = (pInsc + pDossier) * nb;
  const set = (id, txt) => { if ($(id)) $(id).textContent = txt; };

  set('recap-parent', 'Parent : ' + derniere.parentNom + ' (' + derniere.parentTel + ')');
  if ($('recap-enfants')) $('recap-enfants').innerHTML = enfants.map((e, i) => '<b>Enfant ' + (i + 1) + ' :</b> ' + esc(e.prenom + ' ' + e.nom) + ' - ' + esc(e.classe)).join('<br>');
  set('recap-ecole', 'École : ' + (ecole.nomEcole || '-'));
  set('recap-annee', 'Année scolaire : ' + (derniere.anneeScolaire || '-'));
  set('recap-documents', 'Documents : ' + (derniere.documents ? derniere.documents.length + ' dossier(s) envoyé(s)' : 'Non envoyés'));
  set('recap-frais', "Frais d'inscription : " + fcfa(pInsc * nb) + ' (' + nb + ' x ' + pInsc.toLocaleString('fr-FR') + ')');
  set('recap-dossier', 'Frais de dossier : ' + fcfa(pDossier * nb) + ' (' + nb + ' x ' + pDossier.toLocaleString('fr-FR') + ')');
  set('recap-total', 'Total à payer : ' + fcfa(total));
  set('btn-payer', 'Payer ' + fcfa(total));

  const btnRetour = $('btn-retour-paiement');
  if (btnRetour) btnRetour.addEventListener('click', function () { window.location.href = 'documents.html'; });

  formPaiement.addEventListener('submit', function (e) {
    e.preventDefault();
    const moyen = formPaiement.elements['moyen_paiement'].value;
    const tel = formPaiement.elements['telephone_paiement'].value.trim();
    const nomCompte = formPaiement.elements['nom_compte'].value.trim();
    const code = formPaiement.elements['code_transaction'].value.trim();
    if ($('accepte') && !$('accepte').checked) { alert('Coche la case de confirmation'); return; }
    const mobileMoney = ['airtel_money', 'moov_money', 'orange_money'].includes(moyen);
    if (mobileMoney && tel.length < 8) { alert('Mets le numéro qui va payer'); return; }
    if (mobileMoney && !nomCompte) { alert('Mets le nom sur le compte Mobile Money'); return; }

    // statut du paiement : le directeur le passera à "paye" après vérification
    derniere.paiement = {
      moyen: moyen, telephonePaiement: tel, nomCompte: nomCompte, codeTransaction: code, montant: total, nbEnfants: nb,
      statut: moyen === 'especes' ? 'en_attente_especes' : 'en_attente_verification', payeLe: new Date().toISOString()
    };
    saveInscription(derniere);
    alert('Paiement enregistré ✅\n\nMontant : ' + fcfa(total) + '\nL\'école va vérifier ton paiement puis valider ton dossier.');
    window.location.href = 'recu.html';
  });
}

// ---------- Recu.html : billets du parent ----------
function pageRecu() {
  const zone = $('page-recu');
  if (!zone) return;
  const ins = inscriptionCourante();
  if (!ins) { zone.innerHTML = '<p>Aucune inscription trouvée.</p><a href="parent.html">Faire une inscription</a>'; return; }
  const ecole = getEcoles().find((x) => x.id === ins.ecoleId) || {};

  if (ins.statut === 'refuse') { zone.innerHTML = '<h1>Dossier refusé</h1><p>L\'école a refusé ce dossier. Contacte-la pour plus d\'informations.</p>'; return; }
  if (ins.statut !== 'valide') {
    zone.innerHTML = '<h1>Dossier en cours ⏳</h1><p>Ton dossier est en attente de validation par l\'école. Reviens sur cette page plus tard.</p><br><a href="index.html">Retour à l\'accueil</a>';
    return;
  }
  const billets = ins.enfants.map(function (enf, i) {
    const num = 'BILLET-' + enf.classe.replace(/\s/g, '').toUpperCase() + '-' + ins.id.slice(-5) + '-' + (i + 1);
    return '<fieldset><legend>BILLET N° ' + (i + 1) + " - BILLET D'ENTRÉE</legend>" +
      '<p><b>École :</b> ' + esc(ecole.nomEcole) + ' - ' + esc(ecole.villeEcole) + '</p>' +
      '<p><b>Année scolaire :</b> ' + esc(ins.anneeScolaire) + '</p><br>' +
      '<p><b>Élève :</b> ' + esc(enf.prenom + ' ' + enf.nom) + '</p><p><b>Classe :</b> ' + esc(enf.classe) + '</p>' +
      '<p><b>Parent :</b> ' + esc(ins.parentNom) + ' - ' + esc(ins.parentTel) + '</p><br>' +
      '<p><b>Statut :</b> ADMIS - Peut entrer en classe</p>' +
      '<p><b>Validé le :</b> ' + new Date(ins.valideLe || Date.now()).toLocaleDateString('fr-FR') + '</p>' +
      '<p><b>N° Billet :</b> ' + esc(num) + '</p></fieldset><br>';
  });
  zone.innerHTML = '<h1>Billet d\'entrée</h1><p>✅ Ton inscription a été validée par l\'école.</p><p>Présente ce billet le jour de la rentrée. Un billet = Un élève.</p><br>' +
    billets.join('') + '<button type="button" onclick="window.print()">Imprimer / enregistrer en PDF</button><br><br><a href="index.html">Retour à l\'accueil</a>';
}

// ---------- directeur.html : inscription + connexion ----------
function pageDirecteur() {
  const formInsc = $('form-inscription-ecole');
  const formConn = $('form-connexion');

  if (formInsc) {
    formInsc.addEventListener('submit', function (e) {
      e.preventDefault();
      const v = (n) => (formInsc.elements[n] ? formInsc.elements[n].value.trim() : '');
      const mdp = v('mot_de_passe_inscription');
      if (mdp !== v('confirmer_mot_de_passe')) { alert('Les 2 mots de passe ne sont pas les mêmes'); return; }
      if (mdp.length < 4) { alert('Mot de passe trop court, 4 caractères min'); return; }
      const email = v('email_inscription').toLowerCase();
      if (getEcoles().find((x) => x.email === email)) { alert('Cet email existe déjà, connecte-toi'); return; }

      const niveaux = Array.from(formInsc.querySelectorAll('input[name="niveau"]:checked')).map((c) => c.value);
      if (!niveaux.length) { alert('Coche au moins un niveau'); return; }
      const docs = Array.from(formInsc.querySelectorAll('input[name="doc_demande"]:checked')).map((c) => c.value);
      const max = parseInt(v('nombre_max_eleves') || '30', 10);

      const ecole = {
        id: 'ecole_' + Date.now(), nomDirecteur: v('nom_directeur'), nomEcole: v('nom_ecole'), villeEcole: v('ville_ecole'),
        typeEcole: v('type_ecole'), numAutorisation: v('numero_autorisation'), validation: v('numero_autorisation') ? 'auto' : 'a_verifier', plan: 'gratuit', niveaux: niveaux, maxParClasse: max, classes: classesDepuisNiveaux(niveaux, max),
        fraisInscription: parseInt(v('frais_inscription') || '25000', 10), fraisDossier: parseInt(v('frais_dossier') || '5000', 10),
        montantMensuel: parseInt(v('montant_mensuel') || '35000', 10), dateLimite: v('date_limite_paiement'), docsDemandes: docs,
        telephone: v('telephone_directeur'), email: email, motDePasse: mdp, sessionOuverte: false, creeLe: new Date().toISOString()
      };
      saveEcole(ecole);
      localStorage.setItem(CLE_CONN, ecole.id);
      if ($('message-directeur')) $('message-directeur').textContent = "Compte créé ! Direction le Dashboard, tout est à 0 pour l'instant.";
      setTimeout(function () { window.location.href = 'dashboard.html'; }, 800);
    });
  }

  if (formConn) {
    formConn.addEventListener('submit', function (e) {
      e.preventDefault();
      const email = formConn.elements['email_connexion'].value.trim().toLowerCase();
      const mdp = formConn.elements['mot_de_passe_connexion'].value;
      const trouvee = getEcoles().find((x) => x.email === email && x.motDePasse === mdp);
      if (!trouvee) { alert('Email ou mot de passe faux'); return; }
      localStorage.setItem(CLE_CONN, trouvee.id);
      window.location.href = 'dashboard.html';
    });
  }
}

// ================= PARTIE C : PAGES DIRECTEUR =================
// Menu de gauche : nom de l'école et du directeur au lieu du texte écrit en dur
function remplirSidebar(ecole) {
  const nom = document.querySelector('.sidebar .ecole-nom');
  if (nom) nom.innerHTML = esc(ecole.nomEcole) + '<br><small>Directeur</small>';
  const pied = document.querySelector('.sidebar p small');
  if (pied) pied.textContent = (ecole.nomDirecteur || '') + ' - Directeur';
  // Remplace "Lycée Léon Mba" dans les titres
  const h1 = document.querySelector('main h1');
  if (h1 && h1.textContent.includes('Lycée Léon Mba')) h1.textContent = h1.textContent.replace('Lycée Léon Mba', ecole.nomEcole);
}

// ---------- dashboard.html ----------
function pageDashboard(ecole) {
  if (!$('dashboard-ecole')) return;
  const set = (id, txt) => { if ($(id)) $(id).textContent = txt; };
  set('nom-ecole-menu', ecole.nomEcole || 'Mon école');
  set('nom-ecole-tableau', ecole.nomEcole || 'Mon école');
  set('nom-directeur-menu', ecole.nomDirecteur || 'Directeur');
  set('bonjour-directeur', 'Bonjour ' + (ecole.nomDirecteur || ''));
  set('info-ecole', (ecole.nomEcole || '') + ' - ' + (ecole.villeEcole || ''));
  set('statut-session', 'Session : ' + (ecole.sessionOuverte ? 'OUVERTE ✅' : 'FERMÉE 🔒'));
  set('btn-session', ecole.sessionOuverte ? "Fermer la session d'inscription" : "Ouvrir la session d'inscription");

  const inscriptions = inscriptionsEcole(ecole);
  const auj = new Date().toISOString().slice(0, 10);
  let recettes = 0, nbPaiements = 0, aujourdhui = 0, nbEleves = 0;
  inscriptions.forEach((i) => {
    nbEleves += (i.enfants || []).length;
    if (i.paiement && i.paiement.statut === 'paye' && (i.paiement.payeLe || '').slice(0, 10) === auj) { recettes += Number(i.paiement.montant || 0); nbPaiements++; }
    if ((i.creeLe || '').slice(0, 10) === auj) aujourdhui++;
  });
  set('total-inscrits', nbEleves);
  set('dossiers-attente', inscriptions.filter((i) => i.statut === 'en_attente').length);
  set('recettes', fcfa(recettes));
  set('inscrits-aujourdhui', '+ ' + aujourdhui + " aujourd'hui");
  set('nb-paiements', '+ ' + nbPaiements + ' paiements');

  const corps = $('corps-tableau');
  if (corps) {
    corps.innerHTML = '';
    const derniers = listeEleves(ecole).slice(-10).reverse();
    if ($('message-vide')) $('message-vide').style.display = derniers.length === 0 ? 'block' : 'none';
    derniers.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(r.e.nom) + '</td><td>' + esc(r.e.prenom) + '</td><td>' + esc(r.e.classe) + '</td><td>' + badgeStatut(r.ins.statut) + '</td><td><a href="' + lienFiche(r) + '">Voir →</a></td>';
      corps.appendChild(tr);
    });
  }

  if ($('btn-session')) $('btn-session').addEventListener('click', function () {
    ecole.sessionOuverte = !ecole.sessionOuverte;
    saveEcole(ecole);
    window.location.reload();
  });
  if ($('btn-effacer-tests')) $('btn-effacer-tests').addEventListener('click', function () {
    const n = inscriptionsEcole(ecole).length;
    if (n === 0) { alert('Il n\'y a aucune inscription à supprimer.'); return; }
    const rep = prompt('Tu vas supprimer ' + n + ' inscription(s) de ton école. C\'est définitif.\nTape SUPPRIMER pour confirmer :');
    if (rep === null || rep.trim().toUpperCase() !== 'SUPPRIMER') { alert('Suppression annulée.'); return; }
    ecrire(CLE_INS, getInscriptions().filter((i) => i.ecoleId !== ecole.id && i.ecoleId !== ecole.nomEcole));
    window.location.reload();
  });
  if ($('btn-deconnexion')) $('btn-deconnexion').addEventListener('click', function () {
    localStorage.removeItem(CLE_CONN);
    window.location.href = 'directeur.html';
  });
}

// Petit outil : vide un tableau sauf sa ligne d'en-tête
function viderTableau(table) {
  Array.from(table.rows).slice(1).forEach((r) => r.remove());
  return table.tBodies[0] || table;
}

// ---------- eleves.html ----------
function pageEleves(ecole) {
  const main = $('page-eleves');
  if (!main) return;
  const rows = listeEleves(ecole);
  const recherche = main.querySelector('.card input[type=text]');
  const selects = main.querySelectorAll('.card select');
  const selClasse = selects[0], selStatut = selects[1];
  selClasse.innerHTML = '<option value="">Toutes les classes</option>' + (ecole.classes || []).map((c) => '<option>' + esc(c.nom) + '</option>').join('');
  selStatut.innerHTML = '<option value="">Tous les statuts</option><option value="valide">Validé</option><option value="en_attente">En attente</option><option value="refuse">Refusé</option>';
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');

  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((r) =>
      (!selClasse.value || r.e.classe === selClasse.value) &&
      (!selStatut.value || r.ins.statut === selStatut.value) &&
      (!q || (r.e.nom + ' ' + r.e.prenom + ' ' + r.e.classe).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(r.e.nom.toUpperCase()) + '</b></td><td>' + esc(r.e.prenom) + '</td><td>' + esc(r.e.classe) + '</td><td>' + badgeStatut(r.ins.statut) + '</td><td><a href="' + lienFiche(r) + '">Voir →</a></td>';
      corps.appendChild(tr);
    });
    if (!filtres.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucun élève trouvé.</td></tr>');
    if (compteur) compteur.textContent = filtres.length + ' élève(s) affiché(s) sur ' + rows.length;
  }
  [recherche, selClasse, selStatut].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- dossiers.html ----------
function pageDossiers(ecole) {
  const main = $('page-dossiers');
  if (!main) return;
  const rows = listeEleves(ecole).filter((r) => r.ins.statut === 'en_attente');
  const sel = main.querySelector('.card select');
  const recherche = main.querySelector('.card input[type=text]');
  sel.innerHTML = '<option value="">Tous les dossiers</option><option value="doc">Document manquant</option><option value="paiement">Paiement incomplet</option><option value="verif">Paiement à vérifier</option><option value="pret">Prêt à valider</option>';
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');

  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((r) => (!sel.value || problemeDossier(r.ins).cle === sel.value) && (!q || (r.e.nom + ' ' + r.e.prenom + ' ' + r.e.classe).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((r) => {
      const p = problemeDossier(r.ins);
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(r.e.nom.toUpperCase() + ' ' + r.e.prenom) + '</b></td><td>' + esc(r.e.classe) + '</td><td><span class="badge ' + p.cls + '">' + p.txt + '</span></td><td>' + depuis(r.ins.creeLe) + '</td><td><a href="' + lienFiche(r) + '">Traiter →</a></td>';
      corps.appendChild(tr);
    });
    if (!filtres.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucun dossier à traiter 🎉</td></tr>');
    if (compteur) compteur.textContent = rows.length + ' dossier(s) en attente';
  }
  [recherche, sel].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- paiements.html ----------
function pagePaiements(ecole) {
  const main = $('page-paiements');
  if (!main) return;
  const frais = fraisParEnfant(ecole);
  const rows = listeEleves(ecole).filter((r) => r.ins.statut !== 'refuse').map((r) => {
    const p = r.ins.paiement;
    const paye = p && p.statut === 'paye' ? frais : 0;
    const etat = paye >= frais && frais > 0 ? 'paye' : (p ? 'verif' : 'rien');
    return { r: r, paye: paye, reste: Math.max(frais - paye, 0), etat: etat };
  });
  const recu = rows.reduce((s, x) => s + x.paye, 0);
  const aRecevoir = rows.reduce((s, x) => s + x.reste, 0);
  const complets = rows.filter((x) => x.etat === 'paye').length;
  const cartes = main.querySelectorAll('.chiffre h2');
  if (cartes.length >= 3) { cartes[0].textContent = fcfa(recu); cartes[1].textContent = fcfa(aRecevoir); cartes[2].textContent = complets + ' / ' + rows.length; }

  const sel = main.querySelector('.card select');
  const recherche = main.querySelector('.card input[type=text]');
  sel.innerHTML = '<option value="">Tous les paiements</option><option value="paye">Payé complet</option><option value="verif">À vérifier</option><option value="rien">Rien payé</option>';
  const table = main.querySelector('table');
  const etiquettes = { paye: '<span class="badge badge-valide">Payé</span>', verif: '<span class="badge badge-attente">À vérifier</span>', rien: '<span class="badge badge-special">Rien payé</span>' };

  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((x) => (!sel.value || x.etat === sel.value) && (!q || (x.r.e.nom + ' ' + x.r.e.prenom).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((x) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(x.r.e.nom.toUpperCase() + ' ' + x.r.e.prenom) + '</b></td><td>' + esc(x.r.e.classe) + '</td><td>' + frais.toLocaleString('fr-FR') + '</td><td>' + x.paye.toLocaleString('fr-FR') + '</td><td>' + x.reste.toLocaleString('fr-FR') + '</td><td>' + etiquettes[x.etat] + '</td>';
      corps.appendChild(tr);
    });
    if (!filtres.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="6">Aucun paiement.</td></tr>');
  }
  [recherche, sel].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- classes.html ----------
function pageClasses(ecole) {
  const main = $('page-classes');
  if (!main) return;
  ecole.classes = ecole.classes || classesDepuisNiveaux(ecole.niveaux, ecole.maxParClasse || 30);
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');

  function afficher() {
    const eleves = listeEleves(ecole).filter((r) => r.ins.statut !== 'refuse');
    const corps = viderTableau(table);
    ecole.classes.forEach((c) => {
      const n = eleves.filter((r) => r.e.classe === c.nom).length;
      const reste = Math.max(c.max - n, 0);
      const badge = reste === 0 ? '<span class="badge badge-special">Pleine</span>' : (reste <= 3 ? '<span class="badge badge-attente">Presque pleine</span>' : '<span class="badge badge-valide">Ouverte</span>');
      const tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + esc(c.nom) + '</b></td><td>' + n + '</td><td>' + c.max + '</td><td>' + reste + '</td><td>' + badge + '</td><td><a href="eleves.html">Voir élèves →</a></td>';
      corps.appendChild(tr);
    });
    if (compteur) compteur.textContent = ecole.classes.length + ' classes - ' + eleves.length + ' élèves';
  }
  afficher();

  const inputs = main.querySelectorAll('.card input');
  const bouton = main.querySelector('.card button');
  if (bouton) bouton.addEventListener('click', function () {
    const nom = inputs[0].value.trim();
    const max = parseInt(inputs[1].value, 10);
    if (!nom || !max || max < 1) { alert('Mets un nom et un nombre de places'); return; }
    if (ecole.classes.find((c) => c.nom.toLowerCase() === nom.toLowerCase())) { alert('Cette classe existe déjà'); return; }
    ecole.classes.push({ nom: nom, max: max });
    saveEcole(ecole);
    inputs[0].value = ''; inputs[1].value = '';
    afficher();
  });
}

// ---------- parametres.html ----------
function pageParametres(ecole) {
  const main = $('page-parametres');
  if (!main) return;
  const coche = (k) => ((ecole.docsDemandes || []).includes(k) ? ' checked' : '');
  main.innerHTML =
    '<h1>Paramètres de l\'école</h1><p>Seul le Directeur peut changer ça.</p>' +
    '<form id="form-parametres">' +
    '<div class="card"><h2 style="text-align:left;">1. Mon école</h2>' +
    '<label>Nom de l\'école</label><input type="text" name="nomEcole" value="' + esc(ecole.nomEcole) + '" required>' +
    '<label>Ville</label><input type="text" name="villeEcole" value="' + esc(ecole.villeEcole) + '"></div>' +
    '<div class="card"><h2 style="text-align:left;">2. Frais</h2>' +
    '<label>Frais d\'inscription (FCFA)</label><input type="number" name="fraisInscription" value="' + Number(ecole.fraisInscription || 0) + '">' +
    '<label>Frais de dossier (FCFA)</label><input type="number" name="fraisDossier" value="' + Number(ecole.fraisDossier || 0) + '">' +
    '<label>Montant mensuel (FCFA)</label><input type="number" name="montantMensuel" value="' + Number(ecole.montantMensuel || 0) + '"></div>' +
    '<div class="card"><h2 style="text-align:left;">3. Documents obligatoires</h2><p style="text-align:left;">' +
    DOCS.map((d) => '<input type="checkbox" name="doc" value="' + d[0] + '"' + coche(d[0]) + '> ' + d[1] + '<br>').join('') + '</p></div>' +
    '<div class="card"><h2 style="text-align:left;">4. Mon compte Directeur</h2>' +
    '<label>Nom</label><input type="text" name="nomDirecteur" value="' + esc(ecole.nomDirecteur) + '">' +
    '<label>Nouveau mot de passe (laisse vide pour garder l\'ancien)</label><input type="password" name="mdp" autocomplete="new-password">' +
    '<button class="vert" type="submit" style="margin-top:10px;">Enregistrer mes changements</button>' +
    '<p id="message-parametres"></p></div></form>';
  blocRestauration(ecole, main);

  $('form-parametres').addEventListener('submit', function (e) {
    e.preventDefault();
    const f = e.target.elements;
    ecole.nomEcole = f['nomEcole'].value.trim();
    ecole.villeEcole = f['villeEcole'].value.trim();
    ecole.fraisInscription = parseInt(f['fraisInscription'].value || '0', 10);
    ecole.fraisDossier = parseInt(f['fraisDossier'].value || '0', 10);
    ecole.montantMensuel = parseInt(f['montantMensuel'].value || '0', 10);
    ecole.docsDemandes = Array.from(e.target.querySelectorAll('input[name="doc"]:checked')).map((c) => c.value);
    ecole.nomDirecteur = f['nomDirecteur'].value.trim();
    if (f['mdp'].value) {
      if (f['mdp'].value.length < 4) { alert('Mot de passe trop court, 4 caractères min'); return; }
      ecole.motDePasse = f['mdp'].value;
    }
    saveEcole(ecole);
    $('message-parametres').textContent = 'Changements enregistrés ✅';
    remplirSidebar(ecole);
  });
}

// ---------- fiche-eleve.html?id=...&i=... ----------
function pageFicheEleve(ecole) {
  const main = $('page-fiche-eleve');
  if (!main) return;
  const params = new URLSearchParams(window.location.search);
  const ins = getInscriptions().find((x) => x.id === params.get('id'));
  const idx = parseInt(params.get('i') || '0', 10);
  const enf = ins && ins.enfants ? ins.enfants[idx] : null;
  if (!ins || !enf) { main.innerHTML = '<p><a href="eleves.html">← Retour aux élèves</a></p><h1>Élève introuvable</h1>'; return; }

  const docs = (ins.documents && ins.documents[idx]) ? ins.documents[idx].fichiers : null;
  const lignesDocs = DOCS.map((d) => {
    const nom = docs && docs[d[0]];
    const obligatoire = (ecole.docsDemandes || []).includes(d[0]);
    const badge = nom ? '<span class="badge badge-valide">Reçu</span>' : (obligatoire ? '<span class="badge badge-attente">Manquant</span>' : '<span class="badge">Non demandé</span>');
    return '<tr><td>' + d[1] + '</td><td>' + badge + '</td><td>' + esc(nom || '') + '</td></tr>';
  }).join('');
  const p = ins.paiement;
  const frais = fraisParEnfant(ecole);
  const textePaiement = !p ? 'Aucun paiement enregistré' : (p.statut === 'paye' ? 'Payé ✅' : 'À vérifier ⏳') + ' - ' + fcfa(p.montant) + ' (' + esc(p.moyen) + (p.codeTransaction ? ', code ' + esc(p.codeTransaction) : '') + ')';

  main.innerHTML =
    '<p><a href="eleves.html">← Retour aux élèves</a></p>' +
    '<h1>' + esc(enf.nom.toUpperCase() + ' ' + enf.prenom) + '</h1>' +
    '<p>' + esc(enf.classe) + ' - ' + esc(ecole.nomEcole) + ' - ' + badgeStatut(ins.statut) + '</p>' +
    '<div class="card"><h2 style="text-align:left;">Infos Élève</h2><p style="text-align:left;"><b>Nom :</b> ' + esc(enf.nom) + '<br><b>Prénom :</b> ' + esc(enf.prenom) +
    '<br><b>Date de naissance :</b> ' + esc(enf.naissance) + '<br><b>Classe demandée :</b> ' + esc(enf.classe) + '<br><b>Genre :</b> ' + esc(enf.sexe) + '</p></div>' +
    '<div class="card"><h2 style="text-align:left;">Parent / Tuteur</h2><p style="text-align:left;"><b>Nom :</b> ' + esc(ins.parentNom) + '<br><b>Téléphone :</b> ' + esc(ins.parentTel) + '</p>' +
    '<a href="tel:' + esc(ins.parentTel) + '"><button type="button" style="margin-top:10px;">Appeler le parent</button></a></div>' +
    '<div class="card"><h2 style="text-align:left;">Documents</h2><table><tr><th>DOCUMENT</th><th>STATUT</th><th>FICHIER</th></tr>' + lignesDocs + '</table></div>' +
    '<div class="card"><h2 style="text-align:left;">Paiement</h2><p style="text-align:left;">À payer : ' + fcfa(frais) + '<br>' + textePaiement + '</p>' +
    (p && p.statut !== 'paye' ? '<button type="button" id="btn-paiement-recu" class="vert">Marquer le paiement comme reçu</button>' : '') + '</div>' +
    '<div class="card"><h2 style="text-align:left;">Décision</h2>' +
    '<button type="button" id="btn-valider" class="vert">Valider le dossier</button> ' +
    '<button type="button" id="btn-refuser" style="background:#ff4444;color:white;">Refuser</button></div>';

  const maj = (fn) => { fn(); saveInscription(ins); window.location.reload(); };
  if ($('btn-paiement-recu')) $('btn-paiement-recu').addEventListener('click', () => maj(() => { ins.paiement.statut = 'paye'; }));
  $('btn-valider').addEventListener('click', function () {
    if ((!ins.paiement || ins.paiement.statut !== 'paye') && !confirm("Le paiement n'est pas confirmé. Valider quand même ?")) return;
    maj(() => { ins.statut = 'valide'; ins.valideLe = new Date().toISOString(); });
  });
  $('btn-refuser').addEventListener('click', function () {
    if (confirm('Refuser ce dossier ?')) maj(() => { ins.statut = 'refuse'; });
  });
}

// ================= PARTIE D : SUPER ADMIN =================
// ⚠️ Bêta : le compte Super Admin est enregistré dans le navigateur (localStorage).
// Ce n'est PAS une vraie sécurité : elle viendra avec Supabase Auth.
const estSuperAdmin = () => localStorage.getItem(CLE_SA) === '1';
const getSauvegardes = () => lire(CLE_SAUV);
const getRestaurations = () => lire(CLE_REST);
const dateFr = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const tailleLisible = (o) => (o < 1024 ? o + ' o' : (o / 1024).toFixed(1) + ' Ko');
const ecoleParId = (id) => getEcoles().find((x) => x.id === id);
const lienEcole = (e, txt) => '<a href="fiche-ecole.html?id=' + encodeURIComponent(e.id) + '">' + txt + '</a>';

function badgeValidation(e) {
  if (e.validation === 'refuse') return '<span class="badge badge-special">Refusée</span>';
  if (e.validation === 'a_verifier') return '<span class="badge badge-special">Cas spécial</span>';
  if (e.validation === 'valide') return '<span class="badge badge-valide">Validée</span>';
  return '<span class="badge badge-valide">Auto Validé</span>';
}
function sauvegarderEcole(ecole) {
  const donnees = inscriptionsEcole(ecole);
  const s = { id: 'sauv_' + Date.now(), ecoleId: ecole.id, creeLe: new Date().toISOString(), taille: JSON.stringify(donnees).length, donnees: donnees };
  ecrire(CLE_SAUV, getSauvegardes().concat([s]));
  return s;
}
// Écoles de démonstration supplémentaires pour tester le Super Admin
function chargerDemoSA() {
  const base = { niveaux: ['college'], classes: classesDepuisNiveaux(['college'], 30), maxParClasse: 30, fraisInscription: 25000, fraisDossier: 5000, montantMensuel: 35000, docsDemandes: ['acte_naissance'], sessionOuverte: false, plan: 'gratuit', creeLe: new Date().toISOString() };
  [
    { id: 'ecole_demo_palmiers', nomEcole: 'École Les Palmiers', villeEcole: 'Libreville', typeEcole: 'École Privée', nomDirecteur: 'M. Ondo', email: 'ondo@demo.ga', motDePasse: '1234', telephone: '077000000', numAutorisation: 'Décret N° 99999', validation: 'a_verifier' },
    { id: 'ecole_demo_stemarie', nomEcole: 'Collège Sainte Marie', villeEcole: 'Port-Gentil', typeEcole: 'École Confessionnelle / Catholique', nomDirecteur: 'Mme Mbeng', email: 'mbeng@demo.ga', motDePasse: '1234', telephone: '062000000', numAutorisation: '', validation: 'a_verifier' }
  ].forEach((e) => { if (!ecoleParId(e.id)) saveEcole(Object.assign({}, base, e)); });
}

function pagesSuperAdmin() {
  const ids = ['page-sa-dashboard', 'page-sa-ecoles', 'page-sa-fiche-ecole', 'page-sa-abonnements', 'page-sa-utilisateurs', 'page-sa-sauvegardes', 'page-sa-restaurations'];
  if (!ids.some((id) => $(id))) return;
  if (!estSuperAdmin()) { window.location.href = 'superadmin.html'; return; }
  const menu = document.querySelector('.sidebar');
  if (menu) {
    const bt = document.createElement('button');
    bt.type = 'button'; bt.id = 'btn-deconnexion-sa'; bt.textContent = 'Se déconnecter';
    bt.addEventListener('click', function () { localStorage.removeItem(CLE_SA); window.location.href = 'superadmin.html'; });
    menu.appendChild(bt);
  }
  saDashboard(); saEcoles(); saFicheEcole(); saAbonnements(); saUtilisateurs(); saSauvegardes(); saRestaurations();
}

// ---------- dashboardSuperadmin.html ----------
function saDashboard() {
  const main = $('page-sa-dashboard');
  if (!main) return;
  const ecoles = getEcoles();
  const aVerif = ecoles.filter((e) => e.validation === 'a_verifier');
  const ok = ecoles.filter((e) => e.validation !== 'a_verifier' && e.validation !== 'refuse');
  const ins = getInscriptions();
  const moisCourant = new Date().toISOString().slice(0, 7);
  const nbEleves = ins.reduce((s, i) => s + (i.enfants || []).length, 0);
  const ceMois = ins.filter((i) => (i.creeLe || '').slice(0, 7) === moisCourant).reduce((s, i) => s + (i.enfants || []).length, 0);
  const attente = getRestaurations().filter((r) => r.statut === 'en_attente').length;
  const kpis = main.querySelectorAll('.kpi');
  const setKpi = (k, val, sub) => { if (!k) return; k.querySelector('b').textContent = val; const sm = k.querySelectorAll('small'); if (sub != null) sm[sm.length - 1].textContent = sub; };
  setKpi(kpis[0], ecoles.length, ok.length + ' validées + ' + aVerif.length + ' à vérifier');
  setKpi(kpis[1], aVerif.length, null);
  setKpi(kpis[2], nbEleves, '+ ' + ceMois + ' ce mois');
  setKpi(kpis[3], attente, null);
  const date = main.querySelector('h1 + p');
  if (date) date.textContent = 'Toutes les écoles | ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tables = main.querySelectorAll('table');
  const c1 = viderTableau(tables[0]);
  aVerif.forEach((e) => c1.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nomEcole.toUpperCase()) + '</b></td><td>' + esc(e.numAutorisation || '- Aucun -') + '</td><td>' + (e.numAutorisation ? 'N° à vérifier' : 'N° non renseigné') + '</td><td>' + badgeValidation(e) + '</td><td>' + lienEcole(e, 'Vérifier') + '</td></tr>'));
  if (!aVerif.length) c1.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucun cas spécial 🎉</td></tr>');
  const c2 = viderTableau(tables[1]);
  ok.forEach((e) => c2.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nomEcole.toUpperCase()) + '</b></td><td>' + esc(e.villeEcole) + '</td><td>' + esc(e.numAutorisation || '- Aucun -') + '</td><td>' + badgeValidation(e) + '</td><td>' + lienEcole(e, 'Voir') + '</td></tr>'));
  if (!ok.length) c2.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucune école pour le moment.</td></tr>');
}

// ---------- ecoles.html ----------
function saEcoles() {
  const main = $('page-sa-ecoles');
  if (!main) return;
  const ecoles = getEcoles();
  const corps = viderTableau(main.querySelector('table'));
  ecoles.forEach((e) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nomEcole.toUpperCase()) + '</b></td><td>' + esc(e.villeEcole) + '</td><td>' + esc(e.typeEcole) + '</td><td>' + esc(e.numAutorisation || '- Aucun -') + '</td><td><span class="badge badge-valide">Gratuit</span></td><td>' + badgeValidation(e) + '</td><td>' + lienEcole(e, 'Voir') + '</td></tr>'));
  if (!ecoles.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="7">Aucune école inscrite.</td></tr>');
  const p = main.querySelector('h1 + p');
  if (p) p.textContent = ecoles.length + ' école(s) sur la plateforme';
}

// ---------- fiche-ecole.html?id=... ----------
function saFicheEcole() {
  const main = $('page-sa-fiche-ecole');
  if (!main) return;
  const e = ecoleParId(new URLSearchParams(window.location.search).get('id'));
  if (!e) { main.innerHTML = '<h1>École introuvable</h1><p><a href="ecoles.html">← Retour aux écoles</a></p>'; return; }
  const nb = listeEleves(e).length;
  const raison = e.validation === 'a_verifier' ? (e.numAutorisation ? "Le N° d'autorisation doit être vérifié sur le papier du Directeur." : "Aucun N° d'autorisation renseigné (école en création ?).") : 'Décision déjà prise. Tu peux la changer si besoin.';
  main.innerHTML =
    '<h1>' + esc(e.nomEcole) + '</h1><p>Inscrite le ' + new Date(e.creeLe).toLocaleDateString('fr-FR') + ' - ' + esc(e.villeEcole) + '</p>' +
    '<div class="kpi-grid"><div class="kpi kpi-bleu"><small>VILLE</small><b>' + esc(e.villeEcole) + '</b></div>' +
    '<div class="kpi kpi-bleu"><small>DIRECTEUR</small><b>' + esc(e.nomDirecteur) + '</b></div>' +
    '<div class="kpi kpi-orange"><small>STATUT ACTUEL</small><b>' + badgeValidation(e) + '</b></div></div>' +
    "<h2>Détails de l'école</h2><table><tr><th>CHAMP</th><th>VALEUR</th></tr>" +
    '<tr><td><b>Nom école</b></td><td>' + esc(e.nomEcole) + '</td></tr><tr><td><b>Type</b></td><td>' + esc(e.typeEcole) + '</td></tr>' +
    '<tr><td><b>Directeur</b></td><td>' + esc(e.nomDirecteur) + ' - ' + esc(e.email) + ' - ' + esc(e.telephone) + '</td></tr>' +
    "<tr><td><b>N° d'Autorisation</b></td><td>" + esc(e.numAutorisation || '- Aucun -') + '</td></tr>' +
    '<tr><td><b>Élèves inscrits</b></td><td>' + nb + '</td></tr><tr><td><b>Plan</b></td><td><span class="badge badge-valide">Gratuit</span></td></tr></table><br>' +
    '<div class="card"><h2>Décision</h2><p><b>Info :</b> ' + raison + '</p>' +
    '<button type="button" id="btn-valider-ecole">✅ Valider cette école</button><br><br>' +
    '<button type="button" id="btn-refuser-ecole">❌ Refuser (elle disparaît de la liste des parents)</button></div>' +
    '<p><a href="dashboardSuperadmin.html">← Retour au Dashboard</a></p>';
  const decider = (val, msg) => { if (!confirm(msg)) return; e.validation = val; saveEcole(e); window.location.reload(); };
  $('btn-valider-ecole').addEventListener('click', () => decider('valide', 'Valider cette école ?'));
  $('btn-refuser-ecole').addEventListener('click', () => decider('refuse', 'Refuser cette école ?'));
}

// ---------- abonnements.html ----------
function saAbonnements() {
  const main = $('page-sa-abonnements');
  if (!main) return;
  const ecoles = getEcoles();
  const kpis = main.querySelectorAll('.kpi b');
  if (kpis.length >= 3) { kpis[0].textContent = ecoles.length + ' école(s)'; kpis[1].textContent = '0 école'; kpis[2].textContent = '0 école'; }
  const corps = viderTableau(main.querySelector('table'));
  ecoles.forEach((e) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nomEcole.toUpperCase()) + '</b></td><td><span class="badge badge-valide">Gratuit</span></td><td>' + new Date(e.creeLe).toLocaleDateString('fr-FR') + '</td><td><span class="badge badge-valide">Actif</span></td><td>' + lienEcole(e, 'Voir') + '</td></tr>'));
  if (!ecoles.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucune école.</td></tr>');
}

// ---------- utilisateurs.html ----------
function saUtilisateurs() {
  const main = $('page-sa-utilisateurs');
  if (!main) return;
  const lignes = [];
  getEcoles().forEach((e) => lignes.push({ nom: e.nomDirecteur, role: 'Directeur', ecole: e.nomEcole, contact: e.email, statut: e.validation === 'refuse' ? 'Suspendu' : (e.validation === 'a_verifier' ? 'En attente' : 'Actif'), lien: lienEcole(e, 'Voir école') }));
  const vus = {};
  getInscriptions().forEach((i) => {
    const e = ecoleParId(i.ecoleId) || {};
    const cle = i.parentTel + '|' + i.ecoleId;
    if (!vus[cle]) { vus[cle] = { nom: i.parentNom, role: 'Parent', ecole: e.nomEcole || '—', contact: i.parentTel, statut: 'En attente', lien: '' }; lignes.push(vus[cle]); }
    if (i.statut === 'valide') vus[cle].statut = 'Actif';
  });
  const table = main.querySelector('table');
  table.rows[0].cells[3].textContent = 'EMAIL / TÉLÉPHONE';
  const corps = viderTableau(table);
  lignes.forEach((l) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(l.nom) + '</b></td><td>' + l.role + '</td><td>' + esc(l.ecole) + '</td><td>' + esc(l.contact) + '</td><td><span class="badge ' + (l.statut === 'Actif' ? 'badge-valide' : (l.statut === 'Suspendu' ? 'badge-special' : 'badge-attente')) + '">' + l.statut + '</span></td><td>' + l.lien + '</td></tr>'));
  if (!lignes.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="6">Aucun utilisateur.</td></tr>');
}

// ---------- sauvegardes.html ----------
function saSauvegardes() {
  const main = $('page-sa-sauvegardes');
  if (!main) return;
  const table = main.querySelector('table');
  function afficher() {
    const sauvs = getSauvegardes();
    const demandes = getRestaurations().filter((r) => r.statut === 'en_attente');
    const corps = viderTableau(table);
    getEcoles().forEach((e) => {
      const derniere = sauvs.filter((s) => s.ecoleId === e.id).pop();
      const enAttente = demandes.some((r) => r.ecoleId === e.id);
      const statut = enAttente ? '<span class="badge badge-attente">Demande en attente</span>' : (derniere ? '<span class="badge badge-valide">OK</span>' : '<span class="badge badge-special">Aucune</span>');
      corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nomEcole.toUpperCase()) + '</b></td><td>' + (derniere ? dateFr(derniere.creeLe) : '—') + '</td><td>' + (derniere ? tailleLisible(derniere.taille) : '—') + '</td><td>' + statut + '</td><td><button type="button" data-id="' + esc(e.id) + '">Sauvegarder</button>' + (enAttente ? ' <a href="demandes-restauration.html">Voir la demande</a>' : '') + '</td></tr>');
    });
    if (!getEcoles().length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucune école.</td></tr>');
  }
  table.addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-id]');
    if (!b) return;
    const e = ecoleParId(b.getAttribute('data-id'));
    if (e) { sauvegarderEcole(e); afficher(); }
  });
  afficher();
}

// ---------- demandes-restauration.html ----------
function saRestaurations() {
  const main = $('page-sa-restaurations');
  if (!main) return;
  const table = main.querySelector('table');
  const detail = $('detail');
  let choisie = null;
  function sauver(liste) { ecrire(CLE_REST, liste); }

  function afficher() {
    const toutes = getRestaurations();
    const att = toutes.filter((r) => r.statut === 'en_attente');
    const corps = viderTableau(table);
    att.forEach((r) => {
      const e = ecoleParId(r.ecoleId) || {};
      const s = getSauvegardes().find((x) => x.id === r.sauvegardeId) || {};
      corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc((e.nomEcole || '—').toUpperCase()) + '</b></td><td>' + dateFr(s.creeLe) + '</td><td>' + esc(r.motif) + '</td><td><span class="badge badge-attente">En attente</span></td><td><a href="#detail" data-id="' + esc(r.id) + '">Traiter →</a></td></tr>');
    });
    if (!att.length) corps.insertAdjacentHTML('beforeend', '<tr><td colspan="5">Aucune demande en attente.</td></tr>');
    const r = att.find((x) => x.id === choisie) || att[0];
    if (!r) { detail.innerHTML = '<h2>Aucune demande à traiter</h2><p>Les demandes envoyées par les directeurs apparaîtront ici.</p>'; return; }
    choisie = r.id;
    const e = ecoleParId(r.ecoleId) || {};
    const s = getSauvegardes().find((x) => x.id === r.sauvegardeId) || {};
    detail.innerHTML = '<h2>Demande - ' + esc(e.nomEcole) + '</h2><p><b>Sauvegarde :</b> ' + dateFr(s.creeLe) + ' (' + (s.donnees ? s.donnees.length : 0) + ' inscription(s))<br><b>Motif :</b> ' + esc(r.motif) + '<br><b>Directeur :</b> ' + esc(e.nomDirecteur) + '</p>' +
      '<p><small>⚠️ Valider remplace les inscriptions actuelles de l\'école par celles de la sauvegarde.</small></p>' +
      '<button type="button" id="btn-valider-rest">✅ Valider la restauration</button><br><br><button type="button" id="btn-refuser-rest">❌ Refuser la restauration</button>';
    const traiter = (statut) => {
      if (statut === 'validee') {
        if (!confirm('Restaurer les données de cette sauvegarde ?')) return;
        const autres = getInscriptions().filter((i) => i.ecoleId !== e.id && i.ecoleId !== e.nomEcole);
        ecrire(CLE_INS, autres.concat(s.donnees || []));
      }
      sauver(getRestaurations().map((x) => (x.id === r.id ? Object.assign({}, x, { statut: statut, traiteLe: new Date().toISOString() }) : x)));
      afficher();
    };
    $('btn-valider-rest').addEventListener('click', () => traiter('validee'));
    $('btn-refuser-rest').addEventListener('click', () => traiter('refusee'));
  }
  table.addEventListener('click', function (ev) {
    const a = ev.target.closest('a[data-id]');
    if (a) { choisie = a.getAttribute('data-id'); afficher(); }
  });
  afficher();
}

// ---------- Côté directeur : demander une restauration (dans parametres.html) ----------
function blocRestauration(ecole, main) {
  const sauvs = getSauvegardes().filter((s) => s.ecoleId === ecole.id).reverse();
  const enCours = getRestaurations().filter((r) => r.ecoleId === ecole.id && r.statut === 'en_attente').length;
  main.insertAdjacentHTML('beforeend',
    '<div class="card"><h2 style="text-align:left;">5. Restauration des données</h2>' +
    (sauvs.length
      ? '<label>Sauvegarde à restaurer</label><select id="rest-sauvegarde">' + sauvs.map((s) => '<option value="' + esc(s.id) + '">' + dateFr(s.creeLe) + ' (' + tailleLisible(s.taille) + ')</option>').join('') + '</select>' +
        '<label>Motif</label><input type="text" id="rest-motif" placeholder="Ex : suppression accidentelle">' +
        '<button type="button" id="btn-demande-restauration" class="vert" style="margin-top:10px;">Envoyer la demande</button>'
      : '<p>Aucune sauvegarde disponible pour ton école pour le moment.</p>') +
    '<p id="message-restauration">' + (enCours ? enCours + ' demande(s) en attente de validation du Super Admin.' : '') + '</p></div>');
  const btn = $('btn-demande-restauration');
  if (!btn) return;
  btn.addEventListener('click', function () {
    const motif = $('rest-motif').value.trim();
    if (!motif) { alert('Écris le motif de ta demande'); return; }
    if (getRestaurations().some((r) => r.ecoleId === ecole.id && r.statut === 'en_attente')) { alert('Tu as déjà une demande en attente'); return; }
    ecrire(CLE_REST, getRestaurations().concat([{ id: 'rest_' + Date.now(), ecoleId: ecole.id, sauvegardeId: $('rest-sauvegarde').value, motif: motif, statut: 'en_attente', creeLe: new Date().toISOString() }]));
    $('message-restauration').textContent = 'Demande envoyée ✅ Le Super Admin va la traiter.';
    $('rest-motif').value = '';
  });
}

// ---------- superadmin.html : création du compte (1re fois) + connexion ----------
function pageSuperAdminLogin() {
  const formCreation = $('form-creation-sa');
  const formConn = $('form-connexion-sa');
  if (!formCreation || !formConn) return;
  let compte = null;
  try { compte = JSON.parse(localStorage.getItem(CLE_SA_COMPTE) || 'null'); } catch (e) { compte = null; }
  if (estSuperAdmin() && compte) { window.location.href = 'dashboardSuperadmin.html'; return; }
  formCreation.style.display = compte ? 'none' : 'block';
  formConn.style.display = compte ? 'block' : 'none';

  formCreation.addEventListener('submit', function (e) {
    e.preventDefault();
    const f = formCreation.elements;
    if (f['mdp_sa'].value.length < 6) { alert('Mot de passe trop court, 6 caractères minimum'); return; }
    if (f['mdp_sa'].value !== f['mdp_sa2'].value) { alert('Les 2 mots de passe ne sont pas les mêmes'); return; }
    ecrire(CLE_SA_COMPTE, { nom: f['nom_sa'].value.trim(), email: f['email_sa'].value.trim().toLowerCase(), motDePasse: f['mdp_sa'].value });
    localStorage.setItem(CLE_SA, '1');
    window.location.href = 'dashboardSuperadmin.html';
  });
  formConn.addEventListener('submit', function (e) {
    e.preventDefault();
    const f = formConn.elements;
    if (f['email_connexion_sa'].value.trim().toLowerCase() !== compte.email || f['mdp_connexion_sa'].value !== compte.motDePasse) { alert('Email ou mot de passe faux'); return; }
    localStorage.setItem(CLE_SA, '1');
    window.location.href = 'dashboardSuperadmin.html';
  });
}
