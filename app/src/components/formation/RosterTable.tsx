import { motion } from 'framer-motion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ZONES, STATS, ACC_RANGE_NOTE } from './zones';

/**
 * S3 编制花名册：宣纸卡片包裹的分区编制表。
 * 行数据与 zones.ts 同源；末行合计 932（网表实测）。
 */
export default function RosterTable() {
  return (
    <div>
      <motion.div
        className="paper-card overflow-hidden"
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* 顶部 3px 朱砂色条 */}
        <div className="h-[3px]" style={{ background: 'var(--seal)' }} />
        <Table>
          <TableHeader>
            <TableRow className="border-b" style={{ borderColor: 'rgba(23,16,11,0.25)' }}>
              {['分区', '号段', '兵种', '人数', '层数(拍深)', '备注'].map((h) => (
                <TableHead
                  key={h}
                  className="font-song font-semibold text-[13px] tracking-[0.06em]"
                  style={{ color: 'var(--seal)' }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ZONES.map((z, i) => (
              <motion.tr
                key={z.id}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{ duration: 0.35, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="border-b"
                style={{ borderColor: 'rgba(23,16,11,0.12)' }}
              >
                <TableCell className="font-song font-semibold text-[14px]" style={{ color: 'var(--ink)' }}>
                  {z.name}
                </TableCell>
                <TableCell className="font-mono-num text-[13px]" style={{ color: 'var(--ink)' }}>
                  {z.range}
                </TableCell>
                <TableCell className="text-[13px]" style={{ color: 'var(--ink)' }}>
                  {z.branch}
                </TableCell>
                <TableCell className="font-mono-num text-[14px] font-bold" style={{ color: 'var(--ink)' }}>
                  {z.count}
                </TableCell>
                <TableCell className="font-mono-num text-[12px]" style={{ color: 'var(--ink)' }}>
                  {z.beats}
                </TableCell>
                <TableCell className="text-[12px]" style={{ color: 'rgba(23,16,11,0.65)' }}>
                  {z.note}
                </TableCell>
              </motion.tr>
            ))}
            {/* 合计行：金色描边脉冲一次 */}
            <motion.tr
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.4, delay: ZONES.length * 0.06 }}
              className="border-b-0"
              style={{ background: 'rgba(163,46,34,0.08)' }}
            >
              <TableCell className="font-song font-bold text-[14px]" style={{ color: 'var(--seal)' }}>
                演算士兵合计
              </TableCell>
              <TableCell className="font-mono-num text-[12px]" style={{ color: 'var(--seal)' }}>
                000–1141
              </TableCell>
              <TableCell className="text-[13px]" style={{ color: 'var(--seal)' }}>
                —
              </TableCell>
              <TableCell>
                <motion.span
                  className="inline-block font-mono-num text-[16px] font-bold rounded-sm px-1"
                  style={{ color: 'var(--seal)' }}
                  initial={{ boxShadow: '0 0 0 0 rgba(212,169,82,0)' }}
                  whileInView={{
                    boxShadow: [
                      '0 0 0 0 rgba(212,169,82,0)',
                      '0 0 0 3px rgba(212,169,82,0.9)',
                      '0 0 0 0 rgba(212,169,82,0)',
                    ],
                  }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1, delay: ZONES.length * 0.06 + 0.3 }}
                >
                  {STATS.total}
                </motion.span>
              </TableCell>
              <TableCell colSpan={2} className="text-[12px]" style={{ color: 'rgba(23,16,11,0.65)' }}>
                另设仪仗卫兵约六十，不预演算
              </TableCell>
            </motion.tr>
          </TableBody>
        </Table>
      </motion.div>

      <p className="mt-2 text-[11px]" style={{ color: 'var(--earth-500)' }}>
        {ACC_RANGE_NOTE}
      </p>

      {/* 三枚统计芯片 */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {[
          { num: `${STATS.total}`, unit: '人', label: '演算士兵' },
          { num: `${STATS.beats}`, unit: '拍', label: '鼓点节拍（网表实测）' },
          { num: `${STATS.outBits}`, unit: '位', label: '输出位宽' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="panel px-4 py-4 text-center"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="font-mono-num text-[26px] font-bold" style={{ color: 'var(--gold)' }}>
              {s.num}
              <span className="ml-1 text-[13px] font-medium text-sand">{s.unit}</span>
            </div>
            <div className="mt-1 text-[11px] tracking-[0.08em]" style={{ color: 'var(--earth-300)' }}>
              {s.label}
            </div>
          </motion.div>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--earth-500)' }}>
        拍数非约数：自第 0 拍注入至第 62 拍 DONE 举旗，共 63 层、62 击鼓（src/sim/netlist.ts 实测）。
      </p>
    </div>
  );
}
