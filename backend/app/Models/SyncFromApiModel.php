<?php

namespace App\Models;

use CodeIgniter\Model;

class SyncFromApiModel extends Model
{
    protected $table      = 'sync_from_api';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = [
        'code', 'name', 'project_id', 'config_id', 'api_url',
        'total_rows', 'status', 'error_message', 'fetched_by',
    ];

    // มีแค่ created_at — ไม่มี updated_at
    protected $useTimestamps = false;
    protected $createdField  = 'created_at';
    protected $updatedField  = '';

    /**
     * บันทึก created_at เมื่อ insert เอง เพราะ useTimestamps = false
     */
    public function insertSnapshot(array $data): int|string
    {
        $data['created_at'] = date('Y-m-d H:i:s');
        $this->insert($data);
        return $this->db->insertID();
    }
}
