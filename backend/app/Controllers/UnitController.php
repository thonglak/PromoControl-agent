<?php

namespace App\Controllers;

use App\Models\UnitModel;
use App\Models\HouseModelModel;
use CodeIgniter\HTTP\ResponseInterface;

class UnitController extends BaseController
{
    private UnitModel      $unitModel;
    private HouseModelModel $houseModel;

    public function __construct()
    {
        $this->unitModel  = new UnitModel();
        $this->houseModel = new HouseModelModel();
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canWrite(): bool
    {
        $role = $this->request->user_role ?? '';
        return in_array($role, ['admin', 'manager'], true);
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) return true;
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    private function canWriteProject(int $projectId): bool
    {
        if (!$this->canWrite()) return false;
        if ($this->isAdmin()) return true;
        $access = (array) ($this->request->project_access ?? []);
        return ($access[$projectId] ?? '') === 'edit';
    }

    private function notFound(): ResponseInterface
    {
        return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบยูนิต']);
    }

    // ── GET /api/units?project_id= ────────────────────────────────────────

    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $filters = [
            'house_model_id' => $this->request->getGet('house_model_id'),
            'status'         => $this->request->getGet('status'),
            'search'         => $this->request->getGet('search'),
        ];

        $units = $this->unitModel->getListWithModel($projectId, $filters);

        // Compute unit_type_label
        $typeMap = ["condo" => "คอนโด", "house" => "บ้านเดี่ยว", "townhouse" => "ทาวน์โฮม"];
        foreach ($units as &$u) {
            $u["unit_type_label"] = $u["unit_type_name"] ?? ($typeMap[$u["project_type"] ?? ""] ?? null);
        }
        return $this->response->setStatusCode(200)->setJSON(['data' => $units]);
    }

    // ── GET /api/units/:id ────────────────────────────────────────────────

    public function show(int $id): ResponseInterface
    {
        $unit = $this->unitModel->find($id);
        if (!$unit) return $this->notFound();

        if (!$this->canAccessProject((int) $unit['project_id'])) return $this->notFound();

        $unit['budget_summary'] = $this->unitModel->getBudgetSummary($id);
        return $this->response->setStatusCode(200)->setJSON(['data' => $unit]);
    }

    // ── POST /api/units ───────────────────────────────────────────────────

    public function create(): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => ['project_id' => 'กรุณาระบุโครงการ']]);
        }
        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์สร้างยูนิตในโครงการนี้']);
        }

        // Auto-fill defaults จาก house_model ถ้ามี
        $houseModelId = !empty($body['house_model_id']) ? (int) $body['house_model_id'] : null;
        $defaults     = [];
        if ($houseModelId) {
            $hm = $this->houseModel->find($houseModelId);
            if ($hm) {
                $defaults = [
                    
                    
                    
                    'area_sqm'        => (float) $hm['area_sqm'],
                ];
            }
        }

        $errors = $this->validateUnit($body, null, $projectId);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $data = $this->extractData($body, $defaults);
        $data['project_id']    = $projectId;
        $data['house_model_id'] = $houseModelId;

        $newId = $this->unitModel->insert($data, true);
        if (!$newId) {
            return $this->response->setStatusCode(500)->setJSON(['error' => 'บันทึกข้อมูลไม่สำเร็จ']);
        }

        return $this->response->setStatusCode(201)->setJSON([
            'message' => 'สร้างยูนิตสำเร็จ',
            'data'    => $this->unitModel->find($newId),
        ]);
    }

    // ── PUT /api/units/:id ────────────────────────────────────────────────

    public function update(int $id): ResponseInterface
    {
        $unit = $this->unitModel->find($id);
        if (!$unit) return $this->notFound();

        $projectId = (int) $unit['project_id'];
        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขยูนิตนี้']);
        }

        // ห้ามแก้ sold/transferred ยกเว้น admin
        if (!$this->isAdmin() && in_array($unit['status'], ['sold', 'transferred'], true)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ไม่สามารถแก้ไขยูนิตที่ขายแล้วได้']);
        }

        $body   = $this->request->getJSON(true) ?? [];
        $errors = $this->validateUnit($body, $id, $projectId);
        if ($errors) {
            return $this->response->setStatusCode(400)->setJSON(['errors' => $errors]);
        }

        $data = $this->extractData($body, []);
        unset($data['project_id']);

        $this->unitModel->update($id, $data);
        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'แก้ไขยูนิตสำเร็จ',
            'data'    => $this->unitModel->find($id),
        ]);
    }

    // ── DELETE /api/units/:id ─────────────────────────────────────────────

    public function delete(int $id): ResponseInterface
    {
        $unit = $this->unitModel->find($id);
        if (!$unit) return $this->notFound();

        $projectId = (int) $unit['project_id'];
        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ลบยูนิตนี้']);
        }

        if (in_array($unit['status'], ['sold', 'transferred'], true)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ไม่สามารถลบยูนิตที่ขายแล้วได้']);
        }

        if ($this->unitModel->hasSalesTransactions($id)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ไม่สามารถลบยูนิตที่มีรายการขายได้']);
        }

        $this->unitModel->delete($id);
        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบยูนิตสำเร็จ']);
    }

    // ── POST /api/units/bulk ──────────────────────────────────────────────

    public function bulkCreate(): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        $units     = (array) ($body['units'] ?? []);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์สร้างยูนิตในโครงการนี้']);
        }
        if (empty($units)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ไม่มีข้อมูลยูนิต']);
        }

        $db = \Config\Database::connect();
        $db->transStart();

        $created = 0;
        $errors  = [];

        foreach ($units as $i => $row) {
            $row['project_id'] = $projectId;
            $rowErrors = $this->validateUnit($row, null, $projectId);
            if ($rowErrors) {
                $errors[] = ['row' => $i + 1, 'unit_code' => $row['unit_code'] ?? '', 'errors' => $rowErrors];
                continue;
            }

            $houseModelId = !empty($row['house_model_id']) ? (int) $row['house_model_id'] : null;
            $defaults     = [];
            if ($houseModelId) {
                $hm = $this->houseModel->find($houseModelId);
                if ($hm) {
                    $defaults = [
                        'area_sqm' => (float) $hm['area_sqm'],
                        
                        
                        
                    ];
                }
            }

            $data = $this->extractData($row, $defaults);
            $data['project_id']    = $projectId;
            $data['house_model_id'] = $houseModelId;

            $this->unitModel->insert($data);
            $created++;
        }

        $db->transComplete();

        return $this->response->setStatusCode(201)->setJSON([
            'message' => "สร้างยูนิตสำเร็จ {$created} รายการ",
            'data'    => ['total' => count($units), 'created' => $created, 'errors' => $errors],
        ]);
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private function validateUnit(array $body, ?int $excludeId, int $projectId): array
    {
        $errors   = [];
        $unitCode = trim((string) ($body['unit_code'] ?? ''));

        if ($unitCode === '') {
            $errors['unit_code'] = 'กรุณากรอกรหัสยูนิต';
        } elseif ($this->unitModel->isCodeDuplicate($unitCode, $projectId, $excludeId)) {
            $errors['unit_code'] = 'รหัสยูนิตนี้มีอยู่แล้วในโครงการ';
        }

        if (trim((string) ($body['unit_number'] ?? '')) === '') {
            $errors['unit_number'] = 'กรุณากรอกเลขที่ยูนิต';
        }

        if (!isset($body['base_price']) || (float) $body['base_price'] <= 0) {
            $errors['base_price'] = 'กรุณากรอกราคาขาย';
        }

        if (!isset($body['unit_cost']) || (float) $body['unit_cost'] <= 0) {
            $errors['unit_cost'] = 'กรุณากรอกต้นทุน';
        }

        return $errors;
    }

    private function extractData(array $body, array $defaults): array
    {
        $get = fn($key, $default = null) => $body[$key] ?? $defaults[$key] ?? $default;

        $data = [
            'unit_code'       => trim((string) ($body['unit_code'] ?? '')),
            'unit_number'     => trim((string) ($body['unit_number'] ?? '')),
            'base_price'      => (float) ($get('base_price') ?? 0),
            'unit_cost'       => (float) ($get('unit_cost') ?? 0),
            'standard_budget' => (float) ($get('standard_budget') ?? 0),
        ];

        $optionals = ['floor', 'building', 'area_sqm', 'unit_type_id', 'house_model_id',
                      'appraisal_price', 'customer_name', 'salesperson',
                      'sale_date', 'transfer_date', 'remark', 'status'];

        // ฟิลด์ที่อนุญาตให้เป็น null (FK ที่ไม่บังคับ)
        $nullableFields = ['house_model_id'];

        foreach ($optionals as $field) {
            if (array_key_exists($field, $body)) {
                if (in_array($field, $nullableFields, true)) {
                    // nullable FK: รับค่า null ได้
                    $data[$field] = $body[$field];
                } elseif ($body[$field] !== null && $body[$field] !== '') {
                    $data[$field] = $body[$field];
                }
            } elseif (isset($defaults[$field])) {
                $data[$field] = $defaults[$field];
            }
        }

        return $data;
    }
}
