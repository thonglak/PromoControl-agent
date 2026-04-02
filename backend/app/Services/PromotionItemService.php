<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

class PromotionItemService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // List — scoped by project_id
    // ═══════════════════════════════════════════════════════════════════════

    public function getList(int $projectId, array $filters = []): array
    {
        $builder = $this->db->table('promotion_item_master p')
            ->select('p.*')
            ->where('p.project_id', $projectId)
            ->orderBy('p.sort_order', 'ASC')
            ->orderBy('p.name', 'ASC');

        if (!empty($filters['category']))   $builder->where('p.category', $filters['category']);
        if (!empty($filters['value_mode'])) $builder->where('p.value_mode', $filters['value_mode']);
        if (isset($filters['is_unit_standard']) && $filters['is_unit_standard'] !== '')
            $builder->where('p.is_unit_standard', (int) $filters['is_unit_standard']);
        if (!empty($filters['search'])) {
            $builder->groupStart()->like('p.code', $filters['search'])->orLike('p.name', $filters['search'])->groupEnd();
        }

        if (isset($filters['is_active']) && $filters['is_active'] !== '')
            $builder->where('p.is_active', (int) $filters['is_active']);

        $items = $builder->get()->getResultArray();
        foreach ($items as &$item) {
            $item['is_unit_standard'] = (bool) $item['is_unit_standard'];
            $item['is_active'] = (bool) $item['is_active'];
            $item = $this->enrichItem($item);
        }
        return $items;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Show
    // ═══════════════════════════════════════════════════════════════════════

    public function getById(int $id): ?array
    {
        $item = $this->db->table('promotion_item_master')->where('id', $id)->get()->getRowArray();
        if (!$item) return null;
        $item['is_unit_standard'] = (bool) $item['is_unit_standard'];
        $item['is_active'] = (bool) $item['is_active'];
        $item = $this->enrichItem($item);
        $item['fee_formula'] = $this->db->table('fee_formulas')->where('promotion_item_id', $id)->get()->getRowArray();
        return $item;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Create — project_id required
    // ═══════════════════════════════════════════════════════════════════════

    public function create(int $projectId, array $data, array $houseModelIds = [], array $unitIds = []): array
    {
        $data['project_id'] = $projectId;
        $errors = $this->validate($data);
        if ($errors) throw new RuntimeException(implode(', ', $errors));

        $this->db->transBegin();
        try {
            $now = date('Y-m-d H:i:s');
            $this->db->table('promotion_item_master')->insert([
                'project_id'         => $projectId,
                'code'               => $this->generateCode($projectId),
                'name'               => trim($data['name']),
                'category'           => $data['category'],
                'default_value'      => (float) ($data['default_value'] ?? 0),
                'max_value'          => isset($data['max_value']) ? (float) $data['max_value'] : null,
                'default_used_value' => isset($data['default_used_value']) ? (float) $data['default_used_value'] : null,
                'discount_convert_value' => isset($data['discount_convert_value']) ? (float) $data['discount_convert_value'] : null,
                'value_mode'         => $data['value_mode'] ?? 'fixed',
                'is_unit_standard'   => !empty($data['is_unit_standard']) ? 1 : 0,
                'is_active'          => isset($data['is_active']) ? ($data['is_active'] ? 1 : 0) : 1,
                'sort_order'         => (int) ($data['sort_order'] ?? 0),
                'eligible_start_date' => $data['eligible_start_date'] ?? null,
                'eligible_end_date'   => $data['eligible_end_date'] ?? null,
                'created_at'         => $now,
                'updated_at'         => $now,
            ]);
            $newId = $this->db->insertID();
            $this->syncHouseModels($newId, $houseModelIds);
            $this->syncUnits($newId, $unitIds);
            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('สร้างรายการไม่สำเร็จ: ' . $e->getMessage());
        }
        return $this->getById($newId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Update — ห้ามเปลี่ยน project_id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id, array $data, array $houseModelIds = [], array $unitIds = []): array
    {
        $existing = $this->db->table('promotion_item_master')->where('id', $id)->get()->getRowArray();
        if (!$existing) throw new RuntimeException('ไม่พบรายการโปรโมชั่น');

        // ห้ามเปลี่ยน project_id
        if (isset($data['project_id']) && (int) $data['project_id'] !== (int) $existing['project_id']) {
            throw new RuntimeException('ไม่สามารถย้ายรายการของแถมข้ามโครงการได้');
        }
        unset($data['code']); // ห้ามแก้ code

        $data['project_id'] = (int) $existing['project_id'];
        $errors = $this->validate($data, $id);
        if ($errors) throw new RuntimeException(implode(', ', $errors));

        $this->db->transBegin();
        try {
            $this->db->table('promotion_item_master')->where('id', $id)->update([
                'name'               => trim($data['name']),
                'category'           => $data['category'],
                'default_value'      => (float) ($data['default_value'] ?? 0),
                'max_value'          => isset($data['max_value']) ? (float) $data['max_value'] : null,
                'default_used_value' => isset($data['default_used_value']) ? (float) $data['default_used_value'] : null,
                'discount_convert_value' => isset($data['discount_convert_value']) ? (float) $data['discount_convert_value'] : null,
                'value_mode'         => $data['value_mode'] ?? 'fixed',
                'is_unit_standard'   => !empty($data['is_unit_standard']) ? 1 : 0,
                'is_active'          => isset($data['is_active']) ? ($data['is_active'] ? 1 : 0) : 1,
                'sort_order'         => (int) ($data['sort_order'] ?? 0),
                'eligible_start_date' => $data['eligible_start_date'] ?? null,
                'eligible_end_date'   => $data['eligible_end_date'] ?? null,
                'updated_at'         => date('Y-m-d H:i:s'),
            ]);

            if ($existing['value_mode'] === 'calculated' && ($data['value_mode'] ?? 'fixed') !== 'calculated') {
                $this->db->table('fee_rate_policies')
                    ->whereIn('fee_formula_id', function ($sub) use ($id) {
                        return $sub->select('id')->from('fee_formulas')->where('promotion_item_id', $id);
                    })->delete();
                $this->db->table('fee_formulas')->where('promotion_item_id', $id)->delete();
            }

            $this->syncHouseModels($id, $houseModelIds);
            $this->syncUnits($id, $unitIds);
            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('อัปเดตรายการไม่สำเร็จ: ' . $e->getMessage());
        }
        return $this->getById($id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Delete
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): void
    {
        $existing = $this->db->table('promotion_item_master')->where('id', $id)->get()->getRowArray();
        if (!$existing) throw new RuntimeException('ไม่พบรายการโปรโมชั่น');

        $used = $this->db->table('sales_transaction_items')->where('promotion_item_id', $id)->countAllResults();
        if ($used > 0) throw new RuntimeException('ไม่สามารถลบรายการโปรโมชั่นที่ถูกใช้ในรายการขายแล้วได้');

        $this->db->transBegin();
        try {
            $this->db->table('promotion_item_house_models')->where('promotion_item_id', $id)->delete();
            $this->db->table('promotion_item_units')->where('promotion_item_id', $id)->delete();
            $fIds = array_column($this->db->table('fee_formulas')->select('id')->where('promotion_item_id', $id)->get()->getResultArray(), 'id');
            if ($fIds) $this->db->table('fee_rate_policies')->whereIn('fee_formula_id', $fIds)->delete();
            $this->db->table('fee_formulas')->where('promotion_item_id', $id)->delete();
            $this->db->table('promotion_item_master')->where('id', $id)->delete();
            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('ลบรายการไม่สำเร็จ: ' . $e->getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private
    // ═══════════════════════════════════════════════════════════════════════

    private function generateCode(int $projectId): string
    {
        $last = $this->db->table("promotion_item_master")
            ->where("project_id", $projectId)
            ->like("code", "PI-", "after")
            ->orderBy("code", "DESC")
            ->limit(1)
            ->get()->getRowArray();

        $next = 1;
        if ($last && preg_match("/PI-(\d+)/", $last["code"], $matches)) {
            $next = intval($matches[1]) + 1;
        }

        return "PI-" . str_pad((string) $next, 4, "0", STR_PAD_LEFT);
    }

    private function validate(array $data, ?int $excludeId = null): array
    {
        $errors = [];
        if (empty(trim((string) ($data['name'] ?? '')))) $errors[] = 'กรุณากรอกชื่อรายการ';

        if (!in_array($data['category'] ?? '', ['discount', 'premium', 'expense_support'], true))
            $errors[] = 'ประเภทต้องเป็น discount, premium หรือ expense_support';
        if (!in_array($data['value_mode'] ?? 'fixed', ['fixed', 'actual', 'manual', 'calculated'], true))
            $errors[] = 'รูปแบบมูลค่าไม่ถูกต้อง';
        if (isset($data['max_value'], $data['default_value']) && (float) $data['max_value'] < (float) $data['default_value'])
            $errors[] = 'มูลค่าสูงสุดต้องไม่น้อยกว่ามูลค่าเริ่มต้น';
        if (isset($data['default_used_value'], $data['max_value']) && (float) $data['default_used_value'] > (float) $data['max_value'])
            $errors[] = 'ค่าเริ่มต้นมูลค่าที่ใช้ต้องไม่เกินมูลค่าสูงสุด';
        if (!empty($data['eligible_start_date']) && !empty($data['eligible_end_date']) && $data['eligible_start_date'] > $data['eligible_end_date'])
            $errors[] = 'วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด';
        return $errors;
    }

    private function syncHouseModels(int $itemId, array $ids): void
    {
        $this->db->table('promotion_item_house_models')->where('promotion_item_id', $itemId)->delete();
        foreach ($ids as $hmId) $this->db->table('promotion_item_house_models')->insert(['promotion_item_id' => $itemId, 'house_model_id' => (int) $hmId]);
    }

    private function syncUnits(int $itemId, array $ids): void
    {
        $this->db->table('promotion_item_units')->where('promotion_item_id', $itemId)->delete();
        foreach ($ids as $uId) $this->db->table('promotion_item_units')->insert(['promotion_item_id' => $itemId, 'unit_id' => (int) $uId]);
    }

    private function enrichItem(array $item): array
    {
        $id = (int) $item['id'];
        $item['eligible_house_models'] = $this->db->table('promotion_item_house_models pihm')
            ->select('pihm.id, pihm.house_model_id, hm.name AS house_model_name')
            ->join('house_models hm', 'hm.id = pihm.house_model_id', 'left')
            ->where('pihm.promotion_item_id', $id)->get()->getResultArray();
        $item['eligible_units'] = $this->db->table('promotion_item_units piu')
            ->select('piu.id, piu.unit_id, pu.unit_code')
            ->join('project_units pu', 'pu.id = piu.unit_id', 'left')
            ->where('piu.promotion_item_id', $id)->get()->getResultArray();
        $item['has_fee_formula'] = $this->db->table('fee_formulas')->where('promotion_item_id', $id)->countAllResults() > 0;
        return $item;
    }
}
