<?php

namespace App\Controllers;

use App\Services\BottomLineService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * BottomLineController — HTTP layer สำหรับ Import ราคาต้นทุน
 *
 * Business logic ทั้งหมดอยู่ใน BottomLineService
 * Controller จัดการเฉพาะ: HTTP request/response, validation, auth
 */
class BottomLineController extends BaseController
{
    private BottomLineService $service;

    public function __construct()
    {
        $this->service = new BottomLineService();
    }

    // ── Auth / Permission helpers ─────────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function canImport(): bool
    {
        return in_array($this->request->user_role ?? '', ['admin', 'manager'], true);
    }

    private function canView(): bool
    {
        return in_array($this->request->user_role ?? '', ['admin', 'manager', 'finance', 'viewer'], true);
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
    // POST /api/bottom-lines/upload
    // ═══════════════════════════════════════════════════════════════════════

    public function upload(): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์ import ราคาต้นทุน']);
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

        $file = $this->request->getFile('file');
        if (!$file || !$file->isValid()) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาเลือกไฟล์ Excel']);
        }

        $ext = strtolower($file->getClientExtension());
        if (!in_array($ext, ['xlsx', 'xls'], true)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไฟล์ต้องเป็นรูปแบบ Excel (.xlsx, .xls)']);
        }
        if ($file->getSize() > 52428800) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไฟล์มีขนาดเกิน 50MB']);
        }

        $originalName = $file->getClientName();
        $newName      = uniqid('bl_') . '.' . $ext;
        $uploadPath   = WRITEPATH . 'uploads/bottom_lines';

        if (!$file->move($uploadPath, $newName)) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'ไม่สามารถบันทึกไฟล์ได้ กรุณาลองใหม่']);
        }

        $filePath = $uploadPath . '/' . $newName;

        try {
            $mappingId = $this->request->getPost('mapping_id')
                ? (int) $this->request->getPost('mapping_id')
                : null;

            $result = $this->service->parseUploadedFile($filePath, $originalName, $projectId, $mappingId);
            $result['temp_file'] = $newName;

            return $this->response->setStatusCode(200)->setJSON($result);

        } catch (\Throwable $e) {
            @unlink($filePath);
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไม่สามารถอ่านไฟล์ Excel ได้: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/bottom-lines/import
    // ═══════════════════════════════════════════════════════════════════════


    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/bottom-lines/preview
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Re-parse Excel ตาม mapping config ที่เปลี่ยน (Step 2)
     * ไม่ต้อง upload ใหม่ ใช้ temp_file เดิม
     */
    public function preview(): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(["error" => "คุณไม่มีสิทธิ์"]);
        }

        $body     = $this->request->getJSON(true) ?? [];
        $tempFile = $body["temp_file"] ?? "";
        $mapping  = $body["mapping"] ?? [];

        if (!$tempFile) {
            return $this->response->setStatusCode(400)
                ->setJSON(["error" => "กรุณา upload ไฟล์ก่อน"]);
        }

        $filePath = WRITEPATH . "uploads/bottom_lines/" . basename($tempFile);
        if (!file_exists($filePath)) {
            return $this->response->setStatusCode(400)
                ->setJSON(["error" => "ไฟล์หมดอายุ กรุณา upload ใหม่"]);
        }

        if (empty($mapping["unit_code_column"])) {
            return $this->response->setStatusCode(400)
                ->setJSON(["error" => "กรุณาระบุ column สำหรับเลขที่ยูนิต"]);
        }

        try {
            $result = $this->service->previewMapping($filePath, $mapping);
            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(["error" => "ไม่สามารถอ่านไฟล์ได้: " . $e->getMessage()]);
        }
    }
    public function import(): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์ import ราคาต้นทุน']);
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

        $tempFile = $body['temp_file'] ?? '';
        if (!$tempFile) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณา upload ไฟล์ก่อน']);
        }

        $filePath = WRITEPATH . 'uploads/bottom_lines/' . basename($tempFile);
        if (!file_exists($filePath)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไฟล์หมดอายุ กรุณา upload ใหม่']);
        }

        $mapping = $body['mapping'] ?? [];
        if (empty($mapping['unit_code_column'])) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'กรุณาระบุ column สำหรับเลขที่ยูนิต']);
        }

        $fileName      = $body['file_name'] ?? basename($tempFile);
        $saveMappingAs = $body['save_mapping_as'] ?? null;
        $setAsDefault  = !empty($body['set_as_default']);
        $note          = $body['note'] ?? null;

        try {
            $result = $this->service->executeImport(
                $filePath, $fileName, $projectId, $mapping,
                $this->userId(), $saveMappingAs, $setAsDefault, $note
            );

            @unlink($filePath);

            return $this->response->setStatusCode(200)->setJSON($result);

        } catch (\Throwable $e) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/bottom-lines?project_id=&page=&per_page=&status=
    // ═══════════════════════════════════════════════════════════════════════

    public function history(): ResponseInterface
    {
        if (!$this->canView()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์ดูประวัติ import']);
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

        $filters = [
            'status'    => $this->request->getGet('status'),
            'date_from' => $this->request->getGet('date_from'),
            'date_to'   => $this->request->getGet('date_to'),
            'page'      => $this->request->getGet('page'),
            'per_page'  => $this->request->getGet('per_page'),
        ];

        $result = $this->service->getHistory($projectId, $filters);
        return $this->response->setStatusCode(200)->setJSON($result);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/bottom-lines/:import_key
    // ═══════════════════════════════════════════════════════════════════════

    public function show(string $importKey): ResponseInterface
    {
        if (!$this->canView()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์ดูรายละเอียด import']);
        }

        $record = $this->service->getImportDetail($importKey);
        if (!$record) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบประวัติ import นี้']);
        }

        if (!$this->canAccessProject((int) $record['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $record]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/bottom-lines/:import_key/rollback
    // ═══════════════════════════════════════════════════════════════════════

    public function rollback(string $importKey): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถ Rollback ได้']);
        }

        $record = $this->service->getImportDetail($importKey);
        if (!$record) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบประวัติ import นี้']);
        }
        if (!$this->canAccessProject((int) $record['project_id'])) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $result = $this->service->rollback($importKey);
            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/bottom-lines/sample
    // ═══════════════════════════════════════════════════════════════════════

    public function downloadSample(): ResponseInterface
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('ราคาต้นทุน');

        $headers = ['A1' => 'unit_code', 'B1' => 'bottom_line_price', 'C1' => 'appraisal_price'];
        foreach ($headers as $cell => $val) {
            $sheet->setCellValue($cell, $val);
            $sheet->getStyle($cell)->getFont()->setBold(true);
            $sheet->getStyle($cell)->getFill()
                ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
                ->getStartColor()->setRGB('E2E8F0');
        }

        $samples = [
            ['A-101', 2500000, 2800000], ['A-102', 2600000, 2900000],
            ['B-201', 3200000, 3500000], ['B-202', 3300000, 3600000],
            ['C-301', 4100000, 4500000],
        ];
        $row = 2;
        foreach ($samples as $data) {
            $sheet->setCellValue('A' . $row, $data[0]);
            $sheet->setCellValue('B' . $row, $data[1]);
            $sheet->setCellValue('C' . $row, $data[2]);
            $sheet->getStyle('B' . $row)->getNumberFormat()->setFormatCode('#,##0');
            $sheet->getStyle('C' . $row)->getNumberFormat()->setFormatCode('#,##0');
            $row++;
        }
        $sheet->getColumnDimension('A')->setWidth(15);
        $sheet->getColumnDimension('B')->setWidth(20);
        $sheet->getColumnDimension('C')->setWidth(20);

        $info = $spreadsheet->createSheet();
        $info->setTitle('คำอธิบาย');
        $info->setCellValue('A1', 'คอลัมน์');
        $info->setCellValue('B1', 'คำอธิบาย');
        $info->setCellValue('C1', 'ตัวอย่าง');
        $info->getStyle('A1:C1')->getFont()->setBold(true);
        $info->setCellValue('A2', 'unit_code');
        $info->setCellValue('B2', 'รหัสยูนิต — ต้องตรงกับรหัสในระบบ');
        $info->setCellValue('C2', 'A-101');
        $info->setCellValue('A3', 'bottom_line_price');
        $info->setCellValue('B3', 'ราคาต้นทุน (บาท) — จะอัปเดตเป็น unit_cost');
        $info->setCellValue('C3', '2500000');
        $info->setCellValue('A4', 'appraisal_price');
        $info->setCellValue('B4', 'ราคาประเมินจากกรมที่ดิน (บาท)');
        $info->setCellValue('C4', '2800000');
        $info->setCellValue('A6', 'หมายเหตุ:');
        $info->setCellValue('A7', '- unit_code ต้องตรงกับรหัสยูนิตในโครงการ (case-insensitive)');
        $info->setCellValue('A8', '- ยูนิตที่ match ไม่ได้จะถูกข้ามไป ไม่มีผลกับข้อมูลในระบบ');
        $info->setCellValue('A9', '- ระบบจะ backup ข้อมูลเดิมอัตโนมัติก่อน import');
        $info->getColumnDimension('A')->setWidth(22);
        $info->getColumnDimension('B')->setWidth(45);
        $info->getColumnDimension('C')->setWidth(15);
        $spreadsheet->setActiveSheetIndex(0);

        $tmpFile = tempnam(sys_get_temp_dir(), 'bl_sample_') . '.xlsx';
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet))->save($tmpFile);
        $content = file_get_contents($tmpFile);
        @unlink($tmpFile);

        return $this->response
            ->setStatusCode(200)
            ->setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->setHeader('Content-Disposition', 'attachment; filename="bottom_line_sample.xlsx"')
            ->setHeader('Content-Length', (string) strlen($content))
            ->setBody($content);
    }
}
