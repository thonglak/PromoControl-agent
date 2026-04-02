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
        'status', 'start_date', 'end_date', 'created_at', 'updated_at',
    ];

    protected $validProjectTypes = ['condo', 'house', 'townhouse', 'mixed'];
    protected $validStatuses     = ['active', 'inactive', 'completed'];

    /**
     * ดึง projects พร้อม unit_count (LEFT JOIN)
     * admin → ดูได้ทุก project
     * others → filter โดย $projectIds
     */
    public function getProjectsWithUnitCount(
        array $projectIds = [],
        bool  $isAdmin    = false,
        string $search    = '',
        string $status    = '',
        string $type      = ''
    ): array {
        $builder = $this->db->table('projects p')
            ->select('p.*, COUNT(pu.id) AS unit_count')
            ->join('project_units pu', 'pu.project_id = p.id', 'left')
            ->groupBy('p.id')
            ->orderBy('p.created_at', 'DESC');

        // ตรวจสิทธิ์ — admin เห็นทุก project
        if (! $isAdmin) {
            if (empty($projectIds)) {
                return [];
            }
            $builder->whereIn('p.id', $projectIds);
        }

        if ($search !== '') {
            $builder->groupStart()
                ->like('p.code', $search)
                ->orLike('p.name', $search)
                ->groupEnd();
        }

        if ($status !== '' && in_array($status, $this->validStatuses, true)) {
            $builder->where('p.status', $status);
        }

        if ($type !== '' && in_array($type, $this->validProjectTypes, true)) {
            $builder->where('p.project_type', $type);
        }

        return $builder->get()->getResultArray();
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
     * ลบ project และ related data ในลำดับที่ถูกต้อง
     * ต้องตรวจ hasSalesTransactions() ก่อนเรียก
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
                  ->from('bottom_line_mapping_presets')
                  ->where('project_id', $projectId);
            })->delete();
        $db->table('bottom_line_mapping_presets')->where('project_id', $projectId)->delete();
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
