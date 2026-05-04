<?php

namespace App\Models;

use CodeIgniter\Model;

class ProjectModel extends Model
{
    protected $table            = 'projects';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $useTimestamps    = false;

    protected $allowedFields = [
        'code', 'name', 'description', 'company_name', 'location',
        'project_type', 'approval_required', 'allow_over_budget', 'pool_budget_amount',
        'common_fee_rate', 'electric_meter_fee', 'water_meter_fee',
        'status', 'start_date', 'end_date', 'created_at', 'updated_at',
    ];

    protected $validProjectTypes = ['condo', 'house', 'townhouse', 'mixed'];
    protected $validStatuses     = ['active', 'inactive', 'completed'];

    /**
     * ดึง projects พร้อม unit_count (LEFT JOIN) พร้อม pagination
     * admin → ดูได้ทุก project
     * others → filter โดย $projectIds
     * คืนค่า ['data' => [...], 'total' => N]
     */
    public function getProjectsWithUnitCount(
        array $projectIds = [],
        bool  $isAdmin    = false,
        string $search    = '',
        string $status    = '',
        string $type      = '',
        int $page         = 1,
        int $perPage      = 20
    ): array {
        // ถ้าไม่ใช่ admin และไม่มี project_ids → return ว่าง
        if (! $isAdmin && empty($projectIds)) {
            return ['data' => [], 'total' => 0];
        }

        // Count query (ไม่มี GROUP BY / JOIN เพื่อ performance)
        $countBuilder = $this->db->table('projects p');
        if (! $isAdmin) {
            $countBuilder->whereIn('p.id', $projectIds);
        }
        if ($search !== '') {
            $countBuilder->groupStart()->like('p.code', $search)->orLike('p.name', $search)->groupEnd();
        }
        if ($status !== '' && in_array($status, $this->validStatuses, true)) {
            $countBuilder->where('p.status', $status);
        }
        if ($type !== '' && in_array($type, $this->validProjectTypes, true)) {
            $countBuilder->where('p.project_type', $type);
        }
        $total = $countBuilder->countAllResults();

        // Data query พร้อม LIMIT/OFFSET
        $dataBuilder = $this->db->table('projects p')
            ->select('p.*, COUNT(pu.id) AS unit_count')
            ->join('project_units pu', 'pu.project_id = p.id', 'left')
            ->groupBy('p.id')
            ->orderBy('p.created_at', 'DESC');

        if (! $isAdmin) {
            $dataBuilder->whereIn('p.id', $projectIds);
        }
        if ($search !== '') {
            $dataBuilder->groupStart()->like('p.code', $search)->orLike('p.name', $search)->groupEnd();
        }
        if ($status !== '' && in_array($status, $this->validStatuses, true)) {
            $dataBuilder->where('p.status', $status);
        }
        if ($type !== '' && in_array($type, $this->validProjectTypes, true)) {
            $dataBuilder->where('p.project_type', $type);
        }

        $offset = ($page - 1) * $perPage;
        $data   = $dataBuilder->limit($perPage, $offset)->get()->getResultArray();

        return ['data' => $data, 'total' => $total];
    }

    /**
     * ตรวจว่า code ซ้ำหรือไม่ (สำหรับ create)
     */
    public function isCodeDuplicate(string $code, ?int $excludeId = null): bool
    {
        $builder = $this->where('code', $code);
        if ($excludeId !== null) {
            $builder->where('id !=', $excludeId);
        }
        return $builder->countAllResults() > 0;
    }

    /**
     * ตรวจว่า project มี sales_transactions หรือไม่
     */
    public function hasSalesTransactions(int $projectId): bool
    {
        return $this->db->table('sales_transactions')
            ->where('project_id', $projectId)
            ->countAllResults() > 0;
    }

    /**
     * ตรวจว่า project มี units หรือ house_models หรือไม่
     * ใช้สำหรับ guard ก่อน soft-delete (spec: ลบได้เฉพาะกรณีไม่มี units)
     */
    public function hasUnitsOrHouseModels(int $projectId): bool
    {
        $unitCount = $this->db->table('project_units')
            ->where('project_id', $projectId)->countAllResults();
        if ($unitCount > 0) {
            return true;
        }

        $modelCount = $this->db->table('house_models')
            ->where('project_id', $projectId)->countAllResults();
        return $modelCount > 0;
    }

    /**
     * ลบ project และ related data ในลำดับที่ถูกต้อง (HARD DELETE)
     *
     * ⚠️  ใช้สำหรับ admin purge เท่านั้น — ไม่ใช่ delete ปกติ
     * delete ปกติให้ใช้ soft-delete (update status = 'inactive') แทน
     * ต้องตรวจ hasSalesTransactions() และ hasUnitsOrHouseModels() ก่อนเรียก
     */
    public function deleteProjectCascade(int $projectId): void
    {
        $db = $this->db;
        $db->transStart();

        // ลบ related data ตามลำดับ FK
        $db->table('number_series')->where('project_id', $projectId)->delete();
        $db->table('user_projects')->where('project_id', $projectId)->delete();
        $db->table('unit_budget_allocations')->where('project_id', $projectId)->delete();
        $db->table('budget_movements')->where('project_id', $projectId)->delete();
        $db->table('bottom_line_mapping_columns')
            ->whereIn('preset_id', function ($q) use ($projectId) {
                $q->select('id')
                  ->from('bottom_line_mappings')
                  ->where('project_id', $projectId);
            })->delete();
        $db->table('bottom_line_mappings')->where('project_id', $projectId)->delete();
        $db->table('bottom_lines')->where('project_id', $projectId)->delete();
        $db->table('project_units')->where('project_id', $projectId)->delete();
        $db->table('house_models')->where('project_id', $projectId)->delete();
        $db->table('projects')->where('id', $projectId)->delete();

        $db->transComplete();

        if (! $db->transStatus()) {
            throw new \RuntimeException('ลบโครงการไม่สำเร็จ', 500);
        }
    }
}
