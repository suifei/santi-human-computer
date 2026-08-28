/** 等自定义字体就绪后再画 Canvas 旗帜 / 木牌，避免回落到系统宋体 */
export const UI_FONT = 'QinYardXingKai, QinYardKai, serif';
export const BRUSH_FONT = 'ShuowenSeal, QinYardXingKai, QinYardKai, serif';

export async function waitAppFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('400 80px ShuowenSeal'),
    document.fonts.load('400 32px ShuowenSeal'),
    document.fonts.load('400 32px QinYardXingKai'),
    document.fonts.load('400 16px QinYardXingKai'),
    document.fonts.load('400 16px QinYardKai'),
  ]);
}
