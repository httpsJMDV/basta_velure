// Single entry point for all Philippine location data.
// Import PH_PROVINCES and PH_DISTRICTS from here — do not import regional files directly.

import { PH_DISTRICTS as PH_DISTRICTS_R1_NCR } from './ph-districts';
import { PH_DISTRICTS_R2 } from './ph-districts-r2';
import { PH_DISTRICTS_R3 } from './ph-districts-r3';
import { PH_DISTRICTS_R4A } from './ph-districts-r4a';
import { PH_DISTRICTS_R4B } from './ph-districts-r4b';
import { PH_DISTRICTS_R5 } from './ph-districts-r5';
import { PH_DISTRICTS_R6 } from './ph-districts-r6';
import { PH_DISTRICTS_R7 } from './ph-districts-r7';
import { PH_DISTRICTS_R8 } from './ph-districts-r8';
import { PH_DISTRICTS_R9 } from './ph-districts-r9';
import { PH_DISTRICTS_R10 } from './ph-districts-r10';
import { PH_DISTRICTS_R11 } from './ph-districts-r11';
import { PH_DISTRICTS_R12 } from './ph-districts-r12';
import { PH_DISTRICTS_R13 } from './ph-districts-r13';
import { PH_DISTRICTS_CAR } from './ph-districts-car';
import { PH_DISTRICTS_BARMM } from './ph-districts-barmm';

export { PH_PROVINCES } from './ph-provinces';

export const PH_DISTRICTS: Record<string, { value: string; label: string }[]> = {
  ...PH_DISTRICTS_R1_NCR,
  ...PH_DISTRICTS_R2,
  ...PH_DISTRICTS_R3,
  ...PH_DISTRICTS_R4A,
  ...PH_DISTRICTS_R4B,
  ...PH_DISTRICTS_R5,
  ...PH_DISTRICTS_R6,
  ...PH_DISTRICTS_R7,
  ...PH_DISTRICTS_R8,
  ...PH_DISTRICTS_R9,
  ...PH_DISTRICTS_R10,
  ...PH_DISTRICTS_R11,
  ...PH_DISTRICTS_R12,
  ...PH_DISTRICTS_R13,
  ...PH_DISTRICTS_CAR,
  ...PH_DISTRICTS_BARMM,
};
