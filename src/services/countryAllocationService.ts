import Registration from '../models/Registration';

// ─────────────────────────────────────────────────────────────────────────────
// COUNTRY / PORTFOLIO POOLS  (edit these lists to manage the draw)
// ─────────────────────────────────────────────────────────────────────────────
export const COMMITTEE_COUNTRY_POOL: Record<string, string[]> = {
  'Crisis Committee': [
    'United States of America', 'Iran', 'Israel', 'Russian Federation', 'China',
    'United Kingdom', 'France', 'Saudi Arabia', 'United Arab Emirates', 'Qatar',
    'Iraq', 'Syria', 'Jordan', 'Turkey', 'Pakistan', 'India', 'Germany', 'Japan',
    'South Korea', 'Egypt', 'Lebanon', 'Yemen', 'Oman', 'Kuwait', 'Bahrain',
    'North Korea', 'Ukraine', 'Brazil', 'South Africa', 'Australia'
  ],
  'UN Human Rights Council (UNHRC)': [
    'Myanmar', 'Bangladesh', 'India', 'China', 'Indonesia', 'Malaysia', 'Thailand',
    'United States of America', 'United Kingdom', 'France', 'Germany', 'Russian Federation',
    'Japan', 'Saudi Arabia', 'Pakistan', 'Turkey', 'Qatar', 'United Arab Emirates',
    'Australia', 'Brazil', 'South Korea', 'Nepal', 'Sri Lanka', 'South Africa',
    'Nigeria', 'Egypt', 'Venezuela', 'Philippines', 'Vietnam', 'Switzerland',
    'Canada', 'New Zealand', 'Norway', 'Denmark', 'Ireland', 'Maldives', 'Cambodia',
    'Laos', 'Iran', 'Somalia'
  ],
  'UN General Assembly (UNGA)': [
    'United States of America', 'United Kingdom', 'France', 'Russian Federation', 'China',
    'India', 'Japan', 'Germany', 'Brazil', 'Italy', 'Pakistan', 'South Korea',
    'Mexico', 'Nigeria', 'South Africa', 'Egypt', 'Kenya', 'Indonesia', 'Turkey',
    'Saudi Arabia', 'Australia', 'Canada', 'Spain', 'Netherlands', 'Sweden',
    'Ukraine', 'Norway', 'Denmark', 'Finland', 'Switzerland', 'Belgium',
    'Portugal', 'Greece', 'Ireland', 'New Zealand', 'Singapore', 'Malaysia',
    'Thailand', 'Vietnam', 'Bangladesh', 'Sri Lanka', 'Nepal', 'Iran',
    'Iraq', 'Israel', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Jordan',
    'Algeria', 'Chile', 'EU (Observer Nation)', 'AU (Observer Nation)',
    'LAS (Observer Nation)', 'Cuba', 'Afghanistan', 'Venezuela', 'Syria',
    'DPRK', 'Belarus'
  ],
  'Economic and Social Council (ECOSOC)': [
    'United States of America', 'China', 'India', 'United Kingdom', 'Germany', 'France',
    'Japan', 'South Korea', 'Canada', 'Israel', 'Singapore', 'United Arab Emirates',
    'Estonia', 'Rwanda', 'Brazil', 'South Africa', 'Nigeria', 'Kenya', 'Indonesia',
    'Switzerland', 'Netherlands', 'Finland', 'Sweden', 'Australia', 'Saudi Arabia',
    'Mexico', 'Norway', 'Denmark', 'Ireland', 'New Zealand', 'Malaysia', 'Vietnam',
    'Philippines', 'Bangladesh', 'Egypt', 'Morocco', 'Argentina', 'Chile', 'Colombia',
    'Qatar'
  ],
  'International Labour Organization (ILO)': [
    'United States of America', 'Germany', 'Japan', 'India', 'China', 'France',
    'United Kingdom', 'Brazil', 'South Africa', 'Sweden', 'Denmark', 'Russian Federation',
    'South Korea', 'Bangladesh', 'Qatar', 'Saudi Arabia', 'Nigeria', 'Kenya',
    'Mexico', 'Argentina', 'Canada', 'Australia', 'Netherlands', 'Italy',
    'Indonesia', 'DPRK', 'Spain', 'Pakistan', 'Egypt', 'Sudan'
  ],
  'Social, Humanitarian and Cultural Committee (SOCHUM)': [
    'United States of America', 'China', 'Russian Federation', 'Germany', 'France',
    'United Kingdom', 'India', 'Israel', 'Brazil', 'South Africa', 'Iran',
    'North Korea', 'Saudi Arabia', 'Turkey', 'Egypt', 'Pakistan', 'Mexico',
    'Nigeria', 'Sweden', 'Netherlands', 'Switzerland', 'Japan', 'South Korea',
    'Australia', 'Canada', 'Estonia', 'Singapore', 'Belarus', 'Venezuela', 'Cuba',
    'Vietnam', 'Belgium', 'Norway', 'Denmark', 'Finland', 'Ireland', 'New Zealand',
    'Argentina', 'Kenya', 'Indonesia'
  ],
  'UN Environment Programme (UNEP)': [
    'China', 'United States of America', 'Norway', 'India', 'Japan', 'South Korea',
    'United Kingdom', 'France', 'Germany', 'Canada', 'Australia', 'Chile', 'Mexico',
    'Brazil', 'Russian Federation', 'Nauru', 'Tonga', 'Fiji', 'Kiribati', 'Cook Islands',
    'Papua New Guinea', 'Indonesia', 'New Zealand', 'Netherlands', 'Jamaica',
    'Costa Rica', 'Palau', 'Belgium', 'Tuvalu', 'Solomon Islands', 'Vanuatu', 'Samoa',
    'Maldives', 'Seychelles', 'Bangladesh', 'Philippines', 'South Africa', 'Kenya',
    'Denmark', 'Sweden'
  ],
  'United States Senate (US SENATE)': [
    'Jim Risch (Republican, Idaho) - Chairman, Committee on Foreign Relations',
    'Jeanne Shaheen (Democrat, New Hampshire) - Ranking Member, Committee on Foreign Relations',
    'Tim Kaine (Democrat, Virginia)',
    'Chris Coons (Democrat, Delaware)',
    'John Cornyn (Republican, Texas)',
    'Roger Wicker (Republican, Mississippi) - Chairman, Committee on Armed Services',
    'Lisa Murkowski (Republican, Alaska)',
    'Chuck Schumer (Democrat, New York) - Senate Minority Leader',
    'Bernie Sanders (Independent, Vermont)',
    'Elizabeth Warren (Democrat, Massachusetts)',
    'Rand Paul (Republican, Kentucky)',
    'Ted Cruz (Republican, Texas)',
    'Josh Hawley (Republican, Missouri)',
    'Cory Booker (Democrat, New Jersey)',
    'Mark Warner (Democrat, Virginia)',
    'Susan Collins (Republican, Maine)',
    'Mitch McConnell (Republican, Kentucky)',
    'John Thune (Republican, South Dakota) - Senate Majority Leader',
    'Ruben Gallego (Democrat, Arizona)',
    'Elissa Slotkin (Democrat, Michigan)',
    'Jon Ossoff (Democrat, Georgia)',
    'Adam Schiff (Democrat, California)',
    'Chris Murphy (Democrat, Connecticut)',
    'Jack Reed (Democrat, Rhode Island)',
    'Dick Durbin (Democrat, Illinois) - Senate Minority Whip',
    'John Fetterman (Democrat, Pennsylvania)',
    'Tammy Duckworth (Democrat, Illinois)',
    'Gary Peters (Democrat, Michigan)',
    'Ron Wyden (Democrat, Oregon)',
    'Ed Markey (Democrat, Massachusetts)',
    'Steve Daines (Republican, Montana)',
    'Tom Cotton (Republican, Arkansas)',
    'Joni Ernst (Republican, Iowa)',
    'Dan Sullivan (Republican, Alaska)',
    'John Barrasso (Republican, Wyoming) - Senate Majority Whip',
    'Bill Cassidy (Republican, Louisiana)',
    'Mike Lee (Republican, Utah)',
    'Rick Scott (Republican, Florida)',
    'Jim Justice (Republican, West Virginia)',
    'Angus King (Independent, Maine)'
  ],
  'Lok Sabha': [
    'Prime Minister (BJP, Uttar Pradesh)',
    'Union Home Minister (BJP, Gujarat)',
    'Union Defence Minister (BJP, Uttar Pradesh)',
    'Union Finance Minister (BJP, Karnataka)',
    'Union Minister for Railways, Information & Broadcasting and Electronics & IT (BJP, Odisha)',
    'Union Minister for Agriculture & Farmers Welfare (BJP, Madhya Pradesh)',
    'Union Education Minister (BJP, Odisha)',
    'Union Commerce & Industry Minister (BJP, Maharashtra)',
    'Union Coal & Mines Minister (BJP, Telangana)',
    'Union Parliamentary Affairs & Minority Affairs Minister (BJP, Arunachal Pradesh)',
    'Union Food Processing Industries Minister (LJP (RV), Bihar)',
    'Union Jal Shakti Minister (BJP, Gujarat)',
    'Union Tribal Affairs Minister (BJP, Odisha)',
    'MP (BJP, Himachal Pradesh) - 1',
    'MP (BJP, Karnataka) - 1',
    'MP (BJP, Jharkhand) - 1',
    'MP (BJP, Bihar) - 1',
    'MP (BJP, Uttar Pradesh) - 1',
    'MP (BJP, Delhi) - 1',
    'MP (BJP, Himachal Pradesh) - 2',
    'MP (BJP, Delhi) - 2',
    'Leader of Opposition (INC, Uttar Pradesh)',
    'MP (INC, Kerala) - 1',
    'MP (INC, Kerala) - 2',
    'MP (INC, Assam) - 1',
    'MP (INC, Kerala) - 3',
    'MP (INC, Tamil Nadu) - 1',
    'MP (INC, Tamil Nadu) - 2',
    'MP (Samajwadi Party, Uttar Pradesh) - 1',
    'MP (Samajwadi Party, Uttar Pradesh) - 2',
    'MP (Samajwadi Party, Uttar Pradesh) - 3',
    'MP (All India Trinamool Congress, West Bengal) - 1',
    'MP (All India Trinamool Congress, West Bengal) - 2',
    'MP (DMK, Tamil Nadu) - 1',
    'MP (DMK, Tamil Nadu) - 2',
    'MP (DMK, Tamil Nadu) - 3',
    'MP (AIMIM, Telangana) - 1',
    'MP (NCP (SP), Maharashtra) - 1',
    'MP (Shiv Sena, Maharashtra) - 1',
    'MP (Shiromani Akali Dal, Punjab) - 1'
  ],
  'International Press Plenary (IPP)': ['N/A'],
  'International Press Journalism (IPJ)': ['N/A'],
  'UN Security Council (UNSC) (Double delegation)': [
    'United States of America', 'United Kingdom', 'France', 'Russian Federation', 'China',
    'India', 'Japan', 'South Korea', 'Israel', 'Iran', 'Saudi Arabia', 'United Arab Emirates',
    'Turkey', 'Pakistan', 'Egypt', 'Indonesia', 'Qatar', 'Australia', 'Netherlands', 'Nigeria'
  ]
};

const COMMITTEE_ALIASES: Record<string, string> = {
  'crisis': 'Crisis Committee',
  'crisis committee': 'Crisis Committee',
  'unhrc': 'UN Human Rights Council (UNHRC)',
  'un human rights council': 'UN Human Rights Council (UNHRC)',
  'un human rights council (unhrc)': 'UN Human Rights Council (UNHRC)',
  'unga': 'UN General Assembly (UNGA)',
  'un general assembly': 'UN General Assembly (UNGA)',
  'un general assembly (unga)': 'UN General Assembly (UNGA)',
  'unsc': 'UN Security Council (UNSC) (Double delegation)',
  'un security council': 'UN Security Council (UNSC) (Double delegation)',
  'un security council (unsc) (double delegation)': 'UN Security Council (UNSC) (Double delegation)',
  'ecosoc': 'Economic and Social Council (ECOSOC)',
  'economic and social council': 'Economic and Social Council (ECOSOC)',
  'economic and social council (ecosoc)': 'Economic and Social Council (ECOSOC)',
  'ilo': 'International Labour Organization (ILO)',
  'international labour organization': 'International Labour Organization (ILO)',
  'international labour organization (ilo)': 'International Labour Organization (ILO)',
  'sochum': 'Social, Humanitarian and Cultural Committee (SOCHUM)',
  'social, humanitarian and cultural committee': 'Social, Humanitarian and Cultural Committee (SOCHUM)',
  'social humanitarian and cultural committee': 'Social, Humanitarian and Cultural Committee (SOCHUM)',
  'social, humanitarian and cultural committee (sochum)': 'Social, Humanitarian and Cultural Committee (SOCHUM)',
  'unep': 'UN Environment Programme (UNEP)',
  'un environment programme': 'UN Environment Programme (UNEP)',
  'un environment programme (unep)': 'UN Environment Programme (UNEP)',
  'ipp': 'International Press Plenary (IPP)',
  'international press plenary': 'International Press Plenary (IPP)',
  'international press plenary (ipp)': 'International Press Plenary (IPP)',
  'ipj': 'International Press Journalism (IPJ)',
  'international press journalism': 'International Press Journalism (IPJ)',
  'international press journalism (ipj)': 'International Press Journalism (IPJ)',
  'us senate': 'United States Senate (US SENATE)',
  'us senate (us senate)': 'United States Senate (US SENATE)',
  'united states senate': 'United States Senate (US SENATE)',
  'united states senate (us senate)': 'United States Senate (US SENATE)',
  'senate': 'United States Senate (US SENATE)',
  'lok sabha': 'Lok Sabha',
  'loksabha': 'Lok Sabha',
};

export const normalise = (name: string): string => {
  const key = (name || '').toLowerCase().trim();
  return COMMITTEE_ALIASES[key] || Object.keys(COMMITTEE_COUNTRY_POOL).find(
    (k) => k.toLowerCase() === key
  ) || name;
};

/**
 * Randomly picks an unallocated country for the given committee, respecting a temporary set.
 */
export const allocateCountryWithTemp = async (committeeRaw: string, tempAllocated: string[] = []): Promise<string | null> => {
  const committee = normalise(committeeRaw);
  const pool = COMMITTEE_COUNTRY_POOL[committee];
  if (!pool || pool.length === 0) return null;

  const countsMap = new Map<string, number>();

  // 1. Fetch all individual registrations with this committee and non-empty country
  const individualRegs = await Registration.find(
    { 
      registrationType: 'individual', 
      allocatedCommittee: { $regex: new RegExp(`^${committee}$`, 'i') }, 
      allocatedCountry: { $ne: '' } 
    },
    { allocatedCountry: 1 }
  ).lean();

  individualRegs.forEach((r: any) => {
    if (r.details?.seatStatus === 'Cancelled') return;
    if (r.allocatedCountry) {
      const cLower = r.allocatedCountry.toLowerCase();
      countsMap.set(cLower, (countsMap.get(cLower) || 0) + 1);
    }
  });

  // 2. Fetch all school registrations and scan their delegates roster
  const schoolRegs = await Registration.find(
    { registrationType: 'school' }
  ).lean();

  schoolRegs.forEach((r: any) => {
    if (r.details?.seatStatus === 'Cancelled') return;
    const roster = r.details?.delegates || r.details?.delegatesList || [];
    roster.forEach((del: any) => {
      if (del.seatStatus === 'Cancelled') return;
      const delComm = normalise(del.allocatedCommittee || del.selectedCommittee || '');
      if (delComm.toLowerCase() === committee.toLowerCase() && del.allocatedCountry) {
        const cLower = del.allocatedCountry.toLowerCase();
        countsMap.set(cLower, (countsMap.get(cLower) || 0) + 1);
      }
    });
  });

  // 3. Include any temporarily allocated countries (for current batch/roster processing)
  tempAllocated.forEach((c) => {
    const cLower = c.toLowerCase();
    countsMap.set(cLower, (countsMap.get(cLower) || 0) + 1);
  });

  // UNSC has double delegation (exactly 2 seats per country = 40 delegates).
  // All other committees have exactly 1 seat per country/portfolio.
  const isDoubleDelegation = committee.toLowerCase().includes('unsc') || committee.toLowerCase().includes('security council');
  const maxSeatsPerCountry = isDoubleDelegation ? 2 : 1;

  const available = pool.filter((c) => {
    const count = countsMap.get(c.toLowerCase()) || 0;
    return count < maxSeatsPerCountry;
  });

  if (available.length === 0) return null;

  // Fisher-Yates shuffle then pick first
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled[0];
};

/**
 * Randomly picks an unallocated country for the given committee.
 * Returns null if the pool is exhausted or the committee is unknown.
 */
export const allocateCountry = async (committeeRaw: string): Promise<string | null> => {
  return allocateCountryWithTemp(committeeRaw);
};

/**
 * Allocates unique countries to each delegate in a school delegation roster.
 * Mutates the delegates array in-place by setting .allocatedCountry on each entry.
 */
export const allocateCountriesForRoster = async (
  delegates: Array<{ selectedCommittee?: string; allocatedCountry?: string; [key: string]: any }>
): Promise<void> => {
  // Store newly allocated countries during this loop to prevent double allocations in the same batch
  const tempAllocated: string[] = [];
  for (const del of delegates) {
    if (del.allocatedCountry && del.allocatedCountry.trim() !== '' && !del.allocatedCountry.toLowerCase().includes('pending')) {
      tempAllocated.push(del.allocatedCountry.toLowerCase());
      continue; // keep existing allocation permanently!
    }
    const committee = del.selectedCommittee || '';
    const country = await allocateCountryWithTemp(committee, tempAllocated);
    if (country) {
      del.allocatedCountry = country;
      tempAllocated.push(country.toLowerCase());
    }
  }
};
