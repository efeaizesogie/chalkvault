// Starting points for the setup wizard. Everything is editable afterwards.
export const COUNTRY_PRESETS: Record<string, { levels: string[]; term: string; subjects: string[] }> = {
  Nigeria: {
    levels: ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'],
    term: 'First term',
    subjects: ['English Language', 'Mathematics', 'Basic Science', 'Social Studies', 'Civic Education', 'Yoruba', 'Igbo', 'Hausa', 'Computer Studies', 'Agricultural Science'],
  },
  Ghana: {
    levels: ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'JHS 1', 'JHS 2', 'JHS 3', 'SHS 1', 'SHS 2', 'SHS 3'],
    term: 'Term 1',
    subjects: ['English Language', 'Mathematics', 'Integrated Science', 'Social Studies', 'Ghanaian Language', 'ICT'],
  },
  Kenya: {
    levels: ['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9'],
    term: 'Term 1',
    subjects: ['English', 'Kiswahili', 'Mathematics', 'Integrated Science', 'Social Studies', 'Creative Arts'],
  },
  'United Kingdom': {
    levels: ['Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11'],
    term: 'Autumn term',
    subjects: ['English', 'Mathematics', 'Science', 'History', 'Geography', 'Computing', 'Art'],
  },
  'United States': {
    levels: ['Kindergarten', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
    term: 'Fall semester',
    subjects: ['English Language Arts', 'Mathematics', 'Science', 'Social Studies', 'Spanish', 'Art'],
  },
  Other: {
    levels: ['Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6'],
    term: 'Term 1',
    subjects: ['English', 'Mathematics', 'Science'],
  },
};
export const COUNTRIES = Object.keys(COUNTRY_PRESETS);
