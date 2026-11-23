// Domain types shared by storage, services and UI. Dates are ISO strings
// (YYYY-MM-DD) in the farm's local calendar; areas are always stored in hectares.

import type { Boundary } from './geo';

export type Lang = 'et' | 'en';
export type Localized = Record<Lang, string>;

export interface Farm {
  id: string;
  name: string;
  owner: string;
  registryCode?: string;
  isDemo: boolean;
  createdAt: string;
}

export type CommunityType =
  | 'coastal-meadow'
  | 'alvar'
  | 'floodplain-meadow'
  | 'wooded-meadow'
  | 'dry-meadow'
  | 'fen-meadow'
  | 'other';

export interface Parcel {
  id: string;
  farmId: string;
  name: string;
  code?: string;
  communityType: CommunityType;
  areaHa: number;
  /** A point inside the plot, used for weather. */
  lat: number;
  lon: number;
  plannedMethod: 'mowing' | 'grazing' | 'mowing-and-grazing';
  notes?: string;
  isDemo?: boolean;
  /** Real outline, WGS 84. Absent for plots entered as a point (and for the demo farm). */
  boundary?: Boundary;
  /** Where the outline and facts came from. */
  source?: { kind: 'pria' | 'cadastre' | 'file'; ref: string; fetchedAt: string };
  /** Facts from PRIA's public heritage meadow register, as of `source.fetchedAt`. */
  pria?: PriaMeadowInfo;
  cadastralId?: string;
}

export interface PriaMeadowInfo {
  meadowNo: string;
  /** Short area code (e.g. '1', '2E'). PRIA's field is free text, so anything else is hidden: applicants sometimes typed a person's name there. */
  areaNo?: string;
  /** PRIA's numeric id of the area; stable, used for references. */
  areaId?: number;
  year: number;
  /** PRIA's meadow type code, e.g. 'MN' (other meadow) or 'PN' (wooded meadow). */
  meadowType: string;
  /** PRIA's maintenance choice code: 'N' mowing, 'K' grazing, others shown as given. */
  maintenance?: string;
  /** Mowing or grazing start date in the register (YYYY-MM-DD, Estonian time). */
  startDate?: string;
  coastalExtra: boolean;
  officialAreaHa?: number;
}

export type EntryKind = 'mowing' | 'grazing' | 'missed';
export type MissedReason = 'too-wet' | 'drought' | 'no-livestock' | 'no-feed-demand' | 'machinery' | 'other';

export interface LogEntry {
  id: string;
  parcelId: string;
  kind: EntryKind;
  /** Start date of the work (or of the missed window). */
  date: string;
  /** End date; for missed-work entries this closes the window. */
  endDate?: string;
  method?: string;
  /** Mowing: the day the cut hay was taken off the meadow. */
  hayRemovedDate?: string;
  /** For missed entries: what had been planned. */
  plannedAction?: 'mowing' | 'grazing';
  reason?: MissedReason;
  /** Area affected by this entry; defaults to the whole parcel. */
  areaHa?: number;
  animals?: string;
  notes?: string;
  photoIds: string[];
  /** When the entry was first saved (date and time). */
  createdAt: string;
  /** When the entry was last edited, if ever. */
  updatedAt?: string;
  isDemo?: boolean;
}

export interface PhotoMeta {
  id: string;
  entryId?: string;
  parcelId?: string;
  fileName: string;
  takenAt?: string; // ISO datetime from EXIF or file timestamp
  takenAtSource: 'exif' | 'file' | 'manual' | 'demo';
  lat?: number;
  lon?: number;
  locationSource?: 'exif' | 'browser' | 'none';
  caption?: string;
  isDemoIllustration?: boolean;
  blob: Blob;
}

export interface ChecklistState {
  parcelId: string;
  answers: Record<string, 'yes' | 'no' | 'unsure' | undefined>;
  updatedAt: string;
}

export interface Settings {
  lang: Lang;
  theme: 'system' | 'light' | 'dark';
  /** Living-meadow animation and motion; 'reduced' also applies when the OS asks for reduced motion. */
  effects: 'full' | 'reduced';
  /** Reading size for the whole app. */
  textSize: 'normal' | 'large' | 'xl';
  welcomeDone: boolean;
  tourDone: boolean;
  /** Working-day window for notifying exceptional circumstances. PRIA's figure; unverified for the Environmental Board. */
  noticeWorkingDays: number;
  onboarding: Record<OnboardingTask, boolean>;
  activeFarmId?: string;
}

export type OnboardingTask = 'openDemo' | 'logEntry' | 'buildReport' | 'askAssistant';

export interface SavedReport {
  id: string;
  parcelId: string;
  createdAt: string;
  input: ReportInput;
  isDemo?: boolean;
}

export interface ReportInput {
  parcelId: string;
  start: string;
  end: string;
  plannedAction: 'mowing' | 'grazing';
  reason: MissedReason;
  affectedHa: number;
  severity: 'minor' | 'moderate' | 'major';
  justification: string;
  farmerName: string;
}
