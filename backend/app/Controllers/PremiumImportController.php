<?php

namespace App\Controllers;

use App\Services\PremiumImportService;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * PremiumImportController — HTTP layer สำหรับ import ไฟล์ Premium.xlsx ลง staging
 *
 * Business logic อยู่ใน PremiumImportService
 * Controller จัดการเฉพาะ: HTTP request/response, validation, สิทธิ์
 *
 * Flow: upload (preview ทุกชีต) → import (เขียน staging) → [validate/sync = ขั้นถัดไป]
 */
class PremiumImportController extends BaseController
{
    private PremiumImportService $service;

    public function __construct()
    {
        $this->service = new PremiumImportService();
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

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    /** โครงการที่ผู้ใช้เข้าถึงได้ — null = เข้าถึงทุกโครงการ (admin) */
    private function allowedProjectIds(): ?array
    {
        if ($this->isAdmin()) {
            return null;
        }
        return array_map('intval', (array) ($this->request->project_ids ?? []));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/premium-imports/upload — อัปโหลด + preview ทุกชีต
    // ═══════════════════════════════════════════════════════════════════════

    public function upload(): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์ import ข้อมูลของแถม']);
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
        $newName      = uniqid('premium_') . '.' . $ext;
        $uploadPath   = WRITEPATH . 'uploads/premium_imports';

        if (!$file->move($uploadPath, $newName)) {
            return $this->response->setStatusCode(500)
                ->setJSON(['error' => 'ไม่สามารถบันทึกไฟล์ได้ กรุณาลองใหม่']);
        }

        $filePath = $uploadPath . '/' . $newName;

        try {
            $result              = $this->service->parseFile($filePath, $originalName);
            $result['temp_file'] = $newName;

            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (\Throwable $e) {
            @unlink($filePath);
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไม่สามารถอ่านไฟล์ Excel ได้: ' . $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/premium-imports/import — เขียนชีตที่เลือกลง staging
    // ═══════════════════════════════════════════════════════════════════════

    public function import(): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์ import ข้อมูลของแถม']);
        }

        $body     = $this->request->getJSON(true) ?? [];
        $tempFile = $body['temp_file'] ?? $this->request->getPost('temp_file');

        if (!$tempFile || !preg_match('/^premium_[a-z0-9]+\.(xlsx|xls)$/i', (string) $tempFile)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'temp_file ไม่ถูกต้อง']);
        }

        $filePath = WRITEPATH . 'uploads/premium_imports/' . $tempFile;
        if (!is_file($filePath)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'ไม่พบไฟล์ที่อัปโหลด กรุณาอัปโหลดใหม่']);
        }

        $sheetNames = $body['sheet_names'] ?? null;
        if ($sheetNames !== null && !is_array($sheetNames)) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => 'sheet_names ต้องเป็น array']);
        }

        try {
            $result = $this->service->importToStaging(
                $filePath,
                (string) ($body['file_name'] ?? $tempFile),
                $this->userId(),
                $sheetNames ?: null,
                $this->allowedProjectIds()
            );

            @unlink($filePath);

            return $this->response->setStatusCode(200)->setJSON($result);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/premium-imports — ประวัติ batch การ import
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        $db      = \Config\Database::connect();
        $builder = $db->table('premium_import_batches b')
            ->select('b.id, b.project_id, p.code AS project_code, p.name AS project_name,
                      b.source_file_name, b.sheet_name, b.total_rows, b.matched_rows,
                      b.unmatched_rows, b.synced_rows, b.status, b.imported_at, b.synced_at')
            ->join('projects p', 'p.id = b.project_id', 'left')
            ->orderBy('b.id', 'DESC');

        $allowed = $this->allowedProjectIds();
        if ($allowed !== null) {
            $builder->whereIn('b.project_id', $allowed ?: [0]);
        }

        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId > 0) {
            $builder->where('b.project_id', $projectId);
        }

        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $builder->get()->getResultArray()]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/premium-imports/(:num)/validate — จับคู่ staging กับ DB จริง
    // ═══════════════════════════════════════════════════════════════════════

    public function validateImport(int $id): ResponseInterface
    {
        return $this->runBatchAction($id, fn () => $this->service->validateBatch($id));
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/premium-imports/(:num)/sync — เขียนลง project_units / promotion
    // ═══════════════════════════════════════════════════════════════════════

    public function sync(int $id): ResponseInterface
    {
        $body      = $this->request->getJSON(true) ?? [];
        $overrides = is_array($body['name_overrides'] ?? null) ? $body['name_overrides'] : [];
        return $this->runBatchAction($id, fn () => $this->service->syncBatch($id, $overrides));
    }

    /** ตรวจสิทธิ์ + เรียก action ของ batch พร้อมจัดการ error เป็นภาษาไทย */
    private function runBatchAction(int $id, callable $action): ResponseInterface
    {
        if (!$this->canImport()) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'คุณไม่มีสิทธิ์ดำเนินการกับข้อมูลของแถม']);
        }

        $db    = \Config\Database::connect();
        $batch = $db->table('premium_import_batches')->where('id', $id)->get()->getRowArray();
        if (!$batch) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบรายการ import นี้']);
        }

        $allowed = $this->allowedProjectIds();
        if ($allowed !== null && !in_array((int) $batch['project_id'], $allowed, true)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            return $this->response->setStatusCode(200)->setJSON($action());
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)
                ->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/premium-imports/(:num) — รายละเอียด batch (units + values)
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        $db    = \Config\Database::connect();
        $batch = $db->table('premium_import_batches')->where('id', $id)->get()->getRowArray();

        if (!$batch) {
            return $this->response->setStatusCode(404)
                ->setJSON(['error' => 'ไม่พบรายการ import นี้']);
        }

        $allowed = $this->allowedProjectIds();
        if ($allowed !== null && !in_array((int) $batch['project_id'], $allowed, true)) {
            return $this->response->setStatusCode(403)
                ->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $units = $db->table('premium_import_units')
            ->where('batch_id', $id)
            ->orderBy('seq', 'ASC')
            ->get()
            ->getResultArray();

        $values = [];
        if (!empty($units)) {
            $valueRows = $db->table('premium_import_values')
                ->whereIn('import_unit_id', array_column($units, 'id'))
                ->orderBy('column_index', 'ASC')
                ->get()
                ->getResultArray();
            foreach ($valueRows as $v) {
                $values[$v['import_unit_id']][] = $v;
            }
        }
        foreach ($units as &$unit) {
            $unit['premiums'] = $values[$unit['id']] ?? [];
        }
        unset($unit);

        $batch['units'] = $units;

        return $this->response->setStatusCode(200)->setJSON($batch);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/premium-imports/sample — ดาวน์โหลดไฟล์ Excel ตัวอย่าง
    // ═══════════════════════════════════════════════════════════════════════

    public function downloadSample(): ResponseInterface
    {
        $spreadsheet = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
        $sheet       = $spreadsheet->getActiveSheet();
        $sheet->setTitle('โครงการตัวอย่าง');

        // เน้นหัวตาราง: ตัวหนา + พื้นเทาอ่อน
        $emphasize = static function (string $cell) use ($sheet): void {
            $sheet->getStyle($cell)->getFont()->setBold(true);
            $sheet->getStyle($cell)->getFill()
                ->setFillType(\PhpOffice\PhpSpreadsheet\Style\Fill::FILL_SOLID)
                ->getStartColor()->setRGB('E2E8F0');
        };

        // แถวบนสุด: ช่อง "โครงการ" + รหัสโครงการ (ช่องถัดไป) — แก้เป็นรหัสจริงก่อนนำเข้า
        $sheet->setCellValue('A1', 'โครงการ');
        $sheet->setCellValue('B1', 'P001');
        $emphasize('A1');

        // หัวตารางชั้นบน (แถว 3)
        foreach (['A3' => 'ลำดับ', 'B3' => 'เลขแปลง', 'C3' => 'เนื้อที่ดิน',
                  'D3' => 'แบบบ้าน', 'E3' => 'ราคา', 'F3' => 'Premium'] as $cell => $val) {
            $sheet->setCellValue($cell, $val);
            $emphasize($cell);
        }

        // หัวตารางชั้นล่าง (แถว 4): "Bottom Line" ใต้คอลัมน์ราคา + ชื่อของแถมแต่ละรายการ
        // ชื่อของแถมถูกจัดหมวดอัตโนมัติ: มีคำว่า "ลด" → discount, "ฟรี/คชจ/ค่าใช้จ่าย" → expense_support, อื่นๆ → premium
        foreach (['E4' => 'Bottom Line', 'F4' => 'แอร์ปรับอากาศ',
                  'G4' => 'ส่วนลดเงินสด', 'H4' => 'ฟรีค่าส่วนกลาง 1 ปี'] as $cell => $val) {
            $sheet->setCellValue($cell, $val);
            $emphasize($cell);
        }

        // ข้อมูลตัวอย่าง: ลำดับ, เลขแปลง, เนื้อที่ดิน, แบบบ้าน, ราคา, แอร์, ส่วนลด, ฟรีค่าส่วนกลาง
        $samples = [
            [1, 'A-101', 50.5, 'TYPE-A', 2500000, 40000, 0,      12000],
            [2, 'A-102', 52.0, 'TYPE-A', 2600000, 40000, 50000,  12000],
            [3, 'B-201', 60.0, 'TYPE-B', 3200000, 45000, 0,      12000],
            [4, 'B-202', 61.5, 'TYPE-B', 3300000, 45000, 100000, 12000],
        ];
        $row = 5;
        foreach ($samples as $d) {
            foreach (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as $i => $col) {
                $sheet->setCellValue($col . $row, $d[$i]);
            }
            foreach (['C', 'E', 'F', 'G', 'H'] as $col) {
                $sheet->getStyle($col . $row)->getNumberFormat()->setFormatCode('#,##0');
            }
            $row++;
        }

        foreach (['A' => 8, 'B' => 12, 'C' => 12, 'D' => 14,
                  'E' => 14, 'F' => 16, 'G' => 16, 'H' => 20] as $col => $width) {
            $sheet->getColumnDimension($col)->setWidth($width);
        }

        // คำอธิบายการใช้งาน — วางใต้ตารางข้อมูลในชีตเดียวกัน
        // หมายเหตุ: ห้ามแยกเป็นชีตใหม่ เพราะระบบถือว่า 1 ชีต = 1 โครงการ และจะอ่านหัวตาราง
        //          ทุกชีต — ชีตที่ไม่มีหัวตาราง ("ลำดับ") จะทำให้ import ล้มเหลว
        //          แถวคำอธิบายไม่มี "เลขแปลง" จึงถูกข้ามอัตโนมัติตอนนำเข้า
        $notes = [
            'คำอธิบาย (แถวด้านล่างนี้จะถูกข้ามตอนนำเข้า เพราะไม่มีเลขแปลง):',
            '- ช่อง "โครงการ" (B1): แก้ P001 เป็นรหัสโครงการจริงในระบบก่อนนำเข้า',
            '- คอลัมน์ของแถม = คอลัมน์ขวาของ "ราคา" — ตั้งชื่อที่แถวหัวตารางชั้นล่าง',
            '- หมวดจัดอัตโนมัติจากชื่อ: มี "ลด" = ส่วนลด, "ฟรี/คชจ/ค่าใช้จ่าย" = สนับสนุนค่าใช้จ่าย, นอกนั้น = ของแถม',
            '- "เลขแปลง" ต้องตรงกับยูนิตในระบบ — แถวที่เลขแปลงว่างจะถูกข้าม',
            '- จำนวนเงินของแถมใส่เป็นตัวเลข, 0 = แปลงนั้นไม่มีของแถมรายการนั้น',
            '- นำเข้าหลายโครงการได้โดยเพิ่มชีต (1 ชีต = 1 โครงการ) — ทุกชีตต้องมีหัวตารางแบบนี้',
        ];
        $noteRow = $row + 1; // เว้น 1 แถวใต้ข้อมูล
        foreach ($notes as $line) {
            $sheet->setCellValue('A' . $noteRow, $line);
            $noteRow++;
        }
        $sheet->getStyle('A' . ($row + 1))->getFont()->setBold(true)->setItalic(true);
        $sheet->getStyle('A' . ($row + 2) . ':A' . ($noteRow - 1))->getFont()->setItalic(true);

        $tmpFile = tempnam(sys_get_temp_dir(), 'premium_sample_') . '.xlsx';
        (new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet))->save($tmpFile);
        $content = file_get_contents($tmpFile);
        @unlink($tmpFile);

        return $this->response
            ->setStatusCode(200)
            ->setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            ->setHeader('Content-Disposition', 'attachment; filename="premium_import_sample.xlsx"')
            ->setHeader('Content-Length', (string) strlen($content))
            ->setBody($content);
    }
}
