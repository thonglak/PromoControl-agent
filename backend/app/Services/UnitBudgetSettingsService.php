<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * UnitBudgetSettingsService — คำนวณ standard_budget ของแต่ละยูนิต
 *  จากผลรวม default_value ของ promotion items มาตรฐาน (is_unit_standard=1)
 *
 * กฎการคำนวณ:
 * - บวก max_value ของทุก item ที่ is_unit_standard=1 AND is_active=1 AND project_id ตรงกัน
 *   (ถ้า max_value = NULL ให้ fallback ใช้ default_value แทน)
 * - รวมกรณี value_mode='calculated' ด้วย (ใช้ค่า max_value ตรง ๆ ไม่ evaluate สูตร)
 * - กรองตาม promotion_item_house_models: ถ้ามีรายการ → ต้องตรงกับ house_model ของยูนิต
 *   (ถ้าไม่มี = ใช้ได้ทุกแบบบ้าน)
 * - กรองตาม promotion_item_units: ถ้ามีรายการ → ต้องมียูนิตนี้ใน list
 *   (ถ้าไม่มี = ใช้ได้ทุกยูนิต)
 * - แสดงเฉพาะยูนิต status='available' (ขายแล้วซ่อน)
 *
 * Apply: ทับ project_units.standard_budget ค่าเดิมได้
 */
class UnitBudgetSettingsService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /**
     * Preview: คำนวณงบที่ใหม่ของทุก unit available ในโครงการ
     *
     * @return array<int, array{
     *   unit_id:int, unit_code:string, house_model_id:?int, house_model_name:?string,
     *   current_budget:float, calculated_budget:float, diff:float,
     *   item_count:int, items:array<int, array{id:int, code:string, name:string, value:float}>
     * }>
     */
    public function previewProject(int $projectId): array
    {
        // 1. ดึงยูนิต status=available ของโครงการ
        $units = $this->db->table('project_units pu')
            ->select('pu.id, pu.unit_code, pu.house_model_id, pu.standard_budget, hm.name as house_model_name')
            ->join('house_models hm', 'hm.id = pu.house_model_id', 'left')
            ->where('pu.project_id', $projectId)
            ->where('pu.status', 'available')
            ->orderBy('pu.unit_code', 'ASC')
            ->get()->getResultArray();

        if (empty($units)) {
            return [];
        }

        // 2. ดึง promotion items มาตรฐานของโครงการ (ดึง max_value + default_value ไว้ fallback)
        $items = $this->db->table('promotion_item_master')
            ->select('id, code, name, max_value, default_value')
            ->where('project_id', $projectId)
            ->where('is_unit_standard', 1)
            ->where('is_active', 1)
            ->orderBy('sort_order', 'ASC')
            ->get()->getResultArray();

        if (empty($items)) {
            // ไม่มี item มาตรฐาน → ทุกยูนิต = 0
            return array_map(static fn($u) => [
                'unit_id'           => (int) $u['id'],
                'unit_code'         => $u['unit_code'],
                'house_model_id'    => $u['house_model_id'] !== null ? (int) $u['house_model_id'] : null,
                'house_model_name'  => $u['house_model_name'],
                'current_budget'    => (float) $u['standard_budget'],
                'calculated_budget' => 0.0,
                'diff'              => 0.0 - (float) $u['standard_budget'],
                'item_count'        => 0,
                'items'             => [],
            ], $units);
        }

        $itemIds = array_map(static fn($i) => (int) $i['id'], $items);

        // 3. ดึง house_model eligibility map: item_id => Set<house_model_id>
        $hmRows = $this->db->table('promotion_item_house_models')
            ->whereIn('promotion_item_id', $itemIds)
            ->get()->getResultArray();
        $hmMap = []; // [item_id => [hm_id => true]]
        foreach ($hmRows as $r) {
            $hmMap[(int) $r['promotion_item_id']][(int) $r['house_model_id']] = true;
        }

        // 4. ดึง unit eligibility map: item_id => Set<unit_id>
        $unitRows = $this->db->table('promotion_item_units')
            ->whereIn('promotion_item_id', $itemIds)
            ->get()->getResultArray();
        $unitMap = []; // [item_id => [unit_id => true]]
        foreach ($unitRows as $r) {
            $unitMap[(int) $r['promotion_item_id']][(int) $r['unit_id']] = true;
        }

        // 5. Build response: คำนวณต่อยูนิต
        $result = [];
        foreach ($units as $u) {
            $unitId = (int) $u['id'];
            $hmId   = $u['house_model_id'] !== null ? (int) $u['house_model_id'] : null;

            $eligibleItems = [];
            $sum = 0.0;

            foreach ($items as $item) {
                $itemId = (int) $item['id'];

                // กรอง house_model: ถ้ามีบันทึก → ต้องตรง
                if (isset($hmMap[$itemId])) {
                    if ($hmId === null || !isset($hmMap[$itemId][$hmId])) {
                        continue;
                    }
                }

                // กรอง unit override: ถ้ามีบันทึก → ต้องมียูนิตนี้
                if (isset($unitMap[$itemId])) {
                    if (!isset($unitMap[$itemId][$unitId])) {
                        continue;
                    }
                }

                // ใช้ค่าสูงสุด (max_value) — ถ้า NULL ให้ fallback เป็น default_value
                $value = $item['max_value'] !== null
                    ? (float) $item['max_value']
                    : (float) $item['default_value'];
                $sum += $value;
                $eligibleItems[] = [
                    'id'    => $itemId,
                    'code'  => $item['code'],
                    'name'  => $item['name'],
                    'value' => $value,
                ];
            }

            $current = (float) $u['standard_budget'];
            $result[] = [
                'unit_id'           => $unitId,
                'unit_code'         => $u['unit_code'],
                'house_model_id'    => $hmId,
                'house_model_name'  => $u['house_model_name'],
                'current_budget'    => $current,
                'calculated_budget' => $sum,
                'diff'              => $sum - $current,
                'item_count'        => count($eligibleItems),
                'items'             => $eligibleItems,
            ];
        }

        return $result;
    }

    /**
     * Apply: บันทึก standard_budget ใหม่ทับค่าเดิม สำหรับยูนิตที่ระบุ (หรือทั้งโครงการถ้า null)
     *
     * @return array{updated:int}
     */
    public function applyProject(int $projectId, ?array $unitIds = null): array
    {
        // คำนวณใหม่ตอน apply เพื่อกัน race condition (ระหว่าง preview กับ apply อาจเปลี่ยน)
        $rows = $this->previewProject($projectId);
        if (empty($rows)) {
            return ['updated' => 0];
        }

        $idSet = $unitIds !== null ? array_flip(array_map('intval', $unitIds)) : null;
        $now = date('Y-m-d H:i:s');

        $this->db->transBegin();
        try {
            $updated = 0;
            foreach ($rows as $r) {
                if ($idSet !== null && !isset($idSet[$r['unit_id']])) {
                    continue;
                }
                $this->db->table('project_units')
                    ->where('id', $r['unit_id'])
                    ->update([
                        'standard_budget' => $r['calculated_budget'],
                        'updated_at'      => $now,
                    ]);
                $updated++;
            }
            $this->db->transCommit();
            return ['updated' => $updated];
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException($e->getMessage());
        }
    }
}
