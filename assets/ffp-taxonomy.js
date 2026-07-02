/* FFP Taxonomy - v11 (2026-06-12)
   v11: provider_type (Partner type) values changed to Single location / Remote / Event organizer (was the
        business-type list Gym/Studio/…). Admin-editable in Admin → Taxonomies → provider_type. DB updated to match.
   v10: LISTING LEVELS — the partner listing forms (Trips/Events/Experiences) now use the SAME connected
        level vocabulary as a member's own ability: fitnessLevels = Not Tried/Social/Competitive/
        Representative/Professional, and attendeeLevels = those + "All Levels" (the "who can attend?"
        question). attendeeLevels is derived from fitnessLevels so they can never drift apart. Kills the
        per-form hardcoded level/difficulty lists.
   v9: PROFESSIONS taxonomy — professionalRoles is now (a) regrouped under the 6 STANDARD FFP
       categories (Sports/Fitness/Wellness/Recovery/Adventure/Health food) instead of made-up headings,
       and (b) DB-hydrated from list_key='professional_role' (each row's `parent` = its category), so
       Admin → Taxonomies → Professions controls it platform-wide. The hardcoded object is fallback only.
       Added T.professionalCategories, T.professionalRolesFlat() and T.categoryOfRole() helpers for the
       single searchable Profession picker. Service professionals only (no business/athlete/creator roles).
   v8: CATEGORY STANDARDISATION — each activity's category ('c') now comes from the DB
       (taxonomy_items.parent), which was set to the 6 platform standard categories:
       fitness · sports · wellness · recovery · adventure · food. Was reading a stale static 16-group map;
       the DB is now the single source of truth (Admin Taxonomy controls it). Static `c` is fallback only.
   v7: ALPHABETICAL at the source. Name lists — activity, nationality, country, city, category,
       provider_type — now hydrate A–Z (cities A–Z within each country, countries A–Z), so every form
       on every dashboard inherits alphabetical order from one place. Ordinal lists keep their
       meaningful sort_order: fitness_level (Not Tried→Professional), age_group, gym_size, gender,
       experience_type, passport.
   v6: + provider classification lists exposed on FFP_TAX — providerTypes (list_key 'provider_type')
       + gymSizes ('gym_size'), hydrated from the DB like the rest. provider_type is ONE unified
       concept (Gym / Studio / Event Organizer / Sports Club / Team / Adventure Provider / Health Food
       Cafe / …) used by BOTH the provider profile field AND the admin rankings classifier — same
       column, same list, no conflict. (Resolves the audit's provider_type issue per Grant: they're
       the same thing.)
   v5: + Passports (Pick A Passport map lens). Exposes FFP_TAX.passports (list_key='passport')
       and FFP_TAX.categoryPassport (category value → passport id, from each category row's
       `parent`). Admin assigns a passport per category in the Taxonomies panel; the member
       map reads this live. Colours/icons stay in member-dashboard code (PASSPORT_META).
   v4: static gender fallback aligned to the DB taxonomy — removed 'Non-binary' (not in
       taxonomy_items list_key='gender'). The DB is the single source of truth and hydrates
       FFP_TAX.genders on load via FFP_TAX_READY; gender is now controlled entirely from the
       Taxonomy (admin) — add/remove there and every form follows. This fallback only shows if
       the DB is unreachable, and now it matches.
   v3: consolidated Running&walking (Walking/Running/Trail/Half/Marathon/Ultra) and
       Swimming (Swimming/Open water) — removed distance-variant spam (Run 2/5/10km etc.).
   v2: + genders, ageGroups, phoneCodes, professionalRoles (centralised so every form shares them).
   v1: single source of truth for cross-platform reference lists, extracted VERBATIM from
       the member dashboard (CITIES_DB, ACTIVITIES_DB) + shared fitness levels + nationalities.
       Loaded before dashboards; forms/admin read window.FFP_TAX instead of inline copies.
*/
(function(){
  'use strict';
  window.FFP_TAX = {
    cities: {

      'Argentina': ['Bariloche','Buenos Aires','Cordoba','El Calafate','Iguazu','Mendoza','Salta','Ushuaia'],
      'Australia': ['Adelaide','Brisbane','Byron Bay','Cairns','Canberra','Darwin','Gold Coast','Hobart','Melbourne','Newcastle','Perth','Sunshine Coast','Sydney','Wollongong'],
      'Austria': ['Bregenz','Graz','Hallstatt','Innsbruck','Kitzbuhel','Klagenfurt','Linz','Salzburg','Vienna'],
      'Bahrain': ['Manama','Muharraq','Riffa'],
      'Belgium': ['Antwerp','Bruges','Brussels','Ghent','Leuven','Liege','Mechelen','Namur'],
      'Brazil': ['Brasilia','Buzios','Florianopolis','Fortaleza','Iguazu Falls','Manaus','Recife','Rio de Janeiro','Salvador','Sao Paulo'],
      'Canada': ['Banff','Calgary','Edmonton','Halifax','Mont-Tremblant','Montreal','Niagara Falls','Ottawa','Quebec City','Toronto','Vancouver','Victoria','Whistler','Winnipeg'],
      'Chile': ['Atacama','Easter Island','Patagonia','Pucon','Punta Arenas','Santiago','Valparaiso'],
      'China': ['Beijing','Chengdu','Chongqing','Guangzhou','Hangzhou','Hong Kong','Lhasa','Macau','Sanya','Shanghai','Shenzhen','Suzhou','Xian'],
      'Costa Rica': ['La Fortuna','Manuel Antonio','Monteverde','Puerto Viejo','San Jose','Tamarindo'],
      'Czech Republic': ['Brno','Cesky Krumlov','Karlovy Vary','Liberec','Olomouc','Ostrava','Plzen','Prague'],
      'Denmark': ['Aalborg','Aarhus','Copenhagen','Esbjerg','Helsingor','Odense','Roskilde'],
      'Egypt': ['Alexandria','Aswan','Cairo','Dahab','Hurghada','Luxor','Marsa Alam','Sharm El Sheikh'],
      'Finland': ['Espoo','Helsinki','Lapland','Oulu','Rovaniemi','Tampere','Turku','Vantaa'],
      'France': ['Aix-en-Provence','Avignon','Biarritz','Bordeaux','Cannes','Chamonix','Lille','Lyon','Marseille','Montpellier','Nantes','Nice','Paris','Saint-Tropez','Strasbourg','Toulouse'],
      'Germany': ['Baden-Baden','Berlin','Bremen','Cologne','Dresden','Dusseldorf','Frankfurt','Hamburg','Hannover','Heidelberg','Leipzig','Munich','Nuremberg','Stuttgart'],
      'Greece': ['Athens','Corfu','Crete','Kos','Mykonos','Naxos','Paros','Patras','Rhodes','Santorini','Skiathos','Thessaloniki','Zakynthos'],
      'Hungary': ['Budapest','Debrecen','Eger','Gyor','Miskolc','Pecs','Szeged'],
      'Iceland': ['Akureyri','Hofn','Husavik','Keflavik','Reykjavik','Selfoss','Vik'],
      'India': ['Agra','Bangalore','Chennai','Darjeeling','Goa','Hyderabad','Jaipur','Kerala','Kolkata','Mumbai','New Delhi','Pune','Rishikesh','Udaipur','Varanasi'],
      'Indonesia': ['Bali','Bandung','Gili Islands','Jakarta','Komodo','Lombok','Seminyak','Surabaya','Ubud','Yogyakarta'],
      'Ireland': ['Belfast','Cork','Dublin','Galway','Kilkenny','Killarney','Limerick','Waterford'],
      'Israel': ['Eilat','Haifa','Jerusalem','Nazareth','Tel Aviv','Tiberias'],
      'Italy': ['Amalfi','Bologna','Capri','Cinque Terre','Florence','Genoa','Lake Como','Milan','Naples','Palermo','Pisa','Positano','Rome','Sardinia','Sicily','Turin','Venice','Verona'],
      'Japan': ['Fukuoka','Hakone','Hiroshima','Kanazawa','Kobe','Kyoto','Nagoya','Nara','Nikko','Niseko','Okinawa','Osaka','Sapporo','Sendai','Takayama','Tokyo','Yokohama'],
      'Jordan': ['Amman','Aqaba','Dead Sea','Jerash','Petra','Wadi Rum'],
      'Kenya': ['Diani Beach','Kisumu','Lamu','Maasai Mara','Mombasa','Nairobi','Nakuru'],
      'Kuwait': ['Hawalli','Kuwait City','Salmiya'],
      'Lebanon': ['Baalbek','Beirut','Byblos','Sidon','Tripoli'],
      'Malaysia': ['Borneo','Ipoh','Johor Bahru','Kota Kinabalu','Kuala Lumpur','Kuching','Langkawi','Malacca','Penang'],
      'Maldives': ['Hulhumale','Maafushi','Male'],
      'Mexico': ['Cabo San Lucas','Cancun','Cozumel','Guadalajara','Isla Mujeres','Merida','Mexico City','Oaxaca','Playa del Carmen','Puerto Vallarta','Tulum'],
      'Morocco': ['Agadir','Casablanca','Chefchaouen','Essaouira','Fez','Marrakech','Meknes','Rabat','Tangier'],
      'Netherlands': ['Amsterdam','Delft','Eindhoven','Groningen','Haarlem','Leiden','Maastricht','Rotterdam','The Hague','Utrecht'],
      'New Zealand': ['Auckland','Christchurch','Dunedin','Hamilton','Napier','Nelson','Queenstown','Rotorua','Tauranga','Wellington'],
      'Norway': ['Alesund','Bergen','Geiranger','Lofoten','Oslo','Stavanger','Tromso','Trondheim'],
      'Oman': ['Khasab','Muscat','Nizwa','Salalah','Sur'],
      'Philippines': ['Boracay','Bohol','Cebu','Coron','Davao','El Nido','Manila','Palawan','Siargao'],
      'Poland': ['Gdansk','Krakow','Lodz','Lublin','Poznan','Warsaw','Wroclaw','Zakopane'],
      'Portugal': ['Albufeira','Azores','Braga','Cascais','Coimbra','Faro','Funchal','Lagos','Lisbon','Madeira','Porto','Sintra'],
      'Qatar': ['Al Khor','Al Wakrah','Doha','Lusail'],
      'Russia': ['Kazan','Moscow','Novosibirsk','Saint Petersburg','Sochi','Vladivostok','Yekaterinburg'],
      'Saudi Arabia': ['AlUla','Dammam','Jeddah','Khobar','Mecca','Medina','NEOM','Riyadh'],
      'Singapore': ['Singapore'],
      'South Africa': ['Cape Town','Durban','Hermanus','Johannesburg','Knysna','Plettenberg Bay','Port Elizabeth','Pretoria','Stellenbosch'],
      'South Korea': ['Busan','Daegu','Daejeon','Gwangju','Gyeongju','Incheon','Jeju','Seoul','Suwon'],
      'Spain': ['Barcelona','Bilbao','Cordoba','Granada','Gran Canaria','Ibiza','Madrid','Malaga','Mallorca','Marbella','Salamanca','San Sebastian','Seville','Tenerife','Valencia'],
      'Sri Lanka': ['Anuradhapura','Colombo','Ella','Galle','Kandy','Mirissa','Negombo','Nuwara Eliya'],
      'Sweden': ['Gothenburg','Kiruna','Lapland','Lund','Malmo','Stockholm','Uppsala','Vasteras'],
      'Switzerland': ['Basel','Bern','Davos','Geneva','Interlaken','Lausanne','Lucerne','Lugano','Montreux','St. Moritz','Zermatt','Zurich'],
      'Taiwan': ['Hualien','Kaohsiung','Taichung','Tainan','Taipei','Taroko'],
      'Tanzania': ['Arusha','Dar es Salaam','Kilimanjaro','Serengeti','Stone Town','Zanzibar'],
      'Thailand': ['Bangkok','Chiang Mai','Chiang Rai','Hua Hin','Koh Phi Phi','Koh Samui','Koh Tao','Krabi','Pattaya','Phuket'],
      'Turkey': ['Ankara','Antalya','Bodrum','Cappadocia','Fethiye','Istanbul','Izmir','Marmaris','Pamukkale'],
      'United Arab Emirates': ['Abu Dhabi','Ajman','Al Ain','Dubai','Fujairah','Ras Al Khaimah','Sharjah','Umm Al Quwain'],
      'United Kingdom': ['Aberdeen','Bath','Belfast','Birmingham','Brighton','Bristol','Cambridge','Cardiff','Edinburgh','Glasgow','Leeds','Liverpool','London','Manchester','Newcastle','Oxford','Sheffield','York'],
      'United States': ['Aspen','Atlanta','Austin','Boston','Chicago','Dallas','Denver','Honolulu','Houston','Las Vegas','Los Angeles','Miami','Nashville','New Orleans','New York','Park City','Philadelphia','Phoenix','Portland','San Antonio','San Diego','San Francisco','Seattle','Washington DC'],
      'Vietnam': ['Da Nang','Dalat','Halong Bay','Hanoi','Ho Chi Minh City','Hoi An','Hue','Nha Trang','Phu Quoc','Sapa']
    },
    activities: [
    { n: 'Walking', c: 'Running & walking' },
    { n: 'Running', c: 'Running & walking' },
    { n: 'Trail running', c: 'Running & walking' },
    { n: 'Half marathon', c: 'Running & walking' },
    { n: 'Marathon', c: 'Running & walking' },
    { n: 'Ultramarathon', c: 'Running & walking' },
    { n: 'Road cycling', c: 'Cycling' },
    { n: 'Mountain biking', c: 'Cycling' },
    { n: 'Indoor cycling', c: 'Cycling' },
    { n: 'Track cycling', c: 'Cycling' },
    { n: 'Swimming', c: 'Swimming' },
    { n: 'Open water swimming', c: 'Swimming' },
    { n: 'Surfing', c: 'Watersports' },
    { n: 'Kitesurfing', c: 'Watersports' },
    { n: 'Stand-up paddleboard', c: 'Watersports' },
    { n: 'Sailing', c: 'Watersports' },
    { n: 'Kayaking', c: 'Watersports' },
    { n: 'Scuba diving', c: 'Watersports' },
    { n: 'Tennis', c: 'Racquet sports' },
    { n: 'Padel', c: 'Racquet sports' },
    { n: 'Pickleball', c: 'Racquet sports' },
    { n: 'Squash', c: 'Racquet sports' },
    { n: 'Badminton', c: 'Racquet sports' },
    { n: 'Football (soccer)', c: 'Team sports' },
    { n: 'Futsal', c: 'Team sports' },
    { n: 'American football', c: 'Team sports' },
    { n: 'Australian rules football', c: 'Team sports' },
    { n: 'Basketball', c: 'Team sports' },
    { n: 'Baseball', c: 'Team sports' },
    { n: 'Cricket', c: 'Team sports' },
    { n: 'Rugby union', c: 'Team sports' },
    { n: 'Rugby league', c: 'Team sports' },
    { n: 'Rugby sevens', c: 'Team sports' },
    { n: 'Touch rugby', c: 'Team sports' },
    { n: 'Ice hockey', c: 'Team sports' },
    { n: 'Field hockey', c: 'Team sports' },
    { n: 'Lacrosse', c: 'Team sports' },
    { n: 'Volleyball', c: 'Team sports' },
    { n: 'Beach volleyball', c: 'Team sports' },
    { n: 'Water polo', c: 'Team sports' },
    { n: 'Netball', c: 'Team sports' },
    { n: 'Handball', c: 'Team sports' },
    { n: 'Kabaddi', c: 'Team sports' },
    { n: 'Dodgeball', c: 'Team sports' },
    { n: 'Ultimate frisbee', c: 'Team sports' },
    { n: 'Curling', c: 'Team sports' },
    { n: 'Boxing', c: 'Combat sports' },
    { n: 'Kickboxing', c: 'Combat sports' },
    { n: 'Muay Thai', c: 'Combat sports' },
    { n: 'Brazilian Jiu-Jitsu', c: 'Combat sports' },
    { n: 'MMA', c: 'Combat sports' },
    { n: 'Judo', c: 'Combat sports' },
    { n: 'Karate', c: 'Combat sports' },
    { n: 'Taekwondo', c: 'Combat sports' },
    { n: 'Wrestling', c: 'Combat sports' },
    { n: 'Fencing', c: 'Combat sports' },
    { n: 'Strength training', c: 'Strength & fitness' },
    { n: 'Powerlifting', c: 'Strength & fitness' },
    { n: 'Olympic lifting', c: 'Strength & fitness' },
    { n: 'CrossFit', c: 'Strength & fitness' },
    { n: 'HIIT', c: 'Strength & fitness' },
    { n: 'F45', c: 'Strength & fitness' },
    { n: 'Functional training', c: 'Strength & fitness' },
    { n: 'Calisthenics', c: 'Strength & fitness' },
    { n: 'Vinyasa yoga', c: 'Mind-body' },
    { n: 'Hot yoga', c: 'Mind-body' },
    { n: 'Yin yoga', c: 'Mind-body' },
    { n: 'Pilates mat', c: 'Mind-body' },
    { n: 'Pilates reformer', c: 'Mind-body' },
    { n: 'Barre', c: 'Mind-body' },
    { n: 'Meditation', c: 'Mind-body' },
    { n: 'Breathwork', c: 'Mind-body' },
    { n: 'Tai Chi', c: 'Mind-body' },
    { n: 'Cryotherapy', c: 'Recovery & wellness' },
    { n: 'Ice bath', c: 'Recovery & wellness' },
    { n: 'Sauna', c: 'Recovery & wellness' },
    { n: 'Infrared sauna', c: 'Recovery & wellness' },
    { n: 'Sports massage', c: 'Recovery & wellness' },
    { n: 'Hiking', c: 'Outdoor & adventure' },
    { n: 'Mountain hike', c: 'Outdoor & adventure' },
    { n: 'Indoor climbing', c: 'Outdoor & adventure' },
    { n: 'Outdoor climbing', c: 'Outdoor & adventure' },
    { n: 'Bouldering', c: 'Outdoor & adventure' },
    { n: 'Skiing', c: 'Snow sports' },
    { n: 'Snowboarding', c: 'Snow sports' },
    { n: 'Cross-country skiing', c: 'Snow sports' },
    { n: 'Golf round', c: 'Golf' },
    { n: 'Driving range', c: 'Golf' },
    { n: 'Horse riding', c: 'Equestrian' },
    { n: 'Polo', c: 'Equestrian' },
    { n: 'Skydiving', c: 'Air & extreme' },
    { n: 'Paragliding', c: 'Air & extreme' },
    { n: 'Bungee jump', c: 'Air & extreme' },
    { n: 'Triathlon', c: 'Multi-sport' },
    { n: 'Ironman', c: 'Multi-sport' },
    { n: 'Hyrox', c: 'Multi-sport' },
    { n: 'Spartan', c: 'Multi-sport' }
  ],
    fitnessLevels: ['Just started','Recreational','Skilled','Highly skilled','Professional'],
    // ^ ONE connected vocabulary: a MEMBER's own ability AND a LISTING's required level use these same
    //   5 words, so a person's level connects to the listings they can attend. Listings add "All Levels"
    //   on top — see window.FFP_TAX.attendeeLevels below, derived from this so the two never drift apart.
    nationalities: [
      'Argentinian','Australian','Austrian','Belgian','Brazilian','British','Bulgarian',
      'Canadian','Chilean','Chinese','Colombian','Croatian','Czech','Danish','Dutch',
      'Egyptian','Emirati','Filipino','Finnish','French','German','Greek','Hungarian',
      'Indian','Indonesian','Irish','Israeli','Italian','Japanese','Jordanian','Kenyan',
      'Kuwaiti','Lebanese','Malaysian','Mexican','Moroccan','New Zealander','Nigerian',
      'Norwegian','Omani','Pakistani','Peruvian','Polish','Portuguese','Qatari','Romanian',
      'Russian','Saudi Arabian','Singaporean','South African','South Korean','Spanish',
      'Sri Lankan','Swedish','Swiss','Thai','Turkish','Ukrainian','American','Vietnamese'
    ]
  };
  // convenience: flat sorted city list across all countries
  window.FFP_TAX.allCities = function(){ var o=[]; var c=window.FFP_TAX.cities||{}; Object.keys(c).forEach(function(k){ (c[k]||[]).forEach(function(x){o.push(x);}); }); return o.sort(); };
  // Listing "who can attend?" scale = the member ability scale (fitnessLevels) + "All Levels" on top, so a
  // member's ability and a listing's required level use ONE connected vocabulary. Rebuilt on DB hydration.
  window.FFP_TAX.attendeeLevels = ['All Levels'].concat(window.FFP_TAX.fitnessLevels || []);
})();

(function () {
  var T = window.FFP_TAX || (window.FFP_TAX = {});
  T.genders = ['Male', 'Female', 'Prefer not to say']; // fallback only — matches the DB taxonomy (taxonomy_items list_key='gender'); DB is the source of truth and hydrates this on load
  // Passports (Pick A Passport on the member map). DB-driven: list = taxonomy_items list_key='passport';
  // each category's passport = that category row's `parent`. These are fallbacks until hydration.
  T.passports = [
    { id: 'sports', label: 'Sports' }, { id: 'fitness', label: 'Fitness' },
    { id: 'wellness', label: 'Wellness' }, { id: 'adventure', label: 'Adventure' },
    { id: 'food', label: 'Health Food' }
  ];
  T.categoryPassport = {  // category value → passport id (hydrated from DB category.parent)
    'Fitness': 'fitness', 'Coaching': 'fitness', 'Wellness': 'wellness', 'Yoga & Pilates': 'wellness',
    'Recovery': 'wellness', 'Padel': 'sports', 'Combat sports': 'sports', 'Adventure': 'adventure',
    'Climbing': 'adventure', 'Nutrition': 'food', 'Retail': 'food'
  };
  T.ageGroups = ['18-24', '25-34', '35-44', '45-54', '55+'];
  // Provider classification lists (fallbacks; DB taxonomy_items is the source of truth and hydrates these).
  // provider_type = the single facility/provider kind, used by the provider profile AND admin rankings.
  T.providerTypes = ['Single location', 'Remote', 'Event organizer'];  // partner type = how they operate (DB-hydrated from list_key='provider_type'; Admin-editable)
  T.gymSizes = ['Boutique (under 500)', 'Mid-size (500–2,000)', 'Large (2,000–7,500)', 'Mega (7,500+)', 'Not applicable'];
  T.phoneCodes = [
    { code: '+971', country: 'United Arab Emirates', flag: '🇦🇪' },{ code: '+93', country: 'Afghanistan', flag: '🇦🇫' },{ code: '+54', country: 'Argentina', flag: '🇦🇷' },{ code: '+61', country: 'Australia', flag: '🇦🇺' },{ code: '+43', country: 'Austria', flag: '🇦🇹' },{ code: '+973', country: 'Bahrain', flag: '🇧🇭' },{ code: '+32', country: 'Belgium', flag: '🇧🇪' },{ code: '+55', country: 'Brazil', flag: '🇧🇷' },{ code: '+359', country: 'Bulgaria', flag: '🇧🇬' },{ code: '+1', country: 'Canada', flag: '🇨🇦' },{ code: '+56', country: 'Chile', flag: '🇨🇱' },{ code: '+86', country: 'China', flag: '🇨🇳' },{ code: '+57', country: 'Colombia', flag: '🇨🇴' },{ code: '+385', country: 'Croatia', flag: '🇭🇷' },{ code: '+420', country: 'Czech Republic', flag: '🇨🇿' },{ code: '+45', country: 'Denmark', flag: '🇩🇰' },{ code: '+20', country: 'Egypt', flag: '🇪🇬' },{ code: '+358', country: 'Finland', flag: '🇫🇮' },{ code: '+33', country: 'France', flag: '🇫🇷' },{ code: '+49', country: 'Germany', flag: '🇩🇪' },{ code: '+30', country: 'Greece', flag: '🇬🇷' },{ code: '+852', country: 'Hong Kong', flag: '🇭🇰' },{ code: '+36', country: 'Hungary', flag: '🇭🇺' },{ code: '+91', country: 'India', flag: '🇮🇳' },{ code: '+62', country: 'Indonesia', flag: '🇮🇩' },{ code: '+98', country: 'Iran', flag: '🇮🇷' },{ code: '+353', country: 'Ireland', flag: '🇮🇪' },{ code: '+972', country: 'Israel', flag: '🇮🇱' },{ code: '+39', country: 'Italy', flag: '🇮🇹' },{ code: '+81', country: 'Japan', flag: '🇯🇵' },{ code: '+962', country: 'Jordan', flag: '🇯🇴' },{ code: '+254', country: 'Kenya', flag: '🇰🇪' },{ code: '+965', country: 'Kuwait', flag: '🇰🇼' },{ code: '+961', country: 'Lebanon', flag: '🇱🇧' },{ code: '+60', country: 'Malaysia', flag: '🇲🇾' },{ code: '+52', country: 'Mexico', flag: '🇲🇽' },{ code: '+212', country: 'Morocco', flag: '🇲🇦' },{ code: '+31', country: 'Netherlands', flag: '🇳🇱' },{ code: '+64', country: 'New Zealand', flag: '🇳🇿' },{ code: '+234', country: 'Nigeria', flag: '🇳🇬' },{ code: '+47', country: 'Norway', flag: '🇳🇴' },{ code: '+968', country: 'Oman', flag: '🇴🇲' },{ code: '+92', country: 'Pakistan', flag: '🇵🇰' },{ code: '+51', country: 'Peru', flag: '🇵🇪' },{ code: '+63', country: 'Philippines', flag: '🇵🇭' },{ code: '+48', country: 'Poland', flag: '🇵🇱' },{ code: '+351', country: 'Portugal', flag: '🇵🇹' },{ code: '+974', country: 'Qatar', flag: '🇶🇦' },{ code: '+40', country: 'Romania', flag: '🇷🇴' },{ code: '+7', country: 'Russia', flag: '🇷🇺' },{ code: '+966', country: 'Saudi Arabia', flag: '🇸🇦' },{ code: '+65', country: 'Singapore', flag: '🇸🇬' },{ code: '+27', country: 'South Africa', flag: '🇿🇦' },{ code: '+82', country: 'South Korea', flag: '🇰🇷' },{ code: '+34', country: 'Spain', flag: '🇪🇸' },{ code: '+94', country: 'Sri Lanka', flag: '🇱🇰' },{ code: '+46', country: 'Sweden', flag: '🇸🇪' },{ code: '+41', country: 'Switzerland', flag: '🇨🇭' },{ code: '+66', country: 'Thailand', flag: '🇹🇭' },{ code: '+90', country: 'Turkey', flag: '🇹🇷' },{ code: '+380', country: 'Ukraine', flag: '🇺🇦' },{ code: '+44', country: 'United Kingdom', flag: '🇬🇧' },{ code: '+1', country: 'United States', flag: '🇺🇸' },{ code: '+84', country: 'Vietnam', flag: '🇻🇳' }
  ];
  // Service-professional roles for the Professionals Portal — the main profession a Professional picks
  // when they join. Grouped under the 6 STANDARD FFP categories (Sports / Fitness / Wellness / Recovery /
  // Adventure / Health food). DB-managed in Admin → Taxonomies → Professions (list_key='professional_role';
  // each row's `parent` = its category). This hardcoded copy is a FALLBACK ONLY — it is overwritten IN
  // PLACE on load by the DB hydration below (apply() handles list_key='professional_role'). Service pros
  // only — business owners / athletes / creators are intentionally NOT included.
  T.professionalRoles = {
    'Sports': ['Aikido Instructor','American Football Coach','Archery Coach','Badminton Coach','Baseball Coach','Basketball Coach','Beach Volleyball Coach','BMX Coach','Boxing Coach','Brazilian Jiu-Jitsu Instructor','Capoeira Instructor','Cricket Coach','Cycling Coach','Equestrian Coach','Fencing Coach','Field Hockey Coach','Football (Soccer) Coach','Futsal Coach','Golf Coach','Handball Coach','Ice Hockey Coach','Judo Coach','Karate Sensei','Kickboxing Coach','Krav Maga Instructor','Lacrosse Coach','Marathon Coach','MMA Coach','Mountain Bike Coach','Muay Thai Coach','Open Water Swim Coach','Padel Coach','Pickleball Coach','Rugby Coach','Running Coach','Self-Defense Instructor','Shooting Coach','Skateboarding Coach','Speed & Agility Coach','Sprinting Coach','Squash Coach','Swim Coach','Table Tennis Coach','Taekwondo Instructor','Tennis Coach','Track & Field Coach','Trail Running Coach','Triathlon Coach','Ultimate Frisbee Coach','Ultra Endurance Coach','Volleyball Coach','Wrestling Coach'],
    'Fitness': ['Animal Flow Coach','Battle Rope Coach','Body Recomposition Coach','Bodybuilding Coach','Bootcamp Coach','Calisthenics Coach','Contest Prep Coach','CrossFit Coach','F45 Coach','Fat Loss Coach','Functional Training Coach','Group Fitness Instructor','Gymnastic Strength Coach','HIIT Coach','Hyrox Coach','Indoor Cycling / Spin Instructor','Kettlebell Coach','Lean Bulk Coach','Mobility Coach','Personal Trainer','Plyometric Coach','Powerlifting Coach','Pre/Postnatal Fitness Coach','Sandbag Training Coach','Senior Fitness Coach','Stability & Balance Coach','Strongman Coach','TRX / Suspension Coach','Walking / Hiking Coach','Weight Loss Coach','Weightlifting Coach (Olympic)','Youth Fitness Coach'],
    'Wellness': ['Aerial Yoga Instructor','Ballet Teacher','Ballroom Dance Instructor','Barre Instructor','Breathwork Coach','Choreographer','Contemporary Dance Instructor','Hip Hop Dance Instructor','Hot Yoga Instructor','Hypnotherapist','Latin Dance Instructor','Life Coach','Meditation Teacher','Mental Health Coach','Mental Performance Coach','Mindfulness Coach','Movement Specialist','Pilates Instructor (Mat)','Pole Fitness Instructor','Posture Coach','Reformer Pilates Instructor','Sports Psychologist','Stress Management Coach','Stretching Coach','Therapist / Counsellor','Yin Yoga Instructor','Yoga Instructor (Ashtanga)','Yoga Instructor (Hatha)','Yoga Instructor (Vinyasa)','Zumba Instructor'],
    'Recovery': ['Acupuncturist','Aromatherapist','Biomechanics Specialist','Chiropractor','Cold Exposure Practitioner','Cryotherapy Specialist','Deep Tissue Therapist','Energy Healer','Float Tank Therapist','Injury Prevention Coach','IV Therapy Specialist','Massage Therapist','Osteopath','Physiotherapist','Reflexologist','Rehabilitation Coach','Reiki Practitioner','Sauna / Heat Therapy Practitioner','Sound Healer','Sports Doctor','Sports Massage Therapist','Sports Physiotherapist','Sports Scientist','Sports Therapist','Stretching Therapist'],
    'Adventure': ['Adventure Guide','Bike Tour Guide','Bouldering Coach','Bushcraft Instructor','Canyoning Guide','Climbing Instructor','Freediving Instructor','Hiking Guide','Kayaking Instructor','Kitesurfing Instructor','Lifeguard / Aquatic Safety','Mountain Guide','Sailing Instructor','Scuba Diving Instructor','Ski Instructor','Snowboard Instructor','Spearfishing Guide','SUP (Paddleboard) Instructor','Surfing Instructor','Survival Instructor','Trekking Guide','Wakeboard Coach','Watersports Guide','Wilderness Instructor','Windsurfing Instructor'],
    'Health food': ['Functional Medicine Practitioner','Gut Health Coach','Health Coach','Holistic Health Practitioner','Holistic Nutrition Coach','Hormone Coach','Naturopath','Nutritionist','Performance Nutritionist','Plant-Based Nutrition Coach','Registered Dietitian','Sleep Coach','Sports Nutritionist','Wellness Coach']
  };
  // The 6 standard categories, in display order (the keys of professionalRoles, canonical order).
  T.professionalCategories = ['Sports', 'Fitness', 'Wellness', 'Recovery', 'Adventure', 'Health food'];
  // Flat [{name, category}] list across all categories (A–Z by name) — for the single searchable picker.
  T.professionalRolesFlat = function () {
    var out = [], roles = T.professionalRoles || {};
    Object.keys(roles).forEach(function (cat) { (roles[cat] || []).forEach(function (n) { out.push({ name: n, category: cat }); }); });
    return out.sort(function (a, b) { return a.name.localeCompare(b.name); });
  };
  // Which of the 6 categories a profession belongs to ('' if unknown).
  T.categoryOfRole = function (role) {
    var roles = T.professionalRoles || {}, cats = Object.keys(roles);
    for (var i = 0; i < cats.length; i++) { if ((roles[cats[i]] || []).indexOf(role) !== -1) return cats[i]; }
    return '';
  };
  // ── Professional-portal pick-lists (shared so every pro form reads the same vocabulary) ──
  T.languages     = ['English','Arabic','French','Spanish','German','Italian','Portuguese','Russian','Hindi','Urdu','Tagalog','Mandarin','Cantonese','Japanese','Korean','Thai','Bahasa Indonesia','Bahasa Malaysia','Vietnamese','Turkish','Farsi','Greek','Dutch','Swahili','Afrikaans'];
  T.sessionTypes  = { one_to_one: 'One on One', group: 'Group', assessment: 'Assessment' };
  T.serviceTypes  = { pt_session: 'Personal training session', assessment: 'Assessment', program: 'Program (e.g. 12-week)', group: 'Group session', other: 'Other' };
  T.clientStatus  = { active: 'Active', paused: 'Paused', archived: 'Archived' };
  T.packageTypes  = { sessions: 'Session pack', recurring: 'Recurring', term: 'Term' };
  T.commsChannels = { email: 'Email', push: 'Push', sms: 'SMS' };
  T.payMethods    = { cash: 'Cash', card: 'Card', transfer: 'Bank transfer', online: 'Online', other: 'Other' };
})();

/* ── DB HYDRATION (v4, 2026-06-01) ──────────────────────────────────────────────
   The Admin > Taxonomies panel edits public.taxonomy_items. On every page load we
   pull those lists and OVERRIDE the hardcoded FFP_TAX arrays IN PLACE (so admin
   changes propagate platform-wide). If the DB is empty/unreachable, the hardcoded
   lists above remain as a safe fallback — nothing breaks. Exposes window.FFP_TAX_READY
   (promise) and fires a document 'ffp-tax-ready' event so forms can rebuild if needed. */
(function () {
  'use strict';
  var T = window.FFP_TAX; if (!T) return;
  var SB_URL = 'https://kxzyuofecmtymablnmak.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4enl1b2ZlY210eW1hYmxubWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDM1MTYsImV4cCI6MjA5NTAxOTUxNn0.cWn0x1AeD-x9C-HHf9MShXbFRWdkWi5RMgHLgWJwOuE';

  // category 'c' would be lost for activities (taxonomy_items has no category),
  // so capture the original name->c map to preserve grouping for known activities.
  var actCat = {};
  (T.activities || []).forEach(function (a) { if (a && a.n) actCat[a.n] = a.c || ''; });

  function getClient() {
    var sb = window.supabase;
    if (sb && typeof sb.from === 'function') return sb;                 // already a client (dashboards)
    if (sb && typeof sb.createClient === 'function') return sb.createClient(SB_URL, SB_ANON); // UMD namespace
    return null;
  }
  function fill(arr, vals) { if (!arr) return; arr.length = 0; vals.forEach(function (v) { arr.push(v); }); }

  function apply(rows) {
    var by = {};
    rows.forEach(function (r) { (by[r.list_key] = by[r.list_key] || []).push(r); });
    // Name lists sort A–Z everywhere; ordinal lists (fitness_level, age_group, gym_size, gender,
    // experience_type, passport) keep their meaningful sort_order. One source → every form inherits it.
    var ALPHA = { activity: 1, nationality: 1, country: 1, city: 1, category: 1, provider_type: 1 };
    function vals(k) {
      var arr = (by[k] || []).slice();
      if (ALPHA[k]) arr.sort(function (a, b) { return String(a.label || a.value).localeCompare(String(b.label || b.value)); });
      else arr.sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
      return arr.map(function (r) { return r.label || r.value; });
    }
    if (by.activity) {
      // v8: activity category 'c' now comes from the DB (taxonomy_items.parent = the 6 platform categories:
      // fitness/sports/wellness/recovery/adventure/food), falling back to the legacy static map, then ''.
      // The DB is the single source of truth — Admin Taxonomy sets each activity's category.
      var actParent = {};
      by.activity.forEach(function (r) { var nm = r.label || r.value; if (r.parent) actParent[nm] = r.parent; });
      var names = vals('activity');
      T.activities.length = 0;
      names.forEach(function (n) { T.activities.push({ n: n, c: (actParent[n] || actCat[n] || '') }); });
    }
    if (by.fitness_level) { fill(T.fitnessLevels, vals('fitness_level')); T.attendeeLevels = ['All Levels'].concat(T.fitnessLevels); }
    if (by.nationality)   fill(T.nationalities, vals('nationality'));
    if (by.gender)        fill(T.genders, vals('gender'));
    if (by.age_group)     fill(T.ageGroups, vals('age_group'));
    if (by.category && window.FFP_CONST && window.FFP_CONST.providerCategories) {
      fill(window.FFP_CONST.providerCategories, vals('category'));
    }
    if (by.experience_type) { T.experienceTypes = vals('experience_type'); }
    if (by.provider_type)   fill(T.providerTypes, vals('provider_type'));
    if (by.gym_size)        fill(T.gymSizes, vals('gym_size'));
    // Professions (Professionals Portal) — grouped by `parent` = one of the 6 standard categories.
    // Admin → Taxonomies → Professions is the source of truth; overwrite T.professionalRoles in place.
    if (by.professional_role && by.professional_role.length) {
      var grp = {};
      by.professional_role.forEach(function (r) { var cat = r.parent || 'Other'; (grp[cat] = grp[cat] || []).push(r.label || r.value); });
      Object.keys(grp).forEach(function (c) { grp[c].sort(function (a, b) { return String(a).localeCompare(String(b)); }); });
      var ordered = {};
      (T.professionalCategories || []).forEach(function (c) { if (grp[c]) ordered[c] = grp[c]; });
      Object.keys(grp).forEach(function (c) { if (!ordered[c]) ordered[c] = grp[c]; });
      Object.keys(T.professionalRoles).forEach(function (k) { delete T.professionalRoles[k]; });
      Object.keys(ordered).forEach(function (k) { T.professionalRoles[k] = ordered[k]; });
    }
    // Passports + category→passport mapping (Pick A Passport). list = list_key='passport';
    // each category row's `parent` is its passport id.
    if (by.passport && by.passport.length) {
      T.passports = by.passport.slice()
        .sort(function (a, b) { return (a.sort_order || 0) - (b.sort_order || 0); })
        .map(function (r) { return { id: r.value, label: r.label || r.value }; });
    }
    if (by.category) {
      var cp = {};
      by.category.forEach(function (r) { if (r.parent) cp[r.value] = r.parent; });
      T.categoryPassport = cp;
    }
    if (by.city && by.city.length) {
      // rebuild the country -> [cities] map in place from the country + city lists
      var cityByCountry = {};
      by.city.slice().forEach(function (r) { if (r.parent) (cityByCountry[r.parent] = cityByCountry[r.parent] || []).push(r.label || r.value); });
      // cities A–Z within each country
      Object.keys(cityByCountry).forEach(function (c) { cityByCountry[c].sort(function (a, b) { return String(a).localeCompare(String(b)); }); });
      // countries A–Z
      var order = (by.country || []).slice().sort(function (a, b) { return String(a.label || a.value).localeCompare(String(b.label || b.value)); }).map(function (r) { return r.value; });
      Object.keys(T.cities).forEach(function (k) { delete T.cities[k]; });
      order.forEach(function (c) { if (cityByCountry[c]) T.cities[c] = cityByCountry[c]; });
      Object.keys(cityByCountry).forEach(function (c) { if (!T.cities[c]) T.cities[c] = cityByCountry[c]; });
    }
    try { document.dispatchEvent(new CustomEvent('ffp-tax-ready', { detail: { source: 'db' } })); } catch (e) {}
  }

  window.FFP_TAX_READY = (async function () {
    try {
      var c = getClient(); if (!c) return false;
      var res = await c.from('taxonomy_items')
        .select('list_key, value, label, sort_order, active, parent').eq('active', true);
      if (res.error || !res.data || !res.data.length) return false;
      apply(res.data);
      return true;
    } catch (e) { return false; }
  })();
})();
