// ==========================================================
// InscriGab - app.js (connecté à Supabase : fonctions RPC + Auth)
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
// Toutes les pages passent par ces fonctions. Les données vivent dans Supabase ;
// le localStorage ne garde que le lien du parent, la session et un brouillon d'école.

const $ = (id) => document.getElementById(id);

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
// ================= PARTIE B : PAGES =================
function pageReinitialisationMotDePasse() {
  if (!/reset-password(\.html)?\/?$/.test(window.location.pathname)) return;
  const zone = document.getElementById('etat-reinitialisation');
  if (zone) zone.textContent = 'Vérification de ton lien de réinitialisation…';
  gererRetourEmail().then((traite) => {
    if (!traite && zone) zone.textContent = 'Aucun lien de réinitialisation détecté. Retourne à la connexion et demande un nouveau lien.';
  }).catch((e) => afficherErreurReinitialisation(messageErreur(e)));
}
document.addEventListener('DOMContentLoaded', function () {
  // Les liens de récupération doivent rester sur la page dédiée, pas repartir vers l'ancien écran.
  if ((window.location.hash || '').includes('access_token=') && !/(directeur|superadmin)(\.html)?\/?$/.test(window.location.pathname) && !/reset-password(\.html)?\/?$/.test(window.location.pathname)) { window.location.replace('reset-password.html' + window.location.hash); return; }
  pageReinitialisationMotDePasse();
  pageParent();
  pageDocuments();
  pagePaiement();
  pageRecu();
  pageDirecteurAuth();
  pageSuperAdminAuth();
  initSuperAdmin();

  initDirecteur();
});

// ---------- Connexion à Supabase : parcours PARENT ----------
// Le parent n'a pas de compte : après son inscription il reçoit un lien secret
// (lien_perso) qui lui permet de suivre son dossier. Tout passe par des fonctions
// sécurisées de la base (rpc), jamais par un accès direct aux tables.
const SUPABASE_URL = 'https://fcowcbvndxymxefatsqd.supabase.co';
const SUPABASE_CLE = 'sb_publishable_nXl90NObsR8gm03LaXu4Tg_eiNRULNt'; // clé publique : faite pour être dans le site
const CLE_PARENT = 'inscrigab_parent';

function enteteSupabase(extra) {
  const h = { apikey: SUPABASE_CLE };
  if (SUPABASE_CLE.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_CLE;
  return Object.assign(h, extra || {});
}
const MESSAGES_ERREUR = {
  ecole_fermee: "Cette école n'accepte pas (ou plus) d'inscriptions.",
  classe_pleine: 'Cette classe est pleine. Choisis une autre classe.',
  classe_invalide: "Cette classe n'existe pas dans cette école.",
  parent_invalide: 'Vérifie ton nom et ton numéro de téléphone.',
  enfant_invalide: "Vérifie le nom et le prénom de l'enfant.",
  nombre_enfants_invalide: "Tu peux inscrire de 1 à 10 enfants à la fois.",
  numero_operateur_invalide: "Ce numéro ne correspond pas à l'opérateur choisi (Airtel : 074 ou 077 - Moov : 062, 065 ou 066).",
  infos_paiement_manquantes: 'Pour Mobile Money, mets le numéro qui paie et le nom du compte.',
  trop_de_demandes: 'Trop de demandes en peu de temps. Réessaie dans une heure.',
  date_naissance_invalide: "La date de naissance semble incorrecte (l'enfant doit avoir entre 1 et 30 ans).",
  montant_inscription_invalide: "Les frais de cette école ne sont pas encore définis. Contacte l'école.",
  paiement_deja_confirme: 'Le paiement de ce dossier est déjà confirmé.',
  lien_invalide: 'Ton lien de suivi est invalide. Reprends depuis le début.',
  dossier_invalide: 'Dossier introuvable. Reprends depuis le début.',
  dossier_introuvable: 'Dossier introuvable. Reprends depuis le début.',
  inscription_introuvable: 'Dossier introuvable. Reprends depuis le début.',
  fichier_refuse: "Un fichier a été refusé (JPG, PNG, WEBP ou PDF, 5 Mo maximum).",
  reseau: 'Impossible de joindre le serveur. Vérifie ta connexion internet et réessaie.'
};
function messageErreur(e) {
  if (e && e.affichable) return e.message; // message en français renvoyé par le serveur
  const m = (e && e.message) || '';
  for (const k in MESSAGES_ERREUR) if (m.includes(k)) return MESSAGES_ERREUR[k];
  return "Une erreur est survenue. Réessaie dans un instant.";
}
async function rpc(nom, args) {
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nom, { method: 'POST', headers: enteteSupabase({ 'Content-Type': 'application/json' }), body: JSON.stringify(args || {}) });
  } catch (e) { throw new Error('reseau'); }
  let data = null;
  try { data = await r.json(); } catch (e) { /* réponse vide */ }
  if (!r.ok) throw new Error((data && (data.message || data.error)) || 'erreur_' + r.status);
  return data;
}
// L'inscription d'un parent passe par la fonction serveur « inscription-parent » :
// elle vérifie le test anti-robot (Cloudflare Turnstile) avant d'enregistrer le dossier.
async function appelerInscriptionParent(corps) {
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/functions/v1/inscription-parent', { method: 'POST', headers: enteteSupabase({ 'Content-Type': 'application/json' }), body: JSON.stringify(corps) });
  } catch (e) { throw new Error('reseau'); }
  let data = null;
  try { data = await r.json(); } catch (e) { /* réponse vide */ }
  if (!r.ok) throw new Error((data && (data.message || data.error)) || 'erreur_' + r.status);
  return data;
}
// Les documents passent par la fonction serveur « parent-document-upload » :
// 1) elle vérifie le lien du parent et donne une adresse d'envoi temporaire (sign)
// 2) le site dépose le fichier à cette adresse
// 3) il confirme (complete) pour que le document soit rattaché au dossier
async function appelerEnvoiDocument(corps) {
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/functions/v1/parent-document-upload', { method: 'POST', headers: enteteSupabase({ 'Content-Type': 'application/json' }), body: JSON.stringify(corps) });
  } catch (e) { throw new Error('reseau'); }
  let d = null;
  try { d = await r.json(); } catch (e) { /* réponse vide */ }
  if (!r.ok) { const err = new Error((d && d.error) || 'erreur_' + r.status); err.affichable = !!(d && d.error); throw err; }
  return d;
}
async function deposerDocument(parent, insc, type, fichier) {
  const s = await appelerEnvoiDocument({ action: 'sign', lien: parent.lien, inscription_id: insc.id, type_document: type, nom_fichier: fichier.name, mime_type: fichier.type, taille: fichier.size });
  const fd = new FormData();
  fd.append('cacheControl', '3600');
  fd.append('', fichier);
  let r;
  try { r = await fetch(s.signed_url, { method: 'PUT', headers: enteteSupabase({ 'x-upsert': 'false' }), body: fd }); } catch (e) { throw new Error('reseau'); }
  if (!r.ok) throw new Error('fichier_refuse');
  await appelerEnvoiDocument({ action: 'complete', lien: parent.lien, inscription_id: insc.id, type_document: type, path: s.path, nom_fichier: fichier.name });
}
// Numéros gabonais (9 chiffres depuis 2024). Airtel : 074, 077 - Moov/Libertis : 062, 065, 066.
// Mêmes règles que dans la base de données, qui refait toujours la vérification elle-même.
function normaliserNumeroGabon(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.startsWith('00241')) d = d.slice(5);
  else if (d.startsWith('241') && (d.length === 11 || d.length === 12)) d = d.slice(3);
  if (d.length === 8) {
    if (d[0] === '0') { const anc = { '04': '074', '07': '077', '02': '062', '05': '065', '06': '066' }[d.slice(0, 2)]; d = anc ? anc + d.slice(2) : ''; }
    else d = '0' + d;
  }
  return /^0\d{8}$/.test(d) ? d : null;
}
function operateurDuNumero(t) {
  const n = normaliserNumeroGabon(t);
  if (!n) return null;
  const p = n.slice(0, 3);
  return (p === '074' || p === '077') ? 'airtel' : ((p === '062' || p === '065' || p === '066') ? 'moov' : null);
}
function getParent() {
  try { return JSON.parse(localStorage.getItem(CLE_PARENT) || 'null'); } catch (e) { return null; }
}
async function chargerDossier(parent) {
  const d = await rpc('mon_dossier', { p_lien: parent.lien });
  return d && d.inscriptions && d.inscriptions.length ? d : null;
}
function verrouiller(btn, texte) {
  const ancien = btn.textContent; btn.disabled = true; btn.textContent = texte;
  return function () { btn.disabled = false; btn.textContent = ancien; };
}

// ---------- parent.html : ÉTAPE 1 ----------
async function pageParent() {
  const container = $('liste-enfants');
  const btnAjouter = $('btn-ajouter-enfant');
  const form = $('form-inscription');
  if (!container || !btnAjouter || !form) return;

  let ecoles = [];
  const cacheClasses = {};
  let erreurChargement = false;
  try { ecoles = await rpc('lister_ecoles_ouvertes'); } catch (e) { erreurChargement = true; alert(messageErreur(e)); }

  function optionsEcoles() {
    if (!ecoles.length) return '<option value="">' + (erreurChargement ? 'Chargement impossible' : "Aucune école n'a ouvert ses inscriptions") + '</option>';
    return ecoles.map((e) => '<option value="' + e.id + '">' + esc(e.nom) + ' - ' + esc(e.ville) + '</option>').join('');
  }
  async function chargerClasses(ecoleId, selClasse) {
    if (!ecoleId) { selClasse.innerHTML = '<option value="">—</option>'; return; }
    selClasse.innerHTML = '<option value="">Chargement…</option>';
    try {
      if (!cacheClasses[ecoleId]) cacheClasses[ecoleId] = await rpc('lister_classes', { p_ecole: Number(ecoleId) });
      const liste = cacheClasses[ecoleId];
      selClasse.innerHTML = liste.length
        ? liste.map((c) => '<option value="' + c.id + '"' + (c.places_restantes < 1 ? ' disabled' : '') + '>' + esc(c.nom_classe) + (c.places_restantes < 1 ? ' (complet)' : ' (' + c.places_restantes + ' place(s))') + '</option>').join('')
        : '<option value="">Aucune classe disponible</option>';
    } catch (e) { selClasse.innerHTML = '<option value="">Chargement impossible</option>'; }
  }

  let compteur = 0;
  function creerBlocEnfant() {
    compteur++;
    const premier = container.querySelector('.sel-ecole');
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'bloc-enfant';
    fieldset.innerHTML =
      '<legend>Enfant ' + compteur + (compteur > 1 ? ' <button type="button" class="btn-supprimer" style="float:right">Supprimer ✕</button>' : '') + '</legend>' +
      '<label>Nom de l\'enfant</label><br><input type="text" name="nom_eleve" placeholder="Ex : Nze" maxlength="100" required><br><br>' +
      '<label>Prénom de l\'enfant</label><br><input type="text" name="prenom_eleve" placeholder="Ex : Léa" maxlength="100" required><br><br>' +
      '<label>Date de naissance</label><br><input type="date" name="date_naissance" required><br><br>' +
      '<label>Sexe</label><br><select name="sexe"><option>Fille</option><option>Garçon</option></select><br><br>' +
      '<label>Choisis l\'école</label><br><select name="ecole" class="sel-ecole">' + optionsEcoles() + '</select><br><br>' +
      '<label>Choisis la classe</label><br><select name="classe" class="sel-classe"></select><br><br>';
    container.appendChild(fieldset);
    const selEcole = fieldset.querySelector('.sel-ecole');
    const selClasse = fieldset.querySelector('.sel-classe');
    if (premier) selEcole.value = premier.value; // même école que l'enfant 1
    chargerClasses(selEcole.value, selClasse);
    selEcole.addEventListener('change', function () { chargerClasses(selEcole.value, selClasse); });
    const btnSupp = fieldset.querySelector('.btn-supprimer');
    if (btnSupp) btnSupp.addEventListener('click', function () { fieldset.remove(); });
  }
  creerBlocEnfant();
  btnAjouter.addEventListener('click', creerBlocEnfant);

  let enCours = false;
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enCours) return;
    const v = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
    const parentNom = v('parent_nom');
    const parentTel = v('parent_tel');
    if (parentNom.length < 2 || parentTel.replace(/\s/g, '').length < 8) { alert('Vérifie le nom et le téléphone'); return; }
    const enfants = [];
    container.querySelectorAll('.bloc-enfant').forEach((bloc) => {
      const get = (name) => bloc.querySelector('[name="' + name + '"]').value.trim();
      if (get('nom_eleve') && get('prenom_eleve')) enfants.push({ nom: get('nom_eleve'), prenom: get('prenom_eleve'), date_naissance: get('date_naissance'), sexe: get('sexe'), classe_id: Number(get('classe')), ecole: get('ecole') });
    });
    if (!enfants.length) { alert('Ajoute au moins 1 enfant'); return; }
    const ecoleId = enfants[0].ecole;
    if (!ecoleId) { alert("Aucune école disponible pour le moment"); return; }
    if (enfants.some((x) => x.ecole !== ecoleId)) { alert('Tous les enfants doivent être dans la même école. Fais une inscription séparée pour une autre école.'); return; }
    if (enfants.some((x) => !x.classe_id)) { alert('Choisis une classe pour chaque enfant'); return; }

    const jeton = form.elements['cf-turnstile-response'] ? form.elements['cf-turnstile-response'].value : '';
    if (!jeton) { alert('Attends la fin de la vérification anti-robot (quelques secondes), puis appuie à nouveau sur Envoyer.'); return; }

    enCours = true;
    const bouton = form.querySelector('button[type=submit]');
    const deverrouiller = verrouiller(bouton, 'Envoi en cours…');
    try {
      const r = await appelerInscriptionParent({
        token: jeton,
        p_ecole: Number(ecoleId), p_parent_nom: parentNom, p_parent_tel: parentTel, p_annee: v('annee_scolaire'),
        p_enfants: enfants.map((x) => ({ nom: x.nom, prenom: x.prenom, date_naissance: x.date_naissance, sexe: x.sexe, classe_id: x.classe_id }))
      });
      localStorage.setItem(CLE_PARENT, JSON.stringify({ lien: r.lien_perso, dossier: r.dossier_id }));
      window.location.href = 'documents.html';
    } catch (err) {
      alert(messageErreur(err));
      try { if (window.turnstile) window.turnstile.reset(); } catch (e) { /* ignoré */ }
      enCours = false; deverrouiller();
    }
  });
}

// ---------- documents.html : ÉTAPE 2 ----------
const DOCS = [
  ['acte_naissance', 'Acte de naissance'], ['photo', "Photo d'identité de l'enfant"], ['carnet_sante', 'Carnet de santé / vaccination'],
  ['bulletin', "Bulletin de l'année précédente"], ['piece_parent', "Pièce d'identité du parent"]
];
const TYPES_FICHIERS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const TAILLE_MAX = 5 * 1024 * 1024;

async function pageDocuments() {
  const formDocs = $('form-documents');
  if (!formDocs) return;
  const info = $('info-enfant');
  const zone = $('liste-documents');
  const parent = getParent();
  if (!parent) { info.textContent = "Aucune inscription trouvée. Retourne sur parent.html et remplis le formulaire d'abord."; return; }
  let dossier;
  try { dossier = await chargerDossier(parent); } catch (e) { info.textContent = messageErreur(e); return; }
  if (!dossier) { info.textContent = "Dossier introuvable. Retourne sur parent.html pour recommencer."; return; }

  const inscs = dossier.inscriptions;
  const ecole = inscs[0].ecole;
  const obligatoires = ecole.docs_demandes || [];
  if ($('nom-ecole-docs')) $('nom-ecole-docs').textContent = ecole.nom + ' - ' + ecole.ville;
  info.textContent = 'Pour : ' + inscs.map((i) => i.eleve.prenom + ' ' + i.eleve.nom).join(', ') + ' (' + inscs.length + ' enfant(s)) - Parent : ' + dossier.parent.nom;

  zone.innerHTML = '';
  inscs.forEach(function (insc, n) {
    const fs = document.createElement('fieldset');
    let html = '<legend>Documents pour Enfant ' + (n + 1) + ' : ' + esc(insc.eleve.prenom + ' ' + insc.eleve.nom) + ' - ' + esc(insc.classe) + '</legend>';
    DOCS.forEach(function (d, k) {
      const deja = (insc.documents || []).includes(d[0]);
      const req = obligatoires.includes(d[0]) && !deja;
      html += '<label>' + (k + 1) + '. ' + d[1] + (obligatoires.includes(d[0]) ? ' *' : ' (facultatif)') + (deja ? ' ✅ déjà envoyé' : '') + '</label><br>' +
        '<input type="file" name="' + d[0] + '_' + insc.id + '" accept="' + (d[0] === 'photo' ? 'image/jpeg,image/png,image/webp' : TYPES_FICHIERS.join(',')) + '"' + (req ? ' required' : '') + '><br><br>';
    });
    fs.innerHTML = html;
    zone.appendChild(fs);
  });

  if ($('btn-retour')) $('btn-retour').addEventListener('click', function () { window.location.href = 'parent.html'; });
  const msg = $('message-docs');
  let enCours = false;
  formDocs.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enCours) return;
    if ($('certifie') && !$('certifie').checked) { alert('Coche la case de confirmation'); return; }
    const aEnvoyer = [];
    for (const insc of inscs) {
      for (const d of DOCS) {
        const champ = formDocs.elements[d[0] + '_' + insc.id];
        const f = champ && champ.files[0];
        if (!f) continue;
        if (!TYPES_FICHIERS.includes(f.type)) { alert('« ' + f.name + ' » : formats acceptés JPG, PNG, WEBP ou PDF'); return; }
        if (f.size > TAILLE_MAX) { alert('« ' + f.name + ' » dépasse 5 Mo'); return; }
        aEnvoyer.push({ insc: insc, type: d[0], fichier: f });
      }
    }
    enCours = true;
    const deverrouiller = verrouiller(formDocs.querySelector('button[type=submit]'), 'Envoi en cours…');
    try {
      for (let i = 0; i < aEnvoyer.length; i++) {
        const x = aEnvoyer[i];
        if (msg) msg.textContent = 'Envoi du fichier ' + (i + 1) + ' sur ' + aEnvoyer.length + '…';
        await deposerDocument(parent, x.insc, x.type, x.fichier);
      }
      if (msg) msg.textContent = 'Documents enregistrés !';
      window.location.href = 'paiement.html';
    } catch (err) {
      if (msg) msg.textContent = '';
      alert(messageErreur(err));
      enCours = false; deverrouiller();
    }
  });
}

// ---------- paiement.html : ÉTAPE 3 ----------
async function pagePaiement() {
  const formPaiement = $('form-paiement');
  if (!formPaiement) return;
  const set = (id, txt) => { if ($(id)) $(id).textContent = txt; };
  const parent = getParent();
  if (!parent) { set('recap-parent', 'Aucune inscription trouvée. Retourne sur parent.html.'); return; }
  let dossier;
  try { dossier = await chargerDossier(parent); } catch (e) { set('recap-parent', messageErreur(e)); return; }
  if (!dossier) { set('recap-parent', 'Dossier introuvable. Retourne sur parent.html.'); return; }

  const inscs = dossier.inscriptions;
  const nb = inscs.length;
  const totalInsc = inscs.reduce((s, i) => s + Number(i.frais_inscription || 0), 0);
  const totalDossier = inscs.reduce((s, i) => s + Number(i.frais_dossier || 0), 0);
  const total = totalInsc + totalDossier;
  const avecDocs = inscs.filter((i) => (i.documents || []).length > 0).length;

  set('recap-parent', 'Parent : ' + dossier.parent.nom + ' (' + dossier.parent.telephone + ')');
  if ($('recap-enfants')) $('recap-enfants').innerHTML = inscs.map((i, n) => '<b>Enfant ' + (n + 1) + ' :</b> ' + esc(i.eleve.prenom + ' ' + i.eleve.nom) + ' - ' + esc(i.classe)).join('<br>');
  set('recap-ecole', 'École : ' + inscs[0].ecole.nom);
  set('recap-annee', 'Année scolaire : ' + (inscs[0].annee_scolaire || '-'));
  set('recap-documents', 'Documents : ' + (avecDocs ? avecDocs + ' dossier(s) sur ' + nb + ' avec documents envoyés' : 'Non envoyés'));
  set('recap-frais', "Frais d'inscription : " + fcfa(totalInsc) + ' (' + nb + ' enfant(s))');
  set('recap-dossier', 'Frais de dossier : ' + fcfa(totalDossier) + ' (' + nb + ' enfant(s))');
  set('recap-total', 'Total à payer : ' + fcfa(total));
  set('btn-payer', 'Payer ' + fcfa(total));

  // Où déposer l'argent : le numéro Mobile Money renseigné par l'école
  const ecole = inscs[0].ecole;
  const NOMS_MOYENS = { airtel_money: 'Airtel Money', moov_money: 'Moov Money' };
  const OPERATEUR_DU_MOYEN = { airtel_money: 'airtel', moov_money: 'moov' };
  function numeroDepot(moyen) { return ecole['numero_' + moyen] || ''; }
  function majInstructions() {
    const moyen = formPaiement.elements['moyen_paiement'].value;
    const zoneInfos = $('instructions-depot');
    if (!zoneInfos) return;
    if (moyen === 'especes') zoneInfos.innerHTML = 'Tu paies <b>' + esc(fcfa(total)) + "</b> en espèces à l'école. L'école confirmera ton paiement.";
    else if (numeroDepot(moyen)) zoneInfos.innerHTML = 'Envoie <b>' + esc(fcfa(total)) + '</b> au numéro <b>' + esc(numeroDepot(moyen)) + '</b> (' + NOMS_MOYENS[moyen] + "), puis appuie sur « Payer ». L'école confirmera la réception de ton paiement.";
    else zoneInfos.innerHTML = '⚠️ Cette école n\'a pas encore renseigné son numéro ' + (NOMS_MOYENS[moyen] || '') + '. Contacte-la ou choisis un autre moyen de paiement.';
  }
  formPaiement.querySelectorAll('input[name="moyen_paiement"]').forEach((r) => r.addEventListener('change', majInstructions));
  majInstructions();

  if ($('btn-retour-paiement')) $('btn-retour-paiement').addEventListener('click', function () { window.location.href = 'documents.html'; });
  let enCours = false;
  formPaiement.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enCours) return;
    const moyen = formPaiement.elements['moyen_paiement'].value;
    if ($('accepte') && !$('accepte').checked) { alert('Coche la case de confirmation'); return; }
    if (!moyen) { alert('Choisis un moyen de paiement'); return; }
    const mobileMoney = ['airtel_money', 'moov_money'].includes(moyen);
    if (mobileMoney && !numeroDepot(moyen)) { alert("Cette école n'a pas encore renseigné son numéro " + NOMS_MOYENS[moyen] + '. Contacte-la ou choisis un autre moyen de paiement.'); return; }
    enCours = true;
    const deverrouiller = verrouiller($('btn-payer'), 'Enregistrement…');
    try {
      const montant = await rpc('enregistrer_paiement', { p_lien: parent.lien, p_dossier: parent.dossier, p_methode: moyen, p_telephone: null, p_nom_compte: null, p_code: null });
      alert('Paiement enregistré ✅\n\nMontant : ' + fcfa(montant) + "\nL'école va vérifier ton paiement puis valider ton dossier.");
      window.location.href = 'recu.html';
    } catch (err) {
      alert(messageErreur(err));
      enCours = false; deverrouiller();
    }
  });
}

// ---------- recu.html : suivi du dossier + billets ----------
async function pageRecu() {
  const zone = $('page-recu');
  if (!zone) return;
  window.addEventListener('hashchange', function () { window.location.reload(); });
  const lienUrl = decodeURIComponent((window.location.hash || '').replace('#', '')).trim();
  if (/^[0-9a-f]{64}$/.test(lienUrl)) localStorage.setItem(CLE_PARENT, JSON.stringify({ lien: lienUrl, dossier: null }));
  const parent = getParent();
  if (!parent) { zone.innerHTML = '<h1>Suivi de ton dossier</h1><p>Aucune inscription trouvée sur cet appareil.</p><a href="parent.html">Faire une inscription</a>'; return; }
  zone.innerHTML = '<h1>Suivi de ton dossier</h1><p>Chargement…</p>';
  let dossier;
  try { dossier = await chargerDossier(parent); } catch (e) { zone.innerHTML = '<h1>Suivi de ton dossier</h1><p>' + esc(messageErreur(e)) + '</p><button type="button" onclick="window.location.reload()">Réessayer</button>'; return; }
  if (!dossier) { zone.innerHTML = '<h1>Suivi de ton dossier</h1><p>Dossier introuvable.</p><a href="parent.html">Faire une inscription</a>'; return; }

  const lienSuivi = window.location.origin + window.location.pathname + '#' + parent.lien;
  const blocs = dossier.inscriptions.map(function (i) {
    const nom = esc(i.eleve.prenom + ' ' + i.eleve.nom);
    if (i.statut === 'valide') {
      const num = 'BILLET-' + String(i.id).padStart(5, '0') + '-' + String(i.dossier_id).slice(0, 4).toUpperCase();
      return '<fieldset><legend>BILLET D\'ENTRÉE - ' + nom + '</legend>' +
        '<p><b>École :</b> ' + esc(i.ecole.nom) + ' - ' + esc(i.ecole.ville) + '</p><p><b>Année scolaire :</b> ' + esc(i.annee_scolaire) + '</p><br>' +
        '<p><b>Élève :</b> ' + nom + '</p><p><b>Classe :</b> ' + esc(i.classe) + '</p><p><b>Parent :</b> ' + esc(dossier.parent.nom) + '</p><br>' +
        '<p><b>Statut :</b> ADMIS - Peut entrer en classe</p><p><b>Validé le :</b> ' + (i.valide_le ? new Date(i.valide_le).toLocaleDateString('fr-FR') : '—') + '</p>' +
        '<p><b>N° Billet :</b> ' + esc(num) + '</p></fieldset><br>';
    }
    if (i.statut === 'refuse') return '<fieldset><legend>' + nom + '</legend><p>❌ Dossier refusé par l\'école. Contacte-la pour plus d\'informations.</p></fieldset><br>';
    const p = i.paiement;
    const etapes = [(i.documents || []).length ? '✅ Documents envoyés' : '⏳ Documents à envoyer', p ? (p.statut === 'paye' ? '✅ Paiement reçu' : '⏳ Paiement à vérifier par l\'école') : '⏳ Paiement à faire', '⏳ Validation par l\'école'];
    return '<fieldset><legend>' + nom + ' - ' + esc(i.classe) + '</legend><p>' + etapes.join('<br>') + '</p></fieldset><br>';
  });
  zone.innerHTML = '<h1>Suivi de ton dossier</h1><p>Parent : ' + esc(dossier.parent.nom) + ' - ' + esc(dossier.inscriptions[0].ecole.nom) + '</p><br>' + blocs.join('') +
    '<fieldset><legend>Ton lien de suivi</legend><p>Garde ce lien : c\'est ton accès à ton dossier. Ne le partage avec personne.</p>' +
    '<input type="text" id="lien-suivi" readonly value="' + esc(lienSuivi) + '"><br><br><button type="button" id="btn-copier-lien">Copier le lien</button></fieldset><br>' +
    '<button type="button" onclick="window.location.reload()">Actualiser</button> <button type="button" onclick="window.print()">Imprimer</button><br><br><a href="index.html">Retour à l\'accueil</a>';
  $('btn-copier-lien').addEventListener('click', function () {
    const champ = $('lien-suivi'); champ.select();
    if (navigator.clipboard) navigator.clipboard.writeText(champ.value).then(() => alert('Lien copié ✅'), () => alert('Copie le lien manuellement'));
    else alert('Copie le lien manuellement');
  });
}

// ================= PARTIE C : DIRECTEUR (connecté à Supabase) =================
// Connexion par email + mot de passe (Supabase Auth). Ensuite, chaque action passe par une
// fonction de la base qui vérifie les permissions : le site ne peut rien faire de plus.
const CLE_SESSION = 'inscrigab_session';
const CLE_ECOLE_EN_ATTENTE = 'inscrigab_ecole_en_attente';
const MESSAGES_AUTH = {
  invalid_credentials: 'Email ou mot de passe incorrect.',
  email_not_confirmed: "Confirme d'abord ton email (regarde ta boîte mail), puis connecte-toi.",
  user_already_exists: 'Cet email a déjà un compte. Connecte-toi.',
  email_exists: 'Cet email a déjà un compte. Connecte-toi.',
  weak_password: 'Mot de passe trop faible (8 caractères minimum, évite les mots de passe courants).',
  over_request_rate_limit: 'Trop de tentatives. Réessaie dans quelques minutes.',
  over_email_send_rate_limit: 'Trop de demandes. Réessaie dans quelques minutes.',
  otp_expired: 'Ce lien a expiré ou a déjà été utilisé. Redemande un nouvel email.',
  access_denied: 'Ce lien a expiré ou a déjà été utilisé. Redemande un nouvel email.',
  same_password: "Choisis un mot de passe différent de l'ancien.",
  signup_disabled: "Les inscriptions sont désactivées pour le moment.",
  email_address_not_authorized: "L'envoi d'emails n'est pas encore activé pour cette adresse. Contacte l'équipe InscriGab.",
  email_address_invalid: "Cette adresse email n'est pas valide. Vérifie-la.",
  validation_failed: "Vérifie ton email et ton mot de passe, puis réessaie.",
  unexpected_failure: "Le service d'envoi d'emails ne répond pas pour le moment. Réessaie dans quelques minutes ou contacte l'équipe InscriGab."
};
Object.assign(MESSAGES_ERREUR, {
  session_expiree: 'Ta session a expiré. Reconnecte-toi.',
  non_connecte: 'Ta session a expiré. Reconnecte-toi.',
  permission_refusee: "Tu n'as pas la permission pour cette action.",
  permission_insuffisante_gerer_inscriptions: "Tu n'as pas la permission de gérer les inscriptions.",
  permission_insuffisante_valider_paiements: "Tu n'as pas la permission de valider les paiements.",
  reserve_directeur: 'Cette action est réservée au directeur.',
  paiement_non_confirme: "Confirme d'abord le paiement avant de valider le dossier.",
  inscription_deja_traitee: 'Ce dossier a déjà été traité.',
  paiement_deja_traite: 'Ce paiement a déjà été traité.',
  ecole_non_autorisee: "Ce dossier n'appartient pas à ton école.",
  classe_existante: 'Cette classe existe déjà.',
  classe_non_vide: 'Impossible de supprimer une classe qui a des inscrits.',
  places_inferieures_aux_inscrits: 'Il y a déjà plus d\'inscrits que ce nombre de places.',
  places_invalides: 'Nombre de places invalide (1 à 500).',
  nom_classe_invalide: 'Nom de classe invalide.',
  captcha_invalide: "La vérification anti-robot a échoué. Réessaie.",
  captcha_indisponible: "La vérification anti-robot ne répond pas pour le moment. Réessaie dans quelques minutes.",
  captcha_non_configure: "L'inscription est momentanément indisponible. Contacte l'équipe InscriGab.",
  requete_trop_grande: "Ta demande est trop grande. Réduis le nombre d'enfants et réessaie.",
  module_invalide: 'Module inconnu.',
  module_non_active: "Ce module n'est pas activé pour ton école.",
  numero_ecole_manquant: "Cette école n'a pas encore renseigné son numéro Mobile Money. Contacte-la ou choisis un autre moyen de paiement.",
  ouverture_impossible_frais: "Fixe d'abord les frais d'inscription dans Paramètres avant d'ouvrir la session.",
  ouverture_impossible_classes: "Crée d'abord au moins une classe avant d'ouvrir la session.",
  ecole_refusee: "Ton école a été refusée par l'administration.",
  ecole_desactivee: "L'accès à cette école a été désactivé par l'administration InscriGab. Contacte le support pour demander sa réactivation.",
  ecole_archivee: "Cette école est archivée. Son accès est suspendu jusqu'à sa restauration par le Super Admin.",
  numero_invalide: 'Numéro invalide (8 à 20 chiffres, sans lettres).',
  frais_invalides: 'Montant invalide.',
  valeur_invalide: 'Une valeur est invalide. Vérifie les champs.',
  compte_deja_lie: 'Ce compte est déjà rattaché à une école.',
  infos_ecole_invalides: "Vérifie le nom de l'école et celui du directeur.",
  type_cas_invalide: 'Type de cas invalide (3 à 100 caractères).',
  description_invalide: 'Description trop courte (5 caractères minimum).',
  cas_deja_traite: 'Ce cas a déjà été traité.'
});
function messageAuth(d) {
  const code = (d && (d.error_code || d.code)) || '';
  if (MESSAGES_AUTH[code]) return MESSAGES_AUTH[code];
  const m = ((d && (d.msg || d.message || d.error_description)) || '').toLowerCase();
  if (m.includes('invalid login')) return MESSAGES_AUTH.invalid_credentials;
  if (m.includes('already registered')) return MESSAGES_AUTH.user_already_exists;
  if (m.includes('sending') || m.includes('smtp') || m.includes('could not send') || m.includes('error sending')) return MESSAGES_AUTH.unexpected_failure;
  if (m.includes('email address') && m.includes('invalid')) return MESSAGES_AUTH.email_address_invalid;
  return "Impossible de te connecter pour le moment. Réessaie.";
}
function lireSession() { try { return JSON.parse(localStorage.getItem(CLE_SESSION) || 'null'); } catch (e) { return null; } }
function ecrireSession(s) {
  if (!s) { localStorage.removeItem(CLE_SESSION); return; }
  localStorage.setItem(CLE_SESSION, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || (Math.floor(Date.now() / 1000) + (s.expires_in || 3600)) }));
}
async function appelAuth(chemin, corps, jeton, methode) {
  const m = methode || 'POST';
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/auth/v1/' + chemin, { method: m, headers: enteteSupabase(Object.assign(m === 'GET' ? {} : { 'Content-Type': 'application/json' }, jeton ? { Authorization: 'Bearer ' + jeton } : {})), body: m === 'GET' ? undefined : JSON.stringify(corps || {}) });
  } catch (e) { throw new Error('reseau'); }
  let d = null;
  try { d = await r.json(); } catch (e) { /* vide */ }
  if (!r.ok) { const err = new Error(messageAuth(d)); err.affichable = true; throw err; }
  return d;
}
async function jetonValide() {
  let s = lireSession();
  if (!s) return null;
  if (s.expires_at - Math.floor(Date.now() / 1000) < 60) {
    try { ecrireSession(await appelAuth('token?grant_type=refresh_token', { refresh_token: s.refresh_token })); s = lireSession(); }
    catch (e) { if (e.message === 'reseau') throw e; ecrireSession(null); return null; }
  }
  return s ? s.access_token : null;
}
async function rpcAuth(nom, args) {
  const jeton = await jetonValide();
  if (!jeton) { const err = new Error('session_expiree'); err.session = true; throw err; }
  let r;
  try {
    r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + nom, { method: 'POST', headers: enteteSupabase({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton }), body: JSON.stringify(args || {}) });
  } catch (e) { throw new Error('reseau'); }
  let d = null;
  try { d = await r.json(); } catch (e) { /* vide */ }
  if (!r.ok) {
    if (r.status === 401) { ecrireSession(null); const err = new Error('session_expiree'); err.session = true; throw err; }
    throw new Error((d && (d.message || d.error)) || 'erreur_' + r.status);
  }
  return d;
}
// Exécute une action ; en cas d'erreur affiche un message clair (et renvoie au login si la session a expiré)
async function agir(fn) {
  try { return await fn(); }
  catch (e) {
    if (e && e.session) { alert(messageErreur(e)); window.location.href = 'directeur.html'; return undefined; }
    alert(messageErreur(e)); return undefined;
  }
}
async function deconnecter(page) {
  const s = lireSession();
  try { if (s) await appelAuth('logout', {}, s.access_token); } catch (e) { /* on déconnecte quand même */ }
  ecrireSession(null);
  window.location.href = page || 'directeur.html';
}

// ---------- Outils communs aux pages de connexion (directeur et Super Admin) ----------
const URL_RETOUR = () => window.location.origin + '/directeur.html';
const URL_RETOUR_RECUP = () => window.location.origin + '/reset-password.html';
function lireRetourEmail() {
  const h = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const q = new URLSearchParams(window.location.search || '');
  const get = (k) => h.get(k) || q.get(k);
  if (!get('access_token') && !get('token_hash') && !get('code') && !get('error') && !get('error_code')) return null;
  return {
    access_token: get('access_token'), refresh_token: get('refresh_token'),
    token_hash: get('token_hash'), auth_code: get('code'),
    expires_in: parseInt(get('expires_in') || '3600', 10),
    type: get('type'), code: get('error_code') || get('error')
  };
}
function effacerHash() { try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* ignoré */ } }
function erreurAffichable(texte) { const e = new Error(texte); e.affichable = true; return e; }

// Crée l'école dans la base une fois le compte connecté
async function creerEcoleDepuis(d) {
  const id = await rpcAuth('creer_ecole', {
    p_nom: d.nom_ecole, p_type: d.type_ecole, p_ville: d.ville_ecole, p_nom_directeur: d.nom_directeur, p_telephone: d.telephone,
    p_numero_autorisation: d.numero_autorisation || null, p_niveaux: d.niveaux, p_max_par_classe: d.max,
    p_frais_inscription: d.frais_inscription, p_frais_dossier: d.frais_dossier, p_montant_mensuel: d.montant_mensuel,
    p_docs: d.docs, p_classes: classesDepuisNiveaux(d.niveaux, d.max).map((c) => ({ nom_classe: c.nom, places_max: c.max }))
  });
  const numeros = {};
  if (d.numero_airtel_money) numeros.numero_airtel_money = d.numero_airtel_money;
  if (d.numero_moov_money) numeros.numero_moov_money = d.numero_moov_money;
  if (Object.keys(numeros).length) { try { await rpcAuth('modifier_ecole', { p_donnees: numeros }); } catch (e) { /* le directeur pourra les ajouter dans Paramètres */ } }
  localStorage.removeItem(CLE_ECOLE_EN_ATTENTE);
  return id;
}
// Après une connexion : si le compte n'a pas encore d'école, on la crée avec les infos données à l'inscription
async function apresConnexion(utilisateur) {
  let s = await rpcAuth('ma_session');
  if (!s.role) {
    let d = utilisateur && utilisateur.user_metadata && utilisateur.user_metadata.ecole;
    if (!d) { try { d = JSON.parse(localStorage.getItem(CLE_ECOLE_EN_ATTENTE) || 'null'); } catch (e) { d = null; } }
    if (!d) { ecrireSession(null); throw erreurAffichable("Ce compte n'est rattaché à aucune école. Utilise le formulaire « Inscrire mon école »."); }
    await creerEcoleDepuis(d);
    s = await rpcAuth('ma_session');
  }
  return s;
}
const destinationPour = (s) => (s.role === 'super_admin' ? 'dashboardSuperadmin.html' : 'dashboard.html');

// L'utilisateur arrive depuis un lien reçu par email (confirmation d'inscription ou mot de passe oublié)
async function gererRetourEmail() {
  const r = lireRetourEmail();
  if (!r) return false;
  // Supabase peut livrer directement les jetons dans le fragment, ou un token_hash à vérifier.
  if (!r.access_token && r.token_hash) {
    try {
      const verifie = await appelAuth('verify', { token_hash: r.token_hash, type: r.type || 'recovery' });
      r.access_token = verifie.access_token;
      r.refresh_token = verifie.refresh_token;
      r.expires_in = verifie.expires_in || 3600;
      r.type = r.type || 'recovery';
    } catch (e) {
      effacerHash();
      history.replaceState(null, '', window.location.pathname);
      afficherErreurReinitialisation(messageErreur(e));
      return true;
    }
  }
  // Le flux PKCE nécessite le code_verifier généré au départ. Cette application utilise
  // le flux implicite par REST ; on affiche donc une erreur explicite si un code PKCE seul arrive.
  if (!r.access_token) {
    effacerHash();
    history.replaceState(null, '', window.location.pathname);
    afficherErreurReinitialisation(r.auth_code ? 'Le lien utilise un code de connexion qui ne peut pas être validé par cette version. Redemande un lien de réinitialisation.' : (MESSAGES_AUTH[r.code] || 'Ce lien est invalide ou a expiré. Redemande un nouvel email.'));
    return true;
  }
  effacerHash();
  history.replaceState(null, '', window.location.pathname);
  ecrireSession({ access_token: r.access_token, refresh_token: r.refresh_token, expires_in: r.expires_in });
  let utilisateur = null;
  try { utilisateur = await appelAuth('user', null, r.access_token, 'GET'); } catch (e) { /* message lors de l'enregistrement */ }
  if (r.type === 'recovery') { afficherNouveauMotDePasse(utilisateur); return true; }
  try { const s = await apresConnexion(utilisateur); window.location.href = destinationPour(s); }
  catch (e) { afficherErreurReinitialisation(messageErreur(e)); }
  return true;
}
function afficherErreurReinitialisation(message) {
  const zone = document.getElementById('etat-reinitialisation');
  if (zone) zone.textContent = message;
}
function afficherNouveauMotDePasse(utilisateur) {
  document.querySelectorAll('form').forEach((formulaire) => { formulaire.style.display = 'none'; });
  const f = document.getElementById('form-nouveau-mdp') || document.createElement('form');
  f.className = 'card'; f.id = 'form-nouveau-mdp';
  f.innerHTML = '<h2>Choisis ton nouveau mot de passe</h2><label>Nouveau mot de passe (8 caractères minimum)</label><input type="password" name="mdp1" autocomplete="new-password" minlength="8" required>' +
    '<label>Confirme le mot de passe</label><input type="password" name="mdp2" autocomplete="new-password" minlength="8" required><button type="submit" class="vert">Enregistrer mon nouveau mot de passe</button>';
  const h1 = document.querySelector('h1');
  if (!f.isConnected) { if (h1) h1.insertAdjacentElement('afterend', f); else document.body.prepend(f); }
  f.style.display = 'block';
  const zoneEtat = document.getElementById('etat-reinitialisation');
  if (zoneEtat) zoneEtat.textContent = 'Lien vérifié. Tu peux maintenant choisir ton nouveau mot de passe.';
  let enCours = false;
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enCours) return;
    if (f.elements['mdp1'].value !== f.elements['mdp2'].value) { alert('Les 2 mots de passe ne sont pas les mêmes'); return; }
    if (f.elements['mdp1'].value.length < 8) { alert('Mot de passe trop court : 8 caractères minimum'); return; }
    enCours = true;
    const deverrouiller = verrouiller(f.querySelector('button'), 'Enregistrement…');
    try {
      const jeton = await jetonValide();
      await appelAuth('user', { password: f.elements['mdp1'].value }, jeton, 'PUT');
      const s = await apresConnexion(utilisateur);
      alert('Mot de passe changé ✅');
      window.location.href = destinationPour(s);
    } catch (err) { alert(messageErreur(err)); enCours = false; deverrouiller(); }
  });
}
function ajouterOubliMotDePasse(formConn) {
  const p = document.createElement('p');
  p.innerHTML = '<small><a href="#" id="lien-oubli">Mot de passe oublié ?</a></small>';
  formConn.insertAdjacentElement('afterend', p);
  const f = document.createElement('form');
  f.id = 'form-oubli'; f.className = 'card'; f.style.display = 'none';
  f.innerHTML = '<h2>Mot de passe oublié</h2><label>Ton email</label><input type="email" name="email_oubli" required><button type="submit">Recevoir un email de réinitialisation</button>';
  p.insertAdjacentElement('afterend', f);
  p.querySelector('a').addEventListener('click', function (e) {
    e.preventDefault();
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
    const champ = formConn.querySelector('input[type=email]');
    if (champ && champ.value && !f.elements['email_oubli'].value) f.elements['email_oubli'].value = champ.value;
  });
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    const email = f.elements['email_oubli'].value.trim().toLowerCase();
    if (!email) return;
    const deverrouiller = verrouiller(f.querySelector('button'), 'Envoi…');
    try {
      await appelAuth('recover?redirect_to=' + encodeURIComponent(URL_RETOUR_RECUP()), { email: email });
      alert("Si un compte existe avec cet email, un message vient d'être envoyé. Clique sur le lien reçu (regarde aussi tes spams).");
    } catch (err) { alert(messageErreur(err)); }
    deverrouiller();
  });
}

// ---------- directeur.html : inscription de l'école + connexion ----------
function pageDirecteurAuth() {
  const formInsc = $('form-inscription-ecole');
  const formConn = $('form-connexion');
  if (!formInsc && !formConn) return;
  const msg = $('message-directeur');
  const info = (t) => { if (msg) msg.textContent = t; };
  gererRetourEmail().then(function (traite) {
    if (traite || !lireSession() || (window.location.search || '').includes('profil')) return;
    rpcAuth('ma_session').then((s) => { if (s && s.role) window.location.href = destinationPour(s); }).catch(() => { /* reste sur la page */ });
  });

  if (formInsc) {
    let enCours = false;
    formInsc.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (enCours) return;
      const v = (n) => (formInsc.elements[n] ? formInsc.elements[n].value.trim() : '');
      const mdp = formInsc.elements['mot_de_passe_inscription'].value;
      if (mdp !== formInsc.elements['confirmer_mot_de_passe'].value) { alert('Les 2 mots de passe ne sont pas les mêmes'); return; }
      if (mdp.length < 8) { alert('Mot de passe trop court : 8 caractères minimum'); return; }
      const niveaux = Array.from(formInsc.querySelectorAll('input[name="niveau"]:checked')).map((c) => c.value);
      if (!niveaux.length) { alert('Coche au moins un niveau'); return; }
      const donnees = {
        nom_directeur: v('nom_directeur'), nom_ecole: v('nom_ecole'), ville_ecole: v('ville_ecole'), type_ecole: v('type_ecole'),
        telephone: v('telephone_directeur'), numero_autorisation: v('numero_autorisation'), niveaux: niveaux,
        max: parseInt(v('nombre_max_eleves') || '30', 10), frais_inscription: parseInt(v('frais_inscription') || '0', 10),
        frais_dossier: parseInt(v('frais_dossier') || '0', 10), montant_mensuel: parseInt(v('montant_mensuel') || '0', 10),
        docs: Array.from(formInsc.querySelectorAll('input[name="doc_demande"]:checked')).map((c) => c.value),
        numero_airtel_money: v('numero_airtel_money'), numero_moov_money: v('numero_moov_money')
      };
      if (donnees.numero_airtel_money && operateurDuNumero(donnees.numero_airtel_money) !== 'airtel') { alert("Le numéro Airtel Money ne ressemble pas à un numéro Airtel."); return; }
      if (donnees.numero_moov_money && operateurDuNumero(donnees.numero_moov_money) !== 'moov') { alert("Le numéro Moov Money ne ressemble pas à un numéro Moov."); return; }
      if ((donnees.frais_inscription + donnees.frais_dossier) > 0 && !donnees.numero_airtel_money && !donnees.numero_moov_money) { alert("Mets au moins un numéro Mobile Money (Airtel ou Moov) : c'est là que les parents enverront les frais."); return; }
      enCours = true;
      const deverrouiller = verrouiller(formInsc.querySelector('button[type=submit]'), 'Création en cours…');
      try {
        const r = await appelAuth('signup?redirect_to=' + encodeURIComponent(URL_RETOUR()), { email: v('email_inscription').toLowerCase(), password: mdp, data: { ecole: donnees } });
        // Supabase répond « OK » même si l'email a déjà un compte, mais sans créer de compte : on le détecte ici
        if (r.identities && r.identities.length === 0) throw erreurAffichable('Cet email a déjà un compte. Connecte-toi, ou utilise « Mot de passe oublié ? ». Pour une nouvelle école, utilise une autre adresse email.');
        if (!r.access_token) {
          localStorage.setItem(CLE_ECOLE_EN_ATTENTE, JSON.stringify(donnees));
          info("Compte créé ✅ Un email de confirmation vient de t'être envoyé. Clique sur le lien qu'il contient : ton école sera créée et tu arriveras sur ton dashboard. Regarde aussi tes spams.");
          enCours = false; deverrouiller(); return;
        }
        ecrireSession(r);
        await creerEcoleDepuis(donnees);
        info('École créée ✅ Direction le dashboard…');
        setTimeout(function () { window.location.href = 'dashboard.html'; }, 600);
      } catch (err) {
        alert(messageErreur(err));
        enCours = false; deverrouiller();
      }
    });
  }

  if (formConn) {
    ajouterOubliMotDePasse(formConn);
    let enCours = false;
    formConn.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (enCours) return;
      enCours = true;
      const deverrouiller = verrouiller(formConn.querySelector('button[type=submit]') || formConn.querySelector('button'), 'Connexion…');
      try {
        const r = await appelAuth('token?grant_type=password', { email: formConn.elements['email_connexion'].value.trim().toLowerCase(), password: formConn.elements['mot_de_passe_connexion'].value });
        ecrireSession(r);
        const s = await apresConnexion(r.user);
        window.location.href = destinationPour(s);
      } catch (err) {
        alert(messageErreur(err));
        enCours = false; deverrouiller();
      }
    });
  }
}

// ---------- Contexte commun aux pages directeur ----------
let CTX = null;
const peut = (p) => !!(CTX && CTX.permissions && CTX.permissions.includes(p));
async function initDirecteur() {
  const ids = ['dashboard-ecole', 'page-eleves', 'page-dossiers', 'page-paiements', 'page-classes', 'page-parametres', 'page-fiche-eleve', 'page-mon-abonnement'];
  if (!ids.some((id) => $(id))) return;
  try { CTX = await rpcAuth('ma_session'); }
  catch (e) {
    if (e && e.session) { window.location.href = 'directeur.html'; return; }
    if (e && (String(e.message || '').includes('ecole_desactivee') || String(e.message || '').includes('ecole_archivee'))) {
      ecrireSession(null);
      document.body.innerHTML = '<main class="contenu" style="max-width:720px;margin:48px auto;padding:24px"><h1>Accès à l’école suspendu</h1><p>' + esc(messageErreur(e)) + '</p><p><a href="directeur.html">Retour à la connexion</a></p></main>';
      return;
    }
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#b91c1c">' + esc(messageErreur(e)) + ' <a href="javascript:location.reload()">Réessayer</a></p>');
    return;
  }
  if (!CTX || !CTX.role || !CTX.ecole) { alert("Ce compte n'est rattaché à aucune école."); ecrireSession(null); window.location.href = 'directeur.html'; return; }
  const nom = document.querySelector('.sidebar .ecole-nom');
  if (nom) nom.innerHTML = esc(CTX.ecole.nom) + '<br><small>' + (CTX.role === 'directeur' ? 'Directeur' : 'Secrétaire') + '</small>';
  const pied = document.querySelector('.sidebar p small');
  if (pied) pied.textContent = (CTX.nom || '') + ' - ' + (CTX.role === 'directeur' ? 'Directeur' : 'Secrétaire');
  const h1 = document.querySelector('main h1');
  if (h1 && h1.textContent.includes('Lycée Léon Mba')) h1.textContent = h1.textContent.replace('Lycée Léon Mba', CTX.ecole.nom);
  const btnDeco = $('btn-deconnexion');
  if (btnDeco) btnDeco.addEventListener('click', function () { deconnecter('directeur.html'); });
  const f = { dashboard: pageDashboardSb, eleves: pageElevesSb, dossiers: pageDossiersSb, paiements: pagePaiementsSb, classes: pageClassesSb, parametres: pageParametresSb, fiche: pageFicheSb, abonnement: pageMonAbonnement };
  for (const k in f) { try { await f[k](); } catch (e) { if (e && e.session) { window.location.href = 'directeur.html'; return; } console.error(e); } }
}
async function chargerDossiers() { return await rpcAuth('dossiers_ecole'); }
function nomComplet(d) { return d.eleve.nom.toUpperCase() + ' ' + d.eleve.prenom; }
function lienDossier(d) { return 'fiche-eleve.html?id=' + d.id; }
function problemeDossierSb(d) {
  if (d.cas_speciaux_ouverts > 0) return { txt: 'Cas spécial', cle: 'cas', cls: 'badge-special' };
  const req = (CTX.ecole.docs_demandes || []);
  const have = (d.documents || []).map((x) => x.type);
  if (req.some((t) => !have.includes(t))) return { txt: 'Document manquant', cle: 'doc', cls: 'badge-attente' };
  if (!peut('consulter_paiements')) return { txt: 'À examiner', cle: 'pret', cls: 'badge-attente' };
  if (!d.paiement) return { txt: 'Paiement incomplet', cle: 'paiement', cls: 'badge-special' };
  if (d.paiement.statut !== 'paye') return { txt: 'Paiement à vérifier', cle: 'verif', cls: 'badge-attente' };
  return { txt: 'Prêt à valider', cle: 'pret', cls: 'badge-valide' };
}
function ligneVide(corps, n, texte) { corps.insertAdjacentHTML('beforeend', '<tr><td colspan="' + n + '">' + texte + '</td></tr>'); }

// ---------- mon-abonnement.html : espace Directeur ----------
async function pageMonAbonnement() {
  const main = $('page-mon-abonnement');
  if (!main) return;
  if (CTX.role !== 'directeur') {
    main.innerHTML = '<h1>Mon abonnement InscriGab</h1><p>Seul le Directeur peut consulter et régler l’abonnement de l’établissement.</p>';
    return;
  }
  const data = await rpcAuth('ma_abonnement');
  const a = data && data.abonnement;
  const methode = (m) => m === 'airtel_money' ? 'Airtel Money' : (m === 'moov_money' ? 'Moov Money' : m);
  const date = (v) => v ? new Date(v + 'T00:00:00').toLocaleDateString('fr-FR') : '—';
  const statut = (v) => {
    const cls = v === 'actif' || v === 'paye' ? 'badge-valide' : (v === 'expire' || v === 'echec' ? 'badge-special' : 'badge-attente');
    return '<span class="badge ' + cls + '">' + esc(v || '—') + '</span>';
  };
  const historique = (data.paiements || []).map((p) => '<tr><td>' + esc(p.reference) + '</td><td>' + fcfa(p.montant) + '</td><td>' + esc(methode(p.methode)) + '</td><td>' + statut(p.statut) + '</td><td>' + (p.paye_le ? new Date(p.paye_le).toLocaleString('fr-FR') : date(p.initie_le && p.initie_le.slice(0,10))) + '</td></tr>').join('');
  const abonnementPayant = !!(a && a.plan !== 'gratuit' && Number(a.montant) > 0);
  const blocPaiement = abonnementPayant ? '<div class="card"><h2>Régler mon abonnement</h2>' +
      '<p>Les paiements d’abonnement seront encaissés par BANAKISSA / InscriGab via un compte marchand sécurisé.</p>' +
      '<div class="kpi-grid"><div class="kpi kpi-vert"><small>MOYEN PRÉVU</small><b>Airtel Money</b></div><div class="kpi kpi-bleu"><small>MOYEN PRÉVU</small><b>Moov Money</b></div></div>' +
      '<p><span class="badge badge-attente">Configuration du compte marchand requise</span></p>' +
      '<p>Les paiements en ligne seront activés après la connexion du prestataire et la vérification automatique des transactions. Aucun paiement ne sera déclaré payé sur la seule base d’une capture ou d’une saisie manuelle.</p>' +
      '<button type="button" disabled aria-disabled="true">Airtel Money — bientôt disponible</button> ' +
      '<button type="button" disabled aria-disabled="true">Moov Money — bientôt disponible</button></div>' : '<div class="card"><h2>Votre formule</h2><p>Votre établissement est actuellement sur la formule gratuite. Aucun paiement d’abonnement n’est à effectuer pour le moment.</p></div>' ;
  main.innerHTML = '<h1>Mon abonnement InscriGab</h1>' +
    '<p>Établissement : <b>' + esc(data.ecole || CTX.ecole.nom) + '</b></p>' +
    (a ? '<div class="kpi-grid"><div class="kpi kpi-bleu"><small>FORMULE ACTUELLE</small><b>' + esc(a.plan) + '</b></div>' +
      '<div class="kpi kpi-vert"><small>MONTANT DE L’ABONNEMENT</small><b>' + fcfa(a.montant) + '</b></div>' +
      '<div class="kpi kpi-orange"><small>STATUT</small><b>' + statut(a.statut) + '</b></div></div>' +
      '<p><b>Début :</b> ' + date(a.date_debut) + ' &nbsp; <b>Échéance :</b> ' + date(a.date_fin) + '</p>' : '<p>Aucun abonnement n’est encore associé à cet établissement. Contacte InscriGab pour définir la formule.</p>') +
    blocPaiement +
    '<h2>Historique des paiements d’abonnement</h2>' +
    '<table><thead><tr><th>RÉFÉRENCE</th><th>MONTANT</th><th>MOYEN</th><th>STATUT</th><th>DATE</th></tr></thead><tbody>' +
      (historique || '<tr><td colspan="5">Aucun paiement d’abonnement enregistré.</td></tr>') +
    '</tbody></table>';
}

// ---------- dashboard.html ----------
async function pageDashboardSb() {
  if (!$('dashboard-ecole')) return;
  const set = (id, txt) => { if ($(id)) $(id).textContent = txt; };
  const e = CTX.ecole;
  set('nom-ecole-menu', e.nom); set('nom-ecole-tableau', e.nom); set('nom-directeur-menu', CTX.nom);
  set('bonjour-directeur', 'Bonjour ' + CTX.nom); set('info-ecole', e.nom + ' - ' + e.ville);
  const majSession = () => {
    set('statut-session', 'Session : ' + (e.session_ouverte ? 'OUVERTE ✅' : 'FERMÉE 🔒') + (e.validation === 'refuse' ? ' (école refusée)' : (e.validation !== 'valide' ? ' (en attente de validation par InscriGab : les parents ne te voient pas encore)' : '')));
    set('btn-session', e.session_ouverte ? "Fermer la session d'inscription" : "Ouvrir la session d'inscription");
  };
  majSession();
  if ($('btn-session')) {
    if (CTX.role !== 'directeur') $('btn-session').style.display = 'none';
    $('btn-session').addEventListener('click', function () {
      agir(async function () {
        if (!e.session_ouverte) {
          const classes = await rpcAuth('classes_ecole');
          if (!classes.length) { alert(MESSAGES_ERREUR.ouverture_impossible_classes); return; }
          const liste = classes.map(function (c) { return '• ' + c.nom_classe + ' : ' + Math.max(c.places_max - c.inscrits, 0) + ' place(s) sur ' + c.places_max; }).join('\n');
          if (!confirm('Les parents pourront choisir seulement ces classes :\n\n' + liste + '\n\nToutes tes classes sont-elles bien créées, avec les bonnes places ? Sinon, ajoute-les d\'abord dans « Classes ».\n\nOuvrir la session ?')) return;
        }
        await rpcAuth('modifier_ecole', { p_donnees: { session_ouverte: !e.session_ouverte } });
        e.session_ouverte = !e.session_ouverte; majSession();
      });
    });
  }
  if (!peut('consulter_inscriptions')) { set('total-inscrits', '—'); set('dossiers-attente', '—'); return; }
  let dossiers;
  try { dossiers = await chargerDossiers(); } catch (err) { if (err.session) throw err; alert(messageErreur(err)); return; }
  const auj = new Date().toISOString().slice(0, 10);
  const actifs = dossiers.filter((d) => d.statut !== 'refuse');
  set('total-inscrits', actifs.length);
  set('inscrits-aujourdhui', '+ ' + dossiers.filter((d) => d.date_inscription === auj).length + " aujourd'hui");
  set('dossiers-attente', dossiers.filter((d) => d.statut === 'en_attente').length);
  if (peut('consulter_paiements')) {
    const payes = dossiers.filter((d) => d.paiement && d.paiement.statut === 'paye' && (d.paiement.paye_le || '').slice(0, 10) === auj);
    set('recettes', fcfa(payes.reduce((s, d) => s + Number(d.paiement.montant || 0), 0)));
    set('nb-paiements', '+ ' + payes.length + ' paiements');
  } else { set('recettes', '—'); set('nb-paiements', ''); }
  const corps = $('corps-tableau');
  if (corps) {
    corps.innerHTML = '';
    const derniers = dossiers.slice(0, 10);
    if ($('message-vide')) $('message-vide').style.display = derniers.length === 0 ? 'block' : 'none';
    derniers.forEach((d) => corps.insertAdjacentHTML('beforeend', '<tr><td>' + esc(d.eleve.nom) + '</td><td>' + esc(d.eleve.prenom) + '</td><td>' + esc(d.classe.nom) + '</td><td>' + badgeStatut(d.statut) + '</td><td><a href="' + lienDossier(d) + '">Voir →</a></td></tr>'));
  }
}

// ---------- eleves.html ----------
async function pageElevesSb() {
  const main = $('page-eleves');
  if (!main) return;
  if (!peut('consulter_inscriptions')) { main.innerHTML = "<h1>Élèves</h1><p>Tu n'as pas la permission de consulter les inscriptions.</p>"; return; }
  const rows = await chargerDossiers();
  const recherche = main.querySelector('.card input[type=text]');
  const selects = main.querySelectorAll('.card select');
  const noms = Array.from(new Set(rows.map((d) => d.classe.nom))).sort();
  selects[0].innerHTML = '<option value="">Toutes les classes</option>' + noms.map((n) => '<option>' + esc(n) + '</option>').join('');
  selects[1].innerHTML = '<option value="">Tous les statuts</option><option value="valide">Validé</option><option value="en_attente">En attente</option><option value="refuse">Refusé</option>';
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');
  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((d) => (!selects[0].value || d.classe.nom === selects[0].value) && (!selects[1].value || d.statut === selects[1].value) && (!q || (d.eleve.nom + ' ' + d.eleve.prenom + ' ' + d.classe.nom).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((d) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(d.eleve.nom.toUpperCase()) + '</b></td><td>' + esc(d.eleve.prenom) + '</td><td>' + esc(d.classe.nom) + '</td><td>' + badgeStatut(d.statut) + '</td><td><a href="' + lienDossier(d) + '">Voir →</a></td></tr>'));
    if (!filtres.length) ligneVide(corps, 5, 'Aucun élève trouvé.');
    if (compteur) compteur.textContent = filtres.length + ' élève(s) affiché(s) sur ' + rows.length;
  }
  [recherche, selects[0], selects[1]].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- dossiers.html ----------
async function pageDossiersSb() {
  const main = $('page-dossiers');
  if (!main) return;
  if (!peut('consulter_inscriptions')) { main.innerHTML = "<h1>Dossiers</h1><p>Tu n'as pas la permission de consulter les inscriptions.</p>"; return; }
  const rows = (await chargerDossiers()).filter((d) => d.statut === 'en_attente');
  const sel = main.querySelector('.card select');
  const recherche = main.querySelector('.card input[type=text]');
  sel.innerHTML = '<option value="">Tous les dossiers</option><option value="cas">Cas spécial</option><option value="doc">Document manquant</option><option value="paiement">Paiement incomplet</option><option value="verif">Paiement à vérifier</option><option value="pret">Prêt à valider</option>';
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');
  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((d) => (!sel.value || problemeDossierSb(d).cle === sel.value) && (!q || (d.eleve.nom + ' ' + d.eleve.prenom + ' ' + d.classe.nom).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((d) => {
      const p = problemeDossierSb(d);
      corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(nomComplet(d)) + '</b></td><td>' + esc(d.classe.nom) + '</td><td><span class="badge ' + p.cls + '">' + p.txt + '</span></td><td>' + depuis(d.date_inscription) + '</td><td><a href="' + lienDossier(d) + '">Traiter →</a></td></tr>');
    });
    if (!filtres.length) ligneVide(corps, 5, 'Aucun dossier à traiter 🎉');
    if (compteur) compteur.textContent = rows.length + ' dossier(s) en attente';
  }
  [recherche, sel].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- paiements.html ----------
async function pagePaiementsSb() {
  const main = $('page-paiements');
  if (!main) return;
  if (!peut('consulter_paiements')) { main.innerHTML = "<h1>Paiements</h1><p>Tu n'as pas la permission de consulter les paiements.</p>"; return; }
  const rows = (await chargerDossiers()).filter((d) => d.statut !== 'refuse').map((d) => {
    const paye = d.paiement && d.paiement.statut === 'paye' ? Number(d.paiement.montant || d.frais) : 0;
    const etat = paye > 0 ? 'paye' : (d.paiement && d.paiement.statut !== 'refuse' ? 'verif' : 'rien');
    return { d: d, paye: paye, reste: Math.max(Number(d.frais) - paye, 0), etat: etat };
  });
  const cartes = main.querySelectorAll('.chiffre h2');
  if (cartes.length >= 3) {
    cartes[0].textContent = fcfa(rows.reduce((s, x) => s + x.paye, 0));
    cartes[1].textContent = fcfa(rows.reduce((s, x) => s + x.reste, 0));
    cartes[2].textContent = rows.filter((x) => x.etat === 'paye').length + ' / ' + rows.length;
  }
  const sel = main.querySelector('.card select');
  const recherche = main.querySelector('.card input[type=text]');
  sel.innerHTML = '<option value="">Tous les paiements</option><option value="paye">Payé</option><option value="verif">À vérifier</option><option value="rien">Rien payé</option>';
  const table = main.querySelector('table');
  const etiquettes = { paye: '<span class="badge badge-valide">Payé</span>', verif: '<span class="badge badge-attente">À vérifier</span>', rien: '<span class="badge badge-special">Rien payé</span>' };
  function afficher() {
    const q = recherche.value.trim().toLowerCase();
    const filtres = rows.filter((x) => (!sel.value || x.etat === sel.value) && (!q || (x.d.eleve.nom + ' ' + x.d.eleve.prenom).toLowerCase().includes(q)));
    const corps = viderTableau(table);
    filtres.forEach((x) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(nomComplet(x.d)) + '</b></td><td>' + esc(x.d.classe.nom) + '</td><td>' + Number(x.d.frais).toLocaleString('fr-FR') + '</td><td>' + x.paye.toLocaleString('fr-FR') + '</td><td>' + x.reste.toLocaleString('fr-FR') + '</td><td>' + etiquettes[x.etat] + (x.etat === 'verif' ? ' <a href="' + lienDossier(x.d) + '">Confirmer →</a>' : '') + '</td></tr>'));
    if (!filtres.length) ligneVide(corps, 6, 'Aucun paiement.');
  }
  [recherche, sel].forEach((el) => el.addEventListener('input', afficher));
  afficher();
}

// ---------- classes.html ----------
async function pageClassesSb() {
  const main = $('page-classes');
  if (!main) return;
  const table = main.querySelector('table');
  const compteur = main.querySelector('h1 + p');
  async function afficher() {
    const classes = await rpcAuth('classes_ecole');
    const corps = viderTableau(table);
    classes.forEach((c) => {
      const reste = Math.max(c.places_max - c.inscrits, 0);
      const badge = reste === 0 ? '<span class="badge badge-special">Pleine</span>' : (reste <= 3 ? '<span class="badge badge-attente">Presque pleine</span>' : '<span class="badge badge-valide">Ouverte</span>');
      corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(c.nom_classe) + '</b></td><td>' + c.inscrits + '</td><td>' + c.places_max + '</td><td>' + reste + '</td><td>' + badge + '</td><td><a href="eleves.html">Voir élèves →</a>' + (peut('gerer_classes') && c.inscrits === 0 ? ' <a href="#" data-supp="' + c.id + '">Supprimer</a>' : '') + '</td></tr>');
    });
    if (!classes.length) ligneVide(corps, 6, "Aucune classe. Crée ta première classe ci-dessous.");
    if (compteur) compteur.textContent = classes.length + ' classes - ' + classes.reduce((s, c) => s + c.inscrits, 0) + ' élèves';
  }
  await afficher();
  table.addEventListener('click', function (ev) {
    const a = ev.target.closest('a[data-supp]');
    if (!a) return;
    ev.preventDefault();
    if (!confirm('Supprimer cette classe ?')) return;
    agir(async function () { await rpcAuth('supprimer_classe', { p_id: Number(a.getAttribute('data-supp')) }); await afficher(); });
  });
  const carte = main.querySelector('.card');
  const inputs = main.querySelectorAll('.card input');
  const bouton = main.querySelector('.card button');
  if (!peut('gerer_classes')) { if (carte) carte.style.display = 'none'; return; }
  if (bouton) bouton.addEventListener('click', function () {
    const nom = inputs[0].value.trim();
    const places = parseInt(inputs[1].value, 10);
    if (!nom || !places || places < 1) { alert('Mets un nom et un nombre de places'); return; }
    agir(async function () { await rpcAuth('enregistrer_classe', { p_id: null, p_nom: nom, p_places: places, p_frais: null }); inputs[0].value = ''; inputs[1].value = ''; await afficher(); });
  });
}

// ---------- parametres.html ----------
async function pageParametresSb() {
  const main = $('page-parametres');
  if (!main) return;
  if (CTX.role !== 'directeur') { main.innerHTML = '<h1>Paramètres</h1><p>Seul le directeur peut modifier les paramètres de l\'école.</p>'; return; }
  const e = CTX.ecole;
  const coche = (k) => ((e.docs_demandes || []).includes(k) ? ' checked' : '');
  const val = (x) => esc(x == null ? '' : x);
  main.innerHTML =
    '<h1>Paramètres de l\'école</h1><p>Seul le Directeur peut changer ça.</p><div class="card" id="carte-mes-modules"></div><form id="form-parametres">' +
    '<div class="card"><h2 style="text-align:left;">1. Mon école</h2><label>Nom de l\'école</label><input type="text" name="nom" value="' + val(e.nom) + '" required maxlength="150">' +
    '<label>Ville</label><input type="text" name="ville" value="' + val(e.ville) + '" maxlength="100"><label>Nom du directeur</label><input type="text" name="nom_directeur" value="' + val(e.nom_directeur) + '" maxlength="100">' +
    '<label>Téléphone</label><input type="tel" name="telephone_directeur" value="' + val(e.telephone_directeur) + '" maxlength="30"></div>' +
    '<div class="card"><h2 style="text-align:left;">2. Frais (FCFA)</h2><label>Frais d\'inscription</label><input type="number" name="frais_inscription" min="0" value="' + val(e.frais_inscription) + '">' +
    '<label>Frais de dossier</label><input type="number" name="frais_dossier" min="0" value="' + val(e.frais_dossier) + '"><label>Montant mensuel</label><input type="number" name="montant_mensuel" min="0" value="' + val(e.montant_mensuel) + '"></div>' +
    '<div class="card"><h2 style="text-align:left;">3. Où les parents déposent l\'argent</h2><p style="text-align:left;">Les numéros Mobile Money de l\'école. Les parents les voient au moment de payer.</p>' +
    '<label>Numéro Airtel Money</label><input type="tel" name="numero_airtel_money" placeholder="Ex : 074 00 00 00" value="' + val(e.numero_airtel_money) + '">' +
    '<label>Numéro Moov Money</label><input type="tel" name="numero_moov_money" placeholder="Ex : 062 00 00 00" value="' + val(e.numero_moov_money) + '"></div>' +
    '<div class="card"><h2 style="text-align:left;">4. Documents obligatoires</h2><p style="text-align:left;">' + DOCS.map((d) => '<input type="checkbox" name="doc" value="' + d[0] + '"' + coche(d[0]) + '> ' + d[1] + '<br>').join('') + '</p>' +
    '<button class="vert" type="submit" style="margin-top:10px;">Enregistrer mes changements</button><p id="message-parametres"></p></div></form>' +
    '<div class="card" id="carte-retrait"></div>';
  carteMesModules();
  carteRetraitEcole();
  $('form-parametres').addEventListener('submit', function (ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const n = (k) => (f[k].value === '' ? 0 : parseInt(f[k].value, 10));
    agir(async function () {
      const donnees = {
        nom: f['nom'].value, ville: f['ville'].value, nom_directeur: f['nom_directeur'].value, telephone_directeur: f['telephone_directeur'].value,
        frais_inscription: n('frais_inscription'), frais_dossier: n('frais_dossier'), montant_mensuel: n('montant_mensuel'),
        numero_airtel_money: f['numero_airtel_money'].value, numero_moov_money: f['numero_moov_money'].value,
        docs_demandes: Array.from(ev.target.querySelectorAll('input[name="doc"]:checked')).map((c) => c.value)
      };
      await rpcAuth('modifier_ecole', { p_donnees: donnees });
      CTX = await rpcAuth('ma_session');
      $('message-parametres').textContent = 'Changements enregistrés ✅';
    });
  });
}

// ---------- Mes modules (directeur) : toujours visibles, activables ou désactivables ----------
async function carteMesModules() {
  const zone = $('carte-mes-modules');
  if (!zone) return;
  let m;
  try { m = await rpcAuth('mes_modules'); }
  catch (err) { if (err.session) throw err; zone.innerHTML = '<h2 style="text-align:left;">Mes modules</h2><p>' + esc(messageErreur(err)) + '</p>'; return; }
  const bloc = (cle, titre, texte) =>
    '<div style="text-align:left;margin-bottom:14px;"><b>' + titre + '</b> ' +
    (m[cle] ? '<span class="badge badge-valide">Activé</span>' : '<span class="badge">Non activé</span>') +
    '<br><small>' + texte + '</small><br><button type="button" data-module="' + cle + '" data-actif="' + (m[cle] ? 'non' : 'oui') + '">' + (m[cle] ? 'Désactiver' : 'Activer') + '</button></div>';
  zone.innerHTML = '<h2 style="text-align:left;">Mes modules</h2>' +
    '<div style="text-align:left;margin-bottom:14px;"><b>Inscription</b> <span class="badge badge-valide">Toujours inclus</span><br><small>Les parents inscrivent leurs enfants en ligne.</small></div>' +
    bloc('finance', 'Gestion financière', 'Scolarités, reçus, relances, dépenses et bilan.') +
    bloc('notes', 'Notes et bulletins', 'Saisie des notes et bulletins par trimestre.') +
    '<p style="text-align:left;"><small>Tu peux activer ou désactiver un module quand tu veux. Désactiver ne supprime aucune donnée.</small></p>';
  zone.querySelectorAll('button[data-module]').forEach((b) => b.addEventListener('click', function () {
    const activer = b.getAttribute('data-actif') === 'oui';
    const nom = b.getAttribute('data-module') === 'finance' ? 'la gestion financière' : 'les notes et bulletins';
    if (!confirm((activer ? 'Activer ' : 'Désactiver ') + nom + ' ?')) return;
    agir(async function () { await rpcAuth('modifier_mon_module', { p_module: b.getAttribute('data-module'), p_actif: activer }); await carteMesModules(); });
  }));
}

// ---------- Demande de retrait de l'école (directeur) ----------
async function carteRetraitEcole() {
  const zone = $('carte-retrait');
  if (!zone) return;
  const titre = '<h2 style="text-align:left;">5. Retirer mon école de la plateforme</h2>';
  const jour = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR') : '');
  let d = null;
  try { d = await rpcAuth('ma_demande_retrait'); } catch (e) { d = null; }
  if (d && d.statut === 'en_attente') {
    zone.innerHTML = titre + '<p style="text-align:left;">Demande envoyée le ' + jour(d.created_at) + '. Elle attend la validation de l\'administrateur InscriGab. Ton école reste active en attendant.</p>' +
      (d.motif ? '<p style="text-align:left;"><small>Ton message : ' + esc(d.motif) + '</small></p>' : '') +
      '<button type="button" id="btn-annuler-retrait">Annuler ma demande</button>';
    $('btn-annuler-retrait').addEventListener('click', function () {
      if (!confirm('Annuler ta demande de retrait ?')) return;
      agir(async function () { await rpcAuth('annuler_demande_retrait'); await carteRetraitEcole(); });
    });
    return;
  }
  const refus = d && d.statut === 'refusee' ? '<p style="text-align:left;"><b>Ta dernière demande a été refusée</b>' + (d.reponse ? ' : ' + esc(d.reponse) : '.') + '</p>' : '';
  zone.innerHTML = titre + refus +
    '<p style="text-align:left;">Si tu veux quitter la plateforme, envoie une demande à l\'administrateur. Rien n\'est supprimé tant qu\'il ne l\'a pas acceptée. Une fois acceptée, ton école n\'apparaît plus aux parents et tu n\'as plus accès à ton espace ; les données sont conservées.</p>' +
    '<label>Pourquoi veux-tu partir ? (facultatif)</label><input type="text" id="retrait-motif" maxlength="500" placeholder="Ex : l\'école ferme, changement de système…">' +
    '<button type="button" id="btn-retrait" style="margin-top:10px;background:#ff4444;color:white;">Demander le retrait de mon école</button>';
  $('btn-retrait').addEventListener('click', function () {
    if (!confirm('Envoyer la demande de retrait de ton école ? L\'administrateur devra l\'accepter.')) return;
    agir(async function () { await rpcAuth('demander_retrait_ecole', { p_motif: $('retrait-motif').value.trim() || null }); await carteRetraitEcole(); });
  });
}

// ---------- fiche-eleve.html?id=... ----------
async function ouvrirDocument(chemin) {
  const w = window.open('', '_blank');
  try {
    const jeton = await jetonValide();
    const r = await fetch(SUPABASE_URL + '/storage/v1/object/sign/documents/' + chemin.split('/').map(encodeURIComponent).join('/'), { method: 'POST', headers: enteteSupabase({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + jeton }), body: JSON.stringify({ expiresIn: 300 }) });
    const d = await r.json();
    if (!r.ok || !d.signedURL) throw new Error('introuvable');
    if (w) w.location.href = SUPABASE_URL + '/storage/v1' + d.signedURL; else window.location.href = SUPABASE_URL + '/storage/v1' + d.signedURL;
  } catch (e) { if (w) w.close(); alert("Impossible d'ouvrir ce document."); }
}
async function pageFicheSb() {
  const main = $('page-fiche-eleve');
  if (!main) return;
  if (!peut('consulter_inscriptions')) { main.innerHTML = "<h1>Fiche élève</h1><p>Tu n'as pas la permission de consulter les inscriptions.</p>"; return; }
  const id = parseInt(new URLSearchParams(window.location.search).get('id') || '0', 10);
  const d = (await chargerDossiers()).find((x) => x.id === id);
  if (!d) { main.innerHTML = '<p><a href="eleves.html">← Retour aux élèves</a></p><h1>Dossier introuvable</h1>'; return; }
  let cas = [];
  try { cas = await rpcAuth('lister_cas_speciaux', { p_inscription_id: id, p_statut: null }); } catch (e) { cas = []; }
  const req = CTX.ecole.docs_demandes || [];
  const recus = {};
  (d.documents || []).forEach((x) => { recus[x.type] = x; });
  const lignesDocs = DOCS.map((t) => {
    const doc = recus[t[0]];
    const badge = doc ? '<span class="badge badge-valide">Reçu</span>' : (req.includes(t[0]) ? '<span class="badge badge-attente">Manquant</span>' : '<span class="badge">Non demandé</span>');
    const voir = doc && doc.chemin ? ' <a href="#" data-doc="' + esc(doc.chemin) + '">Voir</a>' : '';
    return '<tr><td>' + t[1] + '</td><td>' + badge + voir + '</td></tr>';
  }).join('');
  const p = d.paiement;
  const textePaiement = !peut('consulter_paiements') ? 'Tu n\'as pas accès aux paiements.' : (!p ? 'Aucun paiement déclaré.' :
    (p.statut === 'paye' ? 'Payé ✅' : (p.statut === 'refuse' ? 'Refusé ❌' : 'À vérifier ⏳')) + ' - ' + fcfa(p.montant) + ' (' + esc(p.methode) + ')' + (p.telephone ? '<br>Numéro qui a payé : <b>' + esc(p.telephone) + '</b>' : '') + (p.nom_compte ? '<br>Nom du compte : <b>' + esc(p.nom_compte) + '</b>' : ''));
  const aTraiter = p && ['en_attente', 'en_verification'].includes(p.statut) && peut('valider_paiements');
  const dossierOuvert = d.statut === 'en_attente' && peut('gerer_inscriptions');
  const lignesCas = cas.map((c) => '<p style="text-align:left;"><b>' + esc(c.type_cas) + '</b> - ' + esc(c.statut) + '<br>' + esc(c.description) + (c.commentaire_traitement ? '<br><i>' + esc(c.commentaire_traitement) + '</i>' : '') +
    (peut('traiter_cas_special') && ['en_attente', 'en_cours'].includes(c.statut) ? '<br><button type="button" data-cas="' + c.id + '" data-dec="accepte" class="vert">Accepter</button> <button type="button" data-cas="' + c.id + '" data-dec="refuse">Refuser</button>' : '') + '</p>').join('');
  main.innerHTML =
    '<p><a href="eleves.html">← Retour aux élèves</a></p><h1>' + esc(nomComplet(d)) + '</h1><p>' + esc(d.classe.nom) + ' - ' + esc(CTX.ecole.nom) + ' - ' + badgeStatut(d.statut) + '</p>' +
    '<div class="card"><h2 style="text-align:left;">Infos élève</h2><p style="text-align:left;"><b>Nom :</b> ' + esc(d.eleve.nom) + '<br><b>Prénom :</b> ' + esc(d.eleve.prenom) + '<br><b>Date de naissance :</b> ' + esc(d.eleve.date_naissance) + '<br><b>Genre :</b> ' + esc(d.eleve.sexe || '—') + '<br><b>Année scolaire :</b> ' + esc(d.annee_scolaire || '—') + '</p></div>' +
    '<div class="card"><h2 style="text-align:left;">Parent / Tuteur</h2><p style="text-align:left;"><b>Nom :</b> ' + esc(d.parent.nom) + '<br><b>Téléphone :</b> ' + esc(d.parent.telephone) + '</p><a href="tel:' + esc(d.parent.telephone) + '"><button type="button" style="margin-top:10px;">Appeler le parent</button></a></div>' +
    '<div class="card"><h2 style="text-align:left;">Documents</h2><table><tr><th>DOCUMENT</th><th>STATUT</th></tr>' + lignesDocs + '</table></div>' +
    '<div class="card"><h2 style="text-align:left;">Paiement</h2><p style="text-align:left;">À payer : ' + fcfa(d.frais) + '<br>' + textePaiement + '</p>' +
    (aTraiter ? '<p style="text-align:left;"><small>Compare le numéro, le nom du compte et le montant avec ton relevé Mobile Money avant de confirmer.</small></p><button type="button" id="btn-paiement-recu" class="vert">Confirmer : argent reçu</button> <button type="button" id="btn-paiement-refuse">Refuser le paiement</button>' : '') + '</div>' +
    '<div class="card"><h2 style="text-align:left;">Cas spéciaux</h2>' + (lignesCas || '<p style="text-align:left;">Aucun cas spécial.</p>') +
    (peut('declarer_cas_special') ? '<details><summary>Déclarer un cas spécial</summary><label>Type</label><input type="text" id="cas-type" maxlength="100" placeholder="Ex : Redoublement, transfert…"><label>Description</label><input type="text" id="cas-desc" maxlength="500" placeholder="Explique la situation"><button type="button" id="btn-cas">Déclarer</button></details>' : '') + '</div>' +
    (dossierOuvert ? '<div class="card"><h2 style="text-align:left;">Décision</h2><button type="button" id="btn-valider" class="vert">Valider le dossier</button> <button type="button" id="btn-refuser" style="background:#ff4444;color:white;">Refuser</button></div>' : '');
  const recharger = () => window.location.reload();
  main.addEventListener('click', function (ev) {
    const a = ev.target.closest('a[data-doc]');
    if (a) { ev.preventDefault(); ouvrirDocument(a.getAttribute('data-doc')); return; }
    const bc = ev.target.closest('button[data-cas]');
    if (bc) { const com = prompt('Commentaire (facultatif) :') || null; agir(async function () { await rpcAuth('traiter_cas_special', { p_cas_special_id: Number(bc.getAttribute('data-cas')), p_decision: bc.getAttribute('data-dec'), p_commentaire: com }); recharger(); }); }
  });
  if ($('btn-paiement-recu')) $('btn-paiement-recu').addEventListener('click', function () { if (confirm('Confirmer que tu as bien reçu ' + fcfa(p.montant) + ' ?')) agir(async function () { await rpcAuth('valider_paiement', { p_paiement: p.id, p_decision: 'paye', p_commentaire: null }); recharger(); }); });
  if ($('btn-paiement-refuse')) $('btn-paiement-refuse').addEventListener('click', function () { if (confirm('Refuser ce paiement ?')) agir(async function () { await rpcAuth('valider_paiement', { p_paiement: p.id, p_decision: 'refuse', p_commentaire: null }); recharger(); }); });
  if ($('btn-valider')) $('btn-valider').addEventListener('click', function () { if (confirm('Valider ce dossier ?')) agir(async function () { await rpcAuth('decider_inscription', { p_inscription: d.id, p_decision: 'valide', p_commentaire: null }); recharger(); }); });
  if ($('btn-refuser')) $('btn-refuser').addEventListener('click', function () { if (confirm('Refuser ce dossier ?')) agir(async function () { await rpcAuth('decider_inscription', { p_inscription: d.id, p_decision: 'refuse', p_commentaire: null }); recharger(); }); });
  if ($('btn-cas')) $('btn-cas').addEventListener('click', function () { agir(async function () { await rpcAuth('declarer_cas_special', { p_inscription_id: d.id, p_type_cas: $('cas-type').value, p_description: $('cas-desc').value }); recharger(); }); });
}

// Petit outil : vide un tableau sauf sa ligne d'en-tête
function viderTableau(table) {
  Array.from(table.rows).slice(1).forEach((r) => r.remove());
  return table.tBodies[0] || table;
}

// ================= PARTIE D : SUPER ADMIN (connecté à Supabase) =================
// Le compte Super Admin est créé à la main dans Supabase (jamais depuis le site).
Object.assign(MESSAGES_ERREUR, {
  reserve_super_admin: 'Cette action est réservée au Super Admin.',
  ecole_introuvable: 'École introuvable.',
  demande_deja_traitee: 'Cette demande a déjà été traitée.',
  demande_introuvable: 'Demande introuvable.',
  decision_invalide: 'Décision invalide.',
  demande_deja_en_cours: 'Une demande de retrait est déjà en attente pour ton école.',
  motif_trop_long: 'Le message est trop long (500 caractères maximum).'
});
const dateFr = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const lienEcole = (e, txt) => '<a href="fiche-ecole.html?id=' + encodeURIComponent(e.id) + '">' + txt + '</a>';
function badgeValidation(v) {
  if (v === 'refuse') return '<span class="badge badge-special">Refusée</span>';
  if (v === 'a_verifier') return '<span class="badge badge-special">Cas spécial</span>';
  if (v === 'valide') return '<span class="badge badge-valide">Validée</span>';
  return '<span class="badge badge-valide">Auto Validé</span>';
}

// ---------- superadmin.html : connexion ----------
function pageSuperAdminAuth() {
  const form = $('form-connexion-sa');
  if (!form) return;
  if ($('form-creation-sa')) $('form-creation-sa').style.display = 'none';
  form.style.display = 'block';
  ajouterOubliMotDePasse(form);
  gererRetourEmail().then(function (traite) {
    if (traite || !lireSession()) return;
    rpcAuth('ma_session').then((s) => { if (s && s.role === 'super_admin') window.location.href = 'dashboardSuperadmin.html'; }).catch(() => { /* reste sur la page */ });
  });
  let enCours = false;
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (enCours) return;
    enCours = true;
    const deverrouiller = verrouiller(form.querySelector('button[type=submit]') || form.querySelector('button'), 'Connexion…');
    try {
      const r = await appelAuth('token?grant_type=password', { email: form.elements['email_connexion_sa'].value.trim().toLowerCase(), password: form.elements['mdp_connexion_sa'].value });
      ecrireSession(r);
      const s = await rpcAuth('ma_session');
      if (s.role !== 'super_admin') { ecrireSession(null); throw erreurAffichable("Ce compte n'est pas un compte Super Admin."); }
      window.location.href = 'dashboardSuperadmin.html';
    } catch (err) {
      alert(messageErreur(err));
      enCours = false; deverrouiller();
    }
  });
}

async function initSuperAdmin() {
  const ids = ['page-sa-dashboard', 'page-sa-ecoles', 'page-sa-fiche-ecole', 'page-sa-abonnements', 'page-sa-utilisateurs', 'page-sa-sauvegardes', 'page-sa-restaurations'];
  if (!ids.some((id) => $(id))) return;
  try {
    const s = await rpcAuth('ma_session');
    if (!s || s.role !== 'super_admin') { window.location.href = 'superadmin.html'; return; }
  } catch (e) {
    if (e && e.session) { window.location.href = 'superadmin.html'; return; }
    document.body.insertAdjacentHTML('afterbegin', '<p style="padding:16px;color:#b91c1c">' + esc(messageErreur(e)) + ' <a href="javascript:location.reload()">Réessayer</a></p>');
    return;
  }
  const menu = document.querySelector('.sidebar');
  if (menu) {
    const bt = document.createElement('button');
    bt.type = 'button'; bt.id = 'btn-deconnexion-sa'; bt.textContent = 'Se déconnecter';
    bt.addEventListener('click', function () { deconnecter('superadmin.html'); });
    menu.appendChild(bt);
  }
  const f = [saDashboard, saEcoles, saFicheEcole, saAbonnements, saUtilisateurs, saSauvegardes, saRestaurations, saRetraits];
  for (const fn of f) { try { await fn(); } catch (e) { if (e && e.session) { window.location.href = 'superadmin.html'; return; } console.error(e); } }
}

async function saDashboard() {
  const main = $('page-sa-dashboard');
  if (!main) return;
  const t = await rpcAuth('sa_tableau_de_bord');
  const ecoles = await rpcAuth('sa_ecoles');
  const kpis = main.querySelectorAll('.kpi');
  const setKpi = (k, val, sub) => { if (!k) return; k.querySelector('b').textContent = val; const sm = k.querySelectorAll('small'); if (sub != null) sm[sm.length - 1].textContent = sub; };
  setKpi(kpis[0], t.ecoles_total, t.ecoles_validees + ' validées + ' + t.ecoles_a_verifier + ' à vérifier');
  setKpi(kpis[1], t.ecoles_a_verifier, null);
  setKpi(kpis[2], t.eleves_total, '+ ' + t.eleves_ce_mois + ' ce mois');
  setKpi(kpis[3], t.demandes_restauration, null);
  // Le montant est fourni par la fonction Supabase sa_tableau_de_bord.
  // Le tiret évite d'afficher un faux chiffre si le champ n'est pas encore exposé.
  if (kpis[4]) {
    const montantMois = t.chiffre_affaires_mois;
    kpis[4].querySelector('b').textContent =
      montantMois == null ? '—' : fcfa(montantMois);
  }
  const date = main.querySelector('h1 + p');
  if (date) date.textContent = 'Toutes les écoles | ' + new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const aVerif = ecoles.filter((e) => e.validation === 'a_verifier');
  const ok = ecoles.filter((e) => e.validation !== 'a_verifier' && e.validation !== 'refuse');
  const tables = main.querySelectorAll('table');
  const c1 = viderTableau(tables[0]);
  aVerif.forEach((e) => c1.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nom.toUpperCase()) + '</b></td><td>' + esc(e.numero_autorisation || '- Aucun -') + '</td><td>' + (e.numero_autorisation ? 'N° à vérifier' : 'N° non renseigné') + '</td><td>' + badgeValidation(e.validation) + '</td><td>' + lienEcole(e, 'Vérifier') + '</td></tr>'));
  if (!aVerif.length) ligneVide(c1, 5, 'Aucun cas spécial 🎉');
  const c2 = viderTableau(tables[1]);
  ok.forEach((e) => c2.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nom.toUpperCase()) + '</b></td><td>' + esc(e.ville) + '</td><td>' + esc(e.numero_autorisation || '- Aucun -') + '</td><td>' + badgeValidation(e.validation) + '</td><td>' + lienEcole(e, 'Voir') + '</td></tr>'));
  if (!ok.length) ligneVide(c2, 5, 'Aucune école pour le moment.');
}

function badgeStatutPlateforme(statut) {
  const lib = statut === 'desactive' ? 'Désactivée' : (statut === 'archivee' ? 'Archivée' : 'Active');
  const cls = statut === 'active' ? 'badge-valide' : (statut === 'desactive' ? 'badge-special' : 'badge-attente');
  return '<span class="badge ' + cls + '">' + lib + '</span>';
}
function actionsStatutEcole(e) {
  const s = e.statut_plateforme || 'active';
  const btn = (val, label) => '<button type="button" data-statut-ecole="' + val + '" data-id="' + e.id + '" data-nom="' + esc(e.nom) + '">' + label + '</button>';
  if (s === 'active') return btn('desactive', 'Désactiver') + ' ' + btn('archivee', 'Archiver');
  if (s === 'desactive') return btn('active', 'Réactiver') + ' ' + btn('archivee', 'Archiver');
  return btn('active', 'Restaurer');
}
async function saEcoles() {
  const main = $('page-sa-ecoles');
  if (!main) return;
  const ecoles = await rpcAuth('sa_ecoles');
  const corps = viderTableau(main.querySelector('table'));
  ecoles.forEach((e) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(e.nom.toUpperCase()) + '</b></td><td>' + esc(e.ville) + '</td><td>' + esc(e.type) + '</td><td>' + esc(e.numero_autorisation || '- Aucun -') + '</td><td><span class="badge badge-valide">' + esc(e.plan || 'gratuit') + '</span></td><td>' + badgeValidation(e.validation) + '</td><td>' + badgeStatutPlateforme(e.statut_plateforme) + '</td><td>' + lienEcole(e, 'Voir') + '<br>' + actionsStatutEcole(e) + '</td></tr>'));
  if (!ecoles.length) ligneVide(corps, 8, 'Aucune école inscrite.');
  const p = main.querySelector('h1 + p');
  if (p) p.textContent = ecoles.length + ' école(s) enregistrée(s) sur la plateforme';
  corps.querySelectorAll('button[data-statut-ecole]').forEach((button) => button.addEventListener('click', async () => {
    const id = parseInt(button.dataset.id, 10);
    const statut = button.dataset.statutEcole;
    const nom = button.dataset.nom || 'cette école';
    const motif = prompt('Motif (facultatif) pour ' + nom + ' :');
    if (motif === null) return;
    const action = statut === 'desactive' ? 'désactiver' : (statut === 'archivee' ? 'archiver' : 'réactiver/restaurer');
    if (!confirm('Confirmer : ' + action + ' ' + nom + ' ? Les données de l’école seront conservées.')) return;
    await agir(async () => {
      await rpcAuth('sa_modifier_statut_ecole', { p_ecole: id, p_statut: statut, p_motif: motif.trim() || null });
      await saEcoles();
    });
  }));
}
async function saFicheEcole() {
  const main = $('page-sa-fiche-ecole');
  if (!main) return;
  const id = parseInt(new URLSearchParams(window.location.search).get('id') || '0', 10);
  let e;
  try { e = await rpcAuth('sa_ecole', { p_id: id }); }
  catch (err) { if (err.session) throw err; main.innerHTML = '<h1>École introuvable</h1><p><a href="ecoles.html">← Retour aux écoles</a></p>'; return; }
  const raison = e.validation === 'a_verifier' ? (e.numero_autorisation ? "Le N° d'autorisation doit être vérifié sur le papier du Directeur." : "Aucun N° d'autorisation renseigné (école en création ?).") : 'Décision déjà prise. Tu peux la changer si besoin.';
  main.innerHTML =
    '<h1>' + esc(e.nom) + '</h1><p>Inscrite le ' + new Date(e.created_at).toLocaleDateString('fr-FR') + ' - ' + esc(e.ville) + '</p>' +
    '<div class="kpi-grid"><div class="kpi kpi-bleu"><small>VILLE</small><b>' + esc(e.ville) + '</b></div><div class="kpi kpi-bleu"><small>DIRECTEUR</small><b>' + esc(e.nom_directeur || '—') + '</b></div>' +
    '<div class="kpi kpi-orange"><small>STATUT ACTUEL</small><b>' + badgeValidation(e.validation) + '</b></div></div>' +
    "<h2>Détails de l'école</h2><table><tr><th>CHAMP</th><th>VALEUR</th></tr>" +
    '<tr><td><b>Type</b></td><td>' + esc(e.type) + '</td></tr>' +
    '<tr><td><b>Directeur</b></td><td>' + esc(e.nom_directeur || '—') + ' - ' + esc(e.telephone_directeur || '—') + '</td></tr>' +
    '<tr><td><b>Comptes</b></td><td>' + (e.utilisateurs.length ? e.utilisateurs.map((u) => esc(u.email) + ' (' + esc(u.role) + ')').join('<br>') : '—') + '</td></tr>' +
    "<tr><td><b>N° d'Autorisation</b></td><td>" + esc(e.numero_autorisation || '- Aucun -') + '</td></tr>' +
    '<tr><td><b>Session</b></td><td>' + (e.session_ouverte ? 'Ouverte' : 'Fermée') + '</td></tr>' +
    '<tr><td><b>Frais</b></td><td>Inscription ' + fcfa(e.frais_inscription) + ' + dossier ' + fcfa(e.frais_dossier) + '</td></tr>' +
    '<tr><td><b>Numéros de dépôt</b></td><td>Airtel : ' + esc(e.numero_airtel_money || '—') + '<br>Moov : ' + esc(e.numero_moov_money || '—') + '</td></tr>' +
    '<tr><td><b>Classes / élèves</b></td><td>' + e.nb_classes + ' classe(s) - ' + e.nb_eleves + ' élève(s) (' + e.nb_valides + ' validés, ' + e.nb_en_attente + ' en attente)</td></tr>' +
    '<tr><td><b>Encaissé</b></td><td>' + fcfa(e.encaisse) + '</td></tr><tr><td><b>Cas spéciaux ouverts</b></td><td>' + e.cas_speciaux_ouverts + '</td></tr>' +
    '<tr><td><b>Plan</b></td><td><span class="badge badge-valide">' + esc(e.plan || 'gratuit') + '</span></td></tr>' +
    '<tr><td><b>Statut plateforme</b></td><td>' + badgeStatutPlateforme(e.statut_plateforme) + (e.motif_statut ? ' — ' + esc(e.motif_statut) : '') + '</td></tr></table><br>' +
    '<div class="card"><h2>Décision</h2><p><b>Info :</b> ' + raison + '</p>' +
    '<button type="button" id="btn-valider-ecole">✅ Valider cette école</button><br><br>' +
    '<button type="button" id="btn-refuser-ecole">❌ Refuser (elle disparaît de la liste des parents)</button></div>' +
    '<div class="card"><h2>Gestion de l’accès à la plateforme</h2><p>' + badgeStatutPlateforme(e.statut_plateforme) + '</p>' +
    '<p>La désactivation bloque temporairement les comptes de l’école. L’archivage la retire des parcours actifs. Dans les deux cas, les dossiers, élèves et paiements sont conservés.</p>' +
    actionsStatutEcole(e) + '</div>' +
    '<div class="card" id="carte-modules"></div>' +
    '<h2>Historique des changements de statut</h2><table><thead><tr><th>ANCIEN STATUT</th><th>NOUVEAU STATUT</th><th>MOTIF</th><th>DATE</th></tr></thead><tbody>' +
    ((e.historique_statuts || []).map((h) => '<tr><td>' + badgeStatutPlateforme(h.ancien_statut) + '</td><td>' + badgeStatutPlateforme(h.nouveau_statut) + '</td><td>' + esc(h.motif || '—') + '</td><td>' + new Date(h.modifie_le).toLocaleString('fr-FR') + '</td></tr>').join('') || '<tr><td colspan="4">Aucun changement enregistré.</td></tr>') +
    '</tbody></table>' +
    '<p><a href="dashboardSuperadmin.html">← Retour au Dashboard</a></p>'; 
  saCarteModules(e.id);
  const decider = (val, msg) => { if (!confirm(msg)) return; agir(async function () { await rpcAuth('decider_ecole', { p_ecole: e.id, p_validation: val }); window.location.reload(); }); };
  $('btn-valider-ecole').addEventListener('click', () => decider('valide', 'Valider cette école ?'));
  $('btn-refuser-ecole').addEventListener('click', () => decider('refuse', 'Refuser cette école ?'));
  main.querySelectorAll('button[data-statut-ecole]').forEach((button) => button.addEventListener('click', async () => {
    const statut = button.dataset.statutEcole;
    const motif = prompt('Motif (facultatif) pour ' + e.nom + ' :');
    if (motif === null) return;
    const action = statut === 'desactive' ? 'désactiver' : (statut === 'archivee' ? 'archiver' : 'réactiver/restaurer');
    if (!confirm('Confirmer : ' + action + ' ' + e.nom + ' ? Les données seront conservées.')) return;
    await agir(async () => { await rpcAuth('sa_modifier_statut_ecole', { p_ecole: e.id, p_statut: statut, p_motif: motif.trim() || null }); window.location.reload(); });
  }));
}

// Modules d'une école (Super Admin) : lecture seule. C'est l'école qui active ses modules.
async function saCarteModules(ecoleId) {
  const zone = $('carte-modules');
  if (!zone) return;
  let m;
  try { m = await rpcAuth('sa_modules_ecole', { p_ecole: ecoleId }); }
  catch (err) { if (err.session) throw err; zone.innerHTML = '<h2>Modules</h2><p>' + esc(messageErreur(err)) + '</p>'; return; }
  const etat = (actif) => actif ? '<span class="badge badge-valide">Activé</span>' : '<span class="badge">Non activé</span>';
  zone.innerHTML = '<h2>Modules choisis par l\'école</h2>' +
    '<p><b>Inscription :</b> ' + etat(true) + '</p>' +
    '<p><b>Gestion financière :</b> ' + etat(m.finance) + '</p>' +
    '<p><b>Notes et bulletins :</b> ' + etat(m.notes) + '</p>' +
    '<p><small>Chaque école active ses modules elle-même.</small></p>';
}

async function saAbonnements() {
  const main = $('page-sa-abonnements');
  if (!main) return;
  const [abos, paiements] = await Promise.all([rpcAuth('sa_abonnements'), rpcAuth('sa_paiements_abonnements')]);
  const nb = (p) => abos.filter((a) => a.plan === p && a.statut === 'actif').length;
  const kpis = main.querySelectorAll('.kpi b');
  if (kpis.length >= 3) { kpis[0].textContent = nb('gratuit') + ' école(s)'; kpis[1].textContent = nb('mensuel') + ' école(s)'; kpis[2].textContent = nb('annuel') + ' école(s)'; }
  const corps = viderTableau(main.querySelector('#table-abonnements'));
  abos.forEach((a) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(a.ecole.toUpperCase()) + '</b></td><td>' + esc(a.plan) + '</td><td>' + fcfa(a.montant) + '</td><td>' + new Date(a.date_debut + 'T00:00:00').toLocaleDateString('fr-FR') + '</td><td>' + (a.date_fin ? new Date(a.date_fin + 'T00:00:00').toLocaleDateString('fr-FR') : '—') + '</td><td><span class="badge ' + (a.statut === 'actif' ? 'badge-valide' : 'badge-special') + '">' + esc(a.statut) + '</span></td><td>' + badgeStatutPlateforme(a.statut_plateforme) + '</td><td>' + lienEcole({ id: a.ecole_id }, 'Voir') + '</td></tr>'));
  if (!abos.length) ligneVide(corps, 8, 'Aucun abonnement.');
  const tbodyPaiements = viderTableau(main.querySelector('#table-paiements-abonnements'));
  const nomMethode = (m) => m === 'airtel_money' ? 'Airtel Money' : (m === 'moov_money' ? 'Moov Money' : m);
  paiements.forEach((p) => tbodyPaiements.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(p.ecole) + '</b></td><td>' + esc(p.reference) + '</td><td>' + fcfa(p.montant) + '</td><td>' + esc(nomMethode(p.methode)) + '</td><td><span class="badge ' + (p.statut === 'paye' ? 'badge-valide' : (p.statut === 'echec' ? 'badge-special' : 'badge-attente')) + '">' + esc(p.statut) + '</span></td><td>' + (p.paye_le ? new Date(p.paye_le).toLocaleString('fr-FR') : '—') + '</td></tr>'));
  if (!paiements.length) ligneVide(tbodyPaiements, 6, 'Aucun paiement d’abonnement enregistré.');
}
async function saUtilisateurs() {
  const main = $('page-sa-utilisateurs');
  if (!main) return;
  const users = await rpcAuth('sa_utilisateurs');
  const table = main.querySelector('table');
  table.rows[0].cells[3].textContent = 'EMAIL';
  const corps = viderTableau(table);
  users.forEach((u) => {
    const statut = u.role === 'super_admin' ? 'Actif' : (u.ecole_validation === 'refuse' ? 'Suspendu' : (u.ecole_validation === 'a_verifier' ? 'En attente' : 'Actif'));
    const role = u.role === 'super_admin' ? 'Super Admin' : (u.role === 'directeur' ? 'Directeur' : 'Secrétaire');
    corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc((u.prenom + ' ' + u.nom).trim()) + '</b></td><td>' + role + '</td><td>' + esc(u.ecole || '—') + '</td><td>' + esc(u.email) + '</td><td><span class="badge ' + (statut === 'Actif' ? 'badge-valide' : (statut === 'Suspendu' ? 'badge-special' : 'badge-attente')) + '">' + statut + '</span></td><td>' + (u.ecole_id ? lienEcole({ id: u.ecole_id }, 'Voir école') : '') + '</td></tr>');
  });
  if (!users.length) ligneVide(corps, 6, 'Aucun utilisateur.');
  const p = main.querySelector('h1 + p');
  if (p) p.textContent = users.length + ' compte(s) (les parents n\'ont pas de compte : ils utilisent leur lien de suivi)';
}

async function saSauvegardes() {
  const main = $('page-sa-sauvegardes');
  if (!main) return;
  const table = main.querySelector('table');
  async function afficher() {
    const lignes = await rpcAuth('sa_sauvegardes');
    const corps = viderTableau(table);
    lignes.forEach((l) => {
      const statut = l.demande_en_attente ? '<span class="badge badge-attente">Demande en attente</span>' : (l.derniere ? '<span class="badge badge-valide">OK</span>' : '<span class="badge badge-special">Aucune</span>');
      corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(l.ecole.toUpperCase()) + '</b></td><td>' + (l.derniere ? dateFr(l.derniere) : '—') + '</td><td>' + (l.taille_mb != null ? Number(l.taille_mb).toLocaleString('fr-FR') + ' Mo' : '—') + '</td><td>' + statut + '</td><td><button type="button" data-id="' + l.ecole_id + '" data-nom="' + esc(l.ecole) + '">Exporter</button>' + (l.demande_en_attente ? ' <a href="demandes-restauration.html">Voir la demande</a>' : '') + '</td></tr>');
    });
    if (!lignes.length) ligneVide(corps, 5, 'Aucune école.');
  }
  await afficher();
  const p = main.querySelector('h1 + p');
  if (p) p.textContent = "Chaque export télécharge un fichier avec toutes les données de l'école. Garde-le en lieu sûr : il contient des données d'enfants.";
  table.addEventListener('click', function (ev) {
    const b = ev.target.closest('button[data-id]');
    if (!b) return;
    const ancien = b.textContent; b.disabled = true; b.textContent = 'Export…';
    agir(async function () {
      const donnees = await rpcAuth('sa_exporter_ecole', { p_ecole: Number(b.getAttribute('data-id')) });
      const blob = new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'inscrigab_' + (b.getAttribute('data-nom') || 'ecole').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) + '_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
      await afficher();
    }).then(function () { b.disabled = false; b.textContent = ancien; });
  });
}

async function saRestaurations() {
  const main = $('page-sa-restaurations');
  if (!main) return;
  const table = main.querySelector('table');
  const detail = $('detail');
  let choisie = null;
  async function afficher() {
    const toutes = await rpcAuth('sa_demandes_restauration');
    const att = toutes.filter((r) => r.statut === 'en_attente');
    const corps = viderTableau(table);
    att.forEach((r) => corps.insertAdjacentHTML('beforeend', '<tr><td><b>' + esc(r.ecole.toUpperCase()) + '</b></td><td>' + dateFr(r.sauvegarde_le) + '</td><td>' + esc(r.motif) + '</td><td><span class="badge badge-attente">En attente</span></td><td><a href="#detail" data-id="' + esc(r.id) + '">Traiter →</a></td></tr>'));
    if (!att.length) ligneVide(corps, 5, 'Aucune demande en attente.');
    const r = att.find((x) => x.id === choisie) || att[0];
    if (!r) { detail.innerHTML = '<h2>Aucune demande à traiter</h2><p>Les demandes envoyées par les directeurs apparaîtront ici.</p>'; return; }
    choisie = r.id;
    detail.innerHTML = '<h2>Demande - ' + esc(r.ecole) + '</h2><p><b>Motif :</b> ' + esc(r.motif) + '<br><b>Demandée le :</b> ' + dateFr(r.created_at) + '</p>' +
      '<p><small>Approuver ne restaure pas automatiquement : la restauration technique est faite ensuite par l\'équipe technique, à partir d\'un export.</small></p>' +
      '<button type="button" id="btn-valider-rest">✅ Approuver la demande</button><br><br><button type="button" id="btn-refuser-rest">❌ Refuser la demande</button>';
    const traiter = (decision) => { if (!confirm(decision === 'approuvee' ? 'Approuver cette demande ?' : 'Refuser cette demande ?')) return; agir(async function () { await rpcAuth('sa_traiter_demande_restauration', { p_id: r.id, p_decision: decision }); await afficher(); }); };
    $('btn-valider-rest').addEventListener('click', () => traiter('approuvee'));
    $('btn-refuser-rest').addEventListener('click', () => traiter('refusee'));
  }
  await afficher();
  table.addEventListener('click', function (ev) {
    const a = ev.target.closest('a[data-id]');
    if (a) { choisie = a.getAttribute('data-id'); afficher(); }
  });
}

// Demandes de retrait d'école envoyées par les directeurs (page demandes-restauration.html)
async function saRetraits() {
  const zone = $('bloc-retraits');
  if (!zone) return;
  async function afficher() {
    const toutes = await rpcAuth('sa_demandes_retrait');
    const att = toutes.filter((r) => r.statut === 'en_attente');
    const passees = toutes.filter((r) => r.statut !== 'en_attente').slice(0, 5);
    const etiquette = { acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée' };
    zone.innerHTML = '<h2>Demandes de retrait d\'école</h2>' +
      (att.length ? att.map((r) => '<div class="card"><h2>' + esc(r.ecole) + (r.ville ? ' - ' + esc(r.ville) : '') + '</h2><p><b>Demandée le :</b> ' + dateFr(r.created_at) + '<br><b>Motif :</b> ' + esc(r.motif || '—') + '</p>' +
        '<p><small>Accepter archive l\'école : elle disparaît pour les parents et le directeur perd l\'accès, mais les données sont conservées.</small></p>' +
        '<button type="button" data-retrait="' + esc(r.id) + '" data-dec="acceptee">✅ Accepter le retrait</button><br><br><button type="button" data-retrait="' + esc(r.id) + '" data-dec="refusee">❌ Refuser</button></div>').join('') : '<p>Aucune demande de retrait en attente.</p>') +
      (passees.length ? '<p><small>Dernières demandes traitées : ' + passees.map((r) => esc(r.ecole) + ' (' + (etiquette[r.statut] || esc(r.statut)) + ')').join(', ') + '</small></p>' : '');
    zone.querySelectorAll('button[data-retrait]').forEach((b) => b.addEventListener('click', function () {
      const dec = b.getAttribute('data-dec');
      const reponse = prompt(dec === 'acceptee' ? 'Message pour le directeur (facultatif) :' : 'Pourquoi refuses-tu ? (facultatif)');
      if (reponse === null) return;
      if (!confirm(dec === 'acceptee' ? 'Accepter ce retrait ? L\'école sera archivée.' : 'Refuser cette demande ?')) return;
      agir(async function () { await rpcAuth('sa_traiter_demande_retrait', { p_id: b.getAttribute('data-retrait'), p_decision: dec, p_reponse: reponse.trim() || null }); await afficher(); });
    }));
  }
  await afficher();
}
