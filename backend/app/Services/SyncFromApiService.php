<?php

namespace App\Services;

use App\Models\ExternalApiConfigModel;
use App\Models\SyncFromApiModel;
use App\Models\UserModel;
use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * SyncFromApiService — ดึงข้อมูลยูนิตจาก API ภายนอก (Narai Connect)
 *
 * กฎสำคัญ:
 * - ห้าม log narai_access_token
 * - ข้อมูลยูนิตเก็บใน dynamic table: sync_{code}
 * - code format: API + YYYYMMDDHHmmss (เช่น API20260403143022)
 * - ทุก column จาก JSON response → VARCHAR(1000)
 * - sanitize ชื่อ column: a-z, 0-9, underscore เท่านั้น
 */
class SyncFromApiService
{
    private BaseConnection       $db;
    private ExternalApiConfigModel $configModel;
    private SyncFromApiModel      $snapshotModel;
    private UserModel              $userModel;
    private array                  $fkCache = []; // cache สำหรับ fk_lookup เพื่อไม่ต้อง query ซ้ำ

    public function __construct()
    {
        $this->db            = \Config\Database::connect();
        $this->configModel   = new ExternalApiConfigModel();
        $this->snapshotModel = new SyncFromApiModel();
        $this->userModel     = new UserModel();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // fetchFromApi — ดึงข้อมูลจาก API → สร้าง dynamic table snapshot
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ดึงข้อมูลยูนิตจาก API ภายนอกแล้วเก็บเป็น snapshot
     *
     * Flow:
     * 1. ตรวจ config ว่า active
     * 2. ดึง narai_access_token จาก user
     * 3. เรียก API ด้วย cURL (Bearer token)
     * 4. Parse JSON → สร้าง dynamic table
     * 5. INSERT ข้อมูลทั้งหมด
     * 6. บันทึก snapshot record
     *
     * @throws RuntimeException ถ้าไม่มี token หรือ config ไม่ active
     */
    public function fetchFromApi(int $configId, int $userId): array
    {
        // 1. ดึง config
        $config = $this->configModel->find($configId);
        if (! $config) {
            throw new RuntimeException('ไม่พบการตั้งค่า API นี้');
        }
        if (! $config['is_active']) {
            throw new RuntimeException('การตั้งค่า API นี้ถูกปิดใช้งานอยู่');
        }

        // 2. ดึง narai_access_token จาก user
        $user = $this->userModel->find($userId);
        if (! $user || empty($user['narai_access_token'])) {
            throw new RuntimeException('กรุณาเข้าสู่ระบบผ่าน Narai Connect ก่อนใช้งาน');
        }

        $apiUrl = $config['api_url'];

        // 3. เรียก API ด้วย cURL
        [$httpCode, $responseBody, $curlError] = $this->callApi($apiUrl, $user['narai_access_token']);

        // Generate code สำหรับ snapshot นี้
        $code      = 'API' . date('YmdHis');
        $tableName = 'sync_' . $code;

        // 4. ถ้า HTTP ไม่ใช่ 200 → บันทึก failed
        if ($curlError !== '' || $httpCode !== 200) {
            $errorMessage = $curlError !== ''
                ? 'เชื่อมต่อ API ไม่สำเร็จ: ' . $curlError
                : 'API ตอบกลับ HTTP ' . $httpCode;

            $snapshotId = $this->snapshotModel->insertSnapshot([
                'code'          => $code,
                'project_id'    => $config['project_id'],
                'config_id'     => $configId,
                'api_url'       => $apiUrl,
                'total_rows'    => 0,
                'status'        => 'failed',
                'error_message' => $errorMessage,
                'fetched_by'    => $userId,
            ]);

            return [
                'status'        => 'failed',
                'code'          => $code,
                'error_message' => $errorMessage,
                'snapshot_id'   => $snapshotId,
            ];
        }

        // 5. Parse JSON response
        $json = json_decode($responseBody, true);
        if (! is_array($json)) {
            $errorMessage = 'API ตอบกลับข้อมูลในรูปแบบที่ไม่ถูกต้อง (ต้องเป็น JSON array)';

            $snapshotId = $this->snapshotModel->insertSnapshot([
                'code'          => $code,
                'project_id'    => $config['project_id'],
                'config_id'     => $configId,
                'api_url'       => $apiUrl,
                'total_rows'    => 0,
                'status'        => 'failed',
                'error_message' => $errorMessage,
                'fetched_by'    => $userId,
            ]);

            return [
                'status'        => 'failed',
                'code'          => $code,
                'error_message' => $errorMessage,
                'snapshot_id'   => $snapshotId,
            ];
        }

        // รองรับ response ที่มี data key (เช่น { "data": [...] })
        $rows = $json;
        if (isset($json['data']) && is_array($json['data'])) {
            $rows = $json['data'];
        }

        $totalRows = count($rows);

        // 6. อ่าน keys จาก row แรก เพื่อสร้าง columns
        $firstRow = $totalRows > 0 ? (array) $rows[0] : [];
        $columns  = array_keys($firstRow);

        // 7. สร้าง dynamic table
        $this->createDynamicTable($tableName, $columns);

        // 8. INSERT ทุก row (batch insert ทีละ 100 เพื่อประสิทธิภาพ)
        if ($totalRows > 0) {
            $this->insertRows($tableName, $columns, $rows);
        }

        // 9. บันทึก snapshot record
        $snapshotId = $this->snapshotModel->insertSnapshot([
            'code'       => $code,
            'project_id' => $config['project_id'],
            'config_id'  => $configId,
            'api_url'    => $apiUrl,
            'total_rows' => $totalRows,
            'status'     => 'completed',
            'fetched_by' => $userId,
        ]);

        return [
            'status'      => 'completed',
            'code'        => $code,
            'snapshot_id' => $snapshotId,
            'total_rows'  => $totalRows,
            'table_name'  => $tableName,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // getSnapshotData — ดูข้อมูล snapshot + data จาก dynamic table
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ดึง snapshot record + data จาก dynamic table พร้อม pagination
     */
    public function getSnapshotData(int $id, int $page = 1, int $perPage = 20): array
    {
        // ดึง snapshot record พร้อม fetched_by_name
        $snapshot = $this->db->table('sync_from_api sfa')
            ->select('sfa.*, u.name AS fetched_by_name')
            ->join('users u', 'u.id = sfa.fetched_by', 'left')
            ->where('sfa.id', $id)
            ->get()->getRowArray();

        if (! $snapshot) {
            throw new RuntimeException('ไม่พบ snapshot นี้');
        }

        $data        = [];
        $total       = 0;
        $tableName   = 'sync_' . $snapshot['code'];

        if ($snapshot['status'] === 'completed' && $this->db->tableExists($tableName)) {
            $page    = max(1, $page);
            $perPage = max(1, min(100, $perPage));
            $offset  = ($page - 1) * $perPage;

            $total = $this->db->table($tableName)->countAllResults(false);

            $data = $this->db->table($tableName)
                ->orderBy('row_number', 'ASC')
                ->limit($perPage, $offset)
                ->get()->getResultArray();
        }

        return [
            'snapshot'   => $snapshot,
            'data'       => $data,
            'pagination' => [
                'page'        => $page,
                'per_page'    => $perPage,
                'total'       => $total,
                'total_pages' => $perPage > 0 ? (int) ceil($total / $perPage) : 0,
            ],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // deleteSnapshot — ลบ snapshot + DROP dynamic table
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ลบ snapshot record และ dynamic table ที่เกี่ยวข้อง
     *
     * @throws RuntimeException ถ้าไม่พบ snapshot
     */
    public function deleteSnapshot(int $id): void
    {
        $snapshot = $this->snapshotModel->find($id);
        if (! $snapshot) {
            throw new RuntimeException('ไม่พบ snapshot นี้');
        }

        $tableName = 'sync_' . $snapshot['code'];

        // DROP dynamic table ก่อน (ถ้ามี)
        $this->db->query("DROP TABLE IF EXISTS `{$tableName}`");

        // ลบ record
        $this->snapshotModel->delete($id);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // getSnapshotList — รายการ snapshot ทั้งหมดของโครงการ
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * รายการ snapshot ทั้งหมดของโครงการ พร้อม fetched_by_name และ config_name
     */
    public function getSnapshotList(int $projectId, int $page = 1, int $perPage = 20): array
    {
        $page    = max(1, $page);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        $builder = $this->db->table('sync_from_api sfa')
            ->select('sfa.*, u.name AS fetched_by_name, c.name AS config_name')
            ->join('users u', 'u.id = sfa.fetched_by', 'left')
            ->join('external_api_configs c', 'c.id = sfa.config_id', 'left')
            ->where('sfa.project_id', $projectId);

        $total = (clone $builder)->countAllResults(false);

        $items = $builder
            ->orderBy('sfa.created_at', 'DESC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        return [
            'items'    => $items,
            'total'    => $total,
            'page'     => $page,
            'per_page' => $perPage,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // testApi — ทดสอบเรียก API โดยไม่สร้าง snapshot (debug)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ทดสอบเรียก API ภายนอก — return raw response โดยไม่สร้าง table/snapshot
     * รองรับ 2 โหมด: ใช้ config_id หรือระบุ url ตรงๆ
     */
    public function testApi(int $userId, ?int $configId = null, ?string $url = null): array
    {
        // ดึง narai_access_token
        $user = $this->userModel->find($userId);
        $hasToken = !empty($user['narai_access_token']);

        // หา URL ที่จะเรียก
        $apiUrl    = $url;
        $configName = null;
        if ($configId) {
            $config = $this->configModel->find($configId);
            if (!$config) {
                throw new RuntimeException('ไม่พบการตั้งค่า API นี้');
            }
            $apiUrl    = $config['api_url'];
            $configName = $config['name'];
        }

        if (empty($apiUrl)) {
            throw new RuntimeException('กรุณาระบุ URL หรือเลือก Config');
        }

        // ถ้าไม่มี token → return สถานะพร้อมข้อความ
        if (!$hasToken) {
            return [
                'token_status' => 'missing',
                'message'      => 'ไม่พบ Narai Access Token — กรุณาเข้าสู่ระบบผ่าน Narai Connect ก่อน',
                'api_url'      => $apiUrl,
                'config_name'  => $configName,
                'http_code'    => null,
                'response'     => null,
                'row_count'    => 0,
                'columns'      => [],
                'preview_rows' => [],
            ];
        }

        // เรียก API
        [$httpCode, $responseBody, $curlError] = $this->callApi($apiUrl, $user['narai_access_token']);

        $result = [
            'token_status'  => 'ok',
            'api_url'       => $apiUrl,
            'config_name'   => $configName,
            'http_code'     => $httpCode,
            'curl_error'    => $curlError ?: null,
            'response_size' => strlen($responseBody),
            'response'      => null,
            'row_count'     => 0,
            'columns'       => [],
            'preview_rows'  => [],
        ];

        if ($curlError !== '') {
            $result['message'] = 'เชื่อมต่อ API ไม่สำเร็จ: ' . $curlError;
            return $result;
        }

        if ($httpCode !== 200) {
            $result['message']  = 'API ตอบกลับ HTTP ' . $httpCode;
            $result['response'] = mb_substr($responseBody, 0, 2000);
            return $result;
        }

        // Parse JSON
        $json = json_decode($responseBody, true);
        if (!is_array($json)) {
            $result['message']  = 'Response ไม่ใช่ JSON ที่ถูกต้อง';
            $result['response'] = mb_substr($responseBody, 0, 2000);
            return $result;
        }

        // รองรับ { data: [...] }
        $rows = $json;
        if (isset($json['data']) && is_array($json['data'])) {
            $rows = $json['data'];
        }

        $result['row_count'] = count($rows);
        $result['message']   = 'เชื่อมต่อสำเร็จ — ได้ข้อมูล ' . count($rows) . ' รายการ';

        // ดึง columns จาก row แรก
        if (count($rows) > 0) {
            $firstRow = (array) $rows[0];
            $result['columns'] = array_keys($firstRow);

            // preview 5 rows แรก
            $result['preview_rows'] = array_slice($rows, 0, 5);
        }

        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // syncSnapshotToUnits — นำข้อมูล snapshot sync เข้า project_units
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Sync ข้อมูลจาก snapshot dynamic table เข้า target table ที่กำหนดใน preset
     * ใช้ mapping preset เพื่อจับคู่ field + transform ค่า
     *
     * Flow:
     * 1. ตรวจ snapshot ว่าสำเร็จ
     * 2. โหลด preset → อ่าน target_table และ upsert_key
     * 3. ตรวจว่า target_table อยู่ใน sync_target_tables ที่ active
     * 4. ดึง allowed columns จาก schema ของ target_table
     * 5. ตรวจว่ามี upsert_key ใน mapping
     * 6. อ่านข้อมูลทั้งหมดจาก dynamic table
     * 7. แต่ละ row: map + transform → upsert เข้า target_table ด้วย Query Builder
     *
     * @return array สรุป created, updated, skipped, errors
     * @throws RuntimeException
     */
    public function syncSnapshotToUnits(int $snapshotId, int $presetId, int $userId): array
    {
        // 1. ดึง snapshot
        $snapshot = $this->snapshotModel->find($snapshotId);
        if (!$snapshot) {
            throw new RuntimeException('ไม่พบ snapshot นี้');
        }
        if ($snapshot['status'] !== 'completed') {
            throw new RuntimeException('ไม่สามารถ sync snapshot ที่ไม่สำเร็จได้');
        }

        $projectId = (int) $snapshot['project_id'];
        $tableName = 'sync_' . $snapshot['code'];

        if (!$this->db->tableExists($tableName)) {
            throw new RuntimeException('ไม่พบ table ของ snapshot นี้');
        }

        // 2. โหลด preset พร้อม target_table และ upsert_key
        $presetModel = new \App\Models\ApiFieldMappingPresetModel();
        $columnModel = new \App\Models\ApiFieldMappingColumnModel();

        $preset = $presetModel->find($presetId);
        if (!$preset) {
            throw new RuntimeException('ไม่พบ mapping preset นี้');
        }
        if ((int) $preset['project_id'] !== $projectId) {
            throw new RuntimeException('Mapping preset ไม่ตรงกับโครงการของ snapshot');
        }

        $targetTable    = $preset['target_table']    ?? 'project_units';
        $upsertKey      = $preset['upsert_key']      ?? 'unit_code';
        $projectIdMode  = $preset['project_id_mode'] ?? 'from_snapshot';
        $projectIdField = $preset['project_id_field'] ?? null;

        // 3. ตรวจว่า target_table อยู่ใน sync_target_tables ที่ active
        $targetConfig = $this->db->table('sync_target_tables')
            ->where('table_name', $targetTable)
            ->where('is_active', 1)
            ->get()->getRowArray();

        if (!$targetConfig) {
            throw new RuntimeException('Target table "' . $targetTable . '" ไม่ได้เปิดใช้งาน');
        }

        if (!$this->db->tableExists($targetTable)) {
            throw new RuntimeException('ไม่พบตาราง ' . $targetTable . ' ในฐานข้อมูล');
        }

        // 4. ดึง allowed columns จาก schema ของ target_table (ไม่รวม system columns)
        $columnsRaw     = $this->db->query('SHOW COLUMNS FROM `' . $targetTable . '`')->getResultArray();
        $excludeColumns = ['id', 'created_at', 'updated_at', 'deleted_at', 'created_by', 'updated_by'];
        $allowedTargets = [];
        // ตรวจว่า target table มี project_id column หรือไม่
        $hasProjectId   = false;
        foreach ($columnsRaw as $col) {
            $f = $col['Field'];
            if ($f === 'project_id') {
                $hasProjectId = true;
                continue;
            }
            if (in_array($f, $excludeColumns, true)) {
                continue;
            }
            $allowedTargets[] = $f;
        }

        // กำหนดว่าจะใช้ project_id ใน WHERE/INSERT หรือไม่
        $useProjectId = $hasProjectId && $projectIdMode !== 'none';

        // 5. ดึง mapping columns และตรวจว่ามี upsert_key ใน mapping
        $columns = $columnModel->getByPreset($presetId);
        if (empty($columns)) {
            throw new RuntimeException('Mapping preset ไม่มี field mapping');
        }

        $hasUpsertKey = false;
        foreach ($columns as $col) {
            if ($col['target_field'] === $upsertKey) {
                $hasUpsertKey = true;
                break;
            }
        }
        if (!$hasUpsertKey) {
            throw new RuntimeException('Mapping preset ต้องมี field ที่ map กับ "' . $upsertKey . '"');
        }

        // 6. อ่านข้อมูลทั้งหมดจาก dynamic table
        $rows = $this->db->table($tableName)
            ->orderBy('row_number', 'ASC')
            ->get()->getResultArray();

        if (empty($rows)) {
            return ['created' => 0, 'updated' => 0, 'skipped' => 0, 'errors' => []];
        }

        // 7. Upsert ทีละ row ด้วย Query Builder (generic — ไม่ผูกกับ UnitModel)
        $created = 0;
        $updated = 0;
        $skipped = 0;
        $errors  = [];

        $this->fkCache = []; // รีเซ็ต cache ก่อนเริ่ม sync แต่ละครั้ง
        $this->db->transStart();

        foreach ($rows as $rowIndex => $row) {
            try {
                // กำหนด project_id สำหรับ row นี้
                $rowProjectId = null;
                if ($useProjectId) {
                    if ($projectIdMode === 'from_field' && $projectIdField) {
                        $rawPid = $row[$projectIdField] ?? null;
                        if ($rawPid === null || trim((string) $rawPid) === '') {
                            $skipped++;
                            continue;
                        }
                        // ถ้าเป็นตัวเลข → ใช้เป็น project_id ตรงๆ
                        if (is_numeric($rawPid)) {
                            $rowProjectId = (int) $rawPid;
                        } else {
                            // ถ้าเป็น string → lookup จาก projects table โดยค้นหา code
                            $cacheKey = 'project_lookup:' . $rawPid;
                            if (isset($this->fkCache[$cacheKey])) {
                                $rowProjectId = $this->fkCache[$cacheKey];
                            } else {
                                $proj = $this->db->table('projects')
                                    ->where('code', trim((string) $rawPid))
                                    ->get()->getRowArray();
                                $rowProjectId = $proj ? (int) $proj['id'] : null;
                                $this->fkCache[$cacheKey] = $rowProjectId;
                            }
                        }
                        if (!$rowProjectId) {
                            $skipped++;
                            continue;
                        }
                    } else {
                        // from_snapshot (default)
                        $rowProjectId = $projectId;
                    }
                }

                // Map fields ตาม preset + กรองเฉพาะ allowed columns
                $mapped = [];
                foreach ($columns as $col) {
                    $targetField = $col['target_field'];
                    if (!in_array($targetField, $allowedTargets, true)) {
                        continue;
                    }

                    $rawValue = $row[$col['source_field']] ?? null;
                    $mapped[$targetField] = $this->transformValue(
                        $rawValue,
                        $col['transform_type'] ?? 'none',
                        $col['transform_value'] ?? null,
                        $rowProjectId ?? $projectId  // fk_lookup ยังใช้ project_id ได้
                    );
                }

                // ต้องมีค่า upsert_key ไม่ว่าง
                $keyValue = trim((string) ($mapped[$upsertKey] ?? ''));
                if ($keyValue === '') {
                    $skipped++;
                    continue;
                }

                // หา record ที่มีอยู่แล้วด้วย upsert_key
                $query = $this->db->table($targetTable)->where($upsertKey, $keyValue);
                if ($useProjectId && $rowProjectId) {
                    $query->where('project_id', $rowProjectId);
                }
                $existing = $query->get()->getRowArray();

                if ($existing) {
                    // Update — ไม่ update upsert_key ซ้ำ
                    $updateData = $mapped;
                    unset($updateData[$upsertKey]);
                    if (!empty($updateData)) {
                        $this->db->table($targetTable)
                            ->where('id', $existing['id'])
                            ->update($updateData);
                    }
                    $updated++;
                } else {
                    // Insert — เพิ่ม project_id ถ้า target table มี column นี้และใช้งาน
                    if ($useProjectId && $rowProjectId) {
                        $mapped['project_id'] = $rowProjectId;
                    }
                    $this->db->table($targetTable)->insert($mapped);
                    $created++;
                }
            } catch (\Throwable $e) {
                $errors[] = [
                    'row'   => $rowIndex + 1,
                    'error' => $e->getMessage(),
                ];
                if (count($errors) >= 50) {
                    break; // จำกัด error ไม่เกิน 50 รายการ
                }
            }
        }

        $this->db->transComplete();

        if (!$this->db->transStatus()) {
            throw new RuntimeException('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่');
        }

        return [
            'created' => $created,
            'updated' => $updated,
            'skipped' => $skipped,
            'errors'  => $errors,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // syncHouseModelsFromSnapshot — สร้างแบบบ้านจากข้อมูล snapshot
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * สร้าง house_models จากข้อมูล snapshot + ผูก project_units.house_model_id
     *
     * Flow:
     * 1. อ่าน dynamic table ทั้งหมด
     * 2. ใช้ preset เพื่อหา unit_code source field
     * 3. ใช้ house_model_field เพื่อ group ชื่อแบบบ้าน
     * 4. สร้าง house_models ที่ยังไม่มี
     * 5. ผูก project_units.house_model_id ตาม unit_code
     *
     * @param int $snapshotId  ID ของ snapshot
     * @param int $presetId   ID ของ mapping preset (ใช้หา unit_code + house_model_code mapping)
     * @return array สรุป models_created, models_existing, units_linked
     * @throws RuntimeException
     */
    public function syncHouseModelsFromSnapshot(int $snapshotId, int $presetId): array
    {
        // 1. ดึง snapshot
        $snapshot = $this->snapshotModel->find($snapshotId);
        if (!$snapshot) {
            throw new RuntimeException('ไม่พบ snapshot นี้');
        }
        if ($snapshot['status'] !== 'completed') {
            throw new RuntimeException('ไม่สามารถใช้ snapshot ที่ไม่สำเร็จได้');
        }

        $projectId = (int) $snapshot['project_id'];
        $tableName = 'sync_' . $snapshot['code'];

        if (!$this->db->tableExists($tableName)) {
            throw new RuntimeException('ไม่พบ table ของ snapshot นี้');
        }

        // 2. ดึง preset columns เพื่อหา unit_code source field
        $columnModel = new \App\Models\ApiFieldMappingColumnModel();
        $presetModel = new \App\Models\ApiFieldMappingPresetModel();

        $preset = $presetModel->find($presetId);
        if (!$preset) {
            throw new RuntimeException('ไม่พบ mapping preset นี้');
        }
        if ((int) $preset['project_id'] !== $projectId) {
            throw new RuntimeException('Mapping preset ไม่ตรงกับโครงการของ snapshot');
        }

        $columns = $columnModel->getByPreset($presetId);
        $unitCodeSourceField    = null;
        $houseModelField        = null;
        $areaSqmSourceField     = null;
        foreach ($columns as $col) {
            if ($col['target_field'] === 'unit_code') {
                $unitCodeSourceField = $col['source_field'];
            }
            if ($col['target_field'] === 'house_model_code') {
                $houseModelField = $col['source_field'];
            }
            if ($col['target_field'] === 'area_sqm') {
                $areaSqmSourceField = $col['source_field'];
            }
        }
        if (!$unitCodeSourceField) {
            throw new RuntimeException('Mapping preset ไม่มี field ที่ map กับ "รหัสยูนิต" (unit_code)');
        }
        if (!$houseModelField) {
            throw new RuntimeException('Mapping preset ไม่มี field ที่ map กับ "แบบบ้าน" (house_model_code)');
        }

        // 4. อ่านข้อมูลทั้งหมด
        $selectFields = "{$unitCodeSourceField}, {$houseModelField}";
        if ($areaSqmSourceField) {
            $selectFields .= ", {$areaSqmSourceField}";
        }
        $rows = $this->db->table($tableName)
            ->select($selectFields)
            ->orderBy('row_number', 'ASC')
            ->get()->getResultArray();

        if (empty($rows)) {
            return ['models_created' => 0, 'models_existing' => 0, 'units_linked' => 0];
        }

        // 5. Group ชื่อแบบบ้าน → สร้าง house_models
        $houseModelModel = new \App\Models\HouseModelModel();
        $unitModel       = new \App\Models\UnitModel();

        // เก็บ map: ชื่อแบบบ้าน → house_model_id
        $modelMap       = [];
        $modelsCreated  = 0;
        $modelsExisting = 0;

        $this->db->transStart();

        // ดึง unique model names + area_sqm จาก row แรกของแต่ละ group
        $uniqueModels = []; // name → ['area_sqm' => float|null]
        foreach ($rows as $row) {
            $name = trim((string) ($row[$houseModelField] ?? ''));
            if ($name !== '' && !isset($uniqueModels[$name])) {
                $areaSqm = null;
                if ($areaSqmSourceField) {
                    $raw = preg_replace('/[^0-9.\-]/', '', (string) ($row[$areaSqmSourceField] ?? ''));
                    $areaSqm = $raw !== '' ? (float) $raw : null;
                }
                $uniqueModels[$name] = ['area_sqm' => $areaSqm];
            }
        }

        foreach ($uniqueModels as $modelName => $modelData) {
            // สร้าง code จากชื่อ: ตัดช่องว่าง, uppercase, จำกัด 50 ตัว
            $code = mb_substr(
                preg_replace('/[^a-zA-Z0-9\-_]/', '-', $modelName),
                0,
                50
            );
            // ถ้า code ว่าง fallback
            if (trim($code, '-') === '') {
                $code = 'MODEL-' . md5($modelName);
                $code = mb_substr($code, 0, 50);
            }

            // หาว่ามีอยู่แล้วหรือไม่ (match ด้วย code หรือ name)
            $existing = $houseModelModel
                ->where('project_id', $projectId)
                ->groupStart()
                    ->where('code', $code)
                    ->orWhere('name', $modelName)
                ->groupEnd()
                ->first();

            if ($existing) {
                $modelMap[$modelName] = (int) $existing['id'];
                // อัปเดต area_sqm ถ้ายังเป็น 0 หรือ null
                if ($modelData['area_sqm'] !== null && (float) ($existing['area_sqm'] ?? 0) == 0) {
                    $houseModelModel->update($existing['id'], ['area_sqm' => $modelData['area_sqm']]);
                }
                $modelsExisting++;
            } else {
                $insertData = [
                    'project_id' => $projectId,
                    'code'       => $code,
                    'name'       => $modelName,
                ];
                if ($modelData['area_sqm'] !== null) {
                    $insertData['area_sqm'] = $modelData['area_sqm'];
                }
                $newId = $houseModelModel->insert($insertData);
                $modelMap[$modelName] = (int) $newId;
                $modelsCreated++;
            }
        }

        // 6. ผูก project_units.house_model_id
        $unitsLinked = 0;
        foreach ($rows as $row) {
            $unitCode  = trim((string) ($row[$unitCodeSourceField] ?? ''));
            $modelName = trim((string) ($row[$houseModelField] ?? ''));

            if ($unitCode === '' || $modelName === '' || !isset($modelMap[$modelName])) {
                continue;
            }

            $unit = $unitModel
                ->where('project_id', $projectId)
                ->where('unit_code', $unitCode)
                ->first();

            if ($unit) {
                $unitModel->update($unit['id'], [
                    'house_model_id' => $modelMap[$modelName],
                ]);
                $unitsLinked++;
            }
        }

        $this->db->transComplete();

        if (!$this->db->transStatus()) {
            throw new RuntimeException('บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่');
        }

        return [
            'models_created'  => $modelsCreated,
            'models_existing' => $modelsExisting,
            'units_linked'    => $unitsLinked,
        ];
    }

    /**
     * แปลงค่าตาม transform_type
     */
    private function transformValue(?string $rawValue, string $type, ?string $transformValue, ?int $projectId = null): mixed
    {
        if ($rawValue === null || $rawValue === '') {
            return null;
        }

        switch ($type) {
            case 'number':
                // ลบ comma และช่องว่าง → แปลงเป็นตัวเลข
                $cleaned = preg_replace('/[^0-9.\-]/', '', $rawValue);
                return $cleaned !== '' ? (float) $cleaned : null;

            case 'date':
                // พยายาม parse วันที่
                $ts = strtotime($rawValue);
                return $ts !== false ? date('Y-m-d', $ts) : null;

            case 'status_map':
                // ใช้ JSON map แปลงค่า เช่น {"5":"sold","3":"available"}
                if ($transformValue) {
                    $map = json_decode($transformValue, true);
                    if (is_array($map) && isset($map[$rawValue])) {
                        return $map[$rawValue];
                    }
                }
                return $rawValue;

            case 'fk_lookup':
                // ค้นหา FK จากตารางอ้างอิง ถ้าไม่เจอสามารถสร้างใหม่ได้
                if (!$transformValue) {
                    return null;
                }
                $config = json_decode($transformValue, true);
                if (!is_array($config) || empty($config['lookup_table']) || empty($config['lookup_field'])) {
                    return null;
                }

                $lookupTable    = $config['lookup_table'];
                $lookupField    = $config['lookup_field'];
                $scopeByProject = !empty($config['scope_by_project']);
                $createIfMissing = !empty($config['create_if_missing']);
                $createFields   = $config['create_fields'] ?? [];

                // ตรวจ cache ก่อน query
                $cacheKey = $lookupTable . ':' . $lookupField . ':' . $rawValue . ($scopeByProject ? ':p' . $projectId : '');
                if (isset($this->fkCache[$cacheKey])) {
                    return $this->fkCache[$cacheKey];
                }

                // ค้นหา record ที่มีอยู่แล้ว
                $query = $this->db->table($lookupTable)->where($lookupField, $rawValue);
                if ($scopeByProject && $projectId) {
                    $query->where('project_id', $projectId);
                }
                $existing = $query->get()->getRowArray();

                if ($existing) {
                    $resultId = (int) $existing['id'];
                    $this->fkCache[$cacheKey] = $resultId;
                    return $resultId;
                }

                // ไม่เจอ — สร้างใหม่ถ้ากำหนดไว้
                if (!$createIfMissing) {
                    $this->fkCache[$cacheKey] = null;
                    return null;
                }

                // เตรียมข้อมูลสำหรับ insert
                $insertData = [];
                foreach ($createFields as $field => $template) {
                    // แทน {value} ด้วยค่าจาก source
                    $insertData[$field] = str_replace('{value}', $rawValue, $template);
                }
                if ($scopeByProject && $projectId) {
                    $insertData['project_id'] = $projectId;
                }

                $this->db->table($lookupTable)->insert($insertData);
                $resultId = (int) $this->db->insertID();
                $this->fkCache[$cacheKey] = $resultId;
                return $resultId;

            default: // 'none'
                return $rawValue;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * เรียก API ด้วย cURL: GET {url} + Authorization: Bearer {token}
     * ห้าม log token
     *
     * @return array [httpCode, responseBody, curlError]
     */
    private function callApi(string $url, string $accessToken): array
    {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Authorization: Bearer ' . $accessToken,
                'Accept: application/json',
            ],
            CURLOPT_TIMEOUT        => 30,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $responseBody = curl_exec($ch);
        $httpCode     = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError    = curl_error($ch);
        curl_close($ch);

        return [$httpCode, (string) $responseBody, $curlError];
    }

    /**
     * สร้าง dynamic table สำหรับเก็บข้อมูลยูนิตจาก API
     * - id: BIGINT UNSIGNED PK AUTO_INCREMENT
     * - row_number: INT (ลำดับ row ใน response)
     * - ทุก column จาก JSON → VARCHAR(1000)
     * - sanitize ชื่อ column: เหลือเฉพาะ a-z, 0-9, underscore
     */
    private function createDynamicTable(string $tableName, array $columns): void
    {
        $columnDefs = [
            '`id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
            '`row_number` INT NOT NULL DEFAULT 0',
        ];

        foreach ($columns as $col) {
            $safeCol = $this->sanitizeColumnName($col);
            if ($safeCol === '' || $safeCol === 'id' || $safeCol === 'row_number') {
                continue;
            }
            $columnDefs[] = "`{$safeCol}` TEXT NULL";
        }

        $columnsSql = implode(",\n    ", $columnDefs);

        $this->db->query("
            CREATE TABLE `{$tableName}` (
                {$columnsSql}
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");
    }

    /**
     * INSERT ทุก row เข้า dynamic table (batch ทีละ 100 rows)
     */
    private function insertRows(string $tableName, array $columns, array $rows): void
    {
        // สร้าง safe column map: original key → sanitized column name
        $colMap = [];
        foreach ($columns as $col) {
            $safe = $this->sanitizeColumnName($col);
            if ($safe !== '' && $safe !== 'id' && $safe !== 'row_number') {
                $colMap[$col] = $safe;
            }
        }

        $batch    = [];
        $rowIndex = 0;

        foreach ($rows as $row) {
            $rowIndex++;
            $record = ['row_number' => $rowIndex];

            foreach ($colMap as $originalKey => $safeKey) {
                $value = $row[$originalKey] ?? null;
                // แปลงทุก value เป็น string
                if ($value !== null) {
                    $value = (string) $value;
                }
                $record[$safeKey] = $value;
            }

            $batch[] = $record;

            // flush ทุก 100 rows
            if (count($batch) >= 100) {
                $this->db->table($tableName)->insertBatch($batch);
                $batch = [];
            }
        }

        // flush ที่เหลือ
        if (! empty($batch)) {
            $this->db->table($tableName)->insertBatch($batch);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // updateSnapshot — แก้ไข field ของ snapshot record
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * อัปเดต field ที่อนุญาตของ snapshot (รองรับ name สำหรับแสดงผล — code ใช้เป็นชื่อ dynamic table จึงห้ามแก้)
     *
     * @param array<string, mixed> $data field ที่ต้องการแก้ไข
     * @return array<string, mixed> snapshot row ที่อัปเดตแล้ว
     * @throws RuntimeException ถ้าไม่พบ snapshot
     */
    public function updateSnapshot(int $id, array $data): array
    {
        $snapshot = $this->snapshotModel->find($id);
        if (! $snapshot) {
            throw new RuntimeException('ไม่พบ Snapshot นี้');
        }

        // อนุญาตเฉพาะ name — ห้ามแก้ code เพราะ code เป็นชื่อ dynamic table
        $allowed = ['name'];
        $update  = array_intersect_key($data, array_flip($allowed));

        if (empty($update)) {
            throw new RuntimeException('ไม่มี field ที่แก้ไขได้');
        }

        $this->snapshotModel->update($id, $update);

        return [
            'id'   => $id,
            'name' => $update['name'] ?? $snapshot['name'],
            'code' => $snapshot['code'],
        ];
    }

    /**
     * Sanitize ชื่อ column: เหลือเฉพาะ a-z, 0-9, underscore
     * ตัวพิมพ์ใหญ่แปลงเป็นพิมพ์เล็ก, ตัวอักษรอื่นทิ้ง
     */
    private function sanitizeColumnName(string $name): string
    {
        $name = strtolower($name);
        $name = preg_replace('/[^a-z0-9_]/', '', $name);
        $name = trim($name, '_');
        return $name;
    }
}
