<?php

namespace App\Services;

use App\Services\PromotionItemService;
use CodeIgniter\Database\BaseConnection;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;

/**
 * PremiumImportService — อ่านไฟล์ Premium.xlsx เข้าตาราง staging
 *
 * โครงสร้างไฟล์ (เหมือนกันทุกชีต — 1 ชีต = 1 โครงการ):
 *   - แถวบนสุดมีช่อง "โครงการ" → รหัสโครงการอยู่ช่องถัดไป
 *   - หัวตาราง 2 ชั้น: ชั้นบนมี "ลำดับ/เลขแปลง/เนื้อที่ดิน/แบบบ้าน/ราคา/Premium"
 *                      ชั้นล่างมี "Bottom Line" + ชื่อของแถมแต่ละรายการ
 *   - ข้อมูลเริ่มแถวถัดจากหัวชั้นล่าง 1 แถว
 *   - ท้ายชีตมีแถวว่าง + แถวรวมยอด (เลขแปลงว่าง) → ข้ามอัตโนมัติ
 *
 * กฎสำคัญ:
 * 1. คอลัมน์ของแถมไม่คงที่ → เก็บแบบ long-format ใน premium_import_values
 * 2. หมวดของแถมแยกตามกฎ 3 หมวด: discount / premium / expense_support
 * 3. import = staging เท่านั้น ยังไม่แตะ project_units (จับคู่/sync เป็นขั้นถัดไป)
 * 4. Error messages เป็นภาษาไทย
 */
class PremiumImportService
{
    private BaseConnection $db;

    /** จำนวนแถวบนสุดที่ใช้ค้นหาหัวตาราง/รหัสโครงการ */
    private const HEADER_SCAN_LIMIT = 15;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Preview — อ่านไฟล์เพื่อแสดงตัวอย่างก่อน import (ไม่เขียน DB)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * อ่านทุกชีต → คืนผลวิเคราะห์โครงสร้างสำหรับ preview
     */
    public function parseFile(string $filePath, string $fileName): array
    {
        $spreadsheet = IOFactory::load($filePath);
        $sheets      = [];

        foreach ($spreadsheet->getSheetNames() as $sheetName) {
            $sheet  = $spreadsheet->getSheetByName($sheetName);
            $layout = $this->detectLayout($sheet);

            $project = $layout['project_code']
                ? $this->findProjectByCode($layout['project_code'])
                : null;

            $rows = $this->extractRows($sheet, $layout);

            $sheets[] = [
                'sheet_name'     => $sheetName,
                'project_code'   => $layout['project_code'],
                'project_id'     => $project['id'] ?? null,
                'project_name'   => $project['name'] ?? null,
                'data_rows'      => count($rows),
                'premium_labels' => array_map(static fn ($p) => [
                    'label'        => $p['label'],
                    'category'     => $p['category'],
                    'column_index' => $p['column_index'],
                ], $layout['premium_columns']),
                'sample_rows'    => array_slice($rows, 0, 5),
                'importable'     => $project !== null && count($rows) > 0,
            ];
        }

        return [
            'file_name' => $fileName,
            'sheets'    => $sheets,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Import — เขียนข้อมูลลงตาราง staging
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * นำเข้าชีตที่เลือกลง staging — 1 batch ต่อ 1 ชีต
     *
     * @param string[]|null $sheetNames ชื่อชีตที่ต้องการ import (null = ทุกชีต)
     * @param int[]|null    $allowedProjectIds โครงการที่ผู้ใช้มีสิทธิ์ (null = ทุกโครงการ)
     * @return array{batches: array, skipped: array}
     */
    public function importToStaging(
        string $filePath,
        string $fileName,
        int $userId,
        ?array $sheetNames = null,
        ?array $allowedProjectIds = null
    ): array {
        $spreadsheet = IOFactory::load($filePath);
        $targets     = $sheetNames ?: $spreadsheet->getSheetNames();

        $batches = [];
        $skipped = [];

        foreach ($targets as $sheetName) {
            $sheet = $spreadsheet->getSheetByName($sheetName);
            if (!$sheet) {
                $skipped[] = ['sheet_name' => $sheetName, 'reason' => 'ไม่พบชีตนี้ในไฟล์'];
                continue;
            }

            $layout  = $this->detectLayout($sheet);
            $project = $layout['project_code']
                ? $this->findProjectByCode($layout['project_code'])
                : null;

            if (!$project) {
                $skipped[] = [
                    'sheet_name' => $sheetName,
                    'reason'     => 'ไม่พบโครงการรหัส "' . ($layout['project_code'] ?? '-') . '" ในระบบ',
                ];
                continue;
            }
            if ($allowedProjectIds !== null && !in_array((int) $project['id'], $allowedProjectIds, true)) {
                $skipped[] = [
                    'sheet_name' => $sheetName,
                    'reason'     => 'ไม่มีสิทธิ์เข้าถึงโครงการ ' . $layout['project_code'],
                ];
                continue;
            }

            $rows = $this->extractRows($sheet, $layout);
            if (empty($rows)) {
                $skipped[] = ['sheet_name' => $sheetName, 'reason' => 'ไม่พบข้อมูลแปลงในชีตนี้'];
                continue;
            }

            $batches[] = $this->writeBatch(
                $sheetName,
                $fileName,
                (int) $project['id'],
                $layout['project_code'],
                $rows,
                $userId
            );
        }

        if (empty($batches)) {
            throw new RuntimeException('ไม่มีชีตที่นำเข้าได้: ' . implode('; ', array_column($skipped, 'reason')));
        }

        return ['batches' => $batches, 'skipped' => $skipped];
    }

    /**
     * เขียน 1 ชีต → premium_import_batches + premium_import_units + premium_import_values
     */
    private function writeBatch(
        string $sheetName,
        string $fileName,
        int $projectId,
        string $projectCode,
        array $rows,
        int $userId
    ): array {
        $now = date('Y-m-d H:i:s');

        $this->db->transStart();

        $this->db->table('premium_import_batches')->insert([
            'project_id'       => $projectId,
            'source_file_name' => $fileName,
            'sheet_name'       => $sheetName,
            'project_code'     => $projectCode,
            'total_rows'       => count($rows),
            'matched_rows'     => 0,
            'unmatched_rows'   => 0,
            'synced_rows'      => 0,
            'status'           => 'pending',
            'imported_by'      => $userId,
            'imported_at'      => $now,
            'created_at'       => $now,
            'updated_at'       => $now,
        ]);
        $batchId = (int) $this->db->insertID();

        $valueRows = [];
        foreach ($rows as $row) {
            $this->db->table('premium_import_units')->insert([
                'batch_id'          => $batchId,
                'seq'               => $row['seq'],
                'plot_no'           => $row['plot_no'],
                'land_area_sqw'     => $row['land_area_sqw'],
                'house_model_code'  => $row['house_model_code'],
                'bottom_line_price' => $row['bottom_line_price'],
                'raw_row_index'     => $row['raw_row_index'],
                'match_status'      => 'unmatched',
                'created_at'        => $now,
            ]);
            $unitId = (int) $this->db->insertID();

            foreach ($row['premiums'] as $premium) {
                $valueRows[] = [
                    'import_unit_id'   => $unitId,
                    'premium_label'    => $premium['label'],
                    'premium_category' => $premium['category'],
                    'amount'           => $premium['amount'],
                    'column_index'     => $premium['column_index'],
                    'created_at'       => $now,
                ];
            }
        }

        if (!empty($valueRows)) {
            $this->db->table('premium_import_values')->insertBatch($valueRows);
        }

        $this->db->transComplete();

        if ($this->db->transStatus() === false) {
            throw new RuntimeException('บันทึกข้อมูลชีต ' . $sheetName . ' ไม่สำเร็จ');
        }

        return [
            'batch_id'     => $batchId,
            'sheet_name'   => $sheetName,
            'project_id'   => $projectId,
            'project_code' => $projectCode,
            'total_rows'   => count($rows),
            'value_rows'   => count($valueRows),
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Validate — จับคู่ staging กับฐานข้อมูลจริง (ยังไม่เขียนทับ project_units)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * จับคู่ข้อมูล staging ของ batch:
     *   - plot_no          ↔ project_units.unit_number (ในโครงการเดียวกัน)
     *   - house_model_code ↔ house_models.code
     *   - premium_label    ↔ promotion_item_master.name
     *
     * ไม่แตะ project_units — แค่เติมฟิลด์ matched_* และเปลี่ยน status เป็น validated
     */
    public function validateBatch(int $batchId): array
    {
        $batch = $this->getBatchOrFail($batchId);
        if ($batch['status'] === 'synced') {
            throw new RuntimeException('batch นี้ sync ไปแล้ว ไม่สามารถ validate ซ้ำได้');
        }

        $projectId = (int) $batch['project_id'];

        // map: unit_number → [unit_id, ...] (อาจซ้ำ → ambiguous)
        $unitMap = [];
        foreach ($this->db->table('project_units')
                     ->select('id, unit_number')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $u) {
            $unitMap[(string) $u['unit_number']][] = (int) $u['id'];
        }

        // map: house_model code → id
        $modelMap = [];
        foreach ($this->db->table('house_models')
                     ->select('id, code')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $m) {
            $modelMap[(string) $m['code']] = (int) $m['id'];
        }

        $units = $this->db->table('premium_import_units')
            ->where('batch_id', $batchId)
            ->get()->getResultArray();

        $matched = $unmatched = $ambiguous = 0;

        foreach ($units as $u) {
            $candidates = $unitMap[(string) $u['plot_no']] ?? [];
            if (count($candidates) === 1) {
                $status = 'matched';
                $unitId = $candidates[0];
                $matched++;
            } elseif (count($candidates) > 1) {
                $status = 'ambiguous';
                $unitId = null;
                $ambiguous++;
            } else {
                $status = 'unmatched';
                $unitId = null;
                $unmatched++;
            }

            $this->db->table('premium_import_units')
                ->where('id', $u['id'])
                ->update([
                    'matched_unit_id'        => $unitId,
                    'matched_house_model_id' => $modelMap[(string) $u['house_model_code']] ?? null,
                    'match_status'           => $status,
                ]);
        }

        // ตรวจว่า premium_label มี promotion_item_master ชื่อตรงกันอยู่แล้วหรือยัง (ไม่สร้างใหม่)
        $labels = $this->checkLabelsExist($batchId, $projectId);

        $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->update([
                'matched_rows'   => $matched,
                'unmatched_rows' => $unmatched + $ambiguous,
                'status'         => 'validated',
                'updated_at'     => date('Y-m-d H:i:s'),
            ]);

        return [
            'batch_id'          => $batchId,
            'total_rows'        => count($units),
            'matched_rows'      => $matched,
            'unmatched_rows'    => $unmatched,
            'ambiguous_rows'    => $ambiguous,
            'resolved_labels'   => $labels['resolved'],
            'unresolved_labels' => $labels['unresolved'],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Sync — เขียนข้อมูลจาก staging ลงฐานข้อมูลจริง
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sync batch ที่ validate แล้ว — เขียน staging ลงฐานข้อมูลจริง
     *   - bottom_line_price → project_units.unit_cost
     *   - land_area_sqw     → project_units.land_area_sqw
     *   - ของแถม → สร้าง promotion_item_master ตามกลยุทธ์ที่เลือกอัตโนมัติต่อ label:
     *       group-by-value : จำนวนค่าที่ต่างกัน ≤ จำนวนแบบบ้าน → 1 รายการ/1 ค่า
     *                        เก็บค่าใน default_value + ผูก eligibility
     *       per-unit       : ค่าต่างกันเยอะ (เช่น คชจ ฟรีวันโอน) → 1 รายการ
     *                        จำนวนเงินรายยูนิตเก็บใน promotion_item_unit_values
     *
     * sync เฉพาะ unit ที่ match_status = matched เท่านั้น
     */
    public function syncBatch(int $batchId): array
    {
        $batch = $this->getBatchOrFail($batchId);
        if ($batch['status'] === 'pending') {
            throw new RuntimeException('กรุณา validate batch ก่อน sync');
        }
        if ($batch['status'] === 'synced') {
            throw new RuntimeException('batch นี้ sync ไปแล้ว');
        }

        $projectId = (int) $batch['project_id'];

        // 1. สร้าง/จับคู่ promotion item ตามกลยุทธ์ของแต่ละ label
        //    (นอก transaction หลัก — PromotionItemService::create มี transaction ของตัวเอง)
        $material = $this->materializePromotionItems($batchId, $projectId);
        $plan     = $material['plan'];

        // 2. ดึงเฉพาะ unit ที่จับคู่สำเร็จ
        $units = $this->db->table('premium_import_units')
            ->where('batch_id', $batchId)
            ->where('match_status', 'matched')
            ->get()->getResultArray();

        if (empty($units)) {
            throw new RuntimeException('ไม่มี unit ที่จับคู่สำเร็จใน batch นี้');
        }

        $now = date('Y-m-d H:i:s');
        $this->db->transStart();

        $syncedCount = 0;
        foreach ($units as $u) {
            $unitId = (int) $u['matched_unit_id'];

            // 2.1 อัปเดต project_units เฉพาะค่าที่มีในไฟล์
            $unitUpdate = [];
            if ($u['bottom_line_price'] !== null) {
                $unitUpdate['unit_cost'] = $u['bottom_line_price'];
            }
            if ($u['land_area_sqw'] !== null) {
                $unitUpdate['land_area_sqw'] = $u['land_area_sqw'];
            }
            if (!empty($unitUpdate)) {
                $unitUpdate['updated_at'] = $now;
                $this->db->table('project_units')->where('id', $unitId)->update($unitUpdate);
            }

            // 2.2 ผูกของแถมรายยูนิต
            $values = $this->db->table('premium_import_values')
                ->where('import_unit_id', $u['id'])
                ->get()->getResultArray();

            foreach ($values as $v) {
                $label = trim((string) $v['premium_label']);
                $p     = $plan[$label] ?? null;
                if (!$p) {
                    continue;
                }

                if ($p['strategy'] === 'per_unit') {
                    // จำนวนเงินรายยูนิต — เก็บเฉพาะที่ amount > 0
                    $itemId = $p['item_id'];
                    if ((float) $v['amount'] > 0) {
                        $this->upsertUnitValue($itemId, $unitId, (float) $v['amount'], $batchId, $now);
                    }
                } else {
                    // group-by-value — ค่าอยู่ใน item.default_value แล้ว ไม่ต้องเก็บรายยูนิต
                    $itemId = $p['value_items'][$this->valueKey($v['amount'])] ?? null;
                }

                // เขียน promotion_item_id กลับ staging เพื่อ traceability
                if ($itemId) {
                    $this->db->table('premium_import_values')
                        ->where('id', $v['id'])
                        ->update(['promotion_item_id' => $itemId]);
                }
            }

            $this->db->table('premium_import_units')
                ->where('id', $u['id'])
                ->update(['match_status' => 'synced']);
            $syncedCount++;
        }

        $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->update([
                'synced_rows' => $syncedCount,
                'status'      => 'synced',
                'synced_at'   => $now,
                'updated_at'  => $now,
            ]);

        $this->db->transComplete();
        if ($this->db->transStatus() === false) {
            throw new RuntimeException('sync ข้อมูลไม่สำเร็จ');
        }

        return [
            'batch_id'      => $batchId,
            'synced_units'  => $syncedCount,
            'skipped_units' => (int) $batch['total_rows'] - $syncedCount,
            'created_items' => $material['created'],
        ];
    }

    /**
     * สร้าง/จับคู่ promotion_item_master สำหรับทุก label ใน batch — เลือกกลยุทธ์อัตโนมัติ
     *
     * กลยุทธ์ต่อ label (ตัดสินจากจำนวนค่าที่ต่างกัน):
     *   - group   : จำนวนค่า amount>0 ที่ต่างกัน ≤ จำนวนแบบบ้าน
     *               → 1 รายการต่อ 1 ค่า, ค่าอยู่ใน default_value, ผูก eligibility
     *   - per_unit: ค่าต่างกันมากกว่าจำนวนแบบบ้าน (เช่น คชจ ฟรีวันโอน)
     *               → 1 รายการ, จำนวนเงินรายยูนิตเก็บ promotion_item_unit_values
     *
     * idempotent: รายการที่มีอยู่แล้วจะถูกจับคู่ (group=ชื่อ+ค่า, per_unit=ชื่อ) ไม่สร้างซ้ำ
     *
     * @return array{plan: array<string,array>, created: array}
     */
    private function materializePromotionItems(int $batchId, int $projectId): array
    {
        // label + category ที่อยู่ใน batch
        $labels = $this->db->table('premium_import_values v')
            ->select('v.premium_label, v.premium_category')
            ->join('premium_import_units u', 'u.id = v.import_unit_id')
            ->where('u.batch_id', $batchId)
            ->where('u.match_status', 'matched')
            ->groupBy('v.premium_label, v.premium_category')
            ->get()->getResultArray();

        // promotion item เดิมของโครงการ — key by name → [{id, default_value}, ...]
        $existing = [];
        foreach ($this->db->table('promotion_item_master')
                     ->select('id, name, default_value')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $it) {
            $existing[trim((string) $it['name'])][] = $it;
        }

        // matched unit → house model
        //   matched_house_model_id (DB) ใช้ผูก eligibility — code (Excel) ใช้ตัดสินกลยุทธ์
        //   เพราะ "แบบบ้าน" ในไฟล์ (L/M/S) อาจไม่ตรงกับ house_models.code ในระบบ
        $unitToModel     = [];   // uid => matched_house_model_id|null
        $modelSet        = [];   // matched_house_model_id ที่ resolve ได้
        $codeSet         = [];   // house_model_code (Excel) ที่ไม่ว่าง
        $dbModelResolved = true; // true = ทุก matched unit มี matched_house_model_id
        foreach ($this->db->table('premium_import_units')
                     ->select('matched_unit_id, matched_house_model_id, house_model_code')
                     ->where('batch_id', $batchId)
                     ->where('match_status', 'matched')
                     ->get()->getResultArray() as $r) {
            if ($r['matched_unit_id'] === null) {
                continue;
            }
            $mid  = $r['matched_house_model_id'] !== null ? (int) $r['matched_house_model_id'] : null;
            $code = trim((string) ($r['house_model_code'] ?? ''));
            $unitToModel[(int) $r['matched_unit_id']] = $mid;
            if ($mid !== null) {
                $modelSet[$mid] = true;
            } else {
                $dbModelResolved = false;
            }
            if ($code !== '') {
                $codeSet[$code] = true;
            }
        }
        $totalUnits  = count($unitToModel);
        $allModelIds = array_keys($modelSet);
        // จำนวนกลุ่มแบบบ้าน (จาก code ในไฟล์) สำหรับตัดสินกลยุทธ์ — อย่างน้อย 1
        $modelCount  = max(1, count($codeSet));

        $svc     = new PromotionItemService();
        $plan    = [];
        $created = [];

        foreach ($labels as $lab) {
            $label    = trim((string) $lab['premium_label']);
            $category = $lab['premium_category'];

            // จำนวนเงิน amount>0 ของ label นี้ ต่อ matched unit
            $rows = $this->db->table('premium_import_values v')
                ->select('u.matched_unit_id, u.house_model_code, v.amount')
                ->join('premium_import_units u', 'u.id = v.import_unit_id')
                ->where('u.batch_id', $batchId)
                ->where('u.match_status', 'matched')
                ->where('v.premium_label', $label)
                ->where('v.amount >', 0)
                ->get()->getResultArray();

            // group units ตามค่า + ตรวจว่าค่าผูกกับแบบบ้านสะอาดไหม (ใช้ code จากไฟล์)
            $byValue    = [];   // valueKey => ['amount'=>float, 'units'=>[uid,...]]
            $codeValues = [];   // house_model_code => set ของ valueKey
            $allUnits   = [];   // uid ที่มี amount>0
            $hasNoCode  = false;
            foreach ($rows as $r) {
                $uid = (int) $r['matched_unit_id'];
                $amt = (float) $r['amount'];
                $vk  = $this->valueKey($amt);
                $byValue[$vk]['amount']  = $amt;
                $byValue[$vk]['units'][] = $uid;
                $allUnits[$uid]          = true;
                $code = trim((string) ($r['house_model_code'] ?? ''));
                if ($code === '') {
                    $hasNoCode = true;
                } else {
                    $codeValues[$code][$vk] = true;
                }
            }
            $distinctCount = count($byValue);

            // per-model-clean = ทุกแบบบ้าน (code) มีค่าเดียว และทุก unit มี code
            $clean = !$hasNoCode;
            foreach ($codeValues as $set) {
                if (count($set) > 1) {
                    $clean = false;
                    break;
                }
            }
            // ผูก eligibility ระดับแบบบ้านได้ ต่อเมื่อ code สะอาด + house model ใน DB resolve ครบ
            // มิฉะนั้น fallback เป็น eligibility ระดับยูนิต
            $useHouseModel = $clean && $dbModelResolved;

            if ($distinctCount >= 1 && $distinctCount <= $modelCount) {
                // ── group-by-value ──
                $valueItems = [];
                foreach ($byValue as $vk => $info) {
                    $itemId = $this->findExistingItem($existing, $label, $info['amount']);
                    if ($itemId === null) {
                        $elig = $this->deriveEligibility($info['units'], $unitToModel, $totalUnits, $allModelIds, $useHouseModel);
                        $item = $svc->create($projectId, [
                            'name'          => $label,
                            'category'      => $category,
                            'value_mode'    => 'fixed',
                            'default_value' => $info['amount'],
                        ], $elig['house_model_ids'], $elig['unit_ids']);
                        $itemId = (int) $item['id'];
                        $existing[$label][] = ['id' => $itemId, 'default_value' => $info['amount']];
                        $created[] = [
                            'label'                 => $label,
                            'strategy'              => 'group',
                            'value'                 => $info['amount'],
                            'promotion_item_id'     => $itemId,
                            'eligible_house_models' => count($elig['house_model_ids']),
                            'eligible_units'        => count($elig['unit_ids']),
                        ];
                    }
                    $valueItems[$vk] = $itemId;
                }
                $plan[$label] = ['strategy' => 'group', 'value_items' => $valueItems];
            } else {
                // ── per-unit (จำนวนเงินรายยูนิตใน promotion_item_unit_values) ──
                $itemId = $this->findExistingItem($existing, $label, null);
                if ($itemId === null) {
                    $elig = $this->deriveEligibility(array_keys($allUnits), $unitToModel, $totalUnits, $allModelIds, false);
                    // value_mode=unit_table → engine ดึงจำนวนเงินรายยูนิตจาก promotion_item_unit_values
                    $item = $svc->create($projectId, [
                        'name'          => $label,
                        'category'      => $category,
                        'value_mode'    => 'unit_table',
                        'value_source'  => 'promotion_item_unit_value',
                        'default_value' => 0,
                    ], $elig['house_model_ids'], $elig['unit_ids']);
                    $itemId = (int) $item['id'];
                    $existing[$label][] = ['id' => $itemId, 'default_value' => 0];
                    $created[] = [
                        'label'             => $label,
                        'strategy'          => 'per_unit',
                        'promotion_item_id' => $itemId,
                        'eligible_units'    => count($elig['unit_ids']),
                        'distinct_values'   => $distinctCount,
                    ];
                }
                $plan[$label] = ['strategy' => 'per_unit', 'item_id' => $itemId];
            }
        }

        return ['plan' => $plan, 'created' => $created];
    }

    /**
     * หา promotion item เดิมที่ตรงกัน
     *
     * @param ?float $value null = จับคู่ด้วยชื่อ (per_unit); มีค่า = จับคู่ชื่อ+default_value (group)
     */
    private function findExistingItem(array $existing, string $label, ?float $value): ?int
    {
        foreach ($existing[$label] ?? [] as $it) {
            if ($value === null) {
                return (int) $it['id'];
            }
            if (abs((float) $it['default_value'] - $value) < 0.005) {
                return (int) $it['id'];
            }
        }
        return null;
    }

    /** แปลงจำนวนเงินเป็น key สำหรับ group (ทศนิยม 2 ตำแหน่ง) */
    private function valueKey($amount): string
    {
        return number_format((float) $amount, 2, '.', '');
    }

    /**
     * หาเงื่อนไข eligibility ของ promotion item จากเซ็ตยูนิตที่ใช้ได้
     *   - useHouseModel=true  → ผูกด้วยแบบบ้าน (ค่าผูกกับแบบบ้านสะอาด + DB resolve ครบ)
     *   - useHouseModel=false → ผูกด้วยรายการยูนิต
     *   - ถ้าครอบคลุมทั้งโครงการ → คืน [] (convention: ว่าง = ใช้ได้ทุกอัน)
     *
     * @return array{house_model_ids: int[], unit_ids: int[]}
     */
    private function deriveEligibility(array $eligibleUnitIds, array $unitToModel, int $totalUnits, array $allModelIds, bool $useHouseModel): array
    {
        $eligibleUnitIds = array_values(array_unique(array_map('intval', $eligibleUnitIds)));

        if ($useHouseModel) {
            $models = [];
            foreach ($eligibleUnitIds as $uid) {
                $mid = $unitToModel[$uid] ?? null;
                if ($mid !== null) {
                    $models[$mid] = true;
                }
            }
            $modelIds = array_keys($models);
            if (count($modelIds) > 0 && count($modelIds) < count($allModelIds)) {
                return ['house_model_ids' => $modelIds, 'unit_ids' => []];
            }
            return ['house_model_ids' => [], 'unit_ids' => []];
        }

        if (count($eligibleUnitIds) > 0 && count($eligibleUnitIds) < $totalUnits) {
            return ['house_model_ids' => [], 'unit_ids' => $eligibleUnitIds];
        }
        return ['house_model_ids' => [], 'unit_ids' => []];
    }

    /** upsert จำนวนเงินของแถมรายยูนิตลง promotion_item_unit_values */
    private function upsertUnitValue(int $itemId, int $unitId, float $amount, int $batchId, string $now): void
    {
        $existing = $this->db->table('promotion_item_unit_values')
            ->where('promotion_item_id', $itemId)
            ->where('unit_id', $unitId)
            ->get()->getRowArray();

        if ($existing) {
            $this->db->table('promotion_item_unit_values')
                ->where('id', $existing['id'])
                ->update(['amount' => $amount, 'source_batch_id' => $batchId, 'updated_at' => $now]);
        } else {
            $this->db->table('promotion_item_unit_values')->insert([
                'promotion_item_id' => $itemId,
                'unit_id'           => $unitId,
                'amount'            => $amount,
                'source_batch_id'   => $batchId,
                'created_at'        => $now,
                'updated_at'        => $now,
            ]);
        }
    }

    /**
     * ตรวจว่า premium_label ของ batch มี promotion_item_master ชื่อตรงกันอยู่แล้วหรือยัง
     *
     * @return array{resolved: string[], unresolved: string[]}
     */
    private function checkLabelsExist(int $batchId, int $projectId): array
    {
        $labels = $this->db->table('premium_import_values v')
            ->select('v.premium_label')
            ->join('premium_import_units u', 'u.id = v.import_unit_id')
            ->where('u.batch_id', $batchId)
            ->groupBy('v.premium_label')
            ->get()->getResultArray();

        $names = [];
        foreach ($this->db->table('promotion_item_master')
                     ->select('name')
                     ->where('project_id', $projectId)
                     ->get()->getResultArray() as $it) {
            $names[trim((string) $it['name'])] = true;
        }

        $resolved = $unresolved = [];
        foreach ($labels as $l) {
            $label = trim((string) $l['premium_label']);
            if (isset($names[$label])) {
                $resolved[] = $label;
            } else {
                $unresolved[] = $label;
            }
        }
        return ['resolved' => $resolved, 'unresolved' => $unresolved];
    }

    private function getBatchOrFail(int $batchId): array
    {
        $batch = $this->db->table('premium_import_batches')
            ->where('id', $batchId)
            ->get()->getRowArray();

        if (!$batch) {
            throw new RuntimeException('ไม่พบรายการ import นี้');
        }
        return $batch;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Excel parsing helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ตรวจหาตำแหน่งหัวตาราง + คอลัมน์ของแถม จากโครงสร้างชีต
     *
     * @return array{
     *   project_code: ?string, header_row: int, data_start_row: int,
     *   seq_col: int, plot_col: int, land_col: int, model_col: int, price_col: int,
     *   premium_columns: array<array{column_index:int,label:string,category:string}>
     * }
     */
    private function detectLayout($sheet): array
    {
        $highestRow = min($sheet->getHighestDataRow(), self::HEADER_SCAN_LIMIT);
        $highestCol = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());

        // หาแถวหัวตารางชั้นบน (แถวที่มีคำว่า "ลำดับ")
        $headerRow = 0;
        $cols      = ['seq' => 0, 'plot' => 0, 'land' => 0, 'model' => 0, 'price' => 0];

        for ($r = 1; $r <= $highestRow; $r++) {
            for ($c = 1; $c <= $highestCol; $c++) {
                if ($this->cellText($sheet, $c, $r) === 'ลำดับ') {
                    $headerRow = $r;
                    break 2;
                }
            }
        }
        if ($headerRow === 0) {
            throw new RuntimeException('ไม่พบหัวตาราง (ช่อง "ลำดับ") ในชีตนี้');
        }

        // จับคู่คอลัมน์หลักจากหัวตารางชั้นบน
        $labelMap = ['ลำดับ' => 'seq', 'เลขแปลง' => 'plot', 'เนื้อที่ดิน' => 'land', 'แบบบ้าน' => 'model', 'ราคา' => 'price'];
        for ($c = 1; $c <= $highestCol; $c++) {
            $key = $labelMap[$this->cellText($sheet, $c, $headerRow)] ?? null;
            if ($key !== null) {
                $cols[$key] = $c;
            }
        }
        foreach (['plot' => 'เลขแปลง', 'land' => 'เนื้อที่ดิน', 'model' => 'แบบบ้าน', 'price' => 'ราคา'] as $key => $thaiLabel) {
            if ($cols[$key] === 0) {
                throw new RuntimeException('ไม่พบคอลัมน์ "' . $thaiLabel . '" ในหัวตาราง');
            }
        }

        // คอลัมน์ของแถม = ช่องในหัวชั้นล่างที่อยู่ขวาของคอลัมน์ "ราคา" และไม่ใช่ "Bottom Line"
        $subHeaderRow    = $headerRow + 1;
        $premiumColumns  = [];
        for ($c = $cols['price'] + 1; $c <= $highestCol; $c++) {
            $label = $this->cellText($sheet, $c, $subHeaderRow);
            if ($label === '' || $label === 'Bottom Line') {
                continue;
            }
            $premiumColumns[] = [
                'column_index' => $c,
                'label'        => $label,
                'category'     => $this->classifyCategory($label),
            ];
        }

        return [
            'project_code'    => $this->detectProjectCode($sheet, $headerRow, $highestCol),
            'header_row'      => $headerRow,
            'data_start_row'  => $subHeaderRow + 1,
            'seq_col'         => $cols['seq'],
            'plot_col'        => $cols['plot'],
            'land_col'        => $cols['land'],
            'model_col'       => $cols['model'],
            'price_col'       => $cols['price'],
            'premium_columns' => $premiumColumns,
        ];
    }

    /**
     * อ่านรหัสโครงการจากช่องถัดจากคำว่า "โครงการ" (เหนือแถวหัวตาราง)
     */
    private function detectProjectCode($sheet, int $headerRow, int $highestCol): ?string
    {
        for ($r = 1; $r < $headerRow; $r++) {
            for ($c = 1; $c <= $highestCol; $c++) {
                if ($this->cellText($sheet, $c, $r) === 'โครงการ') {
                    $code = $this->cellText($sheet, $c + 1, $r);
                    return $code !== '' ? $code : null;
                }
            }
        }
        return null;
    }

    /**
     * อ่านข้อมูลทุกแปลง — ข้ามแถวที่ไม่มีเลขแปลง (แถวว่าง/แถวรวมยอด)
     *
     * @return array<array{
     *   raw_row_index:int, seq:?int, plot_no:string, land_area_sqw:?float,
     *   house_model_code:?string, bottom_line_price:?float, premiums:array
     * }>
     */
    private function extractRows($sheet, array $layout): array
    {
        $rows       = [];
        $highestRow = $sheet->getHighestDataRow();

        for ($r = $layout['data_start_row']; $r <= $highestRow; $r++) {
            $plotNo = $this->cellText($sheet, $layout['plot_col'], $r);
            if ($plotNo === '') {
                continue; // แถวว่างหรือแถวรวมยอด
            }

            $premiums = [];
            foreach ($layout['premium_columns'] as $pc) {
                $premiums[] = [
                    'column_index' => $pc['column_index'],
                    'label'        => $pc['label'],
                    'category'     => $pc['category'],
                    'amount'       => $this->cellNumber($sheet, $pc['column_index'], $r) ?? 0,
                ];
            }

            $seq   = $this->cellNumber($sheet, $layout['seq_col'], $r);
            $model = $this->cellText($sheet, $layout['model_col'], $r);

            $rows[] = [
                'raw_row_index'     => $r,
                'seq'               => $seq !== null ? (int) $seq : null,
                'plot_no'           => $plotNo,
                'land_area_sqw'     => $this->cellNumber($sheet, $layout['land_col'], $r),
                'house_model_code'  => $model !== '' ? $model : null,
                'bottom_line_price' => $this->cellNumber($sheet, $layout['price_col'], $r),
                'premiums'          => $premiums,
            ];
        }

        return $rows;
    }

    /**
     * จัดหมวดของแถมตามชื่อคอลัมน์ ให้ตรงกับ 3 หมวดของระบบ
     */
    private function classifyCategory(string $label): string
    {
        if (mb_strpos($label, 'คชจ') !== false
            || mb_strpos($label, 'ค่าใช้จ่าย') !== false
            || mb_strpos($label, 'ฟรี') !== false) {
            return 'expense_support';
        }
        if (mb_strpos($label, 'ลด') !== false) {
            return 'discount';
        }
        return 'premium';
    }

    private function findProjectByCode(string $code): ?array
    {
        $project = $this->db->table('projects')
            ->select('id, code, name')
            ->where('code', $code)
            ->get()
            ->getRowArray();

        return $project ?: null;
    }

    /** อ่านค่าช่องเป็นข้อความ (trim แล้ว) */
    private function cellText($sheet, int $colIndex, int $rowIndex): string
    {
        $coord = Coordinate::stringFromColumnIndex($colIndex) . $rowIndex;
        $value = $sheet->getCell($coord)->getValue();

        return $value === null ? '' : trim((string) $value);
    }

    /** อ่านค่าช่องเป็นตัวเลข — คืน null ถ้าว่างหรือไม่ใช่ตัวเลข */
    private function cellNumber($sheet, int $colIndex, int $rowIndex): ?float
    {
        $coord = Coordinate::stringFromColumnIndex($colIndex) . $rowIndex;
        $value = $sheet->getCell($coord)->getValue();

        if ($value === null || $value === '') {
            return null;
        }
        if (!is_numeric($value)) {
            return null;
        }

        return (float) $value;
    }
}
