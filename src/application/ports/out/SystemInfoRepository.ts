export interface SystemInfoRepository {
  upsert(detectedAt: string, payloadJson: string): void;
  get(): unknown | null;
}
