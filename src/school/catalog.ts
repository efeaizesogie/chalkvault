// Suggestions shown wherever a school picks subjects, class levels or arm names, so nobody has to type them all.
// Grouped the way schools think about them. Anything not listed can still be typed in.

export interface Group {
  label: string;
  items: string[];
}

const NG_SUBJECTS: Group[] = [
  {
    label: 'Nursery and primary',
    items: [
      'English Language', 'Mathematics', 'Basic Science', 'Basic Technology', 'Social Studies', 'Civic Education', 'Christian Religious Studies', 'Islamic Religious Studies',
      'Cultural and Creative Arts', 'Physical and Health Education', 'Computer Studies', 'Agricultural Science', 'Home Economics', 'Verbal Reasoning', 'Quantitative Reasoning',
      'Phonics', 'Handwriting', 'Number Work', 'Letter Work', 'Rhymes', 'French', 'Yoruba', 'Igbo', 'Hausa', 'History', 'Security Education',
    ],
  },
  {
    label: 'Junior secondary',
    items: [
      'English Language', 'Mathematics', 'Basic Science', 'Basic Technology', 'Physical and Health Education', 'Information Technology', 'Social Studies', 'Civic Education',
      'Security Education', 'Christian Religious Studies', 'Islamic Religious Studies', 'Cultural and Creative Arts', 'Agricultural Science', 'Home Economics', 'Business Studies',
      'French', 'Arabic', 'Yoruba', 'Igbo', 'Hausa', 'History', 'Music',
    ],
  },
  {
    label: 'Senior secondary: core',
    items: ['English Language', 'Mathematics', 'Civic Education', 'Computer Studies', 'Data Processing'],
  },
  { label: 'Senior secondary: sciences', items: ['Physics', 'Chemistry', 'Biology', 'Further Mathematics', 'Agricultural Science', 'Geography', 'Technical Drawing', 'Health Education', 'Physical Education', 'Food and Nutrition'] },
  {
    label: 'Senior secondary: arts and humanities',
    items: ['Literature in English', 'Government', 'History', 'Christian Religious Studies', 'Islamic Religious Studies', 'Fine Arts', 'Visual Arts', 'Music', 'French', 'Arabic', 'Yoruba', 'Igbo', 'Hausa'],
  },
  { label: 'Senior secondary: commercial', items: ['Economics', 'Financial Accounting', 'Commerce', 'Office Practice', 'Insurance', 'Marketing', 'Book Keeping', 'Store Management'] },
  {
    label: 'Trade subjects',
    items: ['Catering Craft Practice', 'Garment Making', 'Dyeing and Bleaching', 'Photography', 'Cosmetology', 'Electrical Installation', 'Auto Mechanics', 'Carpentry and Joinery', 'Welding and Fabrication', 'Animal Husbandry', 'Fishery', 'Tourism', 'Leatherwork', 'GSM Maintenance', 'Block Laying and Concreting'],
  },
];

const INTL_SUBJECTS: Group[] = [
  { label: 'Core', items: ['English', 'Mathematics', 'Science', 'Integrated Science', 'Social Studies', 'ICT', 'Computing', 'Physical Education', 'Religious Education', 'Art and Design', 'Music', 'Drama'] },
  { label: 'Sciences', items: ['Physics', 'Chemistry', 'Biology', 'Further Mathematics', 'Statistics', 'Design and Technology', 'Food Technology', 'Environmental Science'] },
  { label: 'Humanities', items: ['History', 'Geography', 'Economics', 'Business Studies', 'Accounting', 'Government', 'Literature', 'Psychology', 'Sociology', 'Citizenship'] },
  { label: 'Languages', items: ['French', 'Spanish', 'German', 'Arabic', 'Mandarin', 'Kiswahili', 'Twi', 'Ewe', 'Ga', 'Latin'] },
];

/** Subject suggestions for a country, most relevant group first. */
export const subjectGroups = (country: string) => (country === 'Nigeria' ? NG_SUBJECTS : [...INTL_SUBJECTS, ...NG_SUBJECTS.slice(0, 1)]);

const LEVELS: Record<string, Group[]> = {
  Nigeria: [
    { label: 'Early years', items: ['Creche', 'Pre-nursery', 'Nursery 1', 'Nursery 2', 'Nursery 3', 'Kindergarten 1', 'Kindergarten 2'] },
    { label: 'Primary', items: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6'] },
    { label: 'Junior secondary', items: ['JSS 1', 'JSS 2', 'JSS 3'] },
    { label: 'Senior secondary', items: ['SS 1', 'SS 2', 'SS 3'] },
    { label: 'Basic (UBE naming)', items: ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 7', 'Basic 8', 'Basic 9'] },
    { label: 'British-style', items: ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12'] },
  ],
  Ghana: [
    { label: 'Early years', items: ['Creche', 'Nursery 1', 'Nursery 2', 'KG 1', 'KG 2'] },
    { label: 'Primary', items: ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6'] },
    { label: 'Junior high', items: ['JHS 1', 'JHS 2', 'JHS 3'] },
    { label: 'Senior high', items: ['SHS 1', 'SHS 2', 'SHS 3'] },
  ],
  Kenya: [
    { label: 'Pre-primary', items: ['PP1', 'PP2'] },
    { label: 'Primary', items: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6'] },
    { label: 'Junior school', items: ['Grade 7', 'Grade 8', 'Grade 9'] },
    { label: 'Senior school', items: ['Grade 10', 'Grade 11', 'Grade 12'] },
  ],
  'United Kingdom': [
    { label: 'Early years', items: ['Nursery', 'Reception'] },
    { label: 'Primary', items: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'] },
    { label: 'Secondary', items: ['Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11'] },
    { label: 'Sixth form', items: ['Year 12', 'Year 13'] },
  ],
  'United States': [
    { label: 'Early years', items: ['Pre-K', 'Kindergarten'] },
    { label: 'Elementary', items: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5'] },
    { label: 'Middle school', items: ['Grade 6', 'Grade 7', 'Grade 8'] },
    { label: 'High school', items: ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'] },
  ],
};

/** Class level suggestions for a country, in school order. */
export const levelGroups = (country: string) => LEVELS[country] ?? [...LEVELS.Nigeria.slice(0, 4), LEVELS['United Kingdom'][1], LEVELS['United Kingdom'][2]];

/** Arm names schools use, from letters to colours, gems, houses and SS streams. */
export const ARM_GROUPS: Group[] = [
  { label: 'Letters', items: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  { label: 'Colours', items: ['Blue', 'Red', 'Green', 'Yellow', 'Purple', 'Orange', 'Gold', 'Silver'] },
  { label: 'Gems', items: ['Diamond', 'Emerald', 'Ruby', 'Sapphire', 'Pearl', 'Onyx', 'Topaz', 'Crystal'] },
  { label: 'Virtues', items: ['Faith', 'Hope', 'Love', 'Grace', 'Joy', 'Peace', 'Wisdom', 'Excellence'] },
  { label: 'Senior streams', items: ['Science', 'Art', 'Commercial', 'Technical'] },
];

/** All items of some groups, without repeats, in order. */
export const flat = (groups: Group[]) => [...new Set(groups.flatMap((g) => g.items))];
