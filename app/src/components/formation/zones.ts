/**
 * 阵图页共享分区常量（formation.md「页面级行为」：分区/号段/职责单一来源）。
 * 坐标与号段与 src/sim/netlist.ts 布阵器一一对应：
 *   世界坐标 +X 向东、+Z 向南，信号南→北；SVG 顶视图北在上。
 *   sx(x) = 40 + (x + 27) * 10 ; sy(z) = 30 + (z + 20) * 10 ; viewBox 0 0 640 480
 * 层序（拍）为网表实测：ADDER 1–21 / PP 3–22 / ACC 4–60 / OUT 61 / DONE 62，共 62 拍。
 */

export type ZoneId = 'A' | 'B' | 'C' | 'ADDER' | 'PP' | 'ACC' | 'OUT' | 'DONE';

export interface ZoneInfo {
  id: ZoneId;
  /** 区名（详情卡/花名册） */
  name: string;
  /** 图上短标注 */
  short: string;
  count: number;
  /** 门牌号段 */
  range: string;
  duty: string;
  flow: string;
  /** 兵种 */
  branch: string;
  /** 层序（网表实测拍深） */
  beats: string;
  note: string;
  /** SVG 色块样式 */
  fill: string;
  fillOpacity: number;
  /** SVG 矩形（svg 单位） */
  rect: { x: number; y: number; w: number; h: number };
  /** 图上标注锚点 */
  label: { x: number; y: number };
}

export const ZONES: ZoneInfo[] = [
  {
    id: 'A',
    name: '输入手·甲 A 行',
    short: '甲 A',
    count: 10,
    range: '001–010',
    duty: '持甲数 A 的 10 位二进制，bit0 在西，沿南缘注入',
    flow: '→ 加法陣各位',
    branch: '输入手',
    beats: '第 0 拍',
    note: 'bit0 在西，沿南缘注入',
    fill: 'var(--earth-500)',
    fillOpacity: 0.55,
    rect: { x: 104, y: 390, w: 102, h: 18 },
    label: { x: 155, y: 404 },
  },
  {
    id: 'B',
    name: '输入手·乙 B 行',
    short: '乙 B',
    count: 10,
    range: '011–020',
    duty: '持乙数 B 的 10 位二进制，与甲行平行',
    flow: '→ 加法陣各位',
    branch: '输入手',
    beats: '第 0 拍',
    note: '与甲行平行，同步翻旗',
    fill: 'var(--earth-500)',
    fillOpacity: 0.55,
    rect: { x: 104, y: 414, w: 102, h: 18 },
    label: { x: 155, y: 428 },
  },
  {
    id: 'C',
    name: '输入手·丙 C 列',
    short: '丙 C',
    count: 10,
    range: '021–030',
    duty: '持丙数 C 的 10 位二进制，bit0 在南，沿西缘注入',
    flow: '→ 部分積陣各行',
    branch: '输入手',
    beats: '第 0 拍',
    note: 'bit0 在南，沿西缘注入',
    fill: 'var(--earth-500)',
    fillOpacity: 0.55,
    rect: { x: 58, y: 286, w: 26, h: 100 },
    label: { x: 71, y: 278 },
  },
  {
    id: 'ADDER',
    name: '加法陣',
    short: '加法陣',
    count: 50,
    range: '101–150',
    duty: '10 组全加器行波进位，逐位算出和 S = A + B（11 位）',
    flow: '→ 部分積陣',
    branch: '门兵',
    beats: '第 1–21 拍',
    note: '每 FA 五门四层，进位向东',
    fill: 'var(--bronze)',
    fillOpacity: 0.4,
    rect: { x: 144, y: 248, w: 130, h: 126 },
    label: { x: 209, y: 315 },
  },
  {
    id: 'PP',
    name: '部分積陣',
    short: '部分積陣',
    count: 110,
    range: '201–310',
    duty: '10×11 与门方阵：S 的每一位与 Cⱼ 相与，得十份部分积 PPⱼ',
    flow: '→ 累加陣第 j 帶',
    branch: '门兵',
    beats: '第 3–22 拍',
    note: '与门方阵，PPⱼᵢ = Sᵢ AND Cⱼ',
    fill: 'var(--gold)',
    fillOpacity: 0.3,
    rect: { x: 284, y: 284, w: 132, h: 82 },
    label: { x: 350, y: 329 },
  },
  {
    id: 'ACC',
    name: '累加陣',
    short: '累加陣',
    count: 720,
    range: '401–1141*',
    duty: '9 条行波加法带，自南向北逐带左移累加部分积，波前扫过全场',
    flow: '→ 输出手',
    branch: '门兵',
    beats: '第 4–60 拍',
    note: '带宽 12→20 位，逐级加深',
    fill: 'var(--gold)',
    fillOpacity: 0.45,
    rect: { x: 284, y: 88, w: 240, h: 188 },
    label: { x: 404, y: 186 },
  },
  {
    id: 'OUT',
    name: '输出手',
    short: '輸出',
    count: 21,
    range: '901–921',
    duty: '持结果 21 位二进制，bit0 在西，面向监军台集体亮相',
    flow: '→ 读数',
    branch: '输出手',
    beats: '第 61 拍',
    note: '面向监军台列队报数',
    fill: 'var(--seal)',
    fillOpacity: 0.6,
    rect: { x: 322, y: 50, w: 212, h: 20 },
    label: { x: 428, y: 44 },
  },
  {
    id: 'DONE',
    name: 'DONE 旗手',
    short: 'DONE',
    count: 1,
    range: '000',
    duty: '鼓令直属。第 62 拍举红旗，宣告演算完毕',
    flow: '→ 鼓令台',
    branch: '鼓令',
    beats: '第 62 拍',
    note: '末拍举红，鼓声连奏',
    fill: 'var(--flag-red)',
    fillOpacity: 0.85,
    rect: { x: 538, y: 68, w: 14, h: 14 },
    label: { x: 545, y: 62 },
  },
];

export const ZONE_MAP: Record<ZoneId, ZoneInfo> = Object.fromEntries(
  ZONES.map((z) => [z.id, z]),
) as Record<ZoneId, ZoneInfo>;

/** 图例教学点亮顺序：输入 → 加法 → 部分积 → 累加 → 输出 */
export const TOUR_ORDER: ZoneId[] = ['A', 'B', 'C', 'ADDER', 'PP', 'ACC', 'OUT', 'DONE'];

/** 网表实测汇总 */
export const STATS = {
  total: 932,
  beats: 62,
  outBits: 21,
  guards: 60,
} as const;

/** 累加陣号段脚注：网表实现避让输出号段 901–921 */
export const ACC_RANGE_NOTE = '* 網表實測：累加陣號段 401–1141，避讓輸出手號段 901–921。';
