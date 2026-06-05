export type ProtonReport = {
  timestamp: number;
  notes: string;
  rating: string;
  protonVersion: string;
  os: string;
  gpu: string;
  gpuDriver: string;
  systemRam: number;
};

export type CommunityData = {
  appid: string;
  fetched_at: string;
  total: number;
  reports: ProtonReport[];
};
