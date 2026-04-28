<?php

namespace App\Models;

use CodeIgniter\Model;

class ApiFieldMappingPresetModel extends Model
{
    protected $table      = 'api_field_mapping_presets';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = [
        'project_id', 'name', 'target_table', 'upsert_key',
        'project_id_mode', 'project_id_field',  // NEW
        'is_default', 'created_by',
    ];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    /**
     * ยกเลิก default เดิมของโครงการ ก่อนตั้ง preset ใหม่เป็น default
     */
    public function clearDefault(int $projectId, ?int $excludeId = null): void
    {
        $builder = $this->where('project_id', $projectId)->where('is_default', 1);
        if ($excludeId !== null) {
            $builder = $builder->where('id !=', $excludeId);
        }
        $builder->set('is_default', 0)->update();
    }
}
