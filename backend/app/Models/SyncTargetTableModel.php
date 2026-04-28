<?php

namespace App\Models;

use CodeIgniter\Model;

class SyncTargetTableModel extends Model
{
    protected $table      = 'sync_target_tables';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $allowedFields = ['table_name', 'label', 'default_upsert_key', 'is_active'];
    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';
}
