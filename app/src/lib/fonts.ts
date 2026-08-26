/** 等自定义字体就绪后再画 Canvas 旗帜 / 木牌，避免回落到系统宋体 */
export async function waitAppFonts(): Promise<void> {
  await Promise.all([
    document.fonts.load('400 80px ShuowenSeal'),
    document.fonts.load('400 32px ShuowenSeal'),
    document.fonts.load('400 24px Qiji'),
    document.fonts.load('400 16px Qiji'),
  ]);
}
