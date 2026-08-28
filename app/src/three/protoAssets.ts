import { asset } from '@/lib/utils';

/** 用户交付的场景道具。尺寸按 proto-spec，甲板高度运行时射线测定。 */
export const PROTO = {
  cmd: {
    url: 'models/tower-cmd-proto.glb?v=proto1',
    heightM: 5.6,
    /** 朝上水平面：屋顶约 0.70，甲板约 0.30（源 bbox 实测）。 */
    deckFrac: 0.303,
  },
  drumTower: {
    url: 'models/tower-drum-proto.glb?v=proto1',
    heightM: 3.0,
    deckFrac: 0.634,
  },
  drum: {
    url: 'models/drum-proto.glb?v=proto1',
    heightM: 1.28,
  },
  tent: {
    url: 'models/tent-proto.glb?v=proto1',
    heightM: 2.8,
  },
  bird: {
    url: 'models/bird-proto.glb?v=proto1',
    wingspanM: 0.52,
  },
} as const;

export function protoUrl(id: keyof typeof PROTO): string {
  return asset(PROTO[id].url);
}
