<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * Sync ต้นทุน + ราคาประเมิน จาก caldiscount.np_products_profile → project_units
 * - unit_cost       ← pd_bl
 * - appraisal_price ← pd_price_ga
 * - match: project.code = pd_pj_code  AND  unit_code ↔ pd_uniq (exact หรือ normalized)
 *   normalized: uppercase + ตัด non-alphanumeric + split alpha↔digit + strip leading zeros
 *   ตัวอย่าง: Sbp-1 ↔ Sbp-001 ↔ SBP_001 ↔ SBP1 → ทั้งหมด normalize เป็น "SBP|1"
 */
class UnitSyncService
{
    private BaseConnection $db;
    private BaseConnection $cal; // caldiscount connection

    public function __construct()
    {
        $this->db  = \Config\Database::connect();
        $this->cal = \Config\Database::connect('db');
    }

    /** Normalize unit_code → key สำหรับ fuzzy match (uppercase, no separators, no leading zeros) */
    private function normalizeCode(string $code): ?string
    {
        $upper = strtoupper(trim($code));
        if ($upper === '') return null;
        $clean = preg_replace('/[^A-Z0-9]/', '', $upper);
        if ($clean === null || $clean === '') return null;
        // split ระหว่าง alpha ↔ digit
        $segments = preg_split('/(?<=[A-Z])(?=\d)|(?<=\d)(?=[A-Z])/', $clean) ?: [$clean];
        $normalized = array_map(static function (string $seg): string {
            if (ctype_digit($seg)) {
                $stripped = ltrim($seg, '0');
                return $stripped === '' ? '0' : $stripped;
            }
            return $seg;
        }, $segments);
        return implode('|', $normalized);
    }

    /**
     * Preview การ sync — เปรียบเทียบค่าเดิม/ใหม่ + สรุปสถานะแต่ละแถว
     */
    public function previewSync(int $projectId): array
    {
        $project = $this->db->table('projects')->where('id', $projectId)->get()->getRowArray();
        if (!$project) throw new RuntimeException('ไม่พบโครงการ');
        $projectCode = trim((string) $project['code']);
        if ($projectCode === '') throw new RuntimeException('โครงการนี้ยังไม่มีรหัส (code) — กรุณาตั้งรหัสก่อน');

        // units ในระบบ
        $units = $this->db->table('project_units')
            ->select('id, unit_code, unit_cost, appraisal_price')
            ->where('project_id', $projectId)
            ->orderBy('unit_code', 'ASC')
            ->get()->getResultArray();

        // ข้อมูลจาก caldiscount
        $cal = $this->cal->table('np_products_profile')
            ->select('pd_uniq, pd_bl, pd_price_ga')
            ->where('pd_pj_code', $projectCode)
            ->get()->getResultArray();

        // build exact + normalized maps สำหรับ caldiscount
        $calExactMap = [];
        $calNormMap  = [];
        foreach ($cal as $r) {
            $code = (string) $r['pd_uniq'];
            $calExactMap[$code] = $r;
            $norm = $this->normalizeCode($code);
            if ($norm !== null) {
                // ถ้ามี collision (หลาย cal codes normalize ไปตัวเดียวกัน) — เก็บ array เพื่อ detect ambiguous
                $calNormMap[$norm][] = $r;
            }
        }

        // matched cal codes — เก็บเพื่อหา cal_only หลังจากนี้
        $matchedCalCodes = [];

        $rows = [];
        $countUpdate = 0; $countNoChange = 0; $countNotFound = 0;

        // วน units → ลอง exact match ก่อน, ไม่เจอ → normalized match
        foreach ($units as $u) {
            $code = (string) $u['unit_code'];
            $cur  = [
                'unit_cost'       => $u['unit_cost'] !== null ? (float) $u['unit_cost'] : null,
                'appraisal_price' => $u['appraisal_price'] !== null ? (float) $u['appraisal_price'] : null,
            ];

            $matched = null;       // cal row ที่ match
            $matchType = null;     // 'exact' | 'normalized'
            $ambiguousNote = null; // ถ้า normalize match หลายตัว — ไม่ match (กัน update ผิด)

            if (isset($calExactMap[$code])) {
                $matched = $calExactMap[$code];
                $matchType = 'exact';
            } else {
                $norm = $this->normalizeCode($code);
                if ($norm !== null && isset($calNormMap[$norm])) {
                    $candidates = $calNormMap[$norm];
                    if (count($candidates) === 1) {
                        $matched = $candidates[0];
                        $matchType = 'normalized';
                    } else {
                        $ambiguousNote = count($candidates) . ' ตัวที่ normalize ตรงกัน — ต้องแก้ชื่อให้ตรงก่อน';
                    }
                }
            }

            if (!$matched) {
                $rows[] = [
                    'unit_id'                  => (int) $u['id'],
                    'unit_code'                => $code,
                    'cal_unit_code'            => null,
                    'match_type'               => null,
                    'current_unit_cost'        => $cur['unit_cost'],
                    'new_unit_cost'            => null,
                    'current_appraisal_price'  => $cur['appraisal_price'],
                    'new_appraisal_price'      => null,
                    'status'                   => 'not_found',
                    'note'                     => $ambiguousNote,
                ];
                $countNotFound++;
                continue;
            }

            $matchedCalCodes[(string) $matched['pd_uniq']] = true;

            $newUnitCost  = $matched['pd_bl']       !== null ? (float) $matched['pd_bl']       : null;
            $newAppraisal = $matched['pd_price_ga'] !== null ? (float) $matched['pd_price_ga'] : null;

            $changed = ($newUnitCost !== null && $cur['unit_cost'] != $newUnitCost)
                    || ($newAppraisal !== null && $cur['appraisal_price'] != $newAppraisal);

            $rows[] = [
                'unit_id'                  => (int) $u['id'],
                'unit_code'                => $code,
                'cal_unit_code'            => (string) $matched['pd_uniq'],
                'match_type'               => $matchType,
                'current_unit_cost'        => $cur['unit_cost'],
                'new_unit_cost'            => $newUnitCost,
                'current_appraisal_price'  => $cur['appraisal_price'],
                'new_appraisal_price'      => $newAppraisal,
                'status'                   => $changed ? 'will_update' : 'no_change',
                'note'                     => null,
            ];
            if ($changed) $countUpdate++; else $countNoChange++;
        }

        // cal-only: pd_uniq ที่ไม่ถูก match (ทั้ง exact + normalized)
        $countCalOnly = 0;
        foreach ($cal as $r) {
            $code = (string) $r['pd_uniq'];
            if (!isset($matchedCalCodes[$code])) {
                $rows[] = [
                    'unit_id'                  => null,
                    'unit_code'                => $code,
                    'cal_unit_code'            => $code,
                    'match_type'               => null,
                    'current_unit_cost'        => null,
                    'new_unit_cost'            => $r['pd_bl']       !== null ? (float) $r['pd_bl']       : null,
                    'current_appraisal_price'  => null,
                    'new_appraisal_price'      => $r['pd_price_ga'] !== null ? (float) $r['pd_price_ga'] : null,
                    'status'                   => 'cal_only',
                    'note'                     => null,
                ];
                $countCalOnly++;
            }
        }

        return [
            'project_id'   => $projectId,
            'project_code' => $projectCode,
            'rows'         => $rows,
            'summary'      => [
                'total'        => count($rows),
                'will_update'  => $countUpdate,
                'no_change'    => $countNoChange,
                'not_found'    => $countNotFound, // unit มี แต่ caldiscount ไม่มี
                'cal_only'     => $countCalOnly,  // caldiscount มี แต่ unit ไม่มี (ไม่ sync ให้)
            ],
        ];
    }

    /**
     * Apply sync — update unit_cost + appraisal_price เฉพาะ unit_ids ที่ส่งมา
     * ดึงค่าจาก caldiscount สดอีกครั้ง (กัน race) แล้ว update
     */
    public function applySync(int $projectId, array $unitIds): array
    {
        $project = $this->db->table('projects')->where('id', $projectId)->get()->getRowArray();
        if (!$project) throw new RuntimeException('ไม่พบโครงการ');
        $projectCode = trim((string) $project['code']);
        if ($projectCode === '') throw new RuntimeException('โครงการนี้ยังไม่มีรหัส');

        $unitIds = array_values(array_unique(array_map('intval', $unitIds)));
        if (empty($unitIds)) {
            return ['updated' => 0, 'skipped' => [], 'errors' => []];
        }

        // ดึง units ที่จะ update — ต้องอยู่ในโครงการนี้เท่านั้น (กัน cross-project)
        $units = $this->db->table('project_units')
            ->select('id, unit_code')
            ->where('project_id', $projectId)
            ->whereIn('id', $unitIds)
            ->get()->getResultArray();

        if (empty($units)) {
            return ['updated' => 0, 'skipped' => [], 'errors' => [['ref' => '*', 'reason' => 'ไม่พบยูนิตในโครงการนี้']]];
        }

        // ดึง caldiscount ทั้ง project แล้ว build exact + normalized maps (เผื่อ unit_code ไม่ตรงเป๊ะ)
        $cal = $this->cal->table('np_products_profile')
            ->select('pd_uniq, pd_bl, pd_price_ga')
            ->where('pd_pj_code', $projectCode)
            ->get()->getResultArray();

        $calExactMap = [];
        $calNormMap  = [];
        foreach ($cal as $r) {
            $calExactMap[(string) $r['pd_uniq']] = $r;
            $norm = $this->normalizeCode((string) $r['pd_uniq']);
            if ($norm !== null) $calNormMap[$norm][] = $r;
        }

        $updated = 0;
        $skipped = [];
        $errors  = [];
        $now     = date('Y-m-d H:i:s');

        foreach ($units as $u) {
            $code = (string) $u['unit_code'];

            $matched = $calExactMap[$code] ?? null;
            if (!$matched) {
                $norm = $this->normalizeCode($code);
                $candidates = $norm !== null ? ($calNormMap[$norm] ?? []) : [];
                if (count($candidates) === 1) {
                    $matched = $candidates[0];
                } elseif (count($candidates) > 1) {
                    $skipped[] = ['ref' => $code, 'reason' => 'พบหลายตัวที่ normalize ตรงกัน — ไม่ปลอดภัยที่จะ update'];
                    continue;
                }
            }

            if (!$matched) {
                $skipped[] = ['ref' => $code, 'reason' => 'ไม่พบใน caldiscount'];
                continue;
            }

            $set = ['updated_at' => $now];
            if ($matched['pd_bl']       !== null) $set['unit_cost']       = (float) $matched['pd_bl'];
            if ($matched['pd_price_ga'] !== null) $set['appraisal_price'] = (float) $matched['pd_price_ga'];
            if (count($set) === 1) {
                $skipped[] = ['ref' => $code, 'reason' => 'caldiscount ไม่มีค่าให้ update'];
                continue;
            }

            try {
                $this->db->table('project_units')->where('id', (int) $u['id'])->update($set);
                $updated++;
            } catch (\Throwable $e) {
                $errors[] = ['ref' => $code, 'reason' => $e->getMessage()];
            }
        }

        return [
            'updated' => $updated,
            'skipped' => $skipped,
            'errors'  => $errors,
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Sync สถานะขาย/โอน จาก Caldiscount → project_units
    // ─────────────────────────────────────────────────────────────────────────
    //
    // Caldiscount fields ที่ใช้:
    //   is_trans (tinyint 1) → ถ้า 1 = โอนแล้ว
    //   is_sold  (tinyint 1) → ถ้า 1 = ขายแล้ว (ยังไม่โอน)
    //   date_trans (date)    → วันที่โอนจริง — ใช้เป็น transfer_date
    //   due_trans  (date)    → วันที่กำหนดโอน — ใช้เป็น sale_date (fallback)
    //
    // Logic mapping → ระบบใหม่:
    //   is_trans=1            → status='transferred', transfer_date=date_trans, sale_date=due_trans
    //   is_sold=1 & is_trans=0 → status='sold',       sale_date=due_trans
    //   ทั้งคู่ = 0            → ข้าม (no_change — ไม่ override sales_transaction ระบบใหม่)
    //
    // Conflict: ถ้า unit มี active sales_transaction ในระบบใหม่ → mark conflict
    //   skip apply กัน data inconsistency

    /**
     * Preview การ sync สถานะขาย/โอน — เปรียบเทียบ status เดิม/ใหม่ + detect conflict
     */
    public function previewSoldStatusSync(int $projectId): array
    {
        $project = $this->db->table('projects')->where('id', $projectId)->get()->getRowArray();
        if (!$project) throw new RuntimeException('ไม่พบโครงการ');
        $projectCode = trim((string) $project['code']);
        if ($projectCode === '') throw new RuntimeException('โครงการนี้ยังไม่มีรหัส (code) — กรุณาตั้งรหัสก่อน');

        // units ในระบบใหม่
        $units = $this->db->table('project_units')
            ->select('id, unit_code, status, sale_date, transfer_date, legacy_source')
            ->where('project_id', $projectId)
            ->orderBy('unit_code', 'ASC')
            ->get()->getResultArray();

        // ข้อมูลขาย/โอน จาก caldiscount
        $cal = $this->cal->table('np_products_profile')
            ->select('pd_uniq, is_sold, is_trans, due_trans, date_trans')
            ->where('pd_pj_code', $projectCode)
            ->get()->getResultArray();

        // build exact + normalized maps
        $calExactMap = [];
        $calNormMap  = [];
        foreach ($cal as $r) {
            $code = (string) $r['pd_uniq'];
            $calExactMap[$code] = $r;
            $norm = $this->normalizeCode($code);
            if ($norm !== null) $calNormMap[$norm][] = $r;
        }

        // เช็ค active sales_transaction (สำหรับ conflict detection)
        $unitIds = array_map(static fn($u) => (int) $u['id'], $units);
        $txMap = [];
        if (!empty($unitIds)) {
            $tx = $this->db->table('sales_transactions')
                ->select('unit_id, sale_no')
                ->where('project_id', $projectId)
                ->whereIn('unit_id', $unitIds)
                ->whereIn('status', ['active', 'confirmed'])
                ->get()->getResultArray();
            foreach ($tx as $t) {
                $txMap[(int) $t['unit_id']] = (string) $t['sale_no'];
            }
        }

        $rows = [];
        $countUpdate = 0; $countNoChange = 0; $countConflict = 0; $countNotFound = 0;

        foreach ($units as $u) {
            $code = (string) $u['unit_code'];
            $unitId = (int) $u['id'];

            // หา cal match
            $matched = $calExactMap[$code] ?? null;
            if (!$matched) {
                $norm = $this->normalizeCode($code);
                $candidates = $norm !== null ? ($calNormMap[$norm] ?? []) : [];
                if (count($candidates) === 1) $matched = $candidates[0];
            }

            if (!$matched) {
                $rows[] = [
                    'unit_id'              => $unitId,
                    'unit_code'            => $code,
                    'current_status'       => $u['status'],
                    'current_sale_date'    => $u['sale_date'],
                    'current_transfer_date'=> $u['transfer_date'],
                    'new_status'           => null,
                    'new_sale_date'        => null,
                    'new_transfer_date'    => null,
                    'status'               => 'not_found',
                    'conflict_sale_no'     => null,
                    'note'                 => null,
                ];
                $countNotFound++;
                continue;
            }

            // คำนวณ status ใหม่จาก flags
            $isTrans = (int) ($matched['is_trans'] ?? 0) === 1;
            $isSold  = (int) ($matched['is_sold']  ?? 0) === 1;

            if (!$isTrans && !$isSold) {
                // Caldiscount ไม่ได้บอกว่าขาย/โอน — ไม่ sync
                $rows[] = [
                    'unit_id'              => $unitId,
                    'unit_code'            => $code,
                    'current_status'       => $u['status'],
                    'current_sale_date'    => $u['sale_date'],
                    'current_transfer_date'=> $u['transfer_date'],
                    'new_status'           => null,
                    'new_sale_date'        => null,
                    'new_transfer_date'    => null,
                    'status'               => 'no_change',
                    'conflict_sale_no'     => null,
                    'note'                 => 'Caldiscount ไม่ได้ระบุว่าขาย/โอน',
                ];
                $countNoChange++;
                continue;
            }

            $newStatus       = $isTrans ? 'transferred' : 'sold';
            $newTransferDate = $isTrans ? ($matched['date_trans'] ?? null) : null;
            $newSaleDate     = $matched['due_trans'] ?? null;

            // เช็ค conflict กับ sales_transaction ใหม่
            $conflictSaleNo = $txMap[$unitId] ?? null;
            if ($conflictSaleNo !== null) {
                $rows[] = [
                    'unit_id'              => $unitId,
                    'unit_code'            => $code,
                    'current_status'       => $u['status'],
                    'current_sale_date'    => $u['sale_date'],
                    'current_transfer_date'=> $u['transfer_date'],
                    'new_status'           => $newStatus,
                    'new_sale_date'        => $newSaleDate,
                    'new_transfer_date'    => $newTransferDate,
                    'status'               => 'conflict',
                    'conflict_sale_no'     => $conflictSaleNo,
                    'note'                 => 'มีรายการขาย ' . $conflictSaleNo . ' ในระบบใหม่อยู่แล้ว — ข้าม',
                ];
                $countConflict++;
                continue;
            }

            // เทียบกับ current — ถ้าเหมือนเดิมและ flag = caldiscount อยู่แล้ว → no_change
            $sameStatus = $u['status'] === $newStatus;
            $sameSale   = (string) $u['sale_date']     === (string) $newSaleDate;
            $sameTrans  = (string) $u['transfer_date'] === (string) $newTransferDate;
            $alreadyFlagged = $u['legacy_source'] === 'caldiscount';

            if ($sameStatus && $sameSale && $sameTrans && $alreadyFlagged) {
                $rows[] = [
                    'unit_id'              => $unitId,
                    'unit_code'            => $code,
                    'current_status'       => $u['status'],
                    'current_sale_date'    => $u['sale_date'],
                    'current_transfer_date'=> $u['transfer_date'],
                    'new_status'           => $newStatus,
                    'new_sale_date'        => $newSaleDate,
                    'new_transfer_date'    => $newTransferDate,
                    'status'               => 'no_change',
                    'conflict_sale_no'     => null,
                    'note'                 => null,
                ];
                $countNoChange++;
                continue;
            }

            $rows[] = [
                'unit_id'              => $unitId,
                'unit_code'            => $code,
                'current_status'       => $u['status'],
                'current_sale_date'    => $u['sale_date'],
                'current_transfer_date'=> $u['transfer_date'],
                'new_status'           => $newStatus,
                'new_sale_date'        => $newSaleDate,
                'new_transfer_date'    => $newTransferDate,
                'status'               => 'will_update',
                'conflict_sale_no'     => null,
                'note'                 => null,
            ];
            $countUpdate++;
        }

        return [
            'project_id'   => $projectId,
            'project_code' => $projectCode,
            'rows'         => $rows,
            'summary'      => [
                'total'       => count($rows),
                'will_update' => $countUpdate,
                'no_change'   => $countNoChange,
                'conflict'    => $countConflict,
                'not_found'   => $countNotFound,
            ],
        ];
    }

    /**
     * Apply sync สถานะขาย/โอน — update เฉพาะ unit_ids ที่ส่งมา
     * Re-fetch จาก Caldiscount + re-check conflict กัน race
     */
    public function applySoldStatusSync(int $projectId, array $unitIds): array
    {
        $project = $this->db->table('projects')->where('id', $projectId)->get()->getRowArray();
        if (!$project) throw new RuntimeException('ไม่พบโครงการ');
        $projectCode = trim((string) $project['code']);
        if ($projectCode === '') throw new RuntimeException('โครงการนี้ยังไม่มีรหัส');

        $unitIds = array_values(array_unique(array_map('intval', $unitIds)));
        if (empty($unitIds)) {
            return ['updated' => 0, 'skipped' => [], 'errors' => []];
        }

        $units = $this->db->table('project_units')
            ->select('id, unit_code')
            ->where('project_id', $projectId)
            ->whereIn('id', $unitIds)
            ->get()->getResultArray();

        if (empty($units)) {
            return ['updated' => 0, 'skipped' => [], 'errors' => [['ref' => '*', 'reason' => 'ไม่พบยูนิตในโครงการนี้']]];
        }

        // re-fetch caldiscount + re-check conflict
        $cal = $this->cal->table('np_products_profile')
            ->select('pd_uniq, is_sold, is_trans, due_trans, date_trans')
            ->where('pd_pj_code', $projectCode)
            ->get()->getResultArray();

        $calExactMap = [];
        $calNormMap  = [];
        foreach ($cal as $r) {
            $calExactMap[(string) $r['pd_uniq']] = $r;
            $norm = $this->normalizeCode((string) $r['pd_uniq']);
            if ($norm !== null) $calNormMap[$norm][] = $r;
        }

        $thisUnitIds = array_map(static fn($u) => (int) $u['id'], $units);
        $tx = $this->db->table('sales_transactions')
            ->select('unit_id, sale_no')
            ->where('project_id', $projectId)
            ->whereIn('unit_id', $thisUnitIds)
            ->whereIn('status', ['active', 'confirmed'])
            ->get()->getResultArray();
        $txMap = [];
        foreach ($tx as $t) {
            $txMap[(int) $t['unit_id']] = (string) $t['sale_no'];
        }

        $updated = 0;
        $skipped = [];
        $errors  = [];
        $now     = date('Y-m-d H:i:s');

        foreach ($units as $u) {
            $code = (string) $u['unit_code'];
            $unitId = (int) $u['id'];

            $matched = $calExactMap[$code] ?? null;
            if (!$matched) {
                $norm = $this->normalizeCode($code);
                $candidates = $norm !== null ? ($calNormMap[$norm] ?? []) : [];
                if (count($candidates) === 1) $matched = $candidates[0];
            }

            if (!$matched) {
                $skipped[] = ['ref' => $code, 'reason' => 'ไม่พบใน caldiscount'];
                continue;
            }

            $isTrans = (int) ($matched['is_trans'] ?? 0) === 1;
            $isSold  = (int) ($matched['is_sold']  ?? 0) === 1;
            if (!$isTrans && !$isSold) {
                $skipped[] = ['ref' => $code, 'reason' => 'caldiscount ไม่ได้ระบุว่าขาย/โอน'];
                continue;
            }

            if (isset($txMap[$unitId])) {
                $skipped[] = ['ref' => $code, 'reason' => 'มีรายการขาย ' . $txMap[$unitId] . ' ในระบบใหม่ — ข้าม'];
                continue;
            }

            $set = [
                'status'        => $isTrans ? 'transferred' : 'sold',
                'sale_date'     => $matched['due_trans']  ?? null,
                'transfer_date' => $isTrans ? ($matched['date_trans'] ?? null) : null,
                'legacy_source' => 'caldiscount',
                'updated_at'    => $now,
            ];

            try {
                $this->db->table('project_units')->where('id', $unitId)->update($set);
                $updated++;
            } catch (\Throwable $e) {
                $errors[] = ['ref' => $code, 'reason' => $e->getMessage()];
            }
        }

        return [
            'updated' => $updated,
            'skipped' => $skipped,
            'errors'  => $errors,
        ];
    }
}
