<?php

namespace App\Models;

use CodeIgniter\Model;

class UnitModel extends Model
{
    protected $table      = 'project_units';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = [
        'project_id', 'house_model_id', 'unit_code', 'unit_number',
        'floor', 'building', 'unit_type_id',
        'base_price', 'unit_cost', 'appraisal_price', 'standard_budget',
        'status', 'sale_date', 'transfer_date', 'remark',
    ];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    public function getListWithModel(int $projectId, array $filters = []): array
    {
        $db = \Config\Database::connect();

        $builder = $db->table('project_units pu')
            ->select('pu.*, hm.name AS house_model_name, hm.code AS house_model_code, hm.area_sqm, ut.name AS unit_type_name, p.project_type')
            ->join('house_models hm', 'hm.id = pu.house_model_id', 'left')
            ->join('unit_types ut', 'ut.id = pu.unit_type_id', 'left')
            ->join('projects p', 'p.id = pu.project_id', 'left')
            ->where('pu.project_id', $projectId)
            ->orderBy('pu.unit_code', 'ASC');

        if (!empty($filters['house_model_id'])) {
            $builder->where('pu.house_model_id', (int) $filters['house_model_id']);
        }
        if (!empty($filters['status'])) {
            $builder->where('pu.status', $filters['status']);
        }
        if (!empty($filters['search'])) {
            $s = $filters['search'];
            $builder->groupStart()
                ->like('pu.unit_code', $s)
                ->orLike('pu.unit_number', $s)
                ->groupEnd();
        }

        return $builder->get()->getResultArray();
    }

    public function isCodeDuplicate(string $code, int $projectId, ?int $excludeId = null): bool
    {
        $builder = $this->where('project_id', $projectId)->where('unit_code', $code);
        if ($excludeId !== null) {
            $builder = $builder->where('id !=', $excludeId);
        }
        return $builder->countAllResults() > 0;
    }

    public function hasSalesTransactions(int $unitId): bool
    {
        $db = \Config\Database::connect();
        return $db->table('sales_transactions')
            ->where('unit_id', $unitId)
            ->countAllResults() > 0;
    }

    public function getBudgetSummary(int $unitId): array
    {
        $db = \Config\Database::connect();

        $unit = $this->find($unitId);
        $standardBudget = (float) ($unit['standard_budget'] ?? 0);

        // รวม movements แยกตาม source_type
        $rows = $db->table('budget_movements')
            ->select('budget_source_type, movement_type, SUM(amount) AS total')
            ->where('unit_id', $unitId)
            ->where('status', 'approved')
            ->groupBy('budget_source_type, movement_type')
            ->get()->getResultArray();

        $used = 0;
        foreach ($rows as $row) {
            if (in_array($row['movement_type'], ['USE', 'SPECIAL_BUDGET_USE'])) {
                $used += (float) $row['total'];
            }
        }

        return [
            'standard_budget' => $standardBudget,
            'budget_used'     => $used,
            'budget_remaining'=> $standardBudget - $used,
            'movements'       => $rows,
        ];
    }
}
