<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Services\ImportConfigService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * ImportConfigController — CRUD + preview สำหรับ Import Configs
 *
 * Table: import_configs, import_config_columns
 * สิทธิ์: admin + manager เท่านั้น
 * config_name ต้อง unique ต่อ project
 */
class ImportConfigController extends BaseController
{
    private ImportConfigService $service;

    public function __construct()
    {
        $this->service = new ImportConfigService();
    }

    // ── Auth helpers ──────────────────────────────────────────────────────

    private function canManage(): bool
    {
        return in_array($this->request->user_role ?? '', ['admin', 'manager'], true);
    }

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/import-configs?project_id=&import_type=
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $importType = $this->request->getGet('import_type') ?: null;
        $data       = $this->service->list($projectId, $importType);

        return $this->response->setStatusCode(200)->setJSON(['data' => $data]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/import-configs/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $record = $this->service->getById($id);
        if (!$record) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Import Config นี้']);
        }

        if (!$this->canAccessProject((int) $record['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $record]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/import-configs
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $errors = $this->validatePayload($body);
        if ($errors) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        try {
            $body['created_by'] = $this->userId();
            $newId  = $this->service->create($body);
            $record = $this->service->getById($newId);

            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'สร้าง Import Config สำเร็จ',
                'data'    => $record,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/import-configs/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $existing = $this->service->getById($id);
        if (!$existing) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Import Config นี้']);
        }
        if (!$this->canAccessProject((int) $existing['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body   = $this->request->getJSON(true) ?? [];
        $errors = $this->validatePayload($body);
        if ($errors) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        try {
            $this->service->update($id, $body);
            $record = $this->service->getById($id);

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'แก้ไข Import Config สำเร็จ',
                'data'    => $record,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/import-configs/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $existing = $this->service->getById($id);
        if (!$existing) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Import Config นี้']);
        }
        if (!$this->canAccessProject((int) $existing['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $this->service->delete($id);

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'ลบ Import Config สำเร็จ',
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/import-configs/:id/set-default
    // ═══════════════════════════════════════════════════════════════════════

    public function setDefault(int $id): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $existing = $this->service->getById($id);
        if (!$existing) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบ Import Config นี้']);
        }
        if (!$this->canAccessProject((int) $existing['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $this->service->setDefault($id);
            $record = $this->service->getById($id);

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'ตั้งค่า Default สำเร็จ',
                'data'    => $record,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/import-configs/preview  (multipart/form-data)
    // ═══════════════════════════════════════════════════════════════════════

    public function preview(): ResponseInterface
    {
        if (!$this->canManage()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์จัดการ Import Config']);
        }

        $projectId = (int) ($this->request->getPost('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $uploadedFile = $this->request->getFile('file');
        if (!$uploadedFile || !$uploadedFile->isValid()) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาอัปโหลดไฟล์ Excel']);
        }

        // ตรวจ extension
        $ext = strtolower($uploadedFile->getClientExtension());
        if (!in_array($ext, ['xlsx', 'xls', 'csv'], true)) {
            return $this->response->setStatusCode(422)
                ->setJSON(['error' => 'รองรับเฉพาะไฟล์ .xlsx, .xls, .csv เท่านั้น']);
        }

        $configId = $this->request->getPost('config_id');
        $configId = $configId !== null && $configId !== '' ? (int) $configId : null;

        // สร้าง file array สำหรับส่งให้ service
        $fileData = [
            'tmp_name' => $uploadedFile->getTempName(),
            'name'     => $uploadedFile->getClientName(),
        ];

        try {
            $result = $this->service->preview($fileData, $configId, $projectId);
            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private function validatePayload(array $body): array
    {
        $errors = [];

        if (empty(trim((string) ($body['config_name'] ?? '')))) {
            $errors['config_name'] = 'กรุณากรอกชื่อ Config';
        }

        $validTypes = ['bottom_line', 'unit', 'promotion', 'custom'];
        if (empty($body['import_type']) || !in_array($body['import_type'], $validTypes, true)) {
            $errors['import_type'] = 'import_type ต้องเป็น: ' . implode(', ', $validTypes);
        }

        // ตรวจ file_type ถ้าส่งมา
        if (isset($body['file_type'])) {
            $validFileTypes = ['xlsx', 'xls', 'csv'];
            if (!in_array($body['file_type'], $validFileTypes, true)) {
                $errors['file_type'] = 'file_type ต้องเป็น: ' . implode(', ', $validFileTypes);
            }
        }

        // ตรวจ header_row ถ้าส่งมา
        if (isset($body['header_row'])) {
            $headerRow = (int) $body['header_row'];
            if ($headerRow < 1) {
                $errors['header_row'] = 'header_row ต้องเป็นจำนวนเต็มบวก ≥ 1';
            }
        }

        // ตรวจ data_start_row ถ้าส่งมา
        if (isset($body['data_start_row'])) {
            $dataStartRow = (int) $body['data_start_row'];
            $headerRow    = isset($body['header_row']) ? (int) $body['header_row'] : 1;
            if ($dataStartRow < 1) {
                $errors['data_start_row'] = 'data_start_row ต้องเป็นจำนวนเต็มบวก ≥ 1';
            } elseif ($dataStartRow <= $headerRow) {
                $errors['data_start_row'] = 'data_start_row ต้องมากกว่า header_row';
            }
        }

        // ตรวจ columns ถ้าส่งมา
        if (isset($body['columns'])) {
            if (!is_array($body['columns'])) {
                $errors['columns'] = 'columns ต้องเป็น array';
            } else {
                $validDataTypes = ['string', 'number', 'date', 'decimal'];
                foreach ($body['columns'] as $i => $col) {
                    if (empty($col['source_column'])) {
                        $errors["columns.{$i}.source_column"] = 'กรุณาระบุ source_column';
                    } elseif (!preg_match('/^[A-Z]{1,3}$/', strtoupper((string) $col['source_column']))) {
                        $errors["columns.{$i}.source_column"] = 'source_column ต้องเป็นตัวอักษร A-Z 1-3 ตัว (เช่น A, AB, AAA)';
                    }
                    if (empty($col['target_field'])) {
                        $errors["columns.{$i}.target_field"] = 'กรุณาระบุ target_field';
                    }
                    if (isset($col['data_type']) && !in_array($col['data_type'], $validDataTypes, true)) {
                        $errors["columns.{$i}.data_type"] = 'data_type ต้องเป็น: ' . implode(', ', $validDataTypes);
                    }
                }
            }
        }

        return $errors;
    }
}
