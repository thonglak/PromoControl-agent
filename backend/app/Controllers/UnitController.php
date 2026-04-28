<?php

namespace App\Controllers;

use App\Models\UnitModel;
use App\Models\HouseModelModel;
use CodeIgniter\HTTP\ResponseInterface;
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
}
