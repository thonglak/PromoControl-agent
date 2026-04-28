<?php

namespace App\Models;

use CodeIgniter\Model;

class ExternalApiConfigModel extends Model
{
    protected $table      = 'external_api_configs';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = [
        'project_id', 'name', 'api_url', 'is_active', 'created_by',
    ];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    /**
     * ตรวจว่า config นี้มี snapshot อ้างอิงใน sync_from_api หรือไม่
     * ใช้ก่อนลบ config — ถ้ามี snapshot อ้างอิงจะ delete ไม่ได้
     */
    public function hasSnapshots(int $configId): bool
    {
        $db = \Config\Database::connect();
        return $db->table('sync_from_api')
            ->where('config_id', $configId)
            ->countAllResults() > 0;
    }
}
