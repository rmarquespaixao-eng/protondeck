export type SupportState = 'native' | 'hackable' | 'limited' | 'unsupported' | 'unknown';

export type WidescreenFeatures = {
  widescreen?:      { state: SupportState; notes: string };
  multimonitor?:    { state: SupportState; notes: string };
  ultrawidescreen?: { state: SupportState; notes: string };
  '4k'?:            { state: SupportState; notes: string };
  fov?:             { state: SupportState; notes: string };
};

export type WidescreenInfo = {
  found: boolean;
  pageUrl?: string;
  pageName?: string;
  features: WidescreenFeatures;
  fetched_at: string;
  reason?: string;
};
