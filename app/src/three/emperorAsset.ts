import { asset } from '@/lib/utils';

/** 监军台上的秦始皇静模。规格身高 1.80m，脚底贴地，面朝 +Z。 */
export const EMPEROR = {
  url: 'models/emperor-proto.glb?v=proto1',
  heightM: 1.80,
  tris: 136_698,
  bytes: 4_810_340,
  license: '自建',
  credit: 'emperor-proto.glb',
  sourceUrl: '/models/emperor-proto.glb',
} as const;

export function emperorUrl(): string {
  return asset(EMPEROR.url);
}
