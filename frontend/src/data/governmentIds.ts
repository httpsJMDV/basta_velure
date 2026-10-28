/** Government-issued IDs only: every account is 18 or older, so a school ID is not accepted. */
export const GOV_ID_OPTIONS = [
  { value: 'national_id',     label: 'National ID (PhilSys)' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'passport',        label: 'Passport' },
  { value: 'umid',            label: 'UMID' },
  { value: 'sss_id',          label: 'SSS ID' },
  { value: 'philhealth_id',   label: 'PhilHealth ID' },
  { value: 'voters_id',       label: "Voter's ID" },
  { value: 'postal_id',       label: 'Postal ID' },
];

/** ID types with information on the back, so both sides are needed (BuyerRegisterRequest::requiresBack). */
export const ID_REQUIRES_BACK = new Set(['drivers_license', 'umid', 'sss_id', 'philhealth_id', 'voters_id', 'postal_id']);
