export type Lang = 'fr' | 'en'

export function getLang(): Lang {
  return (localStorage.getItem('bmt_lang') || 'fr') as Lang
}

export const MAP_T = {
  fr: {
    toolDraw:    '● Tracer',
    toolEraser:  '✕ Gomme',
    toolBusstop: '🚏 Arrêt',
    toolStation: '🏢 Station',
    titleDraw:   'Tracer une ligne',
    titleErase:  'Effacer',
    titleBusstop:'Arrêt de bus',
    titleStation:'Station',
    titleReset:  'Réinitialiser le dessin',
    titleTools:  'Outils',
    titleResults:'Carte citoyenne',
    titleFinish: 'Terminer',
    next:        'Suivant',
    confirmReset:'Effacer tous les tracés et recommencer à zéro ?',
    draftRestored:(lines: number, stops: number) =>
      `Brouillon restauré — ${lines} ligne${lines !== 1 ? 's' : ''}${stops > 0 ? `, ${stops} arrêt${stops !== 1 ? 's' : ''}` : ''}`,
    hintStart:   'Appuyez sur la carte pour commencer une ligne',
    hintDraw:    'Appuyez pour ajouter des points',
    statLine:    (n: number) => `${n} ligne${n !== 1 ? 's' : ''}`,
    statStop:    (n: number) => `${n} arrêt${n !== 1 ? 's' : ''}`,
    statStation: (n: number) => `${n} station${n !== 1 ? 's' : ''}`,
    modalTypeBusstop: 'Arrêt de bus',
    modalTypeStation: 'Station / Gare',
    modalTypeEnBusstop: 'Bus stop',
    modalTypeEnStation: 'Station',
    modalPlaceholderBusstop: 'ex: Arrêt Main St.',
    modalPlaceholderStation: 'ex: Gare Moncton',
    modalHintSnap:   (type: 'busstop' | 'station') =>
      type === 'busstop'
        ? "L'arrêt se colle sur votre ligne — déplacez la carte pour choisir l'emplacement exact"
        : "La station se colle sur votre ligne — déplacez la carte pour choisir l'emplacement exact",
    modalHintFree:   (type: 'busstop' | 'station') =>
      type === 'busstop'
        ? "Déplacez la carte pour positionner l'arrêt"
        : "Déplacez la carte pour positionner la station",
    modalCancel:  'Annuler',
    modalConfirm: 'Confirmer',
    modalLabel:   'Nom (optionnel)',
  },
  en: {
    toolDraw:    '● Draw',
    toolEraser:  '✕ Erase',
    toolBusstop: '🚏 Stop',
    toolStation: '🏢 Station',
    titleDraw:   'Draw a line',
    titleErase:  'Erase',
    titleBusstop:'Bus stop',
    titleStation:'Station',
    titleReset:  'Reset drawing',
    titleTools:  'Tools',
    titleResults:'Citizen map',
    titleFinish: 'Finish',
    next:        'Next',
    confirmReset:'Clear all drawings and start over?',
    draftRestored:(lines: number, stops: number) =>
      `Draft restored — ${lines} line${lines !== 1 ? 's' : ''}${stops > 0 ? `, ${stops} stop${stops !== 1 ? 's' : ''}` : ''}`,
    hintStart:   'Tap the map to start drawing a line',
    hintDraw:    'Tap to add points',
    statLine:    (n: number) => `${n} line${n !== 1 ? 's' : ''}`,
    statStop:    (n: number) => `${n} stop${n !== 1 ? 's' : ''}`,
    statStation: (n: number) => `${n} station${n !== 1 ? 's' : ''}`,
    modalTypeBusstop: 'Bus stop',
    modalTypeStation: 'Station / Hub',
    modalTypeEnBusstop: 'Arrêt',
    modalTypeEnStation: 'Station',
    modalPlaceholderBusstop: 'e.g. Main St. Stop',
    modalPlaceholderStation: 'e.g. Moncton Station',
    modalHintSnap:   (type: 'busstop' | 'station') =>
      type === 'busstop'
        ? 'The stop snaps to your line — move the map to choose the exact position'
        : 'The station snaps to your line — move the map to choose the exact position',
    modalHintFree:   (type: 'busstop' | 'station') =>
      type === 'busstop'
        ? 'Move the map to position the stop'
        : 'Move the map to position the station',
    modalCancel:  'Cancel',
    modalConfirm: 'Confirm',
    modalLabel:   'Name (optional)',
  },
}

export const FORM_T = {
  fr: {
    title:        'Vos informations',
    subtitle:     'Your information',
    required:     'Requis',
    emailInvalid: 'Courriel invalide',
    successTitle: 'Merci !',
    successMsg:   'Votre suggestion a bien été reçue.',
    successMsgAlt:'Thank you! Your suggestion has been received.',
    viewMap:      'Voir la carte citoyenne →',
    backMap:      '← Retour à la carte',
    send:         'Envoyer / Send',
    labelNom:     'Nom',
    labelNomSub:  'Last name',
    labelPrenom:  'Prénom',
    labelPrenomSub:'First name',
    labelAdresse: 'Adresse',
    labelAdresseSub:'Address',
    labelEmail:   'Courriel',
    labelEmailSub:'Email',
    labelSuggestion:'Suggestion',
    labelSuggestionSub:'Suggestion',
    placeholderSuggestion:'Décrivez votre suggestion de ligne de bus… / Describe your bus route suggestion…',
  },
  en: {
    title:        'Your information',
    subtitle:     'Vos informations',
    required:     'Required',
    emailInvalid: 'Invalid email',
    successTitle: 'Thank you!',
    successMsg:   'Your suggestion has been received.',
    successMsgAlt:'Merci ! Votre suggestion a bien été reçue.',
    viewMap:      'View the citizen map →',
    backMap:      '← Back to map',
    send:         'Send / Envoyer',
    labelNom:     'Last name',
    labelNomSub:  'Nom',
    labelPrenom:  'First name',
    labelPrenomSub:'Prénom',
    labelAdresse: 'Address',
    labelAdresseSub:'Adresse',
    labelEmail:   'Email',
    labelEmailSub:'Courriel',
    labelSuggestion:'Suggestion',
    labelSuggestionSub:'Suggestion',
    placeholderSuggestion:'Describe your bus route suggestion… / Décrivez votre suggestion de ligne de bus…',
  },
}
