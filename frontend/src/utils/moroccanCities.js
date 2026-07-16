// Suggestions pour les champs de ville. Un <datalist> laisse volontairement
// l'utilisateur saisir une autre localité si elle n'est pas dans la liste.
export const MOROCCAN_CITIES = [
  'Agadir', 'Agdz', 'Ahfir', 'Aïn Harrouda', 'Aïn Taoujdate', 'Aït Baha',
  'Aït Melloul', 'Aït Ourir', 'Al Hoceïma', 'Amizmiz', 'Arfoud', 'Asilah',
  'Azemmour', 'Azilal', 'Azrou', 'Ben Ahmed', 'Ben Guerir', 'Béni Mellal',
  'Benslimane', 'Berkane', 'Berrechid', 'Biougra', 'Bouarfa', 'Boujdour',
  'Boulemane', 'Bouskoura', 'Bouznika', 'Casablanca', 'Chefchaouen',
  'Chichaoua', 'Dakhla', 'Dar Bouazza', 'Debdou', 'Demnate', 'El Aïoun',
  'El Hajeb', 'El Jadida', 'El Kelaâ des Sraghna', 'Errachidia', 'Essaouira',
  'Fès', 'Figuig', 'Fnideq', 'Fquih Ben Salah', 'Guelmim', 'Guercif',
  'Had Soualem', 'Harhoura', 'Ifrane', 'Imintanoute', 'Imouzzer Kandar',
  'Jerada', 'Kasba Tadla', 'Kénitra', 'Khémisset', 'Khénifra', 'Khouribga',
  'Ksar El Kébir', 'Laâyoune', 'Larache', 'Marrakech', 'Martil', 'Mdiq',
  'Médiouna', 'Meknès', 'Midelt', 'Mirleft', 'Missour', 'Mohammédia',
  'Moulay Bousselham', 'Nador', 'Ouarzazate', 'Ouazzane', 'Oued Zem',
  'Oujda', 'Rabat', 'Rissani', 'Safi', 'Saïdia', 'Salé', 'Sefrou', 'Settat',
  'Sidi Bennour', 'Sidi Ifni', 'Sidi Kacem', 'Sidi Slimane', 'Skhirat',
  'Souk El Arbaa', 'Tafraout', 'Tahannaout', 'Taliouine', 'Tanger', 'Tan-Tan',
  'Taounate', 'Taourirt', 'Taroudant', 'Tata', 'Taza', 'Témara', 'Tétouan',
  'Tiflet', 'Tinghir', 'Tiznit', 'Youssoufia', 'Zagora', 'Zaïo',
];

// Construction en heure locale : toISOString() pourrait renvoyer la veille
// ou le lendemain selon le fuseau du navigateur.
export const localTodayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
