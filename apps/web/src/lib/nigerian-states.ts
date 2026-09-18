/**
 * The 36 states plus the Federal Capital Territory, for a "state of origin"
 * field.
 *
 * Not master data: master data (`vehicle_category`, `designation`, `lga`) is
 * Union-scoped content the Union supplies and can change. This list is the
 * fixed set of Nigerian states — nobody's state of origin is a value the
 * Union chooses, and there is nowhere else in the System that already serves
 * it (`lga` covers only Anambra's 22 local government areas).
 */
export const NIGERIAN_STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Federal Capital Territory',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;
