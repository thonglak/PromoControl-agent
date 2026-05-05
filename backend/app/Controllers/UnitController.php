<?php

namespace App\Controllers;

use App\Models\UnitModel;
use App\Models\HouseModelModel;
use App\Services\UnitSyncService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;

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
                $defaults = [];
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
                    $defaults = [];
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

    // ── GET /api/units/export?project_id= ───────────────────────────────

    public function exportExcel(): ResponseInterface
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

        // สร้าง Spreadsheet
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('ยูนิต');

        // ── Header row ──
        $headers = [
            'A1' => 'รหัสยูนิต',
            'B1' => 'เลขที่ยูนิต',
            'C1' => 'แบบบ้าน',
            'D1' => 'อาคาร',
            'E1' => 'ชั้น',
            'F1' => 'ราคาขาย',
            'G1' => 'ต้นทุน',
            'H1' => 'ราคาประเมิน',
            'I1' => 'งบมาตรฐาน',
            'J1' => 'สถานะ',
            'K1' => 'ลูกค้า',
            'L1' => 'พนักงานขาย',
        ];

        foreach ($headers as $cell => $label) {
            $sheet->setCellValue($cell, $label);
        }

        // Style header
        $headerStyle = [
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '4F46E5']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ];
        $sheet->getStyle('A1:L1')->applyFromArray($headerStyle);

        // ── Data rows ──
        $statusMap = [
            'available'   => 'ว่าง',
            'reserved'    => 'จอง',
            'sold'        => 'ขายแล้ว',
            'transferred' => 'โอนแล้ว',
        ];

        $row = 2;
        foreach ($units as $u) {
            $sheet->setCellValue("A{$row}", $u['unit_code'] ?? '');
            $sheet->setCellValue("B{$row}", $u['unit_number'] ?? '');
            $sheet->setCellValue("C{$row}", trim(($u['house_model_code'] ?? '') . ' ' . ($u['house_model_name'] ?? '')));
            $sheet->setCellValue("D{$row}", $u['building'] ?? '');
            $sheet->setCellValue("E{$row}", $u['floor'] ?? '');
            $sheet->setCellValue("F{$row}", (float) ($u['base_price'] ?? 0));
            $sheet->setCellValue("G{$row}", (float) ($u['unit_cost'] ?? 0));
            $sheet->setCellValue("H{$row}", (float) ($u['appraisal_price'] ?? 0));
            $sheet->setCellValue("I{$row}", (float) ($u['standard_budget'] ?? 0));
            $sheet->setCellValue("J{$row}", $statusMap[$u['status'] ?? ''] ?? $u['status'] ?? '');
            $sheet->setCellValue("K{$row}", $u['customer_name'] ?? '');
            $sheet->setCellValue("L{$row}", $u['salesperson'] ?? '');
            $row++;
        }

        // Format ตัวเลขเป็น #,##0
        $lastRow = max($row - 1, 1);
        $sheet->getStyle("F2:I{$lastRow}")->getNumberFormat()->setFormatCode('#,##0');

        // Auto-width คอลัมน์
        foreach (range('A', 'L') as $col) {
            $sheet->getColumnDimension($col)->setAutoSize(true);
        }

        // ── Write to output ──
        $writer = new Xlsx($spreadsheet);
        ob_start();
        $writer->save('php://output');
        $content = ob_get_clean();

        $date = date('Ymd');
        $filename = "units-export-{$date}.xlsx";

        return $this->response
            ->setStatusCode(200)
            ->setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->setHeader('Content-Disposition', "attachment; filename=\"{$filename}\"")
            ->setBody($content);
    }

    // ── Sync ต้นทุน + ราคาประเมิน จาก caldiscount ─────────────────────────

    public function syncCaldiscountPreview(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $svc = new UnitSyncService();
            return $this->response->setStatusCode(200)->setJSON($svc->previewSync($projectId));
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    public function syncCaldiscountApply(): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        $unitIds   = is_array($body['unit_ids'] ?? null) ? $body['unit_ids'] : [];

        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canWriteProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขโครงการนี้']);
        }
        if (empty($unitIds)) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาเลือกยูนิตที่จะ sync']);
        }

        try {
            $svc = new UnitSyncService();
            $r = $svc->applySync($projectId, $unitIds);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => "อัปเดต {$r['updated']} ยูนิตสำเร็จ",
                'data'    => $r,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
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

        $optionals = ['floor', 'building', 'land_area_sqw', 'unit_type_id', 'house_model_id',
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

    // ─── POST /api/units/preview-recalculate ─────────────────────────────────
    // dry-run: นับจำนวน unit ที่จะถูก update ตาม scope/rule

    public function previewRecalculate(): ResponseInterface
    {
        [$ok, $errOrInput] = $this->validateRecalcInput();
        if (!$ok) {
            return $errOrInput;
        }
        $projectId     = $errOrInput['project_id'];
        $scope         = $errOrInput['scope'];
        $costRule      = $errOrInput['cost_rule'];
        $appraisalRule = $errOrInput['appraisal_rule'];

        $count = $this->unitsForRecalc($projectId, $scope, $costRule, $appraisalRule)
            ->countAllResults();

        // ดึงตัวอย่าง 20 row แรก (sort เหมือน list หลัก) แล้วคำนวณค่าใหม่
        $samples = $this->unitsForRecalc($projectId, $scope, $costRule, $appraisalRule)
            ->select('id, unit_code, base_price, unit_cost, appraisal_price, standard_budget')
            ->orderBy('unit_code', 'ASC')
            ->limit(20)
            ->findAll();

        $samplesOut = [];
        foreach ($samples as $u) {
            $newCost      = (float) $u['unit_cost'];
            $newAppraisal = $u['appraisal_price'] !== null ? (float) $u['appraisal_price'] : null;

            if ($costRule['enabled']) {
                $newCost = $this->computeCost($costRule, $u);
            }
            if ($appraisalRule['enabled']) {
                if ($appraisalRule['mode'] === 'fixed') {
                    $newAppraisal = round($appraisalRule['amount'], 2);
                } else {
                    $sourceVal = $appraisalRule['source'] === 'unit_cost'
                        ? $newCost
                        : (float) $u['base_price'];
                    $newAppraisal = round($sourceVal * ($appraisalRule['percent'] / 100), 2);
                }
            }

            $samplesOut[] = [
                'unit_code'        => $u['unit_code'],
                'base_price'       => (float) $u['base_price'],
                'current_cost'     => (float) $u['unit_cost'],
                'new_cost'         => $costRule['enabled'] ? $newCost : null,
                'current_appraisal'=> $u['appraisal_price'] !== null ? (float) $u['appraisal_price'] : null,
                'new_appraisal'    => $appraisalRule['enabled'] ? $newAppraisal : null,
            ];
        }

        return $this->response->setStatusCode(200)->setJSON([
            'data' => [
                'count'   => $count,
                'samples' => $samplesOut,
            ],
        ]);
    }

    // ─── POST /api/units/bulk-recalculate ────────────────────────────────────
    // คำนวณ unit_cost / appraisal_price ตามสูตร แล้ว UPDATE ทุก unit ที่ตรง scope
    // ลำดับ: คำนวณ cost ก่อน แล้ว appraisal อ้างอิงค่าใหม่

    public function bulkRecalculate(): ResponseInterface
    {
        [$ok, $errOrInput] = $this->validateRecalcInput();
        if (!$ok) {
            return $errOrInput;
        }
        $projectId     = $errOrInput['project_id'];
        $scope         = $errOrInput['scope'];
        $costRule      = $errOrInput['cost_rule'];
        $appraisalRule = $errOrInput['appraisal_rule'];

        $rows = $this->unitsForRecalc($projectId, $scope, $costRule, $appraisalRule)
            ->select('id, base_price, unit_cost, appraisal_price, standard_budget')
            ->findAll();

        $now              = date('Y-m-d H:i:s');
        $updated          = 0;
        $costChanged      = 0;
        $appraisalChanged = 0;

        $db = \Config\Database::connect();
        $db->transStart();

        foreach ($rows as $u) {
            $newCost      = (float) $u['unit_cost'];
            $newAppraisal = $u['appraisal_price'] !== null ? (float) $u['appraisal_price'] : null;
            $patch        = ['updated_at' => $now];

            if ($costRule['enabled']) {
                $newCost = $this->computeCost($costRule, $u);
                if (abs($newCost - (float) $u['unit_cost']) > 0.001) {
                    $patch['unit_cost'] = $newCost;
                    $costChanged++;
                }
            }

            if ($appraisalRule['enabled']) {
                if ($appraisalRule['mode'] === 'fixed') {
                    $newAppraisal = round($appraisalRule['amount'], 2);
                } else {
                    $sourceVal = $appraisalRule['source'] === 'unit_cost'
                        ? $newCost                          // chain: ใช้ค่า cost ใหม่
                        : (float) $u['base_price'];
                    $newAppraisal = round($sourceVal * ($appraisalRule['percent'] / 100), 2);
                }
                $oldAppraisal = $u['appraisal_price'] !== null ? (float) $u['appraisal_price'] : null;
                if ($oldAppraisal === null || abs($newAppraisal - $oldAppraisal) > 0.001) {
                    $patch['appraisal_price'] = $newAppraisal;
                    $appraisalChanged++;
                }
            }

            // อัปเดตเฉพาะถ้ามี field เปลี่ยน (มากกว่าแค่ updated_at)
            if (count($patch) > 1) {
                $db->table('project_units')->where('id', $u['id'])->update($patch);
                $updated++;
            }
        }

        $db->transComplete();
        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)->setJSON(
                ['error' => 'เกิดข้อผิดพลาดระหว่างอัปเดต กรุณาลองใหม่']
            );
        }

        return $this->response->setStatusCode(200)->setJSON([
            'message' => "อัปเดตสำเร็จ {$updated} ยูนิต",
            'data'    => [
                'updated'           => $updated,
                'cost_changed'      => $costChanged,
                'appraisal_changed' => $appraisalChanged,
            ],
        ]);
    }

    /**
     * Validate input ของ preview / bulk recalculate
     * @return array{0: bool, 1: ResponseInterface|array}
     */
    private function validateRecalcInput(): array
    {
        if (!$this->canWrite()) {
            return [false, $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ดำเนินการ'])];
        }

        $body      = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);

        if ($projectId <= 0) {
            return [false, $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id'])];
        }
        if (!$this->canWriteProject($projectId)) {
            return [false, $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขโครงการนี้'])];
        }

        $scope = (string) ($body['scope'] ?? 'zero_only');
        if (!in_array($scope, ['zero_only', 'all'], true)) {
            return [false, $this->response->setStatusCode(422)->setJSON(['error' => 'scope ต้องเป็น zero_only หรือ all'])];
        }

        // cost_rule รองรับ base_minus_budget (= base_price − standard_budget); appraisal_rule ไม่รองรับ
        $costRule      = $this->parseRule($body['cost_rule']      ?? null, ['base_price'],              true);
        $appraisalRule = $this->parseRule($body['appraisal_rule'] ?? null, ['base_price', 'unit_cost'], false);

        if (is_string($costRule)) {
            return [false, $this->response->setStatusCode(422)->setJSON(['error' => 'cost_rule: ' . $costRule])];
        }
        if (is_string($appraisalRule)) {
            return [false, $this->response->setStatusCode(422)->setJSON(['error' => 'appraisal_rule: ' . $appraisalRule])];
        }

        if (!$costRule['enabled'] && !$appraisalRule['enabled']) {
            return [false, $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาเปิดอย่างน้อย 1 สูตร'])];
        }

        return [true, [
            'project_id'     => $projectId,
            'scope'          => $scope,
            'cost_rule'      => $costRule,
            'appraisal_rule' => $appraisalRule,
        ]];
    }

    /**
     * แปลง rule input — return array ถ้าผ่าน, string error message ถ้าไม่ผ่าน
     * mode: 'percent' (X% ของ source) | 'fixed' (กำหนดค่าตรง) | 'base_minus_budget' (cost-only: base_price − standard_budget)
     * fallback mode='percent' เพื่อ backward compat
     */
    private function parseRule($rule, array $allowedSources, bool $allowBaseMinusBudget = false): array|string
    {
        $rule    = (array) ($rule ?? []);
        $enabled = (bool) ($rule['enabled'] ?? false);

        if (!$enabled) {
            return ['enabled' => false, 'mode' => 'percent', 'percent' => 0, 'amount' => 0, 'source' => null];
        }

        $validModes = $allowBaseMinusBudget
            ? ['percent', 'fixed', 'base_minus_budget']
            : ['percent', 'fixed'];
        $mode = (string) ($rule['mode'] ?? 'percent');
        if (!in_array($mode, $validModes, true)) {
            return 'mode ต้องเป็น ' . implode(' หรือ ', $validModes);
        }

        if ($mode === 'base_minus_budget') {
            // ไม่ต้องการ percent/amount/source — สูตรตายตัว: base_price − standard_budget
            return ['enabled' => true, 'mode' => 'base_minus_budget', 'percent' => 0, 'amount' => 0, 'source' => null];
        }

        if ($mode === 'fixed') {
            $amount = (float) ($rule['amount'] ?? 0);
            if ($amount < 0.01 || $amount > 999999999.99) {
                return 'amount ต้องอยู่ระหว่าง 0.01–999,999,999.99';
            }
            return ['enabled' => true, 'mode' => 'fixed', 'percent' => 0, 'amount' => $amount, 'source' => null];
        }

        // mode === 'percent'
        $percent = (float) ($rule['percent'] ?? 0);
        if ($percent < 0.01 || $percent > 999.99) {
            return 'percent ต้องอยู่ระหว่าง 0.01–999.99';
        }

        $source = null;
        if (count($allowedSources) > 1) {
            $source = (string) ($rule['source'] ?? '');
            if (!in_array($source, $allowedSources, true)) {
                return 'source ต้องเป็น: ' . implode(', ', $allowedSources);
            }
        } else {
            $source = $allowedSources[0];
        }

        return ['enabled' => true, 'mode' => 'percent', 'percent' => $percent, 'amount' => 0, 'source' => $source];
    }

    /**
     * คำนวณ unit_cost ใหม่ตาม cost_rule (fixed | percent | base_minus_budget)
     * @param array $u row ของ project_units (ต้องมี base_price, standard_budget)
     */
    private function computeCost(array $costRule, array $u): float
    {
        if ($costRule['mode'] === 'fixed') {
            return round((float) $costRule['amount'], 2);
        }
        if ($costRule['mode'] === 'base_minus_budget') {
            // base_price − standard_budget; กันค่าติดลบโดย floor ที่ 0
            $diff = (float) $u['base_price'] - (float) ($u['standard_budget'] ?? 0);
            return round(max(0, $diff), 2);
        }
        // percent (default)
        return round((float) $u['base_price'] * ($costRule['percent'] / 100), 2);
    }

    /**
     * Builder สำหรับเลือก unit ที่จะ recalc ตาม scope
     */
    private function unitsForRecalc(int $projectId, string $scope, array $costRule, array $appraisalRule)
    {
        $b = $this->unitModel
            ->where('project_id', $projectId)
            ->whereIn('status', ['available', 'reserved']);

        if ($scope === 'zero_only') {
            // นับเฉพาะแถวที่อย่างน้อย 1 field (ที่ enabled) ยังเป็น 0/null
            $conds = [];
            if ($costRule['enabled'])      $conds[] = '(unit_cost IS NULL OR unit_cost = 0)';
            if ($appraisalRule['enabled']) $conds[] = '(appraisal_price IS NULL OR appraisal_price = 0)';
            if (!empty($conds)) {
                $b->where('(' . implode(' OR ', $conds) . ')', null, false);
            }
        }
        return $b;
    }
}
